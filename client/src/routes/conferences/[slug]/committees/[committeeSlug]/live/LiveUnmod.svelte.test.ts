import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import LiveUnmod from './LiveUnmod.svelte';

// 12:24 UTC is 14:24 in Amsterdam in October.
const NOW = new Date('2026-10-01T12:23:18.000Z');

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(NOW);
});

afterEach(() => {
	vi.useRealTimers();
});

describe('LiveUnmod', () => {
	it('centres the clock, says when the room is back and draws the bar, with no list', () => {
		const endsAt = new Date(NOW.getTime() + 522_000).toISOString();
		const { container } = render(LiveUnmod, {
			props: {
				topic: 'Drafting the working paper',
				timer: { totalSeconds: 600, endsAt, pausedRemainingSeconds: null },
				clockOffsetMs: 0,
				timezone: 'Europe/Amsterdam'
			}
		});

		expect(
			screen.getByRole('region', { name: 'Unmoderated caucus · Drafting the working paper' })
		).toBeTruthy();
		expect(screen.getByRole('timer').textContent?.trim()).toBe('8:42');
		expect(screen.getByRole('timer').className).toContain('text-[72px]');
		expect(screen.getByText('Back at 14:32')).toBeTruthy();
		expect(container.querySelector('.bg-brand-500')).toBeTruthy();
		expect(screen.queryByRole('list')).toBeNull();
	});

	it('greys the bar while the caucus is paused', () => {
		const { container } = render(LiveUnmod, {
			props: {
				topic: null,
				timer: { totalSeconds: 600, endsAt: null, pausedRemainingSeconds: 300 },
				clockOffsetMs: 0,
				timezone: 'Europe/Amsterdam'
			}
		});

		expect(screen.getByRole('region', { name: 'Unmoderated caucus' })).toBeTruthy();
		expect(container.querySelector('.bg-ink-400')).toBeTruthy();
	});
});
