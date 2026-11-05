/**
 * The shapes the conference's team page is drawn from, the plain calculations
 * it does on top of them, and the checks the invite form has to pass.
 *
 * `05-pages/organiser/team.md` describes `/manage/[slug]/team`: everybody who
 * works on one conference, the invitations nobody has accepted yet, and the
 * form that sends a new one. Fetching all of that is `$lib/server/team.ts`'s
 * job. This file only holds the types those queries fill in and the wording the
 * page works out for itself, so both can be read and tested without knowing any
 * Svelte, and so that the components have the shapes at all: a component may
 * not import from `$lib/server`, not even a type.
 *
 * A conference's team roles are its own rows in `conference_roles`
 * (`docs/roles-and-permissions.md`): every conference starts with Organiser,
 * Chair and Volunteer, and a person on the team holds one or more of them. So
 * a role is never a fixed word here; it is a `TeamRole` the page was handed.
 *
 * `$lib/manage.ts` also has invitation wording, and it is the other side of the
 * same story: there an invitation is one waiting for the *reader*, on `/manage`,
 * and the sentence is addressed to them ("You were invited to …"). Here an
 * invitation is one an organiser has *sent* and nobody has accepted yet, so it
 * is named by the address it went to and by when it runs out. Neither file
 * imports the other.
 *
 * Nothing here talks to Supabase or imports from `$lib/server`.
 */

import { validateEmail } from '$lib/auth';
import type { Database } from '$lib/database.types';
import type { BadgeTone } from '$lib/status';

/** A role in an organisation: `owner`, `admin` or `member`. */
export type OrganizationRole = Database['public']['Enums']['organization_role'];

/**
 * Whether a role's permissions apply to the whole conference or only in the
 * committees each member is assigned to. The Chair preset is `committees`.
 */
export type RoleScope = Database['public']['Enums']['role_scope'];

/** One of a conference's own roles, as the team page lists and offers them. */
export type TeamRole = {
	id: string;
	/** "Organiser", "Chair", "USG delegate affairs". */
	name: string;
	/** The conference's own order, lowest first. It is also the rank the database's rules read. */
	position: number;
	scope: RoleScope;
	/** Whether the conference shows this role's holders on its public team page. */
	isPublic: boolean;
	/** Whether the role holds the `administrator` permission, which is everything. */
	isAdministrator: boolean;
};

/** One committee a chair has been given, as the team list names it. */
export type TeamCommittee = {
	id: string;
	name: string;
	/** "UNSC", or nothing when the committee has no short name. */
	abbreviation: string | null;
};

/** Where somebody's place on the team comes from. */
export type TeamSource = 'organization' | 'staff';

/** One row of the team list. */
export type TeamPerson = {
	userId: string;
	fullName: string;
	avatarPath: string | null;
	source: TeamSource;
	/** The roles a staff member holds, in the conference's order. Empty for an organisation member. */
	roles: TeamRole[];
	/** `owner`, `admin` or `member` for an organisation member; `null` for staff. */
	organizationRole: OrganizationRole | null;
	/** Free text such as "Secretary General". An organisation member has none here. */
	title: string | null;
	/** The committees this person chairs, in the conference's own order. */
	committees: TeamCommittee[];
};

/** One invitation nobody has accepted yet. */
export type PendingStaffInvite = {
	id: string;
	/** The 32-character secret in the link. */
	token: string;
	email: string;
	/** The role the invitation hands over, and its name for the line the list shows. */
	roleId: string;
	roleName: string;
	/**
	 * The committee a chair invitation hands over, or `null`. The id is what
	 * "Send again" writes onto the fresh invitation: two committees of one
	 * conference may share a name, because only `(conference_id, slug)` is
	 * unique, so the name alone could point at the wrong one.
	 */
	committeeId: string | null;
	/** That committee's name, for the line the pending list shows. `null` when it has none. */
	committeeName: string | null;
	title: string | null;
	/** An ISO timestamp. */
	expiresAt: string;
};

/**
 * One chair invitation to one committee that nobody has accepted yet, as the
 * committee editor's "Waiting to accept" list draws it (T175). The token is
 * there because "Copy link" copies the invitation's own address.
 */
export type PendingChairInvite = {
	id: string;
	token: string;
	email: string;
	/** An ISO timestamp. */
	expiresAt: string;
};

/** Everything `/manage/[slug]/team` is drawn from. */
export type Team = {
	people: TeamPerson[];
	pendingInvites: PendingStaffInvite[];
	/** Every committee of the conference, for the two pickers. */
	committees: TeamCommittee[];
	/** Every role of the conference, in its order, for the tabs and the role pickers. */
	roles: TeamRole[];
};

/**
 * Which tab of the team list is open: `all`, or the id of one of the
 * conference's roles.
 */
export type TeamFilter = string;

/** The tab that hides nothing, which is also the default. */
export const ALL_TEAM_FILTER: TeamFilter = 'all';

/**
 * Reads `?role=` back off the address. Anything that is not one of this
 * conference's roles is `all`.
 *
 * The tabs are links rather than buttons, so which one is open lives in the URL
 * and the back button works. Whatever is in the address is only text somebody
 * could have typed there, so an id that is not one of the roles falls back to
 * the tab that hides nothing.
 */
export function parseTeamFilter(searchParams: URLSearchParams, roles: TeamRole[]): TeamFilter {
	const value = searchParams.get('role');
	const role = roles.find((candidate) => candidate.id === value);

	return role?.id ?? ALL_TEAM_FILTER;
}

/** Does this person hold the role with this id? */
function holdsRole(person: TeamPerson, roleId: string): boolean {
	return person.roles.some((role) => role.id === roleId);
}

/**
 * Does this person hold a role that is everything, or come from the
 * organisation, whose owners and admins are administrators of every conference
 * it runs?
 */
export function isTeamAdministrator(person: TeamPerson): boolean {
	return person.source === 'organization' || person.roles.some((role) => role.isAdministrator);
}

/** Does any of this person's roles apply per committee, the way the Chair preset does? */
export function holdsCommitteeRole(person: TeamPerson): boolean {
	return person.roles.some((role) => role.scope === 'committees');
}

/**
 * The people one tab shows. `all` shows everybody.
 *
 * An owner or admin of the organisation is an administrator of every
 * conference it runs without holding a role on it, so they appear under a
 * role that holds `administrator` (Organiser, unless the conference renamed
 * it) as well as under All, even though their row comes from
 * `organization_members` rather than from `conference_staff`.
 */
export function filterTeamPeople(
	people: TeamPerson[],
	filter: TeamFilter,
	roles: TeamRole[]
): TeamPerson[] {
	if (filter === ALL_TEAM_FILTER) {
		return people;
	}

	const role = roles.find((candidate) => candidate.id === filter);

	if (role === undefined) {
		return people;
	}

	return people.filter((person) => {
		if (person.source === 'organization') {
			return role.isAdministrator;
		}

		return holdsRole(person, role.id);
	});
}

/** How many people each tab holds, for the counts beside the tab labels. */
export function countTeamPeople(
	people: TeamPerson[],
	filter: TeamFilter,
	roles: TeamRole[]
): number {
	return filterTeamPeople(people, filter, roles).length;
}

/**
 * The words for one row's role: "Chair", or "Chair, Press" for somebody
 * holding two, in the conference's order. An owner or admin of the
 * organisation holds no role on the conference and reads "Administrator",
 * which is what rule 4 of `docs/roles-and-permissions.md` makes them.
 *
 * A staff member holding no role at all reads "No role": the committee
 * editor's "Chair it yourself" can put somebody on the team without one.
 */
export function teamRoleLabel(person: TeamPerson): string {
	if (person.source === 'organization') {
		return 'Administrator';
	}

	if (person.roles.length === 0) {
		return 'No role';
	}

	return person.roles.map((role) => role.name).join(', ');
}

/**
 * The badge colour: `brand` for staff, `neutral` for an organisation member.
 *
 * This is the one place a tone is decided by hand rather than by
 * `statusBadgeTone`, because `05-pages/organiser/team.md` asks for the two
 * tones to say where somebody comes from rather than what their role is.
 */
export function teamRoleTone(person: TeamPerson): BadgeTone {
	if (person.source === 'organization') {
		return 'neutral';
	}

	return 'brand';
}

/**
 * The committees a chair holds, as one line: "UNSC, ECOFIN". Empty text for
 * somebody who chairs none, which is everybody who is not a chair.
 *
 * A committee with no short name is written out in full, because a row with a
 * blank in it would read as a mistake.
 *
 * Somebody whose badge does not already say they work per committee reads
 * "Chairs UNSC" instead (T175): an organiser who pressed "Chair it yourself"
 * keeps their "Organisation · Owner" badge, and a bare "UNSC" beside it would
 * not say what they are to that committee.
 */
export function teamCommitteesLine(person: TeamPerson): string {
	const names = person.committees.map((committee) => committee.abbreviation ?? committee.name);

	if (names.length === 0) {
		return '';
	}

	const line = names.join(', ');
	const isBadgeChair = person.source === 'staff' && holdsCommitteeRole(person);

	if (isBadgeChair) {
		return line;
	}

	return `Chairs ${line}`;
}

/**
 * The team list with every person on it once: the organisation's members
 * first, then the conference's staff who are not already among them.
 *
 * One person can be both since "Chair it yourself" on the committee editor
 * (T175): the `ensure_chair_is_staff` trigger gives an organisation member who
 * chairs a staff row as well. `05-pages/organiser/team.md` keeps them in the
 * first row they have, the organisation's, whose badge says why they run the
 * conference; the committees they chair are on that row already, because both
 * halves are given their committees before they arrive here. The header's
 * counts are taken from this list, so nobody is counted twice either.
 */
export function mergeTeamRows(members: TeamPerson[], staff: TeamPerson[]): TeamPerson[] {
	// A `Set` answers "is this person already on the list?" in one lookup.
	const listedUserIds = new Set(members.map((member) => member.userId));
	const staffNotListed = staff.filter((person) => !listedUserIds.has(person.userId));

	return [...members, ...staffNotListed];
}

/**
 * True once the invitation's `expiresAt` is behind `now`.
 *
 * The moment itself counts as expired, which is what `accept_invite` in the
 * database does (`expires_at <= now()`), so the page never offers a "Copy link"
 * for an invitation the database would refuse a second later.
 *
 * `now` is given rather than read from the clock, because a pure function may
 * not read the clock.
 */
export function isInviteExpired(invite: PendingStaffInvite, now: Date): boolean {
	return new Date(invite.expiresAt).getTime() <= now.getTime();
}

/**
 * What the invite form holds, as plain text.
 *
 * Every field is text, because that is what a form sends and what an input
 * shows. A refused form is drawn again from these exact values, so the
 * organiser sees what they typed rather than an empty form.
 */
export type InviteFormValues = {
	email: string;
	/** The id of one of the conference's roles. */
	roleId: string;
	/** The committee a chair invitation hands over. Empty for none. */
	committeeId: string;
	/** Optional. "Secretary General". */
	title: string;
};

/** A message for each field that needs fixing. A field that is fine has no entry. */
export type InviteFormErrors = {
	email?: string;
	roleId?: string;
	committeeId?: string;
	title?: string;
};

/** What the form shows before the organiser has typed anything. */
export const EMPTY_INVITE_FORM: InviteFormValues = {
	email: '',
	roleId: '',
	committeeId: '',
	title: ''
};

/**
 * The roles an invitation may offer, in the shape `FormSelect` takes: the
 * roles handed in, which are the ones the reader may give, in the
 * conference's order, each with its scope in grey beside its name.
 */
export function inviteRoleOptions(
	roles: TeamRole[]
): { value: string; label: string; detail: string }[] {
	return roles.map((role) => ({
		value: role.id,
		label: role.name,
		detail: role.scope === 'committees' ? 'assigned committees' : 'whole conference'
	}));
}

/**
 * The longest a title may be. The `invites_title_length` constraint in the
 * database checks the same forty characters, so a title that skips this form
 * cannot get in either.
 */
export const STAFF_TITLE_MAX_LENGTH = 40;

/** Read one text field from a submitted form, without surrounding spaces. A missing field counts as ''. */
function readText(formData: FormData, fieldName: string): string {
	return String(formData.get(fieldName) ?? '').trim();
}

/** Read the invite form's four fields from a submitted form. */
export function readInviteForm(formData: FormData): InviteFormValues {
	return {
		email: readText(formData, 'email'),
		roleId: readText(formData, 'roleId'),
		committeeId: readText(formData, 'committeeId'),
		title: readText(formData, 'title')
	};
}

/**
 * What is wrong with the committee the form named, or `null` when there is
 * nothing to say.
 *
 * A role that works per committee needs one, because with none it does
 * nothing (section 6 of `docs/roles-and-permissions.md`); the person can be
 * given more committees once they have joined. A role that works across the
 * whole conference takes none, and one named for it is refused rather than
 * quietly dropped.
 */
function checkCommittee(
	values: InviteFormValues,
	committeeIds: string[],
	roles: TeamRole[]
): string | null {
	const role = roles.find((candidate) => candidate.id === values.roleId);

	if (role === undefined) {
		return null;
	}

	if (role.scope === 'committees' && values.committeeId === '') {
		return `Pick the committee ${role.name} applies in.`;
	}

	if (values.committeeId === '') {
		return null;
	}

	if (role.scope !== 'committees') {
		return `${role.name} works across the whole conference, so it takes no committee.`;
	}

	if (!committeeIds.includes(values.committeeId)) {
		return "That committee is not one of this conference's.";
	}

	return null;
}

/**
 * Checks the four fields of the invite form. Every problem is collected instead
 * of stopping at the first one, so the organiser sees all of them at once
 * rather than one per attempt.
 *
 * `committeeIds` is every committee of this conference and `roles` the roles
 * the reader may give, so an id from somewhere else, or a role above the
 * reader's own, is refused before the database sees it.
 * The form only offers this conference's, so that only happens when a form is
 * posted by something other than the page.
 */
export function validateInviteForm(
	values: InviteFormValues,
	committeeIds: string[],
	roles: TeamRole[]
): InviteFormErrors {
	const errors: InviteFormErrors = {};

	const emailMessage = validateEmail(values.email);

	if (emailMessage !== null) {
		errors.email = emailMessage;
	}

	const role = roles.find((candidate) => candidate.id === values.roleId);

	if (role === undefined) {
		errors.roleId = 'Please pick a role.';
	}

	const committeeMessage = checkCommittee(values, committeeIds, roles);

	if (committeeMessage !== null) {
		errors.committeeId = committeeMessage;
	}

	if (values.title.length > STAFF_TITLE_MAX_LENGTH) {
		errors.title = `A title can be at most ${STAFF_TITLE_MAX_LENGTH} characters.`;
	}

	return errors;
}

/** Did `validateInviteForm` find any problem at all? */
export function hasInviteErrors(errors: InviteFormErrors): boolean {
	return Object.keys(errors).length > 0;
}

/**
 * Somebody on the conference's staff who holds a role that applies per
 * committee, as the committee editor's chair picker lists them.
 *
 * `title` is what they are called on the conference's team ("Deputy Chair"),
 * and is `null` when nobody has written one. It is not the same thing as the
 * title on a `committee_chairs` row, which says what they are in one committee.
 *
 * `rank` is the position of their highest role of any kind, `-1` for an owner
 * or admin of the organisation, which decides whether the reader may make them
 * a chair (`mayAssignChair` in `$lib/team-access.ts`). It is the database's
 * `user_rank` for everybody but a platform admin, whom `user_rank` ranks `-1`
 * and a browser cannot pick out.
 */
export type ChairStaffMember = {
	userId: string;
	fullName: string;
	title: string | null;
	rank: number | null;
};

/** What a `committee_chairs` row is called when nobody says otherwise. */
export const DEFAULT_CHAIR_TITLE = 'Chair';

/**
 * How one person reads in the picker: "Aiko Tanaka", or "Luis Moreno (Deputy
 * Chair)" for somebody whose staff title says something the list does not
 * already say.
 *
 * A title of exactly "Chair" is left off, because it is what everybody in this
 * list is and a line ending in "(Chair)" would tell the organiser nothing.
 */
function chairPickerLabel(member: ChairStaffMember): string {
	if (member.title === null || member.title === DEFAULT_CHAIR_TITLE) {
		return member.fullName;
	}

	return `${member.fullName} (${member.title})`;
}

/**
 * The choices the chair picker offers: the conference's chair staff, minus the
 * people who already chair this committee.
 *
 * The order is the one the staff arrived in, because the caller has already
 * sorted them and the picker should not disagree with the list beside it.
 */
export function chairPickerOptions(
	chairStaff: ChairStaffMember[],
	currentChairUserIds: string[]
): { value: string; label: string }[] {
	// A `Set` answers "is this person already a chair here?" in one lookup,
	// rather than walking the whole list of current chairs once per person.
	const currentChairs = new Set(currentChairUserIds);
	const options: { value: string; label: string }[] = [];

	for (const member of chairStaff) {
		if (currentChairs.has(member.userId)) {
			continue;
		}

		options.push({ value: member.userId, label: chairPickerLabel(member) });
	}

	return options;
}
