import { fail, redirect } from '@sveltejs/kit';
import { movedQueue, queuedAmendments, readQueueMove } from '$lib/amendment-queue';
import { daisSections } from '$lib/chair-resolutions';
import { papersPageTitle } from '$lib/committee-papers';
import type { Flash } from '$lib/flash';
import { AMENDMENT_NOT_FOUND } from '$lib/paper-amendments';
import { chairAmendmentQueueUrl } from '$lib/urls';
import { requireCommitteePermission } from '$lib/server/access';
import { listDaisPapers } from '$lib/server/chair-resolutions';
import { readPaperCommittee } from '$lib/server/committee-papers';
import { readCommitteeAmendments, reorderAmendments } from '$lib/server/paper-amendments';
import type { Actions, PageServerLoad } from './$types';

/**
 * The papers the delegates have sent to the dais (`docs/committee-papers.md`,
 * steps 5 and 7), in the order the dais works through them: waiting for an
 * answer, the amendments waiting for the dais, approved but not yet
 * introduced, on the floor, and decided.
 *
 * Runs on the server after the chair layout's `load`, which has already let
 * in only a member of the dais who may run the room; `parent()` hands over
 * what it returned. Every chair runs the room, so every chair reviews papers.
 */
export const load: PageServerLoad = async ({ parent, locals }) => {
	const { committee } = await parent();

	const [settings, papers, amendments] = await Promise.all([
		readPaperCommittee(locals.supabase, committee.id),
		listDaisPapers(locals.supabase, committee.id),
		readCommitteeAmendments(locals.supabase, committee.id)
	]);

	return {
		// "Resolutions", or "Directives" in a crisis committee.
		title: papersPageTitle(settings.format),
		sections: daisSections(papers),
		// One queue across every introduced draft, in the order the dais will take them.
		amendmentQueue: queuedAmendments(amendments)
	};
};

/** Refuse with a sentence the root layout shows as a toast, leaving the page as it was. */
function refuse(message: string) {
	const flash: Flash = { tone: 'error', message };

	return fail(400, { flash });
}

export const actions: Actions = {
	/**
	 * "Move up" or "Move down": swap one amendment with its neighbour in the
	 * queue. Each is a plain form, so the dais reorders without JavaScript.
	 */
	moveAmendment: async ({ locals, url, params, request }) => {
		// An action is its own request, so who may order the queue is asked again.
		const { committee } = await requireCommitteePermission(
			locals,
			url,
			params.slug,
			params.committeeSlug,
			'run_room'
		);
		const formData = await request.formData();
		const amendmentId = formData.get('amendment');
		const move = readQueueMove(formData);
		const queue = queuedAmendments(await readCommitteeAmendments(locals.supabase, committee.id));
		const queueIds = queue.map((amendment) => amendment.id);
		const moved =
			typeof amendmentId === 'string' && move !== null
				? movedQueue(queueIds, amendmentId, move)
				: null;

		if (moved === null) return refuse(AMENDMENT_NOT_FOUND);

		const change = await reorderAmendments(locals.supabase, committee.id, moved);

		if (change.refusal !== null) return refuse(change.refusal);

		// Back to the list at the queue, which a browser without JavaScript scrolls to.
		redirect(303, chairAmendmentQueueUrl(params.slug, params.committeeSlug));
	}
};
