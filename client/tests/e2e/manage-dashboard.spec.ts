import { expect, test, type APIResponse, type Locator, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	createTestUser,
	giveSeat,
	makeConferenceStaff,
	removeConferenceStaff,
	signIn,
	type TestUser
} from './signed-in-user';
import { createDraftConferenceFor } from './draft-conference';
import {
	expectNoSidewaysOverflow,
	expectPageFitsInScreens,
	saveFullPageScreenshot
} from './page-shape';
import { answerConfirmationPage } from './confirmation-page';
import { openManageNavigation } from './manage-navigation';

// The acceptance criteria of `specs/05-pages/organiser/dashboard.md` that need
// a real browser: the conference dashboard at `/manage/[slug]`.
//
// * the sidebar marks the page the reader is on;
// * a draft has no dashboard: its `/manage/<slug>` sends the organiser on to
//   the setup step to continue;
// * unpublishing is offered only while applications are taken and nobody holds
//   a seat, the action refuses it once somebody does, and the setup step it
//   lands on says the conference is no longer public;
// * a conference that is over says when it ended, counts its awards among the
//   figures and offers "Archive" alone;
// * the figures match what the database holds for the seeded conference;
// * "Waiting for a decision" lists the newest submitted applications, newest
//   first, and a draft application is not one of them;
// * an action asks who is posting to it rather than trusting the page that drew
//   the button;
// * archiving works once a conference has been public and is over, and is
//   offered to a draft neither as a button nor by the action;
// * the page does not spill off a phone screen or run on for screens on a
//   desktop.
//
// Publishing, deleting a draft and the setup pages' "next step" lived on this
// page until the manage redesign moved them to the Publish step, and their tests
// to `manage-publish.spec.ts`.
//
// `tests/e2e/manage.spec.ts` keeps the tests about `/manage` itself and the two
// that open this page and read its title, eyebrow and sidebar. This file is
// about what is inside it; `manage-dashboard-phases.spec.ts` reads the page of
// each phase on the walkthrough seed's conferences (T173).
//
// EVERY ACTION WITHOUT JAVASCRIPT
// That criterion is met by these tests running on the `desktop-no-js` project
// like every other browser test, rather than by a test of its own: "Unpublish"
// and "Archive" are each a `ConfirmButton`, which opens a confirmation page
// asking the same question when there is no script to open its dialog. The two
// tests that measure the page are the exception, as they are in
// `manage.spec.ts`: they ask the browser for its own dimensions, and each runs
// on one project alone.
//
// WHAT THESE TESTS LEAVE BEHIND
// Each test creates its own conference through `./draft-conference`, with an
// organisation of its own, and what it creates stays in the database until the
// next `pnpm db:reset`. That is safe here for a different reason than in
// `manage.spec.ts`, which relies on everything it makes being a draft: these
// tests publish conferences. They are dated in 2020 instead, and the few that
// need a conference taking applications move it eight years ahead and archive
// it again afterwards (`moveIntoApplicationsPhase`). `/conferences` lists
// conferences that are published *and* have not finished, and
// `tests/e2e/conferences.spec.ts` counts what is in it, so a published
// conference of 2020 changes nothing it sees. The fixtures in `tests/db` are
// dated 2020 for the same reason.
//
// Nothing here takes a seat, an application or a team place from
// `supabase/seed.sql` except the one test that reads the seeded conference's
// figures, which puts its account on that conference's team and takes it off
// again in a `finally`.

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
 * Amsterdam Open MUN 2027 of `supabase/seed.sql`, the one conference with
 * committees, seats, an accepted application and an accepted delegation on it,
 * and so the only one whose dashboard has real figures to show.
 */
const SEEDED_CONFERENCE_ID = '20000000-0000-4000-8000-000000000009';
const SEEDED_CONFERENCE_SLUG = 'amsterdammun-2027';
const SEEDED_CONFERENCE_NAME = 'Amsterdam Open MUN 2027';

/**
 * The days every conference these tests create runs on, and its application
 * window.
 *
 * All four are in the past, for the reason at the top of this file. The window
 * closes before the first day, which is what checklist item 5 asks of it.
 */
const CONFERENCE_FIRST_DAY = '2020-05-03';
const CONFERENCE_LAST_DAY = '2020-05-05';
const APPLICATIONS_OPEN_AT = '2020-01-10T09:00:00.000Z';
const APPLICATIONS_CLOSE_AT = '2020-03-01T09:00:00.000Z';

/**
 * The picture a test conference's banner column points at.
 *
 * The checklist only asks whether the column is set at all, but the file behind
 * this one is real — `pnpm db:reset` uploads it for Amsterdam Open MUN 2027 —
 * so a page that draws the banner shows a picture rather than a broken image.
 */
const SAMPLE_BANNER_PATH =
	'conferences/20000000-0000-4000-8000-000000000009/banner-40000000-0000-4000-8000-000000000009.jpg';

/** The seat `addCommitteeWithASeat` puts in the committee it creates. */
const SEAT_NAME = 'Netherlands';

/**
 * How many windows tall the conference dashboard may be with everything on it
 * at once.
 *
 * One more than the frame was allowed while the page inside it was a holding
 * page. What is measured now is a page header, a row of four figures, Needs
 * you, the five applications waiting for a decision beside the Committees
 * list, and "If plans change" under both. The delegate dashboard is allowed
 * three for a page with more rows on it than this one, so three is the ceiling
 * here too:
 * more than that would mean these blocks are being drawn too big to be scanned,
 * which is exactly what `tests/e2e/page-shape.ts` exists to notice.
 */
const MANAGE_DASHBOARD_SCREENS = 3;

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

/**
 * Write columns straight onto a conference, the way the pages T20 to T67 build
 * one day will.
 *
 * The editors those columns belong to do not exist yet, so the service-role
 * client stands in for them, the way `giveSeat` in `./signed-in-user` stands in
 * for allocation. Every value the checklist asks about is text, which is why
 * this takes text and nothing else.
 */
async function updateConference(
	conferenceId: string,
	columns: Record<string, string>
): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin.from('conferences').update(columns).eq('id', conferenceId);

	if (error) {
		throw new Error(`Could not fill in the test conference: ${error.message}`);
	}
}

/**
 * Give a conference one committee with one seat on offer, and answer the
 * committee's id.
 *
 * Checklist item 4 asks for a committee *and* a seat in it, so the two are
 * written together: a committee with no seat leaves the item open.
 */
async function addCommitteeWithASeat(conferenceId: string): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('committees')
		.insert({ conference_id: conferenceId, name: 'General Assembly', slug: 'general-assembly' })
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test committee: ${error?.message}`);
	}

	const committeeId: string = data.id;

	// `is_available` and `kind` have defaults, so a seat is a committee and a
	// name. The name matters only to `giveSeat`, which is told which seat to take.
	const { error: seatError } = await admin
		.from('seats')
		.insert({ committee_id: committeeId, name: SEAT_NAME });

	if (seatError) {
		throw new Error(`Could not write the test seat: ${seatError.message}`);
	}

	return committeeId;
}

/** The id of the one committee a test conference was given above. */
async function readCommitteeId(conferenceId: string): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('committees')
		.select('id')
		.eq('conference_id', conferenceId)
		.maybeSingle();

	if (error || !data) {
		throw new Error(`Could not find the test conference's committee: ${error?.message}`);
	}

	return data.id;
}

/**
 * Publish a conference without going through the page.
 *
 * The test below proves that the button publishes; the tests about unpublishing
 * need a published conference to start from and not a second proof of that, so
 * they are handed one. The service-role client is never used to show that
 * something is allowed, which is what `tests/db/supabase-test-client.ts` warns
 * against — it is used here to arrange the state a test begins in.
 */
async function publishWithoutThePage(conferenceId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('conferences')
		.update({ status: 'published' })
		.eq('id', conferenceId);

	if (error) {
		throw new Error(`Could not publish the test conference: ${error.message}`);
	}
}

/**
 * How many days ahead a test conference moved into the Applications phase
 * starts: about eight years, later than every conference in the seed and than
 * the pager conferences of `conferences.spec.ts`, so a directory page nobody
 * filtered never opens on one of these.
 */
const APPLICATIONS_PHASE_START_IN_DAYS = 3000;

/** The ISO date `days` days from today. */
function isoDateInDays(days: number): string {
	const moment = new Date();

	moment.setDate(moment.getDate() + days);

	return moment.toISOString().slice(0, 10);
}

/**
 * Move a published test conference into the Applications phase: its days far
 * in the future and its application window open now, closing a week before
 * the first day.
 *
 * The dashboard draws what the conference's phase asks for (T173), and a
 * published conference of 2020 is over. The few tests that need a conference
 * taking applications move theirs here, and hand it to `takeOutOfTheDirectory`
 * in a `finally` unless the test itself makes it a draft again.
 */
async function moveIntoApplicationsPhase(conferenceId: string): Promise<void> {
	const admin = createServiceRoleClient();
	const opensAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
	const closesAt = `${isoDateInDays(APPLICATIONS_PHASE_START_IN_DAYS - 7)}T12:00:00.000Z`;

	const { error } = await admin
		.from('conferences')
		.update({
			start_date: isoDateInDays(APPLICATIONS_PHASE_START_IN_DAYS),
			end_date: isoDateInDays(APPLICATIONS_PHASE_START_IN_DAYS + 2),
			applications_open_at: opensAt,
			applications_close_at: closesAt
		})
		.eq('id', conferenceId);

	if (error) {
		throw new Error(`Could not move the test conference into applications: ${error.message}`);
	}
}

/**
 * Archive a test conference that `moveIntoApplicationsPhase` left published,
 * so it leaves the directory, which lists published conferences that are not
 * over, before the next test reads it.
 */
async function takeOutOfTheDirectory(conferenceId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('conferences')
		.update({ status: 'archived' })
		.eq('id', conferenceId);

	if (error) {
		throw new Error(`Could not archive the test conference: ${error.message}`);
	}
}

/** The status column of one conference, for a test that says nothing changed. */
async function readConferenceStatus(conferenceId: string): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('conferences')
		.select('status')
		.eq('id', conferenceId)
		.maybeSingle();

	if (error || !data) {
		throw new Error(`Could not read the conference's status: ${error?.message}`);
	}

	return data.status;
}

/**
 * Do the three required setup steps straight in the database, so the
 * conference is ready to be published: a committee with a seat, the details
 * (the description and tagline, the venue and the contact email) and the
 * application window. Each is what `$lib/publish-checklist.ts` asks of its
 * step. The banner is only recommended, and is set as well so that a page
 * drawing it shows a picture. The window opened in 2020, long before today, so
 * for applicants it opens the moment the conference is published.
 */
async function finishEveryRequiredItem(conferenceId: string): Promise<void> {
	await addCommitteeWithASeat(conferenceId);

	await updateConference(conferenceId, {
		description: 'Three days of debate, written out so the description is not empty.',
		tagline: 'Three days of debate on the water.',
		banner_path: SAMPLE_BANNER_PATH,
		venue_name: 'Beurs van Berlage',
		contact_email: 'hello@example.test'
	});

	await updateConference(conferenceId, {
		applications_open_at: APPLICATIONS_OPEN_AT,
		applications_close_at: APPLICATIONS_CLOSE_AT
	});
}

/** What `writeApplication` puts in the table. */
type TestApplication = {
	conferenceId: string;
	/** An application has to name at least one committee it would like. */
	committeeId: string;
	/** The applicant's account. An application belongs to a real person. */
	userId: string;
	status: 'draft' | 'submitted';
	/** An ISO timestamp. Only a submitted application has one. */
	submittedAt?: string;
};

/**
 * Put one application against a conference.
 *
 * Applying has no form yet — `/conferences/[slug]/apply` is T24 — so the
 * service-role client writes the row the way `giveNotifications` in
 * `./signed-in-user` stands in for a trigger. A submitted application has to
 * name a committee and give a motivation, both of which a trigger insists on,
 * and one account may apply to a conference only once, which is why every test
 * below that wants two applications makes two accounts.
 */
async function writeApplication(application: TestApplication): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin.from('applications').insert({
		conference_id: application.conferenceId,
		user_id: application.userId,
		status: application.status,
		committee_preferences: [application.committeeId],
		motivation: 'A test application, written so the dashboard has something to show.',
		submitted_at: application.submittedAt ?? null
	});

	if (error) {
		throw new Error(`Could not write the test application: ${error.message}`);
	}
}

/** The figures one conference's dashboard should be showing. */
type ConferenceNumbers = {
	/** Applications of every status but `draft`. */
	applications: number;
	delegations: number;
	/** Seats the organisers are offering. */
	seatsAvailable: number;
	/** Available seats with somebody in them. */
	seatsFilled: number;
	invoicesPaidCents: number;
	/** The conference's own currency, such as `EUR`. */
	currency: string;
};

/** One `seats` row, as the two seat numbers count it. */
type SeatRow = {
	is_available: boolean;
	user_id: string | null;
};

/** One `invoices` row, as the money figure adds it up. */
type InvoiceRow = {
	status: string;
	amount_cents: number;
};

/**
 * Read those figures straight out of the database, the same way
 * `loadConferenceDashboard` in `src/lib/server/manage.ts` works them out.
 *
 * Read rather than written down here on purpose: `supabase/seed.sql` changes,
 * and a test that holds its own copy of the numbers becomes a trap for whoever
 * changes it next.
 */
async function readConferenceNumbers(conferenceId: string): Promise<ConferenceNumbers> {
	const admin = createServiceRoleClient();

	const { data: conference, error: conferenceError } = await admin
		.from('conferences')
		.select('currency')
		.eq('id', conferenceId)
		.maybeSingle();

	if (conferenceError || !conference) {
		throw new Error(`Could not read the conference: ${conferenceError?.message}`);
	}

	// A draft is somebody's half-filled form that the organisers have never seen,
	// so neither figure counts one.
	const { data: applications, error: applicationsError } = await admin
		.from('applications')
		.select('status')
		.eq('conference_id', conferenceId)
		.neq('status', 'draft');

	if (applicationsError) {
		throw new Error(`Could not count the applications: ${applicationsError.message}`);
	}

	const { data: delegations, error: delegationsError } = await admin
		.from('delegations')
		.select('status')
		.eq('conference_id', conferenceId)
		.neq('status', 'draft');

	if (delegationsError) {
		throw new Error(`Could not count the delegations: ${delegationsError.message}`);
	}

	// A seat belongs to a committee and carries no conference of its own, so the
	// committees have to be found first.
	const { data: committees, error: committeesError } = await admin
		.from('committees')
		.select('id')
		.eq('conference_id', conferenceId);

	if (committeesError) {
		throw new Error(`Could not read the committees: ${committeesError.message}`);
	}

	const committeeIds: string[] = (committees ?? []).map(
		(committee: { id: string }) => committee.id
	);
	let seatRows: SeatRow[] = [];

	if (committeeIds.length > 0) {
		const { data: seats, error: seatsError } = await admin
			.from('seats')
			.select('is_available, user_id')
			.in('committee_id', committeeIds);

		if (seatsError) {
			throw new Error(`Could not read the seats: ${seatsError.message}`);
		}

		seatRows = seats ?? [];
	}

	const availableSeats = seatRows.filter((seat) => seat.is_available);
	const filledSeats = availableSeats.filter((seat) => seat.user_id !== null);

	const { data: invoices, error: invoicesError } = await admin
		.from('invoices')
		.select('status, amount_cents')
		.eq('conference_id', conferenceId);

	if (invoicesError) {
		throw new Error(`Could not read the invoices: ${invoicesError.message}`);
	}

	const invoiceRows: InvoiceRow[] = invoices ?? [];
	let invoicesPaidCents = 0;

	for (const invoice of invoiceRows) {
		if (invoice.status === 'paid') {
			invoicesPaidCents += invoice.amount_cents;
		}
	}

	return {
		applications: (applications ?? []).length,
		delegations: (delegations ?? []).length,
		seatsAvailable: availableSeats.length,
		seatsFilled: filledSeats.length,
		invoicesPaidCents,
		currency: conference.currency
	};
}

/**
 * An amount of cents as the page writes it: 234000 in EUR is "€2,340.00".
 *
 * The same two lines as `formatMoney` in `src/lib/money.ts`, which is what the
 * page uses. Playwright compiles the files in `tests/` on their own, without
 * the `$lib` alias the app is built with, so a test that reads an amount out of
 * the database has to word it the same way here.
 */
function formatMoney(amountCents: number, currency: string): string {
	return new Intl.NumberFormat('en-GB', {
		style: 'currency',
		currency,
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	}).format(amountCents / 100);
}

/**
 * Write `text` into a regular expression so that it matches itself and nothing
 * else: "€2,340.00" has a dot in it, which a pattern reads as "any character".
 */
function escapeForPattern(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The one figure in the row along the top that shows this value over this
 * label.
 *
 * `StatStrip` draws each figure as a list item holding the value and then the
 * label, which may go on with a note ("Applications · 3 to review"). The
 * sidebar has a link called "Applications" too, with a count after it, so a
 * figure is found by its value *followed by* its label, which only the row of
 * figures has. `^` and `\s*` let the pattern ignore the space around the words.
 */
function statTile(main: Locator, label: string, value: string): Locator {
	const valueThenLabel = `^\\s*${escapeForPattern(value)}\\s*${escapeForPattern(label)}(\\s*·|\\s*$)`;

	return main.getByRole('listitem').filter({ hasText: new RegExp(valueThenLabel) });
}

/** Says that the figure with this label on it is showing this value. */
async function expectStat(main: Locator, label: string, value: string): Promise<void> {
	await expect(statTile(main, label, value)).toBeVisible({ timeout: SINGLE_TRY_TIMEOUT_MS });
}

/**
 * Press a `ConfirmButton` and answer the question it asks.
 *
 * With JavaScript the press opens a `<dialog>` and the dialog's own button is
 * what submits. Without it — which is the `desktop-no-js` project, and also any
 * page whose script has not landed yet — the press opens a confirmation page
 * asking the same question, whose own button is what submits. Both are the
 * right behaviour, so this waits to see which of the two happened rather than
 * assuming one.
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

/**
 * Every filled (primary) button or button-styled link the reader can see on
 * the page, which P1 of `03-design/streamlining/design.md` allows one of at
 * most. `bg-primary` is the primary variant's fill in `$lib/button-classes.ts`,
 * the same measure `chair-room-opening.spec.ts` takes of the chair room.
 * `bg-brand-900` is the old name the chair room's own buttons still use.
 */
function filledControls(page: Page): Locator {
	return page
		.getByRole('main')
		.locator(
			'a:is(.bg-primary, .bg-brand-900):visible, button:is(.bg-primary, .bg-brand-900):visible'
		);
}

/**
 * Post to one of the page's form actions the way a browser posts a form.
 *
 * A button the page drew disabled proves only what the page did; the criterion
 * is that the action itself refuses, so these tests ask it directly.
 * `page.request` carries the browser's own cookies, so the post arrives signed
 * in as the account the test signed in. Two headers are written by hand.
 * `origin`, because SvelteKit refuses a form post that looks as though it came
 * from another website and Playwright's request does not send that header
 * itself. And `accept: text/html`, because that is how SvelteKit tells a form
 * post from a page with no JavaScript apart from one made by `use:enhance`:
 * without it the answer is the action's result as JSON under a 200, and with it
 * the page is drawn again carrying the status the action chose, which is what a
 * browser with no script really receives and so what these tests are about.
 */
async function postFormAction(page: Page, action: string): Promise<APIResponse> {
	const origin = new URL(page.url()).origin;

	return page.request.post(action, {
		form: {},
		headers: { origin, accept: 'text/html' }
	});
}

/**
 * A signed-in account with a conference of its own, ready for a test to work on.
 *
 * Each test below makes its conference what it needs first
 * and only then opens `managePath`.
 */
type TestConference = {
	user: TestUser;
	id: string;
	slug: string;
	name: string;
	/** The `/manage/<slug>` address of its dashboard. */
	managePath: string;
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

	return { user, id, slug, name, managePath };
}

/*
	Every test here signs a brand-new account in, seeds a draft conference
	and then writes the rows the dashboard is meant to show, reading the page
	again after each one. That is a great deal more than most browser tests do,
	and thirty seconds — what Playwright allows a test by default — is not always
	enough for it while the whole suite is asking the one local database at once.
	`test.slow()` triples that allowance. It is an allowance and not a wait: a
	test that is quick still finishes as quickly as it can.
*/
test.beforeEach(() => {
	test.slow();
});

test('sends a draft on to the creation step to continue, since a draft has no dashboard', async ({
	page
}) => {
	const conference = await signInWithAConference(page, 'Draft Redirect MUN');

	// A draft is finished in the creation flow (Trello fe3reN7Y), which keeps
	// the step it reached in `creation_step`. The draft `signInWithAConference`
	// makes has reached Setup. The dashboard's address is what the organiser
	// area's list links to, so it has to lead somewhere useful.
	await page.goto(conference.managePath);

	await expect(page).toHaveURL(new RegExp(`/create/${conference.slug}/setup$`), {
		timeout: DATABASE_TIMEOUT_MS
	});

	// Once the organiser has got as far as Launch, that is where the same
	// address takes them, however much of the old checklist is done.
	await finishEveryRequiredItem(conference.id);
	await updateConference(conference.id, { creation_step: 'launch' });
	await page.goto(conference.managePath);

	await expect(page).toHaveURL(new RegExp(`/create/${conference.slug}/launch$`), {
		timeout: DATABASE_TIMEOUT_MS
	});
});

test('takes a published conference back out of the world', async ({ page }) => {
	const conference = await signInWithAConference(page, 'Unpublish MUN');

	await finishEveryRequiredItem(conference.id);
	// A conference that was published went through every creation step, so
	// the step it carries on from once it is a draft again is the last, Launch.
	await updateConference(conference.id, { creation_step: 'launch' });
	await publishWithoutThePage(conference.id);
	// "Unpublish" is offered only while applications are taken or seats given
	// out. The test makes the conference a draft again itself, which takes it
	// back out of the directory.
	await moveIntoApplicationsPhase(conference.id);
	await page.goto(conference.managePath);

	const main = page.getByRole('main');

	// `ManageSection` names its block after its title, which makes it a region
	// a screen reader can jump to and a test can look inside.
	await expect(main.getByRole('region', { name: 'If plans change' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// Nobody holds a seat in this conference, so the question is the only thing
	// between it and being a draft again.
	await pressAndConfirm(page, 'Unpublish');

	// A draft has no dashboard, so the organiser lands back in the creation
	// flow, on Launch. The message the action left has to survive the
	// redirects on the way, which is why `load` leaves it again before sending
	// the draft on.
	await expect(page).toHaveURL(new RegExp(`/create/${conference.slug}/launch$`), {
		timeout: DATABASE_TIMEOUT_MS
	});

	// The flash toast floats above the page rather than inside `<main>`, which is
	// why this assertion is not scoped to it.
	await expect(page.getByText(`${conference.name} is no longer public.`)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect(await readConferenceStatus(conference.id)).toBe('draft');
});

test('refuses to unpublish once somebody holds a seat', async ({ page }) => {
	const conference = await signInWithAConference(page, 'Seated MUN');

	await finishEveryRequiredItem(conference.id);
	await publishWithoutThePage(conference.id);
	await moveIntoApplicationsPhase(conference.id);

	try {
		// A delegate of this conference and no other. The seat is in the committee
		// `finishEveryRequiredItem` made, so no seat of `supabase/seed.sql` is
		// touched and there is nothing to give back afterwards.
		const delegate = await createTestUser('Noor Haddad');
		const committeeId = await readCommitteeId(conference.id);
		const main = page.getByRole('main');

		// Before the seat, "If plans change" offers "Unpublish".
		await page.goto(conference.managePath);
		await expect(main.getByRole('button', { name: 'Unpublish' })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		await giveSeat(delegate, committeeId, SEAT_NAME);
		await page.reload();

		// Waited for, so the two checks below are made on the page drawn after the
		// seat was given and not on an empty one.
		await expect(main.getByRole('region', { name: 'Needs you' })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		// Once somebody holds a seat the action would only ever be refused, so
		// the page no longer offers it, and there is nothing else in that block
		// while applications are taken (T173).
		await expect(main.getByRole('button', { name: 'Unpublish' })).toHaveCount(0);
		await expect(main.getByRole('region', { name: 'If plans change' })).toHaveCount(0);

		// The action says so for itself, because a button that is not drawn is not
		// a rule. Somebody has been told they have a seat, and taking the
		// conference off the directory would take that seat away from under them.
		const response = await postFormAction(page, `${conference.managePath}?/unpublish`);

		expect(response.status()).toBe(400);
		expect(await response.text()).toContain(
			'You cannot unpublish once delegates are seated. Archive it after the conference instead.'
		);

		// The refusal is the whole point, so the conference is still published.
		expect(await readConferenceStatus(conference.id)).toBe('published');
	} finally {
		await takeOutOfTheDirectory(conference.id);
	}
});

test('archives a conference that is over, once it has been public', async ({ page }) => {
	const conference = await signInWithAConference(page, 'Archive MUN');

	// Every conference these tests make ran in 2020, so it is already over. Being
	// over is only half of it: archiving is about leaving the directory, so the
	// conference has to have been in it.
	await finishEveryRequiredItem(conference.id);
	await publishWithoutThePage(conference.id);
	await page.goto(conference.managePath);

	const main = page.getByRole('main');

	// Over, so the After phase (T173): the sentence under the title says when
	// it ended, the figures count the awards, "Wrapping up" has no line whose
	// button is filled, and "When everything is done" offers "Archive" alone.
	// Each phase's sentence is `dashboardStatusSentence`'s work and is tested in
	// `src/lib/dashboard-status.test.ts`. 5 May 2020 was a Tuesday.
	await expect(main.getByText('The conference ended on Tuesday 5 May.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expectStat(main, 'Awards', '0');
	await expect(main.getByRole('region', { name: 'Wrapping up' })).toBeVisible();
	await expect(filledControls(page)).toHaveCount(0);
	await expect(main.getByRole('button', { name: 'Unpublish' })).toHaveCount(0);

	const lastBlock = main.getByRole('region', { name: 'When everything is done' });

	await expect(lastBlock.getByRole('button', { name: 'Archive' })).toBeVisible();

	await pressAndConfirm(page, 'Archive');

	await expect(page.getByText(`${conference.name} is archived.`)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect(await readConferenceStatus(conference.id)).toBe('archived');

	// An archived conference keeps its dashboard, which still says when it
	// ended, but nothing is left to archive, so the block that offered it goes.
	await expect(main.getByText('The conference ended on Tuesday 5 May.')).toBeVisible();
	await expect(lastBlock).toHaveCount(0);
	await expect(main.getByRole('button', { name: 'Archive' })).toHaveCount(0);
});

test('offers no Archive on a draft, however long ago it was meant to happen', async ({ page }) => {
	const conference = await signInWithAConference(page, 'Never Published MUN');

	const main = page.getByRole('main');

	// The same 2020 dates as the test above, and the same everything else. The
	// only difference is that this one was never made public, and a conference
	// that was never in the directory does not leave it: it is deleted. A draft
	// has no dashboard, so there is no Archive button to find on the creation
	// step its address sends it to.
	await page.goto(conference.managePath);
	await expect(page).toHaveURL(new RegExp(`/create/${conference.slug}/setup$`), {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(main.getByRole('button', { name: 'Archive' })).toHaveCount(0);

	// And the action refuses for itself, because a button that is not drawn is
	// not a rule. What it says ("Only a published conference can be archived.")
	// is checked in `page.server.test.ts`: after a refusal SvelteKit draws the
	// page again, and a draft's page sends it on into the creation flow, so the
	// browser follows that redirect and the words never reach it.
	const response = await postFormAction(page, `${conference.managePath}?/archive`);

	expect(new URL(response.url()).pathname).toBe(`/create/${conference.slug}/setup`);
	expect(await readConferenceStatus(conference.id)).toBe('draft');
});

test('shows the figures the database holds for the seeded conference', async ({ page }) => {
	const organiser = await createTestUser('Amara Okafor');

	await makeConferenceStaff(organiser, SEEDED_CONFERENCE_ID, 'organiser');

	try {
		await signIn(page, organiser);
		await page.goto(`/manage/${SEEDED_CONFERENCE_SLUG}`);

		const main = page.getByRole('main');

		await expect(main.getByRole('heading', { level: 1 })).toHaveText(SEEDED_CONFERENCE_NAME, {
			timeout: DATABASE_TIMEOUT_MS
		});

		// The database and the page are read again together until they agree.
		// `committee-page.spec.ts`, `home.spec.ts` and `profile.spec.ts` hand
		// delegates seats in this conference's committees while this test is
		// running, so how many seats are filled can change between the two reads,
		// and a single pass would sometimes compare one moment with another.
		//
		// The seeded conference is taking applications, and these are the four
		// figures of that phase (`dashboardFigures` in `src/lib/dashboard-figures.ts`).
		await expect(async () => {
			const numbers = await readConferenceNumbers(SEEDED_CONFERENCE_ID);
			const delegationLabel =
				numbers.delegations === 1 ? 'Delegation request' : 'Delegation requests';

			await page.reload();

			await expectStat(main, 'Applications', String(numbers.applications));
			await expectStat(main, 'Seats filled', `${numbers.seatsFilled} of ${numbers.seatsAvailable}`);
			await expectStat(main, delegationLabel, String(numbers.delegations));
			await expectStat(main, 'Paid', formatMoney(numbers.invoicesPaidCents, numbers.currency));
		}).toPass({ timeout: DATABASE_TIMEOUT_MS });
	} finally {
		// In a `finally`, so that a failed assertion still leaves the conference as
		// the next test expects to find it.
		await removeConferenceStaff(organiser.id, SEEDED_CONFERENCE_ID);
	}
});

test('lists the applications waiting for a decision, newest first', async ({ page }) => {
	const conference = await signInWithAConference(page, 'Applications MUN');

	// The list is drawn while applications are taken and seats given out, so
	// the conference is published and moved into its application window.
	await finishEveryRequiredItem(conference.id);
	await publishWithoutThePage(conference.id);
	await moveIntoApplicationsPhase(conference.id);

	try {
		const committeeId = await readCommitteeId(conference.id);
		const main = page.getByRole('main');

		// `ManageSection` gives the block an `aria-label` with its own title, which
		// makes it a region a screen reader can jump to and a test can look inside.
		const waiting = main.getByRole('region', { name: 'Waiting for a decision' });

		// Nothing has been sent in yet, which is the empty state the spec names.
		await page.goto(conference.managePath);
		await expect(
			waiting.getByRole('heading', { name: 'Nothing is waiting for a decision.' })
		).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

		// Three applicants, because one account may apply to a conference only once.
		const earlier = await createTestUser('Mateo Rossi');
		const later = await createTestUser('Aiko Tanaka');
		const stillWriting = await createTestUser('Tomas Novak');

		const now = Date.now();
		const oneMinute = 60 * 1000;

		await writeApplication({
			conferenceId: conference.id,
			committeeId,
			userId: earlier.id,
			status: 'submitted',
			submittedAt: new Date(now - oneMinute).toISOString()
		});
		await writeApplication({
			conferenceId: conference.id,
			committeeId,
			userId: later.id,
			status: 'submitted',
			submittedAt: new Date(now).toISOString()
		});
		await writeApplication({
			conferenceId: conference.id,
			committeeId,
			userId: stillWriting.id,
			status: 'draft'
		});

		await page.reload();

		// Newest first: one name comes before the other in the section's own words.
		await expect(waiting).toHaveText(new RegExp(`${later.fullName}[\\s\\S]*${earlier.fullName}`), {
			timeout: DATABASE_TIMEOUT_MS
		});

		// The quiet line under a name says where the applicant studies. Every account
		// `createTestUser` makes is at the same one. The section draws the list
		// twice, as a table on a computer and as a list on a phone, and hides the
		// one that does not fit the screen, so only a visible line counts.
		await expect(
			waiting.getByText('Delft University').filter({ visible: true }).first()
		).toBeVisible();

		// A draft is a half-filled form that has been sent to nobody, so it is not
		// waiting for a decision and is not on the list.
		await expect(main.getByText(stillWriting.fullName)).toHaveCount(0);

		// Each applicant's name is a link to that application's review page.
		// `getByRole` leaves out what is hidden, so this finds the visible one.
		await waiting.getByRole('link', { name: later.fullName }).click();
		await expect(page).toHaveURL(/\/manage\/[^/]+\/applications\/[^/?]+$/);
		await expect(page.getByRole('heading', { level: 1, name: later.fullName })).toBeVisible();
	} finally {
		await takeOutOfTheDirectory(conference.id);
	}
});

test('marks the dashboard as the page the reader is on', async ({ page }) => {
	const conference = await signInWithAConference(page, 'Sidebar MUN');

	// A draft has no dashboard, nor a "Dashboard" link, so the conference is
	// published first. It ran in 2020, so it is over and never in the directory.
	await finishEveryRequiredItem(conference.id);
	await publishWithoutThePage(conference.id);
	await page.goto(conference.managePath);

	// The sidebar of the organiser frame. `aria-label` is what names a navigation
	// for a screen reader, and this page has two of them: the top bar's "Main"
	// and this one. On a phone it is a section menu, which has to be opened.
	const sidebar = await openManageNavigation(page);

	// `aria-current="page"` is what `ManageSidebarLink.svelte` puts on the link
	// of the page being read, and it is what a screen reader says "current page"
	// for.
	//
	// This test earns its keep on the `desktop-no-js` project, and only there.
	// `resolve()` answers a *relative* address while a page is being built on
	// the server, so `manageSidebarGroups` cannot simply compare it with the
	// address the reader asked for; with JavaScript the browser works it out
	// again a moment later and marks the link either way, which hides the
	// mistake everywhere else. No unit test can see it, because `resolve()`
	// answers absolutely outside a real server render.
	await expect(sidebar.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
		'aria-current',
		'page',
		{ timeout: DATABASE_TIMEOUT_MS }
	);
});

test('answers somebody who posts to an action of a conference they do not run', async ({
	page
}) => {
	const stranger = await createTestUser();
	await signIn(page, stranger);

	const response = await postFormAction(page, `/manage/${SEEDED_CONFERENCE_SLUG}?/archive`);

	// A 404 rather than a 403, for the reason `manage.spec.ts` gives about the
	// page itself: the answer must not tell a stranger which conferences exist.
	// The action checks the role for itself rather than trusting the page that
	// drew the button, which is what the criterion asks.
	expect(response.status()).toBe(404);

	// The seeded conference is published, and posting at it changed nothing.
	expect(await readConferenceStatus(SEEDED_CONFERENCE_ID)).toBe('published');
});

test('nothing spills off the side of a phone screen', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	// Long names on purpose. A line that may not wrap is as wide as its text
	// however narrow its column is, which is what pushes a page sideways, and a
	// short name would never show it.
	const conference = await signInWithAConference(
		page,
		'Phone Dashboard International Model United Nations Conference'
	);

	// A dashboard with real figures on it rather than a row of zeroes: a
	// committee with a seat, taking applications, and somebody waiting for an
	// answer. A conference day is measured on a phone by
	// `manage-dashboard-phases.spec.ts`.
	await finishEveryRequiredItem(conference.id);
	await publishWithoutThePage(conference.id);
	await moveIntoApplicationsPhase(conference.id);

	try {
		const committeeId = await readCommitteeId(conference.id);
		const applicant = await createTestUser('Aleksandra Kowalczyk-Nowakowska');

		await writeApplication({
			conferenceId: conference.id,
			committeeId,
			userId: applicant.id,
			status: 'submitted',
			submittedAt: new Date().toISOString()
		});

		await page.goto(conference.managePath);

		// Wait for the page to have its figures on it before measuring, or the
		// measurement would be of a page that is not the one this test is about.
		// A link, because the name is drawn twice (a table for a computer, a list
		// for a phone) and `getByRole` finds only the one on show.
		await expect(
			page.getByRole('main').getByRole('link', { name: applicant.fullName })
		).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

		await expectNoSidewaysOverflow(page);
	} finally {
		await takeOutOfTheDirectory(conference.id);
	}
});

test('a full dashboard fits in a few screens', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough to measure a height.');

	const conference = await signInWithAConference(page, 'Height Check Dashboard MUN');

	// The tallest the page ever is: taking applications, so Needs you, the
	// figures, "Waiting for a decision", Committees and "If plans change" are
	// all on it, with no fee so that "No fees yet" is a line too, and as many
	// applications as the section will show.
	await finishEveryRequiredItem(conference.id);
	await publishWithoutThePage(conference.id);
	await moveIntoApplicationsPhase(conference.id);

	try {
		const committeeId = await readCommitteeId(conference.id);

		// Five, which is as many as the section ever shows, so this is the longest
		// that list can be.
		const applicantNames = [
			'Noor Haddad',
			'Mateo Rossi',
			'Aiko Tanaka',
			'Daniel Perez',
			'Amara Okafor'
		];
		const now = Date.now();

		for (const [index, applicantName] of applicantNames.entries()) {
			const applicant = await createTestUser(applicantName);

			await writeApplication({
				conferenceId: conference.id,
				committeeId,
				userId: applicant.id,
				status: 'submitted',
				// A minute apart, so the five have an order to be listed in.
				submittedAt: new Date(now - index * 60 * 1000).toISOString()
			});
		}

		await page.goto(conference.managePath);

		const main = page.getByRole('main');

		// Wait for the newest application to be on the page before measuring, or
		// the page would be measured before the thing this test is about is on it.
		// A link, for the reason the phone test above gives.
		await expect(main.getByRole('link', { name: applicantNames[0] })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(main.getByText('No fees yet: delegates will not be invoiced')).toBeVisible();

		// Saved before the assertion, so that a failure leaves a picture of the
		// page that failed it.
		await saveFullPageScreenshot(page, 'manage-dashboard');
		await expectPageFitsInScreens(page, MANAGE_DASHBOARD_SCREENS);
	} finally {
		await takeOutOfTheDirectory(conference.id);
	}
});
