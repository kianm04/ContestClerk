import { describe, expect, it } from 'vitest';
import type { LiveStripControls } from '$lib/chair-frame';
import {
	modeEndActions,
	modeStripControls,
	modeStripText,
	stripPrimaryAddress
} from './mode-strip';

const NOW = new Date('2026-10-01T12:00:00.000Z');

const RUNNING_CAUCUS = {
	totalSeconds: 600,
	endsAt: new Date(NOW.getTime() + 372_000).toISOString(),
	pausedRemainingSeconds: null
};
const CAUCUS_UP = { totalSeconds: 600, endsAt: null, pausedRemainingSeconds: 0 };

const NEXT_CONTROLS: LiveStripControls = {
	clock: { label: 'Pause', formAction: '?/timerPause' },
	addTime: { label: '+15 s', seconds: 15 },
	primary: { label: 'Next: France', action: 'nextSpeaker' }
};

describe('modeStripText', () => {
	it('names the caucus clock after the speaker in a moderated caucus', () => {
		expect(
			modeStripText('Mod · Kenya · 0:31', { mode: 'moderated_caucus' }, RUNNING_CAUCUS, NOW)
		).toBe('Mod · Kenya · 0:31 · caucus 6:12 left');
	});

	it('leaves every other mode’s words as they are', () => {
		expect(
			modeStripText('GSL · China · 0:47', { mode: 'formal_debate' }, RUNNING_CAUCUS, NOW)
		).toBe('GSL · China · 0:47');
	});
});

describe('modeStripControls', () => {
	it('makes "End caucus" the primary once a moderated caucus’s time is up', () => {
		const controls = modeStripControls(NEXT_CONTROLS, { mode: 'moderated_caucus' }, CAUCUS_UP, NOW);

		expect(controls.primary).toEqual({ label: 'End caucus', action: 'endCaucus' });
		expect(controls.clock).toEqual(NEXT_CONTROLS.clock);
	});

	it('keeps "Next" while the caucus has time', () => {
		const controls = modeStripControls(
			NEXT_CONTROLS,
			{ mode: 'moderated_caucus' },
			RUNNING_CAUCUS,
			NOW
		);

		expect(controls.primary?.action).toBe('nextSpeaker');
	});

	it('offers "Return to GSL" once nobody waits for a single speaker', () => {
		const nobodyWaiting = { ...NEXT_CONTROLS, primary: null };
		const controls = modeStripControls(nobodyWaiting, { mode: 'single_speaker' }, undefined, NOW);

		expect(controls.primary).toEqual({ label: 'Return to GSL', action: 'returnToGsl' });
	});
});

describe('where the strip’s primary posts', () => {
	const endActions = modeEndActions('thimun-2027', 'unsc', 'motions');

	it('posts the live room’s End caucus and Return to GSL, naming the page it is on', () => {
		expect(endActions).toEqual({
			endCaucus: '/conferences/thimun-2027/committees/unsc/chair?fromView=motions&/endCaucus',
			returnToGsl: '/conferences/thimun-2027/committees/unsc/chair?fromView=motions&/returnToGsl'
		});
	});

	it('picks the address by the primary’s action', () => {
		expect(stripPrimaryAddress('endCaucus', 'next', endActions)).toBe(endActions.endCaucus);
		expect(stripPrimaryAddress('returnToGsl', 'next', endActions)).toBe(endActions.returnToGsl);
		expect(stripPrimaryAddress('nextSpeaker', 'next', endActions)).toBe('next');
	});
});
