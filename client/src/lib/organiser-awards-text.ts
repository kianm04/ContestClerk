/**
 * The counted words of the organiser's awards page (`/manage/[slug]/awards`):
 * the sentence under the title, the publish button, and the reminder of what
 * is still unconfirmed above it.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import type { AwardCounts } from '$lib/awards';

/** "1 award", "3 awards": a count with its noun. */
function awardCount(count: number): string {
	return `${count} ${count === 1 ? 'award' : 'awards'}`;
}

/**
 * "2 confirmed · 3 proposed · not published yet". Once published, the end says
 * when instead: "· published 15 Feb 2027, 17:00", where `publishedMoment` is
 * that moment already written out in the conference's timezone.
 */
export function awardsSummary(
	counts: Pick<AwardCounts, 'confirmed' | 'proposed'>,
	publishedMoment: string | null
): string {
	const publishedText =
		publishedMoment === null ? 'not published yet' : `published ${publishedMoment}`;

	return `${counts.confirmed} confirmed · ${counts.proposed} proposed · ${publishedText}`;
}

/**
 * The words on the publish button: "Publish 2 awards". With none confirmed it
 * reads "Publish awards", and the server refuses with its own message, which
 * says to confirm one first.
 */
export function publishAwardsLabel(confirmedCount: number): string {
	if (confirmedCount === 0) {
		return 'Publish awards';
	}

	return `Publish ${awardCount(confirmedCount)}`;
}

/**
 * "3 awards are still unconfirmed.", the end of the publish block's
 * explanation, or `null` when every award is confirmed. Proposals are left out
 * of what is published, so this is what the organiser would leave behind.
 */
export function unconfirmedAwardsText(proposedCount: number): string | null {
	if (proposedCount === 0) {
		return null;
	}

	const verb = proposedCount === 1 ? 'is' : 'are';

	return `${awardCount(proposedCount)} ${verb} still unconfirmed.`;
}
