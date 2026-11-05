import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NavigationEvent } from '@sveltejs/kit';
import { handleError } from './hooks.client';
import { UNEXPECTED_ERROR_TEXT } from '$lib/auth';
import { CLOCK_REFUSAL_EXPLANATION } from '$lib/database-errors';
import { LEAVING_GRACE_MS, watchForPageLeaving } from '$lib/page-leaving';

// `handleError` here is the hook SvelteKit calls in the browser when an error
// nobody planned for escapes a universal `load`. It is a plain function of its
// input, so it runs in Node like the server's hook in `hooks.server.test.ts`,
// and the refusal is handed over in the shapes the browser's Supabase client
// really produces it: a `PostgrestError` thrown as it stands, or its sentence
// inside a re-thrown `Error`.

/**
 * The `event` argument, with the one field this hook reads.
 *
 * A real `NavigationEvent` also carries the route's params and id, which
 * `handleError` does not look at, so a stand-in is cast to the type the way
 * `hooks.server.test.ts` casts its `RequestEvent`.
 */
function navigationTo(pathname: string): NavigationEvent {
	return { url: new URL(`http://localhost${pathname}`) } as unknown as NavigationEvent;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('handleError in the browser', () => {
	it('names the clock when PostgREST refused a token from its own future', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

		await handleError({
			error: { code: 'PGRST303', message: 'JWT issued at future', details: null, hint: null },
			event: navigationTo('/committees'),
			status: 500,
			message: 'Internal Error'
		});

		expect(logged).toHaveBeenCalledWith(CLOCK_REFUSAL_EXPLANATION);
	});

	it('names the clock when the refusal was re-thrown with only its sentence', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

		await handleError({
			error: new Error('Could not read the committees: JWT issued at future'),
			event: navigationTo('/committees'),
			status: 500,
			message: 'Internal Error'
		});

		expect(logged).toHaveBeenCalledWith(CLOCK_REFUSAL_EXPLANATION);
	});

	it('logs an ordinary failure without blaming the clock for it', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
		const thrown = new Error('Could not read the committees: fetch failed');

		await handleError({
			error: thrown,
			event: navigationTo('/committees'),
			status: 500,
			message: 'Internal Error'
		});

		// One line, not two: the address it happened on and the error itself.
		expect(logged).toHaveBeenCalledTimes(1);
		expect(logged).toHaveBeenCalledWith('Unexpected error while showing /committees', thrown);
	});

	it('gives the page the sentence the writing style asks for, never the raw error', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});

		const shown = await handleError({
			error: new Error('Could not read the committees: permission denied for table x'),
			event: navigationTo('/committees'),
			status: 500,
			message: 'Internal Error'
		});

		expect(shown).toEqual({ message: UNEXPECTED_ERROR_TEXT });
	});

	it('leaves a link to a route that does not exist saying what it said', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});

		const shown = await handleError({
			error: new Error('Not found: /nowhere'),
			event: navigationTo('/nowhere'),
			status: 404,
			message: 'Not Found'
		});

		expect(shown).toEqual({ message: 'Not Found' });
	});

	it('holds a failure back, unlogged, while the browser is leaving the page', async () => {
		vi.useFakeTimers();
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
		const browserWindow = new EventTarget() as unknown as Window;
		watchForPageLeaving(browserWindow);
		browserWindow.dispatchEvent(new Event('beforeunload'));
		let hasAnswered = false;

		// Safari cancelled the page's data request as the reader left it.
		const answering = Promise.resolve(
			handleError({
				error: new TypeError('Load failed'),
				event: navigationTo('/committees'),
				status: 500,
				message: 'Internal Error'
			})
		).then(() => {
			hasAnswered = true;
		});
		await vi.advanceTimersByTimeAsync(LEAVING_GRACE_MS - 1);

		expect(hasAnswered).toBe(false);
		expect(logged).not.toHaveBeenCalled();

		// A page that was not really left after all answers the way it always did.
		await vi.advanceTimersByTimeAsync(1);
		await answering;
		expect(hasAnswered).toBe(true);
		// The module remembers the leaving, so the page comes back for any test after this.
		browserWindow.dispatchEvent(new Event('pageshow'));
		vi.useRealTimers();
	});
});
