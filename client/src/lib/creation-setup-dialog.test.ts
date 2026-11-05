import { describe, expect, it } from 'vitest';
import type { ApplicationQuestion } from '$lib/application-questions';
import {
	dialogAction,
	readCommitteeDialogForm,
	readFeeDialogForm,
	readQuestionDialogForm,
	readSetupDialog,
	toCommitteeDialogValues,
	toFeeDialogValues,
	type SetupCommittee,
	type SetupDialogSources,
	type SetupFee
} from './creation-setup-dialog';

const COMMITTEE: SetupCommittee = {
	id: 'committee-1',
	name: 'United Nations Security Council',
	abbreviation: 'UNSC',
	plannedSeatCount: 30,
	room: null,
	level: 'advanced',
	topics: ['Haiti'],
	description: null,
	defaultSpeakingTimeSeconds: 60,
	position: 0
};

const QUESTION: ApplicationQuestion = {
	id: 'question-1',
	label: 'Why MUN?',
	helpText: null,
	type: 'short_text',
	options: [],
	isRequired: false,
	position: 0
};

const FEE: SetupFee = {
	id: 'fee-1',
	name: 'Delegate fee',
	amountCents: 3500,
	appliesTo: 'individual',
	description: null,
	position: 0
};

const SOURCES: SetupDialogSources = {
	committees: [COMMITTEE],
	questions: [QUESTION],
	fees: [FEE],
	draft: {
		applicationOpenMode: 'manual',
		applicationsOpenAt: null,
		applicationCloseRule: 'relative',
		applicationCloseOffsetDays: -14,
		applicationsCloseAt: null,
		acceptsIndividualApplications: true,
		acceptsDelegations: true,
		committeePreferenceCount: 3,
		askMotivation: false,
		positionPaperRequired: false,
		timezone: 'Europe/Amsterdam',
		currency: 'EUR',
		collectsPaymentsManually: false
	}
};

function dialogFor(query: string) {
	return readSetupDialog(new URLSearchParams(query), SOURCES);
}

describe('dialogAction', () => {
	it('repeats the dialog after the action', () => {
		expect(dialogAction('addCommittee', 'committee')).toBe('?/addCommittee&dialog=committee');
		expect(dialogAction('updateFee', 'fee', 'fee-1')).toBe('?/updateFee&dialog=fee&id=fee-1');
	});
});

describe('readSetupDialog', () => {
	it('opens nothing without a dialog, or for a row that is not the draft’s', () => {
		expect(dialogFor('')).toBeNull();
		expect(dialogFor('dialog=committee&id=elsewhere')).toBeNull();
		expect(dialogFor('dialog=delete-fee&id=elsewhere')).toBeNull();
		expect(dialogFor('dialog=nonsense')).toBeNull();
	});

	it('opens an empty form to add, and a filled one to edit', () => {
		expect(dialogFor('dialog=committee')).toMatchObject({
			kind: 'committee',
			values: { name: '' }
		});
		expect(dialogFor('dialog=committee&id=committee-1')).toMatchObject({
			values: { committeeId: 'committee-1', plannedSeatCount: '30' }
		});
		expect(dialogFor('dialog=question&id=question-1')).toMatchObject({
			values: { label: 'Why MUN?' }
		});
		expect(dialogFor('dialog=fee&id=fee-1')).toMatchObject({ values: { amount: '35.00' } });
		expect(dialogFor('dialog=applications')).toMatchObject({ values: { closeChoice: '-14' } });
	});

	it('words each confirmation', () => {
		expect(dialogFor('dialog=delete-committee&id=committee-1')).toMatchObject({
			kind: 'delete',
			content: {
				sentence: 'Are you sure you want to delete the United Nations Security Council (UNSC)?',
				facts: [
					{ label: 'Committee name', value: 'United Nations Security Council' },
					{ label: 'Seats', value: '30' },
					{ label: 'Room', value: 'Unassigned' }
				]
			}
		});
		expect(dialogFor('dialog=delete-question&id=question-1')).toMatchObject({
			content: { title: 'Delete question?', action: 'deleteQuestion' }
		});
		expect(dialogFor('dialog=delete-fee&id=fee-1')).toMatchObject({
			content: { facts: expect.arrayContaining([{ label: 'Amount', value: '€35.00' }]) }
		});
	});
});

describe('toCommitteeDialogValues and readCommitteeDialogForm', () => {
	it('starts a new committee with no topics and no seats', () => {
		expect(toCommitteeDialogValues(null)).toMatchObject({ topics: [], plannedSeatCount: '' });
	});

	it('reads the seats and never a link', () => {
		const formData = new FormData();
		formData.set('name', 'WHO');
		formData.set('slug', 'sneaky');
		formData.set('plannedSeatCount', ' 25 ');

		expect(readCommitteeDialogForm(formData)).toMatchObject({
			name: 'WHO',
			slug: '',
			plannedSeatCount: '25'
		});
	});
});

describe('readQuestionDialogForm', () => {
	it('reads Required from the radio buttons', () => {
		const formData = new FormData();
		formData.set('required', 'optional');
		expect(readQuestionDialogForm(formData).isRequired).toBe(false);
		formData.set('required', 'required');
		expect(readQuestionDialogForm(formData).isRequired).toBe(true);
	});
});

describe('toFeeDialogValues and readFeeDialogForm', () => {
	it('starts a new fee as a delegate fee, collected the way the conference collects', () => {
		expect(toFeeDialogValues(null, true)).toMatchObject({
			kind: 'delegate',
			name: 'Delegate fee',
			collection: 'manual'
		});
	});

	it('reads the kind, the description and the collection', () => {
		const formData = new FormData();
		formData.set('kind', 'late');
		formData.set('description', ' After 1 March. ');
		formData.set('collection', 'manual');

		expect(readFeeDialogForm(formData)).toMatchObject({
			kind: 'late',
			description: 'After 1 March.',
			collection: 'manual'
		});
	});
});
