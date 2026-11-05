import { expect, test, type Locator, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	DATABASE_TIMEOUT_MS,
	makeChairedCommittee,
	openRoom,
	readCommitteeState,
	startSession,
	type ChairedCommittee
} from './chair-room-fixtures';
import { skipWithoutJavaScript } from './in-place';
import { expectNoSidewaysOverflow, saveFullPageScreenshot } from './page-shape';
import { signIn } from './signed-in-user';

// T130: the Chair Notes panel saves itself while the chair types,
// survives a reload, keeps the text when a save fails, does not let a second
// chair's save wipe the first out silently, and without JavaScript is a plain
// box with a Save button. The Notes page links to each session's notes, which
// are still there after the session ends. Who may read the notes at all is
// proven in `tests/db/committee-session-notes.test.ts`.
//
// T144: the panel is the shared Markdown editor, and the notes are stored as
// Markdown, whichever way they were formatted.
//
// Session redesign (S4): the panel left the room's floor. It lives on the
// session's notes page, `chair/notes/sessions/[sessionId]`, which the
// committee menu's Notes and the ended screen's "Session notes" reach.

/** The notes, as the editor's writing area with JavaScript and as the plain box without. */
function notesBox(page: Page): Locator {
	return page.getByRole('textbox', { name: 'Chair Notes' });
}

/**
 * Sign the chair in, start a session in the room and open that session's
 * notes page, with the notes ready to type in.
 */
async function openRoomWithSession(page: Page, room: ChairedCommittee): Promise<void> {
	await signIn(page, room.chair);
	await openRoom(page, room.roomPath);
	await startSession(page);
	const sessionId = (await readCommitteeState(room.committeeId)).current_session_id ?? '';
	await page.goto(`${room.roomPath}/notes/sessions/${sessionId}`);
	await expect(page.getByRole('heading', { name: 'Chair Notes' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
}

/** Wait for the editor, which replaces the plain box once the page's script runs. */
async function waitForEditor(page: Page): Promise<void> {
	await expect(page.getByRole('toolbar', { name: 'Formatting' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
}

/** Type into the editor at the end of what it holds. */
async function typeInEditor(page: Page, text: string): Promise<void> {
	await notesBox(page).click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type(text);
}

/** The stored notes of the committee's only notes row, or null when there is none. */
async function readStoredNotes(room: ChairedCommittee) {
	const admin = createServiceRoleClient();
	const { data, error } = await admin
		.from('committee_session_notes')
		.select('session_id, body, revision')
		.eq('committee_id', room.committeeId)
		.maybeSingle();

	if (error) throw new Error(`Could not read the notes: ${error.message}`);

	return data;
}

test('saves the notes by itself and keeps them after a reload', async ({ page }, testInfo) => {
	skipWithoutJavaScript(testInfo);

	const room = await makeChairedCommittee('Autosave Notes MUN');

	await openRoomWithSession(page, room);
	await waitForEditor(page);
	await expect(notesBox(page)).toHaveAttribute('aria-placeholder', 'Write your notes here…');
	await typeInEditor(page, 'France wants a ceasefire');

	await expect(page.getByText(/^Auto-saved/)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect
		.poll(async () => (await readStoredNotes(room))?.body)
		.toContain('France wants a ceasefire');

	await page.reload();
	await waitForEditor(page);
	await expect(notesBox(page)).toContainText('France wants a ceasefire');
	await expect(page.getByText(/^Auto-saved/)).toBeVisible();
});

test('stores bold from the toolbar as Markdown, and it survives a reload', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough for the toolbar.');

	const room = await makeChairedCommittee('Toolbar Notes MUN');

	await openRoomWithSession(page, room);
	await waitForEditor(page);
	await typeInEditor(page, 'Opening');
	await page.getByRole('combobox', { name: 'Text style' }).selectOption('heading');
	await page.keyboard.press('End');
	await page.keyboard.press('Enter');
	await page.getByRole('button', { name: 'Bold' }).click();
	await page.keyboard.type('Ghana');

	await expect(notesBox(page).getByRole('heading', { name: 'Opening' })).toBeVisible();
	await expect
		.poll(async () => (await readStoredNotes(room))?.body, { timeout: DATABASE_TIMEOUT_MS })
		.toBe('## Opening\n\n**Ghana**');

	await page.reload();
	await waitForEditor(page);
	await expect(notesBox(page).getByRole('heading', { name: 'Opening' })).toBeVisible();
	await expect(notesBox(page).locator('strong')).toHaveText('Ghana');
});

test('formats typed Markdown, and the Markdown switch edits what is stored', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough for the typing.');

	const room = await makeChairedCommittee('Typed Markdown Notes MUN');

	await openRoomWithSession(page, room);
	await waitForEditor(page);
	await typeInEditor(page, '**Ghana** yields');
	await page.keyboard.press('Enter');
	await page.keyboard.type('- to France');

	await expect(notesBox(page).locator('strong')).toHaveText('Ghana');
	await expect(notesBox(page).locator('ul li')).toHaveText('to France');
	await expect
		.poll(async () => (await readStoredNotes(room))?.body, { timeout: DATABASE_TIMEOUT_MS })
		.toBe('**Ghana** yields\n\n- to France');

	// The switch shows the stored Markdown in a box, and what is typed there is saved too.
	const switchButton = page.getByRole('button', { name: 'Markdown', exact: true });
	await switchButton.click();
	const markdownBox = page.getByRole('textbox', { name: 'Chair Notes' });
	await expect(markdownBox).toHaveValue('**Ghana** yields\n\n- to France');
	await markdownBox.fill('Vote on ++Friday++');
	await switchButton.click();

	await expect(notesBox(page).locator('u')).toHaveText('Friday');
	await expect
		.poll(async () => (await readStoredNotes(room))?.body, { timeout: DATABASE_TIMEOUT_MS })
		.toBe('Vote on ++Friday++');
});

test('keeps the text on screen when a save fails', async ({ page }, testInfo) => {
	skipWithoutJavaScript(testInfo);

	const room = await makeChairedCommittee('Failed Save Notes MUN');

	await openRoomWithSession(page, room);
	await waitForEditor(page);

	// The connection drops for every save of the notes.
	const isNotesSave = (url: URL) => url.search.includes('saveSessionNotes');
	await page.route(isNotesSave, (route) => route.abort());
	await typeInEditor(page, 'Japan yields to Ghana');

	await expect(page.getByRole('alert')).toContainText('Your notes were not saved', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.getByRole('alert')).toContainText('Check your connection');
	await expect(notesBox(page)).toContainText('Japan yields to Ghana');
	expect(await readStoredNotes(room)).toBeNull();

	// Back online, "Try again" stores what is on screen.
	await page.unroute(isNotesSave);
	await page.getByRole('button', { name: 'Try again' }).click();
	await expect(page.getByText(/^Auto-saved/)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect.poll(async () => (await readStoredNotes(room))?.body).toContain('Japan yields');
});

test('does not let another chair wipe the notes out silently', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough for the clash.');

	const room = await makeChairedCommittee('Two Chairs Notes MUN');

	await openRoomWithSession(page, room);
	await waitForEditor(page);
	await typeInEditor(page, 'Mine');
	await expect.poll(async () => (await readStoredNotes(room))?.revision).toBe(1);

	// Another chair saves over them, from somewhere else.
	const admin = createServiceRoleClient();
	const stored = await readStoredNotes(room);
	await admin
		.from('committee_session_notes')
		.update({ body: '**Theirs**' })
		.eq('session_id', stored?.session_id ?? '');

	await typeInEditor(page, ' and more');
	await expect(page.getByText('Another chair changed these notes.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(notesBox(page)).toContainText('Mine and more');

	// Their Markdown is shown formatted.
	await page.getByText('See their version').click();
	await expect(page.locator('details strong', { hasText: 'Theirs' })).toBeVisible();

	await page.getByRole('button', { name: 'Keep mine' }).click();
	await expect(page.getByText(/^Auto-saved/)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect.poll(async () => (await readStoredNotes(room))?.body).toContain('Mine and more');
});

test('saves the notes with the plain form without JavaScript', async ({ page }, testInfo) => {
	test.skip(testInfo.project.use.javaScriptEnabled !== false, 'This is the form without script.');

	const room = await makeChairedCommittee('Plain Notes MUN');

	await openRoomWithSession(page, room);
	const typed = 'Brazil proposes a **working group**.\n\nVote on Friday.';
	await notesBox(page).fill(typed);
	await page.getByRole('button', { name: 'Save notes' }).click();

	await expect(page.getByText('Notes saved.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(notesBox(page)).toHaveValue(typed);
	expect((await readStoredNotes(room))?.body).toBe(typed);
});

test('keeps the notes of an ended session, linked from the Notes page', async ({
	page
}, testInfo) => {
	const room = await makeChairedCommittee('Ended Session Notes MUN');

	await openRoomWithSession(page, room);

	// The session has notes and has since ended.
	const admin = createServiceRoleClient();
	const state = await readCommitteeState(room.committeeId);
	const sessionId = state.current_session_id ?? '';
	await admin.from('committee_session_notes').insert({
		session_id: sessionId,
		committee_id: room.committeeId,
		body: 'Resolution 1 **passed**'
	});
	await admin
		.from('committee_sessions')
		.update({ status: 'ended', ended_at: new Date().toISOString() })
		.eq('id', sessionId);

	await page.goto(`${room.roomPath}/notes`);
	await page.getByRole('link', { name: /Session 1/ }).click();

	await expect(page.getByRole('heading', { name: 'Session 1', level: 1 })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.getByText('Ended · Private to chairs and organisers')).toBeVisible();
	if (testInfo.project.use.javaScriptEnabled === false) {
		await expect(notesBox(page)).toHaveValue('Resolution 1 **passed**');
	} else {
		await expect(notesBox(page).locator('strong')).toHaveText('passed');
	}

	if (testInfo.project.name === 'phone') {
		await saveFullPageScreenshot(page, 'chair-session-notes');
		await expectNoSidewaysOverflow(page);
	}
});
