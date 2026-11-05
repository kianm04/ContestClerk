import { expect, test, type APIResponse, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { createTestUser, signIn, type TestUser } from './signed-in-user';
import { createScheduleConference, type ScheduleConference } from './schedule-fixtures';

// Step 6 of docs/roles-and-permissions.md, in a browser: the fees page has two
// halves. `edit_conference` draws the fee list's forms, `read_invoices` the
// "Invoices" tab, and `manage_invoices` its buttons and the export. A reader
// sees the half they hold, and the server refuses a post from the other half.
//
// Every test makes its own published conference with one fee and one unpaid
// invoice, then signs in as a team member with one role.

/** How long an assertion that waits on a page reading the database may take. */
const DATABASE_TIMEOUT_MS = 15_000;

type Setup = {
	conference: ScheduleConference;
	invoiceNumber: string;
	invoiceId: string;
	feesPath: string;
};

/** A published conference with a delegate fee and Anna's unpaid invoice for it. */
async function createSetup(prefix: string): Promise<Setup> {
	const admin = createServiceRoleClient();
	const owner = await createTestUser('Priya Nair');
	const payer = await createTestUser('Anna Kowalski');
	const conference = await createScheduleConference({ owner, namePrefix: prefix });

	const { data: row } = await admin
		.from('conferences')
		.select('currency')
		.eq('id', conference.id)
		.single();
	const { data: fee, error: feeError } = await admin
		.from('fees')
		.insert({
			conference_id: conference.id,
			name: 'Delegate fee',
			amount_cents: 6500,
			applies_to: 'individual',
			position: 0
		})
		.select('id')
		.single();

	if (feeError || !fee) {
		throw new Error(`Could not write the test fee: ${feeError?.message}`);
	}

	// The service role walks past the trigger that numbers an invoice, so the
	// test numbers it, as `manage-fees-invoices.spec.ts` does.
	const invoiceNumber = `${conference.slug}-0001`;
	const { data: invoice, error } = await admin
		.from('invoices')
		.insert({
			conference_id: conference.id,
			fee_id: fee.id,
			number: invoiceNumber,
			payer_user_id: payer.id,
			description: 'Delegate fee',
			quantity: 1,
			unit_amount_cents: 6500,
			currency: row?.currency ?? 'EUR'
		})
		.select('id')
		.single();

	if (error || !invoice) {
		throw new Error(`Could not write the test invoice: ${error?.message}`);
	}

	return {
		conference,
		invoiceNumber,
		invoiceId: invoice.id,
		feesPath: `/manage/${conference.slug}/fees`
	};
}

/** A new team member holding one conference-wide role with these permissions. */
async function teamMemberWith(conferenceId: string, permissions: string[]): Promise<TestUser> {
	const admin = createServiceRoleClient();
	const member = await createTestUser('Sofia Desk');

	const { data: role, error: roleError } = await admin
		.from('conference_roles')
		.insert({
			conference_id: conferenceId,
			name: `Desk ${crypto.randomUUID().slice(0, 8)}`,
			position: 1,
			permissions
		})
		.select('id')
		.single();

	if (roleError || !role) {
		throw new Error(`Could not make the test role: ${roleError?.message}`);
	}

	await admin.from('conference_staff').insert({ conference_id: conferenceId, user_id: member.id });

	const { error } = await admin
		.from('conference_role_members')
		.insert({ conference_id: conferenceId, user_id: member.id, role_id: role.id });

	if (error) {
		throw new Error(`Could not give the test role: ${error.message}`);
	}

	return member;
}

/** Open the fees page and wait until its title says it has really arrived. */
async function openFees(page: Page, path: string): Promise<void> {
	await page.goto(path);

	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Fees', {
		timeout: DATABASE_TIMEOUT_MS
	});
}

/** Post to a form action the way a browser with no script does, with the browser's cookies. */
async function postForm(page: Page, action: string, fields: [string, string][]) {
	const origin = new URL(page.url()).origin;

	return page.request.post(action, {
		data: new URLSearchParams(fields).toString(),
		headers: { origin, accept: 'text/html', 'content-type': 'application/x-www-form-urlencoded' }
	}) as Promise<APIResponse>;
}

/** The invoice's status, read past every policy. */
async function readStatus(invoiceId: string): Promise<string | undefined> {
	const { data } = await createServiceRoleClient()
		.from('invoices')
		.select('status')
		.eq('id', invoiceId)
		.single();

	return data?.status;
}

// Every test signs a new account in against the one database the suite shares.
test.beforeEach(() => {
	test.slow();
});

test('shows a reader with read_invoices the invoices, and nothing to settle or change', async ({
	page
}) => {
	const setup = await createSetup('Invoice Reader MUN');
	const reader = await teamMemberWith(setup.conference.id, ['read_invoices']);

	await signIn(page, reader);
	await openFees(page, setup.feesPath);

	const main = page.getByRole('main');

	await expect(main.getByText(setup.invoiceNumber).filter({ visible: true }).first()).toBeVisible();
	await expect(main.getByRole('button', { name: 'Mark as paid' })).toHaveCount(0);
	await expect(main.getByRole('link', { name: 'Export CSV' })).toHaveCount(0);

	await openFees(page, `${setup.feesPath}?tab=fees`);
	await expect(main.getByText('Delegate fee').filter({ visible: true }).first()).toBeVisible();
	await expect(main.getByRole('region', { name: 'How delegates pay' })).toHaveCount(0);
	await expect(main.getByRole('button', { name: 'Reorder Delegate fee' })).toHaveCount(0);

	// Nothing is drawn, and the server refuses the post and the export all the same.
	const response = await postForm(page, `${setup.feesPath}?/markPaid`, [
		['invoiceId', setup.invoiceId]
	]);
	const exportResponse = await page.request.get(`${setup.feesPath}/export`);

	expect(response.status()).toBe(404);
	expect(exportResponse.status()).toBe(404);
	expect(await readStatus(setup.invoiceId)).toBe('unpaid');
});

test('shows an editor without read_invoices the fee list and no invoices', async ({ page }) => {
	const setup = await createSetup('Fee Editor MUN');
	const editor = await teamMemberWith(setup.conference.id, ['edit_conference']);

	await signIn(page, editor);
	await openFees(page, `${setup.feesPath}?tab=invoices`);

	const main = page.getByRole('main');

	// The fee form waits for a way to pay, so the editor's own form is this one.
	await expect(main.getByRole('region', { name: 'How delegates pay' })).toBeVisible();
	await expect(main.getByText('Delegate fee').filter({ visible: true }).first()).toBeVisible();
	await expect(main.getByRole('navigation', { name: 'Fees and invoices' })).toHaveCount(0);
	await expect(main.getByText(setup.invoiceNumber)).toHaveCount(0);
});

test('lets a holder of manage_invoices mark an invoice paid', async ({ page }) => {
	const setup = await createSetup('Finance Desk MUN');
	const finance = await teamMemberWith(setup.conference.id, ['read_invoices', 'manage_invoices']);

	await signIn(page, finance);
	await openFees(page, setup.feesPath);

	const main = page.getByRole('main');

	await expect(main.getByRole('link', { name: 'Export CSV' })).toBeVisible();
	await expect(main.getByRole('button', { name: 'Reorder Delegate fee' })).toHaveCount(0);

	const response = await postForm(page, `${setup.feesPath}?/markPaid`, [
		['invoiceId', setup.invoiceId]
	]);

	expect(response.status()).toBeLessThan(400);
	expect(await readStatus(setup.invoiceId)).toBe('paid');
});
