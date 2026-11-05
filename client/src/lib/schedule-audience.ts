/**
 * Who an event is for, in the words the organiser's schedule
 * (`/manage/[slug]/schedule`) shows in its own column beside each event.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import type { EventAudience, ScheduleEvent } from '$lib/schedule';

/** The words for each audience. A committee event names its committee instead. */
const AUDIENCE_TEXT: Record<EventAudience, string> = {
	everyone: 'Everyone',
	delegates: 'Delegates only',
	staff: 'Staff only',
	committee: 'One committee'
};

/**
 * "Everyone", "Staff only", or a committee's short name such as "UNSC" for an
 * event that is for one committee. Every event of "Add committee sessions" is
 * for one committee, so each of those names its own.
 */
export function scheduleAudienceText(
	event: Pick<ScheduleEvent, 'audience' | 'committeeAbbreviation'>
): string {
	if (event.audience === 'committee' && event.committeeAbbreviation) {
		return event.committeeAbbreviation;
	}

	return AUDIENCE_TEXT[event.audience];
}
