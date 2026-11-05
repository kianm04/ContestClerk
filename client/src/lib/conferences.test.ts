import { describe, expect, it } from 'vitest';
import {
	applicationWindowBadge,
	applyPanelHeadline,
	applyPanelState,
	CLOSING_SOON_DAYS,
	committeeChips,
	committeeChipTone,
	conferenceHoursLine,
	conferenceLocationLine,
	conferenceShareSentence,
	conferenceVenueLine,
	countActiveFilters,
	delegateCountChip,
	EMPTY_CONFERENCE_QUERY,
	formatConferenceDay,
	isAcceptingApplications,
	isPast,
	LEVEL_FILTER_OPTIONS,
	LEVEL_OPTIONS,
	parseConferenceQuery,
	publicFeesHeading,
	type ApplyPanelViewer,
	type Conference,
	type ConferenceQuery,
	type MySeat
} from './conferences';

/**
 * One conference every test starts from.
 *
 * Tests spread it and change only the field they are about, so each test says
 * what matters about its own case and nothing else. It is published, and both
 * application dates are missing, which counts as "open on both sides".
 */
const THIMUN: Conference = {
	id: '11111111-1111-1111-1111-111111111111',
	slug: 'thimun-2027',
	name: 'THIMUN 2027',
	description: 'The oldest Model United Nations conference in Europe.',
	organizationName: 'THIMUN Foundation',
	organizationSlug: 'thimun-foundation',
	city: 'The Hague',
	countryCode: 'NL',
	countryName: 'Netherlands',
	locationMode: 'in_person',
	venueStatus: 'tba',
	conferenceTimeStatus: 'tba',
	startTime: null,
	endTime: null,
	feeStatus: 'undecided',
	applicationOpenMode: 'on_publish',
	startDate: '2027-01-24',
	endDate: '2027-01-29',
	websiteUrl: 'https://thimun.org',
	bannerPath: null,
	logoPath: null,
	level: 'high_school',
	status: 'published',
	timezone: 'Europe/Amsterdam',
	expectedDelegates: 3000,
	applicationsOpenAt: null,
	applicationsCloseAt: null,
	committeeCount: 8,
	committeeNames: [],
	tagline: 'Where the world meets in The Hague.',
	venueName: 'World Forum The Hague',
	venueAddress: 'Churchillplein 10, 2517 JW The Hague',
	contactEmail: 'info@thimun.org',
	instagramUrl: null,
	contactPhone: null,
	facebookUrl: null,
	linkedinUrl: null,
	youtubeUrl: null,
	tiktokUrl: null,
	language: 'English',
	minAge: 14,
	maxAge: 19,
	positionPaperRequired: false,
	positionPaperDeadline: null,
	acceptsIndividualApplications: true,
	acceptsDelegations: true
};

/** The moment every test that needs a clock pretends it is. */
const NOW = new Date('2026-09-17T12:00:00Z');

/** The same moment as a day, for the tests that ask whether a conference has finished. */
const TODAY = '2026-09-17';

describe('parseConferenceQuery', () => {
	it('asks for nothing when the address carries nothing', () => {
		expect(parseConferenceQuery(new URLSearchParams())).toEqual(EMPTY_CONFERENCE_QUERY);
	});

	it('reads every parameter', () => {
		const params = new URLSearchParams(
			'q=munich&country=DE&region=europe&within=6&level=university&open=1&sort=newest&page=2'
		);

		expect(parseConferenceQuery(params)).toEqual({
			q: 'munich',
			country: 'DE',
			regions: ['europe'],
			withinMonths: 6,
			level: 'university',
			openOnly: true,
			sort: 'newest',
			page: 2
		});
	});

	it('trims the spaces around the search text', () => {
		expect(parseConferenceQuery(new URLSearchParams('q=  munich  ')).q).toBe('munich');
	});

	it('accepts a country code written in lower case', () => {
		expect(parseConferenceQuery(new URLSearchParams('country=nl')).country).toBe('NL');
	});

	it('ignores a country that is not a real code', () => {
		expect(parseConferenceQuery(new URLSearchParams('country=Narnia')).country).toBe('');
	});

	it('ignores a level that is not one of the three', () => {
		expect(parseConferenceQuery(new URLSearchParams('level=primary_school')).level).toBe('');
	});

	it('reads every region ticked, once each and in the order the filter lists them', () => {
		const params = new URLSearchParams('region=asia&region=europe&region=asia&region=atlantis');

		expect(parseConferenceQuery(params).regions).toEqual(['europe', 'asia']);
	});

	it('looks any time ahead for a number of months that is not one of the choices', () => {
		expect(parseConferenceQuery(new URLSearchParams('within=12')).withinMonths).toBe(12);
		expect(parseConferenceQuery(new URLSearchParams('within=5')).withinMonths).toBe(0);
		expect(parseConferenceQuery(new URLSearchParams('within=soon')).withinMonths).toBe(0);
	});

	it('falls back to the first page for anything that is not a page number', () => {
		expect(parseConferenceQuery(new URLSearchParams('page=0')).page).toBe(1);
		expect(parseConferenceQuery(new URLSearchParams('page=-3')).page).toBe(1);
		expect(parseConferenceQuery(new URLSearchParams('page=2.5')).page).toBe(1);
		expect(parseConferenceQuery(new URLSearchParams('page=last')).page).toBe(1);
	});

	it('falls back to the soonest conference first for an order it does not know', () => {
		expect(parseConferenceQuery(new URLSearchParams('sort=cheapest')).sort).toBe('soonest');
		expect(parseConferenceQuery(new URLSearchParams('sort=NEWEST')).sort).toBe('soonest');
	});

	it('reads both ways of saying the open box is ticked', () => {
		// `open=1` is what our own links write. `open=on` is what the browser sends
		// for a ticked box when the form is submitted without JavaScript.
		expect(parseConferenceQuery(new URLSearchParams('open=1')).openOnly).toBe(true);
		expect(parseConferenceQuery(new URLSearchParams('open=on')).openOnly).toBe(true);
	});

	it('treats anything else in the open parameter as not ticked', () => {
		expect(parseConferenceQuery(new URLSearchParams('open=0')).openOnly).toBe(false);
		expect(parseConferenceQuery(new URLSearchParams('open=true')).openOnly).toBe(false);
		expect(parseConferenceQuery(new URLSearchParams('open=')).openOnly).toBe(false);
	});
});

describe('countActiveFilters', () => {
	it('counts nothing when no filter is set', () => {
		expect(countActiveFilters(EMPTY_CONFERENCE_QUERY)).toBe(0);
	});

	it('does not count the search box, which sits outside the collapsed filters', () => {
		expect(countActiveFilters({ ...EMPTY_CONFERENCE_QUERY, q: 'munich' })).toBe(0);
	});

	it('does not count the sort order or the page number', () => {
		const query: ConferenceQuery = { ...EMPTY_CONFERENCE_QUERY, sort: 'newest', page: 4 };

		expect(countActiveFilters(query)).toBe(0);
	});

	it('does not count the level, whose chips sit outside the collapsed filters', () => {
		const query: ConferenceQuery = { ...EMPTY_CONFERENCE_QUERY, level: 'university' };

		expect(countActiveFilters(query)).toBe(0);
	});

	it('counts a country and the open box as two', () => {
		const query: ConferenceQuery = { ...EMPTY_CONFERENCE_QUERY, country: 'NL', openOnly: true };

		expect(countActiveFilters(query)).toBe(2);
	});

	it('counts every collapsible filter, and each ticked region on its own', () => {
		const query: ConferenceQuery = {
			...EMPTY_CONFERENCE_QUERY,
			country: 'NL',
			regions: ['europe', 'asia'],
			withinMonths: 3,
			openOnly: true
		};

		expect(countActiveFilters(query)).toBe(5);
	});
});

describe('isAcceptingApplications', () => {
	it('is open when it is published and neither date is set', () => {
		expect(isAcceptingApplications(THIMUN, NOW)).toBe(true);
	});

	it('is closed while the conference is still a draft', () => {
		expect(isAcceptingApplications({ ...THIMUN, status: 'draft' }, NOW)).toBe(false);
	});

	it('is closed once the conference has been archived', () => {
		expect(isAcceptingApplications({ ...THIMUN, status: 'archived' }, NOW)).toBe(false);
	});

	it('is closed before the opening moment', () => {
		const conference: Conference = { ...THIMUN, applicationsOpenAt: '2026-10-01T09:00:00Z' };

		expect(isAcceptingApplications(conference, NOW)).toBe(false);
	});

	it('is closed after the closing moment', () => {
		const conference: Conference = { ...THIMUN, applicationsCloseAt: '2026-09-01T09:00:00Z' };

		expect(isAcceptingApplications(conference, NOW)).toBe(false);
	});

	it('is open inside the window', () => {
		const conference: Conference = {
			...THIMUN,
			applicationsOpenAt: '2026-09-01T09:00:00Z',
			applicationsCloseAt: '2026-12-01T09:00:00Z'
		};

		expect(isAcceptingApplications(conference, NOW)).toBe(true);
	});

	it('is open when only an opening date is set and it has passed', () => {
		const conference: Conference = { ...THIMUN, applicationsOpenAt: '2026-09-01T09:00:00Z' };

		expect(isAcceptingApplications(conference, NOW)).toBe(true);
	});

	it('is open when only a closing date is set and it is still ahead', () => {
		const conference: Conference = { ...THIMUN, applicationsCloseAt: '2026-12-01T09:00:00Z' };

		expect(isAcceptingApplications(conference, NOW)).toBe(true);
	});

	it('is not open when the organiser opens applications by hand and has not yet', () => {
		const conference: Conference = {
			...THIMUN,
			applicationOpenMode: 'manual',
			applicationsOpenAt: null
		};

		expect(isAcceptingApplications(conference, NOW)).toBe(false);
	});

	it('is open once a manual conference has been opened', () => {
		const conference: Conference = {
			...THIMUN,
			applicationOpenMode: 'manual',
			applicationsOpenAt: '2026-09-01T12:00:00Z'
		};

		expect(isAcceptingApplications(conference, NOW)).toBe(true);
	});

	it('still counts a missing opening date as open for the other two modes', () => {
		for (const mode of ['on_publish', 'scheduled'] as const) {
			const conference: Conference = { ...THIMUN, applicationOpenMode: mode };

			expect(isAcceptingApplications(conference, NOW)).toBe(true);
		}
	});

	it('answers for anything carrying the four fields it reads', () => {
		// The parameter is those four fields rather than a whole `Conference`, so
		// that the application page can ask this of the handful of conference
		// facts it loads. This case would not compile if that were narrowed again.
		const windowOnly = {
			status: 'published' as const,
			applicationOpenMode: 'scheduled' as const,
			applicationsOpenAt: null,
			applicationsCloseAt: '2026-06-01T12:00:00Z'
		};

		expect(isAcceptingApplications(windowOnly, NOW)).toBe(false);
	});
});

describe('isPast', () => {
	it('has finished when the last day is before today', () => {
		expect(isPast({ ...THIMUN, endDate: '2026-09-16' }, '2026-09-17')).toBe(true);
	});

	it('has not finished on its last day', () => {
		expect(isPast({ ...THIMUN, endDate: '2026-09-17' }, '2026-09-17')).toBe(false);
	});

	it('has not finished when it is still to come', () => {
		expect(isPast(THIMUN, '2026-09-17')).toBe(false);
	});
});

/**
 * THIMUN with an application window that opened before `NOW` and closes at
 * `closesAt`, for the tests of when "Closing soon" starts.
 */
function closingAt(closesAt: string): Conference {
	return { ...THIMUN, applicationsOpenAt: '2026-09-01T09:00:00Z', applicationsCloseAt: closesAt };
}

describe('applicationWindowBadge', () => {
	it('says applications are not open yet while a manual conference waits to be opened', () => {
		const conference: Conference = {
			...THIMUN,
			applicationOpenMode: 'manual',
			applicationsOpenAt: null
		};

		expect(applicationWindowBadge(conference, NOW)).toEqual({
			label: 'Applications not open yet',
			tone: 'neutral'
		});
	});

	it('says closed when a manual conference was never opened and its closing moment passed', () => {
		const conference: Conference = {
			...THIMUN,
			applicationOpenMode: 'manual',
			applicationsOpenAt: null,
			applicationsCloseAt: '2026-06-01T12:00:00Z'
		};

		expect(applicationWindowBadge(conference, NOW)).toEqual({
			label: 'Applications closed',
			tone: 'neutral'
		});
	});

	it('says nothing about a draft waiting to be opened by hand', () => {
		const conference: Conference = {
			...THIMUN,
			status: 'draft',
			applicationOpenMode: 'manual',
			applicationsOpenAt: null
		};

		expect(applicationWindowBadge(conference, NOW)).toBeNull();
	});

	it('says applications are open when they are', () => {
		expect(applicationWindowBadge(closingAt('2026-12-01T17:00:00Z'), NOW)).toEqual({
			label: 'Applications open',
			tone: 'success'
		});
	});

	it('still says applications are open 8 days before the closing day', () => {
		// 17:00 in Amsterdam on 25 September, 8 days after 17 September.
		expect(applicationWindowBadge(closingAt('2026-09-25T15:00:00Z'), NOW)).toEqual({
			label: 'Applications open',
			tone: 'success'
		});
	});

	it(`says "Closing soon" from ${CLOSING_SOON_DAYS} days before the closing day`, () => {
		// 17:00 in Amsterdam on 24 September, 7 days after 17 September.
		expect(applicationWindowBadge(closingAt('2026-09-24T15:00:00Z'), NOW)).toEqual({
			label: 'Closing soon',
			tone: 'warning'
		});
	});

	it('says "Closing soon" on the closing day itself', () => {
		// 22:00 in Amsterdam on 17 September, later the same day as `NOW`.
		expect(applicationWindowBadge(closingAt('2026-09-17T20:00:00Z'), NOW)).toEqual({
			label: 'Closing soon',
			tone: 'warning'
		});
	});

	it('counts the days to closing in the conference timezone', () => {
		// 22:30 UTC on 24 September is already the 25th in Auckland, and `NOW` is
		// still the 18th there, so the closing day is exactly 7 days away.
		const conference: Conference = {
			...closingAt('2026-09-24T22:30:00Z'),
			timezone: 'Pacific/Auckland'
		};

		expect(applicationWindowBadge(conference, NOW)?.label).toBe('Closing soon');
	});

	it('never says "Closing soon" for a window with no closing moment', () => {
		const conference: Conference = { ...THIMUN, applicationsOpenAt: '2026-09-01T09:00:00Z' };

		expect(applicationWindowBadge(conference, NOW)).toEqual({
			label: 'Applications open',
			tone: 'success'
		});
	});

	it('says when applications will open', () => {
		const conference: Conference = { ...THIMUN, applicationsOpenAt: '2026-11-02T13:00:00Z' };

		expect(applicationWindowBadge(conference, NOW)).toEqual({
			label: 'Opens 2 Nov 2026',
			tone: 'neutral'
		});
	});

	it('writes that date as the day it is in the conference timezone', () => {
		// The same moment, 13:00 UTC on 2 November, is already half past two in the
		// morning on the 3rd in Auckland. The badge is about the conference, so it
		// says the 3rd.
		const conference: Conference = {
			...THIMUN,
			timezone: 'Pacific/Auckland',
			applicationsOpenAt: '2026-11-02T13:00:00Z'
		};

		expect(applicationWindowBadge(conference, NOW)).toEqual({
			label: 'Opens 3 Nov 2026',
			tone: 'neutral'
		});
	});

	it('says applications are closed once the window has closed', () => {
		const conference: Conference = {
			...THIMUN,
			applicationsOpenAt: '2026-01-01T09:00:00Z',
			applicationsCloseAt: '2026-06-01T09:00:00Z'
		};

		expect(applicationWindowBadge(conference, NOW)).toEqual({
			label: 'Applications closed',
			tone: 'neutral'
		});
	});

	it('says applications are closed for a window with only a closing moment, once it passed', () => {
		const conference: Conference = { ...THIMUN, applicationsCloseAt: '2026-06-01T09:00:00Z' };

		expect(applicationWindowBadge(conference, NOW)?.label).toBe('Applications closed');
	});

	it('shows nothing for a conference with no application window', () => {
		// THIMUN has neither an opening nor a closing moment.
		expect(applicationWindowBadge(THIMUN, NOW)).toBe(null);
	});

	it('shows nothing for a conference that is not published', () => {
		const draft: Conference = { ...closingAt('2026-12-01T17:00:00Z'), status: 'draft' };

		expect(applicationWindowBadge(draft, NOW)).toBe(null);
	});
});

describe('committeeChips', () => {
	it('gives no chips for a conference with no committees yet', () => {
		expect(committeeChips([])).toEqual([]);
	});

	it('names every committee when there are no more than two', () => {
		expect(committeeChips(['General Assembly', 'DISEC'])).toEqual(['General Assembly', 'DISEC']);
	});

	it('names the first two and counts the rest', () => {
		const names = ['General Assembly', 'DISEC', 'UNHRC', 'UNEP', 'ECOSOC'];

		expect(committeeChips(names)).toEqual(['General Assembly', 'DISEC', '+3']);
	});
});

describe('committeeChipTone', () => {
	it('gives the same conference the same colour every time', () => {
		const id = '7c1f0a52-3b8e-4d6a-9f21-5e0c8b7d4a13';

		expect(committeeChipTone(id)).toBe(committeeChipTone(id));
	});

	it('hands out all three colours', () => {
		// The character codes of "a", "b" and "c" are 97, 98 and 99, one apart,
		// so they land on three different colours.
		const tones = ['a', 'b', 'c'].map((id) => committeeChipTone(id));

		expect(new Set(tones)).toEqual(new Set(['violet', 'green', 'blue']));
	});
});

describe('delegateCountChip', () => {
	it('shows nothing without a number', () => {
		expect(delegateCountChip(null)).toBe(null);
		expect(delegateCountChip(0)).toBe(null);
	});

	it('gives the exact number under 20', () => {
		expect(delegateCountChip(1)).toBe('1 delegate');
		expect(delegateCountChip(19)).toBe('19 delegates');
	});

	it('rounds down to the nearest ten from 20 to 99', () => {
		expect(delegateCountChip(20)).toBe('20+ delegates');
		expect(delegateCountChip(45)).toBe('40+ delegates');
		expect(delegateCountChip(99)).toBe('90+ delegates');
	});

	it('rounds down to the nearest fifty from 100', () => {
		expect(delegateCountChip(100)).toBe('100+ delegates');
		expect(delegateCountChip(149)).toBe('100+ delegates');
		expect(delegateCountChip(150)).toBe('150+ delegates');
		expect(delegateCountChip(237)).toBe('200+ delegates');
	});
});

describe('formatConferenceDay', () => {
	it('writes a moment as a single date', () => {
		expect(formatConferenceDay('2026-12-15T12:00:00Z', 'Europe/Amsterdam')).toBe('15 Dec 2026');
	});

	it('writes the day it falls on where the conference is, not where the reader is', () => {
		// Half past eleven at night in London on 2 November is already half past
		// midnight on 3 November in Amsterdam, and it is the conference's own day
		// that both the apply panel and the apply page name.
		expect(formatConferenceDay('2026-11-02T23:30:00Z', 'Europe/Amsterdam')).toBe('3 Nov 2026');
	});
});

describe('applyPanelState', () => {
	/** The seat a reader holds, for the tests about somebody who already has one. */
	const MY_SEAT: MySeat = {
		seatName: 'France',
		committeeName: 'United Nations Security Council',
		committeeSlug: 'unsc'
	};

	/**
	 * A reader with no seat, no application of their own and no delegation: a
	 * stranger to this conference, which is what most of these tests are about.
	 * The tests that are about one of the three spread this and change it.
	 */
	const NOBODY: ApplyPanelViewer = { seat: null, application: null, delegation: null };

	it('says applications are not open yet while a manual conference waits to be opened', () => {
		const conference: Conference = {
			...THIMUN,
			applicationOpenMode: 'manual',
			applicationsOpenAt: null
		};

		expect(applyPanelState(conference, NOBODY, NOW, TODAY)).toEqual({ kind: 'not_opened' });
	});

	it('tells a delegate about the seat they hold', () => {
		expect(applyPanelState(THIMUN, { ...NOBODY, seat: MY_SEAT }, NOW, TODAY)).toEqual({
			kind: 'seated',
			seat: MY_SEAT
		});
	});

	it('still tells them about it after applications have closed', () => {
		const conference: Conference = { ...THIMUN, applicationsCloseAt: '2026-06-01T12:00:00Z' };

		expect(applyPanelState(conference, { ...NOBODY, seat: MY_SEAT }, NOW, TODAY)).toEqual({
			kind: 'seated',
			seat: MY_SEAT
		});
	});

	it('points somebody who has already applied at their own application', () => {
		const viewer: ApplyPanelViewer = {
			...NOBODY,
			application: { id: 'application-daniel', status: 'submitted' }
		};

		expect(applyPanelState(THIMUN, viewer, NOW, TODAY)).toEqual({
			kind: 'application',
			applicationId: 'application-daniel',
			status: 'submitted'
		});
	});

	it('names the delegation of somebody who is already in one, and says which one', () => {
		const viewer: ApplyPanelViewer = {
			...NOBODY,
			delegation: { id: 'delegation-delft', name: 'Delft University' }
		};

		// The id travels with the name because the panel hangs a link to
		// `/delegations/[id]` on the sentence it writes.
		expect(applyPanelState(THIMUN, viewer, NOW, TODAY)).toEqual({
			kind: 'delegation',
			delegationId: 'delegation-delft',
			delegationName: 'Delft University'
		});
	});

	it('tells a delegate about their seat rather than about their application', () => {
		// The seat is asked about first, because it is the one thing on the panel
		// somebody who already has one can act on.
		const viewer: ApplyPanelViewer = {
			seat: MY_SEAT,
			application: { id: 'application-daniel', status: 'accepted' },
			delegation: { id: 'delegation-delft', name: 'Delft University' }
		};

		expect(applyPanelState(THIMUN, viewer, NOW, TODAY)).toEqual({
			kind: 'seated',
			seat: MY_SEAT
		});
	});

	it('says the conference has ended once its last day has passed', () => {
		const conference: Conference = { ...THIMUN, endDate: '2026-09-16' };

		expect(applyPanelState(conference, NOBODY, NOW, TODAY)).toEqual({ kind: 'ended' });
	});

	it('says an archived conference has ended although its dates are still ahead', () => {
		// `05-pages/public/conference.md` gives an archived conference the same
		// sentence as one whose dates have passed, which is why the check asks
		// about the status as well as the calendar.
		const conference: Conference = { ...THIMUN, status: 'archived' };

		expect(applyPanelState(conference, NOBODY, NOW, TODAY)).toEqual({ kind: 'ended' });
	});

	it('gives both dates while applications are open', () => {
		const conference: Conference = {
			...THIMUN,
			applicationsCloseAt: '2026-12-15T12:00:00Z',
			positionPaperRequired: true,
			positionPaperDeadline: '2027-01-10T12:00:00Z'
		};

		expect(applyPanelState(conference, NOBODY, NOW, TODAY)).toEqual({
			kind: 'open',
			closesOn: '15 Dec 2026',
			paperDueOn: '10 Jan 2027',
			acceptsIndividuals: true,
			acceptsDelegations: true
		});
	});

	it('has no closing date to give when the organisers set none', () => {
		const conference: Conference = {
			...THIMUN,
			positionPaperRequired: true,
			positionPaperDeadline: '2027-01-10T12:00:00Z'
		};

		expect(applyPanelState(conference, NOBODY, NOW, TODAY)).toEqual({
			kind: 'open',
			closesOn: null,
			paperDueOn: '10 Jan 2027',
			acceptsIndividuals: true,
			acceptsDelegations: true
		});
	});

	it('keeps quiet about a deadline the conference does not ask a paper for', () => {
		const conference: Conference = {
			...THIMUN,
			positionPaperRequired: false,
			positionPaperDeadline: '2027-01-10T12:00:00Z'
		};

		expect(applyPanelState(conference, NOBODY, NOW, TODAY)).toEqual({
			kind: 'open',
			closesOn: null,
			paperDueOn: null,
			acceptsIndividuals: true,
			acceptsDelegations: true
		});
	});

	it('says a conference that takes delegations only takes no individuals', () => {
		// The window is open, so the panel still leads with its badge and its
		// closing date. What this flag decides is whether the apply button is
		// offered at all: `canApply` refuses an individual here, so the button
		// would dead-end on that refusal.
		const conference: Conference = { ...THIMUN, acceptsIndividualApplications: false };

		expect(applyPanelState(conference, NOBODY, NOW, TODAY)).toEqual({
			kind: 'open',
			closesOn: null,
			paperDueOn: null,
			acceptsIndividuals: false,
			acceptsDelegations: true
		});
	});

	it('says a conference that takes individuals only takes no delegations', () => {
		// The other half of the same rule, which keeps "Register a delegation"
		// out of the panel the way the flag above keeps "Apply as a delegate" out.
		const conference: Conference = { ...THIMUN, acceptsDelegations: false };

		expect(applyPanelState(conference, NOBODY, NOW, TODAY)).toEqual({
			kind: 'open',
			closesOn: null,
			paperDueOn: null,
			acceptsIndividuals: true,
			acceptsDelegations: false
		});
	});

	it('leaves a conference taking neither with a badge and nothing to press', () => {
		const conference: Conference = {
			...THIMUN,
			acceptsIndividualApplications: false,
			acceptsDelegations: false
		};

		expect(applyPanelState(conference, NOBODY, NOW, TODAY)).toEqual({
			kind: 'open',
			closesOn: null,
			paperDueOn: null,
			acceptsIndividuals: false,
			acceptsDelegations: false
		});
	});

	it('says when applications will open', () => {
		const conference: Conference = { ...THIMUN, applicationsOpenAt: '2026-11-02T12:00:00Z' };

		expect(applyPanelState(conference, NOBODY, NOW, TODAY)).toEqual({
			kind: 'not_yet_open',
			opensOn: '2 Nov 2026'
		});
	});

	it('says when applications closed', () => {
		const conference: Conference = {
			...THIMUN,
			applicationsOpenAt: '2026-01-05T12:00:00Z',
			applicationsCloseAt: '2026-06-01T12:00:00Z'
		};

		expect(applyPanelState(conference, NOBODY, NOW, TODAY)).toEqual({
			kind: 'closed',
			closedOn: '1 Jun 2026'
		});
	});

	it('has nothing to say for a draft a staff member is previewing', () => {
		// A draft takes no applications whatever its dates say, and this one has no
		// dates at all, so there is not even a date to promise.
		const conference: Conference = { ...THIMUN, status: 'draft' };

		expect(applyPanelState(conference, NOBODY, NOW, TODAY)).toEqual({ kind: 'unavailable' });
	});
});

describe('applyPanelHeadline', () => {
	/** The seat a reader holds. The `applyPanelState` block above has its own. */
	const HELD_SEAT: MySeat = {
		seatName: 'France',
		committeeName: 'United Nations Security Council',
		committeeSlug: 'unsc'
	};

	it('names the seat somebody already holds', () => {
		expect(applyPanelHeadline({ kind: 'seated', seat: HELD_SEAT })).toBe(
			'You represent France in United Nations Security Council.'
		);
	});

	it('says applications are not open yet when there is no day to name', () => {
		expect(applyPanelHeadline({ kind: 'not_opened' })).toBe('Applications are not open yet.');
	});

	it('says when applications open and when they closed', () => {
		expect(applyPanelHeadline({ kind: 'not_yet_open', opensOn: '2 Nov 2026' })).toBe(
			'Applications open on 2 Nov 2026.'
		);
		expect(applyPanelHeadline({ kind: 'closed', closedOn: '15 Dec 2026' })).toBe(
			'Applications closed on 15 Dec 2026.'
		);
	});

	it('has a sentence for a conference that is over and for one taking nothing', () => {
		expect(applyPanelHeadline({ kind: 'ended' })).toBe('This conference has ended.');
		expect(applyPanelHeadline({ kind: 'unavailable' })).toBe(
			'This conference is not taking applications.'
		);
	});

	it('says nothing at all for the three states that lead with something else', () => {
		// `open` and `application` lead with a `Badge`, and `delegation` is written
		// out in the panel's own markup because part of it is a link.
		const open = { kind: 'open', closesOn: null, paperDueOn: null } as const;

		expect(
			applyPanelHeadline({ ...open, acceptsIndividuals: true, acceptsDelegations: true })
		).toBe('');
		expect(
			applyPanelHeadline({ kind: 'application', applicationId: 'application-1', status: 'draft' })
		).toBe('');
		expect(
			applyPanelHeadline({
				kind: 'delegation',
				delegationId: 'delegation-delft',
				delegationName: 'Delft University'
			})
		).toBe('');
	});
});

describe('LEVEL_OPTIONS and LEVEL_FILTER_OPTIONS', () => {
	it('offers the three levels a conference can be, with their English words', () => {
		expect(LEVEL_OPTIONS).toEqual([
			{ value: 'high_school', label: 'High school' },
			{ value: 'university', label: 'University' },
			{ value: 'mixed', label: 'High school and university' }
		]);
	});

	it('gives the filter the same three with "All" in front', () => {
		// The filter is the form's list plus the one choice a form does not have,
		// which is what `LEVEL_FILTER_OPTIONS` being built out of `LEVEL_OPTIONS`
		// is for.
		expect(LEVEL_FILTER_OPTIONS[0]).toEqual({ value: '', label: 'All' });
		expect(LEVEL_FILTER_OPTIONS.slice(1)).toEqual(LEVEL_OPTIONS);
	});
});

describe('conferenceLocationLine', () => {
	it('names the city and the country of an in-person conference', () => {
		expect(conferenceLocationLine(THIMUN)).toBe(`${THIMUN.city}, ${THIMUN.countryName}`);
	});

	it('says online for an online conference, whatever city is left over', () => {
		expect(conferenceLocationLine({ ...THIMUN, locationMode: 'online' })).toBe('Online');
		expect(
			conferenceLocationLine({
				...THIMUN,
				locationMode: 'online',
				city: null,
				countryName: null
			})
		).toBe('Online');
	});

	it('adds "also online" to a hybrid conference', () => {
		expect(
			conferenceLocationLine({
				locationMode: 'hybrid',
				city: 'Delft',
				countryName: 'Netherlands'
			})
		).toBe('Delft, Netherlands · also online');
	});

	it('says the location is to be announced when there is no city yet', () => {
		expect(
			conferenceLocationLine({ locationMode: 'in_person', city: null, countryName: null })
		).toBe('Location to be announced');
		expect(conferenceLocationLine({ locationMode: 'hybrid', city: null, countryName: null })).toBe(
			'Location to be announced'
		);
	});

	it('names the city alone when there is no country', () => {
		expect(
			conferenceLocationLine({ locationMode: 'in_person', city: 'Delft', countryName: null })
		).toBe('Delft');
	});
});

describe('conferenceVenueLine', () => {
	it('names a venue that is known', () => {
		expect(
			conferenceVenueLine({ locationMode: 'in_person', venueStatus: 'known', venueName: 'Aula' })
		).toBe('Aula');
	});

	it('says the venue is to be announced while it is', () => {
		expect(
			conferenceVenueLine({ locationMode: 'in_person', venueStatus: 'tba', venueName: 'Aula' })
		).toBe('Venue to be announced');
		expect(
			conferenceVenueLine({ locationMode: 'hybrid', venueStatus: 'known', venueName: null })
		).toBe('Venue to be announced');
	});

	it('has no venue to talk about for an online conference', () => {
		expect(
			conferenceVenueLine({ locationMode: 'online', venueStatus: 'known', venueName: 'Aula' })
		).toBeNull();
	});
});

describe('conferenceHoursLine', () => {
	it('gives the hours of each day once they are known', () => {
		expect(
			conferenceHoursLine({
				conferenceTimeStatus: 'known',
				startTime: '10:00',
				endTime: '17:00'
			})
		).toBe('10:00 – 17:00 each day');
	});

	it('says nothing while the times are to be announced', () => {
		expect(
			conferenceHoursLine({ conferenceTimeStatus: 'tba', startTime: '10:00', endTime: '17:00' })
		).toBeNull();
		expect(
			conferenceHoursLine({ conferenceTimeStatus: 'known', startTime: null, endTime: null })
		).toBeNull();
	});
});

describe('publicFeesHeading', () => {
	it('says fees are to be announced while they are undecided', () => {
		expect(publicFeesHeading('undecided', 0)).toBe('Fees to be announced');
		expect(publicFeesHeading('undecided', 2)).toBe('Fees to be announced');
	});

	it('says a free conference is free', () => {
		expect(publicFeesHeading('free', 0)).toBe('Free to attend');
	});

	it('leaves the fees of a paid conference to speak for themselves', () => {
		expect(publicFeesHeading('paid', 2)).toBeNull();
	});

	it('treats a paid conference with no fee entered yet as to be announced', () => {
		expect(publicFeesHeading('paid', 0)).toBe('Fees to be announced');
	});
});

describe('conferenceShareSentence', () => {
	const DELFT = {
		name: 'Delft MUN',
		locationMode: 'in_person' as const,
		city: 'Delft',
		countryName: 'Netherlands'
	};

	it('says where an in-person conference is', () => {
		expect(conferenceShareSentence(DELFT)).toBe(
			'Delft MUN is a Model UN conference in Delft, Netherlands.'
		);
	});

	it('says a hybrid conference is online as well', () => {
		expect(conferenceShareSentence({ ...DELFT, locationMode: 'hybrid' })).toBe(
			'Delft MUN is a Model UN conference in Delft, Netherlands and online.'
		);
	});

	it('calls an online conference online', () => {
		expect(
			conferenceShareSentence({ ...DELFT, locationMode: 'online', city: null, countryName: null })
		).toBe('Delft MUN is an online Model UN conference.');
	});

	it('leaves the place out while there is none', () => {
		expect(conferenceShareSentence({ ...DELFT, city: null, countryName: null })).toBe(
			'Delft MUN is a Model UN conference.'
		);
	});
});
