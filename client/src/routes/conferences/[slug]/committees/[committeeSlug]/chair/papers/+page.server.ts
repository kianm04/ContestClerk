import { fail, redirect } from '@sveltejs/kit';
import {
	PAPER_REFUSALS,
	approvalCommentProblem,
	defaultGuideTitle,
	guideFileProblem,
	readPaperStatusFilter
} from '$lib/chair-papers';
import { isGuideAudience } from '$lib/documents';
import {
	approvedMessage,
	countPaperStatuses,
	filterPaperSeats,
	reviewCommentProblem
} from '$lib/documents-page';
import type { Flash } from '$lib/flash';
import { chairPapersUrl } from '$lib/urls';
import { requireCommitteePermission, requireCommitteeTool } from '$lib/server/access';
import {
	getBackgroundGuide,
	removeBackgroundGuide,
	uploadBackgroundGuide
} from '$lib/server/documents';
import { setFlash } from '$lib/server/flash';
import {
	approveSubmittedPapers,
	listPaperSeats,
	reviewCommitteePaper
} from '$lib/server/paper-reviews';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/**
 * Runs on the server, after the chair layout's `load` has checked the reader
 * and read the room's frame. `parent()` hands over what the layout returned.
 *
 * It reads every seated delegate of the committee with their paper and a
 * one-minute link to it, and the committee's background guide. `?status=`
 * narrows the list; the counts always cover every seat. `load` runs again
 * whenever the address changes, so the filter is a plain GET form.
 */
export const load: PageServerLoad = async ({ parent, locals, url }) => {
	const { conference, committee, committeeTools } = await parent();
	// The console opened for `run_room`; this page asks its own permission too.
	requireCommitteeTool(committeeTools, 'mayReviewPapers');
	const statusFilter = readPaperStatusFilter(url.searchParams.get('status'));

	const [allSeats, guide] = await Promise.all([
		listPaperSeats(locals.supabase, conference.id, committee.id),
		getBackgroundGuide(locals.supabase, committee.id)
	]);

	return {
		statusFilter,
		counts: countPaperStatuses(allSeats.map((seat) => seat.status)),
		seatedCount: allSeats.length,
		paperSeats: filterPaperSeats(allSeats, statusFilter),
		guide,
		guideTitle: defaultGuideTitle(committee)
	};
};

/**
 * What a refused form sends back, so the form that was used keeps what was
 * typed. The page reads only the part that belongs to each form.
 */
type PapersPageResult = {
	flash: Flash;
	/** The paper whose review form was refused, so only its box shows the error. */
	reviewDocumentId: string | null;
	reviewComment: string | null;
	reviewError: string | null;
	guideTitle: string | null;
	guideAudience: string | null;
	guideError: string | null;
};

/** Refuse, staying on the page. The root layout shows `flash` as a toast. */
function refuse(status: number, message: string, fields: Partial<PapersPageResult> = {}) {
	return fail(status, {
		reviewDocumentId: null,
		reviewComment: null,
		reviewError: null,
		guideTitle: null,
		guideAudience: null,
		guideError: null,
		...fields,
		flash: { tone: 'error', message }
	} satisfies PapersPageResult);
}

/**
 * The chair gate, asked again at the top of every action: an action is its
 * own request, so nothing `load` worked out reaches it.
 */
async function openPapers(event: RequestEvent) {
	return requireCommitteePermission(
		event.locals,
		event.url,
		event.params.slug,
		event.params.committeeSlug,
		'review_papers'
	);
}

/**
 * Back to the list with a message. A redirect cannot carry one, so it travels
 * in a one-shot cookie the root layout reads. Every form posts to an address
 * that still holds `?status=`, so the chair comes back to the same filter.
 */
function backToPapers(event: RequestEvent, message: string): never {
	setFlash(event.cookies, { tone: 'success', message });
	redirect(
		303,
		chairPapersUrl(
			event.params.slug,
			event.params.committeeSlug,
			readPaperStatusFilter(event.url.searchParams.get('status'))
		)
	);
}

/** The text of one form field, trimmed. A missing field reads as empty. */
function readText(formData: FormData, fieldName: string): string {
	return String(formData.get(fieldName) ?? '').trim();
}

export const actions: Actions = {
	/** Approve one paper, with an optional comment for the delegate. */
	approve: async (event) => {
		const { user, committee } = await openPapers(event);
		const formData = await event.request.formData();
		const documentId = readText(formData, 'documentId');
		const comment = readText(formData, 'comment');
		const problem = approvalCommentProblem(comment);

		if (problem !== null) {
			return refuse(400, problem, {
				reviewDocumentId: documentId,
				reviewComment: comment,
				reviewError: problem
			});
		}

		// The `notify_document_reviewed` trigger tells the delegate.
		const review = { status: 'approved' as const, comment: comment === '' ? null : comment };
		const isSaved = await reviewCommitteePaper(
			event.locals.supabase,
			committee.id,
			documentId,
			review,
			user.id
		);

		if (!isSaved) return refuse(400, PAPER_REFUSALS.otherCommittee);

		backToPapers(event, 'Approved. The delegate has been notified.');
	},

	/** Send a paper back with a comment. This reopens the delegate's upload. */
	requestChanges: async (event) => {
		const { user, committee } = await openPapers(event);
		const formData = await event.request.formData();
		const documentId = readText(formData, 'documentId');
		const comment = readText(formData, 'comment');
		const problem = reviewCommentProblem(comment);

		if (problem !== null) {
			return refuse(400, problem, {
				reviewDocumentId: documentId,
				reviewComment: comment,
				reviewError: problem
			});
		}

		const review = { status: 'changes_requested' as const, comment };
		const isSaved = await reviewCommitteePaper(
			event.locals.supabase,
			committee.id,
			documentId,
			review,
			user.id
		);

		if (!isSaved) return refuse(400, PAPER_REFUSALS.otherCommittee, { reviewComment: comment });

		backToPapers(event, 'Changes requested. The delegate has been notified.');
	},

	/** Approve every paper of the committee that is awaiting review, once confirmed. */
	approveAll: async (event) => {
		const { user, committee } = await openPapers(event);
		const formData = await event.request.formData();

		// `ConfirmButton` always sends `confirm=1`, so only a hand-made request lacks it.
		if (formData.get('confirm') !== '1') return refuse(400, PAPER_REFUSALS.confirmApproveAll);

		const approvedCount = await approveSubmittedPapers(
			event.locals.supabase,
			committee.id,
			user.id
		);

		if (approvedCount === 0) return refuse(400, PAPER_REFUSALS.nothingToApprove);

		backToPapers(event, approvedMessage(approvedCount));
	},

	/** Upload the committee's background guide, replacing the one it had. */
	uploadBackgroundGuide: async (event) => {
		const { user, conference, committee } = await openPapers(event);
		const formData = await event.request.formData();
		const audience = readText(formData, 'audience');
		const title = readText(formData, 'title');
		const entry = formData.get('file');
		// A box nobody chose a file in still sends an empty `File`.
		const file = entry instanceof File ? entry : null;
		const typed = { guideTitle: title, guideAudience: audience };

		const fileProblem = guideFileProblem(file ?? { type: '', size: 0 });

		if (fileProblem !== null || file === null) {
			const message = fileProblem ?? PAPER_REFUSALS.guideFile;
			return refuse(400, message, { ...typed, guideError: message });
		}

		if (!isGuideAudience(audience)) {
			const message = PAPER_REFUSALS.guideAudience;
			return refuse(400, message, { ...typed, guideError: message });
		}

		// A 500 rather than a 400: everything the chair sent was fine, so there
		// is nothing for them to fix but trying again.
		try {
			await uploadBackgroundGuide(event.locals.supabase, {
				conferenceId: conference.id,
				committeeId: committee.id,
				uploadedBy: user.id,
				title: title === '' ? defaultGuideTitle(committee) : title,
				file,
				audience
			});
		} catch {
			const message = PAPER_REFUSALS.uploadFailed;
			return refuse(500, message, { ...typed, guideError: message });
		}

		backToPapers(event, 'Background guide uploaded.');
	},

	/** Remove the committee's background guide, row and file, once confirmed. */
	removeBackgroundGuide: async (event) => {
		const { committee } = await openPapers(event);
		const formData = await event.request.formData();
		const documentId = readText(formData, 'documentId');

		if (formData.get('confirm') !== '1') return refuse(400, PAPER_REFUSALS.confirmRemove);

		// The form names the guide it showed. If somebody replaced it since, the
		// newer guide is not removed by a button pressed on the older one.
		const guide = await getBackgroundGuide(event.locals.supabase, committee.id);

		if (guide === null || guide.id !== documentId) return refuse(400, PAPER_REFUSALS.noGuide);

		const isRemoved = await removeBackgroundGuide(event.locals.supabase, committee.id);

		if (!isRemoved) return refuse(400, PAPER_REFUSALS.noGuide);

		backToPapers(event, 'Background guide removed.');
	}
};
