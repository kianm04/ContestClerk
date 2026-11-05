import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import TextField from './TextField.svelte';

describe('TextField', () => {
	it('labels the input, so clicking the label focuses it', () => {
		render(TextField, { props: { label: 'City', name: 'city', value: 'The Hague' } });

		expect(screen.getByLabelText('City')).toHaveProperty('value', 'The Hague');
	});

	it('sends the value under the name it was given', () => {
		render(TextField, { props: { label: 'City', name: 'city', value: '' } });

		expect(screen.getByLabelText('City').getAttribute('name')).toBe('city');
	});

	it('is a plain text box unless another type is asked for', () => {
		render(TextField, {
			props: { label: 'First day', name: 'startDate', value: '', type: 'date' }
		});

		expect(screen.getByLabelText('First day').getAttribute('type')).toBe('date');
	});

	it('points a screen reader at the error under the field', () => {
		render(TextField, {
			props: { label: 'City', name: 'city', value: '', error: 'Tell us the city.' }
		});

		const input = screen.getByLabelText('City');
		expect(input.getAttribute('aria-invalid')).toBe('true');
		expect(input.getAttribute('aria-describedby')).toBe('field-city-error');
		expect(screen.getByText('Tell us the city.')).toBeTruthy();
	});

	it('points a screen reader at the help line and the error together', () => {
		render(TextField, {
			props: {
				label: 'City',
				name: 'city',
				value: '',
				help: 'Where the conference is held.',
				error: 'Tell us the city.'
			}
		});

		expect(screen.getByLabelText('City').getAttribute('aria-describedby')).toBe(
			'field-city-help field-city-error'
		);
	});

	it('describes nothing when the field is happy', () => {
		render(TextField, { props: { label: 'City', name: 'city', value: '' } });

		expect(screen.getByLabelText('City').getAttribute('aria-describedby')).toBeNull();
	});

	it('passes the number limits straight to the browser', () => {
		render(TextField, {
			props: { label: 'Fee', name: 'fee', value: '', type: 'number', min: 0, step: 0.01 }
		});

		const input = screen.getByLabelText('Fee');
		expect(input.getAttribute('min')).toBe('0');
		expect(input.getAttribute('step')).toBe('0.01');
	});

	it('marks a required field required, so the browser asks for it', () => {
		render(TextField, { props: { label: 'City', name: 'city', value: '', isRequired: true } });

		expect(screen.getByLabelText('City')).toHaveProperty('required', true);
	});

	it('builds its ids from idKey instead of name, when a page draws the same field twice', () => {
		// A page that draws the same form more than once (one per committee, say)
		// gives each copy its own `idKey`, such as `title-committee-1`, so every
		// label points at its own box even though `name` stays the plain field
		// name the server reads back.
		render(TextField, {
			props: {
				label: 'Title',
				name: 'title',
				idKey: 'title-committee-1',
				value: '',
				help: 'Only for a custom award.',
				error: 'Give the award a title.'
			}
		});

		const input = screen.getByLabelText('Title');
		expect(input.getAttribute('id')).toBe('field-title-committee-1');
		expect(input.getAttribute('name')).toBe('title');
		expect(input.getAttribute('aria-describedby')).toBe(
			'field-title-committee-1-help field-title-committee-1-error'
		);
	});

	it('shows a new value the page sends, over anything already typed', async () => {
		// The box is bound rather than written to, so that text typed before the
		// page came to life is kept (see the comment in the component). This is
		// the other half of that: when the page itself sends a different value,
		// the box has to follow. `/conferences` empties its filter boxes this way.
		const { rerender } = render(TextField, {
			props: { label: 'City', name: 'city', value: 'Vienna' }
		});

		const input = screen.getByLabelText('City');
		await fireEvent.input(input, { target: { value: 'Rotterdam' } });

		await rerender({ label: 'City', name: 'city', value: '' });

		expect(input).toHaveProperty('value', '');
	});

	it('keeps what was typed when the page sends the same value again', async () => {
		// A page usually passes one field of an object its data builds, such as
		// `value={values.totalMinutes}`, and every fresh copy of the data builds a
		// new object. The value inside is the same, so the typing must stay. The
		// getter below reads the object the way a page's markup does.
		let values = $state({ city: 'Vienna' });
		render(TextField, {
			props: {
				label: 'City',
				name: 'city',
				get value() {
					return values.city;
				}
			}
		});

		const input = screen.getByLabelText('City');
		await fireEvent.input(input, { target: { value: 'Rotterdam' } });

		values = { city: 'Vienna' };
		flushSync();

		expect(input).toHaveProperty('value', 'Rotterdam');
	});
});
