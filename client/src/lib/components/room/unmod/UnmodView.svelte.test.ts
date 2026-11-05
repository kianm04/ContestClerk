import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import type { ChairMotion, CommitteeStateView } from '$lib/chair-room';
import type { UnmodViewData } from '$lib/caucus-view';
import type { RoomSeat } from '$lib/committee-room';
import type { ModeViewFrame } from '$lib/list-floor';
import UnmodView from './UnmodView.svelte';

const UNITED_KINGDOM: RoomSeat = { id: 'seat-gb', name: 'United Kingdom', countryCode: 'GB' };
const BRAZIL: RoomSeat = { id: 'seat-br', name: 'Brazil', countryCode: 'BR' };

/** A moment `seconds` from now. */
function fromNow(seconds: number): string {
	return new Date(Date.now() + seconds * 1000).toISOString();
}

/** The GSL, "After the caucus": the United Kingdom and Brazil waiting. */
const UNMOD: UnmodViewData = {
	gsl: {
		speakersList: {
			id: 'gsl-1',
			name: "General Speakers' List",
			speakingTimeSeconds: 90,
			isOpen: true
		},
		speakers: [
			{ id: 'entry-gb', seat: UNITED_KINGDOM, position: 1, status: 'waiting', spokeSeconds: null },
			{ id: 'entry-br', seat: BRAZIL, position: 2, status: 'waiting', spokeSeconds: null }
		]
	},
	motion: {
		id: 'motion-1',
		kind: 'unmoderated_caucus',
		topic: 'Drafting the working paper',
		totalTimeSeconds: 600,
		speakingTimeSeconds: null,
		raisedByName: 'Brazil',
		startedWithoutVote: true
	}
};

const MOTION: ChairMotion = {
	id: 'motion-1',
	kind: 'unmoderated_caucus',
	status: 'passed',
	topic: 'Drafting the working paper',
	totalTimeSeconds: 600,
	speakingTimeSeconds: null,
	proposedBySeatName: 'Brazil',
	votesFor: null,
	votesAgainst: null,
	createdAt: '2026-10-01T10:00:00.000Z'
};

/** The room in an unmoderated caucus with 8:42 left. */
const RUNNING: CommitteeStateView = {
	currentSessionId: 'session-1',
	mode: 'unmoderated_caucus',
	currentMotionId: 'motion-1',
	activeSpeakersListId: 'gsl-1',
	currentSpeakerEntryId: null,
	currentVoteId: null,
	agendaTopic: null,
	timer: { totalSeconds: 600, endsAt: fromNow(522), pausedRemainingSeconds: null }
};

/** The chair layout's data the view reads, with `state` for the room. */
function frameWith(state: CommitteeStateView): ModeViewFrame {
	return {
		committeeState: state,
		currentSession: null,
		currentMotion: MOTION,
		seats: [BRAZIL, UNITED_KINGDOM],
		attendance: {},
		latestRollCallId: null,
		conference: { slug: 'thimun-2027', timezone: 'Europe/Amsterdam' },
		committee: { slug: 'unsc', defaultSpeakingTimeSeconds: 90 },
		generalSpeakersListId: 'gsl-1',
		clockOffsetSampleMs: 0
	};
}

/** The view, drawn on `chair/unmod`. */
function renderView(state: CommitteeStateView) {
	return render(UnmodView, {
		props: { unmod: UNMOD, frame: frameWith(state), isTimeFieldOpen: false, page: 'unmod' }
	});
}

describe('UnmodView', () => {
	it('draws the one centred clock, "back at", "+1 min" and "End caucus" as the one primary', () => {
		renderView(RUNNING);

		expect(
			screen.getByRole('heading', { name: 'Unmoderated caucus · Drafting the working paper' })
		).toBeTruthy();
		expect(screen.getByText('raised by Brazil · started without a vote')).toBeTruthy();
		const clock = screen.getByRole('timer', { name: 'Time left' });
		expect(clock.textContent?.trim()).toMatch(/^8:4\d$/);
		expect(clock.className).toContain('text-[clamp(120px,15vw,208px)]');
		expect(screen.getByText(/^back at \d\d:\d\d$/)).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
		expect(screen.getByRole('button', { name: '+1 min' }).getAttribute('aria-keyshortcuts')).toBe(
			'Plus'
		);
		const end = screen.getByRole('button', { name: 'End caucus' });
		expect(end.className).toContain('bg-brand-900');
		expect(end.closest('form')?.getAttribute('action')).toBe('?/endCaucus');
		expect(screen.queryByRole('button', { name: /Next|Call/ })).toBeNull();
	});

	it('sends sixty seconds with "+1 min"', () => {
		renderView(RUNNING);

		const form = document.getElementById('unmod-add-minute');
		expect(form?.querySelector('input[name="seconds"]')?.getAttribute('value')).toBe('60');
	});

	it('shows "After the caucus", the General Speakers’ List with its footer', () => {
		renderView(RUNNING);

		const column = screen.getByRole('complementary', { name: 'After the caucus' });
		const waiting = within(column).getByRole('list', { name: 'Waiting to speak' });
		expect(within(waiting).getByText('United Kingdom')).toBeTruthy();
		expect(within(column).getByRole('combobox', { name: 'Add a delegation' })).toBeTruthy();
		expect(within(column).getByText('1:30 each')).toBeTruthy();
		expect(within(column).queryByRole('button', { name: 'Speak now' })).toBeNull();
	});

	it('reads "Paused · back at …" and "Resume" while paused', () => {
		renderView({
			...RUNNING,
			timer: { totalSeconds: 600, endsAt: null, pausedRemainingSeconds: 522 }
		});

		expect(screen.getByText(/^Paused · back at \d\d:\d\d$/)).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy();
		expect(screen.getByRole('timer', { name: 'Time left' }).textContent?.trim()).toBe('8:42');
	});

	it('reads "Resume", not "Start", for a clock paused within its first second', () => {
		renderView({
			...RUNNING,
			timer: { totalSeconds: 600, endsAt: null, pausedRemainingSeconds: 600 }
		});

		expect(screen.getByText(/^Paused · back at \d\d:\d\d$/)).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
	});

	it('counts up in danger colour once over time, ending nothing by itself', () => {
		renderView({
			...RUNNING,
			timer: { totalSeconds: 600, endsAt: fromNow(-42), pausedRemainingSeconds: null }
		});

		const clock = screen.getByRole('timer', { name: 'Time left' });
		expect(clock.textContent?.trim()).toMatch(/^\+0:4\d$/);
		expect(clock.className).toContain('text-danger-700');
		expect(screen.getByRole('button', { name: 'End caucus' })).toBeTruthy();
	});

	it('waits for the session while suspended in the caucus', () => {
		renderView({ ...RUNNING, mode: 'suspended', modeBeforeSuspension: 'unmoderated_caucus' });

		expect(screen.getByText('The caucus resumes with the session')).toBeTruthy();
		expect(screen.queryByRole('timer')).toBeNull();
		expect(screen.queryByRole('button', { name: 'End caucus' })).toBeNull();
	});
});
