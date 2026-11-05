/**
 * @vitest-environment jsdom
 */
// The comment above runs this file in jsdom, a fake browser, because the
// menus are real `<details>` elements and `document` decides where the focus is.
import { beforeEach, describe, expect, it } from 'vitest';
import { MENU_PANEL_CLASSES, createConsoleMenu } from './console-menu';

/** A `<details>` menu with a summary and one item, on the page. */
function makeMenu(): { details: HTMLDetailsElement; summary: HTMLElement; item: HTMLElement } {
	const details = document.createElement('details');
	const summary = document.createElement('summary');
	const item = document.createElement('button');
	summary.textContent = 'Yield';
	item.textContent = 'To the chair';
	details.append(summary, item);
	document.body.append(details);

	return { details, summary, item };
}

/** Open the menu the way the browser does, telling the console menu through `toggle`. */
function open(details: HTMLDetailsElement, menu: ReturnType<typeof createConsoleMenu>) {
	details.open = true;
	details.addEventListener('toggle', menu.handleToggle, { once: true });
	details.dispatchEvent(new Event('toggle'));
}

beforeEach(() => {
	document.body.innerHTML = '';
});

describe('createConsoleMenu', () => {
	it('closes the open menu when the chair clicks elsewhere, but not inside it', () => {
		const menu = createConsoleMenu();
		const { details, item } = makeMenu();
		open(details, menu);

		const clickInside = new MouseEvent('click');
		Object.defineProperty(clickInside, 'target', { value: item });
		menu.handleDocumentClick(clickInside);
		expect(details.open).toBe(true);

		const clickOutside = new MouseEvent('click');
		Object.defineProperty(clickOutside, 'target', { value: document.body });
		menu.handleDocumentClick(clickOutside);
		expect(details.open).toBe(false);
	});

	it('closes on Escape and puts the focus back on the menu’s button', () => {
		const menu = createConsoleMenu();
		const { details, summary, item } = makeMenu();
		open(details, menu);
		item.focus();

		menu.handleDocumentKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));

		expect(details.open).toBe(false);
		expect(document.activeElement).toBe(summary);
	});

	it('leaves the menu open for any other key', () => {
		const menu = createConsoleMenu();
		const { details } = makeMenu();
		open(details, menu);

		menu.handleDocumentKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));

		expect(details.open).toBe(true);
	});

	it('closes when one of its items is pressed', () => {
		const menu = createConsoleMenu();
		const { details } = makeMenu();
		open(details, menu);

		menu.close();

		expect(details.open).toBe(false);
	});

	it('does nothing while no menu is open', () => {
		const menu = createConsoleMenu();

		expect(() => menu.close()).not.toThrow();
		expect(() =>
			menu.handleDocumentKeydown(new KeyboardEvent('keydown', { key: 'Escape' }))
		).not.toThrow();
	});
});

describe('MENU_PANEL_CLASSES', () => {
	it('floats the panel over the page and keeps each item on one line', () => {
		expect(MENU_PANEL_CLASSES).toContain('absolute');
		expect(MENU_PANEL_CLASSES).toContain('whitespace-nowrap');
	});
});
