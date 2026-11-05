import { describe, expect, it } from 'vitest';
import { CAUCUS_EXTENSION_SECONDS, caucusClockAfterAction } from './caucus-floor';

const NOW = new Date('2026-10-01T12:00:00.000Z');

/** A moment `seconds` after `NOW`. */
function after(seconds: number): string {
	return new Date(NOW.getTime() + seconds * 1000).toISOString();
}

const PAUSED = { totalSeconds: 600, endsAt: null, pausedRemainingSeconds: 372 };
const RUNNING = { totalSeconds: 600, endsAt: after(372), pausedRemainingSeconds: null };

/** A moderated caucus with `caucusClock`. */
function mod(caucusClock: typeof PAUSED | typeof RUNNING) {
	return { mode: 'moderated_caucus' as const, caucusClock };
}

describe('caucusClockAfterAction', () => {
	it('runs the caucus clock with Start and Resume', () => {
		const started = caucusClockAfterAction(mod(PAUSED), '?/timerStart', NOW);
		const resumed = caucusClockAfterAction(mod(PAUSED), '?/timerResume', NOW);

		expect(started).toEqual(RUNNING);
		expect(resumed).toEqual(RUNNING);
	});

	it('pauses it with Pause, End speech, Yield to the chair, Next, Speak now and Reset clock', () => {
		for (const action of [
			'?/timerPause',
			'?/endSpeech',
			'?/yieldToChair',
			'?/nextSpeaker',
			'?/speakNow',
			'?/timerReset'
		]) {
			expect(caucusClockAfterAction(mod(RUNNING), action, NOW)).toEqual(PAUSED);
		}
	});

	it('leaves it alone for +15 s', () => {
		expect(caucusClockAfterAction(mod(RUNNING), '?/timerAdd', NOW)).toEqual(RUNNING);
	});

	it('changes nothing outside a moderated caucus, or for another action', () => {
		const gsl = { mode: 'formal_debate' as const, caucusClock: PAUSED };

		expect(caucusClockAfterAction(gsl, '?/timerResume', NOW)).toBeNull();
		expect(caucusClockAfterAction({ mode: 'moderated_caucus' }, '?/timerResume', NOW)).toBeNull();
		expect(caucusClockAfterAction(mod(PAUSED), '?/add', NOW)).toBeNull();
	});

	it('extends by five minutes', () => {
		expect(CAUCUS_EXTENSION_SECONDS).toBe(300);
	});
});
