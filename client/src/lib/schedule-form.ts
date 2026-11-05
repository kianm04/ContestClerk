/**
 * The two forms of the organiser's schedule editor: one event, and a session
 * for every committee at once.
 *
 * Reading and checking what was typed lives here rather than in the page's
 * `+page.server.ts`, so the rules can be tested without a request and the
 * messages are written down in one place. `05-pages/organiser/schedule.md`
 * gives every message word for word.
 */

import { instantFromLocalDateTime, localDateTimeInTimezone } from '$lib/dates';
import type { EventAudience, ScheduleEvent } from '$lib/schedule';

/** The longest title an event may have, which the title box also stops typing at. */
export const EVENT_TITLE_MAX_LENGTH = 120;

/** The longest location an event may have. */
export const EVENT_LOCATION_MAX_LENGTH = 80;

/** The longest description an event may have. */
export const EVENT_DESCRIPTION_MAX_LENGTH = 1000;

/** The step of every time box on the page, in seconds: times move in five minutes. */
export const SCHEDULE_TIME_STEP_SECONDS = 300;

/** What a session title is written from until the organiser changes it. `{n}` is its number. */
export const DEFAULT_SESSION_TITLE_PATTERN = 'Session {n}';

/** What a session's location is written from. `{room}` is the committee's own room. */
export const DEFAULT_SESSION_LOCATION_PATTERN = '{room}';

/** What `{room}` becomes for a committee that has no room yet. */
const ROOM_NOT_SET = 'TBA';

/** The four audiences an event can be for, in the order the dropdown offers them. */
export const AUDIENCE_OPTIONS: { value: EventAudience; label: string }[] = [
	{ value: 'everyone', label: 'Everyone' },
	{ value: 'delegates', label: 'Delegates' },
	{ value: 'staff', label: 'Staff' },
	{ value: 'committee', label: 'One committee' }
];

/** Is this text one of the four audiences an event may be for? `delegation` is not. */
export function isEventAudience(text: string): text is EventAudience {
	return AUDIENCE_OPTIONS.some((option) => option.value === text);
}

/**
 * Everything the event form asks for, as text.
 *
 * The two times are `YYYY-MM-DDTHH:mm` from a `datetime-local` box, read in the
 * conference's timezone. A refused form is drawn again from these exact values.
 */
export type ScheduleEventFormValues = {
	/** The event being edited, or `''` when the form is adding one. */
	eventId: string;
	title: string;
	startsAt: string;
	endsAt: string;
	location: string;
	audience: string;
	/** Only read when `audience` is `committee`. */
	committeeId: string;
	description: string;
};

/** A message for each field that needs fixing. A field that is fine has no entry. */
export type ScheduleEventFormErrors = {
	title?: string;
	startsAt?: string;
	endsAt?: string;
	location?: string;
	audience?: string;
	committeeId?: string;
	description?: string;
};

/** An event as `$lib/server/schedule.ts` writes it: exact moments, and `null` for nothing typed. */
export type ScheduleEventInput = {
	title: string;
	description: string | null;
	location: string | null;
	startsAt: string;
	endsAt: string;
	audience: EventAudience;
	committeeId: string | null;
};

/** Read one text field from a submitted form, without surrounding spaces. */
function readText(formData: FormData, fieldName: string): string {
	return String(formData.get(fieldName) ?? '').trim();
}

/**
 * What the form shows for a new event on the day that is open: nine to ten in
 * the morning, for everyone, so that an organiser only has to change what differs.
 */
export function newScheduleEventForm(day: string): ScheduleEventFormValues {
	return {
		eventId: '',
		title: '',
		startsAt: `${day}T09:00`,
		endsAt: `${day}T10:00`,
		location: '',
		audience: 'everyone',
		committeeId: '',
		description: ''
	};
}

/** A saved event as the form holds it, with both times on the conference's clock. */
export function scheduleEventFormValues(
	event: ScheduleEvent,
	timezone: string
): ScheduleEventFormValues {
	return {
		eventId: event.id,
		title: event.title,
		startsAt: localDateTimeInTimezone(new Date(event.startsAt), timezone),
		endsAt: localDateTimeInTimezone(new Date(event.endsAt), timezone),
		location: event.location ?? '',
		audience: event.audience,
		committeeId: event.committeeId ?? '',
		description: event.description ?? ''
	};
}

/** Read the event form's fields from a submitted form. */
export function readScheduleEventForm(formData: FormData): ScheduleEventFormValues {
	return {
		eventId: readText(formData, 'eventId'),
		title: readText(formData, 'title'),
		startsAt: readText(formData, 'startsAt'),
		endsAt: readText(formData, 'endsAt'),
		location: readText(formData, 'location'),
		audience: readText(formData, 'audience'),
		committeeId: readText(formData, 'committeeId'),
		description: readText(formData, 'description')
	};
}

/**
 * Check a start and an end, which both forms share, and add any message to `errors`.
 *
 * Both are read as moments in the conference's timezone before they are
 * compared, which is also how a box the browser left empty or a date that does
 * not exist is caught: `instantFromLocalDateTime` answers `null` for either.
 */
function checkTimes(
	startsAt: string,
	endsAt: string,
	timezone: string,
	errors: { startsAt?: string; endsAt?: string }
): void {
	const startMoment = instantFromLocalDateTime(startsAt, timezone);
	const endMoment = instantFromLocalDateTime(endsAt, timezone);

	if (startMoment === null || endMoment === null) {
		errors.startsAt = 'Please enter a start and an end time.';
		return;
	}

	if (new Date(endMoment).getTime() <= new Date(startMoment).getTime()) {
		errors.endsAt = 'The end must be after the start.';
	}
}

/**
 * Check the event form. Every problem is collected at once, so the organiser
 * sees all of them rather than one per attempt.
 *
 * Whether the committee really belongs to this conference is not asked here,
 * because that needs the database; the action asks it after this.
 */
export function validateScheduleEventForm(
	values: ScheduleEventFormValues,
	timezone: string
): ScheduleEventFormErrors {
	const errors: ScheduleEventFormErrors = {};

	if (values.title === '') {
		errors.title = 'Please give the event a title.';
	} else if (values.title.length > EVENT_TITLE_MAX_LENGTH) {
		errors.title = `Please keep the title under ${EVENT_TITLE_MAX_LENGTH} characters.`;
	}

	checkTimes(values.startsAt, values.endsAt, timezone, errors);

	if (values.location.length > EVENT_LOCATION_MAX_LENGTH) {
		errors.location = `Please keep the location under ${EVENT_LOCATION_MAX_LENGTH} characters.`;
	}

	// The dropdown offers the four audiences and nothing else, so only a request
	// put together by hand, such as one asking for `delegation`, can get here.
	if (!isEventAudience(values.audience)) {
		errors.audience = 'Not allowed here';
	} else if (values.audience === 'committee' && values.committeeId === '') {
		errors.committeeId = 'Pick the committee.';
	}

	if (values.description.length > EVENT_DESCRIPTION_MAX_LENGTH) {
		errors.description = `Please keep the description under ${EVENT_DESCRIPTION_MAX_LENGTH} characters.`;
	}

	return errors;
}

/** Did a check find any problem at all? */
export function hasFormErrors(errors: object): boolean {
	return Object.keys(errors).length > 0;
}

/**
 * The checked form as the database takes it.
 *
 * `validateScheduleEventForm` has already refused bad times and an unknown
 * audience, so the fallbacks below never reach the database; TypeScript cannot
 * see that the check has happened. The committee is dropped for every other
 * audience, because the database insists it is set exactly for `committee`.
 */
export function toScheduleEventInput(
	values: ScheduleEventFormValues,
	timezone: string
): ScheduleEventInput {
	const audience = isEventAudience(values.audience) ? values.audience : 'everyone';

	return {
		title: values.title,
		description: values.description === '' ? null : values.description,
		location: values.location === '' ? null : values.location,
		startsAt: instantFromLocalDateTime(values.startsAt, timezone) ?? '',
		endsAt: instantFromLocalDateTime(values.endsAt, timezone) ?? '',
		audience,
		committeeId: audience === 'committee' ? values.committeeId : null
	};
}

/** Everything the "Add committee sessions" form asks for, as text. */
export type CommitteeSessionsFormValues = {
	titlePattern: string;
	/** `YYYY-MM-DD` from a date box. */
	day: string;
	/** `HH:mm` from a time box. */
	startTime: string;
	endTime: string;
	locationPattern: string;
	/** The committees that are ticked. */
	committeeIds: string[];
};

/** A message for each field of the sessions form that needs fixing. */
export type CommitteeSessionsFormErrors = {
	titlePattern?: string;
	startsAt?: string;
	endsAt?: string;
	locationPattern?: string;
	committeeIds?: string;
};

/** What the sessions form shows at first: the open day, nine to twelve, every committee ticked. */
export function newCommitteeSessionsForm(
	day: string,
	committeeIds: string[]
): CommitteeSessionsFormValues {
	return {
		titlePattern: DEFAULT_SESSION_TITLE_PATTERN,
		day,
		startTime: '09:00',
		endTime: '12:00',
		locationPattern: DEFAULT_SESSION_LOCATION_PATTERN,
		committeeIds
	};
}

/**
 * Read the sessions form. Every ticked checkbox sends its own `committeeIds`
 * field, so `getAll` gathers them into a list.
 */
export function readCommitteeSessionsForm(formData: FormData): CommitteeSessionsFormValues {
	const committeeIds = formData.getAll('committeeIds').map((value) => String(value));

	return {
		titlePattern: readText(formData, 'titlePattern'),
		day: readText(formData, 'day'),
		startTime: readText(formData, 'startTime'),
		endTime: readText(formData, 'endTime'),
		locationPattern: readText(formData, 'locationPattern'),
		committeeIds
	};
}

/** Check the sessions form, the same way `validateScheduleEventForm` checks an event. */
export function validateCommitteeSessionsForm(
	values: CommitteeSessionsFormValues,
	timezone: string
): CommitteeSessionsFormErrors {
	const errors: CommitteeSessionsFormErrors = {};

	if (values.titlePattern === '') {
		errors.titlePattern = 'Please give the event a title.';
	} else if (values.titlePattern.length > EVENT_TITLE_MAX_LENGTH) {
		errors.titlePattern = `Please keep the title under ${EVENT_TITLE_MAX_LENGTH} characters.`;
	}

	checkTimes(
		`${values.day}T${values.startTime}`,
		`${values.day}T${values.endTime}`,
		timezone,
		errors
	);

	if (values.locationPattern.length > EVENT_LOCATION_MAX_LENGTH) {
		errors.locationPattern = `Please keep the location under ${EVENT_LOCATION_MAX_LENGTH} characters.`;
	}

	if (values.committeeIds.length === 0) {
		errors.committeeIds = 'Tick at least one committee.';
	}

	return errors;
}

/** A session's title: the pattern with every `{n}` replaced by its number. */
export function sessionTitle(pattern: string, sessionNumber: number): string {
	return pattern.replaceAll('{n}', String(sessionNumber));
}

/**
 * A session's location: the pattern with every `{room}` replaced by the
 * committee's room, or "TBA" for a committee that has none. A pattern that
 * comes out empty is no location at all.
 */
export function sessionLocation(pattern: string, room: string | null): string | null {
	const location = pattern.replaceAll('{room}', room ?? ROOM_NOT_SET).trim();

	return location === '' ? null : location;
}

/**
 * The number of a committee's next session: one more than the committee events
 * it already has, so the first is "Session 1".
 */
export function nextSessionNumber(events: ScheduleEvent[], committeeId: string): number {
	const existing = events.filter(
		(event) => event.audience === 'committee' && event.committeeId === committeeId
	);

	return existing.length + 1;
}
