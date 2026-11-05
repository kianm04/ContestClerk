import { describe, expect, it } from 'vitest';
import {
	MOTION_KIND_CHOICES,
	motionKindFields,
	motionSubtitle,
	motionTitle,
	readDuration,
	type MotionWordsSource
} from './motion-input';

/** A motion raised by Brazil with no topic and no times, for the tests to change. */
function motion(changes: Partial<MotionWordsSource>): MotionWordsSource {
	return {
		kind: 'other',
		topic: null,
		totalTimeSeconds: null,
		speakingTimeSeconds: null,
		proposedBy: { name: 'Brazil' },
		...changes
	};
}

describe('readDuration', () => {
	it('reads a bare number as minutes', () => {
		expect(readDuration('10')).toBe(600);
		expect(readDuration('2')).toBe(120);
	});

	it('reads minutes and seconds', () => {
		expect(readDuration('1:30')).toBe(90);
		expect(readDuration('0:45')).toBe(45);
		expect(readDuration('12:30')).toBe(750);
	});

	it('reads seconds written with an s', () => {
		expect(readDuration('90s')).toBe(90);
		expect(readDuration('45 S')).toBe(45);
	});

	it('ignores the spaces around the time', () => {
		expect(readDuration(' 1:30 ')).toBe(90);
	});

	it('refuses anything else', () => {
		for (const text of ['', ' ', 'ten', '1.5', '-1', '1:5', '1:75', '1:30:00', '10m', 's']) {
			expect(readDuration(text)).toBeNull();
		}
	});

	it('refuses a field that was not sent, or a file', () => {
		expect(readDuration(null)).toBeNull();
		expect(readDuration(new File(['10'], 'time.txt'))).toBeNull();
	});
});

describe('MOTION_KIND_CHOICES', () => {
	it("offers the eight kinds in myMUN's order, by their short names", () => {
		expect(MOTION_KIND_CHOICES.map((choice) => choice.label)).toEqual([
			'Mod',
			'Unmod',
			'Extend',
			'Suspend',
			'Adjourn',
			'Close debate',
			'Document',
			'Other'
		]);
	});
});

describe('motionKindFields', () => {
	it("asks a moderated caucus for a topic, a total of 10:00 and the committee's speaking time", () => {
		expect(motionKindFields('moderated_caucus', 75)).toEqual({
			topic: { label: 'Topic', isRequired: true },
			totalTime: { label: 'Total', defaultSeconds: 600 },
			speakingTime: { label: 'Each', defaultSeconds: 75 }
		});
	});

	it('asks an unmoderated caucus for a length of 10:00 and an optional topic', () => {
		expect(motionKindFields('unmoderated_caucus', 60)).toEqual({
			topic: { label: 'Topic', isRequired: false },
			totalTime: { label: 'Length', defaultSeconds: 600 },
			speakingTime: null
		});
	});

	it('asks an extension only for how much, 5:00 by default', () => {
		expect(motionKindFields('extend_caucus', 60)).toEqual({
			topic: null,
			totalTime: { label: 'By', defaultSeconds: 300 },
			speakingTime: null
		});
	});

	it('lets a suspension go without a reason or a length', () => {
		expect(motionKindFields('suspend_meeting', 60)).toEqual({
			topic: { label: 'Reason', isRequired: false },
			totalTime: { label: 'Length', defaultSeconds: null },
			speakingTime: null
		});
	});

	it('asks a document for its name, and another motion for its name and an optional length', () => {
		expect(motionKindFields('introduce_document', 60)).toEqual({
			topic: { label: 'Document', isRequired: true },
			totalTime: null,
			speakingTime: null
		});
		expect(motionKindFields('other', 60)).toEqual({
			topic: { label: 'Motion', isRequired: true },
			totalTime: { label: 'Length', defaultSeconds: null },
			speakingTime: null
		});
	});

	it('asks adjourning and closing debate for nothing more', () => {
		const nothing = { topic: null, totalTime: null, speakingTime: null };

		expect(motionKindFields('adjourn_meeting', 60)).toEqual(nothing);
		expect(motionKindFields('close_debate', 60)).toEqual(nothing);
	});
});

describe('motionTitle', () => {
	it('writes a caucus with its times', () => {
		const moderated = motion({
			kind: 'moderated_caucus',
			totalTimeSeconds: 600,
			speakingTimeSeconds: 60
		});
		const unmoderated = motion({ kind: 'unmoderated_caucus', totalTimeSeconds: 900 });

		expect(motionTitle(moderated)).toBe('Moderated caucus · 10:00 / 1:00');
		expect(motionTitle(unmoderated)).toBe('Unmoderated caucus · 15:00');
	});

	it('leaves out the times a motion does not have', () => {
		const noSpeakingTime = motion({ kind: 'moderated_caucus', totalTimeSeconds: 600 });

		expect(motionTitle(noSpeakingTime)).toBe('Moderated caucus · 10:00');
		expect(motionTitle(motion({ kind: 'moderated_caucus' }))).toBe('Moderated caucus');
		expect(motionTitle(motion({ kind: 'suspend_meeting' }))).toBe('Suspend the meeting');
	});

	it('writes the kinds with a length', () => {
		const extension = motion({ kind: 'extend_caucus', totalTimeSeconds: 300 });
		const suspension = motion({ kind: 'suspend_meeting', totalTimeSeconds: 1800 });

		expect(motionTitle(extension)).toBe('Extend the caucus · 5:00');
		expect(motionTitle(suspension)).toBe('Suspend the meeting · 30:00');
	});

	it('writes the kinds with no time', () => {
		expect(motionTitle(motion({ kind: 'adjourn_meeting' }))).toBe('Adjourn the meeting');
		expect(motionTitle(motion({ kind: 'close_debate' }))).toBe('Close debate');
	});

	it('writes a document and another motion by their own name', () => {
		const document = motion({ kind: 'introduce_document', topic: 'Working Paper 1.2' });
		const recess = motion({ kind: 'other', topic: 'Recess for the photo', totalTimeSeconds: 600 });

		expect(motionTitle(document)).toBe('Introduce Working Paper 1.2');
		expect(motionTitle(recess)).toBe('Recess for the photo · 10:00');
	});

	it('falls back to the kind when a document or another motion has no name', () => {
		expect(motionTitle(motion({ kind: 'introduce_document' }))).toBe('Introduce a document');
		expect(motionTitle(motion({ kind: 'other', topic: '' }))).toBe('Other motion');
	});
});

describe('motionSubtitle', () => {
	it('writes the topic and who raised it', () => {
		const caucus = motion({ kind: 'unmoderated_caucus', topic: 'Drafting the working paper' });

		expect(motionSubtitle({ ...caucus, proposedBy: { name: 'Kenya' } })).toBe(
			'Drafting the working paper · Kenya'
		);
	});

	it("writes a suspension's reason", () => {
		const suspension = motion({ kind: 'suspend_meeting', topic: 'for lunch', proposedBy: null });

		expect(motionSubtitle(suspension)).toBe('for lunch · the chair');
	});

	it('names "the chair" when no seat raised it', () => {
		expect(motionSubtitle(motion({ kind: 'close_debate', proposedBy: null }))).toBe('the chair');
	});

	it('leaves out a topic the title already says, or an empty one', () => {
		const document = motion({ kind: 'introduce_document', topic: 'Working Paper 1.2' });
		const emptyTopic = motion({ kind: 'moderated_caucus', topic: '' });

		expect(motionSubtitle(document)).toBe('Brazil');
		expect(motionSubtitle(emptyTopic)).toBe('Brazil');
	});
});
