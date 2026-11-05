/**
 * What the conference dashboard reads for the sections of one phase only (T173).
 *
 * Files under `$lib/server` only ever run on the server. Each read here runs
 * only in the phases that draw what it reads (`05-pages/organiser/dashboard.md`,
 * "Data"), so a dashboard before the conference never pays for a Rooms query it
 * will not draw. Every read starts at once and the page waits for the slowest.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ManagedCommittee } from '$lib/committees';
import type { ConferencePhase } from '$lib/conference-phase';
import { NO_ALLOCATION_FACTS, type AllocationFacts } from '$lib/dashboard-allocation';
import { NO_UNPAID_INVOICES, type UnpaidInvoices } from '$lib/dashboard-invoices';
import type { DashboardRoom } from '$lib/dashboard-rooms';
import type { TodayScheduleEvent } from '$lib/dashboard-today';
import { NO_WAITING_FACTS, type WaitingFacts } from '$lib/dashboard-waiting';
import { hasSeatedDelegates } from '$lib/server/conferences';
import { loadAllocationFacts } from '$lib/server/dashboard-allocation';
import { loadUnpaidInvoices } from '$lib/server/dashboard-invoices';
import { loadDashboardRooms } from '$lib/server/dashboard-rooms';
import { loadTodaySchedule } from '$lib/server/dashboard-today';
import { loadWaitingFacts } from '$lib/server/dashboard-waiting';
import { listCommitteesForManage } from '$lib/server/manage-committees';

/** How many of the conference's awards chairs have proposed, and how many are confirmed. */
export type AwardCounts = {
	proposed: number;
	confirmed: number;
};

/** Everything the phase's own sections need. What a phase does not draw is left empty. */
export type PhaseCards = {
	/** Every phase: each committee's seats, chairs and papers. */
	committees: ManagedCommittee[];
	/** Applications and Allocation: whether anybody holds a seat, which hides "Unpublish". */
	isAnybodySeated: boolean;
	/** Applications and Allocation: what is waiting for a decision. */
	waiting: WaitingFacts;
	/** Allocation: the delegations short of seats, the programme's days and its visibility. */
	allocation: AllocationFacts;
	/** Allocation onwards: the invoices still unpaid. */
	unpaidInvoices: UnpaidInvoices;
	/** Conference days: every committee room. */
	rooms: DashboardRoom[];
	/** Conference days: the events of today. */
	todayEvents: TodayScheduleEvent[];
	/** After: how many awards are proposed and confirmed. */
	awardCounts: AwardCounts;
};

/** The conference whose sections are read: its id, and its timezone for "today". */
type CardsConference = {
	id: string;
	timezone: string;
};

/** How many of the conference's awards are proposed and how many confirmed. */
async function countAwards(supabase: SupabaseClient, conferenceId: string): Promise<AwardCounts> {
	// An award belongs to a committee, so `committees!inner(...)` joins it to
	// filter on the committee's conference.
	const { data, error } = await supabase
		.from('awards')
		.select('status, committees!inner(conference_id)')
		.eq('committees.conference_id', conferenceId)
		.overrideTypes<{ status: 'proposed' | 'confirmed' }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not count the awards: ${error.message}`);
	}

	const rows = data ?? [];
	const proposed = rows.filter((row) => row.status === 'proposed').length;

	return { proposed, confirmed: rows.length - proposed };
}

/** Whether the conference is taking applications or allocating seats. */
function isBeforeTheDays(phase: ConferencePhase): boolean {
	return phase === 'applications' || phase === 'allocation';
}

/** Whether invoices can be owed yet: once seats are being given, and from then on. */
function hasInvoicesToChase(phase: ConferencePhase): boolean {
	return phase === 'allocation' || phase === 'conference-days' || phase === 'after';
}

/**
 * The reads of the sections `phase` draws, all started at once. A read the
 * phase does not need is answered with its empty value straight away.
 */
export async function loadPhaseCards(
	supabase: SupabaseClient,
	conference: CardsConference,
	phase: ConferencePhase,
	now: Date
): Promise<PhaseCards> {
	const isConferenceDay = phase === 'conference-days';
	const id = conference.id;

	const [
		committees,
		isAnybodySeated,
		waiting,
		allocation,
		unpaidInvoices,
		rooms,
		todayEvents,
		awardCounts
	] = await Promise.all([
		listCommitteesForManage(supabase, id),
		isBeforeTheDays(phase) ? hasSeatedDelegates(supabase, id) : false,
		isBeforeTheDays(phase) ? loadWaitingFacts(supabase, id) : NO_WAITING_FACTS,
		phase === 'allocation' ? loadAllocationFacts(supabase, id) : NO_ALLOCATION_FACTS,
		hasInvoicesToChase(phase) ? loadUnpaidInvoices(supabase, id) : NO_UNPAID_INVOICES,
		isConferenceDay ? loadDashboardRooms(supabase, id) : [],
		isConferenceDay ? loadTodaySchedule(supabase, id, conference.timezone, now) : [],
		phase === 'after' ? countAwards(supabase, id) : { proposed: 0, confirmed: 0 }
	]);

	return {
		committees,
		isAnybodySeated,
		waiting,
		allocation,
		unpaidInvoices,
		rooms,
		todayEvents,
		awardCounts
	};
}
