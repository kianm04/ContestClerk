import { fail, redirect } from '@sveltejs/kit';
import type { CreationDraft } from '$lib/creation-draft';
import { furthestStep } from '$lib/creation-steps';
import {
	readWhen,
	suggestedDatesSave,
	validateWhen,
	whenPatch,
	type WhenErrors,
	type WhenValues
} from '$lib/creation-when';
import { formatDateRange } from '$lib/dates';
import { findPreviousConference, setCreationStep } from '$lib/server/creation';
import { requireCreationDraft, saveCreationStep } from '$lib/server/creation-step-save';
import { describeDateSpan, suggestNextEditionDates } from '$lib/suggested-dates';
import { timezoneOptions } from '$lib/timezones';
import { createStepUrl } from '$lib/urls';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/*
	Step 3 of creating a conference: when and where. The layout's `load`
	(`../+layout.server.ts`) already reads the draft and the previous edition;
	`await parent()` hands this `load` what it returned, and this one adds what
	only this step needs: next year's suggested dates and the timezones.

	Nothing here is required. A date, a time or a venue can stay "to be
	announced"; only half a date range is refused when the organiser moves on.
*/
export const load: PageServerLoad = async ({ parent }) => {
	const { previous } = await parent();
	const dates = previous ? suggestNextEditionDates(previous.startDate, previous.endDate) : null;
	const suggestion =
		previous && dates
			? {
					...dates,
					previousName: previous.name,
					previousBannerPath: previous.bannerPath,
					range: formatDateRange(dates.startDate, dates.endDate),
					span: describeDateSpan(dates.startDate, dates.endDate)
				}
			: null;

	return { suggestion, timezoneOptions: timezoneOptions() };
};

/** What a refused Continue sends back, so the page shows what to fix. */
export type WhenFailure = { values: WhenValues; errors: WhenErrors };

/** What an automatic save answers: the draft as stored, with what the server worked out. */
export type WhenSaved = { saved: true; draft: CreationDraft; errors: WhenErrors };

/**
 * Save the form's good fields. Dates picked for a draft that had none are the
 * organiser's own, even on the rare day they match the placeholder.
 */
async function saveWhen(event: RequestEvent, isContinuing: boolean) {
	const draft = await requireCreationDraft(event.locals, event.url, event.params.slug);
	const values = readWhen(await event.request.formData());
	const errors = validateWhen(values, { isContinuing });
	const { patch, venueAddress, hasPickedFirstDates } = whenPatch(values, errors, draft);
	const saved = await saveCreationStep(event.locals.supabase, draft, patch, {
		venueAddress,
		sourceOverrides: hasPickedFirstDates ? { start_date: 'user', end_date: 'user' } : {}
	});

	return { draft: saved, values, errors };
}

export const actions: Actions = {
	save: async (event) => {
		const { draft, errors } = await saveWhen(event, false);
		const answer: WhenSaved = { saved: true, draft, errors };

		return answer;
	},

	continue: async (event) => {
		const { draft, values, errors } = await saveWhen(event, true);

		if (Object.keys(errors).length > 0) {
			const failure: WhenFailure = { values, errors };
			return fail(400, failure);
		}

		await setCreationStep(
			event.locals.supabase,
			draft.id,
			furthestStep(draft.creationStep, 'setup')
		);
		redirect(303, createStepUrl(event.params.slug, 'setup'));
	},

	// "Use these dates" on the suggestion: a suggestion accepted, not typed, so
	// the dates keep coming from the last conference.
	useSuggestedDates: async (event) => {
		const draft = await requireCreationDraft(event.locals, event.url, event.params.slug);
		const previous = await findPreviousConference(
			event.locals.supabase,
			draft.organizationId,
			draft.id
		);
		const suggested = previous ? suggestedDatesSave(previous) : null;

		if (suggested !== null) {
			await saveCreationStep(event.locals.supabase, draft, suggested.patch, {
				sourceOverrides: suggested.sources
			});
		}

		redirect(303, createStepUrl(event.params.slug, 'when'));
	}
};
