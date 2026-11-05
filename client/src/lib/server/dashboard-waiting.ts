/**
 * What the conference dashboard reads about the applications and delegation
 * requests still waiting for a decision, while applications are open and while
 * seats are being given (`specs/05-pages/organiser/dashboard.md`).
 *
 * Files under `$lib/server` only ever run on the server. The newest waiting
 * applications themselves, with their applicants' names, come from
 * `loadConferenceDashboard` in `./manage.ts`; this adds what that one does not
 * read: how old the oldest is, which committee each named first, and the
 * delegation requests.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DelegationRequest, WaitingFacts } from '$lib/dashboard-waiting';

/** One waiting `applications` row: when it came, and the committees in the order it ranked them. */
type WaitingApplicationRow = {
	id: string;
	committee_preferences: string[];
	submitted_at: string | null;
};

/** One waiting row of the `delegations_with_heads` view. */
type WaitingDelegationRow = {
	id: string;
	name: string;
	institution_name: string | null;
	requested_seats: number;
	/** `null` when the view finds no head, which the page reads as nobody. */
	head_names: string[] | null;
};

/** Every application sent in and not yet decided, oldest first. */
async function readWaitingApplications(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<WaitingApplicationRow[]> {
	const { data, error } = await supabase
		.from('applications')
		.select('id, committee_preferences, submitted_at')
		.eq('conference_id', conferenceId)
		.eq('status', 'submitted')
		.order('submitted_at', { ascending: true })
		.overrideTypes<WaitingApplicationRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the waiting applications: ${error.message}`);
	}

	return data ?? [];
}

/**
 * Every delegation request sent in and not yet decided, oldest first.
 *
 * The view rather than `delegations` itself, because it carries the heads'
 * names, which `delegations` could only reach through `auth.users`.
 */
async function readDelegationRequests(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<DelegationRequest[]> {
	const { data, error } = await supabase
		.from('delegations_with_heads')
		.select('id, name, institution_name, requested_seats, head_names')
		.eq('conference_id', conferenceId)
		.eq('status', 'submitted')
		.order('submitted_at', { ascending: true })
		.overrideTypes<WaitingDelegationRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the waiting delegation requests: ${error.message}`);
	}

	const rows: WaitingDelegationRow[] = data ?? [];

	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		institutionName: row.institution_name,
		requestedSeats: row.requested_seats,
		headNames: row.head_names ?? []
	}));
}

/**
 * How old the oldest waiting application is, which committee each one named
 * first, and the waiting delegation requests. Both reads start at once.
 */
export async function loadWaitingFacts(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<WaitingFacts> {
	const [applications, delegationRequests] = await Promise.all([
		readWaitingApplications(supabase, conferenceId),
		readDelegationRequests(supabase, conferenceId)
	]);

	const firstPreferenceByApplication: Record<string, string> = {};

	for (const application of applications) {
		const firstCommitteeId = application.committee_preferences[0];

		if (firstCommitteeId !== undefined) {
			firstPreferenceByApplication[application.id] = firstCommitteeId;
		}
	}

	return {
		oldestApplicationAt: applications[0]?.submitted_at ?? null,
		firstPreferenceByApplication,
		delegationRequests
	};
}
