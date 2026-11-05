import { describe, expect, it } from 'vitest';
import {
	hasMotionCount,
	motionCountLine,
	motionCountRefusal,
	motionDecision,
	motionPresentCount,
	type MotionCountFacts
} from './motion-count';
import { MOTION_REFUSALS } from './motions';

/** Thirteen seats present, so seven for pass the motion, and nothing counted yet. */
const UNCOUNTED: MotionCountFacts = {
	votesFor: null,
	votesAgainst: null,
	presentCount: 13,
	majority: 7,
	hasRollCall: true
};

describe('hasMotionCount', () => {
	it('is false until either count is entered', () => {
		expect(hasMotionCount(UNCOUNTED)).toBe(false);
		expect(hasMotionCount({ ...UNCOUNTED, votesFor: 0 })).toBe(true);
		expect(hasMotionCount({ ...UNCOUNTED, votesAgainst: 4 })).toBe(true);
	});
});

describe('motionCountLine', () => {
	it('says only what passing takes before any count', () => {
		expect(motionCountLine(UNCOUNTED)).toEqual({
			majority: 'Passes with 7 for, a simple majority of the 13 present.',
			verdict: null,
			rollCallNote: null
		});
	});

	it('adds how the count comes out once one is entered', () => {
		const passing = motionCountLine({ ...UNCOUNTED, votesFor: 7, votesAgainst: 6 });
		const failing = motionCountLine({ ...UNCOUNTED, votesFor: 4, votesAgainst: 9 });

		expect(passing.verdict).toBe('As counted, it passes.');
		expect(failing.verdict).toBe('As counted, it fails.');
	});

	it('counts an empty field as 0 once the other is filled', () => {
		expect(motionCountLine({ ...UNCOUNTED, votesAgainst: 3 }).verdict).toBe(
			'As counted, it fails.'
		);
	});

	it('speaks of seats and notes it before the first roll call, never as a warning', () => {
		const line = motionCountLine({
			...UNCOUNTED,
			presentCount: 15,
			majority: 8,
			hasRollCall: false
		});

		expect(line.majority).toBe('Passes with 8 for, a simple majority of the 15 seats.');
		expect(line.rollCallNote).toBe('No roll call yet.');
	});
});

describe('motionDecision', () => {
	it('fills neither button and disables neither without a count', () => {
		expect(motionDecision(UNCOUNTED)).toEqual({ primary: null, disabled: null, reason: null });
	});

	it('makes Pass the primary when the count passes, and says why Fail is disabled', () => {
		expect(motionDecision({ ...UNCOUNTED, votesFor: 9, votesAgainst: 4 })).toEqual({
			primary: 'pass',
			disabled: 'fail',
			reason: '9 for is enough to pass'
		});
	});

	it('passes with exactly the majority', () => {
		expect(motionDecision({ ...UNCOUNTED, votesFor: 7, votesAgainst: 6 }).primary).toBe('pass');
	});

	it('makes Fail the primary when the count falls short, and says by how much', () => {
		expect(motionDecision({ ...UNCOUNTED, votesFor: 4, votesAgainst: 9 })).toEqual({
			primary: 'fail',
			disabled: 'pass',
			reason: '4 for is short of 7'
		});
	});

	it('reads an empty For as 0 when only Against is counted', () => {
		expect(motionDecision({ ...UNCOUNTED, votesAgainst: 2 }).reason).toBe('0 for is short of 7');
	});
});

describe('motionPresentCount', () => {
	it('counts the seats present at the latest roll call', () => {
		const attendance = { a: 'present', b: 'present_and_voting', c: 'absent' } as const;

		expect(motionPresentCount(15, attendance, true)).toBe(2);
	});

	it('counts every seat before the session has a roll call', () => {
		expect(motionPresentCount(15, {}, false)).toBe(15);
	});
});

describe('motionCountRefusal', () => {
	it('lets a motion decided without counting through, either way', () => {
		expect(motionCountRefusal('passed', null, 13, 7)).toBeNull();
		expect(motionCountRefusal('failed', null, 13, 7)).toBeNull();
	});

	it('refuses more votes than seats present', () => {
		const tally = { votesFor: 10, votesAgainst: 4 };

		expect(motionCountRefusal('passed', tally, 13, 7)).toBe(MOTION_REFUSALS.tooManyVotes);
	});

	it('refuses a button the count disagrees with', () => {
		const failing = { votesFor: 4, votesAgainst: 9 };
		const passing = { votesFor: 9, votesAgainst: 4 };

		expect(motionCountRefusal('passed', failing, 13, 7)).toBe(MOTION_REFUSALS.countSaysFails);
		expect(motionCountRefusal('failed', passing, 13, 7)).toBe(MOTION_REFUSALS.countSaysPasses);
	});

	it('lets the button that agrees with the count through', () => {
		expect(motionCountRefusal('passed', { votesFor: 7, votesAgainst: 6 }, 13, 7)).toBeNull();
		expect(motionCountRefusal('failed', { votesFor: 6, votesAgainst: 7 }, 13, 7)).toBeNull();
	});
});
