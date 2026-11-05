import { expect, test, type Page } from '@playwright/test';

// A page arrives as finished HTML and works straight away, and a moment later
// its JavaScript lands and Svelte brings the page to life. Anything typed in
// that gap has to survive.
//
// It did not. Writing `value={...}` onto an input makes Svelte set that value as
// a DOM property the moment it brings the page to life, which overwrites
// whatever is in the box, so a visitor who started typing before the JavaScript
// arrived lost every word of it. The form components bind to their controls
// instead (`bind:value`, `bind:checked`, `bind:group`), which Svelte hydrates by
// taking what is already in the box. See `$lib/components/TextField.svelte`.
//
// This was also what made a whole browser run fail about half the time, which
// is what T59 was for: on a loaded machine the gap grows to seconds, `signIn`
// typed into the login form inside it, the email and the password were wiped,
// and the form would not submit because both fields are `required`. No request
// was ever sent, so the test waited out its full thirty seconds.

/** How long the entry script is held back, so the race is always lost. */
const JAVASCRIPT_DELAY_MS = 2000;

/** Long enough after that for Svelte to have finished bringing the page to life. */
const SETTLE_MS = 3000;

/**
 * How long an assertion may wait on a filter change that reads the database.
 *
 * Longer than the five seconds Playwright waits by default, for the reason
 * `tests/e2e/conferences.spec.ts` gives where it sets the same number: the
 * conference list is read while every other test in the run is reading it too.
 */
const DATABASE_TIMEOUT_MS = 15_000;

/**
 * Hold the app's entry script back, so every test below types into a page that
 * has arrived but is not alive yet.
 *
 * `page.route` lets a test answer the browser's requests itself. This one lets
 * the request through as usual, only later.
 */
async function delayTheJavaScript(page: Page): Promise<void> {
	await page.route('**/_app/immutable/entry/start.*.js', async (route) => {
		await new Promise((resolve) => setTimeout(resolve, JAVASCRIPT_DELAY_MS));
		await route.continue();
	});
}

/**
 * Every test here is about the moment a page comes to life, and a page with
 * scripting switched off never does, so there is nothing to prove on the
 * `desktop-no-js` project.
 */
function skipWithoutJavaScript(testInfo: { project: { use: { javaScriptEnabled?: boolean } } }) {
	test.skip(
		testInfo.project.use.javaScriptEnabled === false,
		'Nothing comes to life without JavaScript, so nothing can be written over.'
	);
}

/**
 * Open the conference directory's "Filters" disclosure, which starts closed on a
 * phone.
 *
 * It is a native `<details>`, so its summary opens it at any width. On a wide
 * screen the controls are already on the page and there is nothing to open, so
 * this does nothing. `tests/e2e/conferences.spec.ts` has the same helper, for
 * the same reason.
 */
async function openTheFiltersOnAPhone(page: Page, projectName: string): Promise<void> {
	if (projectName !== 'phone') {
		return;
	}

	// The summary reads "Filters" on its own, or "Filters (2)" when two filters
	// are set, so its text is matched from the start rather than in full.
	await page
		.getByRole('main')
		.getByText(/^Filters/)
		.click();
}

test('a password typed before the page came to life still logs somebody in', async ({
	page
}, testInfo) => {
	skipWithoutJavaScript(testInfo);

	await delayTheJavaScript(page);
	await page.goto('/login');

	await page.getByLabel('Email').fill('nobody@example.com');
	await page.getByLabel('Password').fill('a-password-nobody-has');

	// Wait out the delay above, so Svelte has had its turn at the page.
	await page.waitForTimeout(SETTLE_MS);

	await expect(page.getByLabel('Email')).toHaveValue('nobody@example.com');
	await expect(page.getByLabel('Password')).toHaveValue('a-password-nobody-has');

	// And the form really does submit. Both fields are `required`, so an empty
	// one would stop the browser sending it at all and nothing would come back.
	// The account does not exist, so what comes back is the server saying so,
	// which proves the round trip happened.
	await page.getByRole('button', { name: 'Log in' }).press('Enter');

	await expect(page.getByRole('alert')).toContainText(
		'That email and password do not match an account.'
	);
});

test('a tick made before the page came to life is still ticked', async ({ page }, testInfo) => {
	skipWithoutJavaScript(testInfo);

	await delayTheJavaScript(page);
	await page.goto('/register');

	await page.getByLabel('Full name').fill('Amara Okafor');
	await page.getByLabel(/I agree to the Terms/).check();

	await page.waitForTimeout(SETTLE_MS);

	await expect(page.getByLabel('Full name')).toHaveValue('Amara Okafor');
	await expect(page.getByLabel(/I agree to the Terms/)).toBeChecked();
});

test('a search typed before the page came to life is still there, and the address follows it', async ({
	page
}, testInfo) => {
	skipWithoutJavaScript(testInfo);

	await delayTheJavaScript(page);
	await page.goto('/conferences');

	const main = page.getByRole('main');

	// The filter form is the one place in the app whose controls also have to
	// follow the address while they stay on screen, so it is the one most at risk
	// of losing what was typed. `conferences.spec.ts` proves the other half, that
	// "Reset" still empties every box.
	await main.getByLabel('Search conferences').fill('Vienna');

	await page.waitForTimeout(SETTLE_MS);

	await expect(main.getByLabel('Search conferences')).toHaveValue('Vienna');

	// The box keeping the word is only half of it: the next filter change has to
	// carry the word into the address as well. Nothing in the page heard these
	// keystrokes, because they landed before the page came to life, so the form
	// itself is the only record of them. Until T61 the page built the address
	// from its own copy of what had been typed instead, and this navigated to
	// `/conferences?country=NL` while the box still read "Vienna".
	await openTheFiltersOnAPhone(page, testInfo.project.name);
	await main.getByLabel('Country').selectOption('NL');

	await expect(page).toHaveURL(/[?&]q=Vienna/, { timeout: DATABASE_TIMEOUT_MS });
	await expect(page).toHaveURL(/[?&]country=NL/);
	await expect(main.getByLabel('Search conferences')).toHaveValue('Vienna');
});

test('a radio button chosen before the page came to life is still chosen', async ({
	page
}, testInfo) => {
	skipWithoutJavaScript(testInfo);

	await delayTheJavaScript(page);
	await page.goto('/styleguide');

	// `/styleguide` is the one page a visitor can reach without signing in that
	// has a radio group, so it is where `bind:group` is proved. `RadioGroup` is
	// the component under test; `routes/create/OrganizationPicker.svelte` is the
	// app's other set of radio buttons and binds the same way, behind a sign in.
	//
	// The sample group arrives with "One or two conferences" chosen, so picking a
	// different answer is a real change for Svelte to undo if the buttons were
	// written to rather than bound.
	const chosenBeforeTheScript = page.getByLabel('More than five');
	await chosenBeforeTheScript.check();

	await page.waitForTimeout(SETTLE_MS);

	await expect(chosenBeforeTheScript).toBeChecked();
	await expect(page.getByLabel('One or two conferences')).not.toBeChecked();
});
