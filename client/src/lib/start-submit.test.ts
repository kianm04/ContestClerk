import { describe, expect, it, vi } from 'vitest';
import type { SubmitFunction } from '@sveltejs/kit';
import type { ChairExpectation, ChairPress } from '$lib/chair-form';
import { CLEARED_TIMER, type RoomSeat } from '$lib/committee-room';
import type { InstantSubmitInput } from '$lib/instant-form.svelte';
import type { ModeViewFrame } from '$lib/list-floor';
import type { StartFormFacts } from '$lib/mode-start-presses';

// The chair layout's instant form lives in Svelte's context, which only
// exists while a component is being set up, so a stand-in takes its place:
// its `submitExpecting` hands back the press builder itself, which the tests
// then call the way the form would at the moment of a press. The ids the
// browser chooses are counted, so the tests can name them.
const chairForm = vi.hoisted(() => ({
	presses: [] as ChairPress[],
	submitExpecting: (expect: (input: unknown) => unknown) => expect
}));
const newIds = vi.hoisted(() => ({ count: 0 }));

vi.mock('$lib/chair-form', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/chair-form')>()),
	sharedChairForm: () => chairForm,
	newRowId: () => `id-${(newIds.count += 1)}`
}));

import { createStartSubmit } from './start-submit';

const NOW = new Date('2026-10-01T12:00:00.000Z');
const BRAZIL: RoomSeat = { id: 'seat-br', name: 'Brazil', countryCode: 'BR' };
const KENYA: RoomSeat = { id: 'seat-ke', name: 'Kenya', countryCode: 'KE' };

/** The chair layout's data: the room on the GSL, Kenya marked absent, the server 2 s ahead. */
const FRAME: ModeViewFrame = {
	conference: { slug: 'thimun-2027', timezone: 'Europe/Amsterdam' },
	committee: { slug: 'unsc', defaultSpeakingTimeSeconds: 75 },
	committeeState: {
		currentSessionId: 'session-1',
		mode: 'formal_debate',
		currentMotionId: null,
		activeSpeakersListId: 'gsl-1',
		currentSpeakerEntryId: null,
		currentVoteId: null,
		agendaTopic: null,
		timer: CLEARED_TIMER
	},
	currentSession: null,
	currentMotion: null,
	seats: [BRAZIL, KENYA],
	attendance: { 'seat-br': 'present', 'seat-ke': 'absent' },
	latestRollCallId: 'roll-1',
	generalSpeakersListId: 'gsl-1',
	clockOffsetSampleMs: 2_000
};

/** What `use:enhance` hands over at a press, holding an empty form. */
function pressInput(): InstantSubmitInput {
	return { formData: new FormData() } as unknown as InstantSubmitInput;
}

/** The press builder `createStartSubmit` handed to the stand-in form. */
function builderOf(submit: SubmitFunction): (input: InstantSubmitInput) => unknown {
	return submit as unknown as (input: InstantSubmitInput) => unknown;
}

describe('createStartSubmit', () => {
	it('stamps the form with the moment on the server’s clock and the ids the browser chose', () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(NOW);
		newIds.count = 0;
		const input = pressInput();

		builderOf(
			createStartSubmit(
				() => FRAME,
				() => null
			)
		)(input);
		vi.useRealTimers();

		expect(input.formData.get('pressedAt')).toBe('2026-10-01T12:00:02.000Z');
		expect(input.formData.get('newRowId')).toBe('id-1');
		expect(input.formData.get('newListId')).toBe('id-2');
	});

	it('hands the press builder the room as it is at the press, with the presses on their way', () => {
		// "Call Ghana" is still on its way when the caucus is started.
		const callPress: ChairPress = {
			id: 1,
			formData: new FormData(),
			action: new URL('http://localhost/chair?/nextSpeaker'),
			expected: { state: { currentSpeakerEntryId: 'entry-gh' } }
		};
		chairForm.presses = [callPress];
		const expected: ChairExpectation = { state: { mode: 'moderated_caucus' } };
		const pressOf = vi.fn<(formData: FormData, facts: StartFormFacts) => ChairExpectation>(
			() => expected
		);
		// The frame is read at the press, so a reload between drawing and pressing counts.
		let frame: ModeViewFrame = { ...FRAME, generalSpeakersListId: 'gsl-old' };
		const submit = createStartSubmit(() => frame, pressOf);
		frame = FRAME;

		const answer = builderOf(submit)(pressInput());
		chairForm.presses = [];

		expect(answer).toBe(expected);
		const facts = pressOf.mock.calls[0][1];
		expect(facts).toMatchObject({
			generalListId: 'gsl-1',
			seats: [BRAZIL, KENYA],
			presentSeatIds: ['seat-br'],
			defaultSpeakingSeconds: 75
		});
		expect(facts.state.currentSpeakerEntryId).toBe('entry-gh');
	});

	it('answers what the builder answers, nothing for a form the server would refuse', () => {
		const submit = createStartSubmit(
			() => FRAME,
			() => null
		);

		expect(builderOf(submit)(pressInput())).toBeNull();
	});
});
