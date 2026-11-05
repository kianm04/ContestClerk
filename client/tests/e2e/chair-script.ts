import { expect, type Page, type TestInfo } from '@playwright/test';
import { DATABASE_TIMEOUT_MS } from './chair-room-fixtures';

// Waiting for a chair page's script before pressing anything whose result the
// test reads from the script's side: the focus moving to a heading (R12), a
// press shown at once, a spinner held back (T140), a menu kept open.
//
// A chair page arrives as finished HTML, and its buttons are ordinary forms
// until Svelte takes the page over. A press made in that moment is the
// no-JavaScript press: the browser posts the form and loads the answer as a
// new page, so the focus starts at the top and no instant form ever sees the
// press. Svelte may also close a `<details>` opened in that moment, when it
// sets the menu to its own state. `waitForConsoleScript` in
// `chair-room-fixtures.ts` waits for "Connected", which only a running
// session's top bar shows; this works on every chair page, the lobby and the
// ended screen included.

/**
 * Wait until the chair page's script has taken the page over. The committee
 * menu's "Use keyboard shortcuts" switch is drawn only from `onMount`, which
 * runs once every component of the page is live, on every chair page. Without
 * JavaScript there is no script to wait for, so it returns at once.
 */
export async function waitForChairScript(page: Page, testInfo: TestInfo): Promise<void> {
	if (testInfo.project.use.javaScriptEnabled === false) return;

	await expect(page.locator('[data-committee-menu] button[aria-pressed]')).toBeAttached({
		timeout: DATABASE_TIMEOUT_MS
	});
}
