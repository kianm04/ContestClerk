import { describe, expect, it } from 'vitest';
import {
	canChangeRole,
	canManageRole,
	grantablePermissions,
	hasCommitteePermission,
	hasPermission,
	hasPermissionSomewhere,
	NO_PERMISSIONS,
	PERMISSION_GROUPS,
	PERMISSION_KEYS,
	PERMISSIONS,
	permissionsOfGroup,
	PRESET_ROLES,
	withIncludedPermissions,
	type MyPermissions
} from './permissions';

/** An organiser: `administrator` held conference-wide, ranked first. */
const ORGANISER: MyPermissions = {
	held: [{ permission: 'administrator', scope: 'conference' }],
	committeeIds: [],
	rank: 0
};

/** A chair of one committee, holding the Chair preset's permissions per committee. */
const CHAIR: MyPermissions = {
	held: [
		{ permission: 'run_room', scope: 'committees' },
		{ permission: 'read_participants', scope: 'committees' },
		{ permission: 'send_announcements', scope: 'committees' }
	],
	committeeIds: ['committee-a'],
	rank: 3
};

/** Finance: a handful of conference-wide permissions, ranked second. */
const FINANCE: MyPermissions = {
	held: [
		{ permission: 'edit_conference', scope: 'conference' },
		{ permission: 'read_invoices', scope: 'conference' },
		{ permission: 'manage_invoices', scope: 'conference' }
	],
	committeeIds: [],
	rank: 1
};

describe('the catalogue', () => {
	it('has the twenty-one permissions of section 4, administrator first', () => {
		expect(PERMISSION_KEYS).toHaveLength(21);
		expect(PERMISSION_KEYS[0]).toBe('administrator');
	});

	it('puts every permission in one of the six groups, in group order', () => {
		const inGroupOrder = PERMISSION_GROUPS.flatMap((group) => permissionsOfGroup(group.key));

		expect(PERMISSION_GROUPS).toHaveLength(6);
		expect(inGroupOrder).toEqual(PERMISSION_KEYS);
	});

	it('narrows to committees exactly the permissions section 4 marks', () => {
		const perCommittee = PERMISSION_KEYS.filter((key) => PERMISSIONS[key].perCommittee);

		expect(perCommittee).toEqual([
			'manage_committees',
			'run_room',
			'review_papers',
			'write_chair_notes',
			'propose_awards',
			'answer_directives',
			'read_participants',
			'read_contact_details',
			'read_welfare_details',
			'edit_schedule',
			'send_announcements'
		]);
	});

	it('only names permissions that exist in the presets', () => {
		for (const role of PRESET_ROLES) {
			for (const key of role.permissions) {
				expect(PERMISSION_KEYS).toContain(key);
			}
		}
	});
});

describe('hasPermission', () => {
	it('answers yes for anything to an administrator', () => {
		expect(hasPermission(ORGANISER, 'manage_invoices')).toBe(true);
		expect(hasPermission(ORGANISER, 'run_room')).toBe(true);
	});

	it('answers yes only for what a role holds conference-wide', () => {
		expect(hasPermission(FINANCE, 'manage_invoices')).toBe(true);
		expect(hasPermission(FINANCE, 'manage_team')).toBe(false);
	});

	it('does not count a permission held per committee', () => {
		expect(hasPermission(CHAIR, 'run_room')).toBe(false);
	});

	it('answers no to somebody with no role', () => {
		expect(hasPermission(NO_PERMISSIONS, 'read_participants')).toBe(false);
	});
});

describe('hasCommitteePermission', () => {
	it('answers yes in the committees a chair is assigned to', () => {
		expect(hasCommitteePermission(CHAIR, 'committee-a', 'run_room')).toBe(true);
	});

	it('answers no in a committee the chair is not assigned to', () => {
		expect(hasCommitteePermission(CHAIR, 'committee-b', 'run_room')).toBe(false);
	});

	it('answers yes in every committee to somebody who holds it conference-wide', () => {
		expect(hasCommitteePermission(ORGANISER, 'committee-b', 'review_papers')).toBe(true);
	});

	it('answers no for a permission the chair does not hold', () => {
		expect(hasCommitteePermission(CHAIR, 'committee-a', 'review_papers')).toBe(false);
	});
});

describe('hasPermissionSomewhere', () => {
	it('counts a per-committee grant of a permission that narrows to committees', () => {
		expect(hasPermissionSomewhere(CHAIR, 'read_participants')).toBe(true);
	});

	it('does not count a per-committee grant of one that does not narrow', () => {
		const odd: MyPermissions = {
			held: [{ permission: 'read_invoices', scope: 'committees' }],
			committeeIds: ['committee-a'],
			rank: 4
		};

		expect(hasPermissionSomewhere(odd, 'read_invoices')).toBe(false);
	});

	it('counts a conference-wide grant', () => {
		expect(hasPermissionSomewhere(FINANCE, 'read_invoices')).toBe(true);
	});
});

describe('grantablePermissions', () => {
	it('lets an administrator give every permission', () => {
		expect(grantablePermissions(ORGANISER, 'conference')).toEqual(PERMISSION_KEYS);
	});

	it('lets somebody give only what they hold', () => {
		expect(grantablePermissions(FINANCE, 'conference')).toEqual([
			'edit_conference',
			'read_invoices',
			'manage_invoices'
		]);
	});

	it('lets a per-committee holder give it only on a per-committee role', () => {
		expect(grantablePermissions(CHAIR, 'conference')).toEqual([]);
		expect(grantablePermissions(CHAIR, 'committees')).toEqual([
			'run_room',
			'read_participants',
			'send_announcements'
		]);
	});
});

describe('canManageRole', () => {
	it('lets an administrator manage any role, even one above them', () => {
		expect(canManageRole({ ...ORGANISER, rank: 2 }, { position: 0 })).toBe(true);
	});

	it('lets anybody else manage only the roles below their highest', () => {
		expect(canManageRole(FINANCE, { position: 2 })).toBe(true);
		expect(canManageRole(FINANCE, { position: 1 })).toBe(false);
		expect(canManageRole(FINANCE, { position: 0 })).toBe(false);
	});

	it('lets somebody with no role manage nothing', () => {
		expect(canManageRole(NO_PERMISSIONS, { position: 99 })).toBe(false);
	});
});

describe('canChangeRole', () => {
	it('lets somebody change a role below them that holds only what they hold', () => {
		expect(
			canChangeRole(FINANCE, { position: 2, scope: 'conference', permissions: ['read_invoices'] })
		).toBe(true);
	});

	it('refuses a role below them that holds something they do not', () => {
		expect(
			canChangeRole(FINANCE, { position: 2, scope: 'conference', permissions: ['run_room'] })
		).toBe(false);
	});

	it('refuses a role at or above them, whatever it holds', () => {
		expect(canChangeRole(FINANCE, { position: 1, scope: 'conference', permissions: [] })).toBe(
			false
		);
	});

	it('lets an administrator change any role', () => {
		expect(
			canChangeRole(ORGANISER, { position: 0, scope: 'conference', permissions: ['administrator'] })
		).toBe(true);
	});
});

describe('withIncludedPermissions', () => {
	it('adds reading to deciding and seeing to managing invoices', () => {
		expect(withIncludedPermissions(['manage_invoices', 'decide_applications'])).toEqual([
			'read_applications',
			'decide_applications',
			'read_invoices',
			'manage_invoices'
		]);
	});

	it('keeps each permission once and in catalogue order', () => {
		expect(withIncludedPermissions(['read_invoices', 'manage_invoices', 'run_room'])).toEqual([
			'run_room',
			'read_invoices',
			'manage_invoices'
		]);
	});

	it('answers nothing for nothing', () => {
		expect(withIncludedPermissions([])).toEqual([]);
	});
});
