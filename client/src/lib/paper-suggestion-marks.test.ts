// @vitest-environment jsdom
// Reading marks back from the page needs a page, so this file runs in jsdom's
// pretend browser rather than in plain Node like most tests beside it.

import { DOMParser, DOMSerializer } from '@tiptap/pm/model';
import { describe, expect, it } from 'vitest';
import {
	PAPER_SCHEMA,
	deleted,
	inserted,
	paper,
	paragraph,
	shown,
	suggestion
} from '../../tests/paper-suggestion-fixtures';
import {
	BREAK_MARKER,
	SUGGESTED_DELETION,
	SUGGESTED_INSERTION,
	suggestionMarkExtensions
} from './paper-suggestion-marks';

const BEN = suggestion('b1', 'ben', '2026-10-09T14:05:00.000Z');

/** The paper drawn into a page, the way the editor draws it. */
function drawn(document: ReturnType<typeof paper>): HTMLElement {
	const page = window.document.createElement('div');
	page.append(DOMSerializer.fromSchema(PAPER_SCHEMA).serializeFragment(document.content));

	return page;
}

/** What ProseMirror reads back from `html`, as it does after the browser changes the page. */
function readBack(html: string) {
	const page = window.document.createElement('div');
	page.innerHTML = html;

	return DOMParser.fromSchema(PAPER_SCHEMA).parse(page);
}

describe('suggestionMarkExtensions', () => {
	it('gives the mark for added words and the mark for words taken out', () => {
		const names = suggestionMarkExtensions().map((extension) => extension.name);

		expect(names).toEqual([SUGGESTED_INSERTION, SUGGESTED_DELETION]);
	});

	it('draws added words as <ins> and taken-out ones as <del>, saying whose they are', () => {
		const page = drawn(
			paper(paragraph('The ', deleted('old', BEN), inserted('new', BEN), ' plan'))
		);

		const insertion = page.querySelector('ins');
		expect(insertion?.textContent).toBe('new');
		expect(insertion?.dataset).toMatchObject({
			suggestion: 'b1',
			suggestionBy: 'ben',
			suggestionAt: '2026-10-09T14:05:00.000Z'
		});
		expect(page.querySelector('del')?.textContent).toBe('old');
	});

	it('reads its own marks back from the page with everything they carried', () => {
		const document = paper(paragraph('The ', deleted('old', BEN), inserted('new', BEN), ' plan'));

		const read = readBack(drawn(document).innerHTML);

		expect(read.eq(document)).toBe(true);
	});

	it('leaves a plain <del> to the strike-through mark', () => {
		const read = readBack('<p><del>old</del> and <del data-suggestion="b1">older</del></p>');
		const marks = read.firstChild?.content.content.map((child) => child.marks[0]?.type.name);

		expect(marks).toEqual(['strike', undefined, SUGGESTED_DELETION]);
	});

	it('lets one suggestion take out words another one added', () => {
		const cara = suggestion('c1', 'cara');
		const both = PAPER_SCHEMA.text('new', [
			PAPER_SCHEMA.marks[SUGGESTED_INSERTION].create(BEN),
			PAPER_SCHEMA.marks[SUGGESTED_DELETION].create(cara)
		]);

		expect(shown(paper(paragraph(both.toJSON())))).toBe('{-{+new+}-}');
	});

	it('marks a suggested break with a zero-width space, which takes no room', () => {
		expect(BREAK_MARKER).toBe('​');
	});
});
