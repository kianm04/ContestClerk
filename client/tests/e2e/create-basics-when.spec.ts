import { expect, test, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { expectFitsOwnerScreen, OWNER_VIEWPORT, saveOwnerScreenshot } from './creation-screen';
import { createReturningOrganisationFor } from './draft-conference';
import { expectNoSidewaysOverflow, saveFullPageScreenshot } from './page-shape';
import { createTestUser, signIn, type TestUser } from './signed-in-user';

// Steps 2 and 3 of creating a conference (Trello fe3reN7Y): Basics, and When &
// where. A returning organisation starts from its last conference; a new one
// from only its name and home. The seeding helpers are copied from
// `create-organisation.spec.ts` so each spec stands on its own.
//
// Everything made here stays in the database until the next `pnpm db:reset`,
// which is safe: the seeded conference is dated in the past, and a draft is
// never public.

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
		.select('slug, name, creation_step, prefill_sources, start_date, end_date, timezone')
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
		start_date: string;
		end_date: string;
		timezone: string;
	};
}

/** Sign in as the owner of a seeded organisation and start its draft, landing on Basics. */
async function startReturningDraft(page: Page): Promise<SeededOrganization> {
	const user = await createTestUser();
	const organization = await seedOrganizationWithConference(user);

	await signIn(page, user);
	await page.goto(`/create?organization=${organization.id}`);
	await page.getByRole('button', { name: 'Continue to basics' }).click();
	await page.waitForURL(/\/create\/[^/]+\/basics$/, { timeout: DATABASE_TIMEOUT_MS });

	return organization;
}

/**
 * Pick a day in a date dropdown of When & where: press the button named
 * `label`, page the calendar forward to the month of `isoDate` ("2027-06-04")
 * and press that day.
 */
async function pickDate(page: Page, label: string, isoDate: string) {
	await page.getByLabel(label, { exact: true }).click();
	const calendar = page.locator('[data-slot="popover-content"]');
	const day = calendar.locator(
		`[data-bits-day][data-value="${isoDate}"]:not([data-outside-month])`
	);
	for (let month = 0; month < 24 && !(await day.isVisible()); month++) {
		await calendar.getByRole('button', { name: 'Next' }).click();
	}
	await day.click();
	// The calendar closes before the next one may open.
	await expect(calendar).toHaveCount(0);
}

/** Press the footer's Continue and wait for the next step. */
async function continueTo(page: Page, label: string, step: string) {
	await page.getByRole('button', { name: label }).click();
	await page.waitForURL(new RegExp(`/create/[^/]+/${step}$`), { timeout: DATABASE_TIMEOUT_MS });
}

test('a returning organisation edits the basics and takes the suggested dates', async ({
	page
}, testInfo) => {
	test.skip(
		testInfo.project.use.javaScriptEnabled === false,
		'Saving while typing needs JavaScript; the next test walks the steps without it.'
	);
	const organization = await startReturningDraft(page);
	const main = page.locator('main');
	const nameField = page.getByLabel('Conference name');

	await expect(nameField).toHaveValue(`${organization.name} 2027`);
	await expect(main.getByText('Generated name')).toBeVisible();
	await expect(page.getByLabel('Tagline')).toHaveValue('Diplomacy on the Schie');

	// Typing saves by itself; the name is then the organiser's own.
	await nameField.fill(`${organization.name} 2027: Tides`);
	await expect(main.getByText('Generated name')).toHaveCount(0, { timeout: DATABASE_TIMEOUT_MS });
	await expect(main.getByText('Draft saved')).toBeVisible();
	await page.reload();
	await expect(nameField).toHaveValue(`${organization.name} 2027: Tides`);

	await continueTo(page, 'Continue to when & where', 'when');
	await expect(main.getByText(`Suggested from ${organization.conferenceName}`)).toBeVisible();
	await expect(page.locator('input[name="timezone"]')).toHaveValue('Europe/Amsterdam');

	// Other dates first, so taking the suggestion visibly changes them back.
	await pickDate(page, 'Start date', '2027-06-04');
	await pickDate(page, 'End date', '2027-06-06');
	await expect(page.locator('aside').getByText(/4\s*–\s*6 Jun 2027/)).toBeVisible();
	await page.getByRole('button', { name: 'Use these dates' }).click();
	await expect(page.locator('input[name="startDate"]')).toHaveValue('2027-04-16', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.locator('input[name="endDate"]')).toHaveValue('2027-04-18');
	await expect(page.locator('aside').getByText(/16\s*–\s*18 Apr 2027/)).toBeVisible();

	// The radio itself is hidden behind its label, which is what a person presses.
	await page.locator('main').getByText('Online', { exact: true }).click();
	await expect(page.getByLabel('Online', { exact: true })).toBeChecked();
	await expect(page.getByLabel('City')).toHaveCount(0);
	await expect(page.locator('aside').getByText('Online', { exact: true })).toBeVisible();

	await continueTo(page, 'Continue to setup', 'setup');
	const draft = await readDraft(organization.id);
	expect(draft).toMatchObject({ start_date: '2027-04-16', creation_step: 'setup' });
	expect(draft.prefill_sources.start_date).toBe('previous_conference');
});

test('a new organisation picks its first dates, and the name gains the year', async ({
	page
}, testInfo) => {
	test.skip(
		testInfo.project.use.javaScriptEnabled === false,
		'The dates are picked in a calendar, which needs JavaScript.'
	);
	const user = await createTestUser();
	const name = `Leiden MUN ${crypto.randomUUID().slice(0, 8)}`;

	await signIn(page, user);
	await page.goto('/create');
	await page.getByLabel('Organisation name').fill(name);
	await page.getByLabel('Home city').fill('Leiden');
	// Home country is shadcn's Select: open it, then pick the option.
	await page.getByLabel('Home country').click();
	await page.getByRole('option', { name: 'Netherlands', exact: true }).click();
	await continueTo(page, 'Continue to basics', 'basics');

	const aside = page.locator('aside');
	await expect(page.getByLabel('Conference name')).toHaveValue(name);
	await expect(page.locator('main').getByText('Generated name')).toBeVisible();
	await expect(aside.getByText('Dates to be announced')).toBeVisible();
	// The draft starts in the organisation's home town.
	await expect(aside.getByText('Leiden, Netherlands')).toBeVisible();

	await continueTo(page, 'Continue to when & where', 'when');
	await expect(page.locator('input[name="startDate"]')).toHaveValue('');
	await expect(page.locator('input[name="endDate"]')).toHaveValue('');

	await pickDate(page, 'Start date', '2027-05-07');
	await pickDate(page, 'End date', '2027-05-09');
	await continueTo(page, 'Continue to setup', 'setup');

	const admin = createServiceRoleClient();
	const { data: organization } = await admin
		.from('organizations')
		.select('id')
		.eq('name', name)
		.single();
	const draft = await readDraft(organization!.id);
	expect(draft).toMatchObject({ name: `${name} 2027`, start_date: '2027-05-07' });
	expect(draft.prefill_sources.name).not.toBe('user');
	expect(draft.prefill_sources.start_date).toBe('user');
});

test('both steps fit a phone, and look right on a desktop', async ({ page }) => {
	await startReturningDraft(page);
	await expect(page.getByLabel('Conference name')).toBeVisible();
	await saveFullPageScreenshot(page, 'create-basics');

	await continueTo(page, 'Continue to when & where', 'when');
	await expect(page.getByText('Use these dates')).toBeVisible();
	await saveFullPageScreenshot(page, 'create-when');

	await page.setViewportSize({ width: 390, height: 844 });
	await expectNoSidewaysOverflow(page);
	await page.goBack();
	await expect(page.getByLabel('Conference name')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expectNoSidewaysOverflow(page);
});

/** The mockup's description: about 40 words, the most the Basics step has to fit. */
const MOCKUP_DESCRIPTION =
	'Delft MUN 2027 is the annual Model United Nations conference hosted by TU Delft. Join ' +
	'delegates from around the world for three days of debate, diplomacy and ideas. Through ' +
	'meaningful discussion and international cooperation, we empower the next generation of ' +
	'global leaders.';

test("Basics fits the product owner's screen without scrolling", async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'The owner works on a desktop.');
	const user = await createTestUser();
	// A real crest and banner, so the picture can be held beside the mockup.
	const organisation = await createReturningOrganisationFor(user, { hasPictures: true });

	await signIn(page, user);
	await page.goto(`/create?organization=${organisation.id}`);
	await continueTo(page, 'Continue to basics', 'basics');
	await page.setViewportSize(OWNER_VIEWPORT);
	await page.getByLabel('Description').fill(MOCKUP_DESCRIPTION);
	await expect(page.locator('main').getByText('Draft saved')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// Kept first, so that a step that does not fit still leaves its picture.
	await saveOwnerScreenshot(page, 'create-basics');
	await expectFitsOwnerScreen(page);
});

test("When & where fits the product owner's screen without scrolling", async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'The owner works on a desktop.');
	const user = await createTestUser();
	// A real crest and banner, so the picture can be held beside the mockup.
	const organisation = await createReturningOrganisationFor(user, { hasPictures: true });

	await signIn(page, user);
	await page.goto(`/create?organization=${organisation.id}`);
	await continueTo(page, 'Continue to basics', 'basics');
	await continueTo(page, 'Continue to when & where', 'when');
	await page.setViewportSize(OWNER_VIEWPORT);
	await expect(page.getByRole('button', { name: 'Use these dates' })).toBeVisible();

	// Kept first, so that a step that does not fit still leaves its picture.
	await saveOwnerScreenshot(page, 'create-when');
	await expectFitsOwnerScreen(page);
});
