/**
 * A conference's resources: the rules of procedure, venue maps and templates an
 * organiser shares from `/manage/[slug]/documents`, and the public conference
 * page lists when they are meant for everyone.
 *
 * Files under `$lib/server` only ever run on the server. Every function takes
 * the signed-in person's Supabase client, so Row Level Security decides which
 * resources each reader gets back: the `documents` select rule in
 * `specs/02-architecture/permissions.md` answers by the file's `audience`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
	isDocumentAudience,
	resourcePath,
	type DocumentAudience,
	type ResourceFile
} from '$lib/documents';
import {
	createDownloadLinks,
	deleteDocumentObject,
	uploadDocumentObject
} from '$lib/server/document-storage';

/** One `documents` row holding a resource, as `listResources` reads it. */
type ResourceRow = {
	id: string;
	title: string;
	file_name: string;
	file_size_bytes: number;
	mime_type: string;
	audience: string;
	created_at: string;
	uploaded_by: string;
	storage_path: string;
};

/**
 * The names of the people who uploaded, by user id.
 *
 * `documents.uploaded_by` points at the account rather than at `profiles`, so
 * the names are a second query rather than a join. A visitor may read no
 * profiles at all, and then the map is simply empty.
 */
async function readUploaderNames(
	supabase: SupabaseClient,
	userIds: string[]
): Promise<Map<string, string>> {
	const names = new Map<string, string>();

	if (userIds.length === 0) {
		return names;
	}

	const { data } = await supabase
		.from('profiles')
		.select('id, full_name')
		.in('id', userIds)
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<{ id: string; full_name: string }[], { merge: false }>();

	for (const profile of data ?? []) {
		names.set(profile.id, profile.full_name);
	}

	return names;
}

/**
 * The audience on a row, narrowed to the three a resource can have. Anything
 * else reads as `delegates`, so a row the check constraint should have
 * prevented never widens who is told a file exists.
 */
function toDocumentAudience(audience: string): DocumentAudience {
	if (isDocumentAudience(audience)) {
		return audience;
	}

	return 'delegates';
}

/**
 * Every resource of one conference the reader may see, by title, each with a
 * one-minute download link.
 *
 * The organiser sees them all. The public conference page calls this too, and
 * for a visitor Row Level Security returns only the ones meant for everyone.
 */
export async function listResources(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<ResourceFile[]> {
	const { data, error } = await supabase
		.from('documents')
		.select(
			'id, title, file_name, file_size_bytes, mime_type, audience, created_at, uploaded_by, storage_path'
		)
		.eq('conference_id', conferenceId)
		.eq('kind', 'resource')
		.order('title')
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<ResourceRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the resources: ${error.message}`);
	}

	const rows: ResourceRow[] = data ?? [];
	const uploaderIds = [...new Set(rows.map((row) => row.uploaded_by))];
	const storagePaths = rows.map((row) => row.storage_path);

	const [uploaderNames, downloadLinks] = await Promise.all([
		readUploaderNames(supabase, uploaderIds),
		createDownloadLinks(supabase, storagePaths)
	]);

	return rows.map((row) => ({
		id: row.id,
		title: row.title,
		fileName: row.file_name,
		fileSizeBytes: row.file_size_bytes,
		mimeType: row.mime_type,
		audience: toDocumentAudience(row.audience),
		createdAt: row.created_at,
		uploaderName: uploaderNames.get(row.uploaded_by) ?? null,
		downloadUrl: downloadLinks.get(row.storage_path) ?? null
	}));
}

/** Everything a new resource needs. */
export type NewResource = {
	conferenceId: string;
	/** The signed-in organiser's user id, which the insert policy insists on. */
	uploadedBy: string;
	title: string;
	file: File;
	audience: DocumentAudience;
};

/**
 * Put a resource in the bucket and write its row.
 *
 * The file goes first, so a row never points at nothing. When the row cannot
 * be written the file just uploaded is taken away again, and the error is
 * thrown so the page can say the upload failed.
 */
export async function uploadResource(
	supabase: SupabaseClient,
	resource: NewResource
): Promise<void> {
	const storagePath = resourcePath(resource.conferenceId, resource.file.type);

	await uploadDocumentObject(supabase, storagePath, resource.file);

	const { error } = await supabase.from('documents').insert({
		conference_id: resource.conferenceId,
		uploaded_by: resource.uploadedBy,
		kind: 'resource',
		title: resource.title,
		storage_path: storagePath,
		file_name: resource.file.name,
		file_size_bytes: resource.file.size,
		mime_type: resource.file.type,
		audience: resource.audience
	});

	if (error) {
		await deleteDocumentObject(supabase, storagePath);
		throw new Error(`Could not save the resource: ${error.message}`);
	}
}

/**
 * Change who a resource is for. `false` means no resource of this conference
 * has that id, or Row Level Security would not let the change through.
 */
export async function updateDocumentAudience(
	supabase: SupabaseClient,
	conferenceId: string,
	documentId: string,
	audience: DocumentAudience
): Promise<boolean> {
	const { data, error } = await supabase
		.from('documents')
		.update({ audience })
		.eq('id', documentId)
		.eq('conference_id', conferenceId)
		.eq('kind', 'resource')
		// A refused update comes back with no error and no rows, so asking for
		// the ids of what changed is what tells "done" from "refused".
		.select('id')
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<{ id: string }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not change who the file is for: ${error.message}`);
	}

	return (data ?? []).length > 0;
}

/**
 * Delete a resource or a background guide of this conference: the row first,
 * then the object, so no page is left pointing at a file that has gone.
 * `false` means there was no such file here, or the delete was refused.
 *
 * Position papers are left out on purpose. They belong to the delegate, and
 * the organiser's page offers no button that removes one.
 */
export async function deleteDocument(
	supabase: SupabaseClient,
	conferenceId: string,
	documentId: string
): Promise<boolean> {
	const { data, error } = await supabase
		.from('documents')
		.delete()
		.eq('id', documentId)
		.eq('conference_id', conferenceId)
		.in('kind', ['resource', 'background_guide'])
		// The deleted row's path is what says which object to remove next, and
		// an empty answer is how a refused delete shows itself.
		.select('storage_path')
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<{ storage_path: string }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not delete the file: ${error.message}`);
	}

	const deleted: { storage_path: string }[] = data ?? [];

	if (deleted.length === 0) {
		return false;
	}

	await deleteDocumentObject(supabase, deleted[0].storage_path);

	return true;
}
