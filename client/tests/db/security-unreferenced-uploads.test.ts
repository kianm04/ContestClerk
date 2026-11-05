import { describe, expect, it } from 'vitest';
import {
	addCommittee,
	addSeat,
	createConferenceOwnedByMe,
	createOpenConferenceOwnedByMe,
	giveSeatTo
} from './conference-fixtures';
import {
	createServiceRoleClient,
	createSignedInClient,
	type SignedInClient
} from './supabase-test-client';

// Uploads nobody saved, the half of finding L61 of the security review of 10
// October 2026 that migration 20261022162000_unreferenced_uploads.sql closes.
// A signed-in person could fill their own avatars folder, and a seated
// delegate the papers under their seat, with files no row ever pointed at, and
// nothing removed them.
//
// The SQL this file covers: `unreferenced_uploads`, `queue_unreferenced_uploads`,
// `upload_folder_has_room`, and the two upload policies that now ask it.
//
// Every refusal comes from an ordinary signed-in client against the real local
// Storage. The service role appears only to call the two sweep functions,
// which are its alone, to read the cleanup queues, and to upload a file
// without an owner the way the seed does.
//
// Several test files run at once and some of them empty both queues, so no
// test here asks for a queue to be empty or to keep a row.

const DOCUMENTS = 'documents';
const PUBLIC_MEDIA = 'public-media';

/** The most files a person's own folder holds, as the migration sets it. */
const MOST_FILES_IN_A_FOLDER = 5;

/** A moment long after anything here was uploaded, so `unreferenced_uploads` lists every file nobody saved. */
const LONG_AFTER_EVERY_UPLOAD = '2999-01-01T00:00:00Z';

/** What Storage answers when an insert policy turns an upload away. */
const REFUSED_BY_POLICY = /row-level security/;

/** A tiny file that counts as a JPEG, so the bucket's type limit lets it through. */
function tinyImage(): Blob {
	return new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xdb])], { type: 'image/jpeg' });
}

/** The four bytes every PDF starts with, "%PDF". */
function tinyPdf(): Blob {
	return new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], { type: 'application/pdf' });
}

function avatarPath(userId: string): string {
	return `avatars/${userId}/${crypto.randomUUID()}.jpg`;
}

function positionPaperPath(conferenceId: string, seatId: string): string {
	return `${conferenceId}/position-papers/${seatId}-${crypto.randomUUID()}.pdf`;
}

/** Uploads a picture into the person's own avatars folder and answers Storage's error, if any. */
async function uploadAvatarFile(person: SignedInClient, path = avatarPath(person.userId)) {
	const { error } = await person.supabase.storage.from(PUBLIC_MEDIA).upload(path, tinyImage());

	return { path, error };
}

/** Uploads a picture and throws if Storage refuses it, for the files a test needs to be there. */
async function uploadAvatarFileOrThrow(person: SignedInClient): Promise<string> {
	const { path, error } = await uploadAvatarFile(person);

	if (error) {
		throw new Error(`Could not upload the fixture picture: ${error.message}`);
	}

	return path;
}

/** Points the person's profile at a picture they uploaded, as the profile page does. */
async function pointProfileAt(person: SignedInClient, path: string): Promise<void> {
	const { error } = await person.supabase
		.from('profiles')
		.update({ avatar_path: path })
		.eq('id', person.userId);

	if (error) {
		throw new Error(`Could not point the profile at the picture: ${error.message}`);
	}
}

/** A published conference with a committee and a delegate in its one seat. */
async function createSeatedDelegate() {
	const organiser = await createOpenConferenceOwnedByMe();
	const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
	const seatId = await addSeat(organiser.supabase, committeeId, 'France', 'FR');
	const delegate = await createSignedInClient();

	await giveSeatTo(organiser.supabase, seatId, delegate.userId);

	return { organiser, committeeId, seatId, delegate };
}

/** Uploads a paper under the seat as its delegate, writing no row, and answers Storage's error. */
async function uploadPaperFile(fixture: Awaited<ReturnType<typeof createSeatedDelegate>>) {
	const path = positionPaperPath(fixture.organiser.conferenceId, fixture.seatId);
	const { error } = await fixture.delegate.supabase.storage.from(DOCUMENTS).upload(path, tinyPdf());

	return { path, error };
}

/** Which of these paths `unreferenced_uploads` lists for the moment given, or for its own default. */
async function listedAsUnreferenced(paths: string[], uploadedBefore?: string): Promise<string[]> {
	// Leaving `uploaded_before` out is how the sweep calls it, with the
	// database's own default of an hour ago.
	const args = uploadedBefore === undefined ? {} : { uploaded_before: uploadedBefore };
	const { data, error } = await createServiceRoleClient()
		.rpc('unreferenced_uploads', args)
		.in('name', paths);

	if (error) {
		throw new Error(`Could not list the unreferenced uploads: ${error.message}`);
	}

	return (data ?? []).map((row: { name: string }) => row.name).sort();
}

/** Which of these paths wait on either cleanup queue. */
async function queuedForRemoval(paths: string[]): Promise<string[]> {
	const serviceRole = createServiceRoleClient();
	const [documents, pictures] = await Promise.all([
		serviceRole.from('orphaned_document_files').select('storage_path').in('storage_path', paths),
		serviceRole.from('public_media_cleanup').select('path').in('path', paths)
	]);

	if (documents.error || pictures.error) {
		throw new Error('Could not read the cleanup queues');
	}

	return [
		...(documents.data ?? []).map((row) => row.storage_path),
		...(pictures.data ?? []).map((row) => row.path)
	].sort();
}

describe('the files nobody saved (L61): unreferenced_uploads and queue_unreferenced_uploads', () => {
	it('lists a picture and a paper no row points at, and not the ones a row does', async () => {
		const person = await createSignedInClient();
		const unsavedPicture = await uploadAvatarFileOrThrow(person);
		const savedPicture = await uploadAvatarFileOrThrow(person);
		await pointProfileAt(person, savedPicture);

		const fixture = await createSeatedDelegate();
		const { path: unsavedPaper, error } = await uploadPaperFile(fixture);
		expect(error).toBeNull();

		const listed = await listedAsUnreferenced(
			[unsavedPicture, savedPicture, unsavedPaper],
			LONG_AFTER_EVERY_UPLOAD
		);

		expect(listed).toEqual([unsavedPicture, unsavedPaper].sort());
	});

	it('leaves a file uploaded within the hour alone, because its row is written a moment later', async () => {
		const person = await createSignedInClient();
		const justUploaded = await uploadAvatarFileOrThrow(person);

		const { error } = await createServiceRoleClient().rpc('queue_unreferenced_uploads');

		expect(error).toBeNull();
		expect(await listedAsUnreferenced([justUploaded])).toEqual([]);
		expect(await queuedForRemoval([justUploaded])).toEqual([]);
	});

	it('leaves a file with no owner alone, the way the seed uploads its sample pictures', async () => {
		const serviceRole = createServiceRoleClient();
		const samplePath = `avatars/sample/${crypto.randomUUID()}.jpg`;
		const { error } = await serviceRole.storage.from(PUBLIC_MEDIA).upload(samplePath, tinyImage());
		expect(error).toBeNull();

		expect(await listedAsUnreferenced([samplePath], LONG_AFTER_EVERY_UPLOAD)).toEqual([]);

		await serviceRole.storage.from(PUBLIC_MEDIA).remove([samplePath]);
	});

	it('is the service role’s alone: a signed-in person may neither list nor queue', async () => {
		const person = await createSignedInClient();

		const listing = await person.supabase.rpc('unreferenced_uploads', {
			uploaded_before: LONG_AFTER_EVERY_UPLOAD
		});
		const queueing = await person.supabase.rpc('queue_unreferenced_uploads');

		expect(listing.error?.message).toMatch(/permission denied/);
		expect(queueing.error?.message).toMatch(/permission denied/);
	});
});

describe('a person’s own folders (L61): upload_folder_has_room and the two upload policies', () => {
	it('refuses a sixth picture nobody saved, and takes one again once a file is deleted', async () => {
		const person = await createSignedInClient();
		const uploaded: string[] = [];

		for (let count = 0; count < MOST_FILES_IN_A_FOLDER; count += 1) {
			uploaded.push(await uploadAvatarFileOrThrow(person));
		}

		expect((await uploadAvatarFile(person)).error?.message).toMatch(REFUSED_BY_POLICY);

		// A full folder still lets its owner delete, which is how they make room.
		const { error: removeError } = await person.supabase.storage
			.from(PUBLIC_MEDIA)
			.remove([uploaded[0]]);
		expect(removeError).toBeNull();

		expect((await uploadAvatarFile(person)).error).toBeNull();
	});

	it('does not count a replaced picture, which is already on its way out', async () => {
		const person = await createSignedInClient();
		const first = await uploadAvatarFileOrThrow(person);
		await pointProfileAt(person, first);
		const second = await uploadAvatarFileOrThrow(person);
		// The replacement trigger queues the first picture here.
		await pointProfileAt(person, second);

		// The second picture and four more make five; the first is not counted.
		for (let count = 1; count < MOST_FILES_IN_A_FOLDER; count += 1) {
			expect((await uploadAvatarFile(person)).error).toBeNull();
		}

		expect((await uploadAvatarFile(person)).error?.message).toMatch(REFUSED_BY_POLICY);
	});

	it('refuses a sixth paper nobody saved under one seat', async () => {
		const fixture = await createSeatedDelegate();

		for (let count = 0; count < MOST_FILES_IN_A_FOLDER; count += 1) {
			expect((await uploadPaperFile(fixture)).error).toBeNull();
		}

		expect((await uploadPaperFile(fixture)).error?.message).toMatch(REFUSED_BY_POLICY);
	});

	it('leaves the organisers’ folders without a limit', async () => {
		const organiser = await createConferenceOwnedByMe();

		for (let count = 0; count <= MOST_FILES_IN_A_FOLDER; count += 1) {
			const { error } = await organiser.supabase.storage
				.from(DOCUMENTS)
				.upload(`${organiser.conferenceId}/resources/${crypto.randomUUID()}.pdf`, tinyPdf());

			expect(error).toBeNull();
		}
	});

	it('answers for a folder whether it has room, and only true or false', async () => {
		const person = await createSignedInClient();

		const { data, error } = await person.supabase.rpc('upload_folder_has_room', {
			bucket: PUBLIC_MEDIA,
			object_name: avatarPath(person.userId)
		});

		expect(error).toBeNull();
		expect(data).toBe(true);
	});
});
