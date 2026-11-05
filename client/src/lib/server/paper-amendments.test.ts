import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	answerAmendment,
	decideAmendment,
	makeAmendmentUnfriendly,
	proposeAmendment,
	readAmendmentRules,
	readAmendmentsToAnswer,
	readCommitteeAmendments,
	readPaperAmendments,
	readPaperVersions,
	reorderAmendments,
	supportAmendment,
	withdrawAmendment
} from './paper-amendments';

// These tests are about how this module asks and what it makes of the
// answers. Who may do what, and the sentences each refusal carries, are the
// database's, tested in `tests/db/`.

type Answer = { data?: unknown; error: { code: string; message: string } | null };
type RecordedCall = { name: string; arguments: unknown[] };

/** A stand-in Supabase client that answers each function or table with what it is handed. */
function createStandIn(answers: Record<string, Answer> = {}) {
	const calls: RecordedCall[] = [];
	const answerFor = (name: string) => answers[name] ?? { data: null, error: null };

	function rpc(name: string, parameters: unknown) {
		calls.push({ name, arguments: [parameters] });
		return Promise.resolve(answerFor(name));
	}

	function from(table: string) {
		const call: RecordedCall = { name: table, arguments: [] };
		calls.push(call);

		const step =
			(stepName: string) =>
			(...stepArguments: unknown[]) => {
				call.arguments.push([stepName, ...stepArguments]);
				return builder;
			};

		const builder = {
			select: step('select'),
			eq: step('eq'),
			in: step('in'),
			is: step('is'),
			order: step('order'),
			single: step('single'),
			overrideTypes: () => Promise.resolve(answerFor(table))
		};

		return builder;
	}

	return { supabase: { rpc, from } as unknown as SupabaseClient, calls };
}

const REFUSED = { error: { code: '22023', message: 'The proposer’s support is counted already.' } };
const FAULT = { error: { code: 'XX000', message: 'down' } };

const ROW = {
	id: 'amendment-1',
	paper_id: 'paper-1',
	sequence: 2,
	proposed_by_seat_id: 'germany',
	action: 'change',
	target_part: 'operative',
	target_clause_id: 'o1',
	text_markdown: 'Words;',
	parent_amendment_id: null,
	status: 'awaiting_sponsors',
	is_friendly: false,
	queue_position: null,
	ruling: null,
	based_on_version_id: 'version-1',
	created_at: '2026-03-15T14:20:00Z',
	decided_at: null,
	proposer: { name: 'Germany' },
	amendment_seats: [
		{ seat_id: 'india', role: 'sponsor_answer', accepts: true, seat: { name: 'India' } },
		{ seat_id: 'ghana', role: 'sponsor_answer', accepts: null, seat: { name: 'Ghana' } },
		{ seat_id: 'kenya', role: 'signatory', accepts: null, seat: { name: 'Kenya' } }
	]
};

describe('readAmendmentRules', () => {
	it('reads the settings and counts the support with the database’s function', async () => {
		const { supabase, calls } = createStandIn({
			committees: {
				data: {
					has_friendly_amendments: true,
					preamble_amendable: false,
					has_second_degree_amendments: true,
					amendment_support_minimum: 20,
					amendment_support_unit: 'percent'
				},
				error: null
			},
			paper_support_needed: { data: 5, error: null }
		});

		expect(await readAmendmentRules(supabase, 'committee-1')).toEqual({
			hasFriendlyAmendments: true,
			isPreambleAmendable: false,
			hasSecondDegreeAmendments: true,
			supportNeeded: 5
		});
		expect(calls[1]).toEqual({
			name: 'paper_support_needed',
			arguments: [{ committee_id: 'committee-1', minimum: 20, unit: 'percent' }]
		});
	});

	it('throws when the settings cannot be read', async () => {
		const { supabase } = createStandIn({ committees: FAULT });

		await expect(readAmendmentRules(supabase, 'committee-1')).rejects.toThrow('down');
	});
});

describe('readPaperVersions', () => {
	it('reads every version in order, with empty clauses where one holds none', async () => {
		const content = { preamble: [{ id: 'p1', markdown: 'Recalling,' }], operative: [] };
		const { supabase } = createStandIn({
			committee_paper_versions: {
				data: [
					{ id: 'version-1', version_number: 1, content },
					{ id: 'version-2', version_number: 2, content: null }
				],
				error: null
			}
		});

		expect(await readPaperVersions(supabase, 'paper-1')).toEqual([
			{ id: 'version-1', versionNumber: 1, content },
			{ id: 'version-2', versionNumber: 2, content: { preamble: [], operative: [] } }
		]);
	});
});

describe('readPaperAmendments', () => {
	it('reads each amendment with its proposer, the sponsors’ answers and its supporters', async () => {
		const { supabase } = createStandIn({ amendments: { data: [ROW], error: null } });
		const [amendment] = await readPaperAmendments(supabase, 'paper-1');

		expect(amendment).toMatchObject({
			id: 'amendment-1',
			sequence: 2,
			proposerName: 'Germany',
			targetPart: 'operative',
			status: 'awaiting_sponsors',
			sponsorAnswers: [
				{ seatId: 'ghana', seatName: 'Ghana', accepts: null },
				{ seatId: 'india', seatName: 'India', accepts: true }
			],
			supporterSeatIds: ['kenya']
		});
	});

	it('throws when they cannot be read', async () => {
		const { supabase } = createStandIn({ amendments: FAULT });

		await expect(readPaperAmendments(supabase, 'paper-1')).rejects.toThrow('down');
	});
});

describe('readCommitteeAmendments', () => {
	it('reads the committee’s waiting amendments with the draft each amends', async () => {
		const paper = {
			id: 'paper-1',
			title: 'Weapons',
			topic_number: 1,
			sequence: 2,
			committee_id: 'c'
		};
		const { supabase, calls } = createStandIn({
			amendments: { data: [{ ...ROW, status: 'with_the_dais', paper }], error: null }
		});
		const [amendment] = await readCommitteeAmendments(supabase, 'c');

		expect(amendment.paper).toEqual({
			id: 'paper-1',
			title: 'Weapons',
			topicNumber: 1,
			sequence: 2
		});
		expect(calls[0].arguments).toContainEqual(['eq', 'paper.committee_id', 'c']);
		expect(calls[0].arguments).toContainEqual(['in', 'status', ['with_the_dais', 'approved']]);
	});
});

describe('readAmendmentsToAnswer', () => {
	it('reads what a sponsor’s seat has still to answer, by number', async () => {
		const paper = { id: 'paper-1', topic_number: 1, sequence: 2, committee_id: 'c' };
		const { supabase } = createStandIn({
			amendment_seats: {
				data: [
					{ amendment: { sequence: 5, status: 'awaiting_sponsors', paper } },
					{ amendment: { sequence: 3, status: 'awaiting_sponsors', paper } }
				],
				error: null
			}
		});

		expect(await readAmendmentsToAnswer(supabase, 'c', 'ghana')).toEqual([
			{ sequence: 3, paper: { id: 'paper-1', topicNumber: 1, sequence: 2 } },
			{ sequence: 5, paper: { id: 'paper-1', topicNumber: 1, sequence: 2 } }
		]);
	});
});

describe('proposeAmendment', () => {
	const proposal = {
		action: 'add' as const,
		targetPart: 'operative' as const,
		targetClauseId: null,
		textMarkdown: 'Affirms;'
	};

	it('asks propose_amendment and hands back the new id', async () => {
		const { supabase, calls } = createStandIn({
			propose_amendment: { data: 'new-id', error: null }
		});

		expect(await proposeAmendment(supabase, 'paper-1', proposal, null)).toEqual({
			refusal: null,
			amendmentId: 'new-id'
		});
		expect(calls[0].arguments[0]).toEqual({
			paper_id: 'paper-1',
			action: 'add',
			target_part: 'operative',
			target_clause_id: null,
			text_markdown: 'Affirms;',
			parent_amendment_id: null
		});
	});

	it('hands back a refusal, and throws on a fault', async () => {
		const refused = createStandIn({ propose_amendment: REFUSED });
		const faulty = createStandIn({ propose_amendment: FAULT });

		expect(await proposeAmendment(refused.supabase, 'paper-1', proposal, 'parent')).toEqual({
			refusal: 'The proposer’s support is counted already.',
			amendmentId: null
		});
		await expect(proposeAmendment(faulty.supabase, 'paper-1', proposal, null)).rejects.toThrow(
			'down'
		);
	});
});

describe('answerAmendment, makeAmendmentUnfriendly, supportAmendment and withdrawAmendment', () => {
	it('ask the database functions, and hand back their refusals', async () => {
		const { supabase, calls } = createStandIn({ sign_amendment: REFUSED });

		expect(await answerAmendment(supabase, 'a', false)).toEqual({ refusal: null });
		expect(await makeAmendmentUnfriendly(supabase, 'a')).toEqual({ refusal: null });
		expect(await supportAmendment(supabase, 'a')).toEqual({
			refusal: 'The proposer’s support is counted already.'
		});
		expect(await withdrawAmendment(supabase, 'a')).toEqual({ refusal: null });
		expect(calls).toEqual([
			{ name: 'answer_amendment', arguments: [{ amendment_id: 'a', accepts: false }] },
			{ name: 'make_amendment_unfriendly', arguments: [{ amendment_id: 'a' }] },
			{ name: 'sign_amendment', arguments: [{ amendment_id: 'a' }] },
			{ name: 'withdraw_amendment', arguments: [{ amendment_id: 'a' }] }
		]);
	});
});

describe('decideAmendment and reorderAmendments', () => {
	it('send the dais’s decisions and its new order', async () => {
		const { supabase, calls } = createStandIn();

		await decideAmendment(supabase, 'a', { kind: 'approve' });
		await decideAmendment(supabase, 'b', { kind: 'out_of_order', ruling: 'Not germane.' });
		await reorderAmendments(supabase, 'c', ['b', 'a']);

		expect(calls).toEqual([
			{
				name: 'decide_amendment',
				arguments: [{ amendment_id: 'a', decision: 'approve', ruling: null }]
			},
			{
				name: 'decide_amendment',
				arguments: [{ amendment_id: 'b', decision: 'out_of_order', ruling: 'Not germane.' }]
			},
			{ name: 'reorder_amendments', arguments: [{ committee_id: 'c', amendment_ids: ['b', 'a'] }] }
		]);
	});

	it('throws on a fault', async () => {
		const { supabase } = createStandIn({ reorder_amendments: FAULT });

		await expect(reorderAmendments(supabase, 'c', [])).rejects.toThrow('down');
	});
});
