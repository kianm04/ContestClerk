/**
 * The search box, the tabs and the sort order of `/applications`, all of which
 * live in the address, as `/applications?q=un&show=accepted&sort=name`. The
 * address is the single source of truth, the way it is on `/conferences`: the
 * controls go to a new address and `load` picks the cards out again.
 */

import type { ApplicationCard, ApplicationStage } from '$lib/application-cards';

/** The tabs over the list. "All" and each stage show conferences still to come; "Past" the rest. */
export type ApplicationTab = 'all' | 'needs-action' | 'under-review' | 'accepted' | 'past';

/** The orders the "Most recent" dropdown offers. */
export type ApplicationSort = 'recent' | 'conference-date' | 'name';

export type MyApplicationsQuery = {
	/** The search box's words, trimmed. */
	q: string;
	tab: ApplicationTab;
	sort: ApplicationSort;
};

/** The page with nothing chosen. `myApplicationsUrl` leaves these values out of the address. */
export const EMPTY_MY_APPLICATIONS_QUERY: MyApplicationsQuery = {
	q: '',
	tab: 'all',
	sort: 'recent'
};

/** Every tab in the order it is drawn, with its words. */
export const APPLICATION_TABS: { tab: ApplicationTab; label: string }[] = [
	{ tab: 'all', label: 'All' },
	{ tab: 'needs-action', label: 'Needs action' },
	{ tab: 'under-review', label: 'Under review' },
	{ tab: 'accepted', label: 'Accepted' },
	{ tab: 'past', label: 'Past' }
];

/** Every sort order in the order the dropdown lists it, with its words. */
export const APPLICATION_SORTS: { sort: ApplicationSort; label: string }[] = [
	{ sort: 'recent', label: 'Most recent' },
	{ sort: 'conference-date', label: 'Conference date' },
	{ sort: 'name', label: 'Name' }
];

/** How many cards each of the three counted tabs holds. */
export type ApplicationTabCounts = Record<'needs-action' | 'under-review' | 'accepted', number>;

/** The stage each counted tab shows. */
const TAB_STAGES: Record<keyof ApplicationTabCounts, ApplicationStage> = {
	'needs-action': 'needsAction',
	'under-review': 'underReview',
	accepted: 'accepted'
};

/** `?show=`, or "All" for anything that is not one of the tabs. */
function readTab(value: string | null): ApplicationTab {
	const match = APPLICATION_TABS.find((option) => option.tab === value);

	return match ? match.tab : 'all';
}

/** `?sort=`, or "Most recent" for anything that is not one of the orders. */
function readSort(value: string | null): ApplicationSort {
	const match = APPLICATION_SORTS.find((option) => option.sort === value);

	return match ? match.sort : 'recent';
}

/** Reads the page's address. Anything it does not recognise falls back to the default. */
export function parseMyApplicationsQuery(params: URLSearchParams): MyApplicationsQuery {
	return {
		q: params.get('q')?.trim() ?? '',
		tab: readTab(params.get('show')),
		sort: readSort(params.get('sort'))
	};
}

/** Whether the card has every word of the search in it, in any order. */
function matchesSearch(card: ApplicationCard, search: string): boolean {
	const words = search.toLowerCase().split(/\s+/).filter(Boolean);

	return words.every((word) => card.searchText.includes(word));
}

/** Whether the card belongs under this tab. */
function isInTab(card: ApplicationCard, tab: ApplicationTab): boolean {
	if (tab === 'past') {
		return card.isPast;
	}

	// Every tab but "Past" is about conferences still to come.
	if (card.isPast) {
		return false;
	}

	if (tab === 'all') {
		return true;
	}

	return card.stage === TAB_STAGES[tab];
}

/** -1, 0 or 1 for two cards in the chosen order; the conference name breaks every tie. */
function compareCards(
	first: ApplicationCard,
	second: ApplicationCard,
	sort: ApplicationSort
): number {
	const byName = first.conference.name.localeCompare(second.conference.name);

	if (sort === 'name') {
		return byName;
	}

	// Both are `YYYY-MM-DD` or ISO timestamps, so comparing them as text compares them as moments.
	const byOrder =
		sort === 'recent'
			? second.updatedAt.localeCompare(first.updatedAt)
			: first.conference.startDate.localeCompare(second.conference.startDate);

	return byOrder !== 0 ? byOrder : byName;
}

/** The cards that match the search, before the tab is applied. */
function searchedCards(cards: ApplicationCard[], search: string): ApplicationCard[] {
	if (search === '') {
		return cards;
	}

	return cards.filter((card) => matchesSearch(card, search));
}

/** The cards to draw: those matching the search, under the chosen tab, in the chosen order. */
export function visibleApplicationCards(
	cards: ApplicationCard[],
	query: MyApplicationsQuery
): ApplicationCard[] {
	const inTab = searchedCards(cards, query.q).filter((card) => isInTab(card, query.tab));

	return inTab.sort((first, second) => compareCards(first, second, query.sort));
}

/**
 * The numbers beside "Needs action", "Under review" and "Accepted". They count
 * what the search matches, so each number is what its tab would show.
 */
export function countApplicationTabs(
	cards: ApplicationCard[],
	search: string
): ApplicationTabCounts {
	const matching = searchedCards(cards, search);

	return {
		'needs-action': matching.filter((card) => isInTab(card, 'needs-action')).length,
		'under-review': matching.filter((card) => isInTab(card, 'under-review')).length,
		accepted: matching.filter((card) => isInTab(card, 'accepted')).length
	};
}

/** What the page says when the search or the tab leaves no card to show, and where it offers to go. */
export type NoMatchingApplicationsMessage = {
	title: string;
	description: string;
	actionLabel: string;
	/** The page to offer instead, for `myApplicationsUrl`. */
	actionQuery: MyApplicationsQuery;
};

/** The words for each tab with nothing under it, when nothing was searched for. */
const EMPTY_TAB_WORDS: Record<ApplicationTab, { title: string; description: string }> = {
	all: {
		title: 'No upcoming conferences.',
		description: 'Your applications to conferences that are over are under Past.'
	},
	'needs-action': {
		title: 'Nothing needs your attention.',
		description: 'An application that is waiting for you appears here.'
	},
	'under-review': {
		title: 'No applications under review.',
		description: "An application waiting for the organisers' decision appears here."
	},
	accepted: {
		title: 'No accepted applications yet.',
		description: 'Once the organisers accept an application, it appears here.'
	},
	past: {
		title: 'No past conferences.',
		description: 'Your applications to conferences that are over appear here.'
	}
};

/**
 * The message in place of the cards when the search or the tab matches none,
 * although the reader has applications. The page with no applications at all
 * has an empty state of its own.
 */
export function noMatchingApplicationsMessage(
	query: MyApplicationsQuery
): NoMatchingApplicationsMessage {
	if (query.q !== '') {
		return {
			title: `No applications match "${query.q}".`,
			description: 'Search for a conference, committee, country or status.',
			actionLabel: 'Clear search',
			actionQuery: { ...query, q: '' }
		};
	}

	// "All" has nothing only when every conference is over, so it points to
	// "Past". Like a tab, the way out keeps the order the reader picked.
	const actionTab: ApplicationTab = query.tab === 'all' ? 'past' : 'all';

	return {
		...EMPTY_TAB_WORDS[query.tab],
		actionLabel: query.tab === 'all' ? 'Show past applications' : 'Show all applications',
		actionQuery: { ...query, tab: actionTab }
	};
}
