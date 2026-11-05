import { expect, test } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	createTestUser,
	makeConferenceStaff,
	removeConferenceStaff,
	signIn,
	TEST_PASSWORD,
	type TestUser
} from './signed-in-user';
import { createDraftConferenceFor, createPublishedConferenceFor } from './draft-conference';
import {
	expectNoSidewaysOverflow,
	expectPageFitsInScreens,
	saveFullPageScreenshot
} from './page-shape';
import { answerConfirmationPage } from './confirmation-page';
import { openManageNavigation } from './manage-navigation';

// The acceptance criteria of `specs/05-pages/organiser/manage-index.md` that
// need a real browser, together with the access rules
// `specs/02-architecture/routes.md` sets for the organiser area: a visitor is
// sent to sign in and brought back, and a signed-in person who helps run
// nothing gets a 404 rather than a 403 or a redirect.
//
// Every test makes its own account, so they can run side by side without
// seeing each other's rows.
//
// The top bar says several of the same words this page does — "Manage" is a
// link in it and "Create a conference" a line in the profile menu — so
// everything about the page itself is looked for inside `<main>`. The two
// tests about the bar itself are the exception, and say so where they start.
//
// None of these tests needs JavaScript. The page is links and one form, the
// "Accept" button on an invitation, which is why the invitation test below
// proves "pending invites can be accepted without JavaScript" simply by
// running on the `desktop-no-js` project like everything else here. The two
// that measure the page are the exception, as they are in `home.spec.ts`:
// they ask the browser for its own dimensions, and each runs on one project
// alone. Both measure `/manage`; the dashboard at `/manage/[slug]` is measured
// in `manage-dashboard.spec.ts`, beside the rest of what that page shows.
//
// Several tests create a conference through `./draft-conference`, with an
// organisation of its own. What they create stays in the database until the
// next `pnpm db:reset`, and that is safe: a conference made this way is a
// draft, and `/conferences` lists published conferences only, so nothing
// another test counts can see them. The one test that publishes its conference,
// to count the applications waiting on its row, moves it years ahead and
// archives it again in a `finally`.

/**
 * How long an assertion that waits on a page reading the database may take.
 *
 * Longer than the five seconds Playwright waits by default, for the reason
 * `tests/e2e/conferences.spec.ts` gives: every test in the run asks the one
 * local database at once, and an answer has taken up to eight seconds.
 */
const DATABASE_TIMEOUT_MS = 15_000;

/**
 * BERMUN 2026, a published conference of `supabase/seed.sql`, and the one this
 * file puts its accounts on the team of.
 *
 * `home.spec.ts` and `profile.spec.ts` work on the Amsterdam and The Hague
 * rows, so this file keeps to a third conference. A team row belongs to one
 * account, so two files could share a conference safely, but a test that reads
 * a conference's page should not have to think about another file's rows.
 */
const SEEDED_CONFERENCE_ID = '20000000-0000-4000-8000-000000000003';
const SEEDED_CONFERENCE_SLUG = 'bermun-2026';
const SEEDED_CONFERENCE_NAME = 'BERMUN 2026';

/**
 * The organisation that runs it. No account in this file ever belongs to it,
 * which is what makes it the name to look for when proving that a conference
 * somebody only helps with is *not* listed under an organisation heading.
 */
const SEEDED_ORGANIZATION_NAME = 'Sample Europe MUN Network';

/**
 * Sample First-Year MUN Society, the third organisation in `supabase/seed.sql`.
 * The invitation test joins this one, because its only conference is a draft
 * and no other browser test reads its members.
 */
const INVITING_ORGANIZATION_ID = '10000000-0000-4000-8000-000000000003';
const INVITING_ORGANIZATION_NAME = 'Sample First-Year MUN Society';

/**
 * Sofia Almeida, a sample account from `supabase/seed.sql`, named as the person
 * who sent the invitation below. `invites.invited_by` has to be a real account,
 * and who sent it changes nothing about accepting it.
 */
const SEEDED_PERSON_ID = '50000000-0000-4000-8000-000000000001';

/**
 * The dates every conference these tests create runs on.
 *
 * The fixtures in `tests/db` are dated 2020 so that they cannot turn up in the
 * directory. These may be in the future instead, for the reason at the top of
 * this file: `./draft-conference` makes a draft, and the directory lists
 * published conferences only.
 */
const CONFERENCE_FIRST_DAY = '2030-05-03';
const CONFERENCE_LAST_DAY = '2030-05-05';

/**
 * How many windows tall `/manage` may be with an organisation, a conference of
 * its own and a conference the reader only helps with on it.
 *
 * This is the page somebody opens to pick what to work on, so what is on it
 * should be within reach of one scroll. `home.spec.ts` measures the dashboard
 * the same way and says why no other check in `pnpm verify` can see this.
 */
const MANAGE_SCREENS = 2;

/**
 * A name nothing else in the database will match, so that a test can count its
 * own conference on a page and search the directory for it by name.
 */
function unusedName(prefix: string): string {
	return `${prefix} ${crypto.randomUUID().slice(0, 8)}`;
}

/** What `createDraftConference` names the new conference and its organisation. */
type NewConference = {
	/** The conference's name. */
	name: string;
	/** The name of the new organisation, which the account owns. */
	organizationName: string;
};

/**
 * Give `user` a draft conference of its own, run by a brand-new organisation,
 * and answer its management address, `/manage/<slug>`.
 *
 * The rows are written straight into the database by `./draft-conference`,
 * whose comment says why: the one-step `/create` form these tests used to fill
 * in is gone, and the creation flow that replaced it has its own
 * `create-*.spec.ts` files.
 */
async function createDraftConference(user: TestUser, conference: NewConference): Promise<string> {
	const draft = await createDraftConferenceFor(user, {
		name: conference.name,
		organizationName: conference.organizationName,
		startDate: CONFERENCE_FIRST_DAY,
		endDate: CONFERENCE_LAST_DAY
	});

	return `/manage/${draft.slug}`;
}

/** The slug at the end of a `/manage/<slug>` address. */
function slugOf(managePath: string): string {
	return managePath.split('/').pop() ?? '';
}

/**
 * Put an invitation to an organisation in the table and answer its token.
 *
 * Sending one has no form yet, so the service-role client writes the row the
 * way `giveNotifications` in `./signed-in-user` stands in for a trigger. The
 * `token` column holds 32 url-safe characters, which is what a UUID with its
 * dashes taken out is.
 */
async function inviteToOrganization(user: TestUser, organizationId: string): Promise<string> {
	const admin = createServiceRoleClient();
	const token = crypto.randomUUID().replaceAll('-', '');

	const { error } = await admin.from('invites').insert({
		kind: 'organization_member',
		organization_id: organizationId,
		email: user.email,
		role: 'member',
		token,
		invited_by: SEEDED_PERSON_ID
	});

	if (error) {
		throw new Error(`Could not invite the test account to the organisation: ${error.message}`);
	}

	return token;
}

/**
 * Take the invitation away again, and the membership accepting it created.
 *
 * Both rows point at an organisation of `supabase/seed.sql` that other tests
 * read, and nothing clears them before the next `pnpm db:reset`, so the test
 * that adds them takes them away in a `finally`.
 */
async function clearInvite(token: string, userId: string, organizationId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { error: inviteError } = await admin.from('invites').delete().eq('token', token);

	if (inviteError) {
		throw new Error(`Could not delete the test invitation: ${inviteError.message}`);
	}

	const { error: membershipError } = await admin
		.from('organization_members')
		.delete()
		.eq('organization_id', organizationId)
		.eq('user_id', userId);

	if (membershipError) {
		throw new Error(
			`Could not take the test account out of the organisation: ${membershipError.message}`
		);
	}
}

/**
 * The id of the conference a `/manage/<slug>` address names. `./draft-conference`
 * makes the slug with a random suffix, so the id can only be looked up afterwards.
 */
async function readConferenceId(slug: string): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('conferences')
		.select('id')
		.eq('slug', slug)
		.maybeSingle();

	if (error || !data) {
		throw new Error(`Could not find the conference "${slug}": ${error?.message}`);
	}

	return data.id;
}

/**
 * The id of the organisation that runs the conference at `/manage/<slug>`.
 */
async function readOrganizationId(slug: string): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('conferences')
		.select('organization_id')
		.eq('slug', slug)
		.maybeSingle();

	if (error || !data) {
		throw new Error(`Could not find the conference "${slug}": ${error?.message}`);
	}

	return data.organization_id;
}

/** The slug of one organisation, for the links the Stripe warning carries. */
async function readOrganizationSlug(organizationId: string): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('organizations')
		.select('slug')
		.eq('id', organizationId)
		.maybeSingle();

	if (error || !data) {
		throw new Error(`Could not find the organisation "${organizationId}": ${error?.message}`);
	}

	return data.slug;
}

/**
 * Mark an organisation's Stripe onboarding finished.
 *
 * The button that starts the onboarding is on `/manage/organizations/[orgSlug]`
 * since T23, but finishing it is a round trip to Stripe, and this column is one
 * only the service role may write — the `protect_stripe_columns` trigger
 * refuses a browser, and `account.updated` in the webhook (T32) is its only
 * writer. So the service-role client stands in for that webhook.
 */
async function connectStripe(organizationId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('organizations')
		.update({ stripe_onboarding_completed_at: new Date().toISOString() })
		.eq('id', organizationId);

	if (error) {
		throw new Error(`Could not connect Stripe for the test organisation: ${error.message}`);
	}
}

/**
 * Give a conference one committee, and answer its id.
 *
 * The committees editor is T21, so the service-role client writes the row. An
 * application has to name a committee it would like, which is why the
 * application below needs this first.
 */
async function addCommittee(conferenceId: string): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('committees')
		.insert({ conference_id: conferenceId, name: 'General Assembly', slug: 'general-assembly' })
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test committee: ${error?.message}`);
	}

	return data.id;
}

/**
 * Put one submitted application against a conference, and answer its id.
 *
 * Applying has no form yet — `/conferences/[slug]/apply` is T24 — so the
 * service-role client writes the row the way `giveNotifications` in
 * `./signed-in-user` stands in for a trigger. The applicant is a seeded
 * account, because an application has to belong to somebody real and who it is
 * changes nothing about the number on the row. A submitted application has to
 * name at least one committee it would like and give a motivation, both of
 * which a trigger insists on.
 */
async function applyToConference(conferenceId: string, committeeId: string): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('applications')
		.insert({
			conference_id: conferenceId,
			user_id: SEEDED_PERSON_ID,
			status: 'submitted',
			committee_preferences: [committeeId],
			motivation: 'A test application, written so the row has something to count.',
			submitted_at: new Date().toISOString()
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test application: ${error?.message}`);
	}

	return data.id;
}

/**
 * How many days ahead the one conference this file publishes starts: about
 * eight years, later than every conference in the seed, for the reason
 * `manage-dashboard.spec.ts` gives for the same number. A directory page
 * nobody filtered never opens on it in the moment it is published.
 */
const APPLICATIONS_PHASE_START_IN_DAYS = 3000;

/** The ISO date `days` days from today. */
function isoDateInDays(days: number): string {
	const moment = new Date();

	moment.setDate(moment.getDate() + days);

	return moment.toISOString().slice(0, 10);
}

/**
 * Publish a test conference and move it into the Applications phase: its days
 * far in the future and its application window open since yesterday, closing
 * a week before the first day.
 *
 * Only a published conference that is taking applications counts the ones
 * waiting on its row; a draft's row counts its setup steps instead. The
 * service-role client arranges the state the test begins in, the way
 * `manage-dashboard.spec.ts` does, and the test hands the conference to
 * `takeOutOfTheDirectory` in a `finally`.
 */
async function publishTakingApplications(conferenceId: string): Promise<void> {
	const admin = createServiceRoleClient();
	const opensAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
	const closesAt = `${isoDateInDays(APPLICATIONS_PHASE_START_IN_DAYS - 7)}T12:00:00.000Z`;

	const { error } = await admin
		.from('conferences')
		.update({
			status: 'published',
			start_date: isoDateInDays(APPLICATIONS_PHASE_START_IN_DAYS),
			end_date: isoDateInDays(APPLICATIONS_PHASE_START_IN_DAYS + 2),
			applications_open_at: opensAt,
			applications_close_at: closesAt
		})
		.eq('id', conferenceId);

	if (error) {
		throw new Error(`Could not publish the test conference: ${error.message}`);
	}
}

/**
 * Archive the conference `publishTakingApplications` published, so it leaves
 * the directory, which lists published conferences that are not over.
 */
async function takeOutOfTheDirectory(conferenceId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('conferences')
		.update({ status: 'archived' })
		.eq('id', conferenceId);

	if (error) {
		throw new Error(`Could not archive the test conference: ${error.message}`);
	}
}

/** Take that application away again, so no later run counts it twice. */
async function clearApplication(applicationId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin.from('applications').delete().eq('id', applicationId);

	if (error) {
		throw new Error(`Could not delete the test application: ${error.message}`);
	}
}

test('sends a visitor to sign in, and back to the organiser area afterwards', async ({ page }) => {
	const user = await createTestUser();

	await page.goto('/manage');

	await expect(page).toHaveURL('/login?next=%2Fmanage');

	// Signing in by hand rather than with `signIn`, which starts at `/login`
	// with nowhere in particular to go: the half being proved here is that the
	// address the visitor asked for is carried through the form and back.
	await page.getByLabel('Email').fill(user.email);
	await page.getByLabel('Password').fill(TEST_PASSWORD);
	await page.getByRole('button', { name: 'Log in' }).press('Enter');

	await expect(page).toHaveURL('/manage', { timeout: DATABASE_TIMEOUT_MS });
});

test('tells a brand-new account that it is organising nothing yet', async ({ page }) => {
	const user = await createTestUser();
	await signIn(page, user);

	await page.goto('/manage');

	const main = page.getByRole('main');

	await expect(main.getByRole('heading', { level: 1 })).toHaveText('Your conferences', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(
		main.getByRole('heading', { name: 'You are not organising anything yet.' })
	).toBeVisible();
	await expect(
		main.getByText('Create a conference to get an organisation and a management area.')
	).toBeVisible();

	// The empty state's button, not the one in the page header beside the title,
	// which says "Create conference" without the "a". The profile menu holds the
	// same words as this one, which is why it is looked for inside `<main>`.
	await main.getByRole('link', { name: 'Create a conference' }).click();

	await expect(page).toHaveURL('/create', { timeout: DATABASE_TIMEOUT_MS });
});

test('lists a conference the account created under its own organisation', async ({ page }) => {
	const user = await createTestUser('Priya Nair');
	await signIn(page, user);

	const conferenceName = unusedName('Utrecht Model United Nations');
	const organizationName = unusedName('Utrecht MUN Society');
	const managePath = await createDraftConference(user, {
		name: conferenceName,
		organizationName
	});

	await page.goto('/manage');

	const main = page.getByRole('main');

	// The line at the foot of the page names each organisation and what the
	// reader is in it. Creating an organisation makes the creator its owner.
	await expect(main.getByText(`${organizationName} · you are the owner`)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// A conference made here is a draft, which is what the line under its name
	// says until somebody publishes it.
	await expect(main.getByText(`${organizationName} · Delft · draft, not public`)).toBeVisible();

	// The name is a link. A draft has no dashboard yet, so it goes back into
	// the creation flow, on the step the draft reached, which for the draft
	// `createDraftConference` makes is Setup. Following it rather than reading
	// its `href`: SvelteKit writes an address relative to the page it is on, so
	// the attribute holds only part of it until the browser has worked the rest
	// out.
	await main.getByRole('link', { name: conferenceName }).click();

	await expect(page).toHaveURL(`/create/${slugOf(managePath)}/setup`, {
		timeout: DATABASE_TIMEOUT_MS
	});
});

test('deletes a draft from its row once the organiser says yes', async ({ page }) => {
	const user = await createTestUser('Priya Nair');
	await signIn(page, user);

	const conferenceName = unusedName('Leiden Model United Nations');
	const organizationName = unusedName('Leiden MUN Society');

	await createDraftConference(user, { name: conferenceName, organizationName });

	await page.goto('/manage');

	const main = page.getByRole('main');
	const row = main.getByRole('listitem').filter({ hasText: conferenceName });

	await expect(row).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	// The dialog sits inside the row and has a "Delete" of its own, which the
	// browser hides while the dialog is shut. So the row's button is the first.
	await row.getByRole('button', { name: 'Delete', exact: true }).first().press('Enter');

	// With JavaScript the press opens the dialog; without it, the `/confirm`
	// page asks the same question. `waitFor` throwing is the "no dialog" answer.
	const dialogButton = page
		.getByRole('dialog')
		.getByRole('button', { name: 'Delete', exact: true });
	const isAsking = await dialogButton
		.waitFor({ state: 'visible', timeout: 2_000 })
		.then(() => true)
		.catch(() => false);

	if (isAsking) {
		await dialogButton.press('Enter');
	} else {
		await answerConfirmationPage(page, 'Delete');
	}

	await expect(page).toHaveURL('/manage', { timeout: DATABASE_TIMEOUT_MS });
	await expect(page.getByText(`${conferenceName} is deleted.`)).toBeVisible();
	await expect(main.getByRole('link', { name: conferenceName })).toHaveCount(0);
});

test('counts the applications waiting for a decision on the conference row', async ({ page }) => {
	const user = await createTestUser('Priya Nair');
	await signIn(page, user);

	const conferenceName = unusedName('Nijmegen Model United Nations');
	const organizationName = unusedName('Nijmegen MUN Society');
	const managePath = await createDraftConference(user, {
		name: conferenceName,
		organizationName
	});

	// The slug is the last part of `/manage/<slug>`, and the id is what the
	// application row has to point at.
	const slug = managePath.split('/').pop() ?? '';
	const conferenceId = await readConferenceId(slug);
	const committeeId = await addCommittee(conferenceId);
	const applicationId = await applyToConference(conferenceId, committeeId);

	try {
		await publishTakingApplications(conferenceId);
		await page.goto('/manage');

		const main = page.getByRole('main');

		// One waiting application reads "1 application to review", not
		// "1 applications to review".
		await expect(main.getByText('1 application to review')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(main.getByRole('link', { name: 'Review applications' })).toBeVisible();
	} finally {
		// In a `finally`, so that a failed assertion still leaves nothing behind
		// and nothing in the directory.
		await clearApplication(applicationId);
		await takeOutOfTheDirectory(conferenceId);
	}
});

// The row used to count the six setup steps a draft had left. A draft is now
// finished in the creation flow (Trello fe3reN7Y), which keeps its own place,
// so the row only says that the draft is not done and where to carry on.
test('says a draft is being set up and offers to carry on with it', async ({ page }) => {
	const user = await createTestUser('Priya Nair');
	await signIn(page, user);

	const conferenceName = unusedName('Maastricht Model United Nations');
	const organizationName = unusedName('Maastricht MUN Society');
	const managePath = await createDraftConference(user, { name: conferenceName, organizationName });

	await page.goto('/manage');

	const main = page.getByRole('main');
	const row = main.getByRole('listitem').filter({ hasText: conferenceName });

	await expect(row.getByText('Finish setting it up to go public')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(row.getByText('being set up')).toBeVisible();

	// "Continue setup" goes where the name goes: the step the draft reached.
	await row.getByRole('link', { name: 'Continue setup' }).click();

	await expect(page).toHaveURL(`/create/${slugOf(managePath)}/setup`, {
		timeout: DATABASE_TIMEOUT_MS
	});

	// Nothing is taken away at the end: the conference is a draft from beginning
	// to end, and `/conferences` lists published conferences only, so nothing
	// another test counts can see it.
});

test('opens the first setup step of a brand-new draft', async ({ page }) => {
	const user = await createTestUser('Priya Nair');
	await signIn(page, user);

	const conferenceName = unusedName('Leiden Model United Nations');
	const organizationName = unusedName('Leiden MUN Society');

	// The creation flow is where a draft is finished now, but the management
	// pages still serve a draft that is sent to them by address, and Details is
	// the first of them. A draft has no dashboard yet.
	const managePath = await createDraftConference(user, { name: conferenceName, organizationName });

	await page.goto(`${managePath}/details`);

	const main = page.getByRole('main');

	await expect(main.getByRole('heading', { level: 1 })).toHaveText('Details', {
		timeout: DATABASE_TIMEOUT_MS
	});
	// The line above the title says where the step is in the six. Matched
	// whole, because the footer at the bottom of the page starts with the same
	// words and goes on to name the next step.
	await expect(main.getByText('Step 1 of 6', { exact: true })).toBeVisible();

	// The sidebar of the organiser frame. `aria-label` is what names a
	// navigation for a screen reader, and this page has two of them: the top
	// bar's "Main" and this one. On a phone it is a section menu, which has to
	// be opened. While the conference is a draft it lists the setup steps, and
	// has no dashboard to link to.
	const sidebar = await openManageNavigation(page);

	await expect(sidebar.getByRole('link', { name: 'Details', exact: true })).toBeVisible();
	await expect(sidebar.getByRole('link', { name: 'Dashboard' })).toHaveCount(0);
});

test('opens the management area of a published conference for its organiser', async ({ page }) => {
	const organiser = await createTestUser('Priya Nair');

	await makeConferenceStaff(organiser, SEEDED_CONFERENCE_ID, 'organiser');

	try {
		await signIn(page, organiser);
		await page.goto(`/manage/${SEEDED_CONFERENCE_SLUG}`);

		const main = page.getByRole('main');

		await expect(main.getByRole('heading', { level: 1 })).toHaveText(SEEDED_CONFERENCE_NAME, {
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(
			(await openManageNavigation(page)).getByRole('link', { name: 'Dashboard' })
		).toBeVisible();
	} finally {
		// In a `finally`, so that a failed assertion still leaves the conference
		// as the next test expects to find it.
		await removeConferenceStaff(organiser.id, SEEDED_CONFERENCE_ID);
	}
});

test('answers somebody who helps run nothing with a 404, not a redirect', async ({ page }) => {
	const stranger = await createTestUser();
	await signIn(page, stranger);

	const response = await page.goto(`/manage/${SEEDED_CONFERENCE_SLUG}`);

	// A 404 rather than a 403, so that the page does not tell a stranger which
	// conferences exist, and rather than a redirect, which is only for visitors
	// who are not signed in at all.
	expect(response?.status()).toBe(404);
	await expect(page).toHaveURL(`/manage/${SEEDED_CONFERENCE_SLUG}`);
});

test('lists a conference the account only helps with in its own section', async ({ page }) => {
	const chair = await createTestUser('Noor Haddad');

	await makeConferenceStaff(chair, SEEDED_CONFERENCE_ID, 'chair');

	try {
		await signIn(page, chair);
		await page.goto('/manage');

		const main = page.getByRole('main');

		await expect(main.getByRole('heading', { name: 'Conferences you help with' })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(main.getByText(SEEDED_CONFERENCE_NAME)).toBeVisible();
		// The line under the name ends with the role, in words, so it says which
		// of the three roles this is.
		await expect(main.getByText(/· Chair$/)).toBeVisible();

		// A chair is not a member of the organisation that runs the conference,
		// so the conference is in that section and nowhere else: the organisation
		// has no section of its own on this reader's page, and no line at its foot.
		await expect(main.getByRole('heading', { name: SEEDED_ORGANIZATION_NAME })).toHaveCount(0);
		await expect(main.getByText(`${SEEDED_ORGANIZATION_NAME} · you are`)).toHaveCount(0);
	} finally {
		// In a `finally`, so that a failed assertion still leaves the conference
		// as the next test expects to find it.
		await removeConferenceStaff(chair.id, SEEDED_CONFERENCE_ID);
	}
});

test('names a conference of the organisation the account holds no role on, without opening it', async ({
	page
}) => {
	const organiser = await createTestUser('Ines Duarte');
	const member = await createTestUser('Tomasz Wilk');
	const conference = await createPublishedConferenceFor(organiser, {
		name: unusedName('Porto Model United Nations')
	});

	// An ordinary member of the organisation, on no conference's team. Owners
	// and admins of an organisation are administrators of every conference it
	// runs (docs/roles-and-permissions.md, section 2), so only a member can be
	// off the team. The organisation is this test's own, so nothing needs undoing.
	const { error } = await createServiceRoleClient()
		.from('organization_members')
		.insert({ organization_id: conference.organizationId, user_id: member.id, role: 'member' });

	if (error) {
		throw new Error(`Could not add the test member: ${error.message}`);
	}

	await signIn(page, member);
	await page.goto('/manage');

	const main = page.getByRole('main');

	// Named, so the member knows it exists, but not a link: its pages answer a
	// 404 until the team gives the member a role.
	await expect(main.getByText(conference.name, { exact: true })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(main.getByRole('link', { name: conference.name })).toHaveCount(0);
	await expect(main.getByText('Not on the team')).toBeVisible();

	const response = await page.goto(`/manage/${conference.slug}`);

	expect(response?.status()).toBe(404);
});

test('shows a waiting invitation and joins the organisation when it is accepted', async ({
	page
}) => {
	const invited = await createTestUser('Noor Haddad');
	const token = await inviteToOrganization(invited, INVITING_ORGANIZATION_ID);

	try {
		await signIn(page, invited);
		await page.goto('/manage');

		const main = page.getByRole('main');

		await expect(
			main.getByText(`You were invited to ${INVITING_ORGANIZATION_NAME} as Member.`)
		).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

		// A button in a real form posting to a form action, so accepting works on
		// the `desktop-no-js` project as well, which is the criterion this test
		// proves.
		await main.getByRole('button', { name: 'Accept' }).click();

		await expect(page).toHaveURL('/manage', { timeout: DATABASE_TIMEOUT_MS });

		// The organisation now has a line of its own at the foot of the page,
		// which is what being a member of it looks like, and the invitation is
		// gone rather than merely further down the page.
		await expect(main.getByText(`${INVITING_ORGANIZATION_NAME} · you are a member`)).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(main.getByText('You were invited to')).toHaveCount(0);
	} finally {
		// In a `finally`, so that a failed assertion still leaves the seeded
		// organisation as the next test expects to find it.
		await clearInvite(token, invited.id, INVITING_ORGANIZATION_ID);
	}
});

test('keeps the organiser area out of the shell for somebody who runs nothing', async ({
	page
}, testInfo) => {
	const user = await createTestUser('Daniel Perez');
	await signIn(page, user);

	// About the top bar rather than the page, so nothing here is scoped to
	// `<main>`. `banner` is the role a `<header>` has.
	const topBar = page.getByRole('banner');

	// Wait for the bar to be drawn before saying that something is missing from
	// it, or the assertion would pass on an empty screen. The logo is what to
	// wait for: the links themselves are in a menu that is shut on a phone.
	await expect(topBar.getByRole('link', { name: 'MUNMeet' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(topBar.getByRole('link', { name: 'Manage', exact: true })).toHaveCount(0);

	// Since T165 the profile menu has no way into the organiser area for
	// anybody; "Manage" in the bar is it. The menu is a shadcn dropdown, which
	// only JavaScript opens, so without it there is nothing more to look in.
	if (testInfo.project.use.javaScriptEnabled === false) {
		return;
	}

	// The person's picture is what to press: on a phone their name steps aside
	// and the button is named for a screen reader by `aria-label` alone.
	await topBar.getByRole('button', { name: user.fullName }).click();

	await expect(page.getByRole('menuitem', { name: 'Log out' })).toBeVisible();
	await expect(page.getByRole('menuitem', { name: 'Organiser area' })).toHaveCount(0);
});

test('offers the organiser area in the top bar to somebody who runs a conference', async ({
	page
}, testInfo) => {
	const organiser = await createTestUser('Amara Okafor');

	await makeConferenceStaff(organiser, SEEDED_CONFERENCE_ID, 'organiser');

	try {
		await signIn(page, organiser);

		const topBar = page.getByRole('banner');

		// The links are in the bar itself from `lg` up. On a phone they are in
		// the slide-in menu instead, a dialog drawn over the page only once its
		// button is pressed.
		let linkArea = topBar;

		if (testInfo.project.name === 'phone') {
			await topBar.getByRole('button', { name: 'Menu' }).click();
			linkArea = page.getByRole('dialog', { name: 'Menu' });
		}

		await linkArea.getByRole('link', { name: 'Manage', exact: true }).click({
			timeout: DATABASE_TIMEOUT_MS
		});

		await expect(page).toHaveURL('/manage', { timeout: DATABASE_TIMEOUT_MS });

		// The account menu no longer repeats the way in (T165). It is a shadcn
		// dropdown, which only JavaScript opens.
		if (testInfo.project.use.javaScriptEnabled === false) {
			return;
		}

		await topBar.getByRole('button', { name: organiser.fullName }).click();
		await expect(page.getByRole('menuitem', { name: 'Log out' })).toBeVisible();
		await expect(page.getByRole('menuitem', { name: 'Organiser area' })).toHaveCount(0);
	} finally {
		// In a `finally`, so that a failed assertion still leaves the conference
		// as the next test expects to find it.
		await removeConferenceStaff(organiser.id, SEEDED_CONFERENCE_ID);
	}
});

test('warns that fees cannot be collected until Stripe is connected', async ({ page }) => {
	const user = await createTestUser('Priya Nair');
	await signIn(page, user);

	const conferenceName = unusedName('Groningen Model United Nations');
	const organizationName = unusedName('Groningen MUN Society');
	const managePath = await createDraftConference(user, {
		name: conferenceName,
		organizationName
	});

	await page.goto('/manage');

	const main = page.getByRole('main');

	// A brand-new organisation has connected nothing, so the line at the foot
	// of the page says so from the moment it exists.
	await expect(
		main.getByText('Stripe is not connected, so fees cannot be paid by card yet.')
	).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	const slug = managePath.split('/').pop() ?? '';
	const organizationId = await readOrganizationId(slug);
	const organizationSlug = await readOrganizationSlug(organizationId);

	/*
		The line says what is wrong; its two links say where to put it right. Both
		lead to the organisation's own settings page, because one Stripe account
		serves every conference the organisation runs. The address is matched at
		the end rather than in full, because `resolve()` from `$app/paths` answers
		a *relative* address while a page is being built on the server, so without
		JavaScript the attribute reads `./organizations/<slug>`.
	*/
	const settingsAddress = new RegExp(`manage/organizations/${organizationSlug}$`);

	await expect(main.getByRole('link', { name: 'Connect Stripe' })).toHaveAttribute(
		'href',
		settingsAddress
	);
	await expect(main.getByRole('link', { name: 'Organisation settings' })).toHaveAttribute(
		'href',
		settingsAddress
	);

	// And it really goes there: the settings page names the organisation in its
	// own heading.
	await main.getByRole('link', { name: 'Connect Stripe' }).click();

	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
		organizationName,
		{ timeout: DATABASE_TIMEOUT_MS }
	);

	await connectStripe(organizationId);

	await page.goto('/manage');

	// The same line now says that Stripe is connected, which is also what says
	// the page has been drawn again before the warning is called gone.
	await expect(
		main.getByText(`${organizationName} · you are the owner · Stripe is connected.`)
	).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(main.getByText('Stripe is not connected')).toHaveCount(0);

	// "Connect Stripe" goes with the warning; "Organisation settings" stays,
	// because there is always something to keep in order on an organisation's
	// page.
	await expect(main.getByRole('link', { name: 'Connect Stripe' })).toHaveCount(0);
	await expect(main.getByRole('link', { name: 'Organisation settings' })).toBeVisible();
});

test('nothing spills off the side of a phone screen', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	const user = await createTestUser('Priya Nair');
	await signIn(page, user);

	// Long names on purpose. A line that may not wrap is as wide as its text
	// however narrow its column is, which is what pushes a page sideways, and a
	// short name would never show it.
	const conferenceName = unusedName('Phone Overflow International Model United Nations Conference');
	const organizationName = unusedName('Phone Overflow International MUN Organising Society');

	await createDraftConference(user, { name: conferenceName, organizationName });

	await page.goto('/manage');

	// Wait for the row before measuring, or the page would be measured before
	// the thing this test is about is on it. The name's link rather than its
	// text: the row's delete dialog names the conference too.
	await expect(page.getByRole('main').getByRole('link', { name: conferenceName })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	await expectNoSidewaysOverflow(page);
});

test('fits a full organiser area into a couple of screens', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough to measure a height.');

	const user = await createTestUser('Priya Nair');

	// Both halves of the page at once: an organisation of the account's own with
	// a conference under it, and a conference it only helps with. A page is
	// measured full, because it is the sections with rows in them that make it
	// grow.
	await makeConferenceStaff(user, SEEDED_CONFERENCE_ID, 'chair');

	try {
		await signIn(page, user);

		const conferenceName = unusedName('Height Check MUN');
		const organizationName = unusedName('Height Check MUN Society');

		await createDraftConference(user, { name: conferenceName, organizationName });

		await page.goto('/manage');

		const main = page.getByRole('main');

		// The name's link, because the row's delete dialog names the conference too.
		await expect(main.getByRole('link', { name: conferenceName })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(main.getByText(SEEDED_CONFERENCE_NAME)).toBeVisible();

		// Saved before the assertion, so that a failure leaves a picture of the
		// page that failed it.
		await saveFullPageScreenshot(page, 'manage');
		await expectPageFitsInScreens(page, MANAGE_SCREENS);
	} finally {
		// In a `finally`, so that a failed assertion still leaves the conference
		// as the next test expects to find it.
		await removeConferenceStaff(user.id, SEEDED_CONFERENCE_ID);
	}
});
