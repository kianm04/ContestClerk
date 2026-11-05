import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import LiveCaucusLine from './LiveCaucusLine.svelte';

afterEach(() => {
	vi.useRealTimers();
});

describe('LiveCaucusLine', () => {
	it('counts the caucus down while it runs, with a thin bar', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-10-01T12:00:00.000Z'));
		const { container } = render(LiveCaucusLine, {
			props: {
				caucus: {
					totalSeconds: 720,
					endsAt: '2026-10-01T12:06:12.000Z',
					pausedRemainingSeconds: null
				},
				clockOffsetMs: 0
			}
		});
		const line = screen.getByRole('timer', { name: 'Caucus time left' });

		expect(line.textContent?.replace(/\s+/g, ' ').trim()).toBe('Caucus 6:12 left of 12:00');
		vi.advanceTimersByTime(1_000);
		flushSync();
		expect(line.textContent?.replace(/\s+/g, ' ').trim()).toBe('Caucus 6:11 left of 12:00');
		expect(container.querySelector('[aria-hidden="true"]')?.className).toContain('h-1');
	});
});
