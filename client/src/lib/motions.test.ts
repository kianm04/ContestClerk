import { describe, expect, it } from 'vitest';
import type { CommitteeSession } from '$lib/chair-room';
import {
	CHAIR_PROPOSER,
	MOTION_FIELD_MESSAGES,
	OTHER_DOCUMENT,
	chooseShownSession,
	decidedMotionTally,
	droppedMotionsMessage,
	emptyMotionForm,
	endedSessions,
	extendedCaucusTimer,
	floorMotion,
	isCaucusMode,
	isMotionKind,
	motionRanks,
	motionToDecide,
	raisedByLabel,
	readMotionForm,
	readMotionIds,
	readMotionResult,
	readMotionTally,
	splitMotions,
	type SessionMotion
} from './motions';

const NOW = new Date('2026-01-01T10:00:00.000Z');
const PRESENT_SEAT_IDS = ['seat-br', 'seat-fr'];

/** The committee's speaking time, which an empty "Each" means. */
const COMMITTEE_SPEAKING_SECONDS = 90;

/** A submitted composer holding `fields`. */
function formOf(fields: Record<string, string>): FormData {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	return formData;
}

/** Read `fields` as the composer would send them. */
function read(fields: Record<string, string>) {
	return readMotionForm(formOf(fields), PRESENT_SEAT_IDS, COMMITTEE_SPEAKING_SECONDS);
}

/** A moderated caucus as the composer sends it, with `overrides` on top. */
function caucusFields(overrides: Record<string, string> = {}): Record<string, string> {
	return {
		kind: 'moderated_caucus',
		proposedBySeatId: 'seat-br',
		topic: 'Climate finance',
		totalTime: '10',
		speakingTime: '1:00',
		...overrides
	};
}

/** A motion on the floor, with `overrides` on top. */
function motion(overrides: Partial<SessionMotion>): SessionMotion {
	return {
		id: 'motion-1',
		kind: 'moderated_caucus',
		status: 'proposed',
		topic: 'Climate finance',
		totalTimeSeconds: 600,
		speakingTimeSeconds: 60,
		proposedBy: { id: 'seat-br', name: 'Brazil', countryCode: 'BR' },
		votesFor: null,
		votesAgainst: null,
		decidedAt: null,
		createdAt: '2026-01-01T09:00:00.000Z',
		startedWithoutVote: false,
		...overrides
	};
}

/** A session with the given status. */
function session(id: string, status: CommitteeSession['status']): CommitteeSession {
	return { id, name: id, status, startedAt: null, endedAt: null };
}

describe('readMotionForm', () => {
	it('reads a moderated caucus with its times typed the MUN way', () => {
		expect(read(caucusFields({ totalTime: '12', speakingTime: '90s' })).input).toEqual({
			kind: 'moderated_caucus',
			proposedBySeatId: 'seat-br',
			topic: 'Climate finance',
			totalTimeSeconds: 720,
			speakingTimeSeconds: 90,
			paperId: null
		});
	});

	it('takes the defaults for empty time fields: 10:00, the committee’s speaking time, 5:00', () => {
		const mod = read(caucusFields({ totalTime: '', speakingTime: '' })).input;
		const unmod = read({ kind: 'unmoderated_caucus', proposedBySeatId: 'chair' }).input;
		const extend = read({ kind: 'extend_caucus', proposedBySeatId: 'chair' }).input;

		expect(mod).toMatchObject({ totalTimeSeconds: 600, speakingTimeSeconds: 90 });
		expect(unmod).toMatchObject({ totalTimeSeconds: 600, topic: null, proposedBySeatId: null });
		expect(extend).toMatchObject({ totalTimeSeconds: 300, speakingTimeSeconds: null });
	});

	it('leaves the optional length of a suspension and another motion out when empty', () => {
		const suspend = read({ kind: 'suspend_meeting', proposedBySeatId: 'chair', topic: 'lunch' });
		const other = read({ kind: 'other', proposedBySeatId: 'chair', topic: 'Recess for the photo' });

		expect(suspend.input).toMatchObject({ topic: 'lunch', totalTimeSeconds: null });
		expect(other.input).toMatchObject({ topic: 'Recess for the photo', totalTimeSeconds: null });
	});

	it('writes the fields a kind does not ask for as null', () => {
		const adjourn = read({
			kind: 'adjourn_meeting',
			proposedBySeatId: 'seat-fr',
			topic: 'ignored',
			totalTime: '10',
			speakingTime: '60s'
		});

		expect(adjourn.input).toEqual({
			kind: 'adjourn_meeting',
			proposedBySeatId: 'seat-fr',
			topic: null,
			totalTimeSeconds: null,
			speakingTimeSeconds: null,
			paperId: null
		});
	});

	it('asks for the seat that raised it, a present one or the chair', () => {
		expect(read(caucusFields({ proposedBySeatId: '' })).errors).toEqual({
			proposedBySeatId: MOTION_FIELD_MESSAGES.proposer
		});
		expect(read(caucusFields({ proposedBySeatId: 'seat-absent' })).errors).toEqual({
			proposedBySeatId: MOTION_FIELD_MESSAGES.proposer
		});
		expect(read(caucusFields({ proposedBySeatId: CHAIR_PROPOSER })).input?.proposedBySeatId).toBe(
			null
		);
	});

	it('asks a moderated caucus for a topic, and a document or another motion what it is about', () => {
		expect(read(caucusFields({ topic: '' })).errors.topic).toBe(MOTION_FIELD_MESSAGES.caucusTopic);
		expect(read({ kind: 'introduce_document', proposedBySeatId: 'chair' }).errors.topic).toBe(
			MOTION_FIELD_MESSAGES.topic
		);
		expect(read({ kind: 'other', proposedBySeatId: 'chair' }).errors.topic).toBe(
			MOTION_FIELD_MESSAGES.topic
		);
		expect(read(caucusFields({ topic: 'x'.repeat(201) })).errors.topic).toBe(
			MOTION_FIELD_MESSAGES.topicLength
		);
	});

	it('names a document after the approved paper picked, and its typed name only for Other', () => {
		const papers = [{ id: 'paper-1', name: 'Working paper 1.1', title: 'Autonomous weapons' }];
		const document = { kind: 'introduce_document', proposedBySeatId: 'seat-fr' };
		const readWith = (fields: Record<string, string>) =>
			readMotionForm(formOf(fields), PRESENT_SEAT_IDS, COMMITTEE_SPEAKING_SECONDS, papers);

		expect(readWith({ ...document, paperId: 'paper-1', topic: 'ignored' }).input).toMatchObject({
			topic: 'Working paper 1.1',
			paperId: 'paper-1'
		});
		expect(
			readWith({ ...document, paperId: OTHER_DOCUMENT, topic: 'Press release' }).input
		).toMatchObject({ topic: 'Press release', paperId: null });
		expect(readWith({ ...document, paperId: OTHER_DOCUMENT }).errors.topic).toBe(
			MOTION_FIELD_MESSAGES.topic
		);
		expect(readWith({ ...document, paperId: '' }).errors).toEqual({
			paperId: MOTION_FIELD_MESSAGES.paper
		});
		expect(readWith({ ...document, paperId: 'paper-gone' }).errors.paperId).toBe(
			MOTION_FIELD_MESSAGES.paper
		);
	});

	it('keeps a total between 1 and 60 minutes, and refuses a time it cannot read', () => {
		expect(read(caucusFields({ totalTime: '61' })).errors.totalTime).toBe(
			MOTION_FIELD_MESSAGES.totalTime
		);
		expect(read(caucusFields({ totalTime: 'ten' })).errors.totalTime).toBe(
			MOTION_FIELD_MESSAGES.totalTime
		);
		expect(
			read({ kind: 'extend_caucus', proposedBySeatId: 'chair', totalTime: '30s' }).errors.totalTime
		).toBe(MOTION_FIELD_MESSAGES.totalTime);
	});

	it('keeps an optional length between 1 minute and 4 hours', () => {
		const tooLong = read({ kind: 'suspend_meeting', proposedBySeatId: 'chair', totalTime: '241' });
		const fine = read({ kind: 'suspend_meeting', proposedBySeatId: 'chair', totalTime: '90' });

		expect(tooLong.errors.totalTime).toBe(MOTION_FIELD_MESSAGES.length);
		expect(fine.input?.totalTimeSeconds).toBe(5400);
	});

	it('keeps a speaking time between 15 and 300 seconds and within the total', () => {
		expect(read(caucusFields({ speakingTime: '10s' })).errors.speakingTime).toBe(
			MOTION_FIELD_MESSAGES.speakingTime
		);
		expect(read(caucusFields({ totalTime: '2', speakingTime: '2:30' })).errors.speakingTime).toBe(
			MOTION_FIELD_MESSAGES.speakingLongerThanTotal
		);
	});

	it('refuses a kind it does not know, and keeps what was typed', () => {
		const refused = read({ kind: 'set_agenda', proposedBySeatId: 'seat-br', topic: 'Kept' });

		expect(refused.errors).toEqual({ kind: MOTION_FIELD_MESSAGES.kind });
		expect(refused.values.topic).toBe('Kept');
		expect(refused.input).toBeNull();
	});
});

describe('readMotionTally', () => {
	it('reads no tally when both counts are empty', () => {
		expect(readMotionTally(formOf({ votesFor: '', votesAgainst: '' }))).toBeNull();
		expect(readMotionTally(formOf({}))).toBeNull();
	});

	it('counts an empty field as 0 once the other is filled', () => {
		expect(readMotionTally(formOf({ votesFor: '9', votesAgainst: '' }))).toEqual({
			votesFor: 9,
			votesAgainst: 0
		});
	});

	it('refuses a count that is not a whole number of 0 or more', () => {
		expect(readMotionTally(formOf({ votesFor: '-1', votesAgainst: '5' }))).toBe('notWhole');
		expect(readMotionTally(formOf({ votesFor: '2.5', votesAgainst: '' }))).toBe('notWhole');
	});
});

describe('readMotionResult and readMotionIds', () => {
	it('reads Pass and Fail, and nothing else', () => {
		expect(readMotionResult('passed')).toBe('passed');
		expect(readMotionResult('failed')).toBe('failed');
		expect(readMotionResult('withdrawn')).toBeNull();
		expect(readMotionResult(null)).toBeNull();
	});

	it('reads every motion id sent, once each, without blanks', () => {
		const formData = new FormData();
		formData.append('motionId', 'motion-1');
		formData.append('motionId', 'motion-2');
		formData.append('motionId', 'motion-1');
		formData.append('motionId', ' ');

		expect(readMotionIds(formData)).toEqual(['motion-1', 'motion-2']);
	});
});

describe('splitMotions', () => {
	it('ranks the floor most disruptive first and lists decisions newest first', () => {
		const caucus = motion({ id: 'caucus' });
		const adjourn = motion({ id: 'adjourn', kind: 'adjourn_meeting' });
		const early = motion({ id: 'early', status: 'failed', decidedAt: '2026-01-01T09:10:00Z' });
		const late = motion({ id: 'late', status: 'dropped', decidedAt: '2026-01-01T09:40:00Z' });

		const split = splitMotions([caucus, early, adjourn, late]);

		expect(split.proposed.map((each) => each.id)).toEqual(['adjourn', 'caucus']);
		expect(split.decided.map((each) => each.id)).toEqual(['late', 'early']);
	});
});

describe('motionToDecide', () => {
	const adjourn = motion({ id: 'adjourn', kind: 'adjourn_meeting' });
	const caucus = motion({ id: 'caucus' });

	it('puts the most disruptive motion up first, the rest further', () => {
		expect(motionToDecide([adjourn, caucus], null)).toEqual({
			motion: adjourn,
			isOutOfOrder: false,
			further: [caucus]
		});
	});

	it('puts the motion `?motion=` names up out of order', () => {
		expect(motionToDecide([adjourn, caucus], 'caucus')).toEqual({
			motion: caucus,
			isOutOfOrder: true,
			further: [adjourn]
		});
		expect(motionToDecide([adjourn, caucus], 'adjourn').isOutOfOrder).toBe(false);
	});

	it('ignores a `?motion=` that names nothing on the floor, and has nothing on an empty floor', () => {
		expect(motionToDecide([adjourn, caucus], 'gone').motion).toBe(adjourn);
		expect(motionToDecide([], 'gone')).toEqual({ motion: null, isOutOfOrder: false, further: [] });
	});
});

describe('motionRanks', () => {
	it('numbers the floor from 1, most disruptive first', () => {
		const floor = [motion({ id: 'adjourn' }), motion({ id: 'caucus' })];

		expect(motionRanks(floor)).toEqual({ adjourn: 1, caucus: 2 });
	});
});

describe('decidedMotionTally and droppedMotionsMessage', () => {
	it('gives the count with an en dash, "started without a vote", or nothing', () => {
		expect(decidedMotionTally(motion({ votesFor: 9, votesAgainst: 4 }))).toBe('9–4');
		expect(decidedMotionTally(motion({ startedWithoutVote: true }))).toBe('started without a vote');
		expect(decidedMotionTally(motion({}))).toBeNull();
	});

	it('says how many motions were dropped, and whether others', () => {
		expect(droppedMotionsMessage(2, true)).toBe('2 other motions dropped');
		expect(droppedMotionsMessage(1, true)).toBe('1 other motion dropped');
		expect(droppedMotionsMessage(3, false)).toBe('3 motions dropped');
	});
});

describe('floorMotion', () => {
	it('shows the caucus being run before anything on the floor', () => {
		const running = motion({ id: 'running', status: 'passed' });
		const adjourn = motion({ id: 'adjourn', kind: 'adjourn_meeting' });

		expect(floorMotion([adjourn, running], 'running')?.id).toBe('running');
	});

	it('otherwise shows the motion that goes to the vote first, or nothing', () => {
		const caucus = motion({ id: 'caucus' });
		const adjourn = motion({ id: 'adjourn', kind: 'adjourn_meeting' });
		const failed = motion({ id: 'failed', status: 'failed', decidedAt: '2026-01-01T09:10:00Z' });

		expect(floorMotion([caucus, adjourn, failed], null)?.id).toBe('adjourn');
		expect(floorMotion([failed], null)).toBeNull();
	});
});

describe('raisedByLabel', () => {
	const seats = [{ id: 'seat-ke', name: 'Kenya', countryCode: 'KE' }];

	it('names the chosen seat or the chair, and nothing otherwise', () => {
		expect(raisedByLabel('seat-ke', seats)).toBe('Kenya');
		expect(raisedByLabel(CHAIR_PROPOSER, seats)).toBe('The chair');
		expect(raisedByLabel('', seats)).toBe('');
		expect(raisedByLabel('seat-gone', seats)).toBe('');
	});
});

describe('extendedCaucusTimer', () => {
	it('adds the seconds to a running timer and to its length', () => {
		const running = {
			totalSeconds: 600,
			endsAt: '2026-01-01T10:02:00.000Z',
			pausedRemainingSeconds: null
		};

		expect(extendedCaucusTimer(running, 300, NOW)).toEqual({
			totalSeconds: 900,
			endsAt: '2026-01-01T10:07:00.000Z',
			pausedRemainingSeconds: null
		});
	});

	it('adds to a paused remainder, and starts a timer when there is none', () => {
		const paused = { totalSeconds: 600, endsAt: null, pausedRemainingSeconds: 30 };
		const none = { totalSeconds: null, endsAt: null, pausedRemainingSeconds: null };

		expect(extendedCaucusTimer(paused, 60, NOW)).toEqual({
			totalSeconds: 660,
			endsAt: null,
			pausedRemainingSeconds: 90
		});
		expect(extendedCaucusTimer(none, 60, NOW)).toEqual({
			totalSeconds: 60,
			endsAt: '2026-01-01T10:01:00.000Z',
			pausedRemainingSeconds: null
		});
	});
});

describe('chooseShownSession', () => {
	const running = session('running', 'in_progress');
	const ended = session('ended', 'ended');

	it('shows an ended session read-only when the address names it', () => {
		expect(chooseShownSession([running, ended], running, 'ended')).toEqual({
			session: ended,
			isReadOnly: true
		});
	});

	it('otherwise shows the running session, or none', () => {
		expect(chooseShownSession([running, ended], running, 'running')).toEqual({
			session: running,
			isReadOnly: false
		});
		expect(chooseShownSession([ended], null, null)).toEqual({ session: null, isReadOnly: false });
		expect(endedSessions([running, ended])).toEqual([ended]);
	});
});

describe('small rules', () => {
	it('knows a caucus mode and the eight kinds, and starts the composer on Mod with empty fields', () => {
		expect(isCaucusMode('unmoderated_caucus')).toBe(true);
		expect(isCaucusMode('formal_debate')).toBe(false);
		expect(isMotionKind('close_debate')).toBe(true);
		expect(isMotionKind('set_agenda')).toBe(false);
		expect(emptyMotionForm()).toEqual({
			kind: 'moderated_caucus',
			proposedBySeatId: '',
			topic: '',
			totalTime: '',
			speakingTime: '',
			paperId: ''
		});
		expect(emptyMotionForm('extend_caucus').kind).toBe('extend_caucus');
	});
});
