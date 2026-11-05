import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createRole, deleteRole, listRoleSummaries, moveRole, updateRole } from './roles';

// These tests are about what this module makes of the database's answers:
// counts put together, and a refusal told apart from a fault. Whether the
// database refuses is Row Level Security's decision, tested in
// `tests/db/team-and-roles-screens.test.ts`.

type Answer = { data: unknown[] | null; error: { message: string; code?: string } | null };

/**
 * A stand-in client answering every query on a relation (or call of a
 * function) with the same rows or error. Every step of the real client's
 * builder hands the builder back, and the chain is answered when awaited.
 */
function createStandInSupabase(answers: Record<string, Answer>): {
	supabase: SupabaseClient;
	writes: { table: string; values: unknown }[];
} {
	const writes: { table: string; values: unknown }[] = [];

	function builderFor(table: string) {
		const answer = answers[table] ?? { data: [], error: null };
		const builder: Record<string, unknown> = {};

		for (const step of ['select', 'eq', 'is', 'order', 'delete']) {
			builder[step] = () => builder;
		}

		builder.insert = (values: unknown) => {
			writes.push({ table, values });
			return builder;
		};
		builder.update = builder.insert;
		builder.overrideTypes = async () => answer;
		builder.then = (resolve: (answer: Answer) => void) => resolve(answer);

		return builder;
	}

	function rpc(name: string, args: unknown) {
		writes.push({ table: name, values: args });
		return builderFor(name);
	}

	return { supabase: { from: builderFor, rpc } as unknown as SupabaseClient, writes };
}

const ok = (data: unknown[]): Answer => ({ data, error: null });
const failed = (code: string): Answer => ({ data: null, error: { message: 'no', code } });

const VALUES = {
	name: 'Press',
	scope: 'conference' as const,
	isPublic: true,
	permissions: ['send_announcements' as const]
};

describe('listRoleSummaries', () => {
	it('counts each role’s members and waiting invitations', async () => {
		const { supabase } = createStandInSupabase({
			conference_roles: ok([
				{
					id: 'chair',
					name: 'Chair',
					position: 1,
					scope: 'committees',
					permissions: ['run_room'],
					is_public: true
				},
				{
					id: 'press',
					name: 'Press',
					position: 2,
					scope: 'conference',
					permissions: [],
					is_public: false
				}
			]),
			conference_role_members: ok([{ role_id: 'chair' }, { role_id: 'chair' }]),
			invites: ok([{ role_id: 'press' }, { role_id: null }])
		});

		const roles = await listRoleSummaries(supabase, 'conference-1');

		expect(roles.map((role) => [role.name, role.memberCount, role.invitationCount])).toEqual([
			['Chair', 2, 0],
			['Press', 0, 1]
		]);
		expect(roles[0]).toMatchObject({
			scope: 'committees',
			isPublic: true,
			permissions: ['run_room']
		});
	});

	it('raises when any of the three cannot be read', async () => {
		const { supabase } = createStandInSupabase({ invites: failed('08000') });

		await expect(listRoleSummaries(supabase, 'conference-1')).rejects.toThrow(
			'Could not read the roles'
		);
	});
});

describe('createRole', () => {
	it('writes the role at the place it is given and answers its id', async () => {
		const { supabase, writes } = createStandInSupabase({ conference_roles: ok([{ id: 'new' }]) });

		expect(await createRole(supabase, 'conference-1', VALUES, 7)).toEqual({
			result: 'saved',
			roleId: 'new'
		});
		expect(writes[0].values).toEqual({
			conference_id: 'conference-1',
			position: 7,
			name: 'Press',
			scope: 'conference',
			is_public: true,
			permissions: ['send_announcements']
		});
	});

	it('tells a taken name and a refusal apart', async () => {
		const taken = createStandInSupabase({ conference_roles: failed('23505') });
		const refused = createStandInSupabase({ conference_roles: failed('42501') });

		expect((await createRole(taken.supabase, 'c', VALUES, 7)).result).toBe('name-taken');
		expect((await createRole(refused.supabase, 'c', VALUES, 7)).result).toBe('refused');
	});
});

describe('updateRole', () => {
	it('is saved when the row comes back, and refused when the policy skipped it', async () => {
		const saved = createStandInSupabase({ conference_roles: ok([{ id: 'press' }]) });
		const skipped = createStandInSupabase({ conference_roles: ok([]) });

		expect(await updateRole(saved.supabase, 'press', VALUES)).toBe('saved');
		expect(await updateRole(skipped.supabase, 'press', VALUES)).toBe('refused');
	});

	it('says when the name is taken', async () => {
		const { supabase } = createStandInSupabase({ conference_roles: failed('23505') });

		expect(await updateRole(supabase, 'press', VALUES)).toBe('name-taken');
	});
});

describe('deleteRole', () => {
	it('tells deleted, still held and refused apart', async () => {
		const deleted = createStandInSupabase({ conference_roles: ok([{ id: 'press' }]) });
		const held = createStandInSupabase({ conference_roles: failed('23503') });
		const skipped = createStandInSupabase({ conference_roles: ok([]) });

		expect(await deleteRole(deleted.supabase, 'press')).toBe('deleted');
		expect(await deleteRole(held.supabase, 'press')).toBe('in-use');
		expect(await deleteRole(skipped.supabase, 'press')).toBe('refused');
	});
});

describe('moveRole', () => {
	it('calls move_conference_role, and answers no to the rank rule', async () => {
		const moved = createStandInSupabase({});
		const refused = createStandInSupabase({ move_conference_role: failed('42501') });

		expect(await moveRole(moved.supabase, 'press', 'up')).toBe(true);
		expect(moved.writes[0]).toEqual({
			table: 'move_conference_role',
			values: { role_id: 'press', direction: 'up' }
		});
		expect(await moveRole(refused.supabase, 'press', 'down')).toBe(false);
	});
});
