/**
 * The conferences on the home page: every conference the reader has a role in
 * that has not ended yet, one card each, with the running one first. The first
 * card is the page's hero, the rest are the "Also coming up" rows.
 *
 * `docs/home.md` ("Your next conference") is the contract. The rows come from
 * queries `loadHomeDashboard` in `$lib/server/home.ts` already makes, so the
 * list costs no query of its own. Nothing here reads the clock: the moment is
 * handed in, so every part of the page agrees on it and a test can choose it.
 */

import type { ResolvedPathname } from '$app/types';
import type { Conference, ConferenceStatus, LocationMode } from '$lib/conferences';
import { dayInTimezone, daysBetween } from '$lib/dates';
import { isRunningToday, todayItemKey, type TodayItem, type TodayLink } from '$lib/home-today';
import { manageStatusLine, type ManageStatusLine } from '$lib/manage-status';
import {
	chairRoomUrl,
	committeeUrl,
	conferenceUrl,
	delegationUrl,
	manageConferenceUrl
} from '$lib/urls';

/** A conference as a card needs it. A whole `Conference` row fits this shape too. */
export type UpcomingConferenceSource = {
	id: string;
	slug: string;
	name: string;
	/** The wide banner's path in the `public-media` bucket, or `null` when the conference has none. */
	bannerPath: string | null;
	/** The first and last day, both `YYYY-MM-DD` and both included. */
	startDate: string;
	endDate: string;
	/** The zone those days are days in. */
	timezone: string;
	/** `null` for an online conference, and for a draft that has not said where yet. */
	city: string | null;
	/** The building the conference is held in, or `null` when none has been named. */
	venueName: string | null;
	/** In a venue, online, or both. */
	locationMode: LocationMode;
	/** `draft`, `published` or `archived`. Archiving is how a conference is cancelled, so an archived one gets no card. */
	status: ConferenceStatus;
};

/** Whether the reader's position paper for a seat is in, still owed, or not asked for. */
export type PositionPaperState = 'handed_in' | 'due' | 'none';

/** A committee the reader chairs or holds a seat in. */
export type UpcomingCommitteeRole = {
	conference: UpcomingConferenceSource;
	committeeId: string;
	/** The committee's short name when it has one, its full name otherwise. */
	committeeHeading: string;
	committeeSlug: string;
	/** The chair row's `title` ("Chair", "Vice chair") or the seat's name ("Canada"). */
	roleName: string;
	/** The seat's country code when the seat is a country, so its flag can be drawn; `null` for a chair. */
	seatCountryCode: string | null;
	/** How many position papers wait for the chair's review; 0 for a seat. */
	papersWaiting: number;
	/** `none` for a chair, and for a seat at a conference that asks for no paper. */
	positionPaper: PositionPaperState;
};

/** A conference the reader organises. */
export type UpcomingOrganisedConference = {
	/** The whole row, so its status line and committee count are to hand. */
	conference: Conference;
	/** How many applications wait for a decision. */
	applicationsWaiting: number;
	/** How far the setup checklist has got; `null` unless the conference is a draft. */
	setupSteps: { done: number; required: number } | null;
};

/** A delegation the reader belongs to that has not been withdrawn. */
export type UpcomingDelegation = {
	conference: UpcomingConferenceSource;
	delegationId: string;
	delegationName: string;
	/** Whether the reader heads the delegation, rather than being one of its members. */
	isHead: boolean;
	/** How many seats the delegation holds, and how many of them nobody sits in yet. */
	seatCount: number;
	emptySeatCount: number;
};

/** Every role of the reader's the cards are worked out from, and the day's items. */
export type UpcomingConferenceFacts = {
	chairs: UpcomingCommitteeRole[];
	seats: UpcomingCommitteeRole[];
	organised: UpcomingOrganisedConference[];
	volunteered: UpcomingConferenceSource[];
	delegations: UpcomingDelegation[];
	/** Conferences of the reader's **accepted** applications. No other status is a role. */
	acceptedApplications: UpcomingConferenceSource[];
	/** Every "Today" item, most urgent first, as `todayItems` in `$lib/home-today.ts` ordered them. */
	todayItems: TodayItem[];
};

/**
 * What the reader is at a conference, by the most telling role they hold
 * there. `head` and `member` are the two sides of a delegation; `accepted` is
 * an accepted application whose seat has not been given yet.
 */
export type UpcomingRoleKind =
	'seat' | 'chair' | 'organiser' | 'volunteer' | 'head' | 'member' | 'accepted';

/** The reader's seat, on a card whose role is `seat`. */
export type SeatOnCard = {
	/** The seat's name, such as "Morocco". */
	name: string;
	/** The seat's country code for its flag, or `null` for a seat that is not a country. */
	countryCode: string | null;
	committeeHeading: string;
	committeeId: string;
	positionPaper: PositionPaperState;
};

/** The reader's chair, on a card whose role is `chair`. */
export type ChairOnCard = {
	/** "Chair" or "Vice chair". */
	title: string;
	committeeHeading: string;
	committeeId: string;
	papersWaiting: number;
};

/** The reader's delegation, on a card whose role is `head` or `member`. */
export type DelegationOnCard = {
	id: string;
	name: string;
	isHead: boolean;
	seatCount: number;
	emptySeatCount: number;
};

/** The organiser's figures, on a card whose role is `organiser`. */
export type OrganiserOnCard = {
	/** "Applications open", "Draft · not public", "Day 2 of 3", as the manage list says it. */
	status: ManageStatusLine;
	applicationsWaiting: number;
	/** `null` unless the conference is a draft. */
	setupSteps: { done: number; required: number } | null;
};

/** One conference of the reader's: the hero when it is first, a row otherwise. */
export type UpcomingConferenceCard = {
	/** The conference's id, so a list's `{#each}` can be keyed on it. */
	id: string;
	slug: string;
	name: string;
	bannerPath: string | null;
	startDate: string;
	endDate: string;
	timezone: string;
	city: string | null;
	venueName: string | null;
	locationMode: LocationMode;
	roleKind: UpcomingRoleKind;
	/** Each is set only on a card of its own role kind, so exactly one of the four is set, or none. */
	seat: SeatOnCard | null;
	chair: ChairOnCard | null;
	delegation: DelegationOnCard | null;
	organiser: OrganiserOnCard | null;
	/** How long to go, as a row's status word says it: "In 8 months", "Tomorrow", or "Today" while it runs. */
	when: { text: string; isLive: boolean };
	/** The reader's own door into the conference: their room, dashboard or its page. */
	href: ResolvedPathname;
	/** Whether the conference runs today. */
	isLive: boolean;
	/**
	 * The live conference's one filled button, the first link of the "Today"
	 * item of the card's own role (`ownTodayItem`). `null` on a card that is not
	 * live, and on a live card whose reader has no item there (an accepted
	 * delegate waiting for a seat).
	 */
	liveButton: TodayLink | null;
};

/** The parts of a card that say which role it is about, and what that role is of. */
export type RoleDetails = Pick<
	UpcomingConferenceCard,
	'roleKind' | 'seat' | 'chair' | 'delegation' | 'organiser'
>;

/** The reader's most telling role at one conference, with where it leads. */
type ConferenceRole = RoleDetails & {
	conference: UpcomingConferenceSource;
	href: ResolvedPathname;
};

/** A role with none of the four detail objects set; each role kind then sets its own. */
const NO_ROLE_DETAILS = { seat: null, chair: null, delegation: null, organiser: null };

/**
 * How long until a conference starts, as the card's `when` word says it before
 * it is capitalised: "tomorrow", "in 6 days", "in 3 weeks", "in 2 months" or
 * "in 1 year".
 *
 * Both days are counted in the conference's own timezone. Weeks, months of 30
 * days and years of 365 days are rounded down, so 13 days is still "in 13 days"
 * and 29 days "in 4 weeks". A conference already running has no "when"; the
 * card gives it "Today" instead.
 */
export function upcomingConferenceWhen(startDate: string, now: Date, timezone: string): string {
	const days = daysBetween(dayInTimezone(now, timezone), startDate);

	if (days <= 1) {
		return 'tomorrow';
	}

	if (days < 14) {
		return `in ${days} days`;
	}

	if (days < 30) {
		return `in ${Math.floor(days / 7)} weeks`;
	}

	if (days < 365) {
		const months = Math.floor(days / 30);

		return months === 1 ? 'in 1 month' : `in ${months} months`;
	}

	const years = Math.floor(days / 365);

	return years === 1 ? 'in 1 year' : `in ${years} years`;
}

/** "in 8 months" as a status word: "In 8 months". */
function capitalised(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Whether a conference is still to come or running: its last day is today or
 * later in its own timezone, and nobody has archived it. Archiving is how an
 * organiser cancels a published conference, so an archived one is over whatever
 * its dates say, as `hasConferenceFinished` in `$lib/committees.ts` reads it too.
 */
function hasNotFinished(conference: UpcomingConferenceSource, now: Date): boolean {
	if (conference.status === 'archived') {
		return false;
	}

	// `YYYY-MM-DD` strings sort the way the days they name do.
	return conference.endDate >= dayInTimezone(now, conference.timezone);
}

/** Committee roles sorted by the committee's short name, so the first one is the one named. */
function byCommitteeHeading(roles: UpcomingCommitteeRole[]): UpcomingCommitteeRole[] {
	return [...roles].sort((first, second) =>
		first.committeeHeading.localeCompare(second.committeeHeading)
	);
}

function chairRole(chair: UpcomingCommitteeRole): ConferenceRole {
	return {
		...NO_ROLE_DETAILS,
		conference: chair.conference,
		href: chairRoomUrl(chair.conference.slug, chair.committeeSlug),
		roleKind: 'chair',
		chair: {
			title: chair.roleName,
			committeeHeading: chair.committeeHeading,
			committeeId: chair.committeeId,
			papersWaiting: chair.papersWaiting
		}
	};
}

function seatRole(seat: UpcomingCommitteeRole): ConferenceRole {
	return {
		...NO_ROLE_DETAILS,
		conference: seat.conference,
		href: committeeUrl(seat.conference.slug, seat.committeeSlug),
		roleKind: 'seat',
		seat: {
			name: seat.roleName,
			countryCode: seat.seatCountryCode,
			committeeHeading: seat.committeeHeading,
			committeeId: seat.committeeId,
			positionPaper: seat.positionPaper
		}
	};
}

/** The organiser's role carries the manage list's status line, which depends on the moment. */
function organiserRole(organised: UpcomingOrganisedConference, now: Date): ConferenceRole {
	const conference = organised.conference;

	return {
		...NO_ROLE_DETAILS,
		conference,
		href: manageConferenceUrl(conference.slug),
		roleKind: 'organiser',
		organiser: {
			status: manageStatusLine(conference, now),
			applicationsWaiting: organised.applicationsWaiting,
			setupSteps: organised.setupSteps
		}
	};
}

function volunteerRole(conference: UpcomingConferenceSource): ConferenceRole {
	return {
		...NO_ROLE_DETAILS,
		conference,
		href: conferenceUrl(conference.slug),
		roleKind: 'volunteer'
	};
}

function delegationRole(delegation: UpcomingDelegation): ConferenceRole {
	return {
		...NO_ROLE_DETAILS,
		conference: delegation.conference,
		href: delegationUrl(delegation.delegationId),
		roleKind: delegation.isHead ? 'head' : 'member',
		delegation: {
			id: delegation.delegationId,
			name: delegation.delegationName,
			isHead: delegation.isHead,
			seatCount: delegation.seatCount,
			emptySeatCount: delegation.emptySeatCount
		}
	};
}

function acceptedRole(conference: UpcomingConferenceSource): ConferenceRole {
	return {
		...NO_ROLE_DETAILS,
		conference,
		href: conferenceUrl(conference.slug),
		roleKind: 'accepted'
	};
}

/**
 * Every role of the reader's, most telling first: chair, seat, organiser,
 * volunteer, delegation, accepted application. The first role met for a
 * conference is the one its card uses.
 */
function rolesInOrder(facts: UpcomingConferenceFacts, now: Date): ConferenceRole[] {
	return [
		...byCommitteeHeading(facts.chairs).map(chairRole),
		...byCommitteeHeading(facts.seats).map(seatRole),
		...facts.organised.map((organised) => organiserRole(organised, now)),
		...facts.volunteered.map(volunteerRole),
		...facts.delegations.map(delegationRole),
		...facts.acceptedApplications.map(acceptedRole)
	];
}

/**
 * The key of the "Today" item the card's own role would have at its conference,
 * or `null` for an accepted applicant, who has no item of their own.
 */
function ownTodayItemKey(role: RoleDetails, conferenceId: string): string | null {
	if (role.seat !== null) {
		return todayItemKey('seat', role.seat.committeeId);
	}

	if (role.chair !== null) {
		return todayItemKey('chair', role.chair.committeeId);
	}

	if (role.organiser !== null) {
		return todayItemKey('organise', conferenceId);
	}

	if (role.delegation !== null) {
		return todayItemKey('delegation', role.delegation.id);
	}

	return role.roleKind === 'volunteer' ? todayItemKey('volunteer', conferenceId) : null;
}

/**
 * The "Today" item of the card's own role at its conference: the one whose
 * first link is the live button and whose title the hero's first figure reads.
 *
 * A reader who chairs DISEC and organises the conference has an item for each,
 * and a card about the chair has to read the chair's, however urgent the
 * other: otherwise the hero would say "Open dashboard" under "Chair of DISEC",
 * or read UNSC's session as DISEC's. When the role has no item of its own the
 * conference's first, most urgent, item stands in; `null` when it has none.
 */
export function ownTodayItem(
	role: RoleDetails,
	conferenceId: string,
	items: TodayItem[]
): TodayItem | null {
	const key = ownTodayItemKey(role, conferenceId);
	const own = key === null ? undefined : items.find((item) => item.key === key);

	return own ?? items.find((item) => item.conferenceId === conferenceId) ?? null;
}

/** One role as its card: the live card's button, or the countdown of one to come. */
function toCard(
	role: ConferenceRole,
	facts: UpcomingConferenceFacts,
	now: Date
): UpcomingConferenceCard {
	const { conference, ...details } = role;
	const card = {
		...details,
		id: conference.id,
		slug: conference.slug,
		name: conference.name,
		bannerPath: conference.bannerPath,
		startDate: conference.startDate,
		endDate: conference.endDate,
		timezone: conference.timezone,
		city: conference.city,
		venueName: conference.venueName,
		locationMode: conference.locationMode
	};

	if (!isRunningToday(conference, now)) {
		const when = upcomingConferenceWhen(conference.startDate, now, conference.timezone);

		return {
			...card,
			when: { text: capitalised(when), isLive: false },
			isLive: false,
			liveButton: null
		};
	}

	const item = ownTodayItem(details, conference.id, facts.todayItems);

	return {
		...card,
		when: { text: 'Today', isLive: true },
		isLive: true,
		liveButton: item?.links[0] ?? null
	};
}

/**
 * Where a card stands among the live ones: the place of its conference's most
 * urgent "Today" item, and after all of them for a conference with none.
 */
function liveRank(card: UpcomingConferenceCard, todayItems: TodayItem[]): number {
	const index = todayItems.findIndex((item) => item.conferenceId === card.id);

	return index === -1 ? todayItems.length : index;
}

/**
 * The order of two cards: live before not live; live ones by their most
 * urgent item, then by name; the rest by the sooner start, then by name.
 */
function compareCards(
	first: UpcomingConferenceCard,
	second: UpcomingConferenceCard,
	todayItems: TodayItem[]
): number {
	if (first.isLive !== second.isLive) {
		return first.isLive ? -1 : 1;
	}

	if (first.isLive) {
		const rankDifference = liveRank(first, todayItems) - liveRank(second, todayItems);

		return rankDifference !== 0 ? rankDifference : first.name.localeCompare(second.name);
	}

	if (first.startDate !== second.startDate) {
		return first.startDate < second.startDate ? -1 : 1;
	}

	return first.name.localeCompare(second.name);
}

/**
 * The cards: one per conference the reader has a role in that has not ended
 * in its own timezone and has not been archived. Running today first, ordered
 * by their most urgent "Today" item and then by name; then the rest, soonest
 * first and then by name. The list is complete; the page decides how many rows
 * to draw.
 */
export function upcomingConferences(
	facts: UpcomingConferenceFacts,
	now: Date
): UpcomingConferenceCard[] {
	const cards: UpcomingConferenceCard[] = [];
	const listedIds = new Set<string>();

	for (const role of rolesInOrder(facts, now)) {
		const conference = role.conference;

		if (listedIds.has(conference.id) || !hasNotFinished(conference, now)) {
			continue;
		}

		listedIds.add(conference.id);
		cards.push(toCard(role, facts, now));
	}

	return cards.sort((first, second) => compareCards(first, second, facts.todayItems));
}
