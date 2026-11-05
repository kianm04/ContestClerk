import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	listCommitteePapers,
	mayWritePaper,
	readCommitteeFormat,
	readCommitteePaper,
	readMyPaperSeat,
	readPaperCommittee,
	readPaperPeople
} from './committee-papers';

// These tests are about how this module reads its rows into what the pages
// use. Which papers and seats a reader may see at all is Row Level Security's
// decision, tested with a real database in `tests/db/committee-papers.test.ts`.

/** One query the module sent: its table and the filters it asked for. */
type RecordedQuery = { table: string; eq: [string, unknown][] };

/** A database answer: rows, or an error with a Postgres code. */
type Answer = { data: unknown; error: { code: string; message: string } | null };

/**
 * A stand-in Supabase client that answers each table with what it is handed
 * (nothing, by default) and `rpc` with `rpcAnswer`, recording every query.
 */
function createStandIn(answers: Record<string, Answer> = {}, rpcAnswer?: Answer) {
	const queries: RecordedQuery[] = [];

	function from(table: string) {
		const query: RecordedQuery = { table, eq: [] };
		queries.push(query);

		// Every step hands the builder back, which is what lets the module chain them.
		const builder = {
			select: () => builder,
			in: () => builder,
			order: () => builder,
			eq: (column: string, value: unknown) => {
				query.eq.push([column, value]);
				return builder;
			},
			single: () => builder,
			maybeSingle: () => builder,
			overrideTypes: () => Promise.resolve(answers[table] ?? { data: null, error: null })
		};

		return builder;
	}

	function rpc() {
		return Promise.resolve(rpcAnswer ?? { data: null, error: null });
	}

	return { supabase: { from, rpc } as unknown as SupabaseClient, queries };
}

const FAILURE = { data: null, error: { code: 'XX000', message: 'down' } };

describe('readPaperCommittee', () => {
	const SETTINGS = {
		format: 'standard',
		crisis_allows_resolutions: false,
		has_working_papers: true,
		paper_words: 'submitters',
		topics: ['Lethal autonomous weapons systems', 'Small arms and light weapons']
	};

	it("reads the committee's settings for papers with the topic on its agenda", async () => {
		const { supabase } = createStandIn({
			committees: { data: SETTINGS, error: null },
			committee_state: { data: { agenda_topic: 'Small arms and light weapons' }, error: null }
		});

		expect(await readPaperCommittee(supabase, 'disec')).toEqual({
			format: 'standard',
			crisisAllowsResolutions: false,
			hasWorkingPapers: true,
			paperWords: 'submitters',
			topics: ['Lethal autonomous weapons systems', 'Small arms and light weapons'],
			agendaTopic: 'Small arms and light weapons'
		});
	});

	it('has no agenda topic before the committee has a state of its own', async () => {
		const { supabase } = createStandIn({ committees: { data: SETTINGS, error: null } });

		expect((await readPaperCommittee(supabase, 'disec')).agendaTopic).toBeNull();
	});

	it('throws when the settings cannot be read', async () => {
		const { supabase } = createStandIn({ committees: FAILURE });

		await expect(readPaperCommittee(supabase, 'disec')).rejects.toThrow(
			"Could not read the committee's settings"
		);
	});
});

describe('readCommitteeFormat', () => {
	it("reads the one committee's format", async () => {
		const { supabase, queries } = createStandIn({
			committees: { data: { format: 'crisis' }, error: null }
		});

		expect(await readCommitteeFormat(supabase, 'jcc')).toBe('crisis');
		expect(queries).toEqual([{ table: 'committees', eq: [['id', 'jcc']] }]);
	});

	it('throws when the committee cannot be read', async () => {
		const { supabase } = createStandIn({ committees: FAILURE });

		await expect(readCommitteeFormat(supabase, 'jcc')).rejects.toThrow(
			"Could not read the committee's format"
		);
	});
});

describe('readMyPaperSeat', () => {
	it("reads the reader's seat in this committee", async () => {
		const { supabase, queries } = createStandIn({
			seats: { data: { id: 'seat-austria', name: 'Austria', kind: 'country' }, error: null }
		});

		expect(await readMyPaperSeat(supabase, 'disec', 'clara')).toEqual({
			id: 'seat-austria',
			name: 'Austria',
			isObserver: false
		});
		expect(queries[0].eq).toEqual([
			['committee_id', 'disec'],
			['user_id', 'clara']
		]);
	});

	it('says when the seat is an observer’s', async () => {
		const { supabase } = createStandIn({
			seats: { data: { id: 'seat-holy-see', name: 'Holy See', kind: 'observer' }, error: null }
		});

		expect(await readMyPaperSeat(supabase, 'disec', 'clara')).toMatchObject({ isObserver: true });
	});

	it('is null for a reader who holds no seat here, as staff', async () => {
		const { supabase } = createStandIn();

		expect(await readMyPaperSeat(supabase, 'disec', 'chair')).toBeNull();
	});
});

describe('listCommitteePapers', () => {
	const ROWS = [
		{
			id: 'paper-1',
			kind: 'working_paper',
			status: 'writing',
			title: 'Meaningful human control',
			topic: 'Lethal autonomous weapons systems',
			topic_number: null,
			sequence: null,
			is_open_for_signatures: true,
			updated_at: '2099-03-01T09:00:00.000Z'
		},
		{
			id: 'paper-2',
			kind: 'working_paper',
			status: 'introduced',
			title: 'Export controls',
			topic: 'Small arms and light weapons',
			topic_number: 2,
			sequence: 1,
			is_open_for_signatures: false,
			updated_at: '2099-03-01T08:00:00.000Z'
		}
	];

	it("lists the committee's papers, each with what the reader's seat is on it", async () => {
		const { supabase } = createStandIn({
			committee_papers: { data: ROWS, error: null },
			committee_paper_seats: { data: [{ paper_id: 'paper-1', role: 'signatory' }], error: null }
		});

		const papers = await listCommitteePapers(supabase, 'disec', 'seat-austria');

		expect(papers).toEqual([
			{
				id: 'paper-1',
				kind: 'working_paper',
				status: 'writing',
				title: 'Meaningful human control',
				topic: 'Lethal autonomous weapons systems',
				topicNumber: null,
				sequence: null,
				isOpenForSignatures: true,
				updatedAt: '2099-03-01T09:00:00.000Z',
				myRole: 'signatory'
			},
			expect.objectContaining({ id: 'paper-2', topicNumber: 2, sequence: 1, myRole: null })
		]);
	});

	it('asks for no roles for a reader without a seat', async () => {
		const { supabase, queries } = createStandIn({ committee_papers: { data: ROWS, error: null } });

		const papers = await listCommitteePapers(supabase, 'disec', null);

		expect(papers.map((paper) => paper.myRole)).toEqual([null, null]);
		expect(queries.map((query) => query.table)).toEqual(['committee_papers']);
	});

	it('throws when the papers cannot be read', async () => {
		const { supabase } = createStandIn({ committee_papers: FAILURE });

		await expect(listCommitteePapers(supabase, 'disec', null)).rejects.toThrow(
			"Could not read the committee's papers"
		);
	});
});

describe('readCommitteePaper', () => {
	const ROW = {
		id: 'paper-1',
		kind: 'working_paper',
		status: 'writing',
		title: 'Meaningful human control',
		topic: 'Lethal autonomous weapons systems',
		topic_number: null,
		sequence: null,
		is_open_for_signatures: false,
		signatures_opened_at: null,
		updated_at: '2099-03-01T09:00:00.000Z',
		submitted_at: null,
		lead_seat_id: 'seat-austria',
		body_markdown: 'We propose a treaty.',
		revision: 4,
		updated_by: 'daniel'
	};

	it('reads one paper of the committee', async () => {
		const { supabase, queries } = createStandIn({ committee_papers: { data: ROW, error: null } });

		expect(await readCommitteePaper(supabase, 'disec', 'paper-1')).toEqual({
			id: 'paper-1',
			kind: 'working_paper',
			status: 'writing',
			title: 'Meaningful human control',
			topic: 'Lethal autonomous weapons systems',
			topicNumber: null,
			sequence: null,
			isOpenForSignatures: false,
			signaturesOpenedAt: null,
			submittedAt: null,
			leadSeatId: 'seat-austria',
			body: 'We propose a treaty.',
			revision: 4,
			updatedAt: '2099-03-01T09:00:00.000Z',
			updatedById: 'daniel'
		});
		expect(queries[0].eq).toEqual([
			['id', 'paper-1'],
			['committee_id', 'disec']
		]);
	});

	it('reads a paper with no text of its own as empty', async () => {
		const { supabase } = createStandIn({
			committee_papers: { data: { ...ROW, body_markdown: null }, error: null }
		});

		expect(await readCommitteePaper(supabase, 'disec', 'paper-1')).toMatchObject({ body: '' });
	});

	it('is null for a paper the reader may not read, or an id that is not one', async () => {
		const hidden = createStandIn();
		const typed = createStandIn({
			committee_papers: { data: null, error: { code: '22P02', message: 'invalid uuid' } }
		});

		expect(await readCommitteePaper(hidden.supabase, 'disec', 'paper-1')).toBeNull();
		expect(await readCommitteePaper(typed.supabase, 'disec', 'not-an-id')).toBeNull();
	});

	it('throws on any other failure', async () => {
		const { supabase } = createStandIn({ committee_papers: FAILURE });

		await expect(readCommitteePaper(supabase, 'disec', 'paper-1')).rejects.toThrow(
			'Could not read the paper'
		);
	});
});

describe('readPaperPeople', () => {
	const SEATS = [
		{
			seat_id: 'seat-mexico',
			role: 'author',
			seat: { name: 'Mexico', country_code: 'MX', user_id: 'daniel' }
		},
		{
			seat_id: 'seat-austria',
			role: 'author',
			seat: { name: 'Austria', country_code: 'AT', user_id: 'clara' }
		},
		{
			seat_id: 'seat-chile',
			role: 'signatory',
			seat: { name: 'Chile', country_code: 'CL', user_id: null }
		}
	];

	const PROFILES = [
		{ id: 'daniel', full_name: 'Daniel Okafor' },
		{ id: 'clara', full_name: 'Clara Whitfield' }
	];

	it('puts the lead first and keeps everybody else in the order they were added', async () => {
		const { supabase } = createStandIn({
			committee_paper_seats: { data: SEATS, error: null },
			profiles: { data: PROFILES, error: null }
		});

		const people = await readPaperPeople(
			supabase,
			{ id: 'paper-1', leadSeatId: 'seat-austria' },
			'seat-austria'
		);

		expect(people).toEqual([
			{
				seatId: 'seat-austria',
				seatName: 'Austria',
				countryCode: 'AT',
				holderId: 'clara',
				holderName: 'Clara Whitfield',
				role: 'author',
				isLead: true,
				isMine: true
			},
			{
				seatId: 'seat-mexico',
				seatName: 'Mexico',
				countryCode: 'MX',
				holderId: 'daniel',
				holderName: 'Daniel Okafor',
				role: 'author',
				isLead: false,
				isMine: false
			},
			{
				seatId: 'seat-chile',
				seatName: 'Chile',
				countryCode: 'CL',
				holderId: null,
				holderName: null,
				role: 'signatory',
				isLead: false,
				isMine: false
			}
		]);
	});

	it('asks for no names when nobody sits in the seats', async () => {
		const empty = [{ ...SEATS[2], role: 'author' }];
		const { supabase, queries } = createStandIn({
			committee_paper_seats: { data: empty, error: null }
		});

		const people = await readPaperPeople(supabase, { id: 'paper-1', leadSeatId: null }, null);

		expect(people.map((person) => person.holderName)).toEqual([null]);
		expect(queries.map((query) => query.table)).toEqual(['committee_paper_seats']);
	});

	it('throws when the seats cannot be read', async () => {
		const { supabase } = createStandIn({ committee_paper_seats: FAILURE });

		await expect(
			readPaperPeople(supabase, { id: 'paper-1', leadSeatId: null }, null)
		).rejects.toThrow('Could not read who writes the paper');
	});
});

describe('mayWritePaper', () => {
	it("is the database's own answer, and false for anything but yes", async () => {
		const yes = createStandIn({}, { data: true, error: null });
		const no = createStandIn({}, { data: false, error: null });
		const nothing = createStandIn({}, { data: null, error: null });

		expect(await mayWritePaper(yes.supabase, 'paper-1')).toBe(true);
		expect(await mayWritePaper(no.supabase, 'paper-1')).toBe(false);
		expect(await mayWritePaper(nothing.supabase, 'paper-1')).toBe(false);
	});

	it('throws when the database cannot say', async () => {
		const { supabase } = createStandIn({}, FAILURE);

		await expect(mayWritePaper(supabase, 'paper-1')).rejects.toThrow(
			'Could not check who may write the paper'
		);
	});
});
