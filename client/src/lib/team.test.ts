import { describe, expect, it } from 'vitest';
import {
	ALL_TEAM_FILTER,
	chairPickerOptions,
	countTeamPeople,
	DEFAULT_CHAIR_TITLE,
	EMPTY_INVITE_FORM,
	filterTeamPeople,
	hasInviteErrors,
	holdsCommitteeRole,
	inviteRoleOptions,
	isInviteExpired,
	isTeamAdministrator,
	mergeTeamRows,
	parseTeamFilter,
	readInviteForm,
	STAFF_TITLE_MAX_LENGTH,
	teamCommitteesLine,
	teamRoleLabel,
	teamRoleTone,
	validateInviteForm,
	type ChairStaffMember,
	type InviteFormValues,
	type PendingStaffInvite,
	type TeamPerson,
	type TeamRole
} from './team';

/** The committee a chair in these tests holds, so its id can be named in both places. */
const SECURITY_COUNCIL = {
	id: 'committee-unsc',
	name: 'United Nations Security Council',
	abbreviation: 'UNSC'
};

/** A second committee, for the chair who holds two. */
const ECOFIN = {
	id: 'committee-ecofin',
	name: 'Economic and Financial Committee',
	abbreviation: 'ECOFIN'
};

/**
 * The three roles every conference starts with, in the conference's order, as
 * `loadTeam` hands them to the page. Organiser is everything, Chair works per
 * committee, and Volunteer is neither.
 */
const ORGANISER_ROLE: TeamRole = {
	id: 'role-organiser',
	name: 'Organiser',
	position: 0,
	scope: 'conference',
	isPublic: true,
	isAdministrator: true
};

const CHAIR_ROLE: TeamRole = {
	id: 'role-chair',
	name: 'Chair',
	position: 1,
	scope: 'committees',
	isPublic: true,
	isAdministrator: false
};

const VOLUNTEER_ROLE: TeamRole = {
	id: 'role-volunteer',
	name: 'Volunteer',
	position: 2,
	scope: 'conference',
	isPublic: false,
	isAdministrator: false
};

const ROLES = [ORGANISER_ROLE, CHAIR_ROLE, VOLUNTEER_ROLE];

/** A role the conference made itself, after the presets. */
const PRESS_ROLE: TeamRole = {
	id: 'role-press',
	name: 'Press',
	position: 3,
	scope: 'conference',
	isPublic: false,
	isAdministrator: false
};

/** Somebody on the team's staff, a chair unless a test says otherwise. */
function makeStaff(overrides: Partial<TeamPerson> = {}): TeamPerson {
	return {
		userId: 'user-nadia',
		fullName: 'Nadia Haddad',
		avatarPath: null,
		source: 'staff',
		roles: [CHAIR_ROLE],
		organizationRole: null,
		title: null,
		committees: [],
		...overrides
	};
}

/** Somebody on the team because they are in the organisation that runs the conference. */
function makeOrganizationMember(overrides: Partial<TeamPerson> = {}): TeamPerson {
	return {
		userId: 'user-owner',
		fullName: 'Mara Okafor',
		avatarPath: null,
		source: 'organization',
		roles: [],
		organizationRole: 'owner',
		title: null,
		committees: [],
		...overrides
	};
}

/** One of each kind of person, which most of the filtering tests work on. */
const MIXED_TEAM: TeamPerson[] = [
	makeOrganizationMember(),
	makeStaff({ userId: 'user-organiser', roles: [ORGANISER_ROLE] }),
	makeStaff({ userId: 'user-chair', roles: [CHAIR_ROLE] }),
	makeStaff({ userId: 'user-volunteer', roles: [VOLUNTEER_ROLE] })
];

/** An invitation nobody has accepted, expiring on the last day of September 2026. */
function makeInvite(overrides: Partial<PendingStaffInvite> = {}): PendingStaffInvite {
	return {
		id: 'invite-1',
		token: 'a'.repeat(32),
		email: 'chair@example.org',
		roleId: CHAIR_ROLE.id,
		roleName: 'Chair',
		committeeId: 'committee-1',
		committeeName: 'United Nations Security Council',
		title: null,
		expiresAt: '2026-09-29T12:00:00Z',
		...overrides
	};
}

/** An invite form somebody could really have filled in, so a test can change one field of it. */
function inviteValues(changes: Partial<InviteFormValues> = {}): InviteFormValues {
	return {
		email: 'chair@example.org',
		roleId: CHAIR_ROLE.id,
		committeeId: SECURITY_COUNCIL.id,
		title: 'Secretary General',
		...changes
	};
}

describe('parseTeamFilter', () => {
	it('opens the All tab when the address says nothing', () => {
		expect(parseTeamFilter(new URLSearchParams(), ROLES)).toBe(ALL_TEAM_FILTER);
	});

	it("reads each of the conference's roles back off the address by its id", () => {
		expect(parseTeamFilter(new URLSearchParams('role=role-organiser'), ROLES)).toBe(
			'role-organiser'
		);
		expect(parseTeamFilter(new URLSearchParams('role=role-chair'), ROLES)).toBe('role-chair');
		expect(parseTeamFilter(new URLSearchParams('role=role-volunteer'), ROLES)).toBe(
			'role-volunteer'
		);
	});

	it('falls back to All for anything that is not one of the roles', () => {
		// The address is only text somebody could have typed, so anything
		// unknown opens the tab that hides nothing. A role's name is not its id.
		expect(parseTeamFilter(new URLSearchParams('role=sponsor'), ROLES)).toBe('all');
		expect(parseTeamFilter(new URLSearchParams('role=chair'), ROLES)).toBe('all');
		expect(parseTeamFilter(new URLSearchParams('role=ROLE-CHAIR'), ROLES)).toBe('all');
	});
});

describe('filterTeamPeople', () => {
	it('shows everybody on the All tab', () => {
		expect(filterTeamPeople(MIXED_TEAM, 'all', ROLES)).toEqual(MIXED_TEAM);
	});

	it('shows staff organisers and organisation members on the Organisers tab', () => {
		// `has_permission(id, 'administrator')` is true for a member of the organisation that
		// runs the conference, so they are an organiser of it: they belong under
		// a role that is everything.
		const organisers = filterTeamPeople(MIXED_TEAM, 'role-organiser', ROLES);
		const ids = organisers.map((person) => person.userId);

		expect(ids).toEqual(['user-owner', 'user-organiser']);
	});

	it('shows only the chairs on the Chairs tab', () => {
		const chairs = filterTeamPeople(MIXED_TEAM, 'role-chair', ROLES);

		expect(chairs.map((person) => person.userId)).toEqual(['user-chair']);
	});

	it('shows only the volunteers on the Volunteers tab', () => {
		const volunteers = filterTeamPeople(MIXED_TEAM, 'role-volunteer', ROLES);

		expect(volunteers.map((person) => person.userId)).toEqual(['user-volunteer']);
	});

	it('never puts an organisation member under Chairs or Volunteers', () => {
		// An organisation role is `owner`, `admin` or `member`, and none of them
		// is a conference role.
		const people = [makeOrganizationMember({ organizationRole: 'member' })];

		expect(filterTeamPeople(people, 'role-chair', ROLES)).toEqual([]);
		expect(filterTeamPeople(people, 'role-volunteer', ROLES)).toEqual([]);
	});

	it('shows somebody holding two roles under both', () => {
		const people = [makeStaff({ roles: [CHAIR_ROLE, PRESS_ROLE] })];
		const roles = [...ROLES, PRESS_ROLE];

		expect(filterTeamPeople(people, 'role-chair', roles)).toEqual(people);
		expect(filterTeamPeople(people, 'role-press', roles)).toEqual(people);
	});

	it('shows everybody for a filter that is not one of the roles', () => {
		expect(filterTeamPeople(MIXED_TEAM, 'role-gone', ROLES)).toEqual(MIXED_TEAM);
	});
});

describe('countTeamPeople', () => {
	it('counts what each tab holds', () => {
		expect(countTeamPeople(MIXED_TEAM, 'all', ROLES)).toBe(4);
		expect(countTeamPeople(MIXED_TEAM, 'role-organiser', ROLES)).toBe(2);
		expect(countTeamPeople(MIXED_TEAM, 'role-chair', ROLES)).toBe(1);
		expect(countTeamPeople(MIXED_TEAM, 'role-volunteer', ROLES)).toBe(1);
	});

	it('counts nobody on an empty team', () => {
		expect(countTeamPeople([], 'all', ROLES)).toBe(0);
	});
});

describe('teamRoleLabel', () => {
	it("gives a staff member's roles by name", () => {
		expect(teamRoleLabel(makeStaff({ roles: [ORGANISER_ROLE] }))).toBe('Organiser');
		expect(teamRoleLabel(makeStaff({ roles: [CHAIR_ROLE] }))).toBe('Chair');
		expect(teamRoleLabel(makeStaff({ roles: [VOLUNTEER_ROLE] }))).toBe('Volunteer');
		expect(teamRoleLabel(makeStaff({ roles: [CHAIR_ROLE, PRESS_ROLE] }))).toBe('Chair, Press');
	});

	it('calls an owner or admin of the organisation an administrator', () => {
		expect(teamRoleLabel(makeOrganizationMember({ organizationRole: 'owner' }))).toBe(
			'Administrator'
		);
		expect(teamRoleLabel(makeOrganizationMember({ organizationRole: 'admin' }))).toBe(
			'Administrator'
		);
	});

	it('says "No role" for a staff member who holds none', () => {
		// "Chair it yourself" on the committee editor puts somebody on the team
		// without a role.
		expect(teamRoleLabel(makeStaff({ roles: [] }))).toBe('No role');
	});
});

describe('teamRoleTone', () => {
	it('shows staff in the brand colour', () => {
		expect(teamRoleTone(makeStaff({ roles: [CHAIR_ROLE] }))).toBe('brand');
		expect(teamRoleTone(makeStaff({ roles: [VOLUNTEER_ROLE] }))).toBe('brand');
	});

	it('shows an organisation member in neutral', () => {
		expect(teamRoleTone(makeOrganizationMember())).toBe('neutral');
	});
});

describe('holdsCommitteeRole and isTeamAdministrator', () => {
	it('says who works per committee', () => {
		expect(holdsCommitteeRole(makeStaff({ roles: [CHAIR_ROLE] }))).toBe(true);
		expect(holdsCommitteeRole(makeStaff({ roles: [VOLUNTEER_ROLE, CHAIR_ROLE] }))).toBe(true);
		expect(holdsCommitteeRole(makeStaff({ roles: [VOLUNTEER_ROLE] }))).toBe(false);
		expect(holdsCommitteeRole(makeOrganizationMember())).toBe(false);
	});

	it('says who is everything: an organisation member, or anybody with such a role', () => {
		expect(isTeamAdministrator(makeOrganizationMember())).toBe(true);
		expect(isTeamAdministrator(makeStaff({ roles: [ORGANISER_ROLE] }))).toBe(true);
		expect(isTeamAdministrator(makeStaff({ roles: [CHAIR_ROLE] }))).toBe(false);
		expect(isTeamAdministrator(makeStaff({ roles: [] }))).toBe(false);
	});
});

describe('teamCommitteesLine', () => {
	it('is empty for somebody who chairs nothing', () => {
		expect(teamCommitteesLine(makeStaff())).toBe('');
	});

	it('names one committee by its short name', () => {
		const person = makeStaff({ committees: [SECURITY_COUNCIL] });

		expect(teamCommitteesLine(person)).toBe('UNSC');
	});

	it('names several committees in the order they arrived', () => {
		const person = makeStaff({ committees: [SECURITY_COUNCIL, ECOFIN] });

		expect(teamCommitteesLine(person)).toBe('UNSC, ECOFIN');
	});

	it('writes a committee with no short name out in full', () => {
		const person = makeStaff({
			committees: [{ id: 'committee-crisis', name: 'Historical Crisis', abbreviation: null }]
		});

		expect(teamCommitteesLine(person)).toBe('Historical Crisis');
	});

	it('says "Chairs" for an organisation member, whose badge does not say it (T175)', () => {
		const person = makeOrganizationMember({ committees: [SECURITY_COUNCIL] });

		expect(teamCommitteesLine(person)).toBe('Chairs UNSC');
	});

	it('says "Chairs" for an organiser on the staff who chairs', () => {
		const person = makeStaff({
			roles: [ORGANISER_ROLE],
			committees: [SECURITY_COUNCIL, ECOFIN]
		});

		expect(teamCommitteesLine(person)).toBe('Chairs UNSC, ECOFIN');
	});

	it('stays empty for an organisation member who chairs nothing', () => {
		expect(teamCommitteesLine(makeOrganizationMember())).toBe('');
	});
});

describe('mergeTeamRows', () => {
	it('keeps an organisation member who also has a staff row once, in their organisation row', () => {
		const owner = makeOrganizationMember({ userId: 'user-owner', committees: [SECURITY_COUNCIL] });
		const ownerAsStaff = makeStaff({
			userId: 'user-owner',
			roles: [CHAIR_ROLE],
			committees: [SECURITY_COUNCIL]
		});
		const chair = makeStaff({ userId: 'user-chair' });

		const merged = mergeTeamRows([owner], [ownerAsStaff, chair]);

		expect(merged).toEqual([owner, chair]);
	});

	it('leaves staff who are not in the organisation alone, after the members', () => {
		const owner = makeOrganizationMember();
		const volunteer = makeStaff({ userId: 'user-volunteer', roles: [VOLUNTEER_ROLE] });

		expect(mergeTeamRows([owner], [volunteer])).toEqual([owner, volunteer]);
	});

	it('counts an organiser who chairs once, as an organiser and not also as a chair', () => {
		const owner = makeOrganizationMember({ committees: [SECURITY_COUNCIL] });
		const ownerAsStaff = makeStaff({ userId: owner.userId, roles: [CHAIR_ROLE] });

		const merged = mergeTeamRows([owner], [ownerAsStaff]);

		expect(merged).toHaveLength(1);
		expect(merged[0].source).toBe('organization');
	});

	it('answers an empty list for an empty team', () => {
		expect(mergeTeamRows([], [])).toEqual([]);
	});
});

describe('isInviteExpired', () => {
	it('is false while the invitation still has time left', () => {
		const invite = makeInvite({ expiresAt: '2026-09-29T12:00:00Z' });

		expect(isInviteExpired(invite, new Date('2026-09-20T12:00:00Z'))).toBe(false);
	});

	it('is true once the moment is behind', () => {
		const invite = makeInvite({ expiresAt: '2026-09-29T12:00:00Z' });

		expect(isInviteExpired(invite, new Date('2026-09-30T12:00:00Z'))).toBe(true);
	});

	it('counts the moment itself as expired, as the database does', () => {
		const invite = makeInvite({ expiresAt: '2026-09-29T12:00:00Z' });

		expect(isInviteExpired(invite, new Date('2026-09-29T12:00:00Z'))).toBe(true);
	});
});

describe('EMPTY_INVITE_FORM', () => {
	it('starts every field empty, so the form draws itself blank', () => {
		expect(EMPTY_INVITE_FORM).toEqual({ email: '', roleId: '', committeeId: '', title: '' });
	});
});

describe('inviteRoleOptions', () => {
	it("offers the conference's roles by id, in its order", () => {
		const values = inviteRoleOptions(ROLES).map((option) => option.value);

		expect(values).toEqual(['role-organiser', 'role-chair', 'role-volunteer']);
	});

	it('takes its words from the names the conference gave its roles', () => {
		expect(inviteRoleOptions(ROLES)[1].label).toBe('Chair');
		expect(inviteRoleOptions([PRESS_ROLE])[0].label).toBe('Press');
	});

	it('says in grey where each role applies', () => {
		const details = inviteRoleOptions(ROLES).map((option) => option.detail);

		expect(details).toEqual(['whole conference', 'assigned committees', 'whole conference']);
	});
});

describe('STAFF_TITLE_MAX_LENGTH', () => {
	it('is the forty characters the database constraint also checks', () => {
		expect(STAFF_TITLE_MAX_LENGTH).toBe(40);
	});
});

describe('readInviteForm', () => {
	/** The form the invite section posts. */
	function inviteForm(fields: Record<string, string>): FormData {
		const formData = new FormData();

		for (const fieldName of Object.keys(fields)) {
			formData.set(fieldName, fields[fieldName]);
		}

		return formData;
	}

	it('reads every field the form asks for', () => {
		const formData = inviteForm({
			email: 'chair@example.org',
			roleId: CHAIR_ROLE.id,
			committeeId: SECURITY_COUNCIL.id,
			title: 'Secretary General'
		});

		expect(readInviteForm(formData)).toEqual({
			email: 'chair@example.org',
			roleId: CHAIR_ROLE.id,
			committeeId: SECURITY_COUNCIL.id,
			title: 'Secretary General'
		});
	});

	it('counts a field the form left out as empty text', () => {
		const values = readInviteForm(inviteForm({ email: 'chair@example.org' }));

		expect(values.roleId).toBe('');
		expect(values.committeeId).toBe('');
		expect(values.title).toBe('');
	});

	it('drops the spaces around what somebody typed', () => {
		const values = readInviteForm(inviteForm({ email: '  chair@example.org  ' }));

		expect(values.email).toBe('chair@example.org');
	});
});

describe('validateInviteForm', () => {
	it('accepts a filled-in invitation to a chair of this conference', () => {
		const errors = validateInviteForm(inviteValues(), [SECURITY_COUNCIL.id], ROLES);

		expect(errors).toEqual({});
	});

	it('accepts an invitation that names no committee and no title', () => {
		const values = inviteValues({ roleId: VOLUNTEER_ROLE.id, committeeId: '', title: '' });

		expect(validateInviteForm(values, [SECURITY_COUNCIL.id], ROLES)).toEqual({});
	});

	it('asks for an email address the same way the rest of the app does', () => {
		const errors = validateInviteForm(inviteValues({ email: '' }), [SECURITY_COUNCIL.id], ROLES);

		expect(errors.email).toBe('Please enter your email address.');
	});

	it('refuses an address that is not one', () => {
		const errors = validateInviteForm(
			inviteValues({ email: 'chair' }),
			[SECURITY_COUNCIL.id],
			ROLES
		);

		expect(errors.email).toBe('That does not look like an email address.');
	});

	it('asks for a role when none was picked', () => {
		const errors = validateInviteForm(inviteValues({ roleId: '' }), [SECURITY_COUNCIL.id], ROLES);

		expect(errors.roleId).toBe('Please pick a role.');
	});

	it("asks for a role again when the one posted is not one of this conference's", () => {
		const values = inviteValues({ roleId: 'role-elsewhere', committeeId: '' });

		expect(validateInviteForm(values, [SECURITY_COUNCIL.id], ROLES).roleId).toBe(
			'Please pick a role.'
		);
	});

	it('refuses a committee for any role that does not work per committee', () => {
		const values = inviteValues({ roleId: VOLUNTEER_ROLE.id });
		const errors = validateInviteForm(values, [SECURITY_COUNCIL.id], ROLES);

		expect(errors.committeeId).toBe(
			'Volunteer works across the whole conference, so it takes no committee.'
		);
	});

	it('asks for a committee for a role that works per committee', () => {
		const values = inviteValues({ roleId: CHAIR_ROLE.id, committeeId: '' });
		const errors = validateInviteForm(values, [SECURITY_COUNCIL.id], ROLES);

		expect(errors.committeeId).toBe('Pick the committee Chair applies in.');
	});

	it('refuses a committee belonging to another conference', () => {
		const values = inviteValues({ committeeId: 'committee-somewhere-else' });
		const errors = validateInviteForm(values, [SECURITY_COUNCIL.id], ROLES);

		expect(errors.committeeId).toBe("That committee is not one of this conference's.");
	});

	it('refuses a title longer than forty characters', () => {
		const values = inviteValues({ title: 'x'.repeat(STAFF_TITLE_MAX_LENGTH + 1) });
		const errors = validateInviteForm(values, [SECURITY_COUNCIL.id], ROLES);

		expect(errors.title).toBe('A title can be at most 40 characters.');
	});

	it('accepts a title of exactly forty characters', () => {
		const values = inviteValues({ title: 'x'.repeat(STAFF_TITLE_MAX_LENGTH) });

		expect(validateInviteForm(values, [SECURITY_COUNCIL.id], ROLES).title).toBe(undefined);
	});

	it('collects every problem at once rather than stopping at the first', () => {
		const values = inviteValues({ email: '', roleId: '', title: 'x'.repeat(41) });
		const errors = validateInviteForm(values, [SECURITY_COUNCIL.id], ROLES);

		expect(Object.keys(errors).sort()).toEqual(['email', 'roleId', 'title']);
	});
});

describe('hasInviteErrors', () => {
	it('is false when nothing needs fixing', () => {
		expect(hasInviteErrors({})).toBe(false);
	});

	it('is true when one field needs fixing', () => {
		expect(hasInviteErrors({ roleId: 'Please pick a role.' })).toBe(true);
	});
});

describe('chairPickerOptions', () => {
	/** Somebody on the conference's staff who holds a role that works per committee. */
	function makeChairStaff(overrides: Partial<ChairStaffMember> = {}): ChairStaffMember {
		return {
			userId: 'user-aiko',
			fullName: 'Aiko Tanaka',
			title: null,
			rank: 2,
			...overrides
		};
	}

	it('offers somebody with no title by name alone', () => {
		const options = chairPickerOptions([makeChairStaff()], []);

		expect(options).toEqual([{ value: 'user-aiko', label: 'Aiko Tanaka' }]);
	});

	it('writes a staff title in brackets after the name', () => {
		const staff = [
			makeChairStaff({ userId: 'user-luis', fullName: 'Luis Moreno', title: 'Deputy Chair' })
		];

		expect(chairPickerOptions(staff, [])[0].label).toBe('Luis Moreno (Deputy Chair)');
	});

	it('leaves out a title that is only "Chair"', () => {
		// Everybody this picker offers is a chair, so the brackets would say nothing.
		const staff = [makeChairStaff({ title: DEFAULT_CHAIR_TITLE })];

		expect(chairPickerOptions(staff, [])[0].label).toBe('Aiko Tanaka');
	});

	it('leaves out somebody who already chairs this committee', () => {
		const staff = [
			makeChairStaff(),
			makeChairStaff({ userId: 'user-luis', fullName: 'Luis Moreno' })
		];
		const options = chairPickerOptions(staff, ['user-aiko']);

		expect(options.map((option) => option.value)).toEqual(['user-luis']);
	});

	it('offers nothing when the conference has no chair staff at all', () => {
		expect(chairPickerOptions([], ['user-aiko'])).toEqual([]);
	});

	it('keeps the order it was given, because the caller has already sorted', () => {
		const staff = [
			makeChairStaff({ userId: 'user-zoe', fullName: 'Zoe Adams' }),
			makeChairStaff({ userId: 'user-ana', fullName: 'Ana Bauer' })
		];
		const options = chairPickerOptions(staff, []);

		expect(options.map((option) => option.label)).toEqual(['Zoe Adams', 'Ana Bauer']);
	});
});
