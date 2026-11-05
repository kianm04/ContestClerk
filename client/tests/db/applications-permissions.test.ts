import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	createServiceRoleClient,
	createSignedInClient,
	type SignedInClient
} from './supabase-test-client';
import {
	addApplication,
	addCommittee,
	addDelegation,
	addFee,
	addRole,
	addSeat,
	createOpenConferenceOwnedByMe,
	giveRole,
	type ConferenceFixture
} from './conference-fixtures';

// Step 5 of docs/roles-and-permissions.md, from migration
// 20261007150000_applications_permissions: `read_applications` reads the
// applications, the delegations and their members; `decide_applications`
// decides them and moves people between seats, through the same security
// definer functions the organisers use; `edit_conference` writes the
// application questions.
//
// Every test makes its own conference, so that nothing one test decides is
// seen by another.

/** An open conference with one committee of two free seats. */
type OpenConference = ConferenceFixture & { committeeId: string; seatA: string; seatB: string };

async function createOpenConference(): Promise<OpenConference> {
	const fixture = await createOpenConferenceOwnedByMe();
	const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
	const seatA = await addSeat(fixture.supabase, committeeId, 'France', 'FR');
	const seatB = await addSeat(fixture.supabase, committeeId, 'Kenya', 'KE');

	return { ...fixture, committeeId, seatA, seatB };
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

/** A submitted application from a new applicant, who asked for the conference's committee. */
async function submittedApplication(conference: OpenConference): Promise<string> {
	const applicant = await createSignedInClient('Applicant');

	return addApplication(applicant.supabase, conference.conferenceId, {
		committeePreferences: [conference.committeeId]
	});
}

/** The status of an application, read past every policy. */
async function statusOf(applicationId: string): Promise<string | undefined> {
	const { data } = await createServiceRoleClient()
		.from('applications')
		.select('status')
		.eq('id', applicationId)
		.single();

	return data?.status;
}

/** Who sits in a seat, read past every policy. */
async function holderOf(seatId: string): Promise<string | null | undefined> {
	const { data } = await createServiceRoleClient()
		.from('seats')
		.select('user_id')
		.eq('id', seatId)
		.single();

	return data?.user_id;
}

/** Accept an application into a seat as this person, failing the test if it is refused. */
async function accept(supabase: SupabaseClient, applicationId: string, seatId: string) {
	const { error } = await supabase.rpc('accept_application', {
		application_id: applicationId,
		seat_id: seatId
	});

	expect(error).toBeNull();
}

describe('read_applications', () => {
	it('reads the applications, the delegations and their members', async () => {
		const conference = await createOpenConference();
		const applicationId = await submittedApplication(conference);
		const head = await createSignedInClient('Delegation Head');
		const delegationId = await addDelegation(head.supabase, conference.conferenceId);
		const reader = await teamMemberWith(conference, ['read_applications']);

		const applications = await reader.supabase
			.from('applications')
			.select('id')
			.eq('id', applicationId);
		const delegations = await reader.supabase
			.from('delegations')
			.select('id')
			.eq('id', delegationId);
		const members = await reader.supabase
			.from('delegation_members')
			.select('user_id')
			.eq('delegation_id', delegationId);

		expect(applications.data).toEqual([{ id: applicationId }]);
		expect(delegations.data).toEqual([{ id: delegationId }]);
		expect(members.data).toEqual([{ user_id: head.userId }]);
	});

	it('cannot decide an application, directly or through accept_application', async () => {
		const conference = await createOpenConference();
		const applicationId = await submittedApplication(conference);
		const reader = await teamMemberWith(conference, ['read_applications']);

		await reader.supabase
			.from('applications')
			.update({ status: 'rejected' })
			.eq('id', applicationId);
		const { error } = await reader.supabase.rpc('accept_application', {
			application_id: applicationId,
			seat_id: conference.seatA
		});

		expect(await statusOf(applicationId)).toBe('submitted');
		expect(error?.message).toContain('Only the organisers');
	});

	it('is not given by a role without it', async () => {
		const conference = await createOpenConference();
		const applicationId = await submittedApplication(conference);
		const volunteer = await teamMemberWith(conference, ['read_participants']);

		const { data } = await volunteer.supabase
			.from('applications')
			.select('id')
			.eq('id', applicationId);

		expect(data).toEqual([]);
	});
});

describe('decide_applications', () => {
	it('decides an application directly, as the waitlist and reject buttons do', async () => {
		const conference = await createOpenConference();
		const applicationId = await submittedApplication(conference);
		const decider = await teamMemberWith(conference, ['read_applications', 'decide_applications']);

		const { error } = await decider.supabase
			.from('applications')
			.update({ status: 'waitlisted' })
			.eq('id', applicationId);

		expect(error).toBeNull();
		expect(await statusOf(applicationId)).toBe('waitlisted');
	});

	it('accepts into a seat, numbering the invoice next_invoice_number writes', async () => {
		const conference = await createOpenConference();
		await addFee(conference.supabase, conference.conferenceId);
		const applicationId = await submittedApplication(conference);
		const decider = await teamMemberWith(conference, ['read_applications', 'decide_applications']);

		await accept(decider.supabase, applicationId, conference.seatA);

		const { data: invoices } = await createServiceRoleClient()
			.from('invoices')
			.select('number')
			.eq('seat_id', conference.seatA);

		expect(await statusOf(applicationId)).toBe('accepted');
		expect(invoices).toHaveLength(1);
		expect(invoices?.[0].number).toMatch(/\d/);
	});

	it('moves, swaps and revokes through move_delegate, swap_delegates and revoke_seat', async () => {
		const conference = await createOpenConference();
		const seatC = await addSeat(conference.supabase, conference.committeeId, 'Chile', 'CL');
		const first = await submittedApplication(conference);
		const second = await submittedApplication(conference);
		const decider = await teamMemberWith(conference, ['read_applications', 'decide_applications']);

		await accept(decider.supabase, first, conference.seatA);
		await accept(decider.supabase, second, conference.seatB);
		const firstHolder = await holderOf(conference.seatA);
		const secondHolder = await holderOf(conference.seatB);

		const moved = await decider.supabase.rpc('move_delegate', {
			from_seat_id: conference.seatA,
			to_seat_id: seatC
		});
		const swapped = await decider.supabase.rpc('swap_delegates', {
			first_seat_id: seatC,
			second_seat_id: conference.seatB
		});
		const revoked = await decider.supabase.rpc('revoke_seat', { seat_id: seatC });

		expect([moved.error, swapped.error, revoked.error]).toEqual([null, null, null]);
		expect(await holderOf(conference.seatB)).toBe(firstHolder);
		expect(await holderOf(seatC)).toBeNull();
		expect(secondHolder).not.toBeNull();
	});

	it('reserves and frees a delegation seat through allocate_delegation_seats', async () => {
		const conference = await createOpenConference();
		const head = await createSignedInClient('Delegation Head');
		const delegationId = await addDelegation(head.supabase, conference.conferenceId);
		const decider = await teamMemberWith(conference, ['read_applications', 'decide_applications']);

		const allocated = await decider.supabase.rpc('allocate_delegation_seats', {
			delegation_id: delegationId,
			seat_ids: [conference.seatA]
		});
		const removed = await decider.supabase.rpc('remove_delegation_seat', {
			seat_id: conference.seatA
		});

		expect(allocated.error).toBeNull();
		expect(removed.error).toBeNull();
	});

	it('is refused the allocation functions without it', async () => {
		const conference = await createOpenConference();
		const head = await createSignedInClient('Delegation Head');
		const delegationId = await addDelegation(head.supabase, conference.conferenceId);
		const reader = await teamMemberWith(conference, ['read_applications']);

		const { error } = await reader.supabase.rpc('allocate_delegation_seats', {
			delegation_id: delegationId,
			seat_ids: [conference.seatA]
		});

		expect(error?.message).toContain('Only the organisers');
	});
});

describe('set_seat_availability', () => {
	it('lets a decider hide a seat and offer it again', async () => {
		const conference = await createOpenConference();
		const decider = await teamMemberWith(conference, ['read_applications', 'decide_applications']);

		const hidden = await decider.supabase.rpc('set_seat_availability', {
			seat_id: conference.seatA,
			is_available: false
		});
		const { data: afterHiding } = await createServiceRoleClient()
			.from('seats')
			.select('is_available')
			.eq('id', conference.seatA)
			.single();
		const offered = await decider.supabase.rpc('set_seat_availability', {
			seat_id: conference.seatA,
			is_available: true
		});

		expect(hidden.error).toBeNull();
		expect(afterHiding?.is_available).toBe(false);
		expect(offered.error).toBeNull();
	});

	it('refuses a reader who may not decide, and a seat that does not exist', async () => {
		const conference = await createOpenConference();
		const reader = await teamMemberWith(conference, ['read_applications']);

		const refused = await reader.supabase.rpc('set_seat_availability', {
			seat_id: conference.seatA,
			is_available: false
		});
		const missing = await conference.supabase.rpc('set_seat_availability', {
			seat_id: crypto.randomUUID(),
			is_available: false
		});

		expect(refused.error?.message).toContain('Only the organisers');
		expect(missing.error?.message).toContain('That seat does not exist');
	});

	it('does not let a decider rename the seat directly', async () => {
		const conference = await createOpenConference();
		const decider = await teamMemberWith(conference, ['read_applications', 'decide_applications']);

		await decider.supabase.from('seats').update({ name: 'Renamed' }).eq('id', conference.seatA);
		const { data } = await createServiceRoleClient()
			.from('seats')
			.select('name')
			.eq('id', conference.seatA)
			.single();

		expect(data?.name).toBe('France');
	});
});

describe('next_invoice_number', () => {
	it('answers a decider and refuses a reader', async () => {
		const conference = await createOpenConference();
		const decider = await teamMemberWith(conference, ['read_applications', 'decide_applications']);
		const reader = await teamMemberWith(conference, ['read_applications']);

		const forDecider = await decider.supabase.rpc('next_invoice_number', {
			conference_id: conference.conferenceId
		});
		const forReader = await reader.supabase.rpc('next_invoice_number', {
			conference_id: conference.conferenceId
		});

		expect(forDecider.error).toBeNull();
		expect(forReader.error).not.toBeNull();
	});
});

describe('application questions', () => {
	it('are written by edit_conference and not by decide_applications', async () => {
		const conference = await createOpenConference();
		const editor = await teamMemberWith(conference, ['edit_conference']);
		const decider = await teamMemberWith(conference, ['read_applications', 'decide_applications']);

		const byEditor = await editor.supabase.from('application_questions').insert({
			conference_id: conference.conferenceId,
			label: 'Have you chaired before?',
			type: 'short_text'
		});
		const byDecider = await decider.supabase.from('application_questions').insert({
			conference_id: conference.conferenceId,
			label: 'Which year are you in?',
			type: 'short_text'
		});

		expect(byEditor.error).toBeNull();
		expect(byDecider.error).not.toBeNull();
	});
});
