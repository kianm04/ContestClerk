import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { goto } from '$app/navigation';
import AccountMenu from './AccountMenu.svelte';

// `goto` only works inside a running app. The stand-in records where a chosen
// line was meant to go.
vi.mock('$app/navigation', () => ({ goto: vi.fn(async () => undefined) }));

const PERSON = { fullName: 'Daniel Perez', avatarPath: null };

/** Draw the menu and press its button, which opens the list over the page. */
async function openMenu(): Promise<void> {
	render(AccountMenu, { props: { person: PERSON } });
	await fireEvent.click(screen.getByRole('button', { name: 'Daniel Perez' }));
	await screen.findByRole('menu');
}

describe('AccountMenu', () => {
	it('opens from a button named after the person, showing their first name and initials', () => {
		render(AccountMenu, { props: { person: PERSON } });

		const button = screen.getByRole('button', { name: 'Daniel Perez' });

		expect(button.textContent).toContain('Daniel');
		expect(button.textContent).toContain('DP');
	});

	it('draws none of its lines until it is opened', () => {
		render(AccountMenu, { props: { person: PERSON } });

		expect(screen.queryByText('Log out')).toBeNull();
	});

	it('lists the same four lines for everybody, in order, ending in "Log out"', async () => {
		await openMenu();

		const labels = screen.getAllByRole('menuitem').map((item) => item.textContent?.trim());

		expect(labels).toEqual(['Profile', 'Settings', 'Create a conference', 'Log out']);
	});

	it('goes to the page of the line chosen', async () => {
		await openMenu();

		await fireEvent.click(screen.getByRole('menuitem', { name: 'Log out' }));

		expect(goto).toHaveBeenCalledWith('/logout');
	});
});
