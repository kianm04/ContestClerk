import { expect, test, type Page } from '@playwright/test';
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
	floorSpeaker as gslSpeaker,
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
	readActiveList,
	readListEntries,
	readMotions,
	speakerClock,
	startModDirectly,
	viewPath,
	waitForPageScript
} from './mode-fixtures';
import { expectNoSidewaysOverflow, saveFullPageScreenshot } from './page-shape';
import { signIn } from './signed-in-user';

// The acceptance criteria of `specs/05-pages/chair/single-speaker.md` tagged
// (S9) that need a real browser: the start form and its refusals, a seat or a
// typed name on the floor, "Also speaking", "Return to GSL", the keys, the
// sizes, the fallbacks without JavaScript and the click budget for "Next".

/** The Single speaker view's floor, named by its title. */
function singleFloor(page: Page) {
	return modeFloor(page, /^Single speaker/);
}

/** The speaker's name, written large on the Single speaker view's floor. */
function singleSpeaker(page: Page, name: string) {
	return singleFloor(page).getByText(name, { exact: true });
}

/** "Also speaking", the single speaker's own short list. */
function alsoSpeaking(page: Page) {
	return page.getByRole('complementary', { name: 'Also speaking' });
}

/** Start a session with `waiting` on the GSL, sign the chair in and open the start form. */
async function openSingle(
	page: Page,
	room: ChairedCommittee,
	waiting: string[] = []
): Promise<void> {
	await startSessionDirectly(room);
	if (waiting.length > 0) await seedWaiting(room, waiting);
	await signIn(page, room.chair);
	await openView(page, viewPath(room, 'single'));
	await expect(page.getByRole('heading', { name: 'Give one speaker the floor' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
}

/**
 * Choose who: with JavaScript through the combobox (a seat by its name, or a
 * typed name through "Use “…”"), without it through the `<select>` or the
 * name field.
 */
async function chooseWho(
	page: Page,
	isScripted: boolean,
	who: string,
	isSeat: boolean
): Promise<void> {
	if (!isScripted) {
		if (isSeat) await page.getByLabel('Who').selectOption({ label: who });
		else await page.getByLabel('or a name').fill(who);
		return;
	}

	const box = page.getByRole('combobox', { name: 'Who' });
	await box.click();
	await box.fill(who);
	if (!isSeat)
		await expect(page.getByRole('option', { name: new RegExp(`Use “${who}”`) })).toBeVisible();
	await box.press('Enter');
	await expect(box).toHaveValue(who);
}

/** Choose one of the purposes or times, drawn as labels around their radio buttons. */
async function choose(page: Page, words: string): Promise<void> {
	await page.locator('label', { hasText: words }).first().click();
}

/** Press "Give the floor" and wait for the running view. */
async function giveTheFloor(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Give the floor' }).click();
	await expect(singleFloor(page)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await waitUntilAnswered(page);
}

/** Add a seat to "Also speaking": the combobox with JavaScript, the `<select>` and "Add" without. */
async function addAlsoSpeaking(page: Page, isScripted: boolean, seatName: string): Promise<void> {
	const column = alsoSpeaking(page);

	if (isScripted) {
		const box = column.getByRole('combobox', { name: 'Add a speaker' });
		await box.click();
		await box.fill(seatName);
		await box.press('Enter');
	} else {
		await column.getByLabel('Add a speaker').selectOption({ label: seatName });
		await column.getByRole('button', { name: 'Add', exact: true }).click();
	}

	await expect(waitingRows(page).filter({ hasText: seatName })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(page);
}

test.describe('the start form', () => {
	test('asks who, why and for how long, with no purpose and 1:00 chosen, and one filled button', async ({
		page
	}, testInfo) => {
		const room = await makeChairedCommittee('Single Form MUN');

		await openSingle(page, room);

		for (const purpose of ['Right of reply', 'Presentation', 'Explanation of vote', 'Other…']) {
			await expect(page.getByRole('radio', { name: purpose })).not.toBeChecked();
		}
		await expect(page.getByRole('radio', { name: '1:00' })).toBeChecked();
		for (const time of ['0:30', '2:00', '3:00', '5:00']) {
			await expect(page.getByRole('radio', { name: time })).not.toBeChecked();
		}
		await expect(page.getByRole('textbox', { name: 'Other time' })).toBeVisible();
		await expect(page.getByText('“Secretary-General” works too')).toBeVisible();
		await expect(
			page.getByText('The purpose shows on delegates’ phones and on the projector.')
		).toBeVisible();
		const filled = page.locator('main button:is(.bg-primary, .bg-brand-900)');
		await expect(filled).toHaveCount(1);
		await expect(filled).toHaveText('Give the floor');

		if (testInfo.project.use.javaScriptEnabled === false) {
			// Without JavaScript: a `<select>` of the present seats beside "or a name".
			await expect(page.getByLabel('Who')).toHaveJSProperty('tagName', 'SELECT');
			await expect(page.getByLabel('or a name')).toBeVisible();
			await expect(page.getByLabel('Other purpose')).toBeVisible();
		} else {
			await expect(page.getByRole('combobox', { name: 'Who' })).toBeVisible();
			await choose(page, 'Other…');
			await expect(page.getByRole('textbox', { name: 'Other purpose' })).toBeVisible();
		}
	});

	test('"Give the floor" puts a seat on a list of its own, clock ready, ending the GSL speech', async ({
		page
	}, testInfo) => {
		const room = await makeChairedCommittee('Single Seat MUN');
		const isScripted = testInfo.project.use.javaScriptEnabled !== false;

		await openSingle(page, room, ['France', 'Ghana']);
		await openView(page, gslPath(room));
		await page.getByRole('button', { name: 'Call France' }).click();
		await expect(gslSpeaker(page, 'France')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await waitUntilAnswered(page);
		await setSpeakerClock(room, { pausedAtSeconds: 50 });
		const gsl = await readActiveList(room);

		await openView(page, viewPath(room, 'single'));
		await chooseWho(page, isScripted, 'Japan', true);
		await choose(page, 'Right of reply');
		await choose(page, '2:00');
		await giveTheFloor(page);

		await expect(
			page.getByRole('heading', { name: 'Single speaker · Right of reply · 2:00' })
		).toBeVisible();
		await expect(singleSpeaker(page, 'Japan')).toBeVisible();
		await expect(speakerClock(page)).toHaveText('2:00');
		await expect(singleFloor(page).getByRole('button', { name: 'Start' })).toBeVisible();

		const state = await readCommitteeState(room.committeeId);
		expect(state).toMatchObject({
			mode: 'single_speaker',
			current_motion_id: null,
			timer_total_seconds: 120,
			timer_ends_at: null,
			timer_paused_remaining_seconds: 120
		});
		const list = await readActiveList(room);
		expect(list).toMatchObject({
			kind: 'single',
			purpose: 'Right of reply',
			speaking_time_seconds: 120
		});
		expect(await readListEntries(list.id)).toEqual([
			{ name: 'Japan', status: 'speaking', spokeSeconds: null }
		]);
		expect(await readMotions(room)).toEqual([]);
		const gslEntries = await readListEntries(gsl.id);
		expect(gslEntries.find((entry) => entry.name === 'France')).toEqual({
			name: 'France',
			status: 'spoken',
			spokeSeconds: 40
		});
	});

	test('a typed name takes the floor: initials in the flag’s place, no delegate line, in a second browser too', async ({
		page,
		browser
	}, testInfo) => {
		const room = await makeChairedCommittee('Single Name MUN');
		const isScripted = testInfo.project.use.javaScriptEnabled !== false;

		await openSingle(page, room);
		await chooseWho(page, isScripted, 'Secretary-General', false);
		await giveTheFloor(page);

		await expect(page.getByRole('heading', { name: 'Single speaker · 1:00' })).toBeVisible();
		await expect(singleSpeaker(page, 'Secretary-General')).toBeVisible();
		await expect(singleFloor(page).getByText('SG', { exact: true })).toBeVisible();
		const list = await readActiveList(room);
		expect(await readListEntries(list.id)).toEqual([
			{ name: 'Secretary-General', status: 'speaking', spokeSeconds: null }
		]);

		if (testInfo.project.name !== 'desktop') return;

		const other = await browser.newContext();
		const otherPage = await other.newPage();
		await signIn(otherPage, room.chair);
		await otherPage.goto(viewPath(room, 'single'));
		await expect(singleSpeaker(otherPage, 'Secretary-General')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(singleFloor(otherPage).getByText('SG', { exact: true })).toBeVisible();
		await other.close();
	});

	test('refuses with the quoted sentences and keeps what was typed', async ({ page }, testInfo) => {
		const room = await makeChairedCommittee('Single Refused MUN');
		const isScripted = testInfo.project.use.javaScriptEnabled !== false;

		await startSessionDirectly(room);
		await takeRollCall(room, 'Ghana');
		await signIn(page, room.chair);
		await openView(page, viewPath(room, 'single'));

		// Nobody, an empty "Other…" and a time too short, all at once.
		await choose(page, 'Other…');
		await page.getByRole('textbox', { name: 'Other time' }).fill('10s');
		await page.getByRole('button', { name: 'Give the floor' }).click();
		await expect(
			page.getByText('Choose a delegation or type a name.', { exact: true })
		).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(page.getByText('Say what the purpose is, or choose another.')).toBeVisible();
		await expect(
			page.getByText('Speaking time must be between 15 seconds and 20 minutes.')
		).toBeVisible();
		await expect(page.getByRole('textbox', { name: 'Other time' })).toHaveValue('10s');
		expect((await readCommitteeState(room.committeeId)).mode).toBe('formal_debate');

		if (isScripted) {
			// An absent seat is listed as "absent" and cannot be chosen.
			const box = page.getByRole('combobox', { name: 'Who' });
			await box.click();
			await box.fill('Gha');
			await expect(page.getByRole('option', { name: /Ghana\s*absent/ })).toHaveAttribute(
				'aria-disabled',
				'true'
			);
			return;
		}

		// Without JavaScript both a seat and a name can be sent, which is refused.
		await page.getByLabel('Who').selectOption({ label: 'France' });
		await page.getByLabel('or a name').fill('Guest');
		await page.getByRole('button', { name: 'Give the floor' }).click();
		await expect(page.getByText('Choose a delegation or type a name, not both.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
	});

	test('giving the floor during a caucus ends it, and says so first; an open vote blocks it', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop', 'One project is enough for these sentences.');
		const room = await makeChairedCommittee('Single Replaces MUN');

		await openSingle(page, room);
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
		await chooseWho(page, true, 'France', true);
		await giveTheFloor(page);
		const state = await readCommitteeState(room.committeeId);
		expect(state).toMatchObject({
			mode: 'single_speaker',
			current_motion_id: null,
			caucus_total_seconds: null
		});

		await singleFloor(page).getByRole('button', { name: 'Return to GSL' }).click();
		await expectLandedOn(page, room.roomPath);
		await waitUntilAnswered(page);
		await openVoteDirectly(room);
		await page.goto(viewPath(room, 'single'));
		await expect(page.getByRole('button', { name: 'Give the floor' })).toBeDisabled({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(page.getByText('Close the open vote first.')).toBeVisible();
		const answer = await postFromPage(page, `${viewPath(room, 'single')}?/startSingle`, {
			speakerName: 'Guest',
			time: '1:00'
		});
		expect(answer).toContain('Close the open vote first.');
	});
});

test.describe('the running view', () => {
	test('"Also speaking" takes seats, "Next" calls each in turn, then "Return to GSL" takes the room back', async ({
		page
	}, testInfo) => {
		const room = await makeChairedCommittee('Single Run MUN');
		const isScripted = testInfo.project.use.javaScriptEnabled !== false;

		await openSingle(page, room, ['Japan']);
		await chooseWho(page, isScripted, 'Secretary-General', false);
		await choose(page, 'Presentation');
		await giveTheFloor(page);
		await expect(page.getByText('One speaker at a time, or several in a row.')).toBeVisible();
		await expect(singleFloor(page).getByRole('button', { name: 'Return to GSL' })).toBeVisible();
		// The GSL's clock buttons, with or without JavaScript.
		await singleFloor(page).getByRole('button', { name: 'Start' }).click();
		await expect(singleFloor(page).getByRole('button', { name: 'Pause' })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await waitUntilAnswered(page);

		await addAlsoSpeaking(page, isScripted, 'France');
		await addAlsoSpeaking(page, isScripted, 'Ghana');
		await expect(singleFloor(page).getByRole('button', { name: 'Return to GSL' })).toHaveCount(0);
		const singleList = await readActiveList(room);

		await page.getByRole('button', { name: 'Next: France' }).click();
		await expect(singleSpeaker(page, 'France')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await expect(speakerClock(page)).toHaveText('1:00');
		await waitUntilAnswered(page);
		await page.getByRole('button', { name: 'Next: Ghana' }).click();
		await expect(singleSpeaker(page, 'Ghana')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await waitUntilAnswered(page);

		// Nobody waits now: "Return to GSL" is the primary.
		const back = singleFloor(page).getByRole('button', { name: 'Return to GSL' });
		await expect(back).toHaveClass(/(^|\s)(bg-primary|bg-brand-900)(\s|$)/);
		await setSpeakerClock(room, { pausedAtSeconds: 30 });
		await back.click();

		await expectLandedOn(page, room.roomPath);
		await expect(page.getByRole('heading', { name: /General Speakers’ List/ })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await waitUntilAnswered(page);
		const state = await readCommitteeState(room.committeeId);
		expect(state).toMatchObject({
			mode: 'formal_debate',
			current_speaker_entry_id: null,
			timer_total_seconds: null
		});
		expect(await readWaitingOrder(room)).toEqual(['Japan']);
		const ghana = (await readListEntries(singleList.id)).find((entry) => entry.name === 'Ghana');
		expect(ghana).toMatchObject({ status: 'spoken', spokeSeconds: 30 });
	});

	test('the last speaker finished: the floor says so and who spoke last', async ({
		page
	}, testInfo) => {
		const room = await makeChairedCommittee('Single Finished MUN');
		const isScripted = testInfo.project.use.javaScriptEnabled !== false;

		await openSingle(page, room);
		await chooseWho(page, isScripted, 'Guest speaker', false);
		await giveTheFloor(page);
		await singleFloor(page).getByRole('button', { name: 'End speech' }).click();

		await expect(page.getByText('The last speaker has finished')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(page.getByText(/^Guest speaker spoke last · 0:00$/)).toBeVisible();
		await expect(singleFloor(page).getByRole('button', { name: 'Return to GSL' })).toBeVisible();
	});

	test('Space, N, E, + and / work as on the GSL; none acts in a text field', async ({
		page
	}, testInfo) => {
		skipWithoutJavaScript(testInfo);
		test.skip(testInfo.project.name !== 'desktop', 'Keys are a laptop’s.');
		const room = await makeChairedCommittee('Single Keys MUN');

		await openSingle(page, room);
		await chooseWho(page, true, 'France', true);
		await giveTheFloor(page);
		await addAlsoSpeaking(page, true, 'Ghana');
		await page.keyboard.press('Escape');
		await page.keyboard.press('Escape');
		await page.locator('body').click({ position: { x: 5, y: 5 } });

		await page.keyboard.press(' ');
		await expect(singleFloor(page).getByRole('button', { name: 'Pause' })).toBeVisible();
		await page.keyboard.press('+');
		await waitUntilAnswered(page);
		expect((await readCommitteeState(room.committeeId)).timer_ends_at).not.toBeNull();
		await page.keyboard.press('n');
		await expect(singleSpeaker(page, 'Ghana')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await waitUntilAnswered(page);
		await page.keyboard.press('e');
		await expect(page.getByText('The last speaker has finished')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await page.keyboard.press('/');
		const box = page.getByRole('combobox', { name: 'Add a speaker' });
		await expect(box).toBeFocused();
		await box.press('e');
		await expect(box).toHaveValue('e');
	});
});

test.describe('sizes', () => {
	test('at 1280 × 800 it fits with the clock as on the GSL; at 1024 the column keeps 320px', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop', 'One laptop-sized project is enough.');
		const room = await makeChairedCommittee('Single Fits MUN');

		await openSingle(page, room);
		await chooseWho(page, true, 'France', true);
		await giveTheFloor(page);
		await addAlsoSpeaking(page, true, 'Ghana');

		const overflow = await page.evaluate(() => {
			const main = document.querySelector('main');

			return main ? main.scrollHeight - main.clientHeight : 0;
		});
		expect(overflow).toBeLessThanOrEqual(1);
		const wide = await speakerClock(page).evaluate((element) =>
			parseFloat(getComputedStyle(element).fontSize)
		);
		expect(wide).toBeLessThanOrEqual(168);
		expect(wide).toBeGreaterThan(140);
		await saveFullPageScreenshot(page, 'chair-single-speaker');

		await page.setViewportSize({ width: 1024, height: 768 });
		expect((await alsoSpeaking(page).boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(320);
		const narrow = await speakerClock(page).evaluate((element) =>
			parseFloat(getComputedStyle(element).fontSize)
		);
		expect(narrow).toBeLessThan(wide);
		await expectNoSidewaysOverflow(page);
	});

	test('on a 390 phone the view is one column, the controls stick, the primary is full width', async ({
		page
	}, testInfo) => {
		test.skip(
			testInfo.project.name !== 'phone',
			'Only the phone project has a phone-sized window.'
		);
		const room = await makeChairedCommittee('Single Phone MUN');

		await openSingle(page, room);
		await chooseWho(page, true, 'France', true);
		await giveTheFloor(page);

		const footer = singleFloor(page).locator('footer');
		expect(await footer.evaluate((element) => getComputedStyle(element).position)).toBe('sticky');
		const back = page.getByRole('button', { name: 'Return to GSL' });
		expect((await back.boundingBox())?.width ?? 0).toBeGreaterThan(390 - 40);
		const clockBox = await speakerClock(page).boundingBox();
		const listBox = await alsoSpeaking(page).boundingBox();
		expect(listBox?.y ?? 0).toBeGreaterThan(clockBox?.y ?? 0);
		for (const target of [
			footer.getByRole('button', { name: 'Start' }),
			footer.getByRole('button', { name: '+15 s' }),
			footer.getByRole('button', { name: 'End speech' }),
			back
		]) {
			expect((await target.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
		}
		await saveFullPageScreenshot(page, 'chair-single-speaker');
		await expectNoSidewaysOverflow(page);
	});
});

test.describe('click budgets', () => {
	test('calling the next speaker of a single speaker’s list: one press on the floor, the strip or N', async ({
		page
	}, testInfo) => {
		const room = await makeChairedCommittee('Single Budget MUN');
		const isScripted = testInfo.project.use.javaScriptEnabled !== false;

		await openSingle(page, room);
		await chooseWho(page, isScripted, 'France', true);
		await giveTheFloor(page);
		await addAlsoSpeaking(page, isScripted, 'Ghana');
		await addAlsoSpeaking(page, isScripted, 'Japan');

		const journey = ClickBudgetJourney.fromPage(page);
		await journey.click(page.getByRole('button', { name: 'Next: Ghana' }));
		await expect(singleSpeaker(page, 'Ghana')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		journey.expectWithinBudget({ clicks: 1, pages: 1, typedFields: 0, decisions: 0 });
		await waitUntilAnswered(page);

		if (testInfo.project.name !== 'desktop') return;

		await openView(page, `${room.roomPath}/motions`);
		const strip = page.getByRole('button', { name: /^Next: Japan/ });
		await expect(strip).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		const stripJourney = ClickBudgetJourney.fromPage(page);
		await stripJourney.click(strip);
		await expect
			.poll(
				async () =>
					(await readListEntries((await readActiveList(room)).id)).map((entry) => entry.status),
				{
					timeout: DATABASE_TIMEOUT_MS
				}
			)
			.toEqual(['spoken', 'spoken', 'speaking']);
		stripJourney.expectWithinBudget({ clicks: 1, pages: 1, typedFields: 0, decisions: 0 });
		expect(new URL(page.url()).pathname).toBe(`${room.roomPath}/motions`);
	});
});
