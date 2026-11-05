import { describe, expect, it } from 'vitest';
import type { InstantPress } from '$lib/instant-form.svelte';
import { entriesAfterPresses } from './roll-call-vote-preview';

/** The vote the presses below answer. */
const VOTE_ID = 'vote-1';

/** A press on a roll call vote's row, as the instant form keeps it. */
function votePress(action: string, seatId: string, choice?: string, id = 1): InstantPress {
	const formData = new FormData();
	formData.set('voteId', VOTE_ID);
	formData.set('seatId', seatId);
	if (choice) formData.set('choice', choice);

	return { id, formData, action: new URL(action, 'http://localhost/voting'), expected: null };
}

describe('entriesAfterPresses', () => {
	it('records, changes and clears answers in the order pressed', () => {
		const presses = [
			votePress('?/castRollCall', 'france', 'for', 1),
			votePress('?/castRollCall', 'ghana', 'against', 2),
			votePress('?/castRollCall', 'france', 'against', 3),
			votePress('?/clearRollCall', 'japan', undefined, 4)
		];

		expect(entriesAfterPresses({ japan: 'abstain' }, VOTE_ID, presses)).toEqual({
			france: 'against',
			ghana: 'against'
		});
	});

	it('leaves out presses on another vote', () => {
		const press = votePress('?/castRollCall', 'france', 'for');
		press.formData.set('voteId', 'vote-2');

		expect(entriesAfterPresses({}, VOTE_ID, [press])).toEqual({});
	});
});
