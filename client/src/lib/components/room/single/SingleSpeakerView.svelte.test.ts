import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { CommitteeStateView } from '$lib/chair-room';
import type { RoomSeat } from '$lib/committee-room';
import type { GslEntry } from '$lib/gsl-floor';
import type { ModeViewFrame } from '$lib/list-floor';
import type { SingleSpeakerViewData } from '$lib/single-speaker';
import SingleSpeakerView from './SingleSpeakerView.svelte';

const RUSSIA: RoomSeat = {
	id: 'seat-ru',
	name: 'Russian Federation',
	countryCode: 'RU',
	delegateName: 'Ivan Petrov'
};
const FRANCE: RoomSeat = { id: 'seat-fr', name: 'France', countryCode: 'FR' };

/** A typed name's entry, which stands in a seat whose id is the entry's. */
const SECRETARY_GENERAL: GslEntry = {
	id: 'entry-sg',
	seat: { id: 'entry-sg', name: 'Secretary-General', countryCode: null },
	position: 1,
	status: 'speaking',
	spokeSeconds: null,
	finishedAt: null
};

/** The single speaker's list holding `speakers`, Right of reply, one minute each. */
function singleWith(
	speakers: GslEntry[],
	purpose: string | null = 'Right of reply'
): SingleSpeakerViewData {
	return {
		list: {
			speakersList: {
				id: 'single-1',
				name: 'Single speaker',
				speakingTimeSeconds: 60,
				isOpen: true
			},
			speakers
		},
		purpose
	};
}

/** The room with a single speaker on the floor, the clock ready. */
const STATE: CommitteeStateView = {
	currentSessionId: 'session-1',
	mode: 'single_speaker',
	currentMotionId: null,
	activeSpeakersListId: 'single-1',
	currentSpeakerEntryId: 'entry-sg',
	currentVoteId: null,
	agendaTopic: null,
	timer: { totalSeconds: 60, endsAt: null, pausedRemainingSeconds: 60 }
};

/** The chair layout's data the view reads, with `state` for the room. */
function frameWith(state: CommitteeStateView): ModeViewFrame {
	return {
		committeeState: state,
		currentSession: null,
		currentMotion: null,
		seats: [FRANCE, RUSSIA],
		attendance: {},
		latestRollCallId: null,
		conference: { slug: 'thimun-2027', timezone: 'Europe/Amsterdam' },
		committee: { slug: 'unsc', defaultSpeakingTimeSeconds: 90 },
		generalSpeakersListId: 'gsl-1',
		clockOffsetSampleMs: 0
	};
}

describe('SingleSpeakerView', () => {
	it('draws a seat on the GSL’s floor, titled with the purpose and the time', () => {
		const speaking = { ...SECRETARY_GENERAL, id: 'entry-ru', seat: RUSSIA };
		render(SingleSpeakerView, {
			props: {
				single: singleWith([speaking]),
				frame: frameWith({ ...STATE, currentSpeakerEntryId: 'entry-ru' })
			}
		});

		expect(
			screen.getByRole('heading', { name: 'Single speaker · Right of reply · 1:00' })
		).toBeTruthy();
		expect(screen.getByText('Russian Federation', { selector: 'p' })).toBeTruthy();
		expect(screen.getByText('Ivan Petrov')).toBeTruthy();
		expect(screen.getByRole('timer', { name: 'Time left' }).textContent?.trim()).toBe('1:00');
		// The GSL's controls, Yield included, and "Return to GSL" while nobody waits.
		for (const name of ['Start', '+15 s', 'End speech']) {
			expect(screen.getByRole('button', { name })).toBeTruthy();
		}
		expect(screen.getByText('Yield')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Return to GSL' }).className).toContain(
			'bg-brand-900'
		);
		expect(screen.getByText('One speaker at a time, or several in a row.')).toBeTruthy();
	});

	it('draws a typed name with its initials in the flag’s place and no delegate line', () => {
		render(SingleSpeakerView, {
			props: { single: singleWith([SECRETARY_GENERAL], null), frame: frameWith(STATE) }
		});

		expect(screen.getByRole('heading', { name: 'Single speaker · 1:00' })).toBeTruthy();
		expect(screen.getByText('Secretary-General', { selector: 'p' })).toBeTruthy();
		expect(screen.getByText('SG')).toBeTruthy();
		expect(screen.queryByText('Delegate')).toBeNull();
	});

	it('calls the next speaker on "Also speaking" while one waits', () => {
		const france = {
			...SECRETARY_GENERAL,
			id: 'entry-fr',
			seat: FRANCE,
			position: 2,
			status: 'waiting' as const
		};
		render(SingleSpeakerView, {
			props: { single: singleWith([SECRETARY_GENERAL, france]), frame: frameWith(STATE) }
		});

		expect(screen.getByRole('button', { name: 'Next: France' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Return to GSL' })).toBeNull();
		expect(screen.getByRole('combobox', { name: 'Add a speaker' })).toBeTruthy();
	});

	it('says the last speaker has finished, and offers "Return to GSL"', () => {
		const spoken = { ...SECRETARY_GENERAL, status: 'spoken' as const, spokeSeconds: 58 };
		render(SingleSpeakerView, {
			props: {
				single: singleWith([spoken]),
				frame: frameWith({
					...STATE,
					currentSpeakerEntryId: null,
					timer: { totalSeconds: null, endsAt: null, pausedRemainingSeconds: null }
				})
			}
		});

		expect(screen.getByText('The last speaker has finished')).toBeTruthy();
		expect(screen.getByText('Secretary-General spoke last · 0:58')).toBeTruthy();
		expect(
			screen.getByRole('button', { name: 'Return to GSL' }).closest('form')?.getAttribute('action')
		).toBe('?/returnToGsl');
		expect(screen.queryByRole('timer')).toBeNull();
	});
});
