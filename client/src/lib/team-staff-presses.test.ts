import { describe, expect, it } from 'vitest';
import {
	describeStaffFailure,
	expectStaffChange,
	teamPeopleAfterPresses,
	type StaffPress
} from './team-staff-presses';
import type { TeamCommittee, TeamPerson, TeamRole } from './team';

const UNSC: TeamCommittee = { id: 'c-unsc', name: 'Security Council', abbreviation: 'UNSC' };
const ECOFIN: TeamCommittee = { id: 'c-ecofin', name: 'ECOFIN', abbreviation: null };

/** Every committee of the conference, in the conference's own order. */
const COMMITTEES = [UNSC, ECOFIN];

/** Two of the roles every conference starts with. */
const CHAIR_ROLE: TeamRole = {
	id: 'r-chair',
	name: 'Chair',
	position: 1,
	scope: 'committees',
	isPublic: true,
	isAdministrator: false
};

const VOLUNTEER_ROLE: TeamRole = {
	id: 'r-volunteer',
	name: 'Volunteer',
	position: 2,
	scope: 'conference',
	isPublic: false,
	isAdministrator: false
};

/** A chair of ECOFIN. */
const CHAIR: TeamPerson = {
	userId: 'u-chair',
	fullName: 'Ana Silva',
	avatarPath: null,
	source: 'staff',
	roles: [CHAIR_ROLE],
	organizationRole: null,
	title: 'Head chair',
	committees: [ECOFIN]
};

/** A volunteer, who may not chair a committee. */
const VOLUNTEER: TeamPerson = {
	...CHAIR,
	userId: 'u-volunteer',
	roles: [VOLUNTEER_ROLE],
	title: null,
	committees: []
};

/** A member of the organisation, who is on the list without a staff row. */
const ORGANISATION_MEMBER: TeamPerson = {
	...CHAIR,
	userId: 'u-owner',
	source: 'organization',
	roles: [],
	organizationRole: 'owner',
	title: null,
	committees: []
};

const PEOPLE = [CHAIR, VOLUNTEER, ORGANISATION_MEMBER];

/** A press of `action` with `fields`, the way a staff row's forms send it. */
function pressInput(action: string, fields: Record<string, string>) {
	const formData = new FormData();
	for (const [name, value] of Object.entries(fields)) formData.set(name, value);

	return { action: new URL(`http://localhost/manage/mun-2027/team${action}`), formData };
}

/** A press still on its way, with the change `expectStaffChange` gave it. */
function pressOf(action: string, fields: Record<string, string>): StaffPress {
	const input = pressInput(action, fields);

	return { id: 1, ...input, expected: expectStaffChange(input, PEOPLE, COMMITTEES) };
}

/** The people once `press` has been laid on top. */
function afterPress(press: StaffPress): TeamPerson[] {
	return teamPeopleAfterPresses(PEOPLE, COMMITTEES, [press]);
}

/** The person called `userId` in `people`. */
function personIn(people: TeamPerson[], userId: string): TeamPerson | undefined {
	return people.find((person) => person.userId === userId);
}

describe('expectStaffChange', () => {
	it('reads each of the four actions', () => {
		const expectations = [
			pressOf('?/updateTitle', { userId: 'u-chair', title: 'Secretary General' }).expected,
			pressOf('?/assignCommittee', { userId: 'u-chair', committeeId: 'c-unsc' }).expected,
			pressOf('?/unassignCommittee', { userId: 'u-chair', committeeId: 'c-ecofin' }).expected,
			pressOf('?/removeStaff', { userId: 'u-chair' }).expected
		];

		expect(expectations).toEqual([
			{ kind: 'title', userId: 'u-chair', title: 'Secretary General' },
			{ kind: 'assign', userId: 'u-chair', committee: UNSC },
			{ kind: 'unassign', userId: 'u-chair', committeeId: 'c-ecofin' },
			{ kind: 'remove', userId: 'u-chair' }
		]);
	});

	it('expects nothing for a press the server will refuse', () => {
		const refused = [
			pressOf('?/updateTitle', { userId: 'u-nobody', title: 'Press' }),
			// Roles are saved by the "Edit roles" dialog, which reloads instead.
			pressOf('?/changeRole', { userId: 'u-chair', roleId: 'r-organiser' }),
			pressOf('?/updateTitle', { userId: 'u-chair', title: 'x'.repeat(41) }),
			pressOf('?/assignCommittee', { userId: 'u-volunteer', committeeId: 'c-unsc' }),
			pressOf('?/assignCommittee', { userId: 'u-chair', committeeId: 'c-other' }),
			pressOf('?/removeStaff', { userId: 'u-owner' }),
			pressOf('?/somethingElse', { userId: 'u-chair' })
		];

		expect(refused.map((press) => press.expected)).toEqual([
			null,
			null,
			null,
			null,
			null,
			null,
			null
		]);
	});

	it('gives no committee to somebody from the organisation, whom the page cannot change', () => {
		const press = pressOf('?/assignCommittee', { userId: 'u-owner', committeeId: 'c-unsc' });

		expect(press.expected).toBeNull();
	});
});

describe('teamPeopleAfterPresses', () => {
	it('clears the title when the box was left empty', () => {
		const shown = afterPress(pressOf('?/updateTitle', { userId: 'u-chair', title: '' }));

		expect(personIn(shown, 'u-chair')?.title).toBeNull();
	});

	it("puts an assigned committee in the conference's own order, once", () => {
		const assign = pressOf('?/assignCommittee', { userId: 'u-chair', committeeId: 'c-unsc' });
		const shown = teamPeopleAfterPresses(PEOPLE, COMMITTEES, [assign, assign]);

		expect(personIn(shown, 'u-chair')?.committees).toEqual([UNSC, ECOFIN]);
	});

	it('takes one committee off and removes a person', () => {
		const unassign = pressOf('?/unassignCommittee', {
			userId: 'u-chair',
			committeeId: 'c-ecofin'
		});
		const remove = pressOf('?/removeStaff', { userId: 'u-volunteer' });
		const shown = teamPeopleAfterPresses(PEOPLE, COMMITTEES, [unassign, remove]);

		expect(personIn(shown, 'u-chair')?.committees).toEqual([]);
		expect(personIn(shown, 'u-volunteer')).toBeUndefined();
	});

	it('leaves everybody alone for a press that expects nothing', () => {
		const shown = afterPress(pressOf('?/removeStaff', { userId: 'u-owner' }));

		expect(shown).toEqual(PEOPLE);
	});
});

describe('describeStaffFailure', () => {
	it('names what did not happen for each action', () => {
		const sentences = [
			'?/updateTitle',
			'?/assignCommittee',
			'?/unassignCommittee',
			'?/removeStaff',
			'?/other'
		].map((action) => describeStaffFailure(pressOf(action, { userId: 'u-chair' })));

		expect(sentences).toEqual([
			'The title was not saved.',
			'The committee was not assigned.',
			'The committee was not taken off.',
			'They were not removed from the team.',
			'The team was not changed.'
		]);
	});
});
