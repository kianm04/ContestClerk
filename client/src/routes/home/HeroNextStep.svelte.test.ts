import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { HeroNextStep as Step } from '$lib/home-hero';
import HeroNextStep from './HeroNextStep.svelte';

/** Sofia's overdue invoice, section 2b of `docs/home.md`. */
const INVOICE_STEP: Step = {
	taskId: 'invoice:invoice-1',
	title: 'Pay invoice rotterdammun-2026-0001',
	detail: 'Rotterdam Spring MUN 2026 · €65.00 · was due 2 Apr 2026',
	due: { text: 'Overdue', tone: 'danger', hasDot: true }
};

/** The dots a `StatusDot` draws before its words. */
function dots(container: HTMLElement): NodeListOf<Element> {
	return container.querySelectorAll('span[aria-hidden="true"]');
}

describe('HeroNextStep', () => {
	it('writes the heading, the task, its due word with a red dot and its detail', () => {
		const { container } = render(HeroNextStep, { props: { step: INVOICE_STEP } });

		expect(screen.getByText('Next step')).toBeTruthy();
		expect(screen.getByText('Pay invoice rotterdammun-2026-0001')).toBeTruthy();
		expect(screen.getByText('Overdue')).toBeTruthy();
		expect(screen.getByText(INVOICE_STEP.detail!)).toBeTruthy();
		expect(dots(container)).toHaveLength(1);
		expect(dots(container)[0].className).toContain('bg-destructive');
	});

	it('writes a grey due word plain, without a dot that would only repeat it', () => {
		const { container } = render(HeroNextStep, {
			props: {
				step: { ...INVOICE_STEP, due: { text: 'By 25 Jul 2027', tone: 'neutral', hasDot: false } }
			}
		});

		expect(screen.getByText('By 25 Jul 2027')).toBeTruthy();
		expect(dots(container)).toHaveLength(0);
	});

	it('leaves out the due word and the detail when the task has neither', () => {
		const { container } = render(HeroNextStep, {
			props: {
				step: {
					...INVOICE_STEP,
					title: 'Review 3 position papers (DISEC)',
					detail: null,
					due: null
				}
			}
		});

		expect(screen.getByText('Review 3 position papers (DISEC)')).toBeTruthy();
		expect(dots(container)).toHaveLength(0);
		expect(container.querySelectorAll('p')).toHaveLength(2);
	});

	it('is not a link: the button under it does the task', () => {
		render(HeroNextStep, { props: { step: INVOICE_STEP } });

		expect(screen.queryByRole('link')).toBeNull();
		expect(screen.queryByRole('button')).toBeNull();
	});
});
