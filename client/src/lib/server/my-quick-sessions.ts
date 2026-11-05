/**
 * The quick sessions one person chairs, for "Quick sessions" on `/home`
 * (`docs/home.md`, section 3.9).
 *
 * `loadHomeDashboard` already reads the person's chair rows with each
 * conference's `kind`, so it hands over the quick sessions' committees and this
 * file only asks the one thing those rows do not say: each committee's newest
 * session, for the row's quiet line and the order of the list.
 *
 * Files under `$lib/server` only ever run on the server. The reader is the
 * person signed in, and a quick session's chair may read its committee and its
 * sessions, so Row Level Security lets this through.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
	toMyQuickSessions,
	type MyQuickSession,
	type QuickSessionSource,
	type QuickSessionStatus
} from '$lib/my-quick-sessions';

/** A quick session's committee as the home dashboard's chair rows already read it. */
export type QuickSessionCommittee = {
	committeeId: string;
	committeeName: string;
	committeeSlug: string;
	conferenceSlug: string;
	/** The conference's timezone. */
	timezone: string;
};

/** One `committee_sessions` row, embedded in its committee. */
type SessionRow = {
	name: string;
	status: QuickSessionStatus;
	started_at: string | null;
};

/**
 * One `committees` row with at most one session attached, the newest.
 * `committee_sessions(...)` follows the sessions' foreign key back to the
 * committee, so Supabase answers with a list, which the query cuts to one.
 */
type CommitteeWithLatestSessionRow = {
	id: string;
	created_at: string;
	committee_sessions: SessionRow[];
};

/**
 * Every quick session among `committees`, as "Quick sessions" draws it,
 * most recently used first. One query for all of them: the committees, each
 * with its newest session alone, which PostgREST cuts per committee
 * (`referencedTable`), so a quick session run a hundred times sends one row.
 */
export async function listMyQuickSessions(
	supabase: SupabaseClient,
	committees: QuickSessionCommittee[]
): Promise<MyQuickSession[]> {
	// Somebody who has never run a quick session gets nothing, and an empty list
	// would have to be written as `in.()`, which PostgREST refuses.
	if (committees.length === 0) return [];

	const { data, error } = await supabase
		.from('committees')
		.select('id, created_at, committee_sessions(name, status, started_at)')
		.in(
			'id',
			committees.map((committee) => committee.committeeId)
		)
		.order('created_at', { referencedTable: 'committee_sessions', ascending: false })
		.limit(1, { referencedTable: 'committee_sessions' })
		// Replaces Supabase's guess at the row's shape with our own. It has to come last.
		.overrideTypes<CommitteeWithLatestSessionRow[], { merge: false }>();

	// The dashboard is all or nothing (`home.md`, "States"), as every other
	// lookup of it.
	if (error) {
		throw new Error(`Could not read your quick sessions: ${error.message}`);
	}

	const rowsById = new Map((data ?? []).map((row) => [row.id, row]));
	const sources: QuickSessionSource[] = [];

	for (const committee of committees) {
		const row = rowsById.get(committee.committeeId);

		// A committee that did not come back could not be read, so it has no
		// session to describe and nothing to sort it by.
		if (row === undefined) continue;

		const latest = row.committee_sessions[0];

		sources.push({
			...committee,
			committeeCreatedAt: row.created_at,
			latestSession:
				latest === undefined
					? null
					: { name: latest.name, status: latest.status, startedAt: latest.started_at }
		});
	}

	return toMyQuickSessions(sources);
}
