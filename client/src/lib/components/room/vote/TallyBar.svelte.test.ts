import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import TallyBar from './TallyBar.svelte';

/** The bar's two coloured parts, For then Against, by their colours. */
function barParts(container: HTMLElement) {
	return {
		forPart: container.querySelector<HTMLElement>('.bg-success-500'),
		againstPart: container.querySelector<HTMLElement>('.bg-danger-500')
	};
}

describe('TallyBar', () => {
	it('draws For against Against and marks where a simple majority is met', () => {
		const { container } = render(TallyBar, {
			props: { counts: { for: 9, against: 4, abstain: 2 }, majority: 'simple', showsMark: true }
		});

		const mark = screen.getByText('passes at 7 for');
		const markLeft = parseFloat(mark.style.left);
		const { forPart, againstPart } = barParts(container);

		expect(markLeft).toBeCloseTo((7 / 13) * 100, 1);
		expect(parseFloat(forPart?.style.width ?? '')).toBeCloseTo((9 / 13) * 100, 1);
		expect(parseFloat(againstPart?.style.width ?? '')).toBeCloseTo((4 / 13) * 100, 1);
	});

	it('marks two thirds of those voting for a two-thirds majority', () => {
		render(TallyBar, {
			props: { counts: { for: 6, against: 3, abstain: 0 }, majority: 'two_thirds', showsMark: true }
		});

		const mark = screen.getByText('passes at 6 for');

		expect(parseFloat(mark.style.left)).toBeCloseTo((6 / 9) * 100, 1);
	});

	it('sits the mark at the half before anything is counted, with an empty bar', () => {
		const { container } = render(TallyBar, {
			props: { counts: { for: 0, against: 0, abstain: 0 }, majority: 'simple', showsMark: true }
		});

		expect(parseFloat(screen.getByText('passes at 1 for').style.left)).toBe(50);
		expect(barParts(container).forPart?.style.width).toBe('0%');
	});

	it('leaves the mark out on a result', () => {
		render(TallyBar, {
			props: { counts: { for: 9, against: 4, abstain: 2 }, majority: 'simple', showsMark: false }
		});

		expect(screen.queryByText(/passes at/)).toBeNull();
	});

	it("is as thick as a share of the projector's width on the display (S12)", () => {
		const { container } = render(TallyBar, {
			props: {
				counts: { for: 4, against: 1, abstain: 1 },
				majority: 'simple',
				showsMark: false,
				size: 'display'
			}
		});

		expect(container.querySelector('[aria-hidden="true"]')?.className).toContain('h-[1.4vw]');
	});
});
