import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import {
	addWorkingPaper,
	makePaperCommittee,
	readStoredPaper,
	type PaperCommitteeRoom
} from './committee-paper-fixtures';
import { skipWithoutJavaScript } from './in-place';
import { expectNoSidewaysOverflow, saveFullPageScreenshot } from './page-shape';
import { editorText, placeCursor, selectWords, waitForEditor } from './paper-editor';
import { signIn } from './signed-in-user';

// Step 3 of docs/committee-papers.md as two authors meet it in a browser:
//
// * one comments on words in the paper, the other sees the thread arrive,
//   replies, and the first resolves it;
// * one suggests a change, which the other sees beside the text, counted in
//   the title row, and accepts;
// * without JavaScript an author comments on the whole paper.
//
// Every test makes a conference of its own (`committee-paper-fixtures.ts`).

/** How long an assertion that waits on another browser or the database may take. */
const DATABASE_TIMEOUT_MS = 15_000;

const TITLE = 'Meaningful human control';
const OPENING = 'Recalling the Convention on Certain Conventional Weapons,';

function paperPath(room: PaperCommitteeRoom, paperId: string): string {
	return `${room.papersPath}/${paperId}`;
}

function paperBox(page: Page): Locator {
	return page.getByRole('main').getByRole('textbox', { name: TITLE });
}

/** The margin, named for what it holds: "Comments", or "Suggestions" once there are any. */
function margin(page: Page, name: 'Comments' | 'Suggestions'): Locator {
	return page.getByRole('main').getByRole('complementary', { name, exact: true });
}

/**
 * "Comment", in the toolbar on a desktop and in the bar at the foot of a
 * phone's screen; only one of them shows at a time.
 */
function commentButton(page: Page): Locator {
	return page.getByRole('button', { name: 'Comment', exact: true }).filter({ visible: true });
}

/** A paper France and Mexico write, with Clara for France and Daniel for Mexico both on it. */
async function openPaperForBoth(page: Page, browser: Browser) {
	const room = await makePaperCommittee('Paper Margin');
	const paperId = await addWorkingPaper(room.committeeId, {
		title: TITLE,
		body: OPENING,
		authorSeatIds: [room.franceSeatId, room.mexicoSeatId]
	});

	await signIn(page, room.clara);
	await page.goto(paperPath(room, paperId));
	const danielContext = await browser.newContext({
		viewport: page.viewportSize() ?? undefined
	});
	const danielPage = await danielContext.newPage();
	await signIn(danielPage, room.daniel);
	await danielPage.goto(paperPath(room, paperId));
	await Promise.all([waitForEditor(page), waitForEditor(danielPage)]);

	return { room, paperId, danielPage, danielContext };
}

test.describe("a paper's comments and suggestions", () => {
	test('an author comments on words, another replies, and the first resolves the thread', async ({
		page,
		browser
	}, testInfo) => {
		skipWithoutJavaScript(testInfo);
		const { danielPage, danielContext } = await openPaperForBoth(page, browser);

		await selectWords(paperBox(page), 'Certain Conventional Weapons');
		await commentButton(page).click();
		const newComment = page.getByRole('textbox', { name: 'New comment' });
		await expect(newComment).toBeFocused();
		await newComment.fill('Should we name the protocol too?');
		await page.locator('#new-thread').getByRole('button', { name: 'Comment' }).click();

		const clarasThread = margin(page, 'Comments').getByRole('article', { name: 'Comment thread' });
		await expect(clarasThread).toContainText('Should we name the protocol too?', {
			timeout: DATABASE_TIMEOUT_MS
		});

		// Daniel's page hears of the thread without a reload, and he replies on it.
		const danielsThread = margin(danielPage, 'Comments').getByRole('article', {
			name: 'Comment thread'
		});
		await expect(danielsThread).toContainText('Should we name the protocol too?', {
			timeout: DATABASE_TIMEOUT_MS
		});
		if (testInfo.project.name === 'phone') {
			// Under the paper on a phone, the card says which words it is about.
			await expect(danielsThread).toContainText('On ‘Certain Conventional Weapons’');
		}
		await danielsThread.click();
		await danielsThread
			.getByRole('textbox', { name: 'Reply to Clara Whitfield' })
			.fill('Yes, Protocol II.');
		await danielsThread.getByRole('button', { name: 'Reply' }).click();

		await expect(clarasThread).toContainText('Yes, Protocol II.', { timeout: DATABASE_TIMEOUT_MS });
		if (testInfo.project.name === 'phone') {
			await expectNoSidewaysOverflow(page);
		}
		await saveFullPageScreenshot(page, 'committee-paper-comments');

		await clarasThread.getByRole('button', { name: 'Resolve' }).click();
		await expect(clarasThread).toContainText('Resolved by Clara Whitfield', {
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(danielsThread).toContainText('Resolved by Clara Whitfield', {
			timeout: DATABASE_TIMEOUT_MS
		});
		await danielContext.close();
	});

	test('an author suggests words, and another sees them counted and accepts them', async ({
		page,
		browser
	}, testInfo) => {
		skipWithoutJavaScript(testInfo);
		const { paperId, danielPage, danielContext } = await openPaperForBoth(page, browser);

		// The mode sits in the toolbar on a desktop and in the title row on a phone.
		await danielPage
			.getByRole('button', { name: 'Mode: Editing' })
			.filter({ visible: true })
			.click();
		await danielPage.getByRole('menuitemradio', { name: 'Suggesting' }).click();
		await expect(
			danielPage.getByRole('button', { name: 'Mode: Suggesting' }).filter({ visible: true })
		).toBeVisible();
		await placeCursor(paperBox(danielPage), 'end');
		await danielPage.keyboard.type(' and its protocols');

		const suggestion = margin(page, 'Suggestions').getByRole('article', {
			name: 'Suggestion by Daniel Osei'
		});
		await expect(suggestion).toContainText('Add', { timeout: DATABASE_TIMEOUT_MS });
		await expect(suggestion).toContainText('and its protocols');
		if (testInfo.project.name !== 'phone') {
			await expect(page.locator('#open-suggestions')).toHaveText('1 suggestion to decide');
		}
		// Daniel's own suggestion is his to withdraw, not to accept.
		const danielsSuggestion = margin(danielPage, 'Suggestions').getByRole('article', {
			name: 'Suggestion by Daniel Osei'
		});
		await expect(danielsSuggestion.getByRole('button', { name: 'Withdraw' })).toBeVisible();
		await expect(danielsSuggestion.getByRole('button', { name: 'Accept' })).toHaveCount(0);
		await saveFullPageScreenshot(page, 'committee-paper-suggestion');

		await suggestion.getByRole('button', { name: 'Accept' }).click();
		await expect(suggestion).toHaveCount(0);
		const accepted = `${OPENING} and its protocols`;
		await expect.poll(() => editorText(paperBox(page))).toBe(accepted);
		await expect
			.poll(() => editorText(paperBox(danielPage)), { timeout: DATABASE_TIMEOUT_MS })
			.toBe(accepted);
		await expect
			.poll(async () => (await readStoredPaper(paperId)).body_markdown, {
				timeout: DATABASE_TIMEOUT_MS
			})
			.toBe(accepted);
		await danielContext.close();
	});

	test('without JavaScript an author comments on the whole paper', async ({ page }, testInfo) => {
		test.skip(testInfo.project.use.javaScriptEnabled !== false, 'This is the form without script.');
		const room = await makePaperCommittee('Plain Comment');
		const paperId = await addWorkingPaper(room.committeeId, {
			title: TITLE,
			body: OPENING,
			authorSeatIds: [room.franceSeatId, room.mexicoSeatId]
		});

		await signIn(page, room.daniel);
		await page.goto(paperPath(room, paperId));
		await page
			.getByRole('textbox', { name: 'Comment on the whole paper' })
			.fill('France, can we meet after the session?');
		await page.locator('#new-thread').getByRole('button', { name: 'Comment' }).click();

		const thread = margin(page, 'Comments').getByRole('article', { name: 'Comment thread' });
		await expect(thread).toContainText('France, can we meet after the session?', {
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(thread).toContainText('On the whole paper');
		await expect(thread.getByRole('textbox', { name: 'Reply to Daniel Osei' })).toBeVisible();
	});
});
