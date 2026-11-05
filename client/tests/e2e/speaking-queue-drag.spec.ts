import { expect, test, type Locator, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	DATABASE_TIMEOUT_MS,
	makeChairedCommittee,
	openRoom,
	readCommitteeState,
	startSession,
	type ChairedCommittee
} from './chair-room-fixtures';
import { addBox, gslPath } from './gsl-fixtures';
import { skipWithoutJavaScript } from './in-place';
import { signIn } from './signed-in-user';

// T129: the speaking queue is dragged into order with a mouse, a finger or the
// keyboard, and the add box adds a seat. Since S4 the queue is the GSL view's
// queue column, which `chair` draws in formal debate and `chair/gsl` always;
// these tests drag it on `chair/gsl`. Dragging needs JavaScript; the row
// menu's "Move to top" is the same reorder without it, so that test runs on
// `desktop-no-js` as well.

/** How soon a dropped row must show in its new place, before the server has answered. */
const AT_ONCE_TIMEOUT_MS = 1_000;

/**
 * What the toast says when a drop never reached the server: the action that
 * failed, then the reason (`$lib/chair-form.ts`, `$lib/instant-form.svelte.ts`).
 */
const NETWORK_FAILURE_MESSAGE = 'The speaker was not moved. Check your connection and try again.';

/** Put the seats on the room's active list as waiting, in the order given. */
async function seedQueue(room: ChairedCommittee, seatNames: string[]): Promise<void> {
	const admin = createServiceRoleClient();
	const state = await readCommitteeState(room.committeeId);
	const { data: seats, error: seatsError } = await admin
		.from('seats')
		.select('id, name')
		.eq('committee_id', room.committeeId);

	if (seatsError || !seats || !state.active_speakers_list_id) {
		throw new Error(`Could not find the seats or the list: ${seatsError?.message}`);
	}

	const entries = seatNames.map((seatName, index) => ({
		speakers_list_id: state.active_speakers_list_id,
		seat_id: seats.find((seat) => seat.name === seatName)?.id,
		position: index + 1,
		status: 'waiting' as const
	}));
	const { error } = await admin.from('speakers_list_entries').insert(entries);

	if (error) throw new Error(`Could not add the speakers: ${error.message}`);
}

/** The seat names of the room's waiting entries, in their saved order. */
async function readWaitingOrder(room: ChairedCommittee): Promise<string[]> {
	const admin = createServiceRoleClient();
	const state = await readCommitteeState(room.committeeId);
	const { data, error } = await admin
		.from('speakers_list_entries')
		.select('position, seats(name)')
		.eq('speakers_list_id', state.active_speakers_list_id ?? '')
		.eq('status', 'waiting')
		.order('position')
		// Each entry has exactly one seat, which the generated types cannot tell.
		.overrideTypes<{ position: number; seats: { name: string } }[], { merge: false }>();

	if (error) throw new Error(`Could not read the entries: ${error.message}`);

	return (data ?? []).map((row) => row.seats.name);
}

/** Start a session with France, Ghana and Japan waiting, and open the GSL view. */
async function openQueue(page: Page, room: ChairedCommittee): Promise<void> {
	await signIn(page, room.chair);
	await openRoom(page, room.roomPath);
	await startSession(page);
	await seedQueue(room, ['France', 'Ghana', 'Japan']);
	await page.goto(gslPath(room));
	await expect(waitingRows(page)).toHaveCount(3, {
		timeout: DATABASE_TIMEOUT_MS
	});
}

/** The waiting rows of the queue, top to bottom. */
function waitingRows(page: Page): Locator {
	return page.getByRole('main').locator('ol[data-sortable-list] > li');
}

/** A row's drag handle, once the page's JavaScript has switched it on. */
async function readyHandle(page: Page, seatName: string): Promise<Locator> {
	const handle = page.getByRole('button', { name: `Reorder ${seatName}` });
	await expect(handle).toBeEnabled({ timeout: DATABASE_TIMEOUT_MS });

	return handle;
}

/** The middle of an element on the page, in pixels. */
async function middleOf(locator: Locator): Promise<{ x: number; y: number }> {
	const box = await locator.boundingBox();

	if (!box) throw new Error('The element is not on the screen.');

	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Wait until the saved order is `expected`, then check a reload draws the same. */
async function expectOrderKept(page: Page, room: ChairedCommittee, expected: string[]) {
	await expect
		.poll(() => readWaitingOrder(room), { timeout: DATABASE_TIMEOUT_MS })
		.toEqual(expected);
	await page.reload();
	await expect(waitingRows(page)).toHaveText(
		expected.map((seatName) => new RegExp(seatName)),
		{ timeout: DATABASE_TIMEOUT_MS }
	);
}

test('a mouse drags a row of the room queue to the top, and the order is kept', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'A mouse drag needs JavaScript and a mouse.');
	const room = await makeChairedCommittee('Mouse Drag Queue MUN');

	await openQueue(page, room);
	const from = await middleOf(await readyHandle(page, 'Japan'));
	const to = await middleOf(waitingRows(page).first());

	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	// Several small steps, as a hand moves, so the other rows make room on the way.
	await page.mouse.move(from.x, to.y - 10, { steps: 12 });
	// While the row is held, France has slid down to make room for it.
	await expect(waitingRows(page).first()).toHaveAttribute('style', /translateY\(\d/);
	await page.mouse.up();

	await expect(waitingRows(page)).toHaveText([/Japan/, /France/, /Ghana/], {
		timeout: AT_ONCE_TIMEOUT_MS
	});
	await expectOrderKept(page, room, ['Japan', 'France', 'Ghana']);
});

test('the keyboard picks a row up, moves it and drops it, and is told so', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'A keyboard drag needs JavaScript.');
	const room = await makeChairedCommittee('Keyboard Drag Queue MUN');

	await openQueue(page, room);
	const handle = await readyHandle(page, 'France');
	await handle.focus();

	await page.keyboard.press('Space');
	await expect(page.getByText('France picked up, place 1 of 3.', { exact: false })).toBeAttached();
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('Space');

	await expect(page.getByText('France dropped at place 3 of 3.')).toBeAttached();
	await expect(waitingRows(page)).toHaveText([/Ghana/, /Japan/, /France/], {
		timeout: AT_ONCE_TIMEOUT_MS
	});
	// The reader who dropped the row still has the focus on its handle.
	await expect(page.getByRole('button', { name: 'Reorder France' })).toBeFocused();
	await expectOrderKept(page, room, ['Ghana', 'Japan', 'France']);
});

test('a finger drags a row on a phone without scrolling the page', async ({
	page,
	browserName
}, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a touch screen.');
	// The touches below are sent through Chrome's DevTools protocol, which Safari's
	// engine (`pnpm test:e2e:webkit`) does not speak (T163).
	test.skip(browserName !== 'chromium', 'Only Chromium can be sent touches through DevTools.');
	const room = await makeChairedCommittee('Touch Drag Queue MUN');

	await openQueue(page, room);
	const handle = await readyHandle(page, 'France');
	await handle.scrollIntoViewIfNeeded();
	const from = await middleOf(handle);
	const to = await middleOf(waitingRows(page).last());
	// The console scrolls inside its `<main>` (the frame keeps the bars still),
	// so both that and the window are read.
	const readScroll = () =>
		page.evaluate(() => window.scrollY + (document.querySelector('main')?.scrollTop ?? 0));
	const scrollBefore = await readScroll();

	// Playwright has no finger drag of its own, so the touches go straight to
	// Chrome through its DevTools protocol, the way a phone reports them.
	const devTools = await page.context().newCDPSession(page);
	const touchAt = (y: number) => [{ x: from.x, y }];
	await devTools.send('Input.dispatchTouchEvent', {
		type: 'touchStart',
		touchPoints: touchAt(from.y)
	});
	for (let step = 1; step <= 12; step += 1) {
		const y = from.y + ((to.y + 10 - from.y) * step) / 12;
		await devTools.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touchAt(y) });
	}
	await devTools.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

	await expect(waitingRows(page)).toHaveText([/Ghana/, /Japan/, /France/], {
		timeout: AT_ONCE_TIMEOUT_MS
	});
	expect(await readScroll()).toBe(scrollBefore);
	await expectOrderKept(page, room, ['Ghana', 'Japan', 'France']);
});

test('a drop the server never hears about puts the rows back with a message', async ({
	page
}, testInfo) => {
	skipWithoutJavaScript(testInfo);
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough for a failed save.');
	const room = await makeChairedCommittee('Failed Drag Queue MUN');

	await openQueue(page, room);
	await page.route(
		(url) => url.search.includes('/moveTo'),
		(route) => route.abort()
	);
	const handle = await readyHandle(page, 'France');
	await handle.focus();
	await page.keyboard.press('Space');
	await page.keyboard.press('End');
	await page.keyboard.press('Space');

	await expect(page.getByText(NETWORK_FAILURE_MESSAGE)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(waitingRows(page)).toHaveText([/France/, /Ghana/, /Japan/]);
	expect(await readWaitingOrder(room)).toEqual(['France', 'Ghana', 'Japan']);
});

test('the add box adds a seat with Enter and with a click', async ({ page }, testInfo) => {
	skipWithoutJavaScript(testInfo);
	const room = await makeChairedCommittee('Search Add Queue MUN');

	await signIn(page, room.chair);
	await openRoom(page, room.roomPath);
	await startSession(page);
	await page.goto(gslPath(room));

	await addBox(page).click();
	await addBox(page).pressSequentially('gha');
	await expect(page.getByRole('option')).toHaveText([/Ghana/]);
	await addBox(page).press('Enter');

	await expect(waitingRows(page).filter({ hasText: 'Ghana' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(addBox(page)).toHaveValue('');
	await expect(addBox(page)).toBeFocused();

	await addBox(page).fill('ghana');
	// Ghana is already waiting, so it is marked rather than offered again.
	await expect(page.getByRole('option', { name: /Ghana/ })).toContainText('in list');
	await expect(page.getByRole('option', { name: /Ghana/ })).toHaveAttribute(
		'aria-disabled',
		'true'
	);

	await addBox(page).fill('jap');
	await page.getByRole('option', { name: /Japan/ }).click();
	await expect(waitingRows(page)).toHaveText([/Ghana/, /Japan/], {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect
		.poll(() => readWaitingOrder(room), { timeout: DATABASE_TIMEOUT_MS })
		.toEqual(['Ghana', 'Japan']);
});

test('"Move to top" in the row menu reorders the queue, with or without JavaScript', async ({
	page
}, testInfo) => {
	const room = await makeChairedCommittee('Menu Move Queue MUN');

	await openQueue(page, room);
	if (testInfo.project.name === 'desktop-no-js') {
		// Without JavaScript nothing can be dragged, so the handles stay out of sight.
		await expect(page.getByRole('button', { name: 'Reorder Japan' })).toBeHidden();
	}

	// Each row's menu is a `<details>`, which opens without JavaScript.
	await page.locator('summary', { hasText: 'Options for Japan' }).click();
	await page.getByRole('button', { name: 'Move to top' }).click();

	await expect(waitingRows(page)).toHaveText([/Japan/, /France/, /Ghana/], {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expectOrderKept(page, room, ['Japan', 'France', 'Ghana']);
});
