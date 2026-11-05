import { describe, expect, it } from 'vitest';
import {
	creationPreview,
	datesLine,
	feesLine,
	hasChosenDates,
	isUserValue,
	locationLine,
	sourceChipLabel,
	timesLine,
	venueLine,
	type DraftFacts
} from './creation-draft';

/** A draft in Delft with chosen dates, to change one thing at a time. */
function draftFacts(overrides: Partial<DraftFacts> = {}): DraftFacts {
	return {
		name: 'Delft MUN 2027',
		tagline: null,
		description: null,
		locationMode: 'in_person',
		city: 'Delft',
		countryCode: 'NL',
		countryName: 'Netherlands',
		venueStatus: 'tba',
		venueName: null,
		startDate: '2027-04-16',
		endDate: '2027-04-18',
		timezone: 'Europe/Amsterdam',
		conferenceTimeStatus: 'tba',
		startTime: null,
		endTime: null,
		level: 'university',
		bannerPath: null,
		feeStatus: 'undecided',
		prefillSources: { start_date: 'previous_conference' },
		...overrides
	};
}

describe('hasChosenDates', () => {
	it('is false while the dates are the placeholder a year ahead', () => {
		expect(hasChosenDates({ prefillSources: { start_date: 'system_default' } })).toBe(false);
	});

	it('is true for suggested and typed dates', () => {
		expect(hasChosenDates({ prefillSources: { start_date: 'previous_conference' } })).toBe(true);
		expect(hasChosenDates({ prefillSources: { start_date: 'user' } })).toBe(true);
	});
});

describe('datesLine', () => {
	it('writes the range', () => {
		expect(datesLine(draftFacts())).toBe('16 – 18 Apr 2027');
	});

	it('never shows a placeholder as a date', () => {
		expect(datesLine(draftFacts({ prefillSources: { start_date: 'system_default' } }))).toBe(
			'Dates to be announced'
		);
	});
});

describe('locationLine', () => {
	it('names the city and country', () => {
		expect(locationLine(draftFacts())).toBe('Delft, Netherlands');
	});

	it('says online and hybrid', () => {
		expect(locationLine(draftFacts({ locationMode: 'online' }))).toBe('Online');
		expect(locationLine(draftFacts({ locationMode: 'hybrid' }))).toBe(
			'Hybrid · Delft, Netherlands'
		);
	});

	it('admits an unknown place', () => {
		expect(locationLine(draftFacts({ city: null, countryName: null }))).toBe(
			'Location to be announced'
		);
	});
});

describe('venueLine', () => {
	it('names a known venue', () => {
		expect(venueLine(draftFacts({ venueStatus: 'known', venueName: 'Aula' }))).toBe('Aula');
	});

	it('says to be announced otherwise, and online for an online conference', () => {
		expect(venueLine(draftFacts())).toBe('Venue to be announced');
		expect(venueLine(draftFacts({ locationMode: 'online' }))).toBe('Online');
	});
});

describe('timesLine', () => {
	it('writes known times without seconds', () => {
		expect(
			timesLine(
				draftFacts({ conferenceTimeStatus: 'known', startTime: '10:00:00', endTime: '17:00' })
			)
		).toBe('10:00 – 17:00');
	});

	it('says the times are not decided', () => {
		expect(timesLine(draftFacts())).toBe('Times not decided');
	});
});

describe('feesLine', () => {
	it('says free, the summary, or to be announced', () => {
		expect(feesLine({ feeStatus: 'free' }, null)).toBe('Free');
		expect(feesLine({ feeStatus: 'paid' }, '€35 delegate fee')).toBe('€35 delegate fee');
		expect(feesLine({ feeStatus: 'paid' }, null)).toBe('Fees to be announced');
		expect(feesLine({ feeStatus: 'undecided' }, '€35 delegate fee')).toBe('Fees to be announced');
	});
});

describe('sourceChipLabel', () => {
	it('names a generated name', () => {
		expect(sourceChipLabel('name', 'previous_conference')).toBe('Generated name');
		expect(sourceChipLabel('name', 'organization')).toBe('Generated name');
	});

	it('names suggested dates and inherited values', () => {
		expect(sourceChipLabel('start_date', 'previous_conference')).toBe('Suggested dates');
		expect(sourceChipLabel('city', 'organization')).toBe('From organisation');
		expect(sourceChipLabel('tagline', 'previous_conference')).toBe('Based on last conference');
	});

	it('says nothing about typed values and defaults', () => {
		expect(sourceChipLabel('name', 'user')).toBeNull();
		expect(sourceChipLabel('timezone', 'system_default')).toBeNull();
		expect(sourceChipLabel('city', undefined)).toBeNull();
	});
});

describe('creationPreview', () => {
	it('lists dates, place, venue, audience and timezone in order', () => {
		const preview = creationPreview(
			draftFacts({ timezone: 'America/New_York' }),
			'Delft MUN Foundation',
			null
		);

		expect(preview.name).toBe('Delft MUN 2027');
		expect(preview.organizedBy).toBe('Delft MUN Foundation');
		expect(preview.facts).toEqual([
			{ kind: 'dates', text: '16 – 18 Apr 2027' },
			{ kind: 'place', text: 'Delft, Netherlands' },
			{ kind: 'venue', text: 'Venue to be announced' },
			{ kind: 'level', text: 'University delegates' },
			{ kind: 'timezone', text: 'America/New York' }
		]);
	});

	it('leaves the venue out for an online conference and adds decided fees', () => {
		const preview = creationPreview(
			draftFacts({ locationMode: 'online', feeStatus: 'free' }),
			'Org',
			null
		);

		expect(preview.facts).toEqual([
			{ kind: 'dates', text: '16 – 18 Apr 2027' },
			{ kind: 'place', text: 'Online' },
			{ kind: 'level', text: 'University delegates' },
			{ kind: 'timezone', text: 'Europe/Amsterdam' },
			{ kind: 'fees', text: 'Free' }
		]);
	});

	it('words the audience for every level', () => {
		const levelText = (level: 'high_school' | 'mixed') =>
			creationPreview(draftFacts({ level }), 'Org', null).facts.find(
				(fact) => fact.kind === 'level'
			)?.text;

		expect(levelText('high_school')).toBe('High school delegates');
		expect(levelText('mixed')).toBe('High school and university');
	});

	it('names a conference with no name yet', () => {
		expect(creationPreview(draftFacts({ name: '' }), 'Org', null).name).toBe('Your conference');
	});
});

describe('isUserValue', () => {
	it('is true only for typed values', () => {
		expect(isUserValue({ name: 'user' }, 'name')).toBe(true);
		expect(isUserValue({ name: 'organization' }, 'name')).toBe(false);
		expect(isUserValue({}, 'name')).toBe(false);
	});
});
