import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	getMyPositionPaper,
	removePositionPaper,
	submitWrittenPaper,
	uploadPositionPaper,
	type NewPositionPaper,
	type NewWrittenPaper
} from './position-papers';

// These tests are about the decisions this module makes: which relation it
// reads a seat's own paper out of, the order it uploads a file and writes the
// row, that it leaves a replaced or removed file to the database's cleanup
// queue, and which columns it sends to a table whose trigger freezes half of
// them. Nothing here talks to a database or to a bucket; the stand-in below
// writes down what it was asked for and answers with fixed rows. Whether the
// database really lets somebody write those rows is Row Level Security's
// decision, and that is tested in `tests/db/`.

/** An error in the shape the real client reports one. */
type QueryError = { message: string };

/** What one query the module sent was asking for. */
type RecordedQuery = {
	/** The relation `.from(...)` named. */
	table: string;
	/** The row `.insert(...)` was given, or `null` when the query did not insert. */
	inserted: Record<string, unknown> | null;
	/** The row `.update(...)` was given, or `null` when the query did not update. */
	updated: Record<string, unknown> | null;
	/** Whether `.delete()` was called on this query. */
	isDelete: boolean;
	eq: [string, unknown][];
};

/** What the module asked Supabase Storage to do. */
type RecordedStorage = {
	uploaded: string[];
	removed: string[];
	/** `[path, seconds]` for every download link that was asked for. */
	signed: [string, number][];
};

/** What the stand-in should answer with. Everything here has a harmless default. */
type StandInAnswers = {
	/** The rows each relation gives back. A relation with no entry gives back none. */
	rows?: Record<string, unknown[]>;
	/** The relations whose read fails, and the message each fails with. */
	queryErrors?: Record<string, string>;
	/** The message an insert or an update on `documents` fails with. */
	writeError?: string;
	/** The rows a delete on `documents` says it removed. Nothing means it removed what was there. */
	deleted?: { storage_path: string | null }[];
	/** The message an upload to the bucket fails with. Nothing means it works. */
	uploadError?: string;
};

/** The end of a chain that asked for one row rather than a list. */
type SingleRowBuilder = {
	overrideTypes: () => Promise<{ data: unknown; error: QueryError | null }>;
};

/** One step of a query. Every step hands the builder back, so the next step can be called on it. */
type QueryBuilder = {
	select: (columns: string) => QueryBuilder;
	insert: (row: Record<string, unknown>) => QueryBuilder;
	update: (row: Record<string, unknown>) => QueryBuilder;
	delete: () => QueryBuilder;
	eq: (column: string, value: unknown) => QueryBuilder;
	maybeSingle: () => SingleRowBuilder;
	overrideTypes: () => Promise<{ data: unknown[] | null; error: QueryError | null }>;
	then: (resolve: (answer: { data: unknown[] | null; error: QueryError | null }) => void) => void;
};

/**
 * A stand-in Supabase client that writes down what was asked of it, with a
 * bucket beside its tables.
 *
 * Each relation answers from its own list in `answers.rows`, the way
 * `committees.test.ts`'s stand-in works, because this module reads four
 * different ones (`conferences_with_organization`, `committees`, `seats`,
 * `documents`) and a single shared list would not tell them apart. `maybeSingle`
 * answers with the first row of that relation, since every test here gives at
 * most one.
 */
function createStandInSupabase(answers: StandInAnswers = {}): {
	supabase: SupabaseClient;
	queries: RecordedQuery[];
	storage: RecordedStorage;
} {
	const queries: RecordedQuery[] = [];
	const storage: RecordedStorage = { uploaded: [], removed: [], signed: [] };

	function builderFor(table: string): QueryBuilder {
		const query: RecordedQuery = { table, inserted: null, updated: null, isDelete: false, eq: [] };
		queries.push(query);

		const rows = answers.rows?.[table] ?? [];

		function errorFor(): QueryError | null {
			const isWrite = query.inserted !== null || query.updated !== null;
			const message = isWrite ? answers.writeError : answers.queryErrors?.[table];

			return message ? { message } : null;
		}

		// A delete on `documents` asks for the rows it removed with
		// `.select('storage_path')`, and Row Level Security refusing one shows up
		// as an empty list, the way `removeBackgroundGuide`'s test in
		// `documents.test.ts` reads it.
		function listAnswer() {
			const error = errorFor();
			const found = query.isDelete ? (answers.deleted ?? rows) : rows;

			return { data: error ? null : found, error };
		}

		const builder: QueryBuilder = {
			select: () => builder,
			insert: (row) => {
				query.inserted = row;
				return builder;
			},
			update: (row) => {
				query.updated = row;
				return builder;
			},
			delete: () => {
				query.isDelete = true;
				return builder;
			},
			eq: (column, value) => {
				query.eq.push([column, value]);
				return builder;
			},
			maybeSingle: () => ({
				overrideTypes: async () => {
					const error = errorFor();

					return { data: error ? null : (rows[0] ?? null), error };
				}
			}),
			overrideTypes: async () => listAnswer(),
			then: (resolve) => resolve(listAnswer())
		};

		return builder;
	}

	function bucketFor() {
		const uploadError = answers.uploadError ? { message: answers.uploadError } : null;

		return {
			upload: async (path: string) => {
				storage.uploaded.push(path);
				return { data: null, error: uploadError };
			},
			remove: async (paths: string[]) => {
				storage.removed.push(...paths);
				return { data: null, error: null };
			},
			createSignedUrl: async (path: string, seconds: number) => {
				storage.signed.push([path, seconds]);
				return { data: { signedUrl: `https://storage.example/signed/${path}` }, error: null };
			}
		};
	}

	const supabase = { from: builderFor, storage: { from: bucketFor } };

	return { supabase: supabase as unknown as SupabaseClient, queries, storage };
}

/** The first query the module sent to one relation, so a test can read its conditions back. */
function queryOn(queries: RecordedQuery[], table: string): RecordedQuery {
	const query = queries.find((sent) => sent.table === table);

	if (!query) {
		throw new Error(`Nothing was ever read from "${table}"`);
	}

	return query;
}

/** A `conferences_with_organization` row with everything `toConference` reads. */
function conferenceRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'conference-1',
		slug: 'thimun-2027',
		name: 'THIMUN The Hague 2027',
		description: null,
		city: 'The Hague',
		country_code: 'NL',
		start_time: null,
		end_time: null,
		start_date: '2027-01-20',
		end_date: '2027-01-24',
		website_url: null,
		banner_path: null,
		logo_path: null,
		level: 'intermediate',
		status: 'published',
		timezone: 'Europe/Amsterdam',
		expected_delegates: null,
		applications_open_at: null,
		applications_close_at: null,
		tagline: null,
		venue_name: null,
		venue_address: null,
		contact_email: null,
		instagram_url: null,
		language: 'English',
		min_age: null,
		max_age: null,
		position_paper_required: true,
		position_paper_deadline: '2026-09-20T22:00:00Z',
		accepts_individual_applications: true,
		accepts_delegations: true,
		organization_name: 'THIMUN Foundation',
		organization_slug: 'thimun-foundation',
		committees: [{ name: 'Security Council', abbreviation: 'UNSC', position: 1 }],
		...changes
	};
}

/** A `committees` row, with the five columns this module asks for. */
function committeeRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'committee-1',
		slug: 'unsc',
		name: 'United Nations Security Council',
		abbreviation: 'UNSC',
		topics: ['Climate finance', 'Arctic governance'],
		...changes
	};
}

/** A `seats` row for the reader's own seat. */
function seatRow(changes: Record<string, unknown> = {}) {
	return { id: 'seat-1', name: 'France', country_code: 'FR', ...changes };
}

/** A `documents` row holding a position paper. */
function paperRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'paper-1',
		file_name: 'position-paper.pdf',
		file_size_bytes: 4096,
		review_status: 'submitted',
		review_comment: null,
		updated_at: '2026-09-01T10:00:00Z',
		storage_path: 'conference-1/position-papers/seat-1-old.pdf',
		body_markdown: null,
		...changes
	};
}

/** The answers `getMyPositionPaper` needs before a test changes the part it is about. */
function pageAnswers(changes: StandInAnswers = {}): StandInAnswers {
	return {
		...changes,
		rows: {
			conferences_with_organization: [conferenceRow()],
			committees: [committeeRow()],
			seats: [seatRow()],
			...changes.rows
		}
	};
}

describe('getMyPositionPaper', () => {
	it('answers with nothing when there is no such conference', async () => {
		const { supabase, queries } = createStandInSupabase();

		expect(await getMyPositionPaper(supabase, 'no-such-conference', 'unsc', 'user-1')).toBeNull();
		// It stops at the conference rather than going on to look for a committee
		// inside one that is not there.
		expect(queries.map((query) => query.table)).toEqual(['conferences_with_organization']);
	});

	it('answers with nothing when the conference has no committee with that slug', async () => {
		const { supabase } = createStandInSupabase({
			rows: { conferences_with_organization: [conferenceRow()] }
		});

		expect(
			await getMyPositionPaper(supabase, 'thimun-2027', 'no-such-committee', 'user-1')
		).toBeNull();
	});

	it('answers with nothing when the reader holds no seat in the committee', async () => {
		const { supabase, queries } = createStandInSupabase(pageAnswers({ rows: { seats: [] } }));

		// This is the seatless visitor `05-pages/delegate/position-paper.md` sends
		// to a 404, and it never even asks about a paper.
		expect(await getMyPositionPaper(supabase, 'thimun-2027', 'unsc', 'user-9')).toBeNull();
		expect(queries.map((query) => query.table)).not.toContain('documents');
	});

	it('reports no paper when the seat has not uploaded one', async () => {
		const { supabase } = createStandInSupabase(pageAnswers());

		const page = await getMyPositionPaper(supabase, 'thimun-2027', 'unsc', 'user-1');

		expect(page?.document).toBeNull();
		// The seat's country code travels with it, for the page to draw a flag from.
		expect(page?.seat).toEqual({ id: 'seat-1', name: 'France', countryCode: 'FR' });
		expect(page?.committee).toEqual({
			id: 'committee-1',
			slug: 'unsc',
			name: 'United Nations Security Council',
			heading: 'UNSC',
			topics: ['Climate finance', 'Arctic governance']
		});
	});

	it("reads the seat's paper with a one-minute download link", async () => {
		const { supabase, storage } = createStandInSupabase(
			pageAnswers({ rows: { documents: [paperRow()] } })
		);

		const page = await getMyPositionPaper(supabase, 'thimun-2027', 'unsc', 'user-1');

		expect(page?.document).toEqual({
			id: 'paper-1',
			fileName: 'position-paper.pdf',
			fileSizeBytes: 4096,
			reviewStatus: 'submitted',
			reviewComment: null,
			uploadedAt: '2026-09-01T10:00:00Z',
			downloadUrl: `https://storage.example/signed/${paperRow().storage_path}`,
			bodyMarkdown: null,
			bodyHtml: null
		});
		expect(storage.signed).toEqual([[paperRow().storage_path, 60]]);
	});

	it('reads a written paper with its text as HTML, and signs no link for it', async () => {
		const writtenRow = paperRow({
			file_name: null,
			file_size_bytes: null,
			storage_path: null,
			body_markdown: 'France **supports** the treaty.'
		});
		const { supabase, storage } = createStandInSupabase(
			pageAnswers({ rows: { documents: [writtenRow] } })
		);

		const page = await getMyPositionPaper(supabase, 'thimun-2027', 'unsc', 'user-1');

		expect(page?.document).toMatchObject({
			fileName: null,
			fileSizeBytes: null,
			downloadUrl: null,
			bodyMarkdown: 'France **supports** the treaty.'
		});
		expect(page?.document?.bodyHtml).toContain('<strong>supports</strong>');
		expect(storage.signed).toEqual([]);
	});

	it("carries the committee's topics, for the page's Topics to cover card", async () => {
		const { supabase } = createStandInSupabase(
			pageAnswers({ rows: { committees: [committeeRow({ topics: ['Cybersecurity'] })] } })
		);

		const page = await getMyPositionPaper(supabase, 'thimun-2027', 'unsc', 'user-1');

		expect(page?.committee.topics).toEqual(['Cybersecurity']);
	});

	it("asks the documents table for this seat's own position paper", async () => {
		const { supabase, queries } = createStandInSupabase(pageAnswers());

		await getMyPositionPaper(supabase, 'thimun-2027', 'unsc', 'user-1');

		expect(queryOn(queries, 'documents').eq).toEqual([
			['seat_id', 'seat-1'],
			['kind', 'position_paper']
		]);
	});
});

describe('uploadPositionPaper', () => {
	/** Everything a first upload needs, which a test copies and changes. */
	function newPaper(changes: Partial<NewPositionPaper> = {}): NewPositionPaper {
		return {
			conferenceId: 'conference-1',
			committeeId: 'committee-1',
			seatId: 'seat-1',
			userId: 'user-1',
			seatName: 'France',
			committeeHeading: 'UNSC',
			// `uploadDocumentObject` reads the first bytes, so the file has to start the way a PDF does.
			file: new File(['%PDF-1.7 a position paper'], 'position-paper.pdf', {
				type: 'application/pdf'
			}),
			...changes
		};
	}

	/** The row the seat already had, for the tests about replacing a paper. */
	const EXISTING_PAPER_ROW = {
		id: 'paper-1',
		storage_path: 'conference-1/position-papers/old.pdf'
	};

	it('uploads the file before writing any row', async () => {
		const { supabase, queries, storage } = createStandInSupabase();

		await uploadPositionPaper(supabase, newPaper());

		expect(storage.uploaded).toHaveLength(1);
		expect(storage.uploaded[0]).toMatch(/^conference-1\/position-papers\/seat-1-/);

		const written = queries.find((query) => query.table === 'documents' && query.inserted !== null);

		expect(written).not.toBeUndefined();
	});

	it('inserts a new row for a first upload, with the review reset to submitted', async () => {
		const { supabase, queries } = createStandInSupabase();

		await uploadPositionPaper(supabase, newPaper());

		const inserted = queries.find(
			(query) => query.table === 'documents' && query.inserted !== null
		)?.inserted;

		expect(inserted).toMatchObject({
			conference_id: 'conference-1',
			committee_id: 'committee-1',
			seat_id: 'seat-1',
			uploaded_by: 'user-1',
			kind: 'position_paper',
			title: 'Position paper — France (UNSC)',
			file_name: 'position-paper.pdf',
			mime_type: 'application/pdf',
			body_markdown: null,
			review_status: 'submitted',
			review_comment: null,
			reviewed_by: null,
			reviewed_at: null
		});
	});

	it('replaces a written paper, which has no old file to delete', async () => {
		const { supabase, queries, storage } = createStandInSupabase({
			rows: { documents: [{ id: 'paper-1', storage_path: null }] }
		});

		await uploadPositionPaper(supabase, newPaper());

		const updated = queries.find((query) => query.updated !== null)?.updated;

		expect(updated).toMatchObject({ file_name: 'position-paper.pdf', body_markdown: null });
		expect(storage.removed).toEqual([]);
	});

	it('updates the row a seat already has for a replacement, and leaves the old file to the queue', async () => {
		const { supabase, queries, storage } = createStandInSupabase({
			rows: { documents: [EXISTING_PAPER_ROW] }
		});

		await uploadPositionPaper(supabase, newPaper());

		const documentsQueries = queries.filter((query) => query.table === 'documents');

		expect(documentsQueries.some((query) => query.updated !== null)).toBe(true);
		expect(documentsQueries.some((query) => query.inserted !== null)).toBe(false);
		// The delegate could not see the old file any more, so the
		// `documents_queue_replaced_file` trigger lists it for the sweep instead.
		expect(storage.removed).toEqual([]);
	});

	it('refuses a file that is not a PDF inside, whatever its name says', async () => {
		const { supabase, queries, storage } = createStandInSupabase();
		const renamed = new File(['PK\u0003\u0004'], 'position-paper.pdf', {
			type: 'application/pdf'
		});

		await expect(uploadPositionPaper(supabase, newPaper({ file: renamed }))).rejects.toThrow(
			'its contents are not a application/pdf file'
		);
		expect(storage.uploaded).toEqual([]);
		expect(queries.some((query) => query.table === 'documents' && query.inserted !== null)).toBe(
			false
		);
	});

	it('aborts before writing a row when Storage refuses the upload', async () => {
		const { supabase, queries } = createStandInSupabase({ uploadError: 'bucket is full' });

		await expect(uploadPositionPaper(supabase, newPaper())).rejects.toThrow('bucket is full');
		expect(
			queries.some(
				(query) =>
					query.table === 'documents' && (query.inserted !== null || query.updated !== null)
			)
		).toBe(false);
	});

	it('passes the database refusal on when the row cannot be saved', async () => {
		const { supabase, storage } = createStandInSupabase({ writeError: 'permission denied' });

		await expect(uploadPositionPaper(supabase, newPaper())).rejects.toThrow('permission denied');
		// The file is left where it is: with no row it is readable by nobody, and
		// the delegate could not remove it anyway.
		expect(storage.uploaded).toHaveLength(1);
		expect(storage.removed).toEqual([]);
	});
});

describe('submitWrittenPaper', () => {
	/** Everything a written paper needs, which a test copies and changes. */
	function writtenPaper(changes: Partial<NewWrittenPaper> = {}): NewWrittenPaper {
		return {
			conferenceId: 'conference-1',
			committeeId: 'committee-1',
			seatId: 'seat-1',
			userId: 'user-1',
			seatName: 'France',
			committeeHeading: 'UNSC',
			body: 'France supports the treaty.',
			...changes
		};
	}

	it('inserts a first written paper with no file and the review at submitted', async () => {
		const { supabase, queries, storage } = createStandInSupabase();

		await submitWrittenPaper(supabase, writtenPaper());

		const inserted = queries.find((query) => query.inserted !== null)?.inserted;

		expect(inserted).toEqual({
			title: 'Position paper — France (UNSC)',
			storage_path: null,
			file_name: null,
			file_size_bytes: null,
			mime_type: null,
			body_markdown: 'France supports the treaty.',
			review_status: 'submitted',
			review_comment: null,
			reviewed_by: null,
			reviewed_at: null,
			conference_id: 'conference-1',
			committee_id: 'committee-1',
			seat_id: 'seat-1',
			uploaded_by: 'user-1',
			kind: 'position_paper'
		});
		expect(storage.uploaded).toEqual([]);
	});

	it('writes over an uploaded paper and leaves its file to the queue', async () => {
		const { supabase, queries, storage } = createStandInSupabase({
			rows: { documents: [{ id: 'paper-1', storage_path: 'conference-1/position-papers/old.pdf' }] }
		});

		await submitWrittenPaper(supabase, writtenPaper());

		const update = queries.find((query) => query.updated !== null);

		expect(update?.updated).toMatchObject({
			storage_path: null,
			body_markdown: expect.any(String)
		});
		expect(update?.eq).toEqual([['id', 'paper-1']]);
		// The `documents_queue_replaced_file` trigger lists the old file for the sweep.
		expect(storage.removed).toEqual([]);
	});

	it('keeps the old file when the database refuses the written paper', async () => {
		const { supabase, storage } = createStandInSupabase({
			rows: {
				documents: [{ id: 'paper-1', storage_path: 'conference-1/position-papers/old.pdf' }]
			},
			writeError: 'new row violates row-level security policy'
		});

		await expect(submitWrittenPaper(supabase, writtenPaper())).rejects.toThrow(
			'row-level security'
		);
		expect(storage.removed).toEqual([]);
	});
});

describe('removePositionPaper', () => {
	it('deletes the row and leaves its file to the queue', async () => {
		const { supabase, queries, storage } = createStandInSupabase({
			deleted: [{ storage_path: 'conference-1/position-papers/seat-1.pdf' }]
		});

		const removed = await removePositionPaper(supabase, 'paper-1');

		expect(removed).toBe(true);
		expect(queryOn(queries, 'documents').isDelete).toBe(true);
		expect(queryOn(queries, 'documents').eq).toEqual([
			['id', 'paper-1'],
			['kind', 'position_paper']
		]);
		// Once the row is gone the delegate may not see the file, so the
		// `documents_queue_orphaned_file` trigger lists it for the sweep.
		expect(storage.removed).toEqual([]);
	});

	it('answers false and deletes nothing when Row Level Security refuses the delete', async () => {
		const { supabase, storage } = createStandInSupabase({ deleted: [] });

		expect(await removePositionPaper(supabase, 'paper-1')).toBe(false);
		expect(storage.removed).toEqual([]);
	});

	it('deletes a written paper the same way', async () => {
		const { supabase, storage } = createStandInSupabase({ deleted: [{ storage_path: null }] });

		expect(await removePositionPaper(supabase, 'paper-1')).toBe(true);
		expect(storage.removed).toEqual([]);
	});
});
