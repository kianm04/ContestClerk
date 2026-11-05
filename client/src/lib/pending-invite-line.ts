/**
 * The quiet line under each address in the team page's "Waiting to accept"
 * list, such as "Chair · UNSC · expires 14 Oct 2026".
 *
 * It lives in its own file rather than in `$lib/team.ts` because that module is
 * shared by the committee editor and the invitation code, and this line is only
 * the team page's. Nothing here talks to Supabase.
 */

import { dayInTimezone, formatDateRange } from '$lib/dates';
import type { PendingStaffInvite } from '$lib/team';

/**
 * "Chair · UNSC · expires 14 Oct 2026", or "… · expired 28 Sept 2026" once the
 * invitation has run out, with whichever parts an invitation has. The role is
 * named as the conference named it, because an invitation hands over one of
 * the conference's own roles.
 *
 * The day is taken in UTC rather than in the conference's timezone, because
 * an invitation belongs to no conference's clock: it simply runs out
 * fourteen days after it was written. Handing `formatDateRange` the same day
 * twice writes it as a single date, which is what `formatConferenceDay` in
 * `$lib/manage.ts` does for a conference's own dates.
 */
export function pendingInviteDetailLine(invite: PendingStaffInvite, isExpired: boolean): string {
	const expiryDay = dayInTimezone(new Date(invite.expiresAt), 'UTC');
	const expiryWords = formatDateRange(expiryDay, expiryDay);
	const parts = [invite.roleName];

	if (invite.committeeName) {
		parts.push(invite.committeeName);
	}

	if (isExpired) {
		parts.push(`expired ${expiryWords}`);
	} else {
		parts.push(`expires ${expiryWords}`);
	}

	return parts.join(' · ');
}
