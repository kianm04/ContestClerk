import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { ClickBudgetJourney } from './click-budget';
import {
	DATABASE_TIMEOUT_MS,
	makeChairedCommittee,
	modeBarTab,
	openRoom,
	pressChairTab,
	readCommitteeState,
	takeRollCall,
	type ChairedCommittee,
	waitUntilAnswered
} from './chair-room-fixtures';
import {
	readEntries,
	readSpeakingSeat,
	seedWaiting,
	setSpeakerClock,
	startSessionDirectly
} from './gsl-fixtures';
import { skipWithoutJavaScript } from './in-place';
import { expectNoSidewaysOverflow, saveFullPageScreenshot } from './page-shape';
import { signIn } from './signed-in-user';

// The acceptance criteria of `specs/05-pages/chair/voting.md` that need a real
// browser: who may open the view, the set-up and its states, what opening a
// vote does to the room, counting hands (saved as it is counted, so a second
// screen follows), the roll call vote with its refusals and keys, closing that
// keeps the room in voting with the result on show, "End voting", "Open
// another vote", Cancel asked in place, "Votes this session", the one filled
// button of each state, the view's shape at 1280, 1024 and 390, and the click
// budget "Open and close a counted vote" (S10).
//
// Every button is a plain `<form method="post">` or a link, so a test runs on
// all three projects unless it needs JavaScript (stepping, the keys, a second
// screen) or one window size; `desktop-no-js` proves the view works without
// JavaScript. The session is started straight in the database
// (`startSessionDirectly`), so these tests do not depend on the lobby. The
// committee has three seats; most tests take a roll call with Japan absent,
// so France and Ghana are present.

/** How long the realtime criterion allows a second screen to catch up. */
const REALTIME_TIMEOUT_MS = 2_000;

/** The width of a 1024 × 768 laptop, at which the roll call vote keeps two columns. */
const SMALL_LAPTOP = { width: 1024, height: 768 };

/** The narrowest the roll call vote's right column may be, in pixels. */
const MIN_SIDE_COLUMN_PX = 320;

/** The smallest touch target the design system allows, in pixels. */
const MIN_TOUCH_TARGET_PX = 44;

/** What the set-up is filled in with. */
type VoteFields = {
	subject: string;
	method: 'Count hands' | 'Roll call';
	majority?: 'Simple' | 'Two-thirds';
	kind?: 'Substantive' | 'Procedural';
};

const HANDS_VOTE: VoteFields = { subject: 'Draft Resolution 1.2', method: 'Count hands' };

const ROLL_CALL_VOTE: VoteFields = {
	subject: 'Draft Resolution 1.1',
	method: 'Roll call',
	majority: 'Two-thirds'
};

/** The Vote view's address. */
function votingPath(room: ChairedCommittee): string {
	return `${room.roomPath}/voting`;
}

/** Open the Vote view and wait for the console to be drawn around it. */
async function openVoting(page: Page, room: ChairedCommittee, search = ''): Promise<void> {
	await page.goto(`${votingPath(room)}${search}`);
	await expect(page.getByRole('banner').getByTitle('Security Council')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
}

/** Start a session, take a roll call with Japan absent, sign the chair in and open the view. */
async function openWithRollCall(page: Page, room: ChairedCommittee): Promise<void> {
	await startSessionDirectly(room);
	await takeRollCall(room, 'Japan');
	await signIn(page, room.chair);
	await openVoting(page, room);
	// What a test changes on the page before it comes to life, Svelte puts back.
	await waitUntilListening(page, test.info());
}

/** Press one segment of the set-up, by its words: "Procedural", "Two-thirds", "Roll call". */
async function chooseSegment(page: Page, label: string): Promise<void> {
	await page
		.locator('label')
		.filter({ hasText: new RegExp(`^\\s*${label}\\s*$`) })
		.click();
	await expect(page.getByRole('radio', { name: label })).toBeChecked();
}

/**
 * Fill in the set-up, press "Open vote" and wait for the open vote to be
 * drawn and saved. With JavaScript it waits for the page to come to life
 * first: what is typed and chosen before then, Svelte puts back to the set-up's
 * own state as it takes over, and an empty "On" is refused.
 */
async function openVote(page: Page, fields: VoteFields): Promise<void> {
	await waitUntilListening(page, test.info());
	await page.getByLabel('On', { exact: true }).fill(fields.subject);
	if (fields.kind) await chooseSegment(page, fields.kind);
	if (fields.majority) await chooseSegment(page, fields.majority);
	await chooseSegment(page, fields.method);
	await page.getByRole('button', { name: 'Open vote' }).click();

	await expect(page.getByRole('heading', { name: new RegExp(`^${fields.subject}`) })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	// The open vote shows before the server has saved it (T141); a test that
	// opens another address next must find it saved.
	await waitUntilAnswered(page);
}

/** The view, inside the console's `<main>`. */
function view(page: Page): Locator {
	return page.locator('#main');
}

/** "Close vote: passes", "Close vote: fails", or "Close vote" without JavaScript. */
function closeVoteButton(page: Page): Locator {
	return view(page).getByRole('button', { name: /^Close vote/ });
}

/** Type the three counts of a show of hands. */
async function typeCounts(page: Page, counts: [string, string, string]): Promise<void> {
	await page.getByLabel('For', { exact: true }).fill(counts[0]);
	await page.getByLabel('Against', { exact: true }).fill(counts[1]);
	await page.getByLabel('Abstain', { exact: true }).fill(counts[2]);
}

/** One seat's answers in a roll call vote. */
function seatRow(page: Page, seatName: string): Locator {
	return page.getByRole('form', { name: `Vote of ${seatName}` });
}

/** The list item of one seat in a roll call vote, which carries the ▸ marker. */
function seatItem(page: Page, seatName: string): Locator {
	return page
		.getByRole('list', { name: 'Seats voting' })
		.getByRole('listitem')
		.filter({
			has: seatRow(page, seatName)
		});
}

/** Press one of a seat's answers and wait for it to show pressed and saved. */
async function castVote(page: Page, seatName: string, answer: 'Yes' | 'No' | 'Abstain') {
	const button = seatRow(page, seatName).getByRole('button', { name: answer, exact: true });

	await button.click();
	await expect(button).toHaveAttribute('aria-pressed', 'true', { timeout: DATABASE_TIMEOUT_MS });
	await waitUntilAnswered(page);
}

/** The view's filled buttons: there is exactly one in each state (P1). */
async function expectOneFilledButton(page: Page, name: RegExp): Promise<void> {
	const filled = view(page).locator(':is(.bg-primary, .bg-brand-900)');

	await expect(filled).toHaveCount(1);
	await expect(filled).toHaveText(name);
}

/** Fails when the view needs scrolling to be seen whole. */
async function expectViewFits(page: Page): Promise<void> {
	const scroll = await page.evaluate(() => {
		const main = document.getElementById('main');

		return main ? main.scrollHeight - main.clientHeight : 0;
	});

	expect(scroll).toBeLessThanOrEqual(1);
}

/**
 * With JavaScript, wait until the page is listening to the room. A press
 * made while the page is still starting can be lost.
 */
async function waitUntilListening(page: Page, testInfo: TestInfo): Promise<void> {
	if (testInfo.project.name === 'desktop-no-js') return;

	await expect(page.getByText('Connected', { exact: true })).toBeAttached({
		timeout: DATABASE_TIMEOUT_MS
	});
}

/** The id of one of the committee's seats. */
async function readSeatId(room: ChairedCommittee, seatName: string): Promise<string> {
	const admin = createServiceRoleClient();
	const { data, error } = await admin
		.from('seats')
		.select('id')
		.eq('committee_id', room.committeeId)
		.eq('name', seatName)
		.single();

	if (error || !data) throw new Error(`Could not read the seat: ${error?.message}`);

	return data.id;
}

/** Mark `seatName` in the roll call `takeRollCall` recorded. */
async function markSeat(
	room: ChairedCommittee,
	seatName: string,
	status: 'absent' | 'present_and_voting'
): Promise<void> {
	const admin = createServiceRoleClient();
	const seatId = await readSeatId(room, seatName);
	const { error } = await admin.from('roll_call_entries').update({ status }).eq('seat_id', seatId);

	if (error) throw new Error(`Could not mark the seat: ${error.message}`);
}

/** The committee's votes, as the database holds them, oldest first. */
async function readVotes(committeeId: string) {
	const admin = createServiceRoleClient();
	const { data, error } = await admin
		.from('votes')
		.select('id, kind, status, passed, votes_for, votes_against, votes_abstain')
		.eq('committee_id', committeeId)
		.order('opened_at', { ascending: true });

	if (error) throw new Error(`Could not read the votes: ${error.message}`);

	return data ?? [];
}

/** Put the room into voting with no vote, as "Close debate" passing does. */
async function setRoomVoting(room: ChairedCommittee): Promise<void> {
	const admin = createServiceRoleClient();
	const { error } = await admin
		.from('committee_state')
		.update({ mode: 'voting', current_vote_id: null })
		.eq('committee_id', room.committeeId);

	if (error) throw new Error(`Could not put the room into voting: ${error.message}`);
}

/** Give `seatName` the floor on the General Speakers' List, with a running clock. */
async function seedSpeaker(room: ChairedCommittee, seatName: string): Promise<void> {
	const admin = createServiceRoleClient();
	await seedWaiting(room, [seatName]);
	const seatId = await readSeatId(room, seatName);
	const state = await readCommitteeState(room.committeeId);
	const { data: entry } = await admin
		.from('speakers_list_entries')
		.update({ status: 'speaking' })
		.eq('speakers_list_id', state.active_speakers_list_id ?? '')
		.eq('seat_id', seatId)
		.select('id')
		.single();
	await admin
		.from('committee_state')
		.update({ current_speaker_entry_id: entry?.id ?? null })
		.eq('committee_id', room.committeeId);
	await setSpeakerClock(room, { runsForSeconds: 60 });
}

/**
 * Send a seat's form with another seat's id in it, the way a hand-made request
 * could, so the server's own check is what answers.
 */
async function pointRowAtSeat(page: Page, rowSeatName: string, seatId: string): Promise<void> {
	await seatRow(page, rowSeatName)
		.locator('input[name="seatId"]')
		.evaluate((input, id) => {
			input.setAttribute('value', id);
		}, seatId);
}

test('is not found for the chair of another committee', async ({ page }) => {
	const room = await makeChairedCommittee('Stranger Voting MUN');
	const otherRoom = await makeChairedCommittee('Other Voting MUN');

	await signIn(page, otherRoom.chair);
	const response = await page.goto(votingPath(room));

	expect(response?.status()).toBe(404);
});

test.describe('the set-up', () => {
	test('says no session is running, with no set-up, then waits for a roll call', async ({
		page
	}) => {
		const room = await makeChairedCommittee('Not Ready Voting MUN');

		await signIn(page, room.chair);
		await openVoting(page, room);
		// Without a session a neutral Notice points at the chair room, and no set-up is drawn (P4).
		await expect(view(page).getByText('No session is running.')).toBeVisible();
		// The server writes the link relative to the page ("../../chair"), which the
		// browser keeps until the client router rewrites it, never without JavaScript.
		await expect(view(page).getByRole('link', { name: 'Open the chair room' })).toHaveAttribute(
			'href',
			new RegExp(`${room.roomPath}$`)
		);
		await expect(page.getByRole('button', { name: 'Open vote' })).toHaveCount(0);

		await startSessionDirectly(room);
		await openVoting(page, room);
		await expect(view(page).getByText('Take roll call before opening a vote.')).toBeVisible();
		await expect(view(page).getByRole('link', { name: 'Take roll call' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Open vote' })).toBeDisabled();
	});

	test('is a form on the view with Substantive, Simple and Count hands chosen, and "Open vote" the one filled button', async ({
		page
	}) => {
		const room = await makeChairedCommittee('Setup Voting MUN');

		await openWithRollCall(page, room);
		await expect(page.getByRole('heading', { name: 'Open a vote' })).toBeVisible();
		await expect(page.getByRole('dialog')).toHaveCount(0);
		await expect(page.getByRole('radio', { name: 'Substantive' })).toBeChecked();
		await expect(page.getByRole('radio', { name: 'Simple' })).toBeChecked();
		await expect(page.getByRole('radio', { name: 'Count hands' })).toBeChecked();
		await expect(
			view(page).getByText('2 present · simple majority: more for than against')
		).toBeVisible();
		await expectOneFilledButton(page, /Open vote/);
		// Nothing is voting yet, so "End voting" is not offered.
		await expect(page.getByRole('button', { name: 'End voting' })).toHaveCount(0);

		await openVote(page, { ...HANDS_VOTE, kind: 'Procedural' });
		await waitUntilAnswered(page);
		expect(await readVotes(room.committeeId)).toMatchObject([
			{ kind: 'procedural', status: 'open' }
		]);
	});

	test('below quorum warns and still opens a vote', async ({ page }) => {
		const room = await makeChairedCommittee('Quorum Voting MUN');

		await startSessionDirectly(room);
		await takeRollCall(room, 'Japan');
		await markSeat(room, 'Ghana', 'absent');
		await signIn(page, room.chair);
		await openVoting(page, room);

		const warning = view(page).getByText('No quorum: 1 of 3 present');
		await expect(warning).toBeVisible();
		await expect(warning).toHaveClass(/text-warning-700/);

		await openVote(page, HANDS_VOTE);
		await waitUntilAnswered(page);
		expect(await readVotes(room.committeeId)).toHaveLength(1);
	});

	test('asks for a subject and keeps what was chosen', async ({ page }) => {
		const room = await makeChairedCommittee('Validation Voting MUN');

		await openWithRollCall(page, room);
		// The browser's own `required` would stop the form, so the check is the server's.
		await page.getByLabel('On', { exact: true }).evaluate((input) => {
			input.removeAttribute('required');
		});
		await chooseSegment(page, 'Two-thirds');
		await page.getByRole('button', { name: 'Open vote' }).click();

		await expect(page.getByText('Say what the committee is voting on.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(page.getByRole('radio', { name: 'Two-thirds' })).toBeChecked();
		expect(await readVotes(room.committeeId)).toHaveLength(0);
	});

	test('opening a vote while someone speaks ends the speech with its time and clears the clocks', async ({
		page
	}) => {
		const room = await makeChairedCommittee('Speech Voting MUN');

		await startSessionDirectly(room);
		await takeRollCall(room, 'Japan');
		await seedSpeaker(room, 'France');
		await signIn(page, room.chair);
		await openVoting(page, room);
		await openVote(page, HANDS_VOTE);
		await waitUntilAnswered(page);

		const state = await readCommitteeState(room.committeeId);
		expect(state).toMatchObject({
			mode: 'voting',
			current_speaker_entry_id: null,
			timer_total_seconds: null,
			timer_ends_at: null
		});
		expect(state.current_vote_id).not.toBeNull();
		const [france] = await readEntries(room);
		expect(france).toMatchObject({ seat: 'France', status: 'spoken' });
		expect(france.spokeSeconds).not.toBeNull();
	});

	test('after "Close debate" the set-up offers "End voting" beside "Open vote", with the cursor in "On"', async ({
		page
	}, testInfo) => {
		const room = await makeChairedCommittee('Close Debate Voting MUN');

		await startSessionDirectly(room);
		await takeRollCall(room, 'Japan');
		await setRoomVoting(room);
		await signIn(page, room.chair);
		await openVoting(page, room);

		await expect(page.getByRole('button', { name: 'End voting' })).toBeVisible();
		await expectOneFilledButton(page, /Open vote/);
		if (testInfo.project.name !== 'desktop-no-js') {
			await expect(page.getByLabel('On', { exact: true })).toBeFocused();
		}

		await page.getByRole('button', { name: 'End voting' }).click();
		await expect(page).toHaveURL(room.roomPath, { timeout: DATABASE_TIMEOUT_MS });
		await waitUntilAnswered(page);
		expect(await readCommitteeState(room.committeeId)).toMatchObject({ mode: 'formal_debate' });
	});
});

test.describe('counting hands', () => {
	test('each − and + press moves the bar and the words at once, and the count is saved', async ({
		page
	}, testInfo) => {
		skipWithoutJavaScript(testInfo);
		const room = await makeChairedCommittee('Stepper Voting MUN');

		await openWithRollCall(page, room);
		await openVote(page, HANDS_VOTE);
		await expect(
			page.getByText('Count the hands for, then against, then abstentions.')
		).toBeVisible();
		await expect(closeVoteButton(page)).toBeDisabled();

		await page.getByRole('button', { name: 'One more for' }).click();
		await page.getByRole('button', { name: 'One more for' }).click();

		await expect(page.getByText('As counted, it passes.')).toBeVisible();
		await expect(view(page).getByText('passes at 2 for')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Close vote: passes' })).toBeEnabled();
		await expectOneFilledButton(page, /Close vote: passes/);

		await page.getByRole('button', { name: 'One fewer for' }).click();
		await page.getByRole('button', { name: 'One more against' }).click();
		await expect(page.getByText('As counted, it fails.')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Close vote: fails' })).toBeVisible();

		// Saved as it is counted, so the projector can follow.
		await waitUntilAnswered(page);
		await expect
			.poll(async () => (await readVotes(room.committeeId))[0], { timeout: DATABASE_TIMEOUT_MS })
			.toMatchObject({ votes_for: 1, votes_against: 1, votes_abstain: 0 });
	});

	test('closing keeps the room in voting with the result, until "End voting" returns to the GSL', async ({
		page
	}) => {
		const room = await makeChairedCommittee('Close Hands Voting MUN');

		await startSessionDirectly(room);
		await takeRollCall(room, 'Japan');
		await seedWaiting(room, ['Ghana', 'France']);
		await signIn(page, room.chair);
		await openVoting(page, room);
		await openVote(page, HANDS_VOTE);
		await typeCounts(page, ['2', '0', '0']);
		await closeVoteButton(page).click();

		await expect(page.getByText('Draft Resolution 1.2 passes')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(page.getByText('2 for · 0 against · 0 abstentions')).toBeVisible();
		await expect(view(page).getByText('Vote closed')).toBeVisible();
		await expectOneFilledButton(page, /End voting/);
		await waitUntilAnswered(page);
		const votes = await readVotes(room.committeeId);
		expect(votes).toMatchObject([{ status: 'closed', passed: true, votes_for: 2 }]);
		expect(await readCommitteeState(room.committeeId)).toMatchObject({
			mode: 'voting',
			current_vote_id: votes[0].id
		});

		await page.getByRole('button', { name: 'End voting' }).click();
		await expect(page).toHaveURL(room.roomPath, { timeout: DATABASE_TIMEOUT_MS });
		await waitUntilAnswered(page);
		expect(await readCommitteeState(room.committeeId)).toMatchObject({
			mode: 'formal_debate',
			current_vote_id: null
		});
		// The General Speakers' List's waiting speakers are where they were.
		expect((await readEntries(room)).map((entry) => [entry.seat, entry.status])).toEqual([
			['Ghana', 'waiting'],
			['France', 'waiting']
		]);
	});

	test('a tie fails, and closing refuses an uncounted vote', async ({ page }) => {
		const room = await makeChairedCommittee('Tie Voting MUN');

		await openWithRollCall(page, room);
		await openVote(page, HANDS_VOTE);
		// With JavaScript the button waits for a count; the server says the same to a page without it.
		await closeVoteButton(page).evaluate((button) => button.removeAttribute('disabled'));
		await closeVoteButton(page).click();
		await expect(page.getByText('Count the votes before closing.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		await typeCounts(page, ['1', '1', '0']);
		await closeVoteButton(page).click();
		await expect(page.getByText('Draft Resolution 1.2 fails')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await waitUntilAnswered(page);
		expect(await readVotes(room.committeeId)).toMatchObject([{ status: 'closed', passed: false }]);
	});

	test('more hands than delegates present are refused', async ({ page }) => {
		const room = await makeChairedCommittee('Too Many Voting MUN');

		await openWithRollCall(page, room);
		await openVote(page, HANDS_VOTE);
		// Two seats are present, so three hands cannot have been counted.
		await typeCounts(page, ['3', '0', '0']);
		await closeVoteButton(page).click();

		await expect(page.getByText('More votes than delegates present.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		expect(await readVotes(room.committeeId)).toMatchObject([{ status: 'open' }]);
	});

	test('a second browser follows the count as it is made, and keeps the result while another vote is set up', async ({
		browser
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop', 'Realtime needs JavaScript and one project.');
		const room = await makeChairedCommittee('Realtime Voting MUN');
		const chairContext = await browser.newContext();
		const organiserContext = await browser.newContext();
		const chairPage = await chairContext.newPage();
		const organiserPage = await organiserContext.newPage();

		await openWithRollCall(chairPage, room);
		await openVote(chairPage, HANDS_VOTE);
		await signIn(organiserPage, room.organiser);
		await openVoting(organiserPage, room);
		await waitUntilListening(organiserPage, testInfo);
		await waitUntilListening(chairPage, testInfo);

		await chairPage.getByRole('button', { name: 'One more for' }).click();
		await expect(organiserPage.getByLabel('For', { exact: true })).toHaveValue('1', {
			timeout: REALTIME_TIMEOUT_MS + 1_000
		});

		await chairPage.getByRole('button', { name: 'Close vote: passes' }).click();
		await expect(organiserPage.getByText('Draft Resolution 1.2 passes')).toBeVisible({
			timeout: REALTIME_TIMEOUT_MS + 1_000
		});

		// "Open another vote" sets the next one up for this chair only.
		await chairPage.getByRole('link', { name: 'Open another vote' }).click();
		await expect(chairPage.getByRole('heading', { name: 'Open a vote' })).toBeVisible();
		await expect(organiserPage.getByText('Draft Resolution 1.2 passes')).toBeVisible();

		await chairContext.close();
		await organiserContext.close();
	});
});

test.describe('the roll call vote', () => {
	test('lists the present seats from the top, refuses absent seats and lets no present and voting seat abstain', async ({
		page
	}) => {
		const room = await makeChairedCommittee('Roll Call Voting MUN');

		await startSessionDirectly(room);
		await takeRollCall(room, 'Japan');
		await markSeat(room, 'France', 'present_and_voting');
		await signIn(page, room.chair);
		await openVoting(page, room);
		await openVote(page, ROLL_CALL_VOTE);

		await expect(view(page).getByText('From the top · keys Y, N, A')).toBeVisible();
		const rows = page.getByRole('list', { name: 'Seats voting' }).getByRole('listitem');
		await expect(rows).toHaveText([/France/, /Ghana/]);
		await expect(seatRow(page, 'Japan')).toHaveCount(0);
		const franceAbstain = seatRow(page, 'France').getByRole('button', { name: 'Abstain' });
		await expect(franceAbstain).toBeDisabled();
		await expect(franceAbstain.locator('xpath=..')).toHaveAttribute(
			'title',
			'Present and voting seats cannot abstain.'
		);
		await expect(seatRow(page, 'Ghana').getByRole('button', { name: 'Abstain' })).toBeEnabled();

		await pointRowAtSeat(page, 'Ghana', await readSeatId(room, 'Japan'));
		await seatRow(page, 'Ghana').getByRole('button', { name: 'Yes', exact: true }).click();
		await expect(page.getByText('That seat is not present.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		await openVoting(page, room);
		await waitUntilListening(page, test.info());
		await pointRowAtSeat(page, 'Ghana', await readSeatId(room, 'France'));
		await seatRow(page, 'Ghana').getByRole('button', { name: 'Abstain' }).click();
		await expect(page.getByText('Present and voting seats cannot abstain.').first()).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
	});

	test('records each answer with ✓ and "Clear", and closes with the result kept on show', async ({
		page
	}) => {
		const room = await makeChairedCommittee('Close Roll Call Voting MUN');

		await openWithRollCall(page, room);
		await openVote(page, ROLL_CALL_VOTE);
		await expect(page.getByText('2 to call')).toBeVisible();
		await expect(page.getByRole('complementary', { name: 'Tally' })).toBeVisible();

		await castVote(page, 'France', 'Yes');
		await expect(seatItem(page, 'France').getByRole('img', { name: 'Answered' })).toBeVisible();

		const ghanaNo = seatRow(page, 'Ghana').getByRole('button', { name: 'No', exact: true });
		await ghanaNo.press('Enter');
		await expect(ghanaNo).toHaveAttribute('aria-pressed', 'true', { timeout: DATABASE_TIMEOUT_MS });
		await waitUntilAnswered(page);
		// Without JavaScript the page reloads, and the focus comes back to the row pressed.
		await expect(
			seatRow(page, 'Ghana').getByRole('button', { name: 'No', exact: true })
		).toBeFocused();

		await seatItem(page, 'Ghana').getByRole('button', { name: 'Clear' }).click();
		await expect(seatItem(page, 'Ghana').getByRole('button', { name: 'Clear' })).toHaveCount(0, {
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(page.getByText('1 to call')).toBeVisible();

		await castVote(page, 'Ghana', 'Abstain');
		await expectOneFilledButton(page, /Close vote: passes/);
		await page.getByRole('button', { name: 'Close vote: passes' }).click();

		await expect(page.getByText('Draft Resolution 1.1 passes')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(page.getByText('1 for · 0 against · 1 abstention')).toBeVisible();
		await waitUntilAnswered(page);
		const state = await readCommitteeState(room.committeeId);
		expect(state.mode).toBe('voting');
		expect(state.current_vote_id).not.toBeNull();
	});

	test('Y, N and A answer the seat the marker is on and move it on; ↑ and ↓ move it; N calls no speaker', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop', 'Keys are a laptop’s.');
		const room = await makeChairedCommittee('Keys Voting MUN');

		await startSessionDirectly(room);
		await takeRollCall(room, 'Japan');
		await signIn(page, room.chair);
		await openVoting(page, room);
		await openVote(page, ROLL_CALL_VOTE);
		await waitUntilAnswered(page);
		// A seat waits on the General Speakers' List, which N must not call during the vote.
		await seedWaiting(room, ['Ghana']);
		await expect(seatItem(page, 'France')).toHaveAttribute('aria-current', 'true');

		await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
		await page.keyboard.press('y');
		await expect(seatRow(page, 'France').getByRole('button', { name: 'Yes' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await expect(seatItem(page, 'Ghana')).toHaveAttribute('aria-current', 'true');

		await page.keyboard.press('n');
		await expect(seatRow(page, 'Ghana').getByRole('button', { name: 'No' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await waitUntilAnswered(page);
		expect(await readSpeakingSeat(room)).toBeNull();

		await seatRow(page, 'Ghana').getByRole('button', { name: 'No' }).focus();
		await page.keyboard.press('ArrowUp');
		await expect(seatItem(page, 'France')).toHaveAttribute('aria-current', 'true');
	});

	test('keeps two columns at 1024, the tally at least 320px wide and each row’s answers on one line', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop', 'One laptop size is enough.');
		const room = await makeChairedCommittee('Narrow Laptop Voting MUN');

		await page.setViewportSize(SMALL_LAPTOP);
		await openWithRollCall(page, room);
		await openVote(page, ROLL_CALL_VOTE);

		const side = await page.getByRole('complementary', { name: 'Tally' }).boundingBox();
		const list = await page.getByRole('list', { name: 'Seats voting' }).boundingBox();
		expect(side?.width ?? 0).toBeGreaterThanOrEqual(MIN_SIDE_COLUMN_PX);
		expect(side?.x ?? 0).toBeGreaterThan((list?.x ?? 0) + (list?.width ?? 0) - 1);
		const answers = await seatRow(page, 'France').boundingBox();
		expect(answers?.height ?? 0).toBeLessThan(2 * MIN_TOUCH_TARGET_PX);
		await expectNoSidewaysOverflow(page);
	});
});

test.describe('cancelling', () => {
	test('asks in place, with no dialog, and removes the vote, returning the room to formal debate', async ({
		page
	}) => {
		const room = await makeChairedCommittee('Cancel Voting MUN');

		await openWithRollCall(page, room);
		await openVote(page, ROLL_CALL_VOTE);
		await castVote(page, 'France', 'Yes');

		await view(page).getByRole('link', { name: 'Cancel vote' }).click();
		await expect(page.getByText('Cancel this vote? Nothing will be recorded.')).toBeVisible();
		await expect(page.getByRole('dialog')).toHaveCount(0);
		await view(page).getByRole('link', { name: 'Keep voting' }).click();
		await expect(page.getByText('Cancel this vote? Nothing will be recorded.')).toHaveCount(0);

		await view(page).getByRole('link', { name: 'Cancel vote' }).click();
		await view(page).getByRole('button', { name: 'Cancel vote' }).click();
		await expect(page).toHaveURL(room.roomPath, { timeout: DATABASE_TIMEOUT_MS });
		await waitUntilAnswered(page);
		expect(await readVotes(room.committeeId)).toHaveLength(0);
		expect(await readCommitteeState(room.committeeId)).toMatchObject({
			mode: 'formal_debate',
			current_vote_id: null
		});
	});

	test('asks the same question from the address without JavaScript', async ({ page }) => {
		const room = await makeChairedCommittee('Cancel Address Voting MUN');

		await openWithRollCall(page, room);
		await openVote(page, HANDS_VOTE);
		await openVoting(page, room, '?cancel=confirm');

		await expect(page.getByText('Cancel this vote? Nothing will be recorded.')).toBeVisible();
		// Relative in the server's HTML, so only its end is compared (see the set-up's test).
		await expect(view(page).getByRole('link', { name: 'Keep voting' })).toHaveAttribute(
			'href',
			new RegExp(`${votingPath(room)}$`)
		);
	});
});

test.describe('after a vote', () => {
	test('"Open another vote" sets the next one up, which replaces the closed vote; "Votes this session" lists both', async ({
		page
	}) => {
		const room = await makeChairedCommittee('Another Voting MUN');

		await openWithRollCall(page, room);
		await openVote(page, HANDS_VOTE);
		await typeCounts(page, ['0', '2', '0']);
		await closeVoteButton(page).click();
		await expect(page.getByText('Draft Resolution 1.2 fails')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		await page.getByRole('link', { name: 'Open another vote' }).click();
		await expect(page).toHaveURL(`${votingPath(room)}?vote=new`, { timeout: DATABASE_TIMEOUT_MS });
		await expect(page.getByRole('button', { name: 'End voting' })).toBeVisible();
		const history = page.getByRole('region', { name: 'Votes this session' });
		await expect(history.getByRole('listitem')).toHaveCount(1);

		await openVote(page, { subject: 'Draft Resolution 1.3', method: 'Count hands' });
		await typeCounts(page, ['2', '0', '0']);
		await closeVoteButton(page).click();
		await expect(page.getByText('Draft Resolution 1.3 passes')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await waitUntilAnswered(page);
		const votes = await readVotes(room.committeeId);
		expect((await readCommitteeState(room.committeeId)).current_vote_id).toBe(votes[1].id);

		await openVoting(page, room, '?vote=new');
		const rows = page.getByRole('region', { name: 'Votes this session' }).getByRole('listitem');
		// Newest first, each with its result in a word, its tally, majority and time; no badge.
		await expect(rows).toHaveText([
			/^Passed\s*Draft Resolution 1\.3\s*2–0–0 · simple majority · \d\d:\d\d$/,
			/^Failed\s*Draft Resolution 1\.2\s*0–2–0 · simple majority · \d\d:\d\d$/
		]);
		await expect(rows.first().getByText('Passed')).toHaveClass(/text-success-700/);
	});
});

test.describe('the shape of the view', () => {
	test('fits the set-up, the hand count and the result on a laptop without scrolling', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop', 'One project is enough to measure a height.');
		const room = await makeChairedCommittee('Height Voting MUN');

		await openWithRollCall(page, room);
		await expectViewFits(page);
		await openVote(page, HANDS_VOTE);
		await expectViewFits(page);
		await saveFullPageScreenshot(page, 'voting-hands');
		await typeCounts(page, ['2', '0', '0']);
		await closeVoteButton(page).click();
		await expect(page.getByText('Draft Resolution 1.2 passes')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expectViewFits(page);
	});

	test('is one column on a phone, with labels above fields and answers under each seat', async ({
		page
	}, testInfo) => {
		test.skip(
			testInfo.project.name !== 'phone',
			'Only the phone project has a phone-sized window.'
		);
		const room = await makeChairedCommittee('Phone Voting International MUN');

		await openWithRollCall(page, room);
		const label = await view(page).getByText('On', { exact: true }).boundingBox();
		const field = await page.getByLabel('On', { exact: true }).boundingBox();
		expect(label?.y ?? 0).toBeLessThan(field?.y ?? 0);
		await expectNoSidewaysOverflow(page);

		await openVote(page, HANDS_VOTE);
		await expectNoSidewaysOverflow(page);
		await typeCounts(page, ['1', '1', '0']);
		await closeVoteButton(page).click();
		await expect(page.getByText('Draft Resolution 1.2 fails')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		await page.getByRole('link', { name: 'Open another vote' }).click();
		await openVote(page, ROLL_CALL_VOTE);
		const name = await seatItem(page, 'France').getByText('France').boundingBox();
		const answers = await seatRow(page, 'France').boundingBox();
		expect(answers?.y ?? 0).toBeGreaterThan((name?.y ?? 0) + (name?.height ?? 0) - 1);
		const yes = await seatRow(page, 'France').getByRole('button', { name: 'Yes' }).boundingBox();
		expect(yes?.height ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
		await saveFullPageScreenshot(page, 'voting');
		await expectNoSidewaysOverflow(page);
	});
});

test('the mode bar opens the Vote view', async ({ page }) => {
	const room = await makeChairedCommittee('Links Voting MUN');

	await startSessionDirectly(room);
	await signIn(page, room.chair);
	await openRoom(page, room.roomPath);
	await pressChairTab(page, 'Vote');

	await expect(page).toHaveURL(votingPath(room), { timeout: DATABASE_TIMEOUT_MS });
});

test.describe('click budget', () => {
	test('"Open and close a counted vote" keeps to 3 clicks, 1 page, 4 typed fields and 0 decisions', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name === 'desktop-no-js', 'The budget is measured at 1280 and 390.');
		const room = await makeChairedCommittee('Budget Voting MUN');

		await startSessionDirectly(room);
		await takeRollCall(room, 'Japan');
		await signIn(page, room.chair);
		await openRoom(page, room.roomPath);
		await waitUntilListening(page, testInfo);

		const journey = ClickBudgetJourney.fromPage(page);
		await journey.click(modeBarTab(page, 'Vote'));
		await journey.type(page.getByLabel('On', { exact: true }), HANDS_VOTE.subject);
		await journey.click(page.getByRole('button', { name: 'Open vote' }));
		await expect(page.getByLabel('For', { exact: true })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await journey.type(page.getByLabel('For', { exact: true }), '2');
		await journey.type(page.getByLabel('Against', { exact: true }), '0');
		await journey.type(page.getByLabel('Abstain', { exact: true }), '0');
		await journey.click(closeVoteButton(page));
		await expect(page.getByText('Draft Resolution 1.2 passes')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		// The journey starts in the live room, which the budget does not count:
		// the Vote view is its one page, and the second the journey has seen.
		journey.expectWithinBudget({ clicks: 3, pages: 1 + 1, typedFields: 4, decisions: 0 });
		await waitUntilAnswered(page);
	});
});
