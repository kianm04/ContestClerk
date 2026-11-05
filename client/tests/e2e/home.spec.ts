import { expect, test, type Locator, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { makeChairedCommittee, type ChairedCommittee } from './chair-room-fixtures';
import { addPositionPaper, seatDelegateAs } from './document-fixtures';
import { expectPictureDrawn } from './drawn-picture';
import {
	expectNoSidewaysOverflow,
	expectOnFirstScreen,
	expectPageFitsInScreens,
	saveFullPageScreenshot
} from './page-shape';
import { createScheduleConference, unusedName } from './schedule-fixtures';
import {
	createTestUser,
	freeSeat,
	giveApplication,
	giveConferenceEvent,
	giveInvoice,
	giveSeat,
	makeConferenceStaff,
	removeConferenceStaff,
	removeInvoice,
	removeScheduleEvent,
	signIn,
	type TestUser
} from './signed-in-user';

// The parts of `docs/home.md` ("Your next conference", the boarding pass) that
// need a real browser. Every test makes its own account, so they can run side
// by side without seeing each other's rows.
//
// The top bar says several of the same words the page does — "Home" is a link
// in it, and a conference name can be in the bell — so everything about the
// page itself is looked for inside `<main>`.
//
// The page leads with the hero: one panel naming the reader's next conference,
// with the page's one filled button in it. Under it every section is a
// `ManageSection`, which gives its block an `aria-label` of its own title, so a
// section is a named region ("To do", "Also coming up", "Open for
// applications"). A conference name turns up in more than one of them, so an
// assertion about one section is looked for inside that region.
//
// The greeting is a `<p>`; the `<h1>` is the hero conference's name, or "Find
// your first conference" for a reader with none.
//
// None of these tests needs JavaScript: the page is all links and has no form,
// so it works the same on the `desktop-no-js` project.

/**
 * How long an assertion that waits on a page reading the database may take.
 *
 * Longer than the five seconds Playwright waits by default, for the reason
 * `tests/e2e/conferences.spec.ts` gives: every test in the run asks the one
 * local database at once, and an answer has taken up to eight seconds.
 */
const DATABASE_TIMEOUT_MS = 15_000;

/**
 * Amsterdam Open MUN 2027, the one conference in `supabase/seed.sql` with
 * committees. It is open for applications and closes among the soonest, so it is
 * also among the three "Open for applications" cards until the reader is in it.
 */
const AMSTERDAM_ID = '20000000-0000-4000-8000-000000000009';
const AMSTERDAM_NAME = 'Amsterdam Open MUN 2027';
const AMSTERDAM_SLUG = 'amsterdammun-2027';

/**
 * The Environment Assembly, one of that conference's three committees.
 *
 * `tests/e2e/committee-page.spec.ts` hands its delegates seats in the Human
 * Rights Council, so this file uses a different committee and no test can take
 * a seat another one is looking at.
 */
const ENVIRONMENT_ASSEMBLY_ID = '30000000-0000-4000-8000-000000000003';
const ENVIRONMENT_ASSEMBLY_SLUG = 'environment-assembly';
/** The abbreviation the hero's figure and the paper task name the committee by. */
const ENVIRONMENT_ASSEMBLY_HEADING = 'UNEA';

/**
 * Which Environment Assembly seat each Playwright project's delegate takes.
 *
 * Every test runs on all three projects at the same time against one database,
 * and a seat is a single row, so two projects taking the same seat would each
 * see the other's delegate sitting in it. One seat per project keeps them apart.
 * Australia and Chile are the seed's delegation's, so they are never taken here.
 */
const SEAT_FOR_PROJECT: Record<string, string> = {
	desktop: 'Egypt',
	'desktop-no-js': 'Indonesia',
	phone: 'Norway'
};

/**
 * The seat the phone-only overflow test takes, kept apart from the three above.
 *
 * That test only runs on the `phone` project, but it runs beside the delegate test
 * on that same project, so reaching for `SEAT_FOR_PROJECT.phone` would have the two
 * of them taking one row.
 */
const OVERFLOW_SEAT = 'Sweden';

/** The seat the desktop-only height test takes, kept apart from the four above. */
const HEIGHT_SEAT = 'Canada';

/**
 * How many windows tall the page may be with every section on it.
 *
 * The first version of this page stacked directory cards, each with a 16:9
 * banner, three deep in one column and four deep in another: it came out
 * 3,917px tall on a 800px window, nearly five screens, and almost all of it was
 * empty. Nothing in `pnpm verify` could see that, because every other check
 * reads text. A reader had to open the page and say it looked wrong.
 */
const DASHBOARD_SCREENS = 3;

/**
 * The window the product owner reads the site in, 1265 × 634 CSS pixels at 150%
 * zoom. `docs/home.md` section 2b budgets the first screen for it: the hero's
 * button ends well above the fold.
 */
const OWNER_WINDOW = { width: 1265, height: 634 };

/**
 * The soonest conference in `supabase/seed.sql`, six weeks out, and the hero
 * of anybody who organises it.
 */
const SOONEST_CONFERENCE_ID = '20000000-0000-4000-8000-000000000001';
const SOONEST_CONFERENCE_NAME = 'The Hague International MUN Junior';
const SOONEST_CONFERENCE_SLUG = 'hagueimun-2026';

/**
 * How many "Open for applications" cards each project sees.
 *
 * `EXPLORE_CONFERENCE_LIMIT` in `$lib/home` is three; the third card is
 * `hidden lg:block`, so a phone shows two.
 */
const EXPLORE_CARDS_IN_VIEW: Record<string, number> = {
	desktop: 3,
	'desktop-no-js': 3,
	phone: 2
};

/**
 * Brussels European MUN 2027, seven months out, which no other browser test touches.
 *
 * The programme test below writes an event on it. A conference nothing else
 * reaches for is what keeps that event from turning up on a page some other
 * test is counting the rows of.
 */
const PROGRAMME_CONFERENCE_ID = '20000000-0000-4000-8000-000000000004';
const PROGRAMME_CONFERENCE_SLUG = 'brusselsmun-2027';

/**
 * How far ahead the seeded event starts, and how long it lasts.
 *
 * Two days, so that it is still to come however long the run takes, and so that
 * the row says a date rather than "Today", which would depend on the clock.
 */
const EVENT_STARTS_IN_MS = 2 * 24 * 60 * 60 * 1000;
const EVENT_LASTS_MS = 90 * 60 * 1000;

/** One day, for moving a conference made by a fixture about in time. */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How far ahead a conference this file makes starts: a month, so every page
 * treats it as coming up and no due word turns amber from its first day.
 */
const DAYS_UNTIL_CONFERENCE = 30;

/** How long ago the overdue invoice fell due. Two days, so it is overdue in any timezone. */
const INVOICE_OVERDUE_BY_MS = 2 * ONE_DAY_MS;

/**
 * The page's one filled button: the `Button` with `variant="primary"`, which
 * `buttonClasses` paints `bg-primary`. It is an `<a>`, because the page has no
 * form, and nothing else on the page carries that class.
 */
function filledButtons(main: Locator): Locator {
	return main.locator('.bg-primary');
}

/**
 * Move a conference `createScheduleConference` made, which ran in 2020, to a
 * month from now, and shut its applications yesterday.
 *
 * Shut, because a conference with no closing date counts as open, and an open
 * one would push the seeded conferences out of "Open for applications" on the
 * pages other tests are counting the cards of.
 */
async function moveIntoTheFuture(conferenceId: string): Promise<void> {
	const firstDay = new Date(Date.now() + DAYS_UNTIL_CONFERENCE * ONE_DAY_MS);
	const lastDay = new Date(firstDay.getTime() + 2 * ONE_DAY_MS);

	const { error } = await createServiceRoleClient()
		.from('conferences')
		.update({
			start_date: firstDay.toISOString().slice(0, 10),
			end_date: lastDay.toISOString().slice(0, 10),
			applications_close_at: new Date(Date.now() - ONE_DAY_MS).toISOString()
		})
		.eq('id', conferenceId);

	if (error) {
		throw new Error(`Could not move the test conference: ${error.message}`);
	}
}

/**
 * Take a test conference away again, with its organisation. Invoices refuse to
 * let their conference go, so they go first; the rest follows the conference.
 */
async function deleteTestConference(conferenceId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { data: conference } = await admin
		.from('conferences')
		.select('organization_id')
		.eq('id', conferenceId)
		.single();

	await admin.from('invoices').delete().eq('conference_id', conferenceId);
	await admin.from('conferences').delete().eq('id', conferenceId);

	if (conference) {
		await admin.from('organizations').delete().eq('id', conference.organization_id);
	}
}

/** A delegate seated in a conference of this file's own, a month away. */
type SeatedDelegate = {
	delegate: TestUser;
	conferenceId: string;
	conferenceName: string;
	conferenceSlug: string;
	committeeSlug: string;
	seatId: string;
};

/**
 * Make a conference a month away with one committee, and seat a new account in
 * it as France.
 *
 * A conference of the test's own rather than a seeded seat, because every
 * free seat of Amsterdam's Environment Assembly is already spoken for by the
 * tests in this file and `profile.spec.ts`, one per project each, and a seat is
 * a single row two tests cannot share.
 */
async function seatDelegateInOwnConference(namePrefix: string): Promise<SeatedDelegate> {
	const organiser = await createTestUser(`${namePrefix} Organiser`);
	const delegate = await createTestUser('Sofia Almeida');
	const conference = await createScheduleConference({ owner: organiser, namePrefix });

	await moveIntoTheFuture(conference.id);

	const committeeSlug = `committee-${crypto.randomUUID()}`;
	const { data: committee, error } = await createServiceRoleClient()
		.from('committees')
		.insert({
			conference_id: conference.id,
			name: 'Human Rights Council',
			abbreviation: 'UNHRC',
			slug: committeeSlug,
			room: 'Aula'
		})
		.select('id')
		.single();

	if (error || !committee) {
		throw new Error(`Could not create the test committee: ${error?.message}`);
	}

	const seatId = await seatDelegateAs(delegate, committee.id, 'France');

	return {
		delegate,
		conferenceId: conference.id,
		conferenceName: conference.name,
		conferenceSlug: conference.slug,
		committeeSlug,
		seatId
	};
}

/** Open `/home` as `user` and wait until the hero has named its conference. */
async function openHomeAs(page: Page, user: TestUser, heroName: string | RegExp): Promise<Locator> {
	await signIn(page, user);
	await page.goto('/home');

	const main = page.getByRole('main');

	await expect(main.getByRole('heading', { level: 1 })).toHaveText(heroName, {
		timeout: DATABASE_TIMEOUT_MS
	});

	return main;
}

test('a visitor is sent to the sign in page and back again', async ({ page }) => {
	await page.goto('/home');

	await expect(page).toHaveURL('/login?next=%2Fhome');
});

test('an account that has not answered the welcome questions is sent there first', async ({
	page
}) => {
	const newUser = await createTestUser({ hasCompletedOnboarding: false });
	await signIn(page, newUser);

	await page.goto('/home');

	// `requireOnboarded` carries the page they were heading for in `next`, so the
	// welcome form sends them back here once it is saved.
	await expect(page).toHaveURL('/welcome?next=%2Fhome');
});

test('greets the person by the first word of their name, in a line that is not the title', async ({
	page
}) => {
	const user = await createTestUser('Amara Okafor');
	await signIn(page, user);

	await page.goto('/home');

	const main = page.getByRole('main');

	// "Good morning, Amara." The time-of-day word comes from the reader's own
	// clock, so only the name is asserted. The top bar shows the whole name in
	// the account button, which is why the surname is looked for inside `<main>`.
	const greeting = main.getByText(/^Good (morning|afternoon|evening), Amara\.$/);

	await expect(greeting).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(main).not.toContainText('Okafor');

	// The greeting is a `<p>`: the page's `<h1>` is the conference, or for this
	// account the way to find one.
	await expect(main.locator('p').filter({ hasText: /^Good .*, Amara\.$/ })).toBeVisible();
	await expect(main.getByRole('heading', { level: 1 })).toHaveText('Find your first conference');
});

test('leads a new account to its first conference, with the open ones under it', async ({
	page
}, testInfo) => {
	const user = await createTestUser();
	const main = await openHomeAs(page, user, 'Find your first conference');

	// One fact line under the title: how many conferences are taking
	// applications. The seed's count moves as other tests open and shut theirs,
	// so the sentence's shape is what is read.
	await expect(
		main.getByText(/^(\d+ conferences are|1 conference is|No conference is) open for applications/)
	).toBeVisible();

	// The page's one filled button, and it is the thing this reader came to do.
	// It opens the directory on the conferences that are open.
	const findButton = main.getByRole('link', { name: 'Find a conference', exact: true });

	await expect(findButton).toHaveClass(/bg-primary/);
	await expect(filledButtons(main)).toHaveCount(1);
	await expect(findButton).toHaveAttribute('href', /\/conferences\?open=1$/);

	// A reader who runs nothing gets "Create a conference" at the right of the
	// greeting; the top bar's menu has one too, so this one is looked for in `<main>`.
	await expect(
		main.getByRole('link', { name: 'Create a conference', exact: true })
	).toHaveAttribute('href', /\/create$/);

	// Nothing to come up to, so no "Also coming up"; and the directory's own
	// cards fill the rest of the page, with the conference closing soonest first.
	await expect(main.getByRole('region', { name: 'Also coming up' })).toHaveCount(0);

	const explore = main.getByRole('region', { name: 'Open for applications' });
	const cardNames = explore.getByRole('heading', { level: 3 });

	await expect(cardNames).toHaveCount(EXPLORE_CARDS_IN_VIEW[testInfo.project.name]);
	// Amsterdam closes among the soonest of the seeded conferences, so it is a
	// card for everybody who is not in it yet; the delegate test below relies on
	// that. The third card is in the page but hidden below `lg`, so on a phone
	// it is looked for in the markup rather than on the screen.
	await expect(explore.getByText(AMSTERDAM_NAME)).toBeAttached();

	// Every seeded conference has a banner of its own, so each card shows a
	// photograph rather than initials on a gradient.
	const cards = explore.getByRole('link').filter({ has: page.getByRole('heading', { level: 3 }) });

	for (const card of await cards.all()) {
		await expectPictureDrawn(card.getByRole('img'));
	}

	// The section's title link and the button lead to the same open directory.
	await explore.getByRole('link', { name: 'All conferences', exact: true }).click();

	await expect(page).toHaveURL('/conferences?open=1', { timeout: DATABASE_TIMEOUT_MS });
});

test('draws the three "Open for applications" cards one height', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough to measure a height.');

	const user = await createTestUser();
	const main = await openHomeAs(page, user, 'Find your first conference');

	const explore = main.getByRole('region', { name: 'Open for applications' });
	const cards = explore.getByRole('link').filter({ has: page.getByRole('heading', { level: 3 }) });

	await expect(cards).toHaveCount(EXPLORE_CARDS_IN_VIEW.desktop);

	// The seeded names run from one line ("BERMUN 2026") to two ("The Hague
	// International MUN Junior"). Each card is `h-full`, so a row's cards end on
	// the same line (Trello F5iChExp, "inconsistent card sizing").
	const heights: number[] = [];

	for (const card of await cards.all()) {
		const box = await card.boundingBox();
		heights.push(Math.round(box?.height ?? 0));
	}

	expect(new Set(heights).size, `card heights: ${heights.join(', ')}`).toBe(1);
});

test('leads a delegate with their conference, seat, flag and countdown, and the button opens the committee', async ({
	page
}, testInfo) => {
	const seatName = SEAT_FOR_PROJECT[testInfo.project.name];
	const delegate = await createTestUser('Noor Haddad');

	await giveSeat(delegate, ENVIRONMENT_ASSEMBLY_ID, seatName);

	try {
		const main = await openHomeAs(page, delegate, AMSTERDAM_NAME);

		// The meta line under the name starts with the reader's role.
		await expect(main.getByText(/^Delegate · /)).toBeVisible();

		// The strip: how long to go, then the seat with its flag over the
		// committee. The flag is the country's own, named after it, and is marked
		// decorative because the value beside it already names the country, so it
		// is found by its `alt` rather than by role.
		await expect(main.getByText('to go', { exact: true })).toBeVisible();
		await expect(main.getByText(seatName, { exact: true })).toBeVisible();
		await expect(main.locator(`img[alt="${seatName}"]`)).toBeVisible();
		await expect(main.getByText(ENVIRONMENT_ASSEMBLY_HEADING, { exact: true })).toBeVisible();

		// The organiser's own photograph, the seeded banner, is in the panel.
		await expectPictureDrawn(main.locator(`img[src*="/conferences/${AMSTERDAM_ID}/banner-"]`));

		// Nothing is pressing, so the button is the door into the committee, and
		// the conference's public page is the text link beside it.
		const door = main.getByRole('link', { name: 'Open committee page', exact: true });

		await expect(door).toHaveClass(/bg-primary/);
		await expect(filledButtons(main)).toHaveCount(1);
		await expect(door).toHaveAttribute(
			'href',
			new RegExp(`/conferences/${AMSTERDAM_SLUG}/committees/${ENVIRONMENT_ASSEMBLY_SLUG}$`)
		);
		await expect(main.getByRole('link', { name: 'Conference page', exact: true })).not.toHaveClass(
			/bg-primary/
		);
		await expectOnFirstScreen(page, door);

		// Amsterdam asks for position papers, so the paper is the one "To do" row,
		// with its verb as a text link to the paper page.
		const toDo = main.getByRole('region', { name: 'To do' });

		await expect(
			toDo.getByText(`Submit position paper (${ENVIRONMENT_ASSEMBLY_HEADING})`)
		).toBeVisible();
		await expect(toDo.getByRole('link', { name: 'Write paper', exact: true })).toHaveAttribute(
			'href',
			new RegExp(`/committees/${ENVIRONMENT_ASSEMBLY_SLUG}/position-paper$`)
		);

		// One conference means no "Also coming up"; and a conference the reader is
		// in is left out of the cards, which still fill their row with others.
		await expect(main.getByRole('region', { name: 'Also coming up' })).toHaveCount(0);

		const explore = main.getByRole('region', { name: 'Open for applications' });

		await expect(explore.getByRole('heading', { level: 3 })).toHaveCount(
			EXPLORE_CARDS_IN_VIEW[testInfo.project.name]
		);
		await expect(explore.getByText(AMSTERDAM_NAME)).toHaveCount(0);

		// Following the button rather than only reading its `href`: it is a plain
		// `<a>`, so it works on the `desktop-no-js` project as well.
		await door.click();

		await expect(page).toHaveURL(
			`/conferences/${AMSTERDAM_SLUG}/committees/${ENVIRONMENT_ASSEMBLY_SLUG}`,
			{ timeout: DATABASE_TIMEOUT_MS }
		);
	} finally {
		// The seat is a row of `supabase/seed.sql` that this test changed, and it
		// stays changed until the next `pnpm db:reset`. Giving it back here, and
		// not at the end of the test body, means a failed assertion leaves the seed
		// as it found it too.
		await freeSeat(ENVIRONMENT_ASSEMBLY_ID, seatName);
	}
});

test('makes an overdue invoice the next step, with "Pay invoice" as the only filled button', async ({
	page
}) => {
	const seated = await seatDelegateInOwnConference('Home invoice MUN');
	const invoiceNumber = unusedName('home').replace(' ', '-');

	const invoiceId = await giveInvoice(seated.delegate, {
		conferenceId: seated.conferenceId,
		number: invoiceNumber,
		status: 'unpaid',
		description: 'Delegate fee',
		unitAmountCents: 6500,
		seatId: seated.seatId,
		dueAt: new Date(Date.now() - INVOICE_OVERDUE_BY_MS).toISOString()
	});

	try {
		const main = await openHomeAs(page, seated.delegate, seated.conferenceName);

		// The invoice is written into the pass as its next step: the task's title,
		// its due word in red, and its verb as the button.
		await expect(main.getByText(`Pay invoice ${invoiceNumber}`, { exact: true })).toBeVisible();
		await expect(main.getByText('Overdue', { exact: true })).toBeVisible();

		const payButton = main.getByRole('link', { name: 'Pay invoice', exact: true });

		await expect(payButton).toHaveClass(/bg-primary/);
		await expect(filledButtons(main)).toHaveCount(1);
		await expect(payButton).toHaveAttribute('href', new RegExp(`/invoices/${invoiceId}$`));
		await expectOnFirstScreen(page, payButton);

		// The door into the committee is still one press away, as the text link
		// beside the button rather than a second button.
		const door = main.getByRole('link', { name: 'Open committee page', exact: true });

		await expect(door).toBeVisible();
		await expect(door).not.toHaveClass(/bg-primary/);
		await expect(door).toHaveAttribute(
			'href',
			new RegExp(`/conferences/${seated.conferenceSlug}/committees/${seated.committeeSlug}$`)
		);

		// A task the hero took is not also a "To do" row. The paper, a month
		// away, stays one, which is what keeps the section on the page to check.
		const toDo = main.getByRole('region', { name: 'To do' });

		await expect(toDo.getByRole('link', { name: 'Write paper', exact: true })).toBeVisible();
		await expect(toDo.getByText(/^Pay invoice/)).toHaveCount(0);

		await payButton.click();

		await expect(page).toHaveURL(`/invoices/${invoiceId}`, { timeout: DATABASE_TIMEOUT_MS });
	} finally {
		// In a `finally`, so that a failed assertion still takes the rows away.
		// The invoice goes first: `invoices.conference_id` is "on delete restrict".
		await removeInvoice(invoiceId);
		await deleteTestConference(seated.conferenceId);
	}
});

test('gives a chair "Open chair room" as the button until a paper waits, then "Review papers"', async ({
	page
}) => {
	const room: ChairedCommittee = await makeChairedCommittee('Home chair MUN');

	await moveIntoTheFuture(room.conferenceId);

	try {
		const main = await openHomeAs(page, room.chair, /^Home chair MUN /);

		// "Chair of UNSC", the figure "0 / papers to review", and the room as the
		// button, since nothing is pressing.
		await expect(main.getByText(/^Chair of UNSC · /)).toBeVisible();
		await expect(main.getByText('papers to review', { exact: true })).toBeVisible();

		const door = main.getByRole('link', { name: 'Open chair room', exact: true });

		await expect(door).toHaveClass(/bg-primary/);
		await expect(filledButtons(main)).toHaveCount(1);
		await expect(door).toHaveAttribute('href', new RegExp(`${room.roomPath}$`));
		await expect(main.getByRole('region', { name: 'To do' })).toHaveCount(0);

		// A delegate hands a paper in. Somebody is now waiting on the chair, so
		// the paper takes the button and the room becomes the link beside it.
		const delegate = await createTestUser('Wanjiru Kamau');
		const seatId = await seatDelegateAs(delegate, room.committeeId, 'Kenya');

		await addPositionPaper({
			conferenceId: room.conferenceId,
			committeeId: room.committeeId,
			seatId,
			delegate
		});
		await page.reload();

		await expect(main.getByText('Review 1 position paper (UNSC)', { exact: true })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		const reviewButton = main.getByRole('link', { name: 'Review papers', exact: true });

		await expect(reviewButton).toHaveClass(/bg-primary/);
		await expect(filledButtons(main)).toHaveCount(1);
		await expect(reviewButton).toHaveAttribute('href', /\/chair\/papers\?status=submitted$/);
		await expect(door).toBeVisible();
		await expect(door).not.toHaveClass(/bg-primary/);
	} finally {
		// In a `finally`, so that a failed assertion still takes the conference
		// away; the committee, its seats and the paper's row follow it.
		await deleteTestConference(room.conferenceId);
	}
});

test('shows an organiser their soonest conference, the rest under "Also coming up" with "Manage", and no cards', async ({
	page
}) => {
	const organiser = await createTestUser('Priya Nair');

	await makeConferenceStaff(organiser, SOONEST_CONFERENCE_ID, 'organiser');
	await makeConferenceStaff(organiser, AMSTERDAM_ID, 'organiser');

	try {
		const main = await openHomeAs(page, organiser, SOONEST_CONFERENCE_NAME);

		// The hero's meta line; the rows under it start with the same word, so
		// the first on the page is the one in the panel.
		await expect(main.getByText(/^Organiser · /).first()).toBeVisible();

		// The dashboard is the organiser's door. Whether it is the button or the
		// link beside it depends on whether applications are waiting at either
		// conference, which other tests change as they run; either way there is
		// exactly one filled button on the page.
		await expect(main.getByRole('link', { name: 'Open dashboard', exact: true })).toHaveAttribute(
			'href',
			new RegExp(`/manage/${SOONEST_CONFERENCE_SLUG}$`)
		);
		await expect(filledButtons(main)).toHaveCount(1);

		// The other conference is a row, a link to its own dashboard, with the
		// section's "Manage" link to the whole list.
		const comingUp = main.getByRole('region', { name: 'Also coming up' });
		const amsterdamRow = comingUp.getByRole('link').filter({ hasText: AMSTERDAM_NAME });

		await expect(amsterdamRow).toHaveAttribute('href', new RegExp(`/manage/${AMSTERDAM_SLUG}$`));
		await expect(comingUp.getByRole('link', { name: 'Manage', exact: true })).toHaveAttribute(
			'href',
			/\/manage$/
		);

		// Home does not sell an organiser other people's conferences, and the
		// Manage tab is theirs, so the title row offers nothing.
		await expect(main.getByRole('region', { name: 'Open for applications' })).toHaveCount(0);
		await expect(main.getByRole('link', { name: 'Create a conference', exact: true })).toHaveCount(
			0
		);

		// "Show all N" appears only past eight rows. No seeded account organises
		// more than eight upcoming conferences (the sample organiser has seven and
		// the walkthrough's five), and giving one account nine roles would change
		// what other tests count on those conferences, so the link's absence is
		// what is checked here, and that `?all=conferences`, which lifts the limit,
		// is read and leaves a short list as it was.
		await expect(main.getByRole('link', { name: /^Show all \d+$/ })).toHaveCount(0);

		await page.goto('/home?all=conferences');

		await expect(page).toHaveURL('/home?all=conferences');
		await expect(
			main.getByRole('region', { name: 'Also coming up' }).getByText(AMSTERDAM_NAME)
		).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await expect(main.getByRole('link', { name: /^Show all \d+$/ })).toHaveCount(0);
	} finally {
		// In a `finally`, so that a failed assertion still leaves the conferences
		// as the next test expects to find them.
		await removeConferenceStaff(organiser.id, SOONEST_CONFERENCE_ID);
		await removeConferenceStaff(organiser.id, AMSTERDAM_ID);
	}
});

test('lists an application the reader started under "Applications", and asks them to finish it', async ({
	page
}) => {
	const applicant = await createTestUser('Noor Haddad');

	// A draft at a conference still taking applications is two things at once: a
	// row under "Applications", and the "Finish your application" task. One
	// seeded row therefore shows both sections working on real data. It belongs
	// to this brand-new account alone, so the three Playwright projects cannot
	// see each other's.
	await giveApplication(applicant, { conferenceId: AMSTERDAM_ID, status: 'draft' });

	// An application is not a conference yet, so the hero still asks the reader
	// to find one; "next" rather than "first", because they have begun.
	const main = await openHomeAs(page, applicant, 'Find your next conference');

	// `exact`, because a region's name is matched as a substring and this
	// applicant, who manages nothing, also has the "Open for applications" cards.
	const applications = main.getByRole('region', { name: 'Applications', exact: true });
	const row = applications.getByRole('link').filter({ hasText: AMSTERDAM_NAME });

	await expect(row).toHaveAttribute('href', /\/applications\/[0-9a-f-]+$/);
	// The status is a word, "Draft", not a badge.
	await expect(applications.getByText('Draft', { exact: true })).toBeVisible();
	await expect(
		applications.getByRole('link', { name: 'All applications', exact: true })
	).toHaveAttribute('href', /\/applications$/);

	const toDo = main.getByRole('region', { name: 'To do' });

	await expect(toDo.getByText(`Finish your application (${AMSTERDAM_NAME})`)).toBeVisible();

	// The task's verb leads to the form that finishes it.
	await toDo.getByRole('link', { name: 'Finish application', exact: true }).click();

	await expect(page).toHaveURL(`/conferences/${AMSTERDAM_SLUG}/apply`, {
		timeout: DATABASE_TIMEOUT_MS
	});
});

test('shows the next event on the programme of a conference the reader helps run', async ({
	page
}, testInfo) => {
	const organiser = await createTestUser('Priya Nair');

	// Every organiser of this conference may read every event on it, and the
	// three projects run side by side against one database, so each writes an
	// event with its own title rather than three rows saying the same words.
	const title = `Opening ceremony (${testInfo.project.name})`;
	const startsAt = new Date(Date.now() + EVENT_STARTS_IN_MS);
	const endsAt = new Date(startsAt.getTime() + EVENT_LASTS_MS);

	await makeConferenceStaff(organiser, PROGRAMME_CONFERENCE_ID, 'organiser');

	const eventId = await giveConferenceEvent({
		conferenceId: PROGRAMME_CONFERENCE_ID,
		title,
		startsAt: startsAt.toISOString(),
		endsAt: endsAt.toISOString(),
		location: 'Main hall'
	});

	try {
		await signIn(page, organiser);
		await page.goto('/home');

		const main = page.getByRole('main');
		// `exact`, because a region's name is matched as a substring and a
		// conference day draws a "Today's programme" region.
		const programme = main.getByRole('region', { name: 'Programme', exact: true });

		await expect(programme.getByText(title)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		// The row is a link to that day of the conference's schedule, and the
		// section's title link to the reader's whole schedule.
		await expect(programme.getByRole('link').filter({ hasText: title })).toHaveAttribute(
			'href',
			new RegExp(`/conferences/${PROGRAMME_CONFERENCE_SLUG}/schedule\\?day=\\d{4}-\\d{2}-\\d{2}$`)
		);
		await expect(
			programme.getByRole('link', { name: 'Full schedule', exact: true })
		).toHaveAttribute('href', /\/schedule$/);
	} finally {
		// In a `finally`, so that a failed assertion still leaves the seed as the
		// next test expects to find it.
		await removeScheduleEvent(eventId);
		await removeConferenceStaff(organiser.id, PROGRAMME_CONFERENCE_ID);
	}
});

test('nothing spills off the side of a phone screen, and the button is on its first screen', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	// The account is given two conferences to run and a seat, so that the hero,
	// "To do" and "Also coming up" are all on the page being measured: a row
	// with a thumbnail, a flag and a status word is the one most able to push
	// the page sideways.
	const user = await createTestUser('Priya Nair');

	await makeConferenceStaff(user, AMSTERDAM_ID, 'organiser');
	await makeConferenceStaff(user, SOONEST_CONFERENCE_ID, 'organiser');
	await giveSeat(user, ENVIRONMENT_ASSEMBLY_ID, OVERFLOW_SEAT);

	try {
		const main = await openHomeAs(page, user, SOONEST_CONFERENCE_NAME);

		// Wait for the section with the rows before measuring, or the page would
		// be measured before the thing this test is about is on it.
		await expect(main.getByRole('region', { name: 'Also coming up' })).toBeVisible();

		// Saved before the assertions, so that a failure leaves a picture of the
		// page that failed them.
		await saveFullPageScreenshot(page, 'home-phone');
		await expectNoSidewaysOverflow(page);
		await expectOnFirstScreen(page, filledButtons(main));
	} finally {
		// In a `finally`, so that a failed assertion still leaves the seed as the
		// next test expects to find it.
		await freeSeat(ENVIRONMENT_ASSEMBLY_ID, OVERFLOW_SEAT);
		await removeConferenceStaff(user.id, AMSTERDAM_ID);
		await removeConferenceStaff(user.id, SOONEST_CONFERENCE_ID);
	}
});

test('fits a full page into a few screens, with the button on the first', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough to measure a height.');

	// The same account as the overflow test above: two conferences to run and a
	// seat, so that the sections with rows in them are on the page. A page is
	// measured full, because it is the rows that make it grow.
	const user = await createTestUser('Priya Nair');

	await makeConferenceStaff(user, AMSTERDAM_ID, 'organiser');
	await makeConferenceStaff(user, SOONEST_CONFERENCE_ID, 'organiser');
	await giveSeat(user, ENVIRONMENT_ASSEMBLY_ID, HEIGHT_SEAT);

	try {
		const main = await openHomeAs(page, user, SOONEST_CONFERENCE_NAME);

		await expect(main.getByRole('region', { name: 'Also coming up' })).toBeVisible();
		await expect(main.getByRole('region', { name: 'To do' })).toBeVisible();

		// Saved before the assertion, so that a failure leaves a picture of the
		// page that failed it.
		await saveFullPageScreenshot(page, 'home');
		await expectPageFitsInScreens(page, DASHBOARD_SCREENS);
		await expectOnFirstScreen(page, filledButtons(main));

		// The owner's own window, to lay beside section 2b of `docs/home.md`: the
		// hero's button ends above its fold, and nothing pushes the page sideways.
		await page.setViewportSize(OWNER_WINDOW);
		await saveFullPageScreenshot(page, 'home-owner-window');
		await expectNoSidewaysOverflow(page);
		await expectOnFirstScreen(page, filledButtons(main));
	} finally {
		// In a `finally`, so that a failed assertion still leaves the seed as the
		// next test expects to find it.
		await freeSeat(ENVIRONMENT_ASSEMBLY_ID, HEIGHT_SEAT);
		await removeConferenceStaff(user.id, AMSTERDAM_ID);
		await removeConferenceStaff(user.id, SOONEST_CONFERENCE_ID);
	}
});
