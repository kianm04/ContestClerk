/**
 * What each button of the Motions view is expected to change, worked out in
 * the browser at the moment of the press (T141). The buttons hand these to
 * the chair's shared instant form (`$lib/chair-form.ts`), and the view draws
 * the floor and the decided list, and the frame the room's mode, with them
 * laid on top until the server has answered.
 *
 * Each function mirrors what the server does to the same data: recording a
 * motion is `proposeMotion` in `$lib/server/motions.ts`; Fail and Withdraw
 * are `decideMotion`; Pass is the SQL function `apply_passed_motion`
 * (`$lib/server/motion-effects.ts`), which also drops the other motions on the
 * floor and changes the room; "Clear the floor" is `dropMotions` and "Undo"
 * and "Restore" are `restoreMotions`. Every change says what things will be,
 * never "one more", so laying it over data that already holds it changes
 * nothing.
 */
import {
	expectationsOf,
	rowsAfterChanges,
	type ChairExpectation,
	type ChairPress,
	type RowChange
} from '$lib/chair-form';
import {
	presentSeats,
	type ChairMotion,
	type CommitteeSession,
	type CommitteeStateView
} from '$lib/chair-room';
import {
	CLEARED_CAUCUS_CLOCK,
	caucusClockAfterPress,
	caucusClockForTotal,
	extendedCaucusClock
} from '$lib/caucus-clock';
import {
	CLEARED_TIMER,
	pausedTimer,
	startedTimer,
	type AttendanceStatus,
	type RoomSeat
} from '$lib/committee-room';
import { motionCountRefusal } from '$lib/motion-count';
import {
	extendedCaucusTimer,
	readMotionForm,
	readMotionIds,
	readMotionResult,
	readMotionTally,
	type MotionInput,
	type MotionResult,
	type MotionTally,
	type SessionMotion
} from '$lib/motions';
import { NEW_ROW_ID_FIELD, readNewRowId } from '$lib/new-row-id';
import type { FloorPaper } from '$lib/papers-on-floor';
import { endSessionPress } from '$lib/room-presses';

/** What "Pass" or "Fail" decides, and the room it is decided in. */
export type MotionDecisionFacts = {
	/** The motion put to the vote. */
	motion: SessionMotion;
	result: MotionResult;
	/** The counts, or null when the chair decided it without counting. */
	tally: MotionTally | null;
	/** Every motion on the floor, the decided one among them. */
	floor: SessionMotion[];
	committeeState: CommitteeStateView;
	/** The running session, which a passed adjournment ends. */
	currentSession: CommitteeSession | null;
};

/** What the Motions view's presses need to know about the room, as the view shows it. */
export type MotionViewRoom = {
	/** The motions on the floor, in rank order. */
	floor: SessionMotion[];
	/** The seats present, or every seat before the session's first roll call. */
	presentCount: number;
	/** The votes for that pass a motion. */
	majority: number;
	committeeState: CommitteeStateView;
	currentSession: CommitteeSession | null;
};

/** What "Add to floor" reads the composer against. */
export type ProposalFacts = {
	seats: RoomSeat[];
	/** The latest roll call, keyed by seat id; empty before the first. */
	attendance: Record<string, AttendanceStatus>;
	/** The committee's speaking time, which an empty "Each" means. */
	defaultSpeakingSeconds: number;
	/** The approved papers a motion to introduce a document picks from; none leaves its name typed. */
	approvedPapers?: FloorPaper[];
};

/** A session's motions with every press's changes to them laid on top. */
export function motionsAfterPresses(
	motions: SessionMotion[],
	presses: ChairPress[]
): SessionMotion[] {
	const changes = expectationsOf(presses).flatMap((expectation) => expectation.motions ?? []);

	return rowsAfterChanges(motions, changes);
}

/** A motion, as the room's frame names the one it runs, from the session's own shape. */
function toChairMotion(motion: SessionMotion): ChairMotion {
	return {
		id: motion.id,
		kind: motion.kind,
		status: motion.status,
		topic: motion.topic,
		totalTimeSeconds: motion.totalTimeSeconds,
		speakingTimeSeconds: motion.speakingTimeSeconds,
		proposedBySeatName: motion.proposedBy?.name ?? null,
		votesFor: motion.votesFor,
		votesAgainst: motion.votesAgainst,
		createdAt: motion.createdAt
	};
}

/**
 * "Add to floor": the motion appears on the floor, still to be voted on,
 * under the id the browser chose. `proposer` is the seat
 * `input.proposedBySeatId` names, or null when the chair raised it.
 */
export function proposeMotionPress(
	input: MotionInput,
	proposer: RoomSeat | null,
	newMotionId: string,
	pressed: Date
): ChairExpectation {
	const motion: SessionMotion = {
		id: newMotionId,
		kind: input.kind,
		status: 'proposed',
		topic: input.topic,
		totalTimeSeconds: input.totalTimeSeconds,
		speakingTimeSeconds: input.speakingTimeSeconds,
		proposedBy: proposer,
		votesFor: null,
		votesAgainst: null,
		decidedAt: null,
		createdAt: pressed.toISOString(),
		startedWithoutVote: false
	};

	return { motions: [{ id: newMotionId, added: motion }] };
}

/**
 * A suspension, as `apply_passed_motion` writes one: every clock paused at
 * what it has left, what the room was doing kept for "Resume session", and
 * the motion's length, when it has one, as the time the room is back.
 */
function suspendedRoom(
	committeeState: CommitteeStateView,
	lengthSeconds: number | null,
	pressed: Date
): Partial<CommitteeStateView> {
	const backAt = lengthSeconds === null ? null : new Date(pressed.getTime() + lengthSeconds * 1000);
	const caucusClock = committeeState.caucusClock ?? CLEARED_CAUCUS_CLOCK;

	return {
		mode: 'suspended',
		modeBeforeSuspension: committeeState.mode,
		suspendedAt: pressed.toISOString(),
		suspendedUntil: backAt === null ? null : backAt.toISOString(),
		// `pausedTimer` answers null for a clock that is not running; it stays as it is.
		timer: pausedTimer(committeeState.timer, pressed) ?? committeeState.timer,
		caucusClock: caucusClockAfterPress(caucusClock, 'suspend', pressed)
	};
}

/**
 * What a passed motion does to the room, the way `apply_passed_motion` does.
 * A moderated caucus opens a speakers list of its own, whose id the server
 * chooses, so `activeSpeakersListId` is left out here and the list follows
 * once the server has answered.
 */
function roomEffectOfPassedMotion(
	motion: SessionMotion,
	facts: MotionDecisionFacts,
	pressed: Date
): ChairExpectation {
	const { committeeState } = facts;
	const totalSeconds = motion.totalTimeSeconds ?? 0;
	// A caucus or closing debate ends a speech in progress and a vote on show.
	const nobodyOnTheFloor = { currentSpeakerEntryId: null, currentVoteId: null };

	switch (motion.kind) {
		case 'moderated_caucus':
			// Nobody speaks yet, so the caucus clock holds the whole total, paused (D4).
			return {
				state: {
					...nobodyOnTheFloor,
					mode: 'moderated_caucus',
					currentMotionId: motion.id,
					timer: CLEARED_TIMER,
					caucusClock: caucusClockForTotal(totalSeconds)
				},
				currentMotion: toChairMotion(motion)
			};

		case 'unmoderated_caucus':
			return {
				state: {
					...nobodyOnTheFloor,
					mode: 'unmoderated_caucus',
					currentMotionId: motion.id,
					timer: startedTimer(totalSeconds, pressed),
					caucusClock: CLEARED_CAUCUS_CLOCK
				},
				currentMotion: toChairMotion(motion)
			};

		case 'extend_caucus':
			return extendedCaucus(committeeState, totalSeconds, pressed);

		case 'suspend_meeting':
			return { state: suspendedRoom(committeeState, motion.totalTimeSeconds, pressed) };

		case 'adjourn_meeting':
			// As "End session": the session ends and the room goes idle.
			return endSessionPress(facts.currentSession, pressed);

		case 'close_debate':
			// The room goes to voting with no vote yet, both clocks cleared.
			return {
				state: {
					...nobodyOnTheFloor,
					mode: 'voting',
					currentMotionId: null,
					timer: CLEARED_TIMER,
					caucusClock: CLEARED_CAUCUS_CLOCK
				},
				currentMotion: null
			};

		case 'introduce_document':
		case 'other':
			return {};
	}
}

/**
 * A passed extension: its time goes onto the clock of the caucus being run,
 * running or paused. A moderated caucus's own clock (D4), or an unmoderated
 * caucus's timer. The mode, the list and the speaker's clock are untouched.
 */
function extendedCaucus(
	committeeState: CommitteeStateView,
	seconds: number,
	pressed: Date
): ChairExpectation {
	if (committeeState.mode !== 'moderated_caucus') {
		return { state: { timer: extendedCaucusTimer(committeeState.timer, seconds, pressed) } };
	}

	const caucusClock = committeeState.caucusClock ?? CLEARED_CAUCUS_CLOCK;

	return { state: { caucusClock: extendedCaucusClock(caucusClock, seconds, pressed) } };
}

/** Each motion of `motionIds` dropped from the floor at `pressed`. */
function droppedChanges(motionIds: string[], pressed: Date): RowChange<SessionMotion>[] {
	const decidedAt = pressed.toISOString();

	return motionIds.map((id) => ({ id, changes: { status: 'dropped', decidedAt } }));
}

/**
 * "Pass" or "Fail": the motion is decided, with its counts or without. A pass
 * also drops every other motion on the floor and changes the room the way
 * `roomEffectOfPassedMotion` says; a fail changes nothing else.
 */
export function decideMotionPress(facts: MotionDecisionFacts, pressed: Date): ChairExpectation {
	const { motion, result, tally } = facts;
	const decidedAt = pressed.toISOString();
	const changes = {
		status: result,
		votesFor: tally?.votesFor ?? null,
		votesAgainst: tally?.votesAgainst ?? null,
		decidedAt
	};
	const decided: SessionMotion = { ...motion, ...changes };
	const decidedChange: RowChange<SessionMotion> = { id: motion.id, changes };

	if (result === 'failed') return { motions: [decidedChange] };

	const otherIds = facts.floor
		.filter((onFloor) => onFloor.id !== motion.id)
		.map((onFloor) => onFloor.id);
	const roomEffect = roomEffectOfPassedMotion(decided, facts, pressed);

	return { ...roomEffect, motions: [decidedChange, ...droppedChanges(otherIds, pressed)] };
}

/**
 * "Withdraw": the motion leaves the floor, listed as withdrawn, with no tally.
 * `decideMotion` on the server stamps `decided_at` with the moment it runs,
 * so this does the same with `pressed`, which also keeps a newly withdrawn
 * motion at the top of "Decided this session" at once.
 */
export function withdrawMotionPress(motionId: string, pressed: Date): ChairExpectation {
	return {
		motions: [
			{
				id: motionId,
				changes: {
					status: 'withdrawn',
					votesFor: null,
					votesAgainst: null,
					decidedAt: pressed.toISOString()
				}
			}
		]
	};
}

/** "Clear the floor": every motion on the floor, `motionIds`, is dropped at once. */
export function clearFloorPress(motionIds: string[], pressed: Date): ChairExpectation {
	return { motions: droppedChanges(motionIds, pressed) };
}

/**
 * "Undo" and "Restore": each dropped motion goes back on the floor, its
 * decision time cleared, and takes its place by rank again.
 */
export function restoreMotionsPress(motionIds: string[]): ChairExpectation {
	return {
		motions: motionIds.map((id) => ({ id, changes: { status: 'proposed', decidedAt: null } }))
	};
}

/**
 * "Pass" or "Fail" as the form sent it, or null when the server is going to
 * refuse it (a count that is not whole, too many votes, a count that
 * disagrees with the button, a motion no longer on the floor), so the floor
 * waits for the server's answer instead.
 */
function votePress(
	formData: FormData,
	room: MotionViewRoom,
	pressed: Date
): ChairExpectation | null {
	const motionId = String(formData.get('motionId') ?? '');
	const motion = room.floor.find((onFloor) => onFloor.id === motionId);
	const result = readMotionResult(formData.get('result'));
	const tally = readMotionTally(formData);

	if (!motion || result === null || tally === 'notWhole') return null;
	if (motionCountRefusal(result, tally, room.presentCount, room.majority) !== null) return null;

	const { floor, committeeState, currentSession } = room;

	return decideMotionPress(
		{ motion, result, tally, floor, committeeState, currentSession },
		pressed
	);
}

/**
 * What a press of the Motions view will change, by the action it posts to
 * (`?/vote`, `?/withdraw`, `?/clearFloor`, `?/restore`), or null when the
 * browser cannot be sure of the answer and leaves the screen to the server.
 */
export function motionViewPress(
	action: string,
	formData: FormData,
	room: MotionViewRoom,
	pressed: Date
): ChairExpectation | null {
	switch (action) {
		case '?/vote':
			return votePress(formData, room, pressed);
		case '?/withdraw':
			return withdrawMotionPress(String(formData.get('motionId') ?? ''), pressed);
		case '?/clearFloor':
			return clearFloorPress(
				room.floor.map((motion) => motion.id),
				pressed
			);
		case '?/restore':
			return restoreMotionsPress(readMotionIds(formData));
		default:
			return null;
	}
}

/**
 * "Add to floor" as the composer sent it: the motion on the floor at once,
 * under the id the composer chose for it, or null for a form the server
 * would refuse. `facts.seats` gives the raising seat's name and flag.
 */
export function proposalPress(
	formData: FormData,
	facts: ProposalFacts,
	pressed: Date
): ChairExpectation | null {
	const present = presentSeats(facts.seats, facts.attendance);
	const presentIds = present.map((seat) => seat.id);
	const { input } = readMotionForm(
		formData,
		presentIds,
		facts.defaultSpeakingSeconds,
		facts.approvedPapers
	);
	const newMotionId = readNewRowId(formData.get(NEW_ROW_ID_FIELD));

	if (input === null || newMotionId === null) return null;

	const proposer = present.find((seat) => seat.id === input.proposedBySeatId) ?? null;

	return proposeMotionPress(input, proposer, newMotionId, pressed);
}
