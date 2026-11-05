/**
 * Where the participants list's menu leads for one participant. Kept apart from
 * `$lib/participants.ts` because it builds addresses with `$lib/urls.ts`, which
 * itself reads `$lib/participants.ts` for the list's own address.
 */

import type { DropdownItem } from '$lib/components/Dropdown.svelte';
import { EMPTY_ALLOCATION_QUERY } from '$lib/allocation';
import { mayFollowLink } from '$lib/manage-pages';
import type { MyPermissions } from '$lib/permissions';
import type { Participant } from '$lib/participants';
import {
	manageAllocationUrl,
	manageApplicationReviewUrl,
	manageDelegationReviewUrl,
	manageFeesInvoiceUrl
} from '$lib/urls';

/**
 * The links of one participant's menu, leaving out any that would lead
 * nowhere: "View application" only for somebody who applied on their own,
 * "View delegation" only for a delegation's member, and "View invoice" only
 * when there is one.
 *
 * "Change seat" opens the allocation grid with this seat's "Move" panel
 * already open, which is where a delegate is moved.
 *
 * A link to a page the reader's permissions do not open is left out too, so a
 * chair reading their committee's delegates gets no menu at all.
 */
export function participantLinks(
	conferenceSlug: string,
	participant: Participant,
	mine: MyPermissions
): DropdownItem[] {
	const links: DropdownItem[] = [];

	if (participant.applicationId !== null) {
		const href = manageApplicationReviewUrl(conferenceSlug, participant.applicationId);
		links.push({ label: 'View application', href });
	}

	if (participant.delegation !== null) {
		const href = manageDelegationReviewUrl(conferenceSlug, participant.delegation.id);
		links.push({ label: 'View delegation', href });
	}

	const moveQuery = {
		...EMPTY_ALLOCATION_QUERY,
		seat: participant.seatId,
		action: 'move' as const
	};
	links.push({ label: 'Change seat', href: manageAllocationUrl(conferenceSlug, moveQuery) });

	if (participant.invoice !== null) {
		const href = manageFeesInvoiceUrl(conferenceSlug, participant.invoice.id);
		links.push({ label: 'View invoice', href });
	}

	return links.filter((link) => link.href !== undefined && mayFollowLink(mine, link.href));
}
