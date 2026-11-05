import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { seedPaperDocument, bytesToBase64 } from '$lib/paper-document';
import {
	approvePaper,
	listDaisPapers,
	readDaisReview,
	readDaisWriter,
	returnPaper,
	withdrawPaper
} from './chair-resolutions';

// These tests are about how this module asks and what it makes of the
// answers. Who may approve, return or withdraw, and the sentences each
// refusal carries, are the database's, tested in `tests/db/`.

type Answer = { data?: unknown; error: { code: string; message: string } | null };
type RecordedCall = { name: string; arguments: unknown[] };

/**
 * A stand-in Supabase client. Each function answers with what it is handed;
 * each table with the next of the answers it is handed, in the order asked.
 */
function createStandIn(answers: Record<string, Answer | Answer[]> = {}) {
	const calls: RecordedCall[] = [];
	const answerFor = (name: string): Answer => {
		const answer = answers[name] ?? { data: null, error: null };
		return Array.isArray(answer) ? (answer.shift() ?? { data: null, error: null }) : answer;
	};

	function rpc(name: string, parameters: unknown) {
		calls.push({ name, arguments: [parameters] });
		return Promise.resolve(answerFor(name));
	}

	function from(table: string) {
		const call: RecordedCall = { name: table, arguments: [] };
		calls.push(call);
		// Taken now, so two reads of one table in a `Promise.all` get their answers in order.
		const answer = answerFor(table);

		const step =
			(stepName: string) =>
			(...stepArguments: unknown[]) => {
				call.arguments.push([stepName, ...stepArguments]);
				return builder;
			};

		// Some reads are awaited straight after their filters, so the builder is a promise too.
		const builder = {
			select: step('select'),
			eq: step('eq'),
			in: step('in'),
			not: step('not'),
			order: step('order'),
			limit: step('limit'),
			single: step('single'),
			maybeSingle: step('maybeSingle'),
			overrideTypes: () => Promise.resolve(answer),
			then: (resolve: (answer: Answer) => unknown) => resolve(answer)
		};

		return builder;
	}

	return { supabase: { rpc, from } as unknown as SupabaseClient, calls };
}

const REFUSED = { error: { code: '22023', message: 'Draft resolution 1.1 is already taken.' } };
const FAULT = { error: { code: 'XX000', message: 'down' } };

describe('listDaisPapers', () => {
	it("reads the committee's submitted papers of the dais's kinds, with the lead seat's name", async () => {
		const { supabase, calls } = createStandIn({
			committee_papers: {
				data: [
					{
						id: 'paper-1',
						kind: 'draft_resolution',
						status: 'submitted',
						title: 'Human control',
						topic: 'Lethal autonomous weapons',
						topic_number: null,
						sequence: null,
						submitted_at: '2027-03-15T08:12:00Z',
						lead_seat: { name: 'Austria' }
					},
					{
						id: 'paper-2',
						kind: 'working_paper',
						status: 'approved',
						title: 'Verification',
						topic: null,
						topic_number: 1,
						sequence: 2,
						submitted_at: '2027-03-15T07:00:00Z',
						lead_seat: null
					}
				],
				error: null
			}
		});

		const papers = await listDaisPapers(supabase, 'committee-1');

		expect(papers).toEqual([
			{
				id: 'paper-1',
				kind: 'draft_resolution',
				status: 'submitted',
				title: 'Human control',
				topic: 'Lethal autonomous weapons',
				topicNumber: null,
				sequence: null,
				leadSeatName: 'Austria',
				submittedAt: '2027-03-15T08:12:00Z'
			},
			expect.objectContaining({ id: 'paper-2', leadSeatName: null, topicNumber: 1, sequence: 2 })
		]);
		expect(calls[0].arguments).toContainEqual(['eq', 'committee_id', 'committee-1']);
		expect(calls[0].arguments).toContainEqual([
			'in',
			'kind',
			['working_paper', 'draft_resolution', 'committee_directive']
		]);
		expect(calls[0].arguments).toContainEqual(['not', 'submitted_at', 'is', null]);
	});

	it('throws when the papers cannot be read', async () => {
		const { supabase } = createStandIn({ committee_papers: FAULT });

		await expect(listDaisPapers(supabase, 'committee-1')).rejects.toThrow('down');
	});
});

describe('readDaisReview', () => {
	const PAPER = { id: 'paper-1', kind: 'draft_resolution' as const };

	it('reads the submitted document in base64, the latest version and the numbers taken', async () => {
		const state = seedPaperDocument('Recalling its resolution 78/241,');
		const { supabase, calls } = createStandIn({
			committee_paper_documents: {
				data: { document_state: `\\x${Buffer.from(state).toString('hex')}` },
				error: null
			},
			committee_papers: { data: [{ topic_number: 1, sequence: 1 }], error: null },
			committee_paper_versions: { data: [{ version_number: 2 }], error: null }
		});

		expect(await readDaisReview(supabase, 'committee-1', PAPER)).toEqual({
			documentState: bytesToBase64(state),
			version: 2,
			numbered: [{ kind: 'draft_resolution', topicNumber: 1, sequence: 1 }]
		});
		// The document is read from its own table, which only the authors and the dais may read.
		expect(calls[0].name).toBe('committee_paper_documents');
		expect(calls[0].arguments).toContainEqual(['eq', 'paper_id', 'paper-1']);
		expect(calls[2].arguments).toContainEqual(['eq', 'kind', 'draft_resolution']);
	});

	it('has no document and no version for a paper saved only as Markdown and not yet frozen', async () => {
		const { supabase } = createStandIn({
			committee_paper_documents: { data: null, error: null },
			committee_papers: { data: [], error: null },
			committee_paper_versions: { data: [], error: null }
		});

		expect(await readDaisReview(supabase, 'committee-1', PAPER)).toEqual({
			documentState: null,
			version: null,
			numbered: []
		});
	});

	it('has no document when the stored bytes are not a paper, so the page seeds it from the text', async () => {
		// The authors wrote the stored document, so it may hold anything (security review, L52).
		const { supabase } = createStandIn({
			committee_paper_documents: { data: { document_state: '\\xdeadbeef' }, error: null },
			committee_papers: { data: [], error: null },
			committee_paper_versions: { data: [{ version_number: 1 }], error: null }
		});

		expect(await readDaisReview(supabase, 'committee-1', PAPER)).toEqual({
			documentState: null,
			version: 1,
			numbered: []
		});
	});

	it('throws when a read fails', async () => {
		const { supabase } = createStandIn({
			committee_paper_documents: { data: null, error: null },
			committee_papers: { data: [], error: null },
			committee_paper_versions: FAULT
		});

		await expect(readDaisReview(supabase, 'committee-1', PAPER)).rejects.toThrow('down');
	});
});

describe('approvePaper, returnPaper and withdrawPaper', () => {
	it('ask the database functions, and hand back their refusals', async () => {
		const { supabase, calls } = createStandIn({ approve_paper: REFUSED });

		expect(await approvePaper(supabase, 'paper-1', { topicNumber: 1, sequence: 1 })).toEqual({
			refusal: 'Draft resolution 1.1 is already taken.'
		});
		expect(await returnPaper(supabase, 'paper-1', 'Number the clauses.')).toEqual({
			refusal: null
		});
		expect(await withdrawPaper(supabase, 'paper-1')).toEqual({ refusal: null });
		expect(calls).toEqual([
			{
				name: 'approve_paper',
				arguments: [{ paper_id: 'paper-1', topic_number: 1, sequence: 1 }]
			},
			{
				name: 'return_paper',
				arguments: [{ paper_id: 'paper-1', comment: 'Number the clauses.' }]
			},
			{ name: 'withdraw_paper', arguments: [{ paper_id: 'paper-1' }] }
		]);
	});

	it('throws on a fault rather than showing it as a refusal', async () => {
		const { supabase } = createStandIn({ withdraw_paper: FAULT });

		await expect(withdrawPaper(supabase, 'paper-1')).rejects.toThrow('down');
	});
});

describe('readDaisWriter', () => {
	it("names the reader and their title on the committee's dais", async () => {
		const { supabase, calls } = createStandIn({
			profiles: { data: { full_name: 'Eleanor Price' }, error: null },
			committee_chairs: { data: { title: 'Chair' }, error: null }
		});

		expect(await readDaisWriter(supabase, 'committee-1', 'user-1')).toEqual({
			name: 'Eleanor Price',
			title: 'Chair'
		});
		expect(calls.find((call) => call.name === 'committee_chairs')?.arguments).toContainEqual([
			'eq',
			'user_id',
			'user-1'
		]);
	});

	it('has no title for somebody who runs the room without a seat on the dais', async () => {
		const { supabase } = createStandIn({
			profiles: { data: { full_name: 'Organiser' }, error: null },
			committee_chairs: { data: null, error: null }
		});

		expect(await readDaisWriter(supabase, 'committee-1', 'user-1')).toEqual({
			name: 'Organiser',
			title: null
		});
	});

	it('throws when the title cannot be read', async () => {
		const { supabase } = createStandIn({ committee_chairs: FAULT });

		await expect(readDaisWriter(supabase, 'committee-1', 'user-1')).rejects.toThrow('down');
	});
});
