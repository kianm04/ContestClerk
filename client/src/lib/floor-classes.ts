/**
 * The Tailwind classes of the floor's frame, which the GSL, Mod, Unmod and
 * Single speaker views share (`specs/05-pages/chair/gsl.md`, "Layout"): the
 * two columns, the floor's box, its title, its middle and its row of
 * controls with the one primary in the bottom right corner. Written once
 * here so the four views stay in the same places as each other, the way
 * `$lib/button-classes.ts` keeps every button alike.
 *
 * Written out in full, because Tailwind reads the class names out of this
 * file and cannot follow a name glued together while the page runs.
 */

/**
 * The view: the floor on the left and the queue column on the right, the
 * full height of the console, from 861px wide. Narrower, the column moves
 * under the floor. `minmax(0, 1fr)` lets the floor shrink instead of
 * widening the page; the column keeps 320 to 480px, about 40% of the width.
 */
export const VIEW_COLUMNS_CLASSES =
	'grid min-h-0 flex-1 grid-cols-1 max-md:flex max-md:flex-col min-[861px]:grid-cols-[minmax(0,1fr)_clamp(320px,38%,480px)] min-[861px]:grid-rows-[minmax(0,1fr)]';

/**
 * The floor's box. On a phone (`max-md:`) the box is dropped (`contents`),
 * so its parts join the view's one column: the queue column comes between
 * the floor's middle and its controls, which stick to the bottom.
 */
export const FLOOR_CLASSES =
	'flex min-h-0 min-w-0 flex-col px-8 pt-7 pb-6 max-[1100px]:px-6 max-[1100px]:pt-6 max-[1100px]:pb-5 max-md:contents';

/** The floor's title row. */
export const FLOOR_HEADER_CLASSES = 'flex items-baseline gap-4 max-md:px-4 max-md:pt-4';

/** The floor's middle: the speaker, the clock and its bar, in the middle of the free space. */
export const FLOOR_BODY_CLASSES =
	'flex min-h-0 flex-1 flex-col justify-center gap-4 py-6 max-[860px]:min-h-70 max-[860px]:flex-none max-md:min-h-0 max-md:px-4 max-md:pb-4';

/** The floor's controls, stuck to the bottom of the screen above the mode bar on a phone. */
export const FLOOR_CONTROLS_CLASSES =
	'flex flex-wrap items-end gap-4 max-md:sticky max-md:bottom-0 max-md:z-10 max-md:order-3 max-md:gap-2 max-md:border-t max-md:border-line max-md:bg-surface max-md:px-4 max-md:py-2.5';

/** The corner of the controls where the one primary sits, full width on a narrower window. */
export const FLOOR_PRIMARY_CLASSES = 'ml-auto flex max-[1100px]:w-full max-md:ml-0';
