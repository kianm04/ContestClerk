/**
 * The lines of the "…" menu on one award of the organiser's awards page
 * (`/manage/[slug]/awards`). Kept apart from `$lib/awards.ts` because it builds
 * addresses with `$lib/urls.ts`, and the chair's pages have no such menu.
 */

import type { DropdownItem } from '$lib/components/Dropdown.svelte';
import type { Award } from '$lib/awards';
import { manageAwardsUrl } from '$lib/urls';

/** What the menu needs to know about the reader and the page, beside the award. */
export type AwardMenuContext = {
	/** The conference's slug, for the "Edit title" link. */
	slug: string;
	/** Whether the conference's awards are published. Nothing can change then. */
	isPublished: boolean;
	/** Whether the reader may rename this award: a custom award they added. */
	canRename: boolean;
	/** Whether this award's "Edit title" form is already open. */
	isRenaming: boolean;
};

/**
 * The menu lines for one award, leaving out any that would do nothing:
 * "Unconfirm" only for a confirmed award, and "Edit title" only for an award
 * the reader may rename whose form is not open yet. Once the awards are
 * published the list is empty, and the page shows no menu at all.
 *
 * "Unconfirm" posts the award's id to the `unconfirm` action from the menu's
 * own form. "Edit title" is a link, `?edit=<id>`, that opens the form under
 * the row without JavaScript.
 */
export function organiserAwardMenu(award: Award, context: AwardMenuContext): DropdownItem[] {
	if (context.isPublished) {
		return [];
	}

	const items: DropdownItem[] = [];

	if (award.status === 'confirmed') {
		items.push({ label: 'Unconfirm', formaction: '?/unconfirm', name: 'awardId', value: award.id });
	}

	if (context.canRename && !context.isRenaming) {
		items.push({ label: 'Edit title', href: manageAwardsUrl(context.slug, award.id) });
	}

	return items;
}
