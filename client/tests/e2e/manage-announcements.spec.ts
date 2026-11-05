import { expect, test, type Page } from '@playwright/test';
import { createTestUser, signIn, type TestUser } from './signed-in-user';
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
	addAcceptedDelegation,
	addAnnouncement,
	addAnnouncements,
	readAnnouncementRecipients
} from './announcement-fixtures';
import { answerConfirmationPage } from './confirmation-page';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { waitUntilAnswered } from './chair-room-fixtures';
import { skipWithoutJavaScript } from './in-place';
import {
	AT_ONCE_TIMEOUT_MS,
	answerSlowly,
	answerWithError,
	sawSpinner,
	watchForSpinners
} from './instant';

// The acceptance criteria of `specs/05-pages/organiser/announcements.md` that
// need a real browser, for the page task T36 builds at
// `/manage/[slug]/announcements`:
//
// * publishing to one committee notifies the people in that committee and
//   nobody in the other one, and the preview counted exactly as many;
// * the delegation picker is offered only once a delegation is accepted;
// * an edit changes the text and notifies nobody again;
// * a pinned announcement is listed first;
// * a deleted announcement's notifications stay;
// * an organiser of another conference gets a 404;
// * the page does not spill off a phone and stays a few screens tall.
//
// EVERY ACTION WITHOUT JAVASCRIPT
// Every control is a real submit button in a real `<form method="post">`, or a
// link, and the committee and delegation pickers are shown by CSS alone, so
// these tests run on the `desktop-no-js` project like every other and that is
// the proof. The row menu is a `<details>`, which opens with no script at all.
//
// Every test makes its own conference in `schedule-fixtures.ts`, which says why
// they run in May 2020.

/** How long an assertion that waits on a page reading the database may take. */
const DATABASE_TIMEOUT_MS = 15_000;

/** How long a single try inside a retrying block may take. */
const SINGLE_TRY_TIMEOUT_MS = 2_000;

/** How many windows tall the page may be with a form and a few announcements. */
const MANAGE_ANNOUNCEMENTS_SCREENS = 3;

/** An organiser signed in with a conference of their own. */
type SignedInOrganiser = {
	organiser: TestUser;
	conference: ScheduleConference;
	/** `/manage/<slug>/announcements`. */
	announcementsPath: string;
};

/** Sign a brand-new organiser in and give them a conference. */
async function signInWithAConference(page: Page, prefix: string): Promise<SignedInOrganiser> {
	const organiser = await createTestUser('Priya Nair');
	await signIn(page, organiser);

	const conference = await createScheduleConference({ owner: organiser, namePrefix: prefix });

	return { organiser, conference, announcementsPath: `/manage/${conference.slug}/announcements` };
}

/** Open the page and wait until it has really arrived. */
async function openAnnouncements(page: Page, announcementsPath: string): Promise<void> {
	await page.goto(announcementsPath);

	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
		'Announcements',
		{ timeout: DATABASE_TIMEOUT_MS }
	);
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

/** Open the `<details>` menu of the row showing one announcement. */
async function openRowMenu(page: Page, title: string): Promise<void> {
	await page
		.getByRole('main')
		.locator('summary', { hasText: `Actions for ${title}` })
		.click();
}

/** Whether `first` appears above `second` in the page's main area. */
async function isListedAbove(page: Page, first: string, second: string): Promise<boolean> {
	const text = await page.getByRole('main').innerText();

	return text.indexOf(first) < text.indexOf(second);
}

// Every test signs a new account in and posts at least one form while the whole
// suite shares one local database. `test.slow()` triples the time allowed.
test.beforeEach(() => {
	test.slow();
});

test('publishes to one committee and notifies exactly the people it counted', async ({ page }) => {
	const { conference, announcementsPath } = await signInWithAConference(page, 'Committee News MUN');

	const securityCouncil = await addScheduleCommittee(conference.id, {
		name: 'Security Council',
		abbreviation: 'UNSC'
	});
	const humanRights = await addScheduleCommittee(conference.id, {
		name: 'Human Rights Council',
		abbreviation: 'HRC',
		position: 1
	});
	const inTheCouncil = await createTestUser('Lena Vogel');
	const elsewhere = await createTestUser('Tom Berg');
	await seatDelegate(inTheCouncil, securityCouncil);
	await seatDelegate(elsewhere, humanRights);

	await openAnnouncements(page, announcementsPath);

	const main = page.getByRole('main');
	const committeePicker = main.getByRole('combobox', { name: 'Committee' });

	// The whole conference is counted before anything is chosen.
	await expect(main.getByText('Will notify 2 people · counted for Everyone')).toBeVisible();
	await expect(committeePicker).toBeHidden();

	await main.getByLabel('Title').fill('Room change');
	await main.getByLabel('Message').fill('Session I moves to room 2.');
	await main.getByLabel('Send to').selectOption({ label: 'One committee' });

	// Shown by CSS as soon as "One committee" is chosen, with or without JavaScript.
	await expect(committeePicker).toBeVisible();
	await committeePicker.selectOption({ label: 'Security Council' });
	await main.getByRole('button', { name: 'Preview recipients' }).press('Enter');

	await expect(main.getByText('Will notify 1 person · counted for Security Council')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	// Counting keeps everything that was typed.
	await expect(main.getByLabel('Message')).toHaveValue('Session I moves to room 2.');

	await main.getByRole('button', { name: 'Post announcement' }).press('Enter');

	await expect(page.getByText('Published and sent to 1 person.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(main.getByText('Room change', { exact: true })).toBeVisible();
	expect(await readAnnouncementRecipients(conference.id)).toEqual([inTheCouncil.id]);
});

test('offers one delegation only once a delegation is accepted', async ({ page }) => {
	const { conference, announcementsPath } = await signInWithAConference(
		page,
		'Delegation News MUN'
	);

	await openAnnouncements(page, announcementsPath);

	const main = page.getByRole('main');
	const audiencePicker = main.getByLabel('Send to');

	// Until a delegation is accepted "One delegation" is not offered at all, and
	// the line under the picker says why.
	await expect(audiencePicker.locator('option[value="delegation"]')).toHaveCount(0);
	await expect(
		main.getByText('One delegation can be chosen once a delegation is accepted.')
	).toBeVisible();

	await addAcceptedDelegation(conference.id, 'Delft High School');
	await openAnnouncements(page, announcementsPath);

	const delegationPicker = main.getByRole('combobox', { name: 'Delegation' });

	await expect(delegationPicker).toBeHidden();
	await audiencePicker.selectOption({ label: 'One delegation' });
	await expect(delegationPicker).toBeVisible();
	await delegationPicker.selectOption({ label: 'Delft High School' });
	await main.getByRole('button', { name: 'Preview recipients' }).press('Enter');

	await expect(main.getByText('Will notify 0 people · counted for Delft High School')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(main.getByText('Nobody will receive this yet.')).toBeVisible();
});

test('edits the text without notifying anybody again', async ({ page }) => {
	const { organiser, conference, announcementsPath } = await signInWithAConference(
		page,
		'Edit News MUN'
	);

	const committeeId = await addScheduleCommittee(conference.id, {
		name: 'Security Council',
		abbreviation: 'UNSC'
	});
	await seatDelegate(await createTestUser('Lena Vogel'), committeeId);
	await addAnnouncement({
		conferenceId: conference.id,
		author: organiser,
		title: 'Dress code'
	});

	expect(await readAnnouncementRecipients(conference.id)).toHaveLength(1);

	await openAnnouncements(page, announcementsPath);
	await openRowMenu(page, 'Dress code');

	const main = page.getByRole('main');

	await main.getByRole('link', { name: 'Edit' }).click();
	await expect(main.getByLabel('Title')).toHaveValue('Dress code');
	await expect(main.getByText('Editing does not send a new notification.')).toBeVisible();

	await main.getByLabel('Title').fill('Dress code: western business attire');
	await main.getByRole('button', { name: 'Save changes' }).press('Enter');

	await expect(page.getByText('Announcement updated. No new notification was sent.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(
		main.getByText('Dress code: western business attire', { exact: true })
	).toBeVisible();
	expect(await readAnnouncementRecipients(conference.id)).toHaveLength(1);
});

test('lists a pinned announcement first', async ({ page }) => {
	const { organiser, conference, announcementsPath } = await signInWithAConference(
		page,
		'Pinned News MUN'
	);

	await addAnnouncement({
		conferenceId: conference.id,
		author: organiser,
		title: 'Older news',
		publishedAt: '2020-05-01T09:00:00Z'
	});
	await addAnnouncement({
		conferenceId: conference.id,
		author: organiser,
		title: 'Newer news',
		publishedAt: '2020-05-02T09:00:00Z'
	});

	await openAnnouncements(page, announcementsPath);
	expect(await isListedAbove(page, 'Newer news', 'Older news')).toBe(true);

	await openRowMenu(page, 'Older news');
	await page.getByRole('main').getByRole('button', { name: 'Pin', exact: true }).click();

	await expect(page.getByText('Pinned.', { exact: true })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	// A pinned announcement's line under its title starts with "Pinned".
	await expect(page.getByRole('main').getByText(/^Pinned · /)).toBeVisible();
	expect(await isListedAbove(page, 'Older news', 'Newer news')).toBe(true);
});

/** Whether the announcement `announcementId` is saved as pinned, or null once it is gone. */
async function readIsPinned(announcementId: string): Promise<boolean | null> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('announcements')
		.select('is_pinned')
		.eq('id', announcementId)
		.maybeSingle();

	if (error) throw new Error(`Could not read the test announcement: ${error.message}`);

	return data === null ? null : data.is_pinned;
}

// T142: with JavaScript "Pin" moves the announcement to the top the moment it
// is pressed, before the server has answered and with no spinner, and a press
// the server refuses goes back and says what did not happen.
test('pins at once, and puts a refused delete back', async ({ page }, testInfo) => {
	skipWithoutJavaScript(testInfo);

	const { organiser, conference, announcementsPath } = await signInWithAConference(
		page,
		'Instant News MUN'
	);

	const olderId = await addAnnouncement({
		conferenceId: conference.id,
		author: organiser,
		title: 'Older news',
		publishedAt: '2020-05-01T09:00:00Z'
	});
	await addAnnouncement({
		conferenceId: conference.id,
		author: organiser,
		title: 'Newer news',
		publishedAt: '2020-05-02T09:00:00Z'
	});

	await openAnnouncements(page, announcementsPath);
	await answerSlowly(page, 'togglePin');
	await watchForSpinners(page);

	await openRowMenu(page, 'Older news');
	await page.getByRole('main').getByRole('button', { name: 'Pin', exact: true }).click();

	await expect(page.getByRole('main').getByText(/^Pinned · /)).toBeVisible({
		timeout: AT_ONCE_TIMEOUT_MS
	});
	expect(await isListedAbove(page, 'Older news', 'Newer news')).toBe(true);

	await waitUntilAnswered(page);
	expect(await sawSpinner(page)).toBe(false);
	expect(await readIsPinned(olderId)).toBe(true);

	await answerWithError(page, 'delete');
	await pressAndConfirm(page, 'Delete');

	await expect(page.getByRole('alert')).toContainText('The announcement was not deleted.', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(page);
	await expect(page.getByRole('main').getByText('Older news', { exact: true })).toBeVisible();
	expect(await readIsPinned(olderId)).toBe(true);
});

test('deletes an announcement and keeps the notifications it sent', async ({ page }) => {
	const { organiser, conference, announcementsPath } = await signInWithAConference(
		page,
		'Delete News MUN'
	);

	const committeeId = await addScheduleCommittee(conference.id, {
		name: 'Security Council',
		abbreviation: 'UNSC'
	});
	await seatDelegate(await createTestUser('Lena Vogel'), committeeId);
	await addAnnouncement({
		conferenceId: conference.id,
		author: organiser,
		title: 'Cancelled'
	});

	await openAnnouncements(page, announcementsPath);
	await pressAndConfirm(page, 'Delete');

	await expect(
		page.getByText('Announcement deleted. Notifications already sent will say it was removed.')
	).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(page.getByRole('main').getByText('No announcements yet.')).toBeVisible();
	expect(await readAnnouncementRecipients(conference.id)).toHaveLength(1);
});

test('answers the announcements of a conference somebody else runs with a 404', async ({
	page
}) => {
	await signInWithAConference(page, 'My Own MUN');

	const stranger = await createTestUser('Someone Else');
	const theirs = await createScheduleConference({ owner: stranger, namePrefix: 'Not Mine MUN' });

	const response = await page.goto(`/manage/${theirs.slug}/announcements`);

	expect(response?.status()).toBe(404);
});

/** Publish three announcements with long titles and bodies, one of them pinned. */
async function fillTheList(conferenceId: string, author: TestUser): Promise<void> {
	const longBody =
		'Delegates are reminded that the dress code is western business attire for every ' +
		'session, including the closing ceremony in the Aula, and that name badges must be ' +
		'worn at all times inside the conference building.';

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

	const { organiser, conference, announcementsPath } = await signInWithAConference(
		page,
		'Phone Announcements International Model United Nations Conference'
	);

	await fillTheList(conference.id, organiser);
	await openAnnouncements(page, announcementsPath);

	await expectNoSidewaysOverflow(page);
});

test('fits in a few screens', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough to measure a height.');

	const { organiser, conference, announcementsPath } = await signInWithAConference(
		page,
		'Height Announcements MUN'
	);

	await fillTheList(conference.id, organiser);
	await openAnnouncements(page, announcementsPath);

	// Saved before the assertion, so that a failure leaves a picture of the page.
	await saveFullPageScreenshot(page, 'manage-announcements');
	await expectPageFitsInScreens(page, MANAGE_ANNOUNCEMENTS_SCREENS);
});
