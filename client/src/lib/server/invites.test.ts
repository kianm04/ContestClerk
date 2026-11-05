import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	acceptInvite,
	acceptInviteById,
	committeeChairInviteRefusal,
	createOrganizationInvite,
	createStaffInvite,
	findPendingInvite,
	findPendingOrganizationInvite,
	getInvite,
	isEmailOnTeam,
	listMyChairedCommittees,
	listMyInvites,
	listPendingInvites,
	listPendingOrganizationInvites,
	makeInviteToken,
	revokeInvite,
	withdrawCommitteeChairInvite
} from './invites';

// Some of this module calls an SQL function and some reads the `invites` table.
// The tests for the SQL functions are about which function was called, with
// what, and what the module makes of the answer; the ones further down are
// about which rows the table queries ask for. Who the database then lets call
// or read any of it, and which invitations it hands back, is tested in
// `tests/db/invites.test.ts`.

/** What the stand-in should answer with. All three have a harmless default. */
type StandInAnswers = {
	/** The rows a function that returns a table gives back. */
	rows?: unknown[];
	/**
	 * What a function that answers one value rather than a table gives back.
	 * `conference_team_has_email` answers `true` or `false`, not a list of one.
	 */
	value?: unknown;
	/** The message the call fails with instead of answering. */
	errorMessage?: string;
};

/** `[name, arguments]` for every SQL function that was called. */
type RecordedCalls = [string, unknown][];

/**
 * A stand-in Supabase client for the SQL functions this module calls.
 *
 * `rpc` is how the real client calls one: it takes the function's name and an
 * object of arguments, and answers with the same `{ data, error }` pair an
 * ordinary query does.
 */
function createStandInSupabase(answers: StandInAnswers = {}): {
	supabase: SupabaseClient;
	calls: RecordedCalls;
} {
	const calls: RecordedCalls = [];

	const supabase = {
		rpc: async (name: string, functionArguments?: unknown) => {
			calls.push([name, functionArguments]);

			if (answers.errorMessage) {
				return { data: null, error: { message: answers.errorMessage } };
			}

			// `??` falls through for nothing at all and not for `false`, so a
			// function answering `false` still answers `false` here.
			return { data: answers.value ?? answers.rows ?? [], error: null };
		}
	};

	return { supabase: supabase as unknown as SupabaseClient, calls };
}

/** One row of `list_my_invites()`, in the shape the function returns it. */
function inviteRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'invite-1',
		kind: 'organization_member',
		role: 'admin',
		organization_name: 'Sample Europe MUN Network',
		conference_name: null,
		expires_at: '2026-10-01T10:00:00Z',
		...changes
	};
}

describe('listMyInvites', () => {
	it('asks the database for the invitations of whoever is signed in', async () => {
		const { supabase, calls } = createStandInSupabase();

		await listMyInvites(supabase);

		// The function takes no arguments: it works out whose invitations to look
		// for from the signed-in user's own email address.
		expect(calls).toEqual([['list_my_invites', undefined]]);
	});

	it('is empty when nobody has invited this person to anything', async () => {
		const { supabase } = createStandInSupabase();

		expect(await listMyInvites(supabase)).toEqual([]);
	});

	it('shows an organisation invitation under the organisation name', async () => {
		const { supabase } = createStandInSupabase({ rows: [inviteRow()] });

		expect(await listMyInvites(supabase)).toEqual([
			{
				id: 'invite-1',
				kind: 'organization_member',
				role: 'admin',
				name: 'Sample Europe MUN Network'
			}
		]);
	});

	it('shows a conference invitation under the conference name', async () => {
		const { supabase } = createStandInSupabase({
			rows: [
				inviteRow({
					kind: 'conference_staff',
					role: 'chair',
					organization_name: null,
					conference_name: 'THIMUN 2027'
				})
			]
		});

		const invites = await listMyInvites(supabase);

		expect(invites[0].name).toBe('THIMUN 2027');
		expect(invites[0].role).toBe('chair');
	});

	it('leaves the name empty when the invitation points at nothing', async () => {
		const { supabase } = createStandInSupabase({
			rows: [inviteRow({ organization_name: null, conference_name: null })]
		});

		// The table's own constraint refuses such a row, so this only says what
		// happens if one ever turned up: an empty name rather than "null".
		expect((await listMyInvites(supabase))[0].name).toBe('');
	});

	it('raises when the call fails, rather than saying there are no invitations', async () => {
		const { supabase } = createStandInSupabase({ errorMessage: 'no connection' });

		await expect(listMyInvites(supabase)).rejects.toThrow('no connection');
	});
});

describe('acceptInvite', () => {
	it('hands the token to the database function', async () => {
		const { supabase, calls } = createStandInSupabase();

		await acceptInvite(supabase, 'b'.repeat(32));

		expect(calls).toEqual([['accept_invite', { token: 'b'.repeat(32) }]]);
	});

	it('answers true when the database accepted it', async () => {
		const { supabase } = createStandInSupabase();

		expect(await acceptInvite(supabase, 'b'.repeat(32))).toBe(true);
	});

	it('answers false rather than raising when the database refused it', async () => {
		// Expired, already used, or sent to a different address: the SQL function
		// raises for each of those, and the page turns the `false` into a sentence
		// the reader can act on instead of an error page.
		const { supabase } = createStandInSupabase({
			errorMessage: 'This invitation has expired'
		});

		expect(await acceptInvite(supabase, 'b'.repeat(32))).toBe(false);
	});
});

describe('acceptInviteById', () => {
	it('hands the id to the database function under its argument name', async () => {
		const { supabase, calls } = createStandInSupabase();

		await acceptInviteById(supabase, 'invite-1');

		expect(calls).toEqual([['accept_invite_by_id', { invite_id: 'invite-1' }]]);
	});

	it('answers true when the database accepted it, and false when it refused', async () => {
		expect(await acceptInviteById(createStandInSupabase().supabase, 'invite-1')).toBe(true);

		// The same refusals as `acceptInvite`: the two share one body in SQL.
		const refusing = createStandInSupabase({
			errorMessage: 'This invitation was sent to a different email address'
		});

		expect(await acceptInviteById(refusing.supabase, 'invite-1')).toBe(false);
	});
});

describe('isEmailOnTeam', () => {
	it('asks the database function about this conference and this address', async () => {
		const { supabase, calls } = createStandInSupabase({ value: false });

		await isEmailOnTeam(supabase, 'conference-1', 'new.chair@example.org');

		expect(calls).toEqual([
			[
				'conference_team_has_email',
				{ conference_id: 'conference-1', email: 'new.chair@example.org' }
			]
		]);
	});

	it('answers yes when the address is already on the team', async () => {
		const { supabase } = createStandInSupabase({ value: true });

		expect(await isEmailOnTeam(supabase, 'conference-1', 'chair@example.org')).toBe(true);
	});

	it('answers no when it is not', async () => {
		const { supabase } = createStandInSupabase({ value: false });

		expect(await isEmailOnTeam(supabase, 'conference-1', 'stranger@example.org')).toBe(false);
	});

	it('answers yes when the call failed, so that the invitation is refused', async () => {
		const { supabase } = createStandInSupabase({
			errorMessage: 'You cannot manage that conference'
		});

		// The SQL function raises for a caller who cannot manage the conference, so
		// an error is "not allowed" rather than "no". This is the one place in the
		// module where a failed call answers `true`: refusing to send an invitation
		// we could not check is the safe direction to be wrong in.
		expect(await isEmailOnTeam(supabase, 'conference-1', 'chair@example.org')).toBe(true);
	});
});

describe('committeeChairInviteRefusal', () => {
	it('asks the database function about this committee and this address', async () => {
		const { supabase, calls } = createStandInSupabase({ value: null });

		expect(await committeeChairInviteRefusal(supabase, 'committee-1', 'a@example.org')).toBeNull();
		expect(calls).toEqual([
			['committee_chair_invite_refusal', { committee_id: 'committee-1', email: 'a@example.org' }]
		]);
	});

	it('passes on the two reasons it knows', async () => {
		const alreadyChair = createStandInSupabase({ value: 'already_chair' });
		const organiser = createStandInSupabase({ value: 'organiser' });

		expect(
			await committeeChairInviteRefusal(alreadyChair.supabase, 'committee-1', 'a@example.org')
		).toBe('already_chair');
		expect(
			await committeeChairInviteRefusal(organiser.supabase, 'committee-1', 'a@example.org')
		).toBe('organiser');
	});

	it('throws when the call failed, rather than letting the invitation through', async () => {
		const { supabase } = createStandInSupabase({
			errorMessage: 'You cannot manage that committee'
		});

		await expect(
			committeeChairInviteRefusal(supabase, 'committee-1', 'a@example.org')
		).rejects.toThrow('You cannot manage that committee');
	});
});

/** One row of `get_invite(token)`, in the shape the function returns it. */
function getInviteRow(changes: Record<string, unknown> = {}) {
	return {
		kind: 'conference_staff',
		status: 'pending',
		role: 'Chair',
		role_scope: 'committees',
		role_permissions: ['run_room'],
		email: 'new.chair@example.org',
		organization_name: null,
		organization_slug: null,
		conference_name: 'THIMUN 2027',
		conference_slug: 'thimun-2027',
		committee_name: 'Security Council',
		invited_by_name: 'Maya Okonjo',
		expires_at: '2026-10-03T10:00:00Z',
		accepted_at: null,
		...changes
	};
}

describe('getInvite', () => {
	it('hands the token over and puts the row under the names the page uses', async () => {
		const { supabase, calls } = createStandInSupabase({ rows: [getInviteRow()] });

		const invite = await getInvite(supabase, 'c'.repeat(32));

		expect(calls).toEqual([['get_invite', { token: 'c'.repeat(32) }]]);
		expect(invite).toEqual({
			kind: 'conference_staff',
			status: 'pending',
			role: 'Chair',
			roleScope: 'committees',
			rolePermissions: ['run_room'],
			email: 'new.chair@example.org',
			organizationName: null,
			organizationSlug: null,
			conferenceName: 'THIMUN 2027',
			conferenceSlug: 'thimun-2027',
			committeeName: 'Security Council',
			invitedByName: 'Maya Okonjo',
			expiresAt: '2026-10-03T10:00:00Z',
			acceptedAt: null
		});
	});

	it('answers nothing for a token nobody holds', async () => {
		const { supabase } = createStandInSupabase({ rows: [] });

		// The function is declared `returns table (...)`, so "no such token" comes
		// back as a list with nothing in it rather than as an error.
		expect(await getInvite(supabase, 'c'.repeat(32))).toBeNull();
	});

	it('says an invitation that has been used was, rather than hiding it', async () => {
		// For a used or expired invitation the function answers the status and
		// withholds the address and the names (security review L18).
		const { supabase } = createStandInSupabase({
			rows: [getInviteRow({ status: 'used', accepted_at: '2026-09-20T09:00:00Z', email: null })]
		});

		const invite = await getInvite(supabase, 'c'.repeat(32));

		// The page turns this into "This invite was already used."
		expect(invite?.status).toBe('used');
		expect(invite?.acceptedAt).toBe('2026-09-20T09:00:00Z');
		expect(invite?.email).toBeNull();
	});

	it('raises when the call fails', async () => {
		const { supabase } = createStandInSupabase({ errorMessage: 'no connection' });

		await expect(getInvite(supabase, 'c'.repeat(32))).rejects.toThrow('no connection');
	});
});

// -----------------------------------------------------------------------------
// The invitations of one conference
// -----------------------------------------------------------------------------
// Everything below reads or writes the `invites` table itself rather than
// calling an SQL function, so it needs a stand-in of a different shape: the
// real client builds a table query up step by step, where `rpc` is one call.
// The one above is left as it is, because the functions it serves still call
// SQL functions. As above, nothing here talks to a database.

/** An error in the shape the real client reports one. */
type QueryError = { message: string };

/** What one table query the module sent was asking for. */
type RecordedQuery = {
	/** The relation `.from(...)` named. */
	table: string;
	/** The rows `.insert(...)` was given, or `null` when the query added none. */
	inserted: Record<string, unknown>[] | null;
	/** `true` when the query removed rows rather than reading or adding them. */
	isDelete: boolean;
	eq: [string, unknown][];
	/** `[column, value]` for every `.is(...)`, which asks for a column holding nothing. */
	is: [string, unknown][];
	/** `[column, ascending]` for every `.order(...)`. */
	order: [string, boolean][];
	limit: number[];
};

/** What the table stand-in should answer with. Both have a harmless default. */
type TableAnswers = {
	/** The rows the query gives back. */
	rows?: unknown[];
	/** The message the query fails with instead of answering. */
	errorMessage?: string;
};

/** What an awaited query answers with: a list of rows, or nothing and a message. */
type TableAnswer = {
	data: unknown[] | null;
	error: QueryError | null;
};

/** The end of a chain that asked for one row rather than a list. */
type SingleRowBuilder = {
	overrideTypes: () => Promise<{ data: unknown; error: QueryError | null }>;
};

/** One step of a table query. Every step hands the builder back. */
type TableBuilder = {
	select: (columns?: string) => TableBuilder;
	insert: (rows: Record<string, unknown> | Record<string, unknown>[]) => TableBuilder;
	delete: () => TableBuilder;
	eq: (column: string, value: unknown) => TableBuilder;
	is: (column: string, value: unknown) => TableBuilder;
	order: (column: string, options: { ascending: boolean }) => TableBuilder;
	limit: (count: number) => TableBuilder;
	maybeSingle: () => SingleRowBuilder;
	overrideTypes: () => Promise<TableAnswer>;
};

/**
 * A stand-in Supabase client for the `invites` table.
 *
 * The real client is a builder: `.from(...)` gives back an object with
 * `.select(...)` on it, `.select(...)` one with `.eq(...)` on it, and so on.
 * Each step adds one condition to a query that is only sent once the chain is
 * awaited. This copies that shape: every step records its arguments and hands
 * the same builder back. A chain ending in `maybeSingle` is answered with the
 * first row, the way the real one answers with the first match.
 */
function createTableStandIn(answers: TableAnswers = {}): {
	supabase: SupabaseClient;
	queries: RecordedQuery[];
} {
	const queries: RecordedQuery[] = [];

	function builderFor(table: string): TableBuilder {
		const query: RecordedQuery = {
			table,
			inserted: null,
			isDelete: false,
			eq: [],
			is: [],
			order: [],
			limit: []
		};
		queries.push(query);

		const message = answers.errorMessage;
		const rows = answers.rows ?? [];
		const error = message ? { message } : null;
		const listAnswer: TableAnswer = { data: message ? null : rows, error };
		const singleRowAnswer = { data: message ? null : (rows[0] ?? null), error };

		const builder: TableBuilder = {
			// Which columns were asked for is not what these tests are about, so
			// `select` records nothing and only carries the chain on.
			select: () => builder,
			insert: (rows) => {
				query.inserted = Array.isArray(rows) ? rows : [rows];
				return builder;
			},
			delete: () => {
				query.isDelete = true;
				return builder;
			},
			eq: (column, value) => {
				query.eq.push([column, value]);
				return builder;
			},
			is: (column, value) => {
				query.is.push([column, value]);
				return builder;
			},
			order: (column, options) => {
				query.order.push([column, options.ascending]);
				return builder;
			},
			limit: (count) => {
				query.limit.push(count);
				return builder;
			},
			maybeSingle: () => ({ overrideTypes: async () => singleRowAnswer }),
			// In the real client `overrideTypes` changes the type of the answer and
			// not the answer itself, so here it is simply where the chain ends.
			overrideTypes: async () => listAnswer
		};

		return builder;
	}

	const supabase = { from: builderFor };

	return { supabase: supabase as unknown as SupabaseClient, queries };
}

/** One pending `invites` row, in the shape the organiser's page reads it. */
function pendingInviteRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'invite-1',
		token: 'd'.repeat(32),
		email: 'new.chair@example.org',
		role_id: 'role-chair',
		// The role's name comes along on the row, because `role_id` points at
		// `conference_roles`.
		conference_roles: { name: 'Chair' },
		committee_id: null,
		title: null,
		expires_at: '2026-10-03T10:00:00Z',
		...changes
	};
}

/** The committees the team page has already read, which name an invitation's committee. */
const COMMITTEES = [
	{ id: 'committee-1', name: 'Security Council', abbreviation: 'UNSC' },
	{ id: 'committee-2', name: 'Economic and Social Council', abbreviation: 'ECOSOC' }
];

describe('makeInviteToken', () => {
	it('makes 32 characters that are safe to put in a link', async () => {
		// The token is the last part of `/invites/<token>`, so nothing in it may
		// need escaping: the alphabet is the lowercase letters and the digits two
		// to seven, which is 32 characters exactly.
		expect(makeInviteToken()).toMatch(/^[a-z2-7]{32}$/);
	});

	it('makes a different one every time', async () => {
		// Two tokens the same would mean the random numbers were not random. This
		// cannot prove they are, but it catches a token that is a constant.
		expect(makeInviteToken()).not.toBe(makeInviteToken());
	});
});

describe('createStaffInvite', () => {
	it('writes the invitation and answers with the token the database kept', async () => {
		const { supabase, queries } = createTableStandIn({ rows: [{ token: 'e'.repeat(32) }] });

		const token = await createStaffInvite(supabase, {
			conferenceId: 'conference-1',
			email: 'New.Chair@Example.org',
			roleId: 'role-chair',
			committeeId: 'committee-1',
			title: 'Vice Chair',
			invitedBy: 'user-1'
		});

		expect(token).toBe('e'.repeat(32));

		const written = queries[0].inserted?.[0] ?? {};

		expect(written.kind).toBe('conference_staff');
		expect(written.conference_id).toBe('conference-1');
		// The table refuses an address that is not already lowercase.
		expect(written.email).toBe('new.chair@example.org');
		expect(written.role_id).toBe('role-chair');
		expect(written.committee_id).toBe('committee-1');
		expect(written.title).toBe('Vice Chair');
		expect(written.invited_by).toBe('user-1');
		expect(written.token).toMatch(/^[a-z2-7]{32}$/);
	});

	it('leaves the deadline to the column, which is fourteen days', async () => {
		const { supabase, queries } = createTableStandIn({ rows: [{ token: 'e'.repeat(32) }] });

		await createStaffInvite(supabase, {
			conferenceId: 'conference-1',
			email: 'new.chair@example.org',
			roleId: 'role-volunteer',
			committeeId: null,
			title: null,
			invitedBy: 'user-1'
		});

		expect(queries[0].inserted?.[0]).not.toHaveProperty('expires_at');
	});

	it('answers nothing rather than raising when the insert is refused', async () => {
		const { supabase } = createTableStandIn({
			errorMessage: 'new row violates row-level security policy for table "invites"'
		});

		const token = await createStaffInvite(supabase, {
			conferenceId: 'conference-1',
			email: 'new.chair@example.org',
			roleId: 'role-chair',
			committeeId: null,
			title: null,
			invitedBy: 'user-1'
		});

		expect(token).toBeNull();
	});
});

describe('listPendingInvites', () => {
	it('asks for the staff invitations of this conference that nobody has accepted', async () => {
		const { supabase, queries } = createTableStandIn({ rows: [pendingInviteRow()] });

		await listPendingInvites(supabase, 'conference-1', COMMITTEES);

		expect(queries[0].table).toBe('invites');
		expect(queries[0].eq).toEqual([
			['conference_id', 'conference-1'],
			['kind', 'conference_staff']
		]);
		// `is` asks for a column holding nothing at all, where `eq` would compare
		// it against the word "null".
		expect(queries[0].is).toEqual([['accepted_at', null]]);
		// Oldest first, so an invitation keeps its place as more are sent.
		expect(queries[0].order).toEqual([['created_at', true]]);
	});

	it('names the committee from the list it was handed', async () => {
		const { supabase, queries } = createTableStandIn({
			rows: [pendingInviteRow({ committee_id: 'committee-2' })]
		});

		const invites = await listPendingInvites(supabase, 'conference-1', COMMITTEES);

		expect(invites[0].committeeName).toBe('Economic and Social Council');
		// One query, not two: the name was already on the page.
		expect(queries).toHaveLength(1);
	});

	it('leaves the committee empty for an invitation that names none', async () => {
		const { supabase } = createTableStandIn({ rows: [pendingInviteRow()] });

		const invites = await listPendingInvites(supabase, 'conference-1', COMMITTEES);

		expect(invites[0]).toEqual({
			id: 'invite-1',
			token: 'd'.repeat(32),
			email: 'new.chair@example.org',
			roleId: 'role-chair',
			roleName: 'Chair',
			committeeId: null,
			committeeName: null,
			title: null,
			expiresAt: '2026-10-03T10:00:00Z'
		});
	});

	it('raises when the invitations cannot be read', async () => {
		const { supabase } = createTableStandIn({ errorMessage: 'no connection' });

		await expect(listPendingInvites(supabase, 'conference-1', COMMITTEES)).rejects.toThrow(
			'no connection'
		);
	});
});

describe('findPendingInvite', () => {
	it('looks for one invitation to one lowercased address', async () => {
		const { supabase, queries } = createTableStandIn({ rows: [pendingInviteRow()] });

		const invite = await findPendingInvite(supabase, 'conference-1', 'New.Chair@Example.org');

		expect(queries[0].eq).toEqual([
			['conference_id', 'conference-1'],
			['kind', 'conference_staff'],
			['email', 'new.chair@example.org']
		]);
		expect(queries[0].limit).toEqual([1]);
		expect(invite?.id).toBe('invite-1');
	});

	it('never names a committee, because its caller only asks whether there is one', async () => {
		const { supabase } = createTableStandIn({
			rows: [pendingInviteRow({ committee_id: 'committee-1' })]
		});

		const invite = await findPendingInvite(supabase, 'conference-1', 'new.chair@example.org');

		// It takes no committees to look the name up in, unlike `listPendingInvites`.
		expect(invite?.committeeName).toBeNull();
		// The id is a column of the row, so it comes back either way. "Send again"
		// is what reads it, because two committees of one conference may share a
		// name and only the id says which was meant.
		expect(invite?.committeeId).toBe('committee-1');
	});

	it('answers nothing when nobody has been invited at that address', async () => {
		const { supabase } = createTableStandIn();

		expect(await findPendingInvite(supabase, 'conference-1', 'stranger@example.org')).toBeNull();
	});
});

describe('revokeInvite', () => {
	it('deletes the one row and asks which id went', async () => {
		const { supabase, queries } = createTableStandIn({ rows: [{ id: 'invite-1' }] });

		expect(await revokeInvite(supabase, 'invite-1')).toBe(true);
		expect(queries[0].isDelete).toBe(true);
		expect(queries[0].eq).toEqual([['id', 'invite-1']]);
	});

	it('answers no when nothing came back', async () => {
		const { supabase } = createTableStandIn();

		// The delete policy hides the row from anybody who may not withdraw it, so
		// a refusal is a delete that matched nothing rather than an error.
		expect(await revokeInvite(supabase, 'invite-1')).toBe(false);
	});
});

describe('withdrawCommitteeChairInvite', () => {
	it('deletes only a pending chair invitation of this committee', async () => {
		const { supabase, queries } = createTableStandIn({ rows: [{ id: 'invite-1' }] });

		expect(await withdrawCommitteeChairInvite(supabase, 'committee-1', 'invite-1')).toBe(true);
		expect(queries[0].isDelete).toBe(true);
		expect(queries[0].eq).toEqual([
			['id', 'invite-1'],
			['committee_id', 'committee-1'],
			['kind', 'conference_staff']
		]);
		expect(queries[0].is).toEqual([['accepted_at', null]]);
	});

	it('answers no when nothing matched', async () => {
		const { supabase } = createTableStandIn();

		expect(await withdrawCommitteeChairInvite(supabase, 'committee-1', 'invite-1')).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// The invitations of one organisation
// ---------------------------------------------------------------------------
// The same three queries as above, for `kind = 'organization_member'` rows.
// An `invites` row is one kind or the other and never both, so each of these
// asks for its kind by name rather than trusting the organisation id alone.

/** One pending organisation invitation, in the shape the settings page reads it. */
function pendingOrganizationInviteRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'invite-9',
		token: 'e'.repeat(32),
		email: 'new.admin@example.org',
		role: 'admin',
		expires_at: '2026-10-03T10:00:00Z',
		...changes
	};
}

describe('createOrganizationInvite', () => {
	it('writes an organisation invitation and answers its token', async () => {
		const { supabase, queries } = createTableStandIn({ rows: [{ token: 'f'.repeat(32) }] });

		const token = await createOrganizationInvite(supabase, {
			organizationId: 'organization-1',
			email: 'new.admin@example.org',
			role: 'admin',
			invitedBy: 'user-1'
		});

		expect(token).toBe('f'.repeat(32));
		expect(queries[0].table).toBe('invites');
		expect(queries[0].inserted?.[0]).toMatchObject({
			kind: 'organization_member',
			organization_id: 'organization-1',
			email: 'new.admin@example.org',
			role: 'admin',
			invited_by: 'user-1'
		});
	});

	// The table refuses an address that is not already lowercase
	// (`invites_email_is_lowercase`), and an admin typed this one in.
	it('lowercases the address on its way in', async () => {
		const { supabase, queries } = createTableStandIn({ rows: [{ token: 'g'.repeat(32) }] });

		await createOrganizationInvite(supabase, {
			organizationId: 'organization-1',
			email: 'New.Admin@Example.ORG',
			role: 'member',
			invitedBy: 'user-1'
		});

		expect(queries[0].inserted?.[0]).toMatchObject({ email: 'new.admin@example.org' });
	});

	// A title is the words under somebody's name on a conference's team list and
	// a committee is what a chair is invited to chair; an organisation has
	// neither, so neither column is written.
	it('writes no title and no committee', async () => {
		const { supabase, queries } = createTableStandIn({ rows: [{ token: 'h'.repeat(32) }] });

		await createOrganizationInvite(supabase, {
			organizationId: 'organization-1',
			email: 'new.admin@example.org',
			role: 'member',
			invitedBy: 'user-1'
		});

		const written = queries[0].inserted?.[0] as Record<string, unknown>;

		expect(written).not.toHaveProperty('title');
		expect(written).not.toHaveProperty('committee_id');
	});

	// `expires_at` is left out so that the column's own default stands: an
	// invitation lasts fourteen days, written down in the migration and not here.
	it('leaves the deadline to the column default', async () => {
		const { supabase, queries } = createTableStandIn({ rows: [{ token: 'i'.repeat(32) }] });

		await createOrganizationInvite(supabase, {
			organizationId: 'organization-1',
			email: 'new.admin@example.org',
			role: 'member',
			invitedBy: 'user-1'
		});

		expect(queries[0].inserted?.[0]).not.toHaveProperty('expires_at');
	});

	// An insert is the write whose refusal comes back as an error rather than as
	// nothing changed, because there is no existing row for a policy to hide. The
	// page has a sentence to show either way.
	it('answers null when the database refuses the insert', async () => {
		const { supabase } = createTableStandIn({
			errorMessage: 'new row violates row-level security'
		});

		const token = await createOrganizationInvite(supabase, {
			organizationId: 'organization-1',
			email: 'new.admin@example.org',
			role: 'admin',
			invitedBy: 'user-1'
		});

		expect(token).toBeNull();
	});
});

describe('listPendingOrganizationInvites', () => {
	it('asks for this organisation’s unaccepted invitations, newest first', async () => {
		const { supabase, queries } = createTableStandIn({ rows: [pendingOrganizationInviteRow()] });

		await listPendingOrganizationInvites(supabase, 'organization-1');

		expect(queries[0].table).toBe('invites');
		expect(queries[0].eq).toContainEqual(['organization_id', 'organization-1']);
		expect(queries[0].eq).toContainEqual(['kind', 'organization_member']);
		// `is` is how PostgREST asks for a column holding nothing at all.
		expect(queries[0].is).toContainEqual(['accepted_at', null]);
		expect(queries[0].order).toContainEqual(['created_at', false]);
	});

	it('puts each row under the names the page uses', async () => {
		const { supabase } = createTableStandIn({ rows: [pendingOrganizationInviteRow()] });

		const invites = await listPendingOrganizationInvites(supabase, 'organization-1');

		expect(invites).toEqual([
			{
				id: 'invite-9',
				token: 'e'.repeat(32),
				email: 'new.admin@example.org',
				role: 'admin',
				expiresAt: '2026-10-03T10:00:00Z'
			}
		]);
	});

	// An expired invitation stays in the list and the page marks it as expired,
	// so the deadline is something the page reads rather than a filter here.
	it('does not filter out an invitation that has run out', async () => {
		const expired = pendingOrganizationInviteRow({ expires_at: '2020-01-01T00:00:00Z' });
		const { supabase } = createTableStandIn({ rows: [expired] });

		const invites = await listPendingOrganizationInvites(supabase, 'organization-1');

		expect(invites).toHaveLength(1);
	});

	it('raises when the query fails, because that is a fault and not a refusal', async () => {
		const { supabase } = createTableStandIn({ errorMessage: 'connection lost' });

		await expect(listPendingOrganizationInvites(supabase, 'organization-1')).rejects.toThrow(
			'connection lost'
		);
	});
});

describe('findPendingOrganizationInvite', () => {
	it('looks for one invitation to that address, lowercased', async () => {
		const { supabase, queries } = createTableStandIn({ rows: [pendingOrganizationInviteRow()] });

		await findPendingOrganizationInvite(supabase, 'organization-1', 'New.Admin@Example.ORG');

		expect(queries[0].eq).toContainEqual(['email', 'new.admin@example.org']);
		expect(queries[0].eq).toContainEqual(['kind', 'organization_member']);
		expect(queries[0].limit).toContain(1);
	});

	it('answers the invitation it found', async () => {
		const { supabase } = createTableStandIn({ rows: [pendingOrganizationInviteRow()] });

		const invite = await findPendingOrganizationInvite(
			supabase,
			'organization-1',
			'new.admin@example.org'
		);

		expect(invite?.id).toBe('invite-9');
	});

	it('answers null when nobody has been invited at that address', async () => {
		const { supabase } = createTableStandIn({ rows: [] });

		const invite = await findPendingOrganizationInvite(
			supabase,
			'organization-1',
			'nobody@example.org'
		);

		expect(invite).toBeNull();
	});
});

describe('listMyChairedCommittees', () => {
	/** One `committee_chairs` row with its committee and conference joined on. */
	function chairRow(committee: unknown) {
		return { committees: committee };
	}

	it('reads the reader’s own chair rows and names each committee and conference', async () => {
		const { supabase, queries } = createTableStandIn({
			rows: [
				chairRow({
					name: 'Security Council',
					slug: 'security-council',
					conferences: { slug: 'thimun-2027' }
				})
			]
		});

		const chairedCommittees = await listMyChairedCommittees(supabase, 'user-1');

		expect(queries[0].table).toBe('committee_chairs');
		expect(queries[0].eq).toEqual([['user_id', 'user-1']]);
		expect(chairedCommittees).toEqual([
			{
				committeeName: 'Security Council',
				committeeSlug: 'security-council',
				conferenceSlug: 'thimun-2027'
			}
		]);
	});

	it('leaves out a row whose committee or conference could not be read', async () => {
		const { supabase } = createTableStandIn({
			rows: [chairRow(null), chairRow({ name: 'GA', slug: 'ga', conferences: null })]
		});

		expect(await listMyChairedCommittees(supabase, 'user-1')).toEqual([]);
	});

	it('raises when the rows cannot be read', async () => {
		const { supabase } = createTableStandIn({ errorMessage: 'no connection' });

		await expect(listMyChairedCommittees(supabase, 'user-1')).rejects.toThrow('no connection');
	});
});
