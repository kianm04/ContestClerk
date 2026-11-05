import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { EMPTY_CONFERENCE_QUERY, type ConferenceQuery } from '$lib/conferences';
import { EMPTY_CONFERENCE_DETAILS, type ConferenceEditValues } from '$lib/conference-details';
import {
	countConferencesOpenForApplications,
	createConference,
	deleteConference,
	getConferenceBySlug,
	getConferencePage,
	hasInvoices,
	hasSeatedDelegates,
	listConferences,
	listConferencesByIds,
	listConferencesForOrganizations,
	listConferencesToExplore,
	listCountries,
	listManagedConferences,
	listOrganizationConferences,
	readConferenceCurrency,
	toConference,
	removeConferenceImage,
	setConferenceStatus,
	updateConference,
	uploadConferenceImage,
	wasEverPublished,
	type ConferenceRow
} from './conferences';

// These tests are about the request each lookup builds: which relation it reads,
// which conditions end up on the query, in which order the results are sorted,
// and what the module makes of the answer it gets back. Nothing here talks to a
// database; the stand-in client below writes down what it was asked for instead
// of answering it. Whether the database then lets a visitor read those rows is
// Row Level Security's decision, and that is tested in
// `tests/db/conferences-access.test.ts`.

/** A moment in the middle of a day, for the tests where the exact time does not matter. */
const NOW = new Date('2026-09-17T12:00:00Z');

/** The day `NOW` falls on in UTC, which is the cut-off the directory uses. */
const TODAY = '2026-09-17';

/**
 * The view every read goes through: the `conferences` table with the name and the
 * slug of its organization joined on. The tests name it so that a change back to
 * the plain table fails here rather than in the browser.
 */
const CONFERENCE_VIEW = 'conferences_with_organization';

/** The table underneath it, which only `createConference` touches, because a view cannot be written to. */
const CONFERENCE_TABLE = 'conferences';

/**
 * The three `.or(...)` conditions that mean "taking applications at `NOW`".
 * They are separate calls because Supabase joins them with AND: the window must
 * have opened and must not have shut, and a missing date on either side counts
 * as open on that side, except that a conference the organisers will open by
 * hand is not open until they have set an opening date.
 *
 * The directory's "open only" filter, the home page's cards and the home page's
 * count all have to send exactly these, which is why they are written once here.
 */
const OPEN_APPLICATION_CONDITIONS = [
	'applications_open_at.is.null,applications_open_at.lte.2026-09-17T12:00:00.000Z',
	'applications_close_at.is.null,applications_close_at.gte.2026-09-17T12:00:00.000Z',
	'applications_open_at.not.is.null,application_open_mode.neq.manual'
];

/**
 * Everything the stand-in client wrote down about the queries it was given.
 *
 * Each field holds one kind of step, in the order the module called it, so a
 * test can read back `calls.or` as the text of every `.or(...)` and `calls.eq`
 * as the `[column, value]` pair of every `.eq(...)`.
 */
type RecordedCalls = {
	/** Every relation `.from(...)` was called with. Each lookup should only ever name one. */
	tables: string[];
	/**
	 * The options each `.select(...)` was given, or `{}` when it was given none.
	 * `{ count: 'exact', head: true }` is the pair that asks for the count on its own.
	 */
	selectOptions: SelectOptions[];
	eq: [string, unknown][];
	/** `[column, value]` for every `.neq(...)`, which asks for a column to be anything else. */
	neq: [string, unknown][];
	/** `[column, operator, value]` for every `.not(...)`, which turns one condition around. */
	not: [string, string, unknown][];
	or: string[];
	gte: [string, string][];
	lte: [string, string][];
	lt: [string, string][];
	/** `[column, values]` for every `.in(...)`, which asks for a column to be one of several. */
	in: [string, unknown[]][];
	/** The number each `.limit(...)` was given. */
	limit: number[];
	/** `[column, ascending]` for every `.order(...)`. */
	order: [string, boolean][];
	/**
	 * The whole options object of every `.order(...)`, for the one sort that also
	 * says where rows with no value in the column go.
	 */
	orderOptions: OrderOptions[];
	/** `[firstIndex, lastIndex]` for the one `.range(...)`. */
	range: [number, number][];
	/** The row each `.insert(...)` was given. */
	inserts: Record<string, unknown>[];
};

/**
 * The second argument of `.select(...)`: what a query wants besides the columns.
 * `count: 'exact'` asks for the number of matches as well, and `head: true` asks
 * for that number instead of the rows.
 */
type SelectOptions = { count?: string; head?: boolean };

/**
 * The second argument of `.order(...)`: which way to sort, and `nullsFirst`
 * for where the rows with no value go. Left out, Postgres puts them first on an
 * ascending sort.
 */
type OrderOptions = { ascending: boolean; nullsFirst?: boolean };

/** An error in the shape the real client reports one. */
type QueryError = { code?: string; message: string };

/** What an awaited list query answers with: the three fields the real client gives back. */
type QueryAnswer = {
	data: unknown[] | null;
	error: QueryError | null;
	count: number | null;
};

/** What `maybeSingle` answers with: one row rather than a list, or nothing at all. */
type SingleRowAnswer = {
	data: unknown;
	error: QueryError | null;
};

/** What the stand-in should answer with. Everything here has a harmless default. */
type StandInAnswers = {
	/** The rows a list query gives back. */
	conferenceRows?: unknown[];
	/**
	 * The number `count: 'exact'` reports, which counts every match and not only
	 * this page. `null` is what the real client answers with when it has no count
	 * to report, which the counting lookups have to cope with.
	 */
	total?: number | null;
	/** The one row `getConferenceBySlug` finds, or nothing when there is no such conference. */
	conferenceRow?: unknown;
	/** An error for a read, such as the out-of-range code. */
	conferenceError?: QueryError;
};

/**
 * The end of `getConferenceBySlug`'s chain. `maybeSingle` asks for one row, and
 * `overrideTypes` then only changes the type of the answer, not the answer.
 */
type SingleRowBuilder = {
	overrideTypes: () => Promise<SingleRowAnswer>;
};

/**
 * One step of a read. Every step hands the builder back, which is what lets the
 * next step be called on it.
 */
type ConferenceReadBuilder = {
	select: (columns: string, options?: SelectOptions) => ConferenceReadBuilder;
	eq: (column: string, value: unknown) => ConferenceReadBuilder;
	neq: (column: string, value: unknown) => ConferenceReadBuilder;
	not: (column: string, operator: string, value: unknown) => ConferenceReadBuilder;
	or: (filter: string) => ConferenceReadBuilder;
	gte: (column: string, value: string) => ConferenceReadBuilder;
	lte: (column: string, value: string) => ConferenceReadBuilder;
	lt: (column: string, value: string) => ConferenceReadBuilder;
	in: (column: string, values: unknown[]) => ConferenceReadBuilder;
	limit: (count: number) => ConferenceReadBuilder;
	order: (column: string, options: OrderOptions) => ConferenceReadBuilder;
	range: (firstIndex: number, lastIndex: number) => ConferenceReadBuilder;
	maybeSingle: () => SingleRowBuilder;
	overrideTypes: () => Promise<QueryAnswer>;
	then: (resolve: (answer: QueryAnswer) => void) => void;
};

/** The same, for the `conferences` table, which is only ever written to. */
type ConferenceWriteBuilder = {
	insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
};

/**
 * A stand-in Supabase client that writes down what was asked of it.
 *
 * The real client is a builder: `.from(...)` gives back an object with
 * `.select(...)` on it, `.select(...)` gives back one with `.eq(...)` on it, and
 * so on. Each step adds one condition to a query that is only sent once the
 * chain is awaited, and the chain can be awaited at any point because the
 * builder has a `then` method the way a promise does.
 *
 * This copies that shape. Every step records its arguments in `calls` and hands
 * the same builder back, so the module can chain as many steps as it likes, and
 * the awaited answer is whatever `answers` asked for.
 */
function createStandInSupabase(answers: StandInAnswers = {}): {
	supabase: SupabaseClient;
	calls: RecordedCalls;
} {
	const calls: RecordedCalls = {
		tables: [],
		selectOptions: [],
		eq: [],
		neq: [],
		not: [],
		or: [],
		gte: [],
		lte: [],
		lt: [],
		in: [],
		limit: [],
		order: [],
		orderOptions: [],
		range: [],
		inserts: []
	};

	const listAnswer: QueryAnswer = {
		data: answers.conferenceRows ?? [],
		error: answers.conferenceError ?? null,
		// A test that said nothing about the total does not care about it and gets a
		// harmless 0. A test that asked for `null` gets `null`, which is what the real
		// client answers with when it counted nothing.
		count: answers.total === undefined ? 0 : answers.total
	};

	const singleRowAnswer: SingleRowAnswer = {
		data: answers.conferenceRow ?? null,
		error: answers.conferenceError ?? null
	};

	const singleRowBuilder: SingleRowBuilder = {
		overrideTypes: async () => singleRowAnswer
	};

	const readBuilder: ConferenceReadBuilder = {
		// Which columns were asked for is not what these tests are about, so only the
		// options beside them are recorded: whether the query wanted the rows, the
		// count as well, or the count instead of them.
		select: (columns, options) => {
			calls.selectOptions.push(options ?? {});
			return readBuilder;
		},
		eq: (column, value) => {
			calls.eq.push([column, value]);
			return readBuilder;
		},
		neq: (column, value) => {
			calls.neq.push([column, value]);
			return readBuilder;
		},
		not: (column, operator, value) => {
			calls.not.push([column, operator, value]);
			return readBuilder;
		},
		or: (filter) => {
			calls.or.push(filter);
			return readBuilder;
		},
		gte: (column, value) => {
			calls.gte.push([column, value]);
			return readBuilder;
		},
		lte: (column, value) => {
			calls.lte.push([column, value]);
			return readBuilder;
		},
		lt: (column, value) => {
			calls.lt.push([column, value]);
			return readBuilder;
		},
		in: (column, values) => {
			calls.in.push([column, values]);
			return readBuilder;
		},
		limit: (count) => {
			calls.limit.push(count);
			return readBuilder;
		},
		order: (column, options) => {
			calls.order.push([column, options.ascending]);
			calls.orderOptions.push(options);
			return readBuilder;
		},
		range: (firstIndex, lastIndex) => {
			calls.range.push([firstIndex, lastIndex]);
			return readBuilder;
		},
		maybeSingle: () => singleRowBuilder,
		// `listConferences` ends its chain here. In the real client `overrideTypes`
		// changes the type of the answer and not the answer itself.
		overrideTypes: async () => listAnswer,
		// `listCountries` has no last step of its own: it awaits the chain straight
		// after `.gte(...)`. A `then` method is what makes that possible, here and
		// in the real client.
		then: (resolve) => resolve(listAnswer)
	};

	const writeBuilder: ConferenceWriteBuilder = {
		// The module awaits this step, so it is the answer itself rather than
		// another builder. The insert always succeeds here: what these tests are
		// about is which relation was written to, and with what.
		insert: async (row) => {
			calls.inserts.push(row);

			return { error: null };
		}
	};

	const supabase = {
		// The real `from` gives back a builder for one relation. Here each name gets
		// a builder that can do only what that name is for: the view can be read and
		// the table can be written to. Anything else is a mistake in the module, and
		// saying so out loud beats quietly answering the wrong question.
		from: (table: string) => {
			calls.tables.push(table);

			if (table === CONFERENCE_VIEW) {
				return readBuilder;
			}

			if (table === CONFERENCE_TABLE) {
				return writeBuilder;
			}

			throw new Error(`The stand-in was asked for an unexpected relation: "${table}"`);
		}
	};

	return { supabase: supabase as unknown as SupabaseClient, calls };
}

/** The empty query with a few fields changed, so each test only writes the filter it is about. */
function queryAsking(changes: Partial<ConferenceQuery> = {}): ConferenceQuery {
	return { ...EMPTY_CONFERENCE_QUERY, ...changes };
}

/**
 * The committees of the conference in `conferenceRow`, as the database might send
 * them: in no particular order, so a test can see `toConference` sort them by
 * `position`, and with one committee that has no abbreviation.
 */
const THIMUN_COMMITTEES = [
	{ name: 'Human Rights Council', abbreviation: 'UNHRC', position: 3 },
	{ name: 'General Assembly', abbreviation: null, position: 1 },
	{ name: 'Disarmament and International Security', abbreviation: 'DISEC', position: 2 },
	{ name: 'Environment Programme', abbreviation: 'UNEP', position: 4 },
	{ name: 'Economic and Social Council', abbreviation: 'ECOSOC', position: 5 },
	{ name: 'World Health Organization', abbreviation: 'WHO', position: 6 },
	{ name: 'International Court of Justice', abbreviation: 'ICJ', position: 7 },
	{ name: 'Security Council', abbreviation: 'UNSC', position: 8 }
];

/** One row of the view, in the shape the query brings it back. */
function conferenceRow() {
	return {
		id: 'conference-1',
		slug: 'thimun-2027',
		name: 'THIMUN The Hague 2027',
		description: null,
		city: 'The Hague',
		country_code: 'NL',
		location_mode: 'in_person',
		venue_status: 'known',
		conference_time_status: 'known',
		start_time: '09:00:00',
		end_time: '17:30:00',
		fee_status: 'paid',
		application_open_mode: 'scheduled',
		start_date: '2027-01-24',
		end_date: '2027-01-29',
		website_url: null,
		banner_path: null,
		logo_path: null,
		level: 'high_school',
		status: 'published',
		timezone: 'Europe/Amsterdam',
		expected_delegates: 3000,
		applications_open_at: null,
		applications_close_at: null,
		// The two columns the view adds. They are plain columns, not a nested object,
		// which is the whole point of reading the view rather than the table.
		organization_name: 'THIMUN Foundation',
		organization_slug: 'thimun-foundation',
		committees: THIMUN_COMMITTEES
	};
}

describe('toConference', () => {
	it('reads the new state columns, trimming the seconds off the times', () => {
		const conference = toConference(conferenceRow() as ConferenceRow);

		expect(conference.locationMode).toBe('in_person');
		expect(conference.venueStatus).toBe('known');
		expect(conference.startTime).toBe('09:00');
		expect(conference.endTime).toBe('17:30');
		expect(conference.feeStatus).toBe('paid');
		expect(conference.applicationOpenMode).toBe('scheduled');
	});

	// A regression: an online conference, or a draft from the new creation flow,
	// has no city or country, and reading it used to assume both were there.
	it('reads a conference with no city or country without failing', () => {
		const row = {
			...conferenceRow(),
			city: null,
			country_code: null,
			location_mode: 'online',
			conference_time_status: 'tba',
			start_time: null,
			end_time: null
		} as ConferenceRow;

		const conference = toConference(row);

		expect(conference.city).toBeNull();
		expect(conference.countryCode).toBeNull();
		expect(conference.countryName).toBeNull();
		expect(conference.locationMode).toBe('online');
		expect(conference.startTime).toBeNull();
	});
});

describe('listConferences', () => {
	it('asks the view only for conferences that are published and have not finished', async () => {
		const { supabase, calls } = createStandInSupabase();

		await listConferences(supabase, queryAsking(), NOW);

		expect(calls.tables).toEqual([CONFERENCE_VIEW]);
		expect(calls.eq).toEqual([['status', 'published']]);
		expect(calls.gte).toEqual([['end_date', TODAY]]);
	});

	it('counts today in UTC, so the cut-off moves at UTC midnight and nowhere else', async () => {
		const lastMinuteOfTheDay = createStandInSupabase();
		const firstMinuteOfTheNext = createStandInSupabase();

		await listConferences(
			lastMinuteOfTheDay.supabase,
			queryAsking(),
			new Date('2026-09-17T23:59:00Z')
		);
		await listConferences(
			firstMinuteOfTheNext.supabase,
			queryAsking(),
			new Date('2026-09-18T00:01:00Z')
		);

		expect(lastMinuteOfTheDay.calls.gte).toEqual([['end_date', '2026-09-17']]);
		expect(firstMinuteOfTheNext.calls.gte).toEqual([['end_date', '2026-09-18']]);
	});

	it('searches the name, the city and the organisation name in one filter', async () => {
		const { supabase, calls } = createStandInSupabase();

		await listConferences(supabase, queryAsking({ q: 'Hague' }), NOW);

		// All three columns belong to the view, so the whole search is one condition
		// on one relation.
		expect(calls.or).toEqual([
			'name.ilike."%Hague%",city.ilike."%Hague%",organization_name.ilike."%Hague%"'
		]);
	});

	it('searches with one request and not two', async () => {
		const { supabase, calls } = createStandInSupabase();

		await listConferences(supabase, queryAsking({ q: 'Hague' }), NOW);

		// The organisation's name used to be looked up in a query of its own before
		// this one. One entry in `tables` is what keeps that second round trip from
		// creeping back in.
		expect(calls.tables).toEqual([CONFERENCE_VIEW]);
	});

	it('searches a word many organisations share without growing the filter', async () => {
		const wordManyOrganisationsShare = createStandInSupabase();
		const wordNoOrganisationHas = createStandInSupabase();

		await listConferences(wordManyOrganisationsShare.supabase, queryAsking({ q: 'MUN' }), NOW);
		await listConferences(wordNoOrganisationHas.supabase, queryAsking({ q: 'Qqq' }), NOW);

		// This is the bug the view was added for. The old search asked the
		// organizations table for every id whose name matched and wrote
		// `organization_id.in.(<a uuid each>)` into this filter. Words like "MUN",
		// "School" and "University" match hundreds of organisations, the address grew
		// past what the server accepts, and the page answered with an error.
		//
		// Both searches are three letters long, and nothing else in the filter can
		// differ, so the two filters being the same length shows that its length no
		// longer depends on how many organisations there are.
		const commonWordFilter = wordManyOrganisationsShare.calls.or[0];
		const rareWordFilter = wordNoOrganisationHas.calls.or[0];

		expect(commonWordFilter).toHaveLength(rareWordFilter.length);
		expect(commonWordFilter).not.toContain('in.(');
	});

	it('does not search at all when the box is empty', async () => {
		const { supabase, calls } = createStandInSupabase();

		await listConferences(supabase, queryAsking({ q: '' }), NOW);

		expect(calls.or).toEqual([]);
	});

	it('strips out the characters that would otherwise change the filter itself', async () => {
		const { supabase, calls } = createStandInSupabase();

		// A comma would end one condition and begin another, and a percent sign is
		// the wildcard `ilike` matches anything with. Both become a space instead,
		// and the two words left are searched for one at a time.
		await listConferences(supabase, queryAsking({ q: 'Hague, 100%' }), NOW);

		expect(calls.or).toEqual([
			'name.ilike."%Hague%",city.ilike."%Hague%",organization_name.ilike."%Hague%"',
			'name.ilike."%100%",city.ilike."%100%",organization_name.ilike."%100%"'
		]);
	});

	it('finds a conference by its name typed with the brackets a card shows', async () => {
		const { supabase, calls } = createStandInSupabase();

		// The brackets become spaces. Searched for as one piece of text, "Northbridge
		// MUN applications open" is in no name at all (T164). One condition a word,
		// each of which the request must meet, is what finds it again.
		await listConferences(supabase, queryAsking({ q: 'Northbridge MUN (applications open)' }), NOW);

		expect(calls.or).toEqual([
			'name.ilike."%Northbridge%",city.ilike."%Northbridge%",organization_name.ilike."%Northbridge%"',
			'name.ilike."%MUN%",city.ilike."%MUN%",organization_name.ilike."%MUN%"',
			'name.ilike."%applications%",city.ilike."%applications%",organization_name.ilike."%applications%"',
			'name.ilike."%open%",city.ilike."%open%",organization_name.ilike."%open%"'
		]);
	});

	it('treats a search of nothing but punctuation as no search at all', async () => {
		const { supabase, calls } = createStandInSupabase();

		await listConferences(supabase, queryAsking({ q: '%%%' }), NOW);

		expect(calls.or).toEqual([]);
	});

	it('filters on the country, the regions and the dates only when they are asked for', async () => {
		const nothingSet = createStandInSupabase();
		const allThreeSet = createStandInSupabase();

		await listConferences(nothingSet.supabase, queryAsking(), NOW);
		await listConferences(
			allThreeSet.supabase,
			queryAsking({ country: 'NL', regions: ['europe', 'oceania'], withinMonths: 3 }),
			NOW
		);

		expect(nothingSet.calls.eq).toEqual([['status', 'published']]);
		expect(nothingSet.calls.lte).toEqual([]);
		expect(nothingSet.calls.in).toEqual([]);

		expect(allThreeSet.calls.eq).toContainEqual(['country_code', 'NL']);

		// A region is asked for as the list of its countries.
		const [regionFilter] = allThreeSet.calls.in;
		expect(regionFilter[0]).toBe('country_code');
		expect(regionFilter[1]).toEqual(expect.arrayContaining(['NL', 'DE', 'AU', 'NZ']));
		expect(regionFilter[1]).not.toContain('US');

		// "Next 3 months" counted from today, 17 September 2026.
		expect(allThreeSet.calls.lte).toEqual([['start_date', '2026-12-17']]);
	});

	it('filters on the level only when one is chosen', async () => {
		const anyLevel = createStandInSupabase();
		const universityOnly = createStandInSupabase();

		await listConferences(anyLevel.supabase, queryAsking({ level: '' }), NOW);
		await listConferences(universityOnly.supabase, queryAsking({ level: 'university' }), NOW);

		expect(anyLevel.calls.eq).toEqual([['status', 'published']]);
		expect(universityOnly.calls.eq).toContainEqual(['level', 'university']);
	});

	it('asks for both halves of the application window when only open conferences are wanted', async () => {
		const { supabase, calls } = createStandInSupabase();

		await listConferences(supabase, queryAsking({ openOnly: true }), NOW);

		expect(calls.or).toEqual(OPEN_APPLICATION_CONDITIONS);
	});

	it('says nothing about the application window when the visitor did not ask about it', async () => {
		const { supabase, calls } = createStandInSupabase();

		await listConferences(supabase, queryAsking({ openOnly: false }), NOW);

		expect(calls.or).toEqual([]);
	});

	it('sorts by the day the conference starts, soonest first, and then by name', async () => {
		const { supabase, calls } = createStandInSupabase();

		await listConferences(supabase, queryAsking({ sort: 'soonest' }), NOW);

		expect(calls.order).toEqual([
			['start_date', true],
			['name', true]
		]);
	});

	it('sorts by the day the conference was added, newest first, and then by name', async () => {
		const { supabase, calls } = createStandInSupabase();

		await listConferences(supabase, queryAsking({ sort: 'newest' }), NOW);

		expect(calls.order).toEqual([
			['created_at', false],
			['name', true]
		]);
	});

	it('asks for the twelve rows of the page the visitor is on', async () => {
		const firstPage = createStandInSupabase();
		const secondPage = createStandInSupabase();

		await listConferences(firstPage.supabase, queryAsking({ page: 1 }), NOW);
		await listConferences(secondPage.supabase, queryAsking({ page: 2 }), NOW);

		// `range` counts from 0 and includes both ends.
		expect(firstPage.calls.range).toEqual([[0, 11]]);
		expect(secondPage.calls.range).toEqual([[12, 23]]);
	});

	it('gives back each row as a conference, with the total of every match', async () => {
		const { supabase } = createStandInSupabase({
			conferenceRows: [conferenceRow()],
			total: 14
		});

		const { rows, total } = await listConferences(supabase, queryAsking(), NOW);

		expect(rows).toHaveLength(1);
		expect(rows[0].name).toBe('THIMUN The Hague 2027');
		// The view's two extra columns, which the card shows and links to.
		expect(rows[0].organizationName).toBe('THIMUN Foundation');
		expect(rows[0].organizationSlug).toBe('thimun-foundation');
		// The country code in the row, turned into the name a reader sees.
		expect(rows[0].countryName).toBe('Netherlands');
		// The committees arrive as a list of rows: counted, and named in the
		// organiser's order by their abbreviation when they have one.
		expect(rows[0].committeeCount).toBe(8);
		expect(rows[0].committeeNames.slice(0, 3)).toEqual(['General Assembly', 'DISEC', 'UNHRC']);
		// The total counts every match and not the rows on this page, so the page
		// can say "Showing 1-12 of 14".
		expect(total).toBe(14);
	});

	it('answers a page past the last one with no results rather than an error', async () => {
		// Somebody typed a page number into the address. The database answers a
		// range past the end of the results with this code instead of an empty list.
		const { supabase } = createStandInSupabase({
			conferenceError: { code: 'PGRST103', message: 'Requested range not satisfiable' }
		});

		const answer = await listConferences(supabase, queryAsking({ page: 99 }), NOW);

		expect(answer).toEqual({ rows: [], total: 0 });
	});

	it('raises when the query fails, rather than saying there are no conferences', async () => {
		const { supabase } = createStandInSupabase({
			conferenceError: { code: '42703', message: 'column does not exist' }
		});

		await expect(listConferences(supabase, queryAsking(), NOW)).rejects.toThrow(
			'column does not exist'
		);
	});
});

describe('listCountries', () => {
	it('asks only for conferences that are published and have not finished, as the list does', async () => {
		const { supabase, calls } = createStandInSupabase();

		await listCountries(supabase, NOW);

		// The dropdown must never offer a country that would give no results at all,
		// so it reads the same relation and filters on exactly the same two things
		// the list itself does.
		expect(calls.tables).toEqual([CONFERENCE_VIEW]);
		expect(calls.eq).toEqual([['status', 'published']]);
		expect(calls.gte).toEqual([['end_date', TODAY]]);
	});

	it('names each country once, however many conferences are in it, sorted by name', async () => {
		const { supabase } = createStandInSupabase({
			conferenceRows: [{ country_code: 'NL' }, { country_code: 'AT' }, { country_code: 'NL' }]
		});

		expect(await listCountries(supabase, NOW)).toEqual([
			{ code: 'AT', name: 'Austria' },
			{ code: 'NL', name: 'Netherlands' }
		]);
	});

	it('raises when the query fails, rather than offering an empty dropdown', async () => {
		const { supabase } = createStandInSupabase({ conferenceError: { message: 'no connection' } });

		await expect(listCountries(supabase, NOW)).rejects.toThrow('no connection');
	});
});

describe('listOrganizationConferences', () => {
	// The function asks two questions in one go, so one stand-in records both. The
	// upcoming query runs first, so the first entry of each list is that one's.

	it('lists only published conferences that have not finished as upcoming', async () => {
		const { supabase, calls } = createStandInSupabase();

		await listOrganizationConferences(supabase, 'organization-1', NOW);

		expect(calls.tables).toEqual([CONFERENCE_VIEW, CONFERENCE_VIEW]);
		// A conference still to come is only listed once it is published: a draft is
		// the organisers' private workspace, and they must not see their own drafts
		// here either.
		expect(calls.eq).toEqual([
			['organization_id', 'organization-1'],
			['status', 'published'],
			['organization_id', 'organization-1']
		]);
		expect(calls.gte).toEqual([['end_date', TODAY]]);
	});

	it('lists published and archived conferences that are over as past', async () => {
		const { supabase, calls } = createStandInSupabase();

		await listOrganizationConferences(supabase, 'organization-1', NOW);

		// Archiving is what organisers do to a conference that is over, so an
		// archived one belongs on the organisation's record rather than nowhere.
		expect(calls.in).toEqual([['status', ['published', 'archived']]]);
		expect(calls.lt).toEqual([['end_date', TODAY]]);
	});

	it('puts the soonest conference first and the most recently finished one first', async () => {
		const { supabase, calls } = createStandInSupabase();

		await listOrganizationConferences(supabase, 'organization-1', NOW);

		expect(calls.order).toEqual([
			['start_date', true],
			['name', true],
			['end_date', false],
			['name', true]
		]);
	});

	it('shows at most twelve past conferences, as the page file asks', async () => {
		const { supabase, calls } = createStandInSupabase();

		await listOrganizationConferences(supabase, 'organization-1', NOW);

		expect(calls.limit).toEqual([12]);
	});

	it('counts today in UTC, the same cut-off the directory uses', async () => {
		const lastMinuteOfTheDay = createStandInSupabase();
		const firstMinuteOfTheNext = createStandInSupabase();

		await listOrganizationConferences(
			lastMinuteOfTheDay.supabase,
			'organization-1',
			new Date('2026-09-17T23:59:00Z')
		);
		await listOrganizationConferences(
			firstMinuteOfTheNext.supabase,
			'organization-1',
			new Date('2026-09-18T00:01:00Z')
		);

		expect(lastMinuteOfTheDay.calls.gte).toEqual([['end_date', '2026-09-17']]);
		expect(lastMinuteOfTheDay.calls.lt).toEqual([['end_date', '2026-09-17']]);
		expect(firstMinuteOfTheNext.calls.gte).toEqual([['end_date', '2026-09-18']]);
		expect(firstMinuteOfTheNext.calls.lt).toEqual([['end_date', '2026-09-18']]);
	});

	it('gives back whole conferences, so the page can hand one to a ConferenceCard', async () => {
		const { supabase } = createStandInSupabase({ conferenceRows: [conferenceRow()] });

		const { upcoming } = await listOrganizationConferences(supabase, 'organization-1', NOW);

		expect(upcoming).toHaveLength(1);
		expect(upcoming[0]).toMatchObject({
			slug: 'thimun-2027',
			name: 'THIMUN The Hague 2027',
			city: 'The Hague',
			countryName: 'Netherlands',
			organizationName: 'THIMUN Foundation',
			committeeCount: 8
		});
	});

	it('is empty for an organisation that runs nothing', async () => {
		const { supabase } = createStandInSupabase({ conferenceRows: [] });

		expect(await listOrganizationConferences(supabase, 'organization-1', NOW)).toEqual({
			upcoming: [],
			past: []
		});
	});

	it('raises when a query fails, rather than saying the organisation runs nothing', async () => {
		const { supabase } = createStandInSupabase({ conferenceError: { message: 'no connection' } });

		await expect(listOrganizationConferences(supabase, 'organization-1', NOW)).rejects.toThrow(
			'no connection'
		);
	});
});

describe('listManagedConferences', () => {
	/** An organisation the reader belongs to, and a conference they are an organiser of. */
	const MY_ORGANIZATION = 'organization-1';
	const MY_CONFERENCE = 'conference-1';

	it('sends nothing at all when the reader belongs to nothing', async () => {
		const { supabase, calls } = createStandInSupabase();

		const conferences = await listManagedConferences(supabase, [], []);

		// With both lists empty there is no condition to put in the filter, and
		// somebody who belongs to nothing helps run nothing anyway.
		expect(conferences).toEqual([]);
		expect(calls.tables).toEqual([]);
	});

	it('leaves out archived conferences but keeps drafts', async () => {
		const { supabase, calls } = createStandInSupabase();

		await listManagedConferences(supabase, [MY_ORGANIZATION], []);

		expect(calls.tables).toEqual([CONFERENCE_VIEW]);
		// A draft is the organisers' own workspace and the point of the section is
		// to get them back to it, so only the archived ones go.
		expect(calls.neq).toEqual([['status', 'archived']]);
	});

	it('leaves out quick sessions, which /home lists on their own (S14)', async () => {
		const { supabase, calls } = createStandInSupabase();

		// The personal organisation holding a person's quick sessions is one of
		// their organisations, so without this its quick sessions would be "My
		// conferences" too.
		await listManagedConferences(supabase, ['personal-organization'], []);

		expect(calls.eq).toEqual([['kind', 'conference']]);
	});

	it('asks about the organisations alone when the reader organises nothing', async () => {
		const { supabase, calls } = createStandInSupabase();

		await listManagedConferences(supabase, [MY_ORGANIZATION, 'organization-2'], []);

		// An empty list is left out rather than written as `in.()`, which PostgREST
		// refuses.
		expect(calls.or).toEqual([`organization_id.in.(${MY_ORGANIZATION},organization-2)`]);
	});

	it('asks about the organiser rows alone when the reader belongs to no organisation', async () => {
		const { supabase, calls } = createStandInSupabase();

		await listManagedConferences(supabase, [], [MY_CONFERENCE]);

		expect(calls.or).toEqual([`id.in.(${MY_CONFERENCE})`]);
	});

	it('joins the two halves into one filter when the reader has both', async () => {
		const { supabase, calls } = createStandInSupabase();

		await listManagedConferences(supabase, [MY_ORGANIZATION], [MY_CONFERENCE]);

		// One `.or(...)`, so a conference matching either half comes back.
		expect(calls.or).toEqual([`organization_id.in.(${MY_ORGANIZATION}),id.in.(${MY_CONFERENCE})`]);
	});

	it('puts the soonest conference first, with the name breaking a tie', async () => {
		const { supabase, calls } = createStandInSupabase();

		await listManagedConferences(supabase, [MY_ORGANIZATION], []);

		expect(calls.order).toEqual([
			['start_date', true],
			['name', true]
		]);
	});

	it('asks for the whole list, because the workspaces row needs every conference', async () => {
		const { supabase, calls } = createStandInSupabase();

		await listManagedConferences(supabase, [MY_ORGANIZATION], []);

		// `loadHomeDashboard` cuts the section's list itself, after the chips at the
		// bottom have been built from the whole of it.
		expect(calls.limit).toEqual([]);
	});

	it('gives back whole conferences, so a page can draw a row without a second query', async () => {
		const { supabase } = createStandInSupabase({ conferenceRows: [conferenceRow()] });

		const conferences = await listManagedConferences(supabase, [MY_ORGANIZATION], []);

		expect(conferences).toHaveLength(1);
		expect(conferences[0]).toMatchObject({
			slug: 'thimun-2027',
			organizationName: 'THIMUN Foundation',
			committeeCount: 8
		});
	});

	it('raises when the query fails, rather than saying they run nothing', async () => {
		const { supabase } = createStandInSupabase({ conferenceError: { message: 'no connection' } });

		await expect(listManagedConferences(supabase, [MY_ORGANIZATION], [])).rejects.toThrow(
			'no connection'
		);
	});
});

describe('listConferencesForOrganizations', () => {
	/** Two organisations the reader belongs to. */
	const MY_ORGANIZATIONS = ['organization-1', 'organization-2'];

	it('sends nothing at all when the reader belongs to no organisation', async () => {
		const { supabase, calls } = createStandInSupabase();

		const conferences = await listConferencesForOrganizations(supabase, []);

		// An empty list would have to be written as `in.()`, which PostgREST
		// refuses, and there is nothing to ask about in any case.
		expect(conferences).toEqual([]);
		expect(calls.tables).toEqual([]);
	});

	it('asks for the conferences of every organisation at once', async () => {
		const { supabase, calls } = createStandInSupabase();

		await listConferencesForOrganizations(supabase, MY_ORGANIZATIONS);

		expect(calls.tables).toEqual([CONFERENCE_VIEW]);
		expect(calls.in).toEqual([['organization_id', MY_ORGANIZATIONS]]);
	});

	it('keeps every status, because the organiser area shows drafts and archives too', async () => {
		const { supabase, calls } = createStandInSupabase();

		await listConferencesForOrganizations(supabase, MY_ORGANIZATIONS);

		// `/manage` is where an organiser reaches a draft they have not finished
		// and an archived conference they still need the records of.
		expect(calls.eq).toEqual([]);
		expect(calls.neq).toEqual([]);
	});

	it('orders by status first, which puts drafts before published and archived', async () => {
		const { supabase, calls } = createStandInSupabase();

		await listConferencesForOrganizations(supabase, MY_ORGANIZATIONS);

		// Postgres sorts an enum by the order its values were declared in, and the
		// migration declares `conference_status` as ('draft', 'published',
		// 'archived'), so ascending is exactly the order the page asks for.
		expect(calls.order).toEqual([
			['status', true],
			['start_date', true]
		]);
	});

	it('gives back whole conferences, so a card can be drawn without a second query', async () => {
		const { supabase } = createStandInSupabase({ conferenceRows: [conferenceRow()] });

		const conferences = await listConferencesForOrganizations(supabase, MY_ORGANIZATIONS);

		expect(conferences).toHaveLength(1);
		expect(conferences[0]).toMatchObject({ slug: 'thimun-2027', committeeCount: 8 });
	});

	it('raises when the query fails, rather than showing an organisation with nothing in it', async () => {
		const { supabase } = createStandInSupabase({ conferenceError: { message: 'no connection' } });

		await expect(listConferencesForOrganizations(supabase, MY_ORGANIZATIONS)).rejects.toThrow(
			'no connection'
		);
	});
});

describe('listConferencesByIds', () => {
	/** The conferences somebody's `conference_staff` rows named. */
	const MY_CONFERENCES = ['conference-1', 'conference-2'];

	it('sends nothing at all when there are no ids to ask about', async () => {
		const { supabase, calls } = createStandInSupabase();

		const conferences = await listConferencesByIds(supabase, []);

		expect(conferences).toEqual([]);
		expect(calls.tables).toEqual([]);
	});

	it('asks for exactly those conferences, whatever their status', async () => {
		const { supabase, calls } = createStandInSupabase();

		await listConferencesByIds(supabase, MY_CONFERENCES);

		expect(calls.tables).toEqual([CONFERENCE_VIEW]);
		expect(calls.in).toEqual([['id', MY_CONFERENCES]]);
		// Being staff of a draft is the whole reason it is listed, so nothing
		// filters on status here either.
		expect(calls.eq.filter(([column]) => column === 'status')).toEqual([]);
		expect(calls.neq).toEqual([]);
	});

	it('leaves out quick sessions, whose creator holds a chair staff row in them (S14)', async () => {
		const { supabase, calls } = createStandInSupabase();

		await listConferencesByIds(supabase, MY_CONFERENCES);

		expect(calls.eq).toEqual([['kind', 'conference']]);
	});

	it('puts the soonest conference first, with the name breaking a tie', async () => {
		const { supabase, calls } = createStandInSupabase();

		await listConferencesByIds(supabase, MY_CONFERENCES);

		expect(calls.order).toEqual([
			['start_date', true],
			['name', true]
		]);
	});

	it('gives back whole conferences', async () => {
		const { supabase } = createStandInSupabase({ conferenceRows: [conferenceRow()] });

		const conferences = await listConferencesByIds(supabase, MY_CONFERENCES);

		expect(conferences).toHaveLength(1);
		expect(conferences[0]).toMatchObject({ slug: 'thimun-2027' });
	});

	it('raises when the query fails, rather than leaving the conferences out', async () => {
		const { supabase } = createStandInSupabase({ conferenceError: { message: 'no connection' } });

		await expect(listConferencesByIds(supabase, MY_CONFERENCES)).rejects.toThrow('no connection');
	});
});

describe('listConferencesToExplore', () => {
	/** How many cards the home page's "Open for applications" section shows. */
	const EXPLORE_LIMIT = 3;

	it('offers only published conferences that have not finished', async () => {
		const { supabase, calls } = createStandInSupabase();

		await listConferencesToExplore(supabase, [], NOW, EXPLORE_LIMIT);

		expect(calls.tables).toEqual([CONFERENCE_VIEW]);
		expect(calls.eq).toEqual([['status', 'published']]);
		expect(calls.gte).toEqual([['end_date', TODAY]]);
	});

	it('offers only conferences whose application window is open', async () => {
		const { supabase, calls } = createStandInSupabase();

		await listConferencesToExplore(supabase, [], NOW, EXPLORE_LIMIT);

		// The same three conditions the directory's "open only" filter uses, because
		// this has to agree with the "Applications open" badge on the card.
		expect(calls.or).toEqual(OPEN_APPLICATION_CONDITIONS);
	});

	it('leaves out the conferences the reader is already in', async () => {
		const { supabase, calls } = createStandInSupabase();

		await listConferencesToExplore(supabase, ['conference-1', 'conference-2'], NOW, EXPLORE_LIMIT);

		expect(calls.not).toEqual([['id', 'in', '(conference-1,conference-2)']]);
	});

	it('says nothing about ids at all when there is nothing to leave out', async () => {
		const { supabase, calls } = createStandInSupabase();

		await listConferencesToExplore(supabase, [], NOW, EXPLORE_LIMIT);

		// PostgREST refuses an empty `in` list, so `not.id.in.()` would answer with
		// an error instead of with every conference.
		expect(calls.not).toEqual([]);
	});

	it('asks for the conferences closing soonest, as many as the section shows', async () => {
		const { supabase, calls } = createStandInSupabase();

		await listConferencesToExplore(supabase, [], NOW, EXPLORE_LIMIT);

		// Closing soonest first, so the "Closing soon" cards land on the left;
		// the start day and the name break a tie.
		expect(calls.order).toEqual([
			['applications_close_at', true],
			['start_date', true],
			['name', true]
		]);
		expect(calls.limit).toEqual([EXPLORE_LIMIT]);
	});

	it('puts the conferences with no closing date last, not first', async () => {
		const { supabase, calls } = createStandInSupabase();

		await listConferencesToExplore(supabase, [], NOW, EXPLORE_LIMIT);

		// Postgres puts a missing value first on an ascending sort unless told
		// otherwise, and a conference with no closing date has the most time left.
		const [closingDateSort] = calls.orderOptions;
		expect(closingDateSort).toEqual({ ascending: true, nullsFirst: false });
	});

	it('gives back whole conferences, so a page can draw a row without a second query', async () => {
		const { supabase } = createStandInSupabase({ conferenceRows: [conferenceRow()] });

		const conferences = await listConferencesToExplore(supabase, [], NOW, EXPLORE_LIMIT);

		expect(conferences).toHaveLength(1);
		expect(conferences[0]).toMatchObject({ slug: 'thimun-2027', countryName: 'Netherlands' });
	});

	it('raises when the query fails, rather than offering nothing to explore', async () => {
		const { supabase } = createStandInSupabase({ conferenceError: { message: 'no connection' } });

		await expect(listConferencesToExplore(supabase, [], NOW, EXPLORE_LIMIT)).rejects.toThrow(
			'no connection'
		);
	});
});

describe('countConferencesOpenForApplications', () => {
	it('asks the view for the count alone, not for any rows', async () => {
		const { supabase, calls } = createStandInSupabase();

		await countConferencesOpenForApplications(supabase, NOW);

		expect(calls.tables).toEqual([CONFERENCE_VIEW]);
		// `head: true` is what asks for the number instead of the conferences.
		expect(calls.selectOptions).toEqual([{ count: 'exact', head: true }]);
		expect(calls.range).toEqual([]);
		expect(calls.limit).toEqual([]);
	});

	it('counts only published conferences that have not finished', async () => {
		const { supabase, calls } = createStandInSupabase();

		await countConferencesOpenForApplications(supabase, NOW);

		expect(calls.eq).toEqual([['status', 'published']]);
		expect(calls.gte).toEqual([['end_date', TODAY]]);
	});

	it('counts with the very conditions the directory lists open conferences by', async () => {
		const count = createStandInSupabase();
		const directory = createStandInSupabase();

		await countConferencesOpenForApplications(count.supabase, NOW);
		await listConferences(directory.supabase, queryAsking({ openOnly: true }), NOW);

		// The number on the home page has to be the number of cards the reader
		// finds when they follow its button.
		expect(count.calls.or).toEqual(OPEN_APPLICATION_CONDITIONS);
		expect(count.calls.or).toEqual(directory.calls.or);
	});

	it('gives back the number the client counted', async () => {
		const { supabase } = createStandInSupabase({ total: 6 });

		expect(await countConferencesOpenForApplications(supabase, NOW)).toBe(6);
	});

	it('answers nought when the client reports no count at all', async () => {
		const { supabase } = createStandInSupabase({ total: null });

		expect(await countConferencesOpenForApplications(supabase, NOW)).toBe(0);
	});

	it('raises when the query fails, rather than claiming nothing is open', async () => {
		const { supabase } = createStandInSupabase({ conferenceError: { message: 'no connection' } });

		await expect(countConferencesOpenForApplications(supabase, NOW)).rejects.toThrow(
			'no connection'
		);
	});
});

describe('which relation each function uses', () => {
	it('reads one conference through the view but still writes the conferences table', async () => {
		const read = createStandInSupabase({ conferenceRow: conferenceRow() });
		const write = createStandInSupabase();

		const conference = await getConferenceBySlug(read.supabase, 'thimun-2027');
		await createConference(write.supabase, {
			details: { ...EMPTY_CONFERENCE_DETAILS, name: 'THIMUN The Hague 2027' },
			organizationId: 'organization-1',
			userId: 'user-1',
			now: NOW
		});

		// The conference's own page needs the organisation's name on the row, so it
		// reads the view like the list does.
		expect(read.calls.tables).toEqual([CONFERENCE_VIEW]);
		expect(conference?.organizationName).toBe('THIMUN Foundation');

		// A view over a join cannot be written to, and an insert has no organisation
		// name to write anyway: it names the organisation by its id.
		expect(write.calls.tables).toEqual([CONFERENCE_TABLE]);
		expect(write.calls.inserts).toHaveLength(1);
		expect(write.calls.inserts[0]).toMatchObject({
			name: 'THIMUN The Hague 2027',
			// `EMPTY_CONFERENCE_DETAILS` leaves the tagline empty, and an empty optional
			// field is saved as "no value" rather than as empty text.
			tagline: null,
			// These three are the values the form arrives already holding, because
			// `EMPTY_CONFERENCE_DETAILS` carries the same defaults the database has.
			timezone: 'Europe/Amsterdam',
			currency: 'EUR',
			level: 'mixed',
			organization_id: 'organization-1',
			created_by: 'user-1',
			// A new conference is a draft until its organiser publishes it from the
			// dashboard, so it is not in `/conferences` the moment it is saved.
			status: 'draft'
		});
	});

	it('writes the tagline, timezone, currency and level the organiser chose', async () => {
		const write = createStandInSupabase();

		await createConference(write.supabase, {
			details: {
				...EMPTY_CONFERENCE_DETAILS,
				name: 'Berlin Model United Nations 2027',
				tagline: 'Three days of debate in the German capital',
				timezone: 'Europe/Berlin',
				currency: 'GBP',
				level: 'university'
			},
			organizationId: 'organization-1',
			userId: 'user-1',
			now: NOW
		});

		// The test above only ever sees the defaults, so a filled-in conference is
		// needed as well to prove that a value the organiser chose reaches the insert
		// instead of being replaced by the database's own default.
		expect(write.calls.inserts[0]).toMatchObject({
			name: 'Berlin Model United Nations 2027',
			tagline: 'Three days of debate in the German capital',
			timezone: 'Europe/Berlin',
			currency: 'GBP',
			level: 'university'
		});
	});

	it('writes the application window the rule in `$lib/starting-application-window.ts` gives', async () => {
		const write = createStandInSupabase();

		await createConference(write.supabase, {
			details: {
				...EMPTY_CONFERENCE_DETAILS,
				name: 'Delft Model United Nations 2026',
				startDate: '2026-11-10',
				endDate: '2026-11-12',
				timezone: 'Europe/Amsterdam'
			},
			organizationId: 'organization-1',
			userId: 'user-1',
			now: NOW
		});

		// Opens at the moment of creation and closes at 23:59 in Amsterdam seven
		// days before the first day, so the organiser never has to type a window
		// before publishing.
		expect(write.calls.inserts[0]).toMatchObject({
			applications_open_at: '2026-09-17T12:00:00.000Z',
			applications_close_at: '2026-11-03T22:59:00.000Z'
		});
	});

	it('writes no application window when the conference starts too soon for one', async () => {
		const write = createStandInSupabase();

		await createConference(write.supabase, {
			details: { ...EMPTY_CONFERENCE_DETAILS, name: 'Old MUN', startDate: '2020-05-03' },
			organizationId: 'organization-1',
			userId: 'user-1',
			now: NOW
		});

		expect(write.calls.inserts[0]).toMatchObject({
			applications_open_at: null,
			applications_close_at: null
		});
	});
});

// ---------------------------------------------------------------------------
// The conference page
// ---------------------------------------------------------------------------
// `getConferencePage` reads five more relations than the directory does and
// asks the database's permission helpers about whoever is reading, so it gets a
// stand-in of its own below rather than growing the one above, which the tests
// already written here depend on staying as it is.

/** What one query the page sent was asking for. */
type PageQuery = {
	/** The relation `.from(...)` named. */
	table: string;
	eq: [string, unknown][];
};

/** Everything the page's stand-in wrote down, in the order the module asked for it. */
type PageCalls = {
	queries: PageQuery[];
	/** `[name, arguments]` for every permission helper the module asked the database. */
	helpers: [string, Record<string, unknown>][];
};

/** What the page's stand-in should answer with. Everything here has a harmless default. */
type PageAnswers = {
	/** The rows each relation gives back. A relation with no entry gives back none. */
	rows?: Record<string, unknown[]>;
	/** The relations whose query fails, and the message each fails with. */
	errors?: Record<string, string>;
	/** What each permission helper answers. One not named here answers `false`. */
	helpers?: Record<string, boolean>;
	/** The permission helpers whose call fails instead of answering. */
	failingHelpers?: string[];
};

/** One step of a query on the page's stand-in. Every step hands the builder back. */
type PageBuilder = {
	select: () => PageBuilder;
	eq: (column: string, value: unknown) => PageBuilder;
	in: (column: string, values: unknown[]) => PageBuilder;
	order: (column: string, options: { ascending: boolean }) => PageBuilder;
	maybeSingle: () => { overrideTypes: () => Promise<{ data: unknown; error: QueryError | null }> };
	overrideTypes: () => Promise<{ data: unknown[] | null; error: QueryError | null }>;
};

/**
 * A stand-in for the whole page: the same builder shape as the one above, but
 * answering for any relation by name, and with `rpc` for the permission helpers,
 * which are SQL functions rather than tables. A chain ending in `maybeSingle` is
 * answered with the first of that relation's rows.
 */
function createConferencePageStandIn(answers: PageAnswers = {}): {
	supabase: SupabaseClient;
	calls: PageCalls;
} {
	const calls: PageCalls = { queries: [], helpers: [] };

	function builderFor(table: string): PageBuilder {
		const query: PageQuery = { table, eq: [] };
		calls.queries.push(query);

		const message = answers.errors?.[table];
		const rows = answers.rows?.[table] ?? [];
		const error = message ? { message } : null;
		const listAnswer = { data: message ? null : rows, error };
		const singleRowAnswer = { data: message ? null : (rows[0] ?? null), error };

		const builder: PageBuilder = {
			select: () => builder,
			eq: (column, value) => {
				query.eq.push([column, value]);
				return builder;
			},
			in: () => builder,
			order: () => builder,
			maybeSingle: () => ({ overrideTypes: async () => singleRowAnswer }),
			overrideTypes: async () => listAnswer
		};

		return builder;
	}

	const supabase = {
		from: builderFor,
		rpc: async (name: string, helperArguments: Record<string, unknown>) => {
			calls.helpers.push([name, helperArguments]);

			if (answers.failingHelpers?.includes(name)) {
				return { data: null, error: { message: 'permission denied' } };
			}

			return { data: answers.helpers?.[name] ?? false, error: null };
		}
	};

	return { supabase: supabase as unknown as SupabaseClient, calls };
}

/** Where the page read its rows from, in the order it read them. */
function pageTablesRead(calls: PageCalls): string[] {
	return calls.queries.map((query) => query.table);
}

/** The first query the page sent to one relation, so a test can read its conditions back. */
function pageQueryOn(calls: PageCalls, table: string): PageQuery {
	const query = calls.queries.find((sent) => sent.table === table);

	if (!query) {
		throw new Error(`Nothing was ever sent to "${table}"`);
	}

	return query;
}

/** The conference row with the columns the conference's own page shows filled in. */
function conferenceRowWithDetails() {
	return {
		...conferenceRow(),
		tagline: 'Debate the world',
		venue_name: 'World Forum',
		venue_address: 'Churchillplein 10',
		contact_email: 'hello@thimun.org',
		instagram_url: 'https://instagram.com/thimun',
		contact_phone: '+31 70 123 4567',
		facebook_url: 'https://facebook.com/thimun',
		linkedin_url: null,
		youtube_url: 'https://youtube.com/@thimun',
		tiktok_url: null,
		language: 'English',
		min_age: 14,
		max_age: 19,
		position_paper_required: true,
		position_paper_deadline: '2027-01-10T23:00:00Z',
		accepts_individual_applications: true,
		accepts_delegations: false
	};
}

/** The answers a conference page needs before a test changes the part it is about. */
function pageAnswersWith(changes: PageAnswers = {}): PageAnswers {
	return {
		...changes,
		rows: {
			conferences_with_organization: [conferenceRowWithDetails()],
			...changes.rows
		}
	};
}

describe('getConferenceBySlug', () => {
	it('leaves the status to Row Level Security rather than filtering on it', async () => {
		const { supabase, calls } = createStandInSupabase({ conferenceRow: conferenceRow() });

		await getConferenceBySlug(supabase, 'thimun-2027');

		// A visitor reads a published or archived conference and the people running
		// it read their own draft as well, which is how an organiser previews a page
		// nobody else can see. Filtering on 'published' here would take that away.
		expect(calls.eq).toEqual([['slug', 'thimun-2027']]);
	});

	it('brings the columns the conference page shows through onto the conference', async () => {
		const { supabase } = createStandInSupabase({ conferenceRow: conferenceRowWithDetails() });

		const conference = await getConferenceBySlug(supabase, 'thimun-2027');

		expect(conference?.tagline).toBe('Debate the world');
		expect(conference?.venueName).toBe('World Forum');
		expect(conference?.contactEmail).toBe('hello@thimun.org');
		expect(conference?.language).toBe('English');
		expect(conference?.minAge).toBe(14);
		expect(conference?.positionPaperRequired).toBe(true);
		expect(conference?.acceptsIndividualApplications).toBe(true);
		expect(conference?.acceptsDelegations).toBe(false);
	});
});

describe('getConferencePage', () => {
	it('answers with nothing when there is no conference with that slug', async () => {
		const { supabase, calls } = createConferencePageStandIn();

		expect(await getConferencePage(supabase, 'no-such-conference', null)).toBeNull();
		// It stops at the conference rather than looking up committees and a team
		// for one that is not there. The page turns the nothing into a 404.
		expect(pageTablesRead(calls)).toEqual(['conferences_with_organization']);
	});

	it('asks the database nothing about a signed-out reader', async () => {
		const { supabase, calls } = createConferencePageStandIn(pageAnswersWith());

		const page = await getConferencePage(supabase, 'thimun-2027', null);

		// The permission helpers are granted to signed-in readers only, so asking
		// them here would fail rather than answer "no", and somebody signed out has
		// no seat, no application and no delegation to find either.
		expect(calls.helpers).toEqual([]);
		expect(pageTablesRead(calls)).not.toContain('seats');
		expect(pageTablesRead(calls)).not.toContain('applications');
		expect(pageTablesRead(calls)).not.toContain('delegation_members');
		expect(page?.viewer).toEqual({
			canManage: false,
			isStaff: false,
			seat: null,
			application: null,
			delegation: null
		});
	});

	it('gathers the committees and the team onto the page', async () => {
		const { supabase } = createConferencePageStandIn(
			pageAnswersWith({
				rows: {
					committees: [
						{
							id: 'committee-1',
							slug: 'unsc',
							name: 'United Nations Security Council',
							abbreviation: 'UNSC',
							description: null,
							topics: [],
							level: 'intermediate',
							room: null
						}
					],
					public_seats: [{ committee_id: 'committee-1', is_taken: true }],
					// The public team is whoever holds a role the conference marks public,
					// with the title from their staff row.
					conference_role_members: [
						{
							user_id: 'user-1',
							conference_roles: { name: 'Organiser', position: 0, is_public: true }
						}
					],
					conference_staff: [{ user_id: 'user-1', title: 'Secretary General' }],
					profiles: [{ id: 'user-1', full_name: 'Maya Okonjo', avatar_path: null }]
				}
			})
		);

		const page = await getConferencePage(supabase, 'thimun-2027', null);

		expect(page?.committees).toHaveLength(1);
		expect(page?.committees[0].seatSummary).toEqual({ taken: 1, total: 1 });
		expect(page?.team.map((member) => member.fullName)).toEqual(['Maya Okonjo']);
	});

	it('tells a signed-in reader which seat they hold and in which committee', async () => {
		const { supabase, calls } = createConferencePageStandIn(
			pageAnswersWith({
				rows: {
					seats: [
						{
							name: 'France',
							// `committees!inner(...)` brings the committee back as one object,
							// because a seat belongs to exactly one.
							committees: {
								slug: 'unsc',
								name: 'United Nations Security Council',
								conference_id: 'conference-1'
							}
						}
					]
				},
				helpers: { is_conference_staff: true }
			})
		);

		const page = await getConferencePage(supabase, 'thimun-2027', 'user-1');

		expect(page?.viewer.seat).toEqual({
			seatName: 'France',
			committeeName: 'United Nations Security Council',
			committeeSlug: 'unsc'
		});
		expect(page?.viewer.isStaff).toBe(true);
		expect(page?.viewer.canManage).toBe(false);
		// Both helpers take the conference's id under the name the migration that
		// defines them gives it.
		expect(calls.helpers).toContainEqual([
			'has_permission',
			{ conference_id: 'conference-1', permission: 'administrator' }
		]);
	});

	it('treats a seat list the reader may not read as no seat rather than as a fault', async () => {
		const { supabase } = createConferencePageStandIn(
			pageAnswersWith({ errors: { seats: 'permission denied for table seats' } })
		);

		const page = await getConferencePage(supabase, 'thimun-2027', 'user-1');

		// Almost everybody reading a conference page has no seat at it, so being
		// turned away here is the ordinary case and not something to fail over.
		expect(page?.viewer.seat).toBeNull();
	});

	it('tells a signed-in reader about their own application at this conference', async () => {
		const { supabase, calls } = createConferencePageStandIn(
			pageAnswersWith({
				rows: {
					applications: [
						{
							id: 'application-1',
							conference_id: 'conference-1',
							user_id: 'user-1',
							status: 'submitted',
							committee_preferences: [],
							seat_preferences: null,
							motivation: null,
							answers: {},
							submitted_at: '2026-09-08T14:02:00Z',
							decision_note: null,
							updated_at: '2026-09-08T14:02:00Z'
						}
					]
				}
			})
		);

		const page = await getConferencePage(supabase, 'thimun-2027', 'user-1');

		// The page only says that there is one and what became of it, so the whole
		// row is cut down to those two fields.
		expect(page?.viewer.application).toEqual({ id: 'application-1', status: 'submitted' });
		expect(pageQueryOn(calls, 'applications').eq).toEqual([
			['conference_id', 'conference-1'],
			['user_id', 'user-1']
		]);
	});

	it('draws the page without the application line when that one query fails', async () => {
		const { supabase } = createConferencePageStandIn(
			pageAnswersWith({ errors: { applications: 'permission denied for table applications' } })
		);

		const page = await getConferencePage(supabase, 'thimun-2027', 'user-1');

		// `getMyApplicationFor` throws, because the apply page needs it to. Here the
		// answer is one line and one link, so leaving them out beats replacing the
		// whole public page with an error.
		expect(page?.viewer.application).toBeNull();
		expect(page?.conference.name).toBe('THIMUN The Hague 2027');
	});

	it('names the delegation a signed-in reader is part of here', async () => {
		const { supabase, calls } = createConferencePageStandIn(
			pageAnswersWith({
				rows: {
					delegation_members: [
						{
							// `delegations!inner(...)` brings the delegation back as one
							// object and makes it part of the match.
							delegations: { name: 'Lycee Francais Delegation', conference_id: 'conference-1' }
						}
					]
				}
			})
		);

		const page = await getConferencePage(supabase, 'thimun-2027', 'user-1');

		expect(page?.viewer.delegation?.name).toBe('Lycee Francais Delegation');
		expect(pageQueryOn(calls, 'delegation_members').eq).toEqual([
			['user_id', 'user-1'],
			['delegations.conference_id', 'conference-1']
		]);
	});

	it('treats a delegation the reader may not read as no delegation rather than as a fault', async () => {
		const { supabase } = createConferencePageStandIn(
			pageAnswersWith({ errors: { delegation_members: 'permission denied for table delegations' } })
		);

		const page = await getConferencePage(supabase, 'thimun-2027', 'user-1');

		// The `delegations` select policy is "member", so almost everybody reading a
		// conference page is turned away here, and that is the ordinary case.
		expect(page?.viewer.delegation).toBeNull();
	});

	it('answers "no" rather than failing when a permission helper cannot be asked', async () => {
		const { supabase } = createConferencePageStandIn(
			pageAnswersWith({ failingHelpers: ['has_permission', 'is_conference_staff'] })
		);

		const page = await getConferencePage(supabase, 'thimun-2027', 'user-1');

		// Hiding the Manage button is much better than answering the whole page
		// with an error.
		expect(page?.viewer.canManage).toBe(false);
		expect(page?.viewer.isStaff).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Publishing, archiving, deleting
// ---------------------------------------------------------------------------
// The dashboard's actions move a conference between the three statuses, delete
// a draft, and ask whether anybody is seated before they take a published one
// back. None of that fits either stand-in above: the first only reads the view
// and only ever inserts, and the second only reads. So these three get a
// stand-in of their own, which answers any relation by name and can be written
// to as well as read.

/** What one query one of these three actions sent was asking for. */
type ActionQuery = {
	/** The relation `.from(...)` named. */
	table: string;
	/** The columns `.select(...)` was given, or `''` for a query that read nothing. */
	columns: string;
	/** The row `.update(...)` was given, or `null` when the query changed nothing. */
	updated: Record<string, unknown> | null;
	/** `true` when the query removed rows rather than reading or changing them. */
	isDelete: boolean;
	eq: [string, unknown][];
	in: [string, unknown[]][];
	/** `[column, operator, value]` for every `.not(...)`, which turns one condition around. */
	not: [string, string, unknown][];
	limit: number[];
};

/** What the action stand-in should answer with. Everything here has a harmless default. */
type ActionAnswers = {
	/** The rows each relation gives back. A relation with no entry gives back none. */
	rows?: Record<string, unknown[]>;
	/** The relations whose query fails, and the message each fails with. */
	errors?: Record<string, string>;
};

/** One step of a query on the action stand-in. Every step hands the builder back. */
type ActionBuilder = {
	select: (columns: string) => ActionBuilder;
	update: (row: Record<string, unknown>) => ActionBuilder;
	delete: () => ActionBuilder;
	eq: (column: string, value: unknown) => ActionBuilder;
	in: (column: string, values: unknown[]) => ActionBuilder;
	not: (column: string, operator: string, value: unknown) => ActionBuilder;
	limit: (count: number) => ActionBuilder;
	overrideTypes: () => Promise<{ data: unknown[] | null; error: QueryError | null }>;
	then: (resolve: (answer: { data: unknown[] | null; error: QueryError | null }) => void) => void;
};

/**
 * A stand-in that writes down every query and answers by relation name.
 *
 * The same builder shape as the two above, with `update` and `delete` beside
 * `select`, because these three actions write as well as read. A chain that is
 * awaited straight after `.eq(...)` is what `then` is here for, the same as in
 * the real client.
 */
function createConferenceActionStandIn(answers: ActionAnswers = {}): {
	supabase: SupabaseClient;
	queries: ActionQuery[];
} {
	const queries: ActionQuery[] = [];

	function builderFor(table: string): ActionBuilder {
		const query: ActionQuery = {
			table,
			columns: '',
			updated: null,
			isDelete: false,
			eq: [],
			in: [],
			not: [],
			limit: []
		};
		queries.push(query);

		const message = answers.errors?.[table];
		const answer = {
			data: message ? null : (answers.rows?.[table] ?? []),
			error: message ? { message } : null
		};

		const builder: ActionBuilder = {
			select: (columns) => {
				query.columns = columns;
				return builder;
			},
			update: (row) => {
				query.updated = row;
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
			not: (column, operator, value) => {
				query.not.push([column, operator, value]);
				return builder;
			},
			limit: (count) => {
				query.limit.push(count);
				return builder;
			},
			overrideTypes: async () => answer,
			then: (resolve) => resolve(answer)
		};

		return builder;
	}

	const supabase = { from: builderFor };

	return { supabase: supabase as unknown as SupabaseClient, queries };
}

/** The relations an action asked for, in the order it asked for them. */
function actionTablesRead(queries: ActionQuery[]): string[] {
	return queries.map((query) => query.table);
}

describe('setConferenceStatus', () => {
	it('writes the new status onto the table, for the one conference named', async () => {
		const { supabase, queries } = createConferenceActionStandIn();

		await setConferenceStatus(supabase, 'conference-1', 'published');

		// The table and not the view, for the reason `createConference` gives: a
		// view over a join cannot be written to.
		expect(actionTablesRead(queries)).toEqual([CONFERENCE_TABLE]);
		expect(queries[0].updated).toEqual({ status: 'published' });
		expect(queries[0].eq).toEqual([['id', 'conference-1']]);
	});

	it('raises with the status it could not set', async () => {
		const { supabase } = createConferenceActionStandIn({
			errors: { conferences: 'new row violates row-level security policy' }
		});

		await expect(setConferenceStatus(supabase, 'conference-1', 'archived')).rejects.toThrow(
			'archived'
		);
	});
});

describe('deleteConference', () => {
	it('removes the one conference named, from the table rather than the view', async () => {
		const { supabase, queries } = createConferenceActionStandIn();

		await deleteConference(supabase, 'conference-1');

		expect(actionTablesRead(queries)).toEqual([CONFERENCE_TABLE]);
		expect(queries[0].isDelete).toBe(true);
		expect(queries[0].eq).toEqual([['id', 'conference-1']]);
	});

	it('raises when the delete is refused', async () => {
		const { supabase } = createConferenceActionStandIn({
			errors: { conferences: 'no rows deleted' }
		});

		// Row Level Security allows a delete only while the conference is a draft,
		// so a published one is refused here however this is called.
		await expect(deleteConference(supabase, 'conference-1')).rejects.toThrow('no rows deleted');
	});
});

describe('hasSeatedDelegates', () => {
	it('answers no for a conference with no committees, without asking about seats', async () => {
		const { supabase, queries } = createConferenceActionStandIn();

		expect(await hasSeatedDelegates(supabase, 'conference-1')).toBe(false);

		// A seat belongs to a committee, so no committees means no seats. An empty
		// `in.()` list would be refused by PostgREST anyway.
		expect(actionTablesRead(queries)).toEqual(['committees']);
		expect(queries[0].eq).toEqual([['conference_id', 'conference-1']]);
	});

	it('answers yes when a seat with somebody in it comes back', async () => {
		const { supabase, queries } = createConferenceActionStandIn({
			rows: {
				committees: [{ id: 'committee-1' }, { id: 'committee-2' }],
				seats: [{ id: 'seat-1' }]
			}
		});

		expect(await hasSeatedDelegates(supabase, 'conference-1')).toBe(true);

		// The seats are asked for by committee, because they carry no conference of
		// their own, and one row is enough to answer the question.
		const seatsQuery = queries[1];

		expect(seatsQuery.table).toBe('seats');
		expect(seatsQuery.in).toEqual([['committee_id', ['committee-1', 'committee-2']]]);
		expect(seatsQuery.not).toEqual([['user_id', 'is', null]]);
		expect(seatsQuery.limit).toEqual([1]);
	});

	it('answers no when the committees have seats but nobody is in one', async () => {
		const { supabase } = createConferenceActionStandIn({
			rows: { committees: [{ id: 'committee-1' }] }
		});

		expect(await hasSeatedDelegates(supabase, 'conference-1')).toBe(false);
	});

	it('answers yes when the committees cannot be read', async () => {
		const { supabase } = createConferenceActionStandIn({
			errors: { committees: 'no connection' }
		});

		// Unpublishing is refused on this answer, so a lookup nobody could complete
		// must not be read as permission to take a conference away from delegates
		// who are already seated at it.
		expect(await hasSeatedDelegates(supabase, 'conference-1')).toBe(true);
	});

	it('answers yes when the seats cannot be read', async () => {
		const { supabase } = createConferenceActionStandIn({
			rows: { committees: [{ id: 'committee-1' }] },
			errors: { seats: 'no connection' }
		});

		expect(await hasSeatedDelegates(supabase, 'conference-1')).toBe(true);
	});
});

describe('wasEverPublished', () => {
	it('answers yes when the database has stamped first_published_at', async () => {
		const { supabase, queries } = createConferenceActionStandIn({
			rows: { conferences: [{ first_published_at: '2026-03-01T10:00:00Z' }] }
		});

		expect(await wasEverPublished(supabase, 'conference-1')).toBe(true);

		// One column of one row is all it takes to answer.
		expect(queries[0].table).toBe('conferences');
		expect(queries[0].columns).toBe('first_published_at');
		expect(queries[0].eq).toEqual([['id', 'conference-1']]);
		expect(queries[0].limit).toEqual([1]);
	});

	it('answers no for a draft that has only ever been a draft', async () => {
		const { supabase } = createConferenceActionStandIn({
			rows: { conferences: [{ first_published_at: null }] }
		});

		expect(await wasEverPublished(supabase, 'conference-1')).toBe(false);
	});

	it('answers no when there is no such conference', async () => {
		const { supabase } = createConferenceActionStandIn();

		expect(await wasEverPublished(supabase, 'conference-1')).toBe(false);
	});

	it('answers yes when the row cannot be read', async () => {
		const { supabase } = createConferenceActionStandIn({
			errors: { conferences: 'no connection' }
		});

		// Deleting is refused on this answer, so a lookup nobody could complete
		// must not be read as permission to delete a conference that may have
		// been public.
		expect(await wasEverPublished(supabase, 'conference-1')).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// The details editor saves every column of one conference and puts its logo and
// banner in the bucket. None of the three stand-ins above fits: this is the
// first part of the module that reads one row back with `single`, and the first
// that touches Supabase Storage at all. So it gets a stand-in of its own, the
// same builder shape as the others with a bucket beside it, modelled on the one
// the avatar tests use in `profiles.test.ts`.

/** What one query the details editor sent was asking for. */
type EditorQuery = {
	/** The relation `.from(...)` named. */
	table: string;
	/** The columns `.select(...)` was given, or `''` for a query that read nothing. */
	columns: string;
	/** The row `.update(...)` was given, or `null` when the query only read. */
	updated: Record<string, unknown> | null;
	eq: [string, unknown][];
	limit: number[];
};

/** What the details editor asked Supabase Storage to do. */
type RecordedStorage = {
	/** The bucket each `.from(...)` named, so a test can check which one it was. */
	buckets: string[];
	/** The paths that went into the bucket, in the order they were uploaded. */
	uploaded: string[];
	/** The paths that were deleted from it, in the order they were removed. */
	removed: string[];
};

/** What the editor stand-in should answer with. Everything here has a harmless default. */
type EditorAnswers = {
	/** The rows each relation gives back. A relation with no entry gives back none. */
	rows?: Record<string, unknown[]>;
	/** The relations whose query fails, and the message each fails with. */
	errors?: Record<string, string>;
	/** The message an upload to the bucket fails with. Nothing means it works. */
	uploadError?: string;
	/** The message a delete from the bucket fails with. Nothing means it works. */
	removeError?: string;
};

/** One step of a query on the editor stand-in. Every step hands the builder back. */
type EditorBuilder = {
	select: (columns: string) => EditorBuilder;
	update: (row: Record<string, unknown>) => EditorBuilder;
	eq: (column: string, value: unknown) => EditorBuilder;
	limit: (count: number) => EditorBuilder;
	single: () => Promise<{ data: unknown; error: QueryError | null }>;
	overrideTypes: () => Promise<{ data: unknown[] | null; error: QueryError | null }>;
	then: (resolve: (answer: { data: unknown[] | null; error: QueryError | null }) => void) => void;
};

/**
 * A stand-in that writes down every query, answers by relation name, and has a
 * bucket as well as tables.
 *
 * The three ways a chain here ends are all catered for. `single` answers with
 * one row, `overrideTypes` — which only changes the type of the answer in the
 * real client, not the answer itself — answers with a list, and an `update`
 * chain ends with nothing at all and is simply awaited. `then` is what makes
 * that last one work: `await` on any object calls its `then`, which is exactly
 * how the real builder sends its query at the last moment.
 */
function createDetailsEditorStandIn(answers: EditorAnswers = {}): {
	supabase: SupabaseClient;
	queries: EditorQuery[];
	storage: RecordedStorage;
} {
	const queries: EditorQuery[] = [];
	const storage: RecordedStorage = { buckets: [], uploaded: [], removed: [] };

	function builderFor(table: string): EditorBuilder {
		const query: EditorQuery = { table, columns: '', updated: null, eq: [], limit: [] };
		queries.push(query);

		const message = answers.errors?.[table];
		const error = message ? { message } : null;
		const rows = answers.rows?.[table] ?? [];
		const listAnswer = { data: message ? null : rows, error };
		const rowAnswer = { data: message ? null : (rows[0] ?? null), error };

		const builder: EditorBuilder = {
			select: (columns) => {
				query.columns = columns;
				return builder;
			},
			update: (values) => {
				query.updated = values;
				return builder;
			},
			eq: (column, value) => {
				query.eq.push([column, value]);
				return builder;
			},
			limit: (count) => {
				query.limit.push(count);
				return builder;
			},
			single: async () => rowAnswer,
			overrideTypes: async () => listAnswer,
			then: (resolve) => resolve(listAnswer)
		};

		return builder;
	}

	/**
	 * The storage half of the stand-in, in the shape the real client has:
	 * `supabase.storage.from(bucket)` gives back an object carrying `upload` and
	 * `remove`, and each of those answers with `{ data, error }` rather than
	 * throwing, just as a query does.
	 */
	function bucketFor(bucket: string) {
		storage.buckets.push(bucket);

		const uploadError = answers.uploadError ? { message: answers.uploadError } : null;
		const removeError = answers.removeError ? { message: answers.removeError } : null;

		return {
			upload: async (path: string) => {
				storage.uploaded.push(path);
				return { data: null, error: uploadError };
			},
			remove: async (paths: string[]) => {
				storage.removed.push(...paths);
				return { data: null, error: removeError };
			}
		};
	}

	const supabase = { from: builderFor, storage: { from: bucketFor } };

	return { supabase: supabase as unknown as SupabaseClient, queries, storage };
}

/**
 * The stand-in answering with one conference holding these two picture paths.
 *
 * Both image functions start by reading the path the conference holds at the
 * moment, so every test about them has to say what that is.
 */
function standInWithImages(
	paths: { logo_path?: string | null; banner_path?: string | null },
	answers: Omit<EditorAnswers, 'rows'> = {}
) {
	const row = { logo_path: null, banner_path: null, ...paths };

	return createDetailsEditorStandIn({ ...answers, rows: { conferences: [row] } });
}

/**
 * The bucket the pictures go in. The tests name it so that a change to another
 * bucket fails here rather than in the browser.
 */
const PUBLIC_MEDIA_BUCKET = 'public-media';

/** A picture as the form sends one. Only the type matters to these tests. */
function pictureFile(type: string): File {
	return new File(['a picture'], 'from-my-phone', { type });
}

/** Every field of the details editor filled in, which a test copies and changes. */
const FULL_EDIT_VALUES: ConferenceEditValues = {
	name: 'THIMUN The Hague 2027',
	description: 'Five days of debate in the World Forum.',
	city: 'The Hague',
	countryCode: 'NL',
	startDate: '2027-01-24',
	endDate: '2027-01-29',
	websiteUrl: 'www.thimun.org',
	tagline: 'Five days of debate',
	venueName: 'World Forum',
	venueAddress: 'Churchillplein 10',
	timezone: 'Europe/Amsterdam',
	level: 'high_school',
	language: 'English',
	expectedDelegates: '3000',
	minAge: '14',
	maxAge: '19',
	currency: 'EUR',
	contactEmail: 'hello@thimun.org',
	instagramUrl: 'www.instagram.com/thimun',
	contactPhone: '+31 70 123 4567',
	facebookUrl: 'www.facebook.com/thimun',
	linkedinUrl: 'www.linkedin.com/company/thimun',
	youtubeUrl: 'www.youtube.com/@thimun',
	tiktokUrl: 'www.tiktok.com/@thimun'
};

/** The same conference with every optional field left empty. */
const EDIT_VALUES_WITHOUT_OPTIONAL_FIELDS: ConferenceEditValues = {
	...FULL_EDIT_VALUES,
	description: '',
	websiteUrl: '',
	tagline: '',
	venueName: '',
	venueAddress: '',
	expectedDelegates: '',
	minAge: '',
	maxAge: '',
	contactEmail: '',
	instagramUrl: '',
	contactPhone: '',
	facebookUrl: '',
	linkedinUrl: '',
	youtubeUrl: '',
	tiktokUrl: ''
};

describe('updateConference', () => {
	it('writes every column the editor owns onto the table, for the one conference named', async () => {
		const { supabase, queries } = createDetailsEditorStandIn();

		await updateConference(supabase, 'conference-1', FULL_EDIT_VALUES);

		// The table and not the view, for the reason `createConference` gives: a
		// view over a join cannot be written to.
		expect(queries.map((query) => query.table)).toEqual([CONFERENCE_TABLE]);
		expect(queries[0].eq).toEqual([['id', 'conference-1']]);
		expect(queries[0].updated).toEqual({
			name: 'THIMUN The Hague 2027',
			description: 'Five days of debate in the World Forum.',
			city: 'The Hague',
			country_code: 'NL',
			start_date: '2027-01-24',
			end_date: '2027-01-29',
			website_url: 'www.thimun.org',
			tagline: 'Five days of debate',
			venue_name: 'World Forum',
			venue_address: 'Churchillplein 10',
			timezone: 'Europe/Amsterdam',
			level: 'high_school',
			language: 'English',
			expected_delegates: 3000,
			min_age: 14,
			max_age: 19,
			currency: 'EUR',
			contact_email: 'hello@thimun.org',
			instagram_url: 'www.instagram.com/thimun',
			contact_phone: '+31 70 123 4567',
			facebook_url: 'www.facebook.com/thimun',
			linkedin_url: 'www.linkedin.com/company/thimun',
			youtube_url: 'www.youtube.com/@thimun',
			tiktok_url: 'www.tiktok.com/@thimun'
		});
	});

	it('saves an optional field that was left empty as nothing at all', async () => {
		const { supabase, queries } = createDetailsEditorStandIn();

		await updateConference(supabase, 'conference-1', EDIT_VALUES_WITHOUT_OPTIONAL_FIELDS);

		// Empty text in the form means "no value" rather than a column holding ''.
		// The three number columns turn into `null` the same way.
		expect(queries[0].updated).toMatchObject({
			description: null,
			website_url: null,
			tagline: null,
			venue_name: null,
			venue_address: null,
			expected_delegates: null,
			min_age: null,
			max_age: null,
			contact_email: null,
			instagram_url: null,
			contact_phone: null,
			facebook_url: null,
			linkedin_url: null,
			youtube_url: null,
			tiktok_url: null
		});
	});

	it('turns the three number fields into numbers rather than text', async () => {
		const { supabase, queries } = createDetailsEditorStandIn();

		await updateConference(supabase, 'conference-1', FULL_EDIT_VALUES);

		expect(queries[0].updated?.expected_delegates).toBe(3000);
		expect(queries[0].updated?.min_age).toBe(14);
		expect(queries[0].updated?.max_age).toBe(19);
	});

	it('never writes the organisation or the status', async () => {
		const { supabase, queries } = createDetailsEditorStandIn();

		await updateConference(supabase, 'conference-1', FULL_EDIT_VALUES);

		// Migration 0008's trigger refuses a conference that changes organisation,
		// and `setConferenceStatus` is the only thing that moves a conference
		// between draft, published and archived.
		const writtenColumns = Object.keys(queries[0].updated ?? {});

		expect(writtenColumns).not.toContain('organization_id');
		expect(writtenColumns).not.toContain('status');
	});

	it('raises when the database refuses the change', async () => {
		const { supabase } = createDetailsEditorStandIn({
			errors: { conferences: 'new row violates row-level security policy' }
		});

		await expect(updateConference(supabase, 'conference-1', FULL_EDIT_VALUES)).rejects.toThrow(
			'row-level security'
		);
	});
});

describe('uploadConferenceImage', () => {
	it('uploads into this conference own folder of the public bucket', async () => {
		const { supabase, storage } = standInWithImages({});

		await uploadConferenceImage(supabase, 'conference-1', 'logo', pictureFile('image/jpeg'));

		expect(storage.buckets).toEqual([PUBLIC_MEDIA_BUCKET]);
		expect(storage.uploaded).toHaveLength(1);
		// `conferences/<conference id>/<kind>-<uuid>.<ext>`, the path
		// `02-architecture/storage.md` lays down. The storage policies read those
		// first two folders to decide who may write the file, so the folder has to
		// be this conference's id.
		expect(storage.uploaded[0]).toMatch(/^conferences\/conference-1\/logo-[0-9a-f-]{36}\.jpg$/);
	});

	it('names a banner after the kind it is, so the two never collide', async () => {
		const { supabase, storage } = standInWithImages({});

		await uploadConferenceImage(supabase, 'conference-1', 'banner', pictureFile('image/png'));

		expect(storage.uploaded[0]).toMatch(/^conferences\/conference-1\/banner-[0-9a-f-]{36}\.png$/);
	});

	it('ends the name with the ending that goes with the picture type', async () => {
		const { supabase, storage } = standInWithImages({});

		await uploadConferenceImage(supabase, 'conference-1', 'logo', pictureFile('image/jpeg'));
		await uploadConferenceImage(supabase, 'conference-1', 'logo', pictureFile('image/png'));
		await uploadConferenceImage(supabase, 'conference-1', 'logo', pictureFile('image/webp'));

		const endings = storage.uploaded.map((path) => path.slice(path.lastIndexOf('.') + 1));

		expect(endings).toEqual(['jpg', 'png', 'webp']);
	});

	it('gives every upload an address of its own', async () => {
		const { supabase, storage } = standInWithImages({});

		await uploadConferenceImage(supabase, 'conference-1', 'logo', pictureFile('image/jpeg'));
		await uploadConferenceImage(supabase, 'conference-1', 'logo', pictureFile('image/jpeg'));

		// The uuid in the name is what makes replacing a picture safe: the new one
		// is a new address, so no browser can show the cached old one in its place.
		expect(storage.uploaded[0]).not.toBe(storage.uploaded[1]);
	});

	it('points the logo column at the path it uploaded', async () => {
		const { supabase, queries, storage } = standInWithImages({});

		await uploadConferenceImage(supabase, 'conference-1', 'logo', pictureFile('image/png'));

		// The first query reads the path the conference holds now and the second
		// writes the new one.
		expect(queries.map((query) => query.table)).toEqual([CONFERENCE_TABLE, CONFERENCE_TABLE]);
		expect(queries[1].eq).toEqual([['id', 'conference-1']]);
		expect(queries[1].updated).toEqual({ logo_path: storage.uploaded[0] });
	});

	it('points the banner column at the path it uploaded', async () => {
		const { supabase, queries, storage } = standInWithImages({});

		await uploadConferenceImage(supabase, 'conference-1', 'banner', pictureFile('image/png'));

		expect(queries[1].updated).toEqual({ banner_path: storage.uploaded[0] });
	});

	it('deletes the picture it replaced, and not the one it just uploaded', async () => {
		const { supabase, storage } = standInWithImages({
			logo_path: 'conferences/conference-1/logo-old.jpg'
		});

		await uploadConferenceImage(supabase, 'conference-1', 'logo', pictureFile('image/jpeg'));

		expect(storage.removed).toEqual(['conferences/conference-1/logo-old.jpg']);
		expect(storage.removed).not.toContain(storage.uploaded[0]);
	});

	it('leaves the other picture alone', async () => {
		const { supabase, storage } = standInWithImages({
			logo_path: 'conferences/conference-1/logo-old.jpg',
			banner_path: 'conferences/conference-1/banner-old.jpg'
		});

		await uploadConferenceImage(supabase, 'conference-1', 'logo', pictureFile('image/jpeg'));

		// Replacing the logo says nothing about the banner, so the banner's object
		// stays where it is and its column is not written.
		expect(storage.removed).toEqual(['conferences/conference-1/logo-old.jpg']);
	});

	it('deletes nothing when this is the first picture of its kind', async () => {
		const { supabase, storage } = standInWithImages({});

		await uploadConferenceImage(supabase, 'conference-1', 'logo', pictureFile('image/jpeg'));

		expect(storage.removed).toEqual([]);
	});

	it('still counts as saved when the old picture could not be deleted', async () => {
		const { supabase, queries } = standInWithImages(
			{ logo_path: 'conferences/conference-1/logo-old.jpg' },
			{ removeError: 'no such object' }
		);

		// By then the new picture is uploaded and the conference points at it, so an
		// object nobody points at any more is a smaller problem than an error page
		// about a change that did in fact happen. `storage.md` says so in as many
		// words.
		await expect(
			uploadConferenceImage(supabase, 'conference-1', 'logo', pictureFile('image/jpeg'))
		).resolves.toBeUndefined();
		expect(queries[1].updated).toMatchObject({ logo_path: expect.any(String) });
	});

	it('raises when the upload fails, rather than pointing the conference at nothing', async () => {
		const { supabase, queries } = standInWithImages({}, { uploadError: 'bucket full' });

		await expect(
			uploadConferenceImage(supabase, 'conference-1', 'logo', pictureFile('image/jpeg'))
		).rejects.toThrow('bucket full');
		// Only the read happened; no query wrote a column.
		expect(queries.every((query) => query.updated === null)).toBe(true);
	});

	it('raises when the row cannot be saved, so nobody is told a picture was kept', async () => {
		const { supabase } = createDetailsEditorStandIn({
			errors: { conferences: 'no connection' }
		});

		await expect(
			uploadConferenceImage(supabase, 'conference-1', 'logo', pictureFile('image/jpeg'))
		).rejects.toThrow('no connection');
	});

	it('raises before uploading anything when the conference cannot be read', async () => {
		const { supabase, storage } = createDetailsEditorStandIn({
			errors: { conferences: 'no connection' }
		});

		await expect(
			uploadConferenceImage(supabase, 'conference-1', 'logo', pictureFile('image/jpeg'))
		).rejects.toThrow('no connection');
		expect(storage.uploaded).toEqual([]);
	});
});

describe('removeConferenceImage', () => {
	it('clears the logo column and then deletes the object behind it', async () => {
		const { supabase, queries, storage } = standInWithImages({
			logo_path: 'conferences/conference-1/logo-old.jpg'
		});

		await removeConferenceImage(supabase, 'conference-1', 'logo');

		expect(queries.map((query) => query.table)).toEqual([CONFERENCE_TABLE, CONFERENCE_TABLE]);
		expect(queries[1].eq).toEqual([['id', 'conference-1']]);
		expect(queries[1].updated).toEqual({ logo_path: null });
		expect(storage.removed).toEqual(['conferences/conference-1/logo-old.jpg']);
	});

	it('clears the banner column when the banner is the one being taken away', async () => {
		const { supabase, queries, storage } = standInWithImages({
			banner_path: 'conferences/conference-1/banner-old.jpg'
		});

		await removeConferenceImage(supabase, 'conference-1', 'banner');

		expect(queries[1].updated).toEqual({ banner_path: null });
		expect(storage.removed).toEqual(['conferences/conference-1/banner-old.jpg']);
	});

	it('does nothing at all for a conference that has no such picture', async () => {
		const { supabase, queries, storage } = standInWithImages({});

		await removeConferenceImage(supabase, 'conference-1', 'logo');

		// Only the read. There is no column to clear and no object to delete.
		expect(queries).toHaveLength(1);
		expect(storage.removed).toEqual([]);
	});

	it('raises when the database refuses, rather than saying the picture has gone', async () => {
		const { supabase } = createDetailsEditorStandIn({
			errors: { conferences: 'no connection' }
		});

		await expect(removeConferenceImage(supabase, 'conference-1', 'logo')).rejects.toThrow(
			'no connection'
		);
	});
});

describe('readConferenceCurrency', () => {
	it('gives back the currency of the one conference named', async () => {
		const { supabase, queries } = createDetailsEditorStandIn({
			rows: { conferences: [{ currency: 'GBP' }] }
		});

		expect(await readConferenceCurrency(supabase, 'conference-1')).toBe('GBP');
		expect(queries[0].columns).toBe('currency');
		expect(queries[0].eq).toEqual([['id', 'conference-1']]);
	});

	it('raises when the conference cannot be read', async () => {
		const { supabase } = createDetailsEditorStandIn({
			errors: { conferences: 'no connection' }
		});

		await expect(readConferenceCurrency(supabase, 'conference-1')).rejects.toThrow('no connection');
	});
});

describe('hasInvoices', () => {
	/** A client whose only call is `rpc`, answering `conference_has_invoices` with this. */
	function answering(answer: { data: boolean | null; error: { message: string } | null }) {
		const rpc = vi.fn(async () => answer);

		return { supabase: { rpc } as unknown as SupabaseClient, rpc };
	}

	it('asks the database, which answers past the invoice policies', async () => {
		const { supabase, rpc } = answering({ data: true, error: null });

		expect(await hasInvoices(supabase, 'conference-1')).toBe(true);
		expect(rpc).toHaveBeenCalledWith('conference_has_invoices', {
			conference_id: 'conference-1'
		});
	});

	it('answers no for a conference that has invoiced nobody yet', async () => {
		const { supabase } = answering({ data: false, error: null });

		expect(await hasInvoices(supabase, 'conference-1')).toBe(false);
	});

	it('raises rather than guessing when the question cannot be asked', async () => {
		const { supabase } = answering({ data: null, error: { message: 'no connection' } });

		// Guessing "no invoices" would offer an organiser a change of currency that
		// the database would then refuse.
		await expect(hasInvoices(supabase, 'conference-1')).rejects.toThrow('no connection');
	});
});
