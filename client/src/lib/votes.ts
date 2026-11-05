/**
 * The chair's Vote view: the shape of a session's votes, the sentences its
 * actions answer with, and the readings of its forms.
 *
 * `specs/05-pages/chair/voting.md` describes the view. Whether a vote passed is
 * `voteResult` in `$lib/committee-room.ts`, which every screen in the room
 * shares; the words and the choices the view draws are in `$lib/vote-view.ts`.
 * Fetching and writing is `$lib/server/votes.ts`'s job. Nothing here talks to
 * Supabase, so the components can import it too.
 */

import type { VoteStatus } from '$lib/chair-room';
import type { AttendanceStatus, MajorityType, VoteCounts } from '$lib/committee-room';
import type { Database } from '$lib/database.types';
import type { FloorPaper } from '$lib/papers-on-floor';

type RoomEnums = Database['public']['Enums'];

/** How the votes are collected: `show_of_hands` or `roll_call`. */
export type VoteMethod = RoomEnums['vote_method'];

/** One seat's answer in a roll call vote: `for`, `against` or `abstain`. */
export type VoteChoice = RoomEnums['vote_choice'];

/** What a vote decides: `substantive` (a resolution, an amendment) or `procedural`. */
export type VoteKind = RoomEnums['vote_kind'];

/** One vote of a session. The counts and `passed` are null until it is closed. */
export type SessionVote = {
	id: string;
	/** What the committee votes on, such as "Draft Resolution 1.1". */
	subject: string;
	/** Substantive or procedural, as the chair chose in the set-up. */
	kind: VoteKind;
	method: VoteMethod;
	majority: MajorityType;
	status: VoteStatus;
	/**
	 * A show of hands' counts are saved while the chair counts (`count`), so
	 * the projector can follow; a roll call vote's stay null until it closes.
	 */
	votesFor: number | null;
	votesAgainst: number | null;
	votesAbstain: number | null;
	passed: boolean | null;
	openedAt: string;
	closedAt: string | null;
};

/**
 * The vote the room is on (`committee_state.current_vote_id`), open or, after
 * "Close vote", closed until "End voting", with each roll call answer so far
 * keyed by seat id. The delegate live view reads only an open one.
 */
export type OpenVote = SessionVote & {
	/** Empty for a show of hands, which records no seat's answer. */
	entries: Record<string, VoteChoice>;
};

/** A session's votes, as `getVotes` in `$lib/server/votes.ts` reads them. */
export type SessionVotes = {
	/** The vote `committee_state.current_vote_id` points at, open or closed, or null. */
	currentVote: OpenVote | null;
	/** Every closed vote of the session, newest first. */
	closedVotes: SessionVote[];
};

/**
 * What the Vote view draws besides the chair layout's frame, as
 * `readVoteView` in `$lib/server/vote-view.ts` reads it. `chair/voting`, and
 * `chair` while the room votes, return it as `voteView`.
 */
export type VoteViewData = {
	/** The room's current vote, open or closed, with its roll call answers, or null. */
	vote: OpenVote | null;
	/** Every closed vote of the session, newest first, for "Votes this session". */
	closedVotes: SessionVote[];
	/** `?vote=new`: the set-up, while a closed vote's result is still on show. */
	isNewVoteShown: boolean;
	/** `?cancel=confirm`: Cancel vote's question, asked without JavaScript. */
	isCancelConfirming: boolean;
	/** `?seat=<id>`: the roll call row whose answer gets the focus back after a press. */
	focusedSeatId: string | null;
	/**
	 * What the vote form lists, in order (`listVoteSubjects` in
	 * `$lib/server/paper-votes.ts`): empty until there is a paper to vote on,
	 * when the form is the typed subject alone, as before papers.
	 */
	subjects: VoteSubject[];
};

/**
 * One line of the vote form's list: an introduced draft, or an approved
 * amendment to one, which `isAmendment` marks so its vote is saved against
 * the amendment (`votes.amendment_id`) and not the draft.
 */
export type VoteSubject = FloorPaper & { isAmendment?: boolean };

/** What the open-a-vote form holds, as text, so a refused form is drawn again as it was. */
export type VoteFormValues = {
	/**
	 * The draft or amendment picked from the list by its id, `OTHER_VOTE_SUBJECT`,
	 * or `''` with no list. The field kept its first name, from before amendments.
	 */
	paperId: string;
	subject: string;
	kind: string;
	majority: string;
	method: string;
};

/** A message for each field that needs fixing. A field that is fine has no entry. */
export type VoteFormErrors = Partial<Record<keyof VoteFormValues, string>>;

/** A vote as `$lib/server/votes.ts` opens it. */
export type VoteInput = {
	/** The paper the vote decides, which closing it settles; left out for a typed subject. */
	paperId?: string;
	/** The amendment the vote decides instead, which closing it settles; left out otherwise. */
	amendmentId?: string;
	subject: string;
	kind: VoteKind;
	majority: MajorityType;
	method: VoteMethod;
};

/**
 * The line of the vote form's list for a subject typed by hand, such as a
 * motion's name. The list itself is `voteSubjectChoices` in `$lib/paper-votes.ts`.
 */
export const OTHER_VOTE_SUBJECT = 'other';

/** The longest subject a vote may have. The subject box also stops typing there. */
export const VOTE_SUBJECT_MAX_LENGTH = 200;

/** The sentences the view's actions answer with when they refuse. */
export const VOTE_REFUSALS = {
	noSession: 'Start a session first.',
	noRollCall: 'Take roll call before opening a vote.',
	suspended: 'Resume the session first.',
	voteOpen: 'Close the open vote first.',
	notOpen: 'That vote is no longer open.',
	notRollCall: 'That vote is counted by show of hands.',
	notShowOfHands: 'That vote is taken by roll call.',
	seat: 'That seat is not in this committee.',
	seatNotPresent: 'That seat is not present.',
	cannotAbstain: 'Present and voting seats cannot abstain.',
	choice: 'Choose Yes, No or Abstain.',
	voteCounts: 'Enter the votes as whole numbers.',
	tooManyVotes: 'More votes than delegates present.',
	notCounted: 'Count the votes before closing.',
	stillOpen: 'Close or cancel the open vote first.',
	notVoting: 'The room is not voting.'
} as const;

/** The messages under the open-a-vote form's fields. */
export const VOTE_FIELD_MESSAGES = {
	subject: 'Say what the committee is voting on.',
	subjectLength: `Keep the subject under ${VOTE_SUBJECT_MAX_LENGTH} characters.`,
	kind: 'Pick substantive or procedural.',
	paperKind: 'A vote on a paper is substantive.',
	paperId: 'That paper is no longer on the list. Pick another, or Other.',
	majority: 'Pick simple or two-thirds.',
	method: 'Pick show of hands or roll call.'
} as const;

/** One segment of the set-up's choices. */
export type VoteFormOption = {
	value: string;
	label: string;
};

/** The set-up's Type, substantive first, which is chosen at first. */
export const VOTE_KIND_OPTIONS: VoteFormOption[] = [
	{ value: 'substantive', label: 'Substantive' },
	{ value: 'procedural', label: 'Procedural' }
];

/** The set-up's Majority, simple first, which is chosen at first. */
export const MAJORITY_OPTIONS: VoteFormOption[] = [
	{ value: 'simple', label: 'Simple' },
	{ value: 'two_thirds', label: 'Two-thirds' }
];

/** The set-up's Method, in the words a chair uses: counting hands first, chosen at first. */
export const METHOD_OPTIONS: VoteFormOption[] = [
	{ value: 'show_of_hands', label: 'Count hands' },
	{ value: 'roll_call', label: 'Roll call' }
];

/** The three answers a seat may give in a roll call vote, in the order the buttons show. */
export const VOTE_CHOICES: VoteChoice[] = ['for', 'against', 'abstain'];

/** What a roll call vote's buttons say: what delegates answer aloud. */
export const ROLL_CALL_ANSWER_LABELS: Record<VoteChoice, string> = {
	for: 'Yes',
	against: 'No',
	abstain: 'Abstain'
};

const KINDS: VoteKind[] = ['substantive', 'procedural'];
const MAJORITIES: MajorityType[] = ['simple', 'two_thirds'];
const METHODS: VoteMethod[] = ['show_of_hands', 'roll_call'];

/**
 * The open-a-vote form as it first appears: substantive, simple majority,
 * counting hands, on the first subject of the list, which is the next one
 * the committee votes on.
 */
export function emptyVoteForm(subjects: VoteSubject[] = []): VoteFormValues {
	return {
		paperId: subjects[0]?.id ?? '',
		subject: '',
		kind: 'substantive',
		majority: 'simple',
		method: 'show_of_hands'
	};
}

/** Read one text field from the submitted form, without surrounding spaces. */
function readText(formData: FormData, fieldName: string): string {
	return String(formData.get(fieldName) ?? '').trim();
}

/** The whole number typed in a box, or null for anything else (a sign, a point, nothing). */
function readWholeNumber(text: string): number | null {
	if (!/^\d+$/.test(text)) return null;

	return Number(text);
}

/** Whether `value` is one of `choices`, telling TypeScript so when it is. */
function isOneOf<Choice extends string>(value: string, choices: Choice[]): value is Choice {
	return (choices as string[]).includes(value);
}

/**
 * The paper picked from the vote form's list, or null for a typed subject
 * (Other, or a form with no list). An id the list no longer has, as when the
 * paper was voted on in another tab, is an error.
 */
function readPickedSubject(
	paperId: string,
	subjects: VoteSubject[]
): { paper: VoteSubject | null; error: string | null } {
	if (paperId === '' || paperId === OTHER_VOTE_SUBJECT) return { paper: null, error: null };

	const paper = subjects.find((subject) => subject.id === paperId) ?? null;

	return { paper, error: paper === null ? VOTE_FIELD_MESSAGES.paperId : null };
}

/**
 * Read and check a submitted open-a-vote form. Answers what was typed, a
 * message per field that needs fixing, and, when nothing does, the vote to
 * open. `subjects` is the list the form offered: a paper picked from it
 * names the vote after the paper, and the typed subject is read only for
 * Other or when there is no list.
 */
export function readVoteForm(
	formData: FormData,
	subjects: VoteSubject[] = []
): {
	values: VoteFormValues;
	errors: VoteFormErrors;
	input: VoteInput | null;
} {
	const values: VoteFormValues = {
		paperId: readText(formData, 'paperId'),
		subject: readText(formData, 'subject'),
		kind: readText(formData, 'kind'),
		majority: readText(formData, 'majority'),
		method: readText(formData, 'method')
	};
	const errors: VoteFormErrors = {};
	const kind = isOneOf(values.kind, KINDS) ? values.kind : null;
	const majority = isOneOf(values.majority, MAJORITIES) ? values.majority : null;
	const method = isOneOf(values.method, METHODS) ? values.method : null;

	const picked = readPickedSubject(values.paperId, subjects);

	if (picked.error) errors.paperId = picked.error;
	// A picked paper names the vote, so only a typed subject must be there.
	const isTyped = picked.paper === null && picked.error === null;
	if (isTyped && values.subject === '') errors.subject = VOTE_FIELD_MESSAGES.subject;
	if (isTyped && values.subject.length > VOTE_SUBJECT_MAX_LENGTH) {
		errors.subject = VOTE_FIELD_MESSAGES.subjectLength;
	}
	if (kind === null) errors.kind = VOTE_FIELD_MESSAGES.kind;
	// Adopting a paper is substantive; the database refuses anything else too.
	if (picked.paper && kind === 'procedural') errors.kind = VOTE_FIELD_MESSAGES.paperKind;
	if (majority === null) errors.majority = VOTE_FIELD_MESSAGES.majority;
	if (method === null) errors.method = VOTE_FIELD_MESSAGES.method;

	if (Object.keys(errors).length > 0 || kind === null || majority === null || method === null) {
		return { values, errors, input: null };
	}

	if (picked.paper === null) {
		return { values, errors, input: { subject: values.subject, kind, majority, method } };
	}

	const subject = picked.paper.name;

	// An amendment's vote is tied to the amendment; the database finds its draft from it.
	const tie = picked.paper.isAmendment
		? { amendmentId: picked.paper.id }
		: { paperId: picked.paper.id };

	return { values, errors, input: { ...tie, subject, kind, majority, method } };
}

/** The roll call answer a button sent, or null when it is not one of the three. */
export function readVoteChoice(value: FormDataEntryValue | null): VoteChoice | null {
	const text = String(value ?? '');

	return isOneOf(text, VOTE_CHOICES) ? text : null;
}

/** The three counts typed for a show of hands, or null when one is not a whole number. */
export function readShowOfHands(formData: FormData): VoteCounts | null {
	const votesFor = readWholeNumber(readText(formData, 'votesFor'));
	const votesAgainst = readWholeNumber(readText(formData, 'votesAgainst'));
	const votesAbstain = readWholeNumber(readText(formData, 'votesAbstain'));

	if (votesFor === null || votesAgainst === null || votesAbstain === null) return null;

	return { for: votesFor, against: votesAgainst, abstain: votesAbstain };
}

/** Every hand counted, for, against and abstaining. */
export function totalVotes(counts: VoteCounts): number {
	return counts.for + counts.against + counts.abstain;
}

/**
 * Why a seat may not give `choice` in a roll call vote, or null when it may.
 * `status` is the seat's mark at the latest roll call, or undefined when the
 * roll call did not mark it.
 */
export function castRefusal(
	status: AttendanceStatus | undefined,
	choice: VoteChoice
): string | null {
	if (status === undefined || status === 'absent') return VOTE_REFUSALS.seatNotPresent;
	if (status === 'present_and_voting' && choice === 'abstain') {
		return VOTE_REFUSALS.cannotAbstain;
	}

	return null;
}

/** Add up a roll call vote's answers. A seat with no answer is not counted at all. */
export function countEntries(entries: Record<string, VoteChoice>): VoteCounts {
	const choices = Object.values(entries);

	return {
		for: choices.filter((choice) => choice === 'for').length,
		against: choices.filter((choice) => choice === 'against').length,
		abstain: choices.filter((choice) => choice === 'abstain').length
	};
}

/** The present seats that have not answered yet in a roll call vote. */
export function unvotedCount(
	presentSeatIds: string[],
	entries: Record<string, VoteChoice>
): number {
	const unanswered = presentSeatIds.filter((seatId) => entries[seatId] === undefined);

	return unanswered.length;
}

/** The seats the latest roll call marked "present and voting", which may not abstain. */
export function presentAndVotingSeatIds(attendance: Record<string, AttendanceStatus>): string[] {
	const marks = Object.entries(attendance);
	const presentAndVoting = marks.filter(([, status]) => status === 'present_and_voting');

	return presentAndVoting.map(([seatId]) => seatId);
}

/** A vote's saved counts. A count the database left empty reads as zero. */
export function closedVoteCounts(vote: SessionVote): VoteCounts {
	return {
		for: vote.votesFor ?? 0,
		against: vote.votesAgainst ?? 0,
		abstain: vote.votesAbstain ?? 0
	};
}

/** The tally as the chair reads it out: "5–8–1" for, against, abstain. */
export function formatTally(counts: VoteCounts): string {
	return `${counts.for}–${counts.against}–${counts.abstain}`;
}

/** What the console's keys need of a page's `voteView` data. */
export type VoteViewKeyFacts = {
	/** The room's current vote, open or closed, or null. */
	vote: Pick<SessionVote, 'method' | 'status'> | null;
};

/**
 * Whether a roll call vote is open on the page whose data is `voteView`, which
 * makes Y, N and A answer it and keeps N from calling a speaker
 * (`$lib/console-keys.ts`). `chair/voting`, and `chair` while the room is
 * voting, return the Vote view's data under the name `voteView`; any other
 * page has none, so this is false there.
 */
export function hasOpenRollCallVote(voteView: VoteViewKeyFacts | null | undefined): boolean {
	const vote = voteView?.vote ?? null;

	return vote !== null && vote.method === 'roll_call' && vote.status === 'open';
}
