/**
 * What the Basics and When & where steps (Trello fe3reN7Y) share on the
 * server: finding the draft a form action is about, and saving a step.
 *
 * Files under `$lib/server` only ever run on the server. Every function takes
 * the request's own Supabase client, so Row Level Security decides what the
 * signed-in organiser may write.
 */

import { error, redirect } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CreationDraft, PrefillSources } from '$lib/creation-draft';
import type { DraftValues } from '$lib/creation-prefill';
import { planDraftSave } from '$lib/creation-save';
import { manageConferenceUrl } from '$lib/urls';
import { requirePermission } from './access';
import { getCreationDraft, updateCreationDraft } from './creation';

/**
 * The draft at `slug`, for a form action. An action is its own request, so the
 * organiser check is made again rather than trusted from when the page was
 * drawn. A conference launched in the meantime is managed, not created: the
 * organiser is sent to its manage page, as the layout does for a visit.
 */
export async function requireCreationDraft(
	locals: App.Locals,
	url: URL,
	slug: string
): Promise<CreationDraft> {
	await requirePermission(locals, url, slug, 'edit_conference');
	const draft = await getCreationDraft(locals.supabase, slug);

	if (!draft) {
		error(404, 'This conference could not be found.');
	}

	if (draft.status !== 'draft') {
		redirect(303, manageConferenceUrl(slug));
	}

	return draft;
}

/** What one step's save writes besides the draft's values. */
export type CreationStepSaveOptions = {
	/** Sources the step knows better than "the organiser changed it"; see `planDraftSave`. */
	sourceOverrides?: PrefillSources;
	/** The venue's address, which is not a prefilled value; `undefined` leaves it alone. */
	venueAddress?: string | null;
};

/**
 * Save `patch` over `draft`, with the generated values that follow from it,
 * and read the draft back as it is now stored, so the page can show the
 * values the server worked out (next year's name, the timezone of a city).
 */
export async function saveCreationStep(
	supabase: SupabaseClient,
	draft: CreationDraft,
	patch: Partial<DraftValues>,
	options: CreationStepSaveOptions = {}
): Promise<CreationDraft> {
	const plan = planDraftSave(draft, patch, new Date(), options.sourceOverrides);
	await updateCreationDraft(supabase, draft.id, plan.patch, plan.sources);

	if (options.venueAddress !== undefined && options.venueAddress !== draft.venueAddress) {
		const { error: venueError } = await supabase
			.from('conferences')
			.update({ venue_address: options.venueAddress })
			.eq('id', draft.id);

		if (venueError) {
			throw new Error(`Could not save the venue's address: ${venueError.message}`);
		}
	}

	return (await getCreationDraft(supabase, draft.slug)) ?? draft;
}
