import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import AppHeader from './AppHeader.svelte';
import type { Notification } from '$lib/notifications';

// The phone menu and the bell ask SvelteKit to close them after a navigation,
// and the account menu's lines go somewhere with `goto`. Both only work inside
// a running app.
vi.mock('$app/navigation', () => ({ afterNavigate: vi.fn(), goto: vi.fn() }));

/** The moment every test pretends the page was built at. */
const NOW = new Date('2026-02-12T12:00:00Z');

const PERSON = { fullName: 'Daniel Perez', avatarPath: null };

const NOTIFICATION: Notification = {
	id: 'a0000000-0000-4000-8000-000000000001',
	kind: 'announcement',
	title: 'Dress code confirmed for Riverside MUN 2027',
	body: null,
	linkPath: '/conferences/riverside-mun-2027/announcements',
	readAt: null,
	createdAt: '2026-02-12T10:00:00Z',
	conferenceName: 'Riverside MUN 2027'
};

/** The props of a signed-out visitor, so each test changes only what it is about. */
function visitorProps() {
	return {
		person: null,
		notifications: [],
		unreadCount: 0,
		now: NOW,
		pathname: '/conferences',
		nextParameter: null,
		hasOrganiserArea: false,
		hasApplications: false
	};
}

/**
 * The props of a signed-in person with one unread notification, who runs
 * nothing and has applied to nothing. The tests about the Manage and
 * Applications links pass `hasOrganiserArea` or `hasApplications` themselves.
 */
function signedInProps() {
	return {
		person: PERSON,
		notifications: [NOTIFICATION],
		unreadCount: 1,
		now: NOW,
		pathname: '/conferences',
		nextParameter: null,
		hasOrganiserArea: false,
		hasApplications: false
	};
}

describe('AppHeader, signed out', () => {
	it('offers the two ways in', () => {
		render(AppHeader, { props: visitorProps() });

		expect(screen.getByRole('link', { name: 'Log in' })).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Sign up' })).toBeTruthy();
	});

	it('sends the visitor back to the page they were on after signing in', () => {
		render(AppHeader, { props: visitorProps() });

		expect(screen.getByRole('link', { name: 'Log in' }).getAttribute('href')).toBe(
			'/login?next=%2Fconferences'
		);
	});

	it('sends a new account back to the page the visitor was on as well', () => {
		render(AppHeader, { props: visitorProps() });

		expect(screen.getByRole('link', { name: 'Sign up' }).getAttribute('href')).toBe(
			'/register?next=%2Fconferences'
		);
	});

	it('hands on the next of the sign in page rather than the sign in page itself', () => {
		// Pressing "Apply as a delegate" signed out lands here (T164). Both ways in
		// keep the apply form as the place to come back to.
		const applyPath = '/conferences/northbridge-mun/apply';
		const expectedNext = encodeURIComponent(applyPath);

		render(AppHeader, {
			props: { ...visitorProps(), pathname: '/login', nextParameter: applyPath }
		});

		expect(screen.getByRole('link', { name: 'Log in' }).getAttribute('href')).toBe(
			`/login?next=${expectedNext}`
		);
		expect(screen.getByRole('link', { name: 'Sign up' }).getAttribute('href')).toBe(
			`/register?next=${expectedNext}`
		);
	});

	it('carries no next from the create account page when it had none', () => {
		render(AppHeader, { props: { ...visitorProps(), pathname: '/register' } });

		expect(screen.getByRole('link', { name: 'Log in' }).getAttribute('href')).toBe('/login');
		expect(screen.getByRole('link', { name: 'Sign up' }).getAttribute('href')).toBe('/register');
	});

	it('offers a visitor a way to search the conferences', () => {
		render(AppHeader, { props: { ...visitorProps(), pathname: '/for-organisers' } });

		const search = screen.getByRole('link', { name: 'Search conferences' });

		expect(search.getAttribute('href')).toBe('/conferences');
	});

	it('leaves the search out on the directory, whose filters are its search', () => {
		render(AppHeader, { props: visitorProps() });

		expect(screen.queryByRole('link', { name: 'Search conferences' })).toBeNull();
	});

	it('draws the same opaque white bar with a hairline under it on every page', () => {
		// docs/DESIGN.md, "The shell": opaque, not frosted glass, and the same
		// from one page to the next (Trello VTTLkqq3).
		const landing = render(AppHeader, { props: { ...visitorProps(), pathname: '/' } });
		const landingBar = landing.container.querySelector('header');
		const signedIn = render(AppHeader, { props: { ...signedInProps(), pathname: '/resources' } });
		const resourcesBar = signedIn.container.querySelector('header');

		expect(landingBar?.className).toContain('border-b');
		expect(landingBar?.className).toContain('bg-background');
		expect(landingBar?.className).not.toContain('backdrop-blur');
		expect(resourcesBar?.className).toBe(landingBar?.className);
	});

	it('has no bell and no profile menu', () => {
		render(AppHeader, { props: visitorProps() });

		expect(screen.queryByLabelText(/Notifications/)).toBeNull();
		expect(screen.queryByText('Daniel')).toBeNull();
	});

	it('sends the logo to the front page, which is all a visitor may see', () => {
		render(AppHeader, { props: visitorProps() });

		expect(screen.getByRole('link', { name: 'MUNMeet' }).getAttribute('href')).toBe('/');
	});
});

describe('AppHeader, signed in', () => {
	it('shows the bell with the number still unread', () => {
		render(AppHeader, { props: signedInProps() });

		expect(screen.getByLabelText('Notifications, 1 unread')).toBeTruthy();
	});

	it('opens the profile menu from the person’s own name and picture', () => {
		render(AppHeader, { props: signedInProps() });

		// The lines of the menu, "Log out" among them, are only drawn once it is
		// open; `AccountMenu`'s own tests open it.
		const accountButton = screen.getByRole('button', { name: 'Daniel Perez' });

		expect(accountButton.textContent).toContain('Daniel');
	});

	it('searches conferences with a real GET form, so it works without JavaScript', () => {
		const { container } = render(AppHeader, { props: { ...signedInProps(), pathname: '/home' } });

		const searchForm = container.querySelector('form[method="get"]');

		expect(searchForm?.getAttribute('action')).toBe('/conferences');
		expect(screen.getByLabelText('Search conferences')).toBeTruthy();
	});

	it('draws no search box on the conference directory, which has its own', () => {
		const { container } = render(AppHeader, { props: signedInProps() });

		expect(container.querySelector('form[method="get"]')).toBeNull();
		expect(screen.queryByLabelText('Search conferences')).toBeNull();
	});

	it('keeps the search box on the home page, which has no search of its own', () => {
		// `/home` once drew a "Find a conference" search for a reader with nothing
		// coming up (Trello U98pRHM9); it now offers a button, so the bar's box is
		// the only one.
		render(AppHeader, { props: { ...signedInProps(), pathname: '/home' } });

		expect(screen.getByLabelText('Search conferences')).toBeTruthy();
	});

	it('keeps the search box on a page under the directory, such as one conference', () => {
		render(AppHeader, {
			props: { ...signedInProps(), pathname: '/conferences/northbridge-mun' }
		});

		expect(screen.getByLabelText('Search conferences')).toBeTruthy();
	});

	it('sends the logo to the dashboard rather than to the front page', () => {
		render(AppHeader, { props: signedInProps() });

		expect(screen.getByRole('link', { name: 'MUNMeet' }).getAttribute('href')).toBe('/home');
	});

	it('offers Manage to somebody who runs a conference, and only under that name', () => {
		render(AppHeader, { props: { ...signedInProps(), hasOrganiserArea: true } });

		// The slide-in menu for a phone draws its own copy only once it is open,
		// so the bar's is the one link here. The account menu no longer repeats
		// it as "Organiser area".
		expect(screen.getAllByRole('link', { name: 'Manage' }).length).toBe(1);
		expect(screen.queryByRole('link', { name: 'Organiser area' })).toBeNull();
	});

	it('hides Manage from somebody who runs nothing', () => {
		render(AppHeader, { props: signedInProps() });

		expect(screen.queryByRole('link', { name: 'Manage' })).toBeNull();
		expect(screen.queryByRole('link', { name: 'Organiser area' })).toBeNull();
	});

	it('offers Applications to somebody who has applied', () => {
		render(AppHeader, { props: { ...signedInProps(), hasApplications: true } });

		expect(screen.getAllByRole('link', { name: 'Applications' }).length).toBe(1);
	});

	it('hides Applications from somebody who has applied to nothing', () => {
		render(AppHeader, { props: signedInProps() });

		expect(screen.queryByRole('link', { name: 'Applications' })).toBeNull();
		expect(screen.getAllByRole('link', { name: 'Schedule' }).length).toBe(1);
	});

	it('marks the page the reader is on', () => {
		render(AppHeader, { props: signedInProps() });

		expect(screen.getByRole('link', { name: 'Conferences' }).getAttribute('aria-current')).toBe(
			'page'
		);
	});
});
