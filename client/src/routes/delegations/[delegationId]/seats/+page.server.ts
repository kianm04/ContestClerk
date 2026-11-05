import { redirect } from '@sveltejs/kit';
import { committeeHeading } from '$lib/committees';
import {
	ONLY_HEADS_ASSIGN_SEATS,
	SEAT_FREED_FLASH,
	assignSeatRefusalSentence,
	canChangeDelegationSeats,
	memberFieldName,
	memberSeatedFlash,
	unassignSeatRefusalSentence,
	type AssignSeatRefusal,
	type DelegationSeat,
	type DelegationSeatCommittee,
	type DelegationSeatGroup,
	type UnassignSeatRefusal,
	type UnseatedMember
} from '$lib/delegations';
import { delegationSeatsUrl, delegationUrl } from '$lib/urls';
import { requireDelegationHead, requireOnboarded } from '$lib/server/access';
import {
	assignDelegationSeat,
	listDelegationSeats,
	readMemberName,
	unassignDelegationSeat
} from '$lib/server/delegations';
import { setFlash } from '$lib/server/flash';
// `./$types` holds the types SvelteKit generates for this one route, so
// `PageServerLoad`, `Actions` and `RequestEvent` already know that this address
// has a `delegationId` in it and what the layout above hands down.
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/**
 * What the refusals that name nobody pass as the member's name.
 *
 * `assignSeatRefusalSentence` takes a name because two of its six sentences say
 * one. The other four are about the seat rather than about a person — no seat
 * was sent, the seat is not this delegation's, somebody is already in it — and
 * ignore the argument, so they pass this rather than a name they do not have.
 */
const NOBODY_NAMED = '';

/**
 * One of this delegation's seats, found by id, with the committee it sits in.
 *
 * The committee comes back with it because the success flash names both, and
 * the groups are the only place the seat's committee is written down.
 */
type FoundSeat = {
	seat: DelegationSeat;
	committee: DelegationSeatCommittee;
};

/**
 * The head posting one of the two actions, with the delegation and its
 * conference.
 *
 * Every action asks again rather than trusting what `load` worked out: a form
 * action is its own request and is handed nothing `load` decided, which is what
 * `specs/02-architecture/permissions.md` asks of every action. A plain member
 * who posts a form anyway gets the 404 a stranger gets, never a 403. The
 * dashboard next door has the same wrapper for the same reason.
 */
function requireHead(event: RequestEvent) {
	return requireDelegationHead(event.locals, event.url, event.params.delegationId);
}

/** The seat with this id, or `null` when this delegation holds no such seat. */
function findSeat(groups: DelegationSeatGroup[], seatId: string): FoundSeat | null {
	for (const group of groups) {
		const seat = group.seats.find((candidate) => candidate.id === seatId);

		if (seat) {
			return { seat, committee: group.committee };
		}
	}

	return null;
}

/** The member's name from the list the page just read, or `null` for anybody else. */
function unseatedMemberName(unseatedMembers: UnseatedMember[], userId: string): string | null {
	const member = unseatedMembers.find((candidate) => candidate.userId === userId);

	if (!member) {
		return null;
	}

	return member.fullName;
}

/**
 * How both actions end: leave a one-shot message and come back to this page.
 *
 * `redirect` works by throwing rather than by returning, so nothing after a
 * call to this ever runs; that is what `never` says.
 */
function finish(
	event: RequestEvent,
	delegationId: string,
	tone: 'success' | 'warning',
	message: string
): never {
	setFlash(event.cookies, { tone, message });
	redirect(303, delegationSeatsUrl(delegationId));
}

/** Turn an `assign` down, in the words `seats.md` quotes for that refusal. */
function refuseAssign(
	event: RequestEvent,
	delegationId: string,
	refusal: AssignSeatRefusal,
	memberName: string
): never {
	finish(event, delegationId, 'warning', assignSeatRefusalSentence(refusal, memberName));
}

/** Turn an `unassign` down, in the words `seats.md` quotes for that refusal. */
function refuseUnassign(
	event: RequestEvent,
	delegationId: string,
	refusal: UnassignSeatRefusal
): never {
	finish(event, delegationId, 'warning', unassignSeatRefusalSentence(refusal));
}

/**
 * Everything the seats page draws, on top of what the layout above it read.
 *
 * `parent()` is a promise for whatever the layout's own `load` returned, and
 * waiting for it is what makes the check above this page run first: the layout
 * calls `requireDelegationMember`, which sends a visitor to the sign in page and
 * throws a 404 at anybody who is not in this delegation. So the only person this
 * page still has to turn away is a member who is not a head, and they are sent
 * back to the dashboard with a message rather than shown a 404: they belong
 * here, they simply may not assign seats. `requireDelegationHead` cannot do
 * that, because it answers a member with the same 404 a stranger gets, which is
 * right for the two actions below and wrong for opening the page.
 *
 * `requireOnboarded` is then asked only for the reader's own id, which the
 * layout does not hand down and which the member dropdown marks "(you)" with.
 *
 * The delegation, the conference and the seat counts are not returned again:
 * SvelteKit merges the layout's data into the page's, so `data.delegation`,
 * `data.conference` and `data.seatCounts` are already there.
 *
 * The clock is read here rather than in a component, because `new Date()` in a
 * component answers one thing while the server renders the page and another a
 * moment later in the browser, and Svelte reports that as a hydration mismatch.
 */
export const load: PageServerLoad = async ({ locals, url, cookies, parent }) => {
	const { delegation, conference, myRole } = await parent();
	const user = await requireOnboarded(locals, url);

	if (myRole !== 'head') {
		setFlash(cookies, { tone: 'warning', message: ONLY_HEADS_ASSIGN_SEATS });
		redirect(303, delegationUrl(delegation.id));
	}

	const { groups, unseatedMembers } = await listDelegationSeats(locals.supabase, delegation.id);

	return {
		/** The delegation's seats under their committees, in the organisers' order. */
		groups,
		/** Everybody in the delegation who has no seat yet: what the dropdowns offer. */
		unseatedMembers,
		/** The reader's own id, so the dropdown can mark their own name "(you)". */
		myUserId: user.id,
		/** False from the conference's first day, when only organisers may still move people. */
		canChangeSeats: canChangeDelegationSeats(conference, new Date())
	};
};

export const actions: Actions = {
	/**
	 * Put one member of this delegation into one of its seats.
	 *
	 * The form sends a hidden `seatId` and the chosen member under
	 * `memberFieldName(seatId)`, because the page draws one dropdown per seat and
	 * they cannot all be called `userId`; `memberFieldName` in `$lib/delegations`
	 * is where that rule is written and says why.
	 *
	 * Every ending redirects back to this same page, which is what `seats.md`
	 * asks for, and the message travels in a one-shot cookie that the root layout
	 * reads and throws away. A redirecting action cannot return anything, so
	 * there is no result type to declare.
	 */
	assign: async (event) => {
		const { delegation } = await requireHead(event);

		const formData = await event.request.formData();
		const seatId = String(formData.get('seatId') ?? '');

		/* `seats.md` quotes no sentence for a post with no seat in it at all. "That
		   seat is not allocated to your delegation." is the nearest true one, and
		   it is also what a made-up seat id gets a few lines below, so the two
		   cannot be told apart by trying them. */
		if (seatId === '') {
			refuseAssign(event, delegation.id, 'not_your_delegation', NOBODY_NAMED);
		}

		const userId = String(formData.get(memberFieldName(seatId)) ?? '');

		if (userId === '') {
			refuseAssign(event, delegation.id, 'no_member', NOBODY_NAMED);
		}

		// Read again rather than trusted from whenever the page was last drawn:
		// another head may have filled the seat since.
		const { groups, unseatedMembers } = await listDelegationSeats(
			event.locals.supabase,
			delegation.id
		);

		const found = findSeat(groups, seatId);

		if (!found) {
			refuseAssign(event, delegation.id, 'not_your_delegation', NOBODY_NAMED);
		}

		if (found.seat.holder) {
			refuseAssign(event, delegation.id, 'seat_taken', NOBODY_NAMED);
		}

		/* The dropdown only offers members who have no seat yet, so the ordinary
		   path finds the name in the list that was just read and asks the database
		   nothing. Any other id belongs to somebody only a refusal sentence will
		   ever name, and that is the one path that pays for the second query. */
		let memberName = unseatedMemberName(unseatedMembers, userId);

		if (memberName === null) {
			memberName = await readMemberName(event.locals.supabase, userId);
		}

		/* Where 'not_a_member', 'already_seated' and 'locked' come from: each is a
		   sentence the `check_seat_allocation` trigger raised. An update that Row
		   Level Security refused without a word of explanation comes back as
		   'not_your_delegation'. */
		const refusal = await assignDelegationSeat(event.locals.supabase, seatId, userId);

		if (refusal) {
			refuseAssign(event, delegation.id, refusal, memberName);
		}

		/* The committee is named by its short name when it has one, which is what
		   `delegateMovedFlash` on the organisers' allocation grid does with the
		   same event, so a head who is also an organiser reads one name for it. */
		const committeeName = committeeHeading(found.committee);

		finish(
			event,
			delegation.id,
			'success',
			memberSeatedFlash(memberName, found.seat.name, committeeName)
		);
	},

	/**
	 * Take whoever is in one of this delegation's seats out of it.
	 *
	 * `ConfirmButton` renders a `<form>` of its own and takes no extra hidden
	 * fields, so the seat travels in the address as `?seat=`, which
	 * `unassignDelegationSeatUrl` in `$lib/urls.ts` builds. The organisers'
	 * allocation grid reads its own seat back the same way and says so at both
	 * ends.
	 *
	 * `ConfirmButton`'s answer also sends `confirm=1`, which nothing here reads:
	 * the button has already asked, in a dialog with JavaScript and on the
	 * confirmation page without it.
	 */
	unassign: async (event) => {
		const { delegation } = await requireHead(event);

		const seatId = event.url.searchParams.get('seat') ?? '';

		if (seatId === '') {
			refuseUnassign(event, delegation.id, 'not_your_delegation');
		}

		const { groups } = await listDelegationSeats(event.locals.supabase, delegation.id);
		const found = findSeat(groups, seatId);

		if (!found) {
			refuseUnassign(event, delegation.id, 'not_your_delegation');
		}

		/* The database cannot refuse this one: writing `null` over a `user_id`
		   that is already `null` changes nothing, so the policy and the trigger
		   both allow it and a row still comes back. */
		if (found.seat.holder === null) {
			refuseUnassign(event, delegation.id, 'already_empty');
		}

		const refusal = await unassignDelegationSeat(event.locals.supabase, seatId);

		if (refusal) {
			refuseUnassign(event, delegation.id, refusal);
		}

		finish(event, delegation.id, 'success', SEAT_FREED_FLASH);
	}
};
