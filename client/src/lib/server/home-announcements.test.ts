import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listHomeAnnouncements } from './home-announcements';

// These tests are about the request this module builds and what it makes of
// the answer: which conferences it asks about, in which order and how many,
// and which rows it turns into a line on the home page. Nothing here talks to
// a database; the stand-in client below writes down what it was asked and
// answers with fixed rows, the way `announcements.test.ts` does. Which
// announcements each reader may see is Row Level Security's decision, and is
// tested in `tests/db/announcements.test.ts`.

/** An error in the shape the real client reports one. */
type QueryError = { message: string };

/** What one query this module sent was asking for. */
type RecordedQuery = {
	table: string;
	/** Every step of the chain after `from`, as `[step name, its arguments]`. */
	steps: [string, unknown[]][];
};

/**
 * A stand-in Supabase client. Every step of a query is written down and hands
 * the same builder back, the way the real builder chains. The chain is
 * answered, when awaited, with `rows`, or fails with `error`.
 */
function createStandInSupabase(rows: unknown[] = [], error: QueryError | null = null) {
	const queries: RecordedQuery[] = [];

	function builderFor(table: string) {
		const query: RecordedQuery = { table, steps: [] };
		queries.push(query);

		const settled = () => ({ data: error ? null : rows, error });

		// Each named step records its arguments and hands the builder back.
		const record =
			(name: string) =>
			(...args: unknown[]) => {
				query.steps.push([name, args]);

				return builder;
			};

		const builder: Record<string, unknown> = {
			then: (resolve: (value: unknown) => void) => resolve(settled())
		};

		for (const name of ['select', 'in', 'order', 'limit', 'overrideTypes']) {
			builder[name] = record(name);
		}

		return builder;
	}

	const supabase = { from: (table: string) => builderFor(table) } as unknown as SupabaseClient;

	return { supabase, queries };
}

/** The arguments of every `step` a query took, in order. */
function stepsNamed(query: RecordedQuery, step: string): unknown[][] {
	return query.steps.filter(([name]) => name === step).map(([, args]) => args);
}

/** An announcement row as the database hands it back, with its conference alongside. */
function announcementRow(overrides: Record<string, unknown> = {}) {
	return {
		id: 'announcement-1',
		title: 'Dress code',
		published_at: '2027-01-21T10:00:00Z',
		conference_id: 'conference-1',
		conferences: {
			name: 'Amsterdam Open MUN 2027',
			slug: 'amsterdam-open-2027',
			timezone: 'Europe/Amsterdam'
		},
		...overrides
	};
}

describe('listHomeAnnouncements', () => {
	it('answers nothing, without asking, when the reader is at no conference', async () => {
		const { supabase, queries } = createStandInSupabase();

		expect(await listHomeAnnouncements(supabase, [])).toEqual([]);
		// An empty `in` list is refused by PostgREST, so nothing may be sent.
		expect(queries).toEqual([]);
	});

	it('asks for the newest three announcements of the reader’s conferences at once', async () => {
		const { supabase, queries } = createStandInSupabase();

		await listHomeAnnouncements(supabase, ['conference-1', 'conference-2']);

		expect(queries.map((query) => query.table)).toEqual(['announcements']);
		expect(stepsNamed(queries[0], 'select')).toEqual([
			['id, title, published_at, conference_id, conferences(name, slug, timezone)']
		]);
		expect(stepsNamed(queries[0], 'in')).toEqual([
			['conference_id', ['conference-1', 'conference-2']]
		]);
		expect(stepsNamed(queries[0], 'order')).toEqual([['published_at', { ascending: false }]]);
		expect(stepsNamed(queries[0], 'limit')).toEqual([[3]]);
	});

	it('asks for as many as it is told to', async () => {
		const { supabase, queries } = createStandInSupabase();

		await listHomeAnnouncements(supabase, ['conference-1'], 10);

		expect(stepsNamed(queries[0], 'limit')).toEqual([[10]]);
	});

	it('turns a row into the line the home page draws', async () => {
		const { supabase } = createStandInSupabase([announcementRow()]);

		expect(await listHomeAnnouncements(supabase, ['conference-1'])).toEqual([
			{
				id: 'announcement-1',
				title: 'Dress code',
				publishedAt: '2027-01-21T10:00:00Z',
				conferenceName: 'Amsterdam Open MUN 2027',
				conferenceSlug: 'amsterdam-open-2027',
				conferenceTimezone: 'Europe/Amsterdam'
			}
		]);
	});

	it('leaves out an announcement whose conference could not be read', async () => {
		const { supabase } = createStandInSupabase([
			announcementRow({ id: 'withheld', conferences: null }),
			announcementRow({ id: 'readable' })
		]);

		const announcements = await listHomeAnnouncements(supabase, ['conference-1']);

		expect(announcements.map((announcement) => announcement.id)).toEqual(['readable']);
	});

	it('raises when the query fails, rather than showing no announcements', async () => {
		const { supabase } = createStandInSupabase([], { message: 'no connection' });

		await expect(listHomeAnnouncements(supabase, ['conference-1'])).rejects.toThrow(
			'no connection'
		);
	});
});
