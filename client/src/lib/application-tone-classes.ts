/**
 * The Tailwind classes for each colour a card at `/applications` can take: its
 * status badge, its progress line and its lines of materials.
 *
 * Written out in full, because Tailwind reads the class names out of this file
 * and cannot follow a name that is glued together while the page runs.
 */

import type { ProgressTone } from '$lib/application-progress';

/** Words in the tone's colour. */
export const TONE_TEXT_CLASSES: Record<ProgressTone, string> = {
	success: 'text-success-700',
	warning: 'text-warning-700',
	danger: 'text-danger-700',
	neutral: 'text-ink-600'
};

/** A pale background in the tone's colour, behind the status badge. */
export const TONE_SOFT_CLASSES: Record<ProgressTone, string> = {
	success: 'bg-success-100',
	warning: 'bg-warning-100',
	danger: 'bg-danger-100',
	neutral: 'bg-neutral-100'
};

/**
 * A solid fill, for a dot or a finished stretch of the progress line.
 * The brighter `-500` shades, because these shapes carry no words.
 */
export const TONE_FILL_CLASSES: Record<ProgressTone, string> = {
	success: 'bg-success-500',
	warning: 'bg-warning-500',
	danger: 'bg-danger-500',
	neutral: 'bg-ink-600'
};

/** The same colours as a ring, for the step the application is on now. */
export const TONE_RING_CLASSES: Record<ProgressTone, string> = {
	success: 'border-success-500',
	warning: 'border-warning-500',
	danger: 'border-danger-500',
	neutral: 'border-ink-600'
};

/** The same colours for an icon, such as the tick of a finished step. */
export const TONE_ICON_CLASSES: Record<ProgressTone, string> = {
	success: 'text-success-500',
	warning: 'text-warning-500',
	danger: 'text-danger-500',
	neutral: 'text-ink-600'
};
