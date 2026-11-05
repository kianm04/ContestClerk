import { error, redirect } from '@sveltejs/kit';
import { dayInTimezone } from '$lib/dates';
import type { TodayConference } from '$lib/home-today';
import {
	eventsForAudience,
	NO_MEMBERSHIP,
	pickScheduleDay,
	scheduleDays,
	type AudienceMembership,
	type ScheduleEvent
} from '$lib/schedule';
import { isListView } from '$lib/schedule-calendar';
import { eventRoomLinks, yourRoomLinks, type ScheduleRoom } from '$lib/schedule-rooms';
import { getConferenceBySlug } from '$lib/server/conferences';
import { listMyConferences } from '$lib/server/my-conferences';
import {
	listPublicProgramme,
	listScheduleEvents,
	readMyMembership,
	readSchedulePublicity
} from '$lib/server/schedule';
import { readMyRooms } from '$lib/server/schedule-rooms';
import { loginUrl } from '$lib/urls';
import type { PageServerLoad } from './$types';

/** Is this person part of the conference at all: organiser, delegate or staff? */
function isMember(membership: AudienceMembership): boolean {
	return membership.isOrganiser || membership.isParticipant || membership.isStaff;
}

/**
 * Runs on the server before one conference's programme is drawn, and again
 * whenever the address changes: a day picked on a phone (`?day=`), the list
 * chosen over the calendar (`?view=list`), or an event's details opened
 * (`?event=`).
 *
 * Who may look is `05-pages/delegate/schedule.md`'s rule: anybody taking part
 * or on the staff sees the events meant for them; a visitor sees the `everyone`
 * events only while the organisers have made the programme public. Anybody else
 * is asked to sign in, or told the page is not there once they have.
 */
export const load: PageServerLoad = async ({ params, url, locals }) => {
	const conference = await getConferenceBySlug(locals.supabase, params.slug);

	if (!conference) {
		error(404, 'This conference does not exist.');
	}

	const claims = await locals.getVerifiedClaims();
	const userId = claims ? String(claims.sub) : null;

	// How the reader is part of the conference, the committees they chair or sit
	// in anywhere, for the "Your room" links (T171), and every conference of
	// theirs, for the "Switch conference" menu. No read needs another, so all
	// three are sent at once; a visitor has none of them.
	const [membership, everyRoom, myConferences]: [
		AudienceMembership,
		ScheduleRoom[],
		TodayConference[]
	] = userId
		? await Promise.all([
				readMyMembership(locals.supabase, conference.id, userId),
				readMyRooms(locals.supabase, userId),
				listMyConferences(locals.supabase, userId)
			])
		: [NO_MEMBERSHIP, [], []];
	const rooms = everyRoom.filter((room) => room.conference.id === conference.id);

	let events: ScheduleEvent[];

	if (isMember(membership)) {
		const everyEvent = await listScheduleEvents(locals.supabase, conference.id);
		events = eventsForAudience(everyEvent, membership);
	} else if (await readSchedulePublicity(locals.supabase, conference.id)) {
		events = await listPublicProgramme(locals.supabase, conference.id);
	} else if (userId === null) {
		redirect(303, loginUrl(url.pathname + url.search));
	} else {
		error(404, 'This page does not exist.');
	}

	const timezone = conference.timezone;
	const days = scheduleDays(conference.startDate, conference.endDate, events, timezone);

	// One moment for the whole page, so the line marking now, the greyed events and today's column agree.
	const now = new Date();
	const today = dayInTimezone(now, timezone);
	const activeDay = pickScheduleDay(
		url.searchParams.get('day'),
		days,
		today,
		conference.startDate,
		conference.endDate
	);

	// An event's details are open only for an event this reader can see.
	const requestedEventId = url.searchParams.get('event');
	const openEventId = events.some((event) => event.id === requestedEventId)
		? requestedEventId
		: null;

	return {
		conference: {
			name: conference.name,
			slug: conference.slug,
			timezone,
			startDate: conference.startDate,
			endDate: conference.endDate
		},
		days,
		/** The day a phone shows; a desktop shows every day side by side. */
		activeDay,
		/** Today in the conference's timezone, whose column says "Today". */
		today,
		/** Every event the reader may see, earliest first. */
		events,
		/** True when `?view=list` asks for the list rather than the calendar. */
		isList: isListView(url.searchParams.get('view')),
		/** The event whose details are open, from `?event=`, or `null`. */
		openEventId,
		/** "Your room" lines, only while the conference is on today. */
		yourRooms: yourRoomLinks(rooms, today, now),
		/** The room each committee event links to, by event id. */
		eventRoomLinks: eventRoomLinks(events, rooms, now),
		hasEvents: events.length > 0,
		/** Staff and organisers see an audience badge on every event. */
		showsEveryAudience: membership.isStaff || membership.isOrganiser,
		/** Every conference the reader is part of, this one included, for "Switch conference". */
		myConferences: myConferences.map((myConference) => ({
			id: myConference.id,
			slug: myConference.slug,
			name: myConference.name,
			startDate: myConference.startDate,
			endDate: myConference.endDate,
			timezone: myConference.timezone
		})),
		now
	};
};
