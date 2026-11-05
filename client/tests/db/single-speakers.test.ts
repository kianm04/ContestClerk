import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSignedInClient } from './supabase-test-client';
import {
	addChair,
	addCommittee,
	addSeat,
	addStaff,
	createCommitteeRoom,
	type CommitteeRoomFixture
} from './conference-fixtures';

// Single speakers and speakers who hold no seat (S9, D5):
// specs/02-architecture/data-model.md ("Single speakers and speakers with no
// seat") and specs/02-architecture/permissions.md ("Speakers with no seat").
//
//   * `speakers_lists.kind` says what a list is for, and its checks keep a
//     caucus's list to its motion and a purpose to a single speaker's list;
//   * an entry is a seat or a typed name, exactly one of the two, and the
//     rewritten insert and update policies allow a typed name on a single
//     speaker's list only, for a chair of the list's committee only;
//   * a named entry is read by whoever may read the room, as any entry is;
//   * `start_single_speaker` gives the floor in one transaction.
//
// The other room functions are in `room-press-functions.test.ts`.

/** The moment "Give the floor" is pressed in these tests. */
const PRESSED_AT = '2030-01-01T10:00:00.000Z';

/** How long a fixture single speaker has. */
const SINGLE_SPEAKING_SECONDS = 60;

/** A stored `timestamptz` spelled the way JavaScript spells a moment. */
function momentOf(stored: string | null): string | null {
	return stored === null ? null : new Date(stored).toISOString();
}

/** A committee room with a session started, on its General Speakers' List. */
type RunningRoom = CommitteeRoomFixture & { sessionId: string; generalListId: string };

/** The room's `committee_state` row, read by its chair. */
async function readRoom(room: CommitteeRoomFixture) {
	const { data, error } = await room.chair.supabase
		.from('committee_state')
		.select('*')
		.eq('committee_id', room.committeeId)
		.single();

	if (error || !data) throw new Error(`Could not read the room: ${error?.message}`);

	return data;
}

/** One committee with a session started through `start_committee_session`. */
async function createRunningRoom(): Promise<RunningRoom> {
	const room = await createCommitteeRoom();
	const { data: sessionId, error } = await room.chair.supabase.rpc('start_committee_session', {
		committee_id: room.committeeId,
		name: 'Session 1',
		pressed_at: PRESSED_AT
	});

	if (error || !sessionId) throw new Error(`Could not start the session: ${error?.message}`);

	const state = await readRoom(room);

	return { ...room, sessionId, generalListId: state.active_speakers_list_id };
}

/** A list of `kind` in the room's session, through the chair's own client. */
async function addList(room: RunningRoom, kind: 'general' | 'caucus' | 'single'): Promise<string> {
	let motionId: string | null = null;

	if (kind === 'caucus') {
		const { data: motion } = await room.chair.supabase
			.from('motions')
			.insert({
				committee_id: room.committeeId,
				session_id: room.sessionId,
				kind: 'moderated_caucus',
				topic: 'Climate finance'
			})
			.select('id')
			.single();
		motionId = motion?.id ?? null;
	}

	const { data, error } = await room.chair.supabase
		.from('speakers_lists')
		.insert({
			committee_id: room.committeeId,
			session_id: room.sessionId,
			motion_id: motionId,
			kind,
			name: kind,
			speaking_time_seconds: SINGLE_SPEAKING_SECONDS
		})
		.select('id')
		.single();

	if (error || !data) throw new Error(`Could not open the list: ${error?.message}`);

	return data.id;
}

/** Put a typed name on a list as `client`, answering what the database said. */
function addNamedEntry(client: SupabaseClient, listId: string, name = 'Secretary-General') {
	return client
		.from('speakers_list_entries')
		.insert({ speakers_list_id: listId, speaker_name: name, position: 1 })
		.select('id, seat_id, speaker_name')
		.single();
}

/** "Give the floor", pressed by `client`, with `fields` beside the committee. */
function giveTheFloor(
	client: SupabaseClient,
	committeeId: string,
	fields: { seatId?: string; speakerName?: string; purpose?: string; seconds?: number } = {}
) {
	return client.rpc('start_single_speaker', {
		committee_id: committeeId,
		seat_id: fields.seatId ?? null,
		speaker_name: fields.speakerName ?? null,
		purpose: fields.purpose ?? null,
		speaking_time_seconds: fields.seconds ?? SINGLE_SPEAKING_SECONDS,
		pressed_at: PRESSED_AT
	});
}

// -----------------------------------------------------------------------------
// speakers_lists.kind and purpose
// -----------------------------------------------------------------------------

describe('speakers_lists, the kind of list and its purpose', () => {
	it('keeps a caucus’s list to its motion, and a motion to a caucus’s list', async () => {
		const room = await createRunningRoom();
		const caucusListId = await addList(room, 'caucus');
		const { data: caucusList } = await room.chair.supabase
			.from('speakers_lists')
			.select('motion_id')
			.eq('id', caucusListId)
			.single();

		const noMotion = await room.chair.supabase.from('speakers_lists').insert({
			committee_id: room.committeeId,
			session_id: room.sessionId,
			kind: 'caucus',
			name: 'A caucus with no motion',
			speaking_time_seconds: 60
		});
		expect(noMotion.error?.message).toContain('speakers_lists_caucus_has_motion');

		const generalWithMotion = await room.chair.supabase.from('speakers_lists').insert({
			committee_id: room.committeeId,
			session_id: room.sessionId,
			motion_id: caucusList?.motion_id,
			kind: 'general',
			name: 'A general list with a motion',
			speaking_time_seconds: 60
		});
		expect(generalWithMotion.error?.message).toContain('speakers_lists_caucus_has_motion');
	});

	it('asks every writer to say which list it opens', async () => {
		const room = await createRunningRoom();

		const { error } = await room.chair.supabase.from('speakers_lists').insert({
			committee_id: room.committeeId,
			session_id: room.sessionId,
			name: 'Which list is this?',
			speaking_time_seconds: 60
		});

		// 23502 is not_null_violation: the column has no default to fall back on.
		expect(error?.code).toBe('23502');
	});

	it('takes a purpose on a single speaker’s list only, of at most 200 characters', async () => {
		const room = await createRunningRoom();
		const singleListId = await addList(room, 'single');

		const onSingle = await room.chair.supabase
			.from('speakers_lists')
			.update({ purpose: 'Right of reply' })
			.eq('id', singleListId)
			.select('purpose');
		expect(onSingle.data).toEqual([{ purpose: 'Right of reply' }]);

		const onGeneral = await room.chair.supabase
			.from('speakers_lists')
			.update({ purpose: 'Right of reply' })
			.eq('id', room.generalListId);
		expect(onGeneral.error?.message).toContain('speakers_lists_purpose_only_on_single');

		const tooLong = await room.chair.supabase
			.from('speakers_lists')
			.update({ purpose: 'x'.repeat(201) })
			.eq('id', singleListId);
		expect(tooLong.error?.message).toContain('speakers_lists_purpose_length');
	});
});

// -----------------------------------------------------------------------------
// speakers_list_entries: a seat, or a typed name
// -----------------------------------------------------------------------------

describe('speakers_list_entries, a speaker who holds no seat', () => {
	it('lets a chair put a typed name on a single speaker’s list', async () => {
		const room = await createRunningRoom();
		const singleListId = await addList(room, 'single');

		const { data, error } = await addNamedEntry(room.chair.supabase, singleListId);

		expect(error).toBeNull();
		expect(data).toMatchObject({ seat_id: null, speaker_name: 'Secretary-General' });
	});

	it('refuses a typed name on a General Speakers’ List and on a caucus’s list', async () => {
		const room = await createRunningRoom();
		const caucusListId = await addList(room, 'caucus');

		for (const listId of [room.generalListId, caucusListId]) {
			const { error } = await addNamedEntry(room.chair.supabase, listId);
			expect(error?.message).toContain('row-level security');
		}
	});

	it('refuses a delegate, a volunteer and another committee’s chair adding a typed name', async () => {
		const room = await createRunningRoom();
		const singleListId = await addList(room, 'single');
		const volunteer = await createSignedInClient('Fixture Volunteer');
		await addStaff(room.supabase, room.conferenceId, volunteer.userId);
		const otherCommitteeId = await addCommittee(room.supabase, room.conferenceId, 'Other');
		const otherChair = await createSignedInClient('Other Chair');
		await addChair(room.supabase, otherCommitteeId, otherChair.userId);

		for (const outsider of [room.delegate, volunteer, otherChair]) {
			const { error } = await addNamedEntry(outsider.supabase, singleListId);
			expect(error?.message).toContain('row-level security');
		}
	});

	it('names exactly one of a seat and a typed name, and never a blank or overlong name', async () => {
		const room = await createRunningRoom();
		const singleListId = await addList(room, 'single');
		const entries: {
			speakers_list_id: string;
			seat_id: string | null;
			speaker_name: string | null;
		}[] = [
			// Both a seat and a name.
			{ speakers_list_id: singleListId, seat_id: room.seatId, speaker_name: 'France' },
			// Neither.
			{ speakers_list_id: singleListId, seat_id: null, speaker_name: null }
		];

		for (const entry of entries) {
			const { error } = await room.chair.supabase.from('speakers_list_entries').insert(entry);
			expect(error?.message).toContain('speakers_list_entries_seat_or_name');
		}

		for (const name of ['   ', 'x'.repeat(201)]) {
			const { error } = await addNamedEntry(room.chair.supabase, singleListId, name);
			expect(error?.message).toContain('speakers_list_entries_speaker_name_written');
		}
	});

	it('shows a named speaker to a delegate of the committee, and hides it from a stranger', async () => {
		const room = await createRunningRoom();
		const singleListId = await addList(room, 'single');
		const { data: entry } = await addNamedEntry(room.chair.supabase, singleListId);
		const stranger = await createSignedInClient('Stranger');

		const { data: seenByDelegate } = await room.delegate.supabase
			.from('speakers_list_entries')
			.select('speaker_name')
			.eq('id', entry?.id);
		const { data: seenByStranger } = await stranger.supabase
			.from('speakers_list_entries')
			.select('speaker_name')
			.eq('id', entry?.id);

		expect(seenByDelegate).toEqual([{ speaker_name: 'Secretary-General' }]);
		expect(seenByStranger).toEqual([]);
	});

	it('lets a chair move a named speaker’s turn on, and refuses a delegate', async () => {
		const room = await createRunningRoom();
		const singleListId = await addList(room, 'single');
		const { data: entry } = await addNamedEntry(room.chair.supabase, singleListId);

		const { data: byDelegate } = await room.delegate.supabase
			.from('speakers_list_entries')
			.update({ status: 'speaking' })
			.eq('id', entry?.id)
			.select('status');
		expect(byDelegate).toEqual([]);

		const { data: byChair } = await room.chair.supabase
			.from('speakers_list_entries')
			.update({ status: 'speaking', started_at: PRESSED_AT })
			.eq('id', entry?.id)
			.select('status');
		expect(byChair).toEqual([{ status: 'speaking' }]);
	});

	it('refuses a chair turning a seat on the General Speakers’ List into a typed name', async () => {
		const room = await createRunningRoom();
		const { data: entry } = await room.chair.supabase
			.from('speakers_list_entries')
			.insert({ speakers_list_id: room.generalListId, seat_id: room.seatId, position: 1 })
			.select('id')
			.single();

		const { error } = await room.chair.supabase
			.from('speakers_list_entries')
			.update({ seat_id: null, speaker_name: 'Secretary-General' })
			.eq('id', entry?.id);

		expect(error?.message).toContain('row-level security');
	});

	it('still refuses a chair putting another committee’s seat on a single speaker’s list', async () => {
		const room = await createRunningRoom();
		const singleListId = await addList(room, 'single');
		const otherCommitteeId = await addCommittee(room.supabase, room.conferenceId, 'Other');
		const otherSeatId = await addSeat(room.supabase, otherCommitteeId, 'Chile', 'CL');

		const { error } = await room.chair.supabase
			.from('speakers_list_entries')
			.insert({ speakers_list_id: singleListId, seat_id: otherSeatId, position: 1 });

		expect(error?.message).toContain('row-level security');
	});
});

// -----------------------------------------------------------------------------
// start_single_speaker
// -----------------------------------------------------------------------------

describe('start_single_speaker, "Give the floor" in one transaction', () => {
	it('gives a seat the floor on a list of its own, with the purpose, and the clock ready and paused', async () => {
		const room = await createRunningRoom();

		const { error } = await giveTheFloor(room.chair.supabase, room.committeeId, {
			seatId: room.seatId,
			purpose: '  Right of reply  '
		});

		expect(error).toBeNull();
		const state = await readRoom(room);
		expect(state).toMatchObject({
			mode: 'single_speaker',
			current_motion_id: null,
			current_vote_id: null,
			timer_total_seconds: SINGLE_SPEAKING_SECONDS,
			timer_ends_at: null,
			timer_paused_remaining_seconds: SINGLE_SPEAKING_SECONDS,
			caucus_total_seconds: null
		});

		const { data: list } = await room.chair.supabase
			.from('speakers_lists')
			.select('kind, name, purpose, motion_id, speaking_time_seconds')
			.eq('id', state.active_speakers_list_id)
			.single();
		expect(list).toEqual({
			kind: 'single',
			name: 'Single speaker',
			purpose: 'Right of reply',
			motion_id: null,
			speaking_time_seconds: SINGLE_SPEAKING_SECONDS
		});

		const { data: entry } = await room.chair.supabase
			.from('speakers_list_entries')
			.select('speakers_list_id, seat_id, speaker_name, position, status, started_at')
			.eq('id', state.current_speaker_entry_id)
			.single();
		expect(entry).toMatchObject({
			speakers_list_id: state.active_speakers_list_id,
			seat_id: room.seatId,
			speaker_name: null,
			position: 1,
			status: 'speaking'
		});
		expect(momentOf(entry?.started_at ?? null)).toBe(PRESSED_AT);
	});

	it('gives the floor to a typed name, ending the General Speakers’ List speech in progress with its time', async () => {
		const room = await createRunningRoom();
		const { data: franceEntry } = await room.chair.supabase
			.from('speakers_list_entries')
			.insert({ speakers_list_id: room.generalListId, seat_id: room.seatId, position: 1 })
			.select('id')
			.single();
		await room.chair.supabase.rpc('call_next_speaker', {
			committee_id: room.committeeId,
			pressed_at: PRESSED_AT
		});
		// France has 70 of the committee's 90 seconds left.
		await room.chair.supabase
			.from('committee_state')
			.update({ timer_paused_remaining_seconds: 70 })
			.eq('committee_id', room.committeeId);

		const { error } = await giveTheFloor(room.chair.supabase, room.committeeId, {
			speakerName: 'Secretary-General'
		});

		expect(error).toBeNull();
		const { data: france } = await room.chair.supabase
			.from('speakers_list_entries')
			.select('status, spoke_seconds')
			.eq('id', franceEntry?.id)
			.single();
		expect(france).toEqual({ status: 'spoken', spoke_seconds: 20 });

		const state = await readRoom(room);
		const { data: entry } = await room.chair.supabase
			.from('speakers_list_entries')
			.select('seat_id, speaker_name')
			.eq('id', state.current_speaker_entry_id)
			.single();
		expect(entry).toEqual({ seat_id: null, speaker_name: 'Secretary-General' });
	});

	it('ends a moderated caucus that was running, with its clocks', async () => {
		const room = await createRunningRoom();
		const { data: caucus } = await room.chair.supabase
			.from('motions')
			.insert({
				committee_id: room.committeeId,
				session_id: room.sessionId,
				kind: 'moderated_caucus',
				topic: 'Climate finance',
				total_time_seconds: 600,
				speaking_time_seconds: 45
			})
			.select('id')
			.single();
		await room.chair.supabase.rpc('apply_passed_motion', { motion_id: caucus?.id });

		await giveTheFloor(room.chair.supabase, room.committeeId, { seatId: room.seatId });

		expect(await readRoom(room)).toMatchObject({
			mode: 'single_speaker',
			current_motion_id: null,
			caucus_total_seconds: null,
			caucus_ends_at: null,
			caucus_paused_remaining_seconds: null
		});
	});

	it('refuses neither a seat nor a name, both, a seat of another committee and no time', async () => {
		const room = await createRunningRoom();
		const otherCommitteeId = await addCommittee(room.supabase, room.conferenceId, 'Other');
		const otherSeatId = await addSeat(room.supabase, otherCommitteeId, 'Chile', 'CL');
		const cases = [
			{ fields: { speakerName: '   ' }, refusal: 'Choose a delegation or type a name.' },
			{
				fields: { seatId: room.seatId, speakerName: 'France' },
				refusal: 'Choose a delegation or type a name, not both.'
			},
			{ fields: { seatId: otherSeatId }, refusal: 'That seat is not part of this committee.' },
			{ fields: { seatId: room.seatId, seconds: 0 }, refusal: 'Choose how long the speaker has.' }
		];

		for (const { fields, refusal } of cases) {
			const { error } = await giveTheFloor(room.chair.supabase, room.committeeId, fields);
			expect(error?.message).toBe(refusal);
		}

		expect((await readRoom(room)).mode).toBe('formal_debate');
	});

	it('refuses with no session running, while suspended and while a vote is open', async () => {
		const idleRoom = await createCommitteeRoom();
		const idle = await giveTheFloor(idleRoom.chair.supabase, idleRoom.committeeId, {
			seatId: idleRoom.seatId
		});
		expect(idle.error?.message).toBe('No session is running.');

		const room = await createRunningRoom();
		const { data: vote } = await room.chair.supabase
			.from('votes')
			.insert({
				committee_id: room.committeeId,
				session_id: room.sessionId,
				kind: 'substantive',
				subject: 'Draft Resolution 1.1'
			})
			.select('id')
			.single();
		const duringVote = await giveTheFloor(room.chair.supabase, room.committeeId, {
			seatId: room.seatId
		});
		expect(duringVote.error?.message).toBe('Close the open vote first.');
		await room.chair.supabase.from('votes').delete().eq('id', vote?.id);

		await room.chair.supabase
			.from('committee_state')
			.update({
				mode: 'suspended',
				mode_before_suspension: 'formal_debate',
				suspended_at: PRESSED_AT
			})
			.eq('committee_id', room.committeeId);
		const whileSuspended = await giveTheFloor(room.chair.supabase, room.committeeId, {
			seatId: room.seatId
		});
		expect(whileSuspended.error?.message).toBe('Resume the session first.');
	});

	it('lets an organiser give the floor, and refuses a delegate, a volunteer and another committee’s chair', async () => {
		const room = await createRunningRoom();
		const volunteer = await createSignedInClient('Fixture Volunteer');
		await addStaff(room.supabase, room.conferenceId, volunteer.userId);
		const otherCommitteeId = await addCommittee(room.supabase, room.conferenceId, 'Other');
		const otherChair = await createSignedInClient('Other Chair');
		await addChair(room.supabase, otherCommitteeId, otherChair.userId);

		for (const outsider of [room.delegate, volunteer, otherChair]) {
			const { error } = await giveTheFloor(outsider.supabase, room.committeeId, {
				seatId: room.seatId
			});
			expect(error?.code).toBe('42501');
		}

		expect((await readRoom(room)).mode).toBe('formal_debate');

		const { error } = await giveTheFloor(room.supabase, room.committeeId, { seatId: room.seatId });
		expect(error).toBeNull();
		expect((await readRoom(room)).mode).toBe('single_speaker');
	});
});
