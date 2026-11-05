/**
 * What saving a creation step writes (Trello fe3reN7Y). Every step saves the
 * same way: the values that changed become the organiser's own (`user`), and
 * then the generated values that depend on them follow, such as the year in a
 * generated name or a closing date counted back from the first day.
 *
 * Working that out is kept apart from the database, so it can be tested on its
 * own; `$lib/server/creation-step-save.ts` writes what this plans.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import type { CreationDraft, PrefillSources } from '$lib/creation-draft';
import { applyCascades, markUserOverrides, type DraftValues } from '$lib/creation-prefill';

/** The values and the sources one save writes. */
export type DraftSavePlan = { patch: Partial<DraftValues>; sources: PrefillSources };

/**
 * The save of `patch` over `draft` at `now`. Every value that differs from the
 * draft is marked `user`; `sourceOverrides` then names sources the caller
 * knows better, such as `previous_conference` for "Use these dates", which is
 * a suggestion accepted rather than a value typed. The cascades run last, on
 * the draft as it will be, and are added to the patch.
 */
export function planDraftSave(
	draft: CreationDraft,
	patch: Partial<DraftValues>,
	now: Date,
	sourceOverrides: PrefillSources = {}
): DraftSavePlan {
	const sources = { ...markUserOverrides(draft.prefillSources, draft, patch), ...sourceOverrides };
	const saved: CreationDraft = { ...draft, ...patch, prefillSources: sources };

	return { patch: { ...patch, ...applyCascades(saved, now) }, sources };
}
