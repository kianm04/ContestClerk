import { expect, test, type Locator, type Page } from '@playwright/test';
import {
	addWorkingPaper,
	makePaperCommittee,
	PAPER_TOPICS,
	readStoredPaper,
	type PaperCommitteeRoom
} from './committee-paper-fixtures';
import { markPage, readMarker, skipWithoutJavaScript } from './in-place';
import { expectNoSidewaysOverflow, saveFullPageScreenshot } from './page-shape';
import { editorText, placeCursor, waitForEditor } from './paper-editor';
import { pickOption } from './shadcn-controls';
import { signIn } from './signed-in-user';

// Step 2 of docs/committee-papers.md as a delegate meets it in a browser:
//
// * a delegate starts a working paper from the committee's papers and, while
//   nobody else writes it, deletes it again;
// * two delegations write one paper at once, see each other there and both
//   keep their words;
// * an author adds a delegation, which is told so and writes the paper from
//   then on, while the page behind the dialog keeps what was being typed;
// * the lead hands the lead on and leaves the paper to the others;
// * without JavaScript an author saves the text with the plain box;
// * nobody else reads a paper while it is written, and once the committee
//   has introduced it a working paper is read without the editor;
// * the committee page and the live room both lead to the papers.
//
// Every test makes a conference of its own (`committee-paper-fixtures.ts`),
// so the three projects never write into one another's papers.

/** How long an assertion that waits on a page reading the database may take. */
const DATABASE_TIMEOUT_MS = 15_000;

/** The working paper the tests write. */
const TITLE = 'Meaningful human control';

/** Its text when a test begins: the opening of a preambular clause. */
const OPENING = 'Recalling the Convention on Certain Conventional Weapons,';

/** The address of one paper. */
function paperPath(room: PaperCommitteeRoom, paperId: string): string {
	return `${room.papersPath}/${paperId}`;
}

/**
 * The paper's text, named by the title above it: the live editor, or the
 * plain box until the page's script runs and without JavaScript.
 */
function paperBox(page: Page): Locator {
	return page.getByRole('main').getByRole('textbox', { name: TITLE });
}

/** The column beside the text with the seats that write the paper. */
function paperPeople(page: Page): Locator {
	return page.getByRole('main').getByRole('complementary', { name: "The paper's people" });
}

/** One seat's row among the paper's people, found by the seat's name. */
function personRow(page: Page, seatName: string): Locator {
	return paperPeople(page).getByRole('listitem').filter({ hasText: seatName });
}

/**
 * A dialog found by its title. Without JavaScript the server draws the dialog
 * in place but gives it no name, so the title is looked for inside it. Its
 * buttons are pressed with Enter, as `manage-roles.spec.ts` presses them: a
 * click waits for the dialog to stop moving as it opens, which on a busy
 * machine can outlast the test.
 */
function dialogTitled(page: Page, title: string): Locator {
	return page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: title }) });
}

/** One section of the committee's papers, such as "Yours". */
function papersSection(page: Page, heading: string): Locator {
	return page.getByRole('main').getByRole('region', { name: heading });
}

/** Whether this project runs the page's script. */
function hasJavaScript(project: { use: { javaScriptEnabled?: boolean } }): boolean {
	return project.use.javaScriptEnabled !== false;
}

test.describe("a committee's working papers", () => {
	test('a delegate starts a working paper, and deletes it while nobody else writes it', async ({
		page
	}, testInfo) => {
		const room = await makePaperCommittee('Start Paper');
		await signIn(page, room.clara);
		await page.goto(room.papersPath);

		const main = page.getByRole('main');
		await expect(main.getByRole('heading', { name: 'Resolutions', level: 1 })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(papersSection(page, 'Yours')).toContainText('You are not on a paper yet.');
		await main.getByRole('link', { name: 'Start a paper' }).click();

		await expect(main.getByRole('heading', { name: 'Start a paper', level: 1 })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await main.getByLabel('Title').fill(TITLE);
		await pickOption(page, testInfo, main.getByLabel('Topic'), PAPER_TOPICS[1]);
		await main.getByRole('button', { name: 'Start writing' }).click();

		// The paper opens in its writer, with France its only author and its lead.
		await expect(main.getByRole('heading', { name: TITLE, level: 1 })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(main.getByText(`Working paper · ${PAPER_TOPICS[1]}`)).toBeVisible();
		await expect(personRow(page, 'France')).toContainText('Clara Whitfield (you) · Lead');

		// Nobody else could carry the paper on, so "Delete paper" takes the place of "Leave".
		await expect(paperPeople(page).getByRole('link', { name: 'Leave' })).toHaveCount(0);
		await paperPeople(page).getByRole('link', { name: 'Delete paper' }).click();
		const dialog = dialogTitled(page, `Delete “${TITLE}”?`);
		await expect(dialog).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await dialog.getByRole('button', { name: 'Delete paper' }).press('Enter');

		await expect(page.getByText('Working paper deleted.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(page).toHaveURL(room.papersPath);
		await expect(papersSection(page, 'Yours')).toContainText('You are not on a paper yet.');
	});

	test('two delegations write the paper at once, and both keep their words', async ({
		page,
		browser
	}, testInfo) => {
		skipWithoutJavaScript(testInfo);
		const room = await makePaperCommittee('Live Paper');
		const paperId = await addWorkingPaper(room.committeeId, {
			title: TITLE,
			body: OPENING,
			authorSeatIds: [room.franceSeatId, room.mexicoSeatId]
		});

		// Clara for France and Daniel for Mexico, each in a browser of their own.
		await signIn(page, room.clara);
		await page.goto(paperPath(room, paperId));
		const danielContext = await browser.newContext();
		const danielPage = await danielContext.newPage();
		await signIn(danielPage, room.daniel);
		await danielPage.goto(paperPath(room, paperId));
		await Promise.all([waitForEditor(page), waitForEditor(danielPage)]);

		// Each sees the other there, with the seat they write for, before either types.
		await expect(page.getByRole('list', { name: 'Writing now' })).toContainText(
			'Daniel Osei, Mexico',
			{ timeout: DATABASE_TIMEOUT_MS }
		);
		await expect(danielPage.getByRole('list', { name: 'Writing now' })).toContainText(
			'Clara Whitfield, France'
		);

		// Both type into the one paragraph at the same moment: Daniel at its start, Clara at its end.
		const clarasBox = paperBox(page);
		const danielsBox = paperBox(danielPage);
		await placeCursor(clarasBox, 'end');
		await placeCursor(danielsBox, 'start');
		await Promise.all([
			page.keyboard.type(' France agrees.'),
			danielPage.keyboard.type('Mexico: ')
		]);

		const both = `Mexico: ${OPENING} France agrees.`;
		await expect.poll(() => editorText(clarasBox), { timeout: DATABASE_TIMEOUT_MS }).toBe(both);
		await expect.poll(() => editorText(danielsBox), { timeout: DATABASE_TIMEOUT_MS }).toBe(both);
		// Daniel's cursor is drawn in Clara's editor with his first name on it.
		await expect(clarasBox.getByText('Daniel', { exact: true })).toBeVisible();

		if (testInfo.project.name === 'phone') {
			await expectNoSidewaysOverflow(page);
		}
		await saveFullPageScreenshot(page, 'committee-paper-writer');

		// The stored Markdown is the text both of them now see.
		await expect
			.poll(async () => (await readStoredPaper(paperId)).body_markdown, {
				timeout: DATABASE_TIMEOUT_MS
			})
			.toBe(both);
		await expect(page.getByText(`Working paper · ${PAPER_TOPICS[0]} · Saved`)).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await danielContext.close();

		// A reload keeps both.
		await page.reload();
		await waitForEditor(page);
		await expect.poll(() => editorText(clarasBox), { timeout: DATABASE_TIMEOUT_MS }).toBe(both);
	});

	test('an author adds a delegation, which is told and writes the paper from then on', async ({
		page,
		browser
	}, testInfo) => {
		const room = await makePaperCommittee('Add Author');
		const paperId = await addWorkingPaper(room.committeeId, {
			title: TITLE,
			body: OPENING,
			authorSeatIds: [room.franceSeatId]
		});

		await signIn(page, room.clara);
		await page.goto(paperPath(room, paperId));
		await expect(personRow(page, 'France')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

		/*
			The dialog opens and answers in place, so the live editor behind it
			stays connected: words typed just before, and a marker that only a
			reload of the page would wipe, are both still there afterwards.
		*/
		if (hasJavaScript(testInfo.project)) {
			await waitForEditor(page);
			await placeCursor(paperBox(page), 'end');
			await page.keyboard.type(' Mexico joins.');
			await markPage(page);
		}

		await paperPeople(page).getByRole('link', { name: 'Add an author' }).click();
		const dialog = dialogTitled(page, 'Add an author');
		// Ghana's delegate holds a seat too; France is on the paper already, so it is not offered.
		await expect(dialog.getByLabel('Seat')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await pickOption(page, testInfo, dialog.getByLabel('Seat'), 'Mexico');
		await dialog.getByRole('button', { name: 'Add an author' }).press('Enter');

		await expect(page.getByText('Mexico is now an author.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(dialog).toHaveCount(0);
		await expect(personRow(page, 'Mexico')).toContainText('Daniel Osei');

		if (hasJavaScript(testInfo.project)) {
			expect(await readMarker(page)).toBe('still here');
			expect(await editorText(paperBox(page))).toBe(`${OPENING} Mexico joins.`);
		}

		// Mexico's delegate is told, and the notification opens the paper ready to write.
		const danielContext = await browser.newContext();
		const danielPage = await danielContext.newPage();
		await signIn(danielPage, room.daniel);
		await danielPage.goto('/notifications');
		await danielPage
			.getByRole('main')
			.getByText(`You were added to the working paper “${TITLE}”`)
			.click();

		await expect(danielPage).toHaveURL(paperPath(room, paperId), {
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(personRow(danielPage, 'Mexico')).toContainText('Daniel Osei (you)');
		await expect(paperPeople(danielPage).getByRole('link', { name: 'Leave' })).toBeVisible();
		await expect(paperBox(danielPage)).toBeVisible();

		// Clara's page opened before Mexico was an author, and still names Daniel once he writes.
		if (hasJavaScript(testInfo.project)) {
			await waitForEditor(danielPage);
			await expect(page.getByRole('list', { name: 'Writing now' })).toContainText(
				'Daniel Osei, Mexico',
				{ timeout: DATABASE_TIMEOUT_MS }
			);
		}
		await danielContext.close();
	});

	test('the lead hands the lead to Mexico, then leaves the paper to it', async ({ page }) => {
		const room = await makePaperCommittee('Hand Lead');
		const paperId = await addWorkingPaper(room.committeeId, {
			title: TITLE,
			body: OPENING,
			authorSeatIds: [room.franceSeatId, room.mexicoSeatId]
		});

		await signIn(page, room.clara);
		await page.goto(paperPath(room, paperId));
		await expect(personRow(page, 'Mexico')).toContainText('Daniel Osei', {
			timeout: DATABASE_TIMEOUT_MS
		});

		// The button says "Make lead"; a screen reader hears the seat it hands the lead to after that.
		await personRow(page, 'Mexico').getByRole('button', { name: 'Make lead' }).click();

		await expect(page.getByText('Mexico is now the lead.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(personRow(page, 'Mexico')).toContainText('Daniel Osei · Lead');
		await expect(personRow(page, 'France')).toContainText('Clara Whitfield (you)');
		// Only the lead hands the lead on, and France no longer leads.
		await expect(paperPeople(page).getByRole('button', { name: /^Make lead/ })).toHaveCount(0);
		expect((await readStoredPaper(paperId)).lead_seat_id).toBe(room.mexicoSeatId);

		await paperPeople(page).getByRole('link', { name: 'Leave' }).click();
		const dialog = dialogTitled(page, `Leave “${TITLE}”?`);
		await expect(dialog).toContainText('Your seat stops writing this paper', {
			timeout: DATABASE_TIMEOUT_MS
		});
		await dialog.getByRole('button', { name: 'Leave paper' }).press('Enter');

		await expect(page.getByText(`You left “${TITLE}”.`)).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(page).toHaveURL(room.papersPath);
		await expect(papersSection(page, 'Yours')).toContainText('You are not on a paper yet.');

		// While it is being written, the paper is now only Mexico's to open.
		const response = await page.goto(paperPath(room, paperId));
		expect(response?.status()).toBe(404);
	});

	test('without JavaScript an author saves the text with the plain box', async ({
		page
	}, testInfo) => {
		test.skip(hasJavaScript(testInfo.project), 'This is the form without script.');
		const room = await makePaperCommittee('Plain Paper');
		const paperId = await addWorkingPaper(room.committeeId, {
			title: TITLE,
			body: OPENING,
			authorSeatIds: [room.franceSeatId, room.mexicoSeatId]
		});

		await signIn(page, room.daniel);
		await page.goto(paperPath(room, paperId));
		const box = paperBox(page);
		await expect(box).toHaveValue(OPENING, { timeout: DATABASE_TIMEOUT_MS });
		await box.fill(`${OPENING}\n\nMexico asks for a ban.`);
		await page.getByRole('button', { name: 'Save changes' }).click();

		await expect(page.getByText('Changes saved.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await expect(paperBox(page)).toHaveValue(`${OPENING}\n\nMexico asks for a ban.`);
		// The browser sends the box's line breaks as \r\n; the paper keeps them as \n.
		const stored = await readStoredPaper(paperId);
		expect(stored.body_markdown).toBe(`${OPENING}\n\nMexico asks for a ban.`);
		expect(stored.updated_by).toBe(room.daniel.id);
	});

	test('while the paper is written, a delegate not on it and the chair are told it does not exist', async ({
		page,
		browser
	}) => {
		const room = await makePaperCommittee('Private Paper');
		const paperId = await addWorkingPaper(room.committeeId, {
			title: TITLE,
			body: OPENING,
			authorSeatIds: [room.franceSeatId]
		});

		await signIn(page, room.amara);
		const delegateResponse = await page.goto(paperPath(room, paperId));
		expect(delegateResponse?.status()).toBe(404);

		await page.goto(room.papersPath);
		await expect(papersSection(page, 'Yours')).toContainText('You are not on a paper yet.', {
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(page.getByRole('main').getByRole('link', { name: TITLE })).toHaveCount(0);

		// The chair reads the committee's papers but holds no seat, so has none of their own to start.
		const chairContext = await browser.newContext();
		const chairPage = await chairContext.newPage();
		await signIn(chairPage, room.chair);
		const chairResponse = await chairPage.goto(paperPath(room, paperId));
		expect(chairResponse?.status()).toBe(404);

		await chairPage.goto(room.papersPath);
		await expect(papersSection(chairPage, 'Introduced')).toContainText(
			'No paper has been introduced.',
			{ timeout: DATABASE_TIMEOUT_MS }
		);
		await expect(papersSection(chairPage, 'Yours')).toHaveCount(0);
		await expect(chairPage.getByRole('link', { name: 'Start a paper' })).toHaveCount(0);
		await chairContext.close();
	});

	test('a delegate reads a working paper once it is introduced, without the editor', async ({
		page
	}) => {
		const room = await makePaperCommittee('Read Paper');
		await addWorkingPaper(room.committeeId, {
			title: TITLE,
			body: OPENING,
			authorSeatIds: [room.franceSeatId],
			isIntroduced: true
		});

		await signIn(page, room.amara);
		await page.goto(room.papersPath);
		await papersSection(page, 'Introduced').getByRole('link', { name: TITLE }).click();

		const main = page.getByRole('main');
		await expect(main.getByRole('heading', { name: TITLE, level: 1 })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(main.getByText(`Working paper 1.1 · ${PAPER_TOPICS[0]}`)).toBeVisible();
		await expect(main.getByRole('article', { name: "The working paper's text" })).toContainText(
			OPENING
		);
		await expect(main.getByRole('textbox')).toHaveCount(0);
		await expect(page.getByRole('toolbar', { name: 'Formatting' })).toHaveCount(0);
		// Who writes it, with nothing to change about that.
		await expect(personRow(page, 'France')).toContainText('Clara Whitfield · Lead');
		await expect(paperPeople(page).getByRole('link')).toHaveCount(0);
		await expect(paperPeople(page).getByRole('button')).toHaveCount(0);
	});

	test('the committee page and the live room both lead to the papers', async ({
		page
	}, testInfo) => {
		const room = await makePaperCommittee('Paper Links');
		await addWorkingPaper(room.committeeId, {
			title: TITLE,
			body: OPENING,
			authorSeatIds: [room.franceSeatId, room.mexicoSeatId]
		});

		await signIn(page, room.clara);
		await page.goto(room.committeePath);
		await page.getByRole('main').getByRole('link', { name: 'Resolutions', exact: true }).click();

		await expect(page).toHaveURL(room.papersPath, { timeout: DATABASE_TIMEOUT_MS });
		const yours = papersSection(page, 'Yours');
		await expect(yours.getByRole('link', { name: TITLE })).toBeVisible();
		await expect(yours).toContainText('Being written');

		if (testInfo.project.name === 'phone') {
			await expectNoSidewaysOverflow(page);
		}
		await saveFullPageScreenshot(page, 'committee-papers');

		await page.goto(`${room.committeePath}/live`);
		await page.getByRole('main').getByRole('link', { name: 'Resolutions', exact: true }).click();
		await expect(page).toHaveURL(room.papersPath, { timeout: DATABASE_TIMEOUT_MS });
	});
});
