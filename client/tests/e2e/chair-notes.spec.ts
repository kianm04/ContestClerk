import { expect, test, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	DATABASE_TIMEOUT_MS,
	makeChairedCommittee,
	type ChairedCommittee,
	waitUntilAnswered
} from './chair-room-fixtures';
import {
	expectNoSidewaysOverflow,
	expectPageFitsInScreens,
	saveFullPageScreenshot
} from './page-shape';
import { createTestUser, giveSeat, makeCommitteeChair, signIn } from './signed-in-user';
import { answerConfirmationPage } from './confirmation-page';
import { waitForChairScript } from './chair-script';

// The acceptance criteria of `specs/05-pages/chair/notes.md` that need a real
// browser: choosing a seat and reading its notes newest first, adding a note
// and staying on the seat, the refusal of an empty note, who sees Delete, the
// count beside each seat and the search over them, and the page on a phone.
// The criterion that a delegate cannot read a note at all is proven with the
// delegate's own client in `tests/db/committee-room.test.ts`.
//
// Every form is a plain `<form method="post">` and every seat a link, so the
// tests that do not need the search box or the phone's dropdown run on all
// three projects, and `desktop-no-js` is the proof that they work without
// JavaScript.

/** How long a single try inside a retrying block may take. */
const SINGLE_TRY_TIMEOUT_MS = 2_000;

/** How many screens the notes page may take on a laptop. */
const NOTES_SCREENS = 2;

/** A committee whose France and Ghana seats have delegates in them. */
async function makeSeatedCommittee(namePrefix: string): Promise<ChairedCommittee> {
	const room = await makeChairedCommittee(namePrefix);

	await giveSeat(await createTestUser('Amélie Laurent'), room.committeeId, 'France');
	await giveSeat(await createTestUser('Kofi Mensah'), room.committeeId, 'Ghana');

	return room;
}

/** The id of one of the committee's seats. */
async function readSeatId(committeeId: string, seatName: string): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('seats')
		.select('id')
		.eq('committee_id', committeeId)
		.eq('name', seatName)
		.single();

	if (error || !data) {
		throw new Error(`Could not read the ${seatName} seat: ${error?.message}`);
	}

	return data.id;
}

/** One note written straight into the table, the way another chair's form would. */
type NoteSeed = {
	committeeId: string;
	seatName: string;
	authorId: string;
	body: string;
	createdAt: string;
};

/** Write a note as somebody else, at a moment the test chooses. */
async function giveNote(seed: NoteSeed): Promise<void> {
	const admin = createServiceRoleClient();
	const seatId = await readSeatId(seed.committeeId, seed.seatName);

	const { error } = await admin.from('chair_notes').insert({
		committee_id: seed.committeeId,
		seat_id: seatId,
		author_id: seed.authorId,
		body: seed.body,
		created_at: seed.createdAt
	});

	if (error) {
		throw new Error(`Could not write the test note: ${error.message}`);
	}
}

/** The bodies of the committee's notes on one seat, newest first. */
async function readNoteBodies(committeeId: string, seatName: string): Promise<string[]> {
	const admin = createServiceRoleClient();
	const seatId = await readSeatId(committeeId, seatName);

	const { data, error } = await admin
		.from('chair_notes')
		.select('body')
		.eq('seat_id', seatId)
		.order('created_at', { ascending: false });

	if (error) {
		throw new Error(`Could not read the notes: ${error.message}`);
	}

	return (data ?? []).map((note) => note.body);
}

/** Open the notes page, on one seat when `seatId` is given, and wait for it. */
async function openNotes(page: Page, room: ChairedCommittee, seatId?: string): Promise<void> {
	const address = seatId ? `${room.roomPath}/notes?seat=${seatId}` : `${room.roomPath}/notes`;

	await page.goto(address);
	await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
}

/** The heading over the notes, which names the seat on show. */
function seatHeading(page: Page) {
	return page.getByRole('region', { name: /·/ }).getByRole('heading', { level: 2 });
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
	const room = await makeSeatedCommittee('Stranger Notes MUN');
	const otherRoom = await makeChairedCommittee('Other Notes MUN');

	await signIn(page, otherRoom.chair);
	const response = await page.goto(`${room.roomPath}/notes`);

	expect(response?.status()).toBe(404);
});

test('asks for seated delegates before anything else', async ({ page }) => {
	const room = await makeChairedCommittee('Empty Notes MUN');

	await signIn(page, room.chair);
	await openNotes(page, room);

	await expect(page.getByText('No delegates seated yet.')).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'New note' })).toHaveCount(0);
});

test("a seat's notes come newest first, with the author and the time in the conference's timezone", async ({
	page
}) => {
	const room = await makeSeatedCommittee('Order Notes MUN');
	const viceChair = await createTestUser('Sara Lindqvist');
	await makeCommitteeChair(viceChair, room.committeeId, 'Vice Chair');

	// 08:30 and 09:45 in UTC are 10:30 and 11:45 in Amsterdam in May.
	await giveNote({
		committeeId: room.committeeId,
		seatName: 'Ghana',
		authorId: viceChair.id,
		body: 'Opened well on the first topic.',
		createdAt: '2020-05-10T08:30:00Z'
	});
	await giveNote({
		committeeId: room.committeeId,
		seatName: 'Ghana',
		authorId: viceChair.id,
		body: 'Led the working paper.',
		createdAt: '2020-05-10T09:45:00Z'
	});

	await signIn(page, room.chair);
	// The first seat with a delegate is France, which has no notes.
	await openNotes(page, room);
	await expect(seatHeading(page)).toHaveText('France · Amélie Laurent');
	await expect(page.getByText('No notes on France yet.')).toBeVisible();

	await openNotes(page, room, await readSeatId(room.committeeId, 'Ghana'));

	await expect(seatHeading(page)).toHaveText('Ghana · Kofi Mensah');
	const notes = page
		.getByRole('main')
		.getByRole('listitem')
		.filter({ has: page.locator('time') });
	await expect(notes).toHaveCount(2);
	await expect(notes.nth(0)).toContainText('10 May 2020, 11:45 · Sara Lindqvist (Vice Chair)');
	await expect(notes.nth(0)).toContainText('Led the working paper.');
	await expect(notes.nth(1)).toContainText('10 May 2020, 10:30 · Sara Lindqvist (Vice Chair)');
});

test('adding a note keeps the seat, and an empty one is refused on the same seat', async ({
	page
}) => {
	const room = await makeSeatedCommittee('Add Notes MUN');
	const ghanaId = await readSeatId(room.committeeId, 'Ghana');

	await signIn(page, room.chair);
	await openNotes(page, room, ghanaId);

	// Spaces are refused by the server, which is what answers them.
	const noteBox = page.getByRole('textbox', { name: 'New note' });
	await noteBox.fill('   ');
	await page.getByRole('button', { name: 'Add note' }).click();

	await expect(page.getByText('Write something before adding the note.').first()).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(seatHeading(page)).toHaveText('Ghana · Kofi Mensah');
	expect(await readNoteBodies(room.committeeId, 'Ghana')).toEqual([]);

	await page.getByRole('textbox', { name: 'New note' }).fill('Strong rebuttal on sanctions.');
	await page.getByRole('button', { name: 'Add note' }).click();

	await expect(page.getByText('Strong rebuttal on sanctions.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page).toHaveURL(new RegExp(`seat=${ghanaId}`));
	await expect(seatHeading(page)).toHaveText('Ghana · Kofi Mensah');
	const newNote = page.getByRole('listitem').filter({ hasText: 'Strong rebuttal on sanctions.' });
	await expect(newNote).toContainText('· You');
	// `?added=1` puts the cursor back in the box, ready for the next note.
	await expect(page.getByRole('textbox', { name: 'New note' })).toBeFocused();
	// The note shows before the server has saved it (T141), so wait for its answer.
	await waitUntilAnswered(page);
	expect(await readNoteBodies(room.committeeId, 'Ghana')).toEqual([
		'Strong rebuttal on sanctions.'
	]);
});

test('a note written in Markdown shows formatted, from the compact editor or the plain box', async ({
	page
}, testInfo) => {
	const room = await makeSeatedCommittee('Markdown Notes MUN');
	const ghanaId = await readSeatId(room.committeeId, 'Ghana');
	const isWithoutJavaScript = testInfo.project.use.javaScriptEnabled === false;

	await signIn(page, room.chair);
	await openNotes(page, room, ghanaId);

	const noteBox = page.getByRole('textbox', { name: 'New note' });
	if (isWithoutJavaScript) {
		await noteBox.fill('Strong **rebuttal** on sanctions');
	} else {
		// The compact toolbar has no heading menu. Typed Markdown formats itself.
		await expect(page.getByRole('button', { name: 'Bold' })).toBeVisible();
		await expect(page.getByRole('combobox', { name: 'Text style' })).toHaveCount(0);
		await noteBox.click();
		await page.keyboard.type('Strong **rebuttal** on sanctions');
		await expect(noteBox.locator('strong')).toHaveText('rebuttal');
	}
	await page.getByRole('button', { name: 'Add note' }).click();

	const newNote = page.getByRole('listitem').filter({ hasText: 'on sanctions' });
	await expect(newNote.locator('strong')).toHaveText('rebuttal', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(page);
	expect(await readNoteBodies(room.committeeId, 'Ghana')).toEqual([
		'Strong **rebuttal** on sanctions'
	]);
});

test('only the author or an organiser sees Delete, and deleting takes the note away', async ({
	page
}) => {
	const room = await makeSeatedCommittee('Delete Notes MUN');
	const viceChair = await createTestUser('Sara Lindqvist');
	await makeCommitteeChair(viceChair, room.committeeId, 'Vice Chair');
	const franceId = await readSeatId(room.committeeId, 'France');

	await giveNote({
		committeeId: room.committeeId,
		seatName: 'France',
		authorId: viceChair.id,
		body: "The vice chair's note.",
		createdAt: '2020-05-10T08:30:00Z'
	});
	await giveNote({
		committeeId: room.committeeId,
		seatName: 'France',
		authorId: room.chair.id,
		body: "The chair's own note.",
		createdAt: '2020-05-10T09:30:00Z'
	});

	await signIn(page, room.chair);
	await openNotes(page, room, franceId);

	const ownNote = page.getByRole('listitem').filter({ hasText: "The chair's own note." });
	const otherNote = page.getByRole('listitem').filter({ hasText: "The vice chair's note." });
	await expect(ownNote.getByRole('button', { name: 'Delete' })).toBeVisible();
	await expect(otherNote.getByRole('button', { name: 'Delete' })).toHaveCount(0);

	await pressAndConfirm(page, 'Delete');

	await expect(page.getByText("The chair's own note.")).toHaveCount(0, {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(seatHeading(page)).toHaveText('France · Amélie Laurent');
	// The screen shows the result before the server has saved it (T141), so wait for its answer.
	await waitUntilAnswered(page);
	expect(await readNoteBodies(room.committeeId, 'France')).toEqual(["The vice chair's note."]);

	// The organiser may delete any note of the conference. Signing somebody else
	// in starts from a browser with nobody signed in.
	await page.context().clearCookies();
	await signIn(page, room.organiser);
	await openNotes(page, room, franceId);
	await expect(otherNote.getByRole('button', { name: 'Delete' })).toBeVisible();
});

test('each seat shows its count and the search narrows the seats', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'The search box needs JavaScript and a column.');

	const room = await makeSeatedCommittee('Count Notes MUN');
	await giveNote({
		committeeId: room.committeeId,
		seatName: 'Japan',
		authorId: room.chair.id,
		body: 'An empty seat can still have a note.',
		createdAt: '2020-05-10T08:30:00Z'
	});
	await giveNote({
		committeeId: room.committeeId,
		seatName: 'Ghana',
		authorId: room.chair.id,
		body: 'One.',
		createdAt: '2020-05-10T08:30:00Z'
	});
	await giveNote({
		committeeId: room.committeeId,
		seatName: 'Ghana',
		authorId: room.chair.id,
		body: 'Two.',
		createdAt: '2020-05-10T09:30:00Z'
	});

	await signIn(page, room.chair);
	await openNotes(page, room);
	// The filter answers keystrokes once the page's script runs; text typed
	// before that stays in the box but filters nothing. The server writes the
	// console's home link relative to the page and the script rewrites it from
	// the root, so an href starting with "/" says the script is running.
	await expect(
		page.getByRole('banner').getByRole('link', { name: 'MUNMeet home' })
	).toHaveAttribute('href', /^\//, { timeout: DATABASE_TIMEOUT_MS });

	const seatLinks = page.getByRole('main').getByRole('link', { name: /(France|Ghana|Japan)/ });
	await expect(seatLinks).toHaveCount(3);
	await expect(page.getByRole('link', { name: /Ghana/ })).toContainText('2 notes');
	await expect(page.getByRole('link', { name: /France/ })).toContainText('0 notes');
	await expect(page.getByRole('link', { name: /Japan/ })).toContainText('1 notes');

	await page.getByRole('searchbox', { name: 'Filter seats' }).fill('gha');
	await expect(seatLinks).toHaveCount(1);

	await page.getByRole('link', { name: /Ghana/ }).click();
	await expect(seatHeading(page)).toHaveText('Ghana · Kofi Mensah', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.getByText('Two.')).toBeVisible();
});

test('on a phone, a seat dropdown sits above the notes and the page fits', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	const room = await makeSeatedCommittee('Phone Notes International Model United Nations');
	await giveNote({
		committeeId: room.committeeId,
		seatName: 'Ghana',
		authorId: room.chair.id,
		body: 'Spoke three times and kept to time on every one of them.',
		createdAt: '2020-05-10T08:30:00Z'
	});

	await signIn(page, room.chair);
	await openNotes(page, room);

	const seatSelect = page.getByRole('combobox', { name: 'Seat' });
	await expect(seatSelect).toBeVisible();
	await expect(page.getByRole('searchbox', { name: 'Filter seats' })).toBeHidden();

	const selectBox = await seatSelect.boundingBox();
	const headingBox = await seatHeading(page).boundingBox();
	expect(selectBox && headingBox && selectBox.y < headingBox.y).toBe(true);

	// Only the script answers a picked seat, so a pick made before it runs does nothing.
	await waitForChairScript(page, testInfo);
	await seatSelect.selectOption({ label: 'Ghana (1)' });
	await expect(seatHeading(page)).toHaveText('Ghana · Kofi Mensah', {
		timeout: DATABASE_TIMEOUT_MS
	});

	await saveFullPageScreenshot(page, 'chair-notes');
	await expectNoSidewaysOverflow(page);
});

test('fits in a couple of screens', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough to measure a height.');

	const room = await makeSeatedCommittee('Height Notes MUN');
	for (const [index, body] of [
		'Opening speech.',
		'Moderated caucus.',
		'Draft sponsor.'
	].entries()) {
		await giveNote({
			committeeId: room.committeeId,
			seatName: 'France',
			authorId: room.chair.id,
			body,
			createdAt: `2020-05-10T0${index + 7}:30:00Z`
		});
	}

	await signIn(page, room.chair);
	await openNotes(page, room);
	await expect(page.getByText('Draft sponsor.')).toBeVisible();

	// Saved before the assertion, so that a failure leaves a picture of the page.
	await saveFullPageScreenshot(page, 'chair-notes');
	await expectPageFitsInScreens(page, NOTES_SCREENS);
});
