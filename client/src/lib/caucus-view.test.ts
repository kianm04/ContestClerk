import { describe, expect, it } from 'vitest';
import type { ChairMotion } from '$lib/chair-room';
import {
	backAtText,
	caucusLine,
	caucusStripText,
	caucusTitle,
	raisedByLine,
	shownCaucusMotion,
	unmodClockButton,
	type CaucusMotion
} from './caucus-view';

const NOW = new Date('2026-10-01T12:20:00.000Z');

/** A moment `seconds` after `NOW`. */
function after(seconds: number): string {
	return new Date(NOW.getTime() + seconds * 1000).toISOString();
}

const CAUCUS: CaucusMotion = {
	id: 'motion-1',
	kind: 'moderated_caucus',
	topic: 'Opening humanitarian corridors',
	totalTimeSeconds: 600,
	speakingTimeSeconds: 60,
	raisedByName: 'Brazil',
	startedWithoutVote: true
};

describe('the title', () => {
	it('names the kind and the topic, or the kind alone', () => {
		expect(caucusTitle('moderated_caucus', 'Opening humanitarian corridors')).toBe(
			'Moderated caucus · Opening humanitarian corridors'
		);
		expect(caucusTitle('unmoderated_caucus', null)).toBe('Unmoderated caucus');
		expect(caucusTitle('unmoderated_caucus', '')).toBe('Unmoderated caucus');
	});

	it('says who raised it, and marks a caucus started without a vote', () => {
		expect(raisedByLine(CAUCUS)).toBe('raised by Brazil · started without a vote');
		expect(raisedByLine({ raisedByName: null, startedWithoutVote: false })).toBe(
			'raised by the chair'
		);
	});
});

describe('shownCaucusMotion', () => {
	const ROOM_MOTION: ChairMotion = {
		id: 'motion-2',
		kind: 'unmoderated_caucus',
		status: 'passed',
		topic: 'Drafting',
		totalTimeSeconds: 900,
		speakingTimeSeconds: null,
		proposedBySeatName: null,
		votesFor: null,
		votesAgainst: null,
		createdAt: NOW.toISOString()
	};

	it('is the server’s once it reads the room’s own motion', () => {
		expect(shownCaucusMotion(CAUCUS, { ...ROOM_MOTION, id: 'motion-1' })).toBe(CAUCUS);
	});

	it('draws a caucus only this browser knows yet as one started without a vote', () => {
		expect(shownCaucusMotion(CAUCUS, ROOM_MOTION)).toEqual({
			id: 'motion-2',
			kind: 'unmoderated_caucus',
			topic: 'Drafting',
			totalTimeSeconds: 900,
			speakingTimeSeconds: null,
			raisedByName: null,
			startedWithoutVote: true
		});
	});

	it('is null while the room runs no caucus', () => {
		expect(shownCaucusMotion(CAUCUS, null)).toBeNull();
		expect(shownCaucusMotion(null, { ...ROOM_MOTION, kind: 'other' })).toBeNull();
	});
});

describe('caucusLine', () => {
	it('reads the time left of the total while the clock runs', () => {
		const line = caucusLine(
			{ totalSeconds: 600, endsAt: after(372), pausedRemainingSeconds: null },
			NOW
		);

		expect(line).toEqual({
			timeLeft: '6:12',
			ofTotal: 'left of 10:00',
			isTimeUp: false,
			usedSeconds: 228,
			totalSeconds: 600,
			clockState: 'running'
		});
	});

	it('is ready at its whole total before the first speech, and paused between speeches', () => {
		const ready = caucusLine({ totalSeconds: 600, endsAt: null, pausedRemainingSeconds: 600 }, NOW);
		const paused = caucusLine(
			{ totalSeconds: 600, endsAt: null, pausedRemainingSeconds: 300 },
			NOW
		);

		expect(ready.clockState).toBe('ready');
		expect(ready.timeLeft).toBe('10:00');
		expect(paused.clockState).toBe('paused');
	});

	it('is up at zero, with the bar full, and never counts up', () => {
		const line = caucusLine(
			{ totalSeconds: 600, endsAt: after(-30), pausedRemainingSeconds: null },
			NOW
		);

		expect(line.isTimeUp).toBe(true);
		expect(line.timeLeft).toBe('0:00');
		expect(line.usedSeconds).toBe(600);
	});
});

describe('caucusStripText', () => {
	it('names the caucus clock for the live strip, or says the time is up', () => {
		const running = { totalSeconds: 600, endsAt: after(372), pausedRemainingSeconds: null };
		const up = { totalSeconds: 600, endsAt: null, pausedRemainingSeconds: 0 };

		expect(caucusStripText(running, NOW)).toBe('caucus 6:12 left');
		expect(caucusStripText(up, NOW)).toBe('caucus time is up');
	});

	it('is null with no caucus clock', () => {
		const cleared = { totalSeconds: null, endsAt: null, pausedRemainingSeconds: null };

		expect(caucusStripText(cleared, NOW)).toBeNull();
		expect(caucusStripText(undefined, NOW)).toBeNull();
	});
});

describe('backAtText', () => {
	it('names when the room is due back, in the conference’s time zone', () => {
		const running = {
			totalSeconds: 600,
			endsAt: '2026-10-01T12:32:00.000Z',
			pausedRemainingSeconds: null
		};

		expect(backAtText(running, NOW, 'Europe/Amsterdam')).toBe('back at 14:32');
	});

	it('says it is paused, the time moving on with the wall clock', () => {
		const paused = { totalSeconds: 600, endsAt: null, pausedRemainingSeconds: 21 * 60 };
		const later = new Date(NOW.getTime() + 60 * 1000);

		expect(backAtText(paused, NOW, 'Europe/Amsterdam')).toBe('Paused · back at 14:41');
		expect(backAtText(paused, later, 'Europe/Amsterdam')).toBe('Paused · back at 14:42');
	});

	it('is null with no clock', () => {
		const cleared = { totalSeconds: null, endsAt: null, pausedRemainingSeconds: null };

		expect(backAtText(cleared, NOW, 'Europe/Amsterdam')).toBeNull();
	});
});

describe('unmodClockButton', () => {
	it('reads "Pause" while the clock runs and "Resume" once it is paused', () => {
		const running = { totalSeconds: 600, endsAt: after(300), pausedRemainingSeconds: null };
		const paused = { totalSeconds: 600, endsAt: null, pausedRemainingSeconds: 300 };

		expect(unmodClockButton(running)).toEqual({ label: 'Pause', formAction: '?/timerPause' });
		expect(unmodClockButton(paused)).toEqual({ label: 'Resume', formAction: '?/timerResume' });
	});

	it('reads "Resume", never "Start", for a clock paused within its first second', () => {
		const pausedAtFullLength = { totalSeconds: 600, endsAt: null, pausedRemainingSeconds: 600 };

		expect(unmodClockButton(pausedAtFullLength)).toEqual({
			label: 'Resume',
			formAction: '?/timerResume'
		});
	});
});
