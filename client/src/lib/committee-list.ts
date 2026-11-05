/**
 * The words and the column layout of the organiser's committees list,
 * `/manage/[slug]/committees`, which the manage redesign draws as a table: one
 * row per committee with its level, topics, seats, chairs and background guide.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */
import type { ManagedCommittee } from '$lib/committees';

/**
 * The columns of the list from `xl` up, shared by the heading row and every
 * committee row so that they line up: the drag handle and arrows, then the
 * committee, level, topics, seats, chairs, background guide and the links.
 *
 * Only the committee's own column stretches. `minmax(0,1fr)` lets it be
 * narrower than a long name, which then wraps instead of pushing the other
 * columns out of line. Below `xl` eight columns do not fit beside the sidebar,
 * so each row stacks its facts under the name instead.
 *
 * Written out in full, because Tailwind reads class names out of this file.
 */
export const COMMITTEE_COLUMNS_CLASS =
	'xl:grid-cols-[5.75rem_minmax(0,1fr)_7rem_4.25rem_4rem_8rem_8.75rem_7rem]';

/**
 * "1 committee" or "8 committees": the count and the right form of the word.
 * Only for words that take an "s", which every word these pages count does.
 */
export function countedWord(count: number, word: string): string {
	if (count === 1) {
		return `1 ${word}`;
	}

	return `${count} ${word}s`;
}

/** The line under the page's title: "2 committees · 11 seats". */
export function committeesSummary(committeeCount: number, seatTotal: number): string {
	return `${countedWord(committeeCount, 'committee')} · ${countedWord(seatTotal, 'seat')}`;
}

/**
 * The quiet line under a committee's name: its short name and its room,
 * "HRC · Room 1". Either half is left out when the committee has none, and
 * the line is empty when it has neither.
 */
export function committeeSubline(
	committee: Pick<ManagedCommittee, 'abbreviation' | 'room'>
): string {
	const parts: string[] = [];

	if (committee.abbreviation) {
		parts.push(committee.abbreviation);
	}

	if (committee.room) {
		parts.push(committee.room);
	}

	return parts.join(' · ');
}

/**
 * Whether the row warns "No seats": the committee has no seat a delegate could
 * be put in. A hidden seat does not count, the way the publish checklist does
 * not count it, and the checklist will not publish the conference until every
 * committee has one.
 */
export function hasNoOpenSeats(committee: Pick<ManagedCommittee, 'seatCounts'>): boolean {
	return committee.seatCounts.available === 0;
}

/**
 * The papers line under the background guide: "Papers 9/12", the position
 * papers handed in against the delegates seated. It is null for a committee
 * nobody has been seated in yet, where "Papers 0/0" would be noise rather
 * than news.
 */
export function papersLine(
	committee: Pick<ManagedCommittee, 'positionPaperCount' | 'seatCounts'>
): string | null {
	if (committee.seatCounts.filled === 0) {
		return null;
	}

	return `Papers ${committee.positionPaperCount}/${committee.seatCounts.filled}`;
}
