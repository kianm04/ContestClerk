import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	readConferenceIdsPermitting,
	readManageableConferenceIds,
	readMyPermissions
} from './my-permissions';

// Which permissions the database hands over is tested in
// `tests/db/conference-roles.test.ts`. These tests are about the questions
// this module asks and what it makes of the answers, so the client is a
// stand-in that writes down what it was asked and answers with fixed rows.

type Answer = { data: unknown; error: { message: string } | null };

/** What the stand-in answers to each question. */
type Answers = {
	my_permissions?: Answer;
	my_rank?: Answer;
	committee_chairs?: Answer;
};

function createStandIn(answers: Answers) {
	const calls = {
		rpc: [] as [string, unknown][],
		eq: [] as [string, unknown][],
		columns: [] as string[]
	};

	const supabase = {
		rpc: async (name: 'my_permissions' | 'my_rank', helperArguments: unknown) => {
			calls.rpc.push([name, helperArguments]);
			return answers[name] ?? { data: null, error: null };
		},
		from: () => {
			const answer = answers.committee_chairs ?? { data: [], error: null };
			// The query is awaited after its last `.eq(...)`, so the builder is a
			// promise that also has the steps on it.
			const builder = Object.assign(Promise.resolve(answer), {
				select: (columns: string) => {
					calls.columns.push(columns);
					return builder;
				},
				eq: (column: string, value: unknown) => {
					calls.eq.push([column, value]);
					return builder;
				}
			});
			return builder;
		}
	};

	return { supabase: supabase as unknown as SupabaseClient, calls };
}

describe('readMyPermissions', () => {
	it('gathers the permissions, the rank and the assigned committees', async () => {
		const { supabase, calls } = createStandIn({
			my_permissions: {
				data: [
					{ permission: 'run_room', scope: 'committees' },
					{ permission: 'send_announcements', scope: 'conference' }
				],
				error: null
			},
			my_rank: { data: 2, error: null },
			committee_chairs: { data: [{ committee_id: 'committee-a' }], error: null }
		});

		const mine = await readMyPermissions(supabase, 'conference-1', 'user-1');

		expect(mine).toEqual({
			held: [
				{ permission: 'run_room', scope: 'committees' },
				{ permission: 'send_announcements', scope: 'conference' }
			],
			committeeIds: ['committee-a'],
			rank: 2
		});
		expect(calls.rpc).toEqual([
			['my_permissions', { conference_id: 'conference-1' }],
			['my_rank', { conference_id: 'conference-1' }]
		]);
		// Only this reader's assignments, and only on this conference.
		expect(calls.eq).toEqual([
			['user_id', 'user-1'],
			['committees.conference_id', 'conference-1']
		]);
	});

	it('answers no rank and nothing held for somebody with no role', async () => {
		const { supabase } = createStandIn({
			my_permissions: { data: [], error: null },
			my_rank: { data: null, error: null }
		});

		expect(await readMyPermissions(supabase, 'conference-1', 'user-1')).toEqual({
			held: [],
			committeeIds: [],
			rank: null
		});
	});

	it('throws when a question fails, rather than guessing', async () => {
		const { supabase } = createStandIn({
			my_permissions: { data: null, error: { message: 'boom' } }
		});

		await expect(readMyPermissions(supabase, 'conference-1', 'user-1')).rejects.toThrow(
			'Could not read your permissions: boom'
		);
	});
});

describe('readManageableConferenceIds', () => {
	/** A client whose `rpc` answers each permission with the given conference ids. */
	function createRpcStandIn(
		idsByPermission: Record<string, string[]>,
		error: Answer['error'] = null
	) {
		const asked: unknown[] = [];
		const supabase = {
			rpc: async (name: string, helperArguments: { permission: string }) => {
				asked.push([name, helperArguments]);
				return { data: idsByPermission[helperArguments.permission] ?? [], error };
			}
		};

		return { supabase: supabase as unknown as SupabaseClient, asked };
	}

	it('asks which conferences hold a permission that opens a page, and keeps each once', async () => {
		const { supabase, asked } = createRpcStandIn({
			manage_committees: ['conference-1', 'conference-2', 'conference-1']
		});

		const ids = await readManageableConferenceIds(supabase);

		expect([...ids]).toEqual(['conference-1', 'conference-2']);
		expect(asked).toContainEqual(['permitted_conference_ids', { permission: 'manage_committees' }]);
	});

	it('throws when the database cannot answer', async () => {
		const { supabase } = createRpcStandIn({}, { message: 'permission denied' });

		await expect(readManageableConferenceIds(supabase)).rejects.toThrow(
			'Could not read the conferences you manage: permission denied'
		);
	});

	it('asks readConferenceIdsPermitting about exactly the permissions it is given', async () => {
		const { supabase, asked } = createRpcStandIn({
			read_invoices: ['conference-1'],
			manage_invoices: ['conference-2']
		});

		const ids = await readConferenceIdsPermitting(supabase, ['read_invoices', 'manage_invoices']);

		expect([...ids]).toEqual(['conference-1', 'conference-2']);
		expect(asked).toEqual([
			['permitted_conference_ids', { permission: 'read_invoices' }],
			['permitted_conference_ids', { permission: 'manage_invoices' }]
		]);
	});
});
