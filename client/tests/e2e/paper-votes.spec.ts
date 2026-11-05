import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	DATABASE_TIMEOUT_MS,
	takeRollCall,
	waitForConsoleScript,
	waitUntilAnswered,
	type ChairedCommittee
} from './chair-room-fixtures';
import {
	addDraftResolution,
	approvePaperAsIs,
	closeDebateAsIs,
	introducePaperAsIs,
	makePaperCommittee,
	submitPaperAsIs,
	voteOnPaperAsIs,
	type PaperCommitteeRoom
} from './committee-paper-fixtures';
import { startSessionDirectly } from './gsl-fixtures';
import { expectNoSidewaysOverflow } from './page-shape';
import { signIn } from './signed-in-user';

// Step 8 of `docs/committee-papers.md`, "Voting on papers, and the record",
// in a real browser: once debate is closed the vote form lists the
// introduced draft, closing the vote settles it, the live view names the
// paper voted on, and a passed draft says how the vote went, has its record
// copy, and is listed on the committee page and in the dais's Decided.
// Every button is a plain form or a link, so each test runs in all three
// projects, `desktop-no-js` among them. "Print" alone needs JavaScript.

// shadcn's dropdown for "On" opens and closes with an animation; without one
// a click never lands on an option that is still moving.
test.use({ reducedMotion: 'reduce' });

/** The size of the drawing of the record copy, to hold the page beside it. */
const BOARD_VIEWPORT = { width: 1265, height: 634 };

const DRAFT_TITLE = 'Human control over autonomous weapons';

/** Whether the test runs without JavaScript. */
function hasNoScript(testInfo: TestInfo): boolean {
	return testInfo.project.use.javaScriptEnabled === false;
}

/** The room as the session and roll call fixtures want it: only its id and its chair are read. */
function asChairedRoom(room: PaperCommitteeRoom): ChairedCommittee {
	return { committeeId: room.committeeId, chair: room.chair } as ChairedCommittee;
}

/**
 * France's and Mexico's draft resolution, introduced as Draft resolution 1.1,
 * in a running session with Ghana absent. Answers its id.
 */
async function introduceDraftInSession(room: PaperCommitteeRoom): Promise<string> {
	const paperId = await addDraftResolution(room.committeeId, {
		title: DRAFT_TITLE,
		preamble: 'Recalling the Convention on Certain Conventional Weapons,',
		operative: '1. Calls upon all Member States to negotiate a binding instrument;',
		authorSeatIds: [room.franceSeatId, room.mexicoSeatId]
	});
	await submitPaperAsIs(paperId);
	await approvePaperAsIs(paperId);
	await introducePaperAsIs(room.committeeId, paperId);
	await startSessionDirectly(asChairedRoom(room));
	await takeRollCall(asChairedRoom(room), 'Ghana');

	return paperId;
}

/** The paper's status, straight from the database. */
async function readPaperStatus(paperId: string): Promise<string | undefined> {
	const { data } = await createServiceRoleClient()
		.from('committee_papers')
		.select('status')
		.eq('id', paperId)
		.single();

	return data?.status;
}

/** Sign the page out of one account and into another. */
async function switchTo(page: Page, user: PaperCommitteeRoom['chair']): Promise<void> {
	await page.context().clearCookies();
	await signIn(page, user);
}

/**
 * A link's `href` to this address. Rendered on the server, SvelteKit writes
 * links relative to the page ("../../conferences/…"), so only the end is the same.
 */
function hrefEndingIn(path: string): RegExp {
	return new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

/** The view inside the console's `<main>`. */
function consoleView(page: Page): Locator {
	return page.locator('#main');
}

test('once debate is closed the vote form lists the draft, and the vote settles it', async ({
	page
}, testInfo) => {
	const room = await makePaperCommittee('Paper Vote MUN');
	const paperId = await introduceDraftInSession(room);
	await closeDebateAsIs(room.committeeId);

	await signIn(page, room.chair);
	await page.goto(`${room.committeePath}/chair/voting`);
	const openButton = page.getByRole('button', { name: 'Open vote' });
	await expect(openButton).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	// "On" starts on the first draft, so the chair only opens the vote.
	if (hasNoScript(testInfo)) {
		await expect(page.getByLabel('On', { exact: true })).toHaveValue(paperId);
		// Without JavaScript nothing can hide the typed subject, so it is there, for Other.
		await expect(page.getByLabel('Other', { exact: true })).toBeVisible();
	} else {
		await waitForConsoleScript(page);
		const onField = page.getByRole('button', { name: 'On' });
		await expect(onField).toContainText('Draft resolution 1.1');
		await onField.click();
		await expect(page.getByRole('option', { name: /Draft resolution 1\.1/ })).toBeVisible();
		await page.getByRole('option', { name: /Draft resolution 1\.1/ }).click();
		await expect(page.getByLabel('Other', { exact: true })).toHaveCount(0);
	}

	await openButton.click();
	await expect(page.getByRole('heading', { name: /^Draft resolution 1\.1/ })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(page);

	await page.getByLabel('For', { exact: true }).fill('2');
	await page.getByLabel('Against', { exact: true }).fill('0');
	await page.getByLabel('Abstain', { exact: true }).fill('0');
	await consoleView(page)
		.getByRole('button', { name: /^Close vote/ })
		.click();
	await expect(consoleView(page).getByText(/Draft resolution 1\.1.* passes/)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(page);
	// The database's `settle_vote_paper` passed the draft as the vote closed.
	await expect
		.poll(() => readPaperStatus(paperId), { timeout: DATABASE_TIMEOUT_MS })
		.toBe('passed');

	// The room stays on the result until "End voting", and the live view names the paper.
	await switchTo(page, room.clara);
	await page.goto(`${room.committeePath}/live`);
	const line = page.getByText('Voted on', { exact: true });
	await expect(line).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(page.getByRole('link', { name: /^Draft resolution 1\.1 · / })).toHaveAttribute(
		'href',
		hrefEndingIn(`${room.papersPath}/${paperId}`)
	);
});

test('the vote form keeps the typed subject alone until debate is closed', async ({ page }) => {
	const room = await makePaperCommittee('Paper Vote Open MUN');
	await introduceDraftInSession(room);

	await signIn(page, room.chair);
	await page.goto(`${room.committeePath}/chair/voting`);
	await expect(page.getByRole('button', { name: 'Open vote' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	await expect(page.getByRole('textbox', { name: 'On', exact: true })).toBeVisible();
	await expect(page.getByLabel('Other', { exact: true })).toHaveCount(0);
});

test('a passed draft says how the vote went, and its record copy is on the committee page', async ({
	page
}, testInfo) => {
	const room = await makePaperCommittee('Paper Record MUN');
	const paperId = await introduceDraftInSession(room);
	await voteOnPaperAsIs(room.committeeId, paperId, { for: 2, against: 0, abstain: 0 });

	// The reading page's meta line, and the way to the record copy.
	await signIn(page, room.clara);
	await page.goto(`${room.papersPath}/${paperId}`);
	const main = page.getByRole('main');
	await expect(main).toContainText(/Passed .* · 2 for · 0 against · 0 abstentions/, {
		timeout: DATABASE_TIMEOUT_MS
	});
	await main.getByRole('link', { name: 'Record copy' }).click();

	await expect(page).toHaveURL(`${room.papersPath}/${paperId}/print`);
	await expect(page.getByRole('heading', { level: 1, name: 'Resolution 1.1' })).toBeVisible();
	await expect(main).toContainText(DRAFT_TITLE);
	await expect(main).toContainText(/Adopted on \d+ \w+ \d{4} by 2 votes to 0/);
	await expect(main).toContainText('The General Assembly,');
	await expect(main).toContainText('Calls upon');
	await expect(main).toContainText(/Record copy, printed from MUNMeet on /);
	// Only a script can open the print dialog, so the button needs one.
	await expect(page.getByRole('button', { name: 'Print' })).toHaveCount(
		hasNoScript(testInfo) ? 0 : 1
	);

	if (testInfo.project.name === 'phone') {
		await expectNoSidewaysOverflow(page);
	} else if (!hasNoScript(testInfo)) {
		await page.setViewportSize(BOARD_VIEWPORT);
		await page.screenshot({ path: 'test-results/paper-print-1265x634.png' });
		// On paper the copy is alone: no header, no breadcrumb, no button.
		await page.emulateMedia({ media: 'print' });
		await expect(page.getByRole('button', { name: 'Print' })).toBeHidden();
		await expect(page.getByRole('banner')).toBeHidden();
		await page.emulateMedia({ media: 'screen' });
	}

	// The committee page lists it under its number as a resolution.
	await page.goto(room.committeePath);
	const resolutions = page.getByRole('region', { name: 'Resolutions', exact: true });
	await expect(resolutions.getByRole('link', { name: 'Resolution 1.1' })).toHaveAttribute(
		'href',
		hrefEndingIn(`${room.papersPath}/${paperId}/print`)
	);
	await expect(resolutions).toContainText(DRAFT_TITLE);

	// The dais finds it decided, and how.
	await switchTo(page, room.chair);
	await page.goto(`${room.committeePath}/chair/resolutions`);
	const decided = page.getByRole('region', { name: 'Decided', exact: true });
	await expect(decided).toContainText(DRAFT_TITLE, { timeout: DATABASE_TIMEOUT_MS });
	await expect(decided).toContainText('Passed');
});

test('a draft that failed has no record copy', async ({ page }) => {
	const room = await makePaperCommittee('Paper Failed MUN');
	const paperId = await introduceDraftInSession(room);
	await voteOnPaperAsIs(room.committeeId, paperId, { for: 0, against: 2, abstain: 0 });

	await signIn(page, room.clara);
	await page.goto(`${room.papersPath}/${paperId}`);
	const main = page.getByRole('main');
	await expect(main).toContainText(/Failed .* · 0 for · 2 against · 0 abstentions/, {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(main.getByRole('link', { name: 'Record copy' })).toHaveCount(0);

	const response = await page.goto(`${room.papersPath}/${paperId}/print`);
	expect(response?.status()).toBe(404);

	await page.goto(room.committeePath);
	await expect(page.getByRole('region', { name: 'Resolutions', exact: true })).toHaveCount(0);
});
