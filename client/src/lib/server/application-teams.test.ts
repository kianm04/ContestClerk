import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AllocatableSeat } from '$lib/allocation';
import {
	acceptTeam,
	joinMyTeam,
	leaveMyTeam,
	listTeamMembers,
	listTeamPartnerOptions,
	readMyTeam,
	removeFromTeam,
	startMyTeam,
	teamApplications
} from './application-teams';

// These tests are about what this module asks the database and how it shapes
// the answers. Whether the database allows each change, and which sentence it
// refuses with, is tested in `tests/db/application-teams.test.ts`.

/** What the stand-in answers: rows by table, and the answer to each function. */
type StandInAnswers = {
	rows?: Record<string, unknown[]>;
	functions?: Record<string, { data?: unknown; error?: string }>;
};

/** One database function the code under test called, with what it passed. */
type RecordedCall = { functionName: string; parameters: Record<string, unknown> };

/**
 * A stand-in Supabase client. `.from(table)` gives back a builder whose every
 * step hands the same builder back, the way the real one does; the chain ends
 * in `single`, `maybeSingle`, `overrideTypes` or a plain `await`, which `then`
 * answers. `.rpc` answers each function by name and writes the call down.
 */
function createStandInSupabase(answers: StandInAnswers = {}) {
	const calls: RecordedCall[] = [];

	function builderFor(table: string) {
		const rows = answers.rows?.[table] ?? [];
		const builder = {
			select: () => builder,
			eq: () => builder,
			in: () => builder,
			order: () => builder,
			single: async () => ({ data: rows[0], error: null }),
			maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
			overrideTypes: async () => ({ data: rows, error: null }),
			then: (resolve: (answer: { data: unknown[]; error: null }) => void) =>
				resolve({ data: rows, error: null })
		};

		return builder;
	}

	async function rpc(functionName: string, parameters: Record<string, unknown>) {
		calls.push({ functionName, parameters });
		const answer = answers.functions?.[functionName] ?? {};

		return { data: answer.data ?? null, error: answer.error ? { message: answer.error } : null };
	}

	const supabase = { from: builderFor, rpc } as unknown as SupabaseClient;

	return { supabase, calls };
}

/** Umarbek and Kian, as `application_team_names` answers for their team. */
const TEAM_NAMES = {
	data: [
		{ user_id: 'user-umarbek', full_name: 'Umarbek Ismoilov' },
		{ user_id: 'user-kian', full_name: 'Kian Matton' }
	]
};

describe('readMyTeam', () => {
	it('answers null for an applicant applying alone', async () => {
		const { supabase } = createStandInSupabase({ rows: { applications: [{ team_id: null }] } });

		expect(await readMyTeam(supabase, 'conference-1', 'application-1')).toBeNull();
	});

	it('gives the code and everybody’s names', async () => {
		const { supabase } = createStandInSupabase({
			rows: { applications: [{ team_id: 'team-1' }], application_teams: [{ join_code: 'AB3K9Q' }] },
			functions: { application_team_names: TEAM_NAMES }
		});

		expect(await readMyTeam(supabase, 'conference-1', 'application-1')).toEqual({
			joinCode: 'AB3K9Q',
			memberNames: ['Umarbek Ismoilov', 'Kian Matton']
		});
	});
});

describe('listTeamMembers', () => {
	it('is empty without a team', async () => {
		const { supabase } = createStandInSupabase();

		expect(await listTeamMembers(supabase, 'conference-1', 'application-1')).toEqual([]);
	});

	it('names each member from the team’s own list of names', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				applications: [
					{
						team_id: 'team-1',
						id: 'application-1',
						user_id: 'user-umarbek',
						status: 'submitted',
						committee_preferences: ['disec']
					},
					{
						team_id: 'team-1',
						id: 'application-2',
						user_id: 'user-kian',
						status: 'draft',
						committee_preferences: []
					}
				]
			},
			functions: { application_team_names: TEAM_NAMES }
		});

		const members = await listTeamMembers(supabase, 'conference-1', 'application-1');

		expect(members.map((member) => [member.fullName, member.status])).toEqual([
			['Umarbek Ismoilov', 'submitted'],
			['Kian Matton', 'draft']
		]);
	});
});

describe('listTeamPartnerOptions', () => {
	it('offers everybody under review except the team itself', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				applications_with_applicant: [
					{ id: 'application-1', applicant_name: 'Umarbek Ismoilov' },
					{ id: 'application-3', applicant_name: 'Amara Okafor' }
				]
			}
		});

		expect(await listTeamPartnerOptions(supabase, 'conference-1', ['application-1'])).toEqual([
			{ value: 'application-3', label: 'Amara Okafor' }
		]);
	});
});

describe('the changes to a team', () => {
	it('calls one database function each, with the ids it was given', async () => {
		// `join_application_team` answers the team it joined; null would mean the
		// code matched nothing, which the test below is about.
		const { supabase, calls } = createStandInSupabase({
			functions: { join_application_team: { data: 'team-1' } }
		});
		const seat = { id: 'seat-kenya-disec' } as AllocatableSeat;

		await startMyTeam(supabase, 'application-1');
		await joinMyTeam(supabase, 'application-2', 'AB3K9Q');
		await leaveMyTeam(supabase, 'application-2');
		await teamApplications(supabase, 'application-1', 'application-3');
		await removeFromTeam(supabase, 'application-3');
		await acceptTeam(supabase, [{ applicationId: 'application-1', seat, committeeLabel: 'DISEC' }]);

		expect(calls).toEqual([
			{ functionName: 'start_application_team', parameters: { application_id: 'application-1' } },
			{
				functionName: 'join_application_team',
				parameters: { application_id: 'application-2', code: 'AB3K9Q' }
			},
			{ functionName: 'leave_application_team', parameters: { application_id: 'application-2' } },
			{
				functionName: 'team_applications',
				parameters: { application_id: 'application-1', partner_application_id: 'application-3' }
			},
			{
				functionName: 'remove_application_from_team',
				parameters: { application_id: 'application-3' }
			},
			{
				functionName: 'accept_application_team',
				parameters: { application_ids: ['application-1'], seat_ids: ['seat-kenya-disec'] }
			}
		]);
	});

	it('throws the database’s own sentence when it refuses', async () => {
		const { supabase } = createStandInSupabase({
			functions: { join_application_team: { error: 'You are already in this team' } }
		});

		await expect(joinMyTeam(supabase, 'application-1', 'AB3K9Q')).rejects.toThrow(
			'You are already in this team'
		);
	});

	it('says the code matches no team when the database answers null', async () => {
		const { supabase } = createStandInSupabase();

		await expect(joinMyTeam(supabase, 'application-1', 'WRONG000')).rejects.toThrow(
			'That code does not belong to a team at this conference'
		);
	});
});
