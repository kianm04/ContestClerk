/**
 * Making a quick session, reading one back and changing its delegations (S14,
 * D7; `05-pages/chair/quick-session.md` and `02-architecture/data-model.md`,
 * "Quick sessions").
 *
 * Files under `$lib/server` only ever run on the server. A quick session is a
 * draft conference of `kind = 'quick_session'` holding exactly one committee,
 * so once it is made the chair console, the projector and every access rule
 * work on it unchanged. The draft these functions are handed is checked first
 * by `$lib/quick-session.ts`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { QuickSessionMember, QuickSessionStart } from '$lib/quick-session';
import { slugify } from '$lib/slugs';

/** The new committee's address, which `chairRoomUrl` turns into its chair room. */
export type QuickSessionAddress = {
	conferenceSlug: string;
	committeeSlug: string;
};

/** One seat of a quick session's committee, shown or hidden. */
export type QuickSessionSeat = {
	id: string;
	name: string;
	countryCode: string | null;
	/** False for a seat "Edit delegations" removed: hidden, but kept for earlier sessions' records. */
	isAvailable: boolean;
};

/** A quick session as "Edit delegations" reads it. */
export type QuickSession = {
	conferenceId: string;
	conferenceSlug: string;
	committeeId: string;
	committeeSlug: string;
	committeeName: string;
	/** Every seat, the hidden ones too, in their order. */
	seats: QuickSessionSeat[];
	/** Whether a session is running, which refuses any change to the delegations. */
	isSessionRunning: boolean;
};

/** One row of the conference lookup, with its one committee attached. */
type QuickSessionRow = {
	id: string;
	slug: string;
	committees: { id: string; slug: string; name: string }[];
};

/** One row of the seats lookup. */
type SeatRow = {
	id: string;
	name: string;
	country_code: string | null;
	is_available: boolean;
};

/**
 * The committee's slug when its name has no letter or digit a slug can keep
 * ("!!!"). A quick session's conference holds only this one committee, so it
 * can never clash.
 */
const FALLBACK_COMMITTEE_SLUG = 'committee';

/** The committee's slug, from its name the way every committee's is. */
export function quickSessionCommitteeSlug(committeeName: string): string {
	const slug = slugify(committeeName);

	return slug === '' ? FALLBACK_COMMITTEE_SLUG : slug;
}

/** The members as the JSON array `create_quick_session` reads, in the order given. */
function seatsArgument(members: QuickSessionMember[]) {
	return members.map((member) => ({ name: member.name, country_code: member.countryCode }));
}

/**
 * A refusal `create_quick_session` worded for the chair, such as the cap of
 * 25 live quick sessions. Every `raise exception` of the function's own is a
 * sentence to show and carries PostgreSQL's code for one, `raise_exception`;
 * a failure with any other code is ours.
 */
export class QuickSessionRefusal extends Error {}

const RAISE_EXCEPTION = 'P0001';

/**
 * "Start session": make the quick session and start "Session 1" in it, as one
 * transaction (`create_quick_session`). The function writes everything or
 * nothing, so a failure leaves nothing behind; it throws, a
 * `QuickSessionRefusal` for a sentence the chair should read and a plain
 * error for a failure of ours.
 */
export async function createQuickSession(
	supabase: SupabaseClient,
	start: QuickSessionStart
): Promise<QuickSessionAddress> {
	const { data, error } = await supabase.rpc('create_quick_session', {
		committee_name: start.committeeName,
		committee_slug: quickSessionCommitteeSlug(start.committeeName),
		topic: start.agenda,
		speaking_time_seconds: start.speakingTimeSeconds,
		seats: seatsArgument(start.members),
		timezone: start.timezone
	});

	if (error) {
		if (error.code === RAISE_EXCEPTION) throw new QuickSessionRefusal(error.message);

		throw new Error(`Could not start the quick session: ${error.message}`);
	}

	// The function answers with a set of rows, one here, holding both slugs.
	// The client is not told the shape of a function's rows, so they are read
	// under our own type.
	const rows = (data ?? []) as { conference_slug: string; committee_slug: string }[];
	const address = rows[0];

	if (address === undefined) {
		throw new Error('Could not start the quick session: the database answered with no address.');
	}

	return { conferenceSlug: address.conference_slug, committeeSlug: address.committee_slug };
}

/** Every seat of the committee, the hidden ones too, in their order. */
async function readQuickSessionSeats(
	supabase: SupabaseClient,
	committeeId: string
): Promise<QuickSessionSeat[]> {
	const { data, error } = await supabase
		.from('seats')
		.select('id, name, country_code, is_available')
		.eq('committee_id', committeeId)
		.order('position', { ascending: true })
		.overrideTypes<SeatRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the quick session's delegations: ${error.message}`);
	}

	const rows: SeatRow[] = data ?? [];

	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		countryCode: row.country_code,
		isAvailable: row.is_available
	}));
}

/** Whether one of the committee's sessions is in progress. */
async function readIsSessionRunning(
	supabase: SupabaseClient,
	committeeId: string
): Promise<boolean> {
	const { data, error } = await supabase
		.from('committee_sessions')
		.select('id')
		.eq('committee_id', committeeId)
		.eq('status', 'in_progress')
		.limit(1);

	if (error) {
		throw new Error(`Could not read the quick session's sessions: ${error.message}`);
	}

	return (data ?? []).length > 0;
}

/**
 * The quick session with this conference slug: its one committee, every seat
 * and whether a session is running. Null for a slug that is not a quick
 * session, or that the reader may not read, which the page answers with a 404
 * either way.
 */
export async function getQuickSession(
	supabase: SupabaseClient,
	slug: string
): Promise<QuickSession | null> {
	const { data, error } = await supabase
		.from('conferences')
		.select('id, slug, committees(id, slug, name)')
		.eq('slug', slug)
		.eq('kind', 'quick_session')
		.overrideTypes<QuickSessionRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the quick session: ${error.message}`);
	}

	const conference = data?.[0];
	const committee = conference?.committees[0];

	if (conference === undefined || committee === undefined) return null;

	const [seats, isSessionRunning] = await Promise.all([
		readQuickSessionSeats(supabase, committee.id),
		readIsSessionRunning(supabase, committee.id)
	]);

	return {
		conferenceId: conference.id,
		conferenceSlug: conference.slug,
		committeeId: committee.id,
		committeeSlug: committee.slug,
		committeeName: committee.name,
		seats,
		isSessionRunning
	};
}

/** The committee's shown seats as the setup page's members, a country by its code. */
export function membersOfSeats(seats: QuickSessionSeat[]): QuickSessionMember[] {
	const shown = seats.filter((seat) => seat.isAvailable);

	return shown.map((seat) => ({
		value: seat.countryCode === null ? `name:${seat.name}` : `country:${seat.countryCode}`,
		name: seat.name,
		countryCode: seat.countryCode
	}));
}

/** Whether a seat is this member: a country by its code, else by its name in any capitals. */
function isSeatOf(seat: QuickSessionSeat, member: QuickSessionMember): boolean {
	if (member.countryCode !== null && seat.countryCode === member.countryCode) return true;

	return seat.name.toLowerCase() === member.name.toLowerCase();
}

/** One row of the seats upsert: an existing seat by its id, or a new one with none. */
type SeatWrite = {
	id?: string;
	committee_id: string;
	name: string;
	kind: 'country' | 'other';
	country_code: string | null;
	position: number;
	is_available: boolean;
};

/**
 * The write that makes the committee's seats match the members: each member
 * shown, in alphabetical order (a hidden seat of the same member shown again
 * rather than added twice), then every other seat hidden after them, in the
 * order it had. Pure, so the decision can be tested without a database.
 */
export function seatWrites(
	committeeId: string,
	seats: QuickSessionSeat[],
	members: QuickSessionMember[]
): SeatWrite[] {
	const writes: SeatWrite[] = [];
	const usedSeatIds = new Set<string>();

	for (const member of members) {
		const seat = seats.find(
			(candidate) => !usedSeatIds.has(candidate.id) && isSeatOf(candidate, member)
		);

		if (seat !== undefined) usedSeatIds.add(seat.id);

		writes.push({
			// A seat that already exists keeps its id, and so every record that points at it.
			...(seat === undefined ? {} : { id: seat.id }),
			committee_id: committeeId,
			name: seat?.name ?? member.name,
			kind: member.countryCode === null ? 'other' : 'country',
			country_code: member.countryCode,
			position: writes.length,
			is_available: true
		});
	}

	for (const seat of seats) {
		if (usedSeatIds.has(seat.id)) continue;

		writes.push({
			id: seat.id,
			committee_id: committeeId,
			name: seat.name,
			kind: seat.countryCode === null ? 'other' : 'country',
			country_code: seat.countryCode,
			position: writes.length,
			is_available: false
		});
	}

	return writes;
}

/**
 * "Save delegations": the new members become seats, a removed member's seat
 * is hidden (`is_available = false`) rather than deleted, so the roll calls,
 * speeches and motions of earlier sessions keep it, and every shown seat is
 * numbered again in alphabetical order, the order a chair calls them in.
 *
 * One upsert does all of it, so the list never stands half changed: a row
 * with an `id` updates that seat and a row without one is a new seat.
 * `defaultToNull: false` lets the database fill in a new seat's id rather
 * than sending it an empty one.
 */
export async function saveQuickSessionDelegations(
	supabase: SupabaseClient,
	quickSession: QuickSession,
	members: QuickSessionMember[]
): Promise<void> {
	const writes = seatWrites(quickSession.committeeId, quickSession.seats, members);

	const { error } = await supabase
		.from('seats')
		.upsert(writes, { onConflict: 'id', defaultToNull: false });

	if (error) {
		throw new Error(`Could not save the delegations: ${error.message}`);
	}
}
