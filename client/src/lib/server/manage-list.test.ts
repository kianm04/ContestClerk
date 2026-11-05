import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Conference } from '$lib/conferences';
import { SAMPLE_CONFERENCE } from '$lib/styleguide-samples';
import {
	draftSetupProgress,
	readConferenceFigures,
	readConferenceIdsWithTeam,
	readSeatsOnOffer
} from './manage-list';

/** What one query asked for, written down by the stand-in below. */
type RecordedQuery = {
	table: string;
	columns: string;
	/** Every filter as `column operator value`, such as `status neq draft`. */
	filters: string[];
};

/**
 * A client that answers each table with the rows `rows` holds for it (or fails
 * with the message `errors` holds), and writes down every query it was sent.
 * Every step of the chain hands the same object back, as the real builder does.
 */
function makeStandIn(
	rows: Record<string, unknown[]> = {},
	errors: Record<string, string> = {}
): { supabase: SupabaseClient; queries: RecordedQuery[] } {
	const queries: RecordedQuery[] = [];

	function from(table: string) {
		const recorded: RecordedQuery = { table, columns: '', filters: [] };
		queries.push(recorded);

		const message = errors[table];
		const answer = {
			data: message ? null : (rows[table] ?? []),
			error: message ? { message } : null
		};

		const query = {
			select: (columns: string) => {
				recorded.columns = columns;
				return query;
			},
			in: (column: string, values: unknown[]) => {
				recorded.filters.push(`${column} in ${values.join(',')}`);
				return query;
			},
			eq: (column: string, value: unknown) => {
				recorded.filters.push(`${column} eq ${value}`);
				return query;
			},
			neq: (column: string, value: unknown) => {
				recorded.filters.push(`${column} neq ${value}`);
				return query;
			},
			overrideTypes: () => Promise.resolve(answer),
			// `await` on the query itself asks for `then`, which answers the read.
			then: (resolve: (value: typeof answer) => void) => resolve(answer)
		};

		return query;
	}

	return { supabase: { from } as unknown as SupabaseClient, queries };
}

/** One seat on offer in a committee of this conference, held or not. */
function seatRow(conferenceId: string, holder: { user?: string; delegation?: string } = {}) {
	return {
		user_id: holder.user ?? null,
		delegation_id: holder.delegation ?? null,
		committees: { conference_id: conferenceId }
	};
}

/** Conferences whose invoices the reader may read: both of the two the tests count. */
const BOTH = new Set(['conference-1', 'conference-2']);

describe('readConferenceFigures', () => {
	it('answers nothing, without asking, when there are no conferences', async () => {
		const { supabase, queries } = makeStandIn();

		expect(await readConferenceFigures(supabase, [], new Set())).toEqual({});
		// An empty `in` list is refused by PostgREST, so nothing may be sent.
		expect(queries).toEqual([]);
	});

	it('asks one question of each table about every conference at once', async () => {
		const { supabase, queries } = makeStandIn();

		await readConferenceFigures(supabase, ['conference-1', 'conference-2'], BOTH);

		expect(queries).toEqual([
			{
				table: 'applications',
				columns: 'conference_id, status',
				filters: ['conference_id in conference-1,conference-2', 'status neq draft']
			},
			{
				table: 'seats',
				columns: 'user_id, delegation_id, committees!inner(conference_id)',
				filters: ['committees.conference_id in conference-1,conference-2', 'is_available eq true']
			},
			{
				table: 'invoices',
				columns: 'conference_id, amount_cents',
				filters: ['conference_id in conference-1,conference-2', 'status eq paid']
			},
			{
				table: 'conferences',
				columns: 'id, currency',
				filters: ['id in conference-1,conference-2']
			}
		]);
	});

	it('counts each conference on its own', async () => {
		const { supabase } = makeStandIn({
			applications: [
				{ conference_id: 'conference-1', status: 'submitted' },
				{ conference_id: 'conference-1', status: 'accepted' },
				{ conference_id: 'conference-2', status: 'submitted' }
			],
			seats: [
				seatRow('conference-1', { user: 'user-1' }),
				seatRow('conference-1', { delegation: 'delegation-1' }),
				seatRow('conference-1'),
				seatRow('conference-2')
			],
			invoices: [
				{ conference_id: 'conference-1', amount_cents: 4500 },
				{ conference_id: 'conference-1', amount_cents: 5500 }
			],
			conferences: [
				{ id: 'conference-1', currency: 'GBP' },
				{ id: 'conference-2', currency: 'USD' }
			]
		});

		const figures = await readConferenceFigures(supabase, ['conference-1', 'conference-2'], BOTH);

		expect(figures).toEqual({
			'conference-1': {
				applicationCount: 2,
				toReviewCount: 1,
				seatCount: 3,
				// A seat a delegation is keeping is held as much as one somebody sits in.
				heldSeatCount: 2,
				feesPaidCents: 10000,
				currency: 'GBP'
			},
			'conference-2': {
				applicationCount: 1,
				toReviewCount: 1,
				seatCount: 1,
				heldSeatCount: 0,
				feesPaidCents: 0,
				currency: 'USD'
			}
		});
	});

	it('leaves the fees out of a conference whose invoices the reader may not read', async () => {
		const { supabase, queries } = makeStandIn({
			invoices: [{ conference_id: 'conference-1', amount_cents: 4500 }]
		});

		const figures = await readConferenceFigures(
			supabase,
			['conference-1', 'conference-2'],
			new Set(['conference-1'])
		);

		expect(figures['conference-1'].feesPaidCents).toBe(4500);
		expect(figures['conference-2'].feesPaidCents).toBeNull();
		expect(queries.find((query) => query.table === 'invoices')?.filters).toContain(
			'conference_id in conference-1'
		);
	});

	it('asks nothing about invoices when the reader may read none of them', async () => {
		const { supabase, queries } = makeStandIn();

		await readConferenceFigures(supabase, ['conference-1'], new Set());

		expect(queries.map((query) => query.table)).not.toContain('invoices');
	});

	it('raises when a query fails, rather than showing figures of nought', async () => {
		const { supabase } = makeStandIn({}, { invoices: 'no connection' });

		await expect(readConferenceFigures(supabase, ['conference-1'], BOTH)).rejects.toThrow(
			'no connection'
		);
	});
});

describe('readSeatsOnOffer', () => {
	it('asks for the seats on offer in these conferences, with who holds them', async () => {
		const { supabase, queries } = makeStandIn({
			seats: [seatRow('conference-1', { user: 'user-1' })]
		});

		const seats = await readSeatsOnOffer(supabase, ['conference-1']);

		expect(queries).toEqual([
			{
				table: 'seats',
				columns: 'user_id, delegation_id, committees!inner(conference_id)',
				filters: ['committees.conference_id in conference-1', 'is_available eq true']
			}
		]);
		expect(seats).toEqual([seatRow('conference-1', { user: 'user-1' })]);
	});
});

describe('readConferenceIdsWithTeam', () => {
	it('answers nothing, without asking, when there are no drafts', async () => {
		const { supabase, queries } = makeStandIn();

		expect(await readConferenceIdsWithTeam(supabase, [])).toEqual(new Set());
		expect(queries).toEqual([]);
	});

	it('finds the conferences with a team member or an invitation', async () => {
		const { supabase, queries } = makeStandIn({
			conference_staff: [{ conference_id: 'conference-1' }],
			invites: [{ conference_id: 'conference-2' }, { conference_id: null }]
		});

		const ids = await readConferenceIdsWithTeam(supabase, ['conference-1', 'conference-2', 'x']);

		expect(ids).toEqual(new Set(['conference-1', 'conference-2']));
		expect(queries.map((query) => query.table)).toEqual(['conference_staff', 'invites']);
	});

	it('raises when a query fails', async () => {
		const { supabase } = makeStandIn({}, { invites: 'no connection' });

		await expect(readConferenceIdsWithTeam(supabase, ['conference-1'])).rejects.toThrow(
			'no connection'
		);
	});
});

describe('draftSetupProgress', () => {
	/** A draft with every detail filled in and its application window set. */
	const DRAFT: Conference = {
		...SAMPLE_CONFERENCE,
		status: 'draft',
		description: 'Three days of debate.',
		tagline: 'Debate the world',
		venueName: 'Town Hall',
		contactEmail: 'team@example.test',
		applicationsOpenAt: '2026-09-01T09:00:00Z',
		applicationsCloseAt: '2026-12-01T09:00:00Z'
	};

	const NOW = new Date('2026-10-02T09:00:00Z');

	it('has nothing to say about a conference that is no longer a draft', () => {
		expect(draftSetupProgress({ ...DRAFT, status: 'published' }, undefined, true, NOW)).toBeNull();
	});

	it('ticks only Team when the counts did not come back', () => {
		expect(draftSetupProgress(DRAFT, undefined, true, NOW)).toEqual({
			details: false,
			committees: false,
			applicationForm: false,
			fees: false,
			team: true
		});
	});

	it('reads the steps off the checklist the counts give', () => {
		const counts = {
			committeeCount: 1,
			committeesWithoutAvailableSeatsCount: 0,
			onlyCommitteeWithoutSeatsId: null,
			feeCount: 0,
			collectsPaymentsManually: false
		};

		expect(draftSetupProgress(DRAFT, counts, false, NOW)).toEqual({
			details: true,
			committees: true,
			applicationForm: true,
			fees: false,
			team: false
		});
	});
});
