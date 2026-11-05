/**
 * The papers a committee's delegates write together (`docs/committee-papers.md`):
 * working papers, draft resolutions, and a crisis committee's directives and
 * press releases. What the pages under `resolutions` work out about them, with
 * nothing that talks to the database; the reads and writes are in
 * `$lib/server/committee-papers.ts` and the files beside it.
 */

import { formatDayAndLongMonth } from '$lib/dashboard-dates';
import type { Database } from '$lib/database.types';
import type { LiveWriter } from '$lib/live-writers';
import type { DraftSaveStatus } from '$lib/paper-writing';
import { statusBadgeTone, statusLabel, type BadgeTone } from '$lib/status';
import type { CommitteePaperDialog } from '$lib/urls';

export type PaperKind = Database['public']['Enums']['paper_kind'];
export type PaperStatus = Database['public']['Enums']['paper_status'];
/** Whether a seat writes a paper (`author`) or has signed it (`signatory`). */
export type PaperSeatRole = Database['public']['Enums']['paper_seat_role'];
/** The organiser's choice of words for a paper's people (section 5, "Words"). */
export type PaperWords = Database['public']['Enums']['paper_words'];
export type CommitteeFormat = Database['public']['Enums']['committee_format'];

/** What a committee's settings say about the papers its delegates write. */
export type PaperCommittee = {
	format: CommitteeFormat;
	/** True for a crisis committee its organiser lets write working papers and draft resolutions too. */
	crisisAllowsResolutions: boolean;
	/** False when blocs write draft resolutions from the start, as at THIMUN. */
	hasWorkingPapers: boolean;
	paperWords: PaperWords;
	/** The committee's topics, in the organiser's order. */
	topics: string[];
	/** The topic on the agenda, or `null` before the committee has set one. */
	agendaTopic: string | null;
};

/** The longest title a paper may have, as `start_paper` checks it. */
export const PAPER_TITLE_MAX_LENGTH = 200;

/** What a committee paper's writer is told when it cannot be saved, beside `PAPER_WRITING_MESSAGES`. */
export const COMMITTEE_PAPER_MESSAGES = {
	replaced: 'This paper can no longer be changed here. Reload the page to see it as it is now.',
	tooLong: 'This paper is too long to save. Shorten it, then save again.',
	conflict:
		'Another author saved this paper since you opened it. Press "Save changes" again to keep this version.',
	saved: 'Changes saved.'
} as const;

/** The kinds a crisis committee writes, in the order its "Start a paper" form offers them. */
const CRISIS_KINDS: PaperKind[] = [
	'committee_directive',
	'joint_directive',
	'personal_directive',
	'press_release'
];

/**
 * The kinds of paper the committee's delegates may start, in the order the
 * "Start a paper" form offers them, the way `start_paper` decides it
 * (section 4): a standard committee writes working papers and draft
 * resolutions, a crisis committee its four crisis kinds and, when its
 * organiser allows it, those two as well. A committee that switched working
 * papers off writes draft resolutions from the start.
 */
export function startablePaperKinds(
	committee: Pick<PaperCommittee, 'format' | 'crisisAllowsResolutions' | 'hasWorkingPapers'>
): PaperKind[] {
	const resolutionKinds: PaperKind[] = committee.hasWorkingPapers
		? ['working_paper', 'draft_resolution']
		: ['draft_resolution'];

	if (committee.format === 'standard') return resolutionKinds;

	if (committee.crisisAllowsResolutions) return [...CRISIS_KINDS, ...resolutionKinds];

	return [...CRISIS_KINDS];
}

/** The papers page's title: "Directives" in a crisis committee, "Resolutions" elsewhere. */
export function papersPageTitle(format: CommitteeFormat): string {
	return format === 'crisis' ? 'Directives' : 'Resolutions';
}

/**
 * What the last section of the list says while nothing has passed. It holds a
 * crisis committee's passed directives, under the page's own title.
 */
export function noPassedPaperSentence(format: CommitteeFormat): string {
	return format === 'crisis' ? 'No directive has passed.' : 'No resolution has passed.';
}

/**
 * The topic a new paper's form starts on: the one on the agenda, or a
 * committee's only topic. `null` leaves the delegate to pick one.
 */
export function presetTopic(
	committee: Pick<PaperCommittee, 'topics' | 'agendaTopic'>
): string | null {
	const { topics, agendaTopic } = committee;

	if (agendaTopic !== null && topics.includes(agendaTopic)) return agendaTopic;

	return topics.length === 1 ? topics[0] : null;
}

/** The parts of a paper that say what it is called. */
export type PaperName = { kind: PaperKind; topicNumber: number | null; sequence: number | null };

/**
 * The paper's kind and, once the dais has numbered it on approval, its
 * number: "Working paper 1.2", or "Working paper" before then.
 */
export function paperKindAndNumber(paper: PaperName): string {
	const kind = statusLabel('paper_kind', paper.kind);

	if (paper.topicNumber === null || paper.sequence === null) return kind;

	return `${kind} ${paper.topicNumber}.${paper.sequence}`;
}

/**
 * What a screen reader calls the sheet a paper is written on, which an empty
 * paper also shows in grey: "The working paper's text".
 */
export function paperTextLabel(kind: PaperKind): string {
	return `The ${statusLabel('paper_kind', kind).toLowerCase()}'s text`;
}

/**
 * The line of facts under a paper's title: "Working paper · Lethal autonomous
 * weapons · Saved". The topic is left out for a committee without topics, and
 * the save word where nothing saves by itself. A draft resolution's or a
 * directive's heading names its topic, so there `stateWord`, who may see it
 * ("Open for signatures"), takes the topic's place. The space before each
 * dot cannot break, so a line never starts with one.
 */
export function paperMetaLine(
	paper: PaperName & { topic: string | null },
	saveWord: string | null,
	stateWord: string | null = null
): string {
	const parts = [paperKindAndNumber(paper), stateWord ?? paper.topic, saveWord];

	return parts.filter((part) => part !== null && part !== '').join(' · ');
}

/**
 * How the paper's text stands, for the end of that line: "Saving…" while a
 * save waits or is on its way, "Not saved" once one has failed, and "Saved".
 */
export function paperSaveWord(status: DraftSaveStatus): string {
	if (status === 'waiting' || status === 'saving') return 'Saving…';
	if (status === 'failed' || status === 'conflict') return 'Not saved';

	return 'Saved';
}

/** One paper in the committee's list. */
export type PaperListItem = PaperName & {
	id: string;
	status: PaperStatus;
	title: string;
	topic: string | null;
	isOpenForSignatures: boolean;
	/** When its text or title last changed, as an ISO timestamp. */
	updatedAt: string;
	/** The reader's seat on the paper, or `null` when it is not on it. */
	myRole: PaperSeatRole | null;
};

/** One paper, as its own page shows it. */
export type CommitteePaper = PaperName & {
	id: string;
	status: PaperStatus;
	title: string;
	topic: string | null;
	isOpenForSignatures: boolean;
	/** When it was opened for signatures, or `null` while it is not open (kept by a trigger). */
	signaturesOpenedAt: string | null;
	/** When it first went to the dais, or `null` while it never has. */
	submittedAt: string | null;
	/** The seat that leads the paper, or `null` once every author has gone. */
	leadSeatId: string | null;
	/**
	 * The text as Markdown, `''` until somebody writes. A draft resolution's
	 * two parts are joined into one text (`$lib/resolution-text.ts`).
	 */
	body: string;
	/** Moves on by one with every save of the text or the title. */
	revision: number;
	/** When it was last saved. */
	updatedAt: string;
	/** Who saved it last, or `null` when nobody has or that account is gone. */
	updatedById: string | null;
};

/** The reader's own seat in the committee. */
export type PaperSeat = {
	id: string;
	/** Such as "Austria". */
	name: string;
	/** An observer may sign a paper but never write one (section 5). */
	isObserver: boolean;
};

/** The list's four sections, in the order a delegate needs them (section 6). */
export type PaperSections = {
	/** The papers the reader's seat writes or has signed, whatever their status. */
	yours: PaperListItem[];
	/** Other seats' papers waiting for signatures. */
	openForSignatures: PaperListItem[];
	/** Every paper on the floor, by number. */
	introduced: PaperListItem[];
	/** Every resolution the committee has passed, by number. */
	passed: PaperListItem[];
};

/** Most recently changed first. */
function byLatestChange(first: PaperListItem, second: PaperListItem): number {
	return second.updatedAt.localeCompare(first.updatedAt);
}

/**
 * The order the kinds are listed in. `Record<PaperKind, number>` makes
 * TypeScript insist on a place for every kind.
 */
const KIND_ORDER: Record<PaperKind, number> = {
	working_paper: 1,
	draft_resolution: 2,
	committee_directive: 3,
	joint_directive: 4,
	personal_directive: 5,
	press_release: 6
};

/** Where a paper comes in the committee's numbering. A paper with no number yet comes last. */
function numberOrder(paper: PaperListItem): number[] {
	const unnumbered = Number.MAX_SAFE_INTEGER;

	return [paper.topicNumber ?? unnumbered, KIND_ORDER[paper.kind], paper.sequence ?? unnumbered];
}

/**
 * By number: "Working paper 1.1", "Working paper 1.2", "Draft resolution
 * 1.1", then the second topic's. Each kind is numbered on its own, so the
 * kind comes between the topic and the paper's place on it.
 */
function byNumber(first: PaperListItem, second: PaperListItem): number {
	const firstOrder = numberOrder(first);
	const secondOrder = numberOrder(second);
	const differing = firstOrder.findIndex((part, index) => part !== secondOrder[index]);

	return differing === -1 ? 0 : firstOrder[differing] - secondOrder[differing];
}

/** A paper's status as the list shows it: the word, and the colour of its dot. */
export type PaperStatusLine = { text: string; tone: BadgeTone };

/**
 * Where a paper stands, in a word: "Open for signatures" for one its authors
 * have opened while they write it, otherwise its status, such as "Being
 * written" or "Introduced".
 */
export function paperStatusLine(
	paper: Pick<PaperListItem, 'status' | 'isOpenForSignatures'>
): PaperStatusLine {
	if (paper.status === 'writing' && paper.isOpenForSignatures) {
		return { text: 'Open for signatures', tone: 'neutral' };
	}

	return {
		text: statusLabel('paper_status', paper.status),
		tone: statusBadgeTone('paper_status', paper.status)
	};
}

/**
 * True for a paper the committee passed. A committee directive stays passed
 * after the crisis staff answer it, though its status then says what they did.
 */
export function hasPassed(paper: Pick<PaperListItem, 'kind' | 'status'>): boolean {
	if (paper.kind === 'committee_directive') {
		return ['passed', 'carried_out', 'refused'].includes(paper.status);
	}

	return paper.status === 'passed';
}

/**
 * The papers the reader may read, sorted into the list's sections. Introduced
 * and passed papers are the committee's record, so they list the reader's own
 * as well; a paper open for signatures is listed only when the reader's seat
 * is not on it yet, since one it is on is under "Yours".
 */
export function paperSections(papers: PaperListItem[]): PaperSections {
	return {
		yours: papers.filter((paper) => paper.myRole !== null).sort(byLatestChange),
		openForSignatures: papers
			.filter(
				(paper) => paper.isOpenForSignatures && paper.status === 'writing' && paper.myRole === null
			)
			.sort(byLatestChange),
		introduced: papers.filter((paper) => paper.status === 'introduced').sort(byNumber),
		passed: papers.filter(hasPassed).sort(byNumber)
	};
}

/** One seat on a paper, as the paper's people show it. */
export type PaperPerson = {
	seatId: string;
	/** The seat's name, such as "France". */
	seatName: string;
	countryCode: string | null;
	/**
	 * The id of whoever sits in the seat now, which names the writer of a
	 * suggestion (its marks carry their id), or `null` when nobody does.
	 */
	holderId: string | null;
	/** Who sits in the seat now, or `null` when nobody does. */
	holderName: string | null;
	role: PaperSeatRole;
	isLead: boolean;
	/** True for the reader's own seat. */
	isMine: boolean;
};

/**
 * The people who may type in the paper, as the server knows them: whoever
 * holds a seat that writes it, named by their seat. The live page names a
 * cursor only from this list, never from what its own browser sent
 * (`$lib/live-writers.ts`). A seat nobody holds has no writer.
 */
export function paperLiveWriters(people: PaperPerson[]): LiveWriter[] {
	return people.flatMap((person) =>
		person.role === 'author' && person.holderId !== null
			? [
					{
						id: person.holderId,
						name: person.holderName ?? person.seatName,
						seatName: person.seatName
					}
				]
			: []
	);
}

/** What a committee calls the authors and the lead, from its "Words" setting. */
export type AuthorWords = {
	heading: string;
	lead: string;
	/** One of the authors who is not the lead: "an author", or "a co-submitter". */
	anAuthor: string;
	makeLead: string;
	add: string;
};

/**
 * The words for a paper's authors. With THIMUN's words the lead is the main
 * submitter and every other author a co-submitter (section 5); they change
 * nothing but the words. Otherwise the authors of a draft resolution or a
 * directive are its sponsors, as the committee calls them.
 */
export function authorWords(words: PaperWords, kind?: PaperKind): AuthorWords {
	if (words === 'submitters') {
		return {
			heading: 'Submitters',
			lead: 'Main submitter',
			anAuthor: 'a co-submitter',
			makeLead: 'Make main submitter',
			add: 'Add a co-submitter'
		};
	}

	if (kind === 'draft_resolution' || kind === 'committee_directive') {
		return {
			heading: 'Sponsors',
			lead: 'Lead',
			anAuthor: 'a sponsor',
			makeLead: 'Make lead',
			add: 'Add a sponsor'
		};
	}

	return {
		heading: 'Authors',
		lead: 'Lead',
		anAuthor: 'an author',
		makeLead: 'Make lead',
		add: 'Add an author'
	};
}

/** The toast once a seat is added to a paper: "Mexico is now an author." */
export function authorAddedMessage(seatName: string, words: AuthorWords): string {
	return `${seatName} is now ${words.anAuthor}.`;
}

/** The toast once the lead hands the paper on: "Mexico is now the lead." */
export function leadHandedMessage(seatName: string, words: AuthorWords): string {
	return `${seatName} is now the ${words.lead.toLowerCase()}.`;
}

/** The line under a seat's name: "Clara Whitfield (you) · Lead". */
export function paperPersonLine(person: PaperPerson, words: AuthorWords): string {
	const parts: string[] = [];

	if (person.holderName !== null) {
		parts.push(person.isMine ? `${person.holderName} (you)` : person.holderName);
	}

	if (person.isLead) parts.push(words.lead);

	return parts.join(' · ');
}

/**
 * What "Leave" asks the reader to confirm. A lead who leaves hands the lead
 * to the author who joined first (rule 4), so the lead is told who leads next.
 */
export function leavePaperSentence(isLead: boolean, words: AuthorWords): string {
	const leaving =
		'Your seat stops writing this paper, and you can no longer open it while it is being written.';

	if (!isLead) return leaving;

	const others = words.heading.toLowerCase();
	const lead = words.lead.toLowerCase();

	return `${leaving} Of the other ${others}, the one who joined first becomes the ${lead}.`;
}

/**
 * True when the reader's seat is the paper's only author and its lead: the
 * one who cannot leave it to anybody, and so deletes it instead while it has
 * never been submitted.
 */
export function isLoneLead(people: PaperPerson[]): boolean {
	const authors = people.filter((person) => person.role === 'author');

	return authors.length === 1 && authors[0].isMine && authors[0].isLead;
}

/**
 * What the reader may do to the paper's people (rule 4), and to the paper
 * itself (rule 5), which is what its page offers.
 */
export type PaperPeopleActions = {
	/** "Add an author": every author may. */
	canAdd: boolean;
	/** "Make lead", on the other authors' rows: the lead's alone. */
	canHandLead: boolean;
	/** "Leave": every author may, while another remains. */
	canLeave: boolean;
	/** "Delete", in place of "Leave": the only author, while the paper has never been submitted. */
	canDelete: boolean;
	/** "Submit to the dais": every author, while the paper is being written. */
	canSubmit: boolean;
	/**
	 * "Withdraw": every author, once the paper has been to the dais and until
	 * it is introduced. A paper never submitted is deleted or left instead.
	 */
	canWithdraw: boolean;
};

/** What somebody who reads the paper may do to who writes it: nothing. */
export const NO_PAPER_ACTIONS: PaperPeopleActions = {
	canAdd: false,
	canHandLead: false,
	canLeave: false,
	canDelete: false,
	canSubmit: false,
	canWithdraw: false
};

/** Where an author may still withdraw a paper; once introduced it is the dais's to withdraw. */
const WITHDRAWN_BY_AUTHORS: PaperStatus[] = ['writing', 'submitted', 'approved'];

/**
 * What the reader may do to the paper's people and to the paper. `mayWrite`
 * is the database's `may_write_paper`: the paper is being written and the
 * reader's seat is one of its authors. The database checks each again when it
 * is done, so this only decides which buttons the page draws.
 */
export function paperPeopleActions(
	people: PaperPerson[],
	paper: Pick<CommitteePaper, 'status' | 'submittedAt'> & { kind?: PaperKind },
	mayWrite: boolean
): PaperPeopleActions {
	const isAuthor = people.some((person) => person.isMine && person.role === 'author');
	const canWithdraw =
		isAuthor && paper.submittedAt !== null && WITHDRAWN_BY_AUTHORS.includes(paper.status);

	if (!mayWrite) {
		return {
			canAdd: false,
			canHandLead: false,
			canLeave: false,
			canDelete: false,
			canSubmit: false,
			canWithdraw
		};
	}

	const isAlone = isLoneLead(people);
	const isLead = people.some((person) => person.isMine && person.isLead);

	return {
		// A personal directive is one character's own (section 2), so nobody joins it.
		canAdd: paper.kind !== 'personal_directive',
		canHandLead: isLead && !isAlone,
		canLeave: !isAlone,
		canDelete: isAlone && paper.submittedAt === null,
		canSubmit: true,
		canWithdraw
	};
}

/**
 * The dialog the address opens over the paper (`?add=1`, `?leave=1`,
 * `?delete=1`, `?submit=1` or `?withdraw=1`), or `null`. One the reader may
 * not use is never opened, so an old link cannot offer what the database
 * would refuse.
 */
export function readPaperDialog(
	searchParams: URLSearchParams,
	actions: PaperPeopleActions
): CommitteePaperDialog | null {
	if (searchParams.get('add') === '1' && actions.canAdd) return 'add';
	if (searchParams.get('leave') === '1' && actions.canLeave) return 'leave';
	if (searchParams.get('delete') === '1' && actions.canDelete) return 'delete';
	if (searchParams.get('submit') === '1' && actions.canSubmit) return 'submit';
	if (searchParams.get('withdraw') === '1' && actions.canWithdraw) return 'withdraw';

	return null;
}

/** What the form for a new paper sends, tidied. */
export type NewPaperValues = {
	kind: PaperKind;
	title: string;
	/** One of the committee's topics, or `null` for a committee with none. */
	topic: string | null;
	/** The introduced working papers a draft resolution is based on; none for any other kind. */
	sourcePaperIds: string[];
};

/** What is wrong with each field of the form, if anything. */
export type NewPaperErrors = { kind?: string; title?: string; topic?: string };

/** One text field of a form, or `''` when it sent none. */
function readText(formData: FormData, name: string): string {
	const value = formData.get(name);

	return typeof value === 'string' ? value.trim() : '';
}

/** The shape of a row's id, a Postgres `uuid`, such as a seat's or a paper's. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The working papers ticked under "Based on", each once. Anything that is no
 * paper's id is dropped rather than sent, because the database answers it with
 * a fault instead of a sentence.
 */
function readSourcePaperIds(formData: FormData): string[] {
	const ids = formData
		.getAll('sourcePaperIds')
		.filter((value): value is string => typeof value === 'string')
		.map((value) => value.trim().toLowerCase())
		.filter((value) => UUID_PATTERN.test(value));

	// A `Set` keeps each id once, in the order it was first sent.
	return [...new Set(ids)];
}

/**
 * Read the form for a new paper. The kind, the title and the topic are
 * checked here so the form can say what is wrong beside the field;
 * `start_paper` checks them again, the same way. Only a draft resolution is
 * based on working papers, so the boxes ticked under "Based on" are dropped
 * for any other kind: without JavaScript they are on the form whatever kind
 * is chosen.
 */
export function readNewPaperForm(
	formData: FormData,
	topics: string[],
	kinds: PaperKind[]
): { values: NewPaperValues; errors: NewPaperErrors } {
	const sentKind = readText(formData, 'kind');
	const chosenKind = kinds.find((kind) => kind === sentKind);
	const title = readText(formData, 'title');
	const sentTopic = readText(formData, 'topic');
	// A committee with no topics has papers with none.
	const topic = topics.length === 0 ? null : sentTopic;
	const errors: NewPaperErrors = {};

	if (chosenKind === undefined) {
		errors.kind = 'Choose the kind of paper.';
	}

	if (title === '') {
		errors.title = 'Give the paper a title.';
	} else if (title.length > PAPER_TITLE_MAX_LENGTH) {
		errors.title = `The title can be at most ${PAPER_TITLE_MAX_LENGTH} characters.`;
	}

	if (topic !== null && !topics.includes(topic)) {
		errors.topic = 'Choose the topic the paper is on.';
	}

	// The form keeps showing a kind the committee offers, even after a wrong one was sent.
	const kind = chosenKind ?? kinds[0];
	const sourcePaperIds = kind === 'draft_resolution' ? readSourcePaperIds(formData) : [];

	return { values: { kind, title, topic: topic === '' ? null : topic, sourcePaperIds }, errors };
}

/**
 * The seat a form chose, sent as `seatId`, or `null` when it sent none or
 * something that is no seat's id. The database answers an id that is not one
 * with a fault rather than a sentence, so it is never asked.
 */
export function readChosenSeat(formData: FormData): string | null {
	const id = readText(formData, 'seatId');

	return UUID_PATTERN.test(id) ? id.toLowerCase() : null;
}

/** A working paper a draft resolution is based on, or may be: what names it, and its title. */
export type PaperSource = PaperName & { id: string; title: string };

/** What a working paper is called beside its box under "Based on": "Working paper 1.1 · Meaningful human control". */
export function paperSourceLabel(source: PaperSource): string {
	return `${paperKindAndNumber(source)} · ${source.title}`;
}

/** One working paper a draft is based on, as the writer shows it beside the draft. */
export type SourcePaper = {
	id: string;
	title: string;
	/** Such as "Working paper 1.1". */
	kindAndNumber: string;
	/** Such as "Austria, Costa Rica · Introduced 14 March". */
	metaLine: string;
	/** HTML that `renderMarkdown` in `$lib/server/markdown.ts` made from its text. */
	bodyHtml: string;
};

/**
 * The line under a working paper's title beside the draft: its authors' seats
 * in the order given, the lead first, then the day the committee introduced it
 * in the conference's own time zone, "Austria, Costa Rica · Introduced 14
 * March". Either part is left out when there is nothing to say.
 */
export function sourcePaperMetaLine(
	authorSeatNames: string[],
	introducedAt: string | null,
	timeZone: string
): string {
	const parts = [authorSeatNames.join(', ')];

	if (introducedAt !== null) {
		parts.push(`Introduced ${formatDayAndLongMonth(introducedAt, timeZone)}`);
	}

	return parts.filter((part) => part !== '').join(' · ');
}
