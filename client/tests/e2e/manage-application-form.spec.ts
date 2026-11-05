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

// The acceptance criteria of `specs/05-pages/organiser/application-form.md`
// that need a real browser, for the page at `/manage/[slug]/application-form`.
// Since the manage redesign it has four sections: "When people can apply",
// "Who can apply" and "What the form asks", which one form saves together, and
// "Your own questions", whose questions are saved one at a time.
//
// * the window round-trips in the conference's own timezone — 09:00 typed in is
//   09:00 read back, and the moment the database keeps is the one that time
//   really is in Amsterdam;
// * every rule in the settings form and the question form shows its message
//   inline, and the field messages of one submit appear together rather than
//   one per attempt;
// * a question can be added, listed with its type and whether it is required,
//   edited through `?edit=`, moved up and down, and deleted;
// * a choice type refuses fewer than two distinct options, and a type that is
//   not a choice ignores whatever is in the options box entirely;
// * the locks behave: the number of committee preferences cannot go down once
//   somebody has applied but can go up, and a saved question's type cannot
//   change once an application exists;
// * the notice at the top says each of its four things once the conference is
//   public;
// * the "Preview apply page" button beside the title opens the form a delegate
//   fills in, and that form asks for the committee preferences just saved here;
// * an organiser of another conference gets a 404 here, and an action posted to
//   by somebody who runs no conference gets one too;
// * the page does not spill off a phone screen or run on for screens on a
//   desktop.
//
// THE APPLY PAGE, NOW THAT IT EXISTS
// The sixth criterion of `application-form.md` is that "the public conference
// page and the apply page reflect saved settings immediately". **T24** has
// built `/conferences/[slug]/apply`, so the apply half of it is tested here end
// to end: `previews the apply page` below saves a committee preference count,
// follows the "Preview apply page" button beside the title and counts the
// selects the form draws. That is the one assertion joining the two halves, and
// it is why the criterion can be ticked at all.
//
// NOT TESTED HERE, AND NOT FORGOTTEN
// The public conference page's own apply panel — the one that says whether
// applications are open and who may apply — is the other half of that same
// criterion, and is already watched by `tests/e2e/conference-page.spec.ts`, so a
// second copy of those assertions here would only say the same thing twice. What
// the apply form itself does with the questions and the rules is
// `tests/e2e/apply.spec.ts`.
//
// The seventh criterion, that the checklist's application window item is done
// once both window times are valid, is tested below through the Applications
// line of the "Review and publish" page, where the manage redesign moved the
// checklist. `tests/e2e/manage-publish.spec.ts` walks the rest of that page.
//
// EVERY ACTION WITHOUT JAVASCRIPT
// The third criterion — questions added, edited, reordered and deleted without
// JavaScript — is met by these tests running on the `desktop-no-js` project
// like every other browser test, rather than by a test of its own. Every
// control on the page is a real submit button in a real `<form method="post">`:
// the settings form's "Save and continue" or "Save changes", each question's
// two move arrows and its "Delete question", and the question form's own "Add
// question" or "Save question". So
// a browser with no script posts all of them. "Edit" and the editor's "Cancel"
// are plain links to `?edit=<questionId>` and back, which need no script
// either. The two tests that measure the page are the exception: they ask the
// browser for its own dimensions, and each runs on one project alone.
//
// WHAT THESE TESTS LEAVE BEHIND
// Each test signs a brand-new account in and creates its own conference through
// `./draft-conference`, with an organisation of its own, and what it creates
// stays in the database until the next `pnpm db:reset`. They are dated in 2020
// for the reason `tests/e2e/manage-fees.spec.ts` gives: `/conferences` lists
// conferences that are published *and* have not finished, and
// `tests/e2e/conferences.spec.ts` counts what is in it, so nothing here changes
// what it sees.
//
// Nothing here takes a conference, a question or an application from
// `supabase/seed.sql`.
//
// `createDraftConference`, `slugOf`, `readConferenceId`,
// `signInWithAConference`, `postFormAction` and `pressAndConfirm` below are
// copies of the ones in `tests/e2e/manage-fees.spec.ts` and
// `tests/e2e/manage-committees.spec.ts`, and are deliberately copies rather
// than shared imports for the same reason those two are: each file wants its
// own dates and its own extra fields, and a helper shared between them would
// have to be told about every one of those.

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
 * Both are in the past, for the reason at the top of this file. They matter to
 * more than tidiness here: applications have to close before the first day, and
 * a position paper deadline has to fall before the last one.
 */
const CONFERENCE_FIRST_DAY = '2020-05-03';
const CONFERENCE_LAST_DAY = '2020-05-05';

/**
 * The application window, in the shape a `datetime-local` box holds it.
 *
 * The two are on either side of the day Europe puts its clocks forward — summer
 * time began on 29 March 2020 — which is the whole point of them. Amsterdam is
 * an hour ahead of UTC in March and two hours ahead in April, so a page that
 * quietly used one fixed offset for both would get exactly one of the two
 * moments below wrong.
 */
const WINDOW_OPENS_FIELD = '2020-03-02T09:00';
const WINDOW_CLOSES_FIELD = '2020-04-30T23:59';

/**
 * The same two moments as the database keeps them, which is always UTC.
 *
 * Written out rather than worked out, because a test that computed them with
 * the same date library the page uses would pass whatever that library did.
 */
const WINDOW_OPENS_UTC = '2020-03-02T08:00:00.000Z';
const WINDOW_CLOSES_UTC = '2020-04-30T21:59:00.000Z';

/**
 * How the notice at the top of the page writes that window out.
 *
 * Spelled out here rather than built, for the reason `manage-fees.spec.ts`
 * gives about `formatMoney`: the helper that formats it lives in `$lib`, and
 * Playwright compiles the files in `tests/` on their own, without the `$lib`
 * alias the app is built with.
 */
const WINDOW_ON_THE_PAGE = '2 Mar 2020 09:00 – 30 Apr 2020 23:59 (Europe/Amsterdam)';

/**
 * A closing time after the conference has already started, which is the one
 * rule the window form checks against a date set on another page.
 *
 * It opens at `WINDOW_OPENS_FIELD` beside it, so the "closing must be after
 * opening" rule passes and this is the only thing wrong with the times.
 */
const WINDOW_CLOSES_TOO_LATE_FIELD = '2020-05-20T09:00';

/**
 * A position paper deadline that breaks nothing: after applications open, and
 * well before the conference ends. April is summer time, so five in the
 * afternoon in Amsterdam is three in the afternoon UTC.
 */
const DEADLINE_FIELD = '2020-04-20T17:00';
const DEADLINE_UTC = '2020-04-20T15:00:00.000Z';

/** A deadline after the last day of the conference, and one before it opens. */
const DEADLINE_AFTER_THE_CONFERENCE_FIELD = '2020-06-01T17:00';
const DEADLINE_BEFORE_APPLICATIONS_OPEN_FIELD = '2020-01-15T17:00';

/**
 * Two moments nobody reading this will see, for the two notice states that are
 * about a window still to come.
 *
 * They are written straight into the conference rather than saved through the
 * form, because the `save` action would rightly refuse a window that closes eighty
 * years after the conference finished. The notice is worked out from the two
 * columns alone, so arranging them is arranging the state the test begins in.
 */
const FAR_OFF = '2099-12-01T09:00:00.000Z';
const FURTHER_OFF = '2099-12-20T22:59:00.000Z';

/** The most custom questions one conference may have. */
const MAXIMUM_QUESTIONS = 20;

/** A help text one character longer than the 300 the action allows. */
const TOO_LONG_HELP_TEXT = 'a'.repeat(301);

/** A question one character longer than the 200 the action allows. */
const TOO_LONG_LABEL = 'a'.repeat(201);

/**
 * A day and three months in milliseconds, for an application window that is
 * open at the moment the preview test runs.
 *
 * Every other window in this file is a fixed moment in 2020, because the rules
 * being tested are about the times themselves. This one has to be open *now*,
 * because `canApply` on the apply page judges it against the clock.
 */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const THREE_MONTHS_MS = 90 * ONE_DAY_MS;

/**
 * How many windows tall the application form page may be with questions on it.
 *
 * Four, where the conference dashboard, the details editor, the committees
 * list, the team page, the organisation settings and the fees page are all held
 * to three. This is the one page of the organiser area with four sections on
 * it — the window, who can apply, what the form asks, and the questions — and
 * the last of them is a list plus a form of its own. Measured with the four
 * questions below, it came to 2,521px, which is 3.2 screens on the 800px window
 * this project uses. The manage redesign's denser layout brought it down: with
 * five questions it is about 2,070px, but it sits close enough to three that
 * the ceiling stays at four.
 *
 * The same argument `tests/e2e/profile.spec.ts` makes for `/profile/edit` at
 * 2.7 screens: a form is allowed to be as long as the questions it asks. Two
 * things were trimmed before the number was raised rather than after, and both
 * are worth keeping: the question rows no longer carry a "Required" badge
 * beside a summary line that already ends in "Required", and the add-question
 * form lays its fields two to a row the way `FeeForm` does. Those took 228px
 * off between them.
 *
 * It is a ceiling and not a target. At four it still catches this page drawn
 * half again as big, which is what `tests/e2e/page-shape.ts` exists to notice.
 */
const MANAGE_APPLICATION_FORM_SCREENS = 4;

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
	/** Its `/manage/<slug>` address, which a draft's other pages hang off. */
	managePath: string;
	/** The `/manage/<slug>/application-form` address this file is about. */
	applicationFormPath: string;
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
		applicationFormPath: `${managePath}/application-form`
	};
}

/**
 * Wait until the application form page has really arrived.
 *
 * Waiting for the heading rather than simply for the address is what says the
 * page is there: a test that pressed too early would press the page it was
 * leaving.
 */
async function waitForTheApplicationFormPage(page: Page): Promise<void> {
	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
		'Application form',
		{ timeout: DATABASE_TIMEOUT_MS }
	);
}

/** Sign in, make a conference and open its application form page. */
async function openApplicationFormPage(page: Page, prefix: string): Promise<TestConference> {
	const conference = await signInWithAConference(page, prefix);

	await page.goto(conference.applicationFormPath);
	await waitForTheApplicationFormPage(page);

	return conference;
}

/** Ask for the page again, and wait until it is back. */
async function reopenTheApplicationFormPage(page: Page, conference: TestConference): Promise<void> {
	await page.goto(conference.applicationFormPath);
	await waitForTheApplicationFormPage(page);
}

/*
	The four sections of the page, found by name.

	`FormSection` draws a `<section aria-label="<its title>">`, and a `<section>`
	with a name of its own is a "region" landmark, which is how a screen reader
	lists the blocks of a page and jumps between them. Scoping to one is not
	tidiness: the question form has fields of its own, and "Who can apply" is
	also the name of the group of two boxes inside its section, so a locator
	that looked at the whole of `<main>` could find two of a thing.
*/
function windowSection(page: Page): Locator {
	return page.getByRole('main').getByRole('region', { name: 'When people can apply' });
}

function whoCanApplySection(page: Page): Locator {
	return page.getByRole('main').getByRole('region', { name: 'Who can apply' });
}

function formSettingsSection(page: Page): Locator {
	return page.getByRole('main').getByRole('region', { name: 'What the form asks' });
}

function questionsSection(page: Page): Locator {
	return page.getByRole('main').getByRole('region', { name: 'Your own questions' });
}

/**
 * Choose "On a date I choose" and type both window times in.
 *
 * The opening box is only read for that choice, and these tests' 2020 times
 * need it: "As soon as I publish" would open the window today, years after it
 * closes.
 */
async function fillWindowOnDates(page: Page, opensAt: string, closesAt: string): Promise<void> {
	const section = windowSection(page);

	await section.getByRole('radio', { name: 'On a date I choose', exact: true }).check();
	await section.getByLabel('Opening time', { exact: true }).fill(opensAt);
	await section.getByLabel('Applications close', { exact: true }).fill(closesAt);
}

/**
 * Untick "Require a position paper".
 *
 * A new conference asks for a paper and has no deadline for it, and the form
 * refuses to save that, so a test about anything else turns it off first.
 */
async function stopRequiringAPaper(page: Page): Promise<void> {
	await formSettingsSection(page)
		.getByRole('checkbox', { name: 'Require a position paper', exact: true })
		.uncheck();
}

/**
 * Press the button that saves the three settings sections together.
 *
 * Every conference these tests make is a draft, where the button is the
 * setup footer's "Save and continue", which moves on to the Fees step once the
 * save works. A published conference has "Save changes" under the form
 * instead, so either is taken.
 */
async function pressSaveSettings(page: Page): Promise<void> {
	await page
		.getByRole('main')
		.getByRole('button', { name: /^(Save and continue|Save changes)$/ })
		.press('Enter');
}

/** The flash every working save of the settings form shows, on whichever page it lands. */
const SETTINGS_SAVED = 'Application form saved.';

/** Everything the two settings sections write, read back out of the conference. */
type ApplicationSettings = {
	applications_open_at: string | null;
	applications_close_at: string | null;
	accepts_individual_applications: boolean;
	accepts_delegations: boolean;
	committee_preference_count: number;
	ask_motivation: boolean;
	position_paper_required: boolean;
	position_paper_deadline: string | null;
};

/** What the conference itself says about its application form. */
async function readApplicationSettings(conferenceId: string): Promise<ApplicationSettings> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('conferences')
		.select(
			'applications_open_at, applications_close_at, accepts_individual_applications, ' +
				'accepts_delegations, committee_preference_count, ask_motivation, ' +
				'position_paper_required, position_paper_deadline'
		)
		.eq('id', conferenceId)
		.maybeSingle()
		// Supabase works a row's shape out from the text inside `select`, and it
		// cannot do that with one built by joining strings together, so the shape
		// is named here instead. It has to come last.
		.overrideTypes<ApplicationSettings, { merge: false }>();

	if (error || !data) {
		throw new Error(`Could not read the test conference's settings: ${error?.message}`);
	}

	return data;
}

/**
 * The moment a timestamp from the database really is, written the one way.
 *
 * Postgres answers with an offset of its own choosing, so two strings that mean
 * the same moment can look different. Reading both through `Date` takes the
 * spelling out of the comparison and leaves the moment.
 */
function asUtc(timestamp: string | null): string {
	if (!timestamp) {
		throw new Error('Expected a timestamp and found nothing at all.');
	}

	return new Date(timestamp).toISOString();
}

/**
 * Write an application window straight into the conference.
 *
 * The form is what the first two tests below are about; the tests about the
 * notice and about the position paper deadline need a conference whose window
 * is already set, and not a second proof that saving works, so they are handed
 * one. The service-role client is never used to show that something is allowed,
 * which is what `tests/db/supabase-test-client.ts` warns against — it arranges
 * the state a test begins in.
 */
async function setApplicationWindow(
	conferenceId: string,
	opensAt: string | null,
	closesAt: string | null
): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('conferences')
		.update({ applications_open_at: opensAt, applications_close_at: closesAt })
		.eq('id', conferenceId);

	if (error) {
		throw new Error(`Could not set the test conference's application window: ${error.message}`);
	}
}

/**
 * Turn a test conference into one a delegate could really apply to: published,
 * and inside an application window that is open right now.
 *
 * `./draft-conference` makes a draft, and `06-features/applications.md` asks
 * for a published conference inside an open window before anybody may apply.
 * Both are arranged with the service-role client rather than through the forms
 * that do them, because neither form is what the preview test is about.
 *
 * The conference keeps its 2020 dates. A published conference that has already
 * finished is left out of `/conferences`, which is the reason
 * `tests/e2e/conferences.spec.ts` gives for dating the conferences its own
 * database tests leave behind that way, and the four conditions in
 * `06-features/applications.md` ask nothing about whether the conference has
 * been and gone.
 */
/**
 * Make a test conference public without touching its application window, for
 * the notice at the top of the page, which only a public conference has.
 */
async function publishWithTheWindowItHas(conferenceId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('conferences')
		.update({ status: 'published' })
		.eq('id', conferenceId);

	if (error) {
		throw new Error(`Could not publish the test conference: ${error.message}`);
	}
}

async function publishAndOpenApplications(conferenceId: string): Promise<void> {
	const admin = createServiceRoleClient();
	const now = Date.now();

	const { error } = await admin
		.from('conferences')
		.update({
			status: 'published',
			applications_open_at: new Date(now - ONE_DAY_MS).toISOString(),
			applications_close_at: new Date(now + THREE_MONTHS_MS).toISOString()
		})
		.eq('id', conferenceId);

	if (error) {
		throw new Error(`Could not open the test conference for applications: ${error.message}`);
	}
}

/** What `addQuestion` puts in the list. Everything but the label has a default. */
type NewQuestion = {
	label: string;
	type?: 'short_text' | 'long_text' | 'single_choice' | 'multiple_choice' | 'checkbox';
	helpText?: string;
	/** The choices, for the three types that have any. */
	options?: string[];
	isRequired?: boolean;
	/** Where the question sits in the organiser's own order. */
	position?: number;
};

/**
 * Write one question straight into the table, and answer its id.
 *
 * The form is what two of the tests below are about, so the tests about the
 * *list* are handed their questions rather than typing each one in: three forms
 * filled in to prove an ordering would be minutes of a browser test proving
 * something the add test already proves.
 */
async function addQuestion(conferenceId: string, question: NewQuestion): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('application_questions')
		.insert({
			conference_id: conferenceId,
			label: question.label,
			help_text: question.helpText ?? null,
			type: question.type ?? 'short_text',
			options: question.options ?? [],
			is_required: question.isRequired ?? true,
			position: question.position ?? 0
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test question: ${error?.message}`);
	}

	return data.id;
}

/** One `application_questions` row, as the tests below read it back. */
type QuestionRow = {
	id: string;
	label: string;
	help_text: string | null;
	type: string;
	options: string[];
	is_required: boolean;
	position: number;
};

/** Every question of one conference, in the organiser's own order. */
async function readQuestions(conferenceId: string): Promise<QuestionRow[]> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('application_questions')
		.select('id, label, help_text, type, options, is_required, position')
		.eq('conference_id', conferenceId)
		.order('position', { ascending: true })
		.overrideTypes<QuestionRow[], { merge: false }>();

	if (error || !data) {
		throw new Error(`Could not read the test questions: ${error?.message}`);
	}

	return data;
}

/**
 * Give the conference one committee, so that an application can name a
 * preference.
 *
 * Committees are T02's form and are not what this page is about, so the
 * service-role client writes the row. The name has a default because most
 * callers want one committee and do not care what it is called; the preview
 * test wants three that can be told apart in a dropdown.
 */
async function addCommittee(
	conferenceId: string,
	name: string = 'Security Council'
): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('committees')
		.insert({
			conference_id: conferenceId,
			name,
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
 * Put one submitted application in the table, so that the settings which lock
 * once people have applied really are locked.
 *
 * Applying is `/conferences/[slug]/apply`, which is T24 and does not exist yet,
 * so the service-role client writes the row the way that page one day will. It
 * is never used to show that something is allowed.
 *
 * The row is a real submitted application and not a shortcut, because the
 * `validate_application` trigger insists on one: a conference asks for two
 * committee preferences and a motivation by default, and a submitted
 * application without them is refused. Hence the committee. Call this *before*
 * adding any required question, for the same reason — the trigger also wants an
 * answer to every question that exists on the day the application arrives.
 */
async function submitAnApplication(conferenceId: string): Promise<void> {
	const applicant = await createTestUser('Lars Jensen');
	const committeeId = await addCommittee(conferenceId);
	const admin = createServiceRoleClient();

	const { error } = await admin.from('applications').insert({
		conference_id: conferenceId,
		user_id: applicant.id,
		status: 'submitted',
		committee_preferences: [committeeId],
		motivation: 'I have chaired twice and would like a seat on the Security Council.',
		submitted_at: new Date().toISOString()
	});

	if (error) {
		throw new Error(`Could not write the test application: ${error.message}`);
	}
}

/**
 * One question's own row in the list.
 *
 * A question's label is on the row and also inside the words on each of its two
 * move arrows, so plain text would match three things at once; the row itself
 * is what the assertions about the type and the "Required" badge are really
 * about. Every list in the management area is a `<ul>` of `<li>`s —
 * `routes/manage/[slug]/committees/+page.svelte` is the model — so the row is
 * found by its role and narrowed by the one label no other row carries.
 */
function questionRow(main: Locator, label: string): Locator {
	return main.getByRole('listitem').filter({ hasText: label });
}

/** What `fillQuestionForm` types into the add-or-edit form under the list. */
type QuestionFormFields = {
	label: string;
	helpText?: string;
	/** The words in the dropdown, such as "Pick one". */
	type?: string;
	/** The choices, one per line, the way the box asks for them. */
	options?: string;
	isRequired?: boolean;
};

/**
 * Fill the question form in.
 *
 * Adding and editing draw the same form with different words on its one button:
 * "Add question" under the list, "Save question" while `?edit=` names a
 * question.
 */
async function fillQuestionForm(section: Locator, fields: QuestionFormFields): Promise<void> {
	await section.getByLabel('Question', { exact: true }).fill(fields.label);

	if (fields.helpText !== undefined) {
		await section.getByLabel('Help text', { exact: true }).fill(fields.helpText);
	}

	if (fields.type !== undefined) {
		await section.getByLabel('Type', { exact: true }).selectOption({ label: fields.type });
	}

	if (fields.options !== undefined) {
		await section.getByLabel('Options', { exact: true }).fill(fields.options);
	}

	if (fields.isRequired !== undefined) {
		await section
			.getByRole('checkbox', { name: 'Required', exact: true })
			.setChecked(fields.isRequired);
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
 * "Delete question" is the only `ConfirmButton` on this page. Every test that
 * presses it arranges for the question it means to delete to be the topmost
 * row, because the dialog of the row below carries the same words.
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
	Every test here signs a brand-new account in, seeds a draft conference,
	opens the application form page and then fills a form in, sometimes several
	times. That is a great deal more than most browser tests do, and thirty
	seconds — what Playwright allows a test by default — is not always enough for
	it while the whole suite is asking the one local database at once.
	`test.slow()` triples that allowance. It is an allowance and not a wait: a
	test that is quick still finishes as quickly as it can.
*/
test.beforeEach(() => {
	test.slow();
});

test('keeps the window in the conference timezone: 09:00 typed in is 09:00 read back', async ({
	page
}) => {
	const conference = await openApplicationFormPage(page, 'Window Round Trip MUN');
	const section = windowSection(page);
	const whoCanApply = whoCanApplySection(page);

	await fillWindowOnDates(page, WINDOW_OPENS_FIELD, WINDOW_CLOSES_FIELD);

	// A conference accepts both kinds of applicant to begin with. Turning one off
	// here is what says the two boxes are saved as well as read.
	await whoCanApply.getByRole('checkbox', { name: 'Delegations', exact: true }).uncheck();
	await stopRequiringAPaper(page);

	await pressSaveSettings(page);

	// A draft's save moves on to the next setup step, Fees. The flash floats
	// above the page rather than inside `<main>`, which is why this assertion is
	// not scoped to it.
	await expect(page.getByText(SETTINGS_SAVED)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(page).toHaveURL(`${conference.managePath}/fees`);

	// Asked for again from scratch, so that what is in the boxes came out of the
	// database rather than being the text the browser was already holding.
	await reopenTheApplicationFormPage(page, conference);

	// An opening that has already passed is what "As soon as I publish" means
	// (`openingChoiceFor`), so that is the answer the page reads back, with the
	// saved time still in its box.
	await expect(
		section.getByRole('radio', { name: 'As soon as I publish', exact: true })
	).toBeChecked({ timeout: DATABASE_TIMEOUT_MS });
	await expect(section.getByLabel('Opening time', { exact: true })).toHaveValue(WINDOW_OPENS_FIELD);
	await expect(section.getByLabel('Applications close', { exact: true })).toHaveValue(
		WINDOW_CLOSES_FIELD
	);

	await expect(
		whoCanApply.getByRole('checkbox', { name: 'Individual delegates', exact: true })
	).toBeChecked();
	await expect(
		whoCanApply.getByRole('checkbox', { name: 'Delegations', exact: true })
	).not.toBeChecked();

	/*
		And the moment the database kept is the moment nine in the morning really
		is in Amsterdam, which is the half a box holding its own text cannot show.
		March is an hour ahead of UTC and the end of April is two, so these two
		lines also say that the conversion followed the calendar rather than
		applying one offset to everything.
	*/
	const saved = await readApplicationSettings(conference.id);

	expect(asUtc(saved.applications_open_at)).toBe(WINDOW_OPENS_UTC);
	expect(asUtc(saved.applications_close_at)).toBe(WINDOW_CLOSES_UTC);
	expect(saved.accepts_individual_applications).toBe(true);
	expect(saved.accepts_delegations).toBe(false);
});

/**
 * The "Applications" line of the "Review and publish" page.
 *
 * Every line of that page's "What goes public" list is an `<li>` that starts
 * with its label, so the line is the list item holding that exact word.
 */
function applicationsReviewLine(page: Page): Locator {
	return page
		.getByRole('main')
		.getByRole('region', { name: 'What goes public' })
		.getByRole('listitem')
		.filter({ has: page.getByText('Applications', { exact: true }) });
}

test('marks the application window done on the publish page once it is valid', async ({ page }) => {
	const conference = await openApplicationFormPage(page, 'Checklist Window MUN');

	/*
		The line is open to begin with: a conference this test makes runs in 2020,
		and `./draft-conference` gives a draft no window. The manage redesign moved the publish checklist off the dashboard
		and onto the last setup step, `/manage/<slug>/publish`.
	*/
	await page.goto(`${conference.managePath}/publish`);

	const line = applicationsReviewLine(page);

	await expect(line).toContainText('Choose when applications open and close', {
		timeout: DATABASE_TIMEOUT_MS
	});

	// The line is also a link to this page.
	await line.getByRole('link', { name: 'Set the application window' }).click();

	await waitForTheApplicationFormPage(page);

	await fillWindowOnDates(page, WINDOW_OPENS_FIELD, WINDOW_CLOSES_FIELD);
	await stopRequiringAPaper(page);
	await pressSaveSettings(page);

	await expect(page.getByText(SETTINGS_SAVED)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	/*
		Back to the publish page, where the line is now done. This is the one
		assertion that joins the two halves of the criterion: this page decides
		what a valid window is, `hasApplicationWindow` in
		`src/lib/publish-checklist.ts` decides when the line is done, and the two
		agree only because the form refuses a closing time on or after the
		conference's first day exactly as the checklist does.
	*/
	await page.goto(`${conference.managePath}/publish`);

	// The done line says what the window is: it opened in 2020, so for
	// applicants it opens as soon as the conference is published (T172).
	await expect(line).toContainText('Open as soon as you publish, close on 30 Apr 2020 at 23:59', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(line.getByRole('link', { name: 'Edit applications' })).toBeVisible();
});

test('answers every window rule, and every field of one submit at once', async ({ page }) => {
	const conference = await openApplicationFormPage(page, 'Window Rules MUN');
	const main = page.getByRole('main');
	const whoCanApply = whoCanApplySection(page);

	// The two times the wrong way round, typed into the page because that is what
	// an organiser does. The paper is turned off so that the window is the only
	// thing wrong.
	await fillWindowOnDates(page, WINDOW_CLOSES_FIELD, WINDOW_OPENS_FIELD);
	await stopRequiringAPaper(page);
	await pressSaveSettings(page);

	await expect(main.getByText('Closing must be after opening.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// Nobody may apply at all, which is a conference nobody can come to. A
	// refused save sends back everything that was typed, so the radio and the
	// paper box are still as they were left.
	await fillWindowOnDates(page, WINDOW_OPENS_FIELD, WINDOW_CLOSES_FIELD);
	await whoCanApply.getByRole('checkbox', { name: 'Individual delegates', exact: true }).uncheck();
	await whoCanApply.getByRole('checkbox', { name: 'Delegations', exact: true }).uncheck();
	await pressSaveSettings(page);

	await expect(main.getByText('Accept individuals, delegations, or both.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	/*
		Two rules broken at once, on two different fields, and posted rather than
		typed: an unticked box sends nothing at all, so the only way to send a form
		with neither of them and see what comes back with the times is to ask the
		action directly.

		Two and not three, because the third rule — "Closing must be after
		opening." — is about the very same box as "Applications must close before
		the conference starts.", and only one message fits in a box. The form
		shows the one about the pair of times the organiser just typed, which the
		first attempt above is what proves.

		The one action saves the "What the form asks" fields as well, so they are
		sent too, as answers that break none of their own rules.
	*/
	const response = await postFormAction(page, `${conference.applicationFormPath}?/save`, {
		opensWhen: 'date',
		applicationsOpenAt: WINDOW_OPENS_FIELD,
		applicationsCloseAt: WINDOW_CLOSES_TOO_LATE_FIELD,
		committeePreferenceCount: '2'
	});

	expect(response.status()).toBe(400);

	const answer = await response.text();

	// Both of them, on the one page. That is the criterion: every field that has
	// something wrong with it says so at once, rather than one attempt per field.
	const everyMessage = [
		'Applications must close before the conference starts.',
		'Accept individuals, delegations, or both.'
	];

	for (const message of everyMessage) {
		expect(answer).toContain(message);
	}

	// Not one of the three attempts wrote anything.
	const refused = await readApplicationSettings(conference.id);

	expect(refused.applications_open_at).toBeNull();
	expect(refused.applications_close_at).toBeNull();
	expect(refused.accepts_individual_applications).toBe(true);
});

test('answers every form settings rule, and every field of one submit at once', async ({
	page
}) => {
	const conference = await openApplicationFormPage(page, 'Form Rules MUN');
	const main = page.getByRole('main');
	const section = formSettingsSection(page);

	// Two of the deadline rules are measured against the moment applications
	// open, so the window is arranged rather than typed in again: the section
	// above has two tests of its own.
	await setApplicationWindow(conference.id, WINDOW_OPENS_UTC, WINDOW_CLOSES_UTC);
	await reopenTheApplicationFormPage(page, conference);

	const deadline = section.getByLabel('Position paper deadline', { exact: true });
	const isRequiredBox = section.getByRole('checkbox', {
		name: 'Require a position paper',
		exact: true
	});

	// A conference asks for a position paper by default and has no deadline yet,
	// so this is the state every new conference is really in.
	await isRequiredBox.check();
	await deadline.fill('');
	await pressSaveSettings(page);

	await expect(main.getByText('Please set a deadline for position papers.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// A deadline after the conference is over is a paper nobody would read.
	await isRequiredBox.check();
	await deadline.fill(DEADLINE_AFTER_THE_CONFERENCE_FIELD);
	await pressSaveSettings(page);

	await expect(main.getByText('The deadline must be before the conference ends.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// And one before applications open is a paper nobody could have written.
	await isRequiredBox.check();
	await deadline.fill(DEADLINE_BEFORE_APPLICATIONS_OPEN_FIELD);
	await pressSaveSettings(page);

	await expect(main.getByText('The deadline must be after applications open.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	expect((await readApplicationSettings(conference.id)).position_paper_deadline).toBeNull();

	/*
		Two fields wrong at once, posted rather than typed: the preferences
		dropdown always has one of its numbers chosen, so a browser cannot send
		it empty, and the rule for it can only be seen by asking the action. The
		window half of the form is sent as well, as the saved window, so that
		nothing there is wrong.
	*/
	const response = await postFormAction(page, `${conference.applicationFormPath}?/save`, {
		opensWhen: 'date',
		applicationsOpenAt: WINDOW_OPENS_FIELD,
		applicationsCloseAt: WINDOW_CLOSES_FIELD,
		acceptsIndividualApplications: 'on',
		committeePreferenceCount: '',
		positionPaperRequired: 'on',
		positionPaperDeadline: ''
	});

	expect(response.status()).toBe(400);

	const answer = await response.text();

	expect(answer).toContain('Please choose how many committee preferences to ask for.');
	expect(answer).toContain('Please set a deadline for position papers.');

	// And the way through, so that the four refusals above are refusals rather
	// than a section that never saves anything.
	await reopenTheApplicationFormPage(page, conference);

	await section.getByLabel('Committee preferences', { exact: true }).selectOption('3');
	await section.getByRole('checkbox', { name: 'Ask for a motivation', exact: true }).check();
	await isRequiredBox.check();
	await deadline.fill(DEADLINE_FIELD);
	await pressSaveSettings(page);

	await expect(page.getByText(SETTINGS_SAVED)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	const saved = await readApplicationSettings(conference.id);

	expect(saved.committee_preference_count).toBe(3);
	expect(saved.ask_motivation).toBe(true);
	expect(saved.position_paper_required).toBe(true);
	expect(asUtc(saved.position_paper_deadline)).toBe(DEADLINE_UTC);
});

test('previews the apply page, which asks for the committee preferences just saved', async ({
	page
}) => {
	const conference = await openApplicationFormPage(page, 'Preview Apply MUN');
	const section = formSettingsSection(page);

	// Three committees, because the form is about to be told to ask for three
	// preferences and the apply page can only offer the committees there are.
	await addCommittee(conference.id, 'Security Council');
	await addCommittee(conference.id, 'Human Rights Council');
	await addCommittee(conference.id, 'Environment Assembly');

	// The preview leads to the page a delegate sees, and a delegate only sees the
	// form of a published conference inside an open window.
	await publishAndOpenApplications(conference.id);

	// The setting itself, moved off the two a new conference starts with, so that
	// what the apply page draws can only have come from the database.
	await reopenTheApplicationFormPage(page, conference);
	await section.getByLabel('Committee preferences', { exact: true }).selectOption('3');

	/*
		And position papers turned off first. A new conference asks for one and
		has no deadline yet, so the form refuses to save at all until one of the
		two is settled — which is the rule the test above this one is about.
		Turning it off is the shorter way through, and this test is about the
		committee preferences.
	*/
	await stopRequiringAPaper(page);

	/*
		The one save sends the window too, and the window arranged above closes
		in three months, long after this conference's 2020 dates, which the form
		rightly refuses. An empty closing box is a window that stays open, so the
		apply page still takes applications.
	*/
	await windowSection(page).getByLabel('Applications close', { exact: true }).fill('');

	// Published, so the page has its own "Save changes" rather than the setup
	// footer, and saving stays on this page.
	await pressSaveSettings(page);

	await expect(page.getByText(SETTINGS_SAVED)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	// The button T24 put beside the title. It is an ordinary link, so it works
	// with scripting switched off like everything else on this page.
	const preview = page.getByRole('main').getByRole('link', { name: 'Preview apply page' });

	await expect(preview).toBeVisible();

	await preview.click();

	await expect(page).toHaveURL(`/conferences/${conference.slug}/apply`, {
		timeout: DATABASE_TIMEOUT_MS
	});

	/*
		And the form really asks for three committees.

		This is the one assertion that joins the two halves of the sixth criterion
		of `application-form.md`: this page decides how many preferences the form
		asks for, and the apply page draws that many selects. The conference has no
		custom questions, so the only dropdowns inside `<main>` are those
		preferences and nothing else can be counted by mistake.
	*/
	await expect(page.getByRole('main').getByRole('combobox')).toHaveCount(3, {
		timeout: DATABASE_TIMEOUT_MS
	});
});

test('will not ask for fewer committee preferences once somebody has applied', async ({ page }) => {
	const conference = await openApplicationFormPage(page, 'Preference Lock MUN');

	await submitAnApplication(conference.id);
	await reopenTheApplicationFormPage(page, conference);

	const main = page.getByRole('main');
	const section = formSettingsSection(page);

	// A new conference asks for two preferences, which is where this starts.
	expect((await readApplicationSettings(conference.id)).committee_preference_count).toBe(2);

	/*
		Saving the form at all means answering its other rules, and a new
		conference asks for a position paper without having a deadline for one. The
		paper is not what this test is about, so it is turned off rather than given
		a deadline.
	*/
	await stopRequiringAPaper(page);

	// Down from two to one. Somebody has already chosen two committees, and
	// taking one of those choices away would throw away an answer they gave.
	await section.getByLabel('Committee preferences', { exact: true }).selectOption('1');
	await pressSaveSettings(page);

	await expect(
		main.getByText('You cannot ask for fewer preferences after people applied.')
	).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	expect((await readApplicationSettings(conference.id)).committee_preference_count).toBe(2);

	// Up from two to three is allowed: nobody's answers are lost by asking for
	// one more, and the people who have already applied simply left it blank.
	await stopRequiringAPaper(page);
	await section.getByLabel('Committee preferences', { exact: true }).selectOption('3');
	await pressSaveSettings(page);

	await expect(page.getByText(SETTINGS_SAVED)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	expect((await readApplicationSettings(conference.id)).committee_preference_count).toBe(3);
});

test('shows the empty state to a conference with no custom questions', async ({ page }) => {
	await openApplicationFormPage(page, 'No Questions MUN');

	const main = page.getByRole('main');

	// `EmptyState` draws its title as a heading, the way the dashboard's "No
	// applications yet." is read in `manage-dashboard.spec.ts`.
	await expect(main.getByRole('heading', { name: 'No custom questions.' })).toBeVisible();
	await expect(
		main.getByText(
			'The form already asks for profile, preferences and motivation. Add anything else you need.'
		)
	).toBeVisible();
});

test('adds a question, lists it with its type, edits it through ?edit= and deletes it', async ({
	page
}) => {
	const conference = await openApplicationFormPage(page, 'Question Form MUN');
	const main = page.getByRole('main');
	const section = questionsSection(page);
	const label = unusedName('Dietary requirements');
	const helpText = 'Anything the caterers should know.';

	await fillQuestionForm(section, {
		label,
		helpText,
		type: 'Short answer',
		options: '',
		isRequired: true
	});
	await section.getByRole('button', { name: 'Add question' }).press('Enter');

	await expect(page.getByText('Question added.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	const row = questionRow(main, label);

	await expect(row).toContainText('Short answer', { timeout: DATABASE_TIMEOUT_MS });
	await expect(row).toContainText('Required');

	const added = await readQuestions(conference.id);

	expect(added).toHaveLength(1);
	expect(added[0]).toMatchObject({
		label,
		help_text: helpText,
		type: 'short_text',
		is_required: true,
		options: []
	});

	// Editing is a page of its own at `?edit=<questionId>` rather than a box that
	// opens, which is what makes it work with no script and survive a refresh.
	await main.getByRole('link', { name: 'Edit' }).click();

	await expect(page).toHaveURL(`${conference.applicationFormPath}?edit=${added[0].id}`, {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(section.getByLabel('Question', { exact: true })).toHaveValue(label);
	await expect(section.getByLabel('Help text', { exact: true })).toHaveValue(helpText);

	// The way back out without saving anything.
	await expect(section.getByRole('link', { name: 'Cancel' })).toBeVisible();

	const clearerHelpText = 'Allergies, or anything you cannot eat.';

	await section.getByLabel('Help text', { exact: true }).fill(clearerHelpText);
	await section.getByRole('checkbox', { name: 'Required', exact: true }).uncheck();
	await section.getByRole('button', { name: 'Save question' }).press('Enter');

	await expect(page.getByText('Question saved.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	const saved = await readQuestions(conference.id);

	expect(saved).toHaveLength(1);
	expect(saved[0].help_text).toBe(clearerHelpText);
	expect(saved[0].is_required).toBe(false);

	// The row says so too: a question nobody has to answer is not marked
	// "Required".
	await expect(questionRow(main, label)).not.toContainText('Required');

	await pressAndConfirm(page, 'Delete question');

	await expect(page.getByText('Question deleted.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	expect(await readQuestions(conference.id)).toEqual([]);
});

// T142: with JavaScript a question leaves the list the moment "Delete question"
// is confirmed, before the server has saved it and with no spinner, and a
// deletion the server refuses puts the question back with a toast.
test('deletes a question at once, and puts a refused deletion back', async ({ page }, testInfo) => {
	skipWithoutJavaScript(testInfo);

	const conference = await signInWithAConference(page, 'Instant Question MUN');
	const firstLabel = unusedName('Dietary requirements');
	const secondLabel = unusedName('Previous conferences');
	await addQuestion(conference.id, { label: firstLabel, position: 0 });
	await addQuestion(conference.id, { label: secondLabel, position: 1 });

	await reopenTheApplicationFormPage(page, conference);
	const main = page.getByRole('main');
	await expect(questionRow(main, firstLabel)).toBeVisible();

	await answerSlowly(page, 'deleteQuestion');
	await watchForSpinners(page);
	await pressAndConfirm(page, 'Delete question');

	await expect(questionRow(main, firstLabel)).toHaveCount(0, { timeout: AT_ONCE_TIMEOUT_MS });

	await waitUntilAnswered(page);
	expect(await sawSpinner(page)).toBe(false);
	expect((await readQuestions(conference.id)).map((question) => question.label)).toEqual([
		secondLabel
	]);

	await answerWithError(page, 'deleteQuestion');
	await pressAndConfirm(page, 'Delete question');

	await expect(page.getByRole('alert')).toContainText('The question was not deleted.', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(page);
	await expect(questionRow(main, secondLabel)).toBeVisible();
	expect(await readQuestions(conference.id)).toHaveLength(1);
});

test('moves a question one place, and the new order is still there after a refresh', async ({
	page
}) => {
	const conference = await openApplicationFormPage(page, 'Reorder Questions MUN');

	const firstLabel = unusedName('Dietary requirements');
	const secondLabel = unusedName('T-shirt size');
	const thirdLabel = unusedName('Have you chaired before');

	await addQuestion(conference.id, { label: firstLabel, position: 0 });
	await addQuestion(conference.id, { label: secondLabel, position: 1 });
	await addQuestion(conference.id, { label: thirdLabel, position: 2 });

	await reopenTheApplicationFormPage(page, conference);

	const main = page.getByRole('main');

	// In `position` order, which is the order the applicant will be asked them
	// in. `[\s\S]*` means "anything in between", line breaks included.
	await expect(main).toHaveText(
		new RegExp(`${firstLabel}[\\s\\S]*${secondLabel}[\\s\\S]*${thirdLabel}`),
		{ timeout: DATABASE_TIMEOUT_MS }
	);

	// Each arrow names the question it belongs to, because "Move up" twenty times
	// over tells a screen-reader user nothing about which row they are on. That
	// also means a test never has to count rows to find the right button.
	await main.getByRole('button', { name: `Move ${firstLabel} down` }).press('Enter');

	// Exactly one place: the first and the second have swapped and the third has
	// not moved. A "move to the bottom" would pass a test that only looked at
	// where the first question ended up.
	await expect(main).toHaveText(
		new RegExp(`${secondLabel}[\\s\\S]*${firstLabel}[\\s\\S]*${thirdLabel}`),
		{ timeout: DATABASE_TIMEOUT_MS }
	);

	// The list above answers in place (T125): it shows the swap the moment the
	// press is sent, before the server has saved anything. Reading the database
	// straight after that would race the request, so this waits until nothing
	// on the page is still busy first.
	await waitUntilAnswered(page);

	// The database really holds the new order, which is what makes it survive a
	// refresh rather than being something the page did to itself.
	const afterMove = await readQuestions(conference.id);

	expect(afterMove.map((question) => question.label)).toEqual([
		secondLabel,
		firstLabel,
		thirdLabel
	]);

	await reopenTheApplicationFormPage(page, conference);

	await expect(main).toHaveText(
		new RegExp(`${secondLabel}[\\s\\S]*${firstLabel}[\\s\\S]*${thirdLabel}`),
		{ timeout: DATABASE_TIMEOUT_MS }
	);

	// And back up again, so that both arrows are shown to work.
	await main.getByRole('button', { name: `Move ${firstLabel} up` }).press('Enter');

	await expect(main).toHaveText(
		new RegExp(`${firstLabel}[\\s\\S]*${secondLabel}[\\s\\S]*${thirdLabel}`),
		{ timeout: DATABASE_TIMEOUT_MS }
	);
});

test('asks a choice question for two options, and ignores the box for every other type', async ({
	page
}) => {
	const conference = await openApplicationFormPage(page, 'Question Options MUN');
	const main = page.getByRole('main');
	const section = questionsSection(page);
	const choiceLabel = unusedName('T-shirt size');

	// One option is not a choice at all.
	await fillQuestionForm(section, { label: choiceLabel, type: 'Pick one', options: 'Small' });
	await section.getByRole('button', { name: 'Add question' }).press('Enter');

	await expect(main.getByText('Please give at least two options, one per line.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// The refusal redraws the form with what was sent, so typing before it has
	// arrived could be overwritten; wait for it before filling the form again.
	await waitUntilAnswered(page);

	// And two lines that say the same thing are still one option.
	await fillQuestionForm(section, {
		label: choiceLabel,
		type: 'Pick one',
		options: 'Small\nSmall'
	});
	await section.getByRole('button', { name: 'Add question' }).press('Enter');

	await expect(main.getByText('Please give at least two options, one per line.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// The same message is still on screen from the first press, so it proves
	// nothing about this one; wait for this press to be answered as well.
	await waitUntilAnswered(page);
	expect(await readQuestions(conference.id)).toEqual([]);

	await fillQuestionForm(section, {
		label: choiceLabel,
		type: 'Pick one',
		options: 'Small\nMedium\nLarge'
	});
	await section.getByRole('button', { name: 'Add question' }).press('Enter');

	// The toast says "Question added." every time one is added, so the one still
	// on screen from an earlier press in this test (T125: it answers in place and
	// does not reload) can already match before this new press has gone anywhere.
	// Waiting for nothing on the page to be busy first ties the check to this
	// press rather than to whichever toast happens to be showing.
	await waitUntilAnswered(page);
	await expect(page.getByText('Question added.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	const withOptions = await readQuestions(conference.id);

	expect(withOptions).toHaveLength(1);
	expect(withOptions[0].type).toBe('single_choice');
	expect(withOptions[0].options).toEqual(['Small', 'Medium', 'Large']);

	/*
		The same box, filled in the same way, on a question that has no choices:
		the options are thrown away rather than stored or complained about, so that
		somebody who typed them, changed their mind about the type and did not
		empty the box is not stopped.
	*/
	const textLabel = unusedName('Why this conference');

	await fillQuestionForm(section, {
		label: textLabel,
		type: 'Long answer',
		options: 'Small\nMedium\nLarge'
	});
	await section.getByRole('button', { name: 'Add question' }).press('Enter');

	// Same reasoning as above: the previous add already left this same toast on
	// screen, so this waits for the new press to actually settle before trusting
	// either the toast or the database.
	await waitUntilAnswered(page);
	await expect(page.getByText('Question added.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	const both = await readQuestions(conference.id);
	const textQuestion = both.find((question) => question.label === textLabel);

	expect(textQuestion?.type).toBe('long_text');
	expect(textQuestion?.options).toEqual([]);
});

test('answers every question rule at once, and stops at twenty questions', async ({ page }) => {
	const conference = await openApplicationFormPage(page, 'Question Rules MUN');
	const addQuestionAction = `${conference.applicationFormPath}?/addQuestion`;

	/*
		Every field wrong at once. It is posted rather than typed, because the
		question is `required`, the type is a dropdown with a value already in it
		and the help text box has a `maxlength`, so a browser refuses to send
		several of these at all — which is the right behaviour, and is also why the
		server's own answer can only be seen by asking it directly.
	*/
	const response = await postFormAction(page, addQuestionAction, {
		label: '',
		helpText: TOO_LONG_HELP_TEXT,
		type: '',
		options: ''
	});

	expect(response.status()).toBe(400);

	const answer = await response.text();

	const everyMessage = [
		'Please enter the question.',
		'Please keep the help text under 300 characters.',
		'Please pick a question type.'
	];

	for (const message of everyMessage) {
		expect(answer).toContain(message);
	}

	// A question that is too long earns a sentence of its own, which the empty
	// one above could not also have shown.
	const tooLong = await postFormAction(page, addQuestionAction, {
		label: TOO_LONG_LABEL,
		type: 'short_text',
		options: ''
	});

	expect(tooLong.status()).toBe(400);
	expect(await tooLong.text()).toContain('Please keep the question under 200 characters.');

	// Neither of them wrote anything.
	expect(await readQuestions(conference.id)).toEqual([]);

	// A form with more than twenty extra questions on it is a form nobody
	// finishes, so the twenty-first is refused.
	for (let index = 0; index < MAXIMUM_QUESTIONS; index += 1) {
		await addQuestion(conference.id, { label: `Question ${index + 1}`, position: index });
	}

	const full = await postFormAction(page, addQuestionAction, {
		label: 'One question too many',
		type: 'short_text',
		options: ''
	});

	expect(full.status()).toBe(400);
	expect(await full.text()).toContain('You can add up to 20 questions.');
	expect(await readQuestions(conference.id)).toHaveLength(MAXIMUM_QUESTIONS);
});

test('will not change a saved question once an application exists', async ({ page }) => {
	const conference = await openApplicationFormPage(page, 'Question Lock MUN');

	/*
		The application is written first and the question second, because the
		`validate_application` trigger wants an answer to every required question
		that exists on the day an application arrives, and this one has no answers
		to give. What the page is asked about is only whether a non-draft
		application exists at all.
	*/
	await submitAnApplication(conference.id);

	const label = unusedName('T-shirt size');
	const questionId = await addQuestion(conference.id, {
		label,
		type: 'single_choice',
		options: ['Small', 'Medium', 'Large'],
		position: 0
	});

	await page.goto(`${conference.applicationFormPath}?edit=${questionId}`);
	await waitForTheApplicationFormPage(page);

	const main = page.getByRole('main');
	const section = questionsSection(page);

	// Turning a set of choices into a paragraph would leave every answer already
	// given as a word nothing on the form offers.
	await section.getByLabel('Type', { exact: true }).selectOption({ label: 'Long answer' });
	await section.getByRole('button', { name: 'Save question' }).press('Enter');

	await expect(
		main.getByText('This question already has answers. Add a new question instead.')
	).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	const unchanged = await readQuestions(conference.id);

	expect(unchanged[0].type).toBe('single_choice');
	expect(unchanged[0].options).toEqual(['Small', 'Medium', 'Large']);

	/*
		A question id that names no question of this conference. The form only ever
		sends an id the page itself drew, so this can only be posted by hand, and
		the action has to answer it: without the check, an organiser could edit
		another conference's question through their own page.
	*/
	const stray = await postFormAction(page, `${conference.applicationFormPath}?/updateQuestion`, {
		questionId: crypto.randomUUID(),
		label: 'Smuggled question',
		type: 'short_text',
		options: ''
	});

	expect(stray.status()).toBe(400);
	expect(await stray.text()).toContain('That question is not part of this conference.');
});

test('says at the top what the application window is doing', async ({ page }) => {
	const conference = await openApplicationFormPage(page, 'Window Notice MUN');
	const main = page.getByRole('main');

	// A draft has no notice: nobody can apply to it yet, and the setup steps say
	// what is left to do instead.
	await expect(main.getByText('Set an opening and closing time')).toHaveCount(0);

	// Public, still with neither time, so the notice asks for them.
	await publishWithTheWindowItHas(conference.id);
	await reopenTheApplicationFormPage(page, conference);

	await expect(main.getByText('Set an opening and closing time')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// A window that opened and closed in 2020.
	await setApplicationWindow(conference.id, WINDOW_OPENS_UTC, WINDOW_CLOSES_UTC);
	await reopenTheApplicationFormPage(page, conference);

	await expect(main.getByText('Closed on')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	// The window itself is written out under the first line, in the conference's
	// own timezone, so that an organiser can check it without opening the boxes.
	await expect(main).toContainText(WINDOW_ON_THE_PAGE);

	// Opened long ago and not closing for a very long time.
	await setApplicationWindow(conference.id, WINDOW_OPENS_UTC, FAR_OFF);
	await reopenTheApplicationFormPage(page, conference);

	await expect(main.getByText('Applications are open now')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(main.getByText('Closed on')).toHaveCount(0);

	// Both times still to come.
	await setApplicationWindow(conference.id, FAR_OFF, FURTHER_OFF);
	await reopenTheApplicationFormPage(page, conference);

	await expect(main.getByText('Open on')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(main.getByText('Applications are open now')).toHaveCount(0);
});

test('answers the application form page of a conference somebody else runs with a 404', async ({
	page
}) => {
	const conference = await openApplicationFormPage(page, 'Not My Conference MUN');

	// A second account with a conference of its own, so the refusal below is
	// about this conference and not about the reader being a stranger to the
	// whole management area. Clearing the cookies is what ends the first
	// account's session; without that, `/login` would send an account that is
	// already signed in somewhere else.
	await page.context().clearCookies();

	const otherOrganiser = await createTestUser('Tomas Novak');
	await signIn(page, otherOrganiser);

	const ownManagePath = await createDraftConference(otherOrganiser, {
		name: unusedName('Other Organiser MUN'),
		organizationName: unusedName('Other Organiser Society')
	});

	const response = await page.goto(conference.applicationFormPath);

	// A 404 and not a 403, for the reason `manage.spec.ts` gives: an answer must
	// not tell anybody which conferences exist or who runs them.
	expect(response?.status()).toBe(404);

	// And their own application form page opens, which is what says the 404 was
	// about this conference rather than about the page.
	await page.goto(`${ownManagePath}/application-form`);
	await waitForTheApplicationFormPage(page);
});

test('answers somebody who posts to save for a conference they do not run', async ({ page }) => {
	const conference = await openApplicationFormPage(page, 'Not Yours Window MUN');

	await page.context().clearCookies();

	const stranger = await createTestUser('Aiko Tanaka');
	await signIn(page, stranger);

	const response = await postFormAction(page, `${conference.applicationFormPath}?/save`, {
		opensWhen: 'date',
		applicationsOpenAt: WINDOW_OPENS_FIELD,
		applicationsCloseAt: WINDOW_CLOSES_FIELD,
		acceptsIndividualApplications: 'on',
		committeePreferenceCount: '2'
	});

	// The action asks `requirePermission` for itself rather than trusting the page
	// that drew the button, which is what `specs/02-architecture/permissions.md`
	// asks of every action.
	expect(response.status()).toBe(404);

	// And the refusal is the whole point, so the window is still unset.
	const untouched = await readApplicationSettings(conference.id);

	expect(untouched.applications_open_at).toBeNull();
	expect(untouched.applications_close_at).toBeNull();
});

test('does not spill off the side of a phone screen', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	// Long names on purpose. A line that may not wrap is as wide as its text
	// however narrow its column is, which is what pushes a page sideways, and a
	// short name would never show it.
	const conference = await openApplicationFormPage(
		page,
		'Phone Application Form International Model United Nations Conference'
	);

	const longQuestionLabel =
		'Which committees have you chaired before, and at which conferences were they?';

	await setApplicationWindow(conference.id, WINDOW_OPENS_UTC, WINDOW_CLOSES_UTC);
	await addQuestion(conference.id, {
		label: longQuestionLabel,
		type: 'long_text',
		helpText: 'Tell us about every committee you have chaired, however long ago it was.',
		position: 0
	});
	await addQuestion(conference.id, {
		label: 'Which size of conference T-shirt would you like us to order for you?',
		type: 'single_choice',
		options: ['Extra small', 'Small', 'Medium', 'Large', 'Extra large'],
		position: 1
	});

	await reopenTheApplicationFormPage(page, conference);

	// Wait for the page to be the one this test is about before measuring it.
	await expect(questionRow(page.getByRole('main'), longQuestionLabel)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	await expectNoSidewaysOverflow(page);
});

test('fits in a few screens', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough to measure a height.');

	const conference = await openApplicationFormPage(page, 'Height Check Application Form MUN');

	const questionLabels = [
		unusedName('Dietary requirements'),
		unusedName('T-shirt size'),
		unusedName('Have you chaired before'),
		unusedName('Anything else we should know')
	];

	await setApplicationWindow(conference.id, WINDOW_OPENS_UTC, WINDOW_CLOSES_UTC);

	// A list with something on it: four questions, which is more than most
	// conferences ask, each with a help text so that no row is a bare line.
	for (const [index, label] of questionLabels.entries()) {
		await addQuestion(conference.id, {
			label,
			type: index % 2 === 0 ? 'short_text' : 'single_choice',
			options: index % 2 === 0 ? [] : ['Small', 'Medium', 'Large'],
			helpText: 'One quiet line under the question, which is what an organiser writes here.',
			position: index
		});
	}

	await reopenTheApplicationFormPage(page, conference);

	await expect(questionRow(page.getByRole('main'), questionLabels[3])).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// Saved before the assertion, so that a failure leaves a picture of the page
	// that failed it.
	await saveFullPageScreenshot(page, 'manage-application-form');
	await expectPageFitsInScreens(page, MANAGE_APPLICATION_FORM_SCREENS);
});
