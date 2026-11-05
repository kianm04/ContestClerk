import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	DATABASE_TIMEOUT_MS,
	makeChairedCommittee,
	type ChairedCommittee,
	waitUntilAnswered
} from './chair-room-fixtures';
import {
	addPositionPaper,
	addWrittenPaper,
	isStoredObject,
	readGuideStoragePath,
	readPaperReview,
	readReviewNotificationTitles,
	seatDelegateAs
} from './document-fixtures';
import {
	expectNoSidewaysOverflow,
	expectPageFitsInScreens,
	saveFullPageScreenshot
} from './page-shape';
import { createTestUser, signIn, type TestUser } from './signed-in-user';
import { answerConfirmationPage } from './confirmation-page';
import { waitForChairScript } from './chair-script';

// The acceptance criteria of `specs/05-pages/chair/papers.md` that need a real
// browser: every seated delegate once with the right status and the filter,
// Approve and Request changes with the comment and the delegate's notification,
// the refusal of a changes request without a comment, "Approve all" touching
// only the papers awaiting review, the background guide's upload, replacement
// and removal with the old file gone, and a guide for everyone reaching a
// signed-out visitor on the public committee page. That a chair of another
// committee cannot fetch a paper is proven with that chair's own client in
// `tests/db/documents.test.ts` and `tests/db/storage-documents.test.ts`.
//
// T146 added the reading page of a paper written on MUNMeet,
// `…/chair/papers/[seatId]`: opened from the chair's list and the organiser's,
// a changes request and an approval of the resubmitted text, Previous and Next
// between written papers only, the paper counted on the participants list and
// its export, a 404 for a PDF and for another committee's chair, and the print
// stylesheet that gives an A4 page for "Download PDF".
//
// Every control is a real button in a real `<form method="post">`, including
// the guide's multipart upload, so the tests run on all three projects and
// `desktop-no-js` is the proof that they work without JavaScript.

/** How long a single try inside a retrying block may take. */
const SINGLE_TRY_TIMEOUT_MS = 2_000;

/** How many screens the papers page may take on a laptop. */
const PAPERS_SCREENS = 3;

/** How many screens the reading page of a paper of `READING_PAGE_TEXT`'s length may take. */
const READING_SCREENS = 3;

/** A short paper with a heading, a list and a long word, as a delegate might write one. */
const READING_PAGE_TEXT = [
	'## Background',
	'Kenya has hosted refugees from its neighbours for decades. '.repeat(8),
	"## Kenya's position",
	'- A regional fund for host countries\n- Shared data on arrivals\n- Schooling for every child',
	'Internationalisation-of-responsibility-sharing is the heart of it. '.repeat(6)
].join('\n\n');

/**
 * The smallest file a PDF viewer recognises as one. `setInputFiles` takes a
 * name, a type and the bytes themselves, so no file has to exist on disk.
 */
const TINY_PDF_BYTES = Buffer.from('%PDF-1.7\n%%EOF\n');

/** The first background guide. */
const FIRST_GUIDE = { name: 'unsc-guide.pdf', mimeType: 'application/pdf', buffer: TINY_PDF_BYTES };

/** The guide that replaces the first. The server gives every upload a fresh path. */
const SECOND_GUIDE = {
	name: 'unsc-guide-second-edition.pdf',
	mimeType: 'application/pdf',
	buffer: TINY_PDF_BYTES
};

/** A spreadsheet, which a guide may not be. */
const SPREADSHEET = {
	name: 'budget.xlsx',
	mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	buffer: Buffer.from('not really a spreadsheet')
};

/** A committee with two seated delegates, Kenya and Brazil. */
type PapersCommittee = ChairedCommittee & {
	kenya: { delegate: TestUser; seatId: string };
	brazil: { delegate: TestUser; seatId: string };
};

/**
 * A chaired committee with Kenya's and Brazil's delegates seated in it. Its
 * three seats from `makeChairedCommittee` stay empty, so the page lists two.
 */
async function makePapersCommittee(namePrefix: string): Promise<PapersCommittee> {
	const room = await makeChairedCommittee(namePrefix);
	const kenyaDelegate = await createTestUser('Wanjiru Kamau');
	const brazilDelegate = await createTestUser('Lucas Pereira');

	return {
		...room,
		kenya: {
			delegate: kenyaDelegate,
			seatId: await seatDelegateAs(kenyaDelegate, room.committeeId, 'Kenya')
		},
		brazil: {
			delegate: brazilDelegate,
			seatId: await seatDelegateAs(brazilDelegate, room.committeeId, 'Brazil')
		}
	};
}

/** Give one of the two delegates a paper awaiting review, and answer its id. */
async function givePaper(
	room: PapersCommittee,
	seat: { delegate: TestUser; seatId: string }
): Promise<string> {
	return addPositionPaper({
		conferenceId: room.conferenceId,
		committeeId: room.committeeId,
		seatId: seat.seatId,
		delegate: seat.delegate
	});
}

/** Mark a paper as already sent back, the way an earlier review would have. */
async function markChangesRequested(documentId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('documents')
		.update({ review_status: 'changes_requested', review_comment: 'Add a conclusion.' })
		.eq('id', documentId);

	if (error) {
		throw new Error(`Could not mark the test paper: ${error.message}`);
	}
}

/** What `addWrittenPaper` needs to write a paper for one of the two delegates. */
function writtenSeed(room: PapersCommittee, seat: { delegate: TestUser; seatId: string }) {
	return {
		conferenceId: room.conferenceId,
		committeeId: room.committeeId,
		seatId: seat.seatId,
		delegate: seat.delegate
	};
}

/** Give seats their order in the committee, which is the order "Previous" and "Next" follow. */
async function placeSeatsInOrder(seatIds: string[]): Promise<void> {
	const admin = createServiceRoleClient();

	for (const [index, seatId] of seatIds.entries()) {
		const { error } = await admin
			.from('seats')
			.update({ position: 100 + index })
			.eq('id', seatId);

		if (error) {
			throw new Error(`Could not order the test seats: ${error.message}`);
		}
	}
}

/** The reading page of one seat's written paper (T146). */
function readingPath(room: ChairedCommittee, seatId: string): string {
	return `${room.roomPath}/papers/${seatId}`;
}

/** Wait until the reading page of one seat's paper has really arrived. */
async function expectReadingPage(page: Page, seatName: string): Promise<void> {
	await expect(page.getByRole('heading', { name: seatName, level: 1 })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
}

/**
 * Send a paper in again with new text, writing the columns the delegate's own
 * "Submit for review" writes (`submitWrittenPaper` in
 * `src/lib/server/position-papers.ts`). The delegate's page has its own test
 * in `position-paper.spec.ts`; here only the chair's side matters.
 */
async function resubmitWrittenPaper(documentId: string, body: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('documents')
		.update({
			body_markdown: body,
			review_status: 'submitted',
			review_comment: null,
			reviewed_by: null,
			reviewed_at: null
		})
		.eq('id', documentId);

	if (error) {
		throw new Error(`Could not resubmit the test paper: ${error.message}`);
	}
}

/** Open the papers page and wait until it has really arrived. */
async function openPapers(page: Page, room: ChairedCommittee, query = ''): Promise<void> {
	await page.goto(`${room.roomPath}/papers${query}`);
	await expect(page.getByRole('heading', { name: 'Position papers', level: 1 })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
}

/** The row of one seat, found by the "Kenya · Wanjiru Kamau" line that starts it. */
function paperRow(page: Page, seatName: string) {
	return page
		.getByRole('main')
		.getByRole('listitem')
		.filter({ hasText: `${seatName} · ` });
}

/**
 * Every seat row on the page. The sidebar is a list too, so a row is told
 * apart by its "seat · delegate" line; the three empty seats must not appear.
 */
function paperRows(page: Page) {
	return page
		.getByRole('main')
		.getByRole('listitem')
		.filter({ hasText: /(Kenya|Brazil|France|Ghana|Japan) · / });
}

/** Whether this project runs without JavaScript, where a select does not send its form. */
function isWithoutJavaScript(testInfo: TestInfo): boolean {
	return testInfo.project.name === 'desktop-no-js';
}

/**
 * Press a `ConfirmButton` and answer the question it asks.
 *
 * With JavaScript the press opens a `<dialog>` whose own button submits. Without
 * it the press opens a confirmation page asking the same question, whose own
 * button submits. This waits to see which happened.
 * A copy of the one in `manage-documents.spec.ts`, for the reason that file gives.
 */
async function pressAndConfirm(page: Page, label: string): Promise<void> {
	const button = page.getByRole('main').getByRole('button', { name: label }).first();
	const dialogButton = page.getByRole('dialog').getByRole('button', { name: label }).first();

	await button.press('Enter');

	const isAsking = await dialogButton
		.waitFor({ state: 'visible', timeout: SINGLE_TRY_TIMEOUT_MS })
		.then(() => true)
		.catch(() => false);

	if (isAsking) {
		await dialogButton.press('Enter');
	} else {
		await answerConfirmationPage(page, label);
	}
}

test('is not found for the chair of another committee', async ({ page }) => {
	const room = await makeChairedCommittee('Stranger Papers MUN');
	const otherRoom = await makeChairedCommittee('Other Papers MUN');

	await signIn(page, otherRoom.chair);
	const response = await page.goto(`${room.roomPath}/papers`);

	expect(response?.status()).toBe(404);
});

// specs/05-pages/chair/papers.md's "Papers not required" and "No seated
// delegates" states, both reachable at once from a freshly made committee:
// its three seats (`makeChairedCommittee`) start empty, and the conference's
// `position_paper_required` starts true (the column's own default), so it is
// turned off here directly, the way `markChangesRequested` writes a review
// status straight into `documents` further down this file.
test('tells the chair papers are not required and nobody is seated yet', async ({ page }) => {
	const room = await makeChairedCommittee('No Requirement Papers MUN');

	const admin = createServiceRoleClient();
	const { error } = await admin
		.from('conferences')
		.update({ position_paper_required: false })
		.eq('id', room.conferenceId);

	if (error) {
		throw new Error(`Could not turn off the test conference's paper requirement: ${error.message}`);
	}

	await signIn(page, room.chair);
	await openPapers(page, room);

	const main = page.getByRole('main');

	await expect(main.getByText('This conference does not require position papers.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(main.getByText('No delegates seated yet.')).toBeVisible();
	await expect(main.getByText('Papers appear once the organisers allocate seats.')).toBeVisible();
});

test('lists every seated delegate once, and the filter narrows the list', async ({
	page
}, testInfo) => {
	const room = await makePapersCommittee('List Papers MUN');
	await givePaper(room, room.kenya);

	await signIn(page, room.chair);
	await openPapers(page, room);

	await expect(paperRows(page)).toHaveCount(2);
	await expect(paperRow(page, 'Kenya')).toContainText('Kenya · Wanjiru Kamau');
	await expect(paperRow(page, 'Kenya')).toContainText('Submitted');
	await expect(paperRow(page, 'Kenya').getByRole('link', { name: /Open PDF/ })).toBeVisible();
	await expect(paperRow(page, 'Brazil')).toContainText('Missing');

	// With JavaScript, only the script answers a picked status, so a pick made
	// before it runs does nothing.
	await waitForChairScript(page, testInfo);
	await page.getByRole('combobox', { name: 'Status' }).selectOption({ label: 'Missing' });
	if (isWithoutJavaScript(testInfo)) {
		await page.getByRole('button', { name: 'Filter' }).click();
	}

	await expect(page).toHaveURL(/status=missing/, { timeout: DATABASE_TIMEOUT_MS });
	await expect(paperRows(page)).toHaveCount(1);
	await expect(paperRow(page, 'Brazil')).toBeVisible();
});

test('a written paper opens its reading page from the chair and organiser lists', async ({
	page
}) => {
	const room = await makePapersCommittee('Written Papers MUN');
	await addWrittenPaper(writtenSeed(room, room.kenya), 'Kenya **supports** a regional fund.');

	await signIn(page, room.chair);
	await openPapers(page, room);

	const kenya = paperRow(page, 'Kenya');
	await expect(kenya.getByRole('link', { name: /Open PDF/ })).toHaveCount(0);
	await kenya.getByRole('link', { name: 'Read the paper of Kenya' }).click();
	await expectReadingPage(page, 'Kenya');

	// The organiser reaches the same page from the documents page, where the
	// written paper is counted as awaiting review like an uploaded one. `/login`
	// sends a signed-in visitor away, so the chair's session goes first.
	await page.context().clearCookies();
	await signIn(page, room.organiser);
	await page.goto(
		`/manage/${room.conferenceSlug}/documents?tab=papers&committee=${room.committeeId}`
	);
	await expect(page.getByRole('heading', { name: /Papers for/ })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await page.getByRole('link', { name: 'Read the paper of Kenya' }).click();
	await expectReadingPage(page, 'Kenya');
});

test('Approve and Request changes store the comment and tell the delegate', async ({ page }) => {
	const room = await makePapersCommittee('Review Papers MUN');
	const kenyaPaper = await givePaper(room, room.kenya);
	const brazilPaper = await givePaper(room, room.brazil);

	await signIn(page, room.chair);
	await openPapers(page, room);

	// A changes request says what to change, so an empty comment is refused.
	await paperRow(page, 'Kenya').getByRole('button', { name: 'Request changes' }).click();
	await expect(paperRow(page, 'Kenya').getByText('Tell the delegate what to change.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect((await readPaperReview(kenyaPaper)).review_status).toBe('submitted');

	await paperRow(page, 'Kenya')
		.getByRole('textbox', { name: 'Comment' })
		.fill('Please cite your sources.');
	await paperRow(page, 'Kenya').getByRole('button', { name: 'Request changes' }).click();
	await expect(paperRow(page, 'Kenya')).toContainText('Changes requested', {
		timeout: DATABASE_TIMEOUT_MS
	});

	await paperRow(page, 'Brazil').getByRole('textbox', { name: 'Comment' }).fill('Well argued.');
	await paperRow(page, 'Brazil').getByRole('button', { name: 'Approve' }).click();
	await expect(paperRow(page, 'Brazil')).toContainText('Comment: Well argued.', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(paperRow(page, 'Brazil').getByRole('button', { name: 'Approve' })).toHaveCount(0);

	// The screen shows the result before the server has saved it (T141), so wait for its answer.
	await waitUntilAnswered(page);
	expect(await readPaperReview(kenyaPaper)).toMatchObject({
		review_status: 'changes_requested',
		review_comment: 'Please cite your sources.',
		reviewed_by: room.chair.id
	});
	expect(await readPaperReview(brazilPaper)).toMatchObject({
		review_status: 'approved',
		review_comment: 'Well argued.',
		reviewed_by: room.chair.id
	});
	expect(await readReviewNotificationTitles(room.kenya.delegate.id)).toHaveLength(1);
	expect(await readReviewNotificationTitles(room.brazil.delegate.id)).toHaveLength(1);
});

// T170: the review box always starts empty, with the last comment above it,
// and an approval with the box left empty clears that comment, so the
// delegate's page stops showing it as if it were still current.
test('the box starts empty after a comment, and an empty approval clears it for the delegate', async ({
	page
}) => {
	const room = await makePapersCommittee('Last Comment Papers MUN');
	const kenyaPaper = await givePaper(room, room.kenya);

	await signIn(page, room.chair);
	await openPapers(page, room);

	const kenyaComment = paperRow(page, 'Kenya').getByRole('textbox', { name: 'Comment' });
	await kenyaComment.fill('Please cite your sources.');
	await paperRow(page, 'Kenya').getByRole('button', { name: 'Request changes' }).click();

	// The comment is shown above the box, never inside it.
	await expect(
		paperRow(page, 'Kenya').getByText(
			/^Your last comment, \d{1,2} \w+: Please cite your sources\.$/
		)
	).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(kenyaComment).toHaveValue('');
	await waitUntilAnswered(page);

	// It still starts empty when the page is read again.
	await openPapers(page, room);
	await expect(kenyaComment).toHaveValue('');

	await paperRow(page, 'Kenya').getByRole('button', { name: 'Approve' }).click();
	await expect(paperRow(page, 'Kenya')).toContainText('Approved', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(paperRow(page, 'Kenya')).not.toContainText('Please cite your sources.');
	await waitUntilAnswered(page);
	expect(await readPaperReview(kenyaPaper)).toMatchObject({
		review_status: 'approved',
		review_comment: null
	});

	await page.context().clearCookies();
	await signIn(page, room.kenya.delegate);
	await page.goto(
		`/conferences/${room.conferenceSlug}/committees/${room.committeeSlug}/position-paper`
	);

	const main = page.getByRole('main');
	await expect(main.getByText('Approved').first()).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(main.getByText('Comment from your chair')).toHaveCount(0);
	await expect(main.getByText('Please cite your sources.')).toHaveCount(0);
});

test('"Approve all" approves only the papers awaiting review', async ({ page }) => {
	const room = await makePapersCommittee('Approve All Papers MUN');
	const kenyaPaper = await givePaper(room, room.kenya);
	const brazilPaper = await givePaper(room, room.brazil);
	await markChangesRequested(brazilPaper);

	await signIn(page, room.chair);
	await openPapers(page, room);

	await pressAndConfirm(page, 'Approve all awaiting review');

	await expect(paperRow(page, 'Kenya')).toContainText('Approved', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.getByRole('button', { name: 'Approve all awaiting review' })).toHaveCount(0);
	// The screen shows the result before the server has saved it (T141), so wait for its answer.
	await waitUntilAnswered(page);
	expect((await readPaperReview(kenyaPaper)).review_status).toBe('approved');
	expect(await readPaperReview(brazilPaper)).toMatchObject({
		review_status: 'changes_requested',
		review_comment: 'Add a conclusion.'
	});
});

test('uploads, replaces and removes the background guide, and a guide for everyone is public', async ({
	page,
	browser
}) => {
	const room = await makePapersCommittee('Guide Papers MUN');
	const publicPath = `/conferences/${room.conferenceSlug}/committees/${room.committeeSlug}`;
	const visitor = await browser.newPage();

	await signIn(page, room.chair);
	await openPapers(page, room);
	const main = page.getByRole('main');
	await expect(main.getByText('Delegates see this on the committee page.')).toBeVisible();

	// A spreadsheet is refused, and nothing is saved.
	await main.getByLabel('Guide', { exact: true }).setInputFiles(SPREADSHEET);
	await main.getByRole('button', { name: 'Upload', exact: true }).click();
	await expect(main.getByText('Upload a PDF of at most 20 MB.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect(await readGuideStoragePath(room.committeeId)).toBeNull();

	await main.getByLabel('Guide', { exact: true }).setInputFiles(FIRST_GUIDE);
	await main.getByRole('combobox', { name: 'Who can download it' }).selectOption('everyone');
	await main.getByRole('button', { name: 'Upload', exact: true }).click();
	await expect(main.getByText('unsc-guide.pdf')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	const firstPath = await readGuideStoragePath(room.committeeId);
	expect(firstPath).not.toBeNull();

	// A signed-out visitor finds it on the public committee page.
	await visitor.goto(publicPath);
	await expect(visitor.getByRole('heading', { name: 'Background guide' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(visitor.getByText('UNSC background guide')).toBeVisible();
	await expect(visitor.getByRole('link', { name: /Download the background guide/ })).toBeVisible();

	// Replacing it for delegates only takes the old file away and hides it from visitors.
	await main.getByLabel('Replace with', { exact: true }).setInputFiles(SECOND_GUIDE);
	await main.getByRole('combobox', { name: 'Who can download it' }).selectOption('delegates');
	await main.getByRole('button', { name: 'Replace', exact: true }).click();
	await expect(main.getByText('unsc-guide-second-edition.pdf')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	const secondPath = await readGuideStoragePath(room.committeeId);
	expect(secondPath).not.toBe(firstPath);
	expect(await isStoredObject(secondPath ?? '')).toBe(true);
	expect(await isStoredObject(firstPath ?? '')).toBe(false);

	await visitor.goto(publicPath);
	await expect(visitor.getByRole('heading', { name: 'Topics' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(visitor.getByRole('heading', { name: 'Background guide' })).toHaveCount(0);

	await pressAndConfirm(page, 'Remove guide');
	await expect(main.getByText('Delegates see this on the committee page.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect(await readGuideStoragePath(room.committeeId)).toBeNull();
	expect(await isStoredObject(secondPath ?? '')).toBe(false);

	await visitor.close();
});

test('does not spill off the side of a phone screen', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	const room = await makePapersCommittee('Phone Papers International Model United Nations');
	await givePaper(room, room.kenya);

	await signIn(page, room.chair);
	await openPapers(page, room);

	await saveFullPageScreenshot(page, 'chair-papers');
	await expectNoSidewaysOverflow(page);
});

test('fits in a few screens', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough to measure a height.');

	const room = await makePapersCommittee('Height Papers MUN');
	await givePaper(room, room.kenya);
	await markChangesRequested(await givePaper(room, room.brazil));

	await signIn(page, room.chair);
	await openPapers(page, room);

	// Saved before the assertion, so that a failure leaves a picture of the page.
	await saveFullPageScreenshot(page, 'chair-papers');
	await expectPageFitsInScreens(page, PAPERS_SCREENS);
});

test('a chair requests changes to a written paper, then approves the resubmitted version', async ({
	page
}) => {
	const room = await makePapersCommittee('Read Written Papers MUN');
	const kenyaPaper = await addWrittenPaper(
		writtenSeed(room, room.kenya),
		'## Summary\n\nKenya **supports** a regional fund.'
	);
	await addWrittenPaper(writtenSeed(room, room.brazil), 'Brazil asks for a treaty.');
	await placeSeatsInOrder([room.brazil.seatId, room.kenya.seatId]);

	await signIn(page, room.chair);
	await page.goto(readingPath(room, room.kenya.seatId));
	await expectReadingPage(page, 'Kenya');

	const paper = page.getByRole('article');
	await expect(paper).toContainText('Position paper · Security Council');
	await expect(paper).toContainText('Wanjiru Kamau');
	await expect(paper).toContainText('6 words');
	await expect(paper).toContainText('Awaiting review');
	await expect(paper.getByRole('heading', { name: 'Summary', level: 2 })).toBeVisible();
	await expect(paper.locator('strong', { hasText: 'supports' })).toBeVisible();

	// Brazil's seat comes before Kenya's, so its written paper is the previous one.
	await expect(page.getByRole('link', { name: '← Previous paper' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Next paper →' })).toHaveCount(0);

	// A changes request says what to change, so an empty comment is refused.
	await page.getByRole('button', { name: 'Request changes' }).click();
	await expect(page.getByText('Tell the delegate what to change.').first()).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect((await readPaperReview(kenyaPaper)).review_status).toBe('submitted');

	await page.getByRole('textbox', { name: 'Comment' }).fill('Add a conclusion.');
	await page.getByRole('button', { name: 'Request changes' }).click();
	await expect(paper).toContainText('Changes requested', { timeout: DATABASE_TIMEOUT_MS });
	await waitUntilAnswered(page);
	expect(await readPaperReview(kenyaPaper)).toMatchObject({
		review_status: 'changes_requested',
		review_comment: 'Add a conclusion.'
	});
	await expect(page).toHaveURL(new RegExp(`${readingPath(room, room.kenya.seatId)}$`));

	// The delegate sends it in again, and the chair reads the new version.
	await resubmitWrittenPaper(kenyaPaper, 'Kenya **supports** a regional fund. In conclusion, yes.');
	await page.goto(readingPath(room, room.kenya.seatId));
	await expect(paper).toContainText('In conclusion, yes.', { timeout: DATABASE_TIMEOUT_MS });
	await expect(paper).toContainText('Awaiting review');

	await page.getByRole('button', { name: 'Approve' }).click();
	await expect(paper).toContainText('Approved', { timeout: DATABASE_TIMEOUT_MS });
	await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
	await waitUntilAnswered(page);
	expect((await readPaperReview(kenyaPaper)).review_status).toBe('approved');
	expect(await readReviewNotificationTitles(room.kenya.delegate.id)).toHaveLength(2);

	await page.getByRole('link', { name: '← Previous paper' }).click();
	await expectReadingPage(page, 'Brazil');
	await expect(page.getByRole('link', { name: 'Next paper →' })).toBeVisible();
});

test("a written paper counts in the organiser's paper figures, filter and export", async ({
	page
}) => {
	const room = await makePapersCommittee('Count Written Papers MUN');
	await addWrittenPaper(writtenSeed(room, room.kenya), 'Kenya supports a regional fund.');

	await signIn(page, room.organiser);

	// Kenya's written paper and Brazil's missing one, in the participants list and its export.
	const participantsPath = `/manage/${room.conferenceSlug}/participants`;
	await page.goto(`${participantsPath}?paper=submitted`);
	// A phone shows cards and a laptop a table, with the other kept hidden.
	const kenyaDelegate = page.getByRole('main').getByText('Wanjiru Kamau').filter({ visible: true });
	await expect(kenyaDelegate.first()).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.getByRole('main').getByText('Lucas Pereira')).toHaveCount(0);

	const exported = await (await page.request.get(`${participantsPath}/export`)).text();
	const kenyaLine = exported.split('\n').find((line) => line.includes('Wanjiru Kamau'));
	expect(kenyaLine).toContain('Awaiting review');
});

test('only a written paper of this committee has a reading page', async ({ page }) => {
	const room = await makePapersCommittee('Missing Written Papers MUN');
	const otherRoom = await makeChairedCommittee('Other Written Papers MUN');
	await addWrittenPaper(writtenSeed(room, room.kenya), 'Kenya supports a regional fund.');
	await givePaper(room, room.brazil);

	await signIn(page, room.chair);

	// Brazil's paper is an uploaded PDF, which the browser opens by itself.
	const uploaded = await page.goto(readingPath(room, room.brazil.seatId));
	expect(uploaded?.status()).toBe(404);

	await page.context().clearCookies();
	await signIn(page, otherRoom.chair);
	const stranger = await page.goto(readingPath(room, room.kenya.seatId));
	expect(stranger?.status()).toBe(404);
});

test('prints a written paper on its own on an A4 page', async ({ page, browserName }, testInfo) => {
	// `pnpm test:e2e:webkit` runs the same projects in Safari's engine (T151).
	const isChromiumWithScripts = testInfo.project.name === 'desktop' && browserName === 'chromium';
	test.skip(!isChromiumWithScripts, 'Only Chromium with scripts can make a PDF.');

	const room = await makePapersCommittee('Print Written Papers MUN');
	await addWrittenPaper(writtenSeed(room, room.kenya), 'Kenya **supports** a regional fund.');

	await signIn(page, room.chair);
	await page.goto(readingPath(room, room.kenya.seatId));
	await expectReadingPage(page, 'Kenya');
	await expect(page.getByRole('button', { name: 'Download PDF' })).toBeVisible();

	// On paper only the text is left: no bar, controls, review form or footer.
	await page.emulateMedia({ media: 'print' });
	await expect(page.getByRole('article')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Download PDF' })).toBeHidden();
	await expect(page.getByRole('button', { name: 'Approve' })).toBeHidden();
	await expect(page.getByRole('banner')).toBeHidden();
	await expect(page.getByRole('contentinfo')).toBeHidden();

	// What "Save as PDF" makes: the page's own `@page` size, which is A4.
	const pdf = await page.pdf({ preferCSSPageSize: true });
	const mediaBox = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(pdf.toString('latin1'));
	const [widthPoints, heightPoints] = [Number(mediaBox?.[1]), Number(mediaBox?.[2])];

	// A4 is 210 × 297 mm, which is 595 × 842 points.
	expect(Math.abs(widthPoints - 595)).toBeLessThan(2);
	expect(Math.abs(heightPoints - 842)).toBeLessThan(2);
});

test('the reading page does not spill off the side of a phone screen', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	const room = await makePapersCommittee('Phone Reading International Model United Nations');
	await addWrittenPaper(writtenSeed(room, room.kenya), READING_PAGE_TEXT);

	await signIn(page, room.chair);
	await page.goto(readingPath(room, room.kenya.seatId));
	await expectReadingPage(page, 'Kenya');

	await saveFullPageScreenshot(page, 'chair-paper-reading');
	await expectNoSidewaysOverflow(page);
});

test('the reading page shows a paper of a page or two', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough to measure a height.');

	const room = await makePapersCommittee('Height Reading MUN');
	await addWrittenPaper(writtenSeed(room, room.kenya), READING_PAGE_TEXT);

	await signIn(page, room.chair);
	await page.goto(readingPath(room, room.kenya.seatId));
	await expectReadingPage(page, 'Kenya');

	// Saved before the assertion, so that a failure leaves a picture of the page.
	await saveFullPageScreenshot(page, 'chair-paper-reading');
	await expectPageFitsInScreens(page, READING_SCREENS);
});
