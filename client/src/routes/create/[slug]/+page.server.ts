import { redirect } from '@sveltejs/kit';
import { setFlash } from '$lib/server/flash';
import { createStepUrl } from '$lib/urls';
import type { PageServerLoad } from './$types';

/*
	`/create/<slug>` itself has nothing to show: it is where "Continue setup"
	points, and it sends the organiser on to the step they last reached.
	`parent()` is the draft the layout above already read.
*/
export const load: PageServerLoad = async ({ parent, params, cookies }) => {
	const { draft, flash } = await parent();

	// The root layout has just read the one-shot message out of its cookie, as
	// it does on every request, and this page shows nothing itself. The message
	// is put back so the step the organiser lands on shows it, the way
	// `/manage/[slug]` keeps "… is no longer public." across its own redirect.
	if (flash !== null) {
		setFlash(cookies, flash);
	}

	redirect(303, createStepUrl(params.slug, draft.creationStep));
};
