/**
 * The words and the action of a queue column's add box, which differ by view
 * (`specs/05-pages/chair/gsl.md`, "Queue column"; `mod.md`, "Recognise";
 * `single-speaker.md`, "Also speaking"). The GSL and Unmod views add a
 * delegation to the General Speakers' List; the Mod view recognises one,
 * which gives it the floor at once while nobody has it; the Single speaker
 * view adds a speaker to "Also speaking".
 */

/** How a queue column's add box reads and what it posts. */
export type QueueAddBoxSettings = {
	/** The form action the box posts to: `?/add`, or the Mod view's `?/recognise`. */
	action: string;
	/** What the box is called for a screen reader, and the `<select>`'s label without JavaScript. */
	label: string;
	placeholder: string;
	/** The button beside the `<select>` without JavaScript. */
	buttonLabel: string;
	/** Whether choosing a seat gives it the floor, so each seat reads "gets the floor". */
	givesTheFloor: boolean;
};

/** The General Speakers' List's add box, on the GSL view and as Unmod's "After the caucus". */
export const GSL_ADD_BOX: QueueAddBoxSettings = {
	action: '?/add',
	label: 'Add a delegation',
	placeholder: 'Add a delegation…',
	buttonLabel: 'Add',
	givesTheFloor: false
};

/** The Single speaker view's "Also speaking" add box, which takes seats as the GSL's does. */
export const SINGLE_SPEAKER_ADD_BOX: QueueAddBoxSettings = {
	...GSL_ADD_BOX,
	label: 'Add a speaker',
	placeholder: 'Add a speaker…'
};

/**
 * The Mod view's "Recognise a delegation…": with nobody on the floor, Enter
 * gives the chosen seat the floor at once, so each seat says so; with
 * someone speaking, the seat joins the end of the caucus's list.
 */
export function recogniseAddBox(isFloorEmpty: boolean): QueueAddBoxSettings {
	return {
		action: '?/recognise',
		label: 'Recognise a delegation',
		placeholder: 'Recognise a delegation…',
		buttonLabel: 'Recognise',
		givesTheFloor: isFloorEmpty
	};
}
