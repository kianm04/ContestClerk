import { error, redirect } from '@sveltejs/kit';
import {
	ALREADY_FREE_REFUSAL,
	DELEGATION_NOT_TAKING_SEATS_REFUSAL,
	FREE_BEFORE_HIDING_REFUSAL,
	NOBODY_TO_MOVE_REFUSAL,
	NOBODY_TO_SWAP_REFUSAL,
	SEAT_JUST_FILLED_REFUSAL,
	SEAT_NOT_OFFERED_REFUSAL,
	SEAT_TAKEN_REFUSAL,
	SWAP_NOT_OFFERED_REFUSAL,
	allocationSummary,
	buildSeatColumns,
	canMoveInto,
	canSwapWith,
	delegateMovedFlash,
	delegatesSwappedFlash,
	parseAllocationQuery,
	seatFreedFlash,
	seatState,
	seatVisibilityFlash,
	seatsAvailableFor,
	type AllocationQuery,
	type GridSeat
} from '$lib/allocation';
import type { CommitteeChoice } from '$lib/applications';
import { UNEXPECTED_ERROR_TEXT } from '$lib/auth';
import { newInvoiceOf, seatsAllocatedFlash } from '$lib/delegation-review';
import { mayReadInvoices } from '$lib/fees-access';
import { hasPermission } from '$lib/permissions';
import { manageAllocationUrl } from '$lib/urls';
import { requireManagePage, requirePermission, requirePermissionAndRank } from '$lib/server/access';
import {
	freeSeat as freeSeatInDatabase,
	hasPaidInvoiceForSeat,
	listSeatsWithHolders,
	listUnseatedAcceptedDelegations,
	moveDelegate as moveDelegateInDatabase,
	swapDelegates as swapDelegatesInDatabase
} from '$lib/server/allocation-grid';
import { listCommitteesWithSeatCounts, type CommitteeWithSeats } from '$lib/server/committees';
import { getDelegationForOrganiser, listDelegationInvoices } from '$lib/server/delegations';
import { setFlash } from '$lib/server/flash';
import { allocateDelegationSeats } from '$lib/server/seat-acceptance';
import { setSeatAvailability } from '$lib/server/seats';
// `./$types` holds the types SvelteKit generates for this one route, so
// `PageServerLoad`, `Actions` and `RequestEvent` already know which parameters
// this address has and what the layout above it hands down.
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/** What a seat id from somebody else's conference gets, exactly as `load` would. */
const NO_SUCH_SEAT = 'That seat is not part of this conference.';

/**
 * The sentence `move_delegate` raises when the seat being moved into has been
 * taken since the page was drawn, word for word from the migration.
 *
 * The three below are matched on their words rather than on a code of our own,
 * because a Postgres exception arrives as a sentence. Anything the function
 * raises that is not one of them was not written for an organiser to read, so
 * it is logged and `UNEXPECTED_ERROR_TEXT` is shown instead;
 * `03-design/writing-style.md` asks for that, and the applications page does
 * the same with `ACCEPT_REFUSALS`.
 */
const TARGET_SEAT_NOT_FREE = 'That seat is not free';

/** The sentence it raises when the seat being moved out of turns out to be empty. */
const SOURCE_SEAT_EMPTY = 'Nobody is sitting in that seat';

/** The sentence it raises when either seat belongs to another conference. */
const SEAT_IN_ANOTHER_CONFERENCE = 'That seat is not part of this conference';

/**
 * The sentence `swap_delegates` raises when the two seats are held different
 * ways (T131). Its other two sentences an organiser can meet are the same as
 * `move_delegate`'s above.
 */
const HELD_DIFFERENTLY = 'Only delegates holding their seats the same way can swap';

/**
 * The sentence `allocate_delegation_seats` raises when the seat is not free
 * any more, word for word from T16's migration. The delegation review page
 * matches it too.
 */
const SEAT_NOT_ALLOCATABLE = 'One of those seats is taken, hidden, or not part of this conference';

/**
 * The sentence `revoke_seat` and `remove_delegation_seat` both raise when the
 * seat has been deleted since the grid was drawn.
 *
 * These three are matched on their words for the same reason the three above
 * are, and they are the ones freeing a seat can still run into after the
 * page's own guards: the grid is a moment old, and the seat can have changed
 * underneath it.
 */
const SEAT_NO_LONGER_EXISTS = 'That seat does not exist';

/** What `remove_delegation_seat` raises when somebody has been put in the seat meanwhile. */
const SEAT_NOW_HAS_SOMEBODY = 'Somebody is sitting in that seat';

/** What it raises when the delegation has already given the seat back. */
const SEAT_NOT_RESERVED = 'That seat is not reserved for a delegation';

/**
 * The committees as the filter dropdown and the columns want them.
 *
 * `listCommitteesWithSeatCounts` brings every committee along with how many of
 * its seats are taken, which nothing on this page reads — the counts under each
 * heading are worked out from the seats themselves — so only the three fields a
 * dropdown and a heading need are passed on. The applications page does exactly
 * this.
 */
function toCommitteeChoices(rows: CommitteeWithSeats[]): CommitteeChoice[] {
	return rows.map((row) => ({
		id: row.committee.id,
		name: row.committee.name,
		abbreviation: row.committee.abbreviation
	}));
}

/** The same filters with the panel shut, which is where every action goes back to. */
function withoutThePanel(query: AllocationQuery): AllocationQuery {
	return { ...query, seat: '', action: '' };
}

/**
 * The gate of every action on this page: `decide_applications`, by the table
 * in section 8 of docs/roles-and-permissions.md. Reading the page needs only
 * `read_applications`, so the page hides its forms from a reader who may not
 * decide, and this is asked again here because a form action is its own
 * request and nothing `load` worked out reaches it.
 */
async function requireDeciderFor(event: RequestEvent) {
	return requirePermission(event.locals, event.url, event.params.slug, 'decide_applications');
}

/**
 * Which seat an action is about.
 *
 * It is normally a hidden `seatId` field, which is what `MoveSeatModal` sends.
 * `ConfirmButton` renders a `<form>` of its own and takes no extra hidden
 * fields, so the free and hide panels put the seat in the address instead and
 * this reads it back from `?seat=`. `SeatActionPanel.svelte` says the same
 * thing at the other end.
 */
function readSeatId(formData: FormData, url: URL): string {
	const fromTheForm = String(formData.get('seatId') ?? '').trim();

	if (fromTheForm !== '') {
		return fromTheForm;
	}

	return url.searchParams.get('seat') ?? '';
}

/**
 * What the flash says when freeing the seat was refused.
 *
 * `freeSeat` calls one of two database functions, and each raises when the
 * seat is not the one the organiser was looking at any more. None of it can
 * be left to throw: an uncaught error here is SvelteKit's error page, where
 * `05-pages/organiser/allocation.md` asks for a flash with the filters kept.
 * Anything the functions raise that was not written for an organiser is
 * logged and shown as `UNEXPECTED_ERROR_TEXT`, exactly as `moveRefusal`
 * above does.
 */
function freeRefusal(thrown: unknown): string {
	const databaseMessage = thrown instanceof Error ? thrown.message : String(thrown);

	if (databaseMessage.includes(SEAT_NO_LONGER_EXISTS)) {
		error(404, NO_SUCH_SEAT);
	}

	// Both mean somebody else has already freed it, which is what was asked for.
	if (databaseMessage.includes(SOURCE_SEAT_EMPTY) || databaseMessage.includes(SEAT_NOT_RESERVED)) {
		return ALREADY_FREE_REFUSAL;
	}

	if (databaseMessage.includes(SEAT_NOW_HAS_SOMEBODY)) {
		return SEAT_JUST_FILLED_REFUSAL;
	}

	console.error('Could not free a seat', thrown);

	return UNEXPECTED_ERROR_TEXT;
}

/**
 * One seat of this conference, by id.
 *
 * The list is the one `listSeatsWithHolders` just read for this conference, so
 * an id belonging to somebody else's conference simply is not in it. That is a
 * 404 rather than a message, because there is nothing to tell this organiser
 * about a seat they may not see. `error` throws, so anything past a call to
 * this has a real seat of their own conference.
 */
function findSeatOrFail(seats: GridSeat[], seatId: string): GridSeat {
	const seat = seats.find((candidate) => candidate.id === seatId);

	if (!seat) {
		error(404, NO_SUCH_SEAT);
	}

	return seat;
}

/**
 * What the flash says when `move_delegate` refused the move.
 *
 * The three sentences the function itself raises were written for an organiser,
 * so two of them are reworded into this page's own wording and the third means
 * the seat is not theirs to see at all, which is a 404 exactly as an unknown id
 * is. Anything else is somebody else's text — a driver's, Postgres's,
 * PostgREST's — and is logged rather than shown.
 */
function moveRefusal(thrown: unknown): string {
	const databaseMessage = thrown instanceof Error ? thrown.message : String(thrown);

	if (databaseMessage.includes(SEAT_IN_ANOTHER_CONFERENCE)) {
		error(404, NO_SUCH_SEAT);
	}

	if (databaseMessage.includes(TARGET_SEAT_NOT_FREE)) {
		return SEAT_TAKEN_REFUSAL;
	}

	if (databaseMessage.includes(SOURCE_SEAT_EMPTY)) {
		return NOBODY_TO_MOVE_REFUSAL;
	}

	console.error('Could not move a delegate', thrown);

	return UNEXPECTED_ERROR_TEXT;
}

/**
 * What the flash says when `swap_delegates` refused the swap, in the way
 * `moveRefusal` above words the refusals of a move.
 */
function swapRefusal(thrown: unknown): string {
	const databaseMessage = thrown instanceof Error ? thrown.message : String(thrown);

	if (databaseMessage.includes(SEAT_IN_ANOTHER_CONFERENCE)) {
		error(404, NO_SUCH_SEAT);
	}

	if (databaseMessage.includes(SOURCE_SEAT_EMPTY)) {
		return NOBODY_TO_SWAP_REFUSAL;
	}

	if (databaseMessage.includes(HELD_DIFFERENTLY)) {
		return SWAP_NOT_OFFERED_REFUSAL;
	}

	console.error('Could not swap two delegates', thrown);

	return UNEXPECTED_ERROR_TEXT;
}

/**
 * Which of the two things `canMoveInto` turned this move down for.
 *
 * That function answers a plain `false` for two quite different reasons, and
 * the organiser has to be told which one. The first is the delegation rule:
 * `move_delegate` leaves `delegation_id` exactly where it is, so a delegate
 * sitting in a seat their delegation reserved may only move into another seat
 * of that same delegation. The second is everything else it turns down — a
 * target somebody is already sitting in, one a delegation holds, one that is
 * hidden — which is the grid being a moment out of date rather than a rule
 * about delegations, and is the "target not free" error that
 * `05-pages/organiser/allocation.md` words as "That seat was just taken."
 *
 * Only asked of a move `canMoveInto` has already refused, so one of the two is
 * always the reason.
 */
function canMoveIntoRefusal(seat: GridSeat, toSeat: GridSeat): string {
	const isDelegationMember = seat.delegationId !== null;
	const isSameDelegation = toSeat.delegationId === seat.delegationId;

	if (isDelegationMember && !isSameDelegation) {
		return SEAT_NOT_OFFERED_REFUSAL;
	}

	return SEAT_TAKEN_REFUSAL;
}

/** Leave a message and go back to the grid with the panel shut. */
function finish(
	event: RequestEvent,
	query: AllocationQuery,
	tone: 'success' | 'error',
	message: string
): never {
	setFlash(event.cookies, { tone, message });
	redirect(303, manageAllocationUrl(event.params.slug, withoutThePanel(query)));
}

/**
 * Everything the allocation grid draws, on top of what the layout above it has
 * already read.
 *
 * `parent()` is a promise for whatever the layout's own `load` returned: this
 * conference and the organisation running it. The layout let in anybody whose
 * permissions open some page of this conference, and handed those permissions
 * down; the first lines below answer a 404 unless they open this one.
 *
 * The whole state of the grid — the two filters, the search, the seat a panel
 * is open for and which panel it is — is read out of the address, so the back
 * button, a refresh and a shared link all show the same thing. `load` runs
 * again on every URL change, which is what redraws the grid.
 *
 * Files under `$lib/server` only ever run on the server, so the queries below
 * cannot be reached by anything the browser does.
 */
export const load: PageServerLoad = async ({ parent, url, locals }) => {
	const { conference, permissions } = await parent();
	// A 404 unless the reader's permissions open this page, by the table in
	// `$lib/manage-pages.ts`.
	requireManagePage(permissions, 'allocation');

	const query = parseAllocationQuery(url.searchParams);

	// None of these three needs another's answer, so they run side by side.
	const [committeeRows, seats, unseatedDelegations] = await Promise.all([
		listCommitteesWithSeatCounts(locals.supabase, conference.id),
		listSeatsWithHolders(locals.supabase, conference.id),
		listUnseatedAcceptedDelegations(locals.supabase, conference.id)
	]);

	const committees = toCommitteeChoices(committeeRows);

	/*
		Counted over every seat and never over the filtered ones. The acceptance
		criterion in `05-pages/organiser/allocation.md` is that the four numbers at
		the top equal the cells on screen when no filter is on; with a filter on
		they are what says how much of the conference the filter is hiding.
	*/
	const summary = allocationSummary(seats);

	const columns = buildSeatColumns(committees, seats, query);

	/*
		Found among every seat rather than among the filtered ones, so that the
		panel still opens for a seat the filters would have hidden — which is what
		happens whenever the organiser frees a seat while "Filled" is selected and
		then opens the next one from a link.
	*/
	const selectedSeat = seats.find((seat) => seat.id === query.seat) ?? null;

	/*
		Only the move panel offers somewhere to go, so the free and hide panels
		pay for none of this work.
	*/
	const moveTargets =
		selectedSeat && query.action === 'move'
			? seatsAvailableFor(selectedSeat, committees, seats)
			: [];

	// How many cells the grid is about to draw, which is what tells "no seats at
	// all" apart from "no seats match these filters".
	const matchingSeatCount = columns.reduce((total, column) => total + column.seats.length, 0);

	return {
		slug: conference.slug,
		query,
		summary,
		columns,
		/** Every committee, for the filter dropdown and for the empty state. */
		committees,
		unseatedDelegations,
		/** The seat `?seat=` names, found before the filters run so a panel opens even for a hidden row. */
		selectedSeat,
		/** Where the delegate in `selectedSeat` may go. Empty unless `?action=move`. */
		moveTargets,
		/** How many seats matched the filters, so the page can say "No seats match these filters." */
		matchingSeatCount,
		/**
		 * Whether this reader may change seats, which every handle, menu and
		 * panel on the page needs. A reader without it sees the same grid with
		 * none of them, and nothing said about what is missing. The actions ask
		 * again.
		 */
		canDecide: hasPermission(permissions, 'decide_applications')
	};
};

export const actions: Actions = {
	/**
	 * Take whoever or whatever is holding this seat out of it.
	 *
	 * `ConfirmButton`'s answer also sends `confirm=1`, which nothing here reads:
	 * the button has already asked, in a dialog with JavaScript and on the
	 * confirmation page without it.
	 */
	freeSeat: async (event) => {
		// The same gate as `requireDeciderFor`, also answering what else the
		// reader holds: whether they may read invoices decides what the flash says.
		const { conference, permissions } = await requirePermissionAndRank(
			event.locals,
			event.url,
			event.params.slug,
			'decide_applications'
		);

		const query = parseAllocationQuery(event.url.searchParams);
		const formData = await event.request.formData();
		const seatId = readSeatId(formData, event.url);

		const seats = await listSeatsWithHolders(event.locals.supabase, conference.id);
		const seat = findSeatOrFail(seats, seatId);

		/* Asked of the seat's holders and not of `seatState`, which answers
		   `hidden` for a seat that is off offer whoever is in it. A hidden seat
		   holding nobody and no delegation is therefore not `free` by that name,
		   yet there is nothing in it to free: `freeSeat` in `$lib/server/allocation-grid.ts`
		   falls through both its branches and throws for exactly that seat. The
		   `try` below catches it, but `freeRefusal` does not know that sentence,
		   which was written for no organiser to read, so it would be logged and
		   answered with `UNEXPECTED_ERROR_TEXT`. This is where the seat gets the
		   refusal the page spec asks for. */
		const isAlreadyFree = seat.userId === null && seat.delegationId === null;

		if (isAlreadyFree) {
			finish(event, query, 'error', ALREADY_FREE_REFUSAL);
		}

		/*
			Asked before the seat is freed and not after. Freeing an unpaid invoice's
			seat voids that invoice, and a voided invoice no longer points at the
			seat, so asking afterwards would say "no paid invoice" about every seat.
		*/
		// A reader who may not read invoices would only ever be told "no", so they
		// are not asked, and the flash says nothing about an invoice.
		const hasPaidInvoice = mayReadInvoices(permissions)
			? await hasPaidInvoiceForSeat(event.locals.supabase, seat.id)
			: null;

		/* The grid is a moment old, so the seat may have been freed by another
		   organiser or filled by a delegation head since it was drawn. Both of
		   those come back as an exception from the database rather than as a
		   return value, and an uncaught one is the error page. */
		try {
			await freeSeatInDatabase(event.locals.supabase, seat);
		} catch (thrown) {
			finish(event, query, 'error', freeRefusal(thrown));
		}

		finish(event, query, 'success', seatFreedFlash(seat, hasPaidInvoice));
	},

	/** Move the delegate sitting in one seat into a free seat of any committee. */
	moveDelegate: async (event) => {
		const { conference } = await requireDeciderFor(event);

		const query = parseAllocationQuery(event.url.searchParams);
		const formData = await event.request.formData();

		const seats = await listSeatsWithHolders(event.locals.supabase, conference.id);
		const seat = findSeatOrFail(seats, readSeatId(formData, event.url));
		const toSeat = findSeatOrFail(seats, String(formData.get('toSeatId') ?? '').trim());

		if (seat.userId === null) {
			finish(event, query, 'error', NOBODY_TO_MOVE_REFUSAL);
		}

		/* The picker only offers seats `canMoveInto` allows, but a form can be
		   posted with any seat id in it, so the same question is asked again here.
		   Without it, moving a delegation's member into a plain free seat would
		   leave the delegation one seat short and say nothing. `canMoveIntoRefusal`
		   is what tells that case apart from a target that is simply not free any
		   more, because the two get different sentences. */
		if (!canMoveInto(seat, toSeat)) {
			finish(event, query, 'error', canMoveIntoRefusal(seat, toSeat));
		}

		try {
			await moveDelegateInDatabase(event.locals.supabase, seat.id, toSeat.id);
		} catch (thrown) {
			finish(event, query, 'error', moveRefusal(thrown));
		}

		// `holderName` is null only for a seat nobody is in, which the check above
		// has already turned away, so the fallback is there for the type and not
		// for anything an organiser can bring about.
		const movedName = seat.holderName ?? 'The delegate';

		finish(event, query, 'success', delegateMovedFlash(movedName, toSeat));
	},

	/**
	 * Trade the delegates sitting in two seats, which is what dropping one
	 * delegate on another does (T131). The page has already asked the organiser
	 * to confirm it.
	 */
	swapDelegates: async (event) => {
		const { conference } = await requireDeciderFor(event);

		const query = parseAllocationQuery(event.url.searchParams);
		const formData = await event.request.formData();

		const seats = await listSeatsWithHolders(event.locals.supabase, conference.id);
		const seat = findSeatOrFail(seats, readSeatId(formData, event.url));
		const toSeat = findSeatOrFail(seats, String(formData.get('toSeatId') ?? '').trim());

		// The grid is a moment old, so either delegate may have been moved away since.
		if (seat.userId === null || toSeat.userId === null) {
			finish(event, query, 'error', NOBODY_TO_SWAP_REFUSAL);
		}

		/* The grid only lights up seats `canSwapWith` allows, but a form can be
		   posted with any two seat ids in it, so the rule is asked again here, as
		   `moveDelegate` above asks `canMoveInto` again. */
		if (!canSwapWith(seat, toSeat)) {
			finish(event, query, 'error', SWAP_NOT_OFFERED_REFUSAL);
		}

		try {
			await swapDelegatesInDatabase(event.locals.supabase, seat.id, toSeat.id);
		} catch (thrown) {
			finish(event, query, 'error', swapRefusal(thrown));
		}

		// Both seats had somebody in them, so the fallbacks are there for the type only.
		const firstName = seat.holderName ?? 'The delegate';
		const secondName = toSeat.holderName ?? 'the other delegate';

		finish(event, query, 'success', delegatesSwappedFlash(firstName, secondName));
	},

	/**
	 * Reserve one free seat for an accepted delegation, which is what dropping
	 * a delegation from the tray does (T131).
	 *
	 * It is the delegation review page's `allocate` with one seat, through the
	 * same `allocate_delegation_seats` function, so the same rules hold and one
	 * drop writes one invoice when a fee applies (`06-features/fees.md`). Only
	 * an `accepted` delegation is taken: the tray lists nothing else, and a
	 * delegation still waiting for a decision is decided on its review page.
	 */
	assignDelegation: async (event) => {
		// The decider gate, also answering whether the reader may read invoices.
		const { conference, permissions } = await requirePermissionAndRank(
			event.locals,
			event.url,
			event.params.slug,
			'decide_applications'
		);

		const query = parseAllocationQuery(event.url.searchParams);
		const formData = await event.request.formData();
		const delegationId = String(formData.get('delegationId') ?? '').trim();

		const seats = await listSeatsWithHolders(event.locals.supabase, conference.id);
		const toSeat = findSeatOrFail(seats, String(formData.get('toSeatId') ?? '').trim());

		const detail = await getDelegationForOrganiser(
			event.locals.supabase,
			conference.id,
			delegationId
		);

		if (detail === null || detail.delegation.status !== 'accepted') {
			finish(event, query, 'error', DELEGATION_NOT_TAKING_SEATS_REFUSAL);
		}

		if (seatState(toSeat) !== 'free') {
			finish(event, query, 'error', SEAT_TAKEN_REFUSAL);
		}

		try {
			await allocateDelegationSeats(event.locals.supabase, delegationId, [toSeat.id]);
		} catch (thrown) {
			const databaseMessage = thrown instanceof Error ? thrown.message : String(thrown);

			// Somebody took the seat between the check above and this call.
			if (databaseMessage.includes(SEAT_NOT_ALLOCATABLE)) {
				finish(event, query, 'error', SEAT_TAKEN_REFUSAL);
			}

			console.error('Could not assign a seat to a delegation', thrown);
			finish(event, query, 'error', UNEXPECTED_ERROR_TEXT);
		}

		// A reader who may not read invoices would find none, and be told no fee
		// applies, so they are not asked; `?.` answers `undefined` for no invoice.
		const invoicesAfter = mayReadInvoices(permissions)
			? await listDelegationInvoices(event.locals.supabase, delegationId)
			: null;
		const invoiceNumber =
			invoicesAfter === null
				? undefined
				: (newInvoiceOf(detail.invoices, invoicesAfter)?.number ?? null);

		finish(event, query, 'success', seatsAllocatedFlash(1, detail.delegation.name, invoiceNumber));
	},

	/** Hide a seat nobody is in, or bring a hidden one back. */
	toggleHidden: async (event) => {
		const { conference } = await requireDeciderFor(event);

		const query = parseAllocationQuery(event.url.searchParams);
		const formData = await event.request.formData();
		const seatId = readSeatId(formData, event.url);

		const seats = await listSeatsWithHolders(event.locals.supabase, conference.id);
		const seat = findSeatOrFail(seats, seatId);

		const isNowAvailable = !seat.isAvailable;
		const state = seatState(seat);
		const isHolding = state === 'reserved' || state === 'filled';

		/* Hiding a seat somebody is in would take them out of every picker while
		   leaving them in it, so the organiser is asked to free it first. Only
		   hiding is refused, never bringing a seat back: `seatState` answers
		   `hidden` for a seat that is off offer whoever is in it, so `isHolding` is
		   false for every hidden seat and the `seat.isAvailable` beside it is what
		   says which way round this press is going. */
		if (seat.isAvailable && isHolding) {
			finish(event, query, 'error', FREE_BEFORE_HIDING_REFUSAL);
		}

		await setSeatAvailability(event.locals.supabase, seat.id, isNowAvailable);

		finish(event, query, 'success', seatVisibilityFlash(isNowAvailable));
	}
};
