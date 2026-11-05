/**
 * The line of facts under the team page's title, such as "11 people · 2
 * invitations waiting" (section 6 of `docs/roles-and-permissions.md` and its
 * design canvas).
 *
 * It lives in its own file rather than in `$lib/team.ts` because that module is
 * shared by the committee editor and the invitation code, and this line is
 * only the team page's. Nothing here talks to Supabase.
 */

/** "1 person" or "11 people". */
function peopleCount(count: number): string {
	return count === 1 ? '1 person' : `${count} people`;
}

/** "1 invitation waiting" or "2 invitations waiting": the plural is the only thing that changes. */
function waitingInvitations(count: number): string {
	if (count === 1) {
		return '1 invitation waiting';
	}

	return `${count} invitations waiting`;
}

/**
 * How many people are on the team and how many invitations nobody has
 * accepted yet. Invitations are left out when there are none, and a
 * conference with neither reads "Nobody on the team yet".
 *
 * Roles are not counted here: somebody can hold several, and the People table
 * names them, with a filter by role above it.
 */
export function teamSummarySentence(peopleTotal: number, waitingInviteCount: number): string {
	const parts: string[] = [];

	if (peopleTotal > 0) {
		parts.push(peopleCount(peopleTotal));
	}

	if (waitingInviteCount > 0) {
		parts.push(waitingInvitations(waitingInviteCount));
	}

	if (parts.length === 0) {
		return 'Nobody on the team yet';
	}

	return parts.join(' · ');
}
