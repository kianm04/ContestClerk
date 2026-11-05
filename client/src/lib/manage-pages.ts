/**
 * Which permission opens which page of the management area
 * (`docs/roles-and-permissions.md`, section 8, "Which permission opens which
 * page").
 *
 * The layout of `/manage/[slug]` lets a reader in when at least one of these
 * pages opens for them, each page's `load` checks its own line, the sidebar
 * leaves out the links the reader may not follow, and the dashboard leaves out
 * the lines and sections that would lead to one. All four read this one table,
 * so they cannot disagree.
 *
 * An area whose step of the build has not landed yet still asks
 * `administrator`, which is what the pages asked before roles existed. Each
 * step changes its own lines here.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import { mayFollowFeesLink } from '$lib/fees-access';
import { hasPermissionSomewhere, type MyPermissions, type Permission } from '$lib/permissions';

/**
 * A page of the management area, by the folder it lives in under
 * `/manage/[slug]`, except `roles`, which is the folder `team/roles`.
 */
export type ManagePage =
	| 'details'
	| 'publish'
	| 'application-form'
	| 'fees'
	| 'committees'
	| 'team'
	| 'roles'
	| 'applications'
	| 'delegations'
	| 'allocation'
	| 'participants'
	| 'schedule'
	| 'announcements'
	| 'documents'
	| 'awards';

/**
 * The permissions that open each page: holding any one of them is enough. A
 * permission that narrows to committees opens its page for somebody who holds
 * it only in their own committees, and the page then shows only those.
 */
export const MANAGE_PAGE_PERMISSIONS: Record<ManagePage, Permission[]> = {
	details: ['edit_conference'],
	publish: ['edit_conference'],
	'application-form': ['edit_conference'],
	// The fee list is `edit_conference`'s and the invoices `read_invoices`',
	// so either opens the page, which shows each reader their half
	// (`$lib/fees-access.ts`). `manage_invoices` includes reading.
	fees: ['edit_conference', 'read_invoices', 'manage_invoices'],
	// Narrows to committees too: a chair edits their own committees' description
	// and agenda, and only a conference-wide holder adds or deletes one.
	committees: ['manage_committees'],
	team: ['manage_team'],
	// `team/roles`, `team/roles/new` and one role's editor.
	roles: ['manage_roles'],
	// Reading opens all three; acting on them asks `decide_applications`, which
	// the role editor never saves without `read_applications`.
	applications: ['read_applications'],
	delegations: ['read_applications'],
	allocation: ['read_applications'],
	participants: ['read_participants'],
	// Both narrow to committees: a holder in one committee opens the page and
	// writes only what is addressed to their committees (`$lib/programme-access.ts`).
	schedule: ['edit_schedule'],
	announcements: ['send_announcements'],
	documents: ['manage_documents'],
	awards: ['confirm_awards']
};

/** Every page, in the order the table above lists them. */
const MANAGE_PAGES = Object.keys(MANAGE_PAGE_PERMISSIONS) as ManagePage[];

/** May the reader open this page? */
export function mayOpenManagePage(mine: MyPermissions, page: ManagePage): boolean {
	return MANAGE_PAGE_PERMISSIONS[page].some((key) => hasPermissionSomewhere(mine, key));
}

/**
 * Every permission that opens at least one page, each once. `/manage` and the
 * conference switcher ask the database which conferences the reader holds one
 * of these on, which is the same question `mayOpenManageArea` answers for one.
 */
export function permissionsOpeningManagePages(): Permission[] {
	return [...new Set(MANAGE_PAGES.flatMap((page) => MANAGE_PAGE_PERMISSIONS[page]))];
}

/**
 * May the reader open the management area at all, which is its dashboard?
 *
 * Section 4 opens it for anybody holding a permission. A permission that opens
 * none of the pages above, such as running a room, whose console lives under
 * the conference rather than here, would only lead to a dashboard with nothing
 * on it, which the spec's decision 6 rules out, so it does not count.
 */
export function mayOpenManageArea(mine: MyPermissions): boolean {
	return MANAGE_PAGES.some((page) => mayOpenManagePage(mine, page));
}

/**
 * The page of the management area a link leads to, or `null` for the
 * dashboard and for a link that leaves the area, such as a chair room.
 *
 * A link built by `resolve()` on the server can be relative
 * (`../manage/thimun-2027/fees`), so this looks for `manage/<slug>/` anywhere
 * in it rather than at the start. `published` is the page a publish lands on,
 * and belongs to Publish; `team/roles` and everything under it is Roles.
 */
export function managePageOfLink(href: string): ManagePage | 'dashboard' | null {
	const match = /(?:^|\/)manage\/[^/?#]+\/?([^/?#]*)\/?([^/?#]*)/.exec(href);

	if (match === null) {
		return null;
	}

	if (match[1] === 'team' && match[2] === 'roles') {
		return 'roles';
	}

	const folder = match[1] === 'published' ? 'publish' : match[1];

	if (folder === '') {
		return 'dashboard';
	}

	return MANAGE_PAGES.find((page) => page === folder) ?? null;
}

/**
 * May the reader follow this link? Yes for a page they may open, for the
 * dashboard, and for anything outside the management area, whose own page
 * decides. A link to one tab of the fees page asks what that tab needs.
 */
export function mayFollowLink(mine: MyPermissions, href: string): boolean {
	const page = managePageOfLink(href);

	if (page === null || page === 'dashboard') {
		return true;
	}

	if (page === 'fees') {
		// The base only lets a relative link be read; nothing here leaves the page.
		return mayFollowFeesLink(mine, new URL(href, 'http://localhost').searchParams);
	}

	return mayOpenManagePage(mine, page);
}
