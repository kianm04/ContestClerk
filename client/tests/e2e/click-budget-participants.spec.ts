import { expect, test, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { ClickBudgetJourney, type JourneyCount } from './click-budget';
import { TEST_PASSWORD } from './signed-in-user';

// T176: Budget 10, a visitor from the landing page to an application submitted
// (`specs/05-pages/public/conference.md`, "Budget 10"), and Budget 8, a new
// account from `/register` to one (`specs/05-pages/delegate/home.md`, "Budget
// 8"). Each is walked the way `specs/03-design/streamlining/design.md` walks
// it ("The visitor" and "The newcomer"), counting clicks · pages · typed fields
// · decisions, on the walkthrough seed's "applications open" conference.
//
// Every walk signs up an account of its own, so the three projects (desktop,
// phone and no JavaScript) can walk at once. The application it submits is
// deleted in a `finally`, because the seed's conference is meant to hold one
// application in every status and no more.

/** Budget 10: at most 12 clicks, 7 pages, 6 typed fields and 0 decisions. */
const BUDGET_10: JourneyCount = { clicks: 12, pages: 7, typedFields: 6, decisions: 0 };

/**
 * Budget 8: at most 11 clicks, 7 pages, 5 typed fields and 0 decisions. It
 * was 6 typed fields while `/home` carried a search box of its own; now its
 * "Find a conference" button opens the directory on the conferences taking
 * applications, where the conference's card is, and nothing is typed.
 */
const BUDGET_8: JourneyCount = { clicks: 11, pages: 7, typedFields: 5, decisions: 0 };

/**
 * How long an assertion that waits on a page reading the database may take,
 * for the reason `manage-dashboard.spec.ts` gives.
 */
const DATABASE_TIMEOUT_MS = 15_000;

/** "Northbridge MUN (applications open)" in `supabase/walkthrough-seed.sql`. */
const CONFERENCE_NAME = 'Northbridge MUN (applications open)';
const CONFERENCE_SLUG = 'northbridge-applications-open';

/** Its one committee, as the apply form's committee choice names it. */
const COMMITTEE_OPTION = 'ECOSOC · Economic and Social Council';

/** The apply form's consent box, in the words `06-features/applications.md` gives. */
const CONSENT_LABEL = /The organisers may see my profile details/;

/** An application's own page, whose id only the database knows. */
const APPLICATION_PAGE_URL = /\/applications\/([0-9a-f-]{36})$/;

/** An address nobody has an account for. */
function unusedEmail(): string {
	return `e2e-budget-${crypto.randomUUID()}@example.com`;
}

/** The ApplyPanel's "Apply as a delegate", in whichever copy this width shows. */
function visibleApplyButton(page: Page) {
	return page
		.getByRole('main')
		.getByRole('link', { name: 'Apply as a delegate' })
		.filter({ visible: true });
}

/** Fill in `/register` and create the account: 2 clicks and 3 typed fields. */
async function createAccount(page: Page, journey: ClickBudgetJourney): Promise<void> {
	const main = page.getByRole('main');

	await journey.type(main.getByLabel('Full name'), 'Amara Okafor');
	await journey.type(main.getByLabel('Email'), unusedEmail());
	await journey.type(main.getByLabel('Password'), TEST_PASSWORD);
	await journey.click(main.getByLabel(/I agree to the Terms/));
	await journey.click(main.getByRole('button', { name: 'Create account' }));
	await expect(page).toHaveURL(/\/welcome/, { timeout: DATABASE_TIMEOUT_MS });
}

/** Answer `/welcome`: 3 clicks and 1 typed field. */
async function answerWelcome(page: Page, journey: ClickBudgetJourney): Promise<void> {
	const main = page.getByRole('main');

	await journey.type(main.getByLabel('Institution'), 'Lagos International School');
	await journey.choose(main.getByLabel('Country'), 'Nigeria');
	await journey.click(main.getByLabel('Several', { exact: true }));
	await journey.click(main.getByRole('button', { name: 'Continue' }));
}

/**
 * Fill in the apply form and submit it: 3 clicks and 1 typed field. Answers
 * the id of the application it made.
 */
async function submitApplication(page: Page, journey: ClickBudgetJourney): Promise<string> {
	const main = page.getByRole('main');

	await journey.choose(main.getByLabel('First choice of committee'), COMMITTEE_OPTION);
	await journey.type(
		main.getByLabel('Why do you want to take part?'),
		'I want to debate trade and development.'
	);
	await journey.click(main.getByLabel(CONSENT_LABEL));
	await journey.click(main.getByRole('button', { name: 'Submit application' }));

	await expect(page).toHaveURL(APPLICATION_PAGE_URL, { timeout: DATABASE_TIMEOUT_MS });

	const [, applicationId] = new URL(page.url()).pathname.match(APPLICATION_PAGE_URL) ?? [];

	return applicationId;
}

/** Take the walk's application away again, so the seed's conference is as it was. */
async function deleteApplication(applicationId: string | null): Promise<void> {
	if (applicationId === null) {
		return;
	}

	const admin = createServiceRoleClient();
	const { error } = await admin.from('applications').delete().eq('id', applicationId);

	if (error) {
		throw new Error(`Could not delete the walk's application: ${error.message}`);
	}
}

/*
	`test.slow()` triples the thirty seconds Playwright allows a test by default.
	Each walk goes through seven pages, most of them writing to the database,
	while the rest of the suite is asking the one local database at once.
*/
test.beforeEach(() => {
	test.slow();
});

test('budget 10: a visitor goes from the landing page to an application submitted', async ({
	page
}, testInfo) => {
	const main = page.getByRole('main');
	let applicationId: string | null = null;

	try {
		// Step 1: the landing page's hero button, the one on the delegates' half.
		await page.goto('/');

		const journey = ClickBudgetJourney.fromPage(page);

		await journey.click(main.getByRole('link', { name: 'Explore conferences' }));
		await expect(page).toHaveURL(/\/conferences/, { timeout: DATABASE_TIMEOUT_MS });

		// Step 2: search, send the search, and open the conference's card. With
		// JavaScript "Apply filters" is hidden and Enter in the box sends it (T180);
		// without, the button does. Either is one click, so the walk costs the same.
		const searchBox = main.getByLabel('Search conferences');
		await journey.type(searchBox, 'Northbridge');

		if (testInfo.project.use.javaScriptEnabled === false) {
			await journey.click(main.getByRole('button', { name: 'Apply filters' }));
		} else {
			await journey.press(searchBox, 'Enter');
		}

		await expect(page).toHaveURL(/q=Northbridge/, { timeout: DATABASE_TIMEOUT_MS });
		await journey.click(
			main.getByRole('link', { name: new RegExp(escapeRegExp(CONFERENCE_NAME)) })
		);
		await expect(page).toHaveURL(`/conferences/${CONFERENCE_SLUG}`, {
			timeout: DATABASE_TIMEOUT_MS
		});

		// Step 3: "Apply as a delegate", under "On your own", leads a visitor to
		// create an account first (T176).
		await journey.click(visibleApplyButton(page));
		await expect(page).toHaveURL(/\/register\?next=/, { timeout: DATABASE_TIMEOUT_MS });

		// Steps 4 and 5: `/register`, then `/welcome`, which carries on to the form.
		await createAccount(page, journey);
		await answerWelcome(page, journey);
		await expect(page).toHaveURL(`/conferences/${CONFERENCE_SLUG}/apply`, {
			timeout: DATABASE_TIMEOUT_MS
		});

		// Steps 6 and 7: the apply form, then the application's own page.
		applicationId = await submitApplication(page, journey);

		expect(journey.count(), 'Budget 10, walked as the design walks it').toEqual(BUDGET_10);
		journey.expectWithinBudget(BUDGET_10);
	} finally {
		await deleteApplication(applicationId);
	}
});

test('budget 8: a new account goes from /register to an application submitted', async ({
	page
}) => {
	const main = page.getByRole('main');
	let applicationId: string | null = null;

	try {
		// Steps 1 and 2: `/register`, then `/welcome`, which ends on `/home`.
		await page.goto('/register');

		const journey = ClickBudgetJourney.fromPage(page);

		await createAccount(page, journey);
		await answerWelcome(page, journey);
		await expect(page).toHaveURL('/home', { timeout: DATABASE_TIMEOUT_MS });

		// Step 3: `/home`'s one button for an account with no conference yet,
		// "Find a conference", which opens the directory on the conferences
		// taking applications (docs/home.md, section 3.3). The conference is
		// one of them, so its card is on that page without a search.
		await journey.click(main.getByRole('link', { name: 'Find a conference', exact: true }));
		await expect(page).toHaveURL(/\/conferences\?open=1$/, { timeout: DATABASE_TIMEOUT_MS });

		// Steps 4 and 5: the conference's card, then "Apply as a delegate".
		await journey.click(
			main.getByRole('link', { name: new RegExp(escapeRegExp(CONFERENCE_NAME)) })
		);
		await expect(page).toHaveURL(`/conferences/${CONFERENCE_SLUG}`, {
			timeout: DATABASE_TIMEOUT_MS
		});
		await journey.click(visibleApplyButton(page));
		await expect(page).toHaveURL(`/conferences/${CONFERENCE_SLUG}/apply`, {
			timeout: DATABASE_TIMEOUT_MS
		});

		// Steps 6 and 7: the apply form, then the application's own page.
		applicationId = await submitApplication(page, journey);

		expect(journey.count(), 'Budget 8, walked as the design walks it').toEqual(BUDGET_8);
		journey.expectWithinBudget(BUDGET_8);
	} finally {
		await deleteApplication(applicationId);
	}
});

/** `text` with every character a regular expression gives a meaning, such as `(`, escaped. */
function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
