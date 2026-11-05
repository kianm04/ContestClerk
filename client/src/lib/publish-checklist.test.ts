import { describe, expect, it } from 'vitest';
import type { Conference } from './conferences';
import {
	canPublish,
	countDone,
	countRemainingRequired,
	countRequired,
	nextChecklistLineKey,
	publishChecklist,
	publishChecklistItems,
	type PublishChecklistCounts,
	type PublishChecklistLine,
	type PublishChecklistItem
} from './publish-checklist';

/**
 * A conference as `/create` leaves it: a name, a place and dates, and nothing
 * else. Every required checklist item is open on it.
 *
 * A `Conference` has a lot of fields and these tests only care about the seven
 * the checklist reads, so this one sits here once rather than in every test.
 */
const NEW_CONFERENCE: Conference = {
	id: 'conference-thimun',
	slug: 'thimun-2027',
	name: 'THIMUN 2027',
	description: null,
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
	websiteUrl: null,
	bannerPath: null,
	logoPath: null,
	level: 'high_school',
	status: 'draft',
	timezone: 'Europe/Amsterdam',
	expectedDelegates: null,
	applicationsOpenAt: null,
	applicationsCloseAt: null,
	committeeCount: 0,
	committeeNames: [],
	tagline: null,
	venueName: null,
	venueAddress: null,
	contactEmail: null,
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

/** A conference that is `NEW_CONFERENCE` apart from the fields a test names. */
function makeConference(overrides: Partial<Conference> = {}): Conference {
	return { ...NEW_CONFERENCE, ...overrides };
}

/**
 * Everything items 1, 2, 3, 5 and 8 ask of the conference row itself. The
 * window closes on 1 December 2026, well before the first day in January.
 */
const READY_CONFERENCE_FIELDS: Partial<Conference> = {
	description: 'Four days of debate at the World Forum.',
	tagline: 'Debate the world',
	bannerPath: 'banners/thimun-2027.jpg',
	venueName: 'World Forum',
	contactEmail: 'hello@thimun.org',
	applicationsOpenAt: '2026-09-01T09:00:00Z',
	applicationsCloseAt: '2026-12-01T09:00:00Z'
};

/** A conference with nothing counted beside it: no committees, no fees, no Stripe. */
const NO_COUNTS: PublishChecklistCounts = {
	committeeCount: 0,
	committeesWithoutAvailableSeatsCount: 0,
	onlyCommitteeWithoutSeatsId: null,
	feeCount: 0,
	collectsPaymentsManually: false,
	isStripeConnected: false
};

/** Counts that are `NO_COUNTS` apart from the fields a test names. */
function makeCounts(overrides: Partial<PublishChecklistCounts> = {}): PublishChecklistCounts {
	return { ...NO_COUNTS, ...overrides };
}

/** Everything items 4, 6 and 7 ask for: committees with seats, fees, and Stripe connected. */
const READY_COUNTS: PublishChecklistCounts = {
	committeeCount: 4,
	committeesWithoutAvailableSeatsCount: 0,
	onlyCommitteeWithoutSeatsId: null,
	feeCount: 2,
	collectsPaymentsManually: false,
	isStripeConnected: true
};

/** The labels of the items, in order, for the tests about which items are in the list. */
function labelsOf(items: PublishChecklistItem[]): string[] {
	return items.map((item) => item.label);
}

/**
 * Whether the item with this label is done.
 *
 * It throws rather than returning `false` when there is no such item, so that a
 * renamed label fails the test that names it instead of quietly passing.
 */
function isItemDone(items: PublishChecklistItem[], label: string): boolean {
	const item = items.find((candidate) => candidate.label === label);

	if (item === undefined) {
		throw new Error(`The checklist has no item called "${label}".`);
	}

	return item.isDone;
}

/** Where the item with this label sends the organiser, or `undefined` for nowhere. */
function hrefOf(items: PublishChecklistItem[], label: string): string | undefined {
	const item = items.find((candidate) => candidate.label === label);

	if (item === undefined) {
		throw new Error(`The checklist has no item called "${label}".`);
	}

	return item.href;
}

/** The "Set the application window" item, for the tests about item 5. */
function isWindowDone(conference: Conference): boolean {
	const items = publishChecklistItems(conference, NO_COUNTS);

	return isItemDone(items, 'Set the application window');
}

describe('publishChecklistItems', () => {
	it('lists the seven always-there items in the order of the page file', () => {
		const items = publishChecklistItems(makeConference(), NO_COUNTS);

		expect(labelsOf(items)).toEqual([
			'Describe the conference',
			'Add a banner image',
			'Set the venue',
			'Add at least one committee with seats',
			'Set the application window',
			'Set fees or choose manual collection',
			'Add a contact email'
		]);
	});

	it('puts "Connect Stripe" between the fees and the contact email when it belongs there', () => {
		const items = publishChecklistItems(makeConference(), makeCounts({ feeCount: 1 }));

		expect(labelsOf(items)).toEqual([
			'Describe the conference',
			'Add a banner image',
			'Set the venue',
			'Add at least one committee with seats',
			'Set the application window',
			'Set fees or choose manual collection',
			'Connect Stripe',
			'Add a contact email'
		]);
	});

	it('leaves every item open on a brand new conference', () => {
		const items = publishChecklistItems(makeConference(), NO_COUNTS);

		expect(items.every((item) => !item.isDone)).toBe(true);
		expect(canPublish(items)).toBe(false);
	});

	it('marks every item done on a conference that is ready', () => {
		const conference = makeConference(READY_CONFERENCE_FIELDS);
		const items = publishChecklistItems(conference, READY_COUNTS);

		expect(items.every((item) => item.isDone)).toBe(true);
		expect(canPublish(items)).toBe(true);
	});
});

describe('publishChecklistItems, item 1: describe the conference', () => {
	it('is open when only the description is written', () => {
		const conference = makeConference({ description: 'Four days of debate.' });
		const items = publishChecklistItems(conference, NO_COUNTS);

		expect(isItemDone(items, 'Describe the conference')).toBe(false);
	});

	it('is open when only the tagline is written', () => {
		const conference = makeConference({ tagline: 'Debate the world' });
		const items = publishChecklistItems(conference, NO_COUNTS);

		expect(isItemDone(items, 'Describe the conference')).toBe(false);
	});

	it('is open when the description is only spaces', () => {
		const conference = makeConference({ description: '   ', tagline: 'Debate the world' });
		const items = publishChecklistItems(conference, NO_COUNTS);

		expect(isItemDone(items, 'Describe the conference')).toBe(false);
	});

	it('is done when both are written', () => {
		const conference = makeConference({
			description: 'Four days of debate.',
			tagline: 'Debate the world'
		});
		const items = publishChecklistItems(conference, NO_COUNTS);

		expect(isItemDone(items, 'Describe the conference')).toBe(true);
	});
});

describe('publishChecklistItems, items 2, 3 and 8: the banner, the venue and the contact email', () => {
	it('marks the banner done once the conference has a picture', () => {
		const conference = makeConference({ bannerPath: 'banners/thimun-2027.jpg' });
		const items = publishChecklistItems(conference, NO_COUNTS);

		expect(isItemDone(items, 'Add a banner image')).toBe(true);
	});

	it('leaves the banner open for an empty path, which points at no picture', () => {
		const items = publishChecklistItems(makeConference({ bannerPath: '   ' }), NO_COUNTS);

		expect(isItemDone(items, 'Add a banner image')).toBe(false);
	});

	it('marks the venue done once it has a name, and leaves it open for spaces', () => {
		const named = publishChecklistItems(makeConference({ venueName: 'World Forum' }), NO_COUNTS);
		const blank = publishChecklistItems(makeConference({ venueName: '  ' }), NO_COUNTS);

		expect(isItemDone(named, 'Set the venue')).toBe(true);
		expect(isItemDone(blank, 'Set the venue')).toBe(false);
	});

	it('marks the contact email done once there is an address, and leaves it open for spaces', () => {
		const given = publishChecklistItems(
			makeConference({ contactEmail: 'hi@thimun.org' }),
			NO_COUNTS
		);
		const blank = publishChecklistItems(makeConference({ contactEmail: ' ' }), NO_COUNTS);

		expect(isItemDone(given, 'Add a contact email')).toBe(true);
		expect(isItemDone(blank, 'Add a contact email')).toBe(false);
	});
});

describe('publishChecklistItems, the addresses an item links to', () => {
	it('sends the four items the details editor answers to that editor', () => {
		const items = publishChecklistItems(makeConference(), NO_COUNTS);
		const detailsItems = [
			'Describe the conference',
			'Add a banner image',
			'Set the venue',
			'Add a contact email'
		];

		detailsItems.forEach((label) => {
			expect(hrefOf(items, label)).toBe('/manage/thimun-2027/details');
		});
	});

	it('sends the committees item to the committees list, which T21 built', () => {
		const items = publishChecklistItems(makeConference(), READY_COUNTS);

		expect(hrefOf(items, 'Add at least one committee with seats')).toBe(
			'/manage/thimun-2027/committees'
		);
	});

	it('sends the Stripe item to the organisation settings page, which T23 built', () => {
		const items = publishChecklistItems(makeConference(), READY_COUNTS);

		expect(hrefOf(items, 'Connect Stripe')).toBe('/manage/organizations/thimun-foundation');
	});

	// A conference whose organisation could not be read has no address to offer,
	// and `PublishChecklist` then draws the item as plain words.
	it('leaves the Stripe item without one when the organisation is unknown', () => {
		const conference = { ...makeConference(), organizationSlug: null };
		const items = publishChecklistItems(conference, READY_COUNTS);

		expect(hrefOf(items, 'Connect Stripe')).toBeUndefined();
	});

	it('sends the fees item to the fees page, which T66 built', () => {
		const items = publishChecklistItems(makeConference(), READY_COUNTS);

		expect(hrefOf(items, 'Set fees or choose manual collection')).toBe('/manage/thimun-2027/fees');
	});

	it('sends the application window item to the application form page, which T67 built', () => {
		const items = publishChecklistItems(makeConference(), READY_COUNTS);

		expect(hrefOf(items, 'Set the application window')).toBe(
			'/manage/thimun-2027/application-form'
		);
	});
});

describe('publishChecklistItems, item 4: at least one committee with seats', () => {
	const label = 'Add at least one committee with seats';

	it('is open for a conference with no committees at all', () => {
		const items = publishChecklistItems(makeConference(), makeCounts({ committeeCount: 0 }));

		expect(isItemDone(items, label)).toBe(false);
	});

	it('is open while one committee has no seat on offer', () => {
		const counts = makeCounts({ committeeCount: 3, committeesWithoutAvailableSeatsCount: 1 });
		const items = publishChecklistItems(makeConference(), counts);

		expect(isItemDone(items, label)).toBe(false);
	});

	it('is done once every committee has a seat on offer', () => {
		const counts = makeCounts({ committeeCount: 3, committeesWithoutAvailableSeatsCount: 0 });
		const items = publishChecklistItems(makeConference(), counts);

		expect(isItemDone(items, label)).toBe(true);
	});
});

describe('publishChecklistItems, item 5: the application window', () => {
	it('is open when the conference has no window at all', () => {
		expect(isWindowDone(makeConference())).toBe(false);
	});

	it('is open when only the opening date is set', () => {
		const conference = makeConference({ applicationsOpenAt: '2026-09-01T09:00:00Z' });

		expect(isWindowDone(conference)).toBe(false);
	});

	it('is open when only the closing date is set', () => {
		const conference = makeConference({ applicationsCloseAt: '2026-12-01T09:00:00Z' });

		expect(isWindowDone(conference)).toBe(false);
	});

	it('is open when the window closes before it opens', () => {
		const conference = makeConference({
			applicationsOpenAt: '2026-12-01T09:00:00Z',
			applicationsCloseAt: '2026-09-01T09:00:00Z'
		});

		expect(isWindowDone(conference)).toBe(false);
	});

	it('is open when the window closes after the conference has started', () => {
		const conference = makeConference({
			applicationsOpenAt: '2026-09-01T09:00:00Z',
			applicationsCloseAt: '2027-02-01T09:00:00Z'
		});

		expect(isWindowDone(conference)).toBe(false);
	});

	it('is done when the window opens, then closes, and closes before the first day', () => {
		const conference = makeConference({
			applicationsOpenAt: '2026-09-01T09:00:00Z',
			applicationsCloseAt: '2026-12-01T09:00:00Z'
		});

		expect(isWindowDone(conference)).toBe(true);
	});

	it('is open for a window that closes on the first day where the conference is, although that moment is still the day before in UTC', () => {
		// 20:00 UTC on 23 January is 09:00 on 24 January in Auckland, which is
		// the conference's own first day. Reading the moment in UTC would say
		// the window closes the day before it starts and pass this item.
		const conference = makeConference({
			timezone: 'Pacific/Auckland',
			startDate: '2027-01-24',
			endDate: '2027-01-29',
			applicationsOpenAt: '2026-11-01T09:00:00Z',
			applicationsCloseAt: '2027-01-23T20:00:00Z'
		});

		expect(isWindowDone(conference)).toBe(false);
	});
});

describe('publishChecklistItems, item 6: fees or manual collection', () => {
	const label = 'Set fees or choose manual collection';

	it('is open when there are no fees and nobody is collecting by hand', () => {
		const items = publishChecklistItems(makeConference(), NO_COUNTS);

		expect(isItemDone(items, label)).toBe(false);
	});

	it('is done on a fee alone', () => {
		const items = publishChecklistItems(makeConference(), makeCounts({ feeCount: 1 }));

		expect(isItemDone(items, label)).toBe(true);
	});

	it('is done on manual collection alone', () => {
		const items = publishChecklistItems(
			makeConference(),
			makeCounts({ collectsPaymentsManually: true })
		);

		expect(isItemDone(items, label)).toBe(true);
	});

	it('is recommended rather than required', () => {
		const items = publishChecklistItems(makeConference(), NO_COUNTS);
		const feesItem = items.find((item) => item.label === label);

		expect(feesItem?.isRequired).toBe(false);
	});
});

describe('publishChecklistItems, item 7: connect Stripe', () => {
	const label = 'Connect Stripe';

	it('is left out when the conference charges nothing', () => {
		const items = publishChecklistItems(makeConference(), makeCounts({ feeCount: 0 }));

		expect(labelsOf(items)).not.toContain(label);
	});

	it('is left out when the organisers collect the money themselves', () => {
		const counts = makeCounts({ feeCount: 3, collectsPaymentsManually: true });
		const items = publishChecklistItems(makeConference(), counts);

		expect(labelsOf(items)).not.toContain(label);
	});

	it('is there and open when there are fees and Stripe is not connected', () => {
		const counts = makeCounts({ feeCount: 3, isStripeConnected: false });
		const items = publishChecklistItems(makeConference(), counts);

		expect(isItemDone(items, label)).toBe(false);
	});

	it('is there and done once Stripe is connected', () => {
		const counts = makeCounts({ feeCount: 3, isStripeConnected: true });
		const items = publishChecklistItems(makeConference(), counts);

		expect(isItemDone(items, label)).toBe(true);
	});

	it('is recommended rather than required', () => {
		const counts = makeCounts({ feeCount: 3 });
		const items = publishChecklistItems(makeConference(), counts);
		const stripeItem = items.find((item) => item.label === label);

		expect(stripeItem?.isRequired).toBe(false);
	});
});

describe('canPublish', () => {
	it('is false while a required item is open', () => {
		const items = publishChecklistItems(makeConference(), NO_COUNTS);

		expect(canPublish(items)).toBe(false);
	});

	it('is true while only the recommended items are open', () => {
		// This is the whole point of the two kinds: a conference that charges
		// nothing and has connected nothing is still ready to publish.
		const conference = makeConference(READY_CONFERENCE_FIELDS);
		const counts = makeCounts({ committeeCount: 2 });
		const items = publishChecklistItems(conference, counts);

		expect(isItemDone(items, 'Set fees or choose manual collection')).toBe(false);
		expect(canPublish(items)).toBe(true);
	});

	it('is true without a banner, which the manage redesign made recommended', () => {
		const conference = makeConference({ ...READY_CONFERENCE_FIELDS, bannerPath: null });
		const items = publishChecklistItems(conference, READY_COUNTS);

		expect(isItemDone(items, 'Add a banner image')).toBe(false);
		expect(canPublish(items)).toBe(true);
	});

	it('is true when everything is done', () => {
		const items = publishChecklistItems(makeConference(READY_CONFERENCE_FIELDS), READY_COUNTS);

		expect(canPublish(items)).toBe(true);
	});
});

describe('countRemainingRequired', () => {
	it('counts all five required items on a brand new conference', () => {
		const items = publishChecklistItems(makeConference(), NO_COUNTS);

		expect(countRemainingRequired(items)).toBe(5);
	});

	it('counts one fewer for each required item that is done', () => {
		const conference = makeConference({ venueName: 'World Forum' });
		const items = publishChecklistItems(conference, NO_COUNTS);

		expect(countRemainingRequired(items)).toBe(4);
	});

	it('does not count a recommended item that is still open', () => {
		const conference = makeConference(READY_CONFERENCE_FIELDS);
		const items = publishChecklistItems(conference, makeCounts({ committeeCount: 2 }));

		expect(countRemainingRequired(items)).toBe(0);
	});
});

describe('countRequired', () => {
	it('is five, because three of the eight items are only recommended', () => {
		const items = publishChecklistItems(makeConference(), makeCounts({ feeCount: 1 }));

		expect(items).toHaveLength(8);
		expect(countRequired(items)).toBe(5);
	});

	it('is still five when "Connect Stripe" is left out', () => {
		const items = publishChecklistItems(makeConference(), NO_COUNTS);

		expect(items).toHaveLength(7);
		expect(countRequired(items)).toBe(5);
	});
});

describe('countDone', () => {
	it('is nought on a conference nobody has filled anything in for', () => {
		const items = publishChecklistItems(makeConference(), NO_COUNTS);

		expect(countDone(items)).toBe(0);
	});

	it('counts a recommended item as well as a required one', () => {
		// Nothing is filled in on the conference row, so the only two items that
		// can be done are the two the counts answer: "Add at least one committee
		// with seats", which is required, and "Set fees or choose manual
		// collection", which is only recommended. The line on a conference card
		// says how far the whole list has got, not how far the required half has.
		const counts = makeCounts({ committeeCount: 2, collectsPaymentsManually: true });
		const items = publishChecklistItems(makeConference(), counts);

		expect(countDone(items)).toBe(2);
	});

	it('is every item once the conference is ready to publish', () => {
		const items = publishChecklistItems(makeConference(READY_CONFERENCE_FIELDS), READY_COUNTS);

		// Eight rather than seven, because `READY_COUNTS` has fees, which is what
		// puts "Connect Stripe" in the list at all.
		expect(items).toHaveLength(8);
		expect(countDone(items)).toBe(8);
	});
});

/**
 * A moment in the middle of the window `READY_CONFERENCE_FIELDS` sets, which
 * opened on 1 September 2026 and closes on 1 December.
 */
const DURING_THE_WINDOW = new Date('2026-10-15T12:00:00Z');

/** The line with this key, or a thrown error naming the missing one. */
function lineOf(
	lines: PublishChecklistLine[],
	key: PublishChecklistLine['key']
): PublishChecklistLine {
	const line = lines.find((candidate) => candidate.key === key);

	if (line === undefined) {
		throw new Error(`The checklist has no line "${key}".`);
	}

	return line;
}

describe('publishChecklist, the six grouped lines', () => {
	it('lists one line per page, in the order a first conference is set up', () => {
		const lines = publishChecklist(makeConference(), NO_COUNTS, DURING_THE_WINDOW);

		// No fees, so "Connect Stripe" is not asked for and there are six lines.
		expect(lines.map((line) => line.key)).toEqual([
			'committees',
			'details',
			'banner',
			'application-window',
			'fees',
			'publish'
		]);
	});

	it('adds "Connect Stripe" before Publish only when fees are charged through it', () => {
		const lines = publishChecklist(
			makeConference(),
			makeCounts({ feeCount: 1 }),
			DURING_THE_WINDOW
		);

		expect(lines.map((line) => line.key)).toEqual([
			'committees',
			'details',
			'banner',
			'application-window',
			'fees',
			'stripe',
			'publish'
		]);
		expect(lineOf(lines, 'stripe').isRequired).toBe(false);
	});

	it('makes the committees, details and window lines required, and banner and fees recommended', () => {
		const lines = publishChecklist(makeConference(), NO_COUNTS, DURING_THE_WINDOW);

		expect(lineOf(lines, 'committees').isRequired).toBe(true);
		expect(lineOf(lines, 'details').isRequired).toBe(true);
		expect(lineOf(lines, 'banner').isRequired).toBe(false);
		expect(lineOf(lines, 'application-window').isRequired).toBe(true);
		expect(lineOf(lines, 'fees').isRequired).toBe(false);
		expect(countRequired(lines)).toBe(3);
	});

	it('agrees with the eight items about whether the conference can be published', () => {
		const cases: [Partial<Conference>, PublishChecklistCounts][] = [
			[{}, NO_COUNTS],
			[READY_CONFERENCE_FIELDS, READY_COUNTS],
			[{ ...READY_CONFERENCE_FIELDS, contactEmail: null }, READY_COUNTS],
			[READY_CONFERENCE_FIELDS, makeCounts({ committeeCount: 0 })]
		];

		for (const [fields, counts] of cases) {
			const conference = makeConference(fields);
			const items = publishChecklistItems(conference, counts);
			const lines = publishChecklist(conference, counts, DURING_THE_WINDOW);

			expect(canPublish(lines)).toBe(canPublish(items));
		}
	});
});

describe('publishChecklist, line 1: a committee with seats', () => {
	it('sends a conference with no committee to the new committee form', () => {
		const lines = publishChecklist(makeConference(), NO_COUNTS, DURING_THE_WINDOW);
		const line = lineOf(lines, 'committees');

		expect(line.isDone).toBe(false);
		expect(line.actionLabel).toBe('Add a committee');
		expect(line.href).toBe('/manage/thimun-2027/committees/new');
	});

	it('sends the organiser to the one committee without seats', () => {
		const counts = makeCounts({
			committeeCount: 2,
			committeesWithoutAvailableSeatsCount: 1,
			onlyCommitteeWithoutSeatsId: 'committee-unsc'
		});
		const line = lineOf(
			publishChecklist(makeConference(), counts, DURING_THE_WINDOW),
			'committees'
		);

		expect(line.isDone).toBe(false);
		expect(line.actionLabel).toBe('Add seats');
		expect(line.detail).toBe('1 committee has no seat on offer yet');
		expect(line.href).toBe('/manage/thimun-2027/committees/committee-unsc');
	});

	it('sends the organiser to the list when several committees have no seats', () => {
		const counts = makeCounts({ committeeCount: 3, committeesWithoutAvailableSeatsCount: 2 });
		const line = lineOf(
			publishChecklist(makeConference(), counts, DURING_THE_WINDOW),
			'committees'
		);

		expect(line.detail).toBe('2 committees have no seat on offer yet');
		expect(line.href).toBe('/manage/thimun-2027/committees');
	});

	it('is done when every committee has a seat on offer', () => {
		const counts = makeCounts({ committeeCount: 3 });
		const line = lineOf(
			publishChecklist(makeConference(), counts, DURING_THE_WINDOW),
			'committees'
		);

		expect(line.isDone).toBe(true);
		expect(line.detail).toBeUndefined();
	});
});

describe('publishChecklist, line 2: the details', () => {
	it('names everything still missing under the line', () => {
		const line = lineOf(
			publishChecklist(makeConference(), NO_COUNTS, DURING_THE_WINDOW),
			'details'
		);

		expect(line.isDone).toBe(false);
		expect(line.actionLabel).toBe('Finish the details');
		expect(line.href).toBe('/manage/thimun-2027/details');
		expect(line.detail).toBe('A description and tagline, the venue and a contact email');
	});

	it('names only what is still missing', () => {
		const conference = makeConference({
			description: 'Four days of debate.',
			tagline: 'Debate the world',
			venueName: 'World Forum'
		});
		const line = lineOf(publishChecklist(conference, NO_COUNTS, DURING_THE_WINDOW), 'details');

		expect(line.detail).toBe('A contact email');
	});

	it('is done only when all three of its required items are, banner or not', () => {
		const ready = makeConference(READY_CONFERENCE_FIELDS);

		expect(lineOf(publishChecklist(ready, NO_COUNTS, DURING_THE_WINDOW), 'details').isDone).toBe(
			true
		);

		for (const missing of ['description', 'venueName', 'contactEmail'] as const) {
			const conference = makeConference({ ...READY_CONFERENCE_FIELDS, [missing]: null });
			const line = lineOf(publishChecklist(conference, NO_COUNTS, DURING_THE_WINDOW), 'details');

			expect(line.isDone).toBe(false);
		}

		const withoutBanner = makeConference({ ...READY_CONFERENCE_FIELDS, bannerPath: null });
		const lines = publishChecklist(withoutBanner, NO_COUNTS, DURING_THE_WINDOW);

		expect(lineOf(lines, 'details').isDone).toBe(true);
	});
});

describe('publishChecklist, the banner line', () => {
	it('asks for a banner on the details page while there is none', () => {
		const lines = publishChecklist(makeConference(), NO_COUNTS, DURING_THE_WINDOW);
		const line = lineOf(lines, 'banner');

		expect(line.isDone).toBe(false);
		expect(line.isRequired).toBe(false);
		expect(line.actionLabel).toBe('Add a banner');
		expect(line.href).toBe('/manage/thimun-2027/details');
	});

	it('is done once the conference has a picture', () => {
		const conference = makeConference({ bannerPath: 'banners/thimun-2027.jpg' });
		const line = lineOf(publishChecklist(conference, NO_COUNTS, DURING_THE_WINDOW), 'banner');

		expect(line.isDone).toBe(true);
		expect(line.detail).toBeUndefined();
	});
});

describe('publishChecklist, line 3: the application window', () => {
	it('asks for a window while there is none', () => {
		const line = lineOf(
			publishChecklist(makeConference(), NO_COUNTS, DURING_THE_WINDOW),
			'application-window'
		);

		expect(line.isDone).toBe(false);
		expect(line.label).toBe('Set the application window');
		expect(line.href).toBe('/manage/thimun-2027/application-form');
	});

	it('says an open window opens as soon as the conference is published', () => {
		const conference = makeConference(READY_CONFERENCE_FIELDS);
		const line = lineOf(
			publishChecklist(conference, NO_COUNTS, DURING_THE_WINDOW),
			'application-window'
		);

		expect(line.isDone).toBe(true);
		expect(line.label).toBe('Applications: open as soon as you publish, until 1 Dec 2026');
		expect(line.actionLabel).toBe('Change');
	});

	it('names the opening day of a window that opens later', () => {
		const conference = makeConference({
			...READY_CONFERENCE_FIELDS,
			applicationsOpenAt: '2026-10-01T09:00:00Z'
		});
		const beforeTheWindow = new Date('2026-08-01T12:00:00Z');
		const line = lineOf(
			publishChecklist(conference, NO_COUNTS, beforeTheWindow),
			'application-window'
		);

		expect(line.label).toBe('Applications: open on 1 Oct 2026, until 1 Dec 2026');
	});
});

describe('publishChecklist, the Publish line', () => {
	it('is the last line, neither required nor recommended, and has no address', () => {
		const lines = publishChecklist(makeConference(), NO_COUNTS, DURING_THE_WINDOW);
		const publish = lines[lines.length - 1];

		expect(publish.key).toBe('publish');
		expect(publish.isRequired).toBe(false);
		expect(publish.href).toBeUndefined();
		expect(publish.actionLabel).toBe('Publish conference');
	});
});

describe('nextChecklistLineKey', () => {
	it('is the first undone required line', () => {
		const lines = publishChecklist(makeConference(), NO_COUNTS, DURING_THE_WINDOW);

		expect(nextChecklistLineKey(lines)).toBe('committees');
	});

	it('moves down the list as lines are done', () => {
		const withCommittees = makeCounts({ committeeCount: 2 });
		const described = makeConference({
			description: 'Four days of debate.',
			tagline: 'Debate the world',
			bannerPath: 'banners/thimun.jpg',
			venueName: 'World Forum',
			contactEmail: 'hello@thimun.org'
		});

		expect(
			nextChecklistLineKey(publishChecklist(makeConference(), withCommittees, DURING_THE_WINDOW))
		).toBe('details');
		expect(
			nextChecklistLineKey(publishChecklist(described, withCommittees, DURING_THE_WINDOW))
		).toBe('application-window');
	});

	it('is Publish once every required line is done, whatever the recommended ones say', () => {
		const conference = makeConference(READY_CONFERENCE_FIELDS);
		const lines = publishChecklist(
			conference,
			makeCounts({ committeeCount: 1 }),
			DURING_THE_WINDOW
		);

		expect(lineOf(lines, 'fees').isDone).toBe(false);
		expect(nextChecklistLineKey(lines)).toBe('publish');
	});
});
