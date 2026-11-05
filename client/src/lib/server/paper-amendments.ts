/**
 * Reading and making amendments to an introduced draft resolution
 * (`docs/committee-papers.md`, step 7).
 *
 * Every change is one of the database's own functions, which decide who may
 * do what and raise the notifications: `propose_amendment`,
 * `answer_amendment`, `make_amendment_unfriendly`, `sign_amendment`,
 * `withdraw_amendment`, and for the dais `decide_amendment` and
 * `reorder_amendments`. A refused change answers with the function's own
 * sentence, such as "The proposer's support is counted already.", which the
 * page shows as it is. Row Level Security shows the amendments, their seats
 * and the draft's versions to whoever may read the draft.
 *
 * Files under `$lib/server` only ever run on the server.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { QueuedAmendment } from '$lib/amendment-queue';
import type { SupportUnit } from '$lib/paper-support';
import type {
	AmendmentProposal,
	AmendmentRules,
	AmendmentStatus,
	PaperAmendment
} from '$lib/paper-amendments';
import type { AmendmentAction, ClauseContent, ClausePart } from '$lib/paper-clauses';

/** The codes the amendment functions refuse with, as in `./chair-resolutions.ts`. */
const REFUSAL_CODES = new Set(['42501', '22023', 'P0002']);

/** What a change came to: `refusal` is `null` once it is done, or the sentence that says why not. */
export type AmendmentChange = { refusal: string | null };

/** The change, or the sentence it was refused with. Throws on a fault. */
function toChange(
	error: { code: string; message: string } | null,
	failure: string
): AmendmentChange {
	if (error === null) return { refusal: null };

	if (REFUSAL_CODES.has(error.code)) return { refusal: error.message };

	throw new Error(`${failure}: ${error.message}`);
}

type AmendmentRulesRow = {
	has_friendly_amendments: boolean;
	preamble_amendable: boolean;
	has_second_degree_amendments: boolean;
	amendment_support_minimum: number;
	amendment_support_unit: SupportUnit;
};

/**
 * The committee's settings for amendments, read when they matter, and the
 * support an unfriendly one needs, from `paper_support_needed`, the same
 * function `sign_amendment` counts with.
 */
export async function readAmendmentRules(
	supabase: SupabaseClient,
	committeeId: string
): Promise<AmendmentRules> {
	const settings = await supabase
		.from('committees')
		.select(
			'has_friendly_amendments, preamble_amendable, has_second_degree_amendments, amendment_support_minimum, amendment_support_unit'
		)
		.eq('id', committeeId)
		.single()
		.overrideTypes<AmendmentRulesRow, { merge: false }>();

	if (settings.error || !settings.data) {
		throw new Error(
			`Could not read the committee's amendment settings: ${settings.error?.message}`
		);
	}

	const needed = await supabase.rpc('paper_support_needed', {
		committee_id: committeeId,
		minimum: settings.data.amendment_support_minimum,
		unit: settings.data.amendment_support_unit
	});

	if (needed.error) {
		throw new Error(`Could not work out the support an amendment needs: ${needed.error.message}`);
	}

	return {
		hasFriendlyAmendments: settings.data.has_friendly_amendments,
		isPreambleAmendable: settings.data.preamble_amendable,
		hasSecondDegreeAmendments: settings.data.has_second_degree_amendments,
		supportNeeded: Number(needed.data ?? 0)
	};
}

/** One version of a draft's text: version 1 as submitted, and one more for every amendment made. */
export type PaperVersion = { id: string; versionNumber: number; content: ClauseContent };

/** A version's content as stored, or empty clauses for one that holds none. */
function asClauseContent(content: unknown): ClauseContent {
	const stored = content as Partial<ClauseContent> | null;

	return {
		preamble: Array.isArray(stored?.preamble) ? stored.preamble : [],
		operative: Array.isArray(stored?.operative) ? stored.operative : []
	};
}

/** Every version of the draft, the first first. The last is the text as it stands. */
export async function readPaperVersions(
	supabase: SupabaseClient,
	paperId: string
): Promise<PaperVersion[]> {
	const { data, error } = await supabase
		.from('committee_paper_versions')
		.select('id, version_number, content')
		.eq('paper_id', paperId)
		.order('version_number', { ascending: true })
		.overrideTypes<{ id: string; version_number: number; content: unknown }[], { merge: false }>();

	if (error) throw new Error(`Could not read the draft's versions: ${error.message}`);

	return (data ?? []).map((version) => ({
		id: version.id,
		versionNumber: version.version_number,
		content: asClauseContent(version.content)
	}));
}

/**
 * The columns every read of an amendment selects, with its proposer and its
 * seats. An amendment reaches `seats` twice, through its proposer and through
 * `amendment_seats`, so the proposer names its foreign key.
 */
const AMENDMENT_COLUMNS =
	'id, paper_id, sequence, proposed_by_seat_id, action, target_part, target_clause_id, text_markdown, parent_amendment_id, status, is_friendly, queue_position, ruling, based_on_version_id, created_at, decided_at, proposer:seats!amendments_proposed_by_seat_id_fkey(name), amendment_seats(seat_id, role, accepts, seat:seats(name))';

type AmendmentRow = {
	id: string;
	paper_id: string;
	sequence: number;
	proposed_by_seat_id: string | null;
	action: AmendmentAction;
	target_part: string;
	target_clause_id: string | null;
	text_markdown: string | null;
	parent_amendment_id: string | null;
	status: AmendmentStatus;
	is_friendly: boolean;
	queue_position: number | null;
	ruling: string | null;
	based_on_version_id: string | null;
	created_at: string;
	decided_at: string | null;
	proposer: { name: string } | null;
	amendment_seats: {
		seat_id: string;
		role: 'sponsor_answer' | 'signatory';
		accepts: boolean | null;
		seat: { name: string } | null;
	}[];
};

/** A row as the pages read it. */
function toAmendment(row: AmendmentRow): PaperAmendment {
	const part: ClausePart = row.target_part === 'preamble' ? 'preamble' : 'operative';

	return {
		id: row.id,
		sequence: row.sequence,
		proposedBySeatId: row.proposed_by_seat_id,
		proposerName: row.proposer?.name ?? null,
		action: row.action,
		targetPart: part,
		targetClauseId: row.target_clause_id,
		textMarkdown: row.text_markdown,
		parentAmendmentId: row.parent_amendment_id,
		status: row.status,
		isFriendly: row.is_friendly,
		queuePosition: row.queue_position,
		ruling: row.ruling,
		basedOnVersionId: row.based_on_version_id,
		createdAt: row.created_at,
		decidedAt: row.decided_at,
		sponsorAnswers: row.amendment_seats
			.filter((seat) => seat.role === 'sponsor_answer')
			.map((seat) => ({
				seatId: seat.seat_id,
				seatName: seat.seat?.name ?? '',
				accepts: seat.accepts
			}))
			.sort((first, second) => first.seatName.localeCompare(second.seatName)),
		supporterSeatIds: row.amendment_seats
			.filter((seat) => seat.role === 'signatory')
			.map((seat) => seat.seat_id)
	};
}

/** Every amendment to one draft, by number. */
export async function readPaperAmendments(
	supabase: SupabaseClient,
	paperId: string
): Promise<PaperAmendment[]> {
	const { data, error } = await supabase
		.from('amendments')
		.select(AMENDMENT_COLUMNS)
		.eq('paper_id', paperId)
		.order('sequence', { ascending: true })
		.overrideTypes<AmendmentRow[], { merge: false }>();

	if (error) throw new Error(`Could not read the draft's amendments: ${error.message}`);

	return (data ?? []).map(toAmendment);
}

type QueuedAmendmentRow = AmendmentRow & {
	paper: {
		id: string;
		title: string;
		topic_number: number | null;
		sequence: number | null;
		committee_id: string;
	};
};

/**
 * The amendments of the committee's introduced drafts that wait for the dais
 * or for their vote: what the *Amendments* section of `chair/resolutions`
 * lists. `!inner` keeps only the amendments whose draft is in this committee.
 */
export async function readCommitteeAmendments(
	supabase: SupabaseClient,
	committeeId: string
): Promise<QueuedAmendment[]> {
	const { data, error } = await supabase
		.from('amendments')
		.select(
			`${AMENDMENT_COLUMNS}, paper:committee_papers!inner(id, title, topic_number, sequence, committee_id)`
		)
		.eq('paper.committee_id', committeeId)
		.in('status', ['with_the_dais', 'approved'])
		.overrideTypes<QueuedAmendmentRow[], { merge: false }>();

	if (error) throw new Error(`Could not read the committee's amendments: ${error.message}`);

	return (data ?? []).map((row) => ({
		...toAmendment(row),
		paper: {
			id: row.paper.id,
			title: row.paper.title,
			topicNumber: row.paper.topic_number,
			sequence: row.paper.sequence
		}
	}));
}

/** An amendment a sponsor's seat has still to answer, for the live view's quiet line. */
export type AmendmentToAnswer = {
	sequence: number;
	paper: { id: string; topicNumber: number | null; sequence: number | null };
};

type AmendmentToAnswerRow = {
	amendment: {
		sequence: number;
		status: AmendmentStatus;
		paper: {
			id: string;
			topic_number: number | null;
			sequence: number | null;
			committee_id: string;
		};
	};
};

/** The amendments waiting for this seat's answer as a sponsor, across the committee's drafts. */
export async function readAmendmentsToAnswer(
	supabase: SupabaseClient,
	committeeId: string,
	seatId: string
): Promise<AmendmentToAnswer[]> {
	const { data, error } = await supabase
		.from('amendment_seats')
		.select(
			'amendment:amendments!inner(sequence, status, paper:committee_papers!inner(id, topic_number, sequence, committee_id))'
		)
		.eq('seat_id', seatId)
		.eq('role', 'sponsor_answer')
		.is('accepts', null)
		.eq('amendment.status', 'awaiting_sponsors')
		.eq('amendment.paper.committee_id', committeeId)
		.overrideTypes<AmendmentToAnswerRow[], { merge: false }>();

	if (error) throw new Error(`Could not read the amendments to answer: ${error.message}`);

	return (data ?? [])
		.map((row) => ({
			sequence: row.amendment.sequence,
			paper: {
				id: row.amendment.paper.id,
				topicNumber: row.amendment.paper.topic_number,
				sequence: row.amendment.paper.sequence
			}
		}))
		.sort((first, second) => first.sequence - second.sequence);
}

/** "Propose amendment": the new amendment's id, or the sentence it was refused with. */
export async function proposeAmendment(
	supabase: SupabaseClient,
	paperId: string,
	proposal: AmendmentProposal,
	parentAmendmentId: string | null
): Promise<AmendmentChange & { amendmentId: string | null }> {
	const { data, error } = await supabase.rpc('propose_amendment', {
		paper_id: paperId,
		action: proposal.action,
		target_part: proposal.targetPart,
		target_clause_id: proposal.targetClauseId,
		text_markdown: proposal.textMarkdown,
		parent_amendment_id: parentAmendmentId
	});
	const change = toChange(error, 'Could not propose the amendment');

	return { ...change, amendmentId: change.refusal === null ? (data as string) : null };
}

/** A sponsor's "Accept as friendly" or "Decline". */
export async function answerAmendment(
	supabase: SupabaseClient,
	amendmentId: string,
	accepts: boolean
): Promise<AmendmentChange> {
	const { error } = await supabase.rpc('answer_amendment', { amendment_id: amendmentId, accepts });

	return toChange(error, 'Could not answer the amendment');
}

/** The proposer's "Collect support instead", without waiting for the sponsors. */
export async function makeAmendmentUnfriendly(
	supabase: SupabaseClient,
	amendmentId: string
): Promise<AmendmentChange> {
	const { error } = await supabase.rpc('make_amendment_unfriendly', { amendment_id: amendmentId });

	return toChange(error, 'Could not make the amendment unfriendly');
}

/** Another seat's "Support", counted towards what an unfriendly amendment needs. */
export async function supportAmendment(
	supabase: SupabaseClient,
	amendmentId: string
): Promise<AmendmentChange> {
	const { error } = await supabase.rpc('sign_amendment', { amendment_id: amendmentId });

	return toChange(error, 'Could not support the amendment');
}

/** The proposer's "Withdraw", which lapses any amendment to it. */
export async function withdrawAmendment(
	supabase: SupabaseClient,
	amendmentId: string
): Promise<AmendmentChange> {
	const { error } = await supabase.rpc('withdraw_amendment', { amendment_id: amendmentId });

	return toChange(error, 'Could not withdraw the amendment');
}

/** The dais's "Approve", or "Rule out of order" with its reason. */
export async function decideAmendment(
	supabase: SupabaseClient,
	amendmentId: string,
	decision: { kind: 'approve' } | { kind: 'out_of_order'; ruling: string }
): Promise<AmendmentChange> {
	const { error } = await supabase.rpc('decide_amendment', {
		amendment_id: amendmentId,
		decision: decision.kind,
		ruling: decision.kind === 'out_of_order' ? decision.ruling : null
	});

	return toChange(error, 'Could not decide the amendment');
}

/** The dais's queue in a new order, every waiting amendment's id in the order it is taken. */
export async function reorderAmendments(
	supabase: SupabaseClient,
	committeeId: string,
	amendmentIds: string[]
): Promise<AmendmentChange> {
	const { error } = await supabase.rpc('reorder_amendments', {
		committee_id: committeeId,
		amendment_ids: amendmentIds
	});

	return toChange(error, 'Could not reorder the amendments');
}
