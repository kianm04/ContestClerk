import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	listAwardSeats,
	listAwardsByCommittee,
	listCommitteeAwards,
	listMyAwards,
	listPublishedCommitteeAwards,
	readAwardsPublishedAt
} from './awards';

// What this module decides on its own: which columns and filters it sends,
// which ids it asks `profiles` for names about, and how it turns the rows it
// reads into the shapes the chair's awards page, the organiser's awards page
// and `/profile` draw (sorting, who holds a seat, which awards have arrived
// yet). Nothing here talks to a database; the stand-in client below writes
// down what it was asked for and answers with fixed rows, the way
// `chair-notes.test.ts` does. Whether the database really lets a reader see
// those rows is Row Level Security's decision, and that is tested in
// `tests/db/awards.test.ts`.

/** An answer to one query, in the shape the real client gives one. */
type Answer = { data: unknown; error: { message: string; code?: string } | null };

/** What one query this module sent was asking for. */
type RecordedQuery = {
	/** The relation `.from(...)` named. */
	table: string;
	/** `insert`, `update`, `delete`, or `select` for a read. */
	kind: string;
	/** What `insert` or `update` was given. */
	written: unknown;
	/** Every `.eq` and `.in` filter, in the order they were added. */
	filters: [string, unknown][];
};

/**
 * A stand-in Supabase client that writes down what each query asked for and
 * answers from `answers`, keyed by table name. Every step of a query hands the
 * builder back, and awaiting it gives the answer, as the real builder does.
 *
 * `answers[table]` is a queue: the first query to a table takes the first
 * entry, the second query to the same table takes the second, and once the
 * queue runs out every further query repeats the last entry. A table that
 * always answers the same thing only needs one entry.
 */
function createStandIn(answers: Partial<Record<string, Answer[]>>) {
	const calls: RecordedQuery[] = [];
	const timesAsked: Record<string, number> = {};

	function builderFor(table: string) {
		const record: RecordedQuery = { table, kind: 'select', written: null, filters: [] };
		calls.push(record);

		const queue = answers[table] ?? [];
		const askedBefore = timesAsked[table] ?? 0;
		timesAsked[table] = askedBefore + 1;
		const answer = queue[askedBefore] ?? queue[queue.length - 1] ?? { data: null, error: null };

		const builder = {
			then: (resolve: (value: Answer) => void) => resolve(answer),
			select: () => builder,
			order: () => builder,
			overrideTypes: () => builder,
			single: () => builder,
			eq: (column: string, value: unknown) => {
				record.filters.push([column, value]);
				return builder;
			},
			in: (column: string, values: unknown) => {
				record.filters.push([column, values]);
				return builder;
			},
			insert: (row: unknown) => {
				record.kind = 'insert';
				record.written = row;
				return builder;
			},
			update: (row: unknown) => {
				record.kind = 'update';
				record.written = row;
				return builder;
			},
			delete: () => {
				record.kind = 'delete';
				return builder;
			}
		};

		return builder;
	}

	return { supabase: { from: builderFor } as unknown as SupabaseClient, calls };
}

describe('listCommitteeAwards', () => {
	it("lists a committee's awards by kind rank and then seat name, with the holder and proposer", async () => {
		const { supabase, calls } = createStandIn({
			awards: [
				{
					data: [
						{
							id: 'award-c',
							committee_id: 'committee-1',
							seat_id: 'seat-de',
							user_id: null,
							kind: 'custom',
							title: 'Spirit Award',
							status: 'proposed',
							created_by: 'chair-1',
							seat: { name: 'Germany', country_code: 'DE', user_id: 'delegate-de' }
						},
						{
							id: 'award-a',
							committee_id: 'committee-1',
							seat_id: 'seat-be',
							// A holder frozen onto the award itself, even though the seat
							// has since emptied: `user_id` wins over `seat.user_id`.
							user_id: 'delegate-be',
							kind: 'best_delegate',
							title: 'Best Delegate',
							status: 'proposed',
							created_by: 'chair-1',
							seat: { name: 'Belgium', country_code: 'BE', user_id: null }
						},
						{
							id: 'award-b',
							committee_id: 'committee-1',
							seat_id: 'seat-al',
							user_id: null,
							kind: 'best_delegate',
							title: 'Best Delegate',
							status: 'confirmed',
							created_by: 'chair-2',
							seat: { name: 'Aland', country_code: 'AX', user_id: 'delegate-al' }
						}
					],
					error: null
				}
			],
			profiles: [
				{
					data: [
						{ id: 'delegate-de', full_name: 'Erik' },
						// A holder whose profile has no name entered yet.
						{ id: 'delegate-be', full_name: null },
						{ id: 'delegate-al', full_name: 'Alice' },
						{ id: 'chair-1', full_name: 'Chair One' }
						// `chair-2` has no profile row at all.
					],
					error: null
				}
			]
		});

		const awards = await listCommitteeAwards(supabase, 'committee-1');

		expect(calls[0].filters).toEqual([['committee_id', ['committee-1']]]);
		// Every holder and every proposer is asked for once, as one distinct list.
		expect(calls[1].filters).toEqual([
			['id', ['delegate-de', 'delegate-be', 'delegate-al', 'chair-1', 'chair-2']]
		]);
		expect(awards).toEqual([
			{
				id: 'award-b',
				committeeId: 'committee-1',
				seatId: 'seat-al',
				seatName: 'Aland',
				countryCode: 'AX',
				holderName: 'Alice',
				isSeatEmpty: false,
				kind: 'best_delegate',
				title: 'Best Delegate',
				status: 'confirmed',
				createdBy: 'chair-2',
				// `chair-2` proposed this one, but has no profile row.
				proposerName: null
			},
			{
				id: 'award-a',
				committeeId: 'committee-1',
				seatId: 'seat-be',
				seatName: 'Belgium',
				countryCode: 'BE',
				holderName: null,
				isSeatEmpty: true,
				kind: 'best_delegate',
				title: 'Best Delegate',
				status: 'proposed',
				createdBy: 'chair-1',
				proposerName: 'Chair One'
			},
			{
				id: 'award-c',
				committeeId: 'committee-1',
				seatId: 'seat-de',
				seatName: 'Germany',
				countryCode: 'DE',
				holderName: 'Erik',
				isSeatEmpty: false,
				kind: 'custom',
				title: 'Spirit Award',
				status: 'proposed',
				createdBy: 'chair-1',
				proposerName: 'Chair One'
			}
		]);
	});

	it('asks for no names when the committee has no awards', async () => {
		const { supabase, calls } = createStandIn({ awards: [{ data: [], error: null }] });

		expect(await listCommitteeAwards(supabase, 'committee-1')).toEqual([]);
		expect(calls.some((call) => call.table === 'profiles')).toBe(false);
	});

	it('raises when the awards cannot be read', async () => {
		const { supabase } = createStandIn({
			awards: [{ data: null, error: { message: 'no connection' } }]
		});

		await expect(listCommitteeAwards(supabase, 'committee-1')).rejects.toThrow('no connection');
	});
});

describe('listAwardSeats', () => {
	it('returns no seats, and asks for nothing, when there are no committee ids', async () => {
		const { supabase, calls } = createStandIn({});

		expect(await listAwardSeats(supabase, [])).toEqual([]);
		expect(calls).toEqual([]);
	});

	it('reads the available seats of these committees, saying who holds each one', async () => {
		const { supabase, calls } = createStandIn({
			seats: [
				{
					data: [
						{
							id: 'seat-fr',
							committee_id: 'committee-1',
							name: 'France',
							country_code: 'FR',
							user_id: null
						},
						{
							id: 'seat-de',
							committee_id: 'committee-1',
							name: 'Germany',
							country_code: 'DE',
							user_id: 'delegate-de'
						}
					],
					error: null
				}
			],
			profiles: [{ data: [{ id: 'delegate-de', full_name: 'Erik' }], error: null }]
		});

		const seats = await listAwardSeats(supabase, ['committee-1', 'committee-2']);

		expect(calls[0].filters).toEqual([
			['committee_id', ['committee-1', 'committee-2']],
			['is_available', true]
		]);
		expect(seats).toEqual([
			{
				id: 'seat-fr',
				committeeId: 'committee-1',
				name: 'France',
				countryCode: 'FR',
				isFilled: false,
				delegateName: null
			},
			{
				id: 'seat-de',
				committeeId: 'committee-1',
				name: 'Germany',
				countryCode: 'DE',
				isFilled: true,
				delegateName: 'Erik'
			}
		]);
	});
});

describe('listAwardsByCommittee', () => {
	it('lists committees in page order, each with its own sorted awards and only its filled seats', async () => {
		const { supabase, calls } = createStandIn({
			committees: [
				{
					data: [
						{ id: 'committee-1', name: 'General Assembly', abbreviation: 'GA' },
						{ id: 'committee-2', name: 'Security Council', abbreviation: 'UNSC' }
					],
					error: null
				}
			],
			awards: [
				{
					data: [
						{
							id: 'award-1',
							committee_id: 'committee-1',
							seat_id: 'seat-1',
							user_id: null,
							kind: 'best_delegate',
							title: 'Best Delegate',
							status: 'confirmed',
							created_by: 'chair-1',
							seat: { name: 'France', country_code: 'FR', user_id: 'delegate-1' }
						},
						{
							id: 'award-2',
							committee_id: 'committee-1',
							seat_id: 'seat-2',
							user_id: null,
							kind: 'custom',
							title: 'Spirit Award',
							status: 'proposed',
							created_by: 'chair-1',
							seat: { name: 'Germany', country_code: 'DE', user_id: null }
						},
						{
							id: 'award-3',
							committee_id: 'committee-2',
							seat_id: 'seat-3',
							user_id: null,
							kind: 'best_delegate',
							title: 'Best Delegate',
							status: 'proposed',
							created_by: 'chair-2',
							seat: { name: 'Italy', country_code: 'IT', user_id: 'delegate-2' }
						}
					],
					error: null
				}
			],
			seats: [
				{
					data: [
						{
							id: 'seat-1',
							committee_id: 'committee-1',
							name: 'France',
							country_code: 'FR',
							user_id: 'delegate-1'
						},
						{
							id: 'seat-2',
							committee_id: 'committee-1',
							name: 'Germany',
							country_code: 'DE',
							user_id: null
						},
						{
							id: 'seat-4',
							committee_id: 'committee-1',
							name: 'Spain',
							country_code: 'ES',
							user_id: 'delegate-3'
						},
						{
							id: 'seat-3',
							committee_id: 'committee-2',
							name: 'Italy',
							country_code: 'IT',
							user_id: 'delegate-2'
						}
					],
					error: null
				}
			],
			// The awards and the seats each ask `profiles` for names in
			// parallel, so which of the two calls goes first is not settled.
			// One superset answer for both keeps the test the same either way.
			profiles: [
				{
					data: [
						{ id: 'delegate-1', full_name: 'Amira' },
						{ id: 'delegate-2', full_name: 'Luca' },
						{ id: 'delegate-3', full_name: 'Sara' },
						{ id: 'chair-1', full_name: 'Chair One' },
						{ id: 'chair-2', full_name: 'Chair Two' }
					],
					error: null
				}
			]
		});

		const sections = await listAwardsByCommittee(supabase, 'conference-1');

		expect(calls.find((call) => call.table === 'committees')?.filters).toEqual([
			['conference_id', 'conference-1']
		]);
		expect(calls.find((call) => call.table === 'awards')?.filters).toEqual([
			['committee_id', ['committee-1', 'committee-2']]
		]);
		expect(calls.find((call) => call.table === 'seats')?.filters).toEqual([
			['committee_id', ['committee-1', 'committee-2']],
			['is_available', true]
		]);

		expect(sections).toEqual([
			{
				committee: { id: 'committee-1', name: 'General Assembly', abbreviation: 'GA' },
				awards: [
					{
						id: 'award-1',
						committeeId: 'committee-1',
						seatId: 'seat-1',
						seatName: 'France',
						countryCode: 'FR',
						holderName: 'Amira',
						isSeatEmpty: false,
						kind: 'best_delegate',
						title: 'Best Delegate',
						status: 'confirmed',
						createdBy: 'chair-1',
						proposerName: 'Chair One'
					},
					{
						id: 'award-2',
						committeeId: 'committee-1',
						seatId: 'seat-2',
						seatName: 'Germany',
						countryCode: 'DE',
						holderName: null,
						isSeatEmpty: true,
						kind: 'custom',
						title: 'Spirit Award',
						status: 'proposed',
						createdBy: 'chair-1',
						proposerName: 'Chair One'
					}
				],
				filledSeats: [
					{
						id: 'seat-1',
						committeeId: 'committee-1',
						name: 'France',
						countryCode: 'FR',
						isFilled: true,
						delegateName: 'Amira'
					},
					{
						id: 'seat-4',
						committeeId: 'committee-1',
						name: 'Spain',
						countryCode: 'ES',
						isFilled: true,
						delegateName: 'Sara'
					}
				]
			},
			{
				committee: { id: 'committee-2', name: 'Security Council', abbreviation: 'UNSC' },
				awards: [
					{
						id: 'award-3',
						committeeId: 'committee-2',
						seatId: 'seat-3',
						seatName: 'Italy',
						countryCode: 'IT',
						holderName: 'Luca',
						isSeatEmpty: false,
						kind: 'best_delegate',
						title: 'Best Delegate',
						status: 'proposed',
						createdBy: 'chair-2',
						proposerName: 'Chair Two'
					}
				],
				filledSeats: [
					{
						id: 'seat-3',
						committeeId: 'committee-2',
						name: 'Italy',
						countryCode: 'IT',
						isFilled: true,
						delegateName: 'Luca'
					}
				]
			}
		]);
	});
});

describe('readAwardsPublishedAt', () => {
	it("reads the conference's publish moment", async () => {
		const { supabase, calls } = createStandIn({
			conferences: [{ data: { awards_published_at: '2027-02-10T10:00:00Z' }, error: null }]
		});

		expect(await readAwardsPublishedAt(supabase, 'conference-1')).toBe('2027-02-10T10:00:00Z');
		expect(calls[0].filters).toEqual([['id', 'conference-1']]);
	});

	it('reads null for a conference that has not published yet', async () => {
		const { supabase } = createStandIn({
			conferences: [{ data: { awards_published_at: null }, error: null }]
		});

		expect(await readAwardsPublishedAt(supabase, 'conference-1')).toBeNull();
	});

	it('raises when the conference cannot be read', async () => {
		const { supabase } = createStandIn({
			conferences: [{ data: null, error: { message: 'no connection' } }]
		});

		await expect(readAwardsPublishedAt(supabase, 'conference-1')).rejects.toThrow('no connection');
	});
});

describe('listPublishedCommitteeAwards', () => {
	it("reads the committee's published awards from the view, by seat name, with no ids but the award's", async () => {
		const { supabase, calls } = createStandIn({
			published_awards: [
				{
					data: [
						{
							id: 'award-2',
							kind: 'outstanding_delegate',
							title: 'Outstanding Delegate',
							seat_name: 'Austria',
							seat_country_code: 'AT',
							holder_name: null
						},
						{
							id: 'award-1',
							kind: 'best_delegate',
							title: 'Best Delegate',
							seat_name: 'France',
							seat_country_code: 'FR',
							holder_name: 'Amira Haddad'
						}
					],
					error: null
				}
			]
		});

		const awards = await listPublishedCommitteeAwards(supabase, 'committee-1');

		// One query of the view and no second one for names: the view brings the
		// holder's name along itself, and `profiles` is never asked.
		expect(calls.map((call) => call.table)).toEqual(['published_awards']);
		expect(calls[0].filters).toEqual([['committee_id', 'committee-1']]);
		// Best Delegate ranks above Outstanding Delegate whatever the seat names
		// say, the same order the chair's own page keeps.
		expect(awards).toEqual([
			{
				id: 'award-1',
				kind: 'best_delegate',
				title: 'Best Delegate',
				seatName: 'France',
				countryCode: 'FR',
				holderName: 'Amira Haddad',
				status: 'confirmed'
			},
			{
				id: 'award-2',
				kind: 'outstanding_delegate',
				title: 'Outstanding Delegate',
				seatName: 'Austria',
				countryCode: 'AT',
				holderName: null,
				status: 'confirmed'
			}
		]);
	});

	it('raises when the view cannot be read', async () => {
		const { supabase } = createStandIn({
			published_awards: [{ data: null, error: { message: 'no connection' } }]
		});

		await expect(listPublishedCommitteeAwards(supabase, 'committee-1')).rejects.toThrow(
			'no connection'
		);
	});
});

describe('listMyAwards', () => {
	it('lists only the confirmed, published awards of a conference whose publish moment has arrived, newest first', async () => {
		const { supabase, calls } = createStandIn({
			published_awards: [
				{
					data: [
						{
							id: 'award-old',
							title: 'Best Delegate',
							committee: {
								name: 'United Nations Security Council',
								abbreviation: 'UNSC',
								conference: {
									name: 'MUNMeet 2027',
									timezone: 'Europe/Amsterdam',
									awards_published_at: '2027-02-10T10:00:00Z'
								}
							}
						},
						{
							id: 'award-new',
							title: 'Outstanding Delegate',
							committee: {
								name: 'General Assembly',
								abbreviation: null,
								conference: {
									name: 'MUNMeet 2027',
									timezone: 'Europe/Amsterdam',
									awards_published_at: '2027-02-15T23:30:00Z'
								}
							}
						},
						{
							// This conference has not published its awards at all yet.
							id: 'award-unpublished',
							title: 'Verbal Commendation',
							committee: {
								name: 'ECOSOC',
								abbreviation: 'ECOSOC',
								conference: {
									name: 'MUNMeet 2027',
									timezone: 'Europe/Amsterdam',
									awards_published_at: null
								}
							}
						},
						{
							// This conference has scheduled its publish moment, but it
							// has not arrived yet.
							id: 'award-future',
							title: 'Honourable Mention',
							committee: {
								name: 'Legal Committee',
								abbreviation: null,
								conference: {
									name: 'MUNMeet 2027',
									timezone: 'Europe/Amsterdam',
									awards_published_at: '2027-04-01T00:00:00Z'
								}
							}
						},
						{
							id: 'award-no-committee',
							title: 'Custom Award',
							committee: null
						}
					],
					error: null
				}
			]
		});

		const now = new Date('2027-03-01T00:00:00Z');
		const awards = await listMyAwards(supabase, now);

		// Through the view, which says which rows are the reader's own; the
		// `awards` table itself no longer answers a delegate.
		expect(calls[0].table).toBe('published_awards');
		expect(calls[0].filters).toEqual([['is_mine', true]]);
		expect(awards).toEqual([
			{
				id: 'award-new',
				title: 'Outstanding Delegate',
				// No abbreviation, so the committee's full name is used instead.
				committeeLabel: 'General Assembly',
				conferenceName: 'MUNMeet 2027',
				// 23:30 UTC is already past midnight in Amsterdam (UTC+1 in February).
				publishedDay: '2027-02-16'
			},
			{
				id: 'award-old',
				title: 'Best Delegate',
				committeeLabel: 'UNSC',
				conferenceName: 'MUNMeet 2027',
				publishedDay: '2027-02-10'
			}
		]);
	});

	it('raises when the awards cannot be read', async () => {
		const { supabase } = createStandIn({
			published_awards: [{ data: null, error: { message: 'no connection' } }]
		});

		await expect(listMyAwards(supabase, new Date())).rejects.toThrow('no connection');
	});
});
