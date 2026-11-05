import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import type { ChairMotion, CommitteeStateView } from '$lib/chair-room';
import type { ModViewData } from '$lib/caucus-view';
import type { RoomSeat } from '$lib/committee-room';
import type { GslEntry } from '$lib/gsl-floor';
import type { ModeViewFrame } from '$lib/list-floor';
import ModView from './ModView.svelte';

const KENYA: RoomSeat = {
	id: 'seat-ke',
	name: 'Kenya',
	countryCode: 'KE',
	delegateName: 'Amina Otieno'
};
const FRANCE: RoomSeat = { id: 'seat-fr', name: 'France', countryCode: 'FR' };
const BRAZIL: RoomSeat = { id: 'seat-br', name: 'Brazil', countryCode: 'BR' };

/** A moment `seconds` from now. */
function fromNow(seconds: number): string {
	return new Date(Date.now() + seconds * 1000).toISOString();
}

/** An entry of the caucus list. */
function entry(
	seat: RoomSeat,
	position: number,
	status: GslEntry['status'],
	spoke: number | null = null
): GslEntry {
	return { id: `entry-${seat.id}`, seat, position, status, spokeSeconds: spoke, finishedAt: null };
}

/** Brazil spoke, Kenya has the floor, France waits. */
const CAUCUS: ModViewData = {
	list: {
		speakersList: { id: 'caucus-1', name: 'Corridors', speakingTimeSeconds: 60, isOpen: true },
		speakers: [
			entry(BRAZIL, 1, 'spoken', 58),
			entry(KENYA, 2, 'speaking'),
			entry(FRANCE, 3, 'waiting')
		]
	},
	motion: {
		id: 'motion-1',
		kind: 'moderated_caucus',
		topic: 'Opening humanitarian corridors',
		totalTimeSeconds: 600,
		speakingTimeSeconds: 60,
		raisedByName: 'Brazil',
		startedWithoutVote: true
	}
};

const MOTION: ChairMotion = {
	id: 'motion-1',
	kind: 'moderated_caucus',
	status: 'passed',
	topic: 'Opening humanitarian corridors',
	totalTimeSeconds: 600,
	speakingTimeSeconds: 60,
	proposedBySeatName: 'Brazil',
	votesFor: null,
	votesAgainst: null,
	createdAt: '2026-10-01T10:00:00.000Z'
};

/** The room in a moderated caucus, Kenya's clock and the caucus clock running. */
const RUNNING: CommitteeStateView = {
	currentSessionId: 'session-1',
	mode: 'moderated_caucus',
	currentMotionId: 'motion-1',
	activeSpeakersListId: 'caucus-1',
	currentSpeakerEntryId: 'entry-seat-ke',
	currentVoteId: null,
	agendaTopic: null,
	timer: { totalSeconds: 60, endsAt: fromNow(41), pausedRemainingSeconds: null },
	caucusClock: { totalSeconds: 600, endsAt: fromNow(372), pausedRemainingSeconds: null }
};

/** The chair layout's data the view reads, with `state` for the room. */
function frameWith(state: CommitteeStateView): ModeViewFrame {
	return {
		committeeState: state,
		currentSession: null,
		currentMotion: MOTION,
		seats: [BRAZIL, FRANCE, KENYA],
		attendance: {},
		latestRollCallId: 'roll-call-1',
		conference: { slug: 'thimun-2027', timezone: 'Europe/Amsterdam' },
		committee: { slug: 'unsc', defaultSpeakingTimeSeconds: 90 },
		generalSpeakersListId: 'gsl-1',
		clockOffsetSampleMs: 0
	};
}

/** The view's buttons that are drawn filled: the one primary. */
function filledButtons(): HTMLElement[] {
	return screen
		.getAllByRole('button')
		.filter((button) => button.className.includes('bg-brand-900'));
}

describe('ModView', () => {
	it('draws the running caucus: the title, the caucus line, the speaker’s clock and "Next"', () => {
		render(ModView, { props: { caucus: CAUCUS, frame: frameWith(RUNNING) } });

		expect(
			screen.getByRole('heading', { name: 'Moderated caucus · Opening humanitarian corridors' })
		).toBeTruthy();
		expect(screen.getByText('raised by Brazil · started without a vote')).toBeTruthy();
		const caucusTime = screen.getByRole('timer', { name: 'Caucus time left' });
		expect(caucusTime.textContent).toContain('6:1');
		expect(caucusTime.textContent).toContain('left of 10:00');
		expect(screen.getByRole('button', { name: 'Extend +5:00' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'End caucus' })).toBeTruthy();
		expect(screen.getByRole('timer', { name: 'Time left' }).textContent?.trim()).toMatch(/^0:4\d$/);
		expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Next: France' })).toBeTruthy();
		expect(screen.getByRole('complementary', { name: 'Caucus speakers' })).toBeTruthy();
		expect(screen.getByText('1 · ~1 min')).toBeTruthy();
		expect(filledButtons().map((button) => button.title)).toEqual(['Next: France']);
	});

	it('has no Yield and no list footer', () => {
		render(ModView, { props: { caucus: CAUCUS, frame: frameWith(RUNNING) } });

		expect(screen.queryByText('Yield')).toBeNull();
		expect(screen.queryByText('Close list')).toBeNull();
		expect(screen.getByRole('combobox', { name: 'Recognise a delegation' })).toBeTruthy();
	});

	it('reads "Resume" with both clocks paused', () => {
		const paused = {
			...RUNNING,
			timer: { totalSeconds: 60, endsAt: null, pausedRemainingSeconds: 19 },
			caucusClock: { totalSeconds: 600, endsAt: null, pausedRemainingSeconds: 372 }
		};
		render(ModView, { props: { caucus: CAUCUS, frame: frameWith(paused) } });

		expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy();
		expect(screen.getByText('Paused')).toBeTruthy();
		expect(screen.getByRole('timer', { name: 'Caucus time left' }).textContent).toContain('6:12');
	});

	it('makes "End caucus" the primary once the time is up, and the speaker may finish', () => {
		const timeUp = {
			...RUNNING,
			caucusClock: { totalSeconds: 600, endsAt: null, pausedRemainingSeconds: 0 }
		};
		render(ModView, { props: { caucus: CAUCUS, frame: frameWith(timeUp) } });

		expect(screen.getByText('Caucus time is up')).toBeTruthy();
		expect(screen.getByText('The speaker may finish')).toBeTruthy();
		expect(screen.queryByRole('button', { name: /Next/ })).toBeNull();
		// "End caucus" is the filled primary; the caucus line keeps only "Extend +5:00".
		const endButtons = screen.getAllByRole('button', { name: 'End caucus' });
		expect(endButtons).toHaveLength(1);
		expect(endButtons[0].className).toContain('bg-brand-900');
		// The speaker's clock keeps running.
		expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
	});

	it('asks for a delegation to be recognised while nobody speaks or waits, with no primary', () => {
		const empty = {
			...RUNNING,
			currentSpeakerEntryId: null,
			timer: { totalSeconds: null, endsAt: null, pausedRemainingSeconds: null }
		};
		const caucus = {
			...CAUCUS,
			list: { ...CAUCUS.list!, speakers: [entry(BRAZIL, 1, 'spoken', 58)] }
		};
		render(ModView, { props: { caucus, frame: frameWith(empty) } });

		expect(screen.getByText('Recognise a delegation to speak')).toBeTruthy();
		expect(screen.getByText('Nobody is waiting.')).toBeTruthy();
		expect(screen.queryByRole('timer', { name: 'Time left' })).toBeNull();
		expect(filledButtons()).toEqual([]);
	});

	it('calls the first waiting seat over an empty floor, saying who spoke last', () => {
		const empty = {
			...RUNNING,
			currentSpeakerEntryId: null,
			timer: { totalSeconds: null, endsAt: null, pausedRemainingSeconds: null }
		};
		const caucus = {
			...CAUCUS,
			list: {
				...CAUCUS.list!,
				speakers: [entry(BRAZIL, 1, 'spoken', 58), entry(FRANCE, 3, 'waiting')]
			}
		};
		render(ModView, { props: { caucus, frame: frameWith(empty) } });

		expect(screen.getByText('Nobody has the floor')).toBeTruthy();
		expect(screen.getByText('Brazil spoke last · 0:58')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Call France' })).toBeTruthy();
	});

	it('waits for the session while suspended, the list still there', () => {
		const suspended = {
			...RUNNING,
			mode: 'suspended' as const,
			modeBeforeSuspension: 'moderated_caucus' as const
		};
		render(ModView, { props: { caucus: CAUCUS, frame: frameWith(suspended) } });

		expect(screen.getByText('The caucus resumes with the session')).toBeTruthy();
		expect(screen.queryByRole('timer')).toBeNull();
		const waiting = screen.getByRole('list', { name: 'Waiting to speak' });
		expect(within(waiting).getByText('France')).toBeTruthy();
	});
});
