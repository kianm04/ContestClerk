/**
 * The words the organisers' delegations list writes about a delegation's
 * seats, on its table row and on its phone card.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import type { DelegationProgress } from '$lib/delegations';

/**
 * "10 of 12 given": the seats the organisers have reserved for the
 * delegation, out of the seats it asked for. A delegation still waiting for a
 * decision reads "0 of 12 given".
 */
export function seatsGivenText(progress: DelegationProgress): string {
	return `${progress.allocated} of ${progress.requested} given`;
}

/**
 * "6 assigned to members": of the seats given, how many the head has put a
 * member of the group in. The number is the same `assigned` that
 * `delegationProgress` counts.
 */
export function seatsAssignedText(progress: DelegationProgress): string {
	return `${progress.assigned} assigned to members`;
}
