/**
 * What the chair console's frame works out from the layout's data: the top
 * bar, the attendance chip, the committee menu, the live strip and the mode
 * bar's companions (`05-pages/chair/committee-room.md`, "The frame"). Which
 * view is live, what the mode bar shows and where a press lands are
 * `$lib/live-mode.ts`'s; the keys are `$lib/console-keys.ts`'s.
 *
 * Plain functions with no Svelte in them, so they can be read and tested on
 * their own.
 */

import type { ResolvedPathname } from '$app/types';
import {
	roomFrameAfterPresses,
	speakersAfterPresses,
	type ChairPress,
	type RoomFrame
} from '$lib/chair-form';
import {
	roomState,
	speakingEntry,
	type ChairMotion,
	type CommitteeSession,
	type CommitteeStateView,
	type RoomSpeaker,
	type RoomState,
	type SpeakersListSummary
} from '$lib/chair-room';
import {
	countPresent,
	formatClock,
	nextSpeaker,
	quorum,
	type AttendanceStatus,
	type RoomSeat,
	type TimerSetting
} from '$lib/committee-room';
import { KEY_SHORTCUTS, type KeyTarget } from '$lib/console-keys';
import { formatTimeOfDay } from '$lib/dates';
import { clockButton, clockFace, type ClockButton, type ClockFace } from '$lib/floor-clock';
import { hasCommitteePermission, type MyPermissions } from '$lib/permissions';
import type { InstantPress } from '$lib/instant-form.svelte';
import {
	isLiveStripShown,
	isModeBarShown,
	isSuspendShown,
	modeBarTabs,
	readFromView,
	type ChairPage,
	type ConsoleView,
	type ModeBarTab,
	type RoomMode
} from '$lib/live-mode';
import { latestAttendanceAfterPresses } from '$lib/roll-call-preview';
import { roomFloor, type Floor } from '$lib/room-presses';
import { latestEndedSession } from '$lib/room-ready';
import {
	chairAwardsUrl,
	chairFrameAction,
	chairMotionsSessionUrl,
	chairNotesUrl,
	chairPapersUrl,
	chairResolutionsUrl,
	chairRollCallFromUrl,
	chairRoomUrl,
	committeeDisplayUrl,
	manageConferenceUrl,
	pageWithQuery,
	quickSessionDelegationsUrl
} from '$lib/urls';

/** What the frame knows besides the room itself, all of it from the chair layout's `load`. */
export type FrameFacts = {
	/** Every session of the committee, newest first. */
	sessions: CommitteeSession[];
	/** The conference's own date, `YYYY-MM-DD`, and its timezone. */
	today: string;
	timezone: string;
	/**
	 * Whether anyone has been called to speak in the session. Without it a
	 * current speaker is taken as the sign, since nobody speaks before the
	 * first "Next"; the chair layout reads the real answer (`hasAnyoneSpoken`).
	 */
	hasAnyoneSpoken?: boolean;
};

/**
 * The committee's sessions, newest first, with the frame's own copy of its
 * session in place of the stored one. "End session" lays a copy marked ended
 * over the frame before the server has answered (`endSessionPress`), and this
 * is how the room's state and the top bar see it ended at once. A session
 * the stored list does not have yet goes first, as the newest.
 */
export function sessionsAfterFrame(
	sessions: CommitteeSession[],
	frameSession: CommitteeSession | null
): CommitteeSession[] {
	if (frameSession === null) return sessions;

	const isStored = sessions.some((session) => session.id === frameSession.id);

	if (!isStored) return [frameSession, ...sessions];

	return sessions.map((session) => (session.id === frameSession.id ? frameSession : session));
}

/**
 * Which of the room's five states the room is in (`roomState`), with the
 * presses on their way laid on top. A current speaker counts as someone
 * having spoken, so calling the first speaker ends the opening at the press.
 */
export function frameRoomState(frame: RoomFrame, facts: FrameFacts): RoomState {
	const hasSpeakerNow = frame.committeeState.currentSpeakerEntryId !== null;

	return roomState({
		mode: frame.committeeState.mode,
		currentSession: frame.currentSession,
		sessions: sessionsAfterFrame(facts.sessions, frame.currentSession),
		hasAnyoneSpoken: (facts.hasAnyoneSpoken ?? false) || hasSpeakerNow,
		today: facts.today,
		timezone: facts.timezone
	});
}

/** Whether a session is under way, suspended or not: every state but the lobby and the ended screen. */
export function isSessionInProgress(state: RoomState): boolean {
	return state === 'opening' || state === 'debate' || state === 'suspended';
}

/**
 * Who an organiser is in the top bar, with a link to the conference's
 * dashboard: "Viewing as organiser", or "Chair" when they also chair this
 * committee. Null for a chair who does not organise, who needs neither.
 */
export type ChairRole = {
	label: 'Viewing as organiser' | 'Chair';
	dashboardHref: ResolvedPathname;
};

/**
 * The top bar's role line for this reader (`ChairRole`), or null. A quick
 * session's chair organises it too, but it has no dashboard worth leading to
 * (its conference is never on `/manage`), so its console has no role line.
 */
export function chairRole(
	isOrganiser: boolean,
	isNamedChair: boolean,
	conferenceSlug: string,
	isQuickSession: boolean = false
): ChairRole | null {
	if (!isOrganiser || isQuickSession) return null;

	return {
		label: isNamedChair ? 'Chair' : 'Viewing as organiser',
		dashboardHref: manageConferenceUrl(conferenceSlug)
	};
}

/** What the top bar's attendance chip counts (`AttendanceChip`), less where it links. */
export type FramePresence = {
	/** Seats present at the latest roll call, or null before the session's first one. */
	presentCount: number | null;
	availableSeats: number;
	hasQuorum: boolean;
};

/**
 * Who is present, with the roll call presses still on their way counted in,
 * so the chip counts an answer the moment it is pressed, the session's first
 * one too (`latestAttendanceAfterPresses`). Before the session's first roll
 * call nobody has been counted, which the chip says.
 */
export function framePresence(
	attendance: Record<string, AttendanceStatus>,
	latestRollCallId: string | null,
	rollCallPresses: InstantPress[],
	seatIds: string[]
): FramePresence {
	const availableSeats = seatIds.length;
	const shownAttendance = latestAttendanceAfterPresses(
		attendance,
		latestRollCallId,
		rollCallPresses,
		seatIds
	);

	if (shownAttendance === null) {
		return { presentCount: null, availableSeats, hasQuorum: quorum(0, availableSeats).hasQuorum };
	}

	const presentCount = countPresent(shownAttendance);

	return {
		presentCount,
		availableSeats,
		hasQuorum: quorum(presentCount, availableSeats).hasQuorum
	};
}

/**
 * The attendance chip's words, in three parts so a narrower screen can leave
 * the later ones out: "5/6", " present" (gone on a phone) and " · quorum met"
 * (gone from 1024 px down).
 */
export type AttendanceChipText = {
	/** "5/6", or "Take roll call" before the session's first roll call. */
	count: string;
	/** " present", or nothing before a roll call. */
	word: string;
	/** " · quorum met", " · 1 more needed" or " · no quorum", or nothing before a roll call. */
	detail: string;
	/** A missing quorum once debate has started: a real problem, drawn in the warning tone. */
	isWarning: boolean;
};

/**
 * What the attendance chip says (`committee-room.md`, "Attendance chip").
 * Below quorum during the opening the roll is still being taken, so the chip
 * counts what is still needed in the neutral tone (P4); once debate has
 * started a missing quorum is a real problem and the chip says so in warning.
 */
export function attendanceChipText(
	presence: FramePresence,
	isOpening: boolean
): AttendanceChipText {
	const { presentCount, availableSeats } = presence;

	if (presentCount === null) {
		return { count: 'Take roll call', word: '', detail: '', isWarning: false };
	}

	const count = `${presentCount}/${availableSeats}`;
	const word = ' present';

	if (presence.hasQuorum) return { count, word, detail: ' · quorum met', isWarning: false };

	if (isOpening) {
		const stillNeeded = quorum(presentCount, availableSeats).needed - presentCount;

		return { count, word, detail: ` · ${stillNeeded} more needed`, isWarning: false };
	}

	return { count, word, detail: ' · no quorum', isWarning: true };
}

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

/**
 * How long a session has run, for "Session 1 · 1:12:40": hours, minutes and
 * seconds once it has run an hour, and "12:40" before that, the way the
 * clocks write time. Never below zero, should the browser's clock be behind.
 */
export function sessionRunningTime(startedAt: string, now: Date): string {
	const elapsedMs = now.getTime() - new Date(startedAt).getTime();
	const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));

	if (elapsedSeconds < SECONDS_PER_HOUR) return formatClock(elapsedSeconds);

	const hours = Math.floor(elapsedSeconds / SECONDS_PER_HOUR);
	const minutes = Math.floor((elapsedSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
	const seconds = elapsedSeconds % SECONDS_PER_MINUTE;

	return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** The route every chair page sits under: the live room's own. */
const CHAIR_ROUTE_ID = '/conferences/[slug]/committees/[committeeSlug]/chair';

/**
 * The chair page a route draws, by the name the console gives it, from
 * `page.route.id`: `…/chair` is the live room, `…/chair/motions` the Motions
 * view, `…/chair/notes/sessions/[sessionId]` still Notes. The Speakers page
 * now redirects to the GSL view, so it counts as the GSL. Anything else under
 * the chair is the live room.
 */
export function chairPageOfRoute(routeId: string | null): ChairPage {
	if (routeId === null || !routeId.startsWith(CHAIR_ROUTE_ID)) return 'chair';

	const below = routeId.slice(CHAIR_ROUTE_ID.length);
	const firstFolder = below.split('/')[1] ?? '';

	if (firstFolder === 'speakers') return 'gsl';

	return readFromView(firstFolder);
}

/**
 * The chair pages that still draw the page they had before the console: a
 * header with their own `<h1>`, inside the padding and width every page of
 * the site has. The views the session redesign rebuilds draw edge to edge
 * instead, with the committee's name as their heading. Motions (S6), Vote
 * (S10) and the roll call (S5) left this list when they were rebuilt.
 */
const PAGES_WITH_THEIR_OWN_HEADER: ChairPage[] = ['papers', 'resolutions', 'notes', 'awards'];

/**
 * Whether a chair page draws its own header with its own `<h1>`, inside the
 * page padding. On every other page the top bar's committee name is the
 * `<h1>` and the view runs edge to edge (`committee-room.md`, "Top bar").
 */
export function hasOwnPageHeader(page: ChairPage): boolean {
	return PAGES_WITH_THEIR_OWN_HEADER.includes(page);
}

/** The live room's screens that carry their own `<h1>`: "Security Council", "Suspended", "Session 1 has ended". */
const ROOM_STATES_WITH_THEIR_OWN_HEADING: RoomState[] = ['lobby', 'suspended', 'ended'];

/**
 * Whether the top bar's committee name is the page's `<h1>`. Not on a page
 * with its own header, and not on `chair` while it draws the lobby, the
 * suspended screen or the ended screen, whose own titles are the heading, so
 * a page never has two (`committee-room.md`, "Top bar").
 */
export function isCommitteeNameHeading(page: ChairPage, roomState: RoomState): boolean {
	if (hasOwnPageHeader(page)) return false;

	return !(page === 'chair' && ROOM_STATES_WITH_THEIR_OWN_HEADING.includes(roomState));
}

/**
 * The page the attendance chip's roll call view leads back to. From any page
 * that is the page itself; on the roll call view it is the page the view was
 * opened from, which its address keeps (`?from=gsl`), so pressing the chip
 * there never makes the roll call its own way back.
 */
export function rollCallReturnPage(page: ChairPage, fromInAddress: string | null): ChairPage {
	if (page !== 'roll-call') return page;

	return readFromView(fromInAddress);
}

/**
 * The views the mode bar shows: the ones whose pages exist. S7, S8 and S9
 * added Mod, Unmod and Single speaker, so it is all six now
 * (`committee-room.md`, "Mode bar").
 */
export const BUILT_VIEWS: ConsoleView[] = ['gsl', 'motions', 'mod', 'unmod', 'single', 'voting'];

/**
 * The `aria-keyshortcuts` a tab declares: its number, and M as well on the
 * Motions tab, since M opens Motions from anywhere (`committee-room.md`,
 * "Keys"). A space separates two shortcuts in that attribute.
 */
export function tabKeyShortcuts(tab: Pick<ModeBarTab, 'view' | 'keyShortcut'>): string {
	if (tab.view === 'motions') return `${tab.keyShortcut} ${KEY_SHORTCUTS.motions}`;

	return tab.keyShortcut;
}

/** One line of the committee menu that leads to a page. */
export type CommitteeMenuLink = {
	label: string;
	href: ResolvedPathname;
};

/**
 * Which of the committee menu's own pages the reader may open. The console
 * opens for `run_room`, and each of these asks its own permission in the
 * committee (`docs/roles-and-permissions.md`, section 8), so a co-chair who
 * runs the room alone sees none of them.
 */
export type CommitteeTools = {
	mayReviewPapers: boolean;
	mayWriteNotes: boolean;
	mayProposeAwards: boolean;
};

/** The committee menu's pages this reader may open in this committee (`CommitteeTools`). */
export function committeeToolsFor(mine: MyPermissions, committeeId: string): CommitteeTools {
	return {
		mayReviewPapers: hasCommitteePermission(mine, committeeId, 'review_papers'),
		mayWriteNotes: hasCommitteePermission(mine, committeeId, 'write_chair_notes'),
		mayProposeAwards: hasCommitteePermission(mine, committeeId, 'propose_awards')
	};
}

/**
 * The committee menu's pages (`committee-room.md`, "Committee menu"): Papers,
 * Resolutions, Notes and Awards, opened inside the frame, as far as `tools` lets the reader
 * open them, then the latest ended session's record on the Motions page. The
 * record is left out while no session has ended. A quick session has no
 * awards, and offers "Edit delegations" in their place, the only way to its
 * members on the day a session ends (`chair/quick-session.md`).
 */
export function committeeMenuLinks(
	conferenceSlug: string,
	committeeSlug: string,
	sessions: CommitteeSession[],
	tools: CommitteeTools,
	isQuickSession: boolean = false
): CommitteeMenuLink[] {
	const links: CommitteeMenuLink[] = [];

	if (tools.mayReviewPapers) {
		links.push({ label: 'Papers', href: chairPapersUrl(conferenceSlug, committeeSlug) });
	}

	// Every chair may run the room, so every chair reviews the committee's resolutions.
	links.push({ label: 'Resolutions', href: chairResolutionsUrl(conferenceSlug, committeeSlug) });

	if (tools.mayWriteNotes) {
		links.push({ label: 'Notes', href: chairNotesUrl(conferenceSlug, committeeSlug) });
	}

	if (isQuickSession) {
		links.push({ label: 'Edit delegations', href: quickSessionDelegationsUrl(conferenceSlug) });
	} else if (tools.mayProposeAwards) {
		links.push({ label: 'Awards', href: chairAwardsUrl(conferenceSlug, committeeSlug) });
	}

	const lastEnded = latestEndedSession(sessions);

	if (lastEnded === null) return links;

	const recordHref = chairMotionsSessionUrl(conferenceSlug, committeeSlug, lastEnded.id);

	return [...links, { label: 'Session record', href: recordHref }];
}

/** Where the frame's links go and where its forms post, from the page the chair is on. */
export type ChairFrameLinks = {
	/** The live room, which the live strip's words lead to. */
	roomHref: ResolvedPathname;
	/** The roll call view, naming the page it was opened from (the attendance chip, R). */
	rollCallHref: ResolvedPathname;
	/** The projector's display view, which the top bar's "Display" opens in a new window. */
	displayHref: ResolvedPathname;
	setAgendaAction: string;
	/** A quick session's "Add a topic" in the agenda menu. */
	addTopicAction: string;
	suspendAction: string;
	endSessionAction: string;
	timerStartAction: string;
	timerPauseAction: string;
	timerResumeAction: string;
	timerAddAction: string;
	nextSpeakerAction: string;
};

/**
 * Every address the frame needs on one chair page. Its forms post to the live
 * room's actions with the page the chair is on (`chairFrameAction`), so a
 * press that leaves what the room is doing alone brings them back here. The
 * attendance chip's roll call view leads back to `rollCallFrom`, which is the
 * page itself except on the roll call view (`rollCallReturnPage`).
 */
export function chairFrameLinks(
	conferenceSlug: string,
	committeeSlug: string,
	fromView: ChairPage,
	rollCallFrom: ChairPage = fromView
): ChairFrameLinks {
	const action = (actionName: string) =>
		chairFrameAction(conferenceSlug, committeeSlug, actionName, fromView);

	return {
		roomHref: chairRoomUrl(conferenceSlug, committeeSlug),
		rollCallHref: chairRollCallFromUrl(conferenceSlug, committeeSlug, rollCallFrom),
		displayHref: committeeDisplayUrl(conferenceSlug, committeeSlug),
		setAgendaAction: action('setAgenda'),
		addTopicAction: action('addTopic'),
		suspendAction: action('suspend'),
		endSessionAction: action('endSession'),
		timerStartAction: action('timerStart'),
		timerPauseAction: action('timerPause'),
		timerResumeAction: action('timerResume'),
		timerAddAction: action('timerAdd'),
		nextSpeakerAction: action('nextSpeaker')
	};
}

/** End's own `id`, where the focus goes back to when "Keep going" puts it back. */
export const END_SESSION_ASK_ID = 'end-session-ask';

/**
 * "Keep going"'s `id`, where the focus goes when End asks "End Session 1?"
 * (R12), whether End was pressed in the mode bar or, on a phone, in the
 * committee menu: both open the one confirmation `SessionEndControl` draws.
 */
export const END_SESSION_KEEP_GOING_ID = 'end-session-keep-going';

/**
 * What Suspend and End need, wherever they are drawn: at the right of the
 * mode bar, or in the committee menu on a phone (`SessionEndControl`,
 * `MenuSessionControls`). The layout makes one and hands it to both, since
 * End's confirmation is the same either way; each sends its presses through
 * the chair's instant form itself.
 */
export type SessionControls = {
	/** The session under way, which "End session" ends and "End Session 1?" names. */
	session: CommitteeSession | null;
	/** The room's state as shown, whose clocks Suspend pauses at the press (`suspendPress`). */
	committeeState: CommitteeStateView;
	/** How far the server's clock is ahead of this browser's, for the moment "End session" is pressed. */
	clockOffsetMs: number;
	/** Suspend is left out while suspended: the suspended screen's "Resume session" is the way back. */
	isSuspendShown: boolean;
	/** Whether End's confirmation is drawn in place of Suspend and End. */
	isConfirming: boolean;
	/** The live room's `suspend`, naming the page the chair is on. */
	suspendAction: string;
	/** The live room's `endSession`, which "End session" posts with `confirm=1`. */
	endSessionAction: string;
	/** The page being shown with `?end=confirm`: End without JavaScript. */
	confirmHref: string;
	/** The same page without it: "Keep going" without JavaScript. */
	cancelHref: string;
	/** End was pressed with JavaScript: ask in place. */
	onAskToEnd: () => void;
	/** "Keep going", Escape or "End session" with JavaScript: put End back. */
	onKeepGoing: () => void;
};

/** What `sessionControlsOf` takes besides the frame: the layout's own state and the address. */
export type SessionControlsFacts = {
	clockOffsetMs: number;
	/** Whether End's confirmation is drawn. */
	isConfirming: boolean;
	/** The page being shown, whose address End's links are built from. */
	url: URL;
	onAskToEnd: () => void;
	onKeepGoing: () => void;
};

/**
 * Suspend and End as the frame draws them (`SessionControls`), from what the
 * frame shows with the presses laid on top: End's links are the page being
 * shown with and without `?end=confirm`, which is how End asks without
 * JavaScript.
 */
export function sessionControlsOf(
	shown: ConsoleFrame,
	facts: SessionControlsFacts
): SessionControls {
	return {
		session: shown.frame.currentSession,
		committeeState: shown.frame.committeeState,
		clockOffsetMs: facts.clockOffsetMs,
		isSuspendShown: shown.isSuspendShown,
		isConfirming: facts.isConfirming,
		suspendAction: shown.links.suspendAction,
		endSessionAction: shown.links.endSessionAction,
		confirmHref: pageWithQuery(facts.url, 'end', 'confirm'),
		cancelHref: pageWithQuery(facts.url, 'end', null),
		onAskToEnd: facts.onAskToEnd,
		onKeepGoing: facts.onKeepGoing
	};
}

/** What the live strip is drawn from: the room, its live list and who is present. */
export type LiveStripRoom = {
	mode: RoomMode;
	timer: TimerSetting;
	/** The live list's entries, with the presses on their way laid on top. */
	entries: RoomSpeaker[];
	currentSpeakerEntryId: string | null;
	attendance: Record<string, AttendanceStatus>;
	/** The live list's speaking time, which a speaker with no clock set yet has in full. */
	speakingTimeSeconds: number;
	/** The conference's timezone, for "back at 14:32". */
	timezone: string;
};

/** The live strip's words and clock at one moment. */
export type LiveStripLine = {
	/** "GSL · China · 0:47", "GSL · nobody has the floor", "Unmod · 8:42 left · back at 14:32". */
	text: string;
	/**
	 * The clock its bar draws, the floor's own (`clockFace` in
	 * `$lib/floor-clock.ts`), or null while nobody has the floor.
	 */
	face: ClockFace | null;
};

/** The strip's name for each live mode with a clock. */
const STRIP_MODE_LABELS: Partial<Record<RoomMode, string>> = {
	formal_debate: 'GSL',
	moderated_caucus: 'Mod',
	unmoderated_caucus: 'Unmod',
	single_speaker: 'Single speaker'
};

/** The seat waiting first on the live list whom "Next" or "Call" gives the floor, skipping absent seats. */
export function stripNextSpeaker(room: LiveStripRoom): RoomSpeaker | null {
	return nextSpeaker(room.entries, room.attendance);
}

/**
 * The live strip's words and bar at the moment `now` (`committee-room.md`,
 * "Live strip"): what is live, who has the floor and the clock, or an
 * unmoderated caucus's time left and when it ends.
 */
export function liveStripLine(room: LiveStripRoom, now: Date): LiveStripLine {
	const modeLabel = STRIP_MODE_LABELS[room.mode] ?? '';

	const face = clockFace(room.timer, now, room.speakingTimeSeconds);

	if (room.mode === 'unmoderated_caucus') {
		// An unmoderated caucus stops at zero rather than counting up.
		const secondsLeft = Math.max(0, face.secondsLeft);
		const endsAt = new Date(now.getTime() + secondsLeft * 1000).toISOString();
		const backAt = formatTimeOfDay(endsAt, room.timezone);

		return { text: `${modeLabel} · ${formatClock(secondsLeft)} left · back at ${backAt}`, face };
	}

	const speaker = speakingEntry(room.entries, room.currentSpeakerEntryId);

	if (speaker === null) return { text: `${modeLabel} · nobody has the floor`, face: null };

	return { text: `${modeLabel} · ${speaker.seat.name} · ${formatClock(face.secondsLeft)}`, face };
}

/** The live strip's controls: the clock button, the time button and the live view's primary. */
export type LiveStripControls = {
	clock: ClockButton | null;
	/** "+15 s" for a speech, "+1 min" for an unmoderated caucus, with the seconds it adds. */
	addTime: { label: string; seconds: number } | null;
	/**
	 * The live view's primary, drawn filled: "Next: Brazil", "Call Brazil" or
	 * "End caucus". Null while nobody waits on the list.
	 */
	primary: { label: string; action: 'nextSpeaker' | 'endCaucus' } | null;
};

/** The seconds "+1 min" adds to an unmoderated caucus. */
const UNMOD_ADD_SECONDS = 60;

/** The seconds "+15 s" adds to a speech, the same as the floor's own button. */
const SPEECH_ADD_SECONDS = 15;

/**
 * The live strip's buttons: its clock and time buttons while the clock has
 * someone to time, then the live view's own primary.
 */
export function liveStripControls(room: LiveStripRoom): LiveStripControls {
	if (room.mode === 'unmoderated_caucus') {
		return {
			clock: clockButton(room.timer),
			addTime: { label: '+1 min', seconds: UNMOD_ADD_SECONDS },
			primary: { label: 'End caucus', action: 'endCaucus' }
		};
	}

	const speaker = speakingEntry(room.entries, room.currentSpeakerEntryId);
	const next = stripNextSpeaker(room);
	const verb = speaker === null ? 'Call' : 'Next:';
	const primary =
		next === null ? null : { label: `${verb} ${next.seat.name}`, action: 'nextSpeaker' as const };

	if (speaker === null) return { clock: null, addTime: null, primary };

	return {
		clock: clockButton(room.timer),
		addTime: { label: '+15 s', seconds: SPEECH_ADD_SECONDS },
		primary
	};
}

/** Whether a present seat waits on the live list, which the strip's "Next" or "Call" needs. */
export function hasPresentSeatWaiting(room: LiveStripRoom): boolean {
	return stripNextSpeaker(room) !== null;
}

/** What the chair layout's `load` hands the frame, as much of it as `consoleFrame` reads. */
export type ConsoleData = {
	conference: { slug: string; timezone: string };
	committee: { slug: string; topics: string[]; defaultSpeakingTimeSeconds: number };
	committeeState: CommitteeStateView;
	currentSession: CommitteeSession | null;
	currentMotion: ChairMotion | null;
	/** Every session of the committee, newest first. */
	sessions: CommitteeSession[];
	seats: RoomSeat[];
	/** The current session's latest roll call, keyed by seat id. */
	attendance: Record<string, AttendanceStatus>;
	latestRollCallId: string | null;
	/** The conference's own date, `YYYY-MM-DD`. */
	today: string;
	motionsOnFloorCount: number;
	hasAnyoneSpoken: boolean;
	/** The list the live mode works through, with its entries (`getConsoleFacts`). */
	liveList: { speakersList: SpeakersListSummary | null; speakers: RoomSpeaker[] };
};

/** Everything the console's frame draws, with the presses on their way laid on top. */
export type ConsoleFrame = {
	/** The room's state, session and motion after the presses (`roomFrameAfterPresses`). */
	frame: RoomFrame;
	roomState: RoomState;
	presence: FramePresence;
	links: ChairFrameLinks;
	tabs: ModeBarTab[];
	isModeBarShown: boolean;
	isSuspendShown: boolean;
	/** What the live strip draws, or null while the strip is not drawn. */
	liveStrip: LiveStripRoom | null;
	/** What the strip's clock and "Next" work on (`roomFloor`). */
	floor: Floor;
};

/** Whether a list entry has been called to speak: it is speaking or has spoken. */
function hasBeenCalled(entry: RoomSpeaker): boolean {
	return entry.status === 'speaking' || entry.status === 'spoken';
}

/**
 * Everything the console's frame draws on the chair page `page`, worked out
 * from the layout's data with the chair's presses and the roll call's presses
 * on their way laid on top, so the mode bar's dot, the live strip and the
 * attendance chip move at the press (`committee-room.md`, "Components"). The
 * live room's page works out its state from the same function, so the two
 * never disagree. `fromInAddress` is the address's `?from=`, which on the
 * roll call view says where the chip's roll call leads back to
 * (`rollCallReturnPage`).
 */
export function consoleFrame(
	data: ConsoleData,
	page: ChairPage,
	chairPresses: ChairPress[],
	rollCallPresses: InstantPress[],
	fromInAddress: string | null = null
): ConsoleFrame {
	const shownRoom = { committeeState: data.committeeState, currentSession: data.currentSession };
	const frame = roomFrameAfterPresses(
		{ ...shownRoom, currentMotion: data.currentMotion },
		chairPresses
	);
	const state = frame.committeeState;
	const liveListId = data.liveList.speakersList?.id ?? null;
	const entries = speakersAfterPresses(data.liveList.speakers, liveListId, chairPresses);
	const seatIds = data.seats.map((seat) => seat.id);
	const attendance =
		latestAttendanceAfterPresses(
			data.attendance,
			data.latestRollCallId,
			rollCallPresses,
			seatIds
		) ?? {};
	const hasAnyoneSpoken = data.hasAnyoneSpoken || entries.some(hasBeenCalled);
	const shownState = frameRoomState(frame, {
		...data,
		timezone: data.conference.timezone,
		hasAnyoneSpoken
	});
	const live: LiveStripRoom = {
		mode: state.mode,
		timer: state.timer,
		entries,
		currentSpeakerEntryId: state.currentSpeakerEntryId,
		attendance,
		speakingTimeSeconds:
			data.liveList.speakersList?.speakingTimeSeconds ?? data.committee.defaultSpeakingTimeSeconds,
		timezone: data.conference.timezone
	};
	const isStripShown = isLiveStripShown({
		page,
		mode: state.mode,
		hasSpeaker: speakingEntry(entries, state.currentSpeakerEntryId) !== null,
		hasPresentSeatWaiting: hasPresentSeatWaiting(live)
	});
	const defaultSeconds = data.committee.defaultSpeakingTimeSeconds;

	return {
		frame,
		roomState: shownState,
		presence: framePresence(data.attendance, data.latestRollCallId, rollCallPresses, seatIds),
		links: chairFrameLinks(
			data.conference.slug,
			data.committee.slug,
			page,
			rollCallReturnPage(page, fromInAddress)
		),
		tabs: modeBarTabs({
			page,
			mode: state.mode,
			motionsOnFloorCount: data.motionsOnFloorCount,
			builtViews: BUILT_VIEWS
		}),
		isModeBarShown: isModeBarShown(shownState),
		isSuspendShown: isSuspendShown(shownState),
		liveStrip: isStripShown ? live : null,
		floor: roomFloor(data.liveList.speakersList, entries, state, defaultSeconds)
	};
}

/** Where the "Keyboard shortcuts" switch is remembered in this browser (`localStorage`). */
export const SHORTCUTS_STORAGE_KEY = 'munmeet:chair-keyboard-shortcuts';

/** What the switch stores while the shortcuts are off; anything else, nothing included, is on. */
const SHORTCUTS_OFF_VALUE = 'off';

/** Whether the keyboard shortcuts are on, from what this browser remembered. On until switched off. */
export function readShortcutsSetting(stored: string | null): boolean {
	return stored !== SHORTCUTS_OFF_VALUE;
}

/** What to remember in this browser for the switch's position. */
export function shortcutsSettingValue(isOn: boolean): string {
	return isOn ? 'on' : SHORTCUTS_OFF_VALUE;
}

/**
 * The little of the focused element `keyTargetOf` reads. A DOM `Element` has
 * all of it; taking only this keeps the function testable without a browser.
 */
export type FocusedElement = {
	tagName: string;
	getAttribute: (name: string) => string | null;
	closest: (selector: string) => unknown;
	/** An editable area's flag; an `HTMLElement` has it. */
	isContentEditable?: boolean;
	/** An input's text; other elements have none. */
	value?: unknown;
};

/** The marker the queue's drag handles carry, on which Space picks a row up. */
const DRAG_HANDLE_SELECTOR = '[data-drag-handle]';

/**
 * The facts `shortcutForKeyPress` needs about the element that has the
 * focus, or about the page's body when nothing does. A list's add box is the
 * text field that declares "/", the key that puts the cursor in it.
 */
export function keyTargetOf(element: FocusedElement | null): KeyTarget {
	if (element === null) {
		return {
			tagName: 'BODY',
			role: null,
			inputType: null,
			isContentEditable: false,
			isDragHandle: false,
			isAddBox: false,
			isEmpty: true
		};
	}

	const tagName = element.tagName.toUpperCase();
	const isInput = tagName === 'INPUT';
	const shortcuts = (element.getAttribute('aria-keyshortcuts') ?? '').split(' ');
	const text = typeof element.value === 'string' ? element.value : '';

	return {
		tagName,
		role: element.getAttribute('role'),
		inputType: isInput ? element.getAttribute('type') : null,
		isContentEditable: element.isContentEditable === true,
		isDragHandle: element.closest(DRAG_HANDLE_SELECTOR) !== null,
		isAddBox: isInput && shortcuts.includes(KEY_SHORTCUTS.addBox),
		isEmpty: text === ''
	};
}
