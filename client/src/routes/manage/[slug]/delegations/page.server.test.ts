import { beforeEach, describe, expect, it, vi } from 'vitest';
import { load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in event below is exactly the shape `load` is given.
import type { PageServerLoadEvent } from './$types';
import type { Conference } from '$lib/conferences';
import type { DelegationSummary, OrganiserDelegationRow } from '$lib/delegations';

// The two queries are stood in for, so these tests are about what `load` itself
// decides. What the database returns is tested in `tests/db/`.
//
// `$lib/delegations` is deliberately not stood in for: it is pure, and running
// the real `parseDelegationListQuery` is what proves this page and the address
// bar agree with each other.
//
// There is no organiser gate to stand in for here. `load` reads the conference
// through `parent()`, and the `/manage/[slug]` layout has already checked the
// role by the time it runs.
vi.mock('$lib/server/delegations', () => ({
	listDelegationsForOrganiser: vi.fn(),
	summariseDelegations: vi.fn()
}));

import { listDelegationsForOrganiser, summariseDelegations } from '$lib/server/delegations';
import type { MyPermissions } from '$lib/permissions';

/** What the layout hands down for an organiser: `administrator` opens every page. */
const ADMINISTRATOR: MyPermissions = {
	held: [{ permission: 'administrator', scope: 'conference' }],
	committeeIds: [],
	rank: -1
};

/** The Supabase client. `load` only hands it on. */
const SUPABASE = {};

/** The conference. Only its id is read here. */
const CONFERENCE = {
	id: '11111111-1111-1111-1111-111111111111',
	slug: 'riverside-mun-2027',
	name: 'Riverside MUN 2027',
	timezone: 'Europe/Warsaw'
} as unknown as Conference;

/** The address this page lives at. */
const DELEGATIONS_PATH = '/manage/riverside-mun-2027/delegations';

/** One row of the organiser's table. Only the fields these tests read are filled in. */
function delegationRow(id: string, name: string): OrganiserDelegationRow {
	return {
		id,
		name,
		institutionName: name,
		countryCode: 'FR',
		headNames: ['Marie Dupont'],
		memberCount: 14,
		status: 'submitted',
		submittedAt: '2026-10-03T09:00:00+00:00',
		progress: { requested: 12, allocated: 10, assigned: 6, percentAssigned: 60 },
		invoice: { label: 'Unpaid', tone: 'warning' }
	} satisfies OrganiserDelegationRow;
}

const LYCEE = delegationRow('delegation-lycee', 'Lycée Français');
const RIVERSIDE = delegationRow('delegation-riverside', 'Riverside High');

/** The page of rows the table is showing. */
const ROWS = [LYCEE, RIVERSIDE];

/** What the tab strip is told, and what `summariseDelegations` answers with. */
const SUMMARY: DelegationSummary = {
	counts: { submitted: 5, accepted: 3, rejected: 1, withdrawn: 0 },
	requestedSeatsTotal: 214
};

/**
 * The few pieces of a request that `load` here actually reads.
 *
 * SvelteKit hands it a great many more, so the cast says "this is enough";
 * anything the code reaches for that is missing fails the test loudly.
 *
 * `parent()` is how a page's `load` reads what the layout above it returned. It
 * is an async function on the event, so the stand-in is one too. `search` is
 * the `?status=`, `?q=` and the rest that the tabs and the filters put in the
 * address.
 */
function makeLoadEvent(search: string = ''): PageServerLoadEvent {
	return {
		params: { slug: CONFERENCE.slug },
		url: new URL(`http://localhost${DELEGATIONS_PATH}${search}`),
		locals: { supabase: SUPABASE },
		parent: async () => ({ conference: CONFERENCE, permissions: ADMINISTRATOR })
	} as unknown as PageServerLoadEvent;
}

beforeEach(() => {
	vi.clearAllMocks();

	vi.mocked(listDelegationsForOrganiser).mockResolvedValue({ rows: ROWS, total: 2 });
	vi.mocked(summariseDelegations).mockResolvedValue(SUMMARY);
});

describe('load', () => {
	it('asks for the delegations of the conference the layout already read', async () => {
		await load(makeLoadEvent());

		expect(listDelegationsForOrganiser).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			expect.objectContaining({ status: 'submitted', page: 1 })
		);
		expect(summariseDelegations).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id);
	});

	/* `toMatchObject` rather than reading a field off the answer: SvelteKit
	   types every `load` as allowed to return nothing at all, so the answer is
	   compared as a whole instead of being narrowed first. */
	it('reads the whole list state out of the address and hands it on unchanged', async () => {
		const search = '?status=accepted&q=lycee&country=FR&sort=size&page=2';

		const result = await load(makeLoadEvent(search));

		const expectedQuery = {
			status: 'accepted',
			q: 'lycee',
			country: 'FR',
			sort: 'size',
			page: 2
		};

		expect(result).toMatchObject({ query: expect.objectContaining(expectedQuery) });
		expect(listDelegationsForOrganiser).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			expect.objectContaining(expectedQuery)
		);
	});

	it('hands the page the rows exactly as the query answered with them', async () => {
		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({ rows: ROWS });
	});

	it('hands the page the summary untouched, counts and seat total alike', async () => {
		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({ summary: SUMMARY });
	});

	/*
		Twenty-five rows to a page, and never fewer than one page. An empty tab
		saying "Page 1 of 0" would read as a mistake, so the count is clamped.
	*/
	it('counts the pages of twenty-five, and says one page when nothing matched', async () => {
		const pageCountFor = async (total: number) => {
			vi.mocked(listDelegationsForOrganiser).mockResolvedValue({ rows: ROWS, total });

			const result = await load(makeLoadEvent());

			return (result as { pageCount: number }).pageCount;
		};

		expect(await pageCountFor(0)).toBe(1);
		expect(await pageCountFor(1)).toBe(1);
		expect(await pageCountFor(25)).toBe(1);
		expect(await pageCountFor(26)).toBe(2);
		expect(await pageCountFor(51)).toBe(3);
	});
});
