/**
 * Reading a committee's papers (`docs/committee-papers.md`) for the pages
 * under `resolutions`: what the committee's settings allow, the reader's
 * seat, the papers in the list, and one paper with the seats on it.
 *
 * Row Level Security decides which papers the reader may read
 * (`may_read_paper` in the migrations), so a paper these reads do not find is
 * one the page answers with a 404. Writing a paper's text is in
 * `./committee-paper-writing.ts`, and changing who writes it in
 * `./committee-paper-authors.ts`.
 *
 * Files under `$lib/server` only ever run on the server.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	CommitteeFormat,
	CommitteePaper,
	PaperCommittee,
	PaperKind,
	PaperListItem,
	PaperPerson,
	PaperSeat,
	PaperSeatRole,
	PaperStatus,
	PaperWords
} from '$lib/committee-papers';
import type { Database } from '$lib/database.types';
import { paperTextFromColumns } from '$lib/resolution-text';

/** The code Postgres answers with for an id that is not a uuid at all, such as one typed into the address. */
const INVALID_ID_CODE = '22P02';

/** The committee's settings for papers, as `committees` stores them. */
type CommitteeSettingsRow = {
	format: CommitteeFormat;
	crisis_allows_resolutions: boolean;
	has_working_papers: boolean;
	paper_words: PaperWords;
	topics: string[];
};

/** What the committee's settings say about its papers, with the topic on its agenda. */
export async function readPaperCommittee(
	supabase: SupabaseClient,
	committeeId: string
): Promise<PaperCommittee> {
	const [settings, state] = await Promise.all([
		supabase
			.from('committees')
			.select('format, crisis_allows_resolutions, has_working_papers, paper_words, topics')
			.eq('id', committeeId)
			.single()
			// Replaces Supabase's guess at the row's shape with ours. It has to come last.
			.overrideTypes<CommitteeSettingsRow, { merge: false }>(),
		supabase
			.from('committee_state')
			.select('agenda_topic')
			.eq('committee_id', committeeId)
			// `maybeSingle` answers one row, or `null` when there is none, instead of a list.
			.maybeSingle()
			.overrideTypes<{ agenda_topic: string | null }, { merge: false }>()
	]);

	if (settings.error || !settings.data) {
		throw new Error(`Could not read the committee's settings: ${settings.error?.message}`);
	}

	if (state.error) {
		throw new Error(`Could not read the committee's agenda: ${state.error.message}`);
	}

	return {
		format: settings.data.format,
		crisisAllowsResolutions: settings.data.crisis_allows_resolutions,
		hasWorkingPapers: settings.data.has_working_papers,
		paperWords: settings.data.paper_words,
		topics: settings.data.topics,
		agendaTopic: state.data?.agenda_topic ?? null
	};
}

/**
 * The committee's format alone, for a page that only links to the papers and
 * so only needs their name: "Resolutions", or "Directives" in a crisis
 * committee (`papersPageTitle`).
 */
export async function readCommitteeFormat(
	supabase: SupabaseClient,
	committeeId: string
): Promise<CommitteeFormat> {
	const { data, error } = await supabase
		.from('committees')
		.select('format')
		.eq('id', committeeId)
		.single()
		.overrideTypes<{ format: CommitteeFormat }, { merge: false }>();

	if (error || !data) {
		throw new Error(`Could not read the committee's format: ${error?.message}`);
	}

	return data.format;
}

/** The reader's own seat in the committee, or `null` when they hold none, as staff do. */
export async function readMyPaperSeat(
	supabase: SupabaseClient,
	committeeId: string,
	userId: string
): Promise<PaperSeat | null> {
	const { data, error } = await supabase
		.from('seats')
		.select('id, name, kind')
		.eq('committee_id', committeeId)
		.eq('user_id', userId)
		.maybeSingle()
		.overrideTypes<
			{ id: string; name: string; kind: Database['public']['Enums']['seat_kind'] },
			{ merge: false }
		>();

	if (error) {
		throw new Error(`Could not read your seat: ${error.message}`);
	}

	if (!data) return null;

	return { id: data.id, name: data.name, isObserver: data.kind === 'observer' };
}

/** A paper as the list reads it. */
type PaperListRow = {
	id: string;
	kind: PaperKind;
	status: PaperStatus;
	title: string;
	topic: string | null;
	topic_number: number | null;
	sequence: number | null;
	is_open_for_signatures: boolean;
	updated_at: string;
};

/** Which of the papers the reader's seat is on, and as what. */
async function readMyPaperRoles(
	supabase: SupabaseClient,
	mySeatId: string | null
): Promise<Map<string, PaperSeatRole>> {
	if (mySeatId === null) return new Map();

	const { data, error } = await supabase
		.from('committee_paper_seats')
		.select('paper_id, role')
		.eq('seat_id', mySeatId)
		.overrideTypes<{ paper_id: string; role: PaperSeatRole }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the papers your seat is on: ${error.message}`);
	}

	return new Map((data ?? []).map((row) => [row.paper_id, row.role]));
}

/**
 * Every paper of the committee the reader may read, each saying what the
 * reader's seat is on it. `paperSections` in `$lib/committee-papers.ts` sorts
 * them into the list.
 */
export async function listCommitteePapers(
	supabase: SupabaseClient,
	committeeId: string,
	mySeatId: string | null
): Promise<PaperListItem[]> {
	const [papers, myRoles] = await Promise.all([
		supabase
			.from('committee_papers')
			.select(
				'id, kind, status, title, topic, topic_number, sequence, is_open_for_signatures, updated_at'
			)
			.eq('committee_id', committeeId)
			.overrideTypes<PaperListRow[], { merge: false }>(),
		readMyPaperRoles(supabase, mySeatId)
	]);

	if (papers.error) {
		throw new Error(`Could not read the committee's papers: ${papers.error.message}`);
	}

	return (papers.data ?? []).map((row) => ({
		id: row.id,
		kind: row.kind,
		status: row.status,
		title: row.title,
		topic: row.topic,
		topicNumber: row.topic_number,
		sequence: row.sequence,
		isOpenForSignatures: row.is_open_for_signatures,
		updatedAt: row.updated_at,
		myRole: myRoles.get(row.id) ?? null
	}));
}

/** A paper as its page reads it. */
type PaperRow = PaperListRow & {
	signatures_opened_at: string | null;
	submitted_at: string | null;
	lead_seat_id: string | null;
	body_markdown: string | null;
	preamble_markdown: string | null;
	operative_markdown: string | null;
	revision: number;
	updated_by: string | null;
};

/**
 * One paper of the committee, or `null` when there is none the reader may
 * read: a paper of another committee, one Row Level Security hides, or an id
 * that is not one at all.
 */
export async function readCommitteePaper(
	supabase: SupabaseClient,
	committeeId: string,
	paperId: string
): Promise<CommitteePaper | null> {
	const { data, error } = await supabase
		.from('committee_papers')
		.select(
			'id, kind, status, title, topic, topic_number, sequence, is_open_for_signatures, signatures_opened_at, updated_at, submitted_at, lead_seat_id, body_markdown, preamble_markdown, operative_markdown, revision, updated_by'
		)
		.eq('id', paperId)
		.eq('committee_id', committeeId)
		.maybeSingle()
		.overrideTypes<PaperRow, { merge: false }>();

	if (error?.code === INVALID_ID_CODE) return null;

	if (error) {
		throw new Error(`Could not read the paper: ${error.message}`);
	}

	if (!data) return null;

	return {
		id: data.id,
		kind: data.kind,
		status: data.status,
		title: data.title,
		topic: data.topic,
		topicNumber: data.topic_number,
		sequence: data.sequence,
		isOpenForSignatures: data.is_open_for_signatures,
		signaturesOpenedAt: data.signatures_opened_at,
		submittedAt: data.submitted_at,
		leadSeatId: data.lead_seat_id,
		body: paperTextFromColumns(data),
		revision: data.revision,
		updatedAt: data.updated_at,
		updatedById: data.updated_by
	};
}

/** A seat on a paper, with the seat itself brought along. */
type PaperSeatRow = {
	seat_id: string;
	role: PaperSeatRole;
	seat: { name: string; country_code: string | null; user_id: string | null } | null;
};

/** The names of the people in these seats, by their user id. */
async function readHolderNames(
	supabase: SupabaseClient,
	userIds: string[]
): Promise<Map<string, string>> {
	if (userIds.length === 0) return new Map();

	const { data, error } = await supabase
		.from('profiles')
		.select('id, full_name')
		.in('id', userIds)
		.overrideTypes<{ id: string; full_name: string }[], { merge: false }>();

	// Anybody signed in may read every profile, so a failure is a fault, not a rule.
	if (error) {
		throw new Error(`Could not read the delegates' names: ${error.message}`);
	}

	return new Map((data ?? []).map((row) => [row.id, row.full_name]));
}

/**
 * The seats on a paper, the lead first and then in the order they were
 * added, with who sits in each now. A seat that changes hands keeps its
 * papers, so the person is read through the seat rather than stored.
 */
export async function readPaperPeople(
	supabase: SupabaseClient,
	paper: Pick<CommitteePaper, 'id' | 'leadSeatId'>,
	mySeatId: string | null
): Promise<PaperPerson[]> {
	const { data, error } = await supabase
		.from('committee_paper_seats')
		// `seat:seats(…)` brings each row's seat along under the name `seat`.
		.select('seat_id, role, seat:seats(name, country_code, user_id)')
		.eq('paper_id', paper.id)
		.order('added_at')
		.overrideTypes<PaperSeatRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read who writes the paper: ${error.message}`);
	}

	const rows = data ?? [];
	const holderIds = rows.flatMap((row) => (row.seat?.user_id ? [row.seat.user_id] : []));
	const names = await readHolderNames(supabase, holderIds);

	const people = rows.map((row) => ({
		seatId: row.seat_id,
		// Whoever may read a paper may read its committee's seats, so the name is always there.
		seatName: row.seat?.name ?? '',
		countryCode: row.seat?.country_code ?? null,
		holderId: row.seat?.user_id ?? null,
		holderName: row.seat?.user_id ? (names.get(row.seat.user_id) ?? null) : null,
		role: row.role,
		isLead: row.seat_id === paper.leadSeatId,
		isMine: row.seat_id === mySeatId
	}));

	// The lead first; `sort` keeps everybody else in the order they were added.
	return people.sort((first, second) => Number(second.isLead) - Number(first.isLead));
}

/**
 * Whether the reader may write the paper now: it is being written and their
 * seat is one of its authors. The database's own helper, so the page and the
 * policies always agree.
 */
export async function mayWritePaper(supabase: SupabaseClient, paperId: string): Promise<boolean> {
	const { data, error } = await supabase.rpc('may_write_paper', { paper_id: paperId });

	if (error) {
		throw new Error(`Could not check who may write the paper: ${error.message}`);
	}

	return data === true;
}
