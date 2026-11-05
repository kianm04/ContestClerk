import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	countCommitteeDocuments,
	getBackgroundGuide,
	listBackgroundGuides,
	removeBackgroundGuide,
	uploadBackgroundGuide,
	type NewBackgroundGuide
} from './documents';

// These tests are about the decisions this module makes: the order it uploads a
// file, writes the row and deletes the object it replaced in, which columns it
// sends to a table whose trigger freezes half of them, and what it does when
// Storage will not make a download link. Nothing here talks to a database or to
// a bucket; the stand-in below writes down what it was asked for and answers
// with fixed rows. Whether the database really lets somebody write those rows is
// Row Level Security's decision, and that is tested in `tests/db/`.

/** The private bucket every document lives in. Naming it here catches a change to another one. */
const DOCUMENTS_BUCKET = 'documents';

/** The link the stand-in's bucket hands back when it is asked to sign a path. */
const SIGNED_URL = 'https://storage.example/signed/unsc-guide.pdf';

/** An error in the shape the real client reports one. */
type QueryError = { message: string };

/** What one query the module sent was asking for. */
type RecordedQuery = {
	/** The relation `.from(...)` named. */
	table: string;
	/** The columns `.select(...)` was given, or `''` for a query that read nothing. */
	columns: string;
	/** The row `.insert(...)` was given, or `null` when the query did not insert. */
	inserted: Record<string, unknown> | null;
	/** The row `.update(...)` was given, or `null` when the query did not update. */
	updated: Record<string, unknown> | null;
	/** Whether `.delete()` was called on this query. */
	isDelete: boolean;
	eq: [string, unknown][];
	in: [string, unknown[]][];
};

/** What the module asked Supabase Storage to do. */
type RecordedStorage = {
	/** The bucket each `.from(...)` named, so a test can check which one it was. */
	buckets: string[];
	/** The paths that went into the bucket, in the order they were uploaded. */
	uploaded: string[];
	/** The paths that were deleted from it, in the order they were removed. */
	removed: string[];
	/** `[path, seconds]` for every download link that was asked for. */
	signed: [string, number][];
};

/** What the stand-in should answer with. Everything here has a harmless default. */
type StandInAnswers = {
	/** The `documents` rows a read finds. A read for one row takes the first of them. */
	rows?: Record<string, unknown>[];
	/** The rows a delete says it removed. Nothing means it removed what it was given. */
	deleted?: { id: string }[];
	/** The rows an update says it changed. Nothing means it changed what it was given. */
	updatedRows?: { id: string }[];
	/** The message a query that reads fails with. Nothing means reading works. */
	queryError?: string;
	/** The message an insert or an update fails with. Nothing means writing works. */
	writeError?: string;
	/** The message an upload to the bucket fails with. Nothing means it works. */
	uploadError?: string;
	/** The message a delete from the bucket fails with. Nothing means it works. */
	removeError?: string;
	/** The message signing a download link fails with. Nothing means a link comes back. */
	signedUrlError?: string;
};

/** The end of a chain that asked for one row rather than a list. */
type SingleRowBuilder = {
	overrideTypes: () => Promise<{ data: unknown; error: QueryError | null }>;
};

/**
 * One step of a query. Every step hands the builder back, which is what lets
 * the next step be called on it.
 */
type QueryBuilder = {
	select: (columns: string) => QueryBuilder;
	insert: (row: Record<string, unknown>) => QueryBuilder;
	update: (row: Record<string, unknown>) => QueryBuilder;
	delete: () => QueryBuilder;
	eq: (column: string, value: unknown) => QueryBuilder;
	in: (column: string, values: unknown[]) => QueryBuilder;
	/** Sorting changes nothing here, because the rows are fixed. */
	order: () => QueryBuilder;
	maybeSingle: () => SingleRowBuilder;
	overrideTypes: () => Promise<{ data: unknown[] | null; error: QueryError | null }>;
	then: (resolve: (answer: { data: unknown[] | null; error: QueryError | null }) => void) => void;
};

/**
 * A stand-in Supabase client that writes down what was asked of it, with a
 * bucket beside its tables.
 *
 * The real client is a builder: `.from(...)` gives back an object with
 * `.select(...)` on it, `.select(...)` one with `.eq(...)` on it, and so on.
 * Each step adds one condition to a query that is only sent once the chain is
 * awaited. This copies that shape: every step records its arguments and hands
 * the same builder back. The three ways a chain ends here are all catered for.
 * `maybeSingle` answers with the first row, `overrideTypes` — which only
 * changes the type of the answer in the real client, not the answer itself —
 * answers with a list, and an `insert` or `update` chain ends with nothing at
 * all and is simply awaited. `then` is what makes that last one work: `await`
 * on any object calls its `then`, which is exactly how the real builder sends
 * its query at the last moment.
 */
function createStandInSupabase(answers: StandInAnswers = {}): {
	supabase: SupabaseClient;
	queries: RecordedQuery[];
	storage: RecordedStorage;
} {
	const queries: RecordedQuery[] = [];
	const storage: RecordedStorage = { buckets: [], uploaded: [], removed: [], signed: [] };

	function builderFor(table: string): QueryBuilder {
		const query: RecordedQuery = {
			table,
			columns: '',
			inserted: null,
			updated: null,
			isDelete: false,
			eq: [],
			in: []
		};
		queries.push(query);

		const rows = answers.rows ?? [];

		/**
		 * The message this query fails with. It is worked out when the chain is
		 * awaited rather than when it starts, because only by then is it known
		 * whether the query read or wrote.
		 */
		function errorFor(): QueryError | null {
			const isWrite = query.inserted !== null || query.updated !== null;
			const message = isWrite ? answers.writeError : answers.queryError;

			return message ? { message } : null;
		}

		// A delete or an update asks for the rows it touched with `.select('id')`,
		// and Row Level Security refusing one shows up as an empty list. So each is
		// answered separately from a read, and by default it touches what it was given.
		function listAnswer() {
			const error = errorFor();
			let found = rows;
			if (query.isDelete) found = answers.deleted ?? rows;
			if (query.updated !== null) found = answers.updatedRows ?? rows;

			return { data: error ? null : found, error };
		}

		const builder: QueryBuilder = {
			select: (columns) => {
				query.columns = columns;
				return builder;
			},
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
			in: (column, values) => {
				query.in.push([column, values]);
				return builder;
			},
			order: () => builder,
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

	/**
	 * The storage half of the stand-in, in the shape the real client has:
	 * `supabase.storage.from(bucket)` gives back an object carrying `upload`,
	 * `remove` and `createSignedUrl`, and each of those answers with
	 * `{ data, error }` rather than throwing, just as a query does.
	 */
	function bucketFor(bucket: string) {
		storage.buckets.push(bucket);

		const uploadError = answers.uploadError ? { message: answers.uploadError } : null;
		const removeError = answers.removeError ? { message: answers.removeError } : null;
		const signedUrlError = answers.signedUrlError ? { message: answers.signedUrlError } : null;

		return {
			upload: async (path: string) => {
				storage.uploaded.push(path);
				return { data: null, error: uploadError };
			},
			remove: async (paths: string[]) => {
				storage.removed.push(...paths);
				return { data: null, error: removeError };
			},
			createSignedUrl: async (path: string, seconds: number) => {
				storage.signed.push([path, seconds]);

				if (signedUrlError) {
					return { data: null, error: signedUrlError };
				}

				return { data: { signedUrl: SIGNED_URL }, error: null };
			}
		};
	}

	const supabase = { from: builderFor, storage: { from: bucketFor } };

	return { supabase: supabase as unknown as SupabaseClient, queries, storage };
}

/** Where the stand-in's guide sits in the bucket. */
const GUIDE_PATH = 'conference-1/background-guides/committee-1-old.pdf';

/** One committee's background guide, as the `documents` table holds it. */
const GUIDE_ROW = {
	id: 'guide-1',
	title: 'UNSC background guide',
	file_name: 'unsc-guide.pdf',
	file_size_bytes: 2048,
	audience: 'everyone',
	storage_path: GUIDE_PATH
};

/** A guide as the upload form sends one. It starts the way a PDF does, because the upload reads its first bytes. */
const GUIDE_FILE = new File(['%PDF-1.7 a background guide'], 'unsc-guide.pdf', {
	type: 'application/pdf'
});

/** Everything the upload needs, which a test copies and changes. */
const NEW_GUIDE: NewBackgroundGuide = {
	conferenceId: 'conference-1',
	committeeId: 'committee-1',
	uploadedBy: 'chair-1',
	title: 'UNSC background guide',
	file: GUIDE_FILE,
	audience: 'everyone'
};

describe('getBackgroundGuide', () => {
	it('answers the guide with a link that is good for one minute', async () => {
		const { supabase, storage } = createStandInSupabase({ rows: [GUIDE_ROW] });

		const guide = await getBackgroundGuide(supabase, 'committee-1');

		expect(guide).toEqual({
			id: 'guide-1',
			title: 'UNSC background guide',
			fileName: 'unsc-guide.pdf',
			fileSizeBytes: 2048,
			audience: 'everyone',
			downloadUrl: SIGNED_URL
		});
		// The bucket is private, so the only way to read a file out of it is a
		// signed link. `02-architecture/storage.md` asks for sixty seconds.
		expect(storage.buckets).toEqual([DOCUMENTS_BUCKET]);
		expect(storage.signed).toEqual([[GUIDE_PATH, 60]]);
	});

	it('asks the documents table for this committee guide and nothing else', async () => {
		const { supabase, queries } = createStandInSupabase({ rows: [GUIDE_ROW] });

		await getBackgroundGuide(supabase, 'committee-1');

		expect(queries).toHaveLength(1);
		expect(queries[0].table).toBe('documents');
		expect(queries[0].eq).toEqual([
			['committee_id', 'committee-1'],
			['kind', 'background_guide']
		]);
	});

	it('answers nothing when the committee has no guide', async () => {
		const { supabase, storage } = createStandInSupabase({ rows: [] });

		const guide = await getBackgroundGuide(supabase, 'committee-1');

		expect(guide).toBeNull();
		// There is no path to sign, so Storage is not asked at all.
		expect(storage.signed).toEqual([]);
	});

	it('answers the guide without a link when the link could not be made', async () => {
		const { supabase } = createStandInSupabase({
			rows: [GUIDE_ROW],
			signedUrlError: 'the object has gone'
		});

		const guide = await getBackgroundGuide(supabase, 'committee-1');

		// The panel then shows the file, its name and its size without a download
		// link, rather than the whole page becoming an error about a link.
		expect(guide?.downloadUrl).toBeNull();
		expect(guide?.fileName).toBe('unsc-guide.pdf');
	});

	it('raises when the row cannot be read, because that is a fault and not an answer', async () => {
		const { supabase } = createStandInSupabase({ queryError: 'no connection' });

		await expect(getBackgroundGuide(supabase, 'committee-1')).rejects.toThrow('no connection');
	});

	it('keeps an audience a guide is allowed to have', async () => {
		const { supabase } = createStandInSupabase({
			rows: [{ ...GUIDE_ROW, audience: 'delegates' }]
		});

		const guide = await getBackgroundGuide(supabase, 'committee-1');

		expect(guide?.audience).toBe('delegates');
	});

	it('reads any other audience as delegates, so a stray row cannot widen who downloads', async () => {
		// 'staff' is a value the database's audience enum has and a guide panel does
		// not, and 'committee' is one the check constraint refuses outright. Either
		// way the row should not exist, and the safe reading of one is the narrower
		// of the two audiences a guide can have.
		const { supabase } = createStandInSupabase({
			rows: [{ ...GUIDE_ROW, audience: 'staff' }]
		});

		const guide = await getBackgroundGuide(supabase, 'committee-1');

		expect(guide?.audience).toBe('delegates');
	});
});

describe('uploadBackgroundGuide', () => {
	it('uploads into this conference own background guide folder', async () => {
		const { supabase, storage } = createStandInSupabase({ rows: [] });

		await uploadBackgroundGuide(supabase, NEW_GUIDE);

		expect(storage.buckets).toEqual([DOCUMENTS_BUCKET]);
		expect(storage.uploaded).toHaveLength(1);
		// `<conference id>/background-guides/<committee id>-<uuid>.pdf`, the path
		// `02-architecture/storage.md` lays down. The storage policies read those
		// folders to decide who may write the file.
		expect(storage.uploaded[0]).toMatch(/^conference-1\/background-guides\/committee-1-/);
		expect(storage.uploaded[0].endsWith('.pdf')).toBe(true);
	});

	it('writes a new row with every column when the committee had no guide', async () => {
		const { supabase, queries, storage } = createStandInSupabase({ rows: [] });

		await uploadBackgroundGuide(supabase, NEW_GUIDE);

		const insert = queries.find((query) => query.inserted !== null);

		// The four columns `protect_documents_columns` freezes are written here and
		// nowhere else, because an insert is the only chance to say them.
		expect(insert?.table).toBe('documents');
		expect(insert?.inserted).toEqual({
			conference_id: 'conference-1',
			committee_id: 'committee-1',
			uploaded_by: 'chair-1',
			kind: 'background_guide',
			title: 'UNSC background guide',
			storage_path: storage.uploaded[0],
			file_name: 'unsc-guide.pdf',
			file_size_bytes: GUIDE_FILE.size,
			mime_type: 'application/pdf',
			audience: 'everyone'
		});
		expect(queries.every((query) => query.updated === null)).toBe(true);
	});

	it('writes the row the committee already has, and none of the frozen columns', async () => {
		const { supabase, queries, storage } = createStandInSupabase({ rows: [GUIDE_ROW] });

		await uploadBackgroundGuide(supabase, { ...NEW_GUIDE, audience: 'delegates' });

		const update = queries.find((query) => query.updated !== null);

		// `documents_one_guide_per_committee` is a unique index, so a committee has
		// one guide row and replacing the file writes the row that is already there.
		expect(update?.eq).toEqual([['id', 'guide-1']]);
		expect(update?.updated).toEqual({
			title: 'UNSC background guide',
			storage_path: storage.uploaded[0],
			file_name: 'unsc-guide.pdf',
			file_size_bytes: GUIDE_FILE.size,
			mime_type: 'application/pdf',
			audience: 'delegates'
		});
		// `protect_documents_columns` refuses an update that changes any of these,
		// and an organiser replacing a chair's guide leaves `uploaded_by` as the
		// chair, which is what the update policy allows.
		for (const column of ['kind', 'conference_id', 'committee_id', 'seat_id', 'uploaded_by']) {
			expect(update?.updated).not.toHaveProperty(column);
		}
		expect(queries.every((query) => query.inserted === null)).toBe(true);
	});

	it('deletes the file it replaced, and not the one it just uploaded', async () => {
		const { supabase, storage } = createStandInSupabase({ rows: [GUIDE_ROW] });

		await uploadBackgroundGuide(supabase, NEW_GUIDE);

		expect(storage.removed).toEqual([GUIDE_PATH]);
		expect(storage.removed).not.toContain(storage.uploaded[0]);
	});

	it('deletes nothing when this is the committee first guide', async () => {
		const { supabase, storage } = createStandInSupabase({ rows: [] });

		await uploadBackgroundGuide(supabase, NEW_GUIDE);

		expect(storage.removed).toEqual([]);
	});

	it('raises when the upload fails, rather than pointing the row at nothing', async () => {
		const { supabase, queries } = createStandInSupabase({ rows: [], uploadError: 'bucket full' });

		await expect(uploadBackgroundGuide(supabase, NEW_GUIDE)).rejects.toThrow('bucket full');
		// Only the read happened; no query wrote a row.
		const wrote = queries.some((query) => query.inserted !== null || query.updated !== null);
		expect(wrote).toBe(false);
	});

	it('still counts as saved when the file it replaced could not be deleted', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: [GUIDE_ROW],
			removeError: 'no such object'
		});

		// By then the new file is uploaded and the row points at it, so an object
		// nobody points at any more is a smaller problem than an error page about a
		// change that did in fact happen. `storage.md` says so in as many words.
		await expect(uploadBackgroundGuide(supabase, NEW_GUIDE)).resolves.toBeUndefined();
		expect(queries.some((query) => query.updated !== null)).toBe(true);
	});

	it('raises when the row cannot be saved, so nobody is told a guide was kept', async () => {
		const { supabase, storage } = createStandInSupabase({ rows: [], writeError: 'no connection' });

		await expect(uploadBackgroundGuide(supabase, NEW_GUIDE)).rejects.toThrow('no connection');
		// The file is in the bucket by then and nothing points at it. That is the
		// side the order errs on: the alternative is a row naming a file that was
		// never uploaded.
		expect(storage.uploaded).toHaveLength(1);
	});

	it('keeps the file it would have replaced when the row update is refused', async () => {
		const { supabase, storage } = createStandInSupabase({ rows: [GUIDE_ROW], updatedRows: [] });

		// Row Level Security refuses an update by changing no rows. The old file is
		// still what the row points at, so deleting it would leave a broken guide.
		await expect(uploadBackgroundGuide(supabase, NEW_GUIDE)).rejects.toThrow('may not change it');
		expect(storage.removed).toEqual([]);
	});

	it('raises before uploading anything when the guide on file cannot be read', async () => {
		const { supabase, storage } = createStandInSupabase({ queryError: 'no connection' });

		await expect(uploadBackgroundGuide(supabase, NEW_GUIDE)).rejects.toThrow('no connection');
		expect(storage.uploaded).toEqual([]);
	});
});

describe('removeBackgroundGuide', () => {
	it('deletes the row and then the file, and says it went', async () => {
		const { supabase, queries, storage } = createStandInSupabase({ rows: [GUIDE_ROW] });

		const removed = await removeBackgroundGuide(supabase, 'committee-1');

		expect(removed).toBe(true);

		const deleteQuery = queries.find((query) => query.isDelete);

		expect(deleteQuery?.eq).toEqual([['id', 'guide-1']]);
		expect(storage.removed).toEqual([GUIDE_PATH]);
	});

	it('says there was nothing to take away when the committee has no guide', async () => {
		const { supabase, queries, storage } = createStandInSupabase({ rows: [] });

		const removed = await removeBackgroundGuide(supabase, 'committee-1');

		expect(removed).toBe(false);
		expect(queries.some((query) => query.isDelete)).toBe(false);
		expect(storage.removed).toEqual([]);
	});

	it('says nothing went when the delete came back with no rows', async () => {
		const { supabase, storage } = createStandInSupabase({ rows: [GUIDE_ROW], deleted: [] });

		// Row Level Security refusing a delete is not an error: the policy hides the
		// row, so nothing matches and no message comes back. The file stays where it
		// is, because the row that points at it is still there.
		const removed = await removeBackgroundGuide(supabase, 'committee-1');

		expect(removed).toBe(false);
		expect(storage.removed).toEqual([]);
	});
});

describe('countCommitteeDocuments', () => {
	it('counts the guide and the papers of each committee', async () => {
		const { supabase } = createStandInSupabase({
			rows: [
				{ committee_id: 'committee-1', kind: 'background_guide' },
				{ committee_id: 'committee-1', kind: 'position_paper' },
				{ committee_id: 'committee-1', kind: 'position_paper' },
				{ committee_id: 'committee-2', kind: 'position_paper' }
			]
		});

		const counts = await countCommitteeDocuments(supabase, 'conference-1');

		expect(counts.get('committee-1')).toEqual({
			hasBackgroundGuide: true,
			positionPaperCount: 2
		});
		expect(counts.get('committee-2')).toEqual({
			hasBackgroundGuide: false,
			positionPaperCount: 1
		});
		// A committee with no file of either kind is missing from the map, and the
		// caller fills in the empty answer for it.
		expect(counts.has('committee-3')).toBe(false);
	});

	it('asks for both kinds of this conference in one query', async () => {
		const { supabase, queries } = createStandInSupabase({ rows: [] });

		await countCommitteeDocuments(supabase, 'conference-1');

		expect(queries).toHaveLength(1);
		expect(queries[0].table).toBe('documents');
		expect(queries[0].eq).toEqual([['conference_id', 'conference-1']]);
		expect(queries[0].in).toEqual([['kind', ['background_guide', 'position_paper']]]);
	});

	it('skips a file that belongs to no committee', async () => {
		const { supabase } = createStandInSupabase({
			rows: [
				{ committee_id: null, kind: 'background_guide' },
				{ committee_id: 'committee-1', kind: 'position_paper' }
			]
		});

		const counts = await countCommitteeDocuments(supabase, 'conference-1');

		// A resource belongs to the conference and to no committee, so it is nobody's
		// to count.
		expect(counts.size).toBe(1);
		expect(counts.get('committee-1')).toEqual({
			hasBackgroundGuide: false,
			positionPaperCount: 1
		});
	});

	it('answers an empty map when the conference has no files yet', async () => {
		const { supabase } = createStandInSupabase({ rows: [] });

		const counts = await countCommitteeDocuments(supabase, 'conference-1');

		expect(counts.size).toBe(0);
	});

	it('raises when the query fails', async () => {
		const { supabase } = createStandInSupabase({ queryError: 'no connection' });

		await expect(countCommitteeDocuments(supabase, 'conference-1')).rejects.toThrow(
			'no connection'
		);
	});
});

// How `listBackgroundGuides` pairs committees with their guides is tested in
// `./resources.test.ts`, whose stand-in answers each table with its own rows.
// This one answers every table alike, which is enough for what follows.
describe('listBackgroundGuides', () => {
	it('answers an empty list for a conference without committees', async () => {
		const { supabase, queries } = createStandInSupabase({ rows: [] });

		expect(await listBackgroundGuides(supabase, 'conference-1')).toEqual([]);
		expect(queries.map((query) => query.table)).toEqual(['committees', 'documents']);
	});

	it('raises when the committees cannot be read', async () => {
		const { supabase } = createStandInSupabase({ queryError: 'no connection' });

		await expect(listBackgroundGuides(supabase, 'conference-1')).rejects.toThrow(
			'Could not list the committees: no connection'
		);
	});
});
