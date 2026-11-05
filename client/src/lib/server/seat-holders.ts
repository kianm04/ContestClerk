/**
 * Who sits in a committee's seats and which delegation each seat is held for.
 *
 * Both the public committee page (`./committee-page.ts`) and the organiser's
 * committees editor (`./manage-committees.ts`) read the `seats` table and then
 * look up the same two things about its rows, so the lookups live here once
 * rather than in both.
 *
 * Files under `$lib/server` only ever run on the server. Every query here runs
 * as whoever is reading the page, so Row Level Security decides which names
 * come back (see `specs/02-architecture/permissions.md`).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SeatKind } from '$lib/committees';

/** One row of the `seats` table, which only the people inside the conference may read. */
export type SeatRow = {
	id: string;
	name: string;
	kind: SeatKind;
	country_code: string | null;
	position: number;
	is_available: boolean;
	/** The delegate sitting in the seat, or `null` while it is free. */
	user_id: string | null;
	/**
	 * The delegation the seat is held for, or `null`. A seat with a delegation
	 * and no `user_id` is reserved: the group has it, and its head has not yet
	 * chosen which member sits in it.
	 */
	delegation_id: string | null;
};

/** One person sitting in a seat, with everything the seat row shows of them. */
export type SeatHolder = { fullName: string; avatarPath: string | null };

/**
 * The people sitting in these seats, by user id.
 *
 * It is a second query because nothing in the schema joins `seats` to
 * `profiles`: `seats.user_id` points at `auth.users`, and PostgREST can only
 * bring along a table that a foreign key actually names.
 */
export async function readSeatHolders(
	supabase: SupabaseClient,
	rows: SeatRow[]
): Promise<Map<string, SeatHolder>> {
	const holderIds: string[] = [];

	for (const row of rows) {
		if (row.user_id !== null) {
			holderIds.push(row.user_id);
		}
	}

	// Every seat is still free, so there is nobody to look up.
	if (holderIds.length === 0) {
		return new Map();
	}

	const { data, error } = await supabase
		.from('profiles')
		.select('id, full_name, avatar_path')
		.in('id', holderIds)
		.overrideTypes<
			{ id: string; full_name: string; avatar_path: string | null }[],
			{ merge: false }
		>();

	// Anybody signed in may read every profile, so a failure here is a fault
	// rather than a rule turning somebody away.
	if (error) {
		throw new Error(`Could not read the delegates' names: ${error.message}`);
	}

	const holders = new Map<string, SeatHolder>();

	for (const row of data ?? []) {
		holders.set(row.id, { fullName: row.full_name, avatarPath: row.avatar_path ?? null });
	}

	return holders;
}

/**
 * The names of the delegations these seats are reserved for, by delegation id.
 *
 * It is a second query for the same reason `readSeatHolders` is: nothing joins
 * `seats` to `delegations` in a way PostgREST can follow from here.
 *
 * The names come from the `participant_delegations` view and not from the
 * `delegations` table. The view answers everybody who may know of the
 * delegation at all — its own members, the organisers, and a chair who lists
 * one of its delegates — with its public columns and never its join code,
 * which is why a chair reads the table itself no more (security review
 * 2026-10-10, M18). Everybody else gets an empty map, their seats come back
 * with `reservedForName` null (see `reservedFor` in `./committee-page.ts`),
 * and the public committee page says the seat is reserved without saying for
 * whom. That is the rule doing its work, not a failure, which is why nothing
 * here treats a missing name as an error.
 */
export async function readDelegationNames(
	supabase: SupabaseClient,
	rows: SeatRow[]
): Promise<Map<string, string>> {
	const delegationIds: string[] = [];

	for (const row of rows) {
		if (row.delegation_id !== null) {
			delegationIds.push(row.delegation_id);
		}
	}

	if (delegationIds.length === 0) {
		return new Map();
	}

	const { data } = await supabase
		.from('participant_delegations')
		.select('id, name')
		.in('id', delegationIds)
		.overrideTypes<{ id: string; name: string }[], { merge: false }>();

	const names = new Map<string, string>();

	for (const row of data ?? []) {
		names.set(row.id, row.name);
	}

	return names;
}

/** Whoever sits in this seat, or `null` when it is free or has no profile row yet. */
export function holderOf(row: SeatRow, holders: Map<string, SeatHolder>): SeatHolder | null {
	if (row.user_id === null) {
		return null;
	}

	return holders.get(row.user_id) ?? null;
}
