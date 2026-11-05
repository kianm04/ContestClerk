import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import FlashToast from './FlashToast.svelte';
import { FLASH_VISIBLE_MS } from '$lib/flash';

// The component hides the message with a timer, so these tests run the clock
// forward themselves instead of waiting five real seconds.
beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('FlashToast', () => {
	it('shows the message it is given', () => {
		render(FlashToast, { props: { flash: { tone: 'success', message: 'Saved.' } } });

		expect(screen.getByText('Saved.')).toBeTruthy();
	});

	it('shows nothing at all when there is no message', () => {
		render(FlashToast, { props: { flash: null } });

		expect(screen.queryByRole('status')).toBeNull();
	});

	it('takes the message away again once its five seconds are up', async () => {
		render(FlashToast, { props: { flash: { tone: 'info', message: 'Saved.' } } });

		expect(screen.getByText('Saved.')).toBeTruthy();

		await vi.advanceTimersByTimeAsync(FLASH_VISIBLE_MS);

		expect(screen.queryByText('Saved.')).toBeNull();
	});

	it('keeps the message for its five seconds when the page drops it sooner', async () => {
		// A live update reads the page's data again and SvelteKit forgets the
		// action's answer, so `flash` can go back to null at once.
		const { rerender } = render(FlashToast, {
			props: { flash: { tone: 'error', message: 'Refused.' } }
		});

		await rerender({ flash: null });
		await vi.advanceTimersByTimeAsync(FLASH_VISIBLE_MS - 1);

		expect(screen.getByText('Refused.')).toBeTruthy();

		await vi.advanceTimersByTimeAsync(1);

		expect(screen.queryByText('Refused.')).toBeNull();
	});

	it('puts the message in a region a screen reader reads out', () => {
		const { container } = render(FlashToast, {
			props: { flash: { tone: 'success', message: 'Saved.' } }
		});

		expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
	});
});
