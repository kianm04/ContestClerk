import { redirect } from '@sveltejs/kit';
import {
	ONLY_HEADS_MANAGE_MEMBERS,
	STEPPED_DOWN_FLASH,
	madeHeadFlash,
	memberActionRefusalSentence,
	memberRemovedFlash,
	type DelegationMember,
	type MemberActionRefusal
} from '$lib/delegations';
import { delegationMembersUrl, delegationUrl } from '$lib/urls';
import { requireDelegationHead, requireOnboarded } from '$lib/server/access';
import {
	listDelegationMembers,
	removeDelegationMember,
	setDelegationMemberRole
} from '$lib/server/delegations';
import { setFlash } from '$lib/server/flash';
// `./$types` holds the types SvelteKit generates for this one route, so
// `PageServerLoad`, `Actions` and `RequestEvent` already know that this address
// has a `delegationId` in it and what the layout above hands down.
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/**
 * What the refusals that never print a name are given instead of one.
 *
 * Three of the four sentences in `memberActionRefusalSentence` say nothing about
 * who was meant — "That person is not a member.", "A delegation needs at least
 * one head.", "You cannot remove yourself; step down or withdraw the
 * delegation." — so there is nothing for a name to do in them, and no reason to
 * ask the database who an id belongs to before saying one of them.
 */
const NOBODY_NAMED = '';

/**
 * The head posting one of the three actions, with the delegation.
 *
 * Every action asks again rather than trusting what `load` worked out: a form
 * action is its own request and is handed nothing `load` decided, which is what
 * `specs/02-architecture/permissions.md` asks of every action. A plain member
 * who posts a form anyway gets the 404 a stranger gets, never a 403. The seats
 * page next door has the same wrapper for the same reason.
 */
function requireHead(event: RequestEvent) {
	return requireDelegationHead(event.locals, event.url, event.params.delegationId);
}

/** The member with this id in the list just read, or `null` for anybody else. */
function findMember(members: DelegationMember[], userId: string): DelegationMember | null {
	const member = members.find((candidate) => candidate.userId === userId);

	if (!member) {
		return null;
	}

	return member;
}

/**
 * How most of the actions end: leave a one-shot message and come back to this
 * page.
 *
 * `redirect` works by throwing rather than by returning, so nothing after a call
 * to this ever runs; that is what `never` says.
 */
function finish(
	event: RequestEvent,
	delegationId: string,
	tone: 'success' | 'warning',
	message: string
): never {
	setFlash(event.cookies, { tone, message });
	redirect(303, delegationMembersUrl(delegationId));
}

/** Turn an action down, in the words `members.md` quotes for that refusal. */
function refuse(
	event: RequestEvent,
	delegationId: string,
	refusal: MemberActionRefusal,
	memberName: string
): never {
	finish(event, delegationId, 'warning', memberActionRefusalSentence(refusal, memberName));
}

/**
 * Everybody in the delegation, on top of what the layout above this page read.
 *
 * `parent()` is a promise for whatever the layout's own `load` returned, and
 * waiting for it is what makes the check above this page run first: the layout
 * calls `requireDelegationMember`, which sends a visitor to the sign in page and
 * throws a 404 at anybody who is not in this delegation. So the only person this
 * page still has to turn away is a member who is not a head, and they are sent
 * back to the dashboard with a message rather than shown a 404: they belong
 * here, they simply may not manage members. `requireDelegationHead` cannot do
 * that, because it answers a member with the same 404 a stranger gets, which is
 * right for the three actions below and wrong for opening the page.
 *
 * `requireOnboarded` is then asked only for the reader's own id, which the
 * layout does not hand down and which marks their own row "(you)".
 *
 * The delegation, the conference and the counts are not returned again:
 * SvelteKit merges the layout's data into the page's, so `data.delegation`,
 * `data.conference` and `data.memberCount` are already there.
 */
export const load: PageServerLoad = async ({ locals, url, cookies, parent }) => {
	const { delegation, myRole } = await parent();
	const user = await requireOnboarded(locals, url);

	if (myRole !== 'head') {
		setFlash(cookies, { tone: 'warning', message: ONLY_HEADS_MANAGE_MEMBERS });
		redirect(303, delegationUrl(delegation.id));
	}

	return {
		/** Everybody in the delegation, heads first and then in the order they joined. */
		members: await listDelegationMembers(locals.supabase, delegation.id),
		/** The reader's own id, so their own row says "you" and offers "Step down". */
		myUserId: user.id
	};
};

export const actions: Actions = {
	/**
	 * Make one member of this delegation a head as well.
	 *
	 * Every ending redirects and the message travels in a one-shot cookie that
	 * the root layout reads and throws away. A redirecting action cannot return
	 * anything, so there is no result type to declare.
	 */
	makeHead: async (event) => {
		const { delegation } = await requireHead(event);

		const formData = await event.request.formData();
		const userId = String(formData.get('userId') ?? '');

		if (userId === '') {
			refuse(event, delegation.id, 'not_a_member', NOBODY_NAMED);
		}

		// Read again rather than trusted from whenever the page was last drawn:
		// the person may have left the delegation since.
		const members = await listDelegationMembers(event.locals.supabase, delegation.id);
		const member = findMember(members, userId);

		// The button is only drawn beside somebody who is in the list, so anybody
		// else is a post that did not come from this page.
		if (!member) {
			refuse(event, delegation.id, 'not_a_member', NOBODY_NAMED);
		}

		const result = await setDelegationMemberRole(
			event.locals.supabase,
			delegation.id,
			userId,
			'head'
		);

		/* `setDelegationMemberRole` answers three things. 'not_a_member' means they
		   left between the read above and this write. 'last_head' cannot happen
		   while promoting somebody — the trigger raises it for the opposite change
		   — but answering it here rather than leaving the union open means a later
		   change to that function cannot pass through this action in silence. */
		if (result !== 'written') {
			refuse(event, delegation.id, 'not_a_member', member.fullName);
		}

		finish(event, delegation.id, 'success', madeHeadFlash(member.fullName));
	},

	/**
	 * Give up being a head of this delegation and stay in it as a member.
	 *
	 * The caller's own id is not in the form and the layout does not hand it to an
	 * action, so `requireOnboarded` is asked for it here.
	 */
	stepDown: async (event) => {
		const { delegation } = await requireHead(event);
		const user = await requireOnboarded(event.locals, event.url);

		const members = await listDelegationMembers(event.locals.supabase, delegation.id);
		const heads = members.filter((member) => member.role === 'head');

		// `requireHead` above means the caller is one of the heads, so one head in
		// the delegation is the caller and nobody would be left.
		if (heads.length === 1) {
			refuse(event, delegation.id, 'last_head', NOBODY_NAMED);
		}

		const result = await setDelegationMemberRole(
			event.locals.supabase,
			delegation.id,
			user.id,
			'member'
		);

		/* The `prevent_last_delegation_head_removal` trigger keeps the same rule and
		   may reach it first: another head may have stepped down between the count
		   above and this write. Its other answer, 'not_a_member', would mean the
		   caller left the delegation in the same moment, which the gate at the top
		   says they had not, so both get the sentence the count would have given. */
		if (result !== 'written') {
			refuse(event, delegation.id, 'last_head', NOBODY_NAMED);
		}

		/* The dashboard, not back to this page: the caller is no longer a head, so
		   `load` here would only send them on to the dashboard with a second flash
		   saying they may not manage members, and that second message would replace
		   this one. */
		setFlash(event.cookies, { tone: 'success', message: STEPPED_DOWN_FLASH });
		redirect(303, delegationUrl(delegation.id));
	},

	/**
	 * Take somebody out of this delegation.
	 *
	 * The member travels in the address as `?user=`, which
	 * `removeDelegationMemberUrl` in `$lib/urls.ts` builds, because `ConfirmButton`
	 * renders a `<form>` of its own and takes no extra hidden fields. The seats
	 * page's `unassign` action carries its seat the same way and explains the
	 * arrangement at both ends.
	 *
	 * `ConfirmButton`'s answer also sends `confirm=1`, which nothing here reads:
	 * the button has already asked, in a dialog with JavaScript and on the
	 * confirmation page without it.
	 */
	remove: async (event) => {
		const { delegation } = await requireHead(event);
		const user = await requireOnboarded(event.locals, event.url);

		const userId = event.url.searchParams.get('user') ?? '';

		if (userId === '') {
			refuse(event, delegation.id, 'not_a_member', NOBODY_NAMED);
		}

		// A head leaves by stepping down or by withdrawing the whole delegation,
		// which is what the refusal says. The button is not drawn on their own row.
		if (userId === user.id) {
			refuse(event, delegation.id, 'yourself', NOBODY_NAMED);
		}

		const members = await listDelegationMembers(event.locals.supabase, delegation.id);
		const member = findMember(members, userId);

		if (!member) {
			refuse(event, delegation.id, 'not_a_member', NOBODY_NAMED);
		}

		// The Remove button is drawn beside a seated member too, so this is the
		// refusal a head ordinarily reads rather than a backstop.
		if (member.seat !== null) {
			refuse(event, delegation.id, 'holds_a_seat', member.fullName);
		}

		/* The delete policy's one silent refusal is the seat, and the list above was
		   read a moment ago, so a refusal here is a seat somebody assigned in
		   between. */
		const result = await removeDelegationMember(event.locals.supabase, delegation.id, userId);

		if (result === 'refused') {
			refuse(event, delegation.id, 'holds_a_seat', member.fullName);
		}

		finish(event, delegation.id, 'success', memberRemovedFlash(member.fullName));
	}
};
