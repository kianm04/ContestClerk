import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import type { CommitteeStateView } from '$lib/chair-room';
import type { RoomSeat } from '$lib/committee-room';
import type { GslEntry, GslList, GslViewFrame } from '$lib/gsl-floor';
import GslView from './GslView.svelte';

const CHINA: RoomSeat = {
	id: 'seat-cn',
	name: 'China',
	countryCode: 'CN',
	delegateName: 'Wei Zhang'
};
const FRANCE: RoomSeat = { id: 'seat-fr', name: 'France', countryCode: 'FR' };
const BRAZIL: RoomSeat = { id: 'seat-br', name: 'Brazil', countryCode: 'BR' };
const KENYA: RoomSeat = { id: 'seat-ke', name: 'Kenya', countryCode: 'KE' };

/** An entry of the GSL. */
function entry(
	seat: RoomSeat,
	position: number,
	status: GslEntry['status'],
	spokeSeconds: number | null = null
): GslEntry {
	return { id: `entry-${seat.id}`, seat, position, status, spokeSeconds, finishedAt: null };
}

/** France spoke, China has the floor, Brazil and Kenya wait. */
const GSL: GslList = {
	speakersList: {
		id: 'gsl-1',
		name: "General Speakers' List",
		speakingTimeSeconds: 90,
		isOpen: true
	},
	speakers: [
		entry(FRANCE, 1, 'spoken', 85),
		entry(CHINA, 2, 'speaking'),
		entry(BRAZIL, 3, 'waiting'),
		entry(KENYA, 4, 'waiting')
	]
};

/** The room in formal debate on the GSL, with China's clock ready. */
const STATE: CommitteeStateView = {
	currentSessionId: 'session-1',
	mode: 'formal_debate',
	currentMotionId: null,
	activeSpeakersListId: 'gsl-1',
	currentSpeakerEntryId: 'entry-seat-cn',
	currentVoteId: null,
	agendaTopic: null,
	timer: { totalSeconds: 90, endsAt: null, pausedRemainingSeconds: 90 }
};

/** The chair layout's data the view reads, with `state` for the room. */
function frameWith(
	state: CommitteeStateView,
	attendance: GslViewFrame['attendance'] = {}
): GslViewFrame {
	return {
		committeeState: state,
		currentSession: null,
		currentMotion: null,
		seats: [BRAZIL, CHINA, FRANCE, KENYA],
		attendance,
		latestRollCallId: 'roll-call-1',
		conference: { slug: 'thimun-2027' },
		committee: { slug: 'unsc' },
		clockOffsetSampleMs: 0
	};
}

/** The view, drawn on `chair/gsl`. */
function renderView(gsl: GslList, frame: GslViewFrame) {
	return render(GslView, { props: { gsl, frame, isTimeFieldOpen: false, page: 'gsl' } });
}

describe('GslView', () => {
	it('draws the floor with the speaker and the clock, and the queue column beside it', () => {
		renderView(GSL, frameWith(STATE));

		expect(
			screen.getByRole('heading', { name: /General Speakers’ List · 1:30 each/ })
		).toBeTruthy();
		expect(screen.getByText('China', { selector: 'p' })).toBeTruthy();
		expect(screen.getByText('Wei Zhang')).toBeTruthy();
		expect(screen.getByRole('timer', { name: 'Time left' }).textContent?.trim()).toBe('1:30');
		expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Next: Brazil' })).toBeTruthy();
		expect(screen.getByRole('complementary', { name: 'Speakers’ list' })).toBeTruthy();
		expect(screen.getByText('2 · ~3 min')).toBeTruthy();
	});

	it('names the next present seat, skipping one marked absent, which keeps its place', () => {
		renderView(GSL, frameWith(STATE, { 'seat-br': 'absent' }));

		expect(screen.getByRole('button', { name: 'Next: Kenya' })).toBeTruthy();
		expect(screen.getByText('absent')).toBeTruthy();
		expect(screen.getByText('1 · ~2 min')).toBeTruthy();
	});

	it('reads "Nobody has the floor" and "Call {seat}" between speeches', () => {
		renderView(GSL, frameWith({ ...STATE, currentSpeakerEntryId: null }));

		expect(screen.getByText('Nobody has the floor')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Call Brazil' })).toBeTruthy();
		expect(screen.queryByRole('timer')).toBeNull();
	});

	it('waits, with no clock and no controls, while another mode is live', () => {
		const caucus = {
			...STATE,
			mode: 'moderated_caucus' as const,
			activeSpeakersListId: 'caucus-1'
		};
		renderView(GSL, frameWith(caucus));

		expect(screen.getByText('The GSL resumes when the caucus ends')).toBeTruthy();
		expect(screen.getByText('The list can still be added to and reordered.')).toBeTruthy();
		expect(screen.queryByRole('timer')).toBeNull();
		expect(screen.queryByRole('button', { name: /Next|Call/ })).toBeNull();
		// The queue column works as always, without "Speak now".
		const waiting = screen.getByRole('list', { name: 'Waiting to speak' });
		expect(within(waiting).getByText('Brazil')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Speak now' })).toBeNull();
	});

	it('asks for the first speaker over an empty list, with no primary', () => {
		const empty = { ...GSL, speakers: [] };
		renderView(empty, frameWith({ ...STATE, currentSpeakerEntryId: null }));

		expect(screen.getByText('Add the first speaker to the list')).toBeTruthy();
		expect(screen.getByText('Type a delegation in the add box, then press Enter.')).toBeTruthy();
		expect(screen.queryByRole('button', { name: /Next|Call/ })).toBeNull();
	});

	it('says "The list is closed." where the add box was, and offers "Open list"', () => {
		const closed = { ...GSL, speakersList: { ...GSL.speakersList, isOpen: false } };
		renderView(closed, frameWith(STATE));

		expect(screen.getByText('The list is closed.')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Open list' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Next: Brazil' })).toBeTruthy();
	});

	it('lists the speeches made, latest first', () => {
		renderView(GSL, frameWith(STATE));

		expect(screen.getByText('Spoken 1')).toBeTruthy();
		expect(screen.getAllByText('France 1:25').length).toBeGreaterThan(0);
	});
});
