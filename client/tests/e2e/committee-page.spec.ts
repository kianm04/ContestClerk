import { expect, test } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	createTestUser,
	freeSeat,
	giveSeat,
	makeConferenceStaff,
	removeConferenceStaff,
	signIn
} from './signed-in-user';
import { makeChairedCommittee, type ChairedCommittee } from './chair-room-fixtures';
import {
	expectNoSidewaysOverflow,
	expectPageFitsInScreens,
	saveFullPageScreenshot
} from './page-shape';

// The acceptance criteria of `specs/05-pages/public/committee.md` that need a
// real browser:
//
// * the page says what the committee is, how hard it is, where it meets and how
//   many seats it has;
// * a visitor sees every seat on offer and its flag, and no delegate's name;
// * a seat the organisers are not offering never appears at all;
// * the topics are listed in the order the organisers put them;
// * the back link goes to the conference;
// * an unknown committee, and a real committee under the wrong conference, are
//   both a 404;
// * the browser tab carries the committee and the conference;
// * a delegate of the committee sees names, and their own seat among them;
// * being signed in on its own changes nothing;
// * a chair and an organiser see "Open chair room" as the one filled button and
//   first in the row, a delegate sees "Open live room" filled, and nobody sees
//   "Chair tools" (T171);
// * nothing spills off the side of a phone screen.
//
// The page is public, so most of these tests sign nobody in. The top bar and the
// footer repeat some of the words the page uses, so everything about the page
// itself is looked for inside `<main>`.

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
const CONFERENCE_SLUG = 'amsterdammun-2027';
const CONFERENCE_NAME = 'Amsterdam Open MUN 2027';

/**
 * The ids `supabase/seed.sql` gives two of the three committees.
 *
 * They are fixed in the seed, so a test can hand one to `giveSeat` without
 * looking it up first. They are written here rather than in
 * `tests/e2e/signed-in-user.ts`, because they are facts about the sample data
 * and not about signing in.
 */
const HUMAN_RIGHTS_COUNCIL_ID = '30000000-0000-4000-8000-000000000002';

/** Amsterdam Open MUN 2027 itself, for the tests that put somebody on its team. */
const CONFERENCE_ID = '20000000-0000-4000-8000-000000000009';

/**
 * How many desktop windows tall this page may be before it counts as too long
 * for what is on it. A committee with seven seats runs a little over one; two
 * leaves room for a full committee without letting the page sprawl.
 */
const COMMITTEE_PAGE_SCREENS = 2;

/**
 * The delegation `supabase/seed.sql` registers, and the two Environment
 * Assembly seats the organisers reserved for it. Neither is filled, which is
 * what makes them the one place a "reserved" seat can be looked at.
 */
const SEEDED_DELEGATION_NAME = 'Rotterdam Grammar Delegation';
const RESERVED_SEATS = ['Australia', 'Chile'];

/**
 * Which Human Rights Council seat each Playwright project's delegate takes.
 *
 * Every test runs on all three projects at the same time against one database,
 * and a seat is a single row, so two projects taking the same seat would each
 * see the other's delegate sitting in it. One seat per project keeps them apart.
 * None of them is a seat the tests below expect to find free.
 */
const SEAT_FOR_PROJECT: Record<string, string> = {
	desktop: 'Argentina',
	'desktop-no-js': 'Brazil',
	phone: 'Kenya'
};

/**
 * What each project's delegate is called, for the same reason the seats differ.
 *
 * A delegate reads the whole committee's seat list with the names on it, so all
 * three projects' delegates are on the page at once. One name for all three made
 * "the page shows my name" ambiguous, and Playwright refuses an assertion that
 * matches three elements. A name each makes it exact again, and it also proves
 * the page shows the other delegates and not only the reader.
 */
const DELEGATE_FOR_PROJECT: Record<string, string> = {
	desktop: 'Noor Haddad',
	'desktop-no-js': 'Mateo Rossi',
	phone: 'Aiko Tanaka'
};

/** The fifteen Security Council seats, in the order `supabase/seed.sql` lists them. */
const SECURITY_COUNCIL_SEATS = [
	'China',
	'France',
	'Russian Federation',
	'United Kingdom',
	'United States',
	'Algeria',
	'Denmark',
	'Greece',
	'Guyana',
	'Japan',
	'Pakistan',
	'Panama',
	'Sierra Leone',
	'Slovenia',
	'Somalia'
];

/**
 * The seven Environment Assembly seats on offer.
 *
 * The seed gives that committee eight rows. Tuvalu's has `is_available = false`,
 * an example of a seat an organiser has decided not to offer this year, and the
 * `public_seats` view leaves those out, so it is not one of these.
 */
const ENVIRONMENT_ASSEMBLY_SEATS = [
	'Australia',
	'Canada',
	'Chile',
	'Egypt',
	'Indonesia',
	'Norway',
	'Sweden'
];

/** The address of one committee's page inside Amsterdam Open MUN 2027. */
function committeePath(committeeSlug: string): string {
	return `/conferences/${CONFERENCE_SLUG}/committees/${committeeSlug}`;
}

/**
 * Make a brand-new, otherwise empty committee on Amsterdam Open MUN 2027, and
 * answer its slug.
 *
 * It is given one seat with `is_available: false` rather than none at all.
 * `getCommitteePage` in `$lib/server/committee-page.ts` only tells a signed-in
 * insider apart from a visitor by trying to read the `seats` table: a
 * committee with zero rows in it comes back empty for anyone, the same answer
 * a stranger gets, so "No background guide yet" would never be reachable for a
 * genuinely seatless committee. A single hidden seat keeps that table read
 * non-empty — so an organiser still counts as an insider — while the seat
 * grid itself, which is filtered to `is_available` seats, still has nothing to
 * show and still reads "Seats will be announced soon."
 */
async function createEmptyCommittee(): Promise<string> {
	const admin = createServiceRoleClient();
	const slug = `e2e-empty-committee-${crypto.randomUUID()}`;

	const { data: committee, error } = await admin
		.from('committees')
		.insert({
			conference_id: CONFERENCE_ID,
			name: 'Empty Committee',
			slug,
			level: 'beginner',
			topics: [],
			position: 99
		})
		.select('id')
		.single();

	if (error || !committee) {
		throw new Error(`Could not create the empty committee: ${error?.message}`);
	}

	const { error: seatError } = await admin.from('seats').insert({
		committee_id: committee.id,
		name: 'Hidden seat',
		kind: 'country',
		country_code: 'NL',
		position: 1,
		is_available: false
	});

	if (seatError) {
		throw new Error(`Could not create the empty committee's hidden seat: ${seatError.message}`);
	}

	return slug;
}

/** Take that committee away again, with the hidden seat that came with it. */
async function deleteEmptyCommittee(slug: string): Promise<void> {
	const admin = createServiceRoleClient();
	const { error } = await admin.from('committees').delete().eq('slug', slug);

	if (error) {
		throw new Error(`Could not delete the empty committee: ${error.message}`);
	}
}

test.describe('the public committee page', () => {
	test('says what the committee is, where it meets and how many seats it has', async ({ page }) => {
		await page.goto(committeePath('security-council'));

		const main = page.getByRole('main');

		await expect(main.getByRole('heading', { level: 1 })).toHaveText(
			'United Nations Security Council',
			{ timeout: DATABASE_TIMEOUT_MS }
		);
		// The short name is a badge beside the heading, and the level is the badge
		// `statusLabel('experience_level', 'advanced')` words as "Advanced".
		await expect(main.getByText('UNSC', { exact: true })).toBeVisible();
		await expect(main.getByText('Advanced', { exact: true })).toBeVisible();
		await expect(main.getByText('Grote Zaal')).toBeVisible();
		await expect(main.getByText('15 seats')).toBeVisible();
	});

	test('shows a visitor every seat and its flag, and nobody who holds one', async ({ page }) => {
		await page.goto(committeePath('security-council'));

		const main = page.getByRole('main');

		await expect(main.getByText('China', { exact: true })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		for (const seat of SECURITY_COUNCIL_SEATS) {
			await expect(main.getByText(seat, { exact: true })).toBeVisible();
		}

		// A flag is an `<img>` whose alt text is the country's name, so a seat list
		// read aloud says "France" rather than "image".
		await expect(main.getByRole('img', { name: 'France' })).toBeVisible();
		await expect(main.getByRole('img', { name: 'China' })).toBeVisible();

		// Every seat in the seed is free, and a visitor is not told even that much:
		// "Free" is for the committee's own delegates and its conference's staff,
		// and "Taken" would only appear once somebody held a seat.
		await expect(main.getByText('Free', { exact: true })).toHaveCount(0);
		await expect(main.getByText('Taken', { exact: true })).toHaveCount(0);
	});

	test('never shows a seat the organisers are not offering', async ({ page }) => {
		await page.goto(committeePath('environment-assembly'));

		const main = page.getByRole('main');

		await expect(main.getByText('Australia', { exact: true })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		for (const seat of ENVIRONMENT_ASSEMBLY_SEATS) {
			await expect(main.getByText(seat, { exact: true })).toBeVisible();
		}

		// The eighth row of the seed's Environment Assembly, and the one seat that
		// must never reach a page: not its name, not its flag, and not the count.
		await expect(main.getByText('Tuvalu')).toHaveCount(0);
		await expect(main.getByRole('img', { name: 'Tuvalu' })).toHaveCount(0);
		await expect(main.getByText('7 seats')).toBeVisible();
	});

	test('tells a signed-in reader everything is still to be announced, on a brand-new committee', async ({
		page
	}, testInfo) => {
		test.skip(
			testInfo.project.name !== 'desktop',
			'One project is enough: this test writes its own committee and reads it straight back.'
		);

		const organiser = await createTestUser('Priya Nair');
		const slug = await createEmptyCommittee();

		try {
			await makeConferenceStaff(organiser, CONFERENCE_ID, 'organiser');
			await signIn(page, organiser);
			await page.goto(committeePath(slug));

			const main = page.getByRole('main');

			// `specs/05-pages/public/committee.md`'s "Empty" state: no seats, no
			// chairs, no background guide and no topics, all at once.
			await expect(main.getByText('Seats will be announced soon.')).toBeVisible({
				timeout: DATABASE_TIMEOUT_MS
			});
			await expect(main.getByText('Chairs to be announced.')).toBeVisible();
			await expect(main.getByText('No background guide yet')).toBeVisible();
			await expect(main.getByText('Topics to be announced.')).toBeVisible();
		} finally {
			await removeConferenceStaff(organiser.id, CONFERENCE_ID);
			await deleteEmptyCommittee(slug);
		}
	});

	test('lists the topics in the order the organisers put them', async ({ page }) => {
		await page.goto(committeePath('security-council'));

		const main = page.getByRole('main');

		await expect(main.getByRole('heading', { name: 'Topics' })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		// The list that holds the first topic is the topic list, whatever else is on
		// the page. Comparing the whole list at once is what checks the order.
		const topics = main
			.getByRole('list')
			.filter({ hasText: 'The situation in the Sahel' })
			.getByRole('listitem');

		await expect(topics).toHaveText([
			'The situation in the Sahel',
			'Maritime security in the Gulf of Guinea'
		]);
	});

	test('offers a way back to the conference', async ({ page }) => {
		await page.goto(committeePath('security-council'));

		// The link reads "‹ Amsterdam Open MUN 2027"; a name matches part of a
		// link's text, so the arrow does not have to be written out here.
		await page.getByRole('main').getByRole('link', { name: CONFERENCE_NAME }).click();

		await expect(page).toHaveURL(`/conferences/${CONFERENCE_SLUG}`, {
			timeout: DATABASE_TIMEOUT_MS
		});
	});

	test('answers an unknown committee, or the wrong conference, with a 404', async ({ page }) => {
		const unknownCommittee = await page.goto(committeePath('general-assembly'));
		expect(unknownCommittee?.status()).toBe(404);

		// A real committee slug, under a conference that has committees of its own
		// but not this one. The pair has to match, or somebody could read one
		// conference's committees from another conference's address.
		const wrongConference = await page.goto(
			'/conferences/hagueimun-2026/committees/security-council'
		);
		expect(wrongConference?.status()).toBe(404);
	});

	test('names the committee and the conference in the browser tab', async ({ page }) => {
		await page.goto(committeePath('security-council'));

		// The committee's short name, not its full name, because that is what the
		// page is headed by wherever there is room for only one of the two.
		await expect(page).toHaveTitle(`UNSC · ${CONFERENCE_NAME} · MUNMeet`);
	});

	test('tells a delegate of the committee who holds which seat', async ({ page }, testInfo) => {
		const seatName = SEAT_FOR_PROJECT[testInfo.project.name];
		const delegateName = DELEGATE_FOR_PROJECT[testInfo.project.name];
		const delegate = await createTestUser(delegateName);

		await giveSeat(delegate, HUMAN_RIGHTS_COUNCIL_ID, seatName);

		try {
			await signIn(page, delegate);
			await page.goto(committeePath('human-rights-council'));

			const main = page.getByRole('main');

			await expect(main.getByText(delegateName)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

			// On their own seat, and not somewhere else on the page.
			const mySeat = main.getByRole('listitem').filter({ hasText: seatName });
			await expect(mySeat.getByText(delegateName)).toBeVisible();

			// The seats nobody holds now say so in words. A visitor sees nothing at
			// all there, which is what the test above proves.
			await expect(main.getByText('Free', { exact: true }).first()).toBeVisible();
		} finally {
			// The seat is a row of `supabase/seed.sql` that this test changed, and it
			// stays changed until the next `pnpm db:reset`. Giving it back here, and
			// not at the end of the test body, means a failed assertion leaves the
			// seed as it found it too.
			await freeSeat(HUMAN_RIGHTS_COUNCIL_ID, seatName);
		}
	});

	test('shows somebody signed in with no seat exactly what a visitor sees', async ({ page }) => {
		// A committee of its own, with every seat free: `committees.spec.ts` seats
		// delegates in the seed Security Council while this test runs, and a
		// visitor is rightly told a seat is "Taken".
		const room = await makeChairedCommittee('Bystander MUN');
		const bystander = await createTestUser('Tomas Novak');

		await signIn(page, bystander);
		await page.goto(roomCommitteePath(room));

		const main = page.getByRole('main');

		await expect(main.getByText('France', { exact: true })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		// Having an account is not being in the committee. Nothing here says which
		// seats are free, and nothing says who holds one.
		await expect(main.getByText('Free', { exact: true })).toHaveCount(0);
		await expect(main.getByText('Taken', { exact: true })).toHaveCount(0);
	});

	test('names the delegation a seat is being held for, and tells a visitor nothing', async ({
		page
	}) => {
		const main = page.getByRole('main');

		// A visitor reads the `public_seats` view, which has no `delegation_id` in
		// it, so a reserved seat looks exactly like a free one: the name, and not a
		// word about who has been promised it.
		await page.goto(committeePath('environment-assembly'));

		await expect(main.getByText('Australia', { exact: true })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(main.getByText(SEEDED_DELEGATION_NAME)).toHaveCount(0);
		await expect(main.getByText('Reserved', { exact: true })).toHaveCount(0);

		// An organiser reads the `seats` table itself, and may read the delegation
		// the seat is held for, so the seat says which school is coming.
		const organiser = await createTestUser('Pieter Janssen');
		await makeConferenceStaff(organiser, CONFERENCE_ID, 'organiser');

		try {
			await signIn(page, organiser);
			await page.goto(committeePath('environment-assembly'));

			for (const seatName of RESERVED_SEATS) {
				const reservedSeat = main.getByRole('listitem').filter({ hasText: seatName });

				await expect(reservedSeat.getByText(SEEDED_DELEGATION_NAME)).toBeVisible({
					timeout: DATABASE_TIMEOUT_MS
				});
			}

			// And a reserved seat never reads as free, which is the one thing it
			// must not say: the organisers cannot give it to anybody else.
			const australia = main.getByRole('listitem').filter({ hasText: 'Australia' });

			await expect(australia.getByText('Free', { exact: true })).toHaveCount(0);
		} finally {
			await removeConferenceStaff(organiser.id, CONFERENCE_ID);
		}
	});

	test('tells a chair a seat is reserved without telling them for whom', async ({ page }) => {
		// A chair is staff, so they read the `seats` table and see the third seat
		// state at all. They are not in the delegation and cannot manage the
		// conference, so the `delegations` select policy gives them nothing, and
		// the seat says only that it is spoken for. That is the branch
		// `reservedFor` in `$lib/server/committee-page.ts` returns `null` for.
		const chair = await createTestUser('Hannah Weber');
		await makeConferenceStaff(chair, CONFERENCE_ID, 'chair');

		try {
			await signIn(page, chair);
			await page.goto(committeePath('environment-assembly'));

			const main = page.getByRole('main');
			const australia = main.getByRole('listitem').filter({ hasText: 'Australia' });

			await expect(australia.getByText('Reserved', { exact: true })).toBeVisible({
				timeout: DATABASE_TIMEOUT_MS
			});
			await expect(main.getByText(SEEDED_DELEGATION_NAME)).toHaveCount(0);

			// The seats nobody has been promised still read as free to them, so
			// "Reserved" is saying something and not standing in for silence.
			const egypt = main.getByRole('listitem').filter({ hasText: 'Egypt' });

			await expect(egypt.getByText('Free', { exact: true })).toBeVisible();

			// The longest thing a seat row can hold is a delegation's name and the
			// word beside it, and the phone project is the only window narrow
			// enough for that to matter. The seat list is a two-column grid there,
			// so this is the one place the label is measured.
			await expectNoSidewaysOverflow(page);
		} finally {
			await removeConferenceStaff(chair.id, CONFERENCE_ID);
		}
	});

	test('is the right shape on a desktop screen', async ({ page }, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop', 'One project is enough to measure a height.');

		// Signed in as an organiser, because that is the page at its longest: the
		// two reserved seats carry a delegation's name and the word beside it, and
		// a label that wraps makes its whole grid row taller.
		const organiser = await createTestUser('Sanne Bakker');
		await makeConferenceStaff(organiser, CONFERENCE_ID, 'organiser');

		try {
			await signIn(page, organiser);
			await page.goto(committeePath('environment-assembly'));

			await expect(page.getByRole('main').getByText(SEEDED_DELEGATION_NAME).first()).toBeVisible({
				timeout: DATABASE_TIMEOUT_MS
			});

			await saveFullPageScreenshot(page, 'committee');
			await expectPageFitsInScreens(page, COMMITTEE_PAGE_SCREENS);
			await expectNoSidewaysOverflow(page);
		} finally {
			await removeConferenceStaff(organiser.id, CONFERENCE_ID);
		}
	});

	test('keeps everything inside a phone screen', async ({ page }, testInfo) => {
		test.skip(
			testInfo.project.name !== 'phone',
			'Only the phone project has a phone-sized window.'
		);

		await page.goto(committeePath('security-council'));

		await expect(page.getByRole('main').getByText('China', { exact: true })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		await expectNoSidewaysOverflow(page);
	});
});

/** The committee page of a committee `makeChairedCommittee` made. */
function roomCommitteePath(room: ChairedCommittee): string {
	return `/conferences/${room.conferenceSlug}/committees/${room.committeeSlug}`;
}

test.describe('the role buttons on the committee page', () => {
	test('lead a chair to the chair room with the one filled button', async ({ page }) => {
		const room = await makeChairedCommittee('Role Buttons Chair MUN');

		await signIn(page, room.chair);
		await page.goto(roomCommitteePath(room));

		const main = page.getByRole('main');
		// A filled button or link carries the brand colour.
		const filledControls = main.locator(
			'a:is(.bg-primary, .bg-brand-900):visible, button:is(.bg-primary, .bg-brand-900):visible'
		);

		await expect(filledControls).toHaveText(['Open chair room'], {
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(main.getByRole('link', { name: 'Open live room' })).toBeVisible();
		await expect(main.getByRole('link', { name: 'Chair tools' })).toHaveCount(0);

		await filledControls.click();
		await expect(page).toHaveURL(room.roomPath, { timeout: DATABASE_TIMEOUT_MS });
	});

	test('lead an organiser to the chair room too, with the editor outlined', async ({ page }) => {
		const room = await makeChairedCommittee('Role Buttons Organiser MUN');

		await signIn(page, room.organiser);
		await page.goto(roomCommitteePath(room));

		const main = page.getByRole('main');
		const filledControls = main.locator(
			'a:is(.bg-primary, .bg-brand-900):visible, button:is(.bg-primary, .bg-brand-900):visible'
		);

		await expect(filledControls).toHaveText(['Open chair room'], {
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(main.getByRole('link', { name: 'Edit committee' })).toBeVisible();
		await expect(main.getByRole('link', { name: 'Chair tools' })).toHaveCount(0);
	});

	test('lead a delegate to the live room, with no chair room to open', async ({ page }) => {
		const room = await makeChairedCommittee('Role Buttons Delegate MUN');
		const delegate = await createTestUser('Role Buttons Delegate');

		await giveSeat(delegate, room.committeeId, 'France');

		await signIn(page, delegate);
		await page.goto(roomCommitteePath(room));

		const main = page.getByRole('main');
		const filledControls = main.locator(
			'a:is(.bg-primary, .bg-brand-900):visible, button:is(.bg-primary, .bg-brand-900):visible'
		);

		await expect(filledControls).toHaveText(['Open live room'], {
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(main.getByRole('link', { name: 'Open chair room' })).toHaveCount(0);
		await expect(main.getByRole('link', { name: 'Chair tools' })).toHaveCount(0);
	});
});
