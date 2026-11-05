/**
 * What is in the top bar of the app shell: the links across the middle and the
 * lines in the profile menu.
 *
 * They live here rather than in the header component so that a teammate adding
 * a page changes one list, and so that the "which link is the page I am on"
 * rule can be tested without rendering anything.
 *
 * `03-design/app-shell.md` draws more links than there are pages. `resolve()`
 * checks every address against the folders under `src/routes/`, so a link can
 * only be written once its page exists. The comment on each list says which
 * task adds the rest; that task adds its own line here.
 */

import type { ResolvedPathname } from '$app/types';
import {
	absolutePath,
	accountSettingsUrl,
	conferenceListUrl,
	createConferenceUrl,
	forOrganisersUrl,
	landingUrl,
	logoutUrl,
	manageUrl,
	myApplicationsUrl,
	myResourcesUrl,
	myScheduleUrl,
	profileUrl,
	signedInHomeUrl
} from '$lib/urls';

/** One link across the middle of the top bar. */
export type NavigationLink = {
	label: string;
	/** Built with a helper from `$lib/urls.ts`; a hand-written string is refused. */
	href: ResolvedPathname;
};

/**
 * What the reader holds that decides which role links they see. The root
 * layout works both out on the server and passes them in, because this file
 * cannot ask the database.
 */
export type NavigationRoles = {
	/**
	 * The reader belongs to an organisation or organises a conference, so
	 * `/manage` has something for them to act on.
	 */
	hasOrganiserArea: boolean;
	/** The reader has at least one application or delegation membership, in any state. */
	hasApplications: boolean;
};

/**
 * The links a signed-in person sees, in the order `03-design/app-shell.md`
 * draws them.
 *
 * A link that belongs to a role is shown only to a reader who holds that role
 * (streamlining principle P7): "Applications" to somebody who has applied or
 * is in a delegation, "Manage" to somebody who organises. Everybody else would
 * find an empty list behind them. Home, Conferences, Schedule and Resources
 * are for everyone.
 *
 * Applications arrived with T69, which built `/applications`, Schedule with
 * T35, which built `/schedule`, and Resources with T37, which built
 * `/resources`. `/schedule` now sends the reader on to the schedule of their
 * current conference, so the top bar has one schedule rather than two.
 */
export function signedInNavigationLinks(roles: NavigationRoles): NavigationLink[] {
	const links: NavigationLink[] = [
		{ label: 'Home', href: signedInHomeUrl() },
		{ label: 'Conferences', href: conferenceListUrl() }
	];

	if (roles.hasApplications) {
		links.push({ label: 'Applications', href: myApplicationsUrl() });
	}

	links.push({ label: 'Schedule', href: myScheduleUrl() });
	links.push({ label: 'Resources', href: myResourcesUrl() });

	if (roles.hasOrganiserArea) {
		links.push({ label: 'Manage', href: manageUrl() });
	}

	return links;
}

/**
 * The links a visitor sees, in the order `03-design/app-shell.md` draws them.
 *
 * Every page the visitor bar asks for now exists, so unlike the two lists
 * around it this one is complete and no later task adds to it.
 *
 * "Resources" sits between the two, as the landing page's mockup draws it
 * (Trello RBz46aTQ). `/resources` holds the files shared with the reader, so a
 * visitor who follows it is asked to log in first and lands there afterwards.
 */
export function visitorNavigationLinks(): NavigationLink[] {
	return [
		{ label: 'Conferences', href: conferenceListUrl() },
		{ label: 'Resources', href: myResourcesUrl() },
		{ label: 'For organisers', href: forOrganisersUrl() }
	];
}

/**
 * The profile menu, opened from the avatar on the right of the top bar.
 *
 * The order is the one `03-design/app-shell.md` draws: Profile, Settings,
 * "Create a conference", Log out. It is the same for everybody. "Create a
 * conference" is how a person starts organising, so it is not kept for
 * organisers. The menu used to hold "Organiser area" as well, which was the top
 * bar's "Manage" a second time, so streamlining removed it.
 *
 * "Log out" opens a page whose form ends the session, rather than ending it on
 * the spot, so that a browser prefetching links cannot sign anybody out by
 * accident.
 */
export function profileMenuItems(): NavigationLink[] {
	return [
		{ label: 'Profile', href: profileUrl() },
		{ label: 'Settings', href: accountSettingsUrl() },
		{ label: 'Create a conference', href: createConferenceUrl() },
		{ label: 'Log out', href: logoutUrl() }
	];
}

/**
 * Whether the reader is on the conference directory itself.
 *
 * The top bar leaves its search box out there, because the directory's own
 * filter form is that page's search, and two boxes both labelled "Search
 * conferences" would sit on one screen. A conference's own page under
 * `/conferences/...` keeps the box.
 *
 * The link is turned into an absolute path first, for the reason `isActiveLink`
 * below gives.
 */
export function isConferenceDirectory(pathname: string): boolean {
	return absolutePath(conferenceListUrl(), pathname) === pathname;
}

/**
 * Is this link the page the reader is on? The active link gets an underline.
 *
 * A link counts as active for its own page and for everything under it, so
 * `/conferences` stays underlined while reading `/conferences/thimun-2027`.
 * The front page is the exception: every address starts with the front page's,
 * so it only matches itself.
 *
 * Both addresses are turned into absolute paths before anything is compared,
 * because the links come from `resolve()`, which answers relatively while a
 * page is being built on the server. `absolutePath` in `$lib/urls.ts` explains
 * that in full; without it the bar would arrive from the server with nothing
 * marked, and only a page whose JavaScript never runs would show it.
 */
export function isActiveLink(pathname: string, href: string): boolean {
	const linkPath = absolutePath(href, pathname);
	const frontPagePath = absolutePath(landingUrl(), pathname);

	if (linkPath === frontPagePath) {
		return pathname === frontPagePath;
	}

	return pathname === linkPath || pathname.startsWith(`${linkPath}/`);
}

/**
 * Whether the reader is on one conference's schedule,
 * `/conferences/<slug>/schedule`.
 *
 * The directory's path is turned into an absolute path first, for the reason
 * `isActiveLink` above gives.
 */
export function isConferenceSchedule(pathname: string): boolean {
	const directoryPath = absolutePath(conferenceListUrl(), pathname);

	if (!pathname.startsWith(`${directoryPath}/`)) {
		return false;
	}

	// What is left of `/conferences/<slug>/schedule` splits into `['<slug>', 'schedule']`.
	const parts = pathname.slice(directoryPath.length + 1).split('/');

	return parts.length === 2 && parts[1] === 'schedule';
}

/**
 * The address of the one link to underline, or `null` when the page is under
 * none of them.
 *
 * That is the first link `isActiveLink` matches, with one exception. A
 * conference's schedule sits under `/conferences`, but it is the page the top
 * bar's "Schedule" opens (`/schedule` sends the reader on to it), so there
 * "Schedule" is underlined rather than "Conferences". A visitor's bar has no
 * "Schedule", so for them "Conferences" stays underlined.
 *
 * Creating a conference is the other exception: `/create` and its steps are
 * under no link, but the organiser arrived from "Manage" and returns there,
 * so "Manage" stays underlined while they create one.
 */
export function activeLinkHref(pathname: string, links: NavigationLink[]): string | null {
	const schedulePath = absolutePath(myScheduleUrl(), pathname);
	const scheduleLink = links.find((link) => absolutePath(link.href, pathname) === schedulePath);

	if (scheduleLink !== undefined && isConferenceSchedule(pathname)) {
		return scheduleLink.href;
	}

	const managePath = absolutePath(manageUrl(), pathname);
	const manageLink = links.find((link) => absolutePath(link.href, pathname) === managePath);

	if (manageLink !== undefined && isActiveLink(pathname, createConferenceUrl())) {
		return manageLink.href;
	}

	const activeLink = links.find((link) => isActiveLink(pathname, link.href));

	return activeLink?.href ?? null;
}
