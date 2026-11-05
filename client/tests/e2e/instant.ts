import type { Page, Route } from '@playwright/test';
import { BUSY_INDICATOR_DELAY_MS } from '../../src/lib/button-classes';

// What a browser test needs to show that a press changed the screen at once
// (T140, T142): that the result was there before the server answered, that no
// spinner ever appeared, and that a press the server refused went back.
// `roll-call-instant.spec.ts` holds the first copy of these, from T140.

/** How long a press may take to show on screen and still count as "at once". */
export const AT_ONCE_TIMEOUT_MS = 500;

/**
 * How long each answer is held back, longer than the spinner's delay, so a
 * spinner would have had time to appear if one were drawn.
 */
export const SLOW_ANSWER_MS = BUSY_INDICATOR_DELAY_MS + 300;

/**
 * Whether `url` posts to the form action `actionName`, such as `assign`.
 * SvelteKit reads the action from the one query key that starts with a slash,
 * which a page with a filter in its address puts after the filter.
 */
function postsTo(url: URL, actionName: string): boolean {
	return url.searchParams.has(`/${actionName}`);
}

/** Hold back every answer to the action `actionName` by `SLOW_ANSWER_MS`. */
export async function answerSlowly(page: Page, actionName: string): Promise<void> {
	await page.route(
		(url) => postsTo(url, actionName),
		async (route: Route) => {
			await new Promise((resolve) => setTimeout(resolve, SLOW_ANSWER_MS));
			await route.continue();
		}
	);
}

/** Answer every press of the action `actionName` with a server error. */
export async function answerWithError(page: Page, actionName: string): Promise<void> {
	await page.route(
		(url) => postsTo(url, actionName),
		(route: Route) => route.fulfill({ status: 500, body: 'Internal Server Error' })
	);
}

/**
 * Record whether a spinner (`.animate-spin`) ever appears on the page from now
 * on. Playwright's own checks only look now and then; this sees every change.
 */
export async function watchForSpinners(page: Page): Promise<void> {
	await page.evaluate(() => {
		const record = window as Window & { spinnerSeen?: boolean };
		record.spinnerSeen = document.querySelector('.animate-spin') !== null;
		new MutationObserver(() => {
			if (document.querySelector('.animate-spin')) record.spinnerSeen = true;
		}).observe(document.body, { subtree: true, childList: true, attributes: true });
	});
}

/** Whether `watchForSpinners` saw a spinner. */
export async function sawSpinner(page: Page): Promise<boolean | undefined> {
	return page.evaluate(() => (window as Window & { spinnerSeen?: boolean }).spinnerSeen);
}
