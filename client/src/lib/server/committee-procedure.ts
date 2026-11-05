/**
 * Reading and writing a committee's "Resolutions" settings
 * (`docs/committee-papers.md`, section 5) for its manage page: the settings
 * themselves, "Start from" a procedure, and copying them to other committees.
 *
 * Every query runs as the signed-in reader, so the database decides what is
 * allowed: `protect_committees_columns` lets anybody with `manage_committees`
 * on the committee change these columns, and `apply_committee_procedure` and
 * `copy_committee_procedure` ask the same of every committee they write.
 *
 * Files under `$lib/server` only ever run on the server.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	CommitteeProcedure,
	ProcedureCopyTarget,
	ProcedureName
} from '$lib/committee-procedure';

/** The settings columns, in the order of section 5's table. */
const PROCEDURE_COLUMNS =
	'format, crisis_allows_resolutions, paper_words, has_working_papers, sponsor_limit, ' +
	'support_minimum, support_unit, support_counts_sponsors, one_sponsorship_per_topic, ' +
	'has_friendly_amendments, amendment_support_minimum, amendment_support_unit, ' +
	'preamble_amendable, has_second_degree_amendments, checks_format';

/** One committee's settings as the database names them. */
type ProcedureRow = {
	format: CommitteeProcedure['format'];
	crisis_allows_resolutions: boolean;
	paper_words: CommitteeProcedure['paperWords'];
	has_working_papers: boolean;
	sponsor_limit: number | null;
	support_minimum: number;
	support_unit: CommitteeProcedure['supportUnit'];
	support_counts_sponsors: boolean;
	one_sponsorship_per_topic: boolean;
	has_friendly_amendments: boolean;
	amendment_support_minimum: number;
	amendment_support_unit: CommitteeProcedure['amendmentSupportUnit'];
	preamble_amendable: boolean;
	has_second_degree_amendments: boolean;
	checks_format: boolean;
};

function toProcedure(row: ProcedureRow): CommitteeProcedure {
	return {
		format: row.format,
		crisisAllowsResolutions: row.crisis_allows_resolutions,
		paperWords: row.paper_words,
		hasWorkingPapers: row.has_working_papers,
		sponsorLimit: row.sponsor_limit,
		supportMinimum: row.support_minimum,
		supportUnit: row.support_unit,
		supportCountsSponsors: row.support_counts_sponsors,
		oneSponsorshipPerTopic: row.one_sponsorship_per_topic,
		hasFriendlyAmendments: row.has_friendly_amendments,
		amendmentSupportMinimum: row.amendment_support_minimum,
		amendmentSupportUnit: row.amendment_support_unit,
		preambleAmendable: row.preamble_amendable,
		hasSecondDegreeAmendments: row.has_second_degree_amendments,
		checksFormat: row.checks_format
	};
}

function toRow(procedure: CommitteeProcedure): ProcedureRow {
	return {
		format: procedure.format,
		crisis_allows_resolutions: procedure.crisisAllowsResolutions,
		paper_words: procedure.paperWords,
		has_working_papers: procedure.hasWorkingPapers,
		sponsor_limit: procedure.sponsorLimit,
		support_minimum: procedure.supportMinimum,
		support_unit: procedure.supportUnit,
		support_counts_sponsors: procedure.supportCountsSponsors,
		one_sponsorship_per_topic: procedure.oneSponsorshipPerTopic,
		has_friendly_amendments: procedure.hasFriendlyAmendments,
		amendment_support_minimum: procedure.amendmentSupportMinimum,
		amendment_support_unit: procedure.amendmentSupportUnit,
		preamble_amendable: procedure.preambleAmendable,
		has_second_degree_amendments: procedure.hasSecondDegreeAmendments,
		checks_format: procedure.checksFormat
	};
}

/** One committee's settings, or `null` when the reader cannot see the committee. */
export async function getCommitteeProcedure(
	supabase: SupabaseClient,
	committeeId: string
): Promise<CommitteeProcedure | null> {
	const { data, error } = await supabase
		.from('committees')
		.select(PROCEDURE_COLUMNS)
		.eq('id', committeeId)
		.maybeSingle()
		.overrideTypes<ProcedureRow | null, { merge: false }>();

	if (error) {
		throw new Error(`Could not read the committee's resolution settings: ${error.message}`);
	}

	return data ? toProcedure(data) : null;
}

/** What a change came to: `refusal` is `null` once it is done, or the sentence that says why not. */
export type ProcedureChange = { refusal: string | null };

/** What a refused save says. The trigger's own sentence is about every column, not these. */
export const SAVE_REFUSAL = 'Only the people who edit this committee can change its settings.';

/**
 * The codes the database refuses with: not theirs to do (42501), not that
 * (22023), and the trigger's own `raise exception` (P0001). Anything else is a
 * fault, not a refusal.
 */
const REFUSAL_CODES = new Set(['42501', '22023', 'P0001']);

/** A database error, as Supabase hands one back. */
type DatabaseError = { code: string; message: string };

/** The change, or the sentence it was refused with. Throws on a fault. */
function toChange(
	error: DatabaseError | null,
	refusal: string | null,
	failure: string
): ProcedureChange {
	if (error === null) return { refusal: null };

	if (REFUSAL_CODES.has(error.code)) return { refusal: refusal ?? error.message };

	throw new Error(`${failure}: ${error.message}`);
}

/**
 * Save every setting of one committee. Row Level Security hides a committee
 * the reader may not change, so an update that touched no row was refused.
 */
export async function saveCommitteeProcedure(
	supabase: SupabaseClient,
	committeeId: string,
	procedure: CommitteeProcedure
): Promise<ProcedureChange> {
	const { data, error } = await supabase
		.from('committees')
		.update(toRow(procedure))
		.eq('id', committeeId)
		// Asks for the changed rows back, so a refusal shows as none.
		.select('id')
		.overrideTypes<{ id: string }[], { merge: false }>();

	const change = toChange(error, SAVE_REFUSAL, 'Could not save the resolution settings');

	if (change.refusal === null && (data ?? []).length === 0) {
		return { refusal: SAVE_REFUSAL };
	}

	return change;
}

/** Fill every setting but the format from one procedure ("Start from"). */
export async function applyCommitteeProcedure(
	supabase: SupabaseClient,
	committeeId: string,
	procedureName: ProcedureName
): Promise<ProcedureChange> {
	const { error } = await supabase.rpc('apply_committee_procedure', {
		committee_id: committeeId,
		procedure_name: procedureName
	});

	return toChange(error, null, 'Could not apply the procedure');
}

/** Copy one committee's settings, all but the format, to others of the same conference. */
export async function copyCommitteeProcedure(
	supabase: SupabaseClient,
	fromCommitteeId: string,
	toCommitteeIds: string[]
): Promise<ProcedureChange> {
	const { error } = await supabase.rpc('copy_committee_procedure', {
		from_committee_id: fromCommitteeId,
		to_committee_ids: toCommitteeIds
	});

	return toChange(error, null, 'Could not copy the settings');
}

/**
 * The conference's other committees, in the organiser's order. Which of them
 * the reader may change is the page's to decide from their permissions.
 */
export async function listOtherCommittees(
	supabase: SupabaseClient,
	conferenceId: string,
	committeeId: string
): Promise<ProcedureCopyTarget[]> {
	const { data, error } = await supabase
		.from('committees')
		.select('id, name')
		.eq('conference_id', conferenceId)
		.neq('id', committeeId)
		.order('position')
		.overrideTypes<ProcedureCopyTarget[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the conference's committees: ${error.message}`);
	}

	return data ?? [];
}
