import { fail, redirect } from '@sveltejs/kit';
import { validateConferenceImage } from '$lib/conference-details';
import {
	basicsPatch,
	isDraftOwnImage,
	readBasics,
	validateBasics,
	type BasicsErrors,
	type BasicsValues
} from '$lib/creation-basics';
import { hasChosenDates, type CreationDraft, type PrefillField } from '$lib/creation-draft';
import { regeneratedName } from '$lib/creation-prefill';
import { furthestStep } from '$lib/creation-steps';
import {
	findPreviousConference,
	getCreationOrganization,
	setCreationStep,
	updateCreationDraft
} from '$lib/server/creation';
import { requireCreationDraft, saveCreationStep } from '$lib/server/creation-step-save';
import {
	removeConferenceImage,
	uploadConferenceImage,
	type ConferenceImageKind
} from '$lib/server/conferences';
import { createStepUrl } from '$lib/urls';
import type { Actions, RequestEvent } from './$types';

/*
	Step 2 of creating a conference: what it is called and how it looks. The
	layout's `load` (`../+layout.server.ts`) already reads the draft, its
	organisation and the previous edition, so this file has no `load` of its
	own; the page gets all of that as `data`.

	The step saves by itself while the organiser types (`save`), and
	"Continue to when & where" saves too (`continue`), so the page also works
	without JavaScript. Each action checks the organiser again, because an
	action is its own request.
*/

/** What a refused save or Continue sends back, so the page shows what to fix. */
export type BasicsFailure = { values: BasicsValues; errors: BasicsErrors };

/** What an automatic save answers: the draft as stored, with what the server worked out. */
export type BasicsSaved = { saved: true; draft: CreationDraft; errors: BasicsErrors };

/** The image fields, and the `prefill_sources` entry each one belongs to. */
const IMAGE_SOURCES: Record<ConferenceImageKind, PrefillField> = {
	logo: 'logo_path',
	banner: 'banner_path'
};

/** Save the form's good fields; Continue also insists on a name. */
async function saveBasics(event: RequestEvent, isContinuing: boolean) {
	const draft = await requireCreationDraft(event.locals, event.url, event.params.slug);
	const values = readBasics(await event.request.formData());
	const errors = validateBasics(values, { isNameRequired: isContinuing });
	const saved = await saveCreationStep(event.locals.supabase, draft, basicsPatch(values, errors));

	return { draft: saved, values, errors };
}

/** A picture chosen in a file field, or `null` when none was (an empty file). */
function readChosenImage(formData: FormData, kind: ConferenceImageKind): File | null {
	const chosen = formData.get(kind);

	return chosen instanceof File && chosen.size > 0 ? chosen : null;
}

/** Put a new logo or banner on the draft; it is the organiser's own from then on. */
async function uploadImage(event: RequestEvent, kind: ConferenceImageKind) {
	const draft = await requireCreationDraft(event.locals, event.url, event.params.slug);
	const file = readChosenImage(await event.request.formData(), kind);
	const problem =
		file === null ? `Please choose a ${kind} to upload.` : validateConferenceImage(file);

	if (file === null || problem !== null) {
		return fail(400, { imageErrors: { [kind]: problem } });
	}

	await uploadConferenceImage(event.locals.supabase, draft.id, kind, file);
	const sources = { ...draft.prefillSources, [IMAGE_SOURCES[kind]]: 'user' as const };
	await updateCreationDraft(event.locals.supabase, draft.id, {}, sources);

	redirect(303, createStepUrl(event.params.slug, 'basics'));
}

/**
 * Take a logo or banner off the draft. Only a picture in the draft's own
 * folder is ever deleted: the organisation's logo and the last edition's
 * banner were copied there when the draft began, so removing one here never
 * touches the picture it came from.
 */
async function removeImage(event: RequestEvent, kind: ConferenceImageKind) {
	const draft = await requireCreationDraft(event.locals, event.url, event.params.slug);
	const path = kind === 'logo' ? draft.logoPath : draft.bannerPath;

	if (isDraftOwnImage(path, draft.id)) {
		await removeConferenceImage(event.locals.supabase, draft.id, kind);
		const sources = { ...draft.prefillSources, [IMAGE_SOURCES[kind]]: 'user' as const };
		await updateCreationDraft(event.locals.supabase, draft.id, {}, sources);
	}

	redirect(303, createStepUrl(event.params.slug, 'basics'));
}

export const actions: Actions = {
	// Posted in the background a moment after the organiser stops typing. A
	// field with a mistake in it is not saved, and its message comes back.
	save: async (event) => {
		const { draft, errors } = await saveBasics(event, false);
		const answer: BasicsSaved = { saved: true, draft, errors };

		return answer;
	},

	continue: async (event) => {
		const { draft, values, errors } = await saveBasics(event, true);

		if (Object.keys(errors).length > 0) {
			const failure: BasicsFailure = { values, errors };
			return fail(400, failure);
		}

		await setCreationStep(
			event.locals.supabase,
			draft.id,
			furthestStep(draft.creationStep, 'when')
		);
		redirect(303, createStepUrl(event.params.slug, 'when'));
	},

	// "Regenerate name" sits inside the step's form, so the other fields come
	// along and are saved too. The new name is not the organiser's own, so it
	// keeps following the year of the dates.
	regenerateName: async (event) => {
		const draft = await requireCreationDraft(event.locals, event.url, event.params.slug);
		const values = readBasics(await event.request.formData());
		const patch = basicsPatch(values, validateBasics(values, { isNameRequired: false }));
		// The name typed in the field is the one being replaced.
		delete patch.name;
		const [organization, previous] = await Promise.all([
			getCreationOrganization(event.locals.supabase, draft.organizationId),
			findPreviousConference(event.locals.supabase, draft.organizationId, draft.id)
		]);

		if (organization !== null) {
			// Without chosen dates the placeholder's year would be a guess, so it is left out.
			const startDate = hasChosenDates(draft) ? draft.startDate : '';
			const generated = regeneratedName(previous, organization, startDate);
			await saveCreationStep(
				event.locals.supabase,
				draft,
				{ ...patch, name: generated.name },
				{ sourceOverrides: { name: generated.source } }
			);
		}

		redirect(303, createStepUrl(event.params.slug, 'basics'));
	},

	uploadLogo: (event) => uploadImage(event, 'logo'),
	uploadBanner: (event) => uploadImage(event, 'banner'),
	removeLogo: (event) => removeImage(event, 'logo'),
	removeBanner: (event) => removeImage(event, 'banner')
};
