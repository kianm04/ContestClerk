import { expect, test, type Locator, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { createTestUser, signIn, type TestUser } from './signed-in-user';
import { createDraftConferenceFor } from './draft-conference';
import {
	expectNoSidewaysOverflow,
	expectPageFitsInScreens,
	saveFullPageScreenshot
} from './page-shape';

// The acceptance criteria of `specs/05-pages/organiser/delegations.md` that need
// a real browser, for the table task T27 builds at `/manage/[slug]/delegations`.
//
// * a draft delegation is never shown, on any of the four tabs, although Row
//   Level Security would happily let an organiser read one;
// * every filter, the tab, the sort and the page number are in the address and
//   survive a refresh, and the search matches the head's name as well as the
//   delegation's own name and its institution;
// * the seats column shows requested, allocated and assigned as three distinct
//   numbers;
// * the invoice status reflects every invoice of the delegation: none, unpaid,
//   paid, and partly paid when two of them disagree;
// * an empty tab says so, and a conference that takes no delegations at all
//   says that instead;
// * a head whose profile has gone reads "Deleted account";
// * under `md` the table becomes cards, and on a desktop the page stays inside
//   three screens.
//
// THE REVIEW PAGE IS NOT HERE
// `/manage/[slug]/delegations/[delegationId]` — one delegation read on its own,
// with the members, the seat picker and the decision — is its own page, and
// `tests/e2e/manage-delegation-review.spec.ts` is where it is tested. Each row
// of this table links to it, and that link is followed there rather than here,
// so that a failure says which of the two pages broke.
//
// EVERY FILTER WITHOUT JAVASCRIPT
// This page has no form actions at all — the spec's "Actions and forms" section
// says so in one word, because every decision happens on the review page. The
// tabs and the pager are ordinary links and the filters are a real
// `<form method="get">`, so everything here works with scripting switched off
// and every test below runs on the `desktop-no-js` project like every other
// browser test. That is also why this file has no helper that posts a form: it
// never needs one. The three tests that measure the page or ask for its
// dimensions are the exception, and each runs on one project alone.
//
// WHAT THESE TESTS LEAVE BEHIND
// Each test signs a brand-new account in and creates its own conference through
// `./draft-conference`, with an organisation of its own, and everything it
// creates stays in the database until the next `pnpm db:reset`. Its committees,
// its seats, its delegations and the accounts in them are its own for the same
// reason `playwright.config.ts` gives: every test runs on three projects at
// once against one database, so a test that reached for "the first free seat"
// or counted the rows of a shared conference would be reading another project's
// work. The conferences are dated in 2020 for the reason
// `tests/e2e/manage-fees.spec.ts` gives: `/conferences` lists conferences that
// are published and have not finished, and `tests/e2e/conferences.spec.ts`
// counts what is in it.
//
// Nothing here takes a conference, a committee, a seat or a delegation from
// `supabase/seed.sql`. That is also why nothing is put back afterwards:
// `removeConferenceStaff` and `freeSeat` in `tests/e2e/signed-in-user.ts` exist
// because the tests that use them borrow a row from a conference other tests
// read, and these tests borrow nothing. The account that signs in owns the
// organisation `./draft-conference` made for it, so it is already an organiser
// of its own conference and needs no place on anybody's team.
//
// `createDraftConference`, `slugOf`, `readConferenceId` and
// `signInWithAConference` below are copies of the ones in
// `tests/e2e/manage-applications.spec.ts` and `tests/e2e/manage-fees.spec.ts`,
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
 * How many delegations one page of the organiser's table holds.
 *
 * The same number as `DELEGATIONS_PAGE_SIZE` in `src/lib/delegations.ts`,
 * written out again rather than imported, for the reason
 * `tests/e2e/manage-applications.spec.ts` gives about its own page size:
 * Playwright compiles the files in `tests/` on their own, without the `$lib`
 * alias the app is built with.
 */
const DELEGATIONS_PAGE_SIZE = 25;

/** One more than a page holds, so that the pager has a second page to point at. */
const DELEGATIONS_OVER_ONE_PAGE = DELEGATIONS_PAGE_SIZE + 1;

/** The seats one delegation asks the organisers for, in the test about the three numbers. */
const SEATS_REQUESTED = 12;

/** How many of them the organisers reserved for the group. Fewer than they asked for. */
const SEATS_ALLOCATED = 10;

/** How many of those reserved seats a member is really sitting in. Fewer again. */
const SEATS_ASSIGNED = 6;

/**
 * How many windows tall the delegations table may be with a real list on it.
 *
 * Three, which is the ceiling the applications table, the conference dashboard,
 * the committees list, the team page and the fees page are all held to, and the
 * reason is the same: more than that would mean these rows are being drawn too
 * big to be scanned, which is exactly what `tests/e2e/page-shape.ts` exists to
 * notice. It is measured with twelve delegations rather than a full page of
 * twenty-five: a page of results is allowed to be as long as the results it
 * holds, and what this number is about is the height of the header, the tabs,
 * the filters and one row, not how many delegations a conference has.
 */
const MANAGE_DELEGATIONS_SCREENS = 3;

/** How many delegations the height test puts on the page. */
const DELEGATIONS_FOR_THE_HEIGHT_TEST = 12;

/**
 * A name nothing else in the database will match, so that a test can read its
 * own conference's page without another run's rows getting in the way.
 */
function unusedName(prefix: string): string {
	return `${prefix} ${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * A join code for a delegation this file writes straight into the table.
 *
 * A copy of the one in `tests/e2e/delegations.spec.ts`, and here for the same
 * reason: `create_delegation` mints a code of its own, but every delegation
 * below is written with the service-role client, which walks past that function
 * altogether, and `delegations.join_code` is `not null unique`. The characters
 * are the ones `create_delegation` uses — no 0, O, 1 or I — so that nothing
 * reading a code has to care which path wrote it.
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
	/** The `/manage/<slug>/delegations` address this file is about. */
	delegationsPath: string;
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
		delegationsPath: `${managePath}/delegations`
	};
}

/**
 * Open the delegations page and wait until it has really arrived.
 *
 * Waiting for the heading rather than simply for the address is what says the
 * page is there: a test that read too early would read the page it was leaving. The heading is looked for inside `<main>` because the organiser
 * sidebar beside it carries a link with the same word on it.
 */
async function openTheDelegationsPage(page: Page, conference: TestConference): Promise<void> {
	await page.goto(conference.delegationsPath);

	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
		'Delegations',
		{ timeout: DATABASE_TIMEOUT_MS }
	);
}

/**
 * Give the conference one committee, and answer its id.
 *
 * Committees are T02's form and are not what this page is about, so the
 * service-role client writes the row, the way `addCommittee` in
 * `tests/e2e/manage-applications.spec.ts` does. It is never used to show that
 * something is allowed.
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

/** What a test wants to say about one delegation. Everything else is filled in. */
type NewDelegation = {
	/** Shown in the first column, and searched by `q`. */
	name: string;
	status: 'draft' | 'submitted' | 'accepted' | 'rejected' | 'withdrawn';
	/** The school behind the group. Shown under the name, and searched by `q` as well. */
	institutionName?: string;
	/** Two letters. What the country filter matches on. */
	countryCode?: string;
	/** The wish the head sent the organisers, which is the first of the three seat numbers. */
	requestedSeats?: number;
	/** An ISO timestamp. The default sort is oldest first, so a test that asserts an order sets it. */
	submittedAt?: string;
};

/** One delegation a test has arranged, as the tests below name it. */
type TestDelegation = {
	id: string;
	name: string;
};

/**
 * Write one delegation straight into the table, and answer what a test needs to
 * find it again.
 *
 * The service-role client writes it, the way `giveDelegation` in
 * `tests/e2e/delegations.spec.ts` does and for the same reason.
 * `guard_delegation_insert` only runs for the two roles a browser uses, so the
 * service role walks straight past it: that is the one reason a seeded
 * `accepted` or `rejected` row is possible at all, because through a browser a
 * head may only ever write `draft` or `submitted`. Walking past it is also why
 * `submitted_at` is set here — for a real submission the trigger is what fills
 * it in, and the default sort of this page reads it.
 */
async function addDelegation(
	conferenceId: string,
	delegation: NewDelegation
): Promise<TestDelegation> {
	const admin = createServiceRoleClient();

	// A draft has not been sent yet; every other status has.
	const isSent = delegation.status !== 'draft';
	const submittedAt = delegation.submittedAt ?? new Date().toISOString();

	const { data, error } = await admin
		.from('delegations')
		.insert({
			conference_id: conferenceId,
			name: delegation.name,
			institution_name: delegation.institutionName ?? 'Lycee Francais de La Haye',
			country_code: delegation.countryCode ?? 'FR',
			status: delegation.status,
			requested_seats: delegation.requestedSeats ?? SEATS_REQUESTED,
			join_code: unusedJoinCode(),
			submitted_at: isSent ? submittedAt : null
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test delegation: ${error?.message}`);
	}

	return { id: data.id, name: delegation.name };
}

/**
 * Put one account in a delegation, as a head or as an ordinary member.
 *
 * Registering and joining for real are `tests/e2e/delegations.spec.ts` and
 * `tests/e2e/join-delegation.spec.ts`; here a membership is only ever something
 * the organiser's table has to show. `check_one_route_per_conference` fires for
 * everybody, including this, so an account may be in at most one delegation per
 * conference and may not have applied to it as an individual.
 */
async function addDelegationMember(
	delegationId: string,
	user: TestUser,
	role: 'head' | 'member'
): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('delegation_members')
		.insert({ delegation_id: delegationId, user_id: user.id, role });

	if (error) {
		throw new Error(`Could not put the test account in the delegation: ${error.message}`);
	}
}

/**
 * Reserve seats in a committee for a delegation, and sit the given members in
 * the first of them.
 *
 * Allocation is `allocate_delegation_seats` and belongs to the review page, so
 * the service-role client writes the rows the way that page does, the way
 * `reserveSeats` in `tests/e2e/delegations.spec.ts` already does. A seat that
 * names a delegation and a person is refused unless that person is in that
 * delegation, which `check_seat_allocation` enforces for everybody.
 */
async function allocateSeats(
	committeeId: string,
	delegationId: string,
	seatCount: number,
	membersSittingIn: TestUser[]
): Promise<void> {
	const admin = createServiceRoleClient();
	const rows = [];

	for (let index = 0; index < seatCount; index += 1) {
		// A seat name is unique within its committee, so they are numbered. The
		// member is `undefined` for every seat past the ones being sat in, and
		// that seat is left free.
		const member: TestUser | undefined = membersSittingIn[index];

		rows.push({
			committee_id: committeeId,
			name: `Seat ${String(index + 1).padStart(2, '0')}`,
			country_code: 'FR',
			position: index,
			delegation_id: delegationId,
			user_id: member === undefined ? null : member.id,
			allocated_at: new Date().toISOString()
		});
	}

	const { error } = await admin.from('seats').insert(rows);

	if (error) {
		throw new Error(`Could not reserve the test seats: ${error.message}`);
	}
}

/**
 * Raise one invoice against a delegation, paid or unpaid.
 *
 * Invoices are written by the allocation functions in the database and by the
 * organiser's own fees page, neither of which this page touches, so the
 * service-role client writes the row. It walks past `guard_invoice_insert`,
 * which is what normally fills the number, the currency and the status in — so
 * all three are given here. `check_invoice_transition` only fires on an update,
 * which is why a row may be born `paid`.
 */
async function addDelegationInvoice(
	conferenceId: string,
	delegationId: string,
	payer: TestUser,
	status: 'unpaid' | 'paid'
): Promise<void> {
	const admin = createServiceRoleClient();
	const now = new Date().toISOString();

	const { error } = await admin.from('invoices').insert({
		conference_id: conferenceId,
		// `invoices.number` is unique across the whole table. The letter on the end
		// keeps the digits of a random id from reading as a number
		// `next_invoice_number` would count on from.
		number: `e2e-${crypto.randomUUID()}-n`,
		payer_user_id: payer.id,
		delegation_id: delegationId,
		description: 'School delegation fee',
		quantity: 1,
		unit_amount_cents: 6500,
		amount_cents: 6500,
		currency: 'EUR',
		status,
		paid_at: status === 'paid' ? now : null
	});

	if (error) {
		throw new Error(`Could not write the test invoice: ${error.message}`);
	}
}

/** Turn the conference's `accepts_delegations` off, which is what draws the notice. */
async function stopAcceptingDelegations(conferenceId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('conferences')
		.update({ accepts_delegations: false })
		.eq('id', conferenceId);

	if (error) {
		throw new Error(`Could not stop the test conference taking delegations: ${error.message}`);
	}
}

/**
 * Take away the `profiles` row of an account, leaving the account itself.
 *
 * This is the state the page's "Deleted account" head is about, and deleting the
 * whole account could not produce it: `delegation_members.user_id` is
 * `on delete cascade`, so an account that really goes takes its membership with
 * it and the delegation is left with no head row at all. What the page has to
 * survive is a membership whose person can no longer be named — a profile that
 * has gone while the membership is still there — and that is what this seeds.
 * Nothing has a foreign key to `profiles`, so the row can simply be deleted.
 */
async function deleteProfile(user: TestUser): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin.from('profiles').delete().eq('id', user.id);

	if (error) {
		throw new Error(`Could not delete the test profile: ${error.message}`);
	}
}

/**
 * A piece of text as the reader really sees it.
 *
 * Every delegation is drawn twice — as a table row from `md` up and as a card
 * below that — and whichever of the two this width does not use is
 * `display: none`. A plain text lookup would find both, and Playwright refuses
 * to act on two elements at once, so this keeps the one on screen.
 */
function shownText(main: Locator, text: string): Locator {
	return main.getByText(text).filter({ visible: true });
}

/**
 * Everything the page is showing, as one line of text.
 *
 * A number beside its word may be in the same element or in the one next door,
 * and neither is what the seats criterion is about, so the three numbers are
 * read off the page's own text rather than one element at a time — the way
 * `tests/e2e/delegations.spec.ts` reads the same three numbers on the head's own
 * dashboard. `innerText` gives the text as it is drawn, so the half of the list
 * this width hides is left out of it, and the runs of spaces and newlines
 * between one cell and the next are squeezed to a single space.
 */
async function shownWords(main: Locator): Promise<string> {
	return (await main.innerText()).replace(/\s+/g, ' ');
}

/**
 * One tab of the status strip.
 *
 * `ManageTabs` draws itself as a `<nav aria-label="Sections">` of links, and this is
 * scoped to that strip because the organiser sidebar is inside `<main>` too and
 * carries a link called "Delegations". The words are matched from the start
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
 * Submit the filter form the way a reader does, by pressing Enter in the search
 * box.
 *
 * A text box inside a form with a submit button submits that form when Enter is
 * pressed in it, which is the browser's own behaviour and needs no JavaScript.
 * Pressing "Apply filters" would do the same thing; going through the box means
 * this file does not have to know what the button is called.
 */
async function applyTheFilters(main: Locator): Promise<void> {
	await main.locator('input[name="q"]').press('Enter');
}

/*
	Every test here signs a brand-new account in, seeds a draft conference,
	seeds a conference with delegations and then works through the page. That is a
	great deal more than most browser tests do, and thirty seconds — what
	Playwright allows a test by default — is not always enough for it while the
	whole suite is asking the one local database at once. `test.slow()` triples
	that allowance. It is an allowance and not a wait: a test that is quick still
	finishes as quickly as it can.
*/
test.beforeEach(() => {
	test.slow();
});

test('never shows a draft, on any of the four tabs', async ({ page }) => {
	const conference = await signInWithAConference(page, 'Draft Delegations MUN');

	const sent = await addDelegation(conference.id, {
		name: 'Riverside School Delegation',
		status: 'submitted'
	});

	/*
		A draft is a delegation somebody is still writing: they have registered the
		group but not sent the request. The `delegations` select policy lets an
		organiser of the conference read it all the same, and a policy decides rows
		and not columns, so leaving it out is the page's own job — which is what
		makes this worth a test.
	*/
	const draft = await addDelegation(conference.id, {
		name: 'Half Written School Delegation',
		status: 'draft'
	});

	await openTheDelegationsPage(page, conference);

	const main = page.getByRole('main');

	// "Under review" is the tab the page opens on, and the sent request is on it.
	await expect(shownText(main, sent.name)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(main.getByText(draft.name)).toHaveCount(0);

	/*
		And not on any of the other three tabs either: a draft belongs to no tab,
		because `draft` is the one status the table does not offer. Each tab is
		waited for by its address rather than by the heading, which is the same word
		on every one of them.
	*/
	const otherTabs = [
		{ label: 'Accepted', status: 'accepted' },
		{ label: 'Not accepted', status: 'rejected' },
		{ label: 'Withdrawn', status: 'withdrawn' }
	];

	for (const tab of otherTabs) {
		await statusTab(main, tab.label).click();
		await page.waitForURL(new RegExp(`status=${tab.status}`), { timeout: DATABASE_TIMEOUT_MS });
		await expect(main.getByText(draft.name)).toHaveCount(0);
	}

	/*
		Back to where it started, so that the draft has been looked for on all four.
		"Under review" is the tab the page opens on, and `manageDelegationsUrl` leaves
		a default out of the address, so this one link is the bare page with no
		`status=` on it at all.
	*/
	await statusTab(main, 'Under review').click();
	await page.waitForURL(/\/delegations$/, { timeout: DATABASE_TIMEOUT_MS });

	await expect(shownText(main, sent.name)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(main.getByText(draft.name)).toHaveCount(0);
});

test('keeps the tab, the search, the country, the sort and the page in the address', async ({
	page
}) => {
	const conference = await signInWithAConference(page, 'Filter Delegations MUN');

	/*
		The one delegation with a head on it. Its name, its school and its head's
		name have no word in common, so a search for any one of the three proves
		that `q` really looks at that field and not at another.
	*/
	const head = await createTestUser('Margot Dupont');
	const ecole = await addDelegation(conference.id, {
		name: 'Ecole des Roches Delegation',
		institutionName: 'Lycee Francais de La Haye',
		countryCode: 'FR',
		status: 'accepted'
	});

	await addDelegationMember(ecole.id, head, 'head');

	/*
		One more group than a page holds, so that there is a second page to go to.
		They are seeded with seats counting down from the first to the last, so that
		"Largest first" has an order worth asserting and the group on the second
		page is known: with twenty-six rows a second page holds exactly one.
	*/
	const groupNames: string[] = [];

	for (let index = 0; index < DELEGATIONS_OVER_ONE_PAGE; index += 1) {
		const name = `Riverside Group ${String(index + 1).padStart(2, '0')}`;

		await addDelegation(conference.id, {
			name,
			institutionName: 'Riverside High School',
			countryCode: 'FR',
			status: 'accepted',
			requestedSeats: DELEGATIONS_OVER_ONE_PAGE - index
		});

		groupNames.push(name);
	}

	const largestGroup = groupNames[0];
	const smallestGroup = groupNames[groupNames.length - 1];

	// Two groups that each fail exactly one of the filters while matching the
	// search, so that a filter quietly doing nothing shows up as a row that should
	// not be there.
	await addDelegation(conference.id, {
		name: 'Riverside Group Abroad',
		institutionName: 'Riverside High School',
		countryCode: 'BR',
		status: 'accepted'
	});
	await addDelegation(conference.id, {
		name: 'Riverside Group Under Review',
		institutionName: 'Riverside High School',
		countryCode: 'FR',
		status: 'submitted'
	});

	await openTheDelegationsPage(page, conference);

	const main = page.getByRole('main');

	// Each tab is a real link, so opening one is a navigation and the address says
	// which tab is open.
	await statusTab(main, 'Accepted').click();
	await page.waitForURL(/status=accepted/, { timeout: DATABASE_TIMEOUT_MS });

	await expect(shownText(main, ecole.name)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	// The search covers the delegation's own name…
	await main.locator('input[name="q"]').fill('Ecole des Roches');
	await applyTheFilters(main);
	await page.waitForURL(/q=Ecole/, { timeout: DATABASE_TIMEOUT_MS });

	await expect(shownText(main, ecole.name)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(main.getByText(largestGroup)).toHaveCount(0);

	// …the school it comes from…
	await main.locator('input[name="q"]').fill('Lycee Francais de La Haye');
	await applyTheFilters(main);
	await page.waitForURL(/q=Lycee/, { timeout: DATABASE_TIMEOUT_MS });

	await expect(shownText(main, ecole.name)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(main.getByText(largestGroup)).toHaveCount(0);

	// …and the name of its head, which is the one of the three that lives in
	// another table altogether.
	await main.locator('input[name="q"]').fill('Margot Dupont');
	await applyTheFilters(main);
	await page.waitForURL(/q=Margot/, { timeout: DATABASE_TIMEOUT_MS });

	await expect(shownText(main, ecole.name)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(main.getByText(largestGroup)).toHaveCount(0);

	// The three sorts the spec offers, in the reader's words rather than in the
	// database's.
	const sortChoices = main.locator('select[name="sort"]');

	await expect(sortChoices).toContainText('Oldest first');
	await expect(sortChoices).toContainText('Name');
	await expect(sortChoices).toContainText('Largest first');

	// Now every control at once: the search, the country and the sort, on top of
	// the tab that is already open.
	await main.locator('input[name="q"]').fill('Riverside');
	await main.locator('select[name="country"]').selectOption('FR');
	await sortChoices.selectOption('size');
	await applyTheFilters(main);

	await page.waitForURL(/sort=size/, { timeout: DATABASE_TIMEOUT_MS });

	/*
		The address is read a parameter at a time rather than compared with one
		written-out string. A GET form sends every control it holds, so without
		JavaScript the address also carries the parameters that are still at their
		default, and what this criterion is about is that each answer is in the
		address at all.
	*/
	const filtered = new URL(page.url());

	expect(filtered.pathname).toBe(conference.delegationsPath);
	expect(filtered.searchParams.get('q')).toBe('Riverside');
	expect(filtered.searchParams.get('status')).toBe('accepted');
	expect(filtered.searchParams.get('country')).toBe('FR');
	expect(filtered.searchParams.get('sort')).toBe('size');

	// Largest first, so the group that asked for the most seats leads the list.
	await expect(shownText(main, largestGroup)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(shownText(main, 'Page 1 of 2')).toBeVisible();

	// The three that each fail one filter are gone: the search, the country and
	// the tab are all really being asked.
	await expect(main.getByText(ecole.name)).toHaveCount(0);
	await expect(main.getByText('Riverside Group Abroad')).toHaveCount(0);
	await expect(main.getByText('Riverside Group Under Review')).toHaveCount(0);

	// The pager is a pair of ordinary links, so the second page is a real address,
	// and it carries the filters with it.
	await nextPageLink(main).click();
	await page.waitForURL(/page=2/, { timeout: DATABASE_TIMEOUT_MS });

	await expect(shownText(main, smallestGroup)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(main.getByText(largestGroup)).toHaveCount(0);

	const paged = new URL(page.url());

	expect(paged.searchParams.get('q')).toBe('Riverside');
	expect(paged.searchParams.get('status')).toBe('accepted');
	expect(paged.searchParams.get('country')).toBe('FR');
	expect(paged.searchParams.get('sort')).toBe('size');
	expect(paged.searchParams.get('page')).toBe('2');

	/*
		The whole point of keeping the state in the address: a refresh asks the
		server the same question again, so the same rows come back and every control
		still shows what it was set to.
	*/
	await page.reload();
	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
		'Delegations',
		{ timeout: DATABASE_TIMEOUT_MS }
	);

	expect(new URL(page.url()).searchParams.get('page')).toBe('2');

	await expect(shownText(main, smallestGroup)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(main.getByText(largestGroup)).toHaveCount(0);

	await expect(main.locator('input[name="q"]')).toHaveValue('Riverside');
	await expect(main.locator('select[name="country"]')).toHaveValue('FR');
	await expect(main.locator('select[name="sort"]')).toHaveValue('size');
});

test('shows the seats requested, allocated and assigned as three numbers', async ({ page }) => {
	const conference = await signInWithAConference(page, 'Seats Delegations MUN');

	const securityCouncil = await addCommittee(conference.id, 'Security Council', 'UNSC');
	const head = await createTestUser('Margot Dupont');
	const delegation = await addDelegation(conference.id, {
		name: 'Lycee Francais Delegation',
		status: 'accepted',
		requestedSeats: SEATS_REQUESTED
	});

	await addDelegationMember(delegation.id, head, 'head');

	/*
		The members who are really sitting in a seat. `check_seat_allocation` only
		lets a seat name somebody who is in the delegation it is reserved for, so
		each of them joins the group before the seats are written.
	*/
	const seatedMembers: TestUser[] = [];

	for (let index = 0; index < SEATS_ASSIGNED; index += 1) {
		const member = await createTestUser(unusedName('Delegate'));

		await addDelegationMember(delegation.id, member, 'member');
		seatedMembers.push(member);
	}

	// Ten seats reserved for the group, six of them with somebody in them. Twelve
	// were asked for, so all three numbers differ and none of them can stand in
	// for another.
	await allocateSeats(securityCouncil, delegation.id, SEATS_ALLOCATED, seatedMembers);

	await openTheDelegationsPage(page, conference);

	const main = page.getByRole('main');

	await statusTab(main, 'Accepted').click();
	await page.waitForURL(/status=accepted/, { timeout: DATABASE_TIMEOUT_MS });

	await expect(shownText(main, delegation.name)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	const words = await shownWords(main);

	// "10 of 12 given" over "6 assigned to members", the redesign's words for
	// allocated out of requested, and assigned.
	expect(words).toContain(`${SEATS_ALLOCATED} of ${SEATS_REQUESTED} given`);
	expect(words).toContain(`${SEATS_ASSIGNED} assigned to members`);
});

/*
	T76: an accepted delegation that holds seats and has seated nobody is the one
	the organisers have to chase. The table marks its "0 assigned to members" with a dot
	whose title says why; a phone cannot hover, so its card writes the words out.
	A delegation that has seated somebody gets neither.
*/
test('marks the accepted delegation that has seated nobody', async ({ page }, testInfo) => {
	const conference = await signInWithAConference(page, 'Unassigned Delegations MUN');
	const securityCouncil = await addCommittee(conference.id, 'Security Council', 'UNSC');

	const idle = await addDelegation(conference.id, {
		name: 'Idle School Delegation',
		status: 'accepted',
		requestedSeats: 2
	});
	await allocateSeats(securityCouncil, idle.id, 2, []);

	const busy = await addDelegation(conference.id, {
		name: 'Busy School Delegation',
		status: 'accepted',
		requestedSeats: 1
	});
	const member = await createTestUser('Margot Dupont');
	await addDelegationMember(busy.id, member, 'member');
	const generalAssembly = await addCommittee(conference.id, 'General Assembly', 'GA');
	await allocateSeats(generalAssembly, busy.id, 1, [member]);

	await openTheDelegationsPage(page, conference);
	const main = page.getByRole('main');
	await statusTab(main, 'Accepted').click();
	await page.waitForURL(/status=accepted/, { timeout: DATABASE_TIMEOUT_MS });
	await expect(shownText(main, idle.name)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	const warning = main.locator('[title="No members assigned yet"]').filter({ visible: true });

	if (testInfo.project.name === 'phone') {
		await expect(shownText(main, 'No members assigned yet')).toHaveCount(1);
		const idleCard = main.getByRole('link').filter({ hasText: idle.name });
		await expect(idleCard).toContainText('No members assigned yet');
		return;
	}

	await expect(warning).toHaveCount(1);
	await expect(warning).toHaveText('0 assigned to members');
	// The row holding the dot is the idle delegation's, not the busy one's.
	const dotTitle = page.locator('[title="No members assigned yet"]');
	await expect(main.getByRole('row').filter({ has: dotTitle })).toContainText(idle.name);
});

test('shows what every invoice of a delegation adds up to', async ({ page }) => {
	const conference = await signInWithAConference(page, 'Invoice Delegations MUN');

	/*
		Four groups, one per badge. Each has a head of its own, because
		`check_one_route_per_conference` lets an account into one delegation per
		conference, and because the head is who a group's invoice is owed by.
	*/
	const withNothing = await addDelegation(conference.id, {
		name: 'Lycee Francais Delegation',
		institutionName: 'Lycee Francais de La Haye',
		status: 'accepted'
	});
	const withUnpaid = await addDelegation(conference.id, {
		name: 'Riverside School Delegation',
		institutionName: 'Riverside High School',
		status: 'accepted'
	});
	const withBoth = await addDelegation(conference.id, {
		name: 'Colegio Bolivar Delegation',
		institutionName: 'Colegio Bolivar de Bogota',
		status: 'accepted'
	});
	const withPaid = await addDelegation(conference.id, {
		name: 'Gymnasium Nord Delegation',
		institutionName: 'Gymnasium Nord Hamburg',
		status: 'accepted'
	});

	const unpaidHead = await createTestUser('Aiden Brooks');
	const bothHead = await createTestUser('Valentina Rojas');
	const paidHead = await createTestUser('Lena Fischer');

	await addDelegationMember(withNothing.id, await createTestUser('Margot Dupont'), 'head');
	await addDelegationMember(withUnpaid.id, unpaidHead, 'head');
	await addDelegationMember(withBoth.id, bothHead, 'head');
	await addDelegationMember(withPaid.id, paidHead, 'head');

	await addDelegationInvoice(conference.id, withUnpaid.id, unpaidHead, 'unpaid');
	// Two invoices that disagree, which is the whole of "partly paid": a group
	// that has paid for some of its seats and not for the rest.
	await addDelegationInvoice(conference.id, withBoth.id, bothHead, 'paid');
	await addDelegationInvoice(conference.id, withBoth.id, bothHead, 'unpaid');
	await addDelegationInvoice(conference.id, withPaid.id, paidHead, 'paid');

	await openTheDelegationsPage(page, conference);

	const main = page.getByRole('main');

	await statusTab(main, 'Accepted').click();
	await page.waitForURL(/status=accepted/, { timeout: DATABASE_TIMEOUT_MS });

	/*
		Each group is looked at on its own, by searching for its name, so that the
		badge on screen can only be that group's. All four are on the same tab, and
		a badge asked for across the whole list would say that the four words are
		somewhere on the page without saying which row each belongs to.
	*/
	const expectedBadges = [
		{ delegation: withNothing, badge: 'No invoice' },
		{ delegation: withUnpaid, badge: 'Unpaid' },
		{ delegation: withBoth, badge: 'Partly paid' },
		{ delegation: withPaid, badge: 'Paid' }
	];

	for (const expected of expectedBadges) {
		await main.locator('input[name="q"]').fill(expected.delegation.name);
		await applyTheFilters(main);

		// The first word of each of these names belongs to that group alone, so
		// waiting for it to reach the address is what says the search has been
		// answered. Without that wait the badge could be read off the page that is
		// still on its way out, which is showing all four groups at once.
		const firstWordOfTheName = expected.delegation.name.split(' ')[0];

		await page.waitForURL(new RegExp(`q=${firstWordOfTheName}`), {
			timeout: DATABASE_TIMEOUT_MS
		});

		await expect(shownText(main, expected.delegation.name)).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		// `exact` matches the whole badge rather than a part of it, which is how
		// "Paid" is told apart from "Partly paid" and from "Unpaid".
		await expect(
			main.getByText(expected.badge, { exact: true }).filter({ visible: true })
		).toBeVisible();
	}
});

test('says so when a tab has nothing on it', async ({ page }) => {
	const conference = await signInWithAConference(page, 'Empty Delegations MUN');

	// Nothing is seeded at all: a conference nobody has registered a delegation
	// for is what a new organiser sees on the day they open this page.
	await openTheDelegationsPage(page, conference);

	const main = page.getByRole('main');

	await expect(shownText(main, 'No delegation requests yet.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
});

test('titles a non-default tab with its own empty message rather than the default one', async ({
	page
}) => {
	const conference = await signInWithAConference(page, 'Empty Accepted Delegations MUN');

	// One submitted delegation, so the conference is not empty everywhere and
	// this test can tell "the Accepted tab has nothing in it" from "the page
	// never loaded any delegation at all".
	const head = await createTestUser('Marc Dupont');
	const delegation = await addDelegation(conference.id, {
		status: 'submitted',
		name: unusedName('Lycee Francais')
	});
	await addDelegationMember(delegation.id, head, 'head');

	await openTheDelegationsPage(page, conference);

	const main = page.getByRole('main');

	await statusTab(main, 'Accepted').click();
	await page.waitForURL(/status=accepted/, { timeout: DATABASE_TIMEOUT_MS });

	// `DELEGATION_EMPTY_TITLES` gives the accepted tab its own title rather than
	// reusing "No delegation requests yet.", which would be wrong on this tab.
	await expect(shownText(main, 'No accepted delegations.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
});

test('says so when the conference does not accept delegations', async ({ page }) => {
	const conference = await signInWithAConference(page, 'No Delegations MUN');

	// A new conference takes both roads in by default, so this is turned
	// off behind it. An organiser does the same thing on the application form
	// page, which is where the notice sends them to turn it back on.
	await stopAcceptingDelegations(conference.id);

	await openTheDelegationsPage(page, conference);

	const main = page.getByRole('main');

	await expect(
		shownText(
			main,
			'This conference does not accept delegations. Change that under Application form.'
		)
	).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
});

test('shows a head whose profile has gone as a deleted account', async ({ page }) => {
	const conference = await signInWithAConference(page, 'Deleted Head Delegations MUN');

	const head = await createTestUser('Margot Dupont');
	const delegation = await addDelegation(conference.id, {
		name: 'Riverside School Delegation',
		status: 'submitted'
	});

	await addDelegationMember(delegation.id, head, 'head');
	await deleteProfile(head);

	await openTheDelegationsPage(page, conference);

	const main = page.getByRole('main');

	// The delegation is still there, and still has to be decided; only the person
	// who registered it can no longer be named.
	await expect(shownText(main, delegation.name)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(shownText(main, 'Deleted account')).toBeVisible();
	await expect(main.getByText('Margot Dupont')).toHaveCount(0);
});

test('shows cards instead of a table on a phone', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	// Long names on purpose. A line that may not wrap is as wide as its text
	// however narrow its column is, which is what pushes a page sideways, and a
	// short name would never show it.
	const conference = await signInWithAConference(
		page,
		'Phone Delegations International Model United Nations Conference'
	);

	const head = await createTestUser('Aleksandra Wisniewska-Kowalczyk');
	const delegation = await addDelegation(conference.id, {
		name: 'Liceum Ogolnoksztalcace im. Marii Sklodowskiej-Curie Delegation',
		institutionName: 'Liceum Ogolnoksztalcace im. Marii Sklodowskiej-Curie w Warszawie',
		countryCode: 'PL',
		status: 'submitted',
		requestedSeats: SEATS_REQUESTED
	});

	await addDelegationMember(delegation.id, head, 'head');

	await addDelegation(conference.id, {
		name: 'The Royal Grammar School of Newcastle upon Tyne Delegation',
		institutionName: 'The Royal Grammar School of Newcastle upon Tyne',
		countryCode: 'GB',
		status: 'submitted'
	});

	await openTheDelegationsPage(page, conference);

	const main = page.getByRole('main');

	await expect(shownText(main, delegation.name)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	/*
		A `<tr>` cannot be drawn outside a `<table>`, so the same list is drawn twice
		and one of the two is hidden at any width. Below `md` the hidden one is the
		table, and an element that is `display: none` is not a table any more as far
		as a screen reader — or `getByRole` — is concerned.
	*/
	await expect(main.getByRole('table')).toHaveCount(0);

	// The cards are what is left, and they carry the same facts the table's
	// columns do.
	await expect(
		shownText(main, 'The Royal Grammar School of Newcastle upon Tyne Delegation')
	).toBeVisible();

	const words = await shownWords(main);

	expect(words).toContain(`0 of ${SEATS_REQUESTED} given`);

	await expectNoSidewaysOverflow(page);
});

test('fits in a few screens', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough to measure a height.');

	const conference = await signInWithAConference(page, 'Height Check Delegations MUN');

	// A list with something real on it, each row carrying a name, a school, a
	// flag, a head, a member count, three seat numbers and an invoice status.
	const delegations: TestDelegation[] = [];

	for (let index = 0; index < DELEGATIONS_FOR_THE_HEIGHT_TEST; index += 1) {
		const head = await createTestUser(unusedName('Head'));
		const delegation = await addDelegation(conference.id, {
			name: unusedName('Riverside School Delegation'),
			institutionName: 'Riverside High School',
			countryCode: 'PL',
			status: 'submitted'
		});

		await addDelegationMember(delegation.id, head, 'head');
		delegations.push(delegation);
	}

	await openTheDelegationsPage(page, conference);

	const main = page.getByRole('main');
	const lastDelegation = delegations[delegations.length - 1];

	await expect(shownText(main, lastDelegation.name)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	// Saved before the assertion, so that a failure leaves a picture of the page
	// that failed it.
	await saveFullPageScreenshot(page, 'manage-delegations');
	await expectPageFitsInScreens(page, MANAGE_DELEGATIONS_SCREENS);
});
