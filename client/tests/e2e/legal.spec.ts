import { expect, test, type Page } from '@playwright/test';

// The acceptance criteria of `specs/05-pages/public/legal.md` that need a real
// browser: both documents exist with every section, the footer reaches them,
// a contents anchor works with JavaScript switched off, the privacy policy's
// "Who sees it" table names its four audiences, and the names in the browser
// tab.

/** Every `<h2>` the terms of service carries, in reading order. */
const TERMS_HEADINGS = [
	'Who we are',
	'Accounts',
	'Organisers and conferences',
	'Fees',
	'Payments and refunds',
	'Content you upload',
	'Acceptable use',
	'Termination',
	'Liability',
	'Changes',
	'Contact'
];

/** Every `<h2>` the privacy policy carries, in reading order. */
const PRIVACY_HEADINGS = [
	'What we collect',
	'Why',
	'Who sees it',
	'Where it is stored',
	'How long',
	'Your rights',
	'Cookies',
	'Contact'
];

/** The four audiences the "Who sees it" table has a row for. */
const WHO_SEES_IT_AUDIENCES = [
	'Organisers of a conference you applied to',
	'Chairs of your committee',
	'The head of your delegation',
	'Other participants, and anyone else signed in'
];

/**
 * How much wider the page is than the window, in pixels. Anything above zero
 * means something is pushing the page sideways.
 */
async function horizontalOverflow(page: Page): Promise<number> {
	return page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
}

test('each document names itself in the browser tab', async ({ page }) => {
	await page.goto('/terms');
	await expect(page).toHaveTitle('Terms · MUNMeet');

	await page.goto('/privacy');
	await expect(page).toHaveTitle('Privacy · MUNMeet');
});

test('the terms of service has every section it promises', async ({ page }) => {
	await page.goto('/terms');

	// The footer repeats words such as "Terms" and "Contact", so everything
	// about the document itself is looked for inside `<main>`.
	const main = page.getByRole('main');

	await expect(main.getByRole('heading', { level: 1, name: 'Terms of service' })).toBeVisible();

	for (const heading of TERMS_HEADINGS) {
		await expect(main.getByRole('heading', { level: 2, name: heading, exact: true })).toBeVisible();
	}
});

test('the privacy policy has every section it promises', async ({ page }) => {
	await page.goto('/privacy');

	const main = page.getByRole('main');

	await expect(main.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeVisible();

	for (const heading of PRIVACY_HEADINGS) {
		await expect(main.getByRole('heading', { level: 2, name: heading, exact: true })).toBeVisible();
	}
});

test('the footer takes a visitor to both documents', async ({ page }) => {
	await page.goto('/conferences');

	// Following the link rather than reading its `href`: SvelteKit writes an
	// address relative to the page it is on, so the attribute reads `./terms`
	// until the browser has worked it out.
	await page.getByRole('contentinfo').getByRole('link', { name: 'Terms' }).click();
	await expect(page).toHaveURL('/terms');

	await page.goto('/conferences');

	await page.getByRole('contentinfo').getByRole('link', { name: 'Privacy' }).click();
	await expect(page).toHaveURL('/privacy');
});

test('a contents link jumps to its own section, with or without JavaScript', async ({ page }) => {
	await page.goto('/terms');

	const contents = page.getByRole('navigation', { name: 'Contents' });
	await contents.getByRole('link', { name: 'Who we are' }).click();

	// A plain `#id` link is the browser's own jump, so nothing here needs
	// JavaScript: the address gains the section's id and the heading it belongs
	// to is on the screen.
	await expect(page).toHaveURL('/terms#who-we-are');
	await expect(
		page.getByRole('main').getByRole('heading', { level: 2, name: 'Who we are' })
	).toBeVisible();
});

test('the privacy policy says who can see your details', async ({ page }) => {
	await page.goto('/privacy');

	const whoSeesItTable = page.getByRole('main').getByRole('table');

	await expect(
		whoSeesItTable.getByRole('columnheader', { name: 'Who', exact: true })
	).toBeVisible();
	await expect(
		whoSeesItTable.getByRole('columnheader', { name: 'What they see', exact: true })
	).toBeVisible();

	for (const audience of WHO_SEES_IT_AUDIENCES) {
		await expect(whoSeesItTable.getByText(audience, { exact: true })).toBeVisible();
	}
});

test('neither document spills off the side of a phone screen', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	await page.goto('/terms');
	expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

	await page.goto('/privacy');
	expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
});
