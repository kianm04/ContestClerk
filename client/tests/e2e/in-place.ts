import { test, type Page, type TestInfo } from '@playwright/test';

// What a browser test needs to show that a press answered in place (T124,
// T125) rather than reloading the page.
//
// A reload throws away everything the page's script has put on `window`, so a
// test leaves a marker there before pressing a button and checks it is still
// there afterwards.

/** Skip a test that needs the page's script on the project that has none. */
export function skipWithoutJavaScript(testInfo: TestInfo): void {
	test.skip(
		testInfo.project.use.javaScriptEnabled === false,
		'Answering in place is what the page script adds.'
	);
}

/** Leave a marker on `window`, which only a reload of the page removes. */
export async function markPage(page: Page): Promise<void> {
	await page.evaluate(() => {
		(window as Window & { inPlaceMarker?: string }).inPlaceMarker = 'still here';
	});
}

/** Whether the marker `markPage` left is still there, so the page has not reloaded. */
export async function readMarker(page: Page): Promise<string | undefined> {
	return page.evaluate(() => (window as Window & { inPlaceMarker?: string }).inPlaceMarker);
}
