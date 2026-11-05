import { expect, test, type Page } from '@playwright/test';
import { DATABASE_TIMEOUT_MS } from './chair-room-fixtures';
import { saveFullPageScreenshot } from './page-shape';
import { signIn } from './signed-in-user';
import { FIONA, JAMES, SAMUEL, TOM } from './walkthrough-seed';

// T171: "Your room" on a conference day (specs/05-pages/delegate/schedule.md,
// "Room links on a conference day"). The tests walk the walkthrough seed on
// its own day: "Northbridge MUN (running today)" is on day 2 of 3, and
// "Northbridge MUN (about to start)" is four days away.
//
// * Fiona, who chairs its Security Council, reads "Your room: UNSC" with an
//   "Open chair room" button on its schedule, where the top bar's "Schedule"
//   takes her, and the same link on the council's session;
// * James, who holds a seat in it, reads "Open live room" instead;
// * Tom, who volunteers there and holds no seat, reads no room line;
// * Samuel, whose committee meets in four days, reads none yet.
//
// The tests only read, so they run on every project.

/** The walkthrough seed's conference on day 2 of 3. */
const RUNNING_TODAY_SCHEDULE = '/conferences/northbridge-running-today/schedule';

/** The walkthrough seed's conference four days away. */
const ABOUT_TO_START_SCHEDULE = '/conferences/northbridge-about-to-start/schedule';

/** The Security Council's room, as Fiona and James reach it. */
const CHAIR_ROOM_PATH = '/conferences/northbridge-running-today/committees/unsc/chair';
const LIVE_ROOM_PATH = '/conferences/northbridge-running-today/committees/unsc/live';

/** The "Your room" lines on the page, one for each room. */
function yourRoomLines(page: Page) {
	return page.getByRole('main').getByRole('listitem').filter({ hasText: 'Your room:' });
}

/**
 * The details of the Security Council's committee session in the seed, opened
 * by pressing its block on the calendar.
 */
async function openSessionDetails(page: Page) {
	await page
		.getByRole('main')
		.getByRole('link', { name: /Security Council session/ })
		.first()
		.click();

	const details = page.getByRole('dialog');
	await expect(details).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	return details;
}

test.describe('"Your room" on a conference day', () => {
	test('gives a chair "Open chair room" on the schedule of the day, and on the session', async ({
		page
	}) => {
		await signIn(page, FIONA);

		// `/schedule` sends Fiona on to the conference she is chairing today.
		await page.goto('/schedule');
		await expect(page).toHaveURL(RUNNING_TODAY_SCHEDULE, { timeout: DATABASE_TIMEOUT_MS });
		await expect(yourRoomLines(page)).toHaveText([/Your room: UNSC.*Open chair room/], {
			timeout: DATABASE_TIMEOUT_MS
		});
		// SvelteKit writes its links relative to the page, so where one leads is
		// checked by following it.
		await (await openSessionDetails(page)).getByRole('link', { name: 'Open chair room' }).click();
		await expect(page).toHaveURL(CHAIR_ROOM_PATH, { timeout: DATABASE_TIMEOUT_MS });

		await page.goto(RUNNING_TODAY_SCHEDULE);
		await yourRoomLines(page).getByRole('link', { name: 'Open chair room' }).click();
		await expect(page).toHaveURL(CHAIR_ROOM_PATH, { timeout: DATABASE_TIMEOUT_MS });
	});

	test('gives a delegate "Open live room" instead', async ({ page }) => {
		await signIn(page, JAMES);

		await page.goto('/schedule');
		await expect(page).toHaveURL(RUNNING_TODAY_SCHEDULE, { timeout: DATABASE_TIMEOUT_MS });
		await expect(yourRoomLines(page)).toHaveText([/Your room: UNSC.*Open live room/], {
			timeout: DATABASE_TIMEOUT_MS
		});
		// SvelteKit writes its links relative to the page, so where one leads is
		// checked by following it.
		await (await openSessionDetails(page)).getByRole('link', { name: 'Open live room' }).click();
		await expect(page).toHaveURL(LIVE_ROOM_PATH, { timeout: DATABASE_TIMEOUT_MS });
	});

	test('gives a volunteer with no committee no room line', async ({ page }) => {
		await signIn(page, TOM);

		await page.goto('/schedule');
		await expect(page).toHaveURL(RUNNING_TODAY_SCHEDULE, { timeout: DATABASE_TIMEOUT_MS });
		await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(yourRoomLines(page)).toHaveCount(0);
	});

	test('gives a chair no room line four days before the conference', async ({ page }) => {
		await signIn(page, SAMUEL);

		await page.goto(ABOUT_TO_START_SCHEDULE);
		await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(yourRoomLines(page)).toHaveCount(0);

		await page.goto('/schedule');
		await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(yourRoomLines(page)).toHaveCount(0);
	});

	test('marks today on the calendar, with the room along its top', async ({ page }, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop', 'One picture of the page is enough.');

		await signIn(page, FIONA);
		await page.goto(RUNNING_TODAY_SCHEDULE);

		// The seed's conference is on its second day, so today's column says so.
		const main = page.getByRole('main');
		await expect(main.getByText('Today · Day 2', { exact: true })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(yourRoomLines(page)).toHaveCount(1);

		await saveFullPageScreenshot(page, 'schedule-running-today');
	});
});
