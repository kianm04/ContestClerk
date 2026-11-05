import { expect, test } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { createTestUser, signIn } from './signed-in-user';
import { expectNoSidewaysOverflow } from './page-shape';

// The acceptance criteria of `specs/05-pages/auth/welcome.md` that need a real
// browser. Every test makes its own account, so they can run side by side.
//
// The accounts here are made with `hasCompletedOnboarding: false`, which is the
// state a brand-new account is really in: `handle_new_user` writes the profile
// row and leaves `onboarding_completed_at` null.

/** An account that has signed up but not answered the welcome form yet. */
async function createNewUser(fullName = 'Daniel Perez') {
	return createTestUser({ fullName, hasCompletedOnboarding: false });
}

/**
 * Open the "Details organisers may need" block.
 *
 * The optional fields live inside a `<details>` element, which starts closed,
 * so a person clicks the summary before typing in them and so must a test: a
 * field inside a closed block is genuinely not there to be filled in.
 */
async function openOptionalDetails(page: import('@playwright/test').Page) {
	await page.getByText('Details organisers may need (optional)').click();
}

/** Fill in the four required fields. The optional ones are left alone. */
async function fillRequiredFields(page: import('@playwright/test').Page) {
	await page.getByLabel('Institution').fill('Delft University');
	await page.getByLabel('Country').selectOption('NL');
	await page.getByLabel('Several', { exact: true }).check();
}

test('names itself in the browser tab', async ({ page }) => {
	const user = await createNewUser();
	await signIn(page, user);

	await page.goto('/welcome');

	await expect(page).toHaveTitle('Welcome · MUNMeet');
});

test('a visitor is sent to the sign in page and back again', async ({ page }) => {
	await page.goto('/welcome');

	await expect(page).toHaveURL('/login?next=%2Fwelcome');
});

test('greets the person by the name they signed up with', async ({ page }) => {
	const user = await createNewUser('Amara Okafor');
	await signIn(page, user);

	await page.goto('/welcome');

	await expect(page.getByRole('heading', { name: 'Welcome, Amara.' })).toBeVisible();
	await expect(page.getByLabel('Full name')).toHaveValue('Amara Okafor');
});

test('a signed-in page sends a new account here first, and back afterwards', async ({ page }) => {
	const user = await createNewUser();
	await signIn(page, user);

	await page.goto('/notifications');

	await expect(page).toHaveURL('/welcome?next=%2Fnotifications');

	await fillRequiredFields(page);
	await page.getByRole('button', { name: 'Continue' }).press('Enter');

	// `next` is honoured, so the page they were heading for is where they land.
	await expect(page).toHaveURL('/notifications');
	await expect(page.getByText('Welcome to MUNMeet.')).toBeVisible();
});

test('saves the form and never shows it again', async ({ page }) => {
	const user = await createNewUser();
	await signIn(page, user);

	await page.goto('/welcome');
	await fillRequiredFields(page);
	await page.getByRole('button', { name: 'Continue' }).press('Enter');

	await expect(page).toHaveURL('/home');

	// Asking for the page again sends them away, because it is finished.
	await page.goto('/welcome');
	await expect(page).toHaveURL('/home');
});

test('the gate catches every signed-in page, not just one', async ({ page }) => {
	const user = await createNewUser();
	await signIn(page, user);

	// `/create` and `/notifications` are two of the signed-in pages, and each one
	// asks `requireOnboarded` for itself. `/home` does too, which
	// `tests/e2e/home.spec.ts` checks. `/logout` is the exception the spec names,
	// and stays open so that a half-finished account can still leave.
	await page.goto('/create');
	await expect(page).toHaveURL('/welcome?next=%2Fcreate');

	await page.goto('/logout');
	await expect(page).toHaveURL('/logout');
});

test('blocks the four required fields with a message each, and keeps what was typed', async ({
	page
}) => {
	const user = await createNewUser();
	await signIn(page, user);

	await page.goto('/welcome');

	// The name is emptied, so all four required fields are missing at once. None
	// of them carries the HTML `required` attribute, on purpose: the server does
	// the checking so that the wording is ours and reads the same everywhere.
	await page.getByLabel('Full name').fill(' ');
	await page.getByRole('button', { name: 'Continue' }).press('Enter');

	await expect(page.getByText('Please enter your name.')).toBeVisible();
	await expect(page.getByText('Please enter your school, university or club.')).toBeVisible();
	await expect(page.getByText('Please pick a country.')).toBeVisible();
	await expect(page.getByText('Please pick your experience level.')).toBeVisible();

	// Still on the form, and nothing was saved.
	await expect(page).toHaveURL('/welcome');
});

// T176: a screen reader hears that "Continue" was refused. This runs in the
// `desktop-no-js` project too, where the refusal is a whole new page.
test('a refused form says so in an alert just above "Continue"', async ({ page }) => {
	const user = await createNewUser();
	await signIn(page, user);

	await page.goto('/welcome');

	const summary = page.getByRole('alert').filter({ hasText: 'Check the fields marked above.' });

	// A fresh form has nothing to be refused about.
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	await expect(summary).toHaveCount(0);

	await page.getByLabel('Institution').fill('Delft University');
	await page.getByRole('button', { name: 'Continue' }).click();

	await expect(summary).toBeVisible();
	await expect(page.getByText('Please pick a country.')).toBeVisible();

	// The summary sits right above the button, after the last field.
	const summaryBox = await summary.boundingBox();
	const buttonBox = await page.getByRole('button', { name: 'Continue' }).boundingBox();

	expect(summaryBox && buttonBox && summaryBox.y < buttonBox.y).toBe(true);
});

test('keeps every optional answer when something else is wrong', async ({ page }) => {
	const user = await createNewUser();
	await signIn(page, user);

	await page.goto('/welcome');
	await page.getByLabel('Full name').fill(' ');
	await openOptionalDetails(page);
	await page.getByLabel('Phone', { exact: true }).fill('+31 6 1234 5678');
	await page.getByRole('button', { name: 'Continue' }).press('Enter');

	await expect(page.getByLabel('Phone', { exact: true })).toHaveValue('+31 6 1234 5678');
});

test('saves the optional details as well', async ({ page }) => {
	const user = await createNewUser();
	await signIn(page, user);

	await page.goto('/welcome');
	await fillRequiredFields(page);
	await openOptionalDetails(page);
	await page.getByLabel('Phone', { exact: true }).fill('+31 6 1234 5678');
	await page.getByLabel('Dietary requirements').fill('Vegetarian');
	await page.getByRole('button', { name: 'Continue' }).press('Enter');

	await expect(page).toHaveURL('/home');

	// The details are private, so the only place to see them again is the
	// account's own row.
	const { data } = await createServiceRoleClient()
		.from('profile_details')
		.select('phone, dietary_requirements')
		.eq('user_id', user.id)
		.single();

	expect(data).toEqual({ phone: '+31 6 1234 5678', dietary_requirements: 'Vegetarian' });
});

test('the optional block opens and closes without JavaScript', async ({ page }) => {
	const user = await createNewUser();
	await signIn(page, user);

	await page.goto('/welcome');

	// `<details>` hides its contents until the `<summary>` is clicked, and the
	// browser does that itself, with or without JavaScript.
	await expect(page.getByLabel('Phone', { exact: true })).toBeHidden();

	await openOptionalDetails(page);

	await expect(page.getByLabel('Phone', { exact: true })).toBeVisible();
});

test('nothing spills off the side of a phone screen', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	const user = await createNewUser();
	await signIn(page, user);
	await page.goto('/welcome');

	await expectNoSidewaysOverflow(page);
});
