import { expect, test, type Locator, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { expectPictureDrawn } from './drawn-picture';
import { expectNoSidewaysOverflow, saveFullPageScreenshot } from './page-shape';

// The acceptance criteria of `specs/05-pages/public/conferences.md` that need a
// real browser:
//
// * every filter, and the sort order, is in the URL, and the link reproduces
//   the results;
// * the search matches the organisation's name as well as the conference's;
// * only published, not-yet-ended conferences are listed;
// * the "open" filter lists exactly the conferences taking applications now;
// * a card carries the "Applications open" and "Opens {date}" badges;
// * it all works without JavaScript, by submitting the form, including the
//   phone's "Filters" disclosure, which opens with scripting switched off;
// * twelve to a page, with real links to the rest, and pressing one of them
//   lands at the top of the list, as a new page would (T126);
// * three columns on a desktop and one on a phone;
// * the top of the page as the mockup of 28 Sep 2026 draws it (T180), and as the
//   product owner's mockup redrew it (Trello WMcXfry0): one `h1`, the
//   search box's words, the quick filter chips and "More", "Apply filters" only
//   without JavaScript, Enter searching with it, "Filters (n)" on a phone, and nothing
//   spilling off the side of a phone.
//
// The directory is public, so none of these tests signs anybody in. The top bar
// and the footer repeat some of the words the page uses, so everything about the
// page itself is looked for inside `<main>`.

/**
 * How long an assertion that waits on the conference list may take.
 *
 * Longer than the five seconds Playwright waits by default. The list reads the
 * database while every other test in the run is doing the same, and it has taken
 * up to eight seconds to answer; `tests/e2e/app-shell.spec.ts` waits longer for
 * the same reason.
 */
const DATABASE_TIMEOUT_MS = 15_000;

/**
 * The directory as `supabase/seed.sql` leaves it: the eight published
 * conferences that have not finished, soonest first, which is how the page
 * sorts them until somebody asks for another order.
 *
 * They are named rather than counted, because the pagination test below makes
 * conferences of its own while these tests run and a count would see those too.
 * Every one of those starts two and a half years out, so they never reach page 1.
 * The four published conferences of `supabase/walkthrough-seed.sql` do: two start
 * sooner than any of these eight and two later, and together the twelve fill
 * exactly one page. That is why the order test below compares the order of these
 * names among the cards, rather than asking that the first card is The Hague.
 *
 * The conferences the database tests make are dated 2020 on purpose, so they
 * have finished and the directory leaves them out, however many of them a run
 * of `pnpm test:db` has left behind.
 */
const SEEDED_CONFERENCE_NAMES = [
	'The Hague International MUN Junior',
	'BERMUN 2026',
	'Harvard Model United Nations 2027',
	'Vienna University MUN 2027',
	'Copenhagen Schools MUN 2027',
	'Madrid International MUN 2027',
	'Tokyo Global MUN 2027',
	'Amsterdam Open MUN 2027'
];

/**
 * Every other published conference the seed files add that has not finished:
 * Brussels from `supabase/seed.sql` and the four published conferences of
 * `supabase/walkthrough-seed.sql`, whose fifth is a draft and is not listed.
 */
const OTHER_SEEDED_CONFERENCE_NAMES = [
	'Brussels European MUN 2027',
	'Northbridge MUN (opening soon)',
	'Northbridge MUN (applications open)',
	'Northbridge MUN (about to start)',
	'Northbridge MUN (running today)'
];

/**
 * The organisation the pagination test hangs its own conferences off. It is
 * Sample Europe MUN Network of `supabase/seed.sql`; a conference needs an
 * organisation, and this test reads nothing else about it.
 */
const SAMPLE_ORGANIZATION_ID = '10000000-0000-4000-8000-000000000001';

/**
 * How many conferences the pagination test makes: one more than a page holds,
 * so that page 2 has exactly one row on it.
 */
const PAGER_CONFERENCE_COUNT = 13;

/**
 * A word of its own for each Playwright project to name its conferences after.
 *
 * All three projects run this file at the same time against one database, so
 * each needs a set of rows the other two cannot see. The word goes in the name,
 * the test searches for it, and the three sets never meet. They are words
 * rather than the project names because "desktop" is inside "desktop-no-js",
 * and a search matches part of a name.
 */
const PAGER_WORD_FOR_PROJECT: Record<string, string> = {
	desktop: 'Alfa',
	'desktop-no-js': 'Bravo',
	phone: 'Charlie'
};

/**
 * How many conferences the pager scroll test makes: two full pages, so that the
 * pager sits below the bottom of the window on both of them.
 */
const PAGER_SCROLL_CONFERENCE_COUNT = 24;

/**
 * The words the pager scroll test names its conferences after, for the same
 * reason as `PAGER_WORD_FOR_PROJECT`. They differ from those, because the two
 * tests run at the same time and each counts only its own conferences.
 */
const PAGER_SCROLL_WORD_FOR_PROJECT: Record<string, string> = {
	desktop: 'Delta',
	'desktop-no-js': 'Echo',
	phone: 'Foxtrot'
};

/**
 * Make `count` published conferences whose names all contain `word`, and
 * answer their ids so the test can delete them again.
 *
 * They start two and a half years out, later than every conference in the seed,
 * so that a directory page nobody filtered still opens on the seeded rows and
 * the other tests in this file are not disturbed by these.
 */
async function createPagerConferences(
	word: string,
	count: number = PAGER_CONFERENCE_COUNT
): Promise<string[]> {
	const admin = createServiceRoleClient();
	const startsInDays = 900;

	const rows = Array.from({ length: count }, (_, index) => {
		// Two digits, so that the names sort the way the numbers do.
		const number = String(index + 1).padStart(2, '0');
		const start = new Date();

		start.setDate(start.getDate() + startsInDays + index);

		return {
			name: `Pager ${word} ${number}`,
			slug: `e2e-pager-${word.toLowerCase()}-${number}-${crypto.randomUUID()}`,
			city: 'Testville',
			country_code: 'NZ',
			start_date: start.toISOString().slice(0, 10),
			end_date: start.toISOString().slice(0, 10),
			status: 'published' as const,
			organization_id: SAMPLE_ORGANIZATION_ID
		};
	});

	const { data, error } = await admin.from('conferences').insert(rows).select('id');

	if (error || !data) {
		throw new Error(`Could not create the pager conferences: ${error?.message}`);
	}

	return data.map((row) => row.id);
}

/** Take them away again, so the next run starts from the seed alone. */
async function deletePagerConferences(conferenceIds: string[]): Promise<void> {
	const admin = createServiceRoleClient();
	const { error } = await admin.from('conferences').delete().in('id', conferenceIds);

	if (error) {
		throw new Error(`Could not delete the pager conferences: ${error.message}`);
	}
}

/**
 * The `<ul>` of results.
 *
 * `filter` picks out the list that holds the cards, whose names are `<h3>`
 * headings, so no other list on the page can be mistaken for it.
 */
function resultsList(page: Page): Locator {
	return page
		.getByRole('main')
		.getByRole('list')
		.filter({ has: page.getByRole('heading', { level: 3 }) });
}

/** The heading of one conference's card, which is how a test says "it is listed". */
function cardHeading(page: Page, conferenceName: string): Locator {
	return page.getByRole('main').getByRole('heading', { level: 3, name: conferenceName });
}

/**
 * Scroll down to one of the pager's links and press it, after checking that the
 * page really was scrolled down, since otherwise landing at the top afterwards
 * would prove nothing.
 */
async function pressPagerLinkBelowTheList(page: Page, linkName: string): Promise<void> {
	const link = page.getByRole('main').getByRole('link', { name: linkName });

	await link.scrollIntoViewIfNeeded();
	expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

	await link.click();
}

/**
 * Wait until the window is back at the top of the page. `expect.poll` asks
 * again until the answer is right, because with JavaScript the scroll happens
 * a moment after the new results are drawn.
 */
async function expectScrolledToTheTop(page: Page): Promise<void> {
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
}

/** One whole card, for an assertion about something else on it, such as a badge. */
function cardFor(page: Page, conferenceName: string): Locator {
	return resultsList(page)
		.getByRole('listitem')
		.filter({ has: page.getByRole('heading', { level: 3, name: conferenceName }) });
}

/**
 * Open the "Filters" disclosure, which starts closed on a phone.
 *
 * It is a native `<details>`, so its summary opens it with or without
 * JavaScript. On a wide screen the controls are already on the page and there is
 * nothing to open, so this does nothing.
 */
async function openTheFiltersOnAPhone(page: Page, projectName: string): Promise<void> {
	if (projectName !== 'phone') {
		return;
	}

	// The summary reads "Filters" on its own, or "Filters (2)" when two filters
	// are set, so its text is matched from the start rather than in full.
	await page
		.getByRole('main')
		.getByText(/^Filters/)
		.click();
}

/**
 * The name on the first card, once the list has arrived.
 *
 * Read rather than asserted, because the sort test compares one order with the
 * other and neither name is the point.
 */
async function firstCardName(page: Page): Promise<string> {
	const heading = resultsList(page)
		.getByRole('listitem')
		.first()
		.getByRole('heading', { level: 3 });

	await expect(heading).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	return (await heading.textContent())?.trim() ?? '';
}

/** The names on every card of the page, top to bottom, once the list has arrived. */
async function cardNames(page: Page): Promise<string[]> {
	const headings = resultsList(page).getByRole('listitem').getByRole('heading', { level: 3 });

	await expect(headings.first()).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	const names = await headings.allTextContents();
	return names.map((name) => name.trim());
}

/**
 * How many columns the results are laid out in.
 *
 * The browser answers `grid-template-columns` with the width of each column,
 * "389px 389px 389px" for three of them, so counting the pieces counts the
 * columns. A grid that was never given columns of its own answers "none" and
 * stacks its items one under another, which is one column.
 */
async function countResultColumns(page: Page): Promise<number> {
	const tracks = await resultsList(page).evaluate(
		(list) => getComputedStyle(list).gridTemplateColumns
	);

	if (tracks === 'none') {
		return 1;
	}

	return tracks.split(' ').length;
}

test('the page names itself in the browser tab and has one heading', async ({ page }) => {
	await page.goto('/conferences');

	await expect(page).toHaveTitle('Conferences · MUNMeet');

	// The page's one heading is for screen readers only, since the product owner
	// asked for the hero's headline to go (Trello VtIlOpkB).
	const headings = page.getByRole('heading', { level: 1 });

	await expect(headings).toHaveCount(1);
	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Conferences');
});

test('the search box says what it searches', async ({ page }) => {
	await page.goto('/conferences');

	await expect(page.getByRole('main').getByLabel('Search conferences')).toHaveAttribute(
		'placeholder',
		'Search conferences, cities or organisations…'
	);
});

test('"Apply filters" is on screen only without JavaScript', async ({ page }, testInfo) => {
	await page.goto('/conferences');

	const applyButton = page.getByRole('main').getByRole('button', { name: 'Apply filters' });

	// Without JavaScript it is the only way to send the form. With it, every
	// control sends the form on its own, and the button is hidden once the page
	// has come to life.
	if (testInfo.project.use.javaScriptEnabled === false) {
		await expect(applyButton).toBeVisible();
	} else {
		await expect(applyButton).toBeHidden();
	}
});

test('Enter in the search box searches at once', async ({ page }, testInfo) => {
	test.skip(
		testInfo.project.use.javaScriptEnabled === false,
		'Without JavaScript Enter sends the form through "Apply filters", which the next test presses.'
	);

	await page.goto('/conferences');

	const main = page.getByRole('main');
	const searchBox = main.getByLabel('Search conferences');

	// The button is hidden once the page has come to life, so Enter now works
	// through the page's own handler rather than the browser's.
	await expect(main.getByRole('button', { name: 'Apply filters' })).toBeHidden();

	await searchBox.fill('Vienna');
	await searchBox.press('Enter');

	await expect(page).toHaveURL('/conferences?q=Vienna', { timeout: DATABASE_TIMEOUT_MS });
	await expect(cardHeading(page, 'Vienna University MUN 2027')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(cardHeading(page, 'BERMUN 2026')).toHaveCount(0);
});

test('every filter is in the URL, so the same link gives the same results', async ({
	page
}, testInfo) => {
	await page.goto('/conferences?country=NL&level=mixed');

	// The Netherlands and the mixed level, so The Hague is in and Boston is out.
	await expect(cardHeading(page, 'The Hague International MUN Junior')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(cardHeading(page, 'Harvard Model United Nations 2027')).toHaveCount(0);

	await page.reload();

	await expect(cardHeading(page, 'The Hague International MUN Junior')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(cardHeading(page, 'Harvard Model United Nations 2027')).toHaveCount(0);

	// The controls show the filters the address asked for, so a link somebody
	// shares arrives with the form already filled in.
	await openTheFiltersOnAPhone(page, testInfo.project.name);

	const main = page.getByRole('main');

	// With JavaScript the country is a shadcn dropdown, a button that says its
	// choice; without it, the browser's own, whose value is the country code.
	if (testInfo.project.use.javaScriptEnabled !== false) {
		await expect(main.getByLabel('Country')).toHaveText('Netherlands');
	} else {
		await expect(main.getByLabel('Country')).toHaveValue('NL');
	}

	// The level is a chip, which is a link (Trello WMcXfry0). This one waits behind
	// "More", a shadcn menu that needs JavaScript to open, so only the scripted
	// projects look inside it. Its lines are drawn over the page rather than
	// inside `<main>`, and each is a menu item that is also a link, so the chip
	// of the level in the address is looked for on the whole page by its menu
	// role, and is marked as the current one. `exact`, because a card's link
	// says its level too.
	if (testInfo.project.use.javaScriptEnabled !== false) {
		await main.getByRole('button', { name: 'More' }).click();
		await expect(
			page.getByRole('menuitem', { name: 'High school and university', exact: true })
		).toHaveAttribute('aria-current', 'true');
	}
});

test('a region chip narrows the list to that part of the world', async ({ page }) => {
	await page.goto('/conferences');
	await expect(resultsList(page)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	const main = page.getByRole('main');
	await main.getByRole('link', { name: 'North America' }).click();

	// The chip is a link to the address with the region in it (Trello WMcXfry0).
	await expect(page).toHaveURL(/[?&]region=north_america/, { timeout: DATABASE_TIMEOUT_MS });
	await expect(cardHeading(page, 'Harvard Model United Nations 2027')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(cardHeading(page, 'BERMUN 2026')).toHaveCount(0);
	await expect(main.getByRole('link', { name: 'North America' })).toHaveAttribute(
		'aria-current',
		'true'
	);
});

test('the regions and the date window are in the URL, and the filters show them', async ({
	page
}, testInfo) => {
	// Harvard starts 133 days from the seed's today, inside six months and in North
	// America. The Hague starts in 45 days, inside six months but in Europe.
	await page.goto('/conferences?region=north_america&within=6');

	await expect(cardHeading(page, 'Harvard Model United Nations 2027')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(cardHeading(page, 'The Hague International MUN Junior')).toHaveCount(0);

	await openTheFiltersOnAPhone(page, testInfo.project.name);

	const main = page.getByRole('main');
	await expect(main.getByRole('checkbox', { name: 'North America' })).toBeChecked();
	await expect(main.getByRole('radio', { name: 'Next 6 months' })).toBeChecked();

	// Three months is too soon for Harvard, and with no region The Hague is back.
	await page.goto('/conferences?within=3');

	await expect(cardHeading(page, 'The Hague International MUN Junior')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(cardHeading(page, 'Harvard Model United Nations 2027')).toHaveCount(0);
});

test('the sort order is in the URL as well', async ({ page }) => {
	await page.goto('/conferences');
	const soonestFirst = await firstCardName(page);

	await page.goto('/conferences?sort=newest');
	const newestFirst = await firstCardName(page);

	// Only that the order changed. Every seeded conference was added in one
	// statement and so shares one `created_at`, which leaves "newest" deciding
	// nothing and the tiebreak on the name deciding everything; this seed
	// therefore cannot show that the most recently listed conference comes first.
	expect(newestFirst).not.toBe(soonestFirst);
});

test("the search matches the organisation's name as well as the conference's", async ({ page }) => {
	// "Circle" is in the name of the organisation running these two and in no
	// conference's name or city, so only the organisation can have matched.
	// Going straight to the address rather than typing in the box, so the test
	// does not depend on the search debounce.
	await page.goto('/conferences?q=Circle');

	await expect(cardHeading(page, 'Harvard Model United Nations 2027')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(cardHeading(page, 'Tokyo Global MUN 2027')).toBeVisible();

	// Run by the other organisation, so not a match.
	await expect(cardHeading(page, 'The Hague International MUN Junior')).toHaveCount(0);
});

test('only published conferences that have not finished are listed', async ({ page }) => {
	await page.goto('/conferences');

	await expect(cardHeading(page, 'The Hague International MUN Junior')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// One is still a draft and the other finished in March 2026.
	await expect(cardHeading(page, 'Draft Conference (not public)')).toHaveCount(0);
	await expect(cardHeading(page, 'Rotterdam Spring MUN 2026')).toHaveCount(0);

	const main = page.getByRole('main');

	// Neither is merely further down the list: searching for each by name finds
	// nothing at all.
	await page.goto('/conferences?q=Draft%20Conference');
	await expect(main.getByRole('heading', { name: 'No conferences match.' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	await page.goto('/conferences?q=Rotterdam');
	await expect(main.getByRole('heading', { name: 'No conferences match.' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
});

test('the "open" filter lists exactly the conferences taking applications now', async ({
	page
}) => {
	await page.goto('/conferences');

	// Madrid is in the directory like any other conference, so that what happens
	// next is the filter's doing and not the directory's.
	await expect(cardHeading(page, 'Madrid International MUN 2027')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	await page.goto('/conferences?open=1');

	// Vienna's application window contains this moment, and so does that of every
	// conference with no dates on its window at all.
	await expect(cardHeading(page, 'Vienna University MUN 2027')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(cardHeading(page, 'The Hague International MUN Junior')).toBeVisible();

	// These two are the only ones the filter leaves out: Madrid's window closed a
	// fortnight ago, and Copenhagen has not opened its own yet.
	await expect(cardHeading(page, 'Madrid International MUN 2027')).toHaveCount(0);
	await expect(cardHeading(page, 'Copenhagen Schools MUN 2027')).toHaveCount(0);
});

test('a card says whether applications are open, or when they will open', async ({ page }) => {
	await page.goto('/conferences?q=Vienna');

	const openNow = cardFor(page, 'Vienna University MUN 2027');
	await expect(openNow.getByText('Applications open')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	await page.goto('/conferences?q=Copenhagen');

	// Copenhagen's window has not started yet, so its badge says which day it
	// will, as in "Opens 3 Nov 2026". The seed counts that day from the moment
	// `pnpm db:reset` ran, so only the first word can be checked.
	const openingLater = cardFor(page, 'Copenhagen Schools MUN 2027');
	await expect(openingLater.getByText(/^Opens /)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
});

test('the filters work without JavaScript, by submitting the form', async ({ page }, testInfo) => {
	test.skip(
		testInfo.project.use.javaScriptEnabled !== false,
		'With JavaScript "Apply filters" is hidden, and the test above presses Enter instead.'
	);

	await page.goto('/conferences');

	const main = page.getByRole('main');

	await main.getByLabel('Search conferences').fill('Vienna');

	// The button is pressed with the keyboard rather than clicked, the way
	// `tests/e2e/create-conference.spec.ts` does it: a click has to scroll the
	// button into view first, which the phone emulation does not always finish in
	// time, and pressing Enter on a focused submit button is what a keyboard user
	// does anyway. Either way it is the form that submits, which is the point of
	// this test, which runs on the `desktop-no-js` project only.
	await main.getByRole('button', { name: 'Apply filters' }).press('Enter');

	// A form sends every field it has, so the address also carries the filters
	// that were left empty. `q` is the one that matters here.
	await expect(page).toHaveURL(/[?&]q=Vienna/, { timeout: DATABASE_TIMEOUT_MS });

	await expect(cardHeading(page, 'Vienna University MUN 2027')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(cardHeading(page, 'BERMUN 2026')).toHaveCount(0);
});

test('"Reset" empties every filter control, not only the address', async ({ page }, testInfo) => {
	// The filter controls are bound rather than written to, so that a search typed
	// before the page came to life is kept (see
	// `tests/e2e/typing-before-javascript.spec.ts`). This is the other half of
	// that: they still have to follow the address, and "Reset" is where a reader
	// would notice at once if they did not.
	test.skip(
		testInfo.project.use.javaScriptEnabled === false,
		'Without JavaScript the link loads the page again, and a fresh page has empty boxes anyway.'
	);

	await page.goto('/conferences?q=Vienna&country=NL&open=1');
	await openTheFiltersOnAPhone(page, testInfo.project.name);

	const main = page.getByRole('main');
	await expect(main.getByLabel('Search conferences')).toHaveValue('Vienna', {
		timeout: DATABASE_TIMEOUT_MS
	});

	// The disclosure stays open across the navigation, because the page is the
	// same one and nothing rebuilds it, so it is not opened a second time here.
	await main.getByRole('link', { name: 'Reset' }).click();

	await expect(page).toHaveURL('/conferences', { timeout: DATABASE_TIMEOUT_MS });
	await expect(main.getByLabel('Search conferences')).toHaveValue('');
	// The country is a shadcn dropdown here, a button that says its choice.
	await expect(main.getByLabel('Country')).toHaveText('Any country');
	await expect(main.getByLabel('Open for applications')).not.toBeChecked();
});

test('the phone filters open with JavaScript switched off', async ({
	browser,
	baseURL
}, testInfo) => {
	test.skip(
		testInfo.project.name !== 'desktop-no-js',
		'It makes its own phone-sized window with no scripting, so it only needs running once.'
	);

	// The gap this closes: `playwright.config.ts` has a phone project and a
	// no-JavaScript project, but none that is both, so nothing else proves that
	// the "Filters" disclosure — the one control only a phone ever sees — can be
	// opened when scripting is off. It is a native `<details>`, which the browser
	// itself opens and closes, so it needs no JavaScript at all; the
	// `@supports selector(::details-content)` block in `FiltersDisclosure.svelte`
	// is what keeps its contents hidden until then.
	//
	// A context made by hand does not pick up the `use` settings from
	// `playwright.config.ts`, so the address of the test server is passed in
	// alongside the phone-sized window and the switch that turns scripting off.
	const context = await browser.newContext({
		baseURL,
		javaScriptEnabled: false,
		viewport: { width: 390, height: 844 }
	});

	try {
		const page = await context.newPage();
		await page.goto('/conferences');

		const main = page.getByRole('main');
		const country = main.getByLabel('Country');
		// The summary reads "Filters" on its own, or "Filters (1)" once a filter is
		// set, so its text is matched from the start rather than in full.
		const filtersSummary = main.getByText(/^Filters/);

		// Shut to begin with: the filters are folded away and only the summary shows.
		await expect(country).toBeHidden();
		await expect(filtersSummary).toBeVisible();

		await filtersSummary.click();

		await expect(country).toBeVisible();

		// And the form still submits from in there. The button is pressed with the
		// keyboard rather than clicked, for the reason the test above gives.
		await country.selectOption('AT');
		await main.getByRole('button', { name: 'Apply filters' }).press('Enter');

		// Austria has one conference in the seed, so the address carries the country
		// and the results are down to that one.
		await expect(page).toHaveURL(/[?&]country=AT/, { timeout: DATABASE_TIMEOUT_MS });
		await expect(cardHeading(page, 'Vienna University MUN 2027')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(cardHeading(page, 'The Hague International MUN Junior')).toHaveCount(0);
	} finally {
		// Nothing else closes a context made by hand, whether the test passed or not.
		await context.close();
	}
});

test('the whole seed is on the first page, soonest first', async ({ page }) => {
	await page.goto('/conferences');

	// The seed is smaller than one page, so a visitor who filters nothing sees
	// every conference it holds without touching the pager.
	for (const conferenceName of SEEDED_CONFERENCE_NAMES) {
		await expect(cardHeading(page, conferenceName)).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
	}

	// And in date order, which is what the page sorts by until asked otherwise.
	// The walkthrough seed's conferences sit between and around these eight, so
	// only the seeded names are kept before the order is compared.
	const namesOnPage = await cardNames(page);
	const seededNamesOnPage = namesOnPage.filter((name) => SEEDED_CONFERENCE_NAMES.includes(name));
	expect(seededNamesOnPage).toEqual(SEEDED_CONFERENCE_NAMES);
});

test('every seeded conference in the directory shows its photograph', async ({ page }) => {
	// Thirteen searches in one test, which is longer than Playwright allows one
	// test by default.
	test.slow();

	// Each conference is searched for by name rather than looked for on the
	// first page, because thirteen do not fit on one page and which one spills
	// onto the second depends on the date.
	for (const conferenceName of [...SEEDED_CONFERENCE_NAMES, ...OTHER_SEEDED_CONFERENCE_NAMES]) {
		// Each is searched for by its whole name, brackets and all, which finds it
		// because the search matches every word on its own (T164).
		const query = new URLSearchParams({ q: conferenceName });
		await page.goto(`/conferences?${query}`);

		const card = cardFor(page, conferenceName);
		await expect(card).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

		// Every seeded conference has a banner of its own (T149). The card's banner
		// is named after the conference, and so is the initials box a conference
		// without one would show, which is why `expectPictureDrawn` also checks
		// that it is a real picture the browser loaded.
		await expectPictureDrawn(card.getByRole('img', { name: conferenceName, exact: true }));
	}
});

test('finds a conference by its whole name, brackets and all, as a card shows it', async ({
	page
}) => {
	// The brackets are left out of the search, and "Northbridge MUN applications
	// open" as one piece of text is in no name, so this found nothing until the
	// search matched each word on its own (T164). The walkthrough seed's other
	// three Northbridge conferences miss "applications", so only one card is left.
	const query = new URLSearchParams({ q: 'Northbridge MUN (applications open)' });
	await page.goto(`/conferences?${query}`);

	await expect(cardFor(page, 'Northbridge MUN (applications open)')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect(await cardNames(page)).toEqual(['Northbridge MUN (applications open)']);
});

test('a card names the first two committees of its conference and counts the rest', async ({
	page
}) => {
	// `committees(name, abbreviation, position)` is an embedded lookup through the
	// `conferences_with_organization` view, and a card is the only place a browser
	// can see it. Amsterdam Open MUN 2027 is the seeded conference with three:
	// UNSC, UNHRC and UNEA, in that order.
	await page.goto('/conferences?q=Amsterdam');

	const card = cardFor(page, 'Amsterdam Open MUN 2027');

	await expect(card.getByText('UNSC', { exact: true })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(card.getByText('UNHRC', { exact: true })).toBeVisible();
	await expect(card.getByText('+1', { exact: true })).toBeVisible();
	await expect(card.getByText('UNEA', { exact: true })).toHaveCount(0);
});

test('there are twelve conferences to a page, and the pager is made of real links', async ({
	page
}, testInfo) => {
	// The seed is smaller than one page on purpose, so this test makes the
	// thirteen conferences it needs and takes them away again. They share a word
	// in their names that no other row has, and the whole test works on the
	// results of searching for that word.
	const word = PAGER_WORD_FOR_PROJECT[testInfo.project.name];
	const conferenceIds = await createPagerConferences(word);

	try {
		await page.goto(`/conferences?q=${word}`);

		const main = page.getByRole('main');

		await expect(resultsList(page).getByRole('listitem')).toHaveCount(12, {
			timeout: DATABASE_TIMEOUT_MS
		});
		// Every match is counted, not only the twelve on this page.
		await expect(
			main.getByText(`${PAGER_CONFERENCE_COUNT} conferences found`, { exact: true })
		).toBeVisible();
		await expect(main.getByText('Page 1 of 2')).toBeVisible();

		// An ordinary link, so the second page can be bookmarked, shared or opened
		// in a new tab. It carries the search with it, which is what keeps page 2
		// about the same thirteen conferences as page 1.
		await main.getByRole('link', { name: 'Next →' }).click();

		await expect(page).toHaveURL(`/conferences?q=${word}&page=2`, {
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(cardHeading(page, `Pager ${word} 13`)).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(cardHeading(page, `Pager ${word} 01`)).toHaveCount(0);
		await expect(main.getByRole('link', { name: '← Previous' })).toBeVisible();
	} finally {
		// In a `finally`, so that a failed assertion still leaves the directory as
		// the next test expects to find it.
		await deletePagerConferences(conferenceIds);
	}
});

test('pressing next or previous goes to the top of the list, as a new page would', async ({
	page
}, testInfo) => {
	// Two full pages of conferences of this test's own, so that on both pages the
	// visitor has to scroll past twelve cards to reach the pager.
	const word = PAGER_SCROLL_WORD_FOR_PROJECT[testInfo.project.name];
	const conferenceIds = await createPagerConferences(word, PAGER_SCROLL_CONFERENCE_COUNT);

	try {
		await page.goto(`/conferences?q=${word}`);
		await expect(resultsList(page).getByRole('listitem')).toHaveCount(12, {
			timeout: DATABASE_TIMEOUT_MS
		});

		await pressPagerLinkBelowTheList(page, 'Next →');

		await expect(page).toHaveURL(`/conferences?q=${word}&page=2`, {
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(cardHeading(page, `Pager ${word} 13`)).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expectScrolledToTheTop(page);

		// And back again. Page 1's address carries no `page` at all.
		await pressPagerLinkBelowTheList(page, '← Previous');

		await expect(page).toHaveURL(`/conferences?q=${word}`, { timeout: DATABASE_TIMEOUT_MS });
		await expect(cardHeading(page, `Pager ${word} 01`)).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expectScrolledToTheTop(page);
	} finally {
		await deletePagerConferences(conferenceIds);
	}
});

test('the cards are three across on a desktop', async ({ page }, testInfo) => {
	test.skip(
		testInfo.project.name === 'phone',
		'This is about the wide layout, and the phone project has a 390px window.'
	);

	await page.goto('/conferences');
	await expect(resultsList(page)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	expect(await countResultColumns(page)).toBe(3);
});

test('the hero draws its picture on a desktop', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'The picture is left out below `lg`.');

	await page.goto('/conferences');
	await expect(resultsList(page)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	// The picture says nothing the words do not, so it has an empty `alt`
	// and no role to find it by; its address is what picks it out.
	await expectPictureDrawn(page.locator('img[src="/conferences-hero.webp"]'));

	// Saved for a person to lay beside the product owner's mockup (Trello WMcXfry0).
	await saveFullPageScreenshot(page, 'conferences');
	await expectNoSidewaysOverflow(page);
});

/**
 * How far down the hero picture its bottom edge is cut, as a share of its
 * height: row 194 of the 228 in `static/conferences-hero.webp`, left of the
 * curve. Recut the picture and this changes with it.
 */
const HERO_PICTURE_CUT_SHARE = 194 / 228;

/**
 * Desktop window widths to check the hero at: the narrowest that shows the
 * picture, the product owner's laptop, the mockup's width and two large screens.
 */
const HERO_CHECK_WIDTHS = [1024, 1265, 1536, 1920, 2560];

/**
 * Where an element is drawn, or a failure naming the element that was not there.
 *
 * `boundingBox()` gives `null` for an element that is not being drawn, and a
 * comparison against `null` would read as a confusing type error rather than as
 * "the search box is missing".
 */
async function drawnBox(locator: Locator, what: string) {
	const box = await locator.boundingBox();

	if (box === null) {
		throw new Error(`${what} is not drawn.`);
	}

	return box;
}

test('the search box and the chips sit on the hero picture at every desktop width', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'The picture is left out below `lg`.');

	// The product owner asked for the picture to be the hero's background, with
	// the search box moved up onto it (Trello VtIlOpkB). So the box sits inside
	// the picture, the picture's cut falls within the chips, which hide it, and
	// the picture stops before the results begin.
	await page.goto('/conferences');
	const main = page.getByRole('main');
	const picture = page.locator('img[src="/conferences-hero.webp"]');
	await expectPictureDrawn(picture);

	for (const width of HERO_CHECK_WIDTHS) {
		await page.setViewportSize({ width, height: 900 });

		const pictureBox = await drawnBox(picture, 'The picture');
		const searchBox = await drawnBox(main.getByLabel('Search conferences'), 'The search box');
		const chips = await drawnBox(
			main.getByRole('navigation', { name: 'Quick filters' }),
			'The quick filter chips'
		);
		const sortBy = await drawnBox(main.getByLabel('Sort by:'), '"Sort by"');

		const cut = pictureBox.y + pictureBox.height * HERO_PICTURE_CUT_SHARE;
		const pictureBottom = pictureBox.y + pictureBox.height;
		const searchBoxBottom = searchBox.y + searchBox.height;
		const chipsBottom = chips.y + chips.height;

		expect(searchBox.y, `At ${width}px the search box starts above the picture.`).toBeGreaterThan(
			pictureBox.y
		);
		expect(searchBoxBottom, `At ${width}px the search box runs past the cut.`).toBeLessThan(cut);
		expect(cut, `At ${width}px the cut is above the chips.`).toBeGreaterThan(chips.y);
		expect(cut, `At ${width}px the cut is below the chips.`).toBeLessThan(chipsBottom);
		expect(pictureBottom, `At ${width}px the picture runs into the results.`).toBeLessThan(
			sortBy.y
		);
	}
});

test('the cards are two across on a tablet', async ({ page }, testInfo) => {
	test.skip(
		testInfo.project.name === 'phone',
		'The phone project emulates a touch device with a fixed 390px window.'
	);

	// `playwright.config.ts` has a desktop project and a phone project and nothing
	// in between, so the middle step of the 3 / 2 / 1 layout is checked by making
	// this one window tablet-sized. 768px is Tailwind's `md`, where the second
	// column starts.
	await page.setViewportSize({ width: 768, height: 800 });

	await page.goto('/conferences');
	await expect(resultsList(page)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	expect(await countResultColumns(page)).toBe(2);
});

test('the cards are one across on a phone, and nothing spills off the side', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	await page.goto('/conferences');
	await expect(resultsList(page)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	expect(await countResultColumns(page)).toBe(1);

	await expectNoSidewaysOverflow(page);
});

test('on a phone the filters fold away behind "Filters (n)", and opened they still fit', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	// Two filters set, so the summary counts them.
	await page.goto('/conferences?country=NL&open=1');

	const main = page.getByRole('main');
	const summary = main.getByText('Filters (2)', { exact: true });

	await expect(summary).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(main.getByLabel('Country')).toBeHidden();

	// The search box stays on screen above the fold-away.
	await expect(main.getByLabel('Search conferences')).toBeVisible();

	await summary.click();

	await expect(main.getByLabel('Country')).toBeVisible();
	await expect(main.getByLabel('Open for applications')).toBeChecked();
	await expectNoSidewaysOverflow(page);
});

test('a page past the last one shows the empty state', async ({ page }) => {
	// One of the edge cases in `specs/05-pages/public/conferences.md`. Somebody can
	// type any page number into the address, and the database answers a range past
	// the end with an error code rather than an empty list, which
	// `listConferences` turns into no results.
	await page.goto('/conferences?page=99');

	await expect(
		page.getByRole('main').getByRole('heading', { name: 'No conferences match.' })
	).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
});

test('a search that matches nothing offers a way back to the whole list', async ({ page }) => {
	await page.goto('/conferences?q=Atlantis%20Underwater%20MUN');

	const main = page.getByRole('main');

	await expect(main.getByRole('heading', { name: 'No conferences match.' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(main.getByText('Try fewer filters, or clear them.')).toBeVisible();

	await main.getByRole('link', { name: 'Clear filters' }).click();

	await expect(page).toHaveURL('/conferences', { timeout: DATABASE_TIMEOUT_MS });
	await expect(cardHeading(page, 'The Hague International MUN Junior')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
});
