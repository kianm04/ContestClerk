import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	createServiceRoleClient,
	createSignedInClient,
	createVisitorClient,
	type SignedInClient
} from './supabase-test-client';
import {
	addCommittee,
	addOrganizationMember,
	addSeat,
	createConferenceOwnedByMe,
	giveSeatTo
} from './conference-fixtures';

// The stripe-organizations package of the security review of 2026-10-10
// (docs/security-review-2026-10-10.md): C5, L3, L11, L32 and L33, all closed by
// migration 20261022130000_stripe_organizations_security.sql.
//
//   * C5: protect_stripe_columns now runs on insert as well, set_stripe_account
//     refuses a second binding, and organizations_stripe_account_id_unique keeps
//     one Stripe account to one organisation.
//   * L3: the public can no longer read stripe_account_id, created_by or
//     stripe_onboarding_completed_at off organizations; the view
//     organization_private_settings hands an admin the three and a member only
//     whether there is an account.
//   * L11: the organiser's note moved off invoices into invoice_internal_notes,
//     which only invoice readers and managers may read.
//   * L32: protect_invoice_columns writes paid_at and paid_method itself on the
//     unpaid -> paid transition and refuses every other browser change to them.
//   * L33: set_invoice_checkout_session is no longer callable from a browser.
//
// Every refusal below is proved with a signed-in or visitor client. The service
// role only arranges rows nobody may create and reads past the policies to show
// what was really saved.

/** The error code Postgres sends when a role lacks a privilege on a table or function. */
const PERMISSION_DENIED_CODE = '42501';

/** The error code Postgres sends for a column that does not exist. */
const UNDEFINED_COLUMN_CODE = '42703';

/** Signs somebody up and gives them an organisation they own. */
async function createOrganizationOwnedByMe() {
	const { supabase, userId, email } = await createSignedInClient();

	const { data, error } = await supabase
		.from('organizations')
		.insert({
			name: 'Owned org',
			slug: `owned-org-${crypto.randomUUID()}`,
			created_by: userId
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not create the test organisation: ${error?.message}`);
	}

	return { supabase, userId, email, organizationId: data.id as string };
}

/**
 * Adds a brand-new account to an organisation as an ordinary member, the way an
 * accepted invitation would (no browser may insert the row since H3).
 */
async function addPlainMember(organizationId: string): Promise<SignedInClient> {
	const member = await createSignedInClient();

	await addOrganizationMember(organizationId, member.userId, 'member');

	return member;
}

/** The Stripe columns of one organisation, read past every policy. */
async function stripeColumnsOf(organizationId: string) {
	const { data, error } = await createServiceRoleClient()
		.from('organizations')
		.select('stripe_account_id, stripe_onboarding_completed_at')
		.eq('id', organizationId)
		.single();

	if (error) {
		throw new Error(`Could not read the organisation past the policies: ${error.message}`);
	}

	return data;
}

/**
 * A draft conference with one invoice on it, owed by a brand-new account, raised
 * by the organiser through their own client so the insert policy has to allow it.
 */
async function raiseInvoiceOwedByNewPayer() {
	const organiser = await createConferenceOwnedByMe();
	const payer = await createSignedInClient('Ana Silva');

	// Since the money-races fixes (M10) an invoice can only be raised against
	// somebody taking part, so the payer gets a seat first.
	const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
	const seatId = await addSeat(organiser.supabase, committeeId);
	await giveSeatTo(organiser.supabase, seatId, payer.userId);

	const { data: number, error: numberError } = await organiser.supabase.rpc('next_invoice_number', {
		conference_id: organiser.conferenceId
	});

	if (numberError || !number) {
		throw new Error(`Could not number the fixture invoice: ${numberError?.message}`);
	}

	const { data, error } = await organiser.supabase
		.from('invoices')
		.insert({
			conference_id: organiser.conferenceId,
			number,
			payer_user_id: payer.userId,
			description: 'Delegate fee · Fixture Conference',
			quantity: 1,
			unit_amount_cents: 6500,
			currency: 'EUR'
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not raise the fixture invoice: ${error?.message}`);
	}

	return { organiser, payer, invoiceId: data.id as string };
}

/** The payment details of one invoice, read past every policy. */
async function paymentDetailsOf(invoiceId: string) {
	const { data, error } = await createServiceRoleClient()
		.from('invoices')
		.select('status, paid_at, paid_method, stripe_checkout_session_id')
		.eq('id', invoiceId)
		.single();

	if (error) {
		throw new Error(`Could not read the invoice past the policies: ${error.message}`);
	}

	return data;
}

/** A moment far enough in the past that no test could have run then. */
const LONG_AGO = '2000-01-01T00:00:00.000Z';

/** Marks an invoice paid the way the fees page does: status and method, and a moment the trigger overwrites. */
async function markPaidAsOrganiser(organiser: SupabaseClient, invoiceId: string) {
	const { error } = await organiser
		.from('invoices')
		.update({ status: 'paid', paid_method: 'manual', paid_at: LONG_AGO })
		.eq('id', invoiceId);

	if (error) {
		throw new Error(`Could not mark the fixture invoice paid: ${error.message}`);
	}
}

describe('protect_stripe_columns, the organizations_protect_stripe_columns trigger, on insert (C5)', () => {
	it('refuses an owner who creates an organisation with a Stripe account already on it', async () => {
		const { supabase, userId } = await createSignedInClient();

		const { error } = await supabase.from('organizations').insert({
			name: 'Pre-connected org',
			slug: `pre-connected-${crypto.randomUUID()}`,
			created_by: userId,
			stripe_account_id: 'acct_somebody_elses'
		});

		expect(error?.message).toContain('Stripe details');
	});

	it('refuses one born with its onboarding already complete', async () => {
		const { supabase, userId } = await createSignedInClient();

		// This column is the publish checklist's "Stripe connected" gate, so an
		// organisation that could set it on the way in would be telling us it
		// can take money when it cannot.
		const { error } = await supabase.from('organizations').insert({
			name: 'Pre-onboarded org',
			slug: `pre-onboarded-${crypto.randomUUID()}`,
			created_by: userId,
			stripe_onboarding_completed_at: new Date().toISOString()
		});

		expect(error?.message).toContain('Stripe details');
	});

	it('still lets an organisation be created without them', async () => {
		const { organizationId } = await createOrganizationOwnedByMe();

		expect(await stripeColumnsOf(organizationId)).toEqual({
			stripe_account_id: null,
			stripe_onboarding_completed_at: null
		});
	});
});

describe('set_stripe_account (C5)', () => {
	it('refuses a second binding once an account is stored', async () => {
		const { supabase, organizationId } = await createOrganizationOwnedByMe();
		// Unique per run, because one Stripe account may pay one organisation and
		// the database is not rebuilt between two runs of this file.
		const firstId = `acct_first_${crypto.randomUUID()}`;

		const first = await supabase.rpc('set_stripe_account', {
			organization_id: organizationId,
			stripe_account_id: firstId
		});

		expect(first.error).toBeNull();

		// An admin who could point the organisation at another id afterwards
		// could point it at an account that is not theirs. Replacing an account
		// is a support job, not a form.
		const second = await supabase.rpc('set_stripe_account', {
			organization_id: organizationId,
			stripe_account_id: `acct_second_${crypto.randomUUID()}`
		});

		expect(second.error?.message).toContain('already has a Stripe account');
		expect((await stripeColumnsOf(organizationId)).stripe_account_id).toBe(firstId);
	});

	it('refuses two organisations sharing one account id', async () => {
		const first = await createOrganizationOwnedByMe();
		const second = await createOrganizationOwnedByMe();
		const sharedId = `acct_shared_${crypto.randomUUID()}`;

		await first.supabase.rpc('set_stripe_account', {
			organization_id: first.organizationId,
			stripe_account_id: sharedId
		});

		const { error } = await second.supabase.rpc('set_stripe_account', {
			organization_id: second.organizationId,
			stripe_account_id: sharedId
		});

		expect(error?.message).toContain('organizations_stripe_account_id_unique');
		expect((await stripeColumnsOf(second.organizationId)).stripe_account_id).toBeNull();
	});

	it('refuses an empty id', async () => {
		const { supabase, organizationId } = await createOrganizationOwnedByMe();

		const { error } = await supabase.rpc('set_stripe_account', {
			organization_id: organizationId,
			stripe_account_id: '   '
		});

		expect(error?.message).toContain('A Stripe account id is needed');
		expect((await stripeColumnsOf(organizationId)).stripe_account_id).toBeNull();
	});
});

describe('the organisation columns the public may read (L3)', () => {
	it('refuses a visitor the Stripe account id', async () => {
		const { organizationId } = await createOrganizationOwnedByMe();

		const { error } = await createVisitorClient()
			.from('organizations')
			.select('stripe_account_id')
			.eq('id', organizationId);

		expect(error?.code).toBe(PERMISSION_DENIED_CODE);
	});

	it('refuses a signed-in stranger the Stripe account id', async () => {
		const { organizationId } = await createOrganizationOwnedByMe();
		const stranger = await createSignedInClient();

		const { error } = await stranger.supabase
			.from('organizations')
			.select('stripe_account_id')
			.eq('id', organizationId);

		expect(error?.code).toBe(PERMISSION_DENIED_CODE);
	});

	it('refuses a visitor the creator, who stays readable to the signed-in', async () => {
		const { userId, organizationId } = await createOrganizationOwnedByMe();
		const stranger = await createSignedInClient();

		const visitorAnswer = await createVisitorClient()
			.from('organizations')
			.select('created_by')
			.eq('id', organizationId);
		// create_quick_session (20261001121500) runs as the caller and finds a
		// person's own personal organisation by created_by, so the grant stays
		// for the signed-in until that function stops reading the column that
		// way. The migration says the same above its grant.
		const strangerAnswer = await stranger.supabase
			.from('organizations')
			.select('created_by')
			.eq('id', organizationId);

		expect(visitorAnswer.error?.code).toBe(PERMISSION_DENIED_CODE);
		expect(strangerAnswer.data).toEqual([{ created_by: userId }]);
	});

	it('refuses a visitor the onboarding timestamp', async () => {
		const { organizationId } = await createOrganizationOwnedByMe();

		// Signed-in people may still read this one: it is the "Stripe connected"
		// fact the publish checklist, the organiser area and the creation flow
		// show to every member and conference administrator. A visitor has no
		// business with it.
		const { error } = await createVisitorClient()
			.from('organizations')
			.select('stripe_onboarding_completed_at')
			.eq('id', organizationId);

		expect(error?.code).toBe(PERMISSION_DENIED_CODE);
	});

	it('still lets a visitor read the public columns', async () => {
		const { organizationId } = await createOrganizationOwnedByMe();

		const { data, error } = await createVisitorClient()
			.from('organizations')
			.select(
				'id, name, slug, description, country_code, website_url, logo_path, city, is_personal'
			)
			.eq('id', organizationId);

		expect(error).toBeNull();
		expect(data).toEqual([expect.objectContaining({ id: organizationId, name: 'Owned org' })]);
	});

	it('keeps conferences_with_organization working for a visitor', async () => {
		// The view reads organizations as the visitor (security_invoker), so it
		// only works while the two organisation columns it uses are still granted.
		const { error } = await createVisitorClient()
			.from('conferences_with_organization')
			.select('slug, organization_name, organization_slug')
			.limit(1);

		expect(error).toBeNull();
	});

	it('still lets an owner create an organisation, whose policy names created_by', async () => {
		// The insert policy compares created_by with the caller. A policy is
		// evaluated past the column grants, so taking the select grant away must
		// not break the one write everybody is allowed.
		const { supabase, userId } = await createSignedInClient();

		const { data, error } = await supabase
			.from('organizations')
			.insert({
				name: 'Still creatable',
				slug: `creatable-${crypto.randomUUID()}`,
				created_by: userId
			})
			.select('id');

		expect(error).toBeNull();
		expect(data).toHaveLength(1);
	});
});

describe('organization_private_settings (L3)', () => {
	it('hands an admin the account id, the onboarding timestamp and the creator', async () => {
		const { supabase, userId, organizationId } = await createOrganizationOwnedByMe();
		const accountId = `acct_for_the_admin_${crypto.randomUUID()}`;
		await supabase.rpc('set_stripe_account', {
			organization_id: organizationId,
			stripe_account_id: accountId
		});

		const { data, error } = await supabase
			.from('organization_private_settings')
			.select(
				'organization_id, stripe_account_id, stripe_onboarding_completed_at, has_stripe_account, created_by'
			)
			.eq('organization_id', organizationId);

		expect(error).toBeNull();
		expect(data).toEqual([
			{
				organization_id: organizationId,
				stripe_account_id: accountId,
				stripe_onboarding_completed_at: null,
				has_stripe_account: true,
				created_by: userId
			}
		]);
	});

	it('hands a plain member only whether there is an account', async () => {
		const { supabase, organizationId } = await createOrganizationOwnedByMe();
		await supabase.rpc('set_stripe_account', {
			organization_id: organizationId,
			stripe_account_id: `acct_for_the_member_${crypto.randomUUID()}`
		});
		const member = await addPlainMember(organizationId);

		// The settings page shows every member how far Stripe has got, and
		// "setup not finished" needs to know an account exists. Which account it
		// is, and who made the organisation, are the admin's.
		const { data } = await member.supabase
			.from('organization_private_settings')
			.select('stripe_account_id, has_stripe_account, created_by')
			.eq('organization_id', organizationId);

		expect(data).toEqual([{ stripe_account_id: null, has_stripe_account: true, created_by: null }]);
	});

	it('hands a stranger nothing, and a visitor nothing at all', async () => {
		const { organizationId } = await createOrganizationOwnedByMe();
		const stranger = await createSignedInClient();

		const strangerAnswer = await stranger.supabase
			.from('organization_private_settings')
			.select('organization_id')
			.eq('organization_id', organizationId);
		const visitorAnswer = await createVisitorClient()
			.from('organization_private_settings')
			.select('organization_id')
			.eq('organization_id', organizationId);

		expect(strangerAnswer.data).toEqual([]);
		expect(visitorAnswer.error?.code).toBe(PERMISSION_DENIED_CODE);
	});
});

describe('invoice_internal_notes, with can_read_invoice_note and can_manage_invoice_note (L11)', () => {
	it('lets the organiser write a note and read it back beside the invoice', async () => {
		const { organiser, invoiceId } = await raiseInvoiceOwedByNewPayer();

		const { error } = await organiser.supabase
			.from('invoice_internal_notes')
			.upsert({ invoice_id: invoiceId, note: 'Paid by bank transfer 12 Jan' });

		expect(error).toBeNull();

		const { data } = await organiser.supabase
			.from('invoices')
			.select('id, invoice_internal_notes(note)')
			.eq('id', invoiceId)
			.single();

		expect(data?.invoice_internal_notes).toEqual({ note: 'Paid by bank transfer 12 Jan' });
	});

	it('hides the note from the payer, who still reads the invoice itself', async () => {
		const { organiser, payer, invoiceId } = await raiseInvoiceOwedByNewPayer();
		await organiser.supabase
			.from('invoice_internal_notes')
			.upsert({ invoice_id: invoiceId, note: 'Chased twice by email' });

		const direct = await payer.supabase
			.from('invoice_internal_notes')
			.select('note')
			.eq('invoice_id', invoiceId);
		const beside = await payer.supabase
			.from('invoices')
			.select('id, invoice_internal_notes(note)')
			.eq('id', invoiceId)
			.single();

		expect(direct.data).toEqual([]);
		expect(beside.data).toEqual({ id: invoiceId, invoice_internal_notes: null });
	});

	it('refuses the payer writing one', async () => {
		const { payer, invoiceId } = await raiseInvoiceOwedByNewPayer();

		const { error } = await payer.supabase
			.from('invoice_internal_notes')
			.insert({ invoice_id: invoiceId, note: 'A note I wrote about myself' });

		expect(error?.code).toBe(PERMISSION_DENIED_CODE);
	});

	it('stamps updated_at itself when a note is rewritten, the invoice_internal_notes_set_updated_at trigger', async () => {
		const { organiser, invoiceId } = await raiseInvoiceOwedByNewPayer();
		await organiser.supabase
			.from('invoice_internal_notes')
			.upsert({ invoice_id: invoiceId, note: 'First note' });

		// A backdated updated_at travels with the new wording, to show the
		// trigger overwrites it a moment later, as invoices_set_updated_at does
		// for the invoice itself.
		const { data, error } = await organiser.supabase
			.from('invoice_internal_notes')
			.update({ note: 'Second note', updated_at: LONG_AGO })
			.eq('invoice_id', invoiceId)
			.select('note, updated_at');

		expect(error).toBeNull();
		expect(data?.[0]?.note).toBe('Second note');
		expect(new Date(data?.[0]?.updated_at).getTime()).toBeGreaterThan(Date.now() - 60_000);
	});

	it('left no note column on invoices for anybody to read', async () => {
		const { organiser, invoiceId } = await raiseInvoiceOwedByNewPayer();

		const { error } = await organiser.supabase.from('invoices').select('note').eq('id', invoiceId);

		expect(error?.code).toBe(UNDEFINED_COLUMN_CODE);
	});
});

describe('protect_invoice_columns, the payment details (L32)', () => {
	it('stamps paid_at itself when the organiser marks an invoice paid, whatever moment was sent', async () => {
		const { organiser, invoiceId } = await raiseInvoiceOwedByNewPayer();
		const before = Date.now();

		await markPaidAsOrganiser(organiser.supabase, invoiceId);

		const saved = await paymentDetailsOf(invoiceId);
		expect(saved.status).toBe('paid');
		expect(saved.paid_method).toBe('manual');
		// The database's clock and not the browser's: a backdated paid_at would
		// misstate when the money arrived.
		expect(new Date(saved.paid_at).getTime()).toBeGreaterThanOrEqual(before - 60_000);
	});

	it('records a manual payment when the organiser sends the status alone', async () => {
		const { organiser, invoiceId } = await raiseInvoiceOwedByNewPayer();

		const { error } = await organiser.supabase
			.from('invoices')
			.update({ status: 'paid' })
			.eq('id', invoiceId);

		expect(error).toBeNull();

		// A browser's "paid" is by definition the manual kind, so the row says so
		// rather than claiming a payment of no kind at all.
		const saved = await paymentDetailsOf(invoiceId);
		expect(saved.paid_method).toBe('manual');
		expect(saved.paid_at).not.toBeNull();
	});

	it('refuses the organiser marking an invoice paid by card', async () => {
		const { organiser, invoiceId } = await raiseInvoiceOwedByNewPayer();

		const { error } = await organiser.supabase
			.from('invoices')
			.update({ status: 'paid', paid_method: 'stripe', paid_at: new Date().toISOString() })
			.eq('id', invoiceId);

		expect(error?.message).toContain('Only a payment through Stripe');
	});

	it('refuses moving paid_at once the invoice is paid', async () => {
		const { organiser, invoiceId } = await raiseInvoiceOwedByNewPayer();
		await markPaidAsOrganiser(organiser.supabase, invoiceId);

		const { error } = await organiser.supabase
			.from('invoices')
			.update({ paid_at: LONG_AGO })
			.eq('id', invoiceId);

		expect(error?.message).toContain('payment details');
		expect(new Date((await paymentDetailsOf(invoiceId)).paid_at).toISOString()).not.toBe(LONG_AGO);
	});

	it('refuses changing paid_method once the invoice is paid', async () => {
		const { organiser, invoiceId } = await raiseInvoiceOwedByNewPayer();
		await markPaidAsOrganiser(organiser.supabase, invoiceId);

		const { error } = await organiser.supabase
			.from('invoices')
			.update({ paid_method: null })
			.eq('id', invoiceId);

		expect(error?.message).toContain('payment details');
		expect((await paymentDetailsOf(invoiceId)).paid_method).toBe('manual');
	});

	it('refuses payment details on a waive', async () => {
		const { organiser, invoiceId } = await raiseInvoiceOwedByNewPayer();

		// Waived means nobody paid, so a paid_at beside it would be a lie.
		const { error } = await organiser.supabase
			.from('invoices')
			.update({ status: 'waived', paid_at: new Date().toISOString() })
			.eq('id', invoiceId);

		expect(error?.message).toContain('payment details');
		expect((await paymentDetailsOf(invoiceId)).status).toBe('unpaid');
	});

	it('still lets the organiser move the due date', async () => {
		const { organiser, invoiceId } = await raiseInvoiceOwedByNewPayer();
		const dueAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

		const { data, error } = await organiser.supabase
			.from('invoices')
			.update({ due_at: dueAt })
			.eq('id', invoiceId)
			.select('due_at');

		expect(error).toBeNull();
		expect(new Date(data?.[0]?.due_at).toISOString()).toBe(dueAt);
	});

	it('leaves the server free to write the payment details, as the webhook will', async () => {
		const { organiser, invoiceId } = await raiseInvoiceOwedByNewPayer();
		await markPaidAsOrganiser(organiser.supabase, invoiceId);

		const { error } = await createServiceRoleClient()
			.from('invoices')
			.update({ paid_at: LONG_AGO })
			.eq('id', invoiceId);

		expect(error).toBeNull();
		expect(new Date((await paymentDetailsOf(invoiceId)).paid_at).toISOString()).toBe(LONG_AGO);
	});
});

describe('set_invoice_checkout_session (L33)', () => {
	it('is refused to the payer', async () => {
		const { payer, invoiceId } = await raiseInvoiceOwedByNewPayer();

		// A payer who could store any text as the session id could point the
		// webhook coming back at the wrong payment. The server writes the id with
		// the service role once it has made the session.
		const { error } = await payer.supabase.rpc('set_invoice_checkout_session', {
			invoice_id: invoiceId,
			session_id: 'cs_test_whatever_i_like'
		});

		expect(error?.code).toBe(PERMISSION_DENIED_CODE);
		expect((await paymentDetailsOf(invoiceId)).stripe_checkout_session_id).toBeNull();
	});

	it('is refused to the organiser too', async () => {
		const { organiser, invoiceId } = await raiseInvoiceOwedByNewPayer();

		const { error } = await organiser.supabase.rpc('set_invoice_checkout_session', {
			invoice_id: invoiceId,
			session_id: 'cs_test_the_organisers_session'
		});

		expect(error?.code).toBe(PERMISSION_DENIED_CODE);
	});

	it('leaves the server free to write the column itself', async () => {
		const { invoiceId } = await raiseInvoiceOwedByNewPayer();

		const { error } = await createServiceRoleClient()
			.from('invoices')
			.update({ stripe_checkout_session_id: 'cs_test_made_by_the_server' })
			.eq('id', invoiceId);

		expect(error).toBeNull();
		expect((await paymentDetailsOf(invoiceId)).stripe_checkout_session_id).toBe(
			'cs_test_made_by_the_server'
		);
	});
});
