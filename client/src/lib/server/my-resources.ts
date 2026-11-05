/**
 * Every resource and background guide the reader may see across every
 * conference they take part in or staff, for `/resources`.
 *
 * Files under `$lib/server` only ever run on the server. `readMyMemberships`
 * in `$lib/server/schedule.ts` already works out every conference somebody is
 * part of — as a delegate, in a delegation, on the staff, or chairing a
 * committee — so this reuses it rather than asking the same four questions
 * again. Row Level Security then narrows the documents themselves: the
 * `documents` select rule in `specs/02-architecture/permissions.md` answers by
 * a file's `audience`, so this file never has to ask who may read what.
 *
 * `specs/05-pages/delegate/resources.md` calls this function
 * `listMyResources(supabase, userId)` in `$lib/server/documents.ts`. It lives
 * here instead, in its own file, because `$lib/server/documents.ts` already
 * holds the position paper and review flows T37 built alongside this one, and
 * splitting the reader's own resource list out keeps each file to one topic,
 * the way `02-modularisation` rules ask for.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ResourceListItem } from '$lib/resources';
import { listConferencesByIds } from '$lib/server/conferences';
import { createDownloadLinks } from '$lib/server/document-storage';
import { readMyMemberships } from '$lib/server/schedule';

/** The two kinds of document `/resources` lists, `06-features/documents.md`. */
type MyResourceKind = 'resource' | 'background_guide';

/** One `documents` row as `listMyResources` reads it. */
type MyResourceRow = {
	id: string;
	conference_id: string;
	kind: string;
	title: string;
	file_name: string;
	file_size_bytes: number;
	mime_type: string;
	storage_path: string;
	/** Only present for a background guide; `null` for a conference-level resource. */
	committees: { abbreviation: string | null; name: string } | null;
};

/** The columns `readDocumentRows` asks for, with the committee for a background guide. */
const MY_RESOURCE_COLUMNS =
	'id, conference_id, kind, title, file_name, file_size_bytes, mime_type, storage_path, committees(abbreviation, name)';

/**
 * Is this one of the two kinds `/resources` lists? The table's own check
 * constraint already keeps `kind` to its five values, so this only ever
 * narrows the type for the compiler.
 */
function isMyResourceKind(kind: string): kind is MyResourceKind {
	return kind === 'resource' || kind === 'background_guide';
}

/** A background guide's committee, read as its abbreviation, or its name when it has none. */
function committeeLabelFrom(row: MyResourceRow): string | null {
	if (!row.committees) {
		return null;
	}

	return row.committees.abbreviation || row.committees.name;
}

/**
 * Every `resource` and `background_guide` row of these conferences that Row
 * Level Security lets this reader see.
 */
async function readDocumentRows(
	supabase: SupabaseClient,
	conferenceIds: string[]
): Promise<MyResourceRow[]> {
	const { data, error } = await supabase
		.from('documents')
		.select(MY_RESOURCE_COLUMNS)
		.in('conference_id', conferenceIds)
		.in('kind', ['resource', 'background_guide'])
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<MyResourceRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read your resources: ${error.message}`);
	}

	return data ?? [];
}

/** A prepared row, still carrying its storage path, before download links are filled in. */
type PreparedResource = ResourceListItem & { storagePath: string };

/**
 * Every resource and background guide the reader may see, grouped by the
 * conferences they are part of, soonest conference first and then by title.
 *
 * Two questions run side by side once the reader's conferences are known: the
 * conferences themselves, for the name, slug and logo the page shows under
 * each group, and the files of every kind `/resources` lists.
 * `listConferencesByIds` already answers soonest-conference-first, so that
 * order is kept rather than asked of the database a second time.
 */
export async function listMyResources(
	supabase: SupabaseClient,
	userId: string
): Promise<ResourceListItem[]> {
	const memberships = await readMyMemberships(supabase, userId);
	const conferenceIds = [...memberships.keys()];

	if (conferenceIds.length === 0) {
		return [];
	}

	const [conferences, documentRows] = await Promise.all([
		listConferencesByIds(supabase, conferenceIds),
		readDocumentRows(supabase, conferenceIds)
	]);

	const conferencesById = new Map(conferences.map((conference) => [conference.id, conference]));
	// Where each conference sits in `conferences`, which is already ordered
	// soonest first: what the resources below are sorted by.
	const conferenceOrder = new Map(conferences.map((conference, index) => [conference.id, index]));

	const prepared: PreparedResource[] = [];

	for (const row of documentRows) {
		const conference = conferencesById.get(row.conference_id);

		// Without its conference there is nothing to group it under, and
		// `readMyMemberships` only ever found conferences that still exist.
		if (!conference || !isMyResourceKind(row.kind)) {
			continue;
		}

		prepared.push({
			id: row.id,
			title: row.title,
			fileName: row.file_name,
			fileSizeBytes: row.file_size_bytes,
			mimeType: row.mime_type,
			kind: row.kind,
			conferenceId: conference.id,
			conferenceName: conference.name,
			conferenceSlug: conference.slug,
			conferenceLogoPath: conference.logoPath,
			committeeLabel: committeeLabelFrom(row),
			// Filled in below, once every path has a link.
			downloadUrl: null,
			storagePath: row.storage_path
		});
	}

	prepared.sort((a, b) => {
		const orderDifference =
			(conferenceOrder.get(a.conferenceId) ?? 0) - (conferenceOrder.get(b.conferenceId) ?? 0);

		return orderDifference !== 0 ? orderDifference : a.title.localeCompare(b.title);
	});

	const downloadLinks = await createDownloadLinks(
		supabase,
		prepared.map((resource) => resource.storagePath)
	);

	return prepared.map(({ storagePath, ...resource }) => ({
		...resource,
		downloadUrl: downloadLinks.get(storagePath) ?? null
	}));
}
