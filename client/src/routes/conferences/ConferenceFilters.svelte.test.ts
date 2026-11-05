import { createRawSnippet, tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { goto } from '$app/navigation';
import { EMPTY_CONFERENCE_QUERY } from '$lib/conferences';
import ConferenceFilters from './ConferenceFilters.svelte';

// The directory's filter form once the page has come to life (T180,
// `specs/05-pages/public/conferences.md`, "The top of the page"). That the button
// is on screen without JavaScript is `tests/e2e/conferences.spec.ts`'s to prove,
// in its `desktop-no-js` project, because a component test always runs scripts.

// `goto` and the navigation hooks only work inside a running SvelteKit app. The
// stand-ins do nothing, and the test reads which address `goto` was sent to.
vi.mock('$app/navigation', () => ({
	goto: vi.fn(async () => undefined),
	beforeNavigate: vi.fn(),
	afterNavigate: vi.fn()
}));

const COUNTRIES = [{ code: 'NL', name: 'Netherlands' }];

// The page puts the results inside the form; these tests only need the form.
const children = createRawSnippet(() => ({ render: () => '<p>Results</p>' }));

/** Draw the form with no filters set, and let its `onMount` run. */
async function renderFilters(): Promise<void> {
	render(ConferenceFilters, {
		props: { query: EMPTY_CONFERENCE_QUERY, countries: COUNTRIES, children }
	});

	// `onMount` runs once the component is on the page; `tick` waits for that.
	await tick();
}

describe('ConferenceFilters', () => {
	it('hides "Apply filters" once the page has come to life', async () => {
		await renderFilters();

		const button = screen.getByRole('button', { name: 'Apply filters', hidden: true });

		// The `hidden` attribute is on the box around the button, which hides the
		// button with it. The button is still in the form, and still its submit button.
		expect(button.closest('[hidden]')).not.toBeNull();
		expect(button.getAttribute('type')).toBe('submit');
	});

	it('searches at once when Enter is pressed in the search box', async () => {
		vi.mocked(goto).mockClear();
		await renderFilters();

		const searchBox = screen.getByLabelText('Search conferences');

		await fireEvent.input(searchBox, { target: { value: 'Vienna' } });
		const wasNotCancelled = await fireEvent.keyDown(searchBox, { key: 'Enter' });

		expect(goto).toHaveBeenCalledWith('/conferences?q=Vienna', expect.anything());
		// Cancelled, so the browser does not send the form a second time.
		expect(wasNotCancelled).toBe(false);
	});

	it('draws the level and region chips as links, with "All" chosen', async () => {
		await renderFilters();

		// The chips are links (Trello WMcXfry0), so they work without JavaScript.
		expect(screen.getByRole('link', { name: 'All' }).getAttribute('aria-current')).toBe('true');
		expect(screen.getByRole('link', { name: 'University' }).getAttribute('href')).toBe(
			'/conferences?level=university'
		);
		expect(screen.getByRole('link', { name: 'Europe' }).getAttribute('href')).toBe(
			'/conferences?region=europe'
		);
	});

	it('sends every ticked region, not only the last one', async () => {
		vi.mocked(goto).mockClear();
		await renderFilters();

		await fireEvent.click(screen.getByRole('checkbox', { name: 'Europe' }));
		await fireEvent.click(screen.getByRole('checkbox', { name: 'Asia' }));

		expect(goto).toHaveBeenLastCalledWith(
			'/conferences?region=europe&region=asia',
			expect.anything()
		);
	});

	it('filters by a date window as soon as one is chosen', async () => {
		vi.mocked(goto).mockClear();
		await renderFilters();

		await fireEvent.click(screen.getByRole('radio', { name: 'Next 6 months' }));

		expect(goto).toHaveBeenCalledWith('/conferences?within=6', expect.anything());
	});

	it('leaves Enter alone while a character is still being composed', async () => {
		vi.mocked(goto).mockClear();
		await renderFilters();

		const searchBox = screen.getByLabelText('Search conferences');
		await fireEvent.keyDown(searchBox, { key: 'Enter', isComposing: true });

		expect(goto).not.toHaveBeenCalled();
	});
});
