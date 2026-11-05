import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	announcementExists,
	countAudience,
	createAnnouncement,
	deleteAnnouncement,
	getAnnouncement,
	listAcceptedDelegations,
	listAnnouncementCommittees,
	listAnnouncementsFor,
	listAnnouncementsForOrganiser,
	markAnnouncementNotificationsRead,
	setAnnouncementPinned,
	updateAnnouncement
} from './announcements';

// These tests are about the decisions this module makes: which rows each query
// is scoped to, how a row becomes the shape the pages hold, how the author line
// is chosen, and which database errors mean "nothing there" rather than a
// failure. Nothing here talks to a database; the stand-in client below writes
// down what it was asked and answers with fixed rows, the way
// `schedule.test.ts` does. Which rows each reader may see is Row Level
// Security's decision, and is tested in `tests/db/announcements.test.ts`.

/** An error in the shape the real client reports one, with Postgres's code. */
type QueryError = { message: string; code?: string };

/** What one query to a table answers with. */
type TableAnswer = {
	rows?: unknown[];
	error?: QueryError;
	/** The total `{ count: 'exact' }` asks for. */
	count?: number;
};

/** What one query this module sent was asking for. */
type RecordedQuery = {
	table: string;
	/** Every step of the chain after `from`, as `[step name, its arguments]`. */
	steps: [string, unknown[]][];
};

/**
 * A stand-in Supabase client. Every step of a query is written down and hands
 * the same builder back, the way the real builder chains. The chain is
 * answered, when awaited, by the next answer queued for its table.
 */
function createStandInSupabase(
	answers: Record<string, TableAnswer[]> = {},
	rpcAnswer: { data: unknown; error: QueryError | null } = { data: [], error: null }
) {
	const queries: RecordedQuery[] = [];
	const rpcCalls: [string, Record<string, unknown>][] = [];

	function builderFor(table: string) {
		const query: RecordedQuery = { table, steps: [] };
		queries.push(query);

		const answer = answers[table]?.shift() ?? {};
		const rows = answer.rows ?? [];
		let isSingleRow = false;

		const settled = () => ({
			data: answer.error ? null : isSingleRow ? (rows[0] ?? null) : rows,
			error: answer.error ?? null,
			count: answer.count ?? null
		});

		// Each named step records its arguments and hands the builder back.
		const record =
			(name: string) =>
			(...args: unknown[]) => {
				query.steps.push([name, args]);

				if (name === 'maybeSingle') {
					isSingleRow = true;
				}

				return builder;
			};

		const builder: Record<string, unknown> = {
			then: (resolve: (value: unknown) => void) => resolve(settled())
		};

		for (const name of [
			'select',
			'insert',
			'update',
			'delete',
			'eq',
			'in',
			'is',
			'order',
			'range',
			'maybeSingle',
			'overrideTypes'
		]) {
			builder[name] = record(name);
		}

		return builder;
	}

	const supabase = {
		from: (table: string) => builderFor(table),
		rpc: async (name: string, params: Record<string, unknown>) => {
			rpcCalls.push([name, params]);
			return rpcAnswer;
		}
	} as unknown as SupabaseClient;

	return { supabase, queries, rpcCalls };
}

/** The arguments of every `step` a query took, in order. */
function stepsNamed(query: RecordedQuery, step: string): unknown[][] {
	return query.steps.filter(([name]) => name === step).map(([, args]) => args);
}

/** An announcement row as the database hands it back. */
function announcementRow(overrides: Record<string, unknown> = {}) {
	return {
		id: 'announcement-1',
		conference_id: 'conference-1',
		author_id: 'organiser-1',
		title: 'Dress code',
		body: 'Western business attire.',
		audience: 'everyone',
		committee_id: null,
		delegation_id: null,
		is_pinned: false,
		published_at: '2027-01-21T10:00:00Z',
		committees: null,
		delegations: null,
		...overrides
	};
}

describe('listAnnouncementsForOrganiser', () => {
	it('reads one conference, pinned first then newest, with the authors’ names', async () => {
		const { supabase, queries } = createStandInSupabase({
			announcements: [{ rows: [announcementRow()] }],
			profiles: [{ rows: [{ id: 'organiser-1', full_name: 'Sara Lind' }] }]
		});

		const announcements = await listAnnouncementsForOrganiser(supabase, 'conference-1');

		expect(stepsNamed(queries[0], 'eq')).toEqual([['conference_id', 'conference-1']]);
		expect(stepsNamed(queries[0], 'order')).toEqual([
			['is_pinned', { ascending: false }],
			['published_at', { ascending: false }]
		]);
		expect(announcements).toEqual([
			expect.objectContaining({ id: 'announcement-1', authorName: 'Sara Lind', isPinned: false })
		]);
	});

	it('does not ask for any names when there is nothing to list', async () => {
		const { supabase, queries } = createStandInSupabase();

		expect(await listAnnouncementsForOrganiser(supabase, 'conference-1')).toEqual([]);
		expect(queries.map((query) => query.table)).toEqual(['announcements']);
	});
});

describe('listAnnouncementsFor', () => {
	it('reads the asked-for page of twenty', async () => {
		const { supabase, queries } = createStandInSupabase({
			announcements: [{ rows: [], count: 25 }]
		});

		const result = await listAnnouncementsFor(supabase, 'conference-1', 2);

		expect(stepsNamed(queries[0], 'range')).toEqual([[20, 39]]);
		expect(result).toEqual({ rows: [], total: 25 });
	});

	it('names a chair of the announcement’s own committee, and says Secretariat otherwise', async () => {
		const { supabase } = createStandInSupabase({
			announcements: [
				{
					rows: [
						announcementRow({
							id: 'by-chair',
							author_id: 'chair-1',
							audience: 'committee',
							committee_id: 'committee-unsc',
							committees: { abbreviation: 'UNSC' }
						}),
						announcementRow({ id: 'by-organiser' })
					],
					count: 2
				}
			],
			profiles: [
				{
					rows: [
						{ id: 'chair-1', full_name: 'Anna Chen' },
						{ id: 'organiser-1', full_name: 'Sara Lind' }
					]
				}
			],
			committee_chairs: [{ rows: [{ committee_id: 'committee-unsc', user_id: 'chair-1' }] }]
		});

		const { rows } = await listAnnouncementsFor(supabase, 'conference-1', 1);

		expect(rows.map((row) => row.authorLine)).toEqual(['Anna Chen (Chair)', 'Secretariat']);
		expect(rows[0].committeeAbbreviation).toBe('UNSC');
	});

	it('answers an empty page for a page past the last one', async () => {
		const { supabase } = createStandInSupabase({
			announcements: [
				{ error: { message: 'Requested range not satisfiable', code: 'PGRST103' }, count: 3 }
			]
		});

		expect(await listAnnouncementsFor(supabase, 'conference-1', 9)).toEqual({ rows: [], total: 3 });
	});

	it('throws on any other error', async () => {
		const { supabase } = createStandInSupabase({
			announcements: [{ error: { message: 'boom' } }]
		});

		await expect(listAnnouncementsFor(supabase, 'conference-1', 1)).rejects.toThrow('boom');
	});
});

describe('getAnnouncement and announcementExists', () => {
	it('reads one announcement of this conference only', async () => {
		const { supabase, queries } = createStandInSupabase({
			announcements: [{ rows: [announcementRow()] }]
		});

		const announcement = await getAnnouncement(supabase, 'conference-1', 'announcement-1');

		expect(stepsNamed(queries[0], 'eq')).toEqual([
			['conference_id', 'conference-1'],
			['id', 'announcement-1']
		]);
		expect(announcement?.title).toBe('Dress code');
	});

	it('treats an id that is not a uuid as not found', async () => {
		const invalidId = { message: 'invalid input syntax for type uuid', code: '22P02' };
		const { supabase } = createStandInSupabase({
			announcements: [{ error: invalidId }, { error: invalidId }]
		});

		expect(await getAnnouncement(supabase, 'conference-1', 'nonsense')).toBeNull();
		expect(await announcementExists(supabase, 'nonsense')).toBe(false);
	});

	it('says whether a deleted announcement is still there', async () => {
		const { supabase } = createStandInSupabase({
			announcements: [{ rows: [] }, { rows: [{ id: 'announcement-1' }] }]
		});

		expect(await announcementExists(supabase, 'announcement-1')).toBe(false);
		expect(await announcementExists(supabase, 'announcement-1')).toBe(true);
	});
});

describe('the audience lists', () => {
	it('reads the committees in their order, and only the accepted delegations by name', async () => {
		const { supabase, queries } = createStandInSupabase({
			committees: [{ rows: [{ id: 'committee-unsc', name: 'Security Council' }] }],
			delegations: [{ rows: [{ id: 'delegation-1', name: 'Delft High School' }] }]
		});

		expect(await listAnnouncementCommittees(supabase, 'conference-1')).toEqual([
			{ id: 'committee-unsc', name: 'Security Council' }
		]);
		expect(await listAcceptedDelegations(supabase, 'conference-1')).toEqual([
			{ id: 'delegation-1', name: 'Delft High School' }
		]);
		expect(stepsNamed(queries[0], 'order')).toEqual([['position', { ascending: true }]]);
		expect(stepsNamed(queries[1], 'eq')).toContainEqual(['status', 'accepted']);
	});
});

describe('countAudience', () => {
	it('counts the audience the database names, leaving the author out', async () => {
		const { supabase, rpcCalls } = createStandInSupabase(
			{},
			{ data: ['organiser-1', 'delegate-1', 'delegate-2'], error: null }
		);

		const count = await countAudience(
			supabase,
			'conference-1',
			{ audience: 'committee', committeeId: 'committee-unsc', delegationId: null },
			'organiser-1'
		);

		expect(count).toBe(2);
		expect(rpcCalls).toEqual([
			[
				'conference_audience_user_ids',
				{
					conference_id: 'conference-1',
					audience: 'committee',
					committee_id: 'committee-unsc',
					delegation_id: undefined
				}
			]
		]);
	});
});

describe('the writes', () => {
	it('publishes with every column the form decides', async () => {
		const { supabase, queries } = createStandInSupabase();

		await createAnnouncement(supabase, 'conference-1', 'organiser-1', {
			audience: 'everyone',
			committeeId: null,
			delegationId: null,
			title: 'Dress code',
			body: 'Western business attire.',
			isPinned: true
		});

		expect(stepsNamed(queries[0], 'insert')).toEqual([
			[
				{
					conference_id: 'conference-1',
					author_id: 'organiser-1',
					title: 'Dress code',
					body: 'Western business attire.',
					audience: 'everyone',
					committee_id: null,
					delegation_id: null,
					is_pinned: true
				}
			]
		]);
	});

	it('edits the text and the pin, never the audience', async () => {
		const { supabase, queries } = createStandInSupabase();

		await updateAnnouncement(supabase, 'announcement-1', {
			title: 'New title',
			body: 'New body',
			isPinned: false
		});
		await setAnnouncementPinned(supabase, 'announcement-1', true);

		expect(stepsNamed(queries[0], 'update')).toEqual([
			[{ title: 'New title', body: 'New body', is_pinned: false }]
		]);
		expect(stepsNamed(queries[1], 'update')).toEqual([[{ is_pinned: true }]]);
	});

	it('deletes one announcement', async () => {
		const { supabase, queries } = createStandInSupabase();

		await deleteAnnouncement(supabase, 'announcement-1');

		expect(stepsNamed(queries[0], 'delete')).toEqual([[]]);
		expect(stepsNamed(queries[0], 'eq')).toEqual([['id', 'announcement-1']]);
	});

	it('marks only this reader’s unread announcement notifications of this conference', async () => {
		const { supabase, queries } = createStandInSupabase();

		await markAnnouncementNotificationsRead(supabase, 'delegate-1', 'conference-1');

		expect(queries[0].table).toBe('notifications');
		expect(stepsNamed(queries[0], 'eq')).toEqual([
			['user_id', 'delegate-1'],
			['conference_id', 'conference-1'],
			['kind', 'announcement']
		]);
		expect(stepsNamed(queries[0], 'is')).toEqual([['read_at', null]]);
	});

	it('throws when a write is refused', async () => {
		const { supabase } = createStandInSupabase({
			announcements: [{ error: { message: 'refused' } }]
		});

		await expect(deleteAnnouncement(supabase, 'announcement-1')).rejects.toThrow('refused');
	});
});
