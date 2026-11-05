import { expect, test } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	createTestUser,
	freeSeat,
	giveCommitteeEvent,
	giveSeat,
	makeCommitteeChair,
	removeCommitteeChair,
	removeScheduleEvent,
	setCommitteeMode,
	signIn
} from './signed-in-user';
import {
	expectNoSidewaysOverflow,
	expectPageFitsInScreens,
	saveFullPageScreenshot
} from './page-shape';

// The acceptance criteria of `specs/05-pages/delegate/committees.md` that need
// a real browser: a visitor is sent to the sign in page, somebody with no seat
// is told so, a delegate and a chair each get a card with their own badge, a
// committee somebody both sits in and chairs is one card rather than two, "Live
// now" appears only while the room is not idle, a finished conference is
// hidden until `?past=1` asks for it, and cards from two conferences come out
// in the order the conferences start.
//
// Every test makes its own account, so they can run side by side without seeing
// each other's rows. The top bar and the footer repeat some of the words the
// page uses, so everything about the page itself is looked for inside `<main>`.
//
// None of these tests needs JavaScript: the page is a list of links and has no
// form, so it works the same on the `desktop-no-js` project.

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
 * committees. Its name and its slug deliberately disagree.
 */
const AMSTERDAM_ID = '20000000-0000-4000-8000-000000000009';
const AMSTERDAM_NAME = 'Amsterdam Open MUN 2027';
const AMSTERDAM_SLUG = 'amsterdammun-2027';

/**
 * The Security Council, the first of that conference's three committees, with
 * the room the seed gives it.
 *
 * `tests/e2e/committee-page.spec.ts` hands its delegates seats in the Human
 * Rights Council and `tests/e2e/home.spec.ts` uses the Environment Assembly, so
 * this file uses the third and no test can take a seat another one is looking
 * at.
 */
const SECURITY_COUNCIL_ID = '30000000-0000-4000-8000-000000000001';
const SECURITY_COUNCIL_SLUG = 'security-council';
const SECURITY_COUNCIL_ROOM = 'Grote Zaal';

/**
 * How a card may name that committee. A card is narrow, so it names the
 * committee in full or by the short name the conference page uses; either one
 * names this committee.
 */
const SECURITY_COUNCIL_NAMES = /United Nations Security Council|UNSC/;

/**
 * Rotterdam Spring MUN 2026, the seeded conference that ended six months ago.
 *
 * It has no committees of its own, which is why the past test below makes one
 * and deletes it again rather than borrowing a committee other tests read.
 */
const ROTTERDAM_ID = '20000000-0000-4000-8000-000000000016';
const ROTTERDAM_NAME = 'Rotterdam Spring MUN 2026';

/**
 * Which Security Council seat the delegate of each Playwright project takes.
 *
 * Every test runs on all three projects at the same time against one database,
 * and a seat is a single row, so two projects taking the same seat would each
 * see the other's delegate sitting in it. One seat per project keeps them
 * apart. Each of these seats is named after its country exactly as
 * `countryName` names it, which is what the flag's alt text says.
 */
const DELEGATE_SEAT_FOR_PROJECT: Record<string, string> = {
	desktop: 'China',
	'desktop-no-js': 'France',
	phone: 'Japan'
};

/**
 * The seat each project's chair-and-delegate takes, kept apart from the three
 * above for the same reason: that test runs beside the delegate test on its own
 * project, so the two would otherwise reach for one row.
 */
const BOTH_ROLES_SEAT_FOR_PROJECT: Record<string, string> = {
	desktop: 'United Kingdom',
	'desktop-no-js': 'United States',
	phone: 'Algeria'
};

/** The seat the desktop-only "Live now" test takes, kept apart from the six above. */
const LIVE_NOW_SEAT = 'Denmark';

/** The seat the phone-only overflow test takes. */
const OVERFLOW_SEAT = 'Greece';

/**
 * The two conferences the desktop-only height test makes for itself, each with
 * one committee and one seat, in the order their cards should come out.
 *
 * The test has conferences of its own rather than a seat on the Security
 * Council, because the "Live now" test above writes an event onto that
 * committee's programme while it runs, and the picture the height test saves
 * would carry that test's "Next:" line. Two conferences rather than one, so the
 * same page also shows criterion 2 of `specs/05-pages/delegate/committees.md`:
 * cards are sorted by the date their conference starts. The one that starts
 * first is the one whose name comes last in the alphabet and the one made last,
 * so neither of those orders could pass for the right one by accident.
 *
 * They start around three years out, later than every seeded conference and
 * later than the pager conferences of `tests/e2e/conferences.spec.ts`, so they
 * are never among the soonest conferences the directory or the home dashboard
 * shows first.
 */
const ORDERING_CONFERENCES = [
	{
		name: 'Zeeland Winter MUN',
		committeeName: 'Zeeland Historical Security Council',
		seatName: 'Canada',
		countryCode: 'CA',
		startsInDays: 1_000
	},
	{
		name: 'Alkmaar Summer MUN',
		committeeName: 'Alkmaar Human Rights Council',
		seatName: 'Brazil',
		countryCode: 'BR',
		startsInDays: 1_100
	}
];

/** The organisation every seeded conference belongs to, which the test conferences join. */
const SAMPLE_ORGANIZATION_ID = '10000000-0000-4000-8000-000000000001';

/**
 * How far ahead the "Live now" test's event starts, and how long it lasts.
 *
 * An hour from now, so the event is always still to come while the test runs,
 * which is what puts it on the card's "Next: " line. The database refuses an
 * event that ends before it starts, so it lasts an hour as well.
 */
const ONE_HOUR_MS = 60 * 60 * 1000;

/** What that event is called. One desktop test writes it and deletes it again. */
const NEXT_EVENT_TITLE = 'Opening session';

/** The committee the past test makes on Rotterdam Spring MUN 2026, and its one seat. */
const PAST_COMMITTEE_NAME = 'Rotterdam Historical Committee';
const PAST_SEAT_NAME = 'Netherlands';

/**
 * How many desktop windows tall the list may be.
 *
 * It is a page of cards and nothing else, so one window holds a delegate's
 * committees with room to spare; two leaves space for somebody sitting in
 * several conferences at once without letting the cards sprawl.
 */
const COMMITTEES_PAGE_SCREENS = 2;

/**
 * Make a committee of Rotterdam Spring MUN 2026 with one seat in it, and answer
 * the committee's id.
 *
 * The service-role client writes both rows, the way
 * `tests/e2e/application.spec.ts` writes the conferences it needs: making a
 * committee is an organiser's page and not what this file is about. The
 * committee is given no abbreviation, so a card has only its full name to show
 * and the assertions below can look for that one name.
 */
async function createPastCommitteeWithOneSeat(): Promise<string> {
	const admin = createServiceRoleClient();

	const { data: committee, error } = await admin
		.from('committees')
		.insert({
			conference_id: ROTTERDAM_ID,
			name: PAST_COMMITTEE_NAME,
			// Unique to this run, because a conference never has two committees
			// with the same link and a run that was interrupted may have left one
			// behind.
			slug: `e2e-past-committee-${crypto.randomUUID()}`,
			level: 'intermediate',
			topics: [],
			position: 1
		})
		.select('id')
		.single();

	if (error || !committee) {
		throw new Error(`Could not create the past committee: ${error?.message}`);
	}

	const { error: seatError } = await admin.from('seats').insert({
		committee_id: committee.id,
		name: PAST_SEAT_NAME,
		kind: 'country',
		country_code: 'NL',
		position: 1
	});

	if (seatError) {
		throw new Error(`Could not create the past committee's seat: ${seatError.message}`);
	}

	return committee.id;
}

/**
 * Take that committee away again. Its seat and its `committee_state` row go
 * with it, because both carry `on delete cascade` from the committee.
 */
async function deleteCommittee(committeeId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin.from('committees').delete().eq('id', committeeId);

	if (error) {
		throw new Error(`Could not delete the past committee: ${error.message}`);
	}
}

/** One of `ORDERING_CONFERENCES`, which says everything the helper below needs. */
type OrderingConferenceSeed = (typeof ORDERING_CONFERENCES)[number];

/**
 * Make a published conference with one committee and one seat in it, and
 * answer the ids of the conference and the committee.
 *
 * The service-role client writes all three rows, the way
 * `createPastCommitteeWithOneSeat` below does and for the same reason. The
 * conference is published because a delegate cannot read a draft, and a
 * conference they cannot read has no card.
 */
async function createConferenceWithOneSeat(
	seed: OrderingConferenceSeed
): Promise<{ conferenceId: string; committeeId: string }> {
	const admin = createServiceRoleClient();

	const startDate = new Date();
	startDate.setDate(startDate.getDate() + seed.startsInDays);
	const startDay = startDate.toISOString().slice(0, 10);

	const { data: conference, error } = await admin
		.from('conferences')
		.insert({
			name: seed.name,
			// Unique to this run, because a run that was interrupted may have
			// left a conference with the same name behind.
			slug: `e2e-my-committees-${crypto.randomUUID()}`,
			city: 'Testville',
			country_code: 'NL',
			start_date: startDay,
			end_date: startDay,
			status: 'published',
			organization_id: SAMPLE_ORGANIZATION_ID
		})
		.select('id')
		.single();

	if (error || !conference) {
		throw new Error(`Could not create the conference ${seed.name}: ${error?.message}`);
	}

	const { data: committee, error: committeeError } = await admin
		.from('committees')
		.insert({
			conference_id: conference.id,
			name: seed.committeeName,
			slug: 'committee',
			level: 'intermediate',
			topics: [],
			position: 1
		})
		.select('id')
		.single();

	if (committeeError || !committee) {
		throw new Error(`Could not create the committee of ${seed.name}: ${committeeError?.message}`);
	}

	const { error: seatError } = await admin.from('seats').insert({
		committee_id: committee.id,
		name: seed.seatName,
		kind: 'country',
		country_code: seed.countryCode,
		position: 1
	});

	if (seatError) {
		throw new Error(`Could not create the seat of ${seed.name}: ${seatError.message}`);
	}

	return { conferenceId: conference.id, committeeId: committee.id };
}

/**
 * Take test conferences away again. Their committees and seats go with them,
 * because both lead back to the conference through `on delete cascade`.
 */
async function deleteConferences(conferenceIds: string[]): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin.from('conferences').delete().in('id', conferenceIds);

	if (error) {
		throw new Error(`Could not delete the test conferences: ${error.message}`);
	}
}

test('sends a visitor to the sign in page and back again', async ({ page }) => {
	await page.goto('/committees');

	await expect(page).toHaveURL('/login?next=%2Fcommittees');
});

test('tells somebody with no seat that they are not in a committee yet', async ({ page }) => {
	const user = await createTestUser();
	await signIn(page, user);

	await page.goto('/committees');

	const main = page.getByRole('main');

	await expect(main.getByRole('heading', { level: 1 })).toHaveText('My committees', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page).toHaveTitle('My committees · MUNMeet');

	await expect(main.getByText('You are not in a committee yet.')).toBeVisible();
	await expect(
		main.getByText('Once an organiser gives you a seat, your committee appears here.')
	).toBeVisible();

	// Every card carries an "Open" button and nothing else on the page does, so
	// no "Open" means no cards.
	await expect(main.getByRole('link', { name: 'Open' })).toHaveCount(0);

	// Somebody with no seat has usually applied for one, so the empty state sends
	// them to the list of what they have applied for rather than back to the
	// directory they came from. Following the link rather than reading its
	// `href`: SvelteKit writes an address relative to the page it is on, so the
	// attribute reads `./applications` until the browser has worked it out.
	await main.getByRole('link', { name: 'See your applications' }).click();

	await expect(page).toHaveURL('/applications', { timeout: DATABASE_TIMEOUT_MS });
});

test('shows a delegate the committee they sit in, and takes them to it', async ({
	page
}, testInfo) => {
	const seatName = DELEGATE_SEAT_FOR_PROJECT[testInfo.project.name];
	const delegate = await createTestUser('Noor Haddad');

	await giveSeat(delegate, SECURITY_COUNCIL_ID, seatName);

	try {
		await signIn(page, delegate);
		await page.goto('/committees');

		const main = page.getByRole('main');

		await expect(main.getByText(SECURITY_COUNCIL_NAMES)).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(main.getByText(AMSTERDAM_NAME)).toBeVisible();

		// The role is a badge, so it says in words which of the two roles this is.
		await expect(main.getByText('Delegate', { exact: true })).toBeVisible();

		// The seat, and the flag beside it. A flag is an `<img>` whose alt text is
		// the country's name, which for these seats is the seat's own name.
		await expect(main.getByText(seatName, { exact: true })).toBeVisible();
		await expect(main.getByRole('img', { name: seatName })).toBeVisible();

		await expect(main.getByText(SECURITY_COUNCIL_ROOM)).toBeVisible();

		// Following the link rather than reading its `href`: SvelteKit writes an
		// address relative to the page it is on, so the attribute reads
		// `./conferences/...` until the browser has worked it out.
		await main.getByRole('link', { name: 'Open' }).click();

		await expect(page).toHaveURL(
			`/conferences/${AMSTERDAM_SLUG}/committees/${SECURITY_COUNCIL_SLUG}`,
			{ timeout: DATABASE_TIMEOUT_MS }
		);
	} finally {
		// The seat is a row of `supabase/seed.sql` that this test changed, and it
		// stays changed until the next `pnpm db:reset`. Giving it back here, and
		// not at the end of the test body, means a failed assertion leaves the seed
		// as it found it too.
		await freeSeat(SECURITY_COUNCIL_ID, seatName);
	}
});

test('shows a chair the committee they run, with no seat of their own', async ({ page }) => {
	// A `committee_chairs` row is one person's, so all three projects can chair
	// the same committee at the same time without taking anything from each
	// other, and one name does for all of them: each project's browser is signed
	// in as its own account and a card is only ever about the reader.
	const chair = await createTestUser('Hannah Weber');

	await makeCommitteeChair(chair, SECURITY_COUNCIL_ID);

	try {
		await signIn(page, chair);
		await page.goto('/committees');

		const main = page.getByRole('main');

		await expect(main.getByText(SECURITY_COUNCIL_NAMES)).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(main.getByText(AMSTERDAM_NAME)).toBeVisible();
		await expect(main.getByText('Chair', { exact: true })).toBeVisible();
		await expect(main.getByText('Delegate', { exact: true })).toHaveCount(0);

		// A chair holds no seat, so the card has no country on it. A seat is the
		// only picture this page ever draws — every icon on it is `aria-hidden`,
		// the way `Button` and `EmptyState` write theirs — so no image at all is
		// how "no seat" looks from outside.
		await expect(main.getByRole('img')).toHaveCount(0);
	} finally {
		// In a `finally`, so that a failed assertion still leaves the conference as
		// the next test expects to find it. Both rows go: inserting the chair also
		// put the account on the conference's team.
		await removeCommitteeChair(chair.id, SECURITY_COUNCIL_ID, AMSTERDAM_ID);
	}
});

test('gives a committee somebody both sits in and chairs a single card', async ({
	page
}, testInfo) => {
	const seatName = BOTH_ROLES_SEAT_FOR_PROJECT[testInfo.project.name];
	const person = await createTestUser('Mateo Rossi');

	await makeCommitteeChair(person, SECURITY_COUNCIL_ID);
	await giveSeat(person, SECURITY_COUNCIL_ID, seatName);

	try {
		await signIn(page, person);
		await page.goto('/committees');

		const main = page.getByRole('main');

		await expect(main.getByText(seatName, { exact: true })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		// What `mergeMyCommittees` promises: a committee somebody sits in and
		// chairs is one row rather than two, and the seat is the one that survives,
		// because the seat is what they do in the room. Every card carries one
		// "Open" button, so counting those counts the cards.
		await expect(main.getByRole('link', { name: 'Open' })).toHaveCount(1);
		await expect(main.getByText('Delegate', { exact: true })).toBeVisible();
		await expect(main.getByText('Chair', { exact: true })).toHaveCount(0);
	} finally {
		// In a `finally`, so that a failed assertion still leaves the seed as the
		// next test expects to find it.
		await freeSeat(SECURITY_COUNCIL_ID, seatName);
		await removeCommitteeChair(person.id, SECURITY_COUNCIL_ID, AMSTERDAM_ID);
	}
});

test('says "Live now" only while the room is not idle, and names the next event', async ({
	page
}, testInfo) => {
	test.skip(
		testInfo.project.name !== 'desktop',
		'One committee_state row cannot be shared by three projects.'
	);

	const delegate = await createTestUser('Aiko Tanaka');
	const now = Date.now();

	await giveSeat(delegate, SECURITY_COUNCIL_ID, LIVE_NOW_SEAT);

	const eventId = await giveCommitteeEvent({
		conferenceId: AMSTERDAM_ID,
		committeeId: SECURITY_COUNCIL_ID,
		title: NEXT_EVENT_TITLE,
		startsAt: new Date(now + ONE_HOUR_MS).toISOString(),
		endsAt: new Date(now + 2 * ONE_HOUR_MS).toISOString()
	});

	try {
		await signIn(page, delegate);
		await page.goto('/committees');

		const main = page.getByRole('main');

		// The room is `idle`, which is what every committee's is until a chair
		// opens it, so the card names the session ahead and says nothing about the
		// room being live.
		await expect(main.getByText(`Next: ${NEXT_EVENT_TITLE}`)).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(main.getByText('Live now')).toHaveCount(0);

		await setCommitteeMode(SECURITY_COUNCIL_ID, 'formal_debate');
		await page.reload();

		await expect(main.getByText('Live now')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await expect(main.getByText(`Next: ${NEXT_EVENT_TITLE}`)).toBeVisible();

		// And the words go again when the room goes back to `idle`, which is what
		// makes them worth saying at all.
		await setCommitteeMode(SECURITY_COUNCIL_ID, 'idle');
		await page.reload();

		await expect(main.getByText(`Next: ${NEXT_EVENT_TITLE}`)).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(main.getByText('Live now')).toHaveCount(0);
	} finally {
		// In a `finally`, so that a failed assertion still leaves the seeded
		// committee idle, empty of events and with its seat free. Setting the mode
		// again costs one row and is the only way a failure halfway through the
		// test above is undone.
		await setCommitteeMode(SECURITY_COUNCIL_ID, 'idle');
		await removeScheduleEvent(eventId);
		await freeSeat(SECURITY_COUNCIL_ID, LIVE_NOW_SEAT);
	}
});

test('hides a finished conference until "Show past conferences" asks for it', async ({
	page
}, testInfo) => {
	test.skip(
		testInfo.project.name !== 'desktop',
		'One project is enough, and this one writes rows onto a conference every project reads.'
	);

	const delegate = await createTestUser('Sofia Almeida');
	const committeeId = await createPastCommitteeWithOneSeat();

	try {
		await giveSeat(delegate, committeeId, PAST_SEAT_NAME);
		await signIn(page, delegate);
		await page.goto('/committees');

		const main = page.getByRole('main');

		// Rotterdam Spring MUN 2026 ended six months ago, so this delegate's one
		// committee is left out and the page is as empty as a stranger's.
		await expect(main.getByText('You are not in a committee yet.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(main.getByText(PAST_COMMITTEE_NAME)).toHaveCount(0);

		await main.getByRole('link', { name: 'Show past conferences' }).click();

		// The URL is the single source of truth here, the way it is on
		// `/conferences`: the button is a link to another address and `load` does
		// the rest, so back and refresh both work.
		await expect(page).toHaveURL('/committees?past=1');
		await expect(main.getByText(PAST_COMMITTEE_NAME)).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(main.getByText(ROTTERDAM_NAME)).toBeVisible();

		// And the button now offers the way back rather than the way here.
		await expect(main.getByRole('link', { name: 'Hide past conferences' })).toBeVisible();
	} finally {
		// In a `finally`, so that a failed assertion still leaves Rotterdam Spring
		// MUN 2026 without committees, which is how `supabase/seed.sql` has it.
		await deleteCommittee(committeeId);
	}
});

test('nothing spills off the side of a phone screen', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	// Measured with a card on the page rather than the empty state, because a
	// card is what can push a narrow screen sideways: it holds a committee's name,
	// a conference's name, a badge, a seat and a room.
	const delegate = await createTestUser('Noor Haddad');

	await giveSeat(delegate, SECURITY_COUNCIL_ID, OVERFLOW_SEAT);

	try {
		await signIn(page, delegate);
		await page.goto('/committees');

		// Wait for the card before measuring, or the page would be measured before
		// the thing this test is about is on it.
		await expect(page.getByRole('main').getByText(SECURITY_COUNCIL_NAMES)).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		await expectNoSidewaysOverflow(page);
	} finally {
		// In a `finally`, so that a failed assertion still leaves the seed as the
		// next test expects to find it.
		await freeSeat(SECURITY_COUNCIL_ID, OVERFLOW_SEAT);
	}
});

test('is the right shape on a desktop screen, soonest conference first', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough to measure a height.');

	const delegate = await createTestUser('Noor Haddad');
	const conferenceIds: string[] = [];

	try {
		// Made in reverse, so the conference made first is the one that should be
		// shown last. Made one after the other rather than all at once, so that
		// every id is kept for the `finally` even when a later one fails.
		for (const seed of [...ORDERING_CONFERENCES].reverse()) {
			const { conferenceId, committeeId } = await createConferenceWithOneSeat(seed);

			conferenceIds.push(conferenceId);
			await giveSeat(delegate, committeeId, seed.seatName);
		}

		await signIn(page, delegate);
		await page.goto('/committees');

		// Every card is headed with its committee and its conference, so reading
		// the headings in order reads the cards in order. Waiting on this also
		// waits for both cards before the page is measured.
		const expectedHeadings = ORDERING_CONFERENCES.map(
			(seed) => `${seed.committeeName} · ${seed.name}`
		);

		await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveText(
			expectedHeadings,
			{ timeout: DATABASE_TIMEOUT_MS }
		);

		// Saved before the assertion, so that a failure leaves a picture of the
		// page that failed it.
		await saveFullPageScreenshot(page, 'committees');
		await expectPageFitsInScreens(page, COMMITTEES_PAGE_SCREENS);
	} finally {
		// In a `finally`, so that a failed assertion still leaves no test
		// conference behind for the directory to list.
		await deleteConferences(conferenceIds);
	}
});
