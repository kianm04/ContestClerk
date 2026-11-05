import { describe, expect, it } from 'vitest';
import {
	createServiceRoleClient,
	createSignedInClient,
	type SignedInClient
} from './supabase-test-client';
import {
	addCommittee,
	addRole,
	createOpenConferenceOwnedByMe,
	giveRole,
	type ConferenceFixture
} from './conference-fixtures';

// Step 7 of docs/roles-and-permissions.md, from migration
// 20261007170000_programme_permissions: `edit_schedule` writes the programme,
// `send_announcements` publishes announcements, both conference-wide or in
// the holder's own committees, and `manage_documents` shares the conference's
// files. `set_schedule_publicity` lets only a conference-wide programme editor
// choose whether the programme is public.
//
// Every test makes its own conference, so nothing one test writes is seen by another.

/** A conference with two committees: the one the per-committee roles are assigned to, and another. */
type ProgrammeConference = ConferenceFixture & { ownCommitteeId: string; otherCommitteeId: string };

async function createProgrammeConference(): Promise<ProgrammeConference> {
	const fixture = await createOpenConferenceOwnedByMe();
	const ownCommitteeId = await addCommittee(fixture.supabase, fixture.conferenceId);
	const otherCommitteeId = await addCommittee(fixture.supabase, fixture.conferenceId);

	return { ...fixture, ownCommitteeId, otherCommitteeId };
}

/**
 * A new team member with one role. Somebody whose role applies per committee
 * is assigned the conference's own committee, which `committee_chairs` records.
 */
async function teamMemberWith(
	conference: ProgrammeConference,
	permissions: string[],
	scope: 'conference' | 'committees' = 'conference'
): Promise<SignedInClient> {
	const person = await createSignedInClient('Team Member');
	const roleId = await addRole(conference.supabase, conference.conferenceId, {
		name: `Role ${crypto.randomUUID().slice(0, 8)}`,
		scope,
		permissions
	});

	await giveRole(conference.supabase, conference.conferenceId, person.userId, roleId);

	if (scope === 'committees') {
		const { error } = await conference.supabase
			.from('committee_chairs')
			.insert({ committee_id: conference.ownCommitteeId, user_id: person.userId });

		if (error) {
			throw new Error(`Could not assign the fixture person a committee: ${error.message}`);
		}
	}

	return person;
}

/** One event as the programme editor's client sends it. */
function eventRow(conferenceId: string, committeeId: string | null = null) {
	return {
		conference_id: conferenceId,
		title: committeeId ? 'Session 1' : 'Opening ceremony',
		audience: committeeId ? 'committee' : 'everyone',
		committee_id: committeeId,
		starts_at: '2020-03-01T09:00:00Z',
		ends_at: '2020-03-01T10:00:00Z'
	};
}

/** One announcement as its author's client sends it. */
function announcementRow(conferenceId: string, authorId: string, committeeId: string | null) {
	return {
		conference_id: conferenceId,
		author_id: authorId,
		title: 'Room change',
		body: 'Session I moves to room 2.',
		audience: committeeId ? 'committee' : 'everyone',
		committee_id: committeeId
	};
}

/** Whether the programme is public, read past every policy. */
async function isProgrammePublic(conferenceId: string): Promise<boolean | undefined> {
	const { data } = await createServiceRoleClient()
		.from('conferences')
		.select('show_schedule_publicly')
		.eq('id', conferenceId)
		.single();

	return data?.show_schedule_publicly;
}

describe('edit_schedule', () => {
	it('lets a conference-wide holder add an event for everyone and change it', async () => {
		const conference = await createProgrammeConference();
		const logistics = await teamMemberWith(conference, ['edit_schedule']);

		const { data, error } = await logistics.supabase
			.from('schedule_events')
			.insert(eventRow(conference.conferenceId))
			.select('id')
			.single();

		expect(error).toBeNull();

		const { data: changed } = await logistics.supabase
			.from('schedule_events')
			.update({ title: 'Opening ceremony, moved' })
			.eq('id', data?.id ?? '')
			.select('title');

		expect(changed).toEqual([{ title: 'Opening ceremony, moved' }]);
	});

	it('lets a holder per committee write their committee’s events only', async () => {
		const conference = await createProgrammeConference();
		const chair = await teamMemberWith(conference, ['edit_schedule'], 'committees');

		const own = await chair.supabase
			.from('schedule_events')
			.insert(eventRow(conference.conferenceId, conference.ownCommitteeId));
		const other = await chair.supabase
			.from('schedule_events')
			.insert(eventRow(conference.conferenceId, conference.otherCommitteeId));
		const everyone = await chair.supabase
			.from('schedule_events')
			.insert(eventRow(conference.conferenceId));

		expect(own.error).toBeNull();
		expect(other.error).not.toBeNull();
		expect(everyone.error).not.toBeNull();
	});

	it('refuses the programme to somebody without it', async () => {
		const conference = await createProgrammeConference();
		const press = await teamMemberWith(conference, ['send_announcements']);

		const { error } = await press.supabase
			.from('schedule_events')
			.insert(eventRow(conference.conferenceId));

		expect(error).not.toBeNull();
	});
});

describe('set_schedule_publicity', () => {
	it('lets a conference-wide programme editor make the programme public', async () => {
		const conference = await createProgrammeConference();
		const logistics = await teamMemberWith(conference, ['edit_schedule']);

		const { error } = await logistics.supabase.rpc('set_schedule_publicity', {
			conference_id: conference.conferenceId,
			is_public: true
		});

		expect(error).toBeNull();
		expect(await isProgrammePublic(conference.conferenceId)).toBe(true);
	});

	it('refuses a programme editor of one committee', async () => {
		const conference = await createProgrammeConference();
		const chair = await teamMemberWith(conference, ['edit_schedule'], 'committees');
		const before = await isProgrammePublic(conference.conferenceId);

		const { error } = await chair.supabase.rpc('set_schedule_publicity', {
			conference_id: conference.conferenceId,
			is_public: !before
		});

		expect(error?.message).toContain('whole programme');
		expect(await isProgrammePublic(conference.conferenceId)).toBe(before);
	});
});

describe('send_announcements', () => {
	it('lets a conference-wide holder publish to everyone', async () => {
		const conference = await createProgrammeConference();
		const press = await teamMemberWith(conference, ['send_announcements']);

		const { error } = await press.supabase
			.from('announcements')
			.insert(announcementRow(conference.conferenceId, press.userId, null));

		expect(error).toBeNull();
	});

	it('lets a holder per committee publish to their committee only', async () => {
		const conference = await createProgrammeConference();
		const chair = await teamMemberWith(conference, ['send_announcements'], 'committees');

		const own = await chair.supabase
			.from('announcements')
			.insert(announcementRow(conference.conferenceId, chair.userId, conference.ownCommitteeId));
		const other = await chair.supabase
			.from('announcements')
			.insert(announcementRow(conference.conferenceId, chair.userId, conference.otherCommitteeId));
		const everyone = await chair.supabase
			.from('announcements')
			.insert(announcementRow(conference.conferenceId, chair.userId, null));

		expect(own.error).toBeNull();
		expect(other.error).not.toBeNull();
		expect(everyone.error).not.toBeNull();
	});

	it('does not let a chair delete what the secretariat sent to their committee', async () => {
		const conference = await createProgrammeConference();
		const chair = await teamMemberWith(conference, ['send_announcements'], 'committees');
		const { data: sent } = await conference.supabase
			.from('announcements')
			.insert(
				announcementRow(conference.conferenceId, conference.userId, conference.ownCommitteeId)
			)
			.select('id')
			.single();

		const { data: deleted } = await chair.supabase
			.from('announcements')
			.delete()
			.eq('id', sent?.id ?? '')
			.select('id');

		expect(deleted).toEqual([]);
	});

	it('answers conference_audience_user_ids for the audiences the holder may address', async () => {
		const conference = await createProgrammeConference();
		const chair = await teamMemberWith(conference, ['send_announcements'], 'committees');

		const own = await chair.supabase.rpc('conference_audience_user_ids', {
			conference_id: conference.conferenceId,
			audience: 'committee',
			committee_id: conference.ownCommitteeId,
			delegation_id: null
		});
		const everyone = await chair.supabase.rpc('conference_audience_user_ids', {
			conference_id: conference.conferenceId,
			audience: 'everyone',
			committee_id: null,
			delegation_id: null
		});

		expect(own.error).toBeNull();
		expect(everyone.error).not.toBeNull();
	});
});

describe('manage_documents', () => {
	/** A shared file's row, as the uploader's client sends it. */
	function resourceRow(conferenceId: string, uploadedBy: string) {
		return {
			conference_id: conferenceId,
			uploaded_by: uploadedBy,
			kind: 'resource',
			title: 'Venue map',
			storage_path: `${conferenceId}/resources/${crypto.randomUUID()}.pdf`,
			file_name: 'venue-map.pdf',
			file_size_bytes: 120_000,
			mime_type: 'application/pdf',
			audience: 'everyone'
		};
	}

	it('lets a holder share a file and remove it', async () => {
		const conference = await createProgrammeConference();
		const logistics = await teamMemberWith(conference, ['manage_documents']);

		const { data, error } = await logistics.supabase
			.from('documents')
			.insert(resourceRow(conference.conferenceId, logistics.userId))
			.select('id')
			.single();

		expect(error).toBeNull();

		const { data: deleted } = await logistics.supabase
			.from('documents')
			.delete()
			.eq('id', data?.id ?? '')
			.select('id');

		expect(deleted).toHaveLength(1);
	});

	it('lets a holder put the file itself in the conference’s resources folder', async () => {
		const conference = await createProgrammeConference();
		const logistics = await teamMemberWith(conference, ['manage_documents']);
		const path = `${conference.conferenceId}/resources/${crypto.randomUUID()}.pdf`;

		const { error } = await logistics.supabase.storage
			.from('documents')
			.upload(path, new Blob(['%PDF-1.4\n%%EOF\n'], { type: 'application/pdf' }));

		expect(error).toBeNull();
	});

	// The bucket's delete policy asks may_change_conference_document, which
	// answers for the resources folder from manage_documents.
	it('lets a holder remove a shared file from storage, and nobody without it', async () => {
		const conference = await createProgrammeConference();
		const logistics = await teamMemberWith(conference, ['manage_documents']);
		const press = await teamMemberWith(conference, ['send_announcements']);
		const path = `${conference.conferenceId}/resources/${crypto.randomUUID()}.pdf`;

		await logistics.supabase.storage
			.from('documents')
			.upload(path, new Blob(['%PDF-1.4\n%%EOF\n'], { type: 'application/pdf' }));

		const { data: refused } = await press.supabase.storage.from('documents').remove([path]);
		const { data: removed } = await logistics.supabase.storage.from('documents').remove([path]);

		expect(refused).toEqual([]);
		expect(removed?.map((file) => file.name)).toEqual([path]);
	});

	it('refuses a shared file from somebody without it', async () => {
		const conference = await createProgrammeConference();
		const press = await teamMemberWith(conference, ['send_announcements']);

		const { error } = await press.supabase
			.from('documents')
			.insert(resourceRow(conference.conferenceId, press.userId));

		expect(error).not.toBeNull();
	});
});
