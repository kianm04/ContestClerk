import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { createTestUser, signIn } from './signed-in-user';
import { ELEANOR, SAMUEL } from './walkthrough-seed';

// The top bar each reader gets and the two menus of a phone (T165): "Manage"
// only for somebody who organises, "Applications" only for somebody who has
// applied, one search box on the conference list, a hamburger whose rows a thumb
// can hit and which is shut again on the page it leads to, and an organiser's
// section menu that opens without JavaScript and is shut on the page it leads
// to. Every test runs on desktop, desktop-no-js and phone, except the
// hamburger's, which needs JavaScript to open.
//
// Samuel and Eleanor are the walkthrough seed's accounts
// (`supabase/walkthrough-seed.sql`): Samuel chairs a committee and organises
// nothing, Eleanor organises every Northbridge conference. Nothing here changes
// their rows, so there is nothing to put back.

/** How long a page that reads the database gets to answer, as elsewhere. */
const DATABASE_TIMEOUT_MS = 15_000;

/** A phone's window, the size of the `phone` project, for the menu tests. */
const PHONE_VIEWPORT = { width: 390, height: 844 };

/** The height a row of a menu must reach, so a thumb can hit it (WCAG 2.5.5). */
const MIN_ROW_HEIGHT_PX = 44;

/** The organiser page the section menu test opens, one of Eleanor's conferences. */
const ELEANOR_CONFERENCE_SLUG = 'northbridge-running-today';

/**
 * Wherever the top bar's links are on show. On a phone they sit in the
 * hamburger's panel, which is drawn only once the button opens it, and outside
 * the bar, as a dialog over the page.
 */
async function openTopBar(page: Page, testInfo: TestInfo): Promise<Locator> {
	const topBar = page.getByRole('banner');

	await expect(topBar.getByRole('link', { name: 'MUNMeet' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	if (testInfo.project.name === 'phone') {
		await topBar.getByRole('button', { name: 'Menu' }).click();
		return page.getByRole('dialog', { name: 'Menu' });
	}

	return topBar;
}

/** Every link of a menu is a row at least `MIN_ROW_HEIGHT_PX` tall. */
async function expectRowsTallEnough(links: Locator): Promise<void> {
	const count = await links.count();
	expect(count).toBeGreaterThan(0);

	for (let index = 0; index < count; index++) {
		const box = await links.nth(index).boundingBox();
		expect(box?.height ?? 0).toBeGreaterThanOrEqual(MIN_ROW_HEIGHT_PX);
	}
}

test('shows "Manage" to an organiser and to nobody else', async ({ page }, testInfo) => {
	await signIn(page, SAMUEL);
	const samuelsBar = await openTopBar(page, testInfo);

	// Samuel is on a committee's staff as its chair, which is not organising.
	await expect(samuelsBar.getByRole('link', { name: 'Schedule' })).toBeVisible();
	await expect(samuelsBar.getByRole('link', { name: 'Manage', exact: true })).toHaveCount(0);

	await page.context().clearCookies();
	await signIn(page, ELEANOR);
	const eleanorsBar = await openTopBar(page, testInfo);

	await expect(eleanorsBar.getByRole('link', { name: 'Manage', exact: true })).toBeVisible();
});

test('shows "Applications" only to somebody who has applied', async ({ page }, testInfo) => {
	const user = await createTestUser('Lucía Fernández');
	await signIn(page, user);

	const topBar = await openTopBar(page, testInfo);

	await expect(topBar.getByRole('link', { name: 'Schedule' })).toBeVisible();
	await expect(topBar.getByRole('link', { name: 'Applications' })).toHaveCount(0);
});

test('has one search box on the conference list, the list’s own', async ({ page }) => {
	await page.goto('/conferences');

	await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	// Counted as elements rather than as what is on screen, so a second box
	// hidden at this width would still be found.
	await expect(page.locator('input[type="search"]')).toHaveCount(1);
});

test('the hamburger has rows a thumb can hit and is shut on the page it leads to', async ({
	page
}, testInfo) => {
	// The panel is a shadcn Sheet, which only JavaScript opens.
	test.skip(testInfo.project.name === 'desktop-no-js', 'the hamburger needs JavaScript');

	await page.setViewportSize(PHONE_VIEWPORT);
	await page.goto('/terms');

	await page.getByRole('banner').getByRole('button', { name: 'Menu' }).click();
	const menu = page.getByRole('dialog', { name: 'Menu' });

	await expectRowsTallEnough(menu.getByRole('link'));

	await menu.getByRole('link', { name: 'Conferences' }).click();

	await expect(page).toHaveURL('/conferences', { timeout: DATABASE_TIMEOUT_MS });
	await expect(menu).toHaveCount(0);
});

test('the organiser’s section menu opens without JavaScript and is shut on the page it leads to', async ({
	page
}) => {
	await page.setViewportSize(PHONE_VIEWPORT);
	await signIn(page, ELEANOR);
	await page.goto(`/manage/${ELEANOR_CONFERENCE_SLUG}`);

	const manageNavigation = page.getByRole('navigation', { name: 'Manage' });
	const sectionMenu = manageNavigation.locator('details');

	// The button names the page being read, so the reader knows where they are.
	await expect(manageNavigation.locator('summary')).toHaveText('Dashboard', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await manageNavigation.locator('summary').click();

	await expectRowsTallEnough(sectionMenu.getByRole('link'));

	await sectionMenu.getByRole('link', { name: 'Details' }).click();

	await expect(page).toHaveURL(`/manage/${ELEANOR_CONFERENCE_SLUG}/details`, {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(manageNavigation.locator('summary')).toHaveText('Details');
	await expect(sectionMenu).not.toHaveAttribute('open');
});
