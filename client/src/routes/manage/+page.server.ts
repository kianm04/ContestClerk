import { fail, redirect } from '@sveltejs/kit';
import { inviteRoleLabel } from '$lib/manage';
import { readManageListView } from '$lib/manage-list';
import { manageUrl } from '$lib/urls';
import { requireOnboarded, requirePermission } from '$lib/server/access';
import { deleteConference, wasEverPublished } from '$lib/server/conferences';
import { setFlash } from '$lib/server/flash';
import { acceptInviteById, listMyInvites } from '$lib/server/invites';
import { loadManageIndex } from '$lib/server/manage';
import type { Actions, PageServerLoad } from './$types';

/**
 * The one thing the page says when an invitation cannot be accepted.
 *
 * A wrong id, an expired invitation, one already used and one addressed to
 * somebody else are all refused with these same words. Telling them apart would
 * tell a stranger which invitations exist, and there is nothing different for
 * the reader to do about any of them.
 */
const INVALID_INVITE_TEXT =
	'This invitation is no longer valid. Ask the person who invited you for a new one.';

/**
 * Runs on the server before the page is rendered, and again after each action
 * below. Whatever it returns arrives in `+page.svelte` as `data`.
 *
 * `requireOnboarded` is `requireUser` plus the onboarding gate. `/manage` is an
 * ordinary signed-in page, so it uses that one: a brand-new account is sent to
 * `/welcome` first and comes back here once it is filled in.
 *
 * Files under `$lib/server` only ever run on the server, so none of the queries
 * `loadManageIndex` makes can reach the browser.
 *
 * `view` is which list the address asks for: what is coming up, or with
 * `?show=past` what has ended. Changing it is a plain link, so `load` runs
 * again and the back button and a shared link show the same list. `now` is
 * the moment the page was drawn, sent as text, so the browser works out every
 * phase from the same moment as the server did.
 */
export const load: PageServerLoad = async ({ url, locals }) => {
	const user = await requireOnboarded(locals, url);
	const now = new Date();
	const index = await loadManageIndex(locals.supabase, user.id, now);

	return { ...index, view: readManageListView(url), now: now.toISOString() };
};

export const actions: Actions = {
	/** Accept one of the invitations waiting for the reader. */
	acceptInvite: async ({ request, cookies, url, locals }) => {
		// A form action is its own request, so the gate is asked again rather
		// than trusted from whenever `load` last ran.
		await requireOnboarded(locals, url);

		const formData = await request.formData();
		const inviteId = String(formData.get('id') ?? '');

		// The invitation is looked up before it is accepted because the message
		// below names the organisation or conference and the role, and the
		// database's `accept_invite_by_id` answers only with a path.
		//
		// `listMyInvites` returns only invitations addressed to this reader that
		// are still open, so an id that is not among them is refused. The row is
		// found by its id rather than by the link's token, which this page never
		// sees (security review H1): the database checks that the reader is the
		// person invited, so the id need not be a secret.
		const myInvites = await listMyInvites(locals.supabase);
		const invite = myInvites.find((candidate) => candidate.id === inviteId);

		if (!invite) {
			// `fail` sends the page back with a 400 status and this result as
			// `form`, which the page shows as an error notice.
			return fail(400, { message: INVALID_INVITE_TEXT });
		}

		// The database call from `$lib/server/invites`, which runs the same
		// checks and writes as accepting from the invitation link does.
		const isAccepted = await acceptInviteById(locals.supabase, inviteId);

		if (!isAccepted) {
			return fail(400, { message: INVALID_INVITE_TEXT });
		}

		// A redirecting action cannot return anything, so the message travels in
		// a one-shot cookie that the root layout reads and throws away.
		setFlash(cookies, {
			tone: 'success',
			message: `You joined ${invite.name} as ${inviteRoleLabel(invite)}.`
		});
		redirect(303, manageUrl());
	},

	/**
	 * Throw away a draft from its row, without opening it first.
	 *
	 * The Publish page's "Delete draft" does the same from inside the draft.
	 * The row's dialog is the confirmation here, so there is no word to type.
	 */
	deleteDraft: async ({ request, cookies, url, locals }) => {
		const formData = await request.formData();
		const slug = String(formData.get('slug') ?? '');

		// The row sends only the slug, so who runs the conference is asked here.
		// Somebody who does not run it gets a 404, the same as a slug nobody has.
		const { conference } = await requirePermission(locals, url, slug, 'edit_conference');

		// `ConfirmButton` always sends `confirm=1`, so only a hand-made request lacks it.
		if (formData.get('confirm') !== '1') {
			return fail(400, { message: 'Please confirm before deleting a conference.' });
		}

		// The database refuses anything but a draft too; checking first lets the
		// page say why rather than fail.
		if (conference.status !== 'draft') {
			return fail(400, { message: 'Only a draft can be deleted.' });
		}

		// A draft that was public once stays on record: people may have applied
		// to it or linked to it. The database refuses the delete as well.
		if (await wasEverPublished(locals.supabase, conference.id)) {
			return fail(400, {
				message:
					'A conference that has been public cannot be deleted. Publish it again and archive it after its last day.'
			});
		}

		await deleteConference(locals.supabase, conference.id);

		setFlash(cookies, { tone: 'success', message: `${conference.name} is deleted.` });
		redirect(303, manageUrl());
	}
};
