import { expect, test, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
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
	SCHEDULE_FIRST_DAY,
	SCHEDULE_SECOND_DAY,
	seatDelegate,
	type ScheduleConference
} from './schedule-fixtures';

// The acceptance criteria of `specs/05-pages/delegate/schedule.md`, for the one
// schedule page, `/conferences/[slug]/schedule`, and for `/schedule`, which
// sends the reader on to it (Trello card Lq9cSUET).
//
// * a delegate sees `everyone`, `delegates` and their own committee's events,
//   and nothing else;
// * an organiser sees every event, each with its audience badge;
// * a wide screen sets the days side by side; on a phone the day strip is links
//   in the address, and the first day opens by default once the conference is over;
// * the times are in the conference's timezone, which is named once;
// * `/schedule` opens the reader's current conference, and the page offers
//   their other conferences under "Switch conference";
// * a visitor sees the public programme only while it is public, and is sent to
//   sign in otherwise;
// * the page does not spill off a phone, and stays a few screens tall.
//
// Every page here is plain links and no forms, so running on `desktop-no-js`
// like every other test is the no-JavaScript proof. Every test makes its own
// conference in `schedule-fixtures.ts`, which says why they run in May 2020.

/** How long an assertion that waits on a page reading the database may take. */
const DATABASE_TIMEOUT_MS = 15_000;

/** How many windows tall one day of the programme may be. */
const SCHEDULE_SCREENS = 3;

/** The events every programme test starts with, one of each audience, all on the first day. */
const EVENT_TITLES = {
	everyone: 'Opening ceremony',
	delegates: 'Delegate briefing',
	staff: 'Staff meeting',
	ownCommittee: 'Security Council session I',
	otherCommittee: 'ECOSOC session I'
};

/** A conference with two committees, one event of each audience, and its organiser. */
type ProgrammeConference = ScheduleConference & {
	organiser: TestUser;
	securityCouncilId: string;
};

/** Make a published conference with the five events of `EVENT_TITLES` on its first day. */
async function createProgrammeConference(
	prefix: string,
	showsSchedulePublicly = false
): Promise<ProgrammeConference> {
	const organiser = await createTestUser('Priya Nair');
	const conference = await createScheduleConference({
		owner: organiser,
		namePrefix: prefix,
		showsSchedulePublicly
	});

	const securityCouncilId = await addScheduleCommittee(conference.id, {
		name: 'Security Council',
		abbreviation: 'UNSC',
		room: 'Committee Room 1'
	});
	const ecosocId = await addScheduleCommittee(conference.id, {
		name: 'Economic and Social Council',
		abbreviation: 'ECOSOC',
		position: 1
	});

	// 07:00 UTC is 09:00 in Amsterdam in May.
	const firstDay = (time: string) => `${SCHEDULE_FIRST_DAY}T${time}:00Z`;

	await addScheduleEvent({
		conferenceId: conference.id,
		title: EVENT_TITLES.everyone,
		startsAt: firstDay('07:00'),
		endsAt: firstDay('08:00'),
		audience: 'everyone',
		location: 'Aula Conference Hall'
	});
	await addScheduleEvent({
		conferenceId: conference.id,
		title: EVENT_TITLES.delegates,
		startsAt: firstDay('08:00'),
		endsAt: firstDay('08:30'),
		audience: 'delegates'
	});
	await addScheduleEvent({
		conferenceId: conference.id,
		title: EVENT_TITLES.staff,
		startsAt: firstDay('08:00'),
		endsAt: firstDay('08:30'),
		audience: 'staff'
	});
	await addScheduleEvent({
		conferenceId: conference.id,
		title: EVENT_TITLES.ownCommittee,
		startsAt: firstDay('08:30'),
		endsAt: firstDay('10:00'),
		audience: 'committee',
		committeeId: securityCouncilId
	});
	await addScheduleEvent({
		conferenceId: conference.id,
		title: EVENT_TITLES.otherCommittee,
		startsAt: firstDay('08:30'),
		endsAt: firstDay('10:00'),
		audience: 'committee',
		committeeId: ecosocId
	});

	return { ...conference, organiser, securityCouncilId };
}

/** Sign a new delegate in, seated in the Security Council of `conference`. */
async function signInAsDelegate(page: Page, conference: ProgrammeConference): Promise<TestUser> {
	const delegate = await createTestUser('Daniel Okafor');
	await seatDelegate(delegate, conference.securityCouncilId);
	await signIn(page, delegate);

	return delegate;
}

/** Open one conference's programme and wait until it has really arrived. */
async function openProgramme(page: Page, slug: string, day?: string): Promise<void> {
	const search = day ? `?day=${day}` : '';

	await page.goto(`/conferences/${slug}/schedule${search}`);

	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Schedule', {
		timeout: DATABASE_TIMEOUT_MS
	});
}

/** Make the programme of a conference public, the way the organiser's checkbox would. */
async function makeSchedulePublic(conferenceId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('conferences')
		.update({ show_schedule_publicly: true })
		.eq('id', conferenceId);

	if (error) {
		throw new Error(`Could not make the test programme public: ${error.message}`);
	}
}

test.beforeEach(() => {
	test.slow();
});

test('shows a delegate the events for everybody, for delegates and for their own committee, and nothing else', async ({
	page
}) => {
	const conference = await createProgrammeConference('Delegate Programme MUN');
	await signInAsDelegate(page, conference);

	// The conference is over, so with no `?day=` the first day opens.
	await openProgramme(page, conference.slug);

	const main = page.getByRole('main');

	await expect(main.getByText(EVENT_TITLES.everyone)).toBeVisible();
	await expect(main.getByText(EVENT_TITLES.delegates)).toBeVisible();
	await expect(main.getByText(EVENT_TITLES.ownCommittee)).toBeVisible();
	await expect(main.getByText(EVENT_TITLES.staff)).toHaveCount(0);
	await expect(main.getByText(EVENT_TITLES.otherCommittee)).toHaveCount(0);

	// The committee's own event carries its abbreviation; an event for everybody carries nothing.
	await expect(main.getByText('UNSC').filter({ visible: true })).toBeVisible();
	await expect(main.getByText('Everyone', { exact: true })).toHaveCount(0);

	// The times are Amsterdam's, and the zone is named once on the page.
	await expect(main.getByText('09:00 – 10:00')).toBeVisible();
	await expect(main.getByText('All times Europe/Amsterdam')).toHaveCount(1);
});

test('shows an organiser every event, each with its audience badge', async ({ page }) => {
	const conference = await createProgrammeConference('Organiser Programme MUN');
	await signIn(page, conference.organiser);

	await openProgramme(page, conference.slug, SCHEDULE_FIRST_DAY);

	const main = page.getByRole('main');

	for (const title of Object.values(EVENT_TITLES)) {
		await expect(main.getByText(title).filter({ visible: true })).toBeVisible();
	}

	// A short event squeezed beside another drops its badge on the calendar to
	// keep its title, so the badges are counted on the list, where every row has one.
	await page.goto(`/conferences/${conference.slug}/schedule?day=${SCHEDULE_FIRST_DAY}&view=list`);

	for (const badge of ['Everyone', 'Delegates', 'Staff', 'UNSC', 'ECOSOC']) {
		await expect(main.getByText(badge, { exact: true }).first()).toBeVisible();
	}
});

/** Make a programme conference whose second day has a closing ceremony, and sign in its delegate. */
async function openTwoDayProgramme(page: Page, name: string, day?: string): Promise<void> {
	const conference = await createProgrammeConference(name);
	await signInAsDelegate(page, conference);

	await addScheduleEvent({
		conferenceId: conference.id,
		title: 'Closing ceremony',
		startsAt: `${SCHEDULE_SECOND_DAY}T15:00:00Z`,
		endsAt: `${SCHEDULE_SECOND_DAY}T16:00:00Z`,
		audience: 'everyone'
	});

	await openProgramme(page, conference.slug, day);
}

test('sets every day of the conference side by side on a wide screen', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name === 'phone', 'A phone shows one day at a time.');

	await openTwoDayProgramme(page, 'Week View MUN');

	const main = page.getByRole('main');
	await expect(main.getByText(EVENT_TITLES.everyone)).toBeVisible();
	await expect(main.getByText('Closing ceremony')).toBeVisible();
});

test("closes an event's details on a press anywhere else on the calendar", async ({
	page
}, testInfo) => {
	test.skip(
		testInfo.project.name !== 'desktop',
		'A phone closes them through the veil behind its sheet, and without JavaScript only the X does.'
	);

	await openTwoDayProgramme(page, 'Press Outside MUN');

	const main = page.getByRole('main');
	const details = page.getByRole('dialog');

	await main.getByRole('link', { name: new RegExp(EVENT_TITLES.everyone) }).click();
	await expect(details).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	// Pressing another event opens that one instead of only closing the first.
	await main.getByRole('link', { name: /Closing ceremony/ }).click();
	await expect(details.getByRole('heading', { name: 'Closing ceremony' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// A press inside the details leaves them open; one on an empty hour closes them.
	await details.getByRole('heading').click();
	await expect(details).toBeVisible();
	await main.getByText('12:00', { exact: true }).click();
	await expect(details).toHaveCount(0, { timeout: DATABASE_TIMEOUT_MS });
	await expect(page).not.toHaveURL(/event=/);
});

test('opens another day on a phone through the day strip, a link in the address', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only a phone shows one day at a time.');

	await openTwoDayProgramme(page, 'Day Strip MUN', SCHEDULE_FIRST_DAY);

	const main = page.getByRole('main');
	await main.getByRole('link', { name: 'Mon 4 May' }).click();

	await expect(page).toHaveURL(new RegExp(`day=${SCHEDULE_SECOND_DAY}`));
	await expect(main.getByText('Closing ceremony')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	// The other days stay in the page for a wide screen, hidden on a phone.
	await expect(main.getByText(EVENT_TITLES.everyone).filter({ visible: true })).toHaveCount(0);
});

test("sends a delegate from /schedule on to their conference's schedule", async ({ page }) => {
	const conference = await createProgrammeConference('My Schedule MUN');
	await signInAsDelegate(page, conference);

	await page.goto('/schedule');

	// `/schedule` has no schedule of its own: it sends the reader on.
	await expect(page).toHaveURL(`/conferences/${conference.slug}/schedule`, {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.getByRole('main').getByText(EVENT_TITLES.everyone)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// The top bar marks "Schedule" as the page the reader is on, not "Conferences".
	// The bar draws its links twice, once for each width, and on a phone both
	// sit hidden in the closed menu, so hidden links are counted too.
	const schedule = page
		.getByRole('banner')
		.getByRole('link', { name: 'Schedule', includeHidden: true });
	await expect(schedule.first()).toHaveAttribute('aria-current', 'page');
});

test("offers a delegate's other conferences under Switch conference", async ({ page }) => {
	const conference = await createProgrammeConference('Switch From MUN');
	const delegate = await signInAsDelegate(page, conference);

	const otherConference = await createProgrammeConference('Switch To MUN');
	await seatDelegate(delegate, otherConference.securityCouncilId);

	await openProgramme(page, conference.slug);

	const main = page.getByRole('main');

	// The menu is a `<details>`, which opens on its summary without JavaScript too.
	await main.getByText('Switch conference').click();
	await main.getByRole('link', { name: new RegExp(otherConference.name) }).click();

	await expect(page).toHaveURL(`/conferences/${otherConference.slug}/schedule`, {
		timeout: DATABASE_TIMEOUT_MS
	});
});

test('says so on /schedule when the reader is part of no conference', async ({ page }) => {
	const delegate = await createTestUser('Nobody Scheduled');
	await signIn(page, delegate);

	await page.goto('/schedule');

	await expect(page.getByText('You are not part of a conference yet.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(
		page.getByRole('main').getByRole('link', { name: 'Find a conference' })
	).toBeVisible();
});

// specs/05-pages/delegate/schedule.md's "Empty" state for one conference's own
// programme, as opposed to the `/schedule` empty state covered above.
test('tells a delegate the organisers have not published a programme yet, when their conference has no events', async ({
	page
}) => {
	const organiser = await createTestUser('Priya Nair');
	const conference = await createScheduleConference({
		owner: organiser,
		namePrefix: 'No Events MUN'
	});
	const committeeId = await addScheduleCommittee(conference.id, {
		name: 'Security Council',
		abbreviation: 'UNSC'
	});

	const delegate = await createTestUser('Daniel Okafor');
	await seatDelegate(delegate, committeeId);
	await signIn(page, delegate);

	await openProgramme(page, conference.slug);

	await expect(
		page.getByRole('main').getByText('The organisers have not published a programme yet.')
	).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
});

test('shows a visitor the programme only while it is public', async ({ page }) => {
	const conference = await createProgrammeConference('Visitor Programme MUN');

	// Private: a signed-out visitor is sent to sign in, and comes back here after.
	await page.goto(`/conferences/${conference.slug}/schedule`);

	await expect(page).toHaveURL(/\/login\?next=/, { timeout: DATABASE_TIMEOUT_MS });
	expect(new URL(page.url()).searchParams.get('next')).toBe(
		`/conferences/${conference.slug}/schedule`
	);

	// While it is private the conference's own page has no Programme section either.
	await page.goto(`/conferences/${conference.slug}`);
	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.getByRole('main').getByRole('region', { name: 'Programme' })).toHaveCount(0);

	await makeSchedulePublic(conference.id);
	await openProgramme(page, conference.slug);

	const main = page.getByRole('main');

	await expect(main.getByText(EVENT_TITLES.everyone)).toBeVisible();
	await expect(main.getByText(EVENT_TITLES.delegates)).toHaveCount(0);
	await expect(main.getByText(EVENT_TITLES.staff)).toHaveCount(0);
	await expect(main.getByText(EVENT_TITLES.ownCommittee)).toHaveCount(0);

	// The conference's own page shows the same public programme in a section of its own.
	await page.goto(`/conferences/${conference.slug}`);

	const programme = page.getByRole('main').getByRole('region', { name: 'Programme' });

	await expect(programme.getByText(EVENT_TITLES.everyone)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.getByRole('main').getByText(EVENT_TITLES.delegates)).toHaveCount(0);
});

test('answers a signed-in stranger with a 404 while the programme is private', async ({ page }) => {
	const conference = await createProgrammeConference('Private Programme MUN');

	const stranger = await createTestUser('Not Taking Part');
	await signIn(page, stranger);

	const response = await page.goto(`/conferences/${conference.slug}/schedule`);

	expect(response?.status()).toBe(404);
});

test('does not spill off the side of a phone screen', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	const conference = await createProgrammeConference(
		'Phone Programme International Model United Nations Conference'
	);
	await signInAsDelegate(page, conference);

	await openProgramme(page, conference.slug, SCHEDULE_FIRST_DAY);
	await expect(page.getByRole('main').getByText(EVENT_TITLES.everyone)).toBeVisible();

	await expectNoSidewaysOverflow(page);
});

test('fits in a few screens', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough to measure a height.');

	const conference = await createProgrammeConference('Height Programme MUN');
	await signIn(page, conference.organiser);

	await openProgramme(page, conference.slug, SCHEDULE_FIRST_DAY);
	await expect(page.getByRole('main').getByText(EVENT_TITLES.everyone)).toBeVisible();

	// Saved before the assertion, so that a failure leaves a picture of the page.
	await saveFullPageScreenshot(page, 'conference-schedule');
	await expectPageFitsInScreens(page, SCHEDULE_SCREENS);
});

/** A window short enough that one day of the programme has to scroll in it. */
const SHORT_WINDOW = { width: 1280, height: 500 };

// Trello card D5RgHWEg: the "Schedule" heading was drawn over the sticky top
// bar once the page scrolled, instead of passing underneath it.
test('slides its heading under the top bar when the page scrolls', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough to look at the layers.');

	// At the usual 800px the whole day fits on the screen and nothing scrolls.
	await page.setViewportSize(SHORT_WINDOW);

	const conference = await createProgrammeConference('Scrolled Programme MUN');
	await signIn(page, conference.organiser);

	await openProgramme(page, conference.slug, SCHEDULE_FIRST_DAY);

	const heading = page.getByRole('main').getByRole('heading', { level: 1 });
	const topBarBox = await page.getByRole('banner').boundingBox();
	const headingBox = await heading.boundingBox();

	// Scroll until the middle of the heading sits behind the middle of the bar.
	// `?? 0` only satisfies the type check: both are drawn once the page is open.
	const headingMiddle = (headingBox?.y ?? 0) + (headingBox?.height ?? 0) / 2;
	const topBarMiddle = (topBarBox?.y ?? 0) + (topBarBox?.height ?? 0) / 2;
	await page.evaluate((distance) => window.scrollTo(0, distance), headingMiddle - topBarMiddle);

	// `elementFromPoint` answers with whatever is drawn on top at a spot in the
	// window. There the top bar should be covering the heading, not the other way round.
	const isCoveredByTopBar = await heading.evaluate((element) => {
		const box = element.getBoundingClientRect();
		const topmost = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
		const isInPageContent = topmost?.closest('main') !== null;

		return topmost !== null && !isInPageContent;
	});

	await page.screenshot({
		path: 'test-results/page-shape/conference-schedule-scrolled-desktop.png'
	});
	expect(isCoveredByTopBar).toBe(true);
});
