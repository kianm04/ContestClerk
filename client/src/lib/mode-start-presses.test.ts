import { describe, expect, it } from 'vitest';
import type { ChairPress } from '$lib/chair-form';
import type { RoomSeat } from '$lib/committee-room';
import {
	NEW_LIST_ID_FIELD,
	modStartPressOf,
	singleStartPressOf,
	stampStartForm,
	startModeratedCaucusPress,
	startSingleSpeakerPress,
	startUnmoderatedCaucusPress,
	startedPurpose,
	unmodStartPressOf,
	type StartFormFacts,
	type StartPressFacts
} from './mode-start-presses';

const NOW = new Date('2026-10-01T12:00:00.000Z');
const BRAZIL: RoomSeat = { id: 'seat-br', name: 'Brazil', countryCode: 'BR' };
const KENYA: RoomSeat = { id: 'seat-ke', name: 'Kenya', countryCode: 'KE' };

/** The room in formal debate on the GSL, China speaking there. */
const FACTS: StartFormFacts = {
	state: {
		mode: 'formal_debate',
		currentSpeakerEntryId: 'entry-cn',
		activeSpeakersListId: 'gsl-1',
		timer: { totalSeconds: 90, endsAt: null, pausedRemainingSeconds: 40 }
	},
	generalListId: 'gsl-1',
	seats: [BRAZIL, KENYA],
	presentSeatIds: ['seat-br', 'seat-ke'],
	defaultSpeakingSeconds: 90,
	pressed: NOW
};

/** A start form holding `fields`, stamped with the moment and two ids. */
function stampedForm(fields: Record<string, string>): FormData {
	const formData = new FormData();
	let count = 0;

	for (const [name, value] of Object.entries(fields)) formData.set(name, value);
	stampStartForm(formData, NOW, () => `id-${(count += 1)}`);

	return formData;
}

describe('stampStartForm', () => {
	it('carries the moment of the press and the ids the browser chose', () => {
		const formData = stampedForm({});

		expect(formData.get('pressedAt')).toBe(NOW.toISOString());
		expect(formData.get('newRowId')).toBe('id-1');
		expect(formData.get(NEW_LIST_ID_FIELD)).toBe('id-2');
	});
});

describe('modStartPressOf', () => {
	it('draws the running caucus at once: its empty list, the caucus clock paused at its total', () => {
		const form = stampedForm({ topic: 'Corridors', proposedBySeatId: 'seat-br' });
		const expectation = modStartPressOf(form, FACTS);

		expect(expectation?.state).toMatchObject({
			mode: 'moderated_caucus',
			currentMotionId: 'id-1',
			activeSpeakersListId: 'id-2',
			currentSpeakerEntryId: null,
			currentVoteId: null,
			timer: { totalSeconds: null, endsAt: null, pausedRemainingSeconds: null },
			caucusClock: { totalSeconds: 600, endsAt: null, pausedRemainingSeconds: 600 }
		});
		expect(expectation?.currentMotion).toMatchObject({
			id: 'id-1',
			kind: 'moderated_caucus',
			status: 'passed',
			topic: 'Corridors',
			speakingTimeSeconds: 90,
			proposedBySeatName: 'Brazil'
		});
		expect(expectation?.speakersLists).toEqual([
			{
				id: 'id-2',
				added: { id: 'id-2', name: 'Corridors', speakingTimeSeconds: 90, isOpen: true }
			}
		]);
		// The GSL speech in progress ends.
		expect(expectation?.speakers).toEqual([
			{ listId: 'gsl-1', id: 'entry-cn', changes: { status: 'spoken' } }
		]);
	});

	it('draws nothing for a form the server would refuse', () => {
		expect(modStartPressOf(stampedForm({ topic: '' }), FACTS)).toBeNull();
	});
});

describe('unmodStartPressOf', () => {
	it('runs the caucus’s clock from the press, the GSL staying the active list', () => {
		const form = stampedForm({ length: '15:00', topic: 'Drafting' });
		const expectation = unmodStartPressOf(form, FACTS);

		expect(expectation?.state).toMatchObject({
			mode: 'unmoderated_caucus',
			currentMotionId: 'id-1',
			activeSpeakersListId: 'gsl-1',
			currentSpeakerEntryId: null,
			timer: {
				totalSeconds: 900,
				endsAt: new Date(NOW.getTime() + 900_000).toISOString(),
				pausedRemainingSeconds: null
			}
		});
		expect(expectation?.currentMotion).toMatchObject({
			kind: 'unmoderated_caucus',
			topic: 'Drafting'
		});
	});

	it('draws nothing for a length the server would refuse', () => {
		expect(unmodStartPressOf(stampedForm({ lengthTyped: '90' }), FACTS)).toBeNull();
	});
});

describe('singleStartPressOf', () => {
	it('gives a seat the floor on a list of its own, its clock ready and not running', () => {
		const form = stampedForm({ seatId: 'seat-ke', time: '2:00' });
		const expectation = singleStartPressOf(form, FACTS);

		expect(expectation?.state).toMatchObject({
			mode: 'single_speaker',
			activeSpeakersListId: 'id-2',
			currentSpeakerEntryId: 'id-1',
			currentMotionId: null,
			timer: { totalSeconds: 120, endsAt: null, pausedRemainingSeconds: 120 }
		});
		expect(expectation?.speakers?.at(-1)).toEqual({
			listId: 'id-2',
			id: 'id-1',
			added: { id: 'id-1', position: 1, status: 'speaking', seat: KENYA, spokeSeconds: null }
		});
	});

	it('stands a typed name in a seat of its own, with no country', () => {
		const form = stampedForm({ speakerName: 'Secretary-General', time: '1:00' });
		const expectation = singleStartPressOf(form, FACTS);

		expect(expectation?.speakers?.at(-1)?.added?.seat).toEqual({
			id: 'id-1',
			name: 'Secretary-General',
			countryCode: null
		});
	});

	it('draws nothing for a form the server would refuse', () => {
		expect(singleStartPressOf(stampedForm({ time: '1:00' }), FACTS)).toBeNull();
	});
});

/** What the three builders below read: the room on the GSL with China speaking, raised by Kenya. */
const PRESS_FACTS: StartPressFacts = {
	state: FACTS.state,
	generalListId: 'gsl-1',
	raisedByName: 'Kenya',
	pressed: NOW
};

describe('startModeratedCaucusPress', () => {
	it('names the caucus’s list after its topic, and "Moderated caucus" without one', () => {
		const input = {
			kind: 'moderated_caucus' as const,
			proposedBySeatId: null,
			topic: null,
			totalSeconds: 300,
			speakingSeconds: 45
		};
		const expectation = startModeratedCaucusPress(
			input,
			{ motionId: 'motion-1', listId: 'list-1' },
			PRESS_FACTS
		);

		expect(expectation.speakersLists).toEqual([
			{
				id: 'list-1',
				added: { id: 'list-1', name: 'Moderated caucus', speakingTimeSeconds: 45, isOpen: true }
			}
		]);
		expect(expectation.state?.caucusClock).toEqual({
			totalSeconds: 300,
			endsAt: null,
			pausedRemainingSeconds: 300
		});
	});

	it('ends the GSL speech in progress and records the caucus raised by the seat named', () => {
		const input = {
			kind: 'moderated_caucus' as const,
			proposedBySeatId: 'seat-ke',
			topic: 'Corridors',
			totalSeconds: 600,
			speakingSeconds: 60
		};
		const expectation = startModeratedCaucusPress(
			input,
			{ motionId: 'motion-1', listId: 'list-1' },
			PRESS_FACTS
		);

		expect(expectation.speakers).toEqual([
			{ listId: 'gsl-1', id: 'entry-cn', changes: { status: 'spoken' } }
		]);
		expect(expectation.currentMotion).toMatchObject({
			id: 'motion-1',
			proposedBySeatName: 'Kenya',
			createdAt: NOW.toISOString()
		});
	});
});

describe('startUnmoderatedCaucusPress', () => {
	it('runs the caucus clock from the press and keeps the GSL the active list', () => {
		const input = {
			kind: 'unmoderated_caucus' as const,
			proposedBySeatId: null,
			topic: null,
			totalSeconds: 600,
			speakingSeconds: null
		};
		const expectation = startUnmoderatedCaucusPress(input, 'motion-2', PRESS_FACTS);

		expect(expectation.state).toMatchObject({
			mode: 'unmoderated_caucus',
			currentMotionId: 'motion-2',
			activeSpeakersListId: 'gsl-1',
			currentSpeakerEntryId: null,
			timer: {
				totalSeconds: 600,
				endsAt: new Date(NOW.getTime() + 600_000).toISOString(),
				pausedRemainingSeconds: null
			}
		});
		expect(expectation.speakersLists).toBeUndefined();
	});

	it('keeps the active list as it is when the session’s GSL is not known', () => {
		const input = {
			kind: 'unmoderated_caucus' as const,
			proposedBySeatId: null,
			topic: null,
			totalSeconds: 300,
			speakingSeconds: null
		};
		const facts = { ...PRESS_FACTS, generalListId: null };

		expect(startUnmoderatedCaucusPress(input, 'motion-2', facts).state?.activeSpeakersListId).toBe(
			'gsl-1'
		);
	});
});

describe('startSingleSpeakerPress', () => {
	it('gives the speaker the floor on a list of their own, clock ready, ending the GSL speech', () => {
		const input = { seatId: 'seat-br', speakerName: null, purpose: null, speakingSeconds: 120 };
		const expectation = startSingleSpeakerPress(
			input,
			BRAZIL,
			{ listId: 'single-1', entryId: 'entry-br' },
			FACTS.state
		);

		expect(expectation.state).toMatchObject({
			mode: 'single_speaker',
			currentMotionId: null,
			activeSpeakersListId: 'single-1',
			currentSpeakerEntryId: 'entry-br',
			timer: { totalSeconds: 120, endsAt: null, pausedRemainingSeconds: 120 }
		});
		expect(expectation.currentMotion).toBeNull();
		expect(expectation.speakers).toEqual([
			{ listId: 'gsl-1', id: 'entry-cn', changes: { status: 'spoken' } },
			{
				listId: 'single-1',
				id: 'entry-br',
				added: { id: 'entry-br', position: 1, status: 'speaking', seat: BRAZIL, spokeSeconds: null }
			}
		]);
	});
});

describe('startedPurpose', () => {
	it('reads the purpose of the single speaker a press has only just given the floor', () => {
		const formData = stampedForm({ purpose: 'other', purposeOther: 'Opening address' });
		const press: ChairPress = {
			id: 1,
			formData,
			action: new URL('http://localhost/chair/single?/startSingle'),
			expected: null
		};

		expect(startedPurpose('id-2', [press])).toBe('Opening address');
		expect(startedPurpose('another-list', [press])).toBeNull();
	});
});
