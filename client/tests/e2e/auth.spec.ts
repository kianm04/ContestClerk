import { expect, test } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { markPage, readMarker, skipWithoutJavaScript } from './in-place';
import {
	createTestUser,
	resetLinkFor,
	signIn,
	signInThroughResetLink,
	TEST_PASSWORD
} from './signed-in-user';

// The six auth pages, end to end in a real browser: `/login`, `/register`,
// `/logout`, `/forgot-password`, `/reset-password` and `/auth/error`. Every
// test here runs three times, once with JavaScript switched off, which is how
// "works without JavaScript" is checked. See `specs/05-pages/auth/`.

/** A throwaway address nobody has registered, for the sign up tests. */
function unusedEmail(): string {
	return `e2e-signup-${crypto.randomUUID()}@example.com`;
}

test.describe('log in', () => {
	test('names itself in the browser tab', async ({ page }) => {
		await page.goto('/login');

		await expect(page).toHaveTitle('Log in · MUNMeet');
	});

	test('signs somebody in and sends them to the signed-in home page', async ({ page }) => {
		const user = await createTestUser();

		await page.goto('/login');
		await page.getByLabel('Email').fill(user.email);
		await page.getByLabel('Password').fill(TEST_PASSWORD);
		await page.getByRole('button', { name: 'Log in' }).press('Enter');

		await expect(page).toHaveURL('/home');
	});

	test('keeps the address after a wrong password, and clears the password', async ({ page }) => {
		const user = await createTestUser();

		await page.goto('/login');
		await page.getByLabel('Email').fill(user.email);
		await page.getByLabel('Password').fill('not-the-password');
		await page.getByRole('button', { name: 'Log in' }).press('Enter');

		await expect(page.getByRole('alert')).toContainText(
			'That email and password do not match an account.'
		);
		await expect(page.getByLabel('Email')).toHaveValue(user.email);
		await expect(page.getByLabel('Password')).toHaveValue('');
	});

	test('a wrong password answers in place without reloading', async ({ page }, testInfo) => {
		// T125: a refusal used to post and reload the page. This stays on
		// `/login` with no redirect at all, so a marker left on `window` before
		// pressing (`./in-place.ts`) is the plainest proof there was no reload.
		skipWithoutJavaScript(testInfo);
		const user = await createTestUser();

		await page.goto('/login');
		await markPage(page);
		await page.getByLabel('Email').fill(user.email);
		await page.getByLabel('Password').fill('not-the-password');
		await page.getByRole('button', { name: 'Log in' }).click();

		await expect(page.getByRole('alert')).toContainText(
			'That email and password do not match an account.'
		);
		await expect(page.getByLabel('Password')).toHaveValue('');
		expect(await readMarker(page)).toBe('still here');
	});

	test('remembers where the visitor was heading, even after a wrong password', async ({ page }) => {
		const user = await createTestUser();

		await page.goto('/login?next=%2Fnotifications');
		await page.getByLabel('Email').fill(user.email);
		await page.getByLabel('Password').fill('not-the-password');
		await page.getByRole('button', { name: 'Log in' }).press('Enter');

		// The failed attempt lands back on the same address, so `next` is still there.
		await expect(page).toHaveURL('/login?next=%2Fnotifications');
		// T125: the form now answers in place, so the address above is true even
		// while the refusal is still on its way back from the server. Waiting for
		// the alert first means the form is free to send again; without this a
		// press that lands before the first has settled is dropped, since the
		// in-place form (`$lib/in-place-form.svelte.ts`) ignores a second press
		// while one is already busy.
		await expect(page.getByRole('alert')).toContainText(
			'That email and password do not match an account.'
		);

		await page.getByLabel('Password').fill(TEST_PASSWORD);
		await page.getByRole('button', { name: 'Log in' }).press('Enter');

		await expect(page).toHaveURL('/notifications');
	});

	test('carries that page into the two links beside the form', async ({ page }) => {
		await page.goto('/login?next=%2Fnotifications');

		// Following the links rather than reading their `href`: SvelteKit writes
		// the address relative to the page it is on, so the attribute is
		// `./forgot-password?...` until the browser works it out.
		await page.getByRole('link', { name: 'Forgot your password?' }).click();
		await expect(page).toHaveURL('/forgot-password?next=%2Fnotifications');

		await page.goto('/login?next=%2Fnotifications');
		await page.getByRole('link', { name: 'Create an account' }).click();
		await expect(page).toHaveURL('/register?next=%2Fnotifications');
	});

	test('sends somebody who is already signed in away', async ({ page }) => {
		const user = await createTestUser();
		await signIn(page, user);

		await page.goto('/login');

		await expect(page).toHaveURL('/home');
	});

	test('congratulates somebody who has just confirmed their address', async ({ page }) => {
		await page.goto('/login?message=confirmed');

		await expect(page.getByText('Your email is confirmed. Log in to continue.')).toBeVisible();
	});
});

test.describe('create an account', () => {
	test('names itself in the browser tab', async ({ page }) => {
		await page.goto('/register');

		await expect(page).toHaveTitle('Create an account · MUNMeet');
	});

	test('puts the name on the new profile and signs the person in', async ({ page }) => {
		const email = unusedEmail();

		await page.goto('/register');
		await page.getByLabel('Full name').fill('Amara Okafor');
		await page.getByLabel('Email').fill(email);
		await page.getByLabel('Password').fill(TEST_PASSWORD);
		await page.getByLabel(/I agree to the Terms/).check();
		await page.getByRole('button', { name: 'Create account' }).press('Enter');

		// Local Supabase has email confirmation switched off, so signing up signs
		// the person straight in rather than waiting for a link, and a brand-new
		// account lands on the welcome form.
		await expect(page).toHaveURL('/welcome');

		// `handle_new_user` copies `full_name` out of the sign up into `profiles`,
		// and the address into `profile_details`, which is where it is looked up
		// from: `profiles` itself holds no address.
		const admin = createServiceRoleClient();
		const { data: details } = await admin
			.from('profile_details')
			.select('user_id')
			.eq('email', email)
			.single();
		const { data: profile } = await admin
			.from('profiles')
			.select('full_name')
			.eq('id', details?.user_id ?? '')
			.single();

		expect(profile).toMatchObject({ full_name: 'Amara Okafor' });
	});

	test('will not go on until the terms are agreed to', async ({ page }) => {
		await page.goto('/register');
		await page.getByLabel('Full name').fill('Amara Okafor');
		await page.getByLabel('Email').fill(unusedEmail());
		await page.getByLabel('Password').fill(TEST_PASSWORD);
		await page.getByRole('button', { name: 'Create account' }).press('Enter');

		await expect(page.getByRole('alert')).toContainText('Please agree to the terms to continue.');
	});

	test('offers both documents beside the tick box, in a tab of their own', async ({ page }) => {
		await page.goto('/register');

		const main = page.getByRole('main');
		const terms = main.getByRole('link', { name: 'Terms' });
		const privacy = main.getByRole('link', { name: 'Privacy policy' });

		// `target="_blank"` is what opens them in a new tab, which leaves this
		// half-filled form exactly as it was. The address is read rather than
		// followed here, because following it would open that second tab.
		await expect(terms).toHaveAttribute('target', '_blank');
		await expect(privacy).toHaveAttribute('target', '_blank');
		await expect(terms).toHaveAttribute('href', /\/terms$/);
		await expect(privacy).toHaveAttribute('href', /\/privacy$/);
	});

	test('shows an address an invite link filled in, and lets it be changed', async ({ page }) => {
		await page.goto('/register?email=chair%40school.org');

		await expect(page.getByLabel('Email')).toHaveValue('chair@school.org');

		await page.getByLabel('Email').fill('someone.else@example.com');
		await expect(page.getByLabel('Email')).toHaveValue('someone.else@example.com');
	});

	test('a refused sign-up offers to log in instead, keeping `next`', async ({ page }) => {
		const existing = await createTestUser();

		await page.goto('/register?next=%2Fnotifications');
		await page.getByLabel('Full name').fill('Amara Okafor');
		await page.getByLabel('Email').fill(existing.email);
		await page.getByLabel('Password').fill(TEST_PASSWORD);
		await page.getByLabel(/I agree to the Terms/).check();
		await page.getByRole('button', { name: 'Create account' }).press('Enter');

		// The local project signs a new account straight in, so Supabase turns
		// down an address that already has one. The words do not say so
		// (`page.server.test.ts` checks they are the same for any refusal).
		const alert = page.getByRole('main').getByRole('alert');

		await expect(alert).toContainText('We could not create an account with this address.');
		await expect(alert.getByRole('link', { name: 'Log in instead' })).toHaveAttribute(
			'href',
			/\/login\?next=%2Fnotifications$/
		);
	});

	test('sends the new account to the page it was heading for', async ({ page }) => {
		await page.goto('/register?next=%2Fnotifications');
		await page.getByLabel('Full name').fill('Amara Okafor');
		await page.getByLabel('Email').fill(unusedEmail());
		await page.getByLabel('Password').fill(TEST_PASSWORD);
		await page.getByLabel(/I agree to the Terms/).check();
		await page.getByRole('button', { name: 'Create account' }).press('Enter');

		// Not `/notifications` itself: a brand-new account has not answered the
		// welcome form, so the gate on that page stops it here and carries the
		// address along. `welcome.spec.ts` covers the rest of the journey.
		await expect(page).toHaveURL('/welcome?next=%2Fnotifications');
	});
});

test.describe('the top bar on the way to a conference', () => {
	/** A seeded conference taking applications, from `supabase/seed.sql`. */
	const APPLY_PATH = '/conferences/amsterdammun-2027/apply';

	test("creating an account through the top bar's button comes back to the apply form", async ({
		page
	}) => {
		// Three pages in, each waiting on the database, which is longer than
		// Playwright allows one test by default.
		test.slow();

		// Where the apply form leaves a signed-out visitor who opened its address
		// directly (the conference page's own button goes to `/register`, T176).
		// The top bar's "Sign up" (once "Create account") used to drop this `next`,
		// so the new account ended on `/home` and the conference had to be found
		// again (T164).
		await page.goto(`/login?next=${encodeURIComponent(APPLY_PATH)}`);
		await page.getByRole('banner').getByRole('link', { name: 'Sign up' }).click();

		await expect(page).toHaveURL(`/register?next=${encodeURIComponent(APPLY_PATH)}`);

		await page.getByLabel('Full name').fill('Amara Okafor');
		await page.getByLabel('Email').fill(unusedEmail());
		await page.getByLabel('Password').fill(TEST_PASSWORD);
		await page.getByLabel(/I agree to the Terms/).check();
		await page.getByRole('main').getByRole('button', { name: 'Create account' }).press('Enter');

		// A brand-new account answers the welcome form first, carrying the address.
		await expect(page).toHaveURL(`/welcome?next=${encodeURIComponent(APPLY_PATH)}`);

		await page.getByLabel('Institution').fill('Delft University');
		await page.getByLabel('Country').selectOption('NL');
		await page.getByLabel('Several', { exact: true }).check();
		await page.getByRole('button', { name: 'Continue' }).press('Enter');

		await expect(page).toHaveURL(APPLY_PATH);
		await expect(
			page.getByRole('main').getByRole('button', { name: 'Submit application' })
		).toBeVisible();
	});
});

test.describe('log out', () => {
	test('names itself in the browser tab', async ({ page }) => {
		const user = await createTestUser();
		await signIn(page, user);

		await page.goto('/logout');

		await expect(page).toHaveTitle('Log out · MUNMeet');
	});

	test('only asks when the page is opened, and logs out when the form is sent', async ({
		page
	}) => {
		const user = await createTestUser();
		await signIn(page, user);

		// Opening the page is a GET, which must never end the session.
		await page.goto('/logout');
		await expect(page.getByText(user.email)).toBeVisible();

		await page.goto('/conferences');
		await expect(page.getByRole('link', { name: 'Log in' })).toHaveCount(0);

		await page.goto('/logout');
		await page.getByRole('button', { name: 'Log out' }).press('Enter');

		// The landing page, with the visitor top bar back and the message shown once.
		await expect(page).toHaveURL('/');
		await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
		await expect(page.getByText('You are logged out.')).toBeVisible();
	});

	test('cancels back to the signed-in home page', async ({ page }) => {
		const user = await createTestUser();
		await signIn(page, user);

		await page.goto('/logout');
		await page.getByRole('link', { name: 'Cancel' }).click();

		await expect(page).toHaveURL('/home');
	});
});

test.describe('forgot password', () => {
	test('names itself in the browser tab', async ({ page }) => {
		await page.goto('/forgot-password');

		await expect(page).toHaveTitle('Reset your password · MUNMeet');
	});

	test('answers the same whether or not the address has an account', async ({ page }) => {
		const user = await createTestUser();
		const sameAnswer =
			'If that address has an account, a link to choose a new password is on its way.';

		await page.goto('/forgot-password');
		await page.getByLabel('Email').fill(user.email);
		await page.getByRole('button', { name: 'Send reset link' }).press('Enter');
		await expect(page.getByText(sameAnswer)).toBeVisible();

		await page.goto('/forgot-password');
		await page.getByLabel('Email').fill('nobody-has-this@example.com');
		await page.getByRole('button', { name: 'Send reset link' }).press('Enter');
		await expect(page.getByText(sameAnswer)).toBeVisible();
	});
});

test.describe('a link from an email', () => {
	test('does nothing until its button is pressed, then signs the browser in', async ({ page }) => {
		const user = await createTestUser();

		await page.goto(await resetLinkFor(user));

		// Opening the link is a GET, and anything that fetches links in the
		// background could have made it; so far nobody is signed in (security
		// review L42). The page says what the one button will do.
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Reset your password.');
		const cookiesBefore = await page.context().cookies();
		expect(cookiesBefore.filter((cookie) => cookie.name.startsWith('sb-'))).toEqual([]);

		await page.getByRole('button', { name: 'Choose a new password' }).press('Enter');

		await expect(page).toHaveURL('/reset-password');
		await expect(page.getByText(`for ${user.email}`)).toBeVisible();
	});
});

test.describe('choose a new password', () => {
	test('sends a visitor with no session back to ask for a link', async ({ page }) => {
		await page.goto('/reset-password');

		await expect(page).toHaveURL('/forgot-password');
	});

	test('sends somebody signed in with a password to settings, where the current one is asked for', async ({
		page
	}) => {
		// Before L37 any signed-in session could choose a new password here
		// without the old one. `/forgot-password` passes a signed-in person on.
		const user = await createTestUser();
		await signIn(page, user);

		await page.goto('/reset-password');

		await expect(page).toHaveURL('/settings');
	});

	test('names itself in the browser tab', async ({ page }) => {
		const user = await createTestUser();
		await signInThroughResetLink(page, user);

		await expect(page).toHaveTitle('Choose a new password · MUNMeet');
	});

	test('explains a short password and two that do not match', async ({ page }) => {
		const user = await createTestUser();
		await signInThroughResetLink(page, user);

		await page.getByLabel('New password').fill('short');
		await page.getByLabel('Confirm password').fill('short');
		await page.getByRole('button', { name: 'Save password' }).press('Enter');
		await expect(page.getByRole('alert')).toContainText('Please use at least 8 characters.');

		await page.getByLabel('New password').fill('a-long-enough-password');
		await page.getByLabel('Confirm password').fill('a-different-password');
		await page.getByRole('button', { name: 'Save password' }).press('Enter');
		await expect(page.getByRole('alert')).toContainText('The two passwords do not match.');
	});

	test('saves the new password, and the old one stops working', async ({ page }) => {
		const user = await createTestUser();
		const newPassword = 'brand-new-password-9';
		await signInThroughResetLink(page, user);

		await page.getByLabel('New password').fill(newPassword);
		await page.getByLabel('Confirm password').fill(newPassword);
		await page.getByRole('button', { name: 'Save password' }).press('Enter');

		await expect(page).toHaveURL('/home');
		await expect(page.getByText('Your password is saved.')).toBeVisible();

		await page.goto('/logout');
		await page.getByRole('button', { name: 'Log out' }).press('Enter');
		// T125: logging out answers in place rather than a real navigation, so
		// the press above returns before the server has actually cleared the
		// session. Waiting for the landing page first means `/login` below sees
		// somebody already signed out, instead of racing the sign out and being
		// sent to the signed-in home page because the old session was still live.
		await expect(page).toHaveURL('/');

		await page.goto('/login');
		await page.getByLabel('Email').fill(user.email);
		await page.getByLabel('Password').fill(TEST_PASSWORD);
		await page.getByRole('button', { name: 'Log in' }).press('Enter');
		await expect(page.getByRole('alert')).toContainText(
			'That email and password do not match an account.'
		);

		await page.getByLabel('Password').fill(newPassword);
		await page.getByRole('button', { name: 'Log in' }).press('Enter');
		await expect(page).toHaveURL('/home');
	});
});

test.describe('a link that does not work', () => {
	test('names itself in the browser tab', async ({ page }) => {
		await page.goto('/auth/error');

		await expect(page).toHaveTitle('Link problem · MUNMeet');
	});

	test('sends a tampered link here and explains why', async ({ page }) => {
		await page.goto('/auth/confirm?token_hash=not-a-real-token&type=signup');

		// Nothing is checked until the button is pressed (security review L42).
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Confirm your email address.');
		await page.getByRole('button', { name: 'Confirm email address' }).press('Enter');

		// Supabase answers `otp_expired` for a token it does not recognise as
		// well as for one that has simply aged out, so a made-up token is
		// explained the same way an old one is.
		await expect(page).toHaveURL('/auth/error?reason=expired');
		await expect(page.getByText('The link has expired.')).toBeVisible();
		await expect(page.getByRole('link', { name: 'Request a new link' })).toBeVisible();
	});

	test('sends a link with nothing in it here too, and says it is unreadable', async ({ page }) => {
		await page.goto('/auth/confirm');

		await expect(page).toHaveURL('/auth/error?reason=invalid');
		await expect(page.getByText('The link is incomplete or was copied wrongly.')).toBeVisible();
	});

	test('has its own words for a link that was already used', async ({ page }) => {
		await page.goto('/auth/error?reason=used');

		await expect(page.getByText('This link was already used.')).toBeVisible();
	});

	test('tells somebody already signed in that nothing is wrong', async ({ page }) => {
		const user = await createTestUser();
		await signIn(page, user);

		await page.goto('/auth/error?reason=expired');

		await expect(page.getByText('You are already logged in.')).toBeVisible();
	});
});
