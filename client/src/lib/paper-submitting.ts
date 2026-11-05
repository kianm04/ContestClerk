/*
	A committee paper on its way to the dais (docs/committee-papers.md,
	section 3, rules 5 and 6, and section 6): its authors submit it, which
	freezes the text as version 1; the dais approves it with a number or
	returns it with a comment; and until it is introduced its authors may
	withdraw it. This file words what the paper's page says at each of those
	points, for its authors and for anybody else who reads it.

	This file is plain TypeScript with no Svelte in it, so the browser and the
	server both use it.
*/

import {
	paperKindAndNumber,
	type PaperKind,
	type PaperName,
	type PaperStatus
} from '$lib/committee-papers';
import { formatDayAndLongMonth } from '$lib/dashboard-dates';
import { formatTimeOfDay } from '$lib/dates';
import type { SigningButton } from '$lib/paper-signing';
import { hasEnoughSupport, type PaperSupport } from '$lib/paper-support';
import { hasClauses } from '$lib/resolution-text';
import { statusLabel } from '$lib/status';

/** Somebody of the dais, as the page names them: "Eleanor Price, Chair". */
export type DaisMember = {
	name: string;
	/** Their title on the committee's dais, such as "Chair", or `null` for none. */
	title: string | null;
};

/**
 * The dais's last answer to the paper: approved, or returned with a comment.
 * `null` while it has none, which is also the case again once the authors
 * submit a returned paper anew.
 */
export type PaperDecision = {
	/** When the dais approved or returned it, as an ISO timestamp. */
	decidedAt: string;
	/** Who did, or `null` once that account is gone. */
	decidedBy: DaisMember | null;
	/** What the dais said when it last returned the paper, or `null` if it never has. */
	returnComment: string | null;
};

/** The words the paper's page and its actions show while it goes to the dais and back. */
export const SUBMITTING_MESSAGES = {
	notBeingWritten: 'Only a paper being written can be submitted.',
	withdrawTitle: (title: string) => `Withdraw “${title}”?`,
	withdrawText:
		'It leaves the dais and is not introduced. Its authors and signatories keep it to read, and nobody can submit it again.',
	withdrawn: (title: string) => `“${title}” is withdrawn.`,
	submitted: (title: string) => `“${title}” is with the dais.`,
	submitTitle: (title: string) => `Submit “${title}” to the dais?`
} as const;

/** "15 March, 09:12": a moment of the conference's day, read in its time zone. */
function dayAndTime(moment: string, timeZone: string): string {
	return `${formatDayAndLongMonth(moment, timeZone)}, ${formatTimeOfDay(moment, timeZone)}`;
}

/** True for a paper the dais sent back, which its authors are writing again. */
export function isReturnedPaper(status: PaperStatus, decision: PaperDecision | null): boolean {
	return status === 'writing' && decision !== null && decision.returnComment !== null;
}

/**
 * Where the paper stands with the dais, for the line under its title:
 * "Submitted 15 March, 09:12 · With the dais", "Returned 15 March, 09:46",
 * "Approved 15 March, 10:02" or "Withdrawn". `null` for a paper still being
 * written for the first time, whose line says who may see it instead.
 */
export function paperProgressWord(
	paper: { status: PaperStatus; submittedAt: string | null },
	decision: PaperDecision | null,
	timeZone: string
): string | null {
	switch (paper.status) {
		case 'writing':
			return isReturnedPaper(paper.status, decision) && decision
				? `Returned ${dayAndTime(decision.decidedAt, timeZone)}`
				: null;
		case 'submitted':
			return paper.submittedAt === null
				? 'With the dais'
				: `Submitted ${dayAndTime(paper.submittedAt, timeZone)} · With the dais`;
		case 'approved':
			return decision === null
				? 'Approved'
				: `Approved ${dayAndTime(decision.decidedAt, timeZone)}`;
		case 'withdrawn':
			return 'Withdrawn';
		default:
			return null;
	}
}

/**
 * Whether an author's next step is "Submit to the dais". A draft resolution
 * or a directive is opened for signatures first while it lacks the support
 * the committee asks for (section 6); once it is open, or has enough
 * already, submitting is next. Any other kind goes straight to the dais.
 */
export function submitsNext(kind: PaperKind, isOpen: boolean, support: PaperSupport | null) {
	if (!hasClauses(kind) || support === null) return true;

	return isOpen || hasEnoughSupport(support);
}

/** What an author's title row offers while the paper is being written. */
export type AuthorSteps = {
	/** "Open for signatures", an outline button once submitting is the next step. */
	signing: SigningButton | null;
	/** True when "Submit to the dais" is shown, as the page's one primary button. */
	isSubmitShown: boolean;
};

/**
 * An author's buttons: "Submit to the dais" once it is the next step, with
 * "Open for signatures" beside it as an outline button; or "Open for
 * signatures" alone and primary while a draft still needs the support.
 */
export function authorSteps(
	kind: PaperKind,
	canSubmit: boolean,
	signing: { isOpen: boolean; button: SigningButton | null } | null,
	support: PaperSupport | null
): AuthorSteps {
	const button = signing?.button ?? null;
	const isSubmitShown = canSubmit && submitsNext(kind, signing?.isOpen ?? false, support);

	return {
		signing: button && isSubmitShown ? { ...button, isPrimary: false } : button,
		isSubmitShown
	};
}

/** Why the paper cannot be submitted yet: its open suggestions change the text the dais would read. */
export function submitBlockedSentence(openSuggestions: number): string {
	return openSuggestions === 1
		? 'Accept or reject the open suggestion before submitting.'
		: `Accept or reject the ${openSuggestions} open suggestions before submitting.`;
}

/** "Eleanor Price, the Chair," or "Eleanor Price": one of the dais named in a sentence. */
function daisName(member: DaisMember): string {
	return member.title === null ? member.name : `${member.name}, the ${member.title},`;
}

/** "a draft resolution", "a working paper": the kind in the middle of a sentence. */
function kindInSentence(kind: PaperKind): string {
	return `a ${statusLabel('paper_kind', kind).toLowerCase()}`;
}

/**
 * The panel beside a submitted paper, for its authors: "Eleanor Price, the
 * Chair, will approve it as a draft resolution or return it to you with
 * notes. Until then the text is frozen as version 1." A committee with more
 * than one chair, or none named, has "The dais" do it.
 */
export function withTheDaisSentence(kind: PaperKind, chair: DaisMember | null): string {
	const who = chair === null ? 'The dais' : daisName(chair);

	return `${who} will approve it as ${kindInSentence(kind)} or return it to you with notes. Until then the text is frozen as version 1.`;
}

/**
 * The panel beside an approved paper: "Eleanor Price approved it as Draft
 * resolution 1.1 on 15 March, 10:02. It comes to the floor once the committee
 * passes a motion to introduce it."
 */
export function approvedSentence(
	kindAndNumber: string,
	decision: PaperDecision | null,
	timeZone: string
): string {
	const who = decision?.decidedBy?.name ?? 'The dais';
	const when = decision === null ? '' : ` on ${dayAndTime(decision.decidedAt, timeZone)}`;

	return `${who} approved it as ${kindAndNumber}${when}. It comes to the floor once the committee passes a motion to introduce it.`;
}

/**
 * The panel beside a paper its authors sent to the dais, in the margin's
 * place: "With the dais" while it waits, "Approved" once it has a number;
 * `null` otherwise.
 */
export function daisPanel(
	paper: PaperName & { status: PaperStatus },
	decision: PaperDecision | null,
	chair: DaisMember | null,
	timeZone: string
): { title: string; sentence: string } | null {
	if (paper.status === 'submitted') {
		return { title: 'With the dais', sentence: withTheDaisSentence(paper.kind, chair) };
	}

	if (paper.status === 'approved') {
		const sentence = approvedSentence(paperKindAndNumber(paper), decision, timeZone);

		return { title: 'Approved', sentence };
	}

	return null;
}

/** The line under the dais's comment on a returned paper: "Eleanor Price, Chair · 15 March, 09:46". */
export function decisionByline(decision: PaperDecision, timeZone: string): string {
	const member = decision.decidedBy;
	const who = member === null ? 'The dais' : [member.name, member.title].filter(Boolean).join(', ');

	return `${who} · ${dayAndTime(decision.decidedAt, timeZone)}`;
}

/**
 * The dais's comment above a returned paper's editor, and the line under it;
 * `null` for a paper that is not back with its authors.
 */
export function returnedNotes(
	paper: { status: PaperStatus },
	decision: PaperDecision | null,
	timeZone: string
): { comment: string; byline: string } | null {
	if (decision === null || !isReturnedPaper(paper.status, decision)) return null;

	return { comment: decision.returnComment ?? '', byline: decisionByline(decision, timeZone) };
}

/**
 * The question "Submit to the dais" asks first. An open draft stops taking
 * signatures as it goes, and a returned one keeps the ones it has.
 */
export function submitConfirmText(kind: PaperKind, isOpenForSignatures: boolean): string {
	const frozen =
		'The dais reads the text as it stands now, as version 1, and nobody can change it until they approve it or return it to you.';

	if (!hasClauses(kind)) return frozen;

	return isOpenForSignatures
		? `${frozen} It stops taking signatures, and keeps the ones it has.`
		: `${frozen} It keeps the signatures it has.`;
}

/**
 * The note under a returned paper's signatories, for its authors: they still
 * count, and each may take theirs back until the paper is submitted again.
 */
export const RETURNED_SIGNATORIES_NOTE =
	'They keep their signatures and have been told it came back. Each may take theirs off until you submit again.';
