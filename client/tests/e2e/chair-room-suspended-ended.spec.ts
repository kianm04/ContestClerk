import { expect, test, type Locator, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	DATABASE_TIMEOUT_MS,
	makeChairedCommittee,
	modeBar,
	openCommitteeMenu,
	openRoom,
	readCommitteeState,
	startSession,
	takeRollCall,
	waitUntilAnswered,
	type ChairedCommittee
} from './chair-room-fixtures';
import { waitForChairScript } from './chair-script';
import { fillSpeakersList, startSessionInDatabase, updateRoom } from './committee-live-fixtures';
import { expectNoSidewaysOverflow, saveFullPageScreenshot } from './page-shape';
import { signIn } from './signed-in-user';

// S11: suspending, resuming and ending a session (specs/05-pages/chair/committee-room.md,
// "Suspended" and "Ended", D6). Suspend is one press: every clock pauses and
// everything else is kept, the room says how long it has been suspended or
// when it is due back, and "Resume session" puts back exactly what was
// suspended. End asks in place in the mode bar, never in a dialog, and the
// ended screen leads to the next session or to the awards. Every test runs on
// desktop, desktop-no-js and phone unless it says otherwise.

/** A `YYYY-MM-DD` date `days` after today, which is how the database stores a day. */
function dayFromToday(days: number): string {
	const date = new Date();
	date.setUTCDate(date.getUTCDate() + days);

	return date.toISOString().slice(0, 10);
}

/**
 * Move the fixture conference so that it started yesterday and ends in two
 * days, so today is neither its first nor its last day in any timezone. A
 * draft, so that a conference running now stays out of the public lists other
 * browser tests check at the same time.
 */
async function moveConferenceToToday(room: ChairedCommittee): Promise<void> {
	const admin = createServiceRoleClient();
	const { error } = await admin
		.from('conferences')
		.update({ start_date: dayFromToday(-1), end_date: dayFromToday(2), status: 'draft' })
		.eq('id', room.conferenceId);

	if (error) throw new Error(`Could not move the conference: ${error.message}`);
}

/** The filled buttons and links of the page area: a filled one carries the dark blue. */
function filledControls(page: Page): Locator {
	return page
		.getByRole('main')
		.locator(
			'a:is(.bg-primary, .bg-brand-900):visible, button:is(.bg-primary, .bg-brand-900):visible'
		);
}

/**
 * A room in debate: a roll call taken, France speaking with 52 seconds left
 * on a running clock, and Ghana waiting.
 */
async function makeRoomInDebate(namePrefix: string): Promise<ChairedCommittee> {
	const room = await makeChairedCommittee(namePrefix);
	await startSessionInDatabase(room);
	await takeRollCall(room, '');
	await fillSpeakersList(room, ['France', 'Ghana'], true);
	await updateRoom(room, {
		timer_total_seconds: 60,
		timer_ends_at: new Date(Date.now() + 52_000).toISOString(),
		timer_paused_remaining_seconds: null
	});

	return room;
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

/** Press End: in the mode bar, or on a phone in the committee menu. */
async function pressEnd(page: Page): Promise<void> {
	const endInBar = modeBar(page).getByRole('link', { name: 'End', exact: true });

	if (await endInBar.isVisible()) {
		await endInBar.click();
		return;
	}

	const menu = await openCommitteeMenu(page);
	await menu.getByRole('link', { name: 'End', exact: true }).click();
}

/** The suspended screen's heading. */
function suspendedHeading(page: Page, name: string | RegExp = /^Suspended/): Locator {
	return page.getByRole('main').getByRole('heading', { level: 1, name });
}

test('Suspend is one press, and "Resume session" brings the speaker back with the clock paused', async ({
	page
}, testInfo) => {
	const hasJavaScript = testInfo.project.use.javaScriptEnabled !== false;
	const isPhone = testInfo.project.name === 'phone';
	const room = await makeRoomInDebate('Suspend Resume MUN');
	const before = await readCommitteeState(room.committeeId);

	await signIn(page, room.chair);
	await openRoom(page, room.roomPath);
	await waitForChairScript(page, testInfo);
	await pressSuspend(page);

	const main = page.getByRole('main');
	await expect(suspendedHeading(page, 'Suspended')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	if (hasJavaScript) await expect(suspendedHeading(page)).toBeFocused();
	await expect(main.getByText(/^\d+ min so far$/)).toBeVisible();
	await expect(main.getByText('Set a return time')).toBeVisible();
	await expect(
		main.getByText(/^When the session resumes: GSL, France with 0:[45]\d left$/)
	).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	// "Resume session" is the one filled button, and Suspend is gone from the mode bar.
	await expect(filledControls(page)).toHaveText([/Resume session/]);
	await expect(modeBar(page).getByRole('button', { name: 'Suspend' })).toHaveCount(0);
	// A phone's mode bar has no End, so the suspended screen offers it.
	await expect(main.getByRole('link', { name: 'End session' })).toBeVisible({ visible: isPhone });

	await waitUntilAnswered(page);
	const suspended = await readCommitteeState(room.committeeId);
	expect(suspended).toMatchObject({
		mode: 'suspended',
		mode_before_suspension: 'formal_debate',
		current_speaker_entry_id: before.current_speaker_entry_id,
		active_speakers_list_id: before.active_speakers_list_id,
		timer_ends_at: null
	});
	expect(suspended.timer_paused_remaining_seconds).toBeGreaterThan(40);
	await expectNoSidewaysOverflow(page);
	await saveFullPageScreenshot(page, 'chair-room-suspended');

	// "15 min" sets when the room is due back, counting down.
	await main.getByRole('button', { name: '15 min' }).click();
	await expect(main.getByText(/^Back at \d\d:\d\d · in 1[56] min$/)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(main.getByText('Change the return time')).toBeVisible();
	await waitUntilAnswered(page);
	const dueBack = (await readCommitteeState(room.committeeId)).suspended_until;
	const minutesAway = (new Date(dueBack ?? 0).getTime() - Date.now()) / 60_000;
	expect(minutesAway).toBeGreaterThan(14);
	expect(minutesAway).toBeLessThan(17);

	await main.getByRole('button', { name: 'Resume session' }).click();
	const floorTitle = main.getByRole('heading', { name: /^General Speakers’ List/ });
	await expect(floorTitle).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	if (hasJavaScript) await expect(floorTitle).toBeFocused();
	// France still has the floor, the clock paused where it was: the chair restarts it.
	await expect(main.getByRole('button', { name: /^Resume/ })).toBeVisible();

	await waitUntilAnswered(page);
	const resumed = await readCommitteeState(room.committeeId);
	expect(resumed).toMatchObject({
		mode: 'formal_debate',
		suspended_at: null,
		suspended_until: null,
		mode_before_suspension: null,
		current_speaker_entry_id: before.current_speaker_entry_id,
		timer_ends_at: null,
		timer_paused_remaining_seconds: suspended.timer_paused_remaining_seconds
	});
});

test('a typed return time sets "Back at", in the conference timezone', async ({
	page
}, testInfo) => {
	const room = await makeRoomInDebate('Suspend Typed Time MUN');
	await updateRoom(room, {
		mode: 'suspended',
		suspended_at: new Date().toISOString(),
		mode_before_suspension: 'formal_debate'
	});
	// Forty-five minutes from now, in the fixture conference's Amsterdam time.
	const later = new Date(Date.now() + 45 * 60_000);
	const backAt = new Intl.DateTimeFormat('en-GB', {
		timeZone: 'Europe/Amsterdam',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	}).format(later);
	test.skip(
		backAt < '00:45',
		'Forty-five minutes from now is tomorrow, which no time today can name.'
	);

	await signIn(page, room.chair);
	await openRoom(page, room.roomPath);
	await waitForChairScript(page, testInfo);

	const main = page.getByRole('main');
	await main.getByLabel('Back at').fill(backAt);
	await main.getByRole('button', { name: 'Set', exact: true }).click();
	await expect(main.getByText(new RegExp(`^Back at ${backAt} · in 4[45] min$`))).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(page);
	expect((await readCommitteeState(room.committeeId)).suspended_until).not.toBeNull();
});

test('a suspend motion that passed with a reason names it in the title', async ({
	page
}, testInfo) => {
	const room = await makeRoomInDebate('Suspend Reason MUN');
	const state = await readCommitteeState(room.committeeId);
	const suspendedAt = new Date().toISOString();
	const admin = createServiceRoleClient();
	const { error } = await admin.from('motions').insert({
		committee_id: room.committeeId,
		session_id: state.current_session_id ?? '',
		kind: 'suspend_meeting',
		status: 'passed',
		topic: 'for lunch',
		decided_at: suspendedAt
	});

	if (error) throw new Error(`Could not pass the motion: ${error.message}`);

	await updateRoom(room, {
		mode: 'suspended',
		suspended_at: suspendedAt,
		mode_before_suspension: 'formal_debate'
	});

	await signIn(page, room.chair);
	await openRoom(page, room.roomPath);
	await waitForChairScript(page, testInfo);

	await expect(suspendedHeading(page, 'Suspended for lunch')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
});

test('End asks in place in the mode bar, and the ended screen starts the next session', async ({
	page
}, testInfo) => {
	const hasJavaScript = testInfo.project.use.javaScriptEnabled !== false;
	const isPhone = testInfo.project.name === 'phone';
	const room = await makeChairedCommittee('Ended Going On MUN');
	await moveConferenceToToday(room);

	await signIn(page, room.chair);
	await openRoom(page, room.roomPath);
	await waitForChairScript(page, testInfo);
	await startSession(page);

	// End asks in place, never in a dialog; "Keep going" puts End back.
	await pressEnd(page);
	const keepGoing = page.getByRole('link', { name: 'Keep going' });
	await expect(page.getByText('End Session 1?')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(page.getByRole('dialog')).toHaveCount(0);
	if (hasJavaScript) await expect(keepGoing).toBeFocused();
	await expect(page.getByRole('button', { name: 'End session' })).toHaveClass(/bg-danger-700/);

	await keepGoing.click();
	await expect(page.getByText('End Session 1?')).toHaveCount(0, { timeout: DATABASE_TIMEOUT_MS });
	if (hasJavaScript && !isPhone) {
		await expect(modeBar(page).getByRole('link', { name: 'End', exact: true })).toBeFocused();
	}

	await pressEnd(page);
	await page.getByRole('button', { name: 'End session' }).click();

	const main = page.getByRole('main');
	const heading = main.getByRole('heading', { level: 1, name: 'Session 1 has ended' });
	await expect(heading).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	if (hasJavaScript) await expect(heading).toBeFocused();
	await waitUntilAnswered(page);
	// The session's length and record in one line, once the page has read it.
	await expect(main.getByText(/^\d+ min · no speeches · no motions · no votes$/)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(modeBar(page)).toHaveCount(0);

	// "Start Session 2" is the one filled button; awards, the record and the notes are links beside it.
	await expect(filledControls(page)).toHaveText(['Start Session 2']);
	await expect(main.getByRole('link', { name: 'Propose awards' })).not.toHaveClass(
		/(^|\s)(bg-primary|bg-brand-900)(\s|$)/
	);
	await expect(main.getByRole('link', { name: 'Session record' })).toHaveAttribute(
		'href',
		/\/chair\/motions\?session=/
	);
	await expect(main.getByRole('link', { name: 'Session notes' })).toHaveAttribute(
		'href',
		/\/chair\/notes\/sessions\//
	);
	expect((await readCommitteeState(room.committeeId)).current_session_id).toBeNull();
	await expectNoSidewaysOverflow(page);
	await saveFullPageScreenshot(page, 'chair-room-ended');

	await main.getByRole('button', { name: 'Start Session 2' }).click();
	await expect(main.getByRole('heading', { name: 'Before debate' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	const { data: sessions } = await createServiceRoleClient()
		.from('committee_sessions')
		.select('name, status')
		.eq('committee_id', room.committeeId)
		.order('created_at');
	expect(sessions).toEqual([
		{ name: 'Session 1', status: 'ended' },
		{ name: 'Session 2', status: 'in_progress' }
	]);
});

test('after the last day the ended screen leads to the awards', async ({ page }, testInfo) => {
	// The fixture conference ran in May 2020, so it is long over.
	const room = await makeChairedCommittee('Ended Last Day MUN');

	await signIn(page, room.chair);
	await openRoom(page, room.roomPath);
	await waitForChairScript(page, testInfo);
	await startSession(page);
	await pressEnd(page);
	await page.getByRole('button', { name: 'End session' }).click();

	const main = page.getByRole('main');
	await expect(main.getByRole('heading', { level: 1, name: / has ended$/ })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(filledControls(page)).toHaveText(['Propose awards']);
	// Another session is still possible, as a plain button that reads as a link.
	await expect(main.getByRole('button', { name: 'Start another session' })).not.toHaveClass(
		/(^|\s)(bg-primary|bg-brand-900)(\s|$)/
	);

	await waitUntilAnswered(page);
	await main.getByRole('link', { name: 'Propose awards' }).click();
	await expect(page).toHaveURL(`${room.roomPath}/awards`, { timeout: DATABASE_TIMEOUT_MS });
});
