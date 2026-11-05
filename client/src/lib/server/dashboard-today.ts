/**
 * What the conference dashboard's Today list reads on a conference day: the
 * whole of today's programme, the events already over included.
 *
 * Files under `$lib/server` only ever run on the server.
 * `eventsOfToday` in `$lib/dashboard-today.ts` keeps the ones that start today
 * where the conference is.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { eventsOfToday, type TodayScheduleEvent } from '$lib/dashboard-today';

/** How far either side of now the programme is read: today, wherever on Earth it is. */
const TODAY_EVENT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** One row of the programme, with the committee it belongs to when it has one. */
type EventRow = {
	id: string;
	title: string;
	starts_at: string;
	ends_at: string;
	location: string | null;
	committees: { name: string; abbreviation: string | null } | null;
};

/**
 * Every event of the conference that starts today where it is, soonest first.
 *
 * The query reads a day either side of now, since which events fall on today
 * depends on the conference's timezone, which a query on `starts_at` cannot do.
 */
export async function loadTodaySchedule(
	supabase: SupabaseClient,
	conferenceId: string,
	timezone: string,
	now: Date
): Promise<TodayScheduleEvent[]> {
	const windowStart = new Date(now.getTime() - TODAY_EVENT_WINDOW_MS);
	const windowEnd = new Date(now.getTime() + TODAY_EVENT_WINDOW_MS);

	const { data, error } = await supabase
		.from('schedule_events')
		.select('id, title, starts_at, ends_at, location, committees(name, abbreviation)')
		.eq('conference_id', conferenceId)
		.gt('starts_at', windowStart.toISOString())
		.lt('starts_at', windowEnd.toISOString())
		.order('starts_at', { ascending: true })
		.order('id', { ascending: true })
		.overrideTypes<EventRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read today's schedule: ${error.message}`);
	}

	const events: TodayScheduleEvent[] = (data ?? []).map((row) => ({
		id: row.id,
		title: row.title,
		startsAt: row.starts_at,
		endsAt: row.ends_at,
		location: row.location,
		committeeName: row.committees ? (row.committees.abbreviation ?? row.committees.name) : null
	}));

	return eventsOfToday(events, now, timezone);
}
