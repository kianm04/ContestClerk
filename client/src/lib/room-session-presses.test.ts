import { describe, expect, it } from 'vitest';
import type { CommitteeStateView } from './chair-room';
import { resumePress, returnTimePress, suspendPress } from './room-session-presses';

// What the live room's own presses show at once (T141): the same rules as
// `suspend`, `resume` and `setReturnTime` on the server, which
// `server/committee-room.test.ts` and `chair/page.server.test.ts` check.

/** The moment of every press here. */
const PRESSED = new Date('2026-01-01T10:00:20.000Z');

/** A room in a moderated caucus with both clocks running, as the suspend tests start from. */
function caucusRoom(overrides: Partial<CommitteeStateView> = {}): CommitteeStateView {
	return {
		currentSessionId: 'session-1',
		mode: 'moderated_caucus',
		currentMotionId: 'motion-1',
		activeSpeakersListId: 'list-caucus',
		currentSpeakerEntryId: 'entry-1',
		currentVoteId: null,
		agendaTopic: 'Water',
		// 40 seconds left on the speaker's clock, 280 on the caucus's.
		timer: { totalSeconds: 60, endsAt: '2026-01-01T10:01:00.000Z', pausedRemainingSeconds: null },
		caucusClock: {
			totalSeconds: 600,
			endsAt: '2026-01-01T10:05:00.000Z',
			pausedRemainingSeconds: null
		},
		suspendedAt: null,
		suspendedUntil: null,
		modeBeforeSuspension: null,
		...overrides
	};
}

describe('suspendPress', () => {
	it('suspends at the press, remembering the mode and pausing both running clocks', () => {
		expect(suspendPress(caucusRoom(), PRESSED)).toEqual({
			state: {
				mode: 'suspended',
				modeBeforeSuspension: 'moderated_caucus',
				suspendedAt: '2026-01-01T10:00:20.000Z',
				suspendedUntil: null,
				timer: { totalSeconds: 60, endsAt: null, pausedRemainingSeconds: 40 },
				caucusClock: { totalSeconds: 600, endsAt: null, pausedRemainingSeconds: 280 }
			}
		});
	});

	it('leaves a paused clock as it is, and the speaker, list and motion untouched', () => {
		const paused = { totalSeconds: 60, endsAt: null, pausedRemainingSeconds: 12 };
		const expectation = suspendPress(caucusRoom({ mode: 'formal_debate', timer: paused }), PRESSED);

		expect(expectation?.state?.timer).toEqual(paused);
		expect(expectation?.state).not.toHaveProperty('currentSpeakerEntryId');
		expect(expectation?.state).not.toHaveProperty('activeSpeakersListId');
		expect(expectation?.state).not.toHaveProperty('currentMotionId');
	});

	it('expects nothing for a room that is suspended already', () => {
		expect(suspendPress(caucusRoom({ mode: 'suspended' }), PRESSED)).toBeNull();
	});
});

describe('resumePress', () => {
	it('puts back the mode that was suspended and clears the suspension', () => {
		const suspended = caucusRoom({
			mode: 'suspended',
			modeBeforeSuspension: 'unmoderated_caucus',
			suspendedAt: '2026-01-01T10:00:00.000Z',
			suspendedUntil: '2026-01-01T10:30:00.000Z'
		});

		expect(resumePress(suspended)).toEqual({
			state: {
				mode: 'unmoderated_caucus',
				suspendedAt: null,
				suspendedUntil: null,
				modeBeforeSuspension: null
			}
		});
	});

	it('resumes into formal debate when no mode is on record', () => {
		expect(resumePress(caucusRoom({ mode: 'suspended' })).state?.mode).toBe('formal_debate');
	});
});

describe('returnTimePress', () => {
	/** The suspended screen's form, with `fields` filled in. */
	function formWith(fields: Record<string, string>): FormData {
		const formData = new FormData();

		for (const [name, value] of Object.entries(fields)) formData.set(name, value);

		return formData;
	}

	it('sets the return time a minute button asks for, rounded up to the minute', () => {
		const expectation = returnTimePress(formWith({ minutes: '15' }), PRESSED, 'UTC');

		expect(expectation).toEqual({ state: { suspendedUntil: '2026-01-01T10:16:00.000Z' } });
	});

	it('sets a typed time, today in the conference timezone', () => {
		// 13:30 in Amsterdam in January is 12:30 UTC.
		const expectation = returnTimePress(formWith({ backAt: '13:30' }), PRESSED, 'Europe/Amsterdam');

		expect(expectation).toEqual({ state: { suspendedUntil: '2026-01-01T12:30:00.000Z' } });
	});

	it('expects nothing for a time the server would refuse', () => {
		expect(returnTimePress(formWith({ backAt: '09:00' }), PRESSED, 'UTC')).toBeNull();
		expect(returnTimePress(formWith({ backAt: 'soon' }), PRESSED, 'UTC')).toBeNull();
		expect(returnTimePress(formWith({ minutes: '999' }), PRESSED, 'UTC')).toBeNull();
	});
});
