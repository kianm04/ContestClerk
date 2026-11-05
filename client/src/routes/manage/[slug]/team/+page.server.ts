import { fail, redirect } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Conference } from '$lib/conferences';
import { hasPermission } from '$lib/permissions';
import {
	EMPTY_INVITE_FORM,
	STAFF_TITLE_MAX_LENGTH,
	hasInviteErrors,
	holdsCommitteeRole,
	parseTeamFilter,
	readInviteForm,
	validateInviteForm,
	type InviteFormErrors,
	type InviteFormValues,
	type Team,
	type TeamPerson
} from '$lib/team';
import {
	giveableRoles,
	mayActOnPerson,
	mayChangeInvite,
	roleChoices,
	rolesAfterEdit
} from '$lib/team-access';
import { inviteUrl, manageTeamFilterUrl, manageTeamUrl } from '$lib/urls';
import { requireManagePage, requirePermissionAndRank } from '$lib/server/access';
import { setFlash } from '$lib/server/flash';
/*
	Two of the functions below are renamed as they come in, because this page has
	an action called `revokeInvite` and one called `removeStaff` as well. The
	action names come from `05-pages/organiser/team.md` and the function names
	from `$lib/server`. JavaScript would keep them apart on its own — a key in
	the `actions` object is not a variable — but a reader looking at
	`removeStaff(...)` inside an action called `removeStaff` should not have to
	work that out.
*/
import {
	createStaffInvite,
	findPendingInvite,
	isEmailOnTeam,
	revokeInvite as deleteInvite
} from '$lib/server/invites';
import {
	addCommitteeChair,
	loadTeam,
	removeCommitteeChair,
	removeStaff as deleteStaffRow,
	setMemberRoles,
	updateStaffTitle
} from '$lib/server/team';
import type { Actions, PageServerLoad } from './$types';

/** What the page says when an invitation could not be written. */
const INVITE_FAILED_MESSAGE = 'The invitation could not be created. Please try again.';

/** What every action says when the form named nobody this team has. */
const NO_SUCH_PERSON_MESSAGE = 'That person is not on the team.';

/**
 * What every action on a row says when the rank rule turns it down: the
 * person is the reader, from the organisation, or at or above the reader's
 * own role (`docs/roles-and-permissions.md`, rules 4 to 6). The page shows
 * no actions on those rows, so only a hand-made post meets this.
 */
const ABOVE_YOU_MESSAGE = 'You can only change people below your own role.';

/**
 * What every action on this page answers with, whether it worked or not.
 *
 * One shape for all eight, so `+page.svelte` has a single thing to read rather
 * than a different answer per button. The committee editor's
 * `CommitteeEditResult` is the same idea for the same reason.
 */
type TeamActionResult = {
	/** What was typed into the invitation form, so a refused invitation keeps it. */
	inviteValues: InviteFormValues;
	/** What is wrong with each field of that form. */
	inviteErrors: InviteFormErrors;
	/** A problem with the invitation as a whole rather than with one of its fields. */
	inviteMessage: string | null;
	/** A problem with one of the team rows, shown at the top of the page. */
	message: string | null;
	/** The invitation just made, and the link to send the person by hand. */
	createdInvite: { email: string; link: string } | null;
};

/** That answer with nothing in it, which every action below starts from. */
function blankResult(): TeamActionResult {
	return {
		inviteValues: EMPTY_INVITE_FORM,
		inviteErrors: {},
		inviteMessage: null,
		message: null,
		createdInvite: null
	};
}

/**
 * Refuse with one sentence about a team row, leaving the invitation form empty.
 *
 * `fail` sends the page back with that status and this result as `form`, which
 * the page shows in an error notice.
 */
function refuse(status: number, message: string) {
	return fail(status, { ...blankResult(), message } satisfies TeamActionResult);
}

/** Refuse the invitation form, keeping what was typed and saying what is wrong with it. */
function refuseInvite(inviteValues: InviteFormValues, inviteErrors: InviteFormErrors) {
	return fail(400, { ...blankResult(), inviteValues, inviteErrors } satisfies TeamActionResult);
}

/**
 * The whole address of an invitation, not just its path.
 *
 * `inviteUrl` gives `/invites/<token>`, which is what every link inside the app
 * wants. This one is going into somebody's email instead — email delivery is
 * Phase 2, so the organiser sends it by hand — and a path on its own is no use
 * there. `url.origin` is this site, so it is right in development and in
 * production without anybody editing it; `routes/register/+page.server.ts`
 * builds the confirmation link the same way.
 */
function inviteLink(origin: string, token: string): string {
	return `${origin}${inviteUrl(token)}`;
}

/** Read one text field from a submitted form, without surrounding spaces. */
function readText(formData: FormData, fieldName: string): string {
	return String(formData.get(fieldName) ?? '').trim();
}

/** Turn the empty text a form field holds into the `null` the database wants. */
function textOrNull(value: string): string | null {
	return value === '' ? null : value;
}

/**
 * The whole team of this conference, read the way an action has to read it:
 * an action is its own request and is handed nothing `load` worked out.
 */
async function readTeam(supabase: SupabaseClient, conference: Conference): Promise<Team> {
	return loadTeam(supabase, conference.id);
}

/** The person on this team with that user id, or `null` when nobody has it. */
function findPerson(team: Team, userId: string): TeamPerson | null {
	const person = team.people.find((member) => member.userId === userId);

	return person ?? null;
}

/**
 * The team page the reader came from, with the role filter they had open,
 * which a row's form sends back in a hidden `filter` field so that saving
 * does not lose their place.
 */
function teamPageAfter(slug: string, formData: FormData, team: Team) {
	const filter = parseTeamFilter(
		new URLSearchParams({ role: readText(formData, 'filter') }),
		team.roles
	);

	return manageTeamFilterUrl(slug, filter);
}

/**
 * Everybody on this conference's team, which role the list is filtered to,
 * and what the reader may do to whom.
 *
 * `parent()` is a promise for whatever the layouts' own `load` functions
 * returned: this conference, and from the root layout the signed-in reader's
 * `claims`. The layout let in anybody whose permissions open some page of
 * this conference and handed those permissions down; the first lines below
 * answer a 404 unless they open this one.
 *
 * Files under `$lib/server` only ever run on the server, so the queries below
 * cannot reach the browser.
 */
export const load: PageServerLoad = async ({ parent, url, locals }) => {
	const { conference, claims, permissions } = await parent();
	// A 404 unless the reader's permissions open this page, by the table in
	// `$lib/manage-pages.ts`.
	requireManagePage(permissions, 'team');

	const team = await loadTeam(locals.supabase, conference.id);
	// Whose row says "You", and whose row has no actions. `claims.sub` is the
	// signed-in account's id; the layout lets nobody signed out this far.
	const viewerUserId = claims ? String(claims.sub) : null;

	// The rows the reader may change: the rank rule, worked out once here so
	// that each row only has to look itself up.
	const actionableUserIds = team.people
		.filter((person) => mayActOnPerson(permissions, person, viewerUserId))
		.map((person) => person.userId);

	// The invitations the reader may send again or revoke, by the same rule.
	const changeableInviteIds = team.pendingInvites
		.filter((invite) => mayChangeInvite(permissions, invite, team.roles))
		.map((invite) => invite.id);

	// `?edit=<user id>` opens the "Edit roles" dialog over the list. An id
	// the reader may not act on opens nothing, as if it were not there.
	const editedUserId = url.searchParams.get('edit');
	const editedPerson = team.people.find(
		(person) => person.userId === editedUserId && actionableUserIds.includes(person.userId)
	);

	/*
		The moment is read once here and handed down, rather than each component
		asking the clock for itself. A component that called `new Date()` would
		write one thing while the page is being rendered on the server and another
		a moment later in the browser, and Svelte reports that as a hydration
		mismatch. `/notifications` passes `now` down for the same reason.
	*/
	return {
		team,
		filter: parseTeamFilter(url.searchParams, team.roles),
		now: new Date().toISOString(),
		// The pending list shows each invitation's whole address for the same
		// reason the notice above the form does; see `inviteLink`.
		origin: url.origin,
		viewerUserId,
		actionableUserIds,
		changeableInviteIds,
		// What the invite form's Role field offers.
		giveableRoles: giveableRoles(permissions, team.roles),
		// Whether the filter row links to the roles page.
		canManageRoles: hasPermission(permissions, 'manage_roles'),
		editRoles: editedPerson
			? { person: editedPerson, choices: roleChoices(permissions, team.roles) }
			: null
	};
};

export const actions: Actions = {
	/**
	 * Invite somebody by email.
	 *
	 * This is the one action that stays on the page instead of redirecting,
	 * because it has something to hand back: the link. Email delivery is Phase 2,
	 * so until then the organiser copies the link and sends it themselves. A
	 * non-redirecting action re-runs `load`, so the pending list below the form
	 * refreshes by itself.
	 */
	invite: async ({ params, url, request, locals }) => {
		// A form action is its own request, and nothing `load` worked out reaches
		// it, so `manage_team` is asked for here rather than trusted from
		// whenever the page was last drawn. Every action below asks too.
		const { user, conference, permissions } = await requirePermissionAndRank(
			locals,
			url,
			params.slug,
			'manage_team'
		);

		const team = await readTeam(locals.supabase, conference);
		const formData = await request.formData();
		const values = readInviteForm(formData);

		// The committee ids and the roles the reader may give are passed in, so
		// that the form refuses a committee of somebody else's conference and a
		// role at or above the reader's own.
		const committeeIds = team.committees.map((committee) => committee.id);
		const errors = validateInviteForm(values, committeeIds, giveableRoles(permissions, team.roles));

		if (hasInviteErrors(errors)) {
			return refuseInvite(values, errors);
		}

		const alreadyOnTeam = await isEmailOnTeam(locals.supabase, conference.id, values.email);

		if (alreadyOnTeam) {
			return refuseInvite(values, { email: 'That person is already on the team.' });
		}

		const pending = await findPendingInvite(locals.supabase, conference.id, values.email);

		if (pending) {
			return refuseInvite(values, {
				email: 'There is already a pending invitation for that address.'
			});
		}

		const token = await createStaffInvite(locals.supabase, {
			conferenceId: conference.id,
			email: values.email,
			roleId: values.roleId,
			committeeId: textOrNull(values.committeeId),
			title: textOrNull(values.title),
			invitedBy: user.id
		});

		// Nothing was written and the organiser can do nothing about it, so this
		// is a 500 with the same sentence the rest of the app uses for our own
		// failures. What was typed comes back with it, so nobody types it twice.
		if (!token) {
			return fail(500, {
				...blankResult(),
				inviteValues: values,
				inviteMessage: INVITE_FAILED_MESSAGE
			} satisfies TeamActionResult);
		}

		return {
			...blankResult(),
			createdInvite: { email: values.email, link: inviteLink(url.origin, token) }
		} satisfies TeamActionResult;
	},

	/** Take back an invitation that has not been accepted. */
	revokeInvite: async ({ params, url, request, cookies, locals }) => {
		await requirePermissionAndRank(locals, url, params.slug, 'manage_team');

		const formData = await request.formData();
		const inviteId = readText(formData, 'inviteId');

		if (inviteId === '') {
			return refuse(400, 'That request did not say which invitation to revoke.');
		}

		// Only the id is checked here. That an invitation belongs to a conference
		// this organiser may manage, and hands over a role below their own, is
		// the `invites` delete policy's rule (migration 20261023121000), and
		// `02-architecture/permissions.md` keeps such rules in the database so
		// that a page which forgets one still cannot reach another conference's
		// rows.
		const isRevoked = await deleteInvite(locals.supabase, inviteId);

		// Nothing was deleted. The `invites` delete policy hides another
		// conference's invitations from this organiser, and those to a role at or
		// above their own, which the page shows no button for, so a refused delete comes
		// back as no rows rather than as an error, and saying "Invitation revoked."
		// over it would be a page claiming something that did not happen.
		if (!isRevoked) {
			return refuse(400, 'That invitation is no longer there.');
		}

		// A redirecting action cannot return anything, so the message travels in a
		// one-shot cookie that the root layout reads and throws away.
		setFlash(cookies, { tone: 'success', message: 'Invitation revoked.' });
		redirect(303, manageTeamUrl(params.slug));
	},

	/**
	 * Write a fresh invitation for somebody whose first one ran out, and take the
	 * old one back.
	 *
	 * `team.md` asks an expired invitation for "Send again", which "creates a
	 * fresh token": the token is what the link is, so there is no way to extend
	 * one without writing a new row. The new one is written before the old one is
	 * removed, so a failure leaves the organiser with the invitation they had
	 * rather than with none at all.
	 */
	resendInvite: async ({ params, url, request, locals }) => {
		const { user, conference } = await requirePermissionAndRank(
			locals,
			url,
			params.slug,
			'manage_team'
		);

		const team = await readTeam(locals.supabase, conference);
		const formData = await request.formData();
		const inviteId = readText(formData, 'inviteId');
		const invite = team.pendingInvites.find((pending) => pending.id === inviteId);

		if (!invite) {
			return fail(400, {
				...blankResult(),
				inviteMessage: 'That invitation is no longer there.'
			} satisfies TeamActionResult);
		}

		// Everything the old invitation said is written again, including the
		// committee it named. The committee travels as its id and not as its
		// name, because only `(conference_id, slug)` is unique and two committees
		// of one conference may be called the same thing.
		const token = await createStaffInvite(locals.supabase, {
			conferenceId: conference.id,
			email: invite.email,
			roleId: invite.roleId,
			committeeId: invite.committeeId,
			title: invite.title,
			invitedBy: user.id
		});

		if (!token) {
			return fail(500, {
				...blankResult(),
				inviteMessage: INVITE_FAILED_MESSAGE
			} satisfies TeamActionResult);
		}

		await deleteInvite(locals.supabase, invite.id);

		return {
			...blankResult(),
			createdInvite: { email: invite.email, link: inviteLink(url.origin, token) }
		} satisfies TeamActionResult;
	},

	/**
	 * "Save roles" in the "Edit roles" dialog: give somebody exactly the roles
	 * ticked. Every box is a `roleId` field, and only the ticked ones are sent.
	 */
	setRoles: async ({ params, url, request, cookies, locals }) => {
		const { user, conference, permissions } = await requirePermissionAndRank(
			locals,
			url,
			params.slug,
			'manage_team'
		);

		const formData = await request.formData();
		const team = await readTeam(locals.supabase, conference);
		const person = findPerson(team, readText(formData, 'userId'));

		if (!person) {
			return refuse(400, NO_SUCH_PERSON_MESSAGE);
		}

		if (!mayActOnPerson(permissions, person, user.id)) {
			return refuse(403, ABOVE_YOU_MESSAGE);
		}

		// The roles the reader cannot change are kept as they were, since their
		// boxes are disabled and a disabled box sends nothing.
		const tickedRoleIds = formData.getAll('roleId').map(String);
		const roles = rolesAfterEdit(permissions, team.roles, person, tickedRoleIds);
		const isSaved = await setMemberRoles(
			locals.supabase,
			conference.id,
			person.userId,
			roles.map((role) => role.id)
		);

		// The database refuses the whole change when any role in it is at or
		// above the reader's own, which the page did not offer.
		if (!isSaved) {
			return refuse(403, 'You can only give and take roles below your own.');
		}

		setFlash(cookies, { tone: 'success', message: `Roles saved for ${person.fullName}.` });
		redirect(303, teamPageAfter(params.slug, formData, team));
	},

	/** Change the free text shown beside somebody's name, such as "Secretary General". */
	updateTitle: async ({ params, url, request, cookies, locals }) => {
		const { user, conference, permissions } = await requirePermissionAndRank(
			locals,
			url,
			params.slug,
			'manage_team'
		);

		const formData = await request.formData();
		const userId = readText(formData, 'userId');
		const title = readText(formData, 'title');

		if (userId === '') {
			return refuse(400, 'That request did not say whose title to change.');
		}

		const team = await readTeam(locals.supabase, conference);
		const person = findPerson(team, userId);

		if (!person) {
			return refuse(400, NO_SUCH_PERSON_MESSAGE);
		}

		if (!mayActOnPerson(permissions, person, user.id)) {
			return refuse(403, ABOVE_YOU_MESSAGE);
		}

		// The box has a `maxlength` of its own, which a browser enforces while
		// somebody types. This is the same rule asked again of what actually
		// arrived, because a post can be put together by hand.
		if (title.length > STAFF_TITLE_MAX_LENGTH) {
			return refuse(400, `A title can be at most ${STAFF_TITLE_MAX_LENGTH} characters.`);
		}

		// An empty box clears the title rather than saving an empty one, so the
		// quiet line under the name disappears instead of becoming blank.
		await updateStaffTitle(locals.supabase, conference.id, userId, textOrNull(title));

		setFlash(cookies, { tone: 'success', message: 'Title saved.' });
		redirect(303, teamPageAfter(params.slug, formData, team));
	},

	/** Put a chair in charge of one committee. */
	assignCommittee: async ({ params, url, request, cookies, locals }) => {
		const { user, conference, permissions } = await requirePermissionAndRank(
			locals,
			url,
			params.slug,
			'manage_team'
		);

		const formData = await request.formData();
		const userId = readText(formData, 'userId');
		const committeeId = readText(formData, 'committeeId');

		const team = await readTeam(locals.supabase, conference);
		const committee = team.committees.find((item) => item.id === committeeId);

		// `team.committees` holds this conference's committees and no others, so
		// looking the id up in it is what keeps a committee id typed into
		// somebody's address bar from reaching another conference.
		if (!committee) {
			return refuse(400, 'That committee is not part of this conference.');
		}

		const person = findPerson(team, userId);

		if (!person) {
			return refuse(400, NO_SUCH_PERSON_MESSAGE);
		}

		if (!mayActOnPerson(permissions, person, user.id)) {
			return refuse(403, ABOVE_YOU_MESSAGE);
		}

		// A committee is where a per-committee role, the way the Chair preset
		// works, applies. With no such role it would do nothing.
		if (!holdsCommitteeRole(person)) {
			return refuse(
				400,
				'Committees are for roles that work per committee. Give them one under Edit roles first.'
			);
		}

		// The database asks the rank rule again (security review L5), and its
		// answer may have changed since the check above, so a refusal is said
		// rather than reported as done. Somebody who chairs the committee already
		// is where this asked them to be, which is what the message says.
		const assignment = await addCommitteeChair(locals.supabase, committee.id, userId);

		if (assignment === 'refused') {
			return refuse(403, ABOVE_YOU_MESSAGE);
		}

		setFlash(cookies, {
			tone: 'success',
			message: `${person.fullName} now chairs ${committee.name}.`
		});
		redirect(303, teamPageAfter(params.slug, formData, team));
	},

	/**
	 * Take one committee off a chair.
	 *
	 * There is no role check here, unlike `assignCommittee` above: whatever
	 * roles the person holds now, taking a committee away from them is allowed.
	 */
	unassignCommittee: async ({ params, url, request, cookies, locals }) => {
		const { user, conference, permissions } = await requirePermissionAndRank(
			locals,
			url,
			params.slug,
			'manage_team'
		);

		const formData = await request.formData();
		const userId = readText(formData, 'userId');
		const committeeId = readText(formData, 'committeeId');

		const team = await readTeam(locals.supabase, conference);
		const committee = team.committees.find((item) => item.id === committeeId);

		if (!committee) {
			return refuse(400, 'That committee is not part of this conference.');
		}

		const person = findPerson(team, userId);

		if (!person) {
			return refuse(400, NO_SUCH_PERSON_MESSAGE);
		}

		if (!mayActOnPerson(permissions, person, user.id)) {
			return refuse(403, ABOVE_YOU_MESSAGE);
		}

		await removeCommitteeChair(locals.supabase, committee.id, userId);

		setFlash(cookies, {
			tone: 'success',
			message: `${person.fullName} no longer chairs ${committee.name}.`
		});
		redirect(303, teamPageAfter(params.slug, formData, team));
	},

	/** Take somebody off the conference's staff altogether. */
	removeStaff: async ({ params, url, request, cookies, locals }) => {
		const { user, conference, permissions } = await requirePermissionAndRank(
			locals,
			url,
			params.slug,
			'manage_team'
		);

		const formData = await request.formData();
		const userId = readText(formData, 'userId');

		if (userId === user.id) {
			return refuse(400, 'You cannot remove yourself from the team.');
		}

		const team = await readTeam(locals.supabase, conference);
		const person = findPerson(team, userId);

		if (!person) {
			return refuse(400, NO_SUCH_PERSON_MESSAGE);
		}

		// `team.md`: a member of the organisation running the conference is on this
		// list without a staff row, so there is nothing here to remove. They are
		// taken off the organisation's own page instead.
		if (person.source === 'organization') {
			return refuse(400, "Members of the organisation are managed on the organisation's own page.");
		}

		if (!mayActOnPerson(permissions, person, user.id)) {
			return refuse(403, ABOVE_YOU_MESSAGE);
		}

		await deleteStaffRow(locals.supabase, conference.id, userId);

		setFlash(cookies, {
			tone: 'success',
			message: `${person.fullName} was removed from the team.`
		});
		redirect(303, teamPageAfter(params.slug, formData, team));
	}
};
