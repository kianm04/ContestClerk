import { fail, redirect } from '@sveltejs/kit';
import {
	canEditDelegation,
	canSubmitDelegation,
	canWithdrawDelegation,
	hasDelegationFormErrors,
	isTakingDelegations,
	readDelegationForm,
	toDelegationFormValues,
	validateDelegationForm,
	type DelegationFormErrors,
	type DelegationFormValues
} from '$lib/delegations';
import { delegationUrl } from '$lib/urls';
import { requireDelegationHead, requireOnboarded } from '$lib/server/access';
import {
	countDelegationSeats,
	findMyDelegationSeat,
	setDelegationStatus,
	updateDelegationDetails
} from '$lib/server/delegations';
import { setFlash } from '$lib/server/flash';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/**
 * What the "Details" form answers with when it refuses.
 *
 * `values` is everything that was typed, so a refused form is drawn again
 * exactly as it was sent and nothing is lost.
 */
type DashboardPageResult = {
	values: DelegationFormValues;
	errors: DelegationFormErrors;
};

/** What the dashboard says once the request has gone to the organisers. */
const SUBMITTED_FLASH = 'Request sent to the organisers.';

/** What it says once the head has taken the request back. */
const WITHDRAWN_FLASH = 'Request withdrawn.';

/** What it says once the edit form has been saved. */
const SAVED_FLASH = 'Details saved.';

/**
 * What the edit form says when the delegation has moved on past `submitted`,
 * or the conference has stopped taking delegations.
 *
 * `05-pages/delegation/dashboard.md` does not quote a message for this one, so
 * it is worded like "This delegation can no longer be withdrawn.", which it
 * does quote, rather than being invented in a different voice.
 */
const CANNOT_EDIT = 'This delegation can no longer be changed.';

/** An empty note box is not a note, and the column is nullable. */
function emptyToNull(text: string): string | null {
	return text === '' ? null : text;
}

/**
 * The head posting one of the three actions, with the delegation and its
 * conference.
 *
 * Every action asks again rather than trusting what `load` worked out: a form
 * action is its own request and is handed nothing `load` decided, which is what
 * `specs/02-architecture/permissions.md` asks of every action. A plain member
 * gets the same 404 a stranger gets, never a 403.
 */
function requireHead(event: RequestEvent) {
	return requireDelegationHead(event.locals, event.url, event.params.delegationId);
}

/**
 * Runs on the server before the page is drawn, and again after every action on
 * it. Whatever it returns arrives in `+page.svelte` as `data`, on top of what
 * the layout's own `load` returned.
 *
 * `./$types` holds the types SvelteKit generates for this one route, so
 * `PageServerLoad` already knows that `params` has a `delegationId` in it.
 */
export const load: PageServerLoad = async ({ params, url, locals, parent }) => {
	/*
		`parent()` is a promise for whatever the layout's `load` returned, and
		waiting for it is also what makes the check above this page run first: the
		layout calls `requireDelegationMember`, which throws a 404 at anybody who
		is not in this delegation, so nothing below runs for a stranger. The edit
		form is filled from that same delegation row as the cards beside it, so
		the two can never show different versions of it.

		`requireOnboarded` is then asked only for the reader's own id, which the
		layout does not hand down and which the seat below is looked up by. It is
		the same shape `/manage/[slug]` uses: the layout checks the role once and
		the pages under it do not check it again.
	*/
	const { delegation, conference } = await parent();
	const user = await requireOnboarded(locals, url);

	const mySeat = await findMyDelegationSeat(locals.supabase, params.delegationId, user.id);

	return {
		/** The reader's own seat in this delegation, or `null` before one is assigned. */
		mySeat,
		/** What every box of the "Details" form starts with. */
		editValues: toDelegationFormValues(delegation),
		/**
		 * Whether a head may still change the details: the delegation is open and
		 * the conference is taking delegations. The clock is read here, once, for
		 * the reason the submit action below gives.
		 */
		canEdit: canEditDelegation(delegation.status, isTakingDelegations(conference, new Date()))
	};
};

export const actions: Actions = {
	/**
	 * Send the request to the organisers, from `draft` to `submitted`.
	 *
	 * Every ending redirects back to this same page, which is what
	 * `dashboard.md` asks for, and the message travels in a one-shot cookie that
	 * the root layout reads and throws away. A redirecting action cannot return
	 * anything, so there is no result type to declare.
	 */
	submit: async (event) => {
		const { delegation, conference } = await requireHead(event);

		// The clock is read here rather than by the button, which is drawn for
		// every `draft` delegation whether the window is open or not: a component
		// that called `new Date()` would write one thing while the page is
		// rendered on the server and another a moment later in the browser, and
		// Svelte reports that as a hydration mismatch.
		const refusal = canSubmitDelegation(delegation, conference, new Date());

		if (refusal) {
			setFlash(event.cookies, { tone: 'warning', message: refusal.message });
			redirect(303, delegationUrl(delegation.id));
		}

		await setDelegationStatus(event.locals.supabase, delegation.id, 'submitted');

		setFlash(event.cookies, { tone: 'success', message: SUBMITTED_FLASH });
		redirect(303, delegationUrl(delegation.id));
	},

	/** Take the request back, from `draft` or `submitted` to `withdrawn`. */
	withdraw: async (event) => {
		const { delegation } = await requireHead(event);

		// Whether the organisers have already reserved seats is what decides this,
		// so they are counted again here rather than trusted from whenever the
		// page was last drawn.
		const seatCounts = await countDelegationSeats(event.locals.supabase, delegation.id);

		const refusal = canWithdrawDelegation(delegation, seatCounts.allocated);

		if (refusal) {
			setFlash(event.cookies, { tone: 'warning', message: refusal.message });
			redirect(303, delegationUrl(delegation.id));
		}

		await setDelegationStatus(event.locals.supabase, delegation.id, 'withdrawn');

		setFlash(event.cookies, { tone: 'success', message: WITHDRAWN_FLASH });
		redirect(303, delegationUrl(delegation.id));
	},

	/** Save the five columns a head may still write while the request is open. */
	update: async (event) => {
		const { delegation, conference } = await requireHead(event);

		// `draft` or `submitted` only, and only while the conference is taking
		// delegations. Once the organisers have decided, the seat count and the
		// name are theirs to work from and not the head's to change; once the
		// window has shut, `guard_delegation_update` refuses the write anyway.
		if (!canEditDelegation(delegation.status, isTakingDelegations(conference, new Date()))) {
			setFlash(event.cookies, { tone: 'warning', message: CANNOT_EDIT });
			redirect(303, delegationUrl(delegation.id));
		}

		const formData = await event.request.formData();
		const values = readDelegationForm(formData);

		// The edit form has no consent box: `dashboard.md` says it reuses the
		// register form "without the consent box", because the consent was given
		// once when the delegation was registered.
		const errors = validateDelegationForm(values, { asksConsent: false });

		if (hasDelegationFormErrors(errors)) {
			// 400, because what arrived is wrong and only the person who sent it can
			// put it right. `fail` sends the page back with that status and this
			// result as `form`, so every box keeps what was typed and shows its own
			// message at once.
			return fail(400, { values, errors } satisfies DashboardPageResult);
		}

		await updateDelegationDetails(event.locals.supabase, delegation.id, {
			name: values.name,
			institutionName: values.institutionName,
			countryCode: values.countryCode,
			// `validateDelegationForm` has already refused anything that is not a
			// whole number between 1 and 200, so this always reads as a real number.
			requestedSeats: Number(values.requestedSeats),
			note: emptyToNull(values.note)
		});

		setFlash(event.cookies, { tone: 'success', message: SAVED_FLASH });
		redirect(303, delegationUrl(delegation.id));
	}
};
