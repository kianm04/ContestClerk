/**
 * A committee paper on the floor (`docs/committee-papers.md`, section 6, step
 * 6 of its build order), for the motion composer, the paper's reading page,
 * the live view and the projector.
 *
 * Introducing a paper is a motion, and passing it is `apply_passed_motion`
 * (`./motion-effects.ts`), which introduces the paper and puts it on the
 * projector at once. Everything here only reads, except "Show on screen",
 * "Take off screen", "Previous clause" and "Next clause", which change
 * `committee_state.displayed_paper_id` and `displayed_clause`: Row Level
 * Security lets the dais set the paper to null or to a paper of the
 * committee that has been introduced, and to nothing else.
 *
 * Files under `$lib/server` only ever run on the server.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PaperKind } from '$lib/committee-papers';
import {
	clauseContentFromMarkdown,
	type ClauseContent,
	type OperativeClause
} from '$lib/paper-clauses';
import {
	PREAMBLE_STOP,
	clauseCounts,
	clausePositionText,
	screenStep,
	shownClauseStop,
	steppedClauseStop,
	subClauseLabel,
	type ClauseDirection,
	type ScreenPage,
	type ScreenStep,
	type SubClauseForScreen
} from '$lib/paper-on-screen';
import {
	floorPaper,
	PAPER_SCREEN_MESSAGES,
	type FloorPaper,
	type PaperForScreen
} from '$lib/papers-on-floor';
import { resolutionBody, type HeadingCommittee } from '$lib/resolution-heading';
import { withOpeningPhraseMarked, withOpeningPhrasesMarked } from '$lib/resolution-reading';
import { hasClauses, paperTextFromColumns, type PaperTextColumns } from '$lib/resolution-text';
import { renderMarkdown } from './markdown';
import { readPaperVersions } from './paper-amendments';

/** The columns that name a paper, as `committee_papers` stores them. */
const NAME_COLUMNS = 'id, kind, title, topic_number, sequence';

/** The columns that hold a paper's text, which a kind uses some of (`$lib/resolution-text.ts`). */
const TEXT_COLUMNS = 'body_markdown, preamble_markdown, operative_markdown';

/** The code Postgres answers with for an id that is not a uuid at all, such as one typed into the address. */
const INVALID_ID_CODE = '22P02';

type PaperNameRow = {
	id: string;
	kind: PaperKind;
	title: string;
	topic_number: number | null;
	sequence: number | null;
};

/** What the projector reads of a paper: its name and its text. */
type PaperTextRow = PaperNameRow & PaperTextColumns;

/** The paper on a committee's projector and where in it the projector stands. */
type DisplayedState = { paperId: string | null; clause: number | null };

/** Where an introduced paper stands on the floor, for the line and the button on its page. */
export type PaperOnFloor = {
	/** When the committee introduced it, or null for a paper not yet introduced. */
	introducedAt: string | null;
	isOnScreen: boolean;
	/** Whether the reader runs the room, and so may put the paper on the projector or take it off. */
	mayShowOnScreen: boolean;
	/** Where the projector stands in the paper while it is on screen with clauses, else null. */
	screenStep: ScreenStep | null;
};

function namedPaper(row: PaperNameRow): FloorPaper {
	return floorPaper({
		id: row.id,
		kind: row.kind,
		title: row.title,
		topicNumber: row.topic_number,
		sequence: row.sequence
	});
}

/**
 * The committee's approved papers, which a motion to introduce a document
 * picks from, in their numbers' order: "Working paper 1.1", then 1.2, then
 * "Draft resolution 1.1". Row Level Security shows them to the dais, who
 * are the only ones who raise motions.
 */
export async function listApprovedPapers(
	supabase: SupabaseClient,
	committeeId: string
): Promise<FloorPaper[]> {
	const { data, error } = await supabase
		.from('committee_papers')
		.select(NAME_COLUMNS)
		.eq('committee_id', committeeId)
		.eq('status', 'approved')
		.order('topic_number', { ascending: true })
		// A kind sorts in the order the enum declares it, working papers first.
		.order('kind', { ascending: true })
		.order('sequence', { ascending: true })
		.overrideTypes<PaperNameRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the committee's approved papers: ${error.message}`);
	}

	return data.map(namedPaper);
}

/** The paper on the committee's projector, null when the dais has put none there, and its clause. */
async function readDisplayedState(
	supabase: SupabaseClient,
	committeeId: string
): Promise<DisplayedState> {
	const { data, error } = await supabase
		.from('committee_state')
		.select('displayed_paper_id, displayed_clause')
		.eq('committee_id', committeeId)
		.maybeSingle();

	if (error) {
		throw new Error(`Could not read the paper on the screen: ${error.message}`);
	}

	return { paperId: data?.displayed_paper_id ?? null, clause: data?.displayed_clause ?? null };
}

/**
 * A paper's clauses, read from its text, or null for a kind without clauses
 * or a text with none yet: those the projector shows whole. A draft
 * resolution keeps its two parts apart; a directive has the operative part alone.
 */
function clauseContentOf(paper: PaperTextRow): ClauseContent | null {
	if (!hasClauses(paper.kind)) return null;

	const content = clauseContentFromMarkdown(
		paper.preamble_markdown ?? '',
		paper.operative_markdown ?? ''
	);
	const isEmpty = content.preamble.length === 0 && content.operative.length === 0;

	return isEmpty ? null : content;
}

/**
 * A paper's clauses as they stand: an amendment written in or passed makes a
 * new version of the text and leaves the paper's Markdown as submitted, so
 * an amended paper's clauses come from its latest version. Null as for
 * `clauseContentOf`.
 */
async function readClausesNow(
	supabase: SupabaseClient,
	paper: PaperTextRow
): Promise<ClauseContent | null> {
	if (!hasClauses(paper.kind)) return null;

	const versions = await readPaperVersions(supabase, paper.id);
	const latest = versions.at(-1);

	return latest !== undefined && latest.versionNumber > 1 ? latest.content : clauseContentOf(paper);
}

/**
 * The paper on the committee's projector by name, for the live view's line,
 * or null. A paper the reader may not read (Row Level Security) is null too,
 * though the projector only ever shows one the whole committee may read.
 */
export async function readDisplayedPaper(
	supabase: SupabaseClient,
	committeeId: string
): Promise<FloorPaper | null> {
	const { paperId } = await readDisplayedState(supabase, committeeId);

	if (paperId === null) return null;

	const { data, error } = await supabase
		.from('committee_papers')
		.select(NAME_COLUMNS)
		.eq('id', paperId)
		.maybeSingle()
		.overrideTypes<PaperNameRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not read the paper on the screen: ${error.message}`);
	}

	return data === null ? null : namedPaper(data);
}

/** A clause's words as HTML, its opening phrase marked as its reading page marks it. */
function clauseHtml(markdown: string, part: 'preamble' | 'operative'): string {
	return renderMarkdown(withOpeningPhraseMarked(markdown, part));
}

/** An operative clause's sub-clauses, lettered (a), (b) and theirs (i), (ii). */
function subClausesForScreen(clauses: OperativeClause[], level: 2 | 3): SubClauseForScreen[] {
	return clauses.map((clause, index) => ({
		label: subClauseLabel(level, index + 1),
		html: clauseHtml(clause.markdown, 'operative'),
		subClauses: level === 2 ? subClausesForScreen(clause.children, 3) : []
	}));
}

/**
 * The part of the paper at this stop: the preamble under the line the
 * clauses hang from, "The General Assembly,", or one operative clause.
 */
function clausePage(content: ClauseContent, stop: number, committee: HeadingCommittee): ScreenPage {
	if (stop === PREAMBLE_STOP) {
		return {
			shows: 'preamble',
			opening: `The ${resolutionBody(committee)},`,
			clauses: content.preamble.map((clause) => clauseHtml(clause.markdown, 'preamble'))
		};
	}

	const clause = content.operative[stop - 1];

	return {
		shows: 'clause',
		number: stop,
		html: clauseHtml(clause.markdown, 'operative'),
		subClauses: subClausesForScreen(clause.children, 2)
	};
}

/** A paper's name and text, or null when Row Level Security hides it from the reader. */
async function readPaperText(
	supabase: SupabaseClient,
	paperId: string
): Promise<PaperTextRow | null> {
	const { data, error } = await supabase
		.from('committee_papers')
		.select(`${NAME_COLUMNS}, ${TEXT_COLUMNS}`)
		.eq('id', paperId)
		.maybeSingle()
		.overrideTypes<PaperTextRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not read the paper on the screen: ${error.message}`);
	}

	return data;
}

/**
 * The paper on the committee's projector, or null, with the part of it the
 * dais has on screen: one clause of a draft resolution or a directive, or
 * the whole text of any other paper. The text is drawn the way its reading
 * page draws it, opening phrases marked, so the room reads the same words
 * the delegates have open.
 */
export async function readPaperForScreen(
	supabase: SupabaseClient,
	committee: HeadingCommittee & { id: string }
): Promise<PaperForScreen | null> {
	const displayed = await readDisplayedState(supabase, committee.id);

	if (displayed.paperId === null) return null;

	const paper = await readPaperText(supabase, displayed.paperId);

	if (paper === null) return null;

	const content = await readClausesNow(supabase, paper);
	const stop = content === null ? null : shownClauseStop(clauseCounts(content), displayed.clause);

	if (content === null || stop === null) {
		const markdown = withOpeningPhrasesMarked(paper.kind, paperTextFromColumns(paper));

		return {
			...namedPaper(paper),
			position: null,
			page: { shows: 'text', html: renderMarkdown(markdown) }
		};
	}

	return {
		...namedPaper(paper),
		position: clausePositionText(clauseCounts(content), stop),
		page: clausePage(content, stop, committee)
	};
}

/**
 * Whether the reader may run this committee's room, which the page asks to
 * offer "Show on screen" and the screen actions ask again before they write
 * (`./paper-screen-actions.ts`).
 */
export async function mayRunRoom(supabase: SupabaseClient, committeeId: string): Promise<boolean> {
	const { data, error } = await supabase.rpc('has_committee_permission', {
		committee_id: committeeId,
		permission: 'run_room'
	});

	if (error) {
		throw new Error(`Could not check who runs the room: ${error.message}`);
	}

	return data === true;
}

/**
 * When a paper was introduced, null before, and its clauses, for where the
 * projector stands in it. Its page has already found the paper, so no row is no paper.
 */
async function readFloorPaper(
	supabase: SupabaseClient,
	paperId: string
): Promise<{ introducedAt: string | null; content: ClauseContent | null }> {
	const { data, error } = await supabase
		.from('committee_papers')
		.select(`${NAME_COLUMNS}, ${TEXT_COLUMNS}, introduced_at`)
		.eq('id', paperId)
		.maybeSingle()
		.overrideTypes<PaperTextRow & { introduced_at: string | null }, { merge: false }>();

	if (error?.code === INVALID_ID_CODE) return { introducedAt: null, content: null };

	if (error) {
		throw new Error(`Could not read when the paper was introduced: ${error.message}`);
	}

	return {
		introducedAt: data?.introduced_at ?? null,
		content: data === null ? null : await readClausesNow(supabase, data)
	};
}

/** Where one paper stands on the floor, for its reading page and the dais's review of it. */
export async function readPaperOnFloor(
	supabase: SupabaseClient,
	committeeId: string,
	paperId: string
): Promise<PaperOnFloor> {
	// None of these needs another's answer, so they run side by side.
	const [paper, displayed, mayShowOnScreen] = await Promise.all([
		readFloorPaper(supabase, paperId),
		readDisplayedState(supabase, committeeId),
		mayRunRoom(supabase, committeeId)
	]);
	const isOnScreen = displayed.paperId === paperId;

	return {
		introducedAt: paper.introducedAt,
		isOnScreen,
		mayShowOnScreen: mayShowOnScreen && paper.introducedAt !== null,
		screenStep:
			isOnScreen && paper.content !== null
				? screenStep(clauseCounts(paper.content), displayed.clause)
				: null
	};
}

/**
 * Put an introduced paper on the committee's projector, in place of whatever
 * paper was there. Answers null, or the sentence to refuse with: Row Level
 * Security answers a paper not yet introduced, or a reader not on the dais,
 * with no row changed rather than an error.
 */
export async function showPaperOnScreen(
	supabase: SupabaseClient,
	committeeId: string,
	paperId: string
): Promise<string | null> {
	const { data, error } = await supabase
		.from('committee_state')
		.update({ displayed_paper_id: paperId })
		.eq('committee_id', committeeId)
		.select('committee_id');

	if (error) {
		throw new Error(`Could not put the paper on the screen: ${error.message}`);
	}

	return data.length === 0 ? PAPER_SCREEN_MESSAGES.notIntroduced : null;
}

/**
 * Take a paper off the committee's projector, which goes back to the floor.
 * Only that paper: a press on a page left open after the dais showed
 * another changes nothing, and the projector keeps the other.
 */
export async function takePaperOffScreen(
	supabase: SupabaseClient,
	committeeId: string,
	paperId: string
): Promise<void> {
	const { error } = await supabase
		.from('committee_state')
		.update({ displayed_paper_id: null })
		.eq('committee_id', committeeId)
		.eq('displayed_paper_id', paperId);

	if (error) {
		throw new Error(`Could not take the paper off the screen: ${error.message}`);
	}
}

/**
 * "Previous clause" or "Next clause": the projector moves one clause through
 * the paper on it, and stays put at either end. Answers null, or the
 * sentence to refuse with: a press on a page left open after the dais put
 * another paper on screen changes nothing, and neither does one by a
 * reader not on the dais, whom Row Level Security answers with no row changed.
 */
export async function stepDisplayedClause(
	supabase: SupabaseClient,
	committeeId: string,
	paperId: string,
	direction: ClauseDirection
): Promise<string | null> {
	const [displayed, paper] = await Promise.all([
		readDisplayedState(supabase, committeeId),
		readPaperText(supabase, paperId)
	]);
	const content = paper === null ? null : await readClausesNow(supabase, paper);

	if (displayed.paperId !== paperId || content === null) return PAPER_SCREEN_MESSAGES.notOnScreen;

	const { data, error } = await supabase
		.from('committee_state')
		.update({
			displayed_clause: steppedClauseStop(clauseCounts(content), displayed.clause, direction)
		})
		.eq('committee_id', committeeId)
		.eq('displayed_paper_id', paperId)
		.select('committee_id');

	if (error) {
		throw new Error(`Could not move the screen to another clause: ${error.message}`);
	}

	return data.length === 0 ? PAPER_SCREEN_MESSAGES.notOnScreen : null;
}
