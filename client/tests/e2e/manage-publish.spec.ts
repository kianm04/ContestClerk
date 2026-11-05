import { expect, test, type APIResponse, type Locator, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { createTestUser, signIn, type TestUser } from './signed-in-user';
import { createDraftConferenceFor } from './draft-conference';
import { answerConfirmationPage } from './confirmation-page';

// The acceptance criteria of `specs/05-pages/organiser/publish.md` that need a
// real browser: the last setup step at `/manage/[slug]/publish` ("Review and
// publish") and the page it lands on, `/manage/[slug]/published`.
//
// * publishing works once every required step is done, lands on the Published
//   page, and makes the public page readable by a visitor;
// * publishing is refused, by the button and by the action, while a required
//   step is still open, and each step leaves "Publishing waits for these" once
//   it is done;
// * "Connect Stripe" is suggested only while there is money to collect by card;
// * a draft is deleted only once DELETE has been typed, which is the guard that
//   stands in for `ConfirmButton`'s dialog on a page with no script;
// * each setup step says where it is among the six and what comes next, and
//   the steps drop away once the conference is public.
//
// Until the manage redesign these were tests of the conference dashboard in
// `tests/e2e/manage-dashboard.spec.ts`, because publishing and deleting a draft
// lived there, and the setup pages named the next step under their header.
//
// EVERY ACTION WITHOUT JAVASCRIPT
// That criterion is met by these tests running on the `desktop-no-js` project
// like every other browser test, rather than by a test of its own: the publish
// button is a real submit button in a form with a form action, and "Delete
// draft" is a `ConfirmButton`, which opens a confirmation page asking the same
// question when there is no script to open its dialog.
//
// WHAT THESE TESTS LEAVE BEHIND
// Each test creates its own conference through `./draft-conference`, with an
// organisation of its own, and what it creates stays in the database until the
// next `pnpm db:reset`. Some of them are published, so they are dated in 2020:
// `/conferences` lists conferences that are published *and* have not finished,
// and `tests/e2e/conferences.spec.ts` counts what is in it, so a published
// conference of 2020 changes nothing it sees.

/**
 * How long an assertion that waits on a page reading the database may take.
 *
 * Longer than the five seconds Playwright waits by default, for the reason
 * `tests/e2e/conferences.spec.ts` gives: every test in the run asks the one
 * local database at once, and an answer has taken up to eight seconds.
 */
const DATABASE_TIMEOUT_MS = 15_000;

/**
 * How long a single try inside a retrying block may take.
 *
 * Short on purpose: the block around it is what waits, and a try that waited
 * the full fifteen seconds would only ever run once.
 */
const SINGLE_TRY_TIMEOUT_MS = 2_000;

/**
 * The days every conference these tests create runs on, and its application
 * window.
 *
 * All four are in the past, for the reason at the top of this file. The window
 * closes before the first day, which is what the application window step asks
 * of it.
 */
const CONFERENCE_FIRST_DAY = '2020-05-03';
const CONFERENCE_LAST_DAY = '2020-05-05';
const APPLICATIONS_OPEN_AT = '2020-01-10T09:00:00.000Z';
const APPLICATIONS_CLOSE_AT = '2020-03-01T09:00:00.000Z';

/**
 * The picture a test conference's banner column points at.
 *
 * A banner is only recommended, but the file behind this one is real —
 * `pnpm db:reset` uploads it for Amsterdam Open MUN 2027 — so the preview card
 * shows a picture rather than a broken image.
 */
const SAMPLE_BANNER_PATH =
	'conferences/20000000-0000-4000-8000-000000000009/banner-40000000-0000-4000-8000-000000000009.jpg';

/**
 * A name nothing else in the database will match, so that a test can read its
 * own conference's page without another run's rows getting in the way.
 */
function unusedName(prefix: string): string {
	return `${prefix} ${crypto.randomUUID().slice(0, 8)}`;
}

/** What `createDraftConference` names the new conference and its organisation. */
type NewConference = {
	/** The conference's name. */
	name: string;
	/** The name of the new organisation, which the account owns. */
	organizationName: string;
};

/**
 * Give `user` a draft conference of its own, run by a brand-new organisation,
 * and answer its `/manage/<slug>` address.
 *
 * The rows are written straight into the database by `./draft-conference`,
 * whose comment says why: the one-step `/create` form these tests used to fill
 * in is gone, and the creation flow that replaced it has its own
 * `create-*.spec.ts` files.
 */
async function createDraftConference(user: TestUser, conference: NewConference): Promise<string> {
	const draft = await createDraftConferenceFor(user, {
		name: conference.name,
		organizationName: conference.organizationName,
		startDate: CONFERENCE_FIRST_DAY,
		endDate: CONFERENCE_LAST_DAY
	});

	return `/manage/${draft.slug}`;
}

/** The slug at the end of a `/manage/<slug>` address. */
function slugOf(managePath: string): string {
	return managePath.split('/').pop() ?? '';
}

/**
 * The id of the conference a `/manage/<slug>` address names. `./draft-conference`
 * makes the slug with a random suffix, so the id can only be looked up afterwards.
 */
async function readConferenceId(slug: string): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('conferences')
		.select('id')
		.eq('slug', slug)
		.maybeSingle();

	if (error || !data) {
		throw new Error(`Could not find the conference "${slug}": ${error?.message}`);
	}

	return data.id;
}

/**
 * Write columns straight onto a conference.
 *
 * The pages that fill these in have browser tests of their own, so the
 * service-role client stands in for them here, to arrange the state a test
 * begins in. It is never used to show that something is allowed, which is
 * what `tests/db/supabase-test-client.ts` warns against.
 */
async function updateConference(
	conferenceId: string,
	columns: Record<string, string>
): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin.from('conferences').update(columns).eq('id', conferenceId);

	if (error) {
		throw new Error(`Could not fill in the test conference: ${error.message}`);
	}
}

/**
 * Give a conference one committee with one seat on offer.
 *
 * The committees step asks for a committee *and* a seat in it, so the two are
 * written together: a committee with no seat leaves the step open.
 */
async function addCommitteeWithASeat(conferenceId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('committees')
		.insert({ conference_id: conferenceId, name: 'General Assembly', slug: 'general-assembly' })
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test committee: ${error?.message}`);
	}

	const { error: seatError } = await admin
		.from('seats')
		.insert({ committee_id: data.id, name: 'Netherlands' });

	if (seatError) {
		throw new Error(`Could not write the test seat: ${seatError.message}`);
	}
}

/**
 * Do every required step, so the conference is ready to be published: a
 * committee with a seat, the details `hasDetails` in `$lib/publish-checklist.ts`
 * asks for, and an application window that closes before the first day.
 */
async function finishEveryRequiredItem(conferenceId: string): Promise<void> {
	await addCommitteeWithASeat(conferenceId);
	await updateConference(conferenceId, {
		description: 'Three days of debate, written out so the description is not empty.',
		tagline: 'Three days of debate on the water.',
		banner_path: SAMPLE_BANNER_PATH,
		venue_name: 'Beurs van Berlage',
		contact_email: 'hello@example.test',
		applications_open_at: APPLICATIONS_OPEN_AT,
		applications_close_at: APPLICATIONS_CLOSE_AT
	});
}

/** Publish a conference without going through the page, for a test that starts after it. */
async function publishWithoutThePage(conferenceId: string): Promise<void> {
	await updateConference(conferenceId, { status: 'published' });
}

/** Whether the conference is still in the database, for the test that deletes one. */
async function conferenceExists(conferenceId: string): Promise<boolean> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('conferences')
		.select('id')
		.eq('id', conferenceId)
		.maybeSingle();

	if (error) {
		throw new Error(`Could not look for the conference: ${error.message}`);
	}

	return data !== null;
}

/** The status column of one conference, for a test that says nothing changed. */
async function readConferenceStatus(conferenceId: string): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('conferences')
		.select('status')
		.eq('id', conferenceId)
		.maybeSingle();

	if (error || !data) {
		throw new Error(`Could not read the conference's status: ${error?.message}`);
	}

	return data.status;
}

/**
 * Press a `ConfirmButton` and answer the question it asks.
 *
 * With JavaScript the press opens a `<dialog>` and the dialog's own button is
 * what submits. Without it — which is the `desktop-no-js` project, and also any
 * page whose script has not landed yet — the press opens a confirmation page
 * asking the same question, whose own button is what submits. Both are the
 * right behaviour, so this waits to see which of the two happened rather than
 * assuming one.
 */
async function pressAndConfirm(page: Page, label: string): Promise<void> {
	// The dialog holds a second button with the same words on it, so the one in
	// the page itself is the first of the two. While the dialog is shut the
	// browser hides everything inside it, so until then there is only one.
	const button = page.getByRole('main').getByRole('button', { name: label }).first();
	const dialogButton = page.getByRole('dialog').getByRole('button', { name: label });

	await button.press('Enter');

	// `waitFor` throws when nothing turns up in the time it is given, and that is
	// the "no dialog, so no script" answer: the press opened the confirmation page
	// instead.
	const isAsking = await dialogButton
		.waitFor({ state: 'visible', timeout: SINGLE_TRY_TIMEOUT_MS })
		.then(() => true)
		.catch(() => false);

	if (isAsking) {
		await dialogButton.press('Enter');
	} else {
		await answerConfirmationPage(page, label);
	}
}

/**
 * Post to one of the page's form actions the way a browser posts a form.
 *
 * A button the page drew disabled proves only what the page did; the criterion
 * is that the action itself refuses, so the test asks it directly.
 * `page.request` carries the browser's own cookies, so the post arrives signed
 * in. `origin` is written by hand because SvelteKit refuses a form post that
 * looks as though it came from another website, and `accept: text/html` makes
 * SvelteKit answer the way it answers a browser with no script: the page drawn
 * again, carrying the status the action chose.
 */
async function postFormAction(
	page: Page,
	action: string,
	form: Record<string, string> = {}
): Promise<APIResponse> {
	const origin = new URL(page.url()).origin;

	return page.request.post(action, {
		form,
		headers: { origin, accept: 'text/html' }
	});
}

/** A signed-in account with a draft conference of its own. */
type TestConference = {
	user: TestUser;
	id: string;
	slug: string;
	name: string;
	/** The conference's own `/manage/<slug>` address. */
	managePath: string;
	/** Its "Review and publish" step. */
	publishPath: string;
};

/** Sign a brand-new account in and give it a conference of its own. */
async function signInWithAConference(page: Page, prefix: string): Promise<TestConference> {
	const user = await createTestUser('Priya Nair');
	await signIn(page, user);

	const name = unusedName(prefix);
	const organizationName = unusedName(`${prefix} Society`);
	const managePath = await createDraftConference(user, { name, organizationName });
	const slug = slugOf(managePath);
	const id = await readConferenceId(slug);

	return { user, id, slug, name, managePath, publishPath: `${managePath}/publish` };
}

/**
 * Open one page of the management area and wait for its title, so that
 * something missing from it is missing because the page left it out, not
 * because the page has not been drawn yet.
 */
async function openManagePage(page: Page, path: string, title: string): Promise<Locator> {
	await page.goto(path);

	const main = page.getByRole('main');

	await expect(main.getByRole('heading', { level: 1, name: title })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	return main;
}

/*
	Every test here signs a brand-new account in, seeds a draft
	conference and then writes the rows the page is meant to show. That is more
	than most browser tests do, and thirty seconds — what Playwright allows a
	test by default — is not always enough for it while the whole suite is
	asking the one local database at once. `test.slow()` triples that
	allowance. It is an allowance and not a wait: a quick test still finishes
	as quickly as it can.
*/
test.beforeEach(() => {
	test.slow();
});

test('publishes a conference once every required step is done, and shows it to the world', async ({
	page
}) => {
	const conference = await signInWithAConference(page, 'Publish Ready MUN');

	await finishEveryRequiredItem(conference.id);

	const main = await openManagePage(page, conference.publishPath, 'Review and publish');

	await expect(main.getByText('Everything required is in place.')).toBeVisible();
	await expect(main.getByText('Publishing waits for these')).toHaveCount(0);

	await main.getByRole('button', { name: 'Publish conference' }).press('Enter');

	// Publishing lands on a page of its own, which says the conference is
	// public. The window closed in 2020, so it is public without taking
	// applications. The flash floats above the page rather than inside
	// `<main>`, which is why that assertion is not scoped to it.
	await expect(page).toHaveURL(`${conference.managePath}/published`, {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.getByText(`${conference.name} is now public.`)).toBeVisible();
	await expect(main.getByRole('heading', { level: 1 })).toHaveText(`${conference.name} is public.`);
	await expect(main.getByRole('link', { name: 'Go to the dashboard' })).toBeVisible();

	expect(await readConferenceStatus(conference.id)).toBe('published');

	// The publish step is only for a draft, so it now sends the organiser to the
	// dashboard instead.
	await page.goto(conference.publishPath);

	await expect(page).toHaveURL(conference.managePath, { timeout: DATABASE_TIMEOUT_MS });

	// And the point of publishing: the public page, which answers a visitor with
	// a 404 while the conference is a draft, is now theirs to read. Clearing the
	// cookies is what makes this browser a visitor again.
	await page.context().clearCookies();

	const asAVisitor = await page.goto(`/conferences/${conference.slug}`);

	expect(asAVisitor?.status()).toBe(200);
	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
		conference.name,
		{ timeout: DATABASE_TIMEOUT_MS }
	);
});

test('refuses to publish while a required step is still open', async ({ page }) => {
	const conference = await signInWithAConference(page, 'Half Finished MUN');

	const main = await openManagePage(page, conference.publishPath, 'Review and publish');

	// A brand-new conference of 2020 has every required step open: no
	// committee, no description or venue, and no window, because
	// `./draft-conference` gives a draft none.
	await expect(main.getByText('3 steps left before you can publish.')).toBeVisible();
	await expect(main.getByText('Publishing waits for these')).toBeVisible();
	await expect(main.getByRole('button', { name: 'Publish conference' })).toBeDisabled();

	// The action is asked directly as well, because a disabled button only proves
	// what the page did with it.
	const response = await postFormAction(page, `${conference.publishPath}?/publish`);

	expect(response.status()).toBe(400);
	expect(await response.text()).toContain('Finish the required checklist items first.');

	// And nothing moved: the conference is still a draft.
	expect(await readConferenceStatus(conference.id)).toBe('draft');
});

test('deletes a draft once the word is typed, and not before', async ({ page }) => {
	const conference = await signInWithAConference(page, 'Delete Me MUN');

	const main = await openManagePage(page, conference.publishPath, 'Review and publish');

	await expect(main.getByRole('button', { name: 'Delete draft' })).toBeVisible();

	// First without the word. This is the whole point of the field: with no
	// JavaScript `ConfirmButton` still reaches the action once the confirmation
	// page is answered, so the typed word is the only thing between a stray
	// press and a conference that is gone.
	await pressAndConfirm(page, 'Delete draft');

	await expect(main.getByText('Type DELETE to confirm.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect(await conferenceExists(conference.id)).toBe(true);

	// Then with it.
	await main.getByLabel('Type DELETE to confirm').fill('DELETE');
	await pressAndConfirm(page, 'Delete draft');

	// Back to the organiser area: the page this was on has stopped existing.
	await expect(page).toHaveURL('/manage', { timeout: DATABASE_TIMEOUT_MS });
	await expect(page.getByText(`${conference.name} is deleted.`)).toBeVisible();
	expect(await conferenceExists(conference.id)).toBe(false);
});

test('keeps a draft that has been public before, and says why', async ({ page }) => {
	const conference = await signInWithAConference(page, 'Once Public MUN');

	// Published and taken back to a draft, both without the page. The database
	// stamps `first_published_at` on the way up and keeps it on the way down,
	// which is what the foot of the page reads.
	await publishWithoutThePage(conference.id);
	await updateConference(conference.id, { status: 'draft' });

	const main = await openManagePage(page, conference.publishPath, 'Review and publish');

	await expect(
		main.getByText('This draft has been public before, so it cannot be deleted.')
	).toBeVisible();
	await expect(main.getByRole('button', { name: 'Delete draft' })).toHaveCount(0);

	// The action is asked directly as well, with the word typed, because a
	// missing button only proves what the page did with it.
	const response = await postFormAction(page, `${conference.publishPath}?/deleteDraft`, {
		confirmation: 'DELETE'
	});

	expect(response.status()).toBe(400);
	expect(await conferenceExists(conference.id)).toBe(true);
	expect(await readConferenceStatus(conference.id)).toBe('draft');
});

test('numbers each setup step and names the next, and drops the steps once published', async ({
	page
}) => {
	const conference = await signInWithAConference(page, 'Setup Steps MUN');
	const applicationFormPath = `${conference.managePath}/application-form`;

	/*
		Each step of a draft says above its title where it is among the six, and
		in the footer what comes next. The footer's "Back" goes one step back;
		the two optional steps can also be skipped. Matched on the end of each
		`href`, because SvelteKit writes the links of a page it draws on the
		server relative to that page ("../../manage/…").
	*/
	let main = await openManagePage(page, applicationFormPath, 'Application form');

	await expect(main.getByText('Step 3 of 6', { exact: true })).toBeVisible();
	await expect(main.getByText('Step 3 of 6 · next: fees', { exact: true })).toBeVisible();
	await expect(main.getByRole('link', { name: 'Back', exact: true })).toHaveAttribute(
		'href',
		/\/committees$/
	);
	await expect(main.getByRole('button', { name: 'Save and continue' })).toBeVisible();

	main = await openManagePage(page, `${conference.managePath}/fees`, 'Fees');

	await expect(main.getByText('Step 4 of 6 · optional', { exact: true })).toBeVisible();
	await expect(main.getByText('Step 4 of 6 · next: team', { exact: true })).toBeVisible();
	await expect(main.getByRole('link', { name: 'Skip for now' })).toHaveAttribute('href', /\/team$/);

	main = await openManagePage(page, `${conference.managePath}/team`, 'Team');

	await expect(main.getByText('Step 5 of 6 · next: publish', { exact: true })).toBeVisible();

	main = await openManagePage(page, conference.publishPath, 'Review and publish');

	await expect(main.getByText('Step 6 of 6', { exact: true })).toBeVisible();

	// Once published, the application form is an ordinary settings page: no
	// step number, no footer, and a "Save changes" of its own.
	await publishWithoutThePage(conference.id);

	main = await openManagePage(page, applicationFormPath, 'Application form');

	await expect(main.getByRole('button', { name: 'Save changes' })).toBeVisible();
	await expect(main.getByText('Step 3 of 6', { exact: true })).toHaveCount(0);
	await expect(main.getByRole('button', { name: 'Save and continue' })).toHaveCount(0);
});

/**
 * Put one fee against a conference, so that there is money to collect.
 *
 * The fees page has browser tests of its own, so the service-role client
 * writes the row. That there is a fee at all is what settles "Set fees" and
 * raises "Connect Stripe"; what it is for and how much it is change nothing.
 */
async function addFee(conferenceId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('fees')
		.insert({ conference_id: conferenceId, name: 'Delegate fee', amount_cents: 6500 });

	if (error) {
		throw new Error(`Could not write the test fee: ${error.message}`);
	}
}

/** The id of the organisation that runs the conference with this slug. */
async function readOrganizationId(slug: string): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('conferences')
		.select('organization_id')
		.eq('slug', slug)
		.maybeSingle();

	if (error || !data) {
		throw new Error(`Could not find the conference "${slug}": ${error?.message}`);
	}

	return data.organization_id;
}

/**
 * Mark an organisation's Stripe onboarding finished.
 *
 * Finishing it is a round trip to Stripe, and only the `account.updated`
 * webhook (T32) writes this column; the `protect_stripe_columns` trigger
 * refuses a browser. So the service-role client stands in for that webhook.
 */
async function connectStripe(organizationId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('organizations')
		.update({ stripe_onboarding_completed_at: new Date().toISOString() })
		.eq('id', organizationId);

	if (error) {
		throw new Error(`Could not connect Stripe for the test organisation: ${error.message}`);
	}
}

/** Say whether the organisers collect the money themselves, which takes Stripe out of it. */
async function setManualCollection(conferenceId: string, isManual: boolean): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('conferences')
		.update({ collects_payments_manually: isManual })
		.eq('id', conferenceId);

	if (error) {
		throw new Error(`Could not change how the test conference collects money: ${error.message}`);
	}
}

/**
 * The lines of "Publishing waits for these". They are the only items of the
 * "When you publish" section with a link in them; its bullets have none.
 */
function waitingLines(page: Page): Locator {
	return page
		.getByRole('region', { name: 'When you publish' })
		.getByRole('listitem')
		.filter({ has: page.getByRole('link') });
}

test('lets go of each line publishing waits for as the conference is filled in', async ({
	page
}) => {
	const conference = await signInWithAConference(page, 'Checklist MUN');

	const main = await openManagePage(page, conference.publishPath, 'Review and publish');
	const publishButton = main.getByRole('button', { name: 'Publish conference' });

	// A new draft has all three required steps open, in the order the
	// checklist lists them, and the details line says which details are missing.
	await expect(waitingLines(page)).toHaveText([
		/^Add a committee with seats/,
		'Finish the details · A description and tagline, the venue and a contact email',
		/^Set the application window/
	]);

	// Do one step at a time, and the summary asks for one step fewer while that
	// step's line leaves the list. Walking the steps in order is what proves
	// each line reads its own columns and not somebody else's.
	await addCommitteeWithASeat(conference.id);
	await page.reload();

	await expect(main.getByText('2 steps left before you can publish.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(waitingLines(page)).toHaveText([
		/^Finish the details/,
		/^Set the application window/
	]);

	await updateConference(conference.id, {
		description: 'Three days of debate, written out so the description is not empty.',
		tagline: 'Three days of debate on the water.',
		venue_name: 'Beurs van Berlage',
		contact_email: 'hello@example.test'
	});
	await page.reload();

	await expect(main.getByText('1 step left before you can publish.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(waitingLines(page)).toHaveText([/^Set the application window/]);
	await expect(publishButton).toBeDisabled();

	await updateConference(conference.id, {
		applications_open_at: APPLICATIONS_OPEN_AT,
		applications_close_at: APPLICATIONS_CLOSE_AT
	});
	await page.reload();

	// With nothing required left, the warning is gone and Publish can be pressed.
	await expect(main.getByText('Everything required is in place.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(main.getByText('Publishing waits for these')).toHaveCount(0);
	await expect(publishButton).toBeEnabled();
});

test('suggests connecting Stripe only while there is money to collect through it', async ({
	page
}) => {
	const conference = await signInWithAConference(page, 'Fees MUN');

	await openManagePage(page, conference.publishPath, 'Review and publish');

	// A locator describes what to look for rather than holding something already
	// found, so these keep working after each `page.reload()` below.
	const worthDoing = page.getByRole('region', { name: 'Worth doing, not required' });
	const setFees = worthDoing.getByRole('link', { name: 'Set fees' });
	const connectStripeLink = worthDoing.getByRole('link', { name: 'Connect Stripe' });
	// The draft has no banner, so this line stays put through the whole test.
	// Waiting for it after a reload is how the test knows the section has been
	// drawn again, before it says a line is not there.
	const addBanner = worthDoing.getByRole('link', { name: 'Add a banner' });

	// Nothing is charged yet, so telling anybody to connect Stripe would be
	// noise. Neither line stands in the way of publishing: both sit under
	// "Worth doing, not required".
	await expect(addBanner).toBeVisible();
	await expect(setFees).toBeVisible();
	await expect(connectStripeLink).toHaveCount(0);

	// One fee is something to charge, which settles the first line and raises
	// the second.
	await addFee(conference.id);
	await page.reload();

	await expect(connectStripeLink).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(setFees).toHaveCount(0);

	// Organisers who take the money themselves are not collecting it through
	// Stripe, so the suggestion goes away while they do.
	await setManualCollection(conference.id, true);
	await page.reload();

	await expect(addBanner).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(connectStripeLink).toHaveCount(0);

	// Back to card payments, and a connected account is what settles it.
	await setManualCollection(conference.id, false);
	await connectStripe(await readOrganizationId(conference.slug));
	await page.reload();

	await expect(addBanner).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(connectStripeLink).toHaveCount(0);
});
