/**
 * The sentence under the title of the organiser's participants page
 * (`/manage/[slug]/participants`): "9 delegates in 2 committees. 3 have not
 * paid and 3 papers are missing."
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import type { ParticipantTotals } from '$lib/participants';

/** "1 committee", "2 committees": a count with its noun. */
function countOf(count: number, singular: string, plural: string): string {
	return `${count} ${count === 1 ? singular : plural}`;
}

/** How many committees have at least one participant. */
function committeesWithParticipants(countByCommittee: Record<string, number>): number {
	const counts = Object.values(countByCommittee);

	return counts.filter((count) => count > 0).length;
}

/** "3 have not paid and 3 papers are missing.", or only the half that is not zero. */
function owedSentence(unpaidCount: number, missingPaperCount: number): string | null {
	const parts: string[] = [];

	if (unpaidCount > 0) {
		parts.push(unpaidCount === 1 ? '1 has not paid' : `${unpaidCount} have not paid`);
	}

	if (missingPaperCount > 0) {
		const papers = countOf(missingPaperCount, 'paper is', 'papers are');
		parts.push(`${papers} missing`);
	}

	if (parts.length === 0) {
		return null;
	}

	return `${parts.join(' and ')}.`;
}

/**
 * Where the participants stand, counted over all of them rather than the page
 * on screen. "Have not paid" counts unpaid invoices only, so somebody who has
 * not been billed yet is not among them.
 *
 * Returns `null` while nobody is seated, because the empty list already says
 * so. The second sentence is left out when nothing is owed or missing.
 */
export function participantsSummary(totals: ParticipantTotals): string | null {
	if (totals.participantCount === 0) {
		return null;
	}

	const delegates = countOf(totals.participantCount, 'delegate', 'delegates');
	const committeeCount = committeesWithParticipants(totals.countByCommittee);
	const committees = countOf(committeeCount, 'committee', 'committees');
	const seatedSentence = `${delegates} in ${committees}.`;
	const owed = owedSentence(totals.unpaidCount, totals.missingPaperCount);

	if (owed === null) {
		return seatedSentence;
	}

	return `${seatedSentence} ${owed}`;
}
