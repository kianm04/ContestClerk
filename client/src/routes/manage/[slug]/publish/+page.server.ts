import { fail, redirect } from '@sveltejs/kit';
// The word to type before a draft is deleted, and its check, come from
// `$lib/accounts.ts`, where `/settings` wrote them for deleting an account.
import { validateDeleteConfirmation } from '$lib/accounts';
import { conferencePreview } from '$lib/conference-preview';
import { canPublish, publishChecklistItems } from '$lib/publish-checklist';
import {
	missingRequiredLines,
	publishReviewRows,
	publishReviewSummary,
	whenYouPublishBullets,
	worthDoingItems
} from '$lib/publish-review';
import { manageConferenceUrl, managePublishedUrl, manageUrl } from '$lib/urls';
import { requireManagePage, requirePermission } from '$lib/server/access';
import { deleteConference, setConferenceStatus, wasEverPublished } from '$lib/server/conferences';
import { setFlash } from '$lib/server/flash';
import { readConferenceChecklistCounts, readPublishReviewFacts } from '$lib/server/publish-review';
// `./$types` holds the types SvelteKit generates for this one route.
import type { Actions, PageServerLoad } from './$types';

/**
 * Step 6 of setting a draft up, "Review and publish"
 * (`specs/05-pages/organiser/publish.md`).
 *
 * `parent()` hands over what the layout's `load` in `../+layout.server.ts`
 * returned, which has already checked that the reader runs this conference.
 * `load` runs again after every form action on this page.
 */
export const load: PageServerLoad = async ({ parent, locals }) => {
	const { conference, organization, permissions } = await parent();
	// A 404 unless the reader's permissions open this page, by the table in
	// `$lib/manage-pages.ts`.
	requireManagePage(permissions, 'publish');

	// Only a draft is published. A conference that is already public has its
	// dashboard instead, and an archived one has nothing left to publish.
	if (conference.status !== 'draft') {
		redirect(303, manageConferenceUrl(conference.slug));
	}

	const now = new Date();
	const facts = await readPublishReviewFacts(
		locals.supabase,
		conference,
		organization.isStripeConnected,
		now
	);

	return {
		rows: publishReviewRows(facts),
		worthDoing: worthDoingItems(facts),
		missingLines: missingRequiredLines(facts.checklist),
		summary: publishReviewSummary(facts.checklist),
		bullets: whenYouPublishBullets(conference, now),
		preview: conferencePreview(conference, now),
		// A draft that has been public before cannot be deleted, so the foot of
		// the page says so instead of offering a button the action would refuse.
		isDeletable: !(await wasEverPublished(locals.supabase, conference.id))
	};
};

export const actions: Actions = {
	/**
	 * Make the conference public, then show the Published page.
	 *
	 * The checklist is worked out again from the database rather than read back
	 * from the form, because whether a conference may go public is not a
	 * question the browser gets to answer.
	 */
	publish: async ({ params, url, cookies, locals }) => {
		// A form action is its own request, and nothing `load` worked out reaches
		// it, so the organiser check is made here rather than trusted from
		// whenever the page was last drawn. `02-architecture/permissions.md` asks
		// every action for this.
		const { conference } = await requirePermission(locals, url, params.slug, 'edit_conference');

		if (conference.status !== 'draft') {
			return fail(400, { publishError: 'Only a draft can be published.' });
		}

		const counts = await readConferenceChecklistCounts(locals.supabase, conference.id);

		/*
			"Connect Stripe" is only ever recommended, so whether it is connected
			cannot change the answer `canPublish` gives, and `false` saves reading
			the organisation again. The eight items rather than the grouped lines,
			because only the rules matter here and they give the same answer.
		*/
		const checklist = publishChecklistItems(conference, { ...counts, isStripeConnected: false });

		if (!canPublish(checklist)) {
			// `fail` sends the page back with a 400 status and this result as
			// `form`, which the page shows as an error notice by the button.
			return fail(400, { publishError: 'Finish the required checklist items first.' });
		}

		await setConferenceStatus(locals.supabase, conference.id, 'published');

		// A redirecting action cannot return anything, so the message travels in
		// a one-shot cookie that the root layout reads and throws away.
		setFlash(cookies, { tone: 'success', message: `${conference.name} is now public.` });
		redirect(303, managePublishedUrl(params.slug));
	},

	/**
	 * Throw away a conference that was never public.
	 *
	 * Only a draft can go: a published or archived conference has applications
	 * and seats hanging off it, and the database refuses the delete as well.
	 *
	 * It cannot be undone, so the form also asks the organiser to type a word,
	 * on top of the question `ConfirmButton` asks in a dialog or, without
	 * JavaScript, on the confirmation page.
	 */
	deleteDraft: async ({ params, url, request, cookies, locals }) => {
		// Checked again for the reason given on `publish` above.
		const { conference } = await requirePermission(locals, url, params.slug, 'edit_conference');

		if (conference.status !== 'draft') {
			return fail(400, { deleteError: 'Only a draft can be deleted.' });
		}

		// A draft that was public once stays on record: people may have applied
		// to it or linked to it. The database refuses the delete as well.
		if (await wasEverPublished(locals.supabase, conference.id)) {
			return fail(400, {
				deleteError:
					'A conference that has been public cannot be deleted. Publish it again and archive it after its last day.'
			});
		}

		const formData = await request.formData();
		const typed = String(formData.get('confirmation') ?? '');
		const wrongWord = validateDeleteConfirmation(typed);

		// Shown under the box the word goes in, at the foot of the page, which
		// is where the organiser is looking when they press "Delete draft".
		if (wrongWord) {
			return fail(400, { deleteError: wrongWord });
		}

		await deleteConference(locals.supabase, conference.id);

		setFlash(cookies, { tone: 'success', message: `${conference.name} is deleted.` });

		// The organiser area rather than back to this page: the conference whose
		// page this is has just stopped existing.
		redirect(303, manageUrl());
	}
};
