/**
 * Who runs a conference and who chairs its committees: the two lists of people
 * the public pages show, and everything the organiser's team page reads and
 * writes.
 *
 * Files under `$lib/server` only ever run on the server, so this is where the
 * database is queried. Every function takes the Supabase client as its first
 * argument. Pages pass in `locals.supabase`, the client that knows who is
 * signed in, so the database's Row Level Security rules decide who each reader
 * is allowed to see.
 *
 * A conference's team is three tables (`docs/roles-and-permissions.md`):
 * `conference_staff` says who is on the team and what their title is,
 * `conference_roles` holds the conference's own roles, and
 * `conference_role_members` says who holds which. `committee_chairs` says who
 * is assigned to which committee.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommitteeChair } from '$lib/committees';
import type { Database } from '$lib/database.types';
import {
	mergeTeamRows,
	type ChairStaffMember,
	type OrganizationRole,
	type PendingChairInvite,
	type RoleScope,
	type Team,
	type TeamCommittee,
	type TeamPerson,
	type TeamRole,
	type TeamSource
} from '$lib/team';
// The organiser's team page lists the invitations nobody has accepted beside
// the people who have, so the one module reads from the other.
import { listPendingInvites } from './invites';

/** The one permission that is everything, as the database enum spells it. */
const ADMINISTRATOR: Database['public']['Enums']['permission'] = 'administrator';

/** One person on a conference's public team list. */
export type TeamMember = {
	userId: string;
	fullName: string;
	avatarPath: string | null;
	/** The name of the public role they hold, such as "Organiser" or "Chair". */
	roleName: string;
	/** Free text such as "Secretary General", or `null`. */
	title: string | null;
};

/** One row of the `profiles` lookup both lists here make. */
type ProfileRow = {
	id: string;
	full_name: string;
	avatar_path: string | null;
};

/**
 * The name and picture of each of these people, by user id.
 *
 * Both lists are two queries rather than one, because nothing in the schema
 * joins `conference_staff` or `committee_chairs` to `profiles`: both point
 * their `user_id` at `auth.users`, and PostgREST can only bring along a table
 * that a foreign key of the one being read actually names.
 *
 * An empty map is the answer to a failed lookup, which leaves the caller with
 * nobody it can name; see the rule on each of the two exports below.
 */
async function readProfiles(
	supabase: SupabaseClient,
	userIds: string[]
): Promise<Map<string, ProfileRow>> {
	const { data, error } = await supabase
		.from('profiles')
		.select('id, full_name, avatar_path')
		.in('id', userIds)
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<ProfileRow[], { merge: false }>();

	const profiles = new Map<string, ProfileRow>();

	if (error) {
		return profiles;
	}

	for (const row of data ?? []) {
		profiles.set(row.id, row);
	}

	return profiles;
}

/** One row of the `conference_staff` query: who, and what the team calls them. */
type StaffRow = {
	user_id: string;
	title: string | null;
};

/** One `conference_roles` row, under the database's own names. */
type RoleRow = {
	id: string;
	name: string;
	position: number;
	scope: TeamRole['scope'];
	permissions: string[];
	is_public: boolean;
};

/** A role row under the names the page uses. */
function toTeamRole(row: RoleRow): TeamRole {
	return {
		id: row.id,
		name: row.name,
		position: row.position,
		scope: row.scope,
		isPublic: row.is_public,
		isAdministrator: row.permissions.includes(ADMINISTRATOR)
	};
}

/** The columns every role lookup here asks for. */
const ROLE_COLUMNS = 'id, name, position, scope, permissions, is_public';

/**
 * The staff titles of these people, by user id.
 *
 * The public team list reads its people from `conference_role_members`, which
 * carries no title, so the title comes from the staff row in a lookup of its
 * own. A failed lookup answers no titles rather than no people: a name with
 * no title under it is still worth showing, where a title with no name is not.
 */
async function readStaffTitles(
	supabase: SupabaseClient,
	conferenceId: string,
	userIds: string[]
): Promise<Map<string, string | null>> {
	const titles = new Map<string, string | null>();

	if (userIds.length === 0) {
		return titles;
	}

	const { data, error } = await supabase
		.from('conference_staff')
		.select('user_id, title')
		.eq('conference_id', conferenceId)
		.in('user_id', userIds)
		.overrideTypes<StaffRow[], { merge: false }>();

	if (error) {
		return titles;
	}

	for (const row of data ?? []) {
		titles.set(row.user_id, row.title);
	}

	return titles;
}

/**
 * One row of the public team query: who holds a public role, and which. The
 * role comes along on the row because `conference_role_members.role_id`
 * points at `conference_roles`, which is the kind of join PostgREST can make.
 */
type PublicMemberRow = {
	user_id: string;
	conference_roles: { name: string; position: number; is_public: boolean } | null;
};

/** One member of a public role, before their name has been looked up. */
type PublicMember = {
	userId: string;
	roleName: string;
	rolePosition: number;
};

/**
 * The holders of the conference's public roles, each person once, under the
 * highest of their public roles. The rows arrive one per role held, so
 * somebody who is both an Organiser and a Chair arrives twice and keeps the
 * row whose role comes first in the conference's order.
 */
function toPublicMembers(rows: PublicMemberRow[]): PublicMember[] {
	const byUser = new Map<string, PublicMember>();

	for (const row of rows) {
		if (row.conference_roles === null) {
			continue;
		}

		const listed = byUser.get(row.user_id);

		if (listed !== undefined && listed.rolePosition <= row.conference_roles.position) {
			continue;
		}

		byUser.set(row.user_id, {
			userId: row.user_id,
			roleName: row.conference_roles.name,
			rolePosition: row.conference_roles.position
		});
	}

	return [...byUser.values()];
}

/**
 * The organisers and chairs of one conference, for the "meet the team" list:
 * everybody holding a role the conference marks as public, in the roles'
 * order and then by name. The presets mark Organiser and Chair public and
 * Volunteer not, which is who the list has always shown.
 *
 * Empty for anybody the `conference_role_members` select policy does not let
 * read the team. A list nobody may read and a list that is empty look the
 * same to the page on purpose, so a failed query answers `[]` rather than
 * throwing.
 */
export async function listPublicTeam(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<TeamMember[]> {
	const { data, error } = await supabase
		.from('conference_role_members')
		// `!inner` keeps only the memberships whose role passes the filter on the
		// next line, rather than every membership with its role left empty.
		.select('user_id, conference_roles!inner(name, position, is_public)')
		.eq('conference_id', conferenceId)
		.eq('conference_roles.is_public', true)
		.overrideTypes<PublicMemberRow[], { merge: false }>();

	if (error || !data || data.length === 0) {
		return [];
	}

	const publicMembers = toPublicMembers(data);
	const userIds = publicMembers.map((member) => member.userId);
	const [profiles, titles] = await Promise.all([
		readProfiles(supabase, userIds),
		readStaffTitles(supabase, conferenceId, userIds)
	]);
	const members: (TeamMember & { rolePosition: number })[] = [];

	for (const member of publicMembers) {
		const profile = profiles.get(member.userId);

		// Somebody whose profile did not come back would be a row with no name in
		// it, so they are left off the list instead.
		if (!profile) {
			continue;
		}

		members.push({
			userId: member.userId,
			fullName: profile.full_name,
			avatarPath: profile.avatar_path,
			roleName: member.roleName,
			title: titles.get(member.userId) ?? null,
			rolePosition: member.rolePosition
		});
	}

	// The conference's own order of roles first, then by name within a role.
	members.sort((one, other) => {
		if (one.rolePosition !== other.rolePosition) {
			return one.rolePosition - other.rolePosition;
		}

		return one.fullName.localeCompare(other.fullName);
	});

	// The position was only there to sort by; the page gets the five fields it draws.
	return members.map((member) => ({
		userId: member.userId,
		fullName: member.fullName,
		avatarPath: member.avatarPath,
		roleName: member.roleName,
		title: member.title
	}));
}

/** One row of the `committee_chairs` query. */
type ChairRow = {
	user_id: string;
	title: string;
};

/**
 * The chairs of one committee, with their names, sorted by name.
 *
 * `committee_chairs` may be read by anybody who can see the committee, but
 * `profiles` may only be read by somebody signed in, so a signed-out visitor
 * gets an empty list rather than a row with no name in it.
 *
 * As above, a failed query answers `[]`: the page hides the section either way.
 */
export async function listCommitteeChairs(
	supabase: SupabaseClient,
	committeeId: string
): Promise<CommitteeChair[]> {
	const { data, error } = await supabase
		.from('committee_chairs')
		.select('user_id, title')
		.eq('committee_id', committeeId)
		.overrideTypes<ChairRow[], { merge: false }>();

	if (error || !data || data.length === 0) {
		return [];
	}

	const userIds = data.map((row) => row.user_id);
	const profiles = await readProfiles(supabase, userIds);
	const chairs: CommitteeChair[] = [];

	for (const row of data) {
		const profile = profiles.get(row.user_id);

		if (!profile) {
			continue;
		}

		chairs.push({
			userId: row.user_id,
			fullName: profile.full_name,
			avatarPath: profile.avatar_path,
			title: row.title
		});
	}

	chairs.sort((one, other) => one.fullName.localeCompare(other.fullName));

	return chairs;
}

/** One row of the batched chair query: which committee, and who chairs it. */
type ChairNameRow = {
	committee_id: string;
	user_id: string;
};

/**
 * The chairs' names for several committees at once, by committee id.
 *
 * It exists because the organiser's committees list asks the same question of
 * every committee on the page. `listCommitteeChairs` above answers for one
 * committee and costs two queries each time it is asked, which is sixteen for a
 * conference with eight committees where this is two.
 *
 * It answers names and nothing else, because that is all a committee row shows.
 * Anything that wants a chair's title or picture wants `listCommitteeChairs`,
 * which is still what the public committee page reads.
 *
 * Each committee's names are sorted the way `listCommitteeChairs` sorts its
 * chairs, so the two can never put the same people in a different order. A
 * committee with no chairs, and one whose chairs have no profile row to be
 * named from, are both simply missing from the map.
 */
export async function listChairNamesByCommittee(
	supabase: SupabaseClient,
	committeeIds: string[]
): Promise<Map<string, string[]>> {
	const namesByCommittee = new Map<string, string[]>();

	// Nobody to ask about, and `.in('committee_id', [])` would be a request that
	// cannot match anything.
	if (committeeIds.length === 0) {
		return namesByCommittee;
	}

	const { data, error } = await supabase
		.from('committee_chairs')
		.select('committee_id, user_id')
		.in('committee_id', committeeIds)
		.overrideTypes<ChairNameRow[], { merge: false }>();

	// As above, a list nobody may read and a list that is empty look the same to
	// the page on purpose, so a failed query answers with no names either.
	if (error || !data || data.length === 0) {
		return namesByCommittee;
	}

	const userIds = data.map((row) => row.user_id);
	const profiles = await readProfiles(supabase, userIds);

	for (const row of data) {
		const profile = profiles.get(row.user_id);

		// Somebody whose profile did not come back would be a chair with no name,
		// so they are left off here the way they are left off the list above.
		if (!profile) {
			continue;
		}

		const names = namesByCommittee.get(row.committee_id) ?? [];

		names.push(profile.full_name);
		namesByCommittee.set(row.committee_id, names);
	}

	for (const names of namesByCommittee.values()) {
		names.sort((one, other) => one.localeCompare(other));
	}

	return namesByCommittee;
}

// -----------------------------------------------------------------------------
// The organiser's team page
// -----------------------------------------------------------------------------
// Everything in this section belongs to `/manage/[slug]/team`, where an organiser sees
// the whole team at once and changes it, rather than to the public pages above.
// Every query here runs as the signed-in organiser, so the policies that
// `docs/roles-and-permissions.md` describes decide what comes back and what may
// be written.

/** One row of `list_conference_owners`: an owner or admin of the organisation. */
type OrganizationMemberRow = {
	user_id: string;
	organization_role: OrganizationRole;
};

/**
 * The owners and admins of the organisation running this conference, who are
 * its administrators (`docs/roles-and-permissions.md`, rule 4) and head the
 * team page.
 *
 * They come from `list_conference_owners` rather than from
 * `organization_members`, because only the organisation's own members may read
 * that table, and somebody who manages this team from a conference role is
 * often not one. The function answers the team and nobody else, and leaves
 * out plain members of the organisation, who are not administrators. A failure
 * answers `[]`, so the page still shows the conference's own staff.
 */
async function readConferenceOwners(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<OrganizationMemberRow[]> {
	const { data, error } = await supabase.rpc('list_conference_owners', {
		conference_id: conferenceId
	});

	if (error) {
		return [];
	}

	return data ?? [];
}

/**
 * Every staff row of one conference, whatever roles they hold.
 *
 * The page this feeds is only ever opened by somebody who can manage the
 * conference, and they may read the whole team, so a failure here is a fault
 * rather than a rule turning a reader away.
 */
async function readConferenceStaff(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<StaffRow[]> {
	const { data, error } = await supabase
		.from('conference_staff')
		.select('user_id, title')
		.eq('conference_id', conferenceId)
		.overrideTypes<StaffRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the team: ${error.message}`);
	}

	return data ?? [];
}

/**
 * The conference's roles, in the organiser's own order: the tabs above the
 * team list and the choices in every role picker on it.
 *
 * As above, a failure is a fault: the team may read its conference's roles.
 */
async function readRoles(supabase: SupabaseClient, conferenceId: string): Promise<TeamRole[]> {
	const { data, error } = await supabase
		.from('conference_roles')
		.select(ROLE_COLUMNS)
		.eq('conference_id', conferenceId)
		// `position` is the order the organiser put the roles in. Two are allowed
		// to share one, so the name decides between them and the list comes out
		// the same way round on every refresh.
		.order('position', { ascending: true })
		.order('name', { ascending: true })
		.overrideTypes<RoleRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the roles: ${error.message}`);
	}

	return (data ?? []).map(toTeamRole);
}

/** One `conference_role_members` row: who holds which role. */
type RoleMemberRow = {
	user_id: string;
	role_id: string;
};

/** Every role membership of one conference. As above, a failure is a fault. */
async function readRoleMembers(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<RoleMemberRow[]> {
	const { data, error } = await supabase
		.from('conference_role_members')
		.select('user_id, role_id')
		.eq('conference_id', conferenceId)
		.overrideTypes<RoleMemberRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read who holds which role: ${error.message}`);
	}

	return data ?? [];
}

/**
 * The roles each person holds, by user id, in the conference's own order.
 *
 * The roles are walked rather than the rows so that everybody's list comes out
 * in that order. The rows themselves arrive in whatever order the database
 * found them, which is no order at all.
 */
function groupRolesByHolder(
	roles: TeamRole[],
	memberRows: RoleMemberRow[]
): Map<string, TeamRole[]> {
	const rolesByHolder = new Map<string, TeamRole[]>();

	for (const role of roles) {
		for (const row of memberRows) {
			if (row.role_id !== role.id) {
				continue;
			}

			const held = rolesByHolder.get(row.user_id) ?? [];

			held.push(role);
			rolesByHolder.set(row.user_id, held);
		}
	}

	return rolesByHolder;
}

/**
 * The conference's committees for the two pickers on the team page, in the
 * organiser's own order.
 *
 * They are also what the page names a chair's committees and an invitation's
 * committee from, which is why the list is part of what `loadTeam` answers.
 */
async function readTeamCommittees(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<TeamCommittee[]> {
	const { data, error } = await supabase
		.from('committees')
		.select('id, name, abbreviation')
		.eq('conference_id', conferenceId)
		// `position` is the order the organiser put the committees in. Two are
		// allowed to share one, so the name decides between them and the picker
		// comes out the same way round on every refresh.
		.order('position', { ascending: true })
		.order('name', { ascending: true })
		.overrideTypes<TeamCommittee[], { merge: false }>();

	if (error) {
		throw new Error(`Could not list the committees: ${error.message}`);
	}

	return data ?? [];
}

/**
 * The `committee_chairs` rows of these committees: which committee, and who
 * chairs it.
 *
 * `listChairNamesByCommittee` above asks the same table for the same rows and
 * answers with names, which is what a committee row on the committees page
 * shows. This page needs the pair of ids instead, because it draws each
 * person's committees beside their own name, so it is a small query of its own
 * rather than a change to the exported one that page reads.
 */
async function readChairRows(
	supabase: SupabaseClient,
	committeeIds: string[]
): Promise<ChairNameRow[]> {
	// A conference with no committees yet has nobody chairing one, and
	// `.in('committee_id', [])` would be a request that cannot match anything.
	if (committeeIds.length === 0) {
		return [];
	}

	const { data, error } = await supabase
		.from('committee_chairs')
		.select('committee_id, user_id')
		.in('committee_id', committeeIds)
		.overrideTypes<ChairNameRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the chairs: ${error.message}`);
	}

	return data ?? [];
}

/**
 * The committees each person chairs, by user id.
 *
 * The committees are walked rather than the rows so that everybody's list comes
 * out in the organiser's own order. The rows themselves arrive in whatever
 * order the database found them, which is no order at all.
 */
function groupCommitteesByChair(
	committees: TeamCommittee[],
	chairRows: ChairNameRow[]
): Map<string, TeamCommittee[]> {
	const committeesByChair = new Map<string, TeamCommittee[]>();

	for (const committee of committees) {
		for (const row of chairRows) {
			if (row.committee_id !== committee.id) {
				continue;
			}

			const chaired = committeesByChair.get(row.user_id) ?? [];

			chaired.push(committee);
			committeesByChair.set(row.user_id, chaired);
		}
	}

	return committeesByChair;
}

/**
 * One person before their name has been looked up.
 *
 * The two halves of the list differ only in these values, so they are
 * gathered first and then named together in `toTeamPeople` below.
 */
type TeamPersonRow = {
	userId: string;
	source: TeamSource;
	/** What they are in the organisation, for an organisation member; `null` for staff. */
	organizationRole: OrganizationRole | null;
	title: string | null;
};

/** What `toTeamPeople` needs besides the rows: the lookups both halves share. */
type TeamLookups = {
	profiles: Map<string, ProfileRow>;
	committeesByChair: Map<string, TeamCommittee[]>;
	rolesByHolder: Map<string, TeamRole[]>;
};

/** Half of the team list, named from the profiles and sorted by name. */
function toTeamPeople(rows: TeamPersonRow[], lookups: TeamLookups): TeamPerson[] {
	const people: TeamPerson[] = [];

	for (const row of rows) {
		const profile = lookups.profiles.get(row.userId);

		// Somebody whose profile did not come back would be a row with no name in
		// it, so they are left off here the way `listPublicTeam` leaves them off.
		if (!profile) {
			continue;
		}

		people.push({
			userId: row.userId,
			fullName: profile.full_name,
			avatarPath: profile.avatar_path,
			source: row.source,
			// An organisation member's row shows no conference roles even when a
			// staff row of theirs holds some: they run the conference through the
			// organisation, and that is what their row says.
			roles: row.source === 'staff' ? (lookups.rolesByHolder.get(row.userId) ?? []) : [],
			organizationRole: row.organizationRole,
			title: row.title,
			// Both halves are looked up, because an organisation member can be given
			// a committee to chair just as a member of staff can. See the
			// `assignCommittee` action in `routes/manage/[slug]/team/+page.server.ts`.
			committees: lookups.committeesByChair.get(row.userId) ?? []
		});
	}

	people.sort((one, other) => one.fullName.localeCompare(other.fullName));

	return people;
}

/**
 * The organisation's owners and admins.
 *
 * Somebody who also has a staff row is kept here and left out of the staff
 * half by `mergeTeamRows` in `$lib/team.ts`, so each person shows once, in
 * their organisation row. That staff row's title is carried over, because an
 * owner who is also the Secretary-General is still called that on the team.
 */
function toOrganizationRows(
	memberRows: OrganizationMemberRow[],
	staffRows: StaffRow[]
): TeamPersonRow[] {
	return memberRows.map((member) => {
		const staffRow = staffRows.find((row) => row.user_id === member.user_id);

		return {
			userId: member.user_id,
			source: 'organization',
			organizationRole: member.organization_role,
			title: staffRow?.title ?? null
		};
	});
}

/** The conference's own staff, the half of the list this page can change. */
function toStaffRows(staffRows: StaffRow[]): TeamPersonRow[] {
	return staffRows.map((row) => ({
		userId: row.user_id,
		source: 'staff',
		organizationRole: null,
		title: row.title
	}));
}

/**
 * Everything the team page shows, in one object: the members of the
 * organisation running the conference, the conference's own staff with the
 * roles each holds and the committees each chairs, the invitations nobody has
 * accepted, the committees for the two pickers, and the roles for the tabs
 * and the role pickers.
 *
 * Eight queries in two rounds. Nothing in the first round needs anything from
 * the others, so all five start at once; each of the second round needs
 * something the first found, and then again none of them needs another's
 * answer.
 */
export async function loadTeam(supabase: SupabaseClient, conferenceId: string): Promise<Team> {
	const [memberRows, staffRows, committees, roles, roleMemberRows] = await Promise.all([
		readConferenceOwners(supabase, conferenceId),
		readConferenceStaff(supabase, conferenceId),
		readTeamCommittees(supabase, conferenceId),
		readRoles(supabase, conferenceId),
		readRoleMembers(supabase, conferenceId)
	]);

	const userIds = [...memberRows, ...staffRows].map((row) => row.user_id);
	const committeeIds = committees.map((committee) => committee.id);

	// The names need the user ids, and both the chair rows and the invitations
	// need the committees. There is always at least one name to look up, because
	// whoever is reading this page is either a member of the organisation or on
	// the conference's staff and so is on one of the two lists themselves.
	const [profiles, chairRows, pendingInvites] = await Promise.all([
		readProfiles(supabase, userIds),
		readChairRows(supabase, committeeIds),
		listPendingInvites(supabase, conferenceId, committees)
	]);

	const lookups: TeamLookups = {
		profiles,
		committeesByChair: groupCommitteesByChair(committees, chairRows),
		rolesByHolder: groupRolesByHolder(roles, roleMemberRows)
	};
	const organizationPeople = toTeamPeople(toOrganizationRows(memberRows, staffRows), lookups);
	const staffPeople = toTeamPeople(toStaffRows(staffRows), lookups);

	return {
		// The organisation first, then the conference's own staff, each sorted by
		// name: the people who run every conference above the people brought in for
		// this one. Somebody on both lists is kept in the first.
		people: mergeTeamRows(organizationPeople, staffPeople),
		pendingInvites,
		committees,
		roles
	};
}

/**
 * Give somebody exactly these roles on the conference: "Save roles" in the
 * team page's "Edit roles" dialog. Answers `false` when the database refused,
 * which it does as a whole: `set_member_roles` takes the roles off and puts
 * the others on in one transaction, and refuses with `42501` ("insufficient
 * privilege") when any of them is at or above the reader's own role, or the
 * person is the reader. Nothing is changed then.
 */
export async function setMemberRoles(
	supabase: SupabaseClient,
	conferenceId: string,
	userId: string,
	roleIds: string[]
): Promise<boolean> {
	const { error } = await supabase.rpc('set_member_roles', {
		conference_id: conferenceId,
		user_id: userId,
		role_ids: roleIds
	});

	if (error?.code === '42501') {
		return false;
	}

	if (error) {
		throw new Error(`Could not save the roles: ${error.message}`);
	}

	return true;
}

/**
 * Change the free-text title on a staff row. `null` clears it.
 *
 * A refused update is not an error. The `conference_staff` update policy hides
 * the row from anybody who cannot manage the team, and from somebody trying to
 * change their own row, so nothing matches, nothing changes and no message
 * comes back. Asking for the row that was changed with `.select(...)` is what
 * tells that apart from an update that worked, which is the same trick
 * `deleteCommittee` in `./manage-committees.ts` explains.
 */
export async function updateStaffTitle(
	supabase: SupabaseClient,
	conferenceId: string,
	userId: string,
	title: string | null
): Promise<boolean> {
	const { data, error } = await supabase
		.from('conference_staff')
		.update({ title })
		.eq('conference_id', conferenceId)
		.eq('user_id', userId)
		.select('user_id')
		.overrideTypes<{ user_id: string }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not save the title: ${error.message}`);
	}

	const changed: { user_id: string }[] = data ?? [];

	return changed.length > 0;
}

/**
 * Take somebody off the team. Their roles go with them, because
 * `conference_role_members` points at the staff row `on delete cascade`, and
 * so do their `committee_chairs` rows on this conference's committees, which
 * the trigger `conference_staff_takes_chairs_along` deletes.
 *
 * As above, `false` means the policy refused: `conference_staff` may be deleted
 * by a team manager ranked above the person and by the person themselves, and
 * by nobody else.
 */
export async function removeStaff(
	supabase: SupabaseClient,
	conferenceId: string,
	userId: string
): Promise<boolean> {
	const { data, error } = await supabase
		.from('conference_staff')
		.delete()
		.eq('conference_id', conferenceId)
		.eq('user_id', userId)
		.select('user_id')
		.overrideTypes<{ user_id: string }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not remove them from the team: ${error.message}`);
	}

	const deleted: { user_id: string }[] = data ?? [];

	return deleted.length > 0;
}

/**
 * What became of `addCommitteeChair`: the row was written, the person already
 * chairs the committee, or the database refused them, because the reader does
 * not rank above them (security review L5) or they are not on the team.
 */
export type ChairAssignment = 'added' | 'already-chairs' | 'refused';

/**
 * Make somebody a chair of one committee.
 *
 * An insert is the one write whose refusal comes back as an error rather than
 * as nothing changed, because there is no existing row for a policy to hide.
 * The two refusals a page can explain are told apart by their codes: `23505`
 * is the primary key refusing a second row for somebody who already chairs
 * the committee, and `42501` ("insufficient privilege") is the insert policy
 * or the `protect_committee_chairs_team` trigger. Neither is worth an error
 * page, so each page says so in a sentence. Anything else is a fault, and
 * raises, the way `removeCommitteeChair` below does.
 *
 * `title` is what this person is called on this one committee, "Vice Chair" or
 * "Rapporteur", and the committee editor's chair picker asks for it. A caller
 * that gives none leaves the column out of the row altogether rather than
 * writing "Chair" here, so that the column's own default is the single place
 * that word is written down. The team page's committee picker is such a
 * caller.
 */
export async function addCommitteeChair(
	supabase: SupabaseClient,
	committeeId: string,
	userId: string,
	title?: string
): Promise<ChairAssignment> {
	// The row is built first so that `title` can be missing from it rather than
	// present and holding nothing: the column's default is only written when the
	// insert does not name the column at all.
	const row: { committee_id: string; user_id: string; title?: string } = {
		committee_id: committeeId,
		user_id: userId
	};

	if (title !== undefined) {
		row.title = title;
	}

	const { data, error } = await supabase
		.from('committee_chairs')
		.insert(row)
		.select('committee_id')
		.overrideTypes<{ committee_id: string }[], { merge: false }>();

	if (error?.code === '23505') {
		return 'already-chairs';
	}

	if (error?.code === '42501') {
		return 'refused';
	}

	if (error) {
		throw new Error(`Could not add them to the committee: ${error.message}`);
	}

	const added: { committee_id: string }[] = data ?? [];

	return added.length > 0 ? 'added' : 'refused';
}

/** Take one chair off one committee. `false` means the database refused. */
export async function removeCommitteeChair(
	supabase: SupabaseClient,
	committeeId: string,
	userId: string
): Promise<boolean> {
	const { data, error } = await supabase
		.from('committee_chairs')
		.delete()
		.eq('committee_id', committeeId)
		.eq('user_id', userId)
		.select('committee_id')
		.overrideTypes<{ committee_id: string }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not remove them from the committee: ${error.message}`);
	}

	const deleted: { committee_id: string }[] = data ?? [];

	return deleted.length > 0;
}

// -----------------------------------------------------------------------------
// The organiser's committee editor
// -----------------------------------------------------------------------------
// `/manage/[slug]/committees/[committeeId]` has a Chairs panel of its own. It
// writes its rows with `addCommitteeChair` and `removeCommitteeChair` above,
// and reads the people it is allowed to offer with the queries below.

/** One row of the chair staff query: one role somebody holds, and where it sits. */
type CommitteeRoleMemberRow = {
	user_id: string;
	conference_roles: { scope: RoleScope; position: number };
};

/** One role somebody holds, for `readTeamRanks`: who, and where the role sits. */
type RankRow = {
	user_id: string;
	conference_roles: { position: number };
};

/**
 * How everybody on this conference's team ranks, by user id: `-1` for an
 * owner or admin of the organisation, otherwise the position of their highest
 * role. Somebody missing from the map holds no role and ranks below everybody.
 * The committee editor asks it about the people chairing a committee, whom
 * `mayRemoveChair` in `$lib/team-access.ts` then judges.
 *
 * It follows `user_rank` except for a platform admin, whom `user_rank` ranks
 * `-1` too: a browser cannot ask who is one, so the database's own refusal is
 * what covers them.
 */
export async function readTeamRanks(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<Map<string, number>> {
	const [{ data, error }, owners] = await Promise.all([
		supabase
			.from('conference_role_members')
			.select('user_id, conference_roles!inner(position)')
			.eq('conference_id', conferenceId)
			.overrideTypes<RankRow[], { merge: false }>(),
		readConferenceOwners(supabase, conferenceId)
	]);

	if (error) {
		throw new Error(`Could not read the conference team's ranks: ${error.message}`);
	}

	const ranks = new Map<string, number>();

	for (const row of data ?? []) {
		const position = row.conference_roles.position;
		const known = ranks.get(row.user_id);

		ranks.set(row.user_id, known === undefined ? position : Math.min(known, position));
	}

	for (const owner of owners) {
		ranks.set(owner.user_id, -1);
	}

	return ranks;
}

/**
 * Everybody on this conference's team holding a role that applies per
 * committee, the way the Chair preset does, with their names, staff titles
 * and ranks, sorted by name: the people a committee's chair picker may choose
 * from, before `mayAssignChair` in `$lib/team-access.ts` leaves out the ones
 * ranked too high for the reader.
 *
 * Every role is read, not only the per-committee ones, because a rank is the
 * person's highest role of any kind. An owner or admin of the organisation
 * ranks `-1` whatever roles they hold, as `user_rank` has it, and
 * `list_conference_owners` is what says who they are. `user_rank` ranks a
 * platform admin `-1` too, which a browser cannot see, so one holding a chair
 * role is ranked here by their roles and the database's refusal covers them.
 *
 * Somebody whose `profiles` row did not come back is left out, the way
 * `listCommitteeChairs` and `listChairNamesByCommittee` above leave them out: a
 * choice with no name on it is worse than one choice fewer.
 *
 * A failed query throws rather than answering `[]`, the way `readConferenceStaff`
 * does and for the same reason: only somebody who can manage the conference ever
 * opens the committee editor, and they may read the whole team, so a refusal
 * here is a fault rather than a rule turning a reader away.
 */
export async function listChairStaff(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<ChairStaffMember[]> {
	const [{ data, error }, owners] = await Promise.all([
		supabase
			.from('conference_role_members')
			// `!inner` keeps only the memberships whose role row came back, so every
			// row below has its scope and position.
			.select('user_id, conference_roles!inner(scope, position)')
			.eq('conference_id', conferenceId)
			// Replaces Supabase's guess at the row's shape with ours. It has to come last.
			.overrideTypes<CommitteeRoleMemberRow[], { merge: false }>(),
		readConferenceOwners(supabase, conferenceId)
	]);

	if (error) {
		throw new Error(`Could not read the conference's chairs: ${error.message}`);
	}

	const rows: CommitteeRoleMemberRow[] = data ?? [];
	const ownerIds = new Set(owners.map((owner) => owner.user_id));
	const ranks = new Map<string, number>();

	for (const row of rows) {
		const position = row.conference_roles.position;
		const known = ranks.get(row.user_id);

		ranks.set(row.user_id, known === undefined ? position : Math.min(known, position));
	}

	// Only somebody with a per-committee role is offered; the volunteers and the
	// organisers are no use to a chair picker. Somebody holding two such roles
	// arrives twice, and a `Set` keeps one.
	const userIds = [
		...new Set(
			rows.filter((row) => row.conference_roles.scope === 'committees').map((row) => row.user_id)
		)
	];

	// Nobody to name, and `.in('id', [])` would be a request that cannot match
	// anything.
	if (userIds.length === 0) {
		return [];
	}

	const [profiles, titles] = await Promise.all([
		readProfiles(supabase, userIds),
		readStaffTitles(supabase, conferenceId, userIds)
	]);
	const chairStaff: ChairStaffMember[] = [];

	for (const userId of userIds) {
		const profile = profiles.get(userId);

		if (!profile) {
			continue;
		}

		chairStaff.push({
			userId,
			fullName: profile.full_name,
			title: titles.get(userId) ?? null,
			rank: ownerIds.has(userId) ? -1 : (ranks.get(userId) ?? null)
		});
	}

	chairStaff.sort((one, other) => one.fullName.localeCompare(other.fullName));

	return chairStaff;
}

/**
 * The role a chair invitation from the committee editor hands over: the
 * conference's first role, in its own order, that works per committee, which
 * is the Chair preset unless the conference has rearranged its roles. `null`
 * when the conference has no such role left, and the editor says so.
 *
 * A failed query throws, for the reason `listChairStaff` gives.
 */
export async function findChairRole(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<TeamRole | null> {
	const { data, error } = await supabase
		.from('conference_roles')
		.select(ROLE_COLUMNS)
		.eq('conference_id', conferenceId)
		.eq('scope', 'committees')
		.order('position', { ascending: true })
		.order('name', { ascending: true })
		.limit(1)
		.overrideTypes<RoleRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not find the chair role: ${error.message}`);
	}

	const rows: RoleRow[] = data ?? [];

	return rows.length > 0 ? toTeamRole(rows[0]) : null;
}

/** One row of the pending chair invitations query. */
type PendingChairInviteRow = {
	id: string;
	token: string;
	email: string;
	expires_at: string;
};

/**
 * The chair invitations to one committee that nobody has accepted yet, oldest
 * first: the committee editor's "Waiting to accept" list (T175).
 *
 * The same rows `listPendingInvites` in `./invites.ts` reads for the whole
 * conference on the team page, narrowed to this committee. An expired one is
 * still listed, as it is there, because it is still a row somebody may withdraw.
 */
export async function listPendingCommitteeChairInvites(
	supabase: SupabaseClient,
	committeeId: string
): Promise<PendingChairInvite[]> {
	const { data, error } = await supabase
		.from('invites')
		.select('id, token, email, expires_at')
		.eq('committee_id', committeeId)
		.eq('kind', 'conference_staff')
		// `is` is how PostgREST asks for a column holding nothing at all.
		.is('accepted_at', null)
		.order('created_at', { ascending: true })
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<PendingChairInviteRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not list the chair invitations: ${error.message}`);
	}

	const rows: PendingChairInviteRow[] = data ?? [];

	return rows.map((row) => ({
		id: row.id,
		token: row.token,
		email: row.email,
		expiresAt: row.expires_at
	}));
}
