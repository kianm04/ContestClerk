import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
	DATABASE_TIMEOUT_MS,
	endSessionFromFrame,
	makeChairedCommittee,
	markAllPresent,
	modeBar,
	openCommitteeMenu,
	openRoom,
	readCommitteeState,
	startSession,
	waitForConsoleScript,
	waitUntilAnswered
} from './chair-room-fixtures';
import { giveTopics, proposeCaucus } from './committee-live-fixtures';
import { addThroughBox, callSpeaker, floorRegion, floorSpeaker } from './gsl-fixtures';
import { expectLandedOn, expectRunningView } from './mode-fixtures';
import { expectNoSidewaysOverflow } from './page-shape';
import { signIn } from './signed-in-user';

// The integration of the session console (`specs/05-pages/chair/committee-room.md`,
// "What `chair` draws in the opening and in debate"): the live room, `chair`,
// draws whatever the room is doing, each view from the same component and the
// same readers as the view's own route, and takes every view's actions, so a
// chair on `chair` runs a whole session there: the GSL, a caucus and "End
// caucus", a vote and "End voting", Suspend and Resume, and the end. A motion
// is decided in Motions, and its "Pass" lands the chair back on `chair`. Runs
// on desktop, desktop-no-js and phone.

/** Whether the test runs without JavaScript. */
function hasNoScript(testInfo: TestInfo): boolean {
	return testInfo.project.use.javaScriptEnabled === false;
}

/** The view inside the console's `<main>`. */
function view(page: Page) {
	return page.locator('#main');
}

/** Exactly one `<h1>` on the page, with these words: the top bar's committee or the screen's own title. */
async function expectOneHeading(page: Page, name: string | RegExp): Promise<void> {
	await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
	await expect(page.getByRole('heading', { level: 1, name })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
}

/** Pick a seat in a combobox with JavaScript, or in its `<select>` without, and press `button`. */
async function pickSeat(
	page: Page,
	testInfo: TestInfo,
	field: { label: string; seat: string; button: string | null }
): Promise<void> {
	if (hasNoScript(testInfo)) {
		await page.getByLabel(field.label).selectOption({ label: field.seat });
		if (field.button !== null) {
			await page.getByRole('button', { name: field.button, exact: true }).click();
		}
		return;
	}

	// The page swaps the `<select>` for the combobox once its script runs; wait for that.
	const box = page.getByRole('combobox', { name: field.label }).and(page.locator('input'));
	await expect(box).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await box.click();
	await box.fill(field.seat);
	await box.press('Enter');
}

/** Go to Motions through the mode bar, the way a chair does. */
async function openMotions(page: Page, roomPath: string): Promise<void> {
	await modeBar(page)
		.getByRole('link', { name: /^Motions\b/ })
		.click();
	await expectLandedOn(page, `${roomPath}/motions`);
	await expect(page.getByRole('heading', { name: /^Next to vote/ })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
}

/** Pass the motion "Next to vote" in Motions, two for and none against. */
async function passNextMotion(page: Page): Promise<void> {
	const next = page.getByRole('region', { name: /^Next to vote/ });

	await next.getByLabel('For', { exact: true }).fill('2');
	await next.getByLabel('Against', { exact: true }).fill('0');
	await next.getByRole('button', { name: 'Pass', exact: true }).click();
}

/** Press Suspend: in the mode bar, or on a phone in the committee menu. */
async function pressSuspend(page: Page): Promise<void> {
	const suspendInBar = modeBar(page).getByRole('button', { name: 'Suspend' });

	if (await suspendInBar.isVisible()) {
		await suspendInBar.click();
		return;
	}

	const menu = await openCommitteeMenu(page);
	await menu.getByRole('button', { name: 'Suspend' }).click();
}

test('a whole session runs on the live room, each view drawn there and every press landing back on it', async ({
	page
}, testInfo) => {
	test.setTimeout(180_000);
	const room = await makeChairedCommittee('Live Room MUN');
	await giveTopics(room, ['Climate finance', 'Protection of civilians']);

	await signIn(page, room.chair);
	await openRoom(page, room.roomPath);
	// The lobby's own title is the page's one heading, not the committee too.
	await expectOneHeading(page, 'Security Council');

	// The opening: the GSL view with the band above it, all on `chair`.
	await startSession(page);
	await expect(page.getByRole('heading', { name: 'Before debate' })).toBeVisible();
	await expectOneHeading(page, /^UNSC/);
	// The add box is a `<select>` until the page's script runs, and a combobox after.
	if (!hasNoScript(testInfo)) await waitForConsoleScript(page);
	await markAllPresent(page);
	await view(page).getByRole('button', { name: 'Climate finance', exact: true }).click();
	await expect(page.getByRole('banner').getByTitle('Climate finance')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(page);
	await addThroughBox(page, testInfo, 'France');
	await addThroughBox(page, testInfo, 'Ghana');
	await callSpeaker(page, 'France');
	await expect(page.getByRole('heading', { name: 'Before debate' })).toHaveCount(0);
	await expectLandedOn(page, room.roomPath);

	// A moderated caucus passed in Motions lands the chair on `chair`, which
	// draws the Mod view; its own actions answer there.
	await proposeCaucus(room, 'Ghana');
	await openMotions(page, room.roomPath);
	await passNextMotion(page);
	await expectLandedOn(page, room.roomPath);
	await expectRunningView(page, /^Moderated caucus/);
	await pickSeat(page, testInfo, {
		label: 'Recognise a delegation',
		seat: 'Japan',
		button: 'Recognise'
	});
	await expect(view(page).getByText('Japan', { exact: true }).first()).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(page);
	await expectLandedOn(page, room.roomPath);
	await view(page).getByRole('button', { name: 'End caucus' }).click();
	await expect(floorRegion(page)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await waitUntilAnswered(page);
	await expectLandedOn(page, room.roomPath);
	expect(await readCommitteeState(room.committeeId)).toMatchObject({
		mode: 'formal_debate',
		current_motion_id: null
	});

	// "Close debate" passed in Motions lands on `chair`'s vote set-up, the
	// cursor in "On" with JavaScript, and the vote runs there to its end.
	await openMotions(page, room.roomPath);
	const composer = page.getByRole('form', { name: 'Record a motion' });
	const closeDebate = page.getByRole('radio', { name: 'Close debate', exact: true });
	await composer.locator('label').filter({ has: closeDebate }).click();
	if (hasNoScript(testInfo)) {
		await composer.getByLabel('Raised by').selectOption({ label: 'Ghana' });
	} else {
		await composer.getByRole('combobox', { name: 'Raised by' }).fill('Ghana');
		await composer.getByRole('combobox', { name: 'Raised by' }).press('Enter');
	}
	await composer.getByRole('button', { name: 'Add to floor' }).click();
	await expect(page.getByRole('region', { name: /^Next to vote/ })).toContainText('Close debate', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(page);
	await passNextMotion(page);
	await expectLandedOn(page, room.roomPath);
	await expect(view(page).getByRole('heading', { name: 'Open a vote' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	if (!hasNoScript(testInfo)) await expect(page.getByLabel('On', { exact: true })).toBeFocused();

	await page.getByLabel('On', { exact: true }).fill('Draft Resolution 1.1');
	await view(page).getByRole('button', { name: 'Open vote' }).click();
	await expect(view(page).getByRole('heading', { name: /^Draft Resolution 1\.1/ })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await page.getByLabel('For', { exact: true }).fill('2');
	await page.getByLabel('Against', { exact: true }).fill('1');
	await waitUntilAnswered(page);
	await view(page)
		.getByRole('button', { name: /^Close vote/ })
		.click();
	await expect(view(page).getByText('Draft Resolution 1.1 passes')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expectLandedOn(page, room.roomPath);
	await view(page).getByRole('button', { name: 'End voting' }).click();
	await expect(floorRegion(page)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(floorSpeaker(page, 'France')).toHaveCount(0);
	await waitUntilAnswered(page);
	await expectLandedOn(page, room.roomPath);

	// Suspend and Resume, then the end, without leaving `chair`.
	await pressSuspend(page);
	await expectOneHeading(page, /^Suspended/);
	await expectNoSidewaysOverflow(page);
	await view(page).getByRole('button', { name: 'Resume session' }).click();
	await expect(floorRegion(page)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await waitUntilAnswered(page);
	await expectLandedOn(page, room.roomPath);

	await endSessionFromFrame(page);
	await expectOneHeading(page, 'Session 1 has ended');
	await expectLandedOn(page, room.roomPath);
	expect(await readCommitteeState(room.committeeId)).toMatchObject({
		mode: 'idle',
		current_session_id: null
	});
});

test('an unmoderated caucus and a single speaker run on the live room and end there', async ({
	page
}, testInfo) => {
	test.setTimeout(120_000);
	const room = await makeChairedCommittee('Live Room Modes MUN');

	await signIn(page, room.chair);
	await openRoom(page, room.roomPath);
	await startSession(page);
	await markAllPresent(page);

	// Started on its own route, the caucus is drawn on `chair`, whose "+1 min"
	// and "End caucus" answer there.
	await page.goto(`${room.roomPath}/unmod`);
	await page.getByRole('textbox', { name: 'Other length' }).fill('12');
	await page.getByRole('button', { name: 'Start caucus' }).click();
	await expect(page.getByRole('button', { name: 'End caucus' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(page);
	await openRoom(page, room.roomPath);
	await view(page).getByRole('button', { name: '+1 min' }).click();
	await waitUntilAnswered(page);
	await expectLandedOn(page, room.roomPath);
	// Twelve minutes, and the one added: more than twelve are left however long the test took.
	const endsAt = (await readCommitteeState(room.committeeId)).timer_ends_at;
	expect(new Date(endsAt ?? 0).getTime() - Date.now()).toBeGreaterThan(12 * 60_000);
	await view(page).getByRole('button', { name: 'End caucus' }).click();
	await expect(floorRegion(page)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await waitUntilAnswered(page);
	await expectLandedOn(page, room.roomPath);

	// A single speaker given the floor on its own route is drawn on `chair`,
	// and "Return to GSL" there puts the General Speakers' List back.
	await page.goto(`${room.roomPath}/single`);
	await pickSeat(page, testInfo, { label: 'Who', seat: 'Ghana', button: null });
	await page.getByRole('button', { name: 'Give the floor' }).click();
	await expectRunningView(page, /^Single speaker/);
	await waitUntilAnswered(page);
	await openRoom(page, room.roomPath);
	await expectRunningView(page, /^Single speaker/);
	await view(page).getByRole('button', { name: 'End speech' }).click();
	await view(page).getByRole('button', { name: 'Return to GSL' }).click();
	await expect(floorRegion(page)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await waitUntilAnswered(page);
	await expectLandedOn(page, room.roomPath);
	expect(await readCommitteeState(room.committeeId)).toMatchObject({ mode: 'formal_debate' });
});
