/**
 * Unit tests in `src/lib` normally run in plain Node, which has no DOM at all.
 * These two functions read a real `<details>` element and ask whether a click
 * landed inside it, so this one file asks Vitest for jsdom — the same fake
 * browser the component tests use — with the comment below. Vitest reads it
 * only when it is at the very top of the file.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import { closeDetailsOnEscape, closeDetailsOnOutsideClick } from './details-menu';

/**
 * An open menu on the page: a `<details>` holding one `<p>`, so that a test has
 * something inside it to click as well as the element itself.
 */
function makeOpenMenu(): { details: HTMLDetailsElement; inside: HTMLParagraphElement } {
	const details = document.createElement('details');
	const inside = document.createElement('p');

	details.open = true;
	details.appendChild(inside);
	document.body.appendChild(details);

	return { details, inside };
}

/** A click whose `target` is the given element, the way the document reports one. */
function clickOn(target: Node): MouseEvent {
	const event = new MouseEvent('click');

	// `target` is read-only on a real event, so it is defined here instead. The
	// document sets it itself when the event is actually dispatched.
	Object.defineProperty(event, 'target', { value: target });

	return event;
}

describe('closeDetailsOnOutsideClick', () => {
	it('closes an open menu when the click landed outside it', () => {
		const { details } = makeOpenMenu();

		closeDetailsOnOutsideClick(details, clickOn(document.body));

		expect(details.open).toBe(false);
	});

	it('leaves the menu open when the click landed inside it', () => {
		const { details, inside } = makeOpenMenu();

		closeDetailsOnOutsideClick(details, clickOn(inside));

		expect(details.open).toBe(true);
	});

	it('leaves the menu open when the click landed on the menu itself', () => {
		const { details } = makeOpenMenu();

		closeDetailsOnOutsideClick(details, clickOn(details));

		expect(details.open).toBe(true);
	});

	it('does nothing to a menu that is already closed', () => {
		const { details } = makeOpenMenu();
		details.open = false;

		closeDetailsOnOutsideClick(details, clickOn(document.body));

		expect(details.open).toBe(false);
	});

	// `bind:this` is empty until Svelte has put the element on the page, and a
	// click can arrive before that.
	it('does nothing when there is no element yet', () => {
		expect(() => closeDetailsOnOutsideClick(undefined, clickOn(document.body))).not.toThrow();
	});
});

describe('closeDetailsOnEscape', () => {
	it('closes an open menu on Escape', () => {
		const { details } = makeOpenMenu();

		closeDetailsOnEscape(details, new KeyboardEvent('keydown', { key: 'Escape' }));

		expect(details.open).toBe(false);
	});

	it('leaves the menu open on any other key', () => {
		const { details } = makeOpenMenu();

		closeDetailsOnEscape(details, new KeyboardEvent('keydown', { key: 'Enter' }));

		expect(details.open).toBe(true);
	});

	it('does nothing to a menu that is already closed', () => {
		const { details } = makeOpenMenu();
		details.open = false;

		closeDetailsOnEscape(details, new KeyboardEvent('keydown', { key: 'Escape' }));

		expect(details.open).toBe(false);
	});

	it('does nothing when there is no element yet', () => {
		const escape = new KeyboardEvent('keydown', { key: 'Escape' });

		expect(() => closeDetailsOnEscape(undefined, escape)).not.toThrow();
	});
});
