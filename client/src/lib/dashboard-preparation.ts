/**
 * The "Before the first day" list of the dashboard while seats are given: the
 * last things to have ready before delegates arrive, ticked once they are
 * (`specs/05-pages/organiser/dashboard.md`, "Allocation").
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import type { ResolvedPathname } from '$app/types';
import type { ManagedCommittee } from '$lib/committees';
import { countOf } from '$lib/dashboard-words';
import { manageAnnouncementsUrl, manageDocumentsUrl, manageScheduleUrl } from '$lib/urls';

/** One line of the list. A line that is done has no link: there is nothing left to open. */
export type PreparationItem = {
	/** Fixed and distinct within the list, so the list can be keyed by it. */
	key: string;
	text: string;
	isDone: boolean;
	/** Where the work is done, or `null` once it is. */
	link: { label: string; href: ResolvedPathname } | null;
};

/** "Programme is public", or the line asking for it, with the schedule to do it on. */
function programmeItem(isProgrammePublic: boolean, slug: string): PreparationItem {
	if (isProgrammePublic) {
		return { key: 'programme', text: 'Programme is public', isDone: true, link: null };
	}

	return {
		key: 'programme',
		text: 'Make the programme public',
		isDone: false,
		link: { label: 'Schedule', href: manageScheduleUrl(slug) }
	};
}

/** "Background guides uploaded", or how many committees still have none. */
function guidesItem(committees: ManagedCommittee[], slug: string): PreparationItem {
	const withoutGuide = committees.filter((committee) => !committee.hasBackgroundGuide);

	if (withoutGuide.length === 0) {
		return { key: 'guides', text: 'Background guides uploaded', isDone: true, link: null };
	}

	const committeesWithout = countOf(withoutGuide.length, 'committee has', 'committees have');

	return {
		key: 'guides',
		text: `${committeesWithout} no background guide`,
		isDone: false,
		link: { label: 'Background guides', href: manageDocumentsUrl(slug, { tab: 'guides' }) }
	};
}

/**
 * The list for a conference in Allocation. The last line is never ticked: an
 * announcement saying where to register is the organiser's to judge, and no
 * column records that it was sent.
 */
export function preparationItems(
	committees: ManagedCommittee[],
	isProgrammePublic: boolean,
	slug: string
): PreparationItem[] {
	const items = [programmeItem(isProgrammePublic, slug)];

	if (committees.length > 0) {
		items.push(guidesItem(committees, slug));
	}

	items.push({
		key: 'register',
		text: 'Tell delegates where to register',
		isDone: false,
		link: { label: 'Write announcement', href: manageAnnouncementsUrl(slug) }
	});

	return items;
}
