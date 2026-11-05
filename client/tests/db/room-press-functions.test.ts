import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSignedInClient, type SignedInClient } from './supabase-test-client';
import {
	addChair,
	addCommittee,
	addSeat,
	addStaff,
	createCommitteeRoom,
	type CommitteeRoomFixture
} from './conference-fixtures';

// The SQL functions that move the committee room in one transaction
// (specs/02-architecture/data-model.md, "Functions that move the room"):
// `call_next_speaker`, `start_committee_session` and `apply_passed_motion`
// (S2, D1), with the room's new columns they write: dropped motions and
// `started_without_vote` (S6, D3), the caucus clock (S7, D4) and the
// suspension (S11, D6). Then `vote_entries` in the realtime publication
// (S2, D2). `start_single_speaker` and the speakers who hold no seat are in
// `single-speakers.test.ts`, and quick sessions in `quick-sessions.test.ts`.
//
// None of the functions is security definer: each runs as the caller and lets
// Row Level Security check every write, after refusing with 42501 a caller
// who is not `has_committee_permission(id, 'run_room')` (permissions.md, "The committee room's
// functions"). So every function here has the allowed case for a chair and for
// an organiser, and the refused case for a delegate, a volunteer and another
// committee's chair.
//
// The moments handed to the functions are fixed ones in 2030, not now: the
// functions take the chair's `pressed_at` as given, and a fixed moment makes
// every clock sum below exact.

/** The moment of the first press in these tests. */
const PRESSED_AT = '2030-01-01T10:00:00.000Z';

/** How long a fixture caucus lasts in total, and how long each speaker gets in it. */
const CAUCUS_TOTAL_SECONDS = 600;
const CAUCUS_SPEAKING_SECONDS = 45;

/** The committee's default speaking time, which a new General Speakers' List takes. */
const DEFAULT_SPEAKING_SECONDS = 90;

// How long a listener may wait to hear a change through realtime, and how
// often it is given another change while it has heard nothing yet.
const REALTIME_TIMEOUT_MS = 10_000;
const REALTIME_RETRY_MS = 1_000;

/** `seconds` after `moment`, spelled the way JavaScript spells a moment. */
function secondsAfter(moment: string, seconds: number): string {
	return new Date(new Date(moment).getTime() + seconds * 1000).toISOString();
}

/**
 * A stored `timestamptz` spelled the way JavaScript spells a moment, so a
 * moment sent and read back compare equal (Postgres writes "+00:00").
 */
function momentOf(stored: string | null): string | null {
	return stored === null ? null : new Date(stored).toISOString();
}

/** A committee room with a session started, on its General Speakers' List. */
type RunningRoom = CommitteeRoomFixture & {
	sessionId: string;
	generalListId: string;
	/** A second free seat of the committee, which nobody holds. */
	secondSeatId: string;
};

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

/** One committee, one session started through `start_committee_session`, and two seats. */
async function createRunningRoom(): Promise<RunningRoom> {
	const room = await createCommitteeRoom();
	const secondSeatId = await addSeat(room.supabase, room.committeeId, 'Germany', 'DE');

	const { data: sessionId, error } = await room.chair.supabase.rpc('start_committee_session', {
		committee_id: room.committeeId,
		name: 'Session 1',
		pressed_at: PRESSED_AT
	});

	if (error || !sessionId) throw new Error(`Could not start the session: ${error?.message}`);

	const state = await readRoom(room);

	return { ...room, sessionId, generalListId: state.active_speakers_list_id, secondSeatId };
}

/** A seat's turn on a list, waiting, through the chair's own client. */
async function addEntry(
	chair: SupabaseClient,
	listId: string,
	seatId: string,
	position: number
): Promise<string> {
	const { data, error } = await chair
		.from('speakers_list_entries')
		.insert({ speakers_list_id: listId, seat_id: seatId, position })
		.select('id')
		.single();

	if (error || !data) throw new Error(`Could not add the speaker: ${error?.message}`);

	return data.id;
}

/** One entry of a speakers list, read by the chair. */
async function readEntry(room: CommitteeRoomFixture, entryId: string) {
	const { data, error } = await room.chair.supabase
		.from('speakers_list_entries')
		.select('status, started_at, finished_at, spoke_seconds')
		.eq('id', entryId)
		.single();

	if (error || !data) throw new Error(`Could not read the entry: ${error?.message}`);

	return data;
}

/** What `addMotion` may be told about the motion it writes. */
type MotionFields = {
	topic?: string | null;
	totalTimeSeconds?: number | null;
	speakingTimeSeconds?: number | null;
	startedWithoutVote?: boolean;
};

/** One motion on the floor of the room's session, through the chair's own client. */
async function addMotion(
	room: RunningRoom,
	kind: string,
	fields: MotionFields = {}
): Promise<string> {
	const { data, error } = await room.chair.supabase
		.from('motions')
		.insert({
			committee_id: room.committeeId,
			session_id: room.sessionId,
			kind,
			topic: fields.topic ?? null,
			total_time_seconds: fields.totalTimeSeconds ?? null,
			speaking_time_seconds: fields.speakingTimeSeconds ?? null,
			started_without_vote: fields.startedWithoutVote ?? false
		})
		.select('id')
		.single();

	if (error || !data) throw new Error(`Could not propose the motion: ${error?.message}`);

	return data.id;
}

/** A moderated caucus on the floor, of the fixture's length and speaking time. */
function addModeratedCaucus(room: RunningRoom, fields: MotionFields = {}): Promise<string> {
	return addMotion(room, 'moderated_caucus', {
		topic: 'Climate finance',
		totalTimeSeconds: CAUCUS_TOTAL_SECONDS,
		speakingTimeSeconds: CAUCUS_SPEAKING_SECONDS,
		...fields
	});
}

/** One motion, read by the chair. */
async function readMotion(room: CommitteeRoomFixture, motionId: string) {
	const { data, error } = await room.chair.supabase
		.from('motions')
		.select('status, votes_for, votes_against, decided_at, started_without_vote')
		.eq('id', motionId)
		.single();

	if (error || !data) throw new Error(`Could not read the motion: ${error?.message}`);

	return data;
}

/** "Next speaker", pressed by `client`. */
function callNextSpeaker(
	client: SupabaseClient,
	committeeId: string,
	speakingEntryId: string | null,
	pressedAt = PRESSED_AT
) {
	return client.rpc('call_next_speaker', {
		committee_id: committeeId,
		speaking_entry_id: speakingEntryId,
		pressed_at: pressedAt
	});
}

/** "Pass", pressed by `client`, with counts or without. */
function passMotion(
	client: SupabaseClient,
	motionId: string,
	pressedAt = PRESSED_AT,
	votesFor: number | null = null,
	votesAgainst: number | null = null
) {
	return client.rpc('apply_passed_motion', {
		motion_id: motionId,
		votes_for: votesFor,
		votes_against: votesAgainst,
		pressed_at: pressedAt
	});
}

/** Run something that must succeed and hand back its data, failing the test with its error otherwise. */
async function expectSuccess<T>(
	call: PromiseLike<{ data: T; error: { message: string } | null }>
): Promise<T> {
	const { data, error } = await call;

	expect(error).toBeNull();

	return data;
}

/** The three people every function here refuses: a delegate, a volunteer and another committee's chair. */
type Outsiders = {
	delegate: SignedInClient;
	volunteer: SignedInClient;
	otherChair: SignedInClient;
};

/**
 * A volunteer on the conference's team and the chair of a second committee of
 * the same conference, beside the room's own delegate. A chair of another
 * conference would be turned away for not being staff at all, which would
 * prove less.
 */
async function addOutsiders(room: CommitteeRoomFixture): Promise<Outsiders> {
	const volunteer = await createSignedInClient('Fixture Volunteer');
	await addStaff(room.supabase, room.conferenceId, volunteer.userId);

	const otherCommitteeId = await addCommittee(
		room.supabase,
		room.conferenceId,
		'Human Rights Council'
	);
	const otherChair = await createSignedInClient('Other Chair');
	await addChair(room.supabase, otherCommitteeId, otherChair.userId);

	return { delegate: room.delegate, volunteer, otherChair };
}

/** Put the speaker's clock in the room running, ending `secondsLeft` after `PRESSED_AT`. */
async function runSpeakerClock(room: CommitteeRoomFixture, secondsLeft: number): Promise<void> {
	const { error } = await room.chair.supabase
		.from('committee_state')
		.update({
			timer_ends_at: secondsAfter(PRESSED_AT, secondsLeft),
			timer_paused_remaining_seconds: null
		})
		.eq('committee_id', room.committeeId);

	if (error) throw new Error(`Could not start the clock: ${error.message}`);
}

/** France on the floor of the General Speakers' List with Germany waiting, France's clock running. */
async function franceSpeaking(room: RunningRoom, secondsLeft = 30) {
	const franceEntryId = await addEntry(room.chair.supabase, room.generalListId, room.seatId, 1);
	const germanyEntryId = await addEntry(
		room.chair.supabase,
		room.generalListId,
		room.secondSeatId,
		2
	);

	await expectSuccess(callNextSpeaker(room.chair.supabase, room.committeeId, null));
	await runSpeakerClock(room, secondsLeft);

	return { franceEntryId, germanyEntryId };
}

// -----------------------------------------------------------------------------
// clock_seconds_left
// -----------------------------------------------------------------------------
// The arithmetic every function below records a speech's length and pauses a
// clock with. It is `remainingSeconds` in src/lib/committee-room.ts written in
// SQL, so it is held to the same answers.

describe('clock_seconds_left, the seconds a clock has left', () => {
	/** Ask the database, as a signed-in chair would through the functions. */
	async function secondsLeft(
		client: SupabaseClient,
		endsAt: string | null,
		pausedRemainingSeconds: number | null
	) {
		return expectSuccess(
			client.rpc('clock_seconds_left', {
				ends_at: endsAt,
				paused_remaining_seconds: pausedRemainingSeconds,
				at_moment: PRESSED_AT
			})
		);
	}

	it('holds a paused clock’s seconds and counts a running one down, a part-second counting whole', async () => {
		const { supabase } = await createSignedInClient('Clock Reader');

		expect(await secondsLeft(supabase, null, 42)).toBe(42);
		expect(await secondsLeft(supabase, secondsAfter(PRESSED_AT, 30), null)).toBe(30);
		expect(await secondsLeft(supabase, secondsAfter(PRESSED_AT, 29.2), null)).toBe(30);
	});

	it('stops at zero once the time is up, and is null with no clock at all', async () => {
		const { supabase } = await createSignedInClient('Clock Reader');

		expect(await secondsLeft(supabase, secondsAfter(PRESSED_AT, -5), null)).toBe(0);
		expect(await secondsLeft(supabase, null, null)).toBeNull();
	});
});

// -----------------------------------------------------------------------------
// start_committee_session
// -----------------------------------------------------------------------------

describe('start_committee_session, "Start Session 2" in one transaction', () => {
	it("opens the session, its General Speakers' List and the room together", async () => {
		const room = await createCommitteeRoom();

		const sessionId = await expectSuccess(
			room.chair.supabase.rpc('start_committee_session', {
				committee_id: room.committeeId,
				name: '  Session 1  ',
				pressed_at: PRESSED_AT
			})
		);

		const { data: session } = await room.chair.supabase
			.from('committee_sessions')
			.select('name, status, started_at')
			.eq('id', sessionId)
			.single();

		expect(session?.name).toBe('Session 1');
		expect(session?.status).toBe('in_progress');
		expect(momentOf(session?.started_at ?? null)).toBe(PRESSED_AT);

		const state = await readRoom(room);
		const { data: list } = await room.chair.supabase
			.from('speakers_lists')
			.select('session_id, kind, name, motion_id, speaking_time_seconds')
			.eq('id', state.active_speakers_list_id)
			.single();

		expect(list).toEqual({
			session_id: sessionId,
			kind: 'general',
			name: "General Speakers' List",
			motion_id: null,
			speaking_time_seconds: DEFAULT_SPEAKING_SECONDS
		});
		expect(state).toMatchObject({
			current_session_id: sessionId,
			mode: 'formal_debate',
			current_motion_id: null,
			current_speaker_entry_id: null,
			current_vote_id: null,
			timer_total_seconds: null,
			caucus_total_seconds: null,
			suspended_at: null,
			mode_before_suspension: null
		});
	});

	it('leaves the agenda as it was, so it carries over to the next session', async () => {
		const room = await createCommitteeRoom();
		await room.supabase
			.from('committees')
			.update({ topics: ['Climate finance'] })
			.eq('id', room.committeeId);
		await room.chair.supabase
			.from('committee_state')
			.update({ agenda_topic: 'Climate finance' })
			.eq('committee_id', room.committeeId);

		await expectSuccess(
			room.chair.supabase.rpc('start_committee_session', {
				committee_id: room.committeeId,
				name: 'Session 1'
			})
		);

		expect((await readRoom(room)).agenda_topic).toBe('Climate finance');
	});

	it('refuses a second session while one is running, and a blank name', async () => {
		const room = await createRunningRoom();

		const second = await room.chair.supabase.rpc('start_committee_session', {
			committee_id: room.committeeId,
			name: 'Session 2'
		});
		expect(second.error?.message).toBe('End the current session before starting a new one.');

		await room.chair.supabase
			.from('committee_sessions')
			.update({ status: 'ended' })
			.eq('id', room.sessionId);

		const blank = await room.chair.supabase.rpc('start_committee_session', {
			committee_id: room.committeeId,
			name: '   '
		});
		expect(blank.error?.message).toBe('Give the session a name.');
	});

	it('gives two chairs pressing "Start" at the same moment one session between them', async () => {
		const room = await createCommitteeRoom();
		const start = (client: SupabaseClient) =>
			client.rpc('start_committee_session', { committee_id: room.committeeId, name: 'Session 1' });

		const answers = await Promise.all([start(room.chair.supabase), start(room.supabase)]);

		expect(answers.filter((answer) => answer.error === null)).toHaveLength(1);
		expect(answers.map((answer) => answer.error?.message).filter(Boolean)).toEqual([
			'End the current session before starting a new one.'
		]);

		const { data: sessions } = await room.chair.supabase
			.from('committee_sessions')
			.select('id')
			.eq('committee_id', room.committeeId);
		expect(sessions).toHaveLength(1);
	});

	it('lets an organiser start one, and refuses a delegate, a volunteer and another committee’s chair', async () => {
		const room = await createCommitteeRoom();
		const outsiders = await addOutsiders(room);

		for (const outsider of Object.values(outsiders)) {
			const { error } = await outsider.supabase.rpc('start_committee_session', {
				committee_id: room.committeeId,
				name: 'Session 1'
			});

			expect(error?.code).toBe('42501');
		}

		expect((await readRoom(room)).current_session_id).toBeNull();

		await expectSuccess(
			room.supabase.rpc('start_committee_session', {
				committee_id: room.committeeId,
				name: 'Session 1'
			})
		);
	});
});

// -----------------------------------------------------------------------------
// call_next_speaker
// -----------------------------------------------------------------------------

describe('call_next_speaker, "Next speaker" in one transaction', () => {
	it('gives the floor to the first waiting seat by position, with its clock ready and paused', async () => {
		const room = await createRunningRoom();
		// Added out of order, so position decides and not the order of insertion.
		const germanyEntryId = await addEntry(
			room.chair.supabase,
			room.generalListId,
			room.secondSeatId,
			2
		);
		const franceEntryId = await addEntry(room.chair.supabase, room.generalListId, room.seatId, 1);

		const outcome = await expectSuccess(
			callNextSpeaker(room.chair.supabase, room.committeeId, null)
		);

		expect(outcome).toBe('moved');
		expect(await readEntry(room, franceEntryId)).toMatchObject({ status: 'speaking' });
		expect(momentOf((await readEntry(room, franceEntryId)).started_at)).toBe(PRESSED_AT);
		expect((await readEntry(room, germanyEntryId)).status).toBe('waiting');
		expect(await readRoom(room)).toMatchObject({
			current_speaker_entry_id: franceEntryId,
			timer_total_seconds: DEFAULT_SPEAKING_SECONDS,
			timer_ends_at: null,
			timer_paused_remaining_seconds: DEFAULT_SPEAKING_SECONDS
		});
	});

	it('ends the speech in progress with how long it lasted, then calls the next seat', async () => {
		const room = await createRunningRoom();
		// Thirty of France's ninety seconds are left when the chair presses Next.
		const { franceEntryId, germanyEntryId } = await franceSpeaking(room, 30);

		const outcome = await expectSuccess(
			callNextSpeaker(room.chair.supabase, room.committeeId, franceEntryId)
		);

		expect(outcome).toBe('moved');
		const france = await readEntry(room, franceEntryId);
		expect(france.status).toBe('spoken');
		expect(france.spoke_seconds).toBe(60);
		expect(momentOf(france.finished_at)).toBe(PRESSED_AT);
		expect((await readEntry(room, germanyEntryId)).status).toBe('speaking');
		expect((await readRoom(room)).current_speaker_entry_id).toBe(germanyEntryId);
	});

	it('changes nothing and answers "unchanged" when the floor moved on since the chair’s screen was drawn', async () => {
		const room = await createRunningRoom();
		const { franceEntryId, germanyEntryId } = await franceSpeaking(room);

		// The chair's screen still showed nobody speaking.
		const outcome = await expectSuccess(
			callNextSpeaker(room.chair.supabase, room.committeeId, null)
		);

		expect(outcome).toBe('unchanged');
		expect((await readEntry(room, franceEntryId)).status).toBe('speaking');
		expect((await readEntry(room, germanyEntryId)).status).toBe('waiting');
	});

	it('lets only one of two presses at the same moment move the list', async () => {
		const room = await createRunningRoom();
		const franceEntryId = await addEntry(room.chair.supabase, room.generalListId, room.seatId, 1);
		const germanyEntryId = await addEntry(
			room.chair.supabase,
			room.generalListId,
			room.secondSeatId,
			2
		);

		// A chair and an organiser press "Next" on screens that both showed nobody speaking.
		const answers = await Promise.all([
			callNextSpeaker(room.chair.supabase, room.committeeId, null),
			callNextSpeaker(room.supabase, room.committeeId, null)
		]);

		expect(answers.map((answer) => answer.error)).toEqual([null, null]);
		expect(answers.map((answer) => answer.data).sort()).toEqual(['moved', 'unchanged']);
		expect((await readEntry(room, franceEntryId)).status).toBe('speaking');
		expect((await readEntry(room, germanyEntryId)).status).toBe('waiting');
		expect((await readRoom(room)).current_speaker_entry_id).toBe(franceEntryId);
	});

	it('clears the speaker and the clock and answers "empty" when nobody is waiting', async () => {
		const room = await createRunningRoom();
		const franceEntryId = await addEntry(room.chair.supabase, room.generalListId, room.seatId, 1);
		await expectSuccess(callNextSpeaker(room.chair.supabase, room.committeeId, null));

		const outcome = await expectSuccess(
			callNextSpeaker(room.chair.supabase, room.committeeId, franceEntryId)
		);

		expect(outcome).toBe('empty');
		expect((await readEntry(room, franceEntryId)).status).toBe('spoken');
		expect(await readRoom(room)).toMatchObject({
			current_speaker_entry_id: null,
			timer_total_seconds: null,
			timer_ends_at: null,
			timer_paused_remaining_seconds: null
		});
	});

	it('skips a seat marked absent at the session’s latest roll call', async () => {
		const room = await createRunningRoom();
		const franceEntryId = await addEntry(room.chair.supabase, room.generalListId, room.seatId, 1);
		const germanyEntryId = await addEntry(
			room.chair.supabase,
			room.generalListId,
			room.secondSeatId,
			2
		);
		const { data: rollCall } = await room.chair.supabase
			.from('roll_calls')
			.insert({ session_id: room.sessionId })
			.select('id')
			.single();
		await room.chair.supabase.from('roll_call_entries').insert([
			{ roll_call_id: rollCall?.id, seat_id: room.seatId, status: 'absent' },
			{ roll_call_id: rollCall?.id, seat_id: room.secondSeatId, status: 'present' }
		]);

		await expectSuccess(callNextSpeaker(room.chair.supabase, room.committeeId, null));

		expect((await readEntry(room, franceEntryId)).status).toBe('waiting');
		expect((await readEntry(room, germanyEntryId)).status).toBe('speaking');
	});

	it('pauses a running caucus clock with the speaker’s, at what it has left', async () => {
		const room = await createRunningRoom();
		const caucusId = await addModeratedCaucus(room);
		await expectSuccess(passMotion(room.chair.supabase, caucusId));
		const caucusListId = (await readRoom(room)).active_speakers_list_id;
		const franceEntryId = await addEntry(room.chair.supabase, caucusListId, room.seatId, 1);
		await addEntry(room.chair.supabase, caucusListId, room.secondSeatId, 2);
		await expectSuccess(callNextSpeaker(room.chair.supabase, room.committeeId, null));
		// Both clocks run: the speech has 20 seconds left and the caucus 500.
		await room.chair.supabase
			.from('committee_state')
			.update({
				timer_ends_at: secondsAfter(PRESSED_AT, 20),
				timer_paused_remaining_seconds: null,
				caucus_ends_at: secondsAfter(PRESSED_AT, 500),
				caucus_paused_remaining_seconds: null
			})
			.eq('committee_id', room.committeeId);

		await expectSuccess(callNextSpeaker(room.chair.supabase, room.committeeId, franceEntryId));

		expect((await readEntry(room, franceEntryId)).spoke_seconds).toBe(CAUCUS_SPEAKING_SECONDS - 20);
		expect(await readRoom(room)).toMatchObject({
			timer_total_seconds: CAUCUS_SPEAKING_SECONDS,
			timer_paused_remaining_seconds: CAUCUS_SPEAKING_SECONDS,
			caucus_total_seconds: CAUCUS_TOTAL_SECONDS,
			caucus_ends_at: null,
			caucus_paused_remaining_seconds: 500
		});
	});

	it('refuses without a running session, and in a room with no list to call from', async () => {
		const idleRoom = await createCommitteeRoom();
		const idle = await callNextSpeaker(idleRoom.chair.supabase, idleRoom.committeeId, null);
		expect(idle.error?.message).toBe('No session is running.');

		const room = await createRunningRoom();
		for (const mode of ['unmoderated_caucus', 'voting']) {
			await room.chair.supabase
				.from('committee_state')
				.update({ mode })
				.eq('committee_id', room.committeeId);

			const { error } = await callNextSpeaker(room.chair.supabase, room.committeeId, null);
			expect(error?.message).toBe('There is no speakers list open.');
		}
	});

	it('lets an organiser call the next speaker, and refuses a delegate, a volunteer and another committee’s chair', async () => {
		const room = await createRunningRoom();
		const franceEntryId = await addEntry(room.chair.supabase, room.generalListId, room.seatId, 1);
		const outsiders = await addOutsiders(room);

		for (const outsider of Object.values(outsiders)) {
			const { error } = await callNextSpeaker(outsider.supabase, room.committeeId, null);
			expect(error?.code).toBe('42501');
		}

		expect((await readEntry(room, franceEntryId)).status).toBe('waiting');

		expect(await expectSuccess(callNextSpeaker(room.supabase, room.committeeId, null))).toBe(
			'moved'
		);
	});
});

// -----------------------------------------------------------------------------
// apply_passed_motion
// -----------------------------------------------------------------------------

describe('apply_passed_motion, "Pass" in one transaction', () => {
	it('passes the motion with its counts, drops the others on the floor and answers their ids', async () => {
		const room = await createRunningRoom();
		const caucusId = await addModeratedCaucus(room);
		const adjournId = await addMotion(room, 'adjourn_meeting');
		const documentId = await addMotion(room, 'introduce_document', { topic: 'DR 1.1' });

		const droppedIds = await expectSuccess(
			passMotion(room.chair.supabase, caucusId, PRESSED_AT, 5, 1)
		);

		expect([...droppedIds].sort()).toEqual([adjournId, documentId].sort());
		expect(await readMotion(room, caucusId)).toMatchObject({
			status: 'passed',
			votes_for: 5,
			votes_against: 1,
			started_without_vote: false
		});
		for (const droppedId of [adjournId, documentId]) {
			const dropped = await readMotion(room, droppedId);
			expect(dropped.status).toBe('dropped');
			expect(momentOf(dropped.decided_at)).toBe(PRESSED_AT);
		}
	});

	it('drops none of the motions on the floor for a caucus started without a vote (the direct route)', async () => {
		const room = await createRunningRoom();
		const otherId = await addMotion(room, 'adjourn_meeting');
		const directId = await addModeratedCaucus(room, { startedWithoutVote: true });

		const droppedIds = await expectSuccess(passMotion(room.chair.supabase, directId));

		expect(droppedIds).toEqual([]);
		expect(await readMotion(room, directId)).toMatchObject({
			status: 'passed',
			votes_for: null,
			votes_against: null,
			started_without_vote: true
		});
		expect((await readMotion(room, otherId)).status).toBe('proposed');
	});

	it('ends a General Speakers’ List speech still running, and runs a moderated caucus on a list of its own with its total on the caucus clock', async () => {
		const room = await createRunningRoom();
		// Thirty of France's ninety seconds are left when the caucus passes.
		const { franceEntryId } = await franceSpeaking(room, 30);
		const caucusId = await addModeratedCaucus(room);

		await expectSuccess(passMotion(room.chair.supabase, caucusId));

		const france = await readEntry(room, franceEntryId);
		expect(france.status).toBe('spoken');
		expect(france.spoke_seconds).toBe(60);
		expect(momentOf(france.finished_at)).toBe(PRESSED_AT);

		const state = await readRoom(room);
		expect(state).toMatchObject({
			mode: 'moderated_caucus',
			current_motion_id: caucusId,
			current_speaker_entry_id: null,
			timer_total_seconds: null,
			timer_ends_at: null,
			timer_paused_remaining_seconds: null,
			caucus_total_seconds: CAUCUS_TOTAL_SECONDS,
			caucus_ends_at: null,
			caucus_paused_remaining_seconds: CAUCUS_TOTAL_SECONDS
		});

		const { data: caucusList } = await room.chair.supabase
			.from('speakers_lists')
			.select('kind, motion_id, name, speaking_time_seconds')
			.eq('id', state.active_speakers_list_id)
			.single();
		expect(caucusList).toEqual({
			kind: 'caucus',
			motion_id: caucusId,
			name: 'Climate finance',
			speaking_time_seconds: CAUCUS_SPEAKING_SECONDS
		});
	});

	it('runs an unmoderated caucus’s clock from the moment it passed, on the General Speakers’ List', async () => {
		const room = await createRunningRoom();
		const { franceEntryId } = await franceSpeaking(room);
		const caucusId = await addMotion(room, 'unmoderated_caucus', { totalTimeSeconds: 600 });

		await expectSuccess(passMotion(room.chair.supabase, caucusId));

		expect((await readEntry(room, franceEntryId)).status).toBe('spoken');
		const state = await readRoom(room);
		expect(state).toMatchObject({
			mode: 'unmoderated_caucus',
			current_motion_id: caucusId,
			active_speakers_list_id: room.generalListId,
			current_speaker_entry_id: null,
			timer_total_seconds: 600,
			timer_paused_remaining_seconds: null,
			caucus_total_seconds: null
		});
		expect(momentOf(state.timer_ends_at)).toBe(secondsAfter(PRESSED_AT, 600));
	});

	it('adds an extension to the caucus clock of a moderated caucus, running or paused, and grows its total', async () => {
		const room = await createRunningRoom();
		await expectSuccess(passMotion(room.chair.supabase, await addModeratedCaucus(room)));
		const pausedExtensionId = await addMotion(room, 'extend_caucus', { totalTimeSeconds: 300 });

		await expectSuccess(passMotion(room.chair.supabase, pausedExtensionId));

		expect(await readRoom(room)).toMatchObject({
			caucus_total_seconds: CAUCUS_TOTAL_SECONDS + 300,
			caucus_paused_remaining_seconds: CAUCUS_TOTAL_SECONDS + 300,
			caucus_ends_at: null
		});

		// The caucus clock running, with 100 seconds left at the second press.
		await room.chair.supabase
			.from('committee_state')
			.update({
				caucus_ends_at: secondsAfter(PRESSED_AT, 100),
				caucus_paused_remaining_seconds: null
			})
			.eq('committee_id', room.committeeId);
		const runningExtensionId = await addMotion(room, 'extend_caucus', { totalTimeSeconds: 60 });

		await expectSuccess(passMotion(room.chair.supabase, runningExtensionId));

		const state = await readRoom(room);
		expect(state.caucus_total_seconds).toBe(CAUCUS_TOTAL_SECONDS + 360);
		expect(momentOf(state.caucus_ends_at)).toBe(secondsAfter(PRESSED_AT, 160));
		expect(state.caucus_paused_remaining_seconds).toBeNull();
	});

	it('adds an extension to an unmoderated caucus’s own clock', async () => {
		const room = await createRunningRoom();
		const caucusId = await addMotion(room, 'unmoderated_caucus', { totalTimeSeconds: 600 });
		await expectSuccess(passMotion(room.chair.supabase, caucusId));
		const extensionId = await addMotion(room, 'extend_caucus', { totalTimeSeconds: 300 });

		// Pressed 100 seconds into the caucus: 500 left, 800 after the extension.
		await expectSuccess(
			passMotion(room.chair.supabase, extensionId, secondsAfter(PRESSED_AT, 100))
		);

		const state = await readRoom(room);
		expect(state.timer_total_seconds).toBe(900);
		expect(momentOf(state.timer_ends_at)).toBe(secondsAfter(PRESSED_AT, 900));
		expect(state.mode).toBe('unmoderated_caucus');
	});

	it('suspends the room for the motion’s length, pausing every clock and keeping everything else', async () => {
		const room = await createRunningRoom();
		const { franceEntryId } = await franceSpeaking(room, 30);
		const suspendId = await addMotion(room, 'suspend_meeting', {
			topic: 'for lunch',
			totalTimeSeconds: 900
		});

		await expectSuccess(passMotion(room.chair.supabase, suspendId));

		// A suspension does not end the speech: resuming finds the speaker where they were.
		expect((await readEntry(room, franceEntryId)).status).toBe('speaking');
		const state = await readRoom(room);
		expect(state).toMatchObject({
			mode: 'suspended',
			mode_before_suspension: 'formal_debate',
			current_speaker_entry_id: franceEntryId,
			active_speakers_list_id: room.generalListId,
			timer_ends_at: null,
			timer_paused_remaining_seconds: 30
		});
		// suspended_at is the motion's decided_at, which is how the reason is found again.
		expect(momentOf(state.suspended_at)).toBe(PRESSED_AT);
		expect(momentOf((await readMotion(room, suspendId)).decided_at)).toBe(PRESSED_AT);
		expect(momentOf(state.suspended_until)).toBe(secondsAfter(PRESSED_AT, 900));
	});

	it('suspends with no return time when the motion gave no length', async () => {
		const room = await createRunningRoom();

		await expectSuccess(passMotion(room.chair.supabase, await addMotion(room, 'suspend_meeting')));

		expect(await readRoom(room)).toMatchObject({ mode: 'suspended', suspended_until: null });
	});

	it('ends the session on adjourning, cancelling a vote still open, with the room idle and cleared', async () => {
		const room = await createRunningRoom();
		const { franceEntryId } = await franceSpeaking(room);
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
		const adjournId = await addMotion(room, 'adjourn_meeting');

		await expectSuccess(passMotion(room.chair.supabase, adjournId));

		expect((await readEntry(room, franceEntryId)).status).toBe('spoken');
		const { data: session } = await room.chair.supabase
			.from('committee_sessions')
			.select('status, ended_at')
			.eq('id', room.sessionId)
			.single();
		expect(session?.status).toBe('ended');
		expect(momentOf(session?.ended_at ?? null)).toBe(PRESSED_AT);

		const { data: votes } = await room.chair.supabase.from('votes').select('id').eq('id', vote?.id);
		expect(votes).toEqual([]);

		expect(await readRoom(room)).toMatchObject({
			mode: 'idle',
			current_session_id: null,
			active_speakers_list_id: null,
			current_speaker_entry_id: null,
			current_vote_id: null,
			timer_total_seconds: null,
			caucus_total_seconds: null,
			suspended_at: null
		});
	});

	it('moves the room to voting on closing debate, ending a caucus, its speech and both clocks', async () => {
		const room = await createRunningRoom();
		await expectSuccess(passMotion(room.chair.supabase, await addModeratedCaucus(room)));
		const caucusListId = (await readRoom(room)).active_speakers_list_id;
		const franceEntryId = await addEntry(room.chair.supabase, caucusListId, room.seatId, 1);
		await expectSuccess(callNextSpeaker(room.chair.supabase, room.committeeId, null));
		const closeId = await addMotion(room, 'close_debate');

		await expectSuccess(passMotion(room.chair.supabase, closeId));

		expect((await readEntry(room, franceEntryId)).status).toBe('spoken');
		expect(await readRoom(room)).toMatchObject({
			mode: 'voting',
			current_motion_id: null,
			current_vote_id: null,
			active_speakers_list_id: room.generalListId,
			current_speaker_entry_id: null,
			timer_total_seconds: null,
			caucus_total_seconds: null,
			caucus_paused_remaining_seconds: null
		});
	});

	it('only records a document or another motion', async () => {
		const room = await createRunningRoom();
		const { franceEntryId } = await franceSpeaking(room);
		const before = await readRoom(room);

		await expectSuccess(
			passMotion(
				room.chair.supabase,
				await addMotion(room, 'other', { topic: 'A minute of silence' })
			)
		);

		expect((await readEntry(room, franceEntryId)).status).toBe('speaking');
		const after = await readRoom(room);
		expect({ ...after, updated_at: null }).toEqual({ ...before, updated_at: null });
	});

	it('refuses a motion that does not exist and one no longer on the floor', async () => {
		const room = await createRunningRoom();
		const missing = await passMotion(room.chair.supabase, crypto.randomUUID());
		expect(missing.error?.message).toBe('That motion does not exist');

		const caucusId = await addModeratedCaucus(room);
		await expectSuccess(passMotion(room.chair.supabase, caucusId));
		const again = await passMotion(room.chair.supabase, caucusId);
		expect(again.error?.message).toBe('That motion is no longer on the floor.');
	});

	it('lets only one of two chairs passing the same motion at the same moment succeed', async () => {
		const room = await createRunningRoom();
		const caucusId = await addModeratedCaucus(room);

		const answers = await Promise.all([
			passMotion(room.chair.supabase, caucusId),
			passMotion(room.supabase, caucusId)
		]);

		expect(answers.filter((answer) => answer.error === null)).toHaveLength(1);
		expect(answers.map((answer) => answer.error?.message).filter(Boolean)).toEqual([
			'That motion is no longer on the floor.'
		]);
		const { data: caucusLists } = await room.chair.supabase
			.from('speakers_lists')
			.select('id')
			.eq('motion_id', caucusId);
		expect(caucusLists).toHaveLength(1);
	});

	it('asks the Motions page’s questions again: a suspended room, an open vote, an extension with no caucus', async () => {
		const room = await createRunningRoom();
		const extensionId = await addMotion(room, 'extend_caucus', { totalTimeSeconds: 300 });
		const noCaucus = await passMotion(room.chair.supabase, extensionId);
		expect(noCaucus.error?.message).toBe('There is no caucus to extend.');

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
		const caucusId = await addModeratedCaucus(room);
		const duringVote = await passMotion(room.chair.supabase, caucusId);
		expect(duringVote.error?.message).toBe('Close the open vote first.');
		await room.chair.supabase.from('votes').delete().eq('id', vote?.id);

		// Each refused pass changed nothing: both motions are still on the floor.
		expect((await readMotion(room, caucusId)).status).toBe('proposed');
		expect((await readMotion(room, extensionId)).status).toBe('proposed');

		await expectSuccess(passMotion(room.chair.supabase, await addMotion(room, 'suspend_meeting')));
		const caucusAgainId = await addModeratedCaucus(room);
		const whileSuspended = await passMotion(room.chair.supabase, caucusAgainId);
		expect(whileSuspended.error?.message).toBe('Resume the session first.');
		expect((await readMotion(room, caucusAgainId)).status).toBe('proposed');
	});

	it('lets an organiser pass a motion, and refuses a delegate, a volunteer and another committee’s chair', async () => {
		const room = await createRunningRoom();
		const caucusId = await addModeratedCaucus(room);
		const outsiders = await addOutsiders(room);

		for (const outsider of Object.values(outsiders)) {
			const { error } = await passMotion(outsider.supabase, caucusId);
			expect(error?.code).toBe('42501');
		}

		expect((await readMotion(room, caucusId)).status).toBe('proposed');

		await expectSuccess(passMotion(room.supabase, caucusId));
		expect((await readMotion(room, caucusId)).status).toBe('passed');
	});

	it('tells a signed-in stranger the motion does not exist, because they cannot read it', async () => {
		const room = await createRunningRoom();
		const caucusId = await addModeratedCaucus(room);
		const stranger = await createSignedInClient('Stranger');

		const { error } = await passMotion(stranger.supabase, caucusId);

		expect(error?.message).toBe('That motion does not exist');
		expect((await readMotion(room, caucusId)).status).toBe('proposed');
	});
});

// -----------------------------------------------------------------------------
// D3: dropping and restoring a motion
// -----------------------------------------------------------------------------
// "Clear the floor", Undo and "Restore" (S6) are each one update of `motions`
// through the existing policy "A chair can decide or withdraw a motion", so D3
// added no policy; these show that policy covers them.

describe('motions, dropped and restored (D3)', () => {
	it('starts every motion as voted on, and lets a chair drop one and put it back', async () => {
		const room = await createRunningRoom();
		const motionId = await addMotion(room, 'adjourn_meeting');

		expect((await readMotion(room, motionId)).started_without_vote).toBe(false);

		await expectSuccess(
			room.chair.supabase
				.from('motions')
				.update({ status: 'dropped', decided_at: PRESSED_AT })
				.eq('id', motionId)
				.select('id')
		);
		expect((await readMotion(room, motionId)).status).toBe('dropped');

		await expectSuccess(
			room.chair.supabase
				.from('motions')
				.update({ status: 'proposed', decided_at: null })
				.eq('id', motionId)
				.select('id')
		);
		expect(await readMotion(room, motionId)).toMatchObject({
			status: 'proposed',
			decided_at: null
		});
	});

	it('refuses a delegate who tries to drop a motion', async () => {
		const room = await createRunningRoom();
		const motionId = await addMotion(room, 'adjourn_meeting');

		const { data } = await room.delegate.supabase
			.from('motions')
			.update({ status: 'dropped', decided_at: PRESSED_AT })
			.eq('id', motionId)
			.select('id');

		expect(data).toEqual([]);
		expect((await readMotion(room, motionId)).status).toBe('proposed');
	});
});

// -----------------------------------------------------------------------------
// D4 and D6: the caucus clock and the suspension, said once in the database
// -----------------------------------------------------------------------------

describe('committee_state, the caucus clock and the suspension (D4, D6)', () => {
	/** Write `changes` to the room's row as its chair, answering the error. */
	async function writeRoom(room: CommitteeRoomFixture, changes: Record<string, unknown>) {
		const { error } = await room.chair.supabase
			.from('committee_state')
			.update(changes)
			.eq('committee_id', room.committeeId);

		return error;
	}

	it('refuses a caucus clock that runs and is paused at once', async () => {
		const room = await createRunningRoom();

		const error = await writeRoom(room, {
			caucus_total_seconds: 600,
			caucus_ends_at: PRESSED_AT,
			caucus_paused_remaining_seconds: 300
		});

		expect(error?.message).toContain('committee_state_caucus_clock_runs_or_is_paused');
	});

	it('lets a chair suspend in one update and resume to the mode that was suspended', async () => {
		const room = await createRunningRoom();
		await expectSuccess(passMotion(room.chair.supabase, await addModeratedCaucus(room)));

		expect(
			await writeRoom(room, {
				mode: 'suspended',
				mode_before_suspension: 'moderated_caucus',
				suspended_at: PRESSED_AT,
				suspended_until: secondsAfter(PRESSED_AT, 600)
			})
		).toBeNull();

		expect(
			await writeRoom(room, {
				mode: 'moderated_caucus',
				mode_before_suspension: null,
				suspended_at: null,
				suspended_until: null
			})
		).toBeNull();
		expect(await readRoom(room)).toMatchObject({
			mode: 'moderated_caucus',
			caucus_total_seconds: CAUCUS_TOTAL_SECONDS
		});
	});

	it('keeps the suspension to a suspended room', async () => {
		const room = await createRunningRoom();
		const refusals = [
			// Suspended, but not saying when or from what.
			{ mode: 'suspended' },
			// A return time in a room that is not suspended.
			{ suspended_at: PRESSED_AT, suspended_until: PRESSED_AT },
			// A return time with no moment it was suspended.
			{ mode: 'suspended', mode_before_suspension: 'formal_debate', suspended_until: PRESSED_AT },
			// Resuming into idle or into another suspension.
			{ mode: 'suspended', mode_before_suspension: 'idle', suspended_at: PRESSED_AT },
			{ mode: 'suspended', mode_before_suspension: 'suspended', suspended_at: PRESSED_AT }
		];

		for (const changes of refusals) {
			const error = await writeRoom(room, changes);
			expect(error?.message).toContain('committee_state_suspension_matches_mode');
		}

		expect((await readRoom(room)).mode).toBe('formal_debate');
	});

	it('refuses a delegate who tries to suspend the room', async () => {
		const room = await createRunningRoom();

		const { data } = await room.delegate.supabase
			.from('committee_state')
			.update({
				mode: 'suspended',
				mode_before_suspension: 'formal_debate',
				suspended_at: PRESSED_AT
			})
			.eq('committee_id', room.committeeId)
			.select('committee_id');

		expect(data).toEqual([]);
		expect((await readRoom(room)).mode).toBe('formal_debate');
	});
});

// -----------------------------------------------------------------------------
// D2: vote_entries in the realtime publication
// -----------------------------------------------------------------------------
// The publication cannot be read through PostgREST, so it is checked the way
// committee-room.test.ts checks roll_calls: a delegate listens, filtered on
// the vote the way `$lib/committee-room-live.ts` listens, and hears the chair
// answer for a seat. Only a published table is heard at all.

/** One change a listener heard, in the order it heard them. */
type HeardChange = { eventType: string; voteId: string | null; seatId: string | null };

/**
 * Counts the channels opened, so each gets a name of its own: a channel closes
 * a moment after it is removed, and a new one under the same name in that
 * moment would be handed the one that is closing.
 */
let openedChannelCount = 0;

/**
 * Listen as `listener` to the answers of `voteId`, and run `act` once the
 * channel is listening. Resolves with every change heard so far as soon as
 * `isDone` says the changes heard are enough; `act` runs again every second
 * until then, because the first listener after `pnpm db:reset` can be told
 * "SUBSCRIBED" a moment before Realtime reads the database's changes.
 */
function listenToVote(
	listener: SupabaseClient,
	voteId: string,
	act: () => Promise<void>,
	isDone: (heard: HeardChange[]) => boolean
): Promise<HeardChange[]> {
	return new Promise((resolve, reject) => {
		const heard: HeardChange[] = [];
		let lastStatus = 'not subscribed yet';
		let retry: ReturnType<typeof setInterval> | undefined;
		const giveUp = setTimeout(
			() =>
				stop(new Error(`Not enough was heard (channel: ${lastStatus}): ${JSON.stringify(heard)}`)),
			REALTIME_TIMEOUT_MS
		);

		/** Stop listening, and fail the test when there is a reason to. */
		function stop(failure: Error | null) {
			clearTimeout(giveUp);
			clearInterval(retry);
			void listener.removeChannel(channel);
			if (failure) reject(failure);
			else resolve(heard);
		}

		/** Act, failing the test when the action itself fails. */
		function actOnce() {
			act().catch((error: Error) => stop(error));
		}

		openedChannelCount += 1;

		const channelName = `vote-entries-${voteId}-${openedChannelCount}`;
		const channel = listener
			.channel(channelName, { config: { postgres_changes_options: { wait: true } } })
			.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table: 'vote_entries', filter: `vote_id=eq.${voteId}` },
				(change) => {
					const row = (change.eventType === 'DELETE' ? change.old : change.new) as {
						vote_id?: string;
						seat_id?: string;
					};
					heard.push({
						eventType: change.eventType,
						voteId: row.vote_id ?? null,
						seatId: row.seat_id ?? null
					});
					if (isDone(heard)) stop(null);
				}
			)
			.subscribe((status, error) => {
				lastStatus = error ? `${status}: ${error.message}` : status;

				if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
					stop(new Error(`The delegate could not listen (${lastStatus}).`));
					return;
				}

				if (status === 'SUBSCRIBED') {
					actOnce();
					retry = setInterval(actOnce, REALTIME_RETRY_MS);
				}
			});
	});
}

describe('vote_entries, heard live (D2)', () => {
	/** A roll call vote open in a running room. */
	async function openRollCallVote(room: RunningRoom): Promise<string> {
		const { data, error } = await room.chair.supabase
			.from('votes')
			.insert({
				committee_id: room.committeeId,
				session_id: room.sessionId,
				kind: 'substantive',
				subject: 'Draft Resolution 1.1',
				method: 'roll_call'
			})
			.select('id')
			.single();

		if (error || !data) throw new Error(`Could not open the vote: ${error?.message}`);

		return data.id;
	}

	/** The chair records `seatId`'s answer, as `recordRollCallChoice` does. */
	async function answer(room: RunningRoom, voteId: string, seatId: string, choice: string) {
		const { error } = await room.chair.supabase
			.from('vote_entries')
			.upsert({ vote_id: voteId, seat_id: seatId, choice }, { onConflict: 'vote_id,seat_id' });

		if (error) throw new Error(`Could not record the answer: ${error.message}`);
	}

	it('tells a delegate listening to the vote each answer as the chair records it', async () => {
		const room = await createRunningRoom();
		const voteId = await openRollCallVote(room);

		const heard = await listenToVote(
			room.delegate.supabase,
			voteId,
			() => answer(room, voteId, room.seatId, 'for'),
			(changes) => changes.length > 0
		);

		expect(heard[0]).toMatchObject({ seatId: room.seatId });
		expect(['INSERT', 'UPDATE']).toContain(heard[0].eventType);
	});

	it('records what a listener hears of an answer the chair takes off again: the delete, and nothing of another vote’s', async () => {
		const room = await createRunningRoom();
		const voteId = await openRollCallVote(room);
		const otherVoteId = await openRollCallVote(room);
		await answer(room, otherVoteId, room.seatId, 'for');

		// First France's answer, heard as the test above shows.
		await listenToVote(
			room.delegate.supabase,
			voteId,
			() => answer(room, voteId, room.seatId, 'for'),
			(changes) => changes.length > 0
		);

		// Then, on a channel listening the same way, France's answer is taken off
		// both votes (clearRollCallChoice) and Germany answers this one. Realtime
		// sends the changes in the order they were made, so whatever is heard of
		// the two deletes arrives before Germany's answer.
		let hasCleared = false;
		const heard = await listenToVote(
			room.delegate.supabase,
			voteId,
			async () => {
				if (!hasCleared) {
					hasCleared = true;
					for (const clearedVoteId of [otherVoteId, voteId]) {
						await room.chair.supabase
							.from('vote_entries')
							.delete()
							.eq('vote_id', clearedVoteId)
							.eq('seat_id', room.seatId);
					}
				}
				await answer(room, voteId, room.secondSeatId, 'against');
			},
			(changes) => changes.some((change) => change.seatId === room.secondSeatId)
		);

		// A delete carries only the row's primary key, and vote_id is part of it,
		// so the listener's filter does apply: it hears its own vote's answer
		// taken off at once, and nothing of the other vote.
		expect(heard.filter((change) => change.eventType === 'DELETE')).toEqual([
			{ eventType: 'DELETE', voteId, seatId: room.seatId }
		]);
		expect(heard.every((change) => change.voteId === voteId)).toBe(true);
		expect(heard.at(-1)).toMatchObject({ seatId: room.secondSeatId });
	});
});
