import { describe, expect, it } from 'vitest';
import type { ChairPress } from '$lib/chair-form';
import type { CommitteeSession, CommitteeStateView } from '$lib/chair-room';
import { CLEARED_CAUCUS_CLOCK } from '$lib/caucus-clock';
import { CLEARED_TIMER, type RoomSeat, type TimerSetting } from '$lib/committee-room';
import type { MotionInput, SessionMotion } from '$lib/motions';
import {
	clearFloorPress,
	decideMotionPress,
	motionViewPress,
	motionsAfterPresses,
	proposalPress,
	proposeMotionPress,
	restoreMotionsPress,
	withdrawMotionPress,
	type MotionDecisionFacts,
	type MotionViewRoom
} from './motion-presses';

const PRESSED = new Date('2026-09-26T10:00:00.000Z');

const FRANCE: RoomSeat = { id: 'seat-france', name: 'France', countryCode: 'FR' };

/** A running timer with five minutes left, so an extension or a suspension has something to act on. */
const RUNNING: TimerSetting = {
	totalSeconds: 600,
	endsAt: '2026-09-26T10:05:00.000Z',
	pausedRemainingSeconds: null
};

const STATE: CommitteeStateView = {
	currentSessionId: 'session-1',
	mode: 'formal_debate',
	currentMotionId: null,
	activeSpeakersListId: 'list-general',
	currentSpeakerEntryId: 'entry-1',
	currentVoteId: null,
	agendaTopic: null,
	timer: RUNNING,
	caucusClock: CLEARED_CAUCUS_CLOCK
};

const SESSION: CommitteeSession = {
	id: 'session-1',
	name: 'Session 1',
	status: 'in_progress',
	startedAt: '2026-09-26T09:00:00.000Z',
	endedAt: null
};

/** A motion on the floor, with `overrides` on top. */
function floorMotion(overrides: Partial<SessionMotion> = {}): SessionMotion {
	return {
		id: 'motion-1',
		kind: 'unmoderated_caucus',
		status: 'proposed',
		topic: null,
		totalTimeSeconds: 600,
		speakingTimeSeconds: null,
		proposedBy: FRANCE,
		votesFor: null,
		votesAgainst: null,
		decidedAt: null,
		createdAt: '2026-09-26T09:00:00.000Z',
		startedWithoutVote: false,
		...overrides
	};
}

/** What Pass or Fail decides, on a floor of the motion and one other, with `overrides` on top. */
function decision(overrides: Partial<MotionDecisionFacts> = {}): MotionDecisionFacts {
	const motion = overrides.motion ?? floorMotion();

	return {
		motion,
		result: 'passed',
		tally: null,
		floor: [motion, floorMotion({ id: 'motion-2', kind: 'other', topic: 'Photo' })],
		committeeState: STATE,
		currentSession: SESSION,
		...overrides
	};
}

/** One press of the chair form, with the expectation `expected`. Only `expected` is read by the code under test. */
function pressOf(expected: ChairPress['expected']): ChairPress {
	return { id: 1, formData: new FormData(), action: new URL('https://x/motions?/vote'), expected };
}

describe('proposeMotionPress', () => {
	it('adds the motion to the floor, proposed by the seat that raised it, as voted on', () => {
		const input: MotionInput = {
			kind: 'moderated_caucus',
			proposedBySeatId: 'seat-france',
			topic: 'Nuclear disarmament',
			totalTimeSeconds: 900,
			speakingTimeSeconds: 60,
			paperId: null
		};

		expect(proposeMotionPress(input, FRANCE, 'motion-new', PRESSED)).toEqual({
			motions: [
				{
					id: 'motion-new',
					added: {
						id: 'motion-new',
						kind: 'moderated_caucus',
						status: 'proposed',
						topic: 'Nuclear disarmament',
						totalTimeSeconds: 900,
						speakingTimeSeconds: 60,
						proposedBy: FRANCE,
						votesFor: null,
						votesAgainst: null,
						decidedAt: null,
						createdAt: PRESSED.toISOString(),
						startedWithoutVote: false
					}
				}
			]
		});
	});

	it('proposes with no seat when the chair raised it', () => {
		const input: MotionInput = {
			kind: 'suspend_meeting',
			proposedBySeatId: null,
			topic: null,
			totalTimeSeconds: null,
			speakingTimeSeconds: null,
			paperId: null
		};

		const expectation = proposeMotionPress(input, null, 'motion-new', PRESSED);

		expect(expectation.motions?.[0].added?.proposedBy).toBeNull();
	});
});

describe('decideMotionPress', () => {
	it('fails a motion with its counts and changes nothing else', () => {
		const tally = { votesFor: 4, votesAgainst: 9 };

		expect(decideMotionPress(decision({ result: 'failed', tally }), PRESSED)).toEqual({
			motions: [
				{
					id: 'motion-1',
					changes: {
						status: 'failed',
						votesFor: 4,
						votesAgainst: 9,
						decidedAt: PRESSED.toISOString()
					}
				}
			]
		});
	});

	it('passes a motion without counting, and drops the other motions on the floor', () => {
		const expectation = decideMotionPress(decision(), PRESSED);

		expect(expectation.motions).toEqual([
			{
				id: 'motion-1',
				changes: {
					status: 'passed',
					votesFor: null,
					votesAgainst: null,
					decidedAt: PRESSED.toISOString()
				}
			},
			{ id: 'motion-2', changes: { status: 'dropped', decidedAt: PRESSED.toISOString() } }
		]);
	});

	it('runs a passed moderated caucus with its total on the caucus clock, waiting, and nobody speaking', () => {
		const motion = floorMotion({ kind: 'moderated_caucus', topic: 'Aid', speakingTimeSeconds: 60 });
		const expectation = decideMotionPress(decision({ motion }), PRESSED);

		expect(expectation.state).toEqual({
			mode: 'moderated_caucus',
			currentMotionId: 'motion-1',
			currentSpeakerEntryId: null,
			currentVoteId: null,
			timer: CLEARED_TIMER,
			caucusClock: { totalSeconds: 600, endsAt: null, pausedRemainingSeconds: 600 }
		});
		expect(expectation.currentMotion?.id).toBe('motion-1');
	});

	it('starts a passed unmoderated caucus’s clock from the press', () => {
		const expectation = decideMotionPress(decision(), PRESSED);

		expect(expectation.state).toMatchObject({
			mode: 'unmoderated_caucus',
			currentMotionId: 'motion-1',
			currentSpeakerEntryId: null,
			timer: { totalSeconds: 600, endsAt: '2026-09-26T10:10:00.000Z', pausedRemainingSeconds: null }
		});
	});

	it('adds a passed extension to an unmoderated caucus’s clock, or a moderated caucus’s caucus clock', () => {
		const extension = floorMotion({ kind: 'extend_caucus', totalTimeSeconds: 300 });
		const unmod = { ...STATE, mode: 'unmoderated_caucus' as const };
		const mod: CommitteeStateView = {
			...STATE,
			mode: 'moderated_caucus',
			caucusClock: { totalSeconds: 600, endsAt: null, pausedRemainingSeconds: 120 }
		};

		const onUnmod = decideMotionPress(
			decision({ motion: extension, committeeState: unmod }),
			PRESSED
		);
		const onMod = decideMotionPress(decision({ motion: extension, committeeState: mod }), PRESSED);

		expect(onUnmod.state).toEqual({
			timer: { totalSeconds: 900, endsAt: '2026-09-26T10:10:00.000Z', pausedRemainingSeconds: null }
		});
		expect(onMod.state).toEqual({
			caucusClock: { totalSeconds: 900, endsAt: null, pausedRemainingSeconds: 420 }
		});
	});

	it('suspends the room for a passed suspension’s length, pausing its clock', () => {
		const suspend = floorMotion({ kind: 'suspend_meeting', totalTimeSeconds: 1800 });
		const expectation = decideMotionPress(decision({ motion: suspend }), PRESSED);

		expect(expectation.state).toMatchObject({
			mode: 'suspended',
			modeBeforeSuspension: 'formal_debate',
			suspendedAt: PRESSED.toISOString(),
			suspendedUntil: '2026-09-26T10:30:00.000Z',
			timer: { totalSeconds: 600, endsAt: null, pausedRemainingSeconds: 300 }
		});
	});

	it('ends the session on a passed adjournment', () => {
		const adjourn = floorMotion({ kind: 'adjourn_meeting', totalTimeSeconds: null });
		const expectation = decideMotionPress(decision({ motion: adjourn }), PRESSED);

		expect(expectation.state?.mode).toBe('idle');
		expect(expectation.currentSession).toMatchObject({ id: 'session-1', status: 'ended' });
	});

	it('moves the room to voting with no vote on a passed close of debate', () => {
		const close = floorMotion({ kind: 'close_debate', totalTimeSeconds: null });
		const expectation = decideMotionPress(decision({ motion: close }), PRESSED);

		expect(expectation.state).toEqual({
			mode: 'voting',
			currentMotionId: null,
			currentSpeakerEntryId: null,
			currentVoteId: null,
			timer: CLEARED_TIMER,
			caucusClock: CLEARED_CAUCUS_CLOCK
		});
		expect(expectation.currentMotion).toBeNull();
	});

	it('only records a passed document or another motion', () => {
		const document = floorMotion({ kind: 'introduce_document', totalTimeSeconds: null });
		const expectation = decideMotionPress(decision({ motion: document }), PRESSED);

		expect(expectation.state).toBeUndefined();
		expect(expectation.motions).toHaveLength(2);
	});
});

describe('withdrawMotionPress', () => {
	it('marks the motion withdrawn, with no tally, stamped with the moment it was pressed', () => {
		expect(withdrawMotionPress('motion-1', PRESSED)).toEqual({
			motions: [
				{
					id: 'motion-1',
					changes: {
						status: 'withdrawn',
						votesFor: null,
						votesAgainst: null,
						decidedAt: PRESSED.toISOString()
					}
				}
			]
		});
	});
});

describe('clearFloorPress and restoreMotionsPress', () => {
	it('drops every motion on the floor at the press', () => {
		expect(clearFloorPress(['motion-1', 'motion-2'], PRESSED)).toEqual({
			motions: [
				{ id: 'motion-1', changes: { status: 'dropped', decidedAt: PRESSED.toISOString() } },
				{ id: 'motion-2', changes: { status: 'dropped', decidedAt: PRESSED.toISOString() } }
			]
		});
	});

	it('puts dropped motions back on the floor, undecided', () => {
		expect(restoreMotionsPress(['motion-1'])).toEqual({
			motions: [{ id: 'motion-1', changes: { status: 'proposed', decidedAt: null } }]
		});
	});

	it('lays a clear and an undo over the floor so it ends where it began', () => {
		const motions = [floorMotion(), floorMotion({ id: 'motion-2' })];
		const presses = [
			pressOf(clearFloorPress(['motion-1', 'motion-2'], PRESSED)),
			pressOf(restoreMotionsPress(['motion-1', 'motion-2']))
		];

		const shown = motionsAfterPresses(motions, presses);

		expect(shown.map((motion) => motion.status)).toEqual(['proposed', 'proposed']);
		expect(shown.map((motion) => motion.decidedAt)).toEqual([null, null]);
	});
});

describe('motionsAfterPresses', () => {
	it('lays a withdrawn motion on top of the motions already there', () => {
		const presses = [pressOf(withdrawMotionPress('motion-1', PRESSED))];

		expect(motionsAfterPresses([floorMotion()], presses)).toEqual([
			{
				...floorMotion(),
				status: 'withdrawn',
				votesFor: null,
				votesAgainst: null,
				decidedAt: PRESSED.toISOString()
			}
		]);
	});

	it('adds a proposed motion that is not there yet, and not twice once it is', () => {
		const input: MotionInput = {
			kind: 'suspend_meeting',
			proposedBySeatId: null,
			topic: null,
			totalTimeSeconds: null,
			speakingTimeSeconds: null,
			paperId: null
		};
		const presses = [pressOf(proposeMotionPress(input, null, 'motion-new', PRESSED))];
		const added = motionsAfterPresses([], presses);

		expect(added.map((motion) => motion.id)).toEqual(['motion-new']);
		expect(motionsAfterPresses(added, presses)).toHaveLength(1);
	});
});

describe('motionViewPress', () => {
	const ROOM: MotionViewRoom = {
		floor: [floorMotion(), floorMotion({ id: 'motion-2' })],
		presentCount: 13,
		majority: 7,
		committeeState: STATE,
		currentSession: SESSION
	};

	/** The fields a press of the view sends. */
	function fieldsOf(fields: Record<string, string>): FormData {
		const formData = new FormData();

		for (const [name, value] of Object.entries(fields)) formData.set(name, value);

		return formData;
	}

	it('decides the motion the vote form names, with the count it agrees with', () => {
		const formData = fieldsOf({
			motionId: 'motion-1',
			result: 'failed',
			votesFor: '4',
			votesAgainst: '9'
		});

		const expectation = motionViewPress('?/vote', formData, ROOM, PRESSED);

		expect(expectation?.motions?.[0]).toMatchObject({
			id: 'motion-1',
			changes: { status: 'failed', votesFor: 4, votesAgainst: 9 }
		});
	});

	it('leaves to the server a vote it will refuse', () => {
		const disagrees = fieldsOf({ motionId: 'motion-1', result: 'passed', votesFor: '4' });
		const tooMany = fieldsOf({ motionId: 'motion-1', result: 'passed', votesFor: '14' });
		const gone = fieldsOf({ motionId: 'motion-9', result: 'passed' });

		expect(motionViewPress('?/vote', disagrees, ROOM, PRESSED)).toBeNull();
		expect(motionViewPress('?/vote', tooMany, ROOM, PRESSED)).toBeNull();
		expect(motionViewPress('?/vote', gone, ROOM, PRESSED)).toBeNull();
	});

	it('withdraws, clears the floor and restores', () => {
		const withdraw = motionViewPress(
			'?/withdraw',
			fieldsOf({ motionId: 'motion-2' }),
			ROOM,
			PRESSED
		);
		const clear = motionViewPress('?/clearFloor', new FormData(), ROOM, PRESSED);
		const restore = motionViewPress('?/restore', fieldsOf({ motionId: 'motion-2' }), ROOM, PRESSED);

		expect(withdraw).toEqual(withdrawMotionPress('motion-2', PRESSED));
		expect(clear).toEqual(clearFloorPress(['motion-1', 'motion-2'], PRESSED));
		expect(restore).toEqual(restoreMotionsPress(['motion-2']));
		expect(motionViewPress('?/somethingElse', new FormData(), ROOM, PRESSED)).toBeNull();
	});
});

describe('proposalPress', () => {
	const FACTS = { seats: [FRANCE], attendance: {}, defaultSpeakingSeconds: 60 };
	const NEW_ID = '0b9f8a3c-2a4d-4f6e-9b1c-7d2e3f4a5b6c';

	/** A composer as sent, with the id the browser chose. */
	function composer(fields: Record<string, string>): FormData {
		const formData = new FormData();

		for (const [name, value] of Object.entries({ newRowId: NEW_ID, ...fields })) {
			formData.set(name, value);
		}

		return formData;
	}

	it('puts a motion the server will take on the floor, with its seat', () => {
		const formData = composer({
			kind: 'moderated_caucus',
			proposedBySeatId: 'seat-france',
			topic: 'Aid'
		});

		const added = proposalPress(formData, FACTS, PRESSED)?.motions?.[0].added;

		expect(added).toMatchObject({
			id: NEW_ID,
			kind: 'moderated_caucus',
			proposedBy: FRANCE,
			totalTimeSeconds: 600,
			speakingTimeSeconds: 60
		});
	});

	it('leaves a form the server will refuse to the server', () => {
		const formData = composer({ kind: 'moderated_caucus', proposedBySeatId: 'seat-france' });

		expect(proposalPress(formData, FACTS, PRESSED)).toBeNull();
	});

	it('names a motion to introduce a document after the approved paper picked', () => {
		const papers = [{ id: 'paper-1', name: 'Working paper 1.1', title: 'Autonomous weapons' }];
		const formData = composer({
			kind: 'introduce_document',
			proposedBySeatId: 'seat-france',
			paperId: 'paper-1'
		});

		const facts = { ...FACTS, approvedPapers: papers };
		const added = proposalPress(formData, facts, PRESSED)?.motions?.[0].added;

		expect(added).toMatchObject({ kind: 'introduce_document', topic: 'Working paper 1.1' });
	});
});
