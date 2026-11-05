import { expect, test, type APIResponse, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { markPage, readMarker, skipWithoutJavaScript } from './in-place';
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

// The acceptance criteria of `specs/05-pages/delegate/apply.md` that need a
// real browser, for the form task T24 builds at `/conferences/[slug]/apply`:
//
// * the form draws exactly `committee_preference_count` committee selects and
//   the conference's own questions, in the order the organiser put them in;
// * "Save draft" saves a form with nothing in it at all and lands on the
//   application page saying "Draft saved.";
// * "Submit application" with an empty form answers with every error at once,
//   rather than one error per attempt;
// * two choices naming the same committee are refused;
// * a required question is enforced whatever its type, and a choice answer that
//   is not one of the options is refused;
// * submitting a saved draft turns it into "Under review";
// * opening a submitted application's form again and saving a draft puts it
//   back to "Draft";
// * every reason `canApply` can give is shown instead of the form;
// * the page does not spill off a phone screen or run on for screens on a
//   desktop.
//
// NOT TESTED HERE, AND NOT FORGOTTEN
// The apply panel on the public conference page — the badge, the closing date
// and the "Apply as a delegate" button that leads here — belongs to
// `tests/e2e/conference-page.spec.ts` and is already watched there.
//
// `/applications`, the list of everything somebody has applied to, has a file
// of its own, `tests/e2e/applications.spec.ts`. These tests land on
// `/applications/[applicationId]` and never follow a link to the list; what
// that one application page shows is `tests/e2e/application.spec.ts`.
//
// "Register a delegation" is **T25**. `/conferences/[slug]/delegations/new`
// does not exist, so nothing here looks for that button, and the one
// `canApply` reason about a delegation is arranged by writing the membership
// rather than by registering one.
//
// EVERY BUTTON WITHOUT JAVASCRIPT
// The eighth criterion — that it all works with scripting switched off,
// including both buttons — is met by these tests running on the
// `desktop-no-js` project like every other browser test, rather than by a test
// of its own. Nothing below depends on anything the browser does for itself:
// the two buttons are real submit buttons in a real `<form method="post">`, and
// the two tests that ask the browser for its own dimensions each run on one
// project alone.
//
// WHAT THESE TESTS LEAVE BEHIND
// Every conference here is made by `createTestConference` and taken away again
// in a `finally`, which takes its committees, its questions and its
// applications with it. The accounts stay until the next `pnpm db:reset`, as
// they do everywhere else. Only the two `canApply` tests read a conference from
// `supabase/seed.sql`, and they only read it.
//
// `postFormAction` below is a copy of the one in
// `tests/e2e/manage-application-form.spec.ts`, deliberately rather than a
// shared import, for the reason that file gives about its own copies.

/**
 * How long an assertion that waits on a page reading the database may take.
 *
 * Longer than the five seconds Playwright waits by default, for the reason
 * `tests/e2e/conferences.spec.ts` gives: every test in the run asks the one
 * local database at once, and an answer has taken up to eight seconds.
 */
const DATABASE_TIMEOUT_MS = 15_000;

/**
 * The organisation `supabase/seed.sql` makes, which the conferences below are
 * put inside.
 *
 * The service-role client writes them, the way `tests/e2e/conference-page.spec.ts`
 * writes the draft conference it previews: `conferences` has no insert policy
 * that would let a test account make one inside somebody else's organisation,
 * and what a real organiser may create is `tests/db/conferences-access.test.ts`'s
 * job rather than this file's.
 */
const SAMPLE_ORGANIZATION_ID = '10000000-0000-4000-8000-000000000001';

/**
 * The days a conference made here runs on.
 *
 * Both are in the past, for the reason `tests/e2e/conferences.spec.ts` gives
 * about the conferences its database tests leave behind: `/conferences` lists
 * conferences that are published *and* have not finished, and that file counts
 * what is in the directory, so a conference dated this way disturbs nothing
 * there. The four conditions in `06-features/applications.md` say nothing about
 * whether the conference itself has been and gone, so a finished conference
 * with an open window is still one somebody may apply to.
 */
const CONFERENCE_FIRST_DAY = '2020-05-03';
const CONFERENCE_LAST_DAY = '2020-05-05';

/**
 * A day and three months in milliseconds, for a window that is open right now.
 *
 * The window has to be open at the moment the test runs rather than on a date
 * written down here, because `canApply` judges it against the clock.
 */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const THREE_MONTHS_MS = 90 * ONE_DAY_MS;

/**
 * Copenhagen Schools MUN 2027 and Madrid International MUN 2027, the two
 * conferences in `supabase/seed.sql` whose application windows are shut.
 *
 * Copenhagen's opens in 45 days and Madrid's closed a fortnight ago, which is
 * exactly the two reasons a window can give. They are only read here, never
 * written to.
 */
const NOT_YET_OPEN_SLUG = 'copenhagenmun-2027';
const ALREADY_CLOSED_SLUG = 'madridmun-2027';

/**
 * How many windows tall the apply page may be on a desktop.
 *
 * Three, as the conference dashboard, the details editor, the committees list
 * and the fees page are all held to. It is a ceiling and not a target: at three
 * it still catches this page drawn half again as big, which is what
 * `tests/e2e/page-shape.ts` exists to notice.
 */
const APPLY_PAGE_SCREENS = 3;

/** A name nothing else in the database will match. */
function unusedName(prefix: string): string {
	return `${prefix} ${crypto.randomUUID().slice(0, 8)}`;
}

/** One custom question to put on the conference's form. */
type NewQuestion = {
	label: string;
	type: 'short_text' | 'long_text' | 'single_choice' | 'multiple_choice' | 'checkbox';
	/** The choices, for the two types that have any. */
	options?: string[];
	isRequired?: boolean;
};

/** What a test wants its conference to ask for. Everything else is filled in. */
type ConferenceSeed = {
	/** One committee per name, in this order. */
	committeeNames?: string[];
	/** How many of them the form asks the applicant to choose. */
	committeePreferenceCount?: number;
	askMotivation?: boolean;
	/** Turned off for the "does not accept individual applications" reason. */
	acceptsIndividualApplications?: boolean;
	questions?: NewQuestion[];
	/**
	 * Left unpublished, for the organiser's preview of their own form.
	 *
	 * A draft conference is readable only by its own team, so a test that asks
	 * for one has to put its account on that team as well.
	 */
	isDraft?: boolean;
};

/** A conference a test has to itself, with everything it needs to be applied to. */
type TestConference = {
	id: string;
	slug: string;
	name: string;
	/** The committee ids, in the order `committeeNames` asked for them. */
	committeeIds: string[];
	/** The question ids, in the order `questions` asked for them. */
	questionIds: string[];
	/** The `/conferences/<slug>/apply` address this file is about. */
	applyPath: string;
};

/**
 * Make a published conference with an open application window, its committees
 * and its questions, and answer everything a test needs to find them again.
 *
 * Everything is written with the service-role client. Making a conference is
 * `tests/e2e/create-conference.spec.ts`'s subject, its committees are T02's
 * form and its questions are T67's, and none of the three is what this file is
 * about; arranging the state a test begins in is all this does.
 */
async function createTestConference(seed: ConferenceSeed = {}): Promise<TestConference> {
	const admin = createServiceRoleClient();
	const name = unusedName('Apply Test MUN');
	const slug = `e2e-apply-${crypto.randomUUID()}`;
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
			accepts_individual_applications: seed.acceptsIndividualApplications ?? true,
			committee_preference_count: seed.committeePreferenceCount ?? 1,
			ask_motivation: seed.askMotivation ?? true,
			organization_id: SAMPLE_ORGANIZATION_ID
		})
		.select('id')
		.single();

	if (error || !conference) {
		throw new Error(`Could not create the test conference: ${error?.message}`);
	}

	const committeeIds = await addCommittees(conference.id, seed.committeeNames ?? []);
	const questionIds = await addQuestions(conference.id, seed.questions ?? []);

	return {
		id: conference.id,
		slug,
		name,
		committeeIds,
		questionIds,
		applyPath: `/conferences/${slug}/apply`
	};
}

/** The committees of one test conference, in the order they were asked for. */
async function addCommittees(conferenceId: string, names: string[]): Promise<string[]> {
	if (names.length === 0) {
		return [];
	}

	const admin = createServiceRoleClient();

	// `position` is the organiser's own order, and the apply page offers the
	// committees in it. `index` is the position in the list of names, which is
	// the only order there is here.
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
		is_required: question.isRequired ?? false,
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
 * Take a test conference away again, with its committees, its questions and any
 * application written to it.
 *
 * All three carry `on delete cascade` from `conference_id`, so deleting the
 * conference is enough. Every test that makes one does this in a `finally`: a
 * conference nobody deletes is one more thing for the next person to wonder
 * about, and `tests/e2e/conference-page.spec.ts` clears the one it makes for
 * the same reason.
 */
async function deleteTestConference(conferenceId: string): Promise<void> {
	await createServiceRoleClient().from('conferences').delete().eq('id', conferenceId);
}

/** One `applications` row, as the tests below read it back. */
type ApplicationRow = {
	id: string;
	status: string;
	submitted_at: string | null;
};

/** The one application a test account has to a conference, read straight from the table. */
async function readApplication(conferenceId: string, userId: string): Promise<ApplicationRow> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('applications')
		.select('id, status, submitted_at')
		.eq('conference_id', conferenceId)
		.eq('user_id', userId)
		.maybeSingle();

	if (error || !data) {
		throw new Error(`Could not read the test application: ${error?.message}`);
	}

	return data;
}

/**
 * Put somebody in a delegation of a conference, which is one of the reasons
 * `canApply` refuses.
 *
 * Registering a delegation is **T25**'s form and does not exist, so the
 * service-role client writes both rows the way that task one day will. The join
 * code is unique across the table, so it is made from a fresh id.
 */
async function joinADelegation(user: TestUser, conferenceId: string, name: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { data: delegation, error } = await admin
		.from('delegations')
		.insert({
			conference_id: conferenceId,
			name,
			institution_name: 'Delft University',
			join_code: crypto.randomUUID().slice(0, 8).toUpperCase()
		})
		.select('id')
		.single();

	if (error || !delegation) {
		throw new Error(`Could not create the test delegation: ${error?.message}`);
	}

	const { error: memberError } = await admin
		.from('delegation_members')
		.insert({ delegation_id: delegation.id, user_id: user.id, role: 'member' });

	if (memberError) {
		throw new Error(`Could not join the test delegation: ${memberError.message}`);
	}
}

/**
 * Post to one of the page's form actions the way a browser posts a form.
 *
 * A copy of the one in `tests/e2e/manage-application-form.spec.ts`, and the
 * same two headers are written by hand for the same two reasons. `origin`,
 * because SvelteKit refuses a form post that looks as though it came from
 * another website and Playwright's request does not send that header itself.
 * And `accept: text/html`, because that is how SvelteKit tells a form post from
 * a page with no JavaScript from one made by `use:enhance`: with it the page is
 * drawn again carrying the status the action chose, which is what a browser
 * with no script really receives.
 *
 * Three of the tests below ask the action directly rather than pressing the
 * button, because the browser would not let the form be sent at all: the first
 * committee choice and the motivation are `required` fields, so an empty submit
 * never leaves the page, and the whole point of those tests is what the server
 * says about an empty one.
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
 * Wait until the apply form has really arrived.
 *
 * The submit button is what says the form is there: a conference `canApply`
 * refuses draws the reason instead, so a test that pressed too early would
 * press a page with no form on it.
 */
async function waitForTheApplyForm(page: Page): Promise<void> {
	const submit = page.getByRole('main').getByRole('button', { name: 'Submit application' });

	await expect(submit).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
}

/** Sign an account in and open one conference's apply form. */
async function openTheApplyForm(page: Page, user: TestUser, applyPath: string): Promise<void> {
	await signIn(page, user);
	await page.goto(applyPath);
	await waitForTheApplyForm(page);
}

/**
 * Tick the consent box, which the form asks for every time it is sent.
 *
 * `05-pages/delegate/apply.md` puts one checkbox on the page that is always
 * there — the consent — and one more for each question of the `checkbox` or
 * `multiple_choice` type. Every test that calls this gives its conference no
 * questions of either kind, so the page holds exactly one checkbox and it is
 * this one. Saying so as an assertion rather than as a comment is deliberate: a
 * page that grew a second checkbox fails here instead of quietly ticking the
 * wrong box.
 */
async function tickTheConsentBox(page: Page): Promise<void> {
	const consent = page.getByRole('main').getByRole('checkbox');

	await expect(consent).toHaveCount(1);
	await consent.check();
}

/**
 * The address both save buttons redirect to, whichever application they wrote.
 *
 * The id is made by the database, so the address can only be matched by its
 * shape: `/applications/` and the thirty-six characters of a uuid.
 */
const APPLICATION_PAGE_URL = /\/applications\/[0-9a-f-]{36}$/;

/*
	Every test here makes a conference, signs a brand-new account in and then
	fills a form in. That is more than most browser tests do, and thirty seconds
	— what Playwright allows a test by default — is not always enough for it
	while the whole suite is asking the one local database at once. `test.slow()`
	triples that allowance. It is an allowance and not a wait: a test that is
	quick still finishes as quickly as it can.
*/
test.beforeEach(() => {
	test.slow();
});

test('draws one select per committee preference, and every question in order', async ({ page }) => {
	// Three questions, none of them a "Pick one": that type is a dropdown too,
	// and the count below is about the committee selects alone.
	const conference = await createTestConference({
		committeeNames: ['Security Council', 'Human Rights Council', 'Environment Assembly'],
		committeePreferenceCount: 2,
		questions: [
			{ label: 'What are your dietary requirements?', type: 'short_text' },
			{ label: 'Tell us about your last conference.', type: 'long_text' },
			{ label: 'I have read the rules of procedure.', type: 'checkbox' }
		]
	});

	try {
		const applicant = await createTestUser('Noor Haddad');
		await openTheApplyForm(page, applicant, conference.applyPath);

		const main = page.getByRole('main');

		// Two, because the conference asks for two, although it has three
		// committees to offer. That is the criterion: the form follows the setting
		// and not the number of committees.
		await expect(main.getByRole('combobox')).toHaveCount(2);

		for (const question of [
			'What are your dietary requirements?',
			'Tell us about your last conference.',
			'I have read the rules of procedure.'
		]) {
			await expect(main.getByText(question).first()).toBeVisible();
		}

		/*
			And in the organiser's own order. Reading the page's text once and
			comparing where each label falls in it is the plainest way to say
			"this one is above that one" without reaching for a CSS selector,
			which `specs/02-architecture/testing.md` forbids.

			Lower case on both sides, because `innerText` gives back the text as it
			is drawn and every field label in this app carries `uppercase` (it is in
			`LABEL_CLASSES` in `src/lib/form-fields.ts`). Searching for the question
			as the organiser typed it would find nothing at all.
		*/
		const pageText = (await main.innerText()).toLowerCase();

		expect(pageText.indexOf('what are your dietary requirements?')).toBeLessThan(
			pageText.indexOf('tell us about your last conference.')
		);
		expect(pageText.indexOf('tell us about your last conference.')).toBeLessThan(
			pageText.indexOf('i have read the rules of procedure.')
		);
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('saves a draft of a form with nothing filled in at all', async ({ page }) => {
	const conference = await createTestConference({
		committeeNames: ['Security Council']
	});

	try {
		const applicant = await createTestUser('Noor Haddad');
		await openTheApplyForm(page, applicant, conference.applyPath);

		// Nothing is typed in first. "Save draft" carries `formnovalidate`, so the
		// browser's own check on the required fields does not stand in its way,
		// which is the half of the criterion a server test could not show.
		await page.getByRole('main').getByRole('button', { name: 'Save draft' }).press('Enter');

		await expect(page).toHaveURL(APPLICATION_PAGE_URL, { timeout: DATABASE_TIMEOUT_MS });

		// The flash floats above the page rather than inside `<main>`, which is why
		// this assertion is not scoped to it.
		await expect(page.getByText('Draft saved.')).toBeVisible();

		const saved = await readApplication(conference.id, applicant.id);

		expect(saved.status).toBe('draft');
		expect(saved.submitted_at).toBeNull();
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('saving a draft answers in place without reloading', async ({ page }, testInfo) => {
	// T125: this used to post and reload the page it redirects to. The save
	// still moves from the apply form to `/applications/<id>`, but through
	// SvelteKit's own router (`goto`, inside `applyAction`) rather than a full
	// browser reload, which is what leaves the marker on `window` in place
	// (`./in-place.ts`).
	skipWithoutJavaScript(testInfo);
	const conference = await createTestConference({
		committeeNames: ['Security Council']
	});

	try {
		const applicant = await createTestUser('Noor Haddad');
		await openTheApplyForm(page, applicant, conference.applyPath);
		await markPage(page);

		await page.getByRole('main').getByRole('button', { name: 'Save draft' }).click();

		await expect(page).toHaveURL(APPLICATION_PAGE_URL, { timeout: DATABASE_TIMEOUT_MS });
		await expect(page.getByText('Draft saved.')).toBeVisible();
		expect(await readMarker(page)).toBe('still here');
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('answers an empty submission with every error at once', async ({ page }) => {
	const conference = await createTestConference({
		committeeNames: ['Security Council'],
		askMotivation: true
	});

	try {
		const applicant = await createTestUser('Noor Haddad');
		await openTheApplyForm(page, applicant, conference.applyPath);

		// Posted rather than pressed: the first committee choice and the motivation
		// are `required`, so a browser would stop an empty form before the server
		// ever saw it, and what the server says about an empty one is the criterion.
		const response = await postFormAction(page, `${conference.applyPath}?/submit`);

		expect(response.status()).toBe(400);

		const answer = await response.text();

		// All three on the one page. That is the criterion: every field with
		// something wrong with it says so at once, rather than one attempt per
		// field.
		const everyMessage = [
			'Please pick your first choice of committee.',
			'Please tell the organisers why you want to take part.',
			'Please agree so the organisers can see your details.'
		];

		for (const message of everyMessage) {
			expect(answer).toContain(message);
		}

		// And nothing was written: a refused submission is not a draft.
		const admin = createServiceRoleClient();
		const { count } = await admin
			.from('applications')
			.select('id', { count: 'exact', head: true })
			.eq('conference_id', conference.id);

		expect(count).toBe(0);
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('refuses the same committee in two of the choices', async ({ page }) => {
	const conference = await createTestConference({
		committeeNames: ['Security Council', 'Human Rights Council'],
		committeePreferenceCount: 2
	});

	try {
		const applicant = await createTestUser('Noor Haddad');
		await openTheApplyForm(page, applicant, conference.applyPath);

		// Everything else is right, so the duplicate is the only thing left for the
		// server to complain about.
		const response = await postFormAction(page, `${conference.applyPath}?/submit`, {
			committee_1: conference.committeeIds[0],
			committee_2: conference.committeeIds[0],
			motivation: 'I have chaired twice and would like a seat on the Security Council.',
			consent: 'on'
		});

		expect(response.status()).toBe(400);
		expect(await response.text()).toContain('Please pick different committees for each choice.');
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('insists on an answer to a required question of every type', async ({ page }) => {
	// One required question of each of the five types there are.
	const conference = await createTestConference({
		committeeNames: ['Security Council'],
		questions: [
			{ label: 'What are your dietary requirements?', type: 'short_text', isRequired: true },
			{ label: 'Tell us about your last conference.', type: 'long_text', isRequired: true },
			{
				label: 'Which T-shirt size do you wear?',
				type: 'single_choice',
				options: ['Small', 'Medium', 'Large'],
				isRequired: true
			},
			{
				label: 'Which days can you come?',
				type: 'multiple_choice',
				options: ['Friday', 'Saturday', 'Sunday'],
				isRequired: true
			},
			{ label: 'I have read the rules of procedure.', type: 'checkbox', isRequired: true }
		]
	});

	try {
		const applicant = await createTestUser('Noor Haddad');
		await openTheApplyForm(page, applicant, conference.applyPath);

		// A submission with everything else right and not one question answered.
		const everythingButTheQuestions = {
			committee_1: conference.committeeIds[0],
			motivation: 'I have chaired twice and would like a seat on the Security Council.',
			consent: 'on'
		};

		const response = await postFormAction(
			page,
			`${conference.applyPath}?/submit`,
			everythingButTheQuestions
		);

		expect(response.status()).toBe(400);

		const answer = await response.text();

		/*
			Five questions, five messages, one page. Counting how often the message
			appears rather than asking whether it appears is what says each of the
			five types was enforced and not just the first of them. `at least`,
			because SvelteKit also writes the action's answer into the page for the
			browser to pick up, so the same message can be there twice over.
		*/
		const messagesShown = answer.split('Please answer this question.').length - 1;

		expect(messagesShown).toBeGreaterThanOrEqual(conference.questionIds.length);

		// And a choice answered with something that is not one of its options is a
		// different refusal, with a message of its own.
		const madeUpChoice = await postFormAction(page, `${conference.applyPath}?/submit`, {
			...everythingButTheQuestions,
			[`question_${conference.questionIds[2]}`]: 'Extra large'
		});

		expect(madeUpChoice.status()).toBe(400);
		expect(await madeUpChoice.text()).toContain('Please pick one of the options.');
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('submits a saved draft, which becomes "Under review"', async ({ page }) => {
	const conference = await createTestConference({
		committeeNames: ['Security Council']
	});

	try {
		const applicant = await createTestUser('Noor Haddad');

		// A draft with everything a submission needs already in it, so that what
		// this test presses is the one button it is about.
		await giveApplication(applicant, {
			conferenceId: conference.id,
			status: 'draft',
			committeePreferences: [conference.committeeIds[0]],
			motivation: 'I have chaired twice and would like a seat on the Security Council.'
		});

		await openTheApplyForm(page, applicant, conference.applyPath);

		// The consent is the one thing a saved draft never carries: it is asked
		// again every time the form is sent.
		await tickTheConsentBox(page);

		await page.getByRole('main').getByRole('button', { name: 'Submit application' }).press('Enter');

		await expect(page).toHaveURL(APPLICATION_PAGE_URL, { timeout: DATABASE_TIMEOUT_MS });
		await expect(page.getByText('Application submitted.')).toBeVisible();

		// "Under review" is what `$lib/status.ts` calls a submitted application, and
		// what the applicant reads on their own page.
		await expect(page.getByRole('main').getByText('Under review', { exact: true })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		const saved = await readApplication(conference.id, applicant.id);

		expect(saved.status).toBe('submitted');
		expect(saved.submitted_at).not.toBeNull();
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('puts a submitted application back to a draft when it is saved as one', async ({ page }) => {
	const conference = await createTestConference({
		committeeNames: ['Security Council']
	});

	try {
		const applicant = await createTestUser('Noor Haddad');

		await giveApplication(applicant, {
			conferenceId: conference.id,
			status: 'submitted',
			committeePreferences: [conference.committeeIds[0]],
			motivation: 'I have chaired twice and would like a seat on the Security Council.'
		});

		// A submitted application is still editable while the window is open, which
		// is why the form opens at all rather than showing "You already applied."
		await openTheApplyForm(page, applicant, conference.applyPath);

		await page.getByRole('main').getByRole('button', { name: 'Save draft' }).press('Enter');

		await expect(page).toHaveURL(APPLICATION_PAGE_URL, { timeout: DATABASE_TIMEOUT_MS });
		await expect(page.getByText('Draft saved.')).toBeVisible();
		await expect(page.getByRole('main').getByText('Draft', { exact: true })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		// And the moment it was sent is cleared with it, because it has not been
		// sent any more.
		const saved = await readApplication(conference.id, applicant.id);

		expect(saved.status).toBe('draft');
		expect(saved.submitted_at).toBeNull();
	} finally {
		await deleteTestConference(conference.id);
	}
});

/**
 * The reason a conference gives instead of the form, the link that goes with
 * it, and the form really gone.
 *
 * `05-pages/delegate/apply.md` asks for a link on each reason. Two of the six
 * have none: a delegation's own page and "register a delegation" are **T25**'s,
 * so `linkName` is left out for those two and the test then asks only that the
 * reason itself is there.
 */
async function expectTheReason(
	page: Page,
	applyPath: string,
	reason: RegExp,
	linkName?: string
): Promise<void> {
	await page.goto(applyPath);

	const main = page.getByRole('main');

	await expect(main.getByText(reason).first()).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(main.getByRole('button', { name: 'Submit application' })).toHaveCount(0);
	await expect(main.getByRole('button', { name: 'Save draft' })).toHaveCount(0);

	if (linkName !== undefined) {
		await expect(main.getByRole('link', { name: linkName })).toBeVisible();
	}
}

test('shows the reason instead of the form, for every reason there is', async ({ page }) => {
	// Three conferences, because one account can only be in one state per
	// conference: `check_one_route_per_conference` will not let the same person
	// both apply to a conference and join a delegation of it.
	const alreadyApplied = await createTestConference({ committeeNames: ['Security Council'] });
	const inADelegation = await createTestConference({ committeeNames: ['Security Council'] });
	const individualsNotWelcome = await createTestConference({
		committeeNames: ['Security Council'],
		acceptsIndividualApplications: false
	});

	try {
		const applicant = await createTestUser('Noor Haddad');

		// An accepted application is one no page may reopen: the form is for a
		// draft or a submission, and every other status is a decision already made.
		await giveApplication(applicant, {
			conferenceId: alreadyApplied.id,
			status: 'accepted',
			committeePreferences: [alreadyApplied.committeeIds[0]],
			motivation: 'I have chaired twice and would like a seat on the Security Council.'
		});

		await joinADelegation(applicant, inADelegation.id, 'Lycee Francais');

		await signIn(page, applicant);

		// The two windows, read from `supabase/seed.sql`. Only the front of each
		// sentence is matched: the seed works both dates out from the moment the
		// database was last reset, so neither can be written down here. Both send
		// the reader back to the conference, which is the only thing left to do.
		await expectTheReason(
			page,
			`/conferences/${NOT_YET_OPEN_SLUG}/apply`,
			/Applications open on /,
			'Back to the conference'
		);
		await expectTheReason(
			page,
			`/conferences/${ALREADY_CLOSED_SLUG}/apply`,
			/Applications closed on /,
			'Back to the conference'
		);

		// Somebody who has already applied is sent to the application itself.
		await expectTheReason(
			page,
			alreadyApplied.applyPath,
			/You already applied\./,
			'View your application'
		);

		// The last two have no link until T25 builds the delegation pages.
		await expectTheReason(
			page,
			inADelegation.applyPath,
			/You are part of the Lycee Francais delegation\./
		);
		await expectTheReason(
			page,
			individualsNotWelcome.applyPath,
			/This conference does not accept individual applications\./
		);
	} finally {
		await deleteTestConference(alreadyApplied.id);
		await deleteTestConference(inADelegation.id);
		await deleteTestConference(individualsNotWelcome.id);
	}
});

test('shows an organiser a preview of their own draft, instead of the reason', async ({ page }) => {
	// No window at all, on purpose: a draft is refused for being unpublished
	// before the dates are even looked at, so this proves the banner is about the
	// status and not about the window.
	const conference = await createTestConference({
		isDraft: true,
		committeeNames: ['Security Council', 'Human Rights Council'],
		committeePreferenceCount: 2
	});

	try {
		const organiser = await createTestUser('Priya Raman');

		// A draft is readable only by its own team, which is also the whole reason
		// the page needs no staff lookup of its own: a draft that reaches `load`
		// belongs to somebody on this conference's team, and anybody else was
		// turned away with a 404 before that.
		await makeConferenceStaff(organiser, conference.id, 'organiser');
		await openTheApplyForm(page, organiser, conference.applyPath);

		const main = page.getByRole('main');

		// The banner `05-pages/organiser/application-form.md` asks for, and the
		// form underneath it rather than the refusal everybody else would get.
		await expect(main.getByText('This is what delegates will see.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		await expect(main.getByText('This conference is not taking applications.')).toHaveCount(0);
		await expect(main.getByRole('combobox')).toHaveCount(2);

		// And it is a preview and nothing more: pressing Submit asks `canApply`
		// again on the server, which refuses a conference nobody has published.
		const response = await postFormAction(page, `${conference.applyPath}?/submit`, {});

		expect(response.status()).toBe(400);
		expect(await response.text()).toContain('This conference is not taking applications.');
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('sends a visitor to the sign in page, carrying where they were going', async ({ page }) => {
	const conference = await createTestConference();

	try {
		// Nobody is signed in: `requireOnboarded` turns this into the address the
		// **Access:** line of `05-pages/delegate/apply.md` names, so that signing in
		// lands somebody back on the form rather than on the front page.
		await page.goto(conference.applyPath);

		await expect(page).toHaveURL(`/login?next=${encodeURIComponent(conference.applyPath)}`, {
			timeout: DATABASE_TIMEOUT_MS
		});
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('takes the reader to the first thing that needs fixing', async ({ page }, testInfo) => {
	// The scroll and the focus are what a browser does once the page has come to
	// life, so this runs where there is scripting. With it switched off every
	// message is still drawn, which is all the criterion asks of that project;
	// the test above proves the messages themselves.
	test.skip(testInfo.project.name === 'desktop-no-js', 'The page has to come to life to move.');

	const conference = await createTestConference({ committeeNames: ['Security Council'] });

	try {
		const applicant = await createTestUser('Noor Haddad');

		// Everything a submission needs except the consent, which is the one field
		// with no HTML `required` on it — so the browser lets this post and the
		// server is what refuses it.
		await giveApplication(applicant, {
			conferenceId: conference.id,
			status: 'draft',
			committeePreferences: [conference.committeeIds[0]],
			motivation: 'I have chaired twice and would like a seat on the Security Council.'
		});

		await openTheApplyForm(page, applicant, conference.applyPath);
		await page.getByRole('main').getByRole('button', { name: 'Submit application' }).press('Enter');

		await expect(
			page.getByText('Please agree so the organisers can see your details.')
		).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

		// The consent box is the last thing on a long form, so a page that came
		// back drawn from the top would leave the message below the fold. Focus
		// landing on it is what says the reader was taken there.
		await expect(page.getByLabel(/The organisers may see my profile details/)).toBeFocused();
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('takes the reader into the boxes of a multiple-choice question', async ({
	page
}, testInfo) => {
	// The same reason as the test above: the page has to come to life before
	// anything on it can move.
	test.skip(testInfo.project.name === 'desktop-no-js', 'The page has to come to life to move.');

	const conference = await createTestConference({
		committeeNames: ['Security Council'],
		questions: [
			{
				label: 'Which days can you come?',
				type: 'multiple_choice',
				options: ['Friday', 'Saturday', 'Sunday'],
				isRequired: true
			}
		]
	});

	try {
		const applicant = await createTestUser('Noor Haddad');

		// Everything a submission needs except this one question. A group of tick
		// boxes carries no HTML `required` either, so the browser lets the post
		// through and the server is what refuses it.
		await giveApplication(applicant, {
			conferenceId: conference.id,
			status: 'draft',
			committeePreferences: [conference.committeeIds[0]],
			motivation: 'I have chaired twice and would like a seat on the Security Council.'
		});

		await openTheApplyForm(page, applicant, conference.applyPath);
		await page.getByLabel(/The organisers may see my profile details/).check();
		await page.getByRole('main').getByRole('button', { name: 'Submit application' }).press('Enter');

		await expect(page.getByText('Please answer this question.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		// This question's field id belongs to the `<fieldset>` around its boxes,
		// and a `<fieldset>` cannot hold the keyboard focus, so the first box is
		// where the reader should land.
		await expect(page.getByRole('checkbox', { name: 'Friday' })).toBeFocused();
	} finally {
		await deleteTestConference(conference.id);
	}
});

test('does not spill off the side of a phone screen', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	const conference = await createTestConference({
		committeeNames: ['Security Council', 'Human Rights Council'],
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
		await openTheApplyForm(page, applicant, conference.applyPath);

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

	// A form with everything on it: the committee preferences, the motivation and
	// a question of each of the three shapes a field can take. Measuring an empty
	// form would measure nothing.
	const conference = await createTestConference({
		committeeNames: ['Security Council', 'Human Rights Council', 'Environment Assembly'],
		committeePreferenceCount: 3,
		questions: [
			{ label: 'What are your dietary requirements?', type: 'short_text' },
			{ label: 'Tell us about your last conference.', type: 'long_text' },
			{
				label: 'Which T-shirt size do you wear?',
				type: 'single_choice',
				options: ['Small', 'Medium', 'Large']
			}
		]
	});

	try {
		const applicant = await createTestUser('Noor Haddad');
		await openTheApplyForm(page, applicant, conference.applyPath);

		// The picture is saved whether the measurement passes or fails, so that a
		// failure can be looked at rather than guessed at.
		await saveFullPageScreenshot(page, 'apply');
		await expectPageFitsInScreens(page, APPLY_PAGE_SCREENS);
	} finally {
		await deleteTestConference(conference.id);
	}
});
