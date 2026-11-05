import { expect, test, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { markPage, readMarker, skipWithoutJavaScript } from './in-place';
import {
	AT_ONCE_TIMEOUT_MS,
	answerSlowly,
	answerWithError,
	sawSpinner,
	watchForSpinners
} from './instant';
import { createTestUser, freeSeat, giveSeat, signIn, type TestUser } from './signed-in-user';
import {
	expectNoSidewaysOverflow,
	expectPageFitsInScreens,
	saveFullPageScreenshot
} from './page-shape';

// The acceptance criteria of `specs/05-pages/delegate/profile.md` that need a
// real browser, for both parts of that page: `/profile` and `/profile/edit`.
// T56 built the page and its two text forms, and T58 added the photo form above
// them. The awards rows are T48's, so the only thing this file can say about
// that section is what the page says while it is missing.
//
// Every test makes its own account, so they can run side by side without
// seeing each other's rows.
//
// The top bar says several of the same words these pages do — the profile menu
// holds a "Profile" line and the person's own name — so everything about the
// page itself is looked for inside `<main>`. The flash message after a save is
// the exception: the app shell draws it outside `<main>`, so it is looked for
// on the page as a whole.
//
// "All forms work without JavaScript" is the criterion this whole file proves
// rather than one test in it. All three forms are a real `<form method="post">`
// posting to a form action — the photo form carries
// `enctype="multipart/form-data"` as well, which is what lets a form hold a
// file — and every test below fills one in and presses its button, so the whole
// file runs as it is on the `desktop-no-js` project. Playwright's
// `setInputFiles` works there too, because handing a file box a file is
// something the browser does rather than something a script does. The only
// tests that need JavaScript are the two that measure the page, because they
// ask the browser for its own dimensions, and each of those already runs on one
// project alone.

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
 * committees, which is what makes it the conference a history row can name.
 */
const AMSTERDAM_NAME = 'Amsterdam Open MUN 2027';
const AMSTERDAM_SLUG = 'amsterdammun-2027';

/**
 * The Human Rights Council, one of that conference's three committees, and the
 * committee this file takes its seats from.
 *
 * Not the Environment Assembly, which is the committee `tests/e2e/home.spec.ts`
 * uses: that file already holds five of the seven seats that committee offers,
 * which leaves Australia and Chile, one short of a seat for each Playwright
 * project. The three seats below are the council's, and are the ones
 * `tests/e2e/committee-page.spec.ts` does not take. Four of its ten seats are
 * still free with all six of ours and theirs handed out, which is what that
 * file's "one seat still reads Free" assertion needs.
 */
const HUMAN_RIGHTS_COUNCIL_ID = '30000000-0000-4000-8000-000000000002';
const HUMAN_RIGHTS_COUNCIL_SLUG = 'human-rights-council';

/**
 * The Environment Assembly, and the conference all three committees belong to.
 *
 * The chair test below uses this committee rather than the council above,
 * because a chair row is keyed by the committee and the person together: all
 * three Playwright projects can chair one committee at once, where a seat is a
 * single row and they would take each other's.
 */
const ENVIRONMENT_ASSEMBLY_ID = '30000000-0000-4000-8000-000000000003';
const AMSTERDAM_ID = '20000000-0000-4000-8000-000000000009';

/**
 * Which Human Rights Council seat each Playwright project's delegate takes.
 *
 * Every test runs on all three projects at the same time against one database,
 * and a seat is a single row, so two projects taking the same seat would each
 * see the other's delegate sitting in it. One seat per project keeps them apart.
 */
const SEAT_FOR_PROJECT: Record<string, string> = {
	desktop: 'Bangladesh',
	'desktop-no-js': 'Germany',
	phone: 'India'
};

/**
 * How many windows tall `/profile` may be.
 *
 * It is a handful of cards about one person, not an article, so two screens is
 * the most it should ask somebody to scroll through. The dashboard's own limit
 * in `tests/e2e/home.spec.ts` says why this is measured at all: nothing else in
 * `pnpm verify` can see a page that came out four screens tall with most of it
 * empty.
 */
const PROFILE_SCREENS = 2;

/**
 * How many windows tall `/profile/edit` may be, which is one more.
 *
 * The page file asks for eleven fields and a file box in one 640px column, each
 * with its label and some with a line of help under them, in three cards with a
 * heading and a button apiece. That came to about 1,800px with the two text
 * forms alone and comes to 2,172px with the photo form above them, which is 2.7
 * screens on the 800px window this project uses, and the only way to make it
 * two would be to take fields away. A form is allowed to be as long as the
 * questions it asks; what this limit still catches is the same form drawn at
 * twice the size.
 */
const PROFILE_EDIT_SCREENS = 3;

/**
 * The five private facts a test writes before reading them back off the page.
 *
 * `dateOfBirthOnThePage` is the same date as `dateOfBirth` in the words the
 * page uses: `formatDateRange` in `src/lib/dates.ts` writes a single day as
 * "12 Mar 2004", and the profile passes it the date of birth at both ends.
 */
const PRIVATE_DETAILS = {
	dateOfBirth: '2004-03-12',
	dateOfBirthOnThePage: '12 Mar 2004',
	phone: '+31 6 1234 5678',
	dietaryRequirements: 'Vegetarian',
	emergencyContactName: 'Mariam Haddad',
	emergencyContactPhone: '+31 6 8765 4321'
};

/** A bio of a believable length, for the tests that want the About card filled in. */
const SAMPLE_BIO =
	'I have been taking part in Model United Nations since secondary school, mostly in ' +
	'committees on climate and human rights, and I chaired my first committee last spring.';

/**
 * The name the photo tests give their account, and the two letters `initials`
 * in `src/lib/text.ts` makes of it.
 *
 * `Avatar` shows those letters in place of a picture, so they are what says the
 * picture has gone once it has been removed.
 */
const PHOTO_TEST_NAME = 'Amara Okafor';
const PHOTO_TEST_INITIALS = 'AO';

/**
 * A real 1×1 pixel JPEG, all 160 bytes of it, written out as base64.
 *
 * `setInputFiles` takes a name, a type and the bytes themselves, so a test can
 * hand the form a picture that is on no disk anywhere and this repository need
 * carry no binary file.
 */
const SMALL_JPEG_BASE64 =
	'/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
	'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
	'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

/** That JPEG as the file box receives it: a picture under every limit there is. */
const SMALL_JPEG = {
	name: 'photo.jpg',
	mimeType: 'image/jpeg',
	buffer: Buffer.from(SMALL_JPEG_BASE64, 'base64')
};

/**
 * A file that says it is a JPEG and is a megabyte over the 5 MB limit.
 *
 * Its six million bytes are all zeroes, because nothing ever looks at them: the
 * size is what the server refuses it for. The type still has to be one of the
 * three the form takes, or it would be refused for being the wrong kind of file
 * before its size was ever measured.
 */
const OVERSIZED_JPEG = {
	name: 'enormous-photo.jpg',
	mimeType: 'image/jpeg',
	buffer: Buffer.alloc(6 * 1024 * 1024)
};

/** A PDF, which is the wrong kind of file however small it is. */
const A_PDF = {
	name: 'passport.pdf',
	mimeType: 'application/pdf',
	buffer: Buffer.from('%PDF-1.4\n')
};

/**
 * Wait until the avatar inside `<main>` is a real picture.
 *
 * `Avatar` draws an `<img>` when it has a picture and a `<span role="img">`
 * holding the initials when it has none, and both carry the person's name, so
 * `getByRole('img', { name })` finds either of the two. What tells them apart is
 * the `src`, which only the `<img>` has: it points at the file in the
 * `public-media` bucket the upload put there.
 */
async function expectPhotoIsShown(page: Page, name: string): Promise<void> {
	const avatar = page.getByRole('main').getByRole('img', { name });

	await expect(avatar).toHaveAttribute('src', /public-media\/avatars\//, {
		timeout: DATABASE_TIMEOUT_MS
	});
}

/**
 * Wait until that same avatar is the letters `Avatar` falls back to instead.
 *
 * This is the other half of the test above. An `<img>` is a tag with no
 * contents, so letters read off the element can only have come from the
 * `<span>`, which means the picture is gone.
 */
async function expectInitialsAreShown(page: Page, name: string, letters: string): Promise<void> {
	const avatar = page.getByRole('main').getByRole('img', { name });

	await expect(avatar).toHaveText(letters, { timeout: DATABASE_TIMEOUT_MS });
}

/**
 * Fill in the five private facts with the service-role client.
 *
 * Saving them through the form is what the edit page's own tests do. The view
 * page has to have something to show before it can be read, so the client
 * stands in for the form here the way `giveSeat` stands in for allocation.
 */
async function givePrivateDetails(user: TestUser): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('profile_details')
		.update({
			date_of_birth: PRIVATE_DETAILS.dateOfBirth,
			phone: PRIVATE_DETAILS.phone,
			dietary_requirements: PRIVATE_DETAILS.dietaryRequirements,
			emergency_contact_name: PRIVATE_DETAILS.emergencyContactName,
			emergency_contact_phone: PRIVATE_DETAILS.emergencyContactPhone
		})
		.eq('user_id', user.id);

	if (error) {
		throw new Error(`Could not give the test account its private details: ${error.message}`);
	}
}

/**
 * Make the account a chair of a committee, the way an organiser's invitation
 * one day will.
 *
 * `supabase/seed.sql` has no `committee_chairs` rows at all, because a chair is
 * a real account from `auth.users` and that file cannot invent one, so a test
 * that wants to see a chair in the conference history has to make one. The
 * service-role client stands in for the invitation, as `giveSeat` stands in for
 * allocation.
 *
 * The `ensure_chair_is_staff` trigger writes the conference's `conference_staff`
 * row as well, which is why `stopBeingCommitteeChair` below takes two rows away
 * again and not one.
 */
async function makeCommitteeChair(
	user: TestUser,
	committeeId: string,
	title: string
): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('committee_chairs')
		.insert({ committee_id: committeeId, user_id: user.id, title });

	if (error) {
		throw new Error(`Could not make the test account a chair: ${error.message}`);
	}
}

/** Take both of those rows away again, so one test does not change what the next one sees. */
async function stopBeingCommitteeChair(user: TestUser, committeeId: string): Promise<void> {
	const admin = createServiceRoleClient();

	await admin
		.from('committee_chairs')
		.delete()
		.eq('committee_id', committeeId)
		.eq('user_id', user.id);

	await admin
		.from('conference_staff')
		.delete()
		.eq('conference_id', AMSTERDAM_ID)
		.eq('user_id', user.id);
}

/**
 * Change columns of the account's own `profiles` row with the service-role
 * client. The names are the database's own, not the form's.
 *
 * `createTestUser` fills in all four required fields, because almost every
 * other test needs an account the onboarding gate lets through, so a test that
 * wants a half-finished profile has to empty one again itself.
 */
async function setProfileColumns(
	user: TestUser,
	columns: Record<string, string | null>
): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin.from('profiles').update(columns).eq('id', user.id);

	if (error) {
		throw new Error(`Could not change the test account's profile: ${error.message}`);
	}
}

/**
 * Make an account with every field of its profile filled in and sign it in.
 *
 * The two tests that measure a page both want it at its fullest: it is long
 * values that push a narrow column sideways and make a page tall, and a bare
 * account's profile is mostly empty states.
 */
async function signInWithFullProfile(page: Page): Promise<void> {
	const user = await createTestUser('Amara Okafor');

	await givePrivateDetails(user);
	await setProfileColumns(user, { bio: SAMPLE_BIO, pronouns: 'she/her' });
	await signIn(page, user);
}

test.describe('the profile page', () => {
	test('names itself in the browser tab', async ({ page }) => {
		const user = await createTestUser();
		await signIn(page, user);

		await page.goto('/profile');

		await expect(page).toHaveTitle('Your profile · MUNMeet');
	});

	test('sends a visitor to the sign in page and back again', async ({ page }) => {
		await page.goto('/profile');

		await expect(page).toHaveURL('/login?next=%2Fprofile');
	});

	test('sends an account that has not answered the welcome questions there first', async ({
		page
	}) => {
		const newUser = await createTestUser({ hasCompletedOnboarding: false });
		await signIn(page, newUser);

		await page.goto('/profile');

		// `requireOnboarded` carries the page they were heading for in `next`, so
		// the welcome form sends them back here once it is saved.
		await expect(page).toHaveURL('/welcome?next=%2Fprofile');
	});

	test('shows every public field, the bio, and the private details under their own heading', async ({
		page
	}) => {
		const user = await createTestUser('Amara Okafor');

		await givePrivateDetails(user);
		await setProfileColumns(user, { bio: SAMPLE_BIO, pronouns: 'she/her' });
		await signIn(page, user);

		await page.goto('/profile');

		const main = page.getByRole('main');

		await expect(main.getByRole('heading', { name: 'Your profile', level: 1 })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		// The header's own action, beside the heading. It is the only "Edit
		// profile" link on the page, because this account has nothing missing for
		// the warning notice to offer a second one.
		await expect(main.getByRole('link', { name: 'Edit profile' })).toBeVisible();

		// The public fields: the name the account signed up with, the two answers
		// `completeOnboarding` gives the welcome form, the experience level as the
		// word its badge uses, and the pronouns.
		await expect(main.getByRole('heading', { name: 'Amara Okafor', level: 2 })).toBeVisible();
		await expect(main.getByText('Delft University')).toBeVisible();
		await expect(main.getByText('Netherlands')).toBeVisible();
		await expect(main.getByText('Intermediate', { exact: true })).toBeVisible();
		await expect(main.getByText('she/her')).toBeVisible();

		await expect(main.getByRole('heading', { name: 'About' })).toBeVisible();
		await expect(main.getByText(SAMPLE_BIO)).toBeVisible();

		// The six facts under the lock, which only this person, the organisers of a
		// conference they attend and the head of a delegation they are in may see.
		await expect(main.getByRole('heading', { name: 'Private details' })).toBeVisible();
		await expect(
			main.getByText(
				'Only organisers of conferences you attend, and the head of a school delegation you join, can see these.'
			)
		).toBeVisible();
		await expect(main.getByText(user.email)).toBeVisible();
		await expect(main.getByText(PRIVATE_DETAILS.dateOfBirthOnThePage)).toBeVisible();
		await expect(main.getByText(PRIVATE_DETAILS.phone)).toBeVisible();
		await expect(main.getByText(PRIVATE_DETAILS.dietaryRequirements)).toBeVisible();
		await expect(main.getByText(PRIVATE_DETAILS.emergencyContactName)).toBeVisible();
		await expect(main.getByText(PRIVATE_DETAILS.emergencyContactPhone)).toBeVisible();
	});

	test('says so for a bio and for private details nobody has filled in', async ({ page }) => {
		const user = await createTestUser();
		await signIn(page, user);

		await page.goto('/profile');

		const main = page.getByRole('main');

		await expect(main.getByText('You have not written a bio yet.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		// The email address is the one of the six private facts that is always
		// there, because the account cannot exist without it. The other five —
		// date of birth, phone, dietary requirements, emergency contact and
		// emergency contact phone — read "Not given" until somebody fills them in.
		await expect(main.getByText('Not given')).toHaveCount(5);
	});

	test('warns about a required field nobody has filled in, and links to the edit page', async ({
		page
	}) => {
		const user = await createTestUser();

		// Emptied again after `createTestUser` filled it in, so that the page has
		// a missing required field to warn about.
		await setProfileColumns(user, { institution_name: null });
		await signIn(page, user);

		await page.goto('/profile');

		// `Notice` is a block with `role="status"`, so the warning can be picked
		// out of the page by the words it carries rather than by how it looks.
		const warning = page
			.getByRole('main')
			.getByRole('status')
			.filter({ hasText: 'Complete your profile' });

		await expect(warning).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await expect(warning).toContainText(
			'Organisers need your institution before your application tells them anything.'
		);

		await warning.getByRole('link', { name: 'Edit profile' }).click();

		await expect(page).toHaveURL('/profile/edit');
	});

	test('lists a seat in the conference history and links to that committee', async ({
		page
	}, testInfo) => {
		const seatName = SEAT_FOR_PROJECT[testInfo.project.name];
		const delegate = await createTestUser('Yusuf Demir');

		await giveSeat(delegate, HUMAN_RIGHTS_COUNCIL_ID, seatName);

		try {
			await signIn(page, delegate);
			await page.goto('/profile');

			// `Section` gives each block an `aria-label` with its own title, which
			// makes it a named region, so an assertion about this section is looked
			// for inside it rather than anywhere on the page.
			const history = page.getByRole('main').getByRole('region', { name: 'Conference history' });

			// The whole row is one link to the committee, so everything it says is
			// asserted on that link: that also proves the four facts are on one row
			// and not scattered over the section.
			const row = history.getByRole('link', { name: AMSTERDAM_NAME });

			await expect(row).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
			// A history row is narrow, so it may name the committee in full or by
			// the short name the committee's own page uses. Either one names this
			// committee.
			await expect(row).toContainText(/United Nations Human Rights Council|UNHRC/);
			await expect(row).toContainText(seatName);
			// The role is a badge, so it says in words which of the two roles this
			// is: a chair's row would read "Chair" here.
			await expect(row).toContainText('Delegate');

			await row.click();

			await expect(page).toHaveURL(
				`/conferences/${AMSTERDAM_SLUG}/committees/${HUMAN_RIGHTS_COUNCIL_SLUG}`,
				{ timeout: DATABASE_TIMEOUT_MS }
			);
		} finally {
			// The seat is a row of `supabase/seed.sql` that this test changed, and it
			// stays changed until the next `pnpm db:reset`. Giving it back here, and
			// not at the end of the test body, means a failed assertion leaves the
			// seed as it found it too.
			await freeSeat(HUMAN_RIGHTS_COUNCIL_ID, seatName);
		}
	});

	test('lists a committee somebody chairs, under the title they hold there', async ({ page }) => {
		const chair = await createTestUser('Noor Haddad');

		// A vice chair rather than a plain chair, because the row carries its own
		// title and the page shows that column rather than a word of its own.
		await makeCommitteeChair(chair, ENVIRONMENT_ASSEMBLY_ID, 'Vice Chair');

		try {
			await signIn(page, chair);
			await page.goto('/profile');

			const history = page.getByRole('main').getByRole('region', { name: 'Conference history' });
			const row = history.getByRole('link', { name: AMSTERDAM_NAME });

			await expect(row).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
			await expect(row).toContainText(/United Nations Environment Assembly|UNEA/);
			await expect(row).toContainText('Vice Chair');
			// A chair holds no seat, so the committee is followed straight by the
			// conference's dates, which begin with the day of the month. A delegate's
			// row has the country in between, as the test above reads it.
			await expect(row).toContainText(/UNEA · \d/);
			await expect(row).not.toContainText('Delegate');
		} finally {
			// In a `finally`, so a failed assertion still leaves the seed and the
			// conference's team as the next test expects to find them.
			await stopBeingCommitteeChair(chair, ENVIRONMENT_ASSEMBLY_ID);
		}
	});

	test('says so when there is no conference history, and offers the directory', async ({
		page
	}) => {
		const user = await createTestUser();
		await signIn(page, user);

		await page.goto('/profile');

		const history = page.getByRole('main').getByRole('region', { name: 'Conference history' });

		await expect(history.getByText('You have not taken part in a conference yet.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(
			history.getByText('Conferences where you hold a seat or chair a committee appear here.')
		).toBeVisible();

		// `EmptyState` draws its action as a `Button` with an `href`, which is a
		// link that looks like a button.
		await history.getByRole('link', { name: 'Browse conferences' }).click();

		await expect(page).toHaveURL('/conferences', { timeout: DATABASE_TIMEOUT_MS });
	});

	test('says that awards appear once a conference publishes them', async ({ page }) => {
		const user = await createTestUser();
		await signIn(page, user);

		await page.goto('/profile');

		const awards = page.getByRole('main').getByRole('region', { name: 'Awards' });

		// The `awards` table itself arrives with T39 and T48 fills this section in,
		// so the empty state is everything this section can say today.
		await expect(awards.getByText('No awards yet.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(
			awards.getByText('Awards appear here once a conference publishes them.')
		).toBeVisible();
	});

	test('the profile menu in the top bar leads here', async ({ page }) => {
		const user = await createTestUser('Daniel Perez');
		await signIn(page, user);

		// Opened from another page, so that the only "Profile" to click is the one
		// in the menu and not the "Edit profile" link on the profile itself.
		await page.goto('/conferences');

		// The menu is a native `<details>`, so opening it is a click on the
		// person's picture and nothing more, with or without JavaScript.
		await page.getByLabel('Daniel Perez').click();
		await page.getByRole('link', { name: 'Profile', exact: true }).click();

		await expect(page).toHaveURL('/profile');
	});

	test('nothing spills off the side of a phone screen', async ({ page }, testInfo) => {
		test.skip(
			testInfo.project.name !== 'phone',
			'Only the phone project has a phone-sized window.'
		);

		await signInWithFullProfile(page);
		await page.goto('/profile');

		// Wait for the private details before measuring, or the page would be
		// measured before the long values this test is about are on it.
		await expect(page.getByRole('main').getByText(PRIVATE_DETAILS.phone)).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		await expectNoSidewaysOverflow(page);
	});

	test('fits a full profile into a couple of screens', async ({ page }, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop', 'One project is enough to measure a height.');

		await signInWithFullProfile(page);
		await page.goto('/profile');

		await expect(page.getByRole('main').getByText(PRIVATE_DETAILS.phone)).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		// Saved before the assertion, so that a failure leaves a picture of the
		// page that failed it.
		await saveFullPageScreenshot(page, 'profile');
		await expectPageFitsInScreens(page, PROFILE_SCREENS);
	});
});

test.describe('the profile edit page', () => {
	test('names itself in the browser tab', async ({ page }) => {
		const user = await createTestUser();
		await signIn(page, user);

		await page.goto('/profile/edit');

		await expect(page).toHaveTitle('Edit profile · MUNMeet');
		await expect(
			page.getByRole('main').getByRole('heading', { name: 'Edit profile', level: 1 })
		).toBeVisible();
	});

	test('sends a visitor to the sign in page and back again', async ({ page }) => {
		await page.goto('/profile/edit');

		await expect(page).toHaveURL('/login?next=%2Fprofile%2Fedit');
	});

	test('sends an account that has not answered the welcome questions there first', async ({
		page
	}) => {
		const newUser = await createTestUser({ hasCompletedOnboarding: false });
		await signIn(page, newUser);

		await page.goto('/profile/edit');

		await expect(page).toHaveURL('/welcome?next=%2Fprofile%2Fedit');
	});

	test('saves the public fields and says so on the profile', async ({ page }) => {
		const user = await createTestUser('Amara Okafor');
		await signIn(page, user);

		await page.goto('/profile/edit');

		// The form arrives with the saved values already in it, so changing two
		// fields is enough: the country and the experience level are chosen
		// already, which is what `createTestUser` filled in.
		await page.getByLabel('Full name').fill('Amara N. Okafor');
		await page.getByLabel('Pronouns').fill('she/her');
		await page.getByRole('button', { name: 'Save profile' }).press('Enter');

		await expect(page).toHaveURL('/profile', { timeout: DATABASE_TIMEOUT_MS });

		// The flash message first, because the app shell takes it off the screen
		// again after five seconds when JavaScript is on.
		await expect(page.getByText('Profile saved.')).toBeVisible();

		const main = page.getByRole('main');

		await expect(main.getByRole('heading', { name: 'Amara N. Okafor', level: 2 })).toBeVisible();
		await expect(main.getByText('she/her')).toBeVisible();
	});

	test('saving the public fields answers in place without reloading', async ({
		page
	}, testInfo) => {
		// T125: this form used to post and reload the page it redirects to. The
		// save still moves from `/profile/edit` to `/profile`, but through
		// SvelteKit's own router (`goto`, inside `applyAction`) rather than a
		// full browser reload, which is what leaves the marker on `window` in
		// place (`./in-place.ts`).
		skipWithoutJavaScript(testInfo);
		const user = await createTestUser('Amara Okafor');
		await signIn(page, user);

		await page.goto('/profile/edit');
		await markPage(page);

		await page.getByLabel('Pronouns').fill('she/her');
		await page.getByRole('button', { name: 'Save profile' }).click();

		await expect(page).toHaveURL('/profile', { timeout: DATABASE_TIMEOUT_MS });
		await expect(page.getByText('Profile saved.')).toBeVisible();
		expect(await readMarker(page)).toBe('still here');
	});

	test('says "Profile saved." at once, and a failed save says it was not saved', async ({
		page
	}, testInfo) => {
		// T142: the toast shows the moment the button is pressed, before the
		// server has answered and with no spinner. A save the server fails says
		// so instead, and the reader stays on the form with what they typed.
		skipWithoutJavaScript(testInfo);
		const user = await createTestUser('Amara Okafor');
		await signIn(page, user);

		await page.goto('/profile/edit');
		await answerSlowly(page, 'updatePublic');
		await watchForSpinners(page);

		await page.getByLabel('Pronouns').fill('she/her');
		await page.getByRole('button', { name: 'Save profile' }).click();

		await expect(page.getByText('Profile saved.')).toBeVisible({ timeout: AT_ONCE_TIMEOUT_MS });
		await expect(page).toHaveURL('/profile', { timeout: DATABASE_TIMEOUT_MS });
		expect(await sawSpinner(page)).toBe(false);

		await page.goto('/profile/edit');
		await answerWithError(page, 'updatePrivate');
		await page.getByLabel('Phone', { exact: true }).fill('+31 6 1234 5678');
		await page.getByRole('button', { name: 'Save details' }).click();

		await expect(page.getByRole('alert')).toContainText('Your details were not saved.', {
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(page).toHaveURL('/profile/edit');
		await expect(page.getByLabel('Phone', { exact: true })).toHaveValue('+31 6 1234 5678');
	});

	test('saves the private details and says so on the profile', async ({ page }) => {
		const user = await createTestUser();
		await signIn(page, user);

		await page.goto('/profile/edit');

		await page.getByLabel('Date of birth').fill(PRIVATE_DETAILS.dateOfBirth);
		// Exactly "Phone", because "Emergency contact phone" contains that word
		// too and a label is matched on part of its text.
		await page.getByLabel('Phone', { exact: true }).fill(PRIVATE_DETAILS.phone);
		await page.getByLabel('Dietary requirements').fill(PRIVATE_DETAILS.dietaryRequirements);
		await page.getByLabel('Emergency contact name').fill(PRIVATE_DETAILS.emergencyContactName);
		await page.getByLabel('Emergency contact phone').fill(PRIVATE_DETAILS.emergencyContactPhone);
		await page.getByRole('button', { name: 'Save details' }).press('Enter');

		await expect(page).toHaveURL('/profile', { timeout: DATABASE_TIMEOUT_MS });
		await expect(page.getByText('Details saved.')).toBeVisible();

		// They are private, so the block under the lock on the profile is the only
		// place they show up.
		const main = page.getByRole('main');

		await expect(main.getByText(PRIVATE_DETAILS.dateOfBirthOnThePage)).toBeVisible();
		await expect(main.getByText(PRIVATE_DETAILS.phone)).toBeVisible();
		await expect(main.getByText(PRIVATE_DETAILS.dietaryRequirements)).toBeVisible();
		await expect(main.getByText(PRIVATE_DETAILS.emergencyContactName)).toBeVisible();
		await expect(main.getByText(PRIVATE_DETAILS.emergencyContactPhone)).toBeVisible();
	});

	test('blocks a missing name and keeps what else was typed in that form', async ({ page }) => {
		const user = await createTestUser();
		await signIn(page, user);

		await page.goto('/profile/edit');

		// A single space, so the name is empty once it is trimmed. No field on
		// either form carries the HTML `required` attribute, on purpose: the
		// server does the checking, so the wording is ours and reads the same
		// everywhere.
		await page.getByLabel('Full name').fill(' ');
		await page.getByLabel('Institution').fill('Erasmus University');
		await page.getByRole('button', { name: 'Save profile' }).press('Enter');

		await expect(page.getByText('Please enter your name.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(page.getByLabel('Institution')).toHaveValue('Erasmus University');

		// Still on the form, and nothing was saved. Without JavaScript the browser
		// posts to the action's own address, so the page comes back at
		// `/profile/edit?/updatePublic` rather than at `/profile/edit`; with
		// JavaScript the address never changes. Both are this page.
		await expect(page).toHaveURL(/\/profile\/edit/);
	});

	test('blocks a country nobody chose', async ({ page }) => {
		const user = await createTestUser();
		await signIn(page, user);

		await page.goto('/profile/edit');

		// The empty first option of the dropdown, the one that reads "Pick a
		// country". Choosing it again is how somebody unsets a country they have
		// already chosen, and the form has to refuse that.
		await page.getByLabel('Country').selectOption('');
		await page.getByRole('button', { name: 'Save profile' }).press('Enter');

		await expect(page.getByText('Please pick a country.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
	});

	test('blocks an experience level nobody chose', async ({ page }) => {
		const user = await createTestUser();
		await signIn(page, user);

		await page.goto('/profile/edit');

		// The empty first option of the dropdown, the one that reads "Pick your
		// experience level", the same way the country test above unsets a country.
		// An account that finished onboarding always has a level chosen, so this is
		// the only way to reach that message on this page; `tests/e2e/welcome.spec.ts`
		// reaches it on a brand new account, which has none.
		await page.getByLabel('Experience').selectOption('');
		await page.getByRole('button', { name: 'Save profile' }).press('Enter');

		await expect(page.getByText('Please pick your experience level.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
	});

	test('blocks an emergency contact with nobody to ring, and keeps what was typed', async ({
		page
	}) => {
		const user = await createTestUser();
		await signIn(page, user);

		await page.goto('/profile/edit');

		// A name with no number beside it is the one thing this form refuses: a
		// contact an organiser cannot reach is no contact at all.
		await page.getByLabel('Emergency contact name').fill(PRIVATE_DETAILS.emergencyContactName);
		await page.getByLabel('Dietary requirements').fill(PRIVATE_DETAILS.dietaryRequirements);
		await page.getByRole('button', { name: 'Save details' }).press('Enter');

		await expect(
			page.getByText('Please add a phone number for your emergency contact.')
		).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

		await expect(page.getByLabel('Emergency contact name')).toHaveValue(
			PRIVATE_DETAILS.emergencyContactName
		);
		await expect(page.getByLabel('Dietary requirements')).toHaveValue(
			PRIVATE_DETAILS.dietaryRequirements
		);
	});

	test('blocks a date of birth nobody could have', async ({ page }) => {
		const user = await createTestUser();
		await signIn(page, user);

		await page.goto('/profile/edit');

		// Before 1900, which the spec counts as impossible along with a date in
		// the future.
		await page.getByLabel('Date of birth').fill('1823-04-01');
		await page.getByRole('button', { name: 'Save details' }).press('Enter');

		await expect(page.getByText('That date of birth is not possible.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
	});

	test('leaves the other form alone when one of the two fails', async ({ page }) => {
		const user = await createTestUser();

		await givePrivateDetails(user);
		await signIn(page, user);

		await page.goto('/profile/edit');
		await page.getByLabel('Full name').fill(' ');
		await page.getByRole('button', { name: 'Save profile' }).press('Enter');

		await expect(page.getByText('Please enter your name.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		// The private form was not submitted, so it still shows what is saved and
		// carries no message of its own. The failing action says which of the two
		// forms it belongs to, which is what keeps the messages under that one.
		await expect(page.getByLabel('Phone', { exact: true })).toHaveValue(PRIVATE_DETAILS.phone);
		await expect(page.getByLabel('Dietary requirements')).toHaveValue(
			PRIVATE_DETAILS.dietaryRequirements
		);
		await expect(
			page.getByText('Please add a phone number for your emergency contact.')
		).toHaveCount(0);
	});

	// The four tests below are the photo form, the third form on this page.
	//
	// An upload really does land in the `public-media` bucket on this machine,
	// at `avatars/<user id>/<uuid>.jpg`, and nothing clears it before the next
	// `pnpm db:reset`. That is left alone on purpose: every test here makes its
	// own account, so the folder is its own too, and no other test ever reads
	// it. A clean-up would be deleting somebody's object to no end, and the one
	// in the way of a mistake would be somebody else's.

	test('saves a photo on its own and shows it on the profile', async ({ page }) => {
		const user = await createTestUser(PHOTO_TEST_NAME);

		// The other two forms' fields are filled in first, so that saving this one
		// can be seen to leave them exactly as they were. Each of the three writes
		// its own columns and must not touch the others'.
		await givePrivateDetails(user);
		await setProfileColumns(user, { bio: SAMPLE_BIO });
		await signIn(page, user);

		await page.goto('/profile/edit');

		// Nothing has been uploaded yet, so the form shows the initials.
		await expectInitialsAreShown(page, PHOTO_TEST_NAME, PHOTO_TEST_INITIALS);

		// `setInputFiles` puts a file into the file box without one existing on
		// disk. It is the browser doing it rather than a script, which is why this
		// test passes on the `desktop-no-js` project like every other one here.
		await page.getByLabel('Photo').setInputFiles(SMALL_JPEG);
		await page.getByRole('button', { name: 'Save photo' }).press('Enter');

		await expect(page).toHaveURL('/profile', { timeout: DATABASE_TIMEOUT_MS });

		// The flash message first, because the app shell takes it off the screen
		// again after five seconds when JavaScript is on.
		await expect(page.getByText('Photo updated.')).toBeVisible();

		await expectPhotoIsShown(page, PHOTO_TEST_NAME);

		// The public and the private form both still hold what was saved before
		// the picture was.
		const main = page.getByRole('main');

		await expect(main.getByText(SAMPLE_BIO)).toBeVisible();
		await expect(main.getByText(PRIVATE_DETAILS.phone)).toBeVisible();
	});

	test('shows the initials again once the photo is removed', async ({ page }) => {
		const user = await createTestUser(PHOTO_TEST_NAME);
		await signIn(page, user);

		// Uploading one is this test's setup rather than its point: a picture can
		// only reach an account through this form, and the "Remove photo" button is
		// drawn only while there is a picture to take away.
		await page.goto('/profile/edit');
		await page.getByLabel('Photo').setInputFiles(SMALL_JPEG);
		await page.getByRole('button', { name: 'Save photo' }).press('Enter');

		await expect(page).toHaveURL('/profile', { timeout: DATABASE_TIMEOUT_MS });
		await expectPhotoIsShown(page, PHOTO_TEST_NAME);

		await page.goto('/profile/edit');

		// The second button of the same form. `formaction` on it posts to
		// `?/removeAvatar` instead of to the form's own `?/updateAvatar`, so
		// pressing it needs no file in the box.
		await page.getByRole('button', { name: 'Remove photo' }).press('Enter');

		await expect(page).toHaveURL('/profile', { timeout: DATABASE_TIMEOUT_MS });
		await expect(page.getByText('Photo removed.')).toBeVisible();

		await expectInitialsAreShown(page, PHOTO_TEST_NAME, PHOTO_TEST_INITIALS);
	});

	test('refuses a PDF and says which kinds of picture it takes', async ({ page }) => {
		const user = await createTestUser(PHOTO_TEST_NAME);
		await signIn(page, user);

		await page.goto('/profile/edit');

		// The `accept` attribute only tells the file picker which files to offer, so
		// a file of another kind still reaches the server. That is why the server
		// checks the type as well, and why this test can hand the form a PDF.
		await page.getByLabel('Photo').setInputFiles(A_PDF);
		await page.getByRole('button', { name: 'Save photo' }).press('Enter');

		await expect(page.getByText('Please choose a JPEG, PNG or WebP image.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		// The message is tied to the file box itself, which is what a screen reader
		// reads out on reaching that field. The help line comes first in the list
		// because `FileField` always has one: it is where the size limit is said.
		await expect(page.getByLabel('Photo')).toHaveAttribute(
			'aria-describedby',
			'field-avatar-help field-avatar-error'
		);

		// Nothing was saved, so the form still shows the initials.
		await expectInitialsAreShown(page, PHOTO_TEST_NAME, PHOTO_TEST_INITIALS);
	});

	test('refuses a picture larger than five megabytes, and keeps the rest of the page', async ({
		page
	}) => {
		const user = await createTestUser(PHOTO_TEST_NAME);

		await givePrivateDetails(user);
		await signIn(page, user);

		await page.goto('/profile/edit');

		await page.getByLabel('Photo').setInputFiles(OVERSIZED_JPEG);
		await page.getByRole('button', { name: 'Save photo' }).press('Enter');

		await expect(page.getByText('The image must be smaller than 5 MB.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		// "Keeps values on error" means something different for a file box than for
		// a text one: no page may put a file back into a file box, so what has to
		// survive a refused upload is the rest of the page. Both text forms still
		// hold what is saved, and neither has been given a message of its own.
		await expect(page.getByLabel('Full name')).toHaveValue(PHOTO_TEST_NAME);
		await expect(page.getByLabel('Phone', { exact: true })).toHaveValue(PRIVATE_DETAILS.phone);
		await expect(page.getByText('Please enter your name.')).toHaveCount(0);
		await expect(
			page.getByText('Please add a phone number for your emergency contact.')
		).toHaveCount(0);

		// Still on the form, and nothing was saved. Without JavaScript the browser
		// posts to the action's own address, so the page comes back at
		// `/profile/edit?/updateAvatar` rather than at `/profile/edit`; with
		// JavaScript the address never changes. Both are this page.
		await expect(page).toHaveURL(/\/profile\/edit/);
	});

	test('nothing spills off the side of a phone screen', async ({ page }, testInfo) => {
		test.skip(
			testInfo.project.name !== 'phone',
			'Only the phone project has a phone-sized window.'
		);

		await signInWithFullProfile(page);
		await page.goto('/profile/edit');

		// Wait for the form to arrive with the saved values in it, or the page
		// would be measured before the long values this test is about are on it.
		await expect(page.getByLabel('Phone', { exact: true })).toHaveValue(PRIVATE_DETAILS.phone, {
			timeout: DATABASE_TIMEOUT_MS
		});

		await expectNoSidewaysOverflow(page);
	});

	test('fits both forms into a couple of screens', async ({ page }, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop', 'One project is enough to measure a height.');

		await signInWithFullProfile(page);
		await page.goto('/profile/edit');

		await expect(page.getByLabel('Phone', { exact: true })).toHaveValue(PRIVATE_DETAILS.phone, {
			timeout: DATABASE_TIMEOUT_MS
		});

		// Saved before the assertion, so that a failure leaves a picture of the
		// page that failed it.
		await saveFullPageScreenshot(page, 'profile-edit');
		await expectPageFitsInScreens(page, PROFILE_EDIT_SCREENS);
	});
});
