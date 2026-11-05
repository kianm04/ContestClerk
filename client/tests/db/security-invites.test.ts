import { describe, expect, it } from 'vitest';
import {
	createServiceRoleClient,
	createSignedInClient,
	createVisitorClient
} from './supabase-test-client';
import { addRole, createConferenceOwnedByMe, presetRoleId } from './conference-fixtures';

// The invitation findings of docs/security-review-2026-10-10.md, closed by
// supabase/migrations/20261022121000_security_invites.sql:
//
// * H1: `list_my_invites` named every waiting invitation by its secret token,
//   and both it and `accept_invite` matched the caller's address without asking
//   whether that address was ever confirmed. The list now carries the row's id,
//   `accept_invite_by_id` accepts by that id, and every match is against a
//   confirmed address.
// * M11: a team manager could invite their own address and accept it. The
//   insert policy refuses one's own address and accepting refuses an invitation
//   one sent oneself.
// * M15: an organisation admin could invite somebody as an owner. The policy
//   refuses `owner` and accepting refuses an owner invitation however the row
//   got there.
// * L1: `notify_invite` wrote the row's free text into a bell. The role column
//   is checked, the text columns have lengths, the sentence is fixed words, and
//   an inviter may send fifty invitations an hour, counted in `invite_sends`,
//   a log a browser cannot read, write or shorten by withdrawing invitations.
// * L18: `get_invite` answered every column for a used or expired token. It
//   now says a status word and nothing identifying for those.
//
// THE UNCONFIRMED RULE
// Local GoTrue has email confirmation switched off, so every account these
// tests sign up is confirmed at once, and GoTrue will not sign an unconfirmed
// account in at all: there is no client a test could hold for one. The
// confirmed path is what is tested here. The reviewer exercises the other
// half in SQL against the lane's database:
//
//   update auth.users set email_confirmed_at = null where email = '<invitee>';
//   set role authenticated;
//   set request.jwt.claims = '{"sub": "<invitee id>", "role": "authenticated"}';
//   select public.accept_invite('<token>');        -- "Confirm your email address …"
//   select public.accept_invite_by_id('<invite id>'); -- the same words
//   select * from public.list_my_invites();        -- no rows
//
// tests/db/invites.test.ts and tests/db/team-invites.test.ts cover what the
// functions did before; nothing here repeats that.

/** A token is 32 url-safe characters. Any unique text of that length does for a test. */
function makeToken(): string {
	return crypto.randomUUID().replaceAll('-', '');
}

/**
 * The SQLSTATE Postgres answers with for a policy that refused a row and for a
 * function or table the role may not use. Asserting it, rather than any error,
 * keeps an unrelated failure from making a refusal test pass.
 */
const PERMISSION_DENIED = '42501';

/** The words the trigger refuses the fifty-first invitation of an hour with. */
const RATE_CAP_WORDS = 'in the last hour';

/** An hour, in milliseconds, for dating a row further back than the cap looks. */
const ONE_HOUR = 60 * 60 * 1000;

/** How many invitations one inviter may send in an hour. */
const INVITES_PER_HOUR = 50;

/** How many characters of a name the bell sentence keeps. */
const NAME_CHARACTERS_IN_BELL = 80;

/**
 * Write an invitation into the fixture organisation through its owner's own
 * client, so that the insert policy has to allow it. Answers the row's id and
 * token, which the two accept functions take.
 */
async function inviteToOrganization(
	fixture: Awaited<ReturnType<typeof createConferenceOwnedByMe>>,
	email: string,
	role = 'member'
): Promise<{ id: string; token: string }> {
	const { data, error } = await fixture.supabase
		.from('invites')
		.insert({
			kind: 'organization_member',
			organization_id: fixture.organizationId,
			email,
			role,
			token: makeToken(),
			invited_by: fixture.userId
		})
		.select('id, token')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the fixture invitation: ${error?.message}`);
	}

	return data;
}

/**
 * Fifty invitations from the fixture owner in one statement, the most the cap
 * allows in an hour. `extra` is laid over every row, so a test can date them
 * or otherwise dress them up.
 */
async function sendFiftyInvitations(
	fixture: Awaited<ReturnType<typeof createConferenceOwnedByMe>>,
	extra: Record<string, string> = {}
): Promise<void> {
	const batch = crypto.randomUUID();

	const fifty = Array.from({ length: INVITES_PER_HOUR }, (_, index) => ({
		kind: 'organization_member' as const,
		organization_id: fixture.organizationId,
		email: `rate-${index}-${batch}@example.com`,
		role: 'member',
		token: makeToken(),
		invited_by: fixture.userId,
		...extra
	}));

	const { error } = await fixture.supabase.from('invites').insert(fifty);

	expect(error).toBeNull();
}

/** One more invitation from the fixture owner, which the cap decides about. */
async function sendOneMoreInvitation(
	fixture: Awaited<ReturnType<typeof createConferenceOwnedByMe>>
): Promise<{ message: string } | null> {
	const { error } = await fixture.supabase.from('invites').insert({
		kind: 'organization_member',
		organization_id: fixture.organizationId,
		email: `rate-one-more-${crypto.randomUUID()}@example.com`,
		role: 'member',
		token: makeToken(),
		invited_by: fixture.userId
	});

	return error;
}

describe('list_my_invites, after H1', () => {
	it('names a waiting invitation by its id and never hands out the token', async () => {
		const fixture = await createConferenceOwnedByMe();
		const invited = await createSignedInClient();
		const { id } = await inviteToOrganization(fixture, invited.email);

		const { data, error } = await invited.supabase.rpc('list_my_invites');

		expect(error).toBeNull();
		expect(data).toHaveLength(1);
		expect(data?.[0]).toMatchObject({ id, kind: 'organization_member', role: 'member' });
		// The token is the link's secret. Whoever can call this function already
		// holds the address, and the id is all the accept button needs.
		expect(data?.[0]).not.toHaveProperty('token');
	});
});

describe('accept_invite_by_id, after H1', () => {
	it('lets the invited person accept by the id and joins them to the organisation', async () => {
		const fixture = await createConferenceOwnedByMe();
		const invited = await createSignedInClient();
		const { id } = await inviteToOrganization(fixture, invited.email);

		const { data: destination, error } = await invited.supabase.rpc('accept_invite_by_id', {
			invite_id: id
		});

		expect(error).toBeNull();
		expect(destination).toContain('/manage/organizations/');

		const { data: memberships } = await invited.supabase
			.from('organization_members')
			.select('role')
			.eq('organization_id', fixture.organizationId)
			.eq('user_id', invited.userId);

		expect(memberships).toEqual([{ role: 'member' }]);
	});

	it('refuses another account, although an id is no secret', async () => {
		const fixture = await createConferenceOwnedByMe();
		const invited = await createSignedInClient();
		const somebodyElse = await createSignedInClient();
		const { id } = await inviteToOrganization(fixture, invited.email);

		const { error } = await somebodyElse.supabase.rpc('accept_invite_by_id', { invite_id: id });

		expect(error?.message).toContain('different email address');

		const { data: memberships } = await fixture.supabase
			.from('organization_members')
			.select('user_id')
			.eq('organization_id', fixture.organizationId)
			.eq('user_id', somebodyElse.userId);

		expect(memberships).toEqual([]);
	});

	it('refuses an invitation that was accepted already, by either road', async () => {
		const fixture = await createConferenceOwnedByMe();
		const invited = await createSignedInClient();
		const { id, token } = await inviteToOrganization(fixture, invited.email);

		await invited.supabase.rpc('accept_invite', { token });

		// The two functions share one body, so the second road refuses with the
		// same words as the first would.
		const { error } = await invited.supabase.rpc('accept_invite_by_id', { invite_id: id });

		expect(error?.message).toContain('already been used');
	});

	it('tells a stranger holding the id of a used invitation only that it is not theirs', async () => {
		const fixture = await createConferenceOwnedByMe();
		const invited = await createSignedInClient();
		const stranger = await createSignedInClient();
		const { id, token } = await inviteToOrganization(fixture, invited.email);

		await invited.supabase.rpc('accept_invite', { token });

		// The address is checked before the state of the invitation, so an id
		// says nothing about whether its invitation was used or has run out.
		const { error } = await stranger.supabase.rpc('accept_invite_by_id', { invite_id: id });

		expect(error?.message).toContain('different email address');
	});

	it('is not there at all for somebody who is not signed in', async () => {
		const visitor = createVisitorClient();

		const { error } = await visitor.rpc('accept_invite_by_id', {
			invite_id: crypto.randomUUID()
		});

		expect(error?.code).toBe(PERMISSION_DENIED);
	});
});

// The body both roads share. It writes memberships as the server from whatever
// row its id finds, so it is for the two wrappers alone; a browser is refused
// before it runs. It reads the row for itself, so even a caller who got past
// the revoke could only accept an invitation to their own confirmed address.
describe('accept_invite_row, the body behind both roads', () => {
	it('is refused to a browser, signed in or not', async () => {
		const fixture = await createConferenceOwnedByMe();
		const invited = await createSignedInClient();
		const { id } = await inviteToOrganization(fixture, invited.email);

		const { error: signedInError } = await invited.supabase.rpc('accept_invite_row', {
			invite_id: id
		});

		expect(signedInError?.code).toBe(PERMISSION_DENIED);

		const { error: visitorError } = await createVisitorClient().rpc('accept_invite_row', {
			invite_id: id
		});

		expect(visitorError?.code).toBe(PERMISSION_DENIED);

		const { data: memberships } = await invited.supabase
			.from('organization_members')
			.select('role')
			.eq('organization_id', fixture.organizationId)
			.eq('user_id', invited.userId);

		expect(memberships).toEqual([]);
	});
});

// The insert policy asks `invite_sender_email` for the caller's own address;
// both accept functions hand the row to `accept_invite_row`, which holds the
// rules, so a refusal reads the same whichever road it came by.
describe('inviting oneself, after M11', () => {
	it('refuses an organisation owner inviting their own address', async () => {
		const fixture = await createConferenceOwnedByMe();

		const { error } = await fixture.supabase.from('invites').insert({
			kind: 'organization_member',
			organization_id: fixture.organizationId,
			email: fixture.email,
			role: 'admin',
			token: makeToken(),
			invited_by: fixture.userId
		});

		expect(error?.code).toBe(PERMISSION_DENIED);
	});

	it('refuses a team manager inviting their own address onto the conference', async () => {
		const fixture = await createConferenceOwnedByMe();

		const { error } = await fixture.supabase.from('invites').insert({
			kind: 'conference_staff',
			conference_id: fixture.conferenceId,
			email: fixture.email,
			role_id: await presetRoleId(fixture.supabase, fixture.conferenceId, 'Chair'),
			token: makeToken(),
			invited_by: fixture.userId
		});

		expect(error?.code).toBe(PERMISSION_DENIED);
	});

	it('refuses accepting an invitation one sent oneself, however the row got there', async () => {
		const fixture = await createConferenceOwnedByMe();
		const token = makeToken();

		// No policy lets this row be written any more, so the service role stands
		// in for a row from before the rule.
		const { error: writeError } = await createServiceRoleClient()
			.from('invites')
			.insert({
				kind: 'conference_staff',
				conference_id: fixture.conferenceId,
				email: fixture.email,
				role_id: await presetRoleId(fixture.supabase, fixture.conferenceId, 'Chair'),
				token,
				invited_by: fixture.userId
			});

		expect(writeError).toBeNull();

		const { error } = await fixture.supabase.rpc('accept_invite', { token });

		expect(error?.message).toContain('yourself');

		const { data: staff } = await fixture.supabase
			.from('conference_staff')
			.select('user_id')
			.eq('conference_id', fixture.conferenceId)
			.eq('user_id', fixture.userId);

		expect(staff).toEqual([]);
	});
});

describe('owner invitations, after M15', () => {
	it('refuses an organisation owner inviting somebody as an owner', async () => {
		const fixture = await createConferenceOwnedByMe();

		// Even the owner may not: ownership is given to a member who is already
		// in, never to an address that might have been mistyped.
		const { error } = await fixture.supabase.from('invites').insert({
			kind: 'organization_member',
			organization_id: fixture.organizationId,
			email: 'would.be.owner@example.com',
			role: 'owner',
			token: makeToken(),
			invited_by: fixture.userId
		});

		expect(error?.code).toBe(PERMISSION_DENIED);
	});

	it('refuses accepting an owner invitation written before the rule', async () => {
		const fixture = await createConferenceOwnedByMe();
		const invited = await createSignedInClient();
		const token = makeToken();

		const { error: writeError } = await createServiceRoleClient().from('invites').insert({
			kind: 'organization_member',
			organization_id: fixture.organizationId,
			email: invited.email,
			role: 'owner',
			token,
			invited_by: fixture.userId
		});

		expect(writeError).toBeNull();

		const { error } = await invited.supabase.rpc('accept_invite', { token });

		expect(error?.message).toContain('owner');

		const { data: memberships } = await invited.supabase
			.from('organization_members')
			.select('role')
			.eq('organization_id', fixture.organizationId)
			.eq('user_id', invited.userId);

		expect(memberships).toEqual([]);
	});
});

describe('invites, the shape of a row, after L1', () => {
	it('refuses a role word that is not an organisation role', async () => {
		const fixture = await createConferenceOwnedByMe();

		const { error } = await fixture.supabase.from('invites').insert({
			kind: 'organization_member',
			organization_id: fixture.organizationId,
			email: 'sponsor@example.com',
			role: 'sponsor',
			token: makeToken(),
			invited_by: fixture.userId
		});

		expect(error?.message).toContain('invites_role_is_organization_role');
	});

	it('refuses an address longer than an address can be', async () => {
		const fixture = await createConferenceOwnedByMe();

		const { error } = await fixture.supabase.from('invites').insert({
			kind: 'organization_member',
			organization_id: fixture.organizationId,
			email: `${'a'.repeat(250)}@example.com`,
			role: 'member',
			token: makeToken(),
			invited_by: fixture.userId
		});

		expect(error?.message).toContain('invites_email_length');
	});

	it('refuses a token that is too short to be a secret', async () => {
		const fixture = await createConferenceOwnedByMe();

		const { error } = await fixture.supabase.from('invites').insert({
			kind: 'organization_member',
			organization_id: fixture.organizationId,
			email: 'guessable@example.com',
			role: 'member',
			token: 'short',
			invited_by: fixture.userId
		});

		expect(error?.message).toContain('invites_token_length');
	});

	it('stamps created_at and the acceptance columns itself, whatever a sender writes', async () => {
		const fixture = await createConferenceOwnedByMe();
		const invited = await createSignedInClient();
		const before = Date.now();

		// A browser role may insert every column, so a sender could otherwise
		// date an invitation back two hours or say somebody had accepted it.
		const { data, error } = await fixture.supabase
			.from('invites')
			.insert({
				kind: 'organization_member',
				organization_id: fixture.organizationId,
				email: invited.email,
				role: 'member',
				token: makeToken(),
				invited_by: fixture.userId,
				created_at: new Date(before - 2 * ONE_HOUR).toISOString(),
				accepted_at: new Date(before).toISOString(),
				accepted_by: invited.userId
			})
			.select('created_at, accepted_at, accepted_by')
			.single();

		expect(error).toBeNull();
		// An hour of slack for the Docker clock, which still tells the moment of
		// the send from two hours before it.
		expect(new Date(data?.created_at ?? 0).getTime()).toBeGreaterThan(before - ONE_HOUR);
		expect(data?.accepted_at).toBeNull();
		expect(data?.accepted_by).toBeNull();
	});
});

describe('guard_invite_rate, invites_guard_invite_rate, after L1', () => {
	it('lets an inviter send fifty invitations in an hour and refuses the fifty-first', async () => {
		const fixture = await createConferenceOwnedByMe();

		await sendFiftyInvitations(fixture);

		const error = await sendOneMoreInvitation(fixture);

		expect(error?.message).toContain(RATE_CAP_WORDS);
	});

	it('counts an invitation the sender dated two hours ago like any other', async () => {
		const fixture = await createConferenceOwnedByMe();

		// A cap that counted the invites rows by created_at, which the sender
		// may write, would let a hundred rows dated two hours ago through. The
		// count comes from the moment of the send, which the trigger records.
		await sendFiftyInvitations(fixture, {
			created_at: new Date(Date.now() - 2 * ONE_HOUR).toISOString()
		});

		const error = await sendOneMoreInvitation(fixture);

		expect(error?.message).toContain(RATE_CAP_WORDS);
	});

	it('still refuses the fifty-first after the first fifty were withdrawn', async () => {
		const fixture = await createConferenceOwnedByMe();

		await sendFiftyInvitations(fixture);

		// Withdrawing is allowed, and does nothing to the hour's count: the bell
		// rows the fifty left behind are the reason the cap exists.
		const { data: withdrawn, error: withdrawError } = await fixture.supabase
			.from('invites')
			.delete()
			.eq('invited_by', fixture.userId)
			.select('id');

		expect(withdrawError).toBeNull();
		expect(withdrawn).toHaveLength(INVITES_PER_HOUR);

		const error = await sendOneMoreInvitation(fixture);

		expect(error?.message).toContain(RATE_CAP_WORDS);
	});
});

describe('invite_sends, the log behind the cap', () => {
	it('keeps a row for every send, and keeps it when the invitation is withdrawn', async () => {
		const fixture = await createConferenceOwnedByMe();
		const { id } = await inviteToOrganization(fixture, 'first@example.com');
		await inviteToOrganization(fixture, 'second@example.com');

		const { error: withdrawError } = await fixture.supabase.from('invites').delete().eq('id', id);

		expect(withdrawError).toBeNull();

		// Only the server may look. The service role stands in for it here.
		const { data: sends } = await createServiceRoleClient()
			.from('invite_sends')
			.select('sent_at')
			.eq('invited_by', fixture.userId);

		expect(sends).toHaveLength(2);
	});

	it('can be neither read nor written by a browser', async () => {
		const fixture = await createConferenceOwnedByMe();
		await inviteToOrganization(fixture, 'logged@example.com');

		// The inviter's own sends are no more theirs to see than to erase: a
		// log the sender could trim would be no cap at all.
		const { error: readError } = await fixture.supabase.from('invite_sends').select('sent_at');

		expect(readError?.code).toBe(PERMISSION_DENIED);

		const { error: eraseError } = await fixture.supabase
			.from('invite_sends')
			.delete()
			.eq('invited_by', fixture.userId);

		expect(eraseError?.code).toBe(PERMISSION_DENIED);

		const { error: writeError } = await createVisitorClient()
			.from('invite_sends')
			.insert({ invited_by: fixture.userId });

		expect(writeError?.code).toBe(PERMISSION_DENIED);
	});
});

describe('notify_invite, after L1', () => {
	it('writes fixed words for an organisation role rather than the column', async () => {
		const fixture = await createConferenceOwnedByMe();
		const invited = await createSignedInClient();

		await inviteToOrganization(fixture, invited.email, 'admin');

		// "Test Person" is the name createSignedInClient registers the fixture
		// owner under, and "Fixture org" is the organisation the fixture makes.
		const { data } = await invited.supabase.from('notifications').select('title');

		expect(data).toEqual([{ title: 'Test Person invited you to Fixture org as an admin' }]);
	});

	it('cuts a long organisation name down to eighty characters', async () => {
		const fixture = await createConferenceOwnedByMe();
		const invited = await createSignedInClient();
		const longName = 'Society '.repeat(12).trim() + ' of Model United Nations';

		expect(longName.length).toBeGreaterThan(NAME_CHARACTERS_IN_BELL);

		const { error: renameError } = await fixture.supabase
			.from('organizations')
			.update({ name: longName })
			.eq('id', fixture.organizationId);

		expect(renameError).toBeNull();

		await inviteToOrganization(fixture, invited.email);

		const { data } = await invited.supabase.from('notifications').select('title');

		expect(data?.[0].title).toContain(longName.slice(0, NAME_CHARACTERS_IN_BELL));
		expect(data?.[0].title).not.toContain(longName);
	});

	it("says a conference invitation is to the team, whatever the role's name is", async () => {
		const fixture = await createConferenceOwnedByMe();
		const invited = await createSignedInClient();

		// A role's name is the organiser's own text, so the bell never repeats it.
		const roleId = await addRole(fixture.supabase, fixture.conferenceId, {
			name: 'Sponsor liaison',
			permissions: []
		});

		const { error } = await fixture.supabase.from('invites').insert({
			kind: 'conference_staff',
			conference_id: fixture.conferenceId,
			email: invited.email,
			role_id: roleId,
			token: makeToken(),
			invited_by: fixture.userId
		});

		expect(error).toBeNull();

		const { data } = await invited.supabase.from('notifications').select('title');

		expect(data).toEqual([
			{ title: 'Test Person invited you to join the team of Fixture Conference' }
		]);
	});
});

describe('get_invite, after L18', () => {
	it('still tells a visitor holding the token what a pending invitation is for', async () => {
		const fixture = await createConferenceOwnedByMe();
		const { token } = await inviteToOrganization(fixture, 'pending.person@example.com');

		const { data, error } = await createVisitorClient().rpc('get_invite', { token });

		expect(error).toBeNull();
		expect(data?.[0]).toMatchObject({
			status: 'pending',
			email: 'pending.person@example.com',
			organization_name: 'Fixture org',
			invited_by_name: 'Test Person'
		});
	});

	it('says a used invitation is used, and nothing about who it was for', async () => {
		const fixture = await createConferenceOwnedByMe();
		const invited = await createSignedInClient();
		const { token } = await inviteToOrganization(fixture, invited.email);

		await invited.supabase.rpc('accept_invite', { token });

		const { data } = await createVisitorClient().rpc('get_invite', { token });

		expect(data).toHaveLength(1);
		expect(data?.[0]).toMatchObject({
			kind: 'organization_member',
			status: 'used',
			email: null,
			organization_name: null,
			organization_slug: null,
			invited_by_name: null
		});
		expect(data?.[0].accepted_at).not.toBeNull();
	});

	it('says an expired invitation is expired, and nothing identifying', async () => {
		const fixture = await createConferenceOwnedByMe();
		const token = makeToken();

		const { error: writeError } = await fixture.supabase.from('invites').insert({
			kind: 'conference_staff',
			conference_id: fixture.conferenceId,
			email: 'too.late@example.com',
			role_id: await presetRoleId(fixture.supabase, fixture.conferenceId, 'Volunteer'),
			token,
			invited_by: fixture.userId,
			expires_at: new Date(Date.now() - 1000).toISOString()
		});

		expect(writeError).toBeNull();

		const { data } = await createVisitorClient().rpc('get_invite', { token });

		expect(data?.[0]).toMatchObject({
			kind: 'conference_staff',
			status: 'expired',
			email: null,
			conference_name: null,
			conference_slug: null,
			committee_name: null,
			invited_by_name: null
		});
	});
});
