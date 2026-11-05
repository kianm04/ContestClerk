import { describe, expect, it } from 'vitest';
import type { MyPermissions } from './permissions';
import type { ChairStaffMember, PendingStaffInvite, TeamPerson, TeamRole } from './team';
import {
	committeeRoleHint,
	giveableRoles,
	mayActOnPerson,
	mayAssignChair,
	mayChairThemselves,
	mayChangeInvite,
	mayRemoveChair,
	personRank,
	roleChoices,
	rolesAfterEdit,
	roleScopeWords
} from './team-access';

/** A role at a place in the conference's order, conference-wide unless told otherwise. */
function role(id: string, position: number, scope: TeamRole['scope'] = 'conference'): TeamRole {
	return { id, name: id, position, scope, isPublic: false, isAdministrator: false };
}

const ORGANISER = { ...role('Organiser', 0), isAdministrator: true };
const DEPUTY = role('Deputy', 1);
const CHAIR = role('Chair', 2, 'committees');
const PRESS = role('Press', 3);
const ROLES = [ORGANISER, DEPUTY, CHAIR, PRESS];

/** The reader of these tests: Deputy, who may manage the team, ranked second. */
const DEPUTY_READER: MyPermissions = {
	held: [{ permission: 'manage_team', scope: 'conference' }],
	committeeIds: [],
	rank: 1
};

const ADMINISTRATOR_READER: MyPermissions = {
	held: [{ permission: 'administrator', scope: 'conference' }],
	committeeIds: [],
	rank: 0
};

/** A staff row holding these roles. */
function staff(userId: string, roles: TeamRole[], fullName = 'Tomasz Zielinski'): TeamPerson {
	return {
		userId,
		fullName,
		avatarPath: null,
		source: 'staff',
		roles,
		organizationRole: null,
		title: null,
		committees: []
	};
}

const OWNER_ROW: TeamPerson = {
	...staff('owner', []),
	source: 'organization',
	organizationRole: 'owner'
};

describe('roleScopeWords', () => {
	it('names both scopes the way the roles page does', () => {
		expect(roleScopeWords('conference')).toBe('Whole conference');
		expect(roleScopeWords('committees')).toBe('Assigned committees');
	});
});

describe('personRank', () => {
	it('is the highest role held, first among the organisation and absent with no role', () => {
		expect(personRank(staff('a', [PRESS, CHAIR]))).toBe(2);
		expect(personRank(OWNER_ROW)).toBe(-1);
		expect(personRank(staff('a', []))).toBeNull();
	});
});

describe('mayActOnPerson', () => {
	it('acts on somebody below the reader, or with no role at all', () => {
		expect(mayActOnPerson(DEPUTY_READER, staff('a', [PRESS]), 'me')).toBe(true);
		expect(mayActOnPerson(DEPUTY_READER, staff('a', []), 'me')).toBe(true);
	});

	it('never on somebody at or above the reader', () => {
		expect(mayActOnPerson(DEPUTY_READER, staff('a', [DEPUTY]), 'me')).toBe(false);
		expect(mayActOnPerson(DEPUTY_READER, staff('a', [PRESS, ORGANISER]), 'me')).toBe(false);
	});

	it('never on the reader’s own row or a row from the organisation, even for an administrator', () => {
		expect(mayActOnPerson(ADMINISTRATOR_READER, staff('me', [PRESS]), 'me')).toBe(false);
		expect(mayActOnPerson(ADMINISTRATOR_READER, OWNER_ROW, 'me')).toBe(false);
	});

	it('lets an administrator act on anybody else, whatever they hold', () => {
		expect(mayActOnPerson(ADMINISTRATOR_READER, staff('a', [ORGANISER]), 'me')).toBe(true);
	});
});

describe('mayAssignChair', () => {
	/** Somebody on the chair staff, at this rank. */
	function chairStaff(rank: number | null): ChairStaffMember {
		return { userId: 'a', fullName: 'Aiko Tanaka', title: null, rank };
	}

	it('makes a chair of somebody below the reader, or with no role at all', () => {
		expect(mayAssignChair(DEPUTY_READER, chairStaff(2))).toBe(true);
		expect(mayAssignChair(DEPUTY_READER, chairStaff(null))).toBe(true);
	});

	it('never of somebody at or above the reader, or an owner of the organisation', () => {
		expect(mayAssignChair(DEPUTY_READER, chairStaff(1))).toBe(false);
		expect(mayAssignChair(DEPUTY_READER, chairStaff(0))).toBe(false);
		expect(mayAssignChair(DEPUTY_READER, chairStaff(-1))).toBe(false);
	});

	it('never for a reader with no rank, who is below everybody', () => {
		const unranked: MyPermissions = { ...DEPUTY_READER, rank: null };

		expect(mayAssignChair(unranked, chairStaff(null))).toBe(false);
	});

	it('lets an administrator make a chair of anybody', () => {
		expect(mayAssignChair(ADMINISTRATOR_READER, chairStaff(-1))).toBe(true);
	});
});

describe('mayRemoveChair', () => {
	it('takes off a chair below the reader, or one with no role at all', () => {
		expect(mayRemoveChair(DEPUTY_READER, 2)).toBe(true);
		expect(mayRemoveChair(DEPUTY_READER, null)).toBe(true);
	});

	it('never a peer, somebody above, an owner, or the reader themselves', () => {
		// The reader's own rank is the same as their own rank, so a chair who is
		// the reader counts as a peer.
		expect(mayRemoveChair(DEPUTY_READER, DEPUTY_READER.rank)).toBe(false);
		expect(mayRemoveChair(DEPUTY_READER, 0)).toBe(false);
		expect(mayRemoveChair(DEPUTY_READER, -1)).toBe(false);
	});

	it('lets an administrator take off anybody', () => {
		expect(mayRemoveChair(ADMINISTRATOR_READER, -1)).toBe(true);
	});
});

describe('mayChairThemselves', () => {
	it('is for an administrator alone, because nobody ranks below themselves', () => {
		expect(mayChairThemselves(ADMINISTRATOR_READER)).toBe(true);
		expect(mayChairThemselves(DEPUTY_READER)).toBe(false);
	});
});

describe('mayChangeInvite', () => {
	/** An invitation to this role. */
	function inviteTo(roleId: string): PendingStaffInvite {
		return {
			id: `invite-${roleId}`,
			token: 'token',
			email: 'nina@example.com',
			roleId,
			roleName: roleId,
			committeeId: null,
			committeeName: null,
			title: null,
			expiresAt: '2027-03-01T12:00:00+00:00'
		};
	}

	it('lets the reader change an invitation to a role below their own', () => {
		expect(mayChangeInvite(DEPUTY_READER, inviteTo(CHAIR.id), ROLES)).toBe(true);
	});

	it('refuses one to their own role or above it (security review, migration 20261023121000)', () => {
		expect(mayChangeInvite(DEPUTY_READER, inviteTo(DEPUTY.id), ROLES)).toBe(false);
		expect(mayChangeInvite(DEPUTY_READER, inviteTo(ORGANISER.id), ROLES)).toBe(false);
	});

	it('lets an administrator change any of them', () => {
		expect(mayChangeInvite(ADMINISTRATOR_READER, inviteTo(ORGANISER.id), ROLES)).toBe(true);
	});

	it('refuses one to a role the page does not know', () => {
		expect(mayChangeInvite(ADMINISTRATOR_READER, inviteTo('deleted'), ROLES)).toBe(false);
	});
});

describe('giveableRoles', () => {
	it('keeps the roles below the reader', () => {
		expect(giveableRoles(DEPUTY_READER, ROLES)).toEqual([CHAIR, PRESS]);
	});
});

describe('roleChoices', () => {
	it('says why a role cannot be ticked, and gives the others their scope', () => {
		expect(
			roleChoices(DEPUTY_READER, ROLES).map((choice) => [choice.isGiveable, choice.aside])
		).toEqual([
			[false, 'Above your role'],
			[false, 'Your own role'],
			[true, 'Assigned committees'],
			[true, 'Whole conference']
		]);
	});
});

describe('rolesAfterEdit', () => {
	it('keeps the held roles the reader cannot change, which a disabled box never sends', () => {
		const person = staff('a', [ORGANISER, PRESS]);

		expect(rolesAfterEdit(DEPUTY_READER, ROLES, person, ['Chair'])).toEqual([ORGANISER, CHAIR]);
	});

	it('ignores a ticked role above the reader, and ids that are no role', () => {
		const person = staff('a', [PRESS]);

		expect(rolesAfterEdit(DEPUTY_READER, ROLES, person, ['Organiser', 'nope', 'Press'])).toEqual([
			PRESS
		]);
	});
});

describe('committeeRoleHint', () => {
	it('names the per-committee role and the person by their first name', () => {
		expect(committeeRoleHint(staff('a', []), [PRESS, CHAIR])).toBe(
			'Chair applies only in the committees Tomasz is assigned to, and Tomasz has none yet. Assign one under Committees on Tomasz’s row.'
		);
	});

	it('says nothing once they have a committee, or with no per-committee role', () => {
		const chairing = {
			...staff('a', []),
			committees: [{ id: 'c', name: 'Security Council', abbreviation: 'UNSC' }]
		};

		expect(committeeRoleHint(chairing, [CHAIR])).toBeNull();
		expect(committeeRoleHint(staff('a', []), [PRESS])).toBeNull();
	});
});
