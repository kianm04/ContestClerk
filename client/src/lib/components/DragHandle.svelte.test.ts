import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import type { SortableList } from '$lib/sortable-list.svelte';
import DragHandle from './DragHandle.svelte';

/** A stand-in for `createSortableList()` that records what the handle passes on. */
function fakeSortable(draggedId: string | null = null): SortableList {
	return {
		draggedId,
		isDragging: draggedId !== null,
		announcement: '',
		offsetOf: () => 0,
		rowClassesOf: () => '',
		handlePointerDown: vi.fn(),
		handlePointerMove: vi.fn(),
		handlePointerUp: vi.fn(),
		handlePointerCancel: vi.fn(),
		handleKeydown: vi.fn(),
		handleBlur: vi.fn()
	};
}

const FRANCE = { id: 'entry-1', index: 0, name: 'France' };

describe('DragHandle', () => {
	it('is a button named after its row, pointing at the hint about the keys', () => {
		render(DragHandle, { props: { sortable: fakeSortable(), row: FRANCE, hintId: 'hint' } });

		const handle = screen.getByRole('button', { name: 'Reorder France' });

		expect(handle.getAttribute('aria-describedby')).toBe('hint');
		expect(handle.getAttribute('aria-pressed')).toBe('false');
		// It never sends a form by itself, even though it can belong to one.
		expect(handle.getAttribute('type')).toBe('button');
	});

	it('belongs to the form that saves a drop when it is given one', () => {
		render(DragHandle, {
			props: { sortable: fakeSortable(), row: FRANCE, hintId: 'hint', form: 'queue-drag-form' }
		});

		expect(screen.getByRole('button').getAttribute('form')).toBe('queue-drag-form');
	});

	it('passes a key press on to the list, with its row', async () => {
		const sortable = fakeSortable();
		render(DragHandle, { props: { sortable, row: FRANCE, hintId: 'hint' } });

		await fireEvent.keyDown(screen.getByRole('button'), { key: ' ' });

		expect(sortable.handleKeydown).toHaveBeenCalledWith(expect.any(KeyboardEvent), FRANCE);
	});

	it('says it is pressed while its row is picked up', () => {
		render(DragHandle, {
			props: { sortable: fakeSortable('entry-1'), row: FRANCE, hintId: 'hint' }
		});

		expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('true');
	});

	it('ignores presses while an earlier drop is saved, but keeps the focus', async () => {
		const sortable = fakeSortable();
		render(DragHandle, { props: { sortable, row: FRANCE, hintId: 'hint', isDisabled: true } });

		const handle = screen.getByRole('button');
		await fireEvent.keyDown(handle, { key: ' ' });
		await fireEvent.pointerDown(handle, { button: 0 });

		expect(sortable.handleKeydown).not.toHaveBeenCalled();
		expect(sortable.handlePointerDown).not.toHaveBeenCalled();
		expect(handle.getAttribute('aria-disabled')).toBe('true');
		// `disabled` would move the focus away from the reader who just dropped a row.
		expect(handle.hasAttribute('disabled')).toBe(false);
	});
});
