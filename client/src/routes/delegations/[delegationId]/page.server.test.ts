import { error } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { load as loadLayout } from './+layout.server';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape the two `load` functions and the
// three actions are given.
import type { LayoutServerLoadEvent, PageServerLoadEvent, RequestEvent } from './$types';
// The real types, not copies of them: renaming a field in `$lib/delegations.ts`
// has to fail here too.
import type { Delegation, DelegationConference } from '$lib/delegations';
import { delegationUrl } from '$lib/urls';

// The two gates, the queries and the flash cookie are all stood in for, so
// these tests are about what the loads and the actions themselves decide.
// `requireDelegationMember` and `requireDelegationHead` have their own tests in
// `src/lib/server/access`, and what the database allows is tested in `tests/db/`.
//
// `$lib/delegations` is deliberately not stood in for: it is pure, and running
// the real rules is what proves the page and the actions agree about who may
// submit, withdraw and edit.
vi.mock('$lib/server/access', () => ({
	requireDelegationMember: vi.fn(),
	requireDelegationHead: vi.fn(),
	requireOnboarded: vi.fn()
}));

vi.mock('$lib/server/delegations', () => ({
	countDelegationMembers: vi.fn(),
	countDelegationSeats: vi.fn(),
	findMyDelegationSeat: vi.fn(),
	setDelegationStatus: vi.fn(),
	updateDelegationDetails: vi.fn()
}));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

import {
	requireDelegationHead,
	requireDelegationMember,
	requireOnboarded
} from '$lib/server/access';
import {
	countDelegationMembers,
	countDelegationSeats,
	findMyDelegationSeat,
	setDelegationStatus,
	updateDelegationDetails
} from '$lib/server/delegations';
import { setFlash } from '$lib/server/flash';

/** The Supabase client. The loads and the actions only hand it on. */
const SUPABASE = {};

/** The cookie jar. Only `setFlash`, which is stood in for, ever touches it. */
const COOKIES = {};

/** The reader the two gates answer with. Their id is half the seat lookup. */
const SIGNED_IN_USER = { id: 'user-1', email: 'amara@example.com' };

/** The delegation every test is about, and the address it lives at. */
const DELEGATION_ID = '55555555-5555-5555-5555-555555555555';
const DELEGATION_PATH = `/delegations/${DELEGATION_ID}`;

/**
 * A conference still taking applications: published, opened long ago and
 * closing long after any of these tests will ever run.
 *
 * The two dates are far apart on purpose. `submit` asks the real
 * `canSubmitDelegation` with the clock of the machine running the test, so a
 * window measured in years is the only one that stays open for good.
 */
const OPEN_CONFERENCE: DelegationConference = {
	id: '11111111-1111-1111-1111-111111111111',
	slug: 'delft-mun-2026',
	name: 'DelftMUN 2026',
	startDate: '2026-02-12',
	endDate: '2026-02-15',
	timezone: 'Europe/Amsterdam',
	status: 'published',
	applicationOpenMode: 'on_publish',
	acceptsDelegations: true,
	applicationsOpenAt: '2020-01-01T00:00:00Z',
	applicationsCloseAt: '2099-01-01T00:00:00Z'
};

/** The same conference after its window shut. */
const CLOSED_CONFERENCE: DelegationConference = {
	...OPEN_CONFERENCE,
	applicationsCloseAt: '2020-06-01T00:00:00Z'
};

/** The delegation itself. Every test that cares about the status replaces it. */
const DELEGATION: Delegation = {
	id: DELEGATION_ID,
	conferenceId: OPEN_CONFERENCE.id,
	name: 'Lycee Francais Delegation',
	institutionName: 'Lycee Francais',
	countryCode: 'FR',
	status: 'draft',
	requestedSeats: 12,
	note: 'We travel by train.',
	joinCode: 'H7KP3QWX',
	submittedAt: null,
	decidedAt: null,
	decisionNote: null
};

/** No seats reserved yet, which is where every delegation starts. */
const NO_SEATS = { allocated: 0, assigned: 0 };

/** What both gates answer with, with anything a test needs changed. */
function makeContext(overrides: Partial<Delegation> = {}, conference = OPEN_CONFERENCE) {
	return {
		user: SIGNED_IN_USER,
		delegation: { ...DELEGATION, ...overrides },
		conference,
		myRole: 'head' as const
	};
}

/**
 * The few pieces of a request that the loads and the actions actually read.
 *
 * SvelteKit hands them a great many more, so the cast says "this is enough";
 * anything the code reaches for that is missing fails the test loudly.
 */
function makeEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		params: { delegationId: DELEGATION_ID },
		url: new URL(`http://localhost${DELEGATION_PATH}`),
		locals: { supabase: SUPABASE },
		cookies: COOKIES,
		...overrides
	};
}

/** That stand-in, as the layout `load` function's own event type. */
function makeLayoutEvent(): LayoutServerLoadEvent {
	return makeEvent() as unknown as LayoutServerLoadEvent;
}

/**
 * The page `load`'s event. `parent()` is a promise for whatever the layout's
 * own `load` returned, so the stand-in answers the same five fields.
 */
function makeLoadEvent(
	delegation: Delegation = DELEGATION,
	conference: DelegationConference = OPEN_CONFERENCE
): PageServerLoadEvent {
	return makeEvent({
		parent: async () => ({
			delegation,
			conference,
			myRole: 'head',
			memberCount: 1,
			seatCounts: NO_SEATS
		})
	}) as unknown as PageServerLoadEvent;
}

/** A post to one of the three actions, carrying whatever the form sent. */
function makeActionEvent(fields: Record<string, string> = {}): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	return makeEvent({
		request: { formData: async () => formData }
	}) as unknown as RequestEvent;
}

/** Everything the "Details" form sends when it is filled in properly. */
const VALID_EDIT_FIELDS = {
	name: 'Lycee Francais Delegation',
	institutionName: 'Lycee Francais',
	countryCode: 'FR',
	requestedSeats: '14',
	note: 'We travel by train.'
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

/** Make the gate refuse the way it refuses a stranger: the same 404 either way. */
function refuseWithNotFound(gate: typeof requireDelegationMember | typeof requireDelegationHead) {
	vi.mocked(gate).mockImplementation(() => {
		error(404, 'This delegation does not exist.');
	});
}

beforeEach(() => {
	vi.mocked(requireDelegationMember).mockResolvedValue(makeContext());
	vi.mocked(requireDelegationHead).mockResolvedValue(makeContext());
	vi.mocked(requireOnboarded).mockResolvedValue(SIGNED_IN_USER);
	vi.mocked(countDelegationMembers).mockResolvedValue(1);
	vi.mocked(countDelegationSeats).mockResolvedValue(NO_SEATS);
	vi.mocked(findMyDelegationSeat).mockResolvedValue(null);
	vi.mocked(setDelegationStatus).mockResolvedValue(undefined);
	vi.mocked(updateDelegationDetails).mockResolvedValue(undefined);
	vi.mocked(setFlash).mockClear();
});

describe('the layout load', () => {
	it('answers 404 when the reader is not in this delegation', async () => {
		refuseWithNotFound(requireDelegationMember);

		// A signed-in stranger and a delegation that does not exist get the same
		// answer, which is the rule for the whole app: never a 403.
		await expect(loadLayout(makeLayoutEvent())).rejects.toMatchObject({ status: 404 });
	});

	it('hands every page under it the delegation, its conference and the reader’s role', async () => {
		vi.mocked(requireDelegationMember).mockResolvedValue({
			...makeContext(),
			myRole: 'member' as const
		});

		expect(await loadLayout(makeLayoutEvent())).toMatchObject({
			delegation: DELEGATION,
			conference: OPEN_CONFERENCE,
			myRole: 'member'
		});
	});

	it('counts the members and the seats for the head view', async () => {
		vi.mocked(countDelegationMembers).mockResolvedValue(9);
		vi.mocked(countDelegationSeats).mockResolvedValue({ allocated: 12, assigned: 6 });

		const result = await loadLayout(makeLayoutEvent());

		expect(countDelegationMembers).toHaveBeenCalledWith(SUPABASE, DELEGATION_ID);
		expect(countDelegationSeats).toHaveBeenCalledWith(SUPABASE, DELEGATION_ID);
		expect(result).toMatchObject({
			myRole: 'head',
			memberCount: 9,
			seatCounts: { allocated: 12, assigned: 6 }
		});
	});
});

describe('the page load', () => {
	it('leaves "are you in this delegation" to the layout above it', async () => {
		// `await parent()` waits for the layout's own `load`, which has already
		// thrown a 404 at anybody who is not a member, so this page does not ask
		// the same question a second time. `/manage/[slug]` is built the same way.
		// What it does ask for is the reader's own id, which the layout does not
		// hand down and which the seat lookup below needs.
		await load(makeLoadEvent());

		expect(requireDelegationMember).not.toHaveBeenCalled();
		expect(requireOnboarded).toHaveBeenCalled();
	});

	it('looks up the reader’s own seat, and nobody else’s', async () => {
		vi.mocked(findMyDelegationSeat).mockResolvedValue({
			seatName: 'France',
			countryCode: 'FR',
			committeeName: 'Security Council',
			committeeSlug: 'security-council'
		});

		const result = await load(makeLoadEvent());

		expect(findMyDelegationSeat).toHaveBeenCalledWith(SUPABASE, DELEGATION_ID, SIGNED_IN_USER.id);
		expect(result).toMatchObject({ mySeat: { seatName: 'France' } });
	});

	it('answers no seat at all for a member before the organisers have allocated any', async () => {
		expect(await load(makeLoadEvent())).toMatchObject({ mySeat: null });
	});

	it('fills the edit form from the delegation the layout read', async () => {
		expect(await load(makeLoadEvent())).toMatchObject({
			editValues: {
				name: DELEGATION.name,
				institutionName: DELEGATION.institutionName,
				countryCode: 'FR',
				requestedSeats: '12',
				note: DELEGATION.note
			}
		});
	});

	it('offers the edit form while the delegation is open and the conference takes delegations', async () => {
		expect(await load(makeLoadEvent())).toMatchObject({ canEdit: true });
		expect(await load(makeLoadEvent({ ...DELEGATION, status: 'submitted' }))).toMatchObject({
			canEdit: true
		});
	});

	it('takes the edit form away once the organisers decide, or the window shuts', async () => {
		expect(await load(makeLoadEvent({ ...DELEGATION, status: 'accepted' }))).toMatchObject({
			canEdit: false
		});
		expect(await load(makeLoadEvent(DELEGATION, CLOSED_CONFERENCE))).toMatchObject({
			canEdit: false
		});
	});
});

describe('submit', () => {
	it('asks for a head, so a plain member gets the 404 a stranger gets', async () => {
		refuseWithNotFound(requireDelegationHead);

		await expect(actions.submit(makeActionEvent())).rejects.toMatchObject({ status: 404 });
	});

	it('refuses once applications have closed, naming the day they closed', async () => {
		vi.mocked(requireDelegationHead).mockResolvedValue(makeContext({}, CLOSED_CONFERENCE));

		const redirect = await catchRedirect(() => actions.submit(makeActionEvent()));

		expect(setDelegationStatus).not.toHaveBeenCalled();
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'warning',
			message: 'Applications for DelftMUN 2026 closed on 1 Jun 2020.'
		});
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(delegationUrl(DELEGATION_ID));
	});

	it('refuses anything that is no longer a draft', async () => {
		vi.mocked(requireDelegationHead).mockResolvedValue(makeContext({ status: 'submitted' }));

		await catchRedirect(() => actions.submit(makeActionEvent()));

		expect(setDelegationStatus).not.toHaveBeenCalled();
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'warning',
			message: 'This delegation has already been sent to the organisers.'
		});
	});

	it('sends a draft to the organisers and comes back to this page', async () => {
		const redirect = await catchRedirect(() => actions.submit(makeActionEvent()));

		expect(setDelegationStatus).toHaveBeenCalledWith(SUPABASE, DELEGATION_ID, 'submitted');
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Request sent to the organisers.'
		});
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(delegationUrl(DELEGATION_ID));
	});
});

describe('withdraw', () => {
	it('asks for a head, so a plain member gets the 404 a stranger gets', async () => {
		refuseWithNotFound(requireDelegationHead);

		await expect(actions.withdraw(makeActionEvent())).rejects.toMatchObject({ status: 404 });
	});

	it('refuses once a seat has been allocated', async () => {
		vi.mocked(requireDelegationHead).mockResolvedValue(makeContext({ status: 'submitted' }));
		vi.mocked(countDelegationSeats).mockResolvedValue({ allocated: 4, assigned: 2 });

		const redirect = await catchRedirect(() => actions.withdraw(makeActionEvent()));

		// The seats are counted again by the action rather than trusted from
		// whenever the page was last drawn.
		expect(countDelegationSeats).toHaveBeenCalledWith(SUPABASE, DELEGATION_ID);
		expect(setDelegationStatus).not.toHaveBeenCalled();
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'warning',
			message: 'Seats were already allocated; ask the organisers to cancel.'
		});
		expect(redirect.location).toBe(delegationUrl(DELEGATION_ID));
	});

	it('refuses a status the head may no longer withdraw from', async () => {
		vi.mocked(requireDelegationHead).mockResolvedValue(makeContext({ status: 'accepted' }));

		await catchRedirect(() => actions.withdraw(makeActionEvent()));

		expect(setDelegationStatus).not.toHaveBeenCalled();
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'warning',
			message: 'This delegation can no longer be withdrawn.'
		});
	});

	it('withdraws a submitted request and comes back to this page', async () => {
		vi.mocked(requireDelegationHead).mockResolvedValue(makeContext({ status: 'submitted' }));

		const redirect = await catchRedirect(() => actions.withdraw(makeActionEvent()));

		expect(setDelegationStatus).toHaveBeenCalledWith(SUPABASE, DELEGATION_ID, 'withdrawn');
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Request withdrawn.'
		});
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(delegationUrl(DELEGATION_ID));
	});
});

describe('update', () => {
	it('asks for a head, so a plain member gets the 404 a stranger gets', async () => {
		refuseWithNotFound(requireDelegationHead);

		await expect(actions.update(makeActionEvent(VALID_EDIT_FIELDS))).rejects.toMatchObject({
			status: 404
		});
	});

	it('refuses once the organisers have accepted the delegation', async () => {
		vi.mocked(requireDelegationHead).mockResolvedValue(makeContext({ status: 'accepted' }));

		const redirect = await catchRedirect(() => actions.update(makeActionEvent(VALID_EDIT_FIELDS)));

		expect(updateDelegationDetails).not.toHaveBeenCalled();
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'warning',
			message: 'This delegation can no longer be changed.'
		});
		expect(redirect.location).toBe(delegationUrl(DELEGATION_ID));
	});

	it('keeps working while the request is under review', async () => {
		vi.mocked(requireDelegationHead).mockResolvedValue(makeContext({ status: 'submitted' }));

		await catchRedirect(() => actions.update(makeActionEvent(VALID_EDIT_FIELDS)));

		expect(updateDelegationDetails).toHaveBeenCalled();
	});

	it('refuses once applications have closed, as the database does', async () => {
		vi.mocked(requireDelegationHead).mockResolvedValue(
			makeContext({ status: 'submitted' }, CLOSED_CONFERENCE)
		);

		const redirect = await catchRedirect(() => actions.update(makeActionEvent(VALID_EDIT_FIELDS)));

		expect(updateDelegationDetails).not.toHaveBeenCalled();
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'warning',
			message: 'This delegation can no longer be changed.'
		});
		expect(redirect.location).toBe(delegationUrl(DELEGATION_ID));
	});

	it('hands back what was typed when a box is wrong, and saves nothing', async () => {
		const result = await actions.update(makeActionEvent({ ...VALID_EDIT_FIELDS, name: '' }));

		expect(updateDelegationDetails).not.toHaveBeenCalled();
		// `fail` answers with a 400 and the result the page draws as `form`.
		expect(result).toMatchObject({
			status: 400,
			data: {
				values: { institutionName: 'Lycee Francais', requestedSeats: '14' },
				errors: { name: 'Give your delegation a name.' }
			}
		});
	});

	it('saves the five columns a head may write and comes back to this page', async () => {
		const redirect = await catchRedirect(() => actions.update(makeActionEvent(VALID_EDIT_FIELDS)));

		expect(updateDelegationDetails).toHaveBeenCalledWith(SUPABASE, DELEGATION_ID, {
			name: 'Lycee Francais Delegation',
			institutionName: 'Lycee Francais',
			countryCode: 'FR',
			requestedSeats: 14,
			note: 'We travel by train.'
		});
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Details saved.'
		});
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(delegationUrl(DELEGATION_ID));
	});

	it('stores an empty note as nothing at all, because the column is nullable', async () => {
		await catchRedirect(() => actions.update(makeActionEvent({ ...VALID_EDIT_FIELDS, note: '' })));

		expect(updateDelegationDetails).toHaveBeenCalledWith(
			SUPABASE,
			DELEGATION_ID,
			expect.objectContaining({ note: null })
		);
	});
});
