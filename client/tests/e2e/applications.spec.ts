import { expect, test } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { createTestUser, giveApplication, signIn, type TestUser } from './signed-in-user';
import {
	expectNoSidewaysOverflow,
	expectPageFitsInScreens,
	saveFullPageScreenshot
} from './page-shape';

// The acceptance criteria of `specs/05-pages/delegate/applications.md` that need
// a real browser: an individual application and a delegation membership stand in
// one list of cards, every card says where it stands in the words the style
// guide chose, an accepted card names the committee and the seat, a conference
// that is over waits under the "Past" tab, an unsent draft says when its window
// shuts and offers to finish it, and the cards' links, the tabs and the search
// all work in a browser with no JavaScript.
//
// Every test makes its own account, so they can run side by side without seeing
// each other's rows. The top bar and the footer repeat some of the words the page
// uses, so everything about the page itself is looked for inside `<main>`. Each
// card is an `<article>`, which is how the tests below find one: the tabs and a
// card's own materials are lists too, so a `listitem` is no longer a card.
//
// Unlike `tests/e2e/committees.spec.ts` there is no table of one seeded row per
// Playwright project here. Everything these tests write is a new row of their
// own — an application, a delegation, and the one committee and seat the accepted
// row needs — and each belongs to an account made a moment earlier, so the three
// projects can run the same test at the same time without reaching for the same
// row. Every one of those rows is taken away again in a `finally`, because the
// conferences they hang on come from `supabase/seed.sql` and outlive the test.

/**
 * How long an assertion that waits on a page reading the database may take.
 *
 * Longer than the five seconds Playwright waits by default, for the reason
 * `tests/e2e/conferences.spec.ts` gives: every test in the run asks the one
 * local database at once, and an answer has taken up to eight seconds.
 */
const DATABASE_TIMEOUT_MS = 15_000;

/**
 * The Hague International MUN Junior, the soonest conference in
 * `supabase/seed.sql` at six weeks out.
 *
 * It is only read by the other browser tests, which look at the card it has in
 * the directory rather than at anything hanging off it.
 */
const SOONEST_CONFERENCE_ID = '20000000-0000-4000-8000-000000000001';
const SOONEST_CONFERENCE_NAME = 'The Hague International MUN Junior';

/**
 * Tokyo Global MUN 2027, eight months out, which is long after the conference
 * above.
 *
 * Two conferences this far apart are what make the "Conference date" order of
 * the cards a fact about their start dates and not about which of the two
 * queries behind the page answered first.
 */
const LATER_CONFERENCE_ID = '20000000-0000-4000-8000-000000000007';
const LATER_CONFERENCE_NAME = 'Tokyo Global MUN 2027';

/**
 * Vienna University MUN 2027, whose application window the seed leaves open for
 * another two months.
 *
 * The draft test needs a conference that is still taking applications, because
 * an unsent draft is the one card that offers "Finish application", and it only
 * offers it while the window is open.
 */
const OPEN_WINDOW_CONFERENCE_ID = '20000000-0000-4000-8000-000000000010';
const OPEN_WINDOW_CONFERENCE_NAME = 'Vienna University MUN 2027';
const OPEN_WINDOW_CONFERENCE_SLUG = 'viennamun-2027';

/** Rotterdam Spring MUN 2026, the seeded conference that ended six months ago. */
const PAST_CONFERENCE_ID = '20000000-0000-4000-8000-000000000016';
const PAST_CONFERENCE_NAME = 'Rotterdam Spring MUN 2026';

/**
 * The committee the accepted application's seat sits in, and the seat itself.
 *
 * The one test that needs them makes them and deletes them again, the way
 * `tests/e2e/committees.spec.ts` makes the committee of a finished conference:
 * only Amsterdam Open MUN 2027 has committees in `supabase/seed.sql`, and other
 * browser tests count what sits in those.
 *
 * A card names a committee by its short name when it has one, so it should
 * read "ATC" rather than the committee's full name.
 */
const COMMITTEE_NAME = 'Applications Test Council';
const COMMITTEE_ABBREVIATION = 'ATC';
const SEAT_NAME = 'France';

/**
 * The quiet line an unsent draft shows, such as "Draft · closes in 54 days".
 *
 * How many days it is cannot be written down here. `supabase/seed.sql` counts
 * this conference's window from the moment the database was last reset, so the
 * number falls by one for every day a machine goes without `pnpm db:reset`.
 * What the page file promises is the sentence, and that is what this matches.
 * "today" and "tomorrow" are the two answers `formatDueIn` gives instead of a
 * number of days when the window is about to shut.
 */
const DRAFT_CLOSING_LINE = /^Draft · closes (today|tomorrow|in \d+ days)$/;

/**
 * How many desktop windows tall the list may be.
 *
 * Two, which is what `/committees` is held to. It is a page of cards and little
 * else, so one window holds a delegate's applications with room to spare, and
 * the second leaves space for somebody who has applied to several conferences
 * at once without letting the cards sprawl.
 */
const APPLICATIONS_PAGE_SCREENS = 2;

/** A name nothing else in the database will match. */
function unusedName(prefix: string): string {
	return `${prefix} ${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * A join code for a delegation this file writes straight into the table.
 *
 * `create_delegation` mints one of its own, and `tests/e2e/delegations.spec.ts`
 * is where that is proved. Here the row is written with the service-role
 * client, which walks past the function altogether, so the code has to come
 * from somewhere — and it is made of the same characters, with no 0, O, 1 or I
 * among them, so that nothing reading it has to care which path wrote it.
 */
function unusedJoinCode(): string {
	const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	const characters: string[] = [];

	for (let position = 0; position < 8; position += 1) {
		characters.push(alphabet[Math.floor(Math.random() * alphabet.length)]);
	}

	return characters.join('');
}

/** What a test wants to say about one delegation. Everything else is filled in. */
type DelegationSeed = {
	conferenceId: string;
	name?: string;
	status?: 'draft' | 'submitted' | 'accepted' | 'rejected' | 'withdrawn';
};

/** One delegation a test has arranged, as the tests below name it. */
type TestDelegation = {
	id: string;
	name: string;
};

/**
 * Give a test account a delegation it is the head of, and answer what the tests
 * need to find the row again.
 *
 * This is `giveDelegation` from `tests/e2e/delegations.spec.ts`, copied rather
 * than shared because there is nowhere shared to put it yet: `signed-in-user.ts`
 * holds the helpers more than one file needs, and until now only that file made
 * delegations.
 *
 * The service-role client writes both rows, the way `giveApplication` in
 * `signed-in-user.ts` writes an application and for the same reason.
 * `guard_delegation_insert` only runs for the two roles a browser uses, so the
 * service role walks straight past it, which is the one reason a seeded
 * `accepted` or `rejected` row is possible at all. Walking past it is also why
 * `submitted_at` is set here.
 *
 * `check_one_route_per_conference` still fires, for everybody, so the account
 * given a delegation here must have no application at the same conference.
 */
async function giveDelegation(head: TestUser, seed: DelegationSeed): Promise<TestDelegation> {
	const admin = createServiceRoleClient();
	const name = seed.name ?? unusedName('Lycee Francais Delegation');
	const status = seed.status ?? 'submitted';
	const now = new Date().toISOString();

	// A draft has not been sent yet; every other status has. The two the
	// organisers choose also carry the moment they chose, because a delegation
	// that is decided and has no `decided_at` is a row the app could never write.
	const isSent = status !== 'draft';
	const isDecided = status === 'accepted' || status === 'rejected';

	const { data, error } = await admin
		.from('delegations')
		.insert({
			conference_id: seed.conferenceId,
			name,
			institution_name: 'Lycee Francais de La Haye',
			country_code: 'FR',
			status,
			requested_seats: 12,
			join_code: unusedJoinCode(),
			submitted_at: isSent ? now : null,
			decided_at: isDecided ? now : null
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test delegation: ${error?.message}`);
	}

	const { error: headError } = await admin
		.from('delegation_members')
		.insert({ delegation_id: data.id, user_id: head.id, role: 'head' });

	if (headError) {
		throw new Error(`Could not make the test account a head: ${headError.message}`);
	}

	return { id: data.id, name };
}

/**
 * Take a test delegation away again.
 *
 * Its membership rows go with it, because `delegation_members.delegation_id`
 * carries `on delete cascade`, and `prevent_last_delegation_head_removal` steps
 * aside when the delegation itself is the row being deleted.
 */
async function deleteDelegation(delegationId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin.from('delegations').delete().eq('id', delegationId);

	if (error) {
		throw new Error(`Could not delete the test delegation: ${error.message}`);
	}
}

/**
 * Take a test application away again.
 *
 * The account that owns it is a throwaway one, but the conference it hangs on
 * is a row of `supabase/seed.sql` that every other browser test shares, so the
 * application goes the same way a seat given out by `giveSeat` is given back.
 */
async function deleteApplication(applicationId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin.from('applications').delete().eq('id', applicationId);

	if (error) {
		throw new Error(`Could not delete the test application: ${error.message}`);
	}
}

/**
 * Make a committee of a seeded conference, and answer its id.
 *
 * Two tests need one. The accepted row needs a committee for its seat to sit
 * in, and a submitted application needs one to name as a preference, because
 * `validate_application` asks every submission for at least one and every
 * conference in the seed asks for two.
 */
async function createCommittee(conferenceId: string): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('committees')
		.insert({
			conference_id: conferenceId,
			name: COMMITTEE_NAME,
			abbreviation: COMMITTEE_ABBREVIATION,
			// Unique to this run, because a conference never has two committees with
			// the same link and a run that was interrupted may have left one behind.
			slug: `e2e-applications-${crypto.randomUUID()}`,
			level: 'intermediate',
			topics: [],
			position: 1
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not create the test committee: ${error?.message}`);
	}

	return data.id;
}

/**
 * Put one seat in that committee and give it to this person for this
 * application, the way accepting an application does.
 *
 * `application_id` is the column the page's query follows to find the seat an
 * application won, and `check_seat_allocation` insists that the application it
 * names belongs to the same conference as the committee.
 */
async function giveSeatForApplication(
	committeeId: string,
	user: TestUser,
	applicationId: string
): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin.from('seats').insert({
		committee_id: committeeId,
		name: SEAT_NAME,
		kind: 'country',
		country_code: 'FR',
		position: 1,
		user_id: user.id,
		allocated_at: new Date().toISOString(),
		application_id: applicationId
	});

	if (error) {
		throw new Error(`Could not give the test account the ${SEAT_NAME} seat: ${error.message}`);
	}
}

/** Take that committee away again. Its seats go with it, through `on delete cascade`. */
async function deleteCommittee(committeeId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin.from('committees').delete().eq('id', committeeId);

	if (error) {
		throw new Error(`Could not delete the test committee: ${error.message}`);
	}
}

/**
 * The organisation of `supabase/seed.sql` that the conferences a test makes for
 * itself belong to, the way `tests/e2e/application.spec.ts` makes its own.
 */
const SAMPLE_ORGANIZATION_ID = '10000000-0000-4000-8000-000000000001';

/** A day a year from now as `YYYY-MM-DD`, so a conference made today is still to come. */
function dayNextYear(offsetDays: number): string {
	const ONE_DAY_MS = 24 * 60 * 60 * 1000;
	const moment = new Date(Date.now() + (365 + offsetDays) * ONE_DAY_MS);

	return moment.toISOString().slice(0, 10);
}

/**
 * Make a published conference of this test's own, and answer its id.
 *
 * The unpublishing test needs conferences nobody else is looking at, because it
 * puts them back to `draft`, and every seeded conference is read by other
 * browser tests running at the same time. The service-role client writes it,
 * because `conferences` has no insert policy a test account could use inside
 * somebody else's organisation.
 */
async function createOwnConference(name: string): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('conferences')
		.insert({
			name,
			slug: `e2e-applications-${crypto.randomUUID()}`,
			city: 'Delft',
			country_code: 'NL',
			timezone: 'Europe/Amsterdam',
			start_date: dayNextYear(0),
			end_date: dayNextYear(2),
			status: 'published',
			organization_id: SAMPLE_ORGANIZATION_ID
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not create the test conference: ${error?.message}`);
	}

	return data.id;
}

/**
 * Publish or unpublish a test conference, the way the organiser dashboard's
 * "Publish" and "Unpublish" buttons do. Unpublishing is putting it back to `draft`.
 */
async function setConferenceStatus(
	conferenceId: string,
	status: 'draft' | 'published'
): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin.from('conferences').update({ status }).eq('id', conferenceId);

	if (error) {
		throw new Error(`Could not set the test conference to ${status}: ${error.message}`);
	}
}

/**
 * Take a test conference away again. Its applications and delegations go with
 * it, because both carry `on delete cascade` from their conference.
 */
async function deleteOwnConference(conferenceId: string): Promise<void> {
	await createServiceRoleClient().from('conferences').delete().eq('id', conferenceId);
}

test('sends a visitor to the sign in page and back again', async ({ page }) => {
	await page.goto('/applications');

	await expect(page).toHaveURL('/login?next=%2Fapplications');
});

test('shows an application and a delegation in one list, in the order asked for', async ({
	page
}, testInfo) => {
	const delegate = await createTestUser('Noor Haddad');

	// The delegation is at the conference that starts first and the application
	// at the one that starts last, which is the other way round from the order
	// they are made in here. "Most recent" therefore puts the application first
	// and "Conference date" the delegation, so a page that ignored the order
	// would get one of the two wrong.
	const delegation = await giveDelegation(delegate, { conferenceId: SOONEST_CONFERENCE_ID });
	const applicationId = await giveApplication(delegate, {
		conferenceId: LATER_CONFERENCE_ID,
		status: 'accepted'
	});

	try {
		await signIn(page, delegate);
		await page.goto('/applications');

		const main = page.getByRole('main');
		const cards = main.getByRole('article');

		// One list, with both roads into a conference in it and nothing else.
		await expect(cards).toHaveCount(2, { timeout: DATABASE_TIMEOUT_MS });

		// "Most recent" is the order the page opens in.
		await expect(cards.nth(0)).toContainText(LATER_CONFERENCE_NAME);
		await expect(cards.nth(1)).toContainText(SOONEST_CONFERENCE_NAME);

		const isWithoutJavaScript = testInfo.project.name === 'desktop-no-js';

		// With JavaScript the "Search" button is hidden once the page has come to
		// life, and picking an order is then enough to go. Without it, the button
		// sends the form, order and all.
		if (isWithoutJavaScript) {
			await main.getByLabel('Sort applications').selectOption('conference-date');
			await main.getByRole('button', { name: 'Search' }).press('Enter');
		} else {
			await expect(main.getByRole('button', { name: 'Search' })).toBeHidden();

			// With JavaScript the dropdown is shadcn's, a button whose list floats
			// over the page, outside `main`.
			await main.getByLabel('Sort applications').click();
			await page.getByRole('option', { name: 'Conference date' }).click();
		}

		// The order lives in the address, like the search and the tab, so back and
		// refresh keep it.
		await expect(page).toHaveURL(/[?&]sort=conference-date/, { timeout: DATABASE_TIMEOUT_MS });
		await expect(cards.nth(0)).toContainText(SOONEST_CONFERENCE_NAME, {
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(cards.nth(1)).toContainText(LATER_CONFERENCE_NAME);

		// And each card says which of the two roads it came by: a delegation names
		// itself, and an individual application is the reader's own.
		await expect(cards.nth(0)).toContainText('Delegation application');
		await expect(cards.nth(0)).toContainText(delegation.name);
		await expect(cards.nth(1)).toContainText('Delegate application');
	} finally {
		// In a `finally`, so that a failed assertion still leaves the two seeded
		// conferences as the next test expects to find them.
		await deleteDelegation(delegation.id);
		await deleteApplication(applicationId);
	}
});

test('gives each card the status word the style guide chose for it', async ({ page }) => {
	const delegate = await createTestUser('Mateo Rossi');

	// A delegation the organisers turned down, and an application still waiting
	// for an answer. Neither word is the one the database stores, which is the
	// point: the page asks `$lib/status.ts` rather than showing the enum value.
	const delegation = await giveDelegation(delegate, {
		conferenceId: SOONEST_CONFERENCE_ID,
		status: 'rejected'
	});
	const committeeId = await createCommittee(LATER_CONFERENCE_ID);
	const applicationId = await giveApplication(delegate, {
		conferenceId: LATER_CONFERENCE_ID,
		status: 'submitted',
		// A submitted application has to name a committee of its own conference
		// and carry a motivation, or `validate_application` refuses the row.
		committeePreferences: [committeeId],
		motivation: 'I have chaired twice and would like to sit as a delegate again.'
	});

	try {
		await signIn(page, delegate);
		await page.goto('/applications');

		const cards = page.getByRole('main').getByRole('article');
		const delegationCard = cards.filter({ hasText: SOONEST_CONFERENCE_NAME });
		const applicationCard = cards.filter({ hasText: LATER_CONFERENCE_NAME });

		// `submitted` reads "Under review" and `rejected` reads "Not accepted".
		// Both are the status pill's whole text, so both are looked for exactly.
		// The panel beside a turned-down card says "Not accepted" as well, which
		// is why that one takes the first of the two.
		await expect(applicationCard.getByText('Under review', { exact: true })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(delegationCard.getByText('Not accepted', { exact: true }).first()).toBeVisible();

		// The words the database uses never reach the page.
		await expect(page.getByRole('main').getByText('rejected')).toHaveCount(0);
	} finally {
		// In a `finally`, so that a failed assertion still leaves the two seeded
		// conferences as the next test expects to find them.
		await deleteDelegation(delegation.id);
		await deleteApplication(applicationId);
		await deleteCommittee(committeeId);
	}
});

test('names the committee and the seat once an application is accepted', async ({ page }) => {
	const delegate = await createTestUser('Aiko Tanaka');
	const applicationId = await giveApplication(delegate, {
		conferenceId: SOONEST_CONFERENCE_ID,
		status: 'accepted'
	});
	const committeeId = await createCommittee(SOONEST_CONFERENCE_ID);

	await giveSeatForApplication(committeeId, delegate, applicationId);

	try {
		await signIn(page, delegate);
		await page.goto('/applications');

		const card = page.getByRole('main').getByRole('article');

		await expect(card).toContainText(SOONEST_CONFERENCE_NAME, { timeout: DATABASE_TIMEOUT_MS });
		await expect(card.getByText('Accepted', { exact: true })).toBeVisible();

		// The seat the acceptance came with, named the way every other page names
		// one: the committee's short name, then the country.
		await expect(card.getByText('Assigned committee')).toBeVisible();
		await expect(card.getByText(COMMITTEE_ABBREVIATION, { exact: true })).toBeVisible();
		await expect(card.getByText('Assigned country')).toBeVisible();
		await expect(card.getByText(SEAT_NAME, { exact: true })).toBeVisible();
	} finally {
		// In a `finally`, so that a failed assertion still leaves the seeded
		// conference without a committee, which is how `supabase/seed.sql` has it.
		// The seat goes with the committee.
		await deleteCommittee(committeeId);
		await deleteApplication(applicationId);
	}
});

test('keeps a finished conference under the "Past" tab', async ({ page }) => {
	const delegate = await createTestUser('Sofia Almeida');
	const applicationId = await giveApplication(delegate, {
		conferenceId: PAST_CONFERENCE_ID,
		status: 'accepted'
	});

	try {
		await signIn(page, delegate);
		await page.goto('/applications');

		const main = page.getByRole('main');
		const tabs = main.getByRole('navigation', { name: 'Filter applications' });

		// Rotterdam Spring MUN 2026 ended six months ago, so "All", which is about
		// conferences still to come, has nothing to show and says where to look.
		await expect(main.getByText('No upcoming conferences.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(main.getByRole('link', { name: 'Show past applications' })).toBeVisible();
		await expect(main.getByText(PAST_CONFERENCE_NAME)).toHaveCount(0);

		await tabs.getByRole('link', { name: 'Past', exact: true }).click();

		// The URL is the single source of truth here, the way it is on
		// `/conferences`: a tab is a link to another address and `load` does the
		// rest, so back and refresh both work.
		await expect(page).toHaveURL('/applications?show=past');
		await expect(main.getByRole('article')).toContainText(PAST_CONFERENCE_NAME, {
			timeout: DATABASE_TIMEOUT_MS
		});

		// The tab says it is the open one, for a screen reader as well as the eye.
		await expect(tabs.getByRole('link', { name: 'Past', exact: true })).toHaveAttribute(
			'aria-current',
			'page'
		);

		// A conference that is over asks nothing more of the reader.
		await expect(main.getByText('This conference has ended')).toBeVisible();
	} finally {
		// In a `finally`, so that a failed assertion still leaves the seeded
		// conference as the next test expects to find it.
		await deleteApplication(applicationId);
	}
});

test('tells a draft when its window shuts, and offers to finish it', async ({ page }) => {
	const delegate = await createTestUser('Tomas Novak');
	const applicationId = await giveApplication(delegate, {
		conferenceId: OPEN_WINDOW_CONFERENCE_ID,
		status: 'draft'
	});

	try {
		await signIn(page, delegate);
		await page.goto('/applications');

		const card = page.getByRole('main').getByRole('article');

		await expect(card).toContainText(OPEN_WINDOW_CONFERENCE_NAME, {
			timeout: DATABASE_TIMEOUT_MS
		});

		// The line under "Delegate application" counts the days left, and the pill
		// says the draft is waiting on the reader. Not looked for exactly, because
		// the pill's red mark is an exclamation mark written as text.
		await expect(card.getByText(DRAFT_CLOSING_LINE)).toBeVisible();
		await expect(card.getByText('Needs action')).toBeVisible();

		// Following the link rather than reading its `href`: SvelteKit writes an
		// address relative to the page it is on, so the attribute reads
		// `./conferences/...` until the browser has worked it out.
		await card.getByRole('link', { name: 'Finish application' }).click();

		await expect(page).toHaveURL(`/conferences/${OPEN_WINDOW_CONFERENCE_SLUG}/apply`, {
			timeout: DATABASE_TIMEOUT_MS
		});
	} finally {
		// In a `finally`, so that a failed assertion still leaves the seeded
		// conference as the next test expects to find it.
		await deleteApplication(applicationId);
	}
});

test('works in a browser with no JavaScript', async ({ page }, testInfo) => {
	test.skip(
		testInfo.project.name !== 'desktop-no-js',
		'This is about the page with JavaScript switched off, which is that project.'
	);

	const delegate = await createTestUser('Hannah Weber');
	const applicationId = await giveApplication(delegate, {
		conferenceId: SOONEST_CONFERENCE_ID,
		status: 'accepted'
	});
	const draftId = await giveApplication(delegate, {
		conferenceId: OPEN_WINDOW_CONFERENCE_ID,
		status: 'draft'
	});

	try {
		await signIn(page, delegate);
		await page.goto('/applications');

		const main = page.getByRole('main');
		const cards = main.getByRole('article');
		const acceptedCard = cards.filter({ hasText: SOONEST_CONFERENCE_NAME });

		await expect(cards).toHaveCount(2, { timeout: DATABASE_TIMEOUT_MS });

		// Every button on a card is an ordinary `<a>`, so clicking one is a plain
		// page load rather than anything Svelte does.
		await acceptedCard.getByRole('link', { name: 'View application' }).click();

		await expect(page).toHaveURL(`/applications/${applicationId}`, {
			timeout: DATABASE_TIMEOUT_MS
		});

		// The search box sends its form with the "Search" button, which is only on
		// screen until JavaScript takes over. The draft's conference is the one
		// card left.
		await page.goto('/applications');
		await main.getByLabel('Search applications').fill('Vienna');
		await main.getByRole('button', { name: 'Search' }).press('Enter');

		await expect(page).toHaveURL(/[?&]q=Vienna/, { timeout: DATABASE_TIMEOUT_MS });
		await expect(cards).toHaveCount(1, { timeout: DATABASE_TIMEOUT_MS });
		await expect(cards).toContainText(OPEN_WINDOW_CONFERENCE_NAME);

		// And the tabs are links too, which keep the search.
		await main.getByRole('link', { name: /^Needs action/ }).click();

		await expect(page).toHaveURL(/[?&]show=needs-action/, { timeout: DATABASE_TIMEOUT_MS });
		await expect(page).toHaveURL(/[?&]q=Vienna/);
		await expect(cards).toHaveCount(1, { timeout: DATABASE_TIMEOUT_MS });

		await cards.getByRole('link', { name: 'View application' }).click();

		await expect(page).toHaveURL(`/applications/${draftId}`, {
			timeout: DATABASE_TIMEOUT_MS
		});
	} finally {
		// In a `finally`, so that a failed assertion still leaves the seeded
		// conferences as the next test expects to find them.
		await deleteApplication(applicationId);
		await deleteApplication(draftId);
	}
});

test('tells somebody who has applied nowhere that there is nothing here yet', async ({ page }) => {
	const user = await createTestUser();
	await signIn(page, user);

	await page.goto('/applications');

	const main = page.getByRole('main');

	// The heading is only for screen readers, since the navigation above already
	// says which page this is, but it is there.
	await expect(main.getByRole('heading', { level: 1 })).toHaveText('Applications', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page).toHaveTitle('Applications · MUNMeet');

	await expect(main.getByText('No applications yet.')).toBeVisible();
	await expect(main.getByText('When you apply to a conference, it appears here.')).toBeVisible();
	await expect(main.getByRole('article')).toHaveCount(0);
	await expect(main.getByRole('link', { name: 'Browse conferences' })).toBeVisible();

	// Searching and tabs mean nothing to somebody with no applications at all.
	await expect(main.getByLabel('Search applications')).toHaveCount(0);
	await expect(main.getByRole('navigation', { name: 'Filter applications' })).toHaveCount(0);
});

test('says how many applications are hidden while their conference is unpublished', async ({
	page
}) => {
	const delegate = await createTestUser('Ilse de Vries');
	const applicationConferenceName = unusedName('Unpublished Application MUN');
	const delegationConferenceName = unusedName('Unpublished Delegation MUN');
	const applicationConferenceId = await createOwnConference(applicationConferenceName);
	const delegationConferenceId = await createOwnConference(delegationConferenceName);

	try {
		// One of each road into a conference, so both halves of the count are used.
		await giveApplication(delegate, { conferenceId: applicationConferenceId, status: 'draft' });
		await giveDelegation(delegate, { conferenceId: delegationConferenceId });

		await signIn(page, delegate);
		await page.goto('/applications');

		const main = page.getByRole('main');
		const cards = main.getByRole('article');

		// While both are published, both are cards and there is nothing to explain.
		await expect(cards).toHaveCount(2, { timeout: DATABASE_TIMEOUT_MS });
		await expect(main.getByText('not listed')).toHaveCount(0);

		// The organisers take both conferences down. The reader can no longer read
		// either of them, so neither can be a card, and the page says so rather
		// than pretending the applications were never made.
		await setConferenceStatus(applicationConferenceId, 'draft');
		await setConferenceStatus(delegationConferenceId, 'draft');
		await page.reload();

		await expect(
			main.getByText(
				'2 of your applications are not listed because the organisers unpublished their conferences. They come back here if the conferences are published again.'
			)
		).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await expect(cards).toHaveCount(0);
		// "No applications yet" would be untrue beside that notice.
		await expect(main.getByText('No applications yet.')).toHaveCount(0);

		// Published again, the delegation's conference comes back as a card and the
		// notice counts the one application that is still hidden.
		await setConferenceStatus(delegationConferenceId, 'published');
		await page.reload();

		await expect(cards).toHaveCount(1, { timeout: DATABASE_TIMEOUT_MS });
		await expect(cards.first()).toContainText(delegationConferenceName);
		await expect(
			main.getByText(
				'One of your applications is not listed because the organisers unpublished its conference. It comes back here if they publish it again.'
			)
		).toBeVisible();
	} finally {
		// In a `finally`, so a failed assertion still takes the two conferences
		// away, and the application and delegation hanging off them with them.
		await deleteOwnConference(applicationConferenceId);
		await deleteOwnConference(delegationConferenceId);
	}
});

test('nothing spills off the side of a phone screen', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	// Measured with cards on the page rather than the empty state, because a card
	// is what can push a narrow screen sideways: it holds a conference's name, a
	// progress line of four steps and a delegation's long name, all side by side
	// on a wide screen. The tabs are wider than a phone too, and scroll inside
	// their own box.
	const delegate = await createTestUser('Noor Haddad');
	const delegation = await giveDelegation(delegate, {
		conferenceId: SOONEST_CONFERENCE_ID,
		name: unusedName('Lycee Francais de La Haye Delegation')
	});
	const applicationId = await giveApplication(delegate, {
		conferenceId: LATER_CONFERENCE_ID,
		status: 'accepted'
	});

	try {
		await signIn(page, delegate);
		await page.goto('/applications');

		// Wait for both cards before measuring, or the page would be measured before
		// the thing this test is about is on it.
		await expect(page.getByRole('main').getByRole('article')).toHaveCount(2, {
			timeout: DATABASE_TIMEOUT_MS
		});

		await expectNoSidewaysOverflow(page);
	} finally {
		// In a `finally`, so that a failed assertion still leaves the two seeded
		// conferences as the next test expects to find them.
		await deleteDelegation(delegation.id);
		await deleteApplication(applicationId);
	}
});

test('is the right shape on a desktop screen', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough to measure a height.');

	const delegate = await createTestUser('Noor Haddad');
	const delegation = await giveDelegation(delegate, { conferenceId: SOONEST_CONFERENCE_ID });
	const applicationId = await giveApplication(delegate, {
		conferenceId: LATER_CONFERENCE_ID,
		status: 'accepted'
	});

	try {
		await signIn(page, delegate);
		await page.goto('/applications');

		await expect(page.getByRole('main').getByRole('article')).toHaveCount(2, {
			timeout: DATABASE_TIMEOUT_MS
		});

		// Saved before the assertion, so that a failure leaves a picture of the
		// page that failed it.
		await saveFullPageScreenshot(page, 'applications');
		await expectPageFitsInScreens(page, APPLICATIONS_PAGE_SCREENS);
	} finally {
		// In a `finally`, so that a failed assertion still leaves the two seeded
		// conferences as the next test expects to find them.
		await deleteDelegation(delegation.id);
		await deleteApplication(applicationId);
	}
});
