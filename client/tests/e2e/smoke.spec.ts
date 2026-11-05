import { expect, test } from '@playwright/test';

// These tests prove the whole loop works: the app builds, serves, talks to the
// local database, and renders with and without JavaScript. Page-specific tests
// live in their own files next to this one, named after the page.

test('the landing page shows the headline', async ({ page }) => {
	await page.goto('/');

	// The landing page's `<h1>` is for screen readers only (Trello RBz46aTQ), but
	// it is still in the page, which is all this test asks.
	await expect(page.getByRole('heading', { level: 1 })).toContainText(
		'MUNMeet, for Model UN delegates and organisers'
	);
});

test('the conference list shows the seeded conferences', async ({ page }) => {
	await page.goto('/conferences');

	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Conferences');
	await expect(page.getByText('The Hague International MUN Junior')).toBeVisible();
});

test('the login page has an email and a password field', async ({ page }) => {
	await page.goto('/login');

	await expect(page.getByLabel('Email')).toBeVisible();
	await expect(page.getByLabel('Password')).toBeVisible();
});
