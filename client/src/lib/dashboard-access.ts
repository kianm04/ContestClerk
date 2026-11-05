/**
 * The conference dashboard cut down to what the reader may act on
 * (`docs/roles-and-permissions.md`, section 6: "The dashboard shows only the
 * cards and 'Needs attention' lines the reader may act on").
 *
 * The dashboard's `load` writes every figure, line and section first, as it
 * would for an administrator, and then hands them here: a figure goes when the
 * reader may not open the page it is counted from, a line or a section when it
 * leads to such a page. The pages themselves come from the table in
 * `$lib/manage-pages.ts`, so the dashboard and the pages cannot disagree.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import type { AttentionItem } from '$lib/dashboard-attention';
import type { DashboardFigure } from '$lib/dashboard-figures';
import type { QuietAction } from '$lib/dashboard-layout';
import type { PreparationItem } from '$lib/dashboard-preparation';
import type { DashboardSections } from '$lib/dashboard-sections';
import { mayReadInvoices } from '$lib/fees-access';
import { mayFollowLink, mayOpenManagePage } from '$lib/manage-pages';
import type { MyPermissions } from '$lib/permissions';

/** Everything on the dashboard that depends on who is reading it. */
export type DashboardContent = {
	figures: DashboardFigure[];
	attention: AttentionItem[];
	sections: DashboardSections;
	quietAction: QuietAction | null;
};

/**
 * The "Before the first day" lines the reader may act on. A line that is done
 * has no link and nothing left to do, so it stays for everybody.
 */
function preparationForReader(mine: MyPermissions, items: PreparationItem[]): PreparationItem[] {
	return items.filter((item) => item.link === null || mayFollowLink(mine, item.link.href));
}

/** The phase's sections, with each one whose page the reader may not open set to `null`. */
function sectionsForReader(mine: MyPermissions, sections: DashboardSections): DashboardSections {
	if (sections.phase === 'applications') {
		return {
			...sections,
			waiting: mayOpenManagePage(mine, 'applications') ? sections.waiting : null,
			committees: mayOpenManagePage(mine, 'committees') ? sections.committees : null
		};
	}

	if (sections.phase === 'allocation') {
		// While seats are given the committees section counts seats and links to
		// the allocation grid, so the grid is what it asks for.
		return {
			...sections,
			committees: mayOpenManagePage(mine, 'allocation') ? sections.committees : null,
			preparation: preparationForReader(mine, sections.preparation)
		};
	}

	if (sections.phase === 'conference-days') {
		// The rooms stay: watching a room is open to the whole team, and its
		// link to the chair console is checked by the console itself.
		return {
			...sections,
			today: mayOpenManagePage(mine, 'schedule') ? sections.today : null,
			mayPostAnnouncement: mayOpenManagePage(mine, 'announcements')
		};
	}

	return sections;
}

/**
 * May the reader see this figure? Yes when they may open the page it is
 * counted from. Every figure of the fees page is money, paid or outstanding,
 * and the fees page also opens for somebody who may only change the fee list,
 * so those figures ask for the invoices as well.
 */
function mayReadFigure(mine: MyPermissions, figure: DashboardFigure): boolean {
	if (figure.page === 'fees') {
		return mayReadInvoices(mine);
	}

	return mayOpenManagePage(mine, figure.page);
}

/** The dashboard as this reader may see it. */
export function dashboardForReader(
	mine: MyPermissions,
	content: DashboardContent
): DashboardContent {
	return {
		figures: content.figures.filter((figure) => mayReadFigure(mine, figure)),
		attention: content.attention.filter((item) => mayFollowLink(mine, item.href)),
		sections: sectionsForReader(mine, content.sections),
		// Unpublishing and archiving are done from the publish page's side of the
		// conference, so they ask what that page asks.
		quietAction: mayOpenManagePage(mine, 'publish') ? content.quietAction : null
	};
}
