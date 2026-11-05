/**
 * The `documents` Storage bucket: putting a file in, taking one out, and the
 * one-minute signed links every download goes through.
 *
 * Files under `$lib/server` only ever run on the server. Every function takes
 * the signed-in person's Supabase client, so the bucket's own policies
 * (`specs/02-architecture/storage.md`) decide what each of them may do. The
 * `documents` rows that say what each file is live in the modules that use
 * this one: `./documents.ts`, `./resources.ts`, `./position-papers.ts` and
 * `./paper-reviews.ts`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { leadingBytesMatchType, SIGNATURE_BYTES } from '$lib/file-signatures';

/**
 * The Storage bucket every uploaded document lives in.
 *
 * It is private, unlike the `public-media` bucket the pictures are in: nothing
 * in it has an address anybody can open, which is why reading a file out of it
 * needs the signed link `createDownloadLink` below asks for.
 */
export const DOCUMENTS_BUCKET = 'documents';

/**
 * How long a download link is good for.
 *
 * `specs/02-architecture/storage.md` asks for sixty seconds: a link is valid
 * for one minute, and it is only ever made for somebody whose select policy on
 * the row already let them read it. Keeping it short means a link copied out of
 * the page and passed on is of no use to whoever it is passed to.
 */
export const DOWNLOAD_LINK_SECONDS = 60;

/**
 * A link that opens one file for the next minute, or `null` when Storage would
 * not make one.
 *
 * The link always downloads the file rather than showing it in the browser
 * (`download`), because the bytes come from the Supabase origin and a PDF or
 * an image drawn there in the tab is a page we never wrote. With `fileName`
 * the download is saved under the name the uploader gave it rather than the
 * uuid the bucket knows it by.
 *
 * A failure here is deliberately not an error. The row has already been read,
 * so a page can still say what the file is called and how big it is; it shows
 * the file without a download link rather than turning the whole page into an
 * error about a link.
 */
export async function createDownloadLink(
	supabase: SupabaseClient,
	storagePath: string,
	fileName?: string
): Promise<string | null> {
	const { data, error } = await supabase.storage
		.from(DOCUMENTS_BUCKET)
		.createSignedUrl(storagePath, DOWNLOAD_LINK_SECONDS, { download: fileName ?? true });

	if (error || !data) {
		return null;
	}

	return data.signedUrl;
}

/**
 * One-minute links for several files at once, by storage path, each one a
 * download like `createDownloadLink`'s. A path Storage would not sign is
 * missing from the map, and the caller shows that file without a link, for
 * the reason `createDownloadLink` gives.
 *
 * It is one request rather than one per file, because a list page signs every
 * file it shows.
 */
export async function createDownloadLinks(
	supabase: SupabaseClient,
	storagePaths: string[]
): Promise<Map<string, string>> {
	const links = new Map<string, string>();

	if (storagePaths.length === 0) {
		return links;
	}

	const { data, error } = await supabase.storage
		.from(DOCUMENTS_BUCKET)
		.createSignedUrls(storagePaths, DOWNLOAD_LINK_SECONDS, { download: true });

	if (error || !data) {
		return links;
	}

	for (const signed of data) {
		if (signed.path && signed.signedUrl && !signed.error) {
			links.set(signed.path, signed.signedUrl);
		}
	}

	return links;
}

/**
 * The first bytes of a file, as many as a type's signature needs.
 *
 * `File.slice` reads only that much, so a twenty-megabyte upload is not read
 * into memory to look at its first twelve bytes.
 */
async function readLeadingBytes(file: File): Promise<Uint8Array> {
	return new Uint8Array(await file.slice(0, SIGNATURE_BYTES).arrayBuffer());
}

/**
 * Put a file in the bucket at a path the server chose. Throws when the file is
 * not what it says it is, or when Storage refuses it, because nothing may be
 * written about a file that is not there.
 *
 * The type a browser sends comes from the file's name, so every check before
 * this one (`isAllowedFile`, `pdfFileProblem`) has believed the name. The
 * bytes are read here, once, before anything leaves the server: a Word
 * document called `paper.pdf` is refused rather than stored as a PDF.
 */
export async function uploadDocumentObject(
	supabase: SupabaseClient,
	storagePath: string,
	file: File
): Promise<void> {
	if (!leadingBytesMatchType(await readLeadingBytes(file), file.type)) {
		throw new Error(`Could not upload the file: its contents are not a ${file.type} file`);
	}

	const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).upload(storagePath, file, {
		contentType: file.type
	});

	if (error) {
		throw new Error(`Could not upload the file: ${error.message}`);
	}
}

/**
 * Take an object out of the bucket.
 *
 * Whatever goes wrong here is deliberately swallowed. By the time this is
 * called the row already points at a new file, or has gone altogether, so an
 * object nobody points at is a smaller problem than telling somebody their
 * change did not happen when it did. `specs/02-architecture/storage.md` says so
 * in as many words.
 *
 * It is for guides and resources, whose managers may still see a file no row
 * points at (migration 20260923120000). A position paper's file is hidden
 * from everybody once its row has moved on, so a delegate's call here would
 * remove nothing; the database queues it for the service-role sweep instead
 * (`./orphaned-document-files.ts`).
 */
export async function deleteDocumentObject(
	supabase: SupabaseClient,
	storagePath: string
): Promise<void> {
	await supabase.storage.from(DOCUMENTS_BUCKET).remove([storagePath]);
}
