import { expect, test } from '@playwright/test';
import {
	createTestUser,
	giveApplication,
	makeConferenceStaff,
	removeConferenceStaff,
	signIn
} from './signed-in-user';

// The frame around every page: the top bar, the skip link and the footer, for a
// visitor and for somebody signed in. See `specs/03-design/app-shell.md`.

/**
 * Amsterdam Open MUN 2027 from `supabase/seed.sql`, so that
 * `/conferences/<slug>` is a real published page one level below the top bar's
 * "Conferences" link. Which conference it is does not matter here; that it is
 * *under* the link does.
 */
const SEEDED_CONFERENCE_SLUG = 'amsterdammun-2027';

/** The same conference's id, for putting a test account on its team. */
const SEEDED_CONFERENCE_ID = '20000000-0000-4000-8000-000000000009';

test('a visitor gets the two ways in and no bell', async ({ page }) => {
	await page.goto('/conferences');

	await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Sign up' })).toBeVisible();
	await expect(page.getByLabel(/^Notifications/)).toHaveCount(0);
});

test('the sign in link brings a visitor back to the page they were on', async ({ page }) => {
	await page.goto('/conferences');

	// Following the link rather than reading its `href`: SvelteKit writes the
	// address relative to the page it is on, so the attribute is `./login?...`
	// until the browser works it out.
	await page.getByRole('link', { name: 'Log in' }).click();

	await expect(page).toHaveURL('/login?next=%2Fconferences');
});

test('the skip link is the first thing the keyboard reaches', async ({ page }, testInfo) => {
	test.skip(
		testInfo.project.use.javaScriptEnabled === false,
		'Reading which element has focus needs JavaScript.'
	);

	await page.goto('/conferences');
	await page.keyboard.press('Tab');

	await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
});

test('every page has the footer', async ({ page }) => {
	await page.goto('/conferences');

	await expect(page.getByRole('contentinfo').getByText('Privacy')).toBeVisible();
});

test('a signed-in person gets the bell and their own name', async ({ page }) => {
	const user = await createTestUser('Amara Okafor');
	await signIn(page, user);

	await expect(page.getByLabel('Notifications', { exact: true })).toBeVisible();
	await expect(page.getByText('Amara', { exact: true })).toBeAttached();
	await expect(page.getByRole('link', { name: 'Log in' })).toHaveCount(0);
});

test('the profile menu offers a way out and closes again on a click anywhere else', async ({
	page
}, testInfo) => {
	// The menu is a shadcn dropdown, which only JavaScript opens.
	test.skip(testInfo.project.use.javaScriptEnabled === false, 'The menu needs JavaScript.');

	const user = await createTestUser();
	await signIn(page, user);

	// The person's picture is what to press: on a phone their name steps aside
	// and the button is named for a screen reader by `aria-label` alone.
	const accountButton = page.getByRole('banner').getByRole('button', { name: 'Daniel Perez' });
	const logOut = page.getByRole('menuitem', { name: 'Log out' });

	await accountButton.click();
	await expect(logOut).toBeVisible();
	// In the menu, because `/home`'s title row has a "Create a conference" link
	// of its own for a reader who runs nothing.
	await expect(page.getByRole('menuitem', { name: 'Create a conference' })).toBeVisible();

	// `mouse.click` presses a point on the screen rather than an element, the
	// way a person taps beside a menu to put it away.
	await page.mouse.click(10, 400);
	await expect(logOut).toBeHidden();

	await accountButton.click();
	await expect(logOut).toBeVisible();

	await page.keyboard.press('Escape');
	await expect(logOut).toBeHidden();
});

test('the notifications panel closes again on a click anywhere else', async ({
	page
}, testInfo) => {
	// The panel is a shadcn popover, which only JavaScript opens.
	test.skip(testInfo.project.use.javaScriptEnabled === false, 'The panel needs JavaScript.');

	const user = await createTestUser();
	await signIn(page, user);

	const bell = page.getByRole('banner').getByRole('button', { name: 'Notifications', exact: true });
	const seeAll = page.getByRole('link', { name: 'See all' });

	await bell.click();
	await expect(seeAll).toBeVisible();

	await page.mouse.click(10, 400);
	await expect(seeAll).toBeHidden();

	await bell.click();
	await expect(seeAll).toBeVisible();

	await page.keyboard.press('Escape');
	await expect(seeAll).toBeHidden();
});

test('the header search takes a signed-in person to the conference list', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'The search box only appears on a wide screen.');

	const user = await createTestUser();
	await signIn(page, user);

	// Not on `/home`, where signing in lands: a new account sees the greeting
	// band's own "Find a conference" search there, so the bar leaves its box out
	// (Trello U98pRHM9).
	await page.goto('/notifications');

	// Looked for in the top bar, because pages such as `/conferences` have a
	// field with the same label in `<main>`.
	const headerSearch = page.getByRole('banner').getByLabel('Search conferences');
	await headerSearch.fill('Hague');
	await headerSearch.press('Enter');

	// Longer than the five seconds Playwright waits by default. The submit
	// really does happen, but the conference list reads the database while every
	// other test in the run is doing the same, and it has taken up to eight
	// seconds to answer.
	await expect(page).toHaveURL('/conferences?q=Hague', { timeout: 15_000 });
	await expect(page.getByText('The Hague International MUN Junior')).toBeVisible();
});

// T150: the placeholder read "Search confere" at 1280px. An organiser who has
// also applied somewhere has the fullest bar, six links with "Applications" and
// "Manage" (T165), so that is the bar measured.
// A placeholder cannot be measured as an element, so the browser's own text
// measuring works out how wide its words are drawn, and that is compared with the
// room inside the box.
test("the header search shows its whole placeholder beside an organiser's six links", async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'The search box only appears on a wide screen.');

	const user = await createTestUser('Priya Nair');
	await makeConferenceStaff(user, SEEDED_CONFERENCE_ID, 'organiser');
	// A draft is enough: "Applications" is there for an application in any state.
	await giveApplication(user, { conferenceId: SEEDED_CONFERENCE_ID, status: 'draft' });

	try {
		await signIn(page, user);
		await expect(page.getByRole('banner').getByRole('link', { name: 'Manage' })).toBeVisible();
		await expect(
			page.getByRole('banner').getByRole('link', { name: 'Applications' })
		).toBeVisible();

		const search = page.getByLabel('Search conferences');

		const room = await search.evaluate((element) => {
			const input = element as HTMLInputElement;
			const style = getComputedStyle(input);
			const context = document.createElement('canvas').getContext('2d');

			if (context === null) {
				throw new Error('The browser gave no canvas to measure text with.');
			}

			context.font = style.font;

			const inside =
				input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);

			return { needed: context.measureText(input.placeholder).width, inside };
		});

		expect(room.needed).toBeLessThanOrEqual(room.inside);
	} finally {
		await removeConferenceStaff(user.id, SEEDED_CONFERENCE_ID);
	}
});

test('the links move into a menu on a phone', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	await page.goto('/conferences');

	// The bar's own links are `display: none` under `lg`, and the menu's panel
	// is not drawn at all until its button opens it, as a dialog over the page.
	const banner = page.getByRole('banner');
	await expect(banner.getByRole('link', { name: 'Conferences', exact: true })).toBeHidden();

	await banner.getByRole('button', { name: 'Menu' }).click();
	await expect(
		page.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name: 'Conferences' })
	).toBeVisible();
});

test('nothing spills off the side of a phone screen', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	const user = await createTestUser();
	await signIn(page, user);
	await page.goto('/notifications');

	// How much wider the page is than the window. Anything above zero means
	// something is pushing the page sideways.
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);

	expect(overflow).toBeLessThanOrEqual(1);
});

test('the top bar marks the section the reader is in, on a page inside it', async ({
	page
}, testInfo) => {
	await page.goto(`/conferences/${SEEDED_CONFERENCE_SLUG}`);

	// On a phone the bar has no room for its links and they move into the
	// slide-in menu, a dialog drawn over the page once its button is pressed.
	// Everywhere else they are in the `<header>`, which is the `banner`
	// landmark; scoping to it keeps the footer and the page itself out. `exact`
	// because a name is otherwise matched as part of a longer one, and the
	// magnifying glass beside the links is named "Search conferences".
	let linkArea = page.getByRole('banner');

	if (testInfo.project.name === 'phone') {
		await linkArea.getByRole('button', { name: 'Menu' }).click();
		linkArea = page.getByRole('dialog', { name: 'Menu' });
	}

	const conferencesLink = linkArea.getByRole('link', { name: 'Conferences', exact: true });

	// `aria-current="page"` is what `PrimaryNavigation.svelte` puts on the link
	// of the section being read, and it is what a screen reader says "current
	// page" for.
	//
	// This test earns its keep on the `desktop-no-js` project, and only there.
	// `resolve()` answers a *relative* address while a page is being built on
	// the server, so here the link arrives written `../conferences`; comparing
	// that with the address the reader asked for as plain text never matched,
	// and the bar came back from the server with nothing marked. With JavaScript
	// the browser works the address out again a moment later and marks the link
	// either way, which hid the fault everywhere else.
	//
	// It has to be a page *below* `/conferences` as well: a relative address
	// resolved from `/conferences` itself happens to match, and would have
	// passed either way.
	await expect(conferencesLink).toHaveAttribute('aria-current', 'page');
});
