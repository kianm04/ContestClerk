import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { ResolvedPathname } from '$app/types';
import JoinCodeCard from './JoinCodeCard.svelte';

// `page` from `$app/state` only exists inside a running SvelteKit app, so the card
// is handed the address of the dashboard it would be drawn on.
vi.mock('$app/state', () => ({
	page: { url: new URL('https://munmeet.app/delegations/delegation-1') }
}));

const JOIN_PATH = '/join/H7KP3QWX' as ResolvedPathname;

describe('JoinCodeCard', () => {
	it('shows the code, the hint and the whole link under the heading it is given', () => {
		render(JoinCodeCard, {
			props: {
				joinCode: 'H7KP3QWX',
				joinPath: JOIN_PATH,
				heading: 'Invite',
				hint: 'Members create an account, open the link and press Join.',
				closedNotice: null
			}
		});

		expect(screen.getByRole('heading', { name: 'Invite' })).toBeTruthy();
		expect(screen.getByText('H7KP3QWX')).toBeTruthy();
		expect(
			screen.getByText('Members create an account, open the link and press Join.')
		).toBeTruthy();
		expect(screen.getByText('https://munmeet.app/join/H7KP3QWX')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy();
	});

	it('labels the code "Join code" when the heading does not already say so', () => {
		render(JoinCodeCard, {
			props: {
				joinCode: 'H7KP3QWX',
				joinPath: JOIN_PATH,
				heading: 'Invite',
				hint: 'A hint.',
				closedNotice: null
			}
		});

		expect(screen.getByText('Join code')).toBeTruthy();
	});

	it('does not repeat "Join code" under a heading that says it', () => {
		render(JoinCodeCard, {
			props: {
				joinCode: 'H7KP3QWX',
				joinPath: JOIN_PATH,
				heading: 'Join code',
				hint: 'A hint.',
				closedNotice: null
			}
		});

		expect(screen.getAllByText('Join code')).toHaveLength(1);
	});

	it('draws only the notice once nobody can join', () => {
		render(JoinCodeCard, {
			props: {
				joinCode: 'H7KP3QWX',
				joinPath: JOIN_PATH,
				heading: 'Invite',
				hint: 'A hint.',
				closedNotice: 'This delegation is withdrawn; nobody can join.'
			}
		});

		expect(screen.getByText('This delegation is withdrawn; nobody can join.')).toBeTruthy();
		expect(screen.queryByRole('heading')).toBeNull();
		expect(screen.queryByText('H7KP3QWX')).toBeNull();
		expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull();
	});
});
