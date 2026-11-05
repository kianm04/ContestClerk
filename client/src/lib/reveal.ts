/**
 * The sums behind `Reveal.svelte`, the block on the landing page that fades
 * and rises into view once as the reader scrolls down to it.
 *
 * The browser work, watching an element with `IntersectionObserver`, stays in
 * the component. What is here is every decision that can be made from a few
 * numbers, so that it can be tested without a browser.
 *
 * Nothing here talks to Supabase or to Svelte.
 */

/**
 * How far into the window an element has to come before it is revealed:
 * `IntersectionObserver` counts it as in view once it is a tenth of the
 * window's height up from the bottom edge, so a block never fades in while it
 * is still only a sliver at the foot of the screen.
 */
export const REVEAL_ROOT_MARGIN = '0px 0px -10% 0px';

/**
 * Whether an element starts out of sight, so that it is worth hiding it and
 * revealing it later. `elementTop` is its distance from the top of the window
 * when the page has just loaded, and `windowHeight` the window's height.
 *
 * Anything already on the first screen, or so close to its foot that
 * `REVEAL_ROOT_MARGIN` would count it as in view, is left alone: hiding it and
 * then fading it in would make the page blink as it loaded.
 */
export function isBelowTheFold(elementTop: number, windowHeight: number): boolean {
	return elementTop > windowHeight * 0.9;
}

/** The part of `window.matchMedia` this file reads: whether a media query matches. */
type MatchMedia = (query: string) => { matches: boolean };

/**
 * Whether the reader has asked their operating system to keep movement to a
 * minimum. Then nothing is hidden at all; the page is simply there, the way it
 * is before JavaScript runs. `matchMedia` is missing in some test browsers, so
 * without one the answer is no.
 */
export function prefersReducedMotion(matchMedia: MatchMedia | undefined): boolean {
	if (matchMedia === undefined) {
		return false;
	}

	return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * How long the item at `index` in a list waits before it follows the one
 * above it, in milliseconds, so a list of rows arrives one after another
 * rather than all at once. 80ms apart is quick enough that six rows are all
 * there within half a second.
 */
export function staggerDelay(index: number, stepMs = 80): number {
	return index * stepMs;
}

/**
 * The classes for one item inside a `Reveal` that should follow it in rather
 * than arrive with it: a little low and see-through until the `Reveal` round it
 * is shown (its `data-shown` attribute), then eased into place. Give each item
 * its own `transition-delay` from `staggerDelay`, so a list arrives one row at
 * a time. On the server, and without JavaScript, `Reveal` is always shown, so
 * the items are simply there.
 *
 * Written out in full, because Tailwind reads the class names out of this file
 * and cannot follow a name that is glued together while the page runs.
 */
export const REVEAL_ITEM_CLASSES =
	'translate-y-3 opacity-0 transition-all duration-500 ease-out group-data-[shown]/reveal:translate-y-0 group-data-[shown]/reveal:opacity-100 motion-reduce:transition-none';
