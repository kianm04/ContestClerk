import { describe, expect, it } from 'vitest';
import {
	appliedProcedureMessage,
	copiedProcedureMessage,
	isProcedureName,
	readProcedureForm,
	toProcedureFormValues,
	validateProcedureForm,
	type CommitteeProcedure,
	type ProcedureFormValues
} from './committee-procedure';

/** The North American defaults, which are the columns' own defaults. */
const NORTH_AMERICAN: CommitteeProcedure = {
	format: 'standard',
	crisisAllowsResolutions: false,
	paperWords: 'sponsors_and_signatories',
	hasWorkingPapers: true,
	sponsorLimit: 5,
	supportMinimum: 20,
	supportUnit: 'percent',
	supportCountsSponsors: true,
	oneSponsorshipPerTopic: false,
	hasFriendlyAmendments: true,
	amendmentSupportMinimum: 10,
	amendmentSupportUnit: 'percent',
	preambleAmendable: false,
	hasSecondDegreeAmendments: false,
	checksFormat: true
};

/** Those defaults as the form holds them. */
const NORTH_AMERICAN_FORM: ProcedureFormValues = toProcedureFormValues(NORTH_AMERICAN);

describe('isProcedureName', () => {
	it('knows the two procedures and nothing else', () => {
		expect(isProcedureName('north_american')).toBe(true);
		expect(isProcedureName('thimun')).toBe(true);
		expect(isProcedureName('custom')).toBe(false);
		expect(isProcedureName('')).toBe(false);
	});
});

describe('toProcedureFormValues', () => {
	it('turns the numbers into text and no cap into an empty box', () => {
		expect(toProcedureFormValues({ ...NORTH_AMERICAN, sponsorLimit: null })).toMatchObject({
			sponsorLimit: '',
			supportMinimum: '20',
			amendmentSupportMinimum: '10',
			hasWorkingPapers: true
		});
	});
});

describe('readProcedureForm', () => {
	it('reads the text fields trimmed, and a tick box as ticked only when it was sent', () => {
		const formData = new FormData();
		formData.set('format', 'crisis');
		formData.set('crisisAllowsResolutions', 'on');
		formData.set('paperWords', 'submitters');
		formData.set('sponsorLimit', ' 8 ');
		formData.set('supportMinimum', '3');
		formData.set('supportUnit', 'seats');
		formData.set('amendmentSupportMinimum', '0');
		formData.set('amendmentSupportUnit', 'seats');
		formData.set('hasSecondDegreeAmendments', 'on');

		expect(readProcedureForm(formData)).toEqual({
			format: 'crisis',
			crisisAllowsResolutions: true,
			paperWords: 'submitters',
			hasWorkingPapers: false,
			sponsorLimit: '8',
			supportMinimum: '3',
			supportUnit: 'seats',
			supportCountsSponsors: false,
			oneSponsorshipPerTopic: false,
			hasFriendlyAmendments: false,
			amendmentSupportMinimum: '0',
			amendmentSupportUnit: 'seats',
			preambleAmendable: false,
			hasSecondDegreeAmendments: true,
			checksFormat: false
		});
	});

	it('reads an empty form as empty text and every box unticked', () => {
		expect(readProcedureForm(new FormData())).toMatchObject({
			format: '',
			sponsorLimit: '',
			checksFormat: false
		});
	});
});

describe('validateProcedureForm', () => {
	it('accepts the defaults unchanged', () => {
		expect(validateProcedureForm(NORTH_AMERICAN_FORM)).toEqual({
			procedure: NORTH_AMERICAN,
			errors: {}
		});
	});

	it('reads an empty sponsor box as no cap', () => {
		const result = validateProcedureForm({ ...NORTH_AMERICAN_FORM, sponsorLimit: '' });

		expect(result.procedure?.sponsorLimit).toBeNull();
	});

	it('refuses a sponsor cap of 0, over a thousand, or not a whole number', () => {
		for (const sponsorLimit of ['0', '1001', '2.5', 'five']) {
			const result = validateProcedureForm({ ...NORTH_AMERICAN_FORM, sponsorLimit });

			expect(result.procedure).toBeNull();
			expect(result.errors.sponsorLimit).toBe(
				'Enter a whole number from 1 to 1000, or leave it empty for no cap.'
			);
		}
	});

	it('allows up to a thousand seats but only a hundred percent', () => {
		const seats = validateProcedureForm({
			...NORTH_AMERICAN_FORM,
			supportMinimum: '150',
			supportUnit: 'seats'
		});
		const percent = validateProcedureForm({
			...NORTH_AMERICAN_FORM,
			supportMinimum: '150',
			supportUnit: 'percent'
		});

		expect(seats.procedure?.supportMinimum).toBe(150);
		expect(percent.procedure).toBeNull();
		expect(percent.errors).toEqual({ supportMinimum: 'Enter a whole percentage from 0 to 100.' });
	});

	it('refuses a support minimum that is empty or over a thousand seats', () => {
		const empty = validateProcedureForm({ ...NORTH_AMERICAN_FORM, supportMinimum: '' });
		const tooMany = validateProcedureForm({
			...NORTH_AMERICAN_FORM,
			amendmentSupportMinimum: '1001',
			amendmentSupportUnit: 'seats'
		});

		expect(empty.errors.supportMinimum).toBe('Enter a whole percentage from 0 to 100.');
		expect(tooMany.errors.amendmentSupportMinimum).toBe(
			'Enter a whole number of seats from 0 to 1000.'
		);
	});

	it('accepts none, 0, as the support an amendment needs', () => {
		const result = validateProcedureForm({
			...NORTH_AMERICAN_FORM,
			amendmentSupportMinimum: '0',
			amendmentSupportUnit: 'seats'
		});

		expect(result.procedure).toMatchObject({
			amendmentSupportMinimum: 0,
			amendmentSupportUnit: 'seats'
		});
	});

	it('refuses a format, words or unit nobody offered', () => {
		const result = validateProcedureForm({
			...NORTH_AMERICAN_FORM,
			format: 'hybrid',
			paperWords: 'authors',
			supportUnit: 'delegates'
		});

		expect(result.procedure).toBeNull();
		expect(result.errors).toEqual({
			format: 'Choose standard or crisis.',
			paperWords: 'Choose the words the committee uses.',
			supportUnit: 'Choose seats or a share of the committee.'
		});
	});

	it('keeps resolutions in a crisis committee only for a crisis committee', () => {
		const crisis = validateProcedureForm({
			...NORTH_AMERICAN_FORM,
			format: 'crisis',
			crisisAllowsResolutions: true
		});
		const standard = validateProcedureForm({
			...NORTH_AMERICAN_FORM,
			format: 'standard',
			crisisAllowsResolutions: true
		});

		expect(crisis.procedure?.crisisAllowsResolutions).toBe(true);
		expect(standard.procedure?.crisisAllowsResolutions).toBe(false);
	});
});

describe('copiedProcedureMessage', () => {
	it('counts the committees, in the singular for one', () => {
		expect(copiedProcedureMessage(1)).toBe('Settings copied to 1 committee.');
		expect(copiedProcedureMessage(3)).toBe('Settings copied to 3 committees.');
	});
});

describe('appliedProcedureMessage', () => {
	it('names the procedure in its own words', () => {
		expect(appliedProcedureMessage('thimun')).toBe('THIMUN settings applied.');
		expect(appliedProcedureMessage('north_american')).toBe('North American settings applied.');
	});
});
