import { expect, test, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { ClickBudgetJourney } from './click-budget';
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
	addSeats,
	addThroughBox,
	callSpeaker,
	floorClock,
	floorRegion,
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
	setSpeakerClock,
	startSessionDirectly,
	waitForAddBox,
	waitingRows
} from './gsl-fixtures';
import { skipWithoutJavaScript } from './in-place';
import { expectNoSidewaysOverflow, remInPixels, saveFullPageScreenshot } from './page-shape';
import { createTestUser, giveSeat, signIn } from './signed-in-user';

// The acceptance criteria of `specs/05-pages/chair/gsl.md` tagged (S4) that
// need a real browser: the floor and its clock, the controls and the one
// primary, the waiting floor, the queue column's add box, rows, row menu,
// spoken line and footer, the sizes from a laptop to a phone, and the two
// click budgets the view owns.
//
// Every form of the view is a plain `<form method="post">`, so a test runs on
// all three projects unless it needs JavaScript (the combobox, the keys, the
// clock moving) or one window size. The session is started straight in the
// database (`startSessionDirectly`), so these tests do not depend on the
// lobby, whose own tests are the console frame's.

/** The seats beyond the fixture's three, for the add box and the long list. */
const MORE_SEATS = [
	{ name: 'Germany', countryCode: 'DE' },
	{ name: 'Kenya', countryCode: 'KE' },
	{ name: 'Brazil', countryCode: 'BR' },
	{ name: 'China', countryCode: 'CN' },
	{ name: 'Mexico', countryCode: 'MX' },
	{ name: 'India', countryCode: 'IN' },
	{ name: 'Chile', countryCode: 'CL' },
	{ name: 'Egypt', countryCode: 'EG' },
	{ name: 'Peru', countryCode: 'PE' },
	{ name: 'Spain', countryCode: 'ES' },
	{ name: 'Italy', countryCode: 'IT' },
	{ name: 'Norway', countryCode: 'NO' }
];

/**
 * A waiting row's height, in rem: 44px at the browser's own 16px. From `lg` up
 * the rem grows and shrinks with the window (Trello WMcXfry0), so it is measured
 * against it.
 */
const WAITING_ROW_HEIGHT_REM = 2.75;

/** The fixture's three seats and the twelve above: fifteen in all. */
const ALL_SEATS = ['France', 'Ghana', 'Japan', ...MORE_SEATS.map((seat) => seat.name)];

/** Start a session with `waiting` on the GSL, sign the chair in and open the view. */
async function openWithSession(
	page: Page,
	room: ChairedCommittee,
	waiting: string[] = []
): Promise<void> {
	await startSessionDirectly(room);
	if (waiting.length > 0) await seedWaiting(room, waiting);
	await signIn(page, room.chair);
	await openGslView(page, gslPath(room));
}

/** Set some columns of the room's state straight in the database, as another press would. */
async function updateRoom(
	room: ChairedCommittee,
	changes: { mode?: 'voting' | 'unmoderated_caucus' | 'formal_debate' }
): Promise<void> {
	const admin = createServiceRoleClient();
	const { error } = await admin
		.from('committee_state')
		.update(changes)
		.eq('committee_id', room.committeeId);

	if (error) throw new Error(`Could not change the room: ${error.message}`);
}

/** Whether the latest roll call of the session marks `seatName` present. */
async function readAttendance(room: ChairedCommittee, seatName: string): Promise<string | null> {
	const admin = createServiceRoleClient();
	const state = await readCommitteeState(room.committeeId);
	const { data } = await admin
		.from('roll_calls')
		.select('id, roll_call_entries(status, seats(name))')
		.eq('session_id', state.current_session_id ?? '')
		.order('taken_at', { ascending: false })
		.limit(1)
		.single()
		.overrideTypes<
			{ id: string; roll_call_entries: { status: string; seats: { name: string } }[] },
			{ merge: false }
		>();

	const entry = data?.roll_call_entries.find((candidate) => candidate.seats.name === seatName);

	return entry?.status ?? null;
}

test.describe('the floor', () => {
	test('draws the floor and the queue column side by side, with no card, ring or pill', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name === 'phone', 'A phone draws one column.');
		const room = await makeChairedCommittee('Split GSL MUN');

		await openWithSession(page, room, ['France', 'Ghana']);
		await callSpeaker(page, 'France');

		const floorBox = await floorRegion(page).boundingBox();
		const queueBox = await queueColumn(page).boundingBox();
		const mainBox = await page.getByRole('main').boundingBox();

		if (!floorBox || !queueBox || !mainBox) throw new Error('The view is not on the screen.');

		// About 60 % and 40 % of the width, side by side.
		expect(queueBox.x).toBeGreaterThanOrEqual(floorBox.x + floorBox.width - 1);
		expect(queueBox.width / 1280).toBeGreaterThan(0.3);
		expect(queueBox.width / 1280).toBeLessThan(0.45);
		// The queue column is the full height of the view.
		expect(queueBox.height).toBeGreaterThanOrEqual(mainBox.height - 2);
		await expect(page.getByText('Speaking now')).toHaveCount(0);
		await expect(page.getByText('Current speaker')).toHaveCount(0);
		// No ring timer: its circles are drawn with a dash that empties. The
		// icons on the page are drawn with circles too, but never dashed.
		await expect(page.locator('main circle[stroke-dasharray]')).toHaveCount(0);
	});

	test('shows the title, the speaker, the clock under the speaker and the bar with its legend', async ({
		page
	}) => {
		const room = await makeChairedCommittee('Floor GSL MUN');
		const delegate = await createTestUser('Amélie Laurent');
		await giveSeat(delegate, room.committeeId, 'Ghana');

		await openWithSession(page, room, ['France', 'Ghana']);
		await expect(
			page.getByRole('heading', { name: 'General Speakers’ List · 1:30 each' })
		).toBeVisible();
		await callSpeaker(page, 'France');

		// France has no delegate: the country alone, never "Delegate".
		await expect(floorRegion(page).getByText('Delegate', { exact: true })).toHaveCount(0);
		await expect(floorClock(page)).toHaveText('1:30');
		await expect(floorRegion(page).getByText('0:00 spoken')).toBeVisible();
		await expect(floorRegion(page).getByText('of 1:30')).toBeVisible();

		// The clock is on its own line under the speaker, and the largest text there is.
		const countryBox = await floorSpeaker(page, 'France').boundingBox();
		const clockBox = await floorClock(page).boundingBox();
		expect(clockBox?.y ?? 0).toBeGreaterThan((countryBox?.y ?? 0) + (countryBox?.height ?? 0) - 1);
		expect(Math.abs((clockBox?.x ?? 0) - (countryBox?.x ?? 0))).toBeLessThan(100);
		const sizes = await page.evaluate(() => {
			const clock = document.querySelector('[role="timer"]');
			const elements = Array.from(document.querySelectorAll('main *'));
			const largest = Math.max(
				...elements.map((element) => parseFloat(getComputedStyle(element).fontSize))
			);

			return { clock: clock ? parseFloat(getComputedStyle(clock).fontSize) : 0, largest };
		});
		expect(sizes.clock).toBe(sizes.largest);

		// "Next" ends France's speech; Ghana's delegate is written under the country.
		await page.getByRole('button', { name: 'Next: Ghana' }).click();
		await expect(floorSpeaker(page, 'Ghana')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await expect(floorRegion(page).getByText('Amélie Laurent')).toBeVisible();
	});

	test('the clock reads 0:52, warns under ten seconds, counts up over time and says "Paused"', async ({
		page
	}) => {
		const room = await makeChairedCommittee('Clock GSL MUN');

		await openWithSession(page, room, ['France']);
		await callSpeaker(page, 'France');

		await setSpeakerClock(room, { pausedAtSeconds: 52 });
		await page.reload();
		await expect(floorClock(page)).toHaveText('0:52', { timeout: DATABASE_TIMEOUT_MS });
		await expect(floorClock(page)).toHaveClass(/tabular-nums/);
		await expect(floorRegion(page).getByText('Paused', { exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();

		await setSpeakerClock(room, { runsForSeconds: 6 });
		await page.reload();
		await expect(floorClock(page)).toHaveText(/^0:0[1-6]$/, { timeout: DATABASE_TIMEOUT_MS });
		await expect(floorClock(page)).toHaveClass(/text-warning-700/);
		await expect(floorRegion(page).getByText('Paused', { exact: true })).toHaveCount(0);

		await setSpeakerClock(room, { endedSecondsAgo: 7 });
		await page.reload();
		await expect(floorClock(page)).toHaveText(/^\+0:\d\d$/, { timeout: DATABASE_TIMEOUT_MS });
		await expect(floorClock(page)).toHaveClass(/text-danger-700/);
		// Nothing blinks.
		await expect(floorClock(page)).not.toHaveClass(/animate-/);
		const fill = floorRegion(page).locator('.bg-line > div');
		await expect(fill).toHaveClass(/bg-danger-500/);
	});

	test('the bar steps with a one-second transition, and without one for reduced motion', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop', 'One project is enough for a style.');
		const room = await makeChairedCommittee('Motion GSL MUN');

		await openWithSession(page, room, ['France']);
		await callSpeaker(page, 'France');
		const fill = floorRegion(page).locator('.bg-line > div');

		expect(await fill.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe(
			'1s'
		);

		// The bar's own `motion-reduce:transition-none`, and the site-wide rule in
		// `layout.css` that cuts every transition to 0.01ms, leave no transition
		// a person could see: the bar steps.
		await page.emulateMedia({ reducedMotion: 'reduce' });
		const reducedDuration = await fill.evaluate(
			(element) => getComputedStyle(element).transitionDuration
		);
		expect(parseFloat(reducedDuration)).toBeLessThan(0.001);
	});

	test('the controls keep their order and places, and "Next" is the only filled button', async ({
		page
	}, testInfo) => {
		skipWithoutJavaScript(testInfo);
		test.skip(testInfo.project.name === 'phone', 'A phone wraps the controls onto two rows.');
		const room = await makeChairedCommittee('Controls GSL MUN');

		await openWithSession(page, room, ['France', 'Ghana']);
		await callSpeaker(page, 'France');
		const footer = floorRegion(page).locator('footer');
		const clockButton = footer.getByRole('button', { name: 'Start' });

		/** The left edges of the five controls and the primary, in the order they stand. */
		async function edges(): Promise<number[]> {
			const controls = [
				footer.locator('button[aria-keyshortcuts="Space"]'),
				footer.getByRole('button', { name: '+15 s' }),
				footer.locator('summary', { hasText: 'Yield' }),
				footer.getByRole('button', { name: 'End speech' }),
				footer.locator('summary', { hasText: 'More' }),
				footer.locator('button[aria-keyshortcuts="N"]')
			];
			const boxes = await Promise.all(controls.map((control) => control.boundingBox()));

			return boxes.map((box) => Math.round(box?.x ?? -1));
		}

		const before = await edges();
		// Left to right, with the primary at the right.
		expect([...before].sort((first, second) => first - second)).toEqual(before);
		const startWidth = (await clockButton.boundingBox())?.width;

		await clockButton.click();
		await expect(footer.getByRole('button', { name: 'Pause' })).toBeVisible();
		expect((await footer.getByRole('button', { name: 'Pause' }).boundingBox())?.width).toBe(
			startWidth
		);
		expect(await edges()).toEqual(before);

		// "End speech" is a plain button; "Next: Ghana" is the one filled button of the view.
		const filled = await page.evaluate(() => {
			const brand900 = 'rgb(11, 42, 91)';
			const pressables = Array.from(document.querySelectorAll('main button, main summary, main a'));

			return pressables
				.filter((element) => getComputedStyle(element).backgroundColor === brand900)
				.map((element) => element.textContent?.trim());
		});
		expect(filled).toEqual([expect.stringMatching(/^Next: Ghana/)]);
	});

	test('"Next" records the speech and gives the next seat the floor, its clock ready', async ({
		page
	}, testInfo) => {
		const room = await makeChairedCommittee('Next GSL MUN');

		await openWithSession(page, room, ['France', 'Ghana', 'Japan']);
		await takeRollCall(room, 'Ghana');
		await page.reload();
		await callSpeaker(page, 'France');

		// Ghana is marked absent, so "Next" names Japan, and Ghana keeps its place.
		await expect(page.getByRole('button', { name: 'Next: Japan' })).toBeVisible();
		await expect(waitingRows(page).first()).toContainText('Ghana');
		await expect(waitingRows(page).first()).toContainText('absent');

		await page.getByRole('button', { name: 'Next: Japan' }).click();
		await expect(floorSpeaker(page, 'Japan')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await expect(floorClock(page)).toHaveText('1:30');
		await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
		await waitUntilAnswered(page);

		const state = await readCommitteeState(room.committeeId);
		expect(state.timer_ends_at).toBeNull();
		expect(state.timer_paused_remaining_seconds).toBe(90);
		const entries = await readEntries(room);
		expect(entries.find((entry) => entry.seat === 'France')).toMatchObject({ status: 'spoken' });
		expect(entries.find((entry) => entry.seat === 'Ghana')).toMatchObject({ status: 'waiting' });

		if (testInfo.project.use.javaScriptEnabled === false) return;

		// Space starts the ready clock, as its button does.
		await page.locator('body').click({ position: { x: 5, y: 5 } });
		await page.keyboard.press('Space');
		await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
	});

	test('"Next" is disabled with nobody waiting, and the empty floor says who spoke last', async ({
		page
	}) => {
		const room = await makeChairedCommittee('Empty Floor GSL MUN');

		await openWithSession(page, room);
		// Nobody on the floor and nobody waiting: no primary at all.
		await expect(floorRegion(page).getByText('Add the first speaker to the list')).toBeVisible();
		await expect(
			floorRegion(page).getByText('Type a delegation in the add box, then press Enter.')
		).toBeVisible();
		await expect(page.getByRole('button', { name: /^(Next|Call)/ })).toHaveCount(0);
		// The add box (or its `<select>` without JavaScript) does not take the focus.
		await expect(page.getByLabel('Add a delegation')).not.toBeFocused();

		await seedWaiting(room, ['France']);
		await page.reload();
		await callSpeaker(page, 'France');

		const next = page.getByRole('button', { name: 'Next', exact: true });
		await expect(next).toBeDisabled();
		await expect(page.getByText('Nobody is waiting')).toBeVisible();

		await seedWaiting(room, ['Ghana']);
		await page.reload();
		await page.getByRole('button', { name: 'End speech' }).click();

		await expect(floorRegion(page).getByText('Nobody has the floor')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(floorRegion(page).getByText(/^France spoke last · \d:\d\d$/)).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(page.getByRole('button', { name: 'Call Ghana' })).toBeVisible();
	});

	test('Yield gives a seat the time left or ends the speech, and ⋯ resets the clock and opens a note', async ({
		page
	}) => {
		const room = await makeChairedCommittee('Yield GSL MUN');

		await openWithSession(page, room, ['France']);
		await callSpeaker(page, 'France');
		await setSpeakerClock(room, { pausedAtSeconds: 40 });
		await page.reload();

		await openFloorMenu(page, 'Yield');
		// The speaker's own seat is not offered.
		await expect(floorRegion(page).getByRole('button', { name: 'France' })).toHaveCount(0);
		await floorRegion(page).getByRole('button', { name: 'Japan' }).click();

		await expect(floorSpeaker(page, 'Japan')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await waitUntilAnswered(page);
		expect(await readSpeakingSeat(room)).toBe('Japan');
		// Japan has the forty seconds France had left, running.
		const yielded = await readCommitteeState(room.committeeId);
		const secondsLeft = (Date.parse(yielded.timer_ends_at ?? '') - Date.now()) / 1000;
		expect(secondsLeft).toBeGreaterThan(30);
		expect(secondsLeft).toBeLessThanOrEqual(40);

		await openFloorMenu(page, 'More');
		await floorRegion(page).getByRole('button', { name: 'Reset clock' }).click();
		await expect(floorClock(page)).toHaveText('1:30', { timeout: DATABASE_TIMEOUT_MS });
		await waitUntilAnswered(page);
		expect((await readCommitteeState(room.committeeId)).timer_paused_remaining_seconds).toBe(90);

		await openFloorMenu(page, 'Yield');
		await floorRegion(page)
			.getByRole('button', { name: /To the chair/ })
			.click();
		await expect(floorRegion(page).getByText('Add the first speaker to the list')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await waitUntilAnswered(page);
		expect(await readSpeakingSeat(room)).toBeNull();
	});

	test('"Note on this speech" opens the Notes page on the speaker’s seat', async ({ page }) => {
		const room = await makeChairedCommittee('Note GSL MUN');

		await openWithSession(page, room, ['Ghana']);
		await callSpeaker(page, 'Ghana');
		await openFloorMenu(page, 'More');
		await floorRegion(page).getByRole('link', { name: 'Note on this speech' }).click();

		await expect(page).toHaveURL(/\/chair\/notes\?seat=/, { timeout: DATABASE_TIMEOUT_MS });
	});

	test('waits for another mode with no clock and no controls, and the list still works', async ({
		page
	}, testInfo) => {
		const room = await makeChairedCommittee('Waiting GSL MUN');

		await openWithSession(page, room, ['France']);
		await updateRoom(room, { mode: 'voting' });
		await page.reload();

		await expect(floorRegion(page).getByText('The GSL resumes when voting ends')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(
			floorRegion(page).getByText('The list can still be added to and reordered.')
		).toBeVisible();
		await expect(floorClock(page)).toHaveCount(0);
		await expect(page.getByRole('button', { name: /^(Next|Call)/ })).toHaveCount(0);

		await addThroughBox(page, testInfo, 'Ghana');
		await openRowMenu(page, 'Ghana');
		await expect(page.getByRole('button', { name: 'Speak now' })).toHaveCount(0);
		await page.getByRole('button', { name: 'Move to top' }).click();
		await expect(waitingRows(page)).toHaveText([/Ghana/, /France/], {
			timeout: DATABASE_TIMEOUT_MS
		});

		await updateRoom(room, { mode: 'unmoderated_caucus' });
		await page.reload();
		await expect(floorRegion(page).getByText('The GSL resumes when the caucus ends')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
	});
});

test.describe('the queue column', () => {
	test('reads "Speakers’ list" and the estimate, with 44px rows, handles, flags and delegates', async ({
		page
	}, testInfo) => {
		const room = await makeChairedCommittee('Rows GSL MUN');
		const delegate = await createTestUser('Kofi Mensah');
		await giveSeat(delegate, room.committeeId, 'Ghana');

		await openWithSession(page, room);
		// Nothing is estimated while nobody waits.
		await expect(queueColumn(page).getByText(/~\d+ min/)).toHaveCount(0);

		await seedWaiting(room, ['France', 'Ghana', 'Japan']);
		await page.reload();
		await expect(queueColumn(page).getByRole('heading', { name: 'Speakers’ list' })).toBeVisible();
		// Three speeches of 1:30 are four and a half minutes.
		await expect(queueColumn(page).getByText('3 · ~5 min')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		const ghana = waitingRows(page).filter({ hasText: 'Ghana' });
		const height = (await ghana.boundingBox())?.height ?? 0;
		const rowHeight = WAITING_ROW_HEIGHT_REM * (await remInPixels(page));
		expect(height).toBeGreaterThanOrEqual(rowHeight - 1);
		expect(height).toBeLessThanOrEqual(rowHeight + 2);
		await expect(ghana.locator('img')).toHaveCount(1);
		await expect(ghana).toContainText('2');

		if (testInfo.project.name === 'phone') {
			// The column is narrower than 360px on a phone, so the delegate is left out.
			await expect(ghana.getByText('Kofi Mensah')).toBeHidden();
		} else {
			await expect(ghana.getByText('Kofi Mensah')).toBeVisible();
		}
	});

	test('"/" puts the cursor in the add box, which lists, filters and marks every seat', async ({
		page
	}, testInfo) => {
		skipWithoutJavaScript(testInfo);
		const room = await makeChairedCommittee('Box GSL MUN');
		await addSeats(room, MORE_SEATS.slice(0, 2));

		await openWithSession(page, room, ['France', 'Ghana']);
		await callSpeaker(page, 'France');
		// The box never takes the focus by itself, once the page has come to life either.
		await waitForAddBox(page);
		await expect(addBox(page)).not.toBeFocused();

		await page.locator('body').click({ position: { x: 5, y: 5 } });
		await page.keyboard.press('/');
		await expect(addBox(page)).toBeFocused();
		await expect(addBox(page)).toHaveAttribute('aria-expanded', 'true');
		const listbox = page.getByRole('listbox');
		await expect(listbox.getByRole('option')).toHaveCount(5);
		await expect(listbox.getByRole('option', { name: /France/ })).toContainText('speaking');
		await expect(listbox.getByRole('option', { name: /Ghana/ })).toContainText('in list');

		await addBox(page).fill('ke');
		await expect(listbox.getByRole('option')).toHaveText([/Kenya/]);
		await addBox(page).fill('gh');
		// Ghana waits already, so Enter adds nobody.
		await addBox(page).press('Enter');
		await expect(waitingRows(page)).toHaveCount(1);

		await addBox(page).fill('xyz');
		await expect(page.getByText('No seat matches “xyz”')).toBeVisible();
	});

	test('typing "fra", Enter, "ger", Enter, "ken", Enter adds three seats in that order', async ({
		page
	}, testInfo) => {
		skipWithoutJavaScript(testInfo);
		const room = await makeChairedCommittee('Three GSL MUN');
		await addSeats(room, MORE_SEATS.slice(0, 2));

		await openWithSession(page, room);
		// "/" is the page's script at work, so it waits for the page to come to life.
		await waitForAddBox(page);
		await page.locator('body').click({ position: { x: 5, y: 5 } });
		await page.keyboard.press('/');
		await expect(addBox(page)).toBeFocused();

		for (const typed of ['fra', 'ger', 'ken']) {
			await addBox(page).pressSequentially(typed);
			await addBox(page).press('Enter');
			await expect(addBox(page)).toHaveValue('');
			await expect(addBox(page)).toBeFocused();
		}

		await expect(waitingRows(page)).toHaveText([/France/, /Germany/, /Kenya/], {
			timeout: DATABASE_TIMEOUT_MS
		});
		await waitUntilAnswered(page);
		expect(await readWaitingOrder(room)).toEqual(['France', 'Germany', 'Kenya']);
	});

	test('an absent seat is offered as "absent · Mark present", which marks it present and adds it', async ({
		page
	}, testInfo) => {
		skipWithoutJavaScript(testInfo);
		const room = await makeChairedCommittee('Late GSL MUN');

		await openWithSession(page, room);
		await takeRollCall(room, 'Japan');
		await page.reload();

		await addBox(page).click();
		await addBox(page).fill('jap');
		await expect(page.getByRole('option', { name: /Japan/ })).toContainText(
			'absent · Mark present'
		);
		await addBox(page).press('Enter');

		await expect(waitingRows(page).filter({ hasText: 'Japan' })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await waitUntilAnswered(page);
		expect(await readWaitingOrder(room)).toEqual(['Japan']);
		expect(await readAttendance(room, 'Japan')).toBe('present');
	});

	test('Escape closes the list and then leaves the box; Space in the empty box starts the clock', async ({
		page
	}, testInfo) => {
		skipWithoutJavaScript(testInfo);
		test.skip(testInfo.project.name !== 'desktop', 'Keys are a laptop’s.');
		const room = await makeChairedCommittee('Escape GSL MUN');

		await openWithSession(page, room, ['France']);
		await callSpeaker(page, 'France');

		await addBox(page).click();
		await expect(addBox(page)).toHaveAttribute('aria-expanded', 'true');
		await page.keyboard.press('Escape');
		await expect(addBox(page)).toHaveAttribute('aria-expanded', 'false');
		await expect(addBox(page)).toBeFocused();
		await page.keyboard.press('Escape');
		await expect(addBox(page)).not.toBeFocused();

		await addBox(page).click();
		await page.keyboard.press('Space');
		await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(addBox(page)).toHaveValue('');
		// A clock paused in its first second still holds its whole length, which
		// reads as not started ("Start"), so it runs below 1:30 first.
		await expect(floorClock(page)).not.toHaveText('1:30', { timeout: DATABASE_TIMEOUT_MS });
		await page.keyboard.press('Space');
		await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(floorRegion(page).getByText('Paused', { exact: true })).toBeVisible();
		await expect(addBox(page)).toHaveValue('');
	});

	test('without JavaScript the add box is a list of the present seats not on the list, and "Add"', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop-no-js', 'This is the page without JavaScript.');
		const room = await makeChairedCommittee('Select GSL MUN');

		await openWithSession(page, room, ['France']);
		await takeRollCall(room, 'Japan');
		await page.reload();

		const select = page.getByLabel('Add a delegation');
		await expect(select.locator('option')).toHaveText(['Ghana']);

		await addThroughBox(page, testInfo, 'Ghana');
		expect(await readWaitingOrder(room)).toEqual(['France', 'Ghana']);
	});

	test('"Speak now" gives a seat the floor at once, its clock ready, ending the speech in progress', async ({
		page
	}) => {
		const room = await makeChairedCommittee('Speak Now GSL MUN');

		await openWithSession(page, room, ['France', 'Ghana', 'Japan']);
		await callSpeaker(page, 'France');

		await openRowMenu(page, 'Japan');
		await page.getByRole('button', { name: 'Speak now' }).click();

		await expect(floorSpeaker(page, 'Japan')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
		await expect(waitingRows(page)).toHaveText([/Ghana/], { timeout: DATABASE_TIMEOUT_MS });
		await waitUntilAnswered(page);
		const entries = await readEntries(room);
		expect(entries.find((entry) => entry.seat === 'France')?.status).toBe('spoken');
		expect(entries.find((entry) => entry.seat === 'Japan')?.status).toBe('speaking');
		expect((await readCommitteeState(room.committeeId)).timer_ends_at).toBeNull();

		// A seat marked absent is not offered "Speak now".
		await takeRollCall(room, 'Ghana');
		await page.reload();
		await openRowMenu(page, 'Ghana');
		await expect(page.getByRole('button', { name: 'Speak now' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Remove' })).toBeVisible();
	});

	test('the row menu greys out the moves a row cannot make', async ({ page }) => {
		const room = await makeChairedCommittee('Menu GSL MUN');

		await openWithSession(page, room, ['France', 'Ghana']);

		await openRowMenu(page, 'France');
		await expect(page.getByRole('button', { name: 'Move up' })).toBeDisabled();
		await expect(page.getByRole('button', { name: 'Move to top' })).toBeDisabled();
		await expect(page.getByRole('button', { name: 'Move down' })).toBeEnabled();
		await page.getByRole('button', { name: 'Move down' }).click();

		await expect(waitingRows(page)).toHaveText([/Ghana/, /France/], {
			timeout: DATABASE_TIMEOUT_MS
		});
	});

	test('"Spoken" reads the speeches latest first on one line and opens to the full list', async ({
		page
	}) => {
		const room = await makeChairedCommittee('Spoken GSL MUN');

		await openWithSession(page, room, ['France', 'Ghana', 'Japan']);
		await callSpeaker(page, 'France');
		await page.getByRole('button', { name: 'Next: Ghana' }).click();
		await expect(floorSpeaker(page, 'Ghana')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await page.getByRole('button', { name: 'Next: Japan' }).click();
		await expect(floorSpeaker(page, 'Japan')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await waitUntilAnswered(page);
		await page.reload();

		const spoken = queueColumn(page).locator('summary', { hasText: 'Spoken 2' });
		await expect(spoken).toContainText(/Ghana \d:\d\d · France \d:\d\d/, {
			timeout: DATABASE_TIMEOUT_MS
		});
		await spoken.click();
		await expect(queueColumn(page).locator('details ol > li')).toHaveText([/Ghana/, /France/]);
	});

	test('the footer changes the speaking time in place and closes and opens the list', async ({
		page
	}, testInfo) => {
		const room = await makeChairedCommittee('Footer GSL MUN');

		await openWithSession(page, room, ['France', 'Ghana', 'Japan']);
		await callSpeaker(page, 'France');
		const footer = queueColumn(page);
		await expect(footer.getByText('1:30 each')).toBeVisible();

		await footer.getByRole('link', { name: 'Change' }).click();
		if (testInfo.project.use.javaScriptEnabled === false) {
			// Without JavaScript "Change" is a link to the page with the field open.
			await expect(page).toHaveURL(/\?time=change$/);
		}
		const field = footer.getByLabel('Speaking time');
		await expect(field).toHaveValue('1:30');
		await field.fill('1:00');
		await field.press('Enter');

		await expect(footer.getByText('1:00 each')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await waitUntilAnswered(page);
		// France's clock carries on at the length it started with.
		expect((await readCommitteeState(room.committeeId)).timer_total_seconds).toBe(90);

		await footer.getByRole('button', { name: 'Close list' }).click();
		await expect(footer.getByText('The list is closed.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(addBox(page)).toHaveCount(0);
		await expect(page.getByLabel('Add a delegation')).toHaveCount(0);

		// A closed list still reorders, removes and calls "Next".
		await openRowMenu(page, 'Japan');
		await page.getByRole('button', { name: 'Move up' }).click();
		await expect(waitingRows(page)).toHaveText([/Japan/, /Ghana/], {
			timeout: DATABASE_TIMEOUT_MS
		});
		await openRowMenu(page, 'Ghana');
		await page.getByRole('button', { name: 'Remove' }).click();
		await expect(waitingRows(page)).toHaveText([/Japan/], { timeout: DATABASE_TIMEOUT_MS });
		await page.getByRole('button', { name: 'Next: Japan' }).click();
		await expect(floorSpeaker(page, 'Japan')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await waitUntilAnswered(page);
		expect((await readCommitteeState(room.committeeId)).timer_total_seconds).toBe(60);

		await footer.getByRole('button', { name: 'Open list' }).click();
		await expect(footer.getByText('The list is closed.')).toHaveCount(0, {
			timeout: DATABASE_TIMEOUT_MS
		});
	});
});

test.describe('sizes', () => {
	test('at 1280 × 800 fifteen waiting seats scroll inside the column, whose foot stays in sight', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop', 'One laptop-sized project is enough.');
		const room = await makeChairedCommittee('Long GSL MUN');
		await addSeats(room, MORE_SEATS);

		await openWithSession(page, room, ALL_SEATS);
		await expect(waitingRows(page)).toHaveCount(15, { timeout: DATABASE_TIMEOUT_MS });

		const shape = await page.evaluate(() => {
			const main = document.querySelector('main');
			const list = document.querySelector('ol[aria-label="Waiting to speak"]');

			return {
				page: document.documentElement.scrollHeight - window.innerHeight,
				main: main ? main.scrollHeight - main.clientHeight : 0,
				list: list ? list.scrollHeight - list.clientHeight : 0
			};
		});
		expect(shape.page).toBeLessThanOrEqual(0);
		expect(shape.main).toBeLessThanOrEqual(1);
		expect(shape.list).toBeGreaterThan(0);
		await expect(queueColumn(page).getByText('1:30 each')).toBeInViewport();
		await saveFullPageScreenshot(page, 'chair-gsl');
	});

	test('at 1024 × 768 both columns stay and the clock is smaller; at 768 the column goes under', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop', 'One project can change its window.');
		const room = await makeChairedCommittee('Narrow GSL MUN');

		await openWithSession(page, room, ['France', 'Ghana']);
		await callSpeaker(page, 'France');
		const wideClock = await floorClock(page).evaluate((element) =>
			parseFloat(getComputedStyle(element).fontSize)
		);

		await page.setViewportSize({ width: 1024, height: 768 });
		const floorBox = await floorRegion(page).boundingBox();
		const queueBox = await queueColumn(page).boundingBox();
		expect(queueBox?.x ?? 0).toBeGreaterThanOrEqual(
			(floorBox?.x ?? 0) + (floorBox?.width ?? 0) - 1
		);
		expect(queueBox?.width ?? 0).toBeGreaterThanOrEqual(320);
		const narrowClock = await floorClock(page).evaluate((element) =>
			parseFloat(getComputedStyle(element).fontSize)
		);
		expect(narrowClock).toBeLessThan(wideClock);

		await page.setViewportSize({ width: 768, height: 1024 });
		const stackedFloor = await floorRegion(page).boundingBox();
		const stackedQueue = await queueColumn(page).boundingBox();
		expect(stackedQueue?.y ?? 0).toBeGreaterThanOrEqual(
			(stackedFloor?.y ?? 0) + (stackedFloor?.height ?? 0) - 1
		);
	});

	test('on a 390 phone the controls stick to the bottom, "Next" is full width, and nothing spills', async ({
		page
	}, testInfo) => {
		test.skip(
			testInfo.project.name !== 'phone',
			'Only the phone project has a phone-sized window.'
		);
		const room = await makeChairedCommittee('Phone GSL International MUN');

		await openWithSession(page, room, ['France', 'Ghana', 'Japan']);
		await callSpeaker(page, 'France');

		const footer = floorRegion(page).locator('footer');
		expect(await footer.evaluate((element) => getComputedStyle(element).position)).toBe('sticky');
		const next = page.getByRole('button', { name: 'Next: Ghana' });
		expect((await next.boundingBox())?.width ?? 0).toBeGreaterThan(390 - 40);
		// The queue column comes between the bar and the controls.
		const queueBox = await queueColumn(page).boundingBox();
		const clockBox = await floorClock(page).boundingBox();
		expect(queueBox?.y ?? 0).toBeGreaterThan(clockBox?.y ?? 0);

		const targets = [
			footer.getByRole('button', { name: 'Start' }),
			footer.getByRole('button', { name: '+15 s' }),
			footer.locator('summary', { hasText: 'Yield' }),
			footer.getByRole('button', { name: 'End speech' }),
			footer.locator('summary', { hasText: 'More' }),
			next,
			waitingRows(page).first().locator('summary'),
			page.getByRole('button', { name: 'Reorder Ghana' })
		];
		for (const target of targets) {
			const box = await target.boundingBox();
			expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
		}

		await saveFullPageScreenshot(page, 'chair-gsl');
		await expectNoSidewaysOverflow(page);
	});
});

test.describe('click budgets', () => {
	test('calling the next speaker takes one click and no page, from the view and with N', async ({
		page
	}, testInfo) => {
		skipWithoutJavaScript(testInfo);
		const room = await makeChairedCommittee('Next Budget GSL MUN');

		await openWithSession(page, room, ['France', 'Ghana', 'Japan']);
		await callSpeaker(page, 'France');

		const journey = ClickBudgetJourney.fromPage(page);
		await journey.click(page.getByRole('button', { name: 'Next: Ghana' }));
		await expect(floorSpeaker(page, 'Ghana')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		// The one page counted is the GSL view the journey starts on; the budget counts no new one.
		journey.expectWithinBudget({ clicks: 1, pages: 1, typedFields: 0, decisions: 0 });
		await waitUntilAnswered(page);

		if (testInfo.project.name !== 'desktop') return;

		// N presses the same button.
		await page.locator('body').click({ position: { x: 5, y: 5 } });
		await page.keyboard.press('n');
		await expect(floorSpeaker(page, 'Japan')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		expect(new URL(page.url()).pathname).toBe(gslPath(room));
	});

	test('calling the next speaker from another chair view takes one click in the live strip', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop', 'The live strip’s whole line is a laptop’s.');
		const room = await makeChairedCommittee('Strip Budget GSL MUN');

		await openWithSession(page, room, ['France', 'Ghana']);
		await callSpeaker(page, 'France');
		await page.goto(`${room.roomPath}/motions`);

		const strip = page.getByRole('button', { name: /^Next: Ghana/ });
		await expect(strip).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		const journey = ClickBudgetJourney.fromPage(page);
		await journey.click(strip);

		await expect.poll(() => readSpeakingSeat(room), { timeout: DATABASE_TIMEOUT_MS }).toBe('Ghana');
		journey.expectWithinBudget({ clicks: 1, pages: 1, typedFields: 0, decisions: 0 });
		expect(new URL(page.url()).pathname).toBe(`${room.roomPath}/motions`);
	});

	test('adding three speakers takes no click and no page: "/", then three names with Enter', async ({
		page
	}, testInfo) => {
		skipWithoutJavaScript(testInfo);
		test.skip(testInfo.project.name !== 'desktop', '"/" is a laptop’s key.');
		const room = await makeChairedCommittee('Add Budget GSL MUN');
		await addSeats(room, MORE_SEATS.slice(0, 2));

		await openWithSession(page, room);
		// "/" is the page's script at work, so it waits for the page to come to life.
		await waitForAddBox(page);
		const journey = ClickBudgetJourney.fromPage(page);
		await page.keyboard.press('/');
		// The key put the cursor in the box: no click was needed.
		await expect(addBox(page)).toBeFocused();

		for (const typed of ['fra', 'ger', 'ken']) {
			await journey.type(addBox(page), typed);
			// Enter adds the seat and keeps the cursor in the box for the next name,
			// so gsl.md's budget counts it with the typing, not as a click.
			await addBox(page).press('Enter');
		}

		await expect(waitingRows(page)).toHaveText([/France/, /Germany/, /Kenya/], {
			timeout: DATABASE_TIMEOUT_MS
		});
		journey.expectWithinBudget({ clicks: 0, pages: 1, typedFields: 3, decisions: 0 });
		await waitUntilAnswered(page);
		expect(await readWaitingOrder(room)).toEqual(['France', 'Germany', 'Kenya']);
	});
});
