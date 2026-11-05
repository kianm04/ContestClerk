/**
 * The look of the chair console's own buttons, on its views and in its frame,
 * as the session study draws them (`03-design/session-redesign/study/css/
 * console.css`, "Buttons"): a filled one for the one step that matters (P1),
 * an outlined one for an equal choice, and a quiet one that is words only.
 * A disabled button of either kind turns grey, so the one that is left is
 * plainly the one to press.
 *
 * Written out in full, because Tailwind reads the class names out of this
 * file and cannot follow a name that is glued together while the page runs.
 * Each constant is only the look; a component adds its own height and width.
 */

/** What every console button shares: one line of medium words, centred, with the 10px corner. */
const SHARED =
	'inline-flex items-center justify-center gap-2 rounded-control border font-medium whitespace-nowrap transition-colors duration-150 disabled:cursor-default disabled:border-line disabled:bg-neutral-100 disabled:text-ink-400';

/** The filled look: dark blue, for the one action that matters. */
const FILLED =
	'border-brand-900 bg-brand-900 text-surface hover:border-brand-800 hover:bg-brand-800';

/** The outlined look: a white button with a line around it. */
const OUTLINED = 'border-line bg-surface text-ink-900 hover:bg-neutral-100';

/** The filled dark blue button: the one action that matters on the view. */
export const PRIMARY_BUTTON_CLASSES = `${SHARED} px-4 ${FILLED}`;

/** The outlined button: a choice that is not yet the next step, such as Pass and Fail before a count. */
export const OUTLINED_BUTTON_CLASSES = `${SHARED} px-4 ${OUTLINED}`;

/**
 * The small buttons, with 13px words: the live strip's (32px tall, 10px
 * sides) and the caucus line's "Extend +5:00" and "End caucus" (36px tall,
 * 12px sides). The place adds the height and the sides.
 */
export const SMALL_PRIMARY_BUTTON_CLASSES = `${SHARED} text-small ${FILLED}`;
export const SMALL_OUTLINED_BUTTON_CLASSES = `${SHARED} text-small ${OUTLINED}`;

/**
 * The quiet button: words in `ink-600` with no border, for a step taken
 * rarely or one that undoes, such as "Withdraw" and "Cancel vote". It keeps
 * the 44px a finger needs.
 */
export const QUIET_BUTTON_CLASSES =
	'inline-flex min-h-11 items-center font-medium whitespace-nowrap text-ink-600 hover:text-ink-900 disabled:text-ink-400';
