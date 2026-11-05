import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
	createServiceRoleClient,
	createSignedInClient,
	type SignedInClient
} from './supabase-test-client';
import {
	addOrganizationMember,
	createConferenceOwnedByMe,
	type OrganizationMemberRole
} from './conference-fixtures';

// Who may change who runs an organisation, and who owns the organisation that
// holds a person's quick sessions: findings H3, M1, M16, L2 and L65 of
// docs/security-review-2026-10-10.md, closed by migration
// 20261022120000_organisation_governance.
//
// Before it, every `organization_members` policy stopped at
// `is_organization_admin`, which counts owners and admins alike, so an admin
// could make themselves an owner and demote or remove the real owners; the
// owner-only rule lived in the settings page alone. The `organizations` update
// policy let the same admin rewrite `created_by` and `is_personal`, which is
// how `create_quick_session` finds a person's personal organisation, and the
// function trusted whatever it found. The tests are grouped by the piece that
// now refuses each of those.

/**
 * Makes an organisation as `owner`, answering its id. The creator trigger
 * add_organization_creator_as_owner makes them its owner.
 */
async function createOrganizationOwnedBy(owner: SignedInClient): Promise<string> {
	const { data, error } = await owner.supabase
		.from('organizations')
		.insert({
			name: 'Governed org',
			slug: `governed-org-${crypto.randomUUID()}`,
			created_by: owner.userId
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not create the test organisation: ${error?.message}`);
	}

	return data.id;
}

/** Signs somebody up and gives them an organisation they own. */
async function createOrganizationOwnedByMe() {
	const person = await createSignedInClient();
	const organizationId = await createOrganizationOwnedBy(person);

	return { ...person, organizationId };
}

/** Signs a fresh account up and puts it in the organisation with this role. */
async function addMemberWithRole(
	organizationId: string,
	role: OrganizationMemberRole
): Promise<SignedInClient> {
	const person = await createSignedInClient();

	await addOrganizationMember(organizationId, person.userId, role);

	return person;
}

/**
 * What somebody is in the organisation, read with the service role so that the
 * answer does not depend on what the person under test may see. Null when they
 * are nothing.
 */
async function readRole(organizationId: string, userId: string): Promise<string | null> {
	const { data, error } = await createServiceRoleClient()
		.from('organization_members')
		.select('role')
		.eq('organization_id', organizationId)
		.eq('user_id', userId)
		.maybeSingle();

	if (error) {
		throw new Error(`Could not read the membership: ${error.message}`);
	}

	return data ? data.role : null;
}

/** Change somebody's role as `actor`, answering what the database said. */
function changeRole(
	actor: SupabaseClient,
	organizationId: string,
	userId: string,
	role: OrganizationMemberRole
) {
	return actor
		.from('organization_members')
		.update({ role })
		.eq('organization_id', organizationId)
		.eq('user_id', userId)
		.select('role');
}

/** Take somebody out of the organisation as `actor`, answering what the database said. */
function removeMember(actor: SupabaseClient, organizationId: string, userId: string) {
	return actor
		.from('organization_members')
		.delete()
		.eq('organization_id', organizationId)
		.eq('user_id', userId)
		.select('user_id');
}

// Row Level Security answers a refused write in two ways. A row the policy's
// USING half hides is simply not there, so nothing changes and no rows come
// back. A row it shows but whose new values fail the WITH CHECK half raises
// 42501, "new row violates row-level security policy". The tests below say
// which of the two they expect. A column the role may not update at all is
// refused before any policy is asked, with the same code and "permission
// denied" in the message.
const RLS_VIOLATION = '42501';
const PERMISSION_DENIED = 'permission denied';

describe('organization_members, as an admin (M1, M16)', () => {
	it('cannot make themselves an owner', async () => {
		const { organizationId } = await createOrganizationOwnedByMe();
		const admin = await addMemberWithRole(organizationId, 'admin');

		const { error } = await changeRole(admin.supabase, organizationId, admin.userId, 'owner');

		expect(error?.code).toBe(RLS_VIOLATION);
		expect(await readRole(organizationId, admin.userId)).toBe('admin');
	});

	it('cannot add an owner', async () => {
		const { organizationId } = await createOrganizationOwnedByMe();
		const admin = await addMemberWithRole(organizationId, 'admin');
		const accomplice = await createSignedInClient();

		const { error } = await admin.supabase
			.from('organization_members')
			.insert({ organization_id: organizationId, user_id: accomplice.userId, role: 'owner' });

		expect(error?.code).toBe(RLS_VIOLATION);
		expect(await readRole(organizationId, accomplice.userId)).toBeNull();
	});

	it('cannot demote an owner', async () => {
		const { organizationId, userId: ownerId } = await createOrganizationOwnedByMe();
		const admin = await addMemberWithRole(organizationId, 'admin');

		const { data, error } = await changeRole(admin.supabase, organizationId, ownerId, 'member');

		expect(error).toBeNull();
		expect(data).toEqual([]);
		expect(await readRole(organizationId, ownerId)).toBe('owner');
	});

	it('cannot remove an owner, even one who is not the last', async () => {
		const { organizationId, userId: ownerId } = await createOrganizationOwnedByMe();
		await addMemberWithRole(organizationId, 'owner');
		const admin = await addMemberWithRole(organizationId, 'admin');

		const { data, error } = await removeMember(admin.supabase, organizationId, ownerId);

		expect(error).toBeNull();
		expect(data).toEqual([]);
		expect(await readRole(organizationId, ownerId)).toBe('owner');
	});

	it('still runs the rest of the team: makes a member an admin and removes one', async () => {
		const { organizationId } = await createOrganizationOwnedByMe();
		const admin = await addMemberWithRole(organizationId, 'admin');
		const promoted = await addMemberWithRole(organizationId, 'member');
		const removed = await addMemberWithRole(organizationId, 'member');

		const changed = await changeRole(admin.supabase, organizationId, promoted.userId, 'admin');
		const deleted = await removeMember(admin.supabase, organizationId, removed.userId);

		expect(changed.error).toBeNull();
		expect(changed.data).toEqual([{ role: 'admin' }]);
		expect(deleted.error).toBeNull();
		expect(deleted.data).toEqual([{ user_id: removed.userId }]);
	});
});

describe('organization_members, as an owner (M1, is_organization_owner)', () => {
	it('is_organization_owner says yes to an owner and no to an admin, a member and a stranger', async () => {
		const { supabase, organizationId } = await createOrganizationOwnedByMe();
		const admin = await addMemberWithRole(organizationId, 'admin');
		const member = await addMemberWithRole(organizationId, 'member');
		const stranger = await createSignedInClient();

		const asked = await Promise.all(
			[supabase, admin.supabase, member.supabase, stranger.supabase].map((client) =>
				client.rpc('is_organization_owner', { org_id: organizationId })
			)
		);

		expect(asked.map((answer) => answer.error)).toEqual([null, null, null, null]);
		expect(asked.map((answer) => answer.data)).toEqual([true, false, false, false]);
	});

	it('can hand ownership to a member', async () => {
		const { supabase, organizationId } = await createOrganizationOwnedByMe();
		const member = await addMemberWithRole(organizationId, 'member');

		const { data, error } = await changeRole(supabase, organizationId, member.userId, 'owner');

		expect(error).toBeNull();
		expect(data).toEqual([{ role: 'owner' }]);
	});

	it('can demote another owner, and remove one', async () => {
		const { supabase, organizationId } = await createOrganizationOwnedByMe();
		const demoted = await addMemberWithRole(organizationId, 'owner');
		const removed = await addMemberWithRole(organizationId, 'owner');

		const changed = await changeRole(supabase, organizationId, demoted.userId, 'admin');
		const deleted = await removeMember(supabase, organizationId, removed.userId);

		expect(changed.error).toBeNull();
		expect(changed.data).toEqual([{ role: 'admin' }]);
		expect(deleted.error).toBeNull();
		expect(deleted.data).toEqual([{ user_id: removed.userId }]);
	});
});

describe('organization_members, nobody adds a member by hand any more (H3)', () => {
	// The settings page never wrote a membership row directly: members arrive by
	// accepting an invitation, and the creator by the trigger that makes them
	// owner. The insert policy that nevertheless let an admin add any account to
	// any organisation of theirs is gone, and a browser may update the role
	// column alone, so an existing row cannot be pointed at another account or
	// another organisation either. Consent is the only door.
	it('refuses the owner inserting a member directly', async () => {
		const { supabase, organizationId } = await createOrganizationOwnedByMe();
		const newcomer = await createSignedInClient();

		const { error } = await supabase
			.from('organization_members')
			.insert({ organization_id: organizationId, user_id: newcomer.userId, role: 'member' });

		expect(error?.code).toBe(RLS_VIOLATION);
		expect(await readRole(organizationId, newcomer.userId)).toBeNull();
	});

	it('refuses the owner pointing a row at another account or another organisation', async () => {
		const owner = await createOrganizationOwnedByMe();
		const { supabase, userId, organizationId } = owner;
		const member = await addMemberWithRole(organizationId, 'member');
		const stranger = await createSignedInClient();
		const otherOrganizationId = await createOrganizationOwnedBy(owner);

		// A member's row, the owner's own row, and a row moved to another
		// organisation the owner also runs: each would be a membership nobody
		// agreed to.
		const memberRepointed = await supabase
			.from('organization_members')
			.update({ user_id: stranger.userId })
			.eq('organization_id', organizationId)
			.eq('user_id', member.userId);
		const ownerRepointed = await supabase
			.from('organization_members')
			.update({ user_id: stranger.userId })
			.eq('organization_id', organizationId)
			.eq('user_id', userId);
		const moved = await supabase
			.from('organization_members')
			.update({ organization_id: otherOrganizationId })
			.eq('organization_id', organizationId)
			.eq('user_id', member.userId);

		for (const refused of [memberRepointed, ownerRepointed, moved]) {
			expect(refused.error?.code).toBe(RLS_VIOLATION);
			expect(refused.error?.message).toContain(PERMISSION_DENIED);
		}
		expect(await readRole(organizationId, stranger.userId)).toBeNull();
		expect(await readRole(organizationId, member.userId)).toBe('member');
		expect(await readRole(organizationId, userId)).toBe('owner');
		expect(await readRole(otherOrganizationId, member.userId)).toBeNull();
	});

	it('refuses an admin pointing a member row at another account', async () => {
		const { organizationId } = await createOrganizationOwnedByMe();
		const admin = await addMemberWithRole(organizationId, 'admin');
		const member = await addMemberWithRole(organizationId, 'member');
		const stranger = await createSignedInClient();

		const { error } = await admin.supabase
			.from('organization_members')
			.update({ user_id: stranger.userId })
			.eq('organization_id', organizationId)
			.eq('user_id', member.userId);

		expect(error?.message).toContain(PERMISSION_DENIED);
		expect(await readRole(organizationId, stranger.userId)).toBeNull();
		expect(await readRole(organizationId, member.userId)).toBe('member');
	});

	it('still makes the creator the owner, and still lets an accepted invitation in', async () => {
		const { supabase, organizationId, userId } = await createOrganizationOwnedByMe();
		const invited = await createSignedInClient();
		const token = crypto.randomUUID().replaceAll('-', '');

		expect(await readRole(organizationId, userId)).toBe('owner');

		const { error: inviteError } = await supabase.from('invites').insert({
			kind: 'organization_member',
			organization_id: organizationId,
			email: invited.email,
			role: 'member',
			token,
			invited_by: userId
		});
		const { error: acceptError } = await invited.supabase.rpc('accept_invite', { token });

		expect(inviteError).toBeNull();
		expect(acceptError).toBeNull();
		expect(await readRole(organizationId, invited.userId)).toBe('member');
	});
});

describe('prevent_last_owner_removal (L2)', () => {
	it('still refuses the only owner stepping down or leaving', async () => {
		const { supabase, organizationId, userId } = await createOrganizationOwnedByMe();

		const demoted = await changeRole(supabase, organizationId, userId, 'admin');
		const left = await removeMember(supabase, organizationId, userId);

		expect(demoted.error?.message).toContain('at least one owner');
		expect(left.error?.message).toContain('at least one owner');
		expect(await readRole(organizationId, userId)).toBe('owner');
	});

	// Each owner's request is its own transaction. Without the advisory lock the
	// trigger now takes on the organisation, both could count the other and both
	// could go, leaving nobody. With it the second waits for the first and then
	// finds itself alone. The race is a matter of timing, so this cannot show
	// the old hole every run; it does show that the lock never lets both out.
	it('leaves one owner when two leave at the same moment', async () => {
		const first = await createOrganizationOwnedByMe();
		const second = await addMemberWithRole(first.organizationId, 'owner');

		const [firstLeft, secondLeft] = await Promise.all([
			removeMember(first.supabase, first.organizationId, first.userId),
			removeMember(second.supabase, first.organizationId, second.userId)
		]);

		const refusals = [firstLeft, secondLeft].filter((answer) =>
			answer.error?.message.includes('at least one owner')
		);
		const { data: owners } = await createServiceRoleClient()
			.from('organization_members')
			.select('user_id')
			.eq('organization_id', first.organizationId)
			.eq('role', 'owner');

		expect(refusals).toHaveLength(1);
		expect(owners).toHaveLength(1);
	});
});

describe('protect_organizations_ownership_columns (H3)', () => {
	// The trigger organizations_protect_ownership_columns: who created an
	// organisation, and whether it is the personal one that holds their quick
	// sessions, is part of the row's identity and never a browser's to change.
	// The partial unique index on (created_by) where is_personal means a
	// rewritten row would both steal the victim's quick sessions and stop them
	// ever getting an organisation of their own.
	const REFUSAL = 'can only be changed by the server';

	it('refuses an owner rewriting created_by or is_personal', async () => {
		const { supabase, organizationId } = await createOrganizationOwnedByMe();
		const victim = await createSignedInClient();

		const reowned = await supabase
			.from('organizations')
			.update({ created_by: victim.userId })
			.eq('id', organizationId);
		const madePersonal = await supabase
			.from('organizations')
			.update({ is_personal: true })
			.eq('id', organizationId);

		expect(reowned.error?.message).toContain(REFUSAL);
		expect(madePersonal.error?.message).toContain(REFUSAL);
	});

	it('refuses an admin too', async () => {
		const { organizationId } = await createOrganizationOwnedByMe();
		const admin = await addMemberWithRole(organizationId, 'admin');
		const victim = await createSignedInClient();

		const { error } = await admin.supabase
			.from('organizations')
			.update({ created_by: victim.userId, is_personal: true })
			.eq('id', organizationId);

		expect(error?.message).toContain(REFUSAL);
	});

	it('still lets an owner change the ordinary columns', async () => {
		const { supabase, organizationId } = await createOrganizationOwnedByMe();

		const { data, error } = await supabase
			.from('organizations')
			.update({ name: 'A better name', country_code: 'NL' })
			.eq('id', organizationId)
			.select('name');

		expect(error).toBeNull();
		expect(data).toEqual([{ name: 'A better name' }]);
	});
});

describe('create_quick_session (H3, L65)', () => {
	/** The members a quick session is started with here. */
	const MEMBERS = [
		{ name: 'France', country_code: 'FR' },
		{ name: 'Germany', country_code: 'DE' }
	];

	/** What create_quick_session says to the twenty-sixth live quick session. */
	const CAP_REFUSAL = '25 quick sessions';
	/** What conferences_protect_quick_session_days says to a browser. */
	const GUARD_REFUSAL = 'days and timezone of a quick session are set by the database';

	/** "Start session" on /quick/new, as `client`, answering what the database said. */
	function startQuickSession(
		client: SupabaseClient,
		committeeName = 'Security Council',
		timezone = 'Europe/Amsterdam'
	) {
		return client.rpc('create_quick_session', {
			committee_name: committeeName,
			committee_slug: 'security-council',
			topic: null,
			speaking_time_seconds: 90,
			seats: MEMBERS,
			timezone
		});
	}

	/** Starts `count` quick sessions as `creator`, one after the other, each in `timezone`. */
	async function startQuickSessions(creator: SignedInClient, count: number, timezone?: string) {
		for (let index = 0; index < count; index += 1) {
			const { error } = await startQuickSession(creator.supabase, `Committee ${index}`, timezone);

			if (error) {
				throw new Error(`Quick session ${index} was refused: ${error.message}`);
			}
		}
	}

	/** The id of the organisation that holds `creator`'s quick sessions. */
	async function readPersonalOrganizationId(creator: SignedInClient): Promise<string> {
		const { data, error } = await creator.supabase
			.from('organizations')
			.select('id')
			.eq('created_by', creator.userId)
			.eq('is_personal', true)
			.single();

		if (error || !data) {
			throw new Error(`Could not find the personal organisation: ${error?.message}`);
		}

		return data.id;
	}

	/** How many conferences the organisation holds, read with the service role. */
	async function countConferences(organizationId: string): Promise<number> {
		const { count, error } = await createServiceRoleClient()
			.from('conferences')
			.select('id', { count: 'exact', head: true })
			.eq('organization_id', organizationId);

		if (error) {
			throw new Error(`Could not count the conferences: ${error.message}`);
		}

		return count ?? 0;
	}

	it('refuses to use a personal organisation its caller does not own', async () => {
		const victim = await createSignedInClient();

		// The row a hijack would leave behind: a personal organisation that says
		// the victim created it, with no owner row for them. The trigger above
		// refuses it to a browser, so only the service role can arrange it, in
		// two steps because the creator trigger would otherwise make the victim
		// its owner.
		const service = createServiceRoleClient();
		const { data: planted, error: plantError } = await service
			.from('organizations')
			.insert({ name: 'Quick sessions', slug: `personal-${crypto.randomUUID()}` })
			.select('id')
			.single();

		if (plantError || !planted) {
			throw new Error(`Could not plant the organisation: ${plantError?.message}`);
		}

		const { error: rewriteError } = await service
			.from('organizations')
			.update({ created_by: victim.userId, is_personal: true })
			.eq('id', planted.id);

		if (rewriteError) {
			throw new Error(`Could not rewrite the planted organisation: ${rewriteError.message}`);
		}

		const { error } = await startQuickSession(victim.supabase);

		expect(error?.message).toContain('not owned by you');
		expect(await countConferences(planted.id)).toBe(0);
	});

	/** The conference a quick session made, read as its creator. */
	async function readQuickSession(creator: SignedInClient, conferenceSlug: string) {
		const { data, error } = await creator.supabase
			.from('conferences')
			.select('id, kind, start_date, end_date')
			.eq('slug', conferenceSlug)
			.single();

		if (error || !data) {
			throw new Error(`Could not read the quick session: ${error?.message}`);
		}

		return data;
	}

	it('refuses the twenty-sixth live quick session, even when six are asked for at once', async () => {
		const creator = await createSignedInClient();

		await startQuickSessions(creator, 24);

		// Six requests at the same moment, with one place left. Each is its own
		// transaction; without the advisory lock in create_quick_session all six
		// counted 24 and all six went through.
		const burst = await Promise.all(
			Array.from({ length: 6 }, (_, index) => startQuickSession(creator.supabase, `Burst ${index}`))
		);
		const oneMore = await startQuickSession(creator.supabase, 'One too many');

		expect(burst.filter((answer) => answer.error === null)).toHaveLength(1);
		expect(burst.filter((answer) => answer.error?.message.includes(CAP_REFUSAL))).toHaveLength(5);
		expect(oneMore.error?.message).toContain(CAP_REFUSAL);

		expect(await countConferences(await readPersonalOrganizationId(creator))).toBe(25);
	}, 120_000);

	// The trigger conferences_protect_quick_session_days, function
	// protect_quick_session_days: the cap counts quick sessions whose last day
	// has not passed, and the creator owns the personal organisation and so may
	// edit its conferences. Without the trigger one update that moved every last
	// day to 2000 made room for twenty-five more.
	it('refuses the creator backdating a quick session or making it an ordinary conference', async () => {
		const creator = await createSignedInClient();
		const { data: started, error: startError } = await startQuickSession(creator.supabase);
		const address = started?.[0];

		if (startError || !address) {
			throw new Error(`The quick session was refused: ${startError?.message}`);
		}

		const before = await readQuickSession(creator, address.conference_slug);

		const backdated = await creator.supabase
			.from('conferences')
			.update({ start_date: '2000-01-01', end_date: '2000-01-01' })
			.eq('id', before.id);
		const lastDayMoved = await creator.supabase
			.from('conferences')
			.update({ end_date: '2000-01-01' })
			.eq('id', before.id);
		const madeOrdinary = await creator.supabase
			.from('conferences')
			.update({ kind: 'conference' })
			.eq('id', before.id);

		expect(backdated.error?.message).toContain(GUARD_REFUSAL);
		expect(lastDayMoved.error?.message).toContain(GUARD_REFUSAL);
		expect(madeOrdinary.error?.message).toContain(GUARD_REFUSAL);
		expect(await readQuickSession(creator, address.conference_slug)).toEqual(before);

		// The database itself still moves the days: the service role here, the
		// way the browser tests put a conference on today, and in production
		// move_quick_session_end_date, which runs as the database's own owner.
		const movedByTheServer = await createServiceRoleClient()
			.from('conferences')
			.update({ end_date: '2099-01-01' })
			.eq('id', before.id)
			.select('end_date');

		expect(movedByTheServer.error).toBeNull();
		expect(movedByTheServer.data).toEqual([{ end_date: '2099-01-01' }]);

		// An ordinary conference's days stay its organiser's to change.
		const ordinary = await createConferenceOwnedByMe();
		const rescheduled = await ordinary.supabase
			.from('conferences')
			.update({ start_date: '2021-03-01', end_date: '2021-03-03' })
			.eq('id', ordinary.conferenceId)
			.select('end_date');

		expect(rescheduled.error).toBeNull();
		expect(rescheduled.data).toEqual([{ end_date: '2021-03-03' }]);
	});

	// The same trigger holds the timezone. "Live" asks whether a quick session's
	// last day has passed in its own timezone, so holding the day alone was not
	// enough: twenty-five sessions made in the zone furthest behind UTC and then
	// moved to the zone furthest ahead, twenty-six hours on, would every one
	// have a last day in the past whatever the hour, and make room for
	// twenty-five more. A zone Postgres does not know is refused the same way:
	// with one on the books the count, and so create_quick_session, would fail
	// for this account for ever.
	it('refuses the creator moving quick sessions to a timezone where their day has passed, so the cap holds', async () => {
		const creator = await createSignedInClient();
		const BEHIND_UTC = 'Etc/GMT+12';
		const AHEAD_OF_UTC = 'Pacific/Kiritimati';

		await startQuickSessions(creator, 25, BEHIND_UTC);
		const personalOrganizationId = await readPersonalOrganizationId(creator);

		const rezoned = await creator.supabase
			.from('conferences')
			.update({ timezone: AHEAD_OF_UTC })
			.eq('organization_id', personalOrganizationId);
		const unknownZone = await creator.supabase
			.from('conferences')
			.update({ timezone: 'Mars/Olympus_Mons' })
			.eq('organization_id', personalOrganizationId);
		const oneMore = await startQuickSession(creator.supabase, 'One too many', BEHIND_UTC);

		expect(rezoned.error?.message).toContain(GUARD_REFUSAL);
		expect(unknownZone.error?.message).toContain(GUARD_REFUSAL);
		expect(oneMore.error?.message).toContain(CAP_REFUSAL);

		const { data: held } = await createServiceRoleClient()
			.from('conferences')
			.select('timezone')
			.eq('organization_id', personalOrganizationId);

		expect(held).toHaveLength(25);
		expect(held?.every((conference) => conference.timezone === BEHIND_UTC)).toBe(true);
	}, 120_000);
});
