import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	DATABASE_TIMEOUT_MS,
	makeChairedCommittee,
	markAllPresent,
	openRoom,
	readCommitteeState,
	startSession,
	waitUntilAnswered,
	type ChairedCommittee
} from './chair-room-fixtures';
import { waitForChairScript } from './chair-script';
import { gslPath, seedWaiting } from './gsl-fixtures';
import { skipWithoutJavaScript } from './in-place';
import { expectNoSidewaysOverflow, saveFullPageScreenshot } from './page-shape';
import { signIn } from './signed-in-user';

// S5: the opening band (specs/05-pages/chair/committee-room.md, "Opening
// band"). A session opens on the GSL view from the first second, with a slim
// band above it: roll call ("Mark all present", or "Take it seat by seat")
// and the agenda (one press on a topic). Each row ticks off once done, and
// the band stays until the first speaker is called. Every test runs on
// desktop, desktop-no-js and phone unless it says otherwise.

/** The two topics the fixture committee debates, so the agenda has a choice. */
const TOPICS = ['Climate finance', 'Protection of civilians'];

/** Give the fixture committee its topics, the way the organiser's committee form would. */
async function giveTopics(room: ChairedCommittee): Promise<void> {
	const admin = createServiceRoleClient();
	const { error } = await admin
		.from('committees')
		.update({ topics: TOPICS })
		.eq('id', room.committeeId);

	if (error) throw new Error(`Could not give the committee its topics: ${error.message}`);
}

/** How many roll calls the running session has, and how many of its seats are present. */
async function readRollCalls(room: ChairedCommittee): Promise<{ count: number; present: number }> {
	const admin = createServiceRoleClient();
	const state = await readCommitteeState(room.committeeId);
	const { data: rollCalls, error } = await admin
		.from('roll_calls')
		.select('id, roll_call_entries(status)')
		.eq('session_id', state.current_session_id ?? '');

	if (error) throw new Error(`Could not read the roll calls: ${error.message}`);

	const entries = (rollCalls ?? []).flatMap((rollCall) => rollCall.roll_call_entries);
	const present = entries.filter((entry) => entry.status === 'present').length;

	return { count: rollCalls?.length ?? 0, present };
}

/**
 * Sign the chair in to a committee with topics and start a session from the
 * lobby, once the page's script runs, so the press is the scripted one whose
 * focus move the tests check.
 */
async function openSession(
	page: Page,
	testInfo: TestInfo,
	namePrefix: string
): Promise<ChairedCommittee> {
	const room = await makeChairedCommittee(namePrefix);
	await giveTopics(room);

	await signIn(page, room.chair);
	await openRoom(page, room.roomPath);
	await waitForChairScript(page, testInfo);
	await startSession(page);
	await expect(bandHeading(page)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	return room;
}

/** The band, the region its heading "Before debate" names. */
function band(page: Page): Locator {
	return page.getByRole('region', { name: 'Before debate' });
}

/** The band's heading, "Before debate". */
function bandHeading(page: Page): Locator {
	return page.getByRole('main').getByRole('heading', { name: 'Before debate' });
}

/** The filled buttons and links of the page area: a filled one carries the dark blue. */
function filledControls(page: Page): Locator {
	return page
		.getByRole('main')
		.locator(
			'a:is(.bg-primary, .bg-brand-900):visible, button:is(.bg-primary, .bg-brand-900):visible'
		);
}

test('a new session opens on the GSL view with the band "Before debate" above it', async ({
	page
}, testInfo) => {
	const hasJavaScript = testInfo.project.use.javaScriptEnabled !== false;
	const room = await openSession(page, testInfo, 'Opening Band MUN');
	const main = page.getByRole('main');

	// With JavaScript "Start Session 1" moved the focus onto the band (R12).
	if (hasJavaScript) await expect(bandHeading(page)).toBeFocused();

	// The floor is the GSL from the first second, under the band.
	await expect(main.getByRole('heading', { name: /^General Speakers’ List/ })).toBeVisible();
	await expect(band(page).getByRole('link', { name: 'Take it seat by seat' })).toHaveAttribute(
		'href',
		new RegExp(`${room.roomPath}/roll-call$`)
	);

	// One outlined button per topic, never the filled one; "Mark all present" is the one (P1).
	for (const topic of TOPICS) {
		await expect(band(page).getByRole('button', { name: topic })).not.toHaveClass(
			/(^|\s)(bg-primary|bg-brand-900)(\s|$)/
		);
	}
	await expect(filledControls(page)).toHaveText([/Mark all present/]);

	// Steps not yet taken are not faults: no amber or red anywhere, the top bar included (P4).
	await expect(
		page.locator(
			'.bg-warning-100, .text-warning-700, .bg-danger-100, .text-danger-700, .bg-warning-muted, .text-warning, .bg-destructive-muted, .text-destructive'
		)
	).toHaveCount(0);
	await expectNoSidewaysOverflow(page);
	await saveFullPageScreenshot(page, 'chair-room-opening-band');
});

test('"Mark all present" and one topic tick each row off, and the band stays until a speaker is called', async ({
	page
}, testInfo) => {
	const hasJavaScript = testInfo.project.use.javaScriptEnabled !== false;
	const room = await openSession(page, testInfo, 'Opening Steps MUN');
	const main = page.getByRole('main');

	await markAllPresent(page);
	await expect(band(page).getByText('3 of 3 present · quorum met')).toBeVisible();
	await expect(band(page).getByRole('link', { name: 'Edit' })).toBeVisible();
	// No press of the band waits behind a spinner (T140).
	await expect(page.locator('.animate-spin')).toHaveCount(0);
	if (hasJavaScript) await expect(bandHeading(page)).toBeFocused();

	await band(page).getByRole('button', { name: 'Climate finance' }).click();
	await expect(band(page).getByRole('link', { name: 'Change' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(band(page).getByRole('button', { name: 'Protection of civilians' })).toHaveCount(0);
	if (hasJavaScript) await expect(bandHeading(page)).toBeFocused();
	await waitUntilAnswered(page);

	// Both steps are done and the band is still there: nobody has been called yet.
	await expect(bandHeading(page)).toBeVisible();
	expect(await readRollCalls(room)).toEqual({ count: 1, present: 3 });
	expect((await readCommitteeState(room.committeeId)).agenda_topic).toBe('Climate finance');

	// "Change" opens the top bar's agenda menu, with or without JavaScript.
	await band(page).getByRole('link', { name: 'Change' }).click();
	await expect(page.locator('details[data-agenda-menu]')).toHaveAttribute('open', '', {
		timeout: DATABASE_TIMEOUT_MS
	});

	// Once a roll call exists the floor's "Call France" is the one filled button.
	await seedWaiting(room, ['France', 'Ghana']);
	await openRoom(page, room.roomPath);
	await waitForChairScript(page, testInfo);
	await expect(filledControls(page)).toHaveText([/Call France/]);

	await main.getByRole('button', { name: /^Call France/ }).click();
	await expect(bandHeading(page)).toHaveCount(0, { timeout: DATABASE_TIMEOUT_MS });
	// "Call France" became "Next: Ghana" in the same place, and kept the focus.
	const next = main.getByRole('button', { name: /^Next: Ghana/ });
	await expect(next).toBeVisible();
	if (hasJavaScript) await expect(next).toBeFocused();
});

test('a speaker can be called before either step, with "Call {seat}" outlined until a roll call exists', async ({
	page
}, testInfo) => {
	const room = await openSession(page, testInfo, 'Opening Call First MUN');
	const main = page.getByRole('main');

	await seedWaiting(room, ['Japan']);
	await openRoom(page, room.roomPath);
	await waitForChairScript(page, testInfo);

	const call = main.getByRole('button', { name: /^Call Japan/ });
	await expect(call).toBeVisible();
	await expect(call).not.toHaveClass(/(^|\s)(bg-primary|bg-brand-900)(\s|$)/);
	await expect(filledControls(page)).toHaveText([/Mark all present/]);

	await call.click();
	await expect(bandHeading(page)).toHaveCount(0, { timeout: DATABASE_TIMEOUT_MS });
	await waitUntilAnswered(page);

	// The chair skipped roll call: only the top bar's chip reminds them, in plain ink.
	const chip = page.getByRole('banner').getByRole('link', { name: 'Take roll call' });
	await expect(chip).toBeVisible();
	await expect(chip).not.toHaveClass(/warning/);
	expect(await readRollCalls(room)).toEqual({ count: 0, present: 0 });
});

test('the band is drawn above the GSL on chair/gsl too, and its presses stay there', async ({
	page
}, testInfo) => {
	// The GSL view's own page draws the band the way the live room does: both
	// draw `GslScreen`, the GSL view with the band above it (S5).
	const room = await openSession(page, testInfo, 'Opening On Gsl MUN');

	await page.goto(gslPath(room));
	await expect(bandHeading(page)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await waitForChairScript(page, testInfo);
	await expect(band(page).getByRole('link', { name: 'Take it seat by seat' })).toHaveAttribute(
		'href',
		new RegExp(`${room.roomPath}/roll-call\\?from=gsl$`)
	);

	await markAllPresent(page);
	await expect(page).toHaveURL(gslPath(room));

	await band(page).getByRole('button', { name: 'Protection of civilians' }).click();
	await expect(band(page).getByRole('link', { name: 'Change' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page).toHaveURL(gslPath(room));
	await waitUntilAnswered(page);
	expect((await readCommitteeState(room.committeeId)).agenda_topic).toBe('Protection of civilians');
});

test('five seat presses made together make one roll call (R2)', async ({ page }, testInfo) => {
	skipWithoutJavaScript(testInfo);
	const room = await openSession(page, testInfo, 'Opening Five Presses MUN');

	// "Take it seat by seat" opens the roll call view, where the first press makes the roll call.
	await band(page).getByRole('link', { name: 'Take it seat by seat' }).click();
	await expect(page.getByRole('form', { name: 'Attendance of Japan' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// Five presses in a row, none waiting for the one before: the roll call's
	// instant form queues them, so only the first makes the roll call.
	const answers = ['Present', 'Absent', 'Present', 'Present', 'Present'];
	const seatsInTurn = ['France', 'Ghana', 'Japan', 'Ghana', 'France'];

	for (const [index, seatName] of seatsInTurn.entries()) {
		const row = page.getByRole('form', { name: `Attendance of ${seatName}` });
		await row.getByRole('button', { name: answers[index], exact: true }).click();
	}

	await expect(page.locator('.animate-spin')).toHaveCount(0);
	await waitUntilAnswered(page);
	expect(await readRollCalls(room)).toEqual({ count: 1, present: 3 });
});
