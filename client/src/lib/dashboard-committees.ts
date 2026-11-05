/**
 * How the conference dashboard writes a committee: in the Committees list
 * while applications are open, in the Committees table while seats are being
 * given, and in the Rooms table on a conference day
 * (`specs/05-pages/organiser/dashboard.md`).
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import type { ManagedCommittee } from '$lib/committees';

/** One committee as the dashboard's Committees section draws it, every word written. */
export type CommitteeRow = {
	id: string;
	/** The committee's slug, which its chair room's address is built from. */
	slug: string;
	name: string;
	/** "HRC · Room 1", or `null` when the committee has neither. */
	code: string | null;
	/** Seats filled of the seats on offer: "3 of 4". */
	seats: string;
	/** Position papers handed in of the delegates seated: "2 of 3". */
	papers: string;
	/** "Samuel Osei", or "No chair yet". */
	chair: string;
	/** The list's first line: "HRC · Human Rights Council". */
	listTitle: string;
	/** The list's second line: "3 of 4 seats filled · Samuel Osei". */
	listDetail: string;
};

/** "HRC · Room 1", "HRC" or "Room 1": the short name and the room, whichever exist. */
export function committeeCode(
	committee: Pick<ManagedCommittee, 'abbreviation' | 'room'>
): string | null {
	const parts: string[] = [];

	if (committee.abbreviation !== null) {
		parts.push(committee.abbreviation);
	}

	if (committee.room !== null) {
		parts.push(committee.room);
	}

	if (parts.length === 0) {
		return null;
	}

	return parts.join(' · ');
}

/** "Samuel Osei", "Samuel Osei, Ana Lima", or "No chair yet" when nobody chairs it. */
export function chairText(chairNames: string[]): string {
	if (chairNames.length === 0) {
		return 'No chair yet';
	}

	return chairNames.join(', ');
}

/** The list's second line, with the papers only when the conference asks for them. */
function listDetail(committee: ManagedCommittee, hasPapers: boolean): string {
	const counts = committee.seatCounts;
	const parts = [`${counts.filled} of ${counts.available} seats filled`];

	if (hasPapers) {
		parts.push(`${committee.positionPaperCount} of ${counts.filled} papers in`);
	}

	// Lower case in the middle of the line: "· no chair".
	parts.push(committee.chairNames.length === 0 ? 'no chair' : chairText(committee.chairNames));

	return parts.join(' · ');
}

/**
 * Each committee as the Committees section draws it, in the order given.
 * `hasPapers` is whether the conference asks for position papers.
 */
export function committeeRows(committees: ManagedCommittee[], hasPapers: boolean): CommitteeRow[] {
	return committees.map((committee) => {
		const counts = committee.seatCounts;
		const listTitle =
			committee.abbreviation === null
				? committee.name
				: `${committee.abbreviation} · ${committee.name}`;

		return {
			id: committee.id,
			slug: committee.slug,
			name: committee.name,
			code: committeeCode(committee),
			seats: `${counts.filled} of ${counts.available}`,
			papers: `${committee.positionPaperCount} of ${counts.filled}`,
			chair: chairText(committee.chairNames),
			listTitle,
			listDetail: listDetail(committee, hasPapers)
		};
	});
}
