import { expect, test, type Locator, type Page } from '@playwright/test';
import { OWNER_VIEWPORT } from './creation-screen';
import {
	expectNoSidewaysOverflow,
	expectOnFirstScreen,
	saveFullPageScreenshot
} from './page-shape';
import { createTestUser, signIn } from './signed-in-user';

// The "For organisers" page, after the design canvas built from
// `docs/for-organisers-handoff.md`: what needs a real browser to check. The
// chapters in the order of a conference's year, the ledger's links landing on
// them, where the two buttons send a visitor and somebody signed in, the first
// screen on the product owner's window, and a phone.
//
// The top bar has its own "For organisers" link and "Create a conference" is
// on the page more than once, so the page is looked for inside `<main>`.

/** The chapters' titles, top to bottom, as the design orders them. */
const CHAPTER_TITLES = [
	'Seven jobs, usually seven tools.',
	'Set it up once. Publish when you are ready.',
	'Every application in one table.',
	'The matrix, without the spreadsheet.',
	'An invoice for every seat, paid by card.',
	'Everyone knows where to be and what to read.',
	'One room on every screen.',
	'Close this conference. Start the next one from it.',
	'Everyone sees what their job needs.'
];

/**
 * Where a link goes, as a path and query. The server writes links relative to
 * the page (`./register?...`), so the raw attribute differs from what the
 * browser resolves it to; the resolved `href` is what a click follows.
 */
async function pathOf(link: Locator): Promise<string> {
	const address = new URL(await link.evaluate((anchor: HTMLAnchorElement) => anchor.href));
	return `${address.pathname}${address.search}`;
}

/** The page's own content, without the top bar and the footer. */
function main(page: Page) {
	return page.getByRole('main');
}

test('the page names itself in the browser tab', async ({ page }) => {
	await page.goto('/for-organisers');

	await expect(page).toHaveTitle('For organisers · MUNMeet');
});

test('the headline is the page’s one first-level heading', async ({ page }) => {
	await page.goto('/for-organisers');

	await expect(main(page).getByRole('heading', { level: 1 })).toHaveText(
		'One system, from the first application to the final vote.'
	);
});

test('the chapters follow a conference through its year', async ({ page }) => {
	await page.goto('/for-organisers');

	const titles = await main(page).getByRole('heading', { level: 2 }).allTextContents();
	const chapterTitles = titles
		.map((title) => title.trim())
		.filter((title) => CHAPTER_TITLES.includes(title));

	expect(chapterTitles).toEqual(CHAPTER_TITLES);
});

test('every link in the ledger lands on a part of the page', async ({ page }) => {
	await page.goto('/for-organisers');

	// The ledger's rows are plain links to an id further down, so they work
	// without JavaScript. Each one must point at something that is there.
	const ledger = main(page).locator('#replaces');
	const anchors = await ledger
		.locator('a[href^="#"]')
		.evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));

	expect(anchors.length).toBeGreaterThan(0);

	for (const anchor of anchors) {
		await expect(page.locator(anchor), `${anchor} is not on the page`).toHaveCount(1);
	}
});

test('a visitor who wants to run a conference is sent through sign up first', async ({ page }) => {
	await page.goto('/for-organisers');

	const hero = main(page).locator('section[aria-labelledby="hero-title"]');

	expect(await pathOf(hero.getByRole('link', { name: 'Create a conference' }))).toBe(
		'/register?next=%2Fcreate'
	);
	expect(await pathOf(hero.getByRole('link', { name: 'Run a quick session' }))).toBe(
		'/register?next=%2Fquick%2Fnew'
	);
});

test('somebody already signed in goes straight to the forms', async ({ page }) => {
	const user = await createTestUser();
	await signIn(page, user);
	await page.goto('/for-organisers');

	const hero = main(page).locator('section[aria-labelledby="hero-title"]');

	expect(await pathOf(hero.getByRole('link', { name: 'Create a conference' }))).toBe('/create');
	expect(await pathOf(hero.getByRole('link', { name: 'Run a quick session' }))).toBe('/quick/new');
});

test('a question opens to show its answer', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name === 'desktop-no-js', 'The questions open with JavaScript.');

	await page.goto('/for-organisers');

	// The first question starts open, as the design draws it, and only one
	// answer is open at a time: opening the second closes the first.
	const questions = main(page).locator('#questions').getByRole('button');
	const firstQuestion = questions.nth(0);
	const secondQuestion = questions.nth(1);

	await expect(firstQuestion).toHaveAttribute('aria-expanded', 'true');

	await secondQuestion.click();

	await expect(secondQuestion).toHaveAttribute('aria-expanded', 'true');
	await expect(firstQuestion).toHaveAttribute('aria-expanded', 'false');
});

test('the owner’s window shows the whole promise on its first screen', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough to measure a window.');

	await page.setViewportSize(OWNER_VIEWPORT);
	await page.goto('/for-organisers');

	const hero = main(page).locator('section[aria-labelledby="hero-title"]');

	await expectOnFirstScreen(page, hero.getByRole('heading', { level: 1 }));
	await expectOnFirstScreen(page, hero.getByRole('link', { name: 'Create a conference' }));
	await expectOnFirstScreen(page, hero.getByRole('link', { name: 'Run a quick session' }));
	await saveFullPageScreenshot(page, 'for-organisers-owner');
});

test('a phone keeps "Create a conference" at the bottom of the screen', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	await page.goto('/for-organisers');

	// The hero's own button, the bar's and the closing band's.
	const createLinks = main(page).getByRole('link', { name: 'Create a conference' });
	await expect(createLinks).toHaveCount(3);

	// Halfway down the page the bar is still on screen.
	await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
	await expect(createLinks.nth(2)).toBeInViewport();
});

test('nothing spills off the side of the screen', async ({ page }) => {
	await page.goto('/for-organisers');

	await expectNoSidewaysOverflow(page);
	await saveFullPageScreenshot(page, 'for-organisers');
});
