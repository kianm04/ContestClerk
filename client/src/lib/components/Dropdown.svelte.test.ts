import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import User from '@lucide/svelte/icons/user';
import Dropdown, { type DropdownItem } from './Dropdown.svelte';

const items: DropdownItem[] = [
	{ label: 'Browse conferences', href: '/conferences' },
	{ label: 'Sign out', formaction: '?/signOut', tone: 'danger' }
];

describe('Dropdown', () => {
	it('shows its own name on the button that opens it', () => {
		render(Dropdown, { props: { label: 'Account', items } });

		expect(screen.getByText('Account')).toBeTruthy();
	});

	it('keeps the name for a screen reader when it shows only an icon', () => {
		const { container } = render(Dropdown, { props: { label: 'Account', icon: User, items } });

		expect(screen.getByText('Account').className).toContain('sr-only');
		expect(container.querySelector('svg')).toBeTruthy();
	});

	it('draws a bare icon with no border when it is quiet', () => {
		const { container } = render(Dropdown, {
			props: { label: 'Seat actions', icon: User, items, isQuiet: true }
		});
		const summary = container.querySelector('summary');

		expect(summary?.className).not.toContain('border');
		expect(screen.getByText('Seat actions').className).toContain('sr-only');
	});

	it('opens and closes without JavaScript, because it is a native details', () => {
		const { container } = render(Dropdown, { props: { label: 'Account', items } });

		expect(container.querySelector('details')).toBeTruthy();
		expect(container.querySelector('summary')).toBeTruthy();
	});

	it('makes a line with an address a link', () => {
		render(Dropdown, { props: { label: 'Account', items } });

		expect(screen.getByRole('link', { name: 'Browse conferences' }).getAttribute('href')).toBe(
			'/conferences'
		);
	});

	it('makes a line with a form action a button that posts', () => {
		render(Dropdown, { props: { label: 'Account', items } });

		expect(screen.getByRole('button', { name: 'Sign out' }).getAttribute('formaction')).toBe(
			'?/signOut'
		);
	});

	it('colours a destructive line red', () => {
		render(Dropdown, { props: { label: 'Account', items } });

		expect(screen.getByRole('button', { name: 'Sign out' }).className).toContain(
			'text-destructive'
		);
	});

	it('opens from a person’s picture when it is given one', () => {
		render(Dropdown, { props: { label: 'Daniel', avatar: { name: 'Daniel Perez' }, items } });

		// No picture was given, so the avatar draws the initials instead.
		expect(screen.getByLabelText('Daniel Perez')).toBeTruthy();
	});

	it('keeps the words beside that picture for a screen reader on a phone', () => {
		render(Dropdown, { props: { label: 'Daniel', avatar: { name: 'Daniel Perez' }, items } });

		expect(screen.getByText('Daniel').className).toContain('max-md:sr-only');
	});

	/** Renders the menu already open, the way it is after a click on its button. */
	function renderOpen(): HTMLDetailsElement {
		const { container } = render(Dropdown, { props: { label: 'Account', items } });
		const details = container.querySelector('details');

		if (!details) {
			throw new Error('The menu did not render a <details>');
		}

		details.open = true;
		return details;
	}

	it('closes when the page is clicked outside it', async () => {
		const details = renderOpen();

		await fireEvent.click(document.body);

		expect(details.open).toBe(false);
	});

	it('stays open when something inside it is clicked', async () => {
		const details = renderOpen();

		// The list itself, because jsdom cannot follow a real link.
		await fireEvent.click(screen.getByRole('list'));

		expect(details.open).toBe(true);
	});

	it('closes on Escape', async () => {
		const details = renderOpen();

		await fireEvent.keyDown(document, { key: 'Escape' });

		expect(details.open).toBe(false);
	});

	it('ignores other keys', async () => {
		const details = renderOpen();

		await fireEvent.keyDown(document, { key: 'Enter' });

		expect(details.open).toBe(true);
	});
});
