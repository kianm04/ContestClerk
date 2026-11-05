import { expect, test } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { addDraftResolution, makePaperCommittee } from './committee-paper-fixtures';
import { expectNoSidewaysOverflow } from './page-shape';
import { signIn } from './signed-in-user';

// Step 4 of docs/committee-papers.md, on a draft resolution's page:
//
// * its sponsors read the heading drawn from the data, the support it has
//   and the format checks, and open it for signatures;
// * another seat then reads it with its opening phrases styled, signs it
//   from the title row, and takes the signature back.
//
// Both are plain forms, so the two tests run with JavaScript and without it.
// Every test makes a conference of its own (`committee-paper-fixtures.ts`).

/** How long an assertion that waits on a page reading the database may take. */
const DATABASE_TIMEOUT_MS = 15_000;

const TITLE = 'Human control over autonomous weapons';

/** Clause 1 ends with no semicolon, so the format checks have one thing to say. */
const PREAMBLE = 'Recalling its resolution 78/241,';
const OPERATIVE =
	'1. Calls upon all States to negotiate\n2. Decides to remain seized of the matter.';

/** The size the product owner reads the site at, for the picture this test leaves. */
const OWNER_VIEWPORT = { width: 1265, height: 634 };

test.describe('signing a draft resolution', () => {
	test('a sponsor reads the heading, the support and the checks, and opens the draft', async ({
		page
	}, testInfo) => {
		const room = await makePaperCommittee('Signing Open');
		const draftId = await addDraftResolution(room.committeeId, {
			title: TITLE,
			preamble: PREAMBLE,
			operative: OPERATIVE,
			authorSeatIds: [room.franceSeatId]
		});
		await signIn(page, room.clara);
		await page.goto(`${room.papersPath}/${draftId}`);

		const main = page.getByRole('main');
		await expect(main.getByRole('heading', { name: TITLE, level: 1 })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(main.getByText('Draft resolution · Private to the authors')).toBeVisible();

		// The heading is drawn from the data, never typed.
		const sheet = main.getByRole('article', { name: "The draft resolution's text" });
		await expect(sheet.getByText('The General Assembly,')).toBeVisible();
		await expect(sheet.getByRole('definition').filter({ hasText: 'France' })).toBeVisible();

		// Three seats have a delegate, and 20% of three is one, rounded up: France alone.
		const support = main.getByRole('region', { name: 'Support' });
		await expect(support).toContainText('1, 1 needed');
		await expect(support).toContainText('Enough support to submit');
		await expect(main.getByRole('region', { name: 'Signatories' })).toContainText(
			'None until it is open for signatures.'
		);
		await expect(main.getByRole('region', { name: 'Format checks' })).toContainText(
			'Clause 1 should end with a semicolon.'
		);
		await expectNoSidewaysOverflow(page);

		if (testInfo.project.name === 'desktop') {
			await page.setViewportSize(OWNER_VIEWPORT);
			await page.screenshot({ path: 'test-results/draft-resolution.png' });
		}

		await main.getByRole('button', { name: 'Open for signatures' }).click();

		await expect(page.getByText(`“${TITLE}” is open for signatures.`)).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(main.getByText('Draft resolution · Open for signatures')).toBeVisible();
		const signatories = main.getByRole('region', { name: 'Signatories' });
		await expect(signatories).toContainText('Open for signatures since');
		await expect(signatories.getByRole('button', { name: 'Close signatures' })).toBeVisible();
	});

	test('another seat signs the open draft, then takes the signature back', async ({
		page
	}, testInfo) => {
		const room = await makePaperCommittee('Signing Sign');
		const draftId = await addDraftResolution(room.committeeId, {
			title: TITLE,
			preamble: PREAMBLE,
			operative: OPERATIVE,
			authorSeatIds: [room.franceSeatId]
		});
		await createServiceRoleClient()
			.from('committee_papers')
			.update({ is_open_for_signatures: true })
			.eq('id', draftId)
			.throwOnError();
		await signIn(page, room.amara);
		await page.goto(`${room.papersPath}/${draftId}`);

		const main = page.getByRole('main');
		const sheet = main.getByRole('article', { name: "The draft resolution's text" });
		// The opening phrases are styled for a reader, as the sponsors' editor draws them.
		await expect(sheet.locator('em', { hasText: 'Recalling' })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(sheet.locator('u', { hasText: 'Calls upon' })).toBeVisible();
		// A seat deciding whether to sign reads the sponsors before the support.
		await expect(main.getByRole('region', { name: 'Format checks' })).toHaveCount(0);

		if (testInfo.project.name === 'desktop') {
			await page.setViewportSize(OWNER_VIEWPORT);
			await page.screenshot({ path: 'test-results/draft-resolution-signatory.png' });
		}

		await main.getByRole('button', { name: 'Sign as Ghana' }).click();

		await expect(page.getByText(`You signed “${TITLE}”.`)).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(main.getByRole('region', { name: 'Signatories' })).toContainText('Ghana');
		await expect(sheet.getByRole('definition').filter({ hasText: 'Ghana' })).toBeVisible();

		await main.getByRole('button', { name: 'Remove my signature' }).click();

		await expect(page.getByText(`Your signature is off “${TITLE}”.`)).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(main.getByRole('button', { name: 'Sign as Ghana' })).toBeVisible();
	});
});
