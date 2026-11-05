import { expect, test, type Locator, type Page } from '@playwright/test';
import { createTestUser, signIn } from './signed-in-user';
import { expectPictureDrawn } from './drawn-picture';
import {
	expectLittleLayoutShift,
	expectNoSidewaysOverflow,
	expectPageFitsInScreens,
	saveFullPageScreenshot
} from './page-shape';

// The landing page in a real browser: the redirect that keeps a signed-in
// reader off it, the two halves of the hero and where their links go, the
// switch over the example, the drawn committee room with its running clock,
// the sections down the page and their links, the real conferences read from
// the database, the questions opening, the closing call, every link going
// somewhere real, the phone layout, and the sections rising into view as the
// reader scrolls.
//
// Every test here also runs on the `desktop-no-js` project, which is what
// proves the page is all there before any JavaScript arrives: the switch works
// as two plain links and nothing is hidden. The tests about motion and about
// the questions opening are the exception, and skip that project themselves.
//
// The top bar and the footer repeat some of the words this page uses, so
// everything about the page itself is looked for inside `<main>`.

/**
 * How long an assertion that waits on another page may take.
 *
 * Longer than the five seconds Playwright waits by default, because `/home`
 * and `/conferences` read the database while every other test in the run is
 * doing the same. `tests/e2e/conferences.spec.ts` waits this long for the same
 * reason.
 */
const DATABASE_TIMEOUT_MS = 15_000;

/**
 * How many windows tall this page may be.
 *
 * The hero, the example and nine sections make a long page on purpose: at
 * 1280px wide it measured about seven 800px windows. The number here leaves
 * room for a section growing a row taller, and still catches a page that has
 * doubled.
 */
const PAGE_SCREENS = 9;

/** How many conferences the "Taking applications now" section shows at most. `LANDING_CONFERENCE_LIMIT` in `$lib/landing`. */
const CONFERENCE_LIMIT = 4;

/** What the clock in the drawn committee room reads, such as "0:24" or "1:30". */
const CLOCK_FACE = /^\d+:\d\d$/;

/** One view of the example under the hero, as `SHOWCASE_STORIES` in `$lib/landing-showcase.ts` writes it. */
type ShowcaseView = {
	/** The words on its half of the switch. */
	switchLabel: string;
	/** The address that shows it. */
	address: string;
	/** What the example shows, in words, for somebody who cannot see it. */
	description: string;
	/** Something on screen that only this view shows. */
	shown: (page: Page) => Locator;
};

const DELEGATE_VIEW: ShowcaseView = {
	switchLabel: 'As a delegate',
	address: '/',
	description:
		'An example of MUNMeet for a delegate, in five stages: discover a conference, apply, get accepted, prepare for committee, and join the live committee.',
	// The carousel's first slide, which is in the centre until it turns.
	shown: (page) => page.getByRole('main').getByAltText(/^1\. Discover\./)
};

const ORGANISER_VIEW: ShowcaseView = {
	switchLabel: 'As an organiser',
	address: '/?view=organiser',
	description:
		'An example of MUNMeet for an organiser: Oxford International MUN 2026, from publishing the conference to reviewing its applications.',
	shown: (page) => page.getByRole('main').getByText('142 applications received')
};

/**
 * The hero, the first thing in `<main>`. It has no heading of its own on
 * screen, so it is found by its place rather than by a name. Its words come
 * up again further down the page ("For delegates" is also a section), which is
 * why the tests about the hero look inside it.
 */
function hero(page: Page): Locator {
	return page.getByRole('main').locator('section').first();
}

/**
 * The switch over the example. It is a `<nav>` named "Example", which
 * Playwright finds by the role "navigation".
 */
function exampleSwitch(page: Page): Locator {
	return page.getByRole('main').getByRole('navigation', { name: 'Example' });
}

/** One of the page's sections, found by the name its heading gives it. */
function section(page: Page, name: string): Locator {
	return page.getByRole('main').getByRole('region', { name });
}

/**
 * Fails unless this view of the example is the one on screen: its half of the
 * switch is marked as the current one, and the example says in words what it
 * shows.
 *
 * The cards themselves are hidden from screen readers, because they are a
 * picture of the product rather than the product, so the `<figure>` around
 * them is named by its caption and found by that name.
 */
async function expectViewShown(page: Page, view: ShowcaseView): Promise<void> {
	const option = exampleSwitch(page).getByRole('link', { name: view.switchLabel });

	await expect(option).toHaveAttribute('aria-current', 'page');
	await expect(
		page.getByRole('main').getByRole('figure', { name: view.description })
	).toBeVisible();
	await expect(view.shown(page)).toBeVisible();
}

/*
	Without JavaScript the page draws no new frames once its arrival animations
	have ended, and Playwright decides an element is stable by comparing its
	position across two animation frames, so a click that first tried during
	the animation then waits for a frame that never comes. Asking for less
	motion turns the animations off on that project, exactly as it would for a
	reader who asked their operating system for the same.
*/
test.beforeEach(async ({ page }, testInfo) => {
	if (testInfo.project.name === 'desktop-no-js') {
		await page.emulateMedia({ reducedMotion: 'reduce' });
	}
});

test('the page names itself in the browser tab', async ({ page }) => {
	await page.goto('/');

	await expect(page).toHaveTitle('Run your Model UN in one place · MUNMeet');
});

test('somebody already signed in never sees this page', async ({ page }) => {
	const user = await createTestUser();
	await signIn(page, user);

	await page.goto('/');

	// `load` in `+page.server.ts` answers a signed-in reader with a 303 to
	// `/home`, so the browser has already moved on by the time the page settles.
	await expect(page).toHaveURL('/home', { timeout: DATABASE_TIMEOUT_MS });
});

test('the hero speaks to delegates on one side and organisers on the other', async ({ page }) => {
	await page.goto('/');

	// The page's `<h1>` is for screen readers only, because the mockup draws
	// none above the two halves; it is still the first heading they reach.
	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
		'MUNMeet, for Model UN delegates and organisers'
	);

	const top = hero(page);

	await expect(top.getByText('For delegates', { exact: true })).toBeVisible();
	await expect(
		top.getByRole('heading', { level: 2, name: 'Join conferences that shape you.' })
	).toBeVisible();
	await expect(
		top.getByText(
			'Discover Model UN conferences worldwide, apply, prepare, and participate — all in one place.'
		)
	).toBeVisible();

	await expect(top.getByText('For organisers', { exact: true })).toBeVisible();
	await expect(
		top.getByRole('heading', { level: 2, name: 'Create conferences that make an impact.' })
	).toBeVisible();
	await expect(
		top.getByText(
			'Custom applications, committee management, scheduling, and live session tools — built for MUN.'
		)
	).toBeVisible();
});

test("the delegates' link opens the conference directory", async ({ page }) => {
	await page.goto('/');

	// Following the link rather than reading its `href`: SvelteKit writes an
	// address relative to the page it is on, so the attribute reads
	// `./conferences` until the browser has worked it out. The arrow after the
	// words is decoration, so the link is matched by its words alone.
	await hero(page).getByRole('link', { name: 'Explore conferences' }).click();

	await expect(page).toHaveURL('/conferences', { timeout: DATABASE_TIMEOUT_MS });
});

test("the organisers' link goes through sign up to the new conference form", async ({ page }) => {
	await page.goto('/');

	await hero(page).getByRole('link', { name: 'Create a conference' }).click();

	// Only a visitor sees this page, so the form is reached by way of a new
	// account, which `next` brings back to `/create` once it exists.
	await expect(page).toHaveURL('/register?next=%2Fcreate');
});

test("the example starts with a delegate's view", async ({ page }) => {
	await page.goto('/');

	await expectViewShown(page, DELEGATE_VIEW);

	// The other half of the switch is there to press, and is not marked current.
	await expect(
		exampleSwitch(page).getByRole('link', { name: ORGANISER_VIEW.switchLabel })
	).not.toHaveAttribute('aria-current', 'page');
});

test('the switch moves the example between the two views', async ({ page }) => {
	await page.goto('/');

	await exampleSwitch(page).getByRole('link', { name: ORGANISER_VIEW.switchLabel }).click();

	await expect(page).toHaveURL(ORGANISER_VIEW.address);
	await expectViewShown(page, ORGANISER_VIEW);

	await exampleSwitch(page).getByRole('link', { name: DELEGATE_VIEW.switchLabel }).click();

	await expect(page).toHaveURL(DELEGATE_VIEW.address);
	await expectViewShown(page, DELEGATE_VIEW);
});

test("a shared link opens the organiser's view straight away", async ({ page }) => {
	await page.goto(ORGANISER_VIEW.address);

	await expectViewShown(page, ORGANISER_VIEW);
});

/**
 * The slide of the delegate's carousel at the centre, the only one a screen
 * reader is given; the side slides are `aria-hidden`, which leaves them out of
 * a search by role.
 */
function centreSlide(page: Page, stage: RegExp): Locator {
	return page
		.getByRole('main')
		.getByRole('figure', { name: DELEGATE_VIEW.description })
		.getByRole('img', { name: stage });
}

test("the delegate's slides turn on by themselves, one stage at a time", async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name === 'desktop-no-js', 'The carousel turns with JavaScript.');

	await page.goto('/');

	await expect(centreSlide(page, /^1\. Discover\./)).toBeVisible();
	await expect(centreSlide(page, /^2\. Apply\./)).toHaveCount(0);

	// A turn waits for the slide to be read: about four seconds.
	await expect(centreSlide(page, /^2\. Apply\./)).toBeVisible({ timeout: 6_000 });
	await expect(centreSlide(page, /^1\. Discover\./)).toHaveCount(0);
});

test("pressing a side slide turns the delegate's carousel towards it", async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name === 'desktop-no-js', 'The carousel turns with JavaScript.');

	await page.goto('/');

	// The first stage has nothing before it, so only the next can be pressed.
	const figure = page.getByRole('main').getByRole('figure', { name: DELEGATE_VIEW.description });
	await expect(figure.getByRole('button', { name: /^Previous stage/ })).toHaveCount(0);

	await figure.getByRole('button', { name: 'Next stage: Apply' }).click();
	await expect(centreSlide(page, /^2\. Apply\./)).toBeVisible();

	await figure.getByRole('button', { name: 'Previous stage: Discover' }).click();
	await expect(centreSlide(page, /^1\. Discover\./)).toBeVisible();
});

test('the drawn committee room shows a country with the floor and a clock', async ({ page }) => {
	await page.goto('/');

	const room = section(page, 'The committee room, live.');

	await expect(room.getByText('Has the floor')).toBeVisible();
	// Kenya opens, as `OPENING_ROOM` in `$lib/landing-room.ts` draws it.
	await expect(room.getByText('Kenya')).toBeVisible();
	await expect(room.getByText('In session')).toBeVisible();
	await expect(room.getByText(CLOCK_FACE)).toBeVisible();
	// Five countries wait behind the one speaking.
	await expect(
		room.getByRole('listitem').filter({ hasText: /Brazil|Japan|Norway|India|Chile/ })
	).toHaveCount(5);
});

test('the clock in the drawn committee room runs', async ({ page }, testInfo) => {
	test.skip(
		testInfo.project.name === 'desktop-no-js',
		'The clock is ticked by JavaScript; without it the room is a still picture.'
	);

	await page.goto('/');

	const clock = section(page, 'The committee room, live.').getByText(CLOCK_FACE);
	const before = await clock.textContent();

	// A second later the clock reads something else. `not.toHaveText` keeps
	// looking until it does, or gives up after Playwright's usual five seconds.
	await expect(clock).not.toHaveText(before ?? '');
});

test('the six steps of a conference run from publishing to chairing', async ({ page }) => {
	await page.goto('/');

	const steps = section(page, 'From the first application to the final vote.').getByRole(
		'listitem'
	);

	await expect(steps).toHaveCount(6);
	await expect(steps.first()).toContainText('Publish');
	await expect(steps.last()).toContainText('Chair');
});

test('the sections for delegates, organisers and schools lead on to their pages', async ({
	page
}) => {
	await page.goto('/');

	const delegates = section(page, 'Apply once. Know where you sit.');
	const organisers = section(page, 'Run the whole conference from one place.');
	const schools = section(page, 'Bring a whole delegation.');

	await expect(
		delegates.getByRole('heading', { level: 3, name: 'Find a conference' })
	).toBeVisible();
	await expect(
		organisers.getByRole('heading', { level: 3, name: 'Applications that review themselves' })
	).toBeVisible();
	await expect(schools.getByRole('listitem')).toHaveCount(3);

	// The drawn pictures say in words what they show, for somebody who cannot see them.
	await expect(
		delegates.getByRole('figure', { name: /An example of a delegate's application/ })
	).toBeVisible();
	await expect(
		organisers.getByRole('figure', { name: /An example of an organiser's applications table/ })
	).toBeVisible();

	await organisers.getByRole('link', { name: 'See the organiser tour' }).click();

	await expect(page).toHaveURL('/for-organisers');
});

test('lists real conferences taking applications, four of them at most', async ({ page }) => {
	await page.goto('/');

	const conferences = section(page, 'Taking applications now.');
	const cards = conferences.getByRole('listitem');

	// `supabase/seed.sql` has more than four conferences taking applications,
	// so the section is full. That the four are the ones taking applications
	// is proved by `src/lib/server/conferences.test.ts`, which reads the filters
	// the query sends.
	await expect(cards).toHaveCount(CONFERENCE_LIMIT, { timeout: DATABASE_TIMEOUT_MS });

	// Every seeded conference has a banner of its own (T149), so each card shows
	// a photograph, found as a picture rather than by a name. The card draws its
	// applications pill only for a conference with an application window, so
	// the pill is not looked for here: that these are open is the query's job.
	for (const card of await cards.all()) {
		await expectPictureDrawn(card.locator('img'));
	}

	await cards.first().getByRole('link').click();

	await expect(page).toHaveURL(/\/conferences\/[a-z0-9-]+$/, { timeout: DATABASE_TIMEOUT_MS });

	await page.goto('/');
	await conferences.getByRole('link', { name: 'All conferences' }).click();

	await expect(page).toHaveURL('/conferences', { timeout: DATABASE_TIMEOUT_MS });
});

test('a question opens to its answer', async ({ page }, testInfo) => {
	test.skip(
		testInfo.project.name === 'desktop-no-js',
		'The questions are a shadcn accordion, which JavaScript opens.'
	);

	await page.goto('/');

	const questions = section(page, 'Good to know before you start.');
	const answer = questions.getByText('€2.00 per delegate seat paid through MUNMeet.', {
		exact: false
	});

	await expect(answer).toBeHidden();

	await questions.getByRole('button', { name: 'What does it cost?' }).click();

	await expect(answer).toBeVisible();
});

test('the closing band sends a new reader to sign up', async ({ page }) => {
	await page.goto('/');

	const main = page.getByRole('main');

	await expect(
		main.getByRole('heading', { level: 2, name: 'Ready to be part of something bigger?' })
	).toBeVisible();
	await expect(
		main.getByText('Join thousands of students and organisers on MUNMeet.')
	).toBeVisible();

	await main.getByRole('link', { name: 'Get started' }).click();

	await expect(page).toHaveURL('/register');
});

test('nothing on the page is a dead link', async ({ page }) => {
	await page.goto('/');

	// Wait for the conferences, which are the last links to arrive.
	await expect(section(page, 'Taking applications now.').getByRole('link').first()).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// The `href` property of a link, unlike the attribute, is the whole address
	// the browser worked out, so a relative `./conferences` comes back as
	// `http://localhost:4173/conferences`. `evaluateAll` reads them all in one go.
	const addresses = await page
		.getByRole('main')
		.getByRole('link')
		.evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).href));

	const origin = new URL(page.url()).origin;

	// The same address twice, such as `/conferences` reached from two places,
	// only needs asking for once.
	const internalAddresses = [...new Set(addresses)].filter(
		(address) => new URL(address).origin === origin
	);

	expect(internalAddresses.length).toBeGreaterThan(0);

	for (const address of internalAddresses) {
		// Asked for rather than clicked: this is about what the server answers, and
		// `page.request` asks as the same visitor without leaving the page.
		const response = await page.request.get(address);

		expect(response.status(), `${address} answered ${response.status()}`).toBeLessThan(400);
	}
});

test('the sections rise into view as the reader scrolls down to them', async ({
	page
}, testInfo) => {
	test.skip(
		testInfo.project.name === 'desktop-no-js',
		'Without JavaScript nothing is ever hidden, which the next test checks.'
	);

	await page.goto('/');

	const questions = section(page, 'Good to know before you start.');
	const block = questions.locator('[data-reveal]').first();

	// The questions are far below the first screen, so their block starts
	// see-through and waits (`Reveal.svelte`). `data-shown` is what the block
	// is given the moment it comes into view.
	await expect(block).not.toHaveAttribute('data-shown');
	await expect(block).toHaveCSS('opacity', '0');

	await block.scrollIntoViewIfNeeded();

	await expect(block).toHaveAttribute('data-shown');
	await expect(block).toHaveCSS('opacity', '1');
});

test('nothing waits to be revealed before JavaScript arrives, or for somebody who asked for less motion', async ({
	page
}, testInfo) => {
	if (testInfo.project.name !== 'desktop-no-js') {
		// `emulateMedia` tells the page the reader's operating system has asked
		// for less motion, which `Reveal.svelte` reads through `matchMedia`.
		await page.emulateMedia({ reducedMotion: 'reduce' });
	}

	await page.goto('/');

	const blocks = page.getByRole('main').locator('[data-reveal]');
	const count = await blocks.count();

	expect(count).toBeGreaterThan(0);

	// Every block is shown from the start, without anybody scrolling to it.
	for (let index = 0; index < count; index += 1) {
		await expect(blocks.nth(index)).toHaveAttribute('data-shown');
	}
});

test('nothing spills off the side of a phone screen', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	await page.goto('/');

	await expectNoSidewaysOverflow(page);
});

test('the page holds still while it loads and fits in a few screens', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough to measure a height.');

	// With less motion asked for, nothing waits to be scrolled to, so the
	// picture saved below shows every section rather than see-through blocks,
	// and the height measured is the page's own.
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto('/');

	// The hero's pictures are placed behind the words rather than in the flow,
	// and the conference banners have a shape of their own before they arrive,
	// so nothing moves when the pictures do.
	await expectLittleLayoutShift(page);

	// Wait for the conferences before measuring, or the height would be taken
	// before all of the page is there.
	await expect(section(page, 'Taking applications now.').getByRole('listitem').first()).toBeVisible(
		{
			timeout: DATABASE_TIMEOUT_MS
		}
	);

	// Saved before the assertion, so that a failure leaves a picture of the page
	// that failed it. It is also the picture compared with the mockup on the
	// Trello card, which is why it is saved even when the measurement passes.
	await saveFullPageScreenshot(page, 'landing');
	await expectPageFitsInScreens(page, PAGE_SCREENS);
});
