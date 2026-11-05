/**
 * What the participants list shows to whom (`docs/roles-and-permissions.md`,
 * sections 4 and 8). `read_participants` opens the page and its export, and
 * applies per committee: a chair sees the delegates of their own committees.
 * The columns beyond name, school, seat and delegation follow other
 * permissions, and are left out, never drawn empty, for a reader without them.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import { mayReadInvoices } from '$lib/fees-access';
import { mayOpenManagePage, type ManagePage } from '$lib/manage-pages';
import {
	hasCommitteePermission,
	hasPermission,
	hasPermissionSomewhere,
	type MyPermissions
} from '$lib/permissions';
import { hiddenDetailHeadings, privateDetailsAccess } from '$lib/private-details';
import type { Participant, ParticipantQuery, ParticipantTotals } from '$lib/participants';

/** Which of the list's optional columns, with their filters, this reader sees. */
export type ParticipantColumns = {
	/** Email and phone, with `read_contact_details`. */
	contact: boolean;
	/** Date of birth, dietary requirements and the emergency contact, with `read_welfare_details`. */
	welfare: boolean;
	/** The invoice column, its filter and "have not paid". */
	invoice: boolean;
	/** The paper column, its filter and "papers are missing". */
	paper: boolean;
	/** The row's menu and buttons. */
	actions: boolean;
	/** "Remove from seat", which frees the seat as the allocation grid does. */
	canRemove: boolean;
};

/** The pages a row's menu leads to; a reader who may open none of them gets no menu. */
const ROW_LINK_PAGES: ManagePage[] = ['applications', 'delegations', 'allocation', 'fees'];

/**
 * The columns this reader sees.
 *
 * Payment status needs `read_invoices`, which `manage_invoices` includes, and
 * the papers need `review_papers`, which is what lets anybody read them.
 * "Remove from seat" needs `decide_applications` on the whole conference,
 * which is what `revoke_seat` asks before it frees a seat; opening the
 * allocation grid asks less, and a button the database would refuse is not
 * offered.
 */
export function participantColumns(mine: MyPermissions): ParticipantColumns {
	const canRemove = hasPermission(mine, 'decide_applications');

	return {
		...privateDetailsAccess(mine),
		invoice: mayReadInvoices(mine),
		paper: hasPermissionSomewhere(mine, 'review_papers'),
		actions: canRemove || ROW_LINK_PAGES.some((page) => mayOpenManagePage(mine, page)),
		canRemove
	};
}

/** The participants of the committees where the reader holds `read_participants`. */
export function participantsReaderMaySee(
	participants: Participant[],
	mine: MyPermissions
): Participant[] {
	return participants.filter((participant) =>
		hasCommitteePermission(mine, participant.committee.id, 'read_participants')
	);
}

/** The query with any filter on a column the reader does not see taken off. */
export function queryForColumns(
	query: ParticipantQuery,
	columns: ParticipantColumns
): ParticipantQuery {
	return {
		...query,
		invoice: columns.invoice ? query.invoice : '',
		paper: columns.paper ? query.paper : ''
	};
}

/** The totals with the counts of columns the reader does not see set to nothing. */
export function totalsForColumns(
	totals: ParticipantTotals,
	columns: ParticipantColumns
): ParticipantTotals {
	return {
		...totals,
		unpaidCount: columns.invoice ? totals.unpaidCount : 0,
		missingPaperCount: columns.paper ? totals.missingPaperCount : 0
	};
}

/** The CSV's headings this reader's file leaves out. */
export function hiddenParticipantCsvHeadings(mine: MyPermissions): string[] {
	const columns = participantColumns(mine);
	const hidden = hiddenDetailHeadings(privateDetailsAccess(mine), {
		contact: ['Email', 'Phone'],
		welfare: [
			'Date of birth',
			'Age at conference',
			'Dietary requirements',
			'Emergency contact name',
			'Emergency contact phone'
		]
	});

	if (!columns.invoice) {
		hidden.push('Invoice number', 'Invoice status', 'Paid at');
	}

	if (!columns.paper) {
		hidden.push('Paper status');
	}

	return hidden;
}

/** What every row of the list needs besides its participant. */
export type ParticipantListView = {
	conferenceSlug: string;
	/** Where "Remove from seat" posts, with the list's filters kept in it. */
	removeAction: string;
	columns: ParticipantColumns;
	/** The reader's permissions, which decide the links of a row's menu. */
	permissions: MyPermissions;
};
