import { expect, test, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { ClickBudgetJourney, type JourneyCount } from './click-budget';
import { TEST_PASSWORD } from './signed-in-user';
import { RACHEL, restoreSeedRows, snapshotSeedRows } from './walkthrough-seed';

// T177: the two walks of Budget 7, the delegation head's
// (`specs/03-design/streamlining/design.md`, "The delegation head"), counted
// clicks · pages · typed fields · decisions on the walkthrough seed's
// "applications open" conference:
//
// - a new account, from `/register` to its new delegation's page with a join
//   code (`specs/05-pages/delegation/new.md`, "Budget 7");
// - Rachel, an existing head, from `/login` through her draft delegation's
//   "Copy link", "Submit to the organisers" and "Assign members →"
//   (`specs/05-pages/delegation/dashboard.md`, "Budget 7").

/** The new account's walk: at most 11 clicks, 7 pages, 8 typed fields and 0 decisions. */
const NEW_HEAD_BUDGET: JourneyCount = { clicks: 11, pages: 7, typedFields: 8, decisions: 0 };

/** Rachel's walk: at most 5 clicks, 4 pages, 2 typed fields and 0 decisions. */
const EXISTING_HEAD_BUDGET: JourneyCount = { clicks: 5, pages: 4, typedFields: 2, decisions: 0 };

/**
 * How long an assertion that waits on a page reading the database may take,
 * for the reason `manage-dashboard.spec.ts` gives.
 */
const DATABASE_TIMEOUT_MS = 15_000;

/** "Northbridge MUN (applications open)" in `supabase/walkthrough-seed.sql`. */
const CONFERENCE_NAME = 'Northbridge MUN (applications open)';
const CONFERENCE_SLUG = 'northbridge-applications-open';

/** Rachel's draft delegation at that conference, "St Aidan's Academy". */
const RACHELS_DELEGATION_ID = 'f6000000-0000-4000-8000-000000000101';
const RACHELS_DELEGATION_NAME = "St Aidan's Academy";

/** The institution the new account names on `/welcome`, which becomes its delegation's name. */
const NEW_HEAD_INSTITUTION = 'Lagos International School';

/** A delegation's own page, whose id only the database knows. */
const DELEGATION_PAGE_URL = /\/delegations\/([0-9a-f-]{36})$/;

/** The two widths Rachel's walk is taken at: a laptop, then a phone. */
const WIDTHS = [
	{ name: 'desktop', viewport: { width: 1280, height: 800 } },
	{ name: 'phone', viewport: { width: 390, height: 844 } }
];

/** An address nobody has an account for. */
function unusedEmail(): string {
	return `e2e-budget-${crypto.randomUUID()}@example.com`;
}

/** `text` with every character a regular expression gives a meaning, such as `(`, escaped. */
function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Take the walk's delegation away again, with its head, so the seed's conference is as it was. */
async function deleteDelegation(delegationId: string | null): Promise<void> {
	if (delegationId === null) {
		return;
	}

	const admin = createServiceRoleClient();
	const { error } = await admin.from('delegations').delete().eq('id', delegationId);

	if (error) {
		throw new Error(`Could not delete the walk's delegation: ${error.message}`);
	}
}

/**
 * The conference page's "Register a delegation", in whichever copy this width
 * shows: a button under "With your school or club" on a laptop, a link in the
 * bar at the foot of a phone (T176).
 */
function visibleRegisterDelegation(page: Page) {
	return page
		.getByRole('main')
		.getByRole('link', { name: 'Register a delegation' })
		.filter({ visible: true })
		.first();
}

/*
	`test.slow()` triples the thirty seconds Playwright allows a test by default.
	Each walk goes through several pages, most of them writing to the database,
	while the rest of the suite is asking the one local database at once.
*/
test.beforeEach(() => {
	test.slow();
});

test('budget 7: a new account goes from /register to its delegation with a join code', async ({
	page
}) => {
	const main = page.getByRole('main');
	let delegationId: string | null = null;

	try {
		// Step 1: `/register`.
		await page.goto('/register');

		const journey = ClickBudgetJourney.fromPage(page);

		await journey.type(main.getByLabel('Full name'), 'Chidi Okeke');
		await journey.type(main.getByLabel('Email'), unusedEmail());
		await journey.type(main.getByLabel('Password'), TEST_PASSWORD);
		await journey.click(main.getByLabel(/I agree to the Terms/));
		await journey.click(main.getByRole('button', { name: 'Create account' }));
		await expect(page).toHaveURL(/\/welcome/, { timeout: DATABASE_TIMEOUT_MS });

		// Step 2: `/welcome`, which ends on `/home`.
		await journey.type(main.getByLabel('Institution'), NEW_HEAD_INSTITUTION);
		await journey.choose(main.getByLabel('Country'), 'Nigeria');
		await journey.click(main.getByLabel('Several', { exact: true }));
		await journey.click(main.getByRole('button', { name: 'Continue' }));
		await expect(page).toHaveURL('/home', { timeout: DATABASE_TIMEOUT_MS });

		// Step 3: `/home`'s one button for an account with no conference yet,
		// "Find a conference", which opens the directory on the conferences
		// taking applications (docs/home.md, section 3.3); this one is among them.
		await journey.click(main.getByRole('link', { name: 'Find a conference', exact: true }));
		await expect(page).toHaveURL(/\/conferences\?open=1$/, { timeout: DATABASE_TIMEOUT_MS });

		// Step 4: the conference's card.
		await journey.click(
			main.getByRole('link', { name: new RegExp(escapeRegExp(CONFERENCE_NAME)) })
		);
		await expect(page).toHaveURL(`/conferences/${CONFERENCE_SLUG}`, {
			timeout: DATABASE_TIMEOUT_MS
		});

		// Step 5: "Register a delegation", under "With your school or club".
		await journey.click(visibleRegisterDelegation(page));
		await expect(page).toHaveURL(`/conferences/${CONFERENCE_SLUG}/delegations/new`, {
			timeout: DATABASE_TIMEOUT_MS
		});

		// Step 6: the form opens with the name, the institution and the country
		// filled in from the profile (T177), so only the seats and the note are
		// typed before the consent and "Create delegation".
		await expect(main.getByLabel('Delegation name')).toHaveValue(NEW_HEAD_INSTITUTION);
		await expect(main.getByLabel('Institution')).toHaveValue(NEW_HEAD_INSTITUTION);
		await journey.type(main.getByLabel('Seats you would like'), '8');
		await journey.type(main.getByLabel('Note to the organisers'), 'Eight students from Year 11.');
		await journey.click(main.getByRole('checkbox'));
		await journey.click(main.getByRole('button', { name: 'Create delegation' }));

		// Step 7: the delegation's own page, with a fresh join code.
		await expect(page).toHaveURL(DELEGATION_PAGE_URL, { timeout: DATABASE_TIMEOUT_MS });

		const [, createdId] = new URL(page.url()).pathname.match(DELEGATION_PAGE_URL) ?? [];

		delegationId = createdId;

		await expect(main.getByRole('heading', { name: 'Join code' })).toBeVisible();
		await expect(main.getByText(/\/join\/[A-Z0-9]{10}$/)).toBeVisible();

		/*
			The design's own count for this walk is its ceiling, 11 · 7 · 8 · 0. The
			form now fills three of its boxes in, so the walk types two fields
			there and clicks two, one click and two fields under the ceiling.
		*/
		expect(journey.count(), 'Budget 7, walked as the design walks it').toEqual({
			clicks: 10,
			pages: 7,
			typedFields: 6,
			decisions: 0
		});
		journey.expectWithinBudget(NEW_HEAD_BUDGET);
	} finally {
		await deleteDelegation(delegationId);
	}
});

/** Walk Rachel's budget 7 once, from `/login` to the seats page, counting every step. */
async function walkExistingHeadBudget(page: Page): Promise<ClickBudgetJourney> {
	const main = page.getByRole('main');
	const journey = await ClickBudgetJourney.signIn(page, RACHEL);

	await expect(page).toHaveURL('/home', { timeout: DATABASE_TIMEOUT_MS });

	// The first link named after her conference: the hero's name at the top of
	// `/home`, which as a head of delegation leads to her delegation's dashboard,
	// as her row under "Applications" does.
	await journey.click(
		main.getByRole('link', { name: new RegExp(escapeRegExp(CONFERENCE_NAME)) }).first()
	);
	await expect(page).toHaveURL(`/delegations/${RACHELS_DELEGATION_ID}`, {
		timeout: DATABASE_TIMEOUT_MS
	});

	// The draft's status card reads "Not sent yet", with its one filled button.
	await expect(main.getByRole('heading', { level: 1 })).toHaveText(RACHELS_DELEGATION_NAME);
	await expect(main.getByRole('heading', { name: 'Not sent yet' })).toBeVisible();

	// "Copy link" needs the page's script, which lands a moment after the page
	// itself; a press before then is lost, and a person would press again.
	await page.waitForLoadState('networkidle');
	await journey.click(main.getByRole('button', { name: 'Copy link' }));
	await expect(main.getByText('Link copied.')).toBeVisible();

	await journey.click(main.getByRole('button', { name: 'Submit to the organisers' }));
	await expect(main.getByText(/The organisers are reviewing your request/).first()).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	await journey.click(main.getByRole('link', { name: 'Assign members →' }));
	await expect(page).toHaveURL(`/delegations/${RACHELS_DELEGATION_ID}/seats`, {
		timeout: DATABASE_TIMEOUT_MS
	});

	return journey;
}

/*
	Rachel's walk sends the seed's one draft delegation to the organisers, so it
	puts the row back afterwards. Three projects running at once cannot share one
	delegation row, so the walk runs in the desktop project only and walks both
	widths in turn, putting the row back between them, as
	`click-budget-awards.spec.ts` does. "Copy link" needs JavaScript, which is one
	more reason to leave the no-JavaScript project out.
*/
test("budget 7: Rachel copies her delegation's link, sends it and opens its seats", async ({
	page,
	browserName
}, testInfo) => {
	test.skip(
		testInfo.project.name !== 'desktop',
		'One delegation row cannot be shared by three projects.'
	);

	// Chromium asks before a page may write to the clipboard, and a test has
	// nobody to ask, so the permission is given to this context up front.
	// WebKit (`pnpm test:e2e:webkit`) lets a press write without asking and
	// refuses to be granted a permission it does not know (T163).
	if (browserName === 'chromium') {
		await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
	}

	for (const width of WIDTHS) {
		const kept = await snapshotSeedRows({
			table: 'delegations',
			column: 'id',
			value: RACHELS_DELEGATION_ID
		});

		try {
			await page.context().clearCookies();
			await page.setViewportSize(width.viewport);

			const journey = await walkExistingHeadBudget(page);

			expect(journey.count(), `The walk at ${width.name} width`).toEqual(EXISTING_HEAD_BUDGET);
			journey.expectWithinBudget(EXISTING_HEAD_BUDGET);
		} finally {
			// In a `finally`, so that a failed step still leaves the draft as the seed has it.
			await restoreSeedRows(kept);
		}
	}
});
