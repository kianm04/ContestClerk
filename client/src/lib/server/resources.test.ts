import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listBackgroundGuides } from './documents';
import { deleteDocument, listResources, updateDocumentAudience, uploadResource } from './resources';

// These tests are about the decisions this module makes: what it reads, the
// order it uploads a file and writes its row in, and what it cleans up when
// the row is refused. The stand-in below records every query and answers each
// relation with fixed rows, without filtering them. Whether the database lets
// somebody write those rows is Row Level Security's decision, tested in `tests/db/`.
//
// `listBackgroundGuides` lives in `./documents.ts`, whose own tests use a
// stand-in that answers every table with the same rows. How it pairs each
// committee with its guide is tested here, with the stand-in that answers per
// relation.

/** What one query the module sent was asking for. */
type RecordedQuery = {
	table: string;
	inserted: Record<string, unknown> | null;
	updated: Record<string, unknown> | null;
	isDelete: boolean;
	/** Every filter, as `[method, column, value]`, in the order it was added. */
	filters: [string, string, unknown][];
};

/** What the stand-in answers with. */
type StandInAnswers = {
	/** The rows each relation gives back, whatever the filters say. */
	rows?: Record<string, unknown[]>;
	/** The message an insert fails with. Nothing means inserting works. */
	insertError?: string;
	/** The message an upload to the bucket fails with. Nothing means it works. */
	uploadError?: string;
};

/** A Supabase client that records queries and bucket calls, answering from `answers`. */
function makeStandIn(answers: StandInAnswers = {}) {
	const queries: RecordedQuery[] = [];
	const storage = { uploaded: [] as string[], removed: [] as string[] };

	function from(table: string) {
		const query: RecordedQuery = {
			table,
			inserted: null,
			updated: null,
			isDelete: false,
			filters: []
		};
		queries.push(query);

		function answer() {
			if (query.inserted && answers.insertError) {
				return Promise.resolve({ data: null, error: { message: answers.insertError } });
			}

			return Promise.resolve({ data: answers.rows?.[table] ?? [], error: null });
		}

		// Every step hands the builder back, which is what lets the module chain
		// them. `then` lets a bare `await` on the chain work, the way an insert does.
		const builder = {
			select: () => builder,
			order: () => builder,
			insert: (row: Record<string, unknown>) => {
				query.inserted = row;
				return builder;
			},
			update: (row: Record<string, unknown>) => {
				query.updated = row;
				return builder;
			},
			delete: () => {
				query.isDelete = true;
				return builder;
			},
			eq: (column: string, value: unknown) => filter('eq', column, value),
			in: (column: string, value: unknown) => filter('in', column, value),
			overrideTypes: answer,
			then: (resolve: (value: unknown) => void) => answer().then(resolve)
		};

		function filter(method: string, column: string, value: unknown) {
			query.filters.push([method, column, value]);
			return builder;
		}

		return builder;
	}

	const bucket = {
		createSignedUrls: (paths: string[]) =>
			Promise.resolve({
				data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}`, error: null })),
				error: null
			}),
		upload: (path: string) => {
			storage.uploaded.push(path);
			const error = answers.uploadError ? { message: answers.uploadError } : null;
			return Promise.resolve({ error });
		},
		remove: (paths: string[]) => {
			storage.removed.push(...paths);
			return Promise.resolve({ error: null });
		}
	};

	const supabase = { from, storage: { from: () => bucket } } as unknown as SupabaseClient;

	return { supabase, queries, storage };
}

/** A small PDF, as the form would send it. */
function makePdf(): File {
	return new File(['%PDF-1.7'], 'Rules of Procedure.pdf', { type: 'application/pdf' });
}

describe('listResources', () => {
	it('gives each resource its uploader name and a one-minute link', async () => {
		const { supabase, queries } = makeStandIn({
			rows: {
				documents: [
					{
						id: 'resource-1',
						title: 'Rules of Procedure',
						file_name: 'rop.pdf',
						file_size_bytes: 1200,
						mime_type: 'application/pdf',
						audience: 'everyone',
						created_at: '2027-01-02T10:00:00Z',
						uploaded_by: 'user-1',
						storage_path: 'conference-1/resources/a.pdf'
					}
				],
				profiles: [{ id: 'user-1', full_name: 'Sara Lindqvist' }]
			}
		});

		const resources = await listResources(supabase, 'conference-1');

		expect(resources).toEqual([
			{
				id: 'resource-1',
				title: 'Rules of Procedure',
				fileName: 'rop.pdf',
				fileSizeBytes: 1200,
				mimeType: 'application/pdf',
				audience: 'everyone',
				createdAt: '2027-01-02T10:00:00Z',
				uploaderName: 'Sara Lindqvist',
				downloadUrl: 'https://signed/conference-1/resources/a.pdf'
			}
		]);
		expect(queries[0].filters).toContainEqual(['eq', 'kind', 'resource']);
	});
});

describe('uploadResource', () => {
	const resource = {
		conferenceId: 'conference-1',
		uploadedBy: 'user-1',
		title: 'Rules of Procedure',
		file: makePdf(),
		audience: 'everyone' as const
	};

	it('uploads the file under the conference, then writes the row that points at it', async () => {
		const { supabase, queries, storage } = makeStandIn();

		await uploadResource(supabase, resource);

		expect(storage.uploaded).toHaveLength(1);
		expect(storage.uploaded[0]).toMatch(/^conference-1\/resources\/[\w-]+\.pdf$/);
		expect(queries[0].inserted).toMatchObject({
			kind: 'resource',
			title: 'Rules of Procedure',
			audience: 'everyone',
			storage_path: storage.uploaded[0],
			file_name: 'Rules of Procedure.pdf',
			mime_type: 'application/pdf'
		});
	});

	it('writes no row when the upload fails', async () => {
		const { supabase, queries } = makeStandIn({ uploadError: 'bucket full' });

		await expect(uploadResource(supabase, resource)).rejects.toThrow('bucket full');
		expect(queries).toEqual([]);
	});

	it('takes the file out again when the row is refused', async () => {
		const { supabase, storage } = makeStandIn({ insertError: 'permission denied' });

		await expect(uploadResource(supabase, resource)).rejects.toThrow('permission denied');
		expect(storage.removed).toEqual(storage.uploaded);
	});
});

describe('updateDocumentAudience', () => {
	it('changes only a resource of this conference', async () => {
		const { supabase, queries } = makeStandIn({ rows: { documents: [{ id: 'resource-1' }] } });

		expect(await updateDocumentAudience(supabase, 'conference-1', 'resource-1', 'staff')).toBe(
			true
		);
		expect(queries[0].updated).toEqual({ audience: 'staff' });
		expect(queries[0].filters).toEqual([
			['eq', 'id', 'resource-1'],
			['eq', 'conference_id', 'conference-1'],
			['eq', 'kind', 'resource']
		]);
	});

	it('answers false when nothing changed', async () => {
		const { supabase } = makeStandIn();

		expect(await updateDocumentAudience(supabase, 'conference-1', 'other', 'staff')).toBe(false);
	});
});

describe('deleteDocument', () => {
	it('deletes the row, then the object it pointed at', async () => {
		const { supabase, queries, storage } = makeStandIn({
			rows: { documents: [{ storage_path: 'conference-1/resources/a.pdf' }] }
		});

		expect(await deleteDocument(supabase, 'conference-1', 'resource-1')).toBe(true);
		expect(queries[0].isDelete).toBe(true);
		// A position paper is the delegate's own, so the organiser's delete never reaches one.
		expect(queries[0].filters).toContainEqual(['in', 'kind', ['resource', 'background_guide']]);
		expect(storage.removed).toEqual(['conference-1/resources/a.pdf']);
	});

	it('answers false and removes nothing when no row was deleted', async () => {
		const { supabase, storage } = makeStandIn();

		expect(await deleteDocument(supabase, 'conference-1', 'someone-elses')).toBe(false);
		expect(storage.removed).toEqual([]);
	});
});

describe('listBackgroundGuides', () => {
	it('gives every committee its guide or null, in the committees order', async () => {
		const { supabase } = makeStandIn({
			rows: {
				committees: [
					{ id: 'unsc', name: 'Security Council', abbreviation: 'UNSC' },
					{ id: 'who', name: 'World Health Organization', abbreviation: null }
				],
				documents: [
					{
						id: 'guide-1',
						title: 'UNSC background guide',
						file_name: 'unsc.pdf',
						file_size_bytes: 5000,
						audience: 'everyone',
						storage_path: 'conference-1/guides/unsc.pdf',
						committee_id: 'unsc'
					}
				]
			}
		});

		const guides = await listBackgroundGuides(supabase, 'conference-1');

		expect(guides).toEqual([
			{
				committeeId: 'unsc',
				committeeHeading: 'UNSC',
				guide: {
					id: 'guide-1',
					title: 'UNSC background guide',
					fileName: 'unsc.pdf',
					fileSizeBytes: 5000,
					audience: 'everyone',
					downloadUrl: 'https://signed/conference-1/guides/unsc.pdf'
				}
			},
			{ committeeId: 'who', committeeHeading: 'World Health Organization', guide: null }
		]);
	});
});
