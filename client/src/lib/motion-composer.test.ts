import { describe, expect, it } from 'vitest';
import { OTHER_DOCUMENT } from '$lib/motions';
import {
	COMPOSER_FIELD_IDS,
	PAPER_FIELD_HELP,
	PAPER_FIELD_ID,
	allComposerFields,
	composerFields,
	documentChoices,
	fieldAfterRaisedBy,
	isPaperPicked
} from './motion-composer';

/** An approved paper waiting to be introduced. */
const PAPERS = [{ id: 'paper-1', name: 'Working paper 1.1', title: 'Autonomous weapons' }];

/** The committee's speaking time, which a moderated caucus's "Each" shows as its default. */
const SPEAKING_SECONDS = 90;

/** The labels a kind shows, in order. */
function labelsOf(kind: Parameters<typeof composerFields>[0]): string[] {
	return composerFields(kind, SPEAKING_SECONDS).map((field) => field.label);
}

describe('composerFields', () => {
	it('shows each kind only the fields it asks for, in the study’s order', () => {
		expect(labelsOf('moderated_caucus')).toEqual(['Topic', 'Total', 'Each']);
		expect(labelsOf('unmoderated_caucus')).toEqual(['Length', 'Topic']);
		expect(labelsOf('extend_caucus')).toEqual(['By']);
		expect(labelsOf('suspend_meeting')).toEqual(['Reason', 'Length']);
		expect(labelsOf('adjourn_meeting')).toEqual([]);
		expect(labelsOf('close_debate')).toEqual([]);
		expect(labelsOf('introduce_document')).toEqual(['Document']);
		expect(labelsOf('other')).toEqual(['Motion', 'Length']);
	});

	it('shows a time field’s default as its placeholder, or "optional"', () => {
		const mod = composerFields('moderated_caucus', SPEAKING_SECONDS);
		const suspend = composerFields('suspend_meeting', SPEAKING_SECONDS);

		expect(mod.map((field) => field.placeholder)).toEqual(['', '10:00', '1:30']);
		expect(composerFields('extend_caucus', SPEAKING_SECONDS)[0].placeholder).toBe('5:00');
		expect(suspend.map((field) => field.placeholder)).toEqual([
			'optional, “for lunch”',
			'optional'
		]);
	});

	it('sends each field under the name the action reads', () => {
		const mod = composerFields('moderated_caucus', SPEAKING_SECONDS);

		expect(mod.map((field) => field.name)).toEqual(['topic', 'totalTime', 'speakingTime']);
		expect(mod.map((field) => field.size)).toEqual(['text', 'time', 'time']);
	});
});

describe('allComposerFields', () => {
	it('shows the three shared fields, each with a line naming the kinds that use it', () => {
		const fields = allComposerFields(SPEAKING_SECONDS);

		expect(fields.map((field) => field.label)).toEqual([
			'Topic, reason or name',
			'Total or length',
			'Each speaker (Mod only)'
		]);
		expect(fields.every((field) => field.help !== null)).toBe(true);
		expect(fields[2].help).toBe('Mod only: 1:30 when empty.');
	});
});

describe('fieldAfterRaisedBy', () => {
	it('moves the cursor on to the kind’s first field, or nowhere when it has none', () => {
		expect(fieldAfterRaisedBy('moderated_caucus', SPEAKING_SECONDS)).toBe(COMPOSER_FIELD_IDS.topic);
		expect(fieldAfterRaisedBy('unmoderated_caucus', SPEAKING_SECONDS)).toBe(
			COMPOSER_FIELD_IDS.totalTime
		);
		expect(fieldAfterRaisedBy('close_debate', SPEAKING_SECONDS)).toBeNull();
	});
});

describe('picking the paper a document introduces', () => {
	it('picks from "Paper" for a document while approved papers wait, and types it otherwise', () => {
		expect(isPaperPicked('introduce_document', PAPERS)).toBe(true);
		expect(isPaperPicked('introduce_document', [])).toBe(false);
		expect(isPaperPicked('moderated_caucus', PAPERS)).toBe(false);
	});

	it('hides the typed name of a picked paper, and moves the cursor to "Paper"', () => {
		expect(composerFields('introduce_document', SPEAKING_SECONDS, false)).toEqual([]);
		expect(fieldAfterRaisedBy('introduce_document', SPEAKING_SECONDS, PAPERS)).toBe(PAPER_FIELD_ID);
		expect(fieldAfterRaisedBy('introduce_document', SPEAKING_SECONDS)).toBe(
			COMPOSER_FIELD_IDS.topic
		);
	});

	it('offers each paper by its name with its title beside it, then Other', () => {
		expect(documentChoices(PAPERS)).toEqual([
			{ value: 'paper-1', label: 'Working paper 1.1', detail: 'Autonomous weapons' },
			{ value: OTHER_DOCUMENT, label: 'Other' }
		]);
		expect(PAPER_FIELD_HELP).toContain('Other');
	});
});
