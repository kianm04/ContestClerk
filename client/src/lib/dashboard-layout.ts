/**
 * Two layout choices of the conference dashboard that depend on its phase:
 * which quiet action sits at the bottom of the page, and whether the first
 * "Needs you" line holds the page's one filled button
 * (`specs/05-pages/organiser/dashboard.md`, "Layout", and P1 in
 * `03-design/streamlining/design.md`).
 *
 * Nothing here talks to Supabase or knows any Svelte, so the choices can be
 * read and tested as a table.
 */

import type { ConferencePhase } from '$lib/conference-phase';
import type { ConferenceStatus } from '$lib/conferences';

/** The action a quiet row at the bottom of the dashboard offers. */
export type QuietAction = 'unpublish' | 'archive';

/**
 * The quiet action the dashboard offers, or `null` for none.
 *
 * "Unpublish" only while applications are taken or seats allocated, and only
 * while nobody holds a seat, since the action would only ever be refused after
 * that. "Archive" only once a published conference is over: an archived one
 * is also After, and has nothing left to archive. Nothing on conference days,
 * since a running conference can be neither unpublished nor archived.
 */
export function quietAction(
	phase: ConferencePhase,
	status: ConferenceStatus,
	isAnybodySeated: boolean
): QuietAction | null {
	const isBeforeTheDays = phase === 'applications' || phase === 'allocation';

	if (isBeforeTheDays && status === 'published' && !isAnybodySeated) {
		return 'unpublish';
	}

	if (phase === 'after' && status === 'published') {
		return 'archive';
	}

	return null;
}

/**
 * Whether the first "Needs you" line's button is the page's one filled button
 * (P1). On conference days "Post an announcement" in the panel at the top is,
 * and every button below it is secondary.
 */
export function isFirstAttentionLinePrimary(phase: ConferencePhase): boolean {
	return phase === 'applications' || phase === 'allocation' || phase === 'after';
}
