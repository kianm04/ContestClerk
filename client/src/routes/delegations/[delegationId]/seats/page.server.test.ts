import { error } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the two actions are
// given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
// The real types, not copies of them: renaming a field in `$lib/delegations.ts`
// has to fail here too.
import type {
	DelegationConference,
	DelegationSeat,
	DelegationSeatCommittee,
	UnseatedMember
} from '$lib/delegations';
import { memberFieldName } from '$lib/delegations';
import type { DelegationSeating } from '$lib/server/delegations';
import { delegationSeatsUrl, delegationUrl } from '$lib/urls';

// The gates, the queries and the flash cookie are all stood in for, so these
// tests are about what `load` and the actions themselves decide.
// `requireDelegationMember` and `requireDelegationHead` have their own tests in
// `src/lib/server/access`, and what the database allows is tested in
// `tests/db/`.
//
// `$lib/delegations` is deliberately not stood in for: it is pure, and running
// the real rules is what proves the page and the actions agree about how every
// refusal is worded.
vi.mock('$lib/server/access', () => ({
	requireDelegationHead: vi.fn(),
	requireDelegationMember: vi.fn(),
	requireOnboarded: vi.fn()
}));

vi.mock('$lib/server/delegations', () => ({
	assignDelegationSeat: vi.fn(),
	listDelegationSeats: vi.fn(),
	readMemberName: vi.fn(),
	unassignDelegationSeat: vi.fn()
}));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

import {
	requireDelegationHead,
	requireDelegationMember,
	requireOnboarded
} from '$lib/server/access';
import {
	assignDelegationSeat,
	listDelegationSeats,
	readMemberName,
	unassignDelegationSeat
} from '$lib/server/delegations';
import { setFlash } from '$lib/server/flash';

/** The Supabase client. `load` and the actions only hand it on. */
const SUPABASE = {};

/** The cookie jar. Only `setFlash`, which is stood in for, ever touches it. */
const COOKIES = {};

/** The head reading the page. Their id is what marks their own name "(you)". */
const SIGNED_IN_USER = { id: 'user-1', email: 'amara@example.com' };

/** The delegation every test is about, and the address of its seats page. */
const DELEGATION_ID = '55555555-5555-5555-5555-555555555555';
const SEATS_PATH = `/delegations/${DELEGATION_ID}/seats`;

/**
 * A conference that has not started yet, so the seats can still be changed.
 *
 * The first day is far away on purpose: `load` asks the real
 * `canChangeDelegationSeats` with the clock of the machine running the test, so
 * only a date years out stays in the future for good.
 */
const FUTURE_CONFERENCE: DelegationConference = {
	id: '11111111-1111-1111-1111-111111111111',
	slug: 'delft-mun-2026',
	name: 'DelftMUN 2026',
	startDate: '2099-02-12',
	endDate: '2099-02-15',
	timezone: 'Europe/Amsterdam',
	status: 'published',
	applicationOpenMode: 'on_publish',
	acceptsDelegations: true,
	applicationsOpenAt: '2020-01-01T00:00:00Z',
	applicationsCloseAt: '2098-01-01T00:00:00Z'
};

/** The delegation itself, as the layout above this page hands it down. */
const DELEGATION = {
	id: DELEGATION_ID,
	conferenceId: FUTURE_CONFERENCE.id,
	name: 'Lycee Francais Delegation',
	institutionName: 'Lycee Francais',
	countryCode: 'FR',
	status: 'accepted' as const,
	requestedSeats: 12,
	note: null,
	joinCode: 'H7KP3QWX',
	submittedAt: null,
	decidedAt: null,
	decisionNote: null
};

/** The one committee the delegation holds seats in. */
const COMMITTEE: DelegationSeatCommittee = {
	id: '22222222-2222-2222-2222-222222222222',
	name: 'Security Council',
	abbreviation: 'UNSC',
	level: 'advanced'
};

/** A seat nobody is in yet. */
const EMPTY_SEAT: DelegationSeat = {
	id: 'seat-france',
	name: 'France',
	countryCode: 'FR',
	holder: null
};

/** A seat somebody is already sitting in. */
const TAKEN_SEAT: DelegationSeat = {
	id: 'seat-brazil',
	name: 'Brazil',
	countryCode: 'BR',
	holder: { userId: 'user-2', fullName: 'Luis Ortega', avatarPath: null, experienceLevel: null }
};

/** The one member of the delegation the dropdown still offers. */
const UNSEATED_MEMBER: UnseatedMember = {
	userId: 'user-3',
	fullName: 'Sara Khan',
	experienceLevel: 'beginner',
	avatarPath: null
};

/** What `listDelegationSeats` answers in every test that does not change it. */
const SEATING: DelegationSeating = {
	groups: [{ committee: COMMITTEE, seats: [EMPTY_SEAT, TAKEN_SEAT] }],
	unseatedMembers: [UNSEATED_MEMBER]
};

/** What both gates answer with, with anything a test needs changed. */
function makeContext(myRole: 'head' | 'member' = 'head') {
	return {
		user: SIGNED_IN_USER,
		delegation: DELEGATION,
		conference: FUTURE_CONFERENCE,
		myRole
	};
}

/**
 * The few pieces of a request that `load` and the actions actually read.
 *
 * SvelteKit hands them a great many more, so the cast says "this is enough";
 * anything the code reaches for that is missing fails the test loudly.
 */
function makeEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		params: { delegationId: DELEGATION_ID },
		url: new URL(`http://localhost${SEATS_PATH}`),
		locals: { supabase: SUPABASE },
		cookies: COOKIES,
		...overrides
	};
}

/**
 * The page `load`'s event. `parent()` is a promise for whatever the layout's
 * own `load` returned, so the stand-in answers the same five fields.
 */
function makeLoadEvent(myRole: 'head' | 'member' = 'head'): PageServerLoadEvent {
	return makeEvent({
		parent: async () => ({
			delegation: DELEGATION,
			conference: FUTURE_CONFERENCE,
			myRole,
			memberCount: 4,
			seatCounts: { allocated: 2, assigned: 1 }
		})
	}) as unknown as PageServerLoadEvent;
}

/**
 * A post to one of the two actions.
 *
 * `assign` reads its fields out of the form; `unassign` reads its seat out of
 * the address, because `ConfirmButton` renders a form of its own and carries no
 * extra hidden fields. So a test gives one or the other, or both.
 */
function makeActionEvent(fields: Record<string, string> = {}, search = ''): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	return makeEvent({
		url: new URL(`http://localhost${SEATS_PATH}${search}`),
		request: { formData: async () => formData }
	}) as unknown as RequestEvent;
}

/** Everything the "Assign" form of the empty seat sends when it is filled in. */
const VALID_ASSIGN_FIELDS = {
	seatId: EMPTY_SEAT.id,
	[memberFieldName(EMPTY_SEAT.id)]: UNSEATED_MEMBER.userId
};

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

beforeEach(() => {
	vi.mocked(requireDelegationMember).mockResolvedValue(makeContext());
	vi.mocked(requireDelegationHead).mockResolvedValue(makeContext());
	vi.mocked(requireOnboarded).mockResolvedValue(SIGNED_IN_USER);
	vi.mocked(listDelegationSeats).mockResolvedValue(SEATING);
	vi.mocked(assignDelegationSeat).mockResolvedValue(null);
	vi.mocked(unassignDelegationSeat).mockResolvedValue(null);
	vi.mocked(readMemberName).mockResolvedValue('That person');
	vi.mocked(setFlash).mockClear();
});

describe('the page load', () => {
	it('sends a member who is not a head back to the dashboard', async () => {
		const redirect = await catchRedirect(() => load(makeLoadEvent('member')));

		// A member belongs in this delegation, so they are told why rather than
		// shown the 404 a stranger gets.
		expect(listDelegationSeats).not.toHaveBeenCalled();
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'warning',
			message: 'Only heads assign seats.'
		});
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(delegationUrl(DELEGATION_ID));
	});

	it('hands the page the seats, the unseated members and the reader’s own id', async () => {
		const result = await load(makeLoadEvent());

		expect(listDelegationSeats).toHaveBeenCalledWith(SUPABASE, DELEGATION_ID);
		expect(result).toMatchObject({
			groups: SEATING.groups,
			unseatedMembers: SEATING.unseatedMembers,
			myUserId: SIGNED_IN_USER.id
		});
	});

	it('says the seats may still be changed while the conference is in the future', async () => {
		expect(await load(makeLoadEvent())).toMatchObject({ canChangeSeats: true });
	});

	it('leaves "are you in this delegation" to the layout above it', async () => {
		await load(makeLoadEvent());

		expect(requireDelegationMember).not.toHaveBeenCalled();
		expect(requireOnboarded).toHaveBeenCalled();
	});
});

describe('assign', () => {
	it('asks for a head, so a plain member gets the 404 a stranger gets', async () => {
		vi.mocked(requireDelegationHead).mockImplementation(() => {
			error(404, 'This delegation does not exist.');
		});

		await expect(actions.assign(makeActionEvent(VALID_ASSIGN_FIELDS))).rejects.toMatchObject({
			status: 404
		});
	});

	it('refuses a form that named nobody', async () => {
		const event = makeActionEvent({ seatId: EMPTY_SEAT.id });

		const redirect = await catchRedirect(() => actions.assign(event));

		expect(assignDelegationSeat).not.toHaveBeenCalled();
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'warning',
			message: 'Pick a member.'
		});
		expect(redirect.location).toBe(delegationSeatsUrl(DELEGATION_ID));
	});

	it('refuses a seat somebody is already sitting in', async () => {
		const fields = {
			seatId: TAKEN_SEAT.id,
			[memberFieldName(TAKEN_SEAT.id)]: UNSEATED_MEMBER.userId
		};

		await catchRedirect(() => actions.assign(makeActionEvent(fields)));

		// The seating is read again by the action, so a seat filled since the page
		// was drawn is caught here and not written over.
		expect(assignDelegationSeat).not.toHaveBeenCalled();
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'warning',
			message: 'That seat is already taken.'
		});
	});

	it('refuses a seat this delegation does not hold', async () => {
		const fields = {
			seatId: 'seat-of-another-delegation',
			[memberFieldName('seat-of-another-delegation')]: UNSEATED_MEMBER.userId
		};

		await catchRedirect(() => actions.assign(makeActionEvent(fields)));

		expect(assignDelegationSeat).not.toHaveBeenCalled();
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'warning',
			message: 'That seat is not allocated to your delegation.'
		});
	});

	it('names the person the database turned down as not being in the delegation', async () => {
		vi.mocked(assignDelegationSeat).mockResolvedValue('not_a_member');
		vi.mocked(readMemberName).mockResolvedValue('Tom Bright');

		const fields = {
			seatId: EMPTY_SEAT.id,
			[memberFieldName(EMPTY_SEAT.id)]: 'user-9'
		};

		await catchRedirect(() => actions.assign(makeActionEvent(fields)));

		// The id was not among the unseated members, so the name had to be asked
		// for; that is the only path that pays for the second query.
		expect(readMemberName).toHaveBeenCalledWith(SUPABASE, 'user-9');
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'warning',
			message: 'Tom Bright is not in this delegation.'
		});
	});

	it('seats the member and comes back to this page', async () => {
		const redirect = await catchRedirect(() =>
			actions.assign(makeActionEvent(VALID_ASSIGN_FIELDS))
		);

		expect(assignDelegationSeat).toHaveBeenCalledWith(
			SUPABASE,
			EMPTY_SEAT.id,
			UNSEATED_MEMBER.userId
		);
		// The committee is named by its short name, the way the organisers'
		// allocation grid names it.
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Sara Khan now represents France in UNSC.'
		});
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(delegationSeatsUrl(DELEGATION_ID));
	});

	it('takes the name from the seating it already read, not from a second query', async () => {
		await catchRedirect(() => actions.assign(makeActionEvent(VALID_ASSIGN_FIELDS)));

		expect(readMemberName).not.toHaveBeenCalled();
	});
});

describe('unassign', () => {
	it('asks for a head, so a plain member gets the 404 a stranger gets', async () => {
		vi.mocked(requireDelegationHead).mockImplementation(() => {
			error(404, 'This delegation does not exist.');
		});

		await expect(
			actions.unassign(makeActionEvent({}, `?/unassign&seat=${TAKEN_SEAT.id}`))
		).rejects.toMatchObject({ status: 404 });
	});

	it('refuses a post with no seat in the address at all', async () => {
		await catchRedirect(() => actions.unassign(makeActionEvent({}, '?/unassign')));

		expect(unassignDelegationSeat).not.toHaveBeenCalled();
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'warning',
			message: 'That seat is not allocated to your delegation.'
		});
	});

	it('refuses a seat nobody is sitting in', async () => {
		const event = makeActionEvent({}, `?/unassign&seat=${EMPTY_SEAT.id}`);

		await catchRedirect(() => actions.unassign(event));

		// The database cannot refuse this one, so the action decides it from the
		// seating it has just read.
		expect(unassignDelegationSeat).not.toHaveBeenCalled();
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'warning',
			message: 'That seat is already empty.'
		});
	});

	it('passes on the refusal the database gave once the conference has started', async () => {
		vi.mocked(unassignDelegationSeat).mockResolvedValue('locked');

		await catchRedirect(() =>
			actions.unassign(makeActionEvent({}, `?/unassign&seat=${TAKEN_SEAT.id}`))
		);

		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'warning',
			message: 'Seats are locked; contact the organisers.'
		});
	});

	it('frees the seat and comes back to this page', async () => {
		const redirect = await catchRedirect(() =>
			actions.unassign(makeActionEvent({}, `?/unassign&seat=${TAKEN_SEAT.id}`))
		);

		expect(unassignDelegationSeat).toHaveBeenCalledWith(SUPABASE, TAKEN_SEAT.id);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Seat freed.'
		});
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(delegationSeatsUrl(DELEGATION_ID));
	});
});
