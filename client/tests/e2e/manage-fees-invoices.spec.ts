import { expect, test, type APIResponse, type Locator, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { createTestUser, giveApplication, signIn, type TestUser } from './signed-in-user';
import { createDraftConferenceFor } from './draft-conference';
import {
	expectNoSidewaysOverflow,
	expectPageFitsInScreens,
	saveFullPageScreenshot
} from './page-shape';
import { answerConfirmationPage } from './confirmation-page';
import { waitUntilAnswered } from './chair-room-fixtures';
import { skipWithoutJavaScript } from './in-place';
import {
	AT_ONCE_TIMEOUT_MS,
	answerSlowly,
	answerWithError,
	sawSpinner,
	watchForSpinners
} from './instant';

// The acceptance criteria of `specs/05-pages/organiser/fees.md` that need a real
// browser, for the Invoices section task T33 adds to `/manage/[slug]/fees`:
//
// * the totals add up every invoice of the conference, whatever the filters;
// * the search, the status filter and the page are in the address and survive a
//   refresh, and a link to one invoice (`?invoice=`) shows and shades it first;
// * "Mark as paid", "Waive" and "Void" move an unpaid invoice to the status each
//   one names, "Mark as paid" writes the note and the manual method, and an
//   invoice that has already moved on is refused in words;
// * the CSV export is a real download, holds every column the spec lists, and
//   keeps to the filters on screen;
// * the table does not spill off a phone screen, and a full page of invoices is
//   measured on a desktop.
//
// The fee sections above the table are T66's and are tested in
// `tests/e2e/manage-fees.spec.ts`. The Refund action is T68's.
//
// EVERY ACTION WITHOUT JAVASCRIPT
// As in `manage-fees.spec.ts`, that criterion is met by these tests running on
// the `desktop-no-js` project too. The filters are a `<form method="get">`, the
// pages and the export are plain links, and each row button is a
// `ConfirmButton`: its own `<form method="post">`, which a browser with no
// script posts to the confirmation page first. The note box lives in the
// button's dialog, which such a browser never opens, so the confirmation page
// carries an empty note on to the action — and the note is optional.
// `pressAndConfirm` below copes with both.
//
// WHAT THESE TESTS LEAVE BEHIND
// Each test makes its own conference through `./draft-conference`, dated in
// 2020 for the reason `manage-fees.spec.ts` gives, and its invoices stay with it
// until the next `pnpm db:reset`. Nothing here reads the seeded invoices of
// `supabase/seed.sql`.
//
// `createDraftConference`, `slugOf`, `readConferenceId`,
// `signInWithAConference`, `waitForTheFeesPage`, `collectPaymentsManually`,
// `postFormAction` and `pressAndConfirm` are copies of the ones in
// `manage-fees.spec.ts`, for the reason that file gives for its own copies.

/** How long an assertion that waits on the database may take. See `manage-fees.spec.ts`. */
const DATABASE_TIMEOUT_MS = 15_000;

/** How long a single try inside a retrying block may take. See `manage-fees.spec.ts`. */
const SINGLE_TRY_TIMEOUT_MS = 2_000;

/** The days a conference these tests create runs on. In the past, as above. */
const CONFERENCE_FIRST_DAY = '2020-05-03';
const CONFERENCE_LAST_DAY = '2020-05-05';

/**
 * What every invoice here charges, and how the page writes it.
 *
 * Written out rather than formatted, because `formatMoney` lives behind the
 * `$lib` alias that Playwright's own compiler does not know.
 */
const DELEGATE_FEE_CENTS = 6500;
const DELEGATE_FEE_ON_THE_PAGE = '€65.00';

/** One more invoice than fits on the table's first page, `INVOICES_PAGE_SIZE` in `src/lib/invoices.ts`. */
const MORE_THAN_ONE_PAGE = 26;

/**
 * How many windows tall the fees page may be with a full page of invoices.
 *
 * Twenty-five rows under the two fee sections is a long page by design: the spec
 * asks for pages of 25, and the two sections above take two screens on their
 * own. Each row holds the payer, the description and the number on lines of
 * their own beside one line of buttons, and the numbers of this test wrap onto
 * a second line because a test conference's address is long, so the page
 * measures 5.7 screens. The ceiling is here to notice rows growing taller than
 * that, as they did while an unpaid invoice's three buttons stacked (7.7 screens),
 * which is what `tests/e2e/page-shape.ts` exists for.
 */
const FULL_INVOICE_PAGE_SCREENS = 6;

/** A name nothing else in the database will match. */
function unusedName(prefix: string): string {
	return `${prefix} ${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Give `user` a draft conference of its own, run by a brand-new organisation,
 * and answer its `/manage/<slug>` address.
 *
 * The rows are written straight into the database by `./draft-conference`,
 * whose comment says why: the one-step `/create` form these tests used to fill
 * in is gone, and the creation flow that replaced it has its own
 * `create-*.spec.ts` files.
 */
async function createDraftConference(user: TestUser, name: string): Promise<string> {
	const draft = await createDraftConferenceFor(user, {
		name,
		organizationName: unusedName(`${name} Society`),
		startDate: CONFERENCE_FIRST_DAY,
		endDate: CONFERENCE_LAST_DAY
	});

	return `/manage/${draft.slug}`;
}

/** The slug at the end of a `/manage/<slug>` address. */
function slugOf(managePath: string): string {
	return managePath.split('/').pop() ?? '';
}

/** The id of the conference a slug names, which ends in a random suffix. */
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

/** A signed-in organiser with a conference of its own. */
type TestConference = {
	user: TestUser;
	id: string;
	slug: string;
	/** The `/manage/<slug>/fees` address this file is about. */
	feesPath: string;
	/**
	 * The same page opened on its "Invoices" tab. A draft opens on "Fees", and
	 * only the export test publishes its conference.
	 */
	invoicesPath: string;
};

/**
 * Sign a brand-new account in, give it a conference, and set that conference to
 * collect its money by hand, which is what the three row actions are for.
 */
async function signInWithAConference(page: Page, prefix: string): Promise<TestConference> {
	const user = await createTestUser('Priya Nair');
	await signIn(page, user);

	const managePath = await createDraftConference(user, unusedName(prefix));
	const slug = slugOf(managePath);
	const id = await readConferenceId(slug);

	await collectPaymentsManually(id);

	return {
		user,
		id,
		slug,
		feesPath: `${managePath}/fees`,
		invoicesPath: `${managePath}/fees?tab=invoices`
	};
}

/**
 * Mark the conference published without walking the setup steps, because
 * "Export CSV" shows only once a conference is public. The service-role client
 * arranges the state a test starts in, as `manage-fees.spec.ts` explains.
 */
async function markPublished(conferenceId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('conferences')
		.update({ status: 'published' })
		.eq('id', conferenceId);

	if (error) {
		throw new Error(`Could not publish the test conference: ${error.message}`);
	}
}

/**
 * Say that the organisers collect the money themselves. The service-role client
 * arranges the state a test starts in, as `manage-fees.spec.ts` explains.
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

/** What `giveInvoices` writes for each invoice. Everything but the payer has a default. */
type InvoiceSeed = {
	payer: TestUser;
	status?: 'unpaid' | 'paid' | 'waived' | 'refunded' | 'void';
	paidMethod?: 'manual' | 'stripe' | null;
	paidAt?: string | null;
	/** When it was raised. The table lists the newest first. */
	createdAt?: string;
};

/**
 * Write invoices straight into the table, in one insert, and answer their
 * numbers in the order given.
 *
 * Nothing in the app raises an invoice by hand — accepting a delegate does — so
 * the service-role client stands in, the way `giveInvoice` in
 * `signed-in-user.ts` does and for the reasons it gives: the number and the
 * currency are the guard trigger's job, and the service role walks past it. The
 * numbers are the conference's slug and a counter, which is unique because a
 * slug is.
 */
async function giveInvoices(conference: TestConference, seeds: InvoiceSeed[]): Promise<string[]> {
	const admin = createServiceRoleClient();

	const rows = seeds.map((seed, index) => ({
		conference_id: conference.id,
		number: `${conference.slug}-${String(index + 1).padStart(4, '0')}`,
		payer_user_id: seed.payer.id,
		description: 'Delegate fee · test conference',
		quantity: 1,
		unit_amount_cents: DELEGATE_FEE_CENTS,
		currency: 'EUR',
		status: seed.status ?? 'unpaid',
		paid_method: seed.paidMethod ?? null,
		paid_at: seed.paidAt ?? null,
		created_at: seed.createdAt ?? new Date().toISOString()
	}));

	const { error } = await admin.from('invoices').insert(rows);

	if (error) {
		throw new Error(`Could not write the test invoices: ${error.message}`);
	}

	return rows.map((row) => row.number);
}

/** What an invoice holds after a test has acted on it. */
type SavedInvoice = {
	id: string;
	status: string;
	paid_method: string | null;
	paid_at: string | null;
	note: string | null;
};

/** Read one invoice back by its number, to check what an action really saved. */
async function readInvoice(invoiceNumber: string): Promise<SavedInvoice> {
	const admin = createServiceRoleClient();

	// The note lives in invoice_internal_notes since migration 20261022130000,
	// one row per invoice, which PostgREST hands back as one object or null.
	const { data, error } = await admin
		.from('invoices')
		.select('id, status, paid_method, paid_at, invoice_internal_notes(note)')
		.eq('number', invoiceNumber)
		.maybeSingle()
		.overrideTypes<
			{
				id: string;
				status: string;
				paid_method: string | null;
				paid_at: string | null;
				invoice_internal_notes: { note: string } | null;
			},
			{ merge: false }
		>();

	if (error || !data) {
		throw new Error(`Could not read the test invoice "${invoiceNumber}": ${error?.message}`);
	}

	return {
		id: data.id,
		status: data.status,
		paid_method: data.paid_method,
		paid_at: data.paid_at,
		note: data.invoice_internal_notes?.note ?? null
	};
}

/** Wait until the fees page has really arrived, rather than the Details page before it. */
async function waitForTheFeesPage(page: Page): Promise<void> {
	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Fees', {
		timeout: DATABASE_TIMEOUT_MS
	});
}

/** Open an address on the fees page and wait for it. */
async function openFeesPage(page: Page, address: string): Promise<void> {
	await page.goto(address);
	await waitForTheFeesPage(page);
}

/**
 * One invoice's own entry in the Invoices section.
 *
 * From `md` up it is a table row and below it a card in a list; the other of the
 * two is `display: none`, which takes it out of the accessibility tree, so asking
 * for either role finds only the one the window shows.
 */
function invoiceEntry(page: Page, invoiceNumber: string): Locator {
	const main = page.getByRole('main');

	return main.getByRole('row').or(main.getByRole('listitem')).filter({ hasText: invoiceNumber });
}

/**
 * Press one of an invoice's buttons and answer its question, typing a note into
 * the dialog when one is given.
 *
 * With JavaScript the press opens the dialog, and the dialog's own button is
 * what posts. Without it the press opens the confirmation page instead, which
 * carries an empty note on to the action, which is why a note is only typed
 * when the dialog is really there.
 */
async function pressAndConfirm(
	page: Page,
	invoiceNumber: string,
	label: string,
	note?: string
): Promise<void> {
	const button = invoiceEntry(page, invoiceNumber).getByRole('button', { name: label }).first();
	const dialog = page.getByRole('dialog');

	await button.press('Enter');

	const isAsking = await dialog
		.getByRole('button', { name: label })
		.waitFor({ state: 'visible', timeout: SINGLE_TRY_TIMEOUT_MS })
		.then(() => true)
		.catch(() => false);

	// No dialog means no script: the press opened the confirmation page instead.
	if (!isAsking) {
		await answerConfirmationPage(page, label);
		return;
	}

	if (note !== undefined) {
		await dialog.getByLabel('Note for organisers (optional)').fill(note);
	}

	await dialog.getByRole('button', { name: label }).press('Enter');
}

/**
 * Post to one of the page's form actions the way a browser with no script
 * does. See `postFormAction` in `manage-fees.spec.ts` for the two headers.
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

/*
	Every test signs a new account in and seeds a draft conference before it
	starts, which does not always fit in thirty seconds while the whole suite
	shares one database. `test.slow()` triples the allowance; see
	`manage-fees.spec.ts`.
*/
test.beforeEach(() => {
	test.slow();
});

test('says how invoices appear before the conference has any', async ({ page }) => {
	const conference = await signInWithAConference(page, 'No Invoices MUN');

	await openFeesPage(page, conference.invoicesPath);

	const invoices = page.locator('#invoices');
	await expect(invoices.getByText('No invoices yet.')).toBeVisible();
	await expect(invoices.getByText('Invoices are created when you accept delegates.')).toBeVisible();
});

test('adds up every invoice, and keeps the search and the status through a refresh', async ({
	page
}) => {
	const conference = await signInWithAConference(page, 'Totals MUN');
	const maria = await createTestUser('Maria Kowalska');
	const tomas = await createTestUser('Tomas Lindqvist');

	const [unpaidNumber, paidNumber, voidNumber, waivedNumber] = await giveInvoices(conference, [
		{ payer: maria },
		{ payer: tomas, status: 'paid', paidMethod: 'manual', paidAt: '2020-04-01T10:00:00Z' },
		{ payer: tomas, status: 'void' },
		{ payer: maria, status: 'waived' }
	]);

	await openFeesPage(page, conference.invoicesPath);

	// One unpaid and one paid invoice of €65 each: €130 invoiced, of which €65
	// is paid and €65 outstanding. The void invoice counts towards nothing and
	// the waived one only towards Waived. Nobody paid by card, so MUNMeet kept
	// no platform fees and Paid names none. The figures are the list at the top
	// of the tab, each figure above its label.
	const invoices = page.locator('#invoices');
	const totals = invoices.getByRole('list').filter({ hasText: 'Invoiced' });

	await expect(totals).toContainText(/€130\.00\s*Invoiced/);
	await expect(totals).toContainText(/€65\.00\s*Paid/);
	await expect(totals).toContainText(/€65\.00\s*Outstanding · 1 invoice/);
	await expect(totals).toContainText(/€65\.00\s*Waived/);
	await expect(totals).not.toContainText('platform fees');
	await expect(invoiceEntry(page, voidNumber)).toBeVisible();
	await expect(invoiceEntry(page, unpaidNumber)).toContainText(DELEGATE_FEE_ON_THE_PAGE);

	// The status filter is a GET form, so it lands on an address that says what
	// it filtered by.
	await invoices.getByLabel('Status').selectOption({ label: 'Paid' });
	await invoices.getByRole('button', { name: 'Apply filters' }).press('Enter');
	await page.waitForURL(/status=paid/, { timeout: DATABASE_TIMEOUT_MS });

	await expect(invoiceEntry(page, paidNumber)).toBeVisible();
	await expect(invoiceEntry(page, paidNumber)).toContainText('Manual');
	await expect(invoiceEntry(page, unpaidNumber)).toHaveCount(0);

	// The totals do not follow the filter: they are the whole conference's.
	await expect(invoices.getByText('€130.00')).toBeVisible();

	await page.reload();
	await waitForTheFeesPage(page);
	await expect(invoiceEntry(page, paidNumber)).toBeVisible();
	await expect(invoiceEntry(page, unpaidNumber)).toHaveCount(0);

	// The search looks at the payer's name, and adds to the status in the address.
	await openFeesPage(page, `${conference.feesPath}?q=kowalska`);
	await expect(invoiceEntry(page, unpaidNumber)).toBeVisible();
	await expect(invoiceEntry(page, waivedNumber)).toBeVisible();
	await expect(invoiceEntry(page, paidNumber)).toHaveCount(0);
});

test('pages through the table in the address, and shows a linked invoice first', async ({
	page
}) => {
	const conference = await signInWithAConference(page, 'Paging MUN');
	const payer = await createTestUser('Aiko Tanaka');

	// Each a minute older than the one before, so the first written is the newest
	// and sits at the top, and the last is alone on page 2.
	const seeds: InvoiceSeed[] = [];
	for (let index = 0; index < MORE_THAN_ONE_PAGE; index += 1) {
		seeds.push({ payer, createdAt: new Date(Date.UTC(2020, 3, 1, 12, 60 - index)).toISOString() });
	}
	const numbers = await giveInvoices(conference, seeds);
	const oldestNumber = numbers[numbers.length - 1];

	await openFeesPage(page, conference.invoicesPath);
	await expect(invoiceEntry(page, numbers[0])).toBeVisible();
	await expect(invoiceEntry(page, oldestNumber)).toHaveCount(0);

	await page.getByRole('link', { name: /Next/ }).press('Enter');
	await page.waitForURL(/page=2/, { timeout: DATABASE_TIMEOUT_MS });
	await expect(invoiceEntry(page, oldestNumber)).toBeVisible();

	await page.reload();
	await waitForTheFeesPage(page);
	await expect(invoiceEntry(page, oldestNumber)).toBeVisible();

	// A link from another page names one invoice. It is on page 2, and still
	// shows on page 1, first.
	const oldest = await readInvoice(oldestNumber);
	await openFeesPage(page, `${conference.feesPath}?invoice=${oldest.id}#invoices`);
	await expect(invoiceEntry(page, oldestNumber)).toBeVisible();
	await expect(invoiceEntry(page, numbers[0])).toBeVisible();
});

test('marks an invoice paid with a note, waives one and voids one', async ({ page }) => {
	const conference = await signInWithAConference(page, 'Settle MUN');
	const payer = await createTestUser('Kofi Mensah');

	const [paidNumber, waivedNumber, voidNumber] = await giveInvoices(conference, [
		{ payer },
		{ payer },
		{ payer }
	]);

	await openFeesPage(page, conference.invoicesPath);

	await pressAndConfirm(page, paidNumber, 'Mark as paid', 'Bank transfer 12 April');
	await expect(page.getByText(`Invoice ${paidNumber} marked as paid.`)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	const paid = await readInvoice(paidNumber);
	expect(paid.status).toBe('paid');
	expect(paid.paid_method).toBe('manual');
	expect(paid.paid_at).not.toBeNull();

	// Only a browser with JavaScript opens the dialog the note box is in.
	const isScripted = test.info().project.name !== 'desktop-no-js';
	expect(paid.note).toBe(isScripted ? 'Bank transfer 12 April' : null);

	// A settled invoice has nothing left to press.
	await expect(invoiceEntry(page, paidNumber).getByRole('button')).toHaveCount(0);

	await pressAndConfirm(page, waivedNumber, 'Waive');
	await expect(page.getByText(`Invoice ${waivedNumber} waived.`)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect((await readInvoice(waivedNumber)).status).toBe('waived');

	await pressAndConfirm(page, voidNumber, 'Void');
	await expect(page.getByText(`Invoice ${voidNumber} voided.`)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect((await readInvoice(voidNumber)).status).toBe('void');
	await expect(invoiceEntry(page, voidNumber)).toContainText('Cancelled');
});

// T142: with JavaScript "Mark as paid" settles the row the moment the dialog
// is answered, before the server has and with no spinner, and a press the
// server refuses goes back and says what did not happen.
test('settles an invoice at once, and puts a refused void back', async ({ page }, testInfo) => {
	skipWithoutJavaScript(testInfo);

	const conference = await signInWithAConference(page, 'Instant Fees MUN');
	const payer = await createTestUser('Tomas Novak');
	const [paidNumber, voidNumber] = await giveInvoices(conference, [{ payer }, { payer }]);

	await openFeesPage(page, conference.invoicesPath);
	await answerSlowly(page, 'markPaid');
	await watchForSpinners(page);

	await pressAndConfirm(page, paidNumber, 'Mark as paid');

	// A settled invoice has nothing left to press.
	await expect(invoiceEntry(page, paidNumber).getByRole('button')).toHaveCount(0, {
		timeout: AT_ONCE_TIMEOUT_MS
	});

	await waitUntilAnswered(page);
	expect(await sawSpinner(page)).toBe(false);
	expect((await readInvoice(paidNumber)).status).toBe('paid');

	await answerWithError(page, 'void');
	await pressAndConfirm(page, voidNumber, 'Void');

	await expect(page.getByRole('alert')).toContainText('The invoice was not voided.', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(page);
	await expect(
		invoiceEntry(page, voidNumber).getByRole('button', { name: 'Void' }).first()
	).toBeVisible();
	expect((await readInvoice(voidNumber)).status).toBe('unpaid');
});

test('refuses to settle an invoice that has already moved on', async ({ page }) => {
	const conference = await signInWithAConference(page, 'Refusal MUN');
	const payer = await createTestUser('Lena Fischer');

	const [invoiceNumber] = await giveInvoices(conference, [{ payer }]);

	await openFeesPage(page, conference.invoicesPath);

	// Another organiser marks it paid while this page is still showing it unpaid.
	const admin = createServiceRoleClient();
	await admin
		.from('invoices')
		.update({ status: 'paid', paid_method: 'manual', paid_at: new Date().toISOString() })
		.eq('number', invoiceNumber);

	await pressAndConfirm(page, invoiceNumber, 'Void');
	await expect(page.getByText('This invoice is paid and cannot be voided.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect((await readInvoice(invoiceNumber)).status).toBe('paid');

	// And the action itself refuses, for a request no page ever drew.
	const { id } = await readInvoice(invoiceNumber);
	const response = await postFormAction(page, `${conference.feesPath}?/waive`, {
		invoiceId: id,
		confirm: '1'
	});
	expect(response.status()).toBe(400);
	expect(await response.text()).toContain('This invoice is paid and cannot be waived.');
});

/**
 * Give the conference one committee and answer its id, so that somebody can
 * apply to it. Committees are T02's form and are not what this page is about, so
 * the service-role client writes the row, the way `addCommittee` in
 * `tests/e2e/manage-delegation-review.spec.ts` does.
 */
async function addCommittee(conferenceId: string): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('committees')
		.insert({
			conference_id: conferenceId,
			name: 'General Assembly',
			abbreviation: 'GA',
			slug: `committee-${crypto.randomUUID().slice(0, 8)}`,
			level: 'intermediate',
			topics: [],
			position: 0
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test committee: ${error?.message}`);
	}

	return data.id;
}

test('exports the filtered invoices as a CSV with every column', async ({ page }) => {
	const conference = await signInWithAConference(page, 'Export MUN');
	const payer = await createTestUser('Sofia Rossi');
	// An organiser may read the email of a conference's participants only, so the
	// payer applies first, the way a real delegate does before being invoiced.
	await giveApplication(payer, {
		conferenceId: conference.id,
		status: 'submitted',
		committeePreferences: [await addCommittee(conference.id)],
		motivation: 'I would like to represent a country.'
	});

	const [unpaidNumber, paidNumber] = await giveInvoices(conference, [
		{ payer },
		{ payer, status: 'paid', paidMethod: 'manual', paidAt: '2020-04-01T10:00:00Z' }
	]);

	// A published conference opens on its "Invoices" tab, which is where the
	// export sits.
	await markPublished(conference.id);
	await openFeesPage(page, `${conference.feesPath}?status=paid`);

	const exportLink = page.getByRole('link', { name: 'Export CSV' });
	const href = (await exportLink.getAttribute('href')) ?? '';
	expect(href).toContain('status=paid');

	const response = await page.request.get(href);
	expect(response.status()).toBe(200);
	expect(response.headers()['content-type']).toContain('text/csv');
	expect(response.headers()['content-disposition']).toMatch(
		new RegExp(`${conference.slug}-invoices-\\d{4}-\\d{2}-\\d{2}\\.csv`)
	);

	const csv = await response.text();
	const [header, ...rows] = csv.trim().split('\r\n');
	expect(header).toBe(
		'Number,Payer name,Payer email,Delegation,Description,Quantity,Unit amount,Amount,Currency,Platform fee,Status,Paid at,Method,Note'
	);
	expect(rows).toHaveLength(1);
	expect(rows[0]).toContain(paidNumber);
	expect(rows[0]).toContain(payer.email);
	// Paid by hand, so the platform took no fee and that cell is empty.
	expect(rows[0]).toContain(',EUR,,Paid,');
	expect(csv).not.toContain(unpaidNumber);

	// The button itself downloads the file rather than leaving the page. Only
	// one project needs to watch that happen.
	if (test.info().project.name === 'desktop') {
		const downloadEvent = page.waitForEvent('download');
		await exportLink.click();
		const download = await downloadEvent;
		expect(download.suggestedFilename()).toMatch(/-invoices-\d{4}-\d{2}-\d{2}\.csv$/);
	}
});

test('does not spill off the side of a phone screen with invoices on it', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	const conference = await signInWithAConference(
		page,
		'Phone Invoices International Model United Nations Conference'
	);
	const payer = await createTestUser('Maximiliana Alexandra von Hohenzollern-Sigmaringen');

	const [invoiceNumber] = await giveInvoices(conference, [
		{ payer },
		{ payer, status: 'paid', paidMethod: 'manual', paidAt: '2020-04-01T10:00:00Z' },
		{ payer, status: 'void' }
	]);

	await openFeesPage(page, conference.invoicesPath);
	await expect(invoiceEntry(page, invoiceNumber)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	await saveFullPageScreenshot(page, 'manage-fees-invoices');
	await expectNoSidewaysOverflow(page);
});

test('fits a full page of invoices in a few screens', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough to measure a height.');

	const conference = await signInWithAConference(page, 'Height Invoices MUN');
	const payer = await createTestUser('Aiko Tanaka');

	// Every third invoice paid, so the paid and method columns are not all empty.
	const unpaid: InvoiceSeed = { payer };
	const paid: InvoiceSeed = {
		payer,
		status: 'paid',
		paidMethod: 'manual',
		paidAt: '2020-04-01T10:00:00Z'
	};
	// Each a minute older than the last, so the first is on the first page. With
	// one shared time the order would come down to the random ids.
	const seeds: InvoiceSeed[] = [];
	for (let index = 0; index < MORE_THAN_ONE_PAGE; index += 1) {
		const createdAt = new Date(Date.UTC(2020, 3, 1, 12, 60 - index)).toISOString();
		seeds.push({ ...(index % 3 === 0 ? paid : unpaid), createdAt });
	}
	const numbers = await giveInvoices(conference, seeds);

	await openFeesPage(page, conference.invoicesPath);
	await expect(invoiceEntry(page, numbers[0])).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	// Saved before the assertion, so a failure leaves a picture of the page.
	await saveFullPageScreenshot(page, 'manage-fees-invoices');
	await expectPageFitsInScreens(page, FULL_INVOICE_PAGE_SCREENS);
});
