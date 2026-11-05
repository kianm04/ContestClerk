import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { handle, handleError, init } from './hooks.server';
import { scheduleStorageSweep } from '$lib/server/orphaned-document-files';
import { UNEXPECTED_ERROR_TEXT } from '$lib/auth';
import { CLOCK_REFUSAL_EXPLANATION } from '$lib/database-errors';

// `handleError` is the hook SvelteKit calls when an error nobody planned for
// escapes a `load` function. Writing one replaces SvelteKit's own logging, so
// what it logs is as much a part of it as what it returns, and both are checked
// here. The refusal it singles out cannot be arranged for real — it needs the
// Docker clock to be corrected backwards mid-request — so the error is handed
// over in the shape a `$lib/server` module really throws it.

/**
 * The `event` argument, with the two fields this hook could read: the address
 * asked for and the route that matched it, which is `null` for a 404.
 *
 * A real `RequestEvent` carries a request, cookies and `locals` as well, none
 * of which `handleError` looks at, so a stand-in is cast to the type the way
 * `src/lib/server/access.test.ts` casts its `locals`.
 */
function requestFor(pathname: string, routeId: string | null): RequestEvent {
	return {
		url: new URL(`http://localhost${pathname}`),
		route: { id: routeId }
	} as unknown as RequestEvent;
}

afterEach(() => {
	vi.restoreAllMocks();
});

// The sweep itself is tested in src/lib/server/orphaned-document-files.test.ts.
// Here it is only a stand-in, so starting the server starts no timer.
vi.mock('$lib/server/orphaned-document-files', () => ({ scheduleStorageSweep: vi.fn() }));

describe('init', () => {
	it('starts the storage sweep when the server starts', async () => {
		await init();

		expect(scheduleStorageSweep).toHaveBeenCalledOnce();
	});
});

describe('handleError', () => {
	it('names the clock when the database refused a token from its own future', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

		await handleError({
			error: new Error('Could not read the profile: JWT issued at future'),
			event: requestFor('/home', '/home'),
			status: 500,
			message: 'Internal Error'
		});

		expect(logged).toHaveBeenCalledWith(CLOCK_REFUSAL_EXPLANATION);
	});

	it('logs an ordinary failure without blaming the clock for it', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
		const thrown = new Error('Could not read the profile: fetch failed');

		await handleError({
			error: thrown,
			event: requestFor('/home', '/home'),
			status: 500,
			message: 'Internal Error'
		});

		// One line, not two: the route it happened on and the error itself.
		expect(logged).toHaveBeenCalledTimes(1);
		expect(logged).toHaveBeenCalledWith('Unexpected error while serving /home', thrown);
	});

	it('logs the route, never the address, so a token in the path stays out of the log', async () => {
		// Invite tokens and join codes travel in the path, and the container log
		// is read by more people than may hold them (security review I5).
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
		const thrown = new Error('Could not read the invite: fetch failed');

		await handleError({
			error: thrown,
			event: requestFor('/invites/secret-token-123', '/invites/[token]'),
			status: 500,
			message: 'Internal Error'
		});

		expect(logged).toHaveBeenCalledWith('Unexpected error while serving /invites/[token]', thrown);
		expect(JSON.stringify(logged.mock.calls)).not.toContain('secret-token-123');
	});

	it('says so when no route matched at all', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

		await handleError({
			error: new Error('Not found: /nowhere'),
			event: requestFor('/nowhere', null),
			status: 404,
			message: 'Not Found'
		});

		expect(logged).toHaveBeenCalledWith(
			'Unexpected error while serving a request that matched no route',
			expect.any(Error)
		);
	});

	it('gives the page the sentence the writing style asks for, never the raw error', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});

		const shown = await handleError({
			error: new Error('Could not read the profile: password authentication failed for "x"'),
			event: requestFor('/home', '/home'),
			status: 500,
			message: 'Internal Error'
		});

		expect(shown).toEqual({ message: UNEXPECTED_ERROR_TEXT });
	});

	it('leaves a request for a route that does not exist saying what it said', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});

		const shown = await handleError({
			error: new Error('Not found: /nowhere'),
			event: requestFor('/nowhere', null),
			status: 404,
			message: 'Not Found'
		});

		expect(shown).toEqual({ message: 'Not Found' });
	});
});

/**
 * The `event` argument `handle` reads: the cookies it hands to Supabase, the
 * `locals` it fills in, and `setHeaders`, which is what these tests watch. The
 * rest of a real `RequestEvent` is left out, the way `requestFor` above leaves
 * it out for `handleError`.
 */
function eventForHandle(setHeaders: (headers: Record<string, string>) => void): RequestEvent {
	return {
		cookies: { getAll: () => [], set: () => {} },
		locals: {},
		setHeaders
	} as unknown as RequestEvent;
}

describe('handle', () => {
	it('sends every answer with the headers that keep a page out of frames and off plain http', async () => {
		const setHeaders = vi.fn();

		await handle({
			event: eventForHandle(setHeaders),
			resolve: async () => new Response('the page')
		});

		// Security review L41. The hook says beside each header why it is there;
		// this pins the exact values, so a loosened one is a deliberate change.
		expect(setHeaders).toHaveBeenCalledWith({
			'X-Content-Type-Options': 'nosniff',
			'Referrer-Policy': 'strict-origin-when-cross-origin',
			'X-Frame-Options': 'DENY',
			'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
			'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
		});
	});

	it('still answers with what the page rendered', async () => {
		const response = await handle({
			event: eventForHandle(() => {}),
			resolve: async () => new Response('the page')
		});

		expect(await response.text()).toBe('the page');
	});
});
