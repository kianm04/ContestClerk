import { expect, test, type Page } from '@playwright/test';
import { createClientForAccessToken, createServiceRoleClient } from '../db/supabase-test-client';
import { readAccessTokenFromCookies } from './browser-session';
import { makeChairedCommittee } from './chair-room-fixtures';
import { expectNoSidewaysOverflow } from './page-shape';
import { createTestUser, signIn } from './signed-in-user';

// The quick session parts of `/home` (`docs/home.md`, sections 3.1 and 3.9):
// "Run a quick session" at the right of the greeting for a reader who chairs a
// committee and has no quick session yet, the "Quick sessions" section for a
// reader with one, and a quick session nowhere else on the page. Every test
// makes its own account and its own quick sessions, so they can run side by
// side. The page is all links, so every test works the same on the
// `desktop-no-js` project.

/** How long an assertion that waits on a page reading the database may take (see `home.spec.ts`). */
const DATABASE_TIMEOUT_MS = 15_000;

/** How many rows the section draws before "Show all {n}": `QUICK_SESSION_LIMIT` in `$lib/home-rows`. */
const QUICK_SESSIONS_IN_VIEW = 3;

/** One day, for moving a conference made by a fixture about in time. */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** How far ahead the chair's conference starts, so the page counts them as a chair of something to come. */
const DAYS_UNTIL_CONFERENCE = 30;

/**
 * Make `count` quick sessions as the signed-in account, through the same
 * `create_quick_session` "Start session" calls, named "Practice 1", "Practice
 * 2" and so on. Each starts its "Session 1" at once. The account's own session,
 * read from the browser, makes them, so they are its own as they would be.
 */
async function makeQuickSessions(page: Page, count: number): Promise<void> {
	const accessToken = readAccessTokenFromCookies(await page.context().cookies());
	const asTheReader = createClientForAccessToken(accessToken);

	for (let number = 1; number <= count; number += 1) {
		const { error } = await asTheReader.rpc('create_quick_session', {
			committee_name: `Practice ${number}`,
			committee_slug: `practice-${number}`,
			topic: null,
			speaking_time_seconds: 90,
			seats: [
				{ name: 'France', country_code: 'FR' },
				{ name: 'Germany', country_code: 'DE' }
			],
			timezone: 'Europe/Amsterdam'
		});

		if (error) throw new Error(`Could not make a quick session: ${error.message}`);
	}
}

/**
 * Move a conference `makeChairedCommittee` made, which ran in 2020, to a month
 * from now with its applications shut yesterday, so the chair's committee is
 * one that is still to come and the conference stays out of the cards other
 * tests count.
 */
async function moveIntoTheFuture(conferenceId: string): Promise<void> {
	const firstDay = new Date(Date.now() + DAYS_UNTIL_CONFERENCE * ONE_DAY_MS);
	const lastDay = new Date(firstDay.getTime() + 2 * ONE_DAY_MS);

	const { error } = await createServiceRoleClient()
		.from('conferences')
		.update({
			start_date: firstDay.toISOString().slice(0, 10),
			end_date: lastDay.toISOString().slice(0, 10),
			applications_close_at: new Date(Date.now() - ONE_DAY_MS).toISOString()
		})
		.eq('id', conferenceId);

	if (error) {
		throw new Error(`Could not move the test conference: ${error.message}`);
	}
}

/** Take a test conference away again, with its organisation. Everything in it follows. */
async function deleteTestConference(conferenceId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { data: conference } = await admin
		.from('conferences')
		.select('organization_id')
		.eq('id', conferenceId)
		.single();

	await admin.from('conferences').delete().eq('id', conferenceId);

	if (conference) {
		await admin.from('organizations').delete().eq('id', conference.organization_id);
	}
}

test('offers a chair with no quick session "Run a quick session" at the right of the greeting', async ({
	page
}) => {
	const room = await makeChairedCommittee('Home quick MUN');

	await moveIntoTheFuture(room.conferenceId);

	try {
		await signIn(page, room.chair);
		await page.goto('/home');

		const main = page.getByRole('main');
		const link = main.getByRole('link', { name: 'Run a quick session', exact: true });

		await expect(link).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		// Anchored at the end only: `resolve()` writes the server's links relative
		// (`./quick/new`), and without JavaScript nothing rewrites them.
		await expect(link).toHaveAttribute('href', /\/quick\/new$/);

		// The title row holds one link at most, and a chair's is this one rather
		// than "Create a conference". The account menu in the top bar has its own
		// "Create a conference", which is why this is looked for in `<main>`.
		await expect(main.getByRole('link', { name: 'Create a conference', exact: true })).toHaveCount(
			0
		);
	} finally {
		// In a `finally`, so that a failed assertion still takes the conference away.
		await deleteTestConference(room.conferenceId);
	}
});

test('lists quick sessions under "Quick sessions" alone, the fourth behind "Show all 4"', async ({
	page
}) => {
	const user = await createTestUser();
	await signIn(page, user);
	await makeQuickSessions(page, 4);
	await page.goto('/home');

	const main = page.getByRole('main');
	const section = main.getByRole('region', { name: 'Quick sessions' });

	await expect(section).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	// The section's own title link is the way to a new one, so the title row
	// offers nothing beside the greeting.
	await expect(
		section.getByRole('link', { name: 'New quick session', exact: true })
	).toHaveAttribute('href', /\/quick\/new$/);
	await expect(main.getByRole('link', { name: 'Run a quick session', exact: true })).toHaveCount(0);

	// Three rows in view, each the committee's name, its status line, the
	// "In progress" word with its dot while its session runs, and "Open chair
	// room" as the text link. The address is matched at its end, since the
	// server writes it relative (`./conferences/quick-…/chair`) until the
	// client's router takes over.
	const roomLinks = section.getByRole('link', { name: 'Open chair room', exact: true });

	await expect(roomLinks).toHaveCount(QUICK_SESSIONS_IN_VIEW);
	await expect(roomLinks.first()).toHaveAttribute(
		'href',
		/\/conferences\/quick-[a-z0-9]{10}\/committees\/practice-\d\/chair$/
	);
	await expect(section.getByText('Session 1 in progress').first()).toBeVisible();
	await expect(section.getByText('In progress', { exact: true })).toHaveCount(
		QUICK_SESSIONS_IN_VIEW
	);

	// A quick session is a committee the reader chairs, but not a conference: the
	// hero still asks them to find one, and nothing of a session is drawn twice.
	// The newest three are the ones in view, so "Practice 4" is on the page and
	// "Practice 1", the oldest, waits behind "Show all 4".
	await expect(main.getByRole('heading', { level: 1 })).toHaveText('Find your first conference');
	await expect(main.getByRole('region', { name: 'Also coming up' })).toHaveCount(0);
	await expect(main.getByText('Practice 4')).toHaveCount(1);
	await expect(main.getByText('Practice 1')).toHaveCount(0);

	// "Show all 4" is a link to `/home?all=quick`, which `load` reads and lifts
	// the limit on; it works without JavaScript because it is a plain `<a>`.
	await section.getByRole('link', { name: 'Show all 4', exact: true }).click();

	await expect(page).toHaveURL('/home?all=quick', { timeout: DATABASE_TIMEOUT_MS });

	const wholeSection = page.getByRole('main').getByRole('region', { name: 'Quick sessions' });

	await expect(
		wholeSection.getByRole('link', { name: 'Open chair room', exact: true })
	).toHaveCount(4, { timeout: DATABASE_TIMEOUT_MS });
	await expect(wholeSection.getByRole('link', { name: /^Show all \d+$/ })).toHaveCount(0);
});

test('puts "Quick sessions" between the hero and the cards on a phone, with nothing spilling over', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	const user = await createTestUser();
	await signIn(page, user);
	await makeQuickSessions(page, 1);
	await page.goto('/home');

	const main = page.getByRole('main');
	const quickSessions = main.getByRole('region', { name: 'Quick sessions' });

	await expect(quickSessions).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	const hero = await main.getByRole('heading', { level: 1 }).boundingBox();
	const section = await quickSessions.boundingBox();
	const cards = await main.getByRole('region', { name: 'Open for applications' }).boundingBox();

	if (hero === null || section === null || cards === null) {
		throw new Error('The hero, "Quick sessions" or "Open for applications" is not on the page.');
	}

	// The hero first, then the section, then the cards, which are always last.
	expect(hero.y).toBeLessThan(section.y);
	expect(section.y).toBeLessThan(cards.y);

	await expectNoSidewaysOverflow(page);
});
