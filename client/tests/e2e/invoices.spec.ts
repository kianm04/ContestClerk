import { expect, test, type Locator, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	createTestUser,
	giveInvoice,
	giveSeat,
	removeInvoice,
	signIn,
	type TestUser
} from './signed-in-user';
import {
	expectNoSidewaysOverflow,
	expectPageFitsInScreens,
	saveFullPageScreenshot
} from './page-shape';

// The acceptance criteria of `specs/05-pages/delegate/invoices.md` and
// `specs/05-pages/delegate/invoice.md` that need a real browser: every invoice
// the reader pays for is listed with the unpaid ones first, the outstanding
// total adds up, a row is a link a browser with no JavaScript can follow, only
// the payer or a head of the delegation may open one, a manually collecting
// conference shows its instructions instead of a button, and every status that
// is not `unpaid` says its own sentence.
//
// Every test makes its own account and its own invoices, so the three Playwright
// projects can run the same test at once without reaching for the same row.
// Invoices are deleted again in a `finally`, because the conferences they hang
// on come from `supabase/seed.sql` and outlive the test, and
// `invoices.conference_id` is "on delete restrict".
//
// The list is drawn twice, as cards on a phone and as a table from `md` up, and
// one of the two is hidden at any width. Everything below therefore looks at
// what is *shown*, the way `tests/e2e/manage-delegations.spec.ts` does with the
// same pair of layouts.

/**
 * How long an assertion that waits on a page reading the database may take.
 *
 * Longer than the five seconds Playwright waits by default, for the reason
 * `tests/e2e/conferences.spec.ts` gives: every test in the run asks the one
 * local database at once, and an answer has taken up to eight seconds.
 */
const DATABASE_TIMEOUT_MS = 15_000;

/**
 * Rotterdam Spring MUN 2026, the seeded conference that collects its money
 * outside MUNMeet. `supabase/seed.sql` gives it fees and the payment
 * instructions the invoice page shows in place of a Pay button.
 */
const MANUAL_CONFERENCE_ID = '20000000-0000-4000-8000-000000000016';
const MANUAL_CONFERENCE_NAME = 'Rotterdam Spring MUN 2026';

/**
 * Amsterdam Open MUN 2027, which collects by card and is where the seeded
 * committees and seats are. It is the conference for the invoice that has a
 * seat on it, and for the one that says card payment is not ready yet.
 */
const CARD_CONFERENCE_ID = '20000000-0000-4000-8000-000000000009';
const CARD_CONFERENCE_NAME = 'Amsterdam Open MUN 2027';

/**
 * The Human Rights Council of that conference, and a seat in it no other
 * browser test uses. `supabase/seed.sql` lists which seats each test may take;
 * the Philippines is one of the four it leaves free.
 */
const SEEDED_COMMITTEE_ID = '30000000-0000-4000-8000-000000000002';
const SEEDED_COMMITTEE_NAME = 'United Nations Human Rights Council';
const FREE_SEAT_NAME = 'Philippines';

/**
 * A number no other test uses. Every invoice number in the table has to be
 * unique, and the three Playwright projects run at the same time, so each row
 * takes the name of the test that wrote it and the project it ran in.
 */
function invoiceNumber(name: string): string {
	return `e2e-${name}-${test.info().project.name}-${Date.now()}`;
}

/** Everything the page says about itself, without the top bar and the footer. */
function main(page: Page): Locator {
	return page.getByRole('main');
}

/** Words the reader can actually see, rather than words in the layout this width hides. */
function shownText(page: Page, text: string): Locator {
	return main(page).getByText(text).filter({ visible: true });
}

/**
 * Everything the page is showing, as one line of text.
 *
 * `innerText` gives the text as it is drawn, so the half of the list this width
 * hides is left out of it, and the runs of spaces and newlines between one cell
 * and the next are squeezed to a single space.
 */
async function shownWords(page: Page): Promise<string> {
	return (await main(page).innerText()).replace(/\s+/g, ' ');
}

/**
 * The totals at the top of the list, as one line of text.
 *
 * Each figure sits under its own label in a tile, and the labels are drawn in
 * capitals, which `innerText` reports as drawn. The line is lowered to small
 * letters so a check still reads "outstanding €65.00", a label and the figure
 * right under it.
 */
async function shownTotals(page: Page): Promise<string> {
	const totals = main(page).getByRole('region', { name: 'Totals' });
	return (await totals.innerText()).replace(/\s+/g, ' ').toLowerCase();
}

test('lists every invoice the reader pays for, with what is still owed first', async ({ page }) => {
	const user = await createTestUser();
	const paid = await giveInvoice(user, {
		conferenceId: MANUAL_CONFERENCE_ID,
		number: invoiceNumber('paid'),
		status: 'paid',
		description: 'Delegate fee for a conference that is over',
		unitAmountCents: 4000,
		paidAt: new Date().toISOString(),
		paidMethod: 'manual'
	});
	const unpaid = await giveInvoice(user, {
		conferenceId: MANUAL_CONFERENCE_ID,
		number: invoiceNumber('unpaid'),
		status: 'unpaid',
		description: 'Delegate fee that is still owed',
		unitAmountCents: 6500,
		dueAt: '2027-01-22T12:00:00Z'
	});

	try {
		await signIn(page, user);
		await page.goto('/invoices');

		await expect(shownText(page, 'Delegate fee that is still owed')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		const words = await shownWords(page);

		// The unpaid one comes first, whichever order the database answered in.
		expect(words.indexOf('Delegate fee that is still owed')).toBeLessThan(
			words.indexOf('Delegate fee for a conference that is over')
		);

		// The outstanding total is the unpaid invoice alone, and the paid total is
		// the other one.
		const totals = await shownTotals(page);
		expect(totals).toContain('outstanding €65.00');
		expect(totals).toContain('paid €40.00');
		expect(words).toContain(MANUAL_CONFERENCE_NAME);
	} finally {
		await removeInvoice(paid);
		await removeInvoice(unpaid);
	}
});

test('says so plainly when the reader has never been charged', async ({ page }) => {
	const user = await createTestUser();

	await signIn(page, user);
	await page.goto('/invoices');

	await expect(shownText(page, 'No invoices.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	expect(await shownWords(page)).toContain('When a conference charges a fee');
});

test('lists the invoices of a delegation the reader heads', async ({ page }) => {
	const admin = createServiceRoleClient();
	const payer = await createTestUser();
	const head = await createTestUser();

	// The invoice is raised against a delegation the reader heads and names
	// somebody else as its payer, which is the case Row Level Security allows
	// and a payer-only query would miss.
	const delegationId = await addDelegation(head);
	const invoiceId = await giveInvoice(payer, {
		conferenceId: MANUAL_CONFERENCE_ID,
		number: invoiceNumber('group'),
		status: 'unpaid',
		description: 'School delegate fee for two',
		unitAmountCents: 5500,
		quantity: 2,
		delegationId
	});

	try {
		await signIn(page, head);
		await page.goto('/invoices');

		await expect(shownText(page, 'School delegate fee for two')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		expect(await shownTotals(page)).toContain('outstanding €110.00');

		// The head may open it as well as see it in the list.
		await page.goto(`/invoices/${invoiceId}`);

		await expect(shownText(page, 'School delegate fee for two')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
	} finally {
		await removeInvoice(invoiceId);
		await admin.from('delegations').delete().eq('id', delegationId);
	}
});

// The "a row is a plain link a browser with no JavaScript can follow" criterion
// is met by this test running on the `desktop-no-js` project like every other
// browser test, rather than by a context made by hand here.
test('follows a row to the invoice it names', async ({ page }) => {
	const user = await createTestUser();
	const invoiceId = await giveInvoice(user, {
		conferenceId: MANUAL_CONFERENCE_ID,
		number: invoiceNumber('nojs'),
		status: 'unpaid',
		description: 'Delegate fee followed without JavaScript',
		unitAmountCents: 6500
	});

	try {
		await signIn(page, user);
		await page.goto('/invoices');

		// Whichever of the two layouts this width shows, the row carries a plain
		// link to the invoice, and a browser with no JavaScript follows it.
		//
		// The address is matched on its ending, because `resolve()` writes a
		// relative URL ("./invoices/...") into the server-rendered page and an
		// absolute one ("/invoices/...") once the page has come to life.
		await main(page)
			.locator(`a[href$="/invoices/${invoiceId}"]`)
			.filter({ visible: true })
			.first()
			.click({ timeout: DATABASE_TIMEOUT_MS });

		await expect(page).toHaveURL(`/invoices/${invoiceId}`);
		await expect(shownText(page, 'Delegate fee followed without JavaScript')).toBeVisible();
	} finally {
		await removeInvoice(invoiceId);
	}
});

test('shows the organisers instructions instead of a way to pay by card', async ({ page }) => {
	const user = await createTestUser();
	const invoiceId = await giveInvoice(user, {
		conferenceId: MANUAL_CONFERENCE_ID,
		number: invoiceNumber('manual'),
		status: 'unpaid',
		description: 'Delegate fee paid by bank transfer',
		unitAmountCents: 6500
	});

	try {
		await signIn(page, user);
		await page.goto(`/invoices/${invoiceId}`);

		await expect(shownText(page, 'How to pay')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

		const words = await shownWords(page);

		expect(words).toContain('NL91 ABNA 0417 1643 00');
		expect(words).not.toContain('Card payment is not available yet');
		await expect(main(page).getByRole('button', { name: 'Pay by card' })).toHaveCount(0);
	} finally {
		await removeInvoice(invoiceId);
	}
});

test('says card payment is not ready while the organisers are still setting it up', async ({
	page
}) => {
	const user = await createTestUser();
	const invoiceId = await giveInvoice(user, {
		conferenceId: CARD_CONFERENCE_ID,
		number: invoiceNumber('card'),
		status: 'unpaid',
		description: 'Delegate fee at a conference that collects by card',
		unitAmountCents: 6500
	});

	try {
		await signIn(page, user);
		await page.goto(`/invoices/${invoiceId}`);

		await expect(shownText(page, 'Card payment is not available yet')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		// A conference that collects by card has no instructions to show, and no
		// button either until T32 builds Stripe Checkout.
		await expect(main(page).getByText('How to pay')).toHaveCount(0);

		// `getByText` reads the text in the markup. The conference name is drawn
		// above the heading in capitals by a Tailwind `uppercase` class, so the
		// words the screen shows are not the words the page was written with.
		await expect(shownText(page, CARD_CONFERENCE_NAME)).toBeVisible();
	} finally {
		await removeInvoice(invoiceId);
	}
});

test('gives every status that is not unpaid its own sentence, and no way to pay', async ({
	page
}) => {
	const user = await createTestUser();
	const sentences = {
		paid: 'marked as paid by the organisers',
		waived: 'The organisers waived this invoice.',
		void: 'This invoice was cancelled.',
		refunded: 'This invoice was refunded on'
	} as const;
	const written: string[] = [];

	try {
		await signIn(page, user);

		for (const status of ['paid', 'waived', 'void', 'refunded'] as const) {
			const invoiceId = await giveInvoice(user, {
				conferenceId: MANUAL_CONFERENCE_ID,
				number: invoiceNumber(status),
				status,
				description: `Delegate fee that is ${status}`,
				unitAmountCents: 6500,
				paidAt: status === 'paid' ? new Date().toISOString() : null,
				paidMethod: status === 'paid' ? 'manual' : null
			});
			written.push(invoiceId);

			await page.goto(`/invoices/${invoiceId}`);

			await expect(shownText(page, sentences[status])).toBeVisible({
				timeout: DATABASE_TIMEOUT_MS
			});

			// An invoice that is no longer unpaid is offered no way to pay it, which
			// is the refusal T31 decided belongs on the page.
			await expect(main(page).getByText('How to pay')).toHaveCount(0);
			await expect(main(page).getByText('Card payment is not available yet')).toHaveCount(0);
		}
	} finally {
		for (const invoiceId of written) {
			await removeInvoice(invoiceId);
		}
	}
});

test('shows a stranger nothing, so a guessed address cannot be told from a real one', async ({
	page
}) => {
	const payer = await createTestUser();
	const stranger = await createTestUser();
	const invoiceId = await giveInvoice(payer, {
		conferenceId: MANUAL_CONFERENCE_ID,
		number: invoiceNumber('stranger'),
		status: 'unpaid',
		description: 'Delegate fee somebody else owes',
		unitAmountCents: 6500
	});

	try {
		await signIn(page, stranger);

		const response = await page.goto(`/invoices/${invoiceId}`);

		expect(response?.status()).toBe(404);
		await expect(page.locator('body')).not.toContainText('Delegate fee somebody else owes');
	} finally {
		await removeInvoice(invoiceId);
	}
});

test('names the seat an individual invoice was raised for', async ({ page }) => {
	const admin = createServiceRoleClient();
	const user = await createTestUser();

	await giveSeat(user, SEEDED_COMMITTEE_ID, FREE_SEAT_NAME);

	const { data: seat } = await admin
		.from('seats')
		.select('id')
		.eq('committee_id', SEEDED_COMMITTEE_ID)
		.eq('name', FREE_SEAT_NAME)
		.single();

	const seatId = seat?.id ?? null;
	const invoiceId = await giveInvoice(user, {
		conferenceId: CARD_CONFERENCE_ID,
		number: invoiceNumber('seat'),
		status: 'unpaid',
		description: `Delegate fee · ${CARD_CONFERENCE_NAME}`,
		unitAmountCents: 6500,
		seatId
	});

	try {
		await signIn(page, user);
		await page.goto(`/invoices/${invoiceId}`);

		await expect(shownText(page, FREE_SEAT_NAME)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		expect(await shownWords(page)).toContain(SEEDED_COMMITTEE_NAME);
	} finally {
		await removeInvoice(invoiceId);

		if (seatId) {
			await admin.from('seats').update({ user_id: null, allocated_at: null }).eq('id', seatId);
		}
	}
});

test('both pages fit their window and do not scroll sideways', async ({ page }) => {
	const user = await createTestUser();
	const written: string[] = [];

	for (const status of ['unpaid', 'paid', 'waived'] as const) {
		written.push(
			await giveInvoice(user, {
				conferenceId: MANUAL_CONFERENCE_ID,
				number: invoiceNumber(`shape-${status}`),
				status,
				description: `Delegate fee with a description long enough to show how a narrow column wraps it (${status})`,
				unitAmountCents: 6500,
				dueAt: '2027-01-22T12:00:00Z',
				paidAt: status === 'paid' ? new Date().toISOString() : null,
				paidMethod: status === 'paid' ? 'manual' : null
			})
		);
	}

	try {
		await signIn(page, user);
		await page.goto('/invoices');
		await expect(main(page).getByRole('region', { name: 'Totals' })).toContainText('€65.00', {
			timeout: DATABASE_TIMEOUT_MS
		});

		await saveFullPageScreenshot(page, 'invoices');
		await expectNoSidewaysOverflow(page);
		await expectPageFitsInScreens(page, 3);

		await page.goto(`/invoices/${written[0]}`);
		await expect(shownText(page, 'How to pay')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

		await saveFullPageScreenshot(page, 'invoice');
		await expectNoSidewaysOverflow(page);
		await expectPageFitsInScreens(page, 2);
	} finally {
		for (const invoiceId of written) {
			await removeInvoice(invoiceId);
		}
	}
});

/**
 * Write one accepted delegation at the manually collecting conference and make
 * this account its head, so the group invoice above has a delegation to hang on.
 *
 * The service-role client writes it, the way `giveInvoice` writes an invoice:
 * registering a delegation is `tests/e2e/delegations.spec.ts`'s work, not this
 * file's. The name and the join code carry the project and the clock, because
 * the three Playwright projects run at the same time and `join_code` is unique.
 */
async function addDelegation(head: TestUser): Promise<string> {
	const admin = createServiceRoleClient();
	const stamp = `${test.info().project.name}-${Date.now()}`;

	const { data, error } = await admin
		.from('delegations')
		.insert({
			conference_id: MANUAL_CONFERENCE_ID,
			name: `Invoice Head Delegation ${stamp}`,
			institution_name: 'A school that pays by transfer',
			country_code: 'NL',
			status: 'accepted',
			requested_seats: 2,
			join_code: `E2E${Date.now()}`.slice(0, 12)
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test delegation: ${error?.message}`);
	}

	const { error: memberError } = await admin
		.from('delegation_members')
		.insert({ delegation_id: data.id, user_id: head.id, role: 'head' });

	if (memberError) {
		throw new Error(`Could not make the test account a head: ${memberError.message}`);
	}

	return data.id;
}
