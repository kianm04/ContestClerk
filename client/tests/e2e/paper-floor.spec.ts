import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	DATABASE_TIMEOUT_MS,
	readCommitteeState,
	takeRollCall,
	waitForConsoleScript,
	type ChairedCommittee
} from './chair-room-fixtures';
import {
	addDraftResolution,
	addWorkingPaper,
	approvePaperAsIs,
	introducePaperAsIs,
	makePaperCommittee,
	startThreadAsIs,
	submitPaperAsIs,
	type PaperCommitteeRoom
} from './committee-paper-fixtures';
import { startUnmodDirectly } from './committee-live-fixtures';
import { startSessionDirectly } from './gsl-fixtures';
import { signIn } from './signed-in-user';

// Step 6 of `docs/committee-papers.md`, "On the floor", in a real browser: a
// motion to introduce a document picks an approved paper, passing it
// introduces the paper and puts it on the projector, the live view links to
// it, the dais takes it off the screen and puts it back, steps the projector
// through a draft resolution clause by clause, and the comment threads stay
// to read, closed. Every button is a plain form, so each test runs in all
// three projects, `desktop-no-js` among them.

/** Whether the test runs without JavaScript. */
function hasNoScript(testInfo: TestInfo): boolean {
	return testInfo.project.use.javaScriptEnabled === false;
}

/** The room as the session and roll call fixtures want it: only its id and its chair are read. */
function asChairedRoom(room: PaperCommitteeRoom): ChairedCommittee {
	return { committeeId: room.committeeId, chair: room.chair } as ChairedCommittee;
}

/** Start a session with Ghana absent, so France and Mexico are present. */
async function startTheSession(room: PaperCommitteeRoom): Promise<void> {
	await startSessionDirectly(asChairedRoom(room));
	await takeRollCall(asChairedRoom(room), 'Ghana');
}

/** A working paper by France and Mexico, approved as Working paper 1.1. Answers its id. */
async function addApprovedWorkingPaper(room: PaperCommitteeRoom): Promise<string> {
	const paperId = await addWorkingPaper(room.committeeId, {
		title: 'Meaningful human control',
		body: 'Every weapon keeps a human in the decision to use force.',
		authorSeatIds: [room.franceSeatId, room.mexicoSeatId]
	});
	await submitPaperAsIs(paperId);
	await approvePaperAsIs(paperId);

	return paperId;
}

/** The paper's status and whether it is on the projector, straight from the database. */
async function readFloor(room: PaperCommitteeRoom, paperId: string) {
	const { data } = await createServiceRoleClient()
		.from('committee_papers')
		.select('status, introduced_at')
		.eq('id', paperId)
		.single();
	const state = await readCommitteeState(room.committeeId);

	return { status: data?.status, isOnScreen: state.displayed_paper_id === paperId };
}

/** Pick "Introduce a document" by the chair, naming the approved paper, and add it to the floor. */
async function proposeIntroducing(page: Page, testInfo: TestInfo, paperId: string): Promise<void> {
	const form = page.getByRole('form', { name: 'Record a motion' });
	const documentRadio = page.getByRole('radio', { name: 'Document', exact: true });
	await form.locator('label').filter({ has: documentRadio }).click();

	if (hasNoScript(testInfo)) {
		await form.getByLabel('Raised by').selectOption({ label: 'The chair' });
		await form.getByLabel('Paper').selectOption(paperId);
	} else {
		const raisedBy = form.getByRole('combobox', { name: 'Raised by' });
		await raisedBy.fill('chair');
		await raisedBy.press('Enter');
		// shadcn's dropdown opens from a button, which "Raised by" hands the focus to.
		await form.getByRole('button', { name: 'Paper' }).click();
		await page.getByRole('option', { name: /Working paper 1\.1/ }).click();
		// The paper names the motion, so the typed name is only for Other.
		await expect(form.locator('input[name="topic"]')).toHaveCount(0);
	}

	await form.getByRole('button', { name: 'Add to floor' }).click();
}

test('introducing an approved paper puts it on the screen, and the dais can take it off', async ({
	page
}, testInfo) => {
	const room = await makePaperCommittee('Floor Introduce MUN');
	const paperId = await addApprovedWorkingPaper(room);
	await startTheSession(room);

	await signIn(page, room.chair);
	await page.goto(`${room.committeePath}/chair/motions`);
	const nextToVote = page.getByRole('region', { name: /^Next to vote/ });
	await expect(nextToVote).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	if (!hasNoScript(testInfo)) await waitForConsoleScript(page);

	await proposeIntroducing(page, testInfo, paperId);
	await expect(nextToVote).toContainText('Introduce Working paper 1.1', {
		timeout: DATABASE_TIMEOUT_MS
	});

	await nextToVote.getByRole('button', { name: 'Pass', exact: true }).click();
	await expect(page.getByRole('region', { name: 'Decided this session' })).toContainText('Passed', {
		timeout: DATABASE_TIMEOUT_MS
	});
	// With JavaScript the console marks the motion passed before the server has written it.
	await expect
		.poll(() => readFloor(room, paperId), { timeout: DATABASE_TIMEOUT_MS })
		.toEqual({ status: 'introduced', isOnScreen: true });

	// The paper's page says when it was introduced and that it is on the screen.
	await page.goto(`${room.papersPath}/${paperId}`);
	await expect(page.getByText(/Introduced \d+ \w+, \d\d:\d\d/)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.getByText('On screen', { exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'Take off screen' }).click();
	await expect(page.getByRole('button', { name: 'Show on screen' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect(await readFloor(room, paperId)).toEqual({ status: 'introduced', isOnScreen: false });

	await page.getByRole('button', { name: 'Show on screen' }).click();
	await expect(page.getByRole('button', { name: 'Take off screen' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect(await readFloor(room, paperId)).toEqual({ status: 'introduced', isOnScreen: true });
});

/** The operative clauses of the drawn draft resolution: six, the first with its sub-clauses. */
const DRAWN_OPERATIVE_CLAUSES = [
	'1. Calls upon all Member States to negotiate a legally binding instrument on autonomous weapons systems, to be concluded by the end of 2028, which:',
	'   1. prohibits autonomous weapons systems whose effects cannot be anticipated and controlled, that cannot be used with meaningful human control, or that are designed to target human beings;',
	'   2. regulates all other autonomous weapons systems by limiting:',
	'      1. the types of target they may engage;',
	'      2. the duration and geographical scope of their operation;',
	'      3. the situations in which they may be used;',
	'   3. requires a legal review of every new weapon, means or method of warfare under article 36 of Additional Protocol I;',
	'   4. ensures that responsibility for every use of force remains with a human commander;',
	'2. Requests the Secretary-General to report on progress by 2028;',
	'3. Encourages States to share their national reviews of new weapons;',
	'4. Invites the International Committee of the Red Cross to advise the negotiations;',
	'5. Urges States to fund the participation of developing countries;',
	'6. Decides to remain actively seized of the matter.'
].join('\n');

/** The drawn draft resolution, introduced and on the projector. Answers its id. */
async function addIntroducedDrawnDraft(room: PaperCommitteeRoom): Promise<string> {
	const paperId = await addDraftResolution(room.committeeId, {
		title: 'Human control over autonomous weapons',
		preamble:
			'Recalling the Convention on Certain Conventional Weapons,\n\nNoting with concern the speed at which autonomous weapons are developed,',
		operative: DRAWN_OPERATIVE_CLAUSES,
		authorSeatIds: [room.franceSeatId, room.mexicoSeatId]
	});
	await submitPaperAsIs(paperId);
	await approvePaperAsIs(paperId);
	await introducePaperAsIs(room.committeeId, paperId);

	return paperId;
}

/** The grey line over the paper's title on the projector. */
function projectorLine(page: Page, text: string) {
	return page.getByText(text, { exact: true });
}

test('the projector starts a draft resolution at its preamble, and the live view links to it', async ({
	page
}) => {
	const room = await makePaperCommittee('Floor Screen MUN');
	await addIntroducedDrawnDraft(room);
	await startTheSession(room);
	// The room is in an unmoderated caucus, the screen the paper takes the place of.
	await startUnmodDirectly(asChairedRoom(room), 300);

	// Ghana, on none of the papers, follows the room on the live view.
	await signIn(page, room.amara);
	await page.goto(`${room.committeePath}/live`);
	const link = page.getByRole('link', {
		name: 'Draft resolution 1.1 · Human control over autonomous weapons'
	});
	await expect(link).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	await page.goto(`${room.committeePath}/display`);
	await expect(projectorLine(page, 'Draft resolution 1.1 · Preambulatory clauses')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(
		page.getByRole('heading', { level: 1, name: 'Human control over autonomous weapons' })
	).toBeVisible();
	await expect(page.getByText('The General Assembly,', { exact: true })).toBeVisible();
	await expect(page.locator('em', { hasText: 'Noting with concern' })).toBeVisible();
	// Only the preamble: the operative clauses wait for "Next clause".
	await expect(page.getByText('Calls upon')).toHaveCount(0);

	// The link opens the paper, which the whole committee may read once it is
	// introduced. An introduced draft is named by its number, its title under it.
	await page.goto(`${room.committeePath}/live`);
	await link.click();
	await expect(page.getByRole('heading', { level: 1, name: 'Draft resolution 1.1' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.getByRole('main')).toContainText('Human control over autonomous weapons');
});

test('the dais steps the projector through a draft resolution from its review page', async ({
	page
}, testInfo) => {
	const room = await makePaperCommittee('Floor Step MUN');
	const paperId = await addIntroducedDrawnDraft(room);
	await startTheSession(room);
	await startUnmodDirectly(asChairedRoom(room), 300);
	const reviewPath = `${room.committeePath}/chair/resolutions/${paperId}`;
	const displayedClause = async () => (await readCommitteeState(room.committeeId)).displayed_clause;

	await signIn(page, room.chair);
	await page.goto(reviewPath);
	await expect(page.getByText('On screen · Preambulatory clauses')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.getByRole('button', { name: 'Previous clause' })).toBeDisabled();

	await page.getByRole('button', { name: 'Next clause' }).click();
	await expect(page.getByText('On screen · Operative clause 1 of 6')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect(await displayedClause()).toBe(1);

	// The projector shows clause 1 as drawn: its number, its phrase underlined, its sub-clauses lettered.
	await page.goto(`${room.committeePath}/display`);
	await expect(projectorLine(page, 'Draft resolution 1.1 · Operative clause 1 of 6')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.locator('u', { hasText: 'Calls upon' })).toBeVisible();
	for (const label of ['(a)', '(b)', '(c)', '(d)', '(i)', '(ii)', '(iii)']) {
		await expect(page.getByText(label, { exact: true })).toBeVisible();
	}
	await expect(page.getByText('Requests the Secretary-General')).toHaveCount(0);

	if (testInfo.project.name === 'desktop') {
		await page.setViewportSize({ width: 1600, height: 900 });
		await page.screenshot({ path: 'test-results/projector-clause-1600x900.png' });
	}

	// Back on the review page the dais moves on, and back, and the screen stays inside the paper.
	await page.goto(reviewPath);
	await page.getByRole('button', { name: 'Next clause' }).click();
	await expect(page.getByText('On screen · Operative clause 2 of 6')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await page.getByRole('button', { name: 'Previous clause' }).click();
	await expect(page.getByText('On screen · Operative clause 1 of 6')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect(await displayedClause()).toBe(1);

	// Taken off and put back, the paper starts again at its preamble.
	await page.getByRole('button', { name: 'Take off screen' }).click();
	await page.getByRole('button', { name: 'Show on screen' }).click();
	await expect(page.getByText('On screen · Preambulatory clauses')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect(await displayedClause()).toBeNull();
});

test('an introduced paper keeps its threads to read, closed, for the people who could read them', async ({
	page
}) => {
	const room = await makePaperCommittee('Floor Threads MUN');
	const paperId = await addApprovedWorkingPaper(room);
	await startThreadAsIs(paperId, {
		writer: room.clara,
		seatId: room.franceSeatId,
		quotedText: 'a human in the decision',
		body: 'Should we name the 2028 deadline here?'
	});
	await introducePaperAsIs(room.committeeId, paperId);

	await signIn(page, room.clara);
	await page.goto(`${room.papersPath}/${paperId}`);
	const comments = page.getByRole('region', { name: 'Comments' });
	await expect(comments).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(comments).toContainText('Closed when the paper was introduced.');
	await expect(comments).toContainText('‘a human in the decision’');
	await expect(comments).toContainText('Should we name the 2028 deadline here?');
	// Nothing to add to it: no reply, no new comment, no edit.
	await expect(page.getByRole('button', { name: 'Reply' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Comment' })).toHaveCount(0);
	await expect(comments.getByRole('link', { name: 'Edit' })).toHaveCount(0);

	// Ghana could never read the authors' thread, and still cannot.
	await page.context().clearCookies();
	await signIn(page, room.amara);
	await page.goto(`${room.papersPath}/${paperId}`);
	await expect(
		page.getByRole('heading', { level: 1, name: 'Meaningful human control' })
	).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(page.getByRole('region', { name: 'Comments' })).toHaveCount(0);
	await expect(page.getByText('Should we name the 2028 deadline here?')).toHaveCount(0);
});
