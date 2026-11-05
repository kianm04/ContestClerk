import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PaperPerson } from '$lib/committee-papers';
import {
	DELETE_REFUSAL,
	addPaperAuthor,
	deletePaper,
	handPaperLead,
	leavePaper,
	listSeatsToAdd,
	startPaper
} from './committee-paper-authors';

// These tests are about how this module asks and what it makes of the answers.
// Who may change a paper's authors, and the sentences each refusal carries,
// are the database's, tested with a real database in
// `tests/db/committee-papers.test.ts`.

/** A database answer: rows, or an error with a Postgres code. */
type Answer = { data: unknown; error: { code: string; message: string } | null };

/** One call the module made: an `rpc` by name, or a query on a table with its filters. */
type RecordedCall = { name: string; arguments: unknown[] };

/**
 * A stand-in Supabase client that answers each function or table with what it
 * is handed (nothing, by default), recording every call.
 */
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

		// Every step records itself and hands the builder back, which is what lets the module chain them.
		const step =
			(stepName: string) =>
			(...stepArguments: unknown[]) => {
				call.arguments.push([stepName, ...stepArguments]);
				return builder;
			};

		const builder = {
			delete: step('delete'),
			select: step('select'),
			eq: step('eq'),
			not: step('not'),
			neq: step('neq'),
			order: step('order'),
			overrideTypes: () => Promise.resolve(answerFor(table))
		};

		return builder;
	}

	return { supabase: { rpc, from } as unknown as SupabaseClient, calls };
}

const FAULT = { data: null, error: { code: 'XX000', message: 'down' } };

/** A refusal from one of the paper functions, as Postgres raises it. */
function refusedWith(code: string, message: string): Answer {
	return { data: null, error: { code, message } };
}

describe('startPaper', () => {
	it('starts a paper of the chosen kind and answers its id', async () => {
		const { supabase, calls } = createStandIn({ start_paper: { data: 'paper-1', error: null } });

		const started = await startPaper(supabase, {
			committeeId: 'disec',
			kind: 'working_paper',
			title: 'Meaningful human control',
			topic: 'Lethal autonomous weapons systems',
			sourcePaperIds: []
		});

		expect(started).toEqual({ paperId: 'paper-1', refusal: null });
		expect(calls).toEqual([
			{
				name: 'start_paper',
				arguments: [
					{
						committee_id: 'disec',
						kind: 'working_paper',
						title: 'Meaningful human control',
						topic: 'Lethal autonomous weapons systems',
						source_paper_ids: []
					}
				]
			}
		]);
	});

	it('hands on the working papers a draft resolution is based on', async () => {
		const { supabase, calls } = createStandIn({ start_paper: { data: 'paper-2', error: null } });

		await startPaper(supabase, {
			committeeId: 'disec',
			kind: 'draft_resolution',
			title: 'Meaningful human control',
			topic: 'Lethal autonomous weapons systems',
			sourcePaperIds: ['working-paper-1', 'working-paper-2']
		});

		expect(calls[0].arguments[0]).toMatchObject({
			kind: 'draft_resolution',
			source_paper_ids: ['working-paper-1', 'working-paper-2']
		});
	});

	it('sends no topic for a committee without topics', async () => {
		const { supabase, calls } = createStandIn({ start_paper: { data: 'paper-1', error: null } });

		await startPaper(supabase, {
			committeeId: 'disec',
			kind: 'working_paper',
			title: 'Export controls',
			topic: null,
			sourcePaperIds: []
		});

		expect(calls[0].arguments[0]).toMatchObject({ topic: undefined });
	});

	it("answers the database's sentence when it refuses", async () => {
		const sentence = 'This committee does not write that kind of paper.';
		const { supabase } = createStandIn({ start_paper: refusedWith('22023', sentence) });

		const started = await startPaper(supabase, {
			committeeId: 'disec',
			kind: 'personal_directive',
			title: 'Export controls',
			topic: null,
			sourcePaperIds: []
		});

		expect(started).toEqual({ paperId: null, refusal: sentence });
	});

	it('throws on a fault', async () => {
		const { supabase } = createStandIn({ start_paper: FAULT });

		await expect(
			startPaper(supabase, {
				committeeId: 'disec',
				kind: 'working_paper',
				title: 'Export controls',
				topic: null,
				sourcePaperIds: []
			})
		).rejects.toThrow('Could not start the paper: down');
	});
});

describe('addPaperAuthor', () => {
	it('adds the seat', async () => {
		const { supabase, calls } = createStandIn();

		expect(await addPaperAuthor(supabase, 'paper-1', 'seat-mexico')).toEqual({ refusal: null });
		expect(calls).toEqual([
			{ name: 'add_paper_author', arguments: [{ paper_id: 'paper-1', seat_id: 'seat-mexico' }] }
		]);
	});

	it("answers the database's sentence for a seat it may not add", async () => {
		const sentence = 'An observer may sign a paper but not write one.';
		const { supabase } = createStandIn({ add_paper_author: refusedWith('22023', sentence) });

		expect(await addPaperAuthor(supabase, 'paper-1', 'seat-holy-see')).toEqual({
			refusal: sentence
		});
	});

	it('answers the sentence for a reader who is not an author', async () => {
		const sentence = 'Only an author of this paper can add another.';
		const { supabase } = createStandIn({ add_paper_author: refusedWith('42501', sentence) });

		expect(await addPaperAuthor(supabase, 'paper-1', 'seat-mexico')).toEqual({ refusal: sentence });
	});

	it('throws on a fault', async () => {
		const { supabase } = createStandIn({ add_paper_author: FAULT });

		await expect(addPaperAuthor(supabase, 'paper-1', 'seat-mexico')).rejects.toThrow(
			'Could not add the author: down'
		);
	});
});

describe('leavePaper', () => {
	it("takes the reader's seat off the paper", async () => {
		const { supabase, calls } = createStandIn();

		expect(await leavePaper(supabase, 'paper-1')).toEqual({ refusal: null });
		expect(calls).toEqual([{ name: 'leave_paper', arguments: [{ paper_id: 'paper-1' }] }]);
	});

	it('answers the sentence for the last author', async () => {
		const sentence = 'Another author has to remain. Withdraw the paper instead.';
		const { supabase } = createStandIn({ leave_paper: refusedWith('22023', sentence) });

		expect(await leavePaper(supabase, 'paper-1')).toEqual({ refusal: sentence });
	});

	it('throws on a fault', async () => {
		const { supabase } = createStandIn({ leave_paper: FAULT });

		await expect(leavePaper(supabase, 'paper-1')).rejects.toThrow(
			'Could not leave the paper: down'
		);
	});
});

describe('handPaperLead', () => {
	it('hands the lead to the seat', async () => {
		const { supabase, calls } = createStandIn();

		expect(await handPaperLead(supabase, 'paper-1', 'seat-mexico')).toEqual({ refusal: null });
		expect(calls).toEqual([
			{ name: 'hand_paper_lead', arguments: [{ paper_id: 'paper-1', seat_id: 'seat-mexico' }] }
		]);
	});

	it('answers the sentence for a paper that does not exist', async () => {
		const sentence = 'That paper does not exist.';
		const { supabase } = createStandIn({ hand_paper_lead: refusedWith('P0002', sentence) });

		expect(await handPaperLead(supabase, 'paper-1', 'seat-mexico')).toEqual({ refusal: sentence });
	});

	it('throws on a fault', async () => {
		const { supabase } = createStandIn({ hand_paper_lead: FAULT });

		await expect(handPaperLead(supabase, 'paper-1', 'seat-mexico')).rejects.toThrow(
			'Could not hand the lead on: down'
		);
	});
});

describe('deletePaper', () => {
	it('deletes the paper and asks for it back', async () => {
		const { supabase, calls } = createStandIn({
			committee_papers: { data: [{ id: 'paper-1' }], error: null }
		});

		expect(await deletePaper(supabase, 'paper-1')).toEqual({ refusal: null });
		expect(calls[0].arguments).toEqual([['delete'], ['eq', 'id', 'paper-1'], ['select', 'id']]);
	});

	it('is refused when the policies let nothing go', async () => {
		const { supabase } = createStandIn({ committee_papers: { data: [], error: null } });

		expect(await deletePaper(supabase, 'paper-1')).toEqual({ refusal: DELETE_REFUSAL });
	});

	it('throws on a fault', async () => {
		const { supabase } = createStandIn({ committee_papers: FAULT });

		await expect(deletePaper(supabase, 'paper-1')).rejects.toThrow(
			'Could not delete the paper: down'
		);
	});
});

describe('listSeatsToAdd', () => {
	/** A seat on the paper, as `readPaperPeople` reads it. */
	function personIn(seatId: string, role: PaperPerson['role']): PaperPerson {
		return {
			seatId,
			seatName: seatId,
			countryCode: null,
			holderId: null,
			holderName: null,
			role,
			isLead: false,
			isMine: false
		};
	}

	const SEATS = [
		{ id: 'seat-austria', name: 'Austria' },
		{ id: 'seat-chile', name: 'Chile' },
		{ id: 'seat-mexico', name: 'Mexico' }
	];

	it('lists the held seats of the committee that do not write the paper, signatories included', async () => {
		const { supabase, calls } = createStandIn({ seats: { data: SEATS, error: null } });

		const seats = await listSeatsToAdd(supabase, 'disec', [
			personIn('seat-austria', 'author'),
			personIn('seat-chile', 'signatory')
		]);

		expect(seats).toEqual([
			{ value: 'seat-chile', label: 'Chile' },
			{ value: 'seat-mexico', label: 'Mexico' }
		]);
		expect(calls[0].arguments).toEqual([
			['select', 'id, name'],
			['eq', 'committee_id', 'disec'],
			['not', 'user_id', 'is', null],
			['neq', 'kind', 'observer'],
			['order', 'name']
		]);
	});

	it('throws when the seats cannot be read', async () => {
		const { supabase } = createStandIn({ seats: FAULT });

		await expect(listSeatsToAdd(supabase, 'disec', [])).rejects.toThrow(
			"Could not read the committee's seats: down"
		);
	});
});
