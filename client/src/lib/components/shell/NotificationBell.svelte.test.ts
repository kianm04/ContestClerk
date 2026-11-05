import { describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterNavigate } from '$app/navigation';
import NotificationBell from './NotificationBell.svelte';
import type { Notification } from '$lib/notifications';

// SvelteKit's navigation only works inside a running app. The stand-in for
// `afterNavigate` keeps the function the bell hands it, so a test can call it
// the way SvelteKit would after a navigation.
vi.mock('$app/navigation', () => ({
	afterNavigate: vi.fn(),
	goto: vi.fn(async () => undefined),
	invalidateAll: vi.fn(async () => undefined),
	preloadData: vi.fn(async () => undefined)
}));

/** The function the bell last asked SvelteKit to call after every navigation. */
function afterNavigateCallback(): () => void {
	const calls = vi.mocked(afterNavigate).mock.calls;
	const lastCall = calls[calls.length - 1];

	return lastCall[0] as () => void;
}

/** The moment every test pretends the page was built at. */
const NOW = new Date('2026-02-12T12:00:00Z');

/** A notification with everything filled in, so each test changes one thing. */
function makeNotification(overrides: Partial<Notification> = {}): Notification {
	return {
		id: 'a0000000-0000-4000-8000-000000000001',
		kind: 'invoice_created',
		title: 'Invoice RIVERSIDE-2027-0031: €65.00 for Riverside MUN 2027',
		body: null,
		linkPath: '/invoices/1',
		readAt: null,
		createdAt: '2026-02-12T10:00:00Z',
		conferenceName: 'Riverside MUN 2027',
		...overrides
	};
}

/** The bell's props, so each test changes only what it is about. */
function bellProps(notifications: Notification[], unreadCount: number) {
	return { notifications, unreadCount, now: NOW };
}

/**
 * Draw the bell and press it. The panel is only drawn once it is open, and
 * then over the page rather than inside the bell, which `screen` still finds
 * because it looks through the whole document.
 */
async function openBell(notifications: Notification[], unreadCount: number): Promise<void> {
	render(NotificationBell, { props: bellProps(notifications, unreadCount) });
	await fireEvent.click(screen.getByRole('button', { name: /^Notifications/ }));
	await screen.findByRole('heading', { name: 'Notifications' });
}

const READ = { readAt: '2026-02-12T11:00:00Z' };

describe('NotificationBell, shut', () => {
	it('says how many are unread in the bell name, and marks the bell with a dot', () => {
		const { container } = render(NotificationBell, {
			props: bellProps([makeNotification()], 3)
		});

		expect(screen.getByRole('button', { name: 'Notifications, 3 unread' })).toBeTruthy();
		expect(container.querySelector('.bg-ring')).toBeTruthy();
	});

	it('draws no number on the bell, so a light blue shape never carries words', () => {
		render(NotificationBell, { props: bellProps([makeNotification()], 250) });

		const bell = screen.getByRole('button', { name: 'Notifications, 250 unread' });

		expect(bell.textContent?.trim()).toBe('');
	});

	it('has no dot when everything has been read', () => {
		const { container } = render(NotificationBell, {
			props: bellProps([makeNotification(READ)], 0)
		});

		expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy();
		expect(container.querySelector('.bg-ring')).toBeNull();
	});

	it('draws no panel until the bell is pressed', () => {
		render(NotificationBell, { props: bellProps([makeNotification()], 1) });

		expect(screen.queryByRole('link', { name: 'See all' })).toBeNull();
	});
});

describe('NotificationBell, open', () => {
	it('heads the panel with its title, and says under it when nothing is new', async () => {
		await openBell([makeNotification(READ)], 0);

		const header = screen.getByRole('heading', { name: 'Notifications' }).parentElement;

		expect(header?.classList.contains('border-b')).toBe(true);
		expect(header?.textContent).toContain('No new notifications.');
	});

	it('still lists what has been read when nothing is unread', async () => {
		await openBell([makeNotification(READ)], 0);

		expect(screen.getByText(/Invoice RIVERSIDE-2027-0031/)).toBeTruthy();
	});

	it('says so when there is nothing at all', async () => {
		await openBell([], 0);

		expect(screen.getByText('No notifications yet.')).toBeTruthy();
	});

	it('always offers a way through to the whole list', async () => {
		await openBell([], 0);

		expect(screen.getByRole('link', { name: 'See all' }).getAttribute('href')).toBe(
			'/notifications'
		);
	});

	it('lets only the list scroll, so the header and "See all" stay in view', async () => {
		await openBell([makeNotification()], 1);

		const list = screen.getByRole('list');

		expect(list.classList.contains('overflow-y-auto')).toBe(true);
		expect(list.className).toContain('max-h-');
		expect(list.classList.contains('divide-y')).toBe(true);
	});

	it('puts "See all" in a footer below the list', async () => {
		await openBell([makeNotification()], 1);

		const list = screen.getByRole('list');
		const seeAll = screen.getByRole('link', { name: 'See all' });

		expect(list.nextElementSibling).toBe(seeAll);
		expect(seeAll.classList.contains('border-t')).toBe(true);
	});

	it('closes on Escape', async () => {
		await openBell([makeNotification()], 1);

		await fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

		await vi.waitFor(() => expect(screen.queryByRole('link', { name: 'See all' })).toBeNull());
	});

	it('closes once a row has taken the reader to another page', async () => {
		await openBell([makeNotification()], 1);

		flushSync(afterNavigateCallback());

		await vi.waitFor(() => expect(screen.queryByRole('link', { name: 'See all' })).toBeNull());
	});
});
