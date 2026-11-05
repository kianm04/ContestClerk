import { describe, expect, it } from 'vitest';
import {
	EVENT_DESCRIPTION_MAX_LENGTH,
	EVENT_LOCATION_MAX_LENGTH,
	EVENT_TITLE_MAX_LENGTH,
	hasFormErrors,
	isEventAudience,
	newCommitteeSessionsForm,
	newScheduleEventForm,
	nextSessionNumber,
	readCommitteeSessionsForm,
	readScheduleEventForm,
	scheduleEventFormValues,
	sessionLocation,
	sessionTitle,
	toScheduleEventInput,
	validateCommitteeSessionsForm,
	validateScheduleEventForm,
	type ScheduleEventFormValues
} from './schedule-form';
import type { ScheduleEvent } from './schedule';

// Amsterdam is the conference's clock in these tests: one hour ahead of UTC in
// January, when none of the dates below cross a change to summer time.
const AMSTERDAM = 'Europe/Amsterdam';

/** An event with every field filled in, which the tests below change one field of. */
function makeEvent(overrides: Partial<ScheduleEvent> = {}): ScheduleEvent {
	return {
		id: 'event-1',
		conferenceId: 'conference-1',
		title: 'Opening ceremony',
		description: 'Welcome remarks from the Secretary-General.',
		location: 'Main hall',
		startsAt: '2026-01-15T09:00:00Z',
		endsAt: '2026-01-15T10:30:00Z',
		audience: 'everyone',
		committeeId: null,
		committeeAbbreviation: null,
		...overrides
	};
}

/** Form values with every field filled in and already valid, for tests that change one field. */
function makeValues(overrides: Partial<ScheduleEventFormValues> = {}): ScheduleEventFormValues {
	return {
		eventId: '',
		title: 'Opening ceremony',
		startsAt: '2026-01-15T09:00',
		endsAt: '2026-01-15T10:00',
		location: 'Main hall',
		audience: 'everyone',
		committeeId: '',
		description: 'Welcome remarks.',
		...overrides
	};
}

/** A `FormData` built from a plain object, the way a submitted form arrives. */
function makeFormData(fields: Record<string, string | string[]>): FormData {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		if (Array.isArray(value)) {
			for (const oneValue of value) {
				formData.append(name, oneValue);
			}
		} else {
			formData.append(name, value);
		}
	}

	return formData;
}

describe('isEventAudience', () => {
	it('accepts the four audiences the dropdown offers', () => {
		expect(isEventAudience('everyone')).toBe(true);
		expect(isEventAudience('delegates')).toBe(true);
		expect(isEventAudience('staff')).toBe(true);
		expect(isEventAudience('committee')).toBe(true);
	});

	it('rejects "delegation", which is in the database enum but never on an event', () => {
		expect(isEventAudience('delegation')).toBe(false);
	});

	it('rejects text that is not an audience at all', () => {
		expect(isEventAudience('')).toBe(false);
		expect(isEventAudience('Everyone')).toBe(false);
	});
});

describe('newScheduleEventForm', () => {
	it('opens on the given day, nine to ten in the morning, for everyone', () => {
		expect(newScheduleEventForm('2026-01-15')).toEqual({
			eventId: '',
			title: '',
			startsAt: '2026-01-15T09:00',
			endsAt: '2026-01-15T10:00',
			location: '',
			audience: 'everyone',
			committeeId: '',
			description: ''
		});
	});
});

describe('scheduleEventFormValues', () => {
	it('shows both times on the conference clock, not in UTC', () => {
		const event = makeEvent();

		expect(scheduleEventFormValues(event, AMSTERDAM)).toEqual({
			eventId: 'event-1',
			title: 'Opening ceremony',
			startsAt: '2026-01-15T10:00',
			endsAt: '2026-01-15T11:30',
			location: 'Main hall',
			audience: 'everyone',
			committeeId: '',
			description: 'Welcome remarks from the Secretary-General.'
		});
	});

	it('turns a missing location, committee and description into empty text', () => {
		const event = makeEvent({ location: null, description: null });

		const values = scheduleEventFormValues(event, AMSTERDAM);

		expect(values.location).toBe('');
		expect(values.committeeId).toBe('');
		expect(values.description).toBe('');
	});

	it('carries a committee event’s committee id across', () => {
		const event = makeEvent({ audience: 'committee', committeeId: 'unsc' });

		expect(scheduleEventFormValues(event, AMSTERDAM).committeeId).toBe('unsc');
	});
});

describe('readScheduleEventForm', () => {
	it('reads every field, trimming the spaces a browser can leave around them', () => {
		const formData = makeFormData({
			eventId: '  event-1  ',
			title: '  Opening ceremony  ',
			startsAt: '2026-01-15T09:00',
			endsAt: '2026-01-15T10:00',
			location: '  Main hall  ',
			audience: 'everyone',
			committeeId: '',
			description: '  Welcome remarks.  '
		});

		expect(readScheduleEventForm(formData)).toEqual({
			eventId: 'event-1',
			title: 'Opening ceremony',
			startsAt: '2026-01-15T09:00',
			endsAt: '2026-01-15T10:00',
			location: 'Main hall',
			audience: 'everyone',
			committeeId: '',
			description: 'Welcome remarks.'
		});
	});

	it('reads a field nobody sent as empty text rather than throwing', () => {
		const values = readScheduleEventForm(new FormData());

		expect(values).toEqual({
			eventId: '',
			title: '',
			startsAt: '',
			endsAt: '',
			location: '',
			audience: '',
			committeeId: '',
			description: ''
		});
	});
});

describe('validateScheduleEventForm', () => {
	it('passes a fully filled in form with no errors', () => {
		expect(validateScheduleEventForm(makeValues(), AMSTERDAM)).toEqual({});
	});

	it('asks for a title when none was given', () => {
		const errors = validateScheduleEventForm(makeValues({ title: '' }), AMSTERDAM);

		expect(errors.title).toBe('Please give the event a title.');
	});

	it('refuses a title past the limit, word for word', () => {
		const errors = validateScheduleEventForm(
			makeValues({ title: 'x'.repeat(EVENT_TITLE_MAX_LENGTH + 1) }),
			AMSTERDAM
		);

		expect(errors.title).toBe(`Please keep the title under ${EVENT_TITLE_MAX_LENGTH} characters.`);
	});

	it('accepts a title exactly at the limit', () => {
		const errors = validateScheduleEventForm(
			makeValues({ title: 'x'.repeat(EVENT_TITLE_MAX_LENGTH) }),
			AMSTERDAM
		);

		expect(errors.title).toBeUndefined();
	});

	it('asks for a start and an end when a time box was left empty', () => {
		const errors = validateScheduleEventForm(makeValues({ startsAt: '' }), AMSTERDAM);

		expect(errors.startsAt).toBe('Please enter a start and an end time.');
	});

	it('asks for a start and an end when a time box holds a date that does not exist', () => {
		const errors = validateScheduleEventForm(makeValues({ startsAt: 'not-a-date' }), AMSTERDAM);

		expect(errors.startsAt).toBe('Please enter a start and an end time.');
	});

	it('insists the end comes after the start', () => {
		const errors = validateScheduleEventForm(
			makeValues({ startsAt: '2026-01-15T10:00', endsAt: '2026-01-15T09:00' }),
			AMSTERDAM
		);

		expect(errors.endsAt).toBe('The end must be after the start.');
	});

	it('refuses an end equal to the start, not only an end before it', () => {
		const errors = validateScheduleEventForm(
			makeValues({ startsAt: '2026-01-15T09:00', endsAt: '2026-01-15T09:00' }),
			AMSTERDAM
		);

		expect(errors.endsAt).toBe('The end must be after the start.');
	});

	it('refuses a location past the limit, word for word', () => {
		const errors = validateScheduleEventForm(
			makeValues({ location: 'x'.repeat(EVENT_LOCATION_MAX_LENGTH + 1) }),
			AMSTERDAM
		);

		expect(errors.location).toBe(
			`Please keep the location under ${EVENT_LOCATION_MAX_LENGTH} characters.`
		);
	});

	it('refuses "delegation" as an audience even though it is in the database enum', () => {
		const errors = validateScheduleEventForm(makeValues({ audience: 'delegation' }), AMSTERDAM);

		expect(errors.audience).toBe('Not allowed here');
	});

	it('refuses any other text that is not one of the four audiences', () => {
		const errors = validateScheduleEventForm(makeValues({ audience: 'nonsense' }), AMSTERDAM);

		expect(errors.audience).toBe('Not allowed here');
	});

	it('asks for a committee when the audience is "committee" and none was picked', () => {
		const errors = validateScheduleEventForm(
			makeValues({ audience: 'committee', committeeId: '' }),
			AMSTERDAM
		);

		expect(errors.committeeId).toBe('Pick the committee.');
	});

	it('accepts a committee event once a committee is picked', () => {
		const errors = validateScheduleEventForm(
			makeValues({ audience: 'committee', committeeId: 'unsc' }),
			AMSTERDAM
		);

		expect(errors.committeeId).toBeUndefined();
	});

	it('does not ask for a committee for any other audience', () => {
		const errors = validateScheduleEventForm(
			makeValues({ audience: 'staff', committeeId: '' }),
			AMSTERDAM
		);

		expect(errors.committeeId).toBeUndefined();
	});

	it('refuses a description past the limit, word for word', () => {
		const errors = validateScheduleEventForm(
			makeValues({ description: 'x'.repeat(EVENT_DESCRIPTION_MAX_LENGTH + 1) }),
			AMSTERDAM
		);

		expect(errors.description).toBe(
			`Please keep the description under ${EVENT_DESCRIPTION_MAX_LENGTH} characters.`
		);
	});

	it('collects every problem at once rather than stopping at the first', () => {
		const errors = validateScheduleEventForm(
			makeValues({ title: '', startsAt: '', audience: 'delegation' }),
			AMSTERDAM
		);

		expect(Object.keys(errors).sort()).toEqual(['audience', 'startsAt', 'title']);
	});
});

describe('hasFormErrors', () => {
	it('is false for an object with no keys', () => {
		expect(hasFormErrors({})).toBe(false);
	});

	it('is true once at least one field has a message', () => {
		expect(hasFormErrors({ title: 'Please give the event a title.' })).toBe(true);
	});
});

describe('toScheduleEventInput', () => {
	it('turns empty text fields into null rather than empty strings', () => {
		const input = toScheduleEventInput(makeValues({ location: '', description: '' }), AMSTERDAM);

		expect(input.location).toBeNull();
		expect(input.description).toBeNull();
	});

	it('converts both moments from the conference clock to UTC ISO instants', () => {
		const input = toScheduleEventInput(
			makeValues({ startsAt: '2026-01-15T10:00', endsAt: '2026-01-15T11:30' }),
			AMSTERDAM
		);

		expect(input.startsAt).toBe('2026-01-15T09:00:00.000Z');
		expect(input.endsAt).toBe('2026-01-15T10:30:00.000Z');
	});

	it('drops the committee id for every audience other than "committee"', () => {
		const input = toScheduleEventInput(
			makeValues({ audience: 'staff', committeeId: 'unsc' }),
			AMSTERDAM
		);

		expect(input.audience).toBe('staff');
		expect(input.committeeId).toBeNull();
	});

	it('keeps the committee id when the audience is "committee"', () => {
		const input = toScheduleEventInput(
			makeValues({ audience: 'committee', committeeId: 'unsc' }),
			AMSTERDAM
		);

		expect(input.committeeId).toBe('unsc');
	});

	it('falls back to "everyone" for an audience that validation would have refused', () => {
		// `validateScheduleEventForm` always runs first and would have refused this
		// form, so this only exercises the fallback `toScheduleEventInput` itself
		// falls back to.
		const input = toScheduleEventInput(makeValues({ audience: 'delegation' }), AMSTERDAM);

		expect(input.audience).toBe('everyone');
		expect(input.committeeId).toBeNull();
	});
});

describe('newCommitteeSessionsForm', () => {
	it('opens on the given day, nine to twelve, with the given committees ticked', () => {
		expect(newCommitteeSessionsForm('2026-01-15', ['unsc', 'disec'])).toEqual({
			titlePattern: 'Session {n}',
			day: '2026-01-15',
			startTime: '09:00',
			endTime: '12:00',
			locationPattern: '{room}',
			committeeIds: ['unsc', 'disec']
		});
	});
});

describe('readCommitteeSessionsForm', () => {
	it('gathers every ticked checkbox into one list with getAll', () => {
		const formData = makeFormData({
			titlePattern: '  Session {n}  ',
			day: '2026-01-15',
			startTime: '09:00',
			endTime: '12:00',
			locationPattern: '{room}',
			committeeIds: ['unsc', 'disec']
		});

		expect(readCommitteeSessionsForm(formData)).toEqual({
			titlePattern: 'Session {n}',
			day: '2026-01-15',
			startTime: '09:00',
			endTime: '12:00',
			locationPattern: '{room}',
			committeeIds: ['unsc', 'disec']
		});
	});

	it('reads no committees ticked as an empty list, not a list with one empty entry', () => {
		const formData = makeFormData({ titlePattern: 'Session {n}', day: '2026-01-15' });

		expect(readCommitteeSessionsForm(formData).committeeIds).toEqual([]);
	});
});

describe('validateCommitteeSessionsForm', () => {
	function makeSessionsValues(
		overrides: Partial<ReturnType<typeof newCommitteeSessionsForm>> = {}
	) {
		return { ...newCommitteeSessionsForm('2026-01-15', ['unsc']), ...overrides };
	}

	it('passes a fully filled in form with no errors', () => {
		expect(validateCommitteeSessionsForm(makeSessionsValues(), AMSTERDAM)).toEqual({});
	});

	it('asks to tick at least one committee, word for word', () => {
		const errors = validateCommitteeSessionsForm(
			makeSessionsValues({ committeeIds: [] }),
			AMSTERDAM
		);

		expect(errors.committeeIds).toBe('Tick at least one committee.');
	});

	it('checks the title the same way the event form does', () => {
		const errors = validateCommitteeSessionsForm(
			makeSessionsValues({ titlePattern: '' }),
			AMSTERDAM
		);

		expect(errors.titlePattern).toBe('Please give the event a title.');
	});

	it('checks the location the same way the event form does', () => {
		const errors = validateCommitteeSessionsForm(
			makeSessionsValues({ locationPattern: 'x'.repeat(EVENT_LOCATION_MAX_LENGTH + 1) }),
			AMSTERDAM
		);

		expect(errors.locationPattern).toBe(
			`Please keep the location under ${EVENT_LOCATION_MAX_LENGTH} characters.`
		);
	});

	it('insists the end comes after the start, built from the day and the two time boxes', () => {
		const errors = validateCommitteeSessionsForm(
			makeSessionsValues({ startTime: '12:00', endTime: '09:00' }),
			AMSTERDAM
		);

		expect(errors.endsAt).toBe('The end must be after the start.');
	});
});

describe('sessionTitle', () => {
	it('replaces every "{n}" with the session number', () => {
		expect(sessionTitle('Session {n}', 1)).toBe('Session 1');
		expect(sessionTitle('Session {n} ({n})', 3)).toBe('Session 3 (3)');
	});

	it('leaves a pattern with no "{n}" in it alone', () => {
		expect(sessionTitle('Morning session', 2)).toBe('Morning session');
	});
});

describe('sessionLocation', () => {
	it('replaces "{room}" with the committee’s own room', () => {
		expect(sessionLocation('{room}', 'Room 204')).toBe('Room 204');
	});

	it('replaces "{room}" with "TBA" for a committee that has no room yet', () => {
		expect(sessionLocation('{room}', null)).toBe('TBA');
	});

	it('is null when the pattern comes out empty', () => {
		expect(sessionLocation('', 'Room 204')).toBeNull();
		expect(sessionLocation('   ', 'Room 204')).toBeNull();
	});

	it('keeps text around "{room}"', () => {
		expect(sessionLocation('Committee room: {room}', 'Room 204')).toBe('Committee room: Room 204');
	});
});

describe('nextSessionNumber', () => {
	it('numbers a committee’s first session 1 when it has none yet', () => {
		expect(nextSessionNumber([], 'unsc')).toBe(1);
	});

	it('counts only this committee’s own committee events', () => {
		const events = [
			makeEvent({ id: '1', audience: 'committee', committeeId: 'unsc' }),
			makeEvent({ id: '2', audience: 'committee', committeeId: 'disec' }),
			makeEvent({ id: '3', audience: 'everyone', committeeId: null }),
			makeEvent({ id: '4', audience: 'committee', committeeId: 'unsc' })
		];

		expect(nextSessionNumber(events, 'unsc')).toBe(3);
		expect(nextSessionNumber(events, 'disec')).toBe(2);
	});
});
