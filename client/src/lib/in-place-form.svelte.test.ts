import type { ActionResult, SubmitFunction } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyAction } from '$app/forms';
import { goto, invalidateAll } from '$app/navigation';
import { navigating } from '$app/state';
import {
	createInPlaceForm,
	NETWORK_FAILURE_MESSAGE,
	SERVER_FAILURE_MESSAGE,
	type InPlaceForm,
	waitForPageChanges
} from './in-place-form.svelte';

// SvelteKit's own browser modules only work inside a running app, so these
// tests stand in for them and check what the helper asks of them.
vi.mock('$app/forms', () => ({
	applyAction: vi.fn(async () => undefined)
}));
vi.mock('$app/navigation', () => ({
	goto: vi.fn(async () => undefined),
	invalidateAll: vi.fn(async () => undefined)
}));
vi.mock('$app/state', () => ({ navigating: { complete: null } }));

/** The page the tests pretend to be on. */
const ROOM_PATH = '/conferences/test-mun/committees/unsc/chair';

type SubmitInput = Parameters<SubmitFunction>[0];
type AnswerInput = Parameters<Exclude<Awaited<ReturnType<SubmitFunction>>, void>>[0];

/** One press as `use:enhance` would report it, with its `cancel` to check. */
type Press = {
	cancel: () => void;
	formElement: HTMLFormElement;
	/** Hands the server's answer back, as SvelteKit does, or is null when cancelled. */
	answer: ((result: ActionResult) => Promise<void>) | null;
};

/** Press a button of `form` posting to `formAction`, as `use:enhance` would. */
async function press(form: InPlaceForm, formAction: string): Promise<Press> {
	const cancel = vi.fn();
	const formElement = document.createElement('form');
	const action = new URL(formAction, window.location.href);
	const formData = new FormData();
	const input: SubmitInput = {
		action,
		formData,
		formElement,
		controller: new AbortController(),
		submitter: null,
		cancel
	};

	const whenAnswered = await form.submit(input);

	if (typeof whenAnswered !== 'function') return { cancel, formElement, answer: null };

	const answer = async (result: ActionResult): Promise<void> => {
		const answerInput: AnswerInput = {
			action,
			formData,
			formElement,
			result,
			update: vi.fn(async () => undefined)
		};
		await whenAnswered(answerInput);
	};

	return { cancel, formElement, answer };
}

beforeEach(() => {
	vi.clearAllMocks();
	window.history.replaceState({}, '', ROOM_PATH);
});

describe('createInPlaceForm', () => {
	it('is busy while a press is on its way and ignores a second press', async () => {
		const onSend = vi.fn();
		const form = createInPlaceForm({ onSend });

		const first = await press(form, '?/timerStart');
		expect(form.isBusy).toBe(true);
		expect(onSend).toHaveBeenCalledTimes(1);

		const second = await press(form, '?/timerStart');
		expect(second.cancel).toHaveBeenCalled();
		expect(onSend).toHaveBeenCalledTimes(1);

		await first.answer?.({ type: 'redirect', status: 303, location: ROOM_PATH });
		expect(form.isBusy).toBe(false);
	});

	it('holds the request back until `waitBeforeSending` settles, busy meanwhile', async () => {
		let releaseEarlierPresses = () => {};
		const earlierPresses = new Promise<void>((resolve) => (releaseEarlierPresses = resolve));
		const form = createInPlaceForm({ waitBeforeSending: () => earlierPresses });

		let isSendable = false;
		const sent = press(form, '?/startSession').then((pressed) => {
			isSendable = true;
			return pressed;
		});
		// Let every promise that can settle on its own do so.
		await new Promise((resolve) => setTimeout(resolve, 0));

		// SvelteKit sends the request only once `submit` returns, which it has not yet.
		expect(isSendable).toBe(false);
		expect(form.isBusy).toBe(true);
		const secondPress = await press(form, '?/startSession');
		expect(secondPress.cancel).toHaveBeenCalled();

		releaseEarlierPresses();
		const pressed = await sent;
		expect(pressed.cancel).not.toHaveBeenCalled();
		expect(pressed.answer).not.toBeNull();
	});

	it('knows which button is on its way, from a short or a whole address', async () => {
		const form = createInPlaceForm();

		await press(form, '?/approve');

		expect(form.isSending('?/approve')).toBe(true);
		expect(form.isSending(`${ROOM_PATH}?/approve`)).toBe(true);
		expect(form.isSending('?/requestChanges')).toBe(false);
	});

	it('reads the same page again without scrolling or moving the focus', async () => {
		const onSettle = vi.fn();
		const form = createInPlaceForm({ onSettle });

		const sent = await press(form, '?/timerStart');
		await sent.answer?.({ type: 'redirect', status: 303, location: ROOM_PATH });

		expect(goto).toHaveBeenCalledWith(new URL(ROOM_PATH, window.location.href), {
			invalidateAll: true,
			noScroll: true,
			keepFocus: true
		});
		expect(onSettle).toHaveBeenCalledWith(sent.formElement);
	});

	it('follows a redirect to another page the usual way', async () => {
		const form = createInPlaceForm();
		const result: ActionResult = { type: 'redirect', status: 303, location: '/home' };

		const sent = await press(form, '?/endSession');
		await sent.answer?.(result);

		expect(applyAction).toHaveBeenCalledWith(result);
		expect(goto).not.toHaveBeenCalled();
	});

	it('empties the fields once saved only when asked to', async () => {
		const form = createInPlaceForm({ isResetAfterSave: true });

		const sent = await press(form, '?/add');
		const reset = vi.spyOn(sent.formElement, 'reset');
		await sent.answer?.({ type: 'success', status: 200 });

		expect(reset).toHaveBeenCalled();
		expect(invalidateAll).toHaveBeenCalled();
	});

	it('keeps the fields after a refusal', async () => {
		const form = createInPlaceForm({ isResetAfterSave: true });
		const refusal: ActionResult = { type: 'failure', status: 400, data: {} };

		const sent = await press(form, '?/add');
		const reset = vi.spyOn(sent.formElement, 'reset');
		await sent.answer?.(refusal);

		expect(reset).not.toHaveBeenCalled();
		expect(applyAction).toHaveBeenCalledWith(refusal);
	});

	it('says in plain words when the press never reached the server', async () => {
		const form = createInPlaceForm();

		const sent = await press(form, '?/timerStart');
		await sent.answer?.({ type: 'error', error: new TypeError('Failed to fetch') });

		expect(applyAction).toHaveBeenCalledWith({
			type: 'failure',
			status: 500,
			data: { flash: { tone: 'error', message: NETWORK_FAILURE_MESSAGE } }
		});
		expect(form.isBusy).toBe(false);
	});

	it('says so when the server broke doing the work', async () => {
		const form = createInPlaceForm();

		const sent = await press(form, '?/timerStart');
		await sent.answer?.({ type: 'error', status: 500, error: new Error('boom') });

		expect(applyAction).toHaveBeenCalledWith({
			type: 'failure',
			status: 500,
			data: { flash: { tone: 'error', message: SERVER_FAILURE_MESSAGE } }
		});
	});
});

describe('waitForPageChanges', () => {
	/** The mocked `navigating`, whose `complete` a test can set. */
	const pageChange = navigating as { complete: Promise<void> | null };

	it('returns at once when no page change is under way', async () => {
		pageChange.complete = null;

		await expect(waitForPageChanges()).resolves.toBeUndefined();
	});

	it('waits for a page change, even one that was dropped, to end', async () => {
		let endPageChange: () => void = () => undefined;
		pageChange.complete = new Promise<void>((_resolve, reject) => {
			endPageChange = () => {
				pageChange.complete = null;
				reject(new Error('Dropped for a newer page change'));
			};
		});
		let hasReturned = false;

		const waiting = waitForPageChanges().then(() => (hasReturned = true));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(hasReturned).toBe(false);

		endPageChange();
		await waiting;
		expect(hasReturned).toBe(true);
	});

	it('returns when a page change ended but SvelteKit still lists it', async () => {
		// `invalidateAll` aborts a page change under way without clearing
		// `navigating`, so its ended promise stays there (T140).
		const abandonedPageChange = Promise.reject(new Error('navigation aborted'));
		abandonedPageChange.catch(() => undefined);
		pageChange.complete = abandonedPageChange;
		let hasReturned = false;

		const waiting = waitForPageChanges().then(() => (hasReturned = true));
		await new Promise((resolve) => setTimeout(resolve, 0));
		pageChange.complete = null;
		expect(hasReturned).toBe(true);
		await waiting;
	});
});
