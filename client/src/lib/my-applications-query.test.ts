import { describe, expect, it } from 'vitest';
import type { ApplicationCard, ApplicationCardConference } from './application-cards';
import {
	APPLICATION_SORTS,
	APPLICATION_TABS,
	countApplicationTabs,
	EMPTY_MY_APPLICATIONS_QUERY,
	noMatchingApplicationsMessage,
	parseMyApplicationsQuery,
	visibleApplicationCards,
	type ApplicationTab,
	type MyApplicationsQuery
} from './my-applications-query';
import { applicationUrl } from './urls';

/** A conference as a card shows it, named and dated for the tests about order. */
function cardConference(name: string, startDate: string): ApplicationCardConference {
	return {
		name,
		bannerPath: null,
		startDate,
		endDate: startDate,
		place: null,
		countryCode: null
	};
}

/**
 * A card for a test to change a few fields of. The functions tested here only
 * read the stage, whether the card is past, the conference's name and first
 * day, when the card last changed and its search text. Everything else is
 * filled with plain values so that the object is a whole `ApplicationCard`.
 */
function applicationCard(changes: Partial<ApplicationCard> = {}): ApplicationCard {
	return {
		id: 'application-1',
		kind: 'individual',
		conference: cardConference('DelftMUN 2027', '2027-02-12'),
		stage: 'underReview',
		isPast: false,
		status: { label: 'Under review', tone: 'warning' },
		progress: { tone: 'warning', steps: [], connectors: [] },
		details: {
			title: 'Delegate application',
			line: 'Submitted 8 Sept 2026',
			seat: null,
			materials: []
		},
		action: {
			tone: 'neutral',
			icon: 'clock',
			title: 'No action required',
			description: null,
			primary: null,
			secondary: {
				label: 'View application',
				href: applicationUrl('application-1'),
				look: 'outline',
				hasUploadIcon: false,
				hasArrow: true
			}
		},
		updatedAt: '2026-09-08T10:00:00Z',
		searchText: 'delftmun 2027',
		...changes
	};
}

/** The ids of some cards, in their order, which is what most tests below compare. */
function idsOf(cards: ApplicationCard[]): string[] {
	return cards.map((card) => card.id);
}

/** The query for one tab, with no search and the default order. */
function queryForTab(tab: ApplicationTab): MyApplicationsQuery {
	return { ...EMPTY_MY_APPLICATIONS_QUERY, tab };
}

describe('parseMyApplicationsQuery', () => {
	it('gives the default query for an address with nothing in it', () => {
		expect(parseMyApplicationsQuery(new URLSearchParams())).toEqual(EMPTY_MY_APPLICATIONS_QUERY);
	});

	it('reads the search, the tab and the order', () => {
		const params = new URLSearchParams('q=un&show=accepted&sort=name');

		expect(parseMyApplicationsQuery(params)).toEqual({ q: 'un', tab: 'accepted', sort: 'name' });
	});

	it('trims the spaces around the search', () => {
		const params = new URLSearchParams({ q: '  delft mun  ' });

		expect(parseMyApplicationsQuery(params).q).toBe('delft mun');
	});

	it('falls back to "All" and "Most recent" for a tab and an order it does not know', () => {
		const params = new URLSearchParams('show=everything&sort=oldest');

		expect(parseMyApplicationsQuery(params)).toEqual(EMPTY_MY_APPLICATIONS_QUERY);
	});

	it('reads the tab from `show`, not from `tab`', () => {
		const params = new URLSearchParams('tab=past');

		expect(parseMyApplicationsQuery(params).tab).toBe('all');
	});

	it('reads every tab and every order the page offers', () => {
		for (const option of APPLICATION_TABS) {
			const params = new URLSearchParams({ show: option.tab });

			expect(parseMyApplicationsQuery(params).tab).toBe(option.tab);
		}

		for (const option of APPLICATION_SORTS) {
			const params = new URLSearchParams({ sort: option.sort });

			expect(parseMyApplicationsQuery(params).sort).toBe(option.sort);
		}
	});
});

/**
 * One card in each stage at a conference still to come, and one accepted card
 * at a conference that is over. The conferences are named in the order the
 * cards are listed, so sorting by name keeps them in this order.
 */
const CARDS_IN_EVERY_STAGE: ApplicationCard[] = [
	applicationCard({
		id: 'needs-action',
		stage: 'needsAction',
		conference: cardConference('AthensMUN 2027', '2027-02-12')
	}),
	applicationCard({
		id: 'under-review',
		stage: 'underReview',
		conference: cardConference('BerlinMUN 2027', '2027-02-12')
	}),
	applicationCard({
		id: 'accepted',
		stage: 'accepted',
		conference: cardConference('CairoMUN 2027', '2027-02-12')
	}),
	applicationCard({
		id: 'withdrawn',
		stage: 'other',
		conference: cardConference('DelftMUN 2027', '2027-02-12')
	}),
	applicationCard({
		id: 'past',
		stage: 'accepted',
		isPast: true,
		conference: cardConference('EdinburghMUN 2026', '2026-03-12')
	})
];

describe('visibleApplicationCards: the tabs', () => {
	/** The query for one tab, sorted by name so the expected order is easy to read. */
	function sortedByNameOn(tab: ApplicationTab): MyApplicationsQuery {
		return { q: '', tab, sort: 'name' };
	}

	it('shows every card still to come under "All", whatever its stage', () => {
		const visible = visibleApplicationCards(CARDS_IN_EVERY_STAGE, sortedByNameOn('all'));

		expect(idsOf(visible)).toEqual(['needs-action', 'under-review', 'accepted', 'withdrawn']);
	});

	it('shows only the cards whose conference is over under "Past"', () => {
		const visible = visibleApplicationCards(CARDS_IN_EVERY_STAGE, sortedByNameOn('past'));

		expect(idsOf(visible)).toEqual(['past']);
	});

	it('shows only the cards that need action under "Needs action"', () => {
		const visible = visibleApplicationCards(CARDS_IN_EVERY_STAGE, sortedByNameOn('needs-action'));

		expect(idsOf(visible)).toEqual(['needs-action']);
	});

	it('shows only the cards under review under "Under review"', () => {
		const visible = visibleApplicationCards(CARDS_IN_EVERY_STAGE, sortedByNameOn('under-review'));

		expect(idsOf(visible)).toEqual(['under-review']);
	});

	it('leaves an accepted card at a past conference out of "Accepted"', () => {
		const visible = visibleApplicationCards(CARDS_IN_EVERY_STAGE, sortedByNameOn('accepted'));

		expect(idsOf(visible)).toEqual(['accepted']);
	});
});

describe('visibleApplicationCards: the search', () => {
	const DELFT_CARD = applicationCard({
		id: 'delft',
		searchText: 'delftmun 2027 amsterdam, netherlands accepted unhrc france'
	});
	const LSE_CARD = applicationCard({
		id: 'lse',
		conference: cardConference('LSE MUN 2027', '2027-03-04'),
		searchText: 'lse mun 2027 london, united kingdom under review'
	});
	const BOTH_CARDS = [DELFT_CARD, LSE_CARD];

	/** The query for a search under "All", in the default order. */
	function searchFor(words: string): MyApplicationsQuery {
		return { ...EMPTY_MY_APPLICATIONS_QUERY, q: words };
	}

	it('finds a card that has every word of the search, in any order', () => {
		const visible = visibleApplicationCards(BOTH_CARDS, searchFor('france delftmun'));

		expect(idsOf(visible)).toEqual(['delft']);
	});

	it('ignores upper and lower case', () => {
		const visible = visibleApplicationCards(BOTH_CARDS, searchFor('LONDON'));

		expect(idsOf(visible)).toEqual(['lse']);
	});

	it('leaves out a card that is missing one of the words', () => {
		const visible = visibleApplicationCards(BOTH_CARDS, searchFor('delftmun london'));

		expect(visible).toEqual([]);
	});

	it('matches part of a word, and does not mind several spaces between words', () => {
		const visible = visibleApplicationCards(BOTH_CARDS, searchFor('amster   unhrc'));

		expect(idsOf(visible)).toEqual(['delft']);
	});

	it('still hides a past card that matches the search under "All"', () => {
		const pastDelft = { ...DELFT_CARD, id: 'past-delft', isPast: true };

		const visible = visibleApplicationCards([pastDelft, LSE_CARD], searchFor('delftmun'));

		expect(visible).toEqual([]);
	});
});

describe('visibleApplicationCards: the order', () => {
	// Each order puts these three cards in a different sequence, so every test
	// below proves that its own order was used.
	const BERLIN = applicationCard({
		id: 'berlin',
		conference: cardConference('BerlinMUN 2027', '2027-02-01'),
		updatedAt: '2026-09-10T10:00:00Z'
	});
	const ATHENS = applicationCard({
		id: 'athens',
		conference: cardConference('AthensMUN 2027', '2027-04-01'),
		updatedAt: '2026-09-20T10:00:00Z'
	});
	const CAIRO = applicationCard({
		id: 'cairo',
		conference: cardConference('CairoMUN 2027', '2027-03-01'),
		updatedAt: '2026-09-01T10:00:00Z'
	});
	const THREE_CARDS = [BERLIN, ATHENS, CAIRO];

	/** The query for one order, with no search, under "All". */
	function sortedBy(sort: MyApplicationsQuery['sort']): MyApplicationsQuery {
		return { ...EMPTY_MY_APPLICATIONS_QUERY, sort };
	}

	it('puts the most recently changed card first under "Most recent"', () => {
		const visible = visibleApplicationCards(THREE_CARDS, sortedBy('recent'));

		expect(idsOf(visible)).toEqual(['athens', 'berlin', 'cairo']);
	});

	it('puts the soonest conference first under "Conference date"', () => {
		const visible = visibleApplicationCards(THREE_CARDS, sortedBy('conference-date'));

		expect(idsOf(visible)).toEqual(['berlin', 'cairo', 'athens']);
	});

	it('puts the conferences in alphabetical order under "Name"', () => {
		const visible = visibleApplicationCards(THREE_CARDS, sortedBy('name'));

		expect(idsOf(visible)).toEqual(['athens', 'berlin', 'cairo']);
	});

	it('breaks a tie in "Most recent" by the conference name', () => {
		const zagreb = applicationCard({
			id: 'zagreb',
			conference: cardConference('ZagrebMUN 2027', '2027-02-01'),
			updatedAt: '2026-09-10T10:00:00Z'
		});
		const oslo = applicationCard({
			id: 'oslo',
			conference: cardConference('OsloMUN 2027', '2027-05-01'),
			updatedAt: '2026-09-10T10:00:00Z'
		});

		const visible = visibleApplicationCards([zagreb, oslo], sortedBy('recent'));

		expect(idsOf(visible)).toEqual(['oslo', 'zagreb']);
	});

	it('breaks a tie in "Conference date" by the conference name', () => {
		const zagreb = applicationCard({
			id: 'zagreb',
			conference: cardConference('ZagrebMUN 2027', '2027-02-01')
		});
		const oslo = applicationCard({
			id: 'oslo',
			conference: cardConference('OsloMUN 2027', '2027-02-01')
		});

		const visible = visibleApplicationCards([zagreb, oslo], sortedBy('conference-date'));

		expect(idsOf(visible)).toEqual(['oslo', 'zagreb']);
	});

	it('puts a card that does not know when it last changed last under "Most recent"', () => {
		// A delegation whose dates could not be read has an empty `updatedAt`.
		const undated = { ...ATHENS, id: 'undated', updatedAt: '' };

		const visible = visibleApplicationCards([undated, CAIRO], sortedBy('recent'));

		expect(idsOf(visible)).toEqual(['cairo', 'undated']);
	});

	it('leaves the list it was given in its own order', () => {
		const cards = [BERLIN, ATHENS, CAIRO];

		visibleApplicationCards(cards, sortedBy('name'));

		expect(idsOf(cards)).toEqual(['berlin', 'athens', 'cairo']);
	});
});

describe('countApplicationTabs', () => {
	const CARDS = [
		applicationCard({ id: 'delft-needs', stage: 'needsAction', searchText: 'delftmun 2027' }),
		applicationCard({ id: 'lse-needs', stage: 'needsAction', searchText: 'lse mun 2027' }),
		applicationCard({ id: 'delft-accepted', stage: 'accepted', searchText: 'delftmun 2027' }),
		applicationCard({
			id: 'delft-past',
			stage: 'underReview',
			isPast: true,
			searchText: 'delftmun 2026'
		})
	];

	it('counts the cards in each stage, leaving out those whose conference is over', () => {
		expect(countApplicationTabs(CARDS, '')).toEqual({
			'needs-action': 2,
			'under-review': 0,
			accepted: 1
		});
	});

	it('counts only the cards the search matches', () => {
		expect(countApplicationTabs(CARDS, 'delftmun')).toEqual({
			'needs-action': 1,
			'under-review': 0,
			accepted: 1
		});
	});

	it('counts nothing when the search matches nothing', () => {
		expect(countApplicationTabs(CARDS, 'berlin')).toEqual({
			'needs-action': 0,
			'under-review': 0,
			accepted: 0
		});
	});
});

describe('noMatchingApplicationsMessage', () => {
	it('offers to clear a search that matched nothing, keeping the tab and the order', () => {
		const query: MyApplicationsQuery = { q: 'berlin', tab: 'accepted', sort: 'name' };

		expect(noMatchingApplicationsMessage(query)).toEqual({
			title: 'No applications match "berlin".',
			description: 'Search for a conference, committee, country or status.',
			actionLabel: 'Clear search',
			actionQuery: { q: '', tab: 'accepted', sort: 'name' }
		});
	});

	it('points to "Past" when "All" is empty, because every conference is over', () => {
		expect(noMatchingApplicationsMessage(queryForTab('all'))).toEqual({
			title: 'No upcoming conferences.',
			description: 'Your applications to conferences that are over are under Past.',
			actionLabel: 'Show past applications',
			actionQuery: { q: '', tab: 'past', sort: 'recent' }
		});
	});

	it('says why an empty "Needs action" tab is empty and offers every application', () => {
		expect(noMatchingApplicationsMessage(queryForTab('needs-action'))).toEqual({
			title: 'Nothing needs your attention.',
			description: 'An application that is waiting for you appears here.',
			actionLabel: 'Show all applications',
			actionQuery: EMPTY_MY_APPLICATIONS_QUERY
		});
	});

	it('keeps the order the reader picked on the way out of an empty tab', () => {
		const emptyPast: MyApplicationsQuery = { q: '', tab: 'past', sort: 'name' };
		const emptyAll: MyApplicationsQuery = { q: '', tab: 'all', sort: 'conference-date' };

		expect(noMatchingApplicationsMessage(emptyPast).actionQuery).toEqual({
			q: '',
			tab: 'all',
			sort: 'name'
		});
		expect(noMatchingApplicationsMessage(emptyAll).actionQuery).toEqual({
			q: '',
			tab: 'past',
			sort: 'conference-date'
		});
	});

	it('offers every application from each other empty tab', () => {
		const otherTabs: ApplicationTab[] = ['under-review', 'accepted', 'past'];

		for (const tab of otherTabs) {
			const message = noMatchingApplicationsMessage(queryForTab(tab));

			expect(message.actionLabel).toBe('Show all applications');
			expect(message.actionQuery).toEqual(EMPTY_MY_APPLICATIONS_QUERY);
		}
	});
});
