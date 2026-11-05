import { expect, test, type APIResponse, type Locator, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { markPage, readMarker, skipWithoutJavaScript } from './in-place';
import {
	expectNoSidewaysOverflow,
	expectPageFitsInScreens,
	saveFullPageScreenshot
} from './page-shape';
import { createTestUser, signIn, type TestUser } from './signed-in-user';
import { answerConfirmationPage } from './confirmation-page';
import { waitUntilAnswered } from './chair-room-fixtures';
import {
	AT_ONCE_TIMEOUT_MS,
	answerSlowly,
	answerWithError,
	sawSpinner,
	watchForSpinners
} from './instant';

// The acceptance criteria of `specs/05-pages/delegation/members.md` that need a
// real browser, for the page task T70 builds at
// `/delegations/[delegationId]/members` and the tab strip it puts in
// `src/routes/delegations/[delegationId]/+layout.svelte`:
//
// * the people in a delegation are listed heads first and then in the order they
//   joined, each with the day they joined, their experience level and school,
//   the seat they hold if they hold one, and the reader's own row marked "(you)";
// * Make head promotes a member and says so, and refuses a `userId` that is in
//   no delegation in the words the spec quotes;
// * the only head cannot step down, and once there are two heads the second one
//   can, which lands them on the dashboard and shuts both the strip and this
//   page behind them;
// * Remove asks first, refuses somebody who is sitting in a seat and refuses the
//   reader themselves, and takes an unseated member's row off the page;
// * a head reads a member's phone number and dietary requirements behind the
//   Details toggle, and reads "Not given" where that member left the box empty;
// * a member of the delegation who is not its head is sent back to the
//   dashboard, where their tab strip has no Members tab;
// * the invite card carries the join code while the delegation is open and is
//   replaced by a notice once the organisers have turned it down or the head has
//   withdrawn it;
// * a head's strip has Overview, Members, Seats and Papers on it (T147), and a
//   plain member's only Overview and Papers; the Members tab really
//   leads here, and the tab of the page being read is the one marked as current;
// * the page neither spills off the side of a phone screen nor runs on for
//   screens on a desktop.
//
// WHERE THE SELECTORS CAME FROM
// Every sentence asserted below is quoted from `members.md`. The words that only
// the markup knows — what the four buttons say, what the details toggle is
// called, what the invite card is headed — are the constants under "The words on
// the controls", gathered in one place so that they are corrected once rather
// than in a dozen assertions.
//
// Two of them are not really the markup's to choose: "Phone" and "Dietary
// requirements" are the two facts `permissions.md` gives a head, so they are
// constants here for the same reason, not because they are open to opinion.
//
// Nothing below looks for a brand "Delegation head" badge. `members.md` says a
// head is marked once and by the quiet line under their name, so a head's row
// starts that line with "Head" and carries no badge, which is what the wireframe in that
// same section draws and what every assertion below reads.
//
// The page draws one row per member, and the same three buttons on every row,
// so a button cannot be found by its words alone. `memberRow` below narrows
// everything to the one `<li>` with a given person's name in it, and every
// press and every badge below is asked of that row — the same narrowing
// `assignForm` in `tests/e2e/delegation-seats.spec.ts` does for one seat.
//
// WHY THE ACTIONS ARE SOMETIMES ASKED DIRECTLY
// Three of the refusals hide their own button: the page draws no Make head on
// somebody who is not there, no Remove on the reader's own row, and no Step down
// for a head who is the only one. A control that was never drawn proves only
// what the page did, and the criterion is that the action itself refuses, so
// those three go through `postFormAction`, which is what a post from a browser
// with no script looks like. The one refusal the page does draw a button for —
// removing somebody who is sitting in a seat — is pressed for real.
//
// WHAT IS NOT PROVED HERE
// `members.md` asks for the last head to be stopped "by both the action and the
// database". A browser can only reach the action, so the database's own
// `prevent_last_delegation_head_removal` is `tests/db`'s to prove; the same goes
// for "members cannot see each other's" private details, because a member never
// reaches this page at all — the redirect below is the whole of what a browser
// can see of that rule.
//
// EVERY BUTTON WITHOUT JAVASCRIPT
// Make head and Step down are real submit buttons in real `<form method="post">`
// forms, Remove is a `ConfirmButton`, which opens a confirmation page asking the
// same question when there is no script to open a dialog with, and the details
// toggle is a native `<details>`. So every test here passes on the
// `desktop-no-js` project as well
// as on `desktop` and `phone`. `pressAndConfirm` below waits to see whether a
// dialog opened, and checks the question it asks when one did. The two tests
// that measure the window each run on one project alone.
//
// WHAT THESE TESTS LEAVE BEHIND
// Every conference made here is made by `createTestConference` and taken away
// again in a `finally`, which takes its committees, its seats, its delegations
// and their members with it. Nothing from `supabase/seed.sql` is written to. The
// accounts stay until the next `pnpm db:reset`, as they do everywhere else, and
// so do the two private details written onto two of them.
//
// `createTestConference`, `giveDelegation`, `joinTheDelegation`, `reserveSeats`,
// `postFormAction` and `pressAndConfirm` below are copies of the ones in
// `tests/e2e/delegations.spec.ts` and `tests/e2e/delegation-seats.spec.ts`,
// which declare none of them `export`. They are copies for the reason those
// files give about their own: each file wants its own conference and its own
// fields, and these want a fixed join date, a committee abbreviation and a way
// to address one member's form.

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

/**
 * How many windows tall the members page may be on a desktop.
 *
 * Three, as the delegation dashboard, the seats page and every other page in
 * this repository are held to. It is a ceiling and not a target: at three it
 * still catches a page drawn half again as big, which is what
 * `tests/e2e/page-shape.ts` exists to notice.
 */
const PAGE_SCREENS = 3;

/** The organisation `supabase/seed.sql` makes, which the conferences below go in. */
const SAMPLE_ORGANIZATION_ID = '10000000-0000-4000-8000-000000000001';

/**
 * The days a conference made here runs on.
 *
 * Both are in the past, the way `tests/e2e/delegations.spec.ts` dates its own:
 * `/conferences` lists conferences that are published *and* have not finished,
 * and `tests/e2e/conferences.spec.ts` counts what is in that directory, so a
 * conference dated this way disturbs nothing there. Nothing on the page under
 * test asks when the conference happens — managing members is not one of the
 * jobs that stop once it has started, which is why these dates may be in the
 * past where the seats page's cannot be.
 */
const CONFERENCE_FIRST_DAY = '2020-05-03';
const CONFERENCE_LAST_DAY = '2020-05-05';

/**
 * The timezone every conference here is in, which is the one the join dates
 * below are written in.
 *
 * A join date is a `timestamptz`, and which day a moment falls on depends on
 * where it is read, so the page formats it in the conference's timezone.
 */
const CONFERENCE_TIMEZONE = 'Europe/Amsterdam';

/**
 * A day and three months in milliseconds, for a window that is open right now.
 *
 * The window is open because a delegation is registered against one in real
 * life; nothing on this page reads it.
 */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const THREE_MONTHS_MS = 90 * ONE_DAY_MS;

/**
 * The moments the three people in the fixtures joined, and the words the page
 * writes them as.
 *
 * They are fixed rather than left to `now()` so that the subtitle under each
 * name is a sentence a test can be sure of. `formatDayAndMonth` in `$lib/dates`
 * leaves the year out, and 09:00 UTC is the middle of the morning in
 * `CONFERENCE_TIMEZONE`, so neither the year in the timestamp nor the hour can
 * move the day these read as.
 */
const HEAD_JOINED_AT = '2026-09-01T09:00:00Z';
const FIRST_MEMBER_JOINED_AT = '2026-09-04T09:00:00Z';
const FIRST_MEMBER_JOINED_LABEL = '4 Sep';
const SECOND_MEMBER_JOINED_AT = '2026-09-06T09:00:00Z';
const SECOND_MEMBER_JOINED_LABEL = '6 Sep';

/**
 * What the rest of each subtitle says after the head's "Head" or a member's join
 * date: the experience level and the institution. `createTestUser` finishes every
 * account's onboarding with the same two answers, "intermediate" and "Delft
 * University", so every row in these tests ends with the same words.
 */
const TEST_USER_BACKGROUND = 'Intermediate · Delft University';

/**
 * The private details written onto two of the accounts below.
 *
 * Each phone number is unique, which is what lets a test say "the row that holds
 * this number" and mean one row. One member has a dietary requirement and the
 * other has none, so the same page shows both a written answer and the "Not
 * given" that stands for an empty box.
 */
const FIRST_MEMBER_PHONE = '+31612340001';
const FIRST_MEMBER_DIETARY_REQUIREMENT = 'No peanuts of any kind.';
const SECOND_MEMBER_PHONE = '+31612340002';

// -----------------------------------------------------------------------------
// The words on the controls
// -----------------------------------------------------------------------------
// `members.md` fixes every flash, every refusal, every badge and every empty
// state, but not what the controls themselves say. These are gathered here so
// that whoever owns the markup has one place to correct rather than a dozen
// assertions to hunt through.

/** The button on a plain member's row that makes them a head. */
const MAKE_HEAD_BUTTON_LABEL = 'Make head';

/** The button on the reader's own head row that gives the role up. */
const STEP_DOWN_BUTTON_LABEL = 'Step down';

/** The `ConfirmButton` on everybody else's row. */
const REMOVE_BUTTON_LABEL = 'Remove';

/** The `<summary>` of the native `<details>` under each row. */
const DETAILS_TOGGLE_LABEL = 'Details';

/** The heading of the box holding the join code. */
const INVITE_CARD_HEADING = 'Invite';

/** The button beside the join code, which puts the whole link on the clipboard. */
const COPY_LINK_BUTTON_LABEL = 'Copy link';

/** The two facts `permissions.md` gives a head, as `KeyValueList` names them. */
const PHONE_LABEL = 'Phone';
const DIETARY_REQUIREMENTS_LABEL = 'Dietary requirements';

/** What stands in a details row whose member left that box empty. */
const NOT_GIVEN = 'Not given';

/** The three tabs of the strip in the delegation's own layout. */
const OVERVIEW_TAB_LABEL = 'Overview';
const MEMBERS_TAB_LABEL = 'Members';
const SEATS_TAB_LABEL = 'Seats';
const PAPERS_TAB_LABEL = 'Papers';

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

/** What a test wants one of its committees to be. */
type CommitteeSeed = {
	name: string;
	/** What a seat badge names the committee by when there is one. */
	abbreviation?: string;
};

/** What a test wants its conference to be. Everything else is filled in. */
type ConferenceSeed = {
	committees?: CommitteeSeed[];
};

/** A conference a test has to itself, with everything a delegation needs. */
type TestConference = {
	id: string;
	/** The committee ids, in the order `committees` asked for them. */
	committeeIds: string[];
};

/**
 * Make a published conference that takes delegations, with its committees, and
 * answer everything a test needs to find it again.
 *
 * Everything is written with the service-role client, the way
 * `tests/e2e/delegations.spec.ts` writes its own: `conferences` has no insert
 * policy that would let a test account make one inside somebody else's
 * organisation.
 */
async function createTestConference(seed: ConferenceSeed = {}): Promise<TestConference> {
	const admin = createServiceRoleClient();
	const name = unusedName('Delegation Members Test MUN');
	const slug = `e2e-delegation-members-${crypto.randomUUID()}`;
	const now = Date.now();

	const { data: conference, error } = await admin
		.from('conferences')
		.insert({
			name,
			slug,
			city: 'Delft',
			country_code: 'NL',
			timezone: CONFERENCE_TIMEZONE,
			start_date: CONFERENCE_FIRST_DAY,
			end_date: CONFERENCE_LAST_DAY,
			status: 'published',
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

	const committeeIds = await addCommittees(conference.id, seed.committees ?? []);

	return { id: conference.id, committeeIds };
}

/** The committee ids of one test conference, in the order they were asked for. */
async function addCommittees(conferenceId: string, seeds: CommitteeSeed[]): Promise<string[]> {
	if (seeds.length === 0) {
		return [];
	}

	const admin = createServiceRoleClient();

	const rows = seeds.map((seed, index) => ({
		conference_id: conferenceId,
		name: seed.name,
		abbreviation: seed.abbreviation ?? null,
		slug: `committee-${crypto.randomUUID().slice(0, 8)}`,
		level: 'advanced' as const,
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
	/** The number the page's subtitle counts. Twelve unless a test wants the singular. */
	requestedSeats?: number;
	/** The moment the head joined, which decides the words under their name. */
	headJoinedAt?: string;
};

/** One delegation a test has arranged, as the tests below name it. */
type TestDelegation = {
	id: string;
	name: string;
	/** The code the invite card shows. */
	joinCode: string;
	/** The `/delegations/<id>` dashboard, which a member is sent back to. */
	path: string;
	/** The `/delegations/<id>/members` page this file is about. */
	membersPath: string;
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
	const joinCode = unusedJoinCode();
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
			requested_seats: seed.requestedSeats ?? 12,
			note: 'We would like to sit together if we can.',
			join_code: joinCode,
			submitted_at: isSent ? now : null,
			decided_at: isDecided ? now : null
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test delegation: ${error?.message}`);
	}

	const { error: headError } = await admin.from('delegation_members').insert({
		delegation_id: data.id,
		user_id: head.id,
		role: 'head',
		joined_at: seed.headJoinedAt ?? now
	});

	if (headError) {
		throw new Error(`Could not make the test account a head: ${headError.message}`);
	}

	return {
		id: data.id,
		name,
		joinCode,
		path: `/delegations/${data.id}`,
		membersPath: `/delegations/${data.id}/members`
	};
}

/** What a test wants to say about one membership. Everything else is filled in. */
type MembershipSeed = {
	/** `member` unless a test needs a second head. */
	role?: 'head' | 'member';
	/** The moment they joined, which decides the words under their name. */
	joinedAt?: string;
};

/**
 * Put somebody in a delegation somebody else runs, as `join_delegation` would.
 *
 * Joining through the real page is `tests/e2e/join-delegation.spec.ts`'s
 * subject; here a member is only ever somebody for the head to manage.
 */
async function joinTheDelegation(
	member: TestUser,
	delegationId: string,
	seed: MembershipSeed = {}
): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin.from('delegation_members').insert({
		delegation_id: delegationId,
		user_id: member.id,
		role: seed.role ?? 'member',
		joined_at: seed.joinedAt ?? new Date().toISOString()
	});

	if (error) {
		throw new Error(`Could not put the test account in the delegation: ${error.message}`);
	}
}

/**
 * Change somebody's role without going through the page.
 *
 * The step-down test needs a second head before it can watch the first one
 * leave, and the Make head button is the subject of a test of its own: a fixture
 * that pressed it would make a failure there fail twice, and in the wrong place
 * the second time. `protect_delegation_member_columns` only runs for the two
 * roles a browser uses, so the service role writes the column directly.
 */
async function setMemberRole(
	delegationId: string,
	userId: string,
	role: 'head' | 'member'
): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('delegation_members')
		.update({ role })
		.eq('delegation_id', delegationId)
		.eq('user_id', userId);

	if (error) {
		throw new Error(`Could not change the test member's role: ${error.message}`);
	}
}

/** One `delegation_members` row, as the tests below read it back. */
type MembershipRow = {
	role: 'head' | 'member';
};

/**
 * One membership, read straight from the table with the service-role client, or
 * nothing when that person is not in the delegation at all.
 *
 * Every test that presses one of the three buttons reads the row afterwards,
 * because a name on a page is not a membership and a page that forgot to
 * redraw itself would otherwise look like a page that worked.
 */
async function readMembership(delegationId: string, userId: string): Promise<MembershipRow | null> {
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

	return data;
}

/** What a test wants one member's private details to say. */
type PrivateDetailsSeed = {
	phone: string;
	/** Left out for the member whose box is empty, which is what "Not given" stands for. */
	dietaryRequirements?: string;
};

/**
 * Write the two private facts the details toggle shows.
 *
 * `handle_new_user` already made the `profile_details` row, so this updates it
 * rather than inserting. A person may write their own details — that is the
 * "Users can update their own private details" policy, and `/settings` is the
 * form that does it — so the service-role client here is standing in for a form
 * this test is not about, exactly as `giveSeat` in `signed-in-user.ts` stands in
 * for the allocation form.
 */
async function writePrivateDetails(member: TestUser, seed: PrivateDetailsSeed): Promise<void> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('profile_details')
		.update({
			phone: seed.phone,
			dietary_requirements: seed.dietaryRequirements ?? null
		})
		.eq('user_id', member.id)
		.select('user_id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test private details: ${error?.message}`);
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
 */
async function reserveSeats(
	committeeId: string,
	delegationId: string,
	seats: SeatSeed[],
	sitIn?: { user: TestUser; seatName: string }
): Promise<void> {
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

	const { error } = await admin.from('seats').insert(rows);

	if (error) {
		throw new Error(`Could not reserve the test seats: ${error.message}`);
	}
}

/**
 * Post to one of a page's form actions the way a browser posts a form.
 *
 * A copy of the one in `tests/e2e/delegation-seats.spec.ts`, and the same two
 * headers are written by hand for the same two reasons. `origin`, because
 * SvelteKit refuses a form post that looks as though it came from another
 * website and Playwright's request does not send that header itself. And
 * `accept: text/html`, because that is how SvelteKit tells a form post from a
 * page with no JavaScript from one made by `use:enhance`: with it the page is
 * drawn again carrying whatever the action decided, which is what a browser with
 * no script really receives. The request follows the redirect an action makes,
 * and it carries the browser's cookies, so the flash the action left behind is
 * in the text that comes back.
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
 * Press a button inside one row and answer the question it asks, if it asks one.
 *
 * A copy of the one in `tests/e2e/delegation-seats.spec.ts`, narrowed to a
 * locator because this page draws the same button on every row. With JavaScript
 * a `ConfirmButton` press opens a `<dialog>` and the dialog's own button is what
 * submits. Without it — which is the `desktop-no-js` project, and also any page
 * whose script has not landed yet — the press opens a confirmation page asking
 * the same question, whose own button is what submits. Both are the right
 * behaviour, so this waits to see which of the two happened rather than
 * assuming one, which is also what lets it press a plain submit button such as
 * Step down.
 *
 * `question` is the sentence the dialog has to ask before it is answered. There
 * is nothing to check when no dialog opened, because `answerConfirmationPage`
 * only presses the confirmation page's button and does not check the question
 * it prints.
 */
async function pressAndConfirm(
	page: Page,
	within: Locator,
	label: string,
	question?: string
): Promise<void> {
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

	if (question) {
		await expect(dialog.getByText(question)).toBeVisible();
	}

	await dialogButton.press('Enter');
}

/**
 * The one row belonging to the person with this name.
 *
 * The list is a `<ul>` of one `<li>` per member, so a row is found by the name
 * printed inside it and everything else — the badge, the seat, the buttons, the
 * details — is asked of that row rather than of the page. The names given to the
 * accounts below are all different, so each of these matches one `<li>`.
 *
 * The tab strip is a list of `<li>` as well, which is why this looks for a
 * person's name: a tab holds "Overview", "Members" or "Seats" and never a name.
 */
function memberRow(page: Page, name: string): Locator {
	return page.getByRole('main').locator('li').filter({ hasText: name });
}

/** The address that same button posts to, for the refusal that draws no button. */
function removeActionUrl(delegation: TestDelegation, userId: string): string {
	return `${delegation.membersPath}?/remove&user=${userId}`;
}

/** The strip of "Overview · Members · Seats · Papers" links. `Tabs` names it "Sections". */
function sectionsStrip(page: Page): Locator {
	return page.getByRole('main').getByRole('navigation', { name: 'Sections' });
}

/**
 * One tab of that strip.
 *
 * The words are matched from the start because a tab also shows a count beside
 * its label.
 */
function sectionTab(page: Page, label: string): Locator {
	return sectionsStrip(page).getByRole('link', { name: new RegExp(`^${label}`) });
}

/**
 * Open one delegation's members page and wait until it has really arrived.
 *
 * The heading is what says the page is there rather than the address, because
 * the address is right the moment the browser asks for it and the page arrives
 * afterwards. "Members" is what `members.md` puts in the `PageHeader`.
 */
async function openTheMembersPage(page: Page, delegation: TestDelegation): Promise<void> {
	await page.goto(delegation.membersPath);

	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Members', {
		timeout: DATABASE_TIMEOUT_MS
	});
}

/** Wait until the delegation dashboard is really on the screen. */
async function waitForTheDashboard(page: Page, delegation: TestDelegation): Promise<void> {
	await expect(page).toHaveURL(delegation.path, { timeout: DATABASE_TIMEOUT_MS });
	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
		delegation.name,
		{ timeout: DATABASE_TIMEOUT_MS }
	);
}

/**
 * Everything inside `<main>` as one line of words.
 *
 * A copy of the helper in `tests/e2e/manage-delegations.spec.ts`. `innerText`
 * gives the text as it is laid out rather than as it is nested, so a line the
 * markup builds out of several elements — a seat badge holding a flag and two
 * names — reads as the one sentence the spec quotes. Runs of whitespace are
 * squeezed to a single space, and the order of the words is the order of the
 * rows, which is what the listing test measures.
 */
async function shownWords(main: Locator): Promise<string> {
	return (await main.innerText()).replace(/\s+/g, ' ');
}

/**
 * Open every `<details>` on the page.
 *
 * A native `<details>` is shut until somebody clicks its `<summary>`, and it
 * needs no JavaScript to open, which is why the details are behind one at every
 * width. Each row has its own, so the test opens them all and then asks which
 * row holds which fact.
 */
async function openEveryDetailsToggle(main: Locator): Promise<void> {
	const toggles = main.locator('details > summary');
	const count = await toggles.count();

	for (let index = 0; index < count; index += 1) {
		await toggles.nth(index).click();
	}
}

/** What the two tests that measure the page have in front of them. */
type FullMembersPage = {
	conference: TestConference;
	delegation: TestDelegation;
};

/**
 * A members page with a few people on it: a head, three members, one of them in
 * a seat, and private details on two of them.
 *
 * The two tests below measure the page rather than read it, and measuring an
 * empty one would measure nothing.
 */
async function seedTheFullMembersPage(page: Page): Promise<FullMembersPage> {
	const conference = await createTestConference({
		committees: [{ name: 'Security Council', abbreviation: 'UNSC' }]
	});

	const head = await createTestUser('Amelie Dubois');
	const seatedMember = await createTestUser('Luis Ortega');
	const waitingMember = await createTestUser('Priya Nair');
	const thirdMember = await createTestUser('Tomas Nowak');
	const delegation = await giveDelegation(head, {
		conferenceId: conference.id,
		headJoinedAt: HEAD_JOINED_AT
	});

	await joinTheDelegation(seatedMember, delegation.id, { joinedAt: FIRST_MEMBER_JOINED_AT });
	await joinTheDelegation(waitingMember, delegation.id, { joinedAt: SECOND_MEMBER_JOINED_AT });
	await joinTheDelegation(thirdMember, delegation.id, { joinedAt: SECOND_MEMBER_JOINED_AT });

	await writePrivateDetails(seatedMember, {
		phone: FIRST_MEMBER_PHONE,
		dietaryRequirements: FIRST_MEMBER_DIETARY_REQUIREMENT
	});
	await writePrivateDetails(waitingMember, { phone: SECOND_MEMBER_PHONE });

	await reserveSeats(
		conference.committeeIds[0],
		delegation.id,
		[
			{ name: 'France', countryCode: 'FR' },
			{ name: 'United Kingdom', countryCode: 'GB' }
		],
		{ user: seatedMember, seatName: 'France' }
	);

	await signIn(page, head);
	await openTheMembersPage(page, delegation);

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

test('lists the members heads first, with the join date, the seat and the reader marked', async ({
	page
}) => {
	const conference = await createTestConference({
		committees: [{ name: 'Security Council', abbreviation: 'UNSC' }]
	});

	try {
		const head = await createTestUser('Amelie Dubois');
		const seatedMember = await createTestUser('Luis Ortega');
		const waitingMember = await createTestUser('Priya Nair');
		const delegation = await giveDelegation(head, {
			conferenceId: conference.id,
			headJoinedAt: HEAD_JOINED_AT
		});

		// The one who joined first is the one given a seat, so that the order of the
		// rows and the row that carries the badge are two different facts.
		await joinTheDelegation(seatedMember, delegation.id, { joinedAt: FIRST_MEMBER_JOINED_AT });
		await joinTheDelegation(waitingMember, delegation.id, { joinedAt: SECOND_MEMBER_JOINED_AT });

		await reserveSeats(
			conference.committeeIds[0],
			delegation.id,
			[{ name: 'France', countryCode: 'FR' }],
			{ user: seatedMember, seatName: 'France' }
		);

		await signIn(page, head);
		await openTheMembersPage(page, delegation);

		const main = page.getByRole('main');

		// The line under the title counts the people who are here and the seats the
		// head asked the organisers for.
		await expect(main.getByText('3 joined · 12 seats requested')).toBeVisible();

		// The reader's own row says so, and its quiet line says what they are rather
		// than when they joined.
		await expect(main.getByText(`${head.fullName} (you)`)).toBeVisible();
		await expect(main.getByText(`Head · ${TEST_USER_BACKGROUND}`, { exact: true })).toBeVisible();

		// Everybody else is headed by the day they joined.
		await expect(main.getByText(seatedMember.fullName, { exact: true })).toBeVisible();
		await expect(main.getByText(waitingMember.fullName, { exact: true })).toBeVisible();
		await expect(main.getByText(`joined ${FIRST_MEMBER_JOINED_LABEL}`)).toBeVisible();
		await expect(main.getByText(`joined ${SECOND_MEMBER_JOINED_LABEL}`)).toBeVisible();

		// And every row goes on to say how experienced that person is and which
		// school they come from.
		await expect(
			memberRow(page, seatedMember.fullName).getByText(TEST_USER_BACKGROUND)
		).toBeVisible();
		await expect(
			memberRow(page, waitingMember.fullName).getByText(TEST_USER_BACKGROUND)
		).toBeVisible();

		/*
			The seat badge and the words that stand for no seat are read out of the
			page's own text rather than looked for as elements: the badge is built out
			of a flag and two names, and `innerText` is what puts the pieces back into
			the one line the spec draws.
		*/
		const words = await shownWords(main);

		expect(words).toContain('France · UNSC');
		expect(words).toContain('No seat yet');

		// Heads first, then in the order people joined. Each name has been seen on
		// the page above, so none of these is the -1 of a name that is missing.
		expect(words.indexOf(head.fullName)).toBeLessThan(words.indexOf(seatedMember.fullName));
		expect(words.indexOf(seatedMember.fullName)).toBeLessThan(
			words.indexOf(waitingMember.fullName)
		);
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('makes a member a head, and refuses somebody who is in no delegation', async ({ page }) => {
	const conference = await createTestConference();

	try {
		const head = await createTestUser('Amelie Dubois');
		const member = await createTestUser('Sara Khan');
		// Somebody else entirely, with an account of their own and no delegation.
		const stranger = await createTestUser('Priya Nair');
		const delegation = await giveDelegation(head, { conferenceId: conference.id });

		await joinTheDelegation(member, delegation.id);

		await signIn(page, head);
		await openTheMembersPage(page, delegation);

		await memberRow(page, member.fullName)
			.getByRole('button', { name: MAKE_HEAD_BUTTON_LABEL })
			.press('Enter');

		await expect(page.getByText(`${member.fullName} is now a head.`)).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		// The row is a head's row now: its quiet line says "Head" instead of the day
		// they joined, and there is nothing left to promote.
		await expect(
			memberRow(page, member.fullName).getByRole('button', { name: MAKE_HEAD_BUTTON_LABEL })
		).toHaveCount(0, { timeout: DATABASE_TIMEOUT_MS });
		await expect(
			memberRow(page, member.fullName).getByText(`Head · ${TEST_USER_BACKGROUND}`, { exact: true })
		).toBeVisible();

		// And the row in the table, because a word on a page is not a role.
		expect((await readMembership(delegation.id, member.id))?.role).toBe('head');

		/*
			The refusal has to be asked of the action itself: the page draws no button
			for somebody who is not in the delegation, and the criterion is that the
			action refuses a `userId` that arrives anyway — from a form that was
			edited, or from anything that is not a browser.
		*/
		const refused = await postFormAction(page, `${delegation.membersPath}?/makeHead`, {
			userId: stranger.id
		});

		expect(await refused.text()).toContain('That person is not a member.');
		expect(await readMembership(delegation.id, stranger.id)).toBeNull();
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('making a member a head answers in place without reloading', async ({ page }, testInfo) => {
	// T125: "Make head" used to post and reload the page. It stays on this
	// page rather than redirecting, so a marker left on `window` before
	// pressing (`./in-place.ts`) proves the press did not reload it.
	skipWithoutJavaScript(testInfo);
	const conference = await createTestConference();

	try {
		const head = await createTestUser('Amelie Dubois');
		const member = await createTestUser('Sara Khan');
		const delegation = await giveDelegation(head, { conferenceId: conference.id });

		await joinTheDelegation(member, delegation.id);

		await signIn(page, head);
		await openTheMembersPage(page, delegation);
		await markPage(page);

		await memberRow(page, member.fullName)
			.getByRole('button', { name: MAKE_HEAD_BUTTON_LABEL })
			.click();

		await expect(page.getByText(`${member.fullName} is now a head.`)).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		expect(await readMembership(delegation.id, member.id)).toEqual({ role: 'head' });
		expect(await readMarker(page)).toBe('still here');
	} finally {
		await deleteTestConference(conference.id);
	}
});

// T142: with JavaScript "Make head" changes the row the moment it is pressed,
// before the server has answered and with no spinner, and a removal the
// server fails goes back and says whose it was.
test('makes a head at once, and puts a failed removal back', async ({ page }, testInfo) => {
	skipWithoutJavaScript(testInfo);
	const conference = await createTestConference();

	try {
		const head = await createTestUser('Amelie Dubois');
		const member = await createTestUser('Sara Khan');
		const waitingMember = await createTestUser('Priya Nair');
		const delegation = await giveDelegation(head, { conferenceId: conference.id });

		await joinTheDelegation(member, delegation.id);
		await joinTheDelegation(waitingMember, delegation.id);

		await signIn(page, head);
		await openTheMembersPage(page, delegation);
		await answerSlowly(page, 'makeHead');
		await watchForSpinners(page);

		await memberRow(page, member.fullName)
			.getByRole('button', { name: MAKE_HEAD_BUTTON_LABEL })
			.click();

		await expect(
			memberRow(page, member.fullName).getByText(`Head · ${TEST_USER_BACKGROUND}`, { exact: true })
		).toBeVisible({ timeout: AT_ONCE_TIMEOUT_MS });

		await waitUntilAnswered(page);
		expect(await sawSpinner(page)).toBe(false);
		expect(await readMembership(delegation.id, member.id)).toEqual({ role: 'head' });

		await answerWithError(page, 'remove');
		await pressAndConfirm(page, memberRow(page, waitingMember.fullName), REMOVE_BUTTON_LABEL);

		await expect(page.getByRole('alert')).toContainText(
			`${waitingMember.fullName} was not removed.`,
			{ timeout: DATABASE_TIMEOUT_MS }
		);
		await waitUntilAnswered(page);
		await expect(
			page.getByRole('main').getByText(waitingMember.fullName, { exact: true })
		).toBeVisible();
		expect(await readMembership(delegation.id, waitingMember.id)).not.toBeNull();
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('keeps the last head, and lets a second one step down and lose the page', async ({ page }) => {
	const conference = await createTestConference();

	try {
		const head = await createTestUser('Amelie Dubois');
		const member = await createTestUser('Sara Khan');
		const delegation = await giveDelegation(head, { conferenceId: conference.id });

		await joinTheDelegation(member, delegation.id);

		await signIn(page, head);
		await openTheMembersPage(page, delegation);

		/*
			The only head. The page still draws Step down for them, because it does
			not count the heads, so stopping the last head is the action's job, and
			`members.md` asks it of the action and the database alike. The action is
			asked directly, the way anything that is not this page would reach it.
			`stepDown` takes no fields at all.
		*/
		const refused = await postFormAction(page, `${delegation.membersPath}?/stepDown`);

		expect(await refused.text()).toContain('A delegation needs at least one head.');
		expect((await readMembership(delegation.id, head.id))?.role).toBe('head');

		// With somebody to hand over to, the same press works. The second head is
		// seeded rather than promoted through the page for the reason
		// `setMemberRole` gives.
		await setMemberRole(delegation.id, member.id, 'head');
		await openTheMembersPage(page, delegation);

		await page
			.getByRole('main')
			.getByRole('button', { name: STEP_DOWN_BUTTON_LABEL })
			.press('Enter');

		await expect(page.getByText('You are no longer a head.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		// It lands on the dashboard rather than back here, because the page they
		// have just left is one they may no longer open.
		await waitForTheDashboard(page, delegation);
		expect((await readMembership(delegation.id, head.id))?.role).toBe('member');

		// A plain member's strip has no Members tab, so there is no longer a way in
		// from here. It keeps Overview and Papers (T147).
		await expect(sectionTab(page, OVERVIEW_TAB_LABEL)).toBeVisible();
		await expect(sectionTab(page, MEMBERS_TAB_LABEL)).toHaveCount(0);

		// And the page itself is shut, whether or not anything links to it.
		await page.goto(delegation.membersPath);

		await expect(page.getByText('Only heads manage members.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await waitForTheDashboard(page, delegation);
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('removes an unseated member, and refuses a seated one and the reader', async ({ page }) => {
	const conference = await createTestConference({
		committees: [{ name: 'Security Council', abbreviation: 'UNSC' }]
	});

	try {
		const head = await createTestUser('Amelie Dubois');
		const seatedMember = await createTestUser('Luis Ortega');
		const waitingMember = await createTestUser('Priya Nair');
		const delegation = await giveDelegation(head, { conferenceId: conference.id });

		await joinTheDelegation(seatedMember, delegation.id);
		await joinTheDelegation(waitingMember, delegation.id);

		await reserveSeats(
			conference.committeeIds[0],
			delegation.id,
			[{ name: 'France', countryCode: 'FR' }],
			{ user: seatedMember, seatName: 'France' }
		);

		await signIn(page, head);
		await openTheMembersPage(page, delegation);

		const main = page.getByRole('main');

		// Somebody sitting in a seat cannot be taken out of the delegation: their
		// seat would keep a delegate who is no longer in it. The button is drawn, so
		// it is pressed, and the question it asks is the one the spec quotes.
		await pressAndConfirm(
			page,
			memberRow(page, seatedMember.fullName),
			REMOVE_BUTTON_LABEL,
			`Remove ${seatedMember.fullName} from the delegation?`
		);

		await expect(
			page.getByText(`${seatedMember.fullName} holds a seat; unassign it on the Seats page first.`)
		).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		expect(await readMembership(delegation.id, seatedMember.id)).not.toBeNull();

		// Somebody with no seat goes, and their row goes with them.
		await pressAndConfirm(
			page,
			memberRow(page, waitingMember.fullName),
			REMOVE_BUTTON_LABEL,
			`Remove ${waitingMember.fullName} from the delegation?`
		);

		await expect(page.getByText(`${waitingMember.fullName} removed.`)).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(main.getByText(waitingMember.fullName, { exact: true })).toHaveCount(0, {
			timeout: DATABASE_TIMEOUT_MS
		});
		expect(await readMembership(delegation.id, waitingMember.id)).toBeNull();

		/*
			The reader's own row has no Remove on it, so this refusal is asked of the
			action: `confirm=1` is what `ConfirmButton` sends, and the member travels
			in the address the way that button addresses one.
		*/
		const refused = await postFormAction(page, removeActionUrl(delegation, head.id), {
			confirm: '1'
		});

		expect(await refused.text()).toContain(
			'You cannot remove yourself; step down or withdraw the delegation.'
		);
		expect(await readMembership(delegation.id, head.id)).not.toBeNull();
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('shows a head the phone and dietary requirements behind the Details toggle', async ({
	page
}) => {
	const conference = await createTestConference();

	try {
		const head = await createTestUser('Amelie Dubois');
		const answeredEverything = await createTestUser('Luis Ortega');
		const leftTheBoxEmpty = await createTestUser('Priya Nair');
		const delegation = await giveDelegation(head, { conferenceId: conference.id });

		await joinTheDelegation(answeredEverything, delegation.id);
		await joinTheDelegation(leftTheBoxEmpty, delegation.id);

		await writePrivateDetails(answeredEverything, {
			phone: FIRST_MEMBER_PHONE,
			dietaryRequirements: FIRST_MEMBER_DIETARY_REQUIREMENT
		});
		// A phone number and nothing else, so this row is the one that has to read
		// "Not given" where the other reads a real answer.
		await writePrivateDetails(leftTheBoxEmpty, { phone: SECOND_MEMBER_PHONE });

		await signIn(page, head);
		await openTheMembersPage(page, delegation);

		const main = page.getByRole('main');

		// Behind the toggle means behind it: the facts are in the page and none of
		// them can be read until a row is opened.
		await expect(main.getByText(DETAILS_TOGGLE_LABEL, { exact: true }).first()).toBeVisible();
		await expect(main.getByText(FIRST_MEMBER_PHONE)).toBeHidden();

		await openEveryDetailsToggle(main);

		// Each phone number is unique, so the `<details>` holding one of them is
		// exactly one member's row.
		const answeredRow = main.locator('details').filter({ hasText: FIRST_MEMBER_PHONE });

		await expect(answeredRow).toHaveCount(1);
		await expect(answeredRow.getByText(PHONE_LABEL)).toBeVisible();
		await expect(answeredRow.getByText(FIRST_MEMBER_PHONE)).toBeVisible();
		await expect(answeredRow.getByText(DIETARY_REQUIREMENTS_LABEL)).toBeVisible();
		await expect(answeredRow.getByText(FIRST_MEMBER_DIETARY_REQUIREMENT)).toBeVisible();

		// The other row says so rather than leaving a gap where the answer would be.
		const emptyRow = main.locator('details').filter({ hasText: SECOND_MEMBER_PHONE });

		await expect(emptyRow).toHaveCount(1);
		await expect(emptyRow.getByText(DIETARY_REQUIREMENTS_LABEL)).toBeVisible();
		await expect(emptyRow.getByText(NOT_GIVEN)).toBeVisible();
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('sends a member back to the dashboard, where there is no tab strip at all', async ({
	page
}) => {
	const conference = await createTestConference();

	try {
		const head = await createTestUser('Amelie Dubois');
		const member = await createTestUser('Sara Khan');
		const delegation = await giveDelegation(head, { conferenceId: conference.id });

		await joinTheDelegation(member, delegation.id);

		await signIn(page, member);
		await page.goto(delegation.membersPath);

		// Managing members is the head's job, so the page is never drawn for anybody
		// else: they land back on the dashboard with the reason.
		await expect(page.getByText('Only heads manage members.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await waitForTheDashboard(page, delegation);

		// And their strip leaves out the two tabs that lead to pages they may not
		// open: it has Overview and Papers only (T147).
		await expect(sectionTab(page, OVERVIEW_TAB_LABEL)).toBeVisible();
		await expect(sectionTab(page, PAPERS_TAB_LABEL)).toBeVisible();
		await expect(sectionsStrip(page).getByRole('link')).toHaveCount(2);
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('carries the join code while the delegation is open, and a notice once it is not', async ({
	page
}) => {
	// One conference per delegation, because one account can only be in one
	// delegation per conference.
	const open = await createTestConference();
	const turnedDown = await createTestConference();
	const givenUp = await createTestConference();

	try {
		const head = await createTestUser('Amelie Dubois');
		// One seat asked for and nobody else here yet, which is where the counts read
		// in the singular.
		const accepted = await giveDelegation(head, {
			conferenceId: open.id,
			requestedSeats: 1
		});
		const rejected = await giveDelegation(head, {
			conferenceId: turnedDown.id,
			status: 'rejected'
		});
		const withdrawn = await giveDelegation(head, {
			conferenceId: givenUp.id,
			status: 'withdrawn'
		});

		await signIn(page, head);
		await openTheMembersPage(page, accepted);

		const main = page.getByRole('main');

		await expect(main.getByText(INVITE_CARD_HEADING, { exact: true })).toBeVisible();
		// The code is on the card twice: alone in large letters, and again inside the
		// whole address printed under it. `exact` picks the first of the two.
		await expect(main.getByText(accepted.joinCode, { exact: true })).toBeVisible();
		await expect(main.getByRole('button', { name: COPY_LINK_BUTTON_LABEL })).toBeVisible();
		await expect(
			main.getByText('Members create an account, open the link and press Join.')
		).toBeVisible();

		// Nobody has taken the link up yet, so the list says so and the counts read
		// in the singular.
		await expect(main.getByText('1 joined · 1 seat requested')).toBeVisible();
		await expect(main.getByText('Nobody has joined yet.')).toBeVisible();
		await expect(
			main.getByText('Share the join link. Members appear here as soon as they join.')
		).toBeVisible();

		// A delegation the organisers turned down cannot take anybody, so the box is
		// replaced rather than shown with a dead button in it.
		await openTheMembersPage(page, rejected);

		await expect(main.getByText('This delegation is rejected; nobody can join.')).toBeVisible();
		await expect(main.getByText(INVITE_CARD_HEADING, { exact: true })).toHaveCount(0);
		await expect(main.getByText(rejected.joinCode)).toHaveCount(0);

		// And one the head withdrew reads the same way in its own word.
		await openTheMembersPage(page, withdrawn);

		await expect(main.getByText('This delegation is withdrawn; nobody can join.')).toBeVisible();
		await expect(main.getByText(INVITE_CARD_HEADING, { exact: true })).toHaveCount(0);
		await expect(main.getByText(withdrawn.joinCode)).toHaveCount(0);
	} finally {
		await deleteTestConference(open.id);
		await deleteTestConference(turnedDown.id);
		await deleteTestConference(givenUp.id);
	}
});

test('gives a head three tabs, and the Members one leads here from the dashboard', async ({
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
		await reserveSeats(conference.committeeIds[0], delegation.id, [
			{ name: 'France', countryCode: 'FR' }
		]);

		await signIn(page, head);
		await page.goto(delegation.path);
		await waitForTheDashboard(page, delegation);

		await expect(sectionTab(page, OVERVIEW_TAB_LABEL)).toBeVisible();
		await expect(sectionTab(page, MEMBERS_TAB_LABEL)).toBeVisible();
		await expect(sectionTab(page, SEATS_TAB_LABEL)).toBeVisible();
		await expect(sectionTab(page, PAPERS_TAB_LABEL)).toBeVisible();
		await expect(sectionsStrip(page).getByRole('link')).toHaveCount(4);

		// The tab is a real link, so clicking it is the whole way in.
		await sectionTab(page, MEMBERS_TAB_LABEL).click({ timeout: DATABASE_TIMEOUT_MS });

		await expect(page).toHaveURL(delegation.membersPath, { timeout: DATABASE_TIMEOUT_MS });
		await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Members', {
			timeout: DATABASE_TIMEOUT_MS
		});

		/*
			`Tabs` marks the open tab with `aria-current="page"`, which is what tells a
			screen reader which one it is. The layout works it out from the address, so
			this is also where that sum is checked.
		*/
		await expect(sectionTab(page, MEMBERS_TAB_LABEL)).toHaveAttribute('aria-current', 'page');
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('does not spill off the side of a phone screen', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	const { conference } = await seedTheFullMembersPage(page);

	try {
		// The likeliest things to push a phone sideways are a member row, which holds
		// an avatar, a name, a badge and two buttons on one line, and an open details
		// row, whose longest value is a phone number that may not be broken.
		await expectNoSidewaysOverflow(page);

		await openEveryDetailsToggle(page.getByRole('main'));

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

	const { conference } = await seedTheFullMembersPage(page);

	try {
		// The picture is saved whether the measurement passes or fails, so that a
		// failure can be looked at rather than guessed at.
		await saveFullPageScreenshot(page, 'delegation-members');
		await expectPageFitsInScreens(page, PAGE_SCREENS);
	} finally {
		await deleteTestConference(conference.id);
	}
});
