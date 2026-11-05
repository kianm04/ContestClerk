/**
 * Which private details a reader may see (`docs/roles-and-permissions.md`,
 * sections 4 and 5): email and phone with `read_contact_details`; date of
 * birth, dietary requirements and the emergency contact with
 * `read_welfare_details`.
 *
 * The database decides which people's details come back, through the views
 * `staff_contact_details` and `staff_welfare_details`. These let a page or a
 * CSV leave out a column the reader may not see, rather than draw it empty.
 *
 * The views answer for anybody taking part in a conference where the reader
 * holds the permission, and a reader can hold it on one conference and not
 * another. A page is about one conference, so what the views answered is also
 * cut down here to what the reader holds on that conference
 * (`withheldPrivateDetails`), before a row reaches the browser.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import {
	hasCommitteePermission,
	hasPermissionSomewhere,
	type MyPermissions
} from '$lib/permissions';

/** The two halves of the private details, and whether this reader sees each. */
export type PrivateDetailsAccess = {
	/** Email and phone. */
	contact: boolean;
	/** Date of birth (and so age), dietary requirements and the emergency contact. */
	welfare: boolean;
};

/**
 * What this reader may see. Both permissions apply per committee, so a chair
 * who holds one on their committee sees the column, and the views fill it in
 * for their own committee's people only.
 */
export function privateDetailsAccess(mine: MyPermissions): PrivateDetailsAccess {
	return {
		contact: hasPermissionSomewhere(mine, 'read_contact_details'),
		welfare: hasPermissionSomewhere(mine, 'read_welfare_details')
	};
}

/**
 * What this reader may see of one person seated in `committeeId`, which is
 * exactly what the two views grant for this conference: a permission held on
 * the whole conference, or held per committee in this one. The participants
 * list asks this for every row.
 */
export function privateDetailsAccessIn(
	mine: MyPermissions,
	committeeId: string
): PrivateDetailsAccess {
	return {
		contact: hasCommitteePermission(mine, committeeId, 'read_contact_details'),
		welfare: hasCommitteePermission(mine, committeeId, 'read_welfare_details')
	};
}

/** The private details a row of the team's pages carries, each `null` when not shown. */
export type PrivateDetailFields = {
	email: string | null;
	phone: string | null;
	/** `YYYY-MM-DD`, or `null`. */
	dateOfBirth: string | null;
	dietaryRequirements: string | null;
	emergencyContactName: string | null;
	emergencyContactPhone: string | null;
};

/**
 * `row` with every private detail this access does not grant set to `null`,
 * and everything else as it was. The generic `Row` is so that a participant's
 * row and an applicant's details both come back as the type they went in as.
 */
export function withheldPrivateDetails<Row extends PrivateDetailFields>(
	row: Row,
	access: PrivateDetailsAccess
): Row {
	return {
		...row,
		email: access.contact ? row.email : null,
		phone: access.contact ? row.phone : null,
		dateOfBirth: access.welfare ? row.dateOfBirth : null,
		dietaryRequirements: access.welfare ? row.dietaryRequirements : null,
		emergencyContactName: access.welfare ? row.emergencyContactName : null,
		emergencyContactPhone: access.welfare ? row.emergencyContactPhone : null
	};
}

/**
 * The CSV headings to leave out for this reader, from an export's own contact
 * and welfare headings. A file leaves the columns out rather than writing
 * blank cells, so it does not advertise what it hides.
 */
export function hiddenDetailHeadings(
	access: PrivateDetailsAccess,
	headings: { contact: string[]; welfare: string[] }
): string[] {
	return [...(access.contact ? [] : headings.contact), ...(access.welfare ? [] : headings.welfare)];
}
