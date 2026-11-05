import type { Locator, Page } from '@playwright/test';
import { signIn, type TestUser } from './signed-in-user';

// Holding a journey to its click budget (`specs/03-design/streamlining/design.md`,
// "Click budgets"). A budget test walks a journey from signing in, the way a
// person would, through `ClickBudgetJourney` below, which counts as it goes by
// the audit's rules (`specs/03-design/streamlining/audit.md`, "How it counts"):
//
// - a journey of an existing account starts on `/login`, and signing in costs
//   1 page, 1 click and 2 typed fields; a new account's starts on the page the
//   person opened, such as `/register`, which is its first page;
// - every activation of a link, button, tab, checkbox, radio button or menu is a
//   click, and so is choosing an option in a `<select>` or pressing Enter to
//   submit;
// - every text field the person must type into is a typed field;
// - every change of the path (the address before `?`) is a page, a redirect the
//   person lands on included; a change of only the query or the `#hash` is not,
//   and coming back to a page counts again.
//
// Decisions are the one measure a script cannot see: whether a first-time user
// has to choose or guess is a person's judgement. A test that knows its path
// holds one says so with `decide()`, and a budget of 0 decisions is only as
// good as the test's honesty about its own path.
//
// The counting itself is the plain functions at the top, so
// `click-budget.harness.test.ts` can check it without a browser.

/** The four measures of a journey, in the order the budget tables write them. */
export type JourneyCount = {
	clicks: number;
	pages: number;
	typedFields: number;
	decisions: number;
};

/** A journey's count so far, and the path of the page it is on. */
export type JourneyTally = {
	count: JourneyCount;
	/** The path of the page the journey is on, such as `/home`. */
	currentPath: string;
};

/** What signing in costs, by the audit's rules: the `/login` page, two fields, one click. */
export const SIGN_IN_COST: JourneyCount = { clicks: 1, pages: 1, typedFields: 2, decisions: 0 };

/** The tally of a journey that has just been signed in on `/login`. */
export function startFromSignIn(): JourneyTally {
	return { count: { ...SIGN_IN_COST }, currentPath: '/login' };
}

/**
 * The tally of a journey that starts on a page the person opened themselves,
 * such as `/register` for a new account (budget 4): that one page, and nothing
 * done on it yet.
 */
export function startOnPage(address: string): JourneyTally {
	return {
		count: { clicks: 0, pages: 1, typedFields: 0, decisions: 0 },
		currentPath: pathOf(address)
	};
}

/** The tally after one more click. */
export function addClick(tally: JourneyTally): JourneyTally {
	return { ...tally, count: { ...tally.count, clicks: tally.count.clicks + 1 } };
}

/** The tally after one more field has been typed into. */
export function addTypedField(tally: JourneyTally): JourneyTally {
	return { ...tally, count: { ...tally.count, typedFields: tally.count.typedFields + 1 } };
}

/** The tally after one more decision. */
export function addDecision(tally: JourneyTally): JourneyTally {
	return { ...tally, count: { ...tally.count, decisions: tally.count.decisions + 1 } };
}

/**
 * The path of an address: `/conferences` for
 * `http://localhost:4173/conferences?q=Hague#top`. The base only lets a path on
 * its own, such as `/home`, be read the same way.
 */
export function pathOf(address: string): string {
	return new URL(address, 'http://localhost').pathname;
}

/**
 * The tally once the browser has arrived at an address. A new path is a new
 * page; the same path with another query or `#hash` is not.
 */
export function addArrival(tally: JourneyTally, address: string): JourneyTally {
	const path = pathOf(address);

	if (path === tally.currentPath) {
		return tally;
	}

	return { count: { ...tally.count, pages: tally.count.pages + 1 }, currentPath: path };
}

/**
 * Every measure of `count` over its `budget`, written the way a failed test
 * should say it, such as "clicks: 7, over the budget of 6". Empty when the
 * journey kept to its budget, because a budget is a ceiling.
 */
export function measuresOverBudget(count: JourneyCount, budget: JourneyCount): string[] {
	const measures: (keyof JourneyCount)[] = ['clicks', 'pages', 'typedFields', 'decisions'];
	const overBudget = measures.filter((measure) => count[measure] > budget[measure]);

	return overBudget.map(
		(measure) => `${measure}: ${count[measure]}, over the budget of ${budget[measure]}`
	);
}

/**
 * One journey in a real browser, counted as it is walked.
 *
 * Start one with `ClickBudgetJourney.signIn`, or with `ClickBudgetJourney.fromPage`
 * for a journey that starts signed out, walk it with `click`, `type`, `press`,
 * `choose` and `chooseFile` in place of Playwright's own, wait for the last page the way any
 * test does, then call `expectWithinBudget`. Pages are counted by listening to
 * the browser itself, so a redirect or SvelteKit's in-app navigation counts the
 * same as a link to another page.
 */
export class ClickBudgetJourney {
	private tally: JourneyTally;

	private constructor(page: Page, start: JourneyTally) {
		this.tally = addArrival(start, page.url());

		// `framenavigated` fires for every new address the tab shows, the ones
		// SvelteKit writes into the address bar without a page load included.
		// Only the tab's own frame counts; an `<iframe>` changing is not a page.
		page.on('framenavigated', (frame) => {
			if (frame === page.mainFrame()) {
				this.tally = addArrival(this.tally, frame.url());
			}
		});
	}

	/**
	 * Sign `account` in through the real form and start counting, with signing
	 * in already counted and the page it lands on (`/home` or `/welcome`) as the
	 * journey's second page.
	 */
	static async signIn(page: Page, account: TestUser): Promise<ClickBudgetJourney> {
		await signIn(page, account);

		return new ClickBudgetJourney(page, startFromSignIn());
	}

	/**
	 * Start counting on the page the tab is showing, with that page as the
	 * journey's first and nothing else counted. The test opens the page itself,
	 * such as `/register`, because a person reaches it from outside the app.
	 */
	static fromPage(page: Page): ClickBudgetJourney {
		return new ClickBudgetJourney(page, startOnPage(page.url()));
	}

	/** Click a link, button, tab, checkbox or menu, and count it. */
	async click(target: Locator): Promise<void> {
		await target.click();
		this.tally = addClick(this.tally);
	}

	/** Type into a field the person has to fill in, and count it. */
	async type(field: Locator, text: string): Promise<void> {
		await field.fill(text);
		this.tally = addTypedField(this.tally);
	}

	/**
	 * Press a key in a field, such as Enter in a search box to search, which the
	 * audit counts as one click: it is the press that does what a button would.
	 */
	async press(field: Locator, key: string): Promise<void> {
		await field.press(key);
		this.tally = addClick(this.tally);
	}

	/** Choose an option in a `<select>`, which the audit counts as one click. */
	async choose(select: Locator, optionLabel: string): Promise<void> {
		await select.selectOption({ label: optionLabel });
		this.tally = addClick(this.tally);
	}

	/**
	 * Hand a file box a file, which the audit counts as one click: the person
	 * presses the box and picks the file.
	 */
	async chooseFile(input: Locator, file: Parameters<Locator['setInputFiles']>[0]): Promise<void> {
		await input.setInputFiles(file);
		this.tally = addClick(this.tally);
	}

	/** Count a point where a first-time user has to choose or guess. */
	decide(): void {
		this.tally = addDecision(this.tally);
	}

	/** The count so far, for a test that wants to look at one measure. */
	count(): JourneyCount {
		return { ...this.tally.count };
	}

	/**
	 * Fail the test, naming every measure over it, when the journey broke its
	 * budget. It throws a plain error rather than calling Playwright's `expect`,
	 * so that this file loads without Playwright's test runner, which the
	 * harness test needs.
	 */
	expectWithinBudget(budget: JourneyCount): void {
		const count = this.count();
		const overBudget = measuresOverBudget(count, budget);

		if (overBudget.length > 0) {
			throw new Error(`Over the click budget. ${overBudget.join('; ')}.`);
		}
	}
}
