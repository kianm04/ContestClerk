/**
 * The names of the people the conference dashboard's lines mention: a delegate
 * marked absent, the one person an unpaid invoice is for.
 *
 * Files under `$lib/server` only ever run on the server. It is a query of its
 * own because the columns that name a person (`seats.user_id`,
 * `invoices.payer_user_id`) point at `auth.users`, and PostgREST can only bring
 * along a table that a foreign key actually names, so `profiles` cannot be
 * joined in.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** The one column of `profiles` the dashboard reads. */
type ProfileNameRow = {
	id: string;
	full_name: string;
};

/**
 * The full name of each of these people, by user id. Somebody Row Level
 * Security hides, or who has no profile, is simply missing from the answer.
 */
export async function readFullNames(
	supabase: SupabaseClient,
	userIds: string[]
): Promise<Map<string, string>> {
	// An empty list would have to be written as `in.()`, which PostgREST refuses.
	if (userIds.length === 0) {
		return new Map();
	}

	const { data, error } = await supabase
		.from('profiles')
		.select('id, full_name')
		.in('id', userIds)
		.overrideTypes<ProfileNameRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the names for the dashboard: ${error.message}`);
	}

	return new Map((data ?? []).map((row) => [row.id, row.full_name]));
}
