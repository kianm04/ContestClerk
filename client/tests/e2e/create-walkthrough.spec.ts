import { expect, test, type Locator, type Page } from '@playwright/test';
import { suggestNextEditionDates } from '../../src/lib/suggested-dates';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { ClickBudgetJourney } from './click-budget';
import {
	createReturningOrganisationFor,
	deleteConferencesOf,
	type TestReturningOrganisation
} from './draft-conference';
import { expectScrollsAtMost, OWNER_VIEWPORT, saveOwnerScreenshot } from './creation-screen';
import { expectNoSidewaysOverflow } from './page-shape';
import { createTestUser, signIn } from './signed-in-user';

// The two journeys the product owner asked to be walked before the creation
// flow (Trello fe3reN7Y) is done, from `/create` to a published conference,
// through the real pages and nothing else:
//
// A. an organisation coming back for its next edition, which inherits almost
//    everything and should be done in a minute or two, within 14 clicks;
// B. a brand-new organisation, which leaves several things to be announced
//    and still reaches Launch without inventing anything;
// C. leaving a draft half-way and finding it again from `/manage`.
//
// Each step's own spec (`create-*.spec.ts`) tests the step in detail. These
// only check that the steps join up, and that there is never a dead end: an
// error on the way fails the test rather than being worked around.
//
// Both journeys publish an upcoming conference, which would sit on the
// directory's first page for good; `afterEach` deletes what they made.

/** How long a page that reads the database may take; see `conferences.spec.ts`. */
const DATABASE_TIMEOUT_MS = 15_000;

/** The most clicks journey A may take, from `/create` to the published conference. */
const RETURNING_CLICK_BUDGET = 14;

/** The organisations made by the test running now, deleted with their conferences after it. */
let organisationsToDelete: string[] = [];

test.beforeEach(() => {
	// Each journey walks five steps that write to the database, while the rest
	// of the suite is asking the one local database at once.
	test.slow();
	organisationsToDelete = [];
});

test.afterEach(async () => {
	for (const organizationId of organisationsToDelete) {
		await deleteConferencesOf(organizationId);
	}
});

/** Wait for the creation step `step` of some draft, and answer the draft's slug. */
async function expectStep(page: Page, step: string): Promise<string> {
	await page.waitForURL(new RegExp(`/create/[^/]+/${step}$`), { timeout: DATABASE_TIMEOUT_MS });

	return new URL(page.url()).pathname.split('/')[2];
}

/** The open dialog: shadcn gives it `role="dialog"`. */
function dialog(page: Page): Locator {
	return page.getByRole('dialog');
}

/** The Launch step's row for one part of the conference. */
function readinessRow(page: Page, label: string): Locator {
	// `main ul > li` leaves out the step indicator, an `<ol>` that names the steps too.
	return page.locator('main ul > li').filter({ has: page.getByText(label, { exact: true }) });
}

/** The sticky footer's one primary button, by its words. */
function footerButton(page: Page, label: string): Locator {
	return page.getByRole('button', { name: label });
}

/**
 * On a phone, what every step must keep: nothing wider than the screen, and
 * the footer's primary button in view without scrolling to the end.
 */
/**
 * What a shadcn control posts: a date button, a time or country dropdown and
 * the timezone combobox each keep their value in a hidden input named after
 * the field, because the control itself is a button with no value.
 */
function postedValue(page: Page, name: string): Locator {
	return page.locator(`input[name="${name}"]`);
}

/** Picks a day in the shadcn calendar behind the date button named `label`. */
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

/** Chooses an option in a shadcn dropdown, which a native `selectOption` cannot reach. */
async function chooseOption(page: Page, label: string, option: string) {
	await page.getByLabel(label, { exact: true }).click();
	await page.getByRole('option', { name: option, exact: true }).click();
}

async function expectFitsPhone(page: Page, isPhone: boolean, primaryLabel: string) {
	if (!isPhone) return;

	await expectNoSidewaysOverflow(page);
	// A phone browser that meets something too wide lays the whole page out
	// wider than the screen and shows part of it, which the check above cannot
	// see: the page then fits its (wider) window exactly. The sticky footer is
	// pinned to that wider window's bottom edge, below the screen. So the
	// layout must be exactly as wide as the phone.
	const screenWidth = page.viewportSize()?.width;
	expect(await page.evaluate(() => window.innerWidth)).toBe(screenWidth);
	await expect(footerButton(page, primaryLabel)).toBeInViewport();
}

/**
 * The next background save of the step's form. The footer says "Draft saved"
 * from the start, so the test waits for the save itself instead.
 */
function nextAutosave(page: Page) {
	return page.waitForResponse(
		(response) => response.url().includes('/save') && response.request().method() === 'POST',
		{ timeout: DATABASE_TIMEOUT_MS }
	);
}

/** Nothing on the page says something went wrong. */
async function expectNoError(page: Page) {
	await expect(page.locator('main [aria-invalid="true"]')).toHaveCount(0);
	await expect(page.getByText('Could not save')).toHaveCount(0);
}

test('A: a returning organisation publishes its next edition within the click budget', async ({
	page
}, testInfo) => {
	test.skip(
		testInfo.project.use.javaScriptEnabled === false,
		'The Setup dialogs and imports answer in place; the steps without JavaScript have their own specs.'
	);
	const isPhone = testInfo.project.name === 'phone';
	const user = await createTestUser();
	const organisation: TestReturningOrganisation = await createReturningOrganisationFor(user);
	organisationsToDelete.push(organisation.id);
	const suggested = suggestNextEditionDates('2026-04-17', '2026-04-19')!;
	const main = page.locator('main');
	const aside = page.locator('aside');

	await signIn(page, user);
	await page.goto('/create');
	const journey = ClickBudgetJourney.fromPage(page);

	// 1. Organisation: the card, then the suggested next edition.
	await journey.click(page.getByRole('link', { name: new RegExp(organisation.name) }));
	await expect(
		main.getByRole('heading', { name: 'We found your previous conference' })
	).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(main.getByText('Delft MUN 2027').first()).toBeVisible();
	await expect(main.getByText(/16\s*–\s*18 Apr 2027/).first()).toBeVisible();
	expect(new Date(`${suggested.startDate}T12:00:00Z`).getUTCDay()).toBe(5);
	await expectFitsPhone(page, isPhone, 'Continue to basics');
	await journey.click(page.getByRole('button', { name: 'Use this setup' }));
	const slug = await expectStep(page, 'basics');

	// 2. Basics: the next edition's name, last year's words a year on, the
	// organisation's branding and last year's contact address.
	await expect(page.getByLabel('Conference name')).toHaveValue('Delft MUN 2027');
	await expect(main.getByText('Generated name')).toBeVisible();
	await expect(page.getByLabel('Tagline')).toHaveValue('Delft MUN 2027: diplomacy on the Schie');
	await expect(page.getByLabel('Description')).toHaveValue(
		'Three days of debate in Delft in April 2027.'
	);
	// The caption is now the logo's description rather than a line of its own, as the mockup draws it.
	await expect(main.getByAltText(`Using ${organisation.name} branding`).first()).toBeVisible();
	await expect(page.getByLabel('Contact email')).toHaveValue('secretariat@delftmun.example');
	await expectNoError(page);
	await expectFitsPhone(page, isPhone, 'Continue to when & where');
	await journey.click(footerButton(page, 'Continue to when & where'));
	await expectStep(page, 'when');

	// 3. When & where: last year's weekdays a year on, and last year's hours.
	await expect(main.getByText('Suggested from Delft MUN 2026')).toBeVisible();
	await expectFitsPhone(page, isPhone, 'Continue to setup');
	await journey.click(page.getByRole('button', { name: 'Use these dates' }));
	await expect(postedValue(page, 'startDate')).toHaveValue(suggested.startDate, {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(postedValue(page, 'endDate')).toHaveValue(suggested.endDate);
	await expect(postedValue(page, 'startTime')).toHaveValue('10:00');
	await expect(postedValue(page, 'endTime')).toHaveValue('17:00');
	await expect(postedValue(page, 'timezone')).toHaveValue('Europe/Amsterdam');
	await expect(page.getByLabel('City')).toHaveValue('Delft');
	await expect(aside.getByText(/16\s*–\s*18 Apr 2027/)).toBeVisible();
	await expectNoError(page);
	await journey.click(footerButton(page, 'Continue to setup'));
	await expectStep(page, 'setup');

	// 4. Setup: last year's committees, form and fee, one button each.
	const committees = page.locator('#committees');
	const progress = page.getByRole('region', { name: 'Setup progress' });
	// The panel names what there is to bring over, as the mockup words it; its
	// state is in "Setup progress".
	await expect(committees.getByText(/^3 committees found in /)).toBeVisible();
	await expect(progress.getByText('Not yet imported')).toBeVisible();
	await journey.click(committees.getByRole('button', { name: "Use last year's committees" }));
	await expect(progress.getByText('Not yet imported')).toHaveCount(0, {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(committees.getByRole('row')).toHaveCount(4, { timeout: DATABASE_TIMEOUT_MS });
	for (const seats of ['15', '20', '12']) {
		await expect(committees.getByRole('cell', { name: seats, exact: true })).toBeVisible();
	}
	await expect(committees.getByText('Unassigned')).toHaveCount(3);

	const applications = page.locator('#applications');
	await journey.click(applications.getByRole('link', { name: 'Edit settings' }).first());
	await journey.click(dialog(page).getByRole('button', { name: "Use last year's form" }));
	await expect(dialog(page).getByText('Why MUN?')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	// The closing choice is a shadcn dropdown; its value sits in a hidden input.
	await expect(dialog(page).locator('input[name="closeChoice"]')).toHaveValue('-14');
	await journey.click(dialog(page).getByRole('link', { name: 'Close' }));
	await expect(dialog(page)).toBeHidden();
	await expect(applications.getByText('Why MUN?')).toBeVisible();
	await expect(applications.getByText(/2 weeks before/)).toBeVisible();

	const fees = page.locator('#fees');
	await expect(fees.getByText('Last year: €35')).toBeVisible();
	await journey.click(fees.getByRole('button', { name: "Use last year's fee" }));
	await expect(fees.getByText('€35.00')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(fees.getByRole('radio', { name: /Paid/ })).toBeChecked();
	await expectNoError(page);
	await expectFitsPhone(page, isPhone, 'Continue to launch');
	await journey.click(footerButton(page, 'Continue to launch'));
	await expectStep(page, 'launch');

	// 5. Launch: nothing holds it back.
	for (const label of ['Basics', 'Dates & location', 'Venue', 'Committees', 'Applications']) {
		await expect(readinessRow(page, label)).toContainText('Ready');
	}
	await expect(main.getByText('Needed', { exact: true })).toHaveCount(0);
	await expectFitsPhone(page, isPhone, 'Publish conference');
	await journey.click(page.getByText('Publish and open applications'));
	await journey.click(footerButton(page, 'Publish conference'));
	await page.waitForURL(`**/manage/${slug}`, { timeout: DATABASE_TIMEOUT_MS });

	// The management area takes over, with its whole sidebar, and says so.
	await expect(
		page.getByText('Delft MUN 2027 is now public and taking applications.')
	).toBeVisible();
	for (const section of ['applications', 'delegations', 'allocation', 'schedule']) {
		await expect(page.locator(`a[href$="manage/${slug}/${section}"]`).first()).toBeAttached();
	}

	const count = journey.count();
	testInfo.annotations.push({
		type: 'clicks',
		description: `${count.clicks} clicks, ${count.pages} pages, ${count.typedFields} typed fields`
	});
	expect(count.typedFields, 'nothing had to be typed').toBe(0);
	expect(count.clicks).toBeLessThanOrEqual(RETURNING_CLICK_BUDGET);

	// The fee is printed in the apply page's summary, which asks a visitor to
	// sign in first, so it is read while still signed in. That summary is a
	// laptop-only sidebar, so a phone has nothing to read here.
	const shown = (text: string | RegExp) => main.getByText(text).filter({ visible: true }).first();
	if (!isPhone) {
		await page.goto(`/conferences/${slug}/apply`);
		await expect(shown('€35.00')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	}

	// What a visitor who is not signed in sees.
	await page.context().clearCookies();
	await page.goto(`/conferences/${slug}`);
	await expect(main.getByRole('heading', { name: 'Delft MUN 2027', level: 1 })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(shown('Delft, Netherlands')).toBeVisible();
	await expect(shown(/16\s*–\s*18 Apr(il)? 2027/)).toBeVisible();
	await expect(shown('Venue to be announced')).toBeVisible();
	await expect(shown('10:00 – 17:00 each day')).toBeVisible();
	for (const committee of [
		'Security Council',
		'World Health Organization',
		'Human Rights Council'
	]) {
		await expect(shown(committee)).toBeVisible();
	}
	await expect(shown(/^Applications open/)).toBeVisible();
});

/** Start a brand-new organisation's draft as journey B does, and answer its slug. */
async function startNewOrganisation(page: Page, name: string): Promise<string> {
	await page.goto('/create');
	// An account without an organisation has only one choice, already made.
	await expect(page.locator('a[aria-current="true"]')).toContainText('New organisation');
	await page.getByLabel('Organisation name').fill(name);
	await page.getByLabel('Home city').fill('Leiden');
	await chooseOption(page, 'Home country', 'Netherlands');
	await page.getByRole('button', { name: 'Continue to basics' }).click();

	return expectStep(page, 'basics');
}

/** The id of the organisation called `name`, for the clean-up. */
async function organisationIdNamed(name: string): Promise<string> {
	const admin = createServiceRoleClient();
	const { data } = await admin.from('organizations').select('id').eq('name', name).single();

	return data!.id;
}

test('B: a brand-new organisation publishes with several things to be announced', async ({
	page
}, testInfo) => {
	test.skip(
		testInfo.project.use.javaScriptEnabled === false,
		'Picking a committee from the catalogue needs JavaScript; Setup without it has its own spec.'
	);
	const user = await createTestUser();
	const name = `Riverside MUN Society ${crypto.randomUUID().slice(0, 8)}`;
	const main = page.locator('main');
	const aside = page.locator('aside');

	await signIn(page, user);
	const slug = await startNewOrganisation(page, name);
	organisationsToDelete.push(await organisationIdNamed(name));

	// Basics: the organisation's name, no dates yet, its home town.
	await expect(page.getByLabel('Conference name')).toHaveValue(name);
	await expect(main.getByText('Generated name')).toBeVisible();
	await expect(aside.getByText('Dates to be announced')).toBeVisible();
	await expect(aside.getByText('Leiden, Netherlands')).toBeVisible();
	const taglineSaved = nextAutosave(page);
	await page.getByLabel('Tagline').fill('Debate by the Rhine');
	await taglineSaved;
	await expect(main.getByText('Draft saved')).toBeVisible();
	await expectNoError(page);
	await footerButton(page, 'Continue to when & where').click();
	await expectStep(page, 'when');

	// When & where: nothing invented. Dates are picked, the rest is left.
	await expect(postedValue(page, 'startDate')).toHaveValue('');
	await expect(postedValue(page, 'endDate')).toHaveValue('');
	await pickDate(page, 'Start date', '2027-03-05');
	await pickDate(page, 'End date', '2027-03-07');
	await expect(page.getByRole('switch', { name: 'Times not decided yet' })).toBeChecked();
	await expect(page.getByLabel('In person', { exact: true })).toBeChecked();
	await expect(page.getByLabel('City')).toHaveValue('Leiden');
	await expect(postedValue(page, 'countryCode')).toHaveValue('NL');
	await expect(postedValue(page, 'timezone')).toHaveValue('Europe/Amsterdam');
	await expect(page.getByLabel('Venue (optional)')).toHaveValue('');
	await expect(aside.getByText(/5\s*–\s*7 Mar 2027/)).toBeVisible();
	await expectNoError(page);
	await footerButton(page, 'Continue to setup').click();
	await expectStep(page, 'setup');

	// Setup: nothing to copy, so one committee from the catalogue.
	await expect(page.getByRole('button', { name: /Use last year's/ })).toHaveCount(0);
	const committees = page.locator('#committees');
	// Nothing to import, so committees are simply optional. The mockup keeps
	// each part's state in the "Setup progress" list beside the panels.
	await expect(
		aside.getByRole('link', { name: /^Committees/ }).getByText('Optional', { exact: true })
	).toBeVisible();
	await committees.getByRole('link', { name: 'Add committee' }).click();
	await dialog(page).getByRole('combobox', { name: 'Committee name' }).fill('Secu');
	await dialog(page)
		.getByRole('option', { name: 'United Nations Security Council (UNSC)' })
		.click();
	await dialog(page).getByRole('button', { name: 'Add committee' }).click();
	await expect(dialog(page)).toBeHidden({ timeout: DATABASE_TIMEOUT_MS });
	await expect(committees.getByRole('row')).toHaveCount(2);
	await expect(committees.getByText('Not decided')).toBeVisible();
	await expect(committees.getByText('Unassigned')).toBeVisible();
	await expect(page.locator('#fees').getByRole('radio', { name: /Decide later/ })).toBeChecked();
	await footerButton(page, 'Continue to launch').click();
	await expectStep(page, 'launch');

	// Launch: the unknowns are legitimate, and the name followed the dates.
	await expect(readinessRow(page, 'Venue')).toContainText('To be announced');
	await expect(readinessRow(page, 'Venue')).toContainText('Ready');
	await expect(readinessRow(page, 'Fees')).toContainText('Optional');
	await expect(readinessRow(page, 'Committees')).toContainText('1 committee');
	await expect(readinessRow(page, 'Committees')).toContainText('Ready');
	await expect(main.getByText('Needed', { exact: true })).toHaveCount(0);
	await expect(aside.getByText(`${name} 2027`)).toBeVisible();
	await page.getByText('Publish conference only').click();
	await footerButton(page, 'Publish conference').click();
	await page.waitForURL(`**/manage/${slug}`, { timeout: DATABASE_TIMEOUT_MS });
	await expect(page.getByText(`${name} 2027 is now public.`)).toBeVisible();
	const shown = (text: string) => main.getByText(text, { exact: true }).filter({ visible: true });

	// The apply page's summary, a laptop-only sidebar behind signing in, says
	// the fees are to come.
	if (testInfo.project.name !== 'phone') {
		await page.goto(`/conferences/${slug}/apply`);
		await expect(shown('Fees to be announced').first()).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
	}

	// What a visitor who is not signed in sees.
	await page.context().clearCookies();
	await page.goto(`/conferences/${slug}`);
	await expect(main.getByRole('heading', { name: `${name} 2027`, level: 1 })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(shown('Venue to be announced').first()).toBeVisible();
	await expect(shown('Times')).toHaveCount(0);
	await expect(shown('Applications not open yet').first()).toBeVisible();
});

/**
 * Keep a picture of the step journey B is on, write its height on the report,
 * then check it fits the owner's window, or runs at most `allowance` pixels
 * past it on the steps that may scroll a little. The picture comes first, so
 * a step that does not fit still leaves one to look at.
 */
async function expectOwnerStepFits(page: Page, name: string, allowance = 0): Promise<void> {
	await saveOwnerScreenshot(page, name);
	await expectScrollsAtMost(page, allowance, name);
}

test("B on the product owner's screen: a brand-new organisation's steps fit and close up", async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'The owner works on a desktop.');
	await page.setViewportSize(OWNER_VIEWPORT);
	const user = await createTestUser();
	// Shorter than journey B's name above: "Riverside MUN Society" and a test's
	// eight-letter suffix would make a title no real one has, and wrap it.
	const name = `Riverside MUN ${crypto.randomUUID().slice(0, 8)}`;
	const main = page.locator('main');

	await signIn(page, user);
	await page.goto('/create');
	await expect(page.locator('a[aria-current="true"]')).toContainText('New organisation');
	await expectOwnerStepFits(page, 'create-b-organisation');
	await page.getByLabel('Organisation name').fill(name);
	await page.getByLabel('Home city').fill('Leiden');
	await chooseOption(page, 'Home country', 'Netherlands');
	await page.getByRole('button', { name: 'Continue to basics' }).click();
	await expectStep(page, 'basics');
	organisationsToDelete.push(await organisationIdNamed(name));

	// No pictures yet: the preview shows the sample banner we ship, not an
	// upload, so the panel keeps its shape and nothing moves after an upload.
	await expect(page.getByLabel('Conference name')).toHaveValue(name);
	await expect(page.locator('aside img')).toHaveCount(1);
	await expect(page.locator('aside img')).not.toHaveAttribute('src', /public-media/);
	await expectOwnerStepFits(page, 'create-b-basics');
	await footerButton(page, 'Continue to when & where').click();
	await expectStep(page, 'when');

	// No previous conference, so no suggested dates to offer.
	await expect(main.getByRole('button', { name: 'Use these dates' })).toHaveCount(0);
	await expectOwnerStepFits(page, 'create-b-when');
	await pickDate(page, 'Start date', '2027-03-05');
	await pickDate(page, 'End date', '2027-03-07');
	await footerButton(page, 'Continue to setup').click();
	await expectStep(page, 'setup');

	// Setup is drawn roomier than the window, as the owner asked, and scrolls
	// a little; see its own spec for how much.
	await expect(page.getByRole('heading', { name: 'Fees', exact: true })).toBeVisible();
	await expectOwnerStepFits(page, 'create-b-setup', 320);
	await footerButton(page, 'Continue to launch').click();
	await expectStep(page, 'launch');

	// Launch draws the applicants' facts whole where the mockup cut them off,
	// so it may run a little past the window too.
	await expect(main.getByText('Publish conference only')).toBeVisible();
	await expectOwnerStepFits(page, 'create-b-launch', 40);
});

test('C: a draft left on When & where is found again from the conference list', async ({
	page
}, testInfo) => {
	test.skip(
		testInfo.project.use.javaScriptEnabled === false,
		'Waits for the draft to save itself, which needs JavaScript.'
	);
	const user = await createTestUser();
	const name = `Riverside MUN Society ${crypto.randomUUID().slice(0, 8)}`;

	await signIn(page, user);
	const slug = await startNewOrganisation(page, name);
	organisationsToDelete.push(await organisationIdNamed(name));
	await footerButton(page, 'Continue to when & where').click();
	await expectStep(page, 'when');
	const datesSaved = nextAutosave(page);
	await pickDate(page, 'Start date', '2027-03-05');
	await pickDate(page, 'End date', '2027-03-07');
	await datesSaved;
	await expect(page.getByText('Draft saved')).toBeVisible();

	await page.goto('/manage');
	await page.getByRole('link', { name: 'Continue setup' }).click();
	await page.waitForURL(`**/create/${slug}/when`, { timeout: DATABASE_TIMEOUT_MS });
	await expect(postedValue(page, 'startDate')).toHaveValue('2027-03-05');
	await expect(postedValue(page, 'endDate')).toHaveValue('2027-03-07');

	// The management address of a draft leads back into the steps too.
	await page.goto(`/manage/${slug}`);
	await page.waitForURL(`**/create/${slug}/when`, { timeout: DATABASE_TIMEOUT_MS });
});
