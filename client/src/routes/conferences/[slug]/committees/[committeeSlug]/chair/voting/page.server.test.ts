import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the actions are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import type { ChairRoomFrame, CommitteeSession } from '$lib/chair-room';
import type { RoomSeat } from '$lib/committee-room';
import { chairRoomUrl, chairVotingSeatUrl, chairVotingUrl } from '$lib/urls';
import { VOTE_FIELD_MESSAGES, VOTE_REFUSALS, type OpenVote, type SessionVote } from '$lib/votes';

// The gate and every server module that reads or writes the room are stood in
// for, so these tests are about what the Vote view's actions decide
// (`$lib/server/vote-view.ts`, spread into this page's `actions`): which
// refusal each rule answers with, what it writes once a request passes,
// whether a vote passed and where the chair lands. The writes have their own
// tests in `$lib/server/votes.test.ts`, and the whole view runs against a real
// database in `tests/e2e/voting.spec.ts`. `$lib/votes` is pure and
// deliberately left real.
vi.mock('$lib/server/access', () => ({ requireCommitteePermission: vi.fn() }));

vi.mock('$lib/server/committee-room', () => ({
	getActiveSpeakersList: vi.fn(),
	getChairRoomFrame: vi.fn(),
	timerColumns: vi.fn(),
	updateCommitteeState: vi.fn()
}));

vi.mock('$lib/server/votes', () => ({
	cancelVote: vi.fn(),
	clearRollCallChoice: vi.fn(),
	closeVote: vi.fn(),
	endVoting: vi.fn(),
	getCurrentVote: vi.fn(),
	getVotes: vi.fn(),
	openVote: vi.fn(),
	recordRollCallChoice: vi.fn(),
	saveHandCount: vi.fn()
}));

vi.mock('$lib/server/speakers-lists', () => ({
	moveToNextSpeaker: vi.fn(),
	yieldToChair: vi.fn(),
	yieldToSeat: vi.fn()
}));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

// What the vote form lists (step 8 of the committee papers): no paper unless a test gives one.
vi.mock('$lib/server/paper-votes', () => ({ listVoteSubjects: vi.fn() }));

import { requireCommitteePermission } from '$lib/server/access';
import { getChairRoomFrame } from '$lib/server/committee-room';
import { setFlash } from '$lib/server/flash';
import { listVoteSubjects } from '$lib/server/paper-votes';
import {
	cancelVote,
	clearRollCallChoice,
	closeVote,
	endVoting,
	getCurrentVote,
	getVotes,
	openVote,
	recordRollCallChoice,
	saveHandCount
} from '$lib/server/votes';

const SUPABASE = {};
const CONFERENCE_SLUG = 'thimun-2027';
const COMMITTEE_SLUG = 'unsc';
const VOTING_URL = chairVotingUrl(CONFERENCE_SLUG, COMMITTEE_SLUG);
const ROOM_URL = chairRoomUrl(CONFERENCE_SLUG, COMMITTEE_SLUG);

const RUNNING_SESSION: CommitteeSession = {
	id: 'session-1',
	name: 'Session 2',
	status: 'in_progress',
	startedAt: '2026-01-01T09:00:00.000Z',
	endedAt: null
};

const BRAZIL: RoomSeat = { id: 'seat-br', name: 'Brazil', countryCode: 'BR' };
const FRANCE: RoomSeat = { id: 'seat-fr', name: 'France', countryCode: 'FR' };
const GHANA: RoomSeat = { id: 'seat-gh', name: 'Ghana', countryCode: 'GH' };
const INDIA: RoomSeat = { id: 'seat-in', name: 'India', countryCode: 'IN' };

/** The room's vote, open and by roll call unless `overrides` says otherwise. */
function voteOf(overrides: Partial<OpenVote> = {}): OpenVote {
	return {
		id: 'vote-1',
		subject: 'Draft Resolution 1.1',
		kind: 'substantive',
		method: 'roll_call',
		majority: 'simple',
		status: 'open',
		votesFor: null,
		votesAgainst: null,
		votesAbstain: null,
		passed: null,
		openedAt: '2026-01-01T10:00:00.000Z',
		closedAt: null,
		entries: {},
		...overrides
	};
}

/** A closed vote of the session. */
const CLOSED_VOTE: SessionVote = {
	...voteOf({ id: 'vote-0', method: 'show_of_hands' }),
	status: 'closed',
	votesFor: 2,
	votesAgainst: 1,
	votesAbstain: 0,
	passed: true,
	closedAt: '2026-01-01T09:30:00.000Z'
};

/**
 * A room in formal debate with a running session. Brazil is present, France
 * present and voting, Ghana absent and India unmarked, so two are present.
 */
function makeFrame(overrides: Partial<ChairRoomFrame> = {}): ChairRoomFrame {
	return {
		committeeState: {
			currentSessionId: RUNNING_SESSION.id,
			mode: 'formal_debate',
			currentMotionId: null,
			activeSpeakersListId: 'list-gsl',
			currentSpeakerEntryId: null,
			currentVoteId: null,
			agendaTopic: null,
			timer: { totalSeconds: null, endsAt: null, pausedRemainingSeconds: null }
		},
		sessions: [RUNNING_SESSION],
		currentSession: RUNNING_SESSION,
		currentMotion: null,
		seats: [BRAZIL, FRANCE, GHANA, INDIA],
		attendance: { 'seat-br': 'present', 'seat-fr': 'present_and_voting', 'seat-gh': 'absent' },
		latestRollCallId: 'roll-call-1',
		...overrides
	};
}

/** The room in voting on vote-1. */
function votingFrame(): ChairRoomFrame {
	const frame = makeFrame();

	return {
		...frame,
		committeeState: { ...frame.committeeState, mode: 'voting', currentVoteId: 'vote-1' }
	};
}

/** A post to one of the page's actions, carrying `fields` as its form. */
function makeActionEvent(fields: Record<string, string> = {}): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	return {
		params: { slug: CONFERENCE_SLUG, committeeSlug: COMMITTEE_SLUG },
		url: new URL('http://localhost/chair/voting'),
		locals: { supabase: SUPABASE },
		cookies: {},
		request: { formData: async () => formData }
	} as unknown as RequestEvent;
}

/** The page `load`'s event, whose `parent()` answers what the chair layout returned. */
function makeLoadEvent(frame: ChairRoomFrame, search = ''): PageServerLoadEvent {
	return {
		url: new URL(`http://localhost/chair/voting${search}`),
		locals: { supabase: SUPABASE },
		depends: vi.fn(),
		parent: async () => ({ committee: { id: 'committee-1' }, ...frame })
	} as unknown as PageServerLoadEvent;
}

/** Run something expected to redirect, and give back where it was going. */
async function catchRedirect(run: () => unknown): Promise<{ status: number; location: string }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number; location: string };
	}

	throw new Error('Nothing was thrown, so nothing redirected.');
}

/** What `fail(400, ...)` gives back: a value the action returns, not throws. */
type FailResult = {
	status: number;
	data: { flash: { message: string } | null; errors?: object; values?: object };
};

/** Run an action expected to refuse, and give back its sentence. */
async function refusalOf(run: () => unknown): Promise<string | undefined> {
	const result = (await run()) as FailResult;

	expect(result.status).toBe(400);

	return result.data.flash?.message;
}

/** Put the room in voting on `vote`, as the database would read it. */
function withVote(vote: OpenVote) {
	vi.mocked(getChairRoomFrame).mockResolvedValue(votingFrame());
	vi.mocked(getCurrentVote).mockResolvedValue(vote);
}

const OPEN_FIELDS = {
	subject: 'Draft Resolution 1.1',
	kind: 'substantive',
	majority: 'simple',
	method: 'roll_call'
};

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(requireCommitteePermission).mockResolvedValue({
		user: { id: 'user-1', email: 'amira@example.com' },
		conference: {} as Awaited<ReturnType<typeof requireCommitteePermission>>['conference'],
		committee: {
			id: 'committee-1',
			slug: COMMITTEE_SLUG,
			name: 'Security Council',
			abbreviation: 'UNSC',
			room: null,
			defaultSpeakingTimeSeconds: 60,
			topics: ['Climate finance']
		}
	});
	vi.mocked(getChairRoomFrame).mockResolvedValue(makeFrame());
	vi.mocked(getVotes).mockResolvedValue({ currentVote: null, closedVotes: [] });
	vi.mocked(getCurrentVote).mockResolvedValue(null);
	vi.mocked(openVote).mockResolvedValue(null);
	vi.mocked(listVoteSubjects).mockResolvedValue([]);
	vi.mocked(closeVote).mockResolvedValue(true);
	vi.mocked(cancelVote).mockResolvedValue(true);
	vi.mocked(saveHandCount).mockResolvedValue(true);
});

describe('load', () => {
	it('returns the Vote view’s data as `voteView`, read from the room and the address', async () => {
		vi.mocked(getVotes).mockResolvedValue({ currentVote: voteOf(), closedVotes: [CLOSED_VOTE] });

		const data = await load(makeLoadEvent(votingFrame(), '?seat=seat-br&vote=new&cancel=confirm'));

		expect(getVotes).toHaveBeenCalledWith(SUPABASE, 'session-1', 'vote-1');
		expect(listVoteSubjects).toHaveBeenCalledWith(SUPABASE, 'committee-1', 'session-1');
		expect(data).toEqual({
			voteView: {
				vote: voteOf(),
				closedVotes: [CLOSED_VOTE],
				isNewVoteShown: true,
				isCancelConfirming: true,
				focusedSeatId: 'seat-br',
				subjects: []
			}
		});
	});

	it('has no Vote view without a session', async () => {
		const frame = makeFrame({ currentSession: null, latestRollCallId: null, attendance: {} });

		const data = await load(makeLoadEvent(frame));

		expect(getVotes).not.toHaveBeenCalled();
		expect(data).toEqual({ voteView: null });
	});
});

describe('openVote', () => {
	it('opens a valid vote of the chosen kind and goes back to the page', async () => {
		const redirect = await catchRedirect(() => actions.openVote(makeActionEvent(OPEN_FIELDS)));

		expect(openVote).toHaveBeenCalledWith(
			SUPABASE,
			'committee-1',
			'session-1',
			{
				subject: 'Draft Resolution 1.1',
				kind: 'substantive',
				majority: 'simple',
				method: 'roll_call'
			},
			expect.any(Date),
			null
		);
		expect(redirect).toMatchObject({ status: 303, location: VOTING_URL });
	});

	it('ties a vote on a paper picked from the list to the paper, named after it', async () => {
		const draft = { id: 'paper-1', name: 'Draft resolution 1.1', title: 'Human control' };
		vi.mocked(listVoteSubjects).mockResolvedValue([draft]);
		const fields = { ...OPEN_FIELDS, subject: '', paperId: 'paper-1' };

		await catchRedirect(() => actions.openVote(makeActionEvent(fields)));

		expect(listVoteSubjects).toHaveBeenCalledWith(SUPABASE, 'committee-1', 'session-1');
		expect(vi.mocked(openVote).mock.calls[0][3]).toEqual({
			paperId: 'paper-1',
			subject: 'Draft resolution 1.1',
			kind: 'substantive',
			majority: 'simple',
			method: 'roll_call'
		});
	});

	it('refuses with the database’s sentence when it will not open a vote on the paper', async () => {
		const draft = { id: 'paper-1', name: 'Draft resolution 1.1', title: 'Human control' };
		vi.mocked(listVoteSubjects).mockResolvedValue([draft]);
		vi.mocked(openVote).mockResolvedValue('Close the open vote on this draft first.');
		const fields = { ...OPEN_FIELDS, subject: '', paperId: 'paper-1' };

		expect(await refusalOf(() => actions.openVote(makeActionEvent(fields)))).toBe(
			'Close the open vote on this draft first.'
		);
	});

	it('saves it under the id the browser chose (T141)', async () => {
		const fields = { ...OPEN_FIELDS, newRowId: '5b2f8c1e-9d3a-4e7b-8c6f-1a2b3c4d5e6f' };

		await catchRedirect(() => actions.openVote(makeActionEvent(fields)));

		expect(vi.mocked(openVote).mock.calls[0][5]).toBe('5b2f8c1e-9d3a-4e7b-8c6f-1a2b3c4d5e6f');
	});

	it('replaces a closed vote still on show', async () => {
		withVote(voteOf({ status: 'closed', passed: true }));

		await catchRedirect(() => actions.openVote(makeActionEvent(OPEN_FIELDS)));

		expect(openVote).toHaveBeenCalled();
	});

	it('refuses without a session, without a roll call, while suspended and while a vote is open', async () => {
		vi.mocked(getChairRoomFrame).mockResolvedValueOnce(makeFrame({ currentSession: null }));
		expect(await refusalOf(() => actions.openVote(makeActionEvent(OPEN_FIELDS)))).toBe(
			VOTE_REFUSALS.noSession
		);

		vi.mocked(getChairRoomFrame).mockResolvedValueOnce(makeFrame({ latestRollCallId: null }));
		expect(await refusalOf(() => actions.openVote(makeActionEvent(OPEN_FIELDS)))).toBe(
			VOTE_REFUSALS.noRollCall
		);

		const suspended = makeFrame();
		suspended.committeeState = { ...suspended.committeeState, mode: 'suspended' };
		vi.mocked(getChairRoomFrame).mockResolvedValueOnce(suspended);
		expect(await refusalOf(() => actions.openVote(makeActionEvent(OPEN_FIELDS)))).toBe(
			VOTE_REFUSALS.suspended
		);

		withVote(voteOf());
		expect(await refusalOf(() => actions.openVote(makeActionEvent(OPEN_FIELDS)))).toBe(
			VOTE_REFUSALS.voteOpen
		);

		expect(openVote).not.toHaveBeenCalled();
	});

	it('keeps what was typed and answers each field', async () => {
		const fields = { subject: '', kind: 'loud', majority: 'simple', method: 'roll_call' };

		const result = (await actions.openVote(makeActionEvent(fields))) as FailResult;

		expect(result.status).toBe(400);
		expect(result.data.values).toEqual({ ...fields, paperId: '' });
		expect(result.data.errors).toEqual({
			subject: VOTE_FIELD_MESSAGES.subject,
			kind: VOTE_FIELD_MESSAGES.kind
		});
		expect(result.data.flash).toBeNull();
		expect(openVote).not.toHaveBeenCalled();
	});
});

describe('countVote', () => {
	const COUNT = { voteId: 'vote-1', votesFor: '1', votesAgainst: '0', votesAbstain: '1' };

	it('saves a show of hands as it is counted, for the projector', async () => {
		withVote(voteOf({ method: 'show_of_hands' }));

		const redirect = await catchRedirect(() => actions.countVote(makeActionEvent(COUNT)));

		expect(saveHandCount).toHaveBeenCalledWith(SUPABASE, 'vote-1', {
			for: 1,
			against: 0,
			abstain: 1
		});
		expect(redirect).toMatchObject({ status: 303, location: VOTING_URL });
	});

	it('refuses counts that are not whole numbers, and more hands than delegates present', async () => {
		withVote(voteOf({ method: 'show_of_hands' }));

		expect(
			await refusalOf(() => actions.countVote(makeActionEvent({ ...COUNT, votesFor: 'x' })))
		).toBe(VOTE_REFUSALS.voteCounts);
		expect(
			await refusalOf(() => actions.countVote(makeActionEvent({ ...COUNT, votesFor: '2' })))
		).toBe(VOTE_REFUSALS.tooManyVotes);
		expect(saveHandCount).not.toHaveBeenCalled();
	});

	it('refuses a vote no longer open, and a roll call vote', async () => {
		withVote(voteOf({ method: 'show_of_hands', status: 'closed' }));
		expect(await refusalOf(() => actions.countVote(makeActionEvent(COUNT)))).toBe(
			VOTE_REFUSALS.notOpen
		);

		withVote(voteOf());
		expect(await refusalOf(() => actions.countVote(makeActionEvent(COUNT)))).toBe(
			VOTE_REFUSALS.notShowOfHands
		);

		withVote(voteOf({ method: 'show_of_hands' }));
		vi.mocked(saveHandCount).mockResolvedValueOnce(false);
		expect(await refusalOf(() => actions.countVote(makeActionEvent(COUNT)))).toBe(
			VOTE_REFUSALS.notOpen
		);
	});
});

describe('castRollCall', () => {
	/** A seat's answer to vote-1. */
	function castEvent(seatId: string, choice: string, voteId = 'vote-1') {
		return makeActionEvent({ voteId, seatId, choice });
	}

	it("records a present seat's answer and puts the focus back on its row", async () => {
		withVote(voteOf());

		const redirect = await catchRedirect(() =>
			actions.castRollCall(castEvent('seat-br', 'abstain'))
		);

		expect(recordRollCallChoice).toHaveBeenCalledWith(SUPABASE, 'vote-1', 'seat-br', 'abstain');
		expect(redirect).toMatchObject({
			status: 303,
			location: chairVotingSeatUrl(CONFERENCE_SLUG, COMMITTEE_SLUG, 'seat-br')
		});
	});

	it('refuses an absent or unmarked seat, and a present and voting seat abstaining', async () => {
		withVote(voteOf());

		expect(await refusalOf(() => actions.castRollCall(castEvent('seat-gh', 'for')))).toBe(
			VOTE_REFUSALS.seatNotPresent
		);
		expect(await refusalOf(() => actions.castRollCall(castEvent('seat-in', 'for')))).toBe(
			VOTE_REFUSALS.seatNotPresent
		);
		expect(await refusalOf(() => actions.castRollCall(castEvent('seat-fr', 'abstain')))).toBe(
			VOTE_REFUSALS.cannotAbstain
		);
		expect(recordRollCallChoice).not.toHaveBeenCalled();
	});

	it('refuses another vote, a closed vote, a show of hands and an unknown answer', async () => {
		withVote(voteOf());
		expect(await refusalOf(() => actions.castRollCall(castEvent('seat-br', 'for', 'vote-9')))).toBe(
			VOTE_REFUSALS.notOpen
		);
		expect(await refusalOf(() => actions.castRollCall(castEvent('seat-br', 'maybe')))).toBe(
			'Choose Yes, No or Abstain.'
		);

		withVote(voteOf({ status: 'closed' }));
		expect(await refusalOf(() => actions.castRollCall(castEvent('seat-br', 'for')))).toBe(
			VOTE_REFUSALS.notOpen
		);

		withVote(voteOf({ method: 'show_of_hands' }));
		expect(await refusalOf(() => actions.castRollCall(castEvent('seat-br', 'for')))).toBe(
			VOTE_REFUSALS.notRollCall
		);

		vi.mocked(getChairRoomFrame).mockResolvedValueOnce(makeFrame({ currentSession: null }));
		expect(await refusalOf(() => actions.castRollCall(castEvent('seat-br', 'for')))).toBe(
			VOTE_REFUSALS.noSession
		);

		expect(recordRollCallChoice).not.toHaveBeenCalled();
	});
});

describe('clearRollCall', () => {
	it("takes a seat's answer off the open vote", async () => {
		withVote(voteOf({ entries: { 'seat-br': 'for' } }));

		const redirect = await catchRedirect(() =>
			actions.clearRollCall(makeActionEvent({ voteId: 'vote-1', seatId: 'seat-br' }))
		);

		expect(clearRollCallChoice).toHaveBeenCalledWith(SUPABASE, 'vote-1', 'seat-br');
		expect(redirect).toMatchObject({
			status: 303,
			location: chairVotingSeatUrl(CONFERENCE_SLUG, COMMITTEE_SLUG, 'seat-br')
		});
	});

	it('refuses when the vote is no longer open', async () => {
		const event = makeActionEvent({ voteId: 'vote-1', seatId: 'seat-br' });

		expect(await refusalOf(() => actions.clearRollCall(event))).toBe(VOTE_REFUSALS.notOpen);
		expect(clearRollCallChoice).not.toHaveBeenCalled();
	});
});

describe('closeVote', () => {
	it('counts a roll call from its answers, records it as passed and stays on the view, with no toast', async () => {
		withVote(voteOf({ entries: { 'seat-br': 'for', 'seat-fr': 'for' } }));

		const redirect = await catchRedirect(() =>
			actions.closeVote(makeActionEvent({ voteId: 'vote-1' }))
		);

		const counts = { for: 2, against: 0, abstain: 0 };
		expect(closeVote).toHaveBeenCalledWith(SUPABASE, 'vote-1', counts, true, expect.any(Date));
		expect(endVoting).not.toHaveBeenCalled();
		expect(setFlash).not.toHaveBeenCalled();
		expect(redirect).toMatchObject({ status: 303, location: VOTING_URL });
	});

	it('fails a tie under a simple majority', async () => {
		withVote(voteOf({ entries: { 'seat-br': 'for', 'seat-fr': 'against' } }));

		await catchRedirect(() => actions.closeVote(makeActionEvent({ voteId: 'vote-1' })));

		expect(vi.mocked(closeVote).mock.calls[0][3]).toBe(false);
	});

	it('takes a show of hands as typed, measured against a two-thirds majority', async () => {
		withVote(voteOf({ method: 'show_of_hands', majority: 'two_thirds' }));
		const fields = { voteId: 'vote-1', votesFor: '1', votesAgainst: '1', votesAbstain: '0' };

		await catchRedirect(() => actions.closeVote(makeActionEvent(fields)));

		expect(vi.mocked(closeVote).mock.calls[0][2]).toEqual({ for: 1, against: 1, abstain: 0 });
		expect(vi.mocked(closeVote).mock.calls[0][3]).toBe(false);
	});

	it('refuses more hands than present, counts that are not whole numbers, and nothing counted', async () => {
		withVote(voteOf({ method: 'show_of_hands' }));
		const fields = { voteId: 'vote-1', votesFor: '2', votesAgainst: '1', votesAbstain: '0' };

		expect(await refusalOf(() => actions.closeVote(makeActionEvent(fields)))).toBe(
			VOTE_REFUSALS.tooManyVotes
		);
		expect(
			await refusalOf(() => actions.closeVote(makeActionEvent({ ...fields, votesFor: 'two' })))
		).toBe(VOTE_REFUSALS.voteCounts);
		expect(
			await refusalOf(() =>
				actions.closeVote(makeActionEvent({ ...fields, votesFor: '0', votesAgainst: '0' }))
			)
		).toBe('Count the votes before closing.');
		expect(closeVote).not.toHaveBeenCalled();
	});

	it('refuses a roll call vote nobody has answered', async () => {
		withVote(voteOf());

		expect(await refusalOf(() => actions.closeVote(makeActionEvent({ voteId: 'vote-1' })))).toBe(
			VOTE_REFUSALS.notCounted
		);
	});

	it('refuses when another screen closed the vote first', async () => {
		withVote(voteOf({ entries: { 'seat-br': 'for' } }));
		vi.mocked(closeVote).mockResolvedValueOnce(false);

		expect(await refusalOf(() => actions.closeVote(makeActionEvent({ voteId: 'vote-1' })))).toBe(
			VOTE_REFUSALS.notOpen
		);
	});
});

describe('cancelVote', () => {
	it('removes the open vote and takes the chair to the live room', async () => {
		withVote(voteOf());

		const redirect = await catchRedirect(() =>
			actions.cancelVote(makeActionEvent({ voteId: 'vote-1' }))
		);

		expect(cancelVote).toHaveBeenCalledWith(SUPABASE, 'committee-1', 'vote-1');
		expect(redirect).toMatchObject({ status: 303, location: ROOM_URL });
	});

	it('refuses when there is no open vote, or it has already gone', async () => {
		expect(await refusalOf(() => actions.cancelVote(makeActionEvent({ voteId: 'vote-1' })))).toBe(
			VOTE_REFUSALS.notOpen
		);

		withVote(voteOf());
		vi.mocked(cancelVote).mockResolvedValueOnce(false);
		expect(await refusalOf(() => actions.cancelVote(makeActionEvent({ voteId: 'vote-1' })))).toBe(
			VOTE_REFUSALS.notOpen
		);
	});
});

describe('endVoting', () => {
	it('returns the room to the General Speakers’ List and takes the chair to the live room', async () => {
		withVote(voteOf({ status: 'closed', passed: true }));

		const redirect = await catchRedirect(() => actions.endVoting(makeActionEvent()));

		expect(endVoting).toHaveBeenCalledWith(SUPABASE, 'committee-1');
		expect(redirect).toMatchObject({ status: 303, location: ROOM_URL });
	});

	it('ends voting after "Close debate", with no vote opened', async () => {
		const frame = makeFrame();
		frame.committeeState = { ...frame.committeeState, mode: 'voting' };
		vi.mocked(getChairRoomFrame).mockResolvedValue(frame);

		await catchRedirect(() => actions.endVoting(makeActionEvent()));

		expect(endVoting).toHaveBeenCalled();
	});

	it('refuses while the vote is open, and while the room is not voting', async () => {
		withVote(voteOf());
		expect(await refusalOf(() => actions.endVoting(makeActionEvent()))).toBe(
			'Close or cancel the open vote first.'
		);

		vi.mocked(getChairRoomFrame).mockResolvedValue(makeFrame());
		vi.mocked(getCurrentVote).mockResolvedValue(null);
		expect(await refusalOf(() => actions.endVoting(makeActionEvent()))).toBe(
			'The room is not voting.'
		);
		expect(endVoting).not.toHaveBeenCalled();
	});
});
