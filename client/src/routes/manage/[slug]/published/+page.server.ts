import { redirect } from '@sveltejs/kit';
import { requireManagePage } from '$lib/server/access';
import { conferencePreview } from '$lib/conference-preview';
import { committeesWithoutChairSentence } from '$lib/publish-review';
import { publishedHeadline, publishedNextSteps } from '$lib/published-page';
import { manageConferenceUrl } from '$lib/urls';
import { listReviewCommittees } from '$lib/server/publish-review';
// `./$types` holds the types SvelteKit generates for this one route.
import type { PageServerLoad } from './$types';

/**
 * The page "Publish conference" leads to (`specs/05-pages/organiser/publish.md`):
 * the conference is public, here is its link, and here is what to do next.
 *
 * `parent()` hands over what the layout's `load` in `../+layout.server.ts`
 * returned, which has already checked that the reader runs this conference.
 */
export const load: PageServerLoad = async ({ parent, locals }) => {
	const { conference, permissions } = await parent();
	// A 404 unless the reader's permissions open this page, by the table in
	// `$lib/manage-pages.ts`.
	requireManagePage(permissions, 'publish');

	// A draft has nothing to celebrate yet, and an archived conference is over,
	// so both are sent to the dashboard, which says where they stand.
	if (conference.status !== 'published') {
		redirect(303, manageConferenceUrl(conference.slug));
	}

	const now = new Date();
	const committees = await listReviewCommittees(locals.supabase, conference.id);
	const withoutChair = committeesWithoutChairSentence(committees);

	return {
		headline: publishedHeadline(conference, now),
		nextSteps: publishedNextSteps(conference.slug, withoutChair),
		preview: conferencePreview(conference, now)
	};
};
