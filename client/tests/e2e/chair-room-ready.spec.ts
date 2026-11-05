import { expect, test, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	DATABASE_TIMEOUT_MS,
	endSessionFromFrame,
	makeChairedCommittee,
	modeBar,
	modeBarTab,
	openCommitteeMenu,
	openRoom,
	startSession,
	waitUntilAnswered,
	type ChairedCommittee
} from './chair-room-fixtures';
import { expectNoSidewaysOverflow, saveFullPageScreenshot } from './page-shape';
import { addScheduleEvent } from './schedule-fixtures';
import { makeCommitteeChair, signIn } from './signed-in-user';

// The chair room before a session: the lobby (S11,
// specs/05-pages/chair/committee-room.md, "Lobby"), inside the console's frame
// (S3). The lobby names the committee and where and when it meets, offers the
// next session as its one button (a practice session before the conference's
// first day) with "Rename this session", and lists the last session's record
// and the next event on the schedule; the console has no mode bar. The top
// bar names an organiser's role, and on a phone the mode bar shows its views
// as icon tabs, with Suspend and End in the committee menu. Every test runs on
// desktop, desktop-no-js and phone.

/** The height and width a tab of the phone's mode bar must reach, so a thumb can hit it. */
const MIN_TOUCH_TARGET_PX = 44;

/** How many days before the fixture conference's first day the practice test runs. */
const DAYS_BEFORE_FIRST_DAY = 4;

/** A `YYYY-MM-DD` date `days` after today, which is how the database stores a day. */
function dayFromToday(days: number): string {
	const date = new Date();
	date.setUTCDate(date.getUTCDate() + days);

	return date.toISOString().slice(0, 10);
}

/** Move the fixture conference so that its first day is still `days` away. */
async function moveConferenceAhead(room: ChairedCommittee, days: number): Promise<void> {
	const admin = createServiceRoleClient();
	// A draft, so that a conference days away stays out of the public lists of
	// the soonest conferences, which other browser tests check at the same time.
	const { error } = await admin
		.from('conferences')
		.update({
			start_date: dayFromToday(days),
			end_date: dayFromToday(days + 2),
			status: 'draft'
		})
		.eq('id', room.conferenceId);

	if (error) throw new Error(`Could not move the conference: ${error.message}`);
}

/**
 * Move the fixture conference so that it started yesterday and ends
 * tomorrow: today is day 2 of 3 (a day either way near midnight, since the
 * days are counted in UTC here and in Amsterdam on the page).
 */
async function makeItDayTwo(room: ChairedCommittee): Promise<void> {
	await moveConferenceAhead(room, -1);
}

/** The lobby's heading, the committee's name. */
function lobbyHeading(page: Page) {
	return page.getByRole('main').getByRole('heading', { level: 1, name: 'Security Council' });
}

/** The filled buttons and links of the page area: a filled one carries the dark blue. */
function filledControls(page: Page) {
	return page
		.getByRole('main')
		.locator(
			'a:is(.bg-primary, .bg-brand-900):visible, button:is(.bg-primary, .bg-brand-900):visible'
		);
}

test('before the first day the lobby starts a practice session, then a second', async ({
	page
}) => {
	const room = await makeChairedCommittee('Practice Ready MUN');
	await moveConferenceAhead(room, DAYS_BEFORE_FIRST_DAY);

	await signIn(page, room.chair);
	await openRoom(page, room.roomPath);

	const main = page.getByRole('main');
	await expect(lobbyHeading(page)).toBeVisible();
	await expect(main.getByRole('heading', { level: 2, name: 'Practice session' })).toBeVisible();
	await expect(main.getByText(/Practice sessions do not count towards Session 1/)).toBeVisible();
	// Before it starts, the conference's dates stand where its day will.
	await expect(main.getByText(/· Room 1 · \d/)).toBeVisible();
	// No session runs, so the console has no mode bar, and the top bar no session or chip.
	await expect(modeBar(page)).toHaveCount(0);
	await expect(page.getByRole('banner').getByText(/^Practice session ·/)).toHaveCount(0);

	// One filled button in the page area, and no amber notice for a step not yet taken (P4).
	await expect(filledControls(page)).toHaveText(['Start a practice session']);
	await expect(main.locator('.bg-warning-100, .bg-warning-muted')).toHaveCount(0);

	await startSession(page);
	await expect(modeBarTab(page, 'GSL')).toHaveAccessibleName(/live/);
	await expect(page.getByRole('banner').getByText(/^Practice session ·/)).toHaveCount(1);

	await endSessionFromFrame(page);
	await expect(main.getByRole('heading', { name: 'Practice session has ended' })).toBeVisible();
	await expect(modeBar(page)).toHaveCount(0);
	// A practice session leads to another, never to awards (R19).
	await expect(main.getByRole('link', { name: 'Propose awards' })).toHaveCount(0);

	await startSession(page);
	await expect(page.getByRole('banner').getByText(/^Practice session 2 ·/)).toHaveCount(1);
});

test('the lobby names where and when, the agenda carried over, the last session and the schedule', async ({
	page
}) => {
	const room = await makeChairedCommittee('Lobby Facts MUN');
	await makeItDayTwo(room);
	const admin = createServiceRoleClient();
	await admin
		.from('committees')
		.update({ topics: ['Water'] })
		.eq('id', room.committeeId);
	await admin
		.from('committee_state')
		.update({ agenda_topic: 'Water' })
		.eq('committee_id', room.committeeId);

	// Session 1 ran two hours and ended a day ago, so this morning is the lobby again.
	const endedAt = new Date(Date.now() - 24 * 60 * 60_000);
	const startedAt = new Date(endedAt.getTime() - 2 * 60 * 60_000);
	const { error } = await admin.from('committee_sessions').insert({
		committee_id: room.committeeId,
		name: 'Session 1',
		status: 'ended',
		started_at: startedAt.toISOString(),
		ended_at: endedAt.toISOString()
	});
	if (error) throw new Error(`Could not record the last session: ${error.message}`);
	const startsAt = new Date(Date.now() + 60 * 60_000);
	await addScheduleEvent({
		conferenceId: room.conferenceId,
		title: 'Session 2',
		startsAt: startsAt.toISOString(),
		endsAt: new Date(startsAt.getTime() + 60 * 60_000).toISOString(),
		audience: 'everyone',
		location: 'Council Chamber'
	});

	await signIn(page, room.chair);
	await openRoom(page, room.roomPath);

	const main = page.getByRole('main');
	await expect(lobbyHeading(page)).toBeVisible();
	await expect(main.getByText(/ · Room 1 · day \d of 3$/)).toBeVisible();
	await expect(main.getByRole('heading', { level: 2, name: 'Session 2' })).toBeVisible();
	await expect(filledControls(page)).toHaveText(['Start Session 2']);
	await expect(main.getByText('Agenda carries over: Water')).toBeVisible();
	await expect(main.getByText('3 seats · 0 delegates assigned')).toBeVisible();
	await expect(main.getByText(/^Session 1 · ended yesterday at \d\d:\d\d · 2 h$/)).toBeVisible();
	await expect(main.getByText('no speeches · no motions · no votes')).toBeVisible();
	await expect(main.getByRole('link', { name: 'Session record →' })).toHaveAttribute(
		'href',
		/\/chair\/motions\?session=/
	);
	await expect(
		main.getByText(/^Session 2 · (tomorrow )?\d\d:\d\d, Council Chamber$/)
	).toBeVisible();
	await expect(modeBar(page)).toHaveCount(0);
	await saveFullPageScreenshot(page, 'chair-room-lobby');
	await expectNoSidewaysOverflow(page);
});

test('"Rename this session" names the session it starts', async ({ page }) => {
	const room = await makeChairedCommittee('Lobby Rename MUN');

	await signIn(page, room.chair);
	await openRoom(page, room.roomPath);

	const main = page.getByRole('main');
	await main.getByText('Rename this session').click();
	await main.getByLabel('Session name').fill('Opening Session');
	await main.getByRole('button', { name: 'Start Session 1' }).click();
	await expect(modeBar(page)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await waitUntilAnswered(page);

	const { data: sessions } = await createServiceRoleClient()
		.from('committee_sessions')
		.select('name, status')
		.eq('committee_id', room.committeeId);
	expect(sessions).toEqual([{ name: 'Opening Session', status: 'in_progress' }]);
});

test('a committee without seats cannot start a session, and an organiser is offered "Add seats"', async ({
	page
}) => {
	const room = await makeChairedCommittee('Lobby No Seats MUN');
	const { error } = await createServiceRoleClient()
		.from('seats')
		.delete()
		.eq('committee_id', room.committeeId);
	if (error) throw new Error(`Could not take the seats away: ${error.message}`);

	await signIn(page, room.organiser);
	await openRoom(page, room.roomPath);

	const main = page.getByRole('main');
	const sentence = main.getByText('This committee has no seats yet.');
	await expect(sentence).toBeVisible();
	await expect(sentence).not.toHaveClass(/warning|danger/);
	await expect(main.getByRole('button', { name: 'Start Session 1' })).toBeDisabled();
	await expect(main.getByRole('link', { name: 'Add seats' })).toHaveAttribute(
		'href',
		new RegExp(`/manage/${room.conferenceSlug}/committees/${room.committeeId}$`)
	);
});

test('the top bar tells an organiser whether they chair this committee', async ({
	page
}, testInfo) => {
	const isPhone = testInfo.project.name === 'phone';
	const room = await makeChairedCommittee('Role Ready MUN');

	await signIn(page, room.organiser);
	await openRoom(page, room.roomPath);

	const banner = page.getByRole('banner');
	// A phone has room for "Dashboard" alone; from a tablet up the line says who the reader is.
	await expect(banner.getByText('Viewing as organiser ·')).toBeVisible({ visible: !isPhone });
	// Without a script SvelteKit writes links relative to the page, so match the end.
	await expect(banner.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
		'href',
		new RegExp(`/manage/${room.conferenceSlug}$`)
	);

	// Once the organiser is a named chair of the committee too, the line says "Chair".
	await makeCommitteeChair(room.organiser, room.committeeId);
	await openRoom(page, room.roomPath);

	await expect(banner.getByText('Chair ·', { exact: true })).toBeVisible({ visible: !isPhone });
	await expect(banner.getByText('Viewing as organiser')).toHaveCount(0);

	// A chair who does not organise needs neither line.
	await page.context().clearCookies();
	await signIn(page, room.chair);
	await openRoom(page, room.roomPath);

	await expect(banner.getByRole('link', { name: 'Dashboard' })).toHaveCount(0);
});

test('on a phone the mode bar shows icon tabs, and Suspend and End are in the committee menu', async ({
	page
}) => {
	// Every project draws the phone's frame at a phone's width, so desktop-no-js
	// checks that the committee menu opens without JavaScript too.
	await page.setViewportSize({ width: 390, height: 844 });
	const room = await makeChairedCommittee('Phone Frame Ready MUN');

	await signIn(page, room.chair);
	await openRoom(page, room.roomPath);
	await startSession(page);

	// The six views, GSL to Vote, each wide and tall enough for a thumb.
	const tabs = modeBar(page).getByRole('link');
	await expect(tabs).toHaveCount(6);

	for (let index = 0; index < 6; index++) {
		const box = await tabs.nth(index).boundingBox();
		expect(box?.height ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
		expect(box?.width ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
	}

	// Suspend and End leave the bar on a phone and wait in the committee menu.
	await expect(modeBar(page).getByRole('link', { name: 'End', exact: true })).toBeHidden();
	const menu = await openCommitteeMenu(page);
	await expect(menu.getByRole('button', { name: 'Suspend' })).toBeVisible();
	await expect(menu.getByRole('link', { name: 'End', exact: true })).toBeVisible();

	await modeBarTab(page, 'Motions').click();
	await expect(page).toHaveURL(`${room.roomPath}/motions`, { timeout: DATABASE_TIMEOUT_MS });
	await expect(modeBarTab(page, 'Motions')).toHaveAttribute('aria-current', 'page');
});
