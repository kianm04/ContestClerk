import { createServiceRoleClient } from '../db/supabase-test-client';
import type { TestUser } from './signed-in-user';

// What `resources.spec.ts` seeds before it opens `/resources`: conference-level
// resources and committee background guides, really in the `documents` bucket,
// so their signed links open a file.
//
// The service-role client writes these rows and objects the way an organiser's
// own upload form would. It arranges the state a test begins in and is never
// used to show that something is allowed, which is what
// `tests/db/supabase-test-client.ts` warns against; Row Level Security itself
// is `tests/db/documents.test.ts`'s job.

/** The private bucket every document lives in. */
const DOCUMENTS_BUCKET = 'documents';

/** The smallest file a PDF viewer recognises as one, which is all a test needs. */
const TINY_PDF = '%PDF-1.7\n%%EOF\n';

/** What `addResourceFile` may be told. */
export type ResourceFileSeed = {
	conferenceId: string;
	/** Who uploaded it, as an organiser's own upload would record. */
	uploadedBy: string;
	title: string;
	audience?: 'everyone' | 'delegates' | 'staff';
};

/** Upload a small PDF as a conference-level resource, and answer its row's id. */
export async function addResourceFile(seed: ResourceFileSeed): Promise<string> {
	const admin = createServiceRoleClient();
	const storagePath = `${seed.conferenceId}/resources/${crypto.randomUUID()}.pdf`;

	const { error: uploadError } = await admin.storage
		.from(DOCUMENTS_BUCKET)
		.upload(storagePath, new Blob([TINY_PDF], { type: 'application/pdf' }), {
			contentType: 'application/pdf'
		});

	if (uploadError) {
		throw new Error(`Could not upload the test resource: ${uploadError.message}`);
	}

	const { data, error } = await admin
		.from('documents')
		.insert({
			conference_id: seed.conferenceId,
			uploaded_by: seed.uploadedBy,
			kind: 'resource',
			title: seed.title,
			storage_path: storagePath,
			file_name: `${seed.title}.pdf`,
			file_size_bytes: TINY_PDF.length,
			mime_type: 'application/pdf',
			audience: seed.audience ?? 'delegates'
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test resource: ${error?.message}`);
	}

	return data.id;
}

/** What `addBackgroundGuideFile` may be told. */
export type BackgroundGuideFileSeed = {
	conferenceId: string;
	committeeId: string;
	/** Who uploaded it, as an organiser's or a chair's own upload would record. */
	uploadedBy: string;
	audience?: 'everyone' | 'delegates' | 'staff';
};

/** Upload a small PDF as one committee's background guide, and answer its row's id. */
export async function addBackgroundGuideFile(seed: BackgroundGuideFileSeed): Promise<string> {
	const admin = createServiceRoleClient();
	const storagePath = `${seed.conferenceId}/background-guides/${seed.committeeId}-${crypto.randomUUID()}.pdf`;

	const { error: uploadError } = await admin.storage
		.from(DOCUMENTS_BUCKET)
		.upload(storagePath, new Blob([TINY_PDF], { type: 'application/pdf' }), {
			contentType: 'application/pdf'
		});

	if (uploadError) {
		throw new Error(`Could not upload the test background guide: ${uploadError.message}`);
	}

	const { data, error } = await admin
		.from('documents')
		.insert({
			conference_id: seed.conferenceId,
			committee_id: seed.committeeId,
			uploaded_by: seed.uploadedBy,
			kind: 'background_guide',
			title: 'Background guide',
			storage_path: storagePath,
			file_name: 'background-guide.pdf',
			file_size_bytes: TINY_PDF.length,
			mime_type: 'application/pdf',
			audience: seed.audience ?? 'everyone'
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test background guide: ${error?.message}`);
	}

	return data.id;
}

/** Seat `user` under a name in a committee, so that they read what a delegate reads. */
export async function seatAsDelegate(
	user: TestUser,
	committeeId: string,
	seatName: string
): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin.from('seats').insert({
		committee_id: committeeId,
		name: seatName,
		user_id: user.id,
		allocated_at: new Date().toISOString()
	});

	if (error) {
		throw new Error(`Could not seat the test delegate: ${error.message}`);
	}
}
