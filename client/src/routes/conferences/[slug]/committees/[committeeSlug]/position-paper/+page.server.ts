import { error, fail, redirect } from '@sveltejs/kit';
import { canRemovePositionPaper, canUploadPositionPaper, isAllowedFile } from '$lib/documents';
import {
	PAPER_WRITING_MESSAGES,
	isUnchangedResubmission,
	readPaperWay,
	writtenPaperProblem
} from '$lib/paper-writing';
import { addressedComment, type PaperCommentTarget } from '$lib/paper-comments';
import { paperHeading } from '$lib/paper-sheet';
import { paperThreadsDependency } from '$lib/paper-threads-live';
import { positionPaperUrl, positionPaperWayUrl } from '$lib/urls';
import { requireOnboarded, type SignedInUser } from '$lib/server/access';
import { readPaperSharing } from '$lib/server/delegation-papers';
import { setFlash } from '$lib/server/flash';
import { paperCommentActions } from '$lib/server/paper-comment-actions';
import { markThreadNotificationsRead, readPaperThreads } from '$lib/server/paper-comments';
import {
	SERVER_PROBLEM_MESSAGE,
	readWrittenForm,
	refuseWriting,
	saveDraftFromForm
} from '$lib/server/paper-draft-form';
import { readLivePaperSetup } from '$lib/server/paper-live-drafts';
import { deletePaperDraft, readPaperDraft } from '$lib/server/position-paper-drafts';
import {
	getMyPositionPaper,
	removePositionPaper,
	submitWrittenPaper,
	uploadPositionPaper,
	type MyPositionPaper
} from '$lib/server/position-papers';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/** What every action on this page answers with, when it does not redirect. */
type PositionPaperResult = {
	/** A problem with the file that was chosen, shown under the upload box. */
	error: string | null;
};

/** Refuse with a message about the file that was chosen, leaving the page as it was drawn. */
function refuse(status: number, message: string) {
	return fail(status, { error: message } satisfies PositionPaperResult);
}

/**
 * The signed-in delegate and their position paper, checked again at the top of
 * every action.
 *
 * A form action is its own request and nothing `load` worked out reaches it
 * (`specs/02-architecture/permissions.md`), so the seat and the paper are read
 * afresh here too. A delegate without a seat in this committee, or a
 * conference or committee that does not exist, all end up as the same 404:
 * `05-pages/delegate/position-paper.md` says a missing role is never a 403.
 */
async function requireMyPaper(
	event: RequestEvent
): Promise<{ user: SignedInUser; paper: MyPositionPaper }> {
	const user = await requireOnboarded(event.locals, event.url);
	const paper = await getMyPositionPaper(
		event.locals.supabase,
		event.params.slug,
		event.params.committeeSlug,
		user.id
	);

	if (!paper) {
		error(404, 'This page does not exist.');
	}

	return { user, paper };
}

/** Back to this same page, which is where both actions below send the reader. */
function backToPage(event: RequestEvent): never {
	redirect(303, positionPaperUrl(event.params.slug, event.params.committeeSlug));
}

/**
 * The file chosen in the upload box, or `null` when none was.
 *
 * A file box nobody chose a file in still posts a `File`: one with no name, no
 * type and a size of 0. `isAllowedFile` below reads that as "no file chosen"
 * and gives its own message, the same way `readChosenGuide` in
 * `manage/[slug]/committees/[committeeId]/+page.server.ts` does for a
 * background guide.
 */
function readChosenFile(formData: FormData): File {
	const chosen = formData.get('file');

	return chosen instanceof File ? chosen : new File([], '');
}

/**
 * Runs on the server before the page is drawn: the reader's own seat, their
 * position paper if they have handed one in, their draft of a written one
 * with who saved it last, the delegation it is shared with (T147) and what
 * writing it together live needs (T148), and the
 * deadline and topics of the committee it belongs to. It runs again
 * whenever the address changes, as when the reader picks the other way.
 */
export const load: PageServerLoad = async (event) => {
	const { user, paper } = await requireMyPaper(event);
	const supabase = event.locals.supabase;
	const threadsOn: PaperCommentTarget = { kind: 'position', seatId: paper.seat.id };

	// `depends` names this load, so the margin can ask for it to run again
	// with `invalidate` when somebody in the delegation comments (`PaperThreadsLive`).
	event.depends(paperThreadsDependency(threadsOn));

	// Neither needs the other's answer, so the two run side by side.
	const [draft, sharing] = await Promise.all([
		readPaperDraft(supabase, paper.seat.id),
		readPaperSharing(supabase, paper.conference.id, user.id)
	]);
	const hasUploadedFile = paper.document !== null && paper.document.bodyMarkdown === null;
	// Shared with at least one other member, the paper is written live (T148).
	const live = await readLivePaperSetup(supabase, paper.seat.id, sharing, user.id);
	const way = readPaperWay(event.url.searchParams.get('way'), hasUploadedFile);

	// A shared paper's margin: the delegation comments on it and suggests
	// changes as a bloc does (`docs/committee-papers.md`, decision 15). Its
	// members sit in different committees, so no seats are named.
	const threads =
		live && way === 'write'
			? await readPaperThreads(supabase, threadsOn, {
					id: user.id,
					committeeId: null,
					timeZone: paper.conference.timezone
				})
			: [];

	// Whoever has the page open has seen its threads, so their bell stops counting them.
	await markThreadNotificationsRead(
		supabase,
		user.id,
		threads.map((thread) => thread.id)
	);

	return {
		paper,
		draft,
		// The delegation the draft is shared with (T147), or `null` for a delegate on their own.
		sharing,
		live,
		// The lines the paper opens with, drawn above the text wherever it is shown (Trello S6HLyL5Y).
		sheetHeading: paperHeading({
			seatName: paper.seat.name,
			countryCode: paper.seat.countryCode,
			committeeName: paper.committee.name,
			conferenceName: paper.conference.name,
			topics: paper.committee.topics
		}),
		readerId: user.id,
		way,
		// "Edit and resubmit" opens a submitted written paper in the editor again.
		isEditing: event.url.searchParams.get('edit') === '1',
		threads,
		// The comment `?editComment=` or `?deleteComment=` opens, so both work without JavaScript.
		commentAddress: addressedComment(event.url.searchParams, threads)
	};
};

/** The paper a comment action is on, checked again, and the page it comes back to. */
async function findCommentedPaper(event: RequestEvent) {
	const { paper } = await requireMyPaper(event);

	return {
		target: { kind: 'position', seatId: paper.seat.id } satisfies PaperCommentTarget,
		pageUrl: positionPaperWayUrl(event.params.slug, event.params.committeeSlug, 'write')
	};
}

export const actions: Actions = {
	// "Comment", "Reply", "Resolve" and the rest of the margin, shared with the
	// committee paper page (`$lib/server/paper-comment-actions.ts`).
	...paperCommentActions(findCommentedPaper),

	/** Put the delegate's position paper in the bucket, replacing the one their seat had. */
	upload: async (event) => {
		const { user, paper } = await requireMyPaper(event);

		const now = new Date();
		const closedReason = canUploadPositionPaper(
			paper.conference,
			paper.document?.reviewStatus ?? null,
			now
		);

		if (closedReason) {
			return refuse(400, closedReason);
		}

		const formData = await event.request.formData();
		const chosenFile = readChosenFile(formData);
		const fileProblem = isAllowedFile(chosenFile, 'position_paper');

		if (fileProblem) {
			return refuse(400, fileProblem);
		}

		/*
			A 500 rather than the 400s above: every value the delegate sent was
			fine, and Storage is ours, so there is nothing here for them to fix.
			`uploadGuide` in the committee editor gives the same reasoning.
		*/
		try {
			await uploadPositionPaper(event.locals.supabase, {
				conferenceId: paper.conference.id,
				committeeId: paper.committee.id,
				seatId: paper.seat.id,
				userId: user.id,
				seatName: paper.seat.name,
				committeeHeading: paper.committee.heading,
				file: chosenFile
			});
		} catch {
			return refuse(500, SERVER_PROBLEM_MESSAGE);
		}

		setFlash(event.cookies, { tone: 'success', message: 'Position paper uploaded.' });
		backToPage(event);
	},

	/**
	 * Save the draft of a written paper. The editor's autosave sends
	 * `background=1` and is answered with data; the "Save draft" button
	 * without JavaScript is sent back to the editor. `saveDraftFromForm`
	 * does the saving, the same way for a fellow member of the delegation.
	 */
	saveDraft: async (event) => {
		const { paper } = await requireMyPaper(event);
		const form = readWrittenForm(await event.request.formData());
		const saved = await saveDraftFromForm(event.locals.supabase, paper.seat.id, form);

		if (saved.refusal) return saved.refusal;

		// A live save (T148) also carries back the others' changes the page lacks.
		if (form.isBackground) {
			return { draftSaved: { revision: saved.revision, missing: saved.missing ?? undefined } };
		}

		setFlash(event.cookies, { tone: 'success', message: PAPER_WRITING_MESSAGES.draftSaved });
		redirect(
			303,
			positionPaperWayUrl(event.params.slug, event.params.committeeSlug, 'write', true)
		);
	},

	/**
	 * Submit the written paper for review, replacing whatever the seat had
	 * handed in before, and drop the draft it was written in. The same deadline
	 * and review rules as an upload decide whether it may.
	 */
	submitWritten: async (event) => {
		const { user, paper } = await requireMyPaper(event);
		const form = readWrittenForm(await event.request.formData());
		const document = paper.document;

		const closedReason = canUploadPositionPaper(
			paper.conference,
			document?.reviewStatus ?? null,
			new Date()
		);

		if (closedReason) return refuseWriting(400, closedReason, form.body);

		const problem = writtenPaperProblem(form.body);

		if (problem) return refuseWriting(400, problem, form.body);

		// The database refuses this too: only a new version may go back to "submitted".
		const submittedBody = document?.bodyMarkdown ?? null;

		if (isUnchangedResubmission(submittedBody, document?.reviewStatus ?? null, form.body)) {
			return refuseWriting(400, PAPER_WRITING_MESSAGES.unchanged, form.body);
		}

		try {
			await submitWrittenPaper(event.locals.supabase, {
				conferenceId: paper.conference.id,
				committeeId: paper.committee.id,
				seatId: paper.seat.id,
				userId: user.id,
				seatName: paper.seat.name,
				committeeHeading: paper.committee.heading,
				body: form.body
			});
		} catch {
			return refuseWriting(500, SERVER_PROBLEM_MESSAGE, form.body);
		}

		/*
			The paper is in, so a draft that cannot be dropped is no reason to
			say it failed. The draft stays, and "Edit and resubmit" starts from it.
		*/
		try {
			await deletePaperDraft(event.locals.supabase, paper.seat.id);
		} catch {
			// Nothing to do: see above.
		}

		setFlash(event.cookies, { tone: 'success', message: PAPER_WRITING_MESSAGES.submitted });
		backToPage(event);
	},

	/** Take the delegate's position paper away: the row first, then the file behind it. */
	remove: async (event) => {
		const { paper } = await requireMyPaper(event);

		const now = new Date();
		const mayRemove =
			paper.document !== null &&
			canRemovePositionPaper(paper.conference, paper.document.reviewStatus, now);

		if (!mayRemove || !paper.document) {
			return refuse(400, 'This position paper can no longer be removed.');
		}

		const wasRemoved = await removePositionPaper(event.locals.supabase, paper.document.id);

		// Row Level Security refused it between the two questions, which means
		// the paper was reviewed, or the deadline passed, while this request was
		// in the air.
		if (!wasRemoved) {
			return refuse(400, 'This position paper can no longer be removed.');
		}

		setFlash(event.cookies, { tone: 'success', message: 'Position paper removed.' });
		backToPage(event);
	}
};
