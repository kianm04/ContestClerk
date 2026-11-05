import { describe, expect, it } from 'vitest';
import type { SpeakerEntryWithSeat } from './committee-room';
import { listEstimate, readerWait, readerWaitText, type ReaderWaitFacts } from './queue-estimate';

/** A waiting entry for `seatId` at `position`. */
function waiting(seatId: string, position: number): SpeakerEntryWithSeat {
	return { id: `entry-${seatId}`, position, status: 'waiting', seat: { id: seatId } };
}

/** China speaking, then the United Kingdom, Brazil and Russia waiting in that order. */
const ENTRIES: SpeakerEntryWithSeat[] = [
	{ id: 'entry-fr', position: 0, status: 'spoken', seat: { id: 'fr' } },
	{ id: 'entry-cn', position: 1, status: 'speaking', seat: { id: 'cn' } },
	waiting('ru', 4),
	waiting('gb', 2),
	waiting('br', 3)
];

describe('listEstimate', () => {
	it('counts the waiting seats and their speeches in whole minutes', () => {
		// Two speeches of 1:30 are three minutes.
		expect(listEstimate([waiting('gb', 1), waiting('br', 2)], {}, 90)).toBe('2 · ~3 min');
		// Two speeches of 1:00, as in a moderated caucus.
		expect(listEstimate([waiting('fr', 1), waiting('jp', 2)], {}, 60)).toBe('2 · ~2 min');
	});

	it('rounds to the nearest whole minute', () => {
		// 4 × 1:20 is 5:20.
		expect(listEstimate([...ENTRIES, waiting('jp', 5)], {}, 80)).toBe('4 · ~5 min');
		// 3 × 1:30 is 4:30, which rounds up.
		expect(listEstimate(ENTRIES, {}, 90)).toBe('3 · ~5 min');
	});

	it('is never under one minute', () => {
		expect(listEstimate([waiting('gb', 1)], {}, 20)).toBe('1 · ~1 min');
	});

	it('leaves out the seats marked absent, which Next skips', () => {
		expect(listEstimate(ENTRIES, { br: 'absent' }, 60)).toBe('2 · ~2 min');
	});

	it('is null when nobody waits, or only absent seats do', () => {
		expect(listEstimate([], {}, 90)).toBeNull();
		expect(listEstimate([waiting('gb', 1)], { gb: 'absent' }, 90)).toBeNull();
	});
});

describe('readerWait and readerWaitText', () => {
	const facts: ReaderWaitFacts = {
		entries: ENTRIES,
		attendance: {},
		seatId: 'br',
		speakingTimeSeconds: 90,
		speechSecondsLeft: 52
	};

	it('counts the speech in progress and each seat ahead, rounded up', () => {
		// 0:52 left on China, then 1:30 for the United Kingdom: 2:22, about 3 min.
		expect(readerWait(facts)).toEqual({ place: 2, minutes: 3 });
		expect(readerWaitText(facts)).toBe('You are 2nd · about 3 min');
	});

	it('counts only the speech in progress for the seat that speaks next', () => {
		expect(readerWaitText({ ...facts, seatId: 'gb' })).toBe('You are 1st · about 1 min');
	});

	it('counts the full time of a speaker called whose clock has not started', () => {
		expect(readerWait({ ...facts, speechSecondsLeft: 90 })).toEqual({ place: 2, minutes: 3 });
		expect(readerWait({ ...facts, speechSecondsLeft: 91 })).toEqual({ place: 2, minutes: 4 });
	});

	it('adds nothing for a speech over time or an empty floor', () => {
		expect(readerWait({ ...facts, speechSecondsLeft: 0 })).toEqual({ place: 2, minutes: 2 });
		expect(readerWait({ ...facts, speechSecondsLeft: -7 })).toEqual({ place: 2, minutes: 2 });
		expect(readerWait({ ...facts, speechSecondsLeft: null })).toEqual({ place: 2, minutes: 2 });
	});

	it('is never under one minute', () => {
		const next = { ...facts, seatId: 'gb', speechSecondsLeft: null };

		expect(readerWait(next)).toEqual({ place: 1, minutes: 1 });
	});

	it('skips the absent seats ahead of the reader', () => {
		expect(readerWaitText({ ...facts, seatId: 'ru', attendance: { br: 'absent' } })).toBe(
			'You are 2nd · about 3 min'
		);
	});

	it('gives no place to a seat that is not waiting or is marked absent', () => {
		expect(readerWaitText({ ...facts, seatId: 'cn' })).toBeNull();
		expect(readerWaitText({ ...facts, seatId: 'fr' })).toBeNull();
		expect(readerWaitText({ ...facts, seatId: 'ke' })).toBeNull();
		expect(readerWaitText({ ...facts, attendance: { br: 'absent' } })).toBeNull();
	});
});
