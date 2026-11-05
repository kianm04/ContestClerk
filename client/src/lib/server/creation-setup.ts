/**
 * What the Setup step of creating a conference (Trello fe3reN7Y) reads and
 * writes besides the draft row itself: its committees, questions and fees,
 * the three "use last year's" imports, and the fee and application settings
 * its dialogs save.
 *
 * Files under `$lib/server` only ever run on the server. Every function takes
 * the Supabase client of the signed-in organiser, so Row Level Security still
 * decides what they may read from the previous edition and write to the draft.
 * Adding, changing and deleting one committee, question or fee reuses the
 * Manage pages' functions (`manage-committees.ts`, `application-questions.ts`,
 * `fees.ts`); only what Setup needs besides lives here.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApplicationQuestion } from '$lib/application-questions';
import type { CreationDraft, FeeStatus, PreviousConference } from '$lib/creation-draft';
import type { SetupCommittee, SetupFee } from '$lib/creation-setup-dialog';
import type { ApplicationSettings } from '$lib/creation-setup-forms';
import { feePhrase } from '$lib/creation-setup-status';
import type { FeeAppliesTo } from '$lib/fees';
import { relativeDeadlineInstant } from '$lib/relative-deadline';
import { listApplicationQuestions } from '$lib/server/application-questions';

/** Everything in other tables the Setup step shows. */
export type SetupFacts = {
	committees: SetupCommittee[];
	questions: ApplicationQuestion[];
	fees: SetupFee[];
	/** "€35 delegate fee": the previous edition's first fee, or `null` when it charged nothing. */
	previousFeeSummary: string | null;
};

const COMMITTEE_COLUMNS =
	'id, slug, name, abbreviation, planned_seat_count, room, level, topics, description, default_speaking_time_seconds, position';

type CommitteeRow = {
	id: string;
	slug: string;
	name: string;
	abbreviation: string | null;
	planned_seat_count: number | null;
	room: string | null;
	level: SetupCommittee['level'];
	topics: string[];
	description: string | null;
	default_speaking_time_seconds: number;
	position: number;
};

type FeeRow = {
	id: string;
	name: string;
	amount_cents: number;
	applies_to: FeeAppliesTo;
	description: string | null;
	position: number;
};

/** A conference's committees, rows as stored, in the organiser's order. */
async function readCommitteeRows(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<CommitteeRow[]> {
	const { data, error } = await supabase
		.from('committees')
		.select(COMMITTEE_COLUMNS)
		.eq('conference_id', conferenceId)
		.order('position', { ascending: true })
		.overrideTypes<CommitteeRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not list the committees: ${error.message}`);
	}

	return data ?? [];
}

/** A conference's fees with their descriptions, in the organiser's order. */
async function readFeeRows(supabase: SupabaseClient, conferenceId: string): Promise<FeeRow[]> {
	const { data, error } = await supabase
		.from('fees')
		.select('id, name, amount_cents, applies_to, description, position')
		.eq('conference_id', conferenceId)
		.order('position', { ascending: true })
		.overrideTypes<FeeRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not list the fees: ${error.message}`);
	}

	return data ?? [];
}

/** Everything the Setup page shows from other tables, read at once. */
export async function loadSetupFacts(
	supabase: SupabaseClient,
	draft: Pick<CreationDraft, 'id'>,
	previous: PreviousConference | null
): Promise<SetupFacts> {
	// `Promise.all` sends the three queries together rather than one after another.
	const [committeeRows, questions, feeRows] = await Promise.all([
		readCommitteeRows(supabase, draft.id),
		listApplicationQuestions(supabase, draft.id),
		readFeeRows(supabase, draft.id)
	]);

	const previousFee = previous?.fees[0] ?? null;

	return {
		committees: committeeRows.map((row) => ({
			id: row.id,
			name: row.name,
			abbreviation: row.abbreviation,
			plannedSeatCount: row.planned_seat_count,
			room: row.room,
			level: row.level,
			topics: row.topics,
			description: row.description,
			defaultSpeakingTimeSeconds: row.default_speaking_time_seconds,
			position: row.position
		})),
		questions,
		fees: feeRows.map((row) => ({
			id: row.id,
			name: row.name,
			amountCents: row.amount_cents,
			appliesTo: row.applies_to,
			description: row.description,
			position: row.position
		})),
		previousFeeSummary:
			previous === null || previousFee === null ? null : feePhrase(previousFee, previous.currency)
	};
}

/** Insert rows, or do nothing when there are none. */
async function insertRows(
	supabase: SupabaseClient,
	table: string,
	rows: Record<string, unknown>[],
	what: string
): Promise<void> {
	if (rows.length === 0) {
		return;
	}

	const { error } = await supabase.from(table).insert(rows);

	if (error) {
		throw new Error(`Could not copy the ${what}: ${error.message}`);
	}
}

/** Change columns of the draft row. */
async function updateDraft(
	supabase: SupabaseClient,
	draftId: string,
	columns: Record<string, unknown>
): Promise<void> {
	const { error } = await supabase.from('conferences').update(columns).eq('id', draftId);

	if (error) {
		throw new Error(`Could not save the draft: ${error.message}`);
	}
}

/**
 * Copy the previous edition's committees onto the draft, and answer how many
 * were added. A committee whose link the draft already uses is skipped, so
 * pressing the button twice copies nothing twice. The planned seats are how
 * many seats the committee really had, or last year's plan when it had none;
 * rooms and chairs belong to that year.
 */
export async function importCommittees(
	supabase: SupabaseClient,
	from: Pick<PreviousConference, 'id'>,
	draftId: string
): Promise<number> {
	// `seats(count)` is not a column: it asks for the number of seats pointing
	// at each committee, which arrives as a list holding one count.
	const { data, error } = await supabase
		.from('committees')
		.select(`${COMMITTEE_COLUMNS}, seats(count)`)
		.eq('conference_id', from.id)
		.order('position', { ascending: true })
		.overrideTypes<(CommitteeRow & { seats: { count: number }[] })[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read last year's committees: ${error.message}`);
	}

	const existing = await readCommitteeRows(supabase, draftId);
	const takenSlugs = new Set(existing.map((row) => row.slug));
	const missing = (data ?? []).filter((row) => !takenSlugs.has(row.slug));

	const rows = missing.map((row, index) => {
		const seatCount = row.seats[0]?.count ?? 0;

		return {
			conference_id: draftId,
			slug: row.slug,
			name: row.name,
			abbreviation: row.abbreviation,
			description: row.description,
			level: row.level,
			topics: row.topics,
			default_speaking_time_seconds: row.default_speaking_time_seconds,
			// After the committees already there, in last year's order.
			position: existing.length + index,
			// The seats it really had, or, for a committee that never got any, the plan.
			planned_seat_count: seatCount > 0 ? seatCount : row.planned_seat_count
		};
	});

	await insertRows(supabase, 'committees', rows, 'committees');

	return rows.length;
}

/**
 * Copy the previous edition's application form: who may apply, what the form
 * asks, when it closes, and every question whose wording the draft does not
 * have yet. Applications open when the organiser chooses, because last
 * year's opening date says nothing about this year.
 */
export async function importApplicationForm(
	supabase: SupabaseClient,
	from: PreviousConference,
	draft: Pick<CreationDraft, 'id' | 'startDate' | 'timezone' | 'applicationsCloseAt'>
): Promise<{ questionCount: number }> {
	const isRelative = from.applicationCloseRule === 'relative';

	await updateDraft(supabase, draft.id, {
		accepts_individual_applications: from.acceptsIndividualApplications,
		accepts_delegations: from.acceptsDelegations,
		committee_preference_count: from.committeePreferenceCount,
		ask_motivation: from.askMotivation,
		position_paper_required: from.positionPaperRequired,
		application_open_mode: 'manual',
		applications_open_at: null,
		application_close_rule: from.applicationCloseRule,
		application_close_offset_days: from.applicationCloseOffsetDays,
		// Last year's fixed date is in the past, so a fixed rule keeps this year's moment.
		applications_close_at: isRelative
			? relativeDeadlineInstant(draft.startDate, from.applicationCloseOffsetDays, draft.timezone)
			: draft.applicationsCloseAt
	});

	const [theirs, ours] = await Promise.all([
		listApplicationQuestions(supabase, from.id),
		listApplicationQuestions(supabase, draft.id)
	]);
	const takenLabels = new Set(ours.map((question) => question.label));
	const rows = theirs
		.filter((question) => !takenLabels.has(question.label))
		.map((question, index) => ({
			conference_id: draft.id,
			label: question.label,
			help_text: question.helpText,
			type: question.type,
			options: question.options,
			is_required: question.isRequired,
			position: ours.length + index
		}));

	await insertRows(supabase, 'application_questions', rows, 'questions');

	return { questionCount: rows.length };
}

/**
 * Copy the previous edition's fees, its currency and how it collected them,
 * and mark the draft as paid. A fee whose name the draft already has is
 * skipped. Answers how many were added.
 */
export async function importFees(
	supabase: SupabaseClient,
	from: Pick<PreviousConference, 'fees' | 'currency' | 'collectsPaymentsManually'>,
	draftId: string
): Promise<number> {
	const existing = await readFeeRows(supabase, draftId);
	const takenNames = new Set(existing.map((fee) => fee.name));
	const rows = from.fees
		.filter((fee) => !takenNames.has(fee.name))
		.map((fee, index) => ({
			conference_id: draftId,
			name: fee.name,
			amount_cents: fee.amountCents,
			applies_to: fee.appliesTo,
			description: fee.description,
			position: existing.length + index
		}));

	await insertRows(supabase, 'fees', rows, 'fees');
	await updateDraft(supabase, draftId, {
		currency: from.currency,
		collects_payments_manually: from.collectsPaymentsManually,
		fee_status: 'paid'
	});

	return rows.length;
}

/** Save the Free / Paid / Decide later choice. */
export async function setFeeStatus(
	supabase: SupabaseClient,
	draftId: string,
	status: FeeStatus
): Promise<void> {
	await updateDraft(supabase, draftId, { fee_status: status });
}

/**
 * What saving a fee also decides: the conference charges, and collects either
 * through MUNMeet or outside it.
 */
export async function saveFeeCollection(
	supabase: SupabaseClient,
	draftId: string,
	collectsPaymentsManually: boolean
): Promise<void> {
	await updateDraft(supabase, draftId, {
		fee_status: 'paid',
		collects_payments_manually: collectsPaymentsManually
	});
}

/** Save the Applications dialog. */
export async function setApplicationSettings(
	supabase: SupabaseClient,
	draftId: string,
	settings: ApplicationSettings
): Promise<void> {
	await updateDraft(supabase, draftId, {
		application_open_mode: settings.applicationOpenMode,
		applications_open_at: settings.applicationsOpenAt,
		application_close_rule: settings.applicationCloseRule,
		application_close_offset_days: settings.applicationCloseOffsetDays,
		applications_close_at: settings.applicationsCloseAt,
		accepts_individual_applications: settings.acceptsIndividualApplications,
		accepts_delegations: settings.acceptsDelegations,
		committee_preference_count: settings.committeePreferenceCount,
		ask_motivation: settings.askMotivation,
		position_paper_required: settings.positionPaperRequired
	});
}
