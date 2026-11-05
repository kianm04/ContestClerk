import { error, fail, redirect } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { committeeHeading } from '$lib/committees';
import {
	COMMITTEE_PAPER_MESSAGES,
	authorAddedMessage,
	authorWords,
	leadHandedMessage,
	hasPassed,
	paperKindAndNumber,
	paperLiveWriters,
	paperPeopleActions,
	papersPageTitle,
	readChosenSeat,
	readPaperDialog,
	type CommitteePaper,
	type PaperPerson,
	type PaperWords
} from '$lib/committee-papers';
import { crisisPanel, isWithCrisisStaff, submitWords } from '$lib/crisis-papers';
import type { Flash } from '$lib/flash';
import type { LiveWriter } from '$lib/live-writers';
import { addressedComment, type PaperCommentTarget } from '$lib/paper-comments';
import { signingMessage, type SigningAction, type SigningState } from '$lib/paper-signing';
import { isVotedStatus } from '$lib/paper-votes';
import { SUBMITTING_MESSAGES } from '$lib/paper-submitting';
import { paperAmendmentsDependency } from '$lib/paper-amendments-live';
import { paperThreadsDependency } from '$lib/paper-threads-live';
import { resolutionHeading } from '$lib/resolution-heading';
import { withOpeningPhrasesMarked } from '$lib/resolution-reading';
import { hasClauses, paperParts } from '$lib/resolution-text';
import {
	committeePaperPrintUrl,
	committeePaperUrl,
	committeePapersUrl,
	newAmendmentUrl
} from '$lib/urls';
import { requireRoomWatcher } from '$lib/server/access';
import {
	addPaperAuthor,
	deletePaper,
	handPaperLead,
	leavePaper,
	listSeatsToAdd
} from '$lib/server/committee-paper-authors';
import {
	readPaperSupport,
	removeSignature,
	setSignaturesOpen,
	signPaper,
	type SignatureChange
} from '$lib/server/committee-paper-signatures';
import { readPaperSources, readSourcePaper } from '$lib/server/committee-paper-sources';
import {
	readPaperChair,
	readPaperDecision,
	submitCommitteePaper,
	withdrawCommitteePaper,
	type PaperChange
} from '$lib/server/committee-paper-submitting';
import {
	readCommitteePaperDraft,
	readCommitteePaperForm,
	readCommitteePaperSetup,
	saveCommitteePaperFromForm
} from '$lib/server/committee-paper-writing';
import {
	mayWritePaper,
	readCommitteePaper,
	readMyPaperSeat,
	readPaperCommittee,
	readPaperPeople
} from '$lib/server/committee-papers';
import { readCrisisAnswer } from '$lib/server/crisis-desk';
import { readIntroducedDraft } from '$lib/server/introduced-draft';
import { setFlash } from '$lib/server/flash';
import { renderMarkdown } from '$lib/server/markdown';
import { amendmentCardActions } from '$lib/server/paper-amendment-actions';
import { paperCommentActions } from '$lib/server/paper-comment-actions';
import { markThreadNotificationsRead, readPaperThreads } from '$lib/server/paper-comments';
import { paperScreenActions, type ScreenedPaper } from '$lib/server/paper-screen-actions';
import { readPaperVote } from '$lib/server/paper-votes';
import { readPaperOnFloor } from '$lib/server/papers-on-floor';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/**
 * The committee and one of its papers, for somebody who may read it: the
 * same people as the live view (`requireRoomWatcher`), and of those only the
 * ones Row Level Security shows the paper to. While a paper is being written
 * that is its own authors, so anybody else is told the page does not exist.
 *
 * A form action is its own request and nothing `load` worked out reaches it,
 * so every action below asks this again. `error` works by throwing, so this
 * either returns or never returns at all.
 */
async function requirePaper(
	locals: App.Locals,
	url: URL,
	params: { slug: string; committeeSlug: string; paperId: string }
) {
	const { user, conference, committee } = await requireRoomWatcher(
		locals,
		url,
		params.slug,
		params.committeeSlug
	);
	const paper = await readCommitteePaper(locals.supabase, committee.id, params.paperId);

	if (paper === null) {
		error(404, 'This page does not exist.');
	}

	return { user, conference, committee, paper };
}

/**
 * What an author's editor starts from: the paper as stored, and how to write
 * it live. The other authors are named from `people`, so the page shows a
 * cursor only for somebody the server knows writes the paper.
 */
async function readWriting(
	supabase: SupabaseClient,
	paper: CommitteePaper,
	writer: LiveWriter,
	people: PaperPerson[]
) {
	const [draft, live] = await Promise.all([
		readCommitteePaperDraft(supabase, paper),
		readCommitteePaperSetup(supabase, paper, writer, paperLiveWriters(people))
	]);

	return { draft, live };
}

/**
 * A seat's name on the paper and the committee's words for its authors, for
 * the toast once that seat is added or handed the lead. `null` for a seat no
 * longer on the paper, which is then not named at all.
 */
async function readChangedSeat(
	supabase: SupabaseClient,
	committeeId: string,
	paper: CommitteePaper,
	seatId: string
) {
	const [settings, people] = await Promise.all([
		readPaperCommittee(supabase, committeeId),
		readPaperPeople(supabase, paper, null)
	]);
	const seat = people.find((person) => person.seatId === seatId);

	return {
		seatName: seat?.seatName ?? null,
		words: authorWords(settings.paperWords, paper.kind)
	};
}

/**
 * What a draft resolution or a directive shows beside its text: the heading
 * drawn from the data, the support it has, the working papers it is based on,
 * and the one of those `?source=` opens beside it.
 */
async function readResolution(
	supabase: SupabaseClient,
	source: {
		committee: { id: string; name: string; abbreviation: string | null };
		paper: CommitteePaper;
		people: PaperPerson[];
		paperWords: PaperWords;
		url: URL;
		timeZone: string;
	}
) {
	const { committee, paper, people } = source;
	const sourceId = source.url.searchParams.get('source');
	const isDraft = paper.kind === 'draft_resolution';
	const [support, sources, openSource] = await Promise.all([
		readPaperSupport(supabase, committee.id, people),
		isDraft ? readPaperSources(supabase, paper.id) : [],
		isDraft && sourceId !== null
			? readSourcePaper(supabase, paper.id, sourceId, source.timeZone)
			: null
	]);

	return {
		isDraft,
		paperWords: source.paperWords,
		heading: resolutionHeading({
			committee,
			topic: paper.topic,
			people,
			words: source.paperWords
		}),
		support,
		sources,
		openSource
	};
}

/** Refuse with a sentence the root layout shows as a toast, leaving the page as it was. */
function refuse(message: string) {
	const flash: Flash = { tone: 'error', message };

	return fail(400, { flash });
}

/**
 * A paper's page (`docs/committee-papers.md`, section 6): its authors write it
 * here, live, and change who writes it; anybody else who may read it reads it.
 */
export const load: PageServerLoad = async ({ params, url, locals, depends }) => {
	const { user, conference, committee, paper } = await requirePaper(locals, url, params);
	const supabase = locals.supabase;
	const threadsOn: PaperCommentTarget = { kind: 'committee', paperId: paper.id };

	// `depends` names this load, so the margin can ask for it to run again
	// with `invalidate` when another writer comments (`PaperThreadsLive`).
	depends(paperThreadsDependency(threadsOn));
	// And so `PaperAmendmentsLive` can run it again when an amendment changes (step 7).
	depends(paperAmendmentsDependency(paper.id));

	// None of these needs another's answer, so they run side by side.
	const [settings, mySeat, mayWrite, decision, floor] = await Promise.all([
		readPaperCommittee(supabase, committee.id),
		readMyPaperSeat(supabase, committee.id, user.id),
		mayWritePaper(supabase, paper.id),
		readPaperDecision(supabase, committee.id, paper.id),
		readPaperOnFloor(supabase, committee.id, paper.id)
	]);
	const people = await readPaperPeople(supabase, paper, mySeat?.id ?? null);
	const actions = paperPeopleActions(people, paper, mayWrite);
	// Which dialog the address opens over the page: `?add=1` and so on.
	const dialog = readPaperDialog(url.searchParams, actions);

	// The reader as the other authors see them, over their cursor and beside the title.
	const me = people.find((person) => person.isMine);
	const writer: LiveWriter = {
		id: user.id,
		name: me?.holderName ?? mySeat?.name ?? '',
		seatName: mySeat?.name
	};

	// Where the paper stands on signing, for the button in the title row.
	const signing: SigningState = {
		isOpen: paper.isOpenForSignatures,
		openedAt: paper.signaturesOpenedAt,
		isAuthor: mayWrite,
		mySeatName: mySeat?.name ?? null,
		hasSigned: people.some((person) => person.isMine && person.role === 'signatory'),
		isBeingWritten: paper.status === 'writing'
	};
	// Introducing a paper closes its threads, which stay to read for whoever
	// could read them before: Row Level Security still shows each to the same people.
	const areThreadsClosed = floor.introducedAt !== null;
	// A seat that may sign the paper may comment on it too, while it is open
	// and until it is introduced (section 6).
	const mayComment = !areThreadsClosed && (mayWrite || (signing.isOpen && mySeat !== null));

	// What the crisis staff answered, for a paper they decide (section 6).
	const answer = isWithCrisisStaff(paper) ? await readCrisisAnswer(supabase, paper.id) : null;
	const isAuthor = people.some((person) => person.isMine && person.role === 'author');

	// The margin, for the paper's authors and its would-be signatories, and
	// the closed threads of an introduced paper. The dais's comments come in later steps.
	const threads =
		mayComment || areThreadsClosed
			? await readPaperThreads(supabase, threadsOn, {
					id: user.id,
					committeeId: committee.id,
					timeZone: conference.timezone
				})
			: [];

	// Whoever has the page open has seen its threads, so their bell stops counting them.
	await markThreadNotificationsRead(
		supabase,
		user.id,
		threads.map((thread) => thread.id)
	);

	// An introduced draft resolution reads from its latest version, with its amendments beside it.
	const isIntroducedDraft = paper.kind === 'draft_resolution' && paper.status === 'introduced';
	const introduced = isIntroducedDraft
		? await readIntroducedDraft(supabase, {
				paperId: paper.id,
				committeeId: committee.id,
				reader: mySeat && { seatId: mySeat.id, isObserver: mySeat.isObserver },
				sponsorsWord: authorWords(settings.paperWords, paper.kind).heading.toLowerCase(),
				timeZone: conference.timezone
			})
		: null;
	// `?withdrawAmendment=3` opens "Withdraw amendment 3" over the page, for its proposer alone.
	const withdrawSequence = Number(url.searchParams.get('withdrawAmendment'));
	const withdrawingAmendment =
		introduced?.cards.find(
			(card) => card.sequence === withdrawSequence && card.choices.mayWithdraw
		) ?? null;

	return {
		// The timezone says when each suggestion in the margin was made.
		conference: { slug: conference.slug, name: conference.name, timezone: conference.timezone },
		committee: { slug: committee.slug, heading: committeeHeading(committee) },
		// For the breadcrumb: "Resolutions", or "Directives" in a crisis committee.
		papersTitle: papersPageTitle(settings.format),
		paper: {
			id: paper.id,
			kind: paper.kind,
			title: paper.title,
			topic: paper.topic,
			topicNumber: paper.topicNumber,
			sequence: paper.sequence
		},
		people,
		// "Authors" and "Lead", or THIMUN's "Submitters" and "Main submitter".
		words: authorWords(settings.paperWords, paper.kind),
		signing,
		mayComment,
		userId: user.id,
		// A draft resolution's or a directive's heading, support and the papers it draws on.
		resolution: hasClauses(paper.kind)
			? await readResolution(supabase, {
					committee,
					paper,
					people,
					paperWords: settings.paperWords,
					url,
					timeZone: conference.timezone
				})
			: null,
		actions,
		// Where the paper stands with the dais, and the chair its authors wait for while it is there.
		progress: {
			status: paper.status,
			submittedAt: paper.submittedAt,
			decision,
			chair:
				paper.status === 'submitted' && actions.canWithdraw
					? await readPaperChair(supabase, committee.id)
					: null,
			answer,
			// A press release's answer is for its authors; a committee directive's for every reader.
			crisisPanel: crisisPanel(paper, answer, isAuthor, conference.timezone),
			// How the committee's vote went (step 8), and its record copy once it passed.
			vote: isVotedStatus(paper.status) ? await readPaperVote(supabase, paper.id) : null,
			recordHref: hasPassed(paper)
				? committeePaperPrintUrl(params.slug, params.committeeSlug, paper.id)
				: null
		},
		dialog,
		// The seats "Add an author" offers, read only while that dialog is open.
		seatsToAdd: dialog === 'add' ? await listSeatsToAdd(supabase, committee.id, people) : [],
		// An author writes the paper live; anybody else reads its text as it stands.
		writing: mayWrite ? await readWriting(supabase, paper, writer, people) : null,
		// A reader sees the opening phrases styled, as the authors' editor draws them.
		bodyHtml: mayWrite ? null : renderMarkdown(withOpeningPhrasesMarked(paper.kind, paper.body)),
		threads,
		// When it was introduced, and whether the reader may put it on the projector.
		floor,
		areThreadsClosed,
		// The comment `?edit=` or `?deleteComment=` opens, so both work without JavaScript.
		// A closed thread has nothing to edit or delete, so neither address opens anything.
		commentAddress: mayComment ? addressedComment(url.searchParams, threads) : null,
		// Its text as it stands and its amendments, once a draft resolution is introduced.
		introduced,
		// "Propose an amendment", for a delegate's seat; an observer may not propose one.
		proposeHref:
			introduced && mySeat && !mySeat.isObserver
				? newAmendmentUrl(params.slug, params.committeeSlug, paper.id)
				: null,
		withdrawingAmendment: withdrawingAmendment && {
			id: withdrawingAmendment.id,
			name: withdrawingAmendment.name
		}
	};
};

/** The paper a comment action is on, checked again, and the page it comes back to. */
async function findCommentedPaper({ locals, url, params }: RequestEvent) {
	const { paper } = await requirePaper(locals, url, params);

	return {
		target: { kind: 'committee', paperId: paper.id } satisfies PaperCommentTarget,
		pageUrl: committeePaperUrl(params.slug, params.committeeSlug, paper.id),
		parts: paperParts(paper.kind)
	};
}

/** The paper an amendment's card acts on, checked again, and the page it comes back to. */
async function findAmendedPaper({ locals, url, params }: RequestEvent) {
	const { paper } = await requirePaper(locals, url, params);

	return {
		paperId: paper.id,
		pageUrl: committeePaperUrl(params.slug, params.committeeSlug, paper.id)
	};
}

/**
 * One of the four buttons that change who signs the paper: the change is
 * made, or refused with the database's reason, and the page comes back with
 * a toast saying what happened.
 */
function signingAction(
	action: SigningAction,
	change: (supabase: SupabaseClient, paperId: string) => Promise<SignatureChange>
) {
	return async ({ params, url, locals, cookies }: RequestEvent) => {
		const { paper } = await requirePaper(locals, url, params);
		const result = await change(locals.supabase, paper.id);

		if (result.refusal !== null) return refuse(result.refusal);

		setFlash(cookies, { tone: 'success', message: signingMessage(action, paper.title) });
		redirect(303, committeePaperUrl(params.slug, params.committeeSlug, paper.id));
	};
}

/**
 * "Submit to the dais" or "Withdraw": done, or refused with the reason, and
 * the paper's page comes back with a toast saying which.
 */
function progressAction(
	change: (supabase: SupabaseClient, paper: CommitteePaper) => Promise<PaperChange>,
	message: (paper: CommitteePaper) => string
) {
	return async ({ params, url, locals, cookies }: RequestEvent) => {
		const { paper } = await requirePaper(locals, url, params);
		const result = await change(locals.supabase, paper);

		if (result.refusal !== null) return refuse(result.refusal);

		setFlash(cookies, { tone: 'success', message: message(paper) });
		redirect(303, committeePaperUrl(params.slug, params.committeeSlug, paper.id));
	};
}

/**
 * The paper the projector's buttons are about, for `paperScreenActions`:
 * found again for each press, since each is its own request.
 */
async function findScreenedPaper({ locals, url, params }: RequestEvent): Promise<ScreenedPaper> {
	const { committee, paper } = await requirePaper(locals, url, params);

	return {
		committeeId: committee.id,
		paperId: paper.id,
		name: paperKindAndNumber(paper),
		pageUrl: committeePaperUrl(params.slug, params.committeeSlug, paper.id)
	};
}

export const actions: Actions = {
	// "Open for signatures" and "Close signatures", for the paper's authors.
	openSignatures: signingAction('openSignatures', (supabase, paperId) =>
		setSignaturesOpen(supabase, paperId, true)
	),
	closeSignatures: signingAction('closeSignatures', (supabase, paperId) =>
		setSignaturesOpen(supabase, paperId, false)
	),
	// "Sign as Ghana" and "Remove my signature", for any other seat while it is open.
	sign: signingAction('sign', signPaper),
	removeSignature: signingAction('removeSignature', removeSignature),

	// "Submit to the dais", which freezes the text as version 1, and "Withdraw", for its authors.
	// A crisis committee's directives and press releases go to the crisis staff instead.
	submit: progressAction(submitCommitteePaper, (paper) =>
		submitWords(paper.kind).done(paper.title)
	),
	withdraw: progressAction(
		(supabase, paper) => withdrawCommitteePaper(supabase, paper.id),
		(paper) => SUBMITTING_MESSAGES.withdrawn(paper.title)
	),

	// "Show on screen", "Take off screen", "Previous clause" and "Next clause", for the
	// dais once the paper is introduced, shared with the dais's review of it.
	...paperScreenActions(findScreenedPaper),

	// "Comment", "Reply", "Resolve" and the rest of the margin, shared with the
	// position paper pages (`$lib/server/paper-comment-actions.ts`).
	...paperCommentActions(findCommentedPaper),

	// "Accept as friendly", "Decline", "Support", "Withdraw" and the rest of an
	// amendment's card, on an introduced draft (`$lib/server/paper-amendment-actions.ts`).
	...amendmentCardActions(findAmendedPaper),

	/**
	 * Save the paper's text. The live editor sends `background=1` and is
	 * answered with data; "Save changes" without JavaScript comes back to the
	 * page. Whoever may no longer write the paper is refused underneath.
	 */
	saveDraft: async ({ params, url, request, locals, cookies }) => {
		const { paper } = await requirePaper(locals, url, params);
		const form = readCommitteePaperForm(await request.formData());
		const saved = await saveCommitteePaperFromForm(locals.supabase, paper, form);

		if (saved.refusal) return saved.refusal;

		// A live save also carries back the other authors' changes the page lacks.
		if (form.isBackground) {
			return { draftSaved: { revision: saved.revision, missing: saved.missing ?? undefined } };
		}

		setFlash(cookies, { tone: 'success', message: COMMITTEE_PAPER_MESSAGES.saved });
		redirect(303, committeePaperUrl(params.slug, params.committeeSlug, paper.id));
	},

	/** "Add an author": another seat of the committee writes the paper too, and is told so. */
	addAuthor: async ({ params, url, request, locals, cookies }) => {
		const { committee, paper } = await requirePaper(locals, url, params);
		const seatId = readChosenSeat(await request.formData());

		if (seatId === null) return refuse('Choose the seat to add.');

		const change = await addPaperAuthor(locals.supabase, paper.id, seatId);

		if (change.refusal !== null) return refuse(change.refusal);

		const { seatName, words } = await readChangedSeat(locals.supabase, committee.id, paper, seatId);

		if (seatName !== null) {
			setFlash(cookies, { tone: 'success', message: authorAddedMessage(seatName, words) });
		}

		redirect(303, committeePaperUrl(params.slug, params.committeeSlug, paper.id));
	},

	/** "Make lead": the lead hands the paper's lead to another of its authors. */
	makeLead: async ({ params, url, request, locals, cookies }) => {
		const { committee, paper } = await requirePaper(locals, url, params);
		const seatId = readChosenSeat(await request.formData());

		if (seatId === null) return refuse('Choose the author to hand the lead to.');

		const change = await handPaperLead(locals.supabase, paper.id, seatId);

		if (change.refusal !== null) return refuse(change.refusal);

		const { seatName, words } = await readChangedSeat(locals.supabase, committee.id, paper, seatId);

		if (seatName !== null) {
			setFlash(cookies, { tone: 'success', message: leadHandedMessage(seatName, words) });
		}

		redirect(303, committeePaperUrl(params.slug, params.committeeSlug, paper.id));
	},

	/** "Leave": the reader's seat stops writing the paper, which they can then no longer open. */
	leave: async ({ params, url, locals, cookies }) => {
		const { paper } = await requirePaper(locals, url, params);
		const change = await leavePaper(locals.supabase, paper.id);

		if (change.refusal !== null) return refuse(change.refusal);

		setFlash(cookies, { tone: 'success', message: `You left “${paper.title}”.` });
		redirect(303, committeePapersUrl(params.slug, params.committeeSlug));
	},

	/** "Delete": the paper's only author removes a paper that has never been submitted. */
	delete: async ({ params, url, locals, cookies }) => {
		const { paper } = await requirePaper(locals, url, params);
		const change = await deletePaper(locals.supabase, paper.id);

		if (change.refusal !== null) return refuse(change.refusal);

		setFlash(cookies, { tone: 'success', message: `${paperKindAndNumber(paper)} deleted.` });
		redirect(303, committeePapersUrl(params.slug, params.committeeSlug));
	}
};
