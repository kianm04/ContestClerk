/**
 * Where one committee's own public page gets its data: the committee, its
 * chairs, its seats, and what the person reading is allowed to do and see.
 *
 * Files under `$lib/server` only ever run on the server, so this is where the
 * database is queried. Every function takes the Supabase client as its first
 * argument. Pages pass in `locals.supabase`, the client that knows who is
 * signed in, so the database's Row Level Security rules (see
 * `specs/02-architecture/permissions.md`) decide what each reader gets back.
 *
 * That matters more here than anywhere else in the app, because the same seat
 * list is read out of two different relations depending on who is asking. See
 * `readSeats` below.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Committee, CommitteeChair, PublicSeat, SeatKind } from '$lib/committees';
import type { Conference } from '$lib/conferences';
import { paperStatus, type PaperStatus, type ReviewStatus } from '$lib/documents';
import type { Permission } from '$lib/permissions';
import { COMMITTEE_COLUMNS } from './committees';
import { getConferenceBySlug } from './conferences';
import { holderOf, readDelegationNames, readSeatHolders, type SeatRow } from './seat-holders';
import { listCommitteeChairs } from './team';

/** Everything the public committee page shows. `null` when there is no such committee. */
export type CommitteePage = {
	conference: Conference;
	committee: Committee;
	chairs: CommitteeChair[];
	/** In the organiser's own order. */
	seats: PublicSeat[];
	viewer: CommitteeViewer;
};

/** What this particular reader is allowed to do and to see here. */
export type CommitteeViewer = {
	canManage: boolean;
	isChair: boolean;
	/**
	 * Whether the names of the delegates in the seats came back. True for a
	 * delegate of this committee and for the conference's staff, who read the
	 * `seats` table itself; false for everybody else, who read the
	 * `public_seats` view, which has no `user_id` in it at all.
	 */
	canSeeSeatHolders: boolean;
	/** The id of the reader's own seat in this committee, or `null`. */
	mySeatId: string | null;
	/**
	 * Where the reader's own position paper stands, or `null` when they hold no
	 * seat here to have one. `'missing'` means they hold a seat but have not
	 * uploaded a paper yet, the same word `paperStatus` in `$lib/documents.ts`
	 * uses for the organiser's own overview.
	 */
	myPaperStatus: PaperStatus | null;
};

/** The seat list, together with what the reader was allowed to learn from it. */
type SeatList = {
	seats: PublicSeat[];
	canSeeSeatHolders: boolean;
	mySeatId: string | null;
};

/** One row of the `public_seats` view, which is what everybody else reads. */
type PublicSeatRow = {
	id: string;
	name: string;
	kind: SeatKind;
	country_code: string | null;
	position: number;
	is_taken: boolean;
};

/**
 * The name of the delegation this seat is being held for, or `null` when it is
 * held for nobody, when somebody is already sitting in it, or when this reader
 * may not read the delegation's name.
 */
function reservedFor(row: SeatRow, names: Map<string, string>): string | null {
	if (row.user_id !== null || row.delegation_id === null) {
		return null;
	}

	return names.get(row.delegation_id) ?? null;
}

/**
 * The seat list as somebody inside the conference sees it, or `null` when this
 * reader is not one of them.
 *
 * The `seats` select policy lets a delegate of this committee and the
 * conference's staff read the table; for everybody else the query is allowed
 * but comes back empty. A committee with nobody having made seats for it yet
 * comes back empty too, and then reading `public_seats` instead gives the same
 * empty list with `canSeeSeatHolders` false, which is the right answer: no name
 * was hidden, because there was none.
 */
async function readSeatsAsInsider(
	supabase: SupabaseClient,
	committeeId: string,
	userId: string
): Promise<SeatList | null> {
	const { data, error } = await supabase
		.from('seats')
		.select('id, name, kind, country_code, position, is_available, user_id, delegation_id')
		.eq('committee_id', committeeId)
		.order('position', { ascending: true })
		.overrideTypes<SeatRow[], { merge: false }>();

	if (error || !data || data.length === 0) {
		return null;
	}

	// `public_seats` leaves these out, and a seat the organiser is not offering
	// this year must not appear on this page for anybody, whoever is reading.
	const offeredSeats = data.filter((row) => row.is_available);

	// Neither of these needs the other's answer, so both start at once.
	const [holders, delegationNames] = await Promise.all([
		readSeatHolders(supabase, offeredSeats),
		readDelegationNames(supabase, offeredSeats)
	]);

	const seats: PublicSeat[] = offeredSeats.map((row) => {
		const holder = holderOf(row, holders);

		return {
			id: row.id,
			name: row.name,
			kind: row.kind,
			countryCode: row.country_code,
			position: row.position,
			isTaken: row.user_id !== null,
			isReserved: row.user_id === null && row.delegation_id !== null,
			reservedForName: reservedFor(row, delegationNames),
			holderName: holder?.fullName ?? null,
			holderAvatarPath: holder?.avatarPath ?? null
		};
	});

	// Only among the seats the page shows, because a seat that is not on the page
	// is not one there is anything to highlight.
	const mySeat = offeredSeats.find((row) => row.user_id === userId);

	return { seats, canSeeSeatHolders: true, mySeatId: mySeat?.id ?? null };
}

/** The seat list as a visitor sees it: the flag, the name, and whether it is taken. */
async function readPublicSeats(
	supabase: SupabaseClient,
	committeeId: string
): Promise<PublicSeat[]> {
	const { data, error } = await supabase
		.from('public_seats')
		.select('id, name, kind, country_code, position, is_taken')
		.eq('committee_id', committeeId)
		.order('position', { ascending: true })
		.overrideTypes<PublicSeatRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the seats: ${error.message}`);
	}

	const rows: PublicSeatRow[] = data ?? [];

	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		kind: row.kind,
		countryCode: row.country_code,
		position: row.position,
		isTaken: row.is_taken,
		// The view has no `delegation_id` either, so a visitor is not told that a
		// seat has been promised to a school. `is_taken` asks about `user_id`
		// alone, which means a reserved seat still reads as one on offer, and that
		// is what `specs/02-architecture/data-model.md` says the view is.
		isReserved: false,
		reservedForName: null,
		// The view has no `user_id` in it at all, which is how a visitor can see
		// that a seat is taken without seeing by whom. A picture would name them
		// just as surely as the name itself, so it is left out with it.
		holderName: null,
		holderAvatarPath: null
	}));
}

/** One row of the position paper status lookup: only the review matters. */
type PaperStatusRow = {
	review_status: ReviewStatus | null;
};

/**
 * Where the reader's own seat stands on its position paper.
 *
 * The `documents` select policy lets a delegate read the row of their own
 * seat, the same rule `getMyPositionPaper` in `./position-papers.ts` relies
 * on, so nothing more than asking for this one seat's row is needed here.
 */
async function readMyPaperStatus(supabase: SupabaseClient, seatId: string): Promise<PaperStatus> {
	const { data, error } = await supabase
		.from('documents')
		.select('review_status')
		.eq('seat_id', seatId)
		.eq('kind', 'position_paper')
		.maybeSingle()
		.overrideTypes<PaperStatusRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not read your position paper's status: ${error.message}`);
	}

	return paperStatus(data?.review_status ?? null);
}

/** The seat list this reader is entitled to: the table when they may read it, the view otherwise. */
async function readSeats(
	supabase: SupabaseClient,
	committeeId: string,
	userId: string | null
): Promise<SeatList> {
	if (userId !== null) {
		const insideList = await readSeatsAsInsider(supabase, committeeId, userId);

		if (insideList) {
			return insideList;
		}
	}

	const seats = await readPublicSeats(supabase, committeeId);

	return { seats, canSeeSeatHolders: false, mySeatId: null };
}

/** What the two permission questions about a committee answer together. */
type CommitteePermissions = {
	canManage: boolean;
	isChair: boolean;
};

/**
 * Ask the database whether the signed-in reader holds `permission` in this
 * committee: conference-wide, or on a role per committee that names it.
 *
 * A question that fails answers `false` rather than throwing: these decide
 * which extra links the page offers, so the worst a wrong `false` does is
 * hide a link, where throwing would replace the whole page with an error.
 */
async function askCommitteePermission(
	supabase: SupabaseClient,
	committeeId: string,
	permission: Permission
): Promise<boolean> {
	const { data, error } = await supabase.rpc('has_committee_permission', {
		committee_id: committeeId,
		permission
	});

	if (error) {
		return false;
	}

	return data === true;
}

/**
 * Whether this reader edits the committee, which offers "Edit committee", and
 * whether they run its room, which offers "Open chair room".
 */
async function readCommitteePermissions(
	supabase: SupabaseClient,
	committeeId: string,
	userId: string | null
): Promise<CommitteePermissions> {
	// The helper is granted to `authenticated` only, so asking it while signed
	// out would fail rather than answer `false`. A signed-out reader runs
	// nothing and edits nothing, so no question needs to be sent at all.
	if (userId === null) {
		return { canManage: false, isChair: false };
	}

	const [canManage, isChair] = await Promise.all([
		askCommitteePermission(supabase, committeeId, 'manage_committees'),
		askCommitteePermission(supabase, committeeId, 'run_room')
	]);

	return { canManage, isChair };
}

/** One committee of one conference, or `null` when that conference has no committee with that slug. */
async function getCommitteeBySlug(
	supabase: SupabaseClient,
	conferenceId: string,
	committeeSlug: string
): Promise<Committee | null> {
	const { data, error } = await supabase
		.from('committees')
		.select(COMMITTEE_COLUMNS)
		.eq('conference_id', conferenceId)
		.eq('slug', committeeSlug)
		// `maybeSingle` returns one row, or `null` when nothing matches, instead of a list.
		.maybeSingle()
		.overrideTypes<Committee, { merge: false }>();

	if (error) {
		throw new Error(`Could not load committee "${committeeSlug}": ${error.message}`);
	}

	return data ?? null;
}

/**
 * Everything the public committee page shows, in one object.
 *
 * `null` means the conference or the committee is not there, or is not one this
 * reader may see, and the page turns that into a 404 either way. That is the
 * "unknown slug pair" rule of `specs/05-pages/public/committee.md`.
 */
export async function getCommitteePage(
	supabase: SupabaseClient,
	conferenceSlug: string,
	committeeSlug: string,
	userId: string | null
): Promise<CommitteePage | null> {
	const conference = await getConferenceBySlug(supabase, conferenceSlug);

	if (!conference) {
		return null;
	}

	const committee = await getCommitteeBySlug(supabase, conference.id, committeeSlug);

	if (!committee) {
		return null;
	}

	// None of these three needs another's answer, so all three start at once.
	const [chairs, seatList, permissions] = await Promise.all([
		listCommitteeChairs(supabase, committee.id),
		readSeats(supabase, committee.id, userId),
		readCommitteePermissions(supabase, committee.id, userId)
	]);

	// This one needs `seatList.mySeatId`, which is why it cannot join the wave
	// above. A visitor with no seat here has no paper status to read either.
	const myPaperStatus = seatList.mySeatId
		? await readMyPaperStatus(supabase, seatList.mySeatId)
		: null;

	return {
		conference,
		committee,
		chairs,
		seats: seatList.seats,
		viewer: {
			canManage: permissions.canManage,
			isChair: permissions.isChair,
			canSeeSeatHolders: seatList.canSeeSeatHolders,
			mySeatId: seatList.mySeatId,
			myPaperStatus
		}
	};
}
