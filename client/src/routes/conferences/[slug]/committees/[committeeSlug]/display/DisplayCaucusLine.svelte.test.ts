import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import DisplayCaucusLine from './DisplayCaucusLine.svelte';

afterEach(() => {
	vi.useRealTimers();
});

describe('DisplayCaucusLine', () => {
	it('counts the caucus down while it runs, with its own thin bar and no buttons', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-10-01T12:00:00.000Z'));
		const { container } = render(DisplayCaucusLine, {
			props: {
				caucus: {
					totalSeconds: 600,
					endsAt: '2026-10-01T12:06:12.000Z',
					pausedRemainingSeconds: null
				},
				clockOffsetMs: 0
			}
		});
		const line = screen.getByRole('timer', { name: 'Caucus time left' });

		expect(line.textContent?.replace(/\s+/g, ' ').trim()).toBe('Caucus 6:12 left');
		vi.advanceTimersByTime(1_000);
		flushSync();
		expect(line.textContent?.replace(/\s+/g, ' ').trim()).toBe('Caucus 6:11 left');
		expect(container.querySelector('[aria-hidden="true"]')?.className).toContain('h-[0.5vw]');
		expect(container.querySelector('button')).toBeNull();
	});
});
