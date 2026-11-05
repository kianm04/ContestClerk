import { error } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireCommitteePermission, type ChairAccess } from './access';
import { readCommitteeFormat } from './committee-papers';
import {
	answerDirective,
	listCrisisDesk,
	mayAnswerDirectives,
	readCrisisAnswer,
	readCrisisUpdate,
	readRoomCrisisUpdate,
	requireCrisisStaff,
	sendCrisisUpdate
} from './crisis-desk';

// The gate and the committee's format have their own tests next to their
// modules; here they answer as told. Who may answer, and the sentences each
// refusal carries, are the database's, tested in `tests/db/crisis-committees.test.ts`.
vi.mock('./access', () => ({ requireCommitteePermission: vi.fn() }));
vi.mock('./committee-papers', () => ({ readCommitteeFormat: vi.fn() }));

type Answer = { data?: unknown; error: { code: string; message: string } | null };
type RecordedCall = { name: string; arguments: unknown[] };

/** A stand-in Supabase client: each function and each table answers once, as told. */
function createStandIn(
	rpcAnswers: Record<string, Answer> = {},
	tables: Record<string, Answer> = {}
) {
	const calls: RecordedCall[] = [];

	function rpc(name: string, parameters: unknown) {
		calls.push({ name, arguments: [parameters] });
		return Promise.resolve(rpcAnswers[name] ?? { data: null, error: null });
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
			in: step('in'),
			maybeSingle: () => Object.assign(answer(), { overrideTypes: answer }),
			overrideTypes: answer
		};

		return builder;
	}

	return { supabase: { rpc, from } as unknown as SupabaseClient, calls };
}

const REFUSED = {
	error: { code: '22023', message: 'This paper is not waiting for an answer.' }
};

const ACCESS = {
	user: { id: 'user-1' },
	conference: { id: 'conference-1', slug: 'mun-2099' },
	committee: { id: 'committee-1', slug: 'cabinet' }
} as unknown as ChairAccess;

beforeEach(() => {
	vi.mocked(requireCommitteePermission).mockReset();
	vi.mocked(readCommitteeFormat).mockReset();
});

describe('requireCrisisStaff', () => {
	const params = { slug: 'mun-2099', committeeSlug: 'cabinet' };
	const url = new URL('http://localhost/conferences/mun-2099/committees/cabinet/crisis');

	it('lets in somebody who answers directives in a crisis committee', async () => {
		const { supabase } = createStandIn();
		const locals = { supabase } as unknown as App.Locals;
		vi.mocked(requireCommitteePermission).mockResolvedValue(ACCESS);
		vi.mocked(readCommitteeFormat).mockResolvedValue('crisis');

		await expect(requireCrisisStaff(locals, url, params)).resolves.toBe(ACCESS);
		expect(requireCommitteePermission).toHaveBeenCalledWith(
			locals,
			url,
			'mun-2099',
			'cabinet',
			'answer_directives'
		);
	});

	it('is a page that does not exist in a committee that is not a crisis one', async () => {
		const { supabase } = createStandIn();
		vi.mocked(requireCommitteePermission).mockResolvedValue(ACCESS);
		vi.mocked(readCommitteeFormat).mockResolvedValue('standard');

		await expect(
			requireCrisisStaff({ supabase } as unknown as App.Locals, url, params)
		).rejects.toMatchObject({ status: 404 });
	});

	it('asks nothing more of somebody the gate turns away', async () => {
		const { supabase } = createStandIn();
		vi.mocked(requireCommitteePermission).mockImplementation(() => error(404, 'Not found'));

		await expect(
			requireCrisisStaff({ supabase } as unknown as App.Locals, url, params)
		).rejects.toMatchObject({ status: 404 });
		expect(readCommitteeFormat).not.toHaveBeenCalled();
	});
});

describe('mayAnswerDirectives', () => {
	it('asks the database about answer_directives in the committee', async () => {
		const { supabase, calls } = createStandIn({
			has_committee_permission: { data: true, error: null }
		});

		await expect(mayAnswerDirectives(supabase, 'committee-1')).resolves.toBe(true);
		expect(calls[0]).toEqual({
			name: 'has_committee_permission',
			arguments: [{ committee_id: 'committee-1', permission: 'answer_directives' }]
		});
	});

	it('answers false when the question fails, which only hides a link', async () => {
		const { supabase } = createStandIn({
			has_committee_permission: { data: null, error: { code: '500', message: 'Down' } }
		});

		await expect(mayAnswerDirectives(supabase, 'committee-1')).resolves.toBe(false);
	});
});

describe('listCrisisDesk', () => {
	it("reads the committee's directives and press releases, with their characters, the lead first", async () => {
		const { supabase, calls } = createStandIn(
			{},
			{
				committee_papers: {
					data: [
						{
							id: 'paper-1',
							kind: 'joint_directive',
							status: 'carried_out',
							title: 'Seize the ports',
							submitted_at: '2099-03-15T09:12:00Z',
							decided_at: '2099-03-15T10:02:00Z',
							lead_seat_id: 'seat-defence',
							seats: [
								{ seat_id: 'seat-foreign', role: 'author', seat: { name: 'Foreign Minister' } },
								{ seat_id: 'seat-signer', role: 'signatory', seat: { name: 'Treasury' } },
								{ seat_id: 'seat-defence', role: 'author', seat: { name: 'Minister of Defence' } }
							]
						}
					],
					error: null
				}
			}
		);

		const items = await listCrisisDesk(supabase, 'committee-1');

		expect(items).toEqual([
			{
				id: 'paper-1',
				kind: 'joint_directive',
				status: 'carried_out',
				title: 'Seize the ports',
				characters: ['Minister of Defence', 'Foreign Minister'],
				sentAt: '2099-03-15T09:12:00Z',
				answeredAt: '2099-03-15T10:02:00Z'
			}
		]);
		expect(calls[0].arguments).toContainEqual(['eq', 'committee_id', 'committee-1']);
	});

	it('throws when the read fails', async () => {
		const { supabase } = createStandIn(
			{},
			{ committee_papers: { data: null, error: { code: '500', message: 'Down' } } }
		);

		await expect(listCrisisDesk(supabase, 'committee-1')).rejects.toThrow(
			'Could not read the directives: Down'
		);
	});
});

describe('readCrisisAnswer', () => {
	it("reads the crisis staff's answer to an answered paper", async () => {
		const { supabase } = createStandIn(
			{},
			{
				committee_papers: {
					data: {
						status: 'refused',
						answer_markdown: 'Not today.',
						decided_at: '2099-03-15T10:02:00Z'
					},
					error: null
				}
			}
		);

		await expect(readCrisisAnswer(supabase, 'paper-1')).resolves.toEqual({
			outcome: 'refused',
			text: 'Not today.',
			answeredAt: '2099-03-15T10:02:00Z'
		});
	});

	it('answers null while nobody has answered it', async () => {
		const { supabase } = createStandIn(
			{},
			{
				committee_papers: {
					data: { status: 'submitted', answer_markdown: null, decided_at: null },
					error: null
				}
			}
		);

		await expect(readCrisisAnswer(supabase, 'paper-1')).resolves.toBeNull();
	});
});

describe('answerDirective', () => {
	it('sends the outcome and the answer', async () => {
		const { supabase, calls } = createStandIn();

		await expect(
			answerDirective(supabase, 'paper-1', 'carried_out', 'The fleet sails.')
		).resolves.toEqual({ refusal: null });
		expect(calls[0]).toEqual({
			name: 'answer_directive',
			arguments: [{ paper_id: 'paper-1', outcome: 'carried_out', answer: 'The fleet sails.' }]
		});
	});

	it("says the database's reason when it refuses", async () => {
		const { supabase } = createStandIn({ answer_directive: REFUSED });

		await expect(answerDirective(supabase, 'paper-1', 'refused', '')).resolves.toEqual({
			refusal: 'This paper is not waiting for an answer.'
		});
	});

	it('throws on any other failure', async () => {
		const { supabase } = createStandIn({
			answer_directive: { error: { code: '500', message: 'Down' } }
		});

		await expect(answerDirective(supabase, 'paper-1', 'refused', '')).rejects.toThrow(
			'Could not answer the paper: Down'
		);
	});
});

describe('readCrisisUpdate and readRoomCrisisUpdate', () => {
	const STATE = {
		committee_state: {
			data: { crisis_update: 'The fleet has left port.', crisis_update_at: '2099-03-15T14:07:00Z' },
			error: null
		}
	};

	it('reads the update the room shows', async () => {
		const { supabase } = createStandIn({}, STATE);

		await expect(readCrisisUpdate(supabase, 'committee-1')).resolves.toEqual({
			message: 'The fleet has left port.',
			sentAt: '2099-03-15T14:07:00Z'
		});
	});

	it('answers null when there is none', async () => {
		const { supabase } = createStandIn(
			{},
			{ committee_state: { data: { crisis_update: null, crisis_update_at: null }, error: null } }
		);

		await expect(readCrisisUpdate(supabase, 'committee-1')).resolves.toBeNull();
	});

	it("shows the room a crisis committee's update, and never a standard committee's", async () => {
		const { supabase } = createStandIn({}, STATE);

		vi.mocked(readCommitteeFormat).mockResolvedValue('crisis');
		await expect(readRoomCrisisUpdate(supabase, 'committee-1')).resolves.toMatchObject({
			message: 'The fleet has left port.'
		});

		vi.mocked(readCommitteeFormat).mockResolvedValue('standard');
		await expect(readRoomCrisisUpdate(supabase, 'committee-1')).resolves.toBeNull();
	});
});

describe('sendCrisisUpdate', () => {
	it('sends the update to the room', async () => {
		const { supabase, calls } = createStandIn();

		await expect(sendCrisisUpdate(supabase, 'committee-1', 'The fleet sails.')).resolves.toEqual({
			refusal: null
		});
		expect(calls[0]).toEqual({
			name: 'send_crisis_update',
			arguments: [{ committee_id: 'committee-1', message: 'The fleet sails.' }]
		});
	});

	it("says the database's reason when it refuses", async () => {
		const { supabase } = createStandIn({
			send_crisis_update: { error: { code: '42501', message: 'Only the crisis staff can.' } }
		});

		await expect(sendCrisisUpdate(supabase, 'committee-1', 'Hi')).resolves.toEqual({
			refusal: 'Only the crisis staff can.'
		});
	});
});
