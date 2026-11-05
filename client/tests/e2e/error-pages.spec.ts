import { expect, test } from '@playwright/test';
import { createScheduleConference } from './schedule-fixtures';
import { createTestUser, signIn } from './signed-in-user';
import {
	expectNoSidewaysOverflow,
	expectPageFitsInScreens,
	saveFullPageScreenshot
} from './page-shape';

// `src/routes/+error.svelte`, the page SvelteKit draws in place of any page that
// failed. See `specs/03-design/app-shell.md` ("Error pages"). The 500 half is in
// `src/routes/error.svelte.test.ts`, because nothing in the app fails on purpose
// for a browser to catch it.

test('an address that matches no page answers 404 inside the ordinary shell', async ({ page }) => {
	const response = await page.goto('/no-such-page-anywhere');

	expect(response?.status()).toBe(404);

	// SvelteKit's own words for a route that does not exist, which the page
	// draws as they are.
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Not Found');
	await expect(page.getByText('Error 404')).toBeVisible();
	await expect(page).toHaveTitle('Error 404 · MUNMeet');

	// The top bar and footer are still there, so the visitor is not stranded.
	await expect(page.getByRole('banner')).toBeVisible();
	await expect(page.getByRole('contentinfo')).toBeVisible();

	await expectNoSidewaysOverflow(page);
	await expectPageFitsInScreens(page, 1);
	await saveFullPageScreenshot(page, 'error-404');
});

test('a page that refuses its own address shows the words it chose', async ({ page }) => {
	const response = await page.goto('/conferences/no-such-conference');

	expect(response?.status()).toBe(404);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(
		'This conference does not exist.'
	);
});

test('the way back takes a visitor to the landing page', async ({ page }) => {
	await page.goto('/no-such-page-anywhere');
	await page.getByRole('link', { name: 'Go to the home page' }).click();

	await expect(page).toHaveURL('/');
});

test('the way back takes a signed-in reader to their home page', async ({ page }) => {
	const user = await createTestUser();
	await signIn(page, user);

	await page.goto('/no-such-page-anywhere');
	await page.getByRole('link', { name: 'Go to the home page' }).click();

	await expect(page).toHaveURL('/home');
});

test('an id that is not an id at all is a 404, not a 500', async ({ page }) => {
	const organiser = await createTestUser();
	const conference = await createScheduleConference({
		owner: organiser,
		namePrefix: 'Malformed Id MUN'
	});
	await signIn(page, organiser);

	// The organiser can open the conference's own pages, so a 404 below comes
	// from the id and not from a refusal to show the conference at all.
	const listResponse = await page.goto(`/manage/${conference.slug}/applications`);
	expect(listResponse?.status()).toBe(200);

	// Postgres refuses "nonsense" as a uuid rather than finding nothing, and each
	// page used to pass that refusal on as an unexpected error. An address somebody
	// typed wrong names nothing, so it is answered the way any unknown id is.
	// Each one also says what is missing in a full sentence, which the M7
	// polish passes gave the delegate pages (T51) and the organiser pages (T52).
	const addresses: { address: string; message: string }[] = [
		{ address: '/applications/nonsense', message: 'This application does not exist.' },
		{ address: '/invoices/nonsense', message: 'This invoice does not exist.' },
		{
			address: `/manage/${conference.slug}/applications/nonsense`,
			message: 'This application does not exist.'
		},
		{
			address: `/manage/${conference.slug}/committees/nonsense`,
			message: 'This committee does not exist.'
		},
		{
			address: `/manage/${conference.slug}/delegations/nonsense`,
			message: 'This delegation does not exist.'
		}
	];

	for (const { address, message } of addresses) {
		const response = await page.goto(address);

		expect(response?.status(), address).toBe(404);
		await expect(page.getByRole('heading', { level: 1 }), address).toHaveText(message);
	}
});
