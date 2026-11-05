import { expect, type Locator, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { addScheduleCommittee, createScheduleConference } from './schedule-fixtures';
import { createTestUser, makeCommitteeChair, type TestUser } from './signed-in-user';

// What the chair's browser tests, such as `chair-room.spec.ts` and
// `motions.spec.ts`, set up before they open a page: a conference with one
// committee of three seats and a chair for it, a session running in its room,
// and a roll call of that session.
//
// The service-role client writes these rows the way the organiser's own forms
// would. It arranges the state a test begins in and is never used to show that
// something is allowed, which is what `tests/db/supabase-test-client.ts` warns
// against.

/** How long an assertion that waits on a page reading the database may take. */
export const DATABASE_TIMEOUT_MS = 15_000;

/** A committee with a named chair, the organiser who runs it, and its address. */
export type ChairedCommittee = {
	organiser: TestUser;
	chair: TestUser;
	conferenceId: string;
	conferenceSlug: string;
	committeeId: string;
	committeeSlug: string;
	roomPath: string;
};

/**
 * Make a conference, a committee in it with three seats, and a chair for it,
 * and answer everything a test needs to reach its room.
 */
export async function makeChairedCommittee(namePrefix: string): Promise<ChairedCommittee> {
	const organiser = await createTestUser(`${namePrefix} Organiser`);
	const chair = await createTestUser(`${namePrefix} Chair`);
	const conference = await createScheduleConference({ owner: organiser, namePrefix });
	const committeeId = await addScheduleCommittee(conference.id, {
		name: 'Security Council',
		abbreviation: 'UNSC',
		room: 'Room 1'
	});

	await makeCommitteeChair(chair, committeeId);

	const admin = createServiceRoleClient();

	const { data: committee, error: committeeError } = await admin
		.from('committees')
		.select('slug')
		.eq('id', committeeId)
		.single();

	if (committeeError || !committee) {
		throw new Error(`Could not read the committee back: ${committeeError?.message}`);
	}

	const { error: seatsError } = await admin.from('seats').insert([
		{ committee_id: committeeId, name: 'France', country_code: 'FR', position: 1 },
		{ committee_id: committeeId, name: 'Ghana', country_code: 'GH', position: 2 },
		{ committee_id: committeeId, name: 'Japan', country_code: 'JP', position: 3 }
	]);

	if (seatsError) {
		throw new Error(`Could not add the seats: ${seatsError.message}`);
	}

	return {
		organiser,
		chair,
		conferenceId: conference.id,
		conferenceSlug: conference.slug,
		committeeId,
		committeeSlug: committee.slug,
		roomPath: `/conferences/${conference.slug}/committees/${committee.slug}/chair`
	};
}

/** The room's `committee_state` row, as the chair tests check it. */
export async function readCommitteeState(committeeId: string) {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('committee_state')
		.select('*')
		.eq('committee_id', committeeId)
		.single();

	if (error || !data) {
		throw new Error(`Could not read the committee state: ${error?.message}`);
	}

	return data;
}

/** The console's mode bar along the bottom of every chair page while a session runs (S3). */
export function modeBar(page: Page): Locator {
	return page.getByRole('navigation', { name: 'Modes' });
}

/**
 * One view of the mode bar, by its label: "GSL", "Motions" or "Vote". The
 * live view's name ends in ", live" and "Motions 2" carries its count, so the
 * label is matched at the start of the name.
 */
export function modeBarTab(page: Page, label: string): Locator {
	return modeBar(page).getByRole('link', { name: new RegExp(`^${label}\\b`) });
}

/**
 * Open the committee menu, `⋯` in the top bar, unless it is open already. A
 * click that lands before the page's script has started can be undone when
 * Svelte takes the page over and sets the menu to its own closed state, so
 * the menu is opened again until its items show.
 */
export async function openCommitteeMenu(page: Page): Promise<Locator> {
	const menu = page.locator('details[data-committee-menu]');
	const items = menu.getByRole('navigation', { name: 'Committee' });

	await expect(async () => {
		if ((await menu.getAttribute('open')) === null) {
			await page.getByRole('banner').getByLabel('Committee menu').click();
		}
		await expect(items).toBeVisible({ timeout: 1_000 });
	}).toPass({ timeout: DATABASE_TIMEOUT_MS });

	return items;
}

/**
 * Wait until the console's script runs: the top bar's connection says
 * "Connected" (or "Reconnecting…") only once the page's script has started
 * and listens to the room. A key pressed before that reaches no listener, and
 * End followed before it is the plain link to `?end=confirm`.
 */
export async function waitForConsoleScript(page: Page): Promise<void> {
	await expect(page.getByRole('banner').getByText(/^(Connected|Reconnecting…)$/)).toBeAttached({
		timeout: DATABASE_TIMEOUT_MS
	});
}

/** The tab names the tests used before the console's mode bar (S3), by what replaced them. */
const RENAMED_TABS: Record<string, string> = { Voting: 'Vote', Speakers: 'GSL' };

/** The pages that moved from the old tab row into the committee menu (S3). */
const COMMITTEE_MENU_PAGES = ['Papers', 'Notes', 'Awards'];

/**
 * Go to one of the chair's pages the way a chair does: a view through the
 * mode bar ("GSL", "Motions", "Vote"), Papers, Notes and Awards through the
 * committee menu, and "Room", the live room, through the tab of the live view.
 * The names of the old tab row ("Voting", "Speakers") still work.
 */
export async function pressChairTab(page: Page, tabName: string): Promise<void> {
	if (COMMITTEE_MENU_PAGES.includes(tabName)) {
		const menu = await openCommitteeMenu(page);
		await menu.getByRole('link', { name: tabName }).click();
		return;
	}

	if (tabName === 'Room') {
		await modeBar(page)
			.getByRole('link', { name: /, live$/ })
			.click();
		return;
	}

	await modeBarTab(page, RENAMED_TABS[tabName] ?? tabName).click();
}

/**
 * Press End and answer "End Session 1?" in place, on the mode bar or, on a
 * phone, from the committee menu. Without JavaScript End is a link to the
 * same page with `?end=confirm`, which draws the same question. Waits for the
 * live room's ended screen, "{session} has ended" (S11).
 */
export async function endSessionFromFrame(page: Page): Promise<void> {
	const endInBar = modeBar(page).getByRole('link', { name: 'End', exact: true });

	if (await endInBar.isVisible()) {
		await endInBar.click();
	} else {
		const menu = await openCommitteeMenu(page);
		await menu.getByRole('link', { name: 'End', exact: true }).click();
	}

	await page.getByRole('button', { name: 'End session' }).click();
	await expect(page.getByRole('heading', { level: 1, name: / has ended$/ })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(page);
}

/**
 * Open the room and wait for it to be drawn: the console's top bar names the
 * committee, "UNSC", with its full name as the title (S3).
 */
export async function openRoom(page: Page, roomPath: string): Promise<void> {
	await page.goto(roomPath);
	await expect(page.getByRole('banner').getByTitle('Security Council')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
}

/**
 * Wait until no button on the page is still waiting for the server (T124), and
 * no instant form still has presses on their way (`data-sending`, T140).
 * With JavaScript a press shows its result at once, before the server has
 * saved it, so a test that reads the database next waits here first. Without
 * JavaScript the page has already reloaded, so this returns straight away.
 */
export async function waitUntilAnswered(page: Page): Promise<void> {
	await expect(page.locator('[aria-busy="true"], [data-sending]')).toHaveCount(0, {
		timeout: DATABASE_TIMEOUT_MS
	});
}

/**
 * Press the lobby's or the ended screen's start button on a room with none
 * running, and wait for the session.
 */
export async function startSession(page: Page): Promise<void> {
	// The lobby's one button names the session it starts: "Start Session 1", or
	// "Start a practice session" before the conference's first day. The ended
	// screen's is "Start Session 2", or "Start another session" after the last
	// day and "Start another practice session" after a practice session (S11).
	const startButton = page.getByRole('button', {
		name: /^Start (Session \d+|a practice session|another session|another practice session)$/
	});
	await startButton.click();
	// The console's mode bar is drawn only while a session runs (S3).
	await expect(modeBar(page)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
}

/**
 * Press "Mark all present" on the opening band above the GSL view (S5), and
 * wait for its roll call row to tick off: "3 of 3 present · quorum met". The
 * band stays until the first speaker is called.
 */
export async function markAllPresent(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Mark all present' }).click();
	await expect(page.getByText(/\d+ of \d+ present · (quorum met|no quorum)$/)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(page);
}

/** Record a roll call of the running session, marking `absentSeat` absent and the rest present. */
export async function takeRollCall(room: ChairedCommittee, absentSeat: string): Promise<void> {
	const admin = createServiceRoleClient();
	const state = await readCommitteeState(room.committeeId);
	const { data: seats } = await admin
		.from('seats')
		.select('id, name')
		.eq('committee_id', room.committeeId);
	const { data: rollCall, error } = await admin
		.from('roll_calls')
		.insert({ session_id: state.current_session_id ?? '', taken_by: room.chair.id })
		.select('id')
		.single();

	if (error || !rollCall) throw new Error(`Could not take the roll call: ${error?.message}`);

	const entries = (seats ?? []).map((seat) => ({
		roll_call_id: rollCall.id,
		seat_id: seat.id,
		status: seat.name === absentSeat ? ('absent' as const) : ('present' as const)
	}));
	const { error: entriesError } = await admin.from('roll_call_entries').insert(entries);

	if (entriesError) throw new Error(`Could not mark the seats: ${entriesError.message}`);
}
