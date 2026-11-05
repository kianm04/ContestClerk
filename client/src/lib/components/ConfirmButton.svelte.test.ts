import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import Trash2 from '@lucide/svelte/icons/trash-2';
import ConfirmButton from './ConfirmButton.svelte';

/*
	`page` from `$app/state` is the page SvelteKit is showing. Outside a running
	app it holds no address, so this stand-in gives the button one to build its
	confirmation page's address from.
*/
vi.mock('$app/state', () => ({
	page: { url: new URL('http://localhost/manage/thimun-2027/committees/unsc') }
}));

const props = {
	label: 'Delete committee',
	confirmTitle: 'Delete this committee?',
	confirmText: 'Its seats and its chairs go with it.',
	formaction: '?/delete'
};

/*
	jsdom, the fake browser these tests run in, has no `<dialog>` behaviour of
	its own: `showModal()` and `close()` simply do not exist there. These two
	stand-ins set the `open` property the way a real browser would, which is all
	these tests look at. Delete them once jsdom grows a real dialog.
*/
beforeAll(() => {
	HTMLDialogElement.prototype.showModal = function showModal() {
		this.open = true;
	};

	HTMLDialogElement.prototype.close = function close() {
		this.open = false;
		this.dispatchEvent(new Event('close'));
	};
});

describe('ConfirmButton', () => {
	it('posts to the form action it was given', () => {
		const { container } = render(ConfirmButton, { props });

		const form = container.querySelector('form');
		expect(form?.getAttribute('method')).toBe('post');
		expect(form?.getAttribute('action')).toBe('?/delete');
	});

	it('sends its first press to the confirmation page, which asks without JavaScript', () => {
		render(ConfirmButton, { props });

		const firstButton = screen.getAllByRole('button', { name: 'Delete committee' })[0];
		const address = new URL(String(firstButton.getAttribute('formaction')), 'http://localhost');

		expect(address.pathname).toBe('/confirm');
		expect(address.searchParams.get('title')).toBe('Delete this committee?');
		expect(address.searchParams.get('text')).toBe('Its seats and its chairs go with it.');
		expect(address.searchParams.get('label')).toBe('Delete committee');
		expect(address.searchParams.get('variant')).toBe('danger');
		expect(address.searchParams.get('action')).toBe('/manage/thimun-2027/committees/unsc?/delete');
		expect(address.searchParams.get('back')).toBe('/manage/thimun-2027/committees/unsc');
	});

	it('sends confirm=1 only with the answer, never with the first press', async () => {
		const { container } = render(ConfirmButton, { props });

		expect(container.querySelector('input[name="confirm"]')).toBeNull();

		screen.getAllByRole('button', { name: 'Delete committee' })[0].click();
		await Promise.resolve();

		const answer = container.querySelector('dialog button[name="confirm"]');
		expect(answer?.getAttribute('value')).toBe('1');
		expect(answer?.hasAttribute('formaction')).toBe(false);
	});

	it('asks nothing until the button is pressed', () => {
		const { container } = render(ConfirmButton, { props });

		expect(container.querySelector('dialog')?.open).toBe(false);
	});

	it('asks before it acts once the button is pressed', async () => {
		const { container } = render(ConfirmButton, { props });

		screen.getAllByRole('button', { name: 'Delete committee' })[0].click();
		await Promise.resolve();

		expect(container.querySelector('dialog')?.open).toBe(true);
		expect(screen.getByText('Its seats and its chairs go with it.')).toBeTruthy();
	});

	it('offers a way out of the question', async () => {
		render(ConfirmButton, { props });

		screen.getAllByRole('button', { name: 'Delete committee' })[0].click();
		await Promise.resolve();

		expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
	});

	it('carries the fields it was given inside its own form, so the action receives them', () => {
		const children = createRawSnippet(() => ({
			render: () => '<input name="confirmation" value="DELETE" />'
		}));
		const { container } = render(ConfirmButton, { props: { ...props, children } });

		const field = container.querySelector('form input[name="confirmation"]');
		expect(field?.getAttribute('value')).toBe('DELETE');
	});

	it('can put its fields inside the dialog, where they are still part of the form', () => {
		const children = createRawSnippet(() => ({
			render: () => '<input name="note" value="Bank transfer" />'
		}));
		const { container } = render(ConfirmButton, {
			props: { ...props, children, areFieldsInDialog: true }
		});

		const field = container.querySelector('form dialog input[name="note"]');
		expect(field?.getAttribute('value')).toBe('Bank transfer');
		expect(container.querySelectorAll('input[name="note"]')).toHaveLength(1);
	});

	it('can draw its button small, for a row of a table', () => {
		const smallButton = render(ConfirmButton, { props: { ...props, size: 'sm' } });
		const small = smallButton.getAllByRole('button', { name: 'Delete committee' })[0].className;
		smallButton.unmount();

		const usual = render(ConfirmButton, { props }).getAllByRole('button', {
			name: 'Delete committee'
		})[0].className;

		expect(small).not.toBe(usual);
	});

	it('can be a quiet red button whose answer is still the loud red one', async () => {
		const { container } = render(ConfirmButton, { props: { ...props, variant: 'soft-danger' } });

		const firstButton = screen.getAllByRole('button', { name: 'Delete committee' })[0];
		expect(firstButton.className).toContain('bg-destructive-muted');

		// The confirmation page, used without JavaScript, answers with the loud one too.
		const address = new URL(String(firstButton.getAttribute('formaction')), 'http://localhost');
		expect(address.searchParams.get('variant')).toBe('danger');

		firstButton.click();
		await Promise.resolve();

		const answer = container.querySelector('dialog button[name="confirm"]');
		expect(answer?.className).toContain('bg-destructive');
		expect(answer?.className).not.toContain('bg-destructive-muted');
	});

	it('can be a grey icon on a list row whose answer is still the loud red one', async () => {
		const { container } = render(ConfirmButton, {
			props: { ...props, variant: 'quiet-danger', size: 'dense-sm', icon: Trash2 }
		});

		// The words are the icon's name, so a screen reader still hears what it destroys.
		const firstButton = screen.getAllByRole('button', { name: 'Delete committee' })[0];
		expect(firstButton.className).toContain('text-muted-foreground');
		expect(firstButton.className).toContain('hover:text-destructive');

		const address = new URL(String(firstButton.getAttribute('formaction')), 'http://localhost');
		expect(address.searchParams.get('variant')).toBe('danger');

		firstButton.click();
		await Promise.resolve();

		const answer = container.querySelector('dialog button[name="confirm"]');
		expect(answer?.className).toContain('bg-destructive');
	});
});
