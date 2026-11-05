import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RoomSeat } from '$lib/committee-room';
import { readGslList } from './gsl-view';

// Nothing here talks to a database. The stand-in client below writes down what
// each query asked for and answers with fixed rows, the way
// `speakers-list-edits.test.ts` does. The whole view runs against a real
// database in `tests/e2e/chair-gsl.spec.ts`.

/** An answer to one query, in the shape the real client gives one. */
type Answer = { data: unknown; error: { message: string } | null };

/** What one query was asking for. */
type RecordedQuery = { table: string; eq: [string, unknown][] };

/** One step of a query. Every step hands the builder back, and awaiting it gives the answer. */
type QueryBuilder = {
	then: (resolve: (answer: Answer) => void) => void;
	select: () => QueryBuilder;
	eq: (column: string, value: unknown) => QueryBuilder;
	order: () => QueryBuilder;
	limit: () => QueryBuilder;
	maybeSingle: () => QueryBuilder;
	overrideTypes: () => QueryBuilder;
};

/** A stand-in Supabase client answering each table's query from `answers`. */
function createStandIn(answers: Record<string, Answer>) {
	const calls: RecordedQuery[] = [];

	function builderFor(table: string): QueryBuilder {
		const record: RecordedQuery = { table, eq: [] };
		calls.push(record);
		const answer = answers[table] ?? { data: null, error: null };

		const builder: QueryBuilder = {
			then: (resolve) => resolve(answer),
			select: () => builder,
			eq: (column, value) => {
				record.eq.push([column, value]);
				return builder;
			},
			order: () => builder,
			limit: () => builder,
			maybeSingle: () => builder,
			overrideTypes: () => builder
		};

		return builder;
	}

	return { supabase: { from: builderFor } as unknown as SupabaseClient, calls };
}

const CHINA: RoomSeat = {
	id: 'seat-cn',
	name: 'China',
	countryCode: 'CN',
	delegateName: 'Wei Zhang'
};

const GSL_ROW = {
	id: 'gsl-1',
	name: "General Speakers' List",
	speaking_time_seconds: 90,
	is_open: true
};

describe('readGslList', () => {
	it("reads the session's list of kind general, and its entries with the layout's seats", async () => {
		const { supabase, calls } = createStandIn({
			speakers_lists: { data: GSL_ROW, error: null },
			speakers_list_entries: {
				data: [
					{
						id: 'entry-cn',
						position: 1,
						status: 'spoken',
						spoke_seconds: 88,
						finished_at: '2026-10-01T10:04:00+00:00',
						speaker_name: null,
						seat: { id: 'seat-cn', name: 'China', country_code: 'CN' }
					},
					{
						id: 'entry-gone',
						position: 2,
						status: 'waiting',
						spoke_seconds: null,
						finished_at: null,
						speaker_name: null,
						seat: { id: 'seat-xx', name: 'Atlantis', country_code: null }
					}
				],
				error: null
			}
		});

		expect(await readGslList(supabase, 'session-1', [CHINA])).toEqual({
			speakersList: {
				id: 'gsl-1',
				name: "General Speakers' List",
				speakingTimeSeconds: 90,
				isOpen: true
			},
			speakers: [
				{
					id: 'entry-cn',
					position: 1,
					status: 'spoken',
					spokeSeconds: 88,
					finishedAt: '2026-10-01T10:04:00+00:00',
					seat: CHINA
				},
				{
					// A seat taken off offer since falls back to what the entry says about it.
					id: 'entry-gone',
					position: 2,
					status: 'waiting',
					spokeSeconds: null,
					finishedAt: null,
					seat: { id: 'seat-xx', name: 'Atlantis', countryCode: null }
				}
			]
		});
		expect(calls[0].eq).toEqual([
			['session_id', 'session-1'],
			['kind', 'general']
		]);
		expect(calls[1].eq).toEqual([['speakers_list_id', 'gsl-1']]);
	});

	it('answers null, and asks for no entries, when the session has no General Speakers’ List', async () => {
		const { supabase, calls } = createStandIn({ speakers_lists: { data: null, error: null } });

		expect(await readGslList(supabase, 'session-1', [CHINA])).toBeNull();
		expect(calls.map((call) => call.table)).toEqual(['speakers_lists']);
	});

	it('throws when either query fails', async () => {
		const listFails = createStandIn({
			speakers_lists: { data: null, error: { message: 'boom' } }
		});
		const entriesFail = createStandIn({
			speakers_lists: { data: GSL_ROW, error: null },
			speakers_list_entries: { data: null, error: { message: 'boom' } }
		});

		await expect(readGslList(listFails.supabase, 'session-1', [])).rejects.toThrow(
			"Could not read the General Speakers' List: boom"
		);
		await expect(readGslList(entriesFail.supabase, 'session-1', [])).rejects.toThrow(
			'Could not read the speakers: boom'
		);
	});
});
