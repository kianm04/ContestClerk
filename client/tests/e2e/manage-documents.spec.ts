import { expect, test, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { createTestUser, signIn, type TestUser } from './signed-in-user';
import {
	expectNoSidewaysOverflow,
	expectPageFitsInScreens,
	saveFullPageScreenshot
} from './page-shape';
import {
	addScheduleCommittee,
	createScheduleConference,
	type ScheduleConference
} from './schedule-fixtures';
import {
	addPositionPaper,
	isStoredObject,
	readGuideStoragePath,
	readPaperReview,
	readReviewNotificationTitles,
	seatDelegateAs
} from './document-fixtures';
import { answerConfirmationPage } from './confirmation-page';
import { waitUntilAnswered } from './chair-room-fixtures';
import { skipWithoutJavaScript } from './in-place';
import {
	AT_ONCE_TIMEOUT_MS,
	answerSlowly,
	answerWithError,
	sawSpinner,
	watchForSpinners
} from './instant';

// The acceptance criteria of `specs/05-pages/organiser/documents.md` that need
// a real browser, for the page task T37 builds at `/manage/[slug]/documents`:
//
// * a resource is uploaded, its audience changed, and it is deleted;
// * a second background guide replaces the first, and the old object is gone;
// * the position paper counts of a committee add up to its filled seats;
// * Approve and Request changes write the four review columns and notify the
//   delegate, and Request changes without a comment is refused;
// * a file over 20 MB, or of the wrong type, is refused and nothing is saved;
// * an organiser of another conference gets a 404;
// * the page does not spill off a phone and stays a few screens tall.
//
// EVERY FORM WITHOUT JAVASCRIPT
// Every control is a real submit button in a real `<form method="post">`, or a
// link, and "Request changes" opens as a form in the page through the address
// rather than in a dialog, so these tests run on the `desktop-no-js` project
// like every other and that is the proof.
//
// Every test makes its own conference in `schedule-fixtures.ts`, which says why
// they run in May 2020.

/** How long an assertion that waits on a page reading the database may take. */
const DATABASE_TIMEOUT_MS = 15_000;

/** How long a single try inside a retrying block may take. */
const SINGLE_TRY_TIMEOUT_MS = 2_000;

/** How many windows tall the papers tab may be with a committee's seats open. */
const MANAGE_DOCUMENTS_SCREENS = 3;

/**
 * The smallest file a PDF viewer recognises as one. `setInputFiles` takes a
 * name, a type and the bytes themselves, so no file has to exist on disk.
 */
const TINY_PDF_BYTES = Buffer.from('%PDF-1.7\n%%EOF\n');

/** A PDF under every limit, for the resource and the first background guide. */
const SMALL_PDF = {
	name: 'rules-of-procedure.pdf',
	mimeType: 'application/pdf',
	buffer: TINY_PDF_BYTES
};

/**
 * The same bytes under another name, for the guide that replaces the first. The
 * server gives every upload a fresh uuid, so the two land at different paths.
 */
const REPLACEMENT_PDF = {
	name: 'better-guide.pdf',
	mimeType: 'application/pdf',
	buffer: TINY_PDF_BYTES
};

/** One byte over 20 MB, the `documents` bucket's own limit. */
const OVERSIZED_PDF = {
	name: 'enormous.pdf',
	mimeType: 'application/pdf',
	buffer: Buffer.alloc(20 * 1024 * 1024 + 1)
};

/** A spreadsheet, which neither a resource nor a guide may be. */
const SPREADSHEET = {
	name: 'budget.xlsx',
	mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	buffer: Buffer.from('not really a spreadsheet')
};

/** An organiser signed in with a conference of their own. */
type SignedInOrganiser = {
	organiser: TestUser;
	conference: ScheduleConference;
	/** `/manage/<slug>/documents`. */
	documentsPath: string;
};

/** Sign a brand-new organiser in and give them a conference. */
async function signInWithAConference(page: Page, prefix: string): Promise<SignedInOrganiser> {
	const organiser = await createTestUser('Priya Nair');
	await signIn(page, organiser);

	const conference = await createScheduleConference({ owner: organiser, namePrefix: prefix });

	return { organiser, conference, documentsPath: `/manage/${conference.slug}/documents` };
}

/** Open one address of the page and wait until it has really arrived. */
async function openDocuments(page: Page, address: string): Promise<void> {
	await page.goto(address);

	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Documents', {
		timeout: DATABASE_TIMEOUT_MS
	});
}

/**
 * Press a `ConfirmButton` and answer the question it asks.
 *
 * With JavaScript the press opens a `<dialog>` whose own button submits. Without
 * it the press opens a confirmation page asking the same question, whose own
 * button submits. This waits to see which happened.
 * A copy of the one in `manage-fees.spec.ts`, for the reason that file gives.
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

/** A committee with delegates seated in it, each with a seat of their own. */
type SeatedCommittee = {
	committeeId: string;
	delegates: { delegate: TestUser; seatId: string }[];
};

/** Add a committee and seat one new delegate per name in `seats`. */
async function addSeatedCommittee(
	conference: ScheduleConference,
	committee: { name: string; abbreviation: string; position?: number },
	seats: { delegateName: string; seatName: string }[]
): Promise<SeatedCommittee> {
	const committeeId = await addScheduleCommittee(conference.id, committee);
	const delegates: SeatedCommittee['delegates'] = [];

	for (const seat of seats) {
		const delegate = await createTestUser(seat.delegateName);
		const seatId = await seatDelegateAs(delegate, committeeId, seat.seatName);
		delegates.push({ delegate, seatId });
	}

	return { committeeId, delegates };
}

// Every test signs a new account in and posts at least one form while the whole
// suite shares one local database. `test.slow()` triples the time allowed.
test.beforeEach(() => {
	test.slow();
});

test('uploads a resource, changes who it is for, and deletes it', async ({ page }) => {
	const { documentsPath } = await signInWithAConference(page, 'Resource Upload MUN');
	await openDocuments(page, documentsPath);

	const main = page.getByRole('main');
	await expect(main.getByText('No resources yet.')).toBeVisible();

	await main.getByLabel('Title', { exact: true }).fill('Rules of procedure');
	await main.getByLabel('File', { exact: true }).setInputFiles(SMALL_PDF);
	await main.getByLabel('Audience', { exact: true }).selectOption('everyone');
	await main.getByRole('button', { name: 'Upload', exact: true }).press('Enter');

	// The tab carries its count after its name, "Shared files 1".
	await expect(main.getByRole('link', { name: 'Shared files 1' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(main.getByRole('link', { name: 'Download Rules of procedure' })).toBeVisible();

	await main.getByLabel('Audience of Rules of procedure').selectOption('staff');
	await main.getByRole('button', { name: 'Save', exact: true }).press('Enter');

	await expect(main.getByLabel('Audience of Rules of procedure')).toHaveValue('staff', {
		timeout: DATABASE_TIMEOUT_MS
	});

	await pressAndConfirm(page, 'Delete');

	await expect(main.getByText('No resources yet.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
});

test('refuses a file over 20 MB or of the wrong type and saves nothing', async ({ page }) => {
	const { documentsPath } = await signInWithAConference(page, 'Refused Upload MUN');
	await openDocuments(page, documentsPath);

	const main = page.getByRole('main');

	await main.getByLabel('Title', { exact: true }).fill('Far too big');
	await main.getByLabel('File', { exact: true }).setInputFiles(OVERSIZED_PDF);
	await main.getByRole('button', { name: 'Upload', exact: true }).press('Enter');

	await expect(main.getByText('The file is larger than 20 MB.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	// What was typed is still there, so the organiser only has to pick another file.
	await expect(main.getByLabel('Title', { exact: true })).toHaveValue('Far too big');

	await main.getByLabel('File', { exact: true }).setInputFiles(SPREADSHEET);
	await main.getByRole('button', { name: 'Upload', exact: true }).press('Enter');

	await expect(main.getByText('Resources can be a PDF, an image or a Word document.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	await openDocuments(page, documentsPath);
	await expect(main.getByText('No resources yet.')).toBeVisible();
});

test('replaces a background guide and takes the old file away', async ({ page }) => {
	const { conference, documentsPath } = await signInWithAConference(page, 'Guide Replace MUN');
	const committeeId = await addScheduleCommittee(conference.id, {
		name: 'Security Council',
		abbreviation: 'UNSC'
	});

	await openDocuments(page, `${documentsPath}?tab=guides`);

	const main = page.getByRole('main');
	const guideFile = main.getByLabel('Background guide for UNSC', { exact: true });
	await expect(main.getByText('Missing')).toBeVisible();

	// A spreadsheet is refused under the committee's own card first.
	await guideFile.setInputFiles(SPREADSHEET);
	await main.getByRole('button', { name: 'Upload', exact: true }).press('Enter');
	await expect(main.getByText('Background guides must be a PDF.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect(await readGuideStoragePath(committeeId)).toBeNull();

	await guideFile.setInputFiles(SMALL_PDF);
	await main.getByRole('button', { name: 'Upload', exact: true }).press('Enter');

	await expect(main.getByRole('button', { name: 'Replace', exact: true })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	const firstPath = await readGuideStoragePath(committeeId);
	expect(firstPath).not.toBeNull();

	await main
		.getByLabel('Background guide for UNSC', { exact: true })
		.setInputFiles(REPLACEMENT_PDF);
	await main.getByRole('button', { name: 'Replace', exact: true }).press('Enter');

	await expect(main.getByText('better-guide.pdf')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	const secondPath = await readGuideStoragePath(committeeId);
	expect(secondPath).not.toBeNull();
	expect(secondPath).not.toBe(firstPath);
	expect(await isStoredObject(secondPath ?? '')).toBe(true);
	expect(await isStoredObject(firstPath ?? '')).toBe(false);
});

test('shows "Add committees first." on the guides tab before there are any committees', async ({
	page
}) => {
	const { conference, documentsPath } = await signInWithAConference(
		page,
		'No Committees Guides MUN'
	);

	await openDocuments(page, `${documentsPath}?tab=guides`);

	const main = page.getByRole('main');
	await expect(main.getByText('Add committees first.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// Each committee has one background guide, so the empty state offers a way
	// to make one instead of an upload form nothing can be attached to yet.
	const goToCommittees = main.getByRole('link', { name: 'Go to committees' });
	await expect(goToCommittees).toBeVisible();
	await goToCommittees.click();
	await expect(page).toHaveURL(`/manage/${conference.slug}/committees`, {
		timeout: DATABASE_TIMEOUT_MS
	});
});

test('shows "No delegates seated yet." on the papers tab while every seat is empty', async ({
	page
}) => {
	const { conference, documentsPath } = await signInWithAConference(
		page,
		'No Delegates Papers MUN'
	);
	await addScheduleCommittee(conference.id, { name: 'Security Council', abbreviation: 'UNSC' });

	await openDocuments(page, `${documentsPath}?tab=papers`);

	// Papers are counted per seat, so a committee that exists but has nobody
	// seated in it still counts as nothing to review yet.
	await expect(page.getByRole('main').getByText('No delegates seated yet.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
});

test('tells the organiser position papers are optional when the conference does not require them', async ({
	page
}) => {
	const { conference, documentsPath } = await signInWithAConference(page, 'Optional Papers MUN');

	// `createScheduleConference` leaves `position_paper_required` at the
	// column's own default, which is `true`, so this test turns it off the way
	// the application form's own toggle would.
	const admin = createServiceRoleClient();
	const { error } = await admin
		.from('conferences')
		.update({ position_paper_required: false })
		.eq('id', conference.id);
	if (error) {
		throw new Error(`Could not turn off position papers for the test conference: ${error.message}`);
	}

	await openDocuments(page, `${documentsPath}?tab=papers`);

	await expect(
		page.getByRole('main').getByText('Position papers are optional for this conference.')
	).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
});

test('counts every filled seat once, whatever its paper says', async ({ page }) => {
	const { conference, documentsPath } = await signInWithAConference(page, 'Paper Counts MUN');

	const council = await addSeatedCommittee(
		conference,
		{ name: 'Security Council', abbreviation: 'UNSC' },
		[
			{ delegateName: 'Lena Vogel', seatName: 'France' },
			{ delegateName: 'Tom Berg', seatName: 'Germany' },
			{ delegateName: 'Ana Silva', seatName: 'Brazil' }
		]
	);

	// Two of the three have uploaded, and one of those two is then approved.
	const [lena, tom] = council.delegates;
	await addPositionPaper({
		conferenceId: conference.id,
		committeeId: council.committeeId,
		seatId: lena.seatId,
		delegate: lena.delegate
	});
	await addPositionPaper({
		conferenceId: conference.id,
		committeeId: council.committeeId,
		seatId: tom.seatId,
		delegate: tom.delegate
	});

	const main = page.getByRole('main');
	await openDocuments(page, `${documentsPath}?tab=papers&committee=${council.committeeId}`);
	await main
		.getByRole('listitem')
		.filter({ hasText: 'Tom Berg' })
		.getByRole('button', { name: 'Approve', exact: true })
		.press('Enter');
	await expect(page.getByText('Approved.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	await openDocuments(page, `${documentsPath}?tab=papers`);

	// Two uploaded out of three filled seats, in the tab's own label.
	await expect(main.getByRole('link', { name: 'Position papers 2 of 3' })).toBeVisible();

	// Missing 1, awaiting review 1, approved 1, changes requested 0: the three
	// seats. A phone shows the same table, scrolling sideways in its own box.
	const row = main.getByRole('row').filter({ hasText: 'UNSC' });
	await expect(row.getByRole('cell')).toHaveText(['UNSC', '3', '1', '1', '1', '0']);
});

test('approves a paper and sends one back, telling each delegate', async ({ page }) => {
	const { organiser, conference, documentsPath } = await signInWithAConference(
		page,
		'Paper Review MUN'
	);

	const council = await addSeatedCommittee(
		conference,
		{ name: 'Human Rights Council', abbreviation: 'HRC' },
		[
			{ delegateName: 'Lena Vogel', seatName: 'France' },
			{ delegateName: 'Tom Berg', seatName: 'Germany' }
		]
	);
	const [lena, tom] = council.delegates;
	const lenaPaper = await addPositionPaper({
		conferenceId: conference.id,
		committeeId: council.committeeId,
		seatId: lena.seatId,
		delegate: lena.delegate
	});
	const tomPaper = await addPositionPaper({
		conferenceId: conference.id,
		committeeId: council.committeeId,
		seatId: tom.seatId,
		delegate: tom.delegate
	});

	const main = page.getByRole('main');
	const committeePath = `${documentsPath}?tab=papers&committee=${council.committeeId}`;
	await openDocuments(page, committeePath);

	await main
		.getByRole('listitem')
		.filter({ hasText: 'Lena Vogel' })
		.getByRole('button', { name: 'Approve', exact: true })
		.press('Enter');
	await expect(page.getByText('Approved.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	const approved = await readPaperReview(lenaPaper);
	expect(approved.review_status).toBe('approved');
	expect(approved.review_comment).toBeNull();
	expect(approved.reviewed_by).toBe(organiser.id);
	expect(approved.reviewed_at).not.toBeNull();
	expect(await readReviewNotificationTitles(lena.delegate.id)).toEqual([
		'Your position paper for Human Rights Council was approved'
	]);

	// "Request changes" opens its form in the page, and an empty comment is refused.
	await main
		.getByRole('listitem')
		.filter({ hasText: 'Tom Berg' })
		.getByRole('link', { name: 'Request changes' })
		.click();
	const commentBox = main.getByLabel('What should change');
	await expect(commentBox).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await main.getByRole('button', { name: 'Request changes', exact: true }).press('Enter');

	await expect(main.getByText('Tell the delegate what to change.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect((await readPaperReview(tomPaper)).review_status).toBe('submitted');

	await main.getByLabel('What should change').fill('Please cite your sources.');
	await main.getByRole('button', { name: 'Request changes', exact: true }).press('Enter');

	await expect(page.getByText('Changes requested. The delegate has been notified.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	const sentBack = await readPaperReview(tomPaper);
	expect(sentBack.review_status).toBe('changes_requested');
	expect(sentBack.review_comment).toBe('Please cite your sources.');
	expect(sentBack.reviewed_by).toBe(organiser.id);
	expect(sentBack.reviewed_at).not.toBeNull();
	expect(await readReviewNotificationTitles(tom.delegate.id)).toEqual([
		'Your position paper for Human Rights Council was sent back for changes'
	]);
});

// T142: with JavaScript a paper shows as approved the moment "Approve" is
// pressed, before the server has saved it and with no spinner, and an approval
// the server refuses puts the paper back with a toast saying what did not happen.
test('approves a paper at once, and puts a refused approval back', async ({ page }, testInfo) => {
	skipWithoutJavaScript(testInfo);

	const { conference, documentsPath } = await signInWithAConference(page, 'Instant Paper MUN');
	const council = await addSeatedCommittee(
		conference,
		{ name: 'Human Rights Council', abbreviation: 'HRC' },
		[
			{ delegateName: 'Lena Vogel', seatName: 'France' },
			{ delegateName: 'Tom Berg', seatName: 'Germany' }
		]
	);
	const [lena, tom] = council.delegates;
	const papers = [];
	for (const seated of [lena, tom]) {
		const paper = await addPositionPaper({
			conferenceId: conference.id,
			committeeId: council.committeeId,
			seatId: seated.seatId,
			delegate: seated.delegate
		});
		papers.push(paper);
	}
	const [lenaPaper, tomPaper] = papers;

	const main = page.getByRole('main');
	await openDocuments(page, `${documentsPath}?tab=papers&committee=${council.committeeId}`);
	const lenaApprove = main
		.getByRole('listitem')
		.filter({ hasText: 'Lena Vogel' })
		.getByRole('button', { name: 'Approve', exact: true });
	const tomApprove = main
		.getByRole('listitem')
		.filter({ hasText: 'Tom Berg' })
		.getByRole('button', { name: 'Approve', exact: true });

	await answerSlowly(page, 'approvePaper');
	await watchForSpinners(page);
	await lenaApprove.press('Enter');

	await expect(lenaApprove).toHaveCount(0, { timeout: AT_ONCE_TIMEOUT_MS });

	await waitUntilAnswered(page);
	expect(await sawSpinner(page)).toBe(false);
	expect((await readPaperReview(lenaPaper)).review_status).toBe('approved');

	await answerWithError(page, 'approvePaper');
	await tomApprove.press('Enter');

	await expect(page.getByRole('alert')).toContainText('The paper was not approved.', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(page);
	await expect(tomApprove).toBeVisible();
	expect((await readPaperReview(tomPaper)).review_status).toBe('submitted');
});

test('approves every ticked paper at once', async ({ page }) => {
	const { conference, documentsPath } = await signInWithAConference(page, 'Bulk Approve MUN');

	const council = await addSeatedCommittee(
		conference,
		{ name: 'General Assembly', abbreviation: 'GA' },
		[
			{ delegateName: 'Lena Vogel', seatName: 'France' },
			{ delegateName: 'Tom Berg', seatName: 'Germany' }
		]
	);
	const paperIds: string[] = [];

	for (const seated of council.delegates) {
		const paperId = await addPositionPaper({
			conferenceId: conference.id,
			committeeId: council.committeeId,
			seatId: seated.seatId,
			delegate: seated.delegate
		});
		paperIds.push(paperId);
	}

	const main = page.getByRole('main');
	await openDocuments(page, `${documentsPath}?tab=papers&committee=${council.committeeId}`);

	await main.getByLabel('Select the paper of Lena Vogel').check();
	await main.getByLabel('Select the paper of Tom Berg').check();
	await main.getByRole('button', { name: 'Approve selected' }).press('Enter');

	await expect(page.getByText('2 papers approved.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	for (const paperId of paperIds) {
		expect((await readPaperReview(paperId)).review_status).toBe('approved');
	}
});

test('answers the documents of a conference somebody else runs with a 404', async ({ page }) => {
	await signInWithAConference(page, 'My Own Documents MUN');

	const stranger = await createTestUser('Someone Else');
	const theirs = await createScheduleConference({
		owner: stranger,
		namePrefix: 'Not My Documents MUN'
	});

	const response = await page.goto(`/manage/${theirs.slug}/documents?tab=papers`);

	expect(response?.status()).toBe(404);
});

/** A committee with long names and three delegates, one paper of each status. */
async function fillThePapers(conference: ScheduleConference): Promise<string> {
	const council = await addSeatedCommittee(
		conference,
		{ name: 'Special Political and Decolonization Committee', abbreviation: 'SPECPOL' },
		[
			{
				delegateName: 'Maximiliana Alexandrova-Richardson',
				seatName: 'Saint Vincent and the Grenadines'
			},
			{ delegateName: 'Tom Berg', seatName: 'Democratic Republic of the Congo' },
			{ delegateName: 'Ana Silva', seatName: 'Brazil' }
		]
	);
	const [first, second] = council.delegates;

	for (const seated of [first, second]) {
		await addPositionPaper({
			conferenceId: conference.id,
			committeeId: council.committeeId,
			seatId: seated.seatId,
			delegate: seated.delegate
		});
	}

	return council.committeeId;
}

test('does not spill off the side of a phone screen', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	const { conference, documentsPath } = await signInWithAConference(
		page,
		'Phone Documents International Model United Nations Conference'
	);
	const committeeId = await fillThePapers(conference);

	await openDocuments(page, `${documentsPath}?tab=papers&committee=${committeeId}`);
	await expectNoSidewaysOverflow(page);

	await openDocuments(page, `${documentsPath}?tab=guides`);
	await expectNoSidewaysOverflow(page);

	await openDocuments(page, documentsPath);
	await expectNoSidewaysOverflow(page);
});

test('fits in a few screens', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough to measure a height.');

	const { conference, documentsPath } = await signInWithAConference(page, 'Height Documents MUN');
	const committeeId = await fillThePapers(conference);

	await openDocuments(page, `${documentsPath}?tab=papers&committee=${committeeId}`);

	// Saved before the assertion, so that a failure leaves a picture of the page.
	await saveFullPageScreenshot(page, 'manage-documents');
	await expectPageFitsInScreens(page, MANAGE_DOCUMENTS_SCREENS);
});
