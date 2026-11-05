/**
 * A delegate's own position paper: reading the page at
 * `/conferences/[slug]/committees/[committeeSlug]/position-paper`, uploading a
 * new file or a replacement, submitting a paper written on the page (T145),
 * and taking the paper back.
 *
 * Files under `$lib/server` only ever run on the server, so this is where the
 * `documents` table and the `documents` bucket are reached. Every function
 * takes the signed-in delegate's Supabase client, so Row Level Security (see
 * `specs/02-architecture/permissions.md`) decides what each of them may do:
 * a delegate may only ever read, write or remove the paper of their own seat.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { committeeHeading } from '$lib/committees';
import type { Conference } from '$lib/conferences';
import { positionPaperPath, type PositionPaperFile, type ReviewStatus } from '$lib/documents';
import { createDownloadLink, uploadDocumentObject } from '$lib/server/document-storage';
import { getConferenceBySlug } from '$lib/server/conferences';
import { renderMarkdown } from '$lib/server/markdown';

/** The committee columns this page needs: enough to name it, link back to it, and list its topics. */
type CommitteeRow = {
	id: string;
	slug: string;
	name: string;
	abbreviation: string | null;
	topics: string[];
};

/**
 * The committee this page is about, or `null` when this conference has no
 * committee with that slug.
 *
 * `getCommitteeBySlug` in `./committee-page.ts` asks the same question, but is not
 * exported: it is a private step of `getCommitteePage`, and this page needs
 * fewer columns than that one reads. Asking again here is one small query
 * rather than reaching into another module's internals.
 */
async function readCommittee(
	supabase: SupabaseClient,
	conferenceId: string,
	committeeSlug: string
): Promise<CommitteeRow | null> {
	const { data, error } = await supabase
		.from('committees')
		.select('id, slug, name, abbreviation, topics')
		.eq('conference_id', conferenceId)
		.eq('slug', committeeSlug)
		.maybeSingle()
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<CommitteeRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not load committee "${committeeSlug}": ${error.message}`);
	}

	return data ?? null;
}

/** The reader's own seat in the committee, or `null` when they hold none. */
type SeatRow = {
	id: string;
	name: string;
	/**
	 * An ISO two-letter country code, or `null` for a seat that is not a country, such as "Press".
	 */
	country_code: string | null;
};

/**
 * The reader's own seat in this committee, or `null` when they hold none.
 *
 * The `seats` select policy hands the whole table to a participant or a
 * member of staff, so a delegate reading their own seat this way needs no
 * special-case policy of its own.
 */
async function readMySeat(
	supabase: SupabaseClient,
	committeeId: string,
	userId: string
): Promise<SeatRow | null> {
	const { data, error } = await supabase
		.from('seats')
		.select('id, name, country_code')
		.eq('committee_id', committeeId)
		.eq('user_id', userId)
		.maybeSingle()
		.overrideTypes<SeatRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not read your seat: ${error.message}`);
	}

	return data ?? null;
}

/**
 * One `documents` row holding a position paper, as this page reads it. An
 * uploaded paper has the file columns and no body; a written one has only the
 * body (the `documents_file_or_body` check).
 */
type PaperRow = {
	id: string;
	file_name: string | null;
	file_size_bytes: number | null;
	review_status: ReviewStatus | null;
	review_comment: string | null;
	updated_at: string;
	storage_path: string | null;
	body_markdown: string | null;
};

/**
 * The seat's paper as the page shows it: a download link for an uploaded file,
 * and the Markdown with its HTML for a written one.
 */
async function toPositionPaperFile(
	supabase: SupabaseClient,
	row: PaperRow
): Promise<PositionPaperFile> {
	// The link downloads the file under the name the delegate gave it.
	const downloadUrl = row.storage_path
		? await createDownloadLink(supabase, row.storage_path, row.file_name ?? undefined)
		: null;

	return {
		id: row.id,
		fileName: row.file_name,
		fileSizeBytes: row.file_size_bytes,
		reviewStatus: row.review_status,
		reviewComment: row.review_comment,
		uploadedAt: row.updated_at,
		downloadUrl,
		bodyMarkdown: row.body_markdown,
		bodyHtml: row.body_markdown === null ? null : renderMarkdown(row.body_markdown)
	};
}

/** Everything the position paper page shows, or `null` when there is nothing to show. */
export type MyPositionPaper = {
	conference: Conference;
	/** `name` is the full name, for the paper's own heading; `heading` the short one for links. */
	committee: { id: string; slug: string; name: string; heading: string; topics: string[] };
	seat: { id: string; name: string; countryCode: string | null };
	/** `null` while this seat has not handed in a paper yet. */
	document: PositionPaperFile | null;
};

/**
 * Everything the position paper page needs, in one object, or `null` when the
 * conference or the committee is not there.
 *
 * A `null` seat is not folded into this `null`, because the two mean different
 * things to the caller: no conference or committee is the ordinary "unknown
 * address" 404, while holding no seat here is `05-pages/delegate/position-paper.md`'s
 * own access rule, and the two may want to say something different one day.
 * The route file turns both into the same 404 for now.
 */
export async function getMyPositionPaper(
	supabase: SupabaseClient,
	conferenceSlug: string,
	committeeSlug: string,
	userId: string
): Promise<MyPositionPaper | null> {
	const conference = await getConferenceBySlug(supabase, conferenceSlug);

	if (!conference) {
		return null;
	}

	const committee = await readCommittee(supabase, conference.id, committeeSlug);

	if (!committee) {
		return null;
	}

	const seat = await readMySeat(supabase, committee.id, userId);

	if (!seat) {
		return null;
	}

	const { data, error } = await supabase
		.from('documents')
		.select(
			'id, file_name, file_size_bytes, review_status, review_comment, updated_at, storage_path, body_markdown'
		)
		.eq('seat_id', seat.id)
		.eq('kind', 'position_paper')
		.maybeSingle()
		.overrideTypes<PaperRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not read your position paper: ${error.message}`);
	}

	const document = data ? await toPositionPaperFile(supabase, data) : null;

	return {
		conference,
		committee: {
			id: committee.id,
			slug: committee.slug,
			name: committee.name,
			heading: committeeHeading(committee),
			topics: committee.topics
		},
		seat: { id: seat.id, name: seat.name, countryCode: seat.country_code },
		document
	};
}

/** Who a position paper belongs to: everything a new or replacement one needs but its contents. */
type PaperOwner = {
	conferenceId: string;
	committeeId: string;
	seatId: string;
	/** The signed-in delegate's user id, which the insert and update policies insist on. */
	userId: string;
	/** The seat's own name, such as "France", for the row's `title`. */
	seatName: string;
	/** The committee's short name, for the row's `title`. */
	committeeHeading: string;
};

/** Everything a new or replacement uploaded position paper needs. */
export type NewPositionPaper = PaperOwner & { file: File };

/** Everything a new or replacement written position paper needs. */
export type NewWrittenPaper = PaperOwner & {
	/** The paper as the delegate wrote it, in Markdown. */
	body: string;
};

/**
 * The paper a seat has at the moment: the row itself, and the object it points
 * at, which is `null` for a written paper.
 */
type CurrentPaper = {
	id: string;
	storagePath: string | null;
};

/**
 * The position paper row this seat has at the moment, or `null` when it has
 * none.
 *
 * `uploadPositionPaper` and `submitWrittenPaper` start here, to know whether
 * to insert the seat's first row or update the one it already has — the same
 * shape `readCurrentGuide` in `./documents.ts` reads for a background guide.
 */
async function readCurrentPaper(
	supabase: SupabaseClient,
	seatId: string
): Promise<CurrentPaper | null> {
	const { data, error } = await supabase
		.from('documents')
		.select('id, storage_path')
		.eq('seat_id', seatId)
		.eq('kind', 'position_paper')
		// `documents_one_position_paper_per_seat` is a unique index, so there is
		// never a second row for `maybeSingle` to choose between.
		.maybeSingle()
		.overrideTypes<{ id: string; storage_path: string | null }, { merge: false }>();

	if (error) {
		throw new Error(`Could not read your position paper: ${error.message}`);
	}

	if (!data) {
		return null;
	}

	return { id: data.id, storagePath: data.storage_path };
}

/**
 * The columns a position paper row carries about what was handed in: a file,
 * or a written body. Whichever one is sent, the other is set to `null`, which
 * is how switching from one way to the other replaces the paper (T145).
 */
type PaperContentColumns = {
	title: string;
	storage_path: string | null;
	file_name: string | null;
	file_size_bytes: number | null;
	mime_type: string | null;
	body_markdown: string | null;
	/**
	 * Every one of these four is reset together. `protect_documents_columns`
	 * insists on it: a delegate may only move the four review columns back to
	 * "just submitted" in the same write as a new file, never on their own.
	 */
	review_status: 'submitted';
	review_comment: null;
	reviewed_by: null;
	reviewed_at: null;
};

/** The title every position paper row carries, such as "Position paper — France (UNSC)". */
function paperTitle(owner: PaperOwner): string {
	return `Position paper — ${owner.seatName} (${owner.committeeHeading})`;
}

/**
 * Write the seat's paper row: its first one, or over the one it has. Throws
 * when the database refuses, which the deadline and review policies do.
 */
async function writePaperRow(
	supabase: SupabaseClient,
	owner: PaperOwner,
	currentPaper: CurrentPaper | null,
	columns: PaperContentColumns
): Promise<void> {
	if (currentPaper === null) {
		const { error } = await supabase.from('documents').insert({
			...columns,
			conference_id: owner.conferenceId,
			committee_id: owner.committeeId,
			seat_id: owner.seatId,
			uploaded_by: owner.userId,
			kind: 'position_paper'
		});

		if (error) throw new Error(`Could not save your position paper: ${error.message}`);

		return;
	}

	const { error } = await supabase.from('documents').update(columns).eq('id', currentPaper.id);

	if (error) throw new Error(`Could not save your position paper: ${error.message}`);
}

/**
 * Put a delegate's position paper in the bucket, replacing the one their seat
 * had, whether that was a file or a written paper.
 *
 * The order is the one `specs/02-architecture/storage.md` gives, and the one
 * `uploadBackgroundGuide` in `./documents.ts` follows: the new file is
 * uploaded, then the row is pointed at it. So a step that fails halfway
 * leaves the seat with the paper it already had rather than pointing at
 * nothing.
 *
 * The file a replacement leaves behind is not removed here. A delegate may
 * only see a paper file whose row points at it, so once the row has moved on
 * a remove from their client would match nothing; the
 * `documents_queue_replaced_file` trigger writes the old path into
 * `orphaned_document_files` instead, and the service-role sweep removes it
 * (`./orphaned-document-files.ts`). The same goes for a file whose row could
 * not be saved: it has no row and is readable by nobody, and it is left for
 * the same reason.
 */
export async function uploadPositionPaper(
	supabase: SupabaseClient,
	paper: NewPositionPaper
): Promise<void> {
	const currentPaper = await readCurrentPaper(supabase, paper.seatId);

	// The uuid at the end of the path means a replacement is always a new
	// address, so a browser that cached the old file cannot show it in the new
	// one's place.
	const newPath = positionPaperPath(paper.conferenceId, paper.seatId);

	await uploadDocumentObject(supabase, newPath, paper.file);

	const fileColumns: PaperContentColumns = {
		title: paperTitle(paper),
		storage_path: newPath,
		file_name: paper.file.name,
		file_size_bytes: paper.file.size,
		mime_type: paper.file.type,
		body_markdown: null,
		review_status: 'submitted',
		review_comment: null,
		reviewed_by: null,
		reviewed_at: null
	};

	await writePaperRow(supabase, paper, currentPaper, fileColumns);
}

/**
 * Submit the paper a delegate wrote on the page, replacing the one their seat
 * had: an earlier written version, or an uploaded file, whose object the
 * `documents_queue_replaced_file` trigger then queues for the sweep, the way
 * a replaced upload's is. The review goes back to "submitted", as it does for
 * a new file.
 *
 * The draft is not touched here; the action that calls this drops it once
 * the paper is in.
 */
export async function submitWrittenPaper(
	supabase: SupabaseClient,
	paper: NewWrittenPaper
): Promise<void> {
	const currentPaper = await readCurrentPaper(supabase, paper.seatId);

	await writePaperRow(supabase, paper, currentPaper, {
		title: paperTitle(paper),
		storage_path: null,
		file_name: null,
		file_size_bytes: null,
		mime_type: null,
		body_markdown: paper.body,
		review_status: 'submitted',
		review_comment: null,
		reviewed_by: null,
		reviewed_at: null
	});
}

/**
 * Take a delegate's position paper away. `false` means there was none to take,
 * or the delete was refused — which for this table means the paper is no
 * longer `submitted`, or the deadline has passed, the same two conditions
 * `canRemovePositionPaper` in `$lib/documents.ts` checks before the button is
 * even shown.
 *
 * Only the row is deleted here. Its file, if it had one, is queued by the
 * `documents_queue_orphaned_file` trigger and removed by the service-role
 * sweep (`./orphaned-document-files.ts`): once the row is gone the delegate
 * may no longer see the file, so a remove from their client would match
 * nothing.
 */
export async function removePositionPaper(
	supabase: SupabaseClient,
	documentId: string
): Promise<boolean> {
	const { data, error } = await supabase
		.from('documents')
		.delete()
		.eq('id', documentId)
		.eq('kind', 'position_paper')
		// Row Level Security refusing a delete comes back with no error and no
		// rows: the policy hides the row, so nothing matches and nothing is
		// deleted. Asking for the id of what went is what tells the two apart.
		.select('id')
		.overrideTypes<{ id: string }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not remove your position paper: ${error.message}`);
	}

	const deleted: { id: string }[] = data ?? [];

	return deleted.length > 0;
}
