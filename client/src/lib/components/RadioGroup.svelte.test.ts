import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import RadioGroup from './RadioGroup.svelte';

const options = [
	{ value: 'individual', label: 'On my own' },
	{ value: 'delegation', label: 'With my school', description: 'Your school applies for you.' }
];

describe('RadioGroup', () => {
	it('groups the choices under the question', () => {
		render(RadioGroup, {
			props: { legend: 'How are you applying?', name: 'route', value: '', options }
		});

		expect(screen.getByRole('group', { name: 'How are you applying?' })).toBeTruthy();
	});

	it('offers every choice as a radio button of the same name', () => {
		render(RadioGroup, {
			props: { legend: 'How are you applying?', name: 'route', value: '', options }
		});

		const buttons = screen.getAllByRole('radio');
		expect(buttons).toHaveLength(2);
		expect(buttons[0].getAttribute('name')).toBe('route');
	});

	it('marks the choice already made', () => {
		render(RadioGroup, {
			props: { legend: 'How are you applying?', name: 'route', value: 'delegation', options }
		});

		expect(screen.getByLabelText('With my school')).toHaveProperty('checked', true);
	});

	it('shows the quiet line under a choice that has one', () => {
		render(RadioGroup, {
			props: { legend: 'How are you applying?', name: 'route', value: '', options }
		});

		expect(screen.getByText('Your school applies for you.')).toBeTruthy();
	});

	it('greys out a choice that cannot be made yet and says why', () => {
		const withDisabled = [
			options[0],
			{ value: 'delegation', label: 'With my school', disabledReason: 'Not open yet' }
		];

		render(RadioGroup, {
			props: { legend: 'How are you applying?', name: 'route', value: '', options: withDisabled }
		});

		expect(screen.getByLabelText('With my school')).toHaveProperty('disabled', true);
		expect(screen.getByLabelText('On my own')).toHaveProperty('disabled', false);
		expect(screen.getByText('Not open yet')).toBeTruthy();
	});

	it('shows what is wrong with the choice', () => {
		render(RadioGroup, {
			props: {
				legend: 'How are you applying?',
				name: 'route',
				value: '',
				options,
				error: 'Pick one.'
			}
		});

		expect(screen.getByText('Pick one.')).toBeTruthy();
		expect(screen.getByRole('group').getAttribute('aria-describedby')).toBe('field-route-error');
	});

	it('follows the page when it sends a different answer', async () => {
		// The buttons are bound rather than written to, so that a choice made
		// before the page came to life is kept (see the comment in the component).
		// They still have to follow the page when it sends another answer.
		const { rerender } = render(RadioGroup, {
			props: { legend: 'How are you applying?', name: 'route', value: '', options }
		});

		await fireEvent.click(screen.getByLabelText('With my school'));

		await rerender({
			legend: 'How are you applying?',
			name: 'route',
			value: 'individual',
			options
		});

		expect(screen.getByLabelText('On my own')).toHaveProperty('checked', true);
	});

	it('keeps what was chosen when the page sends the same value again', async () => {
		// Fresh page data builds a new object with the same value in it; see TextField's test.
		let values = $state({ route: 'individual' });
		render(RadioGroup, {
			props: {
				legend: 'How are you applying?',
				name: 'route',
				options,
				get value() {
					return values.route;
				}
			}
		});

		await fireEvent.click(screen.getByLabelText('With my school'));

		values = { route: 'individual' };
		flushSync();

		expect(screen.getByLabelText('With my school')).toHaveProperty('checked', true);
	});
});
