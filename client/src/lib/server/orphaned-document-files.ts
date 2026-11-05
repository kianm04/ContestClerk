/**
 * Removing the files in the two buckets whose rows have moved on.
 *
 * A database cannot remove a file from Storage, and the person whose write
 * made a file redundant often is not allowed to: when a seat changes hands
 * the database deletes the position paper's row (the
 * `seats_clear_position_paper` trigger, or `revoke_seat`), a delegate who
 * replaces their paper can no longer see the old file once the row points at
 * the new one, and a deleted account has nobody left to act for it. So
 * triggers write each such file's path into a queue, `orphaned_document_files`
 * for the `documents` bucket and `public_media_cleanup` for `public-media`,
 * and `removeOrphanedDocumentFiles` below removes what is listed there with
 * the service role. Migration 20260925140000 made the first queue and says why;
 * migration 20261022133000 added the second queue and the replacement
 * triggers.
 *
 * A file that never had a row is on neither queue until `sweepStorage` puts it
 * there: somebody uploaded a picture or a paper and never saved it, which a
 * person can do straight through the Storage API (security review L61).
 * `scheduleStorageSweep` runs that sweep every fifteen minutes, from the
 * server's `init` hook; migration 20261022162000 explains which files it takes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { DOCUMENTS_BUCKET } from './document-storage';
import { createServiceRoleClient } from './service-role';

/** The bucket the pictures live in, as `$lib/media.ts` names it. */
const PUBLIC_MEDIA_BUCKET = 'public-media';

/**
 * The most files one call removes from each queue.
 *
 * Normally a list holds the one paper of the seat just emptied, or the one
 * picture just replaced. Deleting a whole committee or conference can put many
 * more there at once, and a limit keeps one request from waiting on all of
 * them; the next call carries on.
 */
export const ORPHANED_FILES_PER_SWEEP = 100;

/**
 * How many paths one "cross off" request names. The paths travel in the
 * request's address (`storage_path=in.(…)`), and a hundred long paths make it
 * longer than the server accepts ("URI too long"), which left every path on the
 * list for ever once enough had piled up. Twenty stays well under the limit.
 */
export const ORPHANED_PATHS_PER_DELETE = 20;

/**
 * How often the server sweeps both buckets for files nobody saved, in
 * milliseconds. A file is only swept an hour after its upload, so a quarter of
 * an hour keeps the wait short without asking the database every minute.
 */
export const STORAGE_SWEEP_INTERVAL_MS = 15 * 60 * 1000;

/** One queue: the table that lists the paths, its two columns, and the bucket the paths are in. */
type CleanupQueue = {
	table: 'orphaned_document_files' | 'public_media_cleanup';
	pathColumn: 'storage_path' | 'path';
	queuedAtColumn: 'orphaned_at' | 'queued_at';
	bucket: string;
};

const DOCUMENTS_QUEUE: CleanupQueue = {
	table: 'orphaned_document_files',
	pathColumn: 'storage_path',
	queuedAtColumn: 'orphaned_at',
	bucket: DOCUMENTS_BUCKET
};

const PUBLIC_MEDIA_QUEUE: CleanupQueue = {
	table: 'public_media_cleanup',
	pathColumn: 'path',
	queuedAtColumn: 'queued_at',
	bucket: PUBLIC_MEDIA_BUCKET
};

/**
 * Whether this process has already said that it cannot sweep at all.
 *
 * `createServiceRoleClient` throws when `SUPABASE_SERVICE_ROLE_KEY` is not set,
 * and the container on the public site is not given that key today
 * (`docker-compose.yaml` passes only the Stripe secrets). The sweep runs inside
 * every seat change, so one line per failure would repeat on each of them and
 * read as noise, and no line at all is how the files piled up unnoticed. One
 * loud line per process is what gets a missing key fixed.
 */
let hasReportedMissingServiceRole = false;

/** Says, once per process and in capitals, that no orphaned file is being removed. */
function reportMissingServiceRoleOnce(error: unknown): void {
	if (hasReportedMissingServiceRole) {
		return;
	}
	hasReportedMissingServiceRole = true;
	console.error(
		'ORPHANED DOCUMENT FILES ARE NOT BEING REMOVED on this server: ' +
			`${String(error)} Give the app the service role key that service-role.ts reads, or ` +
			'every file whose row is deleted stays in Storage and on the orphaned_document_files ' +
			'list. This is said once per process.'
	);
}

/** Reads up to one batch of paths waiting in a queue, oldest first, or `null` when the read failed. */
async function readQueuedPaths(
	serviceRole: SupabaseClient,
	queue: CleanupQueue
): Promise<string[] | null> {
	const { data, error } = await serviceRole
		.from(queue.table)
		.select(queue.pathColumn)
		.order(queue.queuedAtColumn)
		.limit(ORPHANED_FILES_PER_SWEEP)
		.overrideTypes<Record<string, string>[], { merge: false }>();

	if (error) {
		console.error(`Could not read ${queue.table}: ${error.message}`);
		return null;
	}

	const rows = data ?? [];

	return rows.map((row) => row[queue.pathColumn]);
}

/**
 * Removes every file still waiting in one queue, up to
 * `ORPHANED_FILES_PER_SWEEP` of them, and then crosses them off. A path that
 * could not be removed stays on the list for the next sweep; a path whose file
 * is already gone is not an error, because Storage removes nothing and says so.
 */
async function drainQueue(serviceRole: SupabaseClient, queue: CleanupQueue): Promise<void> {
	const paths = await readQueuedPaths(serviceRole, queue);

	if (paths === null || paths.length === 0) {
		return;
	}

	const { error: removeError } = await serviceRole.storage.from(queue.bucket).remove(paths);

	if (removeError) {
		console.error(`Could not remove the files listed in ${queue.table}: ${removeError.message}`);
		return;
	}

	for (let start = 0; start < paths.length; start += ORPHANED_PATHS_PER_DELETE) {
		const chunk = paths.slice(start, start + ORPHANED_PATHS_PER_DELETE);
		const { error: deleteError } = await serviceRole
			.from(queue.table)
			.delete()
			.in(queue.pathColumn, chunk);

		if (deleteError) {
			console.error(
				`Could not cross off the removed files in ${queue.table}: ${deleteError.message}`
			);
			return;
		}
	}
}

/**
 * Removes every file still waiting in `orphaned_document_files` and in
 * `public_media_cleanup`, up to `ORPHANED_FILES_PER_SWEEP` from each, and
 * crosses them off the lists.
 *
 * It never throws. It runs after a seat has already been emptied, which is
 * what the person asked for, so a failure here is logged rather than shown to
 * them: the file stays on its queue and the next sweep tries it again. One
 * queue failing does not stop the other.
 */
export async function removeOrphanedDocumentFiles(): Promise<void> {
	let serviceRole: SupabaseClient;

	try {
		serviceRole = createServiceRoleClient();
	} catch (error) {
		reportMissingServiceRoleOnce(error);
		return;
	}

	await drainQueue(serviceRole, DOCUMENTS_QUEUE);
	await drainQueue(serviceRole, PUBLIC_MEDIA_QUEUE);
}

/**
 * Puts every file nobody saved on the cleanup queues and then empties both,
 * the way `removeOrphanedDocumentFiles` does. Which files count as unsaved,
 * and why a new upload is left alone for an hour, is the database's to say
 * (`queue_unreferenced_uploads`, migration 20261022162000).
 *
 * It never throws, for the same reason as the sweep above: nobody is waiting
 * on it, so a failure is a line in the log. When the files could not be
 * queued, what was already waiting is still removed.
 */
export async function sweepStorage(): Promise<void> {
	let serviceRole: SupabaseClient;

	try {
		serviceRole = createServiceRoleClient();
	} catch (error) {
		reportMissingServiceRoleOnce(error);
		return;
	}

	const { error } = await serviceRole.rpc('queue_unreferenced_uploads');

	if (error) {
		console.error(`Could not queue the files nobody saved: ${error.message}`);
	}

	await drainQueue(serviceRole, DOCUMENTS_QUEUE);
	await drainQueue(serviceRole, PUBLIC_MEDIA_QUEUE);
}

/**
 * Runs `sweepStorage` every `STORAGE_SWEEP_INTERVAL_MS` for as long as the
 * server runs. Answers a function that stops it.
 *
 * `unref()` tells Node not to keep the process alive for this timer alone, so
 * a server that is shutting down, or a test run, ends without waiting on it.
 */
export function scheduleStorageSweep(): () => void {
	const timer = setInterval(() => {
		sweepStorage().catch((error: unknown) => {
			console.error(`The storage sweep failed: ${String(error)}`);
		});
	}, STORAGE_SWEEP_INTERVAL_MS);

	timer.unref();

	return () => clearInterval(timer);
}
