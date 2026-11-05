import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	ORPHANED_FILES_PER_SWEEP,
	STORAGE_SWEEP_INTERVAL_MS,
	removeOrphanedDocumentFiles,
	scheduleStorageSweep,
	sweepStorage
} from './orphaned-document-files';
import { createServiceRoleClient } from './service-role';

// These tests are about what the sweep does with each answer: which failures
// stop it, that a path is crossed off only once its file is removed, and that
// each queue's paths go to its own bucket. That the triggers really list a
// deleted or replaced row's file, and that the file really leaves the bucket,
// is tested against the local Supabase in tests/db/orphaned-document-files.test.ts
// and tests/db/security-storage.test.ts.

// The real function builds a client with the service role key. Here it hands
// back whichever stand-in the test prepared.
vi.mock('./service-role', () => ({ createServiceRoleClient: vi.fn() }));

/** What the stand-in answers. Every field left out succeeds. */
type StandInAnswers = {
	/** The paths waiting in `orphaned_document_files`. */
	paths?: string[];
	/** The paths waiting in `public_media_cleanup`. */
	picturePaths?: string[];
	readError?: string;
	/** What `queue_unreferenced_uploads` answers. */
	queueError?: string;
	removeError?: string;
	deleteError?: string;
};

/** What the stand-in was asked to do. */
type StandInCalls = {
	/** The table each read was on, and the limit it asked for. */
	reads: { table: string; limit: number }[];
	/** The bucket each Storage call was made on, and the paths it removed. */
	removed: { bucket: string; paths: string[] }[];
	/** The table each delete was on, and the paths it named. */
	crossedOff: { table: string; paths: string[] }[];
	/** Each database function called, and how many queue reads had been made before it. */
	functionCalls: { name: string; readsBefore: number }[];
};

function errorOrNull(message: string | undefined) {
	return message ? { message } : null;
}

/** The column each queue keeps its paths in, which the read answers rows by. */
const PATH_COLUMNS: Record<string, string> = {
	orphaned_document_files: 'storage_path',
	public_media_cleanup: 'path'
};

/** A service-role client that answers one read, one remove and one delete per queue. */
function createStandInServiceRole(answers: StandInAnswers = {}) {
	const calls: StandInCalls = { reads: [], removed: [], crossedOff: [], functionCalls: [] };
	const waiting: Record<string, string[]> = {
		orphaned_document_files: answers.paths ?? [],
		public_media_cleanup: answers.picturePaths ?? []
	};

	function queryOn(table: string) {
		const rows = (waiting[table] ?? []).map((path) => ({ [PATH_COLUMNS[table]]: path }));

		const query = {
			select: () => query,
			order: () => query,
			limit: (count: number) => {
				calls.reads.push({ table, limit: count });
				return query;
			},
			overrideTypes: async () => ({
				data: answers.readError ? null : rows,
				error: errorOrNull(answers.readError)
			}),
			delete: () => ({
				in: async (_column: string, paths: string[]) => {
					calls.crossedOff.push({ table, paths });
					return { error: errorOrNull(answers.deleteError) };
				}
			})
		};

		return query;
	}

	const supabase = {
		from: queryOn,
		rpc: async (name: string) => {
			calls.functionCalls.push({ name, readsBefore: calls.reads.length });
			return { data: 0, error: errorOrNull(answers.queueError) };
		},
		storage: {
			from: (bucket: string) => ({
				remove: async (paths: string[]) => {
					calls.removed.push({ bucket, paths });
					return { data: [], error: errorOrNull(answers.removeError) };
				}
			})
		}
	};

	vi.mocked(createServiceRoleClient).mockReturnValue(supabase as unknown as SupabaseClient);

	return calls;
}

beforeEach(() => {
	vi.mocked(createServiceRoleClient).mockReset();
	// Every failure is logged. Silencing the log keeps the test output readable.
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('removeOrphanedDocumentFiles', () => {
	it('removes the listed files from the documents bucket and then crosses them off', async () => {
		const paths = ['conference-1/position-papers/seat-1-a.pdf', 'conference-1/resources/b.pdf'];
		const calls = createStandInServiceRole({ paths });

		await removeOrphanedDocumentFiles();

		expect(calls.reads).toEqual([
			{ table: 'orphaned_document_files', limit: ORPHANED_FILES_PER_SWEEP },
			{ table: 'public_media_cleanup', limit: ORPHANED_FILES_PER_SWEEP }
		]);
		expect(calls.removed).toEqual([{ bucket: 'documents', paths }]);
		expect(calls.crossedOff).toEqual([{ table: 'orphaned_document_files', paths }]);
	});

	it('removes the listed pictures from the public-media bucket and crosses them off', async () => {
		const picturePaths = ['avatars/user-1/old.jpg', 'conferences/conference-1/banner-old.jpg'];
		const calls = createStandInServiceRole({ picturePaths });

		await removeOrphanedDocumentFiles();

		expect(calls.removed).toEqual([{ bucket: 'public-media', paths: picturePaths }]);
		expect(calls.crossedOff).toEqual([{ table: 'public_media_cleanup', paths: picturePaths }]);
	});

	it('asks Storage for nothing when nothing is waiting', async () => {
		const calls = createStandInServiceRole({ paths: [], picturePaths: [] });

		await removeOrphanedDocumentFiles();

		expect(calls.removed).toEqual([]);
		expect(calls.crossedOff).toEqual([]);
	});

	it('leaves every path on the list when Storage refuses, so the next sweep tries again', async () => {
		const calls = createStandInServiceRole({ paths: ['a.pdf'], removeError: 'Storage is down' });

		await expect(removeOrphanedDocumentFiles()).resolves.toBeUndefined();

		expect(calls.removed).toHaveLength(1);
		expect(calls.crossedOff).toEqual([]);
	});

	it('stops quietly when the lists cannot be read', async () => {
		const calls = createStandInServiceRole({ readError: 'connection closed' });

		await expect(removeOrphanedDocumentFiles()).resolves.toBeUndefined();

		expect(calls.removed).toEqual([]);
	});

	it('crosses the paths off in requests short enough for the server', async () => {
		const paths = Array.from({ length: 45 }, (_, index) => `seat-${index}/paper.pdf`);
		const calls = createStandInServiceRole({ paths });

		await removeOrphanedDocumentFiles();

		expect(calls.removed).toEqual([{ bucket: 'documents', paths }]);
		expect(calls.crossedOff.map((call) => call.paths)).toEqual([
			paths.slice(0, 20),
			paths.slice(20, 40),
			paths.slice(40)
		]);
	});

	it('does not throw when the removed files cannot be crossed off', async () => {
		createStandInServiceRole({ paths: ['a.pdf'], deleteError: 'connection closed' });

		await expect(removeOrphanedDocumentFiles()).resolves.toBeUndefined();
	});

	it('says loudly, once per process, that nothing is removed when the server has no service role key', async () => {
		const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
		errorLog.mockClear();
		vi.mocked(createServiceRoleClient).mockImplementation(() => {
			throw new Error('The service role key is not set.');
		});

		// Two seat changes in the same process: the warning is for the operator,
		// not a line per request, so it appears once and does not throw either time.
		await expect(removeOrphanedDocumentFiles()).resolves.toBeUndefined();
		await expect(removeOrphanedDocumentFiles()).resolves.toBeUndefined();

		const warnings = errorLog.mock.calls.map((call) => String(call[0]));
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toMatch(/^ORPHANED DOCUMENT FILES ARE NOT BEING REMOVED/);
		expect(warnings[0]).toContain('The service role key is not set.');
		expect(warnings[0]).toContain('service-role.ts');
	});
});

describe('sweepStorage', () => {
	it('queues the files nobody saved before it empties both queues', async () => {
		const calls = createStandInServiceRole({
			paths: ['conference-1/position-papers/seat-1-a.pdf'],
			picturePaths: ['avatars/user-1/never-saved.jpg']
		});

		await sweepStorage();

		expect(calls.functionCalls).toEqual([{ name: 'queue_unreferenced_uploads', readsBefore: 0 }]);
		expect(calls.removed).toEqual([
			{ bucket: 'documents', paths: ['conference-1/position-papers/seat-1-a.pdf'] },
			{ bucket: 'public-media', paths: ['avatars/user-1/never-saved.jpg'] }
		]);
	});

	it('still removes what was already waiting when the files could not be queued', async () => {
		const calls = createStandInServiceRole({ paths: ['a.pdf'], queueError: 'timeout' });

		await expect(sweepStorage()).resolves.toBeUndefined();

		expect(calls.removed).toEqual([{ bucket: 'documents', paths: ['a.pdf'] }]);
		expect(console.error).toHaveBeenCalledWith('Could not queue the files nobody saved: timeout');
	});

	it('does not throw when the server has no service role key', async () => {
		vi.mocked(createServiceRoleClient).mockImplementation(() => {
			throw new Error('The service role key is not set.');
		});

		await expect(sweepStorage()).resolves.toBeUndefined();
	});
});

describe('scheduleStorageSweep', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('sweeps once every interval until it is stopped', async () => {
		vi.useFakeTimers();
		const calls = createStandInServiceRole();

		const stop = scheduleStorageSweep();
		expect(calls.functionCalls).toHaveLength(0);

		await vi.advanceTimersByTimeAsync(STORAGE_SWEEP_INTERVAL_MS);
		expect(calls.functionCalls).toHaveLength(1);

		await vi.advanceTimersByTimeAsync(STORAGE_SWEEP_INTERVAL_MS);
		expect(calls.functionCalls).toHaveLength(2);

		stop();
		await vi.advanceTimersByTimeAsync(STORAGE_SWEEP_INTERVAL_MS * 3);
		expect(calls.functionCalls).toHaveLength(2);
	});
});
