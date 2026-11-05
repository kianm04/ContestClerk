import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import FaqList, { type FaqItem } from './FaqList.svelte';

const items = [
	{ question: 'What does MUNMeet cost?', answer: 'Two euros per accepted delegate.' },
	{ question: 'Who pays?', answer: 'The delegate, through the conference fee.' }
];

/*
	The type annotation is what lets `'/for-organisers'` be written here: `href` is a
	`ResolvedPathname`, which is the list of the routes that really exist, and a
	string only counts as one of them where its type is known.
*/
const itemsWithALink: FaqItem[] = [
	{
		question: 'What does MUNMeet cost?',
		answer: 'Two euros per accepted delegate.',
		link: { href: '/for-organisers', label: 'See what it costs' }
	},
	{ question: 'Who pays?', answer: 'The delegate, through the conference fee.' }
];

describe('FaqList', () => {
	it('shows every question', () => {
		render(FaqList, { props: { items } });

		expect(screen.getByText('What does MUNMeet cost?')).toBeTruthy();
		expect(screen.getByText('Who pays?')).toBeTruthy();
	});

	it('shows every answer', () => {
		render(FaqList, { props: { items } });

		expect(screen.getByText('Two euros per accepted delegate.')).toBeTruthy();
	});

	it('uses the browser’s own collapsible block, so it works without JavaScript', () => {
		const { container } = render(FaqList, { props: { items } });

		expect(container.querySelectorAll('details')).toHaveLength(2);
		expect(container.querySelectorAll('summary')).toHaveLength(2);
	});

	it('starts with every answer closed', () => {
		const { container } = render(FaqList, { props: { items } });

		expect(container.querySelector('details')?.hasAttribute('open')).toBe(false);
	});

	it('shows no link when no question carries one', () => {
		render(FaqList, { props: { items } });

		expect(screen.queryByRole('link')).toBeNull();
	});

	it('shows the link of a question that carries one', () => {
		render(FaqList, { props: { items: itemsWithALink } });

		const link = screen.getByRole('link');

		expect(link.textContent).toContain('See what it costs');
		expect(link.getAttribute('href')).toBe('/for-organisers');
	});

	it('puts the link in the same collapsible block as its answer, so it is hidden until opened', () => {
		const { container } = render(FaqList, { props: { items: itemsWithALink } });

		const details = container.querySelectorAll('details');

		expect(details[0].querySelector('a')).toBeTruthy();
		expect(details[1].querySelector('a')).toBeNull();
	});
});
