import { expect, test, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	expectNoSidewaysOverflow,
	expectPageFitsInScreens,
	saveFullPageScreenshot
} from './page-shape';
import { createTestUser, giveApplication, signIn, type TestUser } from './signed-in-user';
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

// The acceptance criteria of `specs/05-pages/delegate/application.md` that need
// a real browser, for the page task T24 builds at
// `/applications/[applicationId]`:
//
// * only the applicant can open it, and anybody else gets a 404;
// * every status shows its own badge and its own sentence, word for word;
// * the organisers' decision note is shown when they wrote one;
// * "Edit application" is offered while the application is a draft or has been
//   submitted and the window is still open, and not otherwise;
// * "Withdraw application" is offered for a submitted and a waitlisted
//   application only, and asks before it does anything;
// * an accepted application leads to the committee the delegate sits in;
// * the answers list carries every custom question with its label and the
//   answer that was given;
// * the page does not spill off a phone screen or run on for screens on a
//   desktop.
//
// Two ways out of this page lead to `/applications`, the list of everything
// somebody has applied to: the "← Applications" link above the title and the
// "Delete draft" button, which `application.md` says lands there. Both are
// followed here as far as that list's address and heading. What the list itself
// shows is `tests/e2e/applications.spec.ts`.
//
// The invoice half of the sixth criterion — "and the invoice when one exists" —
// needs a fee and an invoice, which is T17's and T18's ground. An accepted
// application with no fee shows no invoice line at all, which is the state
// every application here is in.
//
// How an application is filled in and sent in the first place is
// `tests/e2e/apply.spec.ts`; the badge the public conference page shows about
// it is `tests/e2e/conference-page.spec.ts`.
//
// EVERY BUTTON WITHOUT JAVASCRIPT
// These tests run on the `desktop-no-js` project like every other browser test.
// "Edit application" is a plain link and "Withdraw application" is a
// `ConfirmButton`, which opens a confirmation page asking the same question
// when there is no script to open its dialog; `pressAndConfirm` below waits to
// see which of the two happened rather than assuming one. The two tests that
// ask the browser for its own dimensions each run on one project alone.
//
// WHAT THESE TESTS LEAVE BEHIND
// Every conference here is made by `createTestConference` and taken away again
// in a `finally`, which takes its committees, its questions, its seats and its
// applications with it. The accounts stay until the next `pnpm db:reset`, as
// they do everywhere else. Nothing here touches `supabase/seed.sql`.
//
// `createTestConference` and `pressAndConfirm` below are copies of the ones in
// `tests/e2e/apply.spec.ts` and `tests/e2e/manage-application-form.spec.ts`,
// deliberately rather than shared imports, for the reason those files give
// about their own copies: each wants its own conference and its own fields.

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

/** The organisation `supabase/seed.sql` makes, which these conferences go in. */
const SAMPLE_ORGANIZATION_ID = '10000000-0000-4000-8000-000000000001';

/**
 * The days a conference made here runs on.
 *
 * Both are in the past, for the reason `tests/e2e/conferences.spec.ts` gives
 * about the conferences its database tests leave behind: `/conferences` lists
 * conferences that are published *and* have not finished, and that file counts
 * what is in the directory, so a conference dated this way disturbs nothing
 * there.
 */
const CONFERENCE_FIRST_DAY = '2020-05-03';
const CONFERENCE_LAST_DAY = '2020-05-05';

/** A day and three months in milliseconds, for arranging an application window. */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const THREE_MONTHS_MS = 90 * ONE_DAY_MS;

/**
 * How many windows tall the application page may be on a desktop.
 *
 * Three, as the conference dashboard, the details editor, the committees list
 * and the fees page are all held to. It is a ceiling and not a target.
 */
const APPLICATION_PAGE_SCREENS = 3;

/**
 * The sentence each status puts in the status card, from the Components section
 * of `05-pages/delegate/application.md`.
 *
 * Written out rather than built, so that a change of wording is a change here
 * as well as in the page and somebody has to mean it. `accepted` is left out:
 * its sentence names the seat and the committee, so it is written where the
 * seat is.
 */
const STATUS_SENTENCES = {
	draft: 'You have not submitted this application yet.',
	submitted: 'The organisers are reviewing your application.',
	waitlisted: 'You are on the waiting list. We will tell you as soon as a seat opens.',
	rejected: 'The organisers could not accept your application this time.',
	withdrawn: 'You withdrew this application.'
};

/**
 * The words `$lib/status.ts` gives each of those statuses, which is what the
 * badge says. They are not the database's own words: `submitted` reads "Under
 * review" and `rejected` reads "Not accepted".
 */
const STATUS_BADGES = {
	draft: 'Draft',
	submitted: 'Under review',
	waitlisted: 'Waitlisted',
	rejected: 'Not accepted',
	withdrawn: 'Withdrawn'
};

/** A name nothing else in the database will match. */
function unusedName(prefix: string): string {
	return `${prefix} ${crypto.randomUUID().slice(0, 8)}`;
}

/** One custom question to put on the conference's form. */
type NewQuestion = {
	label: string;
	type: 'short_text' | 'long_text' | 'single_choice' | 'multiple_choice' | 'checkbox';
	options?: string[];
};

/** One committee of a test conference, as the tests below need to name it. */
type TestCommittee = {
	id: string;
	slug: string;
	name: string;
};

/** What a test wants its conference to be. Everything else is filled in. */
type ConferenceSeed = {
	/** One committee per name, in this order. */
	committeeNames?: string[];
	committeePreferenceCount?: number;
	questions?: NewQuestion[];
	/**
	 * Whether applications are still open.
	 *
	 * `true` by default. The one test that passes `false` is the one about
	 * "Edit application" disappearing once the window has shut.
	 */
	isWindowOpen?: boolean;
};

/** A conference a test has to itself, with everything it needs to be applied to. */
type TestConference = {
	id: string;
	slug: string;
	name: string;
	committees: TestCommittee[];
	/** The question ids, in the order `questions` asked for them. */
	questionIds: string[];
};

/**
 * Make a published conference, its committees and its questions.
 *
 * Everything is written with the service-role client, the way
 * `tests/e2e/conference-page.spec.ts` writes the draft conference it previews:
 * `conferences` has no insert policy that would let a test account make one
 * inside somebody else's organisation, and making one is not what this file is
 * about.
 */
async function createTestConference(seed: ConferenceSeed = {}): Promise<TestConference> {
	const admin = createServiceRoleClient();
	const name = unusedName('Application Test MUN');
	const slug = `e2e-application-${crypto.randomUUID()}`;
	const now = Date.now();
	const isWindowOpen = seed.isWindowOpen ?? true;

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
			status: 'published',
			applications_open_at: new Date(now - THREE_MONTHS_MS).toISOString(),
			applications_close_at: new Date(
				isWindowOpen ? now + THREE_MONTHS_MS : now - ONE_DAY_MS
			).toISOString(),
			committee_preference_count: seed.committeePreferenceCount ?? 1,
			organization_id: SAMPLE_ORGANIZATION_ID
		})
		.select('id')
		.single();

	if (error || !conference) {
		throw new Error(`Could not create the test conference: ${error?.message}`);
	}

	const committees = await addCommittees(conference.id, seed.committeeNames ?? []);
	const questionIds = await addQuestions(conference.id, seed.questions ?? []);

	return { id: conference.id, slug, name, committees, questionIds };
}

/** The committees of one test conference, in the order they were asked for. */
async function addCommittees(conferenceId: string, names: string[]): Promise<TestCommittee[]> {
	if (names.length === 0) {
		return [];
	}

	const admin = createServiceRoleClient();

	// The names here are short ones such as "UNSC", so the abbreviation is the
	// name over again. The sentence an accepted application shows names the
	// committee, and this way it reads the same whichever of the two the page
	// chose.
	const rows = names.map((name, index) => ({
		conference_id: conferenceId,
		name,
		abbreviation: name,
		slug: `committee-${crypto.randomUUID().slice(0, 8)}`,
		level: 'intermediate' as const,
		topics: [],
		position: index
	}));

	const { data, error } = await admin
		.from('committees')
		.insert(rows)
		.select('id, slug, name, position');

	if (error || !data) {
		throw new Error(`Could not create the test committees: ${error?.message}`);
	}

	// Supabase answers an insert in whatever order it likes, so the rows are put
	// back into the order they were asked for.
	return [...data]
		.sort((one, other) => one.position - other.position)
		.map((row) => ({ id: row.id, slug: row.slug, name: row.name }));
}

/** The custom questions of one test conference, in the order they were asked for. */
async function addQuestions(conferenceId: string, questions: NewQuestion[]): Promise<string[]> {
	if (questions.length === 0) {
		return [];
	}

	const admin = createServiceRoleClient();

	const rows = questions.map((question, index) => ({
		conference_id: conferenceId,
		label: question.label,
		type: question.type,
		options: question.options ?? [],
		is_required: false,
		position: index
	}));

	const { data, error } = await admin
		.from('application_questions')
		.insert(rows)
		.select('id, position');

	if (error || !data) {
		throw new Error(`Could not create the test questions: ${error?.message}`);
	}

	return [...data].sort((one, other) => one.position - other.position).map((row) => row.id);
}

/**
 * Take a test conference away again, with everything hanging off it.
 *
 * Committees, questions, seats and applications all carry `on delete cascade`
 * from their conference, so deleting the conference is enough.
 */
async function deleteTestConference(conferenceId: string): Promise<void> {
	await createServiceRoleClient().from('conferences').delete().eq('id', conferenceId);
}

/**
 * Sit somebody in a named seat, as the seat an accepted application won.
 *
 * Allocation is T16's work and has no form yet, so the service-role client
 * writes the row the way that task one day will. `application_id` is the link
 * the application page follows to find the seat, and `check_seat_allocation`
 * insists the application it names belongs to this same conference.
 */
async function giveSeatForApplication(
	user: TestUser,
	committeeId: string,
	applicationId: string,
	seatName: string
): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin.from('seats').insert({
		committee_id: committeeId,
		name: seatName,
		user_id: user.id,
		application_id: applicationId,
		allocated_at: new Date().toISOString()
	});

	if (error) {
		throw new Error(`Could not give the test account the ${seatName} seat: ${error.message}`);
	}
}

/** The status of one application, read straight from the table. */
async function readApplicationStatus(applicationId: string): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('applications')
		.select('status')
		.eq('id', applicationId)
		.maybeSingle();

	if (error || !data) {
		throw new Error(`Could not read the test application: ${error?.message}`);
	}

	return data.status;
}

/**
 * Whether one application is still in the table.
 *
 * Read with the service-role client, because once a draft is deleted there is
 * nothing left for Row Level Security to show its owner either way.
 */
async function isApplicationStored(applicationId: string): Promise<boolean> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('applications')
		.select('id')
		.eq('id', applicationId)
		.maybeSingle();

	if (error) {
		throw new Error(`Could not look for the test application: ${error.message}`);
	}

	return data !== null;
}

/** The `/applications/<id>` address of one application. */
function applicationPath(applicationId: string): string {
	return `/applications/${applicationId}`;
}

/**
 * Open one application's page and wait until it has really arrived.
 *
 * The title is what says the page is there rather than the address, because the
 * address is right the moment the browser asks for it and the page arrives
 * afterwards.
 */
async function openTheApplication(page: Page, applicationId: string): Promise<void> {
	await page.goto(applicationPath(applicationId));

	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
		'Your application',
		{ timeout: DATABASE_TIMEOUT_MS }
	);
}

/**
 * Press a `ConfirmButton` and answer the question it asks.
 *
 * A copy of the one in `tests/e2e/manage-application-form.spec.ts`. With
 * JavaScript the press opens a `<dialog>` and the dialog's own button is what
 * submits. Without it — which is the `desktop-no-js` project, and also any page
 * whose script has not landed yet — the press opens a confirmation page asking
 * the same question, whose own button is what submits. Both are the right
 * behaviour, so this waits to see which of the two happened rather than
 * assuming one.
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

/*
	Every test here makes at least one conference, seeds an application and signs
	a brand-new account in. That is more than most browser tests do, and thirty
	seconds — what Playwright allows a test by default — is not always enough for
	it while the whole suite is asking the one local database at once.
	`test.slow()` triples that allowance.
*/
test.beforeEach(() => {
	test.slow();
});

test('is a 404 for everybody but the applicant', async ({ page }) => {
	const conference = await createTestConference({ committeeNames: ['UNSC'] });

	try {
		const applicant = await createTestUser('Noor Haddad');
		const applicationId = await giveApplication(applicant, {
			conferenceId: conference.id,
			status: 'submitted',
			committeePreferences: [conference.committees[0].id],
			motivation: 'I have chaired twice and would like a seat on the Security Council.'
		});

		// Somebody else entirely, signed in and with an account of their own. The
		// row is readable by its applicant alone, so the page has nothing to show
		// and says so with a 404 rather than with a sign in prompt.
		const stranger = await createTestUser('Priya Nair');
		await signIn(page, stranger);

		const response = await page.goto(applicationPath(applicationId));

		expect(response?.status()).toBe(404);
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('shows every status with its own badge and its own sentence', async ({ page }) => {
	// One conference per status: `applications` holds one row per person per
	// conference, so the same account cannot be in two states at once.
	const statuses = ['draft', 'submitted', 'waitlisted', 'rejected', 'withdrawn'] as const;
	const conferences = await Promise.all(
		statuses.map(() => createTestConference({ committeeNames: ['UNSC'] }))
	);

	try {
		const applicant = await createTestUser('Noor Haddad');
		await signIn(page, applicant);

		for (const [index, status] of statuses.entries()) {
			const conference = conferences[index];
			const applicationId = await giveApplication(applicant, {
				conferenceId: conference.id,
				status,
				committeePreferences: [conference.committees[0].id],
				motivation: 'I have chaired twice and would like a seat on the Security Council.'
			});

			await openTheApplication(page, applicationId);

			const main = page.getByRole('main');

			// `exact` matches the whole badge rather than a part of it, which is how
			// "Draft" is told apart from a sentence that has the word in it.
			await expect(main.getByText(STATUS_BADGES[status], { exact: true }).first()).toBeVisible();
			await expect(main.getByText(STATUS_SENTENCES[status]).first()).toBeVisible();
		}
	} finally {
		for (const conference of conferences) {
			await deleteTestConference(conference.id);
		}
	}
});

test('names the seat an accepted application won, and leads to that committee', async ({
	page
}) => {
	const conference = await createTestConference({ committeeNames: ['UNSC'] });

	try {
		const applicant = await createTestUser('Noor Haddad');
		const applicationId = await giveApplication(applicant, {
			conferenceId: conference.id,
			status: 'accepted',
			committeePreferences: [conference.committees[0].id],
			motivation: 'I have chaired twice and would like a seat on the Security Council.',
			decisionNote: 'Welcome. See you in February.'
		});

		await giveSeatForApplication(applicant, conference.committees[0].id, applicationId, 'France');

		await signIn(page, applicant);
		await openTheApplication(page, applicationId);

		const main = page.getByRole('main');

		await expect(main.getByText('Accepted', { exact: true }).first()).toBeVisible();
		await expect(
			main.getByText('You were accepted and represent France in UNSC.').first()
		).toBeVisible();

		// The note the organisers wrote to the applicant, which is the only one of
		// the two notes on an application that the applicant ever reads. Its title
		// is a real heading, so a screen reader can jump to it the way it jumps to
		// "Your answers", and the note itself is quoted underneath unchanged.
		await expect(main.getByRole('heading', { name: 'Note from the organisers' })).toBeVisible();
		await expect(main.getByText('Welcome. See you in February.').first()).toBeVisible();

		// And the way to the committee itself.
		await main.getByRole('link', { name: 'Go to your committee' }).click();

		await expect(page).toHaveURL(
			`/conferences/${conference.slug}/committees/${conference.committees[0].slug}`,
			{ timeout: DATABASE_TIMEOUT_MS }
		);
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('offers to edit a draft and a submitted application, and nothing else', async ({ page }) => {
	const stillOpen = await createTestConference({ committeeNames: ['UNSC'] });
	const alsoOpen = await createTestConference({ committeeNames: ['UNSC'] });
	const shutAgain = await createTestConference({ committeeNames: ['UNSC'], isWindowOpen: false });

	try {
		const applicant = await createTestUser('Noor Haddad');
		const motivation = 'I have chaired twice and would like a seat on the Security Council.';

		const draft = await giveApplication(applicant, {
			conferenceId: stillOpen.id,
			status: 'draft',
			committeePreferences: [stillOpen.committees[0].id],
			motivation
		});
		const waitlisted = await giveApplication(applicant, {
			conferenceId: alsoOpen.id,
			status: 'waitlisted',
			committeePreferences: [alsoOpen.committees[0].id],
			motivation
		});
		const tooLate = await giveApplication(applicant, {
			conferenceId: shutAgain.id,
			status: 'draft',
			committeePreferences: [shutAgain.committees[0].id],
			motivation
		});

		await signIn(page, applicant);

		// A draft inside an open window can still be changed, and the link goes to
		// the form it was written on.
		await openTheApplication(page, draft);

		const editLink = page.getByRole('main').getByRole('link', { name: 'Edit application' });
		await expect(editLink).toBeVisible();

		await editLink.click();

		await expect(page).toHaveURL(`/conferences/${stillOpen.slug}/apply`, {
			timeout: DATABASE_TIMEOUT_MS
		});

		// A waitlisted application is the organisers' to change now, not the
		// applicant's.
		await openTheApplication(page, waitlisted);
		await expect(
			page.getByRole('main').getByRole('link', { name: 'Edit application' })
		).toHaveCount(0);

		// And a draft whose window has shut can no longer be sent, so there is
		// nothing to edit it into.
		await openTheApplication(page, tooLate);
		await expect(
			page.getByRole('main').getByRole('link', { name: 'Edit application' })
		).toHaveCount(0);
	} finally {
		await deleteTestConference(stillOpen.id);
		await deleteTestConference(alsoOpen.id);
		await deleteTestConference(shutAgain.id);
	}
});

test('withdraws a submitted application, and asks before it does', async ({ page }) => {
	const submitted = await createTestConference({ committeeNames: ['UNSC'] });
	const accepted = await createTestConference({ committeeNames: ['UNSC'] });

	try {
		const applicant = await createTestUser('Noor Haddad');
		const motivation = 'I have chaired twice and would like a seat on the Security Council.';

		const canBeWithdrawn = await giveApplication(applicant, {
			conferenceId: submitted.id,
			status: 'submitted',
			committeePreferences: [submitted.committees[0].id],
			motivation
		});
		const cannotBeWithdrawn = await giveApplication(applicant, {
			conferenceId: accepted.id,
			status: 'accepted',
			committeePreferences: [accepted.committees[0].id],
			motivation
		});

		await signIn(page, applicant);

		// An accepted application is not the applicant's to withdraw: taking a seat
		// back is the organiser's move, and `guard_application_update` refuses any
		// other transition anyway.
		await openTheApplication(page, cannotBeWithdrawn);
		await expect(
			page.getByRole('main').getByRole('button', { name: 'Withdraw application' })
		).toHaveCount(0);

		await openTheApplication(page, canBeWithdrawn);
		await pressAndConfirm(page, 'Withdraw application');

		await expect(page.getByText('Application withdrawn.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(
			page.getByRole('main').getByText(STATUS_SENTENCES.withdrawn).first()
		).toBeVisible();

		expect(await readApplicationStatus(canBeWithdrawn)).toBe('withdrawn');
	} finally {
		await deleteTestConference(submitted.id);
		await deleteTestConference(accepted.id);
	}
});

// T142: with JavaScript the status reads "Withdrawn" the moment the question
// is answered, before the server has and with no spinner, and a withdrawal the
// server fails goes back and says so.
test('withdraws at once, and puts a failed withdrawal back', async ({ page }, testInfo) => {
	skipWithoutJavaScript(testInfo);
	const withdrawn = await createTestConference({ committeeNames: ['UNSC'] });
	const failed = await createTestConference({ committeeNames: ['UNSC'] });

	try {
		const applicant = await createTestUser('Noor Haddad');
		const motivation = 'I have chaired twice and would like a seat on the Security Council.';
		const toWithdraw = await giveApplication(applicant, {
			conferenceId: withdrawn.id,
			status: 'submitted',
			committeePreferences: [withdrawn.committees[0].id],
			motivation
		});
		const toFail = await giveApplication(applicant, {
			conferenceId: failed.id,
			status: 'waitlisted',
			committeePreferences: [failed.committees[0].id],
			motivation
		});
		const main = page.getByRole('main');

		await signIn(page, applicant);
		await openTheApplication(page, toWithdraw);
		await answerSlowly(page, 'withdraw');
		await watchForSpinners(page);
		await pressAndConfirm(page, 'Withdraw application');

		await expect(main.getByText(STATUS_SENTENCES.withdrawn).first()).toBeVisible({
			timeout: AT_ONCE_TIMEOUT_MS
		});
		await expect(main.getByRole('button', { name: 'Withdraw application' })).toHaveCount(0);

		await waitUntilAnswered(page);
		expect(await sawSpinner(page)).toBe(false);
		expect(await readApplicationStatus(toWithdraw)).toBe('withdrawn');

		await page.unrouteAll();
		await openTheApplication(page, toFail);
		await answerWithError(page, 'withdraw');
		await pressAndConfirm(page, 'Withdraw application');

		await expect(page.getByRole('alert')).toContainText('Your application was not withdrawn.', {
			timeout: DATABASE_TIMEOUT_MS
		});
		await waitUntilAnswered(page);
		await expect(main.getByText(STATUS_SENTENCES.waitlisted).first()).toBeVisible();
		expect(await readApplicationStatus(toFail)).toBe('waitlisted');
	} finally {
		await deleteTestConference(withdrawn.id);
		await deleteTestConference(failed.id);
	}
});

test('deletes a draft, asks before it does, and lands on the applications list', async ({
	page
}) => {
	const conference = await createTestConference({ committeeNames: ['UNSC'] });

	try {
		const applicant = await createTestUser('Noor Haddad');
		const draft = await giveApplication(applicant, {
			conferenceId: conference.id,
			status: 'draft'
		});

		await signIn(page, applicant);
		await openTheApplication(page, draft);
		await pressAndConfirm(page, 'Delete draft');

		// The redirect is the one `deleteDraft` sends, followed by the browser with
		// or without JavaScript, and the flash it set is shown on the page it lands on.
		await expect(page).toHaveURL('/applications', { timeout: DATABASE_TIMEOUT_MS });
		await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
			'Applications',
			{ timeout: DATABASE_TIMEOUT_MS }
		);
		await expect(page.getByText('Draft deleted.')).toBeVisible();

		// The list would not show this row anyway, because every conference in this
		// file ended in 2020 and `/applications` hides the past. So the table is
		// asked instead.
		expect(await isApplicationStored(draft)).toBe(false);
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('lets two friends apply as one team with a code, and leave it again', async ({
	page,
	browser
}) => {
	const conference = await createTestConference({ committeeNames: ['UNSC', 'HRC'] });
	const friendContext = await browser.newContext();

	try {
		const starter = await createTestUser('Umarbek Ismoilov');
		const friend = await createTestUser('Kian Matton');
		const [starterApplicationId, friendApplicationId] = await Promise.all(
			[starter, friend].map((applicant, index) =>
				giveApplication(applicant, {
					conferenceId: conference.id,
					status: 'submitted',
					committeePreferences: [conference.committees[index].id],
					motivation: 'We would like to represent Kenya together.'
				})
			)
		);

		// One friend starts the team; the page then shows the code to pass on.
		await signIn(page, starter);
		await openTheApplication(page, starterApplicationId);
		await page.getByRole('main').getByRole('button', { name: 'Start a team' }).press('Enter');

		const starterCode = page.getByRole('main').getByText('Code', { exact: true }).locator('+ p');
		await expect(starterCode).toHaveText(/^[A-Z0-9]{8}$/, { timeout: DATABASE_TIMEOUT_MS });
		const code = (await starterCode.textContent())?.trim() ?? '';

		// The other joins with it, and both of them are listed.
		const friendPage = await friendContext.newPage();
		await signIn(friendPage, friend);
		await openTheApplication(friendPage, friendApplicationId);

		const friendMain = friendPage.getByRole('main');
		await friendMain.getByLabel('Team code').fill(code);
		await friendMain.getByRole('button', { name: 'Join team' }).press('Enter');

		await expect(
			friendMain.getByRole('listitem').filter({ hasText: starter.fullName })
		).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await expect(
			friendMain.getByRole('listitem').filter({ hasText: friend.fullName })
		).toBeVisible();

		// Leaving a team of two leaves nobody to be a team with: both apply alone.
		await friendMain.getByRole('button', { name: 'Leave the team' }).press('Enter');
		await expect(friendMain.getByRole('button', { name: 'Start a team' })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		await page.reload();
		await expect(page.getByRole('main').getByRole('button', { name: 'Start a team' })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
	} finally {
		await friendContext.close();
		await deleteTestConference(conference.id);
	}
});

test('leads back to the applications list from the link above the title', async ({ page }) => {
	const conference = await createTestConference({ committeeNames: ['UNSC'] });

	try {
		const applicant = await createTestUser('Noor Haddad');
		const draft = await giveApplication(applicant, {
			conferenceId: conference.id,
			status: 'draft'
		});

		await signIn(page, applicant);
		await openTheApplication(page, draft);

		// The arrow is part of the link's words, and therefore of its name.
		await page.getByRole('main').getByRole('link', { name: '← Applications' }).click();

		await expect(page).toHaveURL('/applications', { timeout: DATABASE_TIMEOUT_MS });
		await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
			'Applications',
			{ timeout: DATABASE_TIMEOUT_MS }
		);
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('lists every custom question with its label and the answer that was given', async ({
	page
}) => {
	const conference = await createTestConference({
		committeeNames: ['UNSC', 'UNHRC'],
		committeePreferenceCount: 2,
		questions: [
			{ label: 'What are your dietary requirements?', type: 'short_text' },
			{
				label: 'Which T-shirt size do you wear?',
				type: 'single_choice',
				options: ['Small', 'Medium', 'Large']
			}
		]
	});

	try {
		const applicant = await createTestUser('Noor Haddad');
		const applicationId = await giveApplication(applicant, {
			conferenceId: conference.id,
			status: 'submitted',
			committeePreferences: [conference.committees[0].id, conference.committees[1].id],
			seatPreferences: 'Any P5 country, or Brazil.',
			motivation: 'I have chaired twice and would like a seat on the Security Council.',
			answers: {
				[conference.questionIds[0]]: 'No nuts, please.',
				[conference.questionIds[1]]: 'Medium'
			}
		});

		await signIn(page, applicant);
		await openTheApplication(page, applicationId);

		const main = page.getByRole('main');

		// Both questions, each with the answer underneath it.
		await expect(main.getByText('What are your dietary requirements?').first()).toBeVisible();
		await expect(main.getByText('No nuts, please.').first()).toBeVisible();
		await expect(main.getByText('Which T-shirt size do you wear?').first()).toBeVisible();
		await expect(main.getByText('Medium', { exact: true }).first()).toBeVisible();

		// And what the form asked for before the questions: the committees by name,
		// the seat preferences and the motivation, all as they were given.
		await expect(main.getByText('UNSC').first()).toBeVisible();
		await expect(main.getByText('UNHRC').first()).toBeVisible();
		await expect(main.getByText('Any P5 country, or Brazil.').first()).toBeVisible();
		await expect(
			main.getByText('I have chaired twice and would like a seat on the Security Council.').first()
		).toBeVisible();
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('sends a visitor to the sign in page, carrying where they were going', async ({ page }) => {
	const conference = await createTestConference({ committeeNames: ['UNSC'] });

	try {
		const applicant = await createTestUser('Noor Haddad');
		const applicationId = await giveApplication(applicant, {
			conferenceId: conference.id,
			status: 'submitted',
			committeePreferences: [conference.committees[0].id],
			motivation: 'I have chaired twice and would like a seat on the Security Council.'
		});

		// Nobody is signed in. A signed-in stranger gets the 404 the test above
		// asks for; somebody signed out is sent to log in with the address they
		// were heading for, which is the **Access:** line of
		// `05-pages/delegate/application.md` and is the difference between the two.
		await page.goto(applicationPath(applicationId));

		await expect(page).toHaveURL(
			`/login?next=${encodeURIComponent(applicationPath(applicationId))}`,
			{ timeout: DATABASE_TIMEOUT_MS }
		);
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('does not spill off the side of a phone screen', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	const conference = await createTestConference({
		committeeNames: ['UNSC'],
		questions: [{ label: 'What are your dietary requirements?', type: 'short_text' }]
	});

	try {
		const applicant = await createTestUser('Noor Haddad');
		const applicationId = await giveApplication(applicant, {
			conferenceId: conference.id,
			status: 'submitted',
			committeePreferences: [conference.committees[0].id],
			motivation: 'I have chaired twice and would like a seat on the Security Council.',
			answers: { [conference.questionIds[0]]: 'No nuts, please.' }
		});

		await signIn(page, applicant);
		await openTheApplication(page, applicationId);

		await expectNoSidewaysOverflow(page);
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('fits in a few screens', async ({ page }, testInfo) => {
	test.skip(
		testInfo.project.name !== 'desktop',
		'One project measures the page, and the desktop window is the one the design is drawn for.'
	);

	// The fullest the page ever is: an accepted application, a seat, a decision
	// note and two answers. Measuring a draft with nothing in it would measure
	// nothing.
	const conference = await createTestConference({
		committeeNames: ['UNSC', 'UNHRC'],
		committeePreferenceCount: 2,
		questions: [
			{ label: 'What are your dietary requirements?', type: 'short_text' },
			{ label: 'Tell us about your last conference.', type: 'long_text' }
		]
	});

	try {
		const applicant = await createTestUser('Noor Haddad');
		const applicationId = await giveApplication(applicant, {
			conferenceId: conference.id,
			status: 'accepted',
			committeePreferences: [conference.committees[0].id, conference.committees[1].id],
			seatPreferences: 'Any P5 country, or Brazil.',
			motivation: 'I have chaired twice and would like a seat on the Security Council.',
			answers: {
				[conference.questionIds[0]]: 'No nuts, please.',
				[conference.questionIds[1]]: 'I chaired the environment committee last spring.'
			},
			decisionNote: 'Welcome. See you in February.'
		});

		await giveSeatForApplication(applicant, conference.committees[0].id, applicationId, 'France');

		await signIn(page, applicant);
		await openTheApplication(page, applicationId);

		// The picture is saved whether the measurement passes or fails, so that a
		// failure can be looked at rather than guessed at.
		await saveFullPageScreenshot(page, 'application');
		await expectPageFitsInScreens(page, APPLICATION_PAGE_SCREENS);
	} finally {
		await deleteTestConference(conference.id);
	}
});
