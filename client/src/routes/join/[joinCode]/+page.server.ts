/**
 * The page a join link lands on: `/join/<joinCode>`.
 *
 * The code in the address is what earns somebody the delegation's details.
 * A non-member may not select a `delegations` row at all, so the preview comes
 * from the `preview_delegation(code)` security definer function, which answers
 * with the handful of facts the card draws and nothing else.
 *
 * The code is not a secret the way an invitation's token is — a head shares it
 * with a whole class — so, unlike `/invites/[token]`, this page asks who is
 * reading before it looks anything up. `preview_delegation` is granted to
 * `authenticated` and revoked from `anon`, so a signed-out visitor could not
 * read it anyway.
 */

import { fail, redirect } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { canJoinDelegation, joinRefusalSentence, type RouteIntoConference } from '$lib/delegations';
import { delegationUrl, registerUrl } from '$lib/urls';
import type { DelegationPreview, JoinRefusalKind } from '$lib/delegations';
import { joinRefusalLink, unknownCodeLink, type JoinRefusalLink } from '$lib/join-refusal-link';
import { requireOnboarded } from '$lib/server/access';
import {
	findConferenceIdBySlug,
	findMyRouteIntoConference,
	getDelegationByJoinCode,
	joinDelegation
} from '$lib/server/delegations';
import { setFlash } from '$lib/server/flash';
import { getMyProfile } from '$lib/server/profiles';
import type { Actions, PageServerLoad } from './$types';

/**
 * What the action says when the code it was given belongs to no delegation.
 *
 * `join.md`'s refusal table words it this way. The empty state on the page
 * itself says something else, because somebody who followed a broken link has
 * not pressed anything yet.
 */
const UNKNOWN_CODE_MESSAGE =
	'That join link is not valid. Check it with your teacher or head delegate.';

/**
 * What the page says when the database refused for a reason nothing here knows.
 *
 * `join.md`'s States section asks for exactly this sentence, and for the real
 * message to be logged, which `joinDelegation` does before it answers.
 */
const SOMETHING_WENT_WRONG = 'Something went wrong on our side. Please try again.';

/**
 * What the action says once this person has sent ten wrong codes in an hour.
 * The database refuses every code until the hour has passed, the right one
 * too, so there is nothing to link to.
 */
const TOO_MANY_WRONG_CODES_MESSAGE = 'Too many wrong codes. Try again in an hour.';

/**
 * What the one action answers with when it refuses: the sentence the card
 * draws, and the one link under it that helps, or `null` when there is none.
 */
type JoinPageResult = {
	message: string;
	link: JoinRefusalLink | null;
};

/**
 * Today as a `YYYY-MM-DD` day, read off the UTC clock.
 *
 * `canJoinDelegation` asks the day one question only: has the conference
 * already taken place? The preview carries the conference's dates but not its
 * timezone, and a day either side cannot change the answer for a conference
 * that has ended, so a day this coarse is all this needs.
 */
function todayInUtc(): string {
	return new Date().toISOString().slice(0, 10);
}

/**
 * How this person is already attached to the conference the preview names, or
 * `null` when they are attached to it in no way at all.
 *
 * The preview carries the conference's slug and not its id, because
 * `preview_delegation` answers with the facts the card draws.
 * `findMyRouteIntoConference` needs the id, so it is looked up in between.
 */
async function findExistingRoute(
	supabase: SupabaseClient,
	conferenceSlug: string,
	userId: string
): Promise<RouteIntoConference | null> {
	const conferenceId = await findConferenceIdBySlug(supabase, conferenceSlug);

	if (!conferenceId) {
		// The join code is what lets this person read the delegation; nothing
		// promises the conference's own row is readable to them as well. With no
		// id there is nothing to ask about, and "no route in" leaves the last
		// word to `join_delegation`, which checks the same rule in the database.
		return null;
	}

	return findMyRouteIntoConference(supabase, conferenceId, userId);
}

/**
 * Put the sentence `join.md` quotes, and the link under it, on the refusal the
 * database raised.
 *
 * The database knows which rule was broken but none of the names: four of the
 * seven sentences name the conference, and one names the *other* delegation
 * this person is already in, which is the one thing neither the database's
 * message nor the preview carries. The links of those two refusals also need
 * the reader's own delegation or application (T177). So the reader's route in
 * is looked up here, and only for those two, so the other refusals cost no
 * extra query.
 */
async function describeRefusal(
	supabase: SupabaseClient,
	kind: JoinRefusalKind | 'unknown_code' | 'too_many_wrong_codes' | 'unknown',
	preview: DelegationPreview,
	userId: string
): Promise<JoinPageResult> {
	if (kind === 'too_many_wrong_codes') {
		return { message: TOO_MANY_WRONG_CODES_MESSAGE, link: null };
	}

	const needsRoute = kind === 'in_other_delegation' || kind === 'already_applied';
	const existing = needsRoute
		? await findExistingRoute(supabase, preview.conferenceSlug, userId)
		: null;
	const link = joinRefusalLink(kind, {
		conferenceName: preview.conferenceName,
		conferenceSlug: preview.conferenceSlug,
		existing
	});

	if (kind === 'unknown_code') {
		return { message: UNKNOWN_CODE_MESSAGE, link };
	}

	if (kind === 'unknown') {
		// `join.md`'s States section: a refusal that is not in the table is ours
		// to fix, so the visitor is told nothing about it beyond "try again".
		return { message: SOMETHING_WENT_WRONG, link };
	}

	const message = joinRefusalSentence(kind, {
		conferenceName: preview.conferenceName,
		otherDelegationName: existing?.kind === 'delegation' ? existing.delegationName : null
	});

	return { message, link };
}

/**
 * Runs on the server before the page is drawn, and again after the action
 * below. Whatever it returns arrives in `+page.svelte` as `data`.
 */
export const load: PageServerLoad = async ({ params, url, cookies, locals }) => {
	// `getVerifiedClaims` is the only way server code asks who is signed in. It
	// checks the token the browser sent rather than believing it.
	const claims = await locals.getVerifiedClaims();

	if (!claims) {
		/*
			`join.md` sends a signed-out visitor to the register form rather than to
			the sign in page: most people opening a teacher's link have no account
			yet, and the register page carries `next` on to its own "Already have an
			account? Log in" link. `requireOnboarded` cannot say this — it always
			sends a signed-out visitor to `/login` — so the check is made here first
			and it is only asked about somebody who is signed in.

			The way back is `url.pathname`, this page's own address, and not
			`joinDelegationUrl(...)`. `resolve()` answers a *relative* address while
			a page is being built on the server, and `safeRedirectPath`, which
			`registerUrl` runs it through, throws anything not starting with a slash
			away. `/invites/[token]` builds its `next` from `url.pathname` for the
			same reason.
		*/
		redirect(303, registerUrl(url.pathname));
	}

	// Somebody who has not finished the welcome page goes to `/welcome` and is
	// brought back here through `next`, which is what `join.md`'s Access line
	// asks for.
	const user = await requireOnboarded(locals, url);

	/*
		The folder is named `[joinCode]`, so SvelteKit hands us that part of the
		address as `params.joinCode`, and it is handed on exactly as it was typed.
		`join.md` asks for a lower-case or spaced code to be normalised, and
		`$lib/server/delegations.ts` does that in the one place both the preview
		and the join go through. Tidying it here as well would be a second source
		of truth for the same rule.
	*/
	const joinCode = params.joinCode;
	const preview = await getDelegationByJoinCode(locals.supabase, joinCode);

	if (preview === 'too_many_wrong_codes') {
		// Ten wrong codes in the last hour. The database will not say whether
		// this one is right until the hour has passed, so the page says that
		// instead of "no delegation found", which may not be true.
		return {
			joinCode,
			preview: null,
			reason: null,
			reasonLink: null,
			me: null,
			isTooManyWrongCodes: true
		};
	}

	if (!preview) {
		// The page draws its `EmptyState` from this. There is no delegation to
		// ask `canJoinDelegation` about and nobody to draw the "You will join as"
		// line for, so the rest are empty. The `EmptyState` draws its own
		// "Browse conferences" button.
		return {
			joinCode,
			preview: null,
			reason: null,
			reasonLink: null,
			me: null,
			isTooManyWrongCodes: false
		};
	}

	// Neither of these needs the other's answer, so they run side by side.
	const [profileAndDetails, existing] = await Promise.all([
		getMyProfile(locals.supabase, user.id),
		findExistingRoute(locals.supabase, preview.conferenceSlug, user.id)
	]);

	const refusal = canJoinDelegation(preview, existing, todayInUtc());

	if (refusal?.kind === 'already_in_this') {
		/*
			The one refusal the card never draws. `join.md`'s "Already a member"
			state is an immediate redirect to the delegation's own dashboard, which
			is where somebody who is already in it wanted to go anyway.

			`already_in_this` is only possible when `existing` is a membership of
			this very delegation, so the delegation to go to is `preview.id`.

			A redirecting `load` cannot return anything, so the message travels in a
			one-shot cookie that the root layout reads and throws away.
		*/
		setFlash(cookies, { tone: 'info', message: refusal.message });
		redirect(303, delegationUrl(preview.id));
	}

	return {
		joinCode,
		preview,
		/** Why this person may not join, or `null` when they may. */
		reason: refusal?.message ?? null,
		/** The one link under the reason that helps, as `join.md`'s link table names it. */
		reasonLink: refusal
			? joinRefusalLink(refusal.kind, {
					conferenceName: preview.conferenceName,
					conferenceSlug: preview.conferenceSlug,
					existing
				})
			: null,
		/** The reader, for the "You will join as" line on the card. */
		me: {
			fullName: profileAndDetails.profile.fullName,
			avatarPath: profileAndDetails.profile.avatarPath
		},
		isTooManyWrongCodes: false
	};
};

export const actions: Actions = {
	/**
	 * Join the delegation the code belongs to. It is the page's only action.
	 *
	 * It deliberately does not ask `canJoinDelegation` again. `join_delegation`
	 * checks every one of those rules in the database, and `join.md`'s third
	 * acceptance criterion asks for the refusals to be "enforced by the database
	 * function, not only the page". Asking twice would let the two drift apart.
	 */
	default: async ({ request, url, cookies, locals }) => {
		// A form action is its own request, so the gate is asked again rather
		// than trusted from whenever `load` last ran.
		const user = await requireOnboarded(locals, url);

		const formData = await request.formData();

		// `join.md` puts the code in a hidden field on the form, and it is handed
		// on untouched for the reason `load` above gives.
		const joinCode = String(formData.get('joinCode') ?? '');

		// Read before joining rather than after it, because the message below
		// names the delegation and this is the only place its name comes from.
		const preview = await getDelegationByJoinCode(locals.supabase, joinCode);

		// Possible only if this person sent wrong codes from somewhere else
		// after the card was drawn.
		if (preview === 'too_many_wrong_codes') {
			return fail(429, {
				message: TOO_MANY_WRONG_CODES_MESSAGE,
				link: null
			} satisfies JoinPageResult);
		}

		if (!preview) {
			// `fail` sends the page back with this status and this result as
			// `form`, so the card can draw the sentence in a `Notice`.
			return fail(400, {
				message: UNKNOWN_CODE_MESSAGE,
				link: unknownCodeLink()
			} satisfies JoinPageResult);
		}

		const result = await joinDelegation(locals.supabase, joinCode);

		if (!result.ok) {
			const refusal = await describeRefusal(locals.supabase, result.kind, preview, user.id);

			if (result.kind === 'already_in_this') {
				/*
					The one row of `join.md`'s refusal table annotated "(redirect to
					it)", and its "Already a member" state says the same thing again:
					somebody who is already in the delegation wanted its dashboard,
					not a notice about it. `load` sends them there before the card is
					ever drawn, so only a form posted by hand reaches this, and it
					ends in the same place for the same reason.
				*/
				setFlash(cookies, { tone: 'info', message: refusal.message });
				redirect(303, delegationUrl(preview.id));
			}

			return fail(400, refusal satisfies JoinPageResult);
		}

		setFlash(cookies, { tone: 'success', message: `You joined ${preview.name}.` });
		redirect(303, delegationUrl(result.delegationId));
	}
};
