import { describe, expect, it } from 'vitest';
import { publishedHeadline, publishedNextSteps } from './published-page';

/** A conference that has just been published, while its window is open. */
const CONFERENCE = {
	name: 'Northbridge MUN 2027',
	status: 'published' as const,
	timezone: 'Europe/London',
	applicationOpenMode: 'scheduled' as const,
	applicationsOpenAt: '2026-10-01T09:00:00Z',
	applicationsCloseAt: '2027-01-31T23:59:00Z'
};

/** A moment inside that window. */
const NOW = new Date('2026-11-15T10:00:00Z');

describe('publishedHeadline', () => {
	it('says people can apply now, and until when', () => {
		expect(publishedHeadline(CONFERENCE, NOW)).toEqual({
			title: 'Northbridge MUN 2027 is open for applications.',
			sentence: 'Anyone with the link can read the page and apply until 31 Jan 2027.'
		});
	});

	it('says when applications open when that is still to come', () => {
		const later = { ...CONFERENCE, applicationsOpenAt: '2026-12-01T09:00:00Z' };

		expect(publishedHeadline(later, NOW)).toEqual({
			title: 'Northbridge MUN 2027 is public.',
			sentence: 'Anyone with the link can read the page. Applications open on 1 Dec 2026.'
		});
	});

	it('says applications are not open yet while the organiser has still to open them', () => {
		const waiting = {
			...CONFERENCE,
			applicationOpenMode: 'manual' as const,
			applicationsOpenAt: null
		};

		expect(publishedHeadline(waiting, NOW)).toEqual({
			title: 'Northbridge MUN 2027 is public.',
			sentence: 'Anyone with the link can read the page. Applications are not open yet.'
		});
	});

	it('says applications have closed once they have', () => {
		const closed = { ...CONFERENCE, applicationsCloseAt: '2026-11-01T09:00:00Z' };

		expect(publishedHeadline(closed, NOW).sentence).toBe(
			'Anyone with the link can read the page. Applications have closed.'
		);
	});
});

describe('publishedNextSteps', () => {
	it('starts with the chairs while a committee has none', () => {
		const steps = publishedNextSteps('northbridge-mun-2027', 'DISEC has no chair yet.');

		expect(steps.map((step) => step.title)).toEqual([
			'Invite your chairs',
			'Build the schedule',
			'Upload the rules of procedure'
		]);
		expect(steps[0]).toMatchObject({
			detail: 'DISEC has no chair yet.',
			linkLabel: 'Team',
			href: '/manage/northbridge-mun-2027/team'
		});
	});

	it('leaves the chairs out once every committee has one', () => {
		const steps = publishedNextSteps('northbridge-mun-2027', null);

		expect(steps.map((step) => step.key)).toEqual(['schedule', 'documents']);
		expect(steps[1].href).toBe('/manage/northbridge-mun-2027/documents');
	});
});
