/**
 * The moment the room's clocks are drawn at, on the server's clock, moved on
 * while a clock runs: the caucus clock line of the Mod view, and the Unmod
 * view's clock and its "back at", which moves on even while paused.
 *
 * It does what the speaker's clock (`room/floor/FloorTimer.svelte`) does for
 * itself, for the components that draw more than one thing from the time.
 * The file ends in `.svelte.ts` because it uses `$state` and `$effect`, which
 * Svelte only understands in `.svelte` files and in modules named like this
 * one. Call it once, at the top of a component's `<script>`.
 */

import { serverNow } from '$lib/clock-offset';

/** The time, read again whenever it is asked for. */
export type RoomNow = {
	readonly now: Date;
};

/**
 * A moment that moves on every `tickMs()` milliseconds, or stands still while
 * `tickMs()` answers null. Both arguments are functions so that the
 * component's own values are read afresh each time: Svelte then knows to
 * start or stop the ticking when they change. `clockOffsetMs()` is how far
 * the server's clock is ahead of this browser's (`$lib/clock-offset.ts`).
 */
export function createRoomNow(tickMs: () => number | null, clockOffsetMs: () => number): RoomNow {
	// `$state` makes whatever reads `now` redraw when the browser's clock is
	// read again. It holds milliseconds, a plain number, rather than a `Date`.
	let browserNowMs = $state(Date.now());

	// `$effect` talks to something outside Svelte, here the browser's clock. It
	// runs in the browser only, again whenever `tickMs()` changes, and reads the
	// clock at once so a new speed never starts from an old moment. The
	// function it returns stops the ticking.
	$effect(() => {
		const interval = tickMs();

		if (interval === null) return;

		browserNowMs = Date.now();
		const timer = setInterval(() => {
			browserNowMs = Date.now();
		}, interval);

		return () => clearInterval(timer);
	});

	return {
		get now() {
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- a new moment each time it is read, never changed afterwards
			return serverNow(clockOffsetMs(), new Date(browserNowMs));
		}
	};
}
