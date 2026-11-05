/**
 * Awards: their kinds, their labels, the order they are listed in, and the
 * shapes the chair's awards page, the organiser's awards page and `/profile`
 * draw. The rules are `specs/06-features/awards.md`.
 *
 * Nothing here talks to the database. Reading and writing awards is in
 * `$lib/server/awards.ts` and `$lib/server/award-changes.ts`, and reading and
 * checking the forms is in `$lib/award-form.ts`.
 */

import type { Database } from '$lib/database.types';
import { dayInTimezone, formatDateRange } from '$lib/dates';
import type { BadgeTone } from '$lib/status';

/** One of the six `award_kind` values, such as `best_delegate`. */
export type AwardKind = Database['public']['Enums']['award_kind'];

/** `proposed` while a chair suggests it, `confirmed` once an organiser agrees. */
export type AwardStatus = Database['public']['Enums']['award_status'];

/**
 * Every kind in the order a committee's awards are listed: the highest honour
 * first and a custom award last, as `05-pages/chair/awards.md` ranks them.
 */
export const AWARD_KINDS: AwardKind[] = [
	'best_delegate',
	'outstanding_delegate',
	'honourable_mention',
	'best_position_paper',
	'verbal_commendation',
	'custom'
];

/** The words for each kind. A proposal of any kind but `custom` takes these as its title. */
const AWARD_KIND_LABELS: Record<AwardKind, string> = {
	best_delegate: 'Best Delegate',
	outstanding_delegate: 'Outstanding Delegate',
	honourable_mention: 'Honourable Mention',
	best_position_paper: 'Best Position Paper',
	verbal_commendation: 'Verbal Commendation',
	custom: 'Custom'
};

/** The most characters a custom award's title may have. */
export const AWARD_TITLE_MAX_LENGTH = 80;

/** A seat an award can be given to, with the delegate sitting in it. */
export type AwardSeat = {
	id: string;
	/** The seat's own name, such as "France". */
	name: string;
	/** Two letters for the flag, or null for a seat that is not a country. */
	countryCode: string | null;
	/** Whether somebody holds the seat. Only a filled seat can be given an award. */
	isFilled: boolean;
	/** The holder's name, when there is a holder and they have written one. */
	delegateName: string | null;
};

/** One award of a committee, as the chair and the organiser see it. */
export type Award = {
	id: string;
	committeeId: string;
	seatId: string;
	seatName: string;
	countryCode: string | null;
	/**
	 * Who the award is for: the holder frozen onto it at publish, or before
	 * that whoever sits in the seat now. Null when neither is known.
	 */
	holderName: string | null;
	/** Nobody holds the seat now, so the award cannot be confirmed or published. */
	isSeatEmpty: boolean;
	kind: AwardKind;
	title: string;
	status: AwardStatus;
	/** The chair or organiser who proposed it. */
	createdBy: string;
	proposerName: string | null;
};

/**
 * An award as the public committee page lists it: the part of an `Award` both
 * of that page's readers can supply. A chair or organiser gets whole `Award`s
 * from the `awards` table; everybody else signed in gets these from the
 * `published_awards` view, which carries no id but the award's own.
 */
export type CommitteePageAward = Pick<
	Award,
	'id' | 'kind' | 'title' | 'seatName' | 'countryCode' | 'holderName' | 'status'
>;

/** One committee of the conference, as the organiser's awards page lists it. */
export type CommitteeAwards = {
	committee: { id: string; name: string; abbreviation: string | null };
	awards: Award[];
	/** The committee's seats that have a delegate, which the "Add award" form offers. */
	filledSeats: AwardSeat[];
};

/** A published award on the holder's own profile. */
export type ProfileAward = {
	id: string;
	title: string;
	/** The committee's abbreviation, such as "UNSC", or its name when it has none. */
	committeeLabel: string;
	conferenceName: string;
	/** The day the conference published it, as `YYYY-MM-DD` in the conference's timezone. */
	publishedDay: string;
};

/** "Best Delegate" for `best_delegate`. */
export function awardKindLabel(kind: AwardKind): string {
	return AWARD_KIND_LABELS[kind];
}

/** The six kinds as `SelectField` options, in rank order. */
export const AWARD_KIND_OPTIONS: { value: string; label: string }[] = AWARD_KINDS.map((kind) => ({
	value: kind,
	label: awardKindLabel(kind)
}));

/** Whether a piece of text a form sent is one of the six kinds. */
export function isAwardKind(value: string): value is AwardKind {
	return (AWARD_KINDS as string[]).includes(value);
}

/**
 * A committee's awards in the order every page lists them: by kind rank, and
 * within one kind by seat name. Returns a new list and leaves the one given alone.
 *
 * Generic over anything with a kind and a seat name, so the public committee
 * page's `CommitteePageAward`s sort the same way as whole `Award`s do.
 */
export function sortAwards<T extends Pick<Award, 'kind' | 'seatName'>>(awards: T[]): T[] {
	return [...awards].sort((first, second) => {
		const rankDifference = AWARD_KINDS.indexOf(first.kind) - AWARD_KINDS.indexOf(second.kind);

		if (rankDifference !== 0) return rankDifference;

		return first.seatName.localeCompare(second.seatName);
	});
}

/**
 * Whether the awards of a conference are published, which is whether
 * `awards_published_at` is set at all. A moment still in the future counts:
 * the list is final from the moment the organiser presses "Publish awards",
 * even though delegates only see it once that moment arrives.
 */
export function isAwardsPublished(awardsPublishedAt: string | null): boolean {
	return awardsPublishedAt !== null;
}

/**
 * Whether delegates can read the awards yet: the moment has been set and has
 * arrived. The `awards` select policy asks the same question of `now()`.
 */
export function isAwardsVisible(awardsPublishedAt: string | null, now: Date): boolean {
	if (awardsPublishedAt === null) return false;

	return new Date(awardsPublishedAt).getTime() <= now.getTime();
}

/**
 * The status `Badge` of an award row. Before publishing: "Proposed" or
 * "Confirmed". After: a confirmed award is "Published", and a proposal the
 * organisers left out is "Not confirmed".
 */
export function awardBadge(
	status: AwardStatus,
	isPublished: boolean
): { tone: BadgeTone; label: string } {
	if (isPublished) {
		if (status === 'confirmed') return { tone: 'brand', label: 'Published' };

		return { tone: 'neutral', label: 'Not confirmed' };
	}

	if (status === 'confirmed') return { tone: 'success', label: 'Confirmed' };

	return { tone: 'neutral', label: 'Proposed' };
}

/** The three numbers in the organiser's page header. */
export type AwardCounts = {
	confirmed: number;
	proposed: number;
	committeesWithoutAwards: number;
};

/** How many awards are confirmed, how many proposed, and how many committees have no confirmed one. */
export function countAwards(sections: CommitteeAwards[]): AwardCounts {
	const allAwards = sections.flatMap((section) => section.awards);
	const confirmed = allAwards.filter((award) => award.status === 'confirmed').length;
	const committeesWithoutAwards = committeesWithoutConfirmedAwards(sections).length;

	return {
		confirmed,
		proposed: allAwards.length - confirmed,
		committeesWithoutAwards
	};
}

/** The names of the committees that have no confirmed award yet, in page order. */
export function committeesWithoutConfirmedAwards(sections: CommitteeAwards[]): string[] {
	const withoutAwards = sections.filter(
		(section) => !section.awards.some((award) => award.status === 'confirmed')
	);

	return withoutAwards.map((section) => section.committee.name);
}

/**
 * The first confirmed award whose seat nobody holds, described the way the
 * organiser's publish refusal names it, or null when there is none.
 * `freeze_award_user` would give such an award to nobody.
 */
export function confirmedAwardOnEmptySeat(sections: CommitteeAwards[]): string | null {
	for (const section of sections) {
		const stranded = section.awards.find(
			(award) => award.status === 'confirmed' && award.isSeatEmpty
		);

		if (stranded) return `${stranded.title} in ${section.committee.name}`;
	}

	return null;
}

/**
 * Whether the reader may reword this award on the chair's page: it is still
 * a proposal, nothing is published, and the reader proposed it.
 * `protect_awards_columns` keeps an award's wording to its proposer, so
 * offering "Edit" to anybody else would only lead to a refusal.
 */
export function canEditAward(award: Award, readerId: string, isPublished: boolean): boolean {
	return award.status === 'proposed' && !isPublished && award.createdBy === readerId;
}

/**
 * Whether the reader may withdraw this award on the chair's page: it is
 * still a proposal, nothing is published, and the reader proposed it or
 * organises the conference, which is who the delete policy lets through.
 */
export function canWithdrawAward(
	award: Award,
	readerId: string,
	canManage: boolean,
	isPublished: boolean
): boolean {
	if (award.status !== 'proposed' || isPublished) return false;

	return award.createdBy === readerId || canManage;
}

/** "0 notes", "1 note", "3 notes": the hint beside a seat on the chair's awards page. */
export function noteCountText(noteCount: number): string {
	return noteCount === 1 ? '1 note' : `${noteCount} notes`;
}

/** A seat as the award forms offer it: "France · Amira Haddad", or the seat alone. */
export function awardSeatLabel(seat: AwardSeat): string {
	return seat.delegateName ? `${seat.name} · ${seat.delegateName}` : seat.name;
}

/**
 * The day the awards were, or will be, published, as the conference's own
 * calendar reads it: "3 Mar 2027". `awardsPublishedAt` is an ISO timestamp.
 */
export function formatPublishedDay(awardsPublishedAt: string, timeZone: string): string {
	const day = dayInTimezone(new Date(awardsPublishedAt), timeZone);

	// A range from one day to the same day is written as that day alone.
	return formatDateRange(day, day);
}

/**
 * Whether an organiser may rename this award on their awards page: a custom
 * award they added themself, before publishing. `protect_awards_columns` keeps
 * an award's wording to whoever proposed it, so nobody else's title can change.
 */
export function canRenameAward(award: Award, readerId: string, isPublished: boolean): boolean {
	return award.kind === 'custom' && award.createdBy === readerId && !isPublished;
}

/** Find one award among the committees of the organiser's awards page, or null. */
export function findAward(sections: CommitteeAwards[], awardId: string): Award | null {
	const allAwards = sections.flatMap((section) => section.awards);

	return allAwards.find((award) => award.id === awardId) ?? null;
}
