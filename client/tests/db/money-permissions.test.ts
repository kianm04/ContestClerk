import { describe, expect, it } from 'vitest';
import {
	createServiceRoleClient,
	createSignedInClient,
	type SignedInClient
} from './supabase-test-client';
import {
	addApplication,
	addCommittee,
	addFee,
	addRole,
	addSeat,
	createOpenConferenceOwnedByMe,
	giveRole,
	type ConferenceFixture
} from './conference-fixtures';

// Step 6 of docs/roles-and-permissions.md, from migration
// 20261007160000_money_permissions: `read_invoices` reads the invoices,
// `manage_invoices` settles them, and `edit_conference` writes the fee list
// and the conference row. The three counting functions answer an editor who
// may not read the invoices how many there are, and nothing more.
//
// Every test makes its own conference, so that nothing one test settles is
// seen by another.

/** An open conference with a delegate fee and one invoice for it, raised by accepting Anna. */
type ChargedConference = ConferenceFixture & { feeId: string; invoiceId: string };

async function createChargedConference(): Promise<ChargedConference> {
	const fixture = await createOpenConferenceOwnedByMe();
	const feeId = await addFee(fixture.supabase, fixture.conferenceId);
	const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
	const seatId = await addSeat(fixture.supabase, committeeId, 'France', 'FR');
	const applicant = await createSignedInClient('Anna Applicant');
	const applicationId = await addApplication(applicant.supabase, fixture.conferenceId, {
		committeePreferences: [committeeId]
	});

	const { error } = await fixture.supabase.rpc('accept_application', {
		application_id: applicationId,
		seat_id: seatId
	});

	if (error) {
		throw new Error(`Could not accept the fixture application: ${error.message}`);
	}

	const { data: invoice } = await createServiceRoleClient()
		.from('invoices')
		.select('id')
		.eq('seat_id', seatId)
		.single();

	if (!invoice) {
		throw new Error('Accepting the fixture application raised no invoice');
	}

	return { ...fixture, feeId, invoiceId: invoice.id };
}

/** A new team member holding one conference-wide role with these permissions. */
async function teamMemberWith(
	conference: ConferenceFixture,
	permissions: string[]
): Promise<SignedInClient> {
	const person = await createSignedInClient('Team Member');
	const roleId = await addRole(conference.supabase, conference.conferenceId, {
		name: `Role ${crypto.randomUUID().slice(0, 8)}`,
		permissions
	});

	await giveRole(conference.supabase, conference.conferenceId, person.userId, roleId);

	return person;
}

/** The status of an invoice, read past every policy. */
async function invoiceStatus(invoiceId: string): Promise<string | undefined> {
	const { data } = await createServiceRoleClient()
		.from('invoices')
		.select('status')
		.eq('id', invoiceId)
		.single();

	return data?.status;
}

describe('read_invoices', () => {
	it('reads the invoices and may not settle them', async () => {
		const conference = await createChargedConference();
		const reader = await teamMemberWith(conference, ['read_invoices']);

		const { data } = await reader.supabase
			.from('invoices')
			.select('id')
			.eq('id', conference.invoiceId);
		await reader.supabase
			.from('invoices')
			.update({ status: 'paid', paid_at: new Date().toISOString(), paid_method: 'manual' })
			.eq('id', conference.invoiceId);

		expect(data).toEqual([{ id: conference.invoiceId }]);
		expect(await invoiceStatus(conference.invoiceId)).toBe('unpaid');
	});

	it('is not given by edit_conference', async () => {
		const conference = await createChargedConference();
		const editor = await teamMemberWith(conference, ['edit_conference']);

		const { data } = await editor.supabase
			.from('invoices')
			.select('id')
			.eq('conference_id', conference.conferenceId);

		expect(data).toEqual([]);
	});
});

describe('manage_invoices', () => {
	it('settles an invoice', async () => {
		const conference = await createChargedConference();
		const manager = await teamMemberWith(conference, ['read_invoices', 'manage_invoices']);

		const { error } = await manager.supabase
			.from('invoices')
			.update({ status: 'paid', paid_at: new Date().toISOString(), paid_method: 'manual' })
			.eq('id', conference.invoiceId);

		expect(error).toBeNull();
		expect(await invoiceStatus(conference.invoiceId)).toBe('paid');
	});

	it('numbers an invoice through next_invoice_number', async () => {
		const conference = await createChargedConference();
		const manager = await teamMemberWith(conference, ['read_invoices', 'manage_invoices']);
		const reader = await teamMemberWith(conference, ['read_invoices']);

		const forManager = await manager.supabase.rpc('next_invoice_number', {
			conference_id: conference.conferenceId
		});
		const forReader = await reader.supabase.rpc('next_invoice_number', {
			conference_id: conference.conferenceId
		});

		expect(forManager.data).toMatch(/-0002$/);
		expect(forReader.error?.message).toContain('Only the organisers');
	});
});

describe('edit_conference and the fee list', () => {
	it('adds and changes a fee, which an invoice manager may not', async () => {
		const conference = await createChargedConference();
		const editor = await teamMemberWith(conference, ['edit_conference']);
		const manager = await teamMemberWith(conference, ['read_invoices', 'manage_invoices']);

		const byEditor = await editor.supabase.from('fees').insert({
			conference_id: conference.conferenceId,
			name: 'Late fee',
			amount_cents: 8000,
			applies_to: 'individual',
			position: 1
		});
		const byManager = await manager.supabase.from('fees').insert({
			conference_id: conference.conferenceId,
			name: 'Another fee',
			amount_cents: 9000,
			applies_to: 'individual',
			position: 2
		});

		expect(byEditor.error).toBeNull();
		expect(byManager.error).not.toBeNull();
	});

	it('cannot delete a fee somebody has been charged, though it cannot read the invoice', async () => {
		const conference = await createChargedConference();
		const editor = await teamMemberWith(conference, ['edit_conference']);

		const { data: answer } = await editor.supabase.rpc('fee_has_invoices', {
			fee_id: conference.feeId
		});
		await editor.supabase.from('fees').delete().eq('id', conference.feeId);
		const { data: fee } = await createServiceRoleClient()
			.from('fees')
			.select('id')
			.eq('id', conference.feeId);

		expect(answer).toBe(true);
		expect(fee).toEqual([{ id: conference.feeId }]);
	});

	it('deletes a fee nobody has been charged', async () => {
		const conference = await createChargedConference();
		const unusedFeeId = await addFee(conference.supabase, conference.conferenceId, 'Unused', 100, {
			position: 3
		});
		const editor = await teamMemberWith(conference, ['edit_conference']);

		await editor.supabase.from('fees').delete().eq('id', unusedFeeId);
		const { data } = await createServiceRoleClient()
			.from('fees')
			.select('id')
			.eq('id', unusedFeeId);

		expect(data).toEqual([]);
	});

	it('counts the invoices of each fee with fee_invoice_counts, for the team only', async () => {
		const conference = await createChargedConference();
		const editor = await teamMemberWith(conference, ['edit_conference']);
		const stranger = await createSignedInClient('Stranger');

		const forEditor = await editor.supabase.rpc('fee_invoice_counts', {
			conference_id: conference.conferenceId
		});
		const forStranger = await stranger.supabase.rpc('fee_invoice_counts', {
			conference_id: conference.conferenceId
		});

		expect(forEditor.data).toEqual([{ fee_id: conference.feeId, invoice_count: 1 }]);
		expect(forStranger.data).toEqual([]);
	});

	it('tells the team whether the conference has invoices with conference_has_invoices', async () => {
		const conference = await createChargedConference();
		const editor = await teamMemberWith(conference, ['edit_conference']);
		const stranger = await createSignedInClient('Stranger');

		const forEditor = await editor.supabase.rpc('conference_has_invoices', {
			conference_id: conference.conferenceId
		});
		const forStranger = await stranger.supabase.rpc('conference_has_invoices', {
			conference_id: conference.conferenceId
		});

		expect(forEditor.data).toBe(true);
		expect(forStranger.data).toBe(false);
	});
});

describe('edit_conference and the conference row', () => {
	it('lets an editor change the details, and not a reader of invoices', async () => {
		const conference = await createChargedConference();
		const editor = await teamMemberWith(conference, ['edit_conference']);
		const reader = await teamMemberWith(conference, ['read_invoices']);

		await reader.supabase
			.from('conferences')
			.update({ tagline: 'Written by the reader' })
			.eq('id', conference.conferenceId);
		const afterReader = await createServiceRoleClient()
			.from('conferences')
			.select('tagline')
			.eq('id', conference.conferenceId)
			.single();
		const byEditor = await editor.supabase
			.from('conferences')
			.update({ tagline: 'Written by the editor' })
			.eq('id', conference.conferenceId)
			.select('tagline');

		expect(afterReader.data?.tagline).not.toBe('Written by the reader');
		expect(byEditor.data).toEqual([{ tagline: 'Written by the editor' }]);
	});
});
