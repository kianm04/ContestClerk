/**
 * The invitations waiting for the signed-in person, and accepting one.
 *
 * Files under `$lib/server` only ever run on the server, so this is where the
 * database is asked. Like the other modules here, every function takes the
 * Supabase client as its first argument, and pages pass in `locals.supabase`,
 * the client that knows who is signed in.
 *
 * Some of what is here calls an SQL function and some reads the `invites` table
 * itself. The five functions are `list_my_invites()`, which finds the
 * invitations addressed to the signed-in person; `accept_invite(token)` and
 * `accept_invite_by_id(invite_id)`, which write the membership or the staff
 * row and mark the invitation used in one go, so the two can never disagree;
 * `get_invite(token)`, which says what one invitation is for; and
 * `conference_team_has_email(...)`, which says whether an address is already
 * on a conference's team. All five are `security definer`, which means
 * Postgres runs them as their owner instead of as the
 * reader, because each needs something a Row Level Security policy cannot
 * express: an invitation is found by its token or by an email address, the
 * token is a secret the browser holds, and the addresses live in `auth.users`,
 * which the app may not read. `docs/roles-and-permissions.md` says who may
 * send, read and withdraw an invitation.
 *
 * The rest — the list of invitations nobody has accepted, writing one and
 * withdrawing one — are ordinary queries on the `invites` table, which its own
 * policies give to the conference's organisers and to the organisation's
 * admins. There are two sets of those, one per `kind`: a conference's team
 * invitations towards the middle of this file, and an organisation's at the
 * end. A row is one kind or the other and never both.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChairedCommittee, InviteStatus, InviteView } from '$lib/invites';
import type { InviteKind, PendingInvite } from '$lib/manage';
import type { OrganizationRole, PendingOrganizationInvite } from '$lib/organizations';
import type { PendingStaffInvite, RoleScope, TeamCommittee } from '$lib/team';

/**
 * One row of `list_my_invites()`, which returns columns of its own rather than
 * whole `invites` rows.
 *
 * Exactly one of the two names is filled in: an invitation is either to an
 * organisation or to a conference, and the table's own constraint refuses a row
 * that is to both or to neither.
 */
type MyInviteRow = {
	/** The row's id. The function hands out no token: the Accept button accepts by id. */
	id: string;
	kind: InviteKind;
	/** An `organization_role` value, or the name of the conference role the invitation offers. */
	role: string;
	organization_name: string | null;
	conference_name: string | null;
	expires_at: string;
};

/**
 * The invitations waiting for the signed-in person: not yet accepted, not yet
 * expired, and addressed to their email address.
 *
 * The SQL function does all three of those checks, so there is nothing to
 * filter here. `expires_at` comes back with each row but the page shows no
 * deadline, so it is read and then left alone.
 */
export async function listMyInvites(supabase: SupabaseClient): Promise<PendingInvite[]> {
	const { data, error } = await supabase.rpc('list_my_invites');

	// A failed call means a bug (a missing grant, a renamed function), not
	// something the reader can fix, so it throws the way every other query in
	// `$lib/server` does.
	if (error) {
		throw new Error(`Could not list your invitations: ${error.message}`);
	}

	const rows: MyInviteRow[] = data ?? [];

	return rows.map((row) => ({
		id: row.id,
		kind: row.kind,
		role: row.role,
		// Whichever of the two names came back is the one the sentence shows. The
		// empty string is belt and braces: it would take an invitation pointing at
		// nothing, which the table refuses.
		name: row.organization_name ?? row.conference_name ?? ''
	}));
}

/**
 * Accept one by its token. Answers `true` when it worked, and `false` when the
 * database refused it — expired, already used, addressed to somebody else, or
 * sent by somebody who can no longer give what it offers (migration
 * 20261023121000: they left, or lost the right to manage the team).
 *
 * The SQL function raises an exception for every one of those refusals, so an
 * `error` here is a refusal rather than a fault, and this answers `false`
 * instead of throwing: the page turns that into a sentence the organiser can
 * read, where throwing would replace the page with an error.
 *
 * The function also returns the path the person should go to next, which is
 * ignored. Both callers work the destination out for themselves from the
 * invitation they are already holding, so that every address in the app is
 * still built by `$lib/urls.ts` and type-checked by `resolve()`.
 */
export async function acceptInvite(supabase: SupabaseClient, token: string): Promise<boolean> {
	const { error } = await supabase.rpc('accept_invite', { token });

	if (error) {
		return false;
	}

	return true;
}

/**
 * Accept one by its id, from the list on the home page. Answers `true` or
 * `false` exactly as `acceptInvite` does, and for the same reasons.
 *
 * The id is what `listMyInvites` hands out in place of the token, which is the
 * link's secret and has no business on a page that already knows who is
 * reading it (security review H1). The database runs the same checks either
 * way: the invitation is open, and it was sent to the reader's own confirmed
 * address. Both functions share one body in SQL, so the two roads cannot
 * disagree.
 */
export async function acceptInviteById(
	supabase: SupabaseClient,
	inviteId: string
): Promise<boolean> {
	const { error } = await supabase.rpc('accept_invite_by_id', { invite_id: inviteId });

	if (error) {
		return false;
	}

	return true;
}

/** One `committee_chairs` row, with its committee and that committee's conference. */
type ChairedCommitteeRow = {
	committees: { name: string; slug: string; conferences: { slug: string } | null } | null;
};

/**
 * Every committee this person chairs, for the accept page to find the one a
 * chair invitation named once it is accepted (`05-pages/auth/invite.md`, "A
 * chair lands in the chair room").
 *
 * The select policy on `committee_chairs` lets a chair read their own rows,
 * and a chair is on the conference's team, so the committee and conference
 * can be read too. A row whose committee or conference comes back `null`
 * anyway is left out, because there is no room to send anybody to.
 */
export async function listMyChairedCommittees(
	supabase: SupabaseClient,
	userId: string
): Promise<ChairedCommittee[]> {
	const { data, error } = await supabase
		.from('committee_chairs')
		.select('committees(name, slug, conferences(slug))')
		.eq('user_id', userId)
		.overrideTypes<ChairedCommitteeRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not list the committees you chair: ${error.message}`);
	}

	const chairedCommittees: ChairedCommittee[] = [];

	for (const row of data ?? []) {
		const conference = row.committees?.conferences;

		if (row.committees && conference) {
			chairedCommittees.push({
				committeeName: row.committees.name,
				committeeSlug: row.committees.slug,
				conferenceSlug: conference.slug
			});
		}
	}

	return chairedCommittees;
}

// -----------------------------------------------------------------------------
// The invitations of one conference
// -----------------------------------------------------------------------------
// Everything below belongs to the organiser's team page at
// `/manage/[slug]/team`, which sends the invitations the two functions above
// answer for, and to the accept page at `/invites/[token]`.

/**
 * The characters an invitation token is made of.
 *
 * They are letters and digits only, because the token is the last part of the
 * link the organiser copies — `/invites/<token>` — and a character that has to
 * be escaped in an address would be one more thing to go wrong on the way.
 *
 * There are exactly 32 of them so that no character comes up more often than
 * another: a random byte is one of 256 values, 256 is exactly eight lots of 32,
 * and so folding a byte onto this alphabet shares the bytes out evenly. An
 * alphabet of, say, 62 characters would not divide into 256 and the first few
 * letters would turn up slightly more often than the rest.
 */
const INVITE_TOKEN_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

/**
 * How many characters a token has: 32, the shortest the database takes
 * (`invites_token_length` allows 32 to 64, and `invites_token_is_url_safe`
 * only letters, digits, `-` and `_`).
 */
const INVITE_TOKEN_LENGTH = 32;

/**
 * A fresh 32-character url-safe token, the secret in an invitation link.
 *
 * `crypto.getRandomValues` is the platform's own cryptographic random number
 * generator, which Node and the browser both have. `Math.random` is not one:
 * its numbers can be predicted from each other, and this token is all that
 * stands between a stranger and a place on somebody's conference team.
 */
export function makeInviteToken(): string {
	const randomBytes = new Uint8Array(INVITE_TOKEN_LENGTH);

	crypto.getRandomValues(randomBytes);

	let token = '';

	for (const randomByte of randomBytes) {
		token += INVITE_TOKEN_ALPHABET[randomByte % INVITE_TOKEN_ALPHABET.length];
	}

	return token;
}

/** What an invitation to one conference's team needs. */
export type NewStaffInvite = {
	conferenceId: string;
	/** Lowercased before it is written; the table has a constraint. */
	email: string;
	/** The id of one of the conference's own roles, which accepting hands over. */
	roleId: string;
	/** The committee a chair is being invited to chair, or `null`. */
	committeeId: string | null;
	/** Free text such as "Secretary General", or `null`. */
	title: string | null;
	/** The organiser sending it. The table records who invited whom. */
	invitedBy: string;
};

/**
 * Write one. Answers its token, or `null` when the database refused.
 *
 * `expires_at` is not written, so that the column's own default stands: an
 * invitation lasts fourteen days. The database also cuts anything longer a
 * browser sends down to fourteen days (migration 20261023121000), so the
 * number is said there and not here.
 *
 * An insert is the write whose refusal comes back as an error rather than as
 * nothing changed, because there is no existing row for a policy to hide. So an
 * `error` here is "you may not invite somebody to that conference" as often as
 * it is a fault, and the page has a sentence to show for either.
 *
 * Nothing here writes a notification. The `notify_invite` trigger does that as
 * part of this same insert, for an address that already has an account.
 */
export async function createStaffInvite(
	supabase: SupabaseClient,
	invite: NewStaffInvite
): Promise<string | null> {
	const { data, error } = await supabase
		.from('invites')
		.insert({
			kind: 'conference_staff',
			conference_id: invite.conferenceId,
			// The table refuses an address that is not already lowercase
			// (`invites_email_is_lowercase`), and an organiser typed this one in.
			email: invite.email.toLowerCase(),
			role_id: invite.roleId,
			committee_id: invite.committeeId,
			title: invite.title,
			token: makeInviteToken(),
			invited_by: invite.invitedBy
		})
		// Ask for the token of the new row back, so that what is answered is what
		// was really written.
		.select('token')
		.overrideTypes<{ token: string }[], { merge: false }>();

	if (error) {
		return null;
	}

	const written: { token: string }[] = data ?? [];

	if (written.length === 0) {
		return null;
	}

	return written[0].token;
}

/**
 * One `invites` row as the organiser's team page reads it.
 *
 * A conference invitation names its role by id, and the role's name comes
 * along on the row because `invites.role_id` points at `conference_roles`,
 * which is the kind of join PostgREST can make. `null` would mean the role was
 * deleted, and deleting a role takes its invitations with it, so it is only
 * belt and braces.
 */
type PendingInviteRow = {
	id: string;
	token: string;
	email: string;
	role_id: string;
	conference_roles: { name: string } | null;
	committee_id: string | null;
	title: string | null;
	expires_at: string;
};

/** The columns both of the queries below ask for. */
const PENDING_INVITE_COLUMNS =
	'id, token, email, role_id, conference_roles(name), committee_id, title, expires_at';

/**
 * The name of the committee an invitation points at, looked up in a list the
 * caller is already holding.
 *
 * This is why `listPendingInvites` takes the committees as an argument. Asking
 * PostgREST for `committees(name)` along with the row would be a second lookup
 * for a name the team page read for its pickers a moment ago.
 */
function committeeNameOf(committeeId: string | null, committees: TeamCommittee[]): string | null {
	if (committeeId === null) {
		return null;
	}

	const committee = committees.find((one) => one.id === committeeId);

	return committee?.name ?? null;
}

/** One row under the names the page uses. */
function toPendingStaffInvite(
	row: PendingInviteRow,
	committees: TeamCommittee[]
): PendingStaffInvite {
	return {
		id: row.id,
		token: row.token,
		email: row.email,
		roleId: row.role_id,
		roleName: row.conference_roles?.name ?? '',
		committeeId: row.committee_id,
		committeeName: committeeNameOf(row.committee_id, committees),
		title: row.title,
		expiresAt: row.expires_at
	};
}

/**
 * The invitations of one conference that nobody has accepted yet, oldest first.
 *
 * An expired one is still in the list: the team page shows it as expired with
 * a "Send again" beside it, so the deadline is something the page reads rather
 * than something this query filters on.
 */
export async function listPendingInvites(
	supabase: SupabaseClient,
	conferenceId: string,
	committees: TeamCommittee[]
): Promise<PendingStaffInvite[]> {
	const { data, error } = await supabase
		.from('invites')
		.select(PENDING_INVITE_COLUMNS)
		.eq('conference_id', conferenceId)
		.eq('kind', 'conference_staff')
		// `is` is how PostgREST asks for a column holding nothing at all. `eq`
		// would compare it against the word "null" instead.
		.is('accepted_at', null)
		// Oldest first, so an invitation keeps its place in the list as the
		// organiser sends more.
		.order('created_at', { ascending: true })
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<PendingInviteRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not list the pending invitations: ${error.message}`);
	}

	const rows: PendingInviteRow[] = data ?? [];

	return rows.map((row) => toPendingStaffInvite(row, committees));
}

/**
 * The pending invitation for this address, or `null`.
 *
 * Its one caller only wants to know whether there is one, so that the invite
 * form can refuse a second invitation to the same address. That is why it takes
 * no committees and its answer always has `committeeName` null, where
 * `listPendingInvites` above fills the name in. `committeeId` still comes back,
 * because it is a column of the row rather than something looked up.
 */
export async function findPendingInvite(
	supabase: SupabaseClient,
	conferenceId: string,
	email: string
): Promise<PendingStaffInvite | null> {
	const { data, error } = await supabase
		.from('invites')
		.select(PENDING_INVITE_COLUMNS)
		.eq('conference_id', conferenceId)
		.eq('kind', 'conference_staff')
		// Addresses are stored lowercase, and an organiser typed this one in.
		.eq('email', email.toLowerCase())
		.is('accepted_at', null)
		.order('created_at', { ascending: true })
		.limit(1)
		// `maybeSingle` returns one row, or `null` when nothing matches, instead of a list.
		.maybeSingle()
		.overrideTypes<PendingInviteRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not look for a pending invitation: ${error.message}`);
	}

	if (!data) {
		return null;
	}

	return toPendingStaffInvite(data, []);
}

/**
 * Withdraw one. Answers `false` when the database refused.
 *
 * A refused delete is not an error: the `invites` delete policy hides the row
 * from anybody but the person who sent it and the conference's organisers, so
 * nothing matches, nothing is deleted and no message comes back. Asking for the
 * id of what was deleted with `.select('id')` is what tells the two apart, the
 * way `deleteCommittee` in `./manage-committees.ts` explains.
 */
export async function revokeInvite(supabase: SupabaseClient, inviteId: string): Promise<boolean> {
	const { data, error } = await supabase
		.from('invites')
		.delete()
		.eq('id', inviteId)
		.select('id')
		.overrideTypes<{ id: string }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not withdraw the invitation: ${error.message}`);
	}

	const deleted: { id: string }[] = data ?? [];

	return deleted.length > 0;
}

/**
 * Is this address already on the conference's team, either as staff or as a
 * member of the organisation running it?
 *
 * The question can only be asked by an SQL function, because turning an address
 * into an account means reading `auth.users`, which no policy grants to
 * anybody. `conference_team_has_email` answers yes or no and never hands an
 * address back, and it raises for a caller who cannot manage the conference.
 *
 * That raise is why this is the one place in this file where a failed call
 * answers `true`. The answer decides whether an invitation may be sent, and
 * refusing to send one we were not able to check is the safe direction to be
 * wrong in.
 */
export async function isEmailOnTeam(
	supabase: SupabaseClient,
	conferenceId: string,
	email: string
): Promise<boolean> {
	const { data, error } = await supabase.rpc('conference_team_has_email', {
		conference_id: conferenceId,
		email
	});

	if (error) {
		return true;
	}

	return data === true;
}

/**
 * Withdraw one chair invitation to one committee. Answers `false` when nothing
 * was withdrawn (T175).
 *
 * `revokeInvite` above takes any invitation by its id. The committee editor's
 * "Withdraw" narrows it to a pending chair invitation of the committee being
 * edited, so a form posted with somebody else's invitation id, or one accepted
 * a moment ago, withdraws nothing. A refusal by the delete policy, which takes
 * only an invitation to a role below the reader unless they sent it, also
 * answers `false`, for the reason `revokeInvite` gives.
 */
export async function withdrawCommitteeChairInvite(
	supabase: SupabaseClient,
	committeeId: string,
	inviteId: string
): Promise<boolean> {
	const { data, error } = await supabase
		.from('invites')
		.delete()
		.eq('id', inviteId)
		.eq('committee_id', committeeId)
		.eq('kind', 'conference_staff')
		.is('accepted_at', null)
		.select('id')
		.overrideTypes<{ id: string }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not withdraw the invitation: ${error.message}`);
	}

	const deleted: { id: string }[] = data ?? [];

	return deleted.length > 0;
}

/**
 * Why this address may not be invited to chair this committee, or `null` when
 * it may (T175).
 *
 * `'already_chair'`: the account already chairs the committee.
 * `'organiser'`: the account organises the conference, and accepting a chair
 * invitation would turn their organiser staff row into a chair one; they use
 * "Chair it yourself" instead.
 *
 * Like `isEmailOnTeam`, the question needs `auth.users` and so is asked of an
 * SQL function, `committee_chair_invite_refusal`, which raises for a caller
 * who cannot manage the committee. Unlike it, a failed call throws: the
 * editor's actions only get here after `requirePermission` has let the reader
 * in, so a failure is a fault and not an answer.
 */
export async function committeeChairInviteRefusal(
	supabase: SupabaseClient,
	committeeId: string,
	email: string
): Promise<'already_chair' | 'organiser' | null> {
	const { data, error } = await supabase.rpc('committee_chair_invite_refusal', {
		committee_id: committeeId,
		email
	});

	if (error) {
		throw new Error(`Could not check the address: ${error.message}`);
	}

	if (data === 'already_chair' || data === 'organiser') {
		return data;
	}

	return null;
}

/** One row of `get_invite(token)`, which returns columns of its own. */
type GetInviteRow = {
	kind: InviteKind;
	/** Open, used or expired. The identifying columns below are `null` unless it is `pending`. */
	status: InviteStatus;
	/** An `organization_role` value, or the name of the conference role the invitation offers. */
	role: string;
	/** What the conference role applies to, and what it grants. Both `null` for an organisation invitation. */
	role_scope: RoleScope | null;
	role_permissions: string[] | null;
	email: string | null;
	organization_name: string | null;
	organization_slug: string | null;
	conference_name: string | null;
	conference_slug: string | null;
	committee_name: string | null;
	invited_by_name: string | null;
	expires_at: string;
	accepted_at: string | null;
};

/**
 * What `get_invite(token)` says about one invitation, or `null` for a token
 * nobody holds.
 *
 * The function is granted to `anon` as well as to `authenticated`, because
 * `/invites/[token]` has to know whether a signed-out visitor holds an open
 * invitation before deciding to send them to create an account or to sign in.
 * It answers the address and the names only while the invitation is open, and
 * a status word otherwise (security review L18). The token is the secret that
 * stands in for a policy here, so it is never written into a message,
 * including the one below.
 *
 * It is declared `returns table (...)`, so its answer is a list of nought or
 * one row rather than a row on its own, and an empty list means there is no
 * such token.
 */
export async function getInvite(
	supabase: SupabaseClient,
	token: string
): Promise<InviteView | null> {
	const { data, error } = await supabase.rpc('get_invite', { token });

	if (error) {
		throw new Error(`Could not read the invitation: ${error.message}`);
	}

	const rows: GetInviteRow[] = data ?? [];

	if (rows.length === 0) {
		return null;
	}

	const row = rows[0];

	return {
		kind: row.kind,
		status: row.status,
		role: row.role,
		roleScope: row.role_scope,
		rolePermissions: row.role_permissions ?? [],
		email: row.email,
		organizationName: row.organization_name,
		organizationSlug: row.organization_slug,
		conferenceName: row.conference_name,
		conferenceSlug: row.conference_slug,
		committeeName: row.committee_name,
		invitedByName: row.invited_by_name,
		expiresAt: row.expires_at,
		acceptedAt: row.accepted_at
	};
}

// -----------------------------------------------------------------------------
// The invitations of one organisation
// -----------------------------------------------------------------------------
// Everything below belongs to the organisation settings page at
// `/manage/organizations/[orgSlug]`, which invites people into the organisation
// itself rather than onto one conference's team. The two halves are kept apart
// because an `invites` row is one or the other and never both: its `kind`
// column decides, and the table's own constraint refuses a row naming an
// organisation and a conference at once.

/** What an invitation into an organisation needs. */
export type NewOrganizationInvite = {
	organizationId: string;
	/** Lowercased before it is written; the table has a constraint. */
	email: string;
	/** An `organization_role`. Only `admin` and `member` are offered by the form. */
	role: OrganizationRole;
	/** The admin sending it. The table records who invited whom. */
	invitedBy: string;
};

/**
 * Write one. Answers its token, or `null` when the database refused.
 *
 * The same shape as `createStaffInvite` above and for the same reasons:
 * `expires_at` is left to the column's own default of fourteen days, and a
 * refused insert comes back as an error rather than as nothing changed, because
 * there is no existing row for a policy to hide. The `notify_invite` trigger
 * tells an address that already has an account; nothing here writes that.
 *
 * No `title` and no `committee_id` are written. Both belong to a conference's
 * team — a title is the words under somebody's name on the team list, and a
 * committee is what a chair is invited to chair — and an organisation has
 * neither.
 */
export async function createOrganizationInvite(
	supabase: SupabaseClient,
	invite: NewOrganizationInvite
): Promise<string | null> {
	const { data, error } = await supabase
		.from('invites')
		.insert({
			kind: 'organization_member',
			organization_id: invite.organizationId,
			// The table refuses an address that is not already lowercase
			// (`invites_email_is_lowercase`), and an admin typed this one in.
			email: invite.email.toLowerCase(),
			role: invite.role,
			token: makeInviteToken(),
			invited_by: invite.invitedBy
		})
		// Ask for the token of the new row back, so that what is answered is what
		// was really written.
		.select('token')
		.overrideTypes<{ token: string }[], { merge: false }>();

	if (error) {
		return null;
	}

	const written: { token: string }[] = data ?? [];

	if (written.length === 0) {
		return null;
	}

	return written[0].token;
}

/** One `invites` row as the organisation settings page reads it. */
type PendingOrganizationInviteRow = {
	id: string;
	token: string;
	email: string;
	role: OrganizationRole;
	expires_at: string;
};

/**
 * The invitations into one organisation that nobody has accepted yet, newest
 * first.
 *
 * Newest first is what `05-pages/organiser/organization-settings.md` asks for,
 * and it is the other way round from `listPendingInvites` above, which shows a
 * conference's team invitations oldest first so that one keeps its place in a
 * longer list. An organisation has a handful of members, so the one just sent
 * is the one worth seeing.
 *
 * An expired invitation is still in the list, and the page marks it as expired,
 * for the same reason the team page gives: the deadline is something the page
 * reads rather than something this query filters on.
 */
export async function listPendingOrganizationInvites(
	supabase: SupabaseClient,
	organizationId: string
): Promise<PendingOrganizationInvite[]> {
	const { data, error } = await supabase
		.from('invites')
		.select('id, token, email, role, expires_at')
		.eq('organization_id', organizationId)
		.eq('kind', 'organization_member')
		// `is` is how PostgREST asks for a column holding nothing at all. `eq`
		// would compare it against the word "null" instead.
		.is('accepted_at', null)
		.order('created_at', { ascending: false })
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<PendingOrganizationInviteRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not list the pending invitations: ${error.message}`);
	}

	const rows: PendingOrganizationInviteRow[] = data ?? [];

	return rows.map((row) => ({
		id: row.id,
		token: row.token,
		email: row.email,
		role: row.role,
		expiresAt: row.expires_at
	}));
}

/**
 * Is there already a pending invitation to this organisation for that address?
 *
 * The form refuses a second one, so that an organisation does not end up with
 * two live links for one person and no way to tell which they used.
 */
export async function findPendingOrganizationInvite(
	supabase: SupabaseClient,
	organizationId: string,
	email: string
): Promise<PendingOrganizationInvite | null> {
	const { data, error } = await supabase
		.from('invites')
		.select('id, token, email, role, expires_at')
		.eq('organization_id', organizationId)
		.eq('kind', 'organization_member')
		// Addresses are stored lowercase, and an admin typed this one in.
		.eq('email', email.toLowerCase())
		.is('accepted_at', null)
		.limit(1)
		// `maybeSingle` returns one row, or `null` when nothing matches, instead of a list.
		.maybeSingle()
		.overrideTypes<PendingOrganizationInviteRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not look for a pending invitation: ${error.message}`);
	}

	if (!data) {
		return null;
	}

	return {
		id: data.id,
		token: data.token,
		email: data.email,
		role: data.role,
		expiresAt: data.expires_at
	};
}
