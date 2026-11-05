import { expect, test, type Page } from '@playwright/test';
import { createTestUser, makeCommitteeChair, signIn, type TestUser } from './signed-in-user';
import {
	expectNoSidewaysOverflow,
	expectPageFitsInScreens,
	saveFullPageScreenshot
} from './page-shape';
import {
	addScheduleCommittee,
	createScheduleConference,
	seatDelegate,
	type ScheduleConference
} from './schedule-fixtures';
import {
	addAnnouncement,
	addAnnouncements,
	countUnreadNotifications,
	removeAnnouncement
} from './announcement-fixtures';

// The acceptance criteria of `specs/05-pages/delegate/announcements.md`, for
// the page task T36 builds at `/conferences/[slug]/announcements`:
//
// * pinned announcements come first, then the newest;
// * a delegate never sees `staff` announcements or another committee's;
// * the author line says "Secretariat" for organisers and names a chair;
// * opening the page marks this conference's announcement notifications read;
// * a notification of an announcement deleted since says it was removed;
// * twenty to a page, with real links to the rest;
// * a visitor is asked to sign in, and a stranger to the conference gets a 404;
// * the home dashboard's "Latest announcements" leads here (`delegate/home.md`);
// * the page does not spill off a phone and stays a few screens tall.
//
// The page is plain links and no forms, so running on `desktop-no-js` like
// every other test is the no-JavaScript proof. Every test makes its own
// conference in `schedule-fixtures.ts`, which says why they run in May 2020.

/** How long an assertion that waits on a page reading the database may take. */
const DATABASE_TIMEOUT_MS = 15_000;

/** How many windows tall one page of announcements may be. */
const ANNOUNCEMENTS_SCREENS = 3;

/** A delegate seated in a conference's Security Council, and who runs it. */
type SeatedDelegate = {
	organiser: TestUser;
	delegate: TestUser;
	conference: ScheduleConference;
	/** The Security Council, where the delegate sits. */
	committeeId: string;
	/** `/conferences/<slug>/announcements`. */
	announcementsPath: string;
};

/** Make a conference with a delegate seated in it. Nobody is signed in yet. */
async function makeSeatedDelegate(prefix: string): Promise<SeatedDelegate> {
	const organiser = await createTestUser('Priya Nair');
	const delegate = await createTestUser('Lena Vogel');
	const conference = await createScheduleConference({ owner: organiser, namePrefix: prefix });

	const committeeId = await addScheduleCommittee(conference.id, {
		name: 'Security Council',
		abbreviation: 'UNSC'
	});
	await seatDelegate(delegate, committeeId);

	return {
		organiser,
		delegate,
		conference,
		committeeId,
		announcementsPath: `/conferences/${conference.slug}/announcements`
	};
}

/** Open the page and wait until it has really arrived. */
async function openAnnouncements(page: Page, announcementsPath: string): Promise<void> {
	await page.goto(announcementsPath);

	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
		'Announcements',
		{ timeout: DATABASE_TIMEOUT_MS }
	);
}

/** Whether `first` appears above `second` in the page's main area. */
async function isListedAbove(page: Page, first: string, second: string): Promise<boolean> {
	const text = await page.getByRole('main').innerText();

	return text.indexOf(first) < text.indexOf(second);
}

// Every test signs a new account in while the whole suite shares one local
// database. `test.slow()` triples the time allowed.
test.beforeEach(() => {
	test.slow();
});

// specs/05-pages/delegate/announcements.md's "Empty" state: a delegate whose
// conference has posted nothing yet.
test('says so when there are no announcements yet', async ({ page }) => {
	const { delegate, announcementsPath } = await makeSeatedDelegate('No News MUN');

	await signIn(page, delegate);
	await openAnnouncements(page, announcementsPath);

	const main = page.getByRole('main');

	await expect(main.getByText('No announcements yet.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(main.getByText('The organisers will post updates here.')).toBeVisible();
});

test('shows a delegate only what is for them, pinned first, with who wrote it', async ({
	page
}) => {
	const { organiser, delegate, conference, committeeId, announcementsPath } =
		await makeSeatedDelegate('Reader News MUN');

	const otherCommitteeId = await addScheduleCommittee(conference.id, {
		name: 'Human Rights Council',
		abbreviation: 'HRC',
		position: 1
	});
	const chair = await createTestUser('Amara Okafor');
	await makeCommitteeChair(chair, committeeId);

	await addAnnouncement({
		conferenceId: conference.id,
		author: organiser,
		title: 'Dress code',
		isPinned: true,
		publishedAt: '2020-05-01T09:00:00Z'
	});
	await addAnnouncement({
		conferenceId: conference.id,
		author: chair,
		title: 'Session I moves to room 2',
		audience: 'committee',
		committeeId,
		publishedAt: '2020-05-02T09:00:00Z'
	});
	await addAnnouncement({
		conferenceId: conference.id,
		author: organiser,
		title: 'Chair briefing',
		audience: 'staff'
	});
	await addAnnouncement({
		conferenceId: conference.id,
		author: organiser,
		title: 'Human Rights Council room',
		audience: 'committee',
		committeeId: otherCommitteeId
	});

	await signIn(page, delegate);
	await openAnnouncements(page, announcementsPath);

	const main = page.getByRole('main');

	await expect(main.getByText('Dress code', { exact: true })).toBeVisible();
	await expect(main.getByText('Session I moves to room 2', { exact: true })).toBeVisible();
	await expect(main.getByText('Chair briefing')).toHaveCount(0);
	await expect(main.getByText('Human Rights Council room')).toHaveCount(0);

	// Pinned first, even though it is the older of the two.
	expect(await isListedAbove(page, 'Dress code', 'Session I moves to room 2')).toBe(true);
	await expect(main.getByText(/^Secretariat · /)).toBeVisible();
	await expect(main.getByText(/^Amara Okafor \(Chair\) · /)).toBeVisible();
});

test("opening the page marks this conference's announcement notifications read", async ({
	page
}) => {
	const { organiser, delegate, conference, announcementsPath } =
		await makeSeatedDelegate('Unread News MUN');

	await addAnnouncement({ conferenceId: conference.id, author: organiser, title: 'Welcome' });
	expect(await countUnreadNotifications(delegate.id)).toBe(1);

	await signIn(page, delegate);
	await openAnnouncements(page, announcementsPath);

	await expect(page.getByRole('main').getByText('Welcome', { exact: true })).toBeVisible();
	expect(await countUnreadNotifications(delegate.id)).toBe(0);
});

test('a notification of an announcement deleted since says it was removed', async ({ page }) => {
	const { organiser, delegate, conference } = await makeSeatedDelegate('Removed News MUN');

	const announcementId = await addAnnouncement({
		conferenceId: conference.id,
		author: organiser,
		title: 'Social moved to Friday'
	});
	await removeAnnouncement(announcementId);

	await signIn(page, delegate);
	await page.goto('/notifications');
	await page.getByRole('button', { name: /Social moved to Friday/ }).click();

	await expect(page).toHaveURL(
		new RegExp(`/conferences/${conference.slug}/announcements\\?removed=1`)
	);
	await expect(page.getByText('That announcement was removed.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
});

test('shows twenty to a page, with a real link to the rest', async ({ page }) => {
	const { organiser, delegate, conference, announcementsPath } =
		await makeSeatedDelegate('Many News MUN');

	// Twenty-one announcements, one a day apart, so their order is certain.
	const seeds = Array.from({ length: 21 }, (_, index) => ({
		conferenceId: conference.id,
		author: organiser,
		title: `Update number ${index + 1}`,
		publishedAt: new Date(Date.UTC(2020, 3, 1 + index, 9)).toISOString()
	}));
	await addAnnouncements(organiser, seeds);

	await signIn(page, delegate);
	await openAnnouncements(page, announcementsPath);

	const main = page.getByRole('main');

	await expect(main.locator('article')).toHaveCount(20);
	await expect(main.getByText('Update number 1', { exact: true })).toHaveCount(0);

	await main.getByRole('link', { name: 'Next →' }).click();

	await expect(page).toHaveURL(new RegExp(`${announcementsPath}\\?page=2`));
	await expect(main.locator('article')).toHaveCount(1);
	await expect(main.getByText('Update number 1', { exact: true })).toBeVisible();
});

test('asks a visitor to sign in, and answers a stranger with a 404', async ({ page }) => {
	const { announcementsPath } = await makeSeatedDelegate('Private News MUN');

	await page.goto(announcementsPath);
	await expect(page).toHaveURL(/\/login\?/);

	await signIn(page, await createTestUser('Someone Else'));
	const response = await page.goto(announcementsPath);

	expect(response?.status()).toBe(404);
});

test('the home dashboard carries the latest announcement in its bell and leads here', async ({
	page
}, testInfo) => {
	// The bell's panel is a shadcn popover, which only JavaScript opens.
	test.skip(testInfo.project.use.javaScriptEnabled === false, 'The bell needs JavaScript.');

	const { organiser, delegate, conference, announcementsPath } =
		await makeSeatedDelegate('Home News MUN');

	await addAnnouncement({ conferenceId: conference.id, author: organiser, title: 'Badges ready' });

	await signIn(page, delegate);
	await page.goto('/home');

	// T150 took the "Latest announcements" card off the dashboard, because the
	// mockup has no place for it. An announcement still reaches the reader there,
	// through the bell in the top bar, which `notify_announcement` fills.
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.getByRole('region', { name: 'Latest announcements' })).toHaveCount(0);

	// The open panel is drawn over the page rather than inside the bar, and
	// `data-slot` is the name shadcn gives each of its parts.
	await page.getByLabel(/^Notifications, \d+ unread$/).click();
	await page
		.locator('[data-slot="popover-content"]')
		.getByRole('button', { name: /Badges ready/ })
		.click();

	await expect(page).toHaveURL(new RegExp(`${announcementsPath}(\\?|$)`));
	await expect(page.getByRole('main').getByText('Badges ready', { exact: true })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
});

/** Publish three long announcements, one of them pinned. */
async function fillTheList(conferenceId: string, author: TestUser): Promise<void> {
	const longBody =
		'Delegates are reminded that the dress code is western business attire for every ' +
		'session, including the closing ceremony in the Aula, and that name badges must be ' +
		'worn at all times inside the conference building.\n\nLost badges can be replaced ' +
		'at the registration desk in the main hall.';

	const titles = [
		'Dress code for the closing ceremony in the Aula Conference Hall',
		'Session I of the Special Political and Decolonization Committee moves',
		'Lunch is served in the Dining Hall from half past twelve'
	];

	// The first is pinned, which draws the pin and the tinted background.
	const seeds = titles.map((title, index) => ({
		conferenceId,
		author,
		title,
		body: longBody,
		isPinned: index === 0
	}));

	await addAnnouncements(author, seeds);
}

test('does not spill off the side of a phone screen', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	const { organiser, delegate, conference, announcementsPath } = await makeSeatedDelegate(
		'Phone Announcements International Model United Nations Conference'
	);

	await fillTheList(conference.id, organiser);
	await signIn(page, delegate);
	await openAnnouncements(page, announcementsPath);

	await expectNoSidewaysOverflow(page);
});

test('fits in a few screens', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough to measure a height.');

	const { organiser, delegate, conference, announcementsPath } = await makeSeatedDelegate(
		'Height Announcements MUN'
	);

	await fillTheList(conference.id, organiser);
	await signIn(page, delegate);
	await openAnnouncements(page, announcementsPath);

	// Saved before the assertion, so that a failure leaves a picture of the page.
	await saveFullPageScreenshot(page, 'announcements');
	await expectPageFitsInScreens(page, ANNOUNCEMENTS_SCREENS);
});
