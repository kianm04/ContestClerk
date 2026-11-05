import type { Page } from '@playwright/test';
import type { Database } from '../../src/lib/database.types';
import { createClientForAccessToken, createServiceRoleClient } from '../db/supabase-test-client';
import { retryWhileTheTokenIsFromTheFuture } from '../db/waiting-out-the-clock';
import { readAccessTokenFromCookies } from './browser-session';

// Signing a browser test in, and giving that account the rows it has to own
// before a page will show it anything: notifications, a place on a conference's
// team, a seat in a committee.
//
// The account is made through Supabase's admin API rather than through the
// register form, because the tests need its user id to attach notifications to,
// and because making an account is not what these tests are about. Signing in
// then happens through the real form, which is. Everything here disappears on
// the next `pnpm db:reset`.

/** Any password that passes the local minimum length. It never leaves these tests. */
export const TEST_PASSWORD = 'test-password-123';

export type TestUser = {
	id: string;
	email: string;
	fullName: string;
	/**
	 * The account's password. Left out for an account `createTestUser` made,
	 * which always has `TEST_PASSWORD`; the walkthrough seed's accounts have
	 * their own (`walkthrough-seed.ts`).
	 */
	password?: string;
};

/** What `createTestUser` may be told to do differently. */
export type TestUserOptions = {
	/** The name on the account. */
	fullName?: string;
	/**
	 * Whether the account has finished `/welcome`.
	 *
	 * It is `true` by default, because almost every test is about a page behind
	 * the onboarding gate and would otherwise be redirected to the welcome form
	 * before it saw anything. `tests/e2e/welcome.spec.ts` is what passes `false`.
	 */
	hasCompletedOnboarding?: boolean;
};

/** A brand-new confirmed account, with a profile row made by `handle_new_user`. */
export async function createTestUser(
	fullNameOrOptions: string | TestUserOptions = {}
): Promise<TestUser> {
	// The first argument used to be the name on its own, and most tests still
	// pass one, so both shapes are accepted.
	const options =
		typeof fullNameOrOptions === 'string' ? { fullName: fullNameOrOptions } : fullNameOrOptions;
	const fullName = options.fullName ?? 'Daniel Perez';
	const hasCompletedOnboarding = options.hasCompletedOnboarding ?? true;

	const admin = createServiceRoleClient();
	const email = `e2e-${crypto.randomUUID()}@example.com`;

	const { data, error } = await admin.auth.admin.createUser({
		email,
		password: TEST_PASSWORD,
		// Local Supabase has confirmation switched off, but saying so here keeps
		// the account usable if that is ever turned on.
		email_confirm: true,
		// `full_name` travels the way the register form sends it. The
		// `handle_new_user` trigger copies it into `profiles.full_name`.
		user_metadata: { full_name: fullName }
	});

	if (error || !data.user) {
		throw new Error(`Could not create the test account: ${error?.message}`);
	}

	if (hasCompletedOnboarding) {
		await completeOnboarding(data.user.id);
	}

	return { id: data.user.id, email, fullName };
}

/**
 * Fill the profile in the way the welcome form would, so the account is not
 * sent back to `/welcome` by every page it visits.
 *
 * The service-role client stands in for the form here because filling the form
 * in is not what these tests are about; `tests/e2e/welcome.spec.ts` does that
 * through the real form.
 */
async function completeOnboarding(userId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('profiles')
		.update({
			institution_name: 'Delft University',
			country_code: 'NL',
			experience_level: 'intermediate',
			onboarding_completed_at: new Date().toISOString()
		})
		.eq('id', userId);

	if (error) {
		throw new Error(`Could not finish onboarding for the test account: ${error.message}`);
	}
}

/**
 * Fill the real login form in, and wait until the page has changed.
 *
 * Signing in with nowhere in particular to go lands on `/home`, and `/home`
 * sends an account that has not answered the welcome questions on to
 * `/welcome`. Both mean the sign in worked, so this waits for either:
 * `tests/e2e/welcome.spec.ts` signs in accounts of the second kind on purpose.
 */
async function submitTheLoginForm(page: Page, user: TestUser): Promise<void> {
	await page.goto('/login');
	await page.getByLabel('Email').fill(user.email);
	await page.getByLabel('Password').fill(user.password ?? TEST_PASSWORD);
	await page.getByRole('button', { name: 'Log in' }).press('Enter');
	await page.waitForURL(/\/(home|welcome)(\?|$)/);
}

/**
 * Sign that account in through the real form, and hand back a browser whose
 * session the database accepts.
 *
 * The second half waits out the refusal the database tests wait out, through
 * the same loop: one request made with the token the app has just minted, and
 * another go with a freshly minted one while PostgREST answers "JWT issued at
 * future" (`PGRST303`). `02-architecture/testing.md` explains the refusal — the
 * Docker clock is corrected against this machine's from time to time, and a
 * correction backwards leaves a brand-new token looking as though it came from
 * the future.
 *
 * It is waited out once here, at the moment the browser is handed over, rather
 * than on every request the way `createSignedInClient` now waits it out. The
 * token belongs to the app rather than to the test: only signing in again mints
 * another, and nothing a test can reach makes the app's server do that in the
 * middle of a page. T80 is that gap.
 *
 * Meeting it here matters more than it does in `tests/db`. The app's server
 * makes those requests rather than the test, so a refusal arrives as a bare 500
 * page in the middle of whatever the test was really checking, and
 * `playwright.config.ts` retries a failed test once, which hides it rather than
 * explains it.
 *
 * `delaysMs` is handed straight on to that loop, so that this function's own
 * tests can wait out a refusal without really waiting. Left out, the loop uses
 * the delays a real run uses, and no browser test passes it.
 */
export async function signIn(
	page: Page,
	user: TestUser,
	delaysMs?: readonly number[]
): Promise<void> {
	await submitTheLoginForm(page, user);

	await retryWhileTheTokenIsFromTheFuture(
		() => readOwnProfileAsTheBrowser(page, user),
		async () => {
			// Only signing in again mints a new token, and `/login` sends a
			// signed-in visitor straight back to `/home`, so the refused session
			// has to go first.
			await page.context().clearCookies();
			await submitTheLoginForm(page, user);
		},
		delaysMs
	);
}

/**
 * The same request the app's server makes first, made with the token the
 * browser now holds: the signed-in account reading its own profile row. Answers
 * the code PostgREST refused it with, or `null` when it was accepted.
 */
async function readOwnProfileAsTheBrowser(page: Page, user: TestUser): Promise<string | null> {
	const accessToken = readAccessTokenFromCookies(await page.context().cookies());
	const asThatAccount = createClientForAccessToken(accessToken);
	const { error } = await asThatAccount.from('profiles').select('id').eq('id', user.id).single();

	return error?.code ?? null;
}

/**
 * The address of a fresh password reset link for this account, as the reset
 * email would carry it: `/auth/confirm?token_hash=…&type=recovery`.
 *
 * It comes from Supabase's admin API rather than from an inbox, because the
 * local stack sends its mail to a sink nobody reads. Opening the address does
 * nothing by itself; the page's one button is what verifies the token
 * (`src/routes/auth/confirm/+page.server.ts`).
 */
export async function resetLinkFor(user: TestUser): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin.auth.admin.generateLink({
		type: 'recovery',
		email: user.email
	});

	if (error || !data.properties?.hashed_token) {
		throw new Error(
			`Could not make a reset link for the test account: ${error?.message ?? 'no token returned'}`
		);
	}

	return `/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=recovery`;
}

/** Open a fresh reset link and press its button, which lands on `/reset-password`. */
async function followAResetLink(page: Page, user: TestUser): Promise<void> {
	await page.goto(await resetLinkFor(user));
	await page.getByRole('button', { name: 'Choose a new password' }).press('Enter');
	await page.waitForURL('/reset-password');
}

/**
 * Sign the browser in the way a password reset does: through a real reset link,
 * pressed on `/auth/confirm`. `/reset-password` turns every other kind of
 * session away (`src/routes/reset-password/+page.server.ts`), so a test of that
 * page cannot use `signIn` above.
 *
 * The clock refusal is waited out exactly as `signIn` waits it out, with a new
 * link each time, because the old one was spent by the press.
 */
export async function signInThroughResetLink(page: Page, user: TestUser): Promise<void> {
	await followAResetLink(page, user);

	await retryWhileTheTokenIsFromTheFuture(
		() => readOwnProfileAsTheBrowser(page, user),
		async () => {
			await page.context().clearCookies();
			await followAResetLink(page, user);
		}
	);
}

/** What a test wants to say about one notification. Everything else is filled in. */
export type NotificationSeed = {
	title: string;
	body?: string;
	linkPath?: string | null;
	/** An ISO timestamp. Defaults to now, so it lands under "Today". */
	createdAt?: string;
	readAt?: string | null;
};

/**
 * Put notifications in the table the way a trigger would.
 *
 * Only triggers may insert a row, and the triggers arrive with the tables whose
 * changes they announce, so the service-role client stands in for one. It is
 * never used to show that something is allowed; `tests/db/notifications.test.ts`
 * does that with the policies themselves.
 */
export async function giveNotifications(user: TestUser, seeds: NotificationSeed[]): Promise<void> {
	const admin = createServiceRoleClient();

	const rows = seeds.map((seed) => ({
		user_id: user.id,
		kind: 'announcement',
		title: seed.title,
		body: seed.body ?? null,
		link_path: seed.linkPath === undefined ? '/conferences' : seed.linkPath,
		created_at: seed.createdAt ?? new Date().toISOString(),
		read_at: seed.readAt ?? null
	}));

	const { error } = await admin.from('notifications').insert(rows);

	if (error) {
		throw new Error(`Could not create the test notifications: ${error.message}`);
	}
}

/**
 * Put somebody on a conference's team, as an organiser or as a chair, so that a
 * test can look at a page only the team may see.
 *
 * The service-role client stands in for the invitation an organiser would send,
 * the way `giveNotifications` above stands in for a trigger: accepting an invite
 * is `tests/e2e/auth.spec.ts` and `tests/db/invites.test.ts` work, not this
 * one's. The row outlives the test, so a test that adds one to a conference
 * other tests read should delete that conference again afterwards.
 */
export async function makeConferenceStaff(
	user: TestUser,
	conferenceId: string,
	role: 'organiser' | 'chair'
): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('conference_staff')
		.insert({ conference_id: conferenceId, user_id: user.id });

	if (error) {
		throw new Error(`Could not put the test account on the conference team: ${error.message}`);
	}

	await givePresetRole(user.id, conferenceId, PRESET_ROLE_NAMES[role]);
}

/**
 * The three roles every conference is made with (docs/roles-and-permissions.md),
 * by the names the `conferences_add_presets` trigger gives them.
 */
export type PresetRoleName = 'Organiser' | 'Chair' | 'Volunteer';

/**
 * The preset standing for each word of the old `staff_role` enum, which the
 * browser tests still speak in: what a page shows is the role's name, and the
 * three presets were named after the three words so that nothing on screen
 * changed.
 */
export const PRESET_ROLE_NAMES: Record<'organiser' | 'chair' | 'volunteer', PresetRoleName> = {
	organiser: 'Organiser',
	chair: 'Chair',
	volunteer: 'Volunteer'
};

/** The id of one of a conference's preset roles, read with the service-role client. */
export async function presetRoleId(conferenceId: string, name: PresetRoleName): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('conference_roles')
		.select('id')
		.eq('conference_id', conferenceId)
		.eq('name', name)
		.single();

	if (error || !data) {
		throw new Error(`Could not find the ${name} role of the test conference: ${error?.message}`);
	}

	return data.id;
}

/**
 * Give a test account one of a conference's preset roles. Since
 * docs/roles-and-permissions.md a staff row only says somebody is on the team;
 * the membership is what lets them do anything, so every helper that writes a
 * staff row writes one of these after it.
 */
export async function givePresetRole(
	userId: string,
	conferenceId: string,
	name: PresetRoleName
): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin.from('conference_role_members').insert({
		conference_id: conferenceId,
		user_id: userId,
		role_id: await presetRoleId(conferenceId, name)
	});

	if (error) {
		throw new Error(`Could not give the test account the ${name} role: ${error.message}`);
	}
}

/**
 * The names of the roles a test account holds on a conference, sorted, which
 * is what the tests read back where they used to read one `role` column.
 */
export async function readRoleNames(userId: string, conferenceId: string): Promise<string[]> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('conference_role_members')
		.select('conference_roles(name)')
		.eq('conference_id', conferenceId)
		.eq('user_id', userId);

	if (error) {
		throw new Error(`Could not read the test account's roles: ${error.message}`);
	}

	return (data ?? [])
		.map((row) => (row.conference_roles as unknown as { name: string } | null)?.name ?? '')
		.filter((name) => name !== '')
		.sort();
}

/**
 * Take a test account off a conference's team again.
 *
 * `makeConferenceStaff` writes a row to a conference the other browser tests
 * read, and nothing clears it before the next `pnpm db:reset`, so every test
 * that adds one takes it away in a `finally`. It lives here beside its pair,
 * the way `giveSeat` and `freeSeat` do.
 */
export async function removeConferenceStaff(userId: string, conferenceId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('conference_staff')
		.delete()
		.eq('conference_id', conferenceId)
		.eq('user_id', userId);

	if (error) {
		throw new Error(`Could not take the test account off the conference team: ${error.message}`);
	}
}

/**
 * Give somebody a named seat in a committee, so that a test can see a page as a
 * delegate does rather than as a visitor.
 *
 * Which seat is asked for rather than chosen here. Every browser test runs on
 * all three projects in `playwright.config.ts` at the same time against one
 * database, and a seat is a single row, so two projects reaching for "the first
 * free seat" would each take the other's. A test gives each project a seat of
 * its own instead.
 *
 * Allocation is T16's work and has no form yet, so the service-role client
 * writes the row the way that task one day will. Always give the seat back with
 * `freeSeat`: nothing else clears it before the next `pnpm db:reset`, and other
 * tests count what is on the committee page.
 */
export async function giveSeat(
	user: TestUser,
	committeeId: string,
	seatName: string
): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('seats')
		.update({ user_id: user.id, allocated_at: new Date().toISOString() })
		.eq('committee_id', committeeId)
		.eq('name', seatName);

	if (error) {
		throw new Error(`Could not give the test account the ${seatName} seat: ${error.message}`);
	}
}

/** Take a seat back, so that one test does not change what the next one sees. */
export async function freeSeat(committeeId: string, seatName: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('seats')
		.update({ user_id: null, allocated_at: null })
		.eq('committee_id', committeeId)
		.eq('name', seatName);

	if (error) {
		throw new Error(`Could not free the ${seatName} seat: ${error.message}`);
	}
}

/** What a test wants to say about one application. Everything else is filled in. */
export type ApplicationSeed = {
	conferenceId: string;
	status: 'draft' | 'submitted' | 'accepted' | 'rejected' | 'waitlisted' | 'withdrawn';
	/** Committee ids, in the applicant's own order of preference. */
	committeePreferences?: string[];
	/** The free text answer to "which seats would you like?". */
	seatPreferences?: string;
	motivation?: string;
	/** One entry per custom question, keyed by that question's id. */
	answers?: Record<string, string | string[]>;
	/** What the organisers wrote to the applicant when they decided. */
	decisionNote?: string;
};

/**
 * Give a test account an application to a conference, as the database would
 * hold it, and answer the new row's id.
 *
 * The service-role client writes it, the way `giveSeat` above writes a seat.
 * Two of the triggers on `applications` behave differently because of that, and
 * both will bite whoever reads this next.
 *
 * `guard_application_insert` only runs for the two roles a browser uses, so the
 * service role walks straight past it. That is the one reason a seeded
 * `accepted` row is possible at all: through a browser an applicant may write
 * `draft` or `submitted` and nothing else, because every other status is a
 * decision an organiser makes later. Walking past that guard is also why the
 * two timestamps below are set here — for a real submission the guard is what
 * fills `submitted_at` in.
 *
 * `validate_application` still fires for everybody, including this. So every id
 * in `committeePreferences` has to be a committee of this same conference,
 * there may be no more of them than the conference's
 * `committee_preference_count`, and no two may be the same. A `submitted` row
 * has to carry whatever the conference marks required as well: a motivation
 * when `ask_motivation` is on, and an answer to every required question that
 * exists at the moment the row is written.
 */
export async function giveApplication(user: TestUser, seed: ApplicationSeed): Promise<string> {
	const admin = createServiceRoleClient();
	const now = new Date().toISOString();

	// A draft has not been sent yet; every other status has. The three an
	// organiser chooses also carry the moment they chose, because an application
	// that is decided and has no `decided_at` is a row the app could never write.
	const isSent = seed.status !== 'draft';
	const isDecided = ['accepted', 'rejected', 'waitlisted'].includes(seed.status);

	const { data, error } = await admin
		.from('applications')
		.insert({
			conference_id: seed.conferenceId,
			user_id: user.id,
			status: seed.status,
			committee_preferences: seed.committeePreferences ?? [],
			seat_preferences: seed.seatPreferences ?? null,
			motivation: seed.motivation ?? null,
			answers: seed.answers ?? {},
			decision_note: seed.decisionNote ?? null,
			submitted_at: isSent ? now : null,
			decided_at: isDecided ? now : null
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test application: ${error?.message}`);
	}

	return data.id;
}

/**
 * Make a test account a chair of a committee, the way an organiser's form will.
 *
 * The service-role client writes the row for the same reason `giveSeat` above
 * does: handing somebody a committee is an invitation an organiser sends, and
 * accepting one is `tests/e2e/invite-accept.spec.ts`'s work rather than this
 * one's. `title` is what the committee calls the role — "Chair", "Vice chair",
 * "Rapporteur" — and defaults to the same word the column does.
 *
 * Inserting here fires `ensure_chair_is_staff`, which also writes a bare
 * `conference_staff` row, so a chair is two rows and not one; and since
 * docs/roles-and-permissions.md the assignment grants nothing by itself, so a
 * third row gives them the conference's Chair role, which is what lets them
 * run the room. One person may chair two committees of one conference, which
 * is why that third write ignores a membership they already have.
 * `removeCommitteeChair` below takes all of it away.
 */
export async function makeCommitteeChair(
	user: TestUser,
	committeeId: string,
	title: string = 'Chair'
): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('committee_chairs')
		.insert({ committee_id: committeeId, user_id: user.id, title });

	if (error) {
		throw new Error(`Could not make the test account a chair: ${error.message}`);
	}

	const { data: committee, error: committeeError } = await admin
		.from('committees')
		.select('conference_id')
		.eq('id', committeeId)
		.single();

	if (committeeError || !committee) {
		throw new Error(`Could not find the chair's conference: ${committeeError?.message}`);
	}

	const { error: roleError } = await admin.from('conference_role_members').upsert(
		{
			conference_id: committee.conference_id,
			user_id: user.id,
			role_id: await presetRoleId(committee.conference_id, PRESET_ROLE_NAMES.chair)
		},
		{ onConflict: 'role_id,user_id', ignoreDuplicates: true }
	);

	if (roleError) {
		throw new Error(`Could not give the test chair the Chair role: ${roleError.message}`);
	}
}

/**
 * Take the chair role away again, and the `conference_staff` row the trigger
 * wrote with it.
 *
 * Deleting the `committee_chairs` row does not undo `ensure_chair_is_staff`, so
 * without the second half the account would stay on the conference's team and
 * every page that asks "is this reader staff?" would go on saying yes. The
 * conference is passed in rather than looked up, because the test that made the
 * chair already knows which conference the committee belongs to.
 */
export async function removeCommitteeChair(
	userId: string,
	committeeId: string,
	conferenceId: string
): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('committee_chairs')
		.delete()
		.eq('committee_id', committeeId)
		.eq('user_id', userId);

	if (error) {
		throw new Error(`Could not take the chair role away: ${error.message}`);
	}

	await removeConferenceStaff(userId, conferenceId);
}

/** What a test wants to say about one committee event. */
export type CommitteeEventSeed = {
	conferenceId: string;
	committeeId: string;
	title: string;
	/** An ISO timestamp. */
	startsAt: string;
	/** An ISO timestamp. The database refuses an event that ends before it starts. */
	endsAt: string;
};

/**
 * Put one event on a committee's own programme, and answer its id.
 *
 * The organiser's programme editor is a later task and has no form yet, so the
 * service-role client writes the row the way that task one day will, exactly as
 * `giveSeat` above stands in for the allocation form.
 *
 * `audience` is fixed at `'committee'` rather than asked for, because
 * `schedule_events_committee_matches_audience` insists that a committee event
 * names its committee and that no other audience does: the two go together, so
 * a test cannot set one without the other.
 */
export async function giveCommitteeEvent(seed: CommitteeEventSeed): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('schedule_events')
		.insert({
			conference_id: seed.conferenceId,
			committee_id: seed.committeeId,
			title: seed.title,
			starts_at: seed.startsAt,
			ends_at: seed.endsAt,
			audience: 'committee'
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not put the test event on the programme: ${error?.message}`);
	}

	return data.id;
}

/** One event on a whole conference's programme, for `giveConferenceEvent` below. */
export type ConferenceEventSeed = {
	conferenceId: string;
	title: string;
	/** An ISO timestamp. */
	startsAt: string;
	/** An ISO timestamp. The database refuses an event that ends before it starts. */
	endsAt: string;
	/** Where it happens, which a programme row shows beside the time. */
	location?: string;
};

/**
 * Put one event meant for everybody on a conference's programme, and answer its id.
 *
 * The same stand-in as `giveCommitteeEvent` above, for the other kind of event.
 * `audience` is fixed at `'everyone'` and no committee is named, because
 * `schedule_events_committee_matches_audience` insists the two go together: a
 * committee event names a committee and no other audience may.
 *
 * `removeScheduleEvent` below takes it away again, and every test that adds one
 * has to, for the reason written there.
 */
export async function giveConferenceEvent(seed: ConferenceEventSeed): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('schedule_events')
		.insert({
			conference_id: seed.conferenceId,
			title: seed.title,
			starts_at: seed.startsAt,
			ends_at: seed.endsAt,
			location: seed.location ?? null,
			audience: 'everyone'
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not put the test event on the programme: ${error?.message}`);
	}

	return data.id;
}

/**
 * Take that event off the programme again.
 *
 * A committee of `supabase/seed.sql` keeps whatever a test hangs on it until
 * the next `pnpm db:reset`, and a page that shows "the next event" would show
 * the leftover to every later test, so every test that adds one deletes it in a
 * `finally`.
 */
export async function removeScheduleEvent(eventId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin.from('schedule_events').delete().eq('id', eventId);

	if (error) {
		throw new Error(`Could not take the test event off the programme: ${error.message}`);
	}
}

/**
 * The modes a committee room can be in. `idle` is the one that is not live.
 *
 * It is read from the types `pnpm db:types` generates from the schema rather
 * than listed by hand, so a value added to the `committee_mode` enum by a later
 * migration reaches `setCommitteeMode` without anybody editing this file.
 */
export type CommitteeMode = Database['public']['Enums']['committee_mode'];

/**
 * Set a committee's room mode, which is what "Live now" reads.
 *
 * The row is updated rather than inserted: `create_committee_state` gives every
 * committee a `committee_state` row with `mode = 'idle'` the moment it is made,
 * and the table has no insert policy at all. Changing the mode is what a chair
 * does from the committee room, which is a later task with no page yet, so the
 * service-role client stands in for that room.
 *
 * A committee has one of these rows and no more, so a test that changes a
 * seeded committee's mode sets it back to `idle` in a `finally`, and only one
 * Playwright project may do it at a time.
 */
export async function setCommitteeMode(committeeId: string, mode: CommitteeMode): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('committee_state')
		.update({ mode })
		.eq('committee_id', committeeId);

	if (error) {
		throw new Error(`Could not set the committee's mode to ${mode}: ${error.message}`);
	}
}

/** The rows `giveInvoice` writes, and what each of them is for. */
export type InvoiceSeed = {
	conferenceId: string;
	/** The invoice's own number, such as "test-0001". It has to be unique. */
	number: string;
	/** Any value of the `invoice_status` enum, read from the generated types like `CommitteeMode`. */
	status: Database['public']['Enums']['invoice_status'];
	description: string;
	/** Whole cents of the conference's currency. See the top of `src/lib/money.ts`. */
	unitAmountCents: number;
	/** How many seats it is for. One for an individual delegate's own. */
	quantity?: number;
	currency?: string;
	dueAt?: string | null;
	paidAt?: string | null;
	paidMethod?: 'stripe' | 'manual' | null;
	/** The seat an individual invoice was raised for. Never both this and `delegationId`. */
	seatId?: string | null;
	delegationId?: string | null;
};

/**
 * Give a test account an invoice, as the database would hold it, and answer the
 * new row's id.
 *
 * The service-role client writes it, the way `giveApplication` above writes an
 * application, and the triggers behave differently because of that.
 *
 * `guard_invoice_insert` only runs for the two roles a browser uses, so the
 * service role walks straight past it. That is what makes a seeded `paid` or
 * `waived` row possible at all: through the app an invoice is always born
 * `unpaid`, and every other status is something an organiser or Stripe does to
 * it afterwards. Walking past that guard is also why the number and the
 * currency are set here — for a real invoice the guard is what fills them in,
 * from `next_invoice_number` and from the conference.
 *
 * `compute_invoice_amount` still fires for everybody, so `amount_cents` and
 * `platform_fee_cents` are left out and worked out by the database.
 */
export async function giveInvoice(user: TestUser, seed: InvoiceSeed): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('invoices')
		.insert({
			conference_id: seed.conferenceId,
			number: seed.number,
			payer_user_id: user.id,
			seat_id: seed.seatId ?? null,
			delegation_id: seed.delegationId ?? null,
			description: seed.description,
			quantity: seed.quantity ?? 1,
			unit_amount_cents: seed.unitAmountCents,
			currency: seed.currency ?? 'EUR',
			status: seed.status,
			due_at: seed.dueAt ?? null,
			paid_at: seed.paidAt ?? null,
			paid_method: seed.paidMethod ?? null
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test invoice: ${error?.message}`);
	}

	return data.id;
}

/**
 * Take a test invoice away again.
 *
 * The conferences these invoices hang on come from `supabase/seed.sql` and
 * outlive the test, and `invoices.conference_id` is "on delete restrict", so a
 * row left behind would stop that conference from ever being deleted.
 */
export async function removeInvoice(invoiceId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin.from('invoices').delete().eq('id', invoiceId);

	if (error) {
		throw new Error(`Could not remove the test invoice: ${error.message}`);
	}
}
