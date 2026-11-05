import { test, type Page } from '@playwright/test';
import {
	expectEveryControlNamed,
	expectReadableContrast,
	expectVisibleFocusEverywhere,
	type FocusOptions
} from './accessibility';
import { expectNoSidewaysOverflow, saveFullPageScreenshot } from './page-shape';
import { createTestUser, signIn, signInThroughResetLink } from './signed-in-user';

// The accessibility pass of T50 over every page in `specs/05-pages/public/` and
// `specs/05-pages/auth/`: each one names its controls, draws a focus ring
// wherever Tab lands, keeps its text readable and fits a phone. The screenshot
// of each is what the layout was compared against its spec with.
//
// Each page's own behaviour is tested in its own spec file; this one only looks
// at how the page is drawn.

/** The published conference, its committee and its organisation in `supabase/seed.sql`. */
const CONFERENCE_SLUG = 'amsterdammun-2027';
const COMMITTEE_SLUG = 'security-council';
const ORGANIZATION_SLUG = 'sample-europe-mun-network';

/** A page a visitor can open, and the name its screenshot is saved under. */
type VisitorPage = { name: string; path: string };

const VISITOR_PAGES: VisitorPage[] = [
	{ name: 'polish-landing', path: '/' },
	{ name: 'polish-conferences', path: '/conferences' },
	{ name: 'polish-conferences-empty', path: '/conferences?q=Atlantis%20Underwater%20MUN' },
	{ name: 'polish-conference', path: `/conferences/${CONFERENCE_SLUG}` },
	{
		name: 'polish-committee',
		path: `/conferences/${CONFERENCE_SLUG}/committees/${COMMITTEE_SLUG}`
	},
	{ name: 'polish-organization', path: `/organizations/${ORGANIZATION_SLUG}` },
	{ name: 'polish-for-organisers', path: '/for-organisers' },
	{ name: 'polish-terms', path: '/terms' },
	{ name: 'polish-privacy', path: '/privacy' },
	{ name: 'polish-styleguide', path: '/styleguide' },
	{ name: 'polish-conference-missing', path: '/conferences/no-such-conference' },
	{ name: 'polish-login', path: '/login' },
	{ name: 'polish-login-confirmed', path: '/login?message=confirmed' },
	{ name: 'polish-register', path: '/register' },
	{ name: 'polish-forgot-password', path: '/forgot-password' },
	{ name: 'polish-auth-error', path: '/auth/error' }
];

/** Every check this file makes, on whatever page the browser is showing. */
async function checkThePage(
	page: Page,
	screenshotName: string,
	focusOptions: FocusOptions = {}
): Promise<void> {
	await saveFullPageScreenshot(page, screenshotName);
	await expectNoSidewaysOverflow(page);
	await expectEveryControlNamed(page);
	await expectReadableContrast(page);
	await expectVisibleFocusEverywhere(page, focusOptions);
}

test.describe('pages a visitor sees', () => {
	for (const visitorPage of VISITOR_PAGES) {
		test(`${visitorPage.path} is named, focusable, readable and fits`, async ({ page }) => {
			await page.goto(visitorPage.path);

			await checkThePage(page, visitorPage.name);
		});
	}

	test('the sign in form with an error is readable', async ({ page }) => {
		await page.goto('/login');
		await page.getByLabel('Email').fill('nobody@example.com');
		await page.getByLabel('Password').fill('not-the-password');
		await page.getByRole('button', { name: 'Log in' }).click();
		await page.getByText('do not match an account').waitFor();

		await checkThePage(page, 'polish-login-error', { startsAtSkipLink: false });
	});

	test('the register form sent back with an error is readable', async ({ page }) => {
		// A name of spaces passes the browser's own `required` check, so the form
		// really reaches the server and comes back with its error notice.
		await page.goto('/register');
		await page.getByLabel('Full name').fill('   ');
		await page.getByLabel('Email').fill('someone@example.com');
		await page.getByLabel('Password').fill('long-enough-password');
		await page.getByLabel('I agree to the Terms and the Privacy policy.').check();
		await page.getByRole('button', { name: 'Create account' }).click();
		await page.getByText('Please enter your name.').waitFor();

		await checkThePage(page, 'polish-register-error', { startsAtSkipLink: false });
	});
});

test.describe('pages a signed-in person sees', () => {
	test('/welcome is named, focusable, readable and fits', async ({ page }) => {
		const user = await createTestUser({ hasCompletedOnboarding: false });
		await signIn(page, user);
		await page.goto('/welcome');

		await checkThePage(page, 'polish-welcome');
	});

	test('/reset-password is named, focusable, readable and fits', async ({ page }) => {
		// Only a session that just came through a reset link may see this page
		// (security review L37), and the helper leaves the browser on it.
		await signInThroughResetLink(page, await createTestUser());

		await checkThePage(page, 'polish-reset-password');
	});

	test('/logout is named, focusable, readable and fits', async ({ page }) => {
		await signIn(page, await createTestUser());
		await page.goto('/logout');

		await checkThePage(page, 'polish-logout');
	});

	test('an unknown invite is named, focusable, readable and fits', async ({ page }) => {
		await signIn(page, await createTestUser());
		await page.goto(`/invites/${crypto.randomUUID().replaceAll('-', '')}`);

		await checkThePage(page, 'polish-invite-unknown');
	});
});
