import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
	addChair,
	addCommittee,
	addSeat,
	createOpenConferenceOwnedByMe,
	giveSeatTo,
	type ConferenceFixture
} from './conference-fixtures';
import {
	createSignedInClient,
	createVisitorClient,
	type SignedInClient
} from './supabase-test-client';

// The private `documents` bucket and its four policies on `storage.objects`.
// Each test states one rule from specs/02-architecture/storage.md or the
// "`documents` select rule" of specs/02-architecture/permissions.md, and checks
// it against the real local Storage, once for somebody who is allowed and once
// for somebody who is not.
//
// The uploads are real and go through ordinary signed-in clients, so a file
// only arrives if `may_upload_conference_document` lets it. Nothing here uses
// the service-role client: a rule proved with a client that ignores Row Level
// Security would be no proof at all.

/** The bucket every test here uploads to. */
const BUCKET = 'documents';

/** The four bytes every PDF starts with, "%PDF". Four bytes is a file as far as the bucket cares. */
const TINY_PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

/** A tiny file that counts as a PDF, so the bucket's type list lets it through. */
function tinyPdf(): Blob {
	return new Blob([TINY_PDF_BYTES], { type: 'application/pdf' });
}

/** The path the app gives a position paper: `<conference id>/position-papers/<seat id>-<uuid>.pdf`. */
function positionPaperPath(conferenceId: string, seatId: string): string {
	return `${conferenceId}/position-papers/${seatId}-${crypto.randomUUID()}.pdf`;
}

/** The path a background guide goes at: `<conference id>/background-guides/<committee id>-<uuid>.pdf`. */
function backgroundGuidePath(conferenceId: string, committeeId: string): string {
	return `${conferenceId}/background-guides/${committeeId}-${crypto.randomUUID()}.pdf`;
}

/** The path a resource goes at: `<conference id>/resources/<uuid>.pdf`. */
function resourcePath(conferenceId: string): string {
	return `${conferenceId}/resources/${crypto.randomUUID()}.pdf`;
}

/** A conference with one committee, two seats, and a delegate sitting in the first seat. */
type CommitteeFixture = {
	organiser: ConferenceFixture;
	committeeId: string;
	/** The seat the delegate below sits in. */
	seatId: string;
	/** A second seat in the same committee, still empty unless a test fills it. */
	otherSeatId: string;
	delegate: SignedInClient;
};

/**
 * Sets up the people a position paper needs: the organiser who owns the
 * conference, a committee with two seats in it, and one delegate in a seat.
 *
 * The conference is published, not left a draft. The `documents` insert policy
 * looks the conference up to check the position paper deadline, and a table a
 * policy reads applies its own policies in turn, so a delegate who cannot read
 * a draft conference could not write the row either.
 */
async function createSeatedDelegate(): Promise<CommitteeFixture> {
	const organiser = await createOpenConferenceOwnedByMe();
	const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
	const seatId = await addSeat(organiser.supabase, committeeId, 'France', 'FR');
	const otherSeatId = await addSeat(organiser.supabase, committeeId, 'Kenya', 'KE');
	const delegate = await createSignedInClient();

	await giveSeatTo(organiser.supabase, seatId, delegate.userId);

	return { organiser, committeeId, seatId, otherSeatId, delegate };
}

/**
 * A second conference inside the same organisation, so that one person runs
 * both of them.
 *
 * Only the background guide test below needs it. Its point is that a committee
 * has to belong to the conference whose folder the file is going into, and with
 * two different organisers the upload would be refused for the duller reason
 * that the uploader is a stranger to the second conference.
 */
async function addSecondConference(fixture: ConferenceFixture): Promise<string> {
	const { data, error } = await fixture.supabase
		.from('conferences')
		.insert({
			name: 'Second Fixture Conference',
			slug: `fixture-conference-${crypto.randomUUID()}`,
			city: 'Utrecht',
			country_code: 'NL',
			start_date: '2020-03-01',
			end_date: '2020-03-03',
			organization_id: fixture.organizationId,
			created_by: fixture.userId
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not create the second fixture conference: ${error?.message}`);
	}

	return data.id;
}

/** Everything the `documents` row of a position paper has to carry. */
type PositionPaperDetails = {
	conferenceId: string;
	committeeId: string;
	seatId: string;
	uploadedBy: string;
	storagePath: string;
};

/**
 * Writes the `documents` row that gives an uploaded file its meaning, through
 * the same client that uploaded the object.
 *
 * Reading the bytes is the same question as reading this row: the storage
 * select policy only asks whether a `documents` row with this `storage_path`
 * exists, and that sub-select runs under the reader's own Row Level Security.
 */
async function addPositionPaperRow(
	uploader: SupabaseClient,
	paper: PositionPaperDetails
): Promise<void> {
	const { error } = await uploader.from('documents').insert({
		conference_id: paper.conferenceId,
		committee_id: paper.committeeId,
		seat_id: paper.seatId,
		uploaded_by: paper.uploadedBy,
		kind: 'position_paper',
		title: 'Fixture position paper',
		storage_path: paper.storagePath,
		file_name: 'position-paper.pdf',
		file_size_bytes: TINY_PDF_BYTES.length,
		mime_type: 'application/pdf',
		// What a paper arriving means, and what the table insists on since
		// 20261022142000 (documents_position_paper_has_review_status).
		review_status: 'submitted'
	});

	if (error) {
		throw new Error(`Could not create the fixture document row: ${error.message}`);
	}
}

/**
 * Uploads a position paper for the fixture's seated delegate and writes its
 * `documents` row, both through the delegate's own client, and hands back the
 * path the file sits at.
 *
 * It throws rather than returning an error, so that a test about who may read
 * or remove the file cannot pass because the file was never there.
 */
async function uploadPositionPaper(fixture: CommitteeFixture): Promise<string> {
	const path = positionPaperPath(fixture.organiser.conferenceId, fixture.seatId);

	const { error } = await fixture.delegate.supabase.storage.from(BUCKET).upload(path, tinyPdf());

	if (error) {
		throw new Error(`Could not upload the fixture position paper: ${error.message}`);
	}

	await addPositionPaperRow(fixture.delegate.supabase, {
		conferenceId: fixture.organiser.conferenceId,
		committeeId: fixture.committeeId,
		seatId: fixture.seatId,
		uploadedBy: fixture.delegate.userId,
		storagePath: path
	});

	return path;
}

describe('the bucket itself', () => {
	it('is private, so a signed-out visitor cannot download a file in it', async () => {
		const fixture = await createSeatedDelegate();
		const path = await uploadPositionPaper(fixture);

		const visitor = createVisitorClient();
		const { data, error } = await visitor.storage.from(BUCKET).download(path);

		expect(error).not.toBeNull();
		expect(data).toBeNull();
	});

	it('refuses a file type it does not allow', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const text = new Blob(['not a document'], { type: 'text/plain' });

		// The organiser is allowed to write this folder, so it is the bucket's own
		// type list that refuses the file and not a policy.
		const { error } = await fixture.supabase.storage
			.from(BUCKET)
			.upload(`${fixture.conferenceId}/resources/${crypto.randomUUID()}.txt`, text);

		expect(error).not.toBeNull();
	});
});

describe('uploading a position paper', () => {
	it("lets the delegate sitting in a seat upload that seat's paper", async () => {
		const fixture = await createSeatedDelegate();

		const { error } = await fixture.delegate.supabase.storage
			.from(BUCKET)
			.upload(positionPaperPath(fixture.organiser.conferenceId, fixture.seatId), tinyPdf());

		expect(error).toBeNull();
	});

	it('refuses a signed-in stranger', async () => {
		const fixture = await createSeatedDelegate();
		const stranger = await createSignedInClient();

		const { error } = await stranger.supabase.storage
			.from(BUCKET)
			.upload(positionPaperPath(fixture.organiser.conferenceId, fixture.seatId), tinyPdf());

		expect(error).not.toBeNull();
	});

	it("refuses a delegate uploading to another seat's path", async () => {
		const fixture = await createSeatedDelegate();

		const { error } = await fixture.delegate.supabase.storage
			.from(BUCKET)
			.upload(positionPaperPath(fixture.organiser.conferenceId, fixture.otherSeatId), tinyPdf());

		expect(error).not.toBeNull();
	});
});

describe('uploading a background guide', () => {
	it("lets a chair upload their own committee's guide", async () => {
		const fixture = await createSeatedDelegate();
		const chair = await createSignedInClient();

		await addChair(fixture.organiser.supabase, fixture.committeeId, chair.userId);

		const { error } = await chair.supabase.storage
			.from(BUCKET)
			.upload(backgroundGuidePath(fixture.organiser.conferenceId, fixture.committeeId), tinyPdf());

		expect(error).toBeNull();
	});

	it('refuses a delegate of that committee', async () => {
		const fixture = await createSeatedDelegate();

		const { error } = await fixture.delegate.supabase.storage
			.from(BUCKET)
			.upload(backgroundGuidePath(fixture.organiser.conferenceId, fixture.committeeId), tinyPdf());

		expect(error).not.toBeNull();
	});
});

describe('uploading a resource', () => {
	it('lets the organiser upload to their own conference', async () => {
		const fixture = await createOpenConferenceOwnedByMe();

		const { error } = await fixture.supabase.storage
			.from(BUCKET)
			.upload(resourcePath(fixture.conferenceId), tinyPdf());

		expect(error).toBeNull();
	});

	it('refuses a chair, who runs a committee and not the conference', async () => {
		const fixture = await createSeatedDelegate();
		const chair = await createSignedInClient();

		await addChair(fixture.organiser.supabase, fixture.committeeId, chair.userId);

		const { error } = await chair.supabase.storage
			.from(BUCKET)
			.upload(resourcePath(fixture.organiser.conferenceId), tinyPdf());

		expect(error).not.toBeNull();
	});

	it('refuses a delegate taking part in the conference', async () => {
		const fixture = await createSeatedDelegate();

		const { error } = await fixture.delegate.supabase.storage
			.from(BUCKET)
			.upload(resourcePath(fixture.organiser.conferenceId), tinyPdf());

		expect(error).not.toBeNull();
	});
});

describe('a path that belongs to nobody', () => {
	it('refuses a path whose first folder is not a conference id', async () => {
		const fixture = await createOpenConferenceOwnedByMe();

		const { error } = await fixture.supabase.storage
			.from(BUCKET)
			.upload(`not-a-conference-id/resources/${crypto.randomUUID()}.pdf`, tinyPdf());

		expect(error).not.toBeNull();
	});

	it('refuses a path with only one folder', async () => {
		const fixture = await createOpenConferenceOwnedByMe();

		const { error } = await fixture.supabase.storage
			.from(BUCKET)
			.upload(`${fixture.conferenceId}/${crypto.randomUUID()}.pdf`, tinyPdf());

		expect(error).not.toBeNull();
	});

	it('refuses a folder the bucket has never heard of', async () => {
		const fixture = await createOpenConferenceOwnedByMe();

		const { error } = await fixture.supabase.storage
			.from(BUCKET)
			.upload(`${fixture.conferenceId}/secret-plans/${crypto.randomUUID()}.pdf`, tinyPdf());

		expect(error).not.toBeNull();
	});

	it('refuses a position paper whose file name does not start with a seat id', async () => {
		const fixture = await createSeatedDelegate();

		const { error } = await fixture.delegate.supabase.storage
			.from(BUCKET)
			.upload(`${fixture.organiser.conferenceId}/position-papers/my-paper.pdf`, tinyPdf());

		expect(error).not.toBeNull();
	});

	it('refuses a background guide naming a committee of another conference', async () => {
		const fixture = await createSeatedDelegate();
		const otherConferenceId = await addSecondConference(fixture.organiser);

		// The same person runs both conferences and chairs the committee, so the
		// only thing wrong here is that the committee is not part of the conference
		// whose folder the file is going into.
		const { error } = await fixture.organiser.supabase.storage
			.from(BUCKET)
			.upload(backgroundGuidePath(otherConferenceId, fixture.committeeId), tinyPdf());

		expect(error).not.toBeNull();
	});
});

describe('reading a file', () => {
	it("lets the seat's delegate download their own position paper", async () => {
		const fixture = await createSeatedDelegate();
		const path = await uploadPositionPaper(fixture);

		const { data, error } = await fixture.delegate.supabase.storage.from(BUCKET).download(path);

		expect(error).toBeNull();
		expect(data?.size).toBe(TINY_PDF_BYTES.length);
	});

	it('lets a signed-out visitor download a background guide marked for everyone', async () => {
		const fixture = await createSeatedDelegate();
		const path = backgroundGuidePath(fixture.organiser.conferenceId, fixture.committeeId);

		const { error: uploadError } = await fixture.organiser.supabase.storage
			.from(BUCKET)
			.upload(path, tinyPdf());
		expect(uploadError).toBeNull();

		const { error: rowError } = await fixture.organiser.supabase.from('documents').insert({
			conference_id: fixture.organiser.conferenceId,
			committee_id: fixture.committeeId,
			uploaded_by: fixture.organiser.userId,
			kind: 'background_guide',
			title: 'Background guide',
			storage_path: path,
			file_name: 'background-guide.pdf',
			file_size_bytes: TINY_PDF_BYTES.length,
			mime_type: 'application/pdf',
			audience: 'everyone'
		});
		expect(rowError).toBeNull();

		// The bucket is private, so even a file anybody may read needs the select
		// policy to pass. This is the `anon` half of it: the public committee page
		// makes the signed URL for this download in `load`, with a client that has
		// nobody signed in.
		const { data, error } = await createVisitorClient().storage.from(BUCKET).download(path);

		expect(error).toBeNull();
		expect(data?.size).toBe(TINY_PDF_BYTES.length);
	});

	// The chair papers page (T46) makes the signed URL for each paper with the
	// chair's own client, so the chair has to pass the select policy themselves.
	it("lets a chair of the seat's committee download a delegate's position paper", async () => {
		const fixture = await createSeatedDelegate();
		const chair = await createSignedInClient();
		const path = await uploadPositionPaper(fixture);

		await addChair(fixture.organiser.supabase, fixture.committeeId, chair.userId);

		const { data, error } = await chair.supabase.storage.from(BUCKET).download(path);

		expect(error).toBeNull();
		expect(data?.size).toBe(TINY_PDF_BYTES.length);
	});

	it('refuses a chair of another committee of the same conference', async () => {
		const fixture = await createSeatedDelegate();
		const otherChair = await createSignedInClient();
		const path = await uploadPositionPaper(fixture);
		const otherCommitteeId = await addCommittee(
			fixture.organiser.supabase,
			fixture.organiser.conferenceId,
			'General Assembly'
		);

		await addChair(fixture.organiser.supabase, otherCommitteeId, otherChair.userId);

		const { data, error } = await otherChair.supabase.storage.from(BUCKET).download(path);

		expect(error).not.toBeNull();
		expect(data).toBeNull();
	});

	it('refuses a delegate in another seat of the same committee', async () => {
		const fixture = await createSeatedDelegate();
		const neighbour = await createSignedInClient();
		const path = await uploadPositionPaper(fixture);

		await giveSeatTo(fixture.organiser.supabase, fixture.otherSeatId, neighbour.userId);

		const { data, error } = await neighbour.supabase.storage.from(BUCKET).download(path);

		expect(error).not.toBeNull();
		expect(data).toBeNull();
	});

	it('refuses everybody a file with no documents row, including the person who uploaded it', async () => {
		const fixture = await createSeatedDelegate();
		const path = positionPaperPath(fixture.organiser.conferenceId, fixture.seatId);

		// The upload succeeds and no row is written, which is the moment between an
		// upload arriving and its row failing to save.
		const { error: uploadError } = await fixture.delegate.supabase.storage
			.from(BUCKET)
			.upload(path, tinyPdf());
		expect(uploadError).toBeNull();

		const asUploader = await fixture.delegate.supabase.storage.from(BUCKET).download(path);
		expect(asUploader.error).not.toBeNull();

		const asOrganiser = await fixture.organiser.supabase.storage.from(BUCKET).download(path);
		expect(asOrganiser.error).not.toBeNull();

		const asVisitor = await createVisitorClient().storage.from(BUCKET).download(path);
		expect(asVisitor.error).not.toBeNull();
	});
});

describe('replacing and removing a file', () => {
	// Every test here writes the `documents` row as well as the object, the way a
	// real upload does. Storage hands back the rows a remove changed, so removing
	// a file needs the select policy to pass as well as the delete policy, and
	// that policy is the one that reads the row.

	it('refuses the uploader replacing their own position paper in place', async () => {
		const fixture = await createSeatedDelegate();
		const path = await uploadPositionPaper(fixture);

		// `upsert` on a path that already holds a file is an update of the
		// `storage.objects` row rather than an insert, so it is the update policy
		// that decides. Since migration 20261022133000 (security review M3) being
		// the uploader is not enough in the position-papers folder: a chair's
		// review is a judgement about the bytes, so new bytes go to a new path,
		// which is what the position paper page has always done.
		const { error } = await fixture.delegate.supabase.storage
			.from(BUCKET)
			.upload(path, tinyPdf(), { upsert: true });

		expect(error).not.toBeNull();
	});

	it('lets the uploader remove their own file', async () => {
		const fixture = await createSeatedDelegate();
		const path = await uploadPositionPaper(fixture);

		const { data } = await fixture.delegate.supabase.storage.from(BUCKET).remove([path]);

		expect(data).toHaveLength(1);
	});

	it("lets a chair of the seat's committee remove a delegate's position paper", async () => {
		const fixture = await createSeatedDelegate();
		const chair = await createSignedInClient();

		await addChair(fixture.organiser.supabase, fixture.committeeId, chair.userId);
		const path = await uploadPositionPaper(fixture);

		const { data } = await chair.supabase.storage.from(BUCKET).remove([path]);

		expect(data).toHaveLength(1);
	});

	it("refuses the uploader moving their own file into another conference's folder", async () => {
		const fixture = await createSeatedDelegate();
		const path = await uploadPositionPaper(fixture);
		const elsewhere = await addSecondConference(fixture.organiser);

		// Storage renames an object by updating its name, so the `with check` half
		// of the update policy asks about the path the file would end up at rather
		// than about who owns it today. Being the uploader is what lets them
		// replace it where it is, and says nothing about where else it may go.
		const { error } = await fixture.delegate.supabase.storage
			.from(BUCKET)
			.move(path, `${elsewhere}/resources/${crypto.randomUUID()}.pdf`);

		expect(error).not.toBeNull();
	});

	it('refuses a stranger both replacing and removing it', async () => {
		const fixture = await createSeatedDelegate();
		const stranger = await createSignedInClient();
		const path = await uploadPositionPaper(fixture);

		const { error } = await stranger.supabase.storage
			.from(BUCKET)
			.upload(path, tinyPdf(), { upsert: true });
		expect(error).not.toBeNull();

		// A remove that matched no row is an empty list rather than an error, which
		// is how Storage answers a delete nobody was allowed to make.
		const { data } = await stranger.supabase.storage.from(BUCKET).remove([path]);
		expect(data).toEqual([]);
	});
});

describe('removing a guide or resource that no row points at any more', () => {
	// The organiser's documents page writes the new row first and removes the
	// old file after, so by then no `documents` row points at it. Migration 0017
	// lets the people who may change such a file still see it, which is what
	// Storage needs before it will remove it. Position papers are not included,
	// which the test above that refuses everybody a row-less paper still proves.

	it('lets the organiser remove a replaced background guide', async () => {
		const fixture = await createSeatedDelegate();
		const path = backgroundGuidePath(fixture.organiser.conferenceId, fixture.committeeId);

		const { error: uploadError } = await fixture.organiser.supabase.storage
			.from(BUCKET)
			.upload(path, tinyPdf());
		expect(uploadError).toBeNull();

		const { data } = await fixture.organiser.supabase.storage.from(BUCKET).remove([path]);

		expect(data).toHaveLength(1);
	});

	it('lets the organiser remove a deleted resource', async () => {
		const fixture = await createSeatedDelegate();
		const path = resourcePath(fixture.organiser.conferenceId);

		const { error: uploadError } = await fixture.organiser.supabase.storage
			.from(BUCKET)
			.upload(path, tinyPdf());
		expect(uploadError).toBeNull();

		const { data } = await fixture.organiser.supabase.storage.from(BUCKET).remove([path]);

		expect(data).toHaveLength(1);
	});

	it('still hides such a guide from a delegate of the committee', async () => {
		const fixture = await createSeatedDelegate();
		const path = backgroundGuidePath(fixture.organiser.conferenceId, fixture.committeeId);

		await fixture.organiser.supabase.storage.from(BUCKET).upload(path, tinyPdf());

		const { error } = await fixture.delegate.supabase.storage.from(BUCKET).download(path);
		const { data } = await fixture.delegate.supabase.storage.from(BUCKET).remove([path]);

		expect(error).not.toBeNull();
		expect(data ?? []).toHaveLength(0);
	});
});
