import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import TextArea from './TextArea.svelte';

describe('TextArea', () => {
	it('labels the box and shows what the server sent', () => {
		render(TextArea, {
			props: { label: 'Description', name: 'description', value: 'Two topics.' }
		});

		expect(screen.getByLabelText('Description')).toHaveProperty('value', 'Two topics.');
	});

	it('is four lines tall unless the page asks for more', () => {
		render(TextArea, { props: { label: 'Description', name: 'description', value: '', rows: 8 } });

		expect(screen.getByLabelText('Description').getAttribute('rows')).toBe('8');
	});

	it('shows no character count when there is no limit', () => {
		render(TextArea, { props: { label: 'Description', name: 'description', value: 'abc' } });

		expect(screen.queryByText(/\d+ \/ \d+/)).toBeNull();
	});

	it('counts the characters against the limit', () => {
		render(TextArea, {
			props: { label: 'Description', name: 'description', value: 'abc', maxLength: 500 }
		});

		expect(screen.getByText('3 / 500')).toBeTruthy();
	});

	it('follows the count while somebody is typing', async () => {
		render(TextArea, {
			props: { label: 'Description', name: 'description', value: '', maxLength: 500 }
		});

		await fireEvent.input(screen.getByLabelText('Description'), { target: { value: 'hello' } });

		expect(screen.getByText('5 / 500')).toBeTruthy();
	});

	it('points a screen reader at the error under the box', () => {
		render(TextArea, {
			props: { label: 'Description', name: 'description', value: '', error: 'Too long.' }
		});

		expect(screen.getByLabelText('Description').getAttribute('aria-describedby')).toBe(
			'field-description-error'
		);
	});

	it('shows new text the page sends, over anything already typed', async () => {
		// The other half of the bargain `TextField` explains: the box is bound
		// rather than written to, and it still has to follow the page.
		const { rerender } = render(TextArea, {
			props: { label: 'Description', name: 'description', value: 'Three days.' }
		});

		const box = screen.getByLabelText('Description');
		await fireEvent.input(box, { target: { value: 'Four days.' } });

		await rerender({ label: 'Description', name: 'description', value: '' });

		expect(box).toHaveProperty('value', '');
	});

	it('builds its ids from `idKey`, so a box drawn once per row gets ids of its own', () => {
		render(TextArea, {
			props: {
				label: 'Comment',
				name: 'comment',
				value: '',
				idKey: 'comment-paper-1',
				error: 'Tell the delegate what to change.'
			}
		});

		const box = screen.getByLabelText('Comment');

		expect(box.id).toBe('field-comment-paper-1');
		expect(box.getAttribute('aria-describedby')).toBe('field-comment-paper-1-error');
		expect(box.getAttribute('name')).toBe('comment');
	});

	it('takes the focus when the page asks for it', () => {
		render(TextArea, {
			props: { label: 'New note', name: 'body', value: '', hasAutofocus: true }
		});

		expect(document.activeElement).toBe(screen.getByLabelText('New note'));
	});

	it('keeps what was typed when the page sends the same value again', async () => {
		// Fresh page data builds a new object with the same text in it; see TextField's test.
		let values = $state({ description: 'Two topics.' });
		render(TextArea, {
			props: {
				label: 'Description',
				name: 'description',
				get value() {
					return values.description;
				}
			}
		});

		const box = screen.getByLabelText('Description');
		await fireEvent.input(box, { target: { value: 'Three topics.' } });

		values = { description: 'Two topics.' };
		flushSync();

		expect(box).toHaveProperty('value', 'Three topics.');
	});
});
