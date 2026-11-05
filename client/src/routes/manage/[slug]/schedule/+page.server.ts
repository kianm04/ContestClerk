import { error, fail, redirect } from '@sveltejs/kit';
import type { Conference } from '$lib/conferences';
import { dayInTimezone, instantFromLocalDateTime } from '$lib/dates';
import {
	dayTabLabel,
	eventsOnDay,
	pickScheduleDay,
	scheduleDays,
	willNotifyAudience
} from '$lib/schedule';
import {
	hasFormErrors,
	newCommitteeSessionsForm,
	newScheduleEventForm,
	readCommitteeSessionsForm,
	readScheduleEventForm,
	scheduleEventFormValues,
	toScheduleEventInput,
	validateCommitteeSessionsForm,
	validateScheduleEventForm,
	type CommitteeSessionsFormErrors,
	type CommitteeSessionsFormValues,
	type ScheduleEventFormErrors,
	type ScheduleEventFormValues
} from '$lib/schedule-form';
import { isListView } from '$lib/schedule-calendar';
import { hasPermission, type MyPermissions } from '$lib/permissions';
import { committeesPermitting, mayAddress, type Addressed } from '$lib/programme-access';
import { manageScheduleUrl } from '$lib/urls';
import { requireManagePage, requirePermissionSomewhere } from '$lib/server/access';
import { setFlash } from '$lib/server/flash';
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
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/**
 * What every action on this page answers with when it refuses.
 *
 * One shape for all five, so `+page.svelte` has a single thing to read. Each
 * pair of `values` is `null` whenever the refusal was not about that form.
 */
type SchedulePageResult = {
	/** What was typed into the event form, or null when the refusal was not about it. */
	eventValues: ScheduleEventFormValues | null;
	eventErrors: ScheduleEventFormErrors;
	/** The same pair for "Add committee sessions". */
	sessionsValues: CommitteeSessionsFormValues | null;
	sessionsErrors: CommitteeSessionsFormErrors;
	/** A problem with the whole page rather than one field, shown in a `Notice`. */
	message: string | null;
};

/** What every "that event is not here" refusal says. */
const NO_SUCH_EVENT = 'That event is not part of this conference.';

/**
 * The gate, asked again at the top of every action: `edit_schedule`,
 * conference-wide or in some committee. It also answers what the reader
 * holds, because which events they may change depends on it.
 *
 * A form action is its own request and nothing `load` worked out reaches it, so
 * the check is made here rather than trusted from whenever the page was drawn.
 */
async function requireConference(
	event: RequestEvent
): Promise<{ conference: Conference; permissions: MyPermissions }> {
	const { conference, permissions } = await requirePermissionSomewhere(
		event.locals,
		event.url,
		event.params.slug,
		'edit_schedule'
	);

	return { conference, permissions };
}

/**
 * A 404 unless the reader may change an event for this audience: anything
 * with `edit_schedule` conference-wide, their own committees' events with it
 * per committee. The page draws no form or menu for any other, so only a
 * request put together by hand reaches the 404.
 */
function requireEditable(addressed: Addressed, permissions: MyPermissions): void {
	if (!mayAddress(permissions, addressed, 'edit_schedule')) {
		error(404, NO_SUCH_EVENT);
	}
}

/** Refuse with a message about the whole page, leaving both forms as they were. */
function refuse(message: string) {
	return fail(400, {
		eventValues: null,
		eventErrors: {},
		sessionsValues: null,
		sessionsErrors: {},
		message
	} satisfies SchedulePageResult);
}

/**
 * Refuse an event that was typed wrongly. `fail` sends the page back with this
 * result as `form`, so every field keeps what was typed and shows its message.
 */
function refuseEventForm(values: ScheduleEventFormValues, errors: ScheduleEventFormErrors) {
	return fail(400, {
		eventValues: values,
		eventErrors: errors,
		sessionsValues: null,
		sessionsErrors: {},
		message: null
	} satisfies SchedulePageResult);
}

/** The same for "Add committee sessions". */
function refuseSessionsForm(
	values: CommitteeSessionsFormValues,
	errors: CommitteeSessionsFormErrors
) {
	return fail(400, {
		eventValues: null,
		eventErrors: {},
		sessionsValues: values,
		sessionsErrors: errors,
		message: null
	} satisfies SchedulePageResult);
}

/** The editor opened on the day a moment falls on, in the conference's timezone. */
function scheduleDayUrl(slug: string, moment: string, timezone: string, isList = false) {
	return manageScheduleUrl(slug, { day: dayInTimezone(new Date(moment), timezone), isList });
}

/**
 * Whether a press came from the list rather than the calendar. A list row adds
 * `&view=list` to its form's address, so the answer keeps the organiser on the
 * list instead of dropping them back on the calendar.
 */
function isPressedOnList(event: RequestEvent): boolean {
	return isListView(event.url.searchParams.get('view'));
}

/**
 * A committee an event names has to be one of this conference's, and one the
 * reader may write the programme of.
 *
 * The database's `check_schedule_event_scope` and its policies refuse any
 * other as well, but only with an error; asking first answers with the 404 the
 * spec asks for, because only a request put together by hand can name a
 * stranger's committee.
 */
async function requireOwnCommittees(
	event: RequestEvent,
	conferenceId: string,
	committeeIds: string[],
	permissions: MyPermissions
) {
	const committees = committeesPermitting(
		permissions,
		await listScheduleCommittees(event.locals.supabase, conferenceId),
		'edit_schedule'
	);
	const named = committees.filter((committee) => committeeIds.includes(committee.id));

	if (named.length !== new Set(committeeIds).size) {
		error(404, 'That committee is not part of this conference.');
	}

	return named;
}

/**
 * Everything the editor draws, on top of what the layout above it has already read.
 *
 * `parent()` is a promise for what the layout's own `load` returned. The layout
 * let in anybody whose permissions open some page of this conference, and
 * handed those permissions down; the first lines below answer a 404 unless they
 * open this one.
 *
 * What is shown is read from the address: the day a phone or the list shows
 * (`?day=`), the list rather than the calendar (`?view=list`), an event's
 * details (`?event=<event id>`), and which form is open (`?edit=<event id>`,
 * `?new=1`, `?sessions=1`). `load` runs again whenever the address changes, so
 * every day, every event and every "Edit" is an ordinary link.
 */
export const load: PageServerLoad = async ({ parent, url, locals }) => {
	const { conference, permissions } = await parent();
	// A 404 unless the reader's permissions open this page, by the table in
	// `$lib/manage-pages.ts`.
	requireManagePage(permissions, 'schedule');
	const timezone = conference.timezone;

	// None of the three queries needs another's answer, so they run side by side.
	const [events, allCommittees, isSchedulePublic] = await Promise.all([
		listScheduleEvents(locals.supabase, conference.id),
		listScheduleCommittees(locals.supabase, conference.id),
		readSchedulePublicity(locals.supabase, conference.id)
	]);

	// Somebody who edits the programme of their own committees only is offered
	// those committees, starts a new event on the first of them, and sees the
	// rest of the programme without the means to change it.
	const canEditWholeProgramme = hasPermission(permissions, 'edit_schedule');
	const committees = committeesPermitting(permissions, allCommittees, 'edit_schedule');
	const readOnlyIds = events
		.filter((scheduleEvent) => !mayAddress(permissions, scheduleEvent, 'edit_schedule'))
		.map((scheduleEvent) => scheduleEvent.id);

	const days = scheduleDays(conference.startDate, conference.endDate, events, timezone);
	// One moment for the whole page, so the line marking now and the greyed events agree.
	const now = new Date();
	const today = dayInTimezone(now, timezone);
	const activeDay = pickScheduleDay(
		url.searchParams.get('day'),
		days,
		today,
		conference.startDate,
		conference.endDate
	);

	// An id that is not one of this conference's events opens no details and no form,
	// so a stale "Edit" link shows the day rather than a page that will not open.
	const openEventId = url.searchParams.get('event');
	const isEventOpen = events.some((scheduleEvent) => scheduleEvent.id === openEventId);
	const editEventId = url.searchParams.get('edit');
	const eventBeingEdited = events.find(
		(scheduleEvent) => scheduleEvent.id === editEventId && !readOnlyIds.includes(scheduleEvent.id)
	);
	const isAddingEvent = url.searchParams.get('new') === '1';
	const isAddingSessions = url.searchParams.get('sessions') === '1' && committees.length > 0;

	let eventForm: ScheduleEventFormValues | null = null;

	if (eventBeingEdited) {
		eventForm = scheduleEventFormValues(eventBeingEdited, timezone);
	} else if (isAddingEvent && canEditWholeProgramme) {
		eventForm = newScheduleEventForm(activeDay);
	} else if (isAddingEvent && committees.length > 0) {
		eventForm = { ...newScheduleEventForm(activeDay), audience: 'committee' };
	}

	// Every committee starts ticked, because a session for all of them is what
	// the button is for.
	const allCommitteeIds = committees.map((committee) => committee.id);
	const sessionsForm = isAddingSessions
		? newCommitteeSessionsForm(activeDay, allCommitteeIds)
		: null;

	return {
		days,
		/** The day a phone or the list shows; a desktop's calendar shows every day. */
		activeDay,
		today,
		now,
		/** Every event of the conference, earliest first, for the calendar. */
		events,
		/** The events of the open day only, earliest first, for the list. */
		dayEvents: eventsOnDay(events, activeDay, timezone),
		/** True when `?view=list` asks for the list rather than the calendar. */
		isList: isListView(url.searchParams.get('view')),
		/** The event whose details are open, from `?event=`, or `null`. */
		openEventId: isEventOpen ? openEventId : null,
		/** The committees the reader may add events for: every one, or their own. */
		committees,
		/** May the reader add events for everyone and choose whether the programme is public? */
		canEditWholeProgramme,
		/** The events the reader sees but may not change, which show no actions. */
		readOnlyIds,
		isSchedulePublic,
		/** What the event form shows, or null while it is closed. */
		eventForm,
		/** What "Add committee sessions" shows, or null while it is closed. */
		sessionsForm
	};
};

export const actions: Actions = {
	/** Add an event, or save the one the hidden `eventId` names. */
	saveEvent: async (event) => {
		const { conference, permissions } = await requireConference(event);
		const timezone = conference.timezone;

		const values = readScheduleEventForm(await event.request.formData());

		// Read before the checks, so a save of somebody else's event is refused
		// whatever else is wrong with it. An empty id is a new event.
		const existing =
			values.eventId === ''
				? null
				: await getScheduleEvent(event.locals.supabase, conference.id, values.eventId);

		if (values.eventId !== '' && existing === null) {
			return refuse(NO_SUCH_EVENT);
		}

		if (existing) {
			requireEditable(existing, permissions);
		}

		const errors = validateScheduleEventForm(values, timezone);

		if (hasFormErrors(errors)) {
			return refuseEventForm(values, errors);
		}

		const input = toScheduleEventInput(values, timezone);

		if (input.committeeId !== null) {
			await requireOwnCommittees(event, conference.id, [input.committeeId], permissions);
		}

		// The event as it will be saved has to be one the reader may write too,
		// so a chair cannot move their committee's session to everyone.
		requireEditable(input, permissions);

		// Worked out before the save, while `now` is still the moment the
		// database's `notify_schedule_changed` trigger will judge it by.
		let hasNotified = false;

		if (existing) {
			hasNotified = willNotifyAudience(existing, input, new Date());
			await updateScheduleEvent(event.locals.supabase, existing.id, input);
		} else {
			await createScheduleEvent(event.locals.supabase, conference.id, input);
		}

		const message = hasNotified ? 'Event saved. Its audience has been notified.' : 'Event saved.';

		// A redirecting action cannot return anything, so the message travels in a
		// one-shot cookie that the root layout reads and throws away.
		setFlash(event.cookies, { tone: 'success', message });
		redirect(303, scheduleDayUrl(event.params.slug, input.startsAt, timezone));
	},

	/**
	 * Copy one event to the same time on the next day.
	 *
	 * The event travels in the action's own address, `?/duplicateToNextDay&eventId=…`,
	 * because the row's menu is one small form shared by every line in it and so
	 * cannot carry a field for each.
	 */
	duplicateToNextDay: async (event) => {
		const { conference, permissions } = await requireConference(event);
		const eventId = event.url.searchParams.get('eventId') ?? '';

		const original = await getScheduleEvent(event.locals.supabase, conference.id, eventId);

		if (!original) {
			return refuse(NO_SUCH_EVENT);
		}

		requireEditable(original, permissions);

		const copyStartsAt = await duplicateScheduleEvent(
			event.locals.supabase,
			original,
			conference.timezone,
			1
		);
		const copyDay = dayInTimezone(new Date(copyStartsAt), conference.timezone);

		setFlash(event.cookies, { tone: 'success', message: `Copied to ${dayTabLabel(copyDay)}.` });
		redirect(
			303,
			manageScheduleUrl(event.params.slug, { day: copyDay, isList: isPressedOnList(event) })
		);
	},

	/** Delete one event, once `ConfirmButton` has asked. */
	deleteEvent: async (event) => {
		const { conference, permissions } = await requireConference(event);

		const formData = await event.request.formData();
		const eventId = String(formData.get('eventId') ?? '');

		// `ConfirmButton` always sends `confirm=1`, so only a hand-made request lacks it.
		if (formData.get('confirm') !== '1') {
			return refuse('Please confirm before deleting an event.');
		}

		const doomed = await getScheduleEvent(event.locals.supabase, conference.id, eventId);

		if (!doomed) {
			return refuse(NO_SUCH_EVENT);
		}

		requireEditable(doomed, permissions);

		await deleteScheduleEvent(event.locals.supabase, conference.id, doomed.id);

		setFlash(event.cookies, { tone: 'success', message: 'Event deleted.' });
		redirect(
			303,
			scheduleDayUrl(
				event.params.slug,
				doomed.startsAt,
				conference.timezone,
				isPressedOnList(event)
			)
		);
	},

	/** Add one session for each ticked committee, all at the same time. */
	addCommitteeSessions: async (event) => {
		const { conference, permissions } = await requireConference(event);
		const timezone = conference.timezone;

		const values = readCommitteeSessionsForm(await event.request.formData());
		const errors = validateCommitteeSessionsForm(values, timezone);

		if (hasFormErrors(errors)) {
			return refuseSessionsForm(values, errors);
		}

		const committees = await requireOwnCommittees(
			event,
			conference.id,
			values.committeeIds,
			permissions
		);

		// Both times have just been checked, so neither `?? ''` is ever used.
		const startsAt = instantFromLocalDateTime(`${values.day}T${values.startTime}`, timezone) ?? '';
		const endsAt = instantFromLocalDateTime(`${values.day}T${values.endTime}`, timezone) ?? '';

		const addedCount = await createCommitteeSessionEvents(event.locals.supabase, conference.id, {
			titlePattern: values.titlePattern,
			locationPattern: values.locationPattern,
			startsAt,
			endsAt,
			committees
		});

		const message = addedCount === 1 ? '1 session added.' : `${addedCount} sessions added.`;

		setFlash(event.cookies, { tone: 'success', message });
		redirect(303, manageScheduleUrl(event.params.slug, { day: values.day }));
	},

	/** Tick or untick "Show programme publicly". */
	saveVisibility: async (event) => {
		const { conference, permissions } = await requireConference(event);

		// Whether the programme is public is the whole programme's question, so
		// it asks `edit_schedule` conference-wide, as `set_schedule_publicity` does.
		if (!hasPermission(permissions, 'edit_schedule')) {
			error(404, 'Not found.');
		}

		// A ticked checkbox sends "on"; an unticked one sends nothing at all.
		const formData = await event.request.formData();
		const isPublic = formData.get('showSchedulePublicly') === 'on';

		await updateSchedulePublicity(event.locals.supabase, conference.id, isPublic);

		setFlash(event.cookies, { tone: 'success', message: 'Saved.' });
		redirect(303, manageScheduleUrl(event.params.slug));
	}
};
