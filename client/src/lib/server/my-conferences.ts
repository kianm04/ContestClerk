/**
 * The conferences the signed-in reader is part of, for the top bar's
 * "Schedule" (`/schedule` sends the reader on to one of them) and for the
 * "Switch conference" menu on a conference's schedule.
 *
 * Files under `$lib/server` only ever run on the server.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Conference } from '$lib/conferences';
import { listConferencesByIds } from './conferences';
import { readMyMemberships } from './schedule';

/**
 * Every conference the reader holds a seat in, belongs to a delegation of, is
 * on the staff of or chairs a committee of, soonest first, whatever its status.
 */
export async function listMyConferences(
	supabase: SupabaseClient,
	userId: string
): Promise<Conference[]> {
	const memberships = await readMyMemberships(supabase, userId);
	const conferenceIds = [...memberships.keys()];

	return listConferencesByIds(supabase, conferenceIds);
}
