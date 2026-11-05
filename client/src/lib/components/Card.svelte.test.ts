import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import Card from './Card.svelte';

/*
	`createRawSnippet` builds the markup a page would write between `<Card>` and
	`</Card>`, so the test can hand the component its `children` prop. It is the
	only way to pass a snippet from plain TypeScript.
*/
const children = createRawSnippet(() => ({ render: () => '<span>Card body</span>' }));

describe('Card', () => {
	it('shows what is inside it', () => {
		render(Card, { props: { children } });

		expect(screen.getByText('Card body')).toBeTruthy();
	});

	it('is a plain box with no link when there is no href', () => {
		const { container } = render(Card, { props: { children } });

		expect(container.querySelector('a')).toBeNull();
	});

	it('becomes a link when given an href', () => {
		render(Card, { props: { href: '/conferences/thimun-2027', children } });

		expect(screen.getByRole('link').getAttribute('href')).toBe('/conferences/thimun-2027');
	});
});
