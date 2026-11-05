import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { committeeLiveUrl } from '$lib/urls';
import LiveStatusBar from './LiveStatusBar.svelte';

const LIVE_URL = committeeLiveUrl('thimun-2027', 'unsc');

describe('LiveStatusBar', () => {
	it('asks the reader to refresh once the connection has dropped', () => {
		render(LiveStatusBar, { props: { status: 'paused', refreshHref: LIVE_URL } });

		expect(screen.getByText('Live updates paused. Refresh to catch up.')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Refresh' }).getAttribute('href')).toBe(LIVE_URL);
	});

	it('says nothing while live, or before JavaScript has started listening', () => {
		const { unmount } = render(LiveStatusBar, { props: { status: 'live', refreshHref: LIVE_URL } });
		expect(screen.queryByText(/Live updates paused/)).toBeNull();
		unmount();

		render(LiveStatusBar, { props: { status: null, refreshHref: LIVE_URL } });
		expect(screen.queryByText(/Live updates paused/)).toBeNull();
	});
});
