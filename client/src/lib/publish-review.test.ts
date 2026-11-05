import { describe, expect, it } from 'vitest';
import type { Conference } from './conferences';
import { publishChecklist, type PublishChecklistCounts } from './publish-checklist';
import {
	applicationWindowSentence,
	committeesWithoutChairSentence,
	conferencePlace,
	missingRequiredLines,
	publishReviewRows,
	publishReviewSummary,
	reviewRowLinkName,
	whenYouPublishBullets,
	worthDoingItems,
	type PublishReviewFacts,
	type ReviewCommittee
} from './publish-review';

/** The moment the page is drawn in these tests, well before the conference. */
const NOW = new Date('2026-11-15T10:00:00Z');

/** A draft with every required checklist item answered, but no banner. */
const READY_CONFERENCE: Conference = {
	id: 'conference-northbridge',
	slug: 'northbridge-mun-2027',
	name: 'Northbridge MUN 2027',
	description: 'Three days of debate.',
	organizationName: 'Northbridge MUN Society',
	organizationSlug: 'northbridge-mun-society',
	city: 'London',
	countryCode: 'GB',
	countryName: 'United Kingdom',
	locationMode: 'in_person',
	venueStatus: 'tba',
	conferenceTimeStatus: 'tba',
	startTime: null,
	endTime: null,
	feeStatus: 'undecided',
	applicationOpenMode: 'on_publish',
	startDate: '2027-03-12',
	endDate: '2027-03-14',
	websiteUrl: null,
	bannerPath: null,
	logoPath: null,
	level: 'mixed',
	status: 'draft',
	timezone: 'Europe/London',
	expectedDelegates: null,
	// Already open, as `/create` stores it: "as soon as you publish".
	applicationsOpenAt: '2026-10-01T09:00:00Z',
	applicationsCloseAt: '2027-01-31T23:59:00Z',
	committeeCount: 2,
	committeeNames: ['HRC', 'DISEC'],
	tagline: 'Debate by the river',
	venueName: 'Northbridge Hall',
	venueAddress: '1 Bridge Street',
	contactEmail: 'team@northbridge.example',
	instagramUrl: null,
	contactPhone: null,
	facebookUrl: null,
	linkedinUrl: null,
	youtubeUrl: null,
	tiktokUrl: null,
	language: 'English',
	minAge: null,
	maxAge: null,
	positionPaperRequired: false,
	positionPaperDeadline: null,
	acceptsIndividualApplications: true,
	acceptsDelegations: true
};

/** Two committees with seats, one of them chaired. */
const COMMITTEES: ReviewCommittee[] = [
	{ name: 'Human Rights Council', abbreviation: 'HRC', availableSeatCount: 4, chairCount: 1 },
	{
		name: 'Disarmament and International Security',
		abbreviation: 'DISEC',
		availableSeatCount: 1,
		chairCount: 0
	}
];

/** Counts that tick the committees line and the fees line. */
const READY_COUNTS: PublishChecklistCounts = {
	committeeCount: 2,
	committeesWithoutAvailableSeatsCount: 0,
	onlyCommitteeWithoutSeatsId: null,
	feeCount: 1,
	collectsPaymentsManually: true,
	isStripeConnected: false
};

/** The facts of the ready conference, with any of them replaced. */
function makeFacts(
	overrides: Partial<PublishReviewFacts> = {},
	counts: PublishChecklistCounts = READY_COUNTS
): PublishReviewFacts {
	const conference = overrides.conference ?? READY_CONFERENCE;

	return {
		conference,
		committees: COMMITTEES,
		fees: [{ name: 'Delegate fee', amountCents: 4500, appliesTo: 'individual' }],
		currency: 'GBP',
		collectsPaymentsManually: true,
		committeePreferenceCount: 2,
		askMotivation: true,
		checklist: publishChecklist(conference, counts, NOW),
		now: NOW,
		...overrides
	};
}

describe('publishReviewRows', () => {
	it('names the four things that go public, each with an Edit link', () => {
		const rows = publishReviewRows(makeFacts());

		expect(rows.map((row) => row.label)).toEqual([
			'Conference',
			'Committees',
			'Applications',
			'Fees'
		]);
		expect(rows.map((row) => row.linkLabel)).toEqual(['Edit', 'Edit', 'Edit', 'Edit']);
		expect(rows.every((row) => row.missing === undefined)).toBe(true);
		expect(rows[0].href).toBe('/manage/northbridge-mun-2027/details');
		expect(rows[2].href).toBe('/manage/northbridge-mun-2027/application-form');
	});

	it('writes the conference row as the name, the dates and the place', () => {
		const [conferenceRow] = publishReviewRows(makeFacts());

		expect(conferenceRow.lines).toEqual(['Northbridge MUN 2027']);
		expect(conferenceRow.detail).toBe(
			'12 – 14 Mar 2027 · Northbridge Hall, 1 Bridge Street, London'
		);
	});

	it('lists each committee with the seats it offers', () => {
		const committeesRow = publishReviewRows(makeFacts())[1];

		expect(committeesRow.lines).toEqual([
			'Human Rights Council · 4 seats',
			'Disarmament and International Security · 1 seat'
		]);
	});

	it('names five committees and counts the rest', () => {
		const committees = Array.from({ length: 7 }, (_, index) => ({
			name: `Committee ${index + 1}`,
			abbreviation: null,
			availableSeatCount: 2,
			chairCount: 1
		}));
		const committeesRow = publishReviewRows(makeFacts({ committees }))[1];

		expect(committeesRow.lines).toHaveLength(6);
		expect(committeesRow.lines[5]).toBe('and 2 more');
	});

	it('says what the application form asks for under the window', () => {
		const applicationsRow = publishReviewRows(makeFacts())[2];

		expect(applicationsRow.lines).toEqual([
			'Open as soon as you publish, close on 31 Jan 2027 at 23:59'
		]);
		expect(applicationsRow.detail).toBe(
			'Individual delegates and delegations · up to 2 committee preferences · motivation'
		);
	});

	it('names one kind of applicant, one preference and the position paper', () => {
		const conference = {
			...READY_CONFERENCE,
			acceptsDelegations: false,
			positionPaperRequired: true
		};
		const applicationsRow = publishReviewRows(
			makeFacts({ conference, committeePreferenceCount: 1, askMotivation: false })
		)[2];

		expect(applicationsRow.detail).toBe(
			'Individual delegates only · 1 committee preference · position paper'
		);
	});

	it('writes each fee with its amount and how it is paid', () => {
		const feesRow = publishReviewRows(makeFacts())[3];

		expect(feesRow.lines).toEqual(['Delegate fee · £45.00 per delegate']);
		expect(feesRow.detail).toBe('Collected outside MUNMeet');
	});

	it('says a fee for a delegation member is paid by card when not collected outside', () => {
		const feesRow = publishReviewRows(
			makeFacts({
				fees: [{ name: 'Member fee', amountCents: 3000, appliesTo: 'delegation_member' }],
				collectsPaymentsManually: false
			})
		)[3];

		expect(feesRow.lines).toEqual(['Member fee · £30.00 per delegation member']);
		expect(feesRow.detail).toBe('Paid by card through MUNMeet');
	});

	it('says what is missing and links to the act that fills it in', () => {
		const conference = { ...READY_CONFERENCE, venueName: null, applicationsCloseAt: null };
		const counts = { ...READY_COUNTS, committeeCount: 0 };
		const rows = publishReviewRows(makeFacts({ conference, committees: [] }, counts));

		expect(rows[0].missing).toBe('Still needed: the venue');
		expect(rows[0].linkLabel).toBe('Finish the details');
		expect(rows[1].lines).toEqual(['No committees yet']);
		expect(rows[1].linkLabel).toBe('Add a committee');
		expect(rows[1].href).toBe('/manage/northbridge-mun-2027/committees/new');
		expect(rows[2].lines).toEqual(['No application window yet']);
		expect(rows[2].missing).toBe('Choose when applications open and close');
		expect(rows[2].linkLabel).toBe('Set the application window');
	});

	it('says the dates are in the wrong order when both are set', () => {
		const conference = { ...READY_CONFERENCE, applicationsCloseAt: '2027-04-01T09:00:00Z' };
		const applicationsRow = publishReviewRows(makeFacts({ conference }))[2];

		expect(applicationsRow.missing).toBe(
			'Applications need to close after they open and before the conference starts'
		);
	});

	it('names the committees that still have no seat on offer', () => {
		const counts = { ...READY_COUNTS, committeesWithoutAvailableSeatsCount: 2 };
		const committeesRow = publishReviewRows(makeFacts({}, counts))[1];

		expect(committeesRow.missing).toBe('2 committees have no seat on offer yet');
		expect(committeesRow.linkLabel).toBe('Add seats');
	});
});

describe('reviewRowLinkName', () => {
	it('names what an Edit link edits, and leaves any other link alone', () => {
		const rows = publishReviewRows(makeFacts());

		expect(reviewRowLinkName(rows[1])).toBe('Edit committees');
		expect(reviewRowLinkName({ ...rows[1], linkLabel: 'Add seats' })).toBe('Add seats');
	});
});

describe('conferencePlace', () => {
	it('leaves out the parts that are not filled in', () => {
		expect(conferencePlace({ venueName: 'Hall', venueAddress: ' ', city: 'Leeds' })).toBe(
			'Hall, Leeds'
		);
	});
});

describe('applicationWindowSentence', () => {
	it('names the opening day when it is still to come', () => {
		const conference = { ...READY_CONFERENCE, applicationsOpenAt: '2026-12-01T09:00:00Z' };

		expect(applicationWindowSentence(conference, NOW)).toBe(
			'Open on 1 Dec 2026 at 09:00, close on 31 Jan 2027 at 23:59'
		);
	});
});

describe('committeesWithoutChairSentence', () => {
	const unchaired = (name: string): ReviewCommittee => ({
		name,
		abbreviation: null,
		availableSeatCount: 1,
		chairCount: 0
	});

	it('names one or two committees and counts more', () => {
		expect(committeesWithoutChairSentence(COMMITTEES)).toBe('DISEC has no chair yet.');
		expect(committeesWithoutChairSentence([unchaired('GA'), unchaired('SC')])).toBe(
			'GA and SC have no chair yet.'
		);
		expect(
			committeesWithoutChairSentence([unchaired('GA'), unchaired('SC'), unchaired('ECOSOC')])
		).toBe('3 committees have no chair yet.');
	});

	it('says nothing when every committee has a chair', () => {
		expect(committeesWithoutChairSentence([COMMITTEES[0]])).toBeNull();
	});
});

describe('worthDoingItems', () => {
	it('suggests a banner and a chair, with where to do each', () => {
		const items = worthDoingItems(makeFacts());

		expect(items.map((item) => item.key)).toEqual(['banner', 'chairs']);
		expect(items[0].linkLabel).toBe('Add a banner');
		expect(items[1]).toMatchObject({
			text: 'DISEC has no chair yet.',
			linkLabel: 'Invite a chair',
			href: '/manage/northbridge-mun-2027/team'
		});
	});

	it('suggests fees and Stripe when they are not done', () => {
		const noFees = { ...READY_COUNTS, feeCount: 0, collectsPaymentsManually: false };
		const feeItems = worthDoingItems(makeFacts({}, noFees));

		expect(feeItems.map((item) => item.key)).toContain('fees');

		const byCard = { ...READY_COUNTS, collectsPaymentsManually: false };
		const stripeItem = worthDoingItems(makeFacts({}, byCard)).find((item) => item.key === 'stripe');

		expect(stripeItem?.linkLabel).toBe('Connect Stripe');
		expect(stripeItem?.href).toBe('/manage/organizations/northbridge-mun-society');
	});

	it('suggests nothing once everything recommended is done', () => {
		const conference = { ...READY_CONFERENCE, bannerPath: 'banner.jpg' };
		const items = worthDoingItems(makeFacts({ conference, committees: [COMMITTEES[0]] }));

		expect(items).toEqual([]);
	});
});

describe('publishReviewSummary', () => {
	it('says everything is in place, or how many steps are left', () => {
		const ready = makeFacts().checklist;
		const twoLeft = makeFacts({
			conference: { ...READY_CONFERENCE, venueName: null, applicationsOpenAt: null }
		}).checklist;

		expect(publishReviewSummary(ready)).toBe('Everything required is in place.');
		expect(missingRequiredLines(twoLeft).map((line) => line.key)).toEqual([
			'details',
			'application-window'
		]);
		expect(publishReviewSummary(twoLeft)).toBe('2 steps left before you can publish.');
	});

	it('does not count the banner, which is only recommended', () => {
		expect(missingRequiredLines(makeFacts().checklist)).toEqual([]);
	});
});

describe('whenYouPublishBullets', () => {
	it('says applications open straight away when the opening has passed', () => {
		expect(whenYouPublishBullets(READY_CONFERENCE, NOW)[1]).toBe(
			'Applications open straight away; you review each one under Applications.'
		);
	});

	it('names the opening day when it is still to come', () => {
		const conference = { ...READY_CONFERENCE, applicationsOpenAt: '2026-12-01T09:00:00Z' };

		expect(whenYouPublishBullets(conference, NOW)[1]).toBe(
			'Applications open on 1 Dec 2026; you review each one under Applications.'
		);
	});
});
