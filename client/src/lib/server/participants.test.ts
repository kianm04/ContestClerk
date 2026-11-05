import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MyPermissions } from '$lib/permissions';
import {
	listParticipants,
	readPaidInvoiceNumber,
	withExportDetails,
	withPrivateDetails
} from './participants';

/** An administrator of this conference, who sees every private detail of it. */
const ADMINISTRATOR: MyPermissions = {
	held: [{ permission: 'administrator', scope: 'conference' }],
	committeeIds: [],
	rank: -1
};

/** Somebody who lists the participants and holds neither detail permission here. */
const LISTER: MyPermissions = {
	held: [{ permission: 'read_participants', scope: 'conference' }],
	committeeIds: [],
	rank: 2
};

/** A chair holding contact details per committee, assigned to this one committee. */
function chairOf(committeeId: string): MyPermissions {
	return {
		held: [
			{ permission: 'read_participants', scope: 'committees' },
			{ permission: 'read_contact_details', scope: 'committees' }
		],
		committeeIds: [committeeId],
		rank: 1
	};
}

// These tests are about the requests this module builds and what it makes of
// the answers. Nothing here talks to a database; the stand-in client below
// writes down what it was asked for and answers with fixed rows. Whether an
// organiser may read these rows at all is Row Level Security's decision and is
// tested in `tests/db/`.

/** What one query was asking for. */
type RecordedQuery = {
	table: string;
	columns: string;
	eq: [string, unknown][];
	neq: [string, unknown][];
	not: [string, string, unknown][];
	in: [string, unknown[]][];
	range: [number, number] | null;
};

/** What the stand-in answers for one relation. */
type TableAnswer = { rows?: Record<string, unknown>[]; message?: string };

/** One step of the query. Every step hands the builder back, which is what chains them. */
type QueryBuilder = {
	select: (columns: string) => QueryBuilder;
	eq: (column: string, value: unknown) => QueryBuilder;
	neq: (column: string, value: unknown) => QueryBuilder;
	not: (column: string, operator: string, value: unknown) => QueryBuilder;
	in: (column: string, values: unknown[]) => QueryBuilder;
	order: (column: string, options: unknown) => QueryBuilder;
	range: (first: number, last: number) => QueryBuilder;
	limit: (count: number) => QueryBuilder;
	overrideTypes: () => Promise<{ data: unknown; error: { message: string } | null }>;
};

/**
 * A stand-in Supabase client. Every step records its arguments and hands the
 * same builder back, the way the real client's builder does. An `.in(...)`
 * keeps only the rows whose column is in the list, so the invoices asked for
 * by seat and the ones asked for by delegation come back apart, and a query
 * with a window gets that window of the rows.
 */
function createStandInSupabase(answers: Record<string, TableAnswer>): {
	supabase: SupabaseClient;
	queries: RecordedQuery[];
} {
	const queries: RecordedQuery[] = [];

	function builderFor(table: string): QueryBuilder {
		const query: RecordedQuery = {
			table,
			columns: '',
			eq: [],
			neq: [],
			not: [],
			in: [],
			range: null
		};
		queries.push(query);

		const answer = answers[table] ?? {};

		function listAnswer(): Record<string, unknown>[] {
			let rows = answer.rows ?? [];

			for (const [column, values] of query.in) {
				rows = rows.filter((row) => values.includes(row[column]));
			}

			if (query.range !== null) {
				rows = rows.slice(query.range[0], query.range[1] + 1);
			}

			return rows;
		}

		const builder: QueryBuilder = {
			select: (columns) => {
				query.columns = columns;
				return builder;
			},
			eq: (column, value) => {
				query.eq.push([column, value]);
				return builder;
			},
			neq: (column, value) => {
				query.neq.push([column, value]);
				return builder;
			},
			not: (column, operator, value) => {
				query.not.push([column, operator, value]);
				return builder;
			},
			in: (column, values) => {
				query.in.push([column, values]);
				return builder;
			},
			order: () => builder,
			range: (first, last) => {
				query.range = [first, last];
				return builder;
			},
			limit: () => builder,
			overrideTypes: async () =>
				answer.message
					? { data: null, error: { message: answer.message } }
					: { data: listAnswer(), error: null }
		};

		return builder;
	}

	const supabase = { from: builderFor } as unknown as SupabaseClient;

	return { supabase, queries };
}

const CONFERENCE_ID = '11111111-1111-1111-1111-111111111111';

const UNSC = {
	conference_id: CONFERENCE_ID,
	id: 'committee-unsc',
	name: 'Security Council',
	abbreviation: 'UNSC',
	position: 1
};

/** An individual delegate's seat. */
const FRANCE_SEAT = {
	id: 'seat-france',
	name: 'France',
	kind: 'country',
	country_code: 'FR',
	user_id: 'user-anna',
	application_id: 'application-anna',
	committees: UNSC,
	delegation_id: null
};

/** The delegation Bruno's seat was allocated to, as the `participant_delegations` view names it. */
const LYCEE = { id: 'delegation-lycee', name: 'Lycée Français' };

/** A delegation member's seat. */
const BRAZIL_SEAT = {
	id: 'seat-brazil',
	name: 'Brazil',
	kind: 'country',
	country_code: 'BR',
	user_id: 'user-bruno',
	application_id: null,
	committees: UNSC,
	delegation_id: LYCEE.id
};

const PROFILES = [
	{
		id: 'user-anna',
		full_name: 'Anna Kowalski',
		pronouns: 'she/her',
		avatar_path: null,
		institution_name: 'Lyceum 7',
		country_code: 'PL',
		experience_level: 'intermediate'
	},
	{
		id: 'user-bruno',
		full_name: 'Bruno Alves',
		pronouns: null,
		avatar_path: null,
		institution_name: 'Colégio Santa Cruz',
		country_code: 'BR',
		experience_level: 'beginner'
	},
	{
		id: 'user-head',
		full_name: 'Hélène Dubois',
		pronouns: null,
		avatar_path: null,
		institution_name: null,
		country_code: null,
		experience_level: 'advanced'
	}
];

/** Anna's own invoice and the Lycée's group invoice. */
const INVOICES = [
	{
		id: 'invoice-anna',
		number: 'T-0001',
		status: 'unpaid',
		paid_at: null,
		seat_id: 'seat-france',
		delegation_id: null
	},
	{
		id: 'invoice-lycee',
		number: 'T-0002',
		status: 'paid',
		paid_at: '2026-09-01T10:00:00+00:00',
		seat_id: null,
		delegation_id: 'delegation-lycee'
	}
];

describe('listParticipants', () => {
	it('asks for this conference’s filled seats only', async () => {
		const { supabase, queries } = createStandInSupabase({ seats: { rows: [] } });

		await listParticipants(supabase, CONFERENCE_ID);

		const seatQuery = queries.find((query) => query.table === 'seats');
		expect(seatQuery?.columns).toContain('committees!inner(');
		expect(seatQuery?.eq).toContainEqual(['committees.conference_id', CONFERENCE_ID]);
		expect(seatQuery?.not).toContainEqual(['user_id', 'is', null]);
	});

	it('names each person, and gives a delegation member the group invoice', async () => {
		const { supabase } = createStandInSupabase({
			seats: { rows: [FRANCE_SEAT, BRAZIL_SEAT] },
			profiles: { rows: PROFILES },
			participant_delegations: { rows: [LYCEE] },
			invoices: { rows: INVOICES },
			documents: { rows: [{ seat_id: 'seat-brazil', review_status: 'approved' }] }
		});

		const [anna, bruno] = await listParticipants(supabase, CONFERENCE_ID);

		expect(anna.fullName).toBe('Anna Kowalski');
		expect(anna.seatCountryCode).toBe('FR');
		expect(anna.committee).toEqual({ id: UNSC.id, name: UNSC.name, abbreviation: 'UNSC' });
		expect(anna.invoice).toEqual({
			id: 'invoice-anna',
			number: 'T-0001',
			status: 'unpaid',
			paidAt: null,
			isGroupInvoice: false
		});
		expect(anna.paperStatus).toBe('missing');

		expect(bruno.delegation).toEqual({ id: 'delegation-lycee', name: 'Lycée Français' });
		expect(bruno.invoice?.id).toBe('invoice-lycee');
		expect(bruno.invoice?.isGroupInvoice).toBe(true);
		expect(bruno.paperStatus).toBe('approved');
	});

	it('shows a member’s own seat invoice before the delegation’s', async () => {
		const ownInvoice = { ...INVOICES[0], id: 'invoice-bruno', seat_id: 'seat-brazil' };
		const { supabase } = createStandInSupabase({
			seats: { rows: [BRAZIL_SEAT] },
			profiles: { rows: PROFILES },
			invoices: { rows: [ownInvoice, INVOICES[1]] }
		});

		const [bruno] = await listParticipants(supabase, CONFERENCE_ID);

		expect(bruno.invoice?.id).toBe('invoice-bruno');
		expect(bruno.invoice?.isGroupInvoice).toBe(false);
	});

	it('names the delegation through the participant_delegations view, never the delegations table', async () => {
		const { supabase, queries } = createStandInSupabase({
			seats: { rows: [BRAZIL_SEAT] },
			profiles: { rows: PROFILES },
			participant_delegations: { rows: [LYCEE] }
		});

		const [bruno] = await listParticipants(supabase, CONFERENCE_ID);

		expect(bruno.delegation).toEqual(LYCEE);

		// The table would hand a chair the join code; the view has none to give
		// (security review 2026-10-10, M18).
		const delegationQuery = queries.find((query) => query.table === 'participant_delegations');
		expect(delegationQuery?.columns).toBe('id, name');
		expect(delegationQuery?.in).toEqual([['id', [LYCEE.id]]]);
		expect(queries.some((query) => query.table === 'delegations')).toBe(false);
	});

	it('leaves a delegation the view did not name out rather than printing its id', async () => {
		const { supabase } = createStandInSupabase({
			seats: { rows: [BRAZIL_SEAT] },
			profiles: { rows: PROFILES },
			participant_delegations: { rows: [] }
		});

		const [bruno] = await listParticipants(supabase, CONFERENCE_ID);

		expect(bruno.delegation).toBeNull();
	});

	it('leaves cancelled invoices out of the question', async () => {
		const { supabase, queries } = createStandInSupabase({ seats: { rows: [FRANCE_SEAT] } });

		await listParticipants(supabase, CONFERENCE_ID);

		const invoiceQueries = queries.filter((query) => query.table === 'invoices');
		expect(invoiceQueries.every((query) => query.neq.some(([, value]) => value === 'void'))).toBe(
			true
		);
	});

	it('reads window after window until one comes back empty, so no seat is missed', async () => {
		const manySeats = Array.from({ length: 1203 }, (_, index) => ({
			...FRANCE_SEAT,
			id: `seat-${index}`,
			user_id: `user-${index}`
		}));
		const manyProfiles = manySeats.map((seat) => ({ ...PROFILES[0], id: seat.user_id }));
		const { supabase, queries } = createStandInSupabase({
			seats: { rows: manySeats },
			profiles: { rows: manyProfiles }
		});

		const participants = await listParticipants(supabase, CONFERENCE_ID);

		expect(participants).toHaveLength(1203);
		expect(new Set(participants.map((participant) => participant.seatId)).size).toBe(1203);

		// A hundred ids at a time, so no lookup carries a whole conference in its address.
		const profileQueries = queries.filter((query) => query.table === 'profiles');
		expect(profileQueries).toHaveLength(13);
		expect(profileQueries.every((query) => query.in[0][1].length <= 100)).toBe(true);
	});

	it('leaves out a seat whose person could not be read', async () => {
		const { supabase } = createStandInSupabase({
			seats: { rows: [FRANCE_SEAT] },
			profiles: { rows: [] }
		});

		expect(await listParticipants(supabase, CONFERENCE_ID)).toEqual([]);
	});

	it('says what went wrong when the seats cannot be read', async () => {
		const { supabase } = createStandInSupabase({ seats: { message: 'permission denied' } });

		await expect(listParticipants(supabase, CONFERENCE_ID)).rejects.toThrow(
			'Could not read the participants: permission denied'
		);
	});
});

describe('withPrivateDetails', () => {
	it('adds what the views answer, and null for everything else, in the same order', async () => {
		const { supabase: listing } = createStandInSupabase({
			seats: { rows: [FRANCE_SEAT, BRAZIL_SEAT] },
			profiles: { rows: PROFILES },
			invoices: { rows: INVOICES }
		});
		const participants = await listParticipants(listing, CONFERENCE_ID);
		// A reader with contact details only: the welfare view answers nothing.
		const { supabase } = createStandInSupabase({
			staff_contact_details: {
				rows: [{ user_id: 'user-bruno', email: 'bruno@example.com', phone: '+33 6 12 34 56 78' }]
			},
			staff_welfare_details: { rows: [] }
		});

		const [anna, bruno] = await withPrivateDetails(supabase, participants, ADMINISTRATOR);

		expect(anna.fullName).toBe(participants[0].fullName);
		expect(anna.email).toBeNull();
		expect(bruno.email).toBe('bruno@example.com');
		expect(bruno.phone).toBe('+33 6 12 34 56 78');
		expect(bruno.dateOfBirth).toBeNull();
	});

	/** Both people as `listParticipants` hands them over, and views that answer for Bruno. */
	async function brunoWithDetails() {
		const { supabase: listing } = createStandInSupabase({
			seats: { rows: [FRANCE_SEAT, BRAZIL_SEAT] },
			profiles: { rows: PROFILES },
			invoices: { rows: INVOICES }
		});
		const participants = await listParticipants(listing, CONFERENCE_ID);
		const { supabase } = createStandInSupabase({
			staff_contact_details: {
				rows: [{ user_id: 'user-bruno', email: 'bruno@example.com', phone: '+33 6 12 34 56 78' }]
			},
			staff_welfare_details: {
				rows: [
					{
						user_id: 'user-bruno',
						date_of_birth: '2008-04-11',
						dietary_requirements: 'Vegetarian',
						emergency_contact_name: null,
						emergency_contact_phone: null
					}
				]
			}
		});

		return { supabase, participants };
	}

	it('nulls what this conference’s permissions do not grant, even when a view answered', async () => {
		// The views answer for anybody taking part where the reader holds the
		// permission, which may be another conference altogether. This page is
		// about this conference, so only what the reader holds here is shown.
		const { supabase, participants } = await brunoWithDetails();

		const [, bruno] = await withPrivateDetails(supabase, participants, LISTER);

		expect(bruno.email).toBeNull();
		expect(bruno.phone).toBeNull();
		expect(bruno.dateOfBirth).toBeNull();
		expect(bruno.dietaryRequirements).toBeNull();
	});

	it('grants a chair the details of their own committee’s people, and no others', async () => {
		const { supabase, participants } = await brunoWithDetails();

		// Bruno sits in UNSC, so its chair sees his email and a chair of HRC does not.
		const [, brunoForUnsc] = await withPrivateDetails(
			supabase,
			participants,
			chairOf('committee-unsc')
		);
		const [, brunoForHrc] = await withPrivateDetails(
			supabase,
			participants,
			chairOf('committee-hrc')
		);

		expect(brunoForUnsc.email).toBe('bruno@example.com');
		// A chair with contact details alone never sees the welfare half.
		expect(brunoForUnsc.dateOfBirth).toBeNull();
		expect(brunoForHrc.email).toBeNull();
	});
});

describe('withExportDetails', () => {
	/** Anna and Bruno as `listParticipants` hands them over. */
	async function readBoth() {
		const { supabase } = createStandInSupabase({
			seats: { rows: [FRANCE_SEAT, BRAZIL_SEAT] },
			profiles: { rows: PROFILES },
			participant_delegations: { rows: [LYCEE] },
			invoices: { rows: INVOICES }
		});

		return listParticipants(supabase, CONFERENCE_ID);
	}

	it('adds the private details, the head and the confirmed awards, in the same order', async () => {
		const participants = await readBoth();
		const { supabase, queries } = createStandInSupabase({
			staff_contact_details: {
				rows: [{ user_id: 'user-anna', email: 'anna@example.com', phone: null }]
			},
			staff_welfare_details: {
				rows: [
					{
						user_id: 'user-anna',
						date_of_birth: '2008-04-11',
						dietary_requirements: 'Vegetarian',
						emergency_contact_name: null,
						emergency_contact_phone: null
					}
				]
			},
			delegation_members: { rows: [{ delegation_id: 'delegation-lycee', user_id: 'user-head' }] },
			profiles: { rows: PROFILES },
			awards: {
				rows: [
					{ seat_id: 'seat-france', user_id: null, title: 'Best Delegate' },
					{ seat_id: 'seat-france', user_id: 'user-anna', title: 'Best Position Paper' },
					// Won by whoever sat in Brazil before Bruno, so not his.
					{ seat_id: 'seat-brazil', user_id: 'user-before', title: 'Honourable Mention' }
				]
			}
		});

		const [anna, bruno] = await withExportDetails(supabase, participants, ADMINISTRATOR);

		expect(anna.email).toBe('anna@example.com');
		expect(anna.dateOfBirth).toBe('2008-04-11');
		expect(anna.dietaryRequirements).toBe('Vegetarian');
		expect(anna.delegationHeadName).toBeNull();
		expect(anna.awardTitles).toEqual(['Best Delegate', 'Best Position Paper']);

		expect(bruno.email).toBeNull();
		expect(bruno.delegationHeadName).toBe('Hélène Dubois');
		expect(bruno.awardTitles).toEqual([]);

		const awardQuery = queries.find((query) => query.table === 'awards');
		expect(awardQuery?.eq).toContainEqual(['status', 'confirmed']);
		const headQuery = queries.find((query) => query.table === 'delegation_members');
		expect(headQuery?.eq).toContainEqual(['role', 'head']);
	});

	it('says what went wrong when the private details cannot be read', async () => {
		const participants = await readBoth();
		const { supabase } = createStandInSupabase({ staff_welfare_details: { message: 'boom' } });

		await expect(withExportDetails(supabase, participants, ADMINISTRATOR)).rejects.toThrow(
			'Could not read the private details: boom'
		);
	});
});

describe('readPaidInvoiceNumber', () => {
	it('asks for a paid invoice of this seat and gives its number', async () => {
		const { supabase, queries } = createStandInSupabase({
			invoices: { rows: [{ number: 'T-0001' }] }
		});

		expect(await readPaidInvoiceNumber(supabase, 'seat-france')).toBe('T-0001');
		expect(queries[0].eq).toEqual([
			['seat_id', 'seat-france'],
			['status', 'paid']
		]);
	});

	it('answers null when there is none', async () => {
		const { supabase } = createStandInSupabase({ invoices: { rows: [] } });

		expect(await readPaidInvoiceNumber(supabase, 'seat-france')).toBeNull();
	});
});
