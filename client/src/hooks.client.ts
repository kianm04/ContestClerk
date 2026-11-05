import type { ClientInit, HandleClientError } from '@sveltejs/kit';
import { UNEXPECTED_ERROR_TEXT } from '$lib/auth';
import { CLOCK_REFUSAL_EXPLANATION, isAccessTokenFromTheFuture } from '$lib/database-errors';
import { isLeavingPage, waitForPageToGo, watchForPageLeaving } from '$lib/page-leaving';

/**
 * `init` runs once in the browser when the app starts, before anything is
 * shown. It starts watching for the reader leaving the page, which
 * `handleError` below needs to know about.
 */
export const init: ClientInit = () => {
	watchForPageLeaving(window);
};

/**
 * `handleError` in this file is the browser's counterpart of the one in
 * `src/hooks.server.ts`, and SvelteKit calls it on its own. It runs whenever an
 * error nobody planned for escapes a universal `load` function (a `+page.ts` or
 * `+layout.ts`) while it runs in the browser, which is every navigation after
 * the first page view, and when the browser could not fetch the server's data
 * for a page at all (a dropped connection, or a request Safari cancelled because
 * the reader was leaving). It never runs for `error(404, …)` and the like, which are
 * already worded for a reader, nor for an error the server has already handled.
 *
 * It keeps the same rule as the server's hook, from `03-design/writing-style.md`:
 * the real error goes to the log, which here is the browser's console, and the
 * visitor reads the sentence for a 500 and never the raw error. Writing a hook
 * here replaces SvelteKit's own logging, so this logs every error it is given.
 */
export const handleError: HandleClientError = async ({ error, event, status, message }) => {
	// A reading of the page's data that fails because the reader is leaving is
	// no error at all: Safari cancelled it. SvelteKit would answer it by loading
	// this page's address again, over the page the reader asked for, so it is
	// held back until the page has gone (`$lib/page-leaving.ts`, T154).
	if (isLeavingPage()) {
		await waitForPageToGo();
	}

	// The browser gets its own Supabase client from `src/routes/+layout.ts`, so
	// a query it makes can be refused for an access token from the database's
	// future exactly the way a server query can. That is the clock of the machine
	// Supabase runs on, and nothing in an ordinary stack trace says so.
	if (isAccessTokenFromTheFuture(error)) {
		console.error(CLOCK_REFUSAL_EXPLANATION);
	}

	console.error(`Unexpected error while showing ${event.url.pathname}`, error);

	// Only a 500 is ours to apologise for. A link to a route that does not exist
	// reaches this hook with its own status, and "Not Found" is what that page
	// should go on saying.
	if (status !== 500) {
		return { message };
	}

	return { message: UNEXPECTED_ERROR_TEXT };
};
