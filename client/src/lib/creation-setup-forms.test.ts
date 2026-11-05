import { describe, expect, it } from 'vitest';
import {
	feeKindOf,
	plannedSeatsError,
	readApplicationsForm,
	toApplicationSettings,
	toApplicationsFormValues,
	toPlannedSeatCount,
	uniqueSlug,
	validateApplicationsForm,
	type ApplicationsFormValues
} from './creation-setup-forms';

describe('plannedSeatsError and toPlannedSeatCount', () => {
	it('takes an empty field as "Not decided"', () => {
		expect(plannedSeatsError('')).toBeNull();
		expect(toPlannedSeatCount('')).toBeNull();
	});

	it('takes a whole number of seats', () => {
		expect(plannedSeatsError('25')).toBeNull();
		expect(toPlannedSeatCount('25')).toBe(25);
	});

	it('refuses nothing sensible', () => {
		expect(plannedSeatsError('0')).toMatch(/whole number/);
		expect(plannedSeatsError('2.5')).toMatch(/whole number/);
		expect(plannedSeatsError('lots')).toMatch(/whole number/);
	});
});

describe('uniqueSlug', () => {
	it('adds a number until the link is free', () => {
		expect(uniqueSlug('who', [])).toBe('who');
		expect(uniqueSlug('who', ['who', 'who-2'])).toBe('who-3');
		expect(uniqueSlug('', [])).toBe('committee');
	});
});

describe('feeKindOf', () => {
	it('recognises the kinds by name, and otherwise by who pays', () => {
		expect(feeKindOf({ name: 'Late fee', appliesTo: 'individual' })).toBe('late');
		expect(feeKindOf({ name: 'School fee', appliesTo: 'delegation_member' })).toBe('delegation');
		expect(feeKindOf({ name: 'Social', appliesTo: 'individual' })).toBe('other');
	});
});

const DRAFT = {
	applicationOpenMode: 'scheduled' as const,
	applicationsOpenAt: '2027-03-01T08:00:00Z',
	applicationCloseRule: 'relative' as const,
	applicationCloseOffsetDays: -14,
	applicationsCloseAt: '2027-04-02T21:59:00Z',
	acceptsIndividualApplications: true,
	acceptsDelegations: false,
	committeePreferenceCount: 2,
	askMotivation: true,
	positionPaperRequired: false,
	timezone: 'Europe/Amsterdam',
	startDate: '2027-04-16'
};

function formValues(changes: Partial<ApplicationsFormValues> = {}): ApplicationsFormValues {
	return { ...toApplicationsFormValues(DRAFT), ...changes };
}

describe('toApplicationsFormValues', () => {
	it('shows the saved moments on the conference clock', () => {
		expect(toApplicationsFormValues(DRAFT)).toMatchObject({
			openMode: 'scheduled',
			opensAt: '2027-03-01T09:00',
			closeChoice: '-14',
			closesOn: '2027-04-02',
			committeePreferenceCount: '2'
		});
	});
});

describe('readApplicationsForm', () => {
	it('reads a switch that is off as no', () => {
		const formData = new FormData();
		formData.set('openMode', 'on_publish');
		formData.set('closeChoice', '-7');
		formData.set('acceptsDelegations', 'on');

		expect(readApplicationsForm(formData)).toMatchObject({
			openMode: 'on_publish',
			closeChoice: '-7',
			acceptsIndividualApplications: false,
			acceptsDelegations: true,
			committeePreferenceCount: '0',
			askMotivation: false
		});
	});
});

describe('validateApplicationsForm', () => {
	it('accepts the saved settings', () => {
		expect(validateApplicationsForm(formValues(), '2027-04-16')).toEqual({});
	});

	it('asks for the missing day and refuses one after the start', () => {
		expect(
			validateApplicationsForm(
				formValues({ opensAt: '', closeChoice: 'fixed', closesOn: '' }),
				'2027-04-16'
			)
		).toEqual({
			opensAt: 'Please choose when applications open.',
			closesOn: 'Please choose the day applications close.'
		});
		expect(
			validateApplicationsForm(
				formValues({ closeChoice: 'fixed', closesOn: '2027-04-20' }),
				'2027-04-16'
			).closesOn
		).toBe('Applications have to close before the conference starts.');
	});
});

describe('toApplicationSettings', () => {
	it('works a relative deadline out from the first day', () => {
		const settings = toApplicationSettings(formValues({ closeChoice: '-7' }), DRAFT);

		expect(settings).toMatchObject({
			applicationsOpenAt: '2027-03-01T08:00:00.000Z',
			applicationCloseRule: 'relative',
			applicationCloseOffsetDays: -7,
			applicationsCloseAt: '2027-04-09T21:59:00.000Z',
			committeePreferenceCount: 2
		});
	});

	it('closes a fixed deadline at the end of its day and keeps the offset', () => {
		const settings = toApplicationSettings(
			formValues({ openMode: 'manual', closeChoice: 'fixed', closesOn: '2027-03-31' }),
			DRAFT
		);

		expect(settings).toMatchObject({
			applicationsOpenAt: null,
			applicationCloseRule: 'fixed',
			applicationCloseOffsetDays: -14,
			applicationsCloseAt: '2027-03-31T21:59:00.000Z'
		});
	});
});
