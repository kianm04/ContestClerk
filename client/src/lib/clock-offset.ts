/**
 * The server's clock as a browser reckons it.
 *
 * The room's timer is stored as the moment it runs out, taken from the
 * server's clock, and every screen counts down to it on its own
 * (`specs/02-architecture/realtime.md`). A phone or laptop clock can be off
 * from the server's by whole seconds, so a screen that compared the stored
 * moment with its own clock would show the wrong time. Instead every page that
 * draws a timer is told the server's time with its data, and works out how far
 * the server's clock is ahead of its own (T139).
 *
 * The same module decides which moment a timer press happened at: the chair's
 * browser sends it with the press, so the server stores exactly the timer the
 * chair's screen already shows.
 */

/**
 * One reading of how many milliseconds the server's clock is ahead of the
 * browser's (negative when it is behind): the server's time `serverTime`,
 * taken while its `load` ran, against the browser's time `browserNow` when the
 * answer arrived.
 *
 * The answer took a moment to travel, so the reading is always a little lower
 * than the true difference, never higher.
 */
export function clockOffsetSample(serverTime: string, browserNow: Date): number {
	return new Date(serverTime).getTime() - browserNow.getTime();
}

/** The best guess so far of how far the server's clock is ahead of the browser's. */
export type ClockOffsetGuess = {
	/**
	 * Take one more reading from `clockOffsetSample` into account, and answer
	 * the best guess so far in milliseconds.
	 */
	learn: (sampleMs: number) => number;
};

/**
 * A guess that keeps the highest reading it has been given. Every reading is
 * lower than the truth by the time its answer spent travelling, so the highest
 * is the closest. It also means the guess only ever moves one way: the server's
 * time as the page reckons it only ever jumps forward, and a clock counting
 * down only ever steps down, never back up.
 */
export function createClockOffsetGuess(): ClockOffsetGuess {
	// A plain variable, not `$state`: the guess is read again whenever a new
	// reading arrives, which is what makes the page redraw.
	let bestSampleMs: number | null = null;

	return {
		learn(sampleMs: number): number {
			if (bestSampleMs === null || sampleMs > bestSampleMs) bestSampleMs = sampleMs;

			return bestSampleMs;
		}
	};
}

/**
 * The server's time at the browser's moment `browserNow` (by default this
 * moment), as a browser `clockOffsetMs` behind the server reckons it.
 */
export function serverNow(clockOffsetMs: number, browserNow: Date = new Date()): Date {
	return new Date(browserNow.getTime() + clockOffsetMs);
}

/** The field a timer press carries the moment it was pressed in, on the server's clock. */
export const PRESSED_AT_FIELD = 'pressedAt';

/**
 * How long before the server reads a press the chair may have pressed it. A
 * press that says it is older than this, or newer than the server's own time,
 * is not believed.
 */
export const PRESSED_AT_TOLERANCE_MS = 10_000;

/**
 * The moment a timer press happened, for the server to work the timer out
 * from. The chair's browser sends its own reckoning of the server's time in
 * `pressedAt`, and using it means the stored timer is exactly the one the
 * chair's screen started showing at the press. A press without one (a form
 * sent without JavaScript), or with one that cannot be right, happened at
 * `serverTime`, the moment the server read it.
 */
export function pressedMoment(pressedAt: FormDataEntryValue | null, serverTime: Date): Date {
	if (typeof pressedAt !== 'string') return serverTime;

	const pressed = new Date(pressedAt);
	const millisecondsAgo = serverTime.getTime() - pressed.getTime();

	// `NaN` (a value that is not a time) fails both comparisons.
	const isBelievable = millisecondsAgo >= 0 && millisecondsAgo <= PRESSED_AT_TOLERANCE_MS;

	return isBelievable ? pressed : serverTime;
}
