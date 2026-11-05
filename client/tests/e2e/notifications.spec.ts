import { expect, test } from '@playwright/test';
import { markPage, readMarker, skipWithoutJavaScript } from './in-place';
import { createTestUser, giveNotifications, signIn } from './signed-in-user';
import { waitUntilAnswered } from './chair-room-fixtures';
import { answerSlowly, answerWithError, sawSpinner, watchForSpinners } from './instant';
import { expectNoSidewaysOverflow, saveFullPageScreenshot } from './page-shape';

// The acceptance criteria of `specs/05-pages/delegate/notifications.md` that
// need a real browser. Every test makes its own account, so they can run side
// by side without seeing each other's rows.

// The bell dropdown lists the latest eight as well, so the same words are on
// the page twice. Assertions about the list itself are scoped to `<main>`.

/** How soon a pressed control must show its result, before the server has answered. */
const AT_ONCE_TIMEOUT_MS = 1_000;

/** A moment yesterday, so a notification lands under the "Yesterday" heading. */
function yesterday(): string {
	return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

test('a visitor is sent to the sign in page and back again', async ({ page }) => {
	await page.goto('/notifications');

	await expect(page).toHaveURL('/login?next=%2Fnotifications');
});

test('somebody with nothing yet is told so', async ({ page }) => {
	const user = await createTestUser();
	await signIn(page, user);
	await page.goto('/notifications');

	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Notifications');
	await expect(page.getByRole('main').getByText('No notifications yet.')).toBeVisible();
});

test('the page has its own title', async ({ page }) => {
	const user = await createTestUser();
	await signIn(page, user);
	await page.goto('/notifications');

	await expect(page).toHaveTitle('Notifications · MUNMeet');
});

test('the bell counts the unread ones and the page says which they are', async ({ page }) => {
	const user = await createTestUser();
	await giveNotifications(user, [
		{ title: 'Your application to DelftMUN 2026 was accepted' },
		{ title: 'Invoice DELFTMUN-2026-0031 is ready' },
		{ title: 'Dress code confirmed', readAt: new Date().toISOString() }
	]);

	await signIn(page, user);
	await page.goto('/notifications');

	await expect(page.getByLabel('Notifications, 2 unread')).toBeVisible();
	// Colour is never the only signal, so each unread row says so in words.
	await expect(page.getByRole('main').getByText('Unread.')).toHaveCount(2);
});

test('the rows are grouped by day', async ({ page }) => {
	const user = await createTestUser();
	await giveNotifications(user, [
		{ title: 'Your application to DelftMUN 2026 was accepted' },
		{ title: 'Dress code confirmed', createdAt: yesterday() }
	]);

	await signIn(page, user);
	await page.goto('/notifications');

	await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Yesterday', exact: true })).toBeVisible();
});

test('opening one marks it read and lands where it points', async ({ page }) => {
	const user = await createTestUser();
	await giveNotifications(user, [
		{ title: 'Your application to DelftMUN 2026 was accepted', linkPath: '/conferences' }
	]);

	await signIn(page, user);
	await page.goto('/notifications');

	await page.getByRole('button', { name: /was accepted/ }).click();

	await expect(page).toHaveURL('/conferences');
	// The bell has nothing left to count, so it loses its unread name.
	await expect(page.getByLabel('Notifications', { exact: true })).toBeVisible();
});

test('"Mark all as read" clears the bell and says so', async ({ page }) => {
	const user = await createTestUser();
	await giveNotifications(user, [
		{ title: 'Your application to DelftMUN 2026 was accepted' },
		{ title: 'Invoice DELFTMUN-2026-0031 is ready' }
	]);

	await signIn(page, user);
	await page.goto('/notifications');

	await page.getByRole('button', { name: 'Mark all as read' }).click();

	await expect(page).toHaveURL('/notifications');
	await expect(page.getByText('All notifications marked as read.')).toBeVisible();
	await expect(page.getByLabel('Notifications', { exact: true })).toBeVisible();
	await expect(page.getByRole('main').getByText('Unread.')).toHaveCount(0);
});

test('"Mark all as read" answers in place without reloading', async ({ page }, testInfo) => {
	// T125: this button used to post and reload the whole page. A marker left
	// on `window` before pressing (`./in-place.ts`) proves the press answered
	// in place instead, and the rows lose "Unread." before the server replies.
	skipWithoutJavaScript(testInfo);
	const user = await createTestUser();
	await giveNotifications(user, [
		{ title: 'Your application to DelftMUN 2026 was accepted' },
		{ title: 'Invoice DELFTMUN-2026-0031 is ready' }
	]);

	await signIn(page, user);
	await page.goto('/notifications');
	await markPage(page);

	await page.getByRole('button', { name: 'Mark all as read' }).click();

	await expect(page.getByRole('main').getByText('Unread.')).toHaveCount(0, {
		timeout: AT_ONCE_TIMEOUT_MS
	});
	await expect(page.getByText('All notifications marked as read.')).toBeVisible();
	expect(await readMarker(page)).toBe('still here');
});

test('"Remove" takes one away for good', async ({ page }) => {
	const user = await createTestUser();
	await giveNotifications(user, [{ title: 'Dress code confirmed' }]);

	await signIn(page, user);
	await page.goto('/notifications');

	await page.getByRole('button', { name: 'Remove' }).click();

	await expect(page.getByRole('main').getByText('No notifications yet.')).toBeVisible();
});

test('"Remove" takes a row away at once, and a failed "Mark all as read" goes back', async ({
	page
}, testInfo) => {
	// T142: the row goes the moment "Remove" is pressed, before the server has
	// answered and with no spinner. A press the server fails puts the rows back
	// as they were and says what did not happen.
	skipWithoutJavaScript(testInfo);
	const user = await createTestUser();
	await giveNotifications(user, [
		{ title: 'Your application to DelftMUN 2026 was accepted' },
		{ title: 'Invoice DELFTMUN-2026-0031 is ready' },
		{ title: 'Dress code confirmed' }
	]);
	const main = page.getByRole('main');

	await signIn(page, user);
	await page.goto('/notifications');
	await answerSlowly(page, 'delete');
	await watchForSpinners(page);

	await main
		.getByRole('listitem')
		.filter({ hasText: 'Dress code confirmed' })
		.getByRole('button', { name: 'Remove' })
		.click();

	await expect(main.getByText('Dress code confirmed')).toHaveCount(0, {
		timeout: AT_ONCE_TIMEOUT_MS
	});
	await waitUntilAnswered(page);
	expect(await sawSpinner(page)).toBe(false);

	await answerWithError(page, 'markAllRead');
	await page.getByRole('button', { name: 'Mark all as read' }).click();

	await expect(page.getByRole('alert')).toContainText('The notifications were not marked as read.');
	await waitUntilAnswered(page);
	await expect(main.getByText('Unread.')).toHaveCount(2);
});

test('there are thirty to a page, with links to the rest', async ({ page }) => {
	const user = await createTestUser();
	const seeds = Array.from({ length: 31 }, (_unused, index) => ({
		title: `Announcement number ${index + 1}`,
		// One a minute going backwards, so the order is the same every run.
		createdAt: new Date(Date.now() - index * 60 * 1000).toISOString()
	}));
	await giveNotifications(user, seeds);

	await signIn(page, user);
	await page.goto('/notifications');

	const list = page.getByRole('main');

	await expect(list.getByText('Page 1 of 2')).toBeVisible();
	await expect(list.getByText('Announcement number 1', { exact: true })).toBeVisible();
	await expect(list.getByText('Announcement number 31', { exact: true })).toHaveCount(0);

	// A real link, so the second page can be bookmarked and shared.
	await page.getByRole('link', { name: 'Next →' }).click();

	await expect(page).toHaveURL('/notifications?page=2');
	await expect(list.getByText('Announcement number 31', { exact: true })).toBeVisible();
});

test('the bell dropdown lists the latest ones and links to the whole list', async ({
	page
}, testInfo) => {
	// The panel is a shadcn popover, which only JavaScript opens. Without it the
	// bell is still there, and `/notifications` is the whole list.
	skipWithoutJavaScript(testInfo);
	const user = await createTestUser();
	await giveNotifications(user, [{ title: 'Your application to DelftMUN 2026 was accepted' }]);

	await signIn(page, user);

	await page.getByLabel('Notifications, 1 unread').click();

	await expect(
		page.getByRole('button', { name: /Your application to DelftMUN 2026 was accepted/ })
	).toBeVisible();

	await page.getByRole('link', { name: 'See all' }).click();
	await expect(page).toHaveURL('/notifications');
});

test('a row in the bell dropdown opens through the notifications page', async ({
	page
}, testInfo) => {
	skipWithoutJavaScript(testInfo);
	const user = await createTestUser();
	await giveNotifications(user, [{ title: 'Dress code confirmed', linkPath: '/conferences' }]);

	await signIn(page, user);
	await page.getByLabel('Notifications, 1 unread').click();
	await page.getByRole('button', { name: /Dress code confirmed/ }).click();

	await expect(page).toHaveURL('/conferences');
	await expect(page.getByLabel('Notifications', { exact: true })).toBeVisible();
});

test('a row in the bell goes where it points before the server has answered', async ({
	page
}, testInfo) => {
	// Trello 1txzWHCK: the row went nowhere until the answer to "open" was back,
	// the panel stayed open over the new page and the count lagged behind.
	skipWithoutJavaScript(testInfo);
	const user = await createTestUser();
	await giveNotifications(user, [
		{ title: 'Dress code confirmed', linkPath: '/conferences' },
		{ title: 'Invoice DELFTMUN-2026-0031 is ready' }
	]);

	// Every answer to "open" is held back until the test lets it through.
	let releaseAnswer: () => void = () => undefined;
	const answerReleased = new Promise<void>((resolve) => (releaseAnswer = resolve));
	await page.route(
		(url) => url.searchParams.has('/open'),
		async (route) => {
			await answerReleased;
			await route.continue();
		}
	);

	await signIn(page, user);
	await page.getByLabel('Notifications, 2 unread').click();
	const row = page.getByRole('button', { name: /Dress code confirmed/ });
	await expect(row).toHaveCSS('cursor', 'pointer');
	await row.click();

	await expect(page).toHaveURL('/conferences', { timeout: AT_ONCE_TIMEOUT_MS });
	await expect(page.getByRole('link', { name: 'See all' })).toBeHidden();
	await expect(page.getByLabel('Notifications, 1 unread')).toBeVisible();

	releaseAnswer();
	await waitUntilAnswered(page);

	// The answer only reads the page again: the reader stays where they are.
	await expect(page).toHaveURL('/conferences');
	await expect(page.getByLabel('Notifications, 1 unread')).toBeVisible();
});

test('the page and the open bell keep to the width of a phone', async ({ page }, testInfo) => {
	// T183: the rows are one divided card, and the bell's panel has a header,
	// a list that scrolls on its own and a footer. The pictures are for a person
	// to look at; the measurement is that nothing pushes the page sideways.
	// The design was drawn at 1440px, so the wide pictures are taken at that width.
	// The bell's panel only opens with JavaScript.
	skipWithoutJavaScript(testInfo);
	if (testInfo.project.name !== 'phone') {
		await page.setViewportSize({ width: 1440, height: 900 });
	}
	const user = await createTestUser();
	await giveNotifications(user, [
		{
			title: 'Your application to DelftMUN 2026 was accepted',
			body: 'Your seat will be allocated in the next few days, once the secretariat has met.'
		},
		{ title: 'Invoice DELFTMUN-2026-0031 is ready', readAt: new Date().toISOString() },
		{ title: 'Dress code confirmed', createdAt: yesterday() }
	]);

	await signIn(page, user);
	await page.goto('/notifications');
	await expect(page.getByRole('main').getByText('Unread.')).toHaveCount(2);

	await saveFullPageScreenshot(page, 'notifications');
	await expectNoSidewaysOverflow(page);

	await page.getByLabel('Notifications, 2 unread').click();
	const seeAll = page.getByRole('link', { name: 'See all' });
	await expect(seeAll).toBeVisible();

	await saveFullPageScreenshot(page, 'notifications-bell-open');
	await expectNoSidewaysOverflow(page);

	// A panel running off the left edge adds no sideways scroll, so the check
	// above cannot see it: the footer, which is as wide as the panel, is
	// measured against the window instead.
	const panelBox = await seeAll.boundingBox();
	const windowWidth = page.viewportSize()?.width ?? 0;
	expect(panelBox?.x ?? -1).toBeGreaterThanOrEqual(0);
	expect((panelBox?.x ?? 0) + (panelBox?.width ?? 0)).toBeLessThanOrEqual(windowWidth);
});
