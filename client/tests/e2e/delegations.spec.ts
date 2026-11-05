import { expect, test, type APIResponse, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	expectNoSidewaysOverflow,
	expectPageFitsInScreens,
	saveFullPageScreenshot
} from './page-shape';
import {
	createTestUser,
	giveApplication,
	makeConferenceStaff,
	signIn,
	type TestUser
} from './signed-in-user';
import { answerConfirmationPage } from './confirmation-page';

// The acceptance criteria of `specs/05-pages/delegation/new.md` and
// `specs/05-pages/delegation/dashboard.md` that need a real browser, for the two
// pages task T25 builds at `/conferences/[slug]/delegations/new` and
// `/delegations/[delegationId]`:
//
// * every reason a conference will not take a delegation redirects to that
//   conference with the quoted flash, and the form is never drawn at all;
// * the institution and the country arrive already filled in from the profile;
// * an empty form answers with every message at once, and a refused form keeps
//   what was typed;
// * registering writes the delegation and its head together, and the join code
//   the database mints is eight characters with no 0, O, 1 or I among them;
// * the dashboard is a 404 for a signed-in stranger and the login page for a
//   visitor;
// * every status shows its own badge and its own sentence, word for word,
//   including the organisers' note on one that was not accepted;
// * a head sees the seats requested, allocated and assigned, the join code and
//   the link to share, and "Copy link" puts that link on the clipboard;
// * a member sees their own seat and never the join code;
// * Submit and Withdraw follow the status machine and refuse with the quoted
//   messages;
// * the details can still be saved while the request is under review, and no
//   longer once the organisers have accepted it;
// * neither page spills off a phone screen or runs on for screens on a desktop.
//
// NOT TESTED HERE, AND NOT FORGOTTEN
// `/delegations/[delegationId]/members` is `tests/e2e/delegation-members.spec.ts`.
// That page and the Members tab both exist now, and everything about them — who
// may open the page, the list of people with their join dates and their seats,
// Make head, Step down, Remove, the invite card and the private details behind
// each row's toggle — is proved there. So nothing here looks for either; the
// people in a delegation are only ever counted below, never listed.
//
// `/delegations/[delegationId]/seats` is `tests/e2e/delegation-seats.spec.ts`.
// That page and the "Assign members →" link the progress card offers a head both
// exist, and everything about them — who may open the page, seating somebody,
// freeing a seat again, and the link being drawn for a head and not for a member
// — is proved there. This file stays about registering, the dashboard and the
// join code, so nothing here presses that link.
//
// The invoices card is **T31**, and a delegation only gets an invoice from
// `allocate_delegation_seats`, which is **T27**. No delegation here has one, and
// the dashboard draws no invoices card at all.
//
// The tab strip is in `src/routes/delegations/[delegationId]/+layout.svelte`, and
// it is tested in `tests/e2e/delegation-members.spec.ts` as well, because T70
// wrote the strip along with the page its second tab leads to. That a head is
// given four tabs, that the Members one really leads there, that the tab of the
// page being read is the one marked as current and that a plain member is given
// only Overview and Papers (T147) are all proved there, so nothing here presses
// a tab.
//
// `/join/[joinCode]` is `tests/e2e/join-delegation.spec.ts`. Nothing here opens
// a join link; the join code is only read off the dashboard as text.
//
// The "Register a delegation" button on the public conference page, which is
// what leads to the form, belongs to `tests/e2e/conference-page.spec.ts` and is
// already watched there.
//
// EVERY BUTTON WITHOUT JAVASCRIPT
// The last criterion of `new.md` — that it all works with scripting switched off
// — is met by these tests running on the `desktop-no-js` project like every
// other browser test, rather than by a test of its own. Every button below is a
// real submit button in a real `<form method="post">`. The three tests that ask
// the browser for its own dimensions, and the one that reads the clipboard, each
// run on one project alone.
//
// WHAT THESE TESTS LEAVE BEHIND
// Every conference made here is made by `createTestConference` and taken away
// again in a `finally`, which takes its committees, its seats, its delegations
// and their members with it. Four seeded conferences are read and never written
// to: `viennamun-2027`, which takes no delegations, `copenhagenmun-2027` and
// `madridmun-2027`, whose windows are shut on either side, and the conference
// each refusal sends the reader back to. The accounts stay until the next
// `pnpm db:reset`, as they do everywhere else.
//
// `createTestConference`, `postFormAction` and `pressAndConfirm` below are
// copies of the ones in `tests/e2e/apply.spec.ts`, `tests/e2e/application.spec.ts`
// and `tests/e2e/manage-application-form.spec.ts`, deliberately rather than
// shared imports, for the reason those files give about their own copies: each
// wants its own conference and its own fields.

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
 * Short on purpose: the block around it is what waits, and a try that waited the
 * full fifteen seconds would only ever run once.
 */
const SINGLE_TRY_TIMEOUT_MS = 2_000;

/** The organisation `supabase/seed.sql` makes, which the conferences below go in. */
const SAMPLE_ORGANIZATION_ID = '10000000-0000-4000-8000-000000000001';

/**
 * The days a conference made here runs on.
 *
 * Both are in the past, for the reason `tests/e2e/conferences.spec.ts` gives
 * about the conferences its own fixtures leave behind: `/conferences` lists
 * conferences that are published *and* have not finished, and that file counts
 * what is in the directory, so a conference dated this way disturbs nothing
 * there. Nothing on either page under test asks when the conference happens —
 * `canCreateDelegation` and `canSubmitDelegation` read the application window
 * and not the dates — so a finished conference is still one a group may be
 * registered for.
 */
const CONFERENCE_FIRST_DAY = '2020-05-03';
const CONFERENCE_LAST_DAY = '2020-05-05';

/**
 * A day and three months in milliseconds, for a window that is open right now.
 *
 * The window has to be open at the moment the test runs rather than on a date
 * written down here, because `canCreateDelegation` judges it against the clock.
 */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const THREE_MONTHS_MS = 90 * ONE_DAY_MS;

/**
 * Three conferences of `supabase/seed.sql`, one for each refusal that needs a
 * conference set up in a way no test conference here is.
 *
 * Vienna takes individual applications and no delegations at all, because a
 * university society signs its own members up rather than whole schools;
 * Copenhagen opens in 45 days and Madrid closed a fortnight ago, which is
 * exactly the two reasons a window can give. They are only read here, never
 * written to, and `tests/e2e/apply.spec.ts` reads the last two for the same
 * reason.
 */
const NO_DELEGATIONS_SLUG = 'viennamun-2027';
const NO_DELEGATIONS_NAME = 'Vienna University MUN 2027';
const NOT_YET_OPEN_SLUG = 'copenhagenmun-2027';
const NOT_YET_OPEN_NAME = 'Copenhagen Schools MUN 2027';
const ALREADY_CLOSED_SLUG = 'madridmun-2027';
const ALREADY_CLOSED_NAME = 'Madrid International MUN 2027';

/**
 * How many windows tall each page may be on a desktop.
 *
 * Three, as the conference dashboard, the apply form and the application page
 * are all held to. It is a ceiling and not a target: at three it still catches a
 * page drawn half again as big, which is what `tests/e2e/page-shape.ts` exists
 * to notice.
 */
const PAGE_SCREENS = 3;

/**
 * The characters a join code is made of, from `create_delegation`.
 *
 * No 0, O, 1 or I, because somebody reads the code out loud or copies it off a
 * whiteboard. `new.md` asks for that in so many words, and the one test that
 * registers a delegation through the real form is where it can be seen. Ten
 * characters since migration 20261022140000 (security review L24).
 */
const JOIN_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/;

/**
 * The words `$lib/status.ts` gives each delegation status, which is what the
 * badge says.
 *
 * They are not the database's own words: `submitted` reads "Under review" and
 * `rejected` reads "Not accepted".
 */
const STATUS_BADGES = {
	draft: 'Draft',
	submitted: 'Under review',
	accepted: 'Accepted',
	rejected: 'Not accepted',
	withdrawn: 'Withdrawn'
};

/** The address both `/delegations/<id>` redirects land on, matched by its shape. */
const DELEGATION_PAGE_URL = /\/delegations\/[0-9a-f-]{36}$/;

/** A name nothing else in the database will match. */
function unusedName(prefix: string): string {
	return `${prefix} ${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * A join code for a delegation this file writes straight into the table.
 *
 * `create_delegation` mints one of its own, and the test that registers a
 * delegation through the real form is the one that proves it. Everywhere else
 * the row is written with the service-role client, which walks past the function
 * altogether, so the code has to come from somewhere — and it is made of the
 * same characters so that nothing reading it has to care which path wrote it.
 */
function unusedJoinCode(): string {
	const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	const characters: string[] = [];

	for (let position = 0; position < 8; position += 1) {
		characters.push(alphabet[Math.floor(Math.random() * alphabet.length)]);
	}

	return characters.join('');
}

/** What a test wants its conference to be. Everything else is filled in. */
type ConferenceSeed = {
	/** Turned off for the "does not accept delegations" reason. */
	acceptsDelegations?: boolean;
	/**
	 * Left unpublished, for the reason a conference nobody has published gives.
	 *
	 * A draft conference is readable only by its own team, so a test that asks
	 * for one has to put its account on that team as well.
	 */
	isDraft?: boolean;
	/** One committee per name, for the seats a delegation is given. */
	committeeNames?: string[];
};

/** A conference a test has to itself, with everything a delegation needs. */
type TestConference = {
	id: string;
	slug: string;
	name: string;
	/** The committee ids, in the order `committeeNames` asked for them. */
	committeeIds: string[];
	/** The `/conferences/<slug>/delegations/new` address this file is about. */
	registerPath: string;
};

/**
 * Make a published conference that takes delegations, with an open application
 * window and its committees, and answer everything a test needs to find it
 * again.
 *
 * Everything is written with the service-role client, the way
 * `tests/e2e/apply.spec.ts` writes its own: `conferences` has no insert policy
 * that would let a test account make one inside somebody else's organisation,
 * and what a real organiser may create is `tests/db/conferences-access.test.ts`'s
 * job rather than this file's.
 */
async function createTestConference(seed: ConferenceSeed = {}): Promise<TestConference> {
	const admin = createServiceRoleClient();
	const name = unusedName('Delegation Test MUN');
	const slug = `e2e-delegation-${crypto.randomUUID()}`;
	const now = Date.now();

	const { data: conference, error } = await admin
		.from('conferences')
		.insert({
			name,
			slug,
			city: 'Delft',
			country_code: 'NL',
			timezone: 'Europe/Amsterdam',
			start_date: CONFERENCE_FIRST_DAY,
			end_date: CONFERENCE_LAST_DAY,
			status: seed.isDraft ? 'draft' : 'published',
			applications_open_at: new Date(now - ONE_DAY_MS).toISOString(),
			applications_close_at: new Date(now + THREE_MONTHS_MS).toISOString(),
			accepts_delegations: seed.acceptsDelegations ?? true,
			organization_id: SAMPLE_ORGANIZATION_ID
		})
		.select('id')
		.single();

	if (error || !conference) {
		throw new Error(`Could not create the test conference: ${error?.message}`);
	}

	const committeeIds = await addCommittees(conference.id, seed.committeeNames ?? []);

	return {
		id: conference.id,
		slug,
		name,
		committeeIds,
		registerPath: `/conferences/${slug}/delegations/new`
	};
}

/** The committees of one test conference, in the order they were asked for. */
async function addCommittees(conferenceId: string, names: string[]): Promise<string[]> {
	if (names.length === 0) {
		return [];
	}

	const admin = createServiceRoleClient();

	const rows = names.map((name, index) => ({
		conference_id: conferenceId,
		name,
		slug: `committee-${crypto.randomUUID().slice(0, 8)}`,
		level: 'intermediate' as const,
		topics: [],
		position: index
	}));

	const { data, error } = await admin.from('committees').insert(rows).select('id, position');

	if (error || !data) {
		throw new Error(`Could not create the test committees: ${error?.message}`);
	}

	// Supabase answers an insert in whatever order it likes, so the rows are put
	// back into the order they were asked for before their ids are handed out.
	return [...data].sort((one, other) => one.position - other.position).map((row) => row.id);
}

/**
 * Shut a test conference's application window, after a delegation has been
 * registered inside it.
 *
 * It has to happen in this order: `create_delegation` refuses a conference whose
 * window has closed, so a delegation that is to meet a closed window has to be
 * made while it is still open and then have the window shut behind it.
 */
async function closeApplications(conferenceId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('conferences')
		.update({ applications_close_at: new Date(Date.now() - ONE_DAY_MS).toISOString() })
		.eq('id', conferenceId);

	if (error) {
		throw new Error(`Could not close the test conference's window: ${error.message}`);
	}
}

/**
 * Take a test conference away again, with everything hanging off it.
 *
 * Committees, seats, delegations and delegation members all lead back to the
 * conference through `on delete cascade`, so deleting the conference is enough.
 * Every test that makes one does this in a `finally`: a conference nobody
 * deletes is one more thing for the next person to wonder about.
 */
async function deleteTestConference(conferenceId: string): Promise<void> {
	await createServiceRoleClient().from('conferences').delete().eq('id', conferenceId);
}

/** What a test wants to say about one delegation. Everything else is filled in. */
type DelegationSeed = {
	conferenceId: string;
	name?: string;
	status?: 'draft' | 'submitted' | 'accepted' | 'rejected' | 'withdrawn';
	/** The wish the head sent the organisers. The bar measures against it. */
	requestedSeats?: number;
	/** What the organisers wrote back when they decided. */
	decisionNote?: string;
};

/** One delegation a test has arranged, as the tests below name it. */
type TestDelegation = {
	id: string;
	name: string;
	joinCode: string;
	/** The `/delegations/<id>` address this file is about. */
	path: string;
};

/**
 * Give a test account a delegation it is the head of, as the database would hold
 * it, and answer what the tests need to find it again.
 *
 * The service-role client writes both rows, the way `giveApplication` in
 * `signed-in-user.ts` writes an application and for the same reason.
 * `guard_delegation_insert` only runs for the two roles a browser uses, so the
 * service role walks straight past it: that is the one reason a seeded
 * `accepted` or `rejected` row is possible at all, because through a browser a
 * head may only ever write `draft` or `submitted`. Walking past it is also why
 * `submitted_at` is set here — for a real submission the trigger is what fills
 * it in.
 *
 * `check_one_route_per_conference` still fires, for everybody, so the account
 * given a delegation here must have no application and no other delegation at
 * the same conference.
 */
async function giveDelegation(head: TestUser, seed: DelegationSeed): Promise<TestDelegation> {
	const admin = createServiceRoleClient();
	const name = seed.name ?? unusedName('Lycee Francais Delegation');
	const joinCode = unusedJoinCode();
	const status = seed.status ?? 'draft';
	const now = new Date().toISOString();

	// A draft has not been sent yet; every other status has. The two the
	// organisers choose also carry the moment they chose, because a delegation
	// that is decided and has no `decided_at` is a row the app could never write.
	// A head withdrawing their own delegation writes no decision column at all,
	// which is why `withdrawn` is not in either list.
	const isSent = status !== 'draft';
	const isDecided = status === 'accepted' || status === 'rejected';

	const { data, error } = await admin
		.from('delegations')
		.insert({
			conference_id: seed.conferenceId,
			name,
			institution_name: 'Lycee Francais de La Haye',
			country_code: 'FR',
			status,
			requested_seats: seed.requestedSeats ?? 12,
			note: 'We would like to sit together if we can.',
			join_code: joinCode,
			submitted_at: isSent ? now : null,
			decided_at: isDecided ? now : null,
			decision_note: seed.decisionNote ?? null
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test delegation: ${error?.message}`);
	}

	const { error: headError } = await admin
		.from('delegation_members')
		.insert({ delegation_id: data.id, user_id: head.id, role: 'head' });

	if (headError) {
		throw new Error(`Could not make the test account a head: ${headError.message}`);
	}

	return { id: data.id, name, joinCode, path: `/delegations/${data.id}` };
}

/**
 * Put somebody in a delegation somebody else runs, as `join_delegation` would.
 *
 * Joining through the real page is `tests/e2e/join-delegation.spec.ts`'s
 * subject; here a member is only ever the state a dashboard is read in.
 */
async function joinTheDelegation(member: TestUser, delegationId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('delegation_members')
		.insert({ delegation_id: delegationId, user_id: member.id, role: 'member' });

	if (error) {
		throw new Error(`Could not put the test account in the delegation: ${error.message}`);
	}
}

/**
 * Reserve seats in a committee for a delegation, and sit one member in one of
 * them.
 *
 * Allocation is T27's `allocate_delegation_seats` and has no form yet, so the
 * service-role client writes the rows the way that task one day will. A seat
 * that names a delegation and a person is refused unless that person is in that
 * delegation, which `check_seat_allocation` enforces for everybody.
 */
async function reserveSeats(
	committeeId: string,
	delegationId: string,
	seatNames: string[],
	sitIn?: { user: TestUser; seatName: string }
): Promise<void> {
	const admin = createServiceRoleClient();

	const rows = seatNames.map((seatName, index) => ({
		committee_id: committeeId,
		name: seatName,
		country_code: 'FR',
		position: index,
		delegation_id: delegationId,
		user_id: sitIn && sitIn.seatName === seatName ? sitIn.user.id : null,
		allocated_at: new Date().toISOString()
	}));

	const { error } = await admin.from('seats').insert(rows);

	if (error) {
		throw new Error(`Could not reserve the test seats: ${error.message}`);
	}
}

/** One `delegations` row, as the tests below read it back. */
type DelegationRow = {
	id: string;
	name: string;
	status: string;
	requested_seats: number;
	join_code: string;
	submitted_at: string | null;
};

/** One delegation, read straight from the table with the service-role client. */
async function readDelegation(delegationId: string): Promise<DelegationRow> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('delegations')
		.select('id, name, status, requested_seats, join_code, submitted_at')
		.eq('id', delegationId)
		.maybeSingle();

	if (error || !data) {
		throw new Error(`Could not read the test delegation: ${error?.message}`);
	}

	return data;
}

/** The one delegation registered at a conference, found by the conference alone. */
async function readTheOnlyDelegation(conferenceId: string): Promise<DelegationRow> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('delegations')
		.select('id, name, status, requested_seats, join_code, submitted_at')
		.eq('conference_id', conferenceId)
		.maybeSingle();

	if (error || !data) {
		throw new Error(`Could not read the registered delegation: ${error?.message}`);
	}

	return data;
}

/** What role somebody has in a delegation, or nothing when they are not in it. */
async function readMembership(delegationId: string, userId: string): Promise<string | null> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('delegation_members')
		.select('role')
		.eq('delegation_id', delegationId)
		.eq('user_id', userId)
		.maybeSingle();

	if (error) {
		throw new Error(`Could not read the test membership: ${error.message}`);
	}

	return data ? String(data.role) : null;
}

/**
 * Post to one of a page's form actions the way a browser posts a form.
 *
 * A copy of the one in `tests/e2e/manage-application-form.spec.ts`, and the same
 * two headers are written by hand for the same two reasons. `origin`, because
 * SvelteKit refuses a form post that looks as though it came from another
 * website and Playwright's request does not send that header itself. And
 * `accept: text/html`, because that is how SvelteKit tells a form post from a
 * page with no JavaScript from one made by `use:enhance`: with it the page is
 * drawn again carrying the status the action chose, which is what a browser with
 * no script really receives.
 *
 * The tests below ask an action directly when the page draws no button for it —
 * a refusal that hides its own button proves only what the page did, and the
 * criterion is that the action itself refuses.
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
 * A copy of the one in `tests/e2e/application.spec.ts`. With JavaScript the
 * press opens a `<dialog>` and the dialog's own button is what submits. Without
 * it — which is the `desktop-no-js` project, and also any page whose script has
 * not landed yet — the press opens a confirmation page asking the same
 * question, whose own button is what submits. Both are the right behaviour, so
 * this waits to see which of the two happened rather than assuming one.
 */
async function pressAndConfirm(page: Page, label: string): Promise<void> {
	// The dialog holds a second button with the same words on it, so the one in
	// the page itself is the first of the two. While the dialog is shut the
	// browser hides everything inside it, so until then there is only one.
	const button = page.getByRole('main').getByRole('button', { name: label }).first();
	const dialogButton = page.getByRole('dialog').getByRole('button', { name: label }).first();

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
 * Wait until the register form has really arrived.
 *
 * The submit button is what says the form is there: a conference
 * `canCreateDelegation` refuses never draws the page at all, so a test that
 * pressed too early would press a page on its way somewhere else.
 */
async function waitForTheRegisterForm(page: Page): Promise<void> {
	const submit = page.getByRole('main').getByRole('button', { name: 'Create delegation' });

	await expect(submit).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
}

/** Sign an account in and open one conference's register form. */
async function openTheRegisterForm(
	page: Page,
	user: TestUser,
	registerPath: string
): Promise<void> {
	await signIn(page, user);
	await page.goto(registerPath);
	await waitForTheRegisterForm(page);
}

/**
 * Open one delegation's dashboard and wait until it has really arrived.
 *
 * The heading is what says the page is there rather than the address, because
 * the address is right the moment the browser asks for it and the page arrives
 * afterwards. The heading is the delegation's own name, which is what
 * `dashboard.md` puts in the `PageHeader`.
 */
async function openTheDashboard(page: Page, delegation: TestDelegation): Promise<void> {
	await page.goto(delegation.path);

	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
		delegation.name,
		{ timeout: DATABASE_TIMEOUT_MS }
	);
}

/** What the register form is filled in with. Every field is a string, as a form sends it. */
type RegisterFormValues = {
	name: string;
	institutionName: string;
	countryCode: string;
	requestedSeats: string;
	note: string;
};

/** Fill the register form in, tick the consent box, and leave it ready to send. */
async function fillTheRegisterForm(page: Page, values: RegisterFormValues): Promise<void> {
	const main = page.getByRole('main');

	await main.getByLabel('Delegation name').fill(values.name);
	await main.getByLabel('Institution').fill(values.institutionName);
	await main.getByLabel('Country').selectOption(values.countryCode);
	await main.getByLabel('Seats you would like').fill(values.requestedSeats);
	await main.getByLabel('Note to the organisers').fill(values.note);

	// The consent is the one box on this form, and `new.md` asks for it every
	// time the form is sent. Saying so as an assertion rather than as a comment is
	// deliberate: a form that grew a second checkbox fails here instead of quietly
	// ticking the wrong box.
	const consent = main.getByRole('checkbox');

	await expect(consent).toHaveCount(1);
	await consent.check();
}

/**
 * Open the register form of a conference that will not take a delegation, and
 * expect the reason on the conference page instead.
 *
 * `new.md`'s "Not allowed" state is a redirect and not a page: the form is never
 * drawn, and the reason arrives as a flash on the conference the reader came
 * from. Both halves are checked here, because a redirect with no message would
 * leave somebody wondering what they did wrong.
 */
async function expectTheRefusal(
	page: Page,
	registerPath: string,
	conferenceSlug: string,
	reason: string | RegExp
): Promise<void> {
	await page.goto(registerPath);

	await expect(page).toHaveURL(`/conferences/${conferenceSlug}`, {
		timeout: DATABASE_TIMEOUT_MS
	});

	// The flash floats above the page rather than inside `<main>`, which is why
	// this assertion is not scoped to it.
	await expect(page.getByText(reason).first()).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	await expect(page.getByRole('button', { name: 'Create delegation' })).toHaveCount(0);
}

/*
	Every test here makes a conference, signs a brand-new account in and then
	reads a page that asks the database several questions. That is more than most
	browser tests do, and thirty seconds — what Playwright allows a test by
	default — is not always enough for it while the whole suite is asking the one
	local database at once. `test.slow()` triples that allowance. It is an
	allowance and not a wait: a test that is quick still finishes as quickly as it
	can.
*/
test.beforeEach(() => {
	test.slow();
});

test('fills the name, the institution and the country in from the profile', async ({ page }) => {
	const conference = await createTestConference();

	try {
		// `createTestUser` finishes the welcome page for the account, which is where
		// these two answers come from: Delft University, in the Netherlands.
		const head = await createTestUser('Amira Haddad');
		await openTheRegisterForm(page, head, conference.registerPath);

		const main = page.getByRole('main');

		await expect(main.getByLabel('Institution')).toHaveValue('Delft University');
		await expect(main.getByLabel('Country')).toHaveValue('NL');

		// The delegation's name starts as the institution's, which most schools
		// call their group, and the head can change it (T177).
		await expect(main.getByLabel('Delegation name')).toHaveValue('Delft University');
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('redirects with the reason, for every reason there is', async ({ page }) => {
	// Three conferences of this file's own, because one account can only be in one
	// state per conference: `check_one_route_per_conference` will not let the same
	// person both apply to a conference and join a delegation of it. The other
	// three reasons are read from `supabase/seed.sql`, which already holds a
	// conference set up each way.
	const alreadyApplied = await createTestConference();
	const alreadyInADelegation = await createTestConference();
	const notPublished = await createTestConference({ isDraft: true });

	try {
		const head = await createTestUser('Amira Haddad');

		await giveApplication(head, { conferenceId: alreadyApplied.id, status: 'draft' });
		await giveDelegation(head, {
			conferenceId: alreadyInADelegation.id,
			name: 'Lycee Francais Delegation'
		});

		// A draft conference is readable only by its own team, so the account has to
		// be on it before the page can get as far as refusing for the right reason.
		// The row goes away with the conference in the `finally` below.
		await makeConferenceStaff(head, notPublished.id, 'organiser');

		await signIn(page, head);

		await expectTheRefusal(
			page,
			`/conferences/${NO_DELEGATIONS_SLUG}/delegations/new`,
			NO_DELEGATIONS_SLUG,
			`${NO_DELEGATIONS_NAME} does not accept delegations.`
		);

		// Only the front of each window sentence is matched: the seed works both
		// dates out from the moment the database was last reset, so neither can be
		// written down here.
		await expectTheRefusal(
			page,
			`/conferences/${NOT_YET_OPEN_SLUG}/delegations/new`,
			NOT_YET_OPEN_SLUG,
			new RegExp(`Applications for ${NOT_YET_OPEN_NAME} open on `)
		);
		await expectTheRefusal(
			page,
			`/conferences/${ALREADY_CLOSED_SLUG}/delegations/new`,
			ALREADY_CLOSED_SLUG,
			new RegExp(`Applications for ${ALREADY_CLOSED_NAME} closed on `)
		);

		await expectTheRefusal(
			page,
			alreadyApplied.registerPath,
			alreadyApplied.slug,
			`You already applied to ${alreadyApplied.name} as an individual.`
		);
		await expectTheRefusal(
			page,
			alreadyInADelegation.registerPath,
			alreadyInADelegation.slug,
			'You are already part of the Lycee Francais Delegation delegation.'
		);

		// The sixth reason, the one `new.md`'s "Not allowed" list ends with: a
		// conference nobody has published is not taking anything yet, whatever its
		// window says.
		await expectTheRefusal(
			page,
			notPublished.registerPath,
			notPublished.slug,
			`${notPublished.name} is not taking delegations.`
		);
	} finally {
		await deleteTestConference(alreadyApplied.id);
		await deleteTestConference(alreadyInADelegation.id);
		await deleteTestConference(notPublished.id);
	}
});

test('answers an empty form with every error at once, and keeps what was typed', async ({
	page
}) => {
	const conference = await createTestConference();

	try {
		const head = await createTestUser('Amira Haddad');
		await openTheRegisterForm(page, head, conference.registerPath);

		// Posted rather than pressed: four of the five fields are `required`, so a
		// browser would stop an empty form before the server ever saw it, and what
		// the server says about an empty one is the criterion.
		const empty = await postFormAction(page, conference.registerPath);

		expect(empty.status()).toBe(400);

		const emptyAnswer = await empty.text();

		// All five on the one page. That is the criterion: every field with
		// something wrong with it says so at once, rather than one attempt per
		// field. The consent message is matched up to its apostrophe, which is
		// written into the page as an escape and not as the character itself.
		const everyMessage = [
			'Give your delegation a name.',
			'Enter the name of your school, university or club.',
			'Pick a country.',
			'Ask for between 1 and 200 seats.',
			'Please confirm that organisers may see your members'
		];

		for (const message of everyMessage) {
			expect(emptyAnswer).toContain(message);
		}

		// And a form with one thing wrong with it comes back with everything else
		// still in it, so that nobody types their delegation's name twice.
		const typedName = 'Lycee Francais Delegation';
		const tooManySeats = await postFormAction(page, conference.registerPath, {
			name: typedName,
			institutionName: 'Lycee Francais de La Haye',
			countryCode: 'FR',
			requestedSeats: '900',
			note: 'We would like to sit together if we can.',
			consent: 'on'
		});

		expect(tooManySeats.status()).toBe(400);

		const keptAnswer = await tooManySeats.text();

		expect(keptAnswer).toContain('Ask for between 1 and 200 seats.');
		expect(keptAnswer).toContain(typedName);

		// Nothing was written either: a refused form is not a draft delegation.
		const admin = createServiceRoleClient();
		const { count } = await admin
			.from('delegations')
			.select('id', { count: 'exact', head: true })
			.eq('conference_id', conference.id);

		expect(count).toBe(0);
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('registers the delegation with its head, and lands on its own page', async ({ page }) => {
	const conference = await createTestConference();

	try {
		const head = await createTestUser('Amira Haddad');
		await openTheRegisterForm(page, head, conference.registerPath);

		await fillTheRegisterForm(page, {
			name: 'Lycee Francais Delegation',
			institutionName: 'Lycee Francais de La Haye',
			countryCode: 'FR',
			requestedSeats: '12',
			note: 'We would like to sit together if we can.'
		});

		await page.getByRole('main').getByRole('button', { name: 'Create delegation' }).press('Enter');

		await expect(page).toHaveURL(DELEGATION_PAGE_URL, { timeout: DATABASE_TIMEOUT_MS });
		await expect(
			page.getByText('Delegation created. Share the join code with your members.')
		).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

		// Both rows, written by `create_delegation` in one transaction: the
		// delegation itself and the person who registered it as its head.
		const saved = await readTheOnlyDelegation(conference.id);

		expect(saved.name).toBe('Lycee Francais Delegation');
		expect(saved.status).toBe('draft');
		expect(saved.requested_seats).toBe(12);
		expect(saved.submitted_at).toBeNull();
		expect(await readMembership(saved.id, head.id)).toBe('head');

		// The code the database minted for it: ten characters, and none of them
		// one of the four people read wrong.
		expect(saved.join_code).toMatch(JOIN_CODE_PATTERN);
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('is a 404 for a stranger, and the login page for a visitor', async ({ page }) => {
	const conference = await createTestConference();

	try {
		const head = await createTestUser('Amira Haddad');
		const delegation = await giveDelegation(head, { conferenceId: conference.id });

		// Nobody is signed in. `requireDelegationMember` calls `requireOnboarded`
		// first, which turns this into the address the **Access:** line of
		// `dashboard.md` names, so that signing in lands somebody back on the
		// dashboard rather than on the front page.
		await page.goto(delegation.path);

		await expect(page).toHaveURL(`/login?next=${encodeURIComponent(delegation.path)}`, {
			timeout: DATABASE_TIMEOUT_MS
		});

		// Somebody else entirely, signed in and with an account of their own. They
		// are in no delegation, so the page has nothing to show them and says so
		// with a 404 rather than with a 403, which is the rule for the whole app: an
		// answer must not tell anybody which delegations exist.
		const stranger = await createTestUser('Priya Nair');
		await signIn(page, stranger);

		const response = await page.goto(delegation.path);

		expect(response?.status()).toBe(404);
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('shows every status with its own badge and its own sentence', async ({ page }) => {
	// One conference per status, because one account can only be in one delegation
	// per conference. The accepted one has a committee, so that the seats its
	// sentence counts are really there.
	const statuses = ['draft', 'submitted', 'accepted', 'rejected', 'withdrawn'] as const;
	const conferences = await Promise.all(
		statuses.map((status) =>
			createTestConference(status === 'accepted' ? { committeeNames: ['Security Council'] } : {})
		)
	);

	try {
		const head = await createTestUser('Amira Haddad');
		const delegations: TestDelegation[] = [];

		for (const [index, status] of statuses.entries()) {
			delegations.push(
				await giveDelegation(head, {
					conferenceId: conferences[index].id,
					status,
					requestedSeats: 12,
					decisionNote:
						status === 'rejected' ? 'We had more groups than seats this year.' : undefined
				})
			);
		}

		// Two seats for the accepted one, which is what its sentence counts.
		await reserveSeats(conferences[2].committeeIds[0], delegations[2].id, ['France', 'Belgium']);

		await signIn(page, head);

		// The sentences of `dashboard.md`, in the same order as the statuses above.
		// The two that name a day are matched by their front only, because the day
		// is worked out from the moment the row was written. A head reads the
		// draft's own guidance under "Not sent yet" (T177), matched by its front.
		const sentences = [
			'Send it to the organisers whenever you are ready.',
			/Submitted .* The organisers are reviewing your request for 12 seats\./,
			'Accepted. 2 seats allocated.',
			'Not accepted.',
			'Withdrawn.'
		];

		for (const [index, status] of statuses.entries()) {
			await openTheDashboard(page, delegations[index]);

			const main = page.getByRole('main');

			// `exact` matches the whole badge rather than a part of it, which is how
			// "Draft" is told apart from a sentence with the word in it, and
			// "Not accepted" from the sentence "Not accepted.".
			await expect(main.getByText(STATUS_BADGES[status], { exact: true }).first()).toBeVisible();
			await expect(main.getByText(sentences[index]).first()).toBeVisible();
		}

		// And the note the organisers wrote is beside the sentence on the one they
		// turned down, rather than inside it.
		await openTheDashboard(page, delegations[3]);
		await expect(
			page.getByRole('main').getByText('We had more groups than seats this year.').first()
		).toBeVisible();
	} finally {
		for (const conference of conferences) {
			await deleteTestConference(conference.id);
		}
	}
});

test('shows a head the seats, the join code and the link to share', async ({ page }) => {
	const conference = await createTestConference({ committeeNames: ['Security Council'] });

	try {
		const head = await createTestUser('Amira Haddad');
		const member = await createTestUser('Youssef Benali');
		const delegation = await giveDelegation(head, {
			conferenceId: conference.id,
			status: 'accepted',
			requestedSeats: 12
		});

		await joinTheDelegation(member, delegation.id);

		// Three seats reserved for the group and one of them filled, which is the
		// three numbers the progress card draws.
		await reserveSeats(
			conference.committeeIds[0],
			delegation.id,
			['France', 'Belgium', 'Senegal'],
			{ user: member, seatName: 'France' }
		);

		await signIn(page, head);
		await openTheDashboard(page, delegation);

		const main = page.getByRole('main');

		/*
			Requested is the wish the head sent, allocated is the seats that name this
			delegation, and assigned is those with somebody sitting in them.

			They are read off the page's own text rather than asked for one element at
			a time, the way `tests/e2e/apply.spec.ts` reads the order of its questions:
			a number beside its word may be in the same element or in the one next
			door, and neither is what the criterion is about. `innerText` gives the
			text as it is drawn, so the spaces between the two are squeezed to one and
			both sides are lower-cased — every label in this app is drawn in capitals.
		*/
		const shownText = (await main.innerText()).replace(/\s+/g, ' ').toLowerCase();

		expect(shownText).toContain('requested 12');
		expect(shownText).toContain('allocated 3');
		expect(shownText).toContain('assigned 1');

		/*
			The code itself, and the whole link underneath it as text somebody can
			select and read out. Both are there without any scripting, which is what
			the criterion asks for.

			The address is matched from its front, and not just by its ending.
			`resolve()` answers relatively while a page is built on the server, so a
			link glued together without resolving it first comes out as
			`http://host../join/CODE` — which still ends in `/join/CODE`, and would
			still read as a pass.
		*/
		const shareableLink = `${new URL(page.url()).origin}/join/${delegation.joinCode}`;

		await expect(main.getByText(delegation.joinCode).first()).toBeVisible();
		await expect(main.getByText(shareableLink)).toBeVisible();
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('puts the join link on the clipboard', async ({ page, browserName }, testInfo) => {
	// The clipboard is a browser API, so this runs where there is scripting, and
	// on one project because permission to read the clipboard is granted per
	// browser context. Without scripting the link is still on the page as text,
	// which the test above proves and which is all the criterion asks of that
	// project.
	test.skip(
		testInfo.project.name !== 'desktop',
		'Reading the clipboard needs scripting and one project to hold the permission.'
	);
	// Safari lets a page write to the clipboard but never lets a script read it
	// back, and knows no permission that would, so only Chromium can check what
	// was copied (T163).
	test.skip(browserName !== 'chromium', 'Only Chromium lets a test read the clipboard back.');

	const conference = await createTestConference();

	try {
		const head = await createTestUser('Amira Haddad');
		const delegation = await giveDelegation(head, { conferenceId: conference.id });

		// Chromium asks before a page may read what is on the clipboard, and a test
		// has nobody to ask, so the permission is given to this context up front.
		await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

		await signIn(page, head);
		await openTheDashboard(page, delegation);

		const copyButton = page.getByRole('main').getByRole('button', { name: 'Copy link' });

		/*
			Pressing and reading are tried together until they work. The handler
			belongs to the page's own script, and a page arrives as finished HTML a
			moment before that script lands, so the first press can happen while
			there is nothing listening. `styleguide.spec.ts` waits for a `<dialog>`
			the same way and for the same reason.
		*/
		await expect(async () => {
			await copyButton.click();

			const copied = await page.evaluate(() => navigator.clipboard.readText());

			// The whole address, because a link that is only right at its end is
			// no use to the person the head sends it to.
			expect(copied).toBe(`${new URL(page.url()).origin}/join/${delegation.joinCode}`);
		}).toPass({ timeout: DATABASE_TIMEOUT_MS });
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('shows a member their own seat, and never the join code', async ({ page }) => {
	const conference = await createTestConference({ committeeNames: ['Security Council'] });

	try {
		const head = await createTestUser('Amira Haddad');
		const seatedMember = await createTestUser('Youssef Benali');
		const waitingMember = await createTestUser('Lena Fischer');
		const delegation = await giveDelegation(head, {
			conferenceId: conference.id,
			status: 'accepted'
		});

		await joinTheDelegation(seatedMember, delegation.id);
		await joinTheDelegation(waitingMember, delegation.id);
		await reserveSeats(conference.committeeIds[0], delegation.id, ['France', 'Belgium'], {
			user: seatedMember,
			seatName: 'France'
		});

		await signIn(page, seatedMember);
		await openTheDashboard(page, delegation);

		const main = page.getByRole('main');

		// The seat and the committee it sits in, which is the member's whole view of
		// the allocation.
		await expect(main.getByText('France').first()).toBeVisible();
		await expect(main.getByText('Security Council').first()).toBeVisible();

		// The flag `dashboard.md` draws beside the seat name. `Flag` renders an
		// `<img>` whose alt text is the country's name, so it is asked for as an
		// image and not as text: the seat here is called "France" too, and only the
		// picture can tell the two apart.
		await expect(main.getByRole('img', { name: 'France' })).toBeVisible();

		// The join code is the head's to hand out, so a member never sees it, and
		// none of the head's buttons is drawn for them either.
		await expect(main.getByText(delegation.joinCode)).toHaveCount(0);
		await expect(main.getByRole('button', { name: 'Submit to the organisers' })).toHaveCount(0);
		await expect(main.getByRole('button', { name: 'Withdraw request' })).toHaveCount(0);

		// Clearing the cookies is what ends the first session; without it `/login`
		// would send an account that is already signed in straight back to its home
		// page. `tests/e2e/manage-application-form.spec.ts` changes accounts the
		// same way.
		await page.context().clearCookies();

		await signIn(page, waitingMember);
		await openTheDashboard(page, delegation);

		await expect(
			page
				.getByRole('main')
				.getByText(
					'No seat assigned yet. Your head assigns seats once the organisers allocate them.'
				)
				.first()
		).toBeVisible();
	} finally {
		await deleteTestConference(conference.id);
	}
});

// specs/05-pages/delegation/dashboard.md's "Draft" state (T177): the status card
// says the request can go now, and its one filled button sends it.
test("tells a draft's head it can be sent whenever they are ready", async ({ page }) => {
	const conference = await createTestConference();

	try {
		const head = await createTestUser('Amira Haddad');
		const delegation = await giveDelegation(head, { conferenceId: conference.id });

		await signIn(page, head);
		await openTheDashboard(page, delegation);

		const main = page.getByRole('main');

		await expect(main.getByRole('heading', { name: 'Not sent yet' })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(
			main.getByText(
				'Send it to the organisers whenever you are ready. Members can still join ' +
					'afterwards, and you can change the number of seats until the organisers decide.'
			)
		).toBeVisible();
		await expect(main.getByRole('button', { name: 'Submit to the organisers' })).toBeVisible();

		// The old notice, which suggested waiting for the members first, is gone.
		await expect(
			main.getByText('Share the join code so members can join, then submit.')
		).toHaveCount(0);

		// A member of the same draft still reads the status table's sentence, with
		// no button, as `dashboard.md` keeps it.
		const member = await createTestUser('Youssef Benali');

		await joinTheDelegation(member, delegation.id);
		await page.context().clearCookies();
		await signIn(page, member);
		await openTheDashboard(page, delegation);

		await expect(main.getByText('Not sent yet. Add members, then submit.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(main.getByRole('heading', { name: 'Status' })).toBeVisible();
		await expect(main.getByRole('button', { name: 'Submit to the organisers' })).toHaveCount(0);
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('submits a draft, and refuses a second submission or a shut window', async ({ page }) => {
	const stillOpen = await createTestConference();
	const shutAgain = await createTestConference();

	try {
		const head = await createTestUser('Amira Haddad');
		const delegation = await giveDelegation(head, { conferenceId: stillOpen.id });
		const tooLate = await giveDelegation(head, { conferenceId: shutAgain.id });

		// The window is shut behind the second delegation, because
		// `create_delegation` would never have let it be registered inside a shut one.
		await closeApplications(shutAgain.id);

		await signIn(page, head);
		await openTheDashboard(page, delegation);

		await page
			.getByRole('main')
			.getByRole('button', { name: 'Submit to the organisers' })
			.press('Enter');

		await expect(page.getByText('Request sent to the organisers.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		// "Under review" is what `$lib/status.ts` calls a submitted delegation, and
		// the trigger fills the moment it was sent in on its way past.
		await expect(page.getByRole('main').getByText('Under review', { exact: true })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		const sent = await readDelegation(delegation.id);

		expect(sent.status).toBe('submitted');
		expect(sent.submitted_at).not.toBeNull();

		// A second submission is asked for directly, because the page stops drawing
		// the button the moment the first one worked and the criterion is that the
		// action itself refuses.
		const again = await postFormAction(page, `${delegation.path}?/submit`);

		expect(await again.text()).toContain(
			'This delegation has already been sent to the organisers.'
		);

		// And a draft whose window has shut can no longer be sent at all. Only the
		// front of the sentence is matched, because the day is worked out from the
		// moment the window was closed.
		await openTheDashboard(page, tooLate);

		const closed = await postFormAction(page, `${tooLate.path}?/submit`);

		expect(await closed.text()).toContain(`Applications for ${shutAgain.name} closed on `);
		expect((await readDelegation(tooLate.id)).status).toBe('draft');
	} finally {
		await deleteTestConference(stillOpen.id);
		await deleteTestConference(shutAgain.id);
	}
});

test('withdraws a request, and refuses once seats are allocated', async ({ page }) => {
	const canBeWithdrawn = await createTestConference();
	const tooLate = await createTestConference({ committeeNames: ['Security Council'] });

	try {
		const head = await createTestUser('Amira Haddad');
		const draft = await giveDelegation(head, { conferenceId: canBeWithdrawn.id });
		const allocated = await giveDelegation(head, {
			conferenceId: tooLate.id,
			status: 'accepted'
		});

		await reserveSeats(tooLate.committeeIds[0], allocated.id, ['France']);

		await signIn(page, head);
		await openTheDashboard(page, allocated);

		const main = page.getByRole('main');

		// Seats are the organisers' to give and to take back, so once one has been
		// reserved the button is gone.
		await expect(main.getByRole('button', { name: 'Withdraw request' })).toHaveCount(0);

		const refused = await postFormAction(page, `${allocated.path}?/withdraw`);

		expect(await refused.text()).toContain(
			'Seats were already allocated; ask the organisers to cancel.'
		);
		expect((await readDelegation(allocated.id)).status).toBe('accepted');

		// A draft with no seats behind it is still the head's to take back, and the
		// button asks before it does anything.
		await openTheDashboard(page, draft);
		await pressAndConfirm(page, 'Withdraw request');

		await expect(page.getByText('Request withdrawn.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		expect((await readDelegation(draft.id)).status).toBe('withdrawn');
	} finally {
		await deleteTestConference(canBeWithdrawn.id);
		await deleteTestConference(tooLate.id);
	}
});

test('saves the details while under review, and stops once accepted', async ({ page }) => {
	const underReview = await createTestConference();
	const decided = await createTestConference();

	try {
		const head = await createTestUser('Amira Haddad');
		const submitted = await giveDelegation(head, {
			conferenceId: underReview.id,
			status: 'submitted'
		});
		const accepted = await giveDelegation(head, {
			conferenceId: decided.id,
			status: 'accepted'
		});

		await signIn(page, head);
		await openTheDashboard(page, submitted);

		const changed = {
			name: 'Lycee Francais Senior Delegation',
			institutionName: 'Lycee Francais de La Haye',
			countryCode: 'FR',
			requestedSeats: '14',
			note: 'Two more of us can come after all.'
		};

		const saved = await postFormAction(page, `${submitted.path}?/update`, changed);

		expect(await saved.text()).toContain('Details saved.');

		const afterSaving = await readDelegation(submitted.id);

		expect(afterSaving.name).toBe(changed.name);
		expect(afterSaving.requested_seats).toBe(14);

		// Once the organisers have accepted it, the group they accepted is the group
		// that comes: the form is gone and the action refuses to write anything.
		await openTheDashboard(page, accepted);

		/*
			`getByText` and not `getByRole`, because `dashboard.md` puts the edit form
			inside a collapsed "Details" section: a shut `<details>` hides what is
			inside it from the roles a screen reader reads, so a button that is really
			there would answer "no such button" while the section is closed. Asking
			for the words themselves counts it either way.
		*/
		await expect(page.getByRole('main').getByText('Save details')).toHaveCount(0);

		await postFormAction(page, `${accepted.path}?/update`, {
			...changed,
			name: 'Somebody Elses Name'
		});

		expect((await readDelegation(accepted.id)).name).toBe(accepted.name);
	} finally {
		await deleteTestConference(underReview.id);
		await deleteTestConference(decided.id);
	}
});

test('does not spill off the side of a phone screen', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	const forTheForm = await createTestConference();
	const forTheDashboard = await createTestConference({ committeeNames: ['Security Council'] });

	try {
		const head = await createTestUser('Amira Haddad');
		const delegation = await giveDelegation(head, {
			conferenceId: forTheDashboard.id,
			status: 'accepted'
		});

		await reserveSeats(forTheDashboard.committeeIds[0], delegation.id, ['France', 'Belgium']);

		// The register form first. Its longest line is the consent sentence, and the
		// seats field sits beside its help line.
		await openTheRegisterForm(page, head, forTheForm.registerPath);
		await expectNoSidewaysOverflow(page);

		// Then the dashboard, whose join code card holds a link that may not be
		// broken across lines and is the likeliest thing on either page to push a
		// phone sideways.
		await openTheDashboard(page, delegation);
		await expectNoSidewaysOverflow(page);
	} finally {
		await deleteTestConference(forTheForm.id);
		await deleteTestConference(forTheDashboard.id);
	}
});

test('the register form fits in a few screens', async ({ page }, testInfo) => {
	test.skip(
		testInfo.project.name !== 'desktop',
		'One project measures the page, and the desktop window is the one the design is drawn for.'
	);

	const conference = await createTestConference();

	try {
		const head = await createTestUser('Amira Haddad');
		await openTheRegisterForm(page, head, conference.registerPath);

		// The picture is saved whether the measurement passes or fails, so that a
		// failure can be looked at rather than guessed at.
		await saveFullPageScreenshot(page, 'register-delegation');
		await expectPageFitsInScreens(page, PAGE_SCREENS);
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('the dashboard fits in a few screens', async ({ page }, testInfo) => {
	test.skip(
		testInfo.project.name !== 'desktop',
		'One project measures the page, and the desktop window is the one the design is drawn for.'
	);

	// The fullest the dashboard ever is in this task: an accepted delegation with
	// seats allocated, so the status card, the progress card, the join code card
	// and the details form are all drawn. Measuring an empty draft would measure
	// nothing.
	const conference = await createTestConference({ committeeNames: ['Security Council'] });

	try {
		const head = await createTestUser('Amira Haddad');
		const member = await createTestUser('Youssef Benali');
		const delegation = await giveDelegation(head, {
			conferenceId: conference.id,
			status: 'accepted',
			requestedSeats: 12
		});

		await joinTheDelegation(member, delegation.id);
		await reserveSeats(
			conference.committeeIds[0],
			delegation.id,
			['France', 'Belgium', 'Senegal'],
			{ user: member, seatName: 'France' }
		);

		await signIn(page, head);
		await openTheDashboard(page, delegation);

		await saveFullPageScreenshot(page, 'delegation-dashboard');
		await expectPageFitsInScreens(page, PAGE_SCREENS);
	} finally {
		await deleteTestConference(conference.id);
	}
});
