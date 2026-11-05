import { describe, expect, it } from 'vitest';
import {
	SINGLE_SPEAKER_MESSAGES,
	SINGLE_SPEAKER_PURPOSES,
	emptySingleSpeakerForm,
	purposeWords,
	readSingleSpeakerForm,
	singleSpeakerTimeText,
	singleSpeakerTitle
} from './single-speaker';

const PRESENT = ['seat-fr', 'seat-ke'];

/** A submitted form holding `fields`. */
function formOf(fields: Record<string, string>): FormData {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) formData.set(name, value);

	return formData;
}

describe('the purposes', () => {
	it('offers the three fixed purposes, in order', () => {
		expect(SINGLE_SPEAKER_PURPOSES).toEqual([
			'Right of reply',
			'Presentation',
			'Explanation of vote'
		]);
	});

	it('reads a fixed purpose as it is, "Other…" as its words, and nothing as none', () => {
		expect(purposeWords('Presentation', '')).toBe('Presentation');
		expect(purposeWords('other', 'Point of personal privilege')).toBe(
			'Point of personal privilege'
		);
		expect(purposeWords('', 'ignored')).toBeNull();
		expect(purposeWords('Something else', '')).toBeNull();
	});
});

describe('readSingleSpeakerForm', () => {
	it('gives a present seat the floor at the chosen time, with its purpose', () => {
		const fields = { seatId: 'seat-fr', purpose: 'Right of reply', time: '1:00' };
		const reading = readSingleSpeakerForm(formOf(fields), PRESENT);

		expect(reading.errors).toEqual({});
		expect(reading.input).toEqual({
			seatId: 'seat-fr',
			speakerName: null,
			purpose: 'Right of reply',
			speakingSeconds: 60
		});
	});

	it('gives a typed name the floor, with "Other…" words and a typed time that wins', () => {
		const fields = {
			speakerName: 'Secretary-General',
			purpose: 'other',
			purposeOther: 'Opening address',
			time: '1:00',
			timeTyped: '2:30'
		};
		const reading = readSingleSpeakerForm(formOf(fields), PRESENT);

		expect(reading.input).toEqual({
			seatId: null,
			speakerName: 'Secretary-General',
			purpose: 'Opening address',
			speakingSeconds: 150
		});
	});

	it('takes no purpose when none is chosen', () => {
		const reading = readSingleSpeakerForm(formOf({ seatId: 'seat-ke', time: '0:30' }), PRESENT);

		expect(reading.input?.purpose).toBeNull();
	});

	it('refuses with neither a seat nor a name, and with both', () => {
		const neither = readSingleSpeakerForm(formOf({ time: '1:00' }), PRESENT);
		const both = readSingleSpeakerForm(
			formOf({ seatId: 'seat-fr', speakerName: 'Guest', time: '1:00' }),
			PRESENT
		);

		expect(neither.errors.who).toBe('Choose a delegation or type a name.');
		expect(both.errors.who).toBe('Choose a delegation or type a name, not both.');
		expect(both.input).toBeNull();
	});

	it('refuses an absent seat and a name too long', () => {
		const absent = readSingleSpeakerForm(formOf({ seatId: 'seat-gone', time: '1:00' }), PRESENT);
		const long = readSingleSpeakerForm(
			formOf({ speakerName: 'x'.repeat(81), time: '1:00' }),
			PRESENT
		);

		expect(absent.errors.who).toBe('That seat is not present.');
		expect(long.errors.who).toBe(SINGLE_SPEAKER_MESSAGES.nameLength);
	});

	it('refuses an empty "Other…" and words too long', () => {
		const empty = readSingleSpeakerForm(
			formOf({ seatId: 'seat-fr', purpose: 'other', time: '1:00' }),
			PRESENT
		);
		const long = readSingleSpeakerForm(
			formOf({ seatId: 'seat-fr', purpose: 'other', purposeOther: 'y'.repeat(81), time: '1:00' }),
			PRESENT
		);

		expect(empty.errors.purpose).toBe('Say what the purpose is, or choose another.');
		expect(long.errors.purpose).toBe('Keep the purpose under 80 characters.');
	});

	it('refuses a time outside 15 seconds to 20 minutes, keeping what was typed', () => {
		for (const typed of ['10s', '21', 'later']) {
			const fields = { seatId: 'seat-fr', time: '', timeTyped: typed };
			const reading = readSingleSpeakerForm(formOf(fields), PRESENT);

			expect(reading.errors.time).toBe('Speaking time must be between 15 seconds and 20 minutes.');
			expect(reading.values.timeTyped).toBe(typed);
		}
	});

	it('starts with nobody, no purpose and "1:00"', () => {
		expect(emptySingleSpeakerForm()).toMatchObject({ seatId: '', purpose: '', time: '1:00' });
	});
});

describe('the words of the running view', () => {
	it('titles the view with the purpose, or without it', () => {
		expect(singleSpeakerTitle('Right of reply')).toBe('Single speaker · Right of reply');
		expect(singleSpeakerTitle(null)).toBe('Single speaker');
		expect(singleSpeakerTimeText(60)).toBe('· 1:00');
	});
});
