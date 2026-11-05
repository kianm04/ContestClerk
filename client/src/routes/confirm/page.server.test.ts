import { describe, expect, it } from 'vitest';
import { actions } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in event below is the shape the action is given.
import type { RequestEvent } from './$types';

/** A post to `/confirm` carrying `fields`, as a `ConfirmButton`'s first press sends it. */
function confirmPost(search: string, fields: Record<string, string>): RequestEvent {
	const url = new URL(`http://localhost/confirm?${search}`);
	const request = new Request(url, { method: 'POST', body: new URLSearchParams(fields) });

	return { request, url } as unknown as RequestEvent;
}

const QUESTION = new URLSearchParams({
	title: 'Delete your account?',
	text: 'Everything you made goes with it.',
	label: 'Delete account',
	variant: 'danger',
	action: '/settings?/deleteAccount',
	back: '/settings'
}).toString();

describe('/confirm default action', () => {
	it('shows the question and hands back the fields of the first press', async () => {
		const result = await actions.default(confirmPost(QUESTION, { confirmation: 'DELETE' }));

		expect(result).toEqual({
			question: {
				title: 'Delete your account?',
				text: 'Everything you made goes with it.',
				label: 'Delete account',
				variant: 'danger',
				actionAddress: '/settings?/deleteAccount',
				returnAddress: '/settings'
			},
			fields: [{ name: 'confirmation', value: 'DELETE' }]
		});
	});

	it('asks nothing when the answer would go to another website', async () => {
		const foreign = QUESTION.replace(
			encodeURIComponent('/settings?/deleteAccount'),
			encodeURIComponent('https://example.com/steal')
		);

		const result = await actions.default(confirmPost(foreign, { confirmation: 'DELETE' }));

		expect(result).toMatchObject({ status: 400, data: { question: null, fields: [] } });
	});
});
