import { expect, test, type APIResponse, type Locator, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	expectNoSidewaysOverflow,
	expectPageFitsInScreens,
	saveFullPageScreenshot
} from './page-shape';
import { createTestUser, signIn, type TestUser } from './signed-in-user';
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

// The acceptance criteria of `specs/05-pages/delegation/seats.md` that need a
// real browser, for the page task T29 builds at
// `/delegations/[delegationId]/seats`:
//
// * the header counts what is allocated, what is assigned and who is left over,
//   over the notice naming the day every seat has to be filled by;
// * a head picks a member in a seat's dropdown, presses Assign, and that person
//   is in the seat, is told about it, and is gone from every other dropdown;
// * Unassign asks first and then frees the seat, leaving it reserved;
// * the member dropdown is `required`, so a browser stops an assign that names
//   nobody before it is sent, and the action refuses one that arrives anyway —
//   as it refuses one reaching for another delegation's seat — in the words the
//   spec quotes;
// * a member seated from one tab and then picked again in a second tab's stale
//   form is refused, and the head reads "{name} already has a seat.";
// * a head may take a seat themselves, and once every seat is full the notice
//   turns into "Every seat is assigned.";
// * a member of the delegation who is not its head is sent back to the
//   dashboard, where the progress card offers them no way in, while the head's
//   own card does — and the card's counts and the header's counts agree;
// * somebody in no delegation at all gets a 404;
// * a delegation with nothing allocated sees the empty state, and one with more
//   members than seats sees the list of them and the warning;
// * once the conference's first day has arrived both actions refuse;
// * the page neither spills off a phone screen nor runs on for screens on a
//   desktop, and a head can seat and free somebody on a 390px screen with no
//   JavaScript at all.
//
// WHERE THE SELECTORS CAME FROM
// Every sentence asserted below is quoted from `seats.md` or written out in
// `src/lib/delegations.ts`, which is where the page gets them from. The words
// that only the markup knows — what the dropdown is labelled, what the two
// buttons say, what the card over the leftover members is headed — are the
// constants under "The words on the controls", gathered in one place so that
// they are corrected once rather than in a dozen assertions.
//
// The page draws one Assign form per seat, each holding a `<select>` whose
// `name` carries that seat's id (`memberFieldName` in `src/lib/delegations.ts`),
// so `getByLabel('Member')` finds every seat's dropdown at once. `assignForm`
// below finds the one form that belongs to a seat, and every assertion about a
// seat's controls goes through it.
//
// WHY THE CONFERENCES ARE ARCHIVED AND DATED 2099
// A head may only seat people until the conference's `start_date`:
// `check_seat_allocation` refuses them from that day, and
// `canChangeDelegationSeats` puts the controls away. So a conference whose
// assign really has to work cannot be dated in the past the way the fixtures in
// `tests/e2e/delegations.spec.ts` are. A *published* conference in 2099 would
// then sit in `/conferences` until the next `pnpm db:reset` and break the counts
// `tests/e2e/conferences.spec.ts` makes there. Archiving it is the way out, and
// it is `tests/db/allocation.test.ts`'s: the directory lists published
// conferences only, `conference_is_published` is true for an archived
// conference as well as for a published one, so every seat policy still
// answers the way it does in real life, and nothing on this page asks whether
// the conference is published. The one test about a conference that has already
// started dates its own fixture in 2020 instead, and archives it too.
//
// EVERY BUTTON WITHOUT JAVASCRIPT
// Assign is a real submit button in a real `<form method="post">` and the
// dropdown is a native `<select>`; Unassign is a `ConfirmButton`, which opens a
// confirmation page asking the same question when there is no script to open a
// dialog with, and `pressAndConfirm` below waits to see which of the two
// happened. So every test here passes on the `desktop-no-js` project as well as
// on `desktop` and `phone`. The last criterion of `seats.md` asks for scripting
// off *and* a 390px screen at once, which no single project gives, so the block
// at the very bottom of this file asks for both together. The two tests that
// measure the window each run on one project alone.
//
// WHAT THESE TESTS LEAVE BEHIND
// Every conference made here is made by `createTestConference` and taken away
// again in a `finally`, which takes its committees, its seats, its delegations,
// their members and the notifications' conferences with it. Nothing from
// `supabase/seed.sql` is written to. The accounts stay until the next
// `pnpm db:reset`, as they do everywhere else.
//
// `createTestConference`, `giveDelegation`, `joinTheDelegation`,
// `reserveSeats`, `postFormAction` and `pressAndConfirm` below are copies of
// the ones in `tests/e2e/delegations.spec.ts`, which declares none of them
// `export`. They are copies for the reason that file gives about its own: each
// file wants its own conference and its own fields, and these want future dates,
// committee abbreviations and the seat ids the forms are addressed by.

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
 * The days a conference made here runs on: far enough ahead that a head is
 * never late, whenever the suite is run. See the note at the top of the file.
 */
const CONFERENCE_FIRST_DAY = '2099-01-01';
const CONFERENCE_LAST_DAY = '2099-01-03';

/**
 * The first day as the page writes it, which is
 * `formatDateRange(startDate, startDate)` from `$lib/dates`.
 */
const CONFERENCE_FIRST_DAY_LABEL = '1 Jan 2099';

/** The days a conference that has already started ran on, for the locked test. */
const STARTED_CONFERENCE_FIRST_DAY = '2020-05-03';
const STARTED_CONFERENCE_LAST_DAY = '2020-05-05';

/**
 * A day and three months in milliseconds, for a window that is open right now.
 *
 * The window is open because a delegation is registered against one in real
 * life; nothing on this page reads it.
 */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const THREE_MONTHS_MS = 90 * ONE_DAY_MS;

/**
 * How many windows tall the seats page may be on a desktop.
 *
 * Three, as the delegation dashboard, the allocation grid and every other page
 * in this repository are held to. It is a ceiling and not a target: at three it
 * still catches a page drawn half again as big, which is what
 * `tests/e2e/page-shape.ts` exists to notice.
 */
const PAGE_SCREENS = 3;

/** The experience level `createTestUser` gives an account, as `$lib/status.ts` words it. */
const MEMBER_LEVEL = 'Intermediate';

/** The level every committee here is given, worded the same way. It is the committee's badge. */
const COMMITTEE_LEVEL = 'advanced';
const COMMITTEE_LEVEL_BADGE = 'Advanced';

// -----------------------------------------------------------------------------
// The words on the controls
// -----------------------------------------------------------------------------
// `seats.md` fixes every flash, every refusal and every empty state, but not
// what the controls themselves say. These four are gathered here so that
// whoever owns the markup has one place to correct rather than a dozen
// assertions to hunt through.

/** The label over the member dropdown of one seat. */
const MEMBER_FIELD_LABEL = 'Member';

/** What that dropdown starts on: an option standing for nobody, which the browser refuses. */
const MEMBER_PLACEHOLDER_OPTION = 'Choose member';

/** The submit button beside it. */
const ASSIGN_BUTTON_LABEL = 'Assign';

/** The `ConfirmButton` that takes somebody out of a seat. */
const UNASSIGN_BUTTON_LABEL = 'Unassign';

/** The card under the committees listing everybody still waiting for a seat. */
const UNSEATED_CARD_HEADING = 'Members without a seat';

/** The way in from the dashboard's progress card, as `05-pages/delegation/dashboard.md` draws it. */
const ASSIGN_MEMBERS_LINK_LABEL = 'Assign members →';

/** A name nothing else in the database will match. */
function unusedName(prefix: string): string {
	return `${prefix} ${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * A join code for a delegation this file writes straight into the table.
 *
 * `create_delegation` mints one of its own, and
 * `tests/e2e/delegations.spec.ts` is where that is proved. Here the row is
 * written with the service-role client, which walks past the function
 * altogether, so the code has to come from somewhere — and it is made of the
 * same characters, none of which is a 0, O, 1 or I.
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
 * The `name` the member dropdown of one seat is sent under.
 *
 * A copy of `memberFieldName` in `src/lib/delegations.ts`, which is where the
 * page and its action both get it from. Every seat has a dropdown of its own, so
 * the seat's id is part of the name.
 */
function memberFieldName(seatId: string): string {
	return `userId-${seatId}`;
}

/** What a test wants one of its committees to be. */
type CommitteeSeed = {
	name: string;
	/** Drawn as the card's heading instead of the name when there is one. */
	abbreviation?: string;
};

/** One committee a test has arranged, as the tests below name it. */
type TestCommittee = {
	id: string;
	name: string;
	slug: string;
};

/** What a test wants its conference to be. Everything else is filled in. */
type ConferenceSeed = {
	committees?: CommitteeSeed[];
	/**
	 * Dated in 2020 rather than in 2099, so that the head is too late to move
	 * anybody. Only the "seats are locked" test asks for it.
	 */
	hasStarted?: boolean;
};

/** A conference a test has to itself, with everything a delegation needs. */
type TestConference = {
	id: string;
	slug: string;
	name: string;
	/** The committees, in the order `committees` asked for them. */
	committees: TestCommittee[];
};

/**
 * Make an archived conference that takes delegations, with its committees, and
 * answer everything a test needs to find it again.
 *
 * Everything is written with the service-role client, the way
 * `tests/e2e/delegations.spec.ts` writes its own: `conferences` has no insert
 * policy that would let a test account make one inside somebody else's
 * organisation. Why it is archived, and why it happens in 2099, is the note at
 * the top of this file.
 */
async function createTestConference(seed: ConferenceSeed = {}): Promise<TestConference> {
	const admin = createServiceRoleClient();
	const name = unusedName('Delegation Seats Test MUN');
	const slug = `e2e-delegation-seats-${crypto.randomUUID()}`;
	const now = Date.now();

	const { data: conference, error } = await admin
		.from('conferences')
		.insert({
			name,
			slug,
			city: 'Delft',
			country_code: 'NL',
			timezone: 'Europe/Amsterdam',
			start_date: seed.hasStarted ? STARTED_CONFERENCE_FIRST_DAY : CONFERENCE_FIRST_DAY,
			end_date: seed.hasStarted ? STARTED_CONFERENCE_LAST_DAY : CONFERENCE_LAST_DAY,
			status: 'archived',
			applications_open_at: new Date(now - ONE_DAY_MS).toISOString(),
			applications_close_at: new Date(now + THREE_MONTHS_MS).toISOString(),
			accepts_delegations: true,
			organization_id: SAMPLE_ORGANIZATION_ID
		})
		.select('id')
		.single();

	if (error || !conference) {
		throw new Error(`Could not create the test conference: ${error?.message}`);
	}

	const committees = await addCommittees(conference.id, seed.committees ?? []);

	return { id: conference.id, slug, name, committees };
}

/** The committees of one test conference, in the order they were asked for. */
async function addCommittees(
	conferenceId: string,
	seeds: CommitteeSeed[]
): Promise<TestCommittee[]> {
	if (seeds.length === 0) {
		return [];
	}

	const admin = createServiceRoleClient();

	const rows = seeds.map((seed, index) => ({
		conference_id: conferenceId,
		name: seed.name,
		abbreviation: seed.abbreviation ?? null,
		slug: `committee-${crypto.randomUUID().slice(0, 8)}`,
		level: COMMITTEE_LEVEL,
		topics: [],
		position: index
	}));

	const { data, error } = await admin
		.from('committees')
		.insert(rows)
		.select('id, name, slug, position');

	if (error || !data) {
		throw new Error(`Could not create the test committees: ${error?.message}`);
	}

	// Supabase answers an insert in whatever order it likes, so the rows are put
	// back into the order they were asked for before they are handed out.
	return [...data]
		.sort((one, other) => one.position - other.position)
		.map((row) => ({ id: row.id, name: row.name, slug: row.slug }));
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
};

/** One delegation a test has arranged, as the tests below name it. */
type TestDelegation = {
	id: string;
	name: string;
	/** The `/delegations/<id>` dashboard, which a member is sent back to. */
	path: string;
	/** The `/delegations/<id>/seats` page this file is about. */
	seatsPath: string;
};

/**
 * Give a test account a delegation it is the head of, as the database would hold
 * it, and answer what the tests need to find it again.
 *
 * The service-role client writes both rows, the way `giveDelegation` in
 * `tests/e2e/delegations.spec.ts` does and for the same reason:
 * `guard_delegation_insert` only runs for the two roles a browser uses, so the
 * service role walks straight past it, which is the one reason a seeded
 * `accepted` row is possible at all. `check_one_route_per_conference` still
 * fires, for everybody, so the account given a delegation here must have no
 * application and no other delegation at the same conference.
 */
async function giveDelegation(head: TestUser, seed: DelegationSeed): Promise<TestDelegation> {
	const admin = createServiceRoleClient();
	const name = seed.name ?? unusedName('Lycee Francais Delegation');
	const status = seed.status ?? 'accepted';
	const now = new Date().toISOString();

	// A draft has not been sent yet; every other status has. The two the
	// organisers choose also carry the moment they chose, because a delegation
	// that is decided and has no `decided_at` is a row the app could never write.
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
			requested_seats: 12,
			note: 'We would like to sit together if we can.',
			join_code: unusedJoinCode(),
			submitted_at: isSent ? now : null,
			decided_at: isDecided ? now : null
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

	return {
		id: data.id,
		name,
		path: `/delegations/${data.id}`,
		seatsPath: `/delegations/${data.id}/seats`
	};
}

/**
 * Put somebody in a delegation somebody else runs, as `join_delegation` would.
 *
 * Joining through the real page is `tests/e2e/join-delegation.spec.ts`'s
 * subject; here a member is only ever somebody for the head to seat.
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

/** One seat a test wants reserved: the name in the row, and the flag beside it. */
type SeatSeed = {
	name: string;
	countryCode: string;
};

/**
 * Reserve seats in a committee for a delegation, and optionally sit one member
 * in one of them.
 *
 * Allocation is T27's `allocate_delegation_seats`, so the service-role client
 * writes the rows the way an organiser's page does. The head's own branch of
 * `check_seat_allocation` — the one that refuses a head once the conference has
 * started — does not run for the service role, which is why a seat can be
 * seeded as filled even on a conference dated 2020.
 *
 * It answers the id of each seat by name, because every form on the page under
 * test is addressed by a seat id.
 */
async function reserveSeats(
	committeeId: string,
	delegationId: string,
	seats: SeatSeed[],
	sitIn?: { user: TestUser; seatName: string }
): Promise<Record<string, string>> {
	const admin = createServiceRoleClient();

	const rows = seats.map((seat, index) => ({
		committee_id: committeeId,
		name: seat.name,
		country_code: seat.countryCode,
		position: index,
		delegation_id: delegationId,
		user_id: sitIn && sitIn.seatName === seat.name ? sitIn.user.id : null,
		allocated_at: new Date().toISOString()
	}));

	const { data, error } = await admin.from('seats').insert(rows).select('id, name');

	if (error || !data) {
		throw new Error(`Could not reserve the test seats: ${error?.message}`);
	}

	const idsByName: Record<string, string> = {};

	for (const row of data) {
		idsByName[row.name] = row.id;
	}

	return idsByName;
}

/** One `seats` row, as the tests below read it back. */
type SeatRow = {
	user_id: string | null;
	delegation_id: string | null;
};

/** One seat, read straight from the table with the service-role client. */
async function readSeat(seatId: string): Promise<SeatRow> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('seats')
		.select('user_id, delegation_id')
		.eq('id', seatId)
		.maybeSingle();

	if (error || !data) {
		throw new Error(`Could not read the test seat: ${error?.message}`);
	}

	return data;
}

/**
 * Where every notification this account has been sent points.
 *
 * `seats.md` asks for the assigned member to be told, and the
 * `notify_delegation_seat_assigned` trigger is what does it. Nothing on the
 * page under test shows that, so it is read from the table: the trigger runs
 * inside the same statement the head's press made, so the row is there by the
 * time the page has been drawn again.
 */
async function readNotificationLinks(userId: string): Promise<string[]> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('notifications')
		.select('link_path')
		.eq('user_id', userId);

	if (error || !data) {
		throw new Error(`Could not read the test notifications: ${error?.message}`);
	}

	return data.map((row) => String(row.link_path));
}

/**
 * Post to one of a page's form actions the way a browser posts a form.
 *
 * A copy of the one in `tests/e2e/delegations.spec.ts`, and the same two headers
 * are written by hand for the same two reasons. `origin`, because SvelteKit
 * refuses a form post that looks as though it came from another website and
 * Playwright's request does not send that header itself. And
 * `accept: text/html`, because that is how SvelteKit tells a form post from a
 * page with no JavaScript from one made by `use:enhance`: with it the page is
 * drawn again carrying whatever the action decided, which is what a browser
 * with no script really receives. The request follows the redirect an action
 * makes, and it carries the browser's cookies, so the flash the action left
 * behind is in the text that comes back.
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
 * A copy of the one in `tests/e2e/delegations.spec.ts`. With JavaScript the
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
 * The Assign form of one seat: the dropdown and the button that seat it.
 *
 * The page draws one per empty seat, and every one of them is labelled
 * "Member", so a seat's controls cannot be found by that label alone. The
 * `<select>` carries the seat's id in its `name` — `memberFieldName` above says
 * why — which makes it the one thing on the page that tells the forms apart.
 * A filled seat has no such form at all, which is how the tests below say "the
 * dropdown is gone".
 */
function assignForm(page: Page, seatId: string): Locator {
	return page.getByRole('main').locator(`form:has(select[name="${memberFieldName(seatId)}"])`);
}

/** The member dropdown of one seat. */
function memberDropdown(page: Page, seatId: string): Locator {
	return assignForm(page, seatId).getByLabel(MEMBER_FIELD_LABEL);
}

/** What one seat's dropdown offers, in the order it offers it. */
async function memberOptions(page: Page, seatId: string): Promise<string[]> {
	return memberDropdown(page, seatId).locator('option').allTextContents();
}

/** The line one member reads as in a dropdown: "Sara Khan · Intermediate". */
function memberOptionLabel(member: TestUser): string {
	return `${member.fullName} · ${MEMBER_LEVEL}`;
}

/** The same line for the head reading their own name: "Amelie Dubois (you) · Intermediate". */
function myOwnOptionLabel(me: TestUser): string {
	return `${me.fullName} (you) · ${MEMBER_LEVEL}`;
}

/**
 * Open one delegation's seats page and wait until it has really arrived.
 *
 * The heading is what says the page is there rather than the address, because
 * the address is right the moment the browser asks for it and the page arrives
 * afterwards. "Seats" is what `seats.md` puts in the `PageHeader`.
 */
async function openTheSeatsPage(page: Page, delegation: TestDelegation): Promise<void> {
	await page.goto(delegation.seatsPath);

	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Seats', {
		timeout: DATABASE_TIMEOUT_MS
	});
}

/** Open one delegation's dashboard and wait until it has really arrived. */
async function openTheDashboard(page: Page, delegation: TestDelegation): Promise<void> {
	await page.goto(delegation.path);

	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
		delegation.name,
		{ timeout: DATABASE_TIMEOUT_MS }
	);
}

/**
 * The three numbers on the dashboard's Progress card, as "Allocated" → "1".
 *
 * `KeyValueList` draws them as a `<dl>` whose `<dt>` names and `<dd>` values
 * come out in step with one another, so reading the two lists and pairing them
 * off by position gives the card's facts by name. It is what lets the test
 * below hold the dashboard's counts up against the seats page's header, which
 * `seats.md` asks for in so many words.
 */
async function dashboardProgressFacts(page: Page): Promise<Record<string, string>> {
	const card = page.getByRole('main').locator('dl').filter({ hasText: 'Allocated' });

	// One list, or the pairing below would be reading two cards at once. It is
	// also what waits for the dashboard's own data to arrive.
	await expect(card).toHaveCount(1, { timeout: DATABASE_TIMEOUT_MS });

	const names = await card.locator('dt').allTextContents();
	const values = await card.locator('dd').allTextContents();
	const facts: Record<string, string> = {};

	for (let index = 0; index < names.length; index += 1) {
		facts[names[index]] = values[index];
	}

	return facts;
}

/** What the two tests that measure the page have in front of them. */
type FullSeatsPage = {
	conference: TestConference;
	delegation: TestDelegation;
};

/**
 * A seats page with a few committees, a few seats and a few people on it: two
 * committees holding three seats between them, one of them filled, and two
 * members still waiting.
 *
 * The two tests below measure the page rather than read it, and measuring an
 * empty one would measure nothing.
 */
async function seedTheFullSeatsPage(page: Page): Promise<FullSeatsPage> {
	const conference = await createTestConference({
		committees: [
			{ name: 'Security Council', abbreviation: 'UNSC' },
			{ name: 'Economic and Financial Committee', abbreviation: 'ECOFIN' },
			{ name: 'Human Rights Council' }
		]
	});

	const head = await createTestUser('Amelie Dubois');
	const seatedMember = await createTestUser('Luis Ortega');
	const waitingMember = await createTestUser('Sara Khan');
	const delegation = await giveDelegation(head, { conferenceId: conference.id });

	await joinTheDelegation(seatedMember, delegation.id);
	await joinTheDelegation(waitingMember, delegation.id);

	await reserveSeats(
		conference.committees[0].id,
		delegation.id,
		[
			{ name: 'France', countryCode: 'FR' },
			{ name: 'United Kingdom', countryCode: 'GB' }
		],
		{ user: seatedMember, seatName: 'France' }
	);
	await reserveSeats(conference.committees[1].id, delegation.id, [
		{ name: 'Brazil', countryCode: 'BR' },
		{ name: 'Japan', countryCode: 'JP' }
	]);
	await reserveSeats(conference.committees[2].id, delegation.id, [
		{ name: 'Senegal', countryCode: 'SN' }
	]);

	await signIn(page, head);
	await openTheSeatsPage(page, delegation);

	return { conference, delegation };
}

/*
	Every test here makes a conference, signs one or more brand-new accounts in
	and then reads a page that asks the database several questions. That is more
	than most browser tests do, and thirty seconds — what Playwright allows a test
	by default — is not always enough for it while the whole suite is asking the
	one local database at once. `test.slow()` triples that allowance. It is an
	allowance and not a wait: a test that is quick still finishes as quickly as it
	can.
*/
test.beforeEach(() => {
	test.slow();
});

test('counts the seats, names the deadline, and seats a member in one press', async ({ page }) => {
	const conference = await createTestConference({
		committees: [
			{ name: 'Security Council', abbreviation: 'UNSC' },
			{ name: 'Economic and Financial Committee', abbreviation: 'ECOFIN' },
			{ name: 'Human Rights Council' }
		]
	});

	try {
		const head = await createTestUser('Amelie Dubois');
		const member = await createTestUser('Sara Khan');
		const delegation = await giveDelegation(head, { conferenceId: conference.id });

		await joinTheDelegation(member, delegation.id);

		// Four seats in three committees, none of them filled, and two people in the
		// delegation: the head counts as one of them.
		await reserveSeats(conference.committees[0].id, delegation.id, [
			{ name: 'France', countryCode: 'FR' },
			{ name: 'United Kingdom', countryCode: 'GB' }
		]);
		const financeSeats = await reserveSeats(conference.committees[1].id, delegation.id, [
			{ name: 'Brazil', countryCode: 'BR' }
		]);
		// The third committee has no abbreviation, which is how its heading below
		// proves the page falls back to the full name.
		await reserveSeats(conference.committees[2].id, delegation.id, [
			{ name: 'Senegal', countryCode: 'SN' }
		]);

		await signIn(page, head);
		await openTheSeatsPage(page, delegation);

		const main = page.getByRole('main');

		// The line under the title counts the same three things the dashboard's
		// progress card counts, so that a head can compare them at a glance.
		await expect(main.getByText('4 allocated · 0 assigned · 2 members unseated')).toBeVisible();
		await expect(
			main.getByText(`Assign every seat before ${CONFERENCE_FIRST_DAY_LABEL}.`)
		).toBeVisible();

		// One card per committee, headed by the abbreviation where there is one and
		// by the name where there is not, with the committee's level beside it.
		await expect(main.getByText('UNSC', { exact: true })).toBeVisible();
		await expect(main.getByText('ECOFIN', { exact: true })).toBeVisible();
		await expect(main.getByText('Human Rights Council', { exact: true })).toBeVisible();
		await expect(main.getByText(COMMITTEE_LEVEL_BADGE, { exact: true }).first()).toBeVisible();

		// `Flag` renders an `<img>` whose alt text is the country's name, so the
		// flag is asked for as an image and not as text: the seat is called "France"
		// as well, and only the picture can tell the two apart.
		await expect(main.getByRole('img', { name: 'France' })).toBeVisible();

		const brazil = financeSeats['Brazil'];

		// The dropdown offers both people, each with their experience level, and
		// says which of them the reader is.
		expect(await memberOptions(page, brazil)).toContain(memberOptionLabel(member));
		expect(await memberOptions(page, brazil)).toContain(myOwnOptionLabel(head));

		await memberDropdown(page, brazil).selectOption({ label: memberOptionLabel(member) });
		await assignForm(page, brazil)
			.getByRole('button', { name: ASSIGN_BUTTON_LABEL })
			.press('Enter');

		// The flash names the committee the way its card is headed, by the
		// abbreviation: "in ECOFIN", not "in Economic and Financial Committee".
		await expect(page.getByText('Sara Khan now represents Brazil in ECOFIN.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		// The counts move with the seat, the row has no dropdown left, and the
		// person sitting there is drawn in it.
		await expect(main.getByText('4 allocated · 1 assigned · 1 member unseated')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(assignForm(page, brazil)).toHaveCount(0);
		await expect(main.getByText(member.fullName, { exact: true }).first()).toBeVisible();

		// And the row itself, because a name on a page is not a seat.
		expect((await readSeat(brazil)).user_id).toBe(member.id);

		// `notify_delegation_seat_assigned` tells the member, and the link goes to
		// the committee they are now in.
		expect(await readNotificationLinks(member.id)).toContain(
			`/conferences/${conference.slug}/committees/${conference.committees[1].slug}`
		);
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('frees the seat again when the head unassigns', async ({ page }) => {
	const conference = await createTestConference({
		committees: [{ name: 'Security Council' }]
	});

	try {
		const head = await createTestUser('Amelie Dubois');
		const member = await createTestUser('Sara Khan');
		const delegation = await giveDelegation(head, { conferenceId: conference.id });

		await joinTheDelegation(member, delegation.id);

		// One seat filled and one free, so there is exactly one Unassign button on
		// the page for `pressAndConfirm` to find.
		const seats = await reserveSeats(
			conference.committees[0].id,
			delegation.id,
			[
				{ name: 'France', countryCode: 'FR' },
				{ name: 'Belgium', countryCode: 'BE' }
			],
			{ user: member, seatName: 'France' }
		);

		await signIn(page, head);
		await openTheSeatsPage(page, delegation);

		const main = page.getByRole('main');

		// Somebody who already has a seat is not offered for another one, which is
		// the whole of "the select offers only unseated members".
		const beforeFreeing = await memberOptions(page, seats['Belgium']);

		expect(beforeFreeing).not.toContain(memberOptionLabel(member));
		expect(beforeFreeing).toContain(myOwnOptionLabel(head));

		await pressAndConfirm(page, UNASSIGN_BUTTON_LABEL);

		await expect(page.getByText('Seat freed.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

		// The row offers the dropdown again, and the freed member is back in it.
		await expect(memberDropdown(page, seats['France'])).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		expect(await memberOptions(page, seats['France'])).toContain(memberOptionLabel(member));

		// The seat is empty but still this delegation's: only the person left it.
		const freed = await readSeat(seats['France']);

		expect(freed.user_id).toBeNull();
		expect(freed.delegation_id).toBe(delegation.id);

		await expect(main.getByText('2 allocated · 0 assigned · 2 members unseated')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
	} finally {
		await deleteTestConference(conference.id);
	}
});

// T142: with JavaScript the seat fills the moment "Assign" is pressed, before
// the server has answered and with no spinner, and a press the server refuses
// goes back and says what did not happen.
test('fills a seat at once, and puts a refused unassign back', async ({ page }, testInfo) => {
	skipWithoutJavaScript(testInfo);
	const conference = await createTestConference({
		committees: [{ name: 'Security Council' }]
	});

	try {
		const head = await createTestUser('Amelie Dubois');
		const member = await createTestUser('Sara Khan');
		const delegation = await giveDelegation(head, { conferenceId: conference.id });

		await joinTheDelegation(member, delegation.id);

		const seats = await reserveSeats(conference.committees[0].id, delegation.id, [
			{ name: 'France', countryCode: 'FR' },
			{ name: 'Belgium', countryCode: 'BE' }
		]);

		await signIn(page, head);
		await openTheSeatsPage(page, delegation);
		await answerSlowly(page, 'assign');
		await watchForSpinners(page);

		const main = page.getByRole('main');

		await memberDropdown(page, seats['Belgium']).selectOption({
			label: memberOptionLabel(member)
		});
		await assignForm(page, seats['Belgium'])
			.getByRole('button', { name: ASSIGN_BUTTON_LABEL })
			.click();

		// The seat, the counts and the list of people without a seat all move at once.
		await expect(assignForm(page, seats['Belgium'])).toHaveCount(0, {
			timeout: AT_ONCE_TIMEOUT_MS
		});
		await expect(main.getByText('2 allocated · 1 assigned · 1 member unseated')).toBeVisible({
			timeout: AT_ONCE_TIMEOUT_MS
		});

		await waitUntilAnswered(page);
		expect(await sawSpinner(page)).toBe(false);
		expect((await readSeat(seats['Belgium'])).user_id).toBe(member.id);

		await answerWithError(page, 'unassign');
		await pressAndConfirm(page, UNASSIGN_BUTTON_LABEL);

		await expect(page.getByRole('alert')).toContainText('The seat was not emptied.', {
			timeout: DATABASE_TIMEOUT_MS
		});
		await waitUntilAnswered(page);
		await expect(main.getByText('2 allocated · 1 assigned · 1 member unseated')).toBeVisible();
		expect((await readSeat(seats['Belgium'])).user_id).toBe(member.id);
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('asks the browser for a member, and refuses in words when one arrives anyway', async ({
	page
}) => {
	const conference = await createTestConference({
		committees: [{ name: 'Security Council' }]
	});

	try {
		const head = await createTestUser('Amelie Dubois');
		const member = await createTestUser('Sara Khan');
		const delegation = await giveDelegation(head, { conferenceId: conference.id });

		await joinTheDelegation(member, delegation.id);

		const seats = await reserveSeats(conference.committees[0].id, delegation.id, [
			{ name: 'France', countryCode: 'FR' }
		]);

		await signIn(page, head);
		await openTheSeatsPage(page, delegation);

		const france = seats['France'];

		/*
			The first half of the guard is the browser's own. The dropdown starts on a
			placeholder that stands for nobody and is marked `required`, so a head who
			presses Assign without choosing is stopped by the browser before anything
			is sent — and that is HTML's own validation, not JavaScript, so it stops
			them on a page with no script just the same. This is why no test here
			presses the button with the placeholder still selected: there would be
			nothing to watch for.
		*/
		expect(await memberOptions(page, france)).toContain(MEMBER_PLACEHOLDER_OPTION);
		await expect(memberDropdown(page, france)).toHaveAttribute('required', '');

		/*
			The second half is the server's, and it is the one that matters, because a
			post can always arrive without a member in it: from a browser whose
			validation was turned off, from a form that was edited, or from anything
			that is not a browser. So the action is asked directly, with a body
			carrying the seat and nothing else, which is what such a post looks like.
			`postFormAction` follows the redirect the refusal makes, so the flash it
			left behind is in the page that comes back.
		*/
		const refused = await postFormAction(page, `${delegation.seatsPath}?/assign`, {
			seatId: france
		});

		expect(await refused.text()).toContain('Pick a member.');
		expect((await readSeat(france)).user_id).toBeNull();
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('tells the head a member already has a seat when a second form tries to seat them', async ({
	page
}) => {
	const conference = await createTestConference({
		committees: [{ name: 'Security Council', abbreviation: 'UNSC' }]
	});

	try {
		const head = await createTestUser('Amelie Dubois');
		const member = await createTestUser('Sara Khan');
		const delegation = await giveDelegation(head, { conferenceId: conference.id });

		await joinTheDelegation(member, delegation.id);

		const seats = await reserveSeats(conference.committees[0].id, delegation.id, [
			{ name: 'France', countryCode: 'FR' },
			{ name: 'Belgium', countryCode: 'BE' }
		]);

		await signIn(page, head);

		/*
			The dropdowns offer only unseated members, so on one fresh page a head can
			never pick somebody who is already seated. Two tabs of the same page can:
			both are drawn while Sara Khan is still free, so both offer her. A second
			tab from the same browser context shares the head's cookies, so it is the
			same head signed in twice, which is exactly how this happens for real.
		*/
		const secondTab = await page.context().newPage();

		await openTheSeatsPage(page, delegation);
		await openTheSeatsPage(secondTab, delegation);

		// The first tab seats her in France through the real form.
		await memberDropdown(page, seats['France']).selectOption({
			label: memberOptionLabel(member)
		});
		await assignForm(page, seats['France'])
			.getByRole('button', { name: ASSIGN_BUTTON_LABEL })
			.press('Enter');

		await expect(page.getByText('Sara Khan now represents France in UNSC.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		/*
			The second tab still shows the page from before, so its Belgium dropdown
			still offers her. Pressing Assign there is refused by
			`check_seat_allocation` in the database, and the sentence it raises has to
			come all the way back to the head as the flash: this is the one place the
			refusal, its mapping in the action and its wording are joined up.
		*/
		await memberDropdown(secondTab, seats['Belgium']).selectOption({
			label: memberOptionLabel(member)
		});
		await assignForm(secondTab, seats['Belgium'])
			.getByRole('button', { name: ASSIGN_BUTTON_LABEL })
			.press('Enter');

		await expect(secondTab.getByText('Sara Khan already has a seat.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		// She is still in France, and Belgium is still empty.
		expect((await readSeat(seats['France'])).user_id).toBe(member.id);
		expect((await readSeat(seats['Belgium'])).user_id).toBeNull();

		await secondTab.close();
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('sends a member back to the dashboard, and counts the same seats on both pages', async ({
	page
}) => {
	const conference = await createTestConference({
		committees: [{ name: 'Security Council' }]
	});

	try {
		const head = await createTestUser('Amelie Dubois');
		const member = await createTestUser('Sara Khan');
		const delegation = await giveDelegation(head, { conferenceId: conference.id });

		await joinTheDelegation(member, delegation.id);
		await reserveSeats(conference.committees[0].id, delegation.id, [
			{ name: 'France', countryCode: 'FR' }
		]);

		await signIn(page, member);
		await page.goto(delegation.seatsPath);

		// Seating people is the head's job, so the page is never drawn for anybody
		// else: they land back on the dashboard with the reason.
		await expect(page).toHaveURL(delegation.path, { timeout: DATABASE_TIMEOUT_MS });
		await expect(page.getByText('Only heads assign seats.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		// And the progress card offers them no way in either, because it would only
		// send them here again.
		await expect(
			page.getByRole('main').getByRole('link', { name: ASSIGN_MEMBERS_LINK_LABEL })
		).toHaveCount(0);

		// Clearing the cookies is what ends the first session; without it `/login`
		// would send an account that is already signed in straight back to its home
		// page.
		await page.context().clearCookies();

		await signIn(page, head);
		await openTheDashboard(page, delegation);

		/*
			The dashboard's Progress card and the seats page's header count the same
			two things, and `seats.md` asks for them to agree. They do because both
			pages hand the layout's own numbers to `delegationProgress`, but a head
			reading one page after the other is the only witness that matters, so the
			test reads them one after the other too: one seat reserved, nobody in it.
		*/
		const facts = await dashboardProgressFacts(page);

		expect(facts['Allocated']).toBe('1');
		expect(facts['Assigned']).toBe('0');

		// The head's own card has the link, and it really leads to the page.
		await page
			.getByRole('main')
			.getByRole('link', { name: ASSIGN_MEMBERS_LINK_LABEL })
			.click({ timeout: DATABASE_TIMEOUT_MS });

		await expect(page).toHaveURL(delegation.seatsPath, { timeout: DATABASE_TIMEOUT_MS });
		await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Seats', {
			timeout: DATABASE_TIMEOUT_MS
		});

		// The same two numbers again, in the header's words, with the head and the
		// member who are both still waiting for a seat.
		await expect(
			page.getByRole('main').getByText('1 allocated · 0 assigned · 2 members unseated')
		).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('is a 404 for somebody who is in no delegation', async ({ page }) => {
	const conference = await createTestConference({
		committees: [{ name: 'Security Council' }]
	});

	try {
		const head = await createTestUser('Amelie Dubois');
		const delegation = await giveDelegation(head, { conferenceId: conference.id });

		await reserveSeats(conference.committees[0].id, delegation.id, [
			{ name: 'France', countryCode: 'FR' }
		]);

		// Somebody else entirely, signed in and with an account of their own. They
		// are in no delegation, so the layout has nothing to show them and says so
		// with a 404 rather than with a 403, which is the rule for the whole app: an
		// answer must not tell anybody which delegations exist.
		const stranger = await createTestUser('Priya Nair');
		await signIn(page, stranger);

		const response = await page.goto(delegation.seatsPath);

		expect(response?.status()).toBe(404);
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('says so when the organisers have allocated nothing yet', async ({ page }) => {
	// One conference per delegation, because one account can only be in one
	// delegation per conference.
	const waiting = await createTestConference();
	const turnedDown = await createTestConference();

	try {
		const head = await createTestUser('Amelie Dubois');
		const underReview = await giveDelegation(head, {
			conferenceId: waiting.id,
			status: 'submitted'
		});
		const rejected = await giveDelegation(head, {
			conferenceId: turnedDown.id,
			status: 'rejected'
		});

		// Somebody has joined, so every member of the delegation is unseated. The
		// empty state is still the whole page: `seats.md` gives "No allocated
		// seats" one appearance of its own, and scopes the leftover-members card
		// and its warning to a delegation that has seats to be left over from.
		const member = await createTestUser('Tomas Nowak');
		await joinTheDelegation(member, underReview.id);

		await signIn(page, head);
		await openTheSeatsPage(page, underReview);

		const main = page.getByRole('main');

		await expect(main.getByText('No seats allocated yet.')).toBeVisible();
		await expect(
			main.getByText('The organisers allocate seats after accepting your request.')
		).toBeVisible();

		await expect(main.getByText(UNSEATED_CARD_HEADING)).toHaveCount(0);
		await expect(
			main.getByText('Ask the organisers for more seats, or remove members who will not attend.')
		).toHaveCount(0);
		await expect(main.getByText('Assign every seat before')).toHaveCount(0);

		// The same empty state tells a delegation that was turned down why nothing
		// is coming, and tells it nothing else.
		await openTheSeatsPage(page, rejected);

		await expect(main.getByText('No seats allocated yet.')).toBeVisible();
		await expect(main.getByText('Your request was not accepted.')).toBeVisible();
		await expect(main.getByText(UNSEATED_CARD_HEADING)).toHaveCount(0);
	} finally {
		await deleteTestConference(waiting.id);
		await deleteTestConference(turnedDown.id);
	}
});

test('lists the members with no seat, and asks for more when there are too many', async ({
	page
}) => {
	const conference = await createTestConference({
		committees: [{ name: 'Security Council' }]
	});

	try {
		const head = await createTestUser('Amelie Dubois');
		const firstMember = await createTestUser('Sara Khan');
		const secondMember = await createTestUser('Tomas Novak');
		const delegation = await giveDelegation(head, { conferenceId: conference.id });

		await joinTheDelegation(firstMember, delegation.id);
		await joinTheDelegation(secondMember, delegation.id);

		// Three people and one seat between them, which is what the warning is for.
		await reserveSeats(conference.committees[0].id, delegation.id, [
			{ name: 'France', countryCode: 'FR' }
		]);

		await signIn(page, head);
		await openTheSeatsPage(page, delegation);

		const main = page.getByRole('main');

		await expect(main.getByText('1 allocated · 0 assigned · 3 members unseated')).toBeVisible();
		await expect(main.getByText(UNSEATED_CARD_HEADING)).toBeVisible();
		await expect(
			main.getByText('Ask the organisers for more seats, or remove members who will not attend.')
		).toBeVisible();

		/*
			Each name on its own, matched exactly, because the dropdown holds the same
			people with their experience level after them: "Sara Khan · Intermediate"
			is not an exact match for "Sara Khan", so only the card is counted here.
		*/
		await expect(main.getByText(firstMember.fullName, { exact: true })).toBeVisible();
		await expect(main.getByText(secondMember.fullName, { exact: true })).toBeVisible();
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('refuses a seat that belongs to another delegation', async ({ page }) => {
	const conference = await createTestConference({
		committees: [{ name: 'Security Council' }]
	});

	try {
		const head = await createTestUser('Amelie Dubois');
		const member = await createTestUser('Sara Khan');
		// A head of their own group at the same conference, because one account may
		// only be in one delegation per conference.
		const otherHead = await createTestUser('Luis Ortega');

		const mine = await giveDelegation(head, { conferenceId: conference.id });
		const theirs = await giveDelegation(otherHead, {
			conferenceId: conference.id,
			name: unusedName('Colegio Nacional Delegation')
		});

		await joinTheDelegation(member, mine.id);

		const mySeats = await reserveSeats(conference.committees[0].id, mine.id, [
			{ name: 'France', countryCode: 'FR' }
		]);
		const theirSeats = await reserveSeats(conference.committees[0].id, theirs.id, [
			{ name: 'Brazil', countryCode: 'BR' }
		]);

		await signIn(page, head);
		await openTheSeatsPage(page, mine);

		const main = page.getByRole('main');

		// Only this delegation's seats are on the page at all.
		await expect(main.getByText('France').first()).toBeVisible();
		await expect(main.getByText('Brazil')).toHaveCount(0);

		/*
			So the refusal has to be asked of the action itself: the page draws no
			control for a seat it never showed, and the criterion is that a head cannot
			write `user_id` on another delegation's seat even when they ask for it by
			id.
		*/
		const refused = await postFormAction(page, `${mine.seatsPath}?/assign`, {
			seatId: theirSeats['Brazil'],
			[memberFieldName(theirSeats['Brazil'])]: member.id
		});

		expect(await refused.text()).toContain('That seat is not allocated to your delegation.');
		expect((await readSeat(theirSeats['Brazil'])).user_id).toBeNull();

		// And the head's own seat is untouched by the attempt.
		expect((await readSeat(mySeats['France'])).user_id).toBeNull();
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('lets the head take a seat themselves, and says so once every seat is full', async ({
	page
}) => {
	const conference = await createTestConference({
		committees: [{ name: 'Security Council', abbreviation: 'UNSC' }]
	});

	try {
		const head = await createTestUser('Amelie Dubois');
		const delegation = await giveDelegation(head, { conferenceId: conference.id });

		// One seat and one person: the head, who is a delegate as well as an
		// organiser of their own group.
		const seats = await reserveSeats(conference.committees[0].id, delegation.id, [
			{ name: 'France', countryCode: 'FR' }
		]);

		await signIn(page, head);
		await openTheSeatsPage(page, delegation);

		const main = page.getByRole('main');
		const france = seats['France'];

		await memberDropdown(page, france).selectOption({ label: myOwnOptionLabel(head) });
		await assignForm(page, france)
			.getByRole('button', { name: ASSIGN_BUTTON_LABEL })
			.press('Enter');

		await expect(page.getByText('Amelie Dubois now represents France in UNSC.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		expect((await readSeat(france)).user_id).toBe(head.id);

		// With nothing left to do, the notice says so instead of naming a deadline.
		await expect(main.getByText('Every seat is assigned.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(main.getByText('1 allocated · 1 assigned · 0 members unseated')).toBeVisible();
	} finally {
		await deleteTestConference(conference.id);
	}
});

// specs/05-pages/delegation/seats.md's "An empty seat with nobody to put in
// it" state, the branch where the head could still move somebody: two seats,
// one member, so once that member is seated the other seat has no candidate.
test('says nobody is left to seat once the delegation has fewer members than seats', async ({
	page
}) => {
	const conference = await createTestConference({
		committees: [{ name: 'Security Council', abbreviation: 'UNSC' }]
	});

	try {
		const head = await createTestUser('Amelie Dubois');
		const delegation = await giveDelegation(head, { conferenceId: conference.id });

		const seats = await reserveSeats(conference.committees[0].id, delegation.id, [
			{ name: 'France', countryCode: 'FR' },
			{ name: 'Belgium', countryCode: 'BE' }
		]);

		await signIn(page, head);
		await openTheSeatsPage(page, delegation);

		const france = seats['France'];

		await memberDropdown(page, france).selectOption({ label: myOwnOptionLabel(head) });
		await assignForm(page, france)
			.getByRole('button', { name: ASSIGN_BUTTON_LABEL })
			.press('Enter');

		await expect(page.getByText('Amelie Dubois now represents France in UNSC.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		// The head is the delegation's only member and now has a seat, so the
		// Belgium row, still empty, has nobody left to offer.
		const belgiumRow = page.getByRole('listitem').filter({ hasText: 'Belgium' });

		await expect(
			belgiumRow.getByText('Everybody in the delegation already has a seat.')
		).toBeVisible();
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('locks both actions once the conference has started', async ({ page }) => {
	// This one conference is dated in 2020, because the rule under test is that a
	// head is too late once the first day has arrived.
	const conference = await createTestConference({
		hasStarted: true,
		committees: [{ name: 'Security Council' }]
	});

	try {
		const head = await createTestUser('Amelie Dubois');
		const member = await createTestUser('Sara Khan');
		const delegation = await giveDelegation(head, { conferenceId: conference.id });

		await joinTheDelegation(member, delegation.id);

		const seats = await reserveSeats(
			conference.committees[0].id,
			delegation.id,
			[
				{ name: 'France', countryCode: 'FR' },
				{ name: 'Belgium', countryCode: 'BE' }
			],
			{ user: member, seatName: 'France' }
		);

		await signIn(page, head);
		await openTheSeatsPage(page, delegation);

		const locked = 'Seats are locked; contact the organisers.';

		await expect(page.getByRole('main').getByText(locked)).toBeVisible();

		// Both actions are asked directly, because the page has put its own controls
		// away and a control that was never drawn proves nothing about the action.
		const refusedAssign = await postFormAction(page, `${delegation.seatsPath}?/assign`, {
			seatId: seats['Belgium'],
			[memberFieldName(seats['Belgium'])]: head.id
		});

		expect(await refusedAssign.text()).toContain(locked);

		// `?/unassign&seat=…` is how the Unassign button names the seat, because
		// `ConfirmButton` carries its own form and a hidden field would leave a gap
		// over every row; `confirm=1` is what that button sends.
		const refusedUnassign = await postFormAction(
			page,
			`${delegation.seatsPath}?/unassign&seat=${seats['France']}`,
			{ confirm: '1' }
		);

		expect(await refusedUnassign.text()).toContain(locked);

		// Nothing moved either way.
		expect((await readSeat(seats['Belgium'])).user_id).toBeNull();
		expect((await readSeat(seats['France'])).user_id).toBe(member.id);
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('does not spill off the side of a phone screen', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	const { conference } = await seedTheFullSeatsPage(page);

	try {
		// The likeliest things to push a phone sideways are a seat row, which holds
		// a flag, a name, a dropdown and a button on one line, and the committee
		// headings above them.
		await expectNoSidewaysOverflow(page);
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('fits in a few screens on a desktop', async ({ page }, testInfo) => {
	test.skip(
		testInfo.project.name !== 'desktop',
		'One project measures the page, and the desktop window is the one the design is drawn for.'
	);

	const { conference } = await seedTheFullSeatsPage(page);

	try {
		// The picture is saved whether the measurement passes or fails, so that a
		// failure can be looked at rather than guessed at.
		await saveFullPageScreenshot(page, 'delegation-seats');
		await expectPageFitsInScreens(page, PAGE_SCREENS);
	} finally {
		await deleteTestConference(conference.id);
	}
});

/*
	The last criterion of `seats.md` asks for two things at once: no JavaScript
	**and** a 390px screen. Each of the three projects in `playwright.config.ts`
	gives one of them — `desktop-no-js` switches scripting off at desktop width,
	`phone` is 390px wide with scripting on — so the tests above, which run in
	all three, prove the two halves separately. This block puts them together.

	`test.use` changes one Playwright setting for the tests inside the block it
	is written in, and this is the only place in the suite that uses it. It is
	here rather than in `playwright.config.ts` because it is one page's
	criterion, not a fourth project that every other test would then have to run
	in as well.
*/
test.describe('on a 390px screen with no JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('seats a member and frees a seat with nothing but forms', async ({ page }, testInfo) => {
		test.skip(
			testInfo.project.name !== 'phone',
			'Only the phone project has a phone-sized window.'
		);

		// No abbreviation, so this is also where the flash is watched falling back
		// to the committee's full name.
		const conference = await createTestConference({
			committees: [{ name: 'Security Council' }]
		});

		try {
			const head = await createTestUser('Amelie Dubois');
			const member = await createTestUser('Sara Khan');
			const delegation = await giveDelegation(head, { conferenceId: conference.id });

			await joinTheDelegation(member, delegation.id);

			const seats = await reserveSeats(
				conference.committees[0].id,
				delegation.id,
				[
					{ name: 'France', countryCode: 'FR' },
					{ name: 'Belgium', countryCode: 'BE' }
				],
				{ user: member, seatName: 'France' }
			);

			await signIn(page, head);
			await openTheSeatsPage(page, delegation);

			// Assign is a real submit button in a real `<form method="post">`, and the
			// dropdown is a native `<select>`, so both work with nothing running.
			await memberDropdown(page, seats['Belgium']).selectOption({
				label: myOwnOptionLabel(head)
			});
			await assignForm(page, seats['Belgium'])
				.getByRole('button', { name: ASSIGN_BUTTON_LABEL })
				.press('Enter');

			await expect(
				page.getByText('Amelie Dubois now represents Belgium in Security Council.')
			).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
			expect((await readSeat(seats['Belgium'])).user_id).toBe(head.id);

			// `ConfirmButton` has no dialog to open without a script, so the press
			// opens the confirmation page instead. `pressAndConfirm` waits to see
			// which of the two happened, and here it is always the second.
			await pressAndConfirm(page, UNASSIGN_BUTTON_LABEL);

			await expect(page.getByText('Seat freed.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
			expect((await readSeat(seats['France'])).user_id).toBeNull();

			// And with two seats, a filled one and an empty one, nothing on the page
			// reaches past the side of the screen.
			await expectNoSidewaysOverflow(page);
		} finally {
			await deleteTestConference(conference.id);
		}
	});
});
