/**
 * The `use:enhance` function of the start forms of the Mod, Unmod and Single
 * speaker views ("Start caucus", "Give the floor"): it sends the form through
 * the chair's instant form (`$lib/chair-form.ts`), stamped with the moment of
 * the press and the ids the browser chose, and says what the press will
 * change, so the running view is drawn the moment the button is pressed.
 *
 * Call `createStartSubmit` once, at the top of a start form's `<script>`: it
 * takes the chair layout's instant form from Svelte's context, which only
 * works while a component is being set up.
 */

import type { SubmitFunction } from '@sveltejs/kit';
import {
	newRowId,
	roomFrameAfterPresses,
	sharedChairForm,
	type ChairExpectation
} from '$lib/chair-form';
import { presentSeats } from '$lib/chair-room';
import { createClockOffsetGuess, serverNow } from '$lib/clock-offset';
import type { ModeViewFrame } from '$lib/list-floor';
import { stampStartForm, type StartFormFacts } from '$lib/mode-start-presses';

/** A start form's press builder: what its stamped form will change, or null when it would be refused. */
export type StartPressOf = (formData: FormData, facts: StartFormFacts) => ChairExpectation | null;

/**
 * The function to hand to the start form's `use:enhance`. `frame` answers
 * the chair layout's data as it is now; it is a function so the press reads
 * the room as it is at the moment of the press, not as it was when the form
 * was first drawn. `pressOf` is the form's own press builder, such as
 * `modStartPressOf` in `$lib/mode-start-presses.ts`.
 */
export function createStartSubmit(
	frame: () => ModeViewFrame,
	pressOf: StartPressOf
): SubmitFunction {
	const chairForm = sharedChairForm();
	const clockOffsetGuess = createClockOffsetGuess();

	return chairForm.submitExpecting((input) => {
		const current = frame();
		const pressed = serverNow(clockOffsetGuess.learn(current.clockOffsetSampleMs));
		const { committeeState } = roomFrameAfterPresses(current, chairForm.presses);
		const present = presentSeats(current.seats, current.attendance);

		stampStartForm(input.formData, pressed, newRowId);

		return pressOf(input.formData, {
			state: committeeState,
			generalListId: current.generalSpeakersListId,
			seats: current.seats,
			presentSeatIds: present.map((seat) => seat.id),
			defaultSpeakingSeconds: current.committee.defaultSpeakingTimeSeconds,
			pressed
		});
	});
}
