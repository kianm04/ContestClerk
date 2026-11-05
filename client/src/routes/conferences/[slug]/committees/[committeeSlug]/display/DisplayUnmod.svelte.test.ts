import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import DisplayUnmod from './DisplayUnmod.svelte';

// 12:24 UTC is 14:24 in Amsterdam in October.
const NOW = new Date('2026-10-01T12:23:18.000Z');

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(NOW);
});

afterEach(() => {
	vi.useRealTimers();
});

describe('DisplayUnmod', () => {
	it('centres the huge clock between the caucus and when the room is back', () => {
		const endsAt = new Date(NOW.getTime() + 522_000).toISOString();
		render(DisplayUnmod, {
			props: {
				topic: 'Drafting the working paper',
				timer: { totalSeconds: 600, endsAt, pausedRemainingSeconds: null },
				clockOffsetMs: 0,
				timezone: 'Europe/Amsterdam'
			}
		});

		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
			'Unmoderated caucus · Drafting the working paper'
		);
		expect(screen.getByRole('timer').textContent?.trim()).toBe('8:42');
		expect(screen.getByRole('timer').className).toContain('text-[22vw]');
		expect(screen.getByText('Back at 14:32')).toBeTruthy();
	});

	it('counts up in danger once the time is up, and "Back at" holds still', () => {
		const endsAt = new Date(NOW.getTime() - 7_000).toISOString();
		render(DisplayUnmod, {
			props: {
				topic: null,
				timer: { totalSeconds: 600, endsAt, pausedRemainingSeconds: null },
				clockOffsetMs: 0,
				timezone: 'Europe/Amsterdam'
			}
		});

		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Unmoderated caucus');
		expect(screen.getByRole('timer').textContent?.trim()).toBe('+0:07');
		expect(screen.getByRole('timer').className).toContain('text-danger-700');
		expect(screen.getByText('Back at 14:23')).toBeTruthy();
	});
});
