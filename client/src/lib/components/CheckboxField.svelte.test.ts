import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import CheckboxField from './CheckboxField.svelte';

describe('CheckboxField', () => {
	it('labels the box, so clicking the words ticks it', () => {
		render(CheckboxField, {
			props: { label: 'Only open conferences', name: 'openOnly', isChecked: false }
		});

		expect(screen.getByLabelText('Only open conferences')).toHaveProperty('checked', false);
	});

	it('shows as ticked when it is', () => {
		render(CheckboxField, {
			props: { label: 'Only open conferences', name: 'openOnly', isChecked: true }
		});

		expect(screen.getByLabelText('Only open conferences')).toHaveProperty('checked', true);
	});

	it('reads the help line out with the box', () => {
		render(CheckboxField, {
			props: {
				label: 'Only open conferences',
				name: 'openOnly',
				isChecked: false,
				help: 'Hides conferences that have closed applications.'
			}
		});

		expect(screen.getByLabelText('Only open conferences').getAttribute('aria-describedby')).toBe(
			'field-openOnly-help'
		);
		expect(screen.getByText('Hides conferences that have closed applications.')).toBeTruthy();
	});

	it('follows the page when it sends a different answer', async () => {
		// The box is bound rather than written to, so that a tick made before the
		// page came to life is kept (see the comment in the component). It still
		// has to follow the page, which is how "Reset" on `/conferences` unticks
		// this very box.
		const { rerender } = render(CheckboxField, {
			props: { label: 'Only open conferences', name: 'openOnly', isChecked: false }
		});

		const box = screen.getByLabelText('Only open conferences');
		await fireEvent.click(box);

		await rerender({ label: 'Only open conferences', name: 'openOnly', isChecked: false });

		expect(box).toHaveProperty('checked', false);
	});

	it('names a message drawn outside it, so a screen reader reads the two together', () => {
		// A tick box has no `error` of its own: the three places that need one put a
		// single `FieldError` under a whole group and hand the id in. Without this
		// the message is drawn and never announced.
		render(CheckboxField, {
			props: {
				label: 'The organisers may see my profile details',
				name: 'consent',
				isChecked: false,
				describedById: 'field-consent-error'
			}
		});

		expect(
			screen
				.getByLabelText('The organisers may see my profile details')
				.getAttribute('aria-describedby')
		).toBe('field-consent-error');
	});

	it('names its help line and an outside message together when it has both', () => {
		render(CheckboxField, {
			props: {
				label: 'I have read the rules of procedure',
				name: 'question_1',
				isChecked: false,
				help: 'The chairs will assume you have.',
				describedById: 'field-question_1-error'
			}
		});

		expect(
			screen.getByLabelText('I have read the rules of procedure').getAttribute('aria-describedby')
		).toBe('field-question_1-help field-question_1-error');
	});
});
