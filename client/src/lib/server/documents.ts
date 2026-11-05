/**
 * Where a committee's background guide is read, replaced and taken away, where
 * the organiser's documents page lists every committee's guide at once, and
 * where the committees list learns how many files each committee has.
 *
 * Files under `$lib/server` only ever run on the server, so this is where the
 * `documents` table and the `documents` bucket are reached. Every function
 * takes the Supabase client as its first argument. Pages pass in
 * `locals.supabase`, the client that knows who is signed in, so the database's
 * Row Level Security rules (see `specs/02-architecture/permissions.md`) decide
 * what each reader gets back and what each writer may save.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { committeeHeading } from '$lib/committees';
import {
	backgroundGuidePath,
	isGuideAudience,
	type BackgroundGuide,
	type CommitteeGuide,
	type GuideAudience
} from '$lib/documents';
import {
	createDownloadLink,
	createDownloadLinks,
	deleteDocumentObject,
	uploadDocumentObject
} from '$lib/server/document-storage';

/** One `documents` row holding a background guide, as `getBackgroundGuide` reads it. */
type GuideRow = {
	id: string;
	title: string;
	file_name: string;
	file_size_bytes: number;
	/**
	 * The database's `audience` enum, which has five values, although a guide
	 * only ever carries two of them. `toGuideAudience` below is what narrows it.
	 */
	audience: string;
	storage_path: string;
};

/**
 * The `audience` on a guide row, narrowed to the two values a guide can have.
 *
 * The column is the database's `audience` enum, and the
 * `documents_audience_is_answerable` check constraint in migration 0013 already
 * keeps it to a value the select policies can answer for. So anything outside
 * the two is a row that should not exist, and the safe reading of one is the
 * narrower of the two: a row the check constraint should have prevented must
 * not widen who may download a file.
 */
function toGuideAudience(audience: string): GuideAudience {
	if (isGuideAudience(audience)) {
		return audience;
	}

	return 'delegates';
}

/**
 * One committee's background guide with a one-minute signed address for it, or
 * `null` when the committee has none.
 */
export async function getBackgroundGuide(
	supabase: SupabaseClient,
	committeeId: string
): Promise<BackgroundGuide | null> {
	const { data, error } = await supabase
		.from('documents')
		// `mime_type` is not asked for: a guide is always `application/pdf`, which
		// `pdfFileProblem` in `$lib/documents.ts` sees to before an upload happens,
		// and nothing on the page shows it.
		.select('id, title, file_name, file_size_bytes, audience, storage_path')
		.eq('committee_id', committeeId)
		.eq('kind', 'background_guide')
		// `maybeSingle` returns one row, or `null` when nothing matches, instead of
		// a list. `documents_one_guide_per_committee` is a unique index, so there is
		// never a second row for it to choose between.
		.maybeSingle()
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<GuideRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not read the background guide: ${error.message}`);
	}

	if (!data) {
		return null;
	}

	// The link downloads the guide under the name the chair gave it.
	const downloadUrl = await createDownloadLink(supabase, data.storage_path, data.file_name);

	return {
		id: data.id,
		title: data.title,
		fileName: data.file_name,
		fileSizeBytes: data.file_size_bytes,
		audience: toGuideAudience(data.audience),
		downloadUrl
	};
}

/** The guide row a committee has at the moment: the row itself, and the object it points at. */
type CurrentGuide = {
	id: string;
	storagePath: string;
};

/**
 * The background guide row this committee has at the moment, or `null` when it
 * has none.
 *
 * Both the upload and the removal start here, because both need to know whether
 * there is a row to write and an object to take away afterwards.
 */
async function readCurrentGuide(
	supabase: SupabaseClient,
	committeeId: string
): Promise<CurrentGuide | null> {
	const { data, error } = await supabase
		.from('documents')
		.select('id, storage_path')
		.eq('committee_id', committeeId)
		.eq('kind', 'background_guide')
		.maybeSingle()
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<{ id: string; storage_path: string }, { merge: false }>();

	if (error) {
		throw new Error(`Could not read the background guide: ${error.message}`);
	}

	if (!data) {
		return null;
	}

	return { id: data.id, storagePath: data.storage_path };
}

/** Everything a new or replacement background guide needs. */
export type NewBackgroundGuide = {
	conferenceId: string;
	committeeId: string;
	/** The signed-in person's user id, which the insert policy insists on. */
	uploadedBy: string;
	/** What the file is called in lists, such as "UNSC background guide". */
	title: string;
	file: File;
	audience: GuideAudience;
};

/** The columns that say which file a guide row points at, and what it is called. */
type GuideFileColumns = {
	title: string;
	storage_path: string;
	file_name: string;
	file_size_bytes: number;
	mime_type: string;
	audience: GuideAudience;
};

/**
 * Write the first background guide row a committee has had.
 *
 * `kind`, `conference_id`, `committee_id` and `uploaded_by` are written here
 * and nowhere else. `protect_documents_columns` in migration 0013 freezes those
 * four and `seat_id` as soon as the row exists, so an insert is the only chance
 * to say them. The insert policies also insist that `uploaded_by` is the
 * signed-in person, which is why `NewBackgroundGuide` carries their id.
 */
async function insertGuideRow(
	supabase: SupabaseClient,
	guide: NewBackgroundGuide,
	fileColumns: GuideFileColumns
): Promise<void> {
	const { error } = await supabase.from('documents').insert({
		...fileColumns,
		conference_id: guide.conferenceId,
		committee_id: guide.committeeId,
		uploaded_by: guide.uploadedBy,
		kind: 'background_guide'
	});

	if (error) {
		throw new Error(`Could not save the background guide: ${error.message}`);
	}
}

/**
 * Point the guide row a committee already has at the file that has just
 * replaced its own.
 *
 * Replacing a guide is an update rather than a delete and a fresh insert
 * because `documents_one_guide_per_committee` is a unique index: a committee
 * has one guide row, so replacing the file writes the row that is already
 * there.
 *
 * Only the columns of `GuideFileColumns` are sent. `protect_documents_columns`
 * freezes `kind`, `conference_id`, `committee_id`, `seat_id` and `uploaded_by`,
 * and an update that changes one of them is refused outright, so sending even
 * the value the row already holds is asking for trouble. It also means an
 * organiser replacing a guide a chair uploaded leaves `uploaded_by` as the
 * chair, which is what the update policy allows.
 */
async function updateGuideRow(
	supabase: SupabaseClient,
	guideId: string,
	fileColumns: GuideFileColumns
): Promise<void> {
	const { data, error } = await supabase
		.from('documents')
		.update(fileColumns)
		.eq('id', guideId)
		.select('id');

	if (error) {
		throw new Error(`Could not save the background guide: ${error.message}`);
	}

	// Row Level Security refusing an update is not an error in Postgres: it
	// changes nothing and says so with an empty list. Raising here stops the
	// caller from deleting the file the row still points at.
	if ((data ?? []).length === 0) {
		throw new Error('Could not save the background guide: you may not change it.');
	}
}

/**
 * Put a committee's background guide in the bucket, replacing the one it had.
 *
 * The order is the one `specs/02-architecture/storage.md` gives, and the same
 * one `uploadConferenceImage` in `./conferences.ts` follows: the new file is
 * uploaded, then the row is pointed at it, and only then is the object it
 * replaced deleted. So a step that fails halfway leaves the committee with the
 * guide it already had rather than pointing at nothing.
 */
export async function uploadBackgroundGuide(
	supabase: SupabaseClient,
	guide: NewBackgroundGuide
): Promise<void> {
	const currentGuide = await readCurrentGuide(supabase, guide.committeeId);
	// The uuid at the end of the path means a new guide is always a new address,
	// so a browser that cached the old file cannot show it in the new one's place.
	const newPath = backgroundGuidePath(guide.conferenceId, guide.committeeId);

	// `uploadDocumentObject` reads the file's first bytes before it goes, so a
	// guide that is not a PDF inside is refused whatever its name says.
	await uploadDocumentObject(supabase, newPath, guide.file);

	const fileColumns: GuideFileColumns = {
		title: guide.title,
		storage_path: newPath,
		file_name: guide.file.name,
		file_size_bytes: guide.file.size,
		mime_type: guide.file.type,
		audience: guide.audience
	};

	if (currentGuide === null) {
		await insertGuideRow(supabase, guide, fileColumns);
		return;
	}

	await updateGuideRow(supabase, currentGuide.id, fileColumns);
	await deleteDocumentObject(supabase, currentGuide.storagePath);
}

/**
 * Take a committee's background guide away. `false` means there was none to
 * take.
 *
 * The row goes first and the object second, the way `removeConferenceImage` in
 * `./conferences.ts` does it, so no page is ever left pointing at a file that
 * has gone.
 */
export async function removeBackgroundGuide(
	supabase: SupabaseClient,
	committeeId: string
): Promise<boolean> {
	const currentGuide = await readCurrentGuide(supabase, committeeId);

	if (currentGuide === null) {
		return false;
	}

	const { data, error } = await supabase
		.from('documents')
		.delete()
		.eq('id', currentGuide.id)
		// Row Level Security refusing a delete comes back with no error and no
		// rows: the policy hides the row, so nothing matches and nothing is
		// deleted. Asking for the ids of what went is what tells the two apart,
		// the same way `deleteCommittee` in `./manage-committees.ts` does.
		.select('id')
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<{ id: string }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not remove the background guide: ${error.message}`);
	}

	const deleted: { id: string }[] = data ?? [];

	if (deleted.length === 0) {
		return false;
	}

	await deleteDocumentObject(supabase, currentGuide.storagePath);

	return true;
}

/** What the committees list says about one committee's files. */
export type CommitteeDocumentCounts = {
	hasBackgroundGuide: boolean;
	positionPaperCount: number;
};

/** One row of the counting query: which committee a file belongs to, and what it is. */
type DocumentCountRow = {
	/**
	 * `null` for a resource, which belongs to the conference and to no committee.
	 * Those rows are skipped, so nothing has to be counted against "no committee".
	 */
	committee_id: string | null;
	kind: string;
};

/**
 * The guide and the position papers of every committee of one conference, by
 * committee id, in one query.
 *
 * It is one query rather than one per committee because the committees list
 * asks the same question of every row on the page, the way
 * `listChairNamesByCommittee` in `./team.ts` does with the chairs' names.
 *
 * A committee with no file of either kind is simply missing from the map, and
 * the caller fills in the empty answer (`hasBackgroundGuide: false` and
 * `positionPaperCount: 0`) for it.
 */
export async function countCommitteeDocuments(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<Map<string, CommitteeDocumentCounts>> {
	const { data, error } = await supabase
		.from('documents')
		.select('committee_id, kind')
		.eq('conference_id', conferenceId)
		.in('kind', ['background_guide', 'position_paper'])
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<DocumentCountRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not count the committees' documents: ${error.message}`);
	}

	const rows: DocumentCountRow[] = data ?? [];
	const counts = new Map<string, CommitteeDocumentCounts>();

	for (const row of rows) {
		// A resource belongs to the conference and names no committee, so there is
		// no committee for it to be counted against.
		if (row.committee_id === null) {
			continue;
		}

		const committeeCounts = counts.get(row.committee_id) ?? {
			hasBackgroundGuide: false,
			positionPaperCount: 0
		};

		if (row.kind === 'background_guide') {
			committeeCounts.hasBackgroundGuide = true;
		}

		if (row.kind === 'position_paper') {
			committeeCounts.positionPaperCount += 1;
		}

		counts.set(row.committee_id, committeeCounts);
	}

	return counts;
}

/** One committee as `listBackgroundGuides` reads it. */
type GuideCommitteeRow = {
	id: string;
	name: string;
	abbreviation: string | null;
};

/** A guide row with the committee it belongs to, for `listBackgroundGuides`. */
type ConferenceGuideRow = GuideRow & { committee_id: string };

/**
 * Every committee of one conference in the organiser's own order, each with
 * its background guide and a one-minute download link for it.
 *
 * Three requests however many committees there are: the committees, every
 * guide of the conference, and one batch of signed links.
 */
export async function listBackgroundGuides(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<CommitteeGuide[]> {
	const [committeesResult, guidesResult] = await Promise.all([
		supabase
			.from('committees')
			.select('id, name, abbreviation')
			.eq('conference_id', conferenceId)
			.order('position', { ascending: true })
			.order('id', { ascending: true })
			// Replaces Supabase's guess at the row's shape with ours. It has to come last.
			.overrideTypes<GuideCommitteeRow[], { merge: false }>(),
		supabase
			.from('documents')
			.select('id, title, file_name, file_size_bytes, audience, storage_path, committee_id')
			.eq('conference_id', conferenceId)
			.eq('kind', 'background_guide')
			.overrideTypes<ConferenceGuideRow[], { merge: false }>()
	]);

	if (committeesResult.error) {
		throw new Error(`Could not list the committees: ${committeesResult.error.message}`);
	}

	if (guidesResult.error) {
		throw new Error(`Could not list the background guides: ${guidesResult.error.message}`);
	}

	const guideRows: ConferenceGuideRow[] = guidesResult.data ?? [];
	const storagePaths = guideRows.map((row) => row.storage_path);
	const downloadLinks = await createDownloadLinks(supabase, storagePaths);

	// `documents_one_guide_per_committee` allows one guide per committee, so the
	// committee's id is enough to find it.
	const guidesByCommittee = new Map<string, BackgroundGuide>();

	for (const row of guideRows) {
		guidesByCommittee.set(row.committee_id, {
			id: row.id,
			title: row.title,
			fileName: row.file_name,
			fileSizeBytes: row.file_size_bytes,
			audience: toGuideAudience(row.audience),
			downloadUrl: downloadLinks.get(row.storage_path) ?? null
		});
	}

	const committees: GuideCommitteeRow[] = committeesResult.data ?? [];

	return committees.map((committee) => ({
		committeeId: committee.id,
		committeeHeading: committeeHeading(committee),
		guide: guidesByCommittee.get(committee.id) ?? null
	}));
}
