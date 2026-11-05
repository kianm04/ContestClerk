import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import SelectField from './SelectField.svelte';

const options = [
	{ value: 'beginner', label: 'Beginner' },
	{ value: 'advanced', label: 'Advanced' }
];

describe('SelectField', () => {
	it('labels the dropdown and offers every option', () => {
		render(SelectField, { props: { label: 'Level', name: 'level', value: '', options } });

		expect(screen.getByLabelText('Level')).toBeTruthy();
		expect(screen.getByRole('option', { name: 'Beginner' })).toBeTruthy();
		expect(screen.getByRole('option', { name: 'Advanced' })).toBeTruthy();
	});

	it('marks the earlier choice in the HTML, so it shows without JavaScript', () => {
		render(SelectField, { props: { label: 'Level', name: 'level', value: 'advanced', options } });

		expect(screen.getByRole('option', { name: 'Advanced' })).toHaveProperty('selected', true);
	});

	it('offers an empty first option when given a placeholder', () => {
		render(SelectField, {
			props: { label: 'Level', name: 'level', value: '', options, placeholder: 'Pick a level' }
		});

		expect(screen.getByRole('option', { name: 'Pick a level' })).toHaveProperty('value', '');
	});

	it('has no empty option without a placeholder', () => {
		render(SelectField, { props: { label: 'Level', name: 'level', value: '', options } });

		expect(screen.getAllByRole('option')).toHaveLength(2);
	});

	it('points a screen reader at the error under the dropdown', () => {
		render(SelectField, {
			props: { label: 'Level', name: 'level', value: '', options, error: 'Pick one.' }
		});

		expect(screen.getByLabelText('Level').getAttribute('aria-describedby')).toBe(
			'field-level-error'
		);
	});

	it('tells the page when another option is picked', async () => {
		const handleChange = vi.fn();
		render(SelectField, {
			props: { label: 'Level', name: 'level', value: '', options, onchange: handleChange }
		});

		await fireEvent.change(screen.getByLabelText('Level'), { target: { value: 'advanced' } });

		expect(handleChange).toHaveBeenCalledTimes(1);
	});
});
