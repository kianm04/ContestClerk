/**
 * Reading people's private details for the team's pages and exports
 * (`docs/roles-and-permissions.md`, section 5).
 *
 * The team does not read `profile_details` itself. It reads two views:
 * `staff_contact_details` (email and phone) for whoever holds
 * `read_contact_details`, and `staff_welfare_details` (date of birth, dietary
 * requirements, emergency contact) for whoever holds `read_welfare_details`.
 * Each answers only for the people taking part where the reader holds its
 * permission, so a reader without one simply gets no rows from that view.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** The most ids sent in one `.in()`, so that the address of the request stays short. */
const ID_LOOKUP_BATCH_SIZE = 100;

/** One person's private details. A field from a view the reader may not read is `null`. */
export type PrivateDetailsRow = {
	user_id: string;
	email: string | null;
	phone: string | null;
	/** `YYYY-MM-DD`, or `null`. */
	date_of_birth: string | null;
	dietary_requirements: string | null;
	emergency_contact_name: string | null;
	emergency_contact_phone: string | null;
};

type ContactRow = Pick<PrivateDetailsRow, 'user_id' | 'email' | 'phone'>;

type WelfareRow = Pick<
	PrivateDetailsRow,
	| 'user_id'
	| 'date_of_birth'
	| 'dietary_requirements'
	| 'emergency_contact_name'
	| 'emergency_contact_phone'
>;

const EMPTY_DETAILS: Omit<PrivateDetailsRow, 'user_id'> = {
	email: null,
	phone: null,
	date_of_birth: null,
	dietary_requirements: null,
	emergency_contact_name: null,
	emergency_contact_phone: null
};

/** These ids cut into lists of at most `ID_LOOKUP_BATCH_SIZE`. An empty list gives no batches. */
function idBatches(ids: string[]): string[][] {
	const batches: string[][] = [];

	for (let firstIndex = 0; firstIndex < ids.length; firstIndex += ID_LOOKUP_BATCH_SIZE) {
		batches.push(ids.slice(firstIndex, firstIndex + ID_LOOKUP_BATCH_SIZE));
	}

	return batches;
}

/**
 * The private details of each of these people that the reader may see, by
 * user id. Somebody neither view answers for is not in the map at all.
 *
 * Both views are asked side by side, a batch at a time, because an export
 * hands this one id per row, which for a large conference is thousands.
 */
export async function readPrivateDetails(
	supabase: SupabaseClient,
	userIds: string[]
): Promise<Map<string, PrivateDetailsRow>> {
	const details = new Map<string, PrivateDetailsRow>();

	/** The row for this person, made empty the first time either view names them. */
	function rowFor(userId: string): PrivateDetailsRow {
		const existing = details.get(userId);

		if (existing !== undefined) {
			return existing;
		}

		const row = { user_id: userId, ...EMPTY_DETAILS };
		details.set(userId, row);
		return row;
	}

	for (const batch of idBatches([...new Set(userIds)])) {
		const [contact, welfare] = await Promise.all([
			supabase
				.from('staff_contact_details')
				.select('user_id, email, phone')
				.in('user_id', batch)
				.overrideTypes<ContactRow[], { merge: false }>(),
			supabase
				.from('staff_welfare_details')
				.select(
					'user_id, date_of_birth, dietary_requirements, emergency_contact_name, emergency_contact_phone'
				)
				.in('user_id', batch)
				.overrideTypes<WelfareRow[], { merge: false }>()
		]);

		if (contact.error || welfare.error) {
			const message = (contact.error ?? welfare.error)?.message;
			throw new Error(`Could not read the private details: ${message}`);
		}

		for (const row of contact.data ?? []) {
			Object.assign(rowFor(row.user_id), row);
		}

		for (const row of welfare.data ?? []) {
			Object.assign(rowFor(row.user_id), row);
		}
	}

	return details;
}
