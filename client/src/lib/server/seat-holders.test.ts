import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { holderOf, readDelegationNames, readSeatHolders, type SeatRow } from './seat-holders';

// These tests are about the two lookups this module makes for a list of seats:
// which ids it asks for, what it answers with, and what it does when there is
// nothing to ask or the database says no. Nothing here talks to a database;
// the stand-in client below writes down what it was asked for and answers with
// fixed rows. The public committee page and the organiser's editor, which both
// use these lookups, have tests of their own beside them.

/** What one query this module sent was asking for. */
type RecordedQuery = {
	/** The relation `.from(...)` named. */
	table: string;
	/** `[column, values]` for every `.in(...)`. */
	in: [string, unknown[]][];
};

/** What the stand-in should answer with. Everything here has a harmless default. */
type StandInAnswers = {
	/** The rows each relation gives back. A relation with no entry gives back none. */
	rows?: Record<string, unknown[]>;
	/** The relations whose query fails, and the message each fails with. */
	errors?: Record<string, string>;
};

/** One step of a query. Every step hands the builder back. */
type QueryBuilder = {
	select: () => QueryBuilder;
	in: (column: string, values: unknown[]) => QueryBuilder;
	overrideTypes: () => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
};

/**
 * A stand-in Supabase client that writes down what was asked of it and answers
 * every query on one relation with that relation's rows from `answers`.
 */
function createStandInSupabase(answers: StandInAnswers = {}): {
	supabase: SupabaseClient;
	queries: RecordedQuery[];
} {
	const queries: RecordedQuery[] = [];

	function builderFor(table: string): QueryBuilder {
		const query: RecordedQuery = { table, in: [] };
		queries.push(query);

		const message = answers.errors?.[table];
		const rows = answers.rows?.[table] ?? [];

		const builder: QueryBuilder = {
			select: () => builder,
			in: (column, values) => {
				query.in.push([column, values]);
				return builder;
			},
			overrideTypes: async () => ({
				data: message ? null : rows,
				error: message ? { message } : null
			})
		};

		return builder;
	}

	return { supabase: { from: builderFor } as unknown as SupabaseClient, queries };
}

/** One row of the `seats` table, free and held for nobody until a test says otherwise. */
function seatRow(changes: Partial<SeatRow> = {}): SeatRow {
	return {
		id: 'seat-1',
		name: 'France',
		kind: 'country',
		country_code: 'FR',
		position: 0,
		is_available: true,
		user_id: null,
		delegation_id: null,
		...changes
	};
}

describe('readSeatHolders', () => {
	it('asks nothing when every seat is still free', async () => {
		const { supabase, queries } = createStandInSupabase();

		const holders = await readSeatHolders(supabase, [seatRow(), seatRow({ id: 'seat-2' })]);

		expect(holders.size).toBe(0);
		expect(queries).toEqual([]);
	});

	it('looks up everybody sitting in these seats at once, by user id', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				profiles: [
					{ id: 'user-1', full_name: 'Daniel Park', avatar_path: 'user-1/avatar.png' },
					{ id: 'user-2', full_name: 'Amara Okafor', avatar_path: null }
				]
			}
		});
		const rows = [
			seatRow({ user_id: 'user-1' }),
			seatRow({ id: 'seat-2' }),
			seatRow({ id: 'seat-3', user_id: 'user-2' })
		];

		const holders = await readSeatHolders(supabase, rows);

		expect(queries).toEqual([{ table: 'profiles', in: [['id', ['user-1', 'user-2']]] }]);
		expect(holders.get('user-1')).toEqual({
			fullName: 'Daniel Park',
			avatarPath: 'user-1/avatar.png'
		});
		expect(holders.get('user-2')).toEqual({ fullName: 'Amara Okafor', avatarPath: null });
	});

	it('throws when the names cannot be read, because every profile is readable', async () => {
		const { supabase } = createStandInSupabase({ errors: { profiles: 'connection lost' } });

		await expect(readSeatHolders(supabase, [seatRow({ user_id: 'user-1' })])).rejects.toThrow(
			/Could not read the delegates' names: connection lost/
		);
	});
});

describe('readDelegationNames', () => {
	it('asks nothing when no seat is held for a delegation', async () => {
		const { supabase, queries } = createStandInSupabase();

		const names = await readDelegationNames(supabase, [seatRow()]);

		expect(names.size).toBe(0);
		expect(queries).toEqual([]);
	});

	it('looks up the delegations these seats are held for, by delegation id, through the view', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { participant_delegations: [{ id: 'delegation-1', name: 'Lycée Molière' }] }
		});

		const names = await readDelegationNames(supabase, [seatRow({ delegation_id: 'delegation-1' })]);

		// `participant_delegations` and not `delegations`: the view names a group
		// to everybody who may know of it without handing over its join code.
		expect(queries).toEqual([{ table: 'participant_delegations', in: [['id', ['delegation-1']]] }]);
		expect(names.get('delegation-1')).toBe('Lycée Molière');
	});

	it('answers with no names rather than failing when the reader may not see the delegation', async () => {
		// The view answers nothing to anybody outside the delegation, its
		// organisers and the chairs who list its delegates, which comes back as
		// no rows, not as an error.
		const { supabase } = createStandInSupabase();

		const names = await readDelegationNames(supabase, [seatRow({ delegation_id: 'delegation-1' })]);

		expect(names.size).toBe(0);
	});
});

describe('holderOf', () => {
	const holders = new Map([['user-1', { fullName: 'Daniel Park', avatarPath: null }]]);

	it('names whoever sits in the seat', () => {
		expect(holderOf(seatRow({ user_id: 'user-1' }), holders)).toEqual({
			fullName: 'Daniel Park',
			avatarPath: null
		});
	});

	it('is null for a free seat', () => {
		expect(holderOf(seatRow(), holders)).toBeNull();
	});

	it('is null for a held seat whose delegate has no profile row', () => {
		expect(holderOf(seatRow({ user_id: 'user-without-profile' }), holders)).toBeNull();
	});
});
