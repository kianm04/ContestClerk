import type { SupabaseClient } from '@supabase/supabase-js';
import {
	createServiceRoleClient,
	createSignedInClient,
	type SignedInClient
} from './supabase-test-client';

// Setting up "a signed-in person who runs a conference" takes three steps and
// several tests need it, so it lives here rather than being copied around.
//
// Everything below goes through an ordinary signed-in client, so the rows only
// appear if the policies allow them. That is deliberate: a fixture that cheats
// would hide the very thing these tests are checking. The exceptions, each of
// which says why, are `addOrganizationMember` and the `conference_staff` row in
// `addStaff` and `giveRole`: since the security review nobody may insert either
// directly (they come from `accept_invite`, the owner trigger and
// `ensure_chair_is_staff`), so the fixtures write those rows with the service
// role, standing in for the invitation the person would have accepted.

/** The three things somebody can be in an organisation. */
export type OrganizationMemberRole = 'owner' | 'admin' | 'member';

/**
 * Puts somebody in an organisation, the way an accepted invitation would.
 *
 * This is the one fixture that writes with the service role. Since migration
 * 20261022120000 no browser may insert an `organization_members` row at all:
 * membership arrives through `accept_invite`, which runs as the database's own
 * owner, or through the trigger that makes an organisation's creator its owner.
 * A test that needs a second member is not about how they got in, so the row
 * is written the way `accept_invite` would write it. Whether an admin or an
 * owner may add somebody directly is a question of its own, answered in
 * security-organisation-governance.test.ts.
 */
export async function addOrganizationMember(
	organizationId: string,
	userId: string,
	role: OrganizationMemberRole
): Promise<void> {
	const { error } = await createServiceRoleClient()
		.from('organization_members')
		.insert({ organization_id: organizationId, user_id: userId, role });

	if (error) {
		throw new Error(`Could not put the fixture member in the organisation: ${error.message}`);
	}
}

/**
 * When every fixture conference happens. The dates are in the past on purpose.
 *
 * These rows are throwaway, several tests publish them, and nothing deletes
 * them until the next `pnpm db:reset`. A published one with future dates
 * therefore turns up in the real `/conferences` directory, which lists
 * published conferences that have not finished yet, and the browser tests count
 * what is on a page. No policy test cares when a fixture conference happens, so
 * putting them in the past keeps the two suites out of each other's way.
 */
const FIXTURE_START_DATE = '2020-03-01';
const FIXTURE_END_DATE = '2020-03-03';

export type ConferenceFixture = {
	/** A client signed in as the person who owns the organisation. */
	supabase: SupabaseClient;
	userId: string;
	email: string;
	organizationId: string;
	conferenceId: string;
	conferenceSlug: string;
};

/**
 * Signs up a new account, gives it an organisation, and puts one draft
 * conference in that organisation. The account is its owner, because the
 * `add_organization_creator_as_owner` trigger makes the creator an owner.
 */
export async function createConferenceOwnedByMe(): Promise<ConferenceFixture> {
	const { supabase, userId, email } = await createSignedInClient();
	const suffix = crypto.randomUUID();

	const { data: organization, error: organizationError } = await supabase
		.from('organizations')
		.insert({ name: 'Fixture org', slug: `fixture-org-${suffix}`, created_by: userId })
		.select('id')
		.single();

	if (organizationError || !organization) {
		throw new Error(`Could not create the fixture organisation: ${organizationError?.message}`);
	}

	const conferenceSlug = `fixture-conference-${suffix}`;

	const { data: conference, error: conferenceError } = await supabase
		.from('conferences')
		.insert({
			name: 'Fixture Conference',
			slug: conferenceSlug,
			city: 'Utrecht',
			country_code: 'NL',
			start_date: FIXTURE_START_DATE,
			end_date: FIXTURE_END_DATE,
			organization_id: organization.id,
			created_by: userId
		})
		.select('id')
		.single();

	if (conferenceError || !conference) {
		throw new Error(`Could not create the fixture conference: ${conferenceError?.message}`);
	}

	return {
		supabase,
		userId,
		email,
		organizationId: organization.id,
		conferenceId: conference.id,
		conferenceSlug
	};
}

/**
 * Puts one committee in a conference, through the organiser's own client, so
 * that the `committees` insert policy has to allow it.
 *
 * The slug is made unique per call because `committees` is unique on
 * `(conference_id, slug)` and several tests add a committee to the same
 * conference.
 */
export async function addCommittee(
	supabase: SupabaseClient,
	conferenceId: string,
	name = 'Security Council'
): Promise<string> {
	const { data, error } = await supabase
		.from('committees')
		.insert({
			conference_id: conferenceId,
			name,
			slug: `committee-${crypto.randomUUID()}`
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not create the fixture committee: ${error?.message}`);
	}

	return data.id;
}

/**
 * Puts one free seat in a committee, through the organiser's own client.
 * `name` has to differ per seat, because `seats` is unique on
 * `(committee_id, name)`.
 */
export async function addSeat(
	supabase: SupabaseClient,
	committeeId: string,
	name = 'France',
	countryCode = 'FR'
): Promise<string> {
	const { data, error } = await supabase
		.from('seats')
		.insert({ committee_id: committeeId, name, country_code: countryCode })
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not create the fixture seat: ${error?.message}`);
	}

	return data.id;
}

/**
 * Publishes a conference and opens its application window, so that the
 * `applications` and `delegations` insert policies let somebody in.
 *
 * The window is set explicitly rather than left null on both sides, because a
 * null bound means "open on that side" and a test that proves the window is
 * checked needs the window to be real.
 */
export async function openForApplications(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<void> {
	const { error } = await supabase
		.from('conferences')
		.update({
			status: 'published',
			applications_open_at: new Date(Date.now() - 86_400_000).toISOString(),
			applications_close_at: new Date(Date.now() + 86_400_000).toISOString(),
			accepts_individual_applications: true,
			accepts_delegations: true
		})
		.eq('id', conferenceId);

	if (error) {
		throw new Error(`Could not open the fixture conference: ${error.message}`);
	}
}

/** A published conference whose application window is open right now. */
export async function createOpenConferenceOwnedByMe(): Promise<ConferenceFixture> {
	const fixture = await createConferenceOwnedByMe();

	await openForApplications(fixture.supabase, fixture.conferenceId);

	return fixture;
}

/**
 * Runs `join` with the conference temporarily published and dated in the
 * future, then puts back exactly the status and dates it found.
 *
 * `join_delegation` refuses a conference that is archived or whose last day has
 * passed, because `05-pages/delegation/join.md` counts either as having
 * "already taken place". Every fixture conference is one or the other, and
 * neither says anything about the conference this test means: the 2020 dates
 * are there to keep it out of the `/conferences` directory (see
 * FIXTURE_START_DATE above), and the allocation fixtures archive it for the
 * same reason. So the two are lifted for the one call that needs them lifted.
 *
 * Putting them back matters as much as lifting them. A fixture left published
 * and dated 2099 sits in the real directory until the next `pnpm db:reset`, and
 * the browser tests count what is on that page; one left published when it was
 * archived changes what the seat policies answer, because
 * `conference_is_published` is true for an archived conference and false for a
 * draft.
 */
export async function whileTheConferenceIsJoinable<T>(
	conference: ConferenceFixture,
	// `PromiseLike` and not `Promise`, because the usual caller hands back a
	// Supabase query builder, which is a thenable rather than a real promise.
	join: () => PromiseLike<T>
): Promise<T> {
	const { data: before, error: readError } = await conference.supabase
		.from('conferences')
		.select('status, start_date, end_date')
		.eq('id', conference.conferenceId)
		.single();

	if (readError || !before) {
		throw new Error(`Could not read the fixture conference: ${readError?.message}`);
	}

	await conference.supabase
		.from('conferences')
		.update({ status: 'published', start_date: '2099-01-01', end_date: '2099-01-03' })
		.eq('id', conference.conferenceId);

	try {
		return await join();
	} finally {
		// `finally` so that a failed join still leaves the conference as it was,
		// rather than leaving every test after this one to puzzle at a fixture
		// that is suddenly published and happening in 2099.
		await conference.supabase.from('conferences').update(before).eq('id', conference.conferenceId);
	}
}

/** What `addApplication` may be told to do differently. */
export type ApplicationFixtureOptions = {
	/**
	 * `'submitted'` by default, because that is the only status an organiser can
	 * do anything with. A `'submitted'` row has to pass `validate_application`.
	 */
	status?: 'draft' | 'submitted';
	/**
	 * The committees the applicant asked for, most wanted first. A conference
	 * asks for two by default, and the first one is required to submit, so a
	 * submitted application needs at least one id here.
	 */
	committeePreferences?: string[];
};

/**
 * One application, through the applicant's own client so that the insert policy
 * has to allow it.
 *
 * The motivation is always filled in, because a conference asks for one unless
 * the organiser turned `ask_motivation` off, and a fixture that could not be
 * submitted would be no use to the tests that accept it.
 */
export async function addApplication(
	applicant: SupabaseClient,
	conferenceId: string,
	options: ApplicationFixtureOptions = {}
): Promise<string> {
	const { data, error } = await applicant
		.from('applications')
		.insert({
			conference_id: conferenceId,
			user_id: await currentUserId(applicant),
			status: options.status ?? 'submitted',
			committee_preferences: options.committeePreferences ?? [],
			motivation: 'I would like to come, because this is a fixture.'
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not create the fixture application: ${error?.message}`);
	}

	return data.id;
}

/**
 * One delegation, through `create_delegation`, which is the only way the app
 * makes one: it writes the delegation and its first head together.
 */
export async function addDelegation(
	head: SupabaseClient,
	conferenceId: string,
	name = 'Fixture Delegation'
): Promise<string> {
	const { data, error } = await head.rpc('create_delegation', {
		conference_id: conferenceId,
		name,
		institution_name: 'Fixture School',
		country_code: 'NL',
		requested_seats: 4,
		note: null
	});

	if (error || !data) {
		throw new Error(`Could not create the fixture delegation: ${error?.message}`);
	}

	return data;
}

/** What `addFee` may be told to do differently. */
export type FeeFixtureOptions = {
	/** `'individual'` by default, the fee somebody applying on their own pays. */
	appliesTo?: 'individual' | 'delegation_member';
	/** Lowest first, which is how `applicable_fee` breaks a tie. */
	position?: number;
	/** Left open on both sides by default, so the fee always applies. */
	validFrom?: string | null;
	validUntil?: string | null;
};

/**
 * One fee on a conference, through the organiser's own client so that the
 * `fees` insert policy has to allow it.
 *
 * €65.00 unless a test says otherwise, because the amount is only ever the
 * point when a test is checking the arithmetic.
 */
export async function addFee(
	organiser: SupabaseClient,
	conferenceId: string,
	name = 'Delegate fee',
	amountCents = 6500,
	options: FeeFixtureOptions = {}
): Promise<string> {
	const { data, error } = await organiser
		.from('fees')
		.insert({
			conference_id: conferenceId,
			name,
			amount_cents: amountCents,
			applies_to: options.appliesTo ?? 'individual',
			position: options.position ?? 0,
			valid_from: options.validFrom ?? null,
			valid_until: options.validUntil ?? null
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not create the fixture fee: ${error?.message}`);
	}

	return data.id;
}

/** Everything a test about the committee room needs, all in one committee. */
export type CommitteeRoomFixture = ConferenceFixture & {
	committeeId: string;
	/**
	 * The committee's name. `notify_awards_published` builds its sentence out of
	 * it, so a test that reads that sentence has to know what it says without
	 * writing the name down a second time.
	 */
	committeeName: string;
	/** A free seat of that committee, which `delegate` holds. */
	seatId: string;
	/** A client signed in as a chair of the committee. */
	chair: SignedInClient;
	/** A client signed in as the delegate sitting in `seatId`. */
	delegate: SignedInClient;
};

/**
 * One conference, one committee, one seat, one chair and one delegate in that
 * seat: the four people every rule in the committee room is written about.
 *
 * Everything goes through the organiser's own client, so the fixture only
 * builds if the policies allow it. The conference is left as a draft, because
 * nothing in the room asks whether it is published.
 */
export async function createCommitteeRoom(): Promise<CommitteeRoomFixture> {
	const fixture = await createConferenceOwnedByMe();
	const committeeName = 'Security Council';
	const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId, committeeName);
	const seatId = await addSeat(fixture.supabase, committeeId);

	const chair = await createSignedInClient('Fixture Chair');
	await addChair(fixture.supabase, committeeId, chair.userId);

	const delegate = await createSignedInClient('Fixture Delegate');
	await giveSeatTo(fixture.supabase, seatId, delegate.userId);

	return { ...fixture, committeeId, committeeName, seatId, chair, delegate };
}

/**
 * One session of a committee, through a chair's own client so that the
 * `committee_sessions` insert policy has to allow it.
 */
export async function addSession(
	chair: SupabaseClient,
	committeeId: string,
	name = 'Session I'
): Promise<string> {
	const { data, error } = await chair
		.from('committee_sessions')
		.insert({ committee_id: committeeId, name })
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not create the fixture session: ${error?.message}`);
	}

	return data.id;
}

/** The id of the account a signed-in client belongs to. */
async function currentUserId(supabase: SupabaseClient): Promise<string> {
	const { data } = await supabase.auth.getSession();

	if (!data.session) {
		throw new Error('That client is not signed in.');
	}

	return data.session.user.id;
}

/**
 * Puts a delegate in a seat the way the app does: `accept_application`, called
 * through the organiser's own client, on an application by that person. The
 * organiser therefore has to hold `decide_applications` for anything to happen.
 *
 * This used to write `seats.user_id` directly through the organiser's client.
 * Since migration 20261022110000 the `protect_seats_columns` trigger refuses
 * that from a browser role, because writing any account's id into a seat was
 * how a self-made organiser read a stranger's private details (finding C4 of
 * docs/security-review-2026-10-10.md). Seating is something only the allocation
 * functions may do, so the fixture takes one of them.
 *
 * The fixture holds the person's id, not a client signed in as them, so the
 * application they would have sent is arranged with the service role: a
 * submitted row of the shape `addApplication` writes through an applicant's own
 * client. Arranging a row is all the service role does here; the seating write
 * itself is `accept_application`'s, as the organiser.
 *
 * Two things the real road cannot do are done around it:
 *
 * - A seat somebody else already sits in is freed first with `revoke_seat`, the
 *   organiser's own way of emptying a seat, so a test that changes a seat's
 *   holder keeps working.
 * - Somebody already in a delegation at this conference cannot also apply to it
 *   (`check_one_route_per_conference`). Their seat is the one their head fills
 *   by writing `user_id`, and the fixture has no head's client, so the service
 *   role writes that one column, as the head's page would. `check_seat_allocation`
 *   still checks the row, so a stranger could not be written in this way.
 */
export async function giveSeatTo(
	organiser: SupabaseClient,
	seatId: string,
	userId: string
): Promise<void> {
	const admin = createServiceRoleClient();
	const seat = await readSeatToFill(admin, seatId);

	if (seat.userId === userId) {
		return;
	}

	if (seat.userId !== null) {
		const { error } = await organiser.rpc('revoke_seat', { seat_id: seatId });

		if (error) {
			throw new Error(`Could not free the fixture seat first: ${error.message}`);
		}
	}

	if (await isInADelegationAt(admin, seat.conferenceId, userId)) {
		const { error } = await admin
			.from('seats')
			.update({ user_id: userId, allocated_at: new Date().toISOString() })
			.eq('id', seatId);

		if (error) {
			throw new Error(`Could not seat the fixture delegation member: ${error.message}`);
		}

		return;
	}

	const applicationId = await submittedApplicationOf(admin, seat, userId);
	const { error } = await organiser.rpc('accept_application', {
		application_id: applicationId,
		seat_id: seatId
	});

	if (error) {
		throw new Error(`Could not seat the fixture delegate: ${error.message}`);
	}
}

/** What `giveSeatTo` needs to know about the seat it is about to fill. */
type SeatToFill = {
	userId: string | null;
	committeeId: string;
	conferenceId: string;
	/** How many committee preferences the conference's form asks for. */
	committeePreferenceCount: number;
};

/**
 * The seat, its committee's conference and that conference's form settings,
 * read with the service role: these reads arrange the fixture and prove nothing.
 */
async function readSeatToFill(admin: SupabaseClient, seatId: string): Promise<SeatToFill> {
	const { data: seat, error: seatError } = await admin
		.from('seats')
		.select('user_id, committee_id')
		.eq('id', seatId)
		.single();

	if (seatError || !seat) {
		throw new Error(`Could not read the fixture seat: ${seatError?.message}`);
	}

	const { data: committee, error: committeeError } = await admin
		.from('committees')
		.select('conference_id')
		.eq('id', seat.committee_id)
		.single();

	if (committeeError || !committee) {
		throw new Error(`Could not read the fixture seat's committee: ${committeeError?.message}`);
	}

	const { data: conference, error: conferenceError } = await admin
		.from('conferences')
		.select('committee_preference_count')
		.eq('id', committee.conference_id)
		.single();

	if (conferenceError || !conference) {
		throw new Error(`Could not read the fixture seat's conference: ${conferenceError?.message}`);
	}

	return {
		userId: seat.user_id,
		committeeId: seat.committee_id,
		conferenceId: committee.conference_id,
		committeePreferenceCount: conference.committee_preference_count
	};
}

/** Is this person a head or member of any delegation at this conference? */
async function isInADelegationAt(
	admin: SupabaseClient,
	conferenceId: string,
	userId: string
): Promise<boolean> {
	// `!inner` makes the join a filter: only memberships whose delegation is at
	// this conference come back, rather than every membership with a null join.
	const { data, error } = await admin
		.from('delegation_members')
		.select('delegation_id, delegation:delegations!inner(conference_id)')
		.eq('user_id', userId)
		.eq('delegation.conference_id', conferenceId)
		.limit(1);

	if (error) {
		throw new Error(`Could not read the fixture person's delegations: ${error.message}`);
	}

	return (data ?? []).length > 0;
}

/**
 * The id of a submitted application by this person to the seat's conference:
 * the one they already have, put back to submitted if it had been decided, or
 * a new one written the way `addApplication` writes it.
 *
 * `validate_application` runs for the service role too, so the row has to be
 * one an applicant could really submit: a motivation, and one committee
 * preference (the seat's own committee) when the conference asks for any.
 */
async function submittedApplicationOf(
	admin: SupabaseClient,
	seat: SeatToFill,
	userId: string
): Promise<string> {
	const now = new Date().toISOString();

	const { data: existing, error: readError } = await admin
		.from('applications')
		.select('id, status')
		.eq('conference_id', seat.conferenceId)
		.eq('user_id', userId)
		.maybeSingle();

	if (readError) {
		throw new Error(`Could not read the fixture person's application: ${readError.message}`);
	}

	if (existing) {
		if (existing.status === 'submitted' || existing.status === 'waitlisted') {
			return existing.id;
		}

		const { error } = await admin
			.from('applications')
			.update({ status: 'submitted', submitted_at: now, decided_at: null, decided_by: null })
			.eq('id', existing.id);

		if (error) {
			throw new Error(`Could not resubmit the fixture application: ${error.message}`);
		}

		return existing.id;
	}

	const { data, error } = await admin
		.from('applications')
		.insert({
			conference_id: seat.conferenceId,
			user_id: userId,
			status: 'submitted',
			committee_preferences: seat.committeePreferenceCount > 0 ? [seat.committeeId] : [],
			motivation: 'I would like to come, because this is a fixture.',
			submitted_at: now
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the fixture application: ${error?.message}`);
	}

	return data.id;
}

/**
 * Makes somebody a chair of a committee, through the organiser's own client.
 *
 * Three rows, because a committee assignment on its own grants nothing
 * (docs/roles-and-permissions.md, rule 3). The person joins the team first, as
 * accepting an invitation would have put them there, since a browser may only
 * assign somebody already on it (`committee_chairs_already_on_team`, security
 * review L8); the staff row is written with the service role, see the top of
 * this file, and left alone when they are on the team already. Then the
 * assignment, and the Chair role, whose scope is the committees its holder is
 * assigned to, which lets them run this room. A chair made this way can do
 * exactly what a chair could before.
 */
export async function addChair(
	organiser: SupabaseClient,
	committeeId: string,
	userId: string
): Promise<void> {
	const conferenceId = await conferenceOfCommittee(organiser, committeeId);

	const { error: staffError } = await createServiceRoleClient()
		.from('conference_staff')
		.insert({ conference_id: conferenceId, user_id: userId });

	if (staffError && staffError.code !== '23505') {
		throw new Error(`Could not put the fixture chair on the team: ${staffError.message}`);
	}

	const { error } = await organiser
		.from('committee_chairs')
		.insert({ committee_id: committeeId, user_id: userId });

	if (error) {
		throw new Error(`Could not make the fixture chair: ${error.message}`);
	}

	await giveRole(
		organiser,
		conferenceId,
		userId,
		await presetRoleId(organiser, conferenceId, 'Chair')
	);
}

/** The three roles every conference is made with, by the name the trigger gives them. */
export type PresetRoleName = 'Organiser' | 'Chair' | 'Volunteer';

/** The words the old `staff_role` enum used, which many tests still speak in. */
type StaffWord = 'organiser' | 'chair' | 'volunteer';

const PRESET_ROLE_NAMES: Record<StaffWord, PresetRoleName> = {
	organiser: 'Organiser',
	chair: 'Chair',
	volunteer: 'Volunteer'
};

/**
 * Adds somebody to a conference's team. `'volunteer'` by default, because that
 * is the role with no powers of its own, which is what a test about "any staff"
 * wants.
 *
 * Since docs/roles-and-permissions.md a staff row says only that somebody is
 * on the team; what they may do is the roles they hold. So this writes the
 * row (with the service role, see the top of this file) and then, through the
 * organiser's own client, the membership of the preset the word names, which
 * is what accepting an invitation with that role would have written.
 */
export async function addStaff(
	organiser: SupabaseClient,
	conferenceId: string,
	userId: string,
	role: StaffWord = 'volunteer'
): Promise<void> {
	const { error } = await createServiceRoleClient()
		.from('conference_staff')
		.insert({ conference_id: conferenceId, user_id: userId });

	if (error) {
		throw new Error(`Could not add the fixture staff member: ${error.message}`);
	}

	await giveRole(
		organiser,
		conferenceId,
		userId,
		await presetRoleId(organiser, conferenceId, PRESET_ROLE_NAMES[role])
	);
}

/**
 * The id of one of a conference's preset roles, which the
 * `conferences_add_presets` trigger made with the conference. Read through
 * the organiser's client, so it only answers when the policies let them read
 * their own roles.
 */
export async function presetRoleId(
	organiser: SupabaseClient,
	conferenceId: string,
	name: PresetRoleName
): Promise<string> {
	const { data, error } = await organiser
		.from('conference_roles')
		.select('id')
		.eq('conference_id', conferenceId)
		.eq('name', name)
		.single();

	if (error || !data) {
		throw new Error(`Could not find the ${name} role of the fixture conference: ${error?.message}`);
	}

	return data.id;
}

/** What `addRole` is told about the role to make. */
export type RoleFixtureOptions = {
	name: string;
	/** `'conference'` unless a test is about a role that applies in assigned committees only. */
	scope?: 'conference' | 'committees';
	permissions: string[];
	/** Shown on the public team page. Off unless a test is about that page. */
	isPublic?: boolean;
};

/**
 * One role on a conference, through the organiser's own client so that the
 * `conference_roles` insert policy has to allow it. Answers the new role's id.
 *
 * The position is left at the column's default, 0, the top of the list, which
 * only an administrator may place a role at; a test about the rank rule sets
 * its own positions.
 */
export async function addRole(
	organiser: SupabaseClient,
	conferenceId: string,
	options: RoleFixtureOptions
): Promise<string> {
	const { data, error } = await organiser
		.from('conference_roles')
		.insert({
			conference_id: conferenceId,
			name: options.name,
			scope: options.scope ?? 'conference',
			permissions: options.permissions,
			is_public: options.isPublic ?? false
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not create the fixture role: ${error?.message}`);
	}

	return data.id;
}

/**
 * Gives somebody a role, through the organiser's own client, putting them on
 * the team first when they are not on it yet. `conference_role_members` points
 * at the staff row, so the row has to exist before the membership can; that
 * one row is written with the service role (see the top of this file).
 *
 * The staff insert is allowed to find the row already there (the `23505`
 * code is Postgres for "that key exists"), because `addStaff` and `addChair`
 * both arrive here with the row just written.
 */
export async function giveRole(
	organiser: SupabaseClient,
	conferenceId: string,
	userId: string,
	roleId: string
): Promise<void> {
	const { error: staffError } = await createServiceRoleClient()
		.from('conference_staff')
		.insert({ conference_id: conferenceId, user_id: userId });

	if (staffError && staffError.code !== '23505') {
		throw new Error(`Could not put the fixture person on the team: ${staffError.message}`);
	}

	const { error } = await organiser
		.from('conference_role_members')
		.insert({ conference_id: conferenceId, user_id: userId, role_id: roleId });

	if (error) {
		throw new Error(`Could not give the fixture role: ${error.message}`);
	}
}

/** The conference a committee belongs to, for the fixtures that are handed only the committee. */
async function conferenceOfCommittee(
	supabase: SupabaseClient,
	committeeId: string
): Promise<string> {
	const { data, error } = await supabase
		.from('committees')
		.select('conference_id')
		.eq('id', committeeId)
		.single();

	if (error || !data) {
		throw new Error(`Could not find the fixture committee's conference: ${error?.message}`);
	}

	return data.conference_id;
}
