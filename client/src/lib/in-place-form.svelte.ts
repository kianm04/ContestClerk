/**
 * What every form of the app shares once JavaScript has loaded: it
 * sends in the background, the page answers in place instead of reloading,
 * and a button cannot be pressed twice while its request is on its way.
 *
 * A component makes one with `createInPlaceForm()` and hands its `submit` to
 * SvelteKit's `use:enhance` on the `<form>`. Without JavaScript `use:enhance`
 * never runs, so the same form posts and reloads the page exactly as before.
 *
 * This is for a form whose result the browser cannot work out for itself:
 * signing in, paying, uploading, or creating something whose address the
 * server chooses. Its button passes `isBusy` or `isSending()` to `Button`'s
 * `isLoading`, and `Button` shows a spinner only if the answer is slow. A form
 * whose result the browser can work out, such as a roll call answer, uses
 * `createInstantForm()` from `$lib/instant-form.svelte.ts` instead: it shows
 * the result at once, queues presses and shows no spinner at all (T140).
 *
 * The file ends in `.svelte.ts` because it uses `$state`, which Svelte only
 * understands in `.svelte` files and in modules named like this one.
 */
import type { ActionResult, SubmitFunction } from '@sveltejs/kit';
// `applyAction` shows an action's answer the way a full page load would have.
import { applyAction } from '$app/forms';
// `goto` moves to an address without reloading; `invalidateAll` runs every
// `load` of the page again.
import { goto, invalidateAll } from '$app/navigation';
// `navigating` describes the page change under way right now, if any.
import { navigating } from '$app/state';
import type { Flash } from '$lib/flash';

/** Shown when the request never reached the server, or its answer never came back. */
export const NETWORK_FAILURE_MESSAGE =
	'That did not reach the server. Check your connection and try again.';

/** Shown when the server broke while doing the work, rather than refusing it. */
export const SERVER_FAILURE_MESSAGE = 'Something went wrong on our side. Try that again.';

export type InPlaceFormOptions = {
	/**
	 * Called the moment the form is sent, before the server has answered. A
	 * component shows a result it is certain of here, such as a started timer.
	 * `action` is the address the press posts to; its `search` is the form
	 * action, such as `?/timerStart`.
	 */
	onSend?: (formData: FormData, action: URL) => void;
	/**
	 * Called once the page shows the server's answer, whether it saved,
	 * refused or never arrived. A component drops what `onSend` showed here, so
	 * the screen is left with the true state. `formElement` is the form that
	 * was sent, for a component that puts the cursor back in one of its fields.
	 */
	onSettle?: (formElement: HTMLFormElement) => void;
	/**
	 * Called the moment the form is pressed; the request is held back until the
	 * promise it returns settles, while the button shows it is busy. The
	 * committee room's "Start session" waits here for the chair's presses still
	 * on their way, such as "End session", so the server receives them in the
	 * order they were made (T184).
	 */
	waitBeforeSending?: () => Promise<void>;
	/**
	 * Empty the fields once the server has saved. Only for a form that adds
	 * something new, such as a note: a form that edits a value must keep it.
	 */
	isResetAfterSave?: boolean;
};

export type InPlaceForm = {
	/** True while a request is on its way, so the form's buttons can say so. */
	readonly isBusy: boolean;
	/**
	 * True while the press posting to `formAction` is on its way. `formAction` is
	 * the address the button posts to, either short (`?/timerAdd`) or whole
	 * (`/conferences/…/chair/papers?/approve`).
	 */
	isSending: (formAction: string) => boolean;
	/** Hand this to `use:enhance`. */
	readonly submit: SubmitFunction;
};

/** The error the root layout's toast shows when the request broke rather than was refused. */
function failureFlash(result: Extract<ActionResult, { type: 'error' }>): Flash {
	// A request that never got an answer has no status at all.
	const message = result.status === undefined ? NETWORK_FAILURE_MESSAGE : SERVER_FAILURE_MESSAGE;

	return { tone: 'error', message };
}

/**
 * Wait until no page change is under way. A second press can start its own
 * page change before the first has drawn its fresh data; SvelteKit then drops
 * the first, and its `goto` returns early. Waiting here keeps what the first
 * press showed on screen until the data that replaces it has arrived.
 * `$lib/instant-form.svelte.ts` waits here for the same reason.
 *
 * `invalidateAll` can abort a page change without SvelteKit clearing
 * `navigating`, which then keeps listing a change that has already ended.
 * Waiting on that same change again would never let the browser do anything
 * else and would freeze the tab, so a change is waited for only once (T140).
 */
export async function waitForPageChanges(): Promise<void> {
	let endedPageChange: Promise<void> | null = null;

	while (navigating.complete && navigating.complete !== endedPageChange) {
		endedPageChange = navigating.complete;
		// A dropped page change rejects its promise; that is not a failure here.
		await endedPageChange.catch(() => undefined);
	}
}

/**
 * Show the server's answer on the page without reloading it.
 *
 * Most actions redirect back to their own page (a 303), so without
 * JavaScript the browser loads the page again. Here the same address is read
 * again in the background instead, keeping the scroll position and the
 * keyboard focus where they were. A refusal (`fail(400, { flash })`) lands in
 * `page.form`, which the root layout shows as a toast.
 */
async function showAnswer(result: ActionResult, formElement: HTMLFormElement, isReset: boolean) {
	const isSaved = result.type === 'redirect' || result.type === 'success';

	if (isSaved && isReset) formElement.reset();

	if (result.type === 'redirect') {
		const target = new URL(result.location, window.location.href);

		// A redirect to another page is a real move, which scrolls to the top as usual.
		if (target.pathname !== window.location.pathname) {
			await applyAction(result);
			return;
		}

		// eslint-disable-next-line svelte/no-navigation-without-resolve -- the server's own redirect back to this page, so there is no route for `resolve()` to build
		await goto(target, { invalidateAll: true, noScroll: true, keepFocus: true }).catch(
			() => undefined
		);
		return;
	}

	if (result.type === 'success') {
		await invalidateAll();
		await applyAction(result);
		return;
	}

	if (result.type === 'error') {
		// Showing it as a refusal keeps the reader on the page with a message,
		// instead of swapping the whole page for the error page.
		await applyAction({
			type: 'failure',
			status: result.status ?? 500,
			data: { flash: failureFlash(result) }
		});
		return;
	}

	await applyAction(result);
}

/** A form that answers in place. Call it once in a component's `<script>`. */
export function createInPlaceForm(options: InPlaceFormOptions = {}): InPlaceForm {
	// `$state` makes every button that reads `isBusy` redraw when it changes.
	let isBusy = $state(false);
	// The whole address the press on its way posts to, or null.
	let sendingAddress: string | null = $state(null);

	const submit: SubmitFunction = async ({ action, cancel, formData }) => {
		// A second press while the first is on its way does nothing at all.
		if (isBusy) {
			cancel();
			return;
		}

		isBusy = true;
		sendingAddress = action.href;
		options.onSend?.(formData, action);

		// SvelteKit sends the request only once this function has returned.
		await options.waitBeforeSending?.();

		// SvelteKit calls this once the server has answered, or failed to.
		return async ({ result, formElement }) => {
			try {
				await showAnswer(result, formElement, options.isResetAfterSave ?? false);
				await waitForPageChanges();
			} finally {
				isBusy = false;
				sendingAddress = null;
				options.onSettle?.(formElement);
			}
		};
	};

	return {
		get isBusy() {
			return isBusy;
		},
		isSending(formAction: string) {
			if (!isBusy) return false;

			// The page's own address fills in whatever a short `formAction` leaves out.
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- a throwaway inside this one function, not state the page is drawn from
			return new URL(formAction, window.location.href).href === sendingAddress;
		},
		submit
	};
}
