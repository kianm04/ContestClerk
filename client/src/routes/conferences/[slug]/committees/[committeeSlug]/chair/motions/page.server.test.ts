import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the actions are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import type { ChairRoomFrame, CommitteeSession } from '$lib/chair-room';
import type { RoomSeat } from '$lib/committee-room';
import { MOTION_FIELD_MESSAGES, MOTION_REFUSALS, type SessionMotion } from '$lib/motions';
import { chairMotionsRestoreAction, chairMotionsUrl, chairRoomUrl } from '$lib/urls';

// The gate and every server module that reads or writes the room are stood in
// for, so these tests are about what the view decides: which refusal each rule
// answers with, in what order, what it writes once a request passes and where
// the chair lands. The writes have their own tests in
// `$lib/server/motions.test.ts` and `tests/db/room-press-functions.test.ts`,
// and the whole view runs against a real database in
// `tests/e2e/motions.spec.ts`. `$lib/motions` is pure and deliberately left real.
vi.mock('$lib/server/access', () => ({ requireCommitteePermission: vi.fn() }));

vi.mock('$lib/server/committee-room', () => ({
	getActiveSpeakersList: vi.fn(),
	getChairRoomFrame: vi.fn(),
	timerColumns: vi.fn(),
	updateCommitteeState: vi.fn()
}));

vi.mock('$lib/server/motions', () => ({
	decideMotion: vi.fn(),
	dropMotions: vi.fn(),
	listMotions: vi.fn(),
	proposeMotion: vi.fn(),
	restoreMotions: vi.fn()
}));

vi.mock('$lib/server/motion-effects', () => ({ applyPassedMotion: vi.fn() }));

vi.mock('$lib/server/papers-on-floor', () => ({ listApprovedPapers: vi.fn() }));

vi.mock('$lib/server/speakers-lists', () => ({
	moveToNextSpeaker: vi.fn(),
	yieldToChair: vi.fn(),
	yieldToSeat: vi.fn()
}));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

import { requireCommitteePermission } from '$lib/server/access';
import { getChairRoomFrame } from '$lib/server/committee-room';
import { setFlash } from '$lib/server/flash';
import { applyPassedMotion } from '$lib/server/motion-effects';
import {
	decideMotion,
	dropMotions,
	listMotions,
	proposeMotion,
	restoreMotions
} from '$lib/server/motions';
import { listApprovedPapers } from '$lib/server/papers-on-floor';

/** An approved paper waiting to be introduced. */
const APPROVED_PAPER = { id: 'paper-1', name: 'Working paper 1.1', title: 'Autonomous weapons' };

const SUPABASE = {};
const CONFERENCE_SLUG = 'thimun-2027';
const COMMITTEE_SLUG = 'unsc';
const MOTIONS_URL = chairMotionsUrl(CONFERENCE_SLUG, COMMITTEE_SLUG);
const ROOM_URL = chairRoomUrl(CONFERENCE_SLUG, COMMITTEE_SLUG);

const RUNNING_SESSION: CommitteeSession = {
	id: 'session-1',
	name: 'Session 2',
	status: 'in_progress',
	startedAt: '2026-01-01T09:00:00.000Z',
	endedAt: null
};

const ENDED_SESSION: CommitteeSession = {
	id: 'session-0',
	name: 'Session 1',
	status: 'ended',
	startedAt: '2025-12-31T09:00:00.000Z',
	endedAt: '2025-12-31T12:00:00.000Z'
};

const BRAZIL: RoomSeat = { id: 'seat-br', name: 'Brazil', countryCode: 'BR' };
const FRANCE: RoomSeat = { id: 'seat-fr', name: 'France', countryCode: 'FR' };
const GHANA: RoomSeat = { id: 'seat-gh', name: 'Ghana', countryCode: 'GH' };

/** A motion of the running session, on the floor unless `overrides` says otherwise. */
function motion(overrides: Partial<SessionMotion> = {}): SessionMotion {
	return {
		id: 'motion-1',
		kind: 'unmoderated_caucus',
		status: 'proposed',
		topic: null,
		totalTimeSeconds: 600,
		speakingTimeSeconds: null,
		proposedBy: BRAZIL,
		votesFor: null,
		votesAgainst: null,
		decidedAt: null,
		createdAt: '2026-01-01T09:10:00.000Z',
		startedWithoutVote: false,
		...overrides
	};
}

/** A room in formal debate with a running session. Ghana is marked absent, so two are present. */
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
		sessions: [RUNNING_SESSION, ENDED_SESSION],
		currentSession: RUNNING_SESSION,
		currentMotion: null,
		seats: [BRAZIL, FRANCE, GHANA],
		attendance: { 'seat-br': 'present', 'seat-fr': 'present', 'seat-gh': 'absent' },
		latestRollCallId: 'roll-call-1',
		...overrides
	};
}

/** A post to one of the view's actions, carrying `fields` as its form; `motionId` may repeat. */
function makeActionEvent(fields: Record<string, string | string[]> = {}): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		for (const each of Array.isArray(value) ? value : [value]) formData.append(name, each);
	}

	return {
		params: { slug: CONFERENCE_SLUG, committeeSlug: COMMITTEE_SLUG },
		url: new URL('http://localhost/chair/motions'),
		locals: { supabase: SUPABASE },
		cookies: {},
		request: { formData: async () => formData }
	} as unknown as RequestEvent;
}

/** The view `load`'s event, whose `parent()` answers what the chair layout returned. */
function makeLoadEvent(search: string, frame: ChairRoomFrame = makeFrame()): PageServerLoadEvent {
	return {
		url: new URL(`http://localhost/chair/motions${search}`),
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

/** Pass or Fail on motion-1, with the counts typed (empty for none). */
function voteEvent(result: string, votesFor = '', votesAgainst = '') {
	return makeActionEvent({ motionId: 'motion-1', result, votesFor, votesAgainst });
}

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
	vi.mocked(listMotions).mockResolvedValue([motion()]);
	vi.mocked(decideMotion).mockResolvedValue(true);
	vi.mocked(applyPassedMotion).mockResolvedValue({ droppedMotionIds: [] });
	vi.mocked(dropMotions).mockResolvedValue([]);
	vi.mocked(restoreMotions).mockResolvedValue(1);
	vi.mocked(listApprovedPapers).mockResolvedValue([APPROVED_PAPER]);
});

describe('load', () => {
	it('reads the running session’s motions and counts the majority of those present', async () => {
		const data = await load(makeLoadEvent('?motion=motion-1'));

		expect(listMotions).toHaveBeenCalledWith(SUPABASE, 'session-1');
		expect(data).toMatchObject({
			shownSession: RUNNING_SESSION,
			isReadOnly: false,
			motions: [motion()],
			earlierSessions: [],
			presentCount: 2,
			majority: 2,
			hasRollCall: true,
			requestedMotionId: 'motion-1',
			approvedPapers: [APPROVED_PAPER]
		});
	});

	it('counts every seat as present before the session’s first roll call', async () => {
		const frame = makeFrame({ attendance: {}, latestRollCallId: null });
		const data = await load(makeLoadEvent('', frame));

		expect(data).toMatchObject({ presentCount: 3, majority: 2, hasRollCall: false });
	});

	it('draws an ended session as the record, with the earlier sessions, and nothing without a session', async () => {
		const record = await load(makeLoadEvent('?session=session-0'));
		const empty = await load(makeLoadEvent('', makeFrame({ currentSession: null })));

		expect(record).toMatchObject({
			shownSession: ENDED_SESSION,
			isReadOnly: true,
			earlierSessions: [ENDED_SESSION]
		});
		expect(empty?.shownSession).toBeNull();
		expect(empty?.motions).toEqual([]);
		expect(record?.approvedPapers).toEqual([]);
	});
});

describe('propose', () => {
	const CAUCUS_FIELDS = {
		kind: 'moderated_caucus',
		proposedBySeatId: 'seat-br',
		topic: 'Climate finance',
		totalTime: '',
		speakingTime: ''
	};

	it('puts a valid motion on the floor with the defaults for empty times', async () => {
		const redirect = await catchRedirect(() => actions.propose(makeActionEvent(CAUCUS_FIELDS)));

		expect(proposeMotion).toHaveBeenCalledWith(
			SUPABASE,
			'committee-1',
			'session-1',
			{
				kind: 'moderated_caucus',
				proposedBySeatId: 'seat-br',
				topic: 'Climate finance',
				totalTimeSeconds: 600,
				speakingTimeSeconds: 60,
				paperId: null
			},
			null
		);
		expect(redirect).toMatchObject({ status: 303, location: MOTIONS_URL });
	});

	it('introduces the approved paper picked, named the way the chair says it', async () => {
		const document = {
			kind: 'introduce_document',
			proposedBySeatId: 'seat-br',
			paperId: 'paper-1'
		};

		await catchRedirect(() => actions.propose(makeActionEvent(document)));

		expect(proposeMotion).toHaveBeenCalledWith(
			SUPABASE,
			'committee-1',
			'session-1',
			expect.objectContaining({ topic: 'Working paper 1.1', paperId: 'paper-1' }),
			null
		);
	});

	it('refuses with the field messages and keeps what was typed', async () => {
		const result = (await actions.propose(
			makeActionEvent({ ...CAUCUS_FIELDS, topic: '', proposedBySeatId: 'seat-gh' })
		)) as FailResult;

		expect(result.status).toBe(400);
		expect(result.data.errors).toEqual({
			proposedBySeatId: MOTION_FIELD_MESSAGES.proposer,
			topic: MOTION_FIELD_MESSAGES.caucusTopic
		});
		expect(result.data.values).toMatchObject({ kind: 'moderated_caucus', topic: '' });
		expect(proposeMotion).not.toHaveBeenCalled();
	});

	it('refuses without a session, and an extension with no caucus to extend', async () => {
		vi.mocked(getChairRoomFrame).mockResolvedValueOnce(makeFrame({ currentSession: null }));
		const extension = { kind: 'extend_caucus', proposedBySeatId: 'chair' };

		expect(await refusalOf(() => actions.propose(makeActionEvent(CAUCUS_FIELDS)))).toBe(
			MOTION_REFUSALS.noSession
		);
		expect(await refusalOf(() => actions.propose(makeActionEvent(extension)))).toBe(
			MOTION_REFUSALS.noCaucus
		);
	});
});

describe('vote', () => {
	it('fails a motion with its counts, or without, and stays on Motions', async () => {
		const counted = await catchRedirect(() => actions.vote(voteEvent('failed', '0', '2')));

		expect(decideMotion).toHaveBeenCalledWith(
			SUPABASE,
			'motion-1',
			{ status: 'failed', votesFor: 0, votesAgainst: 2 },
			expect.any(Date)
		);
		expect(counted).toMatchObject({ status: 303, location: MOTIONS_URL });

		await catchRedirect(() => actions.vote(voteEvent('failed')));

		expect(decideMotion).toHaveBeenLastCalledWith(
			SUPABASE,
			'motion-1',
			{ status: 'failed', votesFor: null, votesAgainst: null },
			expect.any(Date)
		);
	});

	it('passes a caucus without counting and takes the chair to the live room', async () => {
		const redirect = await catchRedirect(() => actions.vote(voteEvent('passed')));

		expect(applyPassedMotion).toHaveBeenCalledWith(
			SUPABASE,
			'committee-1',
			expect.anything(),
			'session-1',
			motion(),
			expect.any(Date),
			{ votesFor: null, votesAgainst: null }
		);
		expect(redirect).toMatchObject({ status: 303, location: ROOM_URL });
		expect(setFlash).not.toHaveBeenCalled();
	});

	it('stays on Motions after passing a motion that leaves the room as it is', async () => {
		vi.mocked(listMotions).mockResolvedValue([motion({ kind: 'other', topic: 'Photo' })]);

		const redirect = await catchRedirect(() => actions.vote(voteEvent('passed', '2', '0')));

		expect(redirect).toMatchObject({ location: MOTIONS_URL });
	});

	it('says how many other motions were dropped, with Undo', async () => {
		vi.mocked(applyPassedMotion).mockResolvedValue({ droppedMotionIds: ['motion-2', 'motion-3'] });

		await catchRedirect(() => actions.vote(voteEvent('passed')));

		expect(setFlash).toHaveBeenCalledWith(
			{},
			{
				tone: 'info',
				message: '2 other motions dropped',
				undo: {
					label: 'Undo',
					action: chairMotionsRestoreAction(CONFERENCE_SLUG, COMMITTEE_SLUG),
					motionIds: ['motion-2', 'motion-3']
				}
			}
		);
	});

	it('refuses in the order the view’s rules give', async () => {
		vi.mocked(getChairRoomFrame).mockResolvedValueOnce(makeFrame({ currentSession: null }));
		expect(await refusalOf(() => actions.vote(voteEvent('passed', 'x')))).toBe(
			MOTION_REFUSALS.noSession
		);

		expect(await refusalOf(() => actions.vote(voteEvent('passed', '1.5')))).toBe(
			MOTION_REFUSALS.voteCounts
		);
		expect(await refusalOf(() => actions.vote(voteEvent('passed', '2', '1')))).toBe(
			MOTION_REFUSALS.tooManyVotes
		);
		expect(await refusalOf(() => actions.vote(voteEvent('passed', '1', '1')))).toBe(
			MOTION_REFUSALS.countSaysFails
		);
		expect(await refusalOf(() => actions.vote(voteEvent('failed', '2', '0')))).toBe(
			MOTION_REFUSALS.countSaysPasses
		);

		vi.mocked(listMotions).mockResolvedValue([motion({ status: 'failed' })]);
		expect(await refusalOf(() => actions.vote(voteEvent('passed')))).toBe(
			MOTION_REFUSALS.notOnFloor
		);
	});

	it('decides before the first roll call, counting every seat as present', async () => {
		vi.mocked(getChairRoomFrame).mockResolvedValue(
			makeFrame({ attendance: {}, latestRollCallId: null })
		);

		// Three seats, so two for pass, and three hands in all are allowed.
		const redirect = await catchRedirect(() => actions.vote(voteEvent('passed', '2', '1')));

		expect(redirect.status).toBe(303);
		expect(applyPassedMotion).toHaveBeenCalled();
	});

	it('passes on the refusal the database answers with, such as an open vote', async () => {
		vi.mocked(applyPassedMotion).mockResolvedValue({ refusal: 'Close the open vote first.' });

		expect(await refusalOf(() => actions.vote(voteEvent('passed')))).toBe(
			'Close the open vote first.'
		);
	});

	it('refuses a press that sent no decision', async () => {
		expect(await refusalOf(() => actions.vote(makeActionEvent({ motionId: 'motion-1' })))).toBe(
			MOTION_REFUSALS.noResult
		);
	});
});

describe('withdraw', () => {
	it('withdraws a motion on the floor, with no tally', async () => {
		const redirect = await catchRedirect(() =>
			actions.withdraw(makeActionEvent({ motionId: 'motion-1' }))
		);

		expect(decideMotion).toHaveBeenCalledWith(
			SUPABASE,
			'motion-1',
			{ status: 'withdrawn', votesFor: null, votesAgainst: null },
			expect.any(Date)
		);
		expect(redirect).toMatchObject({ location: MOTIONS_URL });
	});

	it('refuses a motion that is no longer on the floor', async () => {
		vi.mocked(listMotions).mockResolvedValue([motion({ status: 'passed' })]);

		expect(await refusalOf(() => actions.withdraw(makeActionEvent({ motionId: 'motion-1' })))).toBe(
			MOTION_REFUSALS.notOnFloor
		);
	});
});

describe('clearFloor', () => {
	it('drops every motion on the floor, with Undo', async () => {
		vi.mocked(dropMotions).mockResolvedValue(['motion-1', 'motion-2', 'motion-3']);

		const redirect = await catchRedirect(() => actions.clearFloor(makeActionEvent()));

		expect(dropMotions).toHaveBeenCalledWith(SUPABASE, 'session-1', expect.any(Date));
		expect(redirect).toMatchObject({ location: MOTIONS_URL });
		expect(setFlash).toHaveBeenCalledWith(
			{},
			expect.objectContaining({ message: '3 motions dropped' })
		);
	});

	it('refuses when nothing is on the floor', async () => {
		expect(await refusalOf(() => actions.clearFloor(makeActionEvent()))).toBe(
			MOTION_REFUSALS.emptyFloor
		);
	});
});

describe('restore', () => {
	it('puts dropped motions of the session back on the floor', async () => {
		vi.mocked(listMotions).mockResolvedValue([
			motion({ status: 'dropped' }),
			motion({ id: 'motion-2', status: 'dropped' })
		]);

		const redirect = await catchRedirect(() =>
			actions.restore(makeActionEvent({ motionId: ['motion-1', 'motion-2'] }))
		);

		expect(restoreMotions).toHaveBeenCalledWith(SUPABASE, 'session-1', ['motion-1', 'motion-2']);
		expect(redirect).toMatchObject({ location: MOTIONS_URL });
	});

	it('refuses when any of them is not dropped', async () => {
		vi.mocked(listMotions).mockResolvedValue([
			motion({ status: 'dropped' }),
			motion({ id: 'motion-2', status: 'failed' })
		]);

		expect(
			await refusalOf(() =>
				actions.restore(makeActionEvent({ motionId: ['motion-1', 'motion-2'] }))
			)
		).toBe(MOTION_REFUSALS.notDropped);
		expect(restoreMotions).not.toHaveBeenCalled();
	});
});
