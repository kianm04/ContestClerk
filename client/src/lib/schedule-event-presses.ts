/**
 * What "Delete" does to the schedule's event list, worked out in the browser
 * at the moment of the press (T142), so the row disappears at once instead of
 * waiting for the server. Mirrors `deleteEvent` in `+page.server.ts`.
 * Duplicating an event to the next day is not part of this file: the copy's
 * id and its day both come from the server, so the browser cannot predict it.
 */
import { pressedField, type PressedForm, type RowChange } from '$lib/row-changes';
import type { ScheduleEvent } from '$lib/schedule';

/**
 * What a press will change: the event it names is taken off the day's list.
 * Null for a press this form does not predict, such as duplicating an event.
 */
export function expectScheduleEventRowChange(
	input: PressedForm
): RowChange<ScheduleEvent>[] | null {
	const eventId = pressedField(input.formData, 'eventId');

	if (eventId === '') return null;

	return [{ id: eventId, isDeleted: true }];
}

/** What did not happen when a press failed, for its toast. */
export function describeScheduleEventFailure(): string {
	return 'The event was not deleted.';
}
