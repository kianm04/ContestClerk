import { expect, test, type APIResponse, type Locator, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { createTestUser, giveApplication, giveSeat, signIn, type TestUser } from './signed-in-user';
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

// The acceptance criteria of `specs/05-pages/organiser/application-review.md`,
// for the page T71 builds at `/manage/[slug]/applications/[applicationId]`:
//
// * every private profile detail is shown to the organiser, and the page is a
//   404 for somebody who does not run the conference;
// * the seat dropdown offers only free seats, the applicant's committees first;
// * a waitlisted application can be accepted, and an accepted one is refused;
// * revoking frees the seat and voids an unpaid invoice;
// * Previous and Next walk the queue in the table's own order;
// * the internal note is stored, and the applicant's own page never shows it;
// * a team of friends is one entry, accepted into one country, and the
//   organiser can team up separate applicants or split them (Trello pZNcdPqU);
// * the applicant's public profile is one press away.
//
// EVERYTHING HERE RUNS WITHOUT JAVASCRIPT
// Every test runs on all three projects, `desktop-no-js` included, which is the
// "All actions work without JavaScript" criterion. Every form on the page is a
// real `<form method="post">`, the seat choice is one plain `<select>`, and
// `ConfirmButton` opens a confirmation page asking the same question when there
// is no script to open its dialog. The two tests that measure the page run on
// one project each.
//
// WHAT THESE TESTS LEAVE BEHIND
// Each test signs a brand-new account in and creates its own conference through
// `./draft-conference`, for the reasons `tests/e2e/manage-applications.spec.ts`
// gives at length: three projects run at once against one database, so every
// committee, seat, fee and applicant here is the test's own and nothing is put
// back. `createDraftConference`, `signInWithAConference`, `addCommittee`,
// `addSeat`, `addDelegateFee`, `addApplicant`, `postFormFields` and
// `pressAndConfirm` are copies of the ones in that file and in
// `tests/e2e/manage-delegation-review.spec.ts`, for the reason those files give
// for copying rather than sharing.

/** How long an assertion that waits on a page reading the database may take. */
const DATABASE_TIMEOUT_MS = 15_000;

/**
 * How long `pressAndConfirm` waits for a dialog before deciding there is none,
 * which is the answer on `desktop-no-js`.
 */
const SINGLE_TRY_TIMEOUT_MS = 2_000;

/** The days a conference these tests create runs on. In the past, so `/conferences` never lists it. */
const CONFERENCE_FIRST_DAY = '2020-05-03';
const CONFERENCE_LAST_DAY = '2020-05-05';

/** What the conference charges one delegate, so that accepting raises an invoice. */
const DELEGATE_FEE_CENTS = 6500;

/**
 * How many windows tall the review page may be with a full application on it.
 * Three, the ceiling every organiser page with real content is held to.
 */
const REVIEW_PAGE_SCREENS = 3;

/**
 * The narrowest window, in CSS pixels, that draws the applications list's review
 * panel beside the table: Tailwind's `xl`, which the desktop projects' 1280px
 * window just reaches.
 */
const REVIEW_PANEL_MIN_WIDTH_PX = 1280;

/** A name nothing else in the database will match. */
function unusedName(prefix: string): string {
	return `${prefix} ${crypto.randomUUID().slice(0, 8)}`;
}

/** A signed-in organiser with a conference of their own. */
type TestConference = {
	user: TestUser;
	id: string;
	slug: string;
	/** The `/manage/<slug>/applications` address of the table. */
	applicationsPath: string;
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
async function createDraftConference(user: TestUser, prefix: string): Promise<string> {
	const draft = await createDraftConferenceFor(user, {
		name: unusedName(prefix),
		organizationName: unusedName(`${prefix} Society`),
		startDate: CONFERENCE_FIRST_DAY,
		endDate: CONFERENCE_LAST_DAY
	});

	return `/manage/${draft.slug}`;
}

/** The id of the conference with this slug, which ends in a random suffix. */
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

/** Sign a brand-new account in and give it a conference of its own. */
async function signInWithAConference(page: Page, prefix: string): Promise<TestConference> {
	const user = await createTestUser('Priya Nair');
	await signIn(page, user);

	const managePath = await createDraftConference(user, prefix);
	const slug = managePath.split('/').pop() ?? '';
	const id = await readConferenceId(slug);

	return { user, id, slug, applicationsPath: `${managePath}/applications` };
}

/** Give the conference one committee, and answer its id. */
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

/** Put one free seat in a committee, and answer its id. */
async function addSeat(committeeId: string, name: string, countryCode: string): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('seats')
		.insert({
			committee_id: committeeId,
			name,
			kind: 'country',
			country_code: countryCode,
			position: 0,
			is_available: true
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test seat: ${error?.message}`);
	}

	return data.id;
}

/** Give the conference one fee for every individual, open forever, so accepting raises an invoice. */
async function addDelegateFee(conferenceId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin.from('fees').insert({
		conference_id: conferenceId,
		name: 'Delegate fee',
		amount_cents: DELEGATE_FEE_CENTS,
		applies_to: 'individual',
		valid_from: null,
		valid_until: null,
		position: 0
	});

	if (error) {
		throw new Error(`Could not write the test fee: ${error.message}`);
	}
}

/** An applicant a test made, and the application they sent. */
type Applicant = {
	user: TestUser;
	applicationId: string;
};

/**
 * Create one applicant with one application. The row is seeded through
 * `giveApplication`, whose doc comment explains what `validate_application`
 * still insists on: committees of this conference and a motivation.
 */
async function addApplicant(
	conferenceId: string,
	status: 'submitted' | 'waitlisted' | 'accepted',
	committeePreferences: string[],
	fullName = unusedName('Delegate')
): Promise<Applicant> {
	const user = await createTestUser(fullName);

	const applicationId = await giveApplication(user, {
		conferenceId,
		status,
		committeePreferences,
		motivation: 'I have chaired twice and would like a seat this year.'
	});

	return { user, applicationId };
}

/** The private facts `writePrivateDetails` writes, and the page is expected to show. */
const PRIVATE_DETAILS = {
	phone: '+31 6 5555 0101',
	dietaryRequirements: 'No peanuts',
	emergencyContactName: 'Joanna Nair',
	emergencyContactPhone: '+31 6 5555 0202',
	dateOfBirth: '2008-02-14'
};

/**
 * Fill in the applicant's `profile_details`. `handle_new_user` already made the
 * row, so this updates it; the service-role client stands in for `/settings`.
 */
async function writePrivateDetails(user: TestUser): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('profile_details')
		.update({
			phone: PRIVATE_DETAILS.phone,
			dietary_requirements: PRIVATE_DETAILS.dietaryRequirements,
			emergency_contact_name: PRIVATE_DETAILS.emergencyContactName,
			emergency_contact_phone: PRIVATE_DETAILS.emergencyContactPhone,
			date_of_birth: PRIVATE_DETAILS.dateOfBirth
		})
		.eq('user_id', user.id);

	if (error) {
		throw new Error(`Could not write the test private details: ${error.message}`);
	}
}

/** One application as the tests read it back: its status, and the organisers' note on it. */
type ApplicationRow = {
	status: string;
	internal_note: string | null;
};

/**
 * One application read back with the service-role client. The note is a row
 * of `application_internal_notes` rather than a column of the application
 * (migration 20261022132000), so it is a second read, and `null` when nobody
 * has written one.
 */
async function readApplication(applicationId: string): Promise<ApplicationRow> {
	const admin = createServiceRoleClient();

	const [applicationResult, noteResult] = await Promise.all([
		admin
			.from('applications')
			.select('status')
			.eq('id', applicationId)
			.maybeSingle()
			.overrideTypes<{ status: string }, { merge: false }>(),
		admin
			.from('application_internal_notes')
			.select('note')
			.eq('application_id', applicationId)
			.maybeSingle()
			.overrideTypes<{ note: string | null }, { merge: false }>()
	]);

	if (applicationResult.error || !applicationResult.data) {
		throw new Error(`Could not read the test application: ${applicationResult.error?.message}`);
	}

	if (noteResult.error) {
		throw new Error(`Could not read the test application's note: ${noteResult.error.message}`);
	}

	return { status: applicationResult.data.status, internal_note: noteResult.data?.note ?? null };
}

/** Who is sitting in one seat, or `null`. */
async function readSeatHolder(seatId: string): Promise<string | null> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('seats')
		.select('user_id')
		.eq('id', seatId)
		.maybeSingle();

	if (error || !data) {
		throw new Error(`Could not read the test seat: ${error?.message}`);
	}

	return data.user_id;
}

/** The statuses of every invoice for one seat. */
async function readInvoiceStatuses(seatId: string): Promise<string[]> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin.from('invoices').select('status').eq('seat_id', seatId);

	if (error || !data) {
		throw new Error(`Could not read the test invoices: ${error?.message}`);
	}

	return data.map((row) => row.status);
}

/** The review page's address for one application, with no queue. */
function reviewPath(conference: TestConference, applicationId: string): string {
	return `${conference.applicationsPath}/${applicationId}`;
}

/** Open one application's review page and wait for its heading. */
async function openReviewPage(page: Page, path: string, applicantName: string): Promise<void> {
	await page.goto(path);

	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
		applicantName,
		{ timeout: DATABASE_TIMEOUT_MS }
	);
}

/**
 * Post to a form action the way a browser with no script does, carrying the
 * browser's own cookies. `accept: text/html` is what makes SvelteKit draw the
 * page again rather than answer JSON; `tests/e2e/manage-applications.spec.ts`
 * explains all three headers.
 */
async function postFormFields(
	page: Page,
	action: string,
	fields: [string, string][]
): Promise<APIResponse> {
	const origin = new URL(page.url()).origin;

	return page.request.post(action, {
		data: new URLSearchParams(fields).toString(),
		headers: {
			origin,
			accept: 'text/html',
			'content-type': 'application/x-www-form-urlencoded'
		}
	});
}

/**
 * Press a `ConfirmButton` and answer its dialog if it opens one. Without
 * JavaScript the press opens a confirmation page asking the same question,
 * which is also right.
 */
async function pressAndConfirm(page: Page, within: Locator, label: string): Promise<void> {
	const button = within.getByRole('button', { name: label }).first();
	const dialogButton = page.getByRole('dialog').getByRole('button', { name: label }).first();

	await button.press('Enter');

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
 * Put applications in one team, the way two friends who applied together would
 * be (Trello pZNcdPqU). The service-role client stands in for the applicants'
 * own "Start a team" and "Join" presses, which `tests/e2e/application.spec.ts`
 * walks through; this file is about what the organiser does with a team.
 */
async function teamUp(conferenceId: string, applicationIds: string[]): Promise<void> {
	const admin = createServiceRoleClient();

	const { data: team, error } = await admin
		.from('application_teams')
		.insert({
			conference_id: conferenceId,
			join_code: crypto.randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()
		})
		.select('id')
		.single();

	if (error || !team) {
		throw new Error(`Could not write the test team: ${error?.message}`);
	}

	const { error: updateError } = await admin
		.from('applications')
		.update({ team_id: team.id })
		.in('id', applicationIds);

	if (updateError) {
		throw new Error(`Could not put the test applications in a team: ${updateError.message}`);
	}
}

/** The team an application is in, read back with the service-role client, or `null`. */
async function readTeamId(applicationId: string): Promise<string | null> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('applications')
		.select('team_id')
		.eq('id', applicationId)
		.single();

	if (error || !data) {
		throw new Error(`Could not read the test application's team: ${error?.message}`);
	}

	return data.team_id;
}

/**
 * Two friends who applied together, each asking for a different committee,
 * and France free in both: the shape of a team the organiser can accept.
 */
async function addTeamOfTwo(conference: TestConference) {
	const securityCouncil = await addCommittee(conference.id, 'Security Council', 'UNSC');
	const humanRights = await addCommittee(conference.id, 'Human Rights Council', 'HRC');
	const franceInSecurityCouncil = await addSeat(securityCouncil, 'France', 'FR');
	const franceInHumanRights = await addSeat(humanRights, 'France', 'FR');

	const first = await addApplicant(conference.id, 'submitted', [securityCouncil]);
	const second = await addApplicant(conference.id, 'submitted', [humanRights]);
	await teamUp(conference.id, [first.applicationId, second.applicationId]);

	return { first, second, franceInSecurityCouncil, franceInHumanRights };
}

/** The labels of the seat dropdown, without its "Choose a seat" placeholder. */
async function seatOptionLabels(main: Locator): Promise<string[]> {
	const labels = await main.locator('select[name="seatId"] option').allTextContents();

	return labels.map((label) => label.trim()).filter((label) => label !== 'Choose a seat');
}

/*
	Every test signs an account in and seeds a conference and its applicants, which
	is more than thirty seconds allows while the whole suite shares one database.
	`test.slow()` triples the allowance; a quick test still finishes quickly.
*/
test.beforeEach(() => {
	test.slow();
});

test('shows the organiser every private detail, and nobody else', async ({ page, browser }) => {
	const conference = await signInWithAConference(page, 'Profile Review MUN');
	const committee = await addCommittee(conference.id, 'Security Council', 'UNSC');
	const applicant = await addApplicant(conference.id, 'submitted', [committee]);
	await writePrivateDetails(applicant.user);

	const path = reviewPath(conference, applicant.applicationId);
	await openReviewPage(page, path, applicant.user.fullName);

	const profile = page.getByRole('region', { name: 'Profile' });

	await expect(profile).toContainText(applicant.user.email);
	await expect(profile).toContainText(PRIVATE_DETAILS.phone);
	await expect(profile).toContainText(PRIVATE_DETAILS.dietaryRequirements);
	await expect(profile).toContainText(
		`${PRIVATE_DETAILS.emergencyContactName} · ${PRIVATE_DETAILS.emergencyContactPhone}`
	);
	await expect(profile).toContainText('Delft University');

	// Somebody signed in who does not run this conference gets a 404, and not
	// one of the private facts, whatever the address says.
	const strangerContext = await browser.newContext();
	const strangerPage = await strangerContext.newPage();
	await signIn(strangerPage, await createTestUser('Tomas Novak'));

	const response = await strangerPage.goto(path);

	expect(response?.status()).toBe(404);
	await expect(strangerPage.getByText(PRIVATE_DETAILS.phone)).toHaveCount(0);
	await strangerContext.close();
});

test('offers only free seats, the committees the applicant asked for first', async ({ page }) => {
	const conference = await signInWithAConference(page, 'Seat Choice MUN');
	const securityCouncil = await addCommittee(conference.id, 'Security Council', 'UNSC');
	const humanRights = await addCommittee(conference.id, 'Human Rights Council', 'HRC');

	await addSeat(securityCouncil, 'Chad', 'TD');
	await addSeat(humanRights, 'France', 'FR');
	await addSeat(humanRights, 'Peru', 'PE');

	// Peru is taken, so it is not a seat the organiser can give.
	const somebodyElse = await createTestUser('Lena Fischer');
	await giveSeat(somebodyElse, humanRights, 'Peru');

	const applicant = await addApplicant(conference.id, 'submitted', [humanRights]);
	await openReviewPage(
		page,
		reviewPath(conference, applicant.applicationId),
		applicant.user.fullName
	);

	expect(await seatOptionLabels(page.getByRole('main'))).toEqual(['HRC · France', 'UNSC · Chad']);
});

test('accepts a waitlisted application, and refuses to accept it twice', async ({ page }) => {
	const conference = await signInWithAConference(page, 'Waitlist Accept MUN');
	const committee = await addCommittee(conference.id, 'Security Council', 'UNSC');
	const franceSeat = await addSeat(committee, 'France', 'FR');
	const chadSeat = await addSeat(committee, 'Chad', 'TD');

	const applicant = await addApplicant(conference.id, 'waitlisted', [committee]);
	const path = reviewPath(conference, applicant.applicationId);
	await openReviewPage(page, path, applicant.user.fullName);

	const main = page.getByRole('main');
	await main.locator('select[name="seatId"]').selectOption(franceSeat);
	await main.getByRole('button', { name: 'Accept and allocate' }).press('Enter');

	await expect(page.getByText(`${applicant.user.fullName} is now France in UNSC.`)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect((await readApplication(applicant.applicationId)).status).toBe('accepted');
	expect(await readSeatHolder(franceSeat)).toBe(applicant.user.id);

	// The allocation panel is gone now, so the second accept is posted the way a
	// page left open in another tab would post it.
	await expect(main.getByRole('button', { name: 'Accept and allocate' })).toHaveCount(0);

	const response = await postFormFields(page, `${path}?/accept`, [['seatId', chadSeat]]);

	expect(response.status()).toBe(400);
	expect(await response.text()).toContain('This application was already decided.');
	expect(await readSeatHolder(chadSeat)).toBeNull();
});

test('revoking frees the seat and voids the unpaid invoice', async ({ page }) => {
	const conference = await signInWithAConference(page, 'Revoke Seat MUN');
	await addDelegateFee(conference.id);
	const committee = await addCommittee(conference.id, 'Security Council', 'UNSC');
	const seat = await addSeat(committee, 'France', 'FR');

	const applicant = await addApplicant(conference.id, 'submitted', [committee]);
	await openReviewPage(
		page,
		reviewPath(conference, applicant.applicationId),
		applicant.user.fullName
	);

	const main = page.getByRole('main');
	await main.locator('select[name="seatId"]').selectOption(seat);
	await main.getByRole('button', { name: 'Accept and allocate' }).press('Enter');

	const decision = page.getByRole('region', { name: 'Decision' });
	await expect(decision.getByRole('link', { name: /^Invoice / })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect(await readInvoiceStatuses(seat)).toEqual(['unpaid']);

	await decision.getByRole('radio', { name: /Withdrawn/ }).check();
	await pressAndConfirm(page, decision, 'Revoke acceptance');

	await expect(page.getByText('The seat is free again.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect(await readSeatHolder(seat)).toBeNull();
	expect(await readInvoiceStatuses(seat)).toEqual(['void']);
	expect((await readApplication(applicant.applicationId)).status).toBe('withdrawn');
});

test('walks the queue with Previous and Next in the table’s own order', async ({ page }) => {
	const conference = await signInWithAConference(page, 'Queue Walk MUN');
	const committee = await addCommittee(conference.id, 'Security Council', 'UNSC');

	const applicants: Applicant[] = [];

	for (let index = 0; index < 3; index++) {
		applicants.push(await addApplicant(conference.id, 'submitted', [committee]));
	}

	await page.goto(conference.applicationsPath);

	const main = page.getByRole('main');
	const nameLinks = main.getByRole('link', { name: /^Delegate / });
	await expect(nameLinks).toHaveCount(3, { timeout: DATABASE_TIMEOUT_MS });

	// Whatever order the table puts them in is the order the review page walks.
	const tableOrder = await nameLinks.allTextContents();

	await nameLinks.first().click();

	// From `xl` up the name opens the application in the review panel beside the
	// table instead, and the panel's own link goes on to the review page. Below
	// `xl`, as on the phone, the name goes straight there.
	if ((page.viewportSize()?.width ?? 0) >= REVIEW_PANEL_MIN_WIDTH_PX) {
		await expect(page).toHaveURL(/[?&]application=/, { timeout: DATABASE_TIMEOUT_MS });
		await page
			.getByRole('complementary', { name: 'Application review' })
			.getByRole('link', { name: 'Open the full application' })
			.click();
	}

	await expect(main.getByRole('heading', { level: 1 })).toHaveText(tableOrder[0], {
		timeout: DATABASE_TIMEOUT_MS
	});

	const queue = page.getByRole('navigation', { name: 'Applications' });
	await expect(queue.getByRole('link', { name: '‹ Previous' })).toHaveCount(0);

	await queue.getByRole('link', { name: 'Next ›' }).click();
	await expect(main.getByRole('heading', { level: 1 })).toHaveText(tableOrder[1]);

	await queue.getByRole('link', { name: 'Next ›' }).click();
	await expect(main.getByRole('heading', { level: 1 })).toHaveText(tableOrder[2]);
	await expect(queue.getByRole('link', { name: 'Next ›' })).toHaveCount(0);

	await queue.getByRole('link', { name: '‹ Previous' }).click();
	await expect(main.getByRole('heading', { level: 1 })).toHaveText(tableOrder[1]);

	// The link back above the title is named after the list it returns to.
	await queue.getByRole('link', { name: 'Applications', exact: true }).click();
	await expect(page).toHaveURL(new RegExp(`${conference.applicationsPath}(\\?|$)`));
});

test('stores the internal note, and the applicant never sees it', async ({ page, browser }) => {
	const conference = await signInWithAConference(page, 'Internal Note MUN');
	const committee = await addCommittee(conference.id, 'Security Council', 'UNSC');
	const applicant = await addApplicant(conference.id, 'submitted', [committee]);

	await openReviewPage(
		page,
		reviewPath(conference, applicant.applicationId),
		applicant.user.fullName
	);

	const note = `Ask about the chairing reference ${crypto.randomUUID().slice(0, 8)}`;
	const notePanel = page.getByRole('region', { name: 'Internal note' });
	await notePanel.getByRole('textbox').fill(note);
	await notePanel.getByRole('button', { name: 'Save note' }).press('Enter');

	await expect(page.getByText('Note saved.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(notePanel.getByRole('textbox')).toHaveValue(note);
	expect((await readApplication(applicant.applicationId)).internal_note).toBe(note);

	// The applicant's own page shows their application and never this note.
	const applicantContext = await browser.newContext();
	const applicantPage = await applicantContext.newPage();
	await signIn(applicantPage, applicant.user);
	await applicantPage.goto(`/applications/${applicant.applicationId}`);

	await expect(applicantPage.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(applicantPage.getByText(note)).toHaveCount(0);
	await applicantContext.close();
});

// T142: with JavaScript "Waitlist" changes the status the moment it is
// pressed, before the server has answered and with no spinner, and a decision
// the server refuses goes back and says what did not happen.
test('waitlists at once, and puts a refused decision back', async ({ page }, testInfo) => {
	skipWithoutJavaScript(testInfo);

	const conference = await signInWithAConference(page, 'Instant Review MUN');
	const committee = await addCommittee(conference.id, 'Security Council', 'UNSC');
	await addSeat(committee, 'France', 'FR');
	const applicant = await addApplicant(conference.id, 'submitted', [committee]);
	await openReviewPage(
		page,
		reviewPath(conference, applicant.applicationId),
		applicant.user.fullName
	);

	const main = page.getByRole('main');
	await answerSlowly(page, 'waitlist');
	await watchForSpinners(page);

	await main.getByRole('button', { name: 'Waitlist' }).press('Enter');

	// The status beside the name changes and "Waitlist" goes, since a waitlisted
	// application cannot be again.
	await expect(main.getByText('Waitlisted', { exact: true })).toBeVisible({
		timeout: AT_ONCE_TIMEOUT_MS
	});
	await expect(main.getByRole('button', { name: 'Waitlist' })).toHaveCount(0, {
		timeout: AT_ONCE_TIMEOUT_MS
	});

	await waitUntilAnswered(page);
	expect(await sawSpinner(page)).toBe(false);
	expect((await readApplication(applicant.applicationId)).status).toBe('waitlisted');

	await answerWithError(page, 'reject');
	await pressAndConfirm(page, page.getByRole('region', { name: 'Decision' }), 'Not accepted');

	await expect(page.getByRole('alert')).toContainText(
		'The application was not marked as not accepted.',
		{ timeout: DATABASE_TIMEOUT_MS }
	);
	await waitUntilAnswered(page);
	await expect(main.getByText('Waitlisted', { exact: true })).toBeVisible();
	expect((await readApplication(applicant.applicationId)).status).toBe('waitlisted');
});

test('accepts a team into one country, a committee each', async ({ page }) => {
	const conference = await signInWithAConference(page, 'Team Accept MUN');
	const team = await addTeamOfTwo(conference);

	await openReviewPage(
		page,
		reviewPath(conference, team.first.applicationId),
		team.first.user.fullName
	);

	// Both friends are one entry: the teammate is listed, with their own review
	// page and public profile one press away.
	const teamSection = page.getByRole('region', { name: 'Team', exact: true });
	await expect(teamSection.getByRole('link', { name: team.second.user.fullName })).toBeVisible();
	await expect(teamSection.getByRole('link', { name: 'Public profile' })).toHaveCount(2);

	// A team is given a country, never one seat.
	const main = page.getByRole('main');
	await expect(main.locator('select[name="seatId"]')).toHaveCount(0);
	await main.locator('select[name="countryCode"]').selectOption('FR');
	await main.getByRole('button', { name: 'Accept the team' }).press('Enter');

	await expect(page.getByText(/are now France in /)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect((await readApplication(team.first.applicationId)).status).toBe('accepted');
	expect((await readApplication(team.second.applicationId)).status).toBe('accepted');
	expect(await readSeatHolder(team.franceInSecurityCouncil)).toBe(team.first.user.id);
	expect(await readSeatHolder(team.franceInHumanRights)).toBe(team.second.user.id);
});

test('teams up two separate applicants, and splits them again', async ({ page }) => {
	const conference = await signInWithAConference(page, 'Team Up MUN');
	const committee = await addCommittee(conference.id, 'Security Council', 'UNSC');
	const first = await addApplicant(conference.id, 'submitted', [committee]);
	const second = await addApplicant(conference.id, 'submitted', [committee]);

	await openReviewPage(page, reviewPath(conference, first.applicationId), first.user.fullName);

	const teamSection = page.getByRole('region', { name: 'Team', exact: true });
	await expect(teamSection).toContainText('Applying alone.');
	await teamSection
		.locator('select[name="partnerApplicationId"]')
		.selectOption({ label: second.user.fullName });
	await teamSection.getByRole('button', { name: 'Add to team' }).press('Enter');

	await expect(teamSection.getByRole('link', { name: second.user.fullName })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	const teamId = await readTeamId(first.applicationId);
	expect(teamId).not.toBeNull();
	expect(await readTeamId(second.applicationId)).toBe(teamId);

	// Taking one of two out leaves nobody to be a team with, so both apply alone.
	await teamSection.getByRole('button', { name: 'Remove from team' }).last().press('Enter');

	await expect(teamSection).toContainText('Applying alone.', { timeout: DATABASE_TIMEOUT_MS });
	expect(await readTeamId(first.applicationId)).toBeNull();
	expect(await readTeamId(second.applicationId)).toBeNull();
});

test('links to the applicant’s public profile', async ({ page }) => {
	const conference = await signInWithAConference(page, 'Public Profile MUN');
	const committee = await addCommittee(conference.id, 'Security Council', 'UNSC');
	const applicant = await addApplicant(conference.id, 'submitted', [committee]);

	await openReviewPage(
		page,
		reviewPath(conference, applicant.applicationId),
		applicant.user.fullName
	);

	await page
		.getByRole('region', { name: 'Profile' })
		.getByRole('link', { name: 'Public profile' })
		.click();

	await expect(page).toHaveURL(`/people/${applicant.user.id}`);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(applicant.user.fullName);
});

test('shows a team as one entry', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough for the picture.');

	const conference = await signInWithAConference(page, 'Team Picture MUN');
	const team = await addTeamOfTwo(conference);
	await writePrivateDetails(team.first.user);

	await openReviewPage(
		page,
		reviewPath(conference, team.first.applicationId),
		team.first.user.fullName
	);

	await saveFullPageScreenshot(page, 'manage-application-review-team');
	await expectPageFitsInScreens(page, REVIEW_PAGE_SCREENS);
});

test('fits in a few screens', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough to measure a height.');

	const conference = await signInWithAConference(page, 'Review Height MUN');
	const committee = await addCommittee(conference.id, 'Security Council', 'UNSC');
	await addSeat(committee, 'France', 'FR');
	const applicant = await addApplicant(conference.id, 'submitted', [committee]);
	await writePrivateDetails(applicant.user);

	await openReviewPage(
		page,
		reviewPath(conference, applicant.applicationId),
		applicant.user.fullName
	);

	await saveFullPageScreenshot(page, 'manage-application-review');
	await expectPageFitsInScreens(page, REVIEW_PAGE_SCREENS);
});

test('does not scroll sideways on a phone', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a narrow screen.');

	const conference = await signInWithAConference(page, 'Review Phone MUN');
	const committee = await addCommittee(conference.id, 'Security Council', 'UNSC');
	await addSeat(committee, 'France', 'FR');
	const applicant = await addApplicant(conference.id, 'submitted', [committee]);
	await writePrivateDetails(applicant.user);

	await openReviewPage(
		page,
		reviewPath(conference, applicant.applicationId),
		applicant.user.fullName
	);

	await saveFullPageScreenshot(page, 'manage-application-review-phone');
	await expectNoSidewaysOverflow(page);
});
