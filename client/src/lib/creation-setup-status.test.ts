import { describe, expect, it } from 'vitest';
import {
	applicationsStatus,
	applicationsSummary,
	bannerFact,
	closingMoment,
	committeesStatus,
	descriptionFact,
	feePhrase,
	feesStatus,
	formatLongDay,
	pastDeadlineNote,
	type ApplicationFacts
} from './creation-setup-status';

/** A draft for Friday 16 April 2027 in Delft that closes applications two weeks before. */
function applicationFacts(changes: Partial<ApplicationFacts> = {}): ApplicationFacts {
	return {
		startDate: '2027-04-16',
		timezone: 'Europe/Amsterdam',
		prefillSources: { start_date: 'previous_conference' },
		applicationOpenMode: 'manual',
		applicationsOpenAt: null,
		applicationCloseRule: 'relative',
		applicationCloseOffsetDays: -14,
		applicationsCloseAt: null,
		acceptsIndividualApplications: true,
		acceptsDelegations: true,
		committeePreferenceCount: 3,
		askMotivation: true,
		...changes
	};
}

const MARCH_2027 = new Date('2027-03-01T12:00:00Z');

describe('formatLongDay', () => {
	it('names the day in the conference timezone', () => {
		// 23:30 UTC on 1 April is already 2 April in Amsterdam.
		expect(formatLongDay('2027-04-01T23:30:00Z', 'Europe/Amsterdam')).toBe('2 April 2027');
	});
});

describe('committeesStatus', () => {
	it('is configured once there is a committee', () => {
		expect(committeesStatus(2, null)).toBe('configured');
	});

	it('is not yet imported while last year has committees to import', () => {
		expect(committeesStatus(0, { committeeCount: 12 })).toBe('not_imported');
	});

	it('is optional without anything to import', () => {
		expect(committeesStatus(0, null)).toBe('optional');
		expect(committeesStatus(0, { committeeCount: 0 })).toBe('optional');
	});
});

describe('closingMoment', () => {
	it('counts a relative deadline back from the first day', () => {
		expect(closingMoment(applicationFacts())).toBe('2027-04-02T21:59:00.000Z');
	});

	it('has no relative deadline before the dates are chosen', () => {
		const facts = applicationFacts({ prefillSources: { start_date: 'system_default' } });

		expect(closingMoment(facts)).toBeNull();
	});

	it('uses the saved moment for a fixed deadline', () => {
		const facts = applicationFacts({
			applicationCloseRule: 'fixed',
			applicationsCloseAt: '2027-04-01T10:00:00Z'
		});

		expect(closingMoment(facts)).toBe('2027-04-01T10:00:00Z');
	});
});

describe('applicationsStatus', () => {
	it('is configured while the deadline lies ahead', () => {
		expect(applicationsStatus(applicationFacts(), MARCH_2027)).toBe('configured');
	});

	it('asks for a review once a relative deadline has gone by', () => {
		expect(applicationsStatus(applicationFacts(), new Date('2027-04-10T00:00:00Z'))).toBe('review');
	});

	it('asks for a review when a fixed deadline is missing or after the start', () => {
		const missing = applicationFacts({ applicationCloseRule: 'fixed' });
		const late = applicationFacts({
			applicationCloseRule: 'fixed',
			applicationsCloseAt: '2027-04-17T10:00:00Z'
		});

		expect(applicationsStatus(missing, MARCH_2027)).toBe('review');
		expect(applicationsStatus(late, MARCH_2027)).toBe('review');
	});
});

describe('feesStatus', () => {
	it('says each fee decision in a word', () => {
		expect(feesStatus({ feeStatus: 'free' }, 0)).toBe('ready');
		expect(feesStatus({ feeStatus: 'paid' }, 1)).toBe('configured');
		expect(feesStatus({ feeStatus: 'paid' }, 0)).toBe('review');
		expect(feesStatus({ feeStatus: 'undecided' }, 3)).toBe('not_decided');
	});
});

describe('applicationsSummary', () => {
	it('says the six facts of a typical setup', () => {
		expect(applicationsSummary(applicationFacts(), 1, 4)).toEqual({
			applicantType: 'Individual delegates + Delegations',
			preferences: '3 preferences',
			opens: 'Opens when you choose',
			closes: '2 weeks before conference · 2 April 2027',
			motivation: 'On',
			customQuestions: '1 question'
		});
	});

	it('says what is missing in plain words', () => {
		const facts = applicationFacts({
			acceptsIndividualApplications: false,
			acceptsDelegations: false,
			applicationOpenMode: 'on_publish',
			askMotivation: false,
			prefillSources: { start_date: 'system_default' }
		});

		expect(applicationsSummary(facts, 0, 0)).toMatchObject({
			applicantType: 'Nobody yet',
			preferences: 'Available once committees exist',
			opens: 'Opens when published',
			closes: '2 weeks before conference',
			motivation: 'Off',
			customQuestions: 'None'
		});
	});

	it('names a scheduled opening and a fixed close', () => {
		const facts = applicationFacts({
			acceptsDelegations: false,
			committeePreferenceCount: 1,
			applicationOpenMode: 'scheduled',
			applicationsOpenAt: '2027-03-01T09:00:00Z',
			applicationCloseRule: 'fixed',
			applicationsCloseAt: '2027-04-02T21:59:00Z'
		});

		expect(applicationsSummary(facts, 3, 2)).toMatchObject({
			applicantType: 'Individual delegates',
			preferences: '1 preference',
			opens: 'Opens on 1 March 2027',
			closes: 'On 2 April 2027',
			customQuestions: '3 questions'
		});
	});
});

describe('pastDeadlineNote', () => {
	it('says nothing while the deadline lies ahead', () => {
		expect(pastDeadlineNote(applicationFacts(), MARCH_2027)).toBeNull();
	});

	it('suggests a shorter deadline that still works', () => {
		expect(pastDeadlineNote(applicationFacts(), new Date('2027-04-05T00:00:00Z'))).toBe(
			'The deadline has passed. Try 1 week before the conference.'
		);
	});
});

describe('feePhrase', () => {
	it('writes a whole amount without cents and the name in lower case', () => {
		expect(feePhrase({ name: 'Delegate fee', amountCents: 3500 }, 'EUR')).toBe('€35 delegate fee');
		expect(feePhrase({ name: 'MUN fee', amountCents: 1250 }, 'EUR')).toBe('€12.50 MUN fee');
	});
});

describe('descriptionFact', () => {
	it('rounds the words to the nearest ten', () => {
		expect(descriptionFact(Array(118).fill('word').join(' '))).toBe('Added (about 120 words)');
		expect(descriptionFact('  ')).toBe('Not added');
		expect(descriptionFact(null)).toBe('Not added');
	});
});

describe('bannerFact', () => {
	it('names the picture the public page uses', () => {
		expect(bannerFact({ bannerPath: 'a.jpg', logoPath: null })).toBe('Conference banner');
		expect(bannerFact({ bannerPath: null, logoPath: 'b.png' })).toBe('Using organisation branding');
		expect(bannerFact({ bannerPath: null, logoPath: null })).toBe('No banner yet');
	});
});
