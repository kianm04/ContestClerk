import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { DATABASE_TIMEOUT_MS, waitUntilAnswered } from './chair-room-fixtures';
import { waitForChairScript } from './chair-script';
import { ClickBudgetJourney } from './click-budget';
import { FIONA, restoreSeedRows, snapshotSeedRows, type SeedRowSnapshot } from './walkthrough-seed';

// Budget 2 (specs/05-pages/chair/committee-room.md, "Click budgets this page
// owns", S11): Fiona chairs the Security Council of "running today", in
// session on day 2 of 3. From `/login` to an award proposed takes at most 10
// clicks, 4 pages, 2 typed fields and 0 decisions. At 1280 the walk is sign
// in, "Open chair room", Suspend, End, "End session", "Propose awards", seat,
// award, "Propose": 9 · 4 · 2 · 0. At 390 Suspend is in the committee menu and
// End is on the suspended screen: 10 · 4 · 2 · 0. The ended screen's "Propose
// awards" sits beside "Start Session 2". The walk starts at `/home`'s live
// card, whose first link for Fiona is her running session (T169).
//
// The walk ends the seed's running session and proposes an award, so it puts
// the seed's rows back afterwards. One `committee_state` row cannot be shared
// by three projects running at once, so the walk runs in the desktop project
// only and walks both widths in turn, putting the rows back between them.

/** The Security Council of "Northbridge MUN (running today)" in the walkthrough seed. */
const SECURITY_COUNCIL_ID = 'f3000000-0000-4000-8000-000000000051';

/** Budget 2's ceiling: 10 clicks, 4 pages, 2 typed fields, 0 decisions. */
const BUDGET_2 = { clicks: 10, pages: 4, typedFields: 2, decisions: 0 };

/** The two widths every budget is walked at, with the design's own walk at each. */
const WIDTHS = [
	{
		name: 'desktop',
		viewport: { width: 1280, height: 800 },
		designWalk: { clicks: 9, pages: 4, typedFields: 2, decisions: 0 }
	},
	{
		name: 'phone',
		viewport: { width: 390, height: 844 },
		designWalk: { clicks: 10, pages: 4, typedFields: 2, decisions: 0 }
	}
];

/** The seed rows the walk changes: the session it ends, the award it adds, and the room itself. */
type SeedState = {
	sessions: SeedRowSnapshot;
	awards: SeedRowSnapshot;
	committeeState: Record<string, unknown>;
};

/** Read the rows the walk is about to change. */
async function keepSeedState(): Promise<SeedState> {
	const scope = { column: 'committee_id', value: SECURITY_COUNCIL_ID };
	const sessions = await snapshotSeedRows({ table: 'committee_sessions', ...scope });
	const awards = await snapshotSeedRows({ table: 'awards', ...scope });

	// `committee_state` is keyed on its committee rather than an `id`, so it is
	// kept and put back here rather than by `snapshotSeedRows`.
	const admin = createServiceRoleClient();
	const { data, error } = await admin
		.from('committee_state')
		.select('*')
		.eq('committee_id', SECURITY_COUNCIL_ID)
		.single();

	if (error || !data) throw new Error(`Could not read the room to keep: ${error?.message}`);

	return { sessions, awards, committeeState: data };
}

/** Put the rows back as `keepSeedState` found them. */
async function restoreSeedState(kept: SeedState): Promise<void> {
	await restoreSeedRows(kept.awards);
	await restoreSeedRows(kept.sessions);

	const admin = createServiceRoleClient();
	const { error } = await admin
		.from('committee_state')
		.update(kept.committeeState)
		.eq('committee_id', SECURITY_COUNCIL_ID);

	if (error) throw new Error(`Could not put the room back: ${error.message}`);
}

/** The label of the first option in the award form's "Seat" list that names `seatName`. */
async function seatOptionLabel(page: Page, seatName: string): Promise<string> {
	const option = page.getByLabel('Seat').locator('option', { hasText: seatName }).first();

	return (await option.innerText()).trim();
}

/** Walk budget 2 once, from `/login` to the award proposed, counting every step. */
async function walkBudget2(page: Page, testInfo: TestInfo): Promise<ClickBudgetJourney> {
	const journey = await ClickBudgetJourney.signIn(page, FIONA);

	// The hero of `/home` on a conference day: its one button is the first link of
	// Fiona's most urgent "Today" item, her room with Session 1 in progress.
	const home = page.getByRole('main');
	await expect(home.getByText(/^Running now/)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await journey.click(home.getByRole('link', { name: 'Open chair room', exact: true }));
	await expect(page.getByRole('heading', { name: 'UNSC', level: 1 })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	// Suspend pressed before the page's script is live posts the form and loads
	// the answer as a new page, the walk without JavaScript, which is not the
	// walk this budget counts.
	await waitForChairScript(page, testInfo);

	// Suspend: in the mode bar at 1280; on a phone, in the committee menu.
	const modes = page.getByRole('navigation', { name: 'Modes' });
	const suspendInBar = modes.getByRole('button', { name: 'Suspend' });
	const isPhone = !(await suspendInBar.isVisible());

	if (isPhone) {
		await journey.click(page.getByRole('banner').getByLabel('Committee menu'));
		await journey.click(
			page.getByRole('navigation', { name: 'Committee' }).getByRole('button', { name: 'Suspend' })
		);
	} else {
		await journey.click(suspendInBar);
	}

	const main = page.getByRole('main');
	await expect(main.getByRole('heading', { level: 1, name: /^Suspended/ })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// End asks in place: in the mode bar at 1280, and from the suspended screen on a phone.
	if (isPhone) {
		await journey.click(main.getByRole('link', { name: 'End session' }));
	} else {
		await journey.click(modes.getByRole('link', { name: 'End', exact: true }));
	}
	await journey.click(page.getByRole('button', { name: 'End session' }));

	await expect(main.getByRole('button', { name: 'Start Session 2' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await journey.click(main.getByRole('link', { name: 'Propose awards' }));

	const form = main
		.locator('form')
		.filter({ has: page.getByRole('button', { name: 'Propose', exact: true }) });
	await expect(form).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	// "End session" may still be on its way: its answer reads the Awards page
	// again rather than pulling Fiona back to the room (T169). A proposal sent
	// while that reading loads can lose its toast to it, so the walk waits for
	// it, as a chair choosing a seat and an award does anyway.
	await waitUntilAnswered(page);
	await expect(page).toHaveURL(/\/chair\/awards$/);
	await journey.choose(form.getByLabel('Seat'), await seatOptionLabel(page, 'China'));
	await journey.choose(form.getByLabel('Award'), 'Best Delegate');
	await journey.click(form.getByRole('button', { name: 'Propose', exact: true }));

	await expect(page.getByText('Award proposed.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	return journey;
}

test('budget 2: Fiona ends the running session and proposes an award, on both widths', async ({
	page
}, testInfo) => {
	test.skip(
		testInfo.project.name !== 'desktop',
		'One committee_state row cannot be shared by three projects.'
	);

	for (const width of WIDTHS) {
		const kept = await keepSeedState();

		try {
			await page.context().clearCookies();
			await page.setViewportSize(width.viewport);

			const journey = await walkBudget2(page, testInfo);

			expect(journey.count(), `The walk at ${width.name} width`).toEqual(width.designWalk);
			journey.expectWithinBudget(BUDGET_2);
		} finally {
			// In a `finally`, so that a failed step still leaves the seed as the next test expects.
			await restoreSeedState(kept);
		}
	}
});
