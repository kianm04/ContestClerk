import { describe, expect, it } from 'vitest';
import { appliedText, NO_WAITING_FACTS, waitingRows } from './dashboard-waiting';

/** Eleven in the morning in London, on Friday 2 October 2026. */
const NOW = new Date('2026-10-02T10:00:00Z');

describe('appliedText', () => {
	it('says Today and Yesterday, and the day and month for anything older', () => {
		expect(appliedText('2026-10-02T08:00:00Z', NOW, 'Europe/London')).toBe('Today');
		expect(appliedText('2026-10-01T20:00:00Z', NOW, 'Europe/London')).toBe('Yesterday');
		// The British short month for September is "Sept", as everywhere else in the app.
		expect(appliedText('2026-09-26T09:00:00Z', NOW, 'Europe/London')).toBe('26 Sept');
	});

	it('reads the day in the conference timezone', () => {
		// 23:30 UTC on 1 October is already 2 October in Amsterdam.
		expect(appliedText('2026-10-01T23:30:00Z', NOW, 'Europe/Amsterdam')).toBe('Today');
	});

	it('writes a dash for an application without a moment', () => {
		expect(appliedText(null, NOW, 'Europe/London')).toBe('–');
	});
});

describe('waitingRows', () => {
	const committees = [
		{ id: 'disec-id', name: 'Disarmament and International Security', abbreviation: 'DISEC' },
		{ id: 'hrc-id', name: 'Human Rights Council', abbreviation: null }
	];

	it("names each applicant's first preference by the committee's short name", () => {
		const facts = {
			...NO_WAITING_FACTS,
			firstPreferenceByApplication: { 'louis-id': 'disec-id', 'sofia-id': 'hrc-id' }
		};

		const rows = waitingRows(
			[
				{
					id: 'louis-id',
					applicantName: 'Louis Bernard',
					institutionName: 'Sciences Po',
					submittedAt: '2026-09-26T09:00:00Z'
				},
				{
					id: 'sofia-id',
					applicantName: 'Sofía Hernández',
					institutionName: null,
					submittedAt: '2026-10-01T09:00:00Z'
				}
			],
			facts,
			committees,
			NOW,
			'Europe/London'
		);

		expect(rows).toEqual([
			{
				id: 'louis-id',
				applicantName: 'Louis Bernard',
				institutionName: 'Sciences Po',
				firstPreference: 'DISEC',
				applied: '26 Sept'
			},
			{
				id: 'sofia-id',
				applicantName: 'Sofía Hernández',
				institutionName: null,
				firstPreference: 'Human Rights Council',
				applied: 'Yesterday'
			}
		]);
	});

	it('writes a dash for an application whose first preference is unknown', () => {
		const rows = waitingRows(
			[{ id: 'x', applicantName: 'Ana Lima', institutionName: null, submittedAt: null }],
			NO_WAITING_FACTS,
			committees,
			NOW,
			'Europe/London'
		);

		expect(rows[0].firstPreference).toBe('–');
	});
});
