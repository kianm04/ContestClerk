import { describe, expect, it } from 'vitest';
import type { Award, CommitteeAwards } from './awards';
import {
	awardSectionsAfterPresses,
	describeOrganiserAwardFailure,
	expectOrganiserAwardChange,
	type OrganiserAwardPress
} from './organiser-award-presses';

/** A press of `action` naming `awardId`, the way `OrganiserAwardRow`'s forms send it. */
function pressInput(action: string, awardId: string) {
	const formData = new FormData();
	if (awardId !== '') formData.set('awardId', awardId);

	return {
		action: new URL(`http://localhost/manage/riverside-mun-2027/awards${action}`),
		formData
	};
}

/** A press still on its way, with the change `expectOrganiserAwardChange` gave it. */
function pressOf(action: string, awardId: string): OrganiserAwardPress {
	const input = pressInput(action, awardId);

	return { id: 1, ...input, expected: expectOrganiserAwardChange(input) };
}

/** One proposed award in committee `comm-1`. */
function awardCalled(id: string): Award {
	return {
		id,
		committeeId: 'comm-1',
		seatId: `seat-${id}`,
		seatName: 'France',
		countryCode: 'FR',
		holderName: 'Amelie Dubois',
		isSeatEmpty: false,
		kind: 'best_delegate',
		title: 'Best Delegate',
		status: 'proposed',
		createdBy: 'chair-1',
		proposerName: 'Sara Khan'
	};
}

const SECTIONS: CommitteeAwards[] = [
	{
		committee: { id: 'comm-1', name: 'Security Council', abbreviation: 'UNSC' },
		awards: [awardCalled('award-1'), awardCalled('award-2')],
		filledSeats: []
	}
];

describe('expectOrganiserAwardChange', () => {
	it('confirms the award named in the form', () => {
		expect(expectOrganiserAwardChange(pressInput('?/confirm', 'award-1'))).toEqual([
			{ id: 'award-1', changes: { status: 'confirmed' } }
		]);
	});

	it('moves the award back to proposed', () => {
		expect(expectOrganiserAwardChange(pressInput('?/unconfirm', 'award-1'))).toEqual([
			{ id: 'award-1', changes: { status: 'proposed' } }
		]);
	});

	it('takes a deleted award off the list', () => {
		expect(expectOrganiserAwardChange(pressInput('?/delete', 'award-1'))).toEqual([
			{ id: 'award-1', isDeleted: true }
		]);
	});

	it('answers null for a press that names no award, or one it does not predict', () => {
		expect(expectOrganiserAwardChange(pressInput('?/confirm', ''))).toBeNull();
		expect(expectOrganiserAwardChange(pressInput('?/publish', 'award-1'))).toBeNull();
	});
});

describe('awardSectionsAfterPresses', () => {
	it('lays each press on the awards of every committee', () => {
		const shown = awardSectionsAfterPresses(SECTIONS, [
			pressOf('?/confirm', 'award-1'),
			pressOf('?/delete', 'award-2')
		]);

		expect(shown[0].awards).toEqual([{ ...awardCalled('award-1'), status: 'confirmed' }]);
		expect(shown[0].committee).toBe(SECTIONS[0].committee);
	});

	it('leaves the committees alone with no presses', () => {
		expect(awardSectionsAfterPresses(SECTIONS, [])).toEqual(SECTIONS);
	});
});

describe('describeOrganiserAwardFailure', () => {
	it('names what did not happen', () => {
		expect(describeOrganiserAwardFailure(pressOf('?/confirm', 'award-1'))).toBe(
			'The award was not confirmed.'
		);
		expect(describeOrganiserAwardFailure(pressOf('?/unconfirm', 'award-1'))).toBe(
			'The award was not moved back to proposed.'
		);
		expect(describeOrganiserAwardFailure(pressOf('?/delete', 'award-1'))).toBe(
			'The award was not deleted.'
		);
	});
});
