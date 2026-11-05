import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PreviousConference } from '$lib/creation-draft';
import {
	importApplicationForm,
	importCommittees,
	importFees,
	loadSetupFacts,
	saveFeeCollection,
	setApplicationSettings,
	setFeeStatus
} from './creation-setup';

// These tests are about what this module asks for and writes. Nothing here
// talks to a database: the stand-in client writes down every query and
// answers each relation with the rows the test gave it, one list per query.
// Whether Row Level Security lets an organiser do it is tested in `tests/db/`.

type RecordedQuery = {
	table: string;
	columns: string;
	inserted: Record<string, unknown>[] | null;
	updated: Record<string, unknown> | null;
	eq: [string, unknown][];
};

type Answer = { data: unknown[] | null; error: { message: string } | null };

/** A Supabase client stand-in; see `fees.test.ts` for the long explanation of the shape. */
function createStandIn(rows: Record<string, unknown[][]> = {}, failing: string[] = []) {
	const queries: RecordedQuery[] = [];
	const used = new Map<string, number>();

	function from(table: string) {
		const query: RecordedQuery = { table, columns: '', inserted: null, updated: null, eq: [] };
		queries.push(query);
		const count = used.get(table) ?? 0;
		used.set(table, count + 1);
		const answers = rows[table] ?? [[]];
		const answer: Answer = failing.includes(table)
			? { data: null, error: { message: 'refused' } }
			: { data: answers[Math.min(count, answers.length - 1)], error: null };

		const builder = {
			select: (columns: string) => ((query.columns = columns), builder),
			insert: (inserted: Record<string, unknown>[]) => ((query.inserted = inserted), builder),
			update: (updated: Record<string, unknown>) => ((query.updated = updated), builder),
			eq: (column: string, value: unknown) => (query.eq.push([column, value]), builder),
			order: () => builder,
			overrideTypes: async () => answer,
			then: (resolve: (value: Answer) => void) => resolve(answer)
		};

		return builder;
	}

	return { supabase: { from } as unknown as SupabaseClient, queries };
}

function committeeRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'committee-1',
		slug: 'unsc',
		name: 'Security Council',
		abbreviation: 'UNSC',
		planned_seat_count: null,
		room: 'Aula',
		level: 'advanced',
		topics: ['Haiti'],
		description: null,
		default_speaking_time_seconds: 60,
		position: 0,
		...changes
	};
}

function questionRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'question-1',
		label: 'Why MUN?',
		help_text: null,
		type: 'short_text',
		options: [],
		is_required: true,
		position: 0,
		...changes
	};
}

const PREVIOUS = {
	id: 'previous-1',
	currency: 'EUR',
	collectsPaymentsManually: true,
	fees: [
		{
			id: 'fee-1',
			name: 'Delegate fee',
			amountCents: 3500,
			appliesTo: 'individual',
			description: 'Lunch included.'
		}
	],
	acceptsIndividualApplications: true,
	acceptsDelegations: false,
	committeePreferenceCount: 2,
	askMotivation: false,
	positionPaperRequired: true,
	applicationCloseRule: 'relative',
	applicationCloseOffsetDays: -7
} as unknown as PreviousConference;

const DRAFT = {
	id: 'draft-1',
	startDate: '2027-04-16',
	timezone: 'Europe/Amsterdam',
	applicationsCloseAt: null
};

describe('loadSetupFacts', () => {
	it('reads the committees, questions and fees of the draft, and last year in words', async () => {
		const { supabase, queries } = createStandIn({
			committees: [[committeeRow({ planned_seat_count: 30 })]],
			application_questions: [[questionRow()]],
			fees: [
				[
					{
						id: 'f',
						name: 'Delegate fee',
						amount_cents: 4000,
						applies_to: 'individual',
						description: 'x',
						position: 0
					}
				]
			]
		});

		const facts = await loadSetupFacts(supabase, { id: 'draft-1' }, PREVIOUS);

		expect(facts.committees[0]).toMatchObject({ abbreviation: 'UNSC', plannedSeatCount: 30 });
		expect(facts.questions[0].label).toBe('Why MUN?');
		expect(facts.fees[0]).toMatchObject({ amountCents: 4000, description: 'x' });
		expect(facts.previousFeeSummary).toBe('€35 delegate fee');
		expect(queries.every((query) => query.eq[0][1] === 'draft-1')).toBe(true);
	});

	it('has no summary without a previous edition', async () => {
		const { supabase } = createStandIn();

		expect((await loadSetupFacts(supabase, { id: 'draft-1' }, null)).previousFeeSummary).toBeNull();
	});
});

describe('importCommittees', () => {
	it('copies what is missing, with the seats it had and without its room', async () => {
		const { supabase, queries } = createStandIn({
			committees: [
				[
					{ ...committeeRow(), seats: [{ count: 30 }] },
					{ ...committeeRow({ slug: 'who', name: 'WHO' }), seats: [{ count: 0 }] }
				],
				[committeeRow({ slug: 'who' })]
			]
		});

		expect(await importCommittees(supabase, { id: 'previous-1' }, 'draft-1')).toBe(1);

		const insert = queries.find((query) => query.inserted !== null);
		expect(insert?.inserted).toEqual([
			{
				conference_id: 'draft-1',
				slug: 'unsc',
				name: 'Security Council',
				abbreviation: 'UNSC',
				description: null,
				level: 'advanced',
				topics: ['Haiti'],
				default_speaking_time_seconds: 60,
				position: 1,
				planned_seat_count: 30
			}
		]);
	});

	it('raises when last year cannot be read', async () => {
		const { supabase } = createStandIn({}, ['committees']);

		await expect(importCommittees(supabase, { id: 'previous-1' }, 'draft-1')).rejects.toThrow(
			"last year's committees"
		);
	});
});

describe('importApplicationForm', () => {
	it('copies the settings, opens manually, and adds the questions the draft lacks', async () => {
		const { supabase, queries } = createStandIn({
			application_questions: [
				[questionRow(), questionRow({ id: 'q2', label: 'Experience?' })],
				[questionRow()]
			]
		});

		expect(await importApplicationForm(supabase, PREVIOUS, DRAFT)).toEqual({ questionCount: 1 });

		const update = queries.find((query) => query.table === 'conferences')?.updated;
		expect(update).toMatchObject({
			accepts_delegations: false,
			committee_preference_count: 2,
			position_paper_required: true,
			application_open_mode: 'manual',
			application_close_offset_days: -7,
			applications_close_at: '2027-04-09T21:59:00.000Z'
		});
		const insert = queries.find((query) => query.inserted !== null)?.inserted;
		expect(insert).toEqual([
			expect.objectContaining({ conference_id: 'draft-1', label: 'Experience?', position: 1 })
		]);
	});
});

describe('importFees', () => {
	it('copies the fees with their descriptions and marks the draft paid', async () => {
		const { supabase, queries } = createStandIn();

		expect(await importFees(supabase, PREVIOUS, 'draft-1')).toBe(1);

		expect(queries.find((query) => query.inserted !== null)?.inserted?.[0]).toMatchObject({
			name: 'Delegate fee',
			amount_cents: 3500,
			description: 'Lunch included.',
			position: 0
		});
		expect(queries.find((query) => query.table === 'conferences')?.updated).toEqual({
			currency: 'EUR',
			collects_payments_manually: true,
			fee_status: 'paid'
		});
	});
});

describe('setFeeStatus, saveFeeCollection and setApplicationSettings', () => {
	it('write the draft row', async () => {
		const { supabase, queries } = createStandIn();

		await setFeeStatus(supabase, 'draft-1', 'free');
		await saveFeeCollection(supabase, 'draft-1', false);
		await setApplicationSettings(supabase, 'draft-1', {
			applicationOpenMode: 'on_publish',
			applicationsOpenAt: null,
			applicationCloseRule: 'relative',
			applicationCloseOffsetDays: -14,
			applicationsCloseAt: '2027-04-02T21:59:00.000Z',
			acceptsIndividualApplications: true,
			acceptsDelegations: true,
			committeePreferenceCount: 3,
			askMotivation: true,
			positionPaperRequired: false
		});

		expect(queries.map((query) => query.updated)).toEqual([
			{ fee_status: 'free' },
			{ fee_status: 'paid', collects_payments_manually: false },
			expect.objectContaining({
				application_open_mode: 'on_publish',
				committee_preference_count: 3
			})
		]);
		expect(queries.every((query) => query.eq[0][1] === 'draft-1')).toBe(true);
	});

	it('raises when the draft cannot be saved', async () => {
		const { supabase } = createStandIn({}, ['conferences']);

		await expect(setFeeStatus(supabase, 'draft-1', 'paid')).rejects.toThrow('Could not save');
	});
});
