/**
 * The seat combobox used as a form field rather than a list's add box: the
 * start forms' "Raised by" (Mod and Unmod) and "Who" (Single speaker)
 * (`specs/05-pages/chair/mod.md`, `unmod.md` and `single-speaker.md`,
 * "Components"). There a choice stays in the box, and the form sends it in a
 * hidden field. These say what the box shows and what the form sends.
 *
 * Plain functions with no Svelte in them.
 */

import type { SeatOption } from '$lib/seat-search';

/** What "Who" sends for a choice: the seat's id, or the typed name of somebody who holds no seat. */
export type WhoChoice = { seatId: string; speakerName: string };

/** Nobody chosen in "Who": both fields empty. */
export const NOBODY_CHOSEN: WhoChoice = { seatId: '', speakerName: '' };

/**
 * The words a chosen option leaves in the box: the seat's name, "The chair",
 * or a typed name as it was typed (not "Use “Secretary-General”").
 */
export function pickedText(option: SeatOption): string {
	return option.kind === 'name' ? option.value : option.label;
}

/** What "Who" sends for a chosen option: a seat in `seatId`, or a typed name in `speakerName`. */
export function whoChoice(option: SeatOption): WhoChoice {
	if (option.kind === 'name') return { seatId: '', speakerName: option.value };

	return { seatId: option.value, speakerName: '' };
}
