/**
 * Reading awards for the chair's awards page, the organiser's awards page and
 * `/profile`.
 *
 * Files under `$lib/server` only ever run on the server. Every function takes
 * the reader's own Supabase client, so Row Level Security decides what comes
 * back: a chair or organiser reads every award of their committees, and
 * anybody signed in reads only confirmed awards of a conference whose publish
 * moment has arrived. Writing awards is in `award-changes.ts` beside this file.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
	isAwardsVisible,
	sortAwards,
	type Award,
	type AwardKind,
	type AwardSeat,
	type AwardStatus,
	type CommitteeAwards,
	type CommitteePageAward,
	type ProfileAward
} from '$lib/awards';
import { dayInTimezone } from '$lib/dates';

/** A seat of a committee, with the committee it belongs to. */
export type CommitteeAwardSeat = AwardSeat & { committeeId: string };

type AwardRow = {
	id: string;
	committee_id: string;
	seat_id: string;
	user_id: string | null;
	kind: AwardKind;
	title: string;
	status: AwardStatus;
	created_by: string;
	seat: { name: string; country_code: string | null; user_id: string | null } | null;
};

const AWARD_COLUMNS =
	'id, committee_id, seat_id, user_id, kind, title, status, created_by, seat:seats(name, country_code, user_id)';

/**
 * The names of these people, keyed by account id.
 *
 * A second query rather than a join: `awards.created_by` and `awards.user_id`
 * point at `auth.users`, not at `profiles`, so PostgREST cannot follow them.
 */
async function readNames(
	supabase: SupabaseClient,
	userIds: (string | null)[]
): Promise<Map<string, string>> {
	const knownIds = [...new Set(userIds.filter((userId) => userId !== null))];

	if (knownIds.length === 0) return new Map();

	const { data, error } = await supabase
		.from('profiles')
		.select('id, full_name')
		.in('id', knownIds)
		.overrideTypes<{ id: string; full_name: string | null }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the names on the awards: ${error.message}`);
	}

	const names = new Map<string, string>();

	for (const profile of data ?? []) {
		if (profile.full_name) names.set(profile.id, profile.full_name);
	}

	return names;
}

/** Every award of these committees, in the shape both pages draw, not yet sorted. */
async function readAwards(supabase: SupabaseClient, committeeIds: string[]): Promise<Award[]> {
	if (committeeIds.length === 0) return [];

	const { data, error } = await supabase
		.from('awards')
		.select(AWARD_COLUMNS)
		.in('committee_id', committeeIds)
		.overrideTypes<AwardRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the awards: ${error.message}`);
	}

	const rows = data ?? [];

	// Before publishing nobody is frozen onto an award yet, so it is for
	// whoever sits in its seat now.
	const holderIds = rows.map((row) => row.user_id ?? row.seat?.user_id ?? null);
	const names = await readNames(supabase, [...holderIds, ...rows.map((row) => row.created_by)]);

	return rows.map((row, index) => {
		const holderId = holderIds[index];

		return {
			id: row.id,
			committeeId: row.committee_id,
			seatId: row.seat_id,
			seatName: row.seat?.name ?? '',
			countryCode: row.seat?.country_code ?? null,
			holderName: holderId === null ? null : (names.get(holderId) ?? null),
			isSeatEmpty: (row.seat?.user_id ?? null) === null,
			kind: row.kind,
			title: row.title,
			status: row.status,
			createdBy: row.created_by,
			proposerName: names.get(row.created_by) ?? null
		};
	});
}

/**
 * Every award of one committee, by kind rank and then seat name, with the
 * seat, its holder and who proposed it. What the chair's awards page lists.
 */
export async function listCommitteeAwards(
	supabase: SupabaseClient,
	committeeId: string
): Promise<Award[]> {
	return sortAwards(await readAwards(supabase, [committeeId]));
}

/**
 * The available seats of these committees in their own order, each saying
 * whether somebody holds it and who. The award forms offer the filled ones
 * and check a posted seat against all of them.
 */
export async function listAwardSeats(
	supabase: SupabaseClient,
	committeeIds: string[]
): Promise<CommitteeAwardSeat[]> {
	if (committeeIds.length === 0) return [];

	const { data, error } = await supabase
		.from('seats')
		.select('id, committee_id, name, country_code, user_id')
		.in('committee_id', committeeIds)
		.eq('is_available', true)
		.order('position', { ascending: true })
		.overrideTypes<
			{
				id: string;
				committee_id: string;
				name: string;
				country_code: string | null;
				user_id: string | null;
			}[],
			{ merge: false }
		>();

	if (error) {
		throw new Error(`Could not read the seats: ${error.message}`);
	}

	const seats = data ?? [];
	const names = await readNames(
		supabase,
		seats.map((seat) => seat.user_id)
	);

	return seats.map((seat) => ({
		id: seat.id,
		committeeId: seat.committee_id,
		name: seat.name,
		countryCode: seat.country_code,
		isFilled: seat.user_id !== null,
		delegateName: seat.user_id === null ? null : (names.get(seat.user_id) ?? null)
	}));
}

/**
 * Every committee of the conference in its page order, each with its awards
 * (by kind rank, then seat) and the seats that have a delegate. What the
 * organiser's awards page lists.
 */
export async function listAwardsByCommittee(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<CommitteeAwards[]> {
	const { data, error } = await supabase
		.from('committees')
		.select('id, name, abbreviation')
		.eq('conference_id', conferenceId)
		.order('position', { ascending: true })
		.overrideTypes<{ id: string; name: string; abbreviation: string | null }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the committees: ${error.message}`);
	}

	const committees = data ?? [];
	const committeeIds = committees.map((committee) => committee.id);
	const [awards, seats] = await Promise.all([
		readAwards(supabase, committeeIds),
		listAwardSeats(supabase, committeeIds)
	]);

	return committees.map((committee) => ({
		committee,
		awards: sortAwards(awards.filter((award) => award.committeeId === committee.id)),
		filledSeats: seats.filter((seat) => seat.committeeId === committee.id && seat.isFilled)
	}));
}

/**
 * When the conference's awards are, or will be, visible to delegates:
 * `conferences.awards_published_at`, or null while they are unpublished.
 */
export async function readAwardsPublishedAt(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<string | null> {
	const { data, error } = await supabase
		.from('conferences')
		.select('awards_published_at')
		.eq('id', conferenceId)
		.single();

	if (error) {
		throw new Error(`Could not read when the awards are published: ${error.message}`);
	}

	return data.awards_published_at;
}

/**
 * One row of `published_awards`, the view every signed-in reader gets a
 * committee's published awards through (migration 20261022132000). It carries
 * the seat's name and flag and the holder's name itself, and none of the ids
 * of the row underneath: who proposed an award, and which account holds it,
 * is the organisers' to know.
 */
type PublishedAwardRow = {
	id: string;
	kind: AwardKind;
	title: string;
	seat_name: string;
	seat_country_code: string | null;
	holder_name: string | null;
};

/**
 * The committee's published, confirmed awards, as the public committee page
 * lists them for a reader who neither proposes nor confirms awards. The view
 * only answers once the conference's publish moment has arrived, so a reader
 * before that moment gets an empty list.
 */
export async function listPublishedCommitteeAwards(
	supabase: SupabaseClient,
	committeeId: string
): Promise<CommitteePageAward[]> {
	const { data, error } = await supabase
		.from('published_awards')
		.select('id, kind, title, seat_name, seat_country_code, holder_name')
		.eq('committee_id', committeeId)
		.overrideTypes<PublishedAwardRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the published awards: ${error.message}`);
	}

	const awards: CommitteePageAward[] = (data ?? []).map((row) => ({
		id: row.id,
		kind: row.kind,
		title: row.title,
		seatName: row.seat_name,
		countryCode: row.seat_country_code,
		holderName: row.holder_name,
		// The view carries confirmed awards and nothing else.
		status: 'confirmed'
	}));

	// The same order a chair sees on their own page: by kind rank, then seat.
	return sortAwards(awards);
}

type MyAwardRow = {
	id: string;
	title: string;
	committee: {
		name: string;
		abbreviation: string | null;
		conference: { name: string; timezone: string; awards_published_at: string | null } | null;
	} | null;
};

/**
 * The reader's own awards for `/profile`: confirmed, frozen onto them at
 * publish, and of a conference whose publish moment has arrived. Newest first.
 *
 * They are read through `published_awards`, whose `is_mine` says which rows
 * are the reader's, because the `awards` table itself no longer answers
 * anybody but the people who propose or confirm awards. The view already
 * leaves out what is unpublished, but the page asks the same question of its
 * own clock again rather than trusting one it cannot see.
 */
export async function listMyAwards(supabase: SupabaseClient, now: Date): Promise<ProfileAward[]> {
	const { data, error } = await supabase
		.from('published_awards')
		.select(
			'id, title, committee:committees(name, abbreviation, conference:conferences(name, timezone, awards_published_at))'
		)
		.eq('is_mine', true)
		.overrideTypes<MyAwardRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read your awards: ${error.message}`);
	}

	const awards: ProfileAward[] = [];

	for (const row of data ?? []) {
		const conference = row.committee?.conference ?? null;
		const publishedAt = conference?.awards_published_at ?? null;

		if (!row.committee || !conference || publishedAt === null) continue;
		if (!isAwardsVisible(publishedAt, now)) continue;

		awards.push({
			id: row.id,
			title: row.title,
			committeeLabel: row.committee.abbreviation ?? row.committee.name,
			conferenceName: conference.name,
			publishedDay: dayInTimezone(new Date(publishedAt), conference.timezone)
		});
	}

	// `YYYY-MM-DD` sorts the same way as the days it names.
	awards.sort((first, second) => second.publishedDay.localeCompare(first.publishedDay));

	return awards;
}
