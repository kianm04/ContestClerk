import { error, redirect } from '@sveltejs/kit';
import { ALREADY_FREE_REFUSAL } from '$lib/allocation';
import { hasCommitteePermission } from '$lib/permissions';
import type { CommitteeChoice } from '$lib/applications';
import { UNEXPECTED_ERROR_TEXT } from '$lib/auth';
import {
	matchesParticipantQuery,
	pageOfParticipants,
	parseParticipantQuery,
	participantPageCount,
	participantRemovedFlash,
	participantTotals,
	seatedDelegations,
	sortParticipants,
	type ParticipantQuery
} from '$lib/participants';
import {
	participantColumns,
	participantsReaderMaySee,
	queryForColumns,
	totalsForColumns
} from '$lib/participant-access';
import { manageParticipantsUrl } from '$lib/urls';
import { requireManagePage, requirePermissionAndRank } from '$lib/server/access';
import { listCommitteesWithSeatCounts } from '$lib/server/committees';
import { setFlash } from '$lib/server/flash';
import {
	listParticipants,
	readPaidInvoiceNumber,
	withPrivateDetails
} from '$lib/server/participants';
import { freeSeat, listSeatsWithHolders } from '$lib/server/allocation-grid';
// `./$types` holds the types SvelteKit generates for this one route, so
// `PageServerLoad`, `Actions` and `RequestEvent` already know which parameters
// this address has and what the layout above it hands down.
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/** What a seat id from somebody else's conference gets, as the allocation grid answers it. */
const NO_SUCH_SEAT = 'That seat is not part of this conference.';

/**
 * The sentence `revoke_seat` raises when the seat has been deleted since the
 * list was drawn, word for word from the migration. A Postgres exception
 * arrives as a sentence, which is why it is matched on its words; the
 * allocation grid matches the same one.
 */
const SEAT_NO_LONGER_EXISTS = 'That seat does not exist';

/** What `revoke_seat` raises when somebody else has emptied the seat meanwhile. */
const SEAT_ALREADY_EMPTY = 'Nobody is sitting in that seat';

/**
 * Every filled seat of the conference, filtered, sorted and cut to one page,
 * with the numbers along the top.
 *
 * `parent()` is a promise for whatever the layout's own `load` returned: this
 * conference and the organisation running it. The layout let in anybody whose
 * permissions open some page of this conference, and handed those permissions
 * down; the first lines below answer a 404 unless they open this one. `load`
 * runs again whenever the address changes, which is what every filter, the sort
 * and the pager do.
 */
export const load: PageServerLoad = async ({ parent, url, locals }) => {
	const { conference, permissions } = await parent();
	// A 404 unless the reader's permissions open this page, by the table in
	// `$lib/manage-pages.ts`.
	requireManagePage(permissions, 'participants');

	// The columns beyond name, school, seat and delegation follow other
	// permissions, and a filter on a column the reader does not see is dropped.
	const columns = participantColumns(permissions);
	const query = queryForColumns(parseParticipantQuery(url.searchParams), columns);

	// Neither needs the other's answer, so they run side by side.
	const [everyParticipant, committeeRows] = await Promise.all([
		listParticipants(locals.supabase, conference.id),
		listCommitteesWithSeatCounts(locals.supabase, conference.id)
	]);

	// `read_participants` applies per committee: a chair lists their own committees.
	const participants = participantsReaderMaySee(everyParticipant, permissions);
	const visibleCommitteeRows = committeeRows.filter((row) =>
		hasCommitteePermission(permissions, row.committee.id, 'read_participants')
	);

	const matching = participants.filter((participant) =>
		matchesParticipantQuery(participant, query)
	);
	const sorted = sortParticipants(matching, query.sort);

	const committees: CommitteeChoice[] = visibleCommitteeRows.map((row) => ({
		id: row.committee.id,
		name: row.committee.name,
		abbreviation: row.committee.abbreviation
	}));

	// Only the page shown needs its private details, and only those this
	// conference's permissions grant the reader; the rest stays `null`.
	const rows = await withPrivateDetails(
		locals.supabase,
		pageOfParticipants(sorted, query.page),
		permissions
	);

	return {
		query,
		rows,
		pageCount: participantPageCount(sorted.length),
		/** Counted over every participant, so a filter never changes the numbers at the top. */
		totals: totalsForColumns(participantTotals(participants), columns),
		columns,
		/** The committees the reader may list, for the committee dropdown. */
		committees,
		/** The delegations with somebody seated, for the delegation dropdown. */
		delegations: seatedDelegations(participants)
	};
};

/**
 * Save the flash and send the organiser back to the list with the same filters.
 * `redirect` works by throwing, so nothing after a call to this runs.
 */
function finish(
	event: RequestEvent,
	query: ParticipantQuery,
	tone: 'success' | 'error',
	message: string
): never {
	setFlash(event.cookies, { tone, message });
	redirect(303, manageParticipantsUrl(event.params.slug, query));
}

/**
 * What the flash says when `revoke_seat` refused.
 *
 * The list is a moment old, so the seat may have been deleted or emptied by
 * another organiser since it was drawn. Anything else the function raises was
 * not written for an organiser to read, so it is logged and
 * `UNEXPECTED_ERROR_TEXT` is shown instead, as the allocation grid does.
 */
function removeRefusal(thrown: unknown): string {
	const databaseMessage = thrown instanceof Error ? thrown.message : String(thrown);

	if (databaseMessage.includes(SEAT_NO_LONGER_EXISTS)) {
		error(404, NO_SUCH_SEAT);
	}

	if (databaseMessage.includes(SEAT_ALREADY_EMPTY)) {
		return ALREADY_FREE_REFUSAL;
	}

	console.error('Could not remove a participant from their seat', thrown);

	return UNEXPECTED_ERROR_TEXT;
}

export const actions: Actions = {
	/**
	 * Take the participant out of their seat, exactly as "Free seat" on the
	 * allocation grid does for a filled seat.
	 *
	 * `freeSeat` calls `revoke_seat`: an individual's application becomes "not
	 * accepted" and an unpaid seat invoice is cancelled, while a delegation's
	 * seat stays reserved for the delegation so its head can name somebody else.
	 * `ConfirmButton` also sends `confirm=1`, which nothing here reads, for the
	 * reason the allocation grid's `freeSeat` action gives.
	 */
	removeFromSeat: async (event) => {
		// An action is its own request, so it checks the reader again. Freeing a
		// seat is `revoke_seat`, which asks `decide_applications` on the whole
		// conference, so the same is asked here, and anybody else gets the 404
		// the allocation grid's own actions give.
		const { conference } = await requirePermissionAndRank(
			event.locals,
			event.url,
			event.params.slug,
			'decide_applications'
		);

		const query = parseParticipantQuery(event.url.searchParams);
		const formData = await event.request.formData();
		const seatId = String(formData.get('seatId') ?? '');

		// Only this conference's seats are looked in, so another conference's id is a 404.
		const seats = await listSeatsWithHolders(event.locals.supabase, conference.id);
		const seat = seats.find((candidate) => candidate.id === seatId);

		if (!seat) {
			error(404, NO_SUCH_SEAT);
		}

		/* Checked here rather than left to `freeSeat`, which would release a
		   delegation's reservation from a seat nobody sits in. That is the
		   allocation grid's decision to make, not this list's. */
		if (seat.userId === null || seat.holderName === null) {
			finish(event, query, 'error', ALREADY_FREE_REFUSAL);
		}

		/*
			Asked before the seat is freed and not after: freeing it voids an unpaid
			invoice and leaves a paid one alone, and the organiser needs the paid
			one's number to refund it by hand.
		*/
		const paidInvoiceNumber = await readPaidInvoiceNumber(event.locals.supabase, seat.id);

		try {
			await freeSeat(event.locals.supabase, seat);
		} catch (thrown) {
			finish(event, query, 'error', removeRefusal(thrown));
		}

		const message = participantRemovedFlash(
			seat.holderName,
			seat.name,
			seat.committee,
			paidInvoiceNumber
		);
		finish(event, query, 'success', message);
	}
};
