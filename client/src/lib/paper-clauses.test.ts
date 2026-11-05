import { describe, expect, it } from 'vitest';
import {
	applyAmendment,
	clauseContentFromMarkdown,
	clauseName,
	numberedClauses,
	operativeClausesFromMarkdown,
	positionLetters,
	preambulatoryClausesFromMarkdown,
	romanNumeral,
	type ClauseContent,
	type OperativeClause
} from './paper-clauses';

// What the editor writes for a short draft on autonomous weapons: two
// preambulatory clauses, and two operative clauses, the first with
// sub-clauses and one of those with its own.
const PREAMBLE_MARKDOWN = [
	'*Recalling* its resolutions 78/241 and 79/62,',
	'',
	'Alarmed by weapons that select and engage targets without human control,'
].join('\n');

const OPERATIVE_MARKDOWN = [
	'1. Calls upon all States to:',
	'   a. keep human control over the use of force;',
	'      i. in the selection of targets;',
	'      ii. in the decision to engage them;',
	'   b. review new weapons before they are used;',
	'2. Requests the Secretary-General to report at the eighty-first session.'
].join('\n');

const CONTENT: ClauseContent = {
	preamble: [
		{ id: 'p1', markdown: '*Recalling* its resolutions 78/241 and 79/62,' },
		{
			id: 'p2',
			markdown: 'Alarmed by weapons that select and engage targets without human control,'
		}
	],
	operative: [
		{
			id: 'o1',
			markdown: 'Calls upon all States to:',
			children: [
				{
					id: 'o1a',
					markdown: 'keep human control over the use of force;',
					children: [
						{ id: 'o1a1', markdown: 'in the selection of targets;', children: [] },
						{ id: 'o1a2', markdown: 'in the decision to engage them;', children: [] }
					]
				},
				{ id: 'o1b', markdown: 'review new weapons before they are used;', children: [] }
			]
		},
		{
			id: 'o2',
			markdown: 'Requests the Secretary-General to report at the eighty-first session.',
			children: []
		}
	]
};

/** The clauses' texts as nested lists, to compare shapes without the ids. */
function shapeOf(clauses: OperativeClause[]): unknown[] {
	return clauses.map((clause) =>
		clause.children.length === 0 ? clause.markdown : [clause.markdown, shapeOf(clause.children)]
	);
}

describe('preambulatoryClausesFromMarkdown', () => {
	it('makes a clause of each paragraph, with the ids p1, p2', () => {
		expect(preambulatoryClausesFromMarkdown(PREAMBLE_MARKDOWN)).toEqual(CONTENT.preamble);
	});

	it('joins the lines of one paragraph, line breaks included', () => {
		const markdown =
			'Recalling its resolution 78/241\nof 22 December 2023,  \nand 79/62,\\\nof 2024,';

		expect(preambulatoryClausesFromMarkdown(markdown)).toEqual([
			{
				id: 'p1',
				markdown: 'Recalling its resolution 78/241 of 22 December 2023, and 79/62, of 2024,'
			}
		]);
	});

	it('starts a clause at each list item, without its marker', () => {
		const markdown = '- Recalling its resolutions,\n- Noting the report,\n1. Alarmed by the speed,';

		expect(preambulatoryClausesFromMarkdown(markdown).map((clause) => clause.markdown)).toEqual([
			'Recalling its resolutions,',
			'Noting the report,',
			'Alarmed by the speed,'
		]);
	});

	it('reads the line endings a text area sends', () => {
		const markdown = 'Recalling its resolutions,\r\n\r\nNoting the report,';

		expect(preambulatoryClausesFromMarkdown(markdown)).toHaveLength(2);
	});

	it('has no clause where there are no words', () => {
		expect(preambulatoryClausesFromMarkdown('')).toEqual([]);
		expect(preambulatoryClausesFromMarkdown('\n\n   \n-\n')).toEqual([]);
	});
});

describe('operativeClausesFromMarkdown', () => {
	it('reads the numbered list the editor writes', () => {
		expect(operativeClausesFromMarkdown(OPERATIVE_MARKDOWN)).toEqual(CONTENT.operative);
	});

	it('reads the editor’s list with numbers at every level', () => {
		const markdown = [
			'1. Calls upon all States to:',
			'   1. keep human control over the use of force;',
			'      1. in the selection of targets;',
			'      2. in the decision to engage them;',
			'   2. review new weapons before they are used;',
			'2. Requests the Secretary-General to report at the eighty-first session.'
		].join('\n');

		expect(operativeClausesFromMarkdown(markdown)).toEqual(CONTENT.operative);
	});

	it('reads sub-clauses two spaces in, with brackets or bullets', () => {
		const bracketed = '1. Calls upon:\n  a) all States;\n  b) all others;\n2. Requests.';
		const bulleted = '- Calls upon:\n  - all States;\n  - all others;\n- Requests.';
		const shape = [['Calls upon:', ['all States;', 'all others;']], 'Requests.'];

		expect(shapeOf(operativeClausesFromMarkdown(bracketed))).toEqual(shape);
		expect(shapeOf(operativeClausesFromMarkdown(bulleted))).toEqual(shape);
	});

	it('takes paragraphs without numbers as clauses', () => {
		const markdown = 'Calls upon all States to act;\n\nRequests a report.';

		expect(operativeClausesFromMarkdown(markdown)).toEqual([
			{ id: 'o1', markdown: 'Calls upon all States to act;', children: [] },
			{ id: 'o2', markdown: 'Requests a report.', children: [] }
		]);
	});

	it('carries a clause on over line breaks and into an indented paragraph', () => {
		const markdown =
			'1. Calls upon all States\nto act  \nat once,\n\n   and to report;\n2. Requests.';

		expect(shapeOf(operativeClausesFromMarkdown(markdown))).toEqual([
			'Calls upon all States to act at once, and to report;',
			'Requests.'
		]);
	});

	it('counts a tab as four spaces', () => {
		const markdown = '1. Calls upon:\n\ta. all States;\n2. Requests.';

		expect(shapeOf(operativeClausesFromMarkdown(markdown))).toEqual([
			['Calls upon:', ['all States;']],
			'Requests.'
		]);
	});

	it('keeps a list deeper than three levels at the third', () => {
		const markdown =
			'1. Calls upon:\n   a. all States:\n      i. to act;\n         1. at once;\n2. Requests.';

		expect(operativeClausesFromMarkdown(markdown)[0].children[0].children).toEqual([
			{ id: 'o1a1', markdown: 'to act;', children: [] },
			{ id: 'o1a2', markdown: 'at once;', children: [] }
		]);
	});

	it('makes a first sub-clause that starts further in a sibling of the next', () => {
		const markdown = '1. Calls upon:\n      i. all States;\n   a. all others;\n2. Requests.';

		expect(shapeOf(operativeClausesFromMarkdown(markdown))).toEqual([
			['Calls upon:', ['all States;', 'all others;']],
			'Requests.'
		]);
	});

	it('leaves out items with no words and moves their sub-clauses up', () => {
		const markdown = '1. Calls upon all States;\n2. \n   a. Urges all others;\n3. Requests.';

		expect(operativeClausesFromMarkdown(markdown)).toEqual([
			{ id: 'o1', markdown: 'Calls upon all States;', children: [] },
			{ id: 'o2', markdown: 'Urges all others;', children: [] },
			{ id: 'o3', markdown: 'Requests.', children: [] }
		]);
	});

	it('gives the twenty-seventh sub-clause the id o1aa', () => {
		const subClauses = Array.from({ length: 27 }, (_, index) => `   a. part ${index + 1};`);
		const markdown = ['1. Calls upon all States to:', ...subClauses].join('\n');
		const ids = operativeClausesFromMarkdown(markdown)[0].children.map((clause) => clause.id);

		expect(ids.slice(24)).toEqual(['o1y', 'o1z', 'o1aa']);
	});

	it('has no clause where there are no words', () => {
		expect(operativeClausesFromMarkdown('')).toEqual([]);
		expect(operativeClausesFromMarkdown('1.\n2. \n\n')).toEqual([]);
	});

	it('reads a long run of spaces after a number in a moment', () => {
		// A lone carriage return ends no line here, so this line is not a list
		// item. Finding that out once took a time that grew with the square of
		// the spaces: six seconds for 100,000, on the server that submits it.
		const line = `1.${' '.repeat(100_000)}\rCalls upon all States.`;
		const startedAt = performance.now();

		const clauses = operativeClausesFromMarkdown(line);

		expect(performance.now() - startedAt).toBeLessThan(1_000);
		expect(clauses).toEqual([{ id: 'o1', markdown: line, children: [] }]);
	});
});

describe('clauseContentFromMarkdown', () => {
	it('turns both parts of a draft resolution into clauses', () => {
		expect(clauseContentFromMarkdown(PREAMBLE_MARKDOWN, OPERATIVE_MARKDOWN)).toEqual(CONTENT);
	});

	it('gives a committee directive an empty preamble', () => {
		expect(clauseContentFromMarkdown('', '1. Orders the fleet home.')).toEqual({
			preamble: [],
			operative: [{ id: 'o1', markdown: 'Orders the fleet home.', children: [] }]
		});
	});
});

describe('positionLetters and romanNumeral', () => {
	it('names positions the way a spreadsheet names columns', () => {
		expect([1, 2, 26, 27, 28, 52, 53, 702, 703].map(positionLetters)).toEqual([
			'a',
			'b',
			'z',
			'aa',
			'ab',
			'az',
			'ba',
			'zz',
			'aaa'
		]);
	});

	it('writes small roman numerals', () => {
		expect([1, 2, 3, 4, 5, 9, 10, 14, 40, 1994].map(romanNumeral)).toEqual([
			'i',
			'ii',
			'iii',
			'iv',
			'v',
			'ix',
			'x',
			'xiv',
			'xl',
			'mcmxciv'
		]);
	});
});

describe('numberedClauses', () => {
	it('numbers every clause in reading order', () => {
		const numbered = numberedClauses(CONTENT).map((clause) => [
			clause.id,
			clause.level,
			clause.marker,
			clause.reference
		]);

		expect(numbered).toEqual([
			['p1', 0, '', '1'],
			['p2', 0, '', '2'],
			['o1', 1, '1.', '1'],
			['o1a', 2, '(a)', '1(a)'],
			['o1a1', 3, '(i)', '1(a)(i)'],
			['o1a2', 3, '(ii)', '1(a)(ii)'],
			['o1b', 2, '(b)', '1(b)'],
			['o2', 1, '2.', '2']
		]);
	});

	it('numbers clauses by where they stand now, not by their ids', () => {
		const amended = applyAmendment(CONTENT, {
			action: 'add',
			targetPart: 'operative',
			targetClauseId: 'o1',
			textMarkdown: 'Encourages regional agreements;',
			sequence: 3
		});
		const references = numberedClauses(amended)
			.filter((clause) => clause.level === 1)
			.map((clause) => [clause.id, clause.reference]);

		expect(references).toEqual([
			['o1', '1'],
			['a3', '2'],
			['o2', '3']
		]);
	});
});

describe('clauseName', () => {
	it('names operative clauses by their reference and preambulatory ones by their part', () => {
		const names = numberedClauses(CONTENT).map(clauseName);

		expect(names).toContain('clause 1(a)(ii)');
		expect(names).toContain('clause 2');
		expect(names).toContain('preambulatory clause 2');
	});
});

describe('applyAmendment', () => {
	it('changes a clause and keeps its sub-clauses', () => {
		const amended = applyAmendment(CONTENT, {
			action: 'change',
			targetPart: 'operative',
			targetClauseId: 'o1',
			textMarkdown: 'Urges all States to:',
			sequence: 1
		});

		expect(amended.operative[0]).toEqual({
			...CONTENT.operative[0],
			markdown: 'Urges all States to:'
		});
		expect(amended.preamble).toEqual(CONTENT.preamble);
	});

	it('changes a sub-clause at any level', () => {
		const amended = applyAmendment(CONTENT, {
			action: 'change',
			targetPart: 'operative',
			targetClauseId: 'o1a2',
			textMarkdown: 'in every decision to engage them;',
			sequence: 1
		});

		expect(amended.operative[0].children[0].children[1]).toEqual({
			id: 'o1a2',
			markdown: 'in every decision to engage them;',
			children: []
		});
	});

	it('strikes a clause with its sub-clauses', () => {
		const amended = applyAmendment(CONTENT, {
			action: 'strike',
			targetPart: 'operative',
			targetClauseId: 'o1',
			textMarkdown: null,
			sequence: 1
		});

		expect(amended.operative).toEqual([CONTENT.operative[1]]);
	});

	it('strikes a sub-clause, and the next one takes its letter', () => {
		const amended = applyAmendment(CONTENT, {
			action: 'strike',
			targetPart: 'operative',
			targetClauseId: 'o1a',
			textMarkdown: null,
			sequence: 1
		});

		expect(amended.operative[0].children.map((clause) => clause.id)).toEqual(['o1b']);
		expect(numberedClauses(amended).find((clause) => clause.id === 'o1b')?.reference).toBe('1(a)');
	});

	it('adds a clause after its clause and that clause’s sub-clauses, at the same level', () => {
		const amended = applyAmendment(CONTENT, {
			action: 'add',
			targetPart: 'operative',
			targetClauseId: 'o1',
			textMarkdown: 'Encourages regional agreements;',
			sequence: 3
		});

		expect(amended.operative).toEqual([
			CONTENT.operative[0],
			{ id: 'a3', markdown: 'Encourages regional agreements;', children: [] },
			CONTENT.operative[1]
		]);
	});

	it('adds a sub-clause after another', () => {
		const amended = applyAmendment(CONTENT, {
			action: 'add',
			targetPart: 'operative',
			targetClauseId: 'o1b',
			textMarkdown: 'share the results of those reviews;',
			sequence: 4
		});

		expect(amended.operative[0].children.map((clause) => clause.id)).toEqual(['o1a', 'o1b', 'a4']);
	});

	it('adds a clause at the start of its part when it names none', () => {
		const operative = applyAmendment(CONTENT, {
			action: 'add',
			targetPart: 'operative',
			targetClauseId: null,
			textMarkdown: 'Affirms that international law applies;',
			sequence: 2
		}).operative;
		const preamble = applyAmendment(CONTENT, {
			action: 'add',
			targetPart: 'preamble',
			targetClauseId: null,
			textMarkdown: 'Guided by the Charter,',
			sequence: 2
		}).preamble;

		expect(operative[0]).toEqual({
			id: 'a2',
			markdown: 'Affirms that international law applies;',
			children: []
		});
		expect(preamble.map((clause) => clause.id)).toEqual(['a2', 'p1', 'p2']);
	});

	it('amends the preamble, whose clauses have no sub-clauses', () => {
		const changed = applyAmendment(CONTENT, {
			action: 'change',
			targetPart: 'preamble',
			targetClauseId: 'p2',
			textMarkdown: 'Deeply alarmed,',
			sequence: 1
		});
		const added = applyAmendment(CONTENT, {
			action: 'add',
			targetPart: 'preamble',
			targetClauseId: 'p1',
			textMarkdown: 'Noting the report,',
			sequence: 2
		});
		const struck = applyAmendment(CONTENT, {
			action: 'strike',
			targetPart: 'preamble',
			targetClauseId: 'p1',
			textMarkdown: null,
			sequence: 3
		});

		expect(changed.preamble[1]).toEqual({ id: 'p2', markdown: 'Deeply alarmed,' });
		expect(added.preamble[1]).toEqual({ id: 'a2', markdown: 'Noting the report,' });
		expect(struck.preamble).toEqual([CONTENT.preamble[1]]);
		expect(struck.operative).toEqual(CONTENT.operative);
	});

	it('leaves the text as it was when its clause is not there', () => {
		const amended = applyAmendment(CONTENT, {
			action: 'strike',
			targetPart: 'operative',
			targetClauseId: 'p1',
			textMarkdown: null,
			sequence: 1
		});

		expect(amended).toEqual(CONTENT);
	});

	it('leaves the text it was given unchanged', () => {
		const before = structuredClone(CONTENT);

		applyAmendment(CONTENT, {
			action: 'change',
			targetPart: 'operative',
			targetClauseId: 'o1a1',
			textMarkdown: 'in choosing targets;',
			sequence: 1
		});

		expect(CONTENT).toEqual(before);
	});
});
