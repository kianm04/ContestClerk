import { expect, test, type APIResponse, type Locator, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { createTestUser, signIn, type TestUser } from './signed-in-user';
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

// The acceptance criteria of `specs/05-pages/organiser/committees.md` and
// `specs/05-pages/organiser/committee-edit.md` that need a real browser: the
// committees list at `/manage/[slug]/committees` and the committee editor at
// `/manage/[slug]/committees/new` and `/manage/[slug]/committees/[committeeId]`.
//
// * the committees are listed in `position` order, with the counts the database
//   holds, a "No seats" warning on a committee with none, and an invitation
//   link on one with nobody in the chair;
// * up and down move a committee exactly one place, and the new order is still
//   there after a refresh;
// * "Edit" opens the editor of the committee whose link was pressed, and
//   "Chair room" opens that committee's chair room (T171);
// * a committee made through the form lands on its own editor;
// * a `committeeId` from another conference is a 404, and an action posted to by
//   somebody who runs no conference is one too;
// * topics can be added, removed and saved in the order they are on the page;
// * "Add UN member states" adds 193 country seats with their codes, and adds
//   none of them a second time;
// * pasted names become seats, the ones already there are skipped, and the
//   flash says how many of each;
// * a seat that is filled or reserved can be neither hidden nor deleted, and a
//   free one can be hidden, shown, moved and deleted;
// * a link another committee of the same conference already uses is refused;
// * a committee with a delegate in it cannot be deleted, and one with nobody in
//   it can;
// * every message the spec's table lists appears, and they appear together on
//   one submit rather than one per attempt;
// * neither page spills off a phone screen or runs on for screens on a desktop.
//
// The chairs panel and the background guide are **T65**, so nothing here tests
// them, nor the committee row's "Papers n/m": the `documents` table and
// `/manage/[slug]/team` did not exist yet. The criterion of
// `committee-edit.md` about the `committee_state` row is met by the test that
// creates a committee, which reads the row the T39 trigger wrote straight from
// the database, because nothing about it shows on the screen.
//
// EVERY ACTION WITHOUT JAVASCRIPT
// That criterion is met by these tests running on the `desktop-no-js` project
// like every other browser test, rather than by a test of its own. Every
// control on both pages is a real submit button in a real `<form method="post">`
// — the two move arrows on a committee row, "Add topic" and each topic's own
// "Remove topic", the three ready-made seat lists, "Add seats", "Add seat",
// each seat's move, hide, show and delete, and the form's own "Create
// committee" or "Save changes" — so a browser with no script posts all of them.
// The two tests that measure a page are the exception: they ask the browser for
// its own dimensions, and each runs on one project alone.
//
// WHAT THESE TESTS LEAVE BEHIND
// Each test creates its own conference through `./draft-conference`, with an
// organisation of its own, and what it creates stays in the database until the
// next `pnpm db:reset`. They are dated in 2020 for the reason
// `tests/e2e/manage-dashboard.spec.ts` gives: `/conferences` lists conferences
// that are published *and* have not finished, and
// `tests/e2e/conferences.spec.ts` counts what is in it, so the tests below that
// publish a conference change nothing it sees.
//
// Nothing here takes a committee, a seat or a delegate from `supabase/seed.sql`.
//
// `createDraftConference`, `slugOf`, `readConferenceId`,
// `signInWithAConference`, `postFormAction` and `pressAndConfirm` below are
// copies of the ones in `tests/e2e/manage-details.spec.ts` and
// `tests/e2e/manage-dashboard.spec.ts`, and are deliberately copies rather than
// shared imports for the same reason those two are: each file wants its own
// dates and its own extra fields, and a helper shared between them would have
// to be told about every one of those.

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
 * Both are in the past, for the reason at the top of this file.
 */
const CONFERENCE_FIRST_DAY = '2020-05-03';
const CONFERENCE_LAST_DAY = '2020-05-05';

/**
 * How many member states the United Nations has, and so how many seats the
 * first of the three ready-made lists adds.
 *
 * `UN_MEMBER_STATES` in `src/lib/seat-lists.ts` is the list itself. It is not
 * imported here: Playwright compiles the files in `tests/` on their own,
 * without the `$lib` alias the app is built with, which is why
 * `manage-dashboard.spec.ts` writes out its own `formatMoney` as well.
 */
const UN_MEMBER_STATE_COUNT = 193;

/**
 * How many seats one paste may add at a time, from `PASTED_SEAT_LIMIT` in
 * `src/lib/seat-lists.ts`. The test that goes over it sends one more than this.
 */
const PASTED_SEAT_LIMIT = 300;

/**
 * How many windows tall the committees list may be with a real conference's
 * committees on it.
 *
 * Three is the ceiling the conference dashboard and the details editor are both
 * held to, and the reason is the same: more than that would mean these rows are
 * being drawn too big to be scanned, which is exactly what
 * `tests/e2e/page-shape.ts` exists to notice.
 */
const COMMITTEES_LIST_SCREENS = 3;

/**
 * How many windows tall the committee editor may be.
 *
 * One more than the list above, and T65 is why: that task added the Chairs and
 * Background guide panels `05-pages/organiser/committee-edit.md` has always
 * asked this page for, which is a sixth and a seventh section on a page that
 * was measured at three with five. Since the manage redesign every part is a
 * full-width section of its own, and the page measures about three screens
 * with this committee on a 1280 by 800 window. Nothing here is drawn bigger
 * than it was; there is simply more of it, and four screens still fails a page
 * whose fields have been let swell.
 *
 * Five since the "Resolutions" section of `docs/committee-papers.md` step 4:
 * an eighth section with fifteen settings, each with its own help line, which
 * the spec asks to be spelt out field by field. It adds about a screen and a
 * half; five still fails a page whose fields have been let swell.
 *
 * The committee the height test measures has fifteen seats, the size of the
 * Security Council and of the committee in the page file's own wireframe. A
 * committee can have 193, and `SeatsTable` keeps the page to this ceiling
 * whatever the number by giving its list a fixed height and a scrollbar of its
 * own — which is what this measurement is holding it to.
 */
const COMMITTEE_EDITOR_SCREENS = 5;

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

/** A signed-in account with a conference of its own, ready for a test to work on. */
type TestConference = {
	user: TestUser;
	id: string;
	slug: string;
	name: string;
	/** The `/manage/<slug>` address the other setup steps sit under. */
	managePath: string;
	/** The `/manage/<slug>/committees` address this file is about. */
	committeesPath: string;
	/** The `/manage/<slug>/committees/new` address of the create form. */
	newCommitteePath: string;
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
		committeesPath: `${managePath}/committees`,
		newCommitteePath: `${managePath}/committees/new`
	};
}

/**
 * Sign in, make a conference and open its committees list, which is where most
 * of the tests below start.
 *
 * Waiting for the heading rather than simply for the address is what says the
 * page has arrived: a test that pressed too early would press the page it was
 * leaving.
 */
async function openCommitteesPage(page: Page, prefix: string): Promise<TestConference> {
	const conference = await signInWithAConference(page, prefix);

	await page.goto(conference.committeesPath);

	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Committees', {
		timeout: DATABASE_TIMEOUT_MS
	});

	return conference;
}

/** The address of one committee's editor. `manageCommitteeUrl` in `src/lib/urls.ts`. */
function committeeEditorPath(conference: TestConference, committeeId: string): string {
	return `${conference.committeesPath}/${committeeId}`;
}

/** What `addCommittee` puts in the table. Everything but the name has a default. */
type NewCommittee = {
	name: string;
	abbreviation?: string;
	slug?: string;
	level?: 'beginner' | 'intermediate' | 'advanced';
	topics?: string[];
	/** Where the committee sits in the organiser's own order. */
	position?: number;
};

/**
 * Write one committee straight into the table, and answer its id.
 *
 * The editor is what this file is about, so the tests that are about the *list*
 * are handed their committees rather than typing each one in: five forms filled
 * in to prove an ordering would be five minutes of a browser test proving
 * something the two tests about the form already prove. The service-role client
 * stands in for the form the same way `addCommitteeWithASeat` in
 * `manage-dashboard.spec.ts` does, and is never used to show that something is
 * allowed, which is what `tests/db/supabase-test-client.ts` warns against.
 */
async function addCommittee(conferenceId: string, committee: NewCommittee): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('committees')
		.insert({
			conference_id: conferenceId,
			name: committee.name,
			abbreviation: committee.abbreviation ?? null,
			// A slug is unique within the conference, and a random one keeps two
			// committees of the same test from clashing.
			slug: committee.slug ?? `committee-${crypto.randomUUID().slice(0, 8)}`,
			level: committee.level ?? 'intermediate',
			topics: committee.topics ?? [],
			position: committee.position ?? 0
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test committee: ${error?.message}`);
	}

	return data.id;
}

/**
 * Give a committee these seats, in the order they are given, and answer their
 * ids by name.
 *
 * `position` is written by hand rather than left to default, because the list
 * is read back in that order and every row would otherwise be a zero.
 */
async function addSeats(committeeId: string, names: string[]): Promise<Map<string, string>> {
	const admin = createServiceRoleClient();

	const rows = names.map((name, index) => ({
		committee_id: committeeId,
		name,
		position: index
	}));

	const { data, error } = await admin
		.from('seats')
		.insert(rows)
		.select('id, name')
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<{ id: string; name: string }[], { merge: false }>();

	if (error || !data) {
		throw new Error(`Could not write the test seats: ${error?.message}`);
	}

	const seatIds = new Map<string, string>();

	for (const row of data) {
		seatIds.set(row.name, row.id);
	}

	return seatIds;
}

/** One `seats` row, as the tests below read it back. */
type SeatRow = {
	id: string;
	name: string;
	kind: string;
	country_code: string | null;
	position: number;
	is_available: boolean;
	user_id: string | null;
	delegation_id: string | null;
};

/** Every seat of one committee, in the organiser's own order. */
async function readSeats(committeeId: string): Promise<SeatRow[]> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('seats')
		.select('id, name, kind, country_code, position, is_available, user_id, delegation_id')
		.eq('committee_id', committeeId)
		.order('position', { ascending: true })
		.overrideTypes<SeatRow[], { merge: false }>();

	if (error || !data) {
		throw new Error(`Could not read the test seats: ${error?.message}`);
	}

	return data;
}

/** The one seat of this committee with this name, or a thrown error. */
async function readSeat(committeeId: string, name: string): Promise<SeatRow> {
	const seats = await readSeats(committeeId);
	const seat = seats.find((row) => row.name === name);

	if (!seat) {
		throw new Error(`The test committee has no seat called "${name}".`);
	}

	return seat;
}

/**
 * Put somebody in a seat, which is what "filled" means.
 *
 * Allocation is T28's page, so the service-role client writes the column the
 * way `giveSeat` in `./signed-in-user` does. Nothing on either of the two pages
 * this file is about can fill a seat, and half the rules here are about what
 * happens once one is.
 */
async function fillSeat(seatId: string, userId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('seats')
		.update({ user_id: userId, allocated_at: new Date().toISOString() })
		.eq('id', seatId);

	if (error) {
		throw new Error(`Could not fill the test seat: ${error.message}`);
	}
}

/** Take a seat back, so that a committee can be deleted after all. */
async function freeSeat(seatId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('seats')
		.update({ user_id: null, allocated_at: null })
		.eq('id', seatId);

	if (error) {
		throw new Error(`Could not free the test seat: ${error.message}`);
	}
}

/**
 * Make a delegation of this conference and answer its id.
 *
 * A seat held for a delegation with nobody in it yet is what "reserved" means
 * (`specs/02-architecture/data-model.md`), and a delegation is the only way to
 * arrange one. Delegations are T27's pages, so the service-role client writes
 * the row; `join_code` is minted here because the column is `not null unique`
 * and `create_delegation`, which normally mints it, needs a signed-in head.
 */
async function addDelegation(conferenceId: string): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('delegations')
		.insert({
			conference_id: conferenceId,
			name: 'Delft Grammar School',
			institution_name: 'Delft Grammar School',
			status: 'accepted',
			join_code: crypto.randomUUID().slice(0, 8).toUpperCase()
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test delegation: ${error?.message}`);
	}

	return data.id;
}

/** Hold a seat for a delegation without putting anybody in it, which is "reserved". */
async function reserveSeat(seatId: string, delegationId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('seats')
		.update({ delegation_id: delegationId })
		.eq('id', seatId);

	if (error) {
		throw new Error(`Could not reserve the test seat: ${error.message}`);
	}
}

/** Put somebody in the chair of a committee, so that its row names them instead of "Invite". */
async function addChair(committeeId: string, userId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('committee_chairs')
		.insert({ committee_id: committeeId, user_id: userId, title: 'Chair' });

	if (error) {
		throw new Error(`Could not write the test chair: ${error.message}`);
	}
}

/** One `committees` row, as the tests below read it back. */
type CommitteeRow = {
	id: string;
	name: string;
	abbreviation: string | null;
	slug: string;
	description: string | null;
	level: string;
	room: string | null;
	topics: string[];
	position: number;
	default_speaking_time_seconds: number;
};

/** The part of a `committee_state` row the test below looks at. */
type CommitteeStateRow = {
	committee_id: string;
	mode: string;
	current_session_id: string | null;
};

/** Every committee of one conference, in `position` order. */
async function readCommittees(conferenceId: string): Promise<CommitteeRow[]> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('committees')
		.select(
			'id, name, abbreviation, slug, description, level, room, topics, position, ' +
				'default_speaking_time_seconds'
		)
		.eq('conference_id', conferenceId)
		.order('position', { ascending: true })
		// Supabase works a row's shape out from the text inside `select`, and it
		// cannot do that with one built by joining strings together, so the shape
		// is named here instead. The same `overrideTypes` the queries in
		// `src/lib/server/committees.ts` use.
		.overrideTypes<CommitteeRow[], { merge: false }>();

	if (error || !data) {
		throw new Error(`Could not read the test committees: ${error?.message}`);
	}

	return data;
}

/** The `committee_state` row of one committee, or a thrown error if it has none. */
async function readCommitteeState(committeeId: string): Promise<CommitteeStateRow> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('committee_state')
		.select('committee_id, mode, current_session_id')
		.eq('committee_id', committeeId)
		.single();

	if (error || !data) {
		throw new Error(`Committee ${committeeId} has no committee_state row: ${error?.message}`);
	}

	return data;
}

/** One committee read back by its id, or a thrown error. */
async function readCommittee(conferenceId: string, committeeId: string): Promise<CommitteeRow> {
	const committees = await readCommittees(conferenceId);
	const committee = committees.find((row) => row.id === committeeId);

	if (!committee) {
		throw new Error(`The test conference has no committee with the id ${committeeId}.`);
	}

	return committee;
}

/** Whether the committee row is still there at all, for the delete test. */
async function committeeExists(committeeId: string): Promise<boolean> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('committees')
		.select('id')
		.eq('id', committeeId)
		.maybeSingle();

	if (error) {
		throw new Error(`Could not look for the committee: ${error.message}`);
	}

	return data !== null;
}

/** The organisation that runs the conference at `/manage/<slug>`. */
async function readOrganizationId(slug: string): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('conferences')
		.select('organization_id')
		.eq('slug', slug)
		.maybeSingle();

	if (error || !data) {
		throw new Error(`Could not find the conference "${slug}": ${error?.message}`);
	}

	return data.organization_id;
}

/** A second conference, made without the form, and the address of its own pages. */
type SecondConference = {
	id: string;
	slug: string;
};

/**
 * Give an organisation one more conference, so that a test has two of them.
 *
 * It is written straight into the table, because how a second conference is
 * made is the creation flow's business and not what the test below is about. It belongs to the same organisation as the first, which is what makes
 * the reader an organiser of both.
 *
 * The dates are in 2020, like every other conference this file makes, for the
 * reason at the top of it.
 */
async function addConference(
	organizationId: string,
	createdBy: string,
	name: string
): Promise<SecondConference> {
	const admin = createServiceRoleClient();
	const slug = `second-conference-${crypto.randomUUID().slice(0, 8)}`;

	const { data, error } = await admin
		.from('conferences')
		.insert({
			organization_id: organizationId,
			created_by: createdBy,
			slug,
			name,
			city: 'Delft',
			country_code: 'NL',
			start_date: CONFERENCE_FIRST_DAY,
			end_date: CONFERENCE_LAST_DAY
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the second test conference: ${error?.message}`);
	}

	return { id: data.id, slug };
}

/**
 * Publish a conference without going through the dashboard.
 *
 * Two rules only exist on a published conference: a committee needs at least
 * one topic, and changing a committee's link warns that shared links will stop
 * working. Publishing is the dashboard's work and has its own tests in
 * `manage-dashboard.spec.ts`, so the service-role client sets the column rather
 * than these tests walking the checklist to get there.
 */
async function publishConference(conferenceId: string): Promise<void> {
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
 * Post to one of the page's form actions the way a browser posts a form.
 *
 * A button the page never drew proves only what the page did; several of the
 * rules below are that the action itself refuses, so these tests ask it
 * directly. `page.request` carries the browser's own cookies, so the post
 * arrives signed in as the account the test signed in. Two headers are written
 * by hand. `origin`, because SvelteKit refuses a form post that looks as though
 * it came from another website and Playwright's request does not send that
 * header itself. And `accept: text/html`, because that is how SvelteKit tells a
 * form post from a page with no JavaScript from one made by `use:enhance`:
 * without it the answer is the action's result as JSON under a 200, and with it
 * the page is drawn again carrying the status the action chose, which is what a
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
 * With JavaScript the press opens a `<dialog>` and the dialog's own button is
 * what submits. Without it — which is the `desktop-no-js` project, and also any
 * page whose script has not landed yet — the press opens a confirmation page
 * asking the same question, whose own button is what submits. Both are the
 * right behaviour, so this waits to see which of the two happened rather than
 * assuming one.
 *
 * "Delete committee" is the only `ConfirmButton` on either page. A seat's own
 * Delete is a plain `Button`, because a `ConfirmButton` carries a `Modal` and
 * 193 seats would put 193 hidden dialogs on the page, so the tests below press
 * those directly.
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
 * Fill the committee form in and save it.
 *
 * Both routes draw the same `CommitteeForm`, so the new form and the editor are
 * filled in the same way. The level is a radio button, which HTML checks rather
 * than fills.
 */
type CommitteeFormFields = {
	name: string;
	abbreviation?: string;
	/** The words beside the radio button, such as "Advanced". */
	level?: string;
	/** What goes in the first topic row. */
	firstTopic?: string;
};

async function fillCommitteeForm(main: Locator, fields: CommitteeFormFields): Promise<void> {
	await main.getByLabel('Name', { exact: true }).fill(fields.name);

	if (fields.abbreviation !== undefined) {
		await main.getByLabel('Abbreviation', { exact: true }).fill(fields.abbreviation);
	}

	if (fields.level !== undefined) {
		// A `<fieldset>` with a `<legend>` is how HTML names a set of radio
		// buttons, so each choice is found by the words beside it rather than by a
		// label of its own.
		await main.getByRole('radio', { name: fields.level, exact: true }).check();
	}

	if (fields.firstTopic !== undefined) {
		// `TopicsEditor` numbers its rows, so the first one is labelled "Topic 1".
		await main.getByLabel('Topic 1', { exact: true }).fill(fields.firstTopic);
	}
}

/*
	Every test here signs a brand-new account in, seeds a draft conference,
	opens one of the two pages and then fills a form in, sometimes several times.
	That is a great deal more than most browser tests do, and thirty seconds —
	what Playwright allows a test by default — is not always enough for it while
	the whole suite is asking the one local database at once. `test.slow()`
	triples that allowance. It is an allowance and not a wait: a test that is
	quick still finishes as quickly as it can.
*/
test.beforeEach(() => {
	test.slow();
});

test('lists the committees in the organiser order, with their counts and their warnings', async ({
	page
}) => {
	const conference = await openCommitteesPage(page, 'Committee List MUN');

	// Two committees, one of each kind: one that is ready, with seats, topics and
	// somebody in the chair, and one that is not, with none of the three.
	const readyName = unusedName('Security Council');
	const bareName = unusedName('Human Rights Council');

	const readyId = await addCommittee(conference.id, {
		name: readyName,
		abbreviation: 'UNSC',
		level: 'advanced',
		topics: ['The situation in the Sahel', 'Maritime security'],
		position: 0
	});
	const bareId = await addCommittee(conference.id, {
		name: bareName,
		abbreviation: 'HRC',
		position: 1
	});

	// Four seats: one filled, one held for a delegation and two still free. The
	// chair is the organiser themselves, because an account is the only thing a
	// `committee_chairs` row can point at and this test has one to hand.
	const seatIds = await addSeats(readyId, ['France', 'Japan', 'Kenya', 'Peru']);
	const delegate = await createTestUser('Noor Haddad');
	const delegation = await addDelegation(conference.id);

	await fillSeat(seatIds.get('France') ?? '', delegate.id);
	await reserveSeat(seatIds.get('Japan') ?? '', delegation);
	await addChair(readyId, conference.user.id);

	await page.reload();

	const main = page.getByRole('main');

	// The header's subtitle counts both committees and every seat under them.
	await expect(main.getByText('2 committees · 4 seats')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// In `position` order: the Security Council was written first and comes
	// first. `[\s\S]*` means "anything in between", line breaks included.
	await expect(main).toHaveText(new RegExp(`${readyName}[\\s\\S]*${bareName}`));

	// A row's heading is the committee's full name, with its short name on the
	// quiet line under it. It is read as a heading rather than as text, because
	// the row's links name the committee as well.
	const readyHeading = main.getByRole('heading', { name: readyName, exact: true });

	await expect(readyHeading).toBeVisible();
	await expect(main.getByText('Advanced', { exact: true })).toBeVisible();

	// The row's cells. Each count carries its column's name for a reader who
	// cannot see the headings, which is what `\s*` allows between the two.
	// `has` looks inside each list item, so its locator starts from `page`
	// rather than from `main`, which the list item does not contain.
	const readyRow = main
		.getByRole('listitem')
		.filter({ has: page.getByRole('heading', { name: readyName, exact: true }) });

	await expect(readyRow).toContainText(/Topics:\s*2/);
	await expect(readyRow).toContainText(/Seats:\s*4/);

	// The warnings belong to the second committee and to it alone, which is why
	// each is counted rather than simply looked for: a page that drew "No seats"
	// on every row would pass a plain "is it visible". A committee with nobody
	// in the chair links to its editor to invite one.
	await expect(main.getByText('No seats')).toHaveCount(1);
	await expect(main.getByRole('link', { name: 'Invite a chair to' })).toHaveCount(1);
	await expect(main.getByRole('link', { name: `Invite a chair to ${bareName}` })).toBeVisible();

	// And the committee they belong to is the one with neither. Reading the
	// committee back is what says the page was told the truth rather than that
	// the two happen to agree.
	const bare = await readCommittee(conference.id, bareId);

	expect(bare.topics).toEqual([]);
	expect(await readSeats(bareId)).toEqual([]);
});

test('moves a committee one place, and the new order is still there after a refresh', async ({
	page
}) => {
	const conference = await openCommitteesPage(page, 'Reorder MUN');

	const firstName = unusedName('General Assembly');
	const secondName = unusedName('Security Council');
	const thirdName = unusedName('Economic and Social Council');

	await addCommittee(conference.id, { name: firstName, position: 0 });
	await addCommittee(conference.id, { name: secondName, position: 1 });
	await addCommittee(conference.id, { name: thirdName, position: 2 });

	await page.reload();

	const main = page.getByRole('main');

	await expect(main).toHaveText(
		new RegExp(`${firstName}[\\s\\S]*${secondName}[\\s\\S]*${thirdName}`),
		{ timeout: DATABASE_TIMEOUT_MS }
	);

	// Each arrow names the committee it belongs to, because "Move up" eight times
	// over tells a screen-reader user nothing about which row they are on. That
	// also means a test never has to count rows to find the right button.
	await main.getByRole('button', { name: `Move ${firstName} down` }).press('Enter');

	// Exactly one place: the first and the second have swapped and the third has
	// not moved. A "move to the bottom" would pass a test that only looked at
	// where the first committee ended up.
	await expect(main).toHaveText(
		new RegExp(`${secondName}[\\s\\S]*${firstName}[\\s\\S]*${thirdName}`),
		{ timeout: DATABASE_TIMEOUT_MS }
	);

	// The list above answers in place (T125): it shows the swap the moment the
	// press is sent, before the server has saved anything. Reading the database
	// straight after that would race the request, so this waits until nothing
	// on the page is still busy first.
	await waitUntilAnswered(page);

	// The database really holds the new order, which is what makes it survive a
	// refresh rather than being something the page did to itself.
	const afterMove = await readCommittees(conference.id);

	expect(afterMove.map((committee) => committee.name)).toEqual([secondName, firstName, thirdName]);

	await page.reload();

	await expect(main).toHaveText(
		new RegExp(`${secondName}[\\s\\S]*${firstName}[\\s\\S]*${thirdName}`),
		{ timeout: DATABASE_TIMEOUT_MS }
	);

	// And back up again, so that both arrows are shown to work.
	await main.getByRole('button', { name: `Move ${firstName} up` }).press('Enter');

	await expect(main).toHaveText(
		new RegExp(`${firstName}[\\s\\S]*${secondName}[\\s\\S]*${thirdName}`),
		{ timeout: DATABASE_TIMEOUT_MS }
	);
});

test('opens the editor of the committee whose Edit link was pressed', async ({ page }) => {
	const conference = await openCommitteesPage(page, 'Edit Link MUN');

	const firstName = unusedName('General Assembly');
	const secondName = unusedName('Security Council');

	await addCommittee(conference.id, { name: firstName, position: 0 });
	const secondId = await addCommittee(conference.id, {
		name: secondName,
		abbreviation: 'UNSC',
		position: 1
	});

	await page.reload();

	const main = page.getByRole('main');

	await expect(main.getByRole('link', { name: 'Edit' })).toHaveCount(2, {
		timeout: DATABASE_TIMEOUT_MS
	});

	// The second row's, so that a page linking every row to the same committee
	// fails here. A committee is named by its id in the management area, because
	// this is the very page where its slug is changed.
	await main.getByRole('link', { name: 'Edit' }).nth(1).click();

	await expect(page).toHaveURL(committeeEditorPath(conference, secondId), {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(main.getByLabel('Name', { exact: true })).toHaveValue(secondName);
});

test('opens the chair room of the committee whose "Chair room" was pressed', async ({ page }) => {
	const conference = await openCommitteesPage(page, 'Chair Room Link MUN');

	const secondSlug = `unsc-${crypto.randomUUID().slice(0, 8)}`;
	const secondName = unusedName('Security Council');

	await addCommittee(conference.id, { name: unusedName('General Assembly'), position: 0 });
	await addCommittee(conference.id, {
		name: secondName,
		abbreviation: 'UNSC',
		slug: secondSlug,
		position: 1
	});

	await page.reload();

	const main = page.getByRole('main');
	// Each row's link shows "Chair room" and is named "Open chair room of" its
	// committee, which is what a screen reader hears.
	const chairRoomLinks = main.getByRole('link', { name: 'Open chair room' });

	await expect(chairRoomLinks).toHaveCount(2, { timeout: DATABASE_TIMEOUT_MS });

	// The second row's, so that a page linking every row to the same room fails
	// here. The test conference's dates are long past, and the organiser still
	// gets in: the chair room opens on any day.
	await chairRoomLinks.nth(1).click();

	await expect(page).toHaveURL(`/conferences/${conference.slug}/committees/${secondSlug}/chair`, {
		timeout: DATABASE_TIMEOUT_MS
	});
	// With no session yet the room is its lobby, whose heading is the
	// committee's name; the top bar names it by its abbreviation, with the full
	// name as its title (`chair/committee-room.md`, "Top bar" and "Lobby").
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(secondName);
	await expect(page.getByRole('banner').getByTitle(secondName)).toContainText('UNSC');
});

test('warns that shared links stop working only in the editor of a saved committee', async ({
	page
}) => {
	const conference = await openCommitteesPage(page, 'Shared Link MUN');
	const committeeId = await addCommittee(conference.id, { name: unusedName('Security Council') });
	await publishConference(conference.id);

	const main = page.getByRole('main');
	const warning = main.getByText('Links shared earlier will stop working.');

	await page.goto(committeeEditorPath(conference, committeeId));
	await expect(main.getByLabel('Name', { exact: true })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(warning).toBeVisible();

	// A committee that is still being made has no link anybody could have shared.
	await page.goto(conference.newCommitteePath);
	await expect(main.getByRole('heading', { name: 'New committee' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(warning).toHaveCount(0);
});

test('answers a committee of another conference with a 404', async ({ page }) => {
	const conference = await openCommitteesPage(page, 'Wrong Address MUN');

	// A second conference run by the same organisation, so this reader is an
	// organiser of both. That is what makes the 404 below about the address and
	// nothing else: the committee exists and this person is allowed to see it,
	// only not here. `05-pages/organiser/committee-edit.md` asks for exactly that.
	const organizationId = await readOrganizationId(conference.slug);
	const other = await addConference(
		organizationId,
		conference.user.id,
		unusedName('Other Address MUN')
	);

	const committeeName = unusedName('General Assembly');
	const otherCommitteeId = await addCommittee(other.id, { name: committeeName });

	const response = await page.goto(committeeEditorPath(conference, otherCommitteeId));

	// A 404 and not a 403, for the reason `manage.spec.ts` gives about the pages
	// themselves: an answer must not tell anybody which conferences hold which
	// committees.
	expect(response?.status()).toBe(404);

	// And the same committee under its own conference's slug opens, which is what
	// says the 404 was about the pairing rather than about the committee.
	await page.goto(`/manage/${other.slug}/committees/${otherCommitteeId}`);

	await expect(page.getByRole('main').getByLabel('Name', { exact: true })).toHaveValue(
		committeeName,
		{ timeout: DATABASE_TIMEOUT_MS }
	);
});

test('answers somebody who posts to deleteCommittee for a conference they do not run', async ({
	page
}) => {
	const conference = await openCommitteesPage(page, 'Not Yours MUN');
	const committeeId = await addCommittee(conference.id, {
		name: unusedName('Security Council')
	});

	// A second account, signed in in place of the first. Clearing the cookies is
	// what ends the organiser's session; without that, `/login` would send an
	// account that is already signed in somewhere else.
	await page.context().clearCookies();

	const stranger = await createTestUser('Tomas Novak');
	await signIn(page, stranger);

	const response = await postFormAction(
		page,
		`${committeeEditorPath(conference, committeeId)}?/deleteCommittee`
	);

	// A 404 rather than a 403, for the reason `manage.spec.ts` gives about the
	// page itself: the answer must not tell a stranger which conferences exist.
	// The action asks `requirePermission` for itself rather than trusting the page
	// that drew the button, which is what
	// `specs/02-architecture/permissions.md` asks of every action.
	expect(response.status()).toBe(404);

	// And the refusal is the whole point, so the committee is exactly where it was.
	expect(await committeeExists(committeeId)).toBe(true);
});

test('shows the empty state to a conference with no committees yet', async ({ page }) => {
	await openCommitteesPage(page, 'No Committees MUN');

	const main = page.getByRole('main');

	// `EmptyState` draws its title as a heading, the way the dashboard's "No
	// applications yet." is read in `manage-dashboard.spec.ts`.
	await expect(main.getByRole('heading', { name: 'No committees yet.' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(
		main.getByText('Add the bodies your delegates will sit in, with their topics and seats.')
	).toBeVisible();

	// Two of them, and that is right: the page header carries one on every visit
	// and the empty state carries its own, so the one way out of an empty page is
	// wherever the reader's eye happens to be.
	await expect(main.getByRole('link', { name: 'Add committee' })).toHaveCount(2);
});

test('creates a committee through the form and opens its editor', async ({ page }) => {
	const conference = await openCommitteesPage(page, 'New Committee MUN');

	// The page header's button, which is the first of the two on an empty page:
	// the empty state draws one of its own, leading to the same form.
	await page.getByRole('main').getByRole('link', { name: 'Add committee' }).first().click();

	await expect(page).toHaveURL(conference.newCommitteePath, { timeout: DATABASE_TIMEOUT_MS });

	const main = page.getByRole('main');
	const committeeName = unusedName('Disarmament Committee');

	await fillCommitteeForm(main, {
		name: committeeName,
		abbreviation: 'DISEC',
		level: 'Beginner',
		firstTopic: 'Autonomous weapons'
	});

	// The two routes draw the same form with different words on its one button:
	// "Create committee" here, "Save changes" on the editor.
	await main.getByRole('button', { name: 'Create committee' }).press('Enter');

	// The flash floats above the page rather than inside `<main>`, which is why
	// this assertion is not scoped to it.
	await expect(page.getByText('Committee created. Now add its seats.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// A new committee lands on its own editor, which is where the seats are,
	// rather than back on the list. The id is a uuid nobody knew until now.
	await expect(page).toHaveURL(new RegExp(`${conference.committeesPath}/[0-9a-f-]{36}$`), {
		timeout: DATABASE_TIMEOUT_MS
	});

	const committees = await readCommittees(conference.id);

	expect(committees).toHaveLength(1);
	expect(committees[0]).toMatchObject({
		name: committeeName,
		abbreviation: 'DISEC',
		level: 'beginner',
		topics: ['Autonomous weapons']
	});

	// The link was left blank, so the page made one out of the name.
	expect(committees[0].slug).toMatch(/^[a-z0-9-]+$/);

	// `05-pages/organiser/committee-edit.md` also asks that creating a committee
	// creates its `committee_state` row. Nothing on the page does that: the
	// `create_committee_state` trigger added in T39 writes it as part of the same
	// insert, which is why this is read straight from the database rather than
	// looked for on the screen.
	expect(await readCommitteeState(committees[0].id)).toMatchObject({
		mode: 'idle',
		current_session_id: null
	});
});

test('adds, removes and saves topics in the order they are on the page', async ({ page }) => {
	const conference = await openCommitteesPage(page, 'Topics MUN');
	const committeeId = await addCommittee(conference.id, {
		name: unusedName('General Assembly'),
		topics: ['The first topic']
	});

	await page.goto(committeeEditorPath(conference, committeeId));

	const main = page.getByRole('main');

	// The numbered rows of `TopicsEditor`, each with a label of its own.
	await expect(main.getByLabel('Topic 1', { exact: true })).toHaveValue('The first topic', {
		timeout: DATABASE_TIMEOUT_MS
	});

	// "Add topic" posts to an action of its own, which answers the form with one
	// more empty row on it. That is what makes it work without JavaScript.
	await main.getByRole('button', { name: 'Add topic' }).press('Enter');
	await expect(main.getByLabel('Topic 2', { exact: true })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	await main.getByLabel('Topic 2', { exact: true }).fill('The second topic');

	await main.getByRole('button', { name: 'Add topic' }).press('Enter');
	await expect(main.getByLabel('Topic 3', { exact: true })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	await main.getByLabel('Topic 3', { exact: true }).fill('The third topic');

	// Away goes the middle one. Each row's button names its own row, because
	// "Remove" three times over says nothing about which topic it takes.
	await main.getByRole('button', { name: 'Remove topic 2' }).press('Enter');

	await expect(main.getByLabel('Topic 3', { exact: true })).toHaveCount(0, {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(main.getByLabel('Topic 2', { exact: true })).toHaveValue('The third topic');

	await main.getByRole('button', { name: 'Save changes' }).press('Enter');

	await expect(page.getByText('Committee saved.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// In order, and without the one that was removed. A `text[]` column keeps the
	// order it was written in, so this is the whole criterion in one line.
	const committee = await readCommittee(conference.id, committeeId);

	expect(committee.topics).toEqual(['The first topic', 'The third topic']);
});

test('shows the seats section as empty for a committee that has none yet', async ({ page }) => {
	const conference = await openCommitteesPage(page, 'No Seats Yet MUN');
	const committeeId = await addCommittee(conference.id, {
		name: unusedName('General Assembly')
	});

	await page.goto(committeeEditorPath(conference, committeeId));

	const main = page.getByRole('main');

	// `SeatsTable`'s own empty state, distinct from the committees list's "No
	// committees yet." above: this one is about one committee with nothing in
	// its Seats section yet, with the helper forms still drawn underneath it.
	await expect(main.getByRole('heading', { name: 'No seats yet.' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(
		main.getByText('Add the countries or characters delegates will represent.')
	).toBeVisible();
});

test('fills a committee with the UN member states, and adds none of them twice', async ({
	page
}) => {
	const conference = await openCommitteesPage(page, 'UN Seats MUN');
	const committeeId = await addCommittee(conference.id, {
		name: unusedName('General Assembly')
	});

	await page.goto(committeeEditorPath(conference, committeeId));

	const main = page.getByRole('main');

	await expect(main.getByRole('button', { name: 'Add UN member states' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	await main.getByRole('button', { name: 'Add UN member states' }).press('Enter');

	// The flash of `addSeats`, word for word from the spec. Both halves are
	// always named, the zero included, which is what says the second press did
	// nothing.
	await expect(
		page.getByText(`${UN_MEMBER_STATE_COUNT} seats added, 0 already existed.`)
	).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	const seats = await readSeats(committeeId);

	expect(seats).toHaveLength(UN_MEMBER_STATE_COUNT);

	// Every one of them is a country with a two-letter code on it, which is what
	// puts a flag beside the name. The codes are checked rather than the names,
	// because a name comes from `Intl.DisplayNames` and can read differently on
	// two machines, while a code never changes.
	for (const seat of seats) {
		expect(seat.kind).toBe('country');
		expect(seat.country_code).toMatch(/^[A-Z]{2}$/);
	}

	const codes = seats.map((seat) => seat.country_code);

	expect(codes).toContain('FR');
	expect(codes).toContain('NL');
	expect(codes).toContain('US');

	// They are in the list's own order, one after another, rather than all at
	// position zero. Counted from whatever the first one is, because appending to
	// an empty committee could reasonably start at nought or at one.
	const positions = seats.map((seat) => seat.position);
	const consecutive = positions.map((unused, index) => positions[0] + index);

	expect(positions).toEqual(consecutive);

	// Pressed a second time. Names already in the committee are skipped rather
	// than refused, so nothing is added and the flash says why.
	await main.getByRole('button', { name: 'Add UN member states' }).press('Enter');

	await expect(
		page.getByText(`0 seats added, ${UN_MEMBER_STATE_COUNT} already existed.`)
	).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	expect(await readSeats(committeeId)).toHaveLength(UN_MEMBER_STATE_COUNT);
});

test('turns pasted names into seats, skipping the ones already there', async ({ page }) => {
	const conference = await openCommitteesPage(page, 'Pasted Seats MUN');
	const committeeId = await addCommittee(conference.id, {
		name: unusedName('Crisis Committee')
	});

	await addSeats(committeeId, ['Minister of Defence']);

	await page.goto(committeeEditorPath(conference, committeeId));

	const main = page.getByRole('main');

	// Five lines, of which one is already a seat, one is blank and one is the
	// same name twice, so three new seats come out of it.
	const pasted = [
		'Minister of Defence',
		'Minister of Finance',
		'',
		'Minister of Justice',
		'Minister of Finance',
		'Head of the Central Bank'
	].join('\n');

	// The box is folded away under its own "Paste names" toggle, an HTML
	// `<details>`, so it is opened first. The toggle is found as a `summary`
	// because it has no role of its own, and its words are the box's label too.
	await main.locator('summary').filter({ hasText: 'Paste names' }).click();
	await main.getByLabel('Paste names', { exact: true }).fill(pasted);
	await main.getByRole('button', { name: 'Add seats', exact: true }).press('Enter');

	await expect(page.getByText('3 seats added, 1 already existed.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	const seats = await readSeats(committeeId);

	expect(seats.map((seat) => seat.name)).toEqual([
		'Minister of Defence',
		'Minister of Finance',
		'Minister of Justice',
		'Head of the Central Bank'
	]);

	// None of these is a country, so none of them carries a code.
	for (const seat of seats.slice(1)) {
		expect(seat.kind).toBe('other');
		expect(seat.country_code).toBeNull();
	}

	// And the cap. One line over the limit is posted rather than typed: filling a
	// textarea with three hundred lines is slow, and what is being asked here is
	// what the action says rather than what the box holds.
	const tooManyNames = Array.from(
		{ length: PASTED_SEAT_LIMIT + 1 },
		(unused, index) => `Delegate ${index}`
	).join('\n');

	const refused = await postFormAction(
		page,
		`${committeeEditorPath(conference, committeeId)}?/addSeats`,
		{ source: 'list', names: tooManyNames }
	);

	expect(refused.status()).toBe(400);
	expect(await refused.text()).toContain(
		`Please add at most ${PASTED_SEAT_LIMIT} seats at a time.`
	);

	// Nothing of that paste was written: a refusal adds no seats at all rather
	// than the first three hundred of them.
	expect(await readSeats(committeeId)).toHaveLength(4);
});

test('adds one seat by hand, and refuses an empty name or one already taken', async ({ page }) => {
	const conference = await openCommitteesPage(page, 'One Seat MUN');
	const committeeId = await addCommittee(conference.id, {
		name: unusedName('Historical Crisis')
	});

	await page.goto(committeeEditorPath(conference, committeeId));

	const main = page.getByRole('main');

	// The single-seat form's own box. It is "Seat name" rather than "Name"
	// because the committee form above it already has a "Name".
	await main.getByLabel('Seat name', { exact: true }).fill('Atlantis');
	await main.getByRole('button', { name: 'Add seat', exact: true }).press('Enter');

	await expect(page.getByText('Seat added.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	const seat = await readSeat(committeeId, 'Atlantis');

	expect(seat.user_id).toBeNull();
	expect(seat.is_available).toBe(true);

	// The two refusals are posted rather than typed, because the name box is
	// `required` and a browser will not send an empty one at all — which is the
	// right behaviour, and is also why the server's own answer can only be seen
	// by asking it directly.
	const action = `${committeeEditorPath(conference, committeeId)}?/addSeat`;

	const withNoName = await postFormAction(page, action, { seatName: '', kind: 'other' });

	expect(withNoName.status()).toBe(400);
	expect(await withNoName.text()).toContain('Please enter a seat name.');

	const withTheSameName = await postFormAction(page, action, {
		seatName: 'Atlantis',
		kind: 'other'
	});

	expect(withTheSameName.status()).toBe(400);
	expect(await withTheSameName.text()).toContain(
		'This committee already has a seat called Atlantis.'
	);

	// Neither of them wrote anything: there is still one seat, the first one.
	expect(await readSeats(committeeId)).toHaveLength(1);
});

// T142: with JavaScript "Hide" changes the seat the moment it is pressed,
// before the server has answered and with no spinner, and a press the server
// refuses goes back and says what did not happen.
test('hides a seat at once, and puts a refused delete back', async ({ page }, testInfo) => {
	skipWithoutJavaScript(testInfo);

	const conference = await openCommitteesPage(page, 'Instant Seats MUN');
	const committeeId = await addCommittee(conference.id, {
		name: unusedName('General Assembly')
	});

	await addSeats(committeeId, ['Argentina', 'Belgium']);
	await page.goto(committeeEditorPath(conference, committeeId));

	const main = page.getByRole('main');
	await expect(main.getByText('2 seats · 0 filled')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	await answerSlowly(page, 'hideSeat');
	await watchForSpinners(page);
	await main.getByRole('button', { name: 'Hide Argentina' }).press('Enter');

	await expect(main.getByRole('button', { name: 'Show Argentina' })).toBeVisible({
		timeout: AT_ONCE_TIMEOUT_MS
	});

	await waitUntilAnswered(page);
	expect(await sawSpinner(page)).toBe(false);
	expect((await readSeat(committeeId, 'Argentina')).is_available).toBe(false);

	await answerWithError(page, 'deleteSeat');
	await main.getByRole('button', { name: 'Delete Belgium' }).press('Enter');

	await expect(page.getByRole('alert')).toContainText('The seat was not deleted.', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(page);
	await expect(main.getByRole('button', { name: 'Delete Belgium' })).toBeVisible();
	expect(await readSeats(committeeId)).toHaveLength(2);
});

test('hides, shows, moves and deletes a seat nobody is sitting in', async ({ page }) => {
	const conference = await openCommitteesPage(page, 'Free Seats MUN');
	const committeeId = await addCommittee(conference.id, {
		name: unusedName('General Assembly')
	});

	await addSeats(committeeId, ['Argentina', 'Belgium', 'Chile']);

	await page.goto(committeeEditorPath(conference, committeeId));

	const main = page.getByRole('main');

	// The count at the end of the line under the "Seats" heading, which is the
	// one place on the page a seat's name is *not* written: every button in a row
	// names its own seat, so "Argentina" as plain text would match five things at
	// once.
	await expect(main.getByText('3 seats · 0 filled')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// Hiding a seat is how an organiser stops offering it without losing its
	// place in the list, so the row stays and its button becomes "Show".
	await main.getByRole('button', { name: 'Hide Argentina' }).press('Enter');

	await expect(async () => {
		const seat = await readSeat(committeeId, 'Argentina');

		expect(seat.is_available).toBe(false);
	}).toPass({ timeout: DATABASE_TIMEOUT_MS });

	// `toPass` reads the database directly, over its own connection, so it can
	// see a row the moment the server writes it — before that same press's
	// answer has come back and the page has read its data again. Since T142 the
	// row's buttons change the screen at once and queue their presses, so
	// waiting here ties each step to the one before it actually finishing, not
	// to the database alone.
	await waitUntilAnswered(page);
	await expect(main.getByRole('button', { name: 'Show Argentina' })).toBeVisible();

	await main.getByRole('button', { name: 'Show Argentina' }).press('Enter');

	await expect(async () => {
		const seat = await readSeat(committeeId, 'Argentina');

		expect(seat.is_available).toBe(true);
	}).toPass({ timeout: DATABASE_TIMEOUT_MS });

	await waitUntilAnswered(page);

	// One place down, the same way a committee moves on the list page.
	await main.getByRole('button', { name: 'Move Argentina down' }).press('Enter');

	await expect(async () => {
		const seats = await readSeats(committeeId);

		expect(seats.map((seat) => seat.name)).toEqual(['Belgium', 'Argentina', 'Chile']);
	}).toPass({ timeout: DATABASE_TIMEOUT_MS });

	await waitUntilAnswered(page);

	// And away. A seat's Delete is a plain button with no question in front of
	// it: putting a seat back is one press of "Add seat", and the one thing on
	// this page that cannot be undone is "Delete committee", which keeps its
	// `ConfirmButton`.
	await main.getByRole('button', { name: 'Delete Argentina' }).press('Enter');

	await expect(async () => {
		const seats = await readSeats(committeeId);

		expect(seats.map((seat) => seat.name)).toEqual(['Belgium', 'Chile']);
	}).toPass({ timeout: DATABASE_TIMEOUT_MS });
});

test('refuses to hide or delete a seat that is filled or reserved', async ({ page }) => {
	const conference = await openCommitteesPage(page, 'Taken Seats MUN');
	const committeeId = await addCommittee(conference.id, {
		name: unusedName('Security Council')
	});

	const seatIds = await addSeats(committeeId, ['France', 'Japan']);
	const filledSeatId = seatIds.get('France') ?? '';
	const reservedSeatId = seatIds.get('Japan') ?? '';

	const delegate = await createTestUser('Mateo Rossi');
	const delegation = await addDelegation(conference.id);

	await fillSeat(filledSeatId, delegate.id);
	await reserveSeat(reservedSeatId, delegation);

	await page.goto(committeeEditorPath(conference, committeeId));

	const main = page.getByRole('main');

	// The delegate's name is in the row's "Held by" cell, which is what the page
	// file asks a filled seat to show. The count line is what says the page has
	// arrived.
	await expect(main.getByText('2 seats · 1 filled')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(main.getByText(delegate.fullName, { exact: true })).toBeVisible();

	// Neither seat offers a way to hide it or take it away, which is what
	// `05-pages/organiser/committee-edit.md` asks of a seat somebody is in or a
	// school is holding: freeing it is the allocation page's work (T28).
	await expect(main.getByRole('button', { name: 'Hide France' })).toHaveCount(0);
	await expect(main.getByRole('button', { name: 'Delete France' })).toHaveCount(0);
	await expect(main.getByRole('button', { name: 'Hide Japan' })).toHaveCount(0);
	await expect(main.getByRole('button', { name: 'Delete Japan' })).toHaveCount(0);

	const editorPath = committeeEditorPath(conference, committeeId);

	// The two actions are posted to rather than pressed, because there is now no
	// button to press — and they still have to refuse. A button that is not drawn
	// is not a rule: the seat may have been filled since the page was drawn, and a
	// form action is its own request. `manage-dashboard.spec.ts` asks its actions
	// directly for the same reason.
	for (const seatId of [filledSeatId, reservedSeatId]) {
		const hidden = await postFormAction(page, `${editorPath}?/hideSeat`, { seatId });

		expect(hidden.status()).toBe(400);
		expect(await hidden.text()).toContain('Free the seat first.');

		const deleted = await postFormAction(page, `${editorPath}?/deleteSeat`, { seatId });

		expect(deleted.status()).toBe(400);
		expect(await deleted.text()).toContain(
			'You cannot delete a seat that is filled or reserved. Free it on the allocation page first.'
		);
	}

	// Both seats are exactly as they were: still there, still offered, and still
	// held by the person and the delegation they were held by.
	const seats = await readSeats(committeeId);

	expect(seats).toHaveLength(2);

	const filled = await readSeat(committeeId, 'France');
	const reserved = await readSeat(committeeId, 'Japan');

	expect(filled.is_available).toBe(true);
	expect(filled.user_id).toBe(delegate.id);
	expect(reserved.is_available).toBe(true);
	expect(reserved.delegation_id).toBe(delegation);
});

test('refuses a link another committee of the conference already uses', async ({ page }) => {
	const conference = await openCommitteesPage(page, 'Slug Clash MUN');

	await addCommittee(conference.id, {
		name: unusedName('Security Council'),
		slug: 'security-council',
		position: 0
	});

	const secondId = await addCommittee(conference.id, {
		name: unusedName('General Assembly'),
		slug: 'general-assembly',
		position: 1
	});

	await page.goto(committeeEditorPath(conference, secondId));

	const main = page.getByRole('main');

	// The slug is labelled "Link" on this form, because that is what it is to the
	// organiser: the last part of the committee's public address.
	await expect(main.getByLabel('Link', { exact: true })).toHaveValue('general-assembly', {
		timeout: DATABASE_TIMEOUT_MS
	});

	await main.getByLabel('Link', { exact: true }).fill('security-council');
	await main.getByRole('button', { name: 'Save changes' }).press('Enter');

	await expect(main.getByText('Another committee already uses this link.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// Nothing was saved, so the committee still answers to its own link.
	expect((await readCommittee(conference.id, secondId)).slug).toBe('general-assembly');

	// And its own link is not a clash with itself: saving the form untouched is
	// allowed, which is the half of the rule a naive "is this slug taken" breaks.
	await main.getByLabel('Link', { exact: true }).fill('general-assembly');
	await main.getByRole('button', { name: 'Save changes' }).press('Enter');

	await expect(page.getByText('Committee saved.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
});

test('refuses to delete a committee with a delegate in it, and deletes it once it is empty', async ({
	page
}) => {
	const conference = await openCommitteesPage(page, 'Delete Committee MUN');
	const committeeName = unusedName('Security Council');
	const committeeId = await addCommittee(conference.id, { name: committeeName });

	const seatIds = await addSeats(committeeId, ['France']);
	const seatId = seatIds.get('France') ?? '';
	const delegate = await createTestUser('Aiko Tanaka');

	await fillSeat(seatId, delegate.id);

	await page.goto(committeeEditorPath(conference, committeeId));

	const main = page.getByRole('main');

	await expect(main.getByRole('button', { name: 'Delete committee' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	await pressAndConfirm(page, 'Delete committee');

	await expect(
		page.getByText(
			'You cannot delete a committee while a seat in it is filled or reserved. Free its seats on the allocation page first.'
		)
	).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// The refusal is the whole point, so the committee and its seat are still
	// there. The rule is the `committees` delete policy itself, which asks
	// `committee_has_delegates`, and not only something the page says.
	expect(await committeeExists(committeeId)).toBe(true);

	// Freeing the seat is the allocation page's work, which is T28, so the
	// service-role client stands in for it.
	await freeSeat(seatId);

	/* A fresh `goto` and not `page.reload()`. The refusal above came back from a
	   POST, so on the `desktop-no-js` project reloading re-sends that same POST —
	   and with the seat now free it would succeed, delete the committee and land
	   on the list, leaving nothing here to press. */
	await page.goto(committeeEditorPath(conference, committeeId));

	await pressAndConfirm(page, 'Delete committee');

	// Back to the list: the page this was on has stopped existing.
	await expect(page).toHaveURL(conference.committeesPath, { timeout: DATABASE_TIMEOUT_MS });
	await expect(page.getByText('Committee deleted.')).toBeVisible();

	expect(await committeeExists(committeeId)).toBe(false);

	// The seat went with it, which is what `on delete cascade` on
	// `seats.committee_id` does and why a filled committee may not be deleted.
	expect(await readSeats(committeeId)).toEqual([]);
});

test('answers every field that needs fixing at once, rather than one per attempt', async ({
	page
}) => {
	const conference = await openCommitteesPage(page, 'All Errors MUN');

	// Published, because one of the rules only exists on a published conference:
	// a draft committee is still being written, and only a public one is told it
	// needs a topic.
	await publishConference(conference.id);

	// Every field wrong at once. It is posted rather than typed, because the name
	// is `required`, the speaking time is a `number` box with a `min` and a `max`
	// and the level is a radio group, so a browser refuses to send several of
	// these at all — which is the right behaviour, and is also why the server's
	// own answer can only be seen by asking it directly.
	const response = await postFormAction(page, `${conference.newCommitteePath}?/save`, {
		name: '',
		abbreviation: 'ABBREVIATION!',
		slug: 'Not A Slug',
		// One character over each of the two limits. Both boxes carry a `maxlength`
		// as well, so a browser stops at the limit and the server's answer can only
		// be seen by posting past it.
		description: 'x'.repeat(4001),
		level: '',
		room: 'x'.repeat(61),
		defaultSpeakingTimeSeconds: '10',
		'topics[]': ''
	});

	expect(response.status()).toBe(400);

	const answer = await response.text();

	/*
		Every one of them, on the one page. That is the criterion: eight things to
		fix, said once, rather than eight attempts each ending in one sentence.

		The one message of the spec's table that cannot be here is "Another
		committee already uses this link." A link is either the wrong shape or
		taken, never both, so `checkSlug` in `$lib/committee-details.ts` has one
		thing to say about it; the shape is the half this post carries and the
		clash has a test of its own above.
	*/
	const everyMessage = [
		"Please enter the committee's name.",
		'Please keep the abbreviation under 12 characters.',
		'Please use only lowercase letters, digits and hyphens.',
		'Please keep the description under 4000 characters.',
		'Please pick a level.',
		'Please keep the room under 60 characters.',
		'Please enter a speaking time between 30 and 600 seconds.',
		'Please add at least one topic.'
	];

	for (const message of everyMessage) {
		expect(answer).toContain(message);
	}

	// Nothing was saved: the conference still has no committees at all.
	expect(await readCommittees(conference.id)).toEqual([]);
});

test('neither page spills off the side of a phone screen', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	// Long names on purpose. A line that may not wrap is as wide as its text
	// however narrow its column is, which is what pushes a page sideways, and a
	// short name would never show it.
	const conference = await openCommitteesPage(
		page,
		'Phone Committees International Model United Nations Conference'
	);

	const committeeId = await addCommittee(conference.id, {
		name: 'United Nations Educational, Scientific and Cultural Organization',
		abbreviation: 'UNESCO',
		level: 'advanced',
		topics: [
			'The protection of cultural heritage in areas of armed conflict',
			'Access to education for displaced and stateless children'
		]
	});

	await addSeats(committeeId, [
		'The Bolivarian Republic of Venezuela',
		'The Democratic Republic of the Congo',
		'The United Kingdom of Great Britain and Northern Ireland'
	]);

	await page.reload();

	const main = page.getByRole('main');

	// Wait for the page to be the one this test is about before measuring it. The
	// row's heading is read rather than the committee's name as text, because the
	// name is also in the words of that row's links.
	await expect(
		main.getByRole('heading', {
			name: 'United Nations Educational, Scientific and Cultural Organization',
			exact: true
		})
	).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	await expectNoSidewaysOverflow(page);

	// And the editor, whose seat rows are the widest thing either page draws: a
	// long name beside five buttons.
	await page.goto(committeeEditorPath(conference, committeeId));

	await expect(main.getByText('3 seats · 0 filled')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	await expectNoSidewaysOverflow(page);
});

test('both pages fit in a few screens', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough to measure a height.');

	const conference = await openCommitteesPage(page, 'Height Check Committees MUN');

	// A list with something on it: four committees, which is what a small
	// conference runs, each with topics so that no row is a bare line.
	const committees = [
		{ name: 'General Assembly', abbreviation: 'GA' },
		{ name: 'Security Council', abbreviation: 'UNSC' },
		{ name: 'Economic and Social Council', abbreviation: 'ECOSOC' },
		{ name: 'Human Rights Council', abbreviation: 'HRC' }
	];
	let firstCommitteeId = '';

	for (const [index, committee] of committees.entries()) {
		const committeeId = await addCommittee(conference.id, {
			name: unusedName(committee.name),
			abbreviation: committee.abbreviation,
			topics: ['The first topic', 'The second topic'],
			position: index
		});

		if (index === 0) {
			firstCommitteeId = committeeId;
		}
	}

	// Fifteen seats in the first one: the size of the Security Council, and of
	// the committee in the page file's own wireframe.
	await addSeats(
		firstCommitteeId,
		Array.from({ length: 15 }, (unused, index) => `Member state ${index + 1}`)
	);

	await page.reload();

	const main = page.getByRole('main');

	await expect(main.getByText('No seats')).toHaveCount(3, { timeout: DATABASE_TIMEOUT_MS });

	// Saved before the assertion, so that a failure leaves a picture of the page
	// that failed it.
	await saveFullPageScreenshot(page, 'manage-committees');
	await expectPageFitsInScreens(page, COMMITTEES_LIST_SCREENS);

	// And the editor, with the same fifteen seats on it. A seat's name is in the
	// words on each of its five buttons as well as in the row itself, so the
	// count line under the "Seats" heading is what this waits for.
	await page.goto(committeeEditorPath(conference, firstCommitteeId));

	await expect(main.getByText('15 seats · 0 filled')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	await saveFullPageScreenshot(page, 'manage-committee-edit');
	await expectPageFitsInScreens(page, COMMITTEE_EDITOR_SCREENS);
});
