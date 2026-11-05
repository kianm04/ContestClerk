import { expect, test, type Locator, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { createTestUser, signIn, type TestUser } from './signed-in-user';

// The acceptance criteria of `specs/05-pages/public/organization.md` that need a
// real browser:
//
// * the page lists the conferences this organisation runs, split into upcoming
//   and past, and never shows a draft one;
// * an organisation that has run nothing yet has no "Past conferences" section
//   at all, rather than an empty one;
// * the browser tab carries the organisation's name;
// * the website link opens the address the organisation gave, and an
//   organisation that gave none has no link at all;
// * a slug that belongs to no organisation is a 404;
// * a past conference row opens that conference's own page;
// * the conference page's organisation name is a link back to here;
// * on a phone nothing spills off the side.
//
// The page is public, so none of these tests signs anybody in. The top bar and
// the footer repeat some of the words the page uses, so everything about the
// page itself is looked for inside `<main>`.
//
// The last block is the "Edit organisation" button, which T23 could finally
// build: it points at `/manage/organizations/[slug]`, and `resolve()` refuses
// an address whose folder is not under `src/routes/`, so until that page
// existed the button could not be written. It is the one thing on this public
// page that depends on who is reading it.

/**
 * How long an assertion that waits on a page reading the database may take.
 *
 * Longer than the five seconds Playwright waits by default, for the reason
 * `tests/e2e/conferences.spec.ts` gives: every test in the run asks the one
 * local database at once, and an answer has taken up to eight seconds.
 */
const DATABASE_TIMEOUT_MS = 15_000;

/**
 * Sample Europe MUN Network, the organisation in `supabase/seed.sql` that runs
 * both a conference still to come and one that is over.
 *
 * Its name and its slug deliberately disagree, so nothing here may be guessed
 * from the other.
 */
const EUROPE_SLUG = 'sample-europe-mun-network';
const EUROPE_NAME = 'Sample Europe MUN Network';

/**
 * The address `supabase/seed.sql` gives Sample Europe MUN Network.
 *
 * It is the only seeded organisation with one, on purpose: Sample Global MUN
 * Circle is left without so that the "no website" half of the page is sample
 * data as well.
 */
const EUROPE_WEBSITE_URL = 'https://sample-europe-mun.example';

/** Sample Global MUN Circle, the organisation whose conferences are all still to come. */
const GLOBAL_SLUG = 'sample-global-mun-circle';
const GLOBAL_NAME = 'Sample Global MUN Circle';

/**
 * Sample First-Year MUN Society, whose only conference is a draft.
 *
 * Row Level Security keeps a draft out of a visitor's results, so this is the
 * organisation whose page shows the empty state, and the edge case
 * `05-pages/public/organization.md` names.
 */
const FIRST_YEAR_SLUG = 'sample-first-year-mun-society';
const FIRST_YEAR_NAME = 'Sample First-Year MUN Society';
const FIRST_YEAR_DRAFT_NAME = 'First-Year MUN 2027 (not public)';

/** The one conference in the seed that has finished. Sample Europe MUN Network ran it. */
const PAST_CONFERENCE_SLUG = 'rotterdammun-2026';
const PAST_CONFERENCE_NAME = 'Rotterdam Spring MUN 2026';

/** One of Sample Europe MUN Network's conferences that is still to come. */
const UPCOMING_CONFERENCE_NAME = 'The Hague International MUN Junior';

/**
 * The seed's draft conference, which belongs to Sample Europe MUN Network.
 *
 * Row Level Security keeps a draft out of a visitor's results, so its name must
 * not be anywhere on this page.
 */
const DRAFT_CONFERENCE_NAME = 'Draft Conference (not public)';

/** The conference page these tests follow the organisation link from. */
const AMSTERDAM_SLUG = 'amsterdammun-2027';

/**
 * One of the page's two lists of conferences, picked by its heading.
 *
 * `Section.svelte` draws a `<section aria-label="...">`, and a `<section>` with
 * a name counts as a `region`, which is how one list can be told from the other
 * without naming a single CSS class.
 */
function conferenceSection(page: Page, heading: string): Locator {
	return page.getByRole('main').getByRole('region', { name: heading });
}

test.describe('the public organisation page', () => {
	test('splits the conferences it runs into upcoming and past, and hides a draft', async ({
		page
	}) => {
		await page.goto(`/organizations/${EUROPE_SLUG}`);

		const main = page.getByRole('main');

		await expect(main.getByRole('heading', { level: 1 })).toHaveText(EUROPE_NAME, {
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(
			main.getByText('A made-up organization that runs the sample conferences in Europe.')
		).toBeVisible();

		// Both lists are on the page, because this organisation has something to
		// put in each of them.
		await expect(main.getByRole('heading', { name: 'Upcoming conferences' })).toBeVisible();
		await expect(main.getByRole('heading', { name: 'Past conferences' })).toBeVisible();

		const upcoming = conferenceSection(page, 'Upcoming conferences');
		const past = conferenceSection(page, 'Past conferences');

		// A conference still to come is a card, headed by its name; one that is
		// over is a quieter row, which is a link and nothing else.
		await expect(upcoming.getByRole('heading', { name: UPCOMING_CONFERENCE_NAME })).toBeVisible();
		await expect(past.getByRole('link', { name: PAST_CONFERENCE_NAME })).toBeVisible();

		// The conference that has finished belongs to one list only. Without this
		// the page would still pass with both lists showing everything.
		await expect(upcoming.getByText(PAST_CONFERENCE_NAME)).toHaveCount(0);
		await expect(past.getByText(UPCOMING_CONFERENCE_NAME)).toHaveCount(0);

		// The draft is in neither list, and nowhere else on the page either.
		await expect(main.getByText(DRAFT_CONFERENCE_NAME)).toHaveCount(0);
	});

	test("links to the organisation's own website", async ({ page }) => {
		await page.goto(`/organizations/${EUROPE_SLUG}`);

		const websiteLink = page.getByRole('main').getByRole('link', { name: 'Website' });

		await expect(websiteLink).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

		// The address is read from the markup rather than followed: it belongs to
		// somebody else, and `.example` is a name the internet keeps free on
		// purpose, so there is nothing at the other end to open. `rel="external"`
		// is what tells SvelteKit this is not one of our own pages, so it has to
		// be on the link as well as the address being right.
		await expect(websiteLink).toHaveAttribute('href', EUROPE_WEBSITE_URL);
		await expect(websiteLink).toHaveAttribute('rel', 'external');
	});

	test('shows no website link for an organisation that gave no address', async ({ page }) => {
		await page.goto(`/organizations/${GLOBAL_SLUG}`);

		const main = page.getByRole('main');

		await expect(main.getByRole('heading', { level: 1 })).toHaveText(GLOBAL_NAME, {
			timeout: DATABASE_TIMEOUT_MS
		});

		// Half of the meta line disappears rather than showing an empty link.
		await expect(main.getByRole('link', { name: 'Website' })).toHaveCount(0);
	});

	test('names the organisation in the browser tab', async ({ page }) => {
		await page.goto(`/organizations/${EUROPE_SLUG}`);

		await expect(page).toHaveTitle(`${EUROPE_NAME} · MUNMeet`);
	});

	test('leaves the past section out for an organisation that has run nothing yet', async ({
		page
	}) => {
		await page.goto(`/organizations/${GLOBAL_SLUG}`);

		const main = page.getByRole('main');

		await expect(main.getByRole('heading', { level: 1 })).toHaveText(GLOBAL_NAME, {
			timeout: DATABASE_TIMEOUT_MS
		});

		// The section is left out rather than shown empty, so the heading and the
		// region it names are both absent.
		await expect(main.getByRole('heading', { name: 'Past conferences' })).toHaveCount(0);
		await expect(conferenceSection(page, 'Past conferences')).toHaveCount(0);

		// Its two conferences, both still to come, are listed all the same.
		const upcoming = conferenceSection(page, 'Upcoming conferences');

		await expect(
			upcoming.getByRole('heading', { name: 'Harvard Model United Nations 2027' })
		).toBeVisible();
		await expect(upcoming.getByRole('heading', { name: 'Tokyo Global MUN 2027' })).toBeVisible();
	});

	test('shows the empty state to a visitor when every conference is still a draft', async ({
		page
	}) => {
		await page.goto(`/organizations/${FIRST_YEAR_SLUG}`);

		const main = page.getByRole('main');

		await expect(main.getByRole('heading', { level: 1 })).toHaveText(FIRST_YEAR_NAME, {
			timeout: DATABASE_TIMEOUT_MS
		});

		// The organisation is busy setting a conference up, but a visitor may not
		// see a draft, so the page says there is nothing rather than naming it.
		await expect(main.getByText('No upcoming conferences.')).toBeVisible();
		await expect(main.getByText(FIRST_YEAR_DRAFT_NAME)).toHaveCount(0);

		// There is no history either, so that section is left out altogether.
		await expect(main.getByRole('heading', { name: 'Past conferences' })).toHaveCount(0);
	});

	test('answers a slug that belongs to no organisation with a 404', async ({ page }) => {
		const response = await page.goto('/organizations/no-such-organisation');

		expect(response?.status()).toBe(404);

		// The words `+page.server.ts` passes to `error(404, ...)`. The app has no
		// error page of its own yet, so SvelteKit's own one shows the message
		// inside the ordinary shell.
		await expect(page.getByRole('main').getByText('This organisation does not exist.')).toBeVisible(
			{
				timeout: DATABASE_TIMEOUT_MS
			}
		);
	});

	test('opens a past conference from its row', async ({ page }) => {
		await page.goto(`/organizations/${EUROPE_SLUG}`);

		const past = conferenceSection(page, 'Past conferences');

		// An ordinary link, so it works with scripting switched off as well.
		await expect(past.getByRole('link', { name: PAST_CONFERENCE_NAME })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await past.getByRole('link', { name: PAST_CONFERENCE_NAME }).click();

		await expect(page).toHaveURL(`/conferences/${PAST_CONFERENCE_SLUG}`, {
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
			PAST_CONFERENCE_NAME
		);
	});

	test('is where the conference page sends a visitor who asks who runs it', async ({ page }) => {
		await page.goto(`/conferences/${AMSTERDAM_SLUG}`);

		const organizationLink = page.getByRole('main').getByRole('link', { name: EUROPE_NAME });

		await expect(organizationLink).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await organizationLink.click();

		await expect(page).toHaveURL(`/organizations/${EUROPE_SLUG}`, {
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(EUROPE_NAME);
	});

	test('fits a phone screen without spilling off the side', async ({ page }, testInfo) => {
		test.skip(
			testInfo.project.name !== 'phone',
			'Only the phone project has a phone-sized window.'
		);

		await page.goto(`/organizations/${EUROPE_SLUG}`);

		await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
			EUROPE_NAME,
			{
				timeout: DATABASE_TIMEOUT_MS
			}
		);

		// How much wider the page is than the window. Anything above zero means
		// something is pushing the page sideways. `page.evaluate` needs scripting,
		// which the phone project has; only the `desktop-no-js` project switches it
		// off, and this test does not run there.
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);

		expect(overflow).toBeLessThanOrEqual(1);
	});
});

// ---------------------------------------------------------------------------
// The one thing on this page that depends on who is reading it
// ---------------------------------------------------------------------------
// `load` asks the database's own `is_organization_admin` for `data.isAdmin`, so
// the button the page draws and the change that page would allow can never
// disagree. Which memberships the helper counts as admin is
// `tests/db/organizations.test.ts`; this is about what the page does with the
// answer.

/**
 * An organisation this account owns, made the way the "create a conference"
 * flow would leave it: the `add_organization_creator_as_owner` trigger turns
 * `created_by` into the owner row.
 *
 * Its own organisation rather than a seeded one, because the seeded
 * organisations are what every other test on this page counts, and putting a
 * member on one of those would change what they see.
 */
async function createOrganizationOwnedBy(
	owner: TestUser
): Promise<{ id: string; name: string; slug: string }> {
	const admin = createServiceRoleClient();
	const name = `Edit Button MUN ${crypto.randomUUID().slice(0, 8)}`;
	const slug = `edit-button-mun-${crypto.randomUUID().slice(0, 8)}`;

	const { data, error } = await admin
		.from('organizations')
		.insert({ name, slug, created_by: owner.id })
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not create the test organisation: ${error?.message}`);
	}

	return { id: data.id, name, slug };
}

/** Put somebody in an organisation, the way accepting an invitation would. */
async function addOrganizationMember(
	organizationId: string,
	userId: string,
	role: 'admin' | 'member'
): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('organization_members')
		.insert({ organization_id: organizationId, user_id: userId, role });

	if (error) {
		throw new Error(`Could not add the test member: ${error.message}`);
	}
}

test.describe('the Edit organisation button', () => {
	test('is missing for a visitor who is not signed in', async ({ page }) => {
		await page.goto(`/organizations/${EUROPE_SLUG}`);

		await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
			EUROPE_NAME,
			{ timeout: DATABASE_TIMEOUT_MS }
		);

		await expect(page.getByRole('link', { name: 'Edit organisation' })).toHaveCount(0);
	});

	test('is missing for a signed-in reader who belongs to no organisation', async ({ page }) => {
		const stranger = await createTestUser('Tomas Novak');

		await signIn(page, stranger);
		await page.goto(`/organizations/${EUROPE_SLUG}`);

		await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
			EUROPE_NAME,
			{ timeout: DATABASE_TIMEOUT_MS }
		);

		await expect(page.getByRole('link', { name: 'Edit organisation' })).toHaveCount(0);
	});

	test('takes an owner to the settings page of that organisation', async ({ page }) => {
		const owner = await createTestUser('Priya Nair');
		const organization = await createOrganizationOwnedBy(owner);

		await signIn(page, owner);
		await page.goto(`/organizations/${organization.slug}`);

		// The address is matched at the end rather than in full, because
		// `resolve()` from `$app/paths` answers a *relative* address while a page
		// is being built on the server, so without JavaScript the attribute reads
		// `./manage/organizations/<slug>`.
		const link = page.getByRole('main').getByRole('link', { name: 'Edit organisation' });

		await expect(link).toHaveAttribute(
			'href',
			new RegExp(`manage/organizations/${organization.slug}$`),
			{ timeout: DATABASE_TIMEOUT_MS }
		);

		await link.click();

		await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
			organization.name,
			{ timeout: DATABASE_TIMEOUT_MS }
		);
	});

	test('is there for an admin as well as for an owner', async ({ page }) => {
		const owner = await createTestUser('Priya Nair');
		const organization = await createOrganizationOwnedBy(owner);
		const admin = await createTestUser('Aiko Tanaka');

		await addOrganizationMember(organization.id, admin.id, 'admin');
		await signIn(page, admin);
		await page.goto(`/organizations/${organization.slug}`);

		await expect(
			page.getByRole('main').getByRole('link', { name: 'Edit organisation' })
		).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	});

	test('is missing for a plain member, who may read it and change nothing', async ({ page }) => {
		const owner = await createTestUser('Priya Nair');
		const organization = await createOrganizationOwnedBy(owner);
		const member = await createTestUser('Noor Haddad');

		await addOrganizationMember(organization.id, member.id, 'member');
		await signIn(page, member);
		await page.goto(`/organizations/${organization.slug}`);

		await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
			organization.name,
			{ timeout: DATABASE_TIMEOUT_MS }
		);

		await expect(page.getByRole('link', { name: 'Edit organisation' })).toHaveCount(0);
	});
});
