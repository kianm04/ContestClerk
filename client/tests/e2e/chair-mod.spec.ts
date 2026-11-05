import { expect, test, type Page } from '@playwright/test';
import { ClickBudgetJourney } from './click-budget';
import {
	DATABASE_TIMEOUT_MS,
	makeChairedCommittee,
	modeBarTab,
	readCommitteeState,
	takeRollCall,
	waitUntilAnswered,
	type ChairedCommittee
} from './chair-room-fixtures';
import {
	floorSpeaker as gslSpeaker,
	gslPath,
	queueColumn,
	seedWaiting,
	setSpeakerClock,
	startSessionDirectly,
	waitingRows
} from './gsl-fixtures';
import { skipWithoutJavaScript } from './in-place';
import {
	caucusTimer,
	expectLandedOn,
	modeFloor,
	openView,
	openVoteDirectly,
	proposeMotionDirectly,
	readActiveList,
	readListEntries,
	readMotions,
	seatIdsByName,
	postFromPage,
	setCaucusClock,
	speakerClock,
	spokenLine,
	startModDirectly,
	viewPath,
	waitForPageScript
} from './mode-fixtures';
import { expectNoSidewaysOverflow, saveFullPageScreenshot } from './page-shape';
import { signIn } from './signed-in-user';

// The acceptance criteria of `specs/05-pages/chair/mod.md` tagged (S7) that
// need a real browser: the start form, the running caucus with its two
// clocks, recognising, the time running out, ending it, the keys, the sizes,
// the fallbacks without JavaScript and the two click budgets. A test runs on
// all three projects unless it needs JavaScript (the combobox, the keys, the
// clocks moving) or one window size. The session is started straight in the
// database (`startSessionDirectly`), and so, where a test begins inside a
// caucus, is the caucus (`startModDirectly`).

/** The floor of the running caucus, named by its title. */
function modFloor(page: Page) {
	return modeFloor(page, /^Moderated caucus/);
}

/** The speaker's name, written large on the Mod view's floor. */
function modSpeaker(page: Page, seatName: string) {
	return modFloor(page).getByText(seatName, { exact: true });
}

/** Start a session, sign the chair in and open the Mod view's start form. */
async function openStartForm(page: Page, room: ChairedCommittee): Promise<void> {
	await startSessionDirectly(room);
	await signIn(page, room.chair);
	await openView(page, viewPath(room, 'mod'));
	await expect(page.getByRole('heading', { name: 'Start a moderated caucus' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
}

/**
 * Start a session with a moderated caucus running on "Corridors" (10:00, 1:00
 * each), `waiting` on its list and the first of them, when `isFirstSpeaking`,
 * on the floor with the clock ready. Signs the chair in and opens the view.
 */
async function openRunningCaucus(
	page: Page,
	room: ChairedCommittee,
	waiting: string[],
	isFirstSpeaking = true
): Promise<void> {
	await startSessionDirectly(room);
	await startModDirectly(room, {
		topic: 'Corridors',
		totalSeconds: 600,
		speakingSeconds: 60,
		caucusClock: { pausedAtSeconds: 600 }
	});
	if (waiting.length > 0) await seedWaiting(room, waiting);
	await signIn(page, room.chair);
	await openView(page, viewPath(room, 'mod'));
	await expect(modFloor(page)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	if (!isFirstSpeaking) return;

	await page.getByRole('button', { name: `Call ${waiting[0]}` }).click();
	await expect(modSpeaker(page, waiting[0])).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await waitUntilAnswered(page);
}

/** Choose who raised it: the combobox with JavaScript, the `<select>` without. */
async function chooseRaisedBy(page: Page, seatName: string, isScripted: boolean): Promise<void> {
	if (!isScripted) {
		await page.getByLabel('Raised by').selectOption({ label: seatName });
		return;
	}

	const box = page.getByRole('combobox', { name: 'Raised by' });
	await box.click();
	await box.fill(seatName);
	await box.press('Enter');
	await expect(box).toHaveValue(seatName);
}

test.describe('the start form', () => {
	test('asks for the topic, the total, each speaker’s time and who raised it, with one filled button', async ({
		page
	}) => {
		const room = await makeChairedCommittee('Mod Form MUN');

		await openStartForm(page, room);

		await expect(page.getByLabel('Topic')).toBeVisible();
		await expect(page.getByLabel('Total')).toHaveAttribute('placeholder', '10:00');
		await expect(page.getByLabel('Each speaker')).toHaveAttribute('placeholder', '1:30');
		await expect(page.getByText('optional')).toBeVisible();
		// The mode bar has a "Motions" too; this is the form's own link. The
		// server writes links relative, so only the end of the address is checked.
		const motions = page.getByRole('main').getByRole('link', { name: 'Motions', exact: true });
		await expect(motions).toHaveAttribute('href', new RegExp(`${room.roomPath}/motions$`));
		await expect(page.getByText('To put it to a vote first, record it in')).toBeVisible();
		const filled = page.locator('main button:is(.bg-primary, .bg-brand-900)');
		await expect(filled).toHaveCount(1);
		await expect(filled).toHaveText('Start caucus');
	});

	test('"Start caucus" records a passed caucus started without a vote, leaving the floor’s motions be', async ({
		page
	}, testInfo) => {
		const room = await makeChairedCommittee('Mod Start MUN');
		const isScripted = testInfo.project.use.javaScriptEnabled !== false;

		await openStartForm(page, room);
		const onTheFloor = await proposeMotionDirectly(room);
		await page.getByLabel('Topic').fill('Opening humanitarian corridors');
		await page.getByLabel('Total').fill('12');
		await page.getByLabel('Each speaker').fill('1:00');
		await chooseRaisedBy(page, 'Ghana', isScripted);
		await page.getByRole('button', { name: 'Start caucus' }).click();

		await expect(modFloor(page)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await expect(page.getByText('raised by Ghana · started without a vote')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await waitUntilAnswered(page);
		expect(new URL(page.url()).pathname).toBe(viewPath(room, 'mod'));

		const seats = await seatIdsByName(room);
		const motions = await readMotions(room);
		const caucus = motions.find((motion) => motion.kind === 'moderated_caucus');
		expect(caucus).toMatchObject({
			status: 'passed',
			topic: 'Opening humanitarian corridors',
			total_time_seconds: 720,
			speaking_time_seconds: 60,
			proposed_by_seat_id: seats.Ghana,
			started_without_vote: true
		});
		expect(motions.find((motion) => motion.id === onTheFloor)?.status).toBe('proposed');

		const state = await readCommitteeState(room.committeeId);
		expect(state).toMatchObject({
			mode: 'moderated_caucus',
			caucus_total_seconds: 720,
			caucus_ends_at: null,
			caucus_paused_remaining_seconds: 720
		});

		// Motions' "Decided this session" marks it too.
		await page.goto(`${room.roomPath}/motions`);
		await expect(page.getByText(/started without a vote/).first()).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
	});

	test('the chair raises it when "Raised by" is left alone, and a refused form keeps what was typed', async ({
		page
	}) => {
		const room = await makeChairedCommittee('Mod Refused MUN');

		await openStartForm(page, room);
		await page.getByLabel('Total').fill('90');
		await page.getByRole('button', { name: 'Start caucus' }).click();

		await expect(page.getByText('A moderated caucus needs a topic.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(page.getByText('Total time must be between 1 and 60 minutes.')).toBeVisible();
		await expect(page.getByLabel('Total')).toHaveValue('90');

		await page.getByLabel('Topic').fill('Corridors');
		await page.getByLabel('Total').fill('10');
		await page.getByRole('button', { name: 'Start caucus' }).click();
		await expect(page.getByText('raised by the chair · started without a vote')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await waitUntilAnswered(page);
		const caucus = (await readMotions(room)).find((motion) => motion.kind === 'moderated_caucus');
		expect(caucus?.proposed_by_seat_id).toBeNull();
	});

	test('starting ends a GSL speech in progress, and the GSL’s waiting speakers keep their places', async ({
		page
	}) => {
		const room = await makeChairedCommittee('Mod Ends Speech MUN');
		await startSessionDirectly(room);
		await seedWaiting(room, ['France', 'Ghana', 'Japan']);
		await signIn(page, room.chair);
		await openView(page, gslPath(room));
		await page.getByRole('button', { name: 'Call France' }).click();
		await expect(gslSpeaker(page, 'France')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await waitUntilAnswered(page);
		await setSpeakerClock(room, { pausedAtSeconds: 50 });

		await openView(page, viewPath(room, 'mod'));
		await page.getByLabel('Topic').fill('Corridors');
		await page.getByRole('button', { name: 'Start caucus' }).click();
		await expect(modFloor(page)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await waitUntilAnswered(page);

		// The GSL is no longer the active list, but keeps its speakers for when the caucus ends.
		await page.goto(gslPath(room));
		await expect(waitingRows(page)).toHaveCount(2, { timeout: DATABASE_TIMEOUT_MS });
		await expect(waitingRows(page).first()).toContainText('Ghana');
		await expect(waitingRows(page).nth(1)).toContainText('Japan');
		await expect(spokenLine(queueColumn(page))).toContainText('France 0:40');
	});

	test('while an Unmod is live the form says what starting ends, and replaces it', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop', 'One project is enough for the sentence.');
		const room = await makeChairedCommittee('Mod Replaces MUN');
		await startSessionDirectly(room);
		await signIn(page, room.chair);
		await openView(page, viewPath(room, 'unmod'));
		await page.getByRole('button', { name: 'Start caucus' }).click();
		await expect(page.getByRole('heading', { name: /^Unmoderated caucus/ })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await waitUntilAnswered(page);

		await openView(page, viewPath(room, 'mod'));
		await expect(page.getByText('Starting this ends the unmoderated caucus.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await page.getByLabel('Topic').fill('Corridors');
		await page.getByRole('button', { name: 'Start caucus' }).click();
		await expect(modFloor(page)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await waitUntilAnswered(page);
		const motions = await readMotions(room);
		expect(motions.map((motion) => [motion.kind, motion.status])).toEqual([
			['unmoderated_caucus', 'passed'],
			['moderated_caucus', 'passed']
		]);
	});

	test('while a vote is open "Start caucus" is disabled, and the server refuses with the same words', async ({
		page
	}, testInfo) => {
		const room = await makeChairedCommittee('Mod Vote Open MUN');

		await openStartForm(page, room);
		await openVoteDirectly(room);
		await page.reload();

		await expect(page.getByRole('button', { name: 'Start caucus' })).toBeDisabled({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(page.getByText('Close the open vote first.')).toBeVisible();

		if (testInfo.project.name !== 'desktop') return;

		// A stale page's post is refused with the same sentence.
		const answer = await postFromPage(page, `${viewPath(room, 'mod')}?/startModerated`, {
			topic: 'Corridors'
		});
		expect(answer).toContain('Close the open vote first.');
		expect((await readMotions(room)).some((motion) => motion.kind === 'moderated_caucus')).toBe(
			false
		);
	});
});

test.describe('the running caucus', () => {
	test('has two clocks: the caucus line above the speaker, and the GSL’s controls without Yield', async ({
		page
	}) => {
		const room = await makeChairedCommittee('Mod Two Clocks MUN');

		await openRunningCaucus(page, room, ['France', 'Ghana']);

		await expect(page.getByRole('heading', { name: 'Moderated caucus · Corridors' })).toBeVisible();
		await expect(caucusTimer(page)).toHaveText(/Caucus\s*10:00\s*left of 10:00/);
		await expect(page.getByRole('button', { name: 'Extend +5:00' })).toBeVisible();
		await expect(modFloor(page).getByRole('button', { name: 'End caucus' })).toBeVisible();
		await expect(speakerClock(page)).toHaveText('1:00');
		for (const name of ['Start', '+15 s', 'End speech']) {
			await expect(modFloor(page).getByRole('button', { name })).toBeVisible();
		}
		await expect(modFloor(page).locator('summary', { hasText: 'Yield' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Next: Ghana' })).toBeVisible();
		await expect(queueColumn(page)).toHaveCount(0);
		await expect(page.getByRole('complementary', { name: 'Caucus speakers' })).toBeVisible();
		// The one filled button is "Next"; the caucus line's two are outlined.
		await expect(page.locator('main button:is(.bg-primary, .bg-brand-900)')).toHaveCount(1);
	});

	test('the caucus clock runs only while the speaker’s runs, in a second browser too', async ({
		page,
		browser
	}, testInfo) => {
		skipWithoutJavaScript(testInfo);
		test.skip(testInfo.project.name !== 'desktop', 'One project is enough for the clocks.');
		const room = await makeChairedCommittee('Mod Clocks MUN');

		await openRunningCaucus(page, room, ['France', 'Ghana']);
		const other = await browser.newContext();
		const otherPage = await other.newPage();
		await signIn(otherPage, room.chair);
		await otherPage.goto(viewPath(room, 'mod'));
		await expect(caucusTimer(otherPage)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

		await modFloor(page).getByRole('button', { name: 'Start' }).click();
		await waitUntilAnswered(page);
		let state = await readCommitteeState(room.committeeId);
		expect(state.timer_ends_at).not.toBeNull();
		expect(state.caucus_ends_at).not.toBeNull();
		await expect(caucusTimer(otherPage)).toHaveText(/Caucus\s*9:5\d/, { timeout: 3_000 });
		await expect(speakerClock(otherPage)).toHaveText(/^0:5\d$/, { timeout: 1_500 });

		await modFloor(page).getByRole('button', { name: '+15 s' }).click();
		await waitUntilAnswered(page);
		state = await readCommitteeState(room.committeeId);
		expect(state.caucus_ends_at).not.toBeNull();

		await modFloor(page).getByRole('button', { name: 'Pause' }).click();
		await waitUntilAnswered(page);
		state = await readCommitteeState(room.committeeId);
		expect(state.timer_ends_at).toBeNull();
		expect(state.caucus_ends_at).toBeNull();
		expect(state.caucus_paused_remaining_seconds).toBeGreaterThan(590);
		await expect(otherPage.getByRole('button', { name: 'Resume' })).toBeVisible({ timeout: 1_500 });

		await other.close();
	});

	test('"Next" gives the called seat the caucus’s speaking time, ready, and leaves the total alone', async ({
		page
	}) => {
		const room = await makeChairedCommittee('Mod Next MUN');

		await openRunningCaucus(page, room, ['France', 'Ghana']);
		await page.getByRole('button', { name: 'Next: Ghana' }).click();

		await expect(modSpeaker(page, 'Ghana')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await expect(speakerClock(page)).toHaveText('1:00');
		await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
		await waitUntilAnswered(page);
		const state = await readCommitteeState(room.committeeId);
		expect(state).toMatchObject({
			timer_total_seconds: 60,
			timer_ends_at: null,
			timer_paused_remaining_seconds: 60,
			caucus_total_seconds: 600,
			caucus_ends_at: null
		});
	});

	test('"Extend +5:00" adds five minutes, paused or running, and records no motion', async ({
		page
	}) => {
		const room = await makeChairedCommittee('Mod Extend MUN');

		await openRunningCaucus(page, room, ['France']);
		await page.getByRole('button', { name: 'Extend +5:00' }).click();

		await expect(caucusTimer(page)).toHaveText(/15:00\s*left of 15:00/, {
			timeout: DATABASE_TIMEOUT_MS
		});
		await waitUntilAnswered(page);
		let state = await readCommitteeState(room.committeeId);
		expect(state.caucus_total_seconds).toBe(900);
		expect(state.caucus_paused_remaining_seconds).toBe(900);

		await setCaucusClock(room, { runsForSeconds: 300 });
		await page.reload();
		await waitForPageScript(page);
		await page.getByRole('button', { name: 'Extend +5:00' }).click();
		await waitUntilAnswered(page);
		state = await readCommitteeState(room.committeeId);
		expect(state.caucus_total_seconds).toBe(1200);
		expect(state.caucus_ends_at).not.toBeNull();
		expect((await readMotions(room)).map((motion) => motion.kind)).toEqual(['moderated_caucus']);
	});

	test('recognising gives an empty floor to the seat at once, and queues it while someone speaks', async ({
		page
	}, testInfo) => {
		skipWithoutJavaScript(testInfo);
		const room = await makeChairedCommittee('Mod Recognise MUN');

		await openRunningCaucus(page, room, [], false);
		const box = page.getByRole('combobox', { name: 'Recognise a delegation' });
		await box.click();
		await expect(page.getByRole('option', { name: /Ghana\s*gets the floor/ })).toBeVisible();
		await box.fill('Gha');
		await box.press('Enter');

		await expect(modSpeaker(page, 'Ghana')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await expect(speakerClock(page)).toHaveText('1:00');
		await waitUntilAnswered(page);

		await box.fill('Jap');
		await box.press('Enter');
		await expect(waitingRows(page).filter({ hasText: 'Japan' })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await waitUntilAnswered(page);
		const list = await readActiveList(room);
		const entries = await readListEntries(list.id);
		expect(entries.map((entry) => [entry.name, entry.status])).toEqual([
			['Ghana', 'speaking'],
			['Japan', 'waiting']
		]);
	});

	test('an absent seat offers "absent · Mark present", which marks it present and queues it', async ({
		page
	}, testInfo) => {
		skipWithoutJavaScript(testInfo);
		const room = await makeChairedCommittee('Mod Absent MUN');

		await startSessionDirectly(room);
		await takeRollCall(room, 'Japan');
		await startModDirectly(room, {
			topic: 'Corridors',
			totalSeconds: 600,
			speakingSeconds: 60,
			caucusClock: { pausedAtSeconds: 600 }
		});
		await seedWaiting(room, ['France']);
		await signIn(page, room.chair);
		await openView(page, viewPath(room, 'mod'));
		await page.getByRole('button', { name: 'Call France' }).click();
		await waitUntilAnswered(page);

		const box = page.getByRole('combobox', { name: 'Recognise a delegation' });
		await box.click();
		await box.fill('Jap');
		await expect(page.getByRole('option', { name: /Japan\s*absent · Mark present/ })).toBeVisible();
		await box.press('Enter');

		await expect(waitingRows(page).filter({ hasText: 'Japan' })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await waitUntilAnswered(page);
		const list = await readActiveList(room);
		expect((await readListEntries(list.id)).map((entry) => entry.name)).toContain('Japan');
	});

	test('when the time is up, "End caucus" is the primary, Next is gone, and the speaker may finish', async ({
		page
	}) => {
		const room = await makeChairedCommittee('Mod Time Up MUN');

		await openRunningCaucus(page, room, ['France', 'Ghana']);
		await setSpeakerClock(room, { runsForSeconds: 50 });
		await setCaucusClock(room, { pausedAtSeconds: 0 });
		await page.reload();

		await expect(page.getByText('Caucus time is up')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await expect(page.getByText('The speaker may finish')).toBeVisible();
		await expect(page.getByRole('button', { name: /^Next/ })).toHaveCount(0);
		const end = modFloor(page).getByRole('button', { name: 'End caucus' });
		await expect(end).toHaveCount(1);
		await expect(end).toHaveClass(/(^|\s)(bg-primary|bg-brand-900)(\s|$)/);
		await expect(page.getByRole('button', { name: 'Extend +5:00' })).toBeVisible();
		// Nothing ends by itself: the speaker's clock still runs.
		const state = await readCommitteeState(room.committeeId);
		expect(state.timer_ends_at).not.toBeNull();
		expect(state.mode).toBe('moderated_caucus');
	});

	test('"End caucus" records the speech, clears both clocks and returns the chair to the live room on the GSL', async ({
		page
	}) => {
		const room = await makeChairedCommittee('Mod End MUN');
		await startSessionDirectly(room);
		await seedWaiting(room, ['Japan']);
		await startModDirectly(room, {
			topic: 'Corridors',
			totalSeconds: 600,
			speakingSeconds: 60,
			caucusClock: { pausedAtSeconds: 500 }
		});
		await seedWaiting(room, ['France', 'Ghana']);
		await signIn(page, room.chair);
		await openView(page, viewPath(room, 'mod'));
		await page.getByRole('button', { name: 'Call France' }).click();
		await waitUntilAnswered(page);
		await setSpeakerClock(room, { pausedAtSeconds: 20 });
		const caucusList = await readActiveList(room);

		await modFloor(page).getByRole('button', { name: 'End caucus' }).click();

		await expectLandedOn(page, room.roomPath);
		await expect(page.getByRole('heading', { name: /General Speakers’ List/ })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await waitUntilAnswered(page);
		const state = await readCommitteeState(room.committeeId);
		expect(state).toMatchObject({
			mode: 'formal_debate',
			current_motion_id: null,
			current_speaker_entry_id: null,
			timer_total_seconds: null,
			caucus_total_seconds: null,
			caucus_ends_at: null,
			caucus_paused_remaining_seconds: null
		});
		const spoken = (await readListEntries(caucusList.id)).find((entry) => entry.name === 'France');
		expect(spoken).toMatchObject({ status: 'spoken' });
		expect(spoken?.spokeSeconds).toBeGreaterThanOrEqual(30);
		await expect(waitingRows(page).filter({ hasText: 'Japan' })).toBeVisible();
	});
});

test.describe('keys', () => {
	test('Space, N, E, + and / act on the caucus; none acts in a text field', async ({
		page
	}, testInfo) => {
		skipWithoutJavaScript(testInfo);
		test.skip(testInfo.project.name !== 'desktop', 'Keys are a laptop’s.');
		const room = await makeChairedCommittee('Mod Keys MUN');

		await openRunningCaucus(page, room, ['France', 'Ghana', 'Japan']);
		await page.locator('body').click({ position: { x: 5, y: 5 } });

		await page.keyboard.press(' ');
		await expect(modFloor(page).getByRole('button', { name: 'Pause' })).toBeVisible();
		await waitUntilAnswered(page);
		expect((await readCommitteeState(room.committeeId)).caucus_ends_at).not.toBeNull();

		// Space in the empty "Recognise a delegation…" pauses both clocks. The
		// clock runs for a moment first: one paused within its first second
		// still holds its full time, which reads "Start" as on the GSL.
		await expect(speakerClock(page)).toHaveText(/^0:5[0-8]$/);
		await page.keyboard.press('/');
		const box = page.getByRole('combobox', { name: 'Recognise a delegation' });
		await expect(box).toBeFocused();
		await page.keyboard.press(' ');
		await expect(modFloor(page).getByRole('button', { name: 'Resume' })).toBeVisible();
		await expect(box).toHaveValue('');
		await waitUntilAnswered(page);
		expect((await readCommitteeState(room.committeeId)).caucus_ends_at).toBeNull();
		await page.keyboard.press('Escape');
		await page.keyboard.press('Escape');
		await page.locator('body').click({ position: { x: 5, y: 5 } });

		await page.keyboard.press('+');
		await waitUntilAnswered(page);
		await page.keyboard.press('n');
		await expect(modSpeaker(page, 'Ghana')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await waitUntilAnswered(page);
		await page.keyboard.press('e');
		await expect(page.getByText('Nobody has the floor')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await waitUntilAnswered(page);

		await page.keyboard.press('/');
		await expect(box).toBeFocused();
		await box.press('n');
		await expect(box).toHaveValue('n');
		await expect(page.getByRole('button', { name: 'Call Japan' })).toBeVisible();
	});
});

test.describe('sizes', () => {
	test('at 1280 × 800 the caucus line, the speaker, the clock, the controls and the list fit', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop', 'One laptop-sized project is enough.');
		const room = await makeChairedCommittee('Mod Fits MUN');

		await openRunningCaucus(page, room, ['France', 'Ghana', 'Japan']);

		const shape = await page.evaluate(() => {
			const main = document.querySelector('main');

			return {
				page: document.documentElement.scrollHeight - window.innerHeight,
				main: main ? main.scrollHeight - main.clientHeight : 0
			};
		});
		expect(shape.page).toBeLessThanOrEqual(0);
		expect(shape.main).toBeLessThanOrEqual(1);
		const fontSize = await speakerClock(page).evaluate((element) =>
			parseFloat(getComputedStyle(element).fontSize)
		);
		expect(fontSize).toBeLessThanOrEqual(168);
		await expect(page.getByRole('button', { name: 'Next: Ghana' })).toBeInViewport();
		await saveFullPageScreenshot(page, 'chair-mod');
	});

	test('at 1024 × 768 the column keeps 320px, the clock shrinks and the caucus line stays one row', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop', 'One project can change its window.');
		const room = await makeChairedCommittee('Mod Narrow MUN');

		await openRunningCaucus(page, room, ['France', 'Ghana']);
		const wide = await speakerClock(page).evaluate((element) =>
			parseFloat(getComputedStyle(element).fontSize)
		);

		await page.setViewportSize({ width: 1024, height: 768 });
		const column = await page.getByRole('complementary', { name: 'Caucus speakers' }).boundingBox();
		expect(column?.width ?? 0).toBeGreaterThanOrEqual(320);
		const narrow = await speakerClock(page).evaluate((element) =>
			parseFloat(getComputedStyle(element).fontSize)
		);
		expect(narrow).toBeLessThan(wide);
		const timerBox = await caucusTimer(page).boundingBox();
		const extendBox = await page.getByRole('button', { name: 'Extend +5:00' }).boundingBox();
		expect(Math.abs((timerBox?.y ?? 0) - (extendBox?.y ?? 0))).toBeLessThan(20);
		await expectNoSidewaysOverflow(page);
	});

	test('on a 390 phone the view is one column, the controls stick, and targets are 44px', async ({
		page
	}, testInfo) => {
		test.skip(
			testInfo.project.name !== 'phone',
			'Only the phone project has a phone-sized window.'
		);
		const room = await makeChairedCommittee('Mod Phone MUN');

		await openRunningCaucus(page, room, ['France', 'Ghana', 'Japan']);

		const footer = modFloor(page).locator('footer');
		expect(await footer.evaluate((element) => getComputedStyle(element).position)).toBe('sticky');
		const next = page.getByRole('button', { name: 'Next: Ghana' });
		expect((await next.boundingBox())?.width ?? 0).toBeGreaterThan(390 - 40);
		// Title, caucus line (its buttons under its bar), speaker, clock, then the list.
		const timerBox = await caucusTimer(page).boundingBox();
		const extendBox = await page.getByRole('button', { name: 'Extend +5:00' }).boundingBox();
		const clockBox = await speakerClock(page).boundingBox();
		const columnBox = await page
			.getByRole('complementary', { name: 'Caucus speakers' })
			.boundingBox();
		expect(extendBox?.y ?? 0).toBeGreaterThan(timerBox?.y ?? 0);
		expect(clockBox?.y ?? 0).toBeGreaterThan(extendBox?.y ?? 0);
		expect(columnBox?.y ?? 0).toBeGreaterThan(clockBox?.y ?? 0);

		const targets = [
			page.getByRole('button', { name: 'Extend +5:00' }),
			page.getByRole('button', { name: 'End caucus' }),
			footer
				.getByRole('button', { name: 'Pause' })
				.or(footer.getByRole('button', { name: 'Start' })),
			footer.getByRole('button', { name: '+15 s' }),
			footer.getByRole('button', { name: 'End speech' }),
			next
		];
		for (const target of targets) {
			expect((await target.first().boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
		}

		await saveFullPageScreenshot(page, 'chair-mod');
		await expectNoSidewaysOverflow(page);
	});
});

test.describe('without JavaScript', () => {
	test('the start form, Recognise, Extend, the clock, Next, End speech and End caucus all post and reload', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop-no-js', 'This is the fallback’s own test.');
		const room = await makeChairedCommittee('Mod No Script MUN');

		await openStartForm(page, room);
		await page.getByLabel('Topic').fill('Corridors');
		await page.getByLabel('Raised by').selectOption({ label: 'The chair' });
		await page.getByRole('button', { name: 'Start caucus' }).click();
		await expect(modFloor(page)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

		// "Recognise" is a `<select>` and a button; over an empty floor the seat takes it.
		await page.getByLabel('Recognise a delegation').selectOption({ label: 'France' });
		await page.getByRole('button', { name: 'Recognise', exact: true }).click();
		await expect(modSpeaker(page, 'France')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await page.getByLabel('Recognise a delegation').selectOption({ label: 'Ghana' });
		await page.getByRole('button', { name: 'Recognise', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Next: Ghana' })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		await page.getByRole('button', { name: 'Extend +5:00' }).click();
		await expect(caucusTimer(page)).toHaveText(/15:00/, { timeout: DATABASE_TIMEOUT_MS });
		await modFloor(page).getByRole('button', { name: 'Start' }).click();
		await expect(modFloor(page).getByRole('button', { name: 'Pause' })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await page.getByRole('button', { name: 'Next: Ghana' }).click();
		await expect(modSpeaker(page, 'Ghana')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await modFloor(page).getByRole('button', { name: 'End speech' }).click();
		await expect(page.getByText('Recognise a delegation to speak')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await modFloor(page).getByRole('button', { name: 'End caucus' }).click();
		await expectLandedOn(page, room.roomPath);
		expect((await readCommitteeState(room.committeeId)).mode).toBe('formal_debate');
	});
});

test.describe('click budgets', () => {
	test('starting a moderated caucus directly: Mod, the topic, "Start caucus"', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name === 'desktop-no-js', 'The budget is measured at 1280 and 390.');
		const room = await makeChairedCommittee('Mod Budget MUN');
		await startSessionDirectly(room);
		await seedWaiting(room, ['France']);
		await signIn(page, room.chair);
		await openView(page, gslPath(room));
		await expect(modeBarTab(page, 'Mod')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

		const journey = ClickBudgetJourney.fromPage(page);
		await journey.click(modeBarTab(page, 'Mod'));
		await journey.type(page.getByLabel('Topic'), 'Opening humanitarian corridors');
		await journey.click(page.getByRole('button', { name: 'Start caucus' }));
		await expect(modFloor(page)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

		// The journey counts the GSL view it starts on as its first page; the
		// budget's one page is the Mod view (`chair-gsl.spec.ts` counts alike).
		journey.expectWithinBudget({ clicks: 2, pages: 2, typedFields: 1, decisions: 0 });
		await waitUntilAnswered(page);
	});

	test('calling the next speaker in a moderated caucus: one press on the floor, the strip or N', async ({
		page
	}, testInfo) => {
		const room = await makeChairedCommittee('Mod Next Budget MUN');

		await openRunningCaucus(page, room, ['France', 'Ghana', 'Japan']);
		const journey = ClickBudgetJourney.fromPage(page);
		await journey.click(page.getByRole('button', { name: 'Next: Ghana' }));
		await expect(modSpeaker(page, 'Ghana')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		journey.expectWithinBudget({ clicks: 1, pages: 1, typedFields: 0, decisions: 0 });
		await waitUntilAnswered(page);

		if (testInfo.project.name !== 'desktop') return;

		// From Motions, the live strip's "Next" calls the next seat and the chair stays there.
		await openView(page, `${room.roomPath}/motions`);
		const strip = page.getByRole('button', { name: /^Next: Japan/ });
		await expect(strip).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		const stripJourney = ClickBudgetJourney.fromPage(page);
		await stripJourney.click(strip);
		await expect
			.poll(async () => (await readCommitteeState(room.committeeId)).current_speaker_entry_id, {
				timeout: DATABASE_TIMEOUT_MS
			})
			.not.toBeNull();
		stripJourney.expectWithinBudget({ clicks: 1, pages: 1, typedFields: 0, decisions: 0 });
		expect(new URL(page.url()).pathname).toBe(`${room.roomPath}/motions`);
	});
});
