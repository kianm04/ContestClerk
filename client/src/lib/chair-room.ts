/**
 * The chair's side of the committee room: the shapes its pages are drawn from,
 * the room's state, the sentences its buttons answer with, and the readings of
 * its form fields.
 *
 * `specs/05-pages/chair/committee-room.md` describes the pages. The rules of
 * the room itself — quorum, the timer's arithmetic, the next speaker — are in
 * `$lib/committee-room.ts`, which the delegate's live view shares. Fetching and
 * writing is `$lib/server/committee-room.ts`'s job. Nothing here talks to
 * Supabase, so the components can import it too.
 */

import type { CaucusClockSetting } from '$lib/caucus-clock';
import type {
	AttendanceStatus,
	CommitteeMode,
	MotionKind,
	RoomSeat,
	SpeakerEntry,
	TimerSetting
} from '$lib/committee-room';
import type { Database } from '$lib/database.types';
import { dayInTimezone, daysBetween, formatDayAndMonth, formatTimeOfDay } from '$lib/dates';
import { liveView, type ConsoleRoomState, type LiveView, type RoomMode } from '$lib/live-mode';

type RoomEnums = Database['public']['Enums'];

/** Where a session has got to: `scheduled`, `in_progress` or `ended`. */
export type SessionStatus = RoomEnums['session_status'];

/** Where a motion has got to, such as `passed`. */
export type MotionStatus = RoomEnums['motion_status'];

/** Whether a vote is still open. */
export type VoteStatus = RoomEnums['vote_status'];

/** The conference, with only what the chair pages show of it. */
export type ChairConference = {
	id: string;
	slug: string;
	name: string;
	/** An IANA name such as `Europe/Amsterdam`. */
	timezone: string;
};

/** The committee being chaired. */
export type ChairCommittee = {
	id: string;
	slug: string;
	name: string;
	/** "UNSC", or null when the committee has no short name. */
	abbreviation: string | null;
	/** "Committee Room 1", or null. */
	room: string | null;
	/** The seconds each speaker gets on a new General Speakers' List. */
	defaultSpeakingTimeSeconds: number;
	/** The topics the committee debates, in the organiser's order. The agenda is one of them. */
	topics: string[];
};

/** One block of committee time. */
export type CommitteeSession = {
	id: string;
	name: string;
	status: SessionStatus;
	startedAt: string | null;
	endedAt: string | null;
};

/** The committee's one `committee_state` row: what every screen in the room mirrors. */
export type CommitteeStateView = {
	currentSessionId: string | null;
	mode: CommitteeMode;
	/** The caucus being run. */
	currentMotionId: string | null;
	activeSpeakersListId: string | null;
	currentSpeakerEntryId: string | null;
	currentVoteId: string | null;
	/** The topic under debate, one of the committee's `topics`, or null while the agenda is not set. */
	agendaTopic: string | null;
	timer: TimerSetting;
	/*
		The four below are always read (`readCommitteeState`). They are optional
		only so the many test rooms written before the caucus clock (D4) and the
		suspension (D6) need not spell them out; a reader treats a missing one as
		empty.
	*/
	/** A moderated caucus's own clock (D4), every part null outside one (`$lib/caucus-clock.ts`). */
	caucusClock?: CaucusClockSetting;
	/** When the room was suspended, while it is (D6). */
	suspendedAt?: string | null;
	/** When the suspended room is due back, or null while no return time is set. */
	suspendedUntil?: string | null;
	/** The mode "Resume session" puts back, while the room is suspended. */
	modeBeforeSuspension?: CommitteeMode | null;
};

/**
 * What the chair layout loads for every chair page: the state, the sessions,
 * the seats and the attendance of the latest roll call.
 */
export type ChairRoomFrame = {
	committeeState: CommitteeStateView;
	/** Every session of the committee, newest first. */
	sessions: CommitteeSession[];
	/** The session `committeeState.currentSessionId` points at, or null. */
	currentSession: CommitteeSession | null;
	/** The caucus `committeeState.currentMotionId` points at, which the mode banner names. */
	currentMotion: ChairMotion | null;
	/** Every seat the committee offers, in display order. */
	seats: RoomSeat[];
	/** The latest roll call of the current session, keyed by seat id. Empty before one. */
	attendance: Record<string, AttendanceStatus>;
	/** That roll call's id, or null. Realtime watches its entries. */
	latestRollCallId: string | null;
};

/** A speakers list, without its entries. */
export type SpeakersListSummary = {
	id: string;
	name: string;
	speakingTimeSeconds: number;
	isOpen: boolean;
};

/** One entry of a speakers list, with the seat it is for. */
export type RoomSpeaker = SpeakerEntry & {
	seat: RoomSeat;
};

/** A motion, with what the room page shows of it. */
export type ChairMotion = {
	id: string;
	kind: MotionKind;
	status: MotionStatus;
	topic: string | null;
	totalTimeSeconds: number | null;
	speakingTimeSeconds: number | null;
	/** The seat that proposed it, or null when the chair did. */
	proposedBySeatName: string | null;
	votesFor: number | null;
	votesAgainst: number | null;
	createdAt: string;
};

/** The vote the room is on, with what the room page shows of it. */
export type ChairVote = {
	id: string;
	subject: string | null;
	status: VoteStatus;
};

/** What the room page's own `load` adds to the layout's frame. */
export type CommitteeRoom = {
	/** The active speakers list, or null when none is. */
	speakersList: SpeakersListSummary | null;
	/** Its entries, in `position` order, every status included. */
	speakers: RoomSpeaker[];
	currentVote: ChairVote | null;
	/** The last three motions of the current session, newest first. */
	recentMotions: ChairMotion[];
};

/** The seconds "+15s" adds when the form sends no number of its own. */
export const TIMER_ADD_SECONDS = 15;

/** The longest timer a chair may start or add to, in seconds: one hour. */
const MAX_TIMER_SECONDS = 3600;

/** The longest topic a quick session's "Add a topic" takes, as long as its agenda (`LONGEST_AGENDA`). */
export const NEW_TOPIC_MAX_LENGTH = 200;

/**
 * The most topics a committee may have. The `committees_topics_bounded` check
 * refuses a fifty-first, so "Add a topic" says so in a sentence first.
 */
export const MOST_COMMITTEE_TOPICS = 50;

/**
 * The longest name a chair may give a session. "Session II" or "Opening
 * ceremony" is the usual length; 120 is generous, and the `committee_sessions`
 * table checks the same bound.
 */
export const SESSION_NAME_MAX_LENGTH = 120;

/** The sentences the room's actions answer with when they refuse. */
export const ROOM_REFUSALS = {
	sessionRunning: 'End the current session before starting a new one.',
	noSessionRunning: 'No session is running.',
	yieldSeat: 'Choose a present seat to yield to.',
	nobodySpeaking: 'Nobody is speaking.',
	noSpeakersList: 'There is no speakers list open.',
	timerSeconds: 'Choose a time between 1 second and 60 minutes.',
	timerNotRunning: 'The timer is not running.',
	timerNotPaused: 'The timer is not paused.',
	noTimer: 'There is no timer to change.',
	agendaTopic: "Choose one of the committee's topics.",
	newTopicEmpty: 'Type the topic to add.',
	newTopicTooLong: `Keep the topic under ${NEW_TOPIC_MAX_LENGTH} characters.`,
	tooManyTopics: `This committee already has ${MOST_COMMITTEE_TOPICS} topics, the most it can hold.`,
	sessionNameTooLong: `Keep the session name under ${SESSION_NAME_MAX_LENGTH} characters.`,
	topicsElsewhere: 'Add topics on the committee’s page in the organiser area.'
} as const;

/** Whether the room has a session running, which every button but "Start session" needs. */
export function isSessionRunning(session: CommitteeSession | null): boolean {
	return session?.status === 'in_progress';
}

/** The dates of the conference that session names and the room's state are counted from. */
export type ConferenceDays = {
	/** The conference's first day, `YYYY-MM-DD`. */
	startDate: string;
	/** An IANA name such as `Europe/Amsterdam`, in which the days are counted. */
	timezone: string;
};

/** The day a session started on in the conference's timezone, or null if it never started. */
function startedOnDay(session: CommitteeSession, timezone: string): string | null {
	if (session.startedAt === null) return null;

	return dayInTimezone(new Date(session.startedAt), timezone);
}

/**
 * The name a new session gets when the chair types none.
 *
 * Before the conference's first day it is a practice session: "Practice
 * session", then "Practice session 2", and so on. From the first day on it is
 * "Session {n}", counting only the sessions started on or after that day, so
 * the first real session is "Session 1" however many practice sessions came
 * before it. `today` is the conference's own date, `YYYY-MM-DD`.
 */
export function defaultSessionName(
	sessions: CommitteeSession[],
	conference: ConferenceDays,
	today: string
): string {
	const startDays = sessions
		.map((session) => startedOnDay(session, conference.timezone))
		.filter((day) => day !== null);

	// `YYYY-MM-DD` days sort as text in date order, so `<` compares them as dates.
	if (today < conference.startDate) {
		const practiceCount = startDays.filter((day) => day < conference.startDate).length;

		return practiceCount === 0 ? 'Practice session' : `Practice session ${practiceCount + 1}`;
	}

	const sessionCount = startDays.filter((day) => day >= conference.startDate).length;

	return `Session ${sessionCount + 1}`;
}

/**
 * The five states the room can be in (`committee-room.md`, "The room's
 * states"): `lobby`, `opening`, `debate`, `suspended` and `ended`. The session
 * redesign renamed today's `ready` and `running` (S3); `$lib/live-mode.ts`
 * names the same five for the mode bar.
 */
export type RoomState = ConsoleRoomState;

/** What `roomState` reads to decide which of the five states the room is in. */
export type RoomStateFacts = {
	mode: CommitteeMode;
	/** The session the room points at, or null. */
	currentSession: CommitteeSession | null;
	/** Every session of the committee, newest first. */
	sessions: CommitteeSession[];
	/** Whether anyone has been called to speak in the current session. */
	hasAnyoneSpoken: boolean;
	/** The conference's own date, `YYYY-MM-DD`, and its timezone. */
	today: string;
	timezone: string;
};

/** Whether the committee's latest session ended on `today` in the conference's timezone. */
function hasLatestSessionEndedToday(facts: RoomStateFacts): boolean {
	const latest = facts.sessions[0];

	if (latest === undefined || latest.status !== 'ended' || latest.endedAt === null) return false;

	return dayInTimezone(new Date(latest.endedAt), facts.timezone) === facts.today;
}

/**
 * Which of the five states the room is in, as the table in
 * `committee-room.md` defines them. The live room, `chair`, draws that
 * state's screen.
 *
 * "Today" is the conference's own date, so the morning after a session ended
 * the room is in the lobby again rather than on the ended screen.
 *
 * The opening ends only when the first speaker is called (S5): until then the
 * opening band stays above the GSL, so a chair can still correct the roll or
 * the agenda after both are done, and nothing blocks calling a speaker first.
 */
export function roomState(facts: RoomStateFacts): RoomState {
	if (!isSessionRunning(facts.currentSession)) {
		return hasLatestSessionEndedToday(facts) ? 'ended' : 'lobby';
	}

	if (facts.mode === 'suspended') return 'suspended';

	return facts.hasAnyoneSpoken ? 'debate' : 'opening';
}

/**
 * What the live room, `chair`, draws: one of the room's own screens, or the
 * view of the mode the room is in (`committee-room.md`, "The room's states").
 * `opening` is the GSL view with the opening band above it.
 */
export type LiveRoomScreen = 'lobby' | 'opening' | 'suspended' | 'ended' | LiveView;

/**
 * The one screen `chair` draws for the room's state and mode. In the opening
 * and in debate it is the live mode's view; the opening band sits over the
 * GSL only, so an opening in any other mode draws that mode's view.
 */
export function liveRoomScreen(state: RoomState, mode: RoomMode): LiveRoomScreen {
	if (state === 'lobby' || state === 'suspended' || state === 'ended') return state;

	// A session in progress always has a mode with a view; formal debate is the fallback.
	const view = liveView(mode) ?? 'gsl';

	if (state === 'opening' && view === 'gsl') return 'opening';

	return view;
}

/**
 * "Session 2 has been running since yesterday, 16:40.", the one neutral line
 * `chair` shows over a session left in progress overnight, or null for one
 * that started today. An older one names its day: "since 14 Feb, 16:40".
 * `today` is the conference's own date, `YYYY-MM-DD`, in `timezone`.
 */
export function runningSinceText(
	session: CommitteeSession | null,
	today: string,
	timezone: string
): string | null {
	if (session === null || !isSessionRunning(session) || session.startedAt === null) return null;

	const startDay = dayInTimezone(new Date(session.startedAt), timezone);
	const daysAgo = daysBetween(startDay, today);

	if (daysAgo < 1) return null;

	const day = daysAgo === 1 ? 'yesterday' : formatDayAndMonth(session.startedAt, timezone);
	const time = formatTimeOfDay(session.startedAt, timezone);

	return `${session.name} has been running since ${day}, ${time}.`;
}

/** A whole number read from a form field, or null when the field holds anything else. */
function readWholeNumber(value: FormDataEntryValue | null): number | null {
	if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null;

	return Number(value.trim());
}

/**
 * The topic the "Set agenda" form sent, or null when it is not one of the
 * committee's `topics`. The topic has to match exactly, because the database
 * refuses anything else (`check_committee_agenda_topic`).
 */
export function readAgendaTopic(value: FormDataEntryValue | null, topics: string[]): string | null {
	if (typeof value !== 'string') return null;

	return topics.includes(value) ? value : null;
}

/**
 * The topic a quick session's "Add a topic" sent (`chair/quick-session.md`):
 * trimmed, and at most `NEW_TOPIC_MAX_LENGTH` characters, or the sentence it
 * is refused with. A topic the committee already has is still a topic: the
 * action then only sets it as the agenda.
 */
export function readNewTopic(
	value: FormDataEntryValue | null
): { topic: string } | { refusal: string } {
	const topic = typeof value === 'string' ? value.trim() : '';

	if (topic === '') return { refusal: ROOM_REFUSALS.newTopicEmpty };
	if (topic.length > NEW_TOPIC_MAX_LENGTH) return { refusal: ROOM_REFUSALS.newTopicTooLong };

	return { topic };
}

/**
 * Whether adding `topic` would give the committee more than
 * `MOST_COMMITTEE_TOPICS`. A topic it already has adds nothing, so it never would.
 */
export function isPastTopicLimit(topics: string[], topic: string): boolean {
	return !topics.includes(topic) && topics.length >= MOST_COMMITTEE_TOPICS;
}

/**
 * The seconds a timer button sent, or null when they are not 1 to 3600. An
 * empty field answers `fallback`, which is how "+15s" works with no number.
 */
export function readTimerSeconds(
	value: FormDataEntryValue | null,
	fallback: number | null = null
): number | null {
	if (value === null || value === '') return fallback;

	const seconds = readWholeNumber(value);

	if (seconds === null || seconds < 1 || seconds > MAX_TIMER_SECONDS) return null;

	return seconds;
}

/**
 * The seats a speaker may yield to: every seat that is not marked absent at the
 * latest roll call. Before the first roll call nobody is marked, so every seat
 * counts as present.
 */
export function presentSeats(
	seats: RoomSeat[],
	attendance: Record<string, AttendanceStatus>
): RoomSeat[] {
	return seats.filter((seat) => attendance[seat.id] !== 'absent');
}

/** The seats a speaker in `speakingSeatId` may yield to: present, and not their own. */
export function yieldCandidates(
	seats: RoomSeat[],
	attendance: Record<string, AttendanceStatus>,
	speakingSeatId: string | null
): RoomSeat[] {
	return presentSeats(seats, attendance).filter((seat) => seat.id !== speakingSeatId);
}

/** The entry that has the floor, or null when nobody does. */
export function speakingEntry(
	speakers: RoomSpeaker[],
	currentEntryId: string | null
): RoomSpeaker | null {
	if (currentEntryId === null) return null;

	return speakers.find((speaker) => speaker.id === currentEntryId) ?? null;
}
