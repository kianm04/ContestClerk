import type { Locator, Page } from '@playwright/test';

// The organiser area's own navigation, named "Manage this conference", from a
// browser test's side. `getByRole` matches part of a name, so "Manage" finds it.
//
// From `lg` up it is the sidebar beside the page, with every link on show. Under
// `lg` it is a section menu instead (T165): a `<details>` that is shut until its
// button is pressed, and the browser does not draw the inside of a shut
// `<details>`, so neither a screen reader nor `getByRole` can find a link there.

/** Tailwind's `lg` breakpoint, 64rem, where the sidebar takes over from the section menu. */
const SIDEBAR_MIN_WIDTH_PX = 1024;

/**
 * The "Manage" navigation of an organiser page, opened when it is a section menu,
 * so a test can find its links on every project.
 */
export async function openManageNavigation(page: Page): Promise<Locator> {
	const navigation = page.getByRole('navigation', { name: 'Manage' });
	const viewportWidth = page.viewportSize()?.width ?? SIDEBAR_MIN_WIDTH_PX;

	if (viewportWidth < SIDEBAR_MIN_WIDTH_PX) {
		// `<summary>` is the button of a `<details>`; pressing it opens the
		// details with or without JavaScript.
		await navigation.locator('summary').click();
	}

	return navigation;
}
