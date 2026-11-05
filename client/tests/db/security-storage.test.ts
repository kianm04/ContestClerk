import { describe, expect, it } from 'vitest';
import { removeOrphanedDocumentFiles } from '$lib/server/orphaned-document-files';
import {
	addChair,
	addCommittee,
	addOrganizationMember,
	addRole,
	addSeat,
	createConferenceOwnedByMe,
	createOpenConferenceOwnedByMe,
	giveRole,
	giveSeatTo,
	type ConferenceFixture
} from './conference-fixtures';
import {
	createServiceRoleClient,
	createSignedInClient,
	createVisitorClient,
	type SignedInClient
} from './supabase-test-client';

// The storage findings of the security review of 10 October 2026 (M3, L59,
// L60, L61, L62, L63, L64, I22), closed by migration
// 20261022133000_storage_hygiene.sql. Each test states one rule and checks it
// against the real local Storage with an ordinary signed-in or visitor client,
// so a refusal is the policies' own. The service role appears only to arrange
// a state nobody signed in may make (a file whose row outlives it) and to look
// into the two cleanup queues, which nobody signed in may read.
//
// The SQL this file covers: `may_upload_conference_document` and
// `check_document_scope` (replaced), `may_see_public_media`, `may_delete_own_position_paper`,
// `queue_replaced_public_media` with its triggers `profiles_queue_replaced_avatar`,
// `organizations_queue_replaced_logo` and `conferences_queue_replaced_pictures`,
// `queue_replaced_document_file` with `documents_queue_replaced_file`, the
// `public_media_cleanup` table, and the four `_in_own_folder` checks.
//
// The L50 block at the end covers migration
// 20261022160000_document_files_follow_permission.sql, which took the
// uploader's own rights over a guide's or a resource's file away.

const DOCUMENTS = 'documents';
const PUBLIC_MEDIA = 'public-media';
const ONE_DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

/** The four bytes every PDF starts with, "%PDF". Four bytes is a file as far as the bucket cares. */
const TINY_PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

function tinyPdf(): Blob {
	return new Blob([TINY_PDF_BYTES], { type: 'application/pdf' });
}

/** A tiny file that counts as a JPEG, so the bucket's type limit lets it through. */
function tinyImage(): Blob {
	return new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xdb])], { type: 'image/jpeg' });
}

function positionPaperPath(conferenceId: string, seatId: string): string {
	return `${conferenceId}/position-papers/${seatId}-${crypto.randomUUID()}.pdf`;
}

function backgroundGuidePath(conferenceId: string, committeeId: string): string {
	return `${conferenceId}/background-guides/${committeeId}-${crypto.randomUUID()}.pdf`;
}

function resourcePath(conferenceId: string): string {
	return `${conferenceId}/resources/${crypto.randomUUID()}.pdf`;
}

function avatarPath(userId: string): string {
	return `avatars/${userId}/${crypto.randomUUID()}.jpg`;
}

/** A published conference with one committee, two seats, and a delegate in the first seat. */
type SeatedDelegate = {
	organiser: ConferenceFixture;
	committeeId: string;
	seatId: string;
	otherSeatId: string;
	delegate: SignedInClient;
};

async function createSeatedDelegate(): Promise<SeatedDelegate> {
	const organiser = await createOpenConferenceOwnedByMe();
	const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
	const seatId = await addSeat(organiser.supabase, committeeId, 'France', 'FR');
	const otherSeatId = await addSeat(organiser.supabase, committeeId, 'Kenya', 'KE');
	const delegate = await createSignedInClient();

	await giveSeatTo(organiser.supabase, seatId, delegate.userId);

	return { organiser, committeeId, seatId, otherSeatId, delegate };
}

/** A paper's `documents` row, as the position paper page writes it, pointing at `path`. */
function paperRow(fixture: SeatedDelegate, path: string) {
	return {
		conference_id: fixture.organiser.conferenceId,
		committee_id: fixture.committeeId,
		seat_id: fixture.seatId,
		uploaded_by: fixture.delegate.userId,
		kind: 'position_paper',
		title: 'Fixture position paper',
		storage_path: path,
		file_name: 'position-paper.pdf',
		file_size_bytes: TINY_PDF_BYTES.length,
		mime_type: 'application/pdf',
		// A paper always has a status (documents_position_paper_has_review_status).
		review_status: 'submitted'
	};
}

/**
 * Uploads a position paper and writes its row, both as the seated delegate,
 * the way the position paper page does. Throws rather than returning an error,
 * so that a test about what may happen to the file next cannot pass because
 * the file was never there.
 */
async function uploadPositionPaper(
	fixture: SeatedDelegate
): Promise<{ path: string; documentId: string }> {
	const path = positionPaperPath(fixture.organiser.conferenceId, fixture.seatId);

	const { error: uploadError } = await fixture.delegate.supabase.storage
		.from(DOCUMENTS)
		.upload(path, tinyPdf());

	if (uploadError) {
		throw new Error(`Could not upload the fixture position paper: ${uploadError.message}`);
	}

	const { data, error } = await fixture.delegate.supabase
		.from('documents')
		.insert(paperRow(fixture, path))
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not create the fixture document row: ${error?.message}`);
	}

	return { path, documentId: data.id };
}

/** Signs up a new person, makes them a chair of the committee, and has them approve the paper. */
async function approveAsChair(
	fixture: SeatedDelegate,
	documentId: string
): Promise<SignedInClient> {
	const chair = await createSignedInClient('Chen Wei');

	await addChair(fixture.organiser.supabase, fixture.committeeId, chair.userId);

	const { error } = await chair.supabase
		.from('documents')
		.update({
			review_status: 'approved',
			review_comment: 'Clear and well sourced.',
			reviewed_by: chair.userId,
			reviewed_at: new Date().toISOString()
		})
		.eq('id', documentId);

	if (error) {
		throw new Error(`Could not approve the fixture paper: ${error.message}`);
	}

	return chair;
}

/** Moves the conference's position paper deadline to yesterday, through the organiser. */
async function closePositionPaperDeadline(fixture: ConferenceFixture): Promise<void> {
	const yesterday = new Date(Date.now() - ONE_DAY_IN_MILLISECONDS).toISOString();

	const { error } = await fixture.supabase
		.from('conferences')
		.update({ position_paper_deadline: yesterday })
		.eq('id', fixture.conferenceId);

	if (error) {
		throw new Error(`Could not close the fixture deadline: ${error.message}`);
	}
}

/** Whether a file is in the bucket at this path, as the service role sees it. */
async function isInBucket(bucket: string, path: string): Promise<boolean> {
	const folder = path.slice(0, path.lastIndexOf('/'));
	const fileName = path.slice(path.lastIndexOf('/') + 1);

	const { data, error } = await createServiceRoleClient()
		.storage.from(bucket)
		.list(folder, { search: fileName });

	if (error) {
		throw new Error(`Could not look into the bucket: ${error.message}`);
	}

	return (data ?? []).some((file) => file.name === fileName);
}

/** The two cleanup queues, by table and the column that holds the path. */
type Queue =
	| { table: 'public_media_cleanup'; column: 'path'; bucket: typeof PUBLIC_MEDIA }
	| { table: 'orphaned_document_files'; column: 'storage_path'; bucket: typeof DOCUMENTS };

const PUBLIC_MEDIA_QUEUE: Queue = {
	table: 'public_media_cleanup',
	column: 'path',
	bucket: PUBLIC_MEDIA
};
const DOCUMENTS_QUEUE: Queue = {
	table: 'orphaned_document_files',
	column: 'storage_path',
	bucket: DOCUMENTS
};

/**
 * Whether the path is waiting in the queue, or has already been swept out of
 * the bucket. Several test files run at once and any of them emptying a seat
 * drains both queues, so a test cannot insist the row is still there; a file
 * that is gone was queued just the same.
 */
async function wasQueued(queue: Queue, path: string): Promise<boolean> {
	const { data, error } = await createServiceRoleClient()
		.from(queue.table)
		.select(queue.column)
		.eq(queue.column, path);

	if (error) {
		throw new Error(`Could not read ${queue.table}: ${error.message}`);
	}

	if ((data ?? []).length > 0) {
		return true;
	}

	return !(await isInBucket(queue.bucket, path));
}

/** Uploads a picture to the person's own avatar folder and points their profile at it. */
async function setAvatar(person: SignedInClient): Promise<string> {
	const path = avatarPath(person.userId);

	const { error: uploadError } = await person.supabase.storage
		.from(PUBLIC_MEDIA)
		.upload(path, tinyImage());

	if (uploadError) {
		throw new Error(`Could not upload the fixture avatar: ${uploadError.message}`);
	}

	const { error } = await person.supabase
		.from('profiles')
		.update({ avatar_path: path })
		.eq('id', person.userId);

	if (error) {
		throw new Error(`Could not point the profile at the avatar: ${error.message}`);
	}

	return path;
}

describe('M3: the file of a position paper a chair has reviewed', () => {
	it('cannot be overwritten by the delegate once it is approved', async () => {
		const fixture = await createSeatedDelegate();
		const { path, documentId } = await uploadPositionPaper(fixture);
		await approveAsChair(fixture, documentId);

		// `upsert` on a path that already holds a file is an update of the
		// `storage.objects` row, which the update policy decides. Being the
		// uploader is no longer enough in the position-papers folder.
		const { error } = await fixture.delegate.supabase.storage
			.from(DOCUMENTS)
			.upload(path, tinyPdf(), { upsert: true });

		expect(error).not.toBeNull();
	});

	it('cannot be overwritten by the delegate even while it is still unreviewed', async () => {
		const fixture = await createSeatedDelegate();
		const { path } = await uploadPositionPaper(fixture);

		const { error } = await fixture.delegate.supabase.storage
			.from(DOCUMENTS)
			.upload(path, tinyPdf(), { upsert: true });

		expect(error).not.toBeNull();
	});

	it('cannot be deleted by the delegate once it is approved', async () => {
		const fixture = await createSeatedDelegate();
		const { path, documentId } = await uploadPositionPaper(fixture);
		await approveAsChair(fixture, documentId);

		// A remove that matched no row is an empty list rather than an error,
		// which is how Storage answers a delete nobody was allowed to make.
		const { data } = await fixture.delegate.supabase.storage.from(DOCUMENTS).remove([path]);

		expect(data ?? []).toEqual([]);
		expect(await isInBucket(DOCUMENTS, path)).toBe(true);
	});

	it('cannot be deleted by the delegate after the deadline, even while unreviewed', async () => {
		const fixture = await createSeatedDelegate();
		const { path } = await uploadPositionPaper(fixture);
		await closePositionPaperDeadline(fixture.organiser);

		const { data } = await fixture.delegate.supabase.storage.from(DOCUMENTS).remove([path]);

		expect(data ?? []).toEqual([]);
		expect(await isInBucket(DOCUMENTS, path)).toBe(true);
	});

	it('can still be deleted by the delegate while unreviewed and before the deadline', async () => {
		const fixture = await createSeatedDelegate();
		const { path } = await uploadPositionPaper(fixture);

		const { data } = await fixture.delegate.supabase.storage.from(DOCUMENTS).remove([path]);

		expect(data).toHaveLength(1);
	});

	it('cannot be uploaded again at a path a documents row already points at', async () => {
		const fixture = await createSeatedDelegate();
		const { path } = await uploadPositionPaper(fixture);

		// The service role takes the object away while the row keeps pointing at
		// its path: the state a delete-and-reinsert would need, which nobody
		// signed in can reach. The insert policy has to refuse the path anyway.
		const { error: arrangeError } = await createServiceRoleClient()
			.storage.from(DOCUMENTS)
			.remove([path]);
		expect(arrangeError).toBeNull();

		const { error } = await fixture.delegate.supabase.storage
			.from(DOCUMENTS)
			.upload(path, tinyPdf());

		expect(error).not.toBeNull();
	});

	it("still lets a chair of the seat's committee remove the file", async () => {
		const fixture = await createSeatedDelegate();
		const { path, documentId } = await uploadPositionPaper(fixture);
		const chair = await approveAsChair(fixture, documentId);

		const { data } = await chair.supabase.storage.from(DOCUMENTS).remove([path]);

		expect(data).toHaveLength(1);
	});
});

describe("L59: a documents row names a file in its own conference's folder for its kind", () => {
	it("refuses a position paper pointing at another seat's file name", async () => {
		const fixture = await createSeatedDelegate();
		const wrongPath = positionPaperPath(fixture.organiser.conferenceId, fixture.otherSeatId);

		const { error } = await fixture.delegate.supabase
			.from('documents')
			.insert(paperRow(fixture, wrongPath));

		expect(error?.message).toContain('does not belong to this document');
	});

	it('refuses a position paper pointing into the background-guides folder', async () => {
		const fixture = await createSeatedDelegate();
		const wrongPath = backgroundGuidePath(fixture.organiser.conferenceId, fixture.committeeId);

		const { error } = await fixture.delegate.supabase
			.from('documents')
			.insert(paperRow(fixture, wrongPath));

		expect(error?.message).toContain('does not belong to this document');
	});

	it("refuses a resource pointing into another conference's folder", async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const elsewhere = await createOpenConferenceOwnedByMe();

		const { error } = await fixture.supabase.from('documents').insert({
			conference_id: fixture.conferenceId,
			uploaded_by: fixture.userId,
			kind: 'resource',
			title: 'Rules of procedure',
			storage_path: resourcePath(elsewhere.conferenceId),
			file_name: 'rules.pdf',
			file_size_bytes: TINY_PDF_BYTES.length,
			mime_type: 'application/pdf',
			audience: 'everyone'
		});

		expect(error?.message).toContain('does not belong to this document');
	});

	it("refuses a background guide pointing at another committee's file name", async () => {
		const fixture = await createSeatedDelegate();
		const otherCommitteeId = await addCommittee(
			fixture.organiser.supabase,
			fixture.organiser.conferenceId,
			'General Assembly'
		);

		const { error } = await fixture.organiser.supabase.from('documents').insert({
			conference_id: fixture.organiser.conferenceId,
			committee_id: fixture.committeeId,
			uploaded_by: fixture.organiser.userId,
			kind: 'background_guide',
			title: 'Background guide',
			storage_path: backgroundGuidePath(fixture.organiser.conferenceId, otherCommitteeId),
			file_name: 'guide.pdf',
			file_size_bytes: TINY_PDF_BYTES.length,
			mime_type: 'application/pdf',
			audience: 'everyone'
		});

		expect(error?.message).toContain('does not belong to this document');
	});

	it('accepts a resource at the path the app builds for it', async () => {
		const fixture = await createOpenConferenceOwnedByMe();

		const { error } = await fixture.supabase.from('documents').insert({
			conference_id: fixture.conferenceId,
			uploaded_by: fixture.userId,
			kind: 'resource',
			title: 'Rules of procedure',
			storage_path: resourcePath(fixture.conferenceId),
			file_name: 'rules.pdf',
			file_size_bytes: TINY_PDF_BYTES.length,
			mime_type: 'application/pdf',
			audience: 'everyone'
		});

		expect(error).toBeNull();
	});
});

describe('L60: the public-media bucket', () => {
	it('cannot be listed by a visitor with no session', async () => {
		const visitor = createVisitorClient();

		const root = await visitor.storage.from(PUBLIC_MEDIA).list('');
		const avatars = await visitor.storage.from(PUBLIC_MEDIA).list('avatars');

		expect(root.data ?? []).toEqual([]);
		expect(avatars.data ?? []).toEqual([]);
	});

	it("cannot be listed by a signed-in stranger looking into somebody else's folder", async () => {
		const owner = await createSignedInClient();
		const stranger = await createSignedInClient();
		await setAvatar(owner);

		const { data } = await stranger.supabase.storage
			.from(PUBLIC_MEDIA)
			.list(`avatars/${owner.userId}`);

		expect(data ?? []).toEqual([]);
	});

	it('still shows people their own folder', async () => {
		const owner = await createSignedInClient();
		const path = await setAvatar(owner);

		const { data, error } = await owner.supabase.storage
			.from(PUBLIC_MEDIA)
			.list(`avatars/${owner.userId}`);

		expect(error).toBeNull();
		expect((data ?? []).map((file) => file.name)).toContain(path.slice(path.lastIndexOf('/') + 1));
	});

	it('still serves a picture to anybody at its public address', async () => {
		const owner = await createSignedInClient();
		const path = await setAvatar(owner);

		// The address `publicMediaUrl` in src/lib/media.ts builds, which a browser
		// fetches with no session at all.
		const { publicUrl } = createVisitorClient().storage.from(PUBLIC_MEDIA).getPublicUrl(path).data;
		const response = await fetch(publicUrl);

		expect(response.status).toBe(200);
		expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
	});

	it("still lets an organiser copy the organisation's logo into a conference's folder", async () => {
		const fixture = await createConferenceOwnedByMe();
		const logoPath = `organizations/${fixture.organizationId}/logo-${crypto.randomUUID()}.jpg`;

		const { error: uploadError } = await fixture.supabase.storage
			.from(PUBLIC_MEDIA)
			.upload(logoPath, tinyImage());
		expect(uploadError).toBeNull();

		// `copyBrandingInto` in src/lib/server/creation.ts does exactly this when
		// a draft begins, and a copy needs to see its source.
		const { error } = await fixture.supabase.storage
			.from(PUBLIC_MEDIA)
			.copy(logoPath, `conferences/${fixture.conferenceId}/logo.jpg`);

		expect(error).toBeNull();
	});

	it("shows an organisation's folder to a plain member and hides it from a stranger", async () => {
		const fixture = await createConferenceOwnedByMe();
		const member = await createSignedInClient();
		const stranger = await createSignedInClient();
		const logoPath = `organizations/${fixture.organizationId}/logo-${crypto.randomUUID()}.jpg`;

		const { error: uploadError } = await fixture.supabase.storage
			.from(PUBLIC_MEDIA)
			.upload(logoPath, tinyImage());
		expect(uploadError).toBeNull();

		// Any member may begin a conference draft, so any member's copy of the
		// organisation's logo into that draft has to find its source.
		await addOrganizationMember(fixture.organizationId, member.userId, 'member');

		const folder = `organizations/${fixture.organizationId}`;
		const asMember = await member.supabase.storage.from(PUBLIC_MEDIA).list(folder);
		const asStranger = await stranger.supabase.storage.from(PUBLIC_MEDIA).list(folder);

		expect((asMember.data ?? []).map((file) => file.name)).toContain(
			logoPath.slice(logoPath.lastIndexOf('/') + 1)
		);
		expect(asStranger.data ?? []).toEqual([]);
	});

	it("hides a draft conference's pictures from everybody but its organisers", async () => {
		const fixture = await createConferenceOwnedByMe();
		const stranger = await createSignedInClient();
		const bannerPath = `conferences/${fixture.conferenceId}/banner-${crypto.randomUUID()}.jpg`;

		const { error: uploadError } = await fixture.supabase.storage
			.from(PUBLIC_MEDIA)
			.upload(bannerPath, tinyImage());
		expect(uploadError).toBeNull();

		const folder = `conferences/${fixture.conferenceId}`;
		const asOrganiser = await fixture.supabase.storage.from(PUBLIC_MEDIA).list(folder);
		const asStranger = await stranger.supabase.storage.from(PUBLIC_MEDIA).list(folder);
		const asVisitor = await createVisitorClient().storage.from(PUBLIC_MEDIA).list(folder);

		expect((asOrganiser.data ?? []).length).toBe(1);
		expect(asStranger.data ?? []).toEqual([]);
		expect(asVisitor.data ?? []).toEqual([]);
	});
});

describe('L62: the storage helper functions', () => {
	const HELPERS = [
		'may_write_public_media',
		'may_upload_conference_document',
		'may_change_conference_document'
	];

	for (const helper of HELPERS) {
		it(`refuse a visitor with no session calling ${helper}`, async () => {
			const { error } = await createVisitorClient().rpc(helper, {
				object_name: 'avatars/00000000-0000-4000-8000-000000000000/picture.jpg'
			});

			expect(error).not.toBeNull();
		});
	}

	it('still answer somebody signed in', async () => {
		const { supabase, userId } = await createSignedInClient();

		const { data, error } = await supabase.rpc('may_write_public_media', {
			object_name: avatarPath(userId)
		});

		expect(error).toBeNull();
		expect(data).toBe(true);
	});
});

describe('L61, L63, L64: replaced and abandoned files are queued for the sweep', () => {
	it('queues the picture a new avatar replaces', async () => {
		const owner = await createSignedInClient();
		const oldPath = await setAvatar(owner);

		await setAvatar(owner);

		expect(await wasQueued(PUBLIC_MEDIA_QUEUE, oldPath)).toBe(true);
	});

	it('queues the avatar of an account that is deleted', async () => {
		const owner = await createSignedInClient();
		const path = await setAvatar(owner);

		const { error } = await owner.supabase.rpc('delete_my_account');
		expect(error).toBeNull();

		expect(await wasQueued(PUBLIC_MEDIA_QUEUE, path)).toBe(true);
	});

	it('queues the logo a new organisation logo replaces', async () => {
		const fixture = await createConferenceOwnedByMe();
		const paths = [1, 2].map(
			() => `organizations/${fixture.organizationId}/logo-${crypto.randomUUID()}.jpg`
		);

		for (const path of paths) {
			const { error: uploadError } = await fixture.supabase.storage
				.from(PUBLIC_MEDIA)
				.upload(path, tinyImage());
			expect(uploadError).toBeNull();

			const { error } = await fixture.supabase
				.from('organizations')
				.update({ logo_path: path })
				.eq('id', fixture.organizationId);
			expect(error).toBeNull();
		}

		expect(await wasQueued(PUBLIC_MEDIA_QUEUE, paths[0])).toBe(true);
	});

	it('queues the banner a new conference banner replaces, and the pictures of a deleted draft', async () => {
		const fixture = await createConferenceOwnedByMe();
		const paths = [1, 2].map(
			() => `conferences/${fixture.conferenceId}/banner-${crypto.randomUUID()}.jpg`
		);

		for (const path of paths) {
			const { error: uploadError } = await fixture.supabase.storage
				.from(PUBLIC_MEDIA)
				.upload(path, tinyImage());
			expect(uploadError).toBeNull();

			const { error } = await fixture.supabase
				.from('conferences')
				.update({ banner_path: path })
				.eq('id', fixture.conferenceId);
			expect(error).toBeNull();
		}

		expect(await wasQueued(PUBLIC_MEDIA_QUEUE, paths[0])).toBe(true);

		// The fixture conference is a draft, which its organiser may delete.
		const { error: deleteError } = await fixture.supabase
			.from('conferences')
			.delete()
			.eq('id', fixture.conferenceId);
		expect(deleteError).toBeNull();

		expect(await wasQueued(PUBLIC_MEDIA_QUEUE, paths[1])).toBe(true);
	});

	it('queues the old file of a replaced position paper in orphaned_document_files', async () => {
		const fixture = await createSeatedDelegate();
		const { path: oldPath, documentId } = await uploadPositionPaper(fixture);
		const newPath = positionPaperPath(fixture.organiser.conferenceId, fixture.seatId);

		const { error: uploadError } = await fixture.delegate.supabase.storage
			.from(DOCUMENTS)
			.upload(newPath, tinyPdf());
		expect(uploadError).toBeNull();

		// The same write `uploadPositionPaper` in src/lib/server/position-papers.ts
		// makes: the new file, and the review back to "just submitted".
		const { error } = await fixture.delegate.supabase
			.from('documents')
			.update({
				storage_path: newPath,
				file_name: 'position-paper-2.pdf',
				file_size_bytes: TINY_PDF_BYTES.length,
				mime_type: 'application/pdf',
				body_markdown: null,
				review_status: 'submitted',
				review_comment: null,
				reviewed_by: null,
				reviewed_at: null
			})
			.eq('id', documentId);
		expect(error).toBeNull();

		expect(await wasQueued(DOCUMENTS_QUEUE, oldPath)).toBe(true);
	});

	it('the sweep removes a queued public-media file from the bucket', async () => {
		const owner = await createSignedInClient();
		const oldPath = await setAvatar(owner);
		await setAvatar(owner);

		await removeOrphanedDocumentFiles();

		expect(await isInBucket(PUBLIC_MEDIA, oldPath)).toBe(false);
	});

	it('the sweep leaves the picture a profile still points at', async () => {
		const owner = await createSignedInClient();
		const path = await setAvatar(owner);

		await removeOrphanedDocumentFiles();

		expect(await isInBucket(PUBLIC_MEDIA, path)).toBe(true);
	});

	it('keeps the public-media queue from everybody signed in and from visitors', async () => {
		const owner = await createSignedInClient();
		const path = await setAvatar(owner);

		const read = await owner.supabase.from('public_media_cleanup').select('path');
		expect(read.data).toBeNull();
		expect(read.error).not.toBeNull();

		const written = await owner.supabase.from('public_media_cleanup').insert({ path });
		expect(written.error).not.toBeNull();

		const asVisitor = await createVisitorClient().from('public_media_cleanup').select('path');
		expect(asVisitor.data).toBeNull();
		expect(asVisitor.error).not.toBeNull();
	});
});

describe("I22: a picture's path stays in its owner's folder", () => {
	it("refuses an avatar path in another person's folder", async () => {
		const owner = await createSignedInClient();

		const { error } = await owner.supabase
			.from('profiles')
			.update({ avatar_path: avatarPath(crypto.randomUUID()) })
			.eq('id', owner.userId);

		expect(error?.message).toContain('profiles_avatar_path_in_own_folder');
	});

	it("refuses an organisation logo path in another organisation's folder", async () => {
		const fixture = await createConferenceOwnedByMe();

		const { error } = await fixture.supabase
			.from('organizations')
			.update({ logo_path: `organizations/${crypto.randomUUID()}/logo.png` })
			.eq('id', fixture.organizationId);

		expect(error?.message).toContain('organizations_logo_path_in_own_folder');
	});

	it("refuses a conference banner or logo path in another conference's folder", async () => {
		const fixture = await createConferenceOwnedByMe();

		const banner = await fixture.supabase
			.from('conferences')
			.update({ banner_path: `conferences/${crypto.randomUUID()}/banner.jpg` })
			.eq('id', fixture.conferenceId);
		expect(banner.error?.message).toContain('conferences_banner_path_in_own_folder');

		const logo = await fixture.supabase
			.from('conferences')
			.update({ logo_path: `organizations/${fixture.organizationId}/logo.png` })
			.eq('id', fixture.conferenceId);
		expect(logo.error?.message).toContain('conferences_logo_path_in_own_folder');
	});

	it('accepts the paths the app builds, and null', async () => {
		const fixture = await createConferenceOwnedByMe();

		const { error } = await fixture.supabase
			.from('conferences')
			.update({
				banner_path: `conferences/${fixture.conferenceId}/banner-${crypto.randomUUID()}.jpg`,
				logo_path: `conferences/${fixture.conferenceId}/logo.png`
			})
			.eq('id', fixture.conferenceId);
		expect(error).toBeNull();

		const cleared = await fixture.supabase
			.from('conferences')
			.update({ banner_path: null, logo_path: null })
			.eq('id', fixture.conferenceId);
		expect(cleared.error).toBeNull();
	});
});

/** Takes every role a person holds on the conference away, through the organiser's client. */
async function takeRolesFrom(fixture: ConferenceFixture, userId: string): Promise<void> {
	const { error } = await fixture.supabase
		.from('conference_role_members')
		.delete()
		.eq('conference_id', fixture.conferenceId)
		.eq('user_id', userId);

	if (error) throw new Error(`Could not take the fixture role away: ${error.message}`);
}

/** Uploads a file and writes its `documents` row, both through `uploader`'s client, as the documents page does. */
async function uploadDocumentFile(
	uploader: SignedInClient,
	row: Record<string, unknown> & { storage_path: string }
): Promise<void> {
	const { error: uploadError } = await uploader.supabase.storage
		.from(DOCUMENTS)
		.upload(row.storage_path, tinyPdf());

	if (uploadError) {
		throw new Error(`Could not upload the fixture file: ${uploadError.message}`);
	}

	const { error } = await uploader.supabase.from('documents').insert(row);

	if (error) {
		throw new Error(`Could not create the fixture document row: ${error.message}`);
	}
}

describe("L50: a guide's or a resource's file follows a permission, not its uploader", () => {
	it('a chair who uploaded the background guide can neither remove nor move its file once the Chair role is gone', async () => {
		const fixture = await createSeatedDelegate();
		const chair = await createSignedInClient('Chen Wei');
		await addChair(fixture.organiser.supabase, fixture.committeeId, chair.userId);
		const guidePath = backgroundGuidePath(fixture.organiser.conferenceId, fixture.committeeId);
		await uploadDocumentFile(chair, {
			conference_id: fixture.organiser.conferenceId,
			committee_id: fixture.committeeId,
			uploaded_by: chair.userId,
			kind: 'background_guide',
			title: 'Background guide',
			storage_path: guidePath,
			file_name: 'background-guide.pdf',
			file_size_bytes: TINY_PDF_BYTES.length,
			mime_type: 'application/pdf',
			audience: 'everyone'
		});

		// The former chair keeps a seat in the committee, so they still read the
		// guide's row, and through it the file: the removal below is refused by
		// the delete policy, not by a file they cannot see. The seat also gives
		// them a position paper path they may upload to, and moving the guide
		// there is refused too.
		await takeRolesFrom(fixture.organiser, chair.userId);
		await giveSeatTo(fixture.organiser.supabase, fixture.otherSeatId, chair.userId);

		const { error: moveError } = await chair.supabase.storage
			.from(DOCUMENTS)
			.move(guidePath, positionPaperPath(fixture.organiser.conferenceId, fixture.otherSeatId));
		const { data: removed } = await chair.supabase.storage.from(DOCUMENTS).remove([guidePath]);

		expect(moveError).not.toBeNull();
		expect(removed).toEqual([]);
		expect(await isInBucket(DOCUMENTS, guidePath)).toBe(true);
	});

	it('a document manager who uploaded a resource cannot remove its file without the permission, and the administrator still can', async () => {
		const fixture = await createConferenceOwnedByMe();
		const manager = await createSignedInClient('Document Manager');
		const roleId = await addRole(fixture.supabase, fixture.conferenceId, {
			name: 'Documents',
			permissions: ['manage_documents']
		});
		await giveRole(fixture.supabase, fixture.conferenceId, manager.userId, roleId);
		const path = resourcePath(fixture.conferenceId);
		// A staff file, so that the manager, who stays on the team when the role
		// goes, can still see it, and the refusal is the delete policy's.
		await uploadDocumentFile(manager, {
			conference_id: fixture.conferenceId,
			uploaded_by: manager.userId,
			kind: 'resource',
			title: 'Rules of procedure',
			storage_path: path,
			file_name: 'rules.pdf',
			file_size_bytes: TINY_PDF_BYTES.length,
			mime_type: 'application/pdf',
			audience: 'staff'
		});

		await takeRolesFrom(fixture, manager.userId);

		const { data: removedByManager } = await manager.supabase.storage
			.from(DOCUMENTS)
			.remove([path]);
		expect(removedByManager).toEqual([]);
		expect(await isInBucket(DOCUMENTS, path)).toBe(true);

		const { data: removedByAdministrator } = await fixture.supabase.storage
			.from(DOCUMENTS)
			.remove([path]);
		expect(removedByAdministrator?.map((file) => file.name)).toEqual([path]);
		expect(await isInBucket(DOCUMENTS, path)).toBe(false);
	});
});
