import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import CountStepper from './CountStepper.svelte';

/** A "For" stepper holding `value`, with `onChange` to watch. */
function renderStepper(value: number | null, size: 'md' | 'lg' = 'md') {
	const onChange = vi.fn();

	render(CountStepper, { props: { name: 'votesFor', label: 'For', value, size, onChange } });

	const field = screen.getByLabelText<HTMLInputElement>('For');

	return { field, onChange };
}

describe('CountStepper', () => {
	it('is a real number field the form sends, named by its label', () => {
		const { field } = renderStepper(4);

		expect(field.name).toBe('votesFor');
		expect(field.getAttribute('inputmode')).toBe('numeric');
		expect(field.value).toBe('4');
	});

	it('shows an uncounted field empty, with a dash', () => {
		const { field } = renderStepper(null);

		expect(field.value).toBe('');
		expect(field.placeholder).toBe('–');
	});

	it('steps the count with − and +, which never send the form', async () => {
		const { onChange } = renderStepper(4);
		const fewer = screen.getByRole('button', { name: 'One fewer for' });
		const more = screen.getByRole('button', { name: 'One more for' });

		expect(fewer.getAttribute('type')).toBe('button');

		await fireEvent.click(more);
		await fireEvent.click(fewer);

		expect(onChange.mock.calls).toEqual([[5], [3]]);
	});

	it('hands on a typed count, and an empty or unreadable one as not counted', async () => {
		const { field, onChange } = renderStepper(null);

		await fireEvent.input(field, { target: { value: '9' } });
		await fireEvent.input(field, { target: { value: '' } });
		await fireEvent.input(field, { target: { value: 'nine' } });

		expect(onChange.mock.calls).toEqual([[9], [null], [null]]);
	});

	it('draws the large size for a show of hands', () => {
		const { field } = renderStepper(0, 'lg');

		expect(field.className).toContain('text-h1');
	});
});
