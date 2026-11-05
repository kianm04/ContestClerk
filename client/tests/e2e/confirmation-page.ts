import { expect, type Page } from '@playwright/test';

// The `/confirm` page a `ConfirmButton` falls back to when there is no
// JavaScript to open its dialog. With scripting off the first press posts to
// that page, which asks the same question the dialog would have, and only its
// own button sends the form on to the real action. `$lib/confirmation.ts`
// explains the round trip.

/**
 * Answer the confirmation page by pressing its button labelled `label`, the
 * same words the `ConfirmButton` itself carries.
 *
 * The browser tests' "press and confirm" helpers call this when no dialog
 * opened: in the `desktop-no-js` project, or on a page whose script had not
 * landed when the button was pressed.
 */
export async function answerConfirmationPage(page: Page, label: string): Promise<void> {
	await page.waitForURL((url) => url.pathname === '/confirm');

	const answer = page.getByRole('main').getByRole('button', { name: label });

	await expect(answer).toBeVisible();
	await answer.press('Enter');
}
