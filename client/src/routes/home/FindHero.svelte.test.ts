import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { EMPTY_CONFERENCE_QUERY } from '$lib/conferences';
import type { FindHero as Hero } from '$lib/home-hero';
import { conferenceListUrl } from '$lib/urls';
import FindHero from './FindHero.svelte';

const OPEN_CONFERENCES = conferenceListUrl({ ...EMPTY_CONFERENCE_QUERY, openOnly: true });

/** Noor's hero, a new account with nothing: section 6(a) of `docs/home.md`. */
function makeHero(overrides: Partial<Hero> = {}): Hero {
	return {
		kind: 'find',
		title: 'Find your first conference',
		factLine: '6 conferences are open for applications.',
		primary: { label: 'Find a conference', href: OPEN_CONFERENCES },
		secondary: { label: 'Run a quick session', href: '/quick/new' },
		...overrides
	};
}

describe('FindHero', () => {
	it('is the page’s h1, one fact line and the one button to the open conferences', () => {
		const { container } = render(FindHero, { props: { hero: makeHero() } });

		const heading = screen.getByRole('heading', { level: 1 });
		const button = screen.getByRole('link', { name: 'Find a conference' });

		expect(heading.textContent?.trim()).toBe('Find your first conference');
		expect(heading.className).toContain('font-display');
		expect(screen.getByText('6 conferences are open for applications.').className).toContain(
			'text-muted-foreground'
		);
		expect(button.getAttribute('href')).toBe(OPEN_CONFERENCES);
		expect(button.className).toContain('bg-primary');
		expect(container.querySelectorAll('.bg-primary')).toHaveLength(1);
	});

	it('puts the quick session beside the button as a text link, and nothing when it is offered elsewhere', () => {
		render(FindHero, { props: { hero: makeHero() } });

		const link = screen.getByRole('link', { name: 'Run a quick session' });

		expect(link.getAttribute('href')).toBe('/quick/new');
		expect(link.className).not.toContain('bg-primary');
		expect(screen.getAllByRole('link')).toHaveLength(2);
	});

	it('shows nothing else: no search box, no picture, and no second link without one to offer', () => {
		const { container } = render(FindHero, { props: { hero: makeHero({ secondary: null }) } });

		expect(screen.queryByRole('search')).toBeNull();
		expect(screen.queryByRole('textbox')).toBeNull();
		expect(screen.getAllByRole('link')).toHaveLength(1);
		expect(container.querySelector('img')).toBeNull();
	});

	it('is the same white panel as the conference hero', () => {
		const { container } = render(FindHero, { props: { hero: makeHero() } });

		const panel = container.querySelector('[data-slot="card"]');

		expect(panel?.className).toContain('border-border');
		expect(panel?.className).toContain('rounded-2xl');
		expect(panel?.className).toContain('shadow-none');
	});

	it('leaves the fact line out when the count was not read', () => {
		const { container } = render(FindHero, {
			props: { hero: makeHero({ title: 'Find your next conference', factLine: '' }) }
		});

		expect(screen.getByRole('heading', { level: 1 }).textContent?.trim()).toBe(
			'Find your next conference'
		);
		expect(container.querySelector('p')).toBeNull();
	});
});
