import { describe, expect, it } from 'vitest';
import {
	allocationSummary,
	buildSeatColumns,
	delegateMovedFlash,
	EMPTY_ALLOCATION_QUERY,
	matchesAllocationQuery,
	parseAllocationQuery,
	seatColumnCounts,
	seatColumnHeading,
	seatFreedFlash,
	seatState,
	canMoveInto,
	canSwapWith,
	delegatesSwappedFlash,
	seatsAvailableFor,
	seatVisibilityFlash,
	suggestSeats,
	type AllocatableSeat,
	type AllocationQuery,
	type GridSeat
} from './allocation';
import type { CommitteeChoice } from './applications';

/** The three committees the tests choose between. */
const SECURITY_COUNCIL: CommitteeChoice = {
	id: 'committee-unsc',
	name: 'United Nations Security Council',
	abbreviation: 'UNSC'
};

const HUMAN_RIGHTS_COUNCIL: CommitteeChoice = {
	id: 'committee-hrc',
	name: 'Human Rights Council',
	abbreviation: 'HRC'
};

const CRISIS_CABINET: CommitteeChoice = {
	id: 'committee-crisis',
	name: 'Crisis Cabinet',
	abbreviation: null
};

/**
 * One free seat. A test says only what its case is about — which committee the
 * seat is in, whether it is hidden, who is in it — and the fields it does not
 * care about are filled in here.
 */
function makeSeat(id: string, changes: Partial<AllocatableSeat> = {}): AllocatableSeat {
	return {
		id,
		committeeId: SECURITY_COUNCIL.id,
		name: 'France',
		countryCode: 'FR',
		isAvailable: true,
		delegationId: null,
		userId: null,
		...changes
	};
}

describe('seatState', () => {
	it('calls a seat with nobody in it and nothing held for anybody free', () => {
		expect(seatState(makeSeat('seat-france'))).toBe('free');
	});

	it('calls a seat with a delegate in it filled', () => {
		const seat = makeSeat('seat-france', { userId: 'user-anna' });

		expect(seatState(seat)).toBe('filled');
	});

	it('calls a seat held for a delegation that has named nobody reserved', () => {
		const seat = makeSeat('seat-france', { delegationId: 'delegation-warsaw' });

		expect(seatState(seat)).toBe('reserved');
	});

	it('calls a seat filled once the delegation has put somebody in it', () => {
		const seat = makeSeat('seat-france', {
			delegationId: 'delegation-warsaw',
			userId: 'user-anna'
		});

		expect(seatState(seat)).toBe('filled');
	});

	it('calls a seat the organiser is not offering hidden', () => {
		const seat = makeSeat('seat-france', { isAvailable: false });

		expect(seatState(seat)).toBe('hidden');
	});

	// A seat nobody may take is not one to offer, whoever is in it, so `hidden`
	// is answered before `filled` and before `reserved`.
	it('calls a hidden seat hidden even when somebody is already in it', () => {
		const seat = makeSeat('seat-france', { isAvailable: false, userId: 'user-anna' });

		expect(seatState(seat)).toBe('hidden');
	});

	it('calls a hidden seat hidden even when it is held for a delegation', () => {
		const seat = makeSeat('seat-france', {
			isAvailable: false,
			delegationId: 'delegation-warsaw'
		});

		expect(seatState(seat)).toBe('hidden');
	});
});

describe('suggestSeats', () => {
	it('offers nothing when the conference has no seats at all', () => {
		expect(suggestSeats([], [SECURITY_COUNCIL], [])).toEqual([]);
	});

	it('puts the preferred committees first, in the applicant order', () => {
		const committees = [SECURITY_COUNCIL, HUMAN_RIGHTS_COUNCIL, CRISIS_CABINET];
		const seats = [
			makeSeat('seat-unsc', { committeeId: SECURITY_COUNCIL.id }),
			makeSeat('seat-hrc', { committeeId: HUMAN_RIGHTS_COUNCIL.id }),
			makeSeat('seat-crisis', { committeeId: CRISIS_CABINET.id })
		];

		const groups = suggestSeats([CRISIS_CABINET.id, HUMAN_RIGHTS_COUNCIL.id], committees, seats);

		expect(groups.map((group) => group.committeeId)).toEqual([
			CRISIS_CABINET.id,
			HUMAN_RIGHTS_COUNCIL.id,
			SECURITY_COUNCIL.id
		]);
	});

	it('keeps the given order for an applicant who asked for no committee', () => {
		const committees = [SECURITY_COUNCIL, HUMAN_RIGHTS_COUNCIL];
		const seats = [
			makeSeat('seat-unsc', { committeeId: SECURITY_COUNCIL.id }),
			makeSeat('seat-hrc', { committeeId: HUMAN_RIGHTS_COUNCIL.id })
		];

		const groups = suggestSeats([], committees, seats);

		expect(groups.map((group) => group.committeeId)).toEqual([
			SECURITY_COUNCIL.id,
			HUMAN_RIGHTS_COUNCIL.id
		]);
	});

	it('leaves out a committee whose every seat is taken', () => {
		const committees = [SECURITY_COUNCIL, HUMAN_RIGHTS_COUNCIL];
		const seats = [
			makeSeat('seat-unsc', { committeeId: SECURITY_COUNCIL.id, userId: 'user-anna' }),
			makeSeat('seat-hrc', { committeeId: HUMAN_RIGHTS_COUNCIL.id })
		];

		const groups = suggestSeats([SECURITY_COUNCIL.id], committees, seats);

		expect(groups.map((group) => group.committeeId)).toEqual([HUMAN_RIGHTS_COUNCIL.id]);
	});

	it('leaves out a committee with no seats of its own yet', () => {
		const committees = [SECURITY_COUNCIL, HUMAN_RIGHTS_COUNCIL];
		const seats = [makeSeat('seat-unsc', { committeeId: SECURITY_COUNCIL.id })];

		const groups = suggestSeats([], committees, seats);

		expect(groups.map((group) => group.committeeId)).toEqual([SECURITY_COUNCIL.id]);
	});

	it('never offers a hidden, a filled or a reserved seat', () => {
		const seats = [
			makeSeat('seat-hidden', { isAvailable: false }),
			makeSeat('seat-filled', { userId: 'user-anna' }),
			makeSeat('seat-reserved', { delegationId: 'delegation-warsaw' }),
			makeSeat('seat-free')
		];

		const groups = suggestSeats([], [SECURITY_COUNCIL], seats);

		expect(groups).toHaveLength(1);
		expect(groups[0].seats.map((seat) => seat.id)).toEqual(['seat-free']);
	});

	// An organiser can delete a committee after somebody has applied to it, and
	// the application keeps the id it was written with.
	it('ignores a preference for a committee that is not in the list', () => {
		const committees = [SECURITY_COUNCIL, HUMAN_RIGHTS_COUNCIL];
		const seats = [
			makeSeat('seat-unsc', { committeeId: SECURITY_COUNCIL.id }),
			makeSeat('seat-hrc', { committeeId: HUMAN_RIGHTS_COUNCIL.id })
		];

		const groups = suggestSeats(['committee-deleted', HUMAN_RIGHTS_COUNCIL.id], committees, seats);

		expect(groups.map((group) => group.committeeId)).toEqual([
			HUMAN_RIGHTS_COUNCIL.id,
			SECURITY_COUNCIL.id
		]);
	});

	it('offers a committee once even when it was asked for twice', () => {
		const committees = [SECURITY_COUNCIL, HUMAN_RIGHTS_COUNCIL];
		const seats = [
			makeSeat('seat-unsc', { committeeId: SECURITY_COUNCIL.id }),
			makeSeat('seat-hrc', { committeeId: HUMAN_RIGHTS_COUNCIL.id })
		];

		const groups = suggestSeats(
			[HUMAN_RIGHTS_COUNCIL.id, HUMAN_RIGHTS_COUNCIL.id],
			committees,
			seats
		);

		expect(groups.map((group) => group.committeeId)).toEqual([
			HUMAN_RIGHTS_COUNCIL.id,
			SECURITY_COUNCIL.id
		]);
	});

	it('names a group by the committee short name, and by its full name when it has none', () => {
		const committees = [SECURITY_COUNCIL, CRISIS_CABINET];
		const seats = [
			makeSeat('seat-unsc', { committeeId: SECURITY_COUNCIL.id }),
			makeSeat('seat-crisis', { committeeId: CRISIS_CABINET.id })
		];

		const groups = suggestSeats([], committees, seats);

		expect(groups.map((group) => group.committeeLabel)).toEqual(['UNSC', 'Crisis Cabinet']);
	});

	it('keeps the seats of a committee in the order they were given in', () => {
		const seats = [
			makeSeat('seat-france', { name: 'France' }),
			makeSeat('seat-china', { name: 'China' }),
			makeSeat('seat-brazil', { name: 'Brazil' })
		];

		const groups = suggestSeats([], [SECURITY_COUNCIL], seats);

		expect(groups[0].seats.map((seat) => seat.name)).toEqual(['France', 'China', 'Brazil']);
	});

	it('keeps the whole seat, so the dropdown can show its name and its flag', () => {
		const seats = [makeSeat('seat-france')];

		const groups = suggestSeats([], [SECURITY_COUNCIL], seats);

		expect(groups[0].seats[0]).toEqual(seats[0]);
	});

	it('leaves out a seat belonging to a committee that is not in the list', () => {
		const seats = [
			makeSeat('seat-unsc', { committeeId: SECURITY_COUNCIL.id }),
			makeSeat('seat-elsewhere', { committeeId: 'committee-of-another-conference' })
		];

		const groups = suggestSeats([], [SECURITY_COUNCIL], seats);

		expect(groups).toHaveLength(1);
		expect(groups[0].seats.map((seat) => seat.id)).toEqual(['seat-unsc']);
	});
});

/**
 * One seat as the grid draws it: a `makeSeat` with the committee and the holder
 * the grid also needs. The committee it is told about is the committee its
 * `committeeId` points at, which is how the server fills both fields in.
 */
function makeGridSeat(id: string, changes: Partial<GridSeat> = {}): GridSeat {
	const committee = changes.committee ?? SECURITY_COUNCIL;

	return {
		...makeSeat(id, { committeeId: committee.id }),
		committee,
		holderName: null,
		holderAvatarPath: null,
		holderCountryCode: null,
		holderInstitution: null,
		delegationName: null,
		applicationId: null,
		...changes
	};
}

/** A query that asks for nothing, so each test can change one thing at a time. */
function makeQuery(changes: Partial<AllocationQuery> = {}): AllocationQuery {
	return { ...EMPTY_ALLOCATION_QUERY, ...changes };
}

describe('parseAllocationQuery', () => {
	it('asks for nothing when the address carries nothing', () => {
		expect(parseAllocationQuery(new URLSearchParams())).toEqual(EMPTY_ALLOCATION_QUERY);
	});

	it('reads every parameter the grid travels with', () => {
		const params = new URLSearchParams(
			'committee=committee-unsc&state=reserved&q=kowalski&seat=seat-france&action=move'
		);

		expect(parseAllocationQuery(params)).toEqual({
			committee: 'committee-unsc',
			state: 'reserved',
			q: 'kowalski',
			seat: 'seat-france',
			action: 'move'
		});
	});

	it('trims the search, so a stray space is not searched for', () => {
		expect(parseAllocationQuery(new URLSearchParams('q=  anna  ')).q).toBe('anna');
	});

	// Anybody can type anything into the address, and a state nobody wrote the
	// grid for should show the whole grid rather than break it.
	it('ignores a state that is not one of the four', () => {
		expect(parseAllocationQuery(new URLSearchParams('state=sideways')).state).toBe('');
	});

	it('ignores a panel that is not one of the three', () => {
		expect(parseAllocationQuery(new URLSearchParams('action=delete')).action).toBe('');
	});
});

describe('allocationSummary', () => {
	it('counts a mixed list by state', () => {
		const seats = [
			makeSeat('seat-free-one'),
			makeSeat('seat-free-two'),
			makeSeat('seat-reserved', { delegationId: 'delegation-warsaw' }),
			makeSeat('seat-filled', { userId: 'user-anna' }),
			makeSeat('seat-hidden', { isAvailable: false })
		];

		expect(allocationSummary(seats)).toEqual({
			total: 5,
			free: 2,
			reserved: 1,
			filled: 1,
			hidden: 1
		});
	});

	it('counts nothing at a conference with no seats yet', () => {
		expect(allocationSummary([])).toEqual({
			total: 0,
			free: 0,
			reserved: 0,
			filled: 0,
			hidden: 0
		});
	});

	// `seatState` gives every seat exactly one of the four answers, so the four
	// counts have to add up to the number of seats there are.
	it('always adds the four states up to the total', () => {
		const seats = [
			makeSeat('seat-free'),
			makeSeat('seat-reserved', { delegationId: 'delegation-warsaw' }),
			makeSeat('seat-filled', { userId: 'user-anna' }),
			makeSeat('seat-hidden-and-filled', { isAvailable: false, userId: 'user-ben' }),
			makeSeat('seat-hidden-and-reserved', {
				isAvailable: false,
				delegationId: 'delegation-warsaw'
			})
		];

		const summary = allocationSummary(seats);

		expect(summary.free + summary.reserved + summary.filled + summary.hidden).toBe(summary.total);
	});
});

describe('matchesAllocationQuery', () => {
	it('keeps every seat when nothing is filtered', () => {
		const seat = makeGridSeat('seat-france');

		expect(matchesAllocationQuery(seat, EMPTY_ALLOCATION_QUERY)).toBe(true);
	});

	it('keeps only the seats of the committee that was asked for', () => {
		const inside = makeGridSeat('seat-france', { committee: SECURITY_COUNCIL });
		const outside = makeGridSeat('seat-japan', { committee: HUMAN_RIGHTS_COUNCIL });
		const query = makeQuery({ committee: SECURITY_COUNCIL.id });

		expect(matchesAllocationQuery(inside, query)).toBe(true);
		expect(matchesAllocationQuery(outside, query)).toBe(false);
	});

	it('keeps only the seats in the state that was asked for', () => {
		const free = makeGridSeat('seat-france');
		const filled = makeGridSeat('seat-china', { userId: 'user-anna', holderName: 'Anna Kowalski' });
		const query = makeQuery({ state: 'filled' });

		expect(matchesAllocationQuery(free, query)).toBe(false);
		expect(matchesAllocationQuery(filled, query)).toBe(true);
	});

	it('searches the seat name, whoever is in it and the delegation holding it', () => {
		const bySeatName = makeGridSeat('seat-france', { name: 'France' });
		const byHolder = makeGridSeat('seat-china', {
			name: 'China',
			userId: 'user-anna',
			holderName: 'Anna Kowalski'
		});
		const byDelegation = makeGridSeat('seat-brazil', {
			name: 'Brazil',
			delegationId: 'delegation-lycee',
			delegationName: 'Lycée Français'
		});

		expect(matchesAllocationQuery(bySeatName, makeQuery({ q: 'fran' }))).toBe(true);
		expect(matchesAllocationQuery(byHolder, makeQuery({ q: 'kowalski' }))).toBe(true);
		expect(matchesAllocationQuery(byDelegation, makeQuery({ q: 'lycée' }))).toBe(true);
	});

	it('searches the committee short name as well as its full name', () => {
		const seat = makeGridSeat('seat-france', { committee: SECURITY_COUNCIL });

		expect(matchesAllocationQuery(seat, makeQuery({ q: 'unsc' }))).toBe(true);
		expect(matchesAllocationQuery(seat, makeQuery({ q: 'security' }))).toBe(true);
	});

	it('ignores the difference between capital and small letters', () => {
		const seat = makeGridSeat('seat-china', { userId: 'user-anna', holderName: 'Anna Kowalski' });

		expect(matchesAllocationQuery(seat, makeQuery({ q: 'ANNA' }))).toBe(true);
	});

	it('leaves out a seat that nothing on it was searched for', () => {
		const seat = makeGridSeat('seat-france', { name: 'France' });

		expect(matchesAllocationQuery(seat, makeQuery({ q: 'brazil' }))).toBe(false);
	});

	it('asks two filters at once, so a seat must survive both', () => {
		const seat = makeGridSeat('seat-france', {
			committee: SECURITY_COUNCIL,
			userId: 'user-anna',
			holderName: 'Anna Kowalski'
		});
		const both = makeQuery({ committee: SECURITY_COUNCIL.id, state: 'filled' });
		const wrongState = makeQuery({ committee: SECURITY_COUNCIL.id, state: 'free' });

		expect(matchesAllocationQuery(seat, both)).toBe(true);
		expect(matchesAllocationQuery(seat, wrongState)).toBe(false);
	});
});

describe('buildSeatColumns', () => {
	it('draws one column per committee, in the order they were given in', () => {
		const committees = [SECURITY_COUNCIL, HUMAN_RIGHTS_COUNCIL];
		const seats = [
			makeGridSeat('seat-france', { committee: SECURITY_COUNCIL }),
			makeGridSeat('seat-japan', { committee: HUMAN_RIGHTS_COUNCIL })
		];

		const columns = buildSeatColumns(committees, seats, EMPTY_ALLOCATION_QUERY);

		expect(columns.map((column) => column.committee.id)).toEqual([
			SECURITY_COUNCIL.id,
			HUMAN_RIGHTS_COUNCIL.id
		]);
	});

	// The page prints "No seats." inside the column, which is how an organiser
	// finds out that a committee still needs some.
	it('keeps a column for a committee with no seats at all', () => {
		const committees = [SECURITY_COUNCIL, HUMAN_RIGHTS_COUNCIL];
		const seats = [makeGridSeat('seat-france', { committee: SECURITY_COUNCIL })];

		const columns = buildSeatColumns(committees, seats, EMPTY_ALLOCATION_QUERY);

		expect(columns).toHaveLength(2);
		expect(columns[1].seats).toEqual([]);
		expect(columns[1].totalCount).toBe(0);
	});

	it('narrows to one column when a committee was asked for', () => {
		const committees = [SECURITY_COUNCIL, HUMAN_RIGHTS_COUNCIL];
		const seats = [
			makeGridSeat('seat-france', { committee: SECURITY_COUNCIL }),
			makeGridSeat('seat-japan', { committee: HUMAN_RIGHTS_COUNCIL })
		];
		const query = makeQuery({ committee: HUMAN_RIGHTS_COUNCIL.id });

		const columns = buildSeatColumns(committees, seats, query);

		expect(columns).toHaveLength(1);
		expect(columns[0].committee.id).toBe(HUMAN_RIGHTS_COUNCIL.id);
	});

	it('shows only the seats that matched the filters', () => {
		const seats = [
			makeGridSeat('seat-france', { name: 'France' }),
			makeGridSeat('seat-china', { name: 'China' })
		];

		const columns = buildSeatColumns([SECURITY_COUNCIL], seats, makeQuery({ q: 'china' }));

		expect(columns[0].seats.map((seat) => seat.id)).toEqual(['seat-china']);
	});

	// The heading must not move while the organiser is typing in the search box.
	it('counts every seat of the committee in the heading, filtered or not', () => {
		const seats = [
			makeGridSeat('seat-france', { name: 'France', userId: 'user-anna' }),
			makeGridSeat('seat-china', { name: 'China', userId: 'user-ben' }),
			makeGridSeat('seat-brazil', { name: 'Brazil' })
		];

		const columns = buildSeatColumns([SECURITY_COUNCIL], seats, makeQuery({ q: 'china' }));

		expect(columns[0].seats).toHaveLength(1);
		expect(columns[0].totalCount).toBe(3);
		expect(columns[0].filledCount).toBe(2);
	});

	it('counts a hidden seat in the total but not among the filled ones', () => {
		const seats = [
			makeGridSeat('seat-france', { isAvailable: false, userId: 'user-anna' }),
			makeGridSeat('seat-china', { userId: 'user-ben' })
		];

		const columns = buildSeatColumns([SECURITY_COUNCIL], seats, EMPTY_ALLOCATION_QUERY);

		expect(columns[0].totalCount).toBe(2);
		expect(columns[0].filledCount).toBe(1);
	});
});

describe('seatColumnHeading', () => {
	it('names the committee by its short name', () => {
		const seats = [makeGridSeat('seat-france'), makeGridSeat('seat-china')];
		const columns = buildSeatColumns([SECURITY_COUNCIL], seats, EMPTY_ALLOCATION_QUERY);

		expect(seatColumnHeading(columns[0])).toBe('UNSC');
	});

	it('falls back to the full name for a committee with no short one', () => {
		const seats = [makeGridSeat('seat-crisis', { committee: CRISIS_CABINET })];
		const columns = buildSeatColumns([CRISIS_CABINET], seats, EMPTY_ALLOCATION_QUERY);

		expect(seatColumnHeading(columns[0])).toBe('Crisis Cabinet');
	});
});

describe('seatColumnCounts', () => {
	it('says how many of the committee seats are filled', () => {
		const seats = [
			makeGridSeat('seat-france', { userId: 'user-anna' }),
			makeGridSeat('seat-china'),
			makeGridSeat('seat-brazil')
		];
		const columns = buildSeatColumns([SECURITY_COUNCIL], seats, EMPTY_ALLOCATION_QUERY);

		expect(seatColumnCounts(columns[0])).toBe('1 of 3 filled');
	});
});

describe('seatsAvailableFor', () => {
	/** A delegate who won their seat with an application of their own. */
	const INDIVIDUAL_SEAT = makeGridSeat('seat-france', {
		name: 'France',
		userId: 'user-anna',
		holderName: 'Anna Kowalski',
		applicationId: 'application-anna'
	});

	it('offers an individual every free seat, grouped by committee', () => {
		const committees = [SECURITY_COUNCIL, HUMAN_RIGHTS_COUNCIL];
		const seats = [
			INDIVIDUAL_SEAT,
			makeGridSeat('seat-china', { committee: SECURITY_COUNCIL }),
			makeGridSeat('seat-japan', { committee: HUMAN_RIGHTS_COUNCIL })
		];

		const groups = seatsAvailableFor(INDIVIDUAL_SEAT, committees, seats);

		expect(groups.map((group) => group.committeeId)).toEqual([
			SECURITY_COUNCIL.id,
			HUMAN_RIGHTS_COUNCIL.id
		]);
		expect(groups[0].seats.map((seat) => seat.id)).toEqual(['seat-china']);
		expect(groups[0].committeeLabel).toBe('UNSC');
	});

	it('never offers an individual a hidden, a filled or a reserved seat', () => {
		const seats = [
			INDIVIDUAL_SEAT,
			makeGridSeat('seat-hidden', { isAvailable: false }),
			makeGridSeat('seat-filled', { userId: 'user-ben' }),
			makeGridSeat('seat-reserved', {
				delegationId: 'delegation-lycee',
				delegationName: 'Lycée Français'
			}),
			makeGridSeat('seat-free')
		];

		const groups = seatsAvailableFor(INDIVIDUAL_SEAT, [SECURITY_COUNCIL], seats);

		expect(groups).toHaveLength(1);
		expect(groups[0].seats.map((seat) => seat.id)).toEqual(['seat-free']);
	});

	// `move_delegate` leaves `delegation_id` where it is, so moving a member into
	// a seat their delegation does not hold would take a seat away from the
	// delegation without saying so.
	it('offers a delegation member only the empty seats of their own delegation', () => {
		const committees = [SECURITY_COUNCIL, HUMAN_RIGHTS_COUNCIL];
		const memberSeat = makeGridSeat('seat-france', {
			delegationId: 'delegation-lycee',
			delegationName: 'Lycée Français',
			userId: 'user-anna',
			holderName: 'Anna Kowalski'
		});
		const seats = [
			memberSeat,
			makeGridSeat('seat-china', {
				delegationId: 'delegation-lycee',
				delegationName: 'Lycée Français'
			}),
			makeGridSeat('seat-japan', {
				committee: HUMAN_RIGHTS_COUNCIL,
				delegationId: 'delegation-lycee',
				delegationName: 'Lycée Français'
			}),
			makeGridSeat('seat-brazil')
		];

		const groups = seatsAvailableFor(memberSeat, committees, seats);

		expect(groups.map((group) => group.committeeId)).toEqual([
			SECURITY_COUNCIL.id,
			HUMAN_RIGHTS_COUNCIL.id
		]);
		expect(groups[0].seats.map((seat) => seat.id)).toEqual(['seat-china']);
		expect(groups[1].seats.map((seat) => seat.id)).toEqual(['seat-japan']);
	});

	it('never offers a delegation member a free seat that no delegation holds', () => {
		const memberSeat = makeGridSeat('seat-france', {
			delegationId: 'delegation-lycee',
			userId: 'user-anna'
		});
		const seats = [memberSeat, makeGridSeat('seat-brazil')];

		expect(seatsAvailableFor(memberSeat, [SECURITY_COUNCIL], seats)).toEqual([]);
	});

	it('never offers a delegation member a seat of another delegation', () => {
		const memberSeat = makeGridSeat('seat-france', {
			delegationId: 'delegation-lycee',
			userId: 'user-anna'
		});
		const seats = [memberSeat, makeGridSeat('seat-china', { delegationId: 'delegation-warsaw' })];

		expect(seatsAvailableFor(memberSeat, [SECURITY_COUNCIL], seats)).toEqual([]);
	});

	it('never offers a delegation member the seat they are already in', () => {
		const memberSeat = makeGridSeat('seat-france', {
			delegationId: 'delegation-lycee',
			userId: 'user-anna'
		});

		expect(seatsAvailableFor(memberSeat, [SECURITY_COUNCIL], [memberSeat])).toEqual([]);
	});

	it('never offers a delegation seat somebody else is in, or one that is hidden', () => {
		const memberSeat = makeGridSeat('seat-france', {
			delegationId: 'delegation-lycee',
			userId: 'user-anna'
		});
		const seats = [
			memberSeat,
			makeGridSeat('seat-china', { delegationId: 'delegation-lycee', userId: 'user-ben' }),
			makeGridSeat('seat-brazil', { delegationId: 'delegation-lycee', isAvailable: false }),
			makeGridSeat('seat-japan', { delegationId: 'delegation-lycee' })
		];

		const groups = seatsAvailableFor(memberSeat, [SECURITY_COUNCIL], seats);

		expect(groups[0].seats.map((seat) => seat.id)).toEqual(['seat-japan']);
	});
});

/*
 * `seatsAvailableFor` above is a filter over this, so the grouping tests cover
 * most of it. What is left is the half `seatsAvailableFor` cannot answer: the
 * move action asks about one seat that arrived in a posted form, which nothing
 * says came from the picker.
 */
describe('canMoveInto', () => {
	const INDIVIDUAL_SEAT = makeGridSeat('seat-france', { userId: 'user-anna' });

	const MEMBER_SEAT = makeGridSeat('seat-france', {
		delegationId: 'delegation-lycee',
		userId: 'user-anna'
	});

	it('lets an individual move into a free seat', () => {
		expect(canMoveInto(INDIVIDUAL_SEAT, makeGridSeat('seat-brazil'))).toBe(true);
	});

	it('refuses a seat that is not free, whoever is moving', () => {
		const takenSeat = makeGridSeat('seat-brazil', { userId: 'user-ben' });

		expect(canMoveInto(INDIVIDUAL_SEAT, takenSeat)).toBe(false);
	});

	// The one a posted form could otherwise slip past: it would leave the
	// delegation a seat short, because `move_delegate` never moves `delegation_id`.
	it('refuses a delegation member a free seat no delegation holds', () => {
		expect(canMoveInto(MEMBER_SEAT, makeGridSeat('seat-brazil'))).toBe(false);
	});

	it('lets a delegation member move into an empty seat of their own delegation', () => {
		const sisterSeat = makeGridSeat('seat-brazil', { delegationId: 'delegation-lycee' });

		expect(canMoveInto(MEMBER_SEAT, sisterSeat)).toBe(true);
	});
});

describe('canSwapWith', () => {
	const ANNA_SEAT = makeGridSeat('seat-france', { userId: 'user-anna' });

	it('lets two individual delegates trade seats', () => {
		const benSeat = makeGridSeat('seat-brazil', { userId: 'user-ben' });

		expect(canSwapWith(ANNA_SEAT, benSeat)).toBe(true);
	});

	it('refuses a seat nobody is in, which is a move rather than a swap', () => {
		expect(canSwapWith(ANNA_SEAT, makeGridSeat('seat-brazil'))).toBe(false);
	});

	it('refuses the seat the delegate is already in', () => {
		expect(canSwapWith(ANNA_SEAT, ANNA_SEAT)).toBe(false);
	});

	// `swap_delegates` leaves `delegation_id` with the seat, so this trade would
	// move a seat out of the delegation.
	it('refuses a delegation member and an individual', () => {
		const memberSeat = makeGridSeat('seat-brazil', {
			delegationId: 'delegation-lycee',
			userId: 'user-ben'
		});

		expect(canSwapWith(ANNA_SEAT, memberSeat)).toBe(false);
	});

	it('lets two members of the same delegation trade seats', () => {
		const firstMember = makeGridSeat('seat-france', {
			delegationId: 'delegation-lycee',
			userId: 'user-anna'
		});
		const secondMember = makeGridSeat('seat-brazil', {
			delegationId: 'delegation-lycee',
			userId: 'user-ben'
		});

		expect(canSwapWith(firstMember, secondMember)).toBe(true);
	});
});

describe('delegatesSwappedFlash', () => {
	it('names both delegates', () => {
		expect(delegatesSwappedFlash('Anna Kowalski', 'Ben Lee')).toBe(
			'Anna Kowalski and Ben Lee swapped seats.'
		);
	});
});

describe('seatFreedFlash', () => {
	it('says a delegation keeps the seat when its member is unassigned', () => {
		const seat = makeGridSeat('seat-france', {
			delegationId: 'delegation-lycee',
			delegationName: 'Lycée Français',
			userId: 'user-anna',
			holderName: 'Anna Kowalski'
		});

		expect(seatFreedFlash(seat, false)).toBe(
			'Member unassigned; the seat stays reserved for Lycée Français.'
		);
	});

	it('leaves the delegation out of that sentence when its name is missing', () => {
		const seat = makeGridSeat('seat-france', {
			delegationId: 'delegation-lycee',
			delegationName: null,
			userId: 'user-anna'
		});

		expect(seatFreedFlash(seat, false)).toBe('The member was unassigned; the seat stays reserved.');
	});

	it('warns that a paid invoice is the organiser to refund', () => {
		const seat = makeGridSeat('seat-france', {
			userId: 'user-anna',
			holderName: 'Anna Kowalski',
			applicationId: 'application-anna'
		});

		expect(seatFreedFlash(seat, true)).toBe(
			'Seat freed. The paid invoice is untouched, so refund it on the fees page if you mean to.'
		);
	});

	it('says an unpaid invoice was voided with the seat', () => {
		const seat = makeGridSeat('seat-france', {
			userId: 'user-anna',
			applicationId: 'application-anna'
		});

		expect(seatFreedFlash(seat, false)).toBe('Seat freed and the unpaid invoice voided.');
		// A reader who may not read invoices is told nothing about them.
		expect(seatFreedFlash(seat, null)).toBe('Seat freed.');
	});

	it('says a reserved seat with nobody in it is no longer reserved', () => {
		const seat = makeGridSeat('seat-france', {
			delegationId: 'delegation-lycee',
			delegationName: 'Lycée Français'
		});

		expect(seatFreedFlash(seat, false)).toBe('The seat is no longer reserved for Lycée Français.');
	});

	it('leaves the delegation out of that sentence too when its name is missing', () => {
		const seat = makeGridSeat('seat-france', {
			delegationId: 'delegation-lycee',
			delegationName: null
		});

		expect(seatFreedFlash(seat, false)).toBe('The seat is no longer reserved.');
	});
});

describe('delegateMovedFlash', () => {
	it('says who went where', () => {
		const seat = makeGridSeat('seat-brazil', { name: 'Brazil', committee: HUMAN_RIGHTS_COUNCIL });

		expect(delegateMovedFlash('Anna Kowalski', seat)).toBe('Anna Kowalski moved to Brazil in HRC.');
	});

	it('names a committee with no short name in full', () => {
		const seat = makeGridSeat('seat-brazil', { name: 'Brazil', committee: CRISIS_CABINET });

		expect(delegateMovedFlash('Anna Kowalski', seat)).toBe(
			'Anna Kowalski moved to Brazil in Crisis Cabinet.'
		);
	});
});

describe('seatVisibilityFlash', () => {
	it('says a seat is hidden', () => {
		expect(seatVisibilityFlash(false)).toBe('Seat hidden.');
	});

	it('says a seat is on offer again', () => {
		expect(seatVisibilityFlash(true)).toBe('Seat available again.');
	});
});
