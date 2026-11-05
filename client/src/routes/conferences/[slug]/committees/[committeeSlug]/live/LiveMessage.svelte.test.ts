import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import LiveMessage from './LiveMessage.svelte';

describe('LiveMessage', () => {
	it("puts the room's moment in a panel, the title as its heading and the lines under it", () => {
		render(LiveMessage, {
			props: { title: 'Suspended for lunch', lines: ['Back at 14:00 · in 41 min'] }
		});

		expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Suspended for lunch');
		expect(screen.getByText('Back at 14:00 · in 41 min')).toBeTruthy();
	});

	it('draws both lines of the last session', () => {
		render(LiveMessage, {
			props: {
				title: 'Session 1 has ended',
				lines: ['That was the last session.', 'Awards are announced by the organisers.']
			}
		});

		expect(screen.getByText('That was the last session.')).toBeTruthy();
		expect(screen.getByText('Awards are announced by the organisers.')).toBeTruthy();
	});
});
