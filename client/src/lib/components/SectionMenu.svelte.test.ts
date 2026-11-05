import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
import { createRawSnippet, tick } from 'svelte';
import { afterNavigate } from '$app/navigation';
import SectionMenu from './SectionMenu.svelte';

// `afterNavigate` only works inside a running SvelteKit app. The stand-in keeps
// the function the menu hands it, so a test can call it the way SvelteKit would
// after a navigation.
vi.mock('$app/navigation', () => ({ afterNavigate: vi.fn() }));

/*
	`createRawSnippet` builds the markup a page would write between `<SectionMenu>`
	and `</SectionMenu>`, so the test can hand the component its `children` prop.
*/
const children = createRawSnippet(() => ({
	render: () => '<a href="/manage/thimun-2027/details">Details</a>'
}));

/** The function the menu asked SvelteKit to call after every navigation. */
function afterNavigateCallback(): () => void {
	const calls = vi.mocked(afterNavigate).mock.calls;
	const lastCall = calls[calls.length - 1];

	return lastCall[0] as () => void;
}

/** Opens the menu as a click on its button would, and lets Svelte catch up. */
async function openMenu(details: HTMLDetailsElement): Promise<void> {
	details.open = true;
	await fireEvent(details, new Event('toggle'));
}

describe('SectionMenu', () => {
	beforeEach(() => {
		vi.mocked(afterNavigate).mockClear();
	});

	it('is a <details>, so it opens with no JavaScript, and starts closed', () => {
		const { container } = render(SectionMenu, { props: { label: 'Dashboard', children } });

		const details = container.querySelector('details');
		expect(details).toBeTruthy();
		expect(details?.open).toBe(false);
	});

	it('names the page being shown on its button', () => {
		const { container } = render(SectionMenu, {
			props: { label: 'Dashboard', icon: LayoutDashboard, children }
		});

		expect(container.querySelector('summary')?.textContent).toContain('Dashboard');
	});

	it('holds what is written between its tags', async () => {
		const { container } = render(SectionMenu, { props: { label: 'Dashboard', children } });

		await openMenu(container.querySelector('details') as HTMLDetailsElement);

		expect(screen.getByRole('link', { name: 'Details' })).toBeTruthy();
	});

	it('closes itself after a navigation', async () => {
		const { container } = render(SectionMenu, { props: { label: 'Dashboard', children } });
		const details = container.querySelector('details') as HTMLDetailsElement;
		await openMenu(details);
		expect(details.open).toBe(true);

		afterNavigateCallback()();
		await tick();

		expect(details.open).toBe(false);
	});

	it('names an icon-only button for a screen reader, since it shows no words', () => {
		render(SectionMenu, {
			props: { label: 'Menu', icon: LayoutDashboard, isIconOnly: true, children }
		});

		expect(screen.getByLabelText('Menu').tagName).toBe('SUMMARY');
	});

	it('gives its button at least 44px to press, drawn full or as an icon', () => {
		const full = render(SectionMenu, { props: { label: 'Dashboard', children } });
		const iconOnly = render(SectionMenu, {
			props: { label: 'Menu', icon: LayoutDashboard, isIconOnly: true, children }
		});

		expect(full.container.querySelector('summary')?.className).toContain('min-h-11');
		expect(iconOnly.container.querySelector('summary')?.className).toContain('size-11');
	});
});
