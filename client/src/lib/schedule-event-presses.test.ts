import { describe, expect, it } from 'vitest';
import {
	describeScheduleEventFailure,
	expectScheduleEventRowChange
} from './schedule-event-presses';

/** A press of `?/deleteEvent` naming `eventId`, the way `ScheduleEventRow`'s `ConfirmButton` sends it. */
function pressInput(eventId: string) {
	const formData = new FormData();
	if (eventId !== '') formData.set('eventId', eventId);

	return {
		action: new URL('http://localhost/manage/riverside-mun-2027/schedule?/deleteEvent'),
		formData
	};
}

describe('expectScheduleEventRowChange', () => {
	it('takes the named event off the list', () => {
		expect(expectScheduleEventRowChange(pressInput('event-1'))).toEqual([
			{ id: 'event-1', isDeleted: true }
		]);
	});

	it('answers null when no event is named', () => {
		expect(expectScheduleEventRowChange(pressInput(''))).toBeNull();
	});
});

describe('describeScheduleEventFailure', () => {
	it('names the event', () => {
		expect(describeScheduleEventFailure()).toBe('The event was not deleted.');
	});
});
