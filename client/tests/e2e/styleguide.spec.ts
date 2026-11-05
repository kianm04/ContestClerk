import { expect, test } from '@playwright/test';
import { expectNoSidewaysOverflow } from './page-shape';

// `/styleguide` is where the team checks every shared component, so these tests
// are mostly the acceptance criteria of `specs/05-pages/public/styleguide.md`:
// the groups are all there, the states that only a browser can show are
// visible, and the sample form shows its errors with JavaScript switched off.

test('the page has its own title', async ({ page }) => {
	await page.goto('/styleguide');

	await expect(page).toHaveTitle('Styleguide · MUNMeet');
});

test('every group of the library is on the page', async ({ page }) => {
	await page.goto('/styleguide');

	for (const group of ['Tokens', 'Layout', 'Content', 'Forms', 'Data', 'Overlays']) {
		await expect(page.getByRole('heading', { level: 2, name: group, exact: true })).toBeVisible();
	}

	for (const group of ['Markdown editor', 'App shell', 'Committee room']) {
		await expect(page.getByRole('heading', { level: 2, name: group, exact: true })).toBeVisible();
	}
});

test('every badge tone is visible', async ({ page }) => {
	await page.goto('/styleguide');

	for (const label of ['Delegate', 'Accepted', 'Waitlisted', 'Not accepted', 'Draft']) {
		await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
	}
});

test('every button variant is visible, and the disabled link has lost its address', async ({
	page
}) => {
	await page.goto('/styleguide');

	for (const label of ['Submit application', 'Save draft', 'Cancel', 'Withdraw']) {
		await expect(page.getByRole('button', { name: label, exact: true }).first()).toBeVisible();
	}

	// A `Button` with an `href` is an `<a>`; disabling it takes the address away
	// so the browser will not follow it.
	await expect(page.getByText('Not available yet', { exact: true })).not.toHaveAttribute('href');
});

test('every notice tone is visible', async ({ page }) => {
	await page.goto('/styleguide');

	for (const title of [
		'Applications close on 14 December',
		'Payment received',
		'Position paper due in two days',
		'We could not save that'
	]) {
		await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
	}
});

test('the sample form comes back with a message under every field', async ({ page }) => {
	await page.goto('/styleguide');

	// Pressing Enter on the focused button rather than clicking it: the page is
	// far taller than a phone screen, and a click has to scroll there first,
	// which the phone emulation does not always finish in time.
	await page.getByRole('button', { name: 'Show every error' }).press('Enter');

	for (const message of [
		'Enter your full name.',
		'That does not look like an email address.',
		'Choose a committee.',
		'Choose a country.',
		'Ask for at least one seat.',
		'The deadline cannot be in the past.',
		'Tell us a little about yourself.',
		'Choose how much experience you have.',
		'That file is bigger than 5 MB.'
	]) {
		await expect(page.getByText(message, { exact: true })).toBeVisible();
	}

	// The message is tied to its own field, which is what a screen reader reads.
	await expect(page.getByLabel('Full name')).toHaveAttribute(
		'aria-describedby',
		'field-fullName-error'
	);
});

test('the sortable column headers are real links', async ({ page }) => {
	await page.goto('/styleguide');

	// The first table is sorted by applicant name, A to Z, so pressing that
	// column turns it round and the address says so.
	// SvelteKit writes a resolved address relative to the page it is on, so the
	// attribute reads `./styleguide?...` rather than starting with a slash.
	await expect(page.getByRole('link', { name: /^Applicant/ }).first()).toHaveAttribute(
		'href',
		/styleguide\?sort=name&direction=desc$/
	);
});

test('the dropdown opens from the keyboard', async ({ page }) => {
	await page.goto('/styleguide');

	const firstItem = page.getByRole('link', { name: 'View application' }).first();
	await expect(firstItem).toBeHidden();

	// A `Dropdown` is a native `<details>`, so Enter on its summary opens it and
	// no JavaScript is involved.
	await page.getByText('Actions', { exact: true }).first().press('Enter');

	await expect(firstItem).toBeVisible();
});

test('the modal opens and closes', async ({ page }, testInfo) => {
	// A native `<dialog>` is opened by calling a method on the element, so there
	// is nothing to open on the project that runs without JavaScript.
	test.skip(
		testInfo.project.use.javaScriptEnabled === false,
		'Opening a <dialog> needs JavaScript.'
	);

	await page.goto('/styleguide');

	const heading = page.getByRole('heading', { name: 'Move Amara to another committee' });
	await expect(heading).toBeHidden();

	// Pressing the button before the page has come to life does nothing at all:
	// a `<dialog>` is opened by calling a method on it and there is no script yet
	// to call it. That is the right behaviour — the modal is the one thing on
	// this page that really needs JavaScript — so the test presses again until
	// there is. `toPass` runs the block over and over until it stops throwing.
	await expect(async () => {
		await page.getByRole('button', { name: 'Open the modal' }).press('Enter');
		await expect(heading).toBeVisible({ timeout: 1000 });
	}).toPass({ timeout: 15_000 });

	await page.getByRole('button', { name: 'Got it', exact: true }).press('Enter');
	await expect(heading).toBeHidden();
});

test('no two examples give an element the same id', async ({ page }, testInfo) => {
	test.skip(
		testInfo.project.use.javaScriptEnabled === false,
		'Counting the ids on the page needs JavaScript.'
	);

	await page.goto('/styleguide');

	// Every shared form component builds its input's id out of its `name`, so two
	// examples passing the same name would put two elements with one id on the
	// page and point two labels at it.
	const repeated = await page.evaluate(() => {
		const seen = new Set<string>();
		const twice: string[] = [];

		for (const element of Array.from(document.querySelectorAll('[id]'))) {
			if (seen.has(element.id)) {
				twice.push(element.id);
			}
			seen.add(element.id);
		}

		return twice;
	});

	expect(repeated).toEqual([]);
});

test('the styleguide is not linked from the app shell', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('link', { name: 'Styleguide' })).toHaveCount(0);

	await page.goto('/conferences');
	await expect(page.getByRole('link', { name: 'Styleguide' })).toHaveCount(0);
});

test('robots.txt keeps crawlers off the styleguide', async ({ page }) => {
	const response = await page.goto('/robots.txt');

	expect(response?.status()).toBe(200);
	expect(await response?.text()).toContain('Disallow: /styleguide');
});

test('nothing spills off the side of a phone screen', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	await page.goto('/styleguide');

	await expectNoSidewaysOverflow(page);
});

test('the committee room group shows every room component in its states', async ({ page }) => {
	await page.goto('/styleguide');
	const room = page.locator('#room');

	// Running, paused, under ten seconds and over time (S12, S13).
	await expect(room.getByRole('timer')).toHaveCount(4);
	await expect(room.getByText('1:23', { exact: true })).toBeVisible();
	await expect(room.getByText('Paused', { exact: true })).toBeVisible();
	await expect(room.getByText('0:07', { exact: true })).toBeVisible();
	await expect(room.getByText('+0:07', { exact: true })).toBeVisible();

	// The speaker with the delegate under it, and a typed name shown by its initials.
	await expect(room.getByText('Amara Diallo', { exact: true })).toBeVisible();
	await expect(room.getByText('SG', { exact: true })).toBeVisible();
	// The delegate live view's rows: the reader's own says "You", an absent seat "absent".
	await expect(room.getByText('You', { exact: true })).toBeVisible();
	await expect(room.getByText('absent', { exact: true })).toBeVisible();
	// The server writes the address relative to the page (`./styleguide?…`), so
	// only its end is checked. The chosen seat is marked for screen readers too.
	const brazil = room.getByRole('link', { name: /Brazil/ });
	await expect(brazil).toHaveAttribute('href', /styleguide\?seat=seat-br$/);
	await expect(brazil).toHaveAttribute('aria-current', 'true');
	// The mark's words sit between the template's line breaks, which a pattern sees as spaces.
	await expect(room.getByText(/^\s*passes at \d+ for\s*$/)).toBeVisible();
});

test('the running timer counts down in the browser', async ({ page }, testInfo) => {
	// The clock ticks from an `$effect`, which only runs with JavaScript. Without
	// it the page still shows the time left when it was drawn.
	test.skip(testInfo.project.use.javaScriptEnabled === false, 'The timer ticks with JavaScript.');

	await page.goto('/styleguide');
	const runningTimer = page.locator('#room').getByRole('timer').first();
	const before = await runningTimer.textContent();

	// It started a little under five minutes from zero and ticks once a second.
	await expect(runningTimer).not.toHaveText(before ?? '', { timeout: 3000 });
	// Written the way chairs say it, "4:59", never "04:59".
	await expect(runningTimer).toHaveText(/^\s*[34]:\d\d\s*$/);
});

test('the auth card, the schedule events and the signed-in shell pieces are shown', async ({
	page
}) => {
	await page.goto('/styleguide');

	await expect(page.getByRole('heading', { level: 1, name: 'Welcome back.' })).toBeVisible();
	await expect(page.getByText("Chairs' briefing", { exact: true })).toBeVisible();
	// The unread notification is two hours old at the fixed moment the samples use.
	const shell = page.locator('#shell');
	// Only the rows on screen count: the bell's panel is shut and draws none.
	const visibleRows = shell.getByText('Your application was accepted').filter({ visible: true });
	await expect(visibleRows).toHaveCount(2);
	await expect(shell.getByText('2 hours ago').filter({ visible: true }).first()).toBeVisible();
	await expect(shell.getByRole('link', { name: 'Conferences' })).toHaveAttribute(
		'aria-current',
		'page'
	);
	await expect(shell.getByLabel('Notifications, 1 unread')).toBeVisible();

	// The visitor's own header and footer are the `AppHeader` and `AppFooter` examples.
	await expect(page.getByRole('banner')).toBeVisible();
	await expect(page.getByRole('contentinfo')).toBeVisible();
});

test('the flash message stays without JavaScript and leaves after five seconds with it', async ({
	page
}, testInfo) => {
	await page.goto('/styleguide');
	const flash = page.locator('#shell').getByRole('status');

	if (testInfo.project.use.javaScriptEnabled === false) {
		await expect(flash).toHaveText('All notifications marked as read.');
		return;
	}

	// `FLASH_VISIBLE_MS` is five seconds; the wait allows for a slow first load.
	await expect(flash).toBeHidden({ timeout: 10_000 });
});
