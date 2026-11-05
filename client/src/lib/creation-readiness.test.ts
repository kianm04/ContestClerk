import { describe, expect, it } from 'vitest';
import {
	applicationsNote,
	effectiveLaunchChoice,
	hasValidLocation,
	launchChoices,
	launchFeeSummary,
	launchRows,
	openApplicationsBlockers,
	optionalImprovements,
	publicPageStatus,
	publishBlockers,
	whatApplicantsSee,
	type LaunchFacts,
	type LaunchRow,
	type PublicPageFacts
} from './creation-readiness';
import type { CreationDraft } from './creation-draft';

/** A draft whose public page is as ready as it gets. */
const READY: PublicPageFacts = {
	name: 'Delft MUN 2027',
	locationMode: 'in_person',
	city: 'Delft',
	countryCode: 'NL',
	description: 'Three days of debate.',
	contactEmail: 'board@delftmun.nl',
	prefillSources: { start_date: 'previous_conference' }
};

describe('hasValidLocation', () => {
	it('needs a city and a country unless the conference is online', () => {
		expect(hasValidLocation(READY)).toBe(true);
		expect(hasValidLocation({ ...READY, city: ' ' })).toBe(false);
		expect(hasValidLocation({ ...READY, countryCode: null })).toBe(false);
		expect(hasValidLocation({ locationMode: 'online', city: null, countryCode: null })).toBe(true);
		expect(hasValidLocation({ locationMode: 'hybrid', city: 'Delft', countryCode: null })).toBe(
			false
		);
	});
});

describe('publicPageStatus', () => {
	it('is ready with a name, chosen dates, a place, a description and a contact email', () => {
		expect(publicPageStatus(READY)).toBe('ready');
	});

	it('is mostly ready without the description or the contact email', () => {
		expect(publicPageStatus({ ...READY, description: null })).toBe('mostly_ready');
		expect(publicPageStatus({ ...READY, contactEmail: '' })).toBe('mostly_ready');
	});

	it('needs dates while they are still the placeholder', () => {
		expect(publicPageStatus({ ...READY, prefillSources: { start_date: 'system_default' } })).toBe(
			'needs_dates'
		);
	});

	it('is blocked without a name or without a place for an in-person conference', () => {
		expect(publicPageStatus({ ...READY, name: '' })).toBe('blocked');
		expect(publicPageStatus({ ...READY, city: null })).toBe('blocked');
		expect(
			publicPageStatus({ ...READY, locationMode: 'online', city: null, countryCode: null })
		).toBe('ready');
	});
});

/**
 * A returning organiser's draft at Launch: dates chosen, a city, the venue and
 * the times still to be announced, the fees undecided, applications manual.
 */
const DRAFT: CreationDraft = {
	id: 'draft-1',
	slug: 'tu-delft-mun-2027',
	name: 'TU Delft MUN 2027',
	tagline: null,
	description: 'Three days of debate.',
	organizationId: 'org-1',
	status: 'draft',
	creationStep: 'launch',
	locationMode: 'in_person',
	city: 'Delft',
	countryCode: 'NL',
	countryName: 'Netherlands',
	venueStatus: 'tba',
	venueName: null,
	venueAddress: null,
	startDate: '2027-04-16',
	endDate: '2027-04-18',
	timezone: 'Europe/Amsterdam',
	conferenceTimeStatus: 'tba',
	startTime: null,
	endTime: null,
	currency: 'EUR',
	level: 'university',
	logoPath: null,
	bannerPath: null,
	contactEmail: 'board@delftmun.nl',
	websiteUrl: null,
	instagramUrl: null,
	feeStatus: 'undecided',
	collectsPaymentsManually: false,
	applicationOpenMode: 'manual',
	applicationsOpenAt: null,
	applicationCloseRule: 'relative',
	applicationCloseOffsetDays: -14,
	applicationsCloseAt: '2027-04-02T21:59:00Z',
	acceptsIndividualApplications: true,
	acceptsDelegations: true,
	committeePreferenceCount: 3,
	askMotivation: false,
	positionPaperRequired: false,
	prefillSources: { start_date: 'user', name: 'previous_conference' },
	updatedAt: '2026-10-04T10:00:00Z'
};

/** Nothing set up in the other tables yet, with twelve committees to import. */
const FACTS: LaunchFacts = {
	committeeCount: 0,
	previousCommitteeCount: 12,
	questionCount: 0,
	feeCount: 0,
	firstFee: null,
	organizationName: 'TU Delft MUN'
};

/** Well before the conference and its deadline. */
const NOW = new Date('2026-10-04T12:00:00Z');

/** The placeholder dates of a draft started without an earlier edition. */
const PLACEHOLDER_DATES = { start_date: 'system_default' } as const;

/** The table row with `key`. */
function rowOf(rows: LaunchRow[], key: LaunchRow['key']): LaunchRow {
	const row = rows.find((candidate) => candidate.key === key);

	if (!row) {
		throw new Error(`No ${key} row.`);
	}

	return row;
}

describe('publishBlockers', () => {
	it('lets a draft with TBA venue, TBA times, no pictures and undecided fees go public', () => {
		expect(publishBlockers(DRAFT)).toEqual([]);
	});

	it('needs a name, chosen dates in order, and a place for an in-person conference', () => {
		expect(publishBlockers({ ...DRAFT, name: '  ' })).toEqual([
			'Give the conference a name on the Basics step.'
		]);
		expect(publishBlockers({ ...DRAFT, prefillSources: PLACEHOLDER_DATES })).toEqual([
			'Pick the conference dates on the When & where step.'
		]);
		expect(publishBlockers({ ...DRAFT, endDate: '2027-04-15' })).toEqual([
			'The last day is before the first. Fix the dates on the When & where step.'
		]);
		expect(publishBlockers({ ...DRAFT, locationMode: 'hybrid', countryCode: null })).toEqual([
			'Add the city and country on the When & where step.'
		]);
	});

	it('does not ask an online conference for a place', () => {
		expect(
			publishBlockers({ ...DRAFT, locationMode: 'online', city: null, countryCode: null })
		).toEqual([]);
	});
});

describe('openApplicationsBlockers', () => {
	it('needs committees when applicants rank them', () => {
		expect(openApplicationsBlockers(DRAFT, 0, NOW)).toEqual([
			'Add committees before opening applications, or set committee preferences to none.'
		]);
		expect(openApplicationsBlockers(DRAFT, 4, NOW)).toEqual([]);
		expect(openApplicationsBlockers({ ...DRAFT, committeePreferenceCount: 0 }, 0, NOW)).toEqual([]);
	});

	it('refuses a deadline that has gone by', () => {
		expect(
			openApplicationsBlockers({ ...DRAFT, applicationsCloseAt: '2026-10-01T00:00:00Z' }, 4, NOW)
		).toEqual(['The application deadline has passed. Change it in Setup.']);
	});
});

describe('launchFeeSummary', () => {
	it('names the first fee and counts the others', () => {
		expect(launchFeeSummary(FACTS, 'EUR')).toBeNull();
		const oneFee = { feeCount: 1, firstFee: { name: 'Delegate fee', amountCents: 3500 } };
		expect(launchFeeSummary(oneFee, 'EUR')).toBe('Delegate fee · €35.00');
		expect(launchFeeSummary({ ...oneFee, feeCount: 3 }, 'EUR')).toBe(
			'Delegate fee · €35.00 and 2 more'
		);
	});
});

describe('launchRows', () => {
	it('marks legitimate unknowns ready or optional, never blocked', () => {
		const rows = launchRows(DRAFT, FACTS, NOW);

		expect(rows.map((row) => [row.label, row.detail, row.status])).toEqual([
			['Organisation', 'TU Delft MUN', 'ready'],
			['Basics', 'Name, description, branding and contact details', 'ready'],
			['Dates & location', '16 – 18 Apr 2027 · Delft, Netherlands', 'ready'],
			['Venue', 'To be announced', 'ready'],
			['Public page', 'Ready', 'ready'],
			['Committees', '12 available to import, not required to publish', 'optional'],
			['Applications', 'Configured to close 2 weeks before conference', 'ready'],
			['Fees', 'Not decided yet, optional for now', 'optional']
		]);
		expect(rows.every((row) => row.href === null)).toBe(true);
	});

	it('says what can come later in Basics and the public page', () => {
		const rows = launchRows({ ...DRAFT, description: null }, FACTS, NOW);

		expect(rowOf(rows, 'basics').detail).toBe('Description can be added later');
		expect(rowOf(rows, 'public_page')).toMatchObject({
			detail: 'Mostly ready',
			status: 'ready',
			href: '/create/tu-delft-mun-2027/basics'
		});
		expect(rowOf(launchRows({ ...DRAFT, contactEmail: null }, FACTS, NOW), 'basics').detail).toBe(
			'Contact details can be added later'
		);
	});

	it('blocks placeholder dates and a missing place, and links to When & where', () => {
		const placeholder = launchRows({ ...DRAFT, prefillSources: PLACEHOLDER_DATES }, FACTS, NOW);

		expect(rowOf(placeholder, 'dates')).toEqual({
			key: 'dates',
			label: 'Dates & location',
			detail: 'Dates needed',
			status: 'blocked',
			href: '/create/tu-delft-mun-2027/when'
		});
		expect(rowOf(placeholder, 'public_page').status).toBe('blocked');

		const noCity = launchRows({ ...DRAFT, city: null }, FACTS, NOW);
		expect(rowOf(noCity, 'dates').detail).toBe('City and country needed');
		expect(rowOf(noCity, 'public_page').detail).toBe('Needs a name and a place');

		const backwards = launchRows({ ...DRAFT, endDate: '2027-04-10' }, FACTS, NOW);
		expect(rowOf(backwards, 'dates').detail).toBe('The last day is before the first');
	});

	it('blocks a missing name and links to Basics', () => {
		const rows = launchRows({ ...DRAFT, name: '' }, FACTS, NOW);

		expect(rowOf(rows, 'basics')).toMatchObject({
			status: 'blocked',
			href: '/create/tu-delft-mun-2027/basics'
		});
	});

	it('names the venue, or says the conference is online', () => {
		const named = { ...DRAFT, venueStatus: 'known' as const, venueName: 'Aula' };
		expect(rowOf(launchRows(named, FACTS, NOW), 'venue').detail).toBe('Aula');
		const online = { ...DRAFT, locationMode: 'online' as const };
		expect(rowOf(launchRows(online, FACTS, NOW), 'venue').detail).toBe('Online');
	});

	it('counts committees, or says there is nothing to import', () => {
		expect(
			rowOf(launchRows(DRAFT, { ...FACTS, committeeCount: 3 }, NOW), 'committees')
		).toMatchObject({ detail: '3 committees', status: 'ready' });
		expect(
			rowOf(launchRows(DRAFT, { ...FACTS, committeeCount: 1 }, NOW), 'committees').detail
		).toBe('1 committee');
		expect(
			rowOf(launchRows(DRAFT, { ...FACTS, previousCommitteeCount: null }, NOW), 'committees')
		).toMatchObject({ detail: 'None yet, not required to publish', status: 'optional' });
	});

	it('asks for a review of a deadline in the past, and names a fixed one', () => {
		const past = { ...DRAFT, applicationsCloseAt: '2026-09-01T00:00:00Z' };
		expect(rowOf(launchRows(past, FACTS, NOW), 'applications')).toMatchObject({
			detail: 'The application deadline has passed',
			status: 'review'
		});

		const fixed = { ...DRAFT, applicationCloseRule: 'fixed' as const };
		expect(rowOf(launchRows(fixed, FACTS, NOW), 'applications').detail).toBe(
			'Configured to close on 2 April 2027'
		);
		expect(
			rowOf(launchRows({ ...fixed, applicationsCloseAt: null }, FACTS, NOW), 'applications').detail
		).toBe('Configured, with no closing date yet');
	});

	it('reads free, a counted fee, and paid without amounts', () => {
		const free = rowOf(launchRows({ ...DRAFT, feeStatus: 'free' }, FACTS, NOW), 'fees');
		expect(free).toMatchObject({ detail: 'Free', status: 'ready' });

		const withFee = {
			...FACTS,
			feeCount: 1,
			firstFee: { name: 'Delegate fee', amountCents: 3500 }
		};
		const paid = { ...DRAFT, feeStatus: 'paid' as const };
		expect(rowOf(launchRows(paid, withFee, NOW), 'fees')).toMatchObject({
			detail: '1 fee · €35.00',
			status: 'ready'
		});
		expect(rowOf(launchRows(paid, FACTS, NOW), 'fees')).toMatchObject({
			detail: 'Paid, amounts not added yet',
			status: 'optional'
		});
	});
});

describe('launchChoices', () => {
	it('offers both ways for manual opening, and no note', () => {
		const choices = launchChoices(DRAFT);

		expect(choices.mode).toBe('manual');
		expect(choices.options.map((option) => option.label)).toEqual([
			'Publish conference only',
			'Publish and open applications'
		]);
		expect(choices.note).toBeNull();
	});

	it('offers one way, with a note, when Setup already decided', () => {
		const onPublish = launchChoices({ ...DRAFT, applicationOpenMode: 'on_publish' });
		expect(onPublish.options.map((option) => option.value)).toEqual(['publish_and_open']);
		expect(onPublish.note).toBe(
			'Publishing will also open applications. Change this in Setup › Applications if that is not intended.'
		);

		const scheduled = launchChoices({
			...DRAFT,
			applicationOpenMode: 'scheduled',
			applicationsOpenAt: '2027-03-01T08:00:00Z'
		});
		expect(scheduled.options.map((option) => option.value)).toEqual(['publish']);
		expect(scheduled.note).toBe('Applications open on 1 March 2027 as scheduled.');
		expect(launchChoices({ ...DRAFT, applicationOpenMode: 'scheduled' }).note).toBe(
			'Applications open as scheduled.'
		);
	});
});

describe('effectiveLaunchChoice', () => {
	it('lets only a manual draft choose, and only publishes when unsure', () => {
		expect(effectiveLaunchChoice('manual', 'publish_and_open')).toBe('publish_and_open');
		expect(effectiveLaunchChoice('manual', 'publish')).toBe('publish');
		expect(effectiveLaunchChoice('manual', null)).toBe('publish');
		expect(effectiveLaunchChoice('on_publish', 'publish')).toBe('publish_and_open');
		expect(effectiveLaunchChoice('scheduled', 'publish_and_open')).toBe('publish');
	});
});

describe('optionalImprovements', () => {
	it('suggests a description, importing committees and fees, each with its place', () => {
		const improvements = optionalImprovements({ ...DRAFT, description: null }, FACTS, true);

		expect(improvements.map((improvement) => improvement.key)).toEqual([
			'description',
			'committees',
			'fees'
		]);
		expect(improvements.map((improvement) => [improvement.actionLabel, improvement.href])).toEqual([
			['Add description', '/create/tu-delft-mun-2027/basics'],
			['Import committees', '/create/tu-delft-mun-2027/setup'],
			['Set fees', '/create/tu-delft-mun-2027/setup?dialog=fee']
		]);
	});

	it('suggests adding committees without an edition to import from, and nothing once done', () => {
		const fresh = optionalImprovements(DRAFT, { ...FACTS, previousCommitteeCount: null }, true);
		expect(fresh.map((improvement) => improvement.actionLabel)).toEqual([
			'Add committees',
			'Set fees'
		]);
		expect(fresh[0].href).toBe('/create/tu-delft-mun-2027/setup?dialog=committee');

		expect(
			optionalImprovements({ ...DRAFT, feeStatus: 'free' }, { ...FACTS, committeeCount: 2 }, true)
		).toEqual([]);
	});

	it('leaves committees out for a reader who does not manage every committee', () => {
		// Adding and importing would only be refused them.
		const improvements = optionalImprovements({ ...DRAFT, description: null }, FACTS, false);

		expect(improvements.map((improvement) => improvement.key)).toEqual(['description', 'fees']);
	});
});

describe('whatApplicantsSee', () => {
	it('says "To be announced" for the unknowns', () => {
		expect(whatApplicantsSee(DRAFT, null)).toEqual([
			{ label: 'Venue', value: 'To be announced' },
			{ label: 'Applications', value: 'Opening soon' },
			{ label: 'Fees', value: 'To be announced' }
		]);
	});

	it('follows the opening mode and the fees', () => {
		const onPublish = whatApplicantsSee(
			{ ...DRAFT, applicationOpenMode: 'on_publish', feeStatus: 'free' },
			null
		);
		expect(onPublish.map((fact) => fact.value)).toEqual([
			'To be announced',
			'Open from the moment you publish',
			'Free'
		]);

		const scheduled = whatApplicantsSee(
			{
				...DRAFT,
				applicationOpenMode: 'scheduled',
				applicationsOpenAt: '2027-03-01T08:00:00Z',
				feeStatus: 'paid'
			},
			'Delegate fee · €35.00'
		);
		expect(scheduled.map((fact) => fact.value)).toEqual([
			'To be announced',
			'Open on 1 March 2027',
			'Delegate fee · €35.00'
		]);
	});
});

describe('applicationsNote', () => {
	it('says when applications open', () => {
		expect(applicationsNote(DRAFT)).toEqual({
			title: 'Applications opening soon',
			text: 'Applications open when you choose to open them.'
		});
		expect(applicationsNote({ ...DRAFT, applicationOpenMode: 'on_publish' })).toEqual({
			title: 'Applications open on publishing',
			text: 'Applications open the moment you publish.'
		});
		expect(
			applicationsNote({
				...DRAFT,
				applicationOpenMode: 'scheduled',
				applicationsOpenAt: '2027-03-01T08:00:00Z'
			})
		).toEqual({ title: 'Applications scheduled', text: 'Applications open on 1 March 2027.' });
	});
});
