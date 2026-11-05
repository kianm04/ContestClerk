/**
 * What the reader has to do today at the conferences of theirs that are
 * running, most urgent first.
 *
 * The hero of `docs/home.md` (section 3.2, and rule 1 of section 4) reads these
 * items. On a conference day its button is the first link of the item of the
 * reader's own role at the hero conference, the one that leads straight to the
 * room, the dashboard or the schedule they came for, and its first figure is
 * read off that item's title (`$lib/home-hero.ts`). `ownTodayItem` in
 * `$lib/upcoming-conferences.ts` picks the item for each card.
 *
 * `$lib/server/home-today.ts` reads the rows this file works from. Nothing here
 * reads the clock or talks to Supabase: the moment is handed in, so every part
 * of the page agrees on it and a test can choose it.
 */

import type { ResolvedPathname } from '$app/types';
import type { SessionStatus } from '$lib/chair-room';
import { dayInTimezone, daysBetween, formatTimeOfDay } from '$lib/dates';
import {
	chairRoomUrl,
	committeeLiveUrl,
	conferenceAnnouncementsUrl,
	conferenceScheduleUrl,
	delegationUrl,
	manageConferenceUrl
} from '$lib/urls';

/** A conference, with what the "Today" items need to know which day of it this is. */
export type TodayConference = {
	id: string;
	slug: string;
	name: string;
	/** The first and last day, both `YYYY-MM-DD` and both included. */
	startDate: string;
	endDate: string;
	/** The zone those days are days in. */
	timezone: string;
};

/** A committee the reader chairs or sits in, at a conference that runs today. */
export type TodayCommittee = {
	/** The committee's id. */
	id: string;
	/** Its short name when it has one, its full name otherwise, as "My committees" says it. */
	heading: string;
	committeeSlug: string;
	conference: TodayConference;
	/** `true` for a committee the reader chairs, `false` for one they hold a seat in. */
	isChair: boolean;
	/**
	 * The session `committee_state.current_session_id` points at, or `null` when
	 * it points at none, which is the case until the chair starts the first one.
	 */
	currentSession: { name: string; status: SessionStatus } | null;
	/** The committee's next event on today's programme, or `null` when none is left today. */
	nextEvent: { title: string; startsAt: string } | null;
};

/** A conference the reader organises that runs today, with how many of its rooms are sitting. */
export type TodayOrganisedConference = {
	conference: TodayConference;
	committeeCount: number;
	inSessionCount: number;
};

/** A delegation the reader belongs to at a conference that runs today, where they hold no seat. */
export type TodayDelegation = {
	delegationId: string;
	conference: TodayConference;
};

/**
 * One event on the programme of a conference running today that has not ended
 * yet: in progress, or still to come. The server reads a day ahead so that an
 * event in progress is kept, which lets tomorrow morning's first event in as
 * well; whether an event falls on today is read where the conference is, by
 * `eventsLeftToday` in `$lib/home-rows.ts`.
 */
export type TodayEvent = {
	id: string;
	title: string;
	/** ISO timestamps. */
	startsAt: string;
	endsAt: string;
	conferenceId: string;
	/** The committee the event is for, or `null` for an event of the whole conference. */
	committeeId: string | null;
	/** The room or address the organisers wrote, or `null` when they wrote none. */
	location: string | null;
};

/** Everything the "Today" lines are worked out from, all of it about conferences running today. */
export type TodayFacts = {
	committees: TodayCommittee[];
	organisedConferences: TodayOrganisedConference[];
	volunteerConferences: TodayConference[];
	delegations: TodayDelegation[];
	/** The events of those conferences that end after now and start within a day, soonest first. */
	events: TodayEvent[];
};

/** One link of a "Today" item. The first link of the reader's own item at the hero conference is the page's button. */
export type TodayLink = {
	label: string;
	href: ResolvedPathname;
};

/** One thing the reader has to do today, at one conference. */
export type TodayItem = {
	/** Different for every item, built by `todayItemKey`, so the hero can find the item of its own role. */
	key: string;
	/** The conference the item is about, so the hero can find the items of its own conference. */
	conferenceId: string;
	/** "UNSC · Session 1 in progress". */
	title: string;
	/** A second, quieter line, such as "3 of 4 committees in session", or `null`. */
	detail: string | null;
	links: TodayLink[];
};

/** An item together with its place in the order of `home.md`'s seven kinds, 1 being the first. */
type RankedItem = {
	rank: number;
	item: TodayItem;
};

/**
 * What a "Today" item is about: a committee the reader chairs or sits in, a
 * conference they organise or volunteer at, or a delegation they belong to.
 */
export type TodayItemKind = 'chair' | 'seat' | 'organise' | 'volunteer' | 'delegation';

/**
 * The key of a "Today" item: its kind and the id of what it is about, such as
 * `chair-{committeeId}` or `organise-{conferenceId}`. It is written here once
 * so that `ownTodayItem` in `$lib/upcoming-conferences.ts` can build the key
 * the item of a card's own role would have and look that item up.
 */
export function todayItemKey(kind: TodayItemKind, id: string): string {
	return `${kind}-${id}`;
}

/** Whether a conference runs today: from its first day to its last, in its own timezone. */
export function isRunningToday(conference: TodayConference, now: Date): boolean {
	const today = dayInTimezone(now, conference.timezone);

	// `YYYY-MM-DD` strings sort the way the days they name do, so comparing the
	// text compares the dates.
	return conference.startDate <= today && today <= conference.endDate;
}

/** "day 2 of 3": which day of a running conference today is, and how many it has. */
export function conferenceDayLabel(conference: TodayConference, now: Date): string {
	const today = dayInTimezone(now, conference.timezone);
	const dayNumber = daysBetween(conference.startDate, today) + 1;
	const dayCount = daysBetween(conference.startDate, conference.endDate) + 1;

	return `day ${dayNumber} of ${dayCount}`;
}

/** The line of a committee the reader chairs: first when its session is in progress, fourth otherwise. */
function chairedCommitteeItem(committee: TodayCommittee): RankedItem {
	const session = committee.currentSession;
	const links = [
		{
			label: 'Open chair room',
			href: chairRoomUrl(committee.conference.slug, committee.committeeSlug)
		}
	];
	const key = todayItemKey('chair', committee.id);
	const conferenceId = committee.conference.id;

	if (session !== null && session.status === 'in_progress') {
		const title = `${committee.heading} · ${session.name} in progress`;

		return { rank: 1, item: { key, conferenceId, title, detail: null, links } };
	}

	// A session that has ended is still the one the state points at until the
	// chair starts the next, so the line says so rather than "no session yet".
	const title =
		session === null
			? `${committee.heading} · no session yet`
			: `${committee.heading} · ${session.name} ended`;

	return { rank: 4, item: { key, conferenceId, title, detail: null, links } };
}

/** The line of a committee the reader sits in: second when it is in session, fifth otherwise. */
function seatedCommitteeItem(committee: TodayCommittee): RankedItem {
	const session = committee.currentSession;
	const links = [
		{
			label: 'Open live room',
			href: committeeLiveUrl(committee.conference.slug, committee.committeeSlug)
		}
	];
	const key = todayItemKey('seat', committee.id);
	const conferenceId = committee.conference.id;

	// The same words as the chair's line, so the hero's first figure reads the
	// session's name off either of them: "In session" over "UNHRC · Session 3".
	if (session !== null && session.status === 'in_progress') {
		const title = `${committee.heading} · ${session.name} in progress`;

		return { rank: 2, item: { key, conferenceId, title, detail: null, links } };
	}

	const nextEvent = committee.nextEvent;

	if (nextEvent === null) {
		return {
			rank: 5,
			item: {
				key,
				conferenceId,
				title: `${committee.heading} · not in session`,
				detail: null,
				links
			}
		};
	}

	const time = formatTimeOfDay(nextEvent.startsAt, committee.conference.timezone);
	const title = `${committee.heading} · next: ${nextEvent.title}, ${time}`;

	return { rank: 5, item: { key, conferenceId, title, detail: null, links } };
}

/** The line of a conference the reader organises, third in the order. */
function organisedConferenceItem(organised: TodayOrganisedConference, now: Date): RankedItem {
	const conference = organised.conference;

	return {
		rank: 3,
		item: {
			key: todayItemKey('organise', conference.id),
			conferenceId: conference.id,
			title: `${conference.name} · ${conferenceDayLabel(conference, now)}`,
			detail: `${organised.inSessionCount} of ${organised.committeeCount} committees in session`,
			links: [{ label: 'Open dashboard', href: manageConferenceUrl(conference.slug) }]
		}
	};
}

/**
 * The line of a conference the reader volunteers at, sixth in the order.
 *
 * "Schedule" opens this conference's schedule, which shows a volunteer the
 * staff events as well as everyone's: budget 9 asks for the volunteer's day with
 * no public page on the way. It goes there directly rather than through the top
 * bar's `/schedule`, which might pick another conference of theirs.
 */
function volunteerConferenceItem(conference: TodayConference): RankedItem {
	return {
		rank: 6,
		item: {
			key: todayItemKey('volunteer', conference.id),
			conferenceId: conference.id,
			title: `${conference.name} · volunteering`,
			detail: null,
			links: [
				{ label: 'Schedule', href: conferenceScheduleUrl(conference.slug) },
				{ label: 'Announcements', href: conferenceAnnouncementsUrl(conference.slug) }
			]
		}
	};
}

/** The line of a delegation the reader belongs to without a seat of their own, last in the order. */
function delegationItem(delegation: TodayDelegation): RankedItem {
	const conference = delegation.conference;

	return {
		rank: 7,
		item: {
			key: todayItemKey('delegation', delegation.delegationId),
			conferenceId: conference.id,
			title: `${conference.name} · your delegation`,
			detail: null,
			links: [
				{ label: 'Delegation', href: delegationUrl(delegation.delegationId) },
				{ label: 'Announcements', href: conferenceAnnouncementsUrl(conference.slug) }
			]
		}
	};
}

/**
 * Every "Today" item of the reader's, most urgent first, in the order of
 * `home.md`'s seven kinds. Items of one kind keep the order they were given in.
 */
export function todayItems(facts: TodayFacts, now: Date): TodayItem[] {
	const ranked: RankedItem[] = [];

	for (const committee of facts.committees) {
		ranked.push(
			committee.isChair ? chairedCommitteeItem(committee) : seatedCommitteeItem(committee)
		);
	}

	for (const organised of facts.organisedConferences) {
		ranked.push(organisedConferenceItem(organised, now));
	}

	for (const conference of facts.volunteerConferences) {
		ranked.push(volunteerConferenceItem(conference));
	}

	for (const delegation of facts.delegations) {
		ranked.push(delegationItem(delegation));
	}

	// `sort` keeps items of the same rank in the order they were pushed.
	ranked.sort((first, second) => first.rank - second.rank);

	return ranked.map((ranked) => ranked.item);
}
