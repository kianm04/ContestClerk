import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ProgressLine from './ProgressLine.svelte';

/** The bar's filled part. */
function fillOf(container: HTMLElement): HTMLElement {
	const fill = container.querySelector<HTMLElement>('[aria-hidden="true"] > div');

	if (fill === null) throw new Error('The bar has no fill.');

	return fill;
}

describe('ProgressLine', () => {
	it('fills the bar with the time spoken and writes both times under it', () => {
		const { container } = render(ProgressLine, {
			props: { spokenSeconds: 45, totalSeconds: 90, clockState: 'running' }
		});

		expect(fillOf(container).style.width).toBe('50%');
		expect(fillOf(container).className).toContain('bg-brand-500');
		expect(screen.getByText('0:45 spoken')).toBeTruthy();
		expect(screen.getByText('of 1:30')).toBeTruthy();
	});

	it('moves with a one-second transition, and none for anybody who asked for less motion', () => {
		const { container } = render(ProgressLine, {
			props: { spokenSeconds: 45, totalSeconds: 90, clockState: 'running' }
		});

		expect(fillOf(container).className).toContain('duration-1000');
		expect(fillOf(container).className).toContain('motion-reduce:transition-none');
	});

	it('is grey while the clock waits, warns near the end and is full and red once over', () => {
		const paused = render(ProgressLine, {
			props: { spokenSeconds: 38, totalSeconds: 90, clockState: 'paused' }
		});
		const warning = render(ProgressLine, {
			props: { spokenSeconds: 85, totalSeconds: 90, clockState: 'running' }
		});
		const over = render(ProgressLine, {
			props: { spokenSeconds: 97, totalSeconds: 90, clockState: 'running' }
		});

		expect(fillOf(paused.container).className).toContain('bg-ink-400');
		expect(fillOf(warning.container).className).toContain('bg-warning-500');
		expect(fillOf(over.container).className).toContain('bg-danger-500');
		expect(fillOf(over.container).style.width).toBe('100%');
	});

	it('leaves the legend out when asked, as the live strip does', () => {
		render(ProgressLine, {
			props: { spokenSeconds: 45, totalSeconds: 90, clockState: 'running', isLegendShown: false }
		});

		expect(screen.queryByText('0:45 spoken')).toBeNull();
	});

	it("is as thick as a share of the projector's width on the display (S12)", () => {
		const { container } = render(ProgressLine, {
			props: {
				spokenSeconds: 45,
				totalSeconds: 90,
				clockState: 'running',
				isLegendShown: false,
				size: 'display'
			}
		});

		expect(container.querySelector('[aria-hidden="true"]')?.className).toContain('h-[1vw]');
	});
});
