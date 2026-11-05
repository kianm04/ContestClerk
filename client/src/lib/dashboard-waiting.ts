/**
 * What is waiting for the organiser's decision while applications are open:
 * the applications in the "Waiting for a decision" table, and the delegation
 * requests the "Needs you" list names (`specs/05-pages/organiser/dashboard.md`,
 * "Applications open").
 *
 * Nothing here talks to Supabase or knows any Svelte.
 * `$lib/server/dashboard-waiting.ts` reads the rows; this file turns them into
 * the table's words.
 */

import type { ManagedCommittee } from '$lib/committees';
import { dayLabel, dayInTimezone, formatDayAndMonth } from '$lib/dates';
import type { RecentApplication } from '$lib/manage';

/** A delegation request that has been sent and not yet decided. */
export type DelegationRequest = {
	id: string;
	name: string;
	institutionName: string | null;
	/** How many seats the delegation asked for. */
	requestedSeats: number;
	/** The full names of the delegation's heads, as the delegation's page lists them. */
	headNames: string[];
};

/** What the server read about the applications and requests still waiting. */
export type WaitingFacts = {
	/** When the oldest application still waiting came in, an ISO timestamp, or `null` when none is. */
	oldestApplicationAt: string | null;
	/** The committee id each waiting application named first, by application id. */
	firstPreferenceByApplication: Record<string, string>;
	/** The waiting delegation requests, oldest first. */
	delegationRequests: DelegationRequest[];
};

/** Nothing waiting, for the phases that do not read any of it. */
export const NO_WAITING_FACTS: WaitingFacts = {
	oldestApplicationAt: null,
	firstPreferenceByApplication: {},
	delegationRequests: []
};

/** One line of the "Waiting for a decision" table, every word already written. */
export type WaitingRow = {
	id: string;
	applicantName: string;
	institutionName: string | null;
	/** The short name of the committee the applicant put first, or "–" when there is none. */
	firstPreference: string;
	/** "Today", "Yesterday", or "26 Sept" for anything older. */
	applied: string;
};

/** "Today", "Yesterday" or "26 Sept": when an application came in, as the table words it. */
export function appliedText(submittedAt: string | null, now: Date, timezone: string): string {
	if (submittedAt === null) {
		return '–';
	}

	const day = dayInTimezone(new Date(submittedAt), timezone);
	const label = dayLabel(day, now, timezone);

	// `dayLabel` writes a whole date ("12 Feb 2026") for anything further off,
	// which is longer than the column wants.
	if (label === 'Today' || label === 'Yesterday') {
		return label;
	}

	return formatDayAndMonth(submittedAt, timezone);
}

/**
 * The table's rows, in the order the applications came, with each one's first
 * preference named by the committee's short name.
 */
export function waitingRows(
	applications: RecentApplication[],
	facts: WaitingFacts,
	committees: Pick<ManagedCommittee, 'id' | 'name' | 'abbreviation'>[],
	now: Date,
	timezone: string
): WaitingRow[] {
	const committeesById = new Map(committees.map((committee) => [committee.id, committee]));

	return applications.map((application) => {
		const committeeId = facts.firstPreferenceByApplication[application.id];
		const committee = committeesById.get(committeeId);
		const firstPreference =
			committee === undefined ? '–' : (committee.abbreviation ?? committee.name);

		return {
			id: application.id,
			applicantName: application.applicantName,
			institutionName: application.institutionName,
			firstPreference,
			applied: appliedText(application.submittedAt, now, timezone)
		};
	});
}
