import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import FloorClock from './FloorClock.svelte';

/** The clock's digits, as a screen reader finds them. */
function clock(): HTMLElement {
	return screen.getByRole('timer', { name: 'Time left' });
}

describe('FloorClock', () => {
	it('writes the time left with no leading zero, in tabular digits', () => {
		render(FloorClock, { props: { secondsLeft: 52, clockState: 'running' } });

		expect(clock().textContent?.trim()).toBe('0:52');
		expect(clock().className).toContain('tabular-nums');
		expect(clock().className).toContain('text-ink-900');
	});

	it('turns to the warning colour under ten seconds', () => {
		render(FloorClock, { props: { secondsLeft: 9, clockState: 'running' } });

		expect(clock().textContent?.trim()).toBe('0:09');
		expect(clock().className).toContain('text-warning-700');
	});

	it('keeps its own colour at exactly ten seconds', () => {
		render(FloorClock, { props: { secondsLeft: 10, clockState: 'running' } });

		expect(clock().className).toContain('text-ink-900');
	});

	it('turns to danger at zero, and counts up past it with a plus', () => {
		const zero = render(FloorClock, { props: { secondsLeft: 0, clockState: 'running' } });

		expect(zero.getByRole('timer').className).toContain('text-danger-700');
		expect(zero.getByRole('timer').textContent?.trim()).toBe('0:00');
		zero.unmount();

		render(FloorClock, { props: { secondsLeft: -7, clockState: 'running' } });

		expect(clock().textContent?.trim()).toBe('+0:07');
		expect(clock().className).toContain('text-danger-700');
	});

	it('writes "Paused" beside a clock paused after it ran', () => {
		render(FloorClock, { props: { secondsLeft: 52, clockState: 'paused' } });

		expect(screen.getByText('Paused')).toBeTruthy();
	});

	it('writes no word beside a clock that is running, or ready and not yet started', () => {
		const running = render(FloorClock, { props: { secondsLeft: 52, clockState: 'running' } });

		expect(running.queryByText('Paused')).toBeNull();
		running.unmount();

		render(FloorClock, { props: { secondsLeft: 90, clockState: 'ready' } });

		expect(clock().textContent?.trim()).toBe('1:30');
		expect(screen.queryByText('Paused')).toBeNull();
	});

	it('never blinks', () => {
		render(FloorClock, { props: { secondsLeft: -7, clockState: 'running' } });

		expect(clock().className).not.toMatch(/animate-/);
	});

	it("draws the projector's and the phone's sizes, with \"Paused\" only beside the phone's speaker clock (S12, S13)", () => {
		const display = render(FloorClock, {
			props: { secondsLeft: 41, clockState: 'paused', size: 'display' }
		});

		expect(clock().className).toContain('text-[17vw]');
		expect(display.queryByText('Paused')).toBeNull();
		display.unmount();

		const phoneUnmod = render(FloorClock, {
			props: { secondsLeft: 41, clockState: 'paused', size: 'phoneUnmod' }
		});

		expect(clock().className).toContain('text-[72px]');
		expect(screen.queryByText('Paused')).toBeNull();
		phoneUnmod.unmount();

		// The phone's speaker clock says "Paused" beside it, as the console's does.
		render(FloorClock, { props: { secondsLeft: 41, clockState: 'paused', size: 'phone' } });

		expect(clock().className).toContain('text-[56px]');
		expect(screen.getByText('Paused')).toBeTruthy();
	});
});
