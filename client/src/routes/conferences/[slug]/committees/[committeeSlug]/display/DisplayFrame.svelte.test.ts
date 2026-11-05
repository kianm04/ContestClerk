import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet, flushSync } from 'svelte';
import DisplayFrame from './DisplayFrame.svelte';

const children = createRawSnippet(() => ({ render: () => '<p>China</p>' }));

// 12:07 UTC is 14:07 in Amsterdam in October.
const NOW = new Date('2026-10-01T12:07:30.000Z');

/** The projector's frame for the UNSC, five of six present, connected. */
function renderFrame(overrides: Record<string, unknown> = {}) {
	return render(DisplayFrame, {
		props: {
			committee: { name: 'Security Council', abbreviation: 'UNSC' },
			agendaTopic: 'Humanitarian access in armed conflict',
			timezone: 'Europe/Amsterdam',
			clockOffsetMs: 0,
			attendance: '5/6 present',
			liveStatus: 'live',
			children,
			...overrides
		}
	});
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
});

afterEach(() => {
	vi.useRealTimers();
});

describe('DisplayFrame', () => {
	it('draws the top line over the screen inside its own main, with nothing to press', () => {
		const { container } = renderFrame();
		const main = screen.getByRole('main');

		expect(main.getAttribute('id')).toBe('main');
		expect(main.className).toContain('overflow-hidden');
		expect(screen.getByAltText('MUNMeet')).toBeTruthy();
		expect(screen.getByText('UNSC')).toBeTruthy();
		expect(screen.getByText('· Humanitarian access in armed conflict')).toBeTruthy();
		expect(screen.getByText('14:07')).toBeTruthy();
		expect(container.textContent).toContain('· 5/6 present');
		expect(screen.getByText('China')).toBeTruthy();
		expect(container.querySelectorAll('form, button, a')).toHaveLength(0);
	});

	it('names the committee alone when it has no abbreviation and no agenda', () => {
		const { container } = renderFrame({
			committee: { name: 'Security Council', abbreviation: null },
			agendaTopic: null,
			attendance: null
		});

		expect(screen.getByText('Security Council')).toBeTruthy();
		expect(container.textContent).not.toContain('·');
	});

	it('says "Reconnecting…" while live updates are paused', () => {
		renderFrame({ liveStatus: 'paused' });

		expect(screen.getByText('Reconnecting…')).toBeTruthy();
	});

	it('shows "Press F for full screen" for three seconds, then takes it away', () => {
		renderFrame();

		expect(screen.getByText('Press F for full screen')).toBeTruthy();
		vi.advanceTimersByTime(3000);
		flushSync();
		expect(screen.queryByText('Press F for full screen')).toBeNull();
	});

	it('hides the pointer once the mouse has been still for three seconds, and shows it on a move', async () => {
		renderFrame();
		const main = screen.getByRole('main');

		expect(main.className).not.toContain('cursor-none');
		vi.advanceTimersByTime(3000);
		flushSync();
		expect(main.className).toContain('cursor-none');

		await fireEvent.mouseMove(window);
		expect(main.className).not.toContain('cursor-none');
	});

	it('enters full screen on F and leaves it on F again', async () => {
		const requestFullscreen = vi.fn(() => Promise.resolve());
		const exitFullscreen = vi.fn(() => Promise.resolve());
		document.documentElement.requestFullscreen = requestFullscreen;
		document.exitFullscreen = exitFullscreen;
		renderFrame();

		await fireEvent.keyDown(window, { key: 'f' });
		expect(requestFullscreen).toHaveBeenCalledTimes(1);

		Object.defineProperty(document, 'fullscreenElement', {
			configurable: true,
			value: document.documentElement
		});
		await fireEvent.keyDown(window, { key: 'F' });
		expect(exitFullscreen).toHaveBeenCalledTimes(1);

		// Ctrl+F is the browser's own find, and stays so.
		await fireEvent.keyDown(window, { key: 'f', ctrlKey: true });
		expect(exitFullscreen).toHaveBeenCalledTimes(1);
		Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
	});
});
