import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the actions are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import type {
	OrganizationDetailsErrors,
	OrganizationMember,
	OrganizationSettings,
	PendingOrganizationInvite
} from '$lib/organizations';

// The gate, the queries, Stripe and the flash cookie are all stood in for, so
// these tests are about what `load` and the eight actions themselves decide.
// `requireOrganizationAdmin` has its own tests in `src/lib/server/access`, and
// what the database allows is tested in `tests/db/`.
//
// `$lib/organizations` is deliberately not stood in for: it is pure, and
// running the real one is what proves this page and its forms agree about what
// an organisation may hold.
vi.mock('$lib/server/access', () => ({
	requireOrganizationMember: vi.fn(),
	requireOrganizationAdmin: vi.fn()
}));

vi.mock('$lib/server/organizations', () => ({
	countOrganizationConferences: vi.fn(),
	deleteOrganization: vi.fn(),
	isEmailInOrganization: vi.fn(),
	listOrganizationMembers: vi.fn(),
	readStripeAccountId: vi.fn(),
	removeMember: vi.fn(),
	setStripeAccount: vi.fn(),
	updateMemberRole: vi.fn(),
	updateOrganization: vi.fn(),
	uploadOrganizationLogo: vi.fn()
}));

vi.mock('$lib/server/invites', () => ({
	createOrganizationInvite: vi.fn(),
	findPendingOrganizationInvite: vi.fn(),
	listPendingOrganizationInvites: vi.fn(),
	revokeInvite: vi.fn()
}));

vi.mock('$lib/server/stripe', () => ({
	createAccountLink: vi.fn(),
	createConnectAccount: vi.fn(),
	createDashboardLoginLink: vi.fn(),
	isStripeConfigured: vi.fn(),
	stripeConnectApi: vi.fn(),
	verifyConnectAccountBelongsTo: vi.fn()
}));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

import { requireOrganizationAdmin, requireOrganizationMember } from '$lib/server/access';
import { setFlash } from '$lib/server/flash';
import {
	createOrganizationInvite,
	findPendingOrganizationInvite,
	listPendingOrganizationInvites,
	revokeInvite
} from '$lib/server/invites';
import {
	countOrganizationConferences,
	deleteOrganization,
	isEmailInOrganization,
	listOrganizationMembers,
	readStripeAccountId,
	removeMember,
	setStripeAccount,
	updateMemberRole,
	updateOrganization,
	uploadOrganizationLogo
} from '$lib/server/organizations';
import {
	createAccountLink,
	createConnectAccount,
	createDashboardLoginLink,
	verifyConnectAccountBelongsTo,
	isStripeConfigured,
	stripeConnectApi,
	type StripeConnectApi
} from '$lib/server/stripe';

/** The Supabase client. `load` and the actions only hand it on. */
const SUPABASE = {};

/** The cookie jar. Only `setFlash`, which is stood in for, ever touches it. */
const COOKIES = {};

/**
 * The Stripe client. Every call made on it is stood in for as well, so it holds
 * nothing; the cast says "this is enough", the way `makeEvent` below does.
 */
const STRIPE_API = {} as unknown as StripeConnectApi;

/** The admin every action here runs as, unless a test says otherwise. */
const SIGNED_IN_USER = { id: 'user-admin', email: 'daniel@example.com' };

/** The organisation, with no Stripe account yet. */
const ORGANIZATION: OrganizationSettings = {
	id: '22222222-2222-2222-2222-222222222222',
	slug: 'riverside-mun-society',
	name: 'Riverside MUN Society',
	description: 'We run conferences.',
	countryCode: 'NL',
	countryName: 'Netherlands',
	websiteUrl: 'https://riverside.example',
	logoPath: null,
	stripeState: 'none'
};

/** The signed-in admin's own row, which the "Leave organisation" button posts. */
const ME: OrganizationMember = {
	userId: SIGNED_IN_USER.id,
	fullName: 'Daniel Okafor',
	avatarPath: null,
	role: 'admin',
	isMe: true
};

/** The owner, whose role only another owner may change. */
const OWNER: OrganizationMember = {
	userId: 'user-owner',
	fullName: 'Sofia Ricci',
	avatarPath: null,
	role: 'owner',
	isMe: false
};

/** A plain member, whose role an admin may change. */
const MEMBER: OrganizationMember = {
	userId: 'user-member',
	fullName: 'Lars Jansen',
	avatarPath: null,
	role: 'member',
	isMe: false
};

const MEMBERS = [OWNER, ME, MEMBER];

/** An invitation nobody has accepted yet. */
const PENDING_INVITE: PendingOrganizationInvite = {
	id: 'invite-1',
	token: 'token-old',
	email: 'nina@example.com',
	role: 'member',
	expiresAt: '2026-10-03T12:00:00+00:00'
};

/** The page every action comes back to, and the address they are all posted to. */
const SETTINGS_PATH = '/manage/organizations/riverside-mun-society';

/** A details form in which every box holds something the server accepts. */
const VALID_DETAILS: Record<string, string> = {
	name: 'Riverside MUN Society',
	description: 'We run conferences.',
	countryCode: 'NL',
	websiteUrl: 'https://riverside.example'
};

/** An invitation form in which every box holds something the server accepts. */
const VALID_INVITE: Record<string, string> = {
	email: 'nina@example.com',
	role: 'member'
};

/**
 * The few pieces of a request that `load` and the actions here actually read.
 *
 * SvelteKit hands them a great many more, so the cast says "this is enough";
 * anything the code reaches for that is missing fails the test loudly.
 */
function makeEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		params: { orgSlug: ORGANIZATION.slug },
		url: new URL(`http://localhost${SETTINGS_PATH}`),
		locals: { supabase: SUPABASE },
		cookies: COOKIES,
		...overrides
	};
}

/** That stand-in, as the `load` function's own event type. */
function makeLoadEvent(): PageServerLoadEvent {
	return makeEvent() as unknown as PageServerLoadEvent;
}

/** A post carrying these fields to one of the actions. */
function makeActionEvent(fields: Record<string, string | File> = {}): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	return makeEvent({ request: { formData: async () => formData } }) as unknown as RequestEvent;
}

/**
 * A file as a browser would post it. A box nobody chose a file in still sends
 * one, of no size, which is what `size: 0` below stands for.
 */
function makeFile(type: string, size: number): File {
	return new File([new Uint8Array(size)], 'logo.png', { type });
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
		inviteErrors?: { email?: string; role?: string };
		detailsErrors?: OrganizationDetailsErrors;
		detailsValues?: { name: string } | null;
	};
	createdInvite?: { email: string; link: string } | null;
};

beforeEach(() => {
	vi.clearAllMocks();

	const membership = { user: SIGNED_IN_USER, organization: ORGANIZATION, myRole: 'admin' as const };

	vi.mocked(requireOrganizationMember).mockResolvedValue(membership);
	vi.mocked(requireOrganizationAdmin).mockResolvedValue(membership);
	vi.mocked(listOrganizationMembers).mockResolvedValue(MEMBERS);
	vi.mocked(listPendingOrganizationInvites).mockResolvedValue([PENDING_INVITE]);
	vi.mocked(countOrganizationConferences).mockResolvedValue(0);
	vi.mocked(updateOrganization).mockResolvedValue(undefined);
	vi.mocked(uploadOrganizationLogo).mockResolvedValue(undefined);
	vi.mocked(updateMemberRole).mockResolvedValue(null);
	vi.mocked(removeMember).mockResolvedValue(null);
	vi.mocked(deleteOrganization).mockResolvedValue(true);
	// No Stripe account yet, which is what `stripeState: 'none'` above means.
	vi.mocked(readStripeAccountId).mockResolvedValue(null);
	vi.mocked(setStripeAccount).mockResolvedValue(undefined);
	vi.mocked(isEmailInOrganization).mockResolvedValue(false);
	vi.mocked(findPendingOrganizationInvite).mockResolvedValue(null);
	vi.mocked(createOrganizationInvite).mockResolvedValue('token-new');
	vi.mocked(revokeInvite).mockResolvedValue(true);
	vi.mocked(isStripeConfigured).mockReturnValue(true);
	vi.mocked(stripeConnectApi).mockReturnValue(STRIPE_API);
	vi.mocked(createConnectAccount).mockResolvedValue('acct_new');
	vi.mocked(createAccountLink).mockResolvedValue('https://connect.stripe.test/setup');
	vi.mocked(createDashboardLoginLink).mockResolvedValue('https://connect.stripe.test/dashboard');
	vi.mocked(verifyConnectAccountBelongsTo).mockResolvedValue(true);
});

describe('load', () => {
	it('lets a plain member read the page', async () => {
		await load(makeLoadEvent());

		expect(requireOrganizationMember).toHaveBeenCalled();
		expect(requireOrganizationAdmin).not.toHaveBeenCalled();
	});

	/* `toMatchObject` rather than reading a field off the answer: SvelteKit
	   types every `load` as allowed to return nothing at all, so the answer is
	   compared as a whole instead of being narrowed first. */
	it('hands the page the organisation, its members and its conference count', async () => {
		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({
			organization: ORGANIZATION,
			myRole: 'admin',
			members: MEMBERS,
			conferenceCount: 0,
			origin: 'http://localhost'
		});
	});

	it('asks for the pending invitations on behalf of an admin', async () => {
		const result = await load(makeLoadEvent());

		expect(listPendingOrganizationInvites).toHaveBeenCalledWith(SUPABASE, ORGANIZATION.id);
		expect(result).toMatchObject({ pendingInvites: [PENDING_INVITE] });
	});

	it('does not ask for them on behalf of a plain member, who may read none', async () => {
		vi.mocked(requireOrganizationMember).mockResolvedValue({
			user: SIGNED_IN_USER,
			organization: ORGANIZATION,
			myRole: 'member'
		});

		const result = await load(makeLoadEvent());

		expect(listPendingOrganizationInvites).not.toHaveBeenCalled();
		expect(result).toMatchObject({ pendingInvites: [] });
	});

	it('reads the clock once, so no component has to ask it', async () => {
		const result = (await load(makeLoadEvent())) as unknown as { now: string };

		expect(Number.isNaN(new Date(result.now).getTime())).toBe(false);
	});

	it('says whether this server has a Stripe key, so the card can leave the button out', async () => {
		vi.mocked(isStripeConfigured).mockReturnValue(false);

		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({ isStripeConfigured: false });
	});
});

describe('the updateDetails action', () => {
	it('asks the admin gate again, because an action is its own request', async () => {
		await catchRedirect(() => actions.updateDetails(makeActionEvent(VALID_DETAILS)));

		expect(requireOrganizationAdmin).toHaveBeenCalled();
	});

	it('saves the details and comes back to the page with a flash', async () => {
		const redirected = await catchRedirect(() =>
			actions.updateDetails(makeActionEvent(VALID_DETAILS))
		);

		expect(updateOrganization).toHaveBeenCalledWith(SUPABASE, ORGANIZATION.id, {
			name: VALID_DETAILS.name,
			description: VALID_DETAILS.description,
			countryCode: VALID_DETAILS.countryCode,
			websiteUrl: VALID_DETAILS.websiteUrl
		});
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Organisation details saved.'
		});
		expect(redirected.status).toBe(303);
		expect(redirected.location).toBe(SETTINGS_PATH);
	});

	it('refuses an empty name and keeps what was typed', async () => {
		const result = (await actions.updateDetails(
			makeActionEvent({ ...VALID_DETAILS, name: '' })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.detailsErrors?.name).toBeTruthy();
		expect(updateOrganization).not.toHaveBeenCalled();
	});

	it('ignores an empty file box, because one still posts a file of no size', async () => {
		await catchRedirect(() =>
			actions.updateDetails(makeActionEvent({ ...VALID_DETAILS, logo: makeFile('', 0) }))
		);

		expect(uploadOrganizationLogo).not.toHaveBeenCalled();
	});

	it('uploads a chosen logo after the row has been saved', async () => {
		const logo = makeFile('image/png', 10);

		await catchRedirect(() => actions.updateDetails(makeActionEvent({ ...VALID_DETAILS, logo })));

		expect(updateOrganization).toHaveBeenCalled();
		expect(uploadOrganizationLogo).toHaveBeenCalledWith(SUPABASE, ORGANIZATION.id, logo);
	});

	it('refuses a file that is not a picture, and saves nothing', async () => {
		const result = (await actions.updateDetails(
			makeActionEvent({ ...VALID_DETAILS, logo: makeFile('application/pdf', 10) })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.detailsErrors?.logo).toBe('Please upload a JPEG, PNG or WebP image.');
		expect(updateOrganization).not.toHaveBeenCalled();
	});

	it('says so when Storage refused the logo, and keeps the saved text on screen', async () => {
		vi.mocked(uploadOrganizationLogo).mockRejectedValue(new Error('bucket is full'));

		const result = (await actions.updateDetails(
			makeActionEvent({ ...VALID_DETAILS, logo: makeFile('image/png', 10) })
		)) as ActionResult;

		expect(result.status).toBe(500);
		expect(result.data?.detailsErrors?.logo).toBe('The logo could not be saved.');
		// The row was written before the upload was tried, so the words the admin
		// typed are not lost by a failure in Storage.
		expect(updateOrganization).toHaveBeenCalled();
	});
});

describe('the invite action', () => {
	it('answers with the whole link to send, and stays on the page', async () => {
		const result = (await actions.invite(makeActionEvent(VALID_INVITE))) as ActionResult;

		expect(createOrganizationInvite).toHaveBeenCalledWith(SUPABASE, {
			organizationId: ORGANIZATION.id,
			email: VALID_INVITE.email,
			role: 'member',
			invitedBy: SIGNED_IN_USER.id
		});
		// The whole address, not just the path: the admin pastes it into an email.
		expect(result.createdInvite).toEqual({
			email: VALID_INVITE.email,
			link: 'http://localhost/invites/token-new'
		});

		/*
			A flash as well as the link, which is what
			`05-pages/organiser/organization-settings.md` asks for: the toast says
			the invitation exists and the notice under it holds the address to
			send. This is the one action on the page that sets a flash without
			redirecting, and it works because a cookie set during an action is
			already there when `load` runs again a moment later.
		*/
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: `Invitation created. Share the link with ${VALID_INVITE.email}.`
		});
	});

	it('refuses somebody who is already a member', async () => {
		vi.mocked(isEmailInOrganization).mockResolvedValue(true);

		const result = (await actions.invite(makeActionEvent(VALID_INVITE))) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.inviteErrors?.email).toBe('That person is already a member.');
		expect(createOrganizationInvite).not.toHaveBeenCalled();
	});

	it('refuses a second invitation to the same address', async () => {
		vi.mocked(findPendingOrganizationInvite).mockResolvedValue(PENDING_INVITE);

		const result = (await actions.invite(makeActionEvent(VALID_INVITE))) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.inviteErrors?.email).toBe(
			'There is already a pending invitation for that address.'
		);
	});

	it('says so when nothing was written', async () => {
		vi.mocked(createOrganizationInvite).mockResolvedValue(null);

		const result = (await actions.invite(makeActionEvent(VALID_INVITE))) as ActionResult;

		expect(result.status).toBe(500);
		expect(result.data?.inviteMessage).toBe(
			'The invitation could not be created. Please try again.'
		);
	});
});

describe('the revokeInvite action', () => {
	it('revokes it and comes back with a flash', async () => {
		const redirected = await catchRedirect(() =>
			actions.revokeInvite(makeActionEvent({ inviteId: PENDING_INVITE.id }))
		);

		expect(revokeInvite).toHaveBeenCalledWith(SUPABASE, PENDING_INVITE.id);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Invitation revoked.'
		});
		expect(redirected.location).toBe(SETTINGS_PATH);
	});

	it('says so when the invitation was already gone', async () => {
		vi.mocked(revokeInvite).mockResolvedValue(false);

		const result = (await actions.revokeInvite(
			makeActionEvent({ inviteId: PENDING_INVITE.id })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('That invitation is no longer there.');
	});
});

describe('the changeRole action', () => {
	it('changes the role and names the person and the new role in the flash', async () => {
		await catchRedirect(() =>
			actions.changeRole(makeActionEvent({ userId: MEMBER.userId, role: 'admin' }))
		);

		expect(updateMemberRole).toHaveBeenCalledWith(
			SUPABASE,
			ORGANIZATION.id,
			MEMBER.userId,
			'admin'
		);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Lars Jansen is now an admin.'
		});
	});

	it('refuses a word that is not one of the three roles', async () => {
		const result = (await actions.changeRole(
			makeActionEvent({ userId: MEMBER.userId, role: 'superuser' })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(updateMemberRole).not.toHaveBeenCalled();
	});

	it('refuses an admin taking ownership away from the owner', async () => {
		const result = (await actions.changeRole(
			makeActionEvent({ userId: OWNER.userId, role: 'member' })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('Only an owner can change who owns the organisation.');
		expect(updateMemberRole).not.toHaveBeenCalled();
	});

	it('refuses an admin handing ownership to somebody else', async () => {
		const result = (await actions.changeRole(
			makeActionEvent({ userId: MEMBER.userId, role: 'owner' })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(updateMemberRole).not.toHaveBeenCalled();
	});

	it('lets an owner hand ownership over', async () => {
		vi.mocked(requireOrganizationAdmin).mockResolvedValue({
			user: SIGNED_IN_USER,
			organization: ORGANIZATION,
			myRole: 'owner'
		});

		await catchRedirect(() =>
			actions.changeRole(makeActionEvent({ userId: MEMBER.userId, role: 'owner' }))
		);

		expect(updateMemberRole).toHaveBeenCalledWith(
			SUPABASE,
			ORGANIZATION.id,
			MEMBER.userId,
			'owner'
		);
	});

	it('shows the database its own refusal, such as the last owner being demoted', async () => {
		vi.mocked(requireOrganizationAdmin).mockResolvedValue({
			user: SIGNED_IN_USER,
			organization: ORGANIZATION,
			myRole: 'owner'
		});
		vi.mocked(updateMemberRole).mockResolvedValue(
			'An organisation needs at least one owner. Make someone else an owner first.'
		);

		const result = (await actions.changeRole(
			makeActionEvent({ userId: OWNER.userId, role: 'member' })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe(
			'An organisation needs at least one owner. Make someone else an owner first.'
		);
	});
});

describe('the removeMember action', () => {
	it('removes somebody else and comes back to the page', async () => {
		const redirected = await catchRedirect(() =>
			actions.removeMember(makeActionEvent({ userId: MEMBER.userId }))
		);

		expect(removeMember).toHaveBeenCalledWith(SUPABASE, ORGANIZATION.id, MEMBER.userId);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Lars Jansen was removed from Riverside MUN Society.'
		});
		expect(redirected.location).toBe(SETTINGS_PATH);
	});

	it('sends somebody who left to the organiser area, which they can still read', async () => {
		const redirected = await catchRedirect(() =>
			actions.removeMember(makeActionEvent({ userId: ME.userId }))
		);

		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'You left Riverside MUN Society.'
		});
		expect(redirected.location).toBe('/manage');
	});

	it('refuses an admin removing an owner', async () => {
		const result = (await actions.removeMember(
			makeActionEvent({ userId: OWNER.userId })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('Only an owner can remove another owner.');
		expect(removeMember).not.toHaveBeenCalled();
	});

	it('lets an owner remove another owner', async () => {
		vi.mocked(requireOrganizationMember).mockResolvedValue({
			user: SIGNED_IN_USER,
			organization: ORGANIZATION,
			myRole: 'owner'
		});

		await catchRedirect(() => actions.removeMember(makeActionEvent({ userId: OWNER.userId })));

		expect(removeMember).toHaveBeenCalledWith(SUPABASE, ORGANIZATION.id, OWNER.userId);
	});

	it('shows the database its own refusal', async () => {
		vi.mocked(removeMember).mockResolvedValue(
			'An organisation needs at least one owner. Make someone else an owner first.'
		);

		const result = (await actions.removeMember(
			makeActionEvent({ userId: MEMBER.userId })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBeTruthy();
	});

	it('refuses a user id nobody in this organisation has', async () => {
		const result = (await actions.removeMember(
			makeActionEvent({ userId: 'user-stranger' })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(removeMember).not.toHaveBeenCalled();
	});

	/**
	 * Sign the tests below in as somebody who is only a member, which is the one
	 * role this action lets through where the other seven do not.
	 */
	function signInAsPlainMember() {
		vi.mocked(requireOrganizationMember).mockResolvedValue({
			user: { id: MEMBER.userId, email: 'lars@example.com' },
			organization: ORGANIZATION,
			myRole: 'member'
		});
		vi.mocked(listOrganizationMembers).mockResolvedValue([OWNER, ME, { ...MEMBER, isMe: true }]);
	}

	it('lets a plain member walk out on their own', async () => {
		signInAsPlainMember();

		const redirected = await catchRedirect(() =>
			actions.removeMember(makeActionEvent({ userId: MEMBER.userId }))
		);

		expect(removeMember).toHaveBeenCalledWith(SUPABASE, ORGANIZATION.id, MEMBER.userId);
		expect(redirected.location).toBe('/manage');
	});

	it('refuses a plain member taking somebody else out', async () => {
		signInAsPlainMember();

		const result = (await actions.removeMember(
			makeActionEvent({ userId: OWNER.userId })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('Only an owner or an admin can remove somebody else.');
		expect(removeMember).not.toHaveBeenCalled();
	});
});

describe('the connectStripe action', () => {
	it('opens an account, writes it down, and sends the admin to Stripe', async () => {
		const redirected = await catchRedirect(() => actions.connectStripe(makeActionEvent()));

		expect(createConnectAccount).toHaveBeenCalledWith(STRIPE_API, {
			organizationId: ORGANIZATION.id,
			countryCode: ORGANIZATION.countryCode,
			email: SIGNED_IN_USER.email
		});
		// A brand-new account is not checked against itself.
		expect(verifyConnectAccountBelongsTo).not.toHaveBeenCalled();
		expect(setStripeAccount).toHaveBeenCalledWith(SUPABASE, ORGANIZATION.id, 'acct_new');
		expect(createAccountLink).toHaveBeenCalledWith(
			STRIPE_API,
			'acct_new',
			'http://localhost/api/stripe/connect/return?org=riverside-mun-society',
			'http://localhost/api/stripe/connect/refresh?org=riverside-mun-society'
		);
		expect(redirected.status).toBe(303);
		expect(redirected.location).toBe('https://connect.stripe.test/setup');
	});

	it('says so on a server with no Stripe key', async () => {
		vi.mocked(stripeConnectApi).mockReturnValue(null);

		const result = (await actions.connectStripe(makeActionEvent())) as ActionResult;

		expect(result.status).toBe(502);
		expect(result.data?.message).toBe('Stripe is not configured on this server yet.');
	});

	it('says Stripe could not be reached when a call throws', async () => {
		vi.mocked(createConnectAccount).mockRejectedValue(new Error('network'));

		const result = (await actions.connectStripe(makeActionEvent())) as ActionResult;

		expect(result.status).toBe(502);
		expect(result.data?.message).toBe('Stripe could not be reached. Please try again in a minute.');
	});

	// An admin part way through onboarding presses "Continue Stripe setup",
	// which posts here again. A second account would leave the organisation with
	// two and no way to tell them apart.
	it('sends an organisation that already has an account back to the same one', async () => {
		vi.mocked(readStripeAccountId).mockResolvedValue('acct_existing');

		const redirected = await catchRedirect(() => actions.connectStripe(makeActionEvent()));

		expect(createConnectAccount).not.toHaveBeenCalled();
		expect(setStripeAccount).not.toHaveBeenCalled();
		expect(verifyConnectAccountBelongsTo).toHaveBeenCalledWith(
			STRIPE_API,
			'acct_existing',
			ORGANIZATION.id
		);
		expect(createAccountLink).toHaveBeenCalledWith(
			STRIPE_API,
			'acct_existing',
			expect.any(String),
			expect.any(String)
		);
		expect(redirected.location).toBe('https://connect.stripe.test/setup');
	});

	// Security review 2026-10-10, C5: a stored id is never acted on until the
	// account itself says it was opened for this organisation.
	it('refuses to open onboarding for an account that is not this organisation’s', async () => {
		vi.mocked(readStripeAccountId).mockResolvedValue('acct_somebody_elses');
		vi.mocked(verifyConnectAccountBelongsTo).mockResolvedValue(false);

		const result = (await actions.connectStripe(makeActionEvent())) as ActionResult;

		expect(createAccountLink).not.toHaveBeenCalled();
		expect(result.status).toBe(400);
		expect(result.data?.message).toBe(
			'The Stripe account on record was not opened for this organisation. Contact support.'
		);
	});
});

describe('the openStripeDashboard action', () => {
	it('says so on a server with no Stripe key', async () => {
		vi.mocked(stripeConnectApi).mockReturnValue(null);

		const result = (await actions.openStripeDashboard(makeActionEvent())) as ActionResult;

		expect(result.status).toBe(502);
		expect(result.data?.message).toBe('Stripe is not configured on this server yet.');
	});

	it('sends the admin to the login link Stripe makes', async () => {
		vi.mocked(readStripeAccountId).mockResolvedValue('acct_existing');

		const redirected = await catchRedirect(() => actions.openStripeDashboard(makeActionEvent()));

		expect(verifyConnectAccountBelongsTo).toHaveBeenCalledWith(
			STRIPE_API,
			'acct_existing',
			ORGANIZATION.id
		);
		expect(createDashboardLoginLink).toHaveBeenCalledWith(STRIPE_API, 'acct_existing');
		expect(redirected.status).toBe(303);
		expect(redirected.location).toBe('https://connect.stripe.test/dashboard');
	});

	// The dashboard shows an account's balance, payouts and bank details, which
	// is exactly what the attack in the security review (C5) was after.
	it('refuses a login link for an account that is not this organisation’s', async () => {
		vi.mocked(readStripeAccountId).mockResolvedValue('acct_somebody_elses');
		vi.mocked(verifyConnectAccountBelongsTo).mockResolvedValue(false);

		const result = (await actions.openStripeDashboard(makeActionEvent())) as ActionResult;

		expect(createDashboardLoginLink).not.toHaveBeenCalled();
		expect(result.status).toBe(400);
		expect(result.data?.message).toBe(
			'The Stripe account on record was not opened for this organisation. Contact support.'
		);
	});

	it('says Stripe could not be reached when the account cannot be checked', async () => {
		vi.mocked(readStripeAccountId).mockResolvedValue('acct_existing');
		vi.mocked(verifyConnectAccountBelongsTo).mockRejectedValue(new Error('network'));

		const result = (await actions.openStripeDashboard(makeActionEvent())) as ActionResult;

		expect(createDashboardLoginLink).not.toHaveBeenCalled();
		expect(result.status).toBe(502);
		expect(result.data?.message).toBe('Stripe could not be reached. Please try again in a minute.');
	});

	it('refuses while the organisation has no account to open', async () => {
		const result = (await actions.openStripeDashboard(makeActionEvent())) as ActionResult;

		expect(createDashboardLoginLink).not.toHaveBeenCalled();
		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('Connect Stripe first.');
	});

	it('says Stripe could not be reached when the login link throws', async () => {
		vi.mocked(readStripeAccountId).mockResolvedValue('acct_existing');
		vi.mocked(createDashboardLoginLink).mockRejectedValue(new Error('network'));

		const result = (await actions.openStripeDashboard(makeActionEvent())) as ActionResult;

		expect(result.status).toBe(502);
		expect(result.data?.message).toBe('Stripe could not be reached. Please try again in a minute.');
	});
});

describe('the deleteOrganization action', () => {
	/** The same admin, but an owner, which is the only role this action allows. */
	function signInAsOwner() {
		vi.mocked(requireOrganizationAdmin).mockResolvedValue({
			user: SIGNED_IN_USER,
			organization: ORGANIZATION,
			myRole: 'owner'
		});
	}

	it('refuses an admin who is not an owner', async () => {
		const result = (await actions.deleteOrganization(makeActionEvent())) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('Only an owner can delete the organisation.');
		expect(deleteOrganization).not.toHaveBeenCalled();
	});

	it('refuses while the organisation still runs conferences', async () => {
		signInAsOwner();
		vi.mocked(countOrganizationConferences).mockResolvedValue(2);

		const result = (await actions.deleteOrganization(makeActionEvent())) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('Delete or move its conferences first.');
		expect(deleteOrganization).not.toHaveBeenCalled();
	});

	it('deletes it and sends the owner to the organiser area', async () => {
		signInAsOwner();

		const redirected = await catchRedirect(() => actions.deleteOrganization(makeActionEvent()));

		expect(deleteOrganization).toHaveBeenCalledWith(SUPABASE, ORGANIZATION.id);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Riverside MUN Society was deleted.'
		});
		expect(redirected.location).toBe('/manage');
	});

	it('says so when nothing was deleted', async () => {
		signInAsOwner();
		vi.mocked(deleteOrganization).mockResolvedValue(false);

		const result = (await actions.deleteOrganization(makeActionEvent())) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('The organisation could not be deleted.');
	});
});
