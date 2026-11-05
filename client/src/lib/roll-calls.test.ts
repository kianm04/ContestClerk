import { describe, expect, it } from 'vitest';
import {
	attendanceOfSeats,
	chooseShownRollCallId,
	describeRollCall,
	earlierRollCalls,
	readAttendanceStatus,
	readRollCallFrom,
	rollCallCounts,
	type RollCallSummary
} from './roll-calls';

/** A roll call of the session, taken at `takenAt`. */
function rollCall(id: string, takenAt: string, presentCount = 0): RollCallSummary {
	return { id, takenAt, takenByName: 'Chair Person', presentCount };
}

// Newest first, the way `listRollCalls` returns them.
const ROLL_CALLS = [
	rollCall('roll-3', '2026-02-14T10:05:00Z', 12),
	rollCall('roll-2', '2026-02-14T09:30:00Z', 11),
	rollCall('roll-1', '2026-02-14T09:02:00Z', 10)
];

describe('rollCallCounts', () => {
	it('counts each answer on its own, so the three add up to every seat', () => {
		const counts = rollCallCounts({
			france: 'present',
			ghana: 'present_and_voting',
			japan: 'absent',
			kenya: 'present'
		});

		expect(counts).toEqual({ presentCount: 2, presentAndVotingCount: 1, absentCount: 1 });
	});

	it('is all zeros for a roll call with no seats', () => {
		expect(rollCallCounts({})).toEqual({
			presentCount: 0,
			presentAndVotingCount: 0,
			absentCount: 0
		});
	});
});

describe('readAttendanceStatus', () => {
	it('reads the three answers', () => {
		expect(readAttendanceStatus('absent')).toBe('absent');
		expect(readAttendanceStatus('present')).toBe('present');
		expect(readAttendanceStatus('present_and_voting')).toBe('present_and_voting');
	});

	it('refuses anything else', () => {
		expect(readAttendanceStatus('late')).toBeNull();
		expect(readAttendanceStatus('')).toBeNull();
		expect(readAttendanceStatus(null)).toBeNull();
	});
});

describe('chooseShownRollCallId', () => {
	it('shows the roll call the address asks for when it is one of the session’s', () => {
		expect(chooseShownRollCallId(ROLL_CALLS, 'roll-2')).toBe('roll-2');
	});

	it('shows the latest when the address names none, or one from elsewhere', () => {
		expect(chooseShownRollCallId(ROLL_CALLS, null)).toBe('roll-3');
		expect(chooseShownRollCallId(ROLL_CALLS, 'another-session')).toBe('roll-3');
	});

	it('shows nothing before the session’s first roll call', () => {
		expect(chooseShownRollCallId([], 'roll-1')).toBeNull();
	});
});

describe('earlierRollCalls', () => {
	it('lists every roll call but the one being edited, newest first', () => {
		const earlier = earlierRollCalls(ROLL_CALLS, 'roll-3');

		expect(earlier.map((entry) => entry.id)).toEqual(['roll-2', 'roll-1']);
	});
});

describe('attendanceOfSeats', () => {
	const seats = [
		{ id: 'france', name: 'France', countryCode: 'FR' },
		{ id: 'ghana', name: 'Ghana', countryCode: 'GH' }
	];

	it('marks a seat without an entry absent and drops entries of unlisted seats', () => {
		const marks = attendanceOfSeats(seats, { france: 'present', gone: 'present' });

		expect(marks).toEqual({ france: 'present', ghana: 'absent' });
	});
});

describe('readRollCallFrom', () => {
	it('names the chair page the view was opened from', () => {
		expect(readRollCallFrom('gsl')).toBe('gsl');
		expect(readRollCallFrom('motions')).toBe('motions');
		expect(readRollCallFrom('papers')).toBe('papers');
	});

	it('means the live room for nothing, anything unknown, or the roll call itself', () => {
		expect(readRollCallFrom(null)).toBe('chair');
		expect(readRollCallFrom('elsewhere')).toBe('chair');
		expect(readRollCallFrom('roll-call')).toBe('chair');
	});
});

describe('describeRollCall', () => {
	it('gives one roll call’s time in the conference timezone and its present count', () => {
		expect(describeRollCall(ROLL_CALLS[2], 'Europe/Amsterdam')).toBe('10:02 (10 present)');
	});
});
