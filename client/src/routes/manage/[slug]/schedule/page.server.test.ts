import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the five actions are
// given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import { dayInTimezone, instantFromLocalDateTime } from '$lib/dates';
// The real rules, not copies of them: renaming a field or changing a sentence
// in `$lib/schedule.ts` or `$lib/schedule-form.ts` has to fail here too.
import { dayTabLabel, type ScheduleCommittee, type ScheduleEvent } from '$lib/schedule';
import type {
	CommitteeSessionsFormErrors,
	CommitteeSessionsFormValues,
	ScheduleEventFormErrors,
	ScheduleEventFormValues
} from '$lib/schedule-form';
import { manageScheduleUrl } from '$lib/urls';
import type { Conference } from '$lib/conferences';

// The gate, the queries and the flash cookie are all stood in for, so these
// tests are about what `load` and the five actions themselves decide.
// `requirePermissionSomewhere` has its own tests in `src/lib/server/access`, and what the
// database allows is tested in `tests/db/`.
//
// `$lib/schedule` and `$lib/schedule-form` are deliberately not stood in for:
// they are pure, and running the real rules is what proves the page and the
// actions agree about which day an event falls on, which form a save refuses
// and when an audience is notified.
vi.mock('$lib/server/access', () => ({
	requirePermissionSomewhere: vi.fn(),
	requireManagePage: vi.fn()
}));

vi.mock('$lib/server/schedule', () => ({
	createCommitteeSessionEvents: vi.fn(),
	createScheduleEvent: vi.fn(),
	deleteScheduleEvent: vi.fn(),
	duplicateScheduleEvent: vi.fn(),
	getScheduleEvent: vi.fn(),
	listScheduleCommittees: vi.fn(),
	listScheduleEvents: vi.fn(),
	readSchedulePublicity: vi.fn(),
	updateSchedulePublicity: vi.fn(),
	updateScheduleEvent: vi.fn()
}));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

import { requireManagePage, requirePermissionSomewhere } from '$lib/server/access';
import {
	createCommitteeSessionEvents,
	createScheduleEvent,
	deleteScheduleEvent,
	duplicateScheduleEvent,
	getScheduleEvent,
	listScheduleCommittees,
	listScheduleEvents,
	readSchedulePublicity,
	updateSchedulePublicity,
	updateScheduleEvent
} from '$lib/server/schedule';
import { setFlash } from '$lib/server/flash';
import type { MyPermissions } from '$lib/permissions';

/** What the layout hands down for an organiser: `administrator` opens every page. */
const ADMINISTRATOR: MyPermissions = {
	held: [{ permission: 'administrator', scope: 'conference' }],
	committeeIds: [],
	rank: -1
};

/** The Supabase client. `load` and the actions only hand it on. */
const SUPABASE = {};

/** The cookie jar. Only `setFlash`, which is stood in for, ever touches it. */
const COOKIES = {};

/** The organiser `requirePermissionSomewhere` answers with. Nothing here reads them. */
const SIGNED_IN_USER = { id: 'user-1', email: 'daniel@example.com' };

/**
 * The conference every test works on.
 *
 * Its three days, 22 to 24 January 2027, are what `scheduleDays` turns into the
 * editor's tabs; Amsterdam keeps no daylight-saving offset in January, which
 * keeps every UTC-to-local conversion below a plain one-hour shift.
 */
const CONFERENCE = {
	id: '11111111-1111-1111-1111-111111111111',
	slug: 'riverside-mun-2027',
	name: 'Riverside MUN 2027',
	timezone: 'Europe/Amsterdam',
	startDate: '2027-01-22',
	endDate: '2027-01-24'
} as unknown as Conference;

/** A committee with a room, for `{room}` in a session's location. */
const COMMITTEE_UNSC: ScheduleCommittee = {
	id: 'committee-unsc',
	name: 'UN Security Council',
	abbreviation: 'UNSC',
	room: 'Room A'
};

/** A second committee, with no room set yet. */
const COMMITTEE_ECOSOC: ScheduleCommittee = {
	id: 'committee-ecosoc',
	name: 'ECOSOC',
	abbreviation: 'ECOSOC',
	room: null
};

/** An `everyone` event on the conference's first day. */
const EVENT_OPENING: ScheduleEvent = {
	id: 'event-opening',
	conferenceId: CONFERENCE.id,
	title: 'Opening Ceremony',
	description: null,
	location: 'Main Hall',
	startsAt: '2027-01-22T08:00:00.000Z',
	endsAt: '2027-01-22T09:00:00.000Z',
	audience: 'everyone',
	committeeId: null,
	committeeAbbreviation: null
};

/** A committee session, on the conference's second day. */
const EVENT_UNSC_SESSION: ScheduleEvent = {
	id: 'event-unsc-1',
	conferenceId: CONFERENCE.id,
	title: 'Session 1',
	description: null,
	location: 'Room A',
	startsAt: '2027-01-23T08:00:00.000Z',
	endsAt: '2027-01-23T11:00:00.000Z',
	audience: 'committee',
	committeeId: COMMITTEE_UNSC.id,
	committeeAbbreviation: 'UNSC'
};

/** A chair who edits the programme of the Security Council only. */
const UNSC_PROGRAMME_EDITOR: MyPermissions = {
	held: [{ permission: 'edit_schedule', scope: 'committees' }],
	committeeIds: [COMMITTEE_UNSC.id],
	rank: 3
};

/** The page every redirecting action comes back to. */
const SCHEDULE_PATH = '/manage/riverside-mun-2027/schedule';

/**
 * The moment every test pretends it is: the day before the conference opens.
 *
 * `EVENT_OPENING` starts 22 hours after this, inside the 24-hour notify window
 * `willNotifyAudience` checks; `EVENT_UNSC_SESSION` starts 46 hours after it,
 * outside that window. Holding the clock still is what makes the "audience
 * notified" wording predictable.
 */
const NOW = new Date('2027-01-21T10:00:00.000Z');

/**
 * The few pieces of a request that `load` and the actions here actually read.
 *
 * SvelteKit hands them a great many more, so the cast says "this is enough";
 * anything the code reaches for that is missing fails the test loudly.
 */
function makeEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		params: { slug: CONFERENCE.slug },
		url: new URL(`http://localhost${SCHEDULE_PATH}`),
		locals: { supabase: SUPABASE },
		cookies: COOKIES,
		...overrides
	};
}

/** That stand-in, as the `load` function's own event type. `search` carries `?day=` and the rest. */
function makeLoadEvent(
	search: string = '',
	permissions: MyPermissions = ADMINISTRATOR
): PageServerLoadEvent {
	return makeEvent({
		url: new URL(`http://localhost${SCHEDULE_PATH}${search}`),
		parent: async () => ({ conference: CONFERENCE, permissions })
	}) as unknown as PageServerLoadEvent;
}

/**
 * A post to one of the five actions.
 *
 * `search` carries what travels in the action's own address, which for
 * `duplicateToNextDay` is the event id; `fields` are the form's own fields. A
 * field given as a list, the way ticked committee checkboxes arrive, is sent as
 * one form entry per value, the way `getAll` reads them back.
 */
function makeActionEvent(
	search: string,
	fields: Record<string, string | string[]> = {}
): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		if (Array.isArray(value)) {
			for (const item of value) {
				formData.append(name, item);
			}
		} else {
			formData.set(name, value);
		}
	}

	return makeEvent({
		url: new URL(`http://localhost${SCHEDULE_PATH}${search}`),
		request: { formData: async () => formData }
	}) as unknown as RequestEvent;
}

/**
 * Run something that is expected to redirect, and give back the redirect.
 *
 * SvelteKit's `redirect` works by throwing rather than by returning, so
 * catching it is the only way to see where it was sending the reader.
 */
async function catchRedirect(run: () => unknown): Promise<{ status: number; location: string }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number; location: string };
	}

	throw new Error('Nothing was thrown, so nothing redirected.');
}

/** What an action returns when it refuses: `fail` gives back `{ status, data }`. */
type ActionResult = {
	status?: number;
	data?: {
		eventValues?: ScheduleEventFormValues | null;
		eventErrors?: ScheduleEventFormErrors;
		sessionsValues?: CommitteeSessionsFormValues | null;
		sessionsErrors?: CommitteeSessionsFormErrors;
		message?: string | null;
	};
};

/** What `load` answered, as much of it as these tests look at. */
type LoadedSchedulePage = {
	activeDay: string;
	events: ScheduleEvent[];
	dayEvents: ScheduleEvent[];
	isList: boolean;
	openEventId: string | null;
	eventForm: ScheduleEventFormValues | null;
	sessionsForm: CommitteeSessionsFormValues | null;
};

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);

	vi.mocked(requirePermissionSomewhere).mockResolvedValue({
		user: SIGNED_IN_USER,
		conference: CONFERENCE,
		permissions: ADMINISTRATOR
	});
	vi.mocked(listScheduleEvents).mockResolvedValue([EVENT_OPENING, EVENT_UNSC_SESSION]);
	vi.mocked(listScheduleCommittees).mockResolvedValue([COMMITTEE_UNSC, COMMITTEE_ECOSOC]);
	vi.mocked(readSchedulePublicity).mockResolvedValue(true);
	// Answers with whichever of the two fixture events was asked for, and `null`
	// for anything else, which is what a stale link or a stranger's id gets back.
	vi.mocked(getScheduleEvent).mockImplementation(async (_supabase, _conferenceId, eventId) => {
		if (eventId === EVENT_OPENING.id) return EVENT_OPENING;
		if (eventId === EVENT_UNSC_SESSION.id) return EVENT_UNSC_SESSION;
		return null;
	});
	vi.mocked(createScheduleEvent).mockResolvedValue('new-event-id');
	vi.mocked(updateScheduleEvent).mockResolvedValue(undefined);
	vi.mocked(deleteScheduleEvent).mockResolvedValue(undefined);
	vi.mocked(duplicateScheduleEvent).mockResolvedValue('2027-01-23T08:00:00.000Z');
	vi.mocked(createCommitteeSessionEvents).mockResolvedValue(0);
	vi.mocked(updateSchedulePublicity).mockResolvedValue(undefined);
	vi.mocked(setFlash).mockClear();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('load', () => {
	it('asks the permissions the layout read whether this page opens for the reader', async () => {
		await load(makeLoadEvent());

		expect(requireManagePage).toHaveBeenCalledWith(ADMINISTRATOR, 'schedule');
	});

	it('picks the day ?day= names', async () => {
		const result = (await load(makeLoadEvent('?day=2027-01-22'))) as LoadedSchedulePage;

		expect(result.activeDay).toBe('2027-01-22');
		expect(result.dayEvents).toEqual([EVENT_OPENING]);
		// The calendar shows every day at once, so it is handed every event.
		expect(result.events).toEqual([EVENT_OPENING, EVENT_UNSC_SESSION]);
	});

	it('opens the details of an event of this conference, and of no other', async () => {
		const open = (await load(makeLoadEvent(`?event=${EVENT_OPENING.id}`))) as LoadedSchedulePage;
		const stranger = (await load(makeLoadEvent('?event=a-strangers-event'))) as LoadedSchedulePage;

		expect(open.openEventId).toBe(EVENT_OPENING.id);
		expect(stranger.openEventId).toBeNull();
	});

	it('shows the list only when ?view=list asks for it', async () => {
		const calendar = (await load(makeLoadEvent())) as LoadedSchedulePage;
		const list = (await load(makeLoadEvent('?view=list'))) as LoadedSchedulePage;

		expect(calendar.isList).toBe(false);
		expect(list.isList).toBe(true);
	});

	it('opens the edit form for ?edit=<id>', async () => {
		const result = (await load(
			makeLoadEvent(`?edit=${EVENT_UNSC_SESSION.id}`)
		)) as LoadedSchedulePage;

		// Both moments read in Amsterdam's own clock, one hour ahead of UTC in January.
		expect(result.eventForm).toEqual({
			eventId: EVENT_UNSC_SESSION.id,
			title: 'Session 1',
			startsAt: '2027-01-23T09:00',
			endsAt: '2027-01-23T12:00',
			location: 'Room A',
			audience: 'committee',
			committeeId: COMMITTEE_UNSC.id,
			description: ''
		});
	});

	it('opens no form for an id that names no event of this conference', async () => {
		const result = (await load(
			makeLoadEvent('?edit=some-other-conferences-event')
		)) as LoadedSchedulePage;

		expect(result.eventForm).toBeNull();
	});

	it('opens the empty add-event form for ?new=1', async () => {
		const result = (await load(makeLoadEvent('?day=2027-01-22&new=1'))) as LoadedSchedulePage;

		expect(result.eventForm).toEqual({
			eventId: '',
			title: '',
			startsAt: '2027-01-22T09:00',
			endsAt: '2027-01-22T10:00',
			location: '',
			audience: 'everyone',
			committeeId: '',
			description: ''
		});
	});

	it('opens "Add committee sessions" for ?sessions=1 only when the conference has committees', async () => {
		const withCommittees = (await load(
			makeLoadEvent('?day=2027-01-22&sessions=1')
		)) as LoadedSchedulePage;

		expect(withCommittees.sessionsForm).toEqual({
			titlePattern: 'Session {n}',
			day: '2027-01-22',
			startTime: '09:00',
			endTime: '12:00',
			locationPattern: '{room}',
			committeeIds: [COMMITTEE_UNSC.id, COMMITTEE_ECOSOC.id]
		});

		vi.mocked(listScheduleCommittees).mockResolvedValue([]);

		const withoutCommittees = (await load(
			makeLoadEvent('?day=2027-01-22&sessions=1')
		)) as LoadedSchedulePage;

		// Nothing to tick, so the button that opens this form is not even shown;
		// a stale link to it should not open an empty, useless form either.
		expect(withoutCommittees.sessionsForm).toBeNull();
	});
});

describe('the saveEvent action', () => {
	/** The fields the event form sends for a brand new event. */
	const NEW_EVENT_FIELDS = {
		eventId: '',
		title: 'Delegate Social',
		startsAt: '2027-01-24T18:00',
		endsAt: '2027-01-24T20:00',
		location: 'Rooftop Terrace',
		audience: 'everyone',
		committeeId: '',
		description: ''
	};

	it('refuses a form typed wrongly with fail(400), keeping what was typed', async () => {
		const fields = { ...NEW_EVENT_FIELDS, title: '' };

		const result = (await actions.saveEvent(
			makeActionEvent('?/saveEvent', fields)
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.eventValues).toEqual(fields);
		expect(result.data?.eventErrors?.title).toBeTruthy();
		expect(createScheduleEvent).not.toHaveBeenCalled();
	});

	it('refuses an eventId that is not one of this conference’s events', async () => {
		const fields = { ...NEW_EVENT_FIELDS, eventId: 'some-other-conferences-event' };

		const result = (await actions.saveEvent(
			makeActionEvent('?/saveEvent', fields)
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('That event is not part of this conference.');
		expect(updateScheduleEvent).not.toHaveBeenCalled();
		expect(createScheduleEvent).not.toHaveBeenCalled();
	});

	it('answers 404 for a committee that is not one of this conference’s', async () => {
		const fields = {
			...NEW_EVENT_FIELDS,
			audience: 'committee',
			committeeId: 'a-strangers-committee'
		};
		const event = makeActionEvent('?/saveEvent', fields);

		await expect(actions.saveEvent(event)).rejects.toMatchObject({ status: 404 });
		expect(createScheduleEvent).not.toHaveBeenCalled();
	});

	it('creates a new event and flashes "Event saved."', async () => {
		const event = makeActionEvent('?/saveEvent', NEW_EVENT_FIELDS);

		const redirect = await catchRedirect(() => actions.saveEvent(event));

		const expectedStartsAt =
			instantFromLocalDateTime('2027-01-24T18:00', CONFERENCE.timezone) ?? '';
		const expectedEndsAt = instantFromLocalDateTime('2027-01-24T20:00', CONFERENCE.timezone) ?? '';

		expect(createScheduleEvent).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, {
			title: 'Delegate Social',
			description: null,
			location: 'Rooftop Terrace',
			startsAt: expectedStartsAt,
			endsAt: expectedEndsAt,
			audience: 'everyone',
			committeeId: null
		});
		expect(setFlash).toHaveBeenCalledWith(COOKIES, { tone: 'success', message: 'Event saved.' });
		expect(redirect.location).toBe(
			manageScheduleUrl(CONFERENCE.slug, {
				day: dayInTimezone(new Date(expectedStartsAt), CONFERENCE.timezone)
			})
		);
		expect(requirePermissionSomewhere).toHaveBeenCalled();
	});

	it('updates an event within the notify window, and flashes that its audience was told', async () => {
		const fields = {
			eventId: EVENT_OPENING.id,
			title: EVENT_OPENING.title,
			startsAt: '2027-01-22T09:00',
			endsAt: '2027-01-22T10:00',
			location: 'Changed Hall',
			audience: 'everyone',
			committeeId: '',
			description: ''
		};

		const redirect = await catchRedirect(() =>
			actions.saveEvent(makeActionEvent('?/saveEvent', fields))
		);

		expect(updateScheduleEvent).toHaveBeenCalledWith(
			SUPABASE,
			EVENT_OPENING.id,
			expect.objectContaining({ location: 'Changed Hall' })
		);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Event saved. Its audience has been notified.'
		});
		expect(redirect.location).toBe(manageScheduleUrl(CONFERENCE.slug, { day: '2027-01-22' }));
	});
});

describe('the duplicateToNextDay action', () => {
	it('reads the event out of the address and copies it a day on', async () => {
		const event = makeActionEvent(`?/duplicateToNextDay&eventId=${EVENT_OPENING.id}`);

		const redirect = await catchRedirect(() => actions.duplicateToNextDay(event));

		expect(getScheduleEvent).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, EVENT_OPENING.id);
		expect(duplicateScheduleEvent).toHaveBeenCalledWith(
			SUPABASE,
			EVENT_OPENING,
			CONFERENCE.timezone,
			1
		);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: `Copied to ${dayTabLabel('2027-01-23')}.`
		});
		expect(redirect.location).toBe(manageScheduleUrl(CONFERENCE.slug, { day: '2027-01-23' }));
		expect(requirePermissionSomewhere).toHaveBeenCalled();
	});

	it('refuses an eventId that is not one of this conference’s events', async () => {
		const event = makeActionEvent('?/duplicateToNextDay&eventId=a-strangers-event');

		const result = (await actions.duplicateToNextDay(event)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('That event is not part of this conference.');
		expect(duplicateScheduleEvent).not.toHaveBeenCalled();
	});

	it('keeps the organiser on the list when the press came from it', async () => {
		const event = makeActionEvent(`?/duplicateToNextDay&eventId=${EVENT_OPENING.id}&view=list`);

		const redirect = await catchRedirect(() => actions.duplicateToNextDay(event));

		expect(redirect.location).toBe(
			manageScheduleUrl(CONFERENCE.slug, { day: '2027-01-23', isList: true })
		);
	});
});

describe('the deleteEvent action', () => {
	it('refuses to delete without ConfirmButton’s confirm=1', async () => {
		const event = makeActionEvent('?/deleteEvent', { eventId: EVENT_OPENING.id });

		const result = (await actions.deleteEvent(event)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('Please confirm before deleting an event.');
		expect(deleteScheduleEvent).not.toHaveBeenCalled();
	});

	it('deletes a confirmed event and flashes "Event deleted."', async () => {
		const event = makeActionEvent('?/deleteEvent', { eventId: EVENT_OPENING.id, confirm: '1' });

		const redirect = await catchRedirect(() => actions.deleteEvent(event));

		expect(deleteScheduleEvent).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, EVENT_OPENING.id);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, { tone: 'success', message: 'Event deleted.' });
		expect(redirect.location).toBe(manageScheduleUrl(CONFERENCE.slug, { day: '2027-01-22' }));
		expect(requirePermissionSomewhere).toHaveBeenCalled();
	});

	it('keeps the organiser on the list when the press came from it', async () => {
		const event = makeActionEvent('?/deleteEvent&view=list', {
			eventId: EVENT_OPENING.id,
			confirm: '1'
		});

		const redirect = await catchRedirect(() => actions.deleteEvent(event));

		expect(redirect.location).toBe(
			manageScheduleUrl(CONFERENCE.slug, { day: '2027-01-22', isList: true })
		);
	});
});

describe('the addCommitteeSessions action', () => {
	/** The fields the sessions form sends, with no committee ticked. */
	const BASE_FIELDS = {
		titlePattern: 'Session {n}',
		day: '2027-01-23',
		startTime: '09:00',
		endTime: '12:00',
		locationPattern: '{room}'
	};

	it('refuses "Tick at least one committee." when nothing is ticked', async () => {
		const event = makeActionEvent('?/addCommitteeSessions', { ...BASE_FIELDS, committeeIds: [] });

		const result = (await actions.addCommitteeSessions(event)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.sessionsErrors?.committeeIds).toBe('Tick at least one committee.');
		expect(createCommitteeSessionEvents).not.toHaveBeenCalled();
	});

	it('adds one session for every ticked committee, and flashes "2 sessions added."', async () => {
		vi.mocked(createCommitteeSessionEvents).mockResolvedValue(2);

		const event = makeActionEvent('?/addCommitteeSessions', {
			...BASE_FIELDS,
			committeeIds: [COMMITTEE_UNSC.id, COMMITTEE_ECOSOC.id]
		});

		const redirect = await catchRedirect(() => actions.addCommitteeSessions(event));

		const expectedStartsAt =
			instantFromLocalDateTime('2027-01-23T09:00', CONFERENCE.timezone) ?? '';
		const expectedEndsAt = instantFromLocalDateTime('2027-01-23T12:00', CONFERENCE.timezone) ?? '';

		expect(createCommitteeSessionEvents).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, {
			titlePattern: 'Session {n}',
			locationPattern: '{room}',
			startsAt: expectedStartsAt,
			endsAt: expectedEndsAt,
			committees: [COMMITTEE_UNSC, COMMITTEE_ECOSOC]
		});
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: '2 sessions added.'
		});
		expect(redirect.location).toBe(manageScheduleUrl(CONFERENCE.slug, { day: '2027-01-23' }));
		expect(requirePermissionSomewhere).toHaveBeenCalled();
	});

	it('says "1 session added." for exactly one', async () => {
		vi.mocked(createCommitteeSessionEvents).mockResolvedValue(1);

		const event = makeActionEvent('?/addCommitteeSessions', {
			...BASE_FIELDS,
			committeeIds: [COMMITTEE_UNSC.id]
		});

		await catchRedirect(() => actions.addCommitteeSessions(event));

		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: '1 session added.'
		});
	});
});

describe('the saveVisibility action', () => {
	it('saves true for a ticked box, and flashes "Saved."', async () => {
		const event = makeActionEvent('?/saveVisibility', { showSchedulePublicly: 'on' });

		const redirect = await catchRedirect(() => actions.saveVisibility(event));

		expect(updateSchedulePublicity).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, true);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, { tone: 'success', message: 'Saved.' });
		expect(redirect.location).toBe(manageScheduleUrl(CONFERENCE.slug));
		expect(requirePermissionSomewhere).toHaveBeenCalled();
	});

	it('saves false when the unticked box sends nothing at all', async () => {
		const event = makeActionEvent('?/saveVisibility', {});

		await catchRedirect(() => actions.saveVisibility(event));

		expect(updateSchedulePublicity).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, false);
	});
});

describe('somebody who edits the programme of one committee', () => {
	beforeEach(() => {
		vi.mocked(requirePermissionSomewhere).mockResolvedValue({
			user: SIGNED_IN_USER,
			conference: CONFERENCE,
			permissions: UNSC_PROGRAMME_EDITOR
		});
	});

	/** A session for one committee, as the event form sends it. */
	function sessionFields(committeeId: string) {
		return {
			eventId: '',
			title: 'Session 2',
			startsAt: '2027-01-23T14:00',
			endsAt: '2027-01-23T17:00',
			location: 'Room A',
			audience: 'committee',
			committeeId,
			description: ''
		};
	}

	it('sees the whole programme but may change only their committee’s events', async () => {
		const data = (await load(
			makeLoadEvent('?new=1', UNSC_PROGRAMME_EDITOR)
		)) as unknown as LoadedSchedulePage & {
			committees: ScheduleCommittee[];
			readOnlyIds: string[];
			canEditWholeProgramme: boolean;
		};

		expect(data.events).toHaveLength(2);
		expect(data.readOnlyIds).toEqual([EVENT_OPENING.id]);
		expect(data.committees).toEqual([COMMITTEE_UNSC]);
		expect(data.canEditWholeProgramme).toBe(false);
		expect(data.eventForm).toMatchObject({ audience: 'committee' });
	});

	it('opens no form for an event they may not change', async () => {
		const data = (await load(
			makeLoadEvent(`?edit=${EVENT_OPENING.id}`, UNSC_PROGRAMME_EDITOR)
		)) as unknown as LoadedSchedulePage;

		expect(data.eventForm).toBeNull();
	});

	it('adds a session for their committee', async () => {
		await catchRedirect(() =>
			actions.saveEvent(makeActionEvent('?/saveEvent', sessionFields(COMMITTEE_UNSC.id)))
		);

		expect(createScheduleEvent).toHaveBeenCalled();
	});

	it('answers 404 to an event for another committee or for everyone', async () => {
		const forEcosoc = makeActionEvent('?/saveEvent', sessionFields(COMMITTEE_ECOSOC.id));
		const forEveryone = makeActionEvent('?/saveEvent', {
			...sessionFields(''),
			audience: 'everyone'
		});

		await expect(actions.saveEvent(forEcosoc)).rejects.toMatchObject({ status: 404 });
		await expect(actions.saveEvent(forEveryone)).rejects.toMatchObject({ status: 404 });
		expect(createScheduleEvent).not.toHaveBeenCalled();
	});

	it('answers 404 to moving their session to everyone', async () => {
		const moved = makeActionEvent('?/saveEvent', {
			...sessionFields(''),
			eventId: EVENT_UNSC_SESSION.id,
			audience: 'everyone'
		});

		await expect(actions.saveEvent(moved)).rejects.toMatchObject({ status: 404 });
		expect(updateScheduleEvent).not.toHaveBeenCalled();
	});

	it('answers 404 to deleting or copying an event for everyone', async () => {
		const deleting = makeActionEvent('?/deleteEvent', {
			eventId: EVENT_OPENING.id,
			confirm: '1'
		});
		const copying = makeActionEvent(`?/duplicateToNextDay&eventId=${EVENT_OPENING.id}`);

		await expect(actions.deleteEvent(deleting)).rejects.toMatchObject({ status: 404 });
		await expect(actions.duplicateToNextDay(copying)).rejects.toMatchObject({ status: 404 });
		expect(deleteScheduleEvent).not.toHaveBeenCalled();
		expect(duplicateScheduleEvent).not.toHaveBeenCalled();
	});

	it('answers 404 to sessions for a committee that is not theirs, and to publicity', async () => {
		const sessions = makeActionEvent('?/addCommitteeSessions', {
			day: '2027-01-23',
			startTime: '09:00',
			endTime: '12:00',
			titlePattern: 'Session 1',
			locationPattern: '{room}',
			committeeIds: [COMMITTEE_UNSC.id, COMMITTEE_ECOSOC.id]
		});
		const publicity = makeActionEvent('?/saveVisibility', { showSchedulePublicly: 'on' });

		await expect(actions.addCommitteeSessions(sessions)).rejects.toMatchObject({ status: 404 });
		await expect(actions.saveVisibility(publicity)).rejects.toMatchObject({ status: 404 });
		expect(createCommitteeSessionEvents).not.toHaveBeenCalled();
		expect(updateSchedulePublicity).not.toHaveBeenCalled();
	});
});
