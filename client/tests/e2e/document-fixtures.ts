import { createServiceRoleClient } from '../db/supabase-test-client';
import { giveApplication, type TestUser } from './signed-in-user';

// What `manage-documents.spec.ts` sets up before it opens the organiser's
// documents page: a seat for a delegate, and a position paper that is really in
// the `documents` bucket, so its signed link opens a file.
//
// The service-role client writes these rows and objects the way a delegate's
// own upload would. It arranges the state a test begins in and is never used
// to show that something is allowed, which is what
// `tests/db/supabase-test-client.ts` warns against.

/** The private bucket every document lives in. */
const DOCUMENTS_BUCKET = 'documents';

/** The smallest file a PDF viewer recognises as one, which is all a test needs. */
const TINY_PDF = '%PDF-1.7\n%%EOF\n';

/** Seat `user` as `seatName` in a committee and answer the seat's id. */
export async function seatDelegateAs(
	user: TestUser,
	committeeId: string,
	seatName: string
): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('seats')
		.insert({
			committee_id: committeeId,
			name: seatName,
			user_id: user.id,
			allocated_at: new Date().toISOString()
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not seat the test delegate: ${error?.message}`);
	}

	return data.id;
}

/**
 * Seat `user` as `seatName` with an accepted application behind the seat, as
 * `accept_application` leaves it, and answer the seat's id.
 *
 * `seatDelegateAs` above writes a seat with nobody's application behind it,
 * which is all the paper tests need. Since migration 20261022110000 the
 * private-details views count a seat only when the holder's own application or
 * delegation stands behind it, so a test that reads a seated delegate's email or
 * date of birth as the team seats them this way instead.
 */
export async function seatAcceptedApplicantAs(
	user: TestUser,
	conferenceId: string,
	committeeId: string,
	seatName: string
): Promise<string> {
	const applicationId = await giveApplication(user, { conferenceId, status: 'accepted' });
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('seats')
		.insert({
			committee_id: committeeId,
			name: seatName,
			user_id: user.id,
			application_id: applicationId,
			allocated_at: new Date().toISOString()
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not seat the test applicant: ${error?.message}`);
	}

	return data.id;
}

/** One position paper, as `addPositionPaper` writes it. */
export type PositionPaperSeed = {
	conferenceId: string;
	committeeId: string;
	seatId: string;
	/** The delegate in the seat, who is the paper's uploader. */
	delegate: TestUser;
};

/** Upload a small PDF into the seat's place and write its row. Answers the row's id. */
export async function addPositionPaper(seed: PositionPaperSeed): Promise<string> {
	const admin = createServiceRoleClient();
	const storagePath = `${seed.conferenceId}/position-papers/${seed.seatId}-${crypto.randomUUID()}.pdf`;

	const { error: uploadError } = await admin.storage
		.from(DOCUMENTS_BUCKET)
		.upload(storagePath, new Blob([TINY_PDF], { type: 'application/pdf' }), {
			contentType: 'application/pdf'
		});

	if (uploadError) {
		throw new Error(`Could not upload the test paper: ${uploadError.message}`);
	}

	const { data, error } = await admin
		.from('documents')
		.insert({
			conference_id: seed.conferenceId,
			committee_id: seed.committeeId,
			seat_id: seed.seatId,
			uploaded_by: seed.delegate.id,
			kind: 'position_paper',
			title: 'Position paper',
			storage_path: storagePath,
			file_name: 'position-paper.pdf',
			file_size_bytes: TINY_PDF.length,
			mime_type: 'application/pdf',
			review_status: 'submitted'
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test paper: ${error?.message}`);
	}

	return data.id;
}

/** Write a paper written on MUNMeet (T145) into the seat's place: a body and no file. */
export async function addWrittenPaper(seed: PositionPaperSeed, body: string): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('documents')
		.insert({
			conference_id: seed.conferenceId,
			committee_id: seed.committeeId,
			seat_id: seed.seatId,
			uploaded_by: seed.delegate.id,
			kind: 'position_paper',
			title: 'Position paper',
			body_markdown: body,
			review_status: 'submitted'
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test written paper: ${error?.message}`);
	}

	return data.id;
}

/** The review columns of one paper, as the organiser's actions leave them. */
export type PaperReviewColumns = {
	review_status: string | null;
	review_comment: string | null;
	reviewed_by: string | null;
	reviewed_at: string | null;
};

/** Read the review columns of one paper. */
export async function readPaperReview(documentId: string): Promise<PaperReviewColumns> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('documents')
		.select('review_status, review_comment, reviewed_by, reviewed_at')
		.eq('id', documentId)
		.single();

	if (error || !data) {
		throw new Error(`Could not read the test paper: ${error?.message}`);
	}

	return data;
}

/** The titles of the review notifications one person has, oldest first. */
export async function readReviewNotificationTitles(userId: string): Promise<string[]> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('notifications')
		.select('title')
		.eq('user_id', userId)
		.eq('kind', 'document_reviewed')
		.order('created_at', { ascending: true });

	if (error) {
		throw new Error(`Could not read the notifications: ${error.message}`);
	}

	return (data ?? []).map((notification) => notification.title);
}

/** The storage path of a committee's background guide, or `null` when it has none. */
export async function readGuideStoragePath(committeeId: string): Promise<string | null> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('documents')
		.select('storage_path')
		.eq('committee_id', committeeId)
		.eq('kind', 'background_guide')
		.maybeSingle();

	if (error) {
		throw new Error(`Could not read the guide: ${error.message}`);
	}

	return data?.storage_path ?? null;
}

/** Whether an object is still in the bucket. */
export async function isStoredObject(storagePath: string): Promise<boolean> {
	const admin = createServiceRoleClient();
	const { data } = await admin.storage.from(DOCUMENTS_BUCKET).download(storagePath);

	return data !== null;
}
