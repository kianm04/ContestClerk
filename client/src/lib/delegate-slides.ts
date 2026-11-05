/**
 * The delegate's view of the example under the landing page's hero (Trello
 * BJyr90Wx): five slides, one for each stage of a delegate's journey, turned
 * past like a carousel, one stage at a time, from right to left.
 *
 * The carousel is a row of fixed slots: far left, left, centre, right and far
 * right. Every slide is given a slot from where it stands relative to the
 * slide being shown (`slideSlot`), and each slot has one transform
 * (`SLOT_STYLES`). Moving on one stage gives every slide a new slot at once,
 * and the browser slides each one from its old transform to its new one, so
 * every turn of the carousel has exactly the same geometry.
 *
 * The journey is a story, not a circle: after the last stage the carousel
 * fades out, rewinds to the first stage while nobody can see it, and fades
 * back in (`nextCarouselStep`), rather than turning from "Participate" back
 * to "Discover".
 *
 * Nothing here talks to Supabase.
 */

/** One slide: a picture of one stage, with the words on it for somebody who cannot see it. */
export type DelegateSlide = {
	/** The stage's short name, as the slide's own label writes it, such as "Discover". */
	stage: string;
	/** The picture's address, under `static/`. */
	src: string;
	/** What the picture says, read out in its place. */
	alt: string;
};

/** The five stages, in the order a delegate goes through them. */
export const DELEGATE_SLIDES: DelegateSlide[] = [
	{
		stage: 'Discover',
		src: '/landing-slides/delegate-1.webp',
		alt: '1. Discover. Find a conference: browse MUN conferences and find the right fit for you.'
	},
	{
		stage: 'Apply',
		src: '/landing-slides/delegate-2.webp',
		alt: '2. Apply. Apply in minutes: choose a conference and submit your application.'
	},
	{
		stage: 'Accepted',
		src: '/landing-slides/delegate-3.webp',
		alt: '3. Accepted. Get accepted: track your application and receive your committee assignment.'
	},
	{
		stage: 'Prepare',
		src: '/landing-slides/delegate-4.webp',
		alt: '4. Prepare. Prepare for committee: see your schedule, resources and committee details before the conference begins.'
	},
	{
		stage: 'Participate',
		src: '/landing-slides/delegate-5.webp',
		alt: '5. Participate. Join the live committee: enter your session, follow the speakers’ list and take part in debate live.'
	}
];

/** Where a slide sits on the carousel. Only `left`, `center` and `right` can be seen. */
export type SlideSlot = 'far-left' | 'left' | 'center' | 'right' | 'far-right';

/**
 * The slot of the slide at `slideIndex` while the slide at `activeIndex` is
 * shown: the one before it on the left, the one after it on the right, and
 * every other slide out of sight on the side it came from or is going to.
 */
export function slideSlot(slideIndex: number, activeIndex: number): SlideSlot {
	const distance = slideIndex - activeIndex;

	if (distance === 0) return 'center';
	if (distance === -1) return 'left';
	if (distance === 1) return 'right';
	return distance < 0 ? 'far-left' : 'far-right';
}

/**
 * How each slot draws a slide. Every transform lists the same functions in the
 * same order, so the browser can move smoothly between any two of them.
 *
 * The percentages are of the slide's own width, so the carousel keeps its
 * shape at every screen size. The side slides turn so that their outer edges
 * lean away from the reader, sit further back, and are smaller and fainter,
 * so the centre slide is always the one to read. `zIndex` keeps the centre in
 * front of the sides, and the sides in front of the hidden ones.
 */
export const SLOT_STYLES: Record<
	SlideSlot,
	{ transform: string; opacity: number; zIndex: number }
> = {
	'far-left': {
		transform: 'translateX(-115%) translateZ(-260px) rotateY(-24deg) scale(0.6)',
		opacity: 0,
		zIndex: 1
	},
	left: {
		transform: 'translateX(-62%) translateZ(-140px) rotateY(-14deg) scale(0.75)',
		opacity: 0.45,
		zIndex: 2
	},
	center: {
		transform: 'translateX(0%) translateZ(0px) rotateY(0deg) scale(1)',
		opacity: 1,
		zIndex: 3
	},
	right: {
		transform: 'translateX(62%) translateZ(-140px) rotateY(14deg) scale(0.75)',
		opacity: 0.45,
		zIndex: 2
	},
	'far-right': {
		transform: 'translateX(115%) translateZ(-260px) rotateY(24deg) scale(0.6)',
		opacity: 0,
		zIndex: 1
	}
};

/** How long one turn of the carousel takes. The markup's `duration-800` says the same. */
export const TURN_MS = 800;

/** How long a stage rests in the centre, after its turn, so it can be read. */
export const REST_MS = 3000;

/** How long the last stage rests before the carousel starts again. */
export const LAST_REST_MS = 6000;

/** How long the whole carousel takes to fade out before it rewinds. The markup's `duration-500` says the same. */
export const FADE_MS = 500;

/**
 * How long the rewound carousel waits, still invisible, before it fades back
 * in: long enough for the browser to draw the first stage in place without a
 * turn, so nobody sees the slides fly back.
 */
export const REWIND_MS = 50;

/**
 * Where the carousel is in its cycle: `showing` a stage, `fading` out after
 * the last one, or `rewinding` to the first while it cannot be seen.
 */
export type CarouselPhase = 'showing' | 'fading' | 'rewinding';

export type CarouselState = { activeIndex: number; phase: CarouselPhase };

/**
 * What the carousel does next from `state`, and how long it waits first. The
 * component waits `delayMs`, then moves to `next`.
 */
export function nextCarouselStep(
	state: CarouselState,
	slideCount: number
): { delayMs: number; next: CarouselState } {
	if (state.phase === 'fading') {
		return { delayMs: FADE_MS, next: { activeIndex: 0, phase: 'rewinding' } };
	}

	if (state.phase === 'rewinding') {
		return { delayMs: REWIND_MS, next: { activeIndex: 0, phase: 'showing' } };
	}

	if (state.activeIndex >= slideCount - 1) {
		return {
			delayMs: TURN_MS + LAST_REST_MS,
			next: { activeIndex: state.activeIndex, phase: 'fading' }
		};
	}

	return {
		delayMs: TURN_MS + REST_MS,
		next: { activeIndex: state.activeIndex + 1, phase: 'showing' }
	};
}
