import { error, redirect } from '@sveltejs/kit';
import {
	shellSubtitle,
	shellTitle,
	stepFromPathname,
	type CreationShell
} from '$lib/creation-steps';
import { requirePermission } from '$lib/server/access';
import {
	findPreviousConference,
	getCreationDraft,
	getCreationOrganization
} from '$lib/server/creation';
import { manageConferenceUrl } from '$lib/urls';
import type { LayoutServerLoad } from './$types';

/*
	Every step of a draft being created (Basics, When & where, Setup, Launch)
	sits in this folder, so this one `load` reads what they all need, and each
	step's own `+page.server.ts` gets it from `await parent()`.

	`requirePermission` sends anybody who may not edit this conference away. A
	conference that has been launched is no longer created here: it is managed.
*/
export const load: LayoutServerLoad = async ({ locals, url, params }) => {
	const { conference } = await requirePermission(locals, url, params.slug, 'edit_conference');

	if (conference.status !== 'draft') {
		redirect(303, manageConferenceUrl(params.slug));
	}

	const draft = await getCreationDraft(locals.supabase, params.slug);

	if (!draft) {
		error(404, 'This conference could not be found.');
	}

	// The two reads do not depend on each other, so they run at the same time.
	const [organization, previous] = await Promise.all([
		getCreationOrganization(locals.supabase, draft.organizationId),
		findPreviousConference(locals.supabase, draft.organizationId, draft.id)
	]);

	if (!organization) {
		error(404, 'The organisation running this conference could not be found.');
	}

	// `url.pathname` is read here, so this `load` runs again on every step.
	const step = stepFromPathname(url.pathname);
	const shell: CreationShell = {
		slug: params.slug,
		step,
		title: shellTitle(step, draft.name),
		subtitle: shellSubtitle(step)
	};

	return { draft, organization, previous, shell, now: new Date().toISOString() };
};
