/**
 * Amendments to an introduced draft resolution (`docs/committee-papers.md`,
 * section 3, rule 9, and step 7 of its build order): what one is, where it
 * stands, what the reader may do with it, and the form that proposes one.
 *
 * The database decides everything: `propose_amendment` asks the sponsors or
 * sends it for support, `answer_amendment` makes it friendly or unfriendly,
 * `sign_amendment` counts its support, and `decide_amendment` writes a
 * friendly one in. Nothing here writes. These are the plain functions the
 * pages draw from, with no Svelte in them, so the browser and the server
 * both use them and they can be tested on their own. How an amendment is
 * worded on screen is `./amendment-wording.ts`; the dais's queue is
 * `./amendment-queue.ts`.
 */

import { paperKindAndNumber } from '$lib/committee-papers';
import type { Database } from '$lib/database.types';
import type { AmendmentAction, ClausePart } from '$lib/paper-clauses';

export type AmendmentStatus = Database['public']['Enums']['amendment_status'];

/** One sponsor asked whether an amendment is friendly, and what they said. */
export type SponsorAnswer = {
	seatId: string;
	seatName: string;
	/** `null` until the sponsor answers. */
	accepts: boolean | null;
};

/** An amendment as the pages read it, with its proposer's seat and its seats' answers. */
export type PaperAmendment = {
	id: string;
	/** "Amendment 3" on its draft. */
	sequence: number;
	proposedBySeatId: string | null;
	/** "Germany"; `null` for a seat that has since been removed. */
	proposerName: string | null;
	action: AmendmentAction;
	targetPart: ClausePart;
	/** The clause changed or struck; for an addition the clause it follows, or `null` for the start. */
	targetClauseId: string | null;
	/** The new words; `null` for a strike. */
	textMarkdown: string | null;
	/** For an amendment to an amendment, the amendment whose words it changes. */
	parentAmendmentId: string | null;
	status: AmendmentStatus;
	isFriendly: boolean;
	/** Its place in the dais's queue while it is with the dais, else `null`. */
	queuePosition: number | null;
	/** Why the dais ruled it out of order. */
	ruling: string | null;
	/** The version of the draft it was proposed against. */
	basedOnVersionId: string | null;
	createdAt: string;
	decidedAt: string | null;
	sponsorAnswers: SponsorAnswer[];
	/** The seats that support it, besides its proposer. */
	supporterSeatIds: string[];
};

/** What the committee's settings say about amendments (`docs/committee-papers.md`, section 5). */
export type AmendmentRules = {
	hasFriendlyAmendments: boolean;
	isPreambleAmendable: boolean;
	hasSecondDegreeAmendments: boolean;
	/** The support an unfriendly amendment needs before it goes to the dais, its proposer counted. */
	supportNeeded: number;
};

/** The four statuses in which an amendment still waits for somebody. */
const WAITING_STATUSES: readonly AmendmentStatus[] = [
	'awaiting_sponsors',
	'collecting_support',
	'with_the_dais',
	'approved'
];

/** Does the amendment still wait for the sponsors, its support, the dais or its vote? */
export function isAmendmentWaiting(status: AmendmentStatus): boolean {
	return WAITING_STATUSES.includes(status);
}

/** The colour of the dot before a status: amber while it waits, then green or red for how it ended. */
export type StatusTone = 'warning' | 'success' | 'danger' | 'neutral';

/** How the page names each status, in the words a chair would say, and its dot's colour. */
const STATUS_WORDS: Record<AmendmentStatus, { word: string; tone: StatusTone }> = {
	awaiting_sponsors: { word: 'Asking the sponsors', tone: 'warning' },
	collecting_support: { word: 'Collecting support', tone: 'warning' },
	with_the_dais: { word: 'With the dais', tone: 'warning' },
	approved: { word: 'Waits for its vote', tone: 'warning' },
	written_in: { word: 'Written in', tone: 'success' },
	passed: { word: 'Passed', tone: 'success' },
	failed: { word: 'Failed', tone: 'danger' },
	out_of_order: { word: 'Out of order', tone: 'danger' },
	withdrawn: { word: 'Withdrawn', tone: 'neutral' },
	lapsed: { word: 'Lapsed', tone: 'neutral' }
};

/** "With the dais", "Written in". */
export function amendmentStatusWord(status: AmendmentStatus): string {
	return STATUS_WORDS[status].word;
}

/** The dot's colour; a withdrawn or lapsed amendment has a grey one. */
export function amendmentStatusTone(status: AmendmentStatus): StatusTone {
	return STATUS_WORDS[status].tone;
}

/** "Amendment 3". */
export function amendmentName(amendment: { sequence: number }): string {
	return `Amendment ${amendment.sequence}`;
}

/** The reader's seat on the paper's page, as far as amendments go; `null` for the dais. */
export type AmendmentReader = { seatId: string; isObserver: boolean } | null;

/** What the reader may do with one amendment, shown as the buttons on its card. */
export type AmendmentChoices = {
	/** A sponsor still to answer, or one who accepted and may decline while the others answer. */
	answer: 'unanswered' | 'accepted' | null;
	/** The proposer, while the sponsors are asked, may send it for support without waiting. */
	mayMakeUnfriendly: boolean;
	/** Any other seat, observers too, while it collects support and they have not given theirs. */
	maySupport: boolean;
	/** The reader's seat supports it already. */
	hasSupported: boolean;
	/** The proposer, while it still waits. */
	mayWithdraw: boolean;
	/** A delegate, where the committee amends amendments, on an unfriendly one waiting for its vote. */
	mayAmend: boolean;
};

/** Can this amendment be amended, where the committee allows amendments to amendments? */
export function isAmendable(amendment: PaperAmendment, rules: AmendmentRules): boolean {
	return (
		rules.hasSecondDegreeAmendments &&
		amendment.parentAmendmentId === null &&
		!amendment.isFriendly &&
		amendment.action !== 'strike' &&
		['collecting_support', 'with_the_dais', 'approved'].includes(amendment.status)
	);
}

/** The buttons one amendment's card offers this reader, as the database would allow them. */
export function amendmentChoices(
	amendment: PaperAmendment,
	reader: AmendmentReader,
	rules: AmendmentRules
): AmendmentChoices {
	const isProposer = reader !== null && amendment.proposedBySeatId === reader.seatId;
	const myAnswer =
		reader && amendment.sponsorAnswers.find((asked) => asked.seatId === reader.seatId);
	const isAsking = amendment.status === 'awaiting_sponsors';
	const hasSupported = reader !== null && amendment.supporterSeatIds.includes(reader.seatId);

	return {
		answer: isAsking && myAnswer ? (myAnswer.accepts === true ? 'accepted' : 'unanswered') : null,
		mayMakeUnfriendly: isProposer && isAsking,
		maySupport:
			reader !== null && !isProposer && !hasSupported && amendment.status === 'collecting_support',
		hasSupported: hasSupported && amendment.status === 'collecting_support',
		mayWithdraw: isProposer && isAmendmentWaiting(amendment.status),
		mayAmend: reader !== null && !reader.isObserver && isAmendable(amendment, rules)
	};
}

/**
 * The amendments the reader's seat has still to answer as a sponsor: what
 * the quiet "Waiting for you" lines on the paper and the live view count.
 */
export function amendmentsWaitingForSeat(
	amendments: PaperAmendment[],
	seatId: string | null
): PaperAmendment[] {
	if (seatId === null) return [];

	return amendments.filter(
		(amendment) =>
			amendment.status === 'awaiting_sponsors' &&
			amendment.sponsorAnswers.some((asked) => asked.seatId === seatId && asked.accepts === null)
	);
}

/** "Waiting for you: amendment 3", or "amendments 3 and 5". */
export function waitingForYouText(waiting: { sequence: number }[]): string {
	const numbers = waiting.map((amendment) => String(amendment.sequence));
	const listed =
		numbers.length <= 1
			? numbers.join('')
			: `${numbers.slice(0, -1).join(', ')} and ${numbers[numbers.length - 1]}`;

	return `Waiting for you: ${numbers.length === 1 ? 'amendment' : 'amendments'} ${listed}`;
}

/**
 * One amendment on the live view's "Waiting for you" line: "Amendment 3 to
 * Draft resolution 1.1". Only an introduced draft resolution is amended.
 */
export function amendmentToAnswerText(waiting: {
	sequence: number;
	paper: { topicNumber: number | null; sequence: number | null };
}): string {
	const paperName = paperKindAndNumber({ kind: 'draft_resolution', ...waiting.paper });

	return `${amendmentName(waiting)} to ${paperName}`;
}

/** The longest an amendment's words may be, as `propose_amendment` checks. */
export const AMENDMENT_TEXT_MAX_LENGTH = 10000;

/** The three things an amendment does, as the form's radio buttons offer them. */
export const AMENDMENT_ACTION_OPTIONS: { value: AmendmentAction; label: string }[] = [
	{ value: 'add', label: 'Add a clause' },
	{ value: 'change', label: 'Change a clause' },
	{ value: 'strike', label: 'Strike a clause' }
];

/** What the form's fields hold: as the page was given them, or as a refused form sent them. */
export type AmendmentFormValues = { action: string; clause: string; text: string };

/** One message per field with something wrong in it. */
export type AmendmentFormErrors = { action?: string; clause?: string; text?: string };

/** What `propose_amendment` is called with, once the form reads right. */
export type AmendmentProposal = {
	action: AmendmentAction;
	targetPart: ClausePart;
	targetClauseId: string | null;
	textMarkdown: string | null;
};

/**
 * The Select's value for a clause: the part and the clause's id, such as
 * `operative:o1a`, or `operative:start` for an addition before every clause.
 */
export function clauseChoiceValue(part: ClausePart, clauseId: string | null): string {
	return `${part}:${clauseId ?? 'start'}`;
}

/** The part and clause a Select value names, or `null` for anything else. */
export function readClauseChoice(
	value: string
): { part: ClausePart; clauseId: string | null } | null {
	const match = /^(preamble|operative):([a-z0-9]+)$/.exec(value);
	if (match === null) return null;

	const part = match[1] === 'preamble' ? 'preamble' : 'operative';

	return { part, clauseId: match[2] === 'start' ? null : match[2] };
}

/** One text field of the form as a string, `''` when it was left out. */
function formText(form: FormData, name: string): string {
	const value = form.get(name);

	return typeof value === 'string' ? value : '';
}

/**
 * The form as it was sent: what it proposes, or what is wrong with it. The
 * database checks all of this again; reading it here first lets the page
 * point at the field to fix, and keeps what was typed.
 */
export function readAmendmentForm(form: FormData): {
	values: AmendmentFormValues;
	errors: AmendmentFormErrors;
	proposal: AmendmentProposal | null;
} {
	const values = {
		action: formText(form, 'action'),
		clause: formText(form, 'clause'),
		text: formText(form, 'text')
	};
	const errors: AmendmentFormErrors = {};
	const action = AMENDMENT_ACTION_OPTIONS.find((option) => option.value === values.action)?.value;
	const clause = readClauseChoice(values.clause);
	const text = values.text.trim();

	if (action === undefined) errors.action = 'Choose what the amendment does.';
	if (clause === null || (action !== 'add' && clause.clauseId === null)) {
		errors.clause = 'Choose the clause.';
	}
	if (action !== 'strike' && (text === '' || text.length > AMENDMENT_TEXT_MAX_LENGTH)) {
		errors.text = 'Write the words of the amendment, in at most 10,000 characters.';
	}

	const isValid = action !== undefined && clause !== null && Object.keys(errors).length === 0;

	return {
		values,
		errors,
		proposal: isValid
			? {
					action,
					targetPart: clause.part,
					targetClauseId: clause.clauseId,
					textMarkdown: action === 'strike' ? null : text
				}
			: null
	};
}

/**
 * "Amend this amendment" as it was sent. Only its words are the reader's:
 * an amendment to an amendment changes the words of the one it amends, at
 * that amendment's clause, as `propose_amendment` insists.
 */
export function readAmendmentToAmendmentForm(
	form: FormData,
	parent: Pick<PaperAmendment, 'targetPart' | 'targetClauseId'>
): {
	values: AmendmentFormValues;
	errors: AmendmentFormErrors;
	proposal: AmendmentProposal | null;
} {
	const values = {
		action: 'change',
		clause: clauseChoiceValue(parent.targetPart, parent.targetClauseId),
		text: formText(form, 'text')
	};
	const text = values.text.trim();

	if (text === '' || text.length > AMENDMENT_TEXT_MAX_LENGTH) {
		return {
			values,
			errors: { text: 'Write the words of the amendment, in at most 10,000 characters.' },
			proposal: null
		};
	}

	return {
		values,
		errors: {},
		proposal: {
			action: 'change',
			targetPart: parent.targetPart,
			targetClauseId: parent.targetClauseId,
			textMarkdown: text
		}
	};
}

/** The toast once an amendment is proposed, saying where it went. */
export function proposedMessage(amendment: { sequence: number; status: AmendmentStatus }): string {
	const name = amendmentName(amendment);

	if (amendment.status === 'awaiting_sponsors') {
		return `${name} proposed. The sponsors are asked whether it is friendly.`;
	}
	if (amendment.status === 'collecting_support') {
		return `${name} proposed. It needs the support of other seats.`;
	}

	return `${name} proposed and sent to the dais.`;
}

/** The toasts after the buttons on an amendment's card, and the dais's. */
export const AMENDMENT_MESSAGES = {
	accepted: (sequence: number) => `You accepted amendment ${sequence} as friendly.`,
	declined: (sequence: number) => `You declined amendment ${sequence}. It is now unfriendly.`,
	madeUnfriendly: (sequence: number) => `Amendment ${sequence} now collects support as unfriendly.`,
	supported: (sequence: number) => `You support amendment ${sequence}.`,
	withdrawn: (sequence: number) => `Amendment ${sequence} withdrawn.`,
	approved: (sequence: number, isFriendly: boolean) =>
		isFriendly
			? `Amendment ${sequence} approved and written in.`
			: `Amendment ${sequence} approved. It waits for its vote.`,
	ruledOut: (sequence: number) => `Amendment ${sequence} ruled out of order.`,
	moved: (sequence: number) => `Amendment ${sequence} moved.`
};

/** The sentence for an amendment the page could not find. */
export const AMENDMENT_NOT_FOUND = 'That amendment is not on this draft.';
