/**
 * The five steps of creating a conference (Trello fe3reN7Y): Organisation,
 * Basics, When & where, Setup and Launch. The indicator at the top of every
 * creation page draws them, and a draft remembers which one it is on in its
 * `creation_step` column so that the organiser comes back to where they left off.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import type { ResolvedPathname } from '$app/types';
import type { Database } from '$lib/database.types';
import { createConferenceUrl, createStepUrl } from '$lib/urls';

/** The `creation_step` enum: the four steps a saved draft can be on. */
export type SavedCreationStep = Database['public']['Enums']['creation_step'];

/** Every step, the Organisation step included, which exists before the draft does. */
export type CreationStepKey = 'organization' | SavedCreationStep;

/** Whether a step is behind the reader, under their feet or still ahead. */
export type CreationStepState = 'done' | 'current' | 'upcoming';

/** One circle on the indicator, and where pressing it goes. */
export type CreationStep = {
	key: CreationStepKey;
	/** 1 to 5. */
	number: number;
	label: string;
	state: CreationStepState;
	/** A done step can be revisited; the current and the upcoming ones have no link. */
	href: ResolvedPathname | null;
};

/** The steps in order, with the word under each circle. */
export const CREATION_STEP_LABELS: { key: CreationStepKey; label: string }[] = [
	{ key: 'organization', label: 'Organisation' },
	{ key: 'basics', label: 'Basics' },
	{ key: 'when', label: 'When & where' },
	{ key: 'setup', label: 'Setup' },
	{ key: 'launch', label: 'Launch' }
];

/** The position of a step in the list, counted from 0. */
function indexOf(key: CreationStepKey): number {
	return CREATION_STEP_LABELS.findIndex((step) => step.key === key);
}

/** The address of a step: `/create` for the first, `/create/<slug>/<step>` for the rest. */
function hrefOf(key: CreationStepKey, slug: string): ResolvedPathname {
	if (key === 'organization') {
		return createConferenceUrl();
	}

	return createStepUrl(slug, key);
}

/**
 * The indicator for a draft at `slug` while the reader is on `current`.
 *
 * Before the draft exists there is no slug, so only the first step can be on
 * screen and nothing has a link.
 */
export function creationSteps(slug: string | null, current: CreationStepKey): CreationStep[] {
	const currentIndex = indexOf(current);

	return CREATION_STEP_LABELS.map((step, index) => {
		let state: CreationStepState = 'upcoming';

		if (index < currentIndex) {
			state = 'done';
		} else if (index === currentIndex) {
			state = 'current';
		}

		// The Organisation step is settled once the draft exists, so it stays a
		// link back to `/create` rather than to the draft, which has no such page.
		const href = state === 'done' && slug !== null ? hrefOf(step.key, slug) : null;

		return { key: step.key, number: index + 1, label: step.label, state, href };
	});
}

/** The step after this one, or `null` after Launch. */
export function stepAfter(key: CreationStepKey): CreationStepKey | null {
	const next = CREATION_STEP_LABELS[indexOf(key) + 1];

	return next === undefined ? null : next.key;
}

/** The step before this one, or `null` before Organisation. */
export function stepBefore(key: CreationStepKey): CreationStepKey | null {
	const previous = CREATION_STEP_LABELS[indexOf(key) - 1];

	return previous === undefined ? null : previous.key;
}

/**
 * The step a draft should resume at: the furthest one it has reached, which is
 * what `creation_step` records. A draft that already reached Launch opens
 * there, because its earlier steps are all behind it.
 */
export function isSavedCreationStep(text: string): text is SavedCreationStep {
	return text === 'basics' || text === 'when' || text === 'setup' || text === 'launch';
}

/**
 * The step to record when the reader moves on from `current` to `reached`:
 * never a step behind the furthest one already reached, so that going back to
 * fix a name does not send a later visit back there too.
 */
export function furthestStep(
	saved: SavedCreationStep,
	reached: SavedCreationStep
): SavedCreationStep {
	return indexOf(reached) > indexOf(saved) ? reached : saved;
}

/** "Continue to basics": the words on the primary button at the foot of a step. */
export function continueLabel(key: CreationStepKey): string | null {
	const next = stepAfter(key);

	if (next === null) {
		return null;
	}

	const label = CREATION_STEP_LABELS[indexOf(next)].label;

	// "When & where" keeps its capital letters; the other names are one word.
	return `Continue to ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
}

/** What the shell around every creation page draws: the title, the line under it and the indicator. */
export type CreationShell = {
	/** `null` on the Organisation step, before the draft exists. */
	slug: string | null;
	step: CreationStepKey;
	title: string;
	/** The sentence under the title, from `shellSubtitle()`. */
	subtitle: string;
};

/**
 * The step a creation address is on, from its last segment:
 * `/create/delft-mun-2027/when` is When & where, and `/create` itself, or
 * anything that is not a step, is Organisation.
 */
export function stepFromPathname(pathname: string): CreationStepKey {
	const lastSegment = pathname.replace(/\/+$/, '').split('/').pop() ?? '';

	return isSavedCreationStep(lastSegment) ? lastSegment : 'organization';
}

/**
 * The H1 of a creation page. The first three steps make the conference, so
 * they share one title; by Setup the conference has a name, and the title
 * says which one is being set up.
 */
export function shellTitle(step: CreationStepKey, draftName: string): string {
	if (step === 'setup') {
		return `Set up ${draftName}`;
	}

	if (step === 'launch') {
		return `Ready to launch ${draftName}`;
	}

	return 'Create a conference';
}

/**
 * The sentence under the H1 of each step, word for word from the product
 * owner's mockups: it tells the organiser what this step is for.
 */
const SUBTITLES: Record<CreationStepKey, string> = {
	organization: "Start with the organisation. We'll use this to pre-fill your conference details.",
	basics:
		'Set up the basics. They appear on your public page and help delegates understand your conference.',
	when: "Set the dates and location. We'll use this information for deadlines and scheduling.",
	setup: 'Configure the rest. You can skip anything and change it later.',
	launch: "Review what's ready and choose how to launch your conference."
};

/** The line under the H1 of a creation page. */
export function shellSubtitle(step: CreationStepKey): string {
	return SUBTITLES[step];
}
