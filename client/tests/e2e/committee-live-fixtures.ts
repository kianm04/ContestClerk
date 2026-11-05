import type { Page } from '@playwright/test';
import type { Database } from '../../src/lib/database.types';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { readCommitteeState, type ChairedCommittee } from './chair-room-fixtures';

// What `committee-live.spec.ts` sets up before a delegate opens the live view:
// a running session, seats waiting on its list, and the room's timer.
//
// The service-role client writes the rows the chair's own buttons would, the
// way `chair-room-fixtures.ts` does, so a test can arrange a room without
// driving the chair's page first. It is never used to show that something is
// allowed.

/** The live view's address for a committee made by `makeChairedCommittee`. */
export function livePathOf(room: ChairedCommittee): string {
	return `/conferences/${room.conferenceSlug}/committees/${room.committeeSlug}/live`;
}

/** The id of the committee's seat called `seatName`. */
export async function seatIdOf(committeeId: string, seatName: string): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('seats')
		.select('id')
		.eq('committee_id', committeeId)
		.eq('name', seatName)
		.single();

	if (error || !data) throw new Error(`Could not find the ${seatName} seat: ${error?.message}`);

	return data.id;
}

/**
 * Start a session the way the chair's "Start session" does
 * (`src/lib/server/committee-sessions.ts`): the session, its General Speakers'
 * List, and the room in formal debate on that list.
 */
export async function startSessionInDatabase(room: ChairedCommittee): Promise<void> {
	const admin = createServiceRoleClient();

	const { data: session, error: sessionError } = await admin
		.from('committee_sessions')
		.insert({
			committee_id: room.committeeId,
			name: 'Session 1',
			status: 'in_progress',
			started_at: new Date().toISOString()
		})
		.select('id')
		.single();

	if (sessionError || !session) throw new Error(`Could not start: ${sessionError?.message}`);

	const { data: list, error: listError } = await admin
		.from('speakers_lists')
		.insert({
			committee_id: room.committeeId,
			session_id: session.id,
			kind: 'general',
			name: "General Speakers' List",
			speaking_time_seconds: 60
		})
		.select('id')
		.single();

	if (listError || !list) throw new Error(`Could not open the list: ${listError?.message}`);

	const { error } = await admin
		.from('committee_state')
		.update({
			current_session_id: session.id,
			mode: 'formal_debate',
			active_speakers_list_id: list.id
		})
		.eq('committee_id', room.committeeId);

	if (error) throw new Error(`Could not put the room in formal debate: ${error.message}`);
}

/**
 * Put `seatNames` on the active list in that order, the first one speaking
 * when `hasSpeaker` is true and everybody else waiting.
 */
export async function fillSpeakersList(
	room: ChairedCommittee,
	seatNames: string[],
	hasSpeaker: boolean
): Promise<void> {
	const admin = createServiceRoleClient();
	const state = await readCommitteeState(room.committeeId);
	const listId = state.active_speakers_list_id ?? '';
	let speakingEntryId: string | null = null;

	for (const [position, seatName] of seatNames.entries()) {
		const isSpeaking = hasSpeaker && position === 0;
		const { data: entry, error } = await admin
			.from('speakers_list_entries')
			.insert({
				speakers_list_id: listId,
				seat_id: await seatIdOf(room.committeeId, seatName),
				position,
				status: isSpeaking ? 'speaking' : 'waiting'
			})
			.select('id')
			.single();

		if (error || !entry) throw new Error(`Could not add ${seatName}: ${error?.message}`);
		if (isSpeaking) speakingEntryId = entry.id;
	}

	await updateRoom(room, { current_speaker_entry_id: speakingEntryId });
}

/** The `committee_state` columns a test may change. */
type RoomColumns = {
	mode?: 'formal_debate' | 'suspended';
	/** A suspended room says when and from what (`committee_state_suspension_matches_mode`). */
	suspended_at?: string | null;
	mode_before_suspension?: 'formal_debate' | null;
	current_speaker_entry_id?: string | null;
	timer_total_seconds?: number | null;
	timer_ends_at?: string | null;
	timer_paused_remaining_seconds?: number | null;
};

/** Change the room's `committee_state` row, as one of the chair's buttons would. */
export async function updateRoom(room: ChairedCommittee, columns: RoomColumns): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('committee_state')
		.update(columns)
		.eq('committee_id', room.committeeId);

	if (error) throw new Error(`Could not change the room: ${error.message}`);
}

/**
 * Resolves once the page's realtime channel is listening for changes in the
 * database. Realtime sends "Subscribed to PostgreSQL" once it is; a change
 * made before that could pass unheard. Call it before the page is opened, so
 * the socket is watched from its first frame.
 */
export function roomChannelListening(page: Page): Promise<void> {
	return new Promise((resolve) => {
		page.on('websocket', (socket) => {
			socket.on('framereceived', (frame) => {
				if (String(frame.payload).includes('Subscribed to PostgreSQL')) resolve();
			});
		});
	});
}

/** Put a ten-minute moderated caucus on "Climate finance", raised by `seatName`, on the floor. */
export async function proposeCaucus(room: ChairedCommittee, seatName: string): Promise<void> {
	const admin = createServiceRoleClient();
	const state = await readCommitteeState(room.committeeId);

	const { error } = await admin.from('motions').insert({
		committee_id: room.committeeId,
		session_id: state.current_session_id ?? '',
		kind: 'moderated_caucus',
		status: 'proposed',
		topic: 'Climate finance',
		total_time_seconds: 600,
		speaking_time_seconds: 60,
		proposed_by_seat_id: await seatIdOf(room.committeeId, seatName)
	});

	if (error) throw new Error(`Could not propose the caucus: ${error.message}`);
}

// What `committee-display.spec.ts` and the session redesign's tests of the
// live view (S12, S13) add: the projector's address, and the room put into
// each of its states straight in the database, the way the chair's presses
// leave it, so a test can check what the watchers see without driving the
// console first.

/** The projector's display for a committee made by `makeChairedCommittee`. */
export function displayPathOf(room: ChairedCommittee): string {
	return `/conferences/${room.conferenceSlug}/committees/${room.committeeSlug}/display`;
}

/** Any columns of the room's `committee_state` row, as the generated types name them. */
type StateColumns = Database['public']['Tables']['committee_state']['Update'];

/** Change any columns of the room's `committee_state` row. */
export async function writeRoomState(room: ChairedCommittee, columns: StateColumns): Promise<void> {
	const admin = createServiceRoleClient();
	const { error } = await admin
		.from('committee_state')
		.update(columns)
		.eq('committee_id', room.committeeId);

	if (error) throw new Error(`Could not change the room: ${error.message}`);
}

/** No caucus clock: what every mode but a moderated caucus has (D4). */
export const NO_CAUCUS_CLOCK = {
	caucus_total_seconds: null,
	caucus_ends_at: null,
	caucus_paused_remaining_seconds: null
} satisfies StateColumns;

/** Record a passed motion of the running session, as passing it or starting its mode does. */
async function passMotion(
	room: ChairedCommittee,
	motion: Database['public']['Tables']['motions']['Insert']
): Promise<string> {
	const admin = createServiceRoleClient();
	const { data, error } = await admin
		.from('motions')
		.insert({ ...motion, status: 'passed', started_without_vote: true })
		.select('id')
		.single();

	if (error || !data) throw new Error(`Could not record the motion: ${error?.message}`);

	return data.id;
}

/** The running session's id, which every seeded row belongs to. */
async function runningSessionId(room: ChairedCommittee): Promise<string> {
	return (await readCommitteeState(room.committeeId)).current_session_id ?? '';
}

/**
 * Run an unmoderated caucus on "Drafting the working paper" straight in the
 * database, its one clock running with `secondsLeft` of ten minutes.
 */
export async function startUnmodDirectly(
	room: ChairedCommittee,
	secondsLeft: number
): Promise<void> {
	const motionId = await passMotion(room, {
		committee_id: room.committeeId,
		session_id: await runningSessionId(room),
		kind: 'unmoderated_caucus',
		topic: 'Drafting the working paper',
		total_time_seconds: 600,
		decided_at: new Date().toISOString()
	});

	await writeRoomState(room, {
		mode: 'unmoderated_caucus',
		current_motion_id: motionId,
		current_speaker_entry_id: null,
		...NO_CAUCUS_CLOCK,
		timer_total_seconds: 600,
		timer_ends_at: new Date(Date.now() + secondsLeft * 1000).toISOString(),
		timer_paused_remaining_seconds: null
	});
}

/**
 * Give the floor to a single speaker for "Right of reply" straight in the
 * database: somebody typed by name who holds no seat, with `alsoSpeaking`
 * waiting after them, the clock ready at a minute.
 */
export async function startSingleSpeakerDirectly(
	room: ChairedCommittee,
	typedName: string,
	alsoSpeaking: string[]
): Promise<void> {
	const admin = createServiceRoleClient();
	const { data: list, error } = await admin
		.from('speakers_lists')
		.insert({
			committee_id: room.committeeId,
			session_id: await runningSessionId(room),
			kind: 'single',
			name: 'Single speaker',
			speaking_time_seconds: 60,
			purpose: 'Right of reply'
		})
		.select('id')
		.single();

	if (error || !list)
		throw new Error(`Could not open the single speaker's list: ${error?.message}`);

	const { data: speaker, error: speakerError } = await admin
		.from('speakers_list_entries')
		.insert({ speakers_list_id: list.id, speaker_name: typedName, position: 0, status: 'speaking' })
		.select('id')
		.single();

	if (speakerError || !speaker)
		throw new Error(`Could not add ${typedName}: ${speakerError?.message}`);

	for (const [index, seatName] of alsoSpeaking.entries()) {
		const { error: entryError } = await admin.from('speakers_list_entries').insert({
			speakers_list_id: list.id,
			seat_id: await seatIdOf(room.committeeId, seatName),
			position: index + 1,
			status: 'waiting'
		});

		if (entryError) throw new Error(`Could not add ${seatName}: ${entryError.message}`);
	}

	await writeRoomState(room, {
		mode: 'single_speaker',
		current_motion_id: null,
		...NO_CAUCUS_CLOCK,
		active_speakers_list_id: list.id,
		current_speaker_entry_id: speaker.id,
		timer_total_seconds: 60,
		timer_ends_at: null,
		timer_paused_remaining_seconds: 60
	});
}

/** Save a show of hands' counts on the room's open vote, as the chair's steppers do. */
export async function countHandsDirectly(
	room: ChairedCommittee,
	counts: { for: number; against: number; abstain: number }
): Promise<void> {
	const admin = createServiceRoleClient();
	const state = await readCommitteeState(room.committeeId);
	const { error } = await admin
		.from('votes')
		.update({ votes_for: counts.for, votes_against: counts.against, votes_abstain: counts.abstain })
		.eq('id', state.current_vote_id ?? '');

	if (error) throw new Error(`Could not count the hands: ${error.message}`);
}

/**
 * Close the room's open vote, as "Close vote" does, and it stays on show: a
 * show of hands keeps the counts the chair saved, a roll call vote is counted
 * from its answers.
 */
export async function closeVoteDirectly(room: ChairedCommittee, hasPassed: boolean): Promise<void> {
	const admin = createServiceRoleClient();
	const voteId = (await readCommitteeState(room.committeeId)).current_vote_id ?? '';
	const { data: answers } = await admin.from('vote_entries').select('choice').eq('vote_id', voteId);
	const choices = (answers ?? []).map((answer) => answer.choice);
	const answerCounts =
		choices.length === 0
			? {}
			: {
					votes_for: choices.filter((choice) => choice === 'for').length,
					votes_against: choices.filter((choice) => choice === 'against').length,
					votes_abstain: choices.filter((choice) => choice === 'abstain').length
				};
	const { error } = await admin
		.from('votes')
		.update({
			...answerCounts,
			status: 'closed',
			passed: hasPassed,
			closed_at: new Date().toISOString()
		})
		.eq('id', voteId);

	if (error) throw new Error(`Could not close the vote: ${error.message}`);
}

/**
 * Suspend the room "for lunch" straight in the database, as passing a suspend
 * motion does: suspended twelve minutes ago, due back in about 41 minutes.
 */
export async function suspendForLunchDirectly(room: ChairedCommittee): Promise<void> {
	const suspendedAt = new Date(Date.now() - 12 * 60 * 1000).toISOString();

	await passMotion(room, {
		committee_id: room.committeeId,
		session_id: await runningSessionId(room),
		kind: 'suspend_meeting',
		topic: 'for lunch',
		decided_at: suspendedAt
	});
	await writeRoomState(room, {
		mode: 'suspended',
		suspended_at: suspendedAt,
		suspended_until: new Date(Date.now() + 41 * 60 * 1000 - 5_000).toISOString(),
		mode_before_suspension: 'formal_debate'
	});
}

/** End the running session straight in the database, as "End session" does. */
export async function endSessionDirectly(room: ChairedCommittee): Promise<void> {
	const admin = createServiceRoleClient();
	const sessionId = await runningSessionId(room);
	const { error } = await admin
		.from('committee_sessions')
		.update({ status: 'ended', ended_at: new Date().toISOString() })
		.eq('id', sessionId);

	if (error) throw new Error(`Could not end the session: ${error.message}`);

	await writeRoomState(room, {
		current_session_id: null,
		mode: 'idle',
		current_motion_id: null,
		current_vote_id: null,
		active_speakers_list_id: null,
		current_speaker_entry_id: null,
		timer_total_seconds: null,
		timer_ends_at: null,
		timer_paused_remaining_seconds: null,
		...NO_CAUCUS_CLOCK,
		suspended_at: null,
		suspended_until: null,
		mode_before_suspension: null
	});
}

/** End the speech in progress, as "End speech" does: the speaker has spoken and nobody has the floor. */
export async function endSpeechDirectly(room: ChairedCommittee): Promise<void> {
	const admin = createServiceRoleClient();
	const state = await readCommitteeState(room.committeeId);
	const { error } = await admin
		.from('speakers_list_entries')
		.update({ status: 'spoken', spoke_seconds: 60, finished_at: new Date().toISOString() })
		.eq('id', state.current_speaker_entry_id ?? '');

	if (error) throw new Error(`Could not end the speech: ${error.message}`);

	await writeRoomState(room, {
		current_speaker_entry_id: null,
		timer_total_seconds: null,
		timer_ends_at: null,
		timer_paused_remaining_seconds: null
	});
}

/** Make the room's open vote a roll call vote with a two-thirds majority, as the set-up can. */
export async function makeRollCallVoteDirectly(room: ChairedCommittee): Promise<void> {
	const admin = createServiceRoleClient();
	const state = await readCommitteeState(room.committeeId);
	const { error } = await admin
		.from('votes')
		.update({ method: 'roll_call', majority: 'two_thirds' })
		.eq('id', state.current_vote_id ?? '');

	if (error) throw new Error(`Could not make the vote a roll call: ${error.message}`);
}

/** Record `seatName`'s answer in the room's roll call vote, as the chair's Y, N or A does. */
export async function answerRollCallDirectly(
	room: ChairedCommittee,
	seatName: string,
	choice: Database['public']['Enums']['vote_choice']
): Promise<void> {
	const admin = createServiceRoleClient();
	const state = await readCommitteeState(room.committeeId);
	const { error } = await admin.from('vote_entries').insert({
		vote_id: state.current_vote_id ?? '',
		seat_id: await seatIdOf(room.committeeId, seatName),
		choice
	});

	if (error) throw new Error(`Could not record ${seatName}'s answer: ${error.message}`);
}

/** Give the committee its topics, as the organiser's committee form does; the agenda is one of them. */
export async function giveTopics(room: ChairedCommittee, topics: string[]): Promise<void> {
	const admin = createServiceRoleClient();
	const { error } = await admin.from('committees').update({ topics }).eq('id', room.committeeId);

	if (error) throw new Error(`Could not give the committee its topics: ${error.message}`);
}
