import { expect, test, type Locator, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	addDraftResolution,
	addWorkingPaper,
	makePaperCommittee,
	submitPaperAsIs,
	type PaperCommitteeRoom
} from './committee-paper-fixtures';
import { skipWithoutJavaScript } from './in-place';
import { expectNoSidewaysOverflow } from './page-shape';
import { selectWords } from './paper-editor';
import { signIn } from './signed-in-user';

// Step 5 of docs/committee-papers.md as the dais meets it in a browser:
//
// * the chair sees a submitted draft resolution on the dais's list, opens
//   it and approves it as Draft resolution 1.1;
// * the chair writes a note for the authors on words in the text;
// * the chair returns a working paper to its authors with a comment.
//
// Approve and Return are real forms, and Return's dialog opens from the
// address, so those run on all three projects; a note on chosen words needs
// the editor, and so JavaScript. Who may approve, return and withdraw is
// `tests/db/committee-papers.test.ts`'s work. Every test makes a conference
// of its own (`committee-paper-fixtures.ts`).

/** How long an assertion that waits on the database may take. */
const DATABASE_TIMEOUT_MS = 15_000;

/** How long the page may take to read the paper and start the read-only editor. */
const EDITOR_TIMEOUT_MS = 15_000;

/** The size the board was drawn at, and the product owner's own screen. */
const BOARD_VIEWPORT = { width: 1265, height: 634 };

const DRAFT_TITLE = 'Human control over autonomous weapons';
const DRAFT_PREAMBLE = [
	'*Recalling* its resolutions 78/241 of 22 December 2023 and 79/62 of 2 December 2024 on lethal autonomous weapons systems,',
	'*Reaffirming* that international humanitarian law, including the principles of distinction, proportionality and precaution, applies fully to all weapons systems, including those with autonomy in their critical functions,',
	'*Noting with appreciation* the work of the Group of Governmental Experts on emerging technologies in the area of lethal autonomous weapons systems under the Convention on Certain Conventional Weapons,'
].join('\n\n');
const DRAFT_OPERATIVE =
	'1. *Calls upon* all States to keep meaningful human control over the use of force.';

const WORKING_TITLE = 'Export controls on autonomy';

function resolutionsPath(room: PaperCommitteeRoom): string {
	return `${room.committeePath}/chair/resolutions`;
}

/** A section of the list, found by its heading. */
function listSection(page: Page, title: string): Locator {
	return page.getByRole('region', { name: title, exact: true });
}

/** The paper's text: the read-only editor once it starts, named by the title. */
function paperText(page: Page, title: string): Locator {
	return page.getByRole('main').getByRole('textbox', { name: title });
}

/** The dais's notes beside the text. */
function notes(page: Page): Locator {
	return page.getByRole('main').getByRole('complementary', { name: 'Notes for the authors' });
}

/** A draft resolution France and Mexico sponsor, sent to the dais. */
async function submitDraft(room: PaperCommitteeRoom, submittedAt?: Date): Promise<string> {
	const paperId = await addDraftResolution(room.committeeId, {
		title: DRAFT_TITLE,
		preamble: DRAFT_PREAMBLE,
		operative: DRAFT_OPERATIVE,
		authorSeatIds: [room.franceSeatId, room.mexicoSeatId]
	});
	await submitPaperAsIs(paperId, submittedAt);

	return paperId;
}

async function readPaperRow(paperId: string) {
	const { data, error } = await createServiceRoleClient()
		.from('committee_papers')
		.select('status, topic_number, sequence, return_comment')
		.eq('id', paperId)
		.single();

	if (error || !data) throw new Error(`Could not read the test paper: ${error?.message}`);

	return data;
}

test.describe("the dais's resolutions", () => {
	test('the chair opens a submitted draft and approves it as Draft resolution 1.1', async ({
		page
	}, testInfo) => {
		const room = await makePaperCommittee('Dais Approve');
		const paperId = await submitDraft(room, new Date('2027-03-15T09:12:00Z'));

		await signIn(page, room.chair);
		await page.goto(resolutionsPath(room));
		await expect(page.getByRole('heading', { level: 1, name: 'Resolutions' })).toBeVisible();
		const submitted = listSection(page, 'Submitted');
		await expect(submitted).toContainText('France');
		await expect(listSection(page, 'Decided')).toContainText('No paper has been decided yet.');

		await submitted.getByRole('link', { name: DRAFT_TITLE }).filter({ visible: true }).click();
		await expect(page.getByRole('heading', { level: 1, name: DRAFT_TITLE })).toBeVisible();
		await expect(page.getByRole('main')).toContainText('Submitted 15 March');
		await expect(page.getByRole('textbox', { name: 'Number' })).toHaveValue('1.1');
		await expect(page.getByRole('main')).toContainText('Recalling');

		if (testInfo.project.name === 'phone') {
			await expectNoSidewaysOverflow(page);
		} else if (testInfo.project.use.javaScriptEnabled !== false) {
			// The board's own size, to hold the page beside it.
			await page.setViewportSize(BOARD_VIEWPORT);
			await expect(paperText(page, DRAFT_TITLE)).toBeVisible({ timeout: EDITOR_TIMEOUT_MS });
			await page.screenshot({ path: 'test-results/chair-resolution-review-1265x634.png' });
		}

		await page.getByRole('button', { name: 'Approve as Draft resolution 1.1' }).click();
		await expect(page).toHaveURL(new RegExp(`${resolutionsPath(room)}$`));
		await expect(page.getByText('approved as Draft resolution 1.1')).toBeVisible();
		await expect(listSection(page, 'Approved, not introduced')).toContainText(DRAFT_TITLE);
		await expect(listSection(page, 'Submitted')).toContainText('No paper is waiting for the dais.');
		expect(await readPaperRow(paperId)).toMatchObject({
			status: 'approved',
			topic_number: 1,
			sequence: 1
		});
	});

	test('the chair writes a note for the authors on words in the text', async ({
		page
	}, testInfo) => {
		skipWithoutJavaScript(testInfo);
		const room = await makePaperCommittee('Dais Note');
		const paperId = await submitDraft(room);

		await signIn(page, room.chair);
		await page.goto(`${resolutionsPath(room)}/${paperId}`);
		const text = paperText(page, DRAFT_TITLE);
		await expect(text).toBeVisible({ timeout: EDITOR_TIMEOUT_MS });
		await expect(text).toHaveAttribute('aria-readonly', 'true');

		await selectWords(text, 'Certain Conventional Weapons');
		// Under the notes' title on a desktop, in the bar at the foot of a phone's screen.
		await page
			.getByRole('button', { name: 'Comment', exact: true })
			.filter({ visible: true })
			.first()
			.click();
		const newNote = page.getByRole('textbox', { name: 'New comment' });
		await expect(newNote).toBeFocused();
		await newNote.fill('Name Protocol II here.');
		await page.locator('#new-thread').getByRole('button', { name: 'Comment' }).click();

		const thread = notes(page).getByRole('article', { name: 'Comment thread' });
		await expect(thread).toContainText('Name Protocol II here.', { timeout: DATABASE_TIMEOUT_MS });
		if (testInfo.project.name === 'phone') {
			await expect(thread).toContainText('On ‘Certain Conventional Weapons’');
		}
	});

	test('the chair returns a working paper to its authors with a comment', async ({ page }) => {
		const room = await makePaperCommittee('Dais Return');
		const paperId = await addWorkingPaper(room.committeeId, {
			title: WORKING_TITLE,
			body: 'Every State should licence the export of targeting software.',
			authorSeatIds: [room.franceSeatId]
		});
		await submitPaperAsIs(paperId);

		await signIn(page, room.chair);
		await page.goto(`${resolutionsPath(room)}/${paperId}`);
		await expect(page.getByRole('textbox', { name: 'Number' })).toHaveValue('1.1');
		await page.getByRole('link', { name: 'Return to the authors' }).click();

		// Drawn in place without JavaScript, the dialog is found by its title rather than named by it.
		const dialog = page
			.getByRole('dialog')
			.filter({ has: page.getByRole('heading', { name: `Return “${WORKING_TITLE}”?` }) });
		await expect(dialog).toBeVisible();
		await dialog
			.getByRole('textbox', { name: 'What should change' })
			.fill('Cite the Wassenaar list.');
		await dialog.getByRole('button', { name: 'Return to the authors' }).click();

		await expect(page).toHaveURL(new RegExp(`${resolutionsPath(room)}$`));
		await expect(page.getByText('returned to its authors')).toBeVisible();
		await expect(listSection(page, 'Submitted')).toContainText('No paper is waiting for the dais.');
		await expect
			.poll(() => readPaperRow(paperId), { timeout: DATABASE_TIMEOUT_MS })
			.toMatchObject({ status: 'writing', return_comment: 'Cite the Wassenaar list.' });
	});
});
