/**
 * Position papers as the organiser sees them: how far each committee has got,
 * the papers of one committee seat by seat, and approving a paper or sending it
 * back with a comment.
 *
 * Files under `$lib/server` only ever run on the server. Every function takes
 * the signed-in organiser's Supabase client, so Row Level Security and the
 * `protect_documents_columns` trigger decide what is read and what may change;
 * migration 0017 is what lets an organiser write a review at all. The chair
 * papers page (T46) reads the same seat list and reviews through
 * `reviewCommitteePaper` and `approveSubmittedPapers`, which keep a chair to
 * the papers of their own committee.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { committeeHeading } from '$lib/committees';
import { paperStatus, type ReviewStatus } from '$lib/documents';
import { countPaperStatuses, type PaperCommitteeRow, type PaperSeatRow } from '$lib/documents-page';
import { createDownloadLinks } from '$lib/server/document-storage';

/** One committee as the overview reads it. */
type CommitteeRow = {
	id: string;
	slug: string;
	name: string;
	abbreviation: string | null;
};

/** One filled seat, as the overview counts it. */
type FilledSeatRow = {
	id: string;
	committee_id: string;
};

/** One position paper, as the overview counts it. */
type PaperStatusRow = {
	seat_id: string;
	review_status: ReviewStatus | null;
};

/**
 * Every committee of one conference in the organiser's own order, each with
 * its filled seats counted by the state of their paper.
 *
 * A seat is counted once whatever happened to its paper, and a seat with no
 * paper counts as missing, so the four counts always add up to the filled
 * seats, which is what the page's acceptance criterion asks.
 */
export async function positionPaperOverview(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<PaperCommitteeRow[]> {
	const { data: committeeData, error: committeeError } = await supabase
		.from('committees')
		.select('id, slug, name, abbreviation')
		.eq('conference_id', conferenceId)
		.order('position', { ascending: true })
		.order('id', { ascending: true })
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<CommitteeRow[], { merge: false }>();

	if (committeeError) {
		throw new Error(`Could not list the committees: ${committeeError.message}`);
	}

	const committees: CommitteeRow[] = committeeData ?? [];

	if (committees.length === 0) {
		return [];
	}

	const committeeIds = committees.map((committee) => committee.id);

	// Neither needs the other's answer, so both start at once.
	const [seatsResult, papersResult] = await Promise.all([
		supabase
			.from('seats')
			.select('id, committee_id')
			.in('committee_id', committeeIds)
			.not('user_id', 'is', null)
			.overrideTypes<FilledSeatRow[], { merge: false }>(),
		supabase
			.from('documents')
			.select('seat_id, review_status')
			.eq('conference_id', conferenceId)
			.eq('kind', 'position_paper')
			.overrideTypes<PaperStatusRow[], { merge: false }>()
	]);

	if (seatsResult.error) {
		throw new Error(`Could not count the seats: ${seatsResult.error.message}`);
	}

	if (papersResult.error) {
		throw new Error(`Could not count the position papers: ${papersResult.error.message}`);
	}

	const reviewBySeat = new Map<string, ReviewStatus | null>();

	for (const paper of papersResult.data ?? []) {
		reviewBySeat.set(paper.seat_id, paper.review_status);
	}

	const filledSeats: FilledSeatRow[] = seatsResult.data ?? [];

	return committees.map((committee) => {
		const seatsOfCommittee = filledSeats.filter((seat) => seat.committee_id === committee.id);
		const statuses = seatsOfCommittee.map((seat) => paperStatus(reviewBySeat.get(seat.id) ?? null));

		return {
			committeeId: committee.id,
			committeeSlug: committee.slug,
			committeeHeading: committeeHeading(committee),
			filledSeatCount: seatsOfCommittee.length,
			counts: countPaperStatuses(statuses)
		};
	});
}

/** One filled seat of the chosen committee, as `listPaperSeats` reads it. */
type SeatRow = {
	id: string;
	name: string;
	country_code: string | null;
	user_id: string;
};

/** One delegate's name and picture. */
type ProfileRow = {
	id: string;
	full_name: string;
	avatar_path: string | null;
};

/**
 * One position paper of the chosen committee: an uploaded file, or a paper
 * written on MUNMeet (T145), which has no `storage_path`. Its text is not read
 * here; the reading page asks for one paper's text with `readWrittenPaperBody`.
 */
type PaperRow = {
	id: string;
	seat_id: string;
	file_name: string | null;
	review_status: ReviewStatus | null;
	review_comment: string | null;
	reviewed_at: string | null;
	updated_at: string;
	storage_path: string | null;
};

/** The code Postgres answers with when an id is not a valid uuid at all. */
const INVALID_ID_CODE = '22P02';

/**
 * The filled seats of one committee in the organiser's order, each with its
 * delegate and its paper, and a one-minute link to every paper there is.
 *
 * The caller checks that the committee is one of this conference's; the
 * papers are read by conference as well, so a committee from elsewhere could
 * at worst show seats without papers.
 */
export async function listPaperSeats(
	supabase: SupabaseClient,
	conferenceId: string,
	committeeId: string
): Promise<PaperSeatRow[]> {
	const [seatsResult, papersResult] = await Promise.all([
		supabase
			.from('seats')
			.select('id, name, country_code, user_id')
			.eq('committee_id', committeeId)
			.not('user_id', 'is', null)
			.order('position', { ascending: true })
			.order('id', { ascending: true })
			.overrideTypes<SeatRow[], { merge: false }>(),
		supabase
			.from('documents')
			.select(
				'id, seat_id, file_name, review_status, review_comment, reviewed_at, updated_at, storage_path'
			)
			.eq('conference_id', conferenceId)
			.eq('committee_id', committeeId)
			.eq('kind', 'position_paper')
			.overrideTypes<PaperRow[], { merge: false }>()
	]);

	if (seatsResult.error) {
		throw new Error(`Could not list the seats: ${seatsResult.error.message}`);
	}

	if (papersResult.error) {
		throw new Error(`Could not list the position papers: ${papersResult.error.message}`);
	}

	const seats: SeatRow[] = seatsResult.data ?? [];
	const papers: PaperRow[] = papersResult.data ?? [];

	if (seats.length === 0) {
		return [];
	}

	const delegateIds = seats.map((seat) => seat.user_id);
	// A written paper has no file, so there is no link to make for it.
	const storagePaths: string[] = [];

	for (const paper of papers) {
		if (paper.storage_path) storagePaths.push(paper.storage_path);
	}

	const [profilesResult, downloadLinks] = await Promise.all([
		supabase
			.from('profiles')
			.select('id, full_name, avatar_path')
			.in('id', delegateIds)
			.overrideTypes<ProfileRow[], { merge: false }>(),
		createDownloadLinks(supabase, storagePaths)
	]);

	const profilesById = new Map<string, ProfileRow>();

	for (const profile of profilesResult.data ?? []) {
		profilesById.set(profile.id, profile);
	}

	const papersBySeat = new Map<string, PaperRow>();

	for (const paper of papers) {
		papersBySeat.set(paper.seat_id, paper);
	}

	return seats.map((seat) => {
		const profile = profilesById.get(seat.user_id);
		const paper = papersBySeat.get(seat.id);

		return {
			seatId: seat.id,
			seatName: seat.name,
			countryCode: seat.country_code,
			delegateName: profile?.full_name ?? null,
			delegateAvatarPath: profile?.avatar_path ?? null,
			status: paperStatus(paper?.review_status ?? null),
			paper: paper ? toSeatPaper(paper, downloadLinks) : null
		};
	});
}

/** A paper row as the seat list shows it. */
function toSeatPaper(paper: PaperRow, downloadLinks: Map<string, string>): PaperSeatRow['paper'] {
	return {
		id: paper.id,
		fileName: paper.file_name,
		// Every paper is written with a status; `submitted` is the safe reading of a missing one.
		reviewStatus: paper.review_status ?? 'submitted',
		reviewComment: paper.review_comment,
		reviewedAt: paper.reviewed_at,
		updatedAt: paper.updated_at,
		downloadUrl: paper.storage_path ? (downloadLinks.get(paper.storage_path) ?? null) : null,
		// `documents_file_or_body` gives every paper a file or a text, never both,
		// so a paper without a file is one written on MUNMeet.
		isWritten: paper.storage_path === null
	};
}

/**
 * The Markdown of one paper written on MUNMeet, for the reading page (T146).
 * `null` when there is no such paper in this committee, or it is an uploaded
 * file. The caller found the paper through `listPaperSeats`; asking by
 * committee as well keeps a paper id from elsewhere from being read here.
 */
export async function readWrittenPaperBody(
	supabase: SupabaseClient,
	committeeId: string,
	documentId: string
): Promise<string | null> {
	const { data, error } = await supabase
		.from('documents')
		.select('body_markdown')
		.eq('id', documentId)
		.eq('committee_id', committeeId)
		.eq('kind', 'position_paper')
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<{ body_markdown: string | null }[], { merge: false }>();

	if (error?.code === INVALID_ID_CODE) return null;

	if (error) {
		throw new Error(`Could not read the position paper: ${error.message}`);
	}

	return data?.[0]?.body_markdown ?? null;
}

/** What a reviewer decided about one paper. */
export type PaperReview = {
	status: 'approved' | 'changes_requested';
	/** What the delegate should change. `null` for an approval. */
	comment: string | null;
};

/** Which papers a review may touch: those of one conference, or of one committee. */
type ReviewScope = { column: 'conference_id' | 'committee_id'; id: string };

/**
 * Write one review, on a position paper inside `scope`. `false` means no such
 * paper there, an id that is not an id at all, or a refusal by the database.
 */
async function saveReview(
	supabase: SupabaseClient,
	scope: ReviewScope,
	documentId: string,
	review: PaperReview,
	reviewerId: string
): Promise<boolean> {
	const { data, error } = await supabase
		.from('documents')
		.update({
			review_status: review.status,
			review_comment: review.comment,
			reviewed_by: reviewerId,
			reviewed_at: new Date().toISOString()
		})
		.eq('id', documentId)
		.eq(scope.column, scope.id)
		.eq('kind', 'position_paper')
		// A refused update comes back with no error and no rows, so asking for
		// the ids of what changed is what tells "done" from "refused".
		.select('id')
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<{ id: string }[], { merge: false }>();

	if (error?.code === INVALID_ID_CODE) return false;

	if (error) {
		throw new Error(`Could not save the review: ${error.message}`);
	}

	return (data ?? []).length > 0;
}

/**
 * Approve one paper of this conference, or send it back with a comment.
 *
 * `false` means there is no such paper here, or the database refused. The
 * `notify_document_reviewed` trigger tells the delegate; nothing here has to.
 */
export async function reviewPositionPaper(
	supabase: SupabaseClient,
	conferenceId: string,
	documentId: string,
	review: PaperReview,
	reviewerId: string
): Promise<boolean> {
	const scope: ReviewScope = { column: 'conference_id', id: conferenceId };

	return saveReview(supabase, scope, documentId, review, reviewerId);
}

/**
 * The chair's review of one paper: the same as `reviewPositionPaper`, but the
 * paper has to be one of this committee's. An organiser is a chair of every
 * committee of their conference, so without this a paper id from another
 * committee would be reviewed from the wrong page.
 */
export async function reviewCommitteePaper(
	supabase: SupabaseClient,
	committeeId: string,
	documentId: string,
	review: PaperReview,
	reviewerId: string
): Promise<boolean> {
	const scope: ReviewScope = { column: 'committee_id', id: committeeId };

	return saveReview(supabase, scope, documentId, review, reviewerId);
}

/**
 * Approve every paper of one committee that is waiting for a review, without
 * a comment, and say how many changed. Papers already approved or sent back
 * are left alone, which is what "Approve all awaiting review" promises.
 */
export async function approveSubmittedPapers(
	supabase: SupabaseClient,
	committeeId: string,
	reviewerId: string
): Promise<number> {
	const { data, error } = await supabase
		.from('documents')
		.update({
			review_status: 'approved',
			review_comment: null,
			reviewed_by: reviewerId,
			reviewed_at: new Date().toISOString()
		})
		.eq('committee_id', committeeId)
		.eq('kind', 'position_paper')
		.eq('review_status', 'submitted')
		.select('id')
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<{ id: string }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not approve the papers: ${error.message}`);
	}

	return (data ?? []).length;
}

/**
 * Approve several papers of this conference at once and say how many changed.
 *
 * A paper that is already approved is left alone, the "skipped silently" of
 * the page file, so its reviewer and date stay those of the first approval
 * and its delegate is not told twice.
 */
export async function approvePositionPapers(
	supabase: SupabaseClient,
	conferenceId: string,
	documentIds: string[],
	reviewerId: string
): Promise<number> {
	if (documentIds.length === 0) {
		return 0;
	}

	const { data, error } = await supabase
		.from('documents')
		.update({
			review_status: 'approved',
			review_comment: null,
			reviewed_by: reviewerId,
			reviewed_at: new Date().toISOString()
		})
		.in('id', documentIds)
		.eq('conference_id', conferenceId)
		.eq('kind', 'position_paper')
		.neq('review_status', 'approved')
		.select('id')
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<{ id: string }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not approve the papers: ${error.message}`);
	}

	return (data ?? []).length;
}
