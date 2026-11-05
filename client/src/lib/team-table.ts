/**
 * The words in each cell of the team page's "People" table (the manage
 * redesign): Role, Committee and Title for one person.
 *
 * It lives in its own file rather than in `$lib/team.ts` because that module is
 * shared by the committee editor and the invitation code, and these cells are
 * only the team page's. Nothing here talks to Supabase.
 */

import { statusLabel } from '$lib/status';
import {
	isTeamAdministrator,
	teamCommitteesLine,
	teamRoleLabel,
	type OrganizationRole,
	type TeamPerson
} from '$lib/team';

/**
 * The words of one cell, and whether they are a stand-in ("All", "None") that
 * the table shows in grey rather than something the organiser typed or chose.
 */
export type TeamCell = {
	text: string;
	isQuiet: boolean;
};

/**
 * The colour of a cell's words: grey for a stand-in, dark for anything else.
 * Both class names are written out in full, because Tailwind only makes the
 * classes it can find written in the source.
 */
export function teamCellClass(cell: TeamCell): string {
	if (cell.isQuiet) {
		return 'text-muted-foreground';
	}

	return 'text-foreground';
}

/**
 * The organisation roles `statusLabel` has words for. `TeamPerson.organizationRole`
 * is checked against this list before `statusLabel` is asked about it.
 */
const ORGANIZATION_ROLE_NAMES: OrganizationRole[] = ['owner', 'admin', 'member'];

/**
 * The Roles column: the person's roles as words separated by commas, in the
 * conference's order ("Chair, Press"), or "Administrator" for an owner or
 * admin of the organisation (`teamRoleLabel`).
 */
export function teamTableRoleLabel(person: TeamPerson): string {
	return teamRoleLabel(person);
}

/**
 * The Committee column.
 *
 * Whoever chairs a committee has it named here ("UNSC, ECOFIN", or "Chairs
 * UNSC" for an organiser who chairs one too, as `teamCommitteesLine` writes
 * it). Otherwise anybody whose role is everything reads "All", because they
 * can work on every committee, and everybody else reads "None".
 */
export function teamCommitteeCell(person: TeamPerson): TeamCell {
	const chairedCommittees = teamCommitteesLine(person);

	if (chairedCommittees !== '') {
		return { text: chairedCommittees, isQuiet: false };
	}

	if (isTeamAdministrator(person)) {
		return { text: 'All', isQuiet: true };
	}

	return { text: 'None', isQuiet: true };
}

/**
 * The Title column.
 *
 * A member of the organisation has no conference title, so the cell says where
 * they come from instead, such as "Owner of Northbridge MUN Society". Anybody
 * else shows the title they were given, or "None".
 */
export function teamTitleCell(person: TeamPerson, organizationName: string): TeamCell {
	if (person.source === 'organization') {
		const organizationRole = ORGANIZATION_ROLE_NAMES.find(
			(role) => role === person.organizationRole
		);
		const roleWords = organizationRole
			? statusLabel('organization_role', organizationRole)
			: (person.organizationRole ?? '');

		return { text: `${roleWords} of ${organizationName}`, isQuiet: true };
	}

	if (person.title) {
		return { text: person.title, isQuiet: false };
	}

	return { text: 'None', isQuiet: true };
}
