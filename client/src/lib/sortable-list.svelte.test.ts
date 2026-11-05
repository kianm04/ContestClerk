import { describe, expect, it, vi } from 'vitest';
import {
	createSortableList,
	SORTABLE_LIST_ATTRIBUTE,
	SORTABLE_ROW_ATTRIBUTE,
	type SortableDrop
} from './sortable-list.svelte';

/**
 * A list of three rows, each with a handle, laid out the way a page lays one
 * out. jsdom measures every row as 0 pixels tall, which is enough for the
 * keyboard: it only counts the rows.
 */
function buildList(): HTMLButtonElement[] {
	document.body.innerHTML = '';
	const list = document.createElement('ol');
	list.setAttribute(SORTABLE_LIST_ATTRIBUTE, '');

	const handles = ['France', 'Ghana', 'Japan'].map((name) => {
		const row = document.createElement('li');
		row.setAttribute(SORTABLE_ROW_ATTRIBUTE, '');
		const handle = document.createElement('button');
		handle.textContent = name;
		row.append(handle);
		list.append(row);

		return handle;
	});

	document.body.append(list);

	return handles;
}

/** Press `key` on `handle`, the way a `DragHandle` passes it on. */
function press(
	sortable: ReturnType<typeof createSortableList>,
	handle: HTMLButtonElement,
	key: string,
	index: number
): KeyboardEvent {
	const event = new KeyboardEvent('keydown', { key, cancelable: true });
	Object.defineProperty(event, 'currentTarget', { value: handle });
	sortable.handleKeydown(event, { id: `entry-${index}`, index, name: handle.textContent ?? '' });

	return event;
}

describe('createSortableList with the keyboard', () => {
	it('picks a row up with Space, moves it with an arrow and drops it with Space', () => {
		const [france] = buildList();
		const onDrop = vi.fn<(drop: SortableDrop) => void>();
		const sortable = createSortableList({ onDrop });

		const pickUp = press(sortable, france, ' ', 0);

		// Space would otherwise scroll the page.
		expect(pickUp.defaultPrevented).toBe(true);
		expect(sortable.draggedId).toBe('entry-0');
		expect(sortable.announcement).toBe(
			'France picked up, place 1 of 3. Use the arrow keys to move it, Space to drop it and Escape to cancel.'
		);

		press(sortable, france, 'ArrowDown', 0);
		expect(sortable.announcement).toBe('France, place 2 of 3.');

		press(sortable, france, ' ', 0);

		expect(sortable.draggedId).toBeNull();
		expect(sortable.announcement).toBe('France dropped at place 2 of 3.');
		expect(onDrop).toHaveBeenCalledWith({
			id: 'entry-0',
			fromIndex: 0,
			toIndex: 1,
			handle: france
		});
	});

	it('does not save a drop in the place the row started', () => {
		const [, ghana] = buildList();
		const onDrop = vi.fn<(drop: SortableDrop) => void>();
		const sortable = createSortableList({ onDrop });

		press(sortable, ghana, ' ', 1);
		press(sortable, ghana, ' ', 1);

		expect(onDrop).not.toHaveBeenCalled();
		expect(sortable.announcement).toBe('Ghana dropped, still place 2 of 3.');
	});

	it('puts the row back when Escape is pressed', () => {
		const [france] = buildList();
		const onDrop = vi.fn<(drop: SortableDrop) => void>();
		const sortable = createSortableList({ onDrop });

		press(sortable, france, ' ', 0);
		press(sortable, france, 'End', 0);
		press(sortable, france, 'Escape', 0);

		expect(sortable.draggedId).toBeNull();
		expect(onDrop).not.toHaveBeenCalled();
		expect(sortable.announcement).toBe('France put back at place 1.');
	});

	it('calls a keyboard drag off when the handle loses the focus', () => {
		const [france] = buildList();
		const sortable = createSortableList({ onDrop: vi.fn() });

		press(sortable, france, ' ', 0);
		sortable.handleBlur();

		expect(sortable.isDragging).toBe(false);
		expect(sortable.announcement).toBe('France put back at place 1.');
	});

	it('leaves the arrow keys alone while no row is picked up', () => {
		const [france] = buildList();
		const sortable = createSortableList({ onDrop: vi.fn() });

		const arrow = press(sortable, france, 'ArrowDown', 0);

		expect(arrow.defaultPrevented).toBe(false);
		expect(sortable.isDragging).toBe(false);
	});

	it('lifts the dragged row and lets the others slide', () => {
		const [france] = buildList();
		const sortable = createSortableList({ onDrop: vi.fn() });

		expect(sortable.rowClassesOf('entry-0')).toBe('');

		press(sortable, france, ' ', 0);

		expect(sortable.rowClassesOf('entry-0')).toContain('z-10');
		expect(sortable.rowClassesOf('entry-1')).toBe('transition-transform duration-150');
	});
});
