import { fail, redirect } from '@sveltejs/kit';
import { isAllowedFile, isDocumentAudience, isGuideAudience } from '$lib/documents';
import {
	approvedMessage,
	filterPaperSeats,
	hasResourceFormErrors,
	readDocumentsView,
	reviewCommentProblem,
	validateResourceForm,
	type PaperSeatRow,
	type ResourceFormErrors,
	type ResourceFormValues
} from '$lib/documents-page';
import { hasPermission } from '$lib/permissions';
import { manageDocumentsUrl } from '$lib/urls';
import { requireManagePage, requirePermission } from '$lib/server/access';
import { listBackgroundGuides, uploadBackgroundGuide } from '$lib/server/documents';
import { setFlash } from '$lib/server/flash';
import {
	approvePositionPapers,
	listPaperSeats,
	positionPaperOverview,
	reviewPositionPaper
} from '$lib/server/paper-reviews';
import {
	deleteDocument,
	listResources,
	updateDocumentAudience,
	uploadResource
} from '$lib/server/resources';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/**
 * What every action on this page answers with when it does not redirect.
 * Each form reads only its own part and ignores the rest.
 */
type DocumentsPageResult = {
	/** What was typed into the resource form, or `null` when it was another form. */
	resourceValues: ResourceFormValues | null;
	resourceErrors: ResourceFormErrors;
	/** The committee whose guide form `guideError` belongs under. */
	guideCommitteeId: string | null;
	guideError: string | null;
	/** What was typed into "Request changes", so a refusal keeps it. */
	reviewComment: string | null;
	reviewError: string | null;
	/** A problem with the whole page rather than one field, shown in a `Notice`. */
	message: string | null;
};

/** The empty answer every refusal below starts from. */
const EMPTY_RESULT: DocumentsPageResult = {
	resourceValues: null,
	resourceErrors: {},
	guideCommitteeId: null,
	guideError: null,
	reviewComment: null,
	reviewError: null,
	message: null
};

/** What the storage failure says, from the "Error" state of the page file. */
const UPLOAD_FAILED = 'The upload failed. Please try again.';

/**
 * Refuse, sending the page back with `fields` filled in. `fail` makes the
 * result arrive in the page as `form`, and the page is drawn again as it was.
 */
function refuse(status: number, fields: Partial<DocumentsPageResult>) {
	return fail(status, { ...EMPTY_RESULT, ...fields } satisfies DocumentsPageResult);
}

/**
 * The gate of the shared files, asked again at the top of their actions:
 * `manage_documents`. A form action is its own request, and nothing `load`
 * worked out reaches it.
 */
async function requireDocumentManager(event: RequestEvent) {
	return requirePermission(event.locals, event.url, event.params.slug, 'manage_documents');
}

/**
 * The gate of the background guides, asked again at the top of their action:
 * `manage_committees` across the conference. A chair who edits only their own
 * committee's guide does it in the committee's editor instead.
 */
async function requireGuideEditor(event: RequestEvent) {
	return requirePermission(event.locals, event.url, event.params.slug, 'manage_committees');
}

/**
 * The gate of the position papers' review: `review_papers` across the
 * conference. A chair reviews their own committee's papers in the chair room.
 */
async function requirePaperReviewer(event: RequestEvent) {
	return requirePermission(event.locals, event.url, event.params.slug, 'review_papers');
}

/**
 * Back to the tab and committee the organiser was on, with a message in a
 * one-shot cookie that the root layout reads and throws away. A redirecting
 * action cannot return anything, so the cookie is how the message travels.
 * The review form is closed again, because it has done its job.
 */
function backToPage(event: RequestEvent, message: string): never {
	const view = readDocumentsView(event.url.searchParams);

	setFlash(event.cookies, { tone: 'success', message });
	redirect(303, manageDocumentsUrl(event.params.slug, { ...view, reviewDocumentId: null }));
}

/** The text of one form field, trimmed. A missing field reads as empty. */
function readText(formData: FormData, fieldName: string): string {
	return String(formData.get(fieldName) ?? '').trim();
}

/**
 * The file in one file box, or `null` when the request carried none. A box
 * nobody chose a file in still sends an empty `File`, which `isAllowedFile`
 * answers with "Choose a file to upload.".
 */
function readFile(formData: FormData, fieldName: string): File | null {
	const entry = formData.get(fieldName);

	if (entry instanceof File) {
		return entry;
	}

	return null;
}

/**
 * Everything the page draws, on top of what the layout above it has already read.
 *
 * `parent()` is a promise for what the layout's own `load` returned. The layout
 * let in anybody whose permissions open some page of this conference, and
 * handed those permissions down; the first lines below answer a 404 unless they
 * open this one.
 *
 * All three tabs are read whichever is open, because every tab label carries
 * a count. `load` runs again whenever the address changes, so a tab or a
 * committee row is a plain link.
 */
export const load: PageServerLoad = async ({ parent, url, locals }) => {
	const { conference, permissions } = await parent();
	// A 404 unless the reader's permissions open this page, by the table in
	// `$lib/manage-pages.ts`.
	requireManagePage(permissions, 'documents');

	// The guides and papers tabs are for somebody who edits every committee and
	// reviews every paper, such as a Head of academics. Somebody who manages
	// the shared files alone sees those, with no tabs, whatever `?tab=` says.
	const canSeeCommitteeDocuments =
		hasPermission(permissions, 'manage_committees') && hasPermission(permissions, 'review_papers');
	const view = canSeeCommitteeDocuments
		? readDocumentsView(url.searchParams)
		: readDocumentsView(new URLSearchParams());

	const [resources, guides, paperCommittees] = await Promise.all([
		listResources(locals.supabase, conference.id),
		canSeeCommitteeDocuments ? listBackgroundGuides(locals.supabase, conference.id) : [],
		canSeeCommitteeDocuments ? positionPaperOverview(locals.supabase, conference.id) : []
	]);

	// A committee id that is not one of this conference's shows no seat list,
	// rather than reading seats from somewhere else.
	const selectedCommittee =
		paperCommittees.find((committee) => committee.committeeId === view.committeeId) ?? null;

	let paperSeats: PaperSeatRow[] = [];

	if (selectedCommittee) {
		const allSeats = await listPaperSeats(
			locals.supabase,
			conference.id,
			selectedCommittee.committeeId
		);
		paperSeats = filterPaperSeats(allSeats, view.paper);
	}

	return {
		view,
		/** Whether the background guides and position papers tabs are drawn. */
		canSeeCommitteeDocuments,
		resources,
		guides,
		paperCommittees,
		selectedCommittee,
		paperSeats
	};
};

export const actions: Actions = {
	/** Share a new file with the conference. */
	uploadResource: async (event) => {
		const { user, conference } = await requireDocumentManager(event);

		const formData = await event.request.formData();
		const values: ResourceFormValues = {
			title: readText(formData, 'title'),
			audience: readText(formData, 'audience')
		};
		const file = readFile(formData, 'file');
		const audience = values.audience;
		const errors = validateResourceForm(values, file, isDocumentAudience(audience));

		// The last two only repeat what `errors` already says, in a form
		// TypeScript can follow: past this line there is a file and a real audience.
		if (hasResourceFormErrors(errors) || !file || !isDocumentAudience(audience)) {
			return refuse(400, { resourceValues: values, resourceErrors: errors });
		}

		/*
			A 500 rather than a 400: every value the organiser sent was fine, and
			Storage is ours, so there is nothing for them to fix but trying again.
		*/
		try {
			await uploadResource(event.locals.supabase, {
				conferenceId: conference.id,
				uploadedBy: user.id,
				title: values.title,
				file,
				audience
			});
		} catch {
			return refuse(500, { resourceValues: values, message: UPLOAD_FAILED });
		}

		backToPage(event, 'Resource uploaded.');
	},

	/** Change who one resource is for. */
	updateResourceAudience: async (event) => {
		const { conference } = await requireDocumentManager(event);

		const formData = await event.request.formData();
		const documentId = readText(formData, 'documentId');
		const audience = readText(formData, 'audience');

		if (!isDocumentAudience(audience)) {
			return refuse(400, { message: 'Please say who the file is for.' });
		}

		const wasChanged = await updateDocumentAudience(
			event.locals.supabase,
			conference.id,
			documentId,
			audience
		);

		if (!wasChanged) {
			return refuse(400, { message: 'That file is not part of this conference.' });
		}

		backToPage(event, 'Audience changed.');
	},

	/**
	 * Delete a resource or a background guide, once `ConfirmButton` has asked.
	 * The database lets a documents manager delete resources only, so a guide
	 * named by somebody without the guides gets "not part of this conference".
	 */
	deleteDocument: async (event) => {
		const { conference } = await requireDocumentManager(event);

		const formData = await event.request.formData();
		const documentId = readText(formData, 'documentId');

		// `ConfirmButton` always sends `confirm=1`, so only a hand-made request lacks it.
		if (formData.get('confirm') !== '1') {
			return refuse(400, { message: 'Please confirm before deleting a file.' });
		}

		const wasDeleted = await deleteDocument(event.locals.supabase, conference.id, documentId);

		if (!wasDeleted) {
			return refuse(400, { message: 'That file is not part of this conference.' });
		}

		backToPage(event, 'File deleted.');
	},

	/** Upload a committee's background guide, replacing the one it had. */
	uploadBackgroundGuide: async (event) => {
		const { user, conference } = await requireGuideEditor(event);

		const formData = await event.request.formData();
		const committeeId = readText(formData, 'committeeId');
		const audience = readText(formData, 'audience');
		const file = readFile(formData, 'file');

		const guides = await listBackgroundGuides(event.locals.supabase, conference.id);
		const committee = guides.find((guide) => guide.committeeId === committeeId);

		// A committee from another conference can only come from a request put
		// together by hand. It is refused like one that does not exist.
		if (!committee) {
			return refuse(404, { message: 'That committee is not part of this conference.' });
		}

		const fileProblem = isAllowedFile(file ?? { type: '', size: 0 }, 'background_guide');

		if (fileProblem || !file) {
			return refuse(400, { guideCommitteeId: committeeId, guideError: fileProblem });
		}

		if (!isGuideAudience(audience)) {
			return refuse(400, {
				guideCommitteeId: committeeId,
				guideError: 'Please say who the background guide is for.'
			});
		}

		try {
			await uploadBackgroundGuide(event.locals.supabase, {
				conferenceId: conference.id,
				committeeId,
				uploadedBy: user.id,
				title: `${committee.committeeHeading} background guide`,
				file,
				audience
			});
		} catch {
			return refuse(500, { guideCommitteeId: committeeId, guideError: UPLOAD_FAILED });
		}

		backToPage(event, `Background guide uploaded for ${committee.committeeHeading}.`);
	},

	/**
	 * Approve one paper. The paper travels in the action's own address,
	 * `&/approvePaper&documentId=…`, because its button sits inside the form
	 * that carries the tick boxes for "Approve selected".
	 */
	approvePaper: async (event) => {
		const { user, conference } = await requirePaperReviewer(event);
		const documentId = event.url.searchParams.get('documentId') ?? '';

		const approvedCount = await approvePositionPapers(
			event.locals.supabase,
			conference.id,
			[documentId],
			user.id
		);

		if (approvedCount === 0) {
			return refuse(400, { message: 'That paper is not waiting to be approved.' });
		}

		backToPage(event, approvedMessage(approvedCount));
	},

	/** Approve every ticked paper. Those already approved are skipped without a word. */
	bulkApprovePapers: async (event) => {
		const { user, conference } = await requirePaperReviewer(event);

		const formData = await event.request.formData();
		const documentIds = formData.getAll('ids').map((value) => String(value));

		if (documentIds.length === 0) {
			return refuse(400, { message: 'Tick at least one paper to approve.' });
		}

		const approvedCount = await approvePositionPapers(
			event.locals.supabase,
			conference.id,
			documentIds,
			user.id
		);

		backToPage(event, approvedMessage(approvedCount));
	},

	/** Send a paper back to its delegate with a comment, which reopens their upload. */
	requestChanges: async (event) => {
		const { user, conference } = await requirePaperReviewer(event);

		const formData = await event.request.formData();
		const documentId = readText(formData, 'documentId');
		const reviewComment = readText(formData, 'reviewComment');
		const commentProblem = reviewCommentProblem(reviewComment);

		if (commentProblem) {
			return refuse(400, { reviewComment, reviewError: commentProblem });
		}

		const wasReviewed = await reviewPositionPaper(
			event.locals.supabase,
			conference.id,
			documentId,
			{ status: 'changes_requested', comment: reviewComment },
			user.id
		);

		if (!wasReviewed) {
			return refuse(400, { reviewComment, message: 'That paper is not part of this conference.' });
		}

		backToPage(event, 'Changes requested. The delegate has been notified.');
	}
};
