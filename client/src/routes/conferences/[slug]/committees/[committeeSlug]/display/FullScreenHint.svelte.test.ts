import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import FullScreenHint from './FullScreenHint.svelte';

afterEach(() => {
	vi.useRealTimers();
});

describe('FullScreenHint', () => {
	it('shows "Press F for full screen" once the page has come to life, for three seconds', () => {
		vi.useFakeTimers();
		render(FullScreenHint);

		expect(screen.getByText('Press F for full screen')).toBeTruthy();
		vi.advanceTimersByTime(2_999);
		flushSync();
		expect(screen.getByText('Press F for full screen')).toBeTruthy();
		vi.advanceTimersByTime(1);
		flushSync();
		expect(screen.queryByText('Press F for full screen')).toBeNull();
	});
});
