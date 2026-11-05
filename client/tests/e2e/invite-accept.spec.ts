import { expect, test, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	createTestUser,
	PRESET_ROLE_NAMES,
	presetRoleId,
	readRoleNames,
	signIn,
	TEST_PASSWORD,
	type TestUser
} from './signed-in-user';
import { createDraftConferenceFor } from './draft-conference';
import {
	expectNoSidewaysOverflow,
	expectPageFitsInScreens,
	saveFullPageScreenshot
} from './page-shape';

// The acceptance criteria of `specs/05-pages/auth/invite.md` that need a real
// browser: the page at `/invites/[token]`, where a link an organiser sent turns
// into a place on a conference's team.
//
// * a visitor who is not signed in is sent to sign up, and lands back on the
//   invitation once the account exists;
// * accepting puts the person on the team and sends them to the page their new
//   role gives them;
// * an invitation sent to another address, one that has run out and one that
//   has already been used each say so in the words the spec gives;
// * a token nothing matches says so rather than showing an empty card;
// * the page names itself in the browser tab;
// * it does not spill off the side of a phone, and does not run on for screens
//   on a desktop.
//
// The organiser's half of the same invitation — the form that creates one, the
// pending list and the team page — is `tests/e2e/manage-team.spec.ts`.
//
// WITHOUT JAVASCRIPT
// "Works without JavaScript" is met by these tests running on the
// `desktop-no-js` project like every other browser test, rather than by a test
// of its own. Accepting is a real submit button in a real `<form method="post">`
// and every other control on the page is a link, so a browser with no script
// does all of it. The two tests that measure the page are the exception: they
// ask the browser for its own dimensions, and each runs on one project alone.
//
// One criterion is not here. "The token is never logged" is about what the
// server writes to its own output, which no browser can see; it is a reading of
// `+page.server.ts` rather than a test.
//
// WHAT THESE TESTS LEAVE BEHIND
// An invitation is a row like any other and nothing clears it before the next
// `pnpm db:reset`, so every test that writes one on a conference of
// `supabase/seed.sql` deletes it again in a `finally`. The conference they use
// is the draft of the third sample organisation, which no other browser test
// reads and which is never listed to a visitor. The two tests that accept an
// invitation give a new account a conference of its own through
// `./draft-conference` instead, so the team they join is their own; those are
// dated in 2020 for the reason `manage-committees.spec.ts` gives, and one of
// them is published, which is safe because `/conferences` lists conferences
// that are published *and* have not finished.
//
// The three projects run at the same time against the one local database, so
// every account, every conference and every invitation below is made fresh by
// the test that uses it.

/**
 * How long an assertion that waits on a page reading the database may take.
 *
 * Longer than the five seconds Playwright waits by default, for the reason
 * `tests/e2e/conferences.spec.ts` gives: every test in the run asks the one
 * local database at once, and an answer has taken up to eight seconds.
 */
const DATABASE_TIMEOUT_MS = 15_000;

/**
 * How long a single try inside a block that is watching for something may take.
 *
 * Short on purpose: it is asked only once the page has already arrived, and the
 * answer "it is not there" is one of the two this file expects.
 */
const SINGLE_TRY_TIMEOUT_MS = 2_000;

/**
 * First-Year MUN 2027, the draft conference of the third sample organisation in
 * `supabase/seed.sql`.
 *
 * It is the one the invitations below are for. A draft is never listed to a
 * visitor and no other browser test reads this one, so an invitation hanging
 * off it changes nothing anybody else counts. `manage.spec.ts` picks the same
 * organisation for its own invitation test and for the same reason.
 */
const SEEDED_CONFERENCE_ID = '20000000-0000-4000-8000-000000000017';

/**
 * Sofia Almeida, a sample account from `supabase/seed.sql`, named as the person
 * who sent those invitations. `invites.invited_by` has to be a real account,
 * and the page puts the name in every sentence it draws.
 */
const SEEDED_INVITER_ID = '50000000-0000-4000-8000-000000000001';
const SEEDED_INVITER_NAME = 'Sofia Almeida';

/**
 * The days every conference these tests create runs on.
 *
 * Both are in the past, for the reason at the top of this file.
 */
const CONFERENCE_FIRST_DAY = '2020-05-03';
const CONFERENCE_LAST_DAY = '2020-05-05';

/**
 * How many windows tall the invitation page may be.
 *
 * It is one centred card holding a sentence and two buttons, in the same frame
 * the six auth pages sit in, so two screens is already generous: anything
 * taller would mean a reader has to scroll to find the button that is the whole
 * point of the page.
 */
const INVITE_SCREENS = 2;

/**
 * A name nothing else in the database will match, so that a test can read its
 * own conference's name back off a page without another run's rows getting in
 * the way.
 */
function unusedName(prefix: string): string {
	return `${prefix} ${crypto.randomUUID().slice(0, 8)}`;
}

/** An address nobody has an account for, which is who an invitation is usually sent to. */
function unusedEmail(): string {
	return `e2e-invite-${crypto.randomUUID()}@example.com`;
}

/** The address of one invitation. The token is the secret, so it is the whole address. */
function invitePath(token: string): string {
	return `/invites/${token}`;
}

/** What a test wants its invitation to be. Everything else is filled in below. */
type NewInvite = {
	conferenceId: string;
	/** The account the invitation is sent from, whose name the page shows. */
	invitedBy: string;
	email: string;
	role: 'organiser' | 'chair' | 'volunteer';
	/** A committee to chair, which only a chair invitation may name. */
	committeeId?: string;
	/** An ISO timestamp. Fourteen days from now when it is not given. */
	expiresAt?: string;
	/** Who used it already, for an invitation that has been accepted before. */
	acceptedBy?: string;
};

/**
 * Write an invitation straight into the table, and answer its token.
 *
 * The form that sends one is the team page, which has tests of its own in
 * `tests/e2e/manage-team.spec.ts`; this file is about the link, so it is handed
 * one rather than filling that form in — and three of the tests below need an
 * invitation no form can make, one that has run out or has already been used.
 * The service-role client stands in for the organiser the way `giveSeat` in
 * `./signed-in-user` stands in for allocation. `token` holds 32 url-safe
 * characters, which is what a UUID with its dashes taken out is.
 */
async function addInvite(invite: NewInvite): Promise<string> {
	const admin = createServiceRoleClient();
	const token = crypto.randomUUID().replaceAll('-', '');

	const { error } = await admin.from('invites').insert({
		kind: 'conference_staff',
		conference_id: invite.conferenceId,
		committee_id: invite.committeeId ?? null,
		email: invite.email,
		role_id: await presetRoleId(invite.conferenceId, PRESET_ROLE_NAMES[invite.role]),
		token,
		invited_by: invite.invitedBy,
		// The column has a default of fourteen days, and only the expired test
		// says otherwise.
		...(invite.expiresAt ? { expires_at: invite.expiresAt } : {}),
		...(invite.acceptedBy
			? { accepted_at: new Date().toISOString(), accepted_by: invite.acceptedBy }
			: {})
	});

	if (error) {
		throw new Error(`Could not write the test invitation: ${error.message}`);
	}

	return token;
}

/**
 * Take an invitation away again.
 *
 * Every test that hangs one off a conference of `supabase/seed.sql` calls this
 * in a `finally`, so that a failed assertion still leaves the seed as the next
 * test expects to find it.
 */
async function deleteInvite(token: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin.from('invites').delete().eq('token', token);

	if (error) {
		throw new Error(`Could not delete the test invitation: ${error.message}`);
	}
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
 * and answer its `/manage/<slug>` address.
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

/** A conference somebody else runs, which is what an invitation invites a person into. */
type TestConference = {
	/** The organiser who sent the invitation. */
	organiser: TestUser;
	id: string;
	slug: string;
	name: string;
};

/**
 * Sign a brand-new account in, give it a conference of its own, and hand back
 * what an invitation to that conference needs.
 *
 * The page the reader lands on after accepting depends on the conference, so
 * the two tests that accept one work on a conference of their own rather than
 * on a sample.
 */
async function createConferenceToBeInvitedTo(page: Page, prefix: string): Promise<TestConference> {
	const organiser = await createTestUser('Priya Nair');
	await signIn(page, organiser);

	const name = unusedName(prefix);
	const organizationName = unusedName(`${prefix} Society`);
	const managePath = await createDraftConference(organiser, { name, organizationName });
	const slug = managePath.split('/').pop() ?? '';
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('conferences')
		.select('id')
		.eq('slug', slug)
		.maybeSingle();

	if (error || !data) {
		throw new Error(`Could not find the conference "${slug}": ${error?.message}`);
	}

	return { organiser, id: data.id, slug, name };
}

/**
 * Publish a conference without going through the dashboard.
 *
 * A committee's public page belongs to a conference that is public, and
 * publishing is the dashboard's work with its own tests in
 * `manage-dashboard.spec.ts`, so the service-role client sets the column rather
 * than this file walking the checklist to get there. The conference is dated in
 * 2020, so publishing it puts it in no list anybody counts.
 */
async function publishConference(conferenceId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('conferences')
		.update({ status: 'published' })
		.eq('id', conferenceId);

	if (error) {
		throw new Error(`Could not publish the test conference: ${error.message}`);
	}
}

/** One committee, as the chair invitation below needs it. */
type TestCommittee = {
	id: string;
	name: string;
	/** The last part of its public address. */
	slug: string;
};

/** Write one committee straight into the table, for a chair to be invited to. */
async function addCommittee(conferenceId: string, name: string): Promise<TestCommittee> {
	const admin = createServiceRoleClient();
	const slug = `committee-${crypto.randomUUID().slice(0, 8)}`;

	const { data, error } = await admin
		.from('committees')
		.insert({
			conference_id: conferenceId,
			name,
			slug,
			level: 'intermediate',
			topics: ['The first topic'],
			position: 0
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test committee: ${error?.message}`);
	}

	return { id: data.id, name, slug };
}

/**
 * Somebody's place on the team as the tests below read it back, or nothing at
 * all: the names of the roles they hold, sorted, and their title.
 */
type StaffRow = {
	roles: string[];
	title: string | null;
};

/** What the database says somebody is on this conference, or `null` when they are on nothing. */
async function readStaff(conferenceId: string, userId: string): Promise<StaffRow | null> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('conference_staff')
		.select('title')
		.eq('conference_id', conferenceId)
		.eq('user_id', userId)
		.maybeSingle();

	if (error) {
		throw new Error(`Could not read the test team row: ${error.message}`);
	}

	if (!data) {
		return null;
	}

	return { roles: await readRoleNames(userId, conferenceId), title: data.title };
}

/** The committees somebody chairs, which is the other row accepting a chair invite writes. */
async function readChairedCommitteeIds(userId: string): Promise<string[]> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('committee_chairs')
		.select('committee_id')
		.eq('user_id', userId);

	if (error || !data) {
		throw new Error(`Could not read the test chair rows: ${error?.message}`);
	}

	return data.map((row) => row.committee_id);
}

/**
 * Sign a second account in where the first one is.
 *
 * Clearing the cookies is what ends the session that is already there; without
 * it `/login` would send an account that is signed in somewhere else.
 * `manage-committees.spec.ts` changes accounts the same way.
 */
async function signInInstead(page: Page, user: TestUser): Promise<void> {
	await page.context().clearCookies();
	await signIn(page, user);
}

/** Wait until the invitation card itself has arrived, before pressing anything on it. */
async function expectInvitationCard(page: Page): Promise<void> {
	await expect(page.getByRole('heading', { level: 1, name: 'You are invited.' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
}

/**
 * Press "Accept invite" if the page is still offering it.
 *
 * The three refusals come from `accept_invite`, so a page that only finds out
 * when it asks shows them after the press; a page that can see the same thing
 * in what `get_invite` already answered may say so before, and then there is no
 * button left to press. Both are the right behaviour and the criterion is the
 * message either way, so this presses only when there is something to press.
 */
async function acceptIfOffered(page: Page): Promise<void> {
	const accept = page.getByRole('button', { name: 'Accept invite' });

	// `waitFor` throws when nothing turns up in the time it is given, and that is
	// the "the page has already refused" answer.
	const isOffered = await accept
		.waitFor({ state: 'visible', timeout: SINGLE_TRY_TIMEOUT_MS })
		.then(() => true)
		.catch(() => false);

	if (isOffered) {
		await accept.press('Enter');
	}
}

/*
	Most tests here sign an account in, and two of them give it a conference
	first and then sign a second account in over the top. That is a
	great deal more than most browser tests do, and thirty seconds — what
	Playwright allows a test by default — is not always enough for it while the
	whole suite is asking the one local database at once. `test.slow()` triples
	that allowance. It is an allowance and not a wait: a test that is quick still
	finishes as quickly as it can.
*/
test.beforeEach(() => {
	test.slow();
});

test('shows what a chair invitation is for, and accepts it', async ({ page }) => {
	const conference = await createConferenceToBeInvitedTo(page, 'Chair Invite MUN');
	const committee = await addCommittee(conference.id, unusedName('Security Council'));

	await publishConference(conference.id);

	const chair = await createTestUser('Noor Haddad');
	const token = await addInvite({
		conferenceId: conference.id,
		invitedBy: conference.organiser.id,
		email: chair.email,
		role: 'chair',
		committeeId: committee.id
	});

	await signInInstead(page, chair);
	await page.goto(invitePath(token));

	await expect(page).toHaveTitle('Invitation · MUNMeet');
	await expectInvitationCard(page);

	/*
		Who invited them, what to, and as what. The sentence is matched with a
		pattern rather than word for word because the page file's wireframe writes
		"invited you to join" and the page leaves "join" out; what this test is
		really about is that all three names are in it and that the role is the
		lowercase word the spec's table gives. The full stop at the end is part of
		the pattern because the page draws the sentence twice over: the whole line
		is a paragraph, and the part before the full stop is a `<span>` inside it,
		so a pattern that stopped at "chair" would match both and Playwright would
		refuse to choose between them.
	*/
	await expect(
		page.getByText(
			new RegExp(
				`${conference.organiser.fullName} invited you to (join )?${conference.name} as chair\\.`
			)
		)
	).toBeVisible();

	// A chair invited to a particular committee is told which one, and every
	// invitation says which address it was sent to, so that somebody signed in
	// with a second account can see why it is refusing them.
	await expect(page.getByText(`Committee: ${committee.name}`)).toBeVisible();
	await expect(page.getByText(`Invite sent to ${chair.email}`)).toBeVisible();

	// The way out, for somebody who would rather not.
	await expect(page.getByRole('link', { name: 'Not now' })).toHaveAttribute('href', /\/home$/);

	await page.getByRole('button', { name: 'Accept invite' }).press('Enter');

	/*
		Straight into the committee's chair room (T176). `get_invite` answers
		with the committee's name and not its slug, so after accepting the page
		reads the new chair's own `committee_chairs` rows and finds the one
		committee of that name in this conference (`05-pages/auth/invite.md`).
	*/
	await expect(page).toHaveURL(
		`/conferences/${conference.slug}/committees/${committee.slug}/chair`,
		{ timeout: DATABASE_TIMEOUT_MS }
	);
	await expect(page.getByText(`You joined ${conference.name}.`)).toBeVisible();

	// Both rows: a place on the team, and the committee they now chair. They are
	// read back off the committee's own page, which lists its chairs to anybody
	// signed in, as well as out of the database.
	await page.goto(`/conferences/${conference.slug}/committees/${committee.slug}`);

	await expect(page.getByRole('main').getByText(chair.fullName)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	expect(await readStaff(conference.id, chair.id)).toEqual({ roles: ['Chair'], title: null });
	expect(await readChairedCommitteeIds(chair.id)).toEqual([committee.id]);
});

test('accepts an organiser invitation and lands in the organiser area', async ({ page }) => {
	const conference = await createConferenceToBeInvitedTo(page, 'Organiser Invite MUN');
	const organiser = await createTestUser('Aiko Tanaka');
	const token = await addInvite({
		conferenceId: conference.id,
		invitedBy: conference.organiser.id,
		email: organiser.email,
		role: 'organiser'
	});

	await signInInstead(page, organiser);
	await page.goto(invitePath(token));

	await expectInvitationCard(page);
	await page.getByRole('button', { name: 'Accept invite' }).press('Enter');

	// An organiser is sent to the conference they now help run, which is a page
	// that answered them with a 404 a moment ago. This one is still a draft, which
	// has no dashboard, so `/manage/<slug>` passes them on into the creation flow
	// at the step the draft reached, Setup, and the welcome comes along.
	await expect(page).toHaveURL(`/create/${conference.slug}/setup`, {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.getByText(`You joined ${conference.name}.`)).toBeVisible();

	// And the organiser area lists it, which is the staff row read back through a
	// page rather than out of the table it was written to. A conference somebody
	// helps with is a row under "Conferences you help with", whose "Manage" link
	// opens it.
	await page.goto('/manage');

	const helpedRow = page
		.getByRole('region', { name: 'Conferences you help with' })
		.getByRole('listitem')
		.filter({ hasText: conference.name });

	await expect(helpedRow).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(helpedRow.getByRole('link', { name: 'Manage' })).toHaveAttribute(
		'href',
		new RegExp(`/manage/${conference.slug}$`)
	);

	expect(await readStaff(conference.id, organiser.id)).toEqual({
		roles: ['Organiser'],
		title: null
	});
});

test('sends a visitor through sign up and back to the invitation', async ({ page }) => {
	const invited = unusedEmail();
	const token = await addInvite({
		conferenceId: SEEDED_CONFERENCE_ID,
		invitedBy: SEEDED_INVITER_ID,
		email: invited,
		role: 'chair'
	});

	try {
		// Nobody is signed in: this is the ordinary case, a link in an email to
		// somebody who has never heard of MUNMeet.
		await page.goto(invitePath(token));
		await page.waitForURL(/\/register/, { timeout: DATABASE_TIMEOUT_MS });

		// The parameters are read rather than the whole address compared, because
		// the order they are written in is the page's business and not this test's.
		const registerUrl = new URL(page.url());

		expect(registerUrl.pathname).toBe('/register');
		// Only the way back travels with the link. The invited address used to be
		// put in the box, which handed it to anybody holding the link (security
		// review L18); the person types the address they were invited at.
		expect(registerUrl.searchParams.get('email')).toBeNull();
		expect(registerUrl.searchParams.get('next')).toBe(invitePath(token));

		await page.getByLabel('Email').fill(invited);
		await page.getByLabel('Full name').fill('Noor Haddad');
		await page.getByLabel('Password').fill(TEST_PASSWORD);
		await page.getByLabel(/I agree to the Terms/).check();
		await page.getByRole('button', { name: 'Create account' }).press('Enter');

		// Not the invitation itself yet: a brand-new account has not answered the
		// welcome questions, and that gate carries the address along.
		await expect(page).toHaveURL(`/welcome?next=${encodeURIComponent(invitePath(token))}`, {
			timeout: DATABASE_TIMEOUT_MS
		});

		// The three required answers, the way `welcome.spec.ts` gives them.
		await page.getByLabel('Institution').fill('Delft University');
		await page.getByLabel('Country').selectOption('NL');
		await page.getByLabel('Several', { exact: true }).check();
		await page.getByRole('button', { name: 'Continue' }).press('Enter');

		// And back where they were heading, with the invitation waiting for them.
		await expect(page).toHaveURL(invitePath(token), { timeout: DATABASE_TIMEOUT_MS });
		await expectInvitationCard(page);
	} finally {
		// In a `finally`, so that a failed assertion still leaves the seeded
		// conference as the next test expects to find it.
		await deleteInvite(token);
	}
});

test('refuses an invitation that was sent to another address', async ({ page }) => {
	const invited = unusedEmail();
	const somebodyElse = await createTestUser('Luis Moreno');
	const token = await addInvite({
		conferenceId: SEEDED_CONFERENCE_ID,
		invitedBy: SEEDED_INVITER_ID,
		email: invited,
		role: 'chair'
	});

	try {
		await signIn(page, somebodyElse);
		await page.goto(invitePath(token));

		await expectInvitationCard(page);
		await acceptIfOffered(page);

		await expect(
			page.getByText(
				`This invite was sent to ${invited}. Log in with that address, or ask ${SEEDED_INVITER_NAME} to invite ${somebodyElse.email}.`
			)
		).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

		// With a way out of the account that is in the way.
		await expect(page.getByRole('link', { name: 'Log out' })).toBeVisible();

		// And nothing happened: the wrong person is on nobody's team.
		expect(await readStaff(SEEDED_CONFERENCE_ID, somebodyElse.id)).toBeNull();
	} finally {
		await deleteInvite(token);
	}
});

test('refuses an invitation that has run out', async ({ page }) => {
	const invited = await createTestUser('Emma Janssen');
	const token = await addInvite({
		conferenceId: SEEDED_CONFERENCE_ID,
		invitedBy: SEEDED_INVITER_ID,
		email: invited.email,
		role: 'volunteer',
		// An invitation lasts fourteen days, so one sent three weeks ago has run
		// out. No form can make this row, which is why it is written by hand.
		expiresAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString()
	});

	try {
		await signIn(page, invited);
		await page.goto(invitePath(token));

		await expectInvitationCard(page);
		await acceptIfOffered(page);

		// The date in the middle of the sentence is the one the invitation ran out
		// on, written the way the rest of the app writes a date, so the two halves
		// around it are what is matched word for word. Nobody is named: once an
		// invitation has run out, `get_invite` withholds who sent it along with
		// whom it was for (security review L18).
		await expect(
			page.getByText(/This invite expired on .+\. Ask the person who invited you for a new one\./)
		).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

		expect(await readStaff(SEEDED_CONFERENCE_ID, invited.id)).toBeNull();
	} finally {
		await deleteInvite(token);
	}
});

test('refuses an invitation that has already been used', async ({ page }) => {
	const invited = await createTestUser('Omar Farouk');
	const token = await addInvite({
		conferenceId: SEEDED_CONFERENCE_ID,
		invitedBy: SEEDED_INVITER_ID,
		email: invited.email,
		role: 'volunteer',
		acceptedBy: invited.id
	});

	try {
		await signIn(page, invited);
		await page.goto(invitePath(token));

		await expectInvitationCard(page);
		await acceptIfOffered(page);

		await expect(page.getByText('This invite was already used.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
	} finally {
		await deleteInvite(token);
	}
});

test('tells somebody holding a token nothing matches that there is no such invitation', async ({
	page
}) => {
	const stranger = await createTestUser('Tom Bakker');
	await signIn(page, stranger);

	// A token of the right shape that was never handed out. The page may not say
	// anything more than this: the token is the only secret an invitation has.
	await page.goto(invitePath(crypto.randomUUID().replaceAll('-', '')));

	await expect(page.getByText('This invite does not exist.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.getByRole('button', { name: 'Accept invite' })).toHaveCount(0);
});

test('does not spill off the side of a phone screen', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	const invited = await createTestUser('Maximiliano Alessandro Fernández de la Vega');
	const token = await addInvite({
		conferenceId: SEEDED_CONFERENCE_ID,
		invitedBy: SEEDED_INVITER_ID,
		email: invited.email,
		role: 'chair'
	});

	try {
		await signIn(page, invited);
		await page.goto(invitePath(token));

		// An address is the longest thing on this card, and an address never wraps
		// at a space, which is what pushes a narrow page sideways.
		await expectInvitationCard(page);
		await expect(page.getByText(`Invite sent to ${invited.email}`)).toBeVisible();

		await expectNoSidewaysOverflow(page);
	} finally {
		await deleteInvite(token);
	}
});

test('fits in a couple of screens', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough to measure a height.');

	const invited = await createTestUser('Sara Lindqvist');
	const token = await addInvite({
		conferenceId: SEEDED_CONFERENCE_ID,
		invitedBy: SEEDED_INVITER_ID,
		email: invited.email,
		role: 'chair'
	});

	try {
		await signIn(page, invited);
		await page.goto(invitePath(token));

		await expectInvitationCard(page);

		// Saved before the assertion, so that a failure leaves a picture of the
		// page that failed it.
		await saveFullPageScreenshot(page, 'invite-accept');
		await expectPageFitsInScreens(page, INVITE_SCREENS);
	} finally {
		await deleteInvite(token);
	}
});
