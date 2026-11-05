/*
	A crisis committee's papers on their way to the crisis staff and back
	(docs/committee-papers.md, sections 2, 3 and 6). Joint and personal
	directives and press releases are sent straight to the crisis staff, who
	carry them out or refuse them (a press release: publish it or refuse it). A
	committee directive goes to the dais like a draft resolution, and once the
	committee passes it the crisis staff answer it too.

	This file words what the paper's page says at those points, for the authors,
	and what the crisis staff's own page (`crisis` under the committee) lists
	and asks. Like `$lib/paper-submitting.ts` beside it, it is plain TypeScript,
	so the browser and the server both use it.
*/

import type { PaperKind, PaperListItem, PaperStatus } from '$lib/committee-papers';
import { formatDayAndLongMonth } from '$lib/dashboard-dates';
import { formatTimeOfDay } from '$lib/dates';
import { paperProgressWord, type PaperDecision } from '$lib/paper-submitting';
import { statusLabel } from '$lib/status';
import { votedWord, type PaperVote } from '$lib/paper-votes';

/** The kinds that go to the crisis staff instead of the dais. */
export const CRISIS_STAFF_KINDS: PaperKind[] = [
	'joint_directive',
	'personal_directive',
	'press_release'
];

/** What the crisis staff may answer with: a press release is published, a directive carried out. */
export type CrisisOutcome = 'carried_out' | 'refused' | 'published';

/** The statuses the crisis staff's answer leaves a paper in. */
const ANSWERED_STATUSES: PaperStatus[] = ['carried_out', 'refused', 'published'];

/** The crisis staff's answer to a paper, from the paper's own columns. */
export type CrisisAnswer = {
	outcome: CrisisOutcome;
	/** What they wrote back, or `null`: they may carry a directive out without a word (decision 10). */
	text: string | null;
	/** When they answered, as an ISO timestamp. */
	answeredAt: string;
};

/** The longest crisis update `send_crisis_update` takes. */
export const CRISIS_UPDATE_MAX_LENGTH = 1000;

/** The longest answer `answer_directive` takes. */
export const CRISIS_ANSWER_MAX_LENGTH = 100_000;

/** True for a joint or personal directive or a press release, which the crisis staff decide. */
export function goesToCrisisStaff(kind: PaperKind): boolean {
	return CRISIS_STAFF_KINDS.includes(kind);
}

/** True for a paper the crisis staff have answered, whatever its kind. */
export function isAnsweredByCrisisStaff(status: PaperStatus): status is CrisisOutcome {
	return ANSWERED_STATUSES.includes(status);
}

/**
 * True for a paper whose page talks about the crisis staff rather than the
 * dais: one that goes to them, or a committee directive they have answered.
 */
export function isWithCrisisStaff(paper: { kind: PaperKind; status: PaperStatus }): boolean {
	return goesToCrisisStaff(paper.kind) || isAnsweredByCrisisStaff(paper.status);
}

/** "15 March, 09:12": a moment of the conference's day, read in its time zone. */
function dayAndTime(moment: string, timeZone: string): string {
	return `${formatDayAndLongMonth(moment, timeZone)}, ${formatTimeOfDay(moment, timeZone)}`;
}

/** What an author's button, its question and its toast say, by where the paper goes. */
export type SubmitWords = {
	/** "Submit to the dais" or "Send to the crisis staff". */
	button: string;
	/** "Send “Seize the ports” to the crisis staff?" */
	question: (title: string) => string;
	/** "“Seize the ports” is with the crisis staff." */
	done: (title: string) => string;
};

const DAIS_WORDS: SubmitWords = {
	button: 'Submit to the dais',
	question: (title) => `Submit “${title}” to the dais?`,
	done: (title) => `“${title}” is with the dais.`
};

const CRISIS_STAFF_WORDS: SubmitWords = {
	button: 'Send to the crisis staff',
	question: (title) => `Send “${title}” to the crisis staff?`,
	done: (title) => `“${title}” is with the crisis staff.`
};

/** The words for sending a paper on, to the dais or, for the crisis kinds, to the crisis staff. */
export function submitWords(kind: PaperKind): SubmitWords {
	return goesToCrisisStaff(kind) ? CRISIS_STAFF_WORDS : DAIS_WORDS;
}

/** What "Send to the crisis staff" asks first: the text is frozen once it goes. */
export function sendConfirmText(kind: PaperKind): string {
	const decides =
		kind === 'press_release'
			? 'publish it to the committee or refuse it'
			: 'carry it out or refuse it';

	return `The crisis staff read the text as it stands now and ${decides}. Nobody can change it once it is sent.`;
}

/** What "Withdraw" warns of for a paper with the crisis staff. */
export const CRISIS_WITHDRAW_TEXT =
	'The crisis staff no longer answer it. Its authors keep it to read, and nobody can send it again.';

/**
 * Where the paper stands with the crisis staff, for the line under its title:
 * "Sent 15 March, 09:12 · With the crisis staff", "Carried out 15 March,
 * 10:02", "Published 15 March, 10:02" or "Withdrawn". `null` while it is
 * being written, or for a committee directive not yet answered.
 */
export function crisisProgressWord(
	paper: { kind: PaperKind; status: PaperStatus; submittedAt: string | null },
	answer: CrisisAnswer | null,
	timeZone: string
): string | null {
	if (paper.status === 'submitted' && goesToCrisisStaff(paper.kind)) {
		return paper.submittedAt === null
			? 'With the crisis staff'
			: `Sent ${dayAndTime(paper.submittedAt, timeZone)} · With the crisis staff`;
	}

	if (isAnsweredByCrisisStaff(paper.status)) {
		const word = statusLabel('paper_status', paper.status);

		return answer === null ? word : `${word} ${dayAndTime(answer.answeredAt, timeZone)}`;
	}

	return paper.status === 'withdrawn' ? 'Withdrawn' : null;
}

/**
 * The word under any committee paper's title for where it stands: how the
 * committee's vote on it went once it has had one (`votedWord`), with the
 * crisis staff or answered by them for the kinds they decide, and with the
 * dais (`paperProgressWord`) for the rest.
 */
export function paperStandingWord(
	paper: {
		kind: PaperKind;
		status: PaperStatus;
		submittedAt: string | null;
		vote?: PaperVote | null;
	},
	decision: PaperDecision | null,
	answer: CrisisAnswer | null,
	timeZone: string
): string | null {
	return (
		votedWord(paper, timeZone) ??
		crisisProgressWord(paper, answer, timeZone) ??
		paperProgressWord(paper, decision, timeZone)
	);
}

/** "carried it out", "refused it", "published it to the committee": the answer in a sentence. */
function answerInSentence(outcome: CrisisOutcome): string {
	if (outcome === 'published') return 'published it to the committee';

	return outcome === 'carried_out' ? 'carried it out' : 'refused it';
}

/** The panel beside a paper the crisis staff decide, in the margin's place. */
export type CrisisPanel = {
	/** "With the crisis staff", "Carried out", "Refused" or "Published". */
	title: string;
	/** What happens next, or what the crisis staff wrote back. */
	sentence: string;
	/** "Crisis staff · 15 March, 10:02" under their answer, or `null` when there is none. */
	byline: string | null;
};

/**
 * The panel for the paper's authors while the crisis staff have it, and their
 * answer once they give it. A committee directive is the committee's, so its
 * answer is for everybody who reads it; a press release's answer is a note to
 * its authors, and the room only reads the release.
 */
export function crisisPanel(
	paper: { kind: PaperKind; status: PaperStatus },
	answer: CrisisAnswer | null,
	isAuthor: boolean,
	timeZone: string
): CrisisPanel | null {
	if (paper.status === 'submitted' && goesToCrisisStaff(paper.kind) && isAuthor) {
		const next =
			paper.kind === 'press_release'
				? 'The crisis staff will publish it to the committee or refuse it.'
				: 'The crisis staff will carry it out or refuse it, and answer you here.';

		return {
			title: 'With the crisis staff',
			sentence: `${next} Until then the text is frozen.`,
			byline: null
		};
	}

	if (answer === null || !isAnsweredByCrisisStaff(paper.status)) return null;

	if (!isAuthor && paper.kind !== 'committee_directive') return null;

	const title = statusLabel('paper_status', answer.outcome);
	const when = dayAndTime(answer.answeredAt, timeZone);

	if (answer.text === null) {
		return {
			title,
			sentence: `The crisis staff ${answerInSentence(answer.outcome)} on ${when}.`,
			byline: null
		};
	}

	return { title, sentence: answer.text, byline: `Crisis staff · ${when}` };
}

/** One paper on the crisis staff's page. */
export type CrisisDeskItem = {
	id: string;
	kind: PaperKind;
	status: PaperStatus;
	title: string;
	/** The characters who wrote it, the lead first: "Minister of Defence". */
	characters: string[];
	/** When it was sent (a committee directive: submitted to the dais), as an ISO timestamp. */
	sentAt: string | null;
	/** When the crisis staff answered it, or `null` while it waits. */
	answeredAt: string | null;
};

/** True for a paper waiting for the crisis staff: sent to them, or a committee directive passed. */
export function isWaitingForCrisisStaff(paper: { kind: PaperKind; status: PaperStatus }): boolean {
	if (paper.kind === 'committee_directive') return paper.status === 'passed';

	return goesToCrisisStaff(paper.kind) && paper.status === 'submitted';
}

/** An ISO timestamp for sorting, with a missing one last. */
function sortableMoment(moment: string | null): string {
	return moment ?? '9999';
}

/**
 * The crisis staff's two lists: what waits for them, oldest first, since that
 * is the one to answer next; and what they have answered, latest first.
 */
export function crisisDeskSections(items: CrisisDeskItem[]): {
	waiting: CrisisDeskItem[];
	answered: CrisisDeskItem[];
} {
	return {
		waiting: items
			.filter(isWaitingForCrisisStaff)
			.sort((first, second) =>
				sortableMoment(first.sentAt).localeCompare(sortableMoment(second.sentAt))
			),
		answered: items
			.filter((item) => isAnsweredByCrisisStaff(item.status))
			.sort((first, second) =>
				sortableMoment(second.answeredAt).localeCompare(sortableMoment(first.answeredAt))
			)
	};
}

/**
 * The line under a paper on the crisis staff's page: "Personal directive ·
 * Minister of Defence · 09:12", with the time it was sent while it waits and
 * the time it was answered once it has been.
 */
export function crisisDeskMetaLine(item: CrisisDeskItem, timeZone: string): string {
	const moment = item.answeredAt ?? item.sentAt;
	const parts = [
		statusLabel('paper_kind', item.kind),
		item.characters.join(', '),
		moment === null ? '' : formatTimeOfDay(moment, timeZone)
	];

	return parts.filter((part) => part !== '').join(' · ');
}

/**
 * The line under a paper's title where the crisis staff answer it:
 * "Personal directive · Minister of Defence · Sent 15 March, 09:12 · With the
 * crisis staff", or "Committee directive · Passed" for one the committee sent.
 */
export function crisisPaperMetaLine(
	paper: { kind: PaperKind; status: PaperStatus; submittedAt: string | null },
	characters: string[],
	answer: CrisisAnswer | null,
	timeZone: string
): string {
	const progress =
		crisisProgressWord(paper, answer, timeZone) ?? statusLabel('paper_status', paper.status);
	const parts = [statusLabel('paper_kind', paper.kind), characters.join(', '), progress];

	return parts.filter((part) => part !== '').join(' · ');
}

/** One of the crisis staff's buttons on a paper: the outcome it sends, and what it says. */
export type AnswerChoice = { outcome: CrisisOutcome; label: string };

/** "Carry out" and "Refuse", or "Publish" and "Refuse" for a press release, the first the primary. */
export function answerChoices(kind: PaperKind): AnswerChoice[] {
	const yes: AnswerChoice =
		kind === 'press_release'
			? { outcome: 'published', label: 'Publish' }
			: { outcome: 'carried_out', label: 'Carry out' };

	return [yes, { outcome: 'refused', label: 'Refuse' }];
}

/** The toast once the crisis staff answer: "“Seize the ports” carried out." */
export function answeredMessage(outcome: CrisisOutcome, title: string): string {
	return `“${title}” ${statusLabel('paper_status', outcome).toLowerCase()}.`;
}

/** What the answer form sends, read and checked, or the sentence that says what is wrong. */
export type AnswerForm =
	| { outcome: CrisisOutcome; answer: string; error: null }
	| { outcome: null; answer: string; error: string };

/**
 * Read the answer form: which button was pressed (its `outcome`) and the
 * answer typed. Only the outcomes the paper's kind allows are taken, and an
 * empty answer is allowed (decision 10). The database checks it all again.
 */
export function readAnswerForm(formData: FormData, kind: PaperKind): AnswerForm {
	const outcome = formData.get('outcome');
	const answerValue = formData.get('answer');
	const answer = typeof answerValue === 'string' ? answerValue.trim() : '';
	const choice = answerChoices(kind).find((option) => option.outcome === outcome);

	if (choice === undefined) return { outcome: null, answer, error: 'Choose how to answer it.' };

	if (answer.length > CRISIS_ANSWER_MAX_LENGTH) {
		return { outcome: null, answer, error: 'An answer is at most 100,000 characters.' };
	}

	return { outcome: choice.outcome, answer, error: null };
}

/** What the crisis update form sends, read and checked. */
export type CrisisUpdateForm = { message: string; error: string | null };

/** Read the crisis update typed. An empty one takes the last update off the room's screens. */
export function readCrisisUpdateForm(formData: FormData): CrisisUpdateForm {
	const value = formData.get('message');
	const message = typeof value === 'string' ? value.trim() : '';

	if (message.length > CRISIS_UPDATE_MAX_LENGTH) {
		return { message, error: 'A crisis update is at most 1,000 characters.' };
	}

	return { message, error: null };
}

/** The room's crisis update as `committee_state` holds it, or `null` when there is none. */
export type CrisisUpdate = { message: string; sentAt: string };

/** "Crisis update · 14:07": the line above the update on the live view and the projector. */
export function crisisUpdateLabel(update: CrisisUpdate, timeZone: string): string {
	return `Crisis update · ${formatTimeOfDay(update.sentAt, timeZone)}`;
}

/** The toast once the crisis staff send an update, or take the last one down. */
export function crisisUpdateSentMessage(message: string): string {
	return message === '' ? 'The crisis update is taken down.' : 'Crisis update sent to the room.';
}

/**
 * The press releases the crisis staff published to the committee, the latest
 * first: what the room has been told, for the committee's papers list.
 */
export function publishedPressReleases(papers: PaperListItem[]): PaperListItem[] {
	return papers
		.filter((paper) => paper.kind === 'press_release' && paper.status === 'published')
		.sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
}
