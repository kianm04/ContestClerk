import { describe, expect, it } from 'vitest';
import type { CommitteeStateView, RoomSpeaker } from './chair-room';
import {
	modeToResume,
	resumeFactsOf,
	suspendedScreenView,
	suspendedTitle,
	suspensionOf
} from './room-suspended';

const NOW = new Date('2026-01-01T12:12:30.000Z');

/** A room suspended from the GSL, with China holding the floor and 0:52 left on its clock. */
function suspendedRoom(overrides: Partial<CommitteeStateView> = {}): CommitteeStateView {
	return {
		currentSessionId: 'session-1',
		mode: 'suspended',
		currentMotionId: null,
		activeSpeakersListId: 'list-gsl',
		currentSpeakerEntryId: 'entry-china',
		currentVoteId: null,
		agendaTopic: null,
		timer: { totalSeconds: 90, endsAt: null, pausedRemainingSeconds: 52 },
		caucusClock: { totalSeconds: null, endsAt: null, pausedRemainingSeconds: null },
		suspendedAt: '2026-01-01T12:00:00.000Z',
		suspendedUntil: null,
		modeBeforeSuspension: 'formal_debate',
		...overrides
	};
}

/** One entry of the list, for a seat named `name`. */
function entry(id: string, name: string, status: RoomSpeaker['status']): RoomSpeaker {
	return { id, position: 0, status, seat: { id: `seat-${id}`, name, countryCode: null } };
}

const ENTRIES = [
	entry('entry-china', 'China', 'speaking'),
	entry('entry-kenya', 'Kenya', 'waiting'),
	entry('entry-peru', 'Peru', 'waiting')
];

describe('suspendedTitle', () => {
	it('adds the reason a passed suspend motion gave', () => {
		expect(suspendedTitle('for lunch')).toBe('Suspended for lunch');
		expect(suspendedTitle(null)).toBe('Suspended');
	});
});

describe('modeToResume', () => {
	it('is the mode the room remembered', () => {
		expect(modeToResume(suspendedRoom({ modeBeforeSuspension: 'voting' }), 'suspended')).toBe(
			'voting'
		);
	});

	it('stands in the mode last read until a press that did not say has been answered', () => {
		const pressed = suspendedRoom({ modeBeforeSuspension: undefined });

		expect(modeToResume(pressed, 'moderated_caucus')).toBe('moderated_caucus');
		expect(modeToResume(pressed, 'suspended')).toBeNull();
	});
});

describe('suspensionOf', () => {
	it('carries the two moments the room stores', () => {
		const room = suspendedRoom({ suspendedUntil: '2026-01-01T13:00:00.000Z' });

		expect(suspensionOf(room, NOW)).toEqual({
			suspendedAt: '2026-01-01T12:00:00.000Z',
			suspendedUntil: '2026-01-01T13:00:00.000Z'
		});
	});

	it('counts from now until the server says when the room was suspended', () => {
		expect(suspensionOf(suspendedRoom({ suspendedAt: null }), NOW).suspendedAt).toBe(
			NOW.toISOString()
		);
	});
});

describe('resumeFactsOf', () => {
	it('names the speaker, the time left and who waits', () => {
		expect(resumeFactsOf(suspendedRoom(), 'suspended', ENTRIES, null, NOW)).toEqual({
			mode: 'formal_debate',
			speakerName: 'China',
			timerSecondsLeft: 52,
			waitingCount: 2,
			caucusSecondsLeft: null,
			voteSubject: null
		});
	});

	it('reads a moderated caucus’s own clock', () => {
		const caucus = suspendedRoom({
			modeBeforeSuspension: 'moderated_caucus',
			caucusClock: { totalSeconds: 600, endsAt: null, pausedRemainingSeconds: 372 }
		});

		expect(resumeFactsOf(caucus, 'suspended', [], null, NOW).caucusSecondsLeft).toBe(372);
	});
});

describe('suspendedScreenView', () => {
	it('gives the title, the moments and what "Resume session" brings back', () => {
		const view = suspendedScreenView(
			{
				state: suspendedRoom(),
				storedMode: 'suspended',
				entries: ENTRIES,
				voteSubject: null,
				reason: 'for lunch'
			},
			NOW
		);

		expect(view).toEqual({
			title: 'Suspended for lunch',
			suspension: { suspendedAt: '2026-01-01T12:00:00.000Z', suspendedUntil: null },
			resumeSentence: 'When the session resumes: GSL, China with 0:52 left'
		});
	});

	it('names the vote the room was on', () => {
		const view = suspendedScreenView(
			{
				state: suspendedRoom({ modeBeforeSuspension: 'voting', currentSpeakerEntryId: null }),
				storedMode: 'suspended',
				entries: [],
				voteSubject: 'Draft Resolution 1.1',
				reason: null
			},
			NOW
		);

		expect(view.title).toBe('Suspended');
		expect(view.resumeSentence).toBe('When the session resumes: the vote on Draft Resolution 1.1');
	});
});
