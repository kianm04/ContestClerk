import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import Modal from './Modal.svelte';

const children = createRawSnippet(() => ({ render: () => '<p>This cannot be undone.</p>' }));

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

describe('Modal', () => {
	it('shows its title and what is inside it', () => {
		render(Modal, {
			props: { isOpen: true, title: 'Delete this committee?', onClose: () => {}, children }
		});

		expect(screen.getByRole('heading', { name: 'Delete this committee?' })).toBeTruthy();
		expect(screen.getByText('This cannot be undone.')).toBeTruthy();
	});

	it('is closed until the page opens it', () => {
		const { container } = render(Modal, {
			props: { isOpen: false, title: 'Delete this committee?', onClose: () => {}, children }
		});

		expect(container.querySelector('dialog')?.open).toBe(false);
	});

	it('opens the dialog when the page says it is open', () => {
		const { container } = render(Modal, {
			props: { isOpen: true, title: 'Delete this committee?', onClose: () => {}, children }
		});

		expect(container.querySelector('dialog')?.open).toBe(true);
	});

	it('tells the page when the close button is pressed', async () => {
		const onClose = vi.fn();
		render(Modal, {
			props: { isOpen: true, title: 'Delete this committee?', onClose, children }
		});

		screen.getByRole('button', { name: 'Close' }).click();

		expect(onClose).toHaveBeenCalledOnce();
	});
});
