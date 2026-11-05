import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Inbox from '@lucide/svelte/icons/inbox';
import EmptyState from './EmptyState.svelte';

const withoutAction = {
	icon: Inbox,
	title: 'No applications yet.',
	description: 'When you apply to a conference, it appears here.'
};

describe('EmptyState', () => {
	it('states the fact and says what to do about it', () => {
		render(EmptyState, { props: withoutAction });

		expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('No applications yet.');
		expect(screen.getByText('When you apply to a conference, it appears here.')).toBeTruthy();
	});

	it('shows no button when there is nothing to do', () => {
		render(EmptyState, { props: withoutAction });

		expect(screen.queryByRole('link')).toBeNull();
	});

	it('shows the one action as a link when both its label and its address are given', () => {
		render(EmptyState, {
			props: { ...withoutAction, actionLabel: 'Browse conferences', actionHref: '/conferences' }
		});

		expect(screen.getByRole('link', { name: 'Browse conferences' }).getAttribute('href')).toBe(
			'/conferences'
		);
	});

	it('shows no action when only its label was given', () => {
		render(EmptyState, { props: { ...withoutAction, actionLabel: 'Browse conferences' } });

		expect(screen.queryByRole('link')).toBeNull();
	});
});
