import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import DisplayWallClock from './DisplayWallClock.svelte';

afterEach(() => {
	vi.useRealTimers();
});

describe('DisplayWallClock', () => {
	it("writes the time of day in the conference's timezone, and moves on the minute", () => {
		vi.useFakeTimers();
		// 12:07:50 UTC is 14:07 in Amsterdam in October.
		vi.setSystemTime(new Date('2026-10-01T12:07:50.000Z'));
		render(DisplayWallClock, { props: { timezone: 'Europe/Amsterdam', clockOffsetMs: 0 } });

		expect(screen.getByText('14:07')).toBeTruthy();
		vi.advanceTimersByTime(9_000);
		flushSync();
		expect(screen.getByText('14:07')).toBeTruthy();
		vi.advanceTimersByTime(1_000);
		flushSync();
		expect(screen.getByText('14:08')).toBeTruthy();
	});

	it("counts on the server's clock, not the browser's", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-10-01T12:07:50.000Z'));
		render(DisplayWallClock, { props: { timezone: 'Europe/Amsterdam', clockOffsetMs: 60_000 } });

		expect(screen.getByText('14:08')).toBeTruthy();
	});
});
