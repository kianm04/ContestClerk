import { expect, test, type Locator, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	DATABASE_TIMEOUT_MS,
	makeChairedCommittee,
	openCommitteeMenu,
	openRoom,
	startSession,
	waitForConsoleScript,
	type ChairedCommittee,
	waitUntilAnswered
} from './chair-room-fixtures';
import { addSeats } from './gsl-fixtures';
import { expectNoSidewaysOverflow, saveFullPageScreenshot } from './page-shape';
import { signIn } from './signed-in-user';

// S5: the roll call view (specs/05-pages/chair/roll-call.md), inside the
// console's frame. The seats in alphabetical order, each with its answer as
// one segmented control in full words; the counts and a neutral quorum line;
// "Mark all present" and "Return to the floor"; the earlier roll calls; and
// A, P and V with the arrow keys. Opening the view stores nothing: the first
// press makes the roll call (R2).
//
// Every row is a plain `<form method="post">`, so every test but the keyboard
// and realtime ones runs on all three projects, and `desktop-no-js` proves the
// buttons, and the focus coming back to the row, work without JavaScript.

/** How long the realtime criterion allows a second screen to catch up. */
const REALTIME_TIMEOUT_MS = 2_000;

/** The height a phone's answer buttons must reach, so a thumb can hit them. */
const MIN_TOUCH_TARGET_PX = 44;

/** One seat's mark, keyed by seat name, as the database holds it. */
type MarksBySeat = Record<string, string>;

/** The view's heading for the fixture's session. */
function viewHeading(page: Page): Locator {
	return page.getByRole('heading', { level: 2, name: 'Roll call · Session 1' });
}

/** Sign the chair in, start a session in the room, and open the roll call view. */
async function openRollCallWithSession(
	page: Page,
	room: ChairedCommittee,
	search = ''
): Promise<void> {
	await signIn(page, room.chair);
	await openRoom(page, room.roomPath);
	await startSession(page);
	await page.goto(`${room.roomPath}/roll-call${search}`);
	await expect(viewHeading(page)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
}

/** A seat's answer button. */
function answerButton(page: Page, seatName: string, answer: string): Locator {
	return page
		.getByRole('form', { name: `Attendance of ${seatName}` })
		.getByRole('button', { name: answer, exact: true });
}

/** Press one of a seat's three answers and wait until it is saved. */
async function mark(page: Page, seatName: string, answer: string): Promise<void> {
	await answerButton(page, seatName, answer).click();
	await expectMarked(page, seatName, answer);
}

/** Wait until a seat's row shows `answer` as the chosen one, and the press is answered. */
async function expectMarked(page: Page, seatName: string, answer: string): Promise<void> {
	await expect(answerButton(page, seatName, answer)).toHaveAttribute('aria-pressed', 'true', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(page);
}

/** The view's counts and quorum line. */
function countsLine(page: Page): Locator {
	return page.getByRole('main').getByText(/present and\s+voting ·/);
}

/** The filled buttons and links of the page area: a filled one carries the dark blue. */
function filledControls(page: Page): Locator {
	return page
		.getByRole('main')
		.locator(
			'a:is(.bg-primary, .bg-brand-900):visible, button:is(.bg-primary, .bg-brand-900):visible'
		);
}

/** Every roll call of the committee, oldest first, with each seat's mark. */
async function readRollCalls(committeeId: string): Promise<MarksBySeat[]> {
	const admin = createServiceRoleClient();

	const { data: seats, error: seatsError } = await admin
		.from('seats')
		.select('id, name')
		.eq('committee_id', committeeId);
	const { data: rollCalls, error } = await admin
		.from('roll_calls')
		.select('taken_at, committee_sessions!inner(committee_id), roll_call_entries(seat_id, status)')
		.eq('committee_sessions.committee_id', committeeId)
		.order('taken_at');

	if (seatsError || error) {
		throw new Error(`Could not read the roll calls: ${seatsError?.message ?? error?.message}`);
	}

	const seatNames = new Map((seats ?? []).map((seat) => [seat.id, seat.name]));

	return (rollCalls ?? []).map((rollCall) => {
		const marks: MarksBySeat = {};

		for (const entry of rollCall.roll_call_entries) {
			marks[seatNames.get(entry.seat_id) ?? entry.seat_id] = entry.status;
		}

		return marks;
	});
}

test('is not found for the chair of another committee', async ({ page }) => {
	const room = await makeChairedCommittee('Stranger Roll Call MUN');
	const otherRoom = await makeChairedCommittee('Other Roll Call MUN');

	await signIn(page, otherRoom.chair);
	const response = await page.goto(`${room.roomPath}/roll-call`);

	expect(response?.status()).toBe(404);
});

test('without a session it says so, and leads to the chair room', async ({ page }) => {
	const room = await makeChairedCommittee('No Session Roll Call MUN');

	await signIn(page, room.chair);
	await page.goto(`${room.roomPath}/roll-call`);

	await expect(page.getByRole('heading', { name: 'No session is running.' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.getByRole('link', { name: 'Open the chair room' })).toHaveAttribute(
		'href',
		new RegExp(`${room.roomPath}$`)
	);
});

test('before the first roll call every seat is "Absent" and nothing is stored until a press', async ({
	page
}) => {
	const room = await makeChairedCommittee('Start Roll Call MUN');
	await addSeats(room, [{ name: 'Brazil', countryCode: 'BR' }]);

	await openRollCallWithSession(page, room);

	// The seats in alphabetical order, the way a chair calls them, each starting "Absent".
	const rows = page.getByRole('main').getByRole('form', { name: /^Attendance of / });
	await expect(rows).toHaveCount(4);
	expect(
		await rows.evaluateAll((forms) => forms.map((form) => form.getAttribute('aria-label')))
	).toEqual([
		'Attendance of Brazil',
		'Attendance of France',
		'Attendance of Ghana',
		'Attendance of Japan'
	]);
	await expect(answerButton(page, 'Japan', 'Absent')).toHaveAttribute('aria-pressed', 'true');
	await expect(countsLine(page)).toHaveText(
		'0 present and voting · 0 present · 4 absent · Quorum 2 · 2 more needed'
	);
	// "Mark all present" is the one filled button until someone is present (P1).
	await expect(filledControls(page)).toHaveText(['Mark all present']);
	// Nothing in the view is amber or red, a missing quorum included (P4).
	await expect(
		page.getByRole('main').locator('[class*="warning-"], [class*="danger-"]')
	).toHaveCount(0);
	expect(await readRollCalls(room.committeeId)).toEqual([]);

	// The first press makes the roll call, every other seat absent.
	await mark(page, 'Ghana', 'Present');
	expect(await readRollCalls(room.committeeId)).toEqual([
		{ Brazil: 'absent', France: 'absent', Ghana: 'present', Japan: 'absent' }
	]);
	await expect(countsLine(page)).toHaveText(
		'0 present and voting · 1 present · 3 absent · Quorum 2 · 1 more needed'
	);
	await expect(filledControls(page)).toHaveText(['Return to the floor']);
});

test('a status button marks one seat and keeps the focus on its row', async ({ page }) => {
	const room = await makeChairedCommittee('Status Roll Call MUN');

	await openRollCallWithSession(page, room);

	// Safari does not move the focus to a button a mouse clicks, so the focus is
	// only a keyboard user's to keep: the button is pressed from the keyboard (T151).
	await answerButton(page, 'Ghana', 'Present').press('Enter');
	await expectMarked(page, 'Ghana', 'Present');

	expect(await readRollCalls(room.committeeId)).toEqual([
		{ France: 'absent', Ghana: 'present', Japan: 'absent' }
	]);
	await expect(answerButton(page, 'Ghana', 'Present')).toBeFocused();

	// Two of three present meets the quorum `quorum()` asks for: half, rounded up.
	await mark(page, 'Japan', 'Present and voting');
	await expect(countsLine(page)).toHaveText(
		'1 present and voting · 1 present · 1 absent · Quorum 2 · met · majority 2'
	);
});

test('"Mark all present" keeps present and voting, and the top bar counts it', async ({ page }) => {
	const room = await makeChairedCommittee('Mark All Roll Call MUN');

	await openRollCallWithSession(page, room);
	await mark(page, 'France', 'Present and voting');

	await page.getByRole('button', { name: 'Mark all present' }).click();
	await expectMarked(page, 'Japan', 'Present');

	expect(await readRollCalls(room.committeeId)).toEqual([
		{ France: 'present_and_voting', Ghana: 'present', Japan: 'present' }
	]);
	// The latest roll call drives the present count on every chair page.
	await expect(
		page.getByRole('banner').getByRole('link', { name: '3/3 present · quorum met' })
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Finish' })).toHaveCount(0);
});

test('a new roll call starts from absent and lists the earlier one as a link', async ({ page }) => {
	const room = await makeChairedCommittee('Earlier Roll Call MUN');

	await openRollCallWithSession(page, room);
	await mark(page, 'Ghana', 'Present');

	await page.getByRole('button', { name: 'Start a new roll call' }).click();

	const earlier = page.getByRole('link', { name: /^\d\d:\d\d \(1 present\)$/ });
	await expect(earlier).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expectMarked(page, 'Ghana', 'Absent');
	expect(await readRollCalls(room.committeeId)).toEqual([
		{ France: 'absent', Ghana: 'present', Japan: 'absent' },
		{ France: 'absent', Ghana: 'absent', Japan: 'absent' }
	]);

	// The earlier one can still be corrected; only it changes.
	await earlier.click();
	await expectMarked(page, 'Ghana', 'Present');
	await mark(page, 'France', 'Present');
	expect(await readRollCalls(room.committeeId)).toEqual([
		{ France: 'present', Ghana: 'present', Japan: 'absent' },
		{ France: 'absent', Ghana: 'absent', Japan: 'absent' }
	]);
});

test('a new roll call puts the marker and the focus back on the first seat, for the keys', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'The keys need JavaScript and a keyboard.');
	const room = await makeChairedCommittee('Keys After New Roll Call MUN');

	await openRollCallWithSession(page, room);
	await waitForConsoleScript(page);
	await mark(page, 'France', 'Present');
	await mark(page, 'Ghana', 'Present');

	await page.getByRole('button', { name: 'Start a new roll call' }).click();
	await expect(page.getByRole('link', { name: /^\d\d:\d\d \(2 present\)$/ })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// The button waits disabled for the server, which drops the focus; the new list takes it.
	await expect(answerButton(page, 'France', 'Absent')).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('v');
	await expectMarked(page, 'Ghana', 'Present and voting');

	expect(await readRollCalls(room.committeeId)).toEqual([
		{ France: 'present', Ghana: 'present', Japan: 'absent' },
		{ France: 'absent', Ghana: 'present_and_voting', Japan: 'absent' }
	]);
	await saveFullPageScreenshot(page, 'roll-call-new-keys');
});

test('"Return to the floor" goes back to the view the roll call was opened from', async ({
	page
}) => {
	const room = await makeChairedCommittee('Return Roll Call MUN');

	await openRollCallWithSession(page, room, '?from=motions');
	const back = page.getByRole('link', { name: 'Return to the floor' });
	await expect(back).toHaveAttribute('href', new RegExp(`${room.roomPath}/motions$`));

	// Every press keeps where the view was opened from.
	await mark(page, 'France', 'Present');
	await expect(page).toHaveURL(/from=motions/);
	await expect(back).toHaveAttribute('href', new RegExp(`${room.roomPath}/motions$`));

	await back.click();
	await expect(page).toHaveURL(`${room.roomPath}/motions`, { timeout: DATABASE_TIMEOUT_MS });

	// Opened with no `from`, it goes back to the live room.
	await page.goto(`${room.roomPath}/roll-call`);
	await expect(page.getByRole('link', { name: 'Return to the floor' })).toHaveAttribute(
		'href',
		new RegExp(`${room.roomPath}$`)
	);
});

test('R opens the roll call on the first row; P answers and moves on, the arrows move', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'The keys need JavaScript and a keyboard.');
	const room = await makeChairedCommittee('Keyboard Roll Call MUN');

	await signIn(page, room.chair);
	await openRoom(page, room.roomPath);
	await startSession(page);
	await waitForConsoleScript(page);
	await page.locator('body').click({ position: { x: 5, y: 300 } });
	await page.keyboard.press('r');
	await expect(viewHeading(page)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	// The view opens with the focus on the marked row, the first, so P answers at once.
	await expect(answerButton(page, 'France', 'Absent')).toBeFocused();
	await page.keyboard.press('p');
	await page.keyboard.press('p');
	await page.keyboard.press('V');
	await expectMarked(page, 'Japan', 'Present and voting');
	// After the last seat the marker stays on it.
	await expect(answerButton(page, 'Japan', 'Present and voting')).toBeFocused();

	await page.keyboard.press('ArrowUp');
	await expect(answerButton(page, 'Ghana', 'Present')).toBeFocused();
	await page.keyboard.press('a');
	await expectMarked(page, 'Ghana', 'Absent');

	expect(await readRollCalls(room.committeeId)).toEqual([
		{ France: 'present', Ghana: 'absent', Japan: 'present_and_voting' }
	]);
});

test('the keys work after a click, and A, P and V answer the marked seat from outside the list', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'The keys need JavaScript and a keyboard.');
	const room = await makeChairedCommittee('Click Then Keys Roll Call MUN');

	await openRollCallWithSession(page, room);
	await waitForConsoleScript(page);

	// Safari does not focus a clicked button by itself, so the list does (run with WebKit to see it).
	await mark(page, 'France', 'Present');
	await expect(answerButton(page, 'France', 'Present')).toBeFocused();
	await page.keyboard.press('v');
	await expectMarked(page, 'France', 'Present and voting');
	await expect(answerButton(page, 'Ghana', 'Absent')).toBeFocused();

	// With the shortcuts on, a letter pressed elsewhere on the page answers the marked seat and moves on.
	await page.getByRole('link', { name: 'Return to the floor' }).focus();
	await page.keyboard.press('p');
	await expectMarked(page, 'Ghana', 'Present');
	await expect(answerButton(page, 'Japan', 'Absent')).toBeFocused();

	expect(await readRollCalls(room.committeeId)).toEqual([
		{ France: 'present_and_voting', Ghana: 'present', Japan: 'absent' }
	]);
	await saveFullPageScreenshot(page, 'roll-call-keys');
});

test('A, P and V work with the shortcuts off, and only while the list has the focus', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'The keys need JavaScript and a keyboard.');
	const room = await makeChairedCommittee('Keyboard Off Roll Call MUN');

	await openRollCallWithSession(page, room);
	await waitForConsoleScript(page);
	const menu = await openCommitteeMenu(page);
	await menu.locator('summary', { hasText: 'Keyboard shortcuts' }).click();
	const switchButton = menu.getByRole('button', { name: 'Use keyboard shortcuts' });
	await switchButton.click();
	await expect(switchButton).toHaveAttribute('aria-pressed', 'false');
	await page.keyboard.press('Escape');

	await answerButton(page, 'France', 'Absent').focus();
	await page.keyboard.press('p');
	await expectMarked(page, 'France', 'Present');

	// Outside the list the keys do nothing.
	await page.getByRole('link', { name: 'Return to the floor' }).focus();
	await page.keyboard.press('v');
	await waitUntilAnswered(page);
	expect(await readRollCalls(room.committeeId)).toEqual([
		{ France: 'present', Ghana: 'absent', Japan: 'absent' }
	]);
});

test('the room hears a roll call taken on another screen', async ({ browser }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'Realtime needs JavaScript and one project.');

	const room = await makeChairedCommittee('Realtime Roll Call MUN');
	const chairContext = await browser.newContext();
	const organiserContext = await browser.newContext();
	const chairPage = await chairContext.newPage();
	const organiserPage = await organiserContext.newPage();

	await openRollCallWithSession(chairPage, room);
	await signIn(organiserPage, room.organiser);
	await openRoom(organiserPage, room.roomPath);
	const chip = organiserPage.getByRole('banner').getByRole('link', { name: /roll call|present/ });
	await expect(chip).toHaveAccessibleName('Take roll call');
	await waitForConsoleScript(organiserPage);

	// The first answer makes the roll call, which the room hears, then its marks.
	await mark(chairPage, 'Ghana', 'Present');
	await expect(chip).toHaveAccessibleName('1/3 present · 1 more needed', {
		timeout: REALTIME_TIMEOUT_MS + 1_000
	});

	await mark(chairPage, 'Japan', 'Present');
	await expect(chip).toHaveAccessibleName('2/3 present · quorum met', {
		timeout: REALTIME_TIMEOUT_MS + 1_000
	});

	await chairContext.close();
	await organiserContext.close();
});

test('on a phone the answers go under the country, full width, and nothing spills sideways', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	const room = await makeChairedCommittee('Phone Roll Call International MUN');

	await openRollCallWithSession(page, room);
	await mark(page, 'Ghana', 'Present and voting');

	const present = await answerButton(page, 'Ghana', 'Present').boundingBox();
	const country = await page.getByRole('main').getByText('Ghana', { exact: true }).boundingBox();
	expect(present?.height ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
	expect(present?.y ?? 0).toBeGreaterThan(country?.y ?? 0);
	await expect(page.getByText(/Every answer is saved as you press it/)).toBeHidden();

	await saveFullPageScreenshot(page, 'roll-call-phone');
	await expectNoSidewaysOverflow(page);
});

test('keeps its layout at 1024 × 768 without overflowing', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough to measure a width.');
	await page.setViewportSize({ width: 1024, height: 768 });

	const room = await makeChairedCommittee('Narrow Roll Call MUN');

	await openRollCallWithSession(page, room);
	await mark(page, 'France', 'Present');

	await saveFullPageScreenshot(page, 'roll-call-1024');
	await expectNoSidewaysOverflow(page);
	// The answers stay beside the country on one line.
	const absent = await answerButton(page, 'France', 'Absent').boundingBox();
	const country = await page.getByRole('main').getByText('France', { exact: true }).boundingBox();
	expect(Math.abs((absent?.y ?? 0) - (country?.y ?? 0))).toBeLessThan(20);
});
