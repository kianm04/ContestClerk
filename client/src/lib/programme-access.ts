/**
 * Who may do what on the programme and announcements pages
 * (`docs/roles-and-permissions.md`, sections 4 and 8, step 7).
 *
 * `edit_schedule` and `send_announcements` both narrow to committees: held
 * conference-wide they cover every audience, held on a role that applies per
 * committee they cover what is addressed to one of the reader's own
 * committees and nothing else. Both pages ask the same question of an event
 * and of an announcement, so it is answered once here.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import type { AudienceChoice } from '$lib/announcement-form';
import { hasCommitteePermission, hasPermission, type MyPermissions } from '$lib/permissions';

/** The two permissions that address an audience. */
export type AddressingPermission = 'edit_schedule' | 'send_announcements';

/** Anything addressed to an audience, which may be one committee. */
export type Addressed = {
	audience: string;
	/** The committee when `audience` is `committee`; `null` or `''` otherwise. */
	committeeId: string | null;
};

/**
 * May the reader write something for this audience? Anywhere with the
 * permission conference-wide; one committee with it in that committee.
 * The database's policies on `schedule_events` and `announcements`.
 */
export function mayAddress(
	mine: MyPermissions,
	addressed: Addressed,
	key: AddressingPermission
): boolean {
	if (hasPermission(mine, key)) {
		return true;
	}

	return (
		addressed.audience === 'committee' &&
		Boolean(addressed.committeeId) &&
		hasCommitteePermission(mine, addressed.committeeId ?? '', key)
	);
}

/** The committees the reader may address with `key`, in the order given. */
export function committeesPermitting<Committee extends { id: string }>(
	mine: MyPermissions,
	committees: Committee[],
	key: AddressingPermission
): Committee[] {
	return committees.filter((committee) => hasCommitteePermission(mine, committee.id, key));
}

/**
 * May the reader edit, pin or delete this announcement? Anybody who may
 * announce conference-wide, and its author while they may still address its
 * audience.
 */
export function mayChangeAnnouncement(
	mine: MyPermissions,
	announcement: Addressed & { authorId: string | null },
	userId: string
): boolean {
	if (hasPermission(mine, 'send_announcements')) {
		return true;
	}

	return announcement.authorId === userId && mayAddress(mine, announcement, 'send_announcements');
}

/**
 * The audience a new announcement starts on. A reader who may announce only
 * to their committees starts on "One committee", whatever the address asked
 * for, because it is the one choice their form offers.
 */
export function audienceChoiceForReader(
	choice: AudienceChoice,
	mine: MyPermissions
): AudienceChoice {
	if (hasPermission(mine, 'send_announcements') || choice.audience === 'committee') {
		return choice;
	}

	return { ...choice, audience: 'committee' };
}
