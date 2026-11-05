import { expect, test, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	expectReachableAboveFooter,
	expectScrollsAtMost,
	OWNER_VIEWPORT,
	saveOwnerScreenshot
} from './creation-screen';
import {
	createDraftConferenceFor,
	createReturningOrganisationFor,
	giveConferenceABanner
} from './draft-conference';
import { expectNoSidewaysOverflow, saveFullPageScreenshot } from './page-shape';
import { createTestUser, signIn, type TestUser } from './signed-in-user';

// The Launch step of creating a conference, `/create/<slug>/launch` (Trello
// fe3reN7Y): the readiness table, the choice between publishing alone and
// publishing with applications open, and what the public page shows after.
//
// The draft is written straight into the database rather than walked through
// the four steps before it, which have their own specs. The seeding helpers
// are copied from `create-organisation.spec.ts` on purpose: each creation spec
// keeps its own, so no spec's fixtures change under another.
//
// The tests publish conferences in April 2027, which would sit on the
// directory's first page for good and crowd other specs' conferences off it,
// so `afterEach` deletes the conferences each test made. The accounts and
// organisations stay until the next `pnpm db:reset`; nobody lists them.

/** How long a page that reads the database may take; see `conferences.spec.ts`. */
const DATABASE_TIMEOUT_MS = 15_000;

/** The organisations the test running now made, whose conferences `afterEach` deletes. */
let organisationsToClear: string[] = [];

test.beforeEach(() => {
	organisationsToClear = [];
});

test.afterEach(async () => {
	if (organisationsToClear.length === 0) return;

	// A conference's committees, questions and fees go with it: their foreign
	// keys cascade.
	const { error } = await createServiceRoleClient()
		.from('conferences')
		.delete()
		.in('organization_id', organisationsToClear);

	if (error) {
		throw new Error(`Could not delete the test's conferences: ${error.message}`);
	}
});

/** What a test may change about the seeded draft. */
type DraftOverrides = {
	prefill_sources?: Record<string, string>;
	application_open_mode?: 'manual' | 'on_publish' | 'scheduled';
	hasCommittee?: boolean;
};

/** The seeded draft: its slug, its name, and the organisation that owns it. */
type SeededDraft = { slug: string; name: string };

/**
 * Make `user` the owner of a new organisation in Delft with one draft at the
 * Launch step: Friday 16 to Sunday 18 April 2027, in Delft, venue to be
 * announced, fees undecided, applications opened by hand and closing two
 * weeks before. The service-role client only arranges the starting state.
 */
async function seedDraftAtLaunch(
	user: TestUser,
	overrides: DraftOverrides = {}
): Promise<SeededDraft> {
	const admin = createServiceRoleClient();
	const suffix = crypto.randomUUID().slice(0, 8);
	const organizationName = `Delft MUN ${suffix}`;

	// `created_by` makes the account the organisation's owner, by trigger.
	const { data: organization, error: organizationError } = await admin
		.from('organizations')
		.insert({
			name: organizationName,
			slug: `delft-mun-${suffix}`,
			created_by: user.id,
			city: 'Delft',
			country_code: 'NL'
		})
		.select('id')
		.single();

	if (organizationError || !organization) {
		throw new Error(`Could not seed the organisation: ${organizationError?.message}`);
	}
	organisationsToClear.push(organization.id);

	const name = `${organizationName} 2027`;
	const slug = `delft-mun-${suffix}-2027`;
	const { data: draft, error: draftError } = await admin
		.from('conferences')
		.insert({
			name,
			slug,
			city: 'Delft',
			country_code: 'NL',
			start_date: '2027-04-16',
			end_date: '2027-04-18',
			timezone: 'Europe/Amsterdam',
			status: 'draft',
			organization_id: organization.id,
			created_by: user.id,
			venue_status: 'tba',
			fee_status: 'undecided',
			application_open_mode: overrides.application_open_mode ?? 'manual',
			application_close_rule: 'relative',
			application_close_offset_days: -14,
			applications_close_at: '2027-04-02T21:59:00Z',
			creation_step: 'launch',
			prefill_sources: overrides.prefill_sources ?? { start_date: 'user' }
		})
		.select('id')
		.single();

	if (draftError || !draft) {
		throw new Error(`Could not seed the draft: ${draftError?.message}`);
	}

	if (overrides.hasCommittee) {
		const { error } = await admin
			.from('committees')
			.insert({ conference_id: draft.id, name: 'Security Council', slug: 'security-council' });

		if (error) {
			throw new Error(`Could not seed the committee: ${error.message}`);
		}
	}

	return { slug, name };
}

/** Sign in as a new account that owns a seeded draft, and open its Launch step. */
async function openLaunch(page: Page, overrides: DraftOverrides = {}): Promise<SeededDraft> {
	const user = await createTestUser();
	const draft = await seedDraftAtLaunch(user, overrides);

	await signIn(page, user);
	await page.goto(`/create/${draft.slug}/launch`);
	await expect(page.getByRole('heading', { name: 'Ready to launch', exact: true })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	return draft;
}

/** The readiness table's row for one part of the conference. */
function readinessRow(page: Page, label: string) {
	return page.locator('main li').filter({ has: page.getByText(label, { exact: true }) });
}

test('publishes the conference alone, leaving applications closed', async ({ page }) => {
	const draft = await openLaunch(page);

	await expect(readinessRow(page, 'Venue')).toContainText('To be announced');
	await expect(readinessRow(page, 'Venue')).toContainText('Ready');
	await expect(readinessRow(page, 'Fees')).toContainText('Optional');
	await expect(readinessRow(page, 'Committees')).toContainText('Optional');
	await expect(page.getByLabel(/Publish and open applications/)).toBeVisible();

	await page.getByLabel(/Publish conference only/).check();
	await page.getByRole('button', { name: 'Publish conference' }).click();
	await page.waitForURL(`**/manage/${draft.slug}`, { timeout: DATABASE_TIMEOUT_MS });

	// The full management area, not the creation steps: its sidebar (a strip
	// of tabs on a phone, where it may be scrolled out of view) links to the
	// conference's applications. Without JavaScript SvelteKit writes links as
	// relative paths, so only the end of the address is matched. Then the flash.
	await expect(page.locator(`a[href$="manage/${draft.slug}/applications"]`).first()).toBeAttached();
	await expect(page.getByText(`${draft.name} is now public.`)).toBeVisible();

	// A signed-out visitor sees the venue still to be announced and
	// applications not open. The facts are written twice, for the wide and the
	// narrow layout, so only the copy on show is looked at. The public page has
	// no fees line yet; "Fees to be announced" is printed on the apply page.
	await page.context().clearCookies();
	await page.goto(`/conferences/${draft.slug}`);
	const main = page.locator('main');
	await expect(main.getByRole('heading', { name: draft.name })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(
		main.getByText('Venue to be announced').filter({ visible: true }).first()
	).toBeVisible();
	await expect(main.getByText('Applications open', { exact: true })).toHaveCount(0);
});

test('publishes and opens applications in one go', async ({ page, javaScriptEnabled }) => {
	// The launch choice is a shadcn radio group, which only changes with JavaScript.
	test.skip(!javaScriptEnabled, 'The launch choice needs JavaScript.');
	const draft = await openLaunch(page, { hasCommittee: true });

	await page.getByLabel(/Publish and open applications/).check();
	await page.getByRole('button', { name: 'Publish conference' }).click();
	await page.waitForURL(`**/manage/${draft.slug}`, { timeout: DATABASE_TIMEOUT_MS });
	await expect(
		page.getByText(`${draft.name} is now public and taking applications.`)
	).toBeVisible();

	await page.context().clearCookies();
	await page.goto(`/conferences/${draft.slug}`);
	await expect(
		page
			.locator('main')
			.getByText('Applications open', { exact: true })
			.filter({ visible: true })
			.first()
	).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
});

test('holds back a draft on placeholder dates', async ({ page }) => {
	await openLaunch(page, { prefill_sources: { start_date: 'system_default' } });

	await expect(readinessRow(page, 'Dates & location')).toContainText('Needed');
	await expect(page.getByRole('button', { name: 'Publish conference' })).toBeDisabled();
});

test('offers one way to launch when applications open on publishing', async ({ page }) => {
	await openLaunch(page, { application_open_mode: 'on_publish' });

	await expect(page.getByRole('radio')).toHaveCount(1);
	await expect(page.getByText(/Publishing will also open applications/)).toBeVisible();
});

// The `phone` project runs this at 390px wide, the desktop ones at 1280px.
test('fits the screen', async ({ page }) => {
	await openLaunch(page);

	await expectNoSidewaysOverflow(page);
	await saveFullPageScreenshot(page, 'create-launch');
});

// The mockup's Launch screen: an organisation coming back with last year's
// conference (three committees to import), a banner photograph, no
// description yet, venue and fees still open. On the product owner's window,
// 1265 by 634, it may run a little past the bottom, because the mockup cuts
// the applicants' facts off at the foot of the board and here they are drawn
// whole; but every one of them can be scrolled clear of the footer.
test("fits the product owner's screen with only a little scrolling", async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'The owner works on a desktop.');
	await page.setViewportSize(OWNER_VIEWPORT);
	const user = await createTestUser();
	const organisation = await createReturningOrganisationFor(user, { hasPictures: true });
	organisationsToClear.push(organisation.id);

	const draft = await createDraftConferenceFor(user, {
		name: 'Delft MUN 2027',
		organizationId: organisation.id,
		startDate: '2027-04-16',
		endDate: '2027-04-18',
		columns: {
			creation_step: 'launch',
			level: 'university',
			venue_status: 'tba',
			fee_status: 'undecided',
			application_open_mode: 'manual',
			application_close_rule: 'relative',
			application_close_offset_days: -14,
			applications_close_at: '2027-04-02T21:59:00Z'
		}
	});
	// The new edition shows last year's photograph. The Organisation step
	// copies it into the draft's own folder, the only place a banner may be,
	// so the same photograph goes there.
	await giveConferenceABanner(draft.id);

	await signIn(page, user);
	await page.goto(`/create/${draft.slug}/launch`);
	await expect(page.getByRole('heading', { name: 'Ready to launch', exact: true })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(readinessRow(page, 'Committees')).toContainText(
		'3 available to import, not required to publish'
	);
	await expect(page.getByRole('link', { name: 'Import committees' })).toBeVisible();

	// Kept first, so that a step that does not fit still leaves its picture.
	await saveOwnerScreenshot(page, 'create-launch');
	// The 32 design pixels the mockup cuts off, at the owner's scale, and a little slack.
	await expectScrollsAtMost(page, 40);
	// The last of the three facts in "What applicants will see", a `<dt>`.
	await expectReachableAboveFooter(page, page.locator('dt', { hasText: /^Fees$/ }));
});
