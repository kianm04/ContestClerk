/**
 * The one-line message that appears after something has been done: "Application
 * submitted.", "All notifications marked as read."
 *
 * There are two ways one reaches the screen, and both end up as this shape.
 * A form action that stays on its own page returns `{ flash }` in its result,
 * which the root layout reads from `page.form`. An action that redirects cannot
 * return anything, so it leaves the message in a cookie instead; see
 * `src/lib/server/flash.ts`, which is the only file allowed to write it.
 *
 * Nothing here talks to Supabase or to Svelte, so both the browser and the
 * server import it.
 */

import { pathOnThisSite } from '$lib/auth';

/** The four tones a `Toast` can be drawn in, in the order it lists them. */
export const FLASH_TONES = ['info', 'success', 'warning', 'error'] as const;

export type FlashTone = (typeof FLASH_TONES)[number];

/**
 * A way to take back what a message reports, drawn as a quiet button beside
 * it: "2 other motions dropped · Undo" (`specs/05-pages/chair/motions.md`).
 */
export type FlashUndo = {
	/** The button's words: "Undo". */
	label: string;
	/**
	 * The form action the button posts to, written from the site's root so it
	 * works from whichever page the toast is on, such as
	 * `/conferences/mun/committees/unsc/chair/motions?/restore`.
	 */
	action: string;
	/** The motions it puts back, each sent as a `motionId` field. */
	motionIds: string[];
};

/** One message, on its way to a `Toast` in the app shell. */
export type Flash = {
	tone: FlashTone;
	/** One sentence in the past tense: "All notifications marked as read." */
	message: string;
	/** A way to take it back, when there is one. */
	undo?: FlashUndo;
};

/**
 * How long a toast stays on screen, in milliseconds.
 *
 * `03-design/app-shell.md` asks for five seconds. `Toast` itself has no way to
 * dismiss itself, so the app shell starts the timer and takes the message away
 * again. With JavaScript switched off there is no timer and the message stays
 * until the next page load, which is the honest thing for it to do.
 */
export const FLASH_VISIBLE_MS = 5000;

/**
 * Is this really a flash message?
 *
 * Two things arrive here that we did not write ourselves: the cookie, which the
 * browser could have been given by anything, and `page.form`, which SvelteKit
 * types loosely because every page's action returns something different. Both
 * are checked through this before they are shown.
 */
export function isFlash(value: unknown): value is Flash {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const candidate = value as Record<string, unknown>;

	if (typeof candidate.message !== 'string' || candidate.message === '') {
		return false;
	}

	if (candidate.undo !== undefined && !isFlashUndo(candidate.undo)) {
		return false;
	}

	return FLASH_TONES.includes(candidate.tone as FlashTone);
}

/**
 * Is this a well-formed `undo`? Its action has to be an address on this site,
 * because the toast's form posts to it, and `pathOnThisSite` is the one check
 * for that: `//evil.example` and `/\evil.example` are both another website to
 * a browser (security review M13).
 */
function isFlashUndo(value: unknown): value is FlashUndo {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const candidate = value as Record<string, unknown>;
	const action = candidate.action;
	const isOnThisSite = typeof action === 'string' && pathOnThisSite(action) !== null;
	const motionIds = candidate.motionIds;
	const hasMotionIds =
		Array.isArray(motionIds) && motionIds.every((motionId) => typeof motionId === 'string');

	return (
		typeof candidate.label === 'string' && candidate.label !== '' && isOnThisSite && hasMotionIds
	);
}
