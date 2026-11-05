import { describe, expect, it } from 'vitest';
import { GSL_ADD_BOX, SINGLE_SPEAKER_ADD_BOX, recogniseAddBox } from './queue-add-box';

describe('recogniseAddBox', () => {
	it('recognises a delegation, posting the Mod view’s own action', () => {
		expect(recogniseAddBox(false)).toEqual({
			action: '?/recognise',
			label: 'Recognise a delegation',
			placeholder: 'Recognise a delegation…',
			buttonLabel: 'Recognise',
			givesTheFloor: false
		});
	});

	it('says a seat gets the floor only while nobody has it', () => {
		expect(recogniseAddBox(true).givesTheFloor).toBe(true);
		expect(recogniseAddBox(false).givesTheFloor).toBe(false);
	});
});

describe('the GSL’s and the single speaker’s add boxes', () => {
	it('add to the list, never giving the floor, under their own words', () => {
		expect(GSL_ADD_BOX).toMatchObject({ action: '?/add', label: 'Add a delegation' });
		expect(SINGLE_SPEAKER_ADD_BOX).toMatchObject({
			action: '?/add',
			label: 'Add a speaker',
			givesTheFloor: false
		});
	});
});
