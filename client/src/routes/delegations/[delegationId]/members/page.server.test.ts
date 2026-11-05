import { error } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the three actions are
// given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
// The real types, not copies of them: renaming a field in `$lib/delegations.ts`
// has to fail here too.
import type { DelegationConference, DelegationMember } from '$lib/delegations';
import { delegationMembersUrl, delegationUrl } from '$lib/urls';

// The gates, the queries and the flash cookie are all stood in for, so these
// tests are about what `load` and the actions themselves decide.
// `requireDelegationMember` and `requireDelegationHead` have their own tests in
// `src/lib/server/access`, and what the database allows is tested in
// `tests/db/`.
//
// `$lib/delegations` is deliberately not stood in for: it is pure, and running
// the real rules is what proves the page and the actions agree about how every
// refusal and every flash is worded.
vi.mock('$lib/server/access', () => ({
	requireDelegationHead: vi.fn(),
	requireDelegationMember: vi.fn(),
	requireOnboarded: vi.fn()
}));

// Only the three functions this page calls are stood in for. Nothing here asks
// the database who an id belongs to, because the sentence for somebody who is
// not a member never names them.
vi.mock('$lib/server/delegations', () => ({
	listDelegationMembers: vi.fn(),
	removeDelegationMember: vi.fn(),
	setDelegationMemberRole: vi.fn()
}));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

import {
	requireDelegationHead,
	requireDelegationMember,
	requireOnboarded
} from '$lib/server/access';
import {
	listDelegationMembers,
	removeDelegationMember,
	setDelegationMemberRole
} from '$lib/server/delegations';
import { setFlash } from '$lib/server/flash';

/** The Supabase client. `load` and the actions only hand it on. */
const SUPABASE = {};

/** The cookie jar. Only `setFlash`, which is stood in for, ever touches it. */
const COOKIES = {};

/** The head reading the page. Their id is what marks their own row "(you)". */
const SIGNED_IN_USER = { id: 'user-1', email: 'amira@example.com' };

/** The delegation every test is about, and the address of its members page. */
const DELEGATION_ID = '55555555-5555-5555-5555-555555555555';
const MEMBERS_PATH = `/delegations/${DELEGATION_ID}/members`;

/** The conference the delegation belongs to. The page only reads its timezone. */
const CONFERENCE: DelegationConference = {
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
	conferenceId: CONFERENCE.id,
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

/** The head reading the page, as `listDelegationMembers` answers them. */
const HEAD: DelegationMember = {
	userId: SIGNED_IN_USER.id,
	fullName: 'Amira Haddad',
	avatarPath: null,
	institutionName: 'Lycee Francais',
	experienceLevel: 'advanced',
	role: 'head',
	joinedAt: '2026-10-01T09:00:00Z',
	seat: null,
	details: null
};

/** A member who is in one of the delegation's seats, so removing them is refused. */
const SEATED_MEMBER: DelegationMember = {
	userId: 'user-2',
	fullName: 'Luis Ortega',
	avatarPath: null,
	institutionName: 'Lycee Francais',
	experienceLevel: 'beginner',
	role: 'member',
	joinedAt: '2026-10-04T11:30:00Z',
	seat: {
		seatName: 'France',
		countryCode: 'FR',
		committeeName: 'Security Council',
		committeeAbbreviation: 'UNSC'
	},
	details: null
};

/** A member with no seat: the one who can be made a head or removed. */
const UNSEATED_MEMBER: DelegationMember = {
	userId: 'user-3',
	fullName: 'Priya Nair',
	avatarPath: null,
	institutionName: 'Lycee Francais',
	experienceLevel: 'beginner',
	role: 'member',
	joinedAt: '2026-10-05T08:15:00Z',
	seat: null,
	details: { dateOfBirth: '2008-04-12', phone: '+31 6 1234 5678', dietaryRequirements: null }
};

/** What `listDelegationMembers` answers in every test that does not change it. */
const MEMBERS = [HEAD, SEATED_MEMBER, UNSEATED_MEMBER];

/** The same delegation with a second head in it, so the first one may step down. */
const MEMBERS_WITH_TWO_HEADS = [HEAD, { ...SEATED_MEMBER, role: 'head' as const }, UNSEATED_MEMBER];

/** What both gates answer with, with anything a test needs changed. */
function makeContext(myRole: 'head' | 'member' = 'head') {
	return {
		user: SIGNED_IN_USER,
		delegation: DELEGATION,
		conference: CONFERENCE,
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
		url: new URL(`http://localhost${MEMBERS_PATH}`),
		locals: { supabase: SUPABASE },
		cookies: COOKIES,
		...overrides
	};
}

/**
 * The page `load`'s event. `parent()` is a promise for whatever the layout's own
 * `load` returned, so the stand-in answers the same five fields.
 */
function makeLoadEvent(myRole: 'head' | 'member' = 'head'): PageServerLoadEvent {
	return makeEvent({
		parent: async () => ({
			delegation: DELEGATION,
			conference: CONFERENCE,
			myRole,
			memberCount: MEMBERS.length,
			seatCounts: { allocated: 2, assigned: 1 }
		})
	}) as unknown as PageServerLoadEvent;
}

/**
 * A post to one of the three actions.
 *
 * `makeHead` reads its field out of the form; `remove` reads its member out of
 * the address, because `ConfirmButton` renders a form of its own and carries no
 * extra hidden fields. `stepDown` reads neither. So a test gives one, the other,
 * or nothing.
 */
function makeActionEvent(fields: Record<string, string> = {}, search = ''): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	return makeEvent({
		url: new URL(`http://localhost${MEMBERS_PATH}${search}`),
		request: { formData: async () => formData }
	}) as unknown as RequestEvent;
}

/**
 * Run something that is expected to redirect, and give back the redirect.
 *
 * SvelteKit's `redirect` works by throwing rather than by returning, so catching
 * it is the only way to see where it was sending the reader.
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
	vi.mocked(listDelegationMembers).mockResolvedValue(MEMBERS);
	vi.mocked(setDelegationMemberRole).mockResolvedValue('written');
	vi.mocked(removeDelegationMember).mockResolvedValue('removed');
	vi.mocked(setFlash).mockClear();
});

describe('the page load', () => {
	it('sends a member who is not a head back to the dashboard', async () => {
		const redirect = await catchRedirect(() => load(makeLoadEvent('member')));

		// A member belongs in this delegation, so they are told why rather than
		// shown the 404 a stranger gets.
		expect(listDelegationMembers).not.toHaveBeenCalled();
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'warning',
			message: 'Only heads manage members.'
		});
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(delegationUrl(DELEGATION_ID));
	});

	it('hands the page the members and the reader’s own id', async () => {
		const result = await load(makeLoadEvent());

		expect(listDelegationMembers).toHaveBeenCalledWith(SUPABASE, DELEGATION_ID);
		expect(result).toMatchObject({ members: MEMBERS, myUserId: SIGNED_IN_USER.id });
	});

	it('leaves "are you in this delegation" to the layout above it', async () => {
		await load(makeLoadEvent());

		expect(requireDelegationMember).not.toHaveBeenCalled();
		expect(requireOnboarded).toHaveBeenCalled();
	});
});

describe('makeHead', () => {
	it('asks for a head, so a plain member gets the 404 a stranger gets', async () => {
		vi.mocked(requireDelegationHead).mockImplementation(() => {
			error(404, 'This delegation does not exist.');
		});

		await expect(
			actions.makeHead(makeActionEvent({ userId: UNSEATED_MEMBER.userId }))
		).rejects.toMatchObject({ status: 404 });
	});

	it('refuses a form that named nobody', async () => {
		const redirect = await catchRedirect(() => actions.makeHead(makeActionEvent()));

		expect(setDelegationMemberRole).not.toHaveBeenCalled();
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'warning',
			message: 'That person is not a member.'
		});
		expect(redirect.location).toBe(delegationMembersUrl(DELEGATION_ID));
	});

	it('refuses somebody who is not in the delegation', async () => {
		const event = makeActionEvent({ userId: 'user-9' });

		await catchRedirect(() => actions.makeHead(event));

		// The id was not in the list the action had just read, and the sentence for
		// somebody who is not a member never names them, so nothing else is asked.
		expect(setDelegationMemberRole).not.toHaveBeenCalled();
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'warning',
			message: 'That person is not a member.'
		});
	});

	it('makes the member a head and comes back to this page', async () => {
		const event = makeActionEvent({ userId: UNSEATED_MEMBER.userId });

		const redirect = await catchRedirect(() => actions.makeHead(event));

		expect(setDelegationMemberRole).toHaveBeenCalledWith(
			SUPABASE,
			DELEGATION_ID,
			UNSEATED_MEMBER.userId,
			'head'
		);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Priya Nair is now a head.'
		});
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(delegationMembersUrl(DELEGATION_ID));
	});

	it('takes the name from the list it already read, so it reads the members once', async () => {
		await catchRedirect(() =>
			actions.makeHead(makeActionEvent({ userId: UNSEATED_MEMBER.userId }))
		);

		expect(listDelegationMembers).toHaveBeenCalledTimes(1);
	});
});

describe('stepDown', () => {
	it('asks for a head, so a plain member gets the 404 a stranger gets', async () => {
		vi.mocked(requireDelegationHead).mockImplementation(() => {
			error(404, 'This delegation does not exist.');
		});

		await expect(actions.stepDown(makeActionEvent())).rejects.toMatchObject({ status: 404 });
	});

	it('refuses the only head, so the delegation is never left without one', async () => {
		const redirect = await catchRedirect(() => actions.stepDown(makeActionEvent()));

		expect(setDelegationMemberRole).not.toHaveBeenCalled();
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'warning',
			message: 'A delegation needs at least one head.'
		});
		expect(redirect.location).toBe(delegationMembersUrl(DELEGATION_ID));
	});

	it('passes on the refusal the database gave when the last head disappeared', async () => {
		vi.mocked(listDelegationMembers).mockResolvedValue(MEMBERS_WITH_TWO_HEADS);
		vi.mocked(setDelegationMemberRole).mockResolvedValue('last_head');

		await catchRedirect(() => actions.stepDown(makeActionEvent()));

		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'warning',
			message: 'A delegation needs at least one head.'
		});
	});

	it('steps the caller down and lands them on the dashboard', async () => {
		vi.mocked(listDelegationMembers).mockResolvedValue(MEMBERS_WITH_TWO_HEADS);

		const redirect = await catchRedirect(() => actions.stepDown(makeActionEvent()));

		expect(setDelegationMemberRole).toHaveBeenCalledWith(
			SUPABASE,
			DELEGATION_ID,
			SIGNED_IN_USER.id,
			'member'
		);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'You are no longer a head.'
		});
		// Not back to this page: the caller may no longer open it, and coming back
		// would only bounce them on with a second flash saying so.
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(delegationUrl(DELEGATION_ID));
	});
});

describe('remove', () => {
	it('asks for a head, so a plain member gets the 404 a stranger gets', async () => {
		vi.mocked(requireDelegationHead).mockImplementation(() => {
			error(404, 'This delegation does not exist.');
		});

		await expect(
			actions.remove(makeActionEvent({}, `?/remove&user=${UNSEATED_MEMBER.userId}`))
		).rejects.toMatchObject({ status: 404 });
	});

	it('refuses a post with no member in the address at all', async () => {
		await catchRedirect(() => actions.remove(makeActionEvent({}, '?/remove')));

		expect(removeDelegationMember).not.toHaveBeenCalled();
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'warning',
			message: 'That person is not a member.'
		});
	});

	it('refuses the caller removing themselves', async () => {
		const event = makeActionEvent({}, `?/remove&user=${SIGNED_IN_USER.id}`);

		await catchRedirect(() => actions.remove(event));

		expect(removeDelegationMember).not.toHaveBeenCalled();
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'warning',
			message: 'You cannot remove yourself; step down or withdraw the delegation.'
		});
	});

	it('refuses a member who is in a seat, and names them', async () => {
		const event = makeActionEvent({}, `?/remove&user=${SEATED_MEMBER.userId}`);

		await catchRedirect(() => actions.remove(event));

		// The list is read again by the action, so the seat is caught here rather
		// than left to the delete policy's silent refusal.
		expect(removeDelegationMember).not.toHaveBeenCalled();
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'warning',
			message: 'Luis Ortega holds a seat; unassign it on the Seats page first.'
		});
	});

	it('words a refused delete as the seat it can only be', async () => {
		vi.mocked(removeDelegationMember).mockResolvedValue('refused');

		const event = makeActionEvent({}, `?/remove&user=${UNSEATED_MEMBER.userId}`);

		await catchRedirect(() => actions.remove(event));

		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'warning',
			message: 'Priya Nair holds a seat; unassign it on the Seats page first.'
		});
	});

	it('removes the member and comes back to this page', async () => {
		const event = makeActionEvent({}, `?/remove&user=${UNSEATED_MEMBER.userId}`);

		const redirect = await catchRedirect(() => actions.remove(event));

		expect(removeDelegationMember).toHaveBeenCalledWith(
			SUPABASE,
			DELEGATION_ID,
			UNSEATED_MEMBER.userId
		);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Priya Nair removed.'
		});
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(delegationMembersUrl(DELEGATION_ID));
	});
});
