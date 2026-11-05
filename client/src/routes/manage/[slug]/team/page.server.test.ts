import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the actions are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import type { Conference } from '$lib/conferences';
import type { ManagedOrganization } from '$lib/organizations';
import type { InviteFormErrors, PendingStaffInvite, Team, TeamPerson, TeamRole } from '$lib/team';

// The gate, the queries and the flash cookie are all stood in for, so these
// tests are about what `load` and the eight actions themselves decide.
// `requirePermissionAndRank` has its own tests in `src/lib/server/access`, and
// what the database allows is tested in `tests/db/`.
//
// `$lib/team` is deliberately not stood in for: it is pure, and running the
// real one is what proves this page and the invitation form agree about what a
// team may hold.
vi.mock('$lib/server/access', () => ({
	requirePermissionAndRank: vi.fn(),
	requireManagePage: vi.fn()
}));

vi.mock('$lib/server/team', () => ({
	addCommitteeChair: vi.fn(),
	loadTeam: vi.fn(),
	removeCommitteeChair: vi.fn(),
	removeStaff: vi.fn(),
	setMemberRoles: vi.fn(),
	updateStaffTitle: vi.fn()
}));

vi.mock('$lib/server/invites', () => ({
	createStaffInvite: vi.fn(),
	findPendingInvite: vi.fn(),
	isEmailOnTeam: vi.fn(),
	revokeInvite: vi.fn()
}));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

import { requireManagePage, requirePermissionAndRank } from '$lib/server/access';
import { setFlash } from '$lib/server/flash';
import {
	createStaffInvite,
	findPendingInvite,
	isEmailOnTeam,
	revokeInvite
} from '$lib/server/invites';
import {
	addCommitteeChair,
	loadTeam,
	removeCommitteeChair,
	removeStaff,
	setMemberRoles,
	updateStaffTitle
} from '$lib/server/team';
import type { MyPermissions } from '$lib/permissions';

/** What the layout hands down for an organiser: `administrator` opens every page. */
const ADMINISTRATOR: MyPermissions = {
	held: [{ permission: 'administrator', scope: 'conference' }],
	committeeIds: [],
	rank: -1
};

/**
 * A reader who may manage the team from the second role in the order, the
 * Chair, so that the Organiser above them is out of their reach. The order
 * is the one the roles below are in.
 */
const SECOND_RANK: MyPermissions = {
	held: [{ permission: 'manage_team', scope: 'conference' }],
	committeeIds: [],
	rank: 1
};

/** The Supabase client. `load` and the actions only hand it on. */
const SUPABASE = {};

/** The cookie jar. Only `setFlash`, which is stood in for, ever touches it. */
const COOKIES = {};

/** The organiser every action here runs as. Their own row is the one that is refused. */
const SIGNED_IN_USER = { id: 'user-organiser', email: 'daniel@example.com' };

/** The conference. Only its id, its slug and its organisation slug are read. */
const CONFERENCE = {
	id: '11111111-1111-1111-1111-111111111111',
	slug: 'riverside-mun-2027',
	name: 'Riverside MUN 2027',
	organizationSlug: 'riverside-mun-society'
} as unknown as Conference;

/** The organisation that runs it. The layout hands it down; the page does not read it. */
const ORGANIZATION = {
	id: '22222222-2222-2222-2222-222222222222',
	name: 'Riverside MUN Society',
	slug: 'riverside-mun-society'
} as unknown as ManagedOrganization;

const SECURITY_COUNCIL = {
	id: 'committee-unsc',
	name: 'United Nations Security Council',
	abbreviation: 'UNSC'
};

const HUMAN_RIGHTS = {
	id: 'committee-unhrc',
	name: 'Human Rights Council',
	abbreviation: 'UNHRC'
};

/** The three roles the conference started with, in its order, as `loadTeam` hands them over. */
const ORGANISER_ROLE: TeamRole = {
	id: 'role-organiser',
	name: 'Organiser',
	position: 0,
	scope: 'conference',
	isPublic: true,
	isAdministrator: true
};

const CHAIR_ROLE: TeamRole = {
	id: 'role-chair',
	name: 'Chair',
	position: 1,
	scope: 'committees',
	isPublic: true,
	isAdministrator: false
};

const VOLUNTEER_ROLE: TeamRole = {
	id: 'role-volunteer',
	name: 'Volunteer',
	position: 2,
	scope: 'conference',
	isPublic: false,
	isAdministrator: false
};

const ROLES = [ORGANISER_ROLE, CHAIR_ROLE, VOLUNTEER_ROLE];

/** The signed-in organiser's own row, which several actions refuse to touch. */
const ME: TeamPerson = {
	userId: SIGNED_IN_USER.id,
	fullName: 'Daniel Okafor',
	avatarPath: null,
	source: 'staff',
	roles: [ORGANISER_ROLE],
	organizationRole: null,
	title: 'Secretary General',
	committees: []
};

/** A chair with one committee, who may be given another. */
const CHAIR: TeamPerson = {
	userId: 'user-chair',
	fullName: 'Amina Otoo',
	avatarPath: null,
	source: 'staff',
	roles: [CHAIR_ROLE],
	organizationRole: null,
	title: null,
	committees: [SECURITY_COUNCIL]
};

/** A volunteer, who may not be put in charge of a committee. */
const VOLUNTEER: TeamPerson = {
	userId: 'user-volunteer',
	fullName: 'Lars Jansen',
	avatarPath: null,
	source: 'staff',
	roles: [VOLUNTEER_ROLE],
	organizationRole: null,
	title: null,
	committees: []
};

/** Somebody who is on the list through the organisation, and has no staff row to remove. */
const ORGANIZATION_MEMBER: TeamPerson = {
	userId: 'user-owner',
	fullName: 'Sofia Ricci',
	avatarPath: null,
	source: 'organization',
	roles: [],
	organizationRole: 'owner',
	title: null,
	committees: []
};

/** An invitation nobody has accepted yet. */
const PENDING_INVITE: PendingStaffInvite = {
	id: 'invite-1',
	token: 'token-old',
	email: 'nina@example.com',
	roleId: CHAIR_ROLE.id,
	roleName: 'Chair',
	committeeId: SECURITY_COUNCIL.id,
	committeeName: SECURITY_COUNCIL.name,
	title: 'Deputy Chair',
	expiresAt: '2026-10-03T12:00:00+00:00'
};

const TEAM: Team = {
	people: [ME, CHAIR, VOLUNTEER, ORGANIZATION_MEMBER],
	pendingInvites: [PENDING_INVITE],
	committees: [SECURITY_COUNCIL, HUMAN_RIGHTS],
	roles: ROLES
};

/** The page every action comes back to, and the address they are all posted to. */
const TEAM_PATH = '/manage/riverside-mun-2027/team';

/** An invitation form in which every field holds something the server accepts. */
const VALID_INVITE: Record<string, string> = {
	email: 'nina@example.com',
	roleId: CHAIR_ROLE.id,
	committeeId: SECURITY_COUNCIL.id,
	title: 'Deputy Chair'
};

/**
 * The few pieces of a request that `load` and the actions here actually read.
 *
 * SvelteKit hands them a great many more, so the cast says "this is enough";
 * anything the code reaches for that is missing fails the test loudly.
 */
function makeEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		params: { slug: CONFERENCE.slug },
		url: new URL(`http://localhost${TEAM_PATH}`),
		locals: { supabase: SUPABASE },
		cookies: COOKIES,
		...overrides
	};
}

/**
 * That stand-in, as the `load` function's own event type.
 *
 * `parent()` is how a page's `load` reads what the layout above it returned. It
 * is an async function on the event, so the stand-in is one too. `search` is
 * the `?role=` the tabs put in the address.
 */
function makeLoadEvent(search: string = ''): PageServerLoadEvent {
	return makeEvent({
		url: new URL(`http://localhost${TEAM_PATH}${search}`),
		parent: async () => ({
			permissions: ADMINISTRATOR,
			conference: CONFERENCE,
			organization: ORGANIZATION,
			claims: { sub: SIGNED_IN_USER.id }
		})
	}) as unknown as PageServerLoadEvent;
}

/** A post carrying these fields to one of the actions; a list repeats the field. */
function makeActionEvent(fields: Record<string, string | string[]> = {}): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		for (const each of [value].flat()) {
			formData.append(name, each);
		}
	}

	return makeEvent({ request: { formData: async () => formData } }) as unknown as RequestEvent;
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

/** What an action answers with, whether it refused with `fail` or returned plainly. */
type ActionResult = {
	status?: number;
	data?: {
		message?: string | null;
		inviteMessage?: string | null;
		inviteErrors?: InviteFormErrors;
		inviteValues?: { email: string };
		createdInvite?: { email: string; link: string } | null;
	};
	createdInvite?: { email: string; link: string } | null;
};

beforeEach(() => {
	vi.clearAllMocks();

	vi.mocked(requirePermissionAndRank).mockResolvedValue({
		user: SIGNED_IN_USER,
		conference: CONFERENCE,
		permissions: ADMINISTRATOR
	});
	vi.mocked(loadTeam).mockResolvedValue(TEAM);
	vi.mocked(isEmailOnTeam).mockResolvedValue(false);
	vi.mocked(findPendingInvite).mockResolvedValue(null);
	vi.mocked(createStaffInvite).mockResolvedValue('token-new');
	vi.mocked(revokeInvite).mockResolvedValue(true);
	vi.mocked(addCommitteeChair).mockResolvedValue('added');
	vi.mocked(removeCommitteeChair).mockResolvedValue(true);
	vi.mocked(setMemberRoles).mockResolvedValue(true);
	vi.mocked(updateStaffTitle).mockResolvedValue(true);
	vi.mocked(removeStaff).mockResolvedValue(true);
});

describe('load', () => {
	it('works from the conference the layout already read, and does not check again', async () => {
		await load(makeLoadEvent());

		// The layout read the reader's permissions once; the page checks its own
		// line against them instead of asking the database a second time.
		expect(requirePermissionAndRank).not.toHaveBeenCalled();
		expect(requireManagePage).toHaveBeenCalledWith(ADMINISTRATOR, 'team');
		expect(loadTeam).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id);
	});

	/* `toMatchObject` rather than reading a field off the answer: SvelteKit
	   types every `load` as allowed to return nothing at all, so the answer is
	   compared as a whole instead of being narrowed first. */
	it('hands the page the whole team', async () => {
		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({ team: TEAM });
	});

	it('opens the tab the address asked for, which names one of the roles by id', async () => {
		const result = await load(makeLoadEvent(`?role=${CHAIR_ROLE.id}`));

		expect(result).toMatchObject({ filter: CHAIR_ROLE.id });
	});

	it('opens the All tab when the address says nothing', async () => {
		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({ filter: 'all' });
	});

	it('says who is reading, so their own row can say "You"', async () => {
		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({ viewerUserId: SIGNED_IN_USER.id });
	});

	it('gives actions only on the rows of other people below the reader', async () => {
		const result = await load(makeLoadEvent());

		// Not the reader's own row, and not the organisation's owner.
		expect(result).toMatchObject({ actionableUserIds: [CHAIR.userId, VOLUNTEER.userId] });
	});

	it('offers "Send again" and "Revoke" only on invitations to a role below the reader', async () => {
		const administrator = await load(makeLoadEvent());
		const event = makeLoadEvent();
		const parent = await event.parent();
		event.parent = async () => ({ ...parent, permissions: SECOND_RANK });
		const secondRank = await load(event);

		// The pending invitation hands over Chair, the reader's own rank.
		expect(administrator).toMatchObject({ changeableInviteIds: [PENDING_INVITE.id] });
		expect(secondRank).toMatchObject({ changeableInviteIds: [] });
	});

	it('offers the invitation form only the roles below the reader', async () => {
		const event = makeLoadEvent();
		const parent = await event.parent();
		event.parent = async () => ({ ...parent, permissions: SECOND_RANK });

		const result = await load(event);

		expect(result).toMatchObject({ giveableRoles: [VOLUNTEER_ROLE], canManageRoles: false });
	});

	it('opens the "Edit roles" dialog for a person the reader may change', async () => {
		const result = (await load(makeLoadEvent(`?edit=${CHAIR.userId}`))) as unknown as {
			editRoles: { person: TeamPerson; choices: unknown[] } | null;
		};

		expect(result.editRoles?.person).toBe(CHAIR);
		expect(result.editRoles?.choices).toHaveLength(ROLES.length);
	});

	it('opens nothing for the reader’s own row or a stranger', async () => {
		expect(await load(makeLoadEvent(`?edit=${SIGNED_IN_USER.id}`))).toMatchObject({
			editRoles: null
		});
		expect(await load(makeLoadEvent('?edit=user-stranger'))).toMatchObject({ editRoles: null });
	});

	it('reads the clock once, so no component has to ask it', async () => {
		const result = (await load(makeLoadEvent())) as unknown as { now: string };

		expect(Number.isNaN(new Date(result.now).getTime())).toBe(false);
	});
});

describe('the invite action', () => {
	it('asks the organiser gate again, because an action is its own request', async () => {
		await actions.invite(makeActionEvent(VALID_INVITE));

		expect(requirePermissionAndRank).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			CONFERENCE.slug,
			'manage_team'
		);
	});

	it('answers with the link to send, and clears the form', async () => {
		const result = (await actions.invite(makeActionEvent(VALID_INVITE))) as ActionResult;

		expect(createStaffInvite).toHaveBeenCalledWith(SUPABASE, {
			conferenceId: CONFERENCE.id,
			email: VALID_INVITE.email,
			roleId: CHAIR_ROLE.id,
			committeeId: SECURITY_COUNCIL.id,
			title: 'Deputy Chair',
			invitedBy: SIGNED_IN_USER.id
		});
		expect(result.createdInvite).toEqual({
			email: VALID_INVITE.email,
			// The whole address, not just the path: the organiser pastes it into an
			// email, and `load` and both actions read the origin off the request.
			link: 'http://localhost/invites/token-new'
		});
	});

	it('stays on the page rather than redirecting, so the link can be read', async () => {
		// Nothing thrown means nothing redirected, which is what the `await` here
		// is checking: `redirect` works by throwing.
		await expect(actions.invite(makeActionEvent(VALID_INVITE))).resolves.toBeTruthy();
		expect(setFlash).not.toHaveBeenCalled();
	});

	it('turns an empty committee box into no committee at all', async () => {
		// A role for the whole conference, since one that works per committee
		// asks for its committee.
		await actions.invite(
			makeActionEvent({ ...VALID_INVITE, roleId: VOLUNTEER_ROLE.id, committeeId: '', title: '' })
		);

		expect(createStaffInvite).toHaveBeenCalledWith(
			SUPABASE,
			expect.objectContaining({ committeeId: null, title: null })
		);
	});

	it('refuses a form with nothing in it, and writes no invitation', async () => {
		const result = (await actions.invite(makeActionEvent({}))) as ActionResult;

		expect(result.status).toBe(400);
		// The wording of each field's message belongs to `validateInviteForm`,
		// which has its own tests; what this page owes is that a refused form
		// writes nothing.
		expect(result.data?.inviteErrors?.email).toBeTruthy();
		expect(createStaffInvite).not.toHaveBeenCalled();
	});

	it('refuses a committee belonging to another conference', async () => {
		const event = makeActionEvent({ ...VALID_INVITE, committeeId: 'committee-elsewhere' });

		const result = (await actions.invite(event)) as ActionResult;

		expect(result.status).toBe(400);
		expect(createStaffInvite).not.toHaveBeenCalled();
	});

	it('refuses a role at or above the reader’s own', async () => {
		vi.mocked(requirePermissionAndRank).mockResolvedValue({
			user: SIGNED_IN_USER,
			conference: CONFERENCE,
			permissions: SECOND_RANK
		});

		const result = (await actions.invite(makeActionEvent(VALID_INVITE))) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.inviteErrors?.roleId).toBeTruthy();
		expect(createStaffInvite).not.toHaveBeenCalled();
	});

	it('refuses somebody who is already on the team', async () => {
		vi.mocked(isEmailOnTeam).mockResolvedValue(true);

		const result = (await actions.invite(makeActionEvent(VALID_INVITE))) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.inviteErrors?.email).toBe('That person is already on the team.');
		expect(createStaffInvite).not.toHaveBeenCalled();
	});

	it('refuses a second invitation to an address that already has one', async () => {
		vi.mocked(findPendingInvite).mockResolvedValue(PENDING_INVITE);

		const result = (await actions.invite(makeActionEvent(VALID_INVITE))) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.inviteErrors?.email).toBe(
			'There is already a pending invitation for that address.'
		);
		expect(createStaffInvite).not.toHaveBeenCalled();
	});

	it('keeps what was typed when it refuses, so nobody types it twice', async () => {
		vi.mocked(isEmailOnTeam).mockResolvedValue(true);

		const result = (await actions.invite(makeActionEvent(VALID_INVITE))) as ActionResult;

		expect(result.data?.inviteValues?.email).toBe(VALID_INVITE.email);
	});

	it('says so when the invitation could not be written at all', async () => {
		vi.mocked(createStaffInvite).mockResolvedValue(null);

		const result = (await actions.invite(makeActionEvent(VALID_INVITE))) as ActionResult;

		expect(result.status).toBe(500);
		expect(result.data?.inviteMessage).toBe(
			'The invitation could not be created. Please try again.'
		);
	});
});

describe('the revokeInvite action', () => {
	it('takes the invitation back and says so', async () => {
		const event = makeActionEvent({ inviteId: PENDING_INVITE.id });

		const redirect = await catchRedirect(() => actions.revokeInvite(event));

		expect(revokeInvite).toHaveBeenCalledWith(SUPABASE, PENDING_INVITE.id);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Invitation revoked.'
		});
		expect(redirect.location).toBe(TEAM_PATH);
	});

	it('does not claim to have revoked one the database refused', async () => {
		// The `invites` delete policy hides another conference's invitations from
		// this organiser, so a refused delete comes back as no rows rather than as
		// an error, and the page must not say "Invitation revoked." over it.
		vi.mocked(revokeInvite).mockResolvedValue(false);

		const result = (await actions.revokeInvite(
			makeActionEvent({ inviteId: PENDING_INVITE.id })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('That invitation is no longer there.');
		expect(setFlash).not.toHaveBeenCalled();
	});

	it('refuses a request that names no invitation', async () => {
		const result = (await actions.revokeInvite(makeActionEvent({}))) as ActionResult;

		expect(result.status).toBe(400);
		expect(revokeInvite).not.toHaveBeenCalled();
	});
});

describe('the resendInvite action', () => {
	it('writes a fresh invitation with the same details and hands back its link', async () => {
		const event = makeActionEvent({ inviteId: PENDING_INVITE.id });

		const result = (await actions.resendInvite(event)) as ActionResult;

		expect(createStaffInvite).toHaveBeenCalledWith(SUPABASE, {
			conferenceId: CONFERENCE.id,
			email: PENDING_INVITE.email,
			roleId: PENDING_INVITE.roleId,
			committeeId: SECURITY_COUNCIL.id,
			title: PENDING_INVITE.title,
			invitedBy: SIGNED_IN_USER.id
		});
		expect(result.createdInvite).toEqual({
			email: PENDING_INVITE.email,
			// The whole address, not just the path: the organiser pastes it into an
			// email, and `load` and both actions read the origin off the request.
			link: 'http://localhost/invites/token-new'
		});
	});

	it('takes the old invitation back only once the new one exists', async () => {
		await actions.resendInvite(makeActionEvent({ inviteId: PENDING_INVITE.id }));

		expect(revokeInvite).toHaveBeenCalledWith(SUPABASE, PENDING_INVITE.id);
		expect(vi.mocked(createStaffInvite).mock.invocationCallOrder[0]).toBeLessThan(
			vi.mocked(revokeInvite).mock.invocationCallOrder[0]
		);
	});

	it('keeps the old invitation when the new one could not be written', async () => {
		vi.mocked(createStaffInvite).mockResolvedValue(null);

		const result = (await actions.resendInvite(
			makeActionEvent({ inviteId: PENDING_INVITE.id })
		)) as ActionResult;

		expect(result.status).toBe(500);
		expect(revokeInvite).not.toHaveBeenCalled();
	});

	it('refuses an invitation that is no longer waiting', async () => {
		const result = (await actions.resendInvite(
			makeActionEvent({ inviteId: 'invite-gone' })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.inviteMessage).toBe('That invitation is no longer there.');
		expect(createStaffInvite).not.toHaveBeenCalled();
	});
});

describe('the setRoles action', () => {
	it('gives the person exactly the roles ticked, and comes back to the list', async () => {
		const event = makeActionEvent({
			userId: VOLUNTEER.userId,
			roleId: [CHAIR_ROLE.id, VOLUNTEER_ROLE.id]
		});

		const redirect = await catchRedirect(() => actions.setRoles(event));

		expect(setMemberRoles).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, VOLUNTEER.userId, [
			CHAIR_ROLE.id,
			VOLUNTEER_ROLE.id
		]);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Roles saved for Lars Jansen.'
		});
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(TEAM_PATH);
	});

	it('keeps the role filter the reader had open', async () => {
		const event = makeActionEvent({
			userId: VOLUNTEER.userId,
			roleId: VOLUNTEER_ROLE.id,
			filter: VOLUNTEER_ROLE.id
		});

		const redirect = await catchRedirect(() => actions.setRoles(event));

		expect(redirect.location).toBe(`${TEAM_PATH}?role=${VOLUNTEER_ROLE.id}`);
	});

	it('takes every role away when nothing is ticked', async () => {
		await catchRedirect(() => actions.setRoles(makeActionEvent({ userId: CHAIR.userId })));

		expect(setMemberRoles).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, CHAIR.userId, []);
	});

	it('refuses the reader’s own row and a row from the organisation', async () => {
		for (const userId of [SIGNED_IN_USER.id, ORGANIZATION_MEMBER.userId]) {
			const result = (await actions.setRoles(
				makeActionEvent({ userId, roleId: VOLUNTEER_ROLE.id })
			)) as ActionResult;

			expect(result.status).toBe(403);
			expect(result.data?.message).toBe('You can only change people below your own role.');
		}

		expect(setMemberRoles).not.toHaveBeenCalled();
	});

	it('refuses somebody at the reader’s own rank', async () => {
		vi.mocked(requirePermissionAndRank).mockResolvedValue({
			user: SIGNED_IN_USER,
			conference: CONFERENCE,
			permissions: SECOND_RANK
		});

		const result = (await actions.setRoles(
			makeActionEvent({ userId: CHAIR.userId, roleId: VOLUNTEER_ROLE.id })
		)) as ActionResult;

		expect(result.status).toBe(403);
		expect(setMemberRoles).not.toHaveBeenCalled();
	});

	it('ignores a ticked role above the reader, which the dialog never offers', async () => {
		vi.mocked(requirePermissionAndRank).mockResolvedValue({
			user: SIGNED_IN_USER,
			conference: CONFERENCE,
			permissions: SECOND_RANK
		});

		await catchRedirect(() =>
			actions.setRoles(
				makeActionEvent({
					userId: VOLUNTEER.userId,
					roleId: [ORGANISER_ROLE.id, VOLUNTEER_ROLE.id]
				})
			)
		);

		expect(setMemberRoles).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, VOLUNTEER.userId, [
			VOLUNTEER_ROLE.id
		]);
	});

	it('says so when the database would not give the roles', async () => {
		vi.mocked(setMemberRoles).mockResolvedValue(false);

		const result = (await actions.setRoles(
			makeActionEvent({ userId: VOLUNTEER.userId, roleId: CHAIR_ROLE.id })
		)) as ActionResult;

		expect(result.status).toBe(403);
		expect(result.data?.message).toBe('You can only give and take roles below your own.');
		expect(setFlash).not.toHaveBeenCalled();
	});

	it('refuses somebody who is not on this team', async () => {
		const result = (await actions.setRoles(
			makeActionEvent({ userId: 'user-stranger', roleId: CHAIR_ROLE.id })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(setMemberRoles).not.toHaveBeenCalled();
	});
});

describe('the updateTitle action', () => {
	it('saves the title and says so', async () => {
		const event = makeActionEvent({ userId: CHAIR.userId, title: 'Deputy Chair' });

		const redirect = await catchRedirect(() => actions.updateTitle(event));

		expect(updateStaffTitle).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			CHAIR.userId,
			'Deputy Chair'
		);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, { tone: 'success', message: 'Title saved.' });
		expect(redirect.location).toBe(TEAM_PATH);
	});

	it('clears the title when the box is left empty', async () => {
		const event = makeActionEvent({ userId: CHAIR.userId, title: '   ' });

		await catchRedirect(() => actions.updateTitle(event));

		expect(updateStaffTitle).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, CHAIR.userId, null);
	});

	it('refuses a title longer than the form allows', async () => {
		const event = makeActionEvent({ userId: CHAIR.userId, title: 'T'.repeat(41) });

		const result = (await actions.updateTitle(event)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('A title can be at most 40 characters.');
		expect(updateStaffTitle).not.toHaveBeenCalled();
	});
});

describe('the assignCommittee action', () => {
	it('puts a chair in charge of a committee and says so', async () => {
		const event = makeActionEvent({ userId: CHAIR.userId, committeeId: HUMAN_RIGHTS.id });

		const redirect = await catchRedirect(() => actions.assignCommittee(event));

		expect(addCommitteeChair).toHaveBeenCalledWith(SUPABASE, HUMAN_RIGHTS.id, CHAIR.userId);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: `Amina Otoo now chairs ${HUMAN_RIGHTS.name}.`
		});
		expect(redirect.location).toBe(TEAM_PATH);
	});

	it('says so when the database refuses, rather than reporting it done (security review L5)', async () => {
		vi.mocked(addCommitteeChair).mockResolvedValue('refused');
		const event = makeActionEvent({ userId: CHAIR.userId, committeeId: HUMAN_RIGHTS.id });

		const result = (await actions.assignCommittee(event)) as ActionResult;

		expect(result.status).toBe(403);
		expect(result.data?.message).toBe('You can only change people below your own role.');
		expect(setFlash).not.toHaveBeenCalled();
	});

	it('says the person chairs the committee when they already did', async () => {
		vi.mocked(addCommitteeChair).mockResolvedValue('already-chairs');
		const event = makeActionEvent({ userId: CHAIR.userId, committeeId: HUMAN_RIGHTS.id });

		await catchRedirect(() => actions.assignCommittee(event));

		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: `Amina Otoo now chairs ${HUMAN_RIGHTS.name}.`
		});
	});

	it('refuses somebody with no role that works per committee', async () => {
		const event = makeActionEvent({ userId: VOLUNTEER.userId, committeeId: HUMAN_RIGHTS.id });

		const result = (await actions.assignCommittee(event)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe(
			'Committees are for roles that work per committee. Give them one under Edit roles first.'
		);
		expect(addCommitteeChair).not.toHaveBeenCalled();
	});

	it('refuses a member of the organisation, whose row has no actions', async () => {
		const event = makeActionEvent({
			userId: ORGANIZATION_MEMBER.userId,
			committeeId: HUMAN_RIGHTS.id
		});

		const result = (await actions.assignCommittee(event)) as ActionResult;

		expect(result.status).toBe(403);
		expect(addCommitteeChair).not.toHaveBeenCalled();
	});

	it('refuses a committee belonging to another conference', async () => {
		const event = makeActionEvent({ userId: CHAIR.userId, committeeId: 'committee-elsewhere' });

		const result = (await actions.assignCommittee(event)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('That committee is not part of this conference.');
		expect(addCommitteeChair).not.toHaveBeenCalled();
	});
});

describe('the unassignCommittee action', () => {
	it('takes the committee off the chair and says so', async () => {
		const event = makeActionEvent({ userId: CHAIR.userId, committeeId: SECURITY_COUNCIL.id });

		const redirect = await catchRedirect(() => actions.unassignCommittee(event));

		expect(removeCommitteeChair).toHaveBeenCalledWith(SUPABASE, SECURITY_COUNCIL.id, CHAIR.userId);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: `Amina Otoo no longer chairs ${SECURITY_COUNCIL.name}.`
		});
		expect(redirect.location).toBe(TEAM_PATH);
	});

	it('refuses somebody at the reader’s own rank', async () => {
		vi.mocked(requirePermissionAndRank).mockResolvedValue({
			user: SIGNED_IN_USER,
			conference: CONFERENCE,
			permissions: SECOND_RANK
		});

		const result = (await actions.unassignCommittee(
			makeActionEvent({ userId: CHAIR.userId, committeeId: SECURITY_COUNCIL.id })
		)) as ActionResult;

		expect(result.status).toBe(403);
		expect(removeCommitteeChair).not.toHaveBeenCalled();
	});

	it('does not ask what the person’s role is, because taking it away is always allowed', async () => {
		const event = makeActionEvent({ userId: VOLUNTEER.userId, committeeId: SECURITY_COUNCIL.id });

		await catchRedirect(() => actions.unassignCommittee(event));

		expect(removeCommitteeChair).toHaveBeenCalledWith(
			SUPABASE,
			SECURITY_COUNCIL.id,
			VOLUNTEER.userId
		);
	});
});

describe('the removeStaff action', () => {
	it('removes the person and says so', async () => {
		const redirect = await catchRedirect(() =>
			actions.removeStaff(makeActionEvent({ userId: VOLUNTEER.userId }))
		);

		expect(removeStaff).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, VOLUNTEER.userId);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Lars Jansen was removed from the team.'
		});
		expect(redirect.location).toBe(TEAM_PATH);
	});

	it('refuses the organiser’s own row', async () => {
		const result = (await actions.removeStaff(
			makeActionEvent({ userId: SIGNED_IN_USER.id })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('You cannot remove yourself from the team.');
		expect(removeStaff).not.toHaveBeenCalled();
	});

	it('refuses a member of the organisation, who has no staff row to remove', async () => {
		const result = (await actions.removeStaff(
			makeActionEvent({ userId: ORGANIZATION_MEMBER.userId })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe(
			"Members of the organisation are managed on the organisation's own page."
		);
		expect(removeStaff).not.toHaveBeenCalled();
	});
});
