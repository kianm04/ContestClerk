/**
 * Voting on committee papers, and the record they leave
 * (`docs/committee-papers.md`, section 6, step 8 of its build order): what
 * the vote form lists, how a paper's vote went, the paper the room votes
 * on, and the committee's passed papers.
 *
 * Everything here only reads. Opening a vote with `paper_id` or
 * `amendment_id` is `openVote` in `./votes.ts`; the database checks the
 * paper or amendment (`check_vote_paper`) and settles it when the vote
 * closes (`settle_vote_paper`): a passed amendment is written in, a failed
 * one ends. Row Level Security decides what each reader sees:
 * a committee's delegates and the conference staff read its introduced
 * papers and its votes, and a visitor reads neither.
 *
 * Files under `$lib/server` only ever run on the server.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { hasPassed, type PaperKind, type PaperStatus } from '$lib/committee-papers';
import { floorPaper, type FloorPaper } from '$lib/papers-on-floor';
import {
	amendmentVoteSubjects,
	recordName,
	voteSubjects,
	type ApprovedAmendment,
	type PaperVote,
	type RoomPaperVote
} from '$lib/paper-votes';
import type { VoteSubject } from '$lib/votes';

/** The columns that name a paper, as `committee_papers` stores them. */
const NAME_COLUMNS = 'id, kind, status, title, topic_number, sequence';

/** The kinds a committee votes on as a whole: the papers with clauses it adopts. */
const VOTED_KINDS: PaperKind[] = ['draft_resolution', 'committee_directive'];

type PaperNameRow = {
	id: string;
	kind: PaperKind;
	status: PaperStatus;
	title: string;
	topic_number: number | null;
	sequence: number | null;
};

/** A paper's name and title, from its row. */
function namedPaper(row: PaperNameRow): FloorPaper {
	return floorPaper({
		id: row.id,
		kind: row.kind,
		title: row.title,
		topicNumber: row.topic_number,
		sequence: row.sequence
	});
}

/** The committee's introduced drafts and committee directives, by number. */
async function listIntroducedDrafts(
	supabase: SupabaseClient,
	committeeId: string
): Promise<FloorPaper[]> {
	const { data, error } = await supabase
		.from('committee_papers')
		.select(NAME_COLUMNS)
		.eq('committee_id', committeeId)
		.eq('status', 'introduced')
		.in('kind', VOTED_KINDS)
		.order('topic_number', { ascending: true })
		.order('kind', { ascending: true })
		.order('sequence', { ascending: true })
		.overrideTypes<PaperNameRow[], { merge: false }>();

	if (error) throw new Error(`Could not read the committee's introduced drafts: ${error.message}`);

	return data.map(namedPaper);
}

/**
 * Whether a motion to close debate has passed in this session, which starts
 * voting procedure on the drafts. It is read from the motion rather than the
 * room's mode, because "End voting" leaves the voting mode between drafts.
 */
async function hasDebateClosed(supabase: SupabaseClient, sessionId: string): Promise<boolean> {
	const { count, error } = await supabase
		.from('motions')
		.select('id', { count: 'exact', head: true })
		.eq('session_id', sessionId)
		.eq('kind', 'close_debate')
		.eq('status', 'passed');

	if (error) throw new Error(`Could not read the motions to close debate: ${error.message}`);

	return (count ?? 0) > 0;
}

type ApprovedAmendmentRow = {
	id: string;
	paper_id: string;
	sequence: number;
	parent_amendment_id: string | null;
};

/**
 * The amendments the dais approved that wait for their vote, on any of the
 * committee's drafts: the unfriendly ones, as an approved friendly one is
 * written in at once. `!inner` keeps only those whose draft is in this committee.
 */
async function listApprovedAmendments(
	supabase: SupabaseClient,
	committeeId: string
): Promise<ApprovedAmendment[]> {
	const { data, error } = await supabase
		.from('amendments')
		.select(
			'id, paper_id, sequence, parent_amendment_id, paper:committee_papers!inner(committee_id)'
		)
		.eq('paper.committee_id', committeeId)
		.eq('status', 'approved')
		.overrideTypes<ApprovedAmendmentRow[], { merge: false }>();

	if (error) throw new Error(`Could not read the approved amendments: ${error.message}`);

	return data.map((row) => ({
		id: row.id,
		paperId: row.paper_id,
		sequence: row.sequence,
		parentId: row.parent_amendment_id
	}));
}

/**
 * What the vote form lists, in the order the committee votes on it
 * (`voteSubjects` in `$lib/paper-votes.ts`): the approved amendments on the
 * introduced drafts, then the drafts once debate is closed.
 */
export async function listVoteSubjects(
	supabase: SupabaseClient,
	committeeId: string,
	sessionId: string
): Promise<VoteSubject[]> {
	const [drafts, isDebateClosed, approved] = await Promise.all([
		listIntroducedDrafts(supabase, committeeId),
		hasDebateClosed(supabase, sessionId),
		listApprovedAmendments(supabase, committeeId)
	]);
	const amendments = amendmentVoteSubjects(drafts, approved);

	return voteSubjects({ amendments, drafts, isDebateClosed });
}

type ClosedVoteRow = {
	passed: boolean;
	votes_for: number | null;
	votes_against: number | null;
	votes_abstain: number | null;
	closed_at: string;
};

/** How the vote on a paper went, from the closed vote tied to it, or null when there is none. */
export async function readPaperVote(
	supabase: SupabaseClient,
	paperId: string
): Promise<PaperVote | null> {
	const { data, error } = await supabase
		.from('votes')
		.select('passed, votes_for, votes_against, votes_abstain, closed_at')
		.eq('paper_id', paperId)
		.eq('status', 'closed')
		.not('passed', 'is', null)
		.order('closed_at', { ascending: false })
		.limit(1)
		.maybeSingle()
		.overrideTypes<ClosedVoteRow, { merge: false }>();

	if (error) throw new Error(`Could not read the paper's vote: ${error.message}`);
	if (data === null) return null;

	return {
		passed: data.passed,
		counts: {
			for: data.votes_for ?? 0,
			against: data.votes_against ?? 0,
			abstain: data.votes_abstain ?? 0
		},
		closedAt: data.closed_at
	};
}

type ClosedAmendmentVoteRow = ClosedVoteRow & { amendment_id: string };

/**
 * How the vote on each of a draft's amendments went, by the amendment's id,
 * for the record copy's "Amendments" table. A friendly amendment written in
 * has no vote, and so no entry.
 */
export async function readAmendmentVotes(
	supabase: SupabaseClient,
	amendmentIds: string[]
): Promise<Record<string, PaperVote>> {
	if (amendmentIds.length === 0) return {};

	const { data, error } = await supabase
		.from('votes')
		.select('amendment_id, passed, votes_for, votes_against, votes_abstain, closed_at')
		.in('amendment_id', amendmentIds)
		.eq('status', 'closed')
		.not('passed', 'is', null)
		.order('closed_at', { ascending: true })
		.overrideTypes<ClosedAmendmentVoteRow[], { merge: false }>();

	if (error) throw new Error(`Could not read the amendments' votes: ${error.message}`);

	// In the order they closed, so a later vote on the same amendment is the one kept.
	const votes: Record<string, PaperVote> = {};
	for (const row of data) {
		votes[row.amendment_id] = {
			passed: row.passed,
			counts: {
				for: row.votes_for ?? 0,
				against: row.votes_against ?? 0,
				abstain: row.votes_abstain ?? 0
			},
			closedAt: row.closed_at
		};
	}

	return votes;
}

/**
 * The paper the room votes on, or has just voted on until "End voting", for
 * the live view's line. Null while the room's vote, if any, is on no paper.
 */
export async function readRoomPaperVote(
	supabase: SupabaseClient,
	committeeId: string
): Promise<RoomPaperVote | null> {
	const { data: state, error: stateError } = await supabase
		.from('committee_state')
		.select('current_vote_id')
		.eq('committee_id', committeeId)
		.maybeSingle();

	if (stateError) throw new Error(`Could not read the room's vote: ${stateError.message}`);
	if (!state?.current_vote_id) return null;

	const { data: vote, error: voteError } = await supabase
		.from('votes')
		.select('status, paper:committee_papers(id, kind, status, title, topic_number, sequence)')
		.eq('id', state.current_vote_id)
		.maybeSingle()
		.overrideTypes<{ status: string; paper: PaperNameRow | null }, { merge: false }>();

	if (voteError) throw new Error(`Could not read the room's vote: ${voteError.message}`);
	if (!vote?.paper) return null;

	return { paper: namedPaper(vote.paper), isOpen: vote.status === 'open' };
}

/**
 * The committee's passed papers, by number, under what the record calls
 * them ("Resolution 1.1"), for the committee page. A committee directive the
 * crisis staff have since answered is still one the committee passed.
 */
export async function listPassedPapers(
	supabase: SupabaseClient,
	committeeId: string
): Promise<FloorPaper[]> {
	const { data, error } = await supabase
		.from('committee_papers')
		.select(NAME_COLUMNS)
		.eq('committee_id', committeeId)
		.in('kind', VOTED_KINDS)
		.in('status', ['passed', 'carried_out', 'refused'])
		.order('topic_number', { ascending: true })
		.order('kind', { ascending: true })
		.order('sequence', { ascending: true })
		.overrideTypes<PaperNameRow[], { merge: false }>();

	if (error) throw new Error(`Could not read the committee's resolutions: ${error.message}`);

	return data.filter(hasPassed).map((row) => ({
		...namedPaper(row),
		name: recordName({
			kind: row.kind,
			status: row.status,
			topicNumber: row.topic_number,
			sequence: row.sequence
		})
	}));
}

/**
 * When the committee decided the paper, which the record copy says it was
 * adopted on when there is no vote to date it by. Null for a paper never decided.
 */
export async function readPaperDecidedAt(
	supabase: SupabaseClient,
	paperId: string
): Promise<string | null> {
	const { data, error } = await supabase
		.from('committee_papers')
		.select('decided_at')
		.eq('id', paperId)
		.maybeSingle();

	if (error) throw new Error(`Could not read when the paper was decided: ${error.message}`);

	return data?.decided_at ?? null;
}
