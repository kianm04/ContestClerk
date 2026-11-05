import { describe, expect, it } from 'vitest';
import { freeSeat, listSeatsWithHolders } from '$lib/server/allocation-grid';
import { unassignDelegationSeat } from '$lib/server/delegations';
import { removeOrphanedDocumentFiles } from '$lib/server/orphaned-document-files';
import {
	addCommittee,
	addSeat,
	createOpenConferenceOwnedByMe,
	giveSeatTo,
	type ConferenceFixture
} from './conference-fixtures';
import {
	createServiceRoleClient,
	createSignedInClient,
	createVisitorClient,
	type SignedInClient
} from './supabase-test-client';

// T96: when a seat changes hands, its position paper's file leaves the bucket
// along with its `documents` row. The database lists the file in
// `orphaned_document_files` when the row goes, and the app removes it with the
// service role right after it empties a seat. See "Files whose row is deleted"
// in specs/02-architecture/storage.md.
//
// The uploads are real and go through the delegate's own client. The
// service-role client is used for one thing only: looking into the bucket to
// see whether a file is still there. Once its row is gone nobody signed in may
// see the file at all, which is the point, so nobody else could answer.
//
// Several test files run at the same time, and any of them emptying a seat
// removes every file on the list. So no test here expects a path to still be
// waiting on the list; each one looks at the bucket, where a file removed by
// somebody else's sweep is just as gone.

/** The bucket position papers live in. */
const BUCKET = 'documents';

/** A tiny file that counts as a PDF: the four bytes "%PDF". */
function tinyPdf(): Blob {
	return new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], { type: 'application/pdf' });
}

/** A published conference with one committee and one seat, and a delegate sitting in it. */
type SeatedDelegate = {
	organiser: ConferenceFixture;
	committeeId: string;
	seatId: string;
	delegate: SignedInClient;
};

async function createSeatedDelegate(): Promise<SeatedDelegate> {
	const organiser = await createOpenConferenceOwnedByMe();
	const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
	const seatId = await addSeat(organiser.supabase, committeeId, 'France', 'FR');
	const delegate = await createSignedInClient();

	await giveSeatTo(organiser.supabase, seatId, delegate.userId);

	return { organiser, committeeId, seatId, delegate };
}

/**
 * Uploads a position paper and writes its `documents` row, both as the seated
 * delegate, the way the position paper page does, and hands back its path.
 */
async function uploadPositionPaper(fixture: SeatedDelegate): Promise<string> {
	const conferenceId = fixture.organiser.conferenceId;
	const path = `${conferenceId}/position-papers/${fixture.seatId}-${crypto.randomUUID()}.pdf`;

	const { error: uploadError } = await fixture.delegate.supabase.storage
		.from(BUCKET)
		.upload(path, tinyPdf());

	if (uploadError) {
		throw new Error(`Could not upload the fixture position paper: ${uploadError.message}`);
	}

	const { error: rowError } = await fixture.delegate.supabase.from('documents').insert({
		conference_id: conferenceId,
		committee_id: fixture.committeeId,
		seat_id: fixture.seatId,
		uploaded_by: fixture.delegate.userId,
		kind: 'position_paper',
		title: 'Fixture position paper',
		storage_path: path,
		file_name: 'position-paper.pdf',
		file_size_bytes: 4,
		mime_type: 'application/pdf',
		// What a paper arriving means, and what the table insists on since
		// 20261022142000 (documents_position_paper_has_review_status).
		review_status: 'submitted'
	});

	if (rowError) {
		throw new Error(`Could not create the fixture document row: ${rowError.message}`);
	}

	return path;
}

/** Whether a file is in the bucket at this path, as the service role sees it. */
async function isInBucket(path: string): Promise<boolean> {
	const folder = path.slice(0, path.lastIndexOf('/'));
	const fileName = path.slice(path.lastIndexOf('/') + 1);

	const { data, error } = await createServiceRoleClient()
		.storage.from(BUCKET)
		.list(folder, { search: fileName });

	if (error) {
		throw new Error(`Could not look into the bucket: ${error.message}`);
	}

	const files = data ?? [];

	return files.some((file) => file.name === fileName);
}

describe('emptying a seat', () => {
	it("removes the position paper's file when an organiser frees the seat", async () => {
		const fixture = await createSeatedDelegate();
		const path = await uploadPositionPaper(fixture);
		expect(await isInBucket(path)).toBe(true);

		const seats = await listSeatsWithHolders(
			fixture.organiser.supabase,
			fixture.organiser.conferenceId
		);
		const seat = seats.find((candidate) => candidate.id === fixture.seatId);

		if (seat === undefined) {
			throw new Error('The allocation grid did not read the fixture seat.');
		}

		await freeSeat(fixture.organiser.supabase, seat);

		expect(await isInBucket(path)).toBe(false);
	});

	it("removes the position paper's file when the seat is unassigned", async () => {
		const fixture = await createSeatedDelegate();
		const path = await uploadPositionPaper(fixture);
		expect(await isInBucket(path)).toBe(true);

		// This is the head's own action. The service role stands in for a head
		// here: the fixture that makes a head's delegation archives the conference,
		// and a delegate of an archived conference cannot write a paper's row; and
		// the organiser's client cannot stand in any more, because
		// protect_seats_columns refuses the plain write from a browser role. The
		// database treats the write the same whoever makes it: the update empties
		// the seat, and `seats_clear_position_paper` deletes the row. That a head
		// may write the update is tested in allocation.test.ts.
		const refusal = await unassignDelegationSeat(createServiceRoleClient(), fixture.seatId);
		expect(refusal).toBeNull();

		expect(await isInBucket(path)).toBe(false);
	});

	it('removes a file whose seat was emptied some other way, the next time a sweep runs', async () => {
		const fixture = await createSeatedDelegate();
		const path = await uploadPositionPaper(fixture);

		// A plain update, with no sweep after it: only the trigger runs. The service
		// role makes it, because a browser may no longer write user_id
		// (protect_seats_columns) and the organiser's own way, revoke_seat, would
		// delete the paper's row itself.
		const { error } = await createServiceRoleClient()
			.from('seats')
			.update({ user_id: null })
			.eq('id', fixture.seatId);
		expect(error).toBeNull();

		await removeOrphanedDocumentFiles();

		expect(await isInBucket(path)).toBe(false);
	});

	it('leaves the file of a paper whose row is still there', async () => {
		const fixture = await createSeatedDelegate();
		const path = await uploadPositionPaper(fixture);

		await removeOrphanedDocumentFiles();

		expect(await isInBucket(path)).toBe(true);
	});
});

describe('the list of orphaned files', () => {
	it('cannot be read by anybody signed in, including the delegate whose file it was', async () => {
		const fixture = await createSeatedDelegate();
		await uploadPositionPaper(fixture);
		await createServiceRoleClient()
			.from('seats')
			.update({ user_id: null })
			.eq('id', fixture.seatId);

		const asDelegate = await fixture.delegate.supabase
			.from('orphaned_document_files')
			.select('storage_path');
		expect(asDelegate.data).toBeNull();
		expect(asDelegate.error).not.toBeNull();

		const asOrganiser = await fixture.organiser.supabase
			.from('orphaned_document_files')
			.select('storage_path');
		expect(asOrganiser.data).toBeNull();
		expect(asOrganiser.error).not.toBeNull();
	});

	it('cannot be read by a signed-out visitor', async () => {
		const { data, error } = await createVisitorClient()
			.from('orphaned_document_files')
			.select('storage_path');

		expect(data).toBeNull();
		expect(error).not.toBeNull();
	});

	it('cannot be written by anybody signed in, so nobody can have a file removed', async () => {
		const fixture = await createSeatedDelegate();
		const path = await uploadPositionPaper(fixture);

		const { error } = await fixture.organiser.supabase
			.from('orphaned_document_files')
			.insert({ storage_path: path });
		expect(error).not.toBeNull();

		await removeOrphanedDocumentFiles();

		expect(await isInBucket(path)).toBe(true);
	});
});
