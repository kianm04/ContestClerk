// @vitest-environment jsdom
// The guard asks the browser with `confirm`, which plain Node does not have.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BeforeNavigate } from '@sveltejs/kit';
import { LEAVE_WARNING, saveOrAskBeforeLeaving, type LeaveGuardedSave } from './paper-leave-guard';

/*
	`beforeNavigate` only works inside a running SvelteKit app. The stand-in
	keeps the function the guard hands it, so a test can call it with a
	navigation of its own making.
*/
const registered: ((navigation: BeforeNavigate) => void)[] = [];
vi.mock('$app/navigation', () => ({
	beforeNavigate: (callback: (navigation: BeforeNavigate) => void) => registered.push(callback)
}));

/**
 * A navigation of the given type from the paper's page to `toPath`, which
 * remembers whether it was cancelled. Closing the tab goes nowhere.
 */
function navigation(type: BeforeNavigate['type'], toPath = '/elsewhere') {
	const cancel = vi.fn();
	const from = { url: new URL('https://munmeet.test/paper') };
	const to = type === 'leave' ? null : { url: new URL(toPath, 'https://munmeet.test') };

	return { type, from, to, cancel } as unknown as BeforeNavigate & {
		cancel: ReturnType<typeof vi.fn>;
	};
}

/** A save with unsaved text, which the test can mark as at risk. */
function unsavedDraft(isAtRisk = false): LeaveGuardedSave & { saveNow: ReturnType<typeof vi.fn> } {
	return { hasUnsavedText: true, isAtRisk, saveNow: vi.fn(async () => undefined) };
}

/** Register the guard and answer the function it registered. */
function guard(save: LeaveGuardedSave | null) {
	saveOrAskBeforeLeaving(save);

	return registered[registered.length - 1];
}

beforeEach(() => {
	registered.length = 0;
	vi.restoreAllMocks();
});

describe('saveOrAskBeforeLeaving', () => {
	it('saves on the way to another page', () => {
		const save = unsavedDraft();
		const leaving = navigation('link');

		guard(save)(leaving);

		expect(save.saveNow).toHaveBeenCalledOnce();
		expect(leaving.cancel).not.toHaveBeenCalled();
	});

	it('does nothing with everything saved, or after a form moved on itself', () => {
		const stored = { ...unsavedDraft(), hasUnsavedText: false };
		const afterSubmit = unsavedDraft();

		guard(stored)(navigation('link'));
		guard(afterSubmit)(navigation('goto'));
		guard(null)(navigation('link'));

		expect(stored.saveNow).not.toHaveBeenCalled();
		expect(afterSubmit.saveNow).not.toHaveBeenCalled();
	});

	it('neither saves nor asks when a dialog of the same page opens', () => {
		const save = unsavedDraft(true);
		const opening = navigation('link', '/paper?add=1');
		const confirm = vi.spyOn(window, 'confirm');

		guard(save)(opening);

		expect(confirm).not.toHaveBeenCalled();
		expect(opening.cancel).not.toHaveBeenCalled();
		expect(save.saveNow).not.toHaveBeenCalled();
	});

	it('makes the browser ask when the tab closes, and still saves', () => {
		const save = unsavedDraft();
		const closing = navigation('leave');

		guard(save)(closing);

		expect(closing.cancel).toHaveBeenCalledOnce();
		expect(save.saveNow).toHaveBeenCalledOnce();
	});

	it('asks first when the last save was at risk, and stays when the writer says no', () => {
		const save = unsavedDraft(true);
		const leaving = navigation('link');
		const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

		guard(save)(leaving);

		expect(confirm).toHaveBeenCalledWith(LEAVE_WARNING);
		expect(leaving.cancel).toHaveBeenCalledOnce();
		expect(save.saveNow).not.toHaveBeenCalled();
	});

	it('saves and goes when the writer says yes', () => {
		const save = unsavedDraft(true);
		const leaving = navigation('link');
		vi.spyOn(window, 'confirm').mockReturnValue(true);

		guard(save)(leaving);

		expect(leaving.cancel).not.toHaveBeenCalled();
		expect(save.saveNow).toHaveBeenCalledOnce();
	});
});
