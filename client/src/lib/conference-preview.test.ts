import { describe, expect, it } from 'vitest';
import { conferencePreview, type PreviewConference } from './conference-preview';

/** A moment while the conference below takes applications. */
const NOW = new Date('2026-11-15T10:00:00Z');

/** A draft as the Publish page sees it, with everything filled in. */
const CONFERENCE: PreviewConference = {
	name: 'Northbridge MUN 2027',
	bannerPath: null,
	startDate: '2027-03-12',
	endDate: '2027-03-14',
	venueName: 'Northbridge Hall',
	city: 'London',
	level: 'mixed',
	committeeNames: ['HRC', 'DISEC', 'SPECPOL', 'UNSC'],
	status: 'draft',
	applicationOpenMode: 'on_publish',
	timezone: 'Europe/London',
	applicationsOpenAt: '2026-10-01T09:00:00Z',
	applicationsCloseAt: '2027-01-31T23:59:00Z'
};

describe('conferencePreview', () => {
	it('writes the dates and the place on one line', () => {
		const preview = conferencePreview(CONFERENCE, NOW);

		expect(preview.datesAndPlace).toBe('12 – 14 Mar 2027 · Northbridge Hall, London');
	});

	it('leaves out a venue that is not filled in', () => {
		const preview = conferencePreview({ ...CONFERENCE, venueName: null }, NOW);

		expect(preview.datesAndPlace).toBe('12 – 14 Mar 2027 · London');
	});

	it('names who the conference is for', () => {
		expect(conferencePreview(CONFERENCE, NOW).levelLabel).toBe('High school and university');
	});

	it('shows two committees and counts the rest', () => {
		expect(conferencePreview(CONFERENCE, NOW).committeeChips).toEqual(['HRC', 'DISEC', '+2']);
	});

	it('says when applications close while it is a draft', () => {
		expect(conferencePreview(CONFERENCE, NOW).closingLine).toBe('Applications close 31 Jan 2027');
	});

	it('says applications are open once it is published and taking them', () => {
		const published: PreviewConference = { ...CONFERENCE, status: 'published' };

		expect(conferencePreview(published, NOW).closingLine).toBe(
			'Applications open · close 31 Jan 2027'
		);
	});

	it('says nothing about applications without a closing date', () => {
		const preview = conferencePreview({ ...CONFERENCE, applicationsCloseAt: null }, NOW);

		expect(preview.closingLine).toBeNull();
	});
});
