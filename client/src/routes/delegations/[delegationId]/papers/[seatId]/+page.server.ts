import { error, redirect } from '@sveltejs/kit';
import { sharedPaperView } from '$lib/delegation-papers';
import { paperHeading } from '$lib/paper-sheet';
import { addressedComment, type PaperCommentTarget } from '$lib/paper-comments';
import { PAPER_WRITING_MESSAGES } from '$lib/paper-writing';
import { paperThreadsDependency } from '$lib/paper-threads-live';
import { delegationPaperUrl, positionPaperWayUrl } from '$lib/urls';
import { requireDelegationMember, requireOnboarded } from '$lib/server/access';
import { getConferenceBySlug } from '$lib/server/conferences';
import {
	findDelegationPaper,
	readCommitteeTopics,
	readDelegationSharing
} from '$lib/server/delegation-papers';
import { setFlash } from '$lib/server/flash';
import { paperCommentActions } from '$lib/server/paper-comment-actions';
import { markThreadNotificationsRead, readPaperThreads } from '$lib/server/paper-comments';
import { readWrittenForm, saveDraftFromForm } from '$lib/server/paper-draft-form';
import { readLivePaperSetup } from '$lib/server/paper-live-drafts';
import { readPaperDraft } from '$lib/server/position-paper-drafts';
// `./$types` holds the types SvelteKit generates for this one route, so they
// already know this address has a `delegationId` and a `seatId` in it.
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/** What a seat no member of the delegation holds answers: the 404 of a page that is not there. */
const NO_SUCH_PAPER = 'This page does not exist.';

/**
 * Runs on the server before a fellow member's paper is drawn (T147): the
 * paper, its draft with who saved it last, the deadline, the committee's
 * topics, who the delegation is and what writing it live needs (T148).
 *
 * `parent()` waits for the layout's own `load`, which has already turned
 * away anybody who is not in this delegation. A seat no member of it holds,
 * as after the seat changed hands, is a 404. The seat's own delegate is sent
 * to their own position paper page, the only one where it can be submitted.
 */
export const load: PageServerLoad = async ({ locals, url, params, parent, depends }) => {
	const { delegation, conference } = await parent();
	const user = await requireOnboarded(locals, url);
	const supabase = locals.supabase;
	const paper = await findDelegationPaper(supabase, delegation.id, params.seatId);

	if (!paper) error(404, NO_SUCH_PAPER);

	if (paper.holderId === user.id) {
		redirect(303, positionPaperWayUrl(conference.slug, paper.committeeSlug, 'write'));
	}

	const threadsOn: PaperCommentTarget = { kind: 'position', seatId: paper.seatId };

	// `depends` names this load, so the margin can ask for it to run again
	// with `invalidate` when somebody in the delegation comments (`PaperThreadsLive`).
	depends(paperThreadsDependency(threadsOn));

	// None of these needs another's answer, so they run side by side.
	const [draft, fullConference, topics, sharing] = await Promise.all([
		readPaperDraft(supabase, paper.seatId),
		getConferenceBySlug(supabase, conference.slug),
		readCommitteeTopics(supabase, paper.committeeSlug, conference.id),
		readDelegationSharing(supabase, delegation)
	]);

	if (!fullConference) error(404, NO_SUCH_PAPER);

	const deadline = {
		positionPaperDeadline: fullConference.positionPaperDeadline,
		timezone: fullConference.timezone
	};
	const { view, closedReason } = sharedPaperView(paper, draft !== null, deadline, new Date());
	// What writing the paper together live needs (T148).
	const live = await readLivePaperSetup(supabase, paper.seatId, sharing, user.id);

	// A shared paper's margin, which the whole delegation writes in
	// (`docs/committee-papers.md`, decision 15). Nobody's seat is named, since
	// its members sit in different committees.
	const threads =
		live && view === 'editor'
			? await readPaperThreads(supabase, threadsOn, {
					id: user.id,
					committeeId: null,
					timeZone: fullConference.timezone
				})
			: [];

	// Whoever has the page open has seen its threads, so their bell stops counting them.
	await markThreadNotificationsRead(
		supabase,
		user.id,
		threads.map((thread) => thread.id)
	);

	// The lines the paper opens with, drawn above the text (Trello S6HLyL5Y).
	const sheetHeading = paperHeading({
		seatName: paper.seatName,
		countryCode: paper.countryCode,
		committeeName: paper.committeeName,
		conferenceName: fullConference.name,
		topics
	});

	return {
		paper,
		draft,
		deadline,
		topics,
		sharing,
		live,
		readerId: user.id,
		view,
		closedReason,
		sheetHeading,
		threads,
		timeZone: fullConference.timezone,
		// The comment `?editComment=` or `?deleteComment=` opens, so both work without JavaScript.
		commentAddress: addressedComment(url.searchParams, threads)
	};
};

/**
 * The paper a comment action is on, checked again as `saveDraft` checks it,
 * and the page it comes back to.
 */
async function findCommentedPaper(event: RequestEvent) {
	const { delegationId, seatId } = event.params;
	const { user, delegation } = await requireDelegationMember(event.locals, event.url, delegationId);
	const paper = await findDelegationPaper(event.locals.supabase, delegation.id, seatId);

	if (!paper || paper.holderId === user.id) error(404, NO_SUCH_PAPER);

	return {
		target: { kind: 'position', seatId: paper.seatId } satisfies PaperCommentTarget,
		pageUrl: delegationPaperUrl(delegation.id, paper.seatId)
	};
}

export const actions: Actions = {
	// "Comment", "Reply", "Resolve" and the rest of the margin, shared with the
	// committee paper page (`$lib/server/paper-comment-actions.ts`).
	...paperCommentActions(findCommentedPaper),

	/**
	 * Save a fellow member's draft. The editor's autosave sends `background=1`
	 * and is answered with data; "Save draft" without JavaScript comes back to
	 * this page. There is no submit here: only the delegate in the seat hands
	 * a paper in, from their own page.
	 *
	 * An action is its own request and is handed nothing `load` worked out, so
	 * membership and the seat are checked again (`permissions.md`). Row Level
	 * Security checks both a third time underneath.
	 */
	saveDraft: async (event) => {
		const { delegationId, seatId } = event.params;
		const { user, delegation } = await requireDelegationMember(
			event.locals,
			event.url,
			delegationId
		);
		const paper = await findDelegationPaper(event.locals.supabase, delegation.id, seatId);

		if (!paper || paper.holderId === user.id) error(404, NO_SUCH_PAPER);

		const form = readWrittenForm(await event.request.formData());
		const saved = await saveDraftFromForm(event.locals.supabase, paper.seatId, form);

		if (saved.refusal) return saved.refusal;

		// A live save (T148) also carries back the others' changes the page lacks.
		if (form.isBackground) {
			return { draftSaved: { revision: saved.revision, missing: saved.missing ?? undefined } };
		}

		setFlash(event.cookies, { tone: 'success', message: PAPER_WRITING_MESSAGES.draftSaved });
		redirect(303, delegationPaperUrl(delegation.id, paper.seatId));
	}
};
