import { describe, expect, it } from 'vitest';
import type { Conference } from '$lib/conferences';
import type { ConferenceFigures, ManagedConferenceSummary } from '$lib/manage';
import { conferenceListRow } from '$lib/manage-list-row';
import type { SetupProgress } from '$lib/setup-steps';
import { SAMPLE_CONFERENCE } from '$lib/styleguide-samples';

/** The moment every row below is drawn: 2 October 2026, in the morning. */
const NOW = new Date('2026-10-02T09:00:00Z');

/** A published conference in London, 14 to 16 November, applications open until 25 October. */
const CONFERENCE: Conference = {
	...SAMPLE_CONFERENCE,
	id: 'conference-1',
	slug: 'northbridge-mun-2026',
	name: 'Northbridge MUN 2026',
	organizationName: 'Northbridge MUN Society',
	city: 'London',
	timezone: 'Europe/London',
	startDate: '2026-11-14',
	endDate: '2026-11-16',
	applicationsOpenAt: '2026-09-01T09:00:00Z',
	applicationsCloseAt: '2026-10-25T22:59:00Z',
	committeeCount: 2
};

/** Nothing counted, apart from what a test names. */
function makeFigures(changes: Partial<ConferenceFigures> = {}): ConferenceFigures {
	return {
		applicationCount: 0,
		toReviewCount: 0,
		seatCount: 0,
		heldSeatCount: 0,
		feesPaidCents: 0,
		currency: 'GBP',
		...changes
	};
}

/** A summary of `CONFERENCE` with the changes a test names. */
function makeSummary(
	conference: Partial<Conference> = {},
	figures: Partial<ConferenceFigures> = {},
	setupProgress: SetupProgress | null = null
): ManagedConferenceSummary {
	return {
		conference: { ...CONFERENCE, ...conference },
		figures: makeFigures(figures),
		setupProgress,
		isOnTeam: true
	};
}

/** Details done, nothing else. */
const DETAILS_DONE: SetupProgress = {
	details: true,
	committees: false,
	applicationForm: false,
	fees: false,
	team: false
};

describe('conferenceListRow for a conference the reader is not on the team of', () => {
	const row = conferenceListRow(
		{
			...makeSummary({}, { applicationCount: 38, toReviewCount: 4 }),
			isOnTeam: false
		},
		NOW
	);

	it('names it and its dates, without a link, figures, attention or action', () => {
		expect(row.name).toBe(CONFERENCE.name);
		expect(row.dateBlock).toEqual({ days: '14 – 16', monthAndYear: 'November 2026' });
		expect(row.nameHref).toBeNull();
		expect(row.figures).toEqual([]);
		expect(row.attention).toBeNull();
		expect(row.action).toBeNull();
		expect(row.isDeletable).toBe(false);
		expect(row.isOnTeam).toBe(false);
	});
});

describe('conferenceListRow while applications are open', () => {
	const row = conferenceListRow(
		makeSummary({}, { applicationCount: 38, toReviewCount: 4, seatCount: 80, heldSeatCount: 22 }),
		NOW
	);

	it('draws the dates, the place and the second phase', () => {
		expect(row.dateBlock).toEqual({ days: '14 – 16', monthAndYear: 'November 2026' });
		// More than two weeks away, so the line does not count the days.
		expect(row.subline).toBe('Northbridge MUN Society · London');
		expect(row.phaseNumber).toBe(2);
		expect(row.phaseName).toBe('Applications');
		expect(row.phaseDetail).toBe('open until 25 October');
	});

	it('shows the applications and the seats held', () => {
		expect(row.figures).toEqual([
			{ value: '38', label: 'applications' },
			{ value: '22 of 80', label: 'seats held' }
		]);
	});

	it('asks for the applications to be reviewed', () => {
		expect(row.attention).toBe('4 applications to review');
		expect(row.action).toEqual({
			label: 'Review applications',
			href: '/manage/northbridge-mun-2026/applications'
		});
		expect(row.nameHref).toBe('/manage/northbridge-mun-2026');
	});

	it('says nothing is waiting when nothing is', () => {
		const quiet = conferenceListRow(makeSummary(), NOW);

		expect(quiet.attention).toBeNull();
		expect(quiet.action?.label).toBe('Open dashboard');
	});

	it('says when a window that has not opened will open', () => {
		const ahead = conferenceListRow(
			makeSummary({ applicationsOpenAt: '2026-10-05T08:00:00Z' }),
			NOW
		);

		expect(ahead.phaseDetail).toBe('opens on 5 October');
		expect(ahead.attention).toBe('Applications open on 5 October');
	});
});

describe('conferenceListRow while seats are given', () => {
	/** Starts in three days; applications closed yesterday. */
	const SOON: Partial<Conference> = {
		startDate: '2026-10-05',
		endDate: '2026-10-07',
		applicationsCloseAt: '2026-10-01T22:59:00Z'
	};

	it('shows the seats alone to a reader who may not read the invoices', () => {
		const row = conferenceListRow(
			makeSummary(SOON, { seatCount: 60, heldSeatCount: 59, feesPaidCents: null }),
			NOW
		);

		expect(row.figures).toEqual([{ value: '59 of 60', label: 'seats held' }]);
	});

	it('counts the days to the start, and shows the seats and the fees', () => {
		const row = conferenceListRow(
			makeSummary(SOON, { seatCount: 60, heldSeatCount: 59, feesPaidCents: 189000 }),
			NOW
		);

		expect(row.subline).toBe('Northbridge MUN Society · London · starts in 3 days');
		expect(row.phaseNumber).toBe(3);
		expect(row.phaseName).toBe('Seats');
		expect(row.phaseDetail).toBe('applications closed, seats being given');
		expect(row.figures).toEqual([
			{ value: '59 of 60', label: 'seats held' },
			{ value: '£1,890.00', label: 'fees paid' }
		]);
		expect(row.attention).toBe('1 seat nobody holds yet');
		expect(row.action).toEqual({
			label: 'Give the seat',
			href: '/manage/northbridge-mun-2026/allocation'
		});
	});

	it('says so once every seat is held', () => {
		const row = conferenceListRow(makeSummary(SOON, { seatCount: 3, heldSeatCount: 3 }), NOW);

		expect(row.attention).toBe('Every seat is held');
		expect(row.action?.label).toBe('Open dashboard');
	});

	it('puts applications still waiting before the seats', () => {
		const row = conferenceListRow(
			makeSummary(SOON, { toReviewCount: 1, seatCount: 3, heldSeatCount: 1 }),
			NOW
		);

		expect(row.attention).toBe('1 application to review');
	});
});

describe('conferenceListRow for a draft', () => {
	const row = conferenceListRow(
		makeSummary({ status: 'draft' }, { seatCount: 11 }, DETAILS_DONE),
		NOW
	);

	it('says it is being set up, and links the name back into the creation flow', () => {
		expect(row.subline).toBe('Northbridge MUN Society · London · draft, not public');
		expect(row.phaseNumber).toBe(1);
		expect(row.phaseName).toBe('Set up');
		expect(row.phaseDetail).toBe('being set up');
		expect(row.nameHref).toBe('/create/northbridge-mun-2026');
	});

	it('shows the committees and the seats', () => {
		expect(row.figures).toEqual([
			{ value: '2', label: 'committees' },
			{ value: '11', label: 'seats' }
		]);
	});

	it('sends the organiser back to the creation flow to finish it', () => {
		expect(row.attention).toBe('Finish setting it up to go public');
		expect(row.action).toEqual({
			label: 'Continue setup',
			href: '/create/northbridge-mun-2026'
		});
	});

	it('says the same whatever the old setup steps say, because the creation flow decides', () => {
		const ready = conferenceListRow(
			makeSummary(
				{ status: 'draft' },
				{},
				{ ...DETAILS_DONE, committees: true, applicationForm: true }
			),
			NOW
		);

		expect(ready.attention).toBe('Finish setting it up to go public');
		// The creation flow sends it on to the step it had reached itself.
		expect(ready.action?.href).toBe('/create/northbridge-mun-2026');
	});

	it('offers to delete it, with the slug the form sends', () => {
		expect(row.isDeletable).toBe(true);
		expect(row.slug).toBe('northbridge-mun-2026');
	});
});

describe('conferenceListRow once it has started or ended', () => {
	it('counts the days of a conference in session', () => {
		const row = conferenceListRow(
			makeSummary({ startDate: '2026-10-01', endDate: '2026-10-03' }),
			NOW
		);

		expect(row.subline).toBe('Northbridge MUN Society · London · day 2 of 3');
		expect(row.phaseNumber).toBe(4);
		expect(row.phaseDetail).toBe('day 2 of 3');
	});

	it('says an ended conference has ended, and an archived one is archived', () => {
		const ended = conferenceListRow(
			makeSummary({ startDate: '2026-09-01', endDate: '2026-09-03' }),
			NOW
		);
		const archived = conferenceListRow(makeSummary({ status: 'archived' }), NOW);

		expect(ended.phaseNumber).toBe(5);
		expect(ended.phaseDetail).toBe('ended');
		expect(ended.subline).toBe('Northbridge MUN Society · London');
		expect(archived.phaseDetail).toBe('archived');
		expect(archived.attention).toBeNull();
	});

	it('never offers to delete a published or an archived conference', () => {
		const published = conferenceListRow(makeSummary({ status: 'published' }), NOW);
		const archived = conferenceListRow(makeSummary({ status: 'archived' }), NOW);

		expect(published.isDeletable).toBe(false);
		expect(archived.isDeletable).toBe(false);
	});
});
