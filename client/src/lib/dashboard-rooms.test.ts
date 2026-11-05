import { describe, expect, it } from 'vitest';
import type { ManagedCommittee } from '$lib/committees';
import {
	countRoomsInSession,
	isRoomInSession,
	liveRoomRows,
	roomActivity,
	roomPresence,
	roomsTotal,
	roomsTotalSentence,
	type DashboardRoom
} from './dashboard-rooms';

/** A room sitting in formal debate, 38 of its 42 delegates present at the last roll call. */
const UNSC: DashboardRoom = {
	committeeId: 'unsc-id',
	committeeSlug: 'unsc',
	committeeName: 'UNSC',
	session: { name: 'Session 2', mode: 'formal_debate' },
	presentCount: 38,
	lastSession: { name: 'Session 1', endedAt: '2026-10-01T15:58:00Z' },
	seatedCount: 42,
	absentees: []
};

/** A room that has stopped for the day. */
const SOCHUM: DashboardRoom = {
	committeeId: 'sochum-id',
	committeeSlug: 'sochum',
	committeeName: 'SOCHUM',
	session: null,
	presentCount: null,
	lastSession: { name: 'Session 1', endedAt: '2026-10-02T15:58:00Z' },
	seatedCount: 40,
	absentees: []
};

describe('roomActivity', () => {
	it("names a sitting room's session and its mode", () => {
		expect(roomActivity(UNSC, 'Europe/London')).toBe('Session 2 · Formal debate');
	});

	it('leaves out the mode of a sitting room between modes', () => {
		const between = { ...UNSC, session: { name: 'Session 2', mode: 'idle' as const } };

		expect(roomActivity(between, 'Europe/London')).toBe('Session 2');
	});

	it('names the last session of a room that is not sitting, in the conference timezone', () => {
		// 15:58 UTC is 16:58 in London in October.
		expect(roomActivity(SOCHUM, 'Europe/London')).toBe(
			'Not in session · last: Session 1 ended 16:58'
		);
	});

	it('says only that a room has not sat when it never has', () => {
		expect(roomActivity({ ...SOCHUM, lastSession: null }, 'Europe/London')).toBe('Not in session');
	});
});

describe('roomPresence', () => {
	it('counts who answered the latest roll call, or says none has been taken', () => {
		expect(roomPresence(UNSC)).toBe('38 of 42');
		expect(roomPresence({ ...UNSC, presentCount: null })).toBe('No roll call yet');
	});

	it('says nothing for a room that is not sitting', () => {
		expect(roomPresence(SOCHUM)).toBeNull();
	});
});

describe('liveRoomRows', () => {
	const securityCouncil: ManagedCommittee = {
		id: 'unsc-id',
		slug: 'unsc',
		name: 'Security Council',
		abbreviation: 'UNSC',
		description: null,
		topics: [],
		level: 'intermediate',
		room: 'Council Chamber',
		position: 0,
		defaultSpeakingTimeSeconds: 60,
		seatCounts: { available: 42, filled: 42, reserved: 0, total: 42 },
		chairNames: ['Fiona Campbell'],
		hasBackgroundGuide: true,
		positionPaperCount: 0
	};

	it("takes the committee's full name, room and chairs from the committees", () => {
		expect(liveRoomRows([UNSC], [securityCouncil], 'Europe/London')).toEqual([
			{
				committeeId: 'unsc-id',
				committeeSlug: 'unsc',
				name: 'Security Council',
				code: 'UNSC · Council Chamber',
				activity: 'Session 2 · Formal debate',
				presence: '38 of 42',
				chair: 'Fiona Campbell'
			}
		]);
	});

	it('keeps the short name of a room whose committee was not read', () => {
		expect(liveRoomRows([SOCHUM], [], 'Europe/London')[0]).toMatchObject({
			name: 'SOCHUM',
			code: null,
			presence: null,
			chair: 'No chair yet'
		});
	});
});

describe('roomsTotal', () => {
	it('adds up the sitting rooms only', () => {
		expect(roomsTotal([UNSC, SOCHUM])).toEqual({ present: 38, seated: 42, roomCount: 1 });
	});

	it('counts a sitting room with no roll call as nobody present', () => {
		const other = { ...UNSC, committeeId: 'other', presentCount: null, seatedCount: 10 };

		expect(roomsTotal([UNSC, other])).toEqual({ present: 38, seated: 52, roomCount: 2 });
	});

	it('is zero when no room sits', () => {
		expect(roomsTotal([SOCHUM])).toEqual({ present: 0, seated: 0, roomCount: 0 });
	});
});

describe('roomsTotalSentence', () => {
	it('writes the total and when it was read', () => {
		const sentence = roomsTotalSentence(
			{ present: 78, seated: 84, roomCount: 2 },
			'2026-10-02T12:02:00Z',
			'Europe/London'
		);

		expect(sentence).toBe('Present: 78 of 84 delegates in 2 rooms · As of 13:02');
	});

	it('says "1 room" for one', () => {
		const sentence = roomsTotalSentence(
			{ present: 3, seated: 4, roomCount: 1 },
			'2026-10-02T12:02:00Z',
			'UTC'
		);

		expect(sentence).toBe('Present: 3 of 4 delegates in 1 room · As of 12:02');
	});
});

describe('countRoomsInSession', () => {
	it('counts the rooms with a session in progress', () => {
		expect(countRoomsInSession([UNSC, SOCHUM])).toBe(1);
	});
});

describe('isRoomInSession', () => {
	it('is true for a room with a session in progress and false for one without', () => {
		expect(isRoomInSession(UNSC)).toBe(true);
		expect(isRoomInSession(SOCHUM)).toBe(false);
	});
});
