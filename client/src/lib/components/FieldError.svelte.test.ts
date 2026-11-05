import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import FieldError from './FieldError.svelte';

describe('FieldError', () => {
	it('says nothing when there is no message', () => {
		const { container } = render(FieldError, { props: { id: 'field-city-error' } });

		expect(container.querySelector('p')).toBeNull();
	});

	it('shows the message under the field', () => {
		render(FieldError, { props: { id: 'field-city-error', message: 'Tell us the city.' } });

		expect(screen.getByText('Tell us the city.')).toBeTruthy();
	});

	it('carries the id the field points at', () => {
		render(FieldError, { props: { id: 'field-city-error', message: 'Tell us the city.' } });

		expect(screen.getByText('Tell us the city.').id).toBe('field-city-error');
	});
});
