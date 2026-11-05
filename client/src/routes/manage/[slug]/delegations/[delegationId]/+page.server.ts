import { error, fail, redirect } from '@sveltejs/kit';
import type { SeatGroup } from '$lib/allocation';
import { UNEXPECTED_ERROR_TEXT } from '$lib/auth';
import {
	ALREADY_DECIDED_REFUSAL,
	DECISION_NOTE_MAX_LENGTH,
	INTERNAL_NOTE_MAX_LENGTH,
	INTERNAL_NOTE_SAVED_FLASH,
	INTERNAL_NOTE_TOO_LONG_REFUSAL,
	NO_SEATS_TICKED_REFUSAL,
	REJECTED_FLASH,
	SEATS_JUST_CHANGED_REFUSAL,
	SEAT_ALREADY_REMOVED_REFUSAL,
	SEAT_HAS_MEMBER_REFUSAL,
	SEAT_REMOVED_FLASH,
	canAllocateToDelegation,
	delegationSeatCounts,
	newInvoiceOf,
	rejectRefusal,
	reservedSeatCount,
	seatTakenRefusal,
	seatsAllocatedFlash,
	withheldMemberDetails,
	type OrganiserDelegationDetail
} from '$lib/delegation-review';
import { delegationProgress } from '$lib/delegations';
import { manageDelegationReviewUrl } from '$lib/urls';
import { mayReadInvoices } from '$lib/fees-access';
import { hasPermission } from '$lib/permissions';
import { privateDetailsAccess } from '$lib/private-details';
import { requireManagePage, requirePermission, requirePermissionAndRank } from '$lib/server/access';
import { removeDelegationSeat } from '$lib/server/allocation-grid';
import {
	getDelegationForOrganiser,
	listDelegationInvoices,
	rejectDelegation,
	saveDelegationDecisionNote,
	updateDelegationInternalNote
} from '$lib/server/delegations';
import { setFlash } from '$lib/server/flash';
import {
	allocateDelegationSeats,
	listSeatsByCommittee,
	readSeatLabel
} from '$lib/server/seat-acceptance';
// `./$types` holds the types SvelteKit generates for this one route, so
// `PageServerLoad`, `Actions` and `RequestEvent` already know which parameters
// this address has and what the layout above it hands down.
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/** What a delegation of somebody else's conference gets, and a `draft` with it. */
const NO_SUCH_DELEGATION = 'This delegation does not exist.';

/** What a seat id that names no seat of this conference gets. */
const NO_SUCH_SEAT = 'That seat is not part of this conference.';

/**
 * The sentence `allocate_delegation_seats` raises when one of the ticked seats
 * is not free any more, word for word from T16's migration.
 *
 * It is matched on its words rather than on a code of our own, because a
 * Postgres exception arrives as a sentence. The allocation grid matches the
 * three sentences it can meet the same way and says why there.
 */
const SEAT_NOT_ALLOCATABLE = 'One of those seats is taken, hidden, or not part of this conference';

/** What `remove_delegation_seat` raises when somebody has been put in the seat meanwhile. */
const SEAT_NOW_HAS_SOMEBODY = 'Somebody is sitting in that seat';

/** What it raises when the seat has been deleted since the page was drawn. */
const SEAT_NO_LONGER_EXISTS = 'That seat does not exist';

/** What it raises when the delegation has already given the seat back. */
const SEAT_NOT_RESERVED = 'That seat is not reserved for a delegation';

/**
 * Which card on the page a refusal belongs to.
 *
 * One page holds four forms, and a message under the wrong one would be a
 * message about something the organiser did not just do. The page reads this
 * name to decide which card shows `form.message`.
 */
type FailedAction = 'allocate' | 'removeSeat' | 'reject' | 'saveInternalNote';

/**
 * What a refused post sends back to the page.
 *
 * `fail` answers with the page again rather than redirecting, so everything the
 * organiser had typed or ticked comes back with it and nothing has to be typed
 * twice. The three successful actions redirect with a flash instead, because
 * after a success there is nothing left to keep.
 */
type ReviewFormState = {
	failedAction: FailedAction;
	message: string;
	/** The seats still ticked in the picker. */
	selectedSeatIds: string[];
	/** What was in the note to the head. */
	decisionNote: string;
	/** What was in the organisers' own note. */
	internalNote: string;
};

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
 * The delegation this address is about, read again inside an action.
 *
 * Every action re-reads it, which is what `05-pages/organiser/delegation-review.md`
 * asks for: the page in the organiser's browser is a moment old, and another
 * organiser may have decided the same delegation in between. A delegation of
 * another conference, or one the head has not sent yet, is a 404 here exactly
 * as it is in `load`.
 */
async function readDelegationOrFail(
	event: RequestEvent,
	conferenceId: string
): Promise<OrganiserDelegationDetail> {
	const detail = await getDelegationForOrganiser(
		event.locals.supabase,
		conferenceId,
		event.params.delegationId
	);

	if (!detail) {
		error(404, NO_SUCH_DELEGATION);
	}

	return detail;
}

/** Sets the flash and sends the browser back to this page, which redraws it. */
function finish(event: RequestEvent, tone: 'success' | 'error', message: string): never {
	setFlash(event.cookies, { tone, message });
	redirect(303, manageDelegationReviewUrl(event.params.slug, event.params.delegationId));
}

/** Answers with the page again, carrying one message and everything typed so far. */
function refuse(state: ReviewFormState) {
	return fail(400, state);
}

/** Every seat id the picker is currently offering, for checking a posted tick list. */
function freeSeatIdsOf(groups: SeatGroup[]): Set<string> {
	const ids = new Set<string>();

	for (const group of groups) {
		for (const seat of group.seats) {
			ids.add(seat.id);
		}
	}

	return ids;
}

/**
 * The name of the first ticked seat that is no longer free, or `null` when
 * every one of them still is.
 *
 * It is asked twice: once before the database is called, which is what turns
 * the usual race into a sentence naming the seat, and once after the database
 * has refused, for a seat taken in between those two moments. A ticked id that
 * names no seat of this conference at all was not on the page it came from, so
 * it is a 404 rather than something to tell this organiser about. `error`
 * throws, so nothing past a call to this has an id from elsewhere in it.
 */
async function nameTakenSeat(
	event: RequestEvent,
	conferenceId: string,
	selectedSeatIds: string[]
): Promise<string | null> {
	const freeSeatIds = freeSeatIdsOf(
		await listSeatsByCommittee(event.locals.supabase, conferenceId)
	);
	const takenSeatId = selectedSeatIds.find((seatId) => !freeSeatIds.has(seatId));

	if (takenSeatId === undefined) {
		return null;
	}

	const label = await readSeatLabel(event.locals.supabase, conferenceId, takenSeatId);

	if (label === null) {
		error(404, NO_SUCH_SEAT);
	}

	return label;
}

/**
 * What the flash says when `remove_delegation_seat` refused.
 *
 * Its three sentences were written for an organiser to read, so two of them are
 * put into this page's own words and the third means the seat has gone
 * altogether, which reads the same way here: there is nothing left to remove.
 * Anything else is somebody else's text — a driver's, Postgres's, PostgREST's —
 * and is logged rather than shown, which `03-design/writing-style.md` asks for.
 */
function removeSeatRefusal(thrown: unknown): string {
	const databaseMessage = thrown instanceof Error ? thrown.message : String(thrown);

	if (databaseMessage.includes(SEAT_NOW_HAS_SOMEBODY)) {
		return SEAT_HAS_MEMBER_REFUSAL;
	}

	if (
		databaseMessage.includes(SEAT_NOT_RESERVED) ||
		databaseMessage.includes(SEAT_NO_LONGER_EXISTS)
	) {
		return SEAT_ALREADY_REMOVED_REFUSAL;
	}

	console.error('Could not remove a delegation seat', thrown);

	return UNEXPECTED_ERROR_TEXT;
}

/**
 * Everything the review page draws, on top of what the layout above it read.
 *
 * `parent()` is a promise for whatever the layout's own `load` returned: this
 * conference and the organisation running it. The layout let in anybody whose
 * permissions open some page of this conference, and handed those permissions
 * down; the first lines below answer a 404 unless they open this one.
 *
 * `load` runs again after every redirect, which is what redraws the page once
 * an action has changed something.
 *
 * Files under `$lib/server` only ever run on the server, so the queries below
 * cannot be reached by anything the browser does.
 */
export const load: PageServerLoad = async ({ parent, params, locals }) => {
	const { conference, permissions } = await parent();
	// A 404 unless the reader's permissions open this page, by the table in
	// `$lib/manage-pages.ts`.
	requireManagePage(permissions, 'delegations');

	const detail = await getDelegationForOrganiser(
		locals.supabase,
		conference.id,
		params.delegationId
	);

	if (!detail) {
		error(404, NO_SUCH_DELEGATION);
	}

	/*
		A delegation nobody may give seats to any more — one already turned down,
		or one the head withdrew — shows its decision and no picker, so the free
		seats of the whole conference are not worth reading for it.
	*/
	const canDecide = hasPermission(permissions, 'decide_applications');
	const canAllocate = canDecide && canAllocateToDelegation(detail.delegation.status);
	const freeSeatsByCommittee = canAllocate
		? await listSeatsByCommittee(locals.supabase, conference.id)
		: [];

	return {
		slug: conference.slug,
		timezone: conference.timezone,
		delegation: detail.delegation,
		// The views send a member's details for any conference the reader helps
		// run, so they are cut down to what the reader holds on this one.
		members: withheldMemberDetails(detail.members, detail.seatGroups, permissions),
		seatGroups: detail.seatGroups,
		/** `null` for a reader who may not read invoices, which leaves the section out. */
		invoices: mayReadInvoices(permissions) ? detail.invoices : null,
		freeSeatsByCommittee,
		/** Requested, allocated and assigned: the three numbers over the seats. */
		progress: delegationProgress(detail.delegation, delegationSeatCounts(detail.seatGroups)),
		/** False for a `rejected` or `withdrawn` delegation, which hides the picker. */
		canAllocate,
		/**
		 * Whether this reader may decide, which every form on the page needs. A
		 * reader without it sees the delegation, its seats and its note, with
		 * nothing said about what is missing. The actions ask again.
		 */
		canDecide,
		/** Which of the members' private details this reader may see. */
		detailsAccess: privateDetailsAccess(permissions)
	};
};

export const actions: Actions = {
	/**
	 * Reserve the ticked seats for this delegation, accepting it if this is the
	 * first decision.
	 *
	 * One press does both, because `allocate_delegation_seats` is what moves a
	 * `submitted` delegation to `accepted`; `allocateButtonLabel` in
	 * `$lib/delegation-review.ts` says why there is no separate Accept button.
	 */
	allocate: async (event) => {
		// The decider gate, also answering whether the reader may read invoices.
		const { conference, permissions } = await requirePermissionAndRank(
			event.locals,
			event.url,
			event.params.slug,
			'decide_applications'
		);

		const formData = await event.request.formData();
		const selectedSeatIds = formData.getAll('seatIds').map((value) => String(value));
		const decisionNote = String(formData.get('decisionNote') ?? '')
			.trim()
			.slice(0, DECISION_NOTE_MAX_LENGTH);

		const detail = await readDelegationOrFail(event, conference.id);
		const failure: ReviewFormState = {
			failedAction: 'allocate',
			message: '',
			selectedSeatIds,
			decisionNote,
			internalNote: detail.delegation.internalNote ?? ''
		};

		if (!canAllocateToDelegation(detail.delegation.status)) {
			return refuse({ ...failure, message: ALREADY_DECIDED_REFUSAL });
		}

		if (selectedSeatIds.length === 0) {
			return refuse({ ...failure, message: NO_SEATS_TICKED_REFUSAL });
		}

		/*
			The page is a moment old, so a seat it drew as free can have been given
			to somebody else since. The database refuses the whole call in that case
			but does not say which seat, so the tick list is checked against the free
			seats first and the one that has gone is named.
		*/
		const takenSeatLabel = await nameTakenSeat(event, conference.id, selectedSeatIds);

		if (takenSeatLabel !== null) {
			return refuse({ ...failure, message: seatTakenRefusal(takenSeatLabel) });
		}

		try {
			await allocateDelegationSeats(event.locals.supabase, detail.delegation.id, selectedSeatIds);
		} catch (thrown) {
			const databaseMessage = thrown instanceof Error ? thrown.message : String(thrown);

			if (databaseMessage.includes(SEAT_NOT_ALLOCATABLE)) {
				// Somebody took a seat between the check above and this call, so the
				// same question is asked again to name whichever seat that was.
				const lostSeatLabel = await nameTakenSeat(event, conference.id, selectedSeatIds);

				return refuse({
					...failure,
					message:
						lostSeatLabel === null ? SEATS_JUST_CHANGED_REFUSAL : seatTakenRefusal(lostSeatLabel)
				});
			}

			console.error('Could not allocate delegation seats', thrown);

			return refuse({ ...failure, message: UNEXPECTED_ERROR_TEXT });
		}

		/*
			`allocate_delegation_seats` stamps `decided_at` and `decided_by` but
			writes no `decision_note`, so the note the organiser typed is a second,
			small write. It only happens when there is something to write.
		*/
		if (decisionNote !== '') {
			await saveDelegationDecisionNote(event.locals.supabase, detail.delegation.id, decisionNote);
		}

		// A reader who may not read invoices would find none, and be told no fee
		// applies, so they are not asked; `?.` answers `undefined` for no invoice.
		const invoicesAfter = mayReadInvoices(permissions)
			? await listDelegationInvoices(event.locals.supabase, detail.delegation.id)
			: null;
		const invoiceNumber =
			invoicesAfter === null
				? undefined
				: (newInvoiceOf(detail.invoices, invoicesAfter)?.number ?? null);

		finish(
			event,
			'success',
			seatsAllocatedFlash(selectedSeatIds.length, detail.delegation.name, invoiceNumber)
		);
	},

	/**
	 * Give one reserved seat back, so it is free for anybody again.
	 *
	 * `ConfirmButton` renders a form of its own, so the seat travels in the
	 * address and `removeSeatActionUrl` builds it. Its answer also sends
	 * `confirm=1`, which nothing here reads: the button has already asked, in a
	 * dialog or on the confirmation page. The allocation grid says the same
	 * about its own `confirm` field.
	 */
	removeSeat: async (event) => {
		const { conference } = await requireDeciderFor(event);

		const seatId = event.url.searchParams.get('seatId') ?? '';
		const detail = await readDelegationOrFail(event, conference.id);

		const seat = detail.seatGroups
			.flatMap((group) => group.seats)
			.find((candidate) => candidate.id === seatId);

		// Another organiser removed it first, which is what was asked for anyway.
		if (!seat) {
			finish(event, 'error', SEAT_ALREADY_REMOVED_REFUSAL);
		}

		/*
			The database refuses this too, and in the same words. Asking here as
			well is what lets the page say it in its own words, which
			`05-pages/organiser/delegation-review.md` writes out.
		*/
		if (seat.holder !== null) {
			finish(event, 'error', SEAT_HAS_MEMBER_REFUSAL);
		}

		try {
			await removeDelegationSeat(event.locals.supabase, seat.id);
		} catch (thrown) {
			finish(event, 'error', removeSeatRefusal(thrown));
		}

		finish(event, 'success', SEAT_REMOVED_FLASH);
	},

	/**
	 * Mark the delegation "not accepted" and tell the head why.
	 *
	 * The seats have to be given back first. Nothing in the database enforces
	 * that — `guard_delegation_update` lets an organiser set any status — so
	 * `rejectRefusal` is the whole of the rule and it is asked here.
	 */
	reject: async (event) => {
		const { conference, user } = await requireDeciderFor(event);

		const formData = await event.request.formData();
		const decisionNote = String(formData.get('decisionNote') ?? '')
			.trim()
			.slice(0, DECISION_NOTE_MAX_LENGTH);

		const detail = await readDelegationOrFail(event, conference.id);

		const refusal = rejectRefusal(detail.delegation.status, reservedSeatCount(detail.seatGroups));

		if (refusal !== null) {
			finish(event, 'error', refusal);
		}

		await rejectDelegation(event.locals.supabase, detail.delegation.id, user.id, decisionNote);

		finish(event, 'success', REJECTED_FLASH);
	},

	/** Save the note only the organisers ever read. */
	saveInternalNote: async (event) => {
		const { conference } = await requireDeciderFor(event);

		const formData = await event.request.formData();
		const internalNote = String(formData.get('internalNote') ?? '').trim();

		const detail = await readDelegationOrFail(event, conference.id);

		if (internalNote.length > INTERNAL_NOTE_MAX_LENGTH) {
			return refuse({
				failedAction: 'saveInternalNote',
				message: INTERNAL_NOTE_TOO_LONG_REFUSAL,
				selectedSeatIds: [],
				decisionNote: '',
				internalNote
			});
		}

		await updateDelegationInternalNote(event.locals.supabase, detail.delegation.id, internalNote);

		finish(event, 'success', INTERNAL_NOTE_SAVED_FLASH);
	}
};
