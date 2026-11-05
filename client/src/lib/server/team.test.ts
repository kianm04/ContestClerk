import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	addCommitteeChair,
	findChairRole,
	listChairNamesByCommittee,
	listChairStaff,
	listCommitteeChairs,
	listPendingCommitteeChairInvites,
	listPublicTeam,
	loadTeam,
	readTeamRanks,
	removeCommitteeChair,
	removeStaff,
	setMemberRoles,
	updateStaffTitle
} from './team';

// These tests are about the decisions this module makes: which rows it asks
// for, what it does with the two answers it has to put together, and what it
// says when it is told nothing at all. Nothing here talks to a database; the
// stand-in client below writes down what it was asked for and answers with
// fixed rows. Whether the database really lets a reader see a team is Row Level
// Security's decision, and that is tested in `tests/db/`.

/** An error in the shape the real client reports one. */
type QueryError = { message: string; code?: string };

/** What one query the module sent was asking for. */
type RecordedQuery = {
	/** The relation `.from(...)` named. */
	table: string;
	eq: [string, unknown][];
	/** `[column, values]` for every `.in(...)`, which is how both lists look profiles up. */
	in: [string, unknown[]][];
	/** `[column, value]` for every `.is(...)`, which asks for a column holding nothing. */
	is: [string, unknown][];
	/** `[column, ascending]` for every `.order(...)`. */
	order: [string, boolean][];
	/** The rows `.insert(...)` was given, or `null` when the query added none. */
	inserted: Record<string, unknown>[] | null;
	/** The columns `.update(...)` was given, or `null` when the query changed nothing. */
	updated: Record<string, unknown> | null;
	/** `true` when the query removed rows rather than reading or changing them. */
	isDelete: boolean;
};

/** Everything the stand-in wrote down, in the order the module asked for it. */
type RecordedCalls = {
	queries: RecordedQuery[];
};

/** What the stand-in should answer with. Everything here has a harmless default. */
type StandInAnswers = {
	/** The rows each relation gives back. A relation with no entry gives back none. */
	rows?: Record<string, unknown[]>;
	/** The relations whose query fails, and the message each fails with. */
	errors?: Record<string, string>;
	/** The code each failing relation's error carries, such as `42501`. */
	errorCodes?: Record<string, string>;
};

/** What an awaited query answers with: a list of rows, or nothing and a message. */
type Answer = {
	data: unknown[] | null;
	error: QueryError | null;
};

/**
 * One step of a query. Every step hands the builder back, which is what lets
 * the next step be called on it.
 */
type QueryBuilder = {
	select: (columns?: string) => QueryBuilder;
	insert: (rows: Record<string, unknown> | Record<string, unknown>[]) => QueryBuilder;
	update: (columns: Record<string, unknown>) => QueryBuilder;
	delete: () => QueryBuilder;
	eq: (column: string, value: unknown) => QueryBuilder;
	in: (column: string, values: unknown[]) => QueryBuilder;
	is: (column: string, value: unknown) => QueryBuilder;
	order: (column: string, options: { ascending: boolean }) => QueryBuilder;
	limit: (count: number) => QueryBuilder;
	overrideTypes: () => Promise<Answer>;
	/** What makes a chain that is awaited without `overrideTypes` on the end work. */
	then: (resolve: (answer: Answer) => void) => void;
};

/**
 * A stand-in Supabase client that writes down what was asked of it.
 *
 * The real client is a builder: `.from(...)` gives back an object with
 * `.select(...)` on it, `.select(...)` one with `.eq(...)` on it, and so on.
 * Each step adds one condition to a query that is only sent once the chain is
 * awaited. This copies that shape: every step records its arguments and hands
 * the same builder back, and the awaited answer is whatever `answers` asked for
 * for that relation. A write answers the same way, because a write that asks
 * for what it changed with `.select(...)` gets its rows back exactly as a read
 * does, and a write that asks for nothing ignores them.
 */
function createStandInSupabase(answers: StandInAnswers = {}): {
	supabase: SupabaseClient;
	calls: RecordedCalls;
} {
	const calls: RecordedCalls = { queries: [] };

	function builderFor(table: string): QueryBuilder {
		const query: RecordedQuery = {
			table,
			eq: [],
			in: [],
			is: [],
			order: [],
			inserted: null,
			updated: null,
			isDelete: false
		};
		calls.queries.push(query);

		const message = answers.errors?.[table];
		const answer: Answer = {
			data: message ? null : (answers.rows?.[table] ?? []),
			error: message ? { message, code: answers.errorCodes?.[table] } : null
		};

		const builder: QueryBuilder = {
			// Which columns were asked for is not what these tests are about, so
			// `select` records nothing and only carries the chain on.
			select: () => builder,
			insert: (rows) => {
				query.inserted = Array.isArray(rows) ? rows : [rows];
				return builder;
			},
			update: (columns) => {
				query.updated = columns;
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
			in: (column, values) => {
				query.in.push([column, values]);
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
			// How many rows were asked for is not what these tests are about either.
			limit: () => builder,
			// In the real client `overrideTypes` changes the type of the answer and
			// not the answer itself, so here it is simply where the chain ends.
			overrideTypes: async () => answer,
			then: (resolve) => resolve(answer)
		};

		return builder;
	}

	/*
		A database function is called like a relation here: its name is recorded
		as the table, its arguments as `eq` conditions, and it answers with the
		rows given under its name.
	*/
	function rpc(name: string, args: Record<string, unknown>): QueryBuilder {
		const builder = builderFor(name);
		const query = calls.queries[calls.queries.length - 1];

		query.eq.push(...Object.entries(args));

		return builder;
	}

	const supabase = { from: builderFor, rpc };

	return { supabase: supabase as unknown as SupabaseClient, calls };
}

/** Where the module read its rows from, in the order it read them. */
function tablesRead(calls: RecordedCalls): string[] {
	return calls.queries.map((query) => query.table);
}

/** One membership as the chair staff query reads it: whose, and the role's scope and position. */
function chairMembership(userId: string, scope: 'conference' | 'committees', position: number) {
	return { user_id: userId, conference_roles: { scope, position } };
}

/** One `profiles` row, in the shape the lookup brings it back. */
function profileRow(id: string, fullName: string) {
	return { id, full_name: fullName, avatar_path: null };
}

/** One `conference_roles` row, in the shape the team page reads it. */
function roleRow(
	id: string,
	name: string,
	position: number,
	scope: 'conference' | 'committees' = 'conference',
	permissions: string[] = [],
	isPublic = false
) {
	return { id, name, position, scope, permissions, is_public: isPublic };
}

/** The three presets every conference starts with, in the conference's order. */
const ROLE_ROWS = [
	roleRow('role-organiser', 'Organiser', 0, 'conference', ['administrator'], true),
	roleRow('role-chair', 'Chair', 1, 'committees', ['run_room'], true),
	roleRow('role-volunteer', 'Volunteer', 2)
];

/** One `conference_role_members` row, as `loadTeam` reads it: who holds which role. */
function memberRow(userId: string, roleId: string) {
	return { user_id: userId, role_id: roleId };
}

/**
 * One `conference_role_members` row of the public team query, with the role
 * along: `role_id` points at `conference_roles`, so PostgREST brings it back.
 */
function publicMemberRow(userId: string, role: { name: string; position: number }) {
	return { user_id: userId, conference_roles: { ...role, is_public: true } };
}

const ORGANISER = { name: 'Organiser', position: 0 };
const CHAIR = { name: 'Chair', position: 1 };

describe('listPublicTeam', () => {
	it("asks only for the holders of this conference's public roles", async () => {
		const { supabase, calls } = createStandInSupabase();

		await listPublicTeam(supabase, 'conference-1');

		// A volunteer helps on the day and is not on the public list: the presets
		// mark Organiser and Chair public and Volunteer not, so the filter asks
		// for the public roles rather than leaving them all in.
		expect(tablesRead(calls)).toEqual(['conference_role_members']);
		expect(calls.queries[0].eq).toEqual([
			['conference_id', 'conference-1'],
			['conference_roles.is_public', true]
		]);
	});

	it("puts the roles in the conference's order, and sorts each by name", async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				conference_role_members: [
					publicMemberRow('user-1', CHAIR),
					publicMemberRow('user-2', ORGANISER),
					publicMemberRow('user-3', CHAIR)
				],
				conference_staff: [
					{ user_id: 'user-1', title: 'Chair' },
					{ user_id: 'user-2', title: 'Secretary General' },
					{ user_id: 'user-3', title: 'Vice Chair' }
				],
				profiles: [
					profileRow('user-1', 'Zoe Adams'),
					profileRow('user-2', 'Maya Okonjo'),
					profileRow('user-3', 'Ana Bauer')
				]
			}
		});

		const team = await listPublicTeam(supabase, 'conference-1');

		// The roles' `position` is the organiser's own order; the names are ours.
		expect(team.map((member) => member.fullName)).toEqual([
			'Maya Okonjo',
			'Ana Bauer',
			'Zoe Adams'
		]);
		expect(team[0].roleName).toBe('Organiser');
		expect(team[0].title).toBe('Secretary General');
		expect(team[2].title).toBe('Chair');
	});

	it('lists somebody holding two public roles once, under the higher one', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				conference_role_members: [
					publicMemberRow('user-1', CHAIR),
					publicMemberRow('user-1', ORGANISER)
				],
				profiles: [profileRow('user-1', 'Maya Okonjo')]
			}
		});

		const team = await listPublicTeam(supabase, 'conference-1');

		expect(team).toHaveLength(1);
		expect(team[0].roleName).toBe('Organiser');
	});

	it('looks the names and the titles up in two more queries, because the memberships carry neither', async () => {
		const { supabase, calls } = createStandInSupabase({
			rows: {
				conference_role_members: [publicMemberRow('user-1', ORGANISER)],
				profiles: [profileRow('user-1', 'Maya Okonjo')]
			}
		});

		await listPublicTeam(supabase, 'conference-1');

		// `conference_role_members.user_id` points at `auth.users`, not at
		// `profiles`, so the name cannot come along; and the title is on the
		// staff row, which the membership does not point at either.
		expect(tablesRead(calls)).toEqual(['conference_role_members', 'profiles', 'conference_staff']);
		expect(calls.queries[1].in).toEqual([['id', ['user-1']]]);
		expect(calls.queries[2].eq).toEqual([['conference_id', 'conference-1']]);
		expect(calls.queries[2].in).toEqual([['user_id', ['user-1']]]);
	});

	it('leaves off somebody whose profile did not come back', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				conference_role_members: [
					publicMemberRow('user-1', ORGANISER),
					publicMemberRow('user-2', CHAIR)
				],
				profiles: [profileRow('user-1', 'Maya Okonjo')]
			}
		});

		const team = await listPublicTeam(supabase, 'conference-1');

		// A row with no name in it is worse than no row at all.
		expect(team.map((member) => member.userId)).toEqual(['user-1']);
	});

	it('keeps the names when the titles could not be read', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				conference_role_members: [publicMemberRow('user-1', ORGANISER)],
				profiles: [profileRow('user-1', 'Maya Okonjo')]
			},
			errors: { conference_staff: 'permission denied for table conference_staff' }
		});

		const team = await listPublicTeam(supabase, 'conference-1');

		// A name with no title under it is still worth showing.
		expect(team).toEqual([
			{
				userId: 'user-1',
				fullName: 'Maya Okonjo',
				avatarPath: null,
				roleName: 'Organiser',
				title: null
			}
		]);
	});

	it('answers with an empty team rather than an error when the query is refused', async () => {
		const { supabase } = createStandInSupabase({
			errors: { conference_role_members: 'permission denied for table conference_role_members' }
		});

		// A team nobody may read and a team that is empty look the same to the
		// page on purpose: both hide the section.
		expect(await listPublicTeam(supabase, 'conference-1')).toEqual([]);
	});

	it('answers with an empty team when the names could not be read', async () => {
		const { supabase } = createStandInSupabase({
			rows: { conference_role_members: [publicMemberRow('user-1', ORGANISER)] },
			errors: { profiles: 'permission denied for table profiles' }
		});

		expect(await listPublicTeam(supabase, 'conference-1')).toEqual([]);
	});
});

describe('listCommitteeChairs', () => {
	it('asks for the chairs of this one committee and names them', async () => {
		const { supabase, calls } = createStandInSupabase({
			rows: {
				committee_chairs: [{ user_id: 'user-1', title: 'Chair' }],
				profiles: [profileRow('user-1', 'Maya Okonjo')]
			}
		});

		const chairs = await listCommitteeChairs(supabase, 'committee-1');

		expect(calls.queries[0].table).toBe('committee_chairs');
		expect(calls.queries[0].eq).toEqual([['committee_id', 'committee-1']]);
		expect(chairs).toEqual([
			{ userId: 'user-1', fullName: 'Maya Okonjo', avatarPath: null, title: 'Chair' }
		]);
	});

	it('sorts the chairs by name', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				committee_chairs: [
					{ user_id: 'user-1', title: 'Chair' },
					{ user_id: 'user-2', title: 'Vice Chair' }
				],
				profiles: [profileRow('user-1', 'Zoe Adams'), profileRow('user-2', 'Ana Bauer')]
			}
		});

		const chairs = await listCommitteeChairs(supabase, 'committee-1');

		expect(chairs.map((chair) => chair.fullName)).toEqual(['Ana Bauer', 'Zoe Adams']);
	});

	it('leaves off somebody whose profile did not come back', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				committee_chairs: [
					{ user_id: 'user-1', title: 'Chair' },
					{ user_id: 'user-2', title: 'Vice Chair' }
				],
				profiles: [profileRow('user-2', 'Ana Bauer')]
			}
		});

		const chairs = await listCommitteeChairs(supabase, 'committee-1');

		expect(chairs.map((chair) => chair.userId)).toEqual(['user-2']);
	});

	it('answers with an empty list rather than an error when the query is refused', async () => {
		const { supabase } = createStandInSupabase({
			errors: { committee_chairs: 'permission denied for table committee_chairs' }
		});

		expect(await listCommitteeChairs(supabase, 'committee-1')).toEqual([]);
	});

	it('answers with an empty list for a signed-out visitor, who may not read profiles', async () => {
		const { supabase } = createStandInSupabase({
			rows: { committee_chairs: [{ user_id: 'user-1', title: 'Chair' }] },
			errors: { profiles: 'permission denied for table profiles' }
		});

		// Anybody who can see the committee can see its chair rows, but only
		// somebody signed in can read the names on them, and a chair with no name
		// is not worth showing.
		expect(await listCommitteeChairs(supabase, 'committee-1')).toEqual([]);
	});
});

describe('listChairNamesByCommittee', () => {
	it('asks about every committee at once and sorts each one by name', async () => {
		const { supabase, calls } = createStandInSupabase({
			rows: {
				committee_chairs: [
					{ committee_id: 'committee-1', user_id: 'user-1' },
					{ committee_id: 'committee-2', user_id: 'user-2' },
					{ committee_id: 'committee-1', user_id: 'user-3' }
				],
				profiles: [
					profileRow('user-1', 'Bo Chen'),
					profileRow('user-2', 'Daniel Park'),
					profileRow('user-3', 'Ana Bauer')
				]
			}
		});

		const names = await listChairNamesByCommittee(supabase, ['committee-1', 'committee-2']);

		// Two queries for the whole page, however many committees are on it.
		expect(tablesRead(calls)).toEqual(['committee_chairs', 'profiles']);
		expect(calls.queries[0].in).toEqual([['committee_id', ['committee-1', 'committee-2']]]);
		// Sorted by name, the way `listCommitteeChairs` sorts its chairs, so the
		// two never put the same people in a different order.
		expect(names.get('committee-1')).toEqual(['Ana Bauer', 'Bo Chen']);
		expect(names.get('committee-2')).toEqual(['Daniel Park']);
	});

	it('sends nothing at all when there are no committees to ask about', async () => {
		const { supabase, calls } = createStandInSupabase();

		expect(await listChairNamesByCommittee(supabase, [])).toEqual(new Map());
		expect(tablesRead(calls)).toEqual([]);
	});

	it('leaves out a committee whose chairs it cannot name', async () => {
		const { supabase } = createStandInSupabase({
			rows: { committee_chairs: [{ committee_id: 'committee-1', user_id: 'user-1' }] }
		});

		const names = await listChairNamesByCommittee(supabase, ['committee-1']);

		// A chair whose profile did not come back would be a name-less name, so the
		// committee reads as one with no chairs rather than one with a blank.
		expect(names.get('committee-1')).toBeUndefined();
	});

	it('answers with no names rather than failing when the chairs cannot be read', async () => {
		const { supabase } = createStandInSupabase({
			errors: { committee_chairs: 'permission denied for table committee_chairs' }
		});

		expect(await listChairNamesByCommittee(supabase, ['committee-1'])).toEqual(new Map());
	});
});

// -----------------------------------------------------------------------------
// The organiser's team page
// -----------------------------------------------------------------------------
// `loadTeam` puts six tables together into one list, and the writes below it
// each change one row. The stand-in above grew a few steps for them — `.order`,
// `.is`, `.insert`, `.update`, `.delete` — and answers a write with the rows it
// was asked for the same way it answers a read. As above, nothing here talks to
// a database: whether the policies really let an organiser read or write any of
// this is Row Level Security's decision, and that is tested in `tests/db/`.

/** The first query the module sent to one relation, so a test can read its conditions back. */
function queryOn(calls: RecordedCalls, table: string): RecordedQuery {
	const query = calls.queries.find((sent) => sent.table === table);

	if (!query) {
		throw new Error(`Nothing was ever sent to "${table}"`);
	}

	return query;
}

/** One `committees` row in the shape the team page reads it. */
function committeeRow(id: string, name: string, abbreviation: string | null) {
	return { id, name, abbreviation };
}

/** One pending `invites` row, in the shape the team page reads it. */
function pendingInviteRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'invite-1',
		token: 'a'.repeat(32),
		email: 'new.chair@example.org',
		role_id: 'role-chair',
		conference_roles: { name: 'Chair' },
		committee_id: null,
		title: null,
		expires_at: '2026-10-03T10:00:00Z',
		...changes
	};
}

describe('loadTeam', () => {
	it('reads the five lists the page shows and names everybody in one lookup', async () => {
		const { supabase, calls } = createStandInSupabase({
			rows: {
				list_conference_owners: [{ user_id: 'user-1', organization_role: 'owner' }],
				conference_staff: [{ user_id: 'user-2', title: 'Chair' }],
				committees: [committeeRow('committee-1', 'Security Council', 'UNSC')],
				committee_chairs: [{ committee_id: 'committee-1', user_id: 'user-2' }],
				conference_roles: ROLE_ROWS,
				conference_role_members: [memberRow('user-2', 'role-chair')],
				invites: [pendingInviteRow()],
				profiles: [profileRow('user-1', 'Maya Okonjo'), profileRow('user-2', 'Ana Bauer')]
			}
		});

		const team = await loadTeam(supabase, 'conference-1');

		expect(queryOn(calls, 'list_conference_owners').eq).toEqual([
			['conference_id', 'conference-1']
		]);
		expect(queryOn(calls, 'conference_staff').eq).toEqual([['conference_id', 'conference-1']]);
		expect(queryOn(calls, 'conference_roles').eq).toEqual([['conference_id', 'conference-1']]);
		// The roles in the organiser's own order, the name deciding between two
		// that share a position.
		expect(queryOn(calls, 'conference_roles').order).toEqual([
			['position', true],
			['name', true]
		]);
		expect(queryOn(calls, 'conference_role_members').eq).toEqual([
			['conference_id', 'conference-1']
		]);
		// One lookup for both halves of the list, rather than one each.
		expect(queryOn(calls, 'profiles').in).toEqual([['id', ['user-1', 'user-2']]]);
		expect(team.committees).toEqual([committeeRow('committee-1', 'Security Council', 'UNSC')]);
		expect(team.roles).toEqual([
			{
				id: 'role-organiser',
				name: 'Organiser',
				position: 0,
				scope: 'conference',
				isPublic: true,
				isAdministrator: true
			},
			{
				id: 'role-chair',
				name: 'Chair',
				position: 1,
				scope: 'committees',
				isPublic: true,
				isAdministrator: false
			},
			{
				id: 'role-volunteer',
				name: 'Volunteer',
				position: 2,
				scope: 'conference',
				isPublic: false,
				isAdministrator: false
			}
		]);
	});

	it('puts the organisation first, then the staff, and says where each came from', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				list_conference_owners: [
					{ user_id: 'user-1', organization_role: 'owner' },
					{ user_id: 'user-2', organization_role: 'admin' }
				],
				conference_staff: [{ user_id: 'user-3', title: null }],
				conference_roles: ROLE_ROWS,
				conference_role_members: [memberRow('user-3', 'role-volunteer')],
				profiles: [
					profileRow('user-1', 'Zoe Adams'),
					profileRow('user-2', 'Ana Bauer'),
					profileRow('user-3', 'Bo Chen')
				]
			}
		});

		const team = await loadTeam(supabase, 'conference-1');

		// The people who run every conference above the people brought in for this
		// one, each group sorted by name.
		expect(team.people.map((person) => person.fullName)).toEqual([
			'Ana Bauer',
			'Zoe Adams',
			'Bo Chen'
		]);
		expect(team.people.map((person) => person.source)).toEqual([
			'organization',
			'organization',
			'staff'
		]);
		// An organisation member has an organisation role and no conference
		// roles; a staff member has conference roles and no organisation role.
		expect(team.people[0].organizationRole).toBe('admin');
		expect(team.people[0].roles).toEqual([]);
		expect(team.people[2].organizationRole).toBeNull();
		expect(team.people[2].roles.map((role) => role.name)).toEqual(['Volunteer']);
	});

	it('shows somebody who is both an organisation member and staff once', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				list_conference_owners: [{ user_id: 'user-1', organization_role: 'admin' }],
				conference_staff: [{ user_id: 'user-1', title: 'Secretary General' }],
				conference_roles: ROLE_ROWS,
				conference_role_members: [memberRow('user-1', 'role-organiser')],
				profiles: [profileRow('user-1', 'Maya Okonjo')]
			}
		});

		const team = await loadTeam(supabase, 'conference-1');

		// As their organisation row (T175): they run the conference through the
		// organisation, so the staff row the committee editor's "Chair it
		// yourself" may have added is not a second person, and the roles on it
		// are not what their row says.
		expect(team.people).toHaveLength(1);
		expect(team.people[0].source).toBe('organization');
		expect(team.people[0].organizationRole).toBe('admin');
		expect(team.people[0].roles).toEqual([]);
		// Their staff row's title is still what the team calls them.
		expect(team.people[0].title).toBe('Secretary General');
	});

	it("lists the roles somebody holds in the conference's order", async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				conference_staff: [{ user_id: 'user-1', title: null }],
				conference_roles: ROLE_ROWS,
				conference_role_members: [
					memberRow('user-1', 'role-chair'),
					memberRow('user-1', 'role-organiser')
				],
				profiles: [profileRow('user-1', 'Ana Bauer')]
			}
		});

		const team = await loadTeam(supabase, 'conference-1');

		// The rows came back the other way round; the order is the organiser's.
		expect(team.people[0].roles.map((role) => role.name)).toEqual(['Organiser', 'Chair']);
	});

	it('gives a staff member who holds no role an empty list', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				conference_staff: [{ user_id: 'user-1', title: null }],
				conference_roles: ROLE_ROWS,
				profiles: [profileRow('user-1', 'Ana Bauer')]
			}
		});

		const team = await loadTeam(supabase, 'conference-1');

		expect(team.people[0].roles).toEqual([]);
	});

	it('hangs the committees somebody chairs on their row, in the picker order', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				conference_staff: [{ user_id: 'user-1', title: null }],
				conference_roles: ROLE_ROWS,
				conference_role_members: [memberRow('user-1', 'role-chair')],
				committees: [
					committeeRow('committee-1', 'Security Council', 'UNSC'),
					committeeRow('committee-2', 'Economic and Social Council', 'ECOSOC')
				],
				committee_chairs: [
					{ committee_id: 'committee-2', user_id: 'user-1' },
					{ committee_id: 'committee-1', user_id: 'user-1' }
				],
				profiles: [profileRow('user-1', 'Ana Bauer')]
			}
		});

		const team = await loadTeam(supabase, 'conference-1');

		// The rows came back the other way round; the order is the organiser's.
		expect(team.people[0].committees.map((committee) => committee.abbreviation)).toEqual([
			'UNSC',
			'ECOSOC'
		]);
	});

	it('names the committee an invitation points at from the ones it already has', async () => {
		const { supabase, calls } = createStandInSupabase({
			rows: {
				committees: [committeeRow('committee-1', 'Security Council', 'UNSC')],
				invites: [pendingInviteRow({ committee_id: 'committee-1' })]
			}
		});

		const team = await loadTeam(supabase, 'conference-1');

		expect(team.pendingInvites[0].committeeName).toBe('Security Council');
		expect(team.pendingInvites[0].roleName).toBe('Chair');
		// The name was not asked for a second time.
		expect(calls.queries.filter((query) => query.table === 'committees')).toHaveLength(1);
	});

	it('shows the staff on their own when the organisation’s owners cannot be read', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				conference_staff: [{ user_id: 'user-1', title: null }],
				profiles: [profileRow('user-1', 'Maya Okonjo')]
			},
			errors: { list_conference_owners: 'no connection' }
		});

		const team = await loadTeam(supabase, 'conference-1');

		// The page is still useful without the rows at the top, so this is not
		// worth an error page.
		expect(team.people.map((person) => person.userId)).toEqual(['user-1']);
	});

	it('leaves off somebody whose profile did not come back', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				conference_staff: [
					{ user_id: 'user-1', title: null },
					{ user_id: 'user-2', title: null }
				],
				profiles: [profileRow('user-1', 'Maya Okonjo')]
			}
		});

		const team = await loadTeam(supabase, 'conference-1');

		expect(team.people.map((person) => person.userId)).toEqual(['user-1']);
	});

	it('raises when the team itself cannot be read', async () => {
		const { supabase } = createStandInSupabase({
			errors: { conference_staff: 'no connection' }
		});

		// Only somebody who can manage the conference opens this page, and they may
		// read the whole team, so a failure here is a fault rather than a rule.
		await expect(loadTeam(supabase, 'conference-1')).rejects.toThrow('no connection');
	});

	it('raises when the roles cannot be read, for the same reason', async () => {
		const { supabase } = createStandInSupabase({
			errors: { conference_roles: 'no connection' }
		});

		await expect(loadTeam(supabase, 'conference-1')).rejects.toThrow('no connection');
	});
});

describe('setMemberRoles', () => {
	it('hands the whole set to set_member_roles', async () => {
		const { supabase, calls } = createStandInSupabase();

		expect(
			await setMemberRoles(supabase, 'conference-1', 'user-1', ['role-chair', 'role-press'])
		).toBe(true);
		expect(queryOn(calls, 'set_member_roles').eq).toEqual([
			['conference_id', 'conference-1'],
			['user_id', 'user-1'],
			['role_ids', ['role-chair', 'role-press']]
		]);
	});

	it('answers no when the rank rule refuses', async () => {
		const { supabase } = createStandInSupabase({
			errors: { set_member_roles: 'You can only take off roles below your own.' },
			errorCodes: { set_member_roles: '42501' }
		});

		expect(await setMemberRoles(supabase, 'conference-1', 'user-1', [])).toBe(false);
	});

	it('raises any other failure', async () => {
		const { supabase } = createStandInSupabase({ errors: { set_member_roles: 'no connection' } });

		await expect(setMemberRoles(supabase, 'conference-1', 'user-1', [])).rejects.toThrow(
			'no connection'
		);
	});
});

describe('updateStaffTitle', () => {
	it('writes the title', async () => {
		const { supabase, calls } = createStandInSupabase({
			rows: { conference_staff: [{ user_id: 'user-1' }] }
		});

		expect(await updateStaffTitle(supabase, 'conference-1', 'user-1', 'Secretary General')).toBe(
			true
		);
		expect(queryOn(calls, 'conference_staff').updated).toEqual({ title: 'Secretary General' });
	});

	it('clears the title with nothing rather than with empty text', async () => {
		const { supabase, calls } = createStandInSupabase({
			rows: { conference_staff: [{ user_id: 'user-1' }] }
		});

		await updateStaffTitle(supabase, 'conference-1', 'user-1', null);

		expect(queryOn(calls, 'conference_staff').updated).toEqual({ title: null });
	});

	it('answers no when nothing came back', async () => {
		const { supabase } = createStandInSupabase();

		expect(await updateStaffTitle(supabase, 'conference-1', 'user-1', 'Chair')).toBe(false);
	});
});

describe('removeStaff', () => {
	it('deletes the one staff row', async () => {
		const { supabase, calls } = createStandInSupabase({
			rows: { conference_staff: [{ user_id: 'user-1' }] }
		});

		expect(await removeStaff(supabase, 'conference-1', 'user-1')).toBe(true);

		const query = queryOn(calls, 'conference_staff');

		expect(query.isDelete).toBe(true);
		expect(query.eq).toEqual([
			['conference_id', 'conference-1'],
			['user_id', 'user-1']
		]);
	});

	it('answers no when nothing came back', async () => {
		const { supabase } = createStandInSupabase();

		expect(await removeStaff(supabase, 'conference-1', 'user-1')).toBe(false);
	});
});

describe('addCommitteeChair', () => {
	it('adds the row and leaves the title to the column default', async () => {
		const { supabase, calls } = createStandInSupabase({
			rows: { committee_chairs: [{ committee_id: 'committee-1' }] }
		});

		expect(await addCommitteeChair(supabase, 'committee-1', 'user-1')).toBe('added');

		const inserted = queryOn(calls, 'committee_chairs').inserted ?? [];

		// No `title`: the column writes "Chair" on its own.
		expect(inserted).toEqual([{ committee_id: 'committee-1', user_id: 'user-1' }]);
		// `toEqual` above would also accept a `title` key holding nothing, and that
		// is not the same row: the default is only written when the insert leaves
		// the column out altogether, so the keys themselves are checked.
		expect(Object.keys(inserted[0])).toEqual(['committee_id', 'user_id']);
	});

	it('writes the title the committee editor was given', async () => {
		const { supabase, calls } = createStandInSupabase({
			rows: { committee_chairs: [{ committee_id: 'committee-1' }] }
		});

		expect(await addCommitteeChair(supabase, 'committee-1', 'user-1', 'Vice Chair')).toBe('added');
		expect(queryOn(calls, 'committee_chairs').inserted).toEqual([
			{ committee_id: 'committee-1', user_id: 'user-1', title: 'Vice Chair' }
		]);
	});

	it('tells somebody who already chairs the committee by the primary key refusing a second row', async () => {
		const { supabase } = createStandInSupabase({
			errors: { committee_chairs: 'duplicate key value violates unique constraint' },
			errorCodes: { committee_chairs: '23505' }
		});

		expect(await addCommitteeChair(supabase, 'committee-1', 'user-1')).toBe('already-chairs');
	});

	it('answers refused rather than raising when the policy or the team trigger refuses', async () => {
		const { supabase } = createStandInSupabase({
			errors: { committee_chairs: 'new row violates row-level security policy' },
			errorCodes: { committee_chairs: '42501' }
		});

		// An insert is the one write a refusal comes back from as an error. This is
		// the rank rule of security review L5, which a page can explain.
		expect(await addCommitteeChair(supabase, 'committee-1', 'user-1')).toBe('refused');
	});

	it('raises on any other error, which is a fault and not a rule', async () => {
		const { supabase } = createStandInSupabase({
			errors: { committee_chairs: 'no connection' }
		});

		await expect(addCommitteeChair(supabase, 'committee-1', 'user-1')).rejects.toThrow(
			'no connection'
		);
	});

	it('answers refused when nothing came back', async () => {
		const { supabase } = createStandInSupabase();

		expect(await addCommitteeChair(supabase, 'committee-1', 'user-1')).toBe('refused');
	});
});

describe('removeCommitteeChair', () => {
	it('deletes the one chair row', async () => {
		const { supabase, calls } = createStandInSupabase({
			rows: { committee_chairs: [{ committee_id: 'committee-1' }] }
		});

		expect(await removeCommitteeChair(supabase, 'committee-1', 'user-1')).toBe(true);

		const query = queryOn(calls, 'committee_chairs');

		expect(query.isDelete).toBe(true);
		expect(query.eq).toEqual([
			['committee_id', 'committee-1'],
			['user_id', 'user-1']
		]);
	});

	it('answers no when nothing came back', async () => {
		const { supabase } = createStandInSupabase();

		expect(await removeCommitteeChair(supabase, 'committee-1', 'user-1')).toBe(false);
	});
});

describe('readTeamRanks', () => {
	it("ranks everybody by their highest role of any kind, and an organisation's owner at -1", async () => {
		const { supabase, calls } = createStandInSupabase({
			rows: {
				conference_role_members: [
					chairMembership('user-1', 'committees', 2),
					chairMembership('user-1', 'conference', 1),
					chairMembership('user-2', 'committees', 2),
					// An owner who also holds the Chair role still ranks above everybody.
					chairMembership('user-owner', 'committees', 2)
				],
				list_conference_owners: [{ user_id: 'user-owner', organization_role: 'owner' }]
			}
		});

		const ranks = await readTeamRanks(supabase, 'conference-1');

		expect(tablesRead(calls)).toEqual(['conference_role_members', 'list_conference_owners']);
		expect(calls.queries[0].eq).toEqual([['conference_id', 'conference-1']]);
		expect([...ranks]).toEqual([
			['user-1', 1],
			['user-2', 2],
			['user-owner', -1]
		]);
	});
});

describe('listChairStaff', () => {
	it('names the holders of a role that works per committee, sorted by name, with their ranks', async () => {
		const { supabase, calls } = createStandInSupabase({
			rows: {
				conference_role_members: [
					chairMembership('user-1', 'committees', 2),
					chairMembership('user-2', 'committees', 2),
					// A volunteer is no use to a chair picker.
					chairMembership('user-3', 'conference', 4)
				],
				conference_staff: [{ user_id: 'user-2', title: 'Deputy Chair' }],
				profiles: [profileRow('user-1', 'Zoe Adams'), profileRow('user-2', 'Ana Bauer')]
			}
		});

		const chairStaff = await listChairStaff(supabase, 'conference-1');

		// The memberships and the organisation's owners first, together; the names
		// and the staff titles come from two more lookups, the memberships
		// carrying neither.
		expect(tablesRead(calls)).toEqual([
			'conference_role_members',
			'list_conference_owners',
			'profiles',
			'conference_staff'
		]);
		expect(calls.queries[0].eq).toEqual([['conference_id', 'conference-1']]);
		expect(chairStaff).toEqual([
			{ userId: 'user-2', fullName: 'Ana Bauer', title: 'Deputy Chair', rank: 2 },
			{ userId: 'user-1', fullName: 'Zoe Adams', title: null, rank: 2 }
		]);
	});

	it("ranks somebody by their highest role of any kind, and an organisation's owner at -1", async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				conference_role_members: [
					chairMembership('user-1', 'committees', 2),
					// The same person is also the Head of Logistics, the second role.
					chairMembership('user-1', 'conference', 1),
					chairMembership('user-owner', 'committees', 2)
				],
				list_conference_owners: [{ user_id: 'user-owner', organization_role: 'owner' }],
				profiles: [profileRow('user-1', 'Ana Bauer'), profileRow('user-owner', 'Ines Duarte')]
			}
		});

		const chairStaff = await listChairStaff(supabase, 'conference-1');

		expect(chairStaff.map((member) => [member.userId, member.rank])).toEqual([
			['user-1', 1],
			['user-owner', -1]
		]);
	});

	it('offers somebody holding two such roles once', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				conference_role_members: [
					chairMembership('user-1', 'committees', 2),
					chairMembership('user-1', 'committees', 3)
				],
				profiles: [profileRow('user-1', 'Ana Bauer')]
			}
		});

		const chairStaff = await listChairStaff(supabase, 'conference-1');

		expect(chairStaff.map((member) => member.userId)).toEqual(['user-1']);
	});

	it('leaves out somebody whose profile did not come back', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				conference_role_members: [
					chairMembership('user-1', 'committees', 2),
					chairMembership('user-2', 'committees', 2)
				],
				profiles: [profileRow('user-2', 'Ana Bauer')]
			}
		});

		const chairStaff = await listChairStaff(supabase, 'conference-1');

		// A choice with no name on it is worse than one choice fewer.
		expect(chairStaff.map((member) => member.userId)).toEqual(['user-2']);
	});

	it('looks up no names when the conference has no chairs yet', async () => {
		const { supabase, calls } = createStandInSupabase();

		expect(await listChairStaff(supabase, 'conference-1')).toEqual([]);
		expect(tablesRead(calls)).toEqual(['conference_role_members', 'list_conference_owners']);
	});

	it('raises when the memberships cannot be read, because only an organiser opens this page', async () => {
		const { supabase } = createStandInSupabase({
			errors: { conference_role_members: 'no connection' }
		});

		await expect(listChairStaff(supabase, 'conference-1')).rejects.toThrow('no connection');
	});
});

describe('findChairRole', () => {
	it("asks for the first of this conference's roles that works per committee", async () => {
		const { supabase, calls } = createStandInSupabase({
			rows: { conference_roles: [ROLE_ROWS[1]] }
		});

		const role = await findChairRole(supabase, 'conference-1');

		expect(tablesRead(calls)).toEqual(['conference_roles']);
		expect(calls.queries[0].eq).toEqual([
			['conference_id', 'conference-1'],
			['scope', 'committees']
		]);
		expect(calls.queries[0].order).toEqual([
			['position', true],
			['name', true]
		]);
		expect(role).toEqual({
			id: 'role-chair',
			name: 'Chair',
			position: 1,
			scope: 'committees',
			isPublic: true,
			isAdministrator: false
		});
	});

	it('answers nothing when the conference has no such role', async () => {
		const { supabase } = createStandInSupabase();

		expect(await findChairRole(supabase, 'conference-1')).toBeNull();
	});

	it('raises when the roles cannot be read', async () => {
		const { supabase } = createStandInSupabase({ errors: { conference_roles: 'no connection' } });

		await expect(findChairRole(supabase, 'conference-1')).rejects.toThrow('no connection');
	});
});

describe('listPendingCommitteeChairInvites', () => {
	it("asks for this committee's staff invitations nobody has accepted, oldest first", async () => {
		const { supabase, calls } = createStandInSupabase({
			rows: {
				invites: [
					{
						id: 'invite-1',
						token: 'a'.repeat(32),
						email: 'aiko@example.com',
						expires_at: '2030-01-08T00:00:00Z'
					}
				]
			}
		});

		const invites = await listPendingCommitteeChairInvites(supabase, 'committee-1');

		// The committee editor's "Waiting to accept" (T175): an organisation
		// invitation never names a committee, but `kind` is asked for all the same,
		// so that the list is only ever chair invitations to this committee.
		expect(tablesRead(calls)).toEqual(['invites']);
		expect(calls.queries[0].eq).toEqual([
			['committee_id', 'committee-1'],
			['kind', 'conference_staff']
		]);
		expect(calls.queries[0].is).toEqual([['accepted_at', null]]);
		expect(calls.queries[0].order).toEqual([['created_at', true]]);
		expect(invites).toEqual([
			{
				id: 'invite-1',
				token: 'a'.repeat(32),
				email: 'aiko@example.com',
				expiresAt: '2030-01-08T00:00:00Z'
			}
		]);
	});

	it('raises when the query fails, because only an organiser opens this page', async () => {
		const { supabase } = createStandInSupabase({ errors: { invites: 'no connection' } });

		await expect(listPendingCommitteeChairInvites(supabase, 'committee-1')).rejects.toThrow(
			'no connection'
		);
	});
});
