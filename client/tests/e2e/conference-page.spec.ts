import { expect, test, type Locator, type Page } from '@playwright/test';
import { createServiceRoleClient, createVisitorClient } from '../db/supabase-test-client';
import { expectPictureDrawn } from './drawn-picture';
import { saveFullPageScreenshot } from './page-shape';
import { createTestUser, giveApplication, makeConferenceStaff, signIn } from './signed-in-user';
import { MAYA, SAMUEL } from './walkthrough-seed';

// The acceptance criteria of `specs/05-pages/public/conference.md` that need a
// real browser:
//
// * the page says what the conference is called, who runs it, where it is and
//   when it happens;
// * it lists every committee, and a committee card opens that committee's page;
// * a conference with no committees says so instead;
// * the apply panel shows exactly one state, and the right one for the
//   conference's application window: the "Apply as a delegate" button while
//   applications are open, and an application of my own once I have one;
// * an unknown slug is a 404;
// * the browser tab and a shared link carry the conference's name;
// * a draft conference is a 404 for everybody but its own team, who see a
//   preview notice;
// * on a phone the apply bar stays on screen and nothing spills off the side.
//
// The page is public, so all but two of these tests sign nobody in. The top bar
// and the footer repeat some of the words the page uses, so everything about the
// page itself is looked for inside `<main>`.

/**
 * How long an assertion that waits on a page reading the database may take.
 *
 * Longer than the five seconds Playwright waits by default, for the reason
 * `tests/e2e/conferences.spec.ts` gives: every test in the run asks the one
 * local database at once, and an answer has taken up to eight seconds.
 */
const DATABASE_TIMEOUT_MS = 15_000;

/**
 * Amsterdam Open MUN 2027, the conference of `supabase/seed.sql` with the most
 * committees and the one whose application window is open right now.
 *
 * Its name and its slug deliberately disagree, so nothing here may be guessed
 * from the other.
 */
const AMSTERDAM_SLUG = 'amsterdammun-2027';
const AMSTERDAM_NAME = 'Amsterdam Open MUN 2027';

/**
 * Every published conference the three seed files add, by slug and name: the
 * sample conferences of `seed.sql`, the demo's and the walkthrough's. Each has a
 * banner photograph and a logo of its own (T149). The two drafts are left out
 * because a visitor cannot open their pages.
 */
const SEEDED_PUBLISHED_CONFERENCES = [
	{ slug: 'hagueimun-2026', name: 'The Hague International MUN Junior' },
	{ slug: 'bermun-2026', name: 'BERMUN 2026' },
	{ slug: 'brusselsmun-2027', name: 'Brussels European MUN 2027' },
	{ slug: 'hmun-2027', name: 'Harvard Model United Nations 2027' },
	{ slug: 'tokyomun-2027', name: 'Tokyo Global MUN 2027' },
	{ slug: 'amsterdammun-2027', name: 'Amsterdam Open MUN 2027' },
	{ slug: 'viennamun-2027', name: 'Vienna University MUN 2027' },
	{ slug: 'copenhagenmun-2027', name: 'Copenhagen Schools MUN 2027' },
	{ slug: 'madridmun-2027', name: 'Madrid International MUN 2027' },
	{ slug: 'rotterdammun-2026', name: 'Rotterdam Spring MUN 2026' },
	{ slug: 'lisbon-atlantic-mun', name: 'Lisbon Atlantic MUN' },
	{ slug: 'northbridge-opening-soon', name: 'Northbridge MUN (opening soon)' },
	{ slug: 'northbridge-applications-open', name: 'Northbridge MUN (applications open)' },
	{ slug: 'northbridge-about-to-start', name: 'Northbridge MUN (about to start)' },
	{ slug: 'northbridge-running-today', name: 'Northbridge MUN (running today)' }
];

/** The organisation `supabase/seed.sql` puts Amsterdam Open MUN 2027 in. */
const SAMPLE_ORGANIZATION_NAME = 'Sample Europe MUN Network';
const SAMPLE_ORGANIZATION_ID = '10000000-0000-4000-8000-000000000001';

/**
 * Something the apply panel says, wherever the panel happens to be.
 *
 * The panel is a column beside the page on a wide screen and a bar fixed to the
 * bottom on a phone. If the page draws both and hides one, only the one on
 * screen is of any interest, so the hidden copy is filtered out rather than
 * picked by position.
 *
 * `exact` matches the whole line rather than a part of it, which is how
 * "Applications open" is told apart from "Applications open on 3 Nov 2026".
 */
function applyPanelText(page: Page, text: string | RegExp, exact = false): Locator {
	return page.getByRole('main').getByText(text, { exact }).filter({ visible: true }).first();
}

/**
 * A link inside the apply panel, wherever the panel happens to be.
 *
 * The same filtering `applyPanelText` above does, and for the same reason: the
 * page draws the panel twice and hides whichever copy does not belong to the
 * width the browser is at, so only the one on screen is of any interest.
 */
function applyPanelLink(page: Page, name: string): Locator {
	return page.getByRole('main').getByRole('link', { name }).filter({ visible: true });
}

/**
 * The id of a seeded conference, which is how a row in `applications` names it.
 *
 * The visitor client reads it, as `lastDayOf` below does and for the same
 * reason: a visitor is allowed to, and using the service-role client here would
 * prove nothing about the seed being public.
 */
async function conferenceIdOf(conferenceSlug: string): Promise<string> {
	const visitor = createVisitorClient();

	const { data, error } = await visitor
		.from('conferences')
		.select('id')
		.eq('slug', conferenceSlug)
		.single();

	if (error || !data) {
		throw new Error(`Could not read ${conferenceSlug} from the seed: ${error?.message}`);
	}

	return data.id;
}

/** The id of one committee of that conference, named by its slug. */
async function committeeIdOf(conferenceId: string, committeeSlug: string): Promise<string> {
	const visitor = createVisitorClient();

	const { data, error } = await visitor
		.from('committees')
		.select('id')
		.eq('conference_id', conferenceId)
		.eq('slug', committeeSlug)
		.single();

	if (error || !data) {
		throw new Error(`Could not read the ${committeeSlug} committee: ${error?.message}`);
	}

	return data.id;
}

/**
 * The last day of a seeded conference, worded the way the page words it.
 *
 * `supabase/seed.sql` works every date out from `now()` at the moment the
 * database was last reset, so no date can be written down here and the row has
 * to be read. `formatDateRange` in `src/lib/dates.ts` writes whatever the two
 * dates have in common only once, but it always writes the second date in full
 * ("20 Jun 2027"), so that half of the range is what this looks for.
 *
 * The visitor client is the one that reads it, because a visitor is allowed to:
 * using the service-role client here would prove nothing about the seed being
 * public.
 */
async function lastDayOf(conferenceSlug: string): Promise<string> {
	const visitor = createVisitorClient();

	const { data, error } = await visitor
		.from('conferences')
		.select('end_date')
		.eq('slug', conferenceSlug)
		.single();

	if (error || !data) {
		throw new Error(`Could not read ${conferenceSlug} from the seed: ${error?.message}`);
	}

	// The same `Intl` settings `formatDateRange` uses. `timeZone: 'UTC'` keeps a
	// plain `YYYY-MM-DD` on the day it says rather than the day before it.
	const inWords = new Intl.DateTimeFormat('en-GB', {
		timeZone: 'UTC',
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	});

	return inWords.format(new Date(`${data.end_date}T00:00:00Z`));
}

test.describe('the public conference page', () => {
	test('says what the conference is, who runs it, where it is and when', async ({ page }) => {
		await page.goto(`/conferences/${AMSTERDAM_SLUG}`);

		const main = page.getByRole('main');

		await expect(main.getByRole('heading', { level: 1 })).toHaveText(AMSTERDAM_NAME, {
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(main.getByText('Three days of debate on the water.')).toBeVisible();
		await expect(main.getByText(SAMPLE_ORGANIZATION_NAME)).toBeVisible();
		await expect(main.getByText('Amsterdam, Netherlands')).toBeVisible();

		// The dates are on the page more than once: in the hero under the name, and
		// again in the facts list beside it. `first()` asks only that they are there
		// at all, which is what this test is about.
		const lastDay = await lastDayOf(AMSTERDAM_SLUG);
		await expect(main.getByText(lastDay).first()).toBeVisible();

		// The facts column offers a way into the management area, but only to
		// somebody who organises this conference. Nobody is signed in here, so a
		// visitor is offered nothing of the sort.
		await expect(main.getByRole('link', { name: 'Manage this conference' })).toHaveCount(0);
	});

	test('lists every committee, and a card opens that committee', async ({ page }) => {
		await page.goto(`/conferences/${AMSTERDAM_SLUG}`);

		const main = page.getByRole('main');

		await expect(main.getByRole('heading', { name: 'Committees' })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		// The three committees `supabase/seed.sql` gives this conference, one at
		// each level. A card is headed by the committee's short name.
		await expect(main.getByRole('heading', { name: 'UNSC' })).toBeVisible();
		await expect(main.getByRole('heading', { name: 'UNHRC' })).toBeVisible();
		await expect(main.getByRole('heading', { name: 'UNEA' })).toBeVisible();

		// An ordinary link, so it works with scripting switched off as well.
		await main.getByRole('link', { name: 'UNSC' }).click();

		await expect(page).toHaveURL(`/conferences/${AMSTERDAM_SLUG}/committees/security-council`, {
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
			'United Nations Security Council'
		);
	});

	test('tells a visitor when a conference has no committees yet', async ({ page }) => {
		// Copenhagen Schools MUN 2027 is the one published conference in
		// `supabase/seed.sql` with no committees under it: it is published, but its
		// applications have not opened and its organisers have not decided on the
		// committees yet. Every other published conference still to come has them.
		await page.goto('/conferences/copenhagenmun-2027');

		await expect(
			page.getByRole('main').getByText('Committees will be announced soon.')
		).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	});

	test('says applications are open, and when they close', async ({ page }) => {
		await page.goto(`/conferences/${AMSTERDAM_SLUG}`);

		// The badge reads exactly "Applications open", so it is matched in full:
		// "Applications open on 3 Nov 2026" is a different state of the same panel.
		await expect(applyPanelText(page, 'Applications open', true)).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		// "Closes 15 Dec 2026". The seed counts that day from the moment
		// `pnpm db:reset` ran, so only the first word can be checked.
		await expect(applyPanelText(page, /^Closes /)).toBeVisible();

		// The primary action. The page draws the panel twice, once for a phone and
		// once for a wide screen, and hides whichever does not belong to the width
		// the browser is at, so the button is in the page twice with exactly one
		// copy on screen.
		const applyButton = applyPanelLink(page, 'Apply as a delegate');
		await expect(applyButton).toHaveCount(1);

		// "Register a delegation" sits beside it, because the seeded conference
		// takes both routes in. It arrived with T25, which built
		// `/conferences/[slug]/delegations/new`; before that page existed
		// `resolve()` from `$app/paths` refused a link to it and the button could
		// not be written at all. Counted the same way as the apply button, for the
		// same reason: the panel is drawn twice and one copy is hidden.
		const registerButton = applyPanelLink(page, 'Register a delegation');
		await expect(registerButton).toHaveCount(1);

		// Nobody is signed in here, and the last row of the ApplyPanel table in
		// `05-pages/public/conference.md` says both buttons then go to the create
		// account page carrying their own address (T158, built by T176): a
		// visitor with no account is the likely one, and `/register` has a "Log
		// in" link that keeps the address for one who has. Finishing either lands
		// on the page that was asked for.
		//
		// Where each one leads is read by following it rather than by reading its
		// `href`: `resolve()` answers a relative address while a page is being built
		// on the server, so the attribute is `../../register?next=…` on a page that
		// arrived from the server and `/register?next=…` on one the browser built.
		//
		// The delegation button is followed first and the conference page opened
		// again afterwards, because following either one leaves the page both
		// buttons are on.
		await registerButton.click();

		await expect(page).toHaveURL(
			`/register?next=${encodeURIComponent(`/conferences/${AMSTERDAM_SLUG}/delegations/new`)}`,
			{ timeout: DATABASE_TIMEOUT_MS }
		);

		await page.goto(`/conferences/${AMSTERDAM_SLUG}`);
		await applyButton.click();

		await expect(page).toHaveURL(
			`/register?next=${encodeURIComponent(`/conferences/${AMSTERDAM_SLUG}/apply`)}`,
			{ timeout: DATABASE_TIMEOUT_MS }
		);
	});

	test('shows somebody who has applied their status, and the way back to it', async ({ page }) => {
		// A brand-new account, so that the three Playwright projects cannot each
		// take the other's application: `applications` holds one row per person per
		// conference, and every project runs this test at the same time against the
		// one local database.
		const applicant = await createTestUser('Noor Haddad');
		const conferenceId = await conferenceIdOf(AMSTERDAM_SLUG);
		const securityCouncilId = await committeeIdOf(conferenceId, 'security-council');

		// A real submitted application: `validate_application` fires for the
		// service-role client too, and Amsterdam Open MUN 2027 asks for committee
		// preferences and a motivation, so a row without them would be refused.
		const applicationId = await giveApplication(applicant, {
			conferenceId,
			status: 'submitted',
			committeePreferences: [securityCouncilId],
			motivation: 'I have chaired twice and would like a seat on the Security Council.'
		});

		try {
			await signIn(page, applicant);
			await page.goto(`/conferences/${AMSTERDAM_SLUG}`);

			// The badge is the application's own status in the words `$lib/status.ts`
			// gives it, so `submitted` reads "Under review" rather than "Submitted".
			await expect(applyPanelText(page, 'Under review', true)).toBeVisible({
				timeout: DATABASE_TIMEOUT_MS
			});

			// And the way in is the application, not the form: somebody who has
			// applied is not offered the chance to apply again.
			await expect(page.getByRole('main').getByText('Apply as a delegate')).toHaveCount(0);

			const viewLink = applyPanelLink(page, 'View your application');
			await expect(viewLink).toHaveCount(1);

			await viewLink.click();

			await expect(page).toHaveURL(`/applications/${applicationId}`, {
				timeout: DATABASE_TIMEOUT_MS
			});
		} finally {
			// The row is on a conference from `supabase/seed.sql` that every other
			// test reads, and nothing else clears it before the next `pnpm db:reset`.
			await createServiceRoleClient().from('applications').delete().eq('id', applicationId);
		}
	});

	test('has a line for every other state of the application window', async ({ page }) => {
		// Copenhagen's window opens in 45 days.
		await page.goto('/conferences/copenhagenmun-2027');
		await expect(applyPanelText(page, /^Applications open on /)).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		// Madrid's shut a fortnight ago, and the conference itself is still to come.
		await page.goto('/conferences/madridmun-2027');
		await expect(applyPanelText(page, /^Applications closed on /)).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		// Rotterdam finished six months ago. A conference that is over says so and
		// nothing else, whatever its application window said.
		await page.goto('/conferences/rotterdammun-2026');
		await expect(applyPanelText(page, 'This conference has ended.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(page.getByRole('main').getByText(/^Closes /)).toHaveCount(0);
	});

	test('answers a slug that belongs to no conference with a 404', async ({ page }) => {
		const response = await page.goto('/conferences/atlantis-underwater-mun-2027');

		expect(response?.status()).toBe(404);
	});

	test('names the conference in the browser tab and in a shared link', async ({ page }) => {
		await page.goto(`/conferences/${AMSTERDAM_SLUG}`);

		await expect(page).toHaveTitle(`${AMSTERDAM_NAME} · MUNMeet`);

		// A `<meta>` tag has no role and no label, so this is the one place the page
		// is read by its markup rather than by what a visitor can see.
		//
		// The picture is a whole web address, because the sites that unfurl a shared
		// link cannot follow a path. Amsterdam Open MUN 2027, like every conference in
		// `supabase/seed.sql`, has a banner of its own, and the file behind it is in
		// the `public-media` bucket, so the picture here is that banner rather than
		// the site's `og-default.jpg` fallback.
		//
		// `publicMediaUrl` in `src/lib/media.ts` builds
		// `<PUBLIC_SUPABASE_URL>/storage/v1/object/public/public-media/<path>`. Only
		// the end of that is written down here, because the front of it is whatever
		// `PUBLIC_SUPABASE_URL` says on the machine serving the app: a local address
		// here and a hosted one anywhere else. The storage path and the banner's own
		// path cannot change without the migration or the seed changing, and the
		// fallback ends in `og-default.jpg` instead, so the end is enough to tell
		// the two apart.
		const bannerPath =
			'conferences/20000000-0000-4000-8000-000000000009/banner-40000000-0000-4000-8000-000000000009.jpg';
		const shareImage = page.locator('meta[property="og:image"]');

		await expect(shareImage).toHaveAttribute('content', /^https?:\/\//, {
			timeout: DATABASE_TIMEOUT_MS
		});

		// The tag is in the HTML the server sent, so by now it is there to be read
		// and nothing will change it.
		const shareImageUrl = await shareImage.getAttribute('content');
		expect(shareImageUrl).toContain(`/storage/v1/object/public/public-media/${bannerPath}`);
	});

	test('shows every seeded conference with its photograph and its logo', async ({ page }) => {
		// Fifteen pages in one test, which is longer than Playwright allows one test
		// by default.
		test.slow();

		for (const conference of SEEDED_PUBLISHED_CONFERENCES) {
			await page.goto(`/conferences/${conference.slug}`);

			await expect(page.getByRole('heading', { level: 1, name: conference.name })).toBeVisible({
				timeout: DATABASE_TIMEOUT_MS
			});

			// The banner is named after the conference, and so is the initials box
			// a conference without one shows, so `expectPictureDrawn` checks it is a
			// real picture. The logo box is only there at all when there is a logo.
			const main = page.getByRole('main');
			await expectPictureDrawn(main.getByRole('img', { name: conference.name, exact: true }));
			await expectPictureDrawn(main.getByRole('img', { name: `${conference.name} logo` }));
		}
	});

	test('hides a draft from visitors and previews it for its own team', async ({ page }) => {
		// This test makes a conference of its own rather than using the seed's
		// draft, because it has to put somebody on the team of one and then take
		// that conference away again. A draft is in no public list, so it disturbs
		// nothing while it exists.
		//
		// The service-role client creates it: `conferences` has no insert policy
		// that would let a test account make one inside somebody else's
		// organisation, and what a real organiser may create is
		// `tests/db/conferences-access.test.ts`'s job.
		const admin = createServiceRoleClient();
		const slug = `e2e-draft-${crypto.randomUUID()}`;

		const { data: draft, error } = await admin
			.from('conferences')
			.insert({
				name: 'Preview Only MUN',
				slug,
				city: 'Utrecht',
				country_code: 'NL',
				// Dated 2020 for the reason `tests/db/conference-fixtures.ts` gives: a
				// throwaway conference with future dates can turn up in the directory,
				// and `tests/e2e/conferences.spec.ts` counts what is listed there.
				start_date: '2020-03-01',
				end_date: '2020-03-03',
				status: 'draft',
				organization_id: SAMPLE_ORGANIZATION_ID
			})
			.select('id')
			.single();

		if (error || !draft) {
			throw new Error(`Could not create the draft conference: ${error?.message}`);
		}

		try {
			const asAVisitor = await page.goto(`/conferences/${slug}`);
			expect(asAVisitor?.status()).toBe(404);

			const organiser = await createTestUser('Priya Nair');
			await makeConferenceStaff(organiser, draft.id, 'organiser');
			await signIn(page, organiser);

			await page.goto(`/conferences/${slug}`);

			const main = page.getByRole('main');

			await expect(main.getByRole('heading', { level: 1 })).toHaveText('Preview Only MUN', {
				timeout: DATABASE_TIMEOUT_MS
			});
			// "Draft preview. Only your team can see this page." The full stop after
			// the first two words may belong to the notice's heading or to the
			// sentence under it, so only the words themselves are matched.
			await expect(main.getByText(/Draft preview/)).toBeVisible();

			// The notice carries a link into the management area. `exact` matches
			// the whole name rather than a part of it, which matters twice over
			// here: the top bar has a "Manage" link of its own, and the facts column
			// below has one whose name starts with the same word.
			const noticeLink = main.getByRole('link', { name: 'Manage', exact: true });
			await expect(noticeLink).toBeVisible();

			// The facts column has the second way in. The page draws that column
			// twice, once for a phone and once for a wide screen, and hides
			// whichever does not belong to the width the browser is at, so the link
			// is in the page twice with exactly one copy on screen.
			const factsLink = main
				.getByRole('link', { name: 'Manage this conference' })
				.filter({ visible: true });
			await expect(factsLink).toHaveCount(1);

			// The preview is the one state of this page nothing else pictures, and it
			// is the state its own team sees, so a picture of it is saved before
			// anybody follows a link away from it.
			await saveFullPageScreenshot(page, 'conference-draft-preview');

			// And the notice's link really goes there. A draft has no dashboard, so
			// the management area sends it on into the creation flow (Trello
			// fe3reN7Y), at the step it reached. This row never says which, so it is
			// at the first, Basics, whose name field holds the conference's name.
			await noticeLink.click();

			await expect(page).toHaveURL(`/create/${slug}/basics`, {
				timeout: DATABASE_TIMEOUT_MS
			});
			await expect(page.getByRole('main').getByLabel('Conference name')).toHaveValue(
				'Preview Only MUN',
				{ timeout: DATABASE_TIMEOUT_MS }
			);
		} finally {
			// The row outlives this test, and a conference nobody deletes is one more
			// thing for the next person to wonder about. `conference_staff` goes with
			// it, because its conference_id cascades.
			await admin.from('conferences').delete().eq('id', draft.id);
		}
	});

	test('tells staff, and nobody else, that the description is still missing', async ({ page }) => {
		// A conference of the seed's own always has a description, so this test
		// makes one without any, the same way the draft-preview test above makes
		// its own conference rather than reusing the seed's.
		const admin = createServiceRoleClient();
		const slug = `e2e-no-description-${crypto.randomUUID()}`;

		const { data: conference, error } = await admin
			.from('conferences')
			.insert({
				name: 'No Description MUN',
				slug,
				city: 'Utrecht',
				country_code: 'NL',
				// 2020, for the reason the draft-preview test's own comment gives: a
				// throwaway conference with future dates would turn up in the public
				// directory and change what `tests/e2e/conferences.spec.ts` counts there.
				start_date: '2020-03-01',
				end_date: '2020-03-03',
				status: 'published',
				organization_id: SAMPLE_ORGANIZATION_ID
			})
			.select('id')
			.single();

		if (error || !conference) {
			throw new Error(`Could not create the conference with no description: ${error?.message}`);
		}

		try {
			// A visitor sees no About section at all: the line is a nudge for the
			// team, not something to tell the public.
			const asAVisitor = await page.goto(`/conferences/${slug}`);
			expect(asAVisitor?.status()).toBe(200);
			await expect(
				page.getByRole('main').getByText('The organisers have not written a description yet.')
			).toHaveCount(0);

			const organiser = await createTestUser('Amara Okafor');
			await makeConferenceStaff(organiser, conference.id, 'organiser');
			await signIn(page, organiser);
			await page.goto(`/conferences/${slug}`);

			await expect(
				page.getByRole('main').getByText('The organisers have not written a description yet.')
			).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		} finally {
			// `conference_staff` cascades with the conference, the same as the
			// draft-preview test's cleanup above.
			await admin.from('conferences').delete().eq('id', conference.id);
		}
	});

	test('keeps the apply bar on screen on a phone, and nothing spills off the side', async ({
		page
	}, testInfo) => {
		test.skip(
			testInfo.project.name !== 'phone',
			'Only the phone project has a phone-sized window.'
		);

		await page.goto(`/conferences/${AMSTERDAM_SLUG}`);

		const applyBar = applyPanelText(page, 'Applications open', true);
		await expect(applyBar).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

		// A bar fixed to the bottom of the screen stays where it is while the page
		// moves behind it, so it is on screen at the end of the page as well as at
		// the top of it. `window.scrollTo` needs scripting, which the phone project
		// has; only the `desktop-no-js` project switches it off, and this test does
		// not run there.
		await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

		await expect(applyBar).toBeVisible();

		// How much wider the page is than the window. Anything above zero means
		// something is pushing the page sideways.
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);

		expect(overflow).toBeLessThanOrEqual(1);
	});
});

// T176: "Announcements" beside "Full schedule" on the Programme section, for a
// participant or a member of staff only (`05-pages/public/conference.md`,
// "Streamlining"). The walkthrough seed's "about to start" conference shows its
// programme publicly, seats Maya in its Human Rights Council and has Samuel
// chair it.
test.describe('the Programme section’s "Announcements" link', () => {
	const ABOUT_TO_START_PATH = '/conferences/northbridge-about-to-start';

	/** The Programme section, which `Section` names after its title. */
	function programme(page: Page): Locator {
		return page.getByRole('main').getByRole('region', { name: 'Programme', exact: true });
	}

	/** Open the page and wait for its programme, which comes from the database. */
	async function openProgramme(page: Page): Promise<Locator> {
		await page.goto(ABOUT_TO_START_PATH);

		const section = programme(page);
		await expect(section.getByRole('link', { name: 'Full schedule' })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		return section;
	}

	test('is not there for a visitor or an account with no part in the conference', async ({
		page
	}) => {
		const visitorSection = await openProgramme(page);
		await expect(visitorSection.getByRole('link', { name: 'Announcements' })).toHaveCount(0);

		await signIn(page, await createTestUser('Daniel Perez'));

		const strangerSection = await openProgramme(page);
		await expect(strangerSection.getByRole('link', { name: 'Announcements' })).toHaveCount(0);
	});

	test('takes a seated delegate and a chair to the announcements', async ({ page }) => {
		for (const reader of [MAYA, SAMUEL]) {
			await page.context().clearCookies();
			await signIn(page, reader);

			// Pressed with the keyboard rather than clicked: on a phone Playwright
			// scrolls the link just far enough to be on screen, which can leave it
			// under the apply bar fixed to the bottom, and a click there lands on
			// the bar. A person scrolls a little further; the keyboard needs neither.
			const section = await openProgramme(page);
			await section.getByRole('link', { name: 'Announcements' }).press('Enter');

			await expect(page).toHaveURL(`${ABOUT_TO_START_PATH}/announcements`, {
				timeout: DATABASE_TIMEOUT_MS
			});
		}
	});
});
