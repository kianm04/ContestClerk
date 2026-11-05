import { expect, test } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { addWorkingPaper, makePaperCommittee } from './committee-paper-fixtures';
import { expectNoSidewaysOverflow } from './page-shape';
import { signIn } from './signed-in-user';

// Step 5 of docs/committee-papers.md, from the authors' side:
//
// * an author submits a working paper from its title row, reads it "With the
//   dais", and withdraws it again;
// * a paper the dais returned shows the dais's comment above the editor, and
//   "Submit to the dais" as the one primary button.
//
// The dialogs are addresses and the buttons plain forms, so the tests run with
// JavaScript and without it. Every test makes a conference of its own
// (`committee-paper-fixtures.ts`).

/** How long an assertion that waits on a page reading the database may take. */
const DATABASE_TIMEOUT_MS = 15_000;

const TITLE = 'A register of autonomous weapons';
const BODY = 'Every State should report the autonomous weapons it holds.';
const RETURN_COMMENT = 'Say in the second paragraph whether the register is public.';

/** The size the product owner reads the site at, for the picture this test leaves. */
const OWNER_VIEWPORT = { width: 1265, height: 634 };

test.describe('submitting a paper to the dais', () => {
	// The dialogs zoom in as they open, and a button still moving cannot be
	// pressed: once in a while that zoom never settles for Playwright. Reduced
	// motion, which the site honours, takes the zoom away; the dialogs are
	// what is tested here, not how they open.
	test.use({ reducedMotion: 'reduce' });

	test('an author submits a working paper, reads it with the dais, and withdraws it', async ({
		page
	}) => {
		const room = await makePaperCommittee('Submitting Submit');
		const paperId = await addWorkingPaper(room.committeeId, {
			title: TITLE,
			body: BODY,
			authorSeatIds: [room.franceSeatId]
		});
		await signIn(page, room.clara);
		await page.goto(`${room.papersPath}/${paperId}`);

		const main = page.getByRole('main');
		await main.getByRole('link', { name: 'Submit to the dais' }).click();

		// Without JavaScript the dialog is drawn by the server, and is not named by its heading.
		const dialog = page.getByRole('dialog');
		await expect(
			dialog.getByRole('heading', { name: `Submit “${TITLE}” to the dais?` })
		).toBeVisible();
		await expect(dialog).toContainText('as version 1');
		await dialog.getByRole('button', { name: 'Submit to the dais' }).click();

		await expect(page.getByText(`“${TITLE}” is with the dais.`)).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		const metaLine = main.getByText('Working paper · Submitted');
		await expect(metaLine).toContainText('· With the dais');
		// The committee has one chair, who is named as the one who decides.
		await expect(main.getByRole('region', { name: 'With the dais' })).toContainText(
			`${room.chair.fullName}, the Chair, will approve it as a working paper`
		);
		await expect(main.getByRole('link', { name: 'Submit to the dais' })).toHaveCount(0);
		await expectNoSidewaysOverflow(page);

		await main.getByRole('link', { name: 'Withdraw', exact: true }).click();
		const withdrawing = page.getByRole('dialog');
		await expect(withdrawing.getByRole('heading', { name: `Withdraw “${TITLE}”?` })).toBeVisible();
		await withdrawing.getByRole('button', { name: 'Withdraw paper' }).click();

		await expect(page.getByText(`“${TITLE}” is withdrawn.`)).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(main.getByText('Working paper · Withdrawn')).toBeVisible();
		await expect(main.getByRole('link', { name: 'Withdraw', exact: true })).toHaveCount(0);
	});

	test('a returned paper shows the dais’s comment above the editor', async ({ page }, testInfo) => {
		const room = await makePaperCommittee('Submitting Returned');
		const paperId = await addWorkingPaper(room.committeeId, {
			title: TITLE,
			body: BODY,
			authorSeatIds: [room.franceSeatId, room.mexicoSeatId]
		});
		// What `return_paper` leaves: the paper is being written again, with the chair's comment.
		const submittedAt = new Date(Date.now() - 30 * 60_000).toISOString();
		await createServiceRoleClient()
			.from('committee_papers')
			.update({
				submitted_at: submittedAt,
				decided_at: new Date().toISOString(),
				decided_by: room.chair.id,
				return_comment: RETURN_COMMENT
			})
			.eq('id', paperId)
			.throwOnError();
		await signIn(page, room.clara);
		await page.goto(`${room.papersPath}/${paperId}`);

		const main = page.getByRole('main');
		const notes = main.getByRole('region', { name: 'Returned with notes' });
		await expect(notes).toContainText(RETURN_COMMENT, { timeout: DATABASE_TIMEOUT_MS });
		await expect(notes).toContainText(`${room.chair.fullName}, Chair ·`);
		await expect(main.getByText('Working paper · Returned')).toBeVisible();
		await expect(main.getByRole('link', { name: 'Submit to the dais' })).toBeVisible();
		// Once submitted, a paper is withdrawn rather than deleted.
		await expect(main.getByRole('link', { name: 'Withdraw paper' })).toBeVisible();
		await expect(main.getByRole('link', { name: 'Delete paper' })).toHaveCount(0);
		await expectNoSidewaysOverflow(page);

		if (testInfo.project.name === 'desktop') {
			await page.setViewportSize(OWNER_VIEWPORT);
			await page.screenshot({ path: 'test-results/paper-returned.png' });
		}
	});
});
