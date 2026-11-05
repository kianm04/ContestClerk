import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RoomSeat } from '$lib/committee-room';
import {
	addSpeaker,
	getSpeakersLists,
	placeSpeakers,
	removeSpeaker,
	setListOpen,
	setSpeakingTime,
	swapSpeakers
} from './speakers-list-edits';

// Nothing here talks to a database. The stand-in client below writes down what
// each query asked for and answers with fixed rows, the way
// `speakers-lists.test.ts` does for the floor's moves. Row Level Security is
// tested in `tests/db/`, and the whole page runs against a real database in
// `tests/e2e/speakers-list.spec.ts`.

/** An answer to one query, in the shape the real client gives one. */
type Answer = { data: unknown; error: { message: string } | null };

/** What one query was asking for. */
type RecordedQuery = {
	table: string;
	eq: [string, unknown][];
	in: [string, unknown[]][];
	inserted: Record<string, unknown> | null;
	updated: Record<string, unknown> | null;
};

/** One step of a query. Every step hands the builder back, and awaiting it gives the answer. */
type QueryBuilder = {
	then: (resolve: (answer: Answer) => void) => void;
	select: (columns: string) => QueryBuilder;
	insert: (row: Record<string, unknown>) => QueryBuilder;
	update: (columns: Record<string, unknown>) => QueryBuilder;
	eq: (column: string, value: unknown) => QueryBuilder;
	in: (column: string, values: unknown[]) => QueryBuilder;
	order: (column: string) => QueryBuilder;
	overrideTypes: () => QueryBuilder;
};

/**
 * A stand-in Supabase client answering from `answers`, keyed by table name. A
 * list answers a table's queries in turn, repeating its last answer.
 */
function createStandIn(answers: Partial<Record<string, Answer | Answer[]>>) {
	const calls: RecordedQuery[] = [];
	const timesAsked = new Map<string, number>();

	function nextAnswer(table: string): Answer {
		const configured = answers[table] ?? { data: null, error: null };
		const list = Array.isArray(configured) ? configured : [configured];
		const count = timesAsked.get(table) ?? 0;
		timesAsked.set(table, count + 1);

		return list[Math.min(count, list.length - 1)];
	}

	function builderFor(table: string): QueryBuilder {
		const record: RecordedQuery = { table, eq: [], in: [], inserted: null, updated: null };
		calls.push(record);
		const answer = nextAnswer(table);

		const builder: QueryBuilder = {
			then: (resolve) => resolve(answer),
			select: () => builder,
			insert: (row) => {
				record.inserted = row;
				return builder;
			},
			update: (columns) => {
				record.updated = columns;
				return builder;
			},
			eq: (column, value) => {
				record.eq.push([column, value]);
				return builder;
			},
			in: (column, values) => {
				record.in.push([column, values]);
				return builder;
			},
			order: () => builder,
			overrideTypes: () => builder
		};

		return builder;
	}

	return { supabase: { from: builderFor } as unknown as SupabaseClient, calls };
}

/** What an update answers with once one row was changed. */
const ONE_ROW_CHANGED: Answer = { data: [{ id: 'changed' }], error: null };

/** What an update answers with when Row Level Security let nothing through. */
const NOTHING_CHANGED: Answer = { data: [], error: null };

const FRANCE: RoomSeat = { id: 'seat-fr', name: 'France', countryCode: 'FR', delegateName: 'Ana' };

describe('getSpeakersLists', () => {
	it('answers nothing, and asks for no entries, when the session has no list', async () => {
		const { supabase, calls } = createStandIn({ speakers_lists: { data: [], error: null } });

		expect(await getSpeakersLists(supabase, 'session-1', [FRANCE])).toEqual([]);
		expect(calls.map((call) => call.table)).toEqual(['speakers_lists']);
	});

	it('gives each list its own entries, with the layout’s seat where it has one', async () => {
		const { supabase, calls } = createStandIn({
			speakers_lists: {
				data: [
					{ id: 'list-1', name: 'GSL', speaking_time_seconds: 60, is_open: true },
					{ id: 'list-2', name: 'Caucus', speaking_time_seconds: 45, is_open: false }
				],
				error: null
			},
			speakers_list_entries: {
				data: [
					{
						id: 'entry-1',
						speakers_list_id: 'list-1',
						position: 1,
						status: 'spoken',
						spoke_seconds: 50,
						seat: { id: 'seat-fr', name: 'France', country_code: 'FR' }
					},
					{
						id: 'entry-2',
						speakers_list_id: 'list-2',
						position: 1,
						status: 'waiting',
						spoke_seconds: null,
						seat: { id: 'seat-old', name: 'Old seat', country_code: null }
					}
				],
				error: null
			}
		});

		const lists = await getSpeakersLists(supabase, 'session-1', [FRANCE]);

		expect(calls[0].eq).toEqual([['session_id', 'session-1']]);
		expect(calls[1].in).toEqual([['speakers_list_id', ['list-1', 'list-2']]]);
		expect(lists).toEqual([
			{
				speakersList: { id: 'list-1', name: 'GSL', speakingTimeSeconds: 60, isOpen: true },
				speakers: [{ id: 'entry-1', position: 1, status: 'spoken', spokeSeconds: 50, seat: FRANCE }]
			},
			{
				speakersList: { id: 'list-2', name: 'Caucus', speakingTimeSeconds: 45, isOpen: false },
				speakers: [
					{
						id: 'entry-2',
						position: 1,
						status: 'waiting',
						spokeSeconds: null,
						seat: { id: 'seat-old', name: 'Old seat', countryCode: null }
					}
				]
			}
		]);
	});

	it('reads an entry with no seat as its typed name, in a seat of its own (S9)', async () => {
		const { supabase } = createStandIn({
			speakers_lists: {
				data: [{ id: 'list-3', name: 'Single speaker', speaking_time_seconds: 60, is_open: true }],
				error: null
			},
			speakers_list_entries: {
				data: [
					{
						id: 'entry-9',
						speakers_list_id: 'list-3',
						position: 1,
						status: 'speaking',
						spoke_seconds: null,
						speaker_name: 'Secretary-General',
						seat: null
					}
				],
				error: null
			}
		});

		const [singleSpeaker] = await getSpeakersLists(supabase, 'session-1', [FRANCE]);

		expect(singleSpeaker.speakers).toEqual([
			{
				id: 'entry-9',
				position: 1,
				status: 'speaking',
				spokeSeconds: null,
				seat: { id: 'entry-9', name: 'Secretary-General', countryCode: null }
			}
		]);
	});

	it('throws when the lists cannot be read', async () => {
		const { supabase } = createStandIn({
			speakers_lists: { data: null, error: { message: 'boom' } }
		});

		await expect(getSpeakersLists(supabase, 'session-1', [])).rejects.toThrow(
			'Could not read the speakers lists: boom'
		);
	});
});

describe('addSpeaker', () => {
	it('adds the seat at the given position, waiting', async () => {
		const { supabase, calls } = createStandIn({});

		await addSpeaker(supabase, 'list-1', 'seat-fr', 4);

		expect(calls[0].inserted).toEqual({
			speakers_list_id: 'list-1',
			seat_id: 'seat-fr',
			position: 4,
			status: 'waiting'
		});
	});
});

describe('swapSpeakers', () => {
	it('gives each entry the other’s position', async () => {
		const { supabase, calls } = createStandIn({ speakers_list_entries: ONE_ROW_CHANGED });

		await swapSpeakers(supabase, { id: 'entry-1', position: 2 }, { id: 'entry-2', position: 5 });

		expect(calls.map((call) => [call.eq, call.updated])).toEqual([
			[[['id', 'entry-1']], { position: 5 }],
			[[['id', 'entry-2']], { position: 2 }]
		]);
	});

	it('throws when Row Level Security let nothing change', async () => {
		const { supabase } = createStandIn({ speakers_list_entries: NOTHING_CHANGED });

		await expect(
			swapSpeakers(supabase, { id: 'entry-1', position: 2 }, { id: 'entry-2', position: 5 })
		).rejects.toThrow('The speaker was not changed.');
	});
});

describe('placeSpeakers', () => {
	it('writes each new position in turn', async () => {
		const { supabase, calls } = createStandIn({ speakers_list_entries: ONE_ROW_CHANGED });

		await placeSpeakers(supabase, [
			{ id: 'entry-3', position: 2 },
			{ id: 'entry-1', position: 3 }
		]);

		expect(calls.map((call) => [call.eq, call.updated])).toEqual([
			[[['id', 'entry-3']], { position: 2 }],
			[[['id', 'entry-1']], { position: 3 }]
		]);
	});

	it('writes nothing when no position changes', async () => {
		const { supabase, calls } = createStandIn({ speakers_list_entries: ONE_ROW_CHANGED });

		await placeSpeakers(supabase, []);

		expect(calls).toEqual([]);
	});

	it('throws when Row Level Security let nothing change', async () => {
		const { supabase } = createStandIn({ speakers_list_entries: NOTHING_CHANGED });

		await expect(placeSpeakers(supabase, [{ id: 'entry-1', position: 2 }])).rejects.toThrow(
			'The speaker was not changed.'
		);
	});
});

describe('removeSpeaker', () => {
	it('marks the entry removed instead of deleting it', async () => {
		const { supabase, calls } = createStandIn({ speakers_list_entries: ONE_ROW_CHANGED });

		await removeSpeaker(supabase, 'entry-1');

		expect(calls[0].updated).toEqual({ status: 'removed' });
		expect(calls[0].eq).toEqual([['id', 'entry-1']]);
	});
});

describe('setSpeakingTime and setListOpen', () => {
	it('change only the column they are about', async () => {
		const { supabase, calls } = createStandIn({ speakers_lists: ONE_ROW_CHANGED });

		await setSpeakingTime(supabase, 'list-1', 90);
		await setListOpen(supabase, 'list-1', false);

		expect(calls.map((call) => call.updated)).toEqual([
			{ speaking_time_seconds: 90 },
			{ is_open: false }
		]);
		expect(calls[0].eq).toEqual([['id', 'list-1']]);
	});

	it('throw when Row Level Security let nothing change', async () => {
		const { supabase } = createStandIn({ speakers_lists: NOTHING_CHANGED });

		await expect(setListOpen(supabase, 'list-1', true)).rejects.toThrow(
			'The speakers list was not changed.'
		);
	});
});
