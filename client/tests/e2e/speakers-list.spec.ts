import { expect, test, type Page } from '@playwright/test';
import {
	DATABASE_TIMEOUT_MS,
	makeChairedCommittee,
	readCommitteeState,
	takeRollCall,
	waitUntilAnswered,
	type ChairedCommittee
} from './chair-room-fixtures';
import {
	addBox,
	addThroughBox,
	callSpeaker,
	floorSpeaker,
	gslPath,
	openFloorMenu,
	openGslView,
	openRowMenu,
	queueColumn,
	readEntries,
	readSpeakingSeat,
	readWaitingOrder,
	seedWaiting,
	startSessionDirectly,
	waitingRows
} from './gsl-fixtures';
import { createTestUser, signIn } from './signed-in-user';

// The Speakers page is gone (S4): `chair/speakers` redirects to the GSL view,
// whose list footer holds the list's settings (`specs/05-pages/chair/speakers.md`).
// This file proves the redirect and that nothing links to the old page any
// more, and keeps the Speakers page's own criteria, which moved to
// `specs/05-pages/chair/gsl.md` with their evidence, pointed at `chair/gsl`:
// adding and its refusals, "Next", reordering, the yields, the speaking time,
// a closed list, and a second screen following along.
//
// Every form is a plain `<form method="post">`, so every test but the
// realtime one runs on all three projects; the stale-page refusals run on
// `desktop-no-js`, where no realtime brings the second page up to date.

/** How long the realtime criterion allows a second screen to catch up. */
const REALTIME_TIMEOUT_MS = 2_000;

/** Start a session, sign the chair in and open the GSL view. */
async function openWithSession(page: Page, room: ChairedCommittee): Promise<void> {
	await startSessionDirectly(room);
	await signIn(page, room.chair);
	await openGslView(page, gslPath(room));
}

/** The length of the speaker's clock, in seconds, which "Next" sets from the list's speaking time. */
async function readClockLength(room: ChairedCommittee): Promise<number> {
	const state = await readCommitteeState(room.committeeId);

	return state.timer_total_seconds ?? 0;
}

test.describe('the redirect', () => {
	test('sends a chair from chair/speakers to chair/gsl for good, dropping ?list= and ?yield=', async ({
		page
	}) => {
		const room = await makeChairedCommittee('Redirect Speakers MUN');
		await startSessionDirectly(room);
		await signIn(page, room.chair);

		for (const search of ['', '?list=00000000-0000-0000-0000-000000000000', '?yield=seat']) {
			const response = await page.request.get(`${room.roomPath}/speakers${search}`, {
				maxRedirects: 0
			});

			expect(response.status()).toBe(308);
			expect(new URL(response.headers()['location'], 'http://localhost').pathname).toBe(
				gslPath(room)
			);
		}

		await page.goto(`${room.roomPath}/speakers?yield=seat`);
		await expect(page).toHaveURL(gslPath(room));
		await expect(page.getByRole('heading', { name: /General Speakers’ List/ })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
	});

	test('sends the organiser there too', async ({ page }) => {
		const room = await makeChairedCommittee('Organiser Redirect Speakers MUN');

		await signIn(page, room.organiser);
		await page.goto(`${room.roomPath}/speakers`);

		await expect(page).toHaveURL(gslPath(room), { timeout: DATABASE_TIMEOUT_MS });
	});

	test('still sends a visitor to sign in, and answers anybody else with a 404', async ({
		page
	}) => {
		const room = await makeChairedCommittee('Gate Speakers MUN');
		const speakersPath = `${room.roomPath}/speakers`;

		await page.goto(speakersPath);
		await expect(page).toHaveURL(`/login?next=${encodeURIComponent(speakersPath)}`);

		const stranger = await createTestUser('Speakers Stranger');
		await signIn(page, stranger);
		const response = await page.goto(speakersPath);

		expect(response?.status()).toBe(404);
	});

	test('no page of the chair room links to chair/speakers any more', async ({ page }) => {
		const room = await makeChairedCommittee('Links Speakers MUN');

		await openWithSession(page, room);
		await expect(page.locator('a[href$="/speakers"], a[href*="/speakers?"]')).toHaveCount(0);
		await expect(page.getByRole('link', { name: 'List settings and caucus lists' })).toHaveCount(0);
		// The list's settings are the GSL view's list footer.
		await expect(queueColumn(page).getByText('1:30 each')).toBeVisible();
		await expect(queueColumn(page).getByRole('button', { name: 'Close list' })).toBeVisible();

		// The live room in debate draws the same view, with no such link either.
		await seedWaiting(room, ['France']);
		await page.reload();
		await callSpeaker(page, 'France');
		await page.goto(room.roomPath);
		await expect(floorSpeaker(page, 'France')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await expect(page.locator('a[href$="/speakers"], a[href*="/speakers?"]')).toHaveCount(0);
	});
});

test.describe('the list, now on the GSL view', () => {
	test('adding puts a seat last, and only present seats are offered', async ({
		page
	}, testInfo) => {
		const room = await makeChairedCommittee('Add Speakers MUN');

		await openWithSession(page, room);
		await addThroughBox(page, testInfo, 'Ghana');
		await addThroughBox(page, testInfo, 'France');

		await expect(waitingRows(page)).toHaveText([/Ghana/, /France/]);
		expect(await readWaitingOrder(room)).toEqual(['Ghana', 'France']);

		await takeRollCall(room, 'Japan');
		await page.reload();

		if (testInfo.project.use.javaScriptEnabled === false) {
			// Without JavaScript only the present seats not on the list are offered.
			await expect(page.getByLabel('Add a delegation').locator('option')).toHaveCount(0, {
				timeout: DATABASE_TIMEOUT_MS
			});
		} else {
			await addBox(page).click();
			await expect(page.getByRole('option', { name: /Ghana/ })).toContainText('in list');
			await expect(page.getByRole('option', { name: /Japan/ })).toContainText(
				'absent · Mark present'
			);
		}
	});

	test('a stale page is refused a duplicate or an absent seat', async ({ page }, testInfo) => {
		// With JavaScript, realtime would bring the second page up to date before
		// the press this test needs it to make from an out-of-date page.
		test.skip(testInfo.project.name !== 'desktop-no-js', 'A stale page needs realtime off.');

		const room = await makeChairedCommittee('Refusal Speakers MUN');
		await openWithSession(page, room);
		const stalePage = await page.context().newPage();
		await openGslView(stalePage, gslPath(room));

		await addThroughBox(page, testInfo, 'France');
		await stalePage.getByLabel('Add a delegation').selectOption({ label: 'France' });
		await queueColumn(stalePage).getByRole('button', { name: 'Add', exact: true }).click();

		await expect(stalePage.getByText('That seat is already on the list.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		await openGslView(stalePage, gslPath(room));
		await takeRollCall(room, 'Japan');
		await stalePage.getByLabel('Add a delegation').selectOption({ label: 'Japan' });
		await queueColumn(stalePage).getByRole('button', { name: 'Add', exact: true }).click();

		await expect(stalePage.getByText('That seat is not present.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		expect(await readWaitingOrder(room)).toEqual(['France']);
	});

	test('"Next" records the speech and a new time reaches the next speaker only', async ({
		page
	}, testInfo) => {
		const room = await makeChairedCommittee('Next Speakers MUN');

		await openWithSession(page, room);
		await addThroughBox(page, testInfo, 'France');
		await addThroughBox(page, testInfo, 'Ghana');

		await callSpeaker(page, 'France');
		expect(await readClockLength(room)).toBe(90);

		await queueColumn(page).getByRole('link', { name: 'Change' }).click();
		await queueColumn(page).getByLabel('Speaking time').fill('0:45');
		await queueColumn(page).getByLabel('Speaking time').press('Enter');
		await expect(queueColumn(page).getByText('0:45 each')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await waitUntilAnswered(page);
		// France's clock carries on at the length it started with.
		expect(await readClockLength(room)).toBe(90);

		await page.getByRole('button', { name: 'Next: Ghana' }).click();
		await expect(floorSpeaker(page, 'Ghana')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await waitUntilAnswered(page);
		expect(await readClockLength(room)).toBe(45);
		const [france] = await readEntries(room);
		expect(france.status).toBe('spoken');
		expect(france.spokeSeconds).toBeGreaterThanOrEqual(0);
		expect(france.spokeSeconds).toBeLessThanOrEqual(90);
		await expect(
			queueColumn(page)
				.getByText(/France \d:\d\d/)
				.first()
		).toBeVisible();
	});

	test('reordering moves waiting seats and survives a refresh', async ({ page }, testInfo) => {
		const room = await makeChairedCommittee('Reorder Speakers MUN');

		await openWithSession(page, room);
		for (const seatName of ['France', 'Ghana', 'Japan']) {
			await addThroughBox(page, testInfo, seatName);
		}

		await openRowMenu(page, 'Japan');
		await page.getByRole('button', { name: 'Move up' }).click();
		await expect(waitingRows(page)).toHaveText([/France/, /Japan/, /Ghana/], {
			timeout: DATABASE_TIMEOUT_MS
		});

		await openRowMenu(page, 'France');
		await page.getByRole('button', { name: 'Move down' }).click();
		await expect(waitingRows(page)).toHaveText([/Japan/, /France/, /Ghana/], {
			timeout: DATABASE_TIMEOUT_MS
		});

		// The new order shows before the server has saved it (T141), so a refresh
		// straight away could come before the second move is sent.
		await waitUntilAnswered(page);
		await page.reload();
		await expect(waitingRows(page)).toHaveText([/Japan/, /France/, /Ghana/], {
			timeout: DATABASE_TIMEOUT_MS
		});
		expect(await readWaitingOrder(room)).toEqual(['Japan', 'France', 'Ghana']);
	});

	test('a speaker yields to another seat, then that seat yields to the chair', async ({
		page
	}, testInfo) => {
		const room = await makeChairedCommittee('Yield Speakers MUN');

		await openWithSession(page, room);
		await addThroughBox(page, testInfo, 'France');
		await callSpeaker(page, 'France');

		await openFloorMenu(page, 'Yield');
		await page.getByRole('main').getByRole('button', { name: 'Japan' }).click();

		await expect.poll(() => readSpeakingSeat(room), { timeout: DATABASE_TIMEOUT_MS }).toBe('Japan');
		await expect(page).toHaveURL(gslPath(room));
		await expect(floorSpeaker(page, 'Japan')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

		await openFloorMenu(page, 'Yield');
		await page
			.getByRole('main')
			.getByRole('button', { name: /To the chair/ })
			.click();

		await expect(page.getByText('Add the first speaker to the list')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		// The screen shows the result before the server has saved it (T141), so wait for its answer.
		await waitUntilAnswered(page);
		expect((await readEntries(room)).map((entry) => entry.status)).toEqual(['spoken', 'spoken']);
	});

	test('a closed list takes nobody new but still moves on', async ({ page }, testInfo) => {
		const room = await makeChairedCommittee('Closed Speakers MUN');

		await openWithSession(page, room);
		for (const seatName of ['France', 'Ghana', 'Japan']) {
			await addThroughBox(page, testInfo, seatName);
		}

		await queueColumn(page).getByRole('button', { name: 'Close list' }).click();
		await expect(queueColumn(page).getByText('The list is closed.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		await callSpeaker(page, 'France');

		await openRowMenu(page, 'Japan');
		await page.getByRole('button', { name: 'Move up' }).click();
		await expect(waitingRows(page)).toHaveText([/Japan/, /Ghana/], {
			timeout: DATABASE_TIMEOUT_MS
		});

		await openRowMenu(page, 'Ghana');
		await page.getByRole('button', { name: 'Remove' }).click();
		await expect(waitingRows(page)).toHaveText([/Japan/], { timeout: DATABASE_TIMEOUT_MS });

		await queueColumn(page).getByRole('button', { name: 'Open list' }).click();
		await expect(queueColumn(page).getByText('The list is closed.')).toHaveCount(0, {
			timeout: DATABASE_TIMEOUT_MS
		});
	});

	test('a second screen hears a speaker added', async ({ browser }, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop', 'Realtime needs JavaScript and one project.');

		const room = await makeChairedCommittee('Realtime Speakers MUN');
		const chairContext = await browser.newContext();
		const organiserContext = await browser.newContext();
		const chairPage = await chairContext.newPage();
		const organiserPage = await organiserContext.newPage();

		await openWithSession(chairPage, room);
		await signIn(organiserPage, room.organiser);
		await openGslView(organiserPage, gslPath(room));
		await expect(organiserPage.getByText('Connected', { exact: true })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		await addThroughBox(chairPage, testInfo, 'Ghana');

		await expect(waitingRows(organiserPage).filter({ hasText: 'Ghana' })).toBeVisible({
			timeout: REALTIME_TIMEOUT_MS + 1_000
		});

		await chairContext.close();
		await organiserContext.close();
	});
});
