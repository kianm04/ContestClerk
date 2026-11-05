import { describe, expect, it } from 'vitest';
import type { ResolvedPathname } from '$app/types';
import {
	activeLinkHref,
	isActiveLink,
	isConferenceDirectory,
	isConferenceSchedule,
	profileMenuItems,
	signedInNavigationLinks,
	visitorNavigationLinks
} from './navigation';

/** A reader who organises nothing and has applied nowhere, such as a chair. */
const NO_ROLES = { hasOrganiserArea: false, hasApplications: false };

/** A reader who holds both role links' roles. */
const BOTH_ROLES = { hasOrganiserArea: true, hasApplications: true };

describe('signedInNavigationLinks', () => {
	it('gives a reader with no roles the four links everybody can use', () => {
		expect(signedInNavigationLinks(NO_ROLES)).toEqual([
			{ label: 'Home', href: '/home' },
			{ label: 'Conferences', href: '/conferences' },
			{ label: 'Schedule', href: '/schedule' },
			{ label: 'Resources', href: '/resources' }
		]);
	});

	it('starts with Home, which is where the dashboard lives', () => {
		expect(signedInNavigationLinks(NO_ROLES)[0]).toEqual({ label: 'Home', href: '/home' });
	});

	it('puts Applications after Conferences and Manage last, the order the app shell draws', () => {
		const labels = signedInNavigationLinks(BOTH_ROLES).map((link) => link.label);

		expect(labels).toEqual([
			'Home',
			'Conferences',
			'Applications',
			'Schedule',
			'Resources',
			'Manage'
		]);
	});

	it('adds Applications for a reader with an application or a delegation membership', () => {
		const links = signedInNavigationLinks({ hasOrganiserArea: false, hasApplications: true });

		expect(links).toContainEqual({ label: 'Applications', href: '/applications' });
		expect(links.map((link) => link.label)).not.toContain('Manage');
	});

	it('hides Applications from a reader who has applied nowhere', () => {
		// Streamlining principle P7: the page would only be an empty list for them.
		const labels = signedInNavigationLinks(NO_ROLES).map((link) => link.label);

		expect(labels).not.toContain('Applications');
	});

	it('adds Manage for an organiser, without Applications if they have applied nowhere', () => {
		expect(signedInNavigationLinks({ hasOrganiserArea: true, hasApplications: false })).toEqual([
			{ label: 'Home', href: '/home' },
			{ label: 'Conferences', href: '/conferences' },
			{ label: 'Schedule', href: '/schedule' },
			{ label: 'Resources', href: '/resources' },
			{ label: 'Manage', href: '/manage' }
		]);
	});

	it('hides Manage from somebody who organises nothing', () => {
		// `03-design/app-shell.md` shows the link only to somebody who belongs to
		// an organisation or organises a conference. A chair or a volunteer finds
		// nothing to act on behind it, so the top bar does not offer it.
		const labels = signedInNavigationLinks(NO_ROLES).map((link) => link.label);

		expect(labels).not.toContain('Manage');
	});

	it('keeps Schedule and Resources for every reader', () => {
		for (const roles of [NO_ROLES, BOTH_ROLES]) {
			const labels = signedInNavigationLinks(roles).map((link) => link.label);

			expect(labels).toContain('Schedule');
			expect(labels).toContain('Resources');
		}
	});
});

describe('visitorNavigationLinks', () => {
	it('lists the pages a visitor can reach', () => {
		// "Resources" sits in the middle, as the landing page's mockup draws it
		// (Trello RBz46aTQ). A visitor who follows it is asked to log in first.
		expect(visitorNavigationLinks()).toEqual([
			{ label: 'Conferences', href: '/conferences' },
			{ label: 'Resources', href: '/resources' },
			{ label: 'For organisers', href: '/for-organisers' }
		]);
	});

	it('offers "For organisers" to a visitor, which the signed-in bar does not', () => {
		// `03-design/app-shell.md` keeps it out of the signed-in top bar, where
		// the room goes to the pages somebody taking part actually uses.
		const visitorLabels = visitorNavigationLinks().map((link) => link.label);
		const signedInLabels = signedInNavigationLinks(BOTH_ROLES).map((link) => link.label);

		expect(visitorLabels).toContain('For organisers');
		expect(signedInLabels).not.toContain('For organisers');
	});
});

describe('profileMenuItems', () => {
	it('lists the pages that exist, in the order the app shell draws them', () => {
		expect(profileMenuItems()).toEqual([
			{ label: 'Profile', href: '/profile' },
			{ label: 'Settings', href: '/settings' },
			{ label: 'Create a conference', href: '/create' },
			{ label: 'Log out', href: '/logout' }
		]);
	});

	it('has no "Organiser area", which was the top bar\'s "Manage" a second time', () => {
		const labels = profileMenuItems().map((item) => item.label);

		expect(labels).not.toContain('Organiser area');
	});

	it('starts with Profile, which `03-design/app-shell.md` draws at the top', () => {
		const items = profileMenuItems();

		expect(items[0]).toEqual({ label: 'Profile', href: '/profile' });
	});

	it('ends with logging out', () => {
		const items = profileMenuItems();

		expect(items.at(-1)).toEqual({ label: 'Log out', href: '/logout' });
	});

	it('sends "Log out" to the page whose form ends the session, not to an action', () => {
		// A prefetching browser must never be able to sign somebody out, so this
		// line only opens a page and carries no `formaction`.
		const logOut = profileMenuItems().find((item) => item.label === 'Log out');

		expect(logOut).not.toHaveProperty('formaction');
	});
});

describe('isConferenceDirectory', () => {
	it('is true on the conference directory', () => {
		expect(isConferenceDirectory('/conferences')).toBe(true);
	});

	it("is false on a conference's own page underneath it", () => {
		expect(isConferenceDirectory('/conferences/thimun-2027')).toBe(false);
	});

	it('is false everywhere else', () => {
		expect(isConferenceDirectory('/home')).toBe(false);
		expect(isConferenceDirectory('/')).toBe(false);
	});
});

describe('isActiveLink', () => {
	it('matches the page itself', () => {
		expect(isActiveLink('/conferences', '/conferences')).toBe(true);
	});

	it('stays active on a page underneath it', () => {
		expect(isActiveLink('/conferences/thimun-2027', '/conferences')).toBe(true);
	});

	it('does not match a different page that starts with the same letters', () => {
		expect(isActiveLink('/conferences-archive', '/conferences')).toBe(false);
	});

	it('matches the front page only when that is where the reader is', () => {
		expect(isActiveLink('/', '/')).toBe(true);
		expect(isActiveLink('/conferences', '/')).toBe(false);
	});

	it('marks a link whose address arrived relative, which is what a server render writes', () => {
		// `resolve()` answers a *relative* address while a page is being built on
		// the server, so on `/conferences/amsterdammun-2027` the bar's
		// "Conferences" link really is written `../conferences`. Compared as
		// plain text that never matches, and the bar came back from the server
		// with nothing marked; see `absolutePath` in `$lib/urls.ts`.
		expect(isActiveLink('/conferences/amsterdammun-2027', '../conferences')).toBe(true);
	});

	it('matches a relative address on the page it points at', () => {
		// The case that would pass either way, which is why the browser test for
		// this has to stand on a page *below* the link rather than on it.
		expect(isActiveLink('/conferences', './conferences')).toBe(true);
	});

	it('leaves a relative address that resolves somewhere else alone', () => {
		expect(isActiveLink('/privacy', '../conferences')).toBe(false);
	});
});

describe('isConferenceSchedule', () => {
	it("is true on a conference's schedule", () => {
		expect(isConferenceSchedule('/conferences/thimun-2027/schedule')).toBe(true);
	});

	it("is false on the conference's other pages and on the reader's /schedule", () => {
		expect(isConferenceSchedule('/conferences/thimun-2027')).toBe(false);
		expect(isConferenceSchedule('/conferences/thimun-2027/announcements')).toBe(false);
		expect(isConferenceSchedule('/schedule')).toBe(false);
	});
});

describe('activeLinkHref', () => {
	const signedInLinks = signedInNavigationLinks(NO_ROLES);

	it('underlines the link of the page the reader is on, or of the page above it', () => {
		expect(activeLinkHref('/resources', signedInLinks)).toBe('/resources');
		expect(activeLinkHref('/conferences/thimun-2027', signedInLinks)).toBe('/conferences');
	});

	it('underlines "Schedule" on the schedule of a conference, not "Conferences"', () => {
		expect(activeLinkHref('/conferences/thimun-2027/schedule', signedInLinks)).toBe('/schedule');
	});

	it('leaves "Conferences" underlined there for a visitor, whose bar has no "Schedule"', () => {
		const links = visitorNavigationLinks();

		expect(activeLinkHref('/conferences/thimun-2027/schedule', links)).toBe('/conferences');
	});

	it('underlines "Manage" while a conference is being created', () => {
		const organiserLinks = signedInNavigationLinks(BOTH_ROLES);

		expect(activeLinkHref('/create', organiserLinks)).toBe('/manage');
		expect(activeLinkHref('/create/delft-mun-2027/basics', organiserLinks)).toBe('/manage');
		expect(activeLinkHref('/created', organiserLinks)).toBeNull();
		expect(activeLinkHref('/create', signedInLinks)).toBeNull();
	});

	it('underlines nothing on a page under none of the links', () => {
		expect(activeLinkHref('/privacy', signedInLinks)).toBeNull();
	});

	it('finds "Schedule" when the links arrived relative, which is what a server render writes', () => {
		// The cast stands in for `resolve()`, which a test outside SvelteKit cannot run.
		const relativeLinks = [
			{ label: 'Conferences', href: '../../conferences' as ResolvedPathname },
			{ label: 'Schedule', href: '../../schedule' as ResolvedPathname }
		];

		const active = activeLinkHref('/conferences/thimun-2027/schedule', relativeLinks);

		expect(active).toBe('../../schedule');
	});
});
