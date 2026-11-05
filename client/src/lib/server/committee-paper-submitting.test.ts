import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	readPaperChair,
	readPaperDecision,
	submitCommitteePaper,
	submittedContent,
	withdrawCommitteePaper
} from './committee-paper-submitting';
import { readLivePaperWithSuggestions } from './paper-live-drafts';
import { listCommitteeChairs } from './team';

// The stored text is read through the live writing, and the chairs through
// the team module; both have their own tests, so here they answer as told.
vi.mock('./paper-live-drafts', () => ({ readLivePaperWithSuggestions: vi.fn() }));
vi.mock('./committee-paper-writing', () => ({ committeePaperStore: vi.fn(() => ({})) }));
vi.mock('./team', () => ({ listCommitteeChairs: vi.fn() }));

// Who may submit, and the sentences each refusal carries, are the database's,
// tested in `tests/db/committee-papers.test.ts`.

type Answer = { data?: unknown; error: { code: string; message: string } | null };
type RecordedCall = { name: string; arguments: unknown[] };

/** A stand-in Supabase client: each function answers in turn from its list, each table with one answer. */
function createStandIn(
	rpcAnswers: Record<string, Answer[]> = {},
	tables: Record<string, Answer> = {}
) {
	const calls: RecordedCall[] = [];

	function rpc(name: string, parameters: unknown) {
		calls.push({ name, arguments: [parameters] });
		return Promise.resolve(rpcAnswers[name]?.shift() ?? { data: null, error: null });
	}

	function from(table: string) {
		const call: RecordedCall = { name: table, arguments: [] };
		calls.push(call);
		const answer = () => Promise.resolve(tables[table] ?? { data: null, error: null });

		const step =
			(stepName: string) =>
			(...stepArguments: unknown[]) => {
				call.arguments.push([stepName, ...stepArguments]);
				return builder;
			};

		// A table read is awaited after `maybeSingle` or after `overrideTypes`, so both are promises.
		const builder = {
			select: step('select'),
			eq: step('eq'),
			maybeSingle: () => Object.assign(answer(), { overrideTypes: answer }),
			overrideTypes: answer
		};

		return builder;
	}

	return { supabase: { rpc, from } as unknown as SupabaseClient, calls };
}

const DRAFT = { id: 'paper-1', kind: 'draft_resolution' as const };
const DRAFT_TEXT = '*Recalling* its resolutions,\n\n1. *Calls upon* all States.';
const CHANGED = {
	error: { code: '40001', message: 'The text changed while it was being submitted.' }
};

function storedAt(revision: number, openSuggestions = 0) {
	return { paper: { markdown: DRAFT_TEXT, revision, documentState: null }, openSuggestions };
}

beforeEach(() => {
	vi.mocked(readLivePaperWithSuggestions).mockReset();
	vi.mocked(listCommitteeChairs).mockReset();
});

describe('submittedContent', () => {
	it('splits a draft into its preamble and its operative clauses', () => {
		const content = submittedContent('draft_resolution', DRAFT_TEXT);

		expect(content?.preamble).toHaveLength(1);
		expect(content?.operative).toHaveLength(1);
	});

	it('makes all of a directive operative, and leaves any other kind to the database', () => {
		expect(submittedContent('committee_directive', '1. *Orders* the fleet.')?.preamble).toEqual([]);
		expect(submittedContent('working_paper', 'Anything')).toBeNull();
	});
});

describe('submitCommitteePaper', () => {
	it('sends the text at the revision it was read at', async () => {
		vi.mocked(readLivePaperWithSuggestions).mockResolvedValue(storedAt(7));
		const { supabase, calls } = createStandIn();

		expect(await submitCommitteePaper(supabase, DRAFT)).toEqual({ refusal: null });
		expect(calls).toEqual([
			{
				name: 'submit_paper',
				arguments: [
					{
						paper_id: 'paper-1',
						expected_revision: 7,
						content: submittedContent('draft_resolution', DRAFT_TEXT)
					}
				]
			}
		]);
	});

	it('reads the text again and sends it once more when another author saved in between', async () => {
		vi.mocked(readLivePaperWithSuggestions)
			.mockResolvedValueOnce(storedAt(7))
			.mockResolvedValueOnce(storedAt(8));
		const { supabase, calls } = createStandIn({ submit_paper: [CHANGED] });

		expect(await submitCommitteePaper(supabase, DRAFT)).toEqual({ refusal: null });
		expect(
			calls.map((call) => (call.arguments[0] as { expected_revision: number }).expected_revision)
		).toEqual([7, 8]);
	});

	it('gives up with the database’s sentence when the text keeps changing', async () => {
		vi.mocked(readLivePaperWithSuggestions).mockResolvedValue(storedAt(7));
		const { supabase } = createStandIn({ submit_paper: [CHANGED, CHANGED] });

		expect(await submitCommitteePaper(supabase, DRAFT)).toEqual({
			refusal: 'The text changed while it was being submitted.'
		});
	});

	it('sends nothing while suggestions are open, or once the reader may not write it', async () => {
		const { supabase, calls } = createStandIn();

		vi.mocked(readLivePaperWithSuggestions).mockResolvedValueOnce(storedAt(7, 2));
		expect(await submitCommitteePaper(supabase, DRAFT)).toEqual({
			refusal: 'Accept or reject the 2 open suggestions before submitting.'
		});

		vi.mocked(readLivePaperWithSuggestions).mockResolvedValueOnce(null);
		expect(await submitCommitteePaper(supabase, DRAFT)).toEqual({
			refusal: 'Only a paper being written can be submitted.'
		});
		expect(calls).toEqual([]);
	});

	it('hands back a refusal, and throws on a fault', async () => {
		vi.mocked(readLivePaperWithSuggestions).mockResolvedValue(storedAt(7));
		const refused = { error: { code: '22023', message: 'Write at least one operative clause.' } };
		const { supabase } = createStandIn({
			submit_paper: [refused, { error: { code: 'XX000', message: 'down' } }]
		});

		expect(await submitCommitteePaper(supabase, DRAFT)).toEqual({
			refusal: 'Write at least one operative clause.'
		});
		await expect(submitCommitteePaper(supabase, DRAFT)).rejects.toThrow('down');
	});
});

describe('withdrawCommitteePaper', () => {
	it('asks the database, and hands back its refusal', async () => {
		const refused = { error: { code: '42501', message: 'Close the open vote first.' } };
		const { supabase, calls } = createStandIn({ withdraw_paper: [{ error: null }, refused] });

		expect(await withdrawCommitteePaper(supabase, 'paper-1')).toEqual({ refusal: null });
		expect(await withdrawCommitteePaper(supabase, 'paper-1')).toEqual({
			refusal: 'Close the open vote first.'
		});
		expect(calls[0]).toEqual({ name: 'withdraw_paper', arguments: [{ paper_id: 'paper-1' }] });
	});
});

describe('readPaperDecision', () => {
	it('reads what the dais decided, who did, and their title on this dais', async () => {
		const { supabase } = createStandIn(
			{},
			{
				committee_papers: {
					data: {
						decided_at: '2099-03-15T09:46:00Z',
						decided_by: 'user-eleanor',
						return_comment: 'Say who pays.'
					},
					error: null
				},
				profiles: { data: { full_name: 'Eleanor Price' }, error: null },
				committee_chairs: { data: { title: 'Chair' }, error: null }
			}
		);

		expect(await readPaperDecision(supabase, 'committee-1', 'paper-1')).toEqual({
			decidedAt: '2099-03-15T09:46:00Z',
			decidedBy: { name: 'Eleanor Price', title: 'Chair' },
			returnComment: 'Say who pays.'
		});
	});

	it('is null while the dais has decided nothing', async () => {
		const undecided = { decided_at: null, decided_by: null, return_comment: null };
		const { supabase } = createStandIn({}, { committee_papers: { data: undecided, error: null } });

		expect(await readPaperDecision(supabase, 'committee-1', 'paper-1')).toBeNull();
	});
});

describe('readPaperChair', () => {
	const eleanor = { userId: 'u-1', fullName: 'Eleanor Price', avatarPath: null, title: 'Chair' };

	it('names the committee’s only chair', async () => {
		vi.mocked(listCommitteeChairs).mockResolvedValue([eleanor]);

		expect(await readPaperChair({} as SupabaseClient, 'committee-1')).toEqual({
			name: 'Eleanor Price',
			title: 'Chair'
		});
	});

	it('names nobody where several chair it', async () => {
		vi.mocked(listCommitteeChairs).mockResolvedValue([eleanor, { ...eleanor, userId: 'u-2' }]);

		expect(await readPaperChair({} as SupabaseClient, 'committee-1')).toBeNull();
	});
});
