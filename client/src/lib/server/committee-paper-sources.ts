/**
 * The working papers a draft resolution is based on (`docs/committee-papers.md`,
 * section 4): the introduced working papers a new draft may name, the ones a
 * draft names, and one of them as its writer shows it beside the draft. Their
 * text is shown, never copied.
 *
 * Row Level Security decides what the reader may read: a draft's sources are
 * read by whoever may read the draft, and an introduced working paper by every
 * delegate of its committee (`may_read_paper` in the migrations).
 *
 * Files under `$lib/server` only ever run on the server.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
	paperKindAndNumber,
	sourcePaperMetaLine,
	type PaperKind,
	type PaperSource,
	type SourcePaper
} from '$lib/committee-papers';
import { renderMarkdown } from '$lib/server/markdown';

/** The code Postgres answers with for an id that is not a uuid at all, such as one typed into the address. */
const INVALID_ID_CODE = '22P02';

/** The columns that name a paper, as `committee_papers` stores them. */
const SOURCE_COLUMNS = 'id, kind, topic_number, sequence, title';

/** A paper as `SOURCE_COLUMNS` reads it. */
type SourceRow = {
	id: string;
	kind: PaperKind;
	topic_number: number | null;
	sequence: number | null;
	title: string;
};

/** A row as the pages use it. */
function toPaperSource(row: SourceRow): PaperSource {
	return {
		id: row.id,
		kind: row.kind,
		topicNumber: row.topic_number,
		sequence: row.sequence,
		title: row.title
	};
}

/**
 * The committee's introduced working papers by number, "Working paper 1.1"
 * first: the ones a new draft resolution may be based on, which is what
 * `committee_paper_sources_check` allows.
 */
export async function listIntroducedWorkingPapers(
	supabase: SupabaseClient,
	committeeId: string
): Promise<PaperSource[]> {
	const { data, error } = await supabase
		.from('committee_papers')
		.select(SOURCE_COLUMNS)
		.eq('committee_id', committeeId)
		.eq('kind', 'working_paper')
		// `not … is null` keeps only the papers the committee has introduced.
		.not('introduced_at', 'is', null)
		.order('topic_number')
		.order('sequence')
		// Replaces Supabase's guess at the rows' shape with ours. It has to come last.
		.overrideTypes<SourceRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the committee's working papers: ${error.message}`);
	}

	return (data ?? []).map(toPaperSource);
}

/**
 * The working papers a draft resolution is based on, by number. A draft
 * based on none, and a paper of another kind, answer an empty list.
 */
export async function readPaperSources(
	supabase: SupabaseClient,
	paperId: string
): Promise<PaperSource[]> {
	const links = await supabase
		.from('committee_paper_sources')
		.select('source_paper_id')
		.eq('paper_id', paperId)
		.overrideTypes<{ source_paper_id: string }[], { merge: false }>();

	if (links.error) {
		throw new Error(`Could not read what the paper is based on: ${links.error.message}`);
	}

	const sourceIds = (links.data ?? []).map((link) => link.source_paper_id);

	if (sourceIds.length === 0) return [];

	const papers = await supabase
		.from('committee_papers')
		.select(SOURCE_COLUMNS)
		.in('id', sourceIds)
		.order('topic_number')
		.order('sequence')
		.overrideTypes<SourceRow[], { merge: false }>();

	if (papers.error) {
		throw new Error(`Could not read the working papers: ${papers.error.message}`);
	}

	return (papers.data ?? []).map(toPaperSource);
}

/** A working paper with its text and the day it was introduced. */
type SourcePaperRow = SourceRow & {
	body_markdown: string | null;
	introduced_at: string | null;
	lead_seat_id: string | null;
};

/** One of the working paper's authors, with its seat brought along. */
type SourceAuthorRow = { seat_id: string; seat: { name: string } | null };

/**
 * The names of the seats that wrote the working paper, the lead first and
 * then in the order they joined it, such as `['Austria', 'Costa Rica']`.
 */
function authorSeatNames(rows: SourceAuthorRow[], leadSeatId: string | null): string[] {
	// The lead first; `sort` keeps everybody else in the order they joined.
	const inOrder = [...rows].sort(
		(first, second) => Number(second.seat_id === leadSeatId) - Number(first.seat_id === leadSeatId)
	);

	return inOrder.flatMap((row) => (row.seat ? [row.seat.name] : []));
}

/**
 * One working paper the draft is based on, as the writer shows it beside the
 * draft, or `null` when it is not one of the draft's sources: an id from an
 * old link, one of another paper's, or no id at all. `timeZone` is the
 * conference's, the one the day it was introduced is named in.
 */
export async function readSourcePaper(
	supabase: SupabaseClient,
	paperId: string,
	sourceId: string,
	timeZone: string
): Promise<SourcePaper | null> {
	// The three reads do not wait on one another, so they go together.
	const [link, paper, authors] = await Promise.all([
		supabase
			.from('committee_paper_sources')
			.select('source_paper_id')
			.eq('paper_id', paperId)
			.eq('source_paper_id', sourceId)
			// `maybeSingle` answers one row, or `null` when there is none, instead of a list.
			.maybeSingle()
			.overrideTypes<{ source_paper_id: string }, { merge: false }>(),
		supabase
			.from('committee_papers')
			.select(`${SOURCE_COLUMNS}, body_markdown, introduced_at, lead_seat_id`)
			.eq('id', sourceId)
			.maybeSingle()
			.overrideTypes<SourcePaperRow, { merge: false }>(),
		supabase
			.from('committee_paper_seats')
			// `seat:seats(name)` brings each row's seat along under the name `seat`.
			.select('seat_id, seat:seats(name)')
			.eq('paper_id', sourceId)
			.eq('role', 'author')
			.order('added_at')
			.overrideTypes<SourceAuthorRow[], { merge: false }>()
	]);

	const firstError = link.error ?? paper.error ?? authors.error;

	if (firstError?.code === INVALID_ID_CODE) return null;

	if (firstError) {
		throw new Error(`Could not read the working paper: ${firstError.message}`);
	}

	if (!link.data || !paper.data) return null;

	return {
		id: paper.data.id,
		title: paper.data.title,
		kindAndNumber: paperKindAndNumber(toPaperSource(paper.data)),
		metaLine: sourcePaperMetaLine(
			authorSeatNames(authors.data ?? [], paper.data.lead_seat_id),
			paper.data.introduced_at,
			timeZone
		),
		bodyHtml: renderMarkdown(paper.data.body_markdown ?? '')
	};
}
