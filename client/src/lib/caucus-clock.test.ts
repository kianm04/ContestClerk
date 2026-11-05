import { describe, expect, it } from 'vitest';
import {
	CLEARED_CAUCUS_CLOCK,
	caucusClock,
	caucusClockAfterPress,
	caucusClockColumns,
	caucusClockForTotal,
	caucusSecondsLeft,
	extendedCaucusClock,
	isCaucusTimeUp,
	type CaucusClockSetting,
	type SpeakerClockPress
} from './caucus-clock';

const NOW = new Date('2026-10-01T11:00:00.000Z');

/** A ten-minute caucus running, with 6:12 left at `NOW`. */
const RUNNING: CaucusClockSetting = {
	totalSeconds: 600,
	endsAt: '2026-10-01T11:06:12.000Z',
	pausedRemainingSeconds: null
};

/** The same caucus paused with 6:12 left. */
const PAUSED: CaucusClockSetting = { totalSeconds: 600, endsAt: null, pausedRemainingSeconds: 372 };

describe('caucusClockColumns', () => {
	it('writes the clock as the three columns of committee_state', () => {
		expect(caucusClockColumns(PAUSED)).toEqual({
			caucus_total_seconds: 600,
			caucus_ends_at: null,
			caucus_paused_remaining_seconds: 372
		});
	});
});

describe('caucusClock', () => {
	it('is the clock while a total is set, and null outside a moderated caucus', () => {
		expect(caucusClock(RUNNING)).toEqual({
			totalSeconds: 600,
			endsAt: '2026-10-01T11:06:12.000Z',
			pausedRemainingSeconds: null
		});
		expect(caucusClock(CLEARED_CAUCUS_CLOCK)).toBeNull();
	});
});

describe('caucusSecondsLeft and isCaucusTimeUp', () => {
	it('counts down a running clock and holds a paused one', () => {
		expect(caucusSecondsLeft({ ...RUNNING, totalSeconds: 600 }, NOW)).toBe(372);
		expect(caucusSecondsLeft({ ...PAUSED, totalSeconds: 600 }, NOW)).toBe(372);
		expect(isCaucusTimeUp({ ...RUNNING, totalSeconds: 600 }, NOW)).toBe(false);
	});

	it('never goes below zero, and is then up', () => {
		const over = {
			totalSeconds: 600,
			endsAt: '2026-10-01T10:59:30.000Z',
			pausedRemainingSeconds: null
		};

		expect(caucusSecondsLeft(over, NOW)).toBe(0);
		expect(isCaucusTimeUp(over, NOW)).toBe(true);
	});

	it('is up when paused at zero', () => {
		expect(
			isCaucusTimeUp({ totalSeconds: 600, endsAt: null, pausedRemainingSeconds: 0 }, NOW)
		).toBe(true);
	});

	it('has the whole total left on a clock neither running nor paused', () => {
		const unstarted = { totalSeconds: 600, endsAt: null, pausedRemainingSeconds: null };

		expect(caucusSecondsLeft(unstarted, NOW)).toBe(600);
	});
});

describe('caucusClockForTotal', () => {
	it('sets the whole total, paused, for a caucus nobody has spoken in yet', () => {
		expect(caucusClockForTotal(600)).toEqual({
			totalSeconds: 600,
			endsAt: null,
			pausedRemainingSeconds: 600
		});
	});
});

describe('caucusClockAfterPress', () => {
	it("starts with the speaker's clock: Start and Resume", () => {
		const started = caucusClockAfterPress(PAUSED, 'start', NOW);

		expect(started).toEqual({
			totalSeconds: 600,
			endsAt: '2026-10-01T11:06:12.000Z',
			pausedRemainingSeconds: null
		});
		expect(caucusClockAfterPress(PAUSED, 'resume', NOW)).toEqual(started);
	});

	it('leaves a running clock running when the speaker starts', () => {
		expect(caucusClockAfterPress(RUNNING, 'resume', NOW)).toEqual(RUNNING);
	});

	it('pauses where it is on Pause, Reset, End speech, Next and Suspend', () => {
		const stoppingPresses: SpeakerClockPress[] = ['pause', 'reset', 'endSpeech', 'next', 'suspend'];

		for (const press of stoppingPresses) {
			expect(caucusClockAfterPress(RUNNING, press, NOW)).toEqual(PAUSED);
		}
	});

	it('leaves a paused clock paused when the speaker stops', () => {
		expect(caucusClockAfterPress(PAUSED, 'next', NOW)).toEqual(PAUSED);
	});

	it("leaves the clock alone on +15 s, which changes the speaker's clock only", () => {
		expect(caucusClockAfterPress(RUNNING, 'addTime', NOW)).toEqual(RUNNING);
		expect(caucusClockAfterPress(PAUSED, 'addTime', NOW)).toEqual(PAUSED);
	});

	it('stays at zero, paused, once the time is up', () => {
		const timeUp = { totalSeconds: 600, endsAt: null, pausedRemainingSeconds: 0 };

		expect(caucusClockAfterPress(timeUp, 'start', NOW)).toEqual(timeUp);
	});

	it('pauses a clock that ran out at zero', () => {
		const ranOut = {
			totalSeconds: 600,
			endsAt: '2026-10-01T10:59:00.000Z',
			pausedRemainingSeconds: null
		};

		expect(caucusClockAfterPress(ranOut, 'pause', NOW)).toEqual({
			totalSeconds: 600,
			endsAt: null,
			pausedRemainingSeconds: 0
		});
	});

	it('changes nothing with no caucus clock set', () => {
		expect(caucusClockAfterPress(CLEARED_CAUCUS_CLOCK, 'start', NOW)).toEqual(CLEARED_CAUCUS_CLOCK);
	});
});

describe('extendedCaucusClock', () => {
	it('adds the time to a running clock and grows its total', () => {
		expect(extendedCaucusClock(RUNNING, 300, NOW)).toEqual({
			totalSeconds: 900,
			endsAt: '2026-10-01T11:11:12.000Z',
			pausedRemainingSeconds: null
		});
	});

	it('adds the time to a paused clock, which stays paused', () => {
		expect(extendedCaucusClock(PAUSED, 300, NOW)).toEqual({
			totalSeconds: 900,
			endsAt: null,
			pausedRemainingSeconds: 672
		});
	});

	it('gives a caucus whose time was up the time from now', () => {
		const ranOut = {
			totalSeconds: 600,
			endsAt: '2026-10-01T10:59:00.000Z',
			pausedRemainingSeconds: null
		};

		expect(extendedCaucusClock(ranOut, 300, NOW)).toEqual({
			totalSeconds: 900,
			endsAt: '2026-10-01T11:05:00.000Z',
			pausedRemainingSeconds: null
		});
	});

	it('grows the total of a clock neither running nor paused', () => {
		const unstarted = { totalSeconds: 600, endsAt: null, pausedRemainingSeconds: null };

		expect(extendedCaucusClock(unstarted, 300, NOW)).toEqual({ ...unstarted, totalSeconds: 900 });
	});

	it('changes nothing with no caucus clock set', () => {
		expect(extendedCaucusClock(CLEARED_CAUCUS_CLOCK, 300, NOW)).toEqual(CLEARED_CAUCUS_CLOCK);
	});
});
