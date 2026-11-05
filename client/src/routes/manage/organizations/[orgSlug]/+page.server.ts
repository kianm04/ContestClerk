import { fail, redirect } from '@sveltejs/kit';
import {
	EMPTY_INVITE_MEMBER,
	hasInviteMemberErrors,
	hasOrganizationDetailsErrors,
	isOrganizationAdmin,
	readInviteMember,
	readOrganizationDetails,
	validateInviteMember,
	validateOrganizationDetails,
	validateOrganizationLogo,
	type InviteMemberErrors,
	type InviteMemberValues,
	type OrganizationDetailsErrors,
	type OrganizationDetailsValues,
	type OrganizationRole
} from '$lib/organizations';
import {
	inviteUrl,
	manageUrl,
	organizationSettingsUrl,
	stripeConnectRefreshUrl,
	stripeConnectReturnUrl
} from '$lib/urls';
import { requireOrganizationAdmin, requireOrganizationMember } from '$lib/server/access';
import { setFlash } from '$lib/server/flash';
/*
	`revokeInvite` comes in under another name because this page has an action
	called `revokeInvite` as well. The action names come from
	`05-pages/organiser/organization-settings.md` and the function names from
	`$lib/server`. JavaScript would keep them apart on its own — a key in the
	`actions` object is not a variable — but a reader looking at
	`revokeInvite(...)` inside an action called `revokeInvite` should not have to
	work that out. `manage/[slug]/team` renames two of its own for the same
	reason, and `deleteOrganization` and `removeMember` below are renamed too.
*/
import {
	createOrganizationInvite,
	findPendingOrganizationInvite,
	listPendingOrganizationInvites,
	revokeInvite as deleteInvite
} from '$lib/server/invites';
import {
	countOrganizationConferences,
	deleteOrganization as deleteOrganizationRow,
	isEmailInOrganization,
	listOrganizationMembers,
	removeMember as removeMemberRow,
	readStripeAccountId,
	setStripeAccount,
	updateMemberRole,
	updateOrganization,
	uploadOrganizationLogo
} from '$lib/server/organizations';
import {
	createAccountLink,
	createConnectAccount,
	createDashboardLoginLink,
	isStripeConfigured,
	stripeConnectApi,
	verifyConnectAccountBelongsTo
} from '$lib/server/stripe';
import type { Actions, PageServerLoad } from './$types';

/** What the invitation form says when nothing was written and nobody can fix it. */
const INVITE_FAILED_MESSAGE = 'The invitation could not be created. Please try again.';

/** What every action says when the form named nobody this organisation has. */
const NO_SUCH_MEMBER_MESSAGE = 'That person is not a member of this organisation.';

/** What both Stripe actions say when Stripe itself did not answer. */
const STRIPE_UNREACHABLE_MESSAGE = 'Stripe could not be reached. Please try again in a minute.';

/** What they say instead when this server has no Stripe secret key at all. */
const STRIPE_NOT_CONFIGURED_MESSAGE = 'Stripe is not configured on this server yet.';

/**
 * What they say when the stored account was not opened for this organisation.
 *
 * The database refuses storing a foreign id (security review 2026-10-10, C5),
 * so this is reached only by a row written some other way, and nothing on the
 * page can mend it: the account id has to be looked at by a person.
 */
const STRIPE_FOREIGN_ACCOUNT_MESSAGE =
	'The Stripe account on record was not opened for this organisation. Contact support.';

/** What only an owner may do, and the sentence an admin who tries it is given. */
const OWNER_ONLY_ROLE_MESSAGE = 'Only an owner can change who owns the organisation.';

/** The same rule for removing somebody: an admin may not take an owner out. */
const OWNER_ONLY_REMOVE_MESSAGE = 'Only an owner can remove another owner.';

/*
	The three refusals about roles below answer 400 and not 403.
	`02-architecture/permissions.md` says "never a 403" so that a page cannot be
	used to find out what exists, and although the reader here is already a
	member and is discovering nothing, 403 appears nowhere else in the app and
	one page inventing its own status for a refused form would be the odd one
	out. The team page refuses its own "ask another organiser to change your
	role" with 400 for the same reason.
*/

/**
 * "an owner", "an admin", "a member": the words the flash uses after a role has
 * been changed. Written out rather than glued together from the role itself,
 * because "a admin" is not English. `ROLE_PHRASES` on the team page does the
 * same for its own three roles.
 */
const ROLE_PHRASES: Record<OrganizationRole, string> = {
	owner: 'an owner',
	admin: 'an admin',
	member: 'a member'
};

/**
 * What every action on this page answers with, whether it worked or not.
 *
 * One shape for all eight, so `+page.svelte` has a single thing to read rather
 * than a different answer per button. `TeamActionResult` on the team page is
 * the same idea for the same reason.
 */
type OrganizationActionResult = {
	/**
	 * What was typed into the details form, so a refused save keeps it, or
	 * `null` when the last action had nothing to do with that form. The page
	 * falls back to the saved organisation when it is `null`; an empty form
	 * would wipe the name off the screen instead.
	 */
	detailsValues: OrganizationDetailsValues | null;
	/** What is wrong with each field of that form. */
	detailsErrors: OrganizationDetailsErrors;
	/** What was typed into the invitation form, so a refused invitation keeps it. */
	inviteValues: InviteMemberValues;
	/** What is wrong with each field of that form. */
	inviteErrors: InviteMemberErrors;
	/** A problem with the invitation as a whole rather than with one of its fields. */
	inviteMessage: string | null;
	/** A problem with the page as a whole, shown at the top. */
	message: string | null;
	/** The invitation just made, and the link to send by hand. */
	createdInvite: { email: string; link: string } | null;
};

/** That answer with nothing in it, which every action below starts from. */
function blankResult(): OrganizationActionResult {
	return {
		detailsValues: null,
		detailsErrors: {},
		inviteValues: EMPTY_INVITE_MEMBER,
		inviteErrors: {},
		inviteMessage: null,
		message: null,
		createdInvite: null
	};
}

/**
 * Refuse with one sentence about the page as a whole, leaving both forms alone.
 *
 * `fail` sends the page back with that status and this result as `form`, which
 * the page shows in an error notice above everything else.
 */
function refuse(status: number, message: string) {
	return fail(status, { ...blankResult(), message } satisfies OrganizationActionResult);
}

/** Refuse the invitation form, keeping what was typed and saying what is wrong with it. */
function refuseInvite(inviteValues: InviteMemberValues, inviteErrors: InviteMemberErrors) {
	return fail(400, {
		...blankResult(),
		inviteValues,
		inviteErrors
	} satisfies OrganizationActionResult);
}

/**
 * The whole address of an invitation, not just its path.
 *
 * `inviteUrl` gives `/invites/<token>`, which is what every link inside the app
 * wants. This one is going into somebody's email instead — email delivery is
 * Phase 2, so the admin sends it by hand — and a path on its own is no use
 * there. `url.origin` is this site, so it is right in development and in
 * production without anybody editing it.
 */
function inviteLink(origin: string, token: string): string {
	return `${origin}${inviteUrl(token)}`;
}

/** Read one text field from a submitted form, without surrounding spaces. */
function readText(formData: FormData, fieldName: string): string {
	return String(formData.get(fieldName) ?? '').trim();
}

/**
 * Is this one of the three `organization_role` values?
 *
 * Anybody can post anything to a form action, so the word it sends is checked
 * before it is used. It is written out rather than looked up in a list so that
 * TypeScript can narrow the text to an `OrganizationRole`, which
 * `updateMemberRole` asks for.
 */
function isOrganizationRole(text: string): text is OrganizationRole {
	return text === 'owner' || text === 'admin' || text === 'member';
}

/**
 * The logo chosen in the file box, or `null` when none was.
 *
 * A file box nobody chose a file in still posts a `File`: one with no name, no
 * type and a size of 0. A file of no size is therefore what "nothing was
 * chosen" looks like on the server, and it is skipped rather than refused.
 * Anything that is not a `File` at all can only come from a request somebody
 * put together by hand, because this page's own form always sends the field as
 * a file, so it is skipped the same way. `manage/[slug]/details` reads its two
 * pictures like this.
 */
function readChosenLogo(formData: FormData): File | null {
	const chosen = formData.get('logo');

	if (!(chosen instanceof File) || chosen.size === 0) {
		return null;
	}

	return chosen;
}

/**
 * Everything the settings page draws.
 *
 * `requireOrganizationMember` and not `requireOrganizationAdmin`:
 * `organization-settings.md` lets a plain member read this page, and the eight
 * actions below are what keep them out of its forms. Somebody who is not a
 * member at all gets a 404 from inside that check, so nothing here has to think
 * about them.
 *
 * Files under `$lib/server` only ever run on the server, so none of the queries
 * below can reach the browser.
 */
export const load: PageServerLoad = async ({ params, url, locals }) => {
	const { user, organization, myRole } = await requireOrganizationMember(
		locals,
		url,
		params.orgSlug
	);

	/*
		None of the three answers needs another, so they go out together rather
		than one waiting for the one before it. The invitations are only asked
		for on behalf of an admin: the `invites` select policy hands a plain
		member nothing, so asking would be a round trip to be told "no rows".
	*/
	const [members, conferenceCount, pendingInvites] = await Promise.all([
		listOrganizationMembers(locals.supabase, organization.id, user.id),
		countOrganizationConferences(locals.supabase, organization.id),
		isOrganizationAdmin(myRole)
			? listPendingOrganizationInvites(locals.supabase, organization.id)
			: Promise.resolve([])
	]);

	/*
		The moment is read once here and handed down, rather than each component
		asking the clock for itself. A component that called `new Date()` would
		write one thing while the page is being rendered on the server and
		another a moment later in the browser, and Svelte reports that as a
		hydration mismatch. The team page passes `now` down for the same reason.

		`origin` is this site, such as `https://munmeet.app`. The invitation
		links an admin copies are whole addresses rather than paths, because they
		are going into somebody else's inbox.
	*/
	return {
		organization,
		myRole,
		members,
		pendingInvites,
		conferenceCount,
		now: new Date().toISOString(),
		origin: url.origin,
		isStripeConfigured: isStripeConfigured()
	};
};

export const actions: Actions = {
	/**
	 * Save the organisation's public details, and upload a logo if one was
	 * chosen.
	 */
	updateDetails: async ({ params, url, request, cookies, locals }) => {
		// A form action is its own request, and nothing `load` worked out reaches
		// it, so the admin check is made here rather than trusted from whenever
		// the page was last drawn. `02-architecture/permissions.md` asks every
		// action for this, and so does every action below.
		const { organization } = await requireOrganizationAdmin(locals, url, params.orgSlug);

		const formData = await request.formData();
		const values = readOrganizationDetails(formData);
		const errors = validateOrganizationDetails(values);
		const chosenLogo = readChosenLogo(formData);

		// The file is only looked at when one was really chosen: leaving the box
		// empty means "keep the logo you have", not "this file is wrong".
		if (chosenLogo) {
			const logoProblem = validateOrganizationLogo(chosenLogo);

			if (logoProblem) {
				errors.logo = logoProblem;
			}
		}

		if (hasOrganizationDetailsErrors(errors)) {
			/*
				400, because what arrived is wrong and only the person who sent it
				can put it right. `fail` sends the page back with that status and
				this result as `form`, so every field keeps what was typed and
				shows its own message at once.
			*/
			return fail(400, {
				...blankResult(),
				detailsValues: values,
				detailsErrors: errors
			} satisfies OrganizationActionResult);
		}

		await updateOrganization(locals.supabase, organization.id, values);

		/*
			The row first and the picture second, so that by the time an upload can
			fail the text has already been saved. A 500 rather than the 400 above,
			because every value was fine and Storage is ours: there is nothing here
			for the admin to fix. `manage/[slug]/details` saves its pictures in the
			same order for the same reason.
		*/
		if (chosenLogo) {
			try {
				await uploadOrganizationLogo(locals.supabase, organization.id, chosenLogo);
			} catch {
				return fail(500, {
					...blankResult(),
					detailsValues: values,
					detailsErrors: { logo: 'The logo could not be saved.' }
				} satisfies OrganizationActionResult);
			}
		}

		// A redirecting action cannot return anything, so the message travels in a
		// one-shot cookie that the root layout reads and throws away.
		setFlash(cookies, { tone: 'success', message: 'Organisation details saved.' });
		redirect(303, organizationSettingsUrl(params.orgSlug));
	},

	/**
	 * Invite somebody into the organisation by email.
	 *
	 * This is the one action that stays on the page instead of redirecting,
	 * because it has something to hand back: the link. Email delivery is Phase 2,
	 * so until then the admin copies the link and sends it themselves. A
	 * non-redirecting action re-runs `load`, so the pending list refreshes by
	 * itself.
	 */
	invite: async ({ params, url, request, cookies, locals }) => {
		const { user, organization } = await requireOrganizationAdmin(locals, url, params.orgSlug);

		const formData = await request.formData();
		const values = readInviteMember(formData);
		const errors = validateInviteMember(values);

		if (hasInviteMemberErrors(errors)) {
			return refuseInvite(values, errors);
		}

		// `validateInviteMember` has already refused anything that is not a role.
		// Asking a second time is what lets TypeScript narrow the text to an
		// `OrganizationRole`, which `createOrganizationInvite` asks for.
		if (!isOrganizationRole(values.role)) {
			return refuseInvite(values, { role: 'Please pick a role.' });
		}

		const isAlreadyMember = await isEmailInOrganization(
			locals.supabase,
			organization.id,
			values.email
		);

		if (isAlreadyMember) {
			return refuseInvite(values, { email: 'That person is already a member.' });
		}

		const pending = await findPendingOrganizationInvite(
			locals.supabase,
			organization.id,
			values.email
		);

		if (pending) {
			return refuseInvite(values, {
				email: 'There is already a pending invitation for that address.'
			});
		}

		const token = await createOrganizationInvite(locals.supabase, {
			organizationId: organization.id,
			email: values.email,
			role: values.role,
			invitedBy: user.id
		});

		// Nothing was written and the admin can do nothing about it, so this is a
		// 500 with the same sentence the rest of the app uses for our own
		// failures. What was typed comes back with it, so nobody types it twice.
		if (!token) {
			return fail(500, {
				...blankResult(),
				inviteValues: values,
				inviteMessage: INVITE_FAILED_MESSAGE
			} satisfies OrganizationActionResult);
		}

		/*
			A flash as well as the link, because `organization-settings.md` asks for
			both: the toast says the invitation exists, and the notice under it
			holds the address to send. Setting a flash without redirecting works
			because a cookie set during an action is already there when `load` runs
			again a moment later, and the root layout reads it and throws it away.
		*/
		setFlash(cookies, {
			tone: 'success',
			message: `Invitation created. Share the link with ${values.email}.`
		});

		return {
			...blankResult(),
			createdInvite: { email: values.email, link: inviteLink(url.origin, token) }
		} satisfies OrganizationActionResult;
	},

	/** Take back an invitation that has not been accepted. */
	revokeInvite: async ({ params, url, request, cookies, locals }) => {
		await requireOrganizationAdmin(locals, url, params.orgSlug);

		const formData = await request.formData();
		const inviteId = readText(formData, 'inviteId');

		if (inviteId === '') {
			return refuse(400, 'That request did not say which invitation to revoke.');
		}

		// Only the id is checked here. That an invitation belongs to an
		// organisation this admin may manage is the `invites` delete policy's
		// rule, and `02-architecture/permissions.md` keeps such rules in the
		// database so that a page which forgets one still cannot reach another
		// organisation's rows.
		const isRevoked = await deleteInvite(locals.supabase, inviteId);

		// Nothing was deleted. The delete policy hides another organisation's
		// invitations from this admin, so a refused delete comes back as no rows
		// rather than as an error, and saying "Invitation revoked." over it would
		// be a page claiming something that did not happen.
		if (!isRevoked) {
			return refuse(400, 'That invitation is no longer there.');
		}

		setFlash(cookies, { tone: 'success', message: 'Invitation revoked.' });
		redirect(303, organizationSettingsUrl(params.orgSlug));
	},

	/** Make a member an owner, an admin or a plain member. */
	changeRole: async ({ params, url, request, cookies, locals }) => {
		const { user, organization, myRole } = await requireOrganizationAdmin(
			locals,
			url,
			params.orgSlug
		);

		const formData = await request.formData();
		const userId = readText(formData, 'userId');
		const role = readText(formData, 'role');

		if (!isOrganizationRole(role)) {
			return refuse(400, 'Please pick a role.');
		}

		const members = await listOrganizationMembers(locals.supabase, organization.id, user.id);
		const member = members.find((one) => one.userId === userId);

		if (!member) {
			return refuse(400, NO_SUCH_MEMBER_MESSAGE);
		}

		/*
			`organization-settings.md`: only an owner may grant or remove `owner`.
			Both sides are asked about, because taking ownership away from somebody
			is as much a change of who owns the organisation as handing it over:
			an admin may neither promote a member to owner nor demote the owner
			above them.
		*/
		const touchesOwnership = member.role === 'owner' || role === 'owner';

		if (touchesOwnership && myRole !== 'owner') {
			return refuse(400, OWNER_ONLY_ROLE_MESSAGE);
		}

		// The `prevent_last_owner_removal` trigger refuses the last owner being
		// demoted. `updateMemberRole` turns that into a sentence worth reading,
		// and answers `null` when the change went through.
		const refusal = await updateMemberRole(locals.supabase, organization.id, userId, role);

		if (refusal) {
			return refuse(400, refusal);
		}

		setFlash(cookies, {
			tone: 'success',
			message: `${member.fullName} is now ${ROLE_PHRASES[role]}.`
		});
		redirect(303, organizationSettingsUrl(params.orgSlug));
	},

	/**
	 * Take somebody out of the organisation.
	 *
	 * An admin may do this to themselves, which is what the "Leave organisation"
	 * button on their own row posts to. The database still refuses the last
	 * owner, whoever pressed the button.
	 */
	removeMember: async ({ params, url, request, cookies, locals }) => {
		/*
			The one action that does not ask for an admin. The page file says both
			"every action starts with `requireOrganizationAdmin`" and "a member may
			remove themselves", which cannot both be true, and
			`02-architecture/permissions.md` settles it: the `organization_members`
			delete rule is "org admin, or self (leave)", so a plain member leaving
			is a thing the database allows and the page should offer. Taking
			*somebody else* out is still admin-only, and the check below is what
			says so.
		*/
		const { user, organization, myRole } = await requireOrganizationMember(
			locals,
			url,
			params.orgSlug
		);

		const formData = await request.formData();
		const userId = readText(formData, 'userId');

		if (!isOrganizationAdmin(myRole) && userId !== user.id) {
			return refuse(400, 'Only an owner or an admin can remove somebody else.');
		}

		const members = await listOrganizationMembers(locals.supabase, organization.id, user.id);
		const member = members.find((one) => one.userId === userId);

		if (!member) {
			return refuse(400, NO_SUCH_MEMBER_MESSAGE);
		}

		// Taking an owner out is as much a change of who owns the organisation
		// as demoting them, so `changeRole`'s owner-only rule holds here too.
		// The database's delete policy refuses it as well (migration
		// 20261022120000); this check is what gives the admin a sentence rather
		// than "That person is not a member".
		if (member.role === 'owner' && myRole !== 'owner') {
			return refuse(400, OWNER_ONLY_REMOVE_MESSAGE);
		}

		const refusal = await removeMemberRow(locals.supabase, organization.id, userId);

		if (refusal) {
			return refuse(400, refusal);
		}

		// Somebody who has just left is no longer a member, so `load` would answer
		// this page with the 404 a stranger gets. They are sent to the organiser
		// area instead, which they can still read.
		if (member.isMe) {
			setFlash(cookies, { tone: 'success', message: `You left ${organization.name}.` });
			redirect(303, manageUrl());
		}

		setFlash(cookies, {
			tone: 'success',
			message: `${member.fullName} was removed from ${organization.name}.`
		});
		redirect(303, organizationSettingsUrl(params.orgSlug));
	},

	/**
	 * Send the admin to Stripe's own onboarding form, opening the organisation's
	 * Express account first if it has none.
	 *
	 * `02-architecture/payments.md` has the whole flow. The account link is
	 * single use and short lived, which is why one is made here on every press
	 * rather than stored.
	 */
	connectStripe: async ({ params, url, locals }) => {
		const { user, organization } = await requireOrganizationAdmin(locals, url, params.orgSlug);

		const api = stripeConnectApi();

		// No secret key on this server, which is every machine the app is
		// developed on. The page already says so and draws no button, so this is
		// only reached by a post put together by hand.
		if (!api) {
			return refuse(502, STRIPE_NOT_CONFIGURED_MESSAGE);
		}

		/*
			The account id is read here rather than taken off `organization`,
			because `OrganizationSettings` goes to the browser as `load` data and
			says only *whether* there is an account, through `stripeState`. Which
			account it is has no business in a page, and both Stripe calls run on
			the server anyway.
		*/
		const existingAccountId = await readStripeAccountId(locals.supabase, organization.id);

		let link: string;

		try {
			let accountId = existingAccountId;

			if (accountId) {
				// A stored id is never acted on until the account itself says it
				// was opened for this organisation. Opening onboarding for somebody
				// else's account would hand this admin that organisation's form.
				if (!(await verifyConnectAccountBelongsTo(api, accountId, organization.id))) {
					return refuse(400, STRIPE_FOREIGN_ACCOUNT_MESSAGE);
				}
			} else {
				accountId = await createConnectAccount(api, {
					organizationId: organization.id,
					countryCode: organization.countryCode,
					email: user.email
				});

				// Written down before the browser leaves for Stripe, so that an
				// admin who abandons the form and comes back finds the same
				// account rather than being given a second one.
				await setStripeAccount(locals.supabase, organization.id, accountId);
			}

			link = await createAccountLink(
				api,
				accountId,
				`${url.origin}${stripeConnectReturnUrl(params.orgSlug)}`,
				`${url.origin}${stripeConnectRefreshUrl(params.orgSlug)}`
			);
		} catch {
			return refuse(502, STRIPE_UNREACHABLE_MESSAGE);
		}

		// `redirect` works by throwing, so it sits outside the `try` above. Inside
		// it, the `catch` would swallow the redirect and report a Stripe failure
		// that never happened.
		redirect(303, link);
	},

	/** Send the admin to their own Stripe Express dashboard, where the payouts are. */
	openStripeDashboard: async ({ params, url, locals }) => {
		const { organization } = await requireOrganizationAdmin(locals, url, params.orgSlug);

		const api = stripeConnectApi();

		if (!api) {
			return refuse(502, STRIPE_NOT_CONFIGURED_MESSAGE);
		}

		// The dashboard belongs to an account that already exists, so there is
		// nothing to create here. With no account there is nothing to open, and
		// the page offers this button only once there is one, so this is reached
		// by a post put together by hand.
		const accountId = await readStripeAccountId(locals.supabase, organization.id);

		if (!accountId) {
			return refuse(400, 'Connect Stripe first.');
		}

		let link: string;

		try {
			// The dashboard shows an account's balance, payouts and bank details,
			// so the account has to be the one Stripe opened for this organisation
			// before a login link is made for it.
			if (!(await verifyConnectAccountBelongsTo(api, accountId, organization.id))) {
				return refuse(400, STRIPE_FOREIGN_ACCOUNT_MESSAGE);
			}

			link = await createDashboardLoginLink(api, accountId);
		} catch {
			return refuse(502, STRIPE_UNREACHABLE_MESSAGE);
		}

		// Outside the `try` for the reason `connectStripe` gives above.
		redirect(303, link);
	},

	/** Delete the organisation for good, which only an owner may do. */
	deleteOrganization: async ({ params, url, cookies, locals }) => {
		const { organization, myRole } = await requireOrganizationAdmin(locals, url, params.orgSlug);

		if (myRole !== 'owner') {
			return refuse(400, 'Only an owner can delete the organisation.');
		}

		// Counted again rather than believed from the page: this is its own
		// request, and the first conference may have been created since the page
		// was drawn.
		const conferenceCount = await countOrganizationConferences(locals.supabase, organization.id);

		if (conferenceCount > 0) {
			return refuse(400, 'Delete or move its conferences first.');
		}

		const isDeleted = await deleteOrganizationRow(locals.supabase, organization.id);

		if (!isDeleted) {
			return refuse(400, 'The organisation could not be deleted.');
		}

		// The organisation is gone, so this page is gone with it.
		setFlash(cookies, { tone: 'success', message: `${organization.name} was deleted.` });
		redirect(303, manageUrl());
	}
};
