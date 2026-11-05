import { describe, expect, it } from 'vitest';
import type { MyPermissions } from './permissions';
import {
	deleteRoleRefusal,
	permissionSections,
	readRoleForm,
	roleCountLine,
	roleTableRows,
	startFromRole,
	type RoleSummary
} from './roles';

/** A role at a place in the order, holding these permissions. */
function role(name: string, position: number, permissions: RoleSummary['permissions'] = []) {
	return {
		id: name,
		name,
		position,
		scope: 'conference',
		isPublic: false,
		permissions,
		memberCount: 0,
		invitationCount: 0
	} satisfies RoleSummary;
}

/** The reader: Deputy, second in the order, who may manage roles and read applications. */
const DEPUTY_READER: MyPermissions = {
	held: [
		{ permission: 'manage_roles', scope: 'conference' },
		{ permission: 'decide_applications', scope: 'conference' },
		{ permission: 'read_applications', scope: 'conference' }
	],
	committeeIds: [],
	rank: 1
};

const ADMINISTRATOR_READER: MyPermissions = {
	held: [{ permission: 'administrator', scope: 'conference' }],
	committeeIds: [],
	rank: -1
};

/** A posted form with these fields; repeated names are given as lists. */
function form(fields: Record<string, string | string[]>): FormData {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		for (const each of [value].flat()) {
			formData.append(name, each);
		}
	}

	return formData;
}

describe('roleTableRows', () => {
	it('offers a move only between two roles the reader may change', () => {
		const roles = [
			role('Organiser', 0, ['administrator']),
			role('Deputy', 1, ['manage_roles']),
			role('Chair', 2, ['run_room']),
			role('Desk', 3),
			role('Press', 4)
		];

		expect(
			roleTableRows(DEPUTY_READER, roles).map((row) => [
				row.name,
				row.canEdit,
				row.canMoveUp,
				row.canMoveDown
			])
		).toEqual([
			['Organiser', false, false, false],
			['Deputy', false, false, false],
			// Chair runs a room and the deputy cannot, so it is theirs to give
			// but not to change, and Desk cannot swap with it.
			['Chair', false, false, false],
			['Desk', true, false, true],
			['Press', true, true, false]
		]);
	});

	it('says why a row has no actions', () => {
		const roles = [
			role('Organiser', 0, ['administrator']),
			role('Deputy', 1, ['manage_roles']),
			role('Chair', 2, ['run_room']),
			role('Desk', 3)
		];

		expect(roleTableRows(DEPUTY_READER, roles).map((row) => row.note)).toEqual([
			'Above your role',
			'Your role',
			'Holds permissions you do not have',
			''
		]);
	});

	it('lets an administrator move anything but the ends', () => {
		const rows = roleTableRows(ADMINISTRATOR_READER, [role('A', 0), role('B', 1)]);

		expect(rows.map((row) => [row.canMoveUp, row.canMoveDown])).toEqual([
			[false, true],
			[true, false]
		]);
	});
});

describe('roleCountLine', () => {
	it('counts members and invitations', () => {
		expect(roleCountLine(4, 1)).toBe('4 members · 1 invitation');
		expect(roleCountLine(1, 0)).toBe('1 member');
		expect(roleCountLine(0, 2)).toBe('No members · 2 invitations');
		expect(roleCountLine(0, 0)).toBe('No members');
	});
});

describe('deleteRoleRefusal', () => {
	it('says what to do first, and nothing for an empty role', () => {
		expect(deleteRoleRefusal(4, 1)).toBe(
			'To delete this role, first take it off its 4 members and withdraw its invitation on the team page.'
		);
		expect(deleteRoleRefusal(0, 2)).toBe(
			'To delete this role, first withdraw its 2 invitations on the team page.'
		);
		expect(deleteRoleRefusal(0, 0)).toBeNull();
	});
});

describe('startFromRole', () => {
	it('copies the scope and the permissions the reader may give, but not the name', () => {
		const source = { ...role('Finance', 3, ['read_applications', 'manage_invoices']) };

		expect(startFromRole(DEPUTY_READER, source)).toEqual({
			name: '',
			scope: 'conference',
			isPublic: false,
			permissions: ['read_applications']
		});
	});

	it('is blank without a role', () => {
		expect(startFromRole(DEPUTY_READER, undefined).permissions).toEqual([]);
	});
});

describe('permissionSections', () => {
	/** The line for one permission. */
	function line(sections: ReturnType<typeof permissionSections>, key: string) {
		return sections.flatMap((section) => section.lines).find((each) => each.key === key);
	}

	it('draws the six groups of section 4', () => {
		expect(
			permissionSections(DEPUTY_READER, { scope: 'conference', permissions: [] }).map(
				(section) => section.title
			)
		).toEqual([
			'Conference',
			'Committees and rooms',
			'Applications',
			'Participants and private details',
			'Money',
			'Programme and communication'
		]);
	});

	it('disables what the reader does not hold, and what a ticked permission includes', () => {
		const sections = permissionSections(DEPUTY_READER, {
			scope: 'conference',
			permissions: ['decide_applications']
		});

		expect(line(sections, 'run_room')).toMatchObject({
			isDisabled: true,
			isChecked: false,
			aside: 'You do not have this yourself'
		});
		expect(line(sections, 'read_applications')).toMatchObject({
			isDisabled: true,
			isChecked: true,
			aside: 'Included in Decide applications'
		});
		expect(line(sections, 'decide_applications')).toMatchObject({
			isDisabled: false,
			isChecked: true,
			aside: ''
		});
	});

	it('ticks and disables everything else under Administrator', () => {
		const sections = permissionSections(ADMINISTRATOR_READER, {
			scope: 'conference',
			permissions: ['administrator']
		});

		expect(line(sections, 'administrator')).toMatchObject({ isChecked: true, isDisabled: false });
		expect(line(sections, 'manage_documents')).toMatchObject({
			isChecked: true,
			isDisabled: true,
			aside: 'Included in Administrator'
		});
	});

	it('says when a ticked permission does nothing on a per-committee role', () => {
		const sections = permissionSections(ADMINISTRATOR_READER, {
			scope: 'committees',
			permissions: ['manage_documents', 'run_room']
		});

		expect(line(sections, 'manage_documents')?.aside).toBe('No effect per committee');
		expect(line(sections, 'run_room')?.aside).toBe('');
		expect(line(sections, 'run_room')?.isPerCommittee).toBe(true);
	});
});

describe('readRoleForm', () => {
	it('reads the fields, adding what a ticked permission includes', () => {
		const reading = readRoleForm(
			form({
				name: '  Registration desk ',
				scope: 'committees',
				isPublic: 'on',
				permission: ['decide_applications']
			}),
			DEPUTY_READER,
			['Chair']
		);

		expect(reading.errors).toEqual({});
		expect(reading.values).toEqual({
			name: 'Registration desk',
			scope: 'committees',
			isPublic: true,
			permissions: ['read_applications', 'decide_applications']
		});
	});

	it('drops permissions the reader may not give, and keys that are none', () => {
		const reading = readRoleForm(
			form({ name: 'Desk', permission: ['run_room', 'sing', 'read_applications'] }),
			DEPUTY_READER,
			[]
		);

		expect(reading.values.permissions).toEqual(['read_applications']);
		expect(reading.values.isPublic).toBe(false);
		expect(reading.values.scope).toBe('conference');
	});

	it('keeps Administrator alone, since it stands for the rest', () => {
		const reading = readRoleForm(
			form({ name: 'Lead', permission: ['administrator', 'run_room'] }),
			ADMINISTRATOR_READER,
			[]
		);

		expect(reading.values.permissions).toEqual(['administrator']);
	});

	it('asks for a name, at most 40 characters, that no other role has', () => {
		expect(readRoleForm(form({ name: ' ' }), DEPUTY_READER, []).errors.name).toBe(
			'Give the role a name.'
		);
		expect(readRoleForm(form({ name: 'x'.repeat(41) }), DEPUTY_READER, []).errors.name).toBe(
			'Keep the name to 40 characters.'
		);
		expect(readRoleForm(form({ name: 'chair' }), DEPUTY_READER, ['Chair']).errors.name).toBe(
			'There is already a role called chair.'
		);
	});
});
