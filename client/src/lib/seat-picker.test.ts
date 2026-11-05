import { describe, expect, it } from 'vitest';
import { GSL_ADD_BOX, SINGLE_SPEAKER_ADD_BOX, recogniseAddBox } from './queue-add-box';
import { NOBODY_CHOSEN, pickedText, whoChoice } from './seat-picker';
import type { SeatOption } from './seat-search';

const FRANCE_OPTION: SeatOption = {
	kind: 'seat',
	seat: { id: 'seat-fr', name: 'France', countryCode: 'FR' },
	label: 'France',
	value: 'seat-fr',
	mark: null,
	isChoosable: true,
	marksPresent: false
};

const NAME_OPTION: SeatOption = {
	kind: 'name',
	seat: null,
	label: 'Use “Secretary-General”',
	value: 'Secretary-General',
	mark: 'a name, not a seat',
	isChoosable: true,
	marksPresent: false
};

describe('the picker fields', () => {
	it('leaves a seat’s name, or a typed name as typed, in the box', () => {
		expect(pickedText(FRANCE_OPTION)).toBe('France');
		expect(pickedText(NAME_OPTION)).toBe('Secretary-General');
	});

	it('sends a seat in `seatId` and a typed name in `speakerName`', () => {
		expect(whoChoice(FRANCE_OPTION)).toEqual({ seatId: 'seat-fr', speakerName: '' });
		expect(whoChoice(NAME_OPTION)).toEqual({ seatId: '', speakerName: 'Secretary-General' });
		expect(NOBODY_CHOSEN).toEqual({ seatId: '', speakerName: '' });
	});
});

describe('the queue column’s add boxes', () => {
	it('adds to the GSL, and to "Also speaking" with its own words', () => {
		expect(GSL_ADD_BOX.action).toBe('?/add');
		expect(GSL_ADD_BOX.placeholder).toBe('Add a delegation…');
		expect(SINGLE_SPEAKER_ADD_BOX).toMatchObject({
			action: '?/add',
			placeholder: 'Add a speaker…'
		});
	});

	it('recognises in the Mod view, giving the floor only while nobody has it', () => {
		expect(recogniseAddBox(true)).toEqual({
			action: '?/recognise',
			label: 'Recognise a delegation',
			placeholder: 'Recognise a delegation…',
			buttonLabel: 'Recognise',
			givesTheFloor: true
		});
		expect(recogniseAddBox(false).givesTheFloor).toBe(false);
	});
});
