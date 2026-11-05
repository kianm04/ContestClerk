/**
 * The chair console's keys (`specs/05-pages/chair/committee-room.md`, "Keys",
 * and `03-design/session-redesign/screens.md` §15): which key belongs to which
 * button, which key wins when a view and the frame both have a meaning for it,
 * and when a key press must be left alone.
 *
 * `ShortcutKeys` listens on the window. For each key press it hands this file
 * plain facts about the press and gets back the `aria-keyshortcuts` value of
 * the button to press, or null. It then clicks the enabled element that
 * declares that value, so a key goes through its button's own form exactly
 * as a click does. Nothing here touches the page, so the rules can be read and
 * tested without a browser.
 */

import type { AttendanceStatus } from '$lib/committee-room';
import {
	CONSOLE_VIEWS,
	selectedView,
	type ChairPage,
	type ConsoleView,
	type LiveView
} from '$lib/live-mode';

/**
 * The `aria-keyshortcuts` value each button with a key declares. The space bar
 * and the plus sign are written "Space" and "Plus", as WAI-ARIA asks, because
 * a space and a "+" separate the shortcuts inside that attribute.
 */
export const KEY_SHORTCUTS = {
	clock: 'Space',
	next: 'N',
	endSpeech: 'E',
	addTime: 'Plus',
	addBox: '/',
	rollCall: 'R',
	motions: 'M',
	keyList: '?',
	close: 'Escape',
	yes: 'Y',
	no: 'N',
	abstain: 'A',
	pass: 'P',
	absent: 'A',
	present: 'P',
	presentAndVoting: 'V'
} as const;

/** The key each roll call answer declares on the marked row, which the console's keys press. */
export const ROLL_CALL_ANSWER_KEYS: Record<AttendanceStatus, string> = {
	absent: KEY_SHORTCUTS.absent,
	present: KEY_SHORTCUTS.present,
	present_and_voting: KEY_SHORTCUTS.presentAndVoting
};

/**
 * The view whose own keys apply to a press: the view the chair has selected,
 * the roll call, or null on a page with no keys of its own (Papers, Notes,
 * Awards, and `chair` while no view is live).
 */
export type KeyView = ConsoleView | 'roll-call' | null;

/** What the browser says about the element that has the focus when a key is pressed. */
export type KeyTarget = {
	/** The element's tag name, such as "INPUT", "BUTTON" or "BODY", in either case. */
	tagName: string;
	/** Its `role` attribute, or null when it has none. */
	role: string | null;
	/** An input's `type` attribute ("text", "number", "radio"), or null for any other element. */
	inputType: string | null;
	/** Whether it is an editable area (`contenteditable`). */
	isContentEditable: boolean;
	/** Whether it is a queue row's drag handle, on which Space picks the row up. */
	isDragHandle: boolean;
	/** Whether it is a list's add box, whose empty search lets Space through to the clock. */
	isAddBox: boolean;
	/** Whether the text field holds no text. */
	isEmpty: boolean;
};

/** One key press, as plain facts. */
export type KeyPress = {
	/** `KeyboardEvent.key`: " ", "n", "N", "+", "Escape", … */
	key: string;
	/**
	 * Whether Ctrl, Cmd or Alt was held, which leaves the browser's own
	 * shortcuts alone. Shift does not count: "?" and "+" need it on many
	 * keyboards.
	 */
	hasModifier: boolean;
	/** Whether another handler already acted on the press (`event.defaultPrevented`). */
	isAlreadyHandled: boolean;
	target: KeyTarget;
	view: KeyView;
	/** Whether a roll call vote is open, which makes Y, N, A and P answer it on the Vote view. */
	isRollCallVoteOpen: boolean;
	/** The committee menu's "Keyboard shortcuts" switch. Off, only Space and Escape act here. */
	areShortcutsOn: boolean;
};

/** The button a key press should press. */
export type KeyMatch = {
	/** The `aria-keyshortcuts` value to look for. */
	shortcut: string;
	/**
	 * False for a key that is the view's own (N is "No" in a roll call vote,
	 * never Next), which only an element inside the view may answer. True for
	 * a key of the whole console, looked for in the view first and then in the
	 * frame.
	 */
	searchesFrame: boolean;
};

/** One row of the list of keys the committee menu and "?" show. */
export type KeyListRow = {
	keys: string;
	where: string;
	does: string;
};

/** The list of keys, as the committee menu's "Keyboard shortcuts" shows it. */
export const KEY_LIST: KeyListRow[] = [
	{ keys: 'Space', where: 'anywhere', does: 'Start, pause or resume the live clock' },
	{
		keys: 'N',
		where: 'anywhere but a roll call vote',
		does: 'Next speaker, or call the first waiting'
	},
	{ keys: 'E', where: 'anywhere', does: 'End speech' },
	{
		keys: '+',
		where: 'anywhere',
		does: 'Add time: 15 s to a speech, 1 min to an unmoderated caucus'
	},
	{
		keys: '/',
		where: 'GSL, Mod, Unmod, Single speaker',
		does: "Put the cursor in the list's add box"
	},
	{ keys: '1 to 6', where: 'anywhere', does: 'GSL, Motions, Mod, Unmod, Single speaker, Vote' },
	{ keys: 'R', where: 'anywhere', does: 'Roll call' },
	{ keys: 'M', where: 'anywhere', does: 'Motions, with the cursor in "Raised by"' },
	{ keys: '?', where: 'anywhere', does: 'Open the committee menu at its list of keys' },
	{ keys: 'A, P, V', where: 'roll call', does: 'Absent, present, present and voting' },
	{ keys: 'Y, N, A, P', where: 'roll call vote', does: 'Yes, no, abstain, pass' },
	{
		keys: 'Escape',
		where: 'anywhere',
		does: "Close a menu or End's confirmation, cancel a drag, leave the add box"
	}
];

/**
 * The keys of the whole console, besides Space and Escape: they act from every
 * chair page. The mode bar's tabs add 1 to 6 (`CONSOLE_VIEWS`).
 */
const CONSOLE_SHORTCUTS: string[] = [
	KEY_SHORTCUTS.next,
	KEY_SHORTCUTS.endSpeech,
	KEY_SHORTCUTS.addTime,
	KEY_SHORTCUTS.rollCall,
	KEY_SHORTCUTS.motions,
	KEY_SHORTCUTS.keyList,
	...CONSOLE_VIEWS.map((details) => details.keyShortcut)
];

/** The views with a list and its add box, where "/" puts the cursor in the box. */
const LIST_VIEWS: KeyView[] = ['gsl', 'mod', 'unmod', 'single'];

/** The keys that answer a roll call vote, on the row the focus marker is on. */
const ROLL_CALL_VOTE_SHORTCUTS: string[] = [
	KEY_SHORTCUTS.yes,
	KEY_SHORTCUTS.no,
	KEY_SHORTCUTS.abstain,
	KEY_SHORTCUTS.pass
];

/**
 * The roll call's A, P and V. Its list answers them itself while it has the
 * focus (`roll-call-keys.ts`), so they work even with the shortcuts off, as
 * WCAG 2.1.4 allows. With the shortcuts on, the console presses them on the
 * marked row from anywhere else on the page, such as after a click in Safari,
 * which leaves the focus nowhere.
 */
const ROLL_CALL_LIST_KEYS: string[] = Object.values(ROLL_CALL_ANSWER_KEYS);

/** The input types a chair types into. Any other input (a checkbox, a radio button) is not a text field. */
const TEXT_INPUT_TYPES: string[] = [
	'text',
	'search',
	'email',
	'number',
	'tel',
	'url',
	'password',
	'time',
	'date',
	'datetime-local',
	'month',
	'week'
];

/** The roles of an element a chair types into, such as the add box (`combobox`). */
const TEXT_FIELD_ROLES: string[] = ['textbox', 'searchbox', 'combobox', 'spinbutton'];

/** The elements on which Space already means something: press, follow, toggle or open. */
const SPACE_KEEPING_TAGS: string[] = ['BUTTON', 'A', 'SUMMARY', 'INPUT'];

/** The roles on which Space already means something. */
const SPACE_KEEPING_ROLES: string[] = [
	'button',
	'link',
	'checkbox',
	'radio',
	'switch',
	'menuitem',
	'menuitemcheckbox',
	'menuitemradio',
	'option',
	'tab'
];

/** `KeyboardEvent.key` written as `aria-keyshortcuts` writes it: " " is "Space", "n" is "N". */
function shortcutName(key: string): string {
	if (key === ' ') return KEY_SHORTCUTS.clock;
	// "=" shares its key with "+" on most keyboards, so the chair need not hold Shift.
	if (key === '+' || key === '=') return KEY_SHORTCUTS.addTime;
	if (key.length === 1) return key.toUpperCase();

	return key;
}

/** Whether the focus is in somewhere the chair types: an input, a text area, a select or an editable area. */
function isTextField(target: KeyTarget): boolean {
	const tagName = target.tagName.toUpperCase();

	if (target.isContentEditable) return true;
	if (tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
	// An input with no `type` is a text input.
	if (tagName === 'INPUT') return TEXT_INPUT_TYPES.includes(target.inputType ?? 'text');

	return target.role !== null && TEXT_FIELD_ROLES.includes(target.role);
}

/** Whether Space already means something on the focused element, which the console then leaves alone. */
function keepsItsOwnSpace(target: KeyTarget): boolean {
	if (target.isDragHandle) return true;
	if (SPACE_KEEPING_TAGS.includes(target.tagName.toUpperCase())) return true;

	return target.role !== null && SPACE_KEEPING_ROLES.includes(target.role);
}

/** The keys a view declares on its own buttons, which win over the console's. */
function viewShortcuts(view: KeyView, isRollCallVoteOpen: boolean): string[] {
	if (view === 'voting' && isRollCallVoteOpen) return ROLL_CALL_VOTE_SHORTCUTS;
	if (view === 'roll-call') return ROLL_CALL_LIST_KEYS;
	if (LIST_VIEWS.includes(view)) return [KEY_SHORTCUTS.addBox];

	return [];
}

/**
 * The view whose own keys apply on a chair page: the roll call on its page,
 * and otherwise the view the mode bar marks as selected (`selectedView`).
 */
export function keyView(page: ChairPage, live: LiveView | null): KeyView {
	if (page === 'roll-call') return 'roll-call';

	return selectedView(page, live);
}

/**
 * The button a key press should press, or null when the press is left alone.
 *
 * In this order: a press another handler took, or one held with Ctrl, Cmd or
 * Alt, is left alone. Escape always acts. In a text field nothing else does,
 * except Space in an empty add box, which starts or pauses the clock since an
 * empty search has no use for a space. Space acts unless the focused element
 * already gives it a meaning (a button, a link, a drag handle). With the
 * shortcuts switched off nothing more acts. A key the view declares wins over
 * the same key of the console.
 */
export function shortcutForKeyPress(press: KeyPress): KeyMatch | null {
	if (press.isAlreadyHandled || press.hasModifier) return null;

	const shortcut = shortcutName(press.key);

	if (shortcut === KEY_SHORTCUTS.close) return { shortcut, searchesFrame: true };

	if (isTextField(press.target)) {
		const isSpaceInEmptyAddBox =
			shortcut === KEY_SHORTCUTS.clock && press.target.isAddBox && press.target.isEmpty;

		return isSpaceInEmptyAddBox ? { shortcut, searchesFrame: true } : null;
	}

	if (shortcut === KEY_SHORTCUTS.clock) {
		return keepsItsOwnSpace(press.target) ? null : { shortcut, searchesFrame: true };
	}

	// Single-character keys can fire by accident through speech input, so the
	// chair can switch them off (WCAG 2.1.4). Space and Escape above stay.
	if (!press.areShortcutsOn) return null;

	if (viewShortcuts(press.view, press.isRollCallVoteOpen).includes(shortcut)) {
		return { shortcut, searchesFrame: false };
	}

	if (CONSOLE_SHORTCUTS.includes(shortcut)) return { shortcut, searchesFrame: true };

	return null;
}

/** A key as its hint on a button shows it: "Plus" is "+", "Escape" is "Esc", the rest as they are. */
export function keyHint(shortcut: string): string {
	if (shortcut === KEY_SHORTCUTS.addTime) return '+';
	if (shortcut === KEY_SHORTCUTS.close) return 'Esc';

	return shortcut;
}
