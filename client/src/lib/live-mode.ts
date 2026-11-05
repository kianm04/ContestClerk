/**
 * The chair console's six views and how they follow the room: which view is
 * live, what the mode bar shows, when the live strip appears, where each tab
 * links and where a press lands (`specs/05-pages/chair/committee-room.md`,
 * "Mode bar", "Live strip" and "Viewing is not the same as going live").
 *
 * Two things are kept apart here. The view a chair has open is the address,
 * and changes nothing for anyone else. The live view is what the room is
 * doing, which `committee_state.mode` says, and which delegates and the
 * projector follow.
 *
 * Plain functions with no Svelte in them, so they can be read and tested on
 * their own. Turning a page into an address is `$lib/urls.ts`'s job.
 */

import type { CommitteeMode, MotionKind } from '$lib/committee-room';

/** The six views of the mode bar, each named as its route is: `chair/gsl`, `chair/voting`, … */
export type ConsoleView = 'gsl' | 'motions' | 'mod' | 'unmod' | 'single' | 'voting';

/** The views a mode draws. Motions is a view, never a mode, so it is never live. */
export type LiveView = Exclude<ConsoleView, 'motions'>;

/**
 * Every chair page a press can come from or land on: `chair` (the live room),
 * one of the six views, or one of the pages that open inside the frame.
 */
export type ChairPage =
	'chair' | ConsoleView | 'roll-call' | 'papers' | 'resolutions' | 'notes' | 'awards';

/**
 * The room's state as `roomState` names it from the session redesign on (S3
 * renames today's `ready` to `lobby` and `running` to `debate`).
 */
export type ConsoleRoomState = 'lobby' | 'opening' | 'debate' | 'suspended' | 'ended';

/**
 * What the room is doing. `single_speaker` joins the database's
 * `committee_mode` with D5 (S9); it is named here as well so this file reads
 * the same before and after that migration.
 */
export type RoomMode = CommitteeMode | 'single_speaker';

/** The Lucide icon drawn above a tab's label, by its Lucide name. */
export type ConsoleViewIcon =
	'list-ordered' | 'hand' | 'messages-square' | 'users' | 'mic' | 'vote';

/** One view as the mode bar names it. */
export type ConsoleViewDetails = {
	view: ConsoleView;
	/** "Single speaker". */
	label: string;
	/** "Single": the label on a phone, where the six tabs share the width. */
	shortLabel: string;
	icon: ConsoleViewIcon;
	/** The key that opens the view, "1" to "6", which its tab declares in `aria-keyshortcuts`. */
	keyShortcut: string;
};

/** One tab of the mode bar, ready to draw. */
export type ModeBarTab = ConsoleViewDetails & {
	/** Where the tab links: `chair` for the live view, the view's own route for any other. */
	route: ChairPage;
	/** The view the chair is looking at, drawn with `aria-current="page"`. */
	isSelected: boolean;
	/** The view the room is in, drawn with the live dot. */
	isLive: boolean;
	/** "Motions 2": the motions on the floor, on the Motions tab only, and only when there are some. */
	count: number | null;
};

/** What the mode bar is drawn from. */
export type ModeBarFacts = {
	/** The chair page being drawn. */
	page: ChairPage;
	mode: RoomMode;
	/** How many of the session's motions are still proposed. */
	motionsOnFloorCount: number;
	/**
	 * The views whose pages exist. Until S7, S8 and S9 build theirs, the bar
	 * shows only GSL, Motions and Vote. Every view when left out.
	 */
	builtViews?: ConsoleView[];
};

/** What decides whether the live strip is drawn under the top bar. */
export type LiveStripFacts = {
	/** The chair page being drawn. */
	page: ChairPage;
	mode: RoomMode;
	/** Whether someone has the floor on the live list. */
	hasSpeaker: boolean;
	/** Whether a seat not marked absent waits on the live list, so "Next" or "Call" has someone. */
	hasPresentSeatWaiting: boolean;
};

/** The hidden field the frame's forms send, naming the page the chair pressed on. */
export const FROM_VIEW_FIELD = 'fromView';

/** The six views in myMUN's order, which is the mode bar's order and the order of keys 1 to 6. */
export const CONSOLE_VIEWS: ConsoleViewDetails[] = [
	{ view: 'gsl', label: 'GSL', shortLabel: 'GSL', icon: 'list-ordered', keyShortcut: '1' },
	{ view: 'motions', label: 'Motions', shortLabel: 'Motions', icon: 'hand', keyShortcut: '2' },
	{ view: 'mod', label: 'Mod', shortLabel: 'Mod', icon: 'messages-square', keyShortcut: '3' },
	{ view: 'unmod', label: 'Unmod', shortLabel: 'Unmod', icon: 'users', keyShortcut: '4' },
	{ view: 'single', label: 'Single speaker', shortLabel: 'Single', icon: 'mic', keyShortcut: '5' },
	{ view: 'voting', label: 'Vote', shortLabel: 'Vote', icon: 'vote', keyShortcut: '6' }
];

/**
 * The view each mode draws. `idle` and `suspended` are not here: they are
 * states of the room (no session, or a pause), and no view is live in them.
 */
const LIVE_VIEW_OF_MODE: Partial<Record<RoomMode, LiveView>> = {
	formal_debate: 'gsl',
	moderated_caucus: 'mod',
	unmoderated_caucus: 'unmod',
	single_speaker: 'single',
	voting: 'voting'
};

/** The motions whose passing changes what the room is doing, and so takes the chair to `chair`. */
const MOTION_KINDS_THAT_MOVE_THE_ROOM: MotionKind[] = [
	'moderated_caucus',
	'unmoderated_caucus',
	'suspend_meeting',
	'adjourn_meeting',
	'close_debate'
];

/** Every chair page, for reading the `fromView` field. */
const CHAIR_PAGES: ChairPage[] = [
	'chair',
	'gsl',
	'motions',
	'mod',
	'unmod',
	'single',
	'voting',
	'roll-call',
	'papers',
	'resolutions',
	'notes',
	'awards'
];

/** Whether a chair page is one of the six views, rather than `chair` or a page inside the frame. */
function isConsoleView(page: ChairPage): page is ConsoleView {
	return CONSOLE_VIEWS.some((details) => details.view === page);
}

/** The view a mode draws, or null while no view is live (no session running, or suspended). */
export function liveView(mode: RoomMode): LiveView | null {
	return LIVE_VIEW_OF_MODE[mode] ?? null;
}

/**
 * The view the mode bar marks as selected. On `chair` that is the live view,
 * since `chair` draws it; on a view's own route, that view. On the roll call,
 * Papers, Notes and Awards no tab is selected, and none on `chair` while no
 * view is live.
 */
export function selectedView(page: ChairPage, live: LiveView | null): ConsoleView | null {
	if (page === 'chair') return live;
	if (isConsoleView(page)) return page;

	return null;
}

/** Where a tab links: the live view's tab to `chair`, every other tab to its own route. */
export function tabRoute(view: ConsoleView, live: LiveView | null): ChairPage {
	return view === live ? 'chair' : view;
}

/** Whether the mode bar is drawn. In the lobby and on the ended screen there is no session to run. */
export function isModeBarShown(roomState: ConsoleRoomState): boolean {
	return roomState !== 'lobby' && roomState !== 'ended';
}

/**
 * Whether the mode bar draws Suspend. Not while suspended, because the
 * suspended screen's "Resume session" is the way back; End stays either way.
 */
export function isSuspendShown(roomState: ConsoleRoomState): boolean {
	return roomState === 'opening' || roomState === 'debate';
}

/** The mode bar's tabs in order, each with where it links, whether it is selected or live, and its count. */
export function modeBarTabs(facts: ModeBarFacts): ModeBarTab[] {
	const live = liveView(facts.mode);
	const selected = selectedView(facts.page, live);
	const builtViews = facts.builtViews ?? CONSOLE_VIEWS.map((details) => details.view);
	const shownViews = CONSOLE_VIEWS.filter((details) => builtViews.includes(details.view));

	return shownViews.map((details) => {
		const hasCount = details.view === 'motions' && facts.motionsOnFloorCount > 0;

		return {
			...details,
			route: tabRoute(details.view, live),
			isSelected: details.view === selected,
			isLive: details.view === live,
			count: hasCount ? facts.motionsOnFloorCount : null
		};
	});
}

/**
 * Whether the live strip is drawn: the chair looks at a page that is not the
 * live view, and the live view has a clock to keep in reach. The GSL, a Mod
 * or a single speaker has one while someone has the floor or a present seat
 * waits; an Unmod always has one. Never for a vote, while suspended, or on
 * `chair`, which already draws the live view.
 */
export function isLiveStripShown(facts: LiveStripFacts): boolean {
	const live = liveView(facts.mode);

	if (facts.page === 'chair' || live === null || live === 'voting') return false;
	if (facts.page === live) return false;
	if (live === 'unmod') return true;

	return facts.hasSpeaker || facts.hasPresentSeatWaiting;
}

/**
 * Where "Pass" in Motions sends the chair: to `chair` when the motion changes
 * what the room is doing (a caucus, a suspension, adjourning, closing debate),
 * and otherwise back to Motions (an extension, a document, any other motion).
 */
export function motionPassLanding(kind: MotionKind): ChairPage {
	return MOTION_KINDS_THAT_MOVE_THE_ROOM.includes(kind) ? 'chair' : 'motions';
}

/**
 * The page the `fromView` field (or the roll call's `?from=`) names, or
 * `chair` when it names none, so a field that was tampered with or left out
 * sends the chair to the live room.
 */
export function readFromView(value: FormDataEntryValue | null): ChairPage {
	const page = CHAIR_PAGES.find((candidate) => candidate === value);

	return page ?? 'chair';
}
