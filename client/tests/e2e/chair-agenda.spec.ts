import { expect, test, type Locator, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	DATABASE_TIMEOUT_MS,
	endSessionFromFrame,
	makeChairedCommittee,
	openRoom,
	pressChairTab,
	readCommitteeState,
	startSession,
	type ChairedCommittee,
	waitUntilAnswered
} from './chair-room-fixtures';
import { livePathOf, roomChannelListening } from './committee-live-fixtures';
import { createTestUser, giveSeat, signIn } from './signed-in-user';

// T127 and S3: the chair sets the agenda from the agenda menu in the console's
// top bar, on whichever chair page they are, and every screen shows it
// (specs/05-pages/chair/committee-room.md, "Agenda menu"). One press on a
// topic sets it, closes the menu and leaves the chair where they were; a
// delegate's live view names it within two seconds; ending and starting a
// session keep it.
//
// The menu is a native `<details>` and each topic a plain form, so the test
// runs on all three projects. With JavaScript the delegate's screen follows
// through realtime within two seconds; without it the delegate reloads.

/** How long the realtime criterion allows a second screen to catch up. */
const REALTIME_TIMEOUT_MS = 2_000;

/** The two topics the fixture committee debates. */
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

/** The agenda menu's trigger in the top bar. */
function agendaTrigger(page: Page): Locator {
	return page.locator('details[data-agenda-menu] > summary');
}

/**
 * Open the agenda menu and press one topic. A click that lands before the
 * page's script has started can be undone when Svelte takes the page over,
 * so the menu is opened again until its topics show.
 */
async function chooseTopic(page: Page, topic: string): Promise<void> {
	const menu = page.locator('details[data-agenda-menu]');
	const topicButton = menu.getByRole('button', { name: topic });

	await expect(async () => {
		if ((await menu.getAttribute('open')) === null) await agendaTrigger(page).click();
		await expect(topicButton).toBeVisible({ timeout: 1_000 });
	}).toPass({ timeout: DATABASE_TIMEOUT_MS });

	await topicButton.click();
}

test('the chair sets the agenda from any view, a delegate sees it, and the next session keeps it', async ({
	page,
	browser
}, testInfo) => {
	const hasJavaScript = testInfo.project.use.javaScriptEnabled !== false;
	const room = await makeChairedCommittee('Agenda Chair Room MUN');
	await giveTopics(room);
	const delegate = await createTestUser('Agenda Delegate');
	await giveSeat(delegate, room.committeeId, 'France');

	await signIn(page, room.chair);
	await openRoom(page, room.roomPath);
	await startSession(page);

	// Nothing is on the agenda yet: the trigger reads "Set agenda" in plain ink (P4).
	await expect(agendaTrigger(page)).toHaveText('Set agenda');
	await expect(agendaTrigger(page)).not.toHaveClass(/warning/);

	// The second screen: a delegate's live view, in a browser of its own. It
	// takes the project's settings, so on `desktop-no-js` it has no script either.
	const delegateContext = await browser.newContext();
	const delegatePage = await delegateContext.newPage();
	await signIn(delegatePage, delegate);
	const isListening = hasJavaScript ? roomChannelListening(delegatePage) : Promise.resolve();
	await delegatePage.goto(livePathOf(room));
	await expect(delegatePage.getByRole('heading', { name: /UNSC/, level: 1 })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await isListening;
	await expect(delegatePage.getByText('Protection of civilians')).toHaveCount(0);

	// The chair is on Motions, not the live room, and sets the agenda from there.
	await pressChairTab(page, 'Motions');
	await expect(page).toHaveURL(`${room.roomPath}/motions`, { timeout: DATABASE_TIMEOUT_MS });
	await chooseTopic(page, 'Protection of civilians');

	// The trigger names the topic, the menu is shut, and the chair is still on Motions.
	await expect(agendaTrigger(page)).toHaveText('Protection of civilians', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.locator('details[data-agenda-menu]')).not.toHaveAttribute('open');
	await expect(page).toHaveURL(`${room.roomPath}/motions`);
	// The screen shows the result before the server has saved it (T141), so wait for its answer.
	await waitUntilAnswered(page);
	expect((await readCommitteeState(room.committeeId)).agenda_topic).toBe('Protection of civilians');

	if (!hasJavaScript) await delegatePage.reload();

	// The delegate's heading names the committee and its agenda (S13).
	await expect(
		delegatePage.getByRole('heading', { level: 1, name: /Protection of civilians/ })
	).toBeVisible({
		timeout: hasJavaScript ? REALTIME_TIMEOUT_MS : DATABASE_TIMEOUT_MS
	});

	// Opened again, the menu ticks the topic now under debate.
	await chooseTopic(page, 'Climate finance');
	await expect(agendaTrigger(page)).toHaveText('Climate finance', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(page);

	// Ending the session leaves the agenda alone, and the next session opens on it.
	await pressChairTab(page, 'Room');
	await endSessionFromFrame(page);
	expect((await readCommitteeState(room.committeeId)).agenda_topic).toBe('Climate finance');

	await startSession(page);
	await expect(agendaTrigger(page)).toHaveText('Climate finance');

	await delegateContext.close();
});

test('?agenda=change draws the agenda menu open on any chair page, its topic ticked', async ({
	page
}) => {
	const room = await makeChairedCommittee('Agenda Menu Address MUN');
	await giveTopics(room);
	await createServiceRoleClient()
		.from('committee_state')
		.update({ agenda_topic: 'Climate finance' })
		.eq('committee_id', room.committeeId);

	await signIn(page, room.chair);
	await openRoom(page, room.roomPath);
	await startSession(page);

	await page.goto(`${room.roomPath}/voting?agenda=change`);

	const menu = page.locator('details[data-agenda-menu]');
	await expect(menu).toHaveAttribute('open', '', { timeout: DATABASE_TIMEOUT_MS });
	await expect(menu.getByRole('button', { name: 'Climate finance' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(menu.getByRole('button', { name: 'Protection of civilians' })).toHaveAttribute(
		'aria-pressed',
		'false'
	);
});

test('a committee with no topics has no agenda menu', async ({ page }) => {
	const room = await makeChairedCommittee('No Topics Chair Room MUN');

	await signIn(page, room.chair);
	await openRoom(page, room.roomPath);
	await startSession(page);

	await expect(page.locator('details[data-agenda-menu]')).toHaveCount(0);
	await expect(page.getByRole('banner').getByText('Set agenda')).toHaveCount(0);
});
