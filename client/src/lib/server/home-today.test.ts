import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TodayConference } from '$lib/home-today';
import { readTodayFacts, type CommitteeOfToday, type TodayParts } from './home-today';

// What `readTodayFacts` asks the database and how it puts the answers
// together. The stand-in client below answers each table with whatever the
// test gave it and records the filters it was handed. Which rows Row Level
// Security lets a reader have is tested in `tests/db/`.

/** Midday in London on the second day of Northbridge MUN. */
const NOW = new Date('2026-09-28T11:00:00Z');

const NORTHBRIDGE: TodayConference = {
	id: 'conference-northbridge',
	slug: 'northbridge-mun',
	name: 'Northbridge MUN',
	startDate: '2026-09-27',
	endDate: '2026-09-29',
	timezone: 'Europe/London'
};

/** A committee of Northbridge's that the reader sits in, which a test changes as it needs. */
function makeCommittee(overrides: Partial<CommitteeOfToday> = {}): CommitteeOfToday {
	return {
		id: 'committee-unsc',
		heading: 'UNSC',
		committeeSlug: 'unsc',
		conference: NORTHBRIDGE,
		isChair: false,
		...overrides
	};
}

/** Parts with nothing in them, which each test fills in. */
function makeParts(overrides: Partial<TodayParts> = {}): TodayParts {
	return {
		committees: [],
		organisedConferences: [],
		volunteerConferences: [],
		delegations: [],
		...overrides
	};
}

/** One filter call the stand-in recorded: its method, then its arguments. */
type RecordedCall = [string, ...unknown[]];

/**
 * A client whose `from(table)` answers with `rowsByTable[table]`, and which
 * writes down every filter each table's query was given.
 */
function makeStandIn(rowsByTable: Record<string, unknown[]>) {
	const callsByTable: Record<string, RecordedCall[]> = {};

	function from(table: string) {
		const calls: RecordedCall[] = [];
		callsByTable[table] = calls;

		const query = {
			select: (...args: unknown[]) => record('select', args),
			in: (...args: unknown[]) => record('in', args),
			gt: (...args: unknown[]) => record('gt', args),
			lt: (...args: unknown[]) => record('lt', args),
			order: (...args: unknown[]) => record('order', args),
			overrideTypes: () => Promise.resolve({ data: rowsByTable[table] ?? [], error: null })
		};

		function record(method: string, args: unknown[]) {
			calls.push([method, ...args]);
			return query;
		}

		return query;
	}

	const supabase = { from } as unknown as SupabaseClient;

	return { supabase, callsByTable };
}

describe('readTodayFacts', () => {
	it('asks nothing when the reader has no part in a conference running today', async () => {
		const { supabase, callsByTable } = makeStandIn({});

		const facts = await readTodayFacts(supabase, makeParts(), NOW);

		expect(callsByTable).toEqual({});
		expect(facts).toEqual({ ...makeParts(), events: [] });
	});

	it('gives each committee the session its state points at', async () => {
		const { supabase, callsByTable } = makeStandIn({
			committee_state: [
				{
					committee_id: 'committee-unsc',
					committees: { conference_id: NORTHBRIDGE.id },
					committee_sessions: { name: 'Session 1', status: 'in_progress' }
				}
			]
		});

		const facts = await readTodayFacts(
			supabase,
			makeParts({
				committees: [
					makeCommittee({ isChair: true }),
					makeCommittee({ id: 'committee-hrc', heading: 'HRC', isChair: true })
				]
			}),
			NOW
		);

		expect(facts.committees.map((committee) => committee.currentSession)).toEqual([
			{ name: 'Session 1', status: 'in_progress' },
			null
		]);
		expect(callsByTable.committee_state).toContainEqual([
			'in',
			'committees.conference_id',
			[NORTHBRIDGE.id]
		]);
		// A chair's line never says what is next, but the hero and "Today's
		// programme" show what is on, so today's programme is still read.
		expect(facts.committees.map((committee) => committee.nextEvent)).toEqual([null, null]);
		expect(callsByTable.schedule_events).toContainEqual(['in', 'conference_id', [NORTHBRIDGE.id]]);
	});

	it('finds a seat’s next event today, its own or the whole conference’s', async () => {
		const { supabase, callsByTable } = makeStandIn({
			schedule_events: [
				{
					// Began half an hour ago: still on, so it is read, but it is not "next".
					id: 'event-1',
					title: 'Committee session I',
					starts_at: '2026-09-28T10:30:00Z',
					ends_at: '2026-09-28T11:30:00Z',
					location: 'Room 2.04',
					committee_id: 'committee-unsc',
					conference_id: NORTHBRIDGE.id
				},
				{
					id: 'event-2',
					title: 'HRC session',
					starts_at: '2026-09-28T12:00:00Z',
					ends_at: '2026-09-28T13:00:00Z',
					location: null,
					committee_id: 'committee-hrc',
					conference_id: NORTHBRIDGE.id
				},
				{
					id: 'event-3',
					title: 'Committee session II',
					starts_at: '2026-09-28T13:00:00Z',
					ends_at: '2026-09-28T15:00:00Z',
					location: 'Main hall',
					committee_id: null,
					conference_id: NORTHBRIDGE.id
				}
			]
		});

		const facts = await readTodayFacts(supabase, makeParts({ committees: [makeCommittee()] }), NOW);

		expect(facts.committees[0].nextEvent).toEqual({
			title: 'Committee session II',
			startsAt: '2026-09-28T13:00:00Z'
		});
		// The in-progress event is handed on for the hero and "Today's programme".
		expect(facts.events.map((event) => event.title)).toEqual([
			'Committee session I',
			'HRC session',
			'Committee session II'
		]);
		expect(facts.events[0]).toEqual({
			id: 'event-1',
			title: 'Committee session I',
			startsAt: '2026-09-28T10:30:00Z',
			endsAt: '2026-09-28T11:30:00Z',
			conferenceId: NORTHBRIDGE.id,
			committeeId: 'committee-unsc',
			location: 'Room 2.04'
		});
		// Every event that has not ended yet, up to a day ahead.
		expect(callsByTable.schedule_events).toEqual(
			expect.arrayContaining([
				['in', 'conference_id', [NORTHBRIDGE.id]],
				['gt', 'ends_at', '2026-09-28T11:00:00.000Z'],
				['lt', 'starts_at', '2026-09-29T11:00:00.000Z']
			])
		);
	});

	it('leaves out an event that falls tomorrow where the conference is', async () => {
		const { supabase } = makeStandIn({
			schedule_events: [
				{
					// 23:30 UTC is 00:30 on the 29th in London.
					id: 'event-4',
					title: 'Opening of day 3',
					starts_at: '2026-09-28T23:30:00Z',
					ends_at: '2026-09-29T01:00:00Z',
					location: null,
					committee_id: null,
					conference_id: NORTHBRIDGE.id
				}
			]
		});

		const facts = await readTodayFacts(supabase, makeParts({ committees: [makeCommittee()] }), NOW);

		expect(facts.committees[0].nextEvent).toBeNull();
	});

	it('counts an organised conference’s rooms and the ones in session', async () => {
		const { supabase } = makeStandIn({
			committee_state: [
				{
					committee_id: 'committee-unsc',
					committees: { conference_id: NORTHBRIDGE.id },
					committee_sessions: { name: 'Session 1', status: 'in_progress' }
				},
				{
					committee_id: 'committee-hrc',
					committees: { conference_id: NORTHBRIDGE.id },
					committee_sessions: { name: 'Session 1', status: 'ended' }
				},
				{
					committee_id: 'committee-disec',
					committees: { conference_id: NORTHBRIDGE.id },
					committee_sessions: null
				}
			]
		});

		const facts = await readTodayFacts(
			supabase,
			makeParts({ organisedConferences: [NORTHBRIDGE] }),
			NOW
		);

		expect(facts.organisedConferences).toEqual([
			{ conference: NORTHBRIDGE, committeeCount: 3, inSessionCount: 1 }
		]);
	});

	it('reads the programme of every running conference of the reader’s in one query', async () => {
		const hague: TodayConference = { ...NORTHBRIDGE, id: 'conference-hague', slug: 'hague' };
		const delft: TodayConference = { ...NORTHBRIDGE, id: 'conference-delft', slug: 'delft' };
		const { supabase, callsByTable } = makeStandIn({});

		await readTodayFacts(
			supabase,
			makeParts({
				volunteerConferences: [hague],
				delegations: [{ delegationId: 'delegation-1', conference: delft }]
			}),
			NOW
		);

		expect(callsByTable.schedule_events).toContainEqual([
			'in',
			'conference_id',
			[hague.id, delft.id]
		]);
	});

	it('refuses to go on when the database refuses a lookup', async () => {
		const failing = {
			from: () => {
				const query = {
					select: () => query,
					in: () => query,
					gt: () => query,
					lt: () => query,
					order: () => query,
					overrideTypes: () =>
						Promise.resolve({ data: null, error: { message: 'permission denied' } })
				};
				return query;
			}
		} as unknown as SupabaseClient;

		await expect(
			readTodayFacts(failing, makeParts({ organisedConferences: [NORTHBRIDGE] }), NOW)
		).rejects.toThrow("Could not read today's committee rooms: permission denied");
	});
});
