/**
 * The shape of a committee as the pages show it.
 *
 * The words for `level` are not here: `statusLabel('experience_level', level)`
 * in `$lib/status` already has a word for every value of every database enum,
 * and two lists of the same words would drift apart.
 *
 * Both the server and the browser import this file, so it must not contain
 * anything server-only. Database queries live under `$lib/server`, in
 * `committees.ts`, `committee-page.ts`, `manage-committees.ts` and `my-committees.ts`.
 */

import type { Database } from '$lib/database.types';
import { dayInTimezone, dayLabel, formatEventTime } from '$lib/dates';

/**
 * How hard a committee is, from `beginner` to `advanced`.
 *
 * It is the same database enum as a person's own experience, minus `none`: a
 * committee is never "no experience yet". The check that keeps `none` out lives
 * in the database (`specs/02-architecture/data-model.md`).
 */
export type CommitteeLevel = Database['public']['Enums']['experience_level'];

/** A single committee, in the shape the pages display it. */
export type Committee = {
	id: string;
	/** The last part of the committee's own link, such as `unsc`. Unique inside one conference. */
	slug: string;
	name: string;
	/** "UNSC". `null` when the committee has no short name. */
	abbreviation: string | null;
	description: string | null;
	/** The topics under debate, in the order the organiser put them. */
	topics: string[];
	level: CommitteeLevel;
	/** "Committee Room 1", or `null` when no room has been decided. */
	room: string | null;
};

/** `country` | `character` | `observer` | `other`, straight from the database enum. */
export type SeatKind = Database['public']['Enums']['seat_kind'];

/**
 * One seat as the committee page shows it.
 *
 * `holderName` is the delegate's name and is only ever filled for a reader the
 * seat list's rules let see it: a delegate of that committee, or staff of the
 * conference. For everybody else it is `null` even when the seat is taken,
 * which is what the `public_seats` view exists to guarantee.
 */
export type PublicSeat = {
	id: string;
	name: string;
	kind: SeatKind;
	/** Two letters for the flag, or `null` for a seat that is not a country. */
	countryCode: string | null;
	position: number;
	isTaken: boolean;
	/**
	 * Whether the seat is held for a delegation that has not put anybody in it
	 * yet. It is never true for a reader outside the conference: the
	 * `public_seats` view has no `delegation_id` in it, so a visitor sees a
	 * reserved seat exactly as they see a free one.
	 */
	isReserved: boolean;
	/**
	 * The delegation the seat is reserved for, or `null` when there is none and
	 * when this reader may not read its name. Only the delegation's own members
	 * and the conference's organisers may; everybody else sees that the seat is
	 * reserved without being told by whom.
	 */
	reservedForName: string | null;
	holderName: string | null;
	/**
	 * Where their picture sits in the `public-media` bucket, or `null` for the
	 * initials `Avatar` falls back on. It is `null` for the same readers
	 * `holderName` is, because it names the person just as plainly.
	 */
	holderAvatarPath: string | null;
};

/** One chair of a committee, with the name and picture the page shows. */
export type CommitteeChair = {
	userId: string;
	fullName: string;
	/** Where their picture sits in the `public-media` bucket, or `null` for initials. */
	avatarPath: string | null;
	/** "Chair", "Vice Chair", "Rapporteur". */
	title: string;
};

/** How many of a committee's seats are taken, for the card on the conference page. */
export type SeatSummary = { taken: number; total: number };

/**
 * The "12 of 15 seats taken" line, counted from the seats themselves.
 *
 * It asks for no more than the one thing it counts, so both callers can use it:
 * the committee page hands it whole `PublicSeat`s, and the conference page's
 * server counts rows of `public_seats` that carry nothing but this. Only the
 * seats the reader is allowed to see are in the list, and hidden seats are left
 * out of it before it ever reaches here, so the total is the length of the list
 * rather than a number of its own.
 */
export function summariseSeats(seats: { isTaken: boolean }[]): SeatSummary {
	const takenSeats = seats.filter((seat) => seat.isTaken);

	return { taken: takenSeats.length, total: seats.length };
}

/**
 * What the committee is called at the top of its page, in the browser tab and
 * on a dashboard row: its short name when it has one, its full name otherwise.
 *
 * It asks for the two fields it reads rather than for a whole `Committee`, so
 * that a query which fetched only those two can still use it. `Pick` is
 * TypeScript for "an object with just these fields of that type", and a whole
 * `Committee` satisfies it, so every existing caller is unchanged.
 */
export function committeeHeading(committee: Pick<Committee, 'name' | 'abbreviation'>): string {
	return committee.abbreviation ?? committee.name;
}

/*
 * Everything below belongs to the organiser's own pages, `/manage/[slug]/committees`
 * and the committee editor. They show a committee the way the people running the
 * conference need to see it: with the fields a visitor never reads, and with the
 * seats counted by what is still to be done rather than by what is taken.
 */

/** One committee as the organiser's pages hold it, before its seats and chairs are counted. */
export type ManagedCommitteeRow = {
	id: string;
	slug: string;
	name: string;
	abbreviation: string | null;
	description: string | null;
	/** The topics under debate, in the order the organiser put them. */
	topics: string[];
	level: CommitteeLevel;
	room: string | null;
	/** Where the committee sits in the conference's own order, counted from the database. */
	position: number;
	/** How long one speech lasts by default, in seconds. */
	defaultSpeakingTimeSeconds: number;
};

/**
 * How a committee's seats divide up, for the "Seats 15 (12 filled, 2 reserved)"
 * line on a committee row.
 *
 * These are not the counts a visitor sees. `SeatSummary` above answers "how full
 * is this committee", which is what somebody deciding whether to apply wants.
 * This answers "what is left to do", which is what the organiser wants, so a
 * hidden seat still counts towards `total` and a reserved one is its own number.
 */
export type ManagedSeatCounts = {
	/** Seats delegates can still be put in, which is what the publish checklist counts. */
	available: number;
	filled: number;
	/** Held for a delegation that has not named anybody yet. */
	reserved: number;
	/** Every seat, the hidden ones included. */
	total: number;
};

/** One committee with its seats counted and its chairs named, as a committee row shows it. */
export type ManagedCommittee = ManagedCommitteeRow & {
	seatCounts: ManagedSeatCounts;
	/** The full name of each chair, in the order the page lists them. */
	chairNames: string[];
	/** Whether a background guide has been uploaded for this committee. */
	hasBackgroundGuide: boolean;
	/** How many of its delegates have handed a position paper in. */
	positionPaperCount: number;
};

/**
 * One seat as the committee editor's table shows it.
 *
 * Unlike `PublicSeat`, every field here is really filled in: an organiser may
 * read who holds a seat and which delegation it is held for, so nothing is
 * blanked out on the way.
 */
export type ManagedSeat = {
	id: string;
	name: string;
	kind: SeatKind;
	/** Two letters for the flag, or `null` for a seat that is not a country. */
	countryCode: string | null;
	position: number;
	/** False for a seat the organiser has hidden, which no delegate can be put in. */
	isAvailable: boolean;
	/**
	 * Whether somebody holds the seat, which is `seats.user_id` being set. True
	 * even when their name could not be read, so it never depends on a second
	 * query having worked.
	 */
	isFilled: boolean;
	/** Held for a delegation that has not named anybody yet: a delegation and no delegate. */
	isReserved: boolean;
	/**
	 * The delegate's name, or `null` when the seat is free or when they have no
	 * profile row to read a name from. Ask `isFilled` about whether anybody is in
	 * the seat; this only answers what to call them.
	 */
	holderName: string | null;
	/** The delegation the seat is held for, or `null` when it is held for nobody. */
	delegationName: string | null;
};

/**
 * Count one committee's seats for the organiser: how many are open, how many
 * have somebody in them, how many are waiting for a delegation to name somebody,
 * and how many there are altogether.
 *
 * A seat counts as reserved only while it is still empty. Once the delegation
 * names somebody it is a filled seat like any other, so the two numbers never
 * count the same seat twice. `isReserved` already says as much, so nothing here
 * has to check the two against each other.
 *
 * It counts the seats' own three answers and never their names. Whether
 * somebody holds a seat and what that person is called are two different
 * questions: a name comes from a second query against `profiles`, and an
 * account made before the `handle_new_user` trigger existed has no row there.
 * Counting a seat by its name would read such a seat as free, and the "No
 * seats" warning, the publish checklist and the editor's delete button would
 * all then be wrong about a seat with a delegate in it.
 *
 * It asks for the three fields it reads rather than for whole `ManagedSeat`s,
 * the way `committeeHeading` above does, because the committees list counts the
 * seats of every committee at once and fetches no more of each seat than this.
 * A whole `ManagedSeat[]` still satisfies it, so the editor passes its table
 * straight in.
 */
export function summariseManagedSeats(
	seats: Pick<ManagedSeat, 'isAvailable' | 'isFilled' | 'isReserved'>[]
): ManagedSeatCounts {
	const availableSeats = seats.filter((seat) => seat.isAvailable);
	const filledSeats = seats.filter((seat) => seat.isFilled);
	const reservedSeats = seats.filter((seat) => seat.isReserved);

	return {
		available: availableSeats.length,
		filled: filledSeats.length,
		reserved: reservedSeats.length,
		total: seats.length
	};
}

/*
 * Everything below belongs to the reader's own committee list, `/committees`:
 * every committee they hold a seat in or chair, at every conference of theirs.
 * A card there names the committee, its conference, what the reader is in it,
 * what is next on its schedule and whether its room is running.
 */

/** One committee as a card on `/committees` shows it. */
export type MyCommitteeSummary = {
	id: string;
	name: string;
	abbreviation: string | null;
	/** The last part of the committee's own link, such as `unsc`. */
	slug: string;
	/** "Committee Room 1", or `null` when no room has been decided. */
	room: string | null;
	/** Where the committee sits in its conference's own order, which the rows are sorted by. */
	position: number;
};

/** The conference one of those committees belongs to. */
export type MyCommitteeConference = {
	id: string;
	name: string;
	slug: string;
	/** The first day, as a plain `YYYY-MM-DD` with no time and no timezone. */
	startDate: string;
	/** The last day, in the same shape. */
	endDate: string;
	/** An IANA name such as `Europe/Amsterdam`: the conference's own timezone, never the reader's. */
	timezone: string;
	/** Whether the organisers have closed the conference down, which is the `archived` status. */
	isArchived: boolean;
};

/** The seat a delegate holds, as their card names it. */
export type MyCommitteeSeat = {
	name: string;
	/** Two letters for the flag, or `null` for a seat that is not a country. */
	countryCode: string | null;
};

/** The next thing on a committee's schedule, for the "Next:" line on its card. */
export type MyCommitteeEvent = {
	title: string;
	/** ISO timestamps as Postgres returns them, so an exact moment rather than a day. */
	startsAt: string;
	endsAt: string;
};

/** The two ways somebody takes part in a committee. */
export type MyCommitteeRole = 'delegate' | 'chair';

/** One committee of the reader's, before its schedule and its room have been asked about. */
export type MyCommitteeMembership = {
	committee: MyCommitteeSummary;
	conference: MyCommitteeConference;
	role: MyCommitteeRole;
	/** The seat a delegate holds. A chair holds no seat, so theirs is `null`. */
	seat: MyCommitteeSeat | null;
};

/** One whole card: a membership, what is next on its schedule and whether its room is running. */
export type MyCommitteeRow = MyCommitteeMembership & {
	/** The soonest event that has not started yet, or `null` when there is none. */
	nextEvent: MyCommitteeEvent | null;
	/** Whether the committee's room is in session, which is its mode being anything but `idle`. */
	isLive: boolean;
};

/** The word on a card's badge: what the reader is in that committee. */
export function myCommitteeRoleLabel(role: MyCommitteeRole): string {
	if (role === 'chair') {
		return 'Chair';
	}

	return 'Delegate';
}

/**
 * Which of two committees comes first on the page: the one whose conference
 * starts earlier, and within one conference the one the organiser put first.
 *
 * Both start dates are `YYYY-MM-DD`, so comparing them as text compares them as
 * dates, the way `isPast` in `$lib/conferences.ts` does.
 */
function compareMyCommittees(first: MyCommitteeMembership, second: MyCommitteeMembership): number {
	if (first.conference.startDate < second.conference.startDate) {
		return -1;
	}

	if (first.conference.startDate > second.conference.startDate) {
		return 1;
	}

	return first.committee.position - second.committee.position;
}

/**
 * The reader's seats and chair roles as the one list `/committees` shows, in
 * the order it shows them.
 *
 * Somebody who both holds a seat in a committee and chairs it gets one row and
 * not two, the seat's. Two rows for one committee would read as a mistake, and
 * the seat is the more particular of the two things to say about them.
 * `/home` lists such a conference once as well, though as the chair's
 * (`collectTodayParts` in `$lib/server/home.ts` and `upcomingConferences` in
 * `$lib/upcoming-conferences.ts`): there the chair room is where the day needs
 * them, while here the seat is the more particular thing to say.
 *
 * Neither list it is given is changed. `sort` reorders the array it is called
 * on, so it is called on a copy and never on the caller's own list.
 */
export function mergeMyCommittees(
	seats: MyCommitteeMembership[],
	chairRoles: MyCommitteeMembership[]
): MyCommitteeMembership[] {
	const merged = [...seats];

	for (const chairRole of chairRoles) {
		const isAlreadyListed = merged.some((listed) => listed.committee.id === chairRole.committee.id);

		if (!isAlreadyListed) {
			merged.push(chairRole);
		}
	}

	return merged.sort(compareMyCommittees);
}

/**
 * Whether a conference is over, which is what `/committees` leaves out until
 * the reader asks for `?past=1`.
 *
 * The spec's own words: "Ended means the conference's `end_date` has gone by in
 * the conference's own timezone, or its status is `archived`."
 * (`specs/05-pages/delegate/committees.md`.) An archived conference whose dates
 * are still ahead is one the organisers closed early, and to a delegate that is
 * the same thing as one that has run its course.
 *
 * "Gone by" is judged where the conference is and not where the reader is, so a
 * conference in Auckland does not read as finished to somebody in Amsterdam
 * while its delegates are still in the room. `now` is given rather than read
 * from the clock here, because a pure function may not read the clock and
 * because a test has to be able to decide what the moment is.
 *
 * It asks for the three fields it reads rather than for a whole
 * `MyCommitteeConference`, the way `committeeHeading` above and
 * `isAcceptingApplications` in `$lib/conferences.ts` do, so that
 * `/applications`, whose conference is a different shape, can use the same
 * rule. `Pick` is TypeScript for "an object with just these fields of that
 * type", and a whole `MyCommitteeConference` satisfies it, so every existing
 * caller is unchanged.
 */
export function hasConferenceFinished(
	conference: Pick<MyCommitteeConference, 'endDate' | 'timezone' | 'isArchived'>,
	now: Date
): boolean {
	if (conference.isArchived) {
		return true;
	}

	const todayAtTheConference = dayInTimezone(now, conference.timezone);

	// Both are `YYYY-MM-DD`, so comparing them as text compares them as dates.
	return conference.endDate < todayAtTheConference;
}

/**
 * Only the memberships whose conference is still to come or still running.
 * This is the list `/committees` shows until `?past=1` asks for the rest.
 */
export function withoutFinishedConferences(
	memberships: MyCommitteeMembership[],
	now: Date
): MyCommitteeMembership[] {
	return memberships.filter((membership) => !hasConferenceFinished(membership.conference, now));
}

/**
 * The "Next: Session I · Tomorrow 10:30 – 12:00" line on a card, or `null` when
 * the committee has nothing coming up, so that the card leaves the line out
 * rather than showing an empty one.
 *
 * `timeZone` is the conference's own. The day and the time both read in it, for
 * the reason `$lib/dates.ts` gives at the top: a delegate reading from another
 * country has to see when the session starts in the room, not when it starts
 * for them.
 */
export function nextEventLine(
	event: MyCommitteeEvent | null,
	timeZone: string,
	now: Date
): string | null {
	if (event === null) {
		return null;
	}

	const dayOfEvent = dayInTimezone(new Date(event.startsAt), timeZone);
	const dayWords = dayLabel(dayOfEvent, now, timeZone);
	const timeWords = formatEventTime(event.startsAt, event.endsAt, timeZone);

	return `Next: ${event.title} · ${dayWords} ${timeWords}`;
}

/**
 * The `id` of the hidden form that saves a drag in the organiser's list of
 * committees. Every drag handle of that list names it in its `form` attribute.
 */
export const COMMITTEE_DROP_FORM_ID = 'committee-drop-form';

/** The `id` of the sentence that tells a screen reader how to drag a committee with the keys. */
export const COMMITTEE_DROP_HINT_ID = 'committee-drop-hint';

/** The same pair for the seats list of the committee editor. */
export const SEAT_DROP_FORM_ID = 'seat-drop-form';
export const SEAT_DROP_HINT_ID = 'seat-drop-hint';

/** The paragraph explaining how to drag a committee's topics, in the committee form (T132). */
export const TOPIC_DROP_HINT_ID = 'topic-drop-hint';
