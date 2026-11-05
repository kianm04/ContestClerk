import { describe, expect, it } from 'vitest';
import {
	hasClauses,
	joinResolutionMarkdown,
	paperParts,
	paperTextColumns,
	paperTextFromColumns,
	splitResolutionMarkdown
} from './resolution-text';

const PREAMBLE = 'Recalling its resolution 78/241,\n\n*Alarmed* by the speed of change,';
const OPERATIVE = '1. Calls upon all States to:\n   1. negotiate;\n2. Decides to remain seized.';

describe('hasClauses', () => {
	it('is true for the two kinds written in clauses', () => {
		expect(hasClauses('draft_resolution')).toBe(true);
		expect(hasClauses('committee_directive')).toBe(true);
		expect(hasClauses('working_paper')).toBe(false);
		expect(hasClauses('press_release')).toBe(false);
	});
});

describe('paperParts', () => {
	it('names the parts a thread on the words can be in', () => {
		expect(paperParts('draft_resolution')).toEqual(['preamble', 'operative']);
		expect(paperParts('committee_directive')).toEqual(['operative']);
		expect(paperParts('working_paper')).toEqual(['body']);
	});
});

describe('splitResolutionMarkdown', () => {
	it('cuts the text at its first numbered list', () => {
		expect(splitResolutionMarkdown(`${PREAMBLE}\n\n${OPERATIVE}`)).toEqual({
			preamble: PREAMBLE,
			operative: OPERATIVE
		});
	});

	it('keeps a text with no numbered list as the preamble', () => {
		expect(splitResolutionMarkdown(`${PREAMBLE}\n`)).toEqual({ preamble: PREAMBLE, operative: '' });
	});

	it('keeps a paragraph written after the clauses in the operative part', () => {
		const text = `${PREAMBLE}\n\n${OPERATIVE}\n\nA note at the end.`;

		expect(splitResolutionMarkdown(text).operative).toBe(`${OPERATIVE}\n\nA note at the end.`);
	});

	it('does not start the operative part at an indented list or a number in a sentence', () => {
		const text = 'Recalling 2417. of 2018,\n\n   1. not a clause\n\n1. Decides.';

		expect(splitResolutionMarkdown(text)).toEqual({
			preamble: 'Recalling 2417. of 2018,\n\n   1. not a clause',
			operative: '1. Decides.'
		});
	});

	it('splits a text that starts with an indented numbered line the same way once joined again', () => {
		const text = '   1. Recalling its resolution 78/241,\n\n1. Decides.';
		const parts = splitResolutionMarkdown(text);

		expect(parts).toEqual({
			preamble: '',
			operative: '1. Recalling its resolution 78/241,\n\n1. Decides.'
		});
		expect(
			splitResolutionMarkdown(joinResolutionMarkdown(parts.preamble, parts.operative))
		).toEqual(parts);
	});
});

describe('joinResolutionMarkdown', () => {
	it('puts a blank line between the parts, and leaves out an empty one', () => {
		expect(joinResolutionMarkdown(PREAMBLE, OPERATIVE)).toBe(`${PREAMBLE}\n\n${OPERATIVE}`);
		expect(joinResolutionMarkdown('', OPERATIVE)).toBe(OPERATIVE);
		expect(joinResolutionMarkdown(PREAMBLE, '  ')).toBe(PREAMBLE);
	});
});

describe('paperTextColumns', () => {
	it('splits a draft resolution into its two parts', () => {
		expect(paperTextColumns('draft_resolution', `${PREAMBLE}\n\n${OPERATIVE}`)).toEqual({
			body_markdown: null,
			preamble_markdown: PREAMBLE,
			operative_markdown: OPERATIVE
		});
	});

	it('keeps all of a committee directive as its operative part', () => {
		expect(paperTextColumns('committee_directive', `${OPERATIVE}\n`)).toEqual({
			body_markdown: null,
			preamble_markdown: null,
			operative_markdown: OPERATIVE
		});
	});

	it('keeps any other paper as one text', () => {
		expect(paperTextColumns('working_paper', 'Our ideas')).toEqual({
			body_markdown: 'Our ideas',
			preamble_markdown: null,
			operative_markdown: null
		});
	});
});

describe('paperTextFromColumns', () => {
	it('reads back what each kind saved', () => {
		for (const kind of ['draft_resolution', 'committee_directive', 'working_paper'] as const) {
			const text = kind === 'committee_directive' ? OPERATIVE : `${PREAMBLE}\n\n${OPERATIVE}`;

			expect(paperTextFromColumns(paperTextColumns(kind, text))).toBe(text);
		}
	});
});
