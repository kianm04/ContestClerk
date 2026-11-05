import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
	createServiceRoleClient,
	createSignedInClient,
	createVisitorClient
} from './supabase-test-client';
import {
	addApplication,
	addCommittee,
	addDelegation,
	addSeat,
	createConferenceOwnedByMe,
	createOpenConferenceOwnedByMe,
	whileTheConferenceIsJoinable
} from './conference-fixtures';

// The `delegations` and `delegation_members` rows of the policy matrix in
// specs/02-architecture/permissions.md, the functions `create_delegation`,
// `preview_delegation` and `join_delegation`, the triggers
// `delegations_guard_update` (function `guard_delegation_update`),
// `delegation_members_keep_a_head` (function
// `prevent_last_delegation_head_removal`) and
// `delegation_members_check_one_route` (function
// `check_one_route_per_conference`, shared with `applications`), and the two
// permission helpers `is_delegation_head` and `is_delegation_member`.
// `delegations_set_updated_at` is the same `set_updated_at` trigger every other
// table with an `updated_at` column already carries, so it is not tested here
// on its own. `delegations_guard_insert` (function `guard_delegation_insert`)
// is not tested either: since migration 20261022140000 dropped the direct
// insert policy, no browser request reaches it.

/** Reads a delegation's join code back, through a client that is allowed to see it. */
async function joinCodeOf(supabase: SupabaseClient, delegationId: string): Promise<string> {
	const { data, error } = await supabase
		.from('delegations')
		.select('join_code')
		.eq('id', delegationId)
		.single();

	if (error || !data) {
		throw new Error(`Could not read the join code: ${error?.message}`);
	}

	return data.join_code;
}

describe('create_delegation', () => {
	it('writes the delegation and makes the caller its head, in one call', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { conferenceId } = conference;
		const head = await createSignedInClient();

		const delegationId = await addDelegation(head.supabase, conferenceId, 'Lycee Francais');

		const { data } = await head.supabase
			.from('delegation_members')
			.select('user_id, role')
			.eq('delegation_id', delegationId);

		expect(data).toEqual([{ user_id: head.userId, role: 'head' }]);
	});

	it('mints a ten character join code without 0, O, 1 or I, and a different one every time', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { conferenceId } = conference;
		const first = await createSignedInClient();
		const second = await createSignedInClient();

		const firstId = await addDelegation(first.supabase, conferenceId, 'First group');
		const secondId = await addDelegation(second.supabase, conferenceId, 'Second group');

		const firstCode = await joinCodeOf(first.supabase, firstId);
		const secondCode = await joinCodeOf(second.supabase, secondId);

		// Ten characters from gen_random_bytes since migration 20261022140000
		// (security review L24); security-applications-windows.test.ts has the
		// alphabet test as well.
		expect(firstCode).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/);
		expect(secondCode).not.toBe(firstCode);
	});

	it('refuses a delegation at a conference that is still a draft', async () => {
		const { conferenceId } = await createConferenceOwnedByMe();
		const head = await createSignedInClient();

		const { error } = await head.supabase.rpc('create_delegation', {
			conference_id: conferenceId,
			name: 'Lycee Francais',
			institution_name: 'Lycee Francais',
			country_code: 'FR',
			requested_seats: 4,
			note: null
		});

		expect(error).not.toBeNull();
	});

	it('refuses a delegation when the conference does not accept them', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { supabase, conferenceId } = conference;
		await supabase
			.from('conferences')
			.update({ accepts_delegations: false })
			.eq('id', conferenceId);
		const head = await createSignedInClient();

		const { error } = await head.supabase.rpc('create_delegation', {
			conference_id: conferenceId,
			name: 'Lycee Francais',
			institution_name: 'Lycee Francais',
			country_code: 'FR',
			requested_seats: 4,
			note: null
		});

		expect(error?.message).toContain('does not take delegations');
	});

	it('refuses a delegation once the application window has closed', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { supabase, conferenceId } = conference;
		await supabase
			.from('conferences')
			.update({ applications_close_at: new Date(Date.now() - 86_400_000).toISOString() })
			.eq('id', conferenceId);
		const head = await createSignedInClient();

		const { error } = await head.supabase.rpc('create_delegation', {
			conference_id: conferenceId,
			name: 'Lycee Francais',
			institution_name: 'Lycee Francais',
			country_code: 'FR',
			requested_seats: 4,
			note: null
		});

		expect(error?.message).toContain('closed');
	});

	it('refuses somebody who already has an application for the conference', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { conferenceId } = conference;
		const applicant = await createSignedInClient();
		// A draft still counts: create_delegation asks "does a row exist?", not
		// "was it submitted?".
		await addApplication(applicant.supabase, conferenceId, { status: 'draft' });

		const { error } = await applicant.supabase.rpc('create_delegation', {
			conference_id: conferenceId,
			name: 'Lycee Francais',
			institution_name: 'Lycee Francais',
			country_code: 'FR',
			requested_seats: 4,
			note: null
		});

		expect(error?.message).toContain('already have an application');
	});

	it('refuses somebody who is already part of a delegation for the conference', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { conferenceId } = conference;
		const head = await createSignedInClient();
		await addDelegation(head.supabase, conferenceId, 'First group');

		const { error } = await head.supabase.rpc('create_delegation', {
			conference_id: conferenceId,
			name: 'Second group',
			institution_name: 'Second School',
			country_code: 'NL',
			requested_seats: 2,
			note: null
		});

		expect(error?.message).toContain('already part of a delegation');
	});
});

describe('preview_delegation', () => {
	it('shows a signed-in stranger the delegation, the conference and the heads, and nothing else', async () => {
		const { conferenceId, conferenceSlug } = await createOpenConferenceOwnedByMe();
		const head = await createSignedInClient('Amelie Dubois');
		const delegationId = await addDelegation(
			head.supabase,
			conferenceId,
			'Lycee Francais Delegation'
		);
		const joinCode = await joinCodeOf(head.supabase, delegationId);
		const stranger = await createSignedInClient();

		const { data, error } = await stranger.supabase.rpc('preview_delegation', { code: joinCode });

		expect(error).toBeNull();
		/*
			The `conference_` columns after the slug are what migrations
			20260920140000 and 20260920190000 added: the join card prints the dates
			and the city, and `canJoinDelegation` in `src/lib/delegations.ts` needs
			the end date and the status to say "{conference} has already taken
			place." The dates and the city are the ones `conference-fixtures.ts`
			gives every fixture conference.

			This is an exact object on purpose. The criterion of
			`05-pages/delegation/join.md` is that the preview shows its list "and
			nothing else", so a column quietly added here has to fail this test.
		*/
		expect(data).toEqual([
			{
				id: delegationId,
				name: 'Lycee Francais Delegation',
				institution_name: 'Fixture School',
				country_code: 'NL',
				status: 'draft',
				conference_name: 'Fixture Conference',
				conference_slug: conferenceSlug,
				conference_status: 'published',
				conference_start_date: '2020-03-01',
				conference_end_date: '2020-03-03',
				conference_city: 'Utrecht',
				conference_country_code: 'NL',
				head_names: ['Amelie Dubois'],
				member_count: 1
			}
		]);
	});

	it('reads the conference facts off the conference and not off the delegation', async () => {
		// The fixture delegation and the fixture conference are both in NL, so a
		// preview that quietly answered with the delegation's own country would look
		// right in the test above. Moving the conference tells the two apart.
		const conference = await createOpenConferenceOwnedByMe();
		const { supabase, conferenceId } = conference;
		await supabase
			.from('conferences')
			.update({ city: 'The Hague', country_code: 'FR' })
			.eq('id', conferenceId);
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, conferenceId);
		const joinCode = await joinCodeOf(head.supabase, delegationId);
		const stranger = await createSignedInClient();

		const { data } = await stranger.supabase.rpc('preview_delegation', { code: joinCode });

		expect(data?.[0]).toMatchObject({
			country_code: 'NL',
			conference_city: 'The Hague',
			conference_country_code: 'FR'
		});
	});

	it('gives no rows for a code that belongs to nobody', async () => {
		const stranger = await createSignedInClient();

		const { data } = await stranger.supabase.rpc('preview_delegation', { code: 'ZZZZZZZZ' });

		expect(data).toEqual([]);
	});

	it('refuses a signed-out visitor', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { conferenceId } = conference;
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, conferenceId);
		const joinCode = await joinCodeOf(head.supabase, delegationId);

		const visitor = createVisitorClient();
		const { error } = await visitor.rpc('preview_delegation', { code: joinCode });

		expect(error).not.toBeNull();
	});
});

describe('join_delegation', () => {
	it('adds the caller as a member and returns the delegation id', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { conferenceId } = conference;
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, conferenceId);
		const joinCode = await joinCodeOf(head.supabase, delegationId);
		const member = await createSignedInClient();

		const { data, error } = await whileTheConferenceIsJoinable(conference, () =>
			member.supabase.rpc('join_delegation', { code: joinCode })
		);

		expect(error).toBeNull();
		expect(data).toBe(delegationId);

		const { data: membership } = await member.supabase
			.from('delegation_members')
			.select('role')
			.eq('delegation_id', delegationId)
			.eq('user_id', member.userId);

		expect(membership).toEqual([{ role: 'member' }]);
	});

	it('answers null for a code that does not belong to a delegation', async () => {
		const stranger = await createSignedInClient();

		// Null rather than an exception since migration 20261022161000, so the
		// wrong code it writes down is kept (security-delegation-join-codes.test.ts).
		const { data, error } = await stranger.supabase.rpc('join_delegation', { code: 'ZZZZZZZZ' });

		expect(error).toBeNull();
		expect(data).toBeNull();
	});

	it('refuses a delegation the head withdrew', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { conferenceId } = conference;
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, conferenceId);
		const joinCode = await joinCodeOf(head.supabase, delegationId);
		await head.supabase.from('delegations').update({ status: 'withdrawn' }).eq('id', delegationId);
		const stranger = await createSignedInClient();

		const { error } = await stranger.supabase.rpc('join_delegation', { code: joinCode });

		// Its own message, not one shared with `rejected`: `join.md`'s refusal
		// table gives the two statuses a sentence each, and the server can only
		// tell them apart by what was raised.
		expect(error?.message).toContain('withdrew its request');
	});

	it('refuses a delegation the organiser rejected', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { supabase, conferenceId } = conference;
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, conferenceId);
		const joinCode = await joinCodeOf(head.supabase, delegationId);
		// The organisers decide only what was sent to them.
		await head.supabase.from('delegations').update({ status: 'submitted' }).eq('id', delegationId);
		await supabase.from('delegations').update({ status: 'rejected' }).eq('id', delegationId);
		const stranger = await createSignedInClient();

		const { error } = await stranger.supabase.rpc('join_delegation', { code: joinCode });

		expect(error?.message).toContain('was not accepted');
	});

	/*
		The "conference archived or ended" row of `05-pages/delegation/join.md`'s
		refusal table. Its criterion asks for every row to be "enforced by the
		database function, not only the page", and these are the two halves of
		that row: a conference an organiser has put away, and one whose last day
		has passed.
	*/
	it('refuses a delegation at a conference the organiser archived', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { supabase, conferenceId } = conference;
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, conferenceId);
		const joinCode = await joinCodeOf(head.supabase, delegationId);
		await supabase.from('conferences').update({ status: 'archived' }).eq('id', conferenceId);
		const stranger = await createSignedInClient();

		const { error } = await stranger.supabase.rpc('join_delegation', { code: joinCode });

		expect(error?.message).toContain('has already taken place');
	});

	it('refuses a delegation at a conference that has already ended', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { supabase, conferenceId } = conference;
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, conferenceId);
		const joinCode = await joinCodeOf(head.supabase, delegationId);
		await supabase
			.from('conferences')
			.update({ start_date: '2020-05-03', end_date: '2020-05-05' })
			.eq('id', conferenceId);
		const stranger = await createSignedInClient();

		const { error } = await stranger.supabase.rpc('join_delegation', { code: joinCode });

		expect(error?.message).toContain('has already taken place');
	});

	// The boundary the check is written around: `end_date` is a day and not a
	// moment, so the conference is over the day *after* its last one. A member
	// joining on the closing day is still let in.
	it('lets somebody join on the last day of the conference itself', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { supabase, conferenceId } = conference;
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, conferenceId);
		const joinCode = await joinCodeOf(head.supabase, delegationId);
		const today = new Date().toISOString().slice(0, 10);
		const stranger = await createSignedInClient();

		// The dates are set by hand rather than through
		// `whileTheConferenceIsJoinable`, because the whole point of this test is
		// the boundary the helper would move past. They are put back afterwards for
		// the helper's own reason: a published conference that has not finished is
		// one the `/conferences` directory lists, and the browser tests count what
		// is on that page.
		await supabase.from('conferences').update({ end_date: today }).eq('id', conferenceId);

		const { data, error } = await stranger.supabase.rpc('join_delegation', { code: joinCode });

		await supabase.from('conferences').update({ end_date: '2020-03-03' }).eq('id', conferenceId);

		expect(error).toBeNull();
		expect(data).toBe(delegationId);
	});

	it('refuses somebody who is already in the delegation', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { conferenceId } = conference;
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, conferenceId);
		const joinCode = await joinCodeOf(head.supabase, delegationId);

		const { error } = await head.supabase.rpc('join_delegation', { code: joinCode });

		expect(error?.message).toContain('already in this delegation');
	});

	it('refuses somebody who already has an application for the conference', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { conferenceId } = conference;
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, conferenceId);
		const joinCode = await joinCodeOf(head.supabase, delegationId);
		const applicant = await createSignedInClient();
		await addApplication(applicant.supabase, conferenceId, { status: 'draft' });

		// The `delegation_members_check_one_route` trigger is what raises this,
		// not `join_delegation` itself: it fires on the insert the function makes.
		const { error } = await whileTheConferenceIsJoinable(conference, () =>
			applicant.supabase.rpc('join_delegation', { code: joinCode })
		);

		expect(error?.message).toContain('already have an application');
	});
});

describe('delegations, reading the table', () => {
	it('lets a member read their own delegation', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { conferenceId } = conference;
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, conferenceId, 'Lycee Francais');

		const { data } = await head.supabase.from('delegations').select('name').eq('id', delegationId);

		expect(data).toEqual([{ name: 'Lycee Francais' }]);
	});

	it('lets the organiser read every delegation at their conference', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { supabase, conferenceId } = conference;
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, conferenceId, 'Lycee Francais');

		const { data } = await supabase.from('delegations').select('name').eq('id', delegationId);

		expect(data).toEqual([{ name: 'Lycee Francais' }]);
	});

	it('shows a stranger nothing', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { conferenceId } = conference;
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, conferenceId);
		const stranger = await createSignedInClient();

		const { data } = await stranger.supabase
			.from('delegations')
			.select('name')
			.eq('id', delegationId);

		expect(data).toEqual([]);
	});
});

describe('delegations, there is no insert policy', () => {
	// Every other test in this file reaches the table through `create_delegation`,
	// which is security definer and writes the row as its owner. Migration
	// 20261022140000 (security review L23) dropped the policy that let a browser
	// insert one directly, with no head and a join code of its own choosing, so
	// the function is the only door. `guard_delegation_insert` is still on the
	// table, but a browser request is refused before it runs; the rest of that
	// migration's tests are in security-applications-windows.test.ts.
	it('refuses a signed-in person inserting a delegation at an open conference', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const head = await createSignedInClient();

		for (const status of ['draft', 'submitted'] as const) {
			const { error } = await head.supabase.from('delegations').insert({
				conference_id: organiser.conferenceId,
				name: 'Lycee Francais Delegation',
				institution_name: 'Lycee Francais',
				requested_seats: 4,
				status,
				join_code: 'NODOORHERE'
			});

			expect(error?.message).toContain('row-level security');
		}
	});
});

describe('guard_delegation_update, the delegations_guard_update trigger', () => {
	it('lets a head rewrite their own description and submit, filling submitted_at on the way', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { conferenceId } = conference;
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, conferenceId);

		const { data: draftRow } = await head.supabase
			.from('delegations')
			.select('submitted_at')
			.eq('id', delegationId)
			.single();
		expect(draftRow?.submitted_at).toBeNull();

		const { data, error } = await head.supabase
			.from('delegations')
			.update({
				name: 'Renamed Delegation',
				institution_name: 'Renamed School',
				country_code: 'BE',
				requested_seats: 6,
				note: 'Please seat us together',
				status: 'submitted'
			})
			.eq('id', delegationId)
			.select('name, institution_name, country_code, requested_seats, note, status, submitted_at');

		expect(error).toBeNull();
		expect(data?.[0]).toMatchObject({
			name: 'Renamed Delegation',
			institution_name: 'Renamed School',
			country_code: 'BE',
			requested_seats: 6,
			note: 'Please seat us together',
			status: 'submitted'
		});
		// `submitted_at` is written by the trigger, not sent by the caller, so its
		// only job here is to prove the trigger ran.
		expect(data?.[0]?.submitted_at).not.toBeNull();
	});

	it('clears submitted_at when a head takes their delegation back to a draft', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { conferenceId } = conference;
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, conferenceId);

		await head.supabase.from('delegations').update({ status: 'submitted' }).eq('id', delegationId);

		const { data } = await head.supabase
			.from('delegations')
			.update({ status: 'draft' })
			.eq('id', delegationId)
			.select('status, submitted_at');

		// Without this the row would go back to being a draft while still saying
		// it was submitted at a moment that has passed, and the organiser's table
		// is sorted by that column.
		expect(data?.[0]).toEqual({ status: 'draft', submitted_at: null });
	});

	it('refuses a head who tries to write a decision column', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { conferenceId } = conference;
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, conferenceId);

		const { error } = await head.supabase
			.from('delegations')
			.update({ decision_note: 'Looks great' })
			.eq('id', delegationId);

		expect(error?.message).toContain('Only the organisers decide');
	});

	it('refuses a head who backdates when they submitted', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { conferenceId } = conference;
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, conferenceId);

		const { error } = await head.supabase
			.from('delegations')
			.update({ submitted_at: '2020-01-01T00:00:00.000Z' })
			.eq('id', delegationId);

		expect(error?.message).toContain('not something a page writes');
	});

	it('refuses a head who backdates when the delegation was created', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { conferenceId } = conference;
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, conferenceId);

		// Refused by the catch-all at the end of the head's branch, not by a rule
		// naming this column, which is why a column added to the table later is
		// guarded from the day it arrives.
		const { error } = await head.supabase
			.from('delegations')
			.update({ created_at: '2020-01-01T00:00:00.000Z' })
			.eq('id', delegationId);

		expect(error?.message).toContain('how they described their own delegation');
	});

	it('refuses anybody who tries to change the join code', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { conferenceId } = conference;
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, conferenceId);
		// A fresh random code each run, so a stray success here (which would be a
		// bug, since this write is meant to be refused) never collides with a
		// leftover row from an earlier run under the fixtures-are-never-cleaned-up
		// rule in conference-fixtures.ts.
		const madeUpCode = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();

		const { error } = await head.supabase
			.from('delegations')
			.update({ join_code: madeUpCode })
			.eq('id', delegationId);

		expect(error?.message).toContain('join code cannot be changed');
	});

	it('refuses a head who tries to edit a delegation the organiser already decided', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { supabase, conferenceId } = conference;
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, conferenceId);
		await head.supabase.from('delegations').update({ status: 'submitted' }).eq('id', delegationId);
		await supabase.from('delegations').update({ status: 'rejected' }).eq('id', delegationId);

		const { error } = await head.supabase
			.from('delegations')
			.update({ note: 'One more thing' })
			.eq('id', delegationId);

		expect(error?.message).toContain('can no longer be changed');
	});

	it('lets the organiser decide a delegation without rewriting what the head wrote', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { supabase, conferenceId } = conference;
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, conferenceId, 'Lycee Francais');
		await head.supabase.from('delegations').update({ status: 'submitted' }).eq('id', delegationId);

		// Rejecting is the decision the review page writes to the row itself;
		// accepting is allocate_delegation_seats', which hands out the seats with it.
		const { data, error } = await supabase
			.from('delegations')
			.update({ status: 'rejected', decision_note: 'Not this year' })
			.eq('id', delegationId)
			.select('status, decision_note, name');

		expect(error).toBeNull();
		expect(data).toEqual([
			{ status: 'rejected', decision_note: 'Not this year', name: 'Lycee Francais' }
		]);
	});

	it('refuses an organiser who tries to rewrite the head-written name', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { supabase, conferenceId } = conference;
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, conferenceId, 'Lycee Francais');
		await head.supabase.from('delegations').update({ status: 'submitted' }).eq('id', delegationId);

		const { error } = await supabase
			.from('delegations')
			.update({ name: 'Renamed by organiser' })
			.eq('id', delegationId);

		expect(error?.message).toContain('cannot change what a delegation head wrote');
	});
});

describe('delegations, deleting', () => {
	it('lets a head delete their own delegation while it is a draft', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { conferenceId } = conference;
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, conferenceId);

		await head.supabase.from('delegations').delete().eq('id', delegationId);

		const { data } = await head.supabase.from('delegations').select('id').eq('id', delegationId);
		expect(data).toEqual([]);
	});

	it('refuses a head who tries to delete a delegation that is no longer a draft', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { conferenceId } = conference;
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, conferenceId);
		await head.supabase.from('delegations').update({ status: 'submitted' }).eq('id', delegationId);

		await head.supabase.from('delegations').delete().eq('id', delegationId);

		const { data } = await head.supabase.from('delegations').select('id').eq('id', delegationId);
		expect(data).toEqual([{ id: delegationId }]);
	});
});

describe('delegation_members, reading the table', () => {
	it('lets a member read who else is in their delegation', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { conferenceId } = conference;
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, conferenceId);
		const joinCode = await joinCodeOf(head.supabase, delegationId);
		const member = await createSignedInClient();
		await whileTheConferenceIsJoinable(conference, () =>
			member.supabase.rpc('join_delegation', { code: joinCode })
		);

		const { data } = await member.supabase
			.from('delegation_members')
			.select('role')
			.eq('delegation_id', delegationId);

		expect(data?.map((row) => row.role).sort()).toEqual(['head', 'member']);
	});

	it('lets the organiser read the members of a delegation at their conference', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { supabase, conferenceId } = conference;
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, conferenceId);

		const { data } = await supabase
			.from('delegation_members')
			.select('role')
			.eq('delegation_id', delegationId);

		expect(data).toEqual([{ role: 'head' }]);
	});

	it('shows a stranger nothing', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { conferenceId } = conference;
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, conferenceId);
		const stranger = await createSignedInClient();

		const { data } = await stranger.supabase
			.from('delegation_members')
			.select('role')
			.eq('delegation_id', delegationId);

		expect(data).toEqual([]);
	});
});

describe('profile_details, what one member of a delegation may read of another', () => {
	// The other half of the same rule — that a head *does* read their own members'
	// phone and dietary requirements, through the `delegation_member_details`
	// view and nothing else — is in `security-delegation-private-reads.test.ts`.
	it("shows a plain member nothing of another member's private details", async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { conferenceId } = conference;
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, conferenceId);
		const joinCode = await joinCodeOf(head.supabase, delegationId);

		const oneMember = await createSignedInClient();
		const oneJoin = await whileTheConferenceIsJoinable(conference, () =>
			oneMember.supabase.rpc('join_delegation', { code: joinCode })
		);
		const otherMember = await createSignedInClient();
		const otherJoin = await whileTheConferenceIsJoinable(conference, () =>
			otherMember.supabase.rpc('join_delegation', { code: joinCode })
		);

		// Both joins really happened, so the empty answer below is the policy turning
		// away a fellow member and not a stranger, which is a different test again.
		expect(oneJoin.error).toBeNull();
		expect(otherJoin.error).toBeNull();

		// Neither of them is the head, which is the shape
		// `05-pages/delegation/members.md` asks about: the "Details" toggle belongs to
		// a head, and a member reading the page has nothing to put behind it.
		const { data } = await oneMember.supabase
			.from('profile_details')
			.select('phone, dietary_requirements')
			.eq('user_id', otherMember.userId);

		expect(data).toEqual([]);
	});
});

describe('delegation_members, there is no insert policy', () => {
	it('refuses a head who tries to add a member with a direct insert instead of join_delegation', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { conferenceId } = conference;
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, conferenceId);
		const somebody = await createSignedInClient();

		const { error } = await head.supabase
			.from('delegation_members')
			.insert({ delegation_id: delegationId, user_id: somebody.userId, role: 'member' });

		expect(error).not.toBeNull();
	});
});

describe('delegation_members, changing roles, guarded by prevent_last_delegation_head_removal (the delegation_members_keep_a_head trigger)', () => {
	it('refuses demoting the only head', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { conferenceId } = conference;
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, conferenceId);

		const { error } = await head.supabase
			.from('delegation_members')
			.update({ role: 'member' })
			.eq('delegation_id', delegationId)
			.eq('user_id', head.userId);

		expect(error?.message).toContain('A delegation needs at least one head');
	});

	it('refuses deleting the only head', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { conferenceId } = conference;
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, conferenceId);

		const { error } = await head.supabase
			.from('delegation_members')
			.delete()
			.eq('delegation_id', delegationId)
			.eq('user_id', head.userId);

		expect(error?.message).toContain('A delegation needs at least one head');
	});

	it('lets a head promote a member, and then demote once a second head exists', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { conferenceId } = conference;
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, conferenceId);
		const joinCode = await joinCodeOf(head.supabase, delegationId);
		const member = await createSignedInClient();
		await whileTheConferenceIsJoinable(conference, () =>
			member.supabase.rpc('join_delegation', { code: joinCode })
		);

		const { error: promoteError } = await head.supabase
			.from('delegation_members')
			.update({ role: 'head' })
			.eq('delegation_id', delegationId)
			.eq('user_id', member.userId);
		expect(promoteError).toBeNull();

		const { data, error: demoteError } = await head.supabase
			.from('delegation_members')
			.update({ role: 'member' })
			.eq('delegation_id', delegationId)
			.eq('user_id', head.userId)
			.select('role');

		expect(demoteError).toBeNull();
		expect(data).toEqual([{ role: 'member' }]);
	});
});

describe('delegation_members, only the role may change, the delegation_members_protect_columns trigger', () => {
	it('refuses a head who points an existing membership at somebody else', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { conferenceId } = conference;
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, conferenceId);
		const joinCode = await joinCodeOf(head.supabase, delegationId);
		const member = await createSignedInClient();
		await whileTheConferenceIsJoinable(conference, () =>
			member.supabase.rpc('join_delegation', { code: joinCode })
		);
		const stranger = await createSignedInClient();

		// Anybody signed in may read every profile, so a head has no trouble
		// finding an account id. Rewriting the row would put that account in a
		// delegation it never joined, drop the member who really joined, walk
		// around the one-road rule, which is checked on insert, and hand the head
		// that stranger's phone number through the delegation_member_details view.
		const { error } = await head.supabase
			.from('delegation_members')
			.update({ user_id: stranger.userId })
			.eq('delegation_id', delegationId)
			.eq('user_id', member.userId);

		expect(error?.message).toContain("Only a member's role can be changed");

		const { data: stillTheirs } = await head.supabase
			.from('delegation_members')
			.select('user_id')
			.eq('delegation_id', delegationId)
			.eq('user_id', member.userId);

		expect(stillTheirs).toEqual([{ user_id: member.userId }]);

		const { data: strangerDetails } = await head.supabase
			.from('profile_details')
			.select('email')
			.eq('user_id', stranger.userId);

		expect(strangerDetails).toEqual([]);
	});

	it('refuses a head who moves a membership to another delegation', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { conferenceId } = conference;
		const otherConference = await createOpenConferenceOwnedByMe();
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, conferenceId);
		const otherDelegationId = await addDelegation(head.supabase, otherConference.conferenceId);

		const { error } = await head.supabase
			.from('delegation_members')
			.update({ delegation_id: otherDelegationId })
			.eq('delegation_id', delegationId)
			.eq('user_id', head.userId);

		expect(error?.message).toContain("Only a member's role can be changed");
	});
});

describe('delegation_members, leaving and removal', () => {
	it('lets a head remove a member who holds no seat, and lets a member leave on their own', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { conferenceId } = conference;
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, conferenceId);
		const joinCode = await joinCodeOf(head.supabase, delegationId);

		const removedMember = await createSignedInClient();
		await whileTheConferenceIsJoinable(conference, () =>
			removedMember.supabase.rpc('join_delegation', { code: joinCode })
		);
		await head.supabase
			.from('delegation_members')
			.delete()
			.eq('delegation_id', delegationId)
			.eq('user_id', removedMember.userId);

		const leavingMember = await createSignedInClient();
		await whileTheConferenceIsJoinable(conference, () =>
			leavingMember.supabase.rpc('join_delegation', { code: joinCode })
		);
		await leavingMember.supabase
			.from('delegation_members')
			.delete()
			.eq('delegation_id', delegationId)
			.eq('user_id', leavingMember.userId);

		const { data } = await head.supabase
			.from('delegation_members')
			.select('user_id')
			.eq('delegation_id', delegationId);

		expect(data).toEqual([{ user_id: head.userId }]);
	});

	it('refuses to remove, or let leave, a member who is sitting in one of the delegation seats', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { supabase, conferenceId } = conference;
		const committeeId = await addCommittee(supabase, conferenceId);
		const seatId = await addSeat(supabase, committeeId);
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, conferenceId);
		const joinCode = await joinCodeOf(head.supabase, delegationId);
		const seatedMember = await createSignedInClient();
		await whileTheConferenceIsJoinable(conference, () =>
			seatedMember.supabase.rpc('join_delegation', { code: joinCode })
		);

		// The seat is reserved for the delegation with the member in it, as
		// allocate_delegation_seats and the head's own write would leave it. The
		// service role writes it: a browser may not write these columns
		// (protect_seats_columns), and the head's narrow write only works before
		// the conference's start date, while every fixture conference starts in
		// the past (see the comment on FIXTURE_START_DATE in conference-fixtures.ts).
		await createServiceRoleClient()
			.from('seats')
			.update({ delegation_id: delegationId, user_id: seatedMember.userId })
			.eq('id', seatId);

		const { error: removeError } = await head.supabase
			.from('delegation_members')
			.delete()
			.eq('delegation_id', delegationId)
			.eq('user_id', seatedMember.userId);
		const { error: leaveError } = await seatedMember.supabase
			.from('delegation_members')
			.delete()
			.eq('delegation_id', delegationId)
			.eq('user_id', seatedMember.userId);

		expect(removeError).toBeNull();
		expect(leaveError).toBeNull();

		const { data } = await head.supabase
			.from('delegation_members')
			.select('user_id')
			.eq('delegation_id', delegationId)
			.eq('user_id', seatedMember.userId);

		expect(data).toEqual([{ user_id: seatedMember.userId }]);
	});
});

describe('is_delegation_head and is_delegation_member', () => {
	it('is_delegation_head is true for a head and false for a plain member', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { conferenceId } = conference;
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, conferenceId);
		const joinCode = await joinCodeOf(head.supabase, delegationId);
		const member = await createSignedInClient();
		await whileTheConferenceIsJoinable(conference, () =>
			member.supabase.rpc('join_delegation', { code: joinCode })
		);

		const { data: headIsHead } = await head.supabase.rpc('is_delegation_head', {
			delegation_id: delegationId
		});
		const { data: memberIsHead } = await member.supabase.rpc('is_delegation_head', {
			delegation_id: delegationId
		});

		expect(headIsHead).toBe(true);
		expect(memberIsHead).toBe(false);
	});

	it('is_delegation_member is true for anybody in the delegation and false for a stranger', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const { conferenceId } = conference;
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, conferenceId);
		const stranger = await createSignedInClient();

		const { data: headIsMember } = await head.supabase.rpc('is_delegation_member', {
			delegation_id: delegationId
		});
		const { data: strangerIsMember } = await stranger.supabase.rpc('is_delegation_member', {
			delegation_id: delegationId
		});

		expect(headIsMember).toBe(true);
		expect(strangerIsMember).toBe(false);
	});
});
