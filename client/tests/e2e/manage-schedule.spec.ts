import { expect, test, type APIResponse, type Page } from '@playwright/test';
import { createTestUser, signIn, type TestUser } from './signed-in-user';
import {
	expectNoSidewaysOverflow,
	expectPageFitsInScreens,
	saveFullPageScreenshot
} from './page-shape';
import {
	addScheduleCommittee,
	addScheduleEvent,
	createScheduleConference,
	readEventTitles,
	readSchedulePublicity,
	SCHEDULE_FIRST_DAY,
	SCHEDULE_SECOND_DAY,
	type ScheduleConference
} from './schedule-fixtures';
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

// The acceptance criteria of `specs/05-pages/organiser/schedule.md` that need a
// real browser, for the editor task T35 builds at `/manage/[slug]/schedule`:
//
// * an event is added through the form, lands on its own day's tab, and is
//   edited through the row's menu;
// * "Duplicate to next day" copies an event to the same time the day after;
// * an event is deleted once the organiser has confirmed it;
// * "Add committee sessions" is refused until there are committees, and then
//   writes one numbered session per ticked committee in its own room;
// * the field messages appear together on one submit;
// * "Show the programme on the public page" is saved;
// * an organiser of another conference gets a 404;
// * the page does not spill off a phone and stays a few screens tall.
//
// EVERY ACTION WITHOUT JAVASCRIPT
// Every control is a real submit button in a real `<form method="post">`, or a
// link that changes `?day=`, `?edit=`, `?new=1` or `?sessions=1`, so these tests
// run on the `desktop-no-js` project like every other and that is the proof.
// The row menu is a `<details>`, which a browser opens with no script at all.
//
// Every test makes its own conference in `schedule-fixtures.ts`, which says why
// they run in May 2020.

/** How long an assertion that waits on a page reading the database may take. */
const DATABASE_TIMEOUT_MS = 15_000;

/** How long a single try inside a retrying block may take. */
const SINGLE_TRY_TIMEOUT_MS = 2_000;

/** How many windows tall the editor may be with a full day on it. */
const MANAGE_SCHEDULE_SCREENS = 3;

/** An organiser signed in with a conference of their own. */
type SignedInOrganiser = {
	organiser: TestUser;
	conference: ScheduleConference;
	/** `/manage/<slug>/schedule`. */
	schedulePath: string;
};

/** Sign a brand-new organiser in and give them a draft conference. */
async function signInWithAConference(page: Page, prefix: string): Promise<SignedInOrganiser> {
	const organiser = await createTestUser('Priya Nair');
	await signIn(page, organiser);

	const conference = await createScheduleConference({
		owner: organiser,
		namePrefix: prefix,
		status: 'draft'
	});

	return { organiser, conference, schedulePath: `/manage/${conference.slug}/schedule` };
}

/** Open the editor on one day and wait until it has really arrived. */
/**
 * Open the editor on one day: the calendar, or with `view` 'list' the day's
 * list of rows, whose menus hold each event's actions.
 */
async function openScheduleDay(
	page: Page,
	schedulePath: string,
	day: string,
	view: 'calendar' | 'list' = 'calendar'
): Promise<void> {
	await page.goto(`${schedulePath}?day=${day}${view === 'list' ? '&view=list' : ''}`);

	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Schedule', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitForPageScript(page);
}

/**
 * With JavaScript, wait until the page's script has taken the page over. The
 * server writes the top bar's links relative to the page (`../../home`) and
 * the script rewrites them from the site's root (`/home`), so a logo link that
 * starts with "/" says the script runs. A press before then is the plain
 * form's, which reloads the whole page and loses what `watchForSpinners`
 * watches (seen once under the whole suite's load).
 */
async function waitForPageScript(page: Page): Promise<void> {
	if (test.info().project.use.javaScriptEnabled === false) return;

	await expect(page.getByRole('banner').getByRole('link', { name: 'MUNMeet' })).toHaveAttribute(
		'href',
		/^\//,
		{ timeout: DATABASE_TIMEOUT_MS }
	);
}

/**
 * Post straight to a form action, as a browser with no form in front of it would.
 * The `origin` header is what SvelteKit's own check against cross-site posts reads.
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
 * With JavaScript the press opens a `<dialog>` whose own button submits. Without
 * it the press opens a confirmation page asking the same question, whose own
 * button submits. This waits to see which happened.
 * A copy of the one in `manage-fees.spec.ts`, for the reason that file gives.
 */
async function pressAndConfirm(page: Page, label: string): Promise<void> {
	const button = page.getByRole('main').getByRole('button', { name: label }).first();
	const dialogButton = page.getByRole('dialog').getByRole('button', { name: label }).first();

	await button.press('Enter');

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
 * Press an event's block on the calendar, which opens its details with the
 * organiser's actions in them. The block is a link to `?event=<id>`, so this
 * works without JavaScript too.
 */
async function openEventDetails(page: Page, eventTitle: string) {
	await page
		.getByRole('main')
		.getByRole('link', { name: new RegExp(eventTitle) })
		.filter({ visible: true })
		.first()
		.click();

	const details = page.getByRole('dialog');
	await expect(details).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	return details;
}

/** Open the `<details>` menu of the row showing one event, on the list. */
async function openRowMenu(page: Page, eventTitle: string): Promise<void> {
	await page
		.getByRole('main')
		.locator('summary', { hasText: `Actions for ${eventTitle}` })
		.click();
}

// Every test signs a new account in and posts at least one form while the whole
// suite shares one local database. `test.slow()` triples the time allowed.
test.beforeEach(() => {
	test.slow();
});

test('adds an event through the form, shows it on its day, and edits it', async ({ page }) => {
	const { schedulePath } = await signInWithAConference(page, 'Add Event MUN');

	await openScheduleDay(page, schedulePath, SCHEDULE_FIRST_DAY);

	const main = page.getByRole('main');

	await expect(main.getByText('No events yet.')).toBeVisible();
	await expect(main.getByText('All times Europe/Amsterdam')).toBeVisible();

	await main.getByRole('link', { name: 'Add event', exact: true }).first().click();

	await main.getByLabel('Title').fill('Opening ceremony');
	await main.getByLabel('Starts').fill(`${SCHEDULE_FIRST_DAY}T09:00`);
	await main.getByLabel('Ends').fill(`${SCHEDULE_FIRST_DAY}T10:30`);
	await main.getByLabel('Location').fill('Aula Conference Hall');
	await main.getByRole('button', { name: 'Save event' }).press('Enter');

	await expect(page.getByText('Event saved.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(page).toHaveURL(new RegExp(`day=${SCHEDULE_FIRST_DAY}`));
	await expect(main.getByText('Opening ceremony', { exact: true })).toBeVisible();
	await expect(main.getByText('Aula Conference Hall')).toBeVisible();
	await expect(main.getByText('09:00 – 10:30')).toBeVisible();

	// Edit is a link in the event's details, to `?edit=<id>`, which opens the same form filled in.
	const details = await openEventDetails(page, 'Opening ceremony');
	await details.getByRole('link', { name: 'Edit' }).click();

	await expect(main.getByLabel('Title')).toHaveValue('Opening ceremony');
	await main.getByLabel('Title').fill('Opening plenary');
	await main.getByRole('button', { name: 'Save event' }).press('Enter');

	await expect(main.getByText('Opening plenary', { exact: true })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(main.getByText('Opening ceremony')).toHaveCount(0);
});

test('copies an event to the same time on the next day', async ({ page }) => {
	const { conference, schedulePath } = await signInWithAConference(page, 'Duplicate Event MUN');

	await addScheduleEvent({
		conferenceId: conference.id,
		title: 'Morning briefing',
		startsAt: `${SCHEDULE_FIRST_DAY}T06:00:00Z`,
		endsAt: `${SCHEDULE_FIRST_DAY}T06:30:00Z`,
		audience: 'staff'
	});

	await openScheduleDay(page, schedulePath, SCHEDULE_FIRST_DAY);
	const details = await openEventDetails(page, 'Morning briefing');
	await details.getByRole('button', { name: 'Duplicate to next day' }).click();

	await expect(page.getByText('Copied to Mon 4 May.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page).toHaveURL(new RegExp(`day=${SCHEDULE_SECOND_DAY}`));

	const main = page.getByRole('main');

	// 06:00 UTC is 08:00 in Amsterdam in May, on both days. A desktop shows
	// both days side by side, a phone only the copy's.
	const copies = main.getByText('Morning briefing', { exact: true }).filter({ visible: true });
	await expect(copies.first()).toBeVisible();
	await expect(main.getByText('08:00 – 08:30').filter({ visible: true }).first()).toBeVisible();
	expect(await readEventTitles(conference.id)).toEqual(['Morning briefing', 'Morning briefing']);
});

// A press on the list answers with the list again, so the organiser is not
// thrown back onto the calendar after every copy.
test('copies an event from the list and stays on the list', async ({ page }) => {
	const { schedulePath, conference } = await signInWithAConference(page, 'List Copy MUN');

	await addScheduleEvent({
		conferenceId: conference.id,
		title: 'Morning briefing',
		startsAt: `${SCHEDULE_FIRST_DAY}T06:00:00Z`,
		endsAt: `${SCHEDULE_FIRST_DAY}T06:30:00Z`,
		audience: 'staff'
	});

	await openScheduleDay(page, schedulePath, SCHEDULE_FIRST_DAY, 'list');
	await openRowMenu(page, 'Morning briefing');
	await page.getByRole('main').getByRole('button', { name: 'Duplicate to next day' }).click();

	await expect(page.getByText('Copied to Mon 4 May.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page).toHaveURL(
		new RegExp(`day=${SCHEDULE_SECOND_DAY}.*view=list|view=list.*day=${SCHEDULE_SECOND_DAY}`)
	);
	await expect(
		page.getByRole('main').locator('summary', { hasText: 'Actions for Morning briefing' })
	).toHaveCount(1);
});

test('deletes an event once the organiser has confirmed it', async ({ page }) => {
	const { conference, schedulePath } = await signInWithAConference(page, 'Delete Event MUN');

	await addScheduleEvent({
		conferenceId: conference.id,
		title: 'Cancelled social',
		startsAt: `${SCHEDULE_FIRST_DAY}T17:00:00Z`,
		endsAt: `${SCHEDULE_FIRST_DAY}T19:00:00Z`,
		audience: 'everyone'
	});

	// On the list, where the answer keeps the organiser after the delete.
	await openScheduleDay(page, schedulePath, SCHEDULE_FIRST_DAY, 'list');
	await pressAndConfirm(page, 'Delete');

	await expect(page.getByText('Event deleted.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(page.getByRole('main').getByText('No events on this day.')).toBeVisible();
	expect(await readEventTitles(conference.id)).toEqual([]);
});

// T142: with JavaScript "Delete" takes the event off the day the moment the
// dialog is answered, before the server has and with no spinner, and a press
// the server refuses goes back and says what did not happen.
test('deletes an event at once, and puts a refused delete back', async ({ page }, testInfo) => {
	skipWithoutJavaScript(testInfo);

	const { conference, schedulePath } = await signInWithAConference(page, 'Instant Event MUN');

	await addScheduleEvent({
		conferenceId: conference.id,
		title: 'Opening ceremony',
		startsAt: `${SCHEDULE_FIRST_DAY}T09:00:00Z`,
		endsAt: `${SCHEDULE_FIRST_DAY}T10:00:00Z`,
		audience: 'everyone'
	});
	await addScheduleEvent({
		conferenceId: conference.id,
		title: 'Closing social',
		startsAt: `${SCHEDULE_FIRST_DAY}T17:00:00Z`,
		endsAt: `${SCHEDULE_FIRST_DAY}T19:00:00Z`,
		audience: 'everyone'
	});

	await openScheduleDay(page, schedulePath, SCHEDULE_FIRST_DAY, 'list');
	await answerSlowly(page, 'deleteEvent');
	await watchForSpinners(page);

	const main = page.getByRole('main');
	await pressAndConfirm(page, 'Delete');

	await expect(main.getByText('Opening ceremony', { exact: true })).toHaveCount(0, {
		timeout: AT_ONCE_TIMEOUT_MS
	});

	await waitUntilAnswered(page);
	expect(await sawSpinner(page)).toBe(false);
	expect(await readEventTitles(conference.id)).toEqual(['Closing social']);

	// The latest route wins, so this press is answered with an error rather than slowly.
	await answerWithError(page, 'deleteEvent');
	await pressAndConfirm(page, 'Delete');

	await expect(page.getByRole('alert')).toContainText('The event was not deleted.', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(page);
	await expect(main.getByText('Closing social', { exact: true })).toBeVisible();
	expect(await readEventTitles(conference.id)).toEqual(['Closing social']);
});

test('adds one numbered session for every ticked committee, once there are committees', async ({
	page
}) => {
	const { conference, schedulePath } = await signInWithAConference(page, 'Sessions MUN');

	await openScheduleDay(page, schedulePath, SCHEDULE_FIRST_DAY);

	const main = page.getByRole('main');

	// With no committees the button is drawn but leads nowhere, and says why.
	await expect(main.getByTitle('Add committees first')).toBeVisible();
	await expect(main.getByRole('link', { name: 'Add committee sessions' })).toHaveCount(0);

	await addScheduleCommittee(conference.id, {
		name: 'Security Council',
		abbreviation: 'UNSC',
		room: 'Committee Room 1',
		position: 0
	});
	await addScheduleCommittee(conference.id, {
		name: 'Economic and Social Council',
		abbreviation: 'ECOSOC',
		position: 1
	});

	await openScheduleDay(page, schedulePath, SCHEDULE_FIRST_DAY);
	await main.getByRole('link', { name: 'Add committee sessions' }).click();

	// Both committees start ticked, and the times start at nine to twelve.
	await expect(main.getByLabel('Security Council')).toBeChecked();
	await expect(main.getByLabel('Economic and Social Council')).toBeChecked();
	await main.getByRole('button', { name: 'Add sessions' }).press('Enter');

	await expect(page.getByText('2 sessions added.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(main.getByText('Session 1', { exact: true })).toHaveCount(2);
	await expect(main.getByText('Committee Room 1')).toBeVisible();
	// A committee with no room of its own is given "TBA" rather than nothing.
	await expect(main.getByText('TBA')).toBeVisible();
	await expect(main.getByText('UNSC').filter({ visible: true })).toBeVisible();
});

test('answers every field that needs fixing at once', async ({ page }) => {
	const { conference, schedulePath } = await signInWithAConference(page, 'Event Errors MUN');

	await openScheduleDay(page, schedulePath, SCHEDULE_FIRST_DAY);

	// Posted rather than typed, because the title is `required` and a browser
	// refuses to send it empty at all, which is also why the server's own answer
	// can only be seen by asking it directly.
	const response = await postFormAction(page, `${schedulePath}?/saveEvent`, {
		eventId: '',
		title: '',
		startsAt: `${SCHEDULE_FIRST_DAY}T11:00`,
		endsAt: `${SCHEDULE_FIRST_DAY}T10:00`,
		audience: 'committee',
		committeeId: ''
	});

	expect(response.status()).toBe(400);

	const answer = await response.text();

	for (const message of [
		'Please give the event a title.',
		'The end must be after the start.',
		'Pick the committee.'
	]) {
		expect(answer).toContain(message);
	}

	// `delegation` is in the database's list but is never an event's audience.
	const delegation = await postFormAction(page, `${schedulePath}?/saveEvent`, {
		eventId: '',
		title: 'Delegation briefing',
		startsAt: `${SCHEDULE_FIRST_DAY}T09:00`,
		endsAt: `${SCHEDULE_FIRST_DAY}T10:00`,
		audience: 'delegation'
	});

	expect(delegation.status()).toBe(400);
	expect(await delegation.text()).toContain('Not allowed here');
	expect(await readEventTitles(conference.id)).toEqual([]);
});

test('saves whether the programme is public', async ({ page }) => {
	const { conference, schedulePath } = await signInWithAConference(page, 'Public Programme MUN');

	await openScheduleDay(page, schedulePath, SCHEDULE_FIRST_DAY);

	const main = page.getByRole('main');

	await main.getByLabel('Show the programme on the public page').check();
	await main.getByRole('button', { name: 'Save', exact: true }).press('Enter');

	await expect(page.getByText('Saved.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(main.getByLabel('Show the programme on the public page')).toBeChecked();
	expect(await readSchedulePublicity(conference.id)).toBe(true);
});

test('answers the schedule of a conference somebody else runs with a 404', async ({ page }) => {
	await signInWithAConference(page, 'My Own MUN');

	const stranger = await createTestUser('Someone Else');
	const theirs = await createScheduleConference({
		owner: stranger,
		namePrefix: 'Not Mine MUN',
		status: 'draft'
	});

	const response = await page.goto(`/manage/${theirs.slug}/schedule`);

	expect(response?.status()).toBe(404);
});

/** Put a full day on a conference: a morning session per committee and three plenaries. */
async function fillOneDay(conferenceId: string, committeeTitle: string): Promise<void> {
	const committeeId = await addScheduleCommittee(conferenceId, {
		name: 'Special Political and Decolonization Committee',
		abbreviation: 'SPECPOL',
		room: 'Committee Room 4, second floor of the east wing'
	});

	await addScheduleEvent({
		conferenceId,
		title: 'Opening ceremony in the Aula with the Secretary-General',
		startsAt: `${SCHEDULE_FIRST_DAY}T07:00:00Z`,
		endsAt: `${SCHEDULE_FIRST_DAY}T08:00:00Z`,
		audience: 'everyone',
		location: 'Aula Conference Hall, Mekelweg 5'
	});
	await addScheduleEvent({
		conferenceId,
		title: committeeTitle,
		startsAt: `${SCHEDULE_FIRST_DAY}T08:30:00Z`,
		endsAt: `${SCHEDULE_FIRST_DAY}T10:00:00Z`,
		audience: 'committee',
		committeeId
	});
	await addScheduleEvent({
		conferenceId,
		title: 'Lunch',
		startsAt: `${SCHEDULE_FIRST_DAY}T10:00:00Z`,
		endsAt: `${SCHEDULE_FIRST_DAY}T11:00:00Z`,
		audience: 'everyone',
		location: 'Dining Hall'
	});
	await addScheduleEvent({
		conferenceId,
		title: 'Staff debrief',
		startsAt: `${SCHEDULE_FIRST_DAY}T20:00:00Z`,
		endsAt: `${SCHEDULE_FIRST_DAY}T23:30:00Z`,
		audience: 'staff'
	});
}

test('does not spill off the side of a phone screen', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	const { conference, schedulePath } = await signInWithAConference(
		page,
		'Phone Schedule International Model United Nations Conference'
	);

	const committeeTitle = 'Session I on the question of outer space and its peaceful uses';
	await fillOneDay(conference.id, committeeTitle);

	await openScheduleDay(page, schedulePath, SCHEDULE_FIRST_DAY);
	await expect(page.getByRole('main').getByText(committeeTitle, { exact: true })).toBeVisible();

	await expectNoSidewaysOverflow(page);

	// The add form open underneath the list is the widest the page gets.
	await page.goto(`${schedulePath}?day=${SCHEDULE_FIRST_DAY}&new=1`);
	await expect(page.getByRole('main').getByLabel('Title')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	await expectNoSidewaysOverflow(page);
});

test('fits in a few screens', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough to measure a height.');

	const { conference, schedulePath } = await signInWithAConference(page, 'Height Schedule MUN');

	const committeeTitle = 'Session I';
	await fillOneDay(conference.id, committeeTitle);

	await openScheduleDay(page, schedulePath, SCHEDULE_FIRST_DAY);
	await expect(page.getByRole('main').getByText(committeeTitle, { exact: true })).toBeVisible();

	// Saved before the assertion, so that a failure leaves a picture of the page.
	await saveFullPageScreenshot(page, 'manage-schedule');
	await expectPageFitsInScreens(page, MANAGE_SCHEDULE_SCREENS);
});
