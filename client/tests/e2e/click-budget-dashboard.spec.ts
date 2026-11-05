import { expect, test, type Locator, type Page } from '@playwright/test';
import { ClickBudgetJourney, type JourneyCount } from './click-budget';
import { ELEANOR } from './walkthrough-seed';

// T173: Budget 5, the organiser on a conference day
// (`specs/05-pages/organiser/dashboard.md`, `specs/05-pages/delegate/home.md`
// and `specs/05-pages/chair/committee-room.md`, each "Budget 5"). It is walked
// on Eleanor and "Northbridge MUN (running today)", day 2 of 3, which is where
// `specs/03-design/streamlining/design.md` ("Where each budget is walked") puts
// it, counting clicks · pages · typed fields · decisions.
//
// The walk only follows links, so it runs on all three projects: both widths,
// and a page with no JavaScript.

/** Sign-in to the first room: 3 clicks, 4 pages, 2 typed, 0 decisions. */
const BUDGET_5_FIRST_ROOM: JourneyCount = { clicks: 3, pages: 4, typedFields: 2, decisions: 0 };

/** Each further room: the room's "Dashboard", then the next room's "Open chair room". */
const BUDGET_5_FURTHER_ROOM: JourneyCount = { clicks: 2, pages: 2, typedFields: 0, decisions: 0 };

/** Announcements or schedule from the dashboard: one click, one page. */
const BUDGET_5_ONWARDS: JourneyCount = { clicks: 1, pages: 1, typedFields: 0, decisions: 0 };

/** The running conference's committees, in the order its Rooms block lists them. */
const FIRST_ROOM_PATH = '/conferences/northbridge-running-today/committees/unsc/chair';
const SECOND_ROOM_PATH = '/conferences/northbridge-running-today/committees/sochum/chair';
const DASHBOARD_PATH = '/manage/northbridge-running-today';

/**
 * How long an assertion that waits on a page reading the database may take,
 * for the reason `manage-dashboard.spec.ts` gives.
 */
const DATABASE_TIMEOUT_MS = 15_000;

/** The difference between two counts, for a step measured from partway along the walk. */
function stepBetween(before: JourneyCount, after: JourneyCount): JourneyCount {
	return {
		clicks: after.clicks - before.clicks,
		pages: after.pages - before.pages,
		typedFields: after.typedFields - before.typedFields,
		decisions: after.decisions - before.decisions
	};
}

/** The dashboard's Rooms block, which `ManageSection` names after its title. */
function roomsBlock(page: Page): Locator {
	return page.getByRole('main').getByRole('region', { name: 'Rooms', exact: true });
}

/**
 * The Rooms block's "Open chair room" of the room at `index`, 0 being the
 * first. The rooms are a table on a computer and a list on a phone, both in
 * the page; `getByRole` finds only the links of the one the window shows.
 */
function openChairRoom(page: Page, index: number): Locator {
	return roomsBlock(page).getByRole('link', { name: 'Open chair room' }).nth(index);
}

/** Wait until the chair room at `path` is drawn, with its top bar's "Dashboard" link. */
async function expectChairRoom(page: Page, path: string): Promise<void> {
	await expect(page).toHaveURL(path, { timeout: DATABASE_TIMEOUT_MS });
	await expect(page.getByRole('link', { name: 'Dashboard', exact: true }).first()).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
}

test('budget 5: Eleanor reaches each room, the schedule and announcements from the dashboard', async ({
	page
}) => {
	const journey = await ClickBudgetJourney.signIn(page, ELEANOR);

	// Sign-in to the first room: `/home`'s hero, "Open dashboard", then the
	// Rooms block's first "Open chair room". The running conference is Eleanor's
	// hero, and on a conference day its button is her "Today" item's first link.
	await journey.click(
		page.getByRole('main').getByRole('link', { name: 'Open dashboard', exact: true })
	);
	await expect(page).toHaveURL(DASHBOARD_PATH, { timeout: DATABASE_TIMEOUT_MS });

	// Who is present where, read straight off the block with no click: each
	// sitting room's count, or that no roll call has been taken yet, or that
	// the room is not in session, and the total over every sitting room.
	const rooms = roomsBlock(page);

	await expect(rooms).toContainText(/\d+ of \d+|No roll call yet|Not in session/, {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(rooms).toContainText(/Present: \d+ of \d+ delegates in \d+ rooms? · As of/);

	await journey.click(openChairRoom(page, 0));
	await expectChairRoom(page, FIRST_ROOM_PATH);

	expect(journey.count(), 'Budget 5, sign-in to the first room').toEqual(BUDGET_5_FIRST_ROOM);
	journey.expectWithinBudget(BUDGET_5_FIRST_ROOM);

	// Each further room: this room's "Dashboard", then the next "Open chair room".
	const beforeSecondRoom = journey.count();

	await journey.click(page.getByRole('link', { name: 'Dashboard', exact: true }).first());
	await expect(page).toHaveURL(DASHBOARD_PATH, { timeout: DATABASE_TIMEOUT_MS });
	await journey.click(openChairRoom(page, 1));
	await expectChairRoom(page, SECOND_ROOM_PATH);

	expect(stepBetween(beforeSecondRoom, journey.count()), 'Budget 5, a further room').toEqual(
		BUDGET_5_FURTHER_ROOM
	);

	// Announcements or schedule, each one click from the dashboard: "Schedule"
	// heads the Today block, and "Post an announcement" is the panel's filled
	// button at the top. The dashboard is opened afresh for each, outside the
	// count.
	const main = page.getByRole('main');
	const todayBlock = main.getByRole('region', { name: 'Today', exact: true });
	const onwards = [
		{
			link: todayBlock.getByRole('link', { name: 'Schedule', exact: true }),
			label: 'Schedule',
			path: `${DASHBOARD_PATH}/schedule`
		},
		{
			link: main.getByRole('link', { name: 'Post an announcement', exact: true }),
			label: 'Post an announcement',
			path: `${DASHBOARD_PATH}/announcements`
		}
	];

	for (const goal of onwards) {
		await page.goto(DASHBOARD_PATH);

		const before = journey.count();

		await journey.click(goal.link);
		await expect(page).toHaveURL(goal.path, { timeout: DATABASE_TIMEOUT_MS });

		expect(stepBetween(before, journey.count()), `Budget 5, ${goal.label}`).toEqual(
			BUDGET_5_ONWARDS
		);
	}
});
