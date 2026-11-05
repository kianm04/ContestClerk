import { describe, expect, it } from 'vitest';
import {
	OTHER_VOTE_SUBJECT,
	VOTE_FIELD_MESSAGES,
	VOTE_REFUSALS,
	castRefusal,
	closedVoteCounts,
	countEntries,
	emptyVoteForm,
	formatTally,
	hasOpenRollCallVote,
	presentAndVotingSeatIds,
	readShowOfHands,
	readVoteChoice,
	readVoteForm,
	totalVotes,
	unvotedCount,
	type SessionVote
} from './votes';

/** A form carrying `fields`, the way the browser sends one. */
function formOf(fields: Record<string, string>): FormData {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	return formData;
}

/** Two introduced drafts, as the vote form lists them. */
const DRAFT_ONE = { id: 'paper-1', name: 'Draft resolution 1.1', title: 'Human control' };
const DRAFT_TWO = { id: 'paper-2', name: 'Draft resolution 1.2', title: 'Export controls' };

/** A closed vote, changed by `overrides`. */
function closedVote(overrides: Partial<SessionVote> = {}): SessionVote {
	return {
		id: 'vote-1',
		subject: 'Draft Resolution 1.1',
		kind: 'substantive',
		method: 'show_of_hands',
		majority: 'simple',
		status: 'closed',
		votesFor: 9,
		votesAgainst: 3,
		votesAbstain: 1,
		passed: true,
		openedAt: '2026-01-01T10:00:00.000Z',
		closedAt: '2026-01-01T10:05:00.000Z',
		...overrides
	};
}

describe('emptyVoteForm', () => {
	it('starts on a substantive vote, a simple majority, counting hands', () => {
		expect(emptyVoteForm()).toEqual({
			paperId: '',
			subject: '',
			kind: 'substantive',
			majority: 'simple',
			method: 'show_of_hands'
		});
	});

	it('starts on the first subject of the list, the next the committee votes on', () => {
		expect(emptyVoteForm([DRAFT_ONE, DRAFT_TWO]).paperId).toBe('paper-1');
	});
});

describe('readVoteForm', () => {
	it('reads a valid form into the vote to open, trimming the subject', () => {
		const result = readVoteForm(
			formOf({
				subject: '  Draft Resolution 1.1 ',
				kind: 'procedural',
				majority: 'two_thirds',
				method: 'roll_call'
			})
		);

		expect(result.errors).toEqual({});
		expect(result.input).toEqual({
			subject: 'Draft Resolution 1.1',
			kind: 'procedural',
			majority: 'two_thirds',
			method: 'roll_call'
		});
	});

	it('answers each field that needs fixing and keeps what was typed', () => {
		const result = readVoteForm(
			formOf({ subject: ' ', kind: 'loud', majority: 'most', method: 'shout' })
		);

		expect(result.input).toBeNull();
		expect(result.values).toEqual({
			paperId: '',
			subject: '',
			kind: 'loud',
			majority: 'most',
			method: 'shout'
		});
		expect(result.errors).toEqual({
			subject: VOTE_FIELD_MESSAGES.subject,
			kind: VOTE_FIELD_MESSAGES.kind,
			majority: VOTE_FIELD_MESSAGES.majority,
			method: VOTE_FIELD_MESSAGES.method
		});
	});

	it('refuses a subject longer than 200 characters', () => {
		const result = readVoteForm(
			formOf({
				subject: 'x'.repeat(201),
				kind: 'substantive',
				majority: 'simple',
				method: 'show_of_hands'
			})
		);

		expect(result.input).toBeNull();
		expect(result.errors).toEqual({ subject: VOTE_FIELD_MESSAGES.subjectLength });
	});
});

describe('readVoteForm with a list of papers', () => {
	const SUBJECTS = [DRAFT_ONE, DRAFT_TWO];
	const SET_UP = { kind: 'substantive', majority: 'simple', method: 'show_of_hands' };

	it('names the vote after the paper picked, and ties it to the paper', () => {
		const result = readVoteForm(formOf({ paperId: 'paper-2', subject: '', ...SET_UP }), SUBJECTS);

		expect(result.errors).toEqual({});
		expect(result.input).toEqual({
			paperId: 'paper-2',
			subject: 'Draft resolution 1.2',
			kind: 'substantive',
			majority: 'simple',
			method: 'show_of_hands'
		});
	});

	it('reads the typed subject for Other, tied to no paper', () => {
		const result = readVoteForm(
			formOf({ paperId: OTHER_VOTE_SUBJECT, subject: 'Motion to divide the question', ...SET_UP }),
			SUBJECTS
		);

		expect(result.input).toEqual({ subject: 'Motion to divide the question', ...SET_UP });
		expect(result.input?.paperId).toBeUndefined();
	});

	it('asks for a subject for Other', () => {
		const result = readVoteForm(
			formOf({ paperId: OTHER_VOTE_SUBJECT, subject: '', ...SET_UP }),
			SUBJECTS
		);

		expect(result.errors).toEqual({ subject: VOTE_FIELD_MESSAGES.subject });
	});

	it('refuses a procedural vote on a paper', () => {
		const result = readVoteForm(
			formOf({ paperId: 'paper-1', subject: '', ...SET_UP, kind: 'procedural' }),
			SUBJECTS
		);

		expect(result.input).toBeNull();
		expect(result.errors).toEqual({ kind: VOTE_FIELD_MESSAGES.paperKind });
	});

	it('ties a vote on an amendment picked from the list to the amendment', () => {
		const amendment = {
			id: 'amendment-2',
			name: 'Amendment 2 to Draft resolution 1.1',
			title: 'Human control over autonomous weapons',
			isAmendment: true
		};
		const result = readVoteForm(formOf({ paperId: 'amendment-2', subject: '', ...SET_UP }), [
			amendment,
			...SUBJECTS
		]);

		expect(result.input).toEqual({
			amendmentId: 'amendment-2',
			subject: 'Amendment 2 to Draft resolution 1.1',
			...SET_UP
		});
	});

	it('refuses a paper the list no longer has', () => {
		const result = readVoteForm(formOf({ paperId: 'paper-9', subject: 'x', ...SET_UP }), SUBJECTS);

		expect(result.input).toBeNull();
		expect(result.errors).toEqual({ paperId: VOTE_FIELD_MESSAGES.paperId });
	});
});

describe('readVoteChoice', () => {
	it('knows the three answers and nothing else', () => {
		expect(readVoteChoice('for')).toBe('for');
		expect(readVoteChoice('abstain')).toBe('abstain');
		expect(readVoteChoice('maybe')).toBeNull();
		expect(readVoteChoice(null)).toBeNull();
	});
});

describe('readShowOfHands', () => {
	it('reads three whole numbers', () => {
		const counts = readShowOfHands(
			formOf({ votesFor: '9', votesAgainst: ' 3 ', votesAbstain: '0' })
		);

		expect(counts).toEqual({ for: 9, against: 3, abstain: 0 });
	});

	it('refuses a missing, negative or fractional count', () => {
		expect(readShowOfHands(formOf({ votesFor: '9', votesAgainst: '3' }))).toBeNull();
		expect(
			readShowOfHands(formOf({ votesFor: '-1', votesAgainst: '3', votesAbstain: '0' }))
		).toBeNull();
		expect(
			readShowOfHands(formOf({ votesFor: '1.5', votesAgainst: '3', votesAbstain: '0' }))
		).toBeNull();
	});
});

describe('castRefusal', () => {
	it('refuses a seat the roll call did not mark present', () => {
		expect(castRefusal(undefined, 'for')).toBe(VOTE_REFUSALS.seatNotPresent);
		expect(castRefusal('absent', 'against')).toBe(VOTE_REFUSALS.seatNotPresent);
	});

	it('lets a present seat abstain but not a present and voting one', () => {
		expect(castRefusal('present', 'abstain')).toBeNull();
		expect(castRefusal('present_and_voting', 'for')).toBeNull();
		expect(castRefusal('present_and_voting', 'abstain')).toBe(VOTE_REFUSALS.cannotAbstain);
	});
});

describe('countEntries and unvotedCount', () => {
	const entries = { 'seat-br': 'for', 'seat-fr': 'for', 'seat-gh': 'abstain' } as const;

	it('adds up the answers given', () => {
		expect(countEntries(entries)).toEqual({ for: 2, against: 0, abstain: 1 });
		expect(countEntries({})).toEqual({ for: 0, against: 0, abstain: 0 });
	});

	it('counts the present seats with no answer yet', () => {
		expect(unvotedCount(['seat-br', 'seat-fr', 'seat-gh', 'seat-in'], entries)).toBe(1);
	});
});

describe('presentAndVotingSeatIds', () => {
	it('picks the seats marked present and voting', () => {
		const attendance = {
			'seat-br': 'present',
			'seat-fr': 'present_and_voting',
			'seat-gh': 'absent'
		} as const;

		expect(presentAndVotingSeatIds(attendance)).toEqual(['seat-fr']);
	});
});

describe('closed vote wording', () => {
	it('reads empty counts as zero and writes the tally for, against, abstain', () => {
		const counts = closedVoteCounts(closedVote({ votesAbstain: null }));

		expect(counts).toEqual({ for: 9, against: 3, abstain: 0 });
		expect(formatTally(counts)).toBe('9–3–0');
	});

	it('adds every hand up, abstentions included', () => {
		expect(totalVotes({ for: 9, against: 3, abstain: 1 })).toBe(13);
	});
});

describe('hasOpenRollCallVote', () => {
	it('is true only for a roll call vote still open', () => {
		const open = { method: 'roll_call', status: 'open' } as const;

		expect(hasOpenRollCallVote({ vote: open })).toBe(true);
		expect(hasOpenRollCallVote({ vote: { ...open, status: 'closed' } })).toBe(false);
		expect(hasOpenRollCallVote({ vote: { ...open, method: 'show_of_hands' } })).toBe(false);
	});

	it('is false on a page with no vote, or with no Vote view at all', () => {
		expect(hasOpenRollCallVote({ vote: null })).toBe(false);
		expect(hasOpenRollCallVote(null)).toBe(false);
		expect(hasOpenRollCallVote(undefined)).toBe(false);
	});
});

describe('VOTE_REFUSALS', () => {
	it('asks for the answers by the words on the buttons', () => {
		expect(VOTE_REFUSALS.choice).toBe('Choose Yes, No or Abstain.');
	});
});
