/**
 * How much room the root layout gives a page's `<main>`, which depends on the
 * page being shown.
 *
 * - `framed`: the ordinary frame, centred, with a width limit and padding.
 * - `full-bleed`: the conference directory runs its hero picture to the
 *   window's right edge (Trello WMcXfry0). Its `<main>` has no width limit and
 *   no padding of its own, so the page sets its own. `/home` once ran a
 *   photograph under the top bar the same way (T150); since it was redrawn to
 *   lead with the reader's next conference it sits in the ordinary frame.
 * - `landing`: the landing page goes further (Trello RBz46aTQ). Its two
 *   pictures run up behind the top bar itself, and its own background reaches
 *   down to the footer, so its `<main>` has no padding at all. The "For
 *   organisers" page is drawn in the landing page's manner and shares its
 *   frame, so its mist ground also reaches the footer.
 * - `manage`: the organiser's management pages: the list of their
 *   conferences, the steps that create a new one, and every page under
 *   `/manage/<conference>`, whose sidebar runs down the left edge of the window
 *   under the top bar (docs/DESIGN.md, "The shell"). They hold tables and forms
 *   side by side, so their `<main>` has no width limit or padding of its own;
 *   the manage layout pads and limits the content beside the sidebar itself.
 * - `writer`: a committee paper's page (`docs/committee-papers.md`, section
 *   6), where the paper's people, its sheet and the comments beside it stand
 *   side by side, so it is wider than a normal page, at 82rem.
 *
 * An error page at any of those addresses keeps the ordinary frame, because it
 * has no picture to run under the bar and may have no sidebar either.
 */
export type PageFrame = 'framed' | 'full-bleed' | 'landing' | 'manage' | 'writer';

/** The landing page and the page drawn in its manner. */
const LANDING_ROUTE_IDS = ['/', '/for-organisers'];

/** The routes, by folder path, whose picture runs edge to edge under the top bar. */
const FULL_BLEED_ROUTE_IDS = ['/conferences'];

/** The list of an organiser's conferences and the page that starts a new one. */
const MANAGE_ROUTE_IDS = ['/manage', '/create'];

/** Every page of one conference's management area starts with this folder path. */
const MANAGE_CONFERENCE_ROUTE_PREFIX = '/manage/[slug]';

/**
 * The steps of creating a draft (Trello fe3reN7Y) have no sidebar, but they
 * hold a form beside a live preview the same way, so they share the frame.
 */
const CREATION_ROUTE_PREFIX = '/create/[slug]';

/** A committee paper's page, where its authors write it. */
const WRITER_ROUTE_ID = '/conferences/[slug]/committees/[committeeSlug]/resolutions/[paperId]';

/** The delegate live view of a committee in session. */
const LIVE_VIEW_ROUTE_ID = '/conferences/[slug]/committees/[committeeSlug]/live';

/**
 * Which frame the page with this route id sits in. `routeId` is SvelteKit's
 * `page.route.id`, which is null for an address that matches no route.
 */
export function pageFrame(routeId: string | null, isErrorPage: boolean): PageFrame {
	if (routeId === null || isErrorPage) {
		return 'framed';
	}

	if (LANDING_ROUTE_IDS.includes(routeId)) {
		return 'landing';
	}

	if (FULL_BLEED_ROUTE_IDS.includes(routeId)) {
		return 'full-bleed';
	}

	if (
		MANAGE_ROUTE_IDS.includes(routeId) ||
		routeId.startsWith(MANAGE_CONFERENCE_ROUTE_PREFIX) ||
		routeId.startsWith(CREATION_ROUTE_PREFIX)
	) {
		return 'manage';
	}

	if (routeId === WRITER_ROUTE_ID) {
		return 'writer';
	}

	return 'framed';
}

/**
 * Whether the site's footer is drawn under the page with this route id. The
 * delegate live view fills a phone screen, a committee paper's page is a place
 * to write (`docs/committee-papers.md`), and a creation step fits the window
 * above its own button bar (Trello fe3reN7Y), so none of them has one.
 */
export function showsSiteFooter(routeId: string | null): boolean {
	if (routeId === null) {
		return true;
	}

	return (
		routeId !== LIVE_VIEW_ROUTE_ID && routeId !== WRITER_ROUTE_ID && !routeId.startsWith('/create')
	);
}

/**
 * The classes of `<main>` in each frame. Each list is written out in full, so
 * that Tailwind can find the class names. The ordinary frame is 72rem wide, the
 * width docs/DESIGN.md gives a normal page.
 */
export const MAIN_CLASSES: Record<PageFrame, string> = {
	framed: 'mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-6',
	'full-bleed': 'w-full flex-1 pb-10',
	landing: 'w-full flex-1',
	manage: 'flex w-full flex-1 flex-col',
	writer: 'mx-auto w-full max-w-[82rem] flex-1 px-4 pt-4 pb-8 sm:px-6 sm:pt-6 sm:pb-16'
};
