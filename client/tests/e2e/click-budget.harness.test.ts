import type { Frame, Locator, Page } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';
import {
	addArrival,
	addClick,
	addDecision,
	addTypedField,
	ClickBudgetJourney,
	measuresOverBudget,
	pathOf,
	SIGN_IN_COST,
	startFromSignIn,
	startOnPage,
	type JourneyCount
} from './click-budget';
import type { TestUser } from './signed-in-user';

// The counting the click-budget tests rely on, checked without a browser. The
// rules are `specs/03-design/streamlining/audit.md`'s "How it counts". The
// journey class at the end is walked with a stand-in for Playwright's `Page`,
// because a real browser would bring the whole app with it and prove nothing
// more about the counting. See specs/02-architecture/testing.md.

// Signing in through the real form needs the app and the database. The stand-in
// does nothing, and the stand-in page below is already "on" `/home`.
vi.mock('./signed-in-user', () => ({ signIn: vi.fn(async () => undefined) }));

const ACCOUNT: TestUser = { id: 'user-1', email: 'reader@example.com', fullName: 'Reader' };

/** A budget with room for everything, which a test lowers one measure of. */
const WIDE_BUDGET: JourneyCount = { clicks: 99, pages: 99, typedFields: 99, decisions: 99 };

describe('startFromSignIn', () => {
	it('counts signing in as the audit does: one page, one click and two typed fields', () => {
		const tally = startFromSignIn();

		expect(tally.count).toEqual({ clicks: 1, pages: 1, typedFields: 2, decisions: 0 });
		expect(tally.currentPath).toBe('/login');
	});

	it('hands out a copy, so one journey cannot change the next one’s start', () => {
		const tally = addClick(startFromSignIn());

		expect(tally.count.clicks).toBe(2);
		expect(SIGN_IN_COST.clicks).toBe(1);
	});
});

describe('startOnPage', () => {
	it('counts the page a signed-out journey starts on, and nothing else', () => {
		const tally = startOnPage('http://localhost:4173/register?next=%2Fcreate');

		expect(tally.count).toEqual({ clicks: 0, pages: 1, typedFields: 0, decisions: 0 });
		expect(tally.currentPath).toBe('/register');
	});
});

describe('addArrival', () => {
	it('counts a new path as a new page', () => {
		const tally = addArrival(startFromSignIn(), 'http://localhost:4173/home');

		expect(tally.count.pages).toBe(2);
		expect(tally.currentPath).toBe('/home');
	});

	it('does not count a change of only the query string', () => {
		const onList = addArrival(startFromSignIn(), 'http://localhost:4173/conferences');
		const filtered = addArrival(onList, 'http://localhost:4173/conferences?q=Hague');

		expect(filtered.count.pages).toBe(2);
	});

	it('does not count a change of only the hash', () => {
		const onPage = addArrival(startFromSignIn(), 'http://localhost:4173/home');
		const scrolled = addArrival(onPage, 'http://localhost:4173/home#main');

		expect(scrolled.count.pages).toBe(2);
	});

	it('counts coming back to a page again', () => {
		const onHome = addArrival(startFromSignIn(), '/home');
		const onList = addArrival(onHome, '/conferences');
		const backHome = addArrival(onList, '/home');

		expect(backHome.count.pages).toBe(4);
	});
});

describe('addClick, addTypedField and addDecision', () => {
	it('each add one to their own measure and leave the others alone', () => {
		const tally = addDecision(addTypedField(addClick(startFromSignIn())));

		expect(tally.count).toEqual({ clicks: 2, pages: 1, typedFields: 3, decisions: 1 });
	});
});

describe('pathOf', () => {
	it('keeps the path and drops the query and the hash', () => {
		expect(pathOf('http://localhost:4173/manage/northbridge?tab=open#top')).toBe(
			'/manage/northbridge'
		);
	});

	it('reads a path on its own the same way', () => {
		expect(pathOf('/home')).toBe('/home');
	});
});

describe('measuresOverBudget', () => {
	it('is empty for a journey on its budget, because a budget is a ceiling', () => {
		const count: JourneyCount = { clicks: 3, pages: 3, typedFields: 2, decisions: 0 };

		expect(measuresOverBudget(count, count)).toEqual([]);
	});

	it('names every measure over its budget, with both numbers', () => {
		const count: JourneyCount = { clicks: 7, pages: 3, typedFields: 3, decisions: 1 };
		const budget: JourneyCount = { clicks: 6, pages: 3, typedFields: 2, decisions: 0 };

		expect(measuresOverBudget(count, budget)).toEqual([
			'clicks: 7, over the budget of 6',
			'typedFields: 3, over the budget of 2',
			'decisions: 1, over the budget of 0'
		]);
	});
});

/** A stand-in for the tab: it can be sent to an address, and tells its listeners. */
function makeStandInPage(startAddress: string): {
	page: Page;
	navigateTo: (address: string) => void;
} {
	const mainFrame = { url: () => currentAddress } as unknown as Frame;
	const otherFrame = { url: () => 'http://localhost:4173/embedded-map' } as unknown as Frame;
	const listeners: ((frame: Frame) => void)[] = [];
	let currentAddress = startAddress;

	const page = {
		url: () => currentAddress,
		mainFrame: () => mainFrame,
		on: (_event: string, listener: (frame: Frame) => void) => listeners.push(listener)
	} as unknown as Page;

	function navigateTo(address: string): void {
		currentAddress = address;

		for (const listener of listeners) {
			listener(otherFrame);
			listener(mainFrame);
		}
	}

	return { page, navigateTo };
}

/** A stand-in for a link or a field, which does nothing when used. */
function makeStandInLocator(): Locator {
	return {
		click: vi.fn(async () => undefined),
		fill: vi.fn(async () => undefined),
		press: vi.fn(async () => undefined),
		selectOption: vi.fn(async () => []),
		setInputFiles: vi.fn(async () => undefined)
	} as unknown as Locator;
}

describe('ClickBudgetJourney', () => {
	it('starts with signing in and the page it landed on counted', async () => {
		const { page } = makeStandInPage('http://localhost:4173/home');

		const journey = await ClickBudgetJourney.signIn(page, ACCOUNT);

		expect(journey.count()).toEqual({ clicks: 1, pages: 2, typedFields: 2, decisions: 0 });
	});

	it('counts clicks, typing, a choice from a list and the pages the tab moves to', async () => {
		const { page, navigateTo } = makeStandInPage('http://localhost:4173/home');
		const journey = await ClickBudgetJourney.signIn(page, ACCOUNT);

		await journey.click(makeStandInLocator());
		navigateTo('http://localhost:4173/conferences');
		await journey.type(makeStandInLocator(), 'Hague');
		await journey.choose(makeStandInLocator(), 'Netherlands');
		navigateTo('http://localhost:4173/conferences?q=Hague&country=NL');
		journey.decide();

		expect(journey.count()).toEqual({ clicks: 3, pages: 3, typedFields: 3, decisions: 1 });
	});

	it('starts on the page the tab shows, and counts choosing a file as a click', async () => {
		const { page, navigateTo } = makeStandInPage('http://localhost:4173/register');
		const journey = ClickBudgetJourney.fromPage(page);

		expect(journey.count()).toEqual({ clicks: 0, pages: 1, typedFields: 0, decisions: 0 });

		navigateTo('http://localhost:4173/welcome');
		await journey.chooseFile(makeStandInLocator(), 'banner.png');

		expect(journey.count()).toEqual({ clicks: 1, pages: 2, typedFields: 0, decisions: 0 });
	});

	it('counts pressing a key, such as Enter in a search box, as one click', async () => {
		const { page } = makeStandInPage('http://localhost:4173/conferences');
		const journey = ClickBudgetJourney.fromPage(page);
		const searchBox = makeStandInLocator();

		await journey.type(searchBox, 'Northbridge');
		await journey.press(searchBox, 'Enter');

		expect(searchBox.press).toHaveBeenCalledWith('Enter');
		expect(journey.count()).toEqual({ clicks: 1, pages: 1, typedFields: 1, decisions: 0 });
	});

	it('ignores an embedded frame moving, which is not a page of the journey', async () => {
		const { page, navigateTo } = makeStandInPage('http://localhost:4173/home');
		const journey = await ClickBudgetJourney.signIn(page, ACCOUNT);

		navigateTo('http://localhost:4173/home');

		expect(journey.count().pages).toBe(2);
	});

	it('passes a journey within its budget and fails one over it, naming the measure', async () => {
		const { page } = makeStandInPage('http://localhost:4173/home');
		const journey = await ClickBudgetJourney.signIn(page, ACCOUNT);

		expect(() => journey.expectWithinBudget(WIDE_BUDGET)).not.toThrow();
		expect(() => journey.expectWithinBudget({ ...WIDE_BUDGET, pages: 1 })).toThrow(
			'pages: 2, over the budget of 1'
		);
	});
});
