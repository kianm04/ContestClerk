/**
 * A delegation's position papers (T147): the list its "Position papers" view
 * draws, one fellow member's paper for the page where the rest of the
 * delegation edits its draft, and who a draft is shared with.
 *
 * Files under `$lib/server` only ever run on the server. Every function takes
 * the signed-in reader's Supabase client, so Row Level Security and the
 * `delegation_papers` function decide what they may see: a member of the
 * delegation sees its members' papers, and anybody else sees none
 * (`specs/02-architecture/permissions.md`).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DelegationPaper, PaperSharing } from '$lib/delegation-papers';
import type { ReviewStatus } from '$lib/documents';
import { getMyDelegationFor } from '$lib/server/delegations';

/** One row of `delegation_papers(target_delegation_id)`, under the database's own names. */
type DelegationPaperRow = {
	seat_id: string;
	seat_name: string;
	country_code: string | null;
	committee_id: string;
	committee_name: string;
	committee_slug: string;
	holder_id: string;
	holder_name: string | null;
	paper_kind: 'written' | 'uploaded' | null;
	review_status: ReviewStatus | null;
	review_comment: string | null;
	draft_updated_by: string | null;
	draft_updated_by_name: string | null;
	draft_updated_at: string | null;
	word_count: number;
};

/** What a member whose name cannot be read is called in the list. */
const UNNAMED_MEMBER = 'A member';

function toDelegationPaper(row: DelegationPaperRow): DelegationPaper {
	return {
		seatId: row.seat_id,
		seatName: row.seat_name,
		countryCode: row.country_code,
		committeeName: row.committee_name,
		committeeSlug: row.committee_slug,
		holderId: row.holder_id,
		holderName: row.holder_name ?? UNNAMED_MEMBER,
		paperKind: row.paper_kind,
		reviewStatus: row.review_status,
		reviewComment: row.review_comment,
		lastEditedById: row.draft_updated_by,
		lastEditedByName: row.draft_updated_by_name,
		lastEditedAt: row.draft_updated_at,
		wordCount: row.word_count
	};
}

/**
 * The paper of every seat held by a member of the delegation, ordered by the
 * member's name and then the committee. Empty for a reader who is not in it.
 */
export async function listDelegationPapers(
	supabase: SupabaseClient,
	delegationId: string
): Promise<DelegationPaper[]> {
	const { data, error } = await supabase.rpc('delegation_papers', {
		target_delegation_id: delegationId
	});

	if (error) {
		throw new Error(`Could not read the delegation's papers: ${error.message}`);
	}

	// The generated types call every column of a function's rows "not null",
	// which is not so here, so the rows are read under our own type instead.
	const rows = (data ?? []) as DelegationPaperRow[];

	return rows.map(toDelegationPaper);
}

/**
 * One seat's paper in the delegation's list, or `null` when no member of the
 * delegation sits in that seat any more: it changed hands, or the member left.
 */
export async function findDelegationPaper(
	supabase: SupabaseClient,
	delegationId: string,
	seatId: string
): Promise<DelegationPaper | null> {
	const papers = await listDelegationPapers(supabase, delegationId);

	return papers.find((paper) => paper.seatId === seatId) ?? null;
}

/** The topics of a committee, for the notes beside the editor. */
export async function readCommitteeTopics(
	supabase: SupabaseClient,
	committeeSlug: string,
	conferenceId: string
): Promise<string[]> {
	const { data, error } = await supabase
		.from('committees')
		.select('topics')
		.eq('conference_id', conferenceId)
		.eq('slug', committeeSlug)
		.maybeSingle()
		.overrideTypes<{ topics: string[] }, { merge: false }>();

	if (error) {
		throw new Error(`Could not read the committee's topics: ${error.message}`);
	}

	return data?.topics ?? [];
}

/**
 * Everybody in one delegation, heads and members, with their names, for the
 * "Shared with" line. A query for the names of its own, because
 * `delegation_members.user_id` points at `auth.users`, which PostgREST cannot
 * bring `profiles` along from.
 */
export async function readDelegationSharing(
	supabase: SupabaseClient,
	delegation: { id: string; name: string }
): Promise<PaperSharing> {
	const { data: memberRows, error } = await supabase
		.from('delegation_members')
		.select('user_id')
		.eq('delegation_id', delegation.id)
		.overrideTypes<{ user_id: string }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the members of the delegation: ${error.message}`);
	}

	const memberIds = (memberRows ?? []).map((row) => row.user_id);
	const members = await readMemberNames(supabase, memberIds);

	return { delegationName: delegation.name, members };
}

/** The names of these people, in alphabetical order. Nobody to ask about asks nothing. */
async function readMemberNames(
	supabase: SupabaseClient,
	userIds: string[]
): Promise<{ id: string; name: string }[]> {
	if (userIds.length === 0) return [];

	const { data, error } = await supabase
		.from('profiles')
		.select('id, full_name')
		.in('id', userIds)
		.order('full_name')
		.overrideTypes<{ id: string; full_name: string }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the names of the delegation members: ${error.message}`);
	}

	return (data ?? []).map((row) => ({ id: row.id, name: row.full_name }));
}

/**
 * Who a delegate's own draft is shared with: their delegation at this
 * conference, or `null` for a delegate who is in none and writes alone.
 */
export async function readPaperSharing(
	supabase: SupabaseClient,
	conferenceId: string,
	userId: string
): Promise<PaperSharing | null> {
	const delegation = await getMyDelegationFor(supabase, conferenceId, userId);

	if (!delegation) return null;

	return readDelegationSharing(supabase, delegation);
}
