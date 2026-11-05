import { describe, expect, it } from 'vitest';
import {
	KEY_LIST,
	keyHint,
	keyView,
	shortcutForKeyPress,
	type KeyPress,
	type KeyTarget
} from './console-keys';

/** Nothing in particular has the focus: the page's body. */
const BODY: KeyTarget = {
	tagName: 'BODY',
	role: null,
	inputType: null,
	isContentEditable: false,
	isDragHandle: false,
	isAddBox: false,
	isEmpty: true
};

/** The GSL's add box, a combobox input. */
const ADD_BOX: KeyTarget = {
	...BODY,
	tagName: 'INPUT',
	role: 'combobox',
	inputType: 'text',
	isAddBox: true
};

/** A press of `key` on the GSL view with the focus on the body and the shortcuts on. */
function press(key: string, changes: Partial<KeyPress> = {}): KeyPress {
	return {
		key,
		hasModifier: false,
		isAlreadyHandled: false,
		target: BODY,
		view: 'gsl',
		isRollCallVoteOpen: false,
		areShortcutsOn: true,
		...changes
	};
}

describe('shortcutForKeyPress', () => {
	it("presses the console's keys, looking in the view and then the frame", () => {
		expect(shortcutForKeyPress(press('n'))).toEqual({ shortcut: 'N', searchesFrame: true });
		expect(shortcutForKeyPress(press('E'))).toEqual({ shortcut: 'E', searchesFrame: true });
		expect(shortcutForKeyPress(press('r'))?.shortcut).toBe('R');
		expect(shortcutForKeyPress(press('m'))?.shortcut).toBe('M');
		expect(shortcutForKeyPress(press('?'))?.shortcut).toBe('?');
	});

	it('opens the six views with 1 to 6', () => {
		const shortcuts = ['1', '2', '3', '4', '5', '6'].map((key) => shortcutForKeyPress(press(key)));

		expect(shortcuts.map((match) => match?.shortcut)).toEqual(['1', '2', '3', '4', '5', '6']);
	});

	it('reads + and = alike, as "Plus"', () => {
		expect(shortcutForKeyPress(press('+'))?.shortcut).toBe('Plus');
		expect(shortcutForKeyPress(press('='))?.shortcut).toBe('Plus');
	});

	it('starts or pauses the clock with Space', () => {
		const region = { ...BODY, tagName: 'SECTION', role: 'region' };

		expect(shortcutForKeyPress(press(' '))).toEqual({ shortcut: 'Space', searchesFrame: true });
		expect(shortcutForKeyPress(press(' ', { target: region }))?.shortcut).toBe('Space');
	});

	it('leaves a key that does nothing in the console alone', () => {
		expect(shortcutForKeyPress(press('x'))).toBeNull();
		expect(shortcutForKeyPress(press('ArrowDown'))).toBeNull();
		expect(shortcutForKeyPress(press('Enter'))).toBeNull();
	});

	it('leaves a press another handler took, or one held with Ctrl, Cmd or Alt', () => {
		expect(shortcutForKeyPress(press('n', { isAlreadyHandled: true }))).toBeNull();
		expect(shortcutForKeyPress(press('n', { hasModifier: true }))).toBeNull();
		expect(shortcutForKeyPress(press('Escape', { hasModifier: true }))).toBeNull();
	});

	it('lets Escape act anywhere, in a text field and with the shortcuts off too', () => {
		const inField = press('Escape', { target: ADD_BOX, areShortcutsOn: false });

		expect(shortcutForKeyPress(inField)).toEqual({ shortcut: 'Escape', searchesFrame: true });
	});

	it('does nothing while the cursor is in a text field', () => {
		const textarea = { ...BODY, tagName: 'TEXTAREA', isEmpty: false };
		const select = { ...BODY, tagName: 'SELECT' };
		const editable = { ...BODY, tagName: 'DIV', isContentEditable: true };
		const stepper = { ...BODY, tagName: 'INPUT', inputType: 'number', isEmpty: false };
		const untyped = { ...BODY, tagName: 'input', inputType: null };
		const textbox = { ...BODY, tagName: 'DIV', role: 'textbox' };

		for (const target of [ADD_BOX, textarea, select, editable, stepper, untyped, textbox]) {
			expect(shortcutForKeyPress(press('n', { target }))).toBeNull();
		}
	});

	it('lets Space through to the clock from an empty add box only', () => {
		const typedInto = { ...ADD_BOX, isEmpty: false };
		const raisedBy = { ...ADD_BOX, isAddBox: false };

		expect(shortcutForKeyPress(press(' ', { target: ADD_BOX }))?.shortcut).toBe('Space');
		expect(shortcutForKeyPress(press(' ', { target: typedInto }))).toBeNull();
		expect(shortcutForKeyPress(press(' ', { target: raisedBy }))).toBeNull();
	});

	it('leaves Space to a focused button, link, drag handle or other control', () => {
		const button = { ...BODY, tagName: 'BUTTON' };
		const link = { ...BODY, tagName: 'a' };
		const summary = { ...BODY, tagName: 'SUMMARY' };
		const radio = { ...BODY, tagName: 'INPUT', inputType: 'radio' };
		const handle = { ...BODY, tagName: 'SPAN', isDragHandle: true };
		const roleButton = { ...BODY, tagName: 'DIV', role: 'button' };

		for (const target of [button, link, summary, radio, handle, roleButton]) {
			expect(shortcutForKeyPress(press(' ', { target }))).toBeNull();
		}
	});

	it('still lets the letter keys act on a focused button or radio button', () => {
		const button = { ...BODY, tagName: 'BUTTON' };
		const radio = { ...BODY, tagName: 'INPUT', inputType: 'radio' };

		expect(shortcutForKeyPress(press('n', { target: button }))?.shortcut).toBe('N');
		expect(shortcutForKeyPress(press('e', { target: radio }))?.shortcut).toBe('E');
	});

	it('keeps only Space and Escape working with the shortcuts off', () => {
		const off = { areShortcutsOn: false };

		expect(shortcutForKeyPress(press(' ', off))?.shortcut).toBe('Space');
		expect(shortcutForKeyPress(press('Escape', off))?.shortcut).toBe('Escape');
		expect(shortcutForKeyPress(press('n', off))).toBeNull();
		expect(shortcutForKeyPress(press('1', off))).toBeNull();
		expect(shortcutForKeyPress(press('/', off))).toBeNull();

		const ballotWhileOff = press('y', { ...off, view: 'voting', isRollCallVoteOpen: true });

		expect(shortcutForKeyPress(ballotWhileOff)).toBeNull();
	});

	it('puts the cursor in the add box with / on the four views that have a list', () => {
		for (const view of ['gsl', 'mod', 'unmod', 'single'] as const) {
			expect(shortcutForKeyPress(press('/', { view }))).toEqual({
				shortcut: '/',
				searchesFrame: false
			});
		}
	});

	it('does nothing with / where there is no add box', () => {
		expect(shortcutForKeyPress(press('/', { view: 'motions' }))).toBeNull();
		expect(shortcutForKeyPress(press('/', { view: 'roll-call' }))).toBeNull();
		expect(shortcutForKeyPress(press('/', { view: null }))).toBeNull();
	});

	it('answers a roll call vote with Y, N, A and P, inside the view only', () => {
		const ballot = { view: 'voting', isRollCallVoteOpen: true } as const;
		const keys = ['y', 'n', 'a', 'p'].map((key) => shortcutForKeyPress(press(key, ballot)));

		expect(keys).toEqual([
			{ shortcut: 'Y', searchesFrame: false },
			{ shortcut: 'N', searchesFrame: false },
			{ shortcut: 'A', searchesFrame: false },
			{ shortcut: 'P', searchesFrame: false }
		]);
	});

	it('lets N call the next speaker on the Vote view while no roll call vote is open', () => {
		const voteView = press('n', { view: 'voting', isRollCallVoteOpen: false });

		expect(shortcutForKeyPress(voteView)).toEqual({ shortcut: 'N', searchesFrame: true });
		expect(shortcutForKeyPress(press('y', { view: 'voting' }))).toBeNull();
	});

	it("answers the roll call's marked row with A, P and V, inside the view only, while the other keys still act", () => {
		const rollCall = { view: 'roll-call' } as const;
		const keys = ['a', 'p', 'v'].map((key) => shortcutForKeyPress(press(key, rollCall)));

		expect(keys).toEqual([
			{ shortcut: 'A', searchesFrame: false },
			{ shortcut: 'P', searchesFrame: false },
			{ shortcut: 'V', searchesFrame: false }
		]);
		expect(shortcutForKeyPress(press('p', { ...rollCall, areShortcutsOn: false }))).toBeNull();
		expect(shortcutForKeyPress(press('n', rollCall))?.shortcut).toBe('N');
		expect(shortcutForKeyPress(press(' ', rollCall))?.shortcut).toBe('Space');
	});
});

describe('keyView', () => {
	it('is the roll call on its page', () => {
		expect(keyView('roll-call', 'gsl')).toBe('roll-call');
	});

	it('is the selected view anywhere else, and the live view on chair', () => {
		expect(keyView('motions', 'gsl')).toBe('motions');
		expect(keyView('chair', 'mod')).toBe('mod');
		expect(keyView('chair', null)).toBeNull();
		expect(keyView('papers', 'gsl')).toBeNull();
	});
});

describe('keyHint', () => {
	it('writes the plus sign and Escape as a button shows them', () => {
		expect(keyHint('Plus')).toBe('+');
		expect(keyHint('Escape')).toBe('Esc');
		expect(keyHint('N')).toBe('N');
		expect(keyHint('Space')).toBe('Space');
	});
});

describe('KEY_LIST', () => {
	it('lists every key of the console once, in the order of the spec', () => {
		const keys = KEY_LIST.map((row) => row.keys);

		expect(keys).toEqual([
			'Space',
			'N',
			'E',
			'+',
			'/',
			'1 to 6',
			'R',
			'M',
			'?',
			'A, P, V',
			'Y, N, A, P',
			'Escape'
		]);
	});
});
