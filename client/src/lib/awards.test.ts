/**
 * Tests for `$lib/awards`: the six award kinds and their order, sorting and
 * counting a committee's awards, the badge and refusal wording, and the two
 * small formatters (`awardSeatLabel`, `formatPublishedDay`).
 *
 * Nothing here talks to the database. `$lib/server/awards.ts` and
 * `$lib/server/award-changes.ts` have their own tests for that.
 */
import { describe, expect, it } from 'vitest';
import {
	AWARD_KIND_OPTIONS,
	awardBadge,
	awardKindLabel,
	awardSeatLabel,
	canEditAward,
	canRenameAward,
	canWithdrawAward,
	committeesWithoutConfirmedAwards,
	confirmedAwardOnEmptySeat,
	countAwards,
	findAward,
	formatPublishedDay,
	isAwardKind,
	isAwardsPublished,
	isAwardsVisible,
	noteCountText,
	sortAwards,
	type Award,
	type AwardSeat,
	type CommitteeAwards
} from './awards';

/** One award, with every field a test does not care about filled in plainly. */
function makeAward(overrides: Partial<Award> = {}): Award {
	return {
		id: 'award-1',
		committeeId: 'committee-1',
		seatId: 'seat-1',
		seatName: 'France',
		countryCode: 'FR',
		holderName: 'Amira Haddad',
		isSeatEmpty: false,
		kind: 'best_delegate',
		title: 'Best Delegate',
		status: 'proposed',
		createdBy: 'chair-1',
		proposerName: 'Ada',
		...overrides
	};
}

/** A seat with a delegate in it, with every field a test does not care about filled in plainly. */
function makeSeat(overrides: Partial<AwardSeat> = {}): AwardSeat {
	return {
		id: 'seat-1',
		name: 'France',
		countryCode: 'FR',
		isFilled: true,
		delegateName: 'Amira Haddad',
		...overrides
	};
}

describe('awardKindLabel', () => {
	it('gives every kind its words', () => {
		expect(awardKindLabel('best_delegate')).toBe('Best Delegate');
		expect(awardKindLabel('outstanding_delegate')).toBe('Outstanding Delegate');
		expect(awardKindLabel('honourable_mention')).toBe('Honourable Mention');
		expect(awardKindLabel('best_position_paper')).toBe('Best Position Paper');
		expect(awardKindLabel('verbal_commendation')).toBe('Verbal Commendation');
		expect(awardKindLabel('custom')).toBe('Custom');
	});
});

describe('AWARD_KIND_OPTIONS', () => {
	it('lists the six kinds as select options, in rank order', () => {
		expect(AWARD_KIND_OPTIONS).toEqual([
			{ value: 'best_delegate', label: 'Best Delegate' },
			{ value: 'outstanding_delegate', label: 'Outstanding Delegate' },
			{ value: 'honourable_mention', label: 'Honourable Mention' },
			{ value: 'best_position_paper', label: 'Best Position Paper' },
			{ value: 'verbal_commendation', label: 'Verbal Commendation' },
			{ value: 'custom', label: 'Custom' }
		]);
	});
});

describe('isAwardKind', () => {
	it('accepts every one of the six kinds', () => {
		expect(isAwardKind('best_delegate')).toBe(true);
		expect(isAwardKind('custom')).toBe(true);
	});

	it('refuses anything else a form might send', () => {
		expect(isAwardKind('')).toBe(false);
		expect(isAwardKind('best delegate')).toBe(false);
		expect(isAwardKind('outstanding')).toBe(false);
	});
});

describe('sortAwards', () => {
	it('orders by kind rank first, and by seat name within one kind', () => {
		const custom = makeAward({ id: 'a', kind: 'custom', seatName: 'Brazil' });
		const bestDelegateGermany = makeAward({ id: 'b', kind: 'best_delegate', seatName: 'Germany' });
		const bestDelegateFrance = makeAward({ id: 'c', kind: 'best_delegate', seatName: 'France' });
		const honourableMention = makeAward({ id: 'd', kind: 'honourable_mention', seatName: 'Chile' });

		const sorted = sortAwards([custom, bestDelegateGermany, bestDelegateFrance, honourableMention]);

		expect(sorted.map((award) => award.id)).toEqual(['c', 'b', 'd', 'a']);
	});

	it('returns a new array and leaves the one it was given alone', () => {
		const awards = [
			makeAward({ id: 'a', kind: 'custom', seatName: 'Brazil' }),
			makeAward({ id: 'b', kind: 'best_delegate', seatName: 'Germany' })
		];
		const original = [...awards];

		const sorted = sortAwards(awards);

		expect(sorted).not.toBe(awards);
		expect(awards).toEqual(original);
	});
});

describe('isAwardsPublished', () => {
	it('is true once a moment is set, even one still in the future', () => {
		expect(isAwardsPublished('2027-03-01T00:00:00Z')).toBe(true);
	});

	it('is false while nothing has been set', () => {
		expect(isAwardsPublished(null)).toBe(false);
	});
});

describe('isAwardsVisible', () => {
	const now = new Date('2027-02-15T12:00:00Z');

	it('is false while nothing is scheduled', () => {
		expect(isAwardsVisible(null, now)).toBe(false);
	});

	it('is true for a moment already past', () => {
		expect(isAwardsVisible('2027-02-14T12:00:00Z', now)).toBe(true);
	});

	it('is true for the exact moment "now" reads', () => {
		expect(isAwardsVisible('2027-02-15T12:00:00Z', now)).toBe(true);
	});

	it('is false for a moment still ahead of "now"', () => {
		expect(isAwardsVisible('2027-02-16T12:00:00Z', now)).toBe(false);
	});
});

describe('awardBadge', () => {
	it('reads "Proposed" before publishing, for a proposal', () => {
		expect(awardBadge('proposed', false)).toEqual({ tone: 'neutral', label: 'Proposed' });
	});

	it('reads "Confirmed" before publishing, for a confirmed award', () => {
		expect(awardBadge('confirmed', false)).toEqual({ tone: 'success', label: 'Confirmed' });
	});

	it('reads "Published" after publishing, for a confirmed award', () => {
		expect(awardBadge('confirmed', true)).toEqual({ tone: 'brand', label: 'Published' });
	});

	it('reads "Not confirmed" after publishing, for a proposal the organisers left out', () => {
		expect(awardBadge('proposed', true)).toEqual({ tone: 'neutral', label: 'Not confirmed' });
	});
});

describe('countAwards', () => {
	it('counts the confirmed and proposed awards, and the committees with no confirmed one', () => {
		const sections: CommitteeAwards[] = [
			{
				committee: { id: 'committee-1', name: 'Security Council', abbreviation: 'UNSC' },
				awards: [
					makeAward({ id: 'a', status: 'confirmed' }),
					makeAward({ id: 'b', status: 'proposed' })
				],
				filledSeats: []
			},
			{
				committee: { id: 'committee-2', name: 'Human Rights Council', abbreviation: null },
				awards: [makeAward({ id: 'c', status: 'proposed' })],
				filledSeats: []
			}
		];

		expect(countAwards(sections)).toEqual({
			confirmed: 1,
			proposed: 2,
			committeesWithoutAwards: 1
		});
	});
});

describe('committeesWithoutConfirmedAwards', () => {
	it('names the committees with no confirmed award, in page order', () => {
		const sections: CommitteeAwards[] = [
			{
				committee: { id: 'committee-1', name: 'Security Council', abbreviation: 'UNSC' },
				awards: [makeAward({ status: 'confirmed' })],
				filledSeats: []
			},
			{
				committee: { id: 'committee-2', name: 'Human Rights Council', abbreviation: null },
				awards: [makeAward({ status: 'proposed' })],
				filledSeats: []
			},
			{
				committee: { id: 'committee-3', name: 'Economic and Social Council', abbreviation: null },
				awards: [],
				filledSeats: []
			}
		];

		expect(committeesWithoutConfirmedAwards(sections)).toEqual([
			'Human Rights Council',
			'Economic and Social Council'
		]);
	});
});

describe('confirmedAwardOnEmptySeat', () => {
	it('names the first confirmed award pointing at an empty seat', () => {
		const sections: CommitteeAwards[] = [
			{
				committee: { id: 'committee-1', name: 'Security Council', abbreviation: 'UNSC' },
				awards: [makeAward({ status: 'confirmed', isSeatEmpty: false })],
				filledSeats: []
			},
			{
				committee: { id: 'committee-2', name: 'Human Rights Council', abbreviation: null },
				awards: [
					// A proposal on an empty seat is not a problem: only a confirmed
					// award has to point somewhere real before publishing.
					makeAward({ status: 'proposed', isSeatEmpty: true, title: 'Best Delegate' }),
					makeAward({ status: 'confirmed', isSeatEmpty: true, title: 'Honourable Mention' })
				],
				filledSeats: []
			}
		];

		expect(confirmedAwardOnEmptySeat(sections)).toBe('Honourable Mention in Human Rights Council');
	});

	it('is null when every confirmed award has a delegate behind it', () => {
		const sections: CommitteeAwards[] = [
			{
				committee: { id: 'committee-1', name: 'Security Council', abbreviation: 'UNSC' },
				awards: [makeAward({ status: 'confirmed', isSeatEmpty: false })],
				filledSeats: []
			}
		];

		expect(confirmedAwardOnEmptySeat(sections)).toBeNull();
	});
});

describe('canEditAward', () => {
	it('lets the proposer change their own unpublished proposal', () => {
		const award = makeAward({ status: 'proposed', createdBy: 'chair-1' });

		expect(canEditAward(award, 'chair-1', false)).toBe(true);
	});

	it('refuses anybody but the proposer', () => {
		const award = makeAward({ status: 'proposed', createdBy: 'chair-1' });

		expect(canEditAward(award, 'chair-2', false)).toBe(false);
	});

	it('refuses once the award is confirmed or the awards are published', () => {
		const award = makeAward({ status: 'proposed', createdBy: 'chair-1' });

		expect(
			canEditAward(makeAward({ status: 'confirmed', createdBy: 'chair-1' }), 'chair-1', false)
		).toBe(false);
		expect(canEditAward(award, 'chair-1', true)).toBe(false);
	});
});

describe('canWithdrawAward', () => {
	it('lets the proposer withdraw their own unpublished proposal', () => {
		const award = makeAward({ status: 'proposed', createdBy: 'chair-1' });

		expect(canWithdrawAward(award, 'chair-1', false, false)).toBe(true);
	});

	it('lets an organiser withdraw a proposal that is not their own', () => {
		const award = makeAward({ status: 'proposed', createdBy: 'chair-1' });

		expect(canWithdrawAward(award, 'organiser-1', true, false)).toBe(true);
	});

	it('refuses somebody who neither proposed it nor organises the conference', () => {
		const award = makeAward({ status: 'proposed', createdBy: 'chair-1' });

		expect(canWithdrawAward(award, 'chair-2', false, false)).toBe(false);
	});

	it('refuses once the award is confirmed or the awards are published', () => {
		const confirmed = makeAward({ status: 'confirmed', createdBy: 'chair-1' });
		const proposed = makeAward({ status: 'proposed', createdBy: 'chair-1' });

		expect(canWithdrawAward(confirmed, 'chair-1', true, false)).toBe(false);
		expect(canWithdrawAward(proposed, 'chair-1', true, true)).toBe(false);
	});
});

describe('noteCountText', () => {
	it('reads "0 notes" for none', () => {
		expect(noteCountText(0)).toBe('0 notes');
	});

	it('keeps "note" singular for exactly one', () => {
		expect(noteCountText(1)).toBe('1 note');
	});

	it('pluralises for anything else', () => {
		expect(noteCountText(3)).toBe('3 notes');
	});
});

describe('awardSeatLabel', () => {
	it('names the seat and its delegate together', () => {
		expect(awardSeatLabel(makeSeat({ name: 'France', delegateName: 'Amira Haddad' }))).toBe(
			'France · Amira Haddad'
		);
	});

	it('names only the seat when nobody has written a name', () => {
		expect(awardSeatLabel(makeSeat({ name: 'France', delegateName: null }))).toBe('France');
	});
});

describe('formatPublishedDay', () => {
	it('reads the day the moment fell on in the conference timezone', () => {
		// 23:30 UTC on 15 February is already past midnight in Amsterdam (UTC+1
		// in February), so the published day is the 16th, not the 15th.
		expect(formatPublishedDay('2027-02-15T23:30:00Z', 'Europe/Amsterdam')).toBe('16 Feb 2027');
	});
});

describe('canRenameAward', () => {
	it('lets the organiser who added a custom award rename it before publishing', () => {
		const award = makeAward({ kind: 'custom', createdBy: 'organiser-1' });

		expect(canRenameAward(award, 'organiser-1', false)).toBe(true);
	});

	it('refuses a kind that is not custom', () => {
		const award = makeAward({ kind: 'best_delegate', createdBy: 'organiser-1' });

		expect(canRenameAward(award, 'organiser-1', false)).toBe(false);
	});

	it('refuses somebody who did not add it, and refuses once published', () => {
		const award = makeAward({ kind: 'custom', createdBy: 'organiser-1' });

		expect(canRenameAward(award, 'organiser-2', false)).toBe(false);
		expect(canRenameAward(award, 'organiser-1', true)).toBe(false);
	});
});

describe('findAward', () => {
	it('finds an award among every committee of the page', () => {
		const target = makeAward({ id: 'award-target' });
		const sections: CommitteeAwards[] = [
			{
				committee: { id: 'committee-1', name: 'Security Council', abbreviation: 'UNSC' },
				awards: [makeAward({ id: 'award-other' })],
				filledSeats: []
			},
			{
				committee: { id: 'committee-2', name: 'Human Rights Council', abbreviation: null },
				awards: [target],
				filledSeats: []
			}
		];

		expect(findAward(sections, 'award-target')).toBe(target);
	});

	it('is null when no committee has that award', () => {
		expect(findAward([], 'award-missing')).toBeNull();
	});
});
