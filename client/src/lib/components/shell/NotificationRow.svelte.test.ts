import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { goto, preloadData } from '$app/navigation';
import NotificationRow from './NotificationRow.svelte';
import type { Notification } from '$lib/notifications';

// SvelteKit's navigation only works inside a running app, so these stand-ins
// record where the row asked to go instead of going there.
vi.mock('$app/navigation', () => ({
	goto: vi.fn(async () => undefined),
	invalidateAll: vi.fn(async () => undefined),
	preloadData: vi.fn(async () => ({ type: 'loaded', status: 200, data: {} }))
}));

/**
 * Click `button` with the form's sending stopped first: jsdom cannot send a
 * form, so `use:enhance` would fail on it. A listener on the document that
 * runs before the form's own (`capture`) keeps the submit from reaching it.
 */
async function clickWithoutSending(button: HTMLElement): Promise<void> {
	const stopSubmit = (event: Event) => {
		event.preventDefault();
		event.stopPropagation();
	};

	document.addEventListener('submit', stopSubmit, { capture: true });
	await fireEvent.click(button);
	document.removeEventListener('submit', stopSubmit, { capture: true });
}

/** The moment every test pretends the page was built at. */
const NOW = new Date('2026-02-12T12:00:00Z');

/** A notification with everything filled in, so each test changes one thing. */
function makeNotification(overrides: Partial<Notification> = {}): Notification {
	return {
		id: 'a0000000-0000-4000-8000-000000000001',
		kind: 'application_decided',
		title: 'Your application to Riverside MUN 2027 was accepted',
		body: 'Your seat will be allocated in the next few days.',
		linkPath: '/applications/1',
		readAt: null,
		createdAt: '2026-02-12T10:00:00Z',
		conferenceName: 'Riverside MUN 2027',
		...overrides
	};
}

describe('NotificationRow', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('shows the title, the body, how long ago it was and the conference', () => {
		render(NotificationRow, { props: { notification: makeNotification(), now: NOW } });

		expect(screen.getByText('Your application to Riverside MUN 2027 was accepted')).toBeTruthy();
		expect(screen.getByText('Your seat will be allocated in the next few days.')).toBeTruthy();
		expect(screen.getByText('2 hours ago')).toBeTruthy();
		expect(screen.getByText('Riverside MUN 2027')).toBeTruthy();
	});

	it('says in words that an unread one is unread, not only in colour', () => {
		render(NotificationRow, { props: { notification: makeNotification(), now: NOW } });

		expect(screen.getByText('Unread.')).toBeTruthy();
	});

	it('says nothing of the sort once it has been read', () => {
		const notification = makeNotification({ readAt: '2026-02-12T11:00:00Z' });
		render(NotificationRow, { props: { notification, now: NOW } });

		expect(screen.queryByText('Unread.')).toBeNull();
	});

	it('gives an unread row the light blue dot and sets its title in bold', () => {
		const { container } = render(NotificationRow, {
			props: { notification: makeNotification(), now: NOW }
		});

		const title = screen.getByText('Your application to Riverside MUN 2027 was accepted');

		expect(container.querySelector('.bg-ring')).toBeTruthy();
		expect(title.classList.contains('font-semibold')).toBe(true);
	});

	it('draws a read row with no dot and a title in the normal weight', () => {
		const notification = makeNotification({ readAt: '2026-02-12T11:00:00Z' });
		const { container } = render(NotificationRow, { props: { notification, now: NOW } });

		const title = screen.getByText('Your application to Riverside MUN 2027 was accepted');

		expect(container.querySelector('.bg-ring')).toBeNull();
		expect(title.classList.contains('font-normal')).toBe(true);
	});

	it('leaves every row white, read or not, so unread shows in the dot and the bold title', () => {
		const unread = render(NotificationRow, {
			props: { notification: makeNotification(), now: NOW }
		});
		const read = render(NotificationRow, {
			props: { notification: makeNotification({ readAt: '2026-02-12T11:00:00Z' }), now: NOW }
		});

		const unreadRow = unread.container.querySelector('form');
		const readRow = read.container.querySelector('form');

		expect(unreadRow?.className).toBe(readRow?.className);
	});

	it('turns a row pale blue under the pointer and while a button in it has the keyboard focus', () => {
		const { container } = render(NotificationRow, {
			props: { notification: makeNotification(), now: NOW }
		});

		const row = container.querySelector('form');

		expect(row?.classList.contains('hover:bg-accent')).toBe(true);
		expect(row?.classList.contains('has-focus-visible:bg-accent')).toBe(true);
		expect(row?.classList.contains('transition-colors')).toBe(true);
	});

	it('draws the focus ring of the open button inside the row, where the card cannot cut it off', () => {
		render(NotificationRow, { props: { notification: makeNotification(), now: NOW } });

		const openButton = screen.getByRole('button', { name: /was accepted/ });

		expect(openButton.classList.contains('focus-visible:-outline-offset-2')).toBe(true);
	});

	it('pads the open button rather than the row, so a click anywhere on the row opens it', () => {
		const { container } = render(NotificationRow, {
			props: { notification: makeNotification(), now: NOW }
		});

		const row = container.querySelector('form');
		const openButton = screen.getByRole('button', { name: /was accepted/ });

		expect(row?.className).not.toMatch(/\bp[xy]-/);
		expect(openButton.classList.contains('pl-4')).toBe(true);
		expect(openButton.classList.contains('py-3')).toBe(true);
	});

	it('shows a pointing hand over the open button, as over a link', () => {
		render(NotificationRow, { props: { notification: makeNotification(), now: NOW } });

		const openButton = screen.getByRole('button', { name: /was accepted/ });

		expect(openButton.classList.contains('cursor-pointer')).toBe(true);
	});

	it('goes where the notification leads the moment it is pressed', async () => {
		render(NotificationRow, { props: { notification: makeNotification(), now: NOW } });

		await clickWithoutSending(screen.getByRole('button', { name: /was accepted/ }));

		expect(goto).toHaveBeenCalledWith('/applications/1');
	});

	it('leaves a notification with no link to the answer from the server', async () => {
		const notification = makeNotification({ linkPath: null });
		render(NotificationRow, { props: { notification, now: NOW } });

		await clickWithoutSending(screen.getByRole('button', { name: /was accepted/ }));

		expect(goto).not.toHaveBeenCalled();
	});

	it('fetches the page it leads to while the pointer is over it, as a link does', async () => {
		render(NotificationRow, { props: { notification: makeNotification(), now: NOW } });

		await fireEvent.pointerEnter(screen.getByRole('button', { name: /was accepted/ }));

		expect(preloadData).toHaveBeenCalledWith('/applications/1');
	});

	it('sends the notification it is about with the press', () => {
		render(NotificationRow, { props: { notification: makeNotification(), now: NOW } });

		const hiddenField = document.querySelector('input[name="notificationId"]');

		expect(hiddenField?.getAttribute('value')).toBe('a0000000-0000-4000-8000-000000000001');
	});

	it('opens through the notifications page, so a row in the bell works anywhere', () => {
		render(NotificationRow, { props: { notification: makeNotification(), now: NOW } });

		const openButton = screen.getByRole('button', { name: /was accepted/ });

		expect(openButton.getAttribute('formaction')).toBe('/notifications?/open');
	});

	it('offers a "Remove" button on a full row', () => {
		render(NotificationRow, { props: { notification: makeNotification(), now: NOW } });

		expect(screen.getByRole('button', { name: 'Remove' }).getAttribute('formaction')).toBe(
			'/notifications?/delete'
		);
	});

	it('leaves the body and "Remove" out of a compact row', () => {
		render(NotificationRow, {
			props: { notification: makeNotification(), now: NOW, isCompact: true }
		});

		expect(screen.queryByText('Your seat will be allocated in the next few days.')).toBeNull();
		expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
	});

	it('draws a compact row smaller: a small title cut at two lines, and less padding', () => {
		render(NotificationRow, {
			props: { notification: makeNotification(), now: NOW, isCompact: true }
		});

		const title = screen.getByText('Your application to Riverside MUN 2027 was accepted');
		const openButton = screen.getByRole('button', { name: /was accepted/ });

		expect(title.classList.contains('text-small')).toBe(true);
		expect(title.classList.contains('line-clamp-2')).toBe(true);
		expect(openButton.classList.contains('py-2')).toBe(true);
	});

	it('names the conference in plain words beside the time on a compact row', () => {
		render(NotificationRow, {
			props: { notification: makeNotification(), now: NOW, isCompact: true }
		});

		const conference = screen.getByText('Riverside MUN 2027');
		const time = screen.getByText('2 hours ago');

		expect(conference.parentElement).toBe(time.parentElement);
		expect(conference.classList.contains('truncate')).toBe(true);
	});

	it('gives a compact row the same hover colour as a full one', () => {
		const { container } = render(NotificationRow, {
			props: { notification: makeNotification(), now: NOW, isCompact: true }
		});

		expect(container.querySelector('form')?.classList.contains('hover:bg-accent')).toBe(true);
	});
});
