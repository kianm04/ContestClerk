import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the action are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import type { ManagedCommittee } from '$lib/committees';
import type { Conference } from '$lib/conferences';
import type { ManagedOrganization } from '$lib/organizations';

// The gate, the queries and the flash cookie are all stood in for, so these
// tests are about what `load` and the `move` action themselves decide.
// `requirePermission` has its own tests in `src/lib/server/access`, and what the
// database allows is tested in `tests/db/`.
vi.mock('$lib/server/access', () => ({ requirePermission: vi.fn(), requireManagePage: vi.fn() }));

vi.mock('$lib/server/manage-committees', () => ({
	listCommitteesForManage: vi.fn(),
	moveCommittee: vi.fn()
}));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

vi.mock('$lib/server/ordered-rows', () => ({ placeOrderedRow: vi.fn() }));

import { requireManagePage, requirePermission } from '$lib/server/access';
import { listCommitteesForManage, moveCommittee } from '$lib/server/manage-committees';
import { setFlash } from '$lib/server/flash';
import { placeOrderedRow } from '$lib/server/ordered-rows';
import type { MyPermissions } from '$lib/permissions';

/** What the layout hands down for an organiser: `administrator` opens every page. */
const ADMINISTRATOR: MyPermissions = {
	held: [{ permission: 'administrator', scope: 'conference' }],
	committeeIds: [],
	rank: -1
};

/** The Supabase client. `load` and the action only hand it on. */
const SUPABASE = {};

/** The organiser `requirePermission` answers with. Nothing here reads them. */
const SIGNED_IN_USER = { id: 'user-1', email: 'daniel@example.com' };

/**
 * The conference every test works on.
 *
 * Only its `id` and its `slug` are read: the id is what the query is given, and
 * the slug is what the redirect is built from.
 */
const CONFERENCE = {
	id: '11111111-1111-1111-1111-111111111111',
	slug: 'riverside-mun-2027',
	name: 'Riverside MUN 2027'
} as unknown as Conference;

/** The organisation that runs it. The layout reads it; this page never looks. */
const ORGANIZATION = {
	id: '22222222-2222-2222-2222-222222222222',
	name: 'Riverside MUN Society',
	slug: 'riverside-mun-society'
} as unknown as ManagedOrganization;

/** A full committee: two topics, fifteen seats and two chairs. */
const SECURITY_COUNCIL: ManagedCommittee = {
	id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
	slug: 'unsc',
	name: 'United Nations Security Council',
	abbreviation: 'UNSC',
	description: 'Peace and security.',
	topics: ['The situation in the Sahel', 'Cyber warfare'],
	level: 'advanced',
	room: 'Committee Room 1',
	position: 1,
	defaultSpeakingTimeSeconds: 90,
	seatCounts: { available: 1, filled: 12, reserved: 2, total: 15 },
	chairNames: ['A. Smith', 'B. Jones'],
	hasBackgroundGuide: true,
	positionPaperCount: 9
};

/** A committee nobody has made seats or chairs for yet, so it counts as nothing. */
const NEW_COMMITTEE: ManagedCommittee = {
	id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
	slug: 'ecosoc',
	name: 'Economic and Social Council',
	abbreviation: null,
	description: null,
	topics: [],
	level: 'beginner',
	room: null,
	position: 2,
	defaultSpeakingTimeSeconds: 60,
	seatCounts: { available: 0, filled: 0, reserved: 0, total: 0 },
	chairNames: [],
	hasBackgroundGuide: false,
	positionPaperCount: 0
};

/** A third one, so that the seat total has more than one number to add up. */
const HUMAN_RIGHTS: ManagedCommittee = {
	...NEW_COMMITTEE,
	id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
	slug: 'unhrc',
	name: 'Human Rights Council',
	abbreviation: 'UNHRC',
	position: 3,
	seatCounts: { available: 5, filled: 15, reserved: 0, total: 20 }
};

/** The page a move comes back to. */
const COMMITTEES_PATH = '/manage/riverside-mun-2027/committees';

/**
 * The few pieces of a request that `load` and the action here actually read.
 *
 * SvelteKit hands them a great many more, so the cast says "this is enough";
 * anything the code reaches for that is missing fails the test loudly.
 */
function makeEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		params: { slug: CONFERENCE.slug },
		url: new URL(`http://localhost${COMMITTEES_PATH}`),
		locals: { supabase: SUPABASE },
		...overrides
	};
}

/**
 * That stand-in, as the `load` function's own event type.
 *
 * `parent()` is how a page's `load` reads what the layout above it returned. It
 * is an async function on the event, so the stand-in is one too.
 */
function makeLoadEvent(): PageServerLoadEvent {
	return makeEvent({
		parent: async () => ({
			conference: CONFERENCE,
			organization: ORGANIZATION,
			permissions: ADMINISTRATOR
		})
	}) as unknown as PageServerLoadEvent;
}

/**
 * A post to the `move` action.
 *
 * Which way the committee moves travels in the address rather than in a field,
 * because the two arrows share one small form, so `search` is what this
 * stand-in has to carry alongside the id that was posted.
 */
function makeMoveEvent(search: string, fields: Record<string, string> = {}): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	return makeEvent({
		url: new URL(`http://localhost${COMMITTEES_PATH}${search}`),
		request: { formData: async () => formData }
	}) as unknown as RequestEvent;
}

/** The usual move: this committee, that way. */
function makeGoodMoveEvent(direction: string): RequestEvent {
	return makeMoveEvent(`?/move&direction=${direction}`, { committeeId: SECURITY_COUNCIL.id });
}

/**
 * Run something that is expected to redirect, and give back the redirect.
 *
 * SvelteKit's `redirect` works by throwing rather than by returning, so
 * catching it is the only way to see where it was sending the reader.
 */
async function catchRedirect(run: () => unknown): Promise<{ status: number; location: string }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number; location: string };
	}

	throw new Error('Nothing was thrown, so nothing redirected.');
}

/** What the action returns when it refuses: `fail` gives back `{ status, data }`. */
type ActionResult = {
	status?: number;
	data?: { message?: string };
};

beforeEach(() => {
	vi.mocked(requirePermission).mockResolvedValue({
		user: SIGNED_IN_USER,
		conference: CONFERENCE
	});
	vi.mocked(listCommitteesForManage).mockResolvedValue([
		SECURITY_COUNCIL,
		NEW_COMMITTEE,
		HUMAN_RIGHTS
	]);
	vi.mocked(moveCommittee).mockResolvedValue(undefined);
	vi.mocked(setFlash).mockClear();
	vi.mocked(placeOrderedRow).mockReset();
	vi.mocked(placeOrderedRow).mockResolvedValue(true);
});

describe('load', () => {
	it('works from the conference the layout already read, and does not check again', async () => {
		await load(makeLoadEvent());

		// The layout read the reader's permissions once; the page checks its own
		// line against them instead of asking the database a second time.
		expect(requirePermission).not.toHaveBeenCalled();
		expect(requireManagePage).toHaveBeenCalledWith(ADMINISTRATOR, 'committees');
		expect(listCommitteesForManage).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id);
	});

	/* `toMatchObject` rather than reading a field off the answer: SvelteKit
	   types every `load` as allowed to return nothing at all, so the answer is
	   compared as a whole instead of being narrowed first. */
	it('hands the page the committees in the order they came back', async () => {
		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({
			committees: [SECURITY_COUNCIL, NEW_COMMITTEE, HUMAN_RIGHTS]
		});
	});

	it('adds every committee’s seats together for the header', async () => {
		const result = await load(makeLoadEvent());

		// 15 + 0 + 20. The header says "3 committees · 35 seats".
		expect(result).toMatchObject({ seatTotal: 35 });
	});

	it('counts no seats at all for a conference with no committees', async () => {
		vi.mocked(listCommitteesForManage).mockResolvedValue([]);

		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({ committees: [], seatTotal: 0 });
	});

	it('counts a committee whose seats have not been made yet as none', async () => {
		vi.mocked(listCommitteesForManage).mockResolvedValue([NEW_COMMITTEE]);

		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({ seatTotal: 0 });
	});
});

describe('the move action', () => {
	it('moves the committee that was posted up, and comes back to the list', async () => {
		const redirect = await catchRedirect(() => actions.move(makeGoodMoveEvent('up')));

		expect(moveCommittee).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, SECURITY_COUNCIL.id, 'up');
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(COMMITTEES_PATH);
	});

	it('moves it down when that is the arrow that was pressed', async () => {
		await catchRedirect(() => actions.move(makeGoodMoveEvent('down')));

		expect(moveCommittee).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			SECURITY_COUNCIL.id,
			'down'
		);
	});

	it('says nothing afterwards, because the committee has visibly moved', async () => {
		await catchRedirect(() => actions.move(makeGoodMoveEvent('up')));

		expect(setFlash).not.toHaveBeenCalled();
	});

	it('refuses a direction a committee cannot move, and moves nothing', async () => {
		const result = (await actions.move(makeGoodMoveEvent('sideways'))) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('A committee can only move up or down.');
		expect(moveCommittee).not.toHaveBeenCalled();
	});

	it('refuses a request that names no direction at all', async () => {
		const event = makeMoveEvent('?/move', { committeeId: SECURITY_COUNCIL.id });

		const result = (await actions.move(event)) as ActionResult;

		expect(result.status).toBe(400);
		expect(moveCommittee).not.toHaveBeenCalled();
	});

	it('refuses a request that names no committee', async () => {
		const result = (await actions.move(makeMoveEvent('?/move&direction=up'))) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('That request did not say which committee to move.');
		expect(moveCommittee).not.toHaveBeenCalled();
	});

	it('asks the organiser gate again, because an action is its own request', async () => {
		await catchRedirect(() => actions.move(makeGoodMoveEvent('up')));

		expect(requirePermission).toHaveBeenCalled();
	});
});

describe('the moveTo action', () => {
	/** A drop of a dragged committee: which one, and the place it was dropped at. */
	function makeDropEvent(fields: Record<string, string>): RequestEvent {
		return makeMoveEvent('?/moveTo', fields);
	}

	it('puts the dropped committee at its place, counting from 0, and comes back to the list', async () => {
		const event = makeDropEvent({ committeeId: SECURITY_COUNCIL.id, place: '3' });

		const redirect = await catchRedirect(() => actions.moveTo(event));

		expect(placeOrderedRow).toHaveBeenCalledWith(
			SUPABASE,
			{ table: 'committees', ownerColumn: 'conference_id', ownerId: CONFERENCE.id },
			SECURITY_COUNCIL.id,
			2
		);
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(COMMITTEES_PATH);
		expect(requirePermission).toHaveBeenCalled();
	});

	it('refuses a drop that names no committee or no place, and moves nothing', async () => {
		const withoutPlace = makeDropEvent({ committeeId: SECURITY_COUNCIL.id, place: '0' });
		const withoutCommittee = makeDropEvent({ place: '1' });

		const first = (await actions.moveTo(withoutPlace)) as ActionResult;
		const second = (await actions.moveTo(withoutCommittee)) as ActionResult;

		expect(first.status).toBe(400);
		expect(first.data?.message).toBe('That request did not say which committee to move, or where.');
		expect(second.status).toBe(400);
		expect(placeOrderedRow).not.toHaveBeenCalled();
	});

	it('says so when the committee is not in this conference any more', async () => {
		vi.mocked(placeOrderedRow).mockResolvedValue(false);
		const event = makeDropEvent({ committeeId: 'gone', place: '1' });

		const result = (await actions.moveTo(event)) as ActionResult;

		expect(result.status).toBe(404);
		expect(result.data?.message).toBe('That committee is no longer in this conference.');
	});
});
