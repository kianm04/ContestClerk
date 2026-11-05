import { expect, test, type Locator, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { createTestUser, signIn, type TestUser } from './signed-in-user';
import { createDraftConferenceFor } from './draft-conference';
import { expectNoSidewaysOverflow, expectPageFitsInScreens } from './page-shape';
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

// The acceptance criteria of `specs/05-pages/organiser/delegation-review.md`
// that need a real browser, for the page T73 builds at
// `/manage/[slug]/delegations/[delegationId]`:
//
// * accepting with seats ticked sets the delegation to `accepted`, reserves
//   exactly the ticked seats and writes one invoice for that count;
// * allocating more seats later writes a second invoice for the added seats
//   alone, rather than a bigger one for all of them;
// * a reserved seat somebody is sitting in may not be removed;
// * an accepted delegation may not be marked "not accepted" while it still
//   holds seats;
// * the members' private details — their age, phone and dietary requirements —
//   are on this page, which is the one place outside their own profile they
//   appear;
// * a hidden seat is never offered by the picker, which is the last line of
//   `specs/05-pages/organiser/allocation.md`;
// * the whole page works with JavaScript switched off.
//
// EVERYTHING HERE ALREADY RUNS WITHOUT JAVASCRIPT
// Every test below runs on all three projects `playwright.config.ts` names,
// including `desktop-no-js`, and none of them needs a helper to make that work.
// The picker is a real `<form method="post">` of ordinary checkboxes, and
// `ConfirmButton` opens a confirmation page asking the same question when there
// is no script to open its dialog. That is the "Everything works without
// JavaScript" criterion, and it is why no test in this file clicks anything a
// script had to draw first.
//
// WHAT IS NOT HERE
// The two notifications the head receives are database triggers, and
// `client/tests/db/participant-notifications.test.ts` already proves both fire
// with the right titles. Nothing a browser can see would add to that.
//
// WHAT THESE TESTS LEAVE BEHIND
// Each test signs a brand-new account in and creates its own conference through
// `./draft-conference`, for the reasons `tests/e2e/manage-delegations.spec.ts`
// sets out at length: three projects run against one database at once, so a
// test that borrowed a shared conference would be reading another project's
// work. The conferences are dated in 2020 so that `/conferences`, which lists
// what has not finished, does not grow.
//
// `createDraftConference`, `slugOf`, `readConferenceId` and
// `signInWithAConference` below are copies of the ones in
// `tests/e2e/manage-delegations.spec.ts`, deliberately copies rather than shared
// imports for the reason that file gives about its own copies.

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
 * the full fifteen seconds would only ever run once. The same number, and the
 * same reason, as in `tests/e2e/delegation-members.spec.ts`.
 */
const SINGLE_TRY_TIMEOUT_MS = 2_000;

/** The days a conference these tests create runs on. Both in the past. */
const CONFERENCE_FIRST_DAY = '2020-05-03';
const CONFERENCE_LAST_DAY = '2020-05-05';

/** What one delegation member costs, so that an allocation writes an invoice. */
const DELEGATION_MEMBER_FEE_CENTS = 7500;

/** The seats the test delegation asked the organisers for. */
const SEATS_REQUESTED = 6;

/**
 * How many windows tall the review page may be with a small delegation on it.
 *
 * Three, the ceiling every organiser page is held to, and for the same reason
 * `tests/e2e/page-shape.ts` gives: more than that means the cards are being
 * drawn too big to be scanned.
 */
const REVIEW_PAGE_SCREENS = 3;

/** A name nothing else in the database will match. */
function unusedName(prefix: string): string {
	return `${prefix} ${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * A join code for a delegation this file writes straight into the table.
 *
 * `create_delegation` mints one, but every delegation below is written with the
 * service-role client, which walks past that function, and
 * `delegations.join_code` is `not null unique`. The characters are the ones
 * that function uses — no 0, O, 1 or I.
 */
function unusedJoinCode(): string {
	const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	const characters: string[] = [];

	for (let position = 0; position < 8; position += 1) {
		characters.push(alphabet[Math.floor(Math.random() * alphabet.length)]);
	}

	return characters.join('');
}

/**
 * Give `user` a draft conference of its own, run by a brand-new organisation,
 * and answer its `/manage/<slug>` address.
 *
 * The rows are written straight into the database by `./draft-conference`,
 * whose comment says why: the one-step `/create` form these tests used to fill
 * in is gone, and the creation flow that replaced it has its own
 * `create-*.spec.ts` files.
 */
async function createDraftConference(user: TestUser, prefix: string): Promise<string> {
	const draft = await createDraftConferenceFor(user, {
		name: unusedName(prefix),
		organizationName: unusedName(`${prefix} Society`),
		startDate: CONFERENCE_FIRST_DAY,
		endDate: CONFERENCE_LAST_DAY
	});

	return `/manage/${draft.slug}`;
}

/** The slug at the end of a `/manage/<slug>` address. */
function slugOf(managePath: string): string {
	return managePath.split('/').pop() ?? '';
}

/** The id of the conference a slug names, which ends in a random suffix. */
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

/** A signed-in organiser with a conference of their own. */
type TestConference = {
	user: TestUser;
	id: string;
	slug: string;
	managePath: string;
};

/** Sign a brand-new account in and give it a conference of its own. */
async function signInWithAConference(page: Page, prefix: string): Promise<TestConference> {
	const user = await createTestUser('Priya Nair');
	await signIn(page, user);

	const managePath = await createDraftConference(user, prefix);
	const slug = slugOf(managePath);

	return { user, id: await readConferenceId(slug), slug, managePath };
}

/**
 * Give the conference one committee and answer its id.
 *
 * Committees are T02's form and are not what this page is about, so the
 * service-role client writes the row, the way `addCommittee` in
 * `tests/e2e/manage-delegations.spec.ts` does.
 */
async function addCommittee(conferenceId: string, abbreviation: string): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('committees')
		.insert({
			conference_id: conferenceId,
			name: `Security Council ${abbreviation}`,
			abbreviation,
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

/** One seat a test wants in a committee. */
type SeatSeed = {
	name: string;
	/** False for a seat the organisers have taken off offer. */
	isAvailable?: boolean;
};

/** Write free seats into a committee, in the order given. */
async function addSeats(committeeId: string, seats: SeatSeed[]): Promise<void> {
	const admin = createServiceRoleClient();

	const rows = seats.map((seat, index) => ({
		committee_id: committeeId,
		name: seat.name,
		country_code: 'FR',
		position: index,
		is_available: seat.isAvailable ?? true
	}));

	const { error } = await admin.from('seats').insert(rows);

	if (error) {
		throw new Error(`Could not write the test seats: ${error.message}`);
	}
}

/**
 * Charge every delegation member a fee, so that allocating seats writes an
 * invoice.
 *
 * `applicable_fee` picks the lowest position whose window is open, and a
 * conference with no fee rows invoices nobody, which is the other half of the
 * flash this page shows.
 */
async function addDelegationMemberFee(conferenceId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin.from('fees').insert({
		conference_id: conferenceId,
		name: 'Delegation member fee',
		amount_cents: DELEGATION_MEMBER_FEE_CENTS,
		applies_to: 'delegation_member',
		valid_from: null,
		valid_until: null,
		position: 0
	});

	if (error) {
		throw new Error(`Could not write the test fee: ${error.message}`);
	}
}

/** One delegation a test has arranged. */
type TestDelegation = {
	id: string;
	name: string;
	/** The `/manage/<slug>/delegations/<id>` address this file is about. */
	reviewPath: string;
};

/**
 * Write one delegation straight into the table, with a head in it.
 *
 * The service-role client writes it, the way `addDelegation` in
 * `tests/e2e/manage-delegations.spec.ts` does and for the same reason:
 * `guard_delegation_insert` only runs for the two roles a browser uses, so an
 * `accepted` row can only be arranged this way.
 */
async function addDelegation(
	conference: TestConference,
	status: 'submitted' | 'accepted',
	head: TestUser
): Promise<TestDelegation> {
	const admin = createServiceRoleClient();
	const name = unusedName('Lycee Francais');

	const { data, error } = await admin
		.from('delegations')
		.insert({
			conference_id: conference.id,
			name,
			institution_name: 'Lycee Francais de La Haye',
			country_code: 'FR',
			status,
			requested_seats: SEATS_REQUESTED,
			join_code: unusedJoinCode(),
			submitted_at: new Date().toISOString()
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test delegation: ${error?.message}`);
	}

	const { error: memberError } = await admin
		.from('delegation_members')
		.insert({ delegation_id: data.id, user_id: head.id, role: 'head' });

	if (memberError) {
		throw new Error(`Could not put the test head in the delegation: ${memberError.message}`);
	}

	return {
		id: data.id,
		name,
		reviewPath: `${conference.managePath}/delegations/${data.id}`
	};
}

/** Put one more account in a delegation as an ordinary member. */
async function addDelegationMember(delegationId: string, member: TestUser): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('delegation_members')
		.insert({ delegation_id: delegationId, user_id: member.id, role: 'member' });

	if (error) {
		throw new Error(`Could not put the test account in the delegation: ${error.message}`);
	}
}

/** The three private facts this page shows beside a member's name. */
type PrivateDetailsSeed = {
	/** `YYYY-MM-DD`, which the page turns into an age. */
	dateOfBirth: string;
	phone: string;
	dietaryRequirements: string;
};

/**
 * Write the private facts the page shows.
 *
 * `handle_new_user` already made the `profile_details` row, so this updates it.
 * A person may write their own details through `/settings`, so the service-role
 * client is only standing in for a form these tests are not about.
 */
async function writePrivateDetails(member: TestUser, seed: PrivateDetailsSeed): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('profile_details')
		.update({
			date_of_birth: seed.dateOfBirth,
			phone: seed.phone,
			dietary_requirements: seed.dietaryRequirements
		})
		.eq('user_id', member.id);

	if (error) {
		throw new Error(`Could not write the test private details: ${error.message}`);
	}
}

/** Reserve one existing seat for a delegation, optionally with somebody in it. */
async function reserveSeatByName(
	committeeId: string,
	delegationId: string,
	seatName: string,
	holder: TestUser | null
): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('seats')
		.update({
			delegation_id: delegationId,
			user_id: holder === null ? null : holder.id,
			allocated_at: new Date().toISOString()
		})
		.eq('committee_id', committeeId)
		.eq('name', seatName);

	if (error) {
		throw new Error(`Could not reserve the test seat: ${error.message}`);
	}
}

/** The delegation as the database holds it now. */
async function readDelegationStatus(delegationId: string): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('delegations')
		.select('status')
		.eq('id', delegationId)
		.single();

	if (error || !data) {
		throw new Error(`Could not read the test delegation: ${error?.message}`);
	}

	return data.status;
}

/** The names of the seats reserved for a delegation, in alphabetical order. */
async function readReservedSeatNames(delegationId: string): Promise<string[]> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('seats')
		.select('name')
		.eq('delegation_id', delegationId)
		.order('name', { ascending: true });

	if (error || !data) {
		throw new Error(`Could not read the test seats: ${error?.message}`);
	}

	return data.map((row) => row.name);
}

/** Every invoice of a delegation, oldest first, as `description` and `amount_cents`. */
async function readDelegationInvoices(
	delegationId: string
): Promise<{ description: string; amountCents: number }[]> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('invoices')
		.select('description, amount_cents, created_at')
		.eq('delegation_id', delegationId)
		.order('created_at', { ascending: true });

	if (error || !data) {
		throw new Error(`Could not read the test invoices: ${error?.message}`);
	}

	return data.map((row) => ({ description: row.description, amountCents: row.amount_cents }));
}

/** Open the review page and wait until its heading is really there. */
async function openTheReviewPage(page: Page, delegation: TestDelegation): Promise<void> {
	await page.goto(delegation.reviewPath);

	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
		delegation.name,
		{ timeout: DATABASE_TIMEOUT_MS }
	);
}

/**
 * Press a button and answer the question it asks, if it asks one.
 *
 * A copy of the one in `tests/e2e/delegation-members.spec.ts`. With JavaScript
 * a `ConfirmButton` press opens a `<dialog>` and the dialog's own button is
 * what submits. Without it — which is the `desktop-no-js` project — the press
 * opens a confirmation page asking the same question, whose own button is what
 * carries `confirm=1` on to the action. Both are right, so this waits to see
 * which of the two happened rather than assuming one.
 */
async function pressAndConfirm(page: Page, within: Locator, label: string): Promise<void> {
	// The dialog holds a second button with the same words on it, so the one in
	// the page itself is the first of the two. While the dialog is shut the
	// browser hides everything inside it, so until then there is only one.
	const button = within.getByRole('button', { name: label }).first();
	const dialog = page.getByRole('dialog');
	const dialogButton = dialog.getByRole('button', { name: label }).first();

	await button.press('Enter');

	// `waitFor` throws when nothing turns up in the time it is given, and that is
	// the "no dialog, so no script" answer: the press opened the confirmation page
	// instead.
	const isAsking = await dialogButton
		.waitFor({ state: 'visible', timeout: SINGLE_TRY_TIMEOUT_MS })
		.then(() => true)
		.catch(() => false);

	// No dialog means no script: the press opened the confirmation page instead.
	if (!isAsking) {
		await answerConfirmationPage(page, label);
		return;
	}

	await dialogButton.press('Enter');
}

/**
 * The reserved-seat row for one seat.
 *
 * `Section` gives every card an `aria-label` of its own title, which makes it a
 * landmark a locator can be narrowed to. Without that, the seat name would also
 * match the picker's checkbox label below it.
 */
function seatRow(page: Page, seatName: string): Locator {
	return page
		.getByRole('region', { name: 'Seats' })
		.getByRole('listitem')
		.filter({ hasText: seatName });
}

/**
 * The checkbox of one free seat in the picker.
 *
 * `Flag` prints the country's name beside the box, so a seat's accessible name
 * reads "France Brazil" — the country the seat carries, then the seat itself.
 * The seat name is the end of it, which is what this matches.
 */
function seatCheckbox(page: Page, seatName: string): Locator {
	return page.getByRole('checkbox', { name: new RegExp(`${seatName}$`) });
}

/** Tick the checkbox of one free seat in the picker. */
async function tickSeat(page: Page, seatName: string): Promise<void> {
	await seatCheckbox(page, seatName).check();
}

test.describe('the organiser delegation review page', () => {
	test('each row of the delegations table links to this page', async ({ page }) => {
		const conference = await signInWithAConference(page, 'Review Link');
		const head = await createTestUser('Marc Dupont');
		const delegation = await addDelegation(conference, 'submitted', head);

		await page.goto(`${conference.managePath}/delegations`);

		// Under `md` the table becomes cards and the whole card is the link, so the
		// link is found by the name inside it rather than by its exact words.
		const main = page.getByRole('main');
		await main
			.getByRole('link', { name: delegation.name, exact: false })
			.first()
			.click({ timeout: DATABASE_TIMEOUT_MS });

		await expect(main.getByRole('heading', { level: 1 })).toHaveText(delegation.name, {
			timeout: DATABASE_TIMEOUT_MS
		});
		expect(new URL(page.url()).pathname).toBe(delegation.reviewPath);
	});

	test('accepting with seats reserves exactly those seats and invoices for them', async ({
		page
	}) => {
		const conference = await signInWithAConference(page, 'Review Accept');
		const committeeId = await addCommittee(conference.id, 'UNSC');
		await addSeats(committeeId, [{ name: 'France' }, { name: 'Brazil' }, { name: 'Kenya' }]);
		await addDelegationMemberFee(conference.id);

		const head = await createTestUser('Marc Dupont');
		const delegation = await addDelegation(conference, 'submitted', head);

		await openTheReviewPage(page, delegation);

		await tickSeat(page, 'France');
		await tickSeat(page, 'Kenya');
		await page.getByRole('button', { name: /^Accept and allocate/ }).press('Enter');

		await expect(page.getByText(`2 seats allocated to ${delegation.name}.`)).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		expect(await readDelegationStatus(delegation.id)).toBe('accepted');
		expect(await readReservedSeatNames(delegation.id)).toEqual(['France', 'Kenya']);

		const invoices = await readDelegationInvoices(delegation.id);
		expect(invoices).toHaveLength(1);
		expect(invoices[0].amountCents).toBe(2 * DELEGATION_MEMBER_FEE_CENTS);
	});

	test('allocating more seats later invoices for the added seats alone', async ({ page }) => {
		const conference = await signInWithAConference(page, 'Review More');
		const committeeId = await addCommittee(conference.id, 'UNSC');
		await addSeats(committeeId, [{ name: 'France' }, { name: 'Brazil' }, { name: 'Kenya' }]);
		await addDelegationMemberFee(conference.id);

		const head = await createTestUser('Marc Dupont');
		const delegation = await addDelegation(conference, 'submitted', head);

		await openTheReviewPage(page, delegation);
		await tickSeat(page, 'France');
		await tickSeat(page, 'Kenya');
		await page.getByRole('button', { name: /^Accept and allocate/ }).press('Enter');
		await expect(page.getByText(`2 seats allocated to ${delegation.name}.`)).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		// The delegation is `accepted` now, so the same button offers more seats.
		await tickSeat(page, 'Brazil');
		// With JavaScript the button counts the ticked boxes — "Allocate 1 seat
		// more"; without it, it keeps the words it was drawn with.
		await page.getByRole('button', { name: /^Allocate / }).press('Enter');
		await expect(page.getByText(`1 seat allocated to ${delegation.name}.`)).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		const invoices = await readDelegationInvoices(delegation.id);
		expect(invoices).toHaveLength(2);
		expect(invoices[0].amountCents).toBe(2 * DELEGATION_MEMBER_FEE_CENTS);
		expect(invoices[1].amountCents).toBe(DELEGATION_MEMBER_FEE_CENTS);
	});

	test('a seat somebody is sitting in may not be removed', async ({ page }) => {
		const conference = await signInWithAConference(page, 'Review Remove');
		const committeeId = await addCommittee(conference.id, 'UNSC');
		await addSeats(committeeId, [{ name: 'France' }, { name: 'Brazil' }]);

		const head = await createTestUser('Marc Dupont');
		const delegation = await addDelegation(conference, 'accepted', head);
		await reserveSeatByName(committeeId, delegation.id, 'France', head);
		await reserveSeatByName(committeeId, delegation.id, 'Brazil', null);

		await openTheReviewPage(page, delegation);

		// The seat with the head sitting in it is the first of the two rows.
		await pressAndConfirm(page, seatRow(page, 'France'), 'Remove');

		await expect(page.getByText('Unassign the member first, or ask the head to.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		expect(await readReservedSeatNames(delegation.id)).toEqual(['Brazil', 'France']);
	});

	test('an accepted delegation may not be turned down while it holds seats', async ({ page }) => {
		const conference = await signInWithAConference(page, 'Review Reject');
		const committeeId = await addCommittee(conference.id, 'UNSC');
		await addSeats(committeeId, [{ name: 'France' }, { name: 'Brazil' }]);

		const head = await createTestUser('Marc Dupont');
		const delegation = await addDelegation(conference, 'accepted', head);
		await reserveSeatByName(committeeId, delegation.id, 'France', null);

		await openTheReviewPage(page, delegation);

		// The button is not even drawn while the rule would refuse the press, so
		// this is what the criterion looks like on screen.
		await expect(page.getByRole('button', { name: 'Not accepted' })).toHaveCount(0);

		// Give the seat back, and the button appears.
		await pressAndConfirm(page, seatRow(page, 'France'), 'Remove');
		await expect(page.getByText('Seat removed.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

		const decisionCard = page.getByRole('region', { name: 'Decision' });
		await expect(decisionCard.getByRole('button', { name: 'Not accepted' })).toBeVisible();
		await pressAndConfirm(page, decisionCard, 'Not accepted');

		await expect(page.getByText('Marked as not accepted. The head has been notified.')).toBeVisible(
			{ timeout: DATABASE_TIMEOUT_MS }
		);
		expect(await readDelegationStatus(delegation.id)).toBe('rejected');
	});

	// T142: with JavaScript the ticked seats move into the delegation's list the
	// moment "Accept and allocate" is pressed, before the server has saved them
	// and with no spinner, and a removal the server refuses puts the seat back
	// with a toast saying what did not happen.
	test('reserves seats at once, and puts a refused removal back', async ({ page }, testInfo) => {
		skipWithoutJavaScript(testInfo);

		const conference = await signInWithAConference(page, 'Review Instant');
		const committeeId = await addCommittee(conference.id, 'UNSC');
		await addSeats(committeeId, [{ name: 'France' }, { name: 'Brazil' }]);

		const head = await createTestUser('Marc Dupont');
		const delegation = await addDelegation(conference, 'submitted', head);

		await openTheReviewPage(page, delegation);
		await answerSlowly(page, 'allocate');
		await watchForSpinners(page);

		await tickSeat(page, 'France');
		await page.getByRole('button', { name: /^Accept and allocate/ }).press('Enter');

		await expect(seatRow(page, 'France').getByRole('button', { name: 'Remove' })).toBeVisible({
			timeout: AT_ONCE_TIMEOUT_MS
		});

		await waitUntilAnswered(page);
		expect(await sawSpinner(page)).toBe(false);
		expect(await readReservedSeatNames(delegation.id)).toEqual(['France']);

		await answerWithError(page, 'removeSeat');
		await pressAndConfirm(page, seatRow(page, 'France'), 'Remove');

		await expect(page.getByRole('alert')).toContainText('The seat was not removed.', {
			timeout: DATABASE_TIMEOUT_MS
		});
		await waitUntilAnswered(page);
		await expect(seatRow(page, 'France').getByRole('button', { name: 'Remove' })).toBeVisible();
		expect(await readReservedSeatNames(delegation.id)).toEqual(['France']);
	});

	test('answers a delegation id belonging to another conference with a 404', async ({ page }) => {
		// Two conferences, each with its own organiser, so that the second
		// account's own delegation review address is used to reach the first
		// account's delegation.
		const otherConference = await signInWithAConference(page, 'Review Elsewhere');
		const otherHead = await createTestUser('Marc Dupont');
		const delegationOfTheOtherConference = await addDelegation(
			otherConference,
			'submitted',
			otherHead
		);

		await page.context().clearCookies();

		const conference = await signInWithAConference(page, 'Review Wrong Conference');

		const response = await page.goto(
			`${conference.managePath}/delegations/${delegationOfTheOtherConference.id}`
		);

		// A 404 and not a 403, for the same reason `manage-allocation.spec.ts`
		// gives about the pages that sit beside this one: the answer must not tell
		// an organiser which delegations exist in a conference that is not theirs.
		expect(response?.status()).toBe(404);
	});

	test('tells the organiser the head has not invited any members yet, for a delegation of one', async ({
		page
	}) => {
		const conference = await signInWithAConference(page, 'Review Only The Head');
		const head = await createTestUser('Marc Dupont');
		// `addDelegation` puts the head in as the delegation's only member, which
		// is already the state this test is about: nobody else has joined.
		const delegation = await addDelegation(conference, 'submitted', head);

		await openTheReviewPage(page, delegation);

		const main = page.getByRole('main');

		await expect(
			main.getByText('The head has not invited any members yet. Seats can still be allocated.')
		).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	});

	test('warns that every seat is taken or reserved, when the conference has none free', async ({
		page
	}) => {
		const conference = await signInWithAConference(page, 'Review No Free Seats');
		// No committee and so no seat at all: `listSeatsByCommittee` has nothing
		// free to group, which is the same empty picker a conference with every
		// seat filled or reserved would show.
		const head = await createTestUser('Marc Dupont');
		const delegation = await addDelegation(conference, 'submitted', head);

		await openTheReviewPage(page, delegation);

		const main = page.getByRole('main');
		const warning = main.getByText(
			'Every seat is taken or reserved. Free seats on the allocation page first.'
		);

		await expect(warning).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

		// Scoped to the Seats section rather than to `<main>` as a whole: the
		// organiser sidebar carries a link with the same word on it, the way
		// `manage-allocation.spec.ts` explains for its own page heading.
		const allocationLink = page.getByRole('region', { name: 'Seats' }).getByRole('link', {
			name: 'Allocation'
		});

		await expect(allocationLink).toBeVisible();
		await allocationLink.click();

		await expect(page).toHaveURL(`${conference.managePath}/allocation`, {
			timeout: DATABASE_TIMEOUT_MS
		});
	});

	test("the members' private details are on this page, and hidden seats are not", async ({
		page
	}) => {
		const conference = await signInWithAConference(page, 'Review Details');
		const committeeId = await addCommittee(conference.id, 'UNSC');
		await addSeats(committeeId, [{ name: 'France' }, { name: 'Brazil', isAvailable: false }]);

		const head = await createTestUser('Marc Dupont');
		const member = await createTestUser('Anna Kowalski');
		const delegation = await addDelegation(conference, 'submitted', head);
		await addDelegationMember(delegation.id, member);
		await writePrivateDetails(member, {
			dateOfBirth: '2006-02-14',
			phone: '+31 6 1234 5678',
			dietaryRequirements: 'Vegetarian'
		});

		await openTheReviewPage(page, delegation);

		const main = page.getByRole('main');
		await expect(main.getByText('+31 6 1234 5678')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(main.getByText('Vegetarian')).toBeVisible();
		// Both members are drawn with the same headings, so this is the first of two.
		await expect(main.getByText('Dietary requirements').first()).toBeVisible();

		// A seat the organisers took off offer is never offered again by any
		// picker, which is the last line of `05-pages/organiser/allocation.md`.
		await expect(seatCheckbox(page, 'France')).toBeVisible();
		await expect(seatCheckbox(page, 'Brazil')).toHaveCount(0);
	});

	test('the page fits a desktop screen and does not scroll sideways', async ({
		page
	}, testInfo) => {
		const conference = await signInWithAConference(page, 'Review Shape');
		const committeeId = await addCommittee(conference.id, 'UNSC');
		await addSeats(committeeId, [{ name: 'France' }, { name: 'Brazil' }, { name: 'Kenya' }]);

		const head = await createTestUser('Marc Dupont');
		const delegation = await addDelegation(conference, 'submitted', head);

		await openTheReviewPage(page, delegation);

		await expectNoSidewaysOverflow(page);

		// Measured on a desktop alone: a phone is allowed to be as long as it
		// needs, which is what `page-shape.ts` says about every other page.
		if (testInfo.project.name === 'desktop') {
			await expectPageFitsInScreens(page, REVIEW_PAGE_SCREENS);
		}
	});
});
