import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSignedInClient, createVisitorClient } from './supabase-test-client';
import {
	addCommittee,
	addFee,
	addSeat,
	addStaff,
	createConferenceOwnedByMe,
	giveSeatTo
} from './conference-fixtures';

// The `fees` row of the policy matrix in specs/02-architecture/permissions.md:
// the five policies task T17 puts on the table, and the two checks the table
// carries itself. specs/06-features/fees.md has the rules in words.
//
// `invoices` has a file of its own. The only thing asked of that table here is
// one invoice pointing at one fee, because "has anybody been charged this?" is
// the question the fees delete policy asks.

// An early bird window. Only the order of the two bounds is ever the point
// below, so the dates themselves never matter; they sit in the same 2020 as the
// fixture conference to keep the file reading as one story.
const EARLY_BIRD_OPENS_AT = '2020-01-01T00:00:00Z';
const EARLY_BIRD_CLOSES_AT = '2020-02-01T00:00:00Z';

/**
 * Raises one invoice against a fee, the way an organiser adding a late delegate
 * by hand does: `next_invoice_number` for the number, then the "Organisers can
 * raise an invoice" insert policy for the row itself.
 *
 * The payer has to hold a seat in the conference, because `guard_invoice_insert`
 * refuses an invoice against anybody with no part in it (finding M10 of the
 * October security review). Who owes the money is otherwise never the point
 * here; the only thing this file needs is a row whose `fee_id` points at the
 * fee. The amounts are not sent either, beyond the unit price:
 * `compute_invoice_amount` works out the totals whatever a caller says.
 */
async function raiseInvoiceAgainstFee(
	organiser: SupabaseClient,
	conferenceId: string,
	payerUserId: string,
	feeId: string
): Promise<void> {
	const { data: invoiceNumber, error: numberError } = await organiser.rpc('next_invoice_number', {
		conference_id: conferenceId
	});

	if (numberError) {
		throw new Error(`Could not number the fixture invoice: ${numberError.message}`);
	}

	const { error } = await organiser.from('invoices').insert({
		conference_id: conferenceId,
		number: invoiceNumber,
		payer_user_id: payerUserId,
		fee_id: feeId,
		description: 'Delegate fee · Fixture Conference',
		quantity: 1,
		unit_amount_cents: 6500,
		currency: 'EUR'
	});

	if (error) {
		throw new Error(`Could not raise the fixture invoice: ${error.message}`);
	}
}

describe('fees, reading them as a visitor', () => {
	it('lets a visitor read the fees of a published conference', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const feeId = await addFee(supabase, conferenceId, 'Delegate fee', 6500);

		await supabase.from('conferences').update({ status: 'published' }).eq('id', conferenceId);

		const visitor = createVisitorClient();
		const { data, error } = await visitor.from('fees').select('name, amount_cents').eq('id', feeId);

		expect(error).toBeNull();
		expect(data).toEqual([{ name: 'Delegate fee', amount_cents: 6500 }]);
	});

	it('never shows a visitor the fees of a conference that is still a draft', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const feeId = await addFee(supabase, conferenceId, 'Unannounced delegate fee');

		const visitor = createVisitorClient();
		const { data } = await visitor.from('fees').select('name').eq('id', feeId);

		expect(data).toEqual([]);
	});
});

describe('fees, reading them as staff', () => {
	it('lets a volunteer read the fees of their conference while it is a draft', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const feeId = await addFee(supabase, conferenceId, 'Draft delegate fee');
		const volunteer = await createSignedInClient();

		await addStaff(supabase, conferenceId, volunteer.userId);

		const { data } = await volunteer.supabase.from('fees').select('name').eq('id', feeId);

		expect(data).toEqual([{ name: 'Draft delegate fee' }]);
	});

	it('shows nothing to a signed-in stranger, who is not staff of anything', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const feeId = await addFee(supabase, conferenceId, 'Draft delegate fee');
		const stranger = await createSignedInClient();

		const { data } = await stranger.supabase.from('fees').select('name').eq('id', feeId);

		expect(data).toEqual([]);
	});
});

describe('fees, adding one', () => {
	it('lets an organiser add a fee and read the new row back', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();

		// `.select()` after an insert is the "insert ... returning" a page uses to
		// get the new row. It only works if a select policy passes for that row.
		const { data, error } = await supabase
			.from('fees')
			.insert({ conference_id: conferenceId, name: 'Delegate fee', amount_cents: 6500 })
			.select('name, amount_cents, applies_to, position');

		expect(error).toBeNull();
		expect(data).toEqual([
			{ name: 'Delegate fee', amount_cents: 6500, applies_to: 'individual', position: 0 }
		]);
	});

	it('refuses a fee from somebody who has nothing to do with the conference', async () => {
		const { conferenceId } = await createConferenceOwnedByMe();
		const stranger = await createSignedInClient();

		const { error } = await stranger.supabase
			.from('fees')
			.insert({ conference_id: conferenceId, name: 'Gatecrasher fee', amount_cents: 100 });

		expect(error).not.toBeNull();
	});
});

describe('fees, changing one', () => {
	it('lets an organiser put the price up', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const feeId = await addFee(supabase, conferenceId, 'Delegate fee', 6500);

		const { data, error } = await supabase
			.from('fees')
			.update({ amount_cents: 7500 })
			.eq('id', feeId)
			.select('amount_cents');

		expect(error).toBeNull();
		expect(data).toEqual([{ amount_cents: 7500 }]);
	});

	it('refuses a change from somebody who has nothing to do with the conference', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const feeId = await addFee(supabase, conferenceId, 'Delegate fee', 6500);
		const stranger = await createSignedInClient();

		const { data } = await stranger.supabase
			.from('fees')
			.update({ amount_cents: 1 })
			.eq('id', feeId)
			.select('amount_cents');

		// A refused update is not an error: the policy hides the row, so nothing
		// matches and nothing changes.
		expect(data).toEqual([]);

		const { data: unchanged } = await supabase.from('fees').select('amount_cents').eq('id', feeId);
		expect(unchanged).toEqual([{ amount_cents: 6500 }]);
	});
});

describe('fees, deleting one', () => {
	it('lets an organiser delete a fee nobody has been charged', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const feeId = await addFee(supabase, conferenceId, 'Delegate fee');

		const { error } = await supabase.from('fees').delete().eq('id', feeId);

		expect(error).toBeNull();

		const { data } = await supabase.from('fees').select('id').eq('id', feeId);
		expect(data).toEqual([]);
	});

	it('refuses a signed-in stranger deleting a fee', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const feeId = await addFee(supabase, conferenceId, 'Delegate fee');
		const stranger = await createSignedInClient();

		// Nothing is refused out loud here either: the delete policy hides the
		// row from anybody who cannot manage the conference, so the statement
		// matches nothing at all.
		await stranger.supabase.from('fees').delete().eq('id', feeId);

		const { data } = await supabase.from('fees').select('id').eq('id', feeId);
		expect(data).toEqual([{ id: feeId }]);
	});

	it('refuses to delete a fee an invoice points at, even for the organiser', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const feeId = await addFee(supabase, conferenceId, 'Delegate fee');
		const committeeId = await addCommittee(supabase, conferenceId);
		const seatId = await addSeat(supabase, committeeId);
		const delegate = await createSignedInClient('Ana Silva');
		await giveSeatTo(supabase, seatId, delegate.userId);
		await raiseInvoiceAgainstFee(supabase, conferenceId, delegate.userId, feeId);

		// Nothing is refused out loud: the delete policy hides the row, so the
		// statement matches nothing and the fee is still there afterwards.
		await supabase.from('fees').delete().eq('id', feeId);

		const { data } = await supabase.from('fees').select('id').eq('id', feeId);
		expect(data).toEqual([{ id: feeId }]);
	});
});

describe('fees_amount_not_negative', () => {
	it('refuses a fee with a negative amount', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();

		const { error } = await supabase
			.from('fees')
			.insert({ conference_id: conferenceId, name: 'Refund fee', amount_cents: -100 });

		expect(error?.message).toContain('fees_amount_not_negative');
	});

	it('accepts a fee of nothing, which means charging this person nothing on purpose', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();

		const { data, error } = await supabase
			.from('fees')
			.insert({ conference_id: conferenceId, name: 'Scholarship delegate fee', amount_cents: 0 })
			.select('amount_cents');

		expect(error).toBeNull();
		expect(data).toEqual([{ amount_cents: 0 }]);
	});
});

describe('fees_valid_window', () => {
	it('refuses a window that ends before it starts', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();

		const { error } = await supabase.from('fees').insert({
			conference_id: conferenceId,
			name: 'Early bird delegate fee',
			amount_cents: 5500,
			valid_from: EARLY_BIRD_CLOSES_AT,
			valid_until: EARLY_BIRD_OPENS_AT
		});

		expect(error?.message).toContain('fees_valid_window');
	});

	it('accepts an early bird window that ends after it starts', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();

		const { data, error } = await supabase
			.from('fees')
			.insert({
				conference_id: conferenceId,
				name: 'Early bird delegate fee',
				amount_cents: 5500,
				valid_from: EARLY_BIRD_OPENS_AT,
				valid_until: EARLY_BIRD_CLOSES_AT
			})
			.select('name');

		expect(error).toBeNull();
		expect(data).toEqual([{ name: 'Early bird delegate fee' }]);
	});
});

describe('fees_set_updated_at, the trigger that stamps a change', () => {
	it('stamps the moment a fee was last changed, whatever the caller sent', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const feeId = await addFee(supabase, conferenceId, 'Delegate fee', 6500);

		const { data: before } = await supabase
			.from('fees')
			.select('updated_at')
			.eq('id', feeId)
			.single();

		// The backdated `updated_at` travels with a real change, so the trigger
		// has something to do and it is the trigger's value that wins, not the
		// organiser's. Without it "when was this price last touched?" would be a
		// question the person changing the price gets to answer.
		const { data: after } = await supabase
			.from('fees')
			.update({ amount_cents: 7500, updated_at: '2020-01-01T00:00:00Z' })
			.eq('id', feeId)
			.select('updated_at')
			.single();

		expect(new Date(after?.updated_at).getTime()).toBeGreaterThan(
			new Date(before?.updated_at).getTime()
		);
	});
});

describe('fees_protect_columns', () => {
	it('lets an organiser change the ordinary columns of a fee of their own conference', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const feeId = await addFee(supabase, conferenceId, 'Delegate fee', 6500);

		const { data, error } = await supabase
			.from('fees')
			.update({ name: 'Standard delegate fee', amount_cents: 7500 })
			.eq('id', feeId)
			.select('name, amount_cents');

		// The trigger only ever looks at `conference_id`, so every other column the
		// fees page can change saves as it always did.
		expect(error).toBeNull();
		expect(data).toEqual([{ name: 'Standard delegate fee', amount_cents: 7500 }]);
	});

	it("refuses to move a fee into the organiser's other conference", async () => {
		const { supabase, userId, organizationId, conferenceId } = await createConferenceOwnedByMe();
		const feeId = await addFee(supabase, conferenceId, 'Delegate fee');

		// The second conference goes in through the same client and the same
		// organisation, because the point of this test is an organiser who runs
		// both: with two conferences in two different hands the update policy would
		// turn the change away on its own and the trigger would never run.
		const { data: otherConference, error: otherConferenceError } = await supabase
			.from('conferences')
			.insert({
				name: 'Fixture Conference Two',
				slug: `fixture-conference-two-${crypto.randomUUID()}`,
				city: 'Utrecht',
				country_code: 'NL',
				start_date: '2020-03-01',
				end_date: '2020-03-03',
				organization_id: organizationId,
				created_by: userId
			})
			.select('id')
			.single();

		expect(otherConferenceError).toBeNull();

		const { error } = await supabase
			.from('fees')
			.update({ conference_id: otherConference?.id })
			.eq('id', feeId);

		// Carrying the fee across would leave every invoice already written against
		// it pointing at a fee of another conference, which is what the "12
		// invoices" count on the fees page and the delete policy both read.
		expect(error?.message).toContain('A fee cannot be moved to another conference');
	});
});
