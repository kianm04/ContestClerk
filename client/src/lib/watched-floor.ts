/**
 * The floor of the GSL, a moderated caucus and a single speaker as the people
 * watching the room see it, on the projector (`specs/05-pages/chair/display.md`)
 * and on a delegate's phone (`05-pages/delegate/committee-live.md`): the mode
 * line, who has the floor and the note beside their clock, the next three,
 * the phone's list and the reader's place in it, and the Unmod clock's "Back
 * at". Which screen the room is on is `$lib/room-screen.ts`'s.
 *
 * Plain functions with no Svelte in them, so they can be read and tested on
 * their own.
 */

import { caucusClock, type CaucusClock } from '$lib/caucus-clock';
import { caucusTitle } from '$lib/caucus-view';
import {
	speakingEntry,
	type CommitteeStateView,
	type RoomSpeaker,
	type SpeakersListSummary
} from '$lib/chair-room';
import {
	callableSpeakers,
	clockState,
	dueBackAt,
	type AttendanceStatus,
	type RoomSeat,
	type TimerSetting
} from '$lib/committee-room';
import { formatTimeOfDay } from '$lib/dates';
import { readerWaitText, type ReaderWaitFacts } from '$lib/queue-estimate';
import type { FloorView, ScreenAudience } from '$lib/room-screen';
import { singleSpeakerTitle } from '$lib/single-speaker';

/** How many waiting seats the projector's "Next" line names. */
export const NEXT_SPEAKER_COUNT = 3;

/** What `floorScreenView` reads: the room's state row, its live list and the caucus. */
export type FloorFacts = {
	committeeState: CommitteeStateView;
	/** The live list's entries in `position` order, every status included. */
	speakers: RoomSpeaker[];
	/** The latest roll call of the session, keyed by seat id; empty before one. */
	attendance: Record<string, AttendanceStatus>;
	speakersList: SpeakersListSummary | null;
	/** "Right of reply": a single speaker's purpose, or null. */
	listPurpose: string | null;
	/** The caucus the room runs, whose topic a moderated caucus's title names. */
	currentMotion: { topic: string | null } | null;
	committee: { defaultSpeakingTimeSeconds: number };
};

/** The floor of the GSL, a moderated caucus or a single speaker, as a watcher sees it. */
export type FloorScreenView = {
	/** "General Speakers’ List", "Moderated caucus · {topic}" or "Single speaker · Right of reply". */
	modeTitle: string;
	/** A moderated caucus's own clock, or null in the other two modes. */
	caucus: CaucusClock | null;
	/** Who has the floor, or null when nobody has. */
	speaker: RoomSeat | null;
	/** The speaker's clock, as stored. */
	timer: TimerSetting;
	/** The list's speaking time, shown in full while the speaker's clock is not set. */
	speakingTimeSeconds: number;
	/** "About to speak" before the clock has run, "Paused" while it waits, null while it runs. */
	clockNote: string | null;
	/** The projector's "Next": up to three waiting seats not marked absent. */
	nextSeats: RoomSeat[];
	/** What stands in the speaker's place while nobody has the floor. */
	emptyText: string;
};

/** The mode line above the floor. */
export function floorModeTitle(
	view: FloorView,
	caucusTopic: string | null,
	purpose: string | null
): string {
	if (view === 'mod') return caucusTitle('moderated_caucus', caucusTopic);
	if (view === 'single') return singleSpeakerTitle(purpose);

	// With the typographic apostrophe, as the console's GSL view writes it.
	return 'General Speakers’ List';
}

/**
 * The words beside the projector's clock: "About to speak" for a speaker
 * called whose clock has not started, "Paused" for a clock that has run and
 * stopped, and nothing while it runs, since the moving bar says so.
 */
export function clockNote(timer: TimerSetting): string | null {
	const state = clockState(timer);

	if (state === 'running') return null;

	return state === 'paused' ? 'Paused' : 'About to speak';
}

/** What a watcher reads while nobody has the floor. */
export function emptyFloorText(view: FloorView, audience: ScreenAudience): string {
	if (audience === 'phone') return 'Nobody has the floor';
	if (view === 'mod') return 'Raise your placard to speak';

	return 'The next speaker will be called shortly';
}

/** The next waiting seats "Next" would call, skipping those marked absent: at most three. */
export function nextSeats(
	speakers: RoomSpeaker[],
	attendance: Record<string, AttendanceStatus>
): RoomSeat[] {
	const callable = callableSpeakers(speakers, attendance);

	return callable.slice(0, NEXT_SPEAKER_COUNT).map((entry) => entry.seat);
}

/** Everything the floor of a list mode draws, for the projector or a phone. */
export function floorScreenView(
	facts: FloorFacts,
	view: FloorView,
	audience: ScreenAudience
): FloorScreenView {
	const state = facts.committeeState;
	const speaker = speakingEntry(facts.speakers, state.currentSpeakerEntryId);
	const caucus = view === 'mod' && state.caucusClock ? caucusClock(state.caucusClock) : null;
	const caucusTopic = facts.currentMotion?.topic ?? null;

	return {
		modeTitle: floorModeTitle(view, caucusTopic, facts.listPurpose),
		caucus,
		speaker: speaker?.seat ?? null,
		timer: state.timer,
		speakingTimeSeconds:
			facts.speakersList?.speakingTimeSeconds ?? facts.committee.defaultSpeakingTimeSeconds,
		clockNote: clockNote(state.timer),
		nextSeats: nextSeats(facts.speakers, facts.attendance),
		emptyText: emptyFloorText(view, audience)
	};
}

/** What the reader's wait is worked out from, less the time left on the speech, which ticks. */
export type ReaderWaitBasis = Omit<ReaderWaitFacts, 'speechSecondsLeft'>;

/** What the phone's floor says about the reader. */
export type ReaderOnFloor = {
	/** Whether the reader's own seat has the floor: "You have the floor". */
	isReadersFloor: boolean;
	/** What "You are 2nd · about 3 min" is worked out from, or null for staff watching. */
	readerWait: ReaderWaitBasis | null;
};

/** Whether the reader has the floor, and what their wait is worked out from. */
export function readerOnFloor(
	room: Pick<FloorFacts, 'speakers' | 'attendance'> & { mySeatId: string | null },
	floor: Pick<FloorScreenView, 'speaker' | 'speakingTimeSeconds'>
): ReaderOnFloor {
	if (room.mySeatId === null) return { isReadersFloor: false, readerWait: null };

	return {
		isReadersFloor: floor.speaker?.id === room.mySeatId,
		readerWait: {
			entries: room.speakers,
			attendance: room.attendance,
			seatId: room.mySeatId,
			speakingTimeSeconds: floor.speakingTimeSeconds
		}
	};
}

/**
 * "You are 2nd · about 3 min" at this moment, or null while the reader's
 * seat does not wait (or waits marked absent) and for staff watching.
 * `speechSecondsLeft` is the clock of the speech in progress, null when
 * nobody has the floor.
 */
export function readerPlaceText(
	basis: ReaderWaitBasis | null,
	speechSecondsLeft: number | null
): string | null {
	if (basis === null) return null;

	return readerWaitText({ ...basis, speechSecondsLeft });
}

/** The title of the phone's list under the floor, or null for a single speaker, which shows none. */
export function watchedListTitle(view: FloorView): string | null {
	if (view === 'gsl') return 'Speakers’ list';
	if (view === 'mod') return 'Caucus speakers';

	return null;
}

/** The seats the latest roll call marked absent. */
export function absentSeatIds(attendance: Record<string, AttendanceStatus>): string[] {
	const marks = Object.entries(attendance);

	return marks.filter(([, status]) => status === 'absent').map(([seatId]) => seatId);
}

/**
 * "Back at 14:32" under the Unmod clock, in the conference's timezone: the
 * stored end while the clock runs, so it holds still once the time is up,
 * and now plus the time left while it is paused. Null with no clock set.
 */
export function unmodBackAtText(timer: TimerSetting, now: Date, timezone: string): string | null {
	const due = dueBackAt(timer, now);

	if (due === null) return null;

	return `Back at ${formatTimeOfDay(due.toISOString(), timezone)}`;
}
