/**
 * The dais's side of a committee's papers (`docs/committee-papers.md`, step
 * 5, "To the dais"): the Resolutions page that lists what the delegates have
 * sent up, and the review page where the dais approves a paper with its
 * number, returns it to its authors, or withdraws it once introduced.
 *
 * The database decides every change (`approve_paper`, `return_paper` and
 * `withdraw_paper`); this file only words and orders what the pages show, and
 * reads what their forms send.
 */

import { formatDayAndLongMonth } from '$lib/dashboard-dates';
import { formatTimeOfDay } from '$lib/dates';
import {
	paperKindAndNumber,
	type PaperKind,
	type PaperName,
	type PaperStatus
} from '$lib/committee-papers';
import { statusLabel } from '$lib/status';
import type { ChairResolutionDialog } from '$lib/urls';

/** The kinds the dais approves. The crisis staff answer the others (section 3). */
export const DAIS_PAPER_KINDS = [
	'working_paper',
	'draft_resolution',
	'committee_directive'
] as const satisfies PaperKind[];

/** One paper on the dais's list. */
export type DaisPaper = PaperName & {
	id: string;
	status: PaperStatus;
	title: string;
	topic: string | null;
	/** The lead seat's name, such as "Austria", or `null` once every author has gone. */
	leadSeatName: string | null;
	/** When it went to the dais, as an ISO timestamp. */
	submittedAt: string | null;
};

/** The four sections of the list, in the order the dais works through them. */
export type DaisSectionKey = 'submitted' | 'approved' | 'introduced' | 'decided';

export type DaisSection = {
	key: DaisSectionKey;
	title: string;
	/** The one sentence the section shows while it is empty. */
	emptySentence: string;
	papers: DaisPaper[];
};

/** The statuses of a paper the committee has finished with. */
const DECIDED_STATUSES: PaperStatus[] = [
	'passed',
	'failed',
	'withdrawn',
	'carried_out',
	'refused',
	'published'
];

/** Each section's heading, its empty sentence and the statuses it holds. */
const SECTIONS: {
	key: DaisSectionKey;
	title: string;
	emptySentence: string;
	statuses: PaperStatus[];
}[] = [
	{
		key: 'submitted',
		title: 'Submitted',
		emptySentence: 'No paper is waiting for the dais.',
		statuses: ['submitted']
	},
	{
		key: 'approved',
		title: 'Approved, not introduced',
		emptySentence: 'No approved paper is waiting to be introduced.',
		statuses: ['approved']
	},
	{
		key: 'introduced',
		title: 'Introduced',
		emptySentence: 'No paper is on the floor.',
		statuses: ['introduced']
	},
	{
		key: 'decided',
		title: 'Decided',
		emptySentence: 'No paper has been decided yet.',
		statuses: DECIDED_STATUSES
	}
];

/** The oldest first: the dais answers papers in the order they came. */
function bySubmission(first: DaisPaper, second: DaisPaper): number {
	return (first.submittedAt ?? '').localeCompare(second.submittedAt ?? '');
}

/** By topic, then kind, then number: "Working paper 1.1" before "Draft resolution 1.1". */
function byNumber(first: DaisPaper, second: DaisPaper): number {
	const order = (paper: DaisPaper) => [
		paper.topicNumber ?? Number.MAX_SAFE_INTEGER,
		DAIS_PAPER_KINDS.indexOf(paper.kind as (typeof DAIS_PAPER_KINDS)[number]),
		paper.sequence ?? Number.MAX_SAFE_INTEGER
	];
	const firstOrder = order(first);
	const secondOrder = order(second);
	const differing = firstOrder.findIndex((part, index) => part !== secondOrder[index]);

	return differing === -1 ? 0 : firstOrder[differing] - secondOrder[differing];
}

/**
 * The papers sorted into the list's sections. A paper still being written is
 * the authors' and is left out, as is one the dais does not approve.
 */
export function daisSections(papers: DaisPaper[]): DaisSection[] {
	const ours = papers.filter((paper) =>
		(DAIS_PAPER_KINDS as readonly PaperKind[]).includes(paper.kind)
	);

	return SECTIONS.map(({ statuses, ...section }) => ({
		...section,
		papers: ours
			.filter((paper) => statuses.includes(paper.status))
			.sort(section.key === 'submitted' ? bySubmission : byNumber)
	}));
}

/** When a paper went to the dais, in the conference's time: "15 March, 09:12". */
export function submittedText(submittedAt: string, timeZone: string): string {
	return `${formatDayAndLongMonth(submittedAt, timeZone)}, ${formatTimeOfDay(submittedAt, timeZone)}`;
}

/**
 * A row's meta line on a phone: "Draft resolution 1.1 · Lethal autonomous
 * weapons · Austria · Submitted 15 March, 09:12". A decided paper ends with
 * how it was decided, which on a phone has no column of its own.
 */
export function daisRowMetaLine(paper: DaisPaper, timeZone: string): string {
	const parts = [
		paperKindAndNumber(paper),
		paper.topic,
		paper.leadSeatName,
		paper.submittedAt === null ? null : `Submitted ${submittedText(paper.submittedAt, timeZone)}`,
		DECIDED_STATUSES.includes(paper.status) ? statusLabel('paper_status', paper.status) : null
	];

	// The space before each dot cannot break, so a line never starts with one.
	return parts.filter((part) => part !== null && part !== '').join(' · ');
}

/**
 * The line of facts under the review page's title: "Draft resolution ·
 * Submitted 15 March, 09:12 by Austria · Version 1".
 */
export function reviewMetaLine(
	paper: PaperName & { submittedAt: string | null },
	leadSeatName: string | null,
	version: number | null,
	timeZone: string
): string {
	const submitted =
		paper.submittedAt === null
			? null
			: `Submitted ${submittedText(paper.submittedAt, timeZone)}${leadSeatName ? ` by ${leadSeatName}` : ''}`;
	const parts = [
		paperKindAndNumber(paper),
		submitted,
		version === null ? null : `Version ${version}`
	];

	return parts.filter((part) => part !== null).join(' · ');
}

/** A paper's number on its topic: "1.2" is the second on the first topic. */
export type PaperNumber = { topicNumber: number; sequence: number };

/** "1.2". */
export function paperNumberText(number: PaperNumber): string {
	return `${number.topicNumber}.${number.sequence}`;
}

/** A paper's number as the dais types it, "1.2", or `null` for anything else. */
export function parsePaperNumber(text: string): PaperNumber | null {
	const match = /^\s*(\d{1,4})\.(\d{1,4})\s*$/.exec(text);
	if (match === null) return null;

	const number = { topicNumber: Number(match[1]), sequence: Number(match[2]) };

	return number.topicNumber >= 1 && number.sequence >= 1 ? number : null;
}

/** The refusal for a number that is not one, in the database's own words. */
export const PAPER_NUMBER_REFUSAL = "A paper's number is two whole numbers from 1, such as 1.2.";

/** A paper that already has a number, for working out the next one. */
export type NumberedPaper = PaperName;

/**
 * The number the review page offers, worked out as `approve_paper` does when
 * it is given none: the paper's topic's place on the agenda (the first topic
 * when it has none), and the next number of its kind on that topic. A number
 * is never given twice, so a withdrawn paper's still counts.
 */
export function proposedNumber(
	paper: PaperName & { topic: string | null },
	topics: string[],
	numbered: NumberedPaper[]
): PaperNumber {
	const place = paper.topic === null ? -1 : topics.indexOf(paper.topic);
	const topicNumber = place === -1 ? 1 : place + 1;
	const taken = numbered
		.filter((other) => other.kind === paper.kind && other.topicNumber === topicNumber)
		.map((other) => other.sequence ?? 0);

	return { topicNumber, sequence: Math.max(0, ...taken) + 1 };
}

/** "Approve as Draft resolution 1.1", or without a number while the one typed is not one. */
export function approveButtonText(kind: PaperKind, number: PaperNumber | null): string {
	const kindWord = statusLabel('paper_kind', kind);

	return number === null
		? `Approve as ${kindWord}`
		: `Approve as ${kindWord} ${paperNumberText(number)}`;
}

/** The toast once a paper is approved: "“Human control” approved as Draft resolution 1.1." */
export function approvedMessage(title: string, kind: PaperKind, number: PaperNumber): string {
	return `“${title}” approved as ${paperKindAndNumber({ kind, ...number })}.`;
}

/** The toast once a paper goes back to its authors. */
export function returnedMessage(title: string): string {
	return `“${title}” returned to its authors.`;
}

/** The toast once an introduced paper is withdrawn at its sponsors' request. */
export function withdrawnMessage(paper: PaperName & { title: string }): string {
	return `${paperKindAndNumber(paper)}, “${paper.title}”, withdrawn.`;
}

/** The refusal for a return without a comment, in the database's own words. */
export const RETURN_COMMENT_REFUSAL =
	'Say in at most 2,000 characters what the authors should change.';

/** The longest comment a return takes (`return_paper`). */
export const RETURN_COMMENT_MAX_LENGTH = 2000;

/** The comment "Return to the authors" sent, trimmed, or `null` for none at all. */
export function readReturnComment(formData: FormData): string | null {
	const comment = formData.get('comment');
	if (typeof comment !== 'string' || comment.trim() === '') return null;

	return comment.trim();
}

/** The number "Approve" sent, or `null` when it is not one. */
export function readApprovedNumber(formData: FormData): PaperNumber | null {
	const number = formData.get('number');

	return typeof number === 'string' ? parsePaperNumber(number) : null;
}

/**
 * The dialog the address opens over the review page (`?return=1` or
 * `?withdraw=1`), or `null`. Each opens only while the paper is where it can
 * be used, so an old link cannot offer what the database would refuse.
 */
export function readDaisDialog(
	searchParams: URLSearchParams,
	status: PaperStatus
): ChairResolutionDialog | null {
	if (searchParams.get('return') === '1' && status === 'submitted') return 'return';
	if (searchParams.get('withdraw') === '1' && status === 'introduced') return 'withdraw';

	return null;
}
