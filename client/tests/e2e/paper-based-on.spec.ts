import { expect, test, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { addWorkingPaper, makePaperCommittee, PAPER_TOPICS } from './committee-paper-fixtures';
import { skipWithoutJavaScript } from './in-place';
import { expectNoSidewaysOverflow } from './page-shape';
import { pickOption, setChecked } from './shadcn-controls';
import { signIn } from './signed-in-user';

// Step 4 of docs/committee-papers.md, as a delegate starts a draft resolution:
//
// * "Start a paper" asks for the kind first, offering only what the committee
//   writes, and a draft resolution names the introduced working papers it is
//   based on, with JavaScript and without it;
// * with JavaScript, "Based on" is there only while a draft resolution is
//   chosen.
//
// Every test makes a conference of its own (`committee-paper-fixtures.ts`),
// so the three projects never write into one another's papers.

/** How long an assertion that waits on a page reading the database may take. */
const DATABASE_TIMEOUT_MS = 15_000;

/** The introduced working paper the draft is based on. */
const WORKING_PAPER_TITLE = 'Meaningful human control';

/** The draft the delegate starts. */
const DRAFT_TITLE = 'Autonomous weapons and human judgement';

/** The size the product owner reads the site at, for the picture this test leaves. */
const OWNER_VIEWPORT = { width: 1265, height: 634 };

/** The working papers a paper is based on, straight from the database. */
async function readSourcePaperIds(paperId: string): Promise<string[]> {
	const { data, error } = await createServiceRoleClient()
		.from('committee_paper_sources')
		.select('source_paper_id')
		.eq('paper_id', paperId);

	if (error) throw new Error(`Could not read what the paper is based on: ${error.message}`);

	return (data ?? []).map((row) => row.source_paper_id);
}

/** The id at the end of the paper's address, once "Start writing" has opened it. */
async function waitForStartedPaperId(page: Page, papersPath: string): Promise<string> {
	const paperPath = new RegExp(`${papersPath}/([0-9a-f-]{36})$`);
	await expect(page).toHaveURL(paperPath, { timeout: DATABASE_TIMEOUT_MS });

	return paperPath.exec(new URL(page.url()).pathname)?.[1] ?? '';
}

test.describe('a draft resolution based on working papers', () => {
	test('a delegate starts a draft resolution based on an introduced working paper', async ({
		page
	}, testInfo) => {
		const room = await makePaperCommittee('Based On');
		const workingPaperId = await addWorkingPaper(room.committeeId, {
			title: WORKING_PAPER_TITLE,
			body: 'Recalling the Convention on Certain Conventional Weapons,',
			authorSeatIds: [room.mexicoSeatId],
			isIntroduced: true
		});
		await signIn(page, room.clara);
		await page.goto(`${room.papersPath}/new`);

		const main = page.getByRole('main');
		await expect(main.getByRole('heading', { name: 'Start a paper', level: 1 })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await pickOption(page, testInfo, main.getByLabel('Kind'), 'Draft resolution');
		await main.getByLabel('Title').fill(DRAFT_TITLE);
		await pickOption(page, testInfo, main.getByLabel('Topic'), PAPER_TOPICS[0]);

		const basedOn = main.getByRole('group', { name: 'Based on' });
		await expect(basedOn).toContainText(
			'Their text is shown beside yours while you write. Nothing is copied.'
		);
		await setChecked(
			testInfo,
			basedOn.getByLabel(`Working paper 1.1 · ${WORKING_PAPER_TITLE}`),
			true
		);
		await expectNoSidewaysOverflow(page);

		if (testInfo.project.name === 'desktop') {
			await page.setViewportSize(OWNER_VIEWPORT);
			await page.screenshot({ path: 'test-results/based-on-form.png' });
		}

		await main.getByRole('button', { name: 'Start writing' }).click();

		const draftId = await waitForStartedPaperId(page, room.papersPath);
		expect(await readSourcePaperIds(draftId)).toEqual([workingPaperId]);
	});

	test('"Based on" is there only while a draft resolution is chosen', async ({
		page
	}, testInfo) => {
		skipWithoutJavaScript(testInfo);
		const room = await makePaperCommittee('Based On Kind');
		await addWorkingPaper(room.committeeId, {
			title: WORKING_PAPER_TITLE,
			body: 'Recalling the Convention on Certain Conventional Weapons,',
			authorSeatIds: [room.mexicoSeatId],
			isIntroduced: true
		});
		await signIn(page, room.clara);
		await page.goto(`${room.papersPath}/new`);

		const main = page.getByRole('main');
		const kind = main.getByLabel('Kind');
		const basedOn = main.getByRole('group', { name: 'Based on' });

		// The form starts on a working paper, which is based on nothing.
		await expect(kind).toContainText('Working paper', { timeout: DATABASE_TIMEOUT_MS });
		await expect(basedOn).toHaveCount(0);

		await pickOption(page, testInfo, kind, 'Draft resolution');
		await expect(basedOn).toBeVisible();

		await pickOption(page, testInfo, kind, 'Working paper');
		await expect(basedOn).toHaveCount(0);
	});
});
