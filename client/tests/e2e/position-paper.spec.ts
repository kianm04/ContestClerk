import { expect, test, type Locator, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { createTestUser, signIn, type TestUser } from './signed-in-user';
import { addScheduleCommittee, createScheduleConference } from './schedule-fixtures';
import { addPositionPaper, addWrittenPaper, seatDelegateAs } from './document-fixtures';
import { answerConfirmationPage } from './confirmation-page';
import { skipWithoutJavaScript } from './in-place';
import { expectNoSidewaysOverflow, saveFullPageScreenshot } from './page-shape';

// The acceptance criteria of `specs/05-pages/delegate/position-paper.md` that
// need a real browser:
//
// * a seated delegate uploads a PDF and the page then shows it as "Awaiting
//   review";
// * a file that is not a PDF is refused, and nothing is saved;
// * the chair's comment on a paper sent back for changes is shown.
//
// The form is a plain `<form method="post" enctype="multipart/form-data">`
// with no `use:` action and no dialog, so both tests run on the
// `desktop-no-js` project like every other and prove the upload works without
// JavaScript.
//
// Every test makes its own conference and committee, the way
// `manage-documents.spec.ts` does with `schedule-fixtures.ts`. Turning on
// `position_paper_required` is done here rather than through a shared
// fixture, because none of `schedule-fixtures.ts`'s helpers set that column:
// it belongs to this page alone.
//
// T145 adds the second way, "Write it here", which is where a seat with no
// paper yet starts; the upload tests open "Upload a PDF" with `?way=upload`.
// The writing tests prove the draft saves itself and survives a reload, that
// a written paper is submitted and shown read only, that "Edit and resubmit"
// sends a changed version back, and that without JavaScript the plain box
// saves a draft and submits through the confirmation page. A delegate
// writing alone who saved from another window meanwhile is offered "Keep
// mine" and "Use theirs"; a delegation writing together merges instead
// (T148, in `delegation-papers.spec.ts`).

/** How long an assertion that waits on a page reading the database may take. */
const DATABASE_TIMEOUT_MS = 15_000;

/** How far a dialog's middle may sit from the window's middle and still count as centred. */
const ALLOWED_OFF_CENTRE_PIXELS = 2;

const TINY_PDF = {
	name: 'position-paper.pdf',
	mimeType: 'application/pdf',
	buffer: Buffer.from('%PDF-1.7\n%%EOF\n')
};

/** A spreadsheet, which a position paper may never be. */
const SPREADSHEET = {
	name: 'notes.xlsx',
	mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	buffer: Buffer.from('not really a spreadsheet')
};

/** A seated delegate and the address of their own position paper page. */
type SeatedDelegate = {
	delegate: TestUser;
	path: string;
	conferenceId: string;
	committeeId: string;
	seatId: string;
};

/**
 * Make a conference that asks for a position paper, a committee in it, and a
 * delegate seated in that committee, and answer the delegate and the address
 * of their position paper page.
 *
 * `createScheduleConference` leaves `position_paper_required` at the
 * database's own default, which is off, so it is turned on directly here with
 * the service-role client, the way `manage-documents.spec.ts` arranges state
 * that none of the shared fixtures cover.
 */
async function seatDelegateWithPositionPaperRequired(namePrefix: string): Promise<SeatedDelegate> {
	const owner = await createTestUser(`${namePrefix} Owner`);
	const conference = await createScheduleConference({ owner, namePrefix });

	const admin = createServiceRoleClient();
	const { error: conferenceError } = await admin
		.from('conferences')
		.update({ position_paper_required: true })
		.eq('id', conference.id);

	if (conferenceError) {
		throw new Error(`Could not turn on position papers: ${conferenceError.message}`);
	}

	const committeeId = await addScheduleCommittee(conference.id, {
		name: 'General Assembly',
		abbreviation: 'GA'
	});

	const { data: committeeRow, error: committeeError } = await admin
		.from('committees')
		.select('slug')
		.eq('id', committeeId)
		.single();

	if (committeeError || !committeeRow) {
		throw new Error(`Could not read the test committee: ${committeeError?.message}`);
	}

	const delegate = await createTestUser(`${namePrefix} Delegate`);
	const seatId = await seatDelegateAs(delegate, committeeId, 'France');

	return {
		delegate,
		path: `/conferences/${conference.slug}/committees/${committeeRow.slug}/position-paper`,
		conferenceId: conference.id,
		committeeId,
		seatId
	};
}

/** The writing box: the editor with JavaScript, the plain Markdown box without. */
function paperBox(page: Page): Locator {
	return page.getByRole('main').getByRole('textbox', { name: 'Your paper' });
}

/** Wait for the editor, which replaces the plain box once the page's script runs. */
async function waitForEditor(page: Page): Promise<void> {
	await expect(page.getByRole('toolbar', { name: 'Formatting' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
}

/** Put `text` in the writing box, typing into the editor or filling the plain box. */
async function writePaper(page: Page, text: string, isWithoutJavaScript: boolean): Promise<void> {
	if (isWithoutJavaScript) {
		await paperBox(page).fill(text);
		return;
	}

	await waitForEditor(page);
	await paperBox(page).click();
	await page.keyboard.press('ControlOrMeta+A');
	await page.keyboard.type(text);
}

/**
 * Press "Submit for review" and answer its question: in the dialog with
 * JavaScript, on the confirmation page without it.
 */
async function submitForReview(page: Page, isWithoutJavaScript: boolean): Promise<void> {
	const label = 'Submit for review';

	await page.getByRole('main').getByRole('button', { name: label }).click();

	if (isWithoutJavaScript) {
		await answerConfirmationPage(page, label);
		return;
	}

	await page.getByRole('dialog').getByRole('button', { name: label }).click();
}

/**
 * Fails unless `locator` is drawn in the middle of the window, both across and
 * down. `clientWidth` and `clientHeight` leave out a scrollbar, which is the
 * space a modal dialog is centred in.
 */
async function expectCentredInWindow(page: Page, locator: Locator): Promise<void> {
	const box = await locator.boundingBox();
	const windowSize = await page.evaluate(() => ({
		width: document.documentElement.clientWidth,
		height: document.documentElement.clientHeight
	}));

	expect(box, 'The element is not drawn at all.').not.toBeNull();
	// `box` is not null past the line above; `?? 0` only satisfies the type check.
	const middleAcross = (box?.x ?? 0) + (box?.width ?? 0) / 2;
	const middleDown = (box?.y ?? 0) + (box?.height ?? 0) / 2;

	expect(Math.abs(middleAcross - windowSize.width / 2)).toBeLessThanOrEqual(
		ALLOWED_OFF_CENTRE_PIXELS
	);
	expect(Math.abs(middleDown - windowSize.height / 2)).toBeLessThanOrEqual(
		ALLOWED_OFF_CENTRE_PIXELS
	);
}

/** The seat's stored draft, or null when there is none. */
async function readDraft(seatId: string): Promise<string | null> {
	const { data } = await createServiceRoleClient()
		.from('position_paper_drafts')
		.select('body_markdown')
		.eq('seat_id', seatId)
		.maybeSingle();

	return data?.body_markdown ?? null;
}

/** Write the seat's draft as the delegate's other window would have saved it. */
async function writeDraftFromAnotherWindow(seated: SeatedDelegate, body: string): Promise<void> {
	const admin = createServiceRoleClient();
	const existing = await readDraft(seated.seatId);
	const { error } =
		existing === null
			? await admin
					.from('position_paper_drafts')
					.insert({ seat_id: seated.seatId, body_markdown: body, updated_by: seated.delegate.id })
			: await admin
					.from('position_paper_drafts')
					.update({ body_markdown: body, updated_by: seated.delegate.id })
					.eq('seat_id', seated.seatId);

	if (error) throw new Error(`Could not write the test draft: ${error.message}`);
}

/** The seat's position paper row: its body, its file and its review. */
async function readPaper(seatId: string) {
	const { data } = await createServiceRoleClient()
		.from('documents')
		.select('body_markdown, storage_path, review_status')
		.eq('seat_id', seatId)
		.eq('kind', 'position_paper')
		.maybeSingle();

	return data;
}

test.describe('the position paper page', () => {
	test('lets a seated delegate upload a PDF and shows it awaiting review', async ({ page }) => {
		const { delegate, path } = await seatDelegateWithPositionPaperRequired('Paper Upload');

		await signIn(page, delegate);
		await page.goto(`${path}?way=upload`);

		const main = page.getByRole('main');

		await expect(main.getByRole('heading', { name: 'Position paper' })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		// The file box is `FileField`'s, labelled "Position paper" the way every
		// field on the page is: a `<label for>` pointing at the `<input>`.
		await main.getByLabel('Position paper').setInputFiles(TINY_PDF);
		await main.getByRole('button', { name: 'Upload position paper' }).click();

		// A successful upload redirects back to this same page, where the status
		// card now reads the badge `statusLabel('review_status', 'submitted')`
		// gives in `$lib/status.ts`.
		await expect(main.getByText('Awaiting review')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await expect(main.getByText(TINY_PDF.name)).toBeVisible();
	});

	test('refuses a file that is not a PDF', async ({ page }) => {
		const { delegate, path } = await seatDelegateWithPositionPaperRequired('Paper Reject');

		await signIn(page, delegate);
		await page.goto(`${path}?way=upload`);

		const main = page.getByRole('main');

		await expect(main.getByRole('heading', { name: 'Position paper' })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		await main.getByLabel('Position paper').setInputFiles(SPREADSHEET);
		await main.getByRole('button', { name: 'Upload position paper' }).click();

		// The `upload` action's own message for a file whose type is not
		// `application/pdf`, from `isAllowedFile` in `$lib/documents.ts`. The page
		// is redrawn rather than redirected, so nothing was saved to look for.
		await expect(main.getByText('Please upload a PDF.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(main.getByText('Not uploaded')).toBeVisible();
	});

	test("shows the chair's comment on a paper sent back for changes", async ({ page }) => {
		const seated = await seatDelegateWithPositionPaperRequired('Paper Comment');
		const documentId = await addPositionPaper(seated);

		// A chair's review is written straight to the row here; the review itself
		// is tested on the organiser's documents page in `manage-documents.spec.ts`.
		const admin = createServiceRoleClient();
		const { error } = await admin
			.from('documents')
			.update({ review_status: 'changes_requested', review_comment: 'Cite your sources.' })
			.eq('id', documentId);

		if (error) {
			throw new Error(`Could not send the test paper back: ${error.message}`);
		}

		await signIn(page, seated.delegate);
		await page.goto(seated.path);

		const main = page.getByRole('main');

		await expect(main.getByText('Comment from your chair')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(main.getByText('“Cite your sources.”')).toBeVisible();
	});

	test('opens on "Write it here" and saves the draft by itself, through a reload', async ({
		page
	}, testInfo) => {
		skipWithoutJavaScript(testInfo);
		const seated = await seatDelegateWithPositionPaperRequired('Paper Draft');

		await signIn(page, seated.delegate);
		await page.goto(seated.path);
		await expect(page.getByRole('link', { name: 'Write it here' })).toHaveAttribute(
			'aria-current',
			'page',
			{ timeout: DATABASE_TIMEOUT_MS }
		);

		await writePaper(page, 'France supports the treaty', false);

		await expect(page.getByText(/^Saved/)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await expect(page.getByText('4 words')).toBeVisible();
		await expect
			.poll(() => readDraft(seated.seatId), { timeout: DATABASE_TIMEOUT_MS })
			.toBe('France supports the treaty');

		await page.reload();
		await waitForEditor(page);
		await expect(paperBox(page)).toContainText('France supports the treaty');
	});

	test('a save that meets a newer draft from another window offers "Keep mine" and "Use theirs"', async ({
		page
	}, testInfo) => {
		skipWithoutJavaScript(testInfo);
		// A delegate with no delegation writes alone, so their paper is not written live (T148).
		const seated = await seatDelegateWithPositionPaperRequired('Paper Clash');
		await writeDraftFromAnotherWindow(seated, 'First words');

		await signIn(page, seated.delegate);
		await page.goto(seated.path);
		await waitForEditor(page);

		await writeDraftFromAnotherWindow(seated, 'Rewritten in another window');
		await writePaper(page, 'Rewritten here', false);

		await expect(page.getByText('You changed this draft in another window.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await page.getByRole('button', { name: 'Use theirs' }).click();
		await expect(paperBox(page)).toContainText('Rewritten in another window');
		await expect(page.getByRole('button', { name: 'Keep mine' })).toHaveCount(0);
	});

	test('submits a written paper, shows it read only and drops the draft', async ({
		page
	}, testInfo) => {
		const isWithoutJavaScript = testInfo.project.use.javaScriptEnabled === false;
		const seated = await seatDelegateWithPositionPaperRequired('Paper Written');

		await signIn(page, seated.delegate);
		await page.goto(seated.path);
		await writePaper(page, 'France supports a **binding** treaty.', isWithoutJavaScript);
		await submitForReview(page, isWithoutJavaScript);

		const main = page.getByRole('main');
		await expect(main.getByText('Awaiting review').first()).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(main.getByRole('link', { name: 'Edit and resubmit' })).toBeVisible();
		await expect(paperBox(page)).toHaveCount(0);

		const paper = await readPaper(seated.seatId);
		expect(paper?.storage_path).toBeNull();
		expect(paper?.body_markdown).toContain('binding');
		expect(await readDraft(seated.seatId)).toBeNull();
	});

	test('saves a draft with the plain box without JavaScript', async ({ page }, testInfo) => {
		test.skip(testInfo.project.use.javaScriptEnabled !== false, 'This is the form without script.');
		const seated = await seatDelegateWithPositionPaperRequired('Paper Plain Draft');

		await signIn(page, seated.delegate);
		await page.goto(seated.path);
		const typed = '## Small arms\n\nFrance supports marking and tracing.';
		await paperBox(page).fill(typed);
		await page.getByRole('button', { name: 'Save draft' }).click();

		await expect(page.getByText('Draft saved.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await expect(paperBox(page)).toHaveValue(typed);
		expect(await readDraft(seated.seatId)).toBe(typed);
	});

	test('"Edit and resubmit" sends a changed paper back after the chair asked for changes', async ({
		page
	}, testInfo) => {
		const isWithoutJavaScript = testInfo.project.use.javaScriptEnabled === false;
		const seated = await seatDelegateWithPositionPaperRequired('Paper Resubmit');
		const documentId = await addWrittenPaper(seated, 'France supports the treaty.');
		await createServiceRoleClient()
			.from('documents')
			.update({ review_status: 'changes_requested', review_comment: 'Cite your sources.' })
			.eq('id', documentId);

		await signIn(page, seated.delegate);
		await page.goto(seated.path);
		await expect(page.getByText('“Cite your sources.”')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await page.getByRole('link', { name: 'Edit and resubmit' }).click();

		// The editor starts from the paper as it was submitted.
		if (isWithoutJavaScript) {
			await expect(paperBox(page)).toHaveValue('France supports the treaty.');
		} else {
			await waitForEditor(page);
			await expect(paperBox(page)).toContainText('France supports the treaty.');
		}

		await writePaper(page, 'France supports the treaty, as the UN reported.', isWithoutJavaScript);
		await submitForReview(page, isWithoutJavaScript);

		await expect(page.getByRole('main').getByText('Awaiting review').first()).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		const paper = await readPaper(seated.seatId);
		expect(paper?.review_status).toBe('submitted');
		expect(paper?.body_markdown).toBe('France supports the treaty, as the UN reported.');
	});

	test('refuses to send back the very paper the chair asked to change, and keeps the editor', async ({
		page
	}, testInfo) => {
		const isWithoutJavaScript = testInfo.project.use.javaScriptEnabled === false;
		const seated = await seatDelegateWithPositionPaperRequired('Paper Unchanged');
		const documentId = await addWrittenPaper(seated, 'France supports the treaty.');
		await createServiceRoleClient()
			.from('documents')
			.update({ review_status: 'changes_requested', review_comment: 'Cite your sources.' })
			.eq('id', documentId);

		await signIn(page, seated.delegate);
		await page.goto(`${seated.path}?way=write&edit=1`);
		if (!isWithoutJavaScript) await waitForEditor(page);
		await submitForReview(page, isWithoutJavaScript);

		// Without JavaScript the page is drawn again at the action's address,
		// which keeps `edit=1`, so the editor and its text are still there.
		await expect(
			page.getByText('Change your paper before sending it back to your chair.')
		).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(paperBox(page)).toBeVisible();
		expect((await readPaper(seated.seatId))?.review_status).toBe('changes_requested');
	});

	test('the writing way fits a phone screen', async ({ page }, testInfo) => {
		test.skip(
			testInfo.project.name !== 'phone',
			'Only the phone project has a phone-sized window.'
		);
		const seated = await seatDelegateWithPositionPaperRequired('Paper Phone');

		await signIn(page, seated.delegate);
		await page.goto(seated.path);
		await waitForEditor(page);

		await expectNoSidewaysOverflow(page);
		await saveFullPageScreenshot(page, 'position-paper-write-phone');
	});

	test('the writing way on a desktop, with the topics beside the editor', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop', 'One project is enough for the screenshot.');
		const seated = await seatDelegateWithPositionPaperRequired('Paper Desktop');
		await createServiceRoleClient()
			.from('committees')
			.update({ topics: ['Small arms control', 'Cyber operations'] })
			.eq('id', seated.committeeId);

		await signIn(page, seated.delegate);
		await page.goto(seated.path);
		await waitForEditor(page);

		await expect(page.getByRole('heading', { name: 'Topics to cover' })).toBeVisible();
		await saveFullPageScreenshot(page, 'position-paper-write-desktop');
	});

	// Trello Y03A7cLw: the question used to open pinned to the top-left corner.
	test('asks "Submit your position paper?" in the middle of the screen', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop', 'One project is enough for the screenshot.');
		const seated = await seatDelegateWithPositionPaperRequired('Paper Question');

		await signIn(page, seated.delegate);
		await page.goto(seated.path);
		await waitForEditor(page);
		await page.getByRole('main').getByRole('button', { name: 'Submit for review' }).click();

		const question = page.getByRole('dialog', { name: 'Submit your position paper?' });
		await expect(question).toBeVisible();
		await expectCentredInWindow(page, question);
		await saveFullPageScreenshot(page, 'position-paper-submit-question');
	});
});
