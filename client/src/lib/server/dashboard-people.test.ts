import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readFullNames } from './dashboard-people';

/** A client whose one query answers `rows`, and which writes down every table it was asked for. */
function makeStandIn(rows: unknown[]) {
	const tables: string[] = [];

	const query = {
		select: () => query,
		in: () => query,
		overrideTypes: () => Promise.resolve({ data: rows, error: null })
	};

	const supabase = {
		from: (table: string) => {
			tables.push(table);
			return query;
		}
	} as unknown as SupabaseClient;

	return { supabase, tables };
}

describe('readFullNames', () => {
	it('asks nothing when there is nobody to name', async () => {
		const { supabase, tables } = makeStandIn([]);

		const names = await readFullNames(supabase, []);

		expect(names.size).toBe(0);
		expect(tables).toEqual([]);
	});

	it('gives each name back by user id', async () => {
		const { supabase, tables } = makeStandIn([{ id: 'user-1', full_name: 'Zoe Adams' }]);

		const names = await readFullNames(supabase, ['user-1', 'user-2']);

		expect(tables).toEqual(['profiles']);
		expect(names.get('user-1')).toBe('Zoe Adams');
		expect(names.has('user-2')).toBe(false);
	});
});
