import { error, redirect } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';
import { load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in event below is exactly the shape `load` is given.
import type { PageServerLoadEvent } from './$types';

/** The page `load`'s event, whose `parent()` stands in for the chair layout's gate. */
function makeLoadEvent(search: string, parent: () => Promise<unknown>): PageServerLoadEvent {
	return {
		url: new URL(
			`http://localhost/conferences/thimun-2027/committees/unsc/chair/speakers${search}`
		),
		params: { slug: 'thimun-2027', committeeSlug: 'unsc' },
		parent
	} as unknown as PageServerLoadEvent;
}

/** Run something expected to throw, and give back what it threw. */
async function caught(run: () => unknown): Promise<unknown> {
	try {
		await run();
	} catch (thrown) {
		return thrown;
	}

	throw new Error('Nothing was thrown.');
}

describe('load', () => {
	it('sends a chair to the GSL view for good, dropping ?list= and ?yield=', async () => {
		const parent = vi.fn(async () => ({}));

		for (const search of ['', '?list=list-2', '?yield=seat']) {
			const thrown = await caught(() => load(makeLoadEvent(search, parent)));

			expect(thrown).toMatchObject({
				status: 308,
				location: '/conferences/thimun-2027/committees/unsc/chair/gsl'
			});
		}

		expect(parent).toHaveBeenCalledTimes(3);
	});

	it("lets the chair layout's gate answer first: sign in for a visitor, a 404 for anybody else", async () => {
		const toSignIn = await caught(() =>
			load(
				makeLoadEvent('', async () => {
					redirect(303, '/login?next=%2Fchair%2Fspeakers');
				})
			)
		);
		const notFound = await caught(() =>
			load(
				makeLoadEvent('', async () => {
					error(404, 'This committee does not exist.');
				})
			)
		);

		expect(toSignIn).toMatchObject({ status: 303, location: '/login?next=%2Fchair%2Fspeakers' });
		expect(notFound).toMatchObject({ status: 404 });
	});
});
