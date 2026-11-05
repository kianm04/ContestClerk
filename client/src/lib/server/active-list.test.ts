import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RoomSeat } from '$lib/committee-room';
import { readListWithEntries } from './active-list';

// Nothing here talks to a database. The stand-in client answers each table's
// query with fixed rows, the way `gsl-view.test.ts` does.

/** An answer to one query, in the shape the real client gives one. */
type Answer = { data: unknown; error: { message: string } | null };

/** A stand-in Supabase client answering each table's query from `answers`. */
function createStandIn(answers: Record<string, Answer>): SupabaseClient {
	function builderFor(table: string) {
		const answer = answers[table] ?? { data: null, error: null };
		const builder = {
			then: (resolve: (value: Answer) => void) => resolve(answer),
			select: () => builder,
			eq: () => builder,
			order: () => builder,
			maybeSingle: () => builder,
			overrideTypes: () => builder
		};

		return builder;
	}

	return { from: builderFor } as unknown as SupabaseClient;
}

const FRANCE: RoomSeat = {
	id: 'seat-fr',
	name: 'France',
	countryCode: 'FR',
	delegateName: 'Claire Martin'
};

const SINGLE_LIST_ROW = {
	id: 'single-1',
	name: 'Single speaker',
	speaking_time_seconds: 60,
	is_open: true,
	purpose: 'Right of reply'
};

describe('readListWithEntries', () => {
	it('reads the list, its purpose and every entry, a typed name standing in a seat of its own', async () => {
		const supabase = createStandIn({
			speakers_lists: { data: SINGLE_LIST_ROW, error: null },
			speakers_list_entries: {
				data: [
					{
						id: 'entry-sg',
						position: 1,
						status: 'spoken',
						spoke_seconds: 58,
						finished_at: '2026-10-01T10:04:00+00:00',
						speaker_name: 'Secretary-General',
						seat: null
					},
					{
						id: 'entry-fr',
						position: 2,
						status: 'speaking',
						spoke_seconds: null,
						finished_at: null,
						speaker_name: null,
						seat: { id: 'seat-fr', name: 'France', country_code: 'FR' }
					}
				],
				error: null
			}
		});

		const list = await readListWithEntries(supabase, 'single-1', [FRANCE]);

		expect(list).toEqual({
			speakersList: {
				id: 'single-1',
				name: 'Single speaker',
				speakingTimeSeconds: 60,
				isOpen: true
			},
			purpose: 'Right of reply',
			speakers: [
				{
					id: 'entry-sg',
					position: 1,
					status: 'spoken',
					spokeSeconds: 58,
					finishedAt: '2026-10-01T10:04:00+00:00',
					seat: { id: 'entry-sg', name: 'Secretary-General', countryCode: null }
				},
				{
					id: 'entry-fr',
					position: 2,
					status: 'speaking',
					spokeSeconds: null,
					finishedAt: null,
					seat: FRANCE
				}
			]
		});
	});

	it('answers null for a list this reader cannot see', async () => {
		const supabase = createStandIn({
			speakers_lists: { data: null, error: null },
			speakers_list_entries: { data: [], error: null }
		});

		expect(await readListWithEntries(supabase, 'gone', [])).toBeNull();
	});

	it('throws when a query fails', async () => {
		const supabase = createStandIn({
			speakers_lists: { data: null, error: { message: 'boom' } }
		});

		await expect(readListWithEntries(supabase, 'single-1', [])).rejects.toThrow('boom');
	});
});
