/**
 * The one-shot cookie that carries a flash message across a redirect.
 *
 * A form action that stays on its page returns `{ flash }` in its result and
 * never comes here. An action that redirects cannot return anything at all, so
 * it leaves the message here, and the root layout's `load` picks it up on the
 * next request and throws it away again.
 *
 * The shape itself is in `$lib/flash.ts`, which the browser imports too.
 */

import type { Cookies } from '@sveltejs/kit';
import { isFlash, type Flash } from '$lib/flash';

/** The cookie's name. One word, because it only ever holds one message. */
const FLASH_COOKIE = 'flash';

/**
 * How long the cookie may sit unread, in seconds.
 *
 * It is normally read on the very next request. A minute is long enough for a
 * slow redirect and short enough that a message never turns up half an hour
 * later attached to something else.
 */
const FLASH_MAX_AGE_SECONDS = 60;

/**
 * Leave a message for the page we are about to redirect to.
 *
 * `httpOnly` keeps it away from any script in the browser, and `sameSite:
 * 'lax'` stops another website causing it to be sent. `path: '/'` is required
 * by SvelteKit and is what lets any page read it.
 */
export function setFlash(cookies: Cookies, flash: Flash): void {
	cookies.set(FLASH_COOKIE, JSON.stringify(flash), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: FLASH_MAX_AGE_SECONDS
	});
}

/**
 * Read the message and delete the cookie, so it is shown exactly once.
 *
 * Anything that is not a flash message we wrote is ignored: the value is only
 * text a browser sent us, and `JSON.parse` throws on text that is not JSON at
 * all.
 */
export function takeFlash(cookies: Cookies): Flash | null {
	const raw = cookies.get(FLASH_COOKIE);

	if (!raw) {
		return null;
	}

	cookies.delete(FLASH_COOKIE, { path: '/' });

	try {
		const parsed: unknown = JSON.parse(raw);

		return isFlash(parsed) ? parsed : null;
	} catch {
		return null;
	}
}
