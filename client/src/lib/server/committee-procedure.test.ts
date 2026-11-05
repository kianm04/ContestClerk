import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommitteeProcedure } from '$lib/committee-procedure';
import {
	SAVE_REFUSAL,
	applyCommitteeProcedure,
	copyCommitteeProcedure,
	getCommitteeProcedure,
	listOtherCommittees,
	saveCommitteeProcedure
} from './committee-procedure';

// These tests are about how this module asks and what it makes of the answers.
// Who may change these settings, and what the two procedures write, are the
// database's, tested with a real database in `tests/db/committee-papers.test.ts`.

/** A database answer: rows, or an error with a Postgres code. */
type Answer = { data: unknown; error: { code: string; message: string } | null };

/** One call the module made: an `rpc` by name, or a query on a table with its steps. */
type RecordedCall = { name: string; arguments: unknown[] };

/**
 * A stand-in Supabase client that answers each function or table with what it
 * is handed (nothing, by default), recording every call.
 */
function createStandIn(answers: Record<string, Answer> = {}) {
	const calls: RecordedCall[] = [];
	const answerFor = (name: string) => answers[name] ?? { data: null, error: null };

	function rpc(name: string, parameters: unknown) {
		calls.push({ name, arguments: [parameters] });
		return Promise.resolve(answerFor(name));
	}

	function from(table: string) {
		const call: RecordedCall = { name: table, arguments: [] };
		calls.push(call);

		// Every step records itself and hands the builder back, which is what lets the module chain them.
		const step =
			(stepName: string) =>
			(...stepArguments: unknown[]) => {
				call.arguments.push([stepName, ...stepArguments]);
				return builder;
			};

		const builder = {
			select: step('select'),
			update: step('update'),
			eq: step('eq'),
			neq: step('neq'),
			order: step('order'),
			maybeSingle: step('maybeSingle'),
			overrideTypes: () => Promise.resolve(answerFor(table))
		};

		return builder;
	}

	return { supabase: { rpc, from } as unknown as SupabaseClient, calls };
}

const FAULT = { data: null, error: { code: 'XX000', message: 'down' } };

/** THIMUN's settings, on a crisis committee. */
const THIMUN: CommitteeProcedure = {
	format: 'crisis',
	crisisAllowsResolutions: false,
	paperWords: 'submitters',
	hasWorkingPapers: false,
	sponsorLimit: null,
	supportMinimum: 3,
	supportUnit: 'seats',
	supportCountsSponsors: true,
	oneSponsorshipPerTopic: false,
	hasFriendlyAmendments: false,
	amendmentSupportMinimum: 0,
	amendmentSupportUnit: 'seats',
	preambleAmendable: false,
	hasSecondDegreeAmendments: true,
	checksFormat: true
};

/** The same, as the database names the columns. */
const THIMUN_ROW = {
	format: 'crisis',
	crisis_allows_resolutions: false,
	paper_words: 'submitters',
	has_working_papers: false,
	sponsor_limit: null,
	support_minimum: 3,
	support_unit: 'seats',
	support_counts_sponsors: true,
	one_sponsorship_per_topic: false,
	has_friendly_amendments: false,
	amendment_support_minimum: 0,
	amendment_support_unit: 'seats',
	preamble_amendable: false,
	has_second_degree_amendments: true,
	checks_format: true
};

describe('getCommitteeProcedure', () => {
	it('reads the committee and names its settings as the page does', async () => {
		const { supabase, calls } = createStandIn({ committees: { data: THIMUN_ROW, error: null } });

		expect(await getCommitteeProcedure(supabase, 'disec')).toEqual(THIMUN);
		expect(calls[0].arguments).toContainEqual(['eq', 'id', 'disec']);
	});

	it('answers null for a committee the reader cannot see', async () => {
		const { supabase } = createStandIn();

		expect(await getCommitteeProcedure(supabase, 'disec')).toBeNull();
	});

	it('throws on a fault', async () => {
		const { supabase } = createStandIn({ committees: FAULT });

		await expect(getCommitteeProcedure(supabase, 'disec')).rejects.toThrow(
			"Could not read the committee's resolution settings: down"
		);
	});
});

describe('saveCommitteeProcedure', () => {
	it('writes every column of the committee', async () => {
		const { supabase, calls } = createStandIn({
			committees: { data: [{ id: 'disec' }], error: null }
		});

		expect(await saveCommitteeProcedure(supabase, 'disec', THIMUN)).toEqual({ refusal: null });
		expect(calls[0].arguments).toEqual([
			['update', THIMUN_ROW],
			['eq', 'id', 'disec'],
			['select', 'id']
		]);
	});

	it('is refused when no row was changed', async () => {
		const { supabase } = createStandIn({ committees: { data: [], error: null } });

		expect(await saveCommitteeProcedure(supabase, 'disec', THIMUN)).toEqual({
			refusal: SAVE_REFUSAL
		});
	});

	it("is refused, in the page's own words, when the trigger says no", async () => {
		const { supabase } = createStandIn({
			committees: { data: null, error: { code: 'P0001', message: 'Only the people who edit…' } }
		});

		expect(await saveCommitteeProcedure(supabase, 'disec', THIMUN)).toEqual({
			refusal: SAVE_REFUSAL
		});
	});

	it('throws on a fault', async () => {
		const { supabase } = createStandIn({ committees: FAULT });

		await expect(saveCommitteeProcedure(supabase, 'disec', THIMUN)).rejects.toThrow(
			'Could not save the resolution settings: down'
		);
	});
});

describe('applyCommitteeProcedure', () => {
	it('asks the database to fill the settings from the procedure', async () => {
		const { supabase, calls } = createStandIn();

		expect(await applyCommitteeProcedure(supabase, 'disec', 'thimun')).toEqual({ refusal: null });
		expect(calls).toEqual([
			{
				name: 'apply_committee_procedure',
				arguments: [{ committee_id: 'disec', procedure_name: 'thimun' }]
			}
		]);
	});

	it("answers the database's sentence when it refuses", async () => {
		const sentence = 'Only the people who edit this committee can change its procedure.';
		const { supabase } = createStandIn({
			apply_committee_procedure: { data: null, error: { code: '42501', message: sentence } }
		});

		expect(await applyCommitteeProcedure(supabase, 'disec', 'thimun')).toEqual({
			refusal: sentence
		});
	});

	it('throws on a fault', async () => {
		const { supabase } = createStandIn({ apply_committee_procedure: FAULT });

		await expect(applyCommitteeProcedure(supabase, 'disec', 'thimun')).rejects.toThrow(
			'Could not apply the procedure: down'
		);
	});
});

describe('copyCommitteeProcedure', () => {
	it('asks the database to copy to every committee chosen', async () => {
		const { supabase, calls } = createStandIn();

		expect(await copyCommitteeProcedure(supabase, 'disec', ['unsc', 'hrc'])).toEqual({
			refusal: null
		});
		expect(calls).toEqual([
			{
				name: 'copy_committee_procedure',
				arguments: [{ from_committee_id: 'disec', to_committee_ids: ['unsc', 'hrc'] }]
			}
		]);
	});

	it("answers the database's sentence when it refuses", async () => {
		const sentence = 'Only the people who edit these committees can copy a procedure between them.';
		const { supabase } = createStandIn({
			copy_committee_procedure: { data: null, error: { code: '42501', message: sentence } }
		});

		expect(await copyCommitteeProcedure(supabase, 'disec', ['unsc'])).toEqual({
			refusal: sentence
		});
	});

	it('throws on a fault', async () => {
		const { supabase } = createStandIn({ copy_committee_procedure: FAULT });

		await expect(copyCommitteeProcedure(supabase, 'disec', ['unsc'])).rejects.toThrow(
			'Could not copy the settings: down'
		);
	});
});

describe('listOtherCommittees', () => {
	it("reads the conference's other committees in the organiser's order", async () => {
		const committees = [{ id: 'unsc', name: 'Security Council' }];
		const { supabase, calls } = createStandIn({ committees: { data: committees, error: null } });

		expect(await listOtherCommittees(supabase, 'riverside', 'disec')).toEqual(committees);
		expect(calls[0].arguments).toEqual([
			['select', 'id, name'],
			['eq', 'conference_id', 'riverside'],
			['neq', 'id', 'disec'],
			['order', 'position']
		]);
	});

	it('throws on a fault', async () => {
		const { supabase } = createStandIn({ committees: FAULT });

		await expect(listOtherCommittees(supabase, 'riverside', 'disec')).rejects.toThrow(
			"Could not read the conference's committees: down"
		);
	});
});
