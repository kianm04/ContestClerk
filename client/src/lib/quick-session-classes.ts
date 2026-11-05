/**
 * The look the quick session pages share, as the session study draws it
 * (`03-design/session-redesign/study/css/views.css`, "Quick session setup"):
 * the two columns, their rows, the small "+" and "×" buttons, and the
 * segmented buttons of "Start from".
 *
 * Desktop sizes come from the study; under `md` every row and button grows to
 * the 44px a finger needs (`quick-session.md`, "Other sizes"). Written out in
 * full, because Tailwind reads the class names out of this file and cannot
 * follow a name that is glued together while the page runs.
 */

/** One of the two columns: "Add delegations" and "Your committee". */
export const QUICK_COLUMN_CLASSES = 'flex min-h-0 flex-col gap-3 px-8 py-5 max-md:px-4';

/** A list inside a column, which scrolls inside it so the footer stays on the first screen. */
export const QUICK_LIST_CLASSES = 'min-h-0 flex-1 overflow-y-auto';

/** One member state or one member: the flag, the name and its button. */
export const QUICK_ROW_CLASSES = 'flex h-10 items-center gap-3 border-b border-line max-md:h-11';

/** The "+" and "×" at the end of a row: an icon on no background until it is pointed at. */
export const QUICK_ICON_BUTTON_CLASSES =
	'ml-auto grid size-8 shrink-0 cursor-pointer place-items-center rounded-control text-ink-600 hover:bg-neutral-100 hover:text-ink-900 max-md:size-11';

/** "UN members", "Security Council", "EU members" and "Paste a list". */
export const QUICK_SEGMENT_CLASSES =
	'inline-flex h-9 cursor-pointer items-center rounded-lg border border-line bg-surface px-3 text-small font-medium text-ink-900 hover:bg-neutral-100 max-md:h-11';

/** A quiet button of words only: "Clear all", "Cancel". */
export const QUICK_QUIET_CLASSES =
	'inline-flex min-h-8 cursor-pointer items-center font-medium text-ink-600 hover:text-ink-900 hover:underline max-md:min-h-11';
