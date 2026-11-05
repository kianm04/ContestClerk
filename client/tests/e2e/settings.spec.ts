import { expect, test, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { answerConfirmationPage } from './confirmation-page';
import { markPage, readMarker, skipWithoutJavaScript } from './in-place';
import {
	expectNoSidewaysOverflow,
	expectPageFitsInScreens,
	saveFullPageScreenshot
} from './page-shape';
import { createTestUser, signIn, TEST_PASSWORD, type TestUser } from './signed-in-user';

// The acceptance criteria of `specs/05-pages/delegate/settings.md` that need a
// real browser. Every test makes its own account, so they can run side by side.

/**
 * How long an assertion that waits on a page reading the database may take.
 *
 * Longer than the five seconds Playwright waits by default, for the reason
 * `tests/e2e/conferences.spec.ts` gives: every test in the run asks the one
 * local database at once, and an answer has taken up to eight seconds.
 */
const DATABASE_TIMEOUT_MS = 15_000;

/** Give this account an organisation it is the only owner of, and answer its slug. */
async function giveSoleOwnedOrganization(user: TestUser, name: string): Promise<string> {
	const admin = createServiceRoleClient();
	const slug = `settings-${crypto.randomUUID()}`;

	// The service-role client stands in for the "create a conference" flow,
	// because making an organisation is not what these tests are about. The
	// `add_organization_creator_as_owner` trigger turns `created_by` into the
	// owner row, which is what the settings page then finds.
	const { error } = await admin.from('organizations').insert({
		name,
		slug,
		created_by: user.id
	});

	if (error) {
		throw new Error(`Could not create the test organisation: ${error.message}`);
	}

	return slug;
}

/**
 * The password card and the delete card, each a region of its own. Both ask
 * for the current password, so a test names the card before the field.
 */
function passwordCard(page: Page) {
	return page.getByRole('region', { name: 'Password' });
}

function deleteCard(page: Page) {
	return page.getByRole('region', { name: 'Delete account' });
}

/**
 * Fill in the password form and send it. The delete card below asks for the
 * current password too, so the field is found inside the password card.
 */
async function submitPasswordChange(
	page: Page,
	fields: { current: string; next: string; repeat: string }
): Promise<void> {
	await passwordCard(page).getByLabel('Current password').fill(fields.current);
	await page.getByLabel('New password', { exact: true }).fill(fields.next);
	await page.getByLabel('Repeat new password').fill(fields.repeat);
	await page.getByRole('button', { name: 'Change password' }).press('Enter');
}

/**
 * Type the current password and the confirmation, and press "Delete account"
 * until the form is posted.
 *
 * Either way there are two presses. With JavaScript the first one opens a
 * dialog, and the button inside it posts the form. Without it the first one
 * opens the confirmation page, which asks the same question and carries the
 * typed fields on to the action.
 */
async function confirmDelete(
	page: Page,
	typed: string,
	hasJavaScript: boolean,
	currentPassword: string = TEST_PASSWORD
): Promise<void> {
	await deleteCard(page).getByLabel('Current password').fill(currentPassword);
	await page.getByLabel('Type DELETE to confirm').fill(typed);
	await page.getByRole('button', { name: 'Delete account' }).first().click();

	if (!hasJavaScript) {
		await answerConfirmationPage(page, 'Delete account');
		return;
	}

	const dialog = page.getByRole('dialog', { name: 'Delete your account?' });

	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: 'Delete account' }).click();
}

test('names itself in the browser tab', async ({ page }) => {
	const user = await createTestUser();
	await signIn(page, user);

	await page.goto('/settings');

	await expect(page).toHaveTitle('Settings · MUNMeet');
});

test('a visitor is sent to the sign in page and back again', async ({ page }) => {
	await page.goto('/settings');

	await expect(page).toHaveURL('/login?next=%2Fsettings');
});

test('an account that has not finished onboarding may still come here', async ({ page }) => {
	// The onboarding gate is deliberately off this page, so that somebody who
	// signed up with the wrong address can change it or leave.
	const user = await createTestUser({ hasCompletedOnboarding: false });
	await signIn(page, user);

	await page.goto('/settings');

	await expect(page).toHaveURL('/settings');
	await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
});

test('the profile menu leads here', async ({ page }) => {
	const user = await createTestUser('Daniel Perez');
	await signIn(page, user);

	await page.goto('/conferences');

	// The menu is a native `<details>`, so opening it is a click on the person's
	// picture and nothing more, with or without JavaScript.
	await page.getByLabel('Daniel Perez').click();
	await page.getByRole('link', { name: 'Settings' }).click();

	await expect(page).toHaveURL('/settings');
});

test.describe('changing the email address', () => {
	test('sends a confirmation and leaves the address alone until it is opened', async ({ page }) => {
		const user = await createTestUser();
		await signIn(page, user);

		const newEmail = `moved-${crypto.randomUUID()}@example.com`;

		await page.goto('/settings');
		await page.getByLabel('New email').fill(newEmail);
		await page.getByRole('button', { name: 'Change email' }).press('Enter');

		await expect(
			page.getByText(`Check ${newEmail} for a link to confirm the change.`)
		).toBeVisible();

		// The account still answers to the old address, and the page says the new
		// one is waiting.
		await expect(page.getByText(`Current: ${user.email}`)).toBeVisible();
		await expect(page.getByText(`Waiting for confirmation of ${newEmail}`)).toBeVisible();
	});

	test('refuses the address the account already has', async ({ page }) => {
		const user = await createTestUser();
		await signIn(page, user);

		await page.goto('/settings');
		await page.getByLabel('New email').fill(user.email);
		await page.getByRole('button', { name: 'Change email' }).press('Enter');

		await expect(page.getByText('That is already your email address.')).toBeVisible();
	});

	test('refuses something that is not an address, and keeps what was typed', async ({ page }) => {
		const user = await createTestUser();
		await signIn(page, user);

		// A browser checks a `type="email"` field itself and will not submit
		// something with no `@` in it at all, so this is an address the browser is
		// happy with and our own check is not: it has no dot after the `@`.
		await page.goto('/settings');
		await page.getByLabel('New email').fill('daniel@example');
		await page.getByRole('button', { name: 'Change email' }).press('Enter');

		await expect(page.getByText('That does not look like an email address.')).toBeVisible();
		await expect(page.getByLabel('New email')).toHaveValue('daniel@example');
	});
});

test.describe('changing the password', () => {
	test('changes it when the current password is right, and signs in with the new one', async ({
		page
	}) => {
		const user = await createTestUser();
		await signIn(page, user);

		const newPassword = 'a-brand-new-password';

		await page.goto('/settings');
		await submitPasswordChange(page, {
			current: TEST_PASSWORD,
			next: newPassword,
			repeat: newPassword
		});

		await expect(page.getByText('Password changed.')).toBeVisible();

		// The real proof: the old password no longer works and the new one does.
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
		await page.getByLabel('Password').fill(newPassword);
		await page.getByRole('button', { name: 'Log in' }).press('Enter');

		await expect(page).toHaveURL('/home');
	});

	test('blocks the change when the current password is wrong', async ({ page }) => {
		const user = await createTestUser();
		await signIn(page, user);

		await page.goto('/settings');
		await submitPasswordChange(page, {
			current: 'not-the-right-one',
			next: 'a-brand-new-password',
			repeat: 'a-brand-new-password'
		});

		await expect(page.getByText('Your current password is not right.')).toBeVisible();

		// Nothing changed: the password it was created with still signs them in.
		await page.goto('/logout');
		await page.getByRole('button', { name: 'Log out' }).press('Enter');
		// T125: logging out answers in place rather than a real navigation, so
		// the press above returns before the server has actually cleared the
		// session. Waiting for the landing page first means `signIn` below sees
		// somebody already signed out, instead of racing the sign out and its
		// own visit to `/login` finding the old session still live.
		await expect(page).toHaveURL('/');
		await signIn(page, user);

		await expect(page).toHaveURL('/home');
	});

	test('a refused password change answers in place without reloading', async ({
		page
	}, testInfo) => {
		// T125: a refusal used to post and reload the page. This stays on
		// `/settings` with no redirect at all, so a marker left on `window`
		// before pressing (`./in-place.ts`) is the plainest proof there was no
		// reload.
		skipWithoutJavaScript(testInfo);
		const user = await createTestUser();
		await signIn(page, user);

		await page.goto('/settings');
		await markPage(page);
		await submitPasswordChange(page, {
			current: 'not-the-right-one',
			next: 'a-brand-new-password',
			repeat: 'a-brand-new-password'
		});

		await expect(page.getByText('Your current password is not right.')).toBeVisible();
		expect(await readMarker(page)).toBe('still here');
	});

	test('refuses a new password shorter than eight characters', async ({ page }) => {
		const user = await createTestUser();
		await signIn(page, user);

		await page.goto('/settings');
		await submitPasswordChange(page, { current: TEST_PASSWORD, next: 'short', repeat: 'short' });

		await expect(page.getByText('Please use at least 8 characters.')).toBeVisible();
	});

	test('refuses two new passwords that do not match', async ({ page }) => {
		const user = await createTestUser();
		await signIn(page, user);

		await page.goto('/settings');
		await submitPasswordChange(page, {
			current: TEST_PASSWORD,
			next: 'a-brand-new-password',
			repeat: 'a-brand-new-passward'
		});

		await expect(page.getByText('The two new passwords do not match.')).toBeVisible();
	});

	test('never sends a password back to the screen', async ({ page }) => {
		const user = await createTestUser();
		await signIn(page, user);

		await page.goto('/settings');
		await submitPasswordChange(page, {
			current: 'not-the-right-one',
			next: 'a-brand-new-password',
			repeat: 'a-brand-new-password'
		});

		await expect(page.getByText('Your current password is not right.')).toBeVisible();
		await expect(passwordCard(page).getByLabel('Current password')).toHaveValue('');
		await expect(page.getByLabel('New password', { exact: true })).toHaveValue('');
		await expect(page.getByLabel('Repeat new password')).toHaveValue('');
	});
});

test.describe('deleting the account', () => {
	test('deletes it, signs the person out and says so on the front page', async ({
		page
	}, testInfo) => {
		const user = await createTestUser();
		await signIn(page, user);

		await page.goto('/settings');
		await confirmDelete(page, 'DELETE', testInfo.project.use.javaScriptEnabled !== false);

		await expect(page).toHaveURL('/');
		await expect(page.getByText('Your account was deleted.')).toBeVisible();

		// Signed out: the top bar offers to log in again rather than showing a name.
		await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();

		// And the account really is gone, so the old password signs nobody in.
		await page.goto('/login');
		await page.getByLabel('Email').fill(user.email);
		await page.getByLabel('Password').fill(TEST_PASSWORD);
		await page.getByRole('button', { name: 'Log in' }).press('Enter');

		await expect(page.getByText('That email and password do not match an account.')).toBeVisible();
	});

	test('asks on a page of its own without JavaScript, and Cancel keeps the account', async ({
		page
	}, testInfo) => {
		test.skip(
			testInfo.project.name !== 'desktop-no-js',
			'The question has a page of its own only when there is no script to open a dialog.'
		);

		const user = await createTestUser();
		await signIn(page, user);

		await page.goto('/settings');
		await deleteCard(page).getByLabel('Current password').fill(TEST_PASSWORD);
		await page.getByLabel('Type DELETE to confirm').fill('DELETE');
		await page.getByRole('button', { name: 'Delete account' }).click();

		// The press asked rather than acted: the account is still there.
		await expect(page).toHaveURL((url) => url.pathname === '/confirm');
		await expect(
			page.getByRole('heading', { level: 1, name: 'Delete your account?' })
		).toBeVisible();
		await expect(page).toHaveTitle('Delete your account? · MUNMeet');

		// The page is one short card. It is only ever drawn without JavaScript,
		// and the phone project has scripting on, so the window is narrowed to a
		// phone's 390px here to measure it at that width too.
		await expectPageFitsInScreens(page, 1);
		await saveFullPageScreenshot(page, 'confirm');
		await page.setViewportSize({ width: 390, height: 844 });
		await expectNoSidewaysOverflow(page);
		await saveFullPageScreenshot(page, 'confirm-390px');

		await page.getByRole('main').getByRole('link', { name: 'Cancel' }).click();

		await expect(page).toHaveURL('/settings');
		await expect(page.getByText(`Current: ${user.email}`)).toBeVisible();
	});

	test('blocks anything other than the word DELETE', async ({ page }, testInfo) => {
		const user = await createTestUser();
		await signIn(page, user);

		await page.goto('/settings');
		await confirmDelete(page, 'delete', testInfo.project.use.javaScriptEnabled !== false);

		await expect(page.getByText('Type DELETE to confirm.')).toBeVisible();

		// Still signed in, so nothing was deleted.
		await page.goto('/settings');
		await expect(page.getByText(`Current: ${user.email}`)).toBeVisible();
	});

	test('keeps the account when the current password is wrong', async ({ page }, testInfo) => {
		// Typing DELETE is not enough on its own: somebody at an unlocked laptop
		// could do that, and only the owner knows the password (security review L43).
		const user = await createTestUser();
		await signIn(page, user);

		await page.goto('/settings');
		await confirmDelete(
			page,
			'DELETE',
			testInfo.project.use.javaScriptEnabled !== false,
			'not-the-right-one'
		);

		await expect(page.getByText('Your current password is not right.')).toBeVisible();
		// A password is never sent back to the screen.
		await expect(deleteCard(page).getByLabel('Current password')).toHaveValue('');

		// Still signed in, so nothing was deleted.
		await page.goto('/settings');
		await expect(page.getByText(`Current: ${user.email}`)).toBeVisible();
	});

	test('warns the only owner of an organisation before they try', async ({ page }) => {
		const user = await createTestUser();
		const slug = await giveSoleOwnedOrganization(user, 'Rotterdam MUN');
		await signIn(page, user);

		await page.goto('/settings');

		await expect(
			page.getByText(
				'You are the only owner of Rotterdam MUN. Make somebody else an owner, or delete the organisation, before deleting your account.'
			)
		).toBeVisible();

		/*
			The warning says what to do, and this is the way to do it: the
			organisation's settings page is where another owner is made and where
			the organisation itself is deleted. The address is matched at the end
			rather than in full, because `resolve()` from `$app/paths` answers a
			*relative* address while a page is being built on the server, so
			without JavaScript the attribute reads `./manage/organizations/<slug>`.
		*/
		const link = page.getByRole('link', { name: 'Manage Rotterdam MUN →' });

		await expect(link).toHaveAttribute('href', new RegExp(`manage/organizations/${slug}$`));

		await link.click();

		await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
			'Rotterdam MUN',
			{ timeout: DATABASE_TIMEOUT_MS }
		);
	});

	test('keeps the account when the only owner of an organisation asks to delete it', async ({
		page
	}, testInfo) => {
		const user = await createTestUser();
		await giveSoleOwnedOrganization(user, 'Utrecht MUN');
		await signIn(page, user);

		await page.goto('/settings');
		await confirmDelete(page, 'DELETE', testInfo.project.use.javaScriptEnabled !== false);

		await expect(page.getByText('Your account was not deleted.')).toBeVisible();

		// The account is still there, and still signed in.
		await page.goto('/settings');
		await expect(page.getByText(`Current: ${user.email}`)).toBeVisible();
	});
});
