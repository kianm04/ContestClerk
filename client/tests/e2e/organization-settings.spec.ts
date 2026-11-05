import { expect, test, type APIResponse, type Locator, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { markPage, readMarker, skipWithoutJavaScript } from './in-place';
import { createTestUser, signIn, type TestUser } from './signed-in-user';
import { createDraftConferenceFor, createOrganisationFor } from './draft-conference';
import {
	expectNoSidewaysOverflow,
	expectPageFitsInScreens,
	saveFullPageScreenshot
} from './page-shape';
import { answerConfirmationPage } from './confirmation-page';
import { waitUntilAnswered } from './chair-room-fixtures';
import {
	AT_ONCE_TIMEOUT_MS,
	answerSlowly,
	answerWithError,
	sawSpinner,
	watchForSpinners
} from './instant';

// The acceptance criteria of `specs/05-pages/organiser/organization-settings.md`
// that need a real browser: the organisation settings page at
// `/manage/organizations/[orgSlug]`, where the people who run an organisation
// keep its public details, its team and its Stripe connection in order.
//
// * an owner sees every form, and a plain member sees the same page with the
//   forms replaced by plain text;
// * the details form saves the name and the description, and says so;
// * a logo chosen in the file box is uploaded, and the bytes really land in the
//   `public-media` bucket; a file that is not a picture is refused;
// * a name left out is refused with the sentence the spec gives, and nothing is
//   saved;
// * inviting somebody creates an invitation and shows the `/invites/[token]`
//   link, because there is no email yet;
// * a second invitation to the same address, and an invitation to somebody who
//   is already a member, are each refused;
// * revoking an invitation takes it off the pending list;
// * somebody else's new role shows at once, and a refused removal goes back
//   (T142);
// * the last owner cannot be demoted;
// * deleting is refused while the organisation still runs conferences;
// * "View public page" opens `/organizations/[slug]`;
// * the Payments section says the organisation has no Stripe account yet;
// * the page does not spill off the side of a phone, and does not run on for
//   screens on a desktop.
//
// Two criteria are not here. "Connect Stripe redirects to Stripe onboarding" is
// left out on purpose: this machine has no `STRIPE_SECRET_KEY`, so pressing the
// button could only ever prove that Stripe could not be reached. And "delete
// succeeds otherwise" would take the organisation the rest of a test stands on
// away with it; `tests/db` is where an empty organisation being deletable
// belongs.
//
// EVERY FORM WITHOUT JAVASCRIPT
// "All forms work without JavaScript" is met by these tests running on the
// `desktop-no-js` project like every other browser test, rather than by tests of
// their own — which would leave those same forms unchecked on the two projects
// that do have JavaScript. Every control they use is a real submit button in a
// real `<form method="post">` with a form action behind it. The two tests that
// measure a page are the exception: they ask the browser for its own
// dimensions, and each runs on one project alone.
//
// WHAT THESE TESTS LEAVE BEHIND
// Each test makes its own conference through `./draft-conference`, with an
// organisation of its own, and then works on that organisation alone. What it
// creates stays in the database until the next `pnpm db:reset`, and that is
// safe for the reason `tests/e2e/manage-team.spec.ts` gives: the conferences
// are dated in 2020, and `/conferences` lists conferences that are published
// *and* have not finished, so nothing `tests/e2e/conferences.spec.ts` counts
// can see them. Nothing here touches an organisation, a member or an invitation
// from `supabase/seed.sql`, so there is nothing for another suite to trip over
// and nothing to put back in a `finally`.
//
// The three projects run at the same time against the one local database, so
// every account, every conference, every organisation and every address below
// is made fresh by the test that uses it. No test reaches for "the pending
// invitation" or "the first member".
//
// `pressAndConfirm` and `postFormAction` below are copies of the ones in
// `tests/e2e/manage-team.spec.ts` and `tests/e2e/manage-details.spec.ts`, and
// are deliberately copies rather than shared imports for the reason those files
// give.

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
 * The days every conference these tests create runs on.
 *
 * Both are in the past, for the reason at the top of this file.
 */
const CONFERENCE_FIRST_DAY = '2020-05-03';
const CONFERENCE_LAST_DAY = '2020-05-05';

/**
 * How many windows tall the settings page may be with a real organisation on it.
 *
 * Three is the ceiling the conference dashboard, the details editor, the
 * committees list and the team page are all held to, and the reason is the
 * same: more than that would mean these rows are being drawn too big to be
 * scanned, which is exactly what `tests/e2e/page-shape.ts` exists to notice.
 */
const ORGANIZATION_SETTINGS_SCREENS = 3;

/** What the details form types into the Description box when a test saves it. */
const EDITED_DESCRIPTION =
	'We run three conferences a year for schools across the Randstad, and have done since 2011.';

/**
 * A name nothing else in the database will match, so that a test can read its
 * own organisation's page without another run's rows getting in the way.
 */
function unusedName(prefix: string): string {
	return `${prefix} ${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * An address nobody has an account for.
 *
 * Inviting one is the ordinary case — an organisation invites somebody who has
 * never heard of MUNMeet — and it also keeps two tests running side by side
 * from inviting the same person.
 */
function unusedEmail(): string {
	return `e2e-organization-invite-${crypto.randomUUID()}@example.com`;
}

/** A signed-in account with an organisation of its own, ready for a test to work on. */
type TestOrganization = {
	/** The account that created it, and so its only owner. */
	user: TestUser;
	id: string;
	slug: string;
	/** The organisation's name, which is the page's `<h1>`. */
	name: string;
	/** The `/manage/organizations/<slug>` address this file is about. */
	settingsPath: string;
};

/** Sign a brand-new account in and give it a conference, and so an organisation, of its own. */
async function signInWithAnOrganization(page: Page, prefix: string): Promise<TestOrganization> {
	const user = await createTestUser('Priya Nair');
	await signIn(page, user);

	// No country and no city: the tests below prove that what a save leaves
	// untouched stays empty, so the row starts with those columns empty. The
	// conference makes the organisation one that "still runs conferences".
	const { id, slug, name } = await createOrganisationFor(user, {
		name: unusedName(`${prefix} Society`),
		city: null,
		countryCode: null
	});
	await createDraftConferenceFor(user, {
		name: unusedName(prefix),
		organizationId: id,
		startDate: CONFERENCE_FIRST_DAY,
		endDate: CONFERENCE_LAST_DAY
	});

	return { user, id, slug, name, settingsPath: `/manage/organizations/${slug}` };
}

/**
 * Sign in, make an organisation and open its settings page, which is where
 * every test below starts.
 *
 * Waiting for the heading rather than simply for the address is what says the
 * page has arrived: a test that pressed too early would press the page it was
 * leaving. The heading is the organisation's own name,
 * which is also what proves this is the right organisation's page.
 */
async function openSettingsPage(page: Page, prefix: string): Promise<TestOrganization> {
	const organization = await signInWithAnOrganization(page, prefix);

	await page.goto(organization.settingsPath);

	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
		organization.name,
		{ timeout: DATABASE_TIMEOUT_MS }
	);

	return organization;
}

/**
 * End the session through the real `/logout` form, so that the same browser can
 * sign in as somebody else.
 *
 * `/login` sends an account that is already signed in straight back to its home
 * page, so a second `signIn` only works once the first session is over.
 */
async function signOut(page: Page): Promise<void> {
	await page.goto('/logout');
	await page.getByRole('button', { name: 'Log out' }).press('Enter');
	await page.waitForURL('/', { timeout: DATABASE_TIMEOUT_MS });
}

/*
	The forms on the page. A `<form>` is not a landmark a screen reader names, so
	there is no role to ask for it by; the submit button inside it is what tells
	one from another. Everything a test fills in is looked for inside the form it
	belongs to, because the same words label more than one box: "Role" names the
	dropdown in the invitation form and one in every member's row as well.
*/

/** The organisation's details form, whose submit button says "Save changes". */
function detailsForm(page: Page): Locator {
	return page.locator('form').filter({ has: page.getByRole('button', { name: 'Save changes' }) });
}

/** The "invite a member" form, whose submit button says "Send invitation". */
function inviteForm(page: Page): Locator {
	return page
		.locator('form')
		.filter({ has: page.getByRole('button', { name: 'Send invitation' }) });
}

/** What `sendInvitationThroughTheForm` fills the invitation form in with. */
type NewInvitation = {
	email: string;
	/** The words on the choice in the Role dropdown: "Admin" or "Member". */
	role: string;
};

/** Fill the invitation form in and send it, the way an owner does. */
async function sendInvitationThroughTheForm(page: Page, invitation: NewInvitation): Promise<void> {
	const form = inviteForm(page);

	await form.getByLabel('Email').fill(invitation.email);
	await form.getByLabel('Role').selectOption({ label: invitation.role });
	await form.getByRole('button', { name: 'Send invitation' }).press('Enter');
}

/**
 * Press a button and answer the question it asks, if it asks one.
 *
 * With JavaScript the press opens a `<dialog>` and the dialog's own button is
 * what submits. Without it — which is the `desktop-no-js` project, and also any
 * page whose script has not landed yet — the press opens a confirmation page
 * asking the same question, whose own button is what submits. Both are the
 * right behaviour, so this waits to see which of the two happened rather than
 * assuming one. It is a copy of the one in `tests/e2e/manage-team.spec.ts`.
 */
async function pressAndConfirm(page: Page, scope: Locator, label: string): Promise<void> {
	// The dialog holds a second button with the same words on it, so the one in
	// the page itself is the first of the two. While the dialog is shut the
	// browser hides everything inside it, so until then there is only one.
	const button = scope.getByRole('button', { name: label }).first();
	const dialogButton = page.getByRole('dialog').getByRole('button', { name: label });

	await button.press('Enter');

	// `waitFor` throws when nothing turns up in the time it is given, and that is
	// the "no dialog" answer.
	const isAsking = await dialogButton
		.waitFor({ state: 'visible', timeout: SINGLE_TRY_TIMEOUT_MS })
		.then(() => true)
		.catch(() => false);

	if (isAsking) {
		await dialogButton.press('Enter');
		return;
	}

	// No dialog means one of two things. Either there was no script, and the
	// press opened the confirmation page, or the button does not ask at all and
	// has already posted to its action, as "Revoke" does. Only the first leaves
	// the browser on `/confirm`.
	await page.waitForLoadState();

	if (new URL(page.url()).pathname === '/confirm') {
		await answerConfirmationPage(page, label);
	}
}

/**
 * Post to one of the page's form actions the way a browser posts a form.
 *
 * A copy of the helper in `tests/e2e/manage-details.spec.ts`, and for the same
 * reason: what a page happens to draw proves only what the page did, while the
 * criterion is that the action itself refuses. `page.request` carries the
 * browser's own cookies, so the post arrives signed in as the account the test
 * signed in. Two headers are written by hand. `origin`, because SvelteKit
 * refuses a form post that looks as though it came from another website and
 * Playwright's request does not send that header itself. And
 * `accept: text/html`, because that is how SvelteKit tells a form post from a
 * page with no JavaScript from one made by `use:enhance`: without it the answer
 * is the action's result as JSON, and with it the page is drawn again carrying
 * whatever the action decided, which is what a browser with no script really
 * receives.
 */
async function postFormAction(
	page: Page,
	action: string,
	fields: Record<string, string>
): Promise<APIResponse> {
	const origin = new URL(page.url()).origin;

	return page.request.post(action, {
		form: fields,
		headers: { origin, accept: 'text/html' }
	});
}

/**
 * Put somebody in the organisation without going through an invitation.
 *
 * Inviting is where these rows really come from, and the invitation form is
 * proved by the tests below; accepting one on somebody else's behalf is a whole
 * second browser session per person, which `tests/e2e/invite-accept.spec.ts`
 * does once. Here a member is only somebody for the page to list, so the
 * service-role client writes the row the way an accepted invitation would.
 */
async function addMember(
	organizationId: string,
	user: TestUser,
	role: 'owner' | 'admin' | 'member'
): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('organization_members')
		.insert({ organization_id: organizationId, user_id: user.id, role });

	if (error) {
		throw new Error(`Could not put the test account in the organisation: ${error.message}`);
	}
}

/** What the database says somebody is in this organisation, or `null` when they are nothing. */
async function readMemberRole(organizationId: string, userId: string): Promise<string | null> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('organization_members')
		.select('role')
		.eq('organization_id', organizationId)
		.eq('user_id', userId)
		.maybeSingle();

	if (error) {
		throw new Error(`Could not read the test membership: ${error.message}`);
	}

	return data ? data.role : null;
}

/** The columns of an organisation that a test writes straight into the row. */
type OrganizationColumns = {
	description?: string;
	country_code?: string;
	website_url?: string;
};

/**
 * Fill in columns a new organisation starts without, so that a test can start
 * from a row that already has them.
 *
 * The details form is what really writes these, and the tests above prove it;
 * here they are only a starting point, so spending a form post on them would
 * make the test about something it is not.
 */
async function setOrganizationColumns(
	organizationId: string,
	columns: OrganizationColumns
): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin.from('organizations').update(columns).eq('id', organizationId);

	if (error) {
		throw new Error(`Could not write the test organisation's columns: ${error.message}`);
	}
}

/**
 * A real 1x1 pixel PNG, all seventy bytes of it, written out as base64.
 *
 * `setInputFiles` takes a name, a type and the bytes themselves, so a test can
 * hand the form a picture that is on no disk anywhere and this repository need
 * carry no binary file. The same trick as `tests/e2e/manage-details.spec.ts`
 * and `tests/e2e/profile.spec.ts`.
 */
const SMALL_PNG_BASE64 =
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** That PNG as a file box receives it: a picture under every limit there is. */
const SMALL_LOGO_PNG = {
	name: 'logo.png',
	mimeType: 'image/png',
	buffer: Buffer.from(SMALL_PNG_BASE64, 'base64')
};

/** The bucket every picture in the app lives in. `02-architecture/storage.md`. */
const PUBLIC_MEDIA_BUCKET = 'public-media';

/** Where this organisation's `logo_path` points, or `null` while it has none. */
async function readLogoPath(organizationId: string): Promise<string | null> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('organizations')
		.select('logo_path')
		.eq('id', organizationId)
		.maybeSingle();

	if (error) {
		throw new Error(`Could not read the test organisation's logo: ${error.message}`);
	}

	return data?.logo_path ?? null;
}

/**
 * The files really sitting in this organisation's folder of the bucket.
 *
 * The row saying where a picture is and the picture being there are two
 * different facts, and only this one shows that the bytes made the trip.
 * `expectFolderHolds` in `tests/e2e/manage-details.spec.ts` does the same for a
 * conference's folder.
 */
async function listLogoObjectNames(organizationId: string): Promise<string[]> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin.storage
		.from(PUBLIC_MEDIA_BUCKET)
		.list(`organizations/${organizationId}`);

	if (error) {
		throw new Error(`Could not list the test organisation's folder: ${error.message}`);
	}

	return (data ?? []).map((object) => object.name);
}

/** One `organizations` row as the tests below read it back, or nothing at all. */
type OrganizationRow = {
	name: string;
	description: string | null;
	/*
		The last two are named the way the database names them, because what these
		tests check is exactly what Postgres stored. They are read at all because
		an optional box left empty has to end up as `null`: `country_code` is a
		`char(2)`, so an empty string saved into it comes back as two spaces, and
		a page cannot show the difference between that and nothing.
	*/
	country_code: string | null;
	website_url: string | null;
};

/** What the database really holds for this organisation, which is the half a page cannot prove. */
async function readOrganizationRow(organizationId: string): Promise<OrganizationRow | null> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('organizations')
		.select('name, description, country_code, website_url')
		.eq('id', organizationId)
		.maybeSingle();

	if (error) {
		throw new Error(`Could not read the test organisation: ${error.message}`);
	}

	return data;
}

/**
 * Write a pending invitation straight into the table, and answer nothing.
 *
 * The two tests that measure the page want pending invitations on it without
 * spending a form post on each one, and the shape of a row is what they are
 * about. The invitation form itself is proved by the tests above. `token` holds
 * 32 url-safe characters, which is what a UUID with its dashes taken out is.
 */
async function addInvite(
	organizationId: string,
	invitedBy: string,
	email: string,
	role: 'admin' | 'member'
): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin.from('invites').insert({
		kind: 'organization_member',
		organization_id: organizationId,
		email,
		role,
		token: crypto.randomUUID().replaceAll('-', ''),
		invited_by: invitedBy
	});

	if (error) {
		throw new Error(`Could not write the test invitation: ${error.message}`);
	}
}

/** The token of the invitation this organisation has for this address. */
async function readInviteToken(organizationId: string, email: string): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('invites')
		.select('token')
		.eq('organization_id', organizationId)
		.eq('email', email)
		.maybeSingle();

	if (error || !data) {
		throw new Error(`Could not find the invitation for ${email}: ${error?.message}`);
	}

	return data.token;
}

/** How many invitations this organisation is still waiting on. */
async function countPendingInvites(organizationId: string): Promise<number> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('invites')
		.select('id')
		.eq('organization_id', organizationId)
		.is('accepted_at', null);

	if (error || !data) {
		throw new Error(`Could not count the test invitations: ${error?.message}`);
	}

	return data.length;
}

/*
	Every test here signs a brand-new account in, seeds a draft conference,
	opens the settings page and then fills a form in, sometimes several times.
	That is a great deal more than most browser tests do, and thirty seconds —
	what Playwright allows a test by default — is not always enough for it while
	the whole suite is asking the one local database at once. `test.slow()`
	triples that allowance. It is an allowance and not a wait: a test that is
	quick still finishes as quickly as it can.
*/
test.beforeEach(() => {
	test.slow();
});

test('shows every form to an owner and plain text to a member', async ({ page }) => {
	const organization = await openSettingsPage(page, 'Read Only Settings MUN');

	// The owner. Creating a conference makes the account the owner of the
	// organisation that runs it, so this is the page as the person who made it
	// sees it: three forms and the danger zone.
	await expect(detailsForm(page).getByLabel('Name', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Send invitation' })).toBeVisible();

	// The danger zone is there, but this organisation runs the conference that
	// made it, so it explains the refusal rather than drawing a button nobody
	// could use. `refuses to delete an organisation that still runs conferences`
	// below posts to the action and gets the same sentence back.
	await expect(page.getByRole('heading', { name: 'Danger zone' })).toBeVisible();
	await expect(page.getByText('Delete or move its conferences first.')).toBeVisible();

	// Something for the next reader to see. A brand-new organisation has only a
	// name, and "members see the values as text" says nothing about a page with
	// no values on it.
	await setOrganizationColumns(organization.id, { description: EDITED_DESCRIPTION });

	const member = await createTestUser('Noor Haddad');

	await addMember(organization.id, member, 'member');
	await signOut(page);
	await signIn(page, member);
	await page.goto(organization.settingsPath);

	const main = page.getByRole('main');

	// The same organisation, with its name and its details on the page.
	await expect(main.getByRole('heading', { level: 1 })).toHaveText(organization.name, {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(main.getByText(EDITED_DESCRIPTION)).toBeVisible();

	// And nothing at all to press: no form to save with, nobody to invite and
	// nobody to remove.
	await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Send invitation' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Remove' })).toHaveCount(0);

	// The danger zone belongs to owners alone, so a member does not even see the
	// sentence explaining why deleting is refused.
	await expect(page.getByRole('heading', { name: 'Danger zone' })).toHaveCount(0);
});

test('answers somebody who does not belong to the organisation with a 404', async ({ page }) => {
	const organization = await signInWithAnOrganization(page, 'Not A Member Settings MUN');

	// A fresh account, signed in but never added to `organization_members`.
	// `requireOrganizationMember` answers a non-member the same 404 it answers a
	// slug that does not exist, so that the address gives nothing away.
	const stranger = await createTestUser('Iris Kowalski');
	await signOut(page);
	await signIn(page, stranger);

	const response = await page.goto(organization.settingsPath);

	expect(response?.status()).toBe(404);
});

test("saves the organisation's name and description", async ({ page }) => {
	const organization = await openSettingsPage(page, 'Saved Settings MUN');
	const editedName = unusedName('Renamed Settings Society');
	const form = detailsForm(page);

	// `exact: true` on the name, so that a longer label starting with the same
	// word — the invitation form's own fields, or a country box — could never
	// answer to it as well.
	await form.getByLabel('Name', { exact: true }).fill(editedName);
	await form.getByLabel('Description', { exact: true }).fill(EDITED_DESCRIPTION);
	await form.getByRole('button', { name: 'Save changes' }).press('Enter');

	// The flash message floats above the page rather than inside `<main>`, which
	// is why this assertion is not scoped to it. It is checked first, because
	// with JavaScript the message takes itself off the page after five seconds.
	await expect(page.getByText('Organisation details saved.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// The page is drawn again from the saved row, so the heading is the new name.
	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(editedName);
	await expect(page).toHaveURL(organization.settingsPath);

	// What the database really holds afterwards. The country and the website were
	// never touched, so both stay empty — and empty means `null`, not ''.
	expect(await readOrganizationRow(organization.id)).toEqual({
		name: editedName,
		description: EDITED_DESCRIPTION,
		country_code: null,
		website_url: null
	});
});

test('refuses details with no name, and saves nothing', async ({ page }) => {
	const organization = await openSettingsPage(page, 'Nameless Settings MUN');
	const form = detailsForm(page);

	/*
		Spaces rather than an empty box. The name is a required field, so a browser
		stops a truly empty one before it is ever sent and the server never gets to
		answer. Spaces pass the browser's own check and are empty to the server,
		which trims what it is given — so this is the shortest route to the
		sentence the spec asks for.
	*/
	await form.getByLabel('Name', { exact: true }).fill('   ');
	await form.getByRole('button', { name: 'Save changes' }).press('Enter');

	await expect(page.getByRole('main').getByText('Please enter a name.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// Nothing was written: the row still holds the name it was made with.
	expect(await readOrganizationRow(organization.id)).toEqual({
		name: organization.name,
		description: null,
		country_code: null,
		website_url: null
	});
});

test('clears the country and the website to nothing rather than to empty text', async ({
	page
}) => {
	const organization = await openSettingsPage(page, 'Optional Settings MUN');

	/*
		Written straight into the row rather than saved through the form first,
		so that this test makes one submit and waits for one "Organisation details
		saved." message. Two saves would show the same words twice, and the second
		check could pass on the message the first one left behind.
	*/
	await setOrganizationColumns(organization.id, {
		country_code: 'NL',
		website_url: 'https://thimun.org'
	});
	await page.reload();

	const form = detailsForm(page);

	// The form is drawn from the saved row, so this is also what proves a real
	// country and a real website come back out of `load` the way they went in.
	await expect(form.getByLabel('Country', { exact: true })).toHaveValue('NL', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(form.getByLabel('Website', { exact: true })).toHaveValue('https://thimun.org');

	// Empty both boxes and save. '' is what a cleared box sends.
	await form.getByLabel('Country', { exact: true }).selectOption('');
	await form.getByLabel('Website', { exact: true }).fill('');
	await form.getByRole('button', { name: 'Save changes' }).press('Enter');

	await expect(page.getByText('Organisation details saved.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	/*
		Both columns hold `null`, not empty text. It matters most for
		`country_code`, which is a `char(2)`: Postgres pads '' out to two spaces,
		and `OrganizationHeader` draws a flag for any code it is handed, so a
		cleared country would put a broken picture and a blank name on the public
		organisation page.
	*/
	expect(await readOrganizationRow(organization.id)).toEqual({
		name: organization.name,
		description: null,
		country_code: null,
		website_url: null
	});
});

test('uploads a logo, and the picture really lands in the bucket', async ({ page }) => {
	const organization = await openSettingsPage(page, 'Logo Settings MUN');
	const main = page.getByRole('main');

	// A brand-new organisation has no picture, so the avatar beside the box is
	// drawn from the name's initials.
	expect(await readLogoPath(organization.id)).toBeNull();

	await main.getByLabel('Logo', { exact: true }).setInputFiles(SMALL_LOGO_PNG);
	await main.getByRole('button', { name: 'Save changes' }).press('Enter');

	await expect(page.getByText('Organisation details saved.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	/*
		Both halves, because only the two together say the upload worked: the row
		points at a path under this organisation's own folder, and an object is
		really sitting at it. A test that read the row alone would pass on a form
		that saved a path and uploaded nothing.
	*/
	const logoPath = await readLogoPath(organization.id);

	expect(logoPath).toMatch(new RegExp(`^organizations/${organization.id}/logo-.+\\.png$`));

	await expect(async () => {
		const names = await listLogoObjectNames(organization.id);

		expect(names).toEqual([logoPath?.split('/').at(-1)]);
	}).toPass({ timeout: DATABASE_TIMEOUT_MS });
});

test('refuses a file that is not a picture, and keeps the logo it had', async ({ page }) => {
	const organization = await openSettingsPage(page, 'Wrong File Settings MUN');
	const main = page.getByRole('main');

	await main.getByLabel('Logo', { exact: true }).setInputFiles({
		name: 'programme.pdf',
		mimeType: 'application/pdf',
		buffer: Buffer.from('%PDF-1.4 not really a pdf')
	});
	await main.getByRole('button', { name: 'Save changes' }).press('Enter');

	await expect(main.getByText('Please upload a JPEG, PNG or WebP image.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	expect(await readLogoPath(organization.id)).toBeNull();
	expect(await listLogoObjectNames(organization.id)).toEqual([]);
});

test('shows "No pending invitations." before anybody has been invited', async ({ page }) => {
	const organization = await openSettingsPage(page, 'No Invites Settings MUN');

	await expect(
		page.getByRole('main').getByText('No pending invitations.', { exact: true })
	).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	expect(await countPendingInvites(organization.id)).toBe(0);
});

test('invites somebody and shows the link to send them', async ({ page }) => {
	const organization = await openSettingsPage(page, 'Invite Member MUN');
	const invited = unusedEmail();

	await sendInvitationThroughTheForm(page, { email: invited, role: 'Member' });

	// Email delivery is Phase 2, so the page hands the owner the link and asks
	// them to send it themselves.
	await expect(page.getByText(`Invitation created. Share the link with ${invited}.`)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// And the link really is this invitation's: the token on the page is the
	// token in the row that was just written.
	const token = await readInviteToken(organization.id, invited);
	const main = page.getByRole('main');

	await expect(main.getByText(`/invites/${token}`)).toBeVisible();

	/*
		The invitation is then read back through the page rather than out of the
		database, because "creates an invitation" means the owner can see one: the
		address is on the pending list with the one thing that can still be done
		with it. `.first()` because the address is in two places at once here — the
		notice holding the link, and the row underneath it.
	*/
	await expect(main.getByText(invited, { exact: true }).first()).toBeVisible();
	await expect(main.getByRole('button', { name: 'Revoke' })).toBeVisible();

	expect(await countPendingInvites(organization.id)).toBe(1);
});

test('inviting somebody answers in place without reloading', async ({ page }, testInfo) => {
	// T125: this form used to post and reload the page. `InviteMemberForm`'s
	// action stays put rather than redirecting, so a marker left on `window`
	// before sending (`./in-place.ts`) proves the press did not reload, and
	// `isResetAfterSave` is what empties the email box again.
	skipWithoutJavaScript(testInfo);
	const organization = await openSettingsPage(page, 'In Place Invite MUN');
	const invited = unusedEmail();

	await markPage(page);
	await sendInvitationThroughTheForm(page, { email: invited, role: 'Member' });

	await expect(page.getByText(`Invitation created. Share the link with ${invited}.`)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.getByRole('main').getByText(invited, { exact: true }).first()).toBeVisible();
	await expect(inviteForm(page).getByLabel('Email')).toHaveValue('');
	expect(await readMarker(page)).toBe('still here');
	expect(await countPendingInvites(organization.id)).toBe(1);
});

test('refuses a second invitation to the same address', async ({ page }) => {
	const organization = await openSettingsPage(page, 'Duplicate Invite MUN');
	const invited = unusedEmail();

	await sendInvitationThroughTheForm(page, { email: invited, role: 'Member' });

	await expect(page.getByText(`Invitation created. Share the link with ${invited}.`)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// The same address a second time, and as a different role, so that nothing
	// but the address could be what the refusal is about.
	await sendInvitationThroughTheForm(page, { email: invited, role: 'Admin' });

	await expect(
		page.getByRole('main').getByText('There is already a pending invitation for that address.')
	).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	// The refusal wrote nothing: the invitation from the top of the test is still
	// the only one.
	expect(await countPendingInvites(organization.id)).toBe(1);
});

test('refuses an invitation to somebody who is already a member', async ({ page }) => {
	const organization = await openSettingsPage(page, 'Already Member MUN');
	const member = await createTestUser('Aiko Tanaka');

	await addMember(organization.id, member, 'member');
	await page.reload();

	await expect(page.getByRole('main').getByText(member.fullName, { exact: true })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	await sendInvitationThroughTheForm(page, { email: member.email, role: 'Admin' });

	await expect(page.getByRole('main').getByText('That person is already a member.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	expect(await countPendingInvites(organization.id)).toBe(0);
});

test('revokes an invitation and takes it off the pending list', async ({ page }) => {
	const organization = await openSettingsPage(page, 'Revoke Invite MUN');
	const invited = unusedEmail();

	await sendInvitationThroughTheForm(page, { email: invited, role: 'Member' });

	await expect(page.getByText(`Invitation created. Share the link with ${invited}.`)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	const main = page.getByRole('main');

	// `pressAndConfirm` rather than a plain press, because it works whether or
	// not revoking asks first: it presses, and answers a dialog only if one
	// opens.
	await pressAndConfirm(page, main, 'Revoke');

	await expect(page.getByText('Invitation revoked.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// The row is gone rather than merely hidden: the address has left the page
	// and the table has nothing left in it for this organisation.
	await expect(main.getByText(invited, { exact: true })).toHaveCount(0);
	expect(await countPendingInvites(organization.id)).toBe(0);
});

test("changes somebody's role at once, and puts a refused removal back", async ({
	page
}, testInfo) => {
	skipWithoutJavaScript(testInfo);

	const organization = await openSettingsPage(page, 'Instant Members MUN');
	const member = await createTestUser('Noor Haddad');
	await addMember(organization.id, member, 'member');
	await page.reload();

	// The members list holds one `<li>` per person; this is Noor's.
	const row = page.getByRole('main').getByRole('listitem').filter({ hasText: 'Noor Haddad' });
	await expect(row.getByRole('paragraph').getByText('Member', { exact: true })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// T142: the row says "Admin" before the server has answered, and no
	// spinner is drawn while it waits.
	await answerSlowly(page, 'changeRole');
	await watchForSpinners(page);
	await row.getByLabel('Role').selectOption('admin');
	await row.getByRole('button', { name: 'Save role' }).click();

	await expect(row.getByRole('paragraph').getByText('Admin', { exact: true })).toBeVisible({
		timeout: AT_ONCE_TIMEOUT_MS
	});
	await waitUntilAnswered(page);
	expect(await sawSpinner(page)).toBe(false);
	expect(await readMemberRole(organization.id, member.id)).toBe('admin');

	// A removal the server refuses goes back, with a toast naming it.
	await answerWithError(page, 'removeMember');
	await pressAndConfirm(page, row, 'Remove');

	await expect(page.getByRole('alert')).toContainText('The member was not removed.', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(page);
	await expect(row.getByRole('paragraph').getByText('Admin', { exact: true })).toBeVisible();
	expect(await readMemberRole(organization.id, member.id)).toBe('admin');
});

test('refuses to demote the last owner', async ({ page }) => {
	const organization = await openSettingsPage(page, 'Last Owner MUN');

	/*
		The change is posted to the action rather than made with the role dropdown
		on the page. The reader's own row is the only row in a brand-new
		organisation, and whether the page offers that row a dropdown at all is a
		choice the page makes; the criterion is that the change is refused however
		it arrives, which is where `prevent_last_owner_removal` in the database and
		the sentence the action turns it into live. `postFormAction` asks for the
		page back as HTML, so the answer holds whatever the owner would have been
		shown — a message beside the row, or a flash after a redirect.
	*/
	const response = await postFormAction(page, `${organization.settingsPath}?/changeRole`, {
		userId: organization.user.id,
		role: 'member'
	});

	expect(await response.text()).toContain(
		'An organisation needs at least one owner. Make someone else an owner first.'
	);

	// And the refusal really refused: the creator is still the owner.
	expect(await readMemberRole(organization.id, organization.user.id)).toBe('owner');
});

test('refuses to delete an organisation that still runs conferences', async ({ page }) => {
	const organization = await openSettingsPage(page, 'Delete Refused MUN');

	/*
		Posted to the action for the same reason as the test above: the layout in
		the page spec offers deleting "only without conferences", which leaves it
		open whether the page draws the button at all while there is a conference,
		and the refusal itself is the criterion. The organisation is deliberately
		left standing afterwards — everything else this test says would lose its
		ground with it. `confirm` is the hidden field a `ConfirmButton` posts, so
		this is the post the button would have made.
	*/
	const response = await postFormAction(page, `${organization.settingsPath}?/deleteOrganization`, {
		confirm: '1'
	});

	expect(await response.text()).toContain('Delete or move its conferences first.');

	// The organisation is still there, under its own name.
	expect(await readOrganizationRow(organization.id)).toEqual({
		name: organization.name,
		description: null,
		country_code: null,
		website_url: null
	});
});

test('links to the public organisation page', async ({ page }) => {
	const organization = await openSettingsPage(page, 'Public Link MUN');
	const main = page.getByRole('main');

	// A `Button` given an `href` draws a real `<a>`, which is why this is a link
	// and not a button.
	const link = main.getByRole('link', { name: 'View public page' });

	/*
		Where it leads is asserted by following it rather than by reading the
		`href`. `resolve()` from `$app/paths` answers a *relative* address while a
		page is being built on the server, so without JavaScript this attribute is
		`../../organizations/<slug>`, which the browser resolves to the same place.
		T64 in the ledger is the task about that, and it is about the top bar's
		active link rather than about this one.
	*/
	await expect(link).toHaveAttribute('href', new RegExp(`organizations/${organization.slug}$`));

	await link.click();

	await expect(page).toHaveURL(`/organizations/${organization.slug}`, {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
		organization.name,
		{ timeout: DATABASE_TIMEOUT_MS }
	);
});

test('says the organisation has no Stripe account yet', async ({ page }) => {
	await openSettingsPage(page, 'Stripe Card MUN');

	const main = page.getByRole('main');

	// A brand-new organisation has neither `stripe_account_id` nor
	// `stripe_onboarding_completed_at`, which is the `none` state of
	// `stripeConnectionState`.
	await expect(main.getByRole('heading', { name: 'Payments' })).toBeVisible();
	await expect(main.getByText('Not connected')).toBeVisible();
	await expect(main.getByText('Connect a Stripe account to collect delegate fees.')).toBeVisible();

	/*
		And no button, because this machine has no `STRIPE_SECRET_KEY`: the card
		says so instead of offering a button whose only possible answer is "Stripe
		could not be reached". `.env.example` documents the three Stripe variables,
		and T55 is the task that sets them for real; until then this is the state
		every developer and every browser test sees.
	*/
	await expect(main.getByText('Stripe is not set up on this server yet.')).toBeVisible();
	await expect(main.getByRole('button', { name: 'Connect Stripe' })).toHaveCount(0);
});

test('does not spill off the side of a phone screen', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	// Long names and a long address on purpose. A line that may not wrap is as
	// wide as its text however narrow its column is, which is what pushes a page
	// sideways, and a short name would never show it.
	const organization = await openSettingsPage(
		page,
		'Phone Settings International Model United Nations'
	);

	await setOrganizationColumns(organization.id, {
		description: EDITED_DESCRIPTION,
		website_url: 'https://www.an-extremely-long-organisation-address.example.com'
	});

	const member = await createTestUser('Maximiliano Alessandro Fernández de la Vega');

	await addMember(organization.id, member, 'admin');
	await addInvite(
		organization.id,
		organization.user.id,
		'a-new-member-with-a-long-address@averylongschoolnameindeed.example.com',
		'member'
	);

	await page.reload();

	// Wait for the page to be the one this test is about before measuring it.
	await expect(page.getByRole('main').getByText(member.fullName, { exact: true })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	await expectNoSidewaysOverflow(page);
});

test('fits in a few screens', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough to measure a height.');

	const organization = await openSettingsPage(page, 'Height Check Settings MUN');

	await setOrganizationColumns(organization.id, { description: EDITED_DESCRIPTION });

	// An organisation of the size a small one really is: four people beside the
	// owner, and two invitations still out.
	const team: { name: string; role: 'admin' | 'member' }[] = [
		{ name: 'Noor Haddad', role: 'admin' },
		{ name: 'Aiko Tanaka', role: 'admin' },
		{ name: 'Luis Moreno', role: 'member' },
		{ name: 'Emma Janssen', role: 'member' }
	];

	for (const person of team) {
		const user = await createTestUser(person.name);

		await addMember(organization.id, user, person.role);
	}

	await addInvite(organization.id, organization.user.id, unusedEmail(), 'admin');
	await addInvite(organization.id, organization.user.id, unusedEmail(), 'member');

	await page.reload();

	await expect(page.getByRole('main').getByText('Emma Janssen', { exact: true })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// Saved before the assertion, so that a failure leaves a picture of the page
	// that failed it.
	await saveFullPageScreenshot(page, 'organization-settings');
	await expectPageFitsInScreens(page, ORGANIZATION_SETTINGS_SCREENS);
});
