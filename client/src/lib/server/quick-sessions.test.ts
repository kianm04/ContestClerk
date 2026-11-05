import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { countryMember, memberFromName, type QuickSessionMember } from '$lib/quick-session';
import {
	createQuickSession,
	getQuickSession,
	membersOfSeats,
	quickSessionCommitteeSlug,
	QuickSessionRefusal,
	saveQuickSessionDelegations,
	seatWrites,
	type QuickSession,
	type QuickSessionSeat
} from './quick-sessions';

// These tests are about what the functions ask the database and how they read
// its answer. Nothing here talks to a database: the stand-in client below
// answers each call with what the test asked for and writes down what it was
// sent. What `create_quick_session` itself makes, and who may read a quick
// session, is tested in `tests/db/quick-sessions.test.ts`.

/** What one call to the stand-in client was. */
type RecordedCall = {
	/** The table `.from(...)` named, or the function `.rpc(...)` called. */
	target: string;
	eq: [string, unknown][];
	/** What `.rpc(...)` or `.upsert(...)` was sent. */
	sent: unknown;
	options: unknown;
};

/** A stand-in Supabase client answering by table or function name. */
function createStandInSupabase(
	answers: Record<string, { data?: unknown; error?: { message: string; code?: string } }>
) {
	const calls: RecordedCall[] = [];

	function builderFor(target: string, sent: unknown = null, options: unknown = null) {
		const call: RecordedCall = { target, eq: [], sent, options };
		calls.push(call);

		const answer = { data: answers[target]?.data ?? null, error: answers[target]?.error ?? null };

		// Every step hands the same builder back; awaiting it answers.
		const builder = {
			select: () => builder,
			order: () => builder,
			limit: () => builder,
			eq: (column: string, value: unknown) => {
				call.eq.push([column, value]);
				return builder;
			},
			overrideTypes: async () => answer,
			then: (resolve: (value: typeof answer) => unknown) => resolve(answer)
		};

		return builder;
	}

	const supabase = {
		// A read starts with `select` and a write with `upsert`, each its own call.
		from: (table: string) => ({
			select: () => builderFor(table),
			upsert: (rows: unknown, options: unknown) => builderFor(`${table}.upsert`, rows, options)
		}),
		rpc: (name: string, argumentsSent: unknown) => builderFor(name, argumentsSent)
	};

	return { supabase: supabase as unknown as SupabaseClient, calls };
}

const FRANCE = countryMember('FR');
const GERMANY = countryMember('DE');
const AMNESTY = memberFromName('Amnesty International') as QuickSessionMember;

describe('quickSessionCommitteeSlug', () => {
	it('slugifies the name, and falls back to "committee" for a name with nothing to keep', () => {
		expect(quickSessionCommitteeSlug('Thursday Practice GA')).toBe('thursday-practice-ga');
		expect(quickSessionCommitteeSlug('!!!')).toBe('committee');
	});
});

describe('createQuickSession', () => {
	const START = {
		committeeName: 'Thursday practice',
		agenda: 'Climate finance',
		speakingTimeSeconds: 90,
		timezone: 'Europe/Paris',
		members: [AMNESTY, FRANCE, GERMANY]
	};

	it('calls create_quick_session with the seats in the order given, and answers both slugs', async () => {
		const { supabase, calls } = createStandInSupabase({
			create_quick_session: {
				data: [{ conference_slug: 'quick-ab12cd34ef', committee_slug: 'thursday-practice' }]
			}
		});

		const address = await createQuickSession(supabase, START);

		expect(address).toEqual({
			conferenceSlug: 'quick-ab12cd34ef',
			committeeSlug: 'thursday-practice'
		});
		expect(calls[0].sent).toEqual({
			committee_name: 'Thursday practice',
			committee_slug: 'thursday-practice',
			topic: 'Climate finance',
			speaking_time_seconds: 90,
			seats: [
				{ name: 'Amnesty International', country_code: null },
				{ name: 'France', country_code: 'FR' },
				{ name: 'Germany', country_code: 'DE' }
			],
			timezone: 'Europe/Paris'
		});
	});

	it('throws when the database refuses, or answers with no address', async () => {
		const refused = createStandInSupabase({
			create_quick_session: { error: { message: 'permission denied', code: '42501' } }
		});
		const empty = createStandInSupabase({ create_quick_session: { data: [] } });

		await expect(createQuickSession(refused.supabase, START)).rejects.toThrow('permission denied');
		await expect(createQuickSession(refused.supabase, START)).rejects.not.toBeInstanceOf(
			QuickSessionRefusal
		);
		await expect(createQuickSession(empty.supabase, START)).rejects.toThrow('no address');
	});

	it("throws the function's own sentence as a QuickSessionRefusal, for the page to show", async () => {
		const capped = createStandInSupabase({
			create_quick_session: {
				error: { message: 'You already have 25 quick sessions running.', code: 'P0001' }
			}
		});

		await expect(createQuickSession(capped.supabase, START)).rejects.toThrow(
			new QuickSessionRefusal('You already have 25 quick sessions running.')
		);
	});
});

describe('getQuickSession', () => {
	it('reads the quick session by slug and kind, with its seats and whether a session runs', async () => {
		const { supabase, calls } = createStandInSupabase({
			conferences: {
				data: [
					{
						id: 'conference-1',
						slug: 'quick-ab12cd34ef',
						committees: [
							{ id: 'committee-1', slug: 'thursday-practice', name: 'Thursday practice' }
						]
					}
				]
			},
			seats: {
				data: [
					{ id: 'seat-fr', name: 'France', country_code: 'FR', is_available: true },
					{ id: 'seat-de', name: 'Germany', country_code: 'DE', is_available: false }
				]
			},
			committee_sessions: { data: [{ id: 'session-1' }] }
		});

		const quickSession = await getQuickSession(supabase, 'quick-ab12cd34ef');

		expect(calls[0].eq).toEqual([
			['slug', 'quick-ab12cd34ef'],
			['kind', 'quick_session']
		]);
		expect(calls.find((call) => call.target === 'committee_sessions')?.eq).toEqual([
			['committee_id', 'committee-1'],
			['status', 'in_progress']
		]);
		expect(quickSession).toEqual({
			conferenceId: 'conference-1',
			conferenceSlug: 'quick-ab12cd34ef',
			committeeId: 'committee-1',
			committeeSlug: 'thursday-practice',
			committeeName: 'Thursday practice',
			seats: [
				{ id: 'seat-fr', name: 'France', countryCode: 'FR', isAvailable: true },
				{ id: 'seat-de', name: 'Germany', countryCode: 'DE', isAvailable: false }
			],
			isSessionRunning: true
		});
	});

	it('answers null for a slug that is not a quick session the reader can read', async () => {
		const { supabase } = createStandInSupabase({ conferences: { data: [] } });

		expect(await getQuickSession(supabase, 'thimun-2027')).toBeNull();
	});
});

/** A seat of the fixture committee. */
function seat(
	id: string,
	name: string,
	countryCode: string | null,
	isAvailable = true
): QuickSessionSeat {
	return { id, name, countryCode, isAvailable };
}

describe('membersOfSeats', () => {
	it('turns the shown seats into members, a country by its code, and leaves hidden seats out', () => {
		const members = membersOfSeats([
			seat('seat-fr', 'France', 'FR'),
			seat('seat-ai', 'Amnesty International', null),
			seat('seat-de', 'Germany', 'DE', false)
		]);

		expect(members).toEqual([
			{ value: 'country:FR', name: 'France', countryCode: 'FR' },
			{ value: 'name:Amnesty International', name: 'Amnesty International', countryCode: null }
		]);
	});
});

describe('seatWrites', () => {
	const SEATS = [
		seat('seat-fr', 'France', 'FR'),
		seat('seat-de', 'Germany', 'DE'),
		seat('seat-br', 'Brazil', 'BR', false),
		seat('seat-press', 'Press', null)
	];

	it('keeps members as they were, adds new ones, shows a hidden one again and hides the removed', () => {
		const writes = seatWrites('committee-1', SEATS, [
			AMNESTY,
			countryMember('BR'),
			FRANCE,
			memberFromName('press') as QuickSessionMember
		]);

		expect(writes).toEqual([
			{
				committee_id: 'committee-1',
				name: 'Amnesty International',
				kind: 'other',
				country_code: null,
				position: 0,
				is_available: true
			},
			{
				id: 'seat-br',
				committee_id: 'committee-1',
				name: 'Brazil',
				kind: 'country',
				country_code: 'BR',
				position: 1,
				is_available: true
			},
			{
				id: 'seat-fr',
				committee_id: 'committee-1',
				name: 'France',
				kind: 'country',
				country_code: 'FR',
				position: 2,
				is_available: true
			},
			{
				id: 'seat-press',
				committee_id: 'committee-1',
				name: 'Press',
				kind: 'other',
				country_code: null,
				position: 3,
				is_available: true
			},
			{
				id: 'seat-de',
				committee_id: 'committee-1',
				name: 'Germany',
				kind: 'country',
				country_code: 'DE',
				position: 4,
				is_available: false
			}
		]);
	});

	it('never deletes a seat: every existing seat is written back, shown or hidden', () => {
		const writes = seatWrites('committee-1', SEATS, [FRANCE, GERMANY]);
		const writtenIds = writes.map((write) => write.id);

		expect(writtenIds).toEqual(['seat-fr', 'seat-de', 'seat-br', 'seat-press']);
	});
});

describe('saveQuickSessionDelegations', () => {
	const QUICK_SESSION: QuickSession = {
		conferenceId: 'conference-1',
		conferenceSlug: 'quick-ab12cd34ef',
		committeeId: 'committee-1',
		committeeSlug: 'thursday-practice',
		committeeName: 'Thursday practice',
		seats: [seat('seat-fr', 'France', 'FR')],
		isSessionRunning: false
	};

	it('writes every seat in one upsert by id, letting the database give a new seat its id', async () => {
		const { supabase, calls } = createStandInSupabase({});

		await saveQuickSessionDelegations(supabase, QUICK_SESSION, [FRANCE, GERMANY]);

		expect(calls).toHaveLength(1);
		expect(calls[0].target).toBe('seats.upsert');
		expect(calls[0].options).toEqual({ onConflict: 'id', defaultToNull: false });
		expect(calls[0].sent).toEqual(
			seatWrites('committee-1', QUICK_SESSION.seats, [FRANCE, GERMANY])
		);
	});

	it('throws when the database refuses', async () => {
		const { supabase } = createStandInSupabase({
			'seats.upsert': { error: { message: 'permission denied' } }
		});

		await expect(saveQuickSessionDelegations(supabase, QUICK_SESSION, [FRANCE])).rejects.toThrow(
			'permission denied'
		);
	});
});
