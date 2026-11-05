import { error, fail, redirect, type Cookies } from '@sveltejs/kit';
import type { Conference } from '$lib/conferences';
import {
	canCreateDelegation,
	emptyDelegationForm,
	hasDelegationFormErrors,
	readDelegationForm,
	validateDelegationForm,
	type CreateRefusal
} from '$lib/delegations';
import { conferenceUrl, delegationUrl } from '$lib/urls';
import { requireOnboarded } from '$lib/server/access';
import { getConferenceBySlug } from '$lib/server/conferences';
import { createDelegation, findMyRouteIntoConference } from '$lib/server/delegations';
import { setFlash } from '$lib/server/flash';
import { getMyProfile } from '$lib/server/profiles';
import type { Actions, PageServerLoad } from './$types';

/** What `/delegations/[delegationId]` says at the top once the delegation exists. */
const DELEGATION_CREATED_FLASH = 'Delegation created. Share the join code with your members.';

/** What the page says when the conference in the address does not exist. */
const NO_SUCH_CONFERENCE = 'This conference does not exist.';

/** An empty box is not a note, and `delegations.note` is nullable. */
function emptyToNull(text: string): string | null {
	return text === '' ? null : text;
}

/**
 * Send somebody who may not register a delegation here back to the conference,
 * with the reason waiting for them when they arrive.
 *
 * `05-pages/delegation/new.md` says this page is "never rendered" when one of
 * the six reasons applies, so a refusal leaves rather than drawing a notice the
 * way the apply page does. A redirecting page or action cannot return anything,
 * so the message travels in a one-shot cookie that the root layout reads and
 * throws away.
 *
 * `redirect` works by throwing rather than by returning, which is why this
 * function is typed `never`: nothing written after a call to it ever runs.
 */
function goBackWithReason(cookies: Cookies, conference: Conference, refusal: CreateRefusal): never {
	setFlash(cookies, { tone: 'warning', message: refusal.message });
	redirect(303, conferenceUrl(conference.slug));
}

/**
 * Runs on the server before the page is drawn, and again after the action on
 * it. Whatever it returns arrives in `+page.svelte` as `data`.
 *
 * `requireOnboarded` rather than `requireUser`: it sends a visitor to
 * `/login?next=/conferences/<slug>/delegations/new` and an account that has not
 * answered the welcome questions to `/welcome`, which is what
 * `05-pages/delegation/new.md` asks of this page. Files under `$lib/server`
 * only ever run on the server, so the queries below cannot reach the browser.
 */
export const load: PageServerLoad = async ({ params, url, locals, cookies }) => {
	const user = await requireOnboarded(locals, url);

	// The folder is named `[slug]`, so SvelteKit hands us that part of the
	// address as `params.slug`.
	const conference = await getConferenceBySlug(locals.supabase, params.slug);

	if (!conference) {
		// `error` stops here and shows SvelteKit's error page with a 404 status.
		error(404, NO_SUCH_CONFERENCE);
	}

	// Neither of these needs the other's answer, so they run side by side.
	const [profileAndDetails, existingRoute] = await Promise.all([
		getMyProfile(locals.supabase, user.id),
		findMyRouteIntoConference(locals.supabase, conference.id, user.id)
	]);

	const refusal = canCreateDelegation(conference, existingRoute, new Date());

	if (refusal !== null) {
		goBackWithReason(cookies, conference, refusal);
	}

	const { profile } = profileAndDetails;

	return {
		conference,
		/**
		 * What every box on the form starts with. The institution and the country
		 * come from the profile, which is the prefill `new.md` asks for; a profile
		 * that has neither simply gives two empty boxes rather than failing.
		 */
		values: emptyDelegationForm(profile)
	};
};

export const actions: Actions = {
	/**
	 * Register the delegation and take its new head to its own page.
	 *
	 * The form has no `action` of its own, so the browser posts to the page and
	 * SvelteKit runs the action named `default`.
	 */
	default: async ({ params, url, locals, cookies, request }) => {
		const user = await requireOnboarded(locals, url);

		/*
			The conference and the route into it are read all over again rather than
			trusted from whenever the page was last drawn. A form action is its own
			request and nothing `load` worked out reaches it, which is what
			`specs/02-architecture/permissions.md` asks of every action.
		*/
		const conference = await getConferenceBySlug(locals.supabase, params.slug);

		if (!conference) {
			error(404, NO_SUCH_CONFERENCE);
		}

		const existingRoute = await findMyRouteIntoConference(locals.supabase, conference.id, user.id);

		const formData = await request.formData();
		const values = readDelegationForm(formData);

		// `asksConsent: true` because this is the register form. The edit form on
		// the dashboard reuses the same rules with `false`, since the tick box is
		// only agreed to once.
		const errors = validateDelegationForm(values, { asksConsent: true });

		if (hasDelegationFormErrors(errors)) {
			/*
				400, because what arrived is wrong and only the person who sent it can
				put it right. `fail` sends the page back with that status and this
				result as `form`, so every box keeps what was typed and shows its own
				message at once.
			*/
			return fail(400, { values, errors });
		}

		const refusal = canCreateDelegation(conference, existingRoute, new Date());

		if (refusal !== null) {
			// Somebody whose application window shut, or who followed a colleague's
			// join link, between the form being drawn and the button being pressed.
			goBackWithReason(cookies, conference, refusal);
		}

		const delegationId = await createDelegation(locals.supabase, {
			conferenceId: conference.id,
			name: values.name,
			institutionName: values.institutionName,
			countryCode: values.countryCode,
			// `validateDelegationForm` has already shown this to be a whole number
			// between 1 and 200, so reading it as one cannot give `NaN` here.
			// `Number` and not `Number.parseInt`, because `Number` is what
			// `isSeatCount` inside that check reads it with, and the two disagree:
			// `parseInt('1e2')` is 1 where `Number('1e2')` is 100. Storing a
			// different number from the one that was approved is how a form ends up
			// saving something nobody asked for.
			requestedSeats: Number(values.requestedSeats),
			note: emptyToNull(values.note)
		});

		setFlash(cookies, { tone: 'success', message: DELEGATION_CREATED_FLASH });
		redirect(303, delegationUrl(delegationId));
	}
};
