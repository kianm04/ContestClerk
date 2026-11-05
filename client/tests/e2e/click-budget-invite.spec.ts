import { expect, test, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { ClickBudgetJourney, type JourneyCount } from './click-budget';
import { createTestUser, presetRoleId, TEST_PASSWORD, type TestUser } from './signed-in-user';

// T176: Budget 11, an invited chair from the invitation link to the chair room
// in its Ready state (`specs/05-pages/auth/invite.md` and
// `specs/05-pages/chair/committee-room.md`, each "Budget 11"), counted as
// clicks · pages · typed fields · decisions. It is walked twice: by a person
// with no account yet, and by one who has an account and is signed out.
//
// The conference is the test's own and has not started (review-2, N4): the
// room greets a chair before the first day with "Start a practice session",
// which is the Ready state the budget ends on. It is a draft, so it is listed
// nowhere a visitor looks, and the service-role client writes it, its
// organiser, its committee and the invitation the way the organiser's own
// forms would. Every account, conference and invitation is new, so the three
// projects can walk at once.

/**
 * Budget 11 for a new account: at most 6 clicks, 4 pages, 4 typed fields and 0
 * decisions. The fourth field is the address: the invitation link used to put
 * it in the register form, which handed it to whoever held the link (security
 * review L18), so the person types the address they were invited at.
 */
const BUDGET_11_NEW_ACCOUNT: JourneyCount = { clicks: 6, pages: 4, typedFields: 4, decisions: 0 };

/** Budget 11 for an existing account, signed out: at most 3 · 4 · 2 · 0. */
const BUDGET_11_EXISTING_ACCOUNT: JourneyCount = {
	clicks: 3,
	pages: 4,
	typedFields: 2,
	decisions: 0
};

/**
 * How long an assertion that waits on a page reading the database may take,
 * for the reason `manage-dashboard.spec.ts` gives.
 */
const DATABASE_TIMEOUT_MS = 15_000;

/** The conference's days: in the future, so the room offers a practice session. */
const CONFERENCE_FIRST_DAY = '2030-06-07';
const CONFERENCE_LAST_DAY = '2030-06-09';

/** What the walk needs to know about the invitation it follows. */
type ChairInvitation = {
	/** The address of the invitation link, `/invites/<token>`. */
	invitePath: string;
	/** The chair room the new chair should land in. */
	roomPath: string;
};

/** A random suffix, so that no two walks share a slug, a name or an address. */
function uniqueSuffix(): string {
	return crypto.randomUUID().slice(0, 8);
}

/** Write one row with the service-role client and answer its id. */
async function insertRow(table: string, row: Record<string, unknown>): Promise<string> {
	const admin = createServiceRoleClient();
	const { data, error } = await admin.from(table).insert(row).select('id').single();

	if (error || !data) {
		throw new Error(`Could not write the test ${table} row: ${error?.message}`);
	}

	return (data as { id: string }).id;
}

/**
 * A draft conference that has not started, with one committee, run by an
 * organiser of its own, and a chair invitation to that committee sent to
 * `email`.
 */
async function createChairInvitation(email: string): Promise<ChairInvitation> {
	const suffix = uniqueSuffix();
	const organiser = await createTestUser('Priya Nair');

	// `add_organization_creator_as_owner` makes `created_by` the owner, and an
	// owner runs every conference of the organisation.
	const organizationId = await insertRow('organizations', {
		name: `Budget Eleven Society ${suffix}`,
		slug: `e2e-budget-eleven-org-${suffix}`,
		created_by: organiser.id
	});

	const conferenceSlug = `e2e-budget-eleven-${suffix}`;
	const conferenceId = await insertRow('conferences', {
		name: `Budget Eleven MUN ${suffix}`,
		slug: conferenceSlug,
		city: 'Delft',
		country_code: 'NL',
		timezone: 'Europe/Amsterdam',
		start_date: CONFERENCE_FIRST_DAY,
		end_date: CONFERENCE_LAST_DAY,
		status: 'draft',
		organization_id: organizationId,
		created_by: organiser.id
	});

	const committeeSlug = `security-council-${suffix}`;
	const committeeId = await insertRow('committees', {
		conference_id: conferenceId,
		name: 'Security Council',
		slug: committeeSlug,
		level: 'intermediate',
		topics: ['The first topic'],
		position: 0
	});

	// `token` is 32 url-safe characters, which a UUID without its dashes is.
	const token = crypto.randomUUID().replaceAll('-', '');

	await insertRow('invites', {
		kind: 'conference_staff',
		conference_id: conferenceId,
		committee_id: committeeId,
		email,
		role_id: await presetRoleId(conferenceId, 'Chair'),
		token,
		invited_by: organiser.id
	});

	return {
		invitePath: `/invites/${token}`,
		roomPath: `/conferences/${conferenceSlug}/committees/${committeeSlug}/chair`
	};
}

/** Accept the invitation, and wait for the chair room's Ready state. */
async function acceptAndReachTheRoom(
	page: Page,
	journey: ClickBudgetJourney,
	invitation: ChairInvitation
): Promise<void> {
	const main = page.getByRole('main');

	await journey.click(main.getByRole('button', { name: 'Accept invite' }));
	await expect(page).toHaveURL(invitation.roomPath, { timeout: DATABASE_TIMEOUT_MS });
	await expect(main.getByRole('button', { name: 'Start a practice session' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
}

/*
	`test.slow()` triples the thirty seconds Playwright allows a test by default.
	Each walk writes its own conference first and then waits on the database on
	every page, while the rest of the suite is asking the one local database.
*/
test.beforeEach(() => {
	test.slow();
});

test('budget 11: a new account follows a chair invitation into the chair room', async ({
	page
}) => {
	const email = `e2e-budget-eleven-${uniqueSuffix()}@example.com`;
	const invitation = await createChairInvitation(email);
	const main = page.getByRole('main');

	// The invitation link sends a visitor with no session to `/register`, which
	// is the journey's first page. Only the way back travels with the link, so
	// the address is the first thing typed.
	await page.goto(invitation.invitePath);
	await expect(page).toHaveURL(/^[^?]*\/register\?/);

	const journey = ClickBudgetJourney.fromPage(page);

	await journey.type(main.getByLabel('Email'), email);
	await journey.type(main.getByLabel('Full name'), 'Noor Haddad');
	await journey.type(main.getByLabel('Password'), TEST_PASSWORD);
	await journey.click(main.getByLabel(/I agree to the Terms/));
	await journey.click(main.getByRole('button', { name: 'Create account' }));

	// A new account answers `/welcome` first, carrying the invitation along.
	await expect(page).toHaveURL(/\/welcome\?next=/, { timeout: DATABASE_TIMEOUT_MS });
	await journey.type(main.getByLabel('Institution'), 'Delft University');
	await journey.choose(main.getByLabel('Country'), 'Netherlands');
	await journey.click(main.getByLabel('Several', { exact: true }));
	await journey.click(main.getByRole('button', { name: 'Continue' }));

	await expect(page).toHaveURL(invitation.invitePath, { timeout: DATABASE_TIMEOUT_MS });
	await acceptAndReachTheRoom(page, journey, invitation);

	expect(journey.count(), 'Budget 11, a new account').toEqual(BUDGET_11_NEW_ACCOUNT);
	journey.expectWithinBudget(BUDGET_11_NEW_ACCOUNT);
});

test('budget 11: a signed-out account follows a chair invitation into the chair room', async ({
	page
}) => {
	const chair: TestUser = await createTestUser('Noor Haddad');
	const invitation = await createChairInvitation(chair.email);
	const main = page.getByRole('main');

	// The page cannot tell a returning person from a new one without saying who
	// has an account, so it sends both to `/register`.
	await page.goto(invitation.invitePath);
	await expect(page).toHaveURL(/^[^?]*\/register\?/);

	const journey = ClickBudgetJourney.fromPage(page);

	// The foot's "Log in →" keeps `next`, so logging in comes back here.
	await journey.click(main.getByRole('link', { name: 'Log in →', exact: true }));
	await expect(page).toHaveURL(/\/login\?next=%2Finvites%2F/);

	await journey.type(main.getByLabel('Email'), chair.email);
	await journey.type(main.getByLabel('Password'), TEST_PASSWORD);
	await journey.click(main.getByRole('button', { name: 'Log in' }));

	await expect(page).toHaveURL(invitation.invitePath, { timeout: DATABASE_TIMEOUT_MS });
	await acceptAndReachTheRoom(page, journey, invitation);

	expect(journey.count(), 'Budget 11, an existing account').toEqual(BUDGET_11_EXISTING_ACCOUNT);
	journey.expectWithinBudget(BUDGET_11_EXISTING_ACCOUNT);
});
