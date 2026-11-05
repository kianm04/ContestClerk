import { expect, test, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	DATABASE_TIMEOUT_MS,
	makeChairedCommittee,
	waitUntilAnswered,
	type ChairedCommittee
} from './chair-room-fixtures';
import { ClickBudgetJourney, type JourneyCount } from './click-budget';
import { expectNoSidewaysOverflow, expectOnFirstScreen } from './page-shape';
import { giveConferenceEvent, removeScheduleEvent } from './signed-in-user';
import {
	JAMES,
	MAYA,
	SAMUEL,
	TOM,
	restoreSeedRows,
	snapshotSeedRows,
	type SeedRowSnapshot
} from './walkthrough-seed';

// T169: `/home` leads to today's work (specs/05-pages/delegate/home.md and
// specs/05-pages/chair/committee-room.md, each "Streamlining"). Every budget is
// walked with the click-budget helper on the reader, conference and day
// `specs/03-design/streamlining/design.md` names for it ("Where each budget is
// walked"), counting clicks · pages · typed fields · decisions.
//
// The walks that only follow links (James, Maya, Tom) run on all three
// projects. Samuel's walk starts a session in the seed's Human Rights Council,
// one `committee_state` row that three projects cannot share, so it runs in
// the desktop project only and walks both widths in turn, putting the rows
// back between them. His first-day walk has a conference of its own, made by
// the fixture, so it runs on every project.

/** The Human Rights Council of "Northbridge MUN (about to start)", which Samuel chairs. */
const HUMAN_RIGHTS_COUNCIL_ID = 'f3000000-0000-4000-8000-000000000041';

/** The second of the Human Rights Council's two topics in the seed, which Samuel's walk sets. */
const HUMAN_RIGHTS_COUNCIL_TOPIC = 'Freedom of expression online';

/** "Northbridge MUN (running today)", where Tom volunteers. */
const RUNNING_TODAY_ID = 'f2000000-0000-4000-8000-000000000005';

/** Budget 1a's ceiling, and the design's walk of it: 3 clicks, 3 pages, 2 typed, 0 decisions. */
const BUDGET_1A: JourneyCount = { clicks: 3, pages: 3, typedFields: 2, decisions: 0 };

/**
 * Budget 1's ceiling and walk: budget 1a, then the opening band's "Mark all
 * present" and one press on a topic (S5): 5 (+N) · 3 · 2 · 0. The committees
 * here have two topics, so the topic is one press, and N is 0.
 */
const BUDGET_1: JourneyCount = { clicks: 5, pages: 3, typedFields: 2, decisions: 0 };

/** Budget 6a's ceiling, and the design's walk of it. */
const BUDGET_6A: JourneyCount = { clicks: 2, pages: 3, typedFields: 2, decisions: 0 };

/** Budget 6b: each of the paper, the invoice and the schedule is one click and one page from `/home`. */
const BUDGET_6B_STEP: JourneyCount = { clicks: 1, pages: 1, typedFields: 0, decisions: 0 };

/** Budget 9's ceiling: 3 clicks, 4 pages, 2 typed, 0 decisions. */
const BUDGET_9: JourneyCount = { clicks: 3, pages: 4, typedFields: 2, decisions: 0 };

/** The two topics the first-day fixture committee debates, so the agenda has a choice. */
const TOPICS = ['Climate finance', 'Protection of civilians'];

/** The two widths Samuel's walk is taken at in turn: a laptop, then a phone. */
const WIDTHS = [
	{ name: 'desktop', viewport: { width: 1280, height: 800 } },
	{ name: 'phone', viewport: { width: 390, height: 844 } }
];

/**
 * How long the event Tom's walk puts on today's programme lasts, and how long
 * ago it started: under way now, and over two hours from now, however late the
 * run is.
 */
const TOM_EVENT_STARTED_AGO_MS = 5 * 60 * 1000;
const TOM_EVENT_LASTS_MS = 2 * 60 * 60 * 1000;

// The hero (`docs/home.md`, section 4): the page's one filled button is in the
// panel at the top. On a conference day it is the first link of the reader's
// most urgent "Today" item, "Open live room", "Open chair room" or "Open
// dashboard"; otherwise the first pressing task's verb, with the reader's door
// into the conference as the text link beside it; otherwise that door itself.
// Each of those is a link named by its words, found inside `<main>`.

/** The difference between two counts, for a step measured from `/home` rather than from sign-in. */
function stepBetween(before: JourneyCount, after: JourneyCount): JourneyCount {
	return {
		clicks: after.clicks - before.clicks,
		pages: after.pages - before.pages,
		typedFields: after.typedFields - before.typedFields,
		decisions: after.decisions - before.decisions
	};
}

/** The rows Samuel's walk changes: the sessions it starts (with everything under them) and the room. */
type RoomRows = {
	sessions: SeedRowSnapshot;
	committeeState: Record<string, unknown>;
};

/** Read the Human Rights Council's sessions and room state as they are now. */
async function keepRoomRows(): Promise<RoomRows> {
	const sessions = await snapshotSeedRows({
		table: 'committee_sessions',
		column: 'committee_id',
		value: HUMAN_RIGHTS_COUNCIL_ID
	});

	// `committee_state` is keyed on its committee rather than an `id`, so it is
	// kept and put back here rather than by `snapshotSeedRows`.
	const admin = createServiceRoleClient();
	const { data, error } = await admin
		.from('committee_state')
		.select('*')
		.eq('committee_id', HUMAN_RIGHTS_COUNCIL_ID)
		.single();

	if (error || !data) throw new Error(`Could not read the room to keep: ${error?.message}`);

	return { sessions, committeeState: data };
}

/**
 * Put the room back first, so that it points at no session the walk added,
 * then remove those sessions. A roll call, a speakers' list and the notes all
 * belong to their session and go with it (`on delete cascade`).
 */
async function restoreRoomRows(kept: RoomRows): Promise<void> {
	const admin = createServiceRoleClient();
	const { error } = await admin
		.from('committee_state')
		.update(kept.committeeState)
		.eq('committee_id', HUMAN_RIGHTS_COUNCIL_ID);

	if (error) throw new Error(`Could not put the room back: ${error.message}`);

	await restoreSeedRows(kept.sessions);
}

/**
 * Take roll call and set the agenda to `topic` on the opening band above the
 * GSL (S5), counting each step: one press each.
 */
async function openTheSession(
	page: Page,
	journey: ClickBudgetJourney,
	topic: string
): Promise<void> {
	const band = page.getByRole('region', { name: 'Before debate' });

	await journey.click(band.getByRole('button', { name: 'Mark all present' }));
	await expect(band.getByText(/\d+ of \d+ present · (quorum met|no quorum)$/)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	await journey.click(band.getByRole('button', { name: topic }));

	// Both rows ticked off; the band stays until the first speaker is called.
	await expect(band.getByRole('link', { name: 'Change' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	// The screen shows the agenda set before the server has saved it, so the
	// room is put back only once it has, or the late save would outlast it.
	await waitUntilAnswered(page);
}

/** A `YYYY-MM-DD` day as it is now in `timezone`, which is how the database stores a day. */
function todayIn(timezone: string): string {
	// The `en-CA` locale writes a date as `YYYY-MM-DD`.
	return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
}

/**
 * Make the fixture conference start today, as a draft so that it stays out of
 * the public lists other browser tests count, and give its committee two topics.
 */
async function makeItTheFirstDay(room: ChairedCommittee): Promise<void> {
	const admin = createServiceRoleClient();
	const { data: conference, error: readError } = await admin
		.from('conferences')
		.select('timezone')
		.eq('id', room.conferenceId)
		.single();

	if (readError || !conference)
		throw new Error(`Could not read the conference: ${readError?.message}`);

	const today = todayIn(conference.timezone);
	const { error: moveError } = await admin
		.from('conferences')
		.update({ start_date: today, end_date: today, status: 'draft' })
		.eq('id', room.conferenceId);

	if (moveError) throw new Error(`Could not move the conference: ${moveError.message}`);

	const { error: topicsError } = await admin
		.from('committees')
		.update({ topics: TOPICS })
		.eq('id', room.committeeId);

	if (topicsError) throw new Error(`Could not give the topics: ${topicsError.message}`);
}

test('budgets 1a and 1: Samuel starts a practice session through "My committees", on both widths', async ({
	page
}, testInfo) => {
	test.skip(
		testInfo.project.name !== 'desktop',
		'One committee_state row cannot be shared by three projects.'
	);

	for (const width of WIDTHS) {
		const kept = await keepRoomRows();

		try {
			await page.context().clearCookies();
			await page.setViewportSize(width.viewport);

			const journey = await ClickBudgetJourney.signIn(page, SAMUEL);
			const main = page.getByRole('main');

			// Four days before, nothing of Samuel's runs today. The two papers waiting
			// for him take the hero's button ("Review papers"), and the way into his
			// room is the door beside it, the text link "Open chair room".
			await journey.click(main.getByRole('link', { name: 'Open chair room', exact: true }));
			await journey.click(main.getByRole('button', { name: 'Start a practice session' }));
			await expect(main.getByRole('heading', { name: 'Before debate' })).toBeVisible({
				timeout: DATABASE_TIMEOUT_MS
			});

			expect(journey.count(), `Budget 1a at ${width.name} width`).toEqual(BUDGET_1A);

			await openTheSession(page, journey, HUMAN_RIGHTS_COUNCIL_TOPIC);

			expect(journey.count(), `Budget 1 at ${width.name} width`).toEqual(BUDGET_1);
			journey.expectWithinBudget(BUDGET_1);
		} finally {
			// In a `finally`, so that a failed step still leaves the seed as the next test expects.
			await restoreRoomRows(kept);
		}
	}
});

test('budgets 1a and 1 on the first day: a chair starts Session 1 from the hero', async ({
	page
}) => {
	const room = await makeChairedCommittee('First Day MUN');
	await makeItTheFirstDay(room);

	const journey = await ClickBudgetJourney.signIn(page, room.chair);
	const main = page.getByRole('main');

	// The hero's label says the conference runs, and its button is the room.
	await expect(main.getByText(/^Running now/)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await journey.click(main.getByRole('link', { name: 'Open chair room', exact: true }));

	await journey.click(main.getByRole('button', { name: 'Start Session 1' }));
	await expect(main.getByRole('heading', { name: 'Before debate' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	expect(journey.count(), 'Budget 1a on the first day').toEqual(BUDGET_1A);

	await openTheSession(page, journey, TOPICS[1]);

	expect(journey.count(), 'Budget 1 on the first day').toEqual(BUDGET_1);
	journey.expectWithinBudget(BUDGET_1);
});

test('budget 6a: James opens the live room from the hero on day 2 of 3', async ({ page }) => {
	const journey = await ClickBudgetJourney.signIn(page, JAMES);
	const main = page.getByRole('main');

	// The hero's button says "Open live room" whether or not Session 1 is running
	// (the awards walk ends that session for a moment in the desktop project).
	const liveButton = main.getByRole('link', { name: 'Open live room', exact: true });

	await expect(liveButton).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await journey.click(liveButton);

	await expect(page).toHaveURL(/\/committees\/unsc\/live$/, { timeout: DATABASE_TIMEOUT_MS });

	expect(journey.count()).toEqual(BUDGET_6A);
	journey.expectWithinBudget(BUDGET_6A);
});

test('budget 6b: Maya reaches her paper, her invoice and her schedule in one click each', async ({
	page
}) => {
	const journey = await ClickBudgetJourney.signIn(page, MAYA);
	const main = page.getByRole('main');

	// Each goal is one step from `/home`, so each is measured from there. The
	// paper and the invoice are tasks, each with its verb as a link: whichever
	// is due sooner is the hero's button, the other a "To do" row, and either
	// way each verb is on the page once.
	const goals = [
		{
			link: main.getByRole('link', { name: 'Write paper', exact: true }),
			arrivesAt: /\/committees\/hrc\/position-paper$/
		},
		{
			link: main.getByRole('link', { name: 'Pay invoice', exact: true }),
			arrivesAt: /\/invoices\/[^/]+$/
		},
		// The schedule is the "Programme" section's "Full schedule", on both
		// widths. It goes to `/schedule`, which sends Maya straight on to her
		// conference's schedule without a page between. `exact`, because a
		// region's name is matched as a substring and a conference day draws a
		// "Today's programme" region.
		{
			link: main
				.getByRole('region', { name: 'Programme', exact: true })
				.getByRole('link', { name: 'Full schedule', exact: true }),
			arrivesAt: /\/conferences\/[^/]+\/schedule$/
		}
	];

	for (const goal of goals) {
		await page.goto('/home');
		await expect(goal.link).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

		const before = journey.count();
		await journey.click(goal.link);
		await expect(page).toHaveURL(goal.arrivesAt, { timeout: DATABASE_TIMEOUT_MS });

		expect(stepBetween(before, journey.count())).toEqual(BUDGET_6B_STEP);
	}
});

test('budget 9: Tom reaches the schedule from the hero and an announcement', async ({
	page
}, testInfo) => {
	// The bell's panel is a shadcn popover, which only JavaScript opens.
	test.skip(testInfo.project.use.javaScriptEnabled === false, 'The bell needs JavaScript.');

	// The seed's "Welcome to day two" comes out at half past seven in London, and
	// the bell shows nothing dated later than now, so before then it is not there
	// yet. The walk brings its own announcement, out a minute ago, named for its
	// project because all three projects walk as Tom at once.
	const title = `Welcome to day two (${testInfo.project.name})`;
	const notificationId = await notifyTom(title);

	// A volunteer has no room, so the hero's button is the conference's page and
	// the text link beside it is "Today's programme", the schedule in one press.
	// The "Today's programme" section under the hero is drawn only while
	// something is left on today's programme, and the walk checks it is there:
	// the seed's last event of "running today" ends at ten in the evening, so
	// the walk brings its own event, under way now, named for its project
	// because all three projects walk as Tom at once.
	const eventId = await giveConferenceEvent({
		conferenceId: RUNNING_TODAY_ID,
		title: `Volunteers' briefing (${testInfo.project.name})`,
		startsAt: new Date(Date.now() - TOM_EVENT_STARTED_AGO_MS).toISOString(),
		endsAt: new Date(Date.now() + TOM_EVENT_LASTS_MS).toISOString(),
		location: 'Front desk'
	});

	try {
		await walkTomToTheAnnouncement(page, title);
	} finally {
		await removeScheduleEvent(eventId);
		await removeNotification(notificationId);
	}
});

/** Give Tom an unread announcement of "running today", published a minute ago, and answer its id. */
async function notifyTom(title: string): Promise<string> {
	const admin = createServiceRoleClient();
	const aMinuteAgo = new Date(Date.now() - 60 * 1000);
	const { data, error } = await admin
		.from('notifications')
		.insert({
			user_id: TOM.id,
			conference_id: RUNNING_TODAY_ID,
			kind: 'announcement',
			title,
			link_path: '/conferences/northbridge-running-today/announcements',
			created_at: aMinuteAgo.toISOString()
		})
		.select('id')
		.single();

	if (error || !data) throw new Error(`Could not notify Tom: ${error?.message}`);

	return data.id;
}

/** Delete the notification `notifyTom` made. */
async function removeNotification(notificationId: string): Promise<void> {
	const admin = createServiceRoleClient();
	const { error } = await admin.from('notifications').delete().eq('id', notificationId);

	if (error) throw new Error(`Could not remove the notification: ${error.message}`);
}

/** Budget 9's walk: Tom signs in, opens his schedule from the hero, and reads `title` in the bell. */
async function walkTomToTheAnnouncement(page: Page, title: string): Promise<void> {
	const journey = await ClickBudgetJourney.signIn(page, TOM);

	// Every address the tab shows from here on, to prove no "Manage" page and no
	// public conference page is on the way. The conference's schedule is where the
	// walk goes, and shows Tom the staff events as well as everyone's.
	const addresses: string[] = [];
	page.on('framenavigated', (frame) => {
		if (frame === page.mainFrame()) addresses.push(new URL(frame.url()).pathname);
	});

	const main = page.getByRole('main');
	await expect(main.getByText(/^Volunteer · /)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(main.getByRole('region', { name: "Today's programme" })).toBeVisible();
	await journey.click(main.getByRole('link', { name: "Today's programme", exact: true }));
	await expect(page).toHaveURL(/\/conferences\/northbridge-running-today\/schedule$/, {
		timeout: DATABASE_TIMEOUT_MS
	});

	// The day's announcement is in the bell. Opening it is the third click, and
	// the title is on its row, so reading it needs no fourth: pressing the row
	// would open the announcements page and mark the notification read.
	// The open panel is drawn over the page rather than inside the bar, and
	// `data-slot` is the name shadcn gives each of its parts.
	await journey.click(page.getByRole('banner').getByLabel(/^Notifications/));
	await expect(page.locator('[data-slot="popover-content"]').getByText(title)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	expect(addresses.filter((path) => path.startsWith('/manage'))).toEqual([]);
	const conferencePages = addresses.filter((path) => path.startsWith('/conferences'));
	expect(conferencePages.filter((path) => !path.endsWith('/schedule'))).toEqual([]);
	journey.expectWithinBudget(BUDGET_9);
}

test("on a phone the greeting comes first, with the hero's button in the first screen, and nothing spills sideways", async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	await ClickBudgetJourney.signIn(page, JAMES);

	const main = page.getByRole('main');
	// The greeting is a `<p>` in the title row; the `<h1>` is the conference.
	const greeting = main.getByText(/^Good (morning|afternoon|evening), James\./);
	const liveButton = main.getByRole('link', { name: 'Open live room', exact: true });

	await expect(liveButton).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	const greetingBox = await greeting.boundingBox();
	const buttonBox = await liveButton.boundingBox();

	if (greetingBox === null || buttonBox === null) {
		throw new Error("The greeting or the hero's button is not on the page.");
	}

	// The greeting first, then the hero with its button in the first screen.
	expect(greetingBox.y).toBeLessThan(buttonBox.y);
	await expectOnFirstScreen(page, liveButton);
	await expectNoSidewaysOverflow(page);
});
