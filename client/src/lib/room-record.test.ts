import { describe, expect, it } from 'vitest';
import type { CommitteeSession } from './chair-room';
import {
	recordOfSession,
	sessionLengthText,
	sessionRecordLine,
	sessionSummaryLine,
	type SessionRecord
} from './room-record';

const SESSION: CommitteeSession = {
	id: 'session-1',
	name: 'Session 1',
	status: 'ended',
	startedAt: '2026-01-01T09:00:00.000Z',
	endedAt: '2026-01-01T11:14:30.000Z'
};

const RECORD: SessionRecord = {
	sessionId: 'session-1',
	speechCount: 23,
	decidedMotionCount: 4,
	passedMotionCount: 3,
	votes: [{ subject: 'Draft Resolution 1.1', passed: true }]
};

describe('sessionRecordLine', () => {
	it('writes the speeches, the motions and one vote by its subject', () => {
		expect(sessionRecordLine(RECORD)).toBe(
			'23 speeches · 4 motions, 3 passed · 1 vote: Draft Resolution 1.1 passed'
		);
	});

	it('counts several votes, and says "no" for none', () => {
		const votes = [
			{ subject: 'Draft Resolution 1.1', passed: true },
			{ subject: 'Amendment 2', passed: false },
			{ subject: null, passed: true }
		];

		expect(sessionRecordLine({ ...RECORD, votes })).toBe(
			'23 speeches · 4 motions, 3 passed · 3 votes, 2 passed'
		);
		expect(
			sessionRecordLine({
				...RECORD,
				speechCount: 0,
				decidedMotionCount: 0,
				passedMotionCount: 0,
				votes: []
			})
		).toBe('no speeches · no motions · no votes');
	});

	it('writes one of each in the singular, and a failed vote with no subject plainly', () => {
		const record = {
			...RECORD,
			speechCount: 1,
			decidedMotionCount: 1,
			passedMotionCount: 0,
			votes: [{ subject: null, passed: false }]
		};

		expect(sessionRecordLine(record)).toBe('1 speech · 1 motion, 0 passed · 1 vote, failed');
	});
});

describe('sessionLengthText', () => {
	it('writes how long the session ran in whole minutes', () => {
		expect(sessionLengthText(SESSION)).toBe('2 h 14 min');
		expect(sessionLengthText({ ...SESSION, endedAt: '2026-01-01T09:41:00.000Z' })).toBe('41 min');
	});

	it('is null without a start or an end', () => {
		expect(sessionLengthText({ ...SESSION, startedAt: null })).toBeNull();
		expect(sessionLengthText({ ...SESSION, endedAt: null })).toBeNull();
	});
});

describe('recordOfSession', () => {
	it('is the record only when it is about that session', () => {
		expect(recordOfSession(RECORD, SESSION)).toBe(RECORD);
		expect(recordOfSession(RECORD, { ...SESSION, id: 'session-2' })).toBeNull();
		expect(recordOfSession(null, SESSION)).toBeNull();
	});
});

describe('sessionSummaryLine', () => {
	it('puts the length before the record', () => {
		expect(sessionSummaryLine(SESSION, RECORD)).toBe(
			'2 h 14 min · 23 speeches · 4 motions, 3 passed · 1 vote: Draft Resolution 1.1 passed'
		);
	});

	it('shows the length alone while the record read is another session’s', () => {
		const justEnded = { ...SESSION, id: 'session-2' };

		expect(sessionSummaryLine(justEnded, RECORD)).toBe('2 h 14 min');
	});
});
