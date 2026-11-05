import { expect, test, type Locator, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	addScheduleCommittee,
	createScheduleConference,
	unusedName,
	type ScheduleConference
} from './schedule-fixtures';
import { createTestUser, giveApplication, signIn, type TestUser } from './signed-in-user';

// T131: on the allocation grid an organiser drags a delegate onto a free seat
// (a move) or onto another delegate (a swap, after a question), and drags an
// accepted delegation from the banner above the grid onto a free seat. The drop
// shows at once and is saved in the background; a refusal puts everybody back
// and says why.
//
// Dragging needs JavaScript and a mouse, so those tests run on `desktop` only.
// The seat menu's move panel is the way without either, and the last test shows
// it still works on `desktop-no-js` and on a phone, where no handle is drawn.
//
// The conference is written with the service-role client through
// `schedule-fixtures.ts`, which is faster than the `/create` form
// `manage-allocation.spec.ts` goes through. Its committees, seats and accounts
// are this test's own, so no two projects running at once see each other's rows.

/** How long an assertion that waits on the database may take (see `manage-allocation.spec.ts`). */
const DATABASE_TIMEOUT_MS = 15_000;

/** How soon a drop must show on the grid, before the server has answered. */
const AT_ONCE_TIMEOUT_MS = 1_000;

/** One seat the fixture writes. */
type SeatSeed = {
	name: string;
	countryCode: string;
	position: number;
	/** The person sitting in it, with the accepted application they got it through. */
	holder?: { user: TestUser; applicationId: string };
};

/**
 * The conference each test works on.
 *
 * | Committee | Seat   | State                              |
 * | --------- | ------ | ---------------------------------- |
 * | ECOFIN    | Brazil | free                               |
 * | ECOFIN    | Japan  | Ben Lee, an individual             |
 * | WHO       | France | Anna Kowalski, an individual       |
 * | WHO       | Ghana  | free                               |
 *
 * plus an accepted delegation that asked for two seats and holds none, which
 * puts it in the tray.
 */
type DragFixture = {
	conference: ScheduleConference;
	anna: TestUser;
	ben: TestUser;
	delegationId: string;
	delegationName: string;
	/** Seat ids by seat name. */
	seats: Map<string, string>;
};

/** Write one committee's seats straight into the table, and answer their ids by name. */
async function addSeats(committeeId: string, seeds: SeatSeed[]): Promise<Map<string, string>> {
	const admin = createServiceRoleClient();
	const rows = seeds.map((seed) => ({
		committee_id: committeeId,
		name: seed.name,
		country_code: seed.countryCode,
		position: seed.position,
		user_id: seed.holder?.user.id ?? null,
		application_id: seed.holder?.applicationId ?? null,
		allocated_at: seed.holder ? new Date().toISOString() : null
	}));

	const { data, error } = await admin.from('seats').insert(rows).select('id, name');

	if (error || !data) throw new Error(`Could not write the test seats: ${error?.message}`);

	return new Map(data.map((row) => [row.name, row.id]));
}

/** An account with an accepted application to the conference, ready to be seated. */
async function acceptedIndividual(
	conferenceId: string,
	fullName: string
): Promise<{ user: TestUser; applicationId: string }> {
	const user = await createTestUser(fullName);
	const applicationId = await giveApplication(user, { conferenceId, status: 'accepted' });

	return { user, applicationId };
}

/** Eight capital letters and digits, the shape a delegation's join code takes. */
function unusedJoinCode(): string {
	const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	const characters: string[] = [];

	for (let position = 0; position < 8; position += 1) {
		characters.push(alphabet[Math.floor(Math.random() * alphabet.length)]);
	}

	return characters.join('');
}

/** An accepted delegation that asked for two seats, and answer its id. */
async function addWaitingDelegation(conferenceId: string, name: string): Promise<string> {
	const admin = createServiceRoleClient();
	const { data, error } = await admin
		.from('delegations')
		.insert({
			conference_id: conferenceId,
			name,
			institution_name: 'Riverside High School',
			status: 'accepted',
			requested_seats: 2,
			join_code: unusedJoinCode(),
			submitted_at: new Date().toISOString()
		})
		.select('id')
		.single();

	if (error || !data) throw new Error(`Could not write the test delegation: ${error?.message}`);

	return data.id;
}

/** Build the conference in the table above and sign its organiser in. */
async function seedDragGrid(page: Page, prefix: string): Promise<DragFixture> {
	const organiser = await createTestUser('Priya Nair');
	const conference = await createScheduleConference({ owner: organiser, namePrefix: prefix });
	const ecofinId = await addScheduleCommittee(conference.id, {
		name: 'Economic and Financial Committee',
		abbreviation: 'ECOFIN',
		position: 0
	});
	const whoId = await addScheduleCommittee(conference.id, {
		name: 'World Health Organization',
		abbreviation: 'WHO',
		position: 1
	});

	const anna = await acceptedIndividual(conference.id, 'Anna Kowalski');
	const ben = await acceptedIndividual(conference.id, 'Ben Lee');
	const delegationName = unusedName('Riverside School Delegation');
	const delegationId = await addWaitingDelegation(conference.id, delegationName);

	const ecofinSeats = await addSeats(ecofinId, [
		{ name: 'Brazil', countryCode: 'BR', position: 0 },
		{ name: 'Japan', countryCode: 'JP', position: 1, holder: ben }
	]);
	const whoSeats = await addSeats(whoId, [
		{ name: 'France', countryCode: 'FR', position: 0, holder: anna },
		{ name: 'Ghana', countryCode: 'GH', position: 1 }
	]);

	await signIn(page, organiser);

	return {
		conference,
		anna: anna.user,
		ben: ben.user,
		delegationId,
		delegationName,
		seats: new Map([...ecofinSeats, ...whoSeats])
	};
}

/** The id of one of the fixture's seats, by name. */
function seatId(fixture: DragFixture, name: string): string {
	const found = fixture.seats.get(name);

	if (found === undefined) throw new Error(`The fixture has no seat called "${name}"`);

	return found;
}

/** Open the grid and wait until its heading has arrived. */
async function openTheGrid(page: Page, fixture: DragFixture, query = ''): Promise<void> {
	await page.goto(`/manage/${fixture.conference.slug}/allocation${query}`);
	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Allocation', {
		timeout: DATABASE_TIMEOUT_MS
	});
}

/**
 * The cell of one seat that is on screen. `CommitteeSeatColumn` draws a column
 * for a desktop and a folding section for a phone, and only one of them shows.
 */
function seatCell(page: Page, fixture: DragFixture, name: string): Locator {
	return page.locator(`[data-drop-target="${seatId(fixture, name)}"]:visible`);
}

/** A drag handle by its title, once the page's script has drawn it. */
async function readyHandle(page: Page, title: string): Promise<Locator> {
	// The handle is hidden from screen readers, so it is found by its title.
	const handle = page.locator(`[title="${title}"]:visible`);
	await expect(handle).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	return handle;
}

/** The middle of an element on the page, in pixels. */
async function middleOf(locator: Locator): Promise<{ x: number; y: number }> {
	const box = await locator.boundingBox();

	if (!box) throw new Error('The element is not on the screen.');

	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Press the mouse on `handle` and move it, in small steps, over `target` without letting go. */
async function dragOver(page: Page, handle: Locator, target: Locator): Promise<void> {
	const from = await middleOf(handle);
	const to = await middleOf(target);

	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	await page.mouse.move(to.x, to.y, { steps: 12 });
}

/** Who is in one seat, read back with the service-role client. */
async function readSeat(
	seatIdToRead: string
): Promise<{ user_id: string | null; delegation_id: string | null }> {
	const admin = createServiceRoleClient();
	const { data, error } = await admin
		.from('seats')
		.select('user_id, delegation_id')
		.eq('id', seatIdToRead)
		.single();

	if (error || !data) throw new Error(`Could not read the test seat back: ${error?.message}`);

	return data;
}

test('a delegate dragged onto a free seat moves there at once, and it is kept', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'A mouse drag needs JavaScript and a mouse.');
	const fixture = await seedDragGrid(page, 'Drag Move Allocation MUN');

	await openTheGrid(page, fixture);
	const handle = await readyHandle(page, 'Drag Anna Kowalski to another seat');
	await dragOver(page, handle, seatCell(page, fixture, 'Brazil'));

	// While Anna is held, both free seats are marked as places she can go, and
	// Ben's seat as one she can swap with.
	await expect(seatCell(page, fixture, 'Brazil')).toHaveAttribute('data-drop-kind', 'move');
	await expect(seatCell(page, fixture, 'Ghana')).toHaveAttribute('data-drop-kind', 'move');
	await expect(seatCell(page, fixture, 'Japan')).toHaveAttribute('data-drop-kind', 'swap');
	await page.mouse.up();

	await expect(seatCell(page, fixture, 'Brazil')).toContainText('Anna Kowalski', {
		timeout: AT_ONCE_TIMEOUT_MS
	});
	await expect(page.getByText('Anna Kowalski moved to Brazil in ECOFIN.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect((await readSeat(seatId(fixture, 'Brazil'))).user_id).toBe(fixture.anna.id);
	expect((await readSeat(seatId(fixture, 'France'))).user_id).toBeNull();

	await page.reload();
	await expect(seatCell(page, fixture, 'Brazil')).toContainText('Anna Kowalski', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(seatCell(page, fixture, 'France')).not.toContainText('Anna Kowalski');
});

test('a delegate dropped on another asks first, then the two swap seats', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'A mouse drag needs JavaScript and a mouse.');
	const fixture = await seedDragGrid(page, 'Drag Swap Allocation MUN');

	await openTheGrid(page, fixture);
	const handle = await readyHandle(page, 'Drag Anna Kowalski to another seat');
	await dragOver(page, handle, seatCell(page, fixture, 'Japan'));
	await page.mouse.up();

	const dialog = page.getByRole('dialog', { name: 'Swap these two delegates?' });
	await expect(dialog).toContainText(
		'Anna Kowalski moves to ECOFIN · Japan, and Ben Lee moves to WHO · France.'
	);
	// Nothing has moved while the question is open.
	await expect(seatCell(page, fixture, 'France')).toContainText('Anna Kowalski');
	await dialog.getByRole('button', { name: 'Swap seats' }).click();

	await expect(seatCell(page, fixture, 'Japan')).toContainText('Anna Kowalski', {
		timeout: AT_ONCE_TIMEOUT_MS
	});
	await expect(seatCell(page, fixture, 'France')).toContainText('Ben Lee');
	await expect(page.getByText('Anna Kowalski and Ben Lee swapped seats.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect((await readSeat(seatId(fixture, 'Japan'))).user_id).toBe(fixture.anna.id);
	expect((await readSeat(seatId(fixture, 'France'))).user_id).toBe(fixture.ben.id);

	await page.reload();
	await expect(seatCell(page, fixture, 'Japan')).toContainText('Anna Kowalski', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(seatCell(page, fixture, 'France')).toContainText('Ben Lee');
});

test('a delegation dragged from the tray onto a free seat is given that seat', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'A mouse drag needs JavaScript and a mouse.');
	const fixture = await seedDragGrid(page, 'Drag Tray Allocation MUN');

	await openTheGrid(page, fixture);
	const tray = page.getByRole('complementary', { name: 'Waiting for seats' });
	await expect(tray).toContainText('0 of 2 given');
	const handle = await readyHandle(page, `Drag ${fixture.delegationName} onto a free seat`);
	await dragOver(page, handle, seatCell(page, fixture, 'Ghana'));
	await page.mouse.up();

	await expect(seatCell(page, fixture, 'Ghana')).toContainText(fixture.delegationName, {
		timeout: AT_ONCE_TIMEOUT_MS
	});
	await expect(tray).toContainText('1 of 2 given');
	await expect(page.getByText(`1 seat allocated to ${fixture.delegationName}.`)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect((await readSeat(seatId(fixture, 'Ghana'))).delegation_id).toBe(fixture.delegationId);

	await page.reload();
	await expect(seatCell(page, fixture, 'Ghana')).toContainText(fixture.delegationName, {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(tray).toContainText('1 of 2 given');
});

test('a move the server refuses puts the delegate back and says why', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'A mouse drag needs JavaScript and a mouse.');
	const fixture = await seedDragGrid(page, 'Drag Refused Allocation MUN');

	await openTheGrid(page, fixture);
	const handle = await readyHandle(page, 'Drag Anna Kowalski to another seat');

	// Somebody else takes Brazil after the grid was drawn, so the page still
	// shows it free and the server is the one to say no.
	const carla = await acceptedIndividual(fixture.conference.id, 'Carla Mendes');
	const admin = createServiceRoleClient();
	const { error } = await admin
		.from('seats')
		.update({
			user_id: carla.user.id,
			application_id: carla.applicationId,
			allocated_at: new Date().toISOString()
		})
		.eq('id', seatId(fixture, 'Brazil'));

	if (error) throw new Error(`Could not seat the other delegate: ${error.message}`);

	await dragOver(page, handle, seatCell(page, fixture, 'Brazil'));
	await page.mouse.up();

	await expect(page.getByText('That seat was just taken.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(seatCell(page, fixture, 'France')).toContainText('Anna Kowalski');
	await expect(seatCell(page, fixture, 'Brazil')).toContainText('Carla Mendes');
	expect((await readSeat(seatId(fixture, 'France'))).user_id).toBe(fixture.anna.id);
});

test('without a mouse or a script the move panel still moves a delegate', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name === 'desktop', 'The desktop drags; this is the other way.');
	const fixture = await seedDragGrid(page, 'Panel Move Allocation MUN');

	await openTheGrid(page, fixture, `?seat=${seatId(fixture, 'France')}&action=move`);
	const main = page.getByRole('main');

	// No drag handle is drawn: without a script there is nothing to drag with,
	// and on a phone the handle is hidden.
	await expect(main.locator('[title="Drag Anna Kowalski to another seat"]:visible')).toHaveCount(0);
	await main.locator('select[name="toSeatId"]').selectOption(seatId(fixture, 'Ghana'));
	await main.getByRole('button', { name: 'Move the delegate' }).press('Enter');

	await expect(page.getByText('Anna Kowalski moved to Ghana in WHO.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect((await readSeat(seatId(fixture, 'Ghana'))).user_id).toBe(fixture.anna.id);
});
