import { error, fail, redirect } from '@sveltejs/kit';
import { addressedAmendment, daisAmendmentRows, RULING_MAX_LENGTH } from '$lib/amendment-queue';
import {
	DAIS_PAPER_KINDS,
	PAPER_NUMBER_REFUSAL,
	RETURN_COMMENT_MAX_LENGTH,
	RETURN_COMMENT_REFUSAL,
	approvedMessage,
	proposedNumber,
	readApprovedNumber,
	readDaisDialog,
	readReturnComment,
	returnedMessage,
	reviewMetaLine,
	withdrawnMessage
} from '$lib/chair-resolutions';
import {
	authorWords,
	paperKindAndNumber,
	papersPageTitle,
	type CommitteePaper,
	type PaperKind
} from '$lib/committee-papers';
import type { Flash } from '$lib/flash';
import { amendmentName } from '$lib/paper-amendments';
import { addressedComment, type PaperCommentTarget } from '$lib/paper-comments';
import { paperAmendmentsDependency } from '$lib/paper-amendments-live';
import { paperThreadsDependency } from '$lib/paper-threads-live';
import { resolutionHeading } from '$lib/resolution-heading';
import { withOpeningPhrasesMarked } from '$lib/resolution-reading';
import { hasClauses, paperParts } from '$lib/resolution-text';
import { chairResolutionUrl, chairResolutionsUrl } from '$lib/urls';
import { requireCommitteePermission } from '$lib/server/access';
import {
	approvePaper,
	readDaisReview,
	readDaisWriter,
	returnPaper,
	withdrawPaper
} from '$lib/server/chair-resolutions';
import { readPaperSupport } from '$lib/server/committee-paper-signatures';
import {
	readCommitteePaper,
	readPaperCommittee,
	readPaperPeople
} from '$lib/server/committee-papers';
import { setFlash } from '$lib/server/flash';
import { readIntroducedDraft } from '$lib/server/introduced-draft';
import { renderMarkdown } from '$lib/server/markdown';
import { daisAmendmentActions } from '$lib/server/paper-amendment-actions';
import { paperCommentActions } from '$lib/server/paper-comment-actions';
import { markThreadNotificationsRead, readPaperThreads } from '$lib/server/paper-comments';
import { paperScreenActions, type ScreenedPaper } from '$lib/server/paper-screen-actions';
import { readPaperOnFloor } from '$lib/server/papers-on-floor';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/**
 * One paper the dais may review: a paper of the committee, of a kind the
 * dais approves, that has been sent to the dais at least once. Anything else
 * is answered as a page that does not exist, as the dais has nothing to do
 * with it. `error` works by throwing, so this returns a paper or never returns.
 */
async function requireDaisPaper(
	supabase: SupabaseClient,
	committeeId: string,
	paperId: string
): Promise<CommitteePaper> {
	const paper = await readCommitteePaper(supabase, committeeId, paperId);
	const isDaisKind = (kind: PaperKind) => (DAIS_PAPER_KINDS as readonly PaperKind[]).includes(kind);

	if (paper === null || !isDaisKind(paper.kind) || paper.submittedAt === null) {
		error(404, 'This page does not exist.');
	}

	return paper;
}

/**
 * The paper again, for a form action. An action is its own request and
 * nothing the layout's `load` checked reaches it, so it asks again that the
 * reader runs this committee's room before anything else.
 */
async function requireActionPaper({ locals, url, params }: RequestEvent) {
	const { committee } = await requireCommitteePermission(
		locals,
		url,
		params.slug,
		params.committeeSlug,
		'run_room'
	);

	return requireDaisPaper(locals.supabase, committee.id, params.paperId);
}

/** Refuse with a sentence the root layout shows as a toast, leaving the page as it was. */
function refuse(message: string) {
	const flash: Flash = { tone: 'error', message };

	return fail(400, { flash });
}

/**
 * The review page (`docs/committee-papers.md`, step 5): the paper as it was
 * submitted, its support, and the dais's notes for its authors, with
 * "Approve" and "Return to the authors" while it waits for an answer.
 *
 * Runs on the server after the chair layout's `load`, which has already let
 * in only somebody who may run the room; `parent()` hands over what it returned.
 */
export const load: PageServerLoad = async ({ parent, params, url, locals, depends }) => {
	const { conference, committee, readerId } = await parent();
	const supabase = locals.supabase;
	const paper = await requireDaisPaper(supabase, committee.id, params.paperId);
	const threadsOn: PaperCommentTarget = { kind: 'committee', paperId: paper.id };

	// `depends` names this load, so the margin can ask for it to run again when a note comes in.
	depends(paperThreadsDependency(threadsOn));

	// None of these needs another's answer, so they run side by side.
	const [settings, people, review, writer, threads, floor] = await Promise.all([
		readPaperCommittee(supabase, committee.id),
		readPaperPeople(supabase, paper, null),
		readDaisReview(supabase, committee.id, paper),
		readDaisWriter(supabase, committee.id, readerId),
		readPaperThreads(supabase, threadsOn, {
			id: readerId,
			committeeId: committee.id,
			timeZone: conference.timezone
		}),
		readPaperOnFloor(supabase, committee.id, paper.id)
	]);
	const support = hasClauses(paper.kind)
		? await readPaperSupport(supabase, committee.id, people)
		: null;

	// The dais has read the notes on the paper, so its bell stops counting them.
	await markThreadNotificationsRead(
		supabase,
		readerId,
		threads.map((thread) => thread.id)
	);

	const leadSeatName = people.find((person) => person.isLead)?.seatName ?? null;

	// An introduced draft's amendments, in the order the dais works through them (step 7).
	const isIntroducedDraft = paper.kind === 'draft_resolution' && paper.status === 'introduced';
	if (isIntroducedDraft) depends(paperAmendmentsDependency(paper.id));
	const introduced = isIntroducedDraft
		? await readIntroducedDraft(supabase, {
				paperId: paper.id,
				committeeId: committee.id,
				reader: null,
				sponsorsWord: authorWords(settings.paperWords, paper.kind).heading.toLowerCase(),
				timeZone: conference.timezone
			})
		: null;
	const amendmentRows = introduced === null ? null : daisAmendmentRows(introduced.cards);
	// `?ruleOut=3` opens "Rule out of order" over the page, so it works without JavaScript.
	const rulingOut =
		amendmentRows === null
			? null
			: addressedAmendment(
					url.searchParams,
					'ruleOut',
					amendmentRows.filter((row) => row.choices.mayDecide).map((row) => row.card.amendment)
				);

	return {
		papersTitle: papersPageTitle(settings.format),
		paper: {
			id: paper.id,
			kind: paper.kind,
			status: paper.status,
			title: paper.title,
			topicNumber: paper.topicNumber,
			sequence: paper.sequence
		},
		metaLine: reviewMetaLine(paper, leadSeatName, review.version, conference.timezone),
		// The number "Approve" offers, worked out as the database would; only while it waits.
		proposedNumber:
			paper.status === 'submitted'
				? proposedNumber(paper, committee.topics, review.numbered)
				: null,
		people,
		words: authorWords(settings.paperWords, paper.kind),
		paperWords: settings.paperWords,
		support,
		heading: hasClauses(paper.kind)
			? resolutionHeading({ committee, topic: paper.topic, people, words: settings.paperWords })
			: null,
		// The editor opens the stored document; without one it is seeded from the Markdown.
		documentState: review.documentState,
		body: paper.body,
		// Without JavaScript the text is drawn here, its opening phrases styled.
		bodyHtml: renderMarkdown(withOpeningPhrasesMarked(paper.kind, paper.body)),
		threads,
		writer,
		// The database takes notes until the paper is introduced (`start_thread`).
		mayComment: paper.status === 'submitted' || paper.status === 'approved',
		commentAddress: addressedComment(url.searchParams, threads),
		dialog: readDaisDialog(url.searchParams, paper.status),
		returnCommentMaxLength: RETURN_COMMENT_MAX_LENGTH,
		amendments: amendmentRows,
		rulingOut: rulingOut && { id: rulingOut.id, name: amendmentName(rulingOut) },
		rulingMaxLength: RULING_MAX_LENGTH,
		// "Show on screen" and the clause buttons, once the paper is introduced.
		screen: floor.mayShowOnScreen ? { isOnScreen: floor.isOnScreen, step: floor.screenStep } : null
	};
};

/** The paper a note is on, checked again, and the page it comes back to. */
async function findCommentedPaper(event: RequestEvent) {
	const paper = await requireActionPaper(event);

	return {
		target: { kind: 'committee', paperId: paper.id } satisfies PaperCommentTarget,
		pageUrl: chairResolutionUrl(event.params.slug, event.params.committeeSlug, paper.id),
		parts: paperParts(paper.kind)
	};
}

/** The draft an amendment is on, checked again, and the review page it comes back to. */
async function findAmendedPaper(event: RequestEvent) {
	const paper = await requireActionPaper(event);

	return {
		paperId: paper.id,
		pageUrl: chairResolutionUrl(event.params.slug, event.params.committeeSlug, paper.id)
	};
}

/**
 * The paper the projector's buttons are about, checked again as
 * `requireActionPaper` checks it, with its committee, whose screen they change.
 */
async function findScreenedPaper({ locals, url, params }: RequestEvent): Promise<ScreenedPaper> {
	const { committee } = await requireCommitteePermission(
		locals,
		url,
		params.slug,
		params.committeeSlug,
		'run_room'
	);
	const paper = await requireDaisPaper(locals.supabase, committee.id, params.paperId);

	return {
		committeeId: committee.id,
		paperId: paper.id,
		name: paperKindAndNumber(paper),
		pageUrl: chairResolutionUrl(params.slug, params.committeeSlug, paper.id)
	};
}

export const actions: Actions = {
	// "Comment", "Reply", "Resolve" and the rest of the margin, shared with the
	// authors' page (`$lib/server/paper-comment-actions.ts`).
	...paperCommentActions(findCommentedPaper),

	// "Approve" and "Rule out of order" on an introduced draft's amendments
	// (`$lib/server/paper-amendment-actions.ts`).
	...daisAmendmentActions(findAmendedPaper),
	// "Show on screen", "Take off screen", "Previous clause" and "Next clause",
	// shared with the paper's reading page (`$lib/server/paper-screen-actions.ts`).
	...paperScreenActions(findScreenedPaper),

	/** "Approve as Draft resolution 1.1": the paper takes the number in the box. */
	approve: async (event) => {
		const paper = await requireActionPaper(event);
		const number = readApprovedNumber(await event.request.formData());

		if (number === null) return refuse(PAPER_NUMBER_REFUSAL);

		const change = await approvePaper(event.locals.supabase, paper.id, number);

		if (change.refusal !== null) return refuse(change.refusal);

		setFlash(event.cookies, {
			tone: 'success',
			message: approvedMessage(paper.title, paper.kind, number)
		});
		redirect(303, chairResolutionsUrl(event.params.slug, event.params.committeeSlug));
	},

	/** "Return to the authors": the paper goes back to be written again, with the dais's comment. */
	return: async (event) => {
		const paper = await requireActionPaper(event);
		const comment = readReturnComment(await event.request.formData());

		if (comment === null || comment.length > RETURN_COMMENT_MAX_LENGTH) {
			return refuse(RETURN_COMMENT_REFUSAL);
		}

		const change = await returnPaper(event.locals.supabase, paper.id, comment);

		if (change.refusal !== null) return refuse(change.refusal);

		setFlash(event.cookies, { tone: 'success', message: returnedMessage(paper.title) });
		redirect(303, chairResolutionsUrl(event.params.slug, event.params.committeeSlug));
	},

	/** "Withdraw at the sponsors' request", once the paper is on the floor. */
	withdraw: async (event) => {
		const paper = await requireActionPaper(event);
		const change = await withdrawPaper(event.locals.supabase, paper.id);

		if (change.refusal !== null) return refuse(change.refusal);

		setFlash(event.cookies, { tone: 'success', message: withdrawnMessage(paper) });
		redirect(303, chairResolutionUrl(event.params.slug, event.params.committeeSlug, paper.id));
	}
};
