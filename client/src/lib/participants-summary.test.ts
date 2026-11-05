import { describe, expect, it } from 'vitest';
import type { ParticipantTotals } from './participants';
import { participantsSummary } from './participants-summary';

/** Nine delegates in two committees, three unpaid and three papers missing. */
const TOTALS: ParticipantTotals = {
	participantCount: 9,
	unpaidCount: 3,
	missingPaperCount: 3,
	countByCommittee: { disec: 6, unsc: 3, ecosoc: 0 }
};

describe('participantsSummary', () => {
	it('says how many are seated where, and what is owed or missing', () => {
		expect(participantsSummary(TOTALS)).toBe(
			'9 delegates in 2 committees. 3 have not paid and 3 papers are missing.'
		);
	});

	it('uses the singular for one of each', () => {
		const totals = {
			participantCount: 1,
			unpaidCount: 1,
			missingPaperCount: 1,
			countByCommittee: { unsc: 1 }
		};

		expect(participantsSummary(totals)).toBe(
			'1 delegate in 1 committee. 1 has not paid and 1 paper is missing.'
		);
	});

	it('names only the half of the second sentence that is not zero', () => {
		expect(participantsSummary({ ...TOTALS, missingPaperCount: 0 })).toBe(
			'9 delegates in 2 committees. 3 have not paid.'
		);
		expect(participantsSummary({ ...TOTALS, unpaidCount: 0 })).toBe(
			'9 delegates in 2 committees. 3 papers are missing.'
		);
	});

	it('leaves the second sentence out when nothing is owed or missing', () => {
		const settled = { ...TOTALS, unpaidCount: 0, missingPaperCount: 0 };

		expect(participantsSummary(settled)).toBe('9 delegates in 2 committees.');
	});

	it('has nothing to say while nobody is seated', () => {
		const empty = {
			participantCount: 0,
			unpaidCount: 0,
			missingPaperCount: 0,
			countByCommittee: {}
		};

		expect(participantsSummary(empty)).toBeNull();
	});
});
