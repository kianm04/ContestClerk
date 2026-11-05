import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createServiceRoleClient, createSignedInClient } from './supabase-test-client';
import {
	addDelegation,
	createOpenConferenceOwnedByMe,
	type ConferenceFixture
} from './conference-fixtures';

// The `delegations_with_heads` and `delegation_status_totals` views, added by
// supabase/migrations/20260925120000_delegation_list_views.sql for the
// organiser's delegations table at /manage/[slug]/delegations.
//
// `delegations_with_heads` is the columns of a delegation the table draws plus
// the names of its heads, so that the search box — which matches a head's name
// as well as the delegation's — can be a condition of one request and the
// database can order, page and count the answer. `delegation_status_totals` is
// how many delegations each status has at a conference and how many seats they
// asked for between them, which is what the tabs and the sentence under the
// heading show.
//
// Both are declared with `security_invoker = true`, so they read the tables
// under them as whoever is asking and Row Level Security decides every row. The
// stranger tests below are the ones that would notice if that flag were ever
// turned off: the views would then read as their owner, and every delegation of
// every conference would become readable by any signed-in account.
//
// Before these views the page read every delegation in a status and did the
// searching, sorting and paging in TypeScript, which `max_rows = 1000` in
// supabase/config.toml quietly cut short. That is task T74.

/** A delegation of the search test, and the person who registered it. */
type DelegationDescription = {
	headName: string;
	delegationName: string;
	status: 'draft' | 'submitted';
};

/**
 * The four delegations the search test registers at one conference.
 *
 * Every clause of the one request it sends is load-bearing, so that a clause the
 * database quietly ignored would change the answer:
 *
 *   * "willow" matches Northgate by its head's name and Willow Park by its own
 *     name, which is what searching the heads is for. Riverside matches neither.
 *   * Aardvark matches by its head and sorts before both, so only the status
 *     filter keeps a draft off the organiser's "submitted" tab.
 *
 * What is left is Northgate and then Willow Park, which is what makes the first
 * page one row long and the total two.
 */
const SEARCH_DELEGATIONS: DelegationDescription[] = [
	{ headName: 'Amara Willows', delegationName: 'Northgate Delegation', status: 'submitted' },
	{ headName: 'Bram de Vries', delegationName: 'Willow Park Delegation', status: 'submitted' },
	{ headName: 'Dario Ferrari', delegationName: 'Riverside Delegation', status: 'submitted' },
	{ headName: 'Aaron Willows', delegationName: 'Aardvark Delegation', status: 'draft' }
];

/** A delegation made for a test, with its head's client and id. */
type RegisteredDelegation = {
	delegationId: string;
	head: SupabaseClient;
	headUserId: string;
};

/**
 * Signs somebody up and has them register a delegation at the conference,
 * submitting it when asked to.
 *
 * Everything goes through the head's own client, so the delegation and its head
 * membership only appear if the policies and `create_delegation` allow them.
 * `addDelegation` asks for four seats.
 */
async function registerDelegation(
	conferenceId: string,
	description: DelegationDescription
): Promise<RegisteredDelegation> {
	// The name travels the way the register form sends it, and the
	// `handle_new_user` trigger copies it into `profiles.full_name`.
	const account = await createSignedInClient(description.headName);
	const delegationId = await addDelegation(
		account.supabase,
		conferenceId,
		description.delegationName
	);

	if (description.status === 'submitted') {
		const { error } = await account.supabase
			.from('delegations')
			.update({ status: 'submitted' })
			.eq('id', delegationId);

		if (error) {
			throw new Error(`Could not submit the fixture delegation: ${error.message}`);
		}
	}

	return { delegationId, head: account.supabase, headUserId: account.userId };
}

/** A conference with one submitted delegation at it, headed by Amara Willows. */
async function createConferenceWithOneDelegation(): Promise<{
	conference: ConferenceFixture;
	delegation: RegisteredDelegation;
}> {
	const conference = await createOpenConferenceOwnedByMe();
	const delegation = await registerDelegation(conference.conferenceId, SEARCH_DELEGATIONS[0]);

	return { conference, delegation };
}

/**
 * Makes a second person a head of this delegation.
 *
 * Through the service-role client, because in the app a second head is somebody
 * who joined with the code and was then promoted, and that is two policies and
 * a conference date window away from what this file is about. `joined_at` is
 * set to a day later so the order of the two heads is certain.
 */
async function addSecondHead(delegationId: string, fullName: string): Promise<string> {
	const account = await createSignedInClient(fullName);
	const serviceRole = createServiceRoleClient();
	const { error } = await serviceRole.from('delegation_members').insert({
		delegation_id: delegationId,
		user_id: account.userId,
		role: 'head',
		joined_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
	});

	if (error) {
		throw new Error(`Could not add the second head: ${error.message}`);
	}

	return account.userId;
}

/**
 * The one request the organiser's delegations table sends, sorted by name: this
 * conference, this status, a name, an institution or a head containing
 * "willow", in this order, and one page of it. The second `order`, on `id`,
 * breaks a tie so a page boundary never falls differently twice.
 */
async function searchDelegations(
	organiser: SupabaseClient,
	conferenceId: string,
	firstRow: number,
	lastRow: number
) {
	return await organiser
		.from('delegations_with_heads')
		.select('name, head_names', { count: 'exact' })
		.eq('conference_id', conferenceId)
		.eq('status', 'submitted')
		.or('name.ilike."%willow%",institution_name.ilike."%willow%",head_names_text.ilike."%willow%"')
		.order('name', { ascending: true })
		.order('id', { ascending: true })
		.range(firstRow, lastRow);
}

describe('delegations_with_heads', () => {
	it('gives an organiser a delegation with its heads, members, seats and invoices', async () => {
		const { conference, delegation } = await createConferenceWithOneDelegation();

		const { data, error } = await conference.supabase
			.from('delegations_with_heads')
			.select(
				'id, name, status, requested_seats, head_names, delegation_members(user_id), seats(user_id), invoices(status)'
			)
			.eq('conference_id', conference.conferenceId)
			.single();

		expect(error).toBeNull();
		// The members, the seats and the invoices are brought along although the
		// view is not a table, because PostgREST sees that its `id` is
		// `delegations.id`. That is what lets the table stay one request.
		expect(data).toEqual({
			id: delegation.delegationId,
			name: 'Northgate Delegation',
			status: 'submitted',
			requested_seats: 4,
			head_names: ['Amara Willows'],
			delegation_members: [{ user_id: delegation.headUserId }],
			seats: [],
			invoices: []
		});
	});

	it('names the heads oldest membership first', async () => {
		const { conference, delegation } = await createConferenceWithOneDelegation();
		await addSecondHead(delegation.delegationId, 'Zofia Nowak');

		const { data, error } = await conference.supabase
			.from('delegations_with_heads')
			.select('head_names, head_names_text')
			.eq('id', delegation.delegationId)
			.single();

		expect(error).toBeNull();
		// The head who registered the group comes first. The text column holds the
		// same names one per line, and exists only to be searched.
		expect(data).toEqual({
			head_names: ['Amara Willows', 'Zofia Nowak'],
			head_names_text: 'Amara Willows\nZofia Nowak'
		});
	});

	it('keeps a delegation whose head has no profile, with a gap where the name was', async () => {
		const { conference, delegation } = await createConferenceWithOneDelegation();

		// No policy lets anybody delete a profile from the app, so the
		// service-role client does it. `delegation_members.user_id` points at
		// `auth.users` rather than at `profiles`, so the membership survives.
		const serviceRole = createServiceRoleClient();
		const { error: deleteError } = await serviceRole
			.from('profiles')
			.delete()
			.eq('id', delegation.headUserId);

		expect(deleteError).toBeNull();

		const { data, error } = await conference.supabase
			.from('delegations_with_heads')
			.select('id, head_names')
			.eq('conference_id', conference.conferenceId)
			.single();

		expect(error).toBeNull();
		// The left joins are what keep the row and the gap: the page writes
		// "Deleted account" for the `null`.
		expect(data).toEqual({ id: delegation.delegationId, head_names: [null] });
	});

	it('shows a signed-in stranger no delegation of a conference that is not theirs', async () => {
		const { conference } = await createConferenceWithOneDelegation();

		const stranger = await createSignedInClient();
		const { data, error } = await stranger.supabase
			.from('delegations_with_heads')
			.select('id, head_names')
			.eq('conference_id', conference.conferenceId);

		expect(error).toBeNull();
		expect(data).toEqual([]);
	});

	it('does not hand out the join code or the organisers’ note', async () => {
		const { conference } = await createConferenceWithOneDelegation();

		const { error } = await conference.supabase
			.from('delegations_with_heads')
			.select('join_code, internal_note')
			.eq('conference_id', conference.conferenceId);

		// The view names its columns one by one, so these two are simply not
		// there to ask for, whoever is asking.
		expect(error).not.toBeNull();
	});

	it('searches heads, filters, sorts and pages the delegations in one request', async () => {
		const conference = await createOpenConferenceOwnedByMe();

		for (const description of SEARCH_DELEGATIONS) {
			await registerDelegation(conference.conferenceId, description);
		}

		const firstPage = await searchDelegations(conference.supabase, conference.conferenceId, 0, 0);

		expect(firstPage.error).toBeNull();
		// Northgate matched by its head's name alone.
		expect(firstPage.data).toEqual([
			{ name: 'Northgate Delegation', head_names: ['Amara Willows'] }
		]);
		// The count is of everything that matched, not of the page.
		expect(firstPage.count).toBe(2);

		const secondPage = await searchDelegations(conference.supabase, conference.conferenceId, 1, 1);

		expect(secondPage.error).toBeNull();
		expect(secondPage.data).toEqual([
			{ name: 'Willow Park Delegation', head_names: ['Bram de Vries'] }
		]);
		expect(secondPage.count).toBe(2);
	});
});

describe('delegation_status_totals', () => {
	it('gives an organiser the count and the seats of each status at their conference', async () => {
		const conference = await createOpenConferenceOwnedByMe();

		for (const description of SEARCH_DELEGATIONS) {
			await registerDelegation(conference.conferenceId, description);
		}

		const { data, error } = await conference.supabase
			.from('delegation_status_totals')
			.select('status, delegation_count, requested_seats')
			.eq('conference_id', conference.conferenceId)
			.order('status', { ascending: true });

		expect(error).toBeNull();
		// Three submitted delegations of four seats each, and one draft. The page
		// leaves the draft row out itself with `.neq('status', 'draft')`.
		expect(data).toEqual([
			{ status: 'draft', delegation_count: 1, requested_seats: 4 },
			{ status: 'submitted', delegation_count: 3, requested_seats: 12 }
		]);
	});

	it('adds up nothing for a signed-in stranger', async () => {
		const { conference } = await createConferenceWithOneDelegation();

		const stranger = await createSignedInClient();
		const { data, error } = await stranger.supabase
			.from('delegation_status_totals')
			.select('status, delegation_count')
			.eq('conference_id', conference.conferenceId);

		expect(error).toBeNull();
		// Row Level Security removes the delegations before they are counted, so a
		// stranger does not even learn that the conference has any.
		expect(data).toEqual([]);
	});
});
