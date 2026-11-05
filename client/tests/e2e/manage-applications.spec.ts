import { expect, test, type APIResponse, type Locator, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { waitUntilAnswered } from './chair-room-fixtures';
import { skipWithoutJavaScript } from './in-place';
import {
	AT_ONCE_TIMEOUT_MS,
	answerSlowly,
	answerWithError,
	sawSpinner,
	watchForSpinners
} from './instant';
import {
	expectNoSidewaysOverflow,
	expectPageFitsInScreens,
	saveFullPageScreenshot
} from './page-shape';
import { createTestUser, giveApplication, signIn, type TestUser } from './signed-in-user';
import { createDraftConferenceFor } from './draft-conference';

// The acceptance criteria of `specs/05-pages/organiser/applications.md` that
// need a real browser, for the table task T26 builds at
// `/manage/[slug]/applications`.
//
// * every filter, tab and sort is in the address and survives a refresh, and so
//   is the page number;
// * a draft application is never shown and never exported, although Row Level
//   Security would happily let an organiser read one;
// * a bulk accept refuses to run while an applicant has no seat, or while two
//   of them have been given the same one, and goes through once neither is
//   true;
// * accepting really does seat the applicant, raise their invoice and tell
//   them, because `accept_application` does all three in one statement;
// * a bulk reject writes the same decision note on every application it
//   touches;
// * the CSV honours the filters the page is showing and carries one column per
//   custom question;
// * the CSV answers somebody who does not run this conference with a 404;
// * under `md` the table becomes cards and the bulk bar stays in reach.
//
// THE REVIEW PAGE IS NOT HERE
// `/manage/[slug]/applications/[applicationId]` — one application read on its
// own, with the internal note and the single decision — has its own file,
// `manage-application-review.spec.ts`, which follows the table's link to it.
//
// EVERY ACTION WITHOUT JAVASCRIPT
// The spec says the seat panel and the note panel are drawn inline above the
// table rather than in a `Modal`, precisely so that a browser with no script
// can use them. Both `refuses a bulk accept...` and `writes one decision
// note...` below therefore run on the `desktop-no-js` project like every other
// test in this file, and neither skips it. That is what makes the two-step post
// worth having: the bulk bar's buttons have to be real submit buttons in the
// HTML the server sent, the `chooseAccept` and `chooseReject` actions have to
// hand the ticked rows back, and the rows have to come back ticked, or a
// reader without JavaScript could never reach the second step. The three tests
// that measure the page or ask for its dimensions are the exception, and each
// runs on one project alone.
//
// WHAT THESE TESTS LEAVE BEHIND
// Each test signs a brand-new account in and creates its own conference through
// `./draft-conference`, with an organisation of its own, and everything it
// creates stays in the database until the next `pnpm db:reset`. Its committees,
// its seats, its fee and its applicants are its own for the same reason
// `playwright.config.ts` gives: every test runs on three projects at once
// against one database, so a test that reached for "the first free seat" or
// counted the rows of a shared conference would be reading another project's
// work. The conferences are dated in 2020 for the reason
// `tests/e2e/manage-fees.spec.ts` gives: `/conferences` lists conferences that
// are published and have not finished, and `tests/e2e/conferences.spec.ts`
// counts what is in it.
//
// Nothing here takes a conference, a committee, a seat or an application from
// `supabase/seed.sql`. That is also why nothing is put back afterwards:
// `removeConferenceStaff` and `freeSeat` in `tests/e2e/signed-in-user.ts` exist
// because the tests that use them borrow a row from a conference other tests
// read, and these tests borrow nothing. The account that signs in owns the
// organisation `./draft-conference` made for it, so it is already an organiser
// of its own conference and needs no place on anybody's team.
//
// `createDraftConference`, `slugOf`, `readConferenceId` and
// `signInWithAConference` below are copies of the ones in
// `tests/e2e/manage-fees.spec.ts` and `tests/e2e/manage-application-form.spec.ts`,
// and are deliberately copies rather than shared imports for the same reason
// those two are: each file wants its own dates and its own extra fields, and a
// helper shared between them would have to be told about every one of those.

/**
 * How long an assertion that waits on a page reading the database may take.
 *
 * Longer than the five seconds Playwright waits by default, for the reason
 * `tests/e2e/conferences.spec.ts` gives: every test in the run asks the one
 * local database at once, and an answer has taken up to eight seconds.
 */
const DATABASE_TIMEOUT_MS = 15_000;

/**
 * The days every conference these tests create runs on.
 *
 * Both are in the past, for the reason at the top of this file.
 */
const CONFERENCE_FIRST_DAY = '2020-05-03';
const CONFERENCE_LAST_DAY = '2020-05-05';

/**
 * How many applications one page of the organiser's table holds.
 *
 * The same number as `APPLICATIONS_PAGE_SIZE` in `src/lib/applications.ts`,
 * written out again rather than imported, for the reason
 * `tests/e2e/manage-fees.spec.ts` gives about `formatMoney`: Playwright
 * compiles the files in `tests/` on their own, without the `$lib` alias the app
 * is built with.
 */
const APPLICATIONS_PAGE_SIZE = 25;

/** One more than a page holds, so that the pager has a second page to point at. */
const APPLICATIONS_OVER_ONE_PAGE = APPLICATIONS_PAGE_SIZE + 1;

/** What the conference charges one delegate, so that accepting raises an invoice. */
const DELEGATE_FEE_CENTS = 6500;

/**
 * How many windows tall the applications table may be with a real list on it.
 *
 * Three, which is the ceiling the conference dashboard, the committees list,
 * the team page and the fees page are all held to, and the reason is the same:
 * more than that would mean these rows are being drawn too big to be scanned,
 * which is exactly what `tests/e2e/page-shape.ts` exists to notice. It is
 * measured with twelve applications rather than a full page of twenty-five: a
 * page of results is allowed to be as long as the results it holds, and what
 * this number is about is the height of the header, the tabs, the filters and
 * one row, not how many rows a conference has.
 */
const MANAGE_APPLICATIONS_SCREENS = 3;

/** How many applications the height test puts on the page. */
const APPLICATIONS_FOR_THE_HEIGHT_TEST = 12;

/**
 * A name nothing else in the database will match, so that a test can read its
 * own conference's page without another run's rows getting in the way.
 */
function unusedName(prefix: string): string {
	return `${prefix} ${crypto.randomUUID().slice(0, 8)}`;
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
	/** The `/manage/<slug>/applications` address this file is about. */
	applicationsPath: string;
	/** The CSV behind the "Export CSV" button. */
	exportPath: string;
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
		applicationsPath: `${managePath}/applications`,
		exportPath: `${managePath}/applications/export`
	};
}

/**
 * Wait until the applications page has really arrived.
 *
 * Waiting for the heading rather than simply for the address is what says the
 * page is there: a test that pressed too early would press the page it was
 * leaving. The heading is looked for inside `<main>` because the sidebar beside
 * it carries a link with the same word on it.
 */
async function waitForTheApplicationsPage(page: Page): Promise<void> {
	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
		'Applications',
		{ timeout: DATABASE_TIMEOUT_MS }
	);
}

/** Sign in, make a conference and open its applications page. */
async function openApplicationsPage(page: Page, prefix: string): Promise<TestConference> {
	const conference = await signInWithAConference(page, prefix);

	await page.goto(conference.applicationsPath);
	await waitForTheApplicationsPage(page);

	return conference;
}

/**
 * Give the conference one committee, and answer its id.
 *
 * Committees are T02's form and are not what this page is about, so the
 * service-role client writes the row, the way `addCommittee` in
 * `tests/e2e/manage-application-form.spec.ts` does. It is never used to show
 * that something is allowed.
 */
async function addCommittee(
	conferenceId: string,
	name: string,
	abbreviation: string
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
			position: 0
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test committee: ${error?.message}`);
	}

	return data.id;
}

/**
 * Put one free seat in a committee, and answer its id.
 *
 * Every test makes its own seats rather than taking one of the seeded ones,
 * because a seat is a single row and all three Playwright projects run at the
 * same time against one database: two of them reaching for the same seat would
 * each take the other's. `giveSeat` in `tests/e2e/signed-in-user.ts` makes the
 * same point from the other side.
 */
async function addSeat(
	committeeId: string,
	name: string,
	countryCode: string,
	position: number
): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('seats')
		.insert({
			committee_id: committeeId,
			name,
			kind: 'country',
			country_code: countryCode,
			position,
			is_available: true
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test seat: ${error?.message}`);
	}

	return data.id;
}

/** What `addQuestion` puts on the form. Everything but the label has a default. */
type NewQuestion = {
	label: string;
	type?: 'short_text' | 'long_text' | 'single_choice' | 'multiple_choice' | 'checkbox';
	options?: string[];
	position?: number;
};

/**
 * Give the conference one custom question, and answer its id.
 *
 * `is_required` is false throughout this file on purpose. The
 * `validate_application` trigger insists that a submitted application answers
 * every required question that exists when it is written, and these tests seed
 * their applications rather than filling the apply form in; a question nobody
 * has to answer keeps that rule out of the way while still earning a column in
 * the CSV, which is what the export criterion is about.
 */
async function addQuestion(conferenceId: string, question: NewQuestion): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('application_questions')
		.insert({
			conference_id: conferenceId,
			label: question.label,
			help_text: null,
			type: question.type ?? 'short_text',
			options: question.options ?? [],
			is_required: false,
			position: question.position ?? 0
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test question: ${error?.message}`);
	}

	return data.id;
}

/**
 * Give the conference one fee that applies to every individual, right now.
 *
 * `accept_application` asks `applicable_fee` for the individual fee that is
 * open at this moment and writes an invoice for it; with no fee at all it
 * accepts the applicant and writes no invoice, which is correct and is not what
 * the acceptance criterion is about. A fee with no window is open forever.
 */
async function addDelegateFee(conferenceId: string): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('fees')
		.insert({
			conference_id: conferenceId,
			name: 'Delegate fee',
			amount_cents: DELEGATE_FEE_CENTS,
			applies_to: 'individual',
			valid_from: null,
			valid_until: null,
			position: 0
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test fee: ${error?.message}`);
	}

	return data.id;
}

/** What `addApplicant` creates: an account, a profile and one application. */
type NewApplicant = {
	fullName: string;
	status: 'draft' | 'submitted' | 'accepted' | 'rejected' | 'waitlisted' | 'withdrawn';
	/** Committee ids of this same conference, in the applicant's own order. */
	committeePreferences?: string[];
	/** Shown in the table and searched by `q`. Left alone when it is not given. */
	institutionName?: string;
	/** Two letters. What the country filter matches on. */
	countryCode?: string;
	seatPreferences?: string;
	motivation?: string;
	/** One entry per custom question, keyed by that question's id. */
	answers?: Record<string, string | string[]>;
};

/** An applicant a test made, and the application they sent. */
type Applicant = {
	user: TestUser;
	applicationId: string;
};

/**
 * Create one applicant: a brand-new account, the profile facts the table shows,
 * and their application.
 *
 * Applying for real is `/conferences/[slug]/apply`, which
 * `tests/e2e/apply.spec.ts` already watches, so the row is seeded here through
 * `giveApplication`. That helper writes it with the service-role client, and
 * its doc comment is worth reading before changing anything below: the
 * `validate_application` trigger still fires, so every committee id has to
 * belong to this same conference and a `submitted` row has to carry whatever
 * the conference marks required — which is why every applicant here has a
 * motivation and at least one preference.
 */
async function addApplicant(conferenceId: string, applicant: NewApplicant): Promise<Applicant> {
	const user = await createTestUser(applicant.fullName);

	await describeApplicant(user, applicant);

	const applicationId = await giveApplication(user, {
		conferenceId,
		status: applicant.status,
		committeePreferences: applicant.committeePreferences ?? [],
		seatPreferences: applicant.seatPreferences,
		motivation: applicant.motivation ?? 'I have chaired twice and would like a seat this year.',
		answers: applicant.answers
	});

	return { user, applicationId };
}

/**
 * Write the school and the country the table shows beside an applicant's name.
 *
 * `createTestUser` fills a profile in the way the welcome form would, and every
 * account it makes is at Delft University in the Netherlands. A test about the
 * search box and the country filter needs them to differ, so it says so here.
 */
async function describeApplicant(user: TestUser, applicant: NewApplicant): Promise<void> {
	if (applicant.institutionName === undefined && applicant.countryCode === undefined) {
		return;
	}

	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('profiles')
		.update({
			institution_name: applicant.institutionName ?? 'Delft University',
			country_code: applicant.countryCode ?? 'NL'
		})
		.eq('id', user.id);

	if (error) {
		throw new Error(`Could not describe the test applicant: ${error.message}`);
	}
}

/** One `applications` row, as the tests below read it back. */
type ApplicationRow = {
	id: string;
	status: string;
	decision_note: string | null;
	decided_at: string | null;
	decided_by: string | null;
};

/** One application read back on its own, by the id a test already knows. */
async function readApplication(applicationId: string): Promise<ApplicationRow> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('applications')
		.select('id, status, decision_note, decided_at, decided_by')
		.eq('id', applicationId)
		.maybeSingle()
		.overrideTypes<ApplicationRow, { merge: false }>();

	if (error || !data) {
		throw new Error(`Could not read the test application: ${error?.message}`);
	}

	return data;
}

/** One `seats` row, as the tests below read it back. */
type SeatRow = {
	id: string;
	name: string;
	user_id: string | null;
	application_id: string | null;
	allocated_at: string | null;
};

/** One seat read back on its own, to see who is sitting in it. */
async function readSeat(seatId: string): Promise<SeatRow> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('seats')
		.select('id, name, user_id, application_id, allocated_at')
		.eq('id', seatId)
		.maybeSingle()
		.overrideTypes<SeatRow, { merge: false }>();

	if (error || !data) {
		throw new Error(`Could not read the test seat: ${error?.message}`);
	}

	return data;
}

/** One `invoices` row, as the tests below read it back. */
type InvoiceRow = {
	payer_user_id: string;
	seat_id: string | null;
	fee_id: string | null;
	unit_amount_cents: number;
};

/** Every invoice of one conference. */
async function readInvoices(conferenceId: string): Promise<InvoiceRow[]> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('invoices')
		.select('payer_user_id, seat_id, fee_id, unit_amount_cents')
		.eq('conference_id', conferenceId)
		.overrideTypes<InvoiceRow[], { merge: false }>();

	if (error || !data) {
		throw new Error(`Could not read the test invoices: ${error?.message}`);
	}

	return data;
}

/** One `notifications` row, as the tests below read it back. */
type NotificationRow = {
	kind: string;
	title: string;
};

/**
 * Everything one account has been told about one conference.
 *
 * Only triggers insert a notification, so reading them with the service-role
 * client is reading what the database said by itself; nothing here writes one.
 */
async function readNotifications(userId: string, conferenceId: string): Promise<NotificationRow[]> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('notifications')
		.select('kind, title')
		.eq('user_id', userId)
		.eq('conference_id', conferenceId)
		.overrideTypes<NotificationRow[], { merge: false }>();

	if (error || !data) {
		throw new Error(`Could not read the test notifications: ${error?.message}`);
	}

	return data;
}

/**
 * A piece of text as the reader really sees it.
 *
 * Every application is drawn twice — as a table row from `md` up and as a card
 * below that — and whichever of the two this width does not use is
 * `display: none`. A plain text lookup would find both, and Playwright refuses
 * to act on two elements at once, so this keeps the one on screen.
 */
function shownText(main: Locator, text: string): Locator {
	return main.getByText(text).filter({ visible: true });
}

/**
 * The tick box of one application, whichever of its two copies is on screen.
 *
 * The box carries `name="ids"` and the application's own id as its value, which
 * is how the ticked rows reach the form actions, so that pair names one row
 * exactly. It is found by those attributes rather than by its words because the
 * words beside it are the applicant's name, which also appears in the row
 * itself.
 */
function applicationCheckbox(main: Locator, applicationId: string): Locator {
	return main.locator(`input[name="ids"][value="${applicationId}"]`).filter({ visible: true });
}

/**
 * The applications the page is showing, in the order it is showing them.
 *
 * Reading the tick boxes rather than the names is what makes an order
 * assertion safe: two applicants may share a school and a country, but never an
 * application id.
 */
async function listedApplicationIds(main: Locator): Promise<string[]> {
	// `all()` answers one locator per element that matches right now, in the
	// order they appear in the page, which is the order being asserted.
	const boxes = await main.locator('input[name="ids"]').filter({ visible: true }).all();
	const ids: string[] = [];

	for (const box of boxes) {
		ids.push(await box.inputValue());
	}

	return ids;
}

/**
 * One tab of the status strip.
 *
 * `ManageTabs` draws itself as a `<nav aria-label="Sections">` of links, and this is
 * scoped to that strip because the organiser sidebar is inside `<main>` too and
 * carries a link called "Applications". The words are matched from the start
 * because each tab also shows a count, and because "Accepted" is inside "Not
 * accepted".
 */
function statusTab(main: Locator, label: string): Locator {
	return main
		.getByRole('navigation', { name: 'Sections' })
		.getByRole('link', { name: new RegExp(`^${label}`) });
}

/** The "Next →" link of the pager, which `Pagination` draws only when there is a page to go to. */
function nextPageLink(main: Locator): Locator {
	return main.getByRole('navigation', { name: 'Pagination' }).getByRole('link', { name: 'Next →' });
}

/**
 * The bar of bulk buttons at the foot of the list.
 *
 * `BulkActionBar` marks itself `role="status"` so that a screen reader says how
 * many rows are ticked when it appears, and it is the only thing inside
 * `<main>` on this page with that role: an error `Notice` is `role="alert"`, and
 * the flash after a decision is a `Toast` that floats outside `<main>`
 * altogether.
 */
function bulkActionBar(main: Locator): Locator {
	return main.getByRole('status');
}

/**
 * Press one of the three buttons in the bulk bar.
 *
 * The bar is looked for first, because that is what a failure here should point
 * at. On the project with no JavaScript nothing can appear in answer to a tick,
 * so the bar and its buttons have to be part of the HTML the server sent, or
 * the two-step post that carries the ticked ids into a panel could never be
 * started at all.
 */
async function pressBulkButton(main: Locator, label: string): Promise<void> {
	await expect(bulkActionBar(main)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await bulkActionBar(main).getByRole('button', { name: label }).click();
}

/**
 * The seat dropdown one applicant was given in the accept panel.
 *
 * `seat:<applicationId>` is the name the action reads the choices back out of,
 * so it is also the safest way to find the right one of several dropdowns that
 * otherwise look alike.
 */
function seatChoice(main: Locator, applicationId: string): Locator {
	return main.locator(`select[name="seat:${applicationId}"]`);
}

/**
 * Post to one of the page's form actions the way a browser posts a form, with
 * repeated field names where a form really repeats them.
 *
 * A button the page never drew proves only what the page did; some of the rules
 * below are the action's own, and the ticked ids arrive as several `ids` fields
 * with one name, which an object of fields cannot express. So the body is built
 * by hand. `page.request` carries the browser's own cookies, so the post
 * arrives signed in as the account the test signed in.
 *
 * Three headers are written by hand. `content-type`, because the body is a
 * string rather than something Playwright encodes. `origin`, because SvelteKit
 * refuses a form post that looks as though it came from another website and
 * Playwright's request does not send that header itself. And `accept:
 * text/html`, because that is how SvelteKit tells a form post from a page with
 * no JavaScript from one made by `use:enhance`: without it the answer is the
 * action's result as JSON under a 200, and with it the page is drawn again
 * carrying the status the action chose, which is what a browser with no script
 * really receives and so what these tests are about.
 */
async function postFormFields(
	page: Page,
	action: string,
	fields: [string, string][]
): Promise<APIResponse> {
	const origin = new URL(page.url()).origin;
	const body = new URLSearchParams(fields).toString();

	return page.request.post(action, {
		data: body,
		headers: {
			origin,
			accept: 'text/html',
			'content-type': 'application/x-www-form-urlencoded'
		}
	});
}

/**
 * Submit the filter form the way a reader does, by pressing Enter in the search
 * box.
 *
 * A text box inside a form with a submit button submits that form when Enter is
 * pressed in it, which is the browser's own behaviour and needs no JavaScript.
 * Pressing the button itself would do the same thing; going through the box
 * means this file does not have to know what the button is called.
 */
async function applyTheFilters(main: Locator): Promise<void> {
	await main.locator('input[name="q"]').press('Enter');
}

/*
	Every test here signs a brand-new account in, seeds a draft conference,
	seeds a conference with committees, seats and applicants and then works
	through the page. That is a great deal more than most browser tests do, and
	thirty seconds — what Playwright allows a test by default — is not always
	enough for it while the whole suite is asking the one local database at once.
	`test.slow()` triples that allowance. It is an allowance and not a wait: a
	test that is quick still finishes as quickly as it can.
*/
test.beforeEach(() => {
	test.slow();
});

test('keeps the tab, the search, the filters and the sort in the address', async ({ page }) => {
	const conference = await openApplicationsPage(page, 'Filter Applications MUN');
	const main = page.getByRole('main');

	const securityCouncil = await addCommittee(conference.id, 'Security Council', 'UNSC');
	const humanRights = await addCommittee(conference.id, 'Human Rights Council', 'HRC');

	/*
		Zofia first and Anna second, because the default sort is oldest first and
		this test is about the sort really changing that. Both are Polish and both
		are at Lyceum 7, so the search box and the country filter keep them
		together while everybody else is filtered away.
	*/
	const zofia = await addApplicant(conference.id, {
		fullName: 'Zofia Kowalska',
		status: 'waitlisted',
		institutionName: 'Lyceum 7',
		countryCode: 'PL',
		committeePreferences: [securityCouncil]
	});
	const anna = await addApplicant(conference.id, {
		fullName: 'Anna Nowak',
		status: 'waitlisted',
		institutionName: 'Lyceum 7',
		countryCode: 'PL',
		committeePreferences: [securityCouncil]
	});

	// Three applicants who each fail exactly one of the four filters, so that a
	// filter quietly doing nothing would show up as a row that should not be
	// there.
	const bruno = await addApplicant(conference.id, {
		fullName: 'Bruno Silva',
		status: 'waitlisted',
		institutionName: 'Colegio Rio',
		countryCode: 'BR',
		committeePreferences: [securityCouncil]
	});
	const clara = await addApplicant(conference.id, {
		fullName: 'Clara Dubois',
		status: 'waitlisted',
		institutionName: 'Lyceum 7',
		countryCode: 'PL',
		committeePreferences: [humanRights]
	});
	const marek = await addApplicant(conference.id, {
		fullName: 'Marek Wozniak',
		status: 'submitted',
		institutionName: 'Lyceum 7',
		countryCode: 'PL',
		committeePreferences: [securityCouncil]
	});

	await page.goto(conference.applicationsPath);
	await waitForTheApplicationsPage(page);

	// The default tab is "Under review", so the one submitted application is what
	// the page opens on.
	await expect(applicationCheckbox(main, marek.applicationId)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// Each tab is a real link, so opening one is a navigation and the address
	// says which tab is open.
	await statusTab(main, 'Waitlisted').click();
	await page.waitForURL(/status=waitlisted/, { timeout: DATABASE_TIMEOUT_MS });

	await expect(applicationCheckbox(main, zofia.applicationId)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(main.getByText('Marek Wozniak')).toHaveCount(0);

	// Oldest first is the default, and it is the order the queue is worked in.
	expect(await listedApplicationIds(main)).toEqual([
		zofia.applicationId,
		anna.applicationId,
		bruno.applicationId,
		clara.applicationId
	]);

	await main.locator('input[name="q"]').fill('Lyceum');
	await main.locator('select[name="committee"]').selectOption(securityCouncil);
	await main.locator('select[name="country"]').selectOption('PL');
	await main.locator('select[name="sort"]').selectOption('name');
	await applyTheFilters(main);

	await page.waitForURL(/sort=name/, { timeout: DATABASE_TIMEOUT_MS });

	/*
		The address is read a parameter at a time rather than compared with one
		written-out string. A GET form sends every control it holds, so without
		JavaScript the address also carries the parameters that are still at their
		default, and what this criterion is about is that each answer is in the
		address at all.
	*/
	const filtered = new URL(page.url());

	expect(filtered.pathname).toBe(conference.applicationsPath);
	expect(filtered.searchParams.get('q')).toBe('Lyceum');
	expect(filtered.searchParams.get('status')).toBe('waitlisted');
	expect(filtered.searchParams.get('committee')).toBe(securityCouncil);
	expect(filtered.searchParams.get('country')).toBe('PL');
	expect(filtered.searchParams.get('sort')).toBe('name');

	// Anna before Zofia: by name rather than by the day they applied.
	await expect(applicationCheckbox(main, anna.applicationId)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect(await listedApplicationIds(main)).toEqual([anna.applicationId, zofia.applicationId]);

	await expect(main.getByText('Bruno Silva')).toHaveCount(0);
	await expect(main.getByText('Clara Dubois')).toHaveCount(0);
	await expect(main.getByText('Marek Wozniak')).toHaveCount(0);

	/*
		The whole point of keeping the state in the address: a refresh asks the
		server the same question again, so the same rows come back and every
		control still shows what it was set to.
	*/
	await page.reload();
	await waitForTheApplicationsPage(page);

	await expect(applicationCheckbox(main, anna.applicationId)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect(await listedApplicationIds(main)).toEqual([anna.applicationId, zofia.applicationId]);

	await expect(main.locator('input[name="q"]')).toHaveValue('Lyceum');
	await expect(main.locator('select[name="committee"]')).toHaveValue(securityCouncil);
	await expect(main.locator('select[name="country"]')).toHaveValue('PL');
	await expect(main.locator('select[name="sort"]')).toHaveValue('name');
});

test('keeps the page number in the address', async ({ page }) => {
	const conference = await openApplicationsPage(page, 'Paged Applications MUN');
	const main = page.getByRole('main');

	const securityCouncil = await addCommittee(conference.id, 'Security Council', 'UNSC');

	/*
		One more application than a page holds, so that there is a second page to
		go to. They are written one at a time rather than all at once because the
		default sort is by the moment each was submitted, and rows written in
		parallel have no order worth asserting.
	*/
	const applicants: Applicant[] = [];

	for (let index = 0; index < APPLICATIONS_OVER_ONE_PAGE; index++) {
		const number = String(index + 1).padStart(2, '0');

		applicants.push(
			await addApplicant(conference.id, {
				fullName: `Delegate ${number} ${crypto.randomUUID().slice(0, 4)}`,
				status: 'submitted',
				committeePreferences: [securityCouncil]
			})
		);
	}

	await page.goto(conference.applicationsPath);
	await waitForTheApplicationsPage(page);

	await expect(shownText(main, 'Page 1 of 2')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	expect(await listedApplicationIds(main)).toHaveLength(APPLICATIONS_PAGE_SIZE);

	// The pager is a pair of ordinary links, so the second page is a real address.
	await nextPageLink(main).click();
	await page.waitForURL(/page=2/, { timeout: DATABASE_TIMEOUT_MS });

	const lastApplicant = applicants[applicants.length - 1];

	await expect(applicationCheckbox(main, lastApplicant.applicationId)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect(await listedApplicationIds(main)).toEqual([lastApplicant.applicationId]);

	await page.reload();
	await waitForTheApplicationsPage(page);

	expect(new URL(page.url()).searchParams.get('page')).toBe('2');
	await expect(applicationCheckbox(main, lastApplicant.applicationId)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect(await listedApplicationIds(main)).toEqual([lastApplicant.applicationId]);
});

test('never shows a draft, in the table or in the export', async ({ page }) => {
	const conference = await openApplicationsPage(page, 'Draft Applications MUN');
	const main = page.getByRole('main');

	const securityCouncil = await addCommittee(conference.id, 'Security Council', 'UNSC');

	const sent = await addApplicant(conference.id, {
		fullName: 'Ines Ferreira',
		status: 'submitted',
		committeePreferences: [securityCouncil]
	});

	/*
		A draft is an application somebody is still writing. The `applications`
		select policy is "self; organisers", and a policy decides rows and not
		columns, so an organiser really can read this row and the half-written
		motivation in it. Leaving it out is the page's own job, which is what
		makes this worth a test.
	*/
	const draft = await addApplicant(conference.id, {
		fullName: 'Tomasz Draftowski',
		status: 'draft',
		committeePreferences: [securityCouncil]
	});

	await page.goto(conference.applicationsPath);
	await waitForTheApplicationsPage(page);

	await expect(applicationCheckbox(main, sent.applicationId)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(main.getByText('Tomasz Draftowski')).toHaveCount(0);
	await expect(main.locator(`input[name="ids"][value="${draft.applicationId}"]`)).toHaveCount(0);

	/*
		And not on any of the other four tabs either: a draft belongs to no tab,
		because `draft` is the one status the table does not offer. Each tab is
		waited for by its address rather than by the heading, which is the same
		word on every one of them.
	*/
	const otherTabs = [
		{ label: 'Waitlisted', status: 'waitlisted' },
		{ label: 'Accepted', status: 'accepted' },
		{ label: 'Not accepted', status: 'rejected' },
		{ label: 'Withdrawn', status: 'withdrawn' }
	];

	for (const tab of otherTabs) {
		await statusTab(main, tab.label).click();
		await page.waitForURL(new RegExp(`status=${tab.status}`), { timeout: DATABASE_TIMEOUT_MS });
		await expect(main.getByText('Tomasz Draftowski')).toHaveCount(0);
	}

	// The CSV is a second query with its own filter, so it is asked the same
	// question separately.
	const csv = await page.request.get(conference.exportPath);

	expect(csv.status()).toBe(200);

	const text = await csv.text();

	expect(text).toContain('Ines Ferreira');
	expect(text).not.toContain('Tomasz Draftowski');
});

test("tells a draft conference's organiser that applications open once it is published", async ({
	page
}) => {
	// `./draft-conference` makes a conference nobody has published yet, so
	// opening the applications page straight away is already the draft state
	// the spec describes: nobody can have applied because there is no public
	// page to apply from.
	const conference = await openApplicationsPage(page, 'Draft Conference Applications MUN');
	const main = page.getByRole('main');

	await expect(main.getByText('Applications open once the conference is published.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	const goToDetails = main.getByRole('link', { name: 'Go to details' });

	await expect(goToDetails).toBeVisible();
	await goToDetails.click();

	await expect(page).toHaveURL(`${conference.managePath}/details`, {
		timeout: DATABASE_TIMEOUT_MS
	});
});

test('titles the accepted tab "No accepted applications." when nobody has been accepted', async ({
	page
}) => {
	const conference = await openApplicationsPage(page, 'No Accepted Applications MUN');
	const main = page.getByRole('main');

	// A submitted application so the conference is not also empty on its
	// default tab, which would leave this test unable to tell "the tab has
	// nothing in it" from "the page never loaded any applications at all".
	const committee = await addCommittee(conference.id, 'Security Council', 'UNSC');

	await addApplicant(conference.id, {
		fullName: 'Ines Ferreira',
		status: 'submitted',
		committeePreferences: [committee]
	});

	await statusTab(main, 'Accepted').click();
	await page.waitForURL(/status=accepted/, { timeout: DATABASE_TIMEOUT_MS });

	// `APPLICATION_EMPTY_TITLES` gives the accepted tab its own title rather
	// than reusing "No applications under review.", which would be wrong here.
	await expect(main.getByText('No accepted applications.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
});

test('refuses a bulk accept until every ticked applicant has a seat of their own', async ({
	page
}) => {
	const conference = await openApplicationsPage(page, 'Seat Choice MUN');
	const main = page.getByRole('main');

	const securityCouncil = await addCommittee(conference.id, 'Security Council', 'UNSC');
	const france = await addSeat(securityCouncil, 'France', 'FR', 0);
	const kenya = await addSeat(securityCouncil, 'Kenya', 'KE', 1);

	const first = await addApplicant(conference.id, {
		fullName: 'Amara Okafor',
		status: 'submitted',
		committeePreferences: [securityCouncil]
	});
	const second = await addApplicant(conference.id, {
		fullName: 'Nikolai Petrov',
		status: 'submitted',
		committeePreferences: [securityCouncil]
	});

	await page.goto(conference.applicationsPath);
	await waitForTheApplicationsPage(page);

	// Nothing ticked is a refusal of its own: the panel has nobody to ask about.
	const nobody = await postFormFields(page, `${conference.applicationsPath}?/chooseAccept`, []);

	expect(nobody.status()).toBe(400);
	expect(await nobody.text()).toContain('Tick the applications you want to accept.');

	await applicationCheckbox(main, first.applicationId).check();
	await applicationCheckbox(main, second.applicationId).check();

	await pressBulkButton(main, 'Accept');

	/*
		The seat panel is drawn inline above the table rather than in a `<dialog>`,
		so it is here on every project, including the one with JavaScript switched
		off. The two rows come back ticked as well, or the second step would have
		no ids to post.
	*/
	await expect(seatChoice(main, first.applicationId)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(seatChoice(main, second.applicationId)).toBeVisible();
	await expect(applicationCheckbox(main, first.applicationId)).toBeChecked();
	await expect(applicationCheckbox(main, second.applicationId)).toBeChecked();

	/*
		One applicant with a seat and one without. The action is posted directly
		because a dropdown left alone may already hold a seat, and what is being
		checked here is the rule and not the dropdown: `tests/e2e/manage-fees.spec.ts`
		reaches for its actions the same way and for the same reason.
	*/
	const missingSeat = await postFormFields(page, `${conference.applicationsPath}?/bulkAccept`, [
		['ids', first.applicationId],
		['ids', second.applicationId],
		[`seat:${first.applicationId}`, france],
		[`seat:${second.applicationId}`, '']
	]);

	expect(missingSeat.status()).toBe(400);
	expect(await missingSeat.text()).toContain(
		'Choose a seat for every applicant, or untick the ones you are not ready to accept.'
	);

	// The refusal is the whole point, so nobody was accepted and no seat was
	// taken — not even the one applicant who did have a choice.
	expect(await readSeat(france)).toMatchObject({ user_id: null, application_id: null });
	expect((await readApplication(first.applicationId)).status).toBe('submitted');

	// Two applicants, one seat. Two delegates cannot represent France at once, so
	// this is refused as well, and the seat is named so the organiser knows which
	// dropdown to change.
	await seatChoice(main, first.applicationId).selectOption(france);
	await seatChoice(main, second.applicationId).selectOption(france);
	await main.getByRole('button', { name: 'Accept 2 applications' }).click();

	await expect(shownText(main, 'France was chosen twice.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	expect(await readSeat(france)).toMatchObject({ user_id: null, application_id: null });
	expect((await readApplication(first.applicationId)).status).toBe('submitted');
	expect((await readApplication(second.applicationId)).status).toBe('submitted');

	// And once each of them has a seat of their own, the same button goes
	// through. "Until" is the word in the criterion, so the test has to show the
	// other side of it.
	await seatChoice(main, first.applicationId).selectOption(france);
	await seatChoice(main, second.applicationId).selectOption(kenya);
	await main.getByRole('button', { name: 'Accept 2 applications' }).click();

	await expect(page.getByText('2 applications accepted.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	expect(await readSeat(france)).toMatchObject({
		user_id: first.user.id,
		application_id: first.applicationId
	});
	expect(await readSeat(kenya)).toMatchObject({
		user_id: second.user.id,
		application_id: second.applicationId
	});
});

test('accepts into seats, raises the invoices and tells the applicants', async ({ page }) => {
	const conference = await openApplicationsPage(page, 'Accept Applications MUN');
	const main = page.getByRole('main');

	const feeId = await addDelegateFee(conference.id);
	const securityCouncil = await addCommittee(conference.id, 'Security Council', 'UNSC');
	const france = await addSeat(securityCouncil, 'France', 'FR', 0);
	const kenya = await addSeat(securityCouncil, 'Kenya', 'KE', 1);

	const first = await addApplicant(conference.id, {
		fullName: 'Sofia Rossi',
		status: 'submitted',
		committeePreferences: [securityCouncil]
	});
	const second = await addApplicant(conference.id, {
		fullName: 'Yusuf Demir',
		status: 'submitted',
		committeePreferences: [securityCouncil]
	});

	await page.goto(conference.applicationsPath);
	await waitForTheApplicationsPage(page);

	await applicationCheckbox(main, first.applicationId).check();
	await applicationCheckbox(main, second.applicationId).check();

	await pressBulkButton(main, 'Accept');

	await expect(seatChoice(main, first.applicationId)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	await seatChoice(main, first.applicationId).selectOption(france);
	await seatChoice(main, second.applicationId).selectOption(kenya);
	await main.getByRole('button', { name: 'Accept 2 applications' }).click();

	await expect(page.getByText('2 applications accepted.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	/*
		`accept_application` does the seat, the status, the decision and the
		invoice in one statement, so all four are checked rather than the one the
		page happens to show.
	*/
	const franceSeat = await readSeat(france);
	const kenyaSeat = await readSeat(kenya);

	expect(franceSeat).toMatchObject({
		user_id: first.user.id,
		application_id: first.applicationId
	});
	expect(franceSeat.allocated_at).not.toBeNull();
	expect(kenyaSeat).toMatchObject({
		user_id: second.user.id,
		application_id: second.applicationId
	});

	const decidedFirst = await readApplication(first.applicationId);

	expect(decidedFirst.status).toBe('accepted');
	expect(decidedFirst.decided_at).not.toBeNull();
	// The organiser who pressed the button, and not the applicant: the function
	// writes `auth.uid()` into `decided_by`, and it runs as the reader's own
	// session even though it is a security definer function.
	expect(decidedFirst.decided_by).toBe(conference.user.id);
	expect((await readApplication(second.applicationId)).status).toBe('accepted');

	// One invoice each, for the individual fee that is open today, against the
	// seat they were given.
	const invoices = await readInvoices(conference.id);

	expect(invoices).toHaveLength(2);
	expect(invoices).toContainEqual({
		payer_user_id: first.user.id,
		seat_id: france,
		fee_id: feeId,
		unit_amount_cents: DELEGATE_FEE_CENTS
	});
	expect(invoices).toContainEqual({
		payer_user_id: second.user.id,
		seat_id: kenya,
		fee_id: feeId,
		unit_amount_cents: DELEGATE_FEE_CENTS
	});

	/*
		Two triggers speak here, and the applicant is waiting for both: the
		decision itself, and the seat it put them in. Only a trigger may insert a
		notification, so their being there at all is the database doing it.
	*/
	const told = await readNotifications(first.user.id, conference.id);

	expect(told).toContainEqual({
		kind: 'application_decided',
		title: `Your application to ${conference.name} was accepted`
	});
	expect(told).toContainEqual({
		kind: 'seat_allocated',
		title: 'You represent France in Security Council'
	});

	// And the accepted tab now says which seat each of them holds.
	await statusTab(main, 'Accepted').click();
	await page.waitForURL(/status=accepted/, { timeout: DATABASE_TIMEOUT_MS });

	await expect(shownText(main, 'UNSC · France')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(shownText(main, 'UNSC · Kenya')).toBeVisible();
});

/*
	From `xl` up (1280px, exactly the desktop projects' window) the list keeps one
	application open in a review panel beside the table. A name in the table opens
	it there, and the decision is made there without leaving the list: the decided
	row leaves its tab and the panel moves on to the next one. A phone has no room
	for the panel, and its names open the review page instead. The panel's forms
	post and redirect like any other, so this runs with JavaScript switched off too.
*/
test('accepts an application from the review panel beside the list', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name === 'phone', 'A phone is too narrow for the review panel.');

	const conference = await openApplicationsPage(page, 'Review Panel MUN');
	const main = page.getByRole('main');

	const securityCouncil = await addCommittee(conference.id, 'Security Council', 'UNSC');
	const france = await addSeat(securityCouncil, 'France', 'FR', 0);

	const staying = await addApplicant(conference.id, {
		fullName: 'Ingrid Johansson',
		status: 'submitted',
		committeePreferences: [securityCouncil]
	});
	const chosen = await addApplicant(conference.id, {
		fullName: 'Kofi Mensah',
		status: 'submitted',
		committeePreferences: [securityCouncil]
	});

	await page.goto(conference.applicationsPath);
	await waitForTheApplicationsPage(page);

	// Each name is drawn as two links, one for narrow screens and one for wide
	// ones, and the other is `display: none`. `getByRole` skips what is hidden,
	// so this is the one that opens the panel.
	await main.getByRole('link', { name: chosen.user.fullName, exact: true }).click();
	await expect(page).toHaveURL(new RegExp(`application=${chosen.applicationId}`), {
		timeout: DATABASE_TIMEOUT_MS
	});

	const panel = main.getByRole('complementary', { name: 'Application review' });

	await expect(panel.getByRole('heading', { level: 2 })).toHaveText(chosen.user.fullName);

	// The dropdown starts on the first free seat of the applicant's first
	// preference, which here is the only seat there is.
	await expect(panel.locator('select[name="seatId"]')).toHaveValue(france);
	await panel.getByRole('button', { name: 'Accept and give this seat' }).click();

	await expect(page.getByText(`${chosen.user.fullName} is now France in`)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// Still the list, not the review page. The accepted application has left the
	// "Under review" tab, and the panel has moved on to the one still waiting.
	await expect(page).toHaveURL(new RegExp(`${conference.applicationsPath}(\\?|$)`));
	await expect(applicationCheckbox(main, chosen.applicationId)).toHaveCount(0);
	await expect(applicationCheckbox(main, staying.applicationId)).toHaveCount(1);
	await expect(panel.getByRole('heading', { level: 2 })).toHaveText(staying.user.fullName);

	expect((await readApplication(chosen.applicationId)).status).toBe('accepted');
	expect(await readSeat(france)).toMatchObject({
		user_id: chosen.user.id,
		application_id: chosen.applicationId
	});
	expect((await readApplication(staying.applicationId)).status).toBe('submitted');
});

test('writes one decision note on every application a bulk reject touches', async ({ page }) => {
	const conference = await openApplicationsPage(page, 'Reject Applications MUN');
	const main = page.getByRole('main');

	const securityCouncil = await addCommittee(conference.id, 'Security Council', 'UNSC');

	const first = await addApplicant(conference.id, {
		fullName: 'Leila Haddad',
		status: 'submitted',
		committeePreferences: [securityCouncil]
	});
	const second = await addApplicant(conference.id, {
		fullName: 'Marco Bianchi',
		status: 'submitted',
		committeePreferences: [securityCouncil]
	});
	const untouched = await addApplicant(conference.id, {
		fullName: 'Hanna Virtanen',
		status: 'submitted',
		committeePreferences: [securityCouncil]
	});

	await page.goto(conference.applicationsPath);
	await waitForTheApplicationsPage(page);

	await applicationCheckbox(main, first.applicationId).check();
	await applicationCheckbox(main, second.applicationId).check();

	await pressBulkButton(main, 'Reject');

	// The note box is drawn inline above the table, not in a `<dialog>`, so a
	// browser with no script can type in it. It is found by its label, because
	// the review panel's "Decline" carries a note box of the same name.
	const note = main.getByRole('textbox', { name: 'Note for the applicants' });

	await expect(note).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	const decisionNote =
		'We had four times as many applications as seats this year. Please do apply again.';

	await note.fill(decisionNote);
	await main.getByRole('button', { name: 'Mark 2 as not accepted' }).click();

	await expect(page.getByText('2 applications marked as not accepted.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// The same words on both: one note typed once is what a bulk decision means.
	const decidedFirst = await readApplication(first.applicationId);
	const decidedSecond = await readApplication(second.applicationId);

	expect(decidedFirst.status).toBe('rejected');
	expect(decidedFirst.decision_note).toBe(decisionNote);
	expect(decidedFirst.decided_by).toBe(conference.user.id);
	expect(decidedFirst.decided_at).not.toBeNull();

	expect(decidedSecond.status).toBe('rejected');
	expect(decidedSecond.decision_note).toBe(decisionNote);
	expect(decidedSecond.decided_by).toBe(conference.user.id);

	// And nobody else was touched, which is what says the ticked ids really are
	// what decided who moved.
	const leftAlone = await readApplication(untouched.applicationId);

	expect(leftAlone.status).toBe('submitted');
	expect(leftAlone.decision_note).toBeNull();
});

/**
 * One applicant's own row or card, whichever of the two is on screen.
 *
 * Its tick box carries "Select <name>" nowhere else on the page, so going up
 * from it to the `<tr>` or `<li>` around it is what tells this one applicant's
 * status apart from the "Waitlisted" tab in the strip above the table.
 * `ancestor::tr | ancestor::li` is XPath for "the nearest `<tr>` or `<li>`
 * above this element"; Playwright takes an XPath when the selector starts
 * with `xpath=`.
 */
function applicationRow(main: Locator, applicantName: string): Locator {
	const checkbox = main
		.getByRole('checkbox', { name: `Select ${applicantName}` })
		.filter({ visible: true });

	return checkbox.locator('xpath=ancestor::tr | ancestor::li');
}

// T142: with JavaScript, "Waitlist" in the bulk bar changes the row's status
// the moment it is pressed, before the server has answered and with no
// spinner, because `bulkWaitlist` is predicted by `expectApplicationBoardChange`
// in `$lib/application-board-presses.ts`. A decision the server refuses goes
// back and names what did not happen, as a toast.
// `manage-application-review.spec.ts` checks the same thing for the single
// application page's own "Waitlist" button.
test('waitlists at once, and a refused waitlist goes back and names it', async ({
	page
}, testInfo) => {
	skipWithoutJavaScript(testInfo);

	const conference = await openApplicationsPage(page, 'Instant Waitlist MUN');
	const main = page.getByRole('main');

	const securityCouncil = await addCommittee(conference.id, 'Security Council', 'UNSC');
	const first = await addApplicant(conference.id, {
		fullName: 'Amina Yusuf',
		status: 'submitted',
		committeePreferences: [securityCouncil]
	});

	await page.goto(conference.applicationsPath);
	await waitForTheApplicationsPage(page);

	await applicationCheckbox(main, first.applicationId).check();
	await answerSlowly(page, 'bulkWaitlist');
	await watchForSpinners(page);

	await pressBulkButton(main, 'Waitlist');

	// From `xl` up the status column gives way to the review panel, and the
	// row's new status shows under the name instead, so only the visible one counts.
	await expect(
		applicationRow(main, first.user.fullName).getByText('Waitlisted').filter({ visible: true })
	).toBeVisible({ timeout: AT_ONCE_TIMEOUT_MS });

	await waitUntilAnswered(page);
	expect(await sawSpinner(page)).toBe(false);
	expect((await readApplication(first.applicationId)).status).toBe('waitlisted');

	// A second application, so a refusal can be shown without the first one's
	// change (which really happened) getting in the way.
	const second = await addApplicant(conference.id, {
		fullName: 'Diego Fernandez',
		status: 'submitted',
		committeePreferences: [securityCouncil]
	});

	await page.reload();
	await waitForTheApplicationsPage(page);
	await answerWithError(page, 'bulkWaitlist');

	await applicationCheckbox(main, second.applicationId).check();
	await pressBulkButton(main, 'Waitlist');

	await expect(page.getByRole('alert')).toContainText('The application was not waitlisted.', {
		timeout: DATABASE_TIMEOUT_MS
	});
	expect((await readApplication(second.applicationId)).status).toBe('submitted');
});

test('exports the rows the filters are showing, with a column for every question', async ({
	page
}) => {
	const conference = await openApplicationsPage(page, 'Export Applications MUN');
	const main = page.getByRole('main');

	const securityCouncil = await addCommittee(conference.id, 'Security Council', 'UNSC');
	const humanRights = await addCommittee(conference.id, 'Human Rights Council', 'HRC');

	// Two questions with no comma and no quotation mark in them, so that the
	// heading row can be split on commas below without minding RFC 4180 quoting.
	const allergiesLabel = unusedName('Any allergies');
	const languagesLabel = unusedName('Languages you speak');
	const allergiesId = await addQuestion(conference.id, { label: allergiesLabel, position: 0 });
	const languagesId = await addQuestion(conference.id, {
		label: languagesLabel,
		type: 'single_choice',
		options: ['English', 'French'],
		position: 1
	});

	const wanted = await addApplicant(conference.id, {
		fullName: 'Ravi Menon',
		status: 'submitted',
		institutionName: 'Lyceum 7',
		countryCode: 'PL',
		committeePreferences: [securityCouncil, humanRights],
		seatPreferences: 'Any P5 country, or Brazil',
		answers: { [allergiesId]: 'Peanuts', [languagesId]: 'French' }
	});
	// One who fails the search and one who fails the tab, so that a CSV built
	// from the whole conference rather than from the filters would carry a name
	// this test can name.
	await addApplicant(conference.id, {
		fullName: 'Elena Popescu',
		status: 'submitted',
		institutionName: 'Colegiul National',
		countryCode: 'RO',
		committeePreferences: [securityCouncil]
	});
	await addApplicant(conference.id, {
		fullName: 'Kofi Mensah',
		status: 'withdrawn',
		institutionName: 'Lyceum 7',
		countryCode: 'PL',
		committeePreferences: [securityCouncil]
	});

	await page.goto(conference.applicationsPath);
	await waitForTheApplicationsPage(page);

	await main.locator('input[name="q"]').fill('Lyceum');
	await applyTheFilters(main);

	await page.waitForURL(/q=Lyceum/, { timeout: DATABASE_TIMEOUT_MS });
	await expect(applicationCheckbox(main, wanted.applicationId)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// The button beside the title carries the same question the page is
	// answering, which is how the CSV comes to be filtered at all.
	await expect(main.getByRole('link', { name: 'Export CSV' })).toHaveAttribute('href', /q=Lyceum/);

	const csv = await page.request.get(`${conference.exportPath}?q=Lyceum&status=submitted`);

	expect(csv.status()).toBe(200);
	expect(csv.headers()['content-type']).toBe('text/csv; charset=utf-8');
	expect(csv.headers()['content-disposition']).toContain(
		`attachment; filename="applications-${conference.slug}-`
	);

	// RFC 4180 ends every row with a carriage return and a newline, which is what
	// `toCsvText` writes.
	const rows = (await csv.text()).trim().split('\r\n');
	const headings = rows[0].split(',');

	expect(headings).toContain('Name');
	expect(headings).toContain('Email');
	expect(headings).toContain('Institution');
	expect(headings).toContain('Preference 1');
	expect(headings).toContain('Preference 2');
	expect(headings).toContain('Motivation');
	expect(headings).toContain('Status');

	// One column per custom question, in the order the organiser put them in.
	expect(headings).toContain(allergiesLabel);
	expect(headings).toContain(languagesLabel);
	expect(headings.indexOf(allergiesLabel)).toBeLessThan(headings.indexOf(languagesLabel));

	// The heading row and one applicant: the search and the tab are the CSV's
	// filter too, so the other two are not in it.
	expect(rows).toHaveLength(2);
	expect(rows[1]).toContain('Ravi Menon');
	// The address comes from `profile_details`, which organisers may read for
	// everybody who applied to their conference.
	expect(rows[1]).toContain(wanted.user.email);
	expect(rows[1]).toContain('Peanuts');
	expect(rows[1]).toContain('Any P5 country, or Brazil');

	const wholeFile = rows.join('\r\n');

	expect(wholeFile).not.toContain('Elena Popescu');
	expect(wholeFile).not.toContain('Kofi Mensah');
});

test('answers the CSV of a conference somebody else runs with a 404', async ({ page }) => {
	const conference = await openApplicationsPage(page, 'Not My CSV MUN');

	// Their own CSV opens, so that the refusal below is about the reader and not
	// about the address being wrong.
	const mine = await page.request.get(conference.exportPath);

	expect(mine.status()).toBe(200);

	/*
		A second account, which runs no conference at all. Clearing the cookies is
		what ends the first account's session; without that, `/login` would send an
		account that is already signed in somewhere else.
	*/
	await page.context().clearCookies();

	const stranger = await createTestUser('Tomas Novak');
	await signIn(page, stranger);

	const refused = await page.request.get(conference.exportPath);

	// A 404 and not a 403, for the reason `manage.spec.ts` gives: an answer must
	// not tell anybody which conferences exist or who runs them. `requirePermission`
	// is what throws it, and the endpoint asks it before it reads a single row.
	expect(refused.status()).toBe(404);
});

test('shows cards instead of a table on a phone, and keeps the bulk bar in reach', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	// Long names on purpose. A line that may not wrap is as wide as its text
	// however narrow its column is, which is what pushes a page sideways, and a
	// short name would never show it.
	const conference = await openApplicationsPage(
		page,
		'Phone Applications International Model United Nations Conference'
	);
	const main = page.getByRole('main');

	const securityCouncil = await addCommittee(
		conference.id,
		'Historical Security Council of 1962',
		'HSC62'
	);

	const first = await addApplicant(conference.id, {
		fullName: 'Aleksandra Wisniewska-Kowalczyk',
		status: 'submitted',
		institutionName: 'Liceum Ogolnoksztalcace im. Marii Sklodowskiej-Curie',
		countryCode: 'PL',
		committeePreferences: [securityCouncil]
	});
	const second = await addApplicant(conference.id, {
		fullName: 'Bartholomew Fitzgerald-Montgomery',
		status: 'submitted',
		institutionName: 'The Royal Grammar School of Newcastle upon Tyne',
		countryCode: 'GB',
		committeePreferences: [securityCouncil]
	});

	await page.goto(conference.applicationsPath);
	await waitForTheApplicationsPage(page);

	await expect(applicationCheckbox(main, first.applicationId)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	/*
		A `<tr>` cannot be drawn outside a `<table>`, so the same list is drawn
		twice and one of the two is hidden at any width. Below `md` the hidden one
		is the table, and an element that is `display: none` is not a table any
		more as far as a screen reader — or `getByRole` — is concerned.
	*/
	await expect(main.getByRole('table')).toHaveCount(0);

	// The card is what is left, and its tick box works, which is what "bulk
	// selection still works through the checkbox in each card" means.
	await expect(shownText(main, 'Aleksandra Wisniewska-Kowalczyk')).toBeVisible();

	await applicationCheckbox(main, first.applicationId).check();
	await applicationCheckbox(main, second.applicationId).check();

	// Sticky at the bottom, so that it is still on screen at the end of a long
	// list rather than scrolled off the top of it.
	await expect(bulkActionBar(main)).toBeInViewport();
	await expect(bulkActionBar(main).getByRole('button', { name: 'Accept' })).toBeVisible();

	await expectNoSidewaysOverflow(page);
});

test('fits in a few screens', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough to measure a height.');

	const conference = await openApplicationsPage(page, 'Height Check Applications MUN');
	const main = page.getByRole('main');

	const securityCouncil = await addCommittee(conference.id, 'Security Council', 'UNSC');

	// A list with something real on it, each row carrying a name, a school, a
	// country, a preference, a day and a status.
	const applicants: Applicant[] = [];

	for (let index = 0; index < APPLICATIONS_FOR_THE_HEIGHT_TEST; index++) {
		applicants.push(
			await addApplicant(conference.id, {
				fullName: unusedName('Delegate'),
				status: 'submitted',
				institutionName: 'Lyceum 7',
				countryCode: 'PL',
				committeePreferences: [securityCouncil]
			})
		);
	}

	await page.goto(conference.applicationsPath);
	await waitForTheApplicationsPage(page);

	const lastApplicant = applicants[applicants.length - 1];

	await expect(applicationCheckbox(main, lastApplicant.applicationId)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// Saved before the assertion, so that a failure leaves a picture of the page
	// that failed it.
	await saveFullPageScreenshot(page, 'manage-applications');
	await expectPageFitsInScreens(page, MANAGE_APPLICATIONS_SCREENS);
});
