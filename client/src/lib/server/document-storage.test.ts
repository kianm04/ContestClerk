import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	createDownloadLink,
	createDownloadLinks,
	deleteDocumentObject,
	DOCUMENTS_BUCKET,
	DOWNLOAD_LINK_SECONDS,
	uploadDocumentObject
} from './document-storage';

// These tests are about what this module does with Storage's answers: which
// failures become `null` or a missing link, which one is thrown, and which is
// swallowed, and what it refuses before asking Storage at all. Whether the
// bucket's policies let somebody do any of it is tested in `tests/db/`.

/** What `createSignedUrl` and `createSignedUrls` are told besides the path. */
type SignOptions = { download?: string | boolean };

/** What the stand-in bucket answers, and what it was asked. */
type BucketCalls = {
	buckets: string[];
	signed: { path: string; seconds: number; options: SignOptions | undefined }[];
	uploaded: { path: string; contentType: string }[];
	removed: string[][];
};

/** Which of the bucket's answers fail. */
type BucketAnswers = {
	signError?: string;
	/** Paths `createSignedUrls` answers with an error of their own. */
	unsignablePaths?: string[];
	uploadError?: string;
};

/** A stand-in client whose `storage.from(...)` records every call. */
function createStandInStorage(answers: BucketAnswers = {}) {
	const calls: BucketCalls = { buckets: [], signed: [], uploaded: [], removed: [] };
	const signError = answers.signError ? { message: answers.signError } : null;

	const bucket = {
		createSignedUrl: async (path: string, seconds: number, options?: SignOptions) => {
			calls.signed.push({ path, seconds, options });
			return { data: signError ? null : { signedUrl: `https://signed/${path}` }, error: signError };
		},
		createSignedUrls: async (paths: string[], seconds: number, options?: SignOptions) => {
			for (const path of paths) {
				calls.signed.push({ path, seconds, options });
			}

			const unsignable = answers.unsignablePaths ?? [];
			const data = paths.map((path) => ({
				path,
				signedUrl: unsignable.includes(path) ? '' : `https://signed/${path}`,
				error: unsignable.includes(path) ? 'Object not found' : null
			}));

			return { data: signError ? null : data, error: signError };
		},
		upload: async (path: string, _file: File, options: { contentType: string }) => {
			calls.uploaded.push({ path, contentType: options.contentType });
			const error = answers.uploadError ? { message: answers.uploadError } : null;
			return { data: error ? null : { path }, error };
		},
		remove: async (paths: string[]) => {
			calls.removed.push(paths);
			return { data: null, error: { message: 'Storage is down' } };
		}
	};

	const storage = {
		from: (name: string) => {
			calls.buckets.push(name);
			return bucket;
		}
	};

	return { supabase: { storage } as unknown as SupabaseClient, calls };
}

describe('createDownloadLink', () => {
	it('signs one path in the documents bucket for one minute, as a download', async () => {
		const { supabase, calls } = createStandInStorage();

		const link = await createDownloadLink(supabase, 'conference-1/resources/a.pdf');

		expect(link).toBe('https://signed/conference-1/resources/a.pdf');
		expect(calls.buckets).toEqual([DOCUMENTS_BUCKET]);
		expect(calls.signed).toEqual([
			{
				path: 'conference-1/resources/a.pdf',
				seconds: DOWNLOAD_LINK_SECONDS,
				options: { download: true }
			}
		]);
		expect(DOWNLOAD_LINK_SECONDS).toBe(60);
	});

	it("names the download after the file when it is told the file's name", async () => {
		const { supabase, calls } = createStandInStorage();

		await createDownloadLink(supabase, 'conference-1/resources/a.pdf', 'Rules of procedure.pdf');

		expect(calls.signed[0].options).toEqual({ download: 'Rules of procedure.pdf' });
	});

	it('answers null rather than throwing when Storage will not sign', async () => {
		const { supabase } = createStandInStorage({ signError: 'Object not found' });

		expect(await createDownloadLink(supabase, 'gone.pdf')).toBeNull();
	});
});

describe('createDownloadLinks', () => {
	it('asks Storage for nothing when there are no paths', async () => {
		const { supabase, calls } = createStandInStorage();

		expect((await createDownloadLinks(supabase, [])).size).toBe(0);
		expect(calls.buckets).toEqual([]);
	});

	it('maps each signed path to its link and leaves out the ones that failed', async () => {
		const { supabase, calls } = createStandInStorage({ unsignablePaths: ['b.pdf'] });

		const links = await createDownloadLinks(supabase, ['a.pdf', 'b.pdf']);

		expect([...links.entries()]).toEqual([['a.pdf', 'https://signed/a.pdf']]);
		// Every link in a list is a download too.
		expect(calls.signed.map((call) => call.options)).toEqual([
			{ download: true },
			{ download: true }
		]);
	});

	it('answers an empty map when the whole request fails', async () => {
		const { supabase } = createStandInStorage({ signError: 'Storage is down' });

		expect((await createDownloadLinks(supabase, ['a.pdf'])).size).toBe(0);
	});
});

describe('uploadDocumentObject', () => {
	const pdf = new File(['%PDF-1.7\n%%EOF\n'], 'paper.pdf', { type: 'application/pdf' });

	it('uploads to the path it was given with the file type', async () => {
		const { supabase, calls } = createStandInStorage();

		await uploadDocumentObject(supabase, 'conference-1/position-papers/seat.pdf', pdf);

		expect(calls.uploaded).toEqual([
			{ path: 'conference-1/position-papers/seat.pdf', contentType: 'application/pdf' }
		]);
	});

	it('throws when Storage refuses, so no row is written about a missing file', async () => {
		const { supabase } = createStandInStorage({ uploadError: 'Payload too large' });

		await expect(uploadDocumentObject(supabase, 'a.pdf', pdf)).rejects.toThrow(
			'Could not upload the file: Payload too large'
		);
	});

	it('refuses a file whose bytes are not those of its declared type, before asking Storage', async () => {
		const { supabase, calls } = createStandInStorage();
		// A Word document somebody renamed to .pdf: a zip inside, "PK".
		const renamed = new File(['PK\u0003\u0004 not a pdf'], 'paper.pdf', {
			type: 'application/pdf'
		});

		await expect(uploadDocumentObject(supabase, 'a.pdf', renamed)).rejects.toThrow(
			'its contents are not a application/pdf file'
		);
		expect(calls.uploaded).toEqual([]);
	});

	it('accepts each of the types the bucket allows when the bytes agree', async () => {
		const { supabase, calls } = createStandInStorage();
		const files = [
			new File([new Uint8Array([0xff, 0xd8, 0xff, 0xdb])], 'a.jpg', { type: 'image/jpeg' }),
			new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'a.png', { type: 'image/png' }),
			new File(['RIFF\u0000\u0000\u0000\u0000WEBP'], 'a.webp', { type: 'image/webp' }),
			new File(['PK\u0003\u0004'], 'a.docx', {
				type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
			})
		];

		for (const file of files) {
			await uploadDocumentObject(supabase, `conference-1/resources/${file.name}`, file);
		}

		expect(calls.uploaded).toHaveLength(files.length);
	});

	it('refuses an empty file, which has no bytes to be anything', async () => {
		const { supabase, calls } = createStandInStorage();
		const empty = new File([], 'paper.pdf', { type: 'application/pdf' });

		await expect(uploadDocumentObject(supabase, 'a.pdf', empty)).rejects.toThrow(
			'Could not upload the file'
		);
		expect(calls.uploaded).toEqual([]);
	});
});

describe('deleteDocumentObject', () => {
	it('removes the object and swallows a failure', async () => {
		const { supabase, calls } = createStandInStorage();

		await expect(deleteDocumentObject(supabase, 'old.pdf')).resolves.toBeUndefined();
		expect(calls.removed).toEqual([['old.pdf']]);
	});
});
