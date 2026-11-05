import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import PageHeader from './PageHeader.svelte';

describe('PageHeader', () => {
	it('shows the title as the page heading', () => {
		render(PageHeader, { props: { title: 'Conferences' } });

		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Conferences');
	});

	it('shows the eyebrow and the subtitle when they are given', () => {
		render(PageHeader, {
			props: { title: 'THIMUN', eyebrow: 'Conference', subtitle: 'The Hague, Netherlands' }
		});

		expect(screen.getByText('Conference')).toBeTruthy();
		expect(screen.getByText('The Hague, Netherlands')).toBeTruthy();
	});

	it('shows the actions written between its tags', () => {
		const children = createRawSnippet(() => ({ render: () => '<span>Publish</span>' }));

		render(PageHeader, { props: { title: 'THIMUN', children } });

		expect(screen.getByText('Publish')).toBeTruthy();
	});

	it('has no outer margin, because the page decides the space around it', () => {
		const { container } = render(PageHeader, { props: { title: 'Conferences' } });
		const header = container.querySelector('header');
		const classNames = header?.className.split(' ') ?? [];

		// A Tailwind margin class is `m-`, `mt-`, `mb-`, `mx-` and so on. The page's
		// `gap-6` column, or a wrapping `mb-6`, spaces the header instead.
		const marginClasses = classNames.filter((className) => /^m[trblxy]?-/.test(className));

		expect(header).not.toBeNull();
		expect(marginClasses).toEqual([]);
	});
});
