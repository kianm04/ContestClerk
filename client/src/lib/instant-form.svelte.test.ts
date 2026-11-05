import type { ActionResult, SubmitFunction } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyAction } from '$app/forms';
import { goto, invalidateAll } from '$app/navigation';
import { navigating } from '$app/state';
import {
	createInstantForm,
	INSTANT_FORM_REASON,
	INSTANT_NETWORK_REASON,
	INSTANT_SERVER_REASON,
	SENDING_ATTRIBUTE,
	toastShownAtOnce,
	type InstantForm
} from './instant-form.svelte';

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
const ROLL_CALL_PATH = '/conferences/test-mun/committees/unsc/chair/roll-call';

/** What a saved roll call answer sends back: a redirect to the same page. */
const SAVED: ActionResult = { type: 'redirect', status: 303, location: ROLL_CALL_PATH };

type SubmitInput = Parameters<SubmitFunction>[0];
type AnswerCallback = Exclude<Awaited<ReturnType<SubmitFunction>>, void>;

/** One press as `use:enhance` would make it. */
type Press = {
	formElement: HTMLFormElement;
	/** Settles once the press may be sent, which is when SvelteKit would send it. */
	whenSendable: Promise<AnswerCallback>;
	/** Hands the server's answer back, as SvelteKit does. */
	answer: (result: ActionResult) => Promise<void>;
};

/** Press a roll call answer for `seatId`, as `use:enhance` would. */
function press(form: InstantForm, seatId: string, status: string, formElement?: HTMLFormElement) {
	const formData = new FormData();
	formData.set('seatId', seatId);
	formData.set('status', status);
	const action = new URL('?/setStatus', window.location.href);
	const element = formElement ?? document.createElement('form');
	const input: SubmitInput = {
		action,
		formData,
		formElement: element,
		controller: new AbortController(),
		submitter: null,
		cancel: vi.fn()
	};

	const whenSendable = Promise.resolve(form.submit(input)) as Promise<AnswerCallback>;

	const answer = async (result: ActionResult): Promise<void> => {
		const callback = await whenSendable;
		await callback({ action, formData, formElement: element, result, update: vi.fn() });
	};

	const sent: Press = { formElement: element, whenSendable, answer };
	return sent;
}

/** The pressed answers the screen shows, as "<seat> <status>". */
function shown(form: InstantForm): string[] {
	return form.presses.map(
		(sent) => `${sent.formData.get('seatId')} ${sent.formData.get('status')}`
	);
}

/** Whether the press's request has been let go, checked after the microtasks have run. */
async function isSendable(sent: Press): Promise<boolean> {
	let isReady = false;
	void sent.whenSendable.then(() => (isReady = true));
	await new Promise((resolve) => setTimeout(resolve, 0));
	return isReady;
}

beforeEach(() => {
	vi.clearAllMocks();
	(navigating as { complete: Promise<void> | null }).complete = null;
	window.history.replaceState({}, '', ROLL_CALL_PATH);
});

describe('createInstantForm', () => {
	it('shows a press the moment it is made, before any answer', () => {
		const form = createInstantForm({ describeFailure: () => 'France was not marked.' });

		press(form, 'france', 'present');

		expect(shown(form)).toEqual(['france present']);
	});

	it('queues presses and sends each only once the one before it is answered', async () => {
		const form = createInstantForm({ describeFailure: () => 'Not marked.' });

		const first = press(form, 'france', 'present');
		const second = press(form, 'france', 'absent');

		expect(await isSendable(first)).toBe(true);
		expect(await isSendable(second)).toBe(false);
		expect(shown(form)).toEqual(['france present', 'france absent']);

		await first.answer(SAVED);

		expect(await isSendable(second)).toBe(true);
	});

	it('keeps every press on screen until the last is answered, then reads the page once', async () => {
		const form = createInstantForm({ describeFailure: () => 'Not marked.' });

		const presses = [
			press(form, 'france', 'present'),
			press(form, 'ghana', 'present'),
			press(form, 'france', 'absent')
		];

		await presses[0].answer(SAVED);
		await presses[1].answer(SAVED);

		// Fresh data arriving now cannot undo them: they are still shown.
		expect(shown(form)).toEqual(['france present', 'ghana present', 'france absent']);
		expect(invalidateAll).not.toHaveBeenCalled();

		await presses[2].answer(SAVED);

		expect(invalidateAll).toHaveBeenCalledTimes(1);
		expect(shown(form)).toEqual([]);
	});

	it('puts back only the press that was refused and names it in a toast', async () => {
		const form = createInstantForm({
			describeFailure: (failed) => `${failed.formData.get('seatId')} was not marked.`
		});

		const france = press(form, 'france', 'present');
		const ghana = press(form, 'ghana', 'present');
		await france.answer({
			type: 'failure',
			status: 400,
			data: { flash: { tone: 'error', message: 'That roll call belongs to another session.' } }
		});

		expect(shown(form)).toEqual(['ghana present']);
		expect(applyAction).toHaveBeenCalledWith({
			type: 'failure',
			status: 400,
			data: {
				flash: {
					tone: 'error',
					message: 'france was not marked. That roll call belongs to another session.'
				}
			}
		});

		await ghana.answer(SAVED);
		expect(invalidateAll).toHaveBeenCalledTimes(1);
	});

	it('asks to check the connection when the press never arrives', async () => {
		const form = createInstantForm({ describeFailure: () => 'France was not marked present.' });

		const sent = press(form, 'france', 'present');
		await sent.answer({ type: 'error', error: new TypeError('Failed to fetch') });

		expect(shown(form)).toEqual([]);
		expect(applyAction).toHaveBeenCalledWith({
			type: 'failure',
			status: 500,
			data: {
				flash: {
					tone: 'error',
					message: `France was not marked present. ${INSTANT_NETWORK_REASON}`
				}
			}
		});
	});

	it('says the fault was on our side when the server broke', async () => {
		const form = createInstantForm({ describeFailure: () => 'France was not marked present.' });

		const sent = press(form, 'france', 'present');
		await sent.answer({ type: 'error', status: 500, error: new Error('boom') });

		expect(applyAction).toHaveBeenCalledWith(
			expect.objectContaining({
				data: {
					flash: {
						tone: 'error',
						message: `France was not marked present. ${INSTANT_SERVER_REASON}`
					}
				}
			})
		);
	});

	it('follows a redirect to another page, as "Finish" asks', async () => {
		const form = createInstantForm({ describeFailure: () => 'Not finished.' });
		const toRoom: ActionResult = { type: 'redirect', status: 303, location: '/elsewhere' };

		const sent = press(form, 'france', 'present');
		await sent.answer(toRoom);

		expect(applyAction).toHaveBeenCalledWith(toRoom);
	});

	it('reads a relative redirect from the address posted to, after the reader has moved on', async () => {
		// `resolve()` on the server writes the chair room as a relative address.
		// "Finish" was pressed on roll call, one level below the room, and the
		// reader followed a link to the Awards page before the answer came back.
		const toRoom: ActionResult = {
			type: 'redirect',
			status: 303,
			location: '../../../../../conferences/test-mun/committees/unsc/chair'
		};
		const form = createInstantForm({ describeFailure: () => 'Not finished.' });

		const sent = press(form, 'france', 'present');
		window.history.replaceState({}, '', '/conferences/test-mun/committees/unsc/chair/awards');
		await sent.answer(toRoom);

		expect(applyAction).toHaveBeenCalledWith({
			...toRoom,
			location: '/conferences/test-mun/committees/unsc/chair'
		});
	});

	it('leaves a reader who has moved on where they are when the answer only reloads the page pressed on', async () => {
		// "End session" was pressed in the room, answered with the room, and the
		// chair followed "Propose awards →" before the answer came back.
		const backToRoom: ActionResult = {
			type: 'redirect',
			status: 303,
			location: '../../../../conferences/test-mun/committees/unsc/chair'
		};
		const form = createInstantForm({ describeFailure: () => 'The session did not end.' });

		window.history.replaceState({}, '', '/conferences/test-mun/committees/unsc/chair');
		const sent = press(form, 'france', 'present');
		window.history.replaceState({}, '', '/conferences/test-mun/committees/unsc/chair/awards');
		await sent.answer(backToRoom);

		expect(applyAction).not.toHaveBeenCalled();
		expect(goto).not.toHaveBeenCalled();
		expect(invalidateAll).toHaveBeenCalledOnce();
	});

	it('reads the page the reader has already gone to again, rather than going there twice', async () => {
		// A notification row in the bell goes where it leads at once, and the
		// answer to its "open" press redirects to that same page afterwards.
		const toConferences: ActionResult = { type: 'redirect', status: 303, location: '/conferences' };
		const form = createInstantForm({ describeFailure: () => 'The notification was not opened.' });

		const sent = press(form, 'france', 'present');
		window.history.replaceState({}, '', '/conferences');
		await sent.answer(toConferences);

		expect(applyAction).not.toHaveBeenCalled();
		expect(goto).not.toHaveBeenCalled();
		expect(invalidateAll).toHaveBeenCalledOnce();
	});

	it('takes a reader who has gone on to the redirect’s page to the `?` address it asks for', async () => {
		// The row of an announcement deleted since leads to it at once, and the
		// answer to its "open" press says the announcement was removed instead.
		const announcementsPath = '/conferences/test-mun/announcements';
		const removed: ActionResult = {
			type: 'redirect',
			status: 303,
			location: `${announcementsPath}?removed=1`
		};
		const form = createInstantForm({ describeFailure: () => 'The notification was not opened.' });

		const sent = press(form, 'france', 'present');
		window.history.replaceState({}, '', `${announcementsPath}?announcement=gone`);
		await sent.answer(removed);

		expect(applyAction).not.toHaveBeenCalled();
		expect(goto).toHaveBeenCalledWith(
			new URL(`${announcementsPath}?removed=1`, window.location.href),
			{ invalidateAll: true, noScroll: true, keepFocus: true }
		);
	});

	it('lets a page change under way finish before reading the page again', async () => {
		// `invalidateAll` aborts a page change under way, so a click on another
		// tab made just before the last answer came back would be lost.
		const pageChange = navigating as { complete: Promise<void> | null };
		let endPageChange: () => void = () => undefined;
		pageChange.complete = new Promise<void>((resolve) => {
			endPageChange = () => {
				pageChange.complete = null;
				resolve();
			};
		});
		const form = createInstantForm({ describeFailure: () => 'Not marked.' });

		const answered = press(form, 'france', 'present').answer(SAVED);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(invalidateAll).not.toHaveBeenCalled();

		endPageChange();
		await answered;
		expect(invalidateAll).toHaveBeenCalledTimes(1);
	});

	it('marks the form as sending until its presses are in the page data', async () => {
		const form = createInstantForm({ describeFailure: () => 'Not marked.' });
		const formElement = document.createElement('form');

		const first = press(form, 'france', 'present', formElement);
		const second = press(form, 'france', 'absent', formElement);
		expect(formElement.hasAttribute(SENDING_ATTRIBUTE)).toBe(true);

		await first.answer(SAVED);
		expect(formElement.hasAttribute(SENDING_ATTRIBUTE)).toBe(true);

		await second.answer(SAVED);
		expect(formElement.hasAttribute(SENDING_ATTRIBUTE)).toBe(false);
	});

	it('marks the page’s body too, for a press that takes its own form off the screen', async () => {
		// Presses of the tests above are still on their way and count towards the
		// body's mark, so this test takes a fresh copy of the module.
		vi.resetModules();
		document.body.removeAttribute(SENDING_ATTRIBUTE);
		const fresh = await import('./instant-form.svelte');
		const form = fresh.createInstantForm({ describeFailure: () => 'Not marked.' });
		const formElement = document.createElement('form');

		const pressed = press(form, 'france', 'present', formElement);
		formElement.remove();
		expect(document.body.hasAttribute(SENDING_ATTRIBUTE)).toBe(true);

		await pressed.answer(SAVED);
		expect(document.body.hasAttribute(SENDING_ATTRIBUTE)).toBe(false);
	});

	it('says when every press on the page is answered, for the realtime listener to wait on', async () => {
		// As above, a fresh copy of the module, so no earlier test's press is counted.
		vi.resetModules();
		const fresh = await import('./instant-form.svelte');
		const form = fresh.createInstantForm({ describeFailure: () => 'Not marked.' });
		expect(fresh.isAnyInstantFormSending()).toBe(false);

		const pressed = press(form, 'france', 'present');
		let isAnswered = false;
		void fresh.whenInstantFormsAnswered().then(() => (isAnswered = true));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(fresh.isAnyInstantFormSending()).toBe(true);
		expect(isAnswered).toBe(false);

		await pressed.answer(SAVED);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(fresh.isAnyInstantFormSending()).toBe(false);
		expect(isAnswered).toBe(true);
	});

	it('stops sending even when reading the page again throws', async () => {
		const form = createInstantForm({ describeFailure: () => 'Not marked.' });
		const formElement = document.createElement('form');
		vi.mocked(invalidateAll).mockRejectedValueOnce(new Error('load failed'));

		const pressed = press(form, 'france', 'present', formElement);
		await expect(pressed.answer(SAVED)).rejects.toThrow('load failed');

		expect(formElement.hasAttribute(SENDING_ATTRIBUTE)).toBe(false);
		expect(form.presses).toEqual([]);
	});

	it('keeps what a press is expected to change, worked out at the moment of the press', () => {
		const form = createInstantForm<string>({ describeFailure: () => 'Not marked.' });
		const formData = new FormData();
		formData.set('seatId', 'france');
		const submitWithNote = form.submitExpecting((input) => {
			input.formData.set('newRowId', 'chosen-in-the-browser');
			return `${input.formData.get('seatId')} is expected`;
		});

		void submitWithNote({
			action: new URL('?/setStatus', window.location.href),
			formData,
			formElement: document.createElement('form'),
			controller: new AbortController(),
			submitter: null,
			cancel: vi.fn()
		});

		expect(form.presses[0].expected).toBe('france is expected');
		expect(form.presses[0].formData.get('newRowId')).toBe('chosen-in-the-browser');
	});

	it('keeps the fields a refusal sends back, beside its toast', async () => {
		const form = createInstantForm({ describeFailure: () => 'The motion was not raised.' });

		const sent = press(form, 'france', 'present');
		await sent.answer({ type: 'failure', status: 400, data: { topic: 'Too long' } });

		expect(applyAction).toHaveBeenCalledWith({
			type: 'failure',
			status: 400,
			data: {
				topic: 'Too long',
				flash: { tone: 'error', message: `The motion was not raised. ${INSTANT_FORM_REASON}` }
			}
		});
	});

	it('reads the page at the address a redirect back to it asks for, as "Yield time" does', async () => {
		window.history.replaceState({}, '', `${ROLL_CALL_PATH}?yield=seat`);
		const form = createInstantForm({ describeFailure: () => 'The speaker did not yield.' });

		const sent = press(form, 'france', 'present');
		await sent.answer(SAVED);

		expect(invalidateAll).not.toHaveBeenCalled();
		expect(goto).toHaveBeenCalledWith(new URL(ROLL_CALL_PATH, window.location.href), {
			invalidateAll: true,
			noScroll: true,
			keepFocus: true
		});
	});

	it('leaves a reader on the `?` address they followed a link to after the press', async () => {
		// "Close vote" was pressed on the voting view, answered with that view, and
		// the chair followed "Open another vote" (`?vote=new`) before it came back.
		const form = createInstantForm({ describeFailure: () => 'The vote did not close.' });

		const sent = press(form, 'france', 'present');
		window.history.replaceState({}, '', `${ROLL_CALL_PATH}?vote=new`);
		await sent.answer(SAVED);

		expect(goto).not.toHaveBeenCalled();
		expect(invalidateAll).toHaveBeenCalledOnce();
	});

	it('leaves a reader on the page a link under way at the answer lands them on', async () => {
		// On a phone "End session" is pressed on `?end=confirm` and answered with
		// the room without it. The chair pressed "Propose awards" just before the
		// answer came back, and the Awards page arrives only after it.
		const roomPath = '/conferences/test-mun/committees/unsc/chair';
		const pageChange = navigating as { complete: Promise<void> | null };
		let endPageChange: () => void = () => undefined;
		window.history.replaceState({}, '', `${roomPath}?end=confirm`);
		const form = createInstantForm({ describeFailure: () => 'The session did not end.' });

		const sent = press(form, 'france', 'present');
		pageChange.complete = new Promise<void>((resolve) => {
			endPageChange = () => {
				window.history.replaceState({}, '', `${roomPath}/awards`);
				pageChange.complete = null;
				resolve();
			};
		});
		const answered = sent.answer({ type: 'redirect', status: 303, location: roomPath });
		await new Promise((resolve) => setTimeout(resolve, 0));
		endPageChange();
		await answered;

		expect(goto).not.toHaveBeenCalled();
		expect(invalidateAll).toHaveBeenCalledOnce();
	});

	it('shows its success toast the moment it is pressed, and drops it once the page is read', async () => {
		const form = createInstantForm({
			describeFailure: () => 'France was not marked.',
			describeSuccess: () => 'France marked.'
		});

		const sent = press(form, 'france', 'present');

		expect(toastShownAtOnce()).toEqual({ tone: 'success', message: 'France marked.' });

		await sent.answer(SAVED);

		expect(toastShownAtOnce()).toBeNull();
	});

	it('takes the success toast back when the press fails', async () => {
		const form = createInstantForm({
			describeFailure: () => 'France was not marked.',
			describeSuccess: () => 'France marked.'
		});

		const sent = press(form, 'france', 'present');
		await sent.answer({ type: 'error', status: 500, error: new Error('down') });

		expect(toastShownAtOnce()).toBeNull();
	});
});
