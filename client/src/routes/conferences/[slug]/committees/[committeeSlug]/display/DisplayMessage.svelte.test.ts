import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import DisplayMessage from './DisplayMessage.svelte';

describe('DisplayMessage', () => {
	it('centres the title as the heading, with its lines under it', () => {
		render(DisplayMessage, {
			props: { title: 'Suspended for lunch', lines: ['Back at 14:00 · in 41 min'] }
		});

		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Suspended for lunch');
		expect(screen.getByText('Back at 14:00 · in 41 min')).toBeTruthy();
	});

	it('draws a title alone, as a quick session ends', () => {
		const { container } = render(DisplayMessage, {
			props: { title: 'Session 1 has ended', lines: [] }
		});

		expect(container.querySelectorAll('p')).toHaveLength(0);
	});
});
