import { describe, expect, it } from 'vitest';
import { attentionTitle, dashboardAttention, type AttentionFacts } from './dashboard-attention';
import { QUIET_ATTENTION_FACTS, SAMPLE_COMMITTEE } from './dashboard-attention-samples';

/** A committee nobody chairs and with no free seat. */
const FULL_UNCHAIRED = {
	...SAMPLE_COMMITTEE,
	id: 'disec-id',
	name: 'Disarmament and International Security',
	abbreviation: 'DISEC',
	chairNames: [],
	seatCounts: { available: 2, filled: 2, reserved: 0, total: 2 },
	positionPaperCount: 0
};

/** Everything that can be waiting at once, in every phase. */
const BUSY_FACTS: AttentionFacts = {
	...QUIET_ATTENTION_FACTS,
	stats: { ...QUIET_ATTENTION_FACTS.stats, applicationsToReview: 2 },
	committees: [SAMPLE_COMMITTEE, FULL_UNCHAIRED],
	waiting: {
		oldestApplicationAt: '2026-09-26T10:00:00Z',
		firstPreferenceByApplication: {},
		delegationRequests: [
			{
				id: 'harbour-id',
				name: 'Harbour View',
				institutionName: 'Harbour View College',
				requestedSeats: 3,
				headNames: ['Andrew Blake']
			}
		]
	},
	allocation: {
		shortDelegations: [
			{ id: 'harbour-id', name: 'Harbour View', requestedSeats: 3, givenSeats: 2 }
		],
		eventStarts: [],
		isProgrammePublic: false
	},
	unpaidInvoices: {
		count: 1,
		totalCents: 4500,
		oldestCreatedAt: '2026-09-20T10:00:00Z',
		onlyPayerName: 'Maya Thompson'
	},
	rooms: [
		{
			committeeId: 'disec-id',
			committeeSlug: 'disec',
			committeeName: 'DISEC',
			session: { name: 'Session 2', mode: 'formal_debate' },
			presentCount: 1,
			lastSession: null,
			seatedCount: 2,
			absentees: [{ fullName: 'Zoe Adams', seatName: 'Nigeria', markedAt: '2026-10-02T10:02:00Z' }]
		}
	],
	awardCounts: { proposed: 3, confirmed: 2 },
	hasFeesOrManualCollection: false
};

/** The keys of the lines drawn for `phase`, in order. */
function keysOf(phase: Parameters<typeof dashboardAttention>[0], facts: AttentionFacts): string[] {
	return dashboardAttention(phase, facts).map((item) => item.key);
}

describe('dashboardAttention', () => {
	it('lists nothing when nothing is waiting, in any phase', () => {
		const quiet = { ...QUIET_ATTENTION_FACTS, stats: { ...QUIET_ATTENTION_FACTS.stats } };

		quiet.stats.seatsFilled = 0;

		for (const phase of ['applications', 'allocation', 'conference-days', 'after'] as const) {
			expect(dashboardAttention(phase, quiet)).toEqual([]);
		}
	});

	it('puts applications first while they are open, and fees last', () => {
		expect(keysOf('applications', BUSY_FACTS)).toEqual([
			'applications',
			'delegation-request',
			'no-chair',
			'full-committee-disec-id',
			'no-fees'
		]);
	});

	it('puts the delegations short of seats first while seats are given', () => {
		expect(keysOf('allocation', BUSY_FACTS)).toEqual([
			'short-delegation',
			'applications',
			'delegation-request',
			'unpaid',
			'no-chair',
			'empty-schedule',
			'missing-papers'
		]);
	});

	it('names the absent delegates and the money owed on a conference day', () => {
		expect(keysOf('conference-days', BUSY_FACTS)).toEqual(['absent-DISEC-Nigeria', 'unpaid']);
	});

	it('puts the awards first once it is over, then the last jobs', () => {
		expect(keysOf('after', BUSY_FACTS)).toEqual([
			'proposed-awards',
			'unpaid',
			'thank-delegates',
			'export-participants'
		]);
	});

	it('has no lines for a draft, which never reaches the dashboard', () => {
		expect(dashboardAttention('setup', BUSY_FACTS)).toEqual([]);
	});
});

describe('attentionTitle', () => {
	it('says "Wrapping up" once it is over and "Needs you" before', () => {
		expect(attentionTitle('applications')).toBe('Needs you');
		expect(attentionTitle('conference-days')).toBe('Needs you');
		expect(attentionTitle('after')).toBe('Wrapping up');
	});
});
