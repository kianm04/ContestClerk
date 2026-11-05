import { expect, test, type APIResponse, type Locator, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { createTestUser, signIn, type TestUser } from './signed-in-user';
import { createDraftConferenceFor } from './draft-conference';
import {
	expectNoSidewaysOverflow,
	expectPageFitsInScreens,
	saveFullPageScreenshot
} from './page-shape';
import { answerConfirmationPage } from './confirmation-page';
import { waitUntilAnswered } from './chair-room-fixtures';
import { markPage, readMarker, skipWithoutJavaScript } from './in-place';

// The acceptance criteria of `specs/05-pages/organiser/fees.md` that need a real
// browser, for the two sections task T66 builds: "How you collect payments" and
// the fee definitions at `/manage/[slug]/fees`.
//
// * a fee cannot be added until either Stripe is connected or the organiser has
//   said they collect the money outside MUNMeet;
// * card collection is refused while the organisation has not been through
//   Stripe onboarding, and allowed once it has;
// * manual collection needs payment instructions, and the choice is still there
//   after a refresh;
// * a fee can be added, listed with its amount and who it applies to, edited
//   through `?editFee=`, moved up and down, and deleted when nobody has been
//   charged it;
// * a fee an invoice points at is refused, and the row says how many invoices
//   there are;
// * the row of the fee being charged today carries "Charged now" and one whose
//   window has closed carries "Not currently valid", never both;
// * every message the spec's table lists appears, and the field ones appear
//   together on one submit rather than one per attempt;
// * an organiser of another conference gets a 404 here, and an action posted to
//   by somebody who runs no conference gets one too;
// * the page does not spill off a phone screen or run on for screens on a
//   desktop.
//
// The invoices section of the same page — the table, its totals, its row
// actions and the CSV export — is tested in `manage-fees-invoices.spec.ts`, and
// Refund is T68's. The other half of the "manual mode" criterion of `fees.md`,
// that manual collection hides "Pay by card" on invoice pages, is watched on the
// invoice page itself by "shows the organisers instructions instead of a way to
// pay by card" in `invoices.spec.ts`.
//
// EVERY ACTION WITHOUT JAVASCRIPT
// That criterion is met by these tests running on the `desktop-no-js` project
// like every other browser test, rather than by a test of its own. Every control
// on the page is a real submit button in a real `<form method="post">` — the
// collection section's "Save", each fee row's two move arrows and its "Delete
// fee", and the fee form's own "Add fee" or "Save fee" — so a browser with no
// script posts all of them. "Edit" and the editor's "Cancel" are plain links to
// `?editFee=<feeId>` and back, which need no script either. The two tests that
// measure the page are the exception: they ask the browser for its own
// dimensions, and each runs on one project alone.
//
// WHAT THESE TESTS LEAVE BEHIND
// Each test gives a new account a draft conference and an organisation of its
// own through `./draft-conference`, and what it creates stays in the database
// until the next `pnpm db:reset`. They are
// dated in 2020 for the reason `tests/e2e/manage-dashboard.spec.ts` gives:
// `/conferences` lists conferences that are published *and* have not finished,
// and `tests/e2e/conferences.spec.ts` counts what is in it, so nothing here
// changes what it sees.
//
// Nothing here takes a fee, an invoice or a conference from `supabase/seed.sql`.
//
// `slugOf`, `readConferenceId`,
// `signInWithAConference`, `postFormAction` and `pressAndConfirm` below are
// copies of the ones in `tests/e2e/manage-committees.spec.ts` and
// `tests/e2e/manage-dashboard.spec.ts`, and are deliberately copies rather than
// shared imports for the same reason those two are: each file wants its own
// dates and its own extra fields, and a helper shared between them would have to
// be told about every one of those.

/**
 * How long an assertion that waits on a page reading the database may take.
 *
 * Longer than the five seconds Playwright waits by default, for the reason
 * `tests/e2e/conferences.spec.ts` gives: every test in the run asks the one
 * local database at once, and an answer has taken up to eight seconds.
 */
const DATABASE_TIMEOUT_MS = 15_000;

/** How soon a pressed arrow must show the new order, before the server has answered. */
const AT_ONCE_TIMEOUT_MS = 1_000;

/**
 * How long a single try inside a retrying block may take.
 *
 * Short on purpose: the block around it is what waits, and a try that waited the
 * full fifteen seconds would only ever run once.
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
 * An early bird window that opened and closed long ago, so a fee inside it is
 * not the price anybody pays today.
 *
 * The same pair as in `tests/db/fees.test.ts`, and in the same 2020 as the
 * conferences above, so that the file reads as one story.
 */
const EARLY_BIRD_OPENS_AT = '2020-01-01T00:00:00Z';
const EARLY_BIRD_CLOSES_AT = '2020-02-01T00:00:00Z';

/**
 * The same window again, in the shape a `datetime-local` field sends it.
 *
 * The two are the wrong way round where they are used, which is the whole point
 * of the field message they earn.
 */
const EARLY_BIRD_OPENS_FIELD = '2020-01-01T00:00';
const EARLY_BIRD_CLOSES_FIELD = '2020-02-01T00:00';

/**
 * What a conference these tests make charges, in the currency it charges in.
 *
 * A conference's `currency` column defaults to `EUR` and nothing here changes
 * it, so the amounts on the page are written out as a person reads them rather
 * than formatted: `formatMoney` lives in `src/lib/money.ts`, and Playwright
 * compiles the files in `tests/` on their own, without the `$lib` alias the app
 * is built with.
 */
const EARLY_BIRD_CENTS = 5500;
const EARLY_BIRD_ON_THE_PAGE = '€55.00';
const DELEGATE_FEE_CENTS = 6500;
const DELEGATE_FEE_ON_THE_PAGE = '€65.00';

/**
 * How many windows tall the fees page may be with real fees on it.
 *
 * Three is the ceiling the conference dashboard and the committees list are both
 * held to, and the reason is the same: more than that would mean these rows and
 * fields are being drawn too big to be scanned, which is exactly what
 * `tests/e2e/page-shape.ts` exists to notice. The invoices table of T33 will
 * arrive under everything measured here, so the two sections above it have to
 * stay short.
 */
const MANAGE_FEES_SCREENS = 3;

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

/** A signed-in account with a conference of its own, ready for a test to work on. */
type TestConference = {
	user: TestUser;
	id: string;
	slug: string;
	name: string;
	/** Its `/manage/<slug>` address, which a draft's other pages hang off. */
	managePath: string;
	/** The `/manage/<slug>/fees` address this file is about. */
	feesPath: string;
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

	return {
		user,
		id,
		slug,
		name,
		managePath,
		feesPath: `${managePath}/fees`
	};
}

/**
 * Wait until the fees page has really arrived.
 *
 * Waiting for the heading rather than simply for the address is what says the
 * page is there and drawn, rather than only asked for.
 */
async function waitForTheFeesPage(page: Page): Promise<void> {
	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Fees', {
		timeout: DATABASE_TIMEOUT_MS
	});
}

/** Sign in, make a conference and open its fees page, which is where every test starts. */
async function openFeesPage(page: Page, prefix: string): Promise<TestConference> {
	const conference = await signInWithAConference(page, prefix);

	await page.goto(conference.feesPath);
	await waitForTheFeesPage(page);

	return conference;
}

/** The organisation that runs the conference at `/manage/<slug>`. */
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
 * Finishing it for real is a round trip to Stripe, and this column is one only
 * the service role may write: the `protect_stripe_columns` trigger refuses a
 * browser, and the `account.updated` webhook (T32) is its only writer. So the
 * service-role client stands in for that webhook, exactly as `connectStripe` in
 * `tests/e2e/manage-dashboard.spec.ts` does.
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

/** What the collection-mode section writes, read back out of the conference. */
type PaymentSettings = {
	collects_payments_manually: boolean;
	payment_instructions: string | null;
};

/** How this conference collects its money, according to the database itself. */
async function readPaymentSettings(conferenceId: string): Promise<PaymentSettings> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('conferences')
		.select('collects_payments_manually, payment_instructions')
		.eq('id', conferenceId)
		.maybeSingle()
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<PaymentSettings, { merge: false }>();

	if (error || !data) {
		throw new Error(`Could not read the test conference's payment settings: ${error?.message}`);
	}

	return data;
}

/**
 * Say that the organisers collect the money themselves, without going through
 * the form.
 *
 * The two tests above this one prove that the section saves; the tests about the
 * fee list need a conference that is past the Stripe gate to start from, and not
 * a second proof of that, so they are handed one. The service-role client is
 * never used to show that something is allowed, which is what
 * `tests/db/supabase-test-client.ts` warns against — it arranges the state a
 * test begins in.
 */
async function collectPaymentsManually(conferenceId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('conferences')
		.update({
			collects_payments_manually: true,
			payment_instructions: 'Transfer to NL00 BANK 0123 4567 89 and quote your invoice number.'
		})
		.eq('id', conferenceId);

	if (error) {
		throw new Error(`Could not set the test conference to manual collection: ${error.message}`);
	}
}

/** What `addFee` puts in the table. Everything but the name has a default. */
type NewFee = {
	name: string;
	amountCents?: number;
	appliesTo?: 'individual' | 'delegation_member';
	/** An ISO timestamp, or nothing for no bound on that side. */
	validFrom?: string;
	validUntil?: string;
	/** Where the fee sits in the organiser's own order. */
	position?: number;
};

/**
 * Write one fee straight into the table, and answer its id.
 *
 * The form is what two of the tests below are about, so the tests about the
 * *list* are handed their fees rather than typing each one in: four forms filled
 * in to prove an ordering would be minutes of a browser test proving something
 * the add test already proves. The service-role client stands in for the form
 * the same way `addFee` in `tests/e2e/manage-dashboard.spec.ts` does, and is
 * never used to show that something is allowed.
 */
async function addFee(conferenceId: string, fee: NewFee): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('fees')
		.insert({
			conference_id: conferenceId,
			name: fee.name,
			amount_cents: fee.amountCents ?? DELEGATE_FEE_CENTS,
			applies_to: fee.appliesTo ?? 'individual',
			valid_from: fee.validFrom ?? null,
			valid_until: fee.validUntil ?? null,
			position: fee.position ?? 0
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test fee: ${error?.message}`);
	}

	return data.id;
}

/** One `fees` row, as the tests below read it back. */
type FeeRow = {
	id: string;
	name: string;
	amount_cents: number;
	applies_to: string;
	valid_from: string | null;
	valid_until: string | null;
	position: number;
};

/** Every fee of one conference, in the organiser's own order. */
async function readFees(conferenceId: string): Promise<FeeRow[]> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('fees')
		.select('id, name, amount_cents, applies_to, valid_from, valid_until, position')
		.eq('conference_id', conferenceId)
		.order('position', { ascending: true })
		.overrideTypes<FeeRow[], { merge: false }>();

	if (error || !data) {
		throw new Error(`Could not read the test fees: ${error?.message}`);
	}

	return data;
}

/**
 * Raise one invoice against a fee, so that the fee has somebody charged it.
 *
 * Invoices are normally written by the allocation functions when an organiser
 * accepts somebody, which is T26's and T28's work, so the service-role client
 * writes the row here instead.
 *
 * It writes the number itself rather than asking `next_invoice_number` for one.
 * That function refuses a caller who is not `has_permission(id, 'administrator')`, and the
 * service role manages no conference; `tests/db/fees.test.ts` can call it
 * because it asks as the organiser's own signed-in client, which a browser test
 * does not have. Nothing is lost by choosing the number, because
 * `guard_invoice_insert` — the trigger that would otherwise mint one — returns
 * early for every role but `anon` and `authenticated`. Counting what the
 * conference already has is the same sum `next_invoice_number` does, and a slug
 * is unique, so the number is unique across the table.
 */
async function raiseInvoiceAgainstFee(
	conference: TestConference,
	feeId: string,
	payerUserId: string
): Promise<void> {
	const admin = createServiceRoleClient();

	const { count, error: countError } = await admin
		.from('invoices')
		.select('id', { count: 'exact', head: true })
		.eq('conference_id', conference.id);

	if (countError) {
		throw new Error(`Could not count the test invoices: ${countError.message}`);
	}

	const sequence = String((count ?? 0) + 1).padStart(4, '0');

	const { error } = await admin.from('invoices').insert({
		conference_id: conference.id,
		number: `${conference.slug}-${sequence}`,
		payer_user_id: payerUserId,
		fee_id: feeId,
		description: 'Delegate fee · test conference',
		quantity: 1,
		unit_amount_cents: DELEGATE_FEE_CENTS,
		currency: 'EUR'
	});

	if (error) {
		throw new Error(`Could not raise the test invoice: ${error.message}`);
	}
}

/**
 * One fee's own row in the list.
 *
 * A fee's name is on the row and also inside the words on each of its two move
 * arrows, so plain text would match three things at once; the row itself is what
 * the assertions about amounts, badges and counts are really about. Every list
 * in the management area is a `<ul>` of `<li>`s — `routes/manage/[slug]/
 * committees/+page.svelte` is the model — so the row is found by its role and
 * narrowed by the one name no other row carries.
 */
function feeRow(main: Locator, feeName: string): Locator {
	return main.getByRole('listitem').filter({ hasText: feeName });
}

/** What `fillFeeForm` types into the add-or-edit form under the list. */
type FeeFormFields = {
	name: string;
	/** As a person types it, for example "55.00". */
	amount: string;
	/** The words in the dropdown, such as "Delegation members". */
	appliesTo?: string;
	/** A `datetime-local` value, for example "2020-01-01T00:00". */
	validFrom?: string;
	validUntil?: string;
};

/**
 * Fill the fee form in.
 *
 * Adding and editing draw the same form with different words on its one button:
 * "Add fee" under the list, "Save fee" while `?editFee=` names a fee.
 */
async function fillFeeForm(main: Locator, fields: FeeFormFields): Promise<void> {
	// The add row calls its name field "Add a fee"; the edit form calls it "Name".
	await main.getByLabel(/^(Add a fee|Name)$/).fill(fields.name);
	await main.getByLabel(/^Amount in /).fill(fields.amount);

	if (fields.appliesTo !== undefined) {
		await main.getByLabel('Charged to', { exact: true }).selectOption({ label: fields.appliesTo });
	}

	// The add row keeps its two dates folded away until they are asked for.
	const hasDates = fields.validFrom !== undefined || fields.validUntil !== undefined;
	const dateToggle = main.getByText('Only charge it between two dates');
	if (hasDates && (await dateToggle.count()) > 0) {
		await dateToggle.click();
	}

	if (fields.validFrom !== undefined) {
		await main.getByLabel('Valid from', { exact: true }).fill(fields.validFrom);
	}

	if (fields.validUntil !== undefined) {
		await main.getByLabel('Valid until', { exact: true }).fill(fields.validUntil);
	}
}

/**
 * Post to one of the page's form actions the way a browser posts a form.
 *
 * A button the page never drew proves only what the page did; several of the
 * rules below are that the action itself refuses, so these tests ask it
 * directly. `page.request` carries the browser's own cookies, so the post
 * arrives signed in as the account the test signed in. Two headers are written
 * by hand. `origin`, because SvelteKit refuses a form post that looks as though
 * it came from another website and Playwright's request does not send that
 * header itself. And `accept: text/html`, because that is how SvelteKit tells a
 * form post from a page with no JavaScript from one made by `use:enhance`:
 * without it the answer is the action's result as JSON under a 200, and with it
 * the page is drawn again carrying the status the action chose, which is what a
 * browser with no script really receives and so what these tests are about.
 */
async function postFormAction(
	page: Page,
	action: string,
	fields: Record<string, string> = {}
): Promise<APIResponse> {
	const origin = new URL(page.url()).origin;

	return page.request.post(action, {
		form: fields,
		headers: { origin, accept: 'text/html' }
	});
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
 *
 * "Delete fee" is the only `ConfirmButton` on this page. Every test that presses
 * it arranges for the fee it means to delete to be the topmost row, because the
 * dialog of the row below carries the same words.
 */
async function pressAndConfirm(page: Page, label: string): Promise<void> {
	// The dialog holds a second button with the same words on it, so the one in
	// the page itself is the first of the two. While the dialog is shut the
	// browser hides everything inside it, so until then there is only one.
	const button = page.getByRole('main').getByRole('button', { name: label }).first();
	const dialogButton = page.getByRole('dialog').getByRole('button', { name: label }).first();

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

/*
	Every test here signs a brand-new account in, seeds a draft conference,
	opens the fees page and then fills a form in, sometimes several times. That is
	a great deal more than most browser tests do, and thirty seconds — what
	Playwright allows a test by default — is not always enough for it while the
	whole suite is asking the one local database at once. `test.slow()` triples
	that allowance. It is an allowance and not a wait: a test that is quick still
	finishes as quickly as it can.
*/
test.beforeEach(() => {
	test.slow();
});

test('refuses a fee until Stripe is connected or manual collection is chosen', async ({ page }) => {
	const conference = await openFeesPage(page, 'Fee Gate MUN');
	const main = page.getByRole('main');

	// A brand-new organisation has never been through Stripe onboarding, so the
	// page opens with the warning on it and a way out of it.
	await expect(main.getByText('Paying by card needs Stripe')).toBeVisible();
	await expect(main.getByRole('link', { name: 'Connect Stripe' })).toBeVisible();

	const feeName = unusedName('Delegate fee');

	/*
		The form itself is not offered at all while there is no way to collect the
		money: the page shows what has to happen first instead of a form that
		could only ever be refused.
	*/
	await expect(main.getByRole('button', { name: 'Add fee' })).toHaveCount(0);
	await expect(
		main.getByText('Choose how you collect payments above before adding fees.')
	).toBeVisible();

	/*
		The action refuses as well, which is the half that matters: a form the page
		never drew can still be posted by hand, and `05-pages/organiser/fees.md`
		asks `addFee` itself for this message. `postFormAction` is the only way to
		reach it, for exactly the reason above.
	*/
	const refused = await postFormAction(page, `${conference.feesPath}?/addFee`, {
		name: feeName,
		amount: '65.00',
		appliesTo: 'individual',
		validFrom: '',
		validUntil: ''
	});

	expect(refused.status()).toBe(400);
	expect(await refused.text()).toContain(
		'Connect Stripe or choose manual collection before adding fees.'
	);

	// The refusal is the whole point, so nothing at all was written.
	expect(await readFees(conference.id)).toEqual([]);

	// Saying that the money is collected outside MUNMeet is the other way through
	// the gate, and the one an organisation without a Stripe account takes.
	await main.getByRole('radio', { name: 'Outside MUNMeet' }).check();
	await main
		.getByLabel('Payment instructions')
		.fill('Transfer to NL00 BANK 0123 4567 89 and quote your invoice number.');
	await main.getByRole('button', { name: 'Save', exact: true }).press('Enter');

	// The flash floats above the page rather than inside `<main>`, which is why
	// this assertion is not scoped to it.
	await expect(page.getByText('Payment collection saved.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// The line about Stripe stays: it is about paying by card, which still needs
	// Stripe whichever way this conference collects for now.
	await expect(main.getByText('Paying by card needs Stripe')).toBeVisible();

	await fillFeeForm(main, { name: feeName, amount: '65.00' });
	await main.getByRole('button', { name: 'Add fee' }).press('Enter');

	await expect(page.getByText('Fee added.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	const fees = await readFees(conference.id);

	expect(fees).toHaveLength(1);
	expect(fees[0]).toMatchObject({ name: feeName, amount_cents: DELEGATE_FEE_CENTS });
});

test('refuses card collection until the organisation has been through Stripe', async ({ page }) => {
	const conference = await openFeesPage(page, 'Card Gate MUN');
	const main = page.getByRole('main');

	// Manual collection first, so that the refusal below has something to leave
	// alone: a conference that was already collecting by card would look exactly
	// the same whether the action refused or not.
	await main.getByRole('radio', { name: 'Outside MUNMeet' }).check();
	await main.getByLabel('Payment instructions').fill('Bank transfer, details on request.');
	await main.getByRole('button', { name: 'Save', exact: true }).press('Enter');

	await expect(page.getByText('Payment collection saved.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	await main.getByRole('radio', { name: 'By card through MUNMeet' }).check();
	await main.getByRole('button', { name: 'Save', exact: true }).press('Enter');

	await expect(
		main.getByText('Connect Stripe first, or choose to collect payments outside MUNMeet.')
	).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	// Nothing changed: the conference still collects its own money.
	expect((await readPaymentSettings(conference.id)).collects_payments_manually).toBe(true);

	// Once the organisation really has finished onboarding, the same choice is
	// allowed. `connectStripe` stands in for the `account.updated` webhook.
	const organizationId = await readOrganizationId(conference.slug);

	await connectStripe(organizationId);

	await page.goto(conference.feesPath);
	await waitForTheFeesPage(page);

	// The warning is about an organisation that cannot take card payments, so a
	// connected one never sees it, whichever way it collects.
	await expect(main.getByText('Paying by card needs Stripe')).toHaveCount(0);

	await main.getByRole('radio', { name: 'By card through MUNMeet' }).check();
	await main.getByRole('button', { name: 'Save', exact: true }).press('Enter');

	await expect(page.getByText('Payment collection saved.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	expect((await readPaymentSettings(conference.id)).collects_payments_manually).toBe(false);
});

test('asks for payment instructions before it will collect the money outside MUNMeet', async ({
	page
}) => {
	const conference = await openFeesPage(page, 'Manual Mode MUN');
	const main = page.getByRole('main');

	// Emptied and submitted through the page itself, because that is what an
	// organiser does. The box cannot be marked `required`: it is only asked for
	// when the other choice is picked, and a browser would then refuse to send
	// the card choice at all, so the rule belongs to the action and the action is
	// what answers here.
	await main.getByRole('radio', { name: 'Outside MUNMeet' }).check();
	await main.getByLabel('Payment instructions').fill('');
	await main.getByRole('button', { name: 'Save', exact: true }).press('Enter');

	await expect(main.getByText('Please tell delegates how to pay.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// Nothing was saved: a conference that collected its money outside MUNMeet
	// without saying how would leave every delegate with a bill and no way to pay
	// it.
	const refused = await readPaymentSettings(conference.id);

	expect(refused.collects_payments_manually).toBe(false);
	expect(refused.payment_instructions).toBeNull();

	const instructions = 'Transfer €65 to NL00 BANK 0123 4567 89 and quote your invoice number.';

	await main.getByRole('radio', { name: 'Outside MUNMeet' }).check();
	await main.getByLabel('Payment instructions').fill(instructions);
	await main.getByRole('button', { name: 'Save', exact: true }).press('Enter');

	await expect(page.getByText('Payment collection saved.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	const saved = await readPaymentSettings(conference.id);

	expect(saved.collects_payments_manually).toBe(true);
	expect(saved.payment_instructions).toBe(instructions);

	// Still there on the next visit, which is what says the choice is in the
	// database rather than only in the page that answered the save.
	await page.goto(conference.feesPath);
	await waitForTheFeesPage(page);

	await expect(main.getByRole('radio', { name: 'Outside MUNMeet' })).toBeChecked();
	await expect(main.getByLabel('Payment instructions')).toHaveValue(instructions);

	/*
		NOT TESTED HERE, AND NOT FORGOTTEN
		The other half of this criterion in `05-pages/organiser/fees.md` is that
		manual collection "hides 'Pay by card' on invoice pages". That is not this
		page: the invoice a delegate reads is `/invoices/[id]`, built by T31 from
		`05-pages/delegate/invoice.md`. "shows the organisers instructions instead
		of a way to pay by card" in `invoices.spec.ts` asserts it there.
	*/
});

test('shows the empty state to a conference with no fees yet', async ({ page }) => {
	await openFeesPage(page, 'No Fees MUN');

	const main = page.getByRole('main');

	// `EmptyState` draws its title as a heading, the way the dashboard's "No
	// applications yet." is read in `manage-dashboard.spec.ts`.
	await expect(main.getByRole('heading', { name: 'No fees yet.' })).toBeVisible();
	await expect(
		main.getByText(
			'Add a fee so accepted delegates receive an invoice, or choose manual collection.'
		)
	).toBeVisible();
});

test('adds a fee, lists it with its amount and who it applies to, and edits it', async ({
	page
}) => {
	const conference = await openFeesPage(page, 'Fee Form MUN');

	// The Stripe gate has two tests of its own above; this one is about the form
	// behind it, so the collection mode is arranged rather than typed in again.
	await collectPaymentsManually(conference.id);

	await page.goto(conference.feesPath);
	await waitForTheFeesPage(page);

	const main = page.getByRole('main');
	const feeName = unusedName('School delegate fee');

	await fillFeeForm(main, {
		name: feeName,
		amount: '55.00',
		appliesTo: 'Delegation members'
	});
	await main.getByRole('button', { name: 'Add fee' }).press('Enter');

	await expect(page.getByText('Fee added.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	const row = feeRow(main, feeName);

	await expect(row).toContainText(EARLY_BIRD_ON_THE_PAGE, { timeout: DATABASE_TIMEOUT_MS });
	await expect(row).toContainText('Delegation members');

	const added = await readFees(conference.id);

	expect(added).toHaveLength(1);
	expect(added[0]).toMatchObject({
		name: feeName,
		amount_cents: EARLY_BIRD_CENTS,
		applies_to: 'delegation_member'
	});

	// Editing is a page of its own at `?editFee=<feeId>` rather than a box that
	// opens, which is what makes it work with no script and survive a refresh.
	await main.getByRole('link', { name: 'Edit' }).click();

	await expect(page).toHaveURL(`${conference.feesPath}?editFee=${added[0].id}`, {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(main.getByLabel('Name', { exact: true })).toHaveValue(feeName);
	await expect(main.getByLabel(/^Amount in /)).toHaveValue('55.00');

	// The way back out without saving anything.
	await expect(main.getByRole('link', { name: 'Cancel' })).toBeVisible();

	await main.getByLabel(/^Amount in /).fill('65.00');
	await main.getByRole('button', { name: 'Save fee' }).press('Enter');

	await expect(page.getByText('Fee saved.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(feeRow(main, feeName)).toContainText(DELEGATE_FEE_ON_THE_PAGE);

	const saved = await readFees(conference.id);

	expect(saved).toHaveLength(1);
	expect(saved[0].amount_cents).toBe(DELEGATE_FEE_CENTS);
});

test('moves a fee one place, and the new order is still there after a refresh', async ({
	page
}) => {
	const conference = await openFeesPage(page, 'Reorder Fees MUN');

	await collectPaymentsManually(conference.id);

	const firstName = unusedName('Early bird delegate fee');
	const secondName = unusedName('Delegate fee');
	const thirdName = unusedName('School delegate fee');

	await addFee(conference.id, { name: firstName, amountCents: EARLY_BIRD_CENTS, position: 0 });
	await addFee(conference.id, { name: secondName, position: 1 });
	await addFee(conference.id, {
		name: thirdName,
		appliesTo: 'delegation_member',
		position: 2
	});

	await page.goto(conference.feesPath);
	await waitForTheFeesPage(page);

	const main = page.getByRole('main');

	// In `position` order: `applicableFee` reads the list this way round, so the
	// order on the page is the order the prices are tried in. `[\s\S]*` means
	// "anything in between", line breaks included.
	await expect(main).toHaveText(
		new RegExp(`${firstName}[\\s\\S]*${secondName}[\\s\\S]*${thirdName}`),
		{ timeout: DATABASE_TIMEOUT_MS }
	);

	// Each arrow names the fee it belongs to, because "Move up" four times over
	// tells a screen-reader user nothing about which row they are on. That also
	// means a test never has to count rows to find the right button.
	await main.getByRole('button', { name: `Move ${firstName} down` }).press('Enter');

	// Exactly one place: the first and the second have swapped and the third has
	// not moved. A "move to the bottom" would pass a test that only looked at
	// where the first fee ended up.
	await expect(main).toHaveText(
		new RegExp(`${secondName}[\\s\\S]*${firstName}[\\s\\S]*${thirdName}`),
		{ timeout: DATABASE_TIMEOUT_MS }
	);

	// The database really holds the new order, which is what makes it survive a
	// refresh rather than being something the page did to itself. With
	// JavaScript the new order shows before the server has saved it (T125), so
	// the test waits for the answer before reading the database.
	await waitUntilAnswered(page);
	const afterMove = await readFees(conference.id);

	expect(afterMove.map((fee) => fee.name)).toEqual([secondName, firstName, thirdName]);

	await page.goto(conference.feesPath);
	await waitForTheFeesPage(page);

	await expect(main).toHaveText(
		new RegExp(`${secondName}[\\s\\S]*${firstName}[\\s\\S]*${thirdName}`),
		{ timeout: DATABASE_TIMEOUT_MS }
	);

	// And back up again, so that both arrows are shown to work.
	await main.getByRole('button', { name: `Move ${firstName} up` }).press('Enter');

	await expect(main).toHaveText(
		new RegExp(`${firstName}[\\s\\S]*${secondName}[\\s\\S]*${thirdName}`),
		{ timeout: DATABASE_TIMEOUT_MS }
	);
});

test('moving a fee shows the new order at once, without reloading the page', async ({
	page
}, testInfo) => {
	// T125: with JavaScript the arrows answer in place, and the order is certain,
	// so it changes the moment the arrow is pressed.
	skipWithoutJavaScript(testInfo);
	const conference = await openFeesPage(page, 'In Place Fees MUN');

	await collectPaymentsManually(conference.id);

	const firstName = unusedName('Early bird delegate fee');
	const secondName = unusedName('Delegate fee');

	await addFee(conference.id, { name: firstName, amountCents: EARLY_BIRD_CENTS, position: 0 });
	await addFee(conference.id, { name: secondName, position: 1 });

	await page.goto(conference.feesPath);
	await waitForTheFeesPage(page);
	await markPage(page);

	const main = page.getByRole('main');

	await main.getByRole('button', { name: `Move ${firstName} down` }).click();

	await expect(main).toHaveText(new RegExp(`${secondName}[\\s\\S]*${firstName}`), {
		timeout: AT_ONCE_TIMEOUT_MS
	});
	await waitUntilAnswered(page);
	expect((await readFees(conference.id)).map((fee) => fee.name)).toEqual([secondName, firstName]);
	expect(await readMarker(page)).toBe('still here');
});

test('says how many invoices a fee has, and which fee is being charged today', async ({ page }) => {
	const conference = await openFeesPage(page, 'Fee Badges MUN');

	await collectPaymentsManually(conference.id);

	const expiredFeeName = unusedName('Early bird delegate fee');
	const currentFeeName = unusedName('Delegate fee');

	// The early bird price, whose window closed in 2020, and the price that
	// replaced it. `applicableFee` picks the first fee by position whose window is
	// open, which is the second of these two.
	const expiredFeeId = await addFee(conference.id, {
		name: expiredFeeName,
		amountCents: EARLY_BIRD_CENTS,
		validFrom: EARLY_BIRD_OPENS_AT,
		validUntil: EARLY_BIRD_CLOSES_AT,
		position: 0
	});

	await addFee(conference.id, { name: currentFeeName, position: 1 });

	// Two people were charged the early bird price while it was open, which is
	// what the count on its row is about.
	const firstPayer = await createTestUser('Noor Haddad');
	const secondPayer = await createTestUser('Mateo Rossi');

	await raiseInvoiceAgainstFee(conference, expiredFeeId, firstPayer.id);
	await raiseInvoiceAgainstFee(conference, expiredFeeId, secondPayer.id);

	await page.goto(conference.feesPath);
	await waitForTheFeesPage(page);

	const main = page.getByRole('main');
	const expiredRow = feeRow(main, expiredFeeName);
	const currentRow = feeRow(main, currentFeeName);

	await expect(expiredRow).toContainText('2 invoices', { timeout: DATABASE_TIMEOUT_MS });
	await expect(expiredRow).toContainText('Not currently valid');
	await expect(currentRow).toContainText('Charged now');

	// One badge per row and no more, which is why each is counted rather than
	// simply looked for: a page that drew "Charged now" on every row would pass a
	// plain "is it visible".
	await expect(main.getByText('Charged now')).toHaveCount(1);
	await expect(main.getByText('Not currently valid')).toHaveCount(1);
});

test('deletes a fee nobody has been charged, and refuses one an invoice points at', async ({
	page
}) => {
	const conference = await openFeesPage(page, 'Delete Fee MUN');

	await collectPaymentsManually(conference.id);

	const unchargedFeeName = unusedName('Early bird delegate fee');
	const chargedFeeName = unusedName('Delegate fee');

	await addFee(conference.id, {
		name: unchargedFeeName,
		amountCents: EARLY_BIRD_CENTS,
		position: 0
	});

	const chargedFeeId = await addFee(conference.id, { name: chargedFeeName, position: 1 });

	await raiseInvoiceAgainstFee(conference, chargedFeeId, conference.user.id);

	await page.goto(conference.feesPath);
	await waitForTheFeesPage(page);

	const main = page.getByRole('main');

	await expect(feeRow(main, unchargedFeeName)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	// Each fee's delete button is named after the fee, so this is the uncharged
	// one's and not the other one's.
	await pressAndConfirm(page, `Delete ${unchargedFeeName}`);

	await expect(page.getByText('Fee deleted.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	const left = await readFees(conference.id);

	expect(left.map((fee) => fee.name)).toEqual([chargedFeeName]);

	// The one that is left has an invoice against it, and an invoice is a record
	// of what was agreed: taking the fee away would leave the page counting
	// invoices against nothing. The rule is the `fees` delete policy itself, so
	// the refusal holds however the delete is asked for.
	await pressAndConfirm(page, `Delete ${chargedFeeName}`);

	await expect(
		page.getByText('This fee is used by 1 invoice and cannot be deleted. Set an end date instead.')
	).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	expect((await readFees(conference.id)).map((fee) => fee.name)).toEqual([chargedFeeName]);
});

test('answers every field that needs fixing at once, rather than one per attempt', async ({
	page
}) => {
	const conference = await openFeesPage(page, 'All Fee Errors MUN');

	// Past the Stripe gate first. A conference that has not chosen how it collects
	// its money is refused before the action ever reads the fields, and this test
	// is about the fields.
	await collectPaymentsManually(conference.id);

	// Every field wrong at once. It is posted rather than typed, because the name
	// is `required` and the amount is a `number` box with a `min` and a `step`, so
	// a browser refuses to send several of these at all — which is the right
	// behaviour, and is also why the server's own answer can only be seen by
	// asking it directly.
	const response = await postFormAction(page, `${conference.feesPath}?/addFee`, {
		name: '',
		amount: 'free',
		appliesTo: 'individual',
		validFrom: EARLY_BIRD_CLOSES_FIELD,
		validUntil: EARLY_BIRD_OPENS_FIELD
	});

	expect(response.status()).toBe(400);

	const answer = await response.text();

	// All three of them, on the one page. That is the criterion: three things to
	// fix, said once, rather than three attempts each ending in one sentence.
	const everyMessage = [
		'Please name the fee.',
		'Please enter an amount of 0 or more.',
		'The end must be after the start.'
	];

	for (const message of everyMessage) {
		expect(answer).toContain(message);
	}

	// A negative amount is the other half of the amount rule, and earns the same
	// sentence rather than one of its own.
	const negative = await postFormAction(page, `${conference.feesPath}?/addFee`, {
		name: 'Refund fee',
		amount: '-5.00',
		appliesTo: 'individual'
	});

	expect(negative.status()).toBe(400);
	expect(await negative.text()).toContain('Please enter an amount of 0 or more.');

	// Neither of them wrote anything: the conference still has no fees at all.
	expect(await readFees(conference.id)).toEqual([]);
});

test('answers the fees page of a conference somebody else runs with a 404', async ({ page }) => {
	const conference = await openFeesPage(page, 'Not My Conference MUN');

	// A second account with a conference of its own, so the refusal below is about
	// this conference and not about the reader being a stranger to the whole
	// management area. Clearing the cookies is what ends the first account's
	// session; without that, `/login` would send an account that is already signed
	// in somewhere else.
	await page.context().clearCookies();

	const otherOrganiser = await createTestUser('Tomas Novak');
	await signIn(page, otherOrganiser);

	const ownManagePath = await createDraftConference(otherOrganiser, {
		name: unusedName('Other Organiser MUN'),
		organizationName: unusedName('Other Organiser Society')
	});

	const response = await page.goto(conference.feesPath);

	// A 404 and not a 403, for the reason `manage.spec.ts` gives: an answer must
	// not tell anybody which conferences exist or who runs them.
	expect(response?.status()).toBe(404);

	// And their own fees page opens, which is what says the 404 was about this
	// conference rather than about the page.
	await page.goto(`${ownManagePath}/fees`);
	await waitForTheFeesPage(page);
});

test('answers somebody who posts to addFee for a conference they do not run', async ({ page }) => {
	const conference = await openFeesPage(page, 'Not Yours Fees MUN');

	// Past the Stripe gate, so that a 200 with a gate message would be a visible
	// failure rather than looking like the refusal this test is about.
	await collectPaymentsManually(conference.id);

	await page.context().clearCookies();

	const stranger = await createTestUser('Aiko Tanaka');
	await signIn(page, stranger);

	const response = await postFormAction(page, `${conference.feesPath}?/addFee`, {
		name: 'Gatecrasher fee',
		amount: '10.00',
		appliesTo: 'individual'
	});

	// The action asks `requirePermission` for itself rather than trusting the page
	// that drew the button, which is what `specs/02-architecture/permissions.md`
	// asks of every action.
	expect(response.status()).toBe(404);

	// And the refusal is the whole point, so the conference still has no fees.
	expect(await readFees(conference.id)).toEqual([]);
});

test('does not spill off the side of a phone screen', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	// Long names on purpose. A line that may not wrap is as wide as its text
	// however narrow its column is, which is what pushes a page sideways, and a
	// short name would never show it.
	const conference = await openFeesPage(
		page,
		'Phone Fees International Model United Nations Conference'
	);

	await collectPaymentsManually(conference.id);

	const longFeeName = 'Early bird delegation member fee for schools travelling from outside Europe';

	await addFee(conference.id, {
		name: longFeeName,
		amountCents: EARLY_BIRD_CENTS,
		appliesTo: 'delegation_member',
		validFrom: EARLY_BIRD_OPENS_AT,
		validUntil: EARLY_BIRD_CLOSES_AT,
		position: 0
	});
	await addFee(conference.id, {
		name: 'Delegate fee for everybody applying on their own',
		position: 1
	});

	await page.goto(conference.feesPath);
	await waitForTheFeesPage(page);

	// Wait for the page to be the one this test is about before measuring it.
	await expect(feeRow(page.getByRole('main'), longFeeName)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	await expectNoSidewaysOverflow(page);
});

test('fits in a few screens', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough to measure a height.');

	const conference = await openFeesPage(page, 'Height Check Fees MUN');

	await collectPaymentsManually(conference.id);

	// A list with something on it: four fees, which is more than most conferences
	// charge, each with a window so that no row is a bare line.
	const feeNames = [
		unusedName('Early bird delegate fee'),
		unusedName('Delegate fee'),
		unusedName('Early bird school delegate fee'),
		unusedName('School delegate fee')
	];

	for (const [index, feeName] of feeNames.entries()) {
		await addFee(conference.id, {
			name: feeName,
			amountCents: index % 2 === 0 ? EARLY_BIRD_CENTS : DELEGATE_FEE_CENTS,
			appliesTo: index < 2 ? 'individual' : 'delegation_member',
			validFrom: EARLY_BIRD_OPENS_AT,
			position: index
		});
	}

	await page.goto(conference.feesPath);
	await waitForTheFeesPage(page);

	await expect(feeRow(page.getByRole('main'), feeNames[3])).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// Saved before the assertion, so that a failure leaves a picture of the page
	// that failed it.
	await saveFullPageScreenshot(page, 'manage-fees');
	await expectPageFitsInScreens(page, MANAGE_FEES_SCREENS);
});
