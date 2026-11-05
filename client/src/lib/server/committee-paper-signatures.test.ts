import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PaperPerson } from '$lib/committee-papers';
import {
	readPaperSupport,
	removeSignature,
	setSignaturesOpen,
	signPaper
} from './committee-paper-signatures';

// These tests are about how this module asks and what it makes of the
// answers. Who may sign, and the sentences each refusal carries, are the
// database's, tested in `tests/db/committee-papers.test.ts`.

type Answer = { data?: unknown; count?: number; error: { code: string; message: string } | null };
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

		// The seat count is awaited straight after its filters, so the builder is a promise too.
		const builder = {
			select: step('select'),
			eq: step('eq'),
			not: step('not'),
			single: step('single'),
			overrideTypes: () => Promise.resolve(answerFor(table)),
			then: (resolve: (answer: Answer) => unknown) => resolve(answerFor(table))
		};

		return builder;
	}

	return { supabase: { rpc, from } as unknown as SupabaseClient, calls };
}

const REFUSED = { error: { code: '22023', message: 'This paper is not open for signatures.' } };
const FAULT = { error: { code: 'XX000', message: 'down' } };

describe('setSignaturesOpen, signPaper and removeSignature', () => {
	it('ask the database functions, and hand back their refusals', async () => {
		const { supabase, calls } = createStandIn({ sign_paper: REFUSED });

		expect(await setSignaturesOpen(supabase, 'paper-1', true)).toEqual({ refusal: null });
		expect(await signPaper(supabase, 'paper-1')).toEqual({
			refusal: 'This paper is not open for signatures.'
		});
		expect(await removeSignature(supabase, 'paper-1')).toEqual({ refusal: null });
		expect(calls).toEqual([
			{ name: 'set_paper_signatures_open', arguments: [{ paper_id: 'paper-1', is_open: true }] },
			{ name: 'sign_paper', arguments: [{ paper_id: 'paper-1' }] },
			{ name: 'remove_signature', arguments: [{ paper_id: 'paper-1' }] }
		]);
	});

	it('throws on a fault rather than showing it as a refusal', async () => {
		const { supabase } = createStandIn({ remove_signature: FAULT });

		await expect(removeSignature(supabase, 'paper-1')).rejects.toThrow('down');
	});
});

describe('readPaperSupport', () => {
	const sponsor: PaperPerson = {
		seatId: 'ghana',
		seatName: 'Ghana',
		countryCode: 'GH',
		holderId: null,
		holderName: null,
		role: 'author',
		isLead: true,
		isMine: true
	};

	it('counts against what the committee asks for now', async () => {
		const { supabase, calls } = createStandIn({
			committees: {
				data: {
					support_minimum: 20,
					support_unit: 'percent',
					support_counts_sponsors: true,
					sponsor_limit: 5,
					checks_format: true
				},
				error: null
			},
			paper_support_needed: { data: 9, error: null },
			seats: { count: 44, error: null }
		});

		const support = await readPaperSupport(supabase, 'disec', [
			sponsor,
			{ ...sponsor, seatId: 'chile', role: 'signatory' }
		]);

		expect(support).toMatchObject({ count: 2, needed: 9, seatsWithDelegate: 44 });
		expect(calls).toContainEqual({
			name: 'paper_support_needed',
			arguments: [{ committee_id: 'disec', minimum: 20, unit: 'percent' }]
		});
	});

	it('throws when the settings cannot be read', async () => {
		const { supabase } = createStandIn({ committees: FAULT });

		await expect(readPaperSupport(supabase, 'disec', [])).rejects.toThrow('down');
	});
});
