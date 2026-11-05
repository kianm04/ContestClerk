import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { createRawSnippet } from 'svelte';
import Reveal from './Reveal.svelte';

// jsdom draws nothing, so an element's place on the page and the browser's
// `IntersectionObserver` are both stood in for here. The decisions themselves
// are in `$lib/reveal.ts` and tested there; these tests check that the
// component hides, waits and shows at the right moments.

/** A snippet with one sentence in it, so the tests have something to find. */
const children = createRawSnippet(() => ({ render: () => '<p>Something to reveal</p>' }));

/** The element `Reveal` draws round its children. */
function block(): HTMLElement {
	return screen.getByText('Something to reveal').parentElement as HTMLElement;
}

/**
 * Stands in for `IntersectionObserver` and keeps the callback the component
 * hands it, so a test can say when the block has scrolled into view.
 */
function stubIntersectionObserver(): { comeIntoView: () => void; constructed: number } {
	const state = { comeIntoView: () => {}, constructed: 0 };

	vi.stubGlobal(
		'IntersectionObserver',
		class {
			constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
				state.constructed += 1;
				state.comeIntoView = () => callback([{ isIntersecting: true }]);
			}
			observe() {}
			disconnect() {}
		}
	);

	return state;
}

/** Pretends every element sits this far down the page. */
function placeElementsAt(top: number): void {
	vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
		top
	} as DOMRect);
}

/** Pretends the reader has, or has not, asked for less motion. */
function setReducedMotion(matches: boolean): void {
	vi.stubGlobal('matchMedia', () => ({ matches }));
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('Reveal', () => {
	it('leaves a block on the first screen as it is', async () => {
		stubIntersectionObserver();
		setReducedMotion(false);
		placeElementsAt(200);

		render(Reveal, { props: { children } });
		await tick();

		expect(block().hasAttribute('data-shown')).toBe(true);
		expect(block().className).toContain('opacity-100');
	});

	it('hides a block further down until it scrolls into view', async () => {
		const observer = stubIntersectionObserver();
		setReducedMotion(false);
		placeElementsAt(5000);

		render(Reveal, { props: { children } });
		await tick();

		expect(block().hasAttribute('data-shown')).toBe(false);
		expect(block().className).toContain('opacity-0');

		observer.comeIntoView();
		await tick();

		expect(block().hasAttribute('data-shown')).toBe(true);
		expect(block().className).toContain('opacity-100');
	});

	it('hides nothing for somebody who asked for less motion', async () => {
		const observer = stubIntersectionObserver();
		setReducedMotion(true);
		placeElementsAt(5000);

		render(Reveal, { props: { children } });
		await tick();

		expect(block().hasAttribute('data-shown')).toBe(true);
		expect(observer.constructed).toBe(0);
	});

	it('waits the delay it is given before rising', async () => {
		stubIntersectionObserver();
		setReducedMotion(false);
		placeElementsAt(200);

		render(Reveal, { props: { children, delay: 240 } });
		await tick();

		expect(block().style.transitionDelay).toBe('240ms');
	});
});
