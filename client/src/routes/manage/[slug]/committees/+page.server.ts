import { fail, redirect } from '@sveltejs/kit';
import { editableCommittees } from '$lib/committee-access';
import { readDroppedPlace } from '$lib/drag-order';
import { hasCommitteePermission, hasPermission } from '$lib/permissions';
import { manageCommitteesUrl } from '$lib/urls';
import { requireManagePage, requirePermission } from '$lib/server/access';
import { listCommitteesForManage, moveCommittee } from '$lib/server/manage-committees';
import { placeOrderedRow } from '$lib/server/ordered-rows';
import type { Actions, PageServerLoad } from './$types';

/**
 * Every committee of this conference the reader edits, in the order the
 * organiser put them, and how many seats they come to altogether. Somebody who
 * edits only their own committees sees those, and cannot add or reorder any.
 *
 * `parent()` is a promise for whatever the layout's own `load` returned: this
 * conference and the organisation running it. The layout let in anybody whose
 * permissions open some page of this conference, and handed those permissions
 * down; the first lines below answer a 404 unless they open this one.
 *
 * Files under `$lib/server` only ever run on the server, so the query below
 * cannot reach the browser.
 */
export const load: PageServerLoad = async ({ parent, locals }) => {
	const { conference, permissions } = await parent();
	// A 404 unless the reader's permissions open this page, by the table in
	// `$lib/manage-pages.ts`.
	requireManagePage(permissions, 'committees');

	const committees = editableCommittees(
		permissions,
		await listCommitteesForManage(locals.supabase, conference.id)
	);

	// The header says "8 committees · 180 seats", so the seats are added up here
	// and the page shows what it is given rather than counting for itself.
	let seatTotal = 0;

	for (const committee of committees) {
		seatTotal += committee.seatCounts.total;
	}

	return {
		committees,
		seatTotal,
		// Adding and reordering committees is a conference-wide editor's.
		isWholeEditor: hasPermission(permissions, 'manage_committees'),
		// The rows whose "Chair room" link the reader may follow.
		roomCommitteeIds: committees
			.filter((committee) => hasCommitteePermission(permissions, committee.id, 'run_room'))
			.map((committee) => committee.id)
	};
};

export const actions: Actions = {
	/**
	 * Swap one committee with the neighbour above or below it.
	 *
	 * Every row has a small form of its own carrying nothing but the committee's
	 * id, and the two arrows inside it post to `?/move&direction=up` and
	 * `?/move&direction=down`. SvelteKit lets a form action carry a query string
	 * of its own, which is the same trick `details/+page.server.ts` uses for
	 * `?/removeImage&kind=banner`. It means one small form per row instead of
	 * two, and it is an ordinary HTML form either way, so reordering works with
	 * JavaScript switched off.
	 */
	move: async ({ params, url, request, locals }) => {
		// A form action is its own request, and nothing `load` worked out reaches
		// it, so the check is made here rather than trusted from whenever the
		// page was last drawn. Only a conference-wide `manage_committees` holder
		// reorders the committees, which `requirePermission` asks.
		const { conference } = await requirePermission(locals, url, params.slug, 'manage_committees');

		const direction = url.searchParams.get('direction');

		if (direction !== 'up' && direction !== 'down') {
			// `fail` sends the page back with a 400 status and this result as
			// `form`, which the page shows as an error notice. Only a request
			// somebody put together by hand can get here: the two buttons on every
			// row always name one of the two directions.
			return fail(400, { message: 'A committee can only move up or down.' });
		}

		const formData = await request.formData();
		const committeeId = String(formData.get('committeeId') ?? '');

		if (!committeeId) {
			return fail(400, { message: 'That request did not say which committee to move.' });
		}

		await moveCommittee(locals.supabase, conference.id, committeeId, direction);

		// Straight back to the list with no flash: the committee has visibly
		// changed places, which says everything a message would.
		redirect(303, manageCommitteesUrl(params.slug));
	},

	/**
	 * Put one committee at the place it was dragged to (T132).
	 *
	 * The list's hidden drop form posts the committee's id and its new `place`,
	 * counting from 1. Dragging needs JavaScript, so only the page's script
	 * sends this; the arrows above stay the way without it.
	 */
	moveTo: async ({ params, url, request, locals }) => {
		// Asked again here for the reason `move` gives.
		const { conference } = await requirePermission(locals, url, params.slug, 'manage_committees');

		const formData = await request.formData();
		const committeeId = String(formData.get('committeeId') ?? '');
		const toIndex = readDroppedPlace(formData.get('place'));

		if (!committeeId || toIndex === null) {
			return fail(400, { message: 'That request did not say which committee to move, or where.' });
		}

		const isPlaced = await placeOrderedRow(
			locals.supabase,
			{ table: 'committees', ownerColumn: 'conference_id', ownerId: conference.id },
			committeeId,
			toIndex
		);

		if (!isPlaced) {
			return fail(404, { message: 'That committee is no longer in this conference.' });
		}

		redirect(303, manageCommitteesUrl(params.slug));
	}
};
