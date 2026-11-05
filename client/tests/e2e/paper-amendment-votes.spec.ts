import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
	DATABASE_TIMEOUT_MS,
	takeRollCall,
	waitForConsoleScript,
	waitUntilAnswered,
	type ChairedCommittee
} from './chair-room-fixtures';
import {
	addAmendmentAsIs,
	addIntroducedDraft,
	closeDebateAsIs,
	makePaperCommittee,
	readStoredAmendment,
	voteOnPaperAsIs,
	type PaperCommitteeRoom
} from './committee-paper-fixtures';
import { startSessionDirectly } from './gsl-fixtures';
import { signIn } from './signed-in-user';

// Step 7 of `docs/committee-papers.md`, "Amendments", where it meets step 8's
// votes, in a real browser: the vote form lists an approved unfriendly
// amendment before its draft, the projector shows the amendment while the
// room votes on it, closing the vote settles it through the database, and
// the record copy lists it in its "Amendments" table with the draft's text
// as amended. Every button is a plain form, so the test runs in all three
// projects, `desktop-no-js` among them.

// shadcn's dropdown for "On" opens and closes with an animation; without one
// a click never lands on an option that is still moving.
test.use({ reducedMotion: 'reduce' });

const DRAFT = {
	title: 'Human control over autonomous weapons',
	preamble: '*Recalling* the Convention on Certain Conventional Weapons,',
	operative: [
		'1. *Calls upon* all Member States to negotiate a legally binding instrument;',
		'2. *Requests* the Secretary-General to publish a register of national policies;',
		'3. *Encourages* Member States to share best practice on testing and evaluation;'
	].join('\n')
};

function hasNoScript(testInfo: TestInfo): boolean {
	return testInfo.project.use.javaScriptEnabled === false;
}

/** The room as the session and roll call fixtures want it: only its id and its chair are read. */
function asChairedRoom(room: PaperCommitteeRoom): ChairedCommittee {
	return { committeeId: room.committeeId, chair: room.chair } as ChairedCommittee;
}

/** Choose the amendment in "On": the browser's own `<select>` without JavaScript, shadcn's Select with it. */
async function chooseAmendment(page: Page, testInfo: TestInfo, amendmentId: string): Promise<void> {
	if (hasNoScript(testInfo)) {
		// The amendments come before the drafts, so "On" starts on this one.
		await expect(page.getByLabel('On', { exact: true })).toHaveValue(amendmentId);
		return;
	}

	await waitForConsoleScript(page);
	const onField = page.getByRole('button', { name: 'On' });
	await expect(onField).toContainText('Amendment 1 to Draft resolution 1.1');
	await onField.click();
	await page.getByRole('option', { name: /^Amendment 1 to Draft resolution 1\.1/ }).click();
}

test('the room votes on an amendment: on the list, on the projector, and on the record copy', async ({
	page
}, testInfo) => {
	const room = await makePaperCommittee('Amendment Vote MUN');
	const paperId = await addIntroducedDraft(room.committeeId, {
		...DRAFT,
		authorSeatIds: [room.franceSeatId, room.mexicoSeatId]
	});
	// Ghana's amendment to strike clause 2, which the sponsors took as
	// unfriendly and the dais approved for a vote.
	const amendmentId = await addAmendmentAsIs(paperId, {
		sequence: 1,
		proposedBySeatId: room.ghanaSeatId,
		action: 'strike',
		clauseId: 'o2',
		status: 'approved'
	});
	await startSessionDirectly(asChairedRoom(room));
	await takeRollCall(asChairedRoom(room), 'Ghana');
	await closeDebateAsIs(room.committeeId);

	// The dais puts the amendment to the vote.
	await signIn(page, room.chair);
	await page.goto(`${room.committeePath}/chair/voting`);
	const openButton = page.getByRole('button', { name: 'Open vote' });
	await expect(openButton).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await chooseAmendment(page, testInfo, amendmentId);
	await openButton.click();
	await expect(
		page.getByRole('heading', { name: /^Amendment 1 to Draft resolution 1\.1/ })
	).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(page);

	// The projector shows what the amendment does, and the clause it strikes.
	await page.goto(`${room.committeePath}/display`);
	await expect(page.getByText('Voting on amendment 1 · Draft resolution 1.1')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.getByRole('heading', { level: 1, name: 'Strike clause 2' })).toBeVisible();
	await expect(page.getByText('Proposed by Ghana · Unfriendly')).toBeVisible();
	await expect(page.locator('del')).toContainText('register of national policies');
	await expect(page.getByText('0 of 2 have voted')).toBeVisible();

	// The dais closes the vote, and the database passes the amendment.
	await page.goto(`${room.committeePath}/chair/voting`);
	await expect(page.getByLabel('For', { exact: true })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await page.getByLabel('For', { exact: true }).fill('2');
	await page.getByLabel('Against', { exact: true }).fill('0');
	await page.getByLabel('Abstain', { exact: true }).fill('0');
	await page
		.locator('#main')
		.getByRole('button', { name: /^Close vote/ })
		.click();
	await expect(
		page.locator('#main').getByText(/Amendment 1 to Draft resolution 1\.1.* passes/)
	).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(page);
	await expect
		.poll(async () => (await readStoredAmendment(amendmentId)).status, {
			timeout: DATABASE_TIMEOUT_MS
		})
		.toBe('passed');

	await page.goto(`${room.committeePath}/display`);
	await expect(page.getByRole('heading', { level: 1, name: 'Amendment 1 passes' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.getByText('Voted on amendment 1 · Draft resolution 1.1')).toBeVisible();

	// The draft passes as amended, and its record copy says how the amendment went.
	await voteOnPaperAsIs(room.committeeId, paperId, { for: 2, against: 0, abstain: 0 });
	await page.goto(`${room.papersPath}/${paperId}/print`);
	const main = page.getByRole('main');
	await expect(page.getByRole('heading', { level: 1, name: 'Resolution 1.1' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(main).toContainText('Calls upon');
	await expect(main).toContainText('Encourages');
	const amendments = main.getByRole('table');
	await expect(page.getByRole('heading', { level: 2, name: 'Amendments' })).toBeVisible();
	await expect(amendments.getByRole('row')).toHaveCount(2);
	await expect(amendments).toContainText('Ghana');
	await expect(amendments).toContainText('Strike clause 2');
	await expect(amendments.getByRole('cell').last()).toHaveText('Passed, 2 to 0');
	// The struck clause is gone from the text above the table.
	await expect(main.getByText('register of national policies')).toHaveCount(0);
});
