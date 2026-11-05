/**
 * What the buttons in a staff row's "Manage" panel on `/manage/[slug]/team`
 * change, worked out in the browser so the row changes the moment one is
 * pressed rather than once the server has answered (T142). Mirrors
 * `updateTitle`, `assignCommittee`, `unassignCommittee` and `removeStaff` in `routes/manage/[slug]/team/+page.server.ts`, including the
 * refusals the page can see coming, so a press the server will turn down
 * changes nothing on screen first.
 *
 * `StaffTable` keeps one instant form (`createInstantForm` in
 * `$lib/instant-form.svelte.ts`) for every row and draws the people with
 * `teamPeopleAfterPresses`.
 */
import type { InstantPress } from '$lib/instant-form.svelte';
import { pressedAction, pressedField, type PressedForm } from '$lib/row-changes';
import {
	STAFF_TITLE_MAX_LENGTH,
	holdsCommitteeRole,
	type TeamCommittee,
	type TeamPerson
} from '$lib/team';

/** What one press changes about one person on the team. */
export type StaffChange =
	| { kind: 'title'; userId: string; title: string | null }
	| { kind: 'assign'; userId: string; committee: TeamCommittee }
	| { kind: 'unassign'; userId: string; committeeId: string }
	| { kind: 'remove'; userId: string };

/** One press of the team list, and the change it is expected to make. */
export type StaffPress = InstantPress<StaffChange>;

/**
 * What a press will change, read from its fields and the people and
 * committees the page shows right now. Null for a press the server will
 * refuse for a reason the page can see: an unknown person or committee, a
 * title that is too long, a committee for somebody with no role that works
 * per committee, or removing an organisation member.
 *
 * Roles are not here: "Edit roles" is a dialog that saves and reloads.
 */
export function expectStaffChange(
	input: PressedForm,
	people: TeamPerson[],
	committees: TeamCommittee[]
): StaffChange | null {
	const action = pressedAction(input.action);
	const userId = pressedField(input.formData, 'userId');
	const person = people.find((one) => one.userId === userId);

	if (!person) return null;

	if (action === '?/updateTitle') {
		const title = pressedField(input.formData, 'title');

		if (title.length > STAFF_TITLE_MAX_LENGTH) return null;

		// An empty box clears the title, the way the action saves it.
		return { kind: 'title', userId, title: title === '' ? null : title };
	}

	if (action === '?/removeStaff') {
		return person.source === 'staff' ? { kind: 'remove', userId } : null;
	}

	const committeeId = pressedField(input.formData, 'committeeId');
	const committee = committees.find((one) => one.id === committeeId);

	if (!committee) return null;
	if (action === '?/unassignCommittee') return { kind: 'unassign', userId, committeeId };
	// `assignCommittee` gives a committee only to somebody holding a role that
	// works per committee, the way the Chair preset does.
	if (action === '?/assignCommittee' && holdsCommitteeRole(person)) {
		return { kind: 'assign', userId, committee };
	}

	return null;
}

/**
 * `person`'s committees with `committee` added, in the conference's own
 * order, which is the order `committees` lists them in. A committee they
 * already chair is not added twice.
 */
function withCommittee(
	person: TeamPerson,
	committee: TeamCommittee,
	committees: TeamCommittee[]
): TeamCommittee[] {
	const chairedIds = person.committees.map((one) => one.id);
	chairedIds.push(committee.id);

	return committees.filter((one) => chairedIds.includes(one.id));
}

/** `person` as they will be once `change` is saved. */
function personAfterChange(
	person: TeamPerson,
	change: StaffChange,
	committees: TeamCommittee[]
): TeamPerson {
	if (change.kind === 'title') return { ...person, title: change.title };

	if (change.kind === 'assign') {
		return { ...person, committees: withCommittee(person, change.committee, committees) };
	}

	if (change.kind === 'unassign') {
		const keptCommittees = person.committees.filter((one) => one.id !== change.committeeId);

		return { ...person, committees: keptCommittees };
	}

	return person;
}

/**
 * The people with the presses still on their way laid on top, oldest first.
 * `committees` is every committee of the conference, which gives an assigned
 * committee its place in the person's list.
 */
export function teamPeopleAfterPresses(
	people: TeamPerson[],
	committees: TeamCommittee[],
	presses: StaffPress[]
): TeamPerson[] {
	let shown = people;

	for (const press of presses) {
		const change = press.expected;

		if (change === null) continue;

		if (change.kind === 'remove') {
			shown = shown.filter((person) => person.userId !== change.userId);
			continue;
		}

		shown = shown.map((person) =>
			person.userId === change.userId ? personAfterChange(person, change, committees) : person
		);
	}

	return shown;
}

/** What did not happen when a press failed, for its toast. */
export function describeStaffFailure(press: StaffPress): string {
	const action = pressedAction(press.action);

	if (action === '?/updateTitle') return 'The title was not saved.';
	if (action === '?/assignCommittee') return 'The committee was not assigned.';
	if (action === '?/unassignCommittee') return 'The committee was not taken off.';
	if (action === '?/removeStaff') return 'They were not removed from the team.';

	return 'The team was not changed.';
}
