import { expect, test, type APIResponse, type Locator, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { createTestUser, giveApplication, signIn, type TestUser } from './signed-in-user';
import { createDraftConferenceFor } from './draft-conference';
import {
	expectNoSidewaysOverflow,
	expectPageFitsInScreens,
	saveFullPageScreenshot
} from './page-shape';
import { answerConfirmationPage } from './confirmation-page';
import { waitUntilAnswered } from './chair-room-fixtures';
import { skipWithoutJavaScript } from './in-place';
import {
	AT_ONCE_TIMEOUT_MS,
	answerSlowly,
	answerWithError,
	sawSpinner,
	watchForSpinners
} from './instant';

// The acceptance criteria of `specs/05-pages/organiser/allocation.md` that need
// a real browser, for the grid T28 builds at `/manage/[slug]/allocation`.
//
// * the four counts at the top equal the number of cells in each state;
// * the committee, the state and the search each narrow the grid, a search that
//   matches nothing says so, and "Reset" goes back to the plain address;
// * freeing an individual's seat sets their application to `rejected` and voids
//   an unpaid invoice, while a paid one is left alone and the flash says so;
// * freeing a seat nobody is sitting in is refused;
// * moving a delegate takes their application link and their unpaid invoice
//   with them;
// * the move form is on the page itself, opened by `?seat=`, so it needs no
//   script;
// * a hidden seat is out of every seat picker, and a seat somebody is sitting
//   in cannot be hidden at all;
// * an accepted delegation with fewer seats than it asked for earns a warning
//   that links to the accepted delegations tab;
// * somebody who does not run the conference gets a 404, from the page and from
//   the actions;
// * the committees stack as `<details>` sections on a phone, and the columns
//   scroll sideways on a desktop.
//
// WHERE THE SELECTORS CAME FROM
// The words this file looks for are the ones `specs/05-pages/organiser/allocation.md`
// and `src/lib/allocation.ts` write out: every flash, every refusal and every
// empty state below is quoted from one of those two, not invented here. The
// labels that only the markup knows — what the submit button of the move panel
// says, what the buttons in the free and hide panels say — are the constants
// under "The words on the controls" below, gathered in one place so that they
// are corrected once rather than in a dozen assertions.
//
// EVERY ACTION WITHOUT JAVASCRIPT
// The seat menu holds links and not buttons, the filters are a real
// `<form method="get">`, the move panel is a real `<form method="post">` and
// the free and hide panels are `ConfirmButton`s, which open a confirmation page
// asking the same question when there is no script to open a dialog with. So
// every test below runs on the `desktop-no-js` project as well. The three that
// measure the page or count what is on screen are the exception, and each says
// which project it wants and why.
//
// WHAT THESE TESTS LEAVE BEHIND
// Each test signs a brand-new account in and creates its own conference through
// `./draft-conference`, with an organisation of its own, and everything it
// creates stays in the database until the next `pnpm db:reset`. Its committees,
// its seats, its delegation and the accounts in it are its own for the reason
// `playwright.config.ts` gives: every test runs on three projects at once
// against one database, so a test that reached for "the first free seat" or
// counted the cells of a shared conference would be reading another project's
// work. The conferences are dated in 2020 for the reason
// `tests/e2e/manage-delegations.spec.ts` gives: `/conferences` lists
// conferences that are published and have not finished, and
// `tests/e2e/conferences.spec.ts` counts what is in it.
//
// Nothing here takes a conference, a committee, a seat or a delegation from
// `supabase/seed.sql`, which is why nothing is put back afterwards.
//
// `createDraftConference`, `slugOf`, `readConferenceId`,
// `signInWithAConference`, `postFormAction` and `pressAndConfirm` below are
// copies of the ones in `tests/e2e/manage-delegations.spec.ts` and
// `tests/e2e/manage-committees.spec.ts`, and are deliberately copies rather
// than shared imports for the same reason those two are: each file wants its
// own dates and its own extra fields, and a helper shared between them would
// have to be told about every one of those.

/**
 * How long an assertion that waits on a page reading the database may take.
 *
 * Longer than the five seconds Playwright waits by default, for the reason
 * `tests/e2e/conferences.spec.ts` gives: every test in the run asks the one
 * local database at once, and an answer has taken up to eight seconds.
 */
const DATABASE_TIMEOUT_MS = 15_000;

/**
 * How long a single try inside a retrying block may take.
 *
 * Short on purpose: the block around it is what waits, and a try that waited
 * the full fifteen seconds would only ever run once.
 */
const SINGLE_TRY_TIMEOUT_MS = 2_000;

/**
 * The days every conference these tests create runs on.
 *
 * Both are in the past, for the reason at the top of this file. The allocation
 * functions an organiser calls do not care what day it is — only the narrow
 * write a delegation head is allowed does, and no test here is a head.
 */
const CONFERENCE_FIRST_DAY = '2020-05-03';
const CONFERENCE_LAST_DAY = '2020-05-05';

/**
 * How many windows tall the allocation grid may be with a real conference on
 * it. Three, which is the ceiling every other organiser page in this
 * repository is held to.
 */
const MANAGE_ALLOCATION_SCREENS = 3;

/** How many committees the desktop test puts on the page to make the grid too wide for it. */
const COMMITTEES_FOR_THE_WIDTH_TEST = 8;

/** How many seats each of those committees gets. */
const SEATS_PER_WIDTH_TEST_COMMITTEE = 6;

// -----------------------------------------------------------------------------
// The words on the controls
// -----------------------------------------------------------------------------
// The spec fixes the wording of the three menu items and of every flash, but
// not of the buttons inside the panels those items open. These four are this
// file's guess at them, gathered here so that whoever owns the markup has one
// place to correct rather than a dozen assertions to hunt through.

/** The link in a seat's menu that opens the move panel. */
const MOVE_LINK_LABEL = 'Move delegate';

/** The submit button of the move panel, which says more than the menu item does. */
const MOVE_BUTTON_LABEL = 'Move the delegate';

/** The `ConfirmButton` in the panel that frees a seat. */
const FREE_BUTTON_LABEL = 'Free the seat';

/** The `ConfirmButton` in the panel that hides a seat. */
const HIDE_BUTTON_LABEL = 'Hide the seat';

/** What that same button says once the seat is already hidden. */
const SHOW_BUTTON_LABEL = 'Make it available again';

/**
 * A name nothing else in the database will match, so that a test can read its
 * own conference's page without another run's rows getting in the way.
 */
function unusedName(prefix: string): string {
	return `${prefix} ${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * A join code for the delegation this file writes straight into the table.
 *
 * A copy of the one in `tests/e2e/manage-delegations.spec.ts`, and here for the
 * same reason: `create_delegation` mints a code of its own, but the delegation
 * below is written with the service-role client, which walks past that function
 * altogether, and `delegations.join_code` is `not null unique`.
 */
function unusedJoinCode(): string {
	const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	const characters: string[] = [];

	for (let position = 0; position < 8; position += 1) {
		characters.push(alphabet[Math.floor(Math.random() * alphabet.length)]);
	}

	return characters.join('');
}

/** What `createDraftConference` names the new conference and its organisation. */
type NewConference = {
	/** The conference's name. */
	name: string;
	/** The name of the new organisation, which the account owns. */
	organizationName: string;
};

/**
 * Give `user` a draft conference of its own, run by a brand-new organisation,
 * and answer its `/manage/<slug>` address.
 *
 * The rows are written straight into the database by `./draft-conference`,
 * whose comment says why: the one-step `/create` form these tests used to fill
 * in is gone, and the creation flow that replaced it has its own
 * `create-*.spec.ts` files.
 */
async function createDraftConference(user: TestUser, conference: NewConference): Promise<string> {
	const draft = await createDraftConferenceFor(user, {
		name: conference.name,
		organizationName: conference.organizationName,
		startDate: CONFERENCE_FIRST_DAY,
		endDate: CONFERENCE_LAST_DAY
	});

	return `/manage/${draft.slug}`;
}

/** The slug at the end of a `/manage/<slug>` address. */
function slugOf(managePath: string): string {
	return managePath.split('/').pop() ?? '';
}

/**
 * The id of the conference a `/manage/<slug>` address names. `./draft-conference`
 * makes the slug with a random suffix, so the id can only be looked up afterwards.
 */
async function readConferenceId(slug: string): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('conferences')
		.select('id')
		.eq('slug', slug)
		.maybeSingle();

	if (error || !data) {
		throw new Error(`Could not find the conference "${slug}": ${error?.message}`);
	}

	return data.id;
}

/** A signed-in organiser with a conference of their own, ready for a test to work on. */
type TestConference = {
	user: TestUser;
	id: string;
	slug: string;
	name: string;
	/** The `/manage/<slug>` address its organiser pages are built on. */
	managePath: string;
	/** The `/manage/<slug>/allocation` address this file is about. */
	allocationPath: string;
};

/** Sign a brand-new account in and give it a conference of its own. */
async function signInWithAConference(page: Page, prefix: string): Promise<TestConference> {
	const user = await createTestUser('Priya Nair');
	await signIn(page, user);

	const name = unusedName(prefix);
	const organizationName = unusedName(`${prefix} Society`);
	const managePath = await createDraftConference(user, { name, organizationName });
	const slug = slugOf(managePath);
	const id = await readConferenceId(slug);

	return {
		user,
		id,
		slug,
		name,
		managePath,
		allocationPath: `${managePath}/allocation`
	};
}

/**
 * Give the conference one committee, and answer its id.
 *
 * Committees are T02's form and are not what this page is about, so the
 * service-role client writes the row, the way `addCommittee` in
 * `tests/e2e/manage-delegations.spec.ts` does. It is never used to show that
 * something is allowed.
 */
async function addCommittee(
	conferenceId: string,
	name: string,
	abbreviation: string,
	position: number
): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('committees')
		.insert({
			conference_id: conferenceId,
			name,
			abbreviation,
			// A slug is unique within the conference, and a random one keeps two
			// committees of the same test from clashing.
			slug: `committee-${crypto.randomUUID().slice(0, 8)}`,
			level: 'intermediate',
			topics: [],
			position
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test committee: ${error?.message}`);
	}

	return data.id;
}

/** One seat a test wants in a committee. Everything not named here is the column default. */
type SeatSeed = {
	/** Unique within its committee, and what the grid draws on the cell. */
	name: string;
	/** Two letters, for the flag beside a country seat. */
	countryCode: string;
	position: number;
	/** `false` is a hidden seat. The column defaults to `true`. */
	isAvailable?: boolean;
	/** Set on a seat reserved for a group, whether or not anybody is sitting in it. */
	delegationId?: string;
	/** The person sitting in the seat. */
	userId?: string;
	/** The accepted application an individual got the seat with. */
	applicationId?: string;
};

/**
 * Write a committee's seats straight into the table, and answer their ids by
 * name.
 *
 * Seats are T02's form and allocation is `allocate_delegation_seats`, neither
 * of which this page uses to *make* a seat, so the service-role client writes
 * the rows the way `allocateSeats` in `tests/e2e/manage-delegations.spec.ts`
 * does. `check_seat_allocation` still fires for everybody: an application has to
 * belong to this conference, a delegation has to as well, somebody sitting in a
 * reserved seat has to be a member of that delegation, and nobody may hold two
 * seats in one conference.
 */
async function addSeats(committeeId: string, seeds: SeatSeed[]): Promise<Map<string, string>> {
	const admin = createServiceRoleClient();
	const now = new Date().toISOString();

	const rows = seeds.map((seed) => ({
		committee_id: committeeId,
		name: seed.name,
		country_code: seed.countryCode,
		position: seed.position,
		is_available: seed.isAvailable ?? true,
		delegation_id: seed.delegationId ?? null,
		user_id: seed.userId ?? null,
		application_id: seed.applicationId ?? null,
		// The column means "when user_id or delegation_id was last set", so a seat
		// that has neither has never been allocated.
		allocated_at: seed.delegationId || seed.userId ? now : null
	}));

	const { data, error } = await admin.from('seats').insert(rows).select('id, name');

	if (error || !data) {
		throw new Error(`Could not write the test seats: ${error?.message}`);
	}

	return new Map(data.map((row) => [row.name as string, row.id as string]));
}

/**
 * Write one accepted delegation straight into the table, and answer its id.
 *
 * The service-role client writes it, the way `addDelegation` in
 * `tests/e2e/manage-delegations.spec.ts` does and for the same reason:
 * `guard_delegation_insert` only runs for the two roles a browser uses, so a
 * seeded `accepted` row is possible at all only because the service role walks
 * past it.
 */
async function addAcceptedDelegation(
	conferenceId: string,
	name: string,
	requestedSeats: number
): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('delegations')
		.insert({
			conference_id: conferenceId,
			name,
			institution_name: 'Riverside High School',
			country_code: 'PL',
			status: 'accepted',
			requested_seats: requestedSeats,
			join_code: unusedJoinCode(),
			submitted_at: new Date().toISOString()
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test delegation: ${error?.message}`);
	}

	return data.id;
}

/**
 * Put one account in the delegation as an ordinary member.
 *
 * `check_one_route_per_conference` fires for everybody, including this, so an
 * account may be in at most one delegation per conference and may not have
 * applied to the same conference as an individual.
 */
async function addDelegationMember(delegationId: string, user: TestUser): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('delegation_members')
		.insert({ delegation_id: delegationId, user_id: user.id, role: 'member' });

	if (error) {
		throw new Error(`Could not put the test account in the delegation: ${error.message}`);
	}
}

/**
 * Raise one invoice for a seat, paid or unpaid, and answer its id.
 *
 * The service-role client writes it, the way `addDelegationInvoice` in
 * `tests/e2e/manage-delegations.spec.ts` does. It walks past
 * `guard_invoice_insert`, which is what normally fills the number, the currency
 * and the status in, so all three are given here. `check_invoice_transition`
 * only fires on an update, which is why a row may be born `paid`.
 */
async function addSeatInvoice(
	conferenceId: string,
	seatId: string,
	payer: TestUser,
	status: 'unpaid' | 'paid'
): Promise<string> {
	const admin = createServiceRoleClient();
	const now = new Date().toISOString();

	const { data, error } = await admin
		.from('invoices')
		.insert({
			conference_id: conferenceId,
			// `invoices.number` is unique across the whole table. The letter on the
			// end keeps the digits of a random id from reading as a number
			// `next_invoice_number` would count on from.
			number: `e2e-${crypto.randomUUID()}-n`,
			payer_user_id: payer.id,
			seat_id: seatId,
			description: 'Delegate fee',
			quantity: 1,
			unit_amount_cents: 6500,
			amount_cents: 6500,
			currency: 'EUR',
			status,
			paid_at: status === 'paid' ? now : null
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test invoice: ${error?.message}`);
	}

	return data.id;
}

/** What one seat row holds, as the tests below read it back. */
type SeatRow = {
	is_available: boolean;
	user_id: string | null;
	delegation_id: string | null;
	application_id: string | null;
};

/**
 * Read one seat back with the service-role client.
 *
 * Reading the row rather than the page is the only way to see what an action
 * really did: a page that draws an empty cell has not necessarily cleared
 * anything, and `revoke_seat` changes three tables at once.
 */
async function readSeat(seatId: string): Promise<SeatRow> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('seats')
		.select('is_available, user_id, delegation_id, application_id')
		.eq('id', seatId)
		.single();

	if (error || !data) {
		throw new Error(`Could not read the test seat back: ${error?.message}`);
	}

	return data as SeatRow;
}

/** The status of one application, read back with the service-role client. */
async function readApplicationStatus(applicationId: string): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('applications')
		.select('status')
		.eq('id', applicationId)
		.single();

	if (error || !data) {
		throw new Error(`Could not read the test application back: ${error?.message}`);
	}

	return data.status as string;
}

/** What one invoice row holds, as the tests below read it back. */
type InvoiceRow = {
	status: string;
	seat_id: string | null;
};

/** Read one invoice back with the service-role client. */
async function readInvoice(invoiceId: string): Promise<InvoiceRow> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('invoices')
		.select('status, seat_id')
		.eq('id', invoiceId)
		.single();

	if (error || !data) {
		throw new Error(`Could not read the test invoice back: ${error?.message}`);
	}

	return data as InvoiceRow;
}

/** Change how many seats the delegation asked for, which is what draws the warning. */
async function setRequestedSeats(delegationId: string, requestedSeats: number): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('delegations')
		.update({ requested_seats: requestedSeats })
		.eq('id', delegationId);

	if (error) {
		throw new Error(`Could not change what the test delegation asked for: ${error.message}`);
	}
}

/**
 * Post to one of the page's form actions the way a browser posts a form.
 *
 * A button the page never drew proves only what the page did; several of the
 * refusals below are the action's own, so these tests ask it directly.
 * `page.request` carries the browser's own cookies, so the post arrives signed
 * in as the account the test signed in. Two headers are written by hand.
 * `origin`, because SvelteKit refuses a form post that looks as though it came
 * from another website and Playwright's request does not send that header
 * itself. And `accept: text/html`, because that is how SvelteKit tells a form
 * post from a page with no JavaScript from one made by `use:enhance`: without
 * it the answer is the action's result as JSON under a 200, and with it the
 * page is drawn again carrying the status the action chose, which is what a
 * browser with no script really receives and so what these tests are about.
 */
async function postFormAction(
	page: Page,
	action: string,
	fields: Record<string, string> = {}
): Promise<APIResponse> {
	const origin = new URL(page.url()).origin;

	return page.request.post(action, {
		form: fields,
		headers: { origin, accept: 'text/html' }
	});
}

/**
 * Press a `ConfirmButton` and answer the question it asks.
 *
 * With JavaScript the button opens a `<dialog>` holding a second button with
 * the same words on it; without it the press opens a confirmation page asking
 * the same question, whose own button is what posts. Both are real, so this
 * handles both.
 */
async function pressAndConfirm(page: Page, label: string): Promise<void> {
	// The dialog holds a second button with the same words on it, so the one in
	// the page itself is the first of the two. While the dialog is shut the
	// browser hides everything inside it, so until then there is only one.
	const button = page.getByRole('main').getByRole('button', { name: label }).first();
	const dialogButton = page.getByRole('dialog').getByRole('button', { name: label });

	await button.press('Enter');

	// `waitFor` throws when nothing turns up in the time it is given, and that is
	// the "no dialog, so no script" answer: the press opened the confirmation page
	// instead.
	const isAsking = await dialogButton
		.waitFor({ state: 'visible', timeout: SINGLE_TRY_TIMEOUT_MS })
		.then(() => true)
		.catch(() => false);

	if (isAsking) {
		await dialogButton.press('Enter');
	} else {
		await answerConfirmationPage(page, label);
	}
}

/** Only the elements with these words on them that a reader can really see. */
function shownText(main: Locator, text: string): Locator {
	return main.getByText(text, { exact: true }).filter({ visible: true });
}

/** Which count of the line under the title to read, and the words it is written with. */
const SUMMARY_COUNT_PATTERNS = {
	seats: /(\d+) seats?\b/,
	free: /(\d+) free\b/,
	held: /(\d+) held for\b/,
	filled: /(\d+) filled\b/
};

/**
 * One count from the line under the page's title, such as the 9 in
 * "11 seats · 9 filled · 1 held for a delegation · 1 free".
 *
 * The line is found by the way it starts, a number of seats and a dot, so
 * that a free seat's "Free" or a column's "4 of 4 filled" further down the
 * page is never read in its place. Each count is then picked out of it by the
 * words that follow the number.
 */
async function readSummaryCount(
	main: Locator,
	count: keyof typeof SUMMARY_COUNT_PATTERNS
): Promise<number> {
	const line = main.getByText(/^\d+ seats? ·/).first();

	await expect(line).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	const written = await line.innerText();
	const found = written.match(SUMMARY_COUNT_PATTERNS[count]);

	if (found === null) {
		throw new Error(`The line under the title has no "${count}" count: ${written}`);
	}

	return Number(found[1]);
}

/**
 * The seat cells the grid is drawing.
 *
 * A seat is a list item that carries its own menu, which is exactly what
 * `SeatCell.svelte` draws: an `<li>` with a `Dropdown` in it. A `Dropdown` is
 * built from a `<details>` element, and `<details>` has the ARIA role `group`,
 * so that pair is what tells a seat cell apart from any other list item on the
 * page. `getByRole` skips anything hidden, which matters here because the page
 * draws both of its layouts at once and hides one of them with CSS: on a
 * desktop this counts the cells in the columns and not their copies in the
 * phone sections, and on a phone it counts the seats in whichever committee
 * sections are unfolded. The test that counts cells says so and runs on a
 * desktop alone.
 */
function seatCells(page: Page): Locator {
	return page
		.getByRole('main')
		.getByRole('listitem')
		.filter({ has: page.getByRole('group') });
}

/** How many cells are left on the grid once this query has narrowed it. */
async function countCells(page: Page, conference: TestConference, query: string): Promise<number> {
	await openTheGrid(page, conference, query);

	return seatCells(page).count();
}

/**
 * Open the allocation grid and wait until it has really arrived.
 *
 * Waiting for the heading rather than simply for the address is what says the
 * page is there: a test that read too early would read the page it was leaving. The heading is looked for inside `<main>` because the organiser
 * sidebar beside it carries a link with the same word on it.
 */
async function openTheGrid(page: Page, conference: TestConference, query = ''): Promise<void> {
	await page.goto(`${conference.allocationPath}${query}`);

	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Allocation', {
		timeout: DATABASE_TIMEOUT_MS
	});
}

/**
 * The conference one test works on: two committees, six seats between them, and
 * one of every state a cell can be in.
 *
 * | Committee | Seat    | State                                        |
 * | --------- | ------- | -------------------------------------------- |
 * | ECOFIN    | Brazil  | free                                         |
 * | ECOFIN    | Chile   | hidden                                       |
 * | ECOFIN    | Denmark | reserved for the delegation, nobody in it    |
 * | ECOFIN    | Egypt   | filled by a member of the delegation         |
 * | WHO       | France  | filled by an individual, with an invoice     |
 * | WHO       | Ghana   | free                                         |
 *
 * So the counts at the top are six seats, two free, one reserved and two
 * filled, with the hidden one left over. Moving the individual out of France
 * and into Brazil is the flash `specs/05-pages/organiser/allocation.md` writes
 * out word for word, which is why the seats are named after countries in
 * alphabetical order and the committees after real ones.
 */
type AllocationFixture = {
	conference: TestConference;
	/** The committee the four ECOFIN seats are in. */
	ecofinId: string;
	/** The committee the two WHO seats are in. */
	whoId: string;
	delegationId: string;
	/** The account sitting in Egypt, through the delegation. */
	member: TestUser;
	/** The account sitting in France, through an accepted application of their own. */
	individual: TestUser;
	/** That application, which freeing the seat has to reject. */
	individualApplicationId: string;
	/** The invoice for that seat, which freeing has to void and moving has to carry over. */
	individualInvoiceId: string;
	/** Seat ids by seat name, for every seat in the table above. */
	seats: Map<string, string>;
};

/** What the fixture lets one test change about itself. */
type FixtureOptions = {
	/** Whether the individual's seat has been paid for. Freeing treats the two differently. */
	individualInvoiceStatus?: 'unpaid' | 'paid';
	/** How many seats the delegation asked the organisers for. Two is what it holds. */
	requestedSeats?: number;
};

/** How many seats the delegation holds in the fixture above: Denmark and Egypt. */
const SEATS_THE_DELEGATION_HOLDS = 2;

/** Build the conference in the table above. */
async function seedAllocationGrid(
	page: Page,
	prefix: string,
	options: FixtureOptions = {}
): Promise<AllocationFixture> {
	const conference = await signInWithAConference(page, prefix);

	const ecofinId = await addCommittee(
		conference.id,
		'Economic and Financial Committee',
		'ECOFIN',
		0
	);
	const whoId = await addCommittee(conference.id, 'World Health Organization', 'WHO', 1);

	const delegationId = await addAcceptedDelegation(
		conference.id,
		unusedName('Riverside School Delegation'),
		options.requestedSeats ?? SEATS_THE_DELEGATION_HOLDS
	);

	const member = await createTestUser('Mateusz Zielinski');
	await addDelegationMember(delegationId, member);

	const individual = await createTestUser('Anna Kowalski');
	const individualApplicationId = await giveApplication(individual, {
		conferenceId: conference.id,
		status: 'accepted',
		committeePreferences: [whoId],
		motivation: 'I have chaired two health committees and would like a third.'
	});

	const ecofinSeats = await addSeats(ecofinId, [
		{ name: 'Brazil', countryCode: 'BR', position: 0 },
		{ name: 'Chile', countryCode: 'CL', position: 1, isAvailable: false },
		{ name: 'Denmark', countryCode: 'DK', position: 2, delegationId },
		{ name: 'Egypt', countryCode: 'EG', position: 3, delegationId, userId: member.id }
	]);

	const whoSeats = await addSeats(whoId, [
		{
			name: 'France',
			countryCode: 'FR',
			position: 0,
			userId: individual.id,
			applicationId: individualApplicationId
		},
		{ name: 'Ghana', countryCode: 'GH', position: 1 }
	]);

	const seats = new Map([...ecofinSeats, ...whoSeats]);
	const individualInvoiceId = await addSeatInvoice(
		conference.id,
		seatId(seats, 'France'),
		individual,
		options.individualInvoiceStatus ?? 'unpaid'
	);

	return {
		conference,
		ecofinId,
		whoId,
		delegationId,
		member,
		individual,
		individualApplicationId,
		individualInvoiceId,
		seats
	};
}

/** The id of one of the fixture's seats, by the name the grid draws on it. */
function seatId(seats: Map<string, string>, name: string): string {
	const found = seats.get(name);

	if (found === undefined) {
		throw new Error(`The fixture has no seat called "${name}"`);
	}

	return found;
}

/**
 * Says the grid is drawing a cell for this seat.
 *
 * Counted rather than asserted visible, because on a phone the committee the
 * seat is in may be folded shut and a folded seat is still a seat the page
 * drew. The tests about what a reader can really see are the shape tests at the
 * bottom.
 */
async function expectSeatOnTheGrid(main: Locator, name: string): Promise<void> {
	await expect(main.getByText(name, { exact: true }).first()).toBeAttached({
		timeout: DATABASE_TIMEOUT_MS
	});
}

/** Says the grid is drawing no cell for this seat at all. */
async function expectSeatOffTheGrid(main: Locator, name: string): Promise<void> {
	await expect(main.getByText(name, { exact: true })).toHaveCount(0);
}

/**
 * The values in the move panel's seat picker, which is the list of seats this
 * delegate may be moved to.
 *
 * `toSeatId` is the name the spec gives the `<select>`, so it is the one thing
 * about the form this file does not have to guess.
 */
async function seatPickerValues(main: Locator): Promise<string[]> {
	const options = main.locator('select[name="toSeatId"] option');

	await expect(options.first()).toBeAttached({ timeout: DATABASE_TIMEOUT_MS });

	return options.evaluateAll((elements) =>
		elements.map((element) => (element as HTMLOptionElement).value)
	);
}

/**
 * The addresses of every "Move delegate" item in the seat menus.
 *
 * The items in a seat's menu are links and not buttons, which is what lets a
 * panel open without a script, so where they point is the whole of what they
 * do. They are read with `includeHidden` because a `Dropdown` is a `<details>`
 * and a shut `<details>` hides everything inside it, and because the page
 * draws its desktop and phone layouts at once and hides one of them.
 *
 * The addresses carry the seat id, so which seats a menu line is offered for
 * is read off them.
 */
async function menuLinkAddresses(main: Locator, label: string): Promise<string[]> {
	const links = main.getByRole('link', { name: label, includeHidden: true });

	// `toBeAttached` waits for the grid without asking to see a shut menu.
	await expect(links.first()).toBeAttached({ timeout: DATABASE_TIMEOUT_MS });

	return links.evaluateAll((elements) =>
		elements.map((element) => element.getAttribute('href') ?? '')
	);
}

/** How wide something is, and how wide it would have to be to show all of itself. */
type ScrollSize = {
	scrollWidth: number;
	clientWidth: number;
};

/**
 * The nearest element above this one that scrolls sideways, measured.
 *
 * A copy of the helper in `tests/e2e/landing.spec.ts`, and here for the same
 * reason: it finds the container by what it does rather than by its class name.
 * `scrollWidth` is how wide its contents are and `clientWidth` how much of that
 * is on screen, so the first being larger is what "this row scrolls sideways"
 * means.
 */
async function scrollingRowAround(locator: Locator): Promise<ScrollSize> {
	const row = await locator.evaluate((element) => {
		let candidate = element.parentElement;

		while (candidate !== null) {
			const overflowX = getComputedStyle(candidate).overflowX;

			if (overflowX === 'auto' || overflowX === 'scroll') {
				return { scrollWidth: candidate.scrollWidth, clientWidth: candidate.clientWidth };
			}

			candidate = candidate.parentElement;
		}

		return null;
	});

	if (row === null) {
		throw new Error('Nothing above the seat cells scrolls sideways.');
	}

	return row;
}

/*
	Every test here signs a brand-new account in, seeds a draft conference,
	seeds a conference with committees, seats, a delegation and two delegates,
	and then works through the page. That is a great deal more than most browser
	tests do, and thirty seconds — what Playwright allows a test by default — is
	not always enough for it while the whole suite is asking the one local
	database at once. `test.slow()` triples that allowance. It is an allowance
	and not a wait: a test that is quick still finishes as quickly as it can.
*/
test.beforeEach(() => {
	test.slow();
});

test('counts every seat, and every state, exactly as many times as the grid draws it', async ({
	page
}, testInfo) => {
	test.skip(
		testInfo.project.name === 'phone',
		'A phone folds the committees away, so what is on screen there is what somebody unfolded.'
	);

	const fixture = await seedAllocationGrid(page, 'Counting Allocation MUN');

	await openTheGrid(page, fixture.conference);

	const main = page.getByRole('main');

	// Read the counts under the title first. They are counts of the whole
	// conference and not of the filtered grid, so they stay put while the
	// filters below change what is under them.
	const seatsShown = await readSummaryCount(main, 'seats');
	const freeShown = await readSummaryCount(main, 'free');
	const reservedShown = await readSummaryCount(main, 'held');
	const filledShown = await readSummaryCount(main, 'filled');

	// The fixture wrote six seats, so a page that draws nothing and counts
	// nothing cannot pass the comparisons below by agreeing with itself.
	expect(seatsShown).toBe(fixture.seats.size);
	expect(await seatCells(page).count()).toBe(seatsShown);

	// And each count equals the cells that are left when the grid is narrowed to
	// that one state, which is the criterion in its own words.
	expect(await countCells(page, fixture.conference, '?state=free')).toBe(freeShown);
	expect(await countCells(page, fixture.conference, '?state=reserved')).toBe(reservedShown);
	expect(await countCells(page, fixture.conference, '?state=filled')).toBe(filledShown);

	// The hidden seats are counted only when there are some, so they are read
	// as what is left over.
	// Without this a page that quietly dropped the hidden seat from both the
	// count and the grid would still pass everything above.
	const hiddenCells = await countCells(page, fixture.conference, '?state=hidden');

	expect(freeShown + reservedShown + filledShown + hiddenCells).toBe(seatsShown);
	expect(hiddenCells).toBeGreaterThan(0);
});

test('narrows the grid by committee, by state and by the name of the delegate in the seat', async ({
	page
}) => {
	const fixture = await seedAllocationGrid(page, 'Filtering Allocation MUN');

	const main = page.getByRole('main');

	// One committee. The other committee's seats are gone altogether, which is
	// what "narrows to one column" means.
	await openTheGrid(page, fixture.conference, `?committee=${fixture.ecofinId}`);
	await expectSeatOnTheGrid(main, 'Brazil');
	await expectSeatOffTheGrid(main, 'France');
	await expectSeatOffTheGrid(main, 'Ghana');

	// One state. Both free seats stay and nothing else does, across both
	// committees.
	await openTheGrid(page, fixture.conference, '?state=free');
	await expectSeatOnTheGrid(main, 'Brazil');
	await expectSeatOnTheGrid(main, 'Ghana');
	await expectSeatOffTheGrid(main, 'France');
	await expectSeatOffTheGrid(main, 'Egypt');
	await expectSeatOffTheGrid(main, 'Denmark');

	// A delegate's name. The search reads the person in the seat as well as the
	// seat itself, so the one seat Anna Kowalski is sitting in is all that is
	// left.
	await openTheGrid(page, fixture.conference, '?q=Kowalski');
	await expectSeatOnTheGrid(main, 'France');
	await expectSeatOffTheGrid(main, 'Brazil');
	await expectSeatOffTheGrid(main, 'Ghana');

	// A search nothing matches says so rather than drawing an empty grid. The
	// first of them, because a page that says it once per column is as right as
	// one that says it once.
	await openTheGrid(page, fixture.conference, '?q=Nobody+Of+That+Name');
	await expect(main.getByText('No seats match these filters.').first()).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// And "Reset" goes back to the plain address, which is the whole of the
	// page's state: no committee, no state and no search.
	await main.getByRole('link', { name: 'Reset' }).click();

	await expect(page).toHaveURL(fixture.conference.allocationPath, {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expectSeatOnTheGrid(main, 'Brazil');
	await expectSeatOnTheGrid(main, 'France');
});

test("frees an individual's seat, rejects their application and voids the unpaid invoice", async ({
	page
}) => {
	const fixture = await seedAllocationGrid(page, 'Freeing Allocation MUN', {
		individualInvoiceStatus: 'unpaid'
	});

	const franceId = seatId(fixture.seats, 'France');

	// `?seat=<id>&action=free` is the whole of the panel's state, so opening it
	// is a visit rather than a click. The test below about the move panel is
	// where that is the point; here it is only the quickest way in.
	await openTheGrid(page, fixture.conference, `?seat=${franceId}&action=free`);
	await pressAndConfirm(page, FREE_BUTTON_LABEL);

	// The flash floats outside `<main>`, so it is looked for on the page itself.
	await expect(page.getByText('Seat freed and the unpaid invoice voided.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// Three rows in three tables, read back with the service-role client because
	// no page shows all three: the seat is empty, the application the seat was
	// given for is rejected, and the invoice for it is void.
	const seat = await readSeat(franceId);

	expect(seat.user_id).toBeNull();
	expect(seat.application_id).toBeNull();

	expect(await readApplicationStatus(fixture.individualApplicationId)).toBe('rejected');
	expect((await readInvoice(fixture.individualInvoiceId)).status).toBe('void');
});

test('leaves a paid invoice alone when the seat is freed, and says so', async ({ page }) => {
	const fixture = await seedAllocationGrid(page, 'Paid Invoice Allocation MUN', {
		individualInvoiceStatus: 'paid'
	});

	const franceId = seatId(fixture.seats, 'France');

	await openTheGrid(page, fixture.conference, `?seat=${franceId}&action=free`);
	await pressAndConfirm(page, FREE_BUTTON_LABEL);

	await expect(
		page.getByText(
			'Seat freed. The paid invoice is untouched, so refund it on the fees page if you mean to.'
		)
	).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	// Money that really moved is not undone by an organiser freeing a seat. The
	// application is still rejected, because that half is the same either way.
	expect((await readInvoice(fixture.individualInvoiceId)).status).toBe('paid');
	expect(await readApplicationStatus(fixture.individualApplicationId)).toBe('rejected');
	expect((await readSeat(franceId)).user_id).toBeNull();
});

test('refuses to free a seat that nobody is sitting in and nobody has reserved', async ({
	page
}) => {
	const fixture = await seedAllocationGrid(page, 'Already Free Allocation MUN');

	const brazilId = seatId(fixture.seats, 'Brazil');

	await openTheGrid(page, fixture.conference);

	// Asked of the action itself rather than through a panel. The grid may never
	// draw a free seat's "Free the seat" panel at all, and a control the page did
	// not draw proves nothing about what the action would have done.
	const response = await postFormAction(page, `${fixture.conference.allocationPath}?/freeSeat`, {
		seatId: brazilId,
		confirm: '1'
	});

	expect(await response.text()).toContain('This seat is already free.');

	// And the refusal is the whole point, so the seat is exactly where it was.
	const seat = await readSeat(brazilId);

	expect(seat.user_id).toBeNull();
	expect(seat.delegation_id).toBeNull();
	expect(seat.is_available).toBe(true);
});

test('moves a delegate, and their application and their unpaid invoice go with them', async ({
	page
}) => {
	const fixture = await seedAllocationGrid(page, 'Moving Allocation MUN');

	const franceId = seatId(fixture.seats, 'France');
	const brazilId = seatId(fixture.seats, 'Brazil');

	await openTheGrid(page, fixture.conference, `?seat=${franceId}&action=move`);

	const main = page.getByRole('main');

	await main.locator('select[name="toSeatId"]').selectOption(brazilId);
	await main.getByRole('button', { name: MOVE_BUTTON_LABEL }).press('Enter');

	// The flash names the person, the seat they landed in and the committee that
	// seat belongs to, so that an organiser who moved the wrong delegate sees it
	// at once. `committeeHeading` prefers the abbreviation, which is "ECOFIN".
	await expect(page.getByText('Anna Kowalski moved to Brazil in ECOFIN.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// The seat they left is empty, and everything that made them a delegate is on
	// the seat they arrived in: the person, the accepted application the seat was
	// given for, and the invoice raised against the old seat.
	const from = await readSeat(franceId);

	expect(from.user_id).toBeNull();
	expect(from.application_id).toBeNull();

	const to = await readSeat(brazilId);

	expect(to.user_id).toBe(fixture.individual.id);
	expect(to.application_id).toBe(fixture.individualApplicationId);

	const invoice = await readInvoice(fixture.individualInvoiceId);

	expect(invoice.seat_id).toBe(brazilId);
	expect(invoice.status).toBe('unpaid');

	// The application is still accepted. Moving somebody is not deciding about
	// them again, which is what tells this apart from freeing the seat.
	expect(await readApplicationStatus(fixture.individualApplicationId)).toBe('accepted');
});

test('draws the move form on the page itself, opened by the address and not by a script', async ({
	page
}) => {
	const fixture = await seedAllocationGrid(page, 'No Script Allocation MUN');

	const franceId = seatId(fixture.seats, 'France');
	const brazilId = seatId(fixture.seats, 'Brazil');

	await openTheGrid(page, fixture.conference);

	const main = page.getByRole('main');

	// The menu item that opens the panel is a link, and it points at the seat it
	// belongs to and the panel it opens. Nothing on this page is a button that
	// only a script could make useful.
	const addresses = await menuLinkAddresses(main, MOVE_LINK_LABEL);
	const opensTheFranceSeat = addresses.some(
		(address) => address.includes(`seat=${franceId}`) && address.includes('action=move')
	);

	expect(opensTheFranceSeat).toBe(true);

	// Straight to that address, with nothing clicked and no dialog opened. The
	// form has to be in the page the server sent, or a browser with no script
	// could never move anybody.
	await openTheGrid(page, fixture.conference, `?seat=${franceId}&action=move`);

	// `seatId` and `toSeatId` are the two names the spec gives the form, so they
	// are looked for by name. The hidden one carries the seat the address named,
	// which is what says the panel opened on the right seat.
	await expect(main.locator('form input[name="seatId"]').first()).toHaveValue(franceId, {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(main.locator('select[name="toSeatId"]')).toBeVisible();
	await expect(main.getByRole('button', { name: MOVE_BUTTON_LABEL })).toBeVisible();

	// The same address for a seat nobody is sitting in is a refusal and not a
	// form, because there is nobody to move out of it.
	await openTheGrid(page, fixture.conference, `?seat=${brazilId}&action=move`);

	await expect(shownText(main, 'There is nobody in this seat to move.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(main.locator('select[name="toSeatId"]')).toHaveCount(0);
});

test('hides a free seat, keeps it out of the seat picker, and brings it back', async ({ page }) => {
	const fixture = await seedAllocationGrid(page, 'Hiding Allocation MUN');

	const brazilId = seatId(fixture.seats, 'Brazil');
	const ghanaId = seatId(fixture.seats, 'Ghana');
	const franceId = seatId(fixture.seats, 'France');

	await openTheGrid(page, fixture.conference, `?seat=${brazilId}&action=hide`);
	await pressAndConfirm(page, HIDE_BUTTON_LABEL);

	await expect(page.getByText('Seat hidden.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	expect((await readSeat(brazilId)).is_available).toBe(false);

	// A hidden seat is a seat the organisers have taken out of play, so nothing
	// may offer it to anybody. The move panel's picker is the seat picker this
	// page owns; the criterion is about every one of them.
	await openTheGrid(page, fixture.conference, `?seat=${franceId}&action=move`);

	const main = page.getByRole('main');
	const offered = await seatPickerValues(main);

	expect(offered).not.toContain(brazilId);
	// And the other free seat is still on offer, so the picker did not simply
	// come back empty.
	expect(offered).toContain(ghanaId);

	// Nobody is in the hidden seat, so there is nothing in it to free and its
	// menu says so by not offering the line. A seat somebody is sitting in
	// still offers it, so the line did not simply disappear from the page.
	await openTheGrid(page, fixture.conference);

	const freeAddresses = await menuLinkAddresses(main, FREE_BUTTON_LABEL);

	expect(freeAddresses.some((address) => address.includes(`seat=${brazilId}`))).toBe(false);
	expect(freeAddresses.some((address) => address.includes(`seat=${franceId}`))).toBe(true);

	// And the panel behind that address, which can still be typed in, refuses it
	// in these words rather than in the ones anything further down would use.
	// `freeSeat` in `$lib/server/allocation-grid.ts` throws for a seat holding neither a
	// person nor a delegation, and its sentence is not one the action knows how
	// to reword, so reaching it would answer "Something went wrong" instead.
	await openTheGrid(page, fixture.conference, `?seat=${brazilId}&action=free`);
	await pressAndConfirm(page, FREE_BUTTON_LABEL);

	// The refusal answers in place (T125): the panel that asked closes and a
	// toast takes its place, both carrying this same sentence. Without waiting
	// here the page can be caught with the closing panel and the new toast on
	// screen at once, which `getByText` refuses to treat as one thing.
	await waitUntilAnswered(page);
	await expect(page.getByText('This seat is already free.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect((await readSeat(brazilId)).is_available).toBe(false);

	// The same menu item reads the other way round once the seat is hidden, and
	// puts it back.
	await openTheGrid(page, fixture.conference, `?seat=${brazilId}&action=hide`);
	await pressAndConfirm(page, SHOW_BUTTON_LABEL);

	await expect(page.getByText('Seat available again.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect((await readSeat(brazilId)).is_available).toBe(true);
});

test('refuses to hide a seat somebody is sitting in, or one a delegation is holding', async ({
	page
}) => {
	const fixture = await seedAllocationGrid(page, 'Hiding Refusal Allocation MUN');

	const franceId = seatId(fixture.seats, 'France');
	const denmarkId = seatId(fixture.seats, 'Denmark');

	await openTheGrid(page, fixture.conference);

	const actionUrl = `${fixture.conference.allocationPath}?/toggleHidden`;

	// Hiding a seat that is not empty would take a delegate off the grid while
	// leaving them in it, so the action refuses both cases: the filled seat and
	// the one reserved for a delegation.
	const filled = await postFormAction(page, actionUrl, { seatId: franceId, confirm: '1' });

	expect(await filled.text()).toContain('Free the seat before hiding it.');
	expect((await readSeat(franceId)).is_available).toBe(true);

	const reserved = await postFormAction(page, actionUrl, { seatId: denmarkId, confirm: '1' });

	expect(await reserved.text()).toContain('Free the seat before hiding it.');
	expect((await readSeat(denmarkId)).is_available).toBe(true);

	// So neither seat's menu offers the line (T93). The free seat still does,
	// so the line did not simply disappear from the page.
	const hideAddresses = await menuLinkAddresses(page.getByRole('main'), HIDE_BUTTON_LABEL);
	const offersHideFor = (id: string) =>
		hideAddresses.some((address) => address.includes(`seat=${id}`));

	expect(offersHideFor(franceId)).toBe(false);
	expect(offersHideFor(denmarkId)).toBe(false);
	expect(offersHideFor(seatId(fixture.seats, 'Brazil'))).toBe(true);
});

// T142: with JavaScript, freeing a seat shows the cell changing before the
// server has answered, with no spinner, and a hide the server refuses puts
// the cell back and says what did not happen.
test('frees a seat at once, and puts a refused hide back', async ({ page }, testInfo) => {
	skipWithoutJavaScript(testInfo);
	// The committees fold shut on a phone (T93), which hides an unopened
	// seat's cell from the role query `seatCells` below relies on.
	test.skip(testInfo.project.name === 'phone', 'The columns are the desktop layout.');

	const fixture = await seedAllocationGrid(page, 'Instant Allocation MUN');

	const franceId = seatId(fixture.seats, 'France');
	const franceCell = seatCells(page).filter({ hasText: 'France' });

	await openTheGrid(page, fixture.conference, `?seat=${franceId}&action=free`);
	await answerSlowly(page, 'freeSeat');
	await watchForSpinners(page);
	await pressAndConfirm(page, FREE_BUTTON_LABEL);

	// The cell already reads "Free" while `answerSlowly` is still holding the
	// server's answer back, which is what "at once" means.
	await expect(franceCell).toContainText('Free', { timeout: AT_ONCE_TIMEOUT_MS });
	await waitUntilAnswered(page);
	expect(await sawSpinner(page)).toBe(false);
	expect((await readSeat(franceId)).user_id).toBeNull();

	const ghanaId = seatId(fixture.seats, 'Ghana');
	const ghanaCell = seatCells(page).filter({ hasText: 'Ghana' });

	await answerWithError(page, 'toggleHidden');
	await openTheGrid(page, fixture.conference, `?seat=${ghanaId}&action=hide`);
	await pressAndConfirm(page, HIDE_BUTTON_LABEL);

	await expect(page.getByRole('alert')).toContainText('The seat was not hidden.', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(page);
	await expect(ghanaCell).toContainText('Free');
	expect((await readSeat(ghanaId)).is_available).toBe(true);
});

/*
	T93: the delegation's name, "Riverside School Delegation" and a random
	suffix, is longer than a 288px column has room for beside "Denmark". It is
	cut short on one line, so the Denmark cell is as tall as its neighbours
	rather than wrapping to twice their height.
*/
test('keeps every seat cell in a column the same height', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'The fixed-width columns are the desktop layout.');

	const fixture = await seedAllocationGrid(page, 'Even Cells Allocation MUN');

	await openTheGrid(page, fixture.conference);

	const heights = await seatCells(page)
		.filter({ visible: true })
		.evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().height));

	expect(heights.length).toBe(fixture.seats.size);
	expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);

	// The delegation's long name is the one cut short, not the seat's own: a
	// short seat name beside it still fits whole in its box.
	// The phone sections hold a hidden copy of the same cell, so only the
	// visible one is measured.
	const reservedSeatName = page
		.getByRole('main')
		.locator('[title="Denmark"]')
		.filter({ visible: true });
	const isCut = await reservedSeatName.evaluate(
		(element) => element.scrollWidth > element.clientWidth
	);

	expect(isCut).toBe(false);
});

test('warns about an accepted delegation short of seats, and links to their tab', async ({
	page
}) => {
	// The delegation holds Denmark and Egypt and asked for exactly those two, so
	// there is nothing to warn about yet.
	const fixture = await seedAllocationGrid(page, 'Unseated Allocation MUN');

	await openTheGrid(page, fixture.conference);

	const main = page.getByRole('main');
	const warningLink = main.getByRole('link', { name: 'See the accepted delegations' });

	await expectSeatOnTheGrid(main, 'Denmark');
	await expect(warningLink).toHaveCount(0);

	// Now they want five and still hold two, which is what the warning is for.
	await setRequestedSeats(fixture.delegationId, SEATS_THE_DELEGATION_HOLDS + 3);

	await openTheGrid(page, fixture.conference);

	await expect(warningLink).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	// The link goes to the tab of the delegations table that holds the accepted
	// ones, so that the organiser lands where they can do something about it. It
	// is followed rather than read: `resolve()` from `$app/paths` writes a
	// relative address into the markup — "../../manage/…" — so the `href`
	// attribute on its own says nothing about where the link ends up.
	await warningLink.click();

	await expect(page).toHaveURL(`${fixture.conference.managePath}/delegations?status=accepted`, {
		timeout: DATABASE_TIMEOUT_MS
	});
});

test('shows the empty state and a link to add one when the conference has no committees', async ({
	page
}) => {
	// A brand-new conference has no committees at all, which is a different
	// empty state from a committee with no seats: nothing to filter, nothing to
	// scroll, just the one message and a way out of it.
	const conference = await signInWithAConference(page, 'No Committees Allocation MUN');

	await openTheGrid(page, conference);

	const main = page.getByRole('main');

	await expect(main.getByText('No committees yet.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	const addCommitteeLink = main.getByRole('link', { name: 'Add a committee' });

	await expect(addCommitteeLink).toBeVisible();
	await addCommitteeLink.click();

	await expect(page).toHaveURL(`${conference.managePath}/committees/new`, {
		timeout: DATABASE_TIMEOUT_MS
	});
});

test('shows "No seats. Add some on the committee page." inside a committee with none', async ({
	page
}, testInfo) => {
	const conference = await signInWithAConference(page, 'No Seats Allocation MUN');

	// One committee, and no call to `addSeats`: the column exists but is empty,
	// which is the state the spec asks a message for.
	await addCommittee(conference.id, 'World Health Organization', 'WHO', 0);

	await openTheGrid(page, conference);

	const main = page.getByRole('main');

	// On a phone the committee is a closed `<details>` section, so its "No
	// seats" line is not on screen until the summary is opened, the same way
	// `stacks the committees as sections that fold on a phone` above unfolds
	// ECOFIN before reading what is inside it. The desktop layout draws the
	// same `<details>` markup but keeps it hidden with CSS, so only the phone
	// project may click its summary.
	if (testInfo.project.name === 'phone') {
		const whoSection = main.getByRole('group').filter({ hasText: 'WHO' });

		await whoSection.first().getByText('WHO').first().click();
	}

	await expect(shownText(main, 'No seats. Add some on the committee page.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
});

test('answers somebody who does not run the conference with a 404', async ({ page }) => {
	const fixture = await seedAllocationGrid(page, 'Not Yours Allocation MUN');

	const brazilId = seatId(fixture.seats, 'Brazil');

	// A second account, signed in in place of the first. Clearing the cookies is
	// what ends the organiser's session; without that, `/login` would send an
	// account that is already signed in somewhere else.
	await page.context().clearCookies();

	const stranger = await createTestUser('Tomas Novak');
	await signIn(page, stranger);

	const response = await page.goto(fixture.conference.allocationPath);

	// A 404 and not a 403, for the reason `manage.spec.ts` gives about the
	// management pages themselves: the answer must not tell a stranger which
	// conferences exist.
	expect(response?.status()).toBe(404);

	// And the action asks for itself rather than trusting the page that drew the
	// button, which is what `specs/02-architecture/permissions.md` asks of every
	// action.
	const posted = await postFormAction(page, `${fixture.conference.allocationPath}?/toggleHidden`, {
		seatId: brazilId,
		confirm: '1'
	});

	expect(posted.status()).toBe(404);
	expect((await readSeat(brazilId)).is_available).toBe(true);
});

test('stacks the committees as sections that fold on a phone', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	const fixture = await seedAllocationGrid(page, 'Phone Allocation MUN');

	await openTheGrid(page, fixture.conference);

	const main = page.getByRole('main');

	// A grid of columns cannot be read on a 390px screen, so each committee
	// becomes a `<details>` section instead. `<details>` has the ARIA role
	// `group`, and the section for a committee is the one with that committee's
	// heading on it.
	const ecofinSection = main.getByRole('group').filter({ hasText: 'ECOFIN' });

	await expect(ecofinSection.first()).toBeAttached({ timeout: DATABASE_TIMEOUT_MS });

	// Unfolding it is what puts its seats on the screen, which is what says the
	// section is really a section and not a heading above an open list.
	await ecofinSection.first().getByText('ECOFIN').first().click();

	await expect(shownText(main, 'Brazil')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	// Nothing may push the page sideways. A seat cell carrying a flag, a country
	// and somebody's full name is exactly the kind of line that would.
	await expectNoSidewaysOverflow(page);
});

test('scrolls the columns sideways on a desktop, and still ends somewhere', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough to measure a page.');

	const fixture = await seedAllocationGrid(page, 'Height Check Allocation MUN');

	// Eight committees of six seats are wider than a 1280px window, which is the
	// only way to see that it is the grid that scrolls and not the page. Two
	// committees would fit and prove nothing.
	for (let index = 0; index < COMMITTEES_FOR_THE_WIDTH_TEST; index += 1) {
		const committeeId = await addCommittee(
			fixture.conference.id,
			unusedName('Special Political Committee'),
			`SPC${index}`,
			index + 2
		);

		const seeds: SeatSeed[] = [];

		for (let seat = 0; seat < SEATS_PER_WIDTH_TEST_COMMITTEE; seat += 1) {
			// A seat name is unique within its committee, so they are numbered.
			seeds.push({
				name: `Member State ${String(seat + 1).padStart(2, '0')}`,
				countryCode: 'PL',
				position: seat
			});
		}

		await addSeats(committeeId, seeds);
	}

	await openTheGrid(page, fixture.conference);

	const main = page.getByRole('main');

	await expect(shownText(main, 'Brazil')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	// Saved before the measurements, so that a failure leaves a picture of the
	// page that failed them.
	await saveFullPageScreenshot(page, 'manage-allocation');

	// The columns run off the side of the window and the container around them
	// is what scrolls, so the page itself does not have to.
	const row = await scrollingRowAround(main.getByText('Brazil', { exact: true }).first());

	expect(row.scrollWidth).toBeGreaterThan(row.clientWidth);

	await expectPageFitsInScreens(page, MANAGE_ALLOCATION_SCREENS);
});
