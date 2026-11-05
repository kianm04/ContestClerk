import { describe, expect, it } from 'vitest';
import {
	createServiceRoleClient,
	createSignedInClient,
	type SignedInClient
} from './supabase-test-client';
import {
	addCommittee,
	addRole,
	addSeat,
	createCommitteeRoom,
	giveRole,
	type CommitteeRoomFixture
} from './conference-fixtures';

// Step 8 of docs/roles-and-permissions.md, from migration
// 20261007180000_committee_permissions: the committee tables each ask their own
// permission. `manage_committees` edits committees and their seats, and held
// per committee only the description, agenda and guide. `run_room` runs the
// room, `review_papers` reviews papers, `write_chair_notes` keeps notes,
// `propose_awards` proposes and `confirm_awards` confirms and publishes.
//
// Every test makes its own conference, so nothing one test writes is seen by another.

/** A committee room with a second committee nobody here is assigned. */
type Room = CommitteeRoomFixture & { otherCommitteeId: string };

async function createRoom(): Promise<Room> {
	const room = await createCommitteeRoom();
	const otherCommitteeId = await addCommittee(room.supabase, room.conferenceId, 'WHO');

	return { ...room, otherCommitteeId };
}

/**
 * A new team member with one role. Somebody whose role applies per committee
 * is assigned the room's committee, which `committee_chairs` records.
 */
async function teamMemberWith(
	room: Room,
	permissions: string[],
	scope: 'conference' | 'committees' = 'conference'
): Promise<SignedInClient> {
	const person = await createSignedInClient('Team Member');
	const roleId = await addRole(room.supabase, room.conferenceId, {
		name: `Role ${crypto.randomUUID().slice(0, 8)}`,
		scope,
		permissions
	});

	await giveRole(room.supabase, room.conferenceId, person.userId, roleId);

	if (scope === 'committees') {
		const { error } = await room.supabase
			.from('committee_chairs')
			.insert({ committee_id: room.committeeId, user_id: person.userId });

		if (error) {
			throw new Error(`Could not assign the fixture person a committee: ${error.message}`);
		}
	}

	return person;
}

/** The delegate's position paper, written past every policy. */
async function addPositionPaper(room: Room): Promise<string> {
	const { data, error } = await createServiceRoleClient()
		.from('documents')
		.insert({
			conference_id: room.conferenceId,
			committee_id: room.committeeId,
			seat_id: room.seatId,
			uploaded_by: room.delegate.userId,
			kind: 'position_paper',
			title: 'Position paper',
			storage_path: `${room.conferenceId}/position-papers/${room.seatId}-${crypto.randomUUID()}.pdf`,
			file_name: 'position-paper.pdf',
			file_size_bytes: 120_000,
			mime_type: 'application/pdf',
			review_status: 'submitted'
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not add the fixture paper: ${error?.message}`);
	}

	return data.id;
}

/** A small PDF, which is all the documents bucket takes. */
function pdf(): Blob {
	return new Blob(['%PDF-1.4\n%%EOF\n'], { type: 'application/pdf' });
}

describe('manage_committees', () => {
	it('lets a holder per committee change its agenda, and nothing else (protect_committees_columns)', async () => {
		const room = await createRoom();
		const editor = await teamMemberWith(room, ['manage_committees'], 'committees');

		const { data: agenda } = await editor.supabase
			.from('committees')
			.update({ description: 'The council of fifteen.', topics: ['Cyber warfare'] })
			.eq('id', room.committeeId)
			.select('topics');
		const renamed = await editor.supabase
			.from('committees')
			.update({ name: 'Renamed' })
			.eq('id', room.committeeId);
		const { data: other } = await editor.supabase
			.from('committees')
			.update({ description: 'Not mine.' })
			.eq('id', room.otherCommitteeId)
			.select('id');

		expect(agenda).toEqual([{ topics: ['Cyber warfare'] }]);
		expect(renamed.error?.message).toContain(
			'more than its description, agenda and resolution settings'
		);
		expect(other).toEqual([]);
	});

	it('lets a conference-wide holder add a committee and offer a seat, and nobody per committee', async () => {
		const room = await createRoom();
		const academics = await teamMemberWith(room, ['manage_committees']);
		const chair = await teamMemberWith(room, ['manage_committees'], 'committees');
		const freeSeatId = await addSeat(room.supabase, room.committeeId, 'Germany', 'DE');

		const added = await academics.supabase
			.from('committees')
			.insert({ conference_id: room.conferenceId, name: 'GA', slug: `ga-${crypto.randomUUID()}` });
		const byChair = await chair.supabase.rpc('set_seat_availability', {
			seat_id: freeSeatId,
			is_available: false
		});
		const byAcademics = await academics.supabase.rpc('set_seat_availability', {
			seat_id: freeSeatId,
			is_available: false
		});

		expect(added.error).toBeNull();
		expect(byChair.error?.message).toContain('hide or offer a seat');
		expect(byAcademics.error).toBeNull();
	});

	it('lets a holder per committee put up their own committee’s guide only (may_upload_conference_document)', async () => {
		const room = await createRoom();
		const chair = await teamMemberWith(room, ['manage_committees'], 'committees');
		const ownPath = `${room.conferenceId}/background-guides/${room.committeeId}-${crypto.randomUUID()}.pdf`;
		const otherPath = `${room.conferenceId}/background-guides/${room.otherCommitteeId}-${crypto.randomUUID()}.pdf`;

		const own = await chair.supabase.storage.from('documents').upload(ownPath, pdf());
		const other = await chair.supabase.storage.from('documents').upload(otherPath, pdf());

		expect(own.error).toBeNull();
		expect(other.error).not.toBeNull();
	});

	it('lets the guide’s committee editor remove it, and a room runner not (may_change_conference_document)', async () => {
		const room = await createRoom();
		const chair = await teamMemberWith(room, ['manage_committees'], 'committees');
		const clock = await teamMemberWith(room, ['run_room'], 'committees');
		const path = `${room.conferenceId}/background-guides/${room.committeeId}-${crypto.randomUUID()}.pdf`;

		await chair.supabase.storage.from('documents').upload(path, pdf());

		const { data: refused } = await clock.supabase.storage.from('documents').remove([path]);
		const { data: removed } = await chair.supabase.storage.from('documents').remove([path]);

		expect(refused).toEqual([]);
		expect(removed?.map((file) => file.name)).toEqual([path]);
	});
});

describe('run_room', () => {
	it('lets a co-chair who only runs the clock start a session, and refuses a note keeper', async () => {
		const room = await createRoom();
		const clock = await teamMemberWith(room, ['run_room'], 'committees');
		const notes = await teamMemberWith(room, ['write_chair_notes'], 'committees');

		const refused = await notes.supabase.rpc('start_committee_session', {
			committee_id: room.committeeId,
			name: 'Session 1'
		});
		const started = await clock.supabase.rpc('start_committee_session', {
			committee_id: room.committeeId,
			name: 'Session 1'
		});

		expect(refused.error?.message).toContain('Only a chair of this committee can start a session');
		expect(started.error).toBeNull();
	});

	it('keeps start_single_speaker, call_next_speaker and apply_passed_motion to the room’s runners', async () => {
		const room = await createRoom();
		const notes = await teamMemberWith(room, ['write_chair_notes'], 'committees');
		const { data: sessionId } = await room.chair.supabase.rpc('start_committee_session', {
			committee_id: room.committeeId,
			name: 'Session 1'
		});
		const { data: motion } = await room.chair.supabase
			.from('motions')
			.insert({
				committee_id: room.committeeId,
				session_id: sessionId,
				kind: 'unmoderated_caucus',
				total_time_seconds: 300
			})
			.select('id')
			.single();

		const single = await notes.supabase.rpc('start_single_speaker', {
			committee_id: room.committeeId,
			seat_id: room.seatId,
			speaking_time_seconds: 60
		});
		const next = await notes.supabase.rpc('call_next_speaker', {
			committee_id: room.committeeId
		});
		const passed = await notes.supabase.rpc('apply_passed_motion', { motion_id: motion?.id ?? '' });

		expect(single.error?.message).toContain('Only a chair of this committee can give the floor');
		expect(next.error?.message).toContain(
			'Only a chair of this committee can call the next speaker'
		);
		expect(passed.error?.message).toContain('Only a chair of this committee can pass a motion');
	});

	it('lets a room runner ask who sits in their committee (conference_audience_user_ids)', async () => {
		const room = await createRoom();
		const clock = await teamMemberWith(room, ['run_room'], 'committees');

		const { data, error } = await clock.supabase.rpc('conference_audience_user_ids', {
			conference_id: room.conferenceId,
			audience: 'committee',
			committee_id: room.committeeId,
			delegation_id: null
		});

		expect(error).toBeNull();
		expect(data).toContain(room.delegate.userId);
	});
});

describe('review_papers', () => {
	it('lets a reviewer read and approve a paper, and keeps the review from a committee editor (protect_documents_columns)', async () => {
		const room = await createRoom();
		const reviewer = await teamMemberWith(room, ['review_papers'], 'committees');
		const editor = await teamMemberWith(room, ['manage_committees'], 'committees');
		const paperId = await addPositionPaper(room);

		const { data: approved } = await reviewer.supabase
			.from('documents')
			.update({
				review_status: 'approved',
				reviewed_by: reviewer.userId,
				reviewed_at: new Date().toISOString()
			})
			.eq('id', paperId)
			.select('review_status');
		const { data: unseen } = await editor.supabase.from('documents').select('id').eq('id', paperId);

		expect(approved).toEqual([{ review_status: 'approved' }]);
		expect(unseen).toEqual([]);
	});

	it('refuses a run_room co-chair the papers', async () => {
		const room = await createRoom();
		const clock = await teamMemberWith(room, ['run_room'], 'committees');
		const paperId = await addPositionPaper(room);

		const { data } = await clock.supabase.from('documents').select('id').eq('id', paperId);

		expect(data).toEqual([]);
	});
});

describe('write_chair_notes', () => {
	it('lets a note keeper write a note, and shows a co-chair who only runs the clock none', async () => {
		const room = await createRoom();
		const notes = await teamMemberWith(room, ['write_chair_notes'], 'committees');
		const clock = await teamMemberWith(room, ['run_room'], 'committees');

		const written = await notes.supabase
			.from('chair_notes')
			.insert({ committee_id: room.committeeId, seat_id: room.seatId, body: 'Strong opening.' });
		const refused = await clock.supabase
			.from('chair_notes')
			.insert({ committee_id: room.committeeId, seat_id: room.seatId, body: 'Late.' });
		const { data: seen } = await clock.supabase
			.from('chair_notes')
			.select('id')
			.eq('committee_id', room.committeeId);

		expect(written.error).toBeNull();
		expect(refused.error).not.toBeNull();
		expect(seen).toEqual([]);
	});
});

describe('propose_awards and confirm_awards', () => {
	/** A proposal for the delegate's seat, through `client`. */
	function propose(client: SignedInClient, room: Room) {
		return client.supabase
			.from('awards')
			.insert({
				committee_id: room.committeeId,
				seat_id: room.seatId,
				kind: 'best_delegate',
				title: 'Best Delegate'
			})
			.select('id')
			.single();
	}

	it('lets a proposer propose and not confirm, and a confirmer confirm (protect_awards_columns)', async () => {
		const room = await createRoom();
		const proposer = await teamMemberWith(room, ['propose_awards'], 'committees');
		const academics = await teamMemberWith(room, ['confirm_awards']);
		const { data: award, error } = await propose(proposer, room);

		const byProposer = await proposer.supabase
			.from('awards')
			.update({ status: 'confirmed' })
			.eq('id', award?.id ?? '');
		const { data: byConfirmer } = await academics.supabase
			.from('awards')
			.update({ status: 'confirmed' })
			.eq('id', award?.id ?? '')
			.select('status');

		expect(error).toBeNull();
		expect(byProposer.error).not.toBeNull();
		expect(byConfirmer).toEqual([{ status: 'confirmed' }]);
	});

	it('answers confirmable_committee_ids with every committee for a confirmer, none for a proposer', async () => {
		const room = await createRoom();
		const proposer = await teamMemberWith(room, ['propose_awards'], 'committees');
		const academics = await teamMemberWith(room, ['confirm_awards']);

		const { data: forConfirmer } = await academics.supabase.rpc('confirmable_committee_ids');
		const { data: forProposer } = await proposer.supabase.rpc('confirmable_committee_ids');

		expect(forConfirmer).toEqual(expect.arrayContaining([room.committeeId, room.otherCommitteeId]));
		expect(forProposer).toEqual([]);
	});

	it('refuses a run_room co-chair the awards', async () => {
		const room = await createRoom();
		const clock = await teamMemberWith(room, ['run_room'], 'committees');
		const { error } = await propose(clock, room);

		expect(error).not.toBeNull();
	});

	it('publishes through set_awards_published_at for a confirmer only (protect_conferences_columns)', async () => {
		const room = await createRoom();
		const academics = await teamMemberWith(room, ['confirm_awards']);
		const editor = await teamMemberWith(room, ['edit_conference']);
		const publishedAt = new Date().toISOString();

		const direct = await editor.supabase
			.from('conferences')
			.update({ awards_published_at: publishedAt })
			.eq('id', room.conferenceId);
		const byEditor = await editor.supabase.rpc('set_awards_published_at', {
			conference_id: room.conferenceId,
			published_at: publishedAt
		});
		const byConfirmer = await academics.supabase.rpc('set_awards_published_at', {
			conference_id: room.conferenceId,
			published_at: publishedAt
		});

		expect(direct.error?.message).toContain('Only the people who confirm awards');
		expect(byEditor.error?.message).toContain('Only the people who confirm awards');
		expect(byConfirmer.error).toBeNull();
	});
});

// Rule 3 of docs/roles-and-permissions.md, which finding I25 of the security
// review of 10 October 2026 found disagreeing with this code: `administrator`
// on a per-committee role stands for every per-committee permission in the
// holder's committees, and for nothing beyond them.
describe('administrator on a per-committee role', () => {
	it('holds every per-committee permission in its committee, none in another, and nothing conference-wide', async () => {
		const room = await createRoom();
		const committeeAdministrator = await teamMemberWith(room, ['administrator'], 'committees');
		const { supabase } = committeeAdministrator;

		async function holdsInCommittee(committeeId: string, permission: string) {
			const { data, error } = await supabase.rpc('has_committee_permission', {
				committee_id: committeeId,
				permission: permission as never
			});
			expect(error).toBeNull();
			return data;
		}

		async function holdsConferenceWide(permission: string) {
			const { data, error } = await supabase.rpc('has_permission', {
				conference_id: room.conferenceId,
				permission: permission as never
			});
			expect(error).toBeNull();
			return data;
		}

		for (const permission of ['run_room', 'review_papers', 'write_chair_notes']) {
			expect(await holdsInCommittee(room.committeeId, permission)).toBe(true);
			expect(await holdsInCommittee(room.otherCommitteeId, permission)).toBe(false);
		}

		expect(await holdsConferenceWide('administrator')).toBe(false);
		expect(await holdsConferenceWide('edit_conference')).toBe(false);
	});
});

// Migration 20261007181000_retire_old_helpers drops the two helpers every
// policy asked before roles: each area now asks its own permission instead.
describe('the retired helpers', () => {
	it('no longer has can_manage_conference or is_committee_chair', async () => {
		const room = await createRoom();

		const manage = await room.supabase.rpc(
			'can_manage_conference' as never,
			{
				conference_id: room.conferenceId
			} as never
		);
		const chair = await room.chair.supabase.rpc(
			'is_committee_chair' as never,
			{
				committee_id: room.committeeId
			} as never
		);

		expect(manage.error?.message).toContain('can_manage_conference');
		expect(chair.error?.message).toContain('is_committee_chair');
	});
});
