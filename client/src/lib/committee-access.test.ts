import { describe, expect, it } from 'vitest';
import { EMPTY_COMMITTEE_FORM } from './committee-details';
import {
	committeeEditorAccess,
	editableCommittees,
	mayUseCommitteeEditor,
	withAgendaOnly
} from './committee-access';
import type { MyPermissions, Permission } from './permissions';

/** One conference-wide role holding these permissions. */
function holding(...keys: Permission[]): MyPermissions {
	return {
		held: keys.map((permission) => ({ permission, scope: 'conference' })),
		committeeIds: [],
		rank: 1
	};
}

/** The Chair preset's committee permissions, assigned to committee `unsc`. */
const CHAIR: MyPermissions = {
	held: [
		{ permission: 'manage_committees', scope: 'committees' },
		{ permission: 'run_room', scope: 'committees' }
	],
	committeeIds: ['unsc'],
	rank: 2
};

describe('committeeEditorAccess', () => {
	it('gives a conference-wide editor every field, and the panels by their own permissions', () => {
		expect(committeeEditorAccess(holding('manage_committees'), 'unsc')).toEqual({
			isWholeEditor: true,
			mayManageChairs: false,
			mayOpenRoom: false
		});
		expect(committeeEditorAccess(holding('administrator'), 'unsc')).toEqual({
			isWholeEditor: true,
			mayManageChairs: true,
			mayOpenRoom: true
		});
	});

	it('gives a chair their agenda and their room, and nothing of the whole', () => {
		expect(committeeEditorAccess(CHAIR, 'unsc')).toEqual({
			isWholeEditor: false,
			mayManageChairs: false,
			mayOpenRoom: true
		});
		expect(committeeEditorAccess(CHAIR, 'who').mayOpenRoom).toBe(false);
	});
});

describe('mayUseCommitteeEditor', () => {
	it('lets a chair change their own agenda and nothing else', () => {
		expect(mayUseCommitteeEditor(CHAIR, 'unsc', 'agenda')).toBe(true);
		expect(mayUseCommitteeEditor(CHAIR, 'unsc', 'whole')).toBe(false);
		expect(mayUseCommitteeEditor(CHAIR, 'unsc', 'chairs')).toBe(false);
		expect(mayUseCommitteeEditor(CHAIR, 'who', 'agenda')).toBe(false);
	});

	it('gives the Chairs panel to a committee editor who also manages the team', () => {
		const editor = holding('manage_committees');

		expect(mayUseCommitteeEditor(editor, 'who', 'whole')).toBe(true);
		expect(mayUseCommitteeEditor(editor, 'who', 'chairs')).toBe(false);
		expect(
			mayUseCommitteeEditor(holding('manage_committees', 'manage_team'), 'who', 'chairs')
		).toBe(true);
		expect(mayUseCommitteeEditor(holding('manage_team'), 'who', 'chairs')).toBe(false);
	});
});

describe('editableCommittees', () => {
	const committees = [{ id: 'unsc' }, { id: 'who' }];

	it('lists every committee for a conference-wide editor and a chair’s own for a chair', () => {
		expect(editableCommittees(holding('manage_committees'), committees)).toEqual(committees);
		expect(editableCommittees(CHAIR, committees)).toEqual([{ id: 'unsc' }]);
		expect(editableCommittees(holding('run_room'), committees)).toEqual([]);
	});
});

describe('withAgendaOnly', () => {
	it('keeps the saved committee and takes only the description and the topics posted', () => {
		const saved = { ...EMPTY_COMMITTEE_FORM, name: 'Security Council', slug: 'unsc' };
		const posted = {
			...EMPTY_COMMITTEE_FORM,
			name: 'Renamed',
			description: 'Fifteen members.',
			topics: ['Cyber warfare']
		};

		expect(withAgendaOnly(saved, posted)).toEqual({
			...saved,
			description: 'Fifteen members.',
			topics: ['Cyber warfare']
		});
	});
});
