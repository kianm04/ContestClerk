import { expect, test, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	DATABASE_TIMEOUT_MS,
	makeChairedCommittee,
	readCommitteeState,
	waitUntilAnswered,
	type ChairedCommittee
} from './chair-room-fixtures';
import {
	floorSpeaker,
	gslPath,
	readWaitingOrder,
	seedWaiting,
	setSpeakerClock,
	startSessionDirectly,
	waitingRows
} from './gsl-fixtures';
import { skipWithoutJavaScript } from './in-place';
import {
	expectLandedOn,
	modeFloor,
	openView,
	openVoteDirectly,
	postFromPage,
	proposeMotionDirectly,
	readMotions,
	seatIdsByName,
	speakerClock,
	spokenLine,
	startModDirectly,
	viewPath,
	waitForPageScript
} from './mode-fixtures';
import { expectNoSidewaysOverflow, saveFullPageScreenshot } from './page-shape';
import { SCHEDULE_TIMEZONE } from './schedule-fixtures';
import { signIn } from './signed-in-user';

// The acceptance criteria of `specs/05-pages/chair/unmod.md` tagged (S8) that
// need a real browser: the start form, the running caucus with its one clock
// and "back at", "After the caucus", ending it, the keys, the sizes and the
// fallbacks without JavaScript. The journey the Room page's own test once
// walked (start an Unmod, its clock runs, "End caucus" returns the room to the
// GSL with its waiting speakers where they were) runs on all three projects.

/** The Unmod view's floor, named by its title. */
function unmodFloor(page: Page) {
	return modeFloor(page, /^Unmoderated caucus/);
}

/** "After the caucus", the General Speakers' List beside the running caucus. */
function afterTheCaucus(page: Page) {
	return page.getByRole('complementary', { name: 'After the caucus' });
}

/**
 * Add a seat to "After the caucus": with JavaScript by typing it into the add
 * box and pressing Enter, without it by choosing it in the `<select>` and "Add".
 */
async function addAfterTheCaucus(page: Page, isScripted: boolean, seatName: string): Promise<void> {
	const column = afterTheCaucus(page);

	if (isScripted) {
		const box = column.getByRole('combobox', { name: 'Add a delegation' });
		await box.click();
		await box.fill(seatName);
		await box.press('Enter');
	} else {
		await column.getByLabel('Add a delegation').selectOption({ label: seatName });
		await column.getByRole('button', { name: 'Add', exact: true }).click();
	}

	await expect(waitingRows(page).filter({ hasText: seatName })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(page);
}

/** Start a session with `waiting` on the GSL, sign the chair in and open the Unmod view. */
async function openUnmod(
	page: Page,
	room: ChairedCommittee,
	waiting: string[] = []
): Promise<void> {
	await startSessionDirectly(room);
	if (waiting.length > 0) await seedWaiting(room, waiting);
	await signIn(page, room.chair);
	await openView(page, viewPath(room, 'unmod'));
	await expect(page.getByRole('heading', { name: 'Start an unmoderated caucus' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
}

/** Press "Start caucus" and wait for the running caucus. */
async function startCaucus(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Start caucus' }).click();
	await expect(unmodFloor(page)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await waitUntilAnswered(page);
}

/** "14:32", the time of `moment` in the conference's time zone. */
function wallClock(moment: string): string {
	return new Intl.DateTimeFormat('en-GB', {
		timeZone: SCHEDULE_TIMEZONE,
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	}).format(new Date(moment));
}

/** Set the caucus's one clock straight in the database. */
async function setUnmodClock(
	room: ChairedCommittee,
	clock: { runsForSeconds: number } | { pausedAtSeconds: number }
): Promise<void> {
	const admin = createServiceRoleClient();
	const columns =
		'pausedAtSeconds' in clock
			? { timer_ends_at: null, timer_paused_remaining_seconds: clock.pausedAtSeconds }
			: {
					timer_ends_at: new Date(Date.now() + clock.runsForSeconds * 1000).toISOString(),
					timer_paused_remaining_seconds: null
				};
	const { error } = await admin
		.from('committee_state')
		.update({ timer_total_seconds: 600, ...columns })
		.eq('committee_id', room.committeeId);

	if (error) throw new Error(`Could not set the clock: ${error.message}`);
}

test.describe('the start form', () => {
	test('offers 5 to 20 minutes with 10 chosen, "other", an optional topic and who raised it', async ({
		page
	}) => {
		const room = await makeChairedCommittee('Unmod Form MUN');

		await openUnmod(page, room);

		// Named exactly, or "5 min" would match "15 min" as well.
		for (const minutes of ['5', '15', '20']) {
			const radio = page.getByRole('radio', { name: `${minutes} min`, exact: true });
			await expect(radio).not.toBeChecked();
		}
		await expect(page.getByRole('radio', { name: '10 min', exact: true })).toBeChecked();
		await expect(page.getByRole('textbox', { name: 'Other length' })).toHaveAttribute(
			'placeholder',
			'other'
		);
		await expect(page.getByLabel('Topic')).toBeVisible();
		await expect(page.getByText('optional')).toHaveCount(2);
		// The mode bar has a "Motions" too; this is the form's own link. The
		// server writes links relative, so only the end of the address is checked.
		await expect(
			page.getByRole('main').getByRole('link', { name: 'Motions', exact: true })
		).toHaveAttribute('href', new RegExp(`${room.roomPath}/motions$`));
		const filled = page.locator('main button:is(.bg-primary, .bg-brand-900)');
		await expect(filled).toHaveCount(1);
		await expect(filled).toHaveText('Start caucus');
	});

	test('"Start caucus" records a passed caucus started without a vote and starts its clock at once', async ({
		page
	}, testInfo) => {
		const room = await makeChairedCommittee('Unmod Start MUN');
		const isScripted = testInfo.project.use.javaScriptEnabled !== false;

		await openUnmod(page, room);
		const onTheFloor = await proposeMotionDirectly(room);
		// The radio buttons are drawn as their labels; a press lands on the label.
		await page.locator('label', { hasText: '15 min' }).click();
		await expect(page.getByRole('radio', { name: '15 min', exact: true })).toBeChecked();
		await page.getByRole('textbox', { name: 'Other length' }).fill('12');
		await page.getByLabel('Topic').fill('Drafting the working paper');
		if (isScripted) {
			const box = page.getByRole('combobox', { name: 'Raised by' });
			await box.click();
			await box.fill('Japan');
			await box.press('Enter');
		} else {
			await page.getByLabel('Raised by').selectOption({ label: 'Japan' });
		}
		await startCaucus(page);

		await expect(page.getByText('raised by Japan · started without a vote')).toBeVisible();
		const seats = await seatIdsByName(room);
		// The motion on the floor is an unmoderated caucus too, still to be voted on.
		const caucus = (await readMotions(room)).find(
			(motion) => motion.kind === 'unmoderated_caucus' && motion.id !== onTheFloor
		);
		expect(caucus).toMatchObject({
			status: 'passed',
			topic: 'Drafting the working paper',
			// The typed length wins over the preset.
			total_time_seconds: 720,
			proposed_by_seat_id: seats.Japan,
			started_without_vote: true
		});
		const others = (await readMotions(room)).filter((motion) => motion.id === onTheFloor);
		expect(others[0].status).toBe('proposed');
		const state = await readCommitteeState(room.committeeId);
		expect(state.mode).toBe('unmoderated_caucus');
		expect(state.timer_ends_at).not.toBeNull();
	});

	test('refuses a length outside 1 to 60 minutes, keeping what was typed', async ({ page }) => {
		const room = await makeChairedCommittee('Unmod Refused MUN');

		await openUnmod(page, room);
		await page.getByRole('textbox', { name: 'Other length' }).fill('90');
		await page.getByRole('button', { name: 'Start caucus' }).click();

		await expect(page.getByText('Total time must be between 1 and 60 minutes.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(page.getByRole('textbox', { name: 'Other length' })).toHaveValue('90');
		expect((await readCommitteeState(room.committeeId)).mode).toBe('formal_debate');
	});

	test('starting ends a GSL speech in progress, recording its time, the waiting keeping their places', async ({
		page
	}) => {
		const room = await makeChairedCommittee('Unmod Ends Speech MUN');

		await openUnmod(page, room, ['France', 'Ghana', 'Japan']);
		await openView(page, gslPath(room));
		await page.getByRole('button', { name: 'Call France' }).click();
		await expect(floorSpeaker(page, 'France')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await waitUntilAnswered(page);
		await setSpeakerClock(room, { pausedAtSeconds: 50 });

		await openView(page, viewPath(room, 'unmod'));
		await startCaucus(page);

		await expect(spokenLine(afterTheCaucus(page))).toContainText('France 0:40');
		expect(await readWaitingOrder(room)).toEqual(['Ghana', 'Japan']);
	});

	test('while a moderated caucus is live the form says so and replaces it; an open vote blocks it', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop', 'One project is enough for these sentences.');
		const room = await makeChairedCommittee('Unmod Replaces MUN');

		await openUnmod(page, room);
		await startModDirectly(room, {
			topic: 'Corridors',
			totalSeconds: 600,
			speakingSeconds: 60,
			caucusClock: { pausedAtSeconds: 600 }
		});
		await page.reload();
		await waitForPageScript(page);
		await expect(page.getByText('Starting this ends the moderated caucus.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await startCaucus(page);
		expect((await readCommitteeState(room.committeeId)).caucus_total_seconds).toBeNull();

		await page.getByRole('button', { name: 'End caucus' }).click();
		await expectLandedOn(page, room.roomPath);
		await waitUntilAnswered(page);
		await openVoteDirectly(room);
		await page.goto(viewPath(room, 'unmod'));
		await expect(page.getByRole('button', { name: 'Start caucus' })).toBeDisabled({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(page.getByText('Close the open vote first.')).toBeVisible();
		const answer = await postFromPage(page, `${viewPath(room, 'unmod')}?/startUnmoderated`, {
			length: '10:00'
		});
		expect(answer).toContain('Close the open vote first.');
	});
});

test.describe('the running caucus', () => {
	test('starts, runs, and "End caucus" returns the room to the GSL with its waiting speakers in place', async ({
		page
	}) => {
		const room = await makeChairedCommittee('Unmod Journey MUN');

		await openUnmod(page, room, ['France', 'Ghana']);
		await startCaucus(page);

		await expect(speakerClock(page)).toHaveText(/^(10:00|9:5\d)$/);
		const state = await readCommitteeState(room.committeeId);
		expect(state.timer_total_seconds).toBe(600);
		expect(state.timer_ends_at).not.toBeNull();
		const end = page.getByRole('button', { name: 'End caucus' });
		await expect(end).toHaveClass(/(^|\s)(bg-primary|bg-brand-900)(\s|$)/);
		await expect(page.locator('main button:is(.bg-primary, .bg-brand-900)')).toHaveCount(1);

		await end.click();
		await expectLandedOn(page, room.roomPath);
		await expect(page.getByRole('heading', { name: /General Speakers’ List/ })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await waitUntilAnswered(page);
		const after = await readCommitteeState(room.committeeId);
		expect(after).toMatchObject({
			mode: 'formal_debate',
			current_motion_id: null,
			timer_total_seconds: null,
			timer_ends_at: null
		});
		expect(await readWaitingOrder(room)).toEqual(['France', 'Ghana']);
		await expect(waitingRows(page).first()).toContainText('France');
	});

	test('shows one centred clock larger than the GSL’s, "back at" in the conference’s time zone, and the bar', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop', 'One laptop-sized project is enough.');
		const room = await makeChairedCommittee('Unmod Clock MUN');

		await openUnmod(page, room);
		await startCaucus(page);

		const endsAt = (await readCommitteeState(room.committeeId)).timer_ends_at ?? '';
		await expect(page.getByText(`back at ${wallClock(endsAt)}`, { exact: true })).toBeVisible();
		const clock = speakerClock(page);
		const fontSize = await clock.evaluate((element) =>
			parseFloat(getComputedStyle(element).fontSize)
		);
		expect(fontSize).toBeGreaterThan(168);
		const clockBox = await clock.boundingBox();
		const floorBox = await unmodFloor(page).boundingBox();
		const clockMiddle = (clockBox?.x ?? 0) + (clockBox?.width ?? 0) / 2;
		const floorMiddle = (floorBox?.x ?? 0) + (floorBox?.width ?? 0) / 2;
		expect(Math.abs(clockMiddle - floorMiddle)).toBeLessThan(24);

		await page.getByRole('button', { name: 'Pause' }).click();
		await expect(page.getByText(/^Paused · back at \d\d:\d\d$/)).toBeVisible();
		await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
	});

	test('"+1 min" and + add a minute and record nothing; Space pauses and resumes', async ({
		page
	}, testInfo) => {
		skipWithoutJavaScript(testInfo);
		test.skip(testInfo.project.name !== 'desktop', 'Keys are a laptop’s.');
		const room = await makeChairedCommittee('Unmod Minute MUN');

		await openUnmod(page, room, ['France']);
		await startCaucus(page);
		await page.getByRole('button', { name: 'Pause' }).click();
		await waitUntilAnswered(page);
		const paused = (await readCommitteeState(room.committeeId)).timer_paused_remaining_seconds ?? 0;

		await page.getByRole('button', { name: '+1 min' }).click();
		await waitUntilAnswered(page);
		expect((await readCommitteeState(room.committeeId)).timer_paused_remaining_seconds).toBe(
			paused + 60
		);

		await page.locator('body').click({ position: { x: 5, y: 5 } });
		await page.keyboard.press('+');
		await waitUntilAnswered(page);
		expect((await readCommitteeState(room.committeeId)).timer_paused_remaining_seconds).toBe(
			paused + 120
		);
		await page.keyboard.press(' ');
		await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
		await waitUntilAnswered(page);
		expect((await readCommitteeState(room.committeeId)).timer_ends_at).not.toBeNull();

		// N and E do nothing here: nobody has the floor in an unmoderated caucus.
		await page.keyboard.press('n');
		await page.keyboard.press('e');
		await waitUntilAnswered(page);
		expect((await readCommitteeState(room.committeeId)).mode).toBe('unmoderated_caucus');
		await page.keyboard.press('/');
		await expect(page.getByRole('combobox', { name: 'Add a delegation' })).toBeFocused();
		expect((await readMotions(room)).map((motion) => motion.kind)).toEqual(['unmoderated_caucus']);
	});

	test('at zero the clock counts up in danger colour, and the caucus does not end by itself', async ({
		page
	}) => {
		const room = await makeChairedCommittee('Unmod Over MUN');

		await openUnmod(page, room);
		await startCaucus(page);
		await setUnmodClock(room, { runsForSeconds: -7 });
		await page.reload();

		await expect(speakerClock(page)).toHaveText(/^\+0:(0[7-9]|1\d)$/, {
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(speakerClock(page)).toHaveClass(/text-danger-700/);
		expect((await readCommitteeState(room.committeeId)).mode).toBe('unmoderated_caucus');
	});

	test('a seat added to "After the caucus" is in that place on the GSL once the caucus ends', async ({
		page
	}, testInfo) => {
		const room = await makeChairedCommittee('Unmod After MUN');

		await openUnmod(page, room, ['France']);
		await startCaucus(page);
		await addAfterTheCaucus(page, testInfo.project.use.javaScriptEnabled !== false, 'Japan');
		await expect(
			afterTheCaucus(page).getByRole('list', { name: 'Waiting to speak' })
		).toContainText('Japan');

		await page.getByRole('button', { name: 'End caucus' }).click();
		await expectLandedOn(page, room.roomPath);
		await waitUntilAnswered(page);
		expect(await readWaitingOrder(room)).toEqual(['France', 'Japan']);
	});
});

test.describe('sizes', () => {
	test('at 1280 × 800 the clock, "back at", the bar, the controls and the list fit', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop', 'One laptop-sized project is enough.');
		const room = await makeChairedCommittee('Unmod Fits MUN');

		await openUnmod(page, room, ['France', 'Ghana', 'Japan']);
		await startCaucus(page);

		const overflow = await page.evaluate(() => {
			const main = document.querySelector('main');

			return main ? main.scrollHeight - main.clientHeight : 0;
		});
		expect(overflow).toBeLessThanOrEqual(1);
		await expect(page.getByRole('button', { name: 'End caucus' })).toBeInViewport();
		await saveFullPageScreenshot(page, 'chair-unmod');

		const wide = await speakerClock(page).evaluate((element) =>
			parseFloat(getComputedStyle(element).fontSize)
		);
		await page.setViewportSize({ width: 1024, height: 768 });
		expect((await afterTheCaucus(page).boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(320);
		const narrow = await speakerClock(page).evaluate((element) =>
			parseFloat(getComputedStyle(element).fontSize)
		);
		expect(narrow).toBeLessThan(wide);
		await expectNoSidewaysOverflow(page);
	});

	test('on a 390 phone the view is one column with "End caucus" full width above the mode bar', async ({
		page
	}, testInfo) => {
		test.skip(
			testInfo.project.name !== 'phone',
			'Only the phone project has a phone-sized window.'
		);
		const room = await makeChairedCommittee('Unmod Phone MUN');

		await openUnmod(page, room, ['France']);
		await startCaucus(page);

		const footer = unmodFloor(page).locator('footer');
		expect(await footer.evaluate((element) => getComputedStyle(element).position)).toBe('sticky');
		const end = page.getByRole('button', { name: 'End caucus' });
		expect((await end.boundingBox())?.width ?? 0).toBeGreaterThan(390 - 40);
		const clockBox = await speakerClock(page).boundingBox();
		const listBox = await afterTheCaucus(page).boundingBox();
		expect(listBox?.y ?? 0).toBeGreaterThan(clockBox?.y ?? 0);
		for (const target of [
			footer.getByRole('button', { name: 'Pause' }),
			footer.getByRole('button', { name: '+1 min' }),
			end
		]) {
			expect((await target.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
		}
		await saveFullPageScreenshot(page, 'chair-unmod');
		await expectNoSidewaysOverflow(page);
	});
});

test.describe('without JavaScript', () => {
	test('the clock buttons and "+1 min" post and reload', async ({ page }, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop-no-js', 'This is the fallback’s own test.');
		const room = await makeChairedCommittee('Unmod No Script MUN');

		await openUnmod(page, room);
		await startCaucus(page);
		await page.getByRole('button', { name: 'Pause' }).click();
		await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		const paused = (await readCommitteeState(room.committeeId)).timer_paused_remaining_seconds ?? 0;

		await page.getByRole('button', { name: '+1 min' }).click();
		await expect
			.poll(
				async () => (await readCommitteeState(room.committeeId)).timer_paused_remaining_seconds,
				{
					timeout: DATABASE_TIMEOUT_MS
				}
			)
			.toBe(paused + 60);
		await page.getByRole('button', { name: 'Resume' }).click();
		await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
	});
});
