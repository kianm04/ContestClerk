/**
 * Whether the browser is leaving the page for another address.
 *
 * Safari cancels every request of a page the moment the reader leaves it: an
 * address typed, a reload, a link SvelteKit does not handle itself. When the
 * cancelled request is SvelteKit reading the page's data again (a room page
 * does that whenever realtime hears a change), SvelteKit counts it as a failed
 * load and loads the old page's address instead, over the one the reader asked
 * for. `handleError` in `src/hooks.client.ts` runs before that fallback, and it
 * asks here whether to hold the failure back (T154).
 */

/**
 * How long after the browser starts to leave a failure is held back. A page
 * that has really gone is gone long before this. One that is still here (the
 * address was a download, say) then fails the way it always did.
 */
export const LEAVING_GRACE_MS = 30_000;

/** When the browser last started to leave the page, or null if it has not. */
let leavingStartedAt: number | null = null;

/** The events of `window` this module listens to, so a test can hand in its own. */
type LeavingEvents = Pick<Window, 'addEventListener'>;

/**
 * Start noticing when the browser leaves the page. `beforeunload` fires first
 * on every way out, before Safari cancels anything. `pageshow` fires when the
 * back button brings a page back from the browser's memory, still running.
 */
export function watchForPageLeaving(browserWindow: LeavingEvents): void {
	browserWindow.addEventListener('beforeunload', () => {
		leavingStartedAt = Date.now();
	});
	browserWindow.addEventListener('pageshow', () => {
		leavingStartedAt = null;
	});
}

/** True from the moment the browser starts to leave the page until `LEAVING_GRACE_MS` later. */
export function isLeavingPage(): boolean {
	if (leavingStartedAt === null) return false;

	return Date.now() - leavingStartedAt < LEAVING_GRACE_MS;
}

/**
 * Wait `LEAVING_GRACE_MS`. On a page that is being left this never finishes,
 * because the page is gone first, and whatever waits on it never runs.
 */
export function waitForPageToGo(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, LEAVING_GRACE_MS));
}
