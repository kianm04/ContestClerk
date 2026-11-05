/**
 * What the conference dashboard reads while seats are being given, before the
 * first day: the accepted delegations and their seats, when each schedule event
 * starts, and whether the programme is public
 * (`specs/05-pages/organiser/dashboard.md`, "Allocation").
 *
 * Files under `$lib/server` only ever run on the server. All three reads start
 * at once and the page waits for the slowest.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
	shortOfSeats,
	type AllocationFacts,
	type DelegationSeats
} from '$lib/dashboard-allocation';
import { readSchedulePublicity } from '$lib/server/schedule';

/** One accepted delegation, with one row per seat held for it. */
type AcceptedDelegationRow = {
	id: string;
	name: string;
	requested_seats: number;
	seats: { id: string }[];
};

/** The accepted delegations of the conference, each with how many seats it holds. */
async function readAcceptedDelegations(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<DelegationSeats[]> {
	// `seats(id)` brings along every seat whose `delegation_id` points at the
	// delegation, so one request counts them all.
	const { data, error } = await supabase
		.from('delegations')
		.select('id, name, requested_seats, seats(id)')
		.eq('conference_id', conferenceId)
		.eq('status', 'accepted')
		.order('name', { ascending: true })
		.overrideTypes<AcceptedDelegationRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the accepted delegations: ${error.message}`);
	}

	const rows: AcceptedDelegationRow[] = data ?? [];

	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		requestedSeats: row.requested_seats,
		givenSeats: row.seats.length
	}));
}

/** When each of the conference's schedule events starts. */
async function readEventStarts(supabase: SupabaseClient, conferenceId: string): Promise<string[]> {
	const { data, error } = await supabase
		.from('schedule_events')
		.select('starts_at')
		.eq('conference_id', conferenceId)
		.overrideTypes<{ starts_at: string }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the schedule: ${error.message}`);
	}

	const rows = data ?? [];

	return rows.map((row) => row.starts_at);
}

/** The delegations short of seats, the events' start times and the programme's visibility. */
export async function loadAllocationFacts(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<AllocationFacts> {
	const [delegations, eventStarts, isProgrammePublic] = await Promise.all([
		readAcceptedDelegations(supabase, conferenceId),
		readEventStarts(supabase, conferenceId),
		readSchedulePublicity(supabase, conferenceId)
	]);

	return { shortDelegations: shortOfSeats(delegations), eventStarts, isProgrammePublic };
}
