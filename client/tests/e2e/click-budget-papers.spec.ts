import { expect, test, type Page } from '@playwright/test';
import { DATABASE_TIMEOUT_MS, waitUntilAnswered } from './chair-room-fixtures';
import { ClickBudgetJourney, type JourneyCount } from './click-budget';
import { readPaperReview } from './document-fixtures';
import {
	SAMUEL,
	restoreSeedRows,
	snapshotSeedRows,
	type SeedRowSnapshot
} from './walkthrough-seed';

// T170: budget 3, a chair's papers from `/home` (specs/05-pages/chair/papers.md
// and specs/05-pages/delegate/home.md, each "Streamlining"). Samuel chairs the
// Human Rights Council of "about to start", four days before its first day,
// where two papers wait for him: Japan's PDF and Mexico's paper written on
// MUNMeet. He signs in, follows "Review papers" from the hero's next step
// "Review 2 position papers (HRC)" and sends Mexico's paper back with a
// comment, counted as clicks · pages ·
// typed fields · decisions by the click-budget helper.
//
// The walk changes one seed paper, which three projects cannot share, so it
// runs in the desktop project only and walks both widths in turn, putting the
// paper and the delegate's notifications back after each.

/** The Human Rights Council of "Northbridge MUN (about to start)", which Samuel chairs. */
const HUMAN_RIGHTS_COUNCIL_ID = 'f3000000-0000-4000-8000-000000000041';

/** Mexico's paper in the Human Rights Council, written on MUNMeet and awaiting review. */
const MEXICO_PAPER_ID = 'fa000000-0000-4000-8000-000000000414';

/** Sofía, Mexico's delegate, whom the review notifies. */
const SOFIA_ID = 'f5000000-0000-4000-8000-000000000057';

/** What the walk writes to the delegate. */
const COMMENT = 'Please add the sources of your figures.';

/** Budget 3 on a laptop, and the design's walk of it: 4 clicks, 4 pages, 3 typed, 0 decisions. */
const BUDGET_3_DESKTOP: JourneyCount = { clicks: 4, pages: 4, typedFields: 3, decisions: 0 };

/**
 * Budget 3 on a phone: 3 clicks, 3 pages, 3 typed, 0 decisions, because the
 * row on the papers page carries its own review form.
 */
const BUDGET_3_PHONE: JourneyCount = { clicks: 3, pages: 3, typedFields: 3, decisions: 0 };

/** The two widths the walk is taken at in turn, each with its own path and budget. */
const WIDTHS = [
	{
		name: 'desktop',
		viewport: { width: 1280, height: 800 },
		isReadingThePaper: true,
		budget: BUDGET_3_DESKTOP
	},
	{
		name: 'phone',
		viewport: { width: 390, height: 844 },
		isReadingThePaper: false,
		budget: BUDGET_3_PHONE
	}
];

/** The rows the walk changes: the committee's papers and the notifications a review sends. */
type ReviewRows = {
	papers: SeedRowSnapshot;
	notifications: SeedRowSnapshot;
};

/** Read the committee's papers and Sofía's notifications as they are now. */
async function keepReviewRows(): Promise<ReviewRows> {
	return {
		papers: await snapshotSeedRows({
			table: 'documents',
			column: 'committee_id',
			value: HUMAN_RIGHTS_COUNCIL_ID
		}),
		notifications: await snapshotSeedRows({
			table: 'notifications',
			column: 'user_id',
			value: SOFIA_ID
		})
	};
}

/** Put the paper back as it was, and remove the notification the review sent. */
async function restoreReviewRows(kept: ReviewRows): Promise<void> {
	await restoreSeedRows(kept.papers);
	await restoreSeedRows(kept.notifications);
}

/** Mexico's row on the papers page, found by the "Mexico · " line that starts it. */
function mexicoRow(page: Page) {
	return page.getByRole('main').getByRole('listitem').filter({ hasText: 'Mexico · ' });
}

/**
 * Budget 3's walk: sign in, the hero's "Review papers", then either the reading page's review
 * form (desktop) or the row's own (phone), typing a comment and pressing
 * "Request changes".
 */
async function walkToOnePaperReviewed(
	page: Page,
	isReadingThePaper: boolean
): Promise<ClickBudgetJourney> {
	const journey = await ClickBudgetJourney.signIn(page, SAMUEL);
	const main = page.getByRole('main');

	// The waiting papers are the hero's next step, "Review 2 position papers
	// (HRC)", and its verb is the page's one filled button.
	await journey.click(main.getByRole('link', { name: 'Review papers', exact: true }));
	await expect(page).toHaveURL(/\/committees\/hrc\/chair\/papers\?status=submitted$/, {
		timeout: DATABASE_TIMEOUT_MS
	});

	// The reading page and the row each have one review form, so the box and
	// the buttons are looked for inside whichever the walk uses.
	let reviewArea = mexicoRow(page);

	if (isReadingThePaper) {
		await journey.click(main.getByRole('link', { name: 'Read the paper of Mexico' }));
		await expect(main.getByRole('heading', { name: 'Mexico', level: 1 })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		reviewArea = main.getByRole('region', { name: 'Review' });
	}

	await journey.type(reviewArea.getByRole('textbox', { name: 'Comment' }), COMMENT);
	await journey.click(reviewArea.getByRole('button', { name: 'Request changes' }));

	// The screen shows the review before the server has saved it (T141).
	await waitUntilAnswered(page);

	return journey;
}

test('budget 3: Samuel reviews one paper from the hero\'s "Review papers", on both widths', async ({
	page
}, testInfo) => {
	test.skip(
		testInfo.project.name !== 'desktop',
		'One seed paper cannot be shared by three projects.'
	);

	for (const width of WIDTHS) {
		const kept = await keepReviewRows();

		try {
			await page.context().clearCookies();
			await page.setViewportSize(width.viewport);

			const journey = await walkToOnePaperReviewed(page, width.isReadingThePaper);

			expect(await readPaperReview(MEXICO_PAPER_ID)).toMatchObject({
				review_status: 'changes_requested',
				review_comment: COMMENT,
				reviewed_by: SAMUEL.id
			});
			expect(journey.count(), `Budget 3 at ${width.name} width`).toEqual(width.budget);
			journey.expectWithinBudget(width.budget);
		} finally {
			// In a `finally`, so that a failed step still leaves the seed as the next test expects.
			await restoreReviewRows(kept);
		}
	}
});
