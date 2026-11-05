import { expect, test, type Page } from '@playwright/test';
import { ClickBudgetJourney, type JourneyCount } from './click-budget';
import { createReturningOrganisationFor, deleteConferencesOf } from './draft-conference';
import { createTestUser, signIn } from './signed-in-user';

// Budget 4, an organisation's next edition: from `/create` to the published
// conference, counting clicks · pages · typed fields · decisions. The creation
// flow (Trello fe3reN7Y) replaced the old one-step form and its "new account to
// a practice session" walk; the product owner set this budget instead, because
// coming back for next year is what most organisers do, and it should take a
// minute or two.
//
// The organisation ran "Delft MUN 2026" last spring. Everything the next
// edition needs is offered from it, one button at a time: the suggested dates,
// last year's committees, application form and fee. Nothing is typed.
//
// `create-walkthrough.spec.ts` walks the same journey and checks what each step
// shows; this test only counts. It runs on both widths. Without JavaScript the
// Setup imports reload the page instead of answering in place, which
// `create-setup.spec.ts` covers on its own.

/** The budget: at most 14 clicks, 6 pages, no typing and 1 decision. */
const BUDGET_4: JourneyCount = { clicks: 14, pages: 6, typedFields: 0, decisions: 1 };

/** The walk as this test walks it: 13 · 6 · 0 · 1, the same at both widths. */
const BUDGET_4_WALK: JourneyCount = { clicks: 13, pages: 6, typedFields: 0, decisions: 1 };

/**
 * How long an assertion that waits on a page reading the database may take,
 * for the reason `manage-dashboard.spec.ts` gives.
 */
const DATABASE_TIMEOUT_MS = 15_000;

/** The organisation each walk makes, deleted with its conferences after it. */
let organisationToDelete: string | null = null;

/*
	`test.slow()` triples the thirty seconds Playwright allows a test by default.
	The walk writes to the database on every step, while the rest of the suite
	is asking the one local database at once.
*/
test.beforeEach(() => {
	test.slow();
	organisationToDelete = null;
});

// The walk publishes an upcoming conference, which would otherwise sit on the
// directory's first page for good.
test.afterEach(async () => {
	if (organisationToDelete) {
		await deleteConferencesOf(organisationToDelete);
	}
});

/** Wait until the tab shows the creation step `step` of a draft. */
async function expectStep(page: Page, step: string): Promise<void> {
	await page.waitForURL(new RegExp(`/create/[^/]+/${step}$`), { timeout: DATABASE_TIMEOUT_MS });
}

test('budget 4: a returning organisation publishes its next edition', async ({
	page
}, testInfo) => {
	test.skip(
		testInfo.project.use.javaScriptEnabled === false,
		'The Setup imports answer in place with JavaScript; without it they reload, as create-setup.spec.ts checks.'
	);

	const user = await createTestUser();
	const organisation = await createReturningOrganisationFor(user);
	organisationToDelete = organisation.id;
	const main = page.getByRole('main');

	// The person is signed in and opens "Create a conference", which is `/create`.
	await signIn(page, user);
	await page.goto('/create');
	const journey = ClickBudgetJourney.fromPage(page);

	// Page 1, `/create`: the organisation, then its suggested next edition. The
	// card is a link that only changes the address's query, so it is no page.
	await journey.click(main.getByRole('link', { name: new RegExp(organisation.name) }));
	await journey.click(main.getByRole('button', { name: 'Use this setup' }));
	await expectStep(page, 'basics');

	// Page 2, Basics: filled in from last year and the organisation.
	await journey.click(page.getByRole('button', { name: 'Continue to when & where' }));
	await expectStep(page, 'when');

	// Page 3, When & where: last year's weekdays, a year on.
	await journey.click(main.getByRole('button', { name: 'Use these dates' }));
	// The date button keeps its value in a hidden input named after the field.
	await expect(page.locator('input[name="startDate"]')).not.toHaveValue('', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await journey.click(page.getByRole('button', { name: 'Continue to setup' }));
	await expectStep(page, 'setup');

	// Page 4, Setup: last year's committees, form and fee. The form is copied
	// from inside its dialog, which lives in the address's query.
	const committees = page.locator('#committees');
	await journey.click(committees.getByRole('button', { name: "Use last year's committees" }));
	await expect(committees.getByRole('row')).toHaveCount(4, { timeout: DATABASE_TIMEOUT_MS });

	await journey.click(
		page.locator('#applications').getByRole('link', { name: 'Edit settings' }).first()
	);
	const dialog = page.getByRole('dialog');
	await journey.click(dialog.getByRole('button', { name: "Use last year's form" }));
	await expect(dialog.getByText('Why MUN?')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await journey.click(dialog.getByRole('link', { name: 'Close' }));
	await expect(dialog).toBeHidden();

	const fees = page.locator('#fees');
	await journey.click(fees.getByRole('button', { name: "Use last year's fee" }));
	await expect(fees.getByText('€35.00')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await journey.click(page.getByRole('button', { name: 'Continue to launch' }));
	await expectStep(page, 'launch');

	// Page 5, Launch: the one decision, whether applications open now.
	journey.decide();
	await journey.click(main.getByText('Publish and open applications'));
	await journey.click(page.getByRole('button', { name: 'Publish conference' }));

	// Page 6, the conference's dashboard, which says it is public.
	await page.waitForURL(/\/manage\/[^/]+$/, { timeout: DATABASE_TIMEOUT_MS });
	await expect(page.getByText('Delft MUN 2027 is now public and taking applications.')).toBeVisible(
		{ timeout: DATABASE_TIMEOUT_MS }
	);

	expect(journey.count(), 'Budget 4, walked step by step').toEqual(BUDGET_4_WALK);
	journey.expectWithinBudget(BUDGET_4);
});
