/**
 * Reading a committee room again when realtime says something in it changed,
 * without spoiling what the reader is in the middle of
 * (`specs/02-architecture/realtime.md`). `RoomLiveUpdates` listens to the
 * room and calls `request` for every change it hears; this file decides when
 * the reload may run.
 *
 * It is a `.svelte.ts` file because it uses `$effect`, which only works in a
 * component or in a module like this one, called while a component is being
 * set up.
 */

// `invalidate` tells SvelteKit that the data behind a `depends` name is out
// of date, and it runs every `load` that registered that name again.
import { invalidate } from '$app/navigation';
// `navigating` describes the link the reader is following right now. Its
// `type` is null when no navigation is under way.
import { navigating } from '$app/state';
import { isAnyInstantFormSending, whenInstantFormsAnswered } from '$lib/instant-form.svelte';

/** Asks for the room to be read again; it runs as soon as nothing stands in its way. */
export type RoomReload = {
	request: () => void;
};

/**
 * The room's reload. `dependency` gives the `depends` name the room's `load`
 * functions registered (`committeeRoomDependency`), read each time a reload
 * runs. Call it while a component is being set up: it starts an `$effect`.
 */
export function createRoomReload(dependency: () => string): RoomReload {
	// True when a change arrived while a navigation was still loading, and the
	// room has not been read again since. A plain variable, not `$state`: the
	// effect below only needs to run again when the navigation ends.
	let isReloadWaiting = false;
	// True while a change waits for the reader's own presses to be answered.
	let isWaitingForPresses = false;

	/** Something in the room changed: read the room again. */
	function request() {
		// SvelteKit lets a reload cancel a navigation that is still loading. A
		// change arriving just after the reader clicked a link would swallow the
		// click, so the reload waits until the navigation has finished.
		if (navigating.type !== null) {
			isReloadWaiting = true;
			return;
		}

		// A press of an instant form reads the whole page again once it is
		// answered, and that reading carries the toast its action left. A reload
		// started meanwhile would replace it and lose the toast, so the change
		// waits until the presses are answered (`$lib/instant-form.svelte.ts`).
		if (isAnyInstantFormSending()) {
			reloadOncePressesAreAnswered();
			return;
		}

		invalidate(dependency());
	}

	/** Read the room again once the presses are answered, however many changes arrived. */
	async function reloadOncePressesAreAnswered() {
		if (isWaitingForPresses) return;

		isWaitingForPresses = true;
		await whenInstantFormsAnswered();
		isWaitingForPresses = false;
		request();
	}

	// `$effect` runs again whenever `navigating.type` changes, so whenever a
	// navigation starts or ends. Once it has ended, a reload that had to wait
	// is carried out.
	$effect(() => {
		if (navigating.type !== null || !isReloadWaiting) return;

		isReloadWaiting = false;
		invalidate(dependency());
	});

	return { request };
}
