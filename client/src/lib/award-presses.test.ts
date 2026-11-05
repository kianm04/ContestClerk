import { describe, expect, it } from 'vitest';
import { proposeAwardPress, withdrawAwardPress } from './award-presses';
import type { AwardFormValues } from './award-form';
import type { Award, AwardSeat } from './awards';

// These mirror what `$lib/server/award-changes.ts`'s `proposeAward` and
// `deleteAward` write, so a press worked out here shows the same thing the
// server will save. The form's own checks are already tested in
// `award-form.test.ts`; these tests are about what a press adds on top: the
// duplicate check against the awards already shown, and the row it builds.

const SEAT_FR: AwardSeat = {
	id: 'seat-fr',
	name: 'France',
	countryCode: 'FR',
	isFilled: true,
	delegateName: 'Amira Haddad'
};
const SEAT_DE: AwardSeat = {
	id: 'seat-de',
	name: 'Germany',
	countryCode: 'DE',
	isFilled: false,
	delegateName: null
};
const SEATS = [SEAT_FR, SEAT_DE];

const EXISTING_AWARD: Award = {
	id: 'award-1',
	committeeId: 'committee-1',
	seatId: 'seat-fr',
	seatName: 'France',
	countryCode: 'FR',
	holderName: 'Amira Haddad',
	isSeatEmpty: false,
	kind: 'best_delegate',
	title: 'Best Delegate',
	status: 'proposed',
	createdBy: 'chair-1',
	proposerName: 'Ada'
};

describe('proposeAwardPress', () => {
	it('builds the proposed award for a seat that has none of that kind yet', () => {
		const values: AwardFormValues = { seatId: 'seat-fr', kind: 'outstanding_delegate', title: '' };

		const expectation = proposeAwardPress(
			values,
			SEATS,
			[EXISTING_AWARD],
			'committee-1',
			'award-2',
			'chair-2'
		);

		expect(expectation).toEqual({
			awards: [
				{
					id: 'award-2',
					added: {
						id: 'award-2',
						committeeId: 'committee-1',
						seatId: 'seat-fr',
						seatName: 'France',
						countryCode: 'FR',
						holderName: 'Amira Haddad',
						isSeatEmpty: false,
						kind: 'outstanding_delegate',
						title: 'Outstanding Delegate',
						status: 'proposed',
						createdBy: 'chair-2',
						proposerName: null
					}
				}
			]
		});
	});

	it('answers null for a form the server would refuse', () => {
		const values: AwardFormValues = { seatId: '', kind: 'best_delegate', title: '' };

		const expectation = proposeAwardPress(values, SEATS, [], 'committee-1', 'award-2', 'chair-2');

		expect(expectation).toBeNull();
	});

	it('answers null for a second award of the same kind for one seat', () => {
		const values: AwardFormValues = { seatId: 'seat-fr', kind: 'best_delegate', title: '' };

		const expectation = proposeAwardPress(
			values,
			SEATS,
			[EXISTING_AWARD],
			'committee-1',
			'award-2',
			'chair-2'
		);

		expect(expectation).toBeNull();
	});
});

describe('withdrawAwardPress', () => {
	it('takes the award off the list', () => {
		expect(withdrawAwardPress('award-1')).toEqual({
			awards: [{ id: 'award-1', isDeleted: true }]
		});
	});
});
