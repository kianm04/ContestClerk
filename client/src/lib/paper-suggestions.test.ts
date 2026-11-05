import { getSchema } from '@tiptap/core';
import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Transform } from '@tiptap/pm/transform';
import { describe, expect, it } from 'vitest';
import {
	PAPER_SCHEMA,
	bold,
	breakMarker,
	deleted,
	inserted,
	paper,
	paragraph,
	shown,
	suggestion
} from '../../tests/paper-suggestion-fixtures';
import { markdownDocumentExtensions } from './markdown-editor';
import { BREAK_MARKER, SUGGESTED_DELETION, SUGGESTED_INSERTION } from './paper-suggestion-marks';
import {
	agreedDocument,
	countSuggestions,
	decideSuggestion,
	isSuggestionMark,
	quoteForCard,
	readSuggestions,
	startsWithBreakMarker,
	textblocksOf,
	type SuggestionDecision
} from './paper-suggestions';

const ANA = suggestion('a1', 'ana');
const BEN = suggestion('b1', 'ben');
const CARA = suggestion('c1', 'cara');
const DAN = suggestion('d1', 'dan');

/*
	One paper holding one suggestion of each kind: Ben replaces "old" with
	"new", Ana adds "now", Cara splits the second paragraph off the first and
	Dan joins the third to the second.
*/
const PAPER = paper(
	paragraph('The ', deleted('old', BEN), inserted('new', BEN), ' plan ', inserted('now', ANA)),
	paragraph(breakMarker('inserted', CARA), 'Second'),
	paragraph(breakMarker('deleted', DAN), 'Third')
);

/** `PAPER` once suggestion `id` is decided. */
function decided(id: string, decision: SuggestionDecision): string {
	const transform = new Transform(PAPER);
	decideSuggestion(transform, id, decision);

	return shown(transform.doc);
}

describe('textblocksOf', () => {
	it('finds every block that holds text, inside lists too, by where its text runs', () => {
		const document = ProseMirrorNode.fromJSON(PAPER_SCHEMA, {
			type: 'doc',
			content: [
				{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] },
				paragraph('One'),
				{
					type: 'bulletList',
					content: [
						{ type: 'listItem', content: [paragraph('A')] },
						{ type: 'listItem', content: [paragraph('B')] }
					]
				}
			]
		});

		const textblocks = textblocksOf(document);

		expect(textblocks.map(({ start, end }) => [start, end])).toEqual([
			[1, 6],
			[8, 11],
			[15, 16],
			[20, 21]
		]);
		expect(textblocks.map(({ node }) => node.textContent)).toEqual(['Title', 'One', 'A', 'B']);
	});
});

describe('startsWithBreakMarker', () => {
	it('is true for a paragraph after a break that is suggested', () => {
		const textblocks = textblocksOf(PAPER);

		expect(startsWithBreakMarker(textblocks, 1)).toBe(true);
		expect(startsWithBreakMarker(textblocks, 2)).toBe(true);
	});

	it('is false for the first paragraph, which has no break before it', () => {
		const document = paper(paragraph(breakMarker('inserted', ANA), 'First'), paragraph('Second'));

		expect(startsWithBreakMarker(textblocksOf(document), 0)).toBe(false);
		expect(startsWithBreakMarker(textblocksOf(document), 1)).toBe(false);
	});
});

describe('isSuggestionMark', () => {
	it('knows the two marks of a suggestion from the others', () => {
		expect(isSuggestionMark(PAPER_SCHEMA.marks[SUGGESTED_INSERTION].create(ANA))).toBe(true);
		expect(isSuggestionMark(PAPER_SCHEMA.marks[SUGGESTED_DELETION].create(ANA))).toBe(true);
		expect(isSuggestionMark(PAPER_SCHEMA.marks.bold.create())).toBe(false);
	});
});

describe('quoteForCard', () => {
	it('runs spaces and lines together', () => {
		expect(quoteForCard('  Fund  the\nplan ')).toBe('Fund the plan');
	});

	it('keeps a space taken out on its own, so the card has something to show', () => {
		expect(quoteForCard(' ')).toBe(' ');
	});

	it('cuts long text at 60 characters', () => {
		const quote = quoteForCard(
			'Calls upon all Member States to refrain from developing weapons systems'
		);

		expect(quote).toBe('Calls upon all Member States to refrain from developing…');
		expect(quote.length).toBeLessThanOrEqual(60);
	});
});

describe('readSuggestions', () => {
	it('gives each suggestion once, in the order its words are read, with what it would do', () => {
		expect(readSuggestions(PAPER)).toEqual([
			{ ...BEN, from: 5, to: 11, summary: { verb: 'replace', deleted: 'old', inserted: 'new' } },
			{ ...ANA, from: 17, to: 20, summary: { verb: 'add', inserted: 'now' } },
			{ ...CARA, from: 22, to: 23, summary: { verb: 'split' } },
			{ ...DAN, from: 31, to: 32, summary: { verb: 'join' } }
		]);
	});

	it('reads the same words out and back in as a change of format', () => {
		const document = paper(paragraph(deleted('plain', ANA), inserted(bold('plain'), ANA), ' text'));

		expect(readSuggestions(document)[0].summary).toEqual({ verb: 'format', text: 'plain' });
	});

	it('quotes words from two paragraphs with a space between them', () => {
		const document = paper(
			paragraph('One ', deleted('two', ANA)),
			paragraph(breakMarker('deleted', ANA), deleted('Three', ANA), ' four')
		);

		expect(readSuggestions(document)[0].summary).toEqual({ verb: 'delete', deleted: 'two Three' });
	});
});

describe('countSuggestions', () => {
	it('counts suggestions, not the pieces they are in', () => {
		expect(countSuggestions(PAPER)).toBe(4);
		expect(countSuggestions(paper(paragraph('Nothing suggested')))).toBe(0);
	});
});

describe('decideSuggestion', () => {
	it('accepting a replacement keeps the new words', () => {
		expect(decided('b1', 'accept')).toBe('The new plan {+now+} | {+¶+}Second | {-¶-}Third');
	});

	it('rejecting a replacement keeps the old words', () => {
		expect(decided('b1', 'reject')).toBe('The old plan {+now+} | {+¶+}Second | {-¶-}Third');
	});

	it('accepting a new paragraph keeps the break and drops its marker', () => {
		expect(decided('c1', 'accept')).toBe('The {-old-}{+new+} plan {+now+} | Second | {-¶-}Third');
	});

	it('rejecting a new paragraph joins it back on', () => {
		expect(decided('c1', 'reject')).toBe('The {-old-}{+new+} plan {+now+}Second | {-¶-}Third');
	});

	it('accepting a join joins the paragraphs', () => {
		expect(decided('d1', 'accept')).toBe('The {-old-}{+new+} plan {+now+} | {+¶+}SecondThird');
	});

	it('rejecting a join keeps the paragraphs apart', () => {
		expect(decided('d1', 'reject')).toBe('The {-old-}{+new+} plan {+now+} | {+¶+}Second | Third');
	});
});

describe('agreedDocument', () => {
	it('is the paper with every suggestion rejected', () => {
		const agreed = agreedDocument(PAPER);

		expect(shown(agreed)).toBe('The old plan Second | Third');
		expect(countSuggestions(agreed)).toBe(0);
	});

	it('drops a marker that no suggestion carries any more', () => {
		const document = paper(paragraph('One'), paragraph(`${BREAK_MARKER}Two`));

		expect(agreedDocument(document).child(1).textContent).toBe('Two');
	});

	it('gives back a paper not written live as it was, since it cannot hold suggestions', () => {
		const schema = getSchema(markdownDocumentExtensions());
		const document = ProseMirrorNode.fromJSON(schema, { type: 'doc', content: [paragraph('One')] });

		expect(agreedDocument(document)).toBe(document);
	});
});
