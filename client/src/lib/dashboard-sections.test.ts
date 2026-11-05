import { describe, expect, it } from 'vitest';
import { SAMPLE_COMMITTEE } from './dashboard-attention-samples';
import { dashboardSections, type SectionFacts } from './dashboard-sections';
import { NO_WAITING_FACTS } from './dashboard-waiting';

/** A London conference read at 11:00 on 15 November 2026, with one committee and nothing else. */
const FACTS: SectionFacts = {
	conference: { slug: 'northbridge', timezone: 'Europe/London', positionPaperRequired: true },
	now: new Date('2026-11-15T11:00:00Z'),
	committees: [SAMPLE_COMMITTEE],
	recentApplications: [],
	waiting: NO_WAITING_FACTS,
	isProgrammePublic: true,
	rooms: [],
	todayEvents: []
};

describe('dashboardSections', () => {
	it('lists the waiting applications and the committees while applications are taken', () => {
		const sections = dashboardSections('applications', {
			...FACTS,
			recentApplications: [
				{
					id: 'application-1',
					applicantName: 'Louis Bernard',
					institutionName: 'Sciences Po',
					submittedAt: '2026-11-14T09:00:00Z'
				}
			],
			waiting: { ...NO_WAITING_FACTS, firstPreferenceByApplication: { 'application-1': 'hrc-id' } }
		});

		expect(sections).toEqual({
			phase: 'applications',
			waiting: [
				{
					id: 'application-1',
					applicantName: 'Louis Bernard',
					institutionName: 'Sciences Po',
					firstPreference: 'HRC',
					applied: 'Yesterday'
				}
			],
			committees: [expect.objectContaining({ name: 'Human Rights Council', seats: '2 of 4' })]
		});
	});

	it('lists the committees and what is left before the first day while seats are given', () => {
		const sections = dashboardSections('allocation', FACTS);

		expect(sections.phase).toBe('allocation');

		if (sections.phase === 'allocation') {
			expect(sections.committees?.map((row) => row.chair)).toEqual(['Samuel Osei']);
			expect(sections.hasPapers).toBe(true);
			expect(sections.preparation.map((item) => item.key)).toEqual([
				'programme',
				'guides',
				'register'
			]);
		}
	});

	it('draws the live panel, the rooms and today on a conference day', () => {
		const sections = dashboardSections('conference-days', FACTS);

		expect(sections).toEqual({
			phase: 'conference-days',
			panel: {
				dotText: 'No committee in session',
				dotTone: 'neutral',
				headline: 'Nothing more on the programme today',
				nextLine: null
			},
			rooms: [],
			roomsTotal: 'Present: 0 of 0 delegates in 0 rooms · As of 11:00',
			today: [],
			mayPostAnnouncement: true
		});
	});

	it('draws nothing beyond "Needs you" after the conference', () => {
		expect(dashboardSections('after', FACTS)).toEqual({ phase: 'after' });
	});
});
