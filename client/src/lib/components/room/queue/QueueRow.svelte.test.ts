import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { GslEntry } from '$lib/gsl-floor';
import { createSortableList } from '$lib/sortable-list.svelte';
import QueueRow from './QueueRow.svelte';

const BRAZIL: GslEntry = {
	id: 'entry-br',
	position: 2,
	status: 'waiting',
	spokeSeconds: null,
	seat: { id: 'seat-br', name: 'Brazil', countryCode: 'BR', delegateName: 'Gabriel Santos' }
};

/** One row, second of three by default, on the floor's list. */
function renderRow(overrides: Record<string, unknown> = {}) {
	return render(QueueRow, {
		props: {
			entry: BRAZIL,
			index: 1,
			isFirst: false,
			isLast: false,
			isAbsent: false,
			canSpeakNow: true,
			sortable: createSortableList({ onDrop: vi.fn() }),
			onSubmit: vi.fn(),
			...overrides
		}
	});
}

/** The row menu's item called `name`. */
function item(name: string): HTMLElement {
	return screen.getByRole('button', { name });
}

describe('QueueRow', () => {
	it('shows the place, the flag, the country and the delegate, with a handle to drag', () => {
		renderRow();

		expect(screen.getByText('2')).toBeTruthy();
		expect(screen.getByText('Brazil')).toBeTruthy();
		expect(screen.getByText('Gabriel Santos')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Reorder Brazil' })).toBeTruthy();
	});

	it('offers Speak now, the three moves and Remove in its "⋯", each posting the entry', () => {
		const { container } = renderRow();

		expect(container.querySelector('summary')?.textContent?.trim()).toBe('Options for Brazil');
		expect(item('Speak now').getAttribute('formaction')).toBe('?/speakNow');
		expect(item('Move up').getAttribute('formaction')).toBe('?/moveUp');
		expect(item('Move down').getAttribute('formaction')).toBe('?/moveDown');
		expect(item('Move to top').getAttribute('formaction')).toBe('?/moveToTop');
		expect(item('Remove').getAttribute('formaction')).toBe('?/remove');
		expect(container.querySelector<HTMLInputElement>('input[name="entryId"]')?.value).toBe(
			'entry-br'
		);
	});

	it('greys out the moves a row cannot make: up and to the top on the first, down on the last', () => {
		const first = renderRow({ index: 0, isFirst: true });

		expect(first.getByRole('button', { name: 'Move up' }).hasAttribute('disabled')).toBe(true);
		expect(first.getByRole('button', { name: 'Move to top' }).hasAttribute('disabled')).toBe(true);
		expect(first.getByRole('button', { name: 'Move down' }).hasAttribute('disabled')).toBe(false);
		first.unmount();

		renderRow({ index: 2, isLast: true });

		expect(item('Move down').hasAttribute('disabled')).toBe(true);
		expect(item('Move up').hasAttribute('disabled')).toBe(false);
		expect(item('Move to top').hasAttribute('disabled')).toBe(false);
	});

	it('keeps an absent seat in its place, says "absent" where the delegate was, and leaves out Speak now', () => {
		renderRow({ isAbsent: true });

		expect(screen.getByText('absent')).toBeTruthy();
		expect(screen.queryByText('Gabriel Santos')).toBeNull();
		expect(screen.queryByRole('button', { name: 'Speak now' })).toBeNull();
		expect(item('Remove')).toBeTruthy();
	});

	it('leaves out Speak now while the list is not the one on the floor', () => {
		renderRow({ canSpeakNow: false });

		expect(screen.queryByRole('button', { name: 'Speak now' })).toBeNull();
		expect(item('Move up')).toBeTruthy();
	});

	it("draws a row to read only, with no handle and no menu, and marks the reader's own (S13)", () => {
		const { container } = render(QueueRow, {
			props: { entry: BRAZIL, index: 1, isAbsent: false, isReader: true }
		});

		expect(screen.getByText('Brazil')).toBeTruthy();
		expect(screen.getByText('You')).toBeTruthy();
		expect(screen.queryAllByRole('button')).toHaveLength(0);
		expect(container.querySelector('summary')).toBeNull();
	});
});
