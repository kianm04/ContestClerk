/**
 * A form whose result the browser can work out for itself, such as a roll
 * call answer: the screen changes the moment it is pressed, the request goes
 * to the server in the background on the assumption that it will succeed, and
 * no spinner is ever shown (T140).
 *
 * How it behaves:
 *
 * - Every press is kept in `presses`, oldest first. The component draws the
 *   page's data with those presses applied on top, so the answer shows at once.
 * - Presses queue instead of being dropped. They are sent one at a time, in
 *   the order they were made, so the last one wins on screen and in the
 *   database.
 * - Fresh page data arriving meanwhile, from a realtime update say, cannot undo
 *   a press, because the press stays in `presses` until its result is in the
 *   page's data. Once every press has been answered, the page reads its data
 *   again once, and only then are the presses dropped.
 * - A press that is refused or never arrives is dropped at once, so that one
 *   thing goes back to what the database holds, and a toast names what failed.
 * - A press can carry what it is expected to change (`submitExpecting`), worked
 *   out by the component at the moment of the press. The committee room keeps
 *   it with the press and draws it on top of the page's data (T141).
 *
 * A component makes one with `createInstantForm()` and hands its `submit` to
 * SvelteKit's `use:enhance` on the `<form>`, as with `createInPlaceForm()` in
 * `$lib/in-place-form.svelte.ts`. That one is for forms the browser cannot
 * predict (signing in, uploading, creating something whose address the server
 * chooses): they refuse a second press while the first is on its way. Without
 * JavaScript `use:enhance` never runs, so both kinds post and reload the page.
 *
 * The file ends in `.svelte.ts` because it uses `$state`, which Svelte only
 * understands in `.svelte` files and in modules named like this one.
 */
import type { ActionResult, SubmitFunction } from '@sveltejs/kit';
// `applyAction` shows an action's answer the way a full page load would have.
import { applyAction } from '$app/forms';
// `invalidateAll` runs every `load` of the page again. `goto` moves to another address.
import { goto, invalidateAll } from '$app/navigation';
import { isFlash, type Flash } from '$lib/flash';
import { waitForPageChanges } from '$lib/in-place-form.svelte';

/** Added to the toast when the request never reached the server, or its answer never came back. */
export const INSTANT_NETWORK_REASON = 'Check your connection and try again.';

/** Added to the toast when the server refused without saying why in a message. */
export const INSTANT_FORM_REASON = 'Check the form and try again.';

/** Added to the toast when the server broke while doing the work. */
export const INSTANT_SERVER_REASON = 'Something went wrong on our side. Try that again.';

/**
 * Marks a form while any press of it is still on its way or its result not yet
 * in the page's data. A browser test waits for it to go (`waitUntilAnswered`).
 */
export const SENDING_ATTRIBUTE = 'data-sending';

/*
	How many instant forms on the page have presses on their way. The page's
	`<body>` carries `SENDING_ATTRIBUTE` too while any has, because a press can
	take its own form off the screen: adding a seat to the list takes it out of
	"Seats to add". Nothing on screen is drawn from this, so it is a plain
	number shared by every form rather than state.
*/
let sendingFormCount = 0;

/*
	Settles once `sendingFormCount` is back to 0, which is when every press on
	the page has been answered and its result read. A new one is made each time
	the first form starts sending.
*/
let allPressesAnswered: Promise<void> = Promise.resolve();
let resolveAllPressesAnswered = () => {};

/*
	The toast a press shows the moment it is made, such as "Profile saved.",
	until the page has read its data again or the press has failed. The root
	layout draws it (`toastShownAtOnce`). Why module state rather than a prop:
	the form that is pressed sits deep inside a page, and the toast is drawn by
	the root layout around every page, which a page cannot hand anything up to.
	It is only ever set in the browser, at a press, so a page drawn on the
	server never sees one.
*/
let atOnceToast: Flash | null = $state(null);

/**
 * The toast a press has shown before the server answered, or null. The root
 * layout shows it unless an action's own answer carries one.
 */
export function toastShownAtOnce(): Flash | null {
	return atOnceToast;
}

/**
 * Whether any instant form on the page has a press on its way, or is still
 * reading the page again after its last one.
 */
export function isAnyInstantFormSending(): boolean {
	return sendingFormCount > 0;
}

/**
 * Settles once no instant form on the page is sending any more. The room's
 * realtime listener waits for it before reading the room again: SvelteKit
 * drops the result of a reload when another one starts while it is loading,
 * and the instant form's own reload is the one that carries the toast the
 * action left for it (a vote's "Passed 2–0–0."), which would then be lost.
 */
export function whenInstantFormsAnswered(): Promise<void> {
	return allPressesAnswered;
}

/**
 * One press of the form: what it sent and where. `Expected` is the kind of
 * note `submitExpecting` keeps with it; a form that keeps none has `null`.
 */
export type InstantPress<Expected = null> = {
	/** Tells two presses with the same fields apart. */
	id: number;
	/** The fields sent, including the pressed button's own `name` and `value`. */
	formData: FormData;
	/** The form action posted to; its `search` is the action, such as `?/setStatus`. */
	action: URL;
	/** What the press is expected to change, or null when the component did not say. */
	expected: Expected | null;
};

export type InstantFormOptions<Expected = null> = {
	/**
	 * The sentence the toast starts with when `press` fails, naming what did not
	 * happen: "France was not marked present." The reason follows it.
	 */
	describeFailure: (press: InstantPress<Expected>) => string;
	/**
	 * The success toast shown the moment `press` is made, such as "Profile
	 * saved.", for a form whose only visible result is being saved. A failure
	 * replaces it with its own toast. Leave it out, or return null, for none.
	 */
	describeSuccess?: (press: InstantPress<Expected>) => string | null;
};

/** What SvelteKit hands a form's `use:enhance` function the moment it is sent. */
export type InstantSubmitInput = Parameters<SubmitFunction>[0];

export type InstantForm<Expected = null> = {
	/** The presses the screen shows on top of the page's data, oldest first. */
	readonly presses: InstantPress<Expected>[];
	/** Hand this to `use:enhance`. */
	readonly submit: SubmitFunction;
	/**
	 * Hand this to `use:enhance` instead of `submit` to keep a note of what each
	 * press will change. `expect` runs at the moment of the press, before
	 * anything is sent, so it may also add fields to `input.formData`. It
	 * returns null for a press whose result it cannot foresee.
	 */
	readonly submitExpecting: (
		expect: (input: InstantSubmitInput) => Expected | null
	) => SubmitFunction;
};

/** Why a press failed, as the second half of its toast. */
function failureReason(result: ActionResult): string {
	// A refusal (`fail(400, { flash })`) says why in its own words.
	const flash = result.type === 'failure' ? result.data?.flash : undefined;

	if (isFlash(flash)) return flash.message;

	// A refusal without a message, such as a form sent back with its fields
	// marked, says what is wrong beside those fields.
	if (result.type === 'failure') return INSTANT_FORM_REASON;

	// A request that never got an answer has no status at all.
	if (result.type === 'error' && result.status !== undefined) return INSTANT_SERVER_REASON;

	return INSTANT_NETWORK_REASON;
}

/** Whether the answer means the press was not saved. */
function isFailed(result: ActionResult): boolean {
	return result.type === 'failure' || result.type === 'error';
}

/**
 * Where a redirect leads, read against `action`, the address the press was
 * posted to. On the server `resolve()` writes a relative address, such as
 * `../../../../conferences/mun/committees/unsc/chair`, which only means the
 * right page from the page that sent the form. The reader may have followed a
 * link since, as a chair does who presses "End session" and then "Propose
 * awards →" before the answer is back (T169).
 */
function redirectTarget(location: string, action: URL): URL {
	return new URL(location, action);
}

/** An answer that sends the reader to an address. */
type RedirectResult = Extract<ActionResult, { type: 'redirect' }>;

/**
 * Whether the answer sends the reader on from `pressedOn`, the page the press
 * was made on, as "Finish" on roll call does. A redirect back to that page
 * only asks for it to be read again, so a reader who has since followed a link
 * is not pulled back to it.
 *
 * A redirect to the page the reader is on now only asks for that page to be
 * read again as well. A notification row goes where it leads the moment it is
 * pressed, before the answer saying so is back (Trello 1txzWHCK), and following
 * the answer too would load that page a second time and scroll it to the top.
 */
function isRedirectElsewhere(
	result: ActionResult,
	action: URL,
	pressedOn: string
): result is RedirectResult {
	if (result.type !== 'redirect') return false;

	const targetPath = redirectTarget(result.location, action).pathname;

	return targetPath !== pressedOn && targetPath !== window.location.pathname;
}

/** The redirect with its address written from the site's root, so it means the same page anywhere. */
function redirectFromRoot(result: RedirectResult, action: URL): RedirectResult {
	const target = redirectTarget(result.location, action);

	return { ...result, location: `${target.pathname}${target.search}${target.hash}` };
}

/**
 * The address a redirect back to this page asks for, when it differs from the
 * one shown only in its `?` part, or null. The committee room's "Yield time"
 * is pressed on `?yield=seat` and answered with the room without it, which
 * closes the form. `pressedOn` and `pressedOnSearch` are the page and the `?`
 * part shown at the press: a reader still on that page who has followed a link
 * to another `?` part since, as a chair does who presses "Close vote" and then
 * "Open another vote" (`?vote=new`), stays there. A reader who has gone on to
 * the redirect's page from another one is still sent to its address: a
 * notification row leads to its announcement at once, and the answer may say
 * the announcement was removed since (`?removed=1`).
 */
function changedAddress(
	result: ActionResult,
	action: URL,
	pressedOn: string,
	pressedOnSearch: string
): URL | null {
	if (result.type !== 'redirect') return null;

	const target = redirectTarget(result.location, action);

	if (target.pathname !== window.location.pathname) return null;

	const isStillOnPressedPage = window.location.pathname === pressedOn;
	if (isStillOnPressedPage && window.location.search !== pressedOnSearch) return null;
	if (target.search === window.location.search) return null;

	return target;
}

/** The address shown now, from the site's root, such as `/conferences/mun/chair?end=confirm`. */
function shownAddress(): string {
	return `${window.location.pathname}${window.location.search}`;
}

/** A redirect back to the page pressed on, kept until the page is read again. */
type AddressToFollow = {
	/** The address the redirect asks for. */
	target: URL;
	/** The address shown when the answer came, which the reader must still be on. */
	answeredOn: string;
};

/**
 * A form that changes the screen at once. Call it once in a component's
 * `<script>`. `Expected` is the kind of note `submitExpecting` keeps with each
 * press, when the form uses it.
 */
export function createInstantForm<Expected = null>(
	options: InstantFormOptions<Expected>
): InstantForm<Expected> {
	// `$state` makes everything drawn from `presses` redraw when it changes.
	let presses: InstantPress<Expected>[] = $state([]);
	let nextPressId = 1;
	// The address the latest answer sent the reader back to, when it differs
	// from the one shown. It is followed when the page is read again.
	let addressToFollow: AddressToFollow | null = null;
	// Presses sent or waiting to be sent whose answer has not come back yet.
	let unansweredCount = 0;
	// Settles once the latest press has been answered; the next press waits for it.
	let queueTail: Promise<void> = Promise.resolve();
	// The forms marked with `SENDING_ATTRIBUTE`. Nothing on screen is drawn from
	// this, so it is a plain set rather than `$state`.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- not state the page is drawn from
	const markedForms = new Set<HTMLFormElement>();

	function dropPress(press: InstantPress<Expected>) {
		presses = presses.filter((kept) => kept.id !== press.id);
	}

	/** Put the failed press back and say what failed. The page is not replaced. */
	async function showFailure(press: InstantPress<Expected>, result: ActionResult) {
		dropPress(press);
		atOnceToast = null;

		const message = `${options.describeFailure(press)} ${failureReason(result)}`;
		const status = result.type === 'failure' || result.type === 'error' ? result.status : 500;
		// A refusal may send the form's fields back with a note on each, which
		// the page draws again (a motion that was refused, say), so they are kept.
		const refusalData = result.type === 'failure' ? result.data : undefined;

		// The root layout shows `flash` from an action's answer as a toast.
		await applyAction({
			type: 'failure',
			status: status ?? 500,
			data: { ...refusalData, flash: { tone: 'error', message } }
		});
	}

	/**
	 * Read the page's data again: at the address the latest answer asked for,
	 * when it changed, and otherwise at the one shown. A link the reader
	 * followed just before the answer came back may land only after it, as
	 * "Propose awards" does when pressed straight after "End session", so the
	 * address is only followed if the page shown is still the one answered on.
	 */
	async function readPageAgain() {
		const follow = addressToFollow;
		addressToFollow = null;

		if (follow === null || follow.answeredOn !== shownAddress()) {
			await invalidateAll();
			return;
		}

		// eslint-disable-next-line svelte/no-navigation-without-resolve -- the server's own redirect back to this page, so there is no route for `resolve()` to build
		await goto(follow.target, { invalidateAll: true, noScroll: true, keepFocus: true }).catch(
			() => undefined
		);
	}

	/**
	 * Read the page's data again once every press has been answered, then drop
	 * the presses it now includes. A press made while this runs is kept, and
	 * its own answer reads the data again.
	 */
	async function reloadOnce() {
		const answeredIds = presses.map((press) => press.id);

		// `invalidateAll` aborts a page change under way, so a click on another
		// tab made while the last press was being answered would be lost. Let it
		// finish first; the page it lands on is then read again.
		// `finally` takes the marks away even if reading the page throws, so the
		// room's realtime listener, which waits for them to go, is never stuck.
		try {
			await waitForPageChanges();
			await readPageAgain();
			await waitForPageChanges();
		} finally {
			// The page's data now carries the action's own message, if it left one.
			atOnceToast = null;
			presses = presses.filter((press) => !answeredIds.includes(press.id));

			if (unansweredCount === 0) unmarkForms();
		}
	}

	/** Mark `formElement`, and the page's body, as having a press on its way. */
	function markForm(formElement: HTMLFormElement) {
		if (markedForms.size === 0) {
			sendingFormCount += 1;

			// The first form on the page to start sending: the page is no longer settled.
			if (sendingFormCount === 1) {
				allPressesAnswered = new Promise((resolve) => (resolveAllPressesAnswered = resolve));
			}
		}

		formElement.setAttribute(SENDING_ATTRIBUTE, '');
		markedForms.add(formElement);
		document.body.setAttribute(SENDING_ATTRIBUTE, '');
	}

	/** Take the marks away once every press of this form has been answered. */
	function unmarkForms() {
		if (markedForms.size === 0) return;

		for (const formElement of markedForms) formElement.removeAttribute(SENDING_ATTRIBUTE);
		markedForms.clear();
		sendingFormCount -= 1;

		if (sendingFormCount > 0) return;

		document.body.removeAttribute(SENDING_ATTRIBUTE);
		resolveAllPressesAnswered();
	}

	/** Queue one press, keeping `expected` with it. */
	async function sendPress(input: InstantSubmitInput, expected: Expected | null) {
		const { action, formData, formElement } = input;
		const pressedOn = window.location.pathname;
		const pressedOnSearch = window.location.search;
		const press: InstantPress<Expected> = { id: nextPressId, formData, action, expected };
		nextPressId += 1;

		presses = [...presses, press];
		unansweredCount += 1;

		const successMessage = options.describeSuccess?.(press) ?? null;
		if (successMessage !== null) atOnceToast = { tone: 'success', message: successMessage };

		markForm(formElement);

		// Take a place in the queue, then wait for the press before this one to
		// be answered. SvelteKit sends the request once this function returns.
		const earlierPress = queueTail;
		let releaseQueue = () => {};
		queueTail = new Promise((resolve) => (releaseQueue = resolve));
		await earlierPress;

		// SvelteKit calls this once the server has answered, or failed to.
		return async ({ result }: { result: ActionResult }) => {
			// The server has finished with this press, so the next one may go.
			releaseQueue();

			try {
				if (isFailed(result)) await showFailure(press, result);
				else if (isRedirectElsewhere(result, action, pressedOn))
					await applyAction(redirectFromRoot(result, action));
				else {
					const target = changedAddress(result, action, pressedOn, pressedOnSearch);
					if (target !== null) addressToFollow = { target, answeredOn: shownAddress() };
				}
			} finally {
				unansweredCount -= 1;
			}

			if (unansweredCount === 0) await reloadOnce();
		};
	}

	const submit: SubmitFunction = (input) => sendPress(input, null);

	function submitExpecting(expect: (input: InstantSubmitInput) => Expected | null): SubmitFunction {
		return (input) => sendPress(input, expect(input));
	}

	return {
		get presses() {
			return presses;
		},
		submit,
		submitExpecting
	};
}
