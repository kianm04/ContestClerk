import { describe, expect, it } from 'vitest';
import type { TeamPerson, TeamRole } from './team';
import { teamCellClass, teamCommitteeCell, teamTableRoleLabel, teamTitleCell } from './team-table';

/** The committee the chairs in these tests hold. */
const DISEC = { id: 'committee-disec', name: 'Disarmament and Security', abbreviation: 'DISEC' };

/** The three roles every conference starts with, as the team page is handed them. */
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
	return makeStaff({
		userId: 'user-owner',
		source: 'organization',
		roles: [],
		organizationRole: 'owner',
		...overrides
	});
}

describe('teamTableRoleLabel', () => {
	it('calls an owner or admin of the organisation an administrator', () => {
		expect(teamTableRoleLabel(makeOrganizationMember())).toBe('Administrator');
	});

	it('names the roles of everybody else', () => {
		expect(teamTableRoleLabel(makeStaff())).toBe('Chair');
		expect(teamTableRoleLabel(makeStaff({ roles: [VOLUNTEER_ROLE] }))).toBe('Volunteer');
		expect(teamTableRoleLabel(makeStaff({ roles: [ORGANISER_ROLE, CHAIR_ROLE] }))).toBe(
			'Organiser, Chair'
		);
	});
});

describe('teamCommitteeCell', () => {
	it('names the committees a chair holds', () => {
		expect(teamCommitteeCell(makeStaff({ committees: [DISEC] }))).toEqual({
			text: 'DISEC',
			isQuiet: false
		});
	});

	it('says an organiser who chairs a committee chairs it', () => {
		const owner = makeOrganizationMember({ committees: [DISEC] });

		expect(teamCommitteeCell(owner)).toEqual({ text: 'Chairs DISEC', isQuiet: false });
	});

	it('gives organisers every committee', () => {
		expect(teamCommitteeCell(makeOrganizationMember())).toEqual({ text: 'All', isQuiet: true });
		expect(teamCommitteeCell(makeStaff({ roles: [ORGANISER_ROLE] }))).toEqual({
			text: 'All',
			isQuiet: true
		});
	});

	it('says None for a chair or volunteer without a committee', () => {
		expect(teamCommitteeCell(makeStaff())).toEqual({ text: 'None', isQuiet: true });
		expect(teamCommitteeCell(makeStaff({ roles: [VOLUNTEER_ROLE] }))).toEqual({
			text: 'None',
			isQuiet: true
		});
	});
});

describe('teamTitleCell', () => {
	it('says which organisation a member comes from and in what role', () => {
		expect(teamTitleCell(makeOrganizationMember(), 'Northbridge MUN Society')).toEqual({
			text: 'Owner of Northbridge MUN Society',
			isQuiet: true
		});
		expect(
			teamTitleCell(
				makeOrganizationMember({ organizationRole: 'admin' }),
				'Northbridge MUN Society'
			).text
		).toBe('Admin of Northbridge MUN Society');
	});

	it('shows the title a staff member was given', () => {
		const organiser = makeStaff({ roles: [ORGANISER_ROLE], title: 'Director-General' });

		expect(teamTitleCell(organiser, 'Northbridge')).toEqual({
			text: 'Director-General',
			isQuiet: false
		});
	});

	it('says None when a staff member has no title', () => {
		expect(teamTitleCell(makeStaff(), 'Northbridge')).toEqual({ text: 'None', isQuiet: true });
	});
});

describe('teamCellClass', () => {
	it('greys out a stand-in and leaves real words dark', () => {
		expect(teamCellClass({ text: 'None', isQuiet: true })).toBe('text-muted-foreground');
		expect(teamCellClass({ text: 'Director-General', isQuiet: false })).toBe('text-foreground');
	});
});
