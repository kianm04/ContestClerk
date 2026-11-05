import { expect, test, type Locator, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { createTestUser, signIn, type TestUser } from './signed-in-user';
import { addScheduleCommittee, createScheduleConference } from './schedule-fixtures';
import { addWrittenPaper, seatDelegateAs } from './document-fixtures';
import { skipWithoutJavaScript } from './in-place';
import { expectNoSidewaysOverflow, saveFullPageScreenshot } from './page-shape';
import { editorText, placeCursor, typeIntoEditor, waitForEditor } from './paper-editor';

// The acceptance criteria of T147 that need a real browser
// (`specs/05-pages/delegation/papers.md`):
//
// * one member writes their paper, and another opens it from the
//   delegation's "Position papers" view, edits the same draft, and the
//   writer then sees that edit and who made it;
// * the "Position papers" view lists every member's paper with its
//   committee, country, status, word count and last editor;
// * two members typing in the same paragraph at once both keep their words,
//   see each other's cursor and name, and the stored Markdown is what both
//   see (T148, which replaced T147's "Keep mine" and "Use theirs" on a shared
//   paper; a delegate writing alone still meets that choice, in
//   `position-paper.spec.ts`);
// * without JavaScript a fellow member saves the draft with the plain box;
// * a fellow member suggests a change, which the delegate sees beside their
//   paper and accepts (docs/committee-papers.md, decision 15).
//
// Every test makes its own conference, committee and delegation. The rows
// are written with the service-role client, the way
// `delegation-members.spec.ts` seeds its delegations: joining a delegation
// and being seated have tests of their own.

/** How long an assertion that waits on a page reading the database may take. */
const DATABASE_TIMEOUT_MS = 15_000;

/** A delegation of three at one conference: Aisha heads it, Rachel and Tom are members. */
type SharedDelegation = {
	id: string;
	name: string;
	papersPath: string;
	aisha: TestUser;
	rachel: TestUser;
	tom: TestUser;
	/** Rachel's seat, France, and the address of her own position paper page. */
	rachelSeatId: string;
	rachelPaperPath: string;
	/** Tom's seat, Brazil. */
	tomSeatId: string;
	conferenceId: string;
	committeeId: string;
};

/** Put `user` in the delegation, as joining it would. */
async function addMember(delegationId: string, user: TestUser, role: 'head' | 'member') {
	const { error } = await createServiceRoleClient()
		.from('delegation_members')
		.insert({ delegation_id: delegationId, user_id: user.id, role });

	if (error) throw new Error(`Could not add the test member: ${error.message}`);
}

/** Make the conference, its committee and the delegation, and seat Rachel and Tom. */
async function makeSharedDelegation(namePrefix: string): Promise<SharedDelegation> {
	const owner = await createTestUser(`${namePrefix} Owner`);
	const conference = await createScheduleConference({ owner, namePrefix });
	const committeeId = await addScheduleCommittee(conference.id, {
		name: 'General Assembly',
		abbreviation: 'GA'
	});
	const admin = createServiceRoleClient();
	const { data: committee } = await admin
		.from('committees')
		.select('slug')
		.eq('id', committeeId)
		.single();

	const name = `${namePrefix} Academy ${crypto.randomUUID().slice(0, 8)}`;
	const { data: delegation, error } = await admin
		.from('delegations')
		.insert({
			conference_id: conference.id,
			name,
			institution_name: `${namePrefix} Academy`,
			status: 'accepted',
			requested_seats: 3,
			join_code: crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase(),
			submitted_at: new Date().toISOString(),
			decided_at: new Date().toISOString()
		})
		.select('id')
		.single();

	if (error || !delegation || !committee) {
		throw new Error(`Could not write the test delegation: ${error?.message}`);
	}

	const [aisha, rachel, tom] = await Promise.all([
		createTestUser(`${namePrefix} Aisha Bello`),
		createTestUser(`${namePrefix} Rachel Morgan`),
		createTestUser(`${namePrefix} Tom Price`)
	]);
	await addMember(delegation.id, aisha, 'head');
	await addMember(delegation.id, rachel, 'member');
	await addMember(delegation.id, tom, 'member');

	const rachelSeatId = await seatDelegateAs(rachel, committeeId, 'France');
	const tomSeatId = await seatDelegateAs(tom, committeeId, 'Brazil');
	// `seatDelegateAs` writes a seat without a country, and the list draws a flag for one.
	await admin.from('seats').update({ country_code: 'FR' }).eq('id', rachelSeatId);
	await admin.from('seats').update({ country_code: 'BR' }).eq('id', tomSeatId);

	return {
		id: delegation.id,
		name,
		papersPath: `/delegations/${delegation.id}/papers`,
		aisha,
		rachel,
		tom,
		rachelSeatId,
		rachelPaperPath: `/conferences/${conference.slug}/committees/${committee.slug}/position-paper`,
		tomSeatId,
		conferenceId: conference.id,
		committeeId
	};
}

/** The draft of a seat and who saved it last, straight from the database. */
async function readDraft(seatId: string) {
	const { data } = await createServiceRoleClient()
		.from('position_paper_drafts')
		.select('body_markdown, updated_by')
		.eq('seat_id', seatId)
		.maybeSingle();

	return data;
}

/** Write a draft as `author` saved it, the way a save from their own browser would. */
async function writeDraftAs(seatId: string, author: TestUser, body: string): Promise<void> {
	const admin = createServiceRoleClient();
	const existing = await readDraft(seatId);
	const { error } = existing
		? await admin
				.from('position_paper_drafts')
				.update({
					body_markdown: body,
					updated_by: author.id,
					updated_at: new Date().toISOString()
				})
				.eq('seat_id', seatId)
		: await admin
				.from('position_paper_drafts')
				.insert({ seat_id: seatId, body_markdown: body, updated_by: author.id });

	if (error) throw new Error(`Could not write the test draft: ${error.message}`);
}

/** The writing box, named by the heading above it: "Your paper" or "Rachel …'s paper". */
function paperBox(page: Page, heading: string | RegExp): Locator {
	return page.getByRole('main').getByRole('textbox', { name: heading });
}

test.describe("a delegation's position papers", () => {
	test('one member writes, another opens the paper from the list and edits it', async ({
		page,
		browser
	}, testInfo) => {
		skipWithoutJavaScript(testInfo);
		const shared = await makeSharedDelegation('Shared Paper');

		// Rachel writes her own paper, which says who it is shared with.
		await signIn(page, shared.rachel);
		await page.goto(shared.rachelPaperPath);
		await waitForEditor(page);
		await expect(page.getByText(`Shared with ${shared.name}:`)).toContainText(shared.tom.fullName);
		await typeIntoEditor(paperBox(page, 'Your paper'), 'France supports the treaty');
		await expect(page.getByText(/^Saved/)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

		// Tom opens it from the delegation's list, in a browser of his own.
		const tomContext = await browser.newContext();
		const tomPage = await tomContext.newPage();
		await signIn(tomPage, shared.tom);
		await tomPage.goto(shared.papersPath);
		const rachelsRow = tomPage.getByRole('listitem').filter({ hasText: shared.rachel.fullName });
		await expect(rachelsRow).toContainText('Draft', { timeout: DATABASE_TIMEOUT_MS });
		await expect(rachelsRow).toContainText('4 words');
		await expect(rachelsRow).toContainText(`Last edited by ${shared.rachel.fullName}`);
		await rachelsRow.getByRole('link', { name: /^Open/ }).click();

		const tomsBox = paperBox(tomPage, `${shared.rachel.fullName}'s paper`);
		await waitForEditor(tomPage);
		await expect(tomsBox).toContainText('France supports the treaty');
		await expect(tomPage.getByText(/^Only .* can submit this paper\.$/)).toBeVisible();
		await expect(tomPage.getByRole('button', { name: 'Submit for review' })).toHaveCount(0);

		await typeIntoEditor(tomsBox, 'France supports the treaty, says Tom');
		await expect(tomPage.getByText(/^Saved/)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await expect
			.poll(async () => (await readDraft(shared.rachelSeatId))?.updated_by, {
				timeout: DATABASE_TIMEOUT_MS
			})
			.toBe(shared.tom.id);
		expect((await readDraft(shared.rachelSeatId))?.body_markdown).toBe(
			'France supports the treaty, says Tom'
		);
		await tomContext.close();

		// Rachel sees Tom's edit, and that he made it.
		await page.reload();
		await waitForEditor(page);
		await expect(paperBox(page, 'Your paper')).toContainText('says Tom');
		await expect(page.getByText(`Last edited by ${shared.tom.fullName}`)).toBeVisible();
	});

	test('lists every member’s paper with its status, words and last editor', async ({
		page
	}, testInfo) => {
		const shared = await makeSharedDelegation('Papers View');
		await writeDraftAs(shared.rachelSeatId, shared.tom, 'France supports the treaty');
		await addWrittenPaper(
			{
				conferenceId: shared.conferenceId,
				committeeId: shared.committeeId,
				seatId: shared.tomSeatId,
				delegate: shared.tom
			},
			'Brazil asks for more time.'
		);

		await signIn(page, shared.aisha);
		await page.goto(shared.papersPath);

		const main = page.getByRole('main');
		await expect(main.getByRole('heading', { name: 'Position papers' })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		// Each row is found by its country, because Tom's name is in Rachel's row too.
		const rachelsRow = main.getByRole('listitem').filter({ hasText: 'France' });
		await expect(rachelsRow).toContainText(shared.rachel.fullName);
		await expect(rachelsRow).toContainText('General Assembly');
		// A screen reader skips the flag beside the country's name, so it is found
		// by its alt text rather than by its role.
		await expect(rachelsRow.locator('img[alt="France"]')).toBeVisible();
		await expect(rachelsRow).toContainText('Draft');
		await expect(rachelsRow).toContainText('4 words');
		await expect(rachelsRow).toContainText(`Last edited by ${shared.tom.fullName}`);

		const tomsRow = main.getByRole('listitem').filter({ hasText: 'Brazil' });
		await expect(tomsRow).toContainText(shared.tom.fullName);
		await expect(tomsRow).toContainText('Awaiting review');
		await expect(tomsRow).toContainText('5 words');

		// Aisha has no seat, so she has no row; the tab strip marks Papers.
		await expect(main.getByRole('listitem').filter({ hasText: shared.aisha.fullName })).toHaveCount(
			0
		);
		const sections = main.getByRole('navigation', { name: 'Sections' });
		await expect(sections.getByRole('link', { name: /^Papers/ })).toHaveAttribute(
			'aria-current',
			'page'
		);

		if (testInfo.project.name === 'phone') {
			await expectNoSidewaysOverflow(page);
			await saveFullPageScreenshot(page, 'delegation-papers-phone');
		}

		if (testInfo.project.name === 'desktop') {
			await saveFullPageScreenshot(page, 'delegation-papers-desktop');
		}
	});

	test('two members type in the same paragraph at once, and both keep their words', async ({
		page,
		browser
	}, testInfo) => {
		skipWithoutJavaScript(testInfo);
		const shared = await makeSharedDelegation('Live Paper');
		await writeDraftAs(shared.rachelSeatId, shared.rachel, 'France supports the treaty.');

		// Rachel on her own page, Tom on the delegation's, each in a browser of their own.
		await signIn(page, shared.rachel);
		await page.goto(shared.rachelPaperPath);
		const tomContext = await browser.newContext();
		const tomPage = await tomContext.newPage();
		await signIn(tomPage, shared.tom);
		await tomPage.goto(`${shared.papersPath}/${shared.rachelSeatId}`);
		await Promise.all([waitForEditor(page), waitForEditor(tomPage)]);

		// Each sees the other there, named, before either types.
		const tomFirstName = shared.tom.fullName.split(' ')[0];
		await expect(page.getByRole('list', { name: 'Writing now' })).toContainText(
			shared.tom.fullName,
			{ timeout: DATABASE_TIMEOUT_MS }
		);
		await expect(tomPage.getByRole('list', { name: 'Writing now' })).toContainText(
			shared.rachel.fullName
		);

		// Both type into the one paragraph at the same moment: Tom at its start, Rachel at its end.
		const rachelsBox = paperBox(page, 'Your paper');
		const tomsBox = paperBox(tomPage, `${shared.rachel.fullName}'s paper`);
		await placeCursor(rachelsBox, 'end');
		await placeCursor(tomsBox, 'start');
		await Promise.all([page.keyboard.type(' Rachel agrees.'), tomPage.keyboard.type('Tom says: ')]);

		const both = 'Tom says: France supports the treaty. Rachel agrees.';
		await expect.poll(() => editorText(rachelsBox), { timeout: DATABASE_TIMEOUT_MS }).toBe(both);
		await expect.poll(() => editorText(tomsBox), { timeout: DATABASE_TIMEOUT_MS }).toBe(both);
		// Tom's cursor is drawn in Rachel's editor with his name on it.
		await expect(rachelsBox.getByText(tomFirstName, { exact: true })).toBeVisible();

		if (testInfo.project.name === 'desktop') {
			await saveFullPageScreenshot(tomPage, 'delegation-paper-shared-desktop');
		}

		if (testInfo.project.name === 'phone') {
			await expectNoSidewaysOverflow(tomPage);
			await saveFullPageScreenshot(tomPage, 'delegation-paper-shared-phone');
		}

		// The stored Markdown is the document both of them now see.
		await expect
			.poll(async () => (await readDraft(shared.rachelSeatId))?.body_markdown, {
				timeout: DATABASE_TIMEOUT_MS
			})
			.toBe(both);
		await expect(page.getByText(/^Saved/)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await expect(tomPage.getByText(/^Saved/)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await tomContext.close();

		// A reload keeps both.
		await page.reload();
		await waitForEditor(page);
		await expect.poll(() => editorText(rachelsBox), { timeout: DATABASE_TIMEOUT_MS }).toBe(both);
	});

	test('with Realtime down a member still saves, and the others’ words still arrive', async ({
		page,
		browser
	}, testInfo) => {
		skipWithoutJavaScript(testInfo);
		const shared = await makeSharedDelegation('Paused Paper');
		await writeDraftAs(shared.rachelSeatId, shared.rachel, 'France supports the treaty.');

		// Tom's browser cannot reach Realtime: every socket to it is closed at once.
		const tomContext = await browser.newContext();
		const tomPage = await tomContext.newPage();
		await tomPage.routeWebSocket(/\/realtime\//, (socket) => socket.close());
		await signIn(tomPage, shared.tom);
		await tomPage.goto(`${shared.papersPath}/${shared.rachelSeatId}`);
		await waitForEditor(tomPage);
		await expect(tomPage.getByText(/^Live editing is paused\./)).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		const tomsBox = paperBox(tomPage, `${shared.rachel.fullName}'s paper`);
		await placeCursor(tomsBox, 'start');
		await tomPage.keyboard.type('Tom says: ');
		await expect(tomPage.getByText(/^Saved/)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

		// Rachel, online, gets Tom's saved words when she opens the paper, and adds her own.
		await signIn(page, shared.rachel);
		await page.goto(shared.rachelPaperPath);
		await waitForEditor(page);
		const rachelsBox = paperBox(page, 'Your paper');
		await expect.poll(() => editorText(rachelsBox)).toBe('Tom says: France supports the treaty.');
		await placeCursor(rachelsBox, 'end');
		await page.keyboard.type(' Rachel agrees.');

		// Tom's page asks for what the others saved every little while.
		const both = 'Tom says: France supports the treaty. Rachel agrees.';
		await expect.poll(() => editorText(tomsBox), { timeout: 3 * DATABASE_TIMEOUT_MS }).toBe(both);
		await tomContext.close();
	});

	test('a fellow member saves the draft with the plain box without JavaScript', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.use.javaScriptEnabled !== false, 'This is the form without script.');
		const shared = await makeSharedDelegation('Paper Plain Shared');
		await writeDraftAs(shared.rachelSeatId, shared.rachel, 'First words');

		await signIn(page, shared.tom);
		await page.goto(`${shared.papersPath}/${shared.rachelSeatId}`);
		const box = paperBox(page, `${shared.rachel.fullName}'s paper`);
		await expect(box).toHaveValue('First words', { timeout: DATABASE_TIMEOUT_MS });
		await box.fill('First words, and Tom’s');
		await page.getByRole('button', { name: 'Save draft' }).click();

		await expect(page.getByText('Draft saved.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		const draft = await readDraft(shared.rachelSeatId);
		expect(draft?.body_markdown).toBe('First words, and Tom’s');
		expect(draft?.updated_by).toBe(shared.tom.id);
	});

	test('somebody outside the delegation gets a 404', async ({ page }) => {
		const shared = await makeSharedDelegation('Paper Stranger');
		const stranger = await createTestUser('Paper Stranger Outsider');

		await signIn(page, stranger);
		const response = await page.goto(`${shared.papersPath}/${shared.rachelSeatId}`);

		expect(response?.status()).toBe(404);
	});

	test('a fellow member suggests words, and the delegate sees them beside the paper and accepts', async ({
		page,
		browser
	}, testInfo) => {
		skipWithoutJavaScript(testInfo);
		const shared = await makeSharedDelegation('Suggested Paper');
		await writeDraftAs(shared.rachelSeatId, shared.rachel, 'France supports the treaty.');

		await signIn(page, shared.rachel);
		await page.goto(shared.rachelPaperPath);
		const tomContext = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
		const tomPage = await tomContext.newPage();
		await signIn(tomPage, shared.tom);
		await tomPage.goto(`${shared.papersPath}/${shared.rachelSeatId}`);
		await Promise.all([waitForEditor(page), waitForEditor(tomPage)]);

		// The mode sits in the toolbar on a desktop and beside the heading on a phone.
		await tomPage.getByRole('button', { name: 'Mode: Editing' }).filter({ visible: true }).click();
		await tomPage.getByRole('menuitemradio', { name: 'Suggesting' }).click();
		await placeCursor(paperBox(tomPage, `${shared.rachel.fullName}'s paper`), 'end');
		await tomPage.keyboard.type(' Brazil agrees.');

		const suggestion = page
			.getByRole('main')
			.getByRole('complementary', { name: 'Suggestions', exact: true })
			.getByRole('article', { name: `Suggestion by ${shared.tom.fullName}` });
		await expect(suggestion).toContainText('Brazil agrees.', { timeout: DATABASE_TIMEOUT_MS });
		if (testInfo.project.name === 'phone') {
			await expectNoSidewaysOverflow(page);
		}
		await saveFullPageScreenshot(page, 'position-paper-suggestion');

		await suggestion.getByRole('button', { name: 'Accept' }).click();
		await expect(suggestion).toHaveCount(0);
		const accepted = 'France supports the treaty. Brazil agrees.';
		await expect.poll(() => editorText(paperBox(page, 'Your paper'))).toBe(accepted);
		await expect
			.poll(() => editorText(paperBox(tomPage, `${shared.rachel.fullName}'s paper`)), {
				timeout: DATABASE_TIMEOUT_MS
			})
			.toBe(accepted);
		await tomContext.close();
	});
});
