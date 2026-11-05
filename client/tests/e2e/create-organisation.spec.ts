import { expect, test, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { expectFitsOwnerScreen, OWNER_VIEWPORT, saveOwnerScreenshot } from './creation-screen';
import { createReturningOrganisationFor } from './draft-conference';
import { expectNoSidewaysOverflow, saveFullPageScreenshot } from './page-shape';
import { createTestUser, signIn, type TestUser } from './signed-in-user';

// The Organisation step of creating a conference, `/create` (Trello fe3reN7Y):
// choosing who runs it, the suggestion built from the organisation's previous
// conference, and the draft "Continue to basics" makes. The steps after it
// have their own specs.
//
// Everything made here stays in the database until the next `pnpm db:reset`,
// which is safe: the seeded conference is dated in the past, so the directory's
// upcoming list never shows it, and a draft is never public.

/** How long a page that reads the database may take; see `conferences.spec.ts`. */
const DATABASE_TIMEOUT_MS = 15_000;

/** An organisation with one published conference in April 2026, in Delft. */
type SeededOrganization = { id: string; name: string; conferenceName: string };

/**
 * Make `user` the owner of an organisation whose last conference ran Friday 17
 * to Sunday 19 April 2026 in Delft, with a committee, a fee and a question. The
 * service-role client arranges the state the test starts in; it never proves
 * that anything is allowed.
 */
async function seedOrganizationWithConference(user: TestUser): Promise<SeededOrganization> {
	const admin = createServiceRoleClient();
	const suffix = crypto.randomUUID().slice(0, 8);
	const name = `Delft MUN ${suffix}`;

	// `created_by` makes the account the organisation's owner, by trigger.
	const { data: organization, error: organizationError } = await admin
		.from('organizations')
		.insert({
			name,
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

	const conferenceName = `${name} 2026`;
	const { data: conference, error: conferenceError } = await admin
		.from('conferences')
		.insert({
			name: conferenceName,
			slug: `delft-mun-${suffix}-2026`,
			tagline: 'Diplomacy on the Schie',
			description: 'Three days of debate in Delft.',
			city: 'Delft',
			country_code: 'NL',
			start_date: '2026-04-17',
			end_date: '2026-04-19',
			timezone: 'Europe/Amsterdam',
			status: 'published',
			organization_id: organization.id,
			created_by: user.id
		})
		.select('id')
		.single();

	if (conferenceError || !conference) {
		throw new Error(`Could not seed the conference: ${conferenceError?.message}`);
	}

	const inserts = await Promise.all([
		admin
			.from('committees')
			.insert({ conference_id: conference.id, name: 'Security Council', slug: 'security-council' }),
		admin.from('fees').insert({
			conference_id: conference.id,
			name: 'Delegate fee',
			amount_cents: 4500,
			applies_to: 'individual',
			position: 0
		}),
		admin
			.from('application_questions')
			.insert({ conference_id: conference.id, label: 'Why MUN?', type: 'short_text' })
	]);

	for (const { error } of inserts) {
		if (error) {
			throw new Error(`Could not seed the conference's setup: ${error.message}`);
		}
	}

	return { id: organization.id, name, conferenceName };
}

/** The draft an organisation has, as the database holds it. */
async function readDraft(organizationId: string) {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('conferences')
		.select('slug, name, creation_step, prefill_sources')
		.eq('organization_id', organizationId)
		.eq('status', 'draft')
		.single();

	if (error || !data) {
		throw new Error(`Could not read the draft: ${error?.message}`);
	}

	return data as {
		slug: string;
		name: string;
		creation_step: string;
		prefill_sources: Record<string, string>;
	};
}

/** Sign in as a new account that owns the seeded organisation, and choose it on `/create`. */
async function openWithOrganization(page: Page): Promise<SeededOrganization> {
	const user = await createTestUser();
	const organization = await seedOrganizationWithConference(user);

	await signIn(page, user);
	await page.goto('/create');
	await page.getByRole('link', { name: new RegExp(organization.name) }).click();
	await expect(page).toHaveURL(new RegExp(`organization=${organization.id}`), {
		timeout: DATABASE_TIMEOUT_MS
	});

	return organization;
}

test('suggests the next edition of the previous conference and starts the draft from it', async ({
	page
}) => {
	const organization = await openWithOrganization(page);
	const main = page.locator('main');
	const suggestion = main.getByRole('heading', { name: 'We found your previous conference' });

	await expect(suggestion).toBeVisible();
	await expect(main.getByText(organization.conferenceName, { exact: true })).toBeVisible();
	// The same weekdays a year on: Friday 16 to Sunday 18 April 2027.
	await expect(main.getByText(`${organization.name} 2027`).first()).toBeVisible();
	await expect(main.getByText(/16\s*–\s*18 Apr 2027/).first()).toBeVisible();
	await expect(main.getByText('Delft, Netherlands').first()).toBeVisible();
	await expect(main.getByText('Generated name').first()).toBeVisible();
	await expect(main.getByText('Suggested dates').first()).toBeVisible();

	await page.getByRole('button', { name: 'Continue to basics' }).click();
	await page.waitForURL(/\/create\/[^/]+\/basics$/, { timeout: DATABASE_TIMEOUT_MS });

	const draft = await readDraft(organization.id);
	expect(new URL(page.url()).pathname).toBe(`/create/${draft.slug}/basics`);
	expect(draft.name).toBe(`${organization.name} 2027`);
	expect(draft.creation_step).toBe('basics');
	expect(draft.prefill_sources.name).toBe('previous_conference');
});

test('starts a new organisation with only its name and home', async ({
	page,
	javaScriptEnabled
}) => {
	// The home country is a shadcn dropdown, which only opens with JavaScript.
	test.skip(!javaScriptEnabled, 'The country dropdown needs JavaScript.');
	const user = await createTestUser();
	const name = `Leiden MUN ${crypto.randomUUID().slice(0, 8)}`;

	await signIn(page, user);
	await page.goto('/create');
	// An account without an organisation has only one choice, already made.
	await page.getByLabel('Organisation name').fill(name);
	await page.getByLabel('Home city').fill('Leiden');
	// Home country is shadcn's Select: open it, then pick the option.
	await page.getByLabel('Home country').click();
	await page.getByRole('option', { name: 'Netherlands', exact: true }).click();
	// The preview beside the form follows what was typed, before anything is sent.
	const preview = page.locator('aside');
	await expect(preview.getByText(name).first()).toBeVisible();
	await expect(preview.getByText('Leiden, Netherlands')).toBeVisible();
	await page.getByRole('button', { name: 'Continue to basics' }).click();
	await page.waitForURL(/\/create\/[^/]+\/basics$/, { timeout: DATABASE_TIMEOUT_MS });

	const admin = createServiceRoleClient();
	const { data: organization } = await admin
		.from('organizations')
		.select('id, city, country_code')
		.eq('name', name)
		.single();

	expect(organization).toMatchObject({ city: 'Leiden', country_code: 'NL' });
	const draft = await readDraft(organization!.id);
	expect(draft.prefill_sources.start_date).toBe('system_default');
});

test('fits the screen, with the suggestion showing', async ({ page }) => {
	await openWithOrganization(page);
	await expect(
		page.getByRole('heading', { name: 'We found your previous conference' })
	).toBeVisible();

	await expectNoSidewaysOverflow(page);
	await saveFullPageScreenshot(page, 'create-organisation');
});

test("fits the product owner's screen without scrolling", async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'The owner works on a desktop.');
	await page.setViewportSize(OWNER_VIEWPORT);
	const user = await createTestUser();
	// A real crest and banner, so the picture can be held beside the mockup.
	const organisation = await createReturningOrganisationFor(user, { hasPictures: true });

	await signIn(page, user);
	await page.goto(`/create?organization=${organisation.id}`);
	await expect(
		page.getByRole('heading', { name: 'We found your previous conference' })
	).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	// Kept first, so that a step that does not fit still leaves its picture.
	await saveOwnerScreenshot(page, 'create-organisation');
	await expectFitsOwnerScreen(page);
});
