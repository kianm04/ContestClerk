/**
 * The links of the management sidebar, the column down the left of every page
 * under `/manage/[slug]` (the manage redesign, `specs/03-design/manage-redesign/`).
 *
 * The sidebar changes with the conference's life:
 *
 * - While it is a draft there is no dashboard yet, and the "Set up" pages are
 *   numbered steps 1 to 6 with a tick for each one done (`$lib/setup-steps.ts`).
 * - Once it is published, the dashboard comes first and the setup pages get
 *   icons like every other link.
 * - At most one link carries a count, the one thing the current phase is about:
 *   applications to review, free seats, or awards waiting to be confirmed.
 * - It shows only the links the reader may open (`docs/roles-and-permissions.md`,
 *   section 6), and leaves out a heading with nothing left under it. The
 *   numbered steps are for somebody who may edit the conference; anybody else
 *   on the team of a draft gets the dashboard and their own links.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import type { LucideIcon } from '@lucide/svelte';
import Award from '@lucide/svelte/icons/award';
import CalendarDays from '@lucide/svelte/icons/calendar-days';
import ClipboardList from '@lucide/svelte/icons/clipboard-list';
import Contact from '@lucide/svelte/icons/contact';
import FileText from '@lucide/svelte/icons/file-text';
import Files from '@lucide/svelte/icons/files';
import Inbox from '@lucide/svelte/icons/inbox';
import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
import LayoutGrid from '@lucide/svelte/icons/layout-grid';
import Megaphone from '@lucide/svelte/icons/megaphone';
import Receipt from '@lucide/svelte/icons/receipt';
import School from '@lucide/svelte/icons/school';
import UserPlus from '@lucide/svelte/icons/user-plus';
import Users from '@lucide/svelte/icons/users';
import type { ResolvedPathname } from '$app/types';
import { mayFollowLink, mayOpenManagePage } from '$lib/manage-pages';
import type { MyPermissions } from '$lib/permissions';
import { SETUP_STEP_COUNT, type SetupStep, type SetupStepKey } from '$lib/setup-steps';
import {
	absolutePath,
	manageAllocationUrl,
	manageAnnouncementsUrl,
	manageApplicationFormUrl,
	manageApplicationsUrl,
	manageAwardsUrl,
	manageCommitteesUrl,
	manageConferenceUrl,
	manageDelegationsUrl,
	manageDetailsUrl,
	manageDocumentsUrl,
	manageFeesUrl,
	manageParticipantsUrl,
	manageScheduleUrl,
	manageRolesUrl,
	manageTeamUrl
} from '$lib/urls';

/** What sits at the start of a link: an icon, or a draft's numbered step marker. */
export type SidebarMarker =
	{ kind: 'icon'; icon: LucideIcon } | { kind: 'step'; number: number; isDone: boolean };

/** One link of the sidebar. */
export type ManageSidebarLink = {
	label: string;
	href: ResolvedPathname;
	marker: SidebarMarker;
	/** True on the page the reader is on, and on the pages inside its section. */
	isActive: boolean;
	/**
	 * What `aria-current` says on the active link: `step` for a draft's setup
	 * step, so a screen reader says "current step", and `page` otherwise.
	 */
	currentKind: 'page' | 'step';
	/** The quiet word at the right of a draft's optional steps: "Optional". */
	note: string | null;
	/** The number at the right, such as applications waiting for a decision. */
	count: number | null;
	/** Publish, until the required steps are done. It is still a link. */
	isLocked: boolean;
};

/** A run of links under a quiet heading. The first group has no heading. */
export type ManageSidebarGroup = {
	heading: string | null;
	links: ManageSidebarLink[];
};

/** The one link in the sidebar that carries a count in the current phase. */
export type SidebarCount = {
	link: 'applications' | 'allocation' | 'awards';
	value: number;
};

/** One conference in the sidebar's switcher, the menu under "All conferences". */
export type SwitcherConference = {
	slug: string;
	name: string;
	startDate: string;
	endDate: string;
};

/** Everything the sidebar is worked out from. */
export type ManageSidebarInput = {
	slug: string;
	/** The address of the page being shown, `page.url.pathname`. */
	pathname: string;
	/** The six steps while the conference is a draft, `null` once it is published. */
	setupSteps: SetupStep[] | null;
	/** The count of the current phase, or `null` when the phase has none. */
	count: SidebarCount | null;
	/** What the reader may do on the conference, which decides the links shown. */
	permissions: MyPermissions;
};

/**
 * Whether a link built by `resolve()` points at the page whose address this is.
 *
 * It cannot be a plain `href === pathname`, because `resolve()` answers a
 * *relative* address while a page is being built on the server —
 * `../manage/thimun-2027` rather than `/manage/thimun-2027` — so that a build
 * can be served from any folder. Compared as text those two never match, and
 * the sidebar would arrive from the server with nothing marked; with JavaScript
 * the browser works it out again a moment later and marks it, which is why the
 * gap only shows on a page whose script never runs. `absolutePath` in
 * `$lib/urls.ts` is what settles it, and its comment explains the whole of it.
 */
function isCurrentPage(href: ResolvedPathname, pathname: string): boolean {
	return absolutePath(href, pathname) === pathname;
}

/**
 * Whether the reader is anywhere in one section of the area: its list page, or
 * any page underneath it, such as one committee's editor under the committees
 * list.
 *
 * Single pages use `isCurrentPage`, which is an exact match. A section stands
 * for a whole folder, so this also accepts an address that starts with the
 * list's and carries on with a `/`. The `/` matters: without it a future
 * `/manage/<slug>/committees-archive` would light the committees line up too.
 */
function isInSection(href: ResolvedPathname, pathname: string): boolean {
	const sectionPath = absolutePath(href, pathname);

	return pathname === sectionPath || pathname.startsWith(`${sectionPath}/`);
}

/** A link with an icon and nothing at its right. */
function iconLink(
	label: string,
	href: ResolvedPathname,
	icon: LucideIcon,
	isActive: boolean
): ManageSidebarLink {
	return {
		label,
		href,
		marker: { kind: 'icon', icon },
		isActive,
		currentKind: 'page',
		note: null,
		count: null,
		isLocked: false
	};
}

/**
 * Where the Team link leads: the team page, or the roles page under it for
 * somebody who may manage roles but not the team, who would otherwise have no
 * way to reach it.
 */
function teamLinkHref(slug: string, permissions: MyPermissions): ResolvedPathname {
	if (!mayOpenManagePage(permissions, 'team') && mayOpenManagePage(permissions, 'roles')) {
		return manageRolesUrl(slug);
	}

	return manageTeamUrl(slug);
}

/** The pages of the "Set up" group, with their icons, in step order. */
function setupIconLinks(
	slug: string,
	pathname: string,
	permissions: MyPermissions
): ManageSidebarLink[] {
	const detailsHref = manageDetailsUrl(slug);
	const committeesHref = manageCommitteesUrl(slug);
	const applicationFormHref = manageApplicationFormUrl(slug);
	const feesHref = manageFeesUrl(slug);
	const teamHref = teamLinkHref(slug, permissions);

	return [
		iconLink('Details', detailsHref, FileText, isCurrentPage(detailsHref, pathname)),
		// The committees list, one committee's editor and the "new committee" form
		// are one section, so the link stays marked on all three.
		iconLink('Committees', committeesHref, Users, isInSection(committeesHref, pathname)),
		iconLink(
			'Application form',
			applicationFormHref,
			ClipboardList,
			isCurrentPage(applicationFormHref, pathname)
		),
		// Fees has an invoices page underneath it, which keeps the link marked.
		iconLink('Fees', feesHref, Receipt, isInSection(feesHref, pathname)),
		// The roles pages sit under the team page and keep its link marked.
		iconLink('Team', teamHref, UserPlus, isInSection(manageTeamUrl(slug), pathname))
	];
}

/** The steps whose page has pages inside it that keep the step marked. */
const SECTION_STEP_KEYS: SetupStepKey[] = ['committees', 'fees'];

/** A draft's "Set up" group: the six numbered steps. */
function setupStepLinks(steps: SetupStep[], pathname: string): ManageSidebarLink[] {
	return steps.map((step) => {
		const isActive = SECTION_STEP_KEYS.includes(step.key)
			? isInSection(step.href, pathname)
			: isCurrentPage(step.href, pathname);

		return {
			label: step.label,
			href: step.href,
			marker: { kind: 'step', number: step.number, isDone: step.isDone },
			isActive,
			currentKind: 'step',
			note: step.isOptional ? 'Optional' : null,
			count: null,
			isLocked: step.isLocked
		};
	});
}

/** The count for `link`, or `null` when the phase counts something else or nothing. */
function countFor(count: SidebarCount | null, link: SidebarCount['link']): number | null {
	if (count === null || count.link !== link || count.value === 0) {
		return null;
	}

	return count.value;
}

/** The groups of the sidebar, in the order they are drawn. */
export function manageSidebarGroups(input: ManageSidebarInput): ManageSidebarGroup[] {
	const { slug, pathname, setupSteps, count, permissions } = input;
	const applicationsHref = manageApplicationsUrl(slug);
	const delegationsHref = manageDelegationsUrl(slug);
	const allocationHref = manageAllocationUrl(slug);
	const scheduleHref = manageScheduleUrl(slug);
	const announcementsHref = manageAnnouncementsUrl(slug);
	const documentsHref = manageDocumentsUrl(slug);
	const participantsHref = manageParticipantsUrl(slug);
	const awardsHref = manageAwardsUrl(slug);

	const groups: ManageSidebarGroup[] = [];

	// The numbered steps lead through Details first, so they are for somebody
	// who may open it. Anybody else sees a draft the way a published
	// conference looks, with the dashboard and the links they may follow.
	const shownSetupSteps =
		setupSteps !== null && mayOpenManagePage(permissions, 'details') ? setupSteps : null;

	// A draft has no dashboard for somebody who sets it up: `/manage/[slug]`
	// sends them to their next step instead. "Dashboard" is `/manage/[slug]`
	// itself, so whether it is the current page is an exact match: a section
	// test would keep it marked on every page.
	if (shownSetupSteps === null) {
		const dashboardHref = manageConferenceUrl(slug);
		const dashboard = iconLink(
			'Dashboard',
			dashboardHref,
			LayoutDashboard,
			isCurrentPage(dashboardHref, pathname)
		);
		groups.push({ heading: null, links: [dashboard] });
	}

	const setupLinks =
		shownSetupSteps === null
			? setupIconLinks(slug, pathname, permissions)
			: setupStepLinks(shownSetupSteps, pathname);
	groups.push({ heading: 'Set up', links: setupLinks });

	// One application's and one delegation's review pages keep their link marked.
	const applications = iconLink(
		'Applications',
		applicationsHref,
		Inbox,
		isInSection(applicationsHref, pathname)
	);
	const allocation = iconLink(
		'Allocation',
		allocationHref,
		LayoutGrid,
		isCurrentPage(allocationHref, pathname)
	);
	groups.push({
		heading: 'Applications',
		links: [
			{ ...applications, count: countFor(count, 'applications') },
			iconLink('Delegations', delegationsHref, School, isInSection(delegationsHref, pathname)),
			{ ...allocation, count: countFor(count, 'allocation') }
		]
	});

	groups.push({
		heading: 'The conference',
		links: [
			iconLink('Schedule', scheduleHref, CalendarDays, isCurrentPage(scheduleHref, pathname)),
			iconLink(
				'Announcements',
				announcementsHref,
				Megaphone,
				isCurrentPage(announcementsHref, pathname)
			),
			iconLink('Documents', documentsHref, Files, isCurrentPage(documentsHref, pathname)),
			iconLink('Participants', participantsHref, Contact, isCurrentPage(participantsHref, pathname))
		]
	});

	const awards = iconLink('Awards', awardsHref, Award, isCurrentPage(awardsHref, pathname));
	groups.push({ heading: 'After', links: [{ ...awards, count: countFor(count, 'awards') }] });

	const permittedGroups = groups.map((group) => ({
		heading: group.heading,
		links: group.links.filter((link) => mayFollowLink(permissions, link.href))
	}));

	return permittedGroups.filter((group) => group.links.length > 0);
}

/** The link the reader is on, which the phone's menu button names. */
export function activeSidebarLink(groups: ManageSidebarGroup[]): ManageSidebarLink | undefined {
	const allLinks = groups.flatMap((group) => group.links);

	return allLinks.find((link) => link.isActive);
}

/**
 * What the phone's menu button says: the page being shown ("Dashboard"), with
 * a draft's step number in front ("Step 3 of 6 · Application form"), or
 * "Manage" on a page the sidebar has no line for.
 */
export function phoneMenuLabel(active: ManageSidebarLink | undefined): string {
	if (active === undefined) {
		return 'Manage';
	}

	if (active.marker.kind === 'step') {
		return `Step ${active.marker.number} of ${SETUP_STEP_COUNT} · ${active.label}`;
	}

	return active.label;
}
