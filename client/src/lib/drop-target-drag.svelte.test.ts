import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDropTargetDrag, DROP_TARGET_ATTRIBUTE } from './drop-target-drag.svelte';

/** A handle to drag by and one target with the id `seat-peru`, with a label inside it. */
function buildPage(): { handle: HTMLButtonElement; label: HTMLElement } {
	document.body.innerHTML = '';
	const handle = document.createElement('button');
	handle.setPointerCapture = vi.fn();
	const target = document.createElement('li');
	target.setAttribute(DROP_TARGET_ATTRIBUTE, 'seat-peru');
	const label = document.createElement('span');
	target.append(label);
	document.body.append(handle, target);

	return { handle, label };
}

/** A pointer event at `x`, `y`, sent from `handle` the way the drag handle passes it on. */
function pointerAt(handle: HTMLElement, x: number, y: number): PointerEvent {
	// jsdom has no `PointerEvent`, and a `MouseEvent` carries everything the helper reads.
	const event = new MouseEvent('pointerdown', { clientX: x, clientY: y, button: 0 });
	Object.defineProperty(event, 'currentTarget', { value: handle });
	Object.defineProperty(event, 'pointerId', { value: 1 });

	return event as PointerEvent;
}

describe('createDropTargetDrag', () => {
	let elementUnderPointer: Element | null = null;

	beforeEach(() => {
		// jsdom lays nothing out, so the tests say what is under the pointer.
		document.elementFromPoint = vi.fn(() => elementUnderPointer);
		vi.stubGlobal(
			'requestAnimationFrame',
			vi.fn(() => 1)
		);
		vi.stubGlobal('cancelAnimationFrame', vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('drops the source on the target under the pointer', () => {
		const { handle, label } = buildPage();
		const onDrop = vi.fn();
		const drag = createDropTargetDrag<string>({ onDrop });

		drag.handlePointerDown(pointerAt(handle, 0, 0), 'anna');
		elementUnderPointer = label;
		drag.handlePointerMove(pointerAt(handle, 40, 30));

		expect(drag.dragged).toBe('anna');
		expect(drag.hasMoved).toBe(true);
		expect(drag.hoveredTargetId).toBe('seat-peru');
		expect(drag.pointerX).toBe(40);

		drag.handlePointerUp();

		expect(onDrop).toHaveBeenCalledWith('anna', 'seat-peru');
		expect(drag.dragged).toBeNull();
	});

	it('treats a press that barely moved as a click and drops nothing', () => {
		const { handle, label } = buildPage();
		const onDrop = vi.fn();
		const drag = createDropTargetDrag<string>({ onDrop });

		drag.handlePointerDown(pointerAt(handle, 0, 0), 'anna');
		elementUnderPointer = label;
		drag.handlePointerMove(pointerAt(handle, 2, 1));
		drag.handlePointerUp();

		expect(onDrop).not.toHaveBeenCalled();
	});

	it('drops nothing when let go away from every target', () => {
		const { handle } = buildPage();
		const onDrop = vi.fn();
		const drag = createDropTargetDrag<string>({ onDrop });

		drag.handlePointerDown(pointerAt(handle, 0, 0), 'anna');
		elementUnderPointer = document.body;
		drag.handlePointerMove(pointerAt(handle, 60, 60));

		expect(drag.hoveredTargetId).toBeNull();

		drag.handlePointerUp();

		expect(onDrop).not.toHaveBeenCalled();
	});

	it('forgets the drag when the browser cancels the pointer', () => {
		const { handle, label } = buildPage();
		const onDrop = vi.fn();
		const drag = createDropTargetDrag<string>({ onDrop });

		drag.handlePointerDown(pointerAt(handle, 0, 0), 'anna');
		elementUnderPointer = label;
		drag.handlePointerMove(pointerAt(handle, 40, 30));
		drag.handlePointerCancel();
		drag.handlePointerUp();

		expect(drag.dragged).toBeNull();
		expect(onDrop).not.toHaveBeenCalled();
	});
});
