import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readMyRooms } from './schedule-rooms';

// What `readMyRooms` asks the database and how it turns the answers into
// rooms. The stand-in client answers each table with the rows the test gave
// it. Which rows Row Level Security lets a reader have is tested in `tests/db/`.

/** A committee row as both lookups bring it along, which a test changes as it needs. */
function committeeRow(overrides: Record<string, unknown> = {}) {
	return {
		id: 'committee-unsc',
		slug: 'unsc',
		name: 'Security Council',
		abbreviation: 'UNSC',
		conferences: {
			id: 'conference-northbridge',
			slug: 'northbridge-mun',
			name: 'Northbridge MUN',
			start_date: '2026-09-27',
			end_date: '2026-09-29',
			timezone: 'Europe/London'
		},
		...overrides
	};
}

/** A client whose `from(table)` answers with `rowsByTable[table]`, and which records the user filter. */
function makeStandIn(rowsByTable: Record<string, unknown[]>, failingTable: string | null = null) {
	const userFilters: [string, unknown][] = [];

	function from(table: string) {
		const query = {
			select: () => query,
			eq: (column: string, value: unknown) => {
				userFilters.push([`${table}.${column}`, value]);
				return query;
			},
			overrideTypes: () =>
				Promise.resolve(
					table === failingTable
						? { data: null, error: { message: 'down' } }
						: { data: rowsByTable[table] ?? [], error: null }
				)
		};

		return query;
	}

	return { client: { from } as unknown as SupabaseClient, userFilters };
}

describe('readMyRooms', () => {
	it("reads the reader's own chairs and seats, and lists the chaired committees first", async () => {
		const { client, userFilters } = makeStandIn({
			seats: [
				{
					committees: committeeRow({
						id: 'committee-hrc',
						abbreviation: null,
						name: 'Human Rights Council',
						slug: 'hrc'
					})
				}
			],
			committee_chairs: [{ committees: committeeRow() }]
		});

		const rooms = await readMyRooms(client, 'user-1');

		expect(userFilters).toEqual([
			['committee_chairs.user_id', 'user-1'],
			['seats.user_id', 'user-1']
		]);
		expect(rooms).toEqual([
			{
				committeeId: 'committee-unsc',
				heading: 'UNSC',
				committeeSlug: 'unsc',
				conference: {
					id: 'conference-northbridge',
					slug: 'northbridge-mun',
					name: 'Northbridge MUN',
					startDate: '2026-09-27',
					endDate: '2026-09-29',
					timezone: 'Europe/London'
				},
				isChair: true
			},
			expect.objectContaining({
				committeeId: 'committee-hrc',
				heading: 'Human Rights Council',
				isChair: false
			})
		]);
	});

	it('leaves out a row whose committee or conference could not be read', async () => {
		const { client } = makeStandIn({
			seats: [{ committees: null }, { committees: committeeRow({ conferences: null }) }]
		});

		expect(await readMyRooms(client, 'user-1')).toEqual([]);
	});

	it('gives a quick session no "Your room" line (S14)', async () => {
		const quickConference = { ...committeeRow().conferences, kind: 'quick_session' };
		const { client } = makeStandIn({
			committee_chairs: [
				{ committees: committeeRow({ id: 'committee-quick', conferences: quickConference }) },
				{ committees: committeeRow() }
			]
		});

		const rooms = await readMyRooms(client, 'user-1');

		expect(rooms.map((room) => room.committeeId)).toEqual(['committee-unsc']);
	});

	it('throws when either lookup fails', async () => {
		const { client } = makeStandIn({}, 'seats');

		await expect(readMyRooms(client, 'user-1')).rejects.toThrow(
			'Could not list the committees you sit in: down'
		);
	});
});
