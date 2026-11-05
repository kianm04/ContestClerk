import { describe, expect, it } from 'vitest';
import {
	committeeHeading,
	hasConferenceFinished,
	mergeMyCommittees,
	myCommitteeRoleLabel,
	nextEventLine,
	summariseManagedSeats,
	summariseSeats,
	withoutFinishedConferences,
	type Committee,
	type ManagedSeat,
	type MyCommitteeConference,
	type MyCommitteeEvent,
	type MyCommitteeMembership,
	type MyCommitteeRole,
	type MyCommitteeSeat,
	type PublicSeat
} from './committees';

/**
 * One committee every test starts from.
 *
 * Tests spread it and change only the field they are about, so each test says
 * what matters about its own case and nothing else.
 */
const SECURITY_COUNCIL: Committee = {
	id: '22222222-2222-2222-2222-222222222222',
	slug: 'unsc',
	name: 'United Nations Security Council',
	abbreviation: 'UNSC',
	description: 'The council that keeps international peace and security.',
	topics: ['Climate finance', 'Peacekeeping mandates'],
	level: 'advanced',
	room: 'Committee Room 1'
};

/**
 * One seat, built from its name and whether somebody has it, so that a test
 * about counting does not have to write out six fields it does not care about.
 */
function makeSeat(name: string, isTaken: boolean): PublicSeat {
	return {
		id: `seat-${name.toLowerCase()}`,
		name,
		kind: 'country',
		countryCode: null,
		position: 1,
		isTaken,
		isReserved: false,
		reservedForName: null,
		holderName: null,
		holderAvatarPath: null
	};
}

describe('summariseSeats', () => {
	it('counts nothing for a committee with no seats yet', () => {
		expect(summariseSeats([])).toEqual({ taken: 0, total: 0 });
	});

	it('counts every seat as free when nobody has one', () => {
		const seats = [makeSeat('France', false), makeSeat('China', false)];

		expect(summariseSeats(seats)).toEqual({ taken: 0, total: 2 });
	});

	it('counts only the taken seats against the total', () => {
		const seats = [
			makeSeat('France', true),
			makeSeat('China', false),
			makeSeat('Brazil', true),
			makeSeat('Kenya', false)
		];

		expect(summariseSeats(seats)).toEqual({ taken: 2, total: 4 });
	});
});

describe('committeeHeading', () => {
	it('leads with the short name when the committee has one', () => {
		expect(committeeHeading(SECURITY_COUNCIL)).toBe('UNSC');
	});

	it('falls back to the full name when there is no short one', () => {
		const withoutAbbreviation: Committee = { ...SECURITY_COUNCIL, abbreviation: null };

		expect(committeeHeading(withoutAbbreviation)).toBe('United Nations Security Council');
	});
});

/*
 * The rest of this file covers the organiser's own view of a committee: the
 * counts and the warnings on a row of `/manage/[slug]/committees`.
 */

/**
 * One seat of the organiser's table. A test says only what its case is about —
 * whether somebody holds the seat, which delegation it is held for, whether it
 * is hidden — and the fields it does not care about are filled in here.
 */
function makeManagedSeat(name: string, changes: Partial<ManagedSeat> = {}): ManagedSeat {
	return {
		id: `seat-${name.toLowerCase()}`,
		name,
		kind: 'country',
		countryCode: null,
		position: 1,
		isAvailable: true,
		isFilled: false,
		isReserved: false,
		holderName: null,
		delegationName: null,
		...changes
	};
}

describe('summariseManagedSeats', () => {
	it('counts nothing for a committee with no seats yet', () => {
		expect(summariseManagedSeats([])).toEqual({
			available: 0,
			filled: 0,
			reserved: 0,
			total: 0
		});
	});

	it('counts a free seat as available and nothing else', () => {
		const seats = [makeManagedSeat('France'), makeManagedSeat('China')];

		expect(summariseManagedSeats(seats)).toEqual({
			available: 2,
			filled: 0,
			reserved: 0,
			total: 2
		});
	});

	it('counts a seat with somebody in it as filled', () => {
		const seats = [makeManagedSeat('France', { isFilled: true, holderName: 'Amélie Dupont' })];

		expect(summariseManagedSeats(seats).filled).toBe(1);
	});

	it('counts a filled seat whose delegate has no name to show as filled', () => {
		// A delegate's name comes from a second query against `profiles`, and an
		// account made before the `handle_new_user` trigger existed has no row
		// there. The seat is still held, and counting it as free would tell the
		// organiser they may delete it.
		const seats = [makeManagedSeat('France', { isFilled: true, holderName: null })];

		expect(summariseManagedSeats(seats).filled).toBe(1);
	});

	it('counts a seat held for a delegation that has named nobody as reserved', () => {
		const seats = [
			makeManagedSeat('France', { isReserved: true, delegationName: 'Lyceum Alpinum' })
		];

		expect(summariseManagedSeats(seats).reserved).toBe(1);
	});

	it('counts a delegation seat that has been filled as filled and not as reserved', () => {
		const seats = [
			makeManagedSeat('France', {
				isFilled: true,
				delegationName: 'Lyceum Alpinum',
				holderName: 'Amélie Dupont'
			})
		];
		const counts = summariseManagedSeats(seats);

		expect(counts.filled).toBe(1);
		expect(counts.reserved).toBe(0);
	});

	it('leaves a hidden seat out of the available ones but still counts it in the total', () => {
		const seats = [makeManagedSeat('France'), makeManagedSeat('China', { isAvailable: false })];
		const counts = summariseManagedSeats(seats);

		expect(counts.available).toBe(1);
		expect(counts.total).toBe(2);
	});

	it('counts rows carrying only the three fields it reads', () => {
		// The committees list counts the seats of every committee at once and
		// fetches no more of each seat than this, so it never has whole seats.
		const rows = [
			{ isAvailable: true, isFilled: true, isReserved: false },
			{ isAvailable: true, isFilled: false, isReserved: true },
			{ isAvailable: false, isFilled: false, isReserved: false }
		];

		expect(summariseManagedSeats(rows)).toEqual({
			available: 2,
			filled: 1,
			reserved: 1,
			total: 3
		});
	});

	it('counts a whole committee of mixed seats', () => {
		const seats = [
			makeManagedSeat('France', { isFilled: true, holderName: 'Amélie Dupont' }),
			makeManagedSeat('China', { isFilled: true, holderName: 'Li Wei' }),
			makeManagedSeat('Brazil', { isReserved: true, delegationName: 'Lyceum Alpinum' }),
			makeManagedSeat('Kenya'),
			makeManagedSeat('Peru', { isAvailable: false })
		];

		expect(summariseManagedSeats(seats)).toEqual({
			available: 4,
			filled: 2,
			reserved: 1,
			total: 5
		});
	});
});

/*
 * Everything below belongs to the reader's own committee list, `/committees`.
 */

/** One conference every test of that list starts from. */
const DELFT_MUN: MyCommitteeConference = {
	id: '33333333-3333-3333-3333-333333333333',
	name: 'DelftMUN 2026',
	slug: 'delftmun-2026',
	startDate: '2026-02-12',
	endDate: '2026-02-15',
	timezone: 'Europe/Amsterdam',
	isArchived: false
};

/** A second conference, later in the year, for the tests about ordering. */
const LSE_MUN: MyCommitteeConference = {
	id: '44444444-4444-4444-4444-444444444444',
	name: 'LSE MUN 2026',
	slug: 'lse-mun-2026',
	startDate: '2026-06-01',
	endDate: '2026-06-04',
	timezone: 'Europe/London',
	isArchived: false
};

/**
 * One membership, built from the few things each test is about, so that a test
 * about ordering does not have to write out a whole committee and conference.
 */
function makeMembership(
	committeeName: string,
	options: {
		position?: number;
		role?: MyCommitteeRole;
		conference?: MyCommitteeConference;
		seat?: MyCommitteeSeat | null;
	} = {}
): MyCommitteeMembership {
	return {
		committee: {
			// The id is built from the name, so that a seat and a chair role written
			// with the same name are the same committee. That is exactly what
			// `mergeMyCommittees` has to notice.
			id: `committee-${committeeName.toLowerCase()}`,
			name: committeeName,
			abbreviation: null,
			slug: committeeName.toLowerCase(),
			room: null,
			position: options.position ?? 1
		},
		conference: options.conference ?? DELFT_MUN,
		role: options.role ?? 'delegate',
		seat: options.seat ?? null
	};
}

/** The names of the committees in a list, in the order the list holds them. */
function committeeNamesOf(memberships: MyCommitteeMembership[]): string[] {
	return memberships.map((membership) => membership.committee.name);
}

describe('myCommitteeRoleLabel', () => {
	it('has a word for each of the two roles', () => {
		expect(myCommitteeRoleLabel('delegate')).toBe('Delegate');
		expect(myCommitteeRoleLabel('chair')).toBe('Chair');
	});
});

describe('mergeMyCommittees', () => {
	it('shows nothing for somebody who is in no committee at all', () => {
		expect(mergeMyCommittees([], [])).toEqual([]);
	});

	it('puts the conference that starts first at the top', () => {
		const ecofin = makeMembership('ECOFIN', { conference: LSE_MUN });
		const unsc = makeMembership('UNSC', { conference: DELFT_MUN });

		const merged = mergeMyCommittees([ecofin, unsc], []);

		expect(committeeNamesOf(merged)).toEqual(['UNSC', 'ECOFIN']);
	});

	it('orders the committees of one conference the way the organiser did', () => {
		const third = makeMembership('WHO', { position: 3 });
		const first = makeMembership('UNSC', { position: 1 });
		const second = makeMembership('ECOFIN', { position: 2 });

		const merged = mergeMyCommittees([third, first, second], []);

		expect(committeeNamesOf(merged)).toEqual(['UNSC', 'ECOFIN', 'WHO']);
	});

	it('lists a seat and a chair role of different committees side by side', () => {
		const seat = makeMembership('UNSC', { position: 1 });
		const chairRole = makeMembership('ECOFIN', { role: 'chair', position: 2 });

		const merged = mergeMyCommittees([seat], [chairRole]);

		expect(committeeNamesOf(merged)).toEqual(['UNSC', 'ECOFIN']);
		expect(merged[1].role).toBe('chair');
	});

	it('gives one row, the seat, to a committee somebody both sits in and chairs', () => {
		const seat = makeMembership('UNSC', { seat: { name: 'France', countryCode: 'FR' } });
		const chairRole = makeMembership('UNSC', { role: 'chair' });

		const merged = mergeMyCommittees([seat], [chairRole]);

		expect(merged).toHaveLength(1);
		expect(merged[0].role).toBe('delegate');
		expect(merged[0].seat).toEqual({ name: 'France', countryCode: 'FR' });
	});

	it('leaves the two lists it was given in the order they arrived', () => {
		const seats = [makeMembership('WHO', { position: 3 }), makeMembership('UNSC', { position: 1 })];
		const chairRoles = [makeMembership('ECOFIN', { role: 'chair', position: 2 })];

		mergeMyCommittees(seats, chairRoles);

		expect(committeeNamesOf(seats)).toEqual(['WHO', 'UNSC']);
		expect(committeeNamesOf(chairRoles)).toEqual(['ECOFIN']);
	});
});

describe('hasConferenceFinished', () => {
	it('is over once the organisers have archived it, whatever its dates say', () => {
		const archived = { ...DELFT_MUN, isArchived: true };

		expect(hasConferenceFinished(archived, new Date('2026-01-01T12:00:00Z'))).toBe(true);
	});

	it('is over the day after the last one', () => {
		expect(hasConferenceFinished(DELFT_MUN, new Date('2026-02-16T09:00:00Z'))).toBe(true);
	});

	it('is not over on the last day itself', () => {
		expect(hasConferenceFinished(DELFT_MUN, new Date('2026-02-15T09:00:00Z'))).toBe(false);
	});

	it('is not over before it has even started', () => {
		expect(hasConferenceFinished(DELFT_MUN, new Date('2026-02-01T09:00:00Z'))).toBe(false);
	});

	it('counts the day in the conference timezone when that is already tomorrow', () => {
		// New Zealand runs thirteen hours ahead of UTC in February, so this moment
		// is the sixteenth in Auckland while it is still the fifteenth in London.
		const inAuckland = { ...DELFT_MUN, timezone: 'Pacific/Auckland' };

		expect(hasConferenceFinished(inAuckland, new Date('2026-02-15T20:00:00Z'))).toBe(true);
	});

	it('counts the day in the conference timezone when that is still yesterday', () => {
		// Hawaii runs ten hours behind UTC, so this moment is still the last day of
		// the conference there although the sixteenth has begun in London.
		const inHonolulu = { ...DELFT_MUN, timezone: 'Pacific/Honolulu' };

		expect(hasConferenceFinished(inHonolulu, new Date('2026-02-16T05:00:00Z'))).toBe(false);
	});
});

describe('withoutFinishedConferences', () => {
	it('keeps the conferences that are still to come and drops the ones that are over', () => {
		const finished = makeMembership('UNSC', { conference: DELFT_MUN });
		const stillToCome = makeMembership('ECOFIN', { conference: LSE_MUN });

		const kept = withoutFinishedConferences(
			[finished, stillToCome],
			new Date('2026-03-01T09:00:00Z')
		);

		expect(committeeNamesOf(kept)).toEqual(['ECOFIN']);
	});

	it('drops an archived conference whose dates are still ahead', () => {
		const archived = makeMembership('UNSC', {
			conference: { ...LSE_MUN, isArchived: true }
		});

		const kept = withoutFinishedConferences([archived], new Date('2026-03-01T09:00:00Z'));

		expect(kept).toEqual([]);
	});

	it('keeps everything while every conference is still ahead', () => {
		const memberships = [
			makeMembership('UNSC', { conference: DELFT_MUN }),
			makeMembership('ECOFIN', { conference: LSE_MUN })
		];

		const kept = withoutFinishedConferences(memberships, new Date('2026-01-01T09:00:00Z'));

		expect(committeeNamesOf(kept)).toEqual(['UNSC', 'ECOFIN']);
	});
});

describe('nextEventLine', () => {
	/** The session the tests below write a line about. */
	const SESSION_ONE: MyCommitteeEvent = {
		title: 'Session I',
		startsAt: '2026-02-13T09:30:00Z',
		endsAt: '2026-02-13T11:00:00Z'
	};

	it('has no line at all for a committee with nothing coming up', () => {
		expect(nextEventLine(null, 'Europe/Amsterdam', new Date('2026-02-12T12:00:00Z'))).toBe(null);
	});

	it('names the session, the day and the time', () => {
		const line = nextEventLine(SESSION_ONE, 'Europe/Amsterdam', new Date('2026-02-12T12:00:00Z'));

		expect(line).toBe('Next: Session I · Tomorrow 10:30 – 12:00');
	});

	it('writes the date out for a session further off than tomorrow', () => {
		const line = nextEventLine(SESSION_ONE, 'Europe/Amsterdam', new Date('2026-02-01T12:00:00Z'));

		expect(line).toBe('Next: Session I · 13 Feb 2026 10:30 – 12:00');
	});

	it('reads the day and the time in the conference timezone', () => {
		// The same moment as the "Tomorrow" test above. In Auckland the session
		// starts late on a day that has already begun, so both halves of the line
		// come out differently from the Amsterdam reading.
		const line = nextEventLine(SESSION_ONE, 'Pacific/Auckland', new Date('2026-02-12T12:00:00Z'));

		expect(line).toBe('Next: Session I · Today 22:30 – 00:00');
	});
});
