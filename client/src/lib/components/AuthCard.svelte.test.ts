import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import AuthCard from './AuthCard.svelte';

/*
	`createRawSnippet` builds the markup a page would write between `<AuthCard>`
	and `</AuthCard>`, so the test can hand the component its `children` prop. It
	is the only way to pass a snippet from plain TypeScript.
*/
const children = createRawSnippet(() => ({ render: () => '<form><span>The form</span></form>' }));

describe('AuthCard', () => {
	it('shows the title as the page heading', () => {
		render(AuthCard, { props: { title: 'Welcome back.', children } });

		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Welcome back.');
	});

	it('shows what is inside it', () => {
		render(AuthCard, { props: { title: 'Welcome back.', children } });

		expect(screen.getByText('The form')).toBeTruthy();
	});

	it('shows the subtitle when it is given one', () => {
		render(AuthCard, {
			props: {
				title: 'Create your account.',
				subtitle: 'One account for every conference.',
				children
			}
		});

		expect(screen.getByText('One account for every conference.')).toBeTruthy();
	});

	it('leaves the subtitle out when there is none', () => {
		const { container } = render(AuthCard, { props: { title: 'Log out of MUNMeet?', children } });

		expect(container.querySelector('p')).toBeNull();
	});
});
