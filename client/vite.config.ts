import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-vercel';
import type { KitConfig } from '@sveltejs/kit';
import { sveltekit } from '@sveltejs/kit/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { loadEnv } from 'vite';
import { configDefaults, defineConfig } from 'vitest/config';

/** SvelteKit's `csp` option, and one entry of one of its source lists, such as `data:` or an origin. */
type ContentSecurityPolicy = NonNullable<KitConfig['csp']>;
type PolicySource = NonNullable<
	NonNullable<ContentSecurityPolicy['directives']>['img-src']
>[number];

/**
 * The Content-Security-Policy every page is sent with (security review L41).
 *
 * The policy lists where a page may load scripts, styles, pictures and
 * connections from, and a browser refuses everything else. A script that an
 * attacker managed to slip into a page could then neither run nor report home.
 * SvelteKit writes the header itself, because it starts every page with a
 * small inline script and has to put a one-time nonce for that script into the
 * header as it renders; `mode: 'auto'` is that, with a hash instead on any page
 * it prerenders (there are none today). The headers that need no nonce are set
 * in `src/hooks.server.ts`, and `tests/e2e/security-headers.spec.ts` opens the
 * pages people use and fails on anything the policy refused.
 *
 * The one address the policy has to know is the Supabase project's, which the
 * browser talks to when it signs in, when it shows a stored picture and, over
 * a WebSocket, while a room is live. It is `PUBLIC_SUPABASE_URL`: a build
 * argument inside Docker (see the Dockerfile) and a line of `client/.env` on a
 * developer's machine. `loadEnv` is how Vite reads it for the app, with the
 * environment winning over the file, so the policy names the same address the
 * app will call.
 */
function contentSecurityPolicy(mode: string): ContentSecurityPolicy {
	const supabaseUrl = loadEnv(mode, process.cwd(), 'PUBLIC_').PUBLIC_SUPABASE_URL;

	if (!supabaseUrl) {
		throw new Error(
			'PUBLIC_SUPABASE_URL is not set, and the Content-Security-Policy has to name it. ' +
				'Copy client/.env.example to client/.env, or pass it as a build argument.'
		);
	}

	// The origin alone, `http://127.0.0.1:54321`, never a path. `new URL` throws
	// on a value that is not an address, and its message names the value.
	const supabaseOrigin = new URL(supabaseUrl).origin as PolicySource;
	// Supabase Realtime is the same host over a WebSocket, so `http://` becomes
	// `ws://` and `https://` becomes `wss://`.
	const supabaseWebSocketOrigin = supabaseOrigin.replace(/^http/, 'ws') as PolicySource;

	return {
		mode: 'auto',
		directives: {
			// Whatever no directive below names comes from this site alone.
			'default-src': ['self'],
			// This site's own scripts, plus the nonce SvelteKit adds for the one
			// inline script it starts each page with. No script from anywhere else.
			'script-src': ['self'],
			// Styles are the one place the policy is looser than it could be, and
			// `tests/e2e/security-headers.spec.ts` is why: with `'self'` alone the
			// browser refused something on every page (two refusals on the plainest,
			// about sixty on the landing page). The server renders `style="…"` attributes
			// (the `display: contents` wrapper in `app.html`, every `style:`
			// directive, the width of a tally bar), and the paper editor writes a
			// <style> element of its own into the page as it starts (`@tiptap/core`).
			// A nonce reaches neither, so inline styles are allowed. Scripts are
			// not, and a style on its own can neither run code nor read a page.
			'style-src': ['self', 'unsafe-inline'],
			// Flags are flagcdn's pictures; a conference's banner, a logo and an
			// avatar are read straight from Supabase storage. `data:` is for the
			// small pictures CSS carries inside itself, such as the tick a checkbox
			// is drawn with.
			'img-src': ['self', 'data:', 'https://flagcdn.com', supabaseOrigin],
			// Both fonts ship with the site (`src/routes/layout.css` imports them
			// from their packages), so nothing is fetched from Google Fonts.
			'font-src': ['self'],
			// Where a script may send requests: this site, and Supabase for the
			// session, for storage and for the live room's WebSocket.
			'connect-src': ['self', supabaseOrigin, supabaseWebSocketOrigin],
			// The only frames a page may hold are Stripe's, for the day payments
			// are taken on the page rather than on Stripe's own site.
			'frame-src': [
				'https://js.stripe.com',
				'https://checkout.stripe.com',
				'https://connect.stripe.com'
			],
			// Where a form may be sent. Chrome applies this to every redirect that
			// follows a submission as well (checked with a throwaway page: a 303 to
			// another host after a post is refused, and the console blames the form).
			// Connecting an organisation to Stripe is a form action that answers by
			// sending the browser to Stripe's onboarding, and opening its payouts
			// one that sends it to Stripe's dashboard
			// (`manage/organizations/[orgSlug]`); and a Stripe link may hop between
			// Stripe's own hosts before it lands (a `connect.stripe.com` address
			// answered with a redirect to `dashboard.stripe.com`). Naming the domain
			// rather than a host at a time keeps an unseen hop from breaking those
			// two buttons in Chrome alone.
			'form-action': ['self', 'https://*.stripe.com'],
			// No other site may draw a page of this one inside a frame; the
			// X-Frame-Options header in `src/hooks.server.ts` says the same.
			'frame-ancestors': ['none'],
			// No injected <base> tag may redirect every relative address on a page.
			'base-uri': ['self'],
			// No plugins: no Flash, no Java, no PDF viewer embedded in a page.
			'object-src': ['none']
		}
	};
}

// `defineConfig` comes from Vitest rather than Vite so that the `test` block
// below is type-checked. Everything else is ordinary Vite configuration.
export default defineConfig(({ mode }) => ({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for our own files. Packages in node_modules decide
				// for themselves, because some of them still use the old syntax.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// The adapter turns `pnpm build` output into Vercel functions and static files.
			adapter: adapter(),
			// The Content-Security-Policy, written by SvelteKit into every page's
			// headers. The function above says what it allows and why.
			csp: contentSecurityPolicy(mode)
		})
	],

	// The dev server normally refuses requests whose Host header is not localhost,
	// so that a malicious website cannot talk to it. A Cloudflare quick tunnel
	// (`cloudflared tunnel --url http://localhost:5173`) forwards public traffic
	// to it under a `*.trycloudflare.com` name, which we allow here so that a
	// teammate can share their running dev server from outside the network.
	server: {
		allowedHosts: ['.trycloudflare.com']
	},

	// Four groups of tests, each its own "project" so it can have its own
	// environment. `pnpm test` runs "unit", "component" and "harness", and
	// `pnpm test:db` runs "db". See specs/02-architecture/testing.md for what
	// belongs where.
	test: {
		projects: [
			{
				// Pure logic in src/lib and form actions. Runs in plain Node.
				extends: true,
				test: {
					name: 'unit',
					environment: 'node',
					include: ['src/**/*.test.ts'],
					exclude: [...configDefaults.exclude, 'src/**/*.svelte.test.ts']
				}
			},
			{
				// Svelte components rendered with @testing-library/svelte. jsdom
				// gives them a fake browser DOM to render into.
				extends: true,
				plugins: [svelteTesting()],
				test: {
					name: 'component',
					environment: 'jsdom',
					include: ['src/**/*.svelte.test.ts']
				}
			},
			{
				// Pure logic inside the test harness itself: the helpers under tests/
				// that decide something without a database and without a browser,
				// such as waiting out an access token PostgREST refused. They run in
				// plain Node, so a test of one of them needs nothing started.
				//
				// A file belongs here by its name rather than by its folder, because
				// these tests sit next to the helpers they test and those helpers
				// live in folders the "db" project and Playwright own. It is the same
				// trick "component" above uses inside src/.
				extends: true,
				test: {
					name: 'harness',
					environment: 'node',
					include: ['tests/**/*.harness.test.ts']
				}
			},
			{
				// Row Level Security and SQL functions, run against the local
				// Supabase from `pnpm db:start`. `loadEnv` copies the PUBLIC_* values
				// from .env into process.env so the tests can build a client.
				extends: true,
				test: {
					name: 'db',
					environment: 'node',
					include: ['tests/db/**/*.test.ts'],
					// The harness tests in this folder belong to the project above.
					// Without this line they would run here as well, and needlessly
					// wait for Docker.
					exclude: [...configDefaults.exclude, 'tests/**/*.harness.test.ts'],
					// Loaded before every database test file. It fails any test
					// during which the harness gave up on a Docker clock corrected
					// backwards, which it cannot report by throwing.
					// See tests/db/waiting-out-the-clock.ts. Nothing inside the
					// database suite would notice this line going, so
					// fail-when-waiting-out-the-clock-failed.harness.test.ts checks it.
					setupFiles: ['./tests/db/fail-when-waiting-out-the-clock-failed.ts'],
					env: loadEnv(mode, process.cwd(), ''),
					testTimeout: 20_000
				}
			}
		]
	}
}));
