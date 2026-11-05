import { describe, expect, it } from 'vitest';
import { manageStatusLine, type ManageStatusFields } from './manage-status';

/** A published conference from 12 to 14 March 2027 in London, applications open all winter. */
const PUBLISHED: ManageStatusFields = {
	status: 'published',
	startDate: '2027-03-12',
	endDate: '2027-03-14',
	timezone: 'Europe/London',
	applicationsOpenAt: '2026-11-01T09:00:00Z',
	applicationsCloseAt: '2027-01-31T23:59:00Z',
	applicationOpenMode: 'scheduled'
};

describe('manageStatusLine', () => {
	it('says a draft is not public, whatever the date', () => {
		const line = manageStatusLine(
			{ ...PUBLISHED, status: 'draft' },
			new Date('2027-03-13T10:00:00Z')
		);

		expect(line).toEqual({ text: 'Draft · not public', tone: 'neutral' });
	});

	it('says an archived conference is archived', () => {
		const line = manageStatusLine({ ...PUBLISHED, status: 'archived' }, new Date('2026-12-01'));

		expect(line).toEqual({ text: 'Archived', tone: 'neutral' });
	});

	it('names the day applications open while the window is still ahead', () => {
		const line = manageStatusLine(PUBLISHED, new Date('2026-10-02T12:00:00Z'));

		expect(line).toEqual({ text: 'Applications open on 1 Nov', tone: 'neutral' });
	});

	it('is green while applications are open', () => {
		const line = manageStatusLine(PUBLISHED, new Date('2026-12-01T12:00:00Z'));

		expect(line).toEqual({ text: 'Applications open', tone: 'success' });
	});

	it('says applications are open when the window has no opening moment', () => {
		const line = manageStatusLine(
			{ ...PUBLISHED, applicationsOpenAt: null, applicationOpenMode: 'on_publish' },
			new Date('2026-10-02T12:00:00Z')
		);

		expect(line).toEqual({ text: 'Applications open', tone: 'success' });
	});

	it('says applications are not open yet while the organiser has still to open them', () => {
		const line = manageStatusLine(
			{ ...PUBLISHED, applicationsOpenAt: null, applicationOpenMode: 'manual' },
			new Date('2026-10-02T12:00:00Z')
		);

		expect(line).toEqual({ text: 'Applications not open yet', tone: 'neutral' });
	});

	it('says applications are closed between the window and the first day', () => {
		const line = manageStatusLine(PUBLISHED, new Date('2027-02-15T12:00:00Z'));

		expect(line).toEqual({ text: 'Applications closed', tone: 'neutral' });
	});

	it('counts the days of the conference where it is held', () => {
		const line = manageStatusLine(PUBLISHED, new Date('2027-03-13T10:00:00Z'));

		expect(line).toEqual({ text: 'Day 2 of 3', tone: 'brand' });
	});

	it('says the conference has ended once its last day is over', () => {
		const line = manageStatusLine(PUBLISHED, new Date('2027-03-20T10:00:00Z'));

		expect(line).toEqual({ text: 'Ended', tone: 'neutral' });
	});
});
