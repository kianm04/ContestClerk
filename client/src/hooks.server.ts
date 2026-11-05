import { PUBLIC_SUPABASE_PUBLISHABLE_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createServerClient } from '@supabase/ssr';
import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit';
import { building } from '$app/environment';
import { UNEXPECTED_ERROR_TEXT } from '$lib/auth';
import { CLOCK_REFUSAL_EXPLANATION, isAccessTokenFromTheFuture } from '$lib/database-errors';
import { scheduleStorageSweep } from '$lib/server/orphaned-document-files';

/**
 * `init` runs once, when the server starts, before it answers anybody. This
 * one starts the storage sweep, which removes uploaded files that no row
 * points at (`$lib/server/orphaned-document-files.ts`, security review L61).
 *
 * `building` is true while `vite build` runs the app to prerender pages. That
 * server only lives for the build, and has nothing to sweep.
 */
export const init: ServerInit = () => {
	if (!building) {
		scheduleStorageSweep();
	}
};

/**
 * `handle` runs on the server for every single request, before any `load`
 * function or form action. This one builds the Supabase client that knows who
 * is signed in and puts it on `event.locals` for the rest of the request.
 *
 * There is deliberately no client shared between requests. Row Level Security
 * has to see the signed-in user, which it can only do through that visitor's own
 * cookies, and cookies belong to one request, so the client is built fresh here
 * every time. Server code reads it from `locals.supabase`, and the browser gets
 * its own from `data.supabase` (see `src/routes/+layout.ts`).
 */
export const handle: Handle = async ({ event, resolve }) => {
	event.locals.supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
		cookies: {
			getAll: () => event.cookies.getAll(),
			setAll: (cookiesToSet, headers) => {
				for (const { name, value, options } of cookiesToSet) {
					// SvelteKit requires a `path`, and `/` is what Supabase expects:
					// the session cookie has to be readable on every page.
					event.cookies.set(name, value, { ...options, path: '/' });
				}

				// Supabase asks us to send these when it writes a session cookie.
				// They stop a CDN caching one visitor's page and serving it to
				// somebody else, session and all.
				if (Object.keys(headers).length > 0) {
					event.setHeaders(headers);
				}
			}
		}
	});

	/**
	 * Who is signed in, checked properly. This is the only way server code here
	 * is allowed to ask.
	 *
	 * The auth cookie holds an access token, which is a JWT: a small piece of
	 * JSON saying who the visitor is, signed by Supabase. `getClaims` checks that
	 * signature before believing a word of it, and normally does so without
	 * leaving this machine, because Supabase publishes the key it signs with and
	 * the client keeps a copy. That makes it both safer and faster than asking
	 * Supabase about every single request.
	 *
	 * The two older methods are the ones to avoid. `getSession()` decodes the
	 * cookie without checking the signature, and a cookie is only text the
	 * browser sent us, so anybody could write one. `getUser()` does check, but by
	 * making a network call every time it is asked.
	 */
	event.locals.getVerifiedClaims = async () => {
		const { data, error } = await event.locals.supabase.auth.getClaims();

		// `data` is null when there is no auth cookie at all, and `error` is set
		// when there was one but it did not survive checking. Either way the
		// visitor counts as signed out, rather than half signed in.
		if (error || !data) {
			return null;
		}

		return data.claims;
	};

	// The headers every answer carries (security review L41). The
	// Content-Security-Policy is not among them: SvelteKit writes that one from
	// `csp` in `vite.config.ts`, because it has to put a one-time nonce into the
	// header and into its own inline script as it renders each page.
	event.setHeaders({
		// A browser may otherwise guess a file's type from its contents and run,
		// say, an uploaded text file as a script. `nosniff` makes it believe the
		// Content-Type the server sent.
		'X-Content-Type-Options': 'nosniff',
		// What the browser tells the next site about where the visitor came from:
		// the origin alone when leaving this site, and nothing when going from
		// https to http. Addresses here carry invite tokens and join codes, which
		// must not travel to flagcdn or Stripe in a Referer header.
		'Referrer-Policy': 'strict-origin-when-cross-origin',
		// No page here may be drawn inside another site's frame, where a click
		// could be stolen through an invisible overlay. The policy's
		// `frame-ancestors 'none'` says the same to browsers that read it; this
		// header is for the older ones that do not.
		'X-Frame-Options': 'DENY',
		// Nothing here needs the camera, the microphone or the visitor's location,
		// so even a script that found its way into a page cannot ask for them.
		'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
		// Once a browser has seen this over https it refuses plain http to this
		// host and its subdomains for a year, so a visitor who types the address
		// is never met by an unencrypted page. Browsers ignore it over http, which
		// leaves the local stack and the browser tests alone.
		'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
	});

	return resolve(event, {
		// SvelteKit drops most response headers while it renders a page. Supabase
		// needs these two to survive, so we let them through.
		filterSerializedResponseHeaders: (name) =>
			name === 'content-range' || name === 'x-supabase-api-version'
	});
};

/**
 * `handleError` is the other server hook SvelteKit calls on its own. It runs
 * whenever an error nobody planned for escapes a `load` function, a form action
 * or an endpoint — never for the ones a page throws deliberately with
 * `error(404, …)`, which are already worded for a reader.
 *
 * It has two jobs, and they belong to different people. The log line is this
 * hook's: it is the only record the failure leaves. The words the visitor reads
 * are not, and `03-design/writing-style.md` decides them — a raw database error
 * is never shown, so the object returned here becomes `page.error` and T49's
 * `+error.svelte` draws it.
 *
 * Writing a hook here replaces SvelteKit's own logging of unexpected errors, so
 * this has to log every one of them and not only the case below.
 */
export const handleError: HandleServerError = ({ error, event, status, message }) => {
	// An access token the database refuses for coming from its own future is the
	// clock of the machine Supabase runs on, not a fault in this code, and
	// nothing in an ordinary stack trace says so. `tests/e2e/signed-in-user.ts`
	// waits that refusal out at the moment a browser test signs in; this is what
	// names it when it lands on a later page instead.
	if (isAccessTokenFromTheFuture(error)) {
		console.error(CLOCK_REFUSAL_EXPLANATION);
	}

	// The route, such as `/invites/[token]`, and never the address itself: invite
	// tokens and join codes travel in the path, and the container log is read by
	// more people than may hold them (security review I5). `route.id` is `null`
	// when nothing matched, which is what a mistyped address looks like here.
	const route = event.route.id ?? 'a request that matched no route';

	console.error(`Unexpected error while serving ${route}`, error);

	// Only a 500 is ours to apologise for. A request for a route that does not
	// exist reaches this hook with its own status and its own message, and "Not
	// Found" is what that page should go on saying.
	if (status !== 500) {
		return { message };
	}

	return { message: UNEXPECTED_ERROR_TEXT };
};
