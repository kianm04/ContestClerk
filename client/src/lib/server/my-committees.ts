/**
 * The committees one person takes part in: everything `/committees` reads, the
 * page that lists every committee the signed-in person sits in or chairs,
 * across all of their conferences at once.
 *
 * The other committee readers (`./committees.ts`, `./committee-page.ts` and
 * `./manage-committees.ts`) start from one conference and look for its
 * committees; this one starts from the person, which is why its queries begin
 * at `seats` and `committee_chairs` and reach the committee through them.
 *
 * Files under `$lib/server` only ever run on the server, so this is where the
 * database is queried. Every function takes the Supabase client as its first
 * argument. Pages pass in `locals.supabase`, the client that knows who is
 * signed in, so the database's Row Level Security rules (see
 * `specs/02-architecture/permissions.md`) decide what each reader gets back.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
	mergeMyCommittees,
	withoutFinishedConferences,
	type MyCommitteeEvent,
	type MyCommitteeMembership,
	type MyCommitteeRole,
	type MyCommitteeRow,
	type MyCommitteeSeat
} from '$lib/committees';
import type { ConferenceStatus } from '$lib/conferences';
import { isQuickSession, type ConferenceKind } from '$lib/my-quick-sessions';

/**
 * The conference a committee belongs to, which both lookups below bring along.
 *
 * `null` means Row Level Security withheld the row. A committee's conference
 * can be withheld even though the committee itself came back: a draft is
 * readable only by the people running it. `kind` says whether it is a quick
 * session, which `/home` lists on its own and this page leaves out (S14).
 */
type EmbeddedConferenceRow = {
	id: string;
	kind: ConferenceKind;
	slug: string;
	name: string;
	start_date: string;
	end_date: string;
	timezone: string;
	status: ConferenceStatus;
};

/** The committee a seat or a chair row belongs to, with its conference attached. */
type EmbeddedCommitteeRow = {
	id: string;
	slug: string;
	name: string;
	abbreviation: string | null;
	room: string | null;
	position: number;
	conferences: EmbeddedConferenceRow | null;
};

/** One row of the seat lookup: the seat itself, with its committee attached. */
type MySeatRow = {
	name: string;
	country_code: string | null;
	committees: EmbeddedCommitteeRow | null;
};

/** One row of the chair lookup: nothing of its own, only the committee chaired. */
type MyChairRow = {
	committees: EmbeddedCommitteeRow | null;
};

/**
 * The committee, and the conference it belongs to, that both lookups ask for:
 * enough to name the committee, to sort the list, to link to both of them and
 * to work out whether the conference is over.
 *
 * `committees(...)` and `conferences(...)` follow a foreign key into another
 * table and bring the row it points at along. Each of them points at exactly
 * one row, so Supabase answers with one object rather than with a list, which
 * is why the row types above nest an object and not an array.
 */
const MY_COMMITTEE_WITH_CONFERENCE_COLUMNS =
	'committees(id, slug, name, abbreviation, room, position, ' +
	'conferences(id, kind, slug, name, start_date, end_date, timezone, status))';

/** One row of the next-event lookup. The query already knows which committee it asked about. */
type CommitteeEventRow = {
	title: string;
	starts_at: string;
	ends_at: string;
};

/** One row of the live-room lookup: only which committee it is about matters. */
type LiveCommitteeRow = {
	committee_id: string;
};

/** The seats this person holds, each with its committee and that committee's conference. */
async function readMySeatRows(supabase: SupabaseClient, userId: string): Promise<MySeatRow[]> {
	const { data, error } = await supabase
		.from('seats')
		.select(`name, country_code, ${MY_COMMITTEE_WITH_CONFERENCE_COLUMNS}`)
		.eq('user_id', userId)
		.overrideTypes<MySeatRow[], { merge: false }>();

	// A failed query means a bug (a wrong column name, a missing policy), not
	// something the reader can fix, so the page fails rather than quietly showing
	// half of somebody's committees. Every lookup in this file does the same.
	if (error) {
		throw new Error(`Could not list the committees you sit in: ${error.message}`);
	}

	return data ?? [];
}

/**
 * The committees this person chairs, each with that committee's conference.
 *
 * `committee_chairs.title` is deliberately not read. The badge on the card says
 * "Chair" whatever the title column holds, and the card has nowhere to put
 * "Rapporteur", so reading the column would only invite somebody to show it.
 */
async function readMyChairRows(supabase: SupabaseClient, userId: string): Promise<MyChairRow[]> {
	const { data, error } = await supabase
		.from('committee_chairs')
		.select(MY_COMMITTEE_WITH_CONFERENCE_COLUMNS)
		.eq('user_id', userId)
		.overrideTypes<MyChairRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not list the committees you chair: ${error.message}`);
	}

	return data ?? [];
}

/**
 * One committee this person takes part in, or `null` when there is nothing to
 * show.
 *
 * Row Level Security can withhold either the committee or its conference, and a
 * row with no conference has no dates to sort by and nothing to link to, so it
 * is left out rather than shown half empty. A quick session's committee is left
 * out too: "Quick sessions" on `/home` is its one list (S14).
 */
function toMembership(
	committee: EmbeddedCommitteeRow | null,
	role: MyCommitteeRole,
	seat: MyCommitteeSeat | null
): MyCommitteeMembership | null {
	if (committee === null || committee.conferences === null) {
		return null;
	}

	if (isQuickSession(committee.conferences)) {
		return null;
	}

	const conference = committee.conferences;

	return {
		committee: {
			id: committee.id,
			name: committee.name,
			abbreviation: committee.abbreviation,
			slug: committee.slug,
			room: committee.room,
			position: committee.position
		},
		conference: {
			id: conference.id,
			name: conference.name,
			slug: conference.slug,
			startDate: conference.start_date,
			endDate: conference.end_date,
			timezone: conference.timezone,
			// The page is told the conference is closed rather than being handed
			// the status word to interpret, because "archived" is a word only the
			// organisers use.
			isArchived: conference.status === 'archived'
		},
		role,
		seat
	};
}

/** The seat rows that still have a committee and a conference to show, as memberships. */
function toSeatMemberships(seatRows: MySeatRow[]): MyCommitteeMembership[] {
	const memberships: MyCommitteeMembership[] = [];

	for (const row of seatRows) {
		const seat: MyCommitteeSeat = { name: row.name, countryCode: row.country_code };
		const membership = toMembership(row.committees, 'delegate', seat);

		if (membership !== null) {
			memberships.push(membership);
		}
	}

	return memberships;
}

/** The chair rows that still have a committee and a conference to show, as memberships. */
function toChairMemberships(chairRows: MyChairRow[]): MyCommitteeMembership[] {
	const memberships: MyCommitteeMembership[] = [];

	for (const row of chairRows) {
		// A chair holds no seat, so there is no country or seat name on their card.
		const membership = toMembership(row.committees, 'chair', null);

		if (membership !== null) {
			memberships.push(membership);
		}
	}

	return memberships;
}

/**
 * The next thing on one committee's programme, or `null` when nothing is left
 * on it.
 *
 * `.limit(1)` asks the database for the soonest row only. That is the whole
 * point of asking about one committee at a time: PostgREST answers with at
 * most `max_rows` rows (see `supabase/config.toml`), and one query for every
 * committee's whole programme would have lost the "Next:" line of whichever
 * committees fell past that cut.
 *
 * `audience = 'committee'` leaves out the events the whole conference is
 * invited to: an opening ceremony belongs on the schedule page, not on one
 * committee's card.
 */
async function readNextCommitteeEvent(
	supabase: SupabaseClient,
	committeeId: string,
	now: Date
): Promise<MyCommitteeEvent | null> {
	const { data, error } = await supabase
		.from('schedule_events')
		.select('title, starts_at, ends_at')
		.eq('committee_id', committeeId)
		.eq('audience', 'committee')
		.gte('starts_at', now.toISOString())
		.order('starts_at', { ascending: true })
		.limit(1)
		.overrideTypes<CommitteeEventRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read what is next in your committees: ${error.message}`);
	}

	const rows: CommitteeEventRow[] = data ?? [];
	const nextRow = rows[0];

	if (nextRow === undefined) {
		return null;
	}

	return { title: nextRow.title, startsAt: nextRow.starts_at, endsAt: nextRow.ends_at };
}

/**
 * The next thing on each of these committees' programmes, by committee id. A
 * committee with nothing left on its programme is simply missing from the map.
 *
 * Each committee gets its own one-row query (see `readNextCommitteeEvent`), and
 * they are all sent at once, so the page waits for the slowest of them rather
 * than for their sum. A person takes part in a handful of committees, so this
 * is a handful of small requests.
 */
async function readNextCommitteeEvents(
	supabase: SupabaseClient,
	committeeIds: string[],
	now: Date
): Promise<Map<string, MyCommitteeEvent>> {
	const nextEvents = await Promise.all(
		committeeIds.map((committeeId) => readNextCommitteeEvent(supabase, committeeId, now))
	);
	const nextEventByCommittee = new Map<string, MyCommitteeEvent>();

	// `Promise.all` keeps the answers in the order the ids were given, so the
	// answer at each index belongs to the committee id at the same index.
	committeeIds.forEach((committeeId, index) => {
		const nextEvent = nextEvents[index];

		if (nextEvent !== null) {
			nextEventByCommittee.set(committeeId, nextEvent);
		}
	});

	return nextEventByCommittee;
}

/**
 * The ids of the committees whose room is running right now.
 *
 * `committee_state` holds one row for each committee that has ever been opened,
 * and its `mode` says what that committee is doing. Anything other than `idle`
 * is a session in progress, which is what the card's "Live now" dot means. A
 * committee nobody has opened yet has no row here at all.
 */
async function readLiveCommitteeIds(
	supabase: SupabaseClient,
	committeeIds: string[]
): Promise<Set<string>> {
	const { data, error } = await supabase
		.from('committee_state')
		.select('committee_id')
		.in('committee_id', committeeIds)
		.neq('mode', 'idle')
		.overrideTypes<LiveCommitteeRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read which of your committees are live: ${error.message}`);
	}

	const rows: LiveCommitteeRow[] = data ?? [];

	return new Set(rows.map((row) => row.committee_id));
}

/**
 * Every committee this person sits in or chairs, with the next thing on that
 * committee's programme and whether its room is running right now.
 *
 * `includesPast` keeps the committees of finished conferences in the answer;
 * without it the list is only the conferences still to come.
 */
export async function listMyCommittees(
	supabase: SupabaseClient,
	userId: string,
	now: Date,
	includesPast: boolean
): Promise<MyCommitteeRow[]> {
	// Wave one. Neither lookup needs the other's answer, so both are sent at once
	// and the page waits for the slower of the two rather than for the sum.
	const [seatRows, chairRows] = await Promise.all([
		readMySeatRows(supabase, userId),
		readMyChairRows(supabase, userId)
	]);

	// `mergeMyCommittees` puts the two lists in the page's order and gives
	// somebody who both sits in a committee and chairs it one card, not two.
	const allMemberships = mergeMyCommittees(
		toSeatMemberships(seatRows),
		toChairMemberships(chairRows)
	);

	// The finished conferences go before the two lookups below rather than after
	// them, because nothing is ever asked about a committee that is not shown.
	const memberships = includesPast
		? allMemberships
		: withoutFinishedConferences(allMemberships, now);

	if (memberships.length === 0) {
		return [];
	}

	const committeeIds = memberships.map((membership) => membership.committee.id);

	// Wave two. Both of these need the ids wave one found, which is why they are
	// a second wave; neither needs the other's answer, so the two start together.
	const [nextEventByCommittee, liveCommitteeIds] = await Promise.all([
		readNextCommitteeEvents(supabase, committeeIds, now),
		readLiveCommitteeIds(supabase, committeeIds)
	]);

	return memberships.map((membership) => {
		const committeeId = membership.committee.id;

		return {
			...membership,
			nextEvent: nextEventByCommittee.get(committeeId) ?? null,
			isLive: liveCommitteeIds.has(committeeId)
		};
	});
}
