import { expect, type Locator } from '@playwright/test';

/**
 * Checks that `picture` is a real `<img>` the browser has drawn.
 *
 * Two things can look like a picture and not be one. A conference or an
 * organisation with no file shows its initials in a `role="img"` box, which a
 * screen reader names the same way as the photograph. And a file missing from
 * the bucket still leaves an `<img>` on the page, only one with no width of its
 * own. `naturalWidth` is the width of the file the browser really loaded, so it
 * is zero in both cases and more than zero only for a real picture.
 */
export async function expectPictureDrawn(picture: Locator): Promise<void> {
	await picture.scrollIntoViewIfNeeded();
	await expect(picture).toBeVisible();
	await expect
		.poll(() =>
			picture.evaluate((element: Element) =>
				element instanceof HTMLImageElement ? element.naturalWidth : 0
			)
		)
		.toBeGreaterThan(0);
}
