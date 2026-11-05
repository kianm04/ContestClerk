/**
 * The Basics design's look for its labels and fields, shared by the files in
 * this folder so the name, tagline, description and links all match.
 *
 * shadcn's `Input` and `Textarea` set their own type size (`text-base
 * md:text-sm`); naming both of those again here replaces them, because the
 * components merge classes with `cn`, so a field's words are the design's 16.
 */

/** A field's label: 16 over 22, semibold, the design's dark blue-black. */
export const LABEL_CLASSES = 'block fs-16 lh-22 font-semibold text-creation-ink-900';

/** A field's box: an 8 pixel corner, the pale blue-grey border, white, 16 pixel words. */
export const FIELD_CLASSES =
	'rounded-md border-creation-input-border bg-white text-base text-creation-ink-950 md:text-base';

/** The quiet "28 / 120" under a field, right-aligned. */
export const COUNTER_CLASSES = 'fs-15 lh-20 text-creation-ink-300 tabular-nums';
