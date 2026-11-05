import { describe, expect, it } from 'vitest';
import {
	PAPER_SCREEN_MESSAGES,
	floorPaper,
	floorPaperText,
	introducedWord,
	paperShownOnScreen
} from './papers-on-floor';

const PAPER = { id: 'paper-1', name: 'Working paper 1.1', title: 'Meaningful human control' };

describe('floorPaper', () => {
	it('names a paper the way a chair says it', () => {
		expect(
			floorPaper({
				id: 'paper-1',
				kind: 'draft_resolution',
				title: 'Autonomous weapons',
				topicNumber: 1,
				sequence: 3
			})
		).toEqual({ id: 'paper-1', name: 'Draft resolution 1.3', title: 'Autonomous weapons' });
	});
});

describe('floorPaperText', () => {
	it('puts the name before the title', () => {
		expect(floorPaperText(PAPER)).toBe('Working paper 1.1 · Meaningful human control');
	});
});

describe('paperShownOnScreen', () => {
	it('shows the paper in place of the floor and the Unmod clock', () => {
		expect(paperShownOnScreen({ kind: 'unmod' }, PAPER)).toBe(PAPER);
	});

	it('leaves a message and a vote their own screens', () => {
		expect(paperShownOnScreen({ kind: 'vote' }, PAPER)).toBeNull();
		expect(
			paperShownOnScreen({ kind: 'message', title: 'Suspended', lines: [] }, PAPER)
		).toBeNull();
	});

	it('is null with no paper on the screen', () => {
		expect(paperShownOnScreen({ kind: 'unmod' }, null)).toBeNull();
	});
});

describe('introducedWord', () => {
	it('says when the paper was introduced, in the conference’s time', () => {
		expect(introducedWord('2026-10-09T14:12:00Z', 'Europe/Amsterdam')).toBe(
			'Introduced 9 October, 16:12'
		);
	});

	it('is null before it is introduced', () => {
		expect(introducedWord(null, 'Europe/Amsterdam')).toBeNull();
	});
});

describe('PAPER_SCREEN_MESSAGES', () => {
	it('names the paper put on or taken off the screen', () => {
		expect(PAPER_SCREEN_MESSAGES.shown('Working paper 1.1')).toBe(
			'Working paper 1.1 is on the screen.'
		);
		expect(PAPER_SCREEN_MESSAGES.hidden('Working paper 1.1')).toBe(
			'Working paper 1.1 is off the screen.'
		);
	});
});
