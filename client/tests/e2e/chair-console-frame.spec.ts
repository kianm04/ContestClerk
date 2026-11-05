import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	DATABASE_TIMEOUT_MS,
	makeChairedCommittee,
	modeBar,
	modeBarTab,
	openCommitteeMenu,
	readCommitteeState,
	takeRollCall,
	waitForConsoleScript,
	waitUntilAnswered,
	type ChairedCommittee
} from './chair-room-fixtures';
import {
	fillSpeakersList,
	proposeCaucus,
	roomChannelListening,
	startSessionInDatabase
} from './committee-live-fixtures';
import { remInPixels } from './page-shape';
import { createTestUser, makeCommitteeChair, signIn } from './signed-in-user';

// The chair console's frame (S3, specs/05-pages/chair/committee-room.md, "The
// frame", "Viewing is not the same as going live", "Keys"): the top bar, the
// attendance chip, the committee menu, the mode bar, the live strip, End's
// confirmation and the keys, on every chair page. The tests that need a
// script or a second browser say so and skip `desktop-no-js`; the rest run on
// every project.

/** How long the realtime criterion allows a second screen to catch up. */
const REALTIME_TIMEOUT_MS = 2_000;

/** How long the console waits before reading the room again while its connection is down. */
const PAUSED_CATCH_UP_MS = 15_000;

/**
 * The top bar's and the mode bar's heights (`committee-room.md`, "Top bar", "Mode
 * bar"), in rem: 56px and 64px at the browser's own 16px. From `lg` up the rem
 * grows and shrinks with the window (Trello WMcXfry0), so they are measured against it.
 */
const TOP_BAR_HEIGHT_REM = 3.5;
const MODE_BAR_HEIGHT_REM = 4;

/** Every chair page that draws the frame during a session, by the part of its address after `/chair`. */
const FRAMED_PAGES = [
	'',
	'/gsl',
	'/motions',
	'/voting',
	'/roll-call',
	'/papers',
	'/notes',
	'/awards'
];

/** Change the room's `committee_state` row, as one of the chair's presses would. */
async function setRoom(room: ChairedCommittee, columns: Record<string, unknown>): Promise<void> {
	const { error } = await createServiceRoleClient()
		.from('committee_state')
		.update(columns)
		.eq('committee_id', room.committeeId);

	if (error) throw new Error(`Could not change the room: ${error.message}`);
}

/**
 * A committee in debate: Session 1 in formal debate, everybody present, France
 * speaking with 0:47 of 1:00 on a paused clock, and Ghana waiting.
 */
async function makeRoomInDebate(namePrefix: string): Promise<ChairedCommittee> {
	const room = await makeChairedCommittee(namePrefix);
	await startSessionInDatabase(room);
	await takeRollCall(room, '');
	await fillSpeakersList(room, ['France', 'Ghana'], true);
	await setRoom(room, { timer_total_seconds: 60, timer_paused_remaining_seconds: 47 });

	return room;
}

/** The same room with France's clock running, 47 seconds left. */
async function startTheClock(room: ChairedCommittee): Promise<void> {
	await setRoom(room, {
		timer_total_seconds: 60,
		timer_ends_at: new Date(Date.now() + 47_000).toISOString(),
		timer_paused_remaining_seconds: null
	});
}

/** Open a chair page and wait until the console's top bar has its committee. */
async function openChairPage(page: Page, room: ChairedCommittee, path: string): Promise<void> {
	await page.goto(`${room.roomPath}${path}`);
	await expect(page.getByRole('banner').getByTitle('Security Council')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
}

/** The live strip under the top bar: its words are the one link to the live room in it. */
function liveStripLink(page: Page) {
	return page.getByRole('link', { name: /^Live GSL ·/ });
}

test.describe('the frame on every chair page', () => {
	test('a session draws the top bar, the page and the mode bar on every chair page', async ({
		page
	}) => {
		const room = await makeRoomInDebate('Frame Pages MUN');
		await signIn(page, room.chair);

		for (const path of FRAMED_PAGES) {
			await openChairPage(page, room, path);

			const topBar = await page.getByRole('banner').boundingBox();
			const bar = await modeBar(page).boundingBox();
			const windowHeight = page.viewportSize()?.height ?? 0;
			const rem = await remInPixels(page);

			expect(topBar?.height ?? 0, `top bar on ${path}`).toBeCloseTo(TOP_BAR_HEIGHT_REM * rem, 0);
			expect(bar?.height ?? 0, `mode bar on ${path}`).toBeCloseTo(MODE_BAR_HEIGHT_REM * rem, 0);
			// The mode bar sits at the bottom of the window, whatever the page holds.
			expect(Math.round((bar?.y ?? 0) + (bar?.height ?? 0)), `mode bar on ${path}`).toBe(
				windowHeight
			);
		}
	});

	test('the lobby and the ended screen have no mode bar, and no session in the top bar', async ({
		page
	}) => {
		const room = await makeChairedCommittee('Frame Lobby MUN');
		await signIn(page, room.chair);
		await openChairPage(page, room, '');

		await expect(modeBar(page)).toHaveCount(0);
		await expect(
			page.getByRole('banner').getByRole('link', { name: /present|roll call/ })
		).toHaveCount(0);
		await expect(page.getByRole('banner').getByText(/^Session \d+ ·/)).toHaveCount(0);
	});

	test('a floor view fills the window at 1280 × 800 without the page scrolling', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name === 'phone', 'The phone has its own layout.');
		const room = await makeRoomInDebate('Frame Fill MUN');
		await signIn(page, room.chair);
		await openChairPage(page, room, '');

		const sizes = await page.evaluate(() => ({
			pageHeight: document.documentElement.scrollHeight,
			windowHeight: window.innerHeight,
			pageWidth: document.documentElement.scrollWidth,
			windowWidth: window.innerWidth
		}));

		expect(sizes.pageHeight).toBeLessThanOrEqual(sizes.windowHeight);
		expect(sizes.pageWidth).toBeLessThanOrEqual(sizes.windowWidth);
	});
});

test.describe('the top bar', () => {
	test('holds the mark, the committee, the agenda, the session and its time, the chip and the menu', async ({
		page
	}, testInfo) => {
		const room = await makeRoomInDebate('Frame Top Bar MUN');
		await signIn(page, room.chair);
		await openChairPage(page, room, '');

		const banner = page.getByRole('banner');
		await expect(banner.getByRole('link', { name: 'MUNMeet home' })).toHaveAttribute(
			'href',
			/\/home$/
		);
		const committee = banner.getByRole('heading', { level: 1 });
		await expect(committee).toHaveAttribute('title', 'Security Council');
		await expect(committee).toHaveAccessibleName('UNSC, Security Council');
		await expect(banner.getByRole('link', { name: '3/3 present · quorum met' })).toBeVisible();
		await expect(banner.getByLabel('Committee menu')).toBeVisible();

		if (testInfo.project.name === 'phone') return;

		// "Session 1 · 0:07", counting each second.
		const sessionTime = banner.getByText(/^Session 1 · \d+:\d\d/);
		await expect(sessionTime).toBeVisible();

		if (testInfo.project.use.javaScriptEnabled === false) return;

		const first = await sessionTime.textContent();
		await expect(sessionTime).not.toHaveText(first ?? '', { timeout: 3_000 });
		await expect(banner.getByText('Connected')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	});

	test('the attendance chip reads the roll, neutral while it is taken and warning once debate starts', async ({
		page
	}) => {
		const room = await makeChairedCommittee('Frame Chip MUN');
		await startSessionInDatabase(room);
		await signIn(page, room.chair);
		const chip = page.getByRole('banner').getByRole('link', { name: /roll call|present/ });

		// No roll call yet: the chip asks for one, neutral (P4).
		await openChairPage(page, room, '');
		await expect(chip).toHaveAccessibleName('Take roll call');
		await expect(chip).not.toHaveClass(/warning/);

		// One of three present during the opening: still neutral, counting what is needed.
		await takeRollCall(room, 'Ghana');
		const japan = await createServiceRoleClient()
			.from('roll_call_entries')
			.update({ status: 'absent' })
			.eq('seat_id', (await seatIdByName(room, 'Japan')) ?? '');
		expect(japan.error).toBeNull();
		await openChairPage(page, room, '');
		await expect(chip).toHaveAccessibleName('1/3 present · 1 more needed');
		await expect(chip).not.toHaveClass(/warning/);

		// Calling the first speaker ends the opening (S5): a missing quorum is now a real problem.
		await fillSpeakersList(room, ['France'], true);
		await openChairPage(page, room, '');
		await expect(chip).toHaveAccessibleName('1/3 present · no quorum');
		await expect(chip).toHaveClass(/bg-warning-100/);

		// Opened from Motions, it leads to the roll call view, saying where it came from.
		await openChairPage(page, room, '/motions');
		await chip.click();
		await expect(page).toHaveURL(`${room.roomPath}/roll-call?from=motions`, {
			timeout: DATABASE_TIMEOUT_MS
		});
	});
});

/** A seat's id by its name, in the fixture committee. */
async function seatIdByName(room: ChairedCommittee, name: string): Promise<string | null> {
	const { data } = await createServiceRoleClient()
		.from('seats')
		.select('id')
		.eq('committee_id', room.committeeId)
		.eq('name', name)
		.single();

	return data?.id ?? null;
}

test.describe('the committee menu', () => {
	test('offers the pages inside the frame and leaves them for the floor in one press', async ({
		page
	}, testInfo) => {
		const room = await makeRoomInDebate('Frame Menu MUN');
		await signIn(page, room.chair);
		await openChairPage(page, room, '');
		// A menu opened before the script takes the page over is shut again by it.
		if (testInfo.project.use.javaScriptEnabled !== false) await waitForConsoleScript(page);

		const menu = await openCommitteeMenu(page);
		for (const item of ['Papers', 'Notes', 'Awards', 'Leave chair room']) {
			await expect(menu.getByRole('link', { name: item })).toBeVisible();
		}
		await expect(menu.locator('summary', { hasText: 'Keyboard shortcuts' })).toBeVisible();
		// No session has ended yet, so there is no record to open.
		await expect(menu.getByRole('link', { name: 'Session record' })).toHaveCount(0);

		await menu.getByRole('link', { name: 'Papers' }).click();
		await expect(page).toHaveURL(`${room.roomPath}/papers`, { timeout: DATABASE_TIMEOUT_MS });
		await expect(modeBar(page)).toBeVisible();
		// No view is selected on Papers.
		await expect(modeBar(page).locator('[aria-current="page"]')).toHaveCount(0);

		await modeBarTab(page, 'GSL').click();
		await expect(page).toHaveURL(room.roomPath, { timeout: DATABASE_TIMEOUT_MS });
		await expect(page.getByRole('heading', { name: /^General Speakers’ List/ })).toBeVisible();
	});
});

test.describe('the mode bar', () => {
	test('marks the selected view and the live one, and counts the motions on the floor', async ({
		page
	}) => {
		const room = await makeRoomInDebate('Frame Mode Bar MUN');
		await proposeCaucus(room, 'Ghana');
		await signIn(page, room.chair);
		await openChairPage(page, room, '/motions');

		const tabs = modeBar(page).getByRole('link', { name: /^(GSL|Motions|Vote)/ });
		await expect(tabs).toHaveCount(3);
		await expect(tabs.nth(0)).toHaveAccessibleName(/^GSL\b.*live$/);
		await expect(tabs.nth(1)).toHaveAccessibleName(/^Motions\b.*1$/);
		await expect(tabs.nth(2)).toHaveAccessibleName(/^Vote/);

		// The view being looked at: dark blue words, a light blue rule, the current page.
		await expect(tabs.nth(1)).toHaveAttribute('aria-current', 'page');
		await expect(tabs.nth(1)).toHaveClass(/text-brand-900/);
		await expect(tabs.nth(1)).toHaveCSS('box-shadow', /inset/);

		// The live view's tab leads to the live room; every other tab to its own route.
		await expect(tabs.nth(0)).toHaveAttribute('href', new RegExp(`${room.roomPath}$`));
		await expect(tabs.nth(2)).toHaveAttribute('href', new RegExp(`${room.roomPath}/voting$`));
	});

	test('while suspended no tab is live and Suspend is gone, but End stays', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name === 'phone', 'On a phone Suspend and End are in the menu.');
		const room = await makeRoomInDebate('Frame Suspended MUN');
		await setRoom(room, {
			mode: 'suspended',
			suspended_at: new Date().toISOString(),
			mode_before_suspension: 'formal_debate'
		});
		await signIn(page, room.chair);
		await openChairPage(page, room, '/motions');

		await expect(modeBar(page).getByRole('link', { name: /live$/ })).toHaveCount(0);
		await expect(modeBar(page).getByRole('button', { name: 'Suspend' })).toHaveCount(0);
		await expect(modeBar(page).getByRole('link', { name: 'End', exact: true })).toBeVisible();
		await expect(liveStripLink(page)).toHaveCount(0);
	});
});

test.describe('viewing is not the same as going live', () => {
	test('opening a tab changes nothing; a co-chair on another view stays while the dot moves', async ({
		page,
		browser
	}, testInfo) => {
		test.skip(testInfo.project.use.javaScriptEnabled === false, 'Realtime needs a script.');
		const room = await makeChairedCommittee('Frame Co-chair MUN');
		await startSessionInDatabase(room);
		await takeRollCall(room, '');
		const coChair = await createTestUser('Frame Co-chair');
		await makeCommitteeChair(coChair, room.committeeId);

		await signIn(page, room.chair);
		const isListening = roomChannelListening(page);
		await openChairPage(page, room, '/motions');
		await isListening;
		await expect(liveStripLink(page)).toHaveCount(0);

		// The co-chair opens the Vote view: nothing about the room changes.
		const coChairContext = await browser.newContext();
		const coChairPage = await coChairContext.newPage();
		await signIn(coChairPage, coChair);
		await openChairPage(coChairPage, room, '');
		await modeBarTab(coChairPage, 'Vote').click();
		await expect(coChairPage).toHaveURL(`${room.roomPath}/voting`, {
			timeout: DATABASE_TIMEOUT_MS
		});
		expect((await readCommitteeState(room.committeeId)).mode).toBe('formal_debate');

		// Somebody is called on the GSL: the chair on Motions stays there, and the strip appears.
		await fillSpeakersList(room, ['France', 'Ghana'], true);
		await expect(liveStripLink(page)).toBeVisible({ timeout: REALTIME_TIMEOUT_MS });
		await expect(page).toHaveURL(`${room.roomPath}/motions`);

		// The room goes to a vote: the dot moves to Vote, and the strip goes.
		await setRoom(room, { mode: 'voting', current_speaker_entry_id: null });
		await expect(modeBarTab(page, 'Vote')).toHaveAccessibleName(/live$/, {
			timeout: REALTIME_TIMEOUT_MS
		});
		await expect(liveStripLink(page)).toHaveCount(0);
		await expect(page).toHaveURL(`${room.roomPath}/motions`);

		await coChairContext.close();
	});

	test("the chair's own Suspend and End session land on the live room from another view", async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name === 'phone', 'On a phone Suspend and End are in the menu.');
		const room = await makeRoomInDebate('Frame Landing MUN');
		await signIn(page, room.chair);

		await openChairPage(page, room, '/motions');
		await modeBar(page).getByRole('button', { name: 'Suspend' }).click();
		await expect(page).toHaveURL(room.roomPath, { timeout: DATABASE_TIMEOUT_MS });
		await waitUntilAnswered(page);
		expect((await readCommitteeState(room.committeeId)).mode).toBe('suspended');

		await openChairPage(page, room, '/voting');
		await modeBar(page).getByRole('link', { name: 'End', exact: true }).click();
		await page.getByRole('button', { name: 'End session' }).click();
		await expect(page).toHaveURL(room.roomPath, { timeout: DATABASE_TIMEOUT_MS });
		// The ended screen (S11): "Session 1 has ended" is the page's heading.
		await expect(page.getByRole('heading', { level: 1, name: 'Session 1 has ended' })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await waitUntilAnswered(page);
		expect((await readCommitteeState(room.committeeId)).current_session_id).toBeNull();
	});
});

test.describe('the live strip', () => {
	test('shows the live clock on another view, leads to the live room, and is not on the live room', async ({
		page
	}) => {
		const room = await makeRoomInDebate('Frame Strip MUN');
		await signIn(page, room.chair);

		await openChairPage(page, room, '');
		await expect(liveStripLink(page)).toHaveCount(0);

		await openChairPage(page, room, '/motions');
		await expect(liveStripLink(page)).toHaveAccessibleName('Live GSL · France · 0:47');
		await expect(liveStripLink(page)).toHaveAttribute('href', new RegExp(`${room.roomPath}$`));
		// The strip's one filled button is the live view's primary (P1).
		const primary = page.getByRole('button', { name: /^Next: Ghana/ });
		await expect(primary).toBeVisible();
		await expect(primary).toHaveClass(/(^|\s)(bg-primary|bg-brand-900)(\s|$)/);
	});

	test('its clock button pauses the live clock and the chair stays where they are', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name === 'phone', 'A phone keeps only the primary.');
		const room = await makeRoomInDebate('Frame Strip Pause MUN');
		await startTheClock(room);
		await signIn(page, room.chair);
		await openChairPage(page, room, '/motions');

		await page.getByRole('button', { name: /^Pause/ }).click();
		await expect(page.getByRole('button', { name: /^Resume/ })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await waitUntilAnswered(page);

		await expect(page).toHaveURL(`${room.roomPath}/motions`);
		const state = await readCommitteeState(room.committeeId);
		expect(state.timer_paused_remaining_seconds).not.toBeNull();
		expect(state.timer_ends_at).toBeNull();
	});
});

test.describe("End's confirmation", () => {
	test('asks in place, with the focus on "Keep going", and Escape puts End back', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name === 'phone', 'On a phone End is in the menu.');
		const hasJavaScript = testInfo.project.use.javaScriptEnabled !== false;
		const room = await makeRoomInDebate('Frame End MUN');
		await signIn(page, room.chair);
		await openChairPage(page, room, '/motions');
		// With a script End asks in place; before the script runs it is the plain link.
		if (hasJavaScript) await waitForConsoleScript(page);

		await modeBar(page).getByRole('link', { name: 'End', exact: true }).click();
		await expect(modeBar(page).getByText('End Session 1?')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(page.getByRole('dialog')).toHaveCount(0);
		const endSession = page.getByRole('button', { name: 'End session' });
		await expect(endSession).toHaveClass(/bg-danger-700/);

		if (!hasJavaScript) {
			// Without a script End is a link to the same page asking for the confirmation.
			await expect(page).toHaveURL(`${room.roomPath}/motions?end=confirm`);
			await page.getByRole('link', { name: 'Keep going' }).click();
			await expect(page).toHaveURL(`${room.roomPath}/motions`);
			return;
		}

		await expect(page.getByRole('link', { name: 'Keep going' })).toBeFocused();
		await page.keyboard.press('Escape');
		const end = modeBar(page).getByRole('link', { name: 'End', exact: true });
		await expect(end).toBeVisible();
		await expect(end).toBeFocused();
		expect((await readCommitteeState(room.committeeId)).current_session_id).not.toBeNull();
	});
});

test.describe('keys', () => {
	// Keys need a script, and a phone has no keyboard.
	test.skip(
		({ javaScriptEnabled, isMobile }) => !javaScriptEnabled || isMobile,
		'Keys need a script and a keyboard.'
	);

	test('the number keys, R, M and ? work from every chair page', async ({ page }) => {
		const room = await makeRoomInDebate('Frame Keys MUN');
		await signIn(page, room.chair);
		await openChairPage(page, room, '/papers');
		await waitForConsoleScript(page);

		await page.keyboard.press('2');
		await expect(page).toHaveURL(`${room.roomPath}/motions`, { timeout: DATABASE_TIMEOUT_MS });
		await page.keyboard.press('6');
		await expect(page).toHaveURL(`${room.roomPath}/voting`, { timeout: DATABASE_TIMEOUT_MS });
		await page.keyboard.press('1');
		await expect(page).toHaveURL(room.roomPath, { timeout: DATABASE_TIMEOUT_MS });
		await page.keyboard.press('r');
		await expect(page).toHaveURL(`${room.roomPath}/roll-call`, { timeout: DATABASE_TIMEOUT_MS });
		// M opens Motions with the cursor in "Raised by" (S6).
		await page.keyboard.press('m');
		await expect(page).toHaveURL(`${room.roomPath}/motions`, { timeout: DATABASE_TIMEOUT_MS });
		await expect(page.getByRole('combobox', { name: 'Raised by' })).toBeFocused();

		// A key typed in a text field is typed, so "?" is pressed from outside it.
		await page.locator('body').click({ position: { x: 5, y: 300 } });
		await page.keyboard.press('?');
		await expect(page.getByText('Start, pause or resume the live clock')).toBeVisible();
	});

	test("N presses the strip's Next from another view; no key acts in a text field", async ({
		page
	}) => {
		const room = await makeRoomInDebate('Frame Keys Next MUN');
		await signIn(page, room.chair);
		await openChairPage(page, room, '/motions');
		await waitForConsoleScript(page);
		await expect(liveStripLink(page)).toBeVisible();

		// In a text field the letters are typed, never pressed.
		const topic = page.getByLabel(/topic/i).first();
		await topic.click();
		await page.keyboard.press('n');
		await expect(topic).toHaveValue('n');
		await page.keyboard.press('Escape');

		await page.locator('body').click({ position: { x: 5, y: 300 } });
		await page.keyboard.press('n');
		await expect(liveStripLink(page)).toHaveAccessibleName(/^Live GSL · Ghana/, {
			timeout: DATABASE_TIMEOUT_MS
		});
		await waitUntilAnswered(page);
		await expect(page).toHaveURL(`${room.roomPath}/motions`);
		// The focus never moved into a text field by itself.
		expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('INPUT');
	});

	test('a key held with Ctrl, Cmd or Alt does nothing', async ({ page }) => {
		const room = await makeRoomInDebate('Frame Keys Modifier MUN');
		await signIn(page, room.chair);
		await openChairPage(page, room, '/motions');
		await waitForConsoleScript(page);

		await page.keyboard.press('Alt+2');
		await page.keyboard.press('Alt+r');
		await expect(page).toHaveURL(`${room.roomPath}/motions`);
	});

	test('a button shows its key on hover, after its label', async ({ page }) => {
		const room = await makeRoomInDebate('Frame Keys Hint MUN');
		await signIn(page, room.chair);
		await openChairPage(page, room, '/motions');
		await waitForConsoleScript(page);

		const next = page.getByRole('button', { name: /^Next: Ghana/ });
		const hint = next.locator('kbd');
		await expect(hint).toBeHidden();
		await next.hover();
		await expect(hint).toBeVisible();
		await expect(hint).toHaveText('N');
		await expect(next).toHaveAttribute('aria-keyshortcuts', 'N');
	});

	test('the switch turns the single keys off for this browser, and Space still acts', async ({
		page
	}) => {
		const room = await makeRoomInDebate('Frame Keys Off MUN');
		await signIn(page, room.chair);
		await openChairPage(page, room, '/motions');
		await waitForConsoleScript(page);

		const menu = await openCommitteeMenu(page);
		await menu.locator('summary', { hasText: 'Keyboard shortcuts' }).click();
		const switchButton = menu.getByRole('button', { name: 'Use keyboard shortcuts' });
		await expect(switchButton).toHaveAttribute('aria-pressed', 'true');
		await switchButton.click();
		await expect(switchButton).toHaveAttribute('aria-pressed', 'false');

		// Still off after a reload, in this browser.
		await openChairPage(page, room, '/motions');
		await waitForConsoleScript(page);
		await page.locator('body').click({ position: { x: 5, y: 300 } });
		await page.keyboard.press('2');
		await page.keyboard.press('r');
		await expect(page).toHaveURL(`${room.roomPath}/motions`);

		// Space is not a single character a speech input could set off, so it still acts.
		await page.keyboard.press(' ');
		await expect(page.getByRole('button', { name: /^Pause/ })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await waitUntilAnswered(page);
	});
});

test('while the connection is down the top bar says "Reconnecting…", and the page catches up', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.use.javaScriptEnabled === false, 'Realtime needs a script.');
	test.skip(testInfo.project.name === 'phone', 'The phone shows the dot alone.');
	const room = await makeRoomInDebate('Frame Reconnect MUN');
	await signIn(page, room.chair);

	// Realtime's socket goes through this stand-in, which can cut it and refuse
	// it again while the test says the connection is down.
	let isDown = false;
	const sockets: WebSocketRoute[] = [];
	await page.routeWebSocket(/\/realtime\//, (socket) => {
		if (isDown) {
			void socket.close();
			return;
		}

		socket.connectToServer();
		sockets.push(socket);
	});

	await openChairPage(page, room, '/motions');
	const banner = page.getByRole('banner');
	await expect(banner.getByText('Connected')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	isDown = true;
	for (const socket of sockets) await socket.close();

	await expect(banner.getByText('Reconnecting…')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	// No separate bar appears for it.
	await expect(page.getByText('Live updates paused')).toHaveCount(0);

	// While it is down the page reads the room again every fifteen seconds.
	await setRoom(room, { mode: 'voting', current_speaker_entry_id: null });
	await expect(modeBarTab(page, 'Vote')).toHaveAccessibleName(/live$/, {
		timeout: PAUSED_CATCH_UP_MS + DATABASE_TIMEOUT_MS
	});

	isDown = false;
	await expect(banner.getByText('Connected')).toBeVisible({ timeout: PAUSED_CATCH_UP_MS * 2 });
});
