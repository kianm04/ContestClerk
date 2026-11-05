/**
 * The "Needs you" list of the conference dashboard: what is waiting for the
 * organiser in the phase the conference is in, each line ending with the
 * button that opens that work (`specs/05-pages/organiser/dashboard.md`,
 * "Needs you").
 *
 * Nothing here talks to Supabase or knows any Svelte. The lines themselves are
 * written in three files by topic: `dashboard-attention-people.ts` (people
 * waiting for an answer), `dashboard-attention-setup.ts` (the set-up coming
 * undone) and `dashboard-attention-wrap-up.ts` (money, awards and the last
 * jobs). This file only chooses which of them each phase draws, in what order.
 */

import type { ResolvedPathname } from '$app/types';
import type { ManagedCommittee } from '$lib/committees';
import type { ConferencePhase } from '$lib/conference-phase';
import type { Conference } from '$lib/conferences';
import type { AllocationFacts } from '$lib/dashboard-allocation';
import type { UnpaidInvoices } from '$lib/dashboard-invoices';
import type { DashboardRoom } from '$lib/dashboard-rooms';
import type { WaitingFacts } from '$lib/dashboard-waiting';
import type { DashboardStats } from '$lib/manage';
import {
	absenteeLines,
	delegationRequestLines,
	shortDelegationLines,
	waitingApplicationLines
} from '$lib/dashboard-attention-people';
import {
	emptyProgrammeLines,
	fullCommitteeLines,
	missingPaperLines,
	noChairLines,
	noFeeLines
} from '$lib/dashboard-attention-setup';
import {
	exportParticipantLines,
	proposedAwardLines,
	thankDelegateLines,
	unpaidInvoiceLines
} from '$lib/dashboard-attention-wrap-up';

/** One line of the list: what is waiting, and the button that goes to where it is done. */
export type AttentionItem = {
	/** Fixed and distinct within one list, so the list can be keyed by it. */
	key: string;
	/** What is waiting: "4 applications are waiting for a decision". */
	title: string;
	/** One more sentence about it, or `null` when the title says it all. */
	detail: string | null;
	/** What the button says: "Review applications". */
	actionLabel: string;
	/** The page that holds the work, already filtered to it. */
	href: ResolvedPathname;
};

/** The conference columns the lines are written from. */
export type AttentionConference = Pick<
	Conference,
	'slug' | 'timezone' | 'startDate' | 'endDate' | 'positionPaperRequired' | 'positionPaperDeadline'
>;

/**
 * Everything the lines are written from. `load` reads only what the phase
 * draws and hands an empty value for the rest, so an empty answer never turns
 * into a line.
 */
export type AttentionFacts = {
	conference: AttentionConference;
	/** The moment the page was drawn, read once by `load`. */
	now: Date;
	stats: DashboardStats;
	committees: ManagedCommittee[];
	waiting: WaitingFacts;
	allocation: AllocationFacts;
	unpaidInvoices: UnpaidInvoices;
	rooms: DashboardRoom[];
	/** How many awards chairs have proposed, and how many the organiser has confirmed. */
	awardCounts: { proposed: number; confirmed: number };
	/** Whether a fee exists or the organiser collects payments by hand. */
	hasFeesOrManualCollection: boolean;
};

/** One kind of line: it gives none, one or several lines from the facts. */
type LineWriter = (facts: AttentionFacts) => AttentionItem[];

/**
 * The kinds of line each phase draws, most urgent first. The first line's
 * button is the page's one filled button in every phase but the conference
 * days, where "Post an announcement" is.
 */
const LINES_OF_PHASE: Record<ConferencePhase, LineWriter[]> = {
	setup: [],
	applications: [
		waitingApplicationLines,
		delegationRequestLines,
		noChairLines,
		fullCommitteeLines,
		noFeeLines
	],
	allocation: [
		shortDelegationLines,
		waitingApplicationLines,
		delegationRequestLines,
		unpaidInvoiceLines,
		noChairLines,
		emptyProgrammeLines,
		missingPaperLines
	],
	'conference-days': [absenteeLines, unpaidInvoiceLines],
	after: [proposedAwardLines, unpaidInvoiceLines, thankDelegateLines, exportParticipantLines]
};

/**
 * What the organiser should look at, for `phase`. A line appears only while
 * there is something to do, so an empty list means nothing is waiting. A draft
 * has no lines: it never reaches the dashboard.
 */
export function dashboardAttention(phase: ConferencePhase, facts: AttentionFacts): AttentionItem[] {
	const writers = LINES_OF_PHASE[phase];

	return writers.flatMap((writeLines) => writeLines(facts));
}

/**
 * The list's heading: "Wrapping up" once the conference is over, when what is
 * left is the last jobs rather than anything urgent, and "Needs you" before.
 */
export function attentionTitle(phase: ConferencePhase): string {
	if (phase === 'after') {
		return 'Wrapping up';
	}

	return 'Needs you';
}
