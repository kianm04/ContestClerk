import { describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterNavigate } from '$app/navigation';
import MobileMenu from './MobileMenu.svelte';
import type { NavigationLink } from '$lib/navigation';

// `afterNavigate` keeps the function the menu hands it, so a test can call it
// the way SvelteKit would after a navigation. The real one only works inside a
// running app.
vi.mock('$app/navigation', () => ({ afterNavigate: vi.fn() }));

/** The function the menu most recently handed to `afterNavigate`. */
function afterNavigateCallback(): () => void {
	const calls = vi.mocked(afterNavigate).mock.calls;
	return calls[calls.length - 1][0] as () => void;
}

const LINKS: NavigationLink[] = [{ label: 'Conferences', href: '/conferences' }];

/** Draw the menu and press its button, which opens the panel over the page. */
async function openMenu(): Promise<void> {
	render(MobileMenu, { props: { links: LINKS, pathname: '/' } });
	await fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
}

describe('MobileMenu', () => {
	it('names the button it opens from, which has no visible words', () => {
		render(MobileMenu, { props: { links: LINKS, pathname: '/' } });

		expect(screen.getByRole('button', { name: 'Menu' })).toBeTruthy();
	});

	it('draws no links until it is opened', () => {
		render(MobileMenu, { props: { links: LINKS, pathname: '/' } });

		expect(screen.queryByRole('link', { name: 'Conferences' })).toBeNull();
	});

	it('holds the same links as the top bar once it is open', async () => {
		await openMenu();

		const dialog = await screen.findByRole('dialog', { name: 'Menu' });

		expect(dialog.querySelector('a[href="/conferences"]')).toBeTruthy();
	});

	it('gives every link a row at least 44px tall', async () => {
		await openMenu();

		const link = await screen.findByRole('link', { name: 'Conferences' });
		expect(link.className).toContain('min-h-11');
	});

	it('shuts again once the reader has gone to another page', async () => {
		await openMenu();
		await screen.findByRole('dialog', { name: 'Menu' });

		flushSync(afterNavigateCallback());

		await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
	});

	it('is hidden from 1024px up, where the links are in the bar', () => {
		const { container } = render(MobileMenu, { props: { links: LINKS, pathname: '/' } });

		expect(container.firstElementChild?.className).toContain('lg:hidden');
	});
});
