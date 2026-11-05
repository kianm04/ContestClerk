/**
 * The two bulk decisions of the organiser's applications table at
 * `/manage/[slug]/applications`: waitlisting and rejecting every ticked
 * application at once. Accepting is not here, because it puts somebody in a
 * seat: that is `acceptApplication` in `./seat-acceptance.ts`.
 *
 * Files under `$lib/server` only ever run on the server, so this is where the
 * database is written. Pages pass in `locals.supabase`, the client that knows
 * who is signed in, so Row Level Security and `guard_application_update`
 * decide what each caller may change.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BulkDecisionOutcome, ListedApplicationStatus } from '$lib/applications';

/**
 * The columns a bulk decision writes.
 *
 * `decided_at` and `decided_by` are set here rather than by the database,
 * because no trigger fills them in for a plain update: `accept_application` is
 * a function of ours and writes its own, and these two decisions are ordinary
 * updates with nothing of the sort behind them.
 *
 * `decision_note` is optional on purpose. See `decideApplications` below.
 */
type ApplicationDecisionColumns = {
	status: ListedApplicationStatus;
	/** An ISO timestamp. */
	decided_at: string;
	decided_by: string;
	decision_note?: string;
};

/**
 * Move every application in the list that may still move into one status, and
 * say how many really moved.
 *
 * The ids were ticked on one conference's page, so the update is scoped to
 * that conference as well as to the ids: an id from another conference that
 * found its way into the post moves nothing, whatever the policies would have
 * said about it.
 *
 * `movableFrom` is what makes the difference between "moved" and "skipped". The
 * update matches only the rows that are still in one of those statuses, so an
 * application an organiser in another tab decided a moment ago is quietly not
 * touched; asking for `.select('id')` is what tells the two apart, the way
 * `withdrawApplication` in `./applications.ts` explains.
 *
 * A note is written only when there is one to write. A blank box means "I have
 * nothing to add", not "delete what somebody already wrote to this applicant",
 * so an absent note leaves the column exactly as it was.
 */
async function decideApplications(
	supabase: SupabaseClient,
	conferenceId: string,
	applicationIds: string[],
	status: ListedApplicationStatus,
	movableFrom: ListedApplicationStatus[],
	decidedBy: string,
	decisionNote: string | null
): Promise<BulkDecisionOutcome> {
	// Nothing was ticked, and `.in('id', [])` would be a request that cannot match
	// anything.
	if (applicationIds.length === 0) {
		return { changedCount: 0, skippedCount: 0 };
	}

	const changes: ApplicationDecisionColumns = {
		status,
		decided_at: new Date().toISOString(),
		decided_by: decidedBy
	};

	if (decisionNote !== null) {
		changes.decision_note = decisionNote;
	}

	const { data, error } = await supabase
		.from('applications')
		.update(changes)
		.eq('conference_id', conferenceId)
		.in('id', applicationIds)
		.in('status', movableFrom)
		.select('id')
		.overrideTypes<{ id: string }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not save the decisions: ${error.message}`);
	}

	const changed: { id: string }[] = data ?? [];

	return {
		changedCount: changed.length,
		skippedCount: applicationIds.length - changed.length
	};
}

/**
 * Move every `submitted` application of `conferenceId` in the list to
 * `waitlisted`, and say how many moved.
 */
export async function waitlistApplications(
	supabase: SupabaseClient,
	conferenceId: string,
	applicationIds: string[],
	decidedBy: string,
	decisionNote: string | null
): Promise<BulkDecisionOutcome> {
	// Only an application still under review can be waitlisted. One that was
	// already waitlisted has nowhere to go, and a decided one is not to be
	// undecided by a tick box.
	return decideApplications(
		supabase,
		conferenceId,
		applicationIds,
		'waitlisted',
		['submitted'],
		decidedBy,
		decisionNote
	);
}

/** The same for `rejected`, which a `submitted` or a `waitlisted` application may become. */
export async function rejectApplications(
	supabase: SupabaseClient,
	conferenceId: string,
	applicationIds: string[],
	decidedBy: string,
	decisionNote: string | null
): Promise<BulkDecisionOutcome> {
	return decideApplications(
		supabase,
		conferenceId,
		applicationIds,
		'rejected',
		['submitted', 'waitlisted'],
		decidedBy,
		decisionNote
	);
}
