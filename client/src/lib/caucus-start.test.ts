import { describe, expect, it } from 'vitest';
import {
	CAUCUS_START_MESSAGES,
	emptyModStart,
	emptyUnmodStart,
	readModStartForm,
	readUnmodStartForm
} from './caucus-start';

const PRESENT = ['seat-br', 'seat-ke'];

/** A submitted form holding `fields`. */
function formOf(fields: Record<string, string>): FormData {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) formData.set(name, value);

	return formData;
}

describe('readModStartForm', () => {
	it('takes 10:00 and the committee’s speaking time when the times are left empty', () => {
		const reading = readModStartForm(formOf({ topic: 'Opening corridors' }), PRESENT, 90);

		expect(reading.errors).toEqual({});
		expect(reading.input).toEqual({
			kind: 'moderated_caucus',
			proposedBySeatId: null,
			topic: 'Opening corridors',
			totalSeconds: 600,
			speakingSeconds: 90
		});
	});

	it('reads times the MUN way and the seat that raised it', () => {
		const fields = {
			topic: 'Corridors',
			totalTime: '15',
			speakingTime: '1:30',
			proposedBySeatId: 'seat-br'
		};
		const reading = readModStartForm(formOf(fields), PRESENT, 60);

		expect(reading.input).toMatchObject({
			proposedBySeatId: 'seat-br',
			totalSeconds: 900,
			speakingSeconds: 90
		});
	});

	it('treats `chair` as the chair', () => {
		const reading = readModStartForm(
			formOf({ topic: 'A', proposedBySeatId: 'chair' }),
			PRESENT,
			60
		);

		expect(reading.input?.proposedBySeatId).toBeNull();
	});

	it('refuses with the composer’s sentences and keeps what was typed', () => {
		const fields = {
			topic: '',
			totalTime: '90',
			speakingTime: '10s',
			proposedBySeatId: 'seat-absent'
		};
		const reading = readModStartForm(formOf(fields), PRESENT, 60);

		expect(reading.input).toBeNull();
		expect(reading.values).toEqual(fields);
		expect(reading.errors).toEqual({
			topic: 'A moderated caucus needs a topic.',
			totalTime: 'Total time must be between 1 and 60 minutes.',
			speakingTime: 'Speaking time must be between 15 and 300 seconds.',
			proposedBySeatId: 'Pick the seat that raised the motion.'
		});
	});

	it('refuses a speaking time longer than the total, and a topic too long to keep', () => {
		const fields = { topic: 'x'.repeat(201), totalTime: '1', speakingTime: '1:30' };
		const reading = readModStartForm(formOf(fields), PRESENT, 60);

		expect(reading.errors.speakingTime).toBe(CAUCUS_START_MESSAGES.speakingLongerThanTotal);
		expect(reading.errors.topic).toBe('Keep the topic under 200 characters.');
	});

	it('starts empty, so the placeholders show the defaults', () => {
		expect(emptyModStart()).toEqual({
			topic: '',
			totalTime: '',
			speakingTime: '',
			proposedBySeatId: ''
		});
	});
});

describe('readUnmodStartForm', () => {
	it('reads the chosen preset, with no topic and the chair', () => {
		const reading = readUnmodStartForm(formOf({ length: '15:00' }), PRESENT);

		expect(reading.input).toEqual({
			kind: 'unmoderated_caucus',
			proposedBySeatId: null,
			topic: null,
			totalSeconds: 900,
			speakingSeconds: null
		});
	});

	it('lets a typed length win over the preset: "12" and "12:30"', () => {
		const twelve = readUnmodStartForm(formOf({ length: '10:00', lengthTyped: '12' }), PRESENT);
		const twelveAndAHalf = readUnmodStartForm(formOf({ lengthTyped: '12:30' }), PRESENT);

		expect(twelve.input?.totalSeconds).toBe(720);
		expect(twelveAndAHalf.input?.totalSeconds).toBe(750);
	});

	it('keeps the topic and the seat that raised it', () => {
		const fields = { length: '5:00', topic: 'Drafting', proposedBySeatId: 'seat-ke' };
		const reading = readUnmodStartForm(formOf(fields), PRESENT);

		expect(reading.input).toMatchObject({ topic: 'Drafting', proposedBySeatId: 'seat-ke' });
	});

	it('refuses a length outside 1 to 60 minutes, or one it cannot read, keeping what was typed', () => {
		for (const typed of ['61', '0', 'soon', '0:30']) {
			const reading = readUnmodStartForm(formOf({ length: '', lengthTyped: typed }), PRESENT);

			expect(reading.input).toBeNull();
			expect(reading.errors.length).toBe('Total time must be between 1 and 60 minutes.');
			expect(reading.values.lengthTyped).toBe(typed);
		}
	});

	it('refuses a seat that is not present', () => {
		const reading = readUnmodStartForm(
			formOf({ length: '10:00', proposedBySeatId: 'seat-gone' }),
			PRESENT
		);

		expect(reading.errors.proposedBySeatId).toBe('Pick the seat that raised the motion.');
	});

	it('starts with "10 min" chosen', () => {
		expect(emptyUnmodStart().length).toBe('10:00');
	});
});
