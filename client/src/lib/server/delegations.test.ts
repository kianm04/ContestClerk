import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	delegationInvoiceSummary,
	EMPTY_DELEGATION_STATUS_COUNTS,
	type DelegationListQuery
} from '$lib/delegations';
import {
	assignDelegationSeat,
	countDelegationMembers,
	countDelegationSeats,
	createDelegation,
	findConferenceIdBySlug,
	findMyDelegationSeat,
	findMyRouteIntoConference,
	getDelegationByJoinCode,
	getDelegationForMember,
	getDelegationForOrganiser,
	getMyDelegationFor,
	joinDelegation,
	listDelegationInvoices,
	listDelegationMembers,
	listDelegationSeats,
	listDelegationsForOrganiser,
	listMyDelegationMemberships,
	readMemberName,
	rejectDelegation,
	removeDelegationMember,
	saveDelegationDecisionNote,
	setDelegationMemberRole,
	setDelegationStatus,
	summariseDelegations,
	unassignDelegationSeat,
	UNKNOWN_MEMBER_NAME,
	updateDelegationDetails,
	updateDelegationInternalNote
} from './delegations';
import { removeOrphanedDocumentFiles } from './orphaned-document-files';

// Emptying a seat ends by removing the position paper's file, which talks to
// Storage with the service role key. These tests only check that it is asked
// for, so it is replaced with a stand-in that does nothing.
vi.mock('./orphaned-document-files', () => ({ removeOrphanedDocumentFiles: vi.fn() }));

// These tests are about the requests this module builds: which relation or
// database function each one asks for, which conditions end up on the query,
// what it makes of the answer, and what it makes of an answer it was refused.
// Nothing here talks to a database; the stand-in client below writes down what
// it was asked for and answers with fixed rows. Whether the database really
// lets somebody read a delegation, and what its functions really refuse, is
// Row Level Security's decision and is tested in `tests/db/delegations.test.ts`.

/** An error in the shape the real client reports one. */
type QueryError = { message: string };

/** What one query was asking for. */
type RecordedQuery = {
	/** The relation `.from(...)` named. */
	table: string;
	/** The columns `.select(...)` was given. */
	columns: string;
	/** The second argument of `.select(...)`, which is where `count` and `head` go. */
	options: unknown;
	eq: [string, unknown][];
	/** `[column, values]` for every `.in(...)`, which asks for a column to be one of several. */
	in: [string, unknown[]][];
	/** `[column, value]` for every `.neq(...)`, which asks for a column to be anything else. */
	neq: [string, unknown][];
	/** `[column, ascending]` for every `.order(...)`. */
	order: [string, boolean][];
	/** The whole options object of every `.order(...)`, which is where `nullsFirst` goes. */
	orderOptions: { ascending: boolean; nullsFirst?: boolean }[];
	/** The text of every `.or(...)`, which is one condition or another in Supabase's filter language. */
	or: string[];
	/** `[firstIndex, lastIndex]` for every `.range(...)`, which asks for one window of rows. */
	range: [number, number][];
	/** What `.update(...)` was given, or `null` when the query only read. */
	update: Record<string, unknown> | null;
	/** What `.upsert(...)` was given, or `null` when the query made or changed no row that way. */
	upsert: Record<string, unknown> | null;
	/** True once `.delete()` has been called, which is what tells a removal from a read. */
	isDelete: boolean;
};

/** One call to a database function by name. */
type RecordedRpc = { name: string; args: unknown };

/** What the stand-in should answer with for one relation. Everything has a default. */
type TableAnswer = {
	/** The row a `maybeSingle()` chain finds, or nothing when there is none. */
	row?: unknown;
	/** The rows a list query finds. */
	rows?: unknown[];
	/**
	 * The number a `count: 'exact'` query reports: the whole answer of one with
	 * `head: true`, and the total beside the rows of one without.
	 */
	count?: number;
	/** The message the query fails with, instead of answering. */
	message?: string;
	/** The error code it fails with, beside the message. */
	code?: string;
};

/** What the stand-in should answer with. Both halves have a harmless default. */
type StandInAnswers = {
	/** One entry per relation the code under test reads or writes. */
	tables?: Record<string, TableAnswer>;
	/** What a `.rpc(...)` call answers, or the message it fails with. */
	rpc?: { data?: unknown; message?: string };
};

/** The end of a chain that asked for one row rather than a list. */
type SingleRowBuilder = {
	overrideTypes: () => Promise<{ data: unknown; error: QueryError | null }>;
};

/** What a list query answers: its rows, and the total when it asked for one. */
type ListAnswer = { data: unknown; count: number | null; error: QueryError | null };

/** What a query that nothing chained further answers when it is awaited. */
type PlainAnswer = { data: unknown; count: number | null; error: QueryError | null };

/** One step of the query. Every step hands the builder back, which is what chains them. */
type QueryBuilder = {
	select: (columns: string, options?: unknown) => QueryBuilder;
	update: (values: Record<string, unknown>) => QueryBuilder;
	upsert: (values: Record<string, unknown>) => QueryBuilder;
	delete: () => QueryBuilder;
	eq: (column: string, value: unknown) => QueryBuilder;
	in: (column: string, values: unknown[]) => QueryBuilder;
	neq: (column: string, value: unknown) => QueryBuilder;
	order: (column: string, options: { ascending: boolean; nullsFirst?: boolean }) => QueryBuilder;
	or: (filter: string) => QueryBuilder;
	range: (firstIndex: number, lastIndex: number) => QueryBuilder;
	maybeSingle: () => SingleRowBuilder;
	overrideTypes: () => Promise<ListAnswer>;
	/** `await` calls this, which is how a query nothing ends is sent. */
	then: (resolve: (answer: PlainAnswer) => void) => void;
};

/**
 * The most rows one answer may hold, the way `max_rows` in
 * `supabase/config.toml` caps every answer the real server gives.
 */
const STAND_IN_MAX_ROWS = 1000;

/**
 * The rows a list query answers with: only the window the last `.range(...)`
 * asked for, or all of them when it asked for none, and never more than
 * `STAND_IN_MAX_ROWS` — the way the real server answers.
 *
 * Without the window a query that reads window after window until one comes
 * back empty would be handed the same rows for ever; without the cap a test
 * could not tell a query that reads everything from one that quietly stops at
 * a thousand. `range` counts from 0 and includes both ends, which is why the
 * slice stops one past the last index.
 */
function rowsInWindow(rows: unknown[], ranges: [number, number][]): unknown[] {
	const window = ranges.at(-1);
	const firstIndex = window ? window[0] : 0;
	const lastIndex = window ? window[1] : rows.length - 1;
	const rowCount = Math.min(lastIndex - firstIndex + 1, STAND_IN_MAX_ROWS);

	return rows.slice(firstIndex, firstIndex + rowCount);
}

/**
 * A stand-in Supabase client that writes down what it was asked for.
 *
 * The real client is a builder: `.from(...)` gives back an object with
 * `.select(...)` on it, `.select(...)` one with `.eq(...)` on it, and so on.
 * Each step adds one condition to a query that is only sent once the chain is
 * awaited. This copies that shape: every step records its arguments and hands
 * the same builder back.
 *
 * The three ways a chain can end are all here. `overrideTypes` changes the type
 * of the answer in the real client rather than the answer itself, and comes
 * after `maybeSingle()` for one row or straight after the filters for a list.
 * A chain nothing ends at all — a count, or an update — is simply awaited,
 * which is what the `then` above is for.
 */
function createStandInSupabase(answers: StandInAnswers = {}): {
	supabase: SupabaseClient;
	queries: RecordedQuery[];
	rpcCalls: RecordedRpc[];
} {
	const queries: RecordedQuery[] = [];
	const rpcCalls: RecordedRpc[] = [];

	function builderFor(table: string): QueryBuilder {
		const query: RecordedQuery = {
			table,
			columns: '',
			options: undefined,
			eq: [],
			in: [],
			neq: [],
			order: [],
			orderOptions: [],
			or: [],
			range: [],
			update: null,
			upsert: null,
			isDelete: false
		};
		queries.push(query);

		const answer = answers.tables?.[table] ?? {};
		const failure = answer.message ? { message: answer.message, code: answer.code } : null;

		const builder: QueryBuilder = {
			select: (columns, options) => {
				query.columns = columns;
				query.options = options;
				return builder;
			},
			update: (values) => {
				query.update = values;
				return builder;
			},
			upsert: (values) => {
				query.upsert = values;
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
			neq: (column, value) => {
				query.neq.push([column, value]);
				return builder;
			},
			order: (column, options) => {
				query.order.push([column, options.ascending]);
				query.orderOptions.push(options);
				return builder;
			},
			or: (filter) => {
				query.or.push(filter);
				return builder;
			},
			range: (firstIndex, lastIndex) => {
				query.range.push([firstIndex, lastIndex]);
				return builder;
			},
			maybeSingle: () => ({
				overrideTypes: async () => ({ data: failure ? null : (answer.row ?? null), error: failure })
			}),
			overrideTypes: async () => ({
				data: failure ? null : rowsInWindow(answer.rows ?? [], query.range),
				count: failure ? null : (answer.count ?? null),
				error: failure
			}),
			then: (resolve) =>
				resolve({ data: null, count: failure ? null : (answer.count ?? 0), error: failure })
		};

		return builder;
	}

	const supabase = {
		from: builderFor,
		rpc: async (name: string, args: unknown) => {
			rpcCalls.push({ name, args });

			if (answers.rpc?.message) {
				return { data: null, error: { message: answers.rpc.message } };
			}

			return { data: answers.rpc?.data ?? null, error: null };
		}
	};

	return { supabase: supabase as unknown as SupabaseClient, queries, rpcCalls };
}

/** One membership row, with the delegation the `!inner` embed brings along. */
function membershipRow(changes: Record<string, unknown> = {}) {
	return {
		delegations: {
			id: 'delegation-1',
			name: 'Lycee Francais Delegation',
			conference_id: 'conference-1',
			...changes
		}
	};
}

/** One conference row, as a delegation page reads it. */
function conferenceRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'conference-1',
		slug: 'thimun-2027',
		name: 'THIMUN The Hague 2027',
		start_date: '2027-01-24',
		end_date: '2027-01-29',
		timezone: 'Europe/Amsterdam',
		status: 'published',
		accepts_delegations: true,
		applications_open_at: '2026-09-01T09:00:00Z',
		applications_close_at: '2026-12-01T23:00:00Z',
		...changes
	};
}

/** One delegation row, with the conference the `!inner` embed brings along. */
function delegationRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'delegation-1',
		conference_id: 'conference-1',
		name: 'Lycee Francais Delegation',
		institution_name: 'Lycee Francais de La Haye',
		country_code: 'FR',
		status: 'submitted',
		requested_seats: 12,
		note: 'Two chaperones travel with us.',
		join_code: 'H7KP3QWX',
		submitted_at: '2026-10-03T09:00:00Z',
		decided_at: null,
		decision_note: null,
		conferences: conferenceRow(),
		...changes
	};
}

/** One row of what `preview_delegation` answers with. */
function previewRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'delegation-1',
		name: 'Lycee Francais Delegation',
		institution_name: 'Lycee Francais de La Haye',
		country_code: 'FR',
		status: 'submitted',
		conference_name: 'THIMUN The Hague 2027',
		conference_slug: 'thimun-2027',
		conference_start_date: '2027-01-24',
		conference_end_date: '2027-01-29',
		conference_city: 'The Hague',
		conference_country_code: 'NL',
		head_names: ['Amira Haddad'],
		member_count: 8,
		...changes
	};
}

describe('getMyDelegationFor', () => {
	it("asks for this person's membership inside this conference", async () => {
		const { supabase, queries } = createStandInSupabase({
			tables: { delegation_members: { row: membershipRow() } }
		});

		await getMyDelegationFor(supabase, 'conference-1', 'user-1');

		expect(queries[0].table).toBe('delegation_members');
		// Without the `!inner` the filter on the delegation's conference would not
		// narrow which memberships come back at all.
		expect(queries[0].columns).toBe('delegations!inner(id, name, conference_id)');
		expect(queries[0].eq).toEqual([
			['user_id', 'user-1'],
			['delegations.conference_id', 'conference-1']
		]);
	});

	it('answers with the id and the name, which is what a link needs', async () => {
		const { supabase } = createStandInSupabase({
			tables: { delegation_members: { row: membershipRow() } }
		});

		expect(await getMyDelegationFor(supabase, 'conference-1', 'user-1')).toEqual({
			id: 'delegation-1',
			name: 'Lycee Francais Delegation'
		});
	});

	it('answers with nothing when this person is in no delegation here', async () => {
		const { supabase } = createStandInSupabase();

		expect(await getMyDelegationFor(supabase, 'conference-1', 'user-1')).toBeNull();
	});

	it('answers with nothing rather than failing when the query is refused', async () => {
		const { supabase } = createStandInSupabase({
			tables: { delegation_members: { message: 'permission denied for table delegations' } }
		});

		// The `delegations` select policy is "member", so somebody in no delegation
		// is turned away rather than answered, and that is the ordinary case.
		expect(await getMyDelegationFor(supabase, 'conference-1', 'user-1')).toBeNull();
	});
});

/** The conference the list at `/applications` brings along with each membership. */
function membershipConferenceRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'conference-1',
		slug: 'thimun-2027',
		name: 'THIMUN The Hague 2027',
		logo_path: 'logos/thimun.png',
		start_date: '2027-01-24',
		end_date: '2027-01-29',
		timezone: 'Europe/Amsterdam',
		status: 'published',
		applications_close_at: '2026-12-01T23:00:00Z',
		organizations: { name: 'THIMUN Foundation' },
		...changes
	};
}

/** One row of the membership list: the delegation, with its own conference brought along. */
function membershipListRow(changes: Record<string, unknown> = {}) {
	return {
		delegations: {
			id: 'delegation-1',
			name: 'Lycee Francais Delegation',
			status: 'accepted',
			conferences: membershipConferenceRow(),
			...changes
		}
	};
}

/** One row of the seat lookup, as the `committees!inner(...)` embed brings it back. */
function mySeatRow(changes: Record<string, unknown> = {}) {
	return {
		name: 'France',
		country_code: 'FR',
		committees: {
			conference_id: 'conference-1',
			name: 'United Nations Security Council',
			abbreviation: 'UNSC'
		},
		...changes
	};
}

describe('listMyDelegationMemberships', () => {
	it("asks for this person's memberships, with the delegation and its conference along", async () => {
		const { supabase, queries } = createStandInSupabase({
			tables: { delegation_members: { rows: [membershipListRow()] } }
		});

		await listMyDelegationMemberships(supabase, 'user-1');

		expect(queries[0].table).toBe('delegation_members');
		// Both `!inner`s make the embed part of the match, so a membership whose
		// delegation or whose conference could not be read drops out of the answer
		// rather than arriving with nothing to name it.
		expect(queries[0].columns).toContain('delegations!inner(');
		expect(queries[0].columns).toContain('conferences!inner(');
		expect(queries[0].eq).toEqual([['user_id', 'user-1']]);
	});

	it('gives the database column names the ones the list uses', async () => {
		const { supabase } = createStandInSupabase({
			tables: {
				delegation_members: { rows: [membershipListRow()] },
				seats: { rows: [mySeatRow()] }
			}
		});

		expect(await listMyDelegationMemberships(supabase, 'user-1')).toEqual([
			{
				id: 'delegation-1',
				name: 'Lycee Francais Delegation',
				status: 'accepted',
				conference: {
					id: 'conference-1',
					slug: 'thimun-2027',
					name: 'THIMUN The Hague 2027',
					organizationName: 'THIMUN Foundation',
					logoPath: 'logos/thimun.png',
					startDate: '2027-01-24',
					endDate: '2027-01-29',
					timezone: 'Europe/Amsterdam',
					isArchived: false,
					applicationsCloseAt: '2026-12-01T23:00:00Z'
				},
				// The seat's country code travels with it, for the list to draw a flag from.
				seat: { seatName: 'France', committeeHeading: 'UNSC', countryCode: 'FR' }
			}
		]);
	});

	it('reads an archived conference as one that is over', async () => {
		const { supabase } = createStandInSupabase({
			tables: {
				delegation_members: {
					rows: [
						membershipListRow({ conferences: membershipConferenceRow({ status: 'archived' }) })
					]
				}
			}
		});

		const memberships = await listMyDelegationMemberships(supabase, 'user-1');

		// The list asks only whether the conference is over and done with, so the
		// status arrives as that one answer rather than as a word of its own.
		expect(memberships[0].conference.isArchived).toBe(true);
	});

	it('leaves the organisation name null when Row Level Security withheld it', async () => {
		const { supabase } = createStandInSupabase({
			tables: {
				delegation_members: {
					rows: [
						membershipListRow({ conferences: membershipConferenceRow({ organizations: null }) })
					]
				}
			}
		});

		const memberships = await listMyDelegationMemberships(supabase, 'user-1');

		expect(memberships[0].conference.organizationName).toBeNull();
	});

	it('puts the seat on the membership at its own conference', async () => {
		const { supabase, queries } = createStandInSupabase({
			tables: {
				delegation_members: {
					rows: [
						membershipListRow(),
						membershipListRow({
							id: 'delegation-2',
							name: 'Lyceum 7 Delegation',
							conferences: membershipConferenceRow({ id: 'conference-2', slug: 'delftmun-2026' })
						})
					]
				},
				seats: {
					rows: [
						mySeatRow({
							country_code: null,
							committees: { conference_id: 'conference-2', name: 'ECOSOC', abbreviation: null }
						})
					]
				}
			}
		});

		const memberships = await listMyDelegationMemberships(supabase, 'user-1');
		const seatQuery = queries.find((query) => query.table === 'seats');

		// `seats` carries no `conference_id` of its own, so the conference is read
		// off the committee the seat is in.
		expect(seatQuery?.columns).toBe(
			'name, country_code, committees!inner(conference_id, name, abbreviation)'
		);
		expect(seatQuery?.eq).toEqual([['user_id', 'user-1']]);
		expect(memberships[0].seat).toBeNull();
		// A seat that is not a country, such as "Press", carries a null country code
		// through rather than one made up.
		expect(memberships[1].seat).toEqual({
			seatName: 'France',
			committeeHeading: 'ECOSOC',
			countryCode: null
		});
	});

	it('leaves a membership whose seats are not out yet without one', async () => {
		const { supabase } = createStandInSupabase({
			tables: { delegation_members: { rows: [membershipListRow()] } }
		});

		const memberships = await listMyDelegationMemberships(supabase, 'user-1');

		// The page words this as "Seat pending", which is an ordinary state and
		// not a fault.
		expect(memberships[0].seat).toBeNull();
	});

	it('reads both halves a window at a time until one comes back empty', async () => {
		const { supabase, queries } = createStandInSupabase({
			tables: {
				delegation_members: { rows: [membershipListRow()] },
				seats: { rows: [mySeatRow()] }
			}
		});

		const memberships = await listMyDelegationMemberships(supabase, 'user-1');

		// `max_rows` in `supabase/config.toml` would cut one unbounded query off at a
		// thousand rows without saying so, so each half asks for a window and moves
		// it along by the rows that came back. Only an empty window is the end.
		expect(
			queries.filter((query) => query.table === 'delegation_members').map((query) => query.range)
		).toEqual([[[0, 499]], [[1, 500]]]);
		expect(queries.filter((query) => query.table === 'seats').map((query) => query.range)).toEqual([
			[[0, 499]],
			[[1, 500]]
		]);
		expect(memberships).toHaveLength(1);
		expect(memberships[0].seat).toEqual({
			seatName: 'France',
			committeeHeading: 'UNSC',
			countryCode: 'FR'
		});
	});

	it('orders both halves by something that is never the same twice', async () => {
		const { supabase, queries } = createStandInSupabase({
			tables: { delegation_members: { rows: [membershipListRow()] } }
		});

		await listMyDelegationMemberships(supabase, 'user-1');

		// Without a fixed order a row could land in two windows or in none. A
		// person is in any one delegation once, and every seat has its own id.
		expect(queries.find((query) => query.table === 'delegation_members')?.order).toEqual([
			['delegation_id', true]
		]);
		expect(queries.find((query) => query.table === 'seats')?.order).toEqual([['id', true]]);
	});

	it('keeps every membership past the first window', async () => {
		const manyRows = Array.from({ length: 1200 }, (_, index) =>
			membershipListRow({ id: `delegation-${index}` })
		);
		const { supabase } = createStandInSupabase({
			tables: { delegation_members: { rows: manyRows } }
		});

		const memberships = await listMyDelegationMemberships(supabase, 'user-1');

		// More than `max_rows` allows in one answer, and every one of them arrives.
		expect(memberships).toHaveLength(1200);
		expect(memberships.at(-1)?.id).toBe('delegation-1199');
	});

	it('finds a seat that sits past the first window of seats', async () => {
		const manySeats = Array.from({ length: 1200 }, (_, index) =>
			mySeatRow({
				name: `Seat ${index}`,
				committees: { conference_id: `conference-${index}`, name: 'ECOSOC', abbreviation: null }
			})
		);
		const { supabase } = createStandInSupabase({
			tables: {
				delegation_members: {
					rows: [
						membershipListRow({ conferences: membershipConferenceRow({ id: 'conference-1199' }) })
					]
				},
				seats: { rows: manySeats }
			}
		});

		const memberships = await listMyDelegationMemberships(supabase, 'user-1');

		// Read in one answer, this seat would be the 1,200th row and past `max_rows`,
		// and the row would say "Seat pending" when the seat is really given out.
		expect(memberships[0].seat).toEqual({
			seatName: 'Seat 1199',
			committeeHeading: 'ECOSOC',
			countryCode: 'FR'
		});
	});

	it('stops when the window starts past the last row, rather than raising', async () => {
		const { supabase } = createStandInSupabase({
			tables: {
				delegation_members: {
					message: 'Requested range not satisfiable',
					code: 'PGRST103'
				}
			}
		});

		// Supabase can answer a window past the last row with this code rather
		// than with an empty list, and it means the end, not a fault.
		expect(await listMyDelegationMemberships(supabase, 'user-1')).toEqual([]);
	});

	it('asks nothing about seats when this person is in no delegation', async () => {
		const { supabase, queries } = createStandInSupabase();

		expect(await listMyDelegationMemberships(supabase, 'user-1')).toEqual([]);
		expect(queries.map((query) => query.table)).toEqual(['delegation_members']);
	});

	it('raises when the membership query fails, unlike the lookup above it', async () => {
		const { supabase } = createStandInSupabase({
			tables: { delegation_members: { message: 'connection closed' } }
		});

		// Half a list shown as a whole list would be worse than an error page,
		// because nothing on the page would say that anything is missing.
		await expect(listMyDelegationMemberships(supabase, 'user-1')).rejects.toThrow(
			'Could not list your delegations'
		);
	});

	it('raises when the seat query fails rather than saying every seat is pending', async () => {
		const { supabase } = createStandInSupabase({
			tables: {
				delegation_members: { rows: [membershipListRow()] },
				seats: { message: 'permission denied for table seats' }
			}
		});

		await expect(listMyDelegationMemberships(supabase, 'user-1')).rejects.toThrow(
			'Could not read your seats'
		);
	});
});

describe('findMyRouteIntoConference', () => {
	it('names the application when this person applied on their own', async () => {
		const { supabase } = createStandInSupabase({
			tables: { applications: { row: { id: 'application-1' } } }
		});

		expect(await findMyRouteIntoConference(supabase, 'conference-1', 'user-1')).toEqual({
			kind: 'application',
			applicationId: 'application-1'
		});
	});

	it('names the delegation when this person is in one', async () => {
		const { supabase } = createStandInSupabase({
			tables: { delegation_members: { row: membershipRow() } }
		});

		expect(await findMyRouteIntoConference(supabase, 'conference-1', 'user-1')).toEqual({
			kind: 'delegation',
			delegationId: 'delegation-1',
			delegationName: 'Lycee Francais Delegation'
		});
	});

	it('asks about both roads, filtered on this person and this conference', async () => {
		const { supabase, queries } = createStandInSupabase();

		await findMyRouteIntoConference(supabase, 'conference-1', 'user-1');

		const applications = queries.find((query) => query.table === 'applications');

		expect(applications?.columns).toBe('id');
		expect(applications?.eq).toEqual([
			['conference_id', 'conference-1'],
			['user_id', 'user-1']
		]);
		expect(queries.some((query) => query.table === 'delegation_members')).toBe(true);
	});

	it('answers with nothing when neither road has been taken', async () => {
		const { supabase } = createStandInSupabase();

		expect(await findMyRouteIntoConference(supabase, 'conference-1', 'user-1')).toBeNull();
	});
});

describe('createDelegation', () => {
	it('calls create_delegation with the column names the function uses', async () => {
		const { supabase, rpcCalls } = createStandInSupabase({ rpc: { data: 'delegation-1' } });

		const delegationId = await createDelegation(supabase, {
			conferenceId: 'conference-1',
			name: 'Lycee Francais Delegation',
			institutionName: 'Lycee Francais de La Haye',
			countryCode: 'FR',
			requestedSeats: 12,
			note: null
		});

		expect(delegationId).toBe('delegation-1');
		expect(rpcCalls).toEqual([
			{
				name: 'create_delegation',
				args: {
					conference_id: 'conference-1',
					name: 'Lycee Francais Delegation',
					institution_name: 'Lycee Francais de La Haye',
					country_code: 'FR',
					requested_seats: 12,
					note: null
				}
			}
		]);
	});

	it('fails loudly when the function refuses, because the form cannot go on', async () => {
		const { supabase } = createStandInSupabase({
			rpc: { message: 'That conference is not taking delegations' }
		});

		await expect(
			createDelegation(supabase, {
				conferenceId: 'conference-1',
				name: 'Lycee Francais Delegation',
				institutionName: 'Lycee Francais de La Haye',
				countryCode: 'FR',
				requestedSeats: 12,
				note: null
			})
		).rejects.toThrow('not taking delegations');
	});
});

describe('getDelegationByJoinCode', () => {
	it('turns the one row preview_delegation answers with into the shape the card draws', async () => {
		const { supabase } = createStandInSupabase({ rpc: { data: [previewRow()] } });

		expect(await getDelegationByJoinCode(supabase, 'H7KP3QWX')).toEqual({
			id: 'delegation-1',
			name: 'Lycee Francais Delegation',
			institutionName: 'Lycee Francais de La Haye',
			countryCode: 'FR',
			status: 'submitted',
			conferenceName: 'THIMUN The Hague 2027',
			conferenceSlug: 'thimun-2027',
			conferenceStartDate: '2027-01-24',
			conferenceEndDate: '2027-01-29',
			conferenceCity: 'The Hague',
			conferenceCountryCode: 'NL',
			headNames: ['Amira Haddad'],
			memberCount: 8
		});
	});

	it('answers with nothing for a code nobody has, which is an empty list', async () => {
		const { supabase } = createStandInSupabase({ rpc: { data: [] } });

		expect(await getDelegationByJoinCode(supabase, 'ZZZZZZZZ')).toBeNull();
	});

	it('tidies a code somebody typed by hand before looking it up', async () => {
		const { supabase, rpcCalls } = createStandInSupabase({ rpc: { data: [previewRow()] } });

		await getDelegationByJoinCode(supabase, ' h7kp 3qwx ');

		// `join.md` asks for codes to be matched case-insensitively and for spaced
		// ones to be normalised. The database stores them in upper case.
		expect(rpcCalls).toEqual([{ name: 'preview_delegation', args: { code: 'H7KP3QWX' } }]);
	});

	it('fails loudly when the lookup itself fails, rather than saying the link is wrong', async () => {
		const { supabase } = createStandInSupabase({ rpc: { message: 'connection lost' } });

		await expect(getDelegationByJoinCode(supabase, 'H7KP3QWX')).rejects.toThrow('connection lost');
	});

	it('answers too_many_wrong_codes after ten wrong codes in an hour, rather than failing', async () => {
		const { supabase } = createStandInSupabase({
			rpc: { message: 'Too many wrong codes. Try again in an hour' }
		});

		expect(await getDelegationByJoinCode(supabase, 'H7KP3QWX')).toBe('too_many_wrong_codes');
	});
});

describe('joinDelegation', () => {
	it('answers with the delegation it joined', async () => {
		const { supabase, rpcCalls } = createStandInSupabase({ rpc: { data: 'delegation-1' } });

		expect(await joinDelegation(supabase, 'h7kp3qwx')).toEqual({
			ok: true,
			delegationId: 'delegation-1'
		});
		// The code is tidied here too, so a lower-case link works all the way
		// through and not only as far as the preview.
		expect(rpcCalls).toEqual([{ name: 'join_delegation', args: { code: 'H7KP3QWX' } }]);
	});

	/*
		What comes back is which row of `05-pages/delegation/join.md`'s refusal
		table the database meant, and never a sentence. Four of the seven sentences
		name the conference or the other delegation, and the database knows neither
		name, so the wording is `joinRefusalSentence`'s job and the page's to call.

		These are the exact words each `raise exception` uses. A test per row,
		because a row nothing matches is answered with "something went wrong", and
		a visitor who is told that when the real answer was "you already applied"
		has been told nothing at all.
	*/
	const REFUSALS: { raised: string; kind: string }[] = [
		{ raised: 'Too many wrong codes. Try again in an hour', kind: 'too_many_wrong_codes' },
		{ raised: 'The conference team cannot join a delegation', kind: 'conference_staff' },
		{ raised: 'That delegation was not accepted', kind: 'rejected' },
		{ raised: 'That delegation withdrew its request', kind: 'withdrawn' },
		{ raised: 'That conference has already taken place', kind: 'conference_over' },
		{ raised: 'You are already in this delegation', kind: 'already_in_this' },
		{ raised: 'You already have an application for this conference', kind: 'already_applied' },
		{
			raised: 'You are already part of a delegation for this conference',
			kind: 'in_other_delegation'
		}
	];

	for (const refusal of REFUSALS) {
		it(`reads "${refusal.raised}" as ${refusal.kind}`, async () => {
			const { supabase } = createStandInSupabase({ rpc: { message: refusal.raised } });

			expect(await joinDelegation(supabase, 'H7KP3QWX')).toEqual({
				ok: false,
				kind: refusal.kind
			});
		});
	}

	it('reads the null join_delegation answers for a code nobody has as unknown_code', async () => {
		// Null and not an exception, so the database keeps the wrong code it
		// wrote down (migration 20261022161000).
		const { supabase } = createStandInSupabase({ rpc: { data: null } });

		expect(await joinDelegation(supabase, 'H7KP3QWX')).toEqual({ ok: false, kind: 'unknown_code' });
	});

	it('says something went wrong, and logs it, for a refusal nothing here knows', async () => {
		const { supabase } = createStandInSupabase({ rpc: { message: 'deadlock detected' } });
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

		const answer = await joinDelegation(supabase, 'H7KP3QWX');

		expect(answer).toEqual({ ok: false, kind: 'unknown' });
		// `join.md` asks for these to be logged: a refusal nothing recognises is a
		// fault of ours rather than something the visitor did wrong.
		expect(logged).toHaveBeenCalledOnce();
		expect(logged.mock.calls[0][0]).toContain('deadlock detected');

		logged.mockRestore();
	});
});

describe('getDelegationForMember', () => {
	/** A delegation this reader is in, as a head. */
	const HEAD_ANSWERS: StandInAnswers = {
		tables: {
			delegations: { row: delegationRow() },
			delegation_members: { row: { role: 'head' } }
		}
	};

	it('gives back the delegation, its conference and the role, under our own names', async () => {
		const { supabase } = createStandInSupabase(HEAD_ANSWERS);

		const found = await getDelegationForMember(supabase, 'delegation-1', 'user-1');

		expect(found?.myRole).toBe('head');
		expect(found?.delegation).toEqual({
			id: 'delegation-1',
			conferenceId: 'conference-1',
			name: 'Lycee Francais Delegation',
			institutionName: 'Lycee Francais de La Haye',
			countryCode: 'FR',
			status: 'submitted',
			requestedSeats: 12,
			note: 'Two chaperones travel with us.',
			joinCode: 'H7KP3QWX',
			submittedAt: '2026-10-03T09:00:00Z',
			decidedAt: null,
			decisionNote: null
		});
		expect(found?.conference).toEqual({
			id: 'conference-1',
			slug: 'thimun-2027',
			name: 'THIMUN The Hague 2027',
			startDate: '2027-01-24',
			endDate: '2027-01-29',
			timezone: 'Europe/Amsterdam',
			status: 'published',
			acceptsDelegations: true,
			applicationsOpenAt: '2026-09-01T09:00:00Z',
			applicationsCloseAt: '2026-12-01T23:00:00Z'
		});
	});

	it('asks for the delegation by id and for this reader’s own membership row', async () => {
		const { supabase, queries } = createStandInSupabase(HEAD_ANSWERS);

		await getDelegationForMember(supabase, 'delegation-1', 'user-1');

		const delegations = queries.find((query) => query.table === 'delegations');
		const memberships = queries.find((query) => query.table === 'delegation_members');

		expect(delegations?.eq).toEqual([['id', 'delegation-1']]);
		expect(delegations?.columns).toContain('conferences!inner(');
		// `internal_note` is what the organisers wrote to each other, so no page
		// ever asks for it even though a head's own row carries it.
		expect(delegations?.columns).not.toContain('internal_note');
		expect(memberships?.eq).toEqual([
			['delegation_id', 'delegation-1'],
			['user_id', 'user-1']
		]);
	});

	it('answers with nothing for somebody who is not in this delegation', async () => {
		// An organiser of the conference reads the delegation row, because the
		// select policy is "member; org.", and still has no membership of their
		// own. `dashboard.md` sends them the 404 a stranger gets.
		const { supabase } = createStandInSupabase({
			tables: { delegations: { row: delegationRow() }, delegation_members: {} }
		});

		expect(await getDelegationForMember(supabase, 'delegation-1', 'user-1')).toBeNull();
	});

	it('answers with nothing when there is no such delegation', async () => {
		const { supabase } = createStandInSupabase({
			tables: { delegation_members: { row: { role: 'member' } } }
		});

		expect(await getDelegationForMember(supabase, 'no-such-delegation', 'user-1')).toBeNull();
	});
});

describe('countDelegationMembers', () => {
	it('counts the membership rows of this delegation, heads included', async () => {
		const { supabase, queries } = createStandInSupabase({
			tables: { delegation_members: { count: 9 } }
		});

		expect(await countDelegationMembers(supabase, 'delegation-1')).toBe(9);
		// `count: 'exact'` with `head: true` asks for the number on its own,
		// without any of the rows themselves.
		expect(queries[0].options).toEqual({ count: 'exact', head: true });
		expect(queries[0].eq).toEqual([['delegation_id', 'delegation-1']]);
	});

	it('fails loudly when the count fails, because the dashboard shows the number', async () => {
		const { supabase } = createStandInSupabase({
			tables: { delegation_members: { message: 'connection lost' } }
		});

		await expect(countDelegationMembers(supabase, 'delegation-1')).rejects.toThrow(
			'connection lost'
		);
	});
});

describe('countDelegationSeats', () => {
	it('counts the reserved seats and the ones somebody is sitting in', async () => {
		const { supabase, queries } = createStandInSupabase({
			tables: {
				seats: {
					rows: [{ user_id: 'user-1' }, { user_id: 'user-2' }, { user_id: null }, { user_id: null }]
				}
			}
		});

		expect(await countDelegationSeats(supabase, 'delegation-1')).toEqual({
			allocated: 4,
			assigned: 2
		});
		expect(queries[0].eq).toEqual([['delegation_id', 'delegation-1']]);
	});

	it('counts nothing before the organisers have allocated anything', async () => {
		const { supabase } = createStandInSupabase({ tables: { seats: { rows: [] } } });

		expect(await countDelegationSeats(supabase, 'delegation-1')).toEqual({
			allocated: 0,
			assigned: 0
		});
	});
});

describe('findMyDelegationSeat', () => {
	it('gives back the seat, its country and the committee it sits in', async () => {
		const { supabase, queries } = createStandInSupabase({
			tables: {
				seats: {
					row: {
						name: 'France',
						country_code: 'FR',
						committees: { name: 'Security Council', slug: 'sc' }
					}
				}
			}
		});

		// The country is here because `05-pages/delegation/dashboard.md` draws a
		// `Flag` on the member's "Your seat" card, and the flag has nothing to go
		// on without it.
		expect(await findMyDelegationSeat(supabase, 'delegation-1', 'user-1')).toEqual({
			seatName: 'France',
			countryCode: 'FR',
			committeeName: 'Security Council',
			committeeSlug: 'sc'
		});
		expect(queries[0].eq).toEqual([
			['delegation_id', 'delegation-1'],
			['user_id', 'user-1']
		]);
	});

	it('answers with nothing when the head has not given them one yet', async () => {
		const { supabase } = createStandInSupabase();

		expect(await findMyDelegationSeat(supabase, 'delegation-1', 'user-1')).toBeNull();
	});

	// A seat may be a role rather than a country — a rapporteur, an observer — and
	// `seats.country_code` is nullable for exactly that. The card then draws the
	// name with no flag beside it.
	it('hands on an empty country for a seat that is not a country', async () => {
		const { supabase } = createStandInSupabase({
			tables: {
				seats: {
					row: {
						name: 'Rapporteur',
						country_code: null,
						committees: { name: 'Security Council', slug: 'sc' }
					}
				}
			}
		});

		expect(await findMyDelegationSeat(supabase, 'delegation-1', 'user-1')).toEqual({
			seatName: 'Rapporteur',
			countryCode: null,
			committeeName: 'Security Council',
			committeeSlug: 'sc'
		});
	});

	it('answers with nothing rather than failing when the seat list is refused', async () => {
		const { supabase } = createStandInSupabase({
			tables: { seats: { message: 'permission denied for table seats' } }
		});

		expect(await findMyDelegationSeat(supabase, 'delegation-1', 'user-1')).toBeNull();
	});
});

describe('updateDelegationDetails', () => {
	it('sends only the five columns a head may write', async () => {
		const { supabase, queries } = createStandInSupabase();

		await updateDelegationDetails(supabase, 'delegation-1', {
			name: 'Lycee Francais Delegation',
			institutionName: 'Lycee Francais de La Haye',
			countryCode: 'FR',
			requestedSeats: 10,
			note: null
		});

		expect(queries[0].table).toBe('delegations');
		// `guard_delegation_update` refuses the whole update when a head touches
		// anything else, so nothing else is sent.
		expect(queries[0].update).toEqual({
			name: 'Lycee Francais Delegation',
			institution_name: 'Lycee Francais de La Haye',
			country_code: 'FR',
			requested_seats: 10,
			note: null
		});
		expect(queries[0].eq).toEqual([['id', 'delegation-1']]);
	});

	it('fails loudly when the update is refused', async () => {
		const { supabase } = createStandInSupabase({
			tables: { delegations: { message: 'This delegation can no longer be changed' } }
		});

		await expect(
			updateDelegationDetails(supabase, 'delegation-1', {
				name: 'Lycee Francais Delegation',
				institutionName: 'Lycee Francais de La Haye',
				countryCode: 'FR',
				requestedSeats: 10,
				note: null
			})
		).rejects.toThrow('no longer be changed');
	});
});

describe('setDelegationStatus', () => {
	it('sends the status and nothing else', async () => {
		const { supabase, queries } = createStandInSupabase();

		await setDelegationStatus(supabase, 'delegation-1', 'submitted');

		// `submitted_at` is the `guard_delegation_update` trigger's to write, and
		// it refuses a page that sends one.
		expect(queries[0].update).toEqual({ status: 'submitted' });
		expect(queries[0].eq).toEqual([['id', 'delegation-1']]);
	});

	it('withdraws the same way', async () => {
		const { supabase, queries } = createStandInSupabase();

		await setDelegationStatus(supabase, 'delegation-1', 'withdrawn');

		expect(queries[0].update).toEqual({ status: 'withdrawn' });
	});

	it('fails loudly when the move is refused', async () => {
		const { supabase } = createStandInSupabase({
			tables: { delegations: { message: 'This delegation can no longer be changed' } }
		});

		await expect(setDelegationStatus(supabase, 'delegation-1', 'withdrawn')).rejects.toThrow(
			'no longer be changed'
		);
	});
});

describe('findConferenceIdBySlug', () => {
	it('asks for the id alone, by slug', async () => {
		const { supabase, queries } = createStandInSupabase({
			tables: { conferences: { row: { id: 'conference-1' } } }
		});

		expect(await findConferenceIdBySlug(supabase, 'thimun-2027')).toBe('conference-1');
		expect(queries[0].table).toBe('conferences');
		expect(queries[0].columns).toBe('id');
		expect(queries[0].eq).toEqual([['slug', 'thimun-2027']]);
	});

	it('answers with nothing for a slug nobody has, or one this reader may not open', async () => {
		const { supabase } = createStandInSupabase();

		expect(await findConferenceIdBySlug(supabase, 'no-such-conference')).toBeNull();
	});
});

// -----------------------------------------------------------------------------
// The organiser's delegations table
// -----------------------------------------------------------------------------
// Everything below is about `/manage/[slug]/delegations`, where the organiser
// reads the groups of one status a page at a time. The question these tests ask
// is which conditions end up on the query, because since T74 the database does
// all of the searching, sorting, paging and counting, through the
// `delegations_with_heads` and `delegation_status_totals` views.

/** The relations this module asked for, in the order it asked for them. */
function tablesRead(queries: RecordedQuery[]): string[] {
	return queries.map((query) => query.table);
}

/**
 * The table as it opens, with whatever one test cares about changed.
 *
 * Written out here rather than taken from a constant, because these five are
 * what `parseDelegationListQuery` hands the module for a bare address.
 */
function delegationListQuery(changes: Partial<DelegationListQuery> = {}): DelegationListQuery {
	return { q: '', status: 'submitted', country: '', sort: 'submitted', page: 1, ...changes };
}

/** The view the organiser's table reads, which puts the heads' names beside each delegation. */
const DELEGATIONS_VIEW = 'delegations_with_heads';

/** The view the tabs and the heading sentence read, one row per status. */
const TOTALS_VIEW = 'delegation_status_totals';

/** One row of the view as the organiser's table reads it, with the three lists it brings along. */
function organiserDelegationRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'delegation-1',
		name: 'Lycee Francais Delegation',
		institution_name: 'Lycee Francais de La Haye',
		country_code: 'FR',
		status: 'submitted',
		requested_seats: 12,
		submitted_at: '2026-10-03T09:00:00Z',
		head_names: ['Marie Dupont'],
		delegation_members: [{ user_id: 'user-1' }],
		seats: [],
		invoices: [],
		...changes
	};
}

/** A stand-in whose view answers with these rows and says this many matched altogether. */
function standInWithDelegations(rows: unknown[], count: number = rows.length) {
	return createStandInSupabase({ tables: { [DELEGATIONS_VIEW]: { rows, count } } });
}

describe('listDelegationsForOrganiser', () => {
	it('asks the view for the columns the table draws, in the status the open tab shows', async () => {
		const { supabase, queries } = standInWithDelegations([organiserDelegationRow()]);

		await listDelegationsForOrganiser(supabase, 'conference-1', delegationListQuery());

		expect(queries[0].table).toBe(DELEGATIONS_VIEW);
		// The members, the seats and the invoices each carry a `delegation_id`
		// foreign key, and PostgREST knows the view's `id` is `delegations.id`, so
		// it brings all three along with the row.
		expect(queries[0].columns).toBe(
			'id, name, institution_name, country_code, status, requested_seats, submitted_at, head_names, delegation_members(user_id), seats(user_id), invoices(status)'
		);
		// The total of every match, not only the page, is what the pager needs.
		expect(queries[0].options).toEqual({ count: 'exact' });
		// The select policy is "member; org.", and a policy decides rows and not
		// columns, so an organiser really can read a group's unsent draft. Naming
		// the status in the query is what keeps a draft off the page.
		expect(queries[0].eq).toEqual([
			['conference_id', 'conference-1'],
			['status', 'submitted']
		]);
	});

	it('sends one request and no second one for the heads', async () => {
		const { supabase, queries } = standInWithDelegations([organiserDelegationRow()]);

		await listDelegationsForOrganiser(supabase, 'conference-1', delegationListQuery());

		// The view already carries the heads' names, so `profiles` is never asked.
		expect(tablesRead(queries)).toEqual([DELEGATIONS_VIEW]);
	});

	it('builds a row out of the delegation, its heads, its seats and its invoices', async () => {
		const { supabase } = standInWithDelegations(
			[
				organiserDelegationRow({
					delegation_members: [{ user_id: 'user-1' }, { user_id: 'user-2' }],
					seats: [{ user_id: 'user-2' }, { user_id: null }],
					invoices: [{ status: 'unpaid' }]
				})
			],
			1
		);

		const page = await listDelegationsForOrganiser(supabase, 'conference-1', delegationListQuery());

		expect(page.rows).toEqual([
			{
				id: 'delegation-1',
				name: 'Lycee Francais Delegation',
				institutionName: 'Lycee Francais de La Haye',
				countryCode: 'FR',
				headNames: ['Marie Dupont'],
				// The heads count as members, so this group of a head and a member
				// is two rather than one.
				memberCount: 2,
				status: 'submitted',
				submittedAt: '2026-10-03T09:00:00Z',
				// A seat is allocated once it carries this `delegation_id`, and
				// assigned once the head has put somebody in it.
				progress: { requested: 12, allocated: 2, assigned: 1, percentAssigned: 50 },
				// The wording of the badge is `delegationInvoiceSummary`'s own and is
				// tested where that lives. What matters here is that every invoice of
				// the delegation reaches it.
				invoice: delegationInvoiceSummary(['unpaid'])
			}
		]);
		expect(page.total).toBe(1);
	});

	it('calls a head whose account has gone a deleted account, rather than nothing', async () => {
		const { supabase } = standInWithDelegations([
			organiserDelegationRow({ head_names: ['Marie Dupont', null] })
		]);

		const page = await listDelegationsForOrganiser(supabase, 'conference-1', delegationListQuery());

		// The view writes a head it cannot read a profile for as `null`. A blank
		// cell would look like a fault rather than a fact, and the organiser
		// still has to see that the delegation is there. The order is the view's,
		// oldest membership first, and is kept as it came.
		expect(page.rows[0].headNames).toEqual(['Marie Dupont', 'Deleted account']);
	});

	it('leaves the search off the query when the box is empty', async () => {
		const { supabase, queries } = standInWithDelegations([]);

		await listDelegationsForOrganiser(supabase, 'conference-1', delegationListQuery());

		expect(queries[0].or).toEqual([]);
	});

	it("searches the delegation's name, its institution and its heads' names at once", async () => {
		const { supabase, queries } = standInWithDelegations([]);

		await listDelegationsForOrganiser(
			supabase,
			'conference-1',
			// Spaces around it, because somebody pasting a name brings them along.
			delegationListQuery({ q: '  Kowalski  ' })
		);

		// One `or` of three case-blind matches. The heads are searched through the
		// view's `head_names_text`, because `ilike` works on text and not on a list.
		expect(queries[0].or).toEqual([
			'name.ilike."%Kowalski%",institution_name.ilike."%Kowalski%",head_names_text.ilike."%Kowalski%"'
		]);
	});

	it('takes out of the search whatever would be read as filter language', async () => {
		const { supabase, queries } = standInWithDelegations([]);

		await listDelegationsForOrganiser(
			supabase,
			'conference-1',
			delegationListQuery({ q: 'dupont,status.eq.draft' })
		);

		// A comma separates one condition from the next in `.or(...)`, so this is
		// what would otherwise let the search box add a condition of its own.
		expect(queries[0].or).toEqual([
			'name.ilike."%dupont status eq draft%",institution_name.ilike."%dupont status eq draft%",head_names_text.ilike."%dupont status eq draft%"'
		]);
	});

	it('leaves the search off when the box holds nothing but characters it cannot keep', async () => {
		const { supabase, queries } = standInWithDelegations([]);

		await listDelegationsForOrganiser(supabase, 'conference-1', delegationListQuery({ q: '%,.' }));

		expect(queries[0].or).toEqual([]);
	});

	it('puts the oldest request first by default, with a dateless one at the end', async () => {
		const { supabase, queries } = standInWithDelegations([]);

		await listDelegationsForOrganiser(supabase, 'conference-1', delegationListQuery());

		// Oldest first, so that the queue is fair, and the id behind it as the
		// tie-break, so that two rows the dropdown cannot tell apart keep the same
		// order and paging can neither repeat nor lose one.
		expect(queries[0].order).toEqual([
			['submitted_at', true],
			['id', true]
		]);
		expect(queries[0].orderOptions[0]).toEqual({ ascending: true, nullsFirst: false });
	});

	it('sorts by the delegation name when the dropdown asks for it', async () => {
		const { supabase, queries } = standInWithDelegations([]);

		await listDelegationsForOrganiser(
			supabase,
			'conference-1',
			delegationListQuery({ sort: 'name' })
		);

		expect(queries[0].order).toEqual([
			['name', true],
			['id', true]
		]);
	});

	it('sorts by the size of the request, largest first', async () => {
		const { supabase, queries } = standInWithDelegations([]);

		await listDelegationsForOrganiser(
			supabase,
			'conference-1',
			delegationListQuery({ sort: 'size' })
		);

		expect(queries[0].order).toEqual([
			['requested_seats', false],
			['id', true]
		]);
	});

	it('asks the database for the first page of 25 and says how many matched altogether', async () => {
		const { supabase, queries } = standInWithDelegations([organiserDelegationRow()], 30);

		const page = await listDelegationsForOrganiser(supabase, 'conference-1', delegationListQuery());

		// `range` counts from 0 and includes both ends.
		expect(queries[0].range).toEqual([[0, 24]]);
		// `total` is the database's count of every match and not the rows on this
		// page, because that is what the pager and the heading sentence are about.
		expect(page.total).toBe(30);
	});

	it('asks for the next 25 on the second page', async () => {
		const { supabase, queries } = standInWithDelegations([]);

		// `page` is 1-based, the way the address bar writes it.
		await listDelegationsForOrganiser(supabase, 'conference-1', delegationListQuery({ page: 2 }));

		expect(queries[0].range).toEqual([[25, 49]]);
	});

	it('puts the country on the query', async () => {
		const { supabase, queries } = standInWithDelegations([]);

		await listDelegationsForOrganiser(
			supabase,
			'conference-1',
			delegationListQuery({ country: 'FR' })
		);

		expect(queries[0].eq).toEqual([
			['conference_id', 'conference-1'],
			['status', 'submitted'],
			['country_code', 'FR']
		]);
	});

	it('leaves the country condition off the query when the dropdown is on "any"', async () => {
		const { supabase, queries } = standInWithDelegations([]);

		await listDelegationsForOrganiser(supabase, 'conference-1', delegationListQuery());

		expect(queries[0].eq).toEqual([
			['conference_id', 'conference-1'],
			['status', 'submitted']
		]);
	});

	it('answers an empty page, not an error, for a page past the last one', async () => {
		const { supabase } = createStandInSupabase({
			tables: {
				[DELEGATIONS_VIEW]: { message: 'Requested range not satisfiable', code: 'PGRST103' }
			}
		});

		// Somebody edited the address to `?page=99`. The page then says there is
		// nothing here rather than showing an error.
		const page = await listDelegationsForOrganiser(
			supabase,
			'conference-1',
			delegationListQuery({ page: 99 })
		);

		expect(page).toEqual({ rows: [], total: 0 });
	});

	it('raises when the delegations query fails', async () => {
		const { supabase } = createStandInSupabase({
			tables: { [DELEGATIONS_VIEW]: { message: 'connection closed' } }
		});

		await expect(
			listDelegationsForOrganiser(supabase, 'conference-1', delegationListQuery())
		).rejects.toThrow('Could not read the delegations');
	});
});

describe('summariseDelegations', () => {
	it('reads the four statuses and adds up their seats from the totals view', async () => {
		const { supabase, queries } = createStandInSupabase({
			tables: {
				[TOTALS_VIEW]: {
					rows: [
						{ status: 'submitted', delegation_count: 2, requested_seats: 20 },
						{ status: 'accepted', delegation_count: 1, requested_seats: 20 },
						{ status: 'withdrawn', delegation_count: 1, requested_seats: 4 }
					]
				}
			}
		});

		const summary = await summariseDelegations(supabase, 'conference-1');

		// The database does the counting and the adding up, so at most one row per
		// status comes back however many delegations the conference has.
		expect(tablesRead(queries)).toEqual([TOTALS_VIEW]);
		expect(queries[0].columns).toBe('status, delegation_count, requested_seats');
		expect(queries[0].eq).toEqual([['conference_id', 'conference-1']]);
		// This one asks for all four statuses at once rather than naming one, so it
		// has to say for itself that a draft is none of the organiser's business.
		expect(queries[0].neq).toEqual([['status', 'draft']]);
		// A status with no row, `rejected` here, keeps its zero.
		expect(summary).toEqual({
			counts: { submitted: 2, accepted: 1, rejected: 0, withdrawn: 1 },
			requestedSeatsTotal: 44
		});
	});

	it('leaves the shared empty counts untouched', async () => {
		const before = { ...EMPTY_DELEGATION_STATUS_COUNTS };
		const { supabase } = createStandInSupabase({
			tables: {
				[TOTALS_VIEW]: { rows: [{ status: 'accepted', delegation_count: 1, requested_seats: 20 }] }
			}
		});

		await summariseDelegations(supabase, 'conference-1');

		// The counting is done into a copy, so the constant every caller shares is
		// still all zeroes afterwards.
		expect(EMPTY_DELEGATION_STATUS_COUNTS).toEqual(before);
	});

	it('answers with zeroes for a conference nobody has registered a delegation at', async () => {
		const { supabase } = createStandInSupabase();

		expect(await summariseDelegations(supabase, 'conference-1')).toEqual({
			counts: { submitted: 0, accepted: 0, rejected: 0, withdrawn: 0 },
			requestedSeatsTotal: 0
		});
	});

	it('raises when the counting query fails', async () => {
		const { supabase } = createStandInSupabase({
			tables: { [TOTALS_VIEW]: { message: 'connection closed' } }
		});

		await expect(summariseDelegations(supabase, 'conference-1')).rejects.toThrow(
			'Could not count the delegations'
		);
	});
});

// The head's seats page, `/delegations/[delegationId]/seats`, built by T29.
// What the database itself refuses a head — a member who already has a seat, a
// seat belonging to another delegation, a conference that has started — is Row
// Level Security's and `check_seat_allocation`'s decision and is tested in
// `tests/db/allocation.test.ts`. These tests are about the requests this module
// builds and what it makes of the answers, including the three sentences the
// trigger raises, which are matched on their words.

/** One `seats` row as the seats page reads it, with the committee brought along. */
function delegationSeatRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'seat-1',
		name: 'France',
		country_code: 'FR',
		position: 1,
		user_id: null,
		committees: {
			id: 'committee-1',
			name: 'Security Council',
			abbreviation: 'UNSC',
			level: 'advanced',
			position: 1
		},
		...changes
	};
}

/** One `profiles` row as the seats page reads it. */
function seatsPageProfileRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'user-1',
		full_name: 'Luis Ortega',
		avatar_path: null,
		experience_level: 'intermediate',
		...changes
	};
}

describe('listDelegationSeats', () => {
	it('asks for the seats with their committee, the members, and one set of names', async () => {
		const { supabase, queries } = createStandInSupabase({
			tables: {
				seats: { rows: [delegationSeatRow({ user_id: 'user-1' })] },
				delegation_members: { rows: [{ user_id: 'user-1' }, { user_id: 'user-2' }] },
				profiles: { rows: [seatsPageProfileRow()] }
			}
		});

		await listDelegationSeats(supabase, 'delegation-1');

		expect(queries[0].table).toBe('seats');
		// The `!inner` brings the committee along as one object and makes it part
		// of the match, so a seat with no readable committee is no seat at all.
		expect(queries[0].columns).toBe(
			'id, name, country_code, position, user_id, committees!inner(id, name, abbreviation, level, position)'
		);
		expect(queries[0].eq).toEqual([['delegation_id', 'delegation-1']]);

		expect(queries[1].table).toBe('delegation_members');
		expect(queries[1].eq).toEqual([['delegation_id', 'delegation-1']]);

		// One profiles query for the seat holders and the members together, and
		// `user-1` is in both lists, so it is asked about once.
		expect(queries[2].table).toBe('profiles');
		expect(queries[2].columns).toBe('id, full_name, avatar_path, experience_level');
		expect(queries[2].in).toEqual([['id', ['user-1', 'user-2']]]);
	});

	it('asks for no names at all when the delegation has neither seats nor members', async () => {
		const { supabase, queries } = createStandInSupabase();

		expect(await listDelegationSeats(supabase, 'delegation-1')).toEqual({
			groups: [],
			unseatedMembers: []
		});

		// `.in('id', [])` is a request that cannot match anything, so it is not
		// sent at all.
		expect(queries.some((query) => query.table === 'profiles')).toBe(false);
	});

	it('groups the seats by committee position, and orders the seats inside a group', async () => {
		const humanRights = {
			id: 'committee-2',
			name: 'Human Rights Council',
			abbreviation: 'HRC',
			level: 'beginner',
			position: 2
		};
		const { supabase } = createStandInSupabase({
			tables: {
				seats: {
					rows: [
						delegationSeatRow({ id: 'seat-hrc-2', position: 2, committees: humanRights }),
						delegationSeatRow({ id: 'seat-unsc-2', position: 2 }),
						delegationSeatRow({ id: 'seat-hrc-1', position: 1, committees: humanRights }),
						delegationSeatRow({ id: 'seat-unsc-1', position: 1 })
					]
				}
			}
		});

		const seating = await listDelegationSeats(supabase, 'delegation-1');

		// The organisers decide both orders, on the committee editor.
		expect(seating.groups.map((group) => group.committee.abbreviation)).toEqual(['UNSC', 'HRC']);
		expect(seating.groups[0].seats.map((seat) => seat.id)).toEqual(['seat-unsc-1', 'seat-unsc-2']);
		expect(seating.groups[1].seats.map((seat) => seat.id)).toEqual(['seat-hrc-1', 'seat-hrc-2']);
		expect(seating.groups[0].committee).toEqual({
			id: 'committee-1',
			name: 'Security Council',
			abbreviation: 'UNSC',
			level: 'advanced'
		});
	});

	it('fills a holder in from the profiles query and leaves an empty seat without one', async () => {
		const { supabase } = createStandInSupabase({
			tables: {
				seats: {
					rows: [
						delegationSeatRow({ id: 'seat-1', position: 1, user_id: 'user-1' }),
						delegationSeatRow({ id: 'seat-2', name: 'United Kingdom', position: 2 })
					]
				},
				delegation_members: { rows: [{ user_id: 'user-1' }] },
				profiles: { rows: [seatsPageProfileRow({ avatar_path: 'avatars/luis.jpg' })] }
			}
		});

		const seating = await listDelegationSeats(supabase, 'delegation-1');

		expect(seating.groups[0].seats[0].holder).toEqual({
			userId: 'user-1',
			fullName: 'Luis Ortega',
			avatarPath: 'avatars/luis.jpg',
			experienceLevel: 'intermediate'
		});
		expect(seating.groups[0].seats[1].holder).toBeNull();
	});

	it('still names the holder of a seat whose account has gone since', async () => {
		const { supabase } = createStandInSupabase({
			tables: {
				seats: { rows: [delegationSeatRow({ user_id: 'user-9' })] },
				profiles: { rows: [] }
			}
		});

		const seating = await listDelegationSeats(supabase, 'delegation-1');

		// An empty name where somebody is sitting would read as a free seat, and
		// the seat is not free. It is the same word the organiser's table uses.
		expect(seating.groups[0].seats[0].holder).toEqual({
			userId: 'user-9',
			fullName: 'Deleted account',
			avatarPath: null,
			experienceLevel: null
		});
	});

	it('leaves a member who holds a seat out of the unseated list, and sorts the rest by name', async () => {
		const { supabase } = createStandInSupabase({
			tables: {
				seats: { rows: [delegationSeatRow({ user_id: 'user-1' })] },
				delegation_members: {
					rows: [{ user_id: 'user-1' }, { user_id: 'user-2' }, { user_id: 'user-3' }]
				},
				profiles: {
					rows: [
						seatsPageProfileRow(),
						seatsPageProfileRow({ id: 'user-2', full_name: 'Tom Bell' }),
						seatsPageProfileRow({ id: 'user-3', full_name: 'Ana Ruiz', experience_level: 'none' })
					]
				}
			}
		});

		const seating = await listDelegationSeats(supabase, 'delegation-1');

		expect(seating.unseatedMembers).toEqual([
			{ userId: 'user-3', fullName: 'Ana Ruiz', experienceLevel: 'none', avatarPath: null },
			{ userId: 'user-2', fullName: 'Tom Bell', experienceLevel: 'intermediate', avatarPath: null }
		]);
	});

	it('leaves a member with no profile row out of the unseated list', async () => {
		const { supabase } = createStandInSupabase({
			tables: {
				delegation_members: { rows: [{ user_id: 'user-1' }, { user_id: 'user-4' }] },
				profiles: { rows: [seatsPageProfileRow()] }
			}
		});

		const seating = await listDelegationSeats(supabase, 'delegation-1');

		// The list is what the "Choose member" dropdown offers, and a name nobody
		// can read is not a name a head can choose from it.
		expect(seating.unseatedMembers).toEqual([
			{
				userId: 'user-1',
				fullName: 'Luis Ortega',
				experienceLevel: 'intermediate',
				avatarPath: null
			}
		]);
	});

	it('raises when the seats cannot be read', async () => {
		const { supabase } = createStandInSupabase({
			tables: { seats: { message: 'connection closed' } }
		});

		await expect(listDelegationSeats(supabase, 'delegation-1')).rejects.toThrow(
			'Could not read the seats of the delegation'
		);
	});

	it('raises when the names cannot be read, rather than showing a page of deleted accounts', async () => {
		const { supabase } = createStandInSupabase({
			tables: {
				seats: { rows: [delegationSeatRow({ user_id: 'user-1' })] },
				profiles: { message: 'connection closed' }
			}
		});

		await expect(listDelegationSeats(supabase, 'delegation-1')).rejects.toThrow(
			'Could not read the names of the delegation members'
		);
	});
});

describe('assignDelegationSeat', () => {
	it('writes user_id and nothing else, on the seat it was given', async () => {
		const { supabase, queries } = createStandInSupabase({
			tables: { seats: { rows: [{ id: 'seat-1' }] } }
		});

		expect(await assignDelegationSeat(supabase, 'seat-1', 'user-1')).toBeNull();

		// `check_seat_allocation` refuses a head who changes any other column, and
		// it refuses the whole update rather than ignoring the extra field.
		expect(queries[0].table).toBe('seats');
		expect(queries[0].update).toEqual({ user_id: 'user-1' });
		expect(queries[0].eq).toEqual([['id', 'seat-1']]);
		// The id is read back so that an update Row Level Security turned away can
		// be told apart from one that wrote a row.
		expect(queries[0].columns).toBe('id');
	});

	it('says the seat is not this delegation’s when nothing was written and nothing failed', async () => {
		const { supabase } = createStandInSupabase({ tables: { seats: { rows: [] } } });

		// Row Level Security refusing an update comes back with no error and no
		// rows, which is what a seat of another delegation looks like from here.
		expect(await assignDelegationSeat(supabase, 'seat-1', 'user-1')).toBe('not_your_delegation');
	});

	it('reads the trigger’s "already has a seat" sentence as already_seated', async () => {
		const { supabase } = createStandInSupabase({
			tables: { seats: { message: 'That person already has a seat in this conference' } }
		});

		expect(await assignDelegationSeat(supabase, 'seat-1', 'user-1')).toBe('already_seated');
	});

	it('reads the trigger’s "not a member" sentence as not_a_member', async () => {
		const { supabase } = createStandInSupabase({
			tables: {
				seats: {
					message: 'That person is not a member of the delegation this seat is reserved for'
				}
			}
		});

		expect(await assignDelegationSeat(supabase, 'seat-1', 'user-1')).toBe('not_a_member');
	});

	it('reads the trigger’s "conference has started" sentence as locked', async () => {
		const { supabase } = createStandInSupabase({
			tables: {
				seats: { message: 'The conference has started. Ask the organisers to change a seat.' }
			}
		});

		expect(await assignDelegationSeat(supabase, 'seat-1', 'user-1')).toBe('locked');
	});

	it('raises on a failure that was not written for a head to read', async () => {
		const { supabase } = createStandInSupabase({
			tables: { seats: { message: 'connection closed' } }
		});

		await expect(assignDelegationSeat(supabase, 'seat-1', 'user-1')).rejects.toThrow(
			'Could not assign the seat'
		);
	});
});

describe('unassignDelegationSeat', () => {
	it('writes an empty user_id on the seat it was given', async () => {
		const { supabase, queries } = createStandInSupabase({
			tables: { seats: { rows: [{ id: 'seat-1' }] } }
		});

		expect(await unassignDelegationSeat(supabase, 'seat-1')).toBeNull();

		expect(queries[0].update).toEqual({ user_id: null });
		expect(queries[0].eq).toEqual([['id', 'seat-1']]);
	});

	it('then removes the file of the position paper the database deleted', async () => {
		vi.mocked(removeOrphanedDocumentFiles).mockClear();
		const { supabase } = createStandInSupabase({
			tables: { seats: { rows: [{ id: 'seat-1' }] } }
		});

		await unassignDelegationSeat(supabase, 'seat-1');

		expect(removeOrphanedDocumentFiles).toHaveBeenCalledOnce();
	});

	it('removes nothing when the seat was not written', async () => {
		vi.mocked(removeOrphanedDocumentFiles).mockClear();
		const { supabase } = createStandInSupabase({ tables: { seats: { rows: [] } } });

		await unassignDelegationSeat(supabase, 'seat-1');

		expect(removeOrphanedDocumentFiles).not.toHaveBeenCalled();
	});

	it('reads the trigger’s "conference has started" sentence as locked', async () => {
		const { supabase } = createStandInSupabase({
			tables: {
				seats: { message: 'The conference has started. Ask the organisers to change a seat.' }
			}
		});

		expect(await unassignDelegationSeat(supabase, 'seat-1')).toBe('locked');
	});

	it('says the seat is not this delegation’s when nothing was written and nothing failed', async () => {
		const { supabase } = createStandInSupabase({ tables: { seats: { rows: [] } } });

		expect(await unassignDelegationSeat(supabase, 'seat-1')).toBe('not_your_delegation');
	});

	it('raises on a failure that was not written for a head to read', async () => {
		const { supabase } = createStandInSupabase({
			tables: { seats: { message: 'connection closed' } }
		});

		await expect(unassignDelegationSeat(supabase, 'seat-1')).rejects.toThrow(
			'Could not empty the seat'
		);
	});
});

describe('readMemberName', () => {
	it('answers with the name on the profile', async () => {
		const { supabase, queries } = createStandInSupabase({
			tables: { profiles: { row: { full_name: 'Sara Kaya' } } }
		});

		expect(await readMemberName(supabase, 'user-5')).toBe('Sara Kaya');
		expect(queries[0].eq).toEqual([['id', 'user-5']]);
	});

	it('answers with a word that still reads as a sentence when there is no profile', async () => {
		const { supabase } = createStandInSupabase();

		// The name goes into "{name} is not in this delegation.", so the fallback
		// has to be something that can start that sentence.
		expect(await readMemberName(supabase, 'user-5')).toBe(UNKNOWN_MEMBER_NAME);
	});
});

// The head's members page, `/delegations/[delegationId]/members`, built by T70.
// The other half of the pair the seats tests above belong to. What the database
// itself refuses a head — the last head stepping down, a member who is sitting
// in a seat, a plain member reading somebody else's private details — is Row
// Level Security's and the two triggers' decision and is tested in
// `tests/db/delegations.test.ts`. These tests are about the requests this module
// builds, what it makes of the answers, and which of the three words each
// action answers with.

/** One `delegation_members` row as the members page reads it. */
function delegationMemberRow(changes: Record<string, unknown> = {}) {
	return {
		user_id: 'user-1',
		role: 'member',
		joined_at: '2026-10-04T09:00:00Z',
		...changes
	};
}

/** One `profiles` row as the members page reads it: the institution is on this one. */
function membersPageProfileRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'user-1',
		full_name: 'Luis Ortega',
		avatar_path: 'avatars/luis.jpg',
		institution_name: 'Lycee Francais de La Haye',
		experience_level: 'intermediate',
		...changes
	};
}

/** One `delegation_member_details` row: the two private facts a head may read. */
function memberDetailsRow(changes: Record<string, unknown> = {}) {
	return {
		user_id: 'user-1',
		phone: '+31 6 1234 5678',
		dietary_requirements: 'Vegetarian',
		...changes
	};
}

describe('listDelegationMembers', () => {
	it('asks for the memberships, the delegation’s own seats, the profiles and the details', async () => {
		const { supabase, queries } = createStandInSupabase({
			tables: {
				delegation_members: {
					rows: [delegationMemberRow(), delegationMemberRow({ user_id: 'user-2' })]
				},
				seats: { rows: [delegationSeatRow({ user_id: 'user-1' })] },
				profiles: { rows: [membersPageProfileRow()] },
				delegation_member_details: { rows: [memberDetailsRow()] }
			}
		});

		await listDelegationMembers(supabase, 'delegation-1');

		expect(queries[0].table).toBe('delegation_members');
		expect(queries[0].columns).toBe('user_id, role, joined_at');
		expect(queries[0].eq).toEqual([['delegation_id', 'delegation-1']]);

		// The delegation's own seats, with no conference id anywhere: nobody in this
		// delegation can hold a seat in the same conference by another road, which is
		// what `check_one_route_per_conference` guarantees.
		expect(queries[1].table).toBe('seats');
		expect(queries[1].eq).toEqual([['delegation_id', 'delegation-1']]);

		expect(queries[2].table).toBe('profiles');
		expect(queries[2].columns).toBe(
			'id, full_name, avatar_path, institution_name, experience_level'
		);
		expect(queries[2].in).toEqual([['id', ['user-1', 'user-2']]]);

		// The view a head reads, and not `profile_details`: two columns, for this
		// delegation's members only (security review 2026-10-10, M19).
		expect(queries[3].table).toBe('delegation_member_details');
		expect(queries[3].columns).toBe('user_id, phone, dietary_requirements');
		expect(queries[3].eq).toEqual([['delegation_id', 'delegation-1']]);
		expect(queries[3].in).toEqual([['user_id', ['user-1', 'user-2']]]);
	});

	it('puts the profile, the seat and the private details on the member they belong to', async () => {
		const { supabase } = createStandInSupabase({
			tables: {
				delegation_members: { rows: [delegationMemberRow()] },
				seats: { rows: [delegationSeatRow({ user_id: 'user-1' })] },
				profiles: { rows: [membersPageProfileRow()] },
				delegation_member_details: { rows: [memberDetailsRow()] }
			}
		});

		expect(await listDelegationMembers(supabase, 'delegation-1')).toEqual([
			{
				userId: 'user-1',
				fullName: 'Luis Ortega',
				avatarPath: 'avatars/luis.jpg',
				institutionName: 'Lycee Francais de La Haye',
				experienceLevel: 'intermediate',
				role: 'member',
				joinedAt: '2026-10-04T09:00:00Z',
				seat: {
					seatName: 'France',
					countryCode: 'FR',
					committeeName: 'Security Council',
					committeeAbbreviation: 'UNSC'
				},
				// No date of birth: the head's view has no such column.
				details: { dateOfBirth: null, phone: '+31 6 1234 5678', dietaryRequirements: 'Vegetarian' }
			}
		]);
	});

	it('leaves the seat empty for a member nobody has seated yet', async () => {
		const { supabase } = createStandInSupabase({
			tables: {
				delegation_members: { rows: [delegationMemberRow()] },
				// A seat the organisers reserved for the group with nobody in it.
				seats: { rows: [delegationSeatRow()] },
				profiles: { rows: [membersPageProfileRow()] }
			}
		});

		const members = await listDelegationMembers(supabase, 'delegation-1');

		expect(members[0].seat).toBeNull();
	});

	it('returns the heads first and then the oldest membership first', async () => {
		const { supabase } = createStandInSupabase({
			tables: {
				delegation_members: {
					rows: [
						delegationMemberRow({ user_id: 'newer-member', joined_at: '2026-10-05T09:00:00Z' }),
						delegationMemberRow({ user_id: 'older-member', joined_at: '2026-10-04T09:00:00Z' }),
						delegationMemberRow({
							user_id: 'head',
							role: 'head',
							joined_at: '2026-10-01T09:00:00Z'
						})
					]
				}
			}
		});

		const members = await listDelegationMembers(supabase, 'delegation-1');

		// The order itself is `sortDelegationMembers` in `$lib/delegations.ts`, which
		// has its own tests; this only proves that it is the rule being used.
		expect(members.map((member) => member.userId)).toEqual([
			'head',
			'older-member',
			'newer-member'
		]);
	});

	it('still lists a member whose profile has gone, under a word for a deleted account', async () => {
		const { supabase } = createStandInSupabase({
			tables: {
				delegation_members: { rows: [delegationMemberRow()] },
				profiles: { rows: [] }
			}
		});

		const members = await listDelegationMembers(supabase, 'delegation-1');

		// They really are still in the delegation, so a blank row would be a lie.
		expect(members[0].fullName).toBe('Deleted account');
		expect(members[0].avatarPath).toBeNull();
		expect(members[0].institutionName).toBeNull();
		expect(members[0].experienceLevel).toBe('none');
	});

	it('asks for no profiles and no details at all when the delegation has nobody in it', async () => {
		const { supabase, queries } = createStandInSupabase();

		expect(await listDelegationMembers(supabase, 'delegation-1')).toEqual([]);

		// `.in('id', [])` is a request that cannot match anything, so neither is sent.
		expect(queries.some((query) => query.table === 'profiles')).toBe(false);
		expect(queries.some((query) => query.table === 'delegation_member_details')).toBe(false);
	});

	it('leaves the details null on every row when the caller may not read them', async () => {
		const { supabase } = createStandInSupabase({
			tables: {
				delegation_members: { rows: [delegationMemberRow()] },
				profiles: { rows: [membersPageProfileRow()] },
				// The view answers only the heads of the delegation, so a plain member
				// reading the page is answered nothing rather than refused.
				delegation_member_details: { rows: [] }
			}
		});

		const members = await listDelegationMembers(supabase, 'delegation-1');

		expect(members).toHaveLength(1);
		expect(members[0].details).toBeNull();
	});

	it('reads a refusal of the details as no details rather than as a fault', async () => {
		const { supabase } = createStandInSupabase({
			tables: {
				delegation_members: { rows: [delegationMemberRow()] },
				profiles: { rows: [membersPageProfileRow()] },
				// The page has nothing to put behind the "Details" toggle either way,
				// so a refusal is not an error page.
				delegation_member_details: {
					message: 'permission denied for view delegation_member_details'
				}
			}
		});

		const members = await listDelegationMembers(supabase, 'delegation-1');

		expect(members).toHaveLength(1);
		expect(members[0].details).toBeNull();
	});

	it('raises when the memberships cannot be read', async () => {
		const { supabase } = createStandInSupabase({
			tables: { delegation_members: { message: 'connection closed' } }
		});

		await expect(listDelegationMembers(supabase, 'delegation-1')).rejects.toThrow(
			'Could not read the members of the delegation'
		);
	});

	it('raises when the profiles cannot be read, because anybody signed in may read them', async () => {
		const { supabase } = createStandInSupabase({
			tables: {
				delegation_members: { rows: [delegationMemberRow()] },
				profiles: { message: 'connection closed' }
			}
		});

		await expect(listDelegationMembers(supabase, 'delegation-1')).rejects.toThrow(
			'Could not read the names of the delegation members'
		);
	});
});

describe('setDelegationMemberRole', () => {
	it('writes the role and nothing else, on the one membership it was given', async () => {
		const { supabase, queries } = createStandInSupabase({
			tables: { delegation_members: { rows: [{ user_id: 'user-1' }] } }
		});

		expect(await setDelegationMemberRole(supabase, 'delegation-1', 'user-1', 'head')).toBe(
			'written'
		);

		// `protect_delegation_member_columns` refuses a head who touches any other
		// column, and it refuses the whole update rather than ignoring the extra field.
		expect(queries[0].table).toBe('delegation_members');
		expect(queries[0].update).toEqual({ role: 'head' });
		expect(queries[0].eq).toEqual([
			['delegation_id', 'delegation-1'],
			['user_id', 'user-1']
		]);
		// The id is read back so that an update Row Level Security turned away can be
		// told apart from one that wrote a row.
		expect(queries[0].columns).toBe('user_id');
	});

	it('reads the trigger’s "needs at least one head" sentence as last_head', async () => {
		const { supabase } = createStandInSupabase({
			tables: {
				delegation_members: {
					message: 'A delegation needs at least one head. Make somebody else a head first.'
				}
			}
		});

		expect(await setDelegationMemberRole(supabase, 'delegation-1', 'user-1', 'member')).toBe(
			'last_head'
		);
	});

	it('says nobody with that id is a member when nothing was written and nothing failed', async () => {
		const { supabase } = createStandInSupabase({
			tables: { delegation_members: { rows: [] } }
		});

		// Row Level Security refusing an update comes back with no error and no rows,
		// and both keys were on the query, so there is nothing else this can mean.
		expect(await setDelegationMemberRole(supabase, 'delegation-1', 'user-1', 'head')).toBe(
			'not_a_member'
		);
	});

	it('raises on a failure that was not written for a head to read', async () => {
		const { supabase } = createStandInSupabase({
			tables: { delegation_members: { message: 'connection closed' } }
		});

		await expect(
			setDelegationMemberRole(supabase, 'delegation-1', 'user-1', 'head')
		).rejects.toThrow('Could not change the role of the member');
	});
});

describe('removeDelegationMember', () => {
	it('deletes the one membership it was given', async () => {
		const { supabase, queries } = createStandInSupabase({
			tables: { delegation_members: { rows: [{ user_id: 'user-1' }] } }
		});

		expect(await removeDelegationMember(supabase, 'delegation-1', 'user-1')).toBe('removed');

		expect(queries[0].table).toBe('delegation_members');
		expect(queries[0].isDelete).toBe(true);
		expect(queries[0].eq).toEqual([
			['delegation_id', 'delegation-1'],
			['user_id', 'user-1']
		]);
		expect(queries[0].columns).toBe('user_id');
	});

	it('says it was refused when nothing was deleted and nothing failed', async () => {
		const { supabase } = createStandInSupabase({
			tables: { delegation_members: { rows: [] } }
		});

		// The delete policy asks that the person hold none of the delegation's seats,
		// so a seated member is turned away silently. A policy that matched nothing
		// cannot say which half of it failed; the action, which has just read the
		// member list, is the half that knows.
		expect(await removeDelegationMember(supabase, 'delegation-1', 'user-1')).toBe('refused');
	});

	it('raises when the last head is being removed, which the page checks first', async () => {
		const { supabase } = createStandInSupabase({
			tables: {
				delegation_members: {
					message: 'A delegation needs at least one head. Make somebody else a head first.'
				}
			}
		});

		// Reaching the trigger means the delegation changed underneath the page, and a
		// flash saying somebody was removed who is still there would be worse.
		await expect(removeDelegationMember(supabase, 'delegation-1', 'user-1')).rejects.toThrow(
			'Could not remove the member from the delegation'
		);
	});
});

// -----------------------------------------------------------------------------
// The organiser's review page
// -----------------------------------------------------------------------------
// Everything below belongs to `/manage/[slug]/delegations/[delegationId]`,
// where one school's request is read in full and decided. `$lib/delegation-review.ts`
// has its own tests for the wording of every refusal and every flash; these
// are only about the requests this module builds and what it makes of the
// answers.

/** One `delegations` row as the organiser's review page reads it. */
function organiserDelegationDetailRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'delegation-1',
		conference_id: 'conference-1',
		name: 'Lycee Francais Delegation',
		institution_name: 'Lycee Francais de La Haye',
		country_code: 'FR',
		status: 'submitted',
		requested_seats: 12,
		note: 'Two chaperones travel with us.',
		submitted_at: '2026-10-03T09:00:00Z',
		decided_at: null,
		decision_note: null,
		...changes
	};
}

/** One `invoices` row as the Invoices card on the review page reads it. */
function invoiceRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'invoice-1',
		number: 'thimun-2027-0001',
		description: 'Delegation member fee (12 seats)',
		amount_cents: 120000,
		currency: 'usd',
		status: 'sent',
		...changes
	};
}

describe('listDelegationInvoices', () => {
	it('asks for one delegation’s invoices, newest first', async () => {
		const { supabase, queries } = createStandInSupabase({
			tables: { invoices: { rows: [invoiceRow()] } }
		});

		await listDelegationInvoices(supabase, 'delegation-1');

		expect(queries[0].table).toBe('invoices');
		expect(queries[0].columns).toBe('id, number, description, amount_cents, currency, status');
		expect(queries[0].eq).toEqual([['delegation_id', 'delegation-1']]);
		expect(queries[0].order).toEqual([['created_at', false]]);
	});

	it('renames every column into the shape the Invoices card reads', async () => {
		const { supabase } = createStandInSupabase({
			tables: { invoices: { rows: [invoiceRow()] } }
		});

		expect(await listDelegationInvoices(supabase, 'delegation-1')).toEqual([
			{
				id: 'invoice-1',
				number: 'thimun-2027-0001',
				description: 'Delegation member fee (12 seats)',
				amountCents: 120000,
				currency: 'usd',
				status: 'sent'
			}
		]);
	});

	it('answers with an empty list rather than nothing, for a delegation with no invoice yet', async () => {
		const { supabase } = createStandInSupabase();

		expect(await listDelegationInvoices(supabase, 'delegation-1')).toEqual([]);
	});

	it('raises when the invoices cannot be read', async () => {
		const { supabase } = createStandInSupabase({
			tables: { invoices: { message: 'connection closed' } }
		});

		await expect(listDelegationInvoices(supabase, 'delegation-1')).rejects.toThrow(
			'Could not read the invoices of the delegation'
		);
	});
});

describe('getDelegationForOrganiser', () => {
	it('asks for the delegation by id and by its conference together', async () => {
		const { supabase, queries } = createStandInSupabase({
			tables: { delegations: { row: organiserDelegationDetailRow() } }
		});

		await getDelegationForOrganiser(supabase, 'conference-1', 'delegation-1');

		expect(queries[0].table).toBe('delegations');
		// The organisers' note is not a column of the delegation any more; it is
		// read from `delegation_internal_notes`, a table only they can read.
		expect(queries[0].columns).toBe(
			'id, conference_id, name, institution_name, country_code, status, requested_seats, note, submitted_at, decided_at, decision_note'
		);
		expect(queries[0].eq).toEqual([
			['id', 'delegation-1'],
			['conference_id', 'conference-1']
		]);
	});

	it('answers with null when there is no such delegation, or it belongs to another conference', async () => {
		const { supabase } = createStandInSupabase();

		expect(await getDelegationForOrganiser(supabase, 'conference-1', 'delegation-1')).toBeNull();
	});

	it('treats an id that is not a uuid as not found', async () => {
		const { supabase } = createStandInSupabase({
			tables: {
				delegations: { message: 'invalid input syntax for type uuid', code: '22P02' }
			}
		});

		expect(await getDelegationForOrganiser(supabase, 'conference-1', 'nonsense')).toBeNull();
	});

	it('answers with null for a draft, without reading the members, seats or invoices', async () => {
		const { supabase, queries } = createStandInSupabase({
			tables: { delegations: { row: organiserDelegationDetailRow({ status: 'draft' }) } }
		});

		expect(await getDelegationForOrganiser(supabase, 'conference-1', 'delegation-1')).toBeNull();
		// A group the head has not sent yet is nothing here, so the three lists
		// that only matter for a real request are never even asked for.
		expect(tablesRead(queries)).toEqual(['delegations']);
	});

	it('maps every column, and brings the members, seats and invoices along', async () => {
		const { supabase } = createStandInSupabase({
			tables: {
				delegations: { row: organiserDelegationDetailRow() },
				delegation_internal_notes: { row: { note: 'Ask about their travel dates.' } },
				delegation_members: { rows: [delegationMemberRow()] },
				seats: { rows: [delegationSeatRow({ user_id: 'user-1' })] },
				profiles: { rows: [membersPageProfileRow()] },
				invoices: { rows: [invoiceRow()] }
			}
		});

		const detail = await getDelegationForOrganiser(supabase, 'conference-1', 'delegation-1');

		expect(detail?.delegation).toEqual({
			id: 'delegation-1',
			conferenceId: 'conference-1',
			name: 'Lycee Francais Delegation',
			institutionName: 'Lycee Francais de La Haye',
			countryCode: 'FR',
			status: 'submitted',
			requestedSeats: 12,
			note: 'Two chaperones travel with us.',
			submittedAt: '2026-10-03T09:00:00Z',
			decidedAt: null,
			decisionNote: null,
			internalNote: 'Ask about their travel dates.'
		});
		expect(detail?.members).toHaveLength(1);
		expect(detail?.seatGroups).toHaveLength(1);
		expect(detail?.invoices).toEqual([
			{
				id: 'invoice-1',
				number: 'thimun-2027-0001',
				description: 'Delegation member fee (12 seats)',
				amountCents: 120000,
				currency: 'usd',
				status: 'sent'
			}
		]);
	});
	it("reads the members' private details through the two views, not profile_details", async () => {
		const { supabase, queries } = createStandInSupabase({
			tables: {
				delegations: { row: organiserDelegationDetailRow() },
				delegation_members: { rows: [delegationMemberRow()] },
				profiles: { rows: [membersPageProfileRow()] },
				staff_contact_details: { rows: [{ user_id: 'user-1', email: null, phone: '+31 6 1' }] },
				staff_welfare_details: { rows: [] }
			}
		});

		const detail = await getDelegationForOrganiser(supabase, 'conference-1', 'delegation-1');

		// The contact view answered and the welfare view did not, so the welfare
		// facts are empty rather than the member having no details at all.
		expect(detail?.members[0].details).toEqual({
			dateOfBirth: null,
			phone: '+31 6 1',
			dietaryRequirements: null
		});
		expect(tablesRead(queries)).toContain('staff_contact_details');
	});

	it('gives a member neither view answers for no details at all', async () => {
		const { supabase } = createStandInSupabase({
			tables: {
				delegations: { row: organiserDelegationDetailRow() },
				delegation_members: { rows: [delegationMemberRow()] },
				profiles: { rows: [membersPageProfileRow()] }
			}
		});

		const detail = await getDelegationForOrganiser(supabase, 'conference-1', 'delegation-1');

		expect(detail?.members[0].details).toBeNull();
	});
});

describe('saveDelegationDecisionNote', () => {
	it('writes the decision note and nothing else, on the one delegation it was given', async () => {
		const { supabase, queries } = createStandInSupabase();

		await saveDelegationDecisionNote(supabase, 'delegation-1', 'Welcome aboard.');

		expect(queries[0].table).toBe('delegations');
		expect(queries[0].update).toEqual({ decision_note: 'Welcome aboard.' });
		expect(queries[0].eq).toEqual([['id', 'delegation-1']]);
	});

	it('raises when the note cannot be written', async () => {
		const { supabase } = createStandInSupabase({
			tables: { delegations: { message: 'connection closed' } }
		});

		await expect(
			saveDelegationDecisionNote(supabase, 'delegation-1', 'Welcome aboard.')
		).rejects.toThrow('Could not save the decision note');
	});
});

describe('rejectDelegation', () => {
	it('writes the rejection, the decider and the note the head reads', async () => {
		const { supabase, queries } = createStandInSupabase();

		await rejectDelegation(supabase, 'delegation-1', 'organiser-1', 'Not enough detail provided.');

		expect(queries[0].table).toBe('delegations');
		expect(queries[0].update).toMatchObject({
			status: 'rejected',
			decided_by: 'organiser-1',
			decision_note: 'Not enough detail provided.'
		});
		// `decided_at` is read off the clock inside the function, so only its shape
		// is checked here: an exact value would make the test flaky.
		expect(typeof (queries[0].update as Record<string, unknown>).decided_at).toBe('string');
		expect(queries[0].eq).toEqual([['id', 'delegation-1']]);
	});

	it('raises when the delegation cannot be turned down', async () => {
		const { supabase } = createStandInSupabase({
			tables: { delegations: { message: 'connection closed' } }
		});

		await expect(
			rejectDelegation(supabase, 'delegation-1', 'organiser-1', 'Not enough detail provided.')
		).rejects.toThrow('Could not turn the delegation down');
	});
});

describe('updateDelegationInternalNote', () => {
	it('writes the internal note into its own table, keyed on the one delegation it was given', async () => {
		const { supabase, queries } = createStandInSupabase();

		await updateDelegationInternalNote(supabase, 'delegation-1', 'Ask about their travel dates.');

		// An upsert: the first note makes the row and every later one changes it.
		expect(queries[0].table).toBe('delegation_internal_notes');
		expect(queries[0].upsert).toEqual({
			delegation_id: 'delegation-1',
			note: 'Ask about their travel dates.'
		});
	});

	it('stores null for an emptied box rather than an empty string', async () => {
		const { supabase, queries } = createStandInSupabase();

		await updateDelegationInternalNote(supabase, 'delegation-1', '');

		expect(queries[0].upsert).toEqual({ delegation_id: 'delegation-1', note: null });
	});

	it('raises when the note cannot be written', async () => {
		const { supabase } = createStandInSupabase({
			tables: { delegation_internal_notes: { message: 'connection closed' } }
		});

		await expect(
			updateDelegationInternalNote(supabase, 'delegation-1', 'Ask about their travel dates.')
		).rejects.toThrow('Could not save the note');
	});
});
