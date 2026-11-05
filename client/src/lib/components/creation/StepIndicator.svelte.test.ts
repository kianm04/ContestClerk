import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { creationSteps } from '$lib/creation-steps';
import StepIndicator from './StepIndicator.svelte';

describe('StepIndicator', () => {
	it('marks the current step and links the ones behind it', () => {
		render(StepIndicator, { props: { steps: creationSteps('delft-mun-2027', 'when') } });

		const current = screen.getByText('When & where').closest('[aria-current]');
		expect(current?.getAttribute('aria-current')).toBe('step');

		const basics = screen.getByText('Basics').closest('a');
		expect(basics?.getAttribute('href')).toBe('/create/delft-mun-2027/basics');

		// A step still ahead is not a link yet.
		expect(screen.getByText('Setup').closest('a')).toBeNull();
	});

	it('links nothing before the draft exists', () => {
		const { container } = render(StepIndicator, {
			props: { steps: creationSteps(null, 'organization') }
		});

		expect(container.querySelectorAll('a')).toHaveLength(0);
		expect(screen.getByText('1').closest('[aria-current]')).not.toBeNull();
	});
});
