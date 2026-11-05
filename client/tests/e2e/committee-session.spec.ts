import { expect, test, type Locator, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	DATABASE_TIMEOUT_MS,
	makeChairedCommittee,
	modeBar,
	openRoom,
	pressChairTab,
	readCommitteeState,
	waitUntilAnswered,
	type ChairedCommittee
} from './chair-room-fixtures';
import { livePathOf, roomChannelListening } from './committee-live-fixtures';
import { addBox, floorRegion } from './gsl-fixtures';
import { markPage, readMarker } from './in-place';
import { saveFullPageScreenshot } from './page-shape';
import { createTestUser, giveSeat, signIn } from './signed-in-user';

// T134: one whole committee session, run the way a chair runs it, with a
// delegate watching on a phone at the same time. The chair's page and the
// delegate's live view are two browsers side by side, and after every step
// the delegate's screen has to show the change within two seconds.
//
// The chair moves between the chair pages with the console's mode bar and
// committee menu, as a person does (S3), and the test leaves a marker on the
// chair's `window` at the start: if any press reloaded the page instead of
// answering in place, the marker is gone at the end (`in-place.ts`).
//
// The conference is made for this test alone by `makeChairedCommittee`, rather
// than reusing the walkthrough seed's running room, because the session is
// ended at the end and the seed's room has to stay running for the people who
// try it by hand.

/** How long the delegate's screen may take to follow the chair, from `committee-live.md`. */
const REALTIME_TIMEOUT_MS = 2_000;

/** The two topics the committee debates. */
const TOPICS = ['Climate finance', 'Maritime security'];

/** A whole test walks nine steps with two browsers, so it gets more time than one page. */
const WHOLE_SESSION_TIMEOUT_MS = 240_000;

/** The phone the delegate watches on, the same size as the `phone` project's. */
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

/** The laptop the chair runs the room on, the size of the session mockup. */
const LAPTOP = { viewport: { width: 1672, height: 941 } };

/** Add Kenya and Brazil to the fixture's three seats, and give the committee its topics. */
async function prepareCommittee(room: ChairedCommittee): Promise<void> {
	const admin = createServiceRoleClient();

	const { error: seatsError } = await admin.from('seats').insert([
		{ committee_id: room.committeeId, name: 'Kenya', country_code: 'KE', position: 4 },
		{ committee_id: room.committeeId, name: 'Brazil', country_code: 'BR', position: 5 }
	]);
	if (seatsError) throw new Error(`Could not add the seats: ${seatsError.message}`);

	const { error } = await admin
		.from('committees')
		.update({ topics: TOPICS })
		.eq('id', room.committeeId);
	if (error) throw new Error(`Could not give the committee its topics: ${error.message}`);
}

/** Open one of the chair pages from the mode bar or the committee menu, without reloading. */
async function openChairPage(chair: Page, tabName: string, path: string): Promise<void> {
	await pressChairTab(chair, tabName);
	await expect(chair).toHaveURL(new RegExp(`/chair${path}$`), { timeout: DATABASE_TIMEOUT_MS });
}

/** Wait for the delegate's screen to show `text`, within the two seconds allowed. */
async function expectDelegateSees(delegate: Page, text: string | RegExp): Promise<void> {
	await expect(delegate.getByRole('main').getByText(text).first()).toBeVisible({
		timeout: REALTIME_TIMEOUT_MS
	});
}

/** Wait for the delegate's screen to show the region named `name`, such as the floor of a mode. */
async function expectDelegateRegion(delegate: Page, name: string | RegExp): Promise<void> {
	await expect(delegate.getByRole('region', { name })).toBeVisible({
		timeout: REALTIME_TIMEOUT_MS
	});
}

/** The waiting rows of the chair's queue, top to bottom. */
function chairQueueRows(chair: Page): Locator {
	return chair.getByRole('main').locator('ol[data-sortable-list] > li');
}

/** The delegate's read-only list under the floor (S13). */
function delegateQueueRows(delegate: Page): Locator {
	return delegate.getByRole('region', { name: 'Speakers’ list' }).getByRole('listitem');
}

/** The delegate's floor in formal debate, the General Speakers' List (S13). */
function delegateFloor(delegate: Page): Locator {
	return delegate.getByRole('region', { name: 'General Speakers’ List' });
}

/** The chair's floor, the GSL view's left column (S4). */
function chairFloor(chair: Page): Locator {
	return floorRegion(chair);
}

/** Add a seat to the queue with the add box and Enter (S4). */
async function addSpeaker(chair: Page, seatName: string): Promise<void> {
	await addBox(chair).click();
	await addBox(chair).fill(seatName);
	await addBox(chair).press('Enter');
	await expect(chairQueueRows(chair).filter({ hasText: seatName })).toHaveCount(1, {
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(chair);
}

/** Drag a waiting row by its handle to the top of the queue with the mouse. */
async function dragToTop(chair: Page, seatName: string): Promise<void> {
	const handle = chair.getByRole('button', { name: `Reorder ${seatName}` });
	const handleBox = await handle.boundingBox();
	const firstRowBox = await chairQueueRows(chair).first().boundingBox();

	if (!handleBox || !firstRowBox) throw new Error('The queue is not on the screen.');

	const x = handleBox.x + handleBox.width / 2;
	await chair.mouse.move(x, handleBox.y + handleBox.height / 2);
	await chair.mouse.down();
	// Small steps, as a hand moves, so the other rows make room on the way.
	await chair.mouse.move(x, firstRowBox.y + 4, { steps: 12 });
	await chair.mouse.up();
	await waitUntilAnswered(chair);
}

/** Open the floor's "Yield" menu, a `<details>`. */
async function openYieldMenu(chair: Page): Promise<void> {
	await chairFloor(chair).locator('summary', { hasText: 'Yield' }).click();
}

/** Press one of the floor's buttons: the speech controls, or "Next" and "Call". */
async function pressSpeechControl(chair: Page, label: string): Promise<void> {
	await chairFloor(chair).getByRole('button', { name: label }).click();
	await waitUntilAnswered(chair);
}

/** How tall the chair's top bar is drawn, in pixels. */
async function headerHeight(chair: Page): Promise<number> {
	const box = await chair.getByRole('banner').boundingBox();

	if (!box) throw new Error('The top bar is not on the screen.');

	return box.height;
}

test('a whole session runs from start to end, and the delegate follows every step', async ({
	browser
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'Two browsers side by side need JavaScript.');
	test.setTimeout(WHOLE_SESSION_TIMEOUT_MS);

	const room = await makeChairedCommittee('Whole Session MUN');
	await prepareCommittee(room);
	const delegateUser = await createTestUser('Whole Session Delegate');
	await giveSeat(delegateUser, room.committeeId, 'Japan');

	const chairContext = await browser.newContext(LAPTOP);
	const delegateContext = await browser.newContext(PHONE);
	const chair = await chairContext.newPage();
	const delegate = await delegateContext.newPage();

	await signIn(chair, room.chair);
	await signIn(delegate, delegateUser);
	await openRoom(chair, room.roomPath);
	await markPage(chair);

	const isListening = roomChannelListening(delegate);
	await delegate.goto(livePathOf(room));
	await isListening;
	await expectDelegateSees(delegate, 'No session is running');

	// 1. Start the session from the lobby. The fixture conference's days are
	// past, so the button names the next numbered session. The live room opens
	// on the GSL view with the opening band, "Before debate", above it (S5).
	await chair.getByRole('button', { name: 'Start Session 1' }).click();
	await expect(chair.getByRole('heading', { name: 'Before debate' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(chair);
	await expectDelegateSees(delegate, 'The session has started');

	// 2. Take the roll call: everybody present from the band, then Kenya absent
	// in the roll call view, which the band's "Edit" opens.
	const band = chair.getByRole('region', { name: 'Before debate' });
	await band.getByRole('button', { name: 'Mark all present' }).click();
	await expect(band.getByText('5 of 5 present · quorum met')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(chair);
	await band.getByRole('link', { name: 'Edit' }).click();
	await expect(chair.getByRole('heading', { name: /^Roll call · Session 1/ })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	const kenya = chair.getByRole('form', { name: 'Attendance of Kenya' });
	await kenya.getByRole('button', { name: 'Absent', exact: true }).click();
	await expect(kenya.getByRole('button', { name: 'Absent', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true',
		{ timeout: DATABASE_TIMEOUT_MS }
	);
	await waitUntilAnswered(chair);
	await expect(
		chair.getByRole('banner').getByRole('link', { name: '4/5 present · quorum met' })
	).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expectDelegateSees(delegate, /^Japan · 4\/5 present/);
	// Every answer is saved as it is pressed; "Return to the floor" goes back.
	await chair.getByRole('link', { name: 'Return to the floor' }).click();
	await expect(chair).toHaveURL(room.roomPath, { timeout: DATABASE_TIMEOUT_MS });

	// 3. Set the agenda: one press on a topic in the band (S5). With no topic
	// yet the top bar reads "Set agenda" in plain text (S3).
	await expect(chair.getByRole('banner').getByText('Set agenda')).toBeVisible();
	await chair
		.getByRole('region', { name: 'Before debate' })
		.getByRole('button', { name: 'Maritime security' })
		.click();
	await waitUntilAnswered(chair);
	await expect(
		chair.getByRole('banner').locator('summary', { hasText: 'Maritime security' })
	).toBeVisible();
	await expectDelegateSees(delegate, 'Maritime security');
	const formalDebateHeaderHeight = await headerHeight(chair);

	// 4. The General Speakers' List, on the GSL view (S4): four seats, the first
	// one called, a drag, both yields.
	for (const seatName of ['France', 'Ghana', 'Japan', 'Brazil']) {
		await addSpeaker(chair, seatName);
	}

	// Over an empty floor the chair's one button calls the seat waiting first,
	// which ends the opening for every screen (S5).
	await pressSpeechControl(chair, 'Call France');
	await expect(chairFloor(chair).getByText('France', { exact: true })).toBeVisible();
	await expect(chair.getByRole('heading', { name: 'Before debate' })).toHaveCount(0);
	await expect(delegateFloor(delegate).getByText('France', { exact: true })).toBeVisible({
		timeout: REALTIME_TIMEOUT_MS
	});
	await expect(delegateQueueRows(delegate)).toHaveText([/Ghana/, /Japan.*You/, /Brazil/], {
		timeout: REALTIME_TIMEOUT_MS
	});
	await expect(delegateFloor(delegate).getByText(/^You are 2nd/)).toBeVisible({
		timeout: REALTIME_TIMEOUT_MS
	});

	await dragToTop(chair, 'Brazil');
	await expect(chairQueueRows(chair)).toHaveText([/Brazil/, /Ghana/, /Japan/]);
	await expect(delegateQueueRows(delegate)).toHaveText([/Brazil/, /Ghana/, /Japan.*You/], {
		timeout: REALTIME_TIMEOUT_MS
	});

	// France yields to the chair: the floor empties, and Brazil is called next.
	await openYieldMenu(chair);
	await chairFloor(chair)
		.getByRole('button', { name: /To the chair/ })
		.click();
	await waitUntilAnswered(chair);
	await expect(chairFloor(chair).getByText('Nobody has the floor')).toBeVisible();
	await expect(delegateFloor(delegate).getByText('Nobody has the floor')).toBeVisible({
		timeout: REALTIME_TIMEOUT_MS
	});
	await pressSpeechControl(chair, 'Call Brazil');
	await expect(delegateFloor(delegate).getByText('Brazil', { exact: true })).toBeVisible({
		timeout: REALTIME_TIMEOUT_MS
	});

	// Brazil yields the rest of the time to Japan, the delegate's own seat.
	await openYieldMenu(chair);
	await chairFloor(chair).getByRole('button', { name: 'Japan' }).click();
	await waitUntilAnswered(chair);
	await expect(chairFloor(chair).getByText('Japan', { exact: true })).toBeVisible();
	await expect(delegateFloor(delegate).getByText('You have the floor')).toBeVisible({
		timeout: REALTIME_TIMEOUT_MS
	});

	await pressSpeechControl(chair, 'End speech');
	await expect(chairFloor(chair).getByRole('button', { name: 'Call Ghana' })).toBeVisible();
	await expect(delegateFloor(delegate).getByText('Nobody has the floor')).toBeVisible({
		timeout: REALTIME_TIMEOUT_MS
	});
	await saveFullPageScreenshot(chair, 'committee-session-room');

	// 5. A moderated caucus recorded in Motions and passed, which lands the
	// chair on the live room drawing the caucus (S6, S7); then an unmoderated
	// one, started from the Unmod view (S8).
	await openChairPage(chair, 'Motions', '/motions');
	const composer = chair.getByRole('form', { name: 'Record a motion' });
	await composer
		.locator('label')
		.filter({ has: chair.getByRole('radio', { name: 'Mod', exact: true }) })
		.click();
	const raisedBy = composer.getByRole('combobox', { name: 'Raised by' });
	await raisedBy.fill('Ghana');
	await raisedBy.press('Enter');
	await composer.locator('input[name="topic"]').fill('Piracy off the coast');
	await composer.locator('input[name="totalTime"]').fill('10');
	await composer.locator('input[name="speakingTime"]').fill('1:00');
	await composer.getByRole('button', { name: 'Add to floor' }).click();
	await waitUntilAnswered(chair);
	const motionOnFloor = delegate.getByRole('region', { name: 'Motion on the floor' });
	await expect(motionOnFloor.getByText('Piracy off the coast · Ghana')).toBeVisible({
		timeout: REALTIME_TIMEOUT_MS
	});

	const nextToVote = chair.getByRole('region', { name: /^Next to vote/ });
	await nextToVote.getByLabel('For', { exact: true }).fill('4');
	await nextToVote.getByLabel('Against', { exact: true }).fill('0');
	await nextToVote.getByRole('button', { name: 'Pass', exact: true }).click();
	await expect(chair).toHaveURL(room.roomPath, { timeout: DATABASE_TIMEOUT_MS });
	await waitUntilAnswered(chair);
	await expect(
		chair.getByRole('region', { name: 'Moderated caucus · Piracy off the coast' })
	).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expectDelegateRegion(delegate, 'Moderated caucus · Piracy off the coast');
	// The top bar keeps its height whatever the mode is called, so the page does not jump.
	expect(await headerHeight(chair)).toBe(formalDebateHeaderHeight);

	// "End caucus" on the caucus line returns the room to the General Speakers' List.
	await chair.getByRole('button', { name: 'End caucus' }).click();
	await waitUntilAnswered(chair);
	await expect(chairFloor(chair)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expectDelegateRegion(delegate, 'General Speakers’ List');

	await openChairPage(chair, 'Unmod', '/unmod');
	await chair
		.locator('label')
		.filter({ has: chair.getByRole('radio', { name: '5 min', exact: true }) })
		.click();
	await chair.getByRole('button', { name: 'Start caucus' }).click();
	await expect(chair.getByRole('button', { name: 'End caucus' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(chair);
	// The chair who started it stays on the Unmod view, now running.
	await expect(chair).toHaveURL(`${room.roomPath}/unmod`);
	await expectDelegateRegion(delegate, /^Unmoderated caucus/);
	await chair.getByRole('button', { name: 'End caucus' }).click();
	await expect(chair).toHaveURL(room.roomPath, { timeout: DATABASE_TIMEOUT_MS });
	await waitUntilAnswered(chair);
	await expectDelegateRegion(delegate, 'General Speakers’ List');

	// 6. Chair notes, on the session's notes page from the committee menu's
	// Notes (S4), save themselves while the chair types.
	await openChairPage(chair, 'Notes', '/notes');
	await chair.getByRole('link', { name: /^Session 1/ }).click();
	await chair.getByRole('textbox', { name: 'Chair Notes' }).fill('Ghana and Brazil are close.');
	await expect(chair.getByText(/Auto-saved/)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await openChairPage(chair, 'Room', '');

	// 7. Suspend from the mode bar, and resume from the suspended screen (S11).
	await modeBar(chair).getByRole('button', { name: 'Suspend' }).click();
	await expect(chair.getByRole('heading', { level: 1, name: /^Suspended/ })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(chair);
	await expectDelegateSees(delegate, /^Suspended/);
	await chair.getByRole('button', { name: 'Resume session' }).click();
	await waitUntilAnswered(chair);
	await expectDelegateRegion(delegate, 'General Speakers’ List');

	// 8. A show-of-hands vote on a draft resolution, on the Vote view (S10).
	await openChairPage(chair, 'Vote', '/voting');
	await chair.getByLabel('On', { exact: true }).fill('Draft Resolution 1.1');
	await chair.getByRole('button', { name: 'Open vote' }).click();
	await expect(chair.getByRole('heading', { name: /^Draft Resolution 1\.1/ })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(chair);
	const delegateVote = delegate.getByRole('region', { name: 'Draft Resolution 1.1' });
	await expect(delegateVote.getByText('Simple majority · voting by show of hands')).toBeVisible({
		timeout: REALTIME_TIMEOUT_MS
	});

	await chair.getByLabel('For', { exact: true }).fill('3');
	await chair.getByLabel('Against', { exact: true }).fill('1');
	await chair.getByRole('button', { name: /^Close vote/ }).click();
	await expect(chair.getByText('Draft Resolution 1.1 passes', { exact: true })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(chair);
	await expectDelegateRegion(delegate, 'Draft Resolution 1.1 passes');
	await chair.getByRole('button', { name: 'End voting' }).click();
	await expect(chair).toHaveURL(room.roomPath, { timeout: DATABASE_TIMEOUT_MS });
	await waitUntilAnswered(chair);
	await expectDelegateRegion(delegate, 'General Speakers’ List');

	// 9. End the session from the mode bar, which asks in place (S3).
	await modeBar(chair).getByRole('link', { name: 'End', exact: true }).click();
	await chair.getByRole('button', { name: 'End session' }).click();
	await expect(chair.getByRole('heading', { level: 1, name: 'Session 1 has ended' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(chair);
	await expectDelegateSees(delegate, 'Session 1 has ended');

	// No press along the way reloaded the chair's page.
	expect(await readMarker(chair)).toBe('still here');
	const state = await readCommitteeState(room.committeeId);
	expect(state.mode).toBe('idle');
	expect(state.agenda_topic).toBe('Maritime security');

	await chairContext.close();
	await delegateContext.close();
});
