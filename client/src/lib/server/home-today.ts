/**
 * What the home page reads about the rooms and the programme of the
 * conferences running today, for the hero's live state and its "Today's
 * programme" section (`docs/home.md`, sections 3.2 and 3.5).
 *
 * Files under `$lib/server` only ever run on the server. `loadHomeDashboard` in
 * `./home.ts` works out which of the reader's committees and conferences run
 * today from what it has already read, and hands them here; this file asks the
 * two questions that are left, and `$lib/home-today.ts` turns the answers into
 * the day's items.
 *
 * Row Level Security decides what comes back: a delegate reads the state of
 * their own committee only, and the conference's team, chairs included, reads
 * every committee's, which is what lets an organiser's line count the rooms.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SessionStatus } from '$lib/chair-room';
import { dayInTimezone } from '$lib/dates';
import type {
	TodayCommittee,
	TodayConference,
	TodayDelegation,
	TodayEvent,
	TodayFacts,
	TodayOrganisedConference
} from '$lib/home-today';

/** How far ahead of now the programme is read: to the end of today anywhere. */
const TODAY_EVENT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** A committee the reader chairs or sits in at a conference running today, before its room is read. */
export type CommitteeOfToday = Omit<TodayCommittee, 'currentSession' | 'nextEvent'>;

/** What `readTodayFacts` is given: the reader's parts in conferences that run today. */
export type TodayParts = {
	committees: CommitteeOfToday[];
	organisedConferences: TodayConference[];
	volunteerConferences: TodayConference[];
	delegations: TodayDelegation[];
};

/**
 * One row of the room lookup: a committee's state, its conference, and the
 * session the state points at. `null` for the session means it points at none.
 */
type RoomStateRow = {
	committee_id: string;
	committees: { conference_id: string } | null;
	committee_sessions: { name: string; status: SessionStatus } | null;
};

/** One row of the programme lookup. `committee_id` is `null` for an event of the whole conference. */
type TodayEventRow = {
	id: string;
	title: string;
	starts_at: string;
	ends_at: string;
	/** The room or address, or `null` when the organisers wrote none. */
	location: string | null;
	committee_id: string | null;
	conference_id: string;
};

/** Every id in the list once, in the order they first appear. */
function uniqueIds(ids: string[]): string[] {
	return [...new Set(ids)];
}

/**
 * The state of every committee of these conferences the reader may read, each
 * with the session it points at.
 *
 * `committees!inner(...)` brings the committee's conference id along and, being
 * an inner join, lets the filter below be on that id. `committee_sessions(...)`
 * follows `current_session_id` to the session it names.
 */
async function readRoomStates(
	supabase: SupabaseClient,
	conferenceIds: string[]
): Promise<RoomStateRow[]> {
	// An empty list would have to be written as `in.()`, which PostgREST refuses.
	if (conferenceIds.length === 0) {
		return [];
	}

	const { data, error } = await supabase
		.from('committee_state')
		.select('committee_id, committees!inner(conference_id), committee_sessions(name, status)')
		.in('committees.conference_id', conferenceIds)
		.overrideTypes<RoomStateRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read today's committee rooms: ${error.message}`);
	}

	return data ?? [];
}

/**
 * The events of these conferences that have not ended yet and start within the
 * next day, soonest first. They are read by `ends_at` so that an event already
 * in progress counts: the hero's third figure names the time of the one the
 * reader is in (`docs/home.md`, section 3.2). Which of them fall on today is
 * worked out afterwards, in each conference's own timezone, which a query
 * cannot do (`eventsLeftToday` in `$lib/home-rows.ts`).
 */
async function readProgrammeOfToday(
	supabase: SupabaseClient,
	conferenceIds: string[],
	now: Date
): Promise<TodayEventRow[]> {
	if (conferenceIds.length === 0) {
		return [];
	}

	const windowEnd = new Date(now.getTime() + TODAY_EVENT_WINDOW_MS);

	const { data, error } = await supabase
		.from('schedule_events')
		.select('id, title, starts_at, ends_at, location, committee_id, conference_id')
		.in('conference_id', conferenceIds)
		.gt('ends_at', now.toISOString())
		.lt('starts_at', windowEnd.toISOString())
		.order('starts_at', { ascending: true })
		.overrideTypes<TodayEventRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read today's programme: ${error.message}`);
	}

	return data ?? [];
}

/**
 * The committee's next event today: the first one of its own or of its whole
 * conference, such as "Committee session II", that starts later today where the
 * conference is. An event already in progress is not "next", so it is skipped.
 */
function nextEventToday(
	committee: CommitteeOfToday,
	events: TodayEventRow[],
	now: Date
): TodayCommittee['nextEvent'] {
	const timezone = committee.conference.timezone;
	const today = dayInTimezone(now, timezone);

	const next = events.find(
		(event) =>
			event.conference_id === committee.conference.id &&
			(event.committee_id === null || event.committee_id === committee.id) &&
			new Date(event.starts_at) >= now &&
			dayInTimezone(new Date(event.starts_at), timezone) === today
	);

	if (next === undefined) {
		return null;
	}

	return { title: next.title, startsAt: next.starts_at };
}

/** How many of an organised conference's committees there are, and how many are sitting. */
function countRooms(
	conference: TodayConference,
	roomStates: RoomStateRow[]
): TodayOrganisedConference {
	// `create_committee_state` gives every committee its one row, so the rows of a
	// conference are its committees.
	const rooms = roomStates.filter((row) => row.committees?.conference_id === conference.id);
	const sittingRooms = rooms.filter((row) => row.committee_sessions?.status === 'in_progress');

	return { conference, committeeCount: rooms.length, inSessionCount: sittingRooms.length };
}

/** A row of the programme lookup in the shape `$lib/home-today.ts` reads. */
function toTodayEvent(row: TodayEventRow): TodayEvent {
	return {
		id: row.id,
		title: row.title,
		startsAt: row.starts_at,
		endsAt: row.ends_at,
		conferenceId: row.conference_id,
		committeeId: row.committee_id,
		location: row.location
	};
}

/**
 * Everything `todayItems` in `$lib/home-today.ts` and the hero need: the
 * reader's parts in today's conferences, with each committee's room and next
 * event read, and what is left of today's programme.
 *
 * The two lookups need nothing from each other, so they go out together.
 */
export async function readTodayFacts(
	supabase: SupabaseClient,
	parts: TodayParts,
	now: Date
): Promise<TodayFacts> {
	const roomConferenceIds = uniqueIds([
		...parts.committees.map((committee) => committee.conference.id),
		...parts.organisedConferences.map((conference) => conference.id)
	]);
	// The hero of a running conference says the time of what is on now or next,
	// and any of them may be the hero, so the programme of all of them is read,
	// in the one query.
	const runningConferenceIds = uniqueIds([
		...roomConferenceIds,
		...parts.volunteerConferences.map((conference) => conference.id),
		...parts.delegations.map((delegation) => delegation.conference.id)
	]);

	const [roomStates, events] = await Promise.all([
		readRoomStates(supabase, roomConferenceIds),
		readProgrammeOfToday(supabase, runningConferenceIds, now)
	]);

	const committees: TodayCommittee[] = parts.committees.map((committee) => {
		const room = roomStates.find((row) => row.committee_id === committee.id);

		return {
			...committee,
			currentSession: room?.committee_sessions ?? null,
			nextEvent: committee.isChair ? null : nextEventToday(committee, events, now)
		};
	});

	return {
		committees,
		organisedConferences: parts.organisedConferences.map((conference) =>
			countRooms(conference, roomStates)
		),
		volunteerConferences: parts.volunteerConferences,
		delegations: parts.delegations,
		events: events.map(toTodayEvent)
	};
}
