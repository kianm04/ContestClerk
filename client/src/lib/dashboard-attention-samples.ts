/**
 * Sample facts for the tests of the "Needs you" lines
 * (`dashboard-attention*.test.ts`). Nothing in the app imports this file.
 *
 * `QUIET_ATTENTION_FACTS` is a conference where nothing is waiting, so a test
 * changes only the one fact it is about and every other line stays away.
 */

import type { ManagedCommittee } from '$lib/committees';
import type { AttentionFacts } from '$lib/dashboard-attention';
import { NO_ALLOCATION_FACTS } from '$lib/dashboard-allocation';
import { NO_UNPAID_INVOICES } from '$lib/dashboard-invoices';
import { NO_WAITING_FACTS } from '$lib/dashboard-waiting';

/** The Human Rights Council: one of its four seats free, chaired, both delegates' papers in. */
export const SAMPLE_COMMITTEE: ManagedCommittee = {
	id: 'hrc-id',
	slug: 'hrc',
	name: 'Human Rights Council',
	abbreviation: 'HRC',
	description: null,
	topics: [],
	level: 'intermediate',
	room: 'Room 1',
	position: 0,
	defaultSpeakingTimeSeconds: 60,
	seatCounts: { available: 4, filled: 2, reserved: 1, total: 4 },
	chairNames: ['Samuel Osei'],
	hasBackgroundGuide: true,
	positionPaperCount: 2
};

/**
 * A conference in London on 14 to 16 November 2026, read on Friday 2 October:
 * nothing waiting, every invoice paid, fees set, nobody absent, no awards.
 */
export const QUIET_ATTENTION_FACTS: AttentionFacts = {
	conference: {
		slug: 'northbridge',
		timezone: 'Europe/London',
		startDate: '2026-11-14',
		endDate: '2026-11-16',
		positionPaperRequired: true,
		positionPaperDeadline: '2026-11-06T17:00:00Z'
	},
	now: new Date('2026-10-02T10:00:00Z'),
	stats: {
		applicationsTotal: 4,
		applicationsToReview: 0,
		delegationsTotal: 1,
		delegationsToReview: 0,
		seatsAvailable: 4,
		seatsFilled: 2,
		seatsReserved: 1,
		invoicesPaidCents: 9000,
		invoicesUnpaidCents: 0,
		currency: 'GBP'
	},
	committees: [SAMPLE_COMMITTEE],
	waiting: NO_WAITING_FACTS,
	allocation: {
		...NO_ALLOCATION_FACTS,
		eventStarts: ['2026-11-14T09:00:00Z', '2026-11-15T09:00:00Z', '2026-11-16T09:00:00Z']
	},
	unpaidInvoices: NO_UNPAID_INVOICES,
	rooms: [],
	awardCounts: { proposed: 0, confirmed: 0 },
	hasFeesOrManualCollection: true
};
