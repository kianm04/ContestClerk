import { fail, redirect } from '@sveltejs/kit';
import { committeeHeading } from '$lib/committees';
import {
	crisisDeskSections,
	crisisUpdateSentMessage,
	readCrisisUpdateForm
} from '$lib/crisis-papers';
import type { Flash } from '$lib/flash';
import { crisisDeskUrl } from '$lib/urls';
import {
	listCrisisDesk,
	readCrisisUpdate,
	requireCrisisStaff,
	sendCrisisUpdate
} from '$lib/server/crisis-desk';
import { setFlash } from '$lib/server/flash';
import type { Actions, PageServerLoad } from './$types';

/**
 * The crisis staff's page (`docs/committee-papers.md`, section 6): the
 * directives and press releases waiting for their answer, the crisis update
 * the room shows, and what they have answered.
 */
export const load: PageServerLoad = async ({ locals, url, params }) => {
	const { conference, committee } = await requireCrisisStaff(locals, url, params);
	const supabase = locals.supabase;

	const [items, update] = await Promise.all([
		listCrisisDesk(supabase, committee.id),
		readCrisisUpdate(supabase, committee.id)
	]);

	return {
		conference: { slug: conference.slug, name: conference.name, timezone: conference.timezone },
		committee: { slug: committee.slug, heading: committeeHeading(committee) },
		sections: crisisDeskSections(items),
		update
	};
};

export const actions: Actions = {
	/** "Send update": the live view and the projector show it until the next one. */
	sendUpdate: async (event) => {
		const { committee } = await requireCrisisStaff(event.locals, event.url, event.params);
		const form = readCrisisUpdateForm(await event.request.formData());

		if (form.error !== null) {
			return fail(400, { message: form.message, error: form.error });
		}

		const change = await sendCrisisUpdate(event.locals.supabase, committee.id, form.message);

		if (change.refusal !== null) {
			const flash: Flash = { tone: 'error', message: change.refusal };

			return fail(400, { message: form.message, error: null, flash });
		}

		setFlash(event.cookies, { tone: 'success', message: crisisUpdateSentMessage(form.message) });
		redirect(303, crisisDeskUrl(event.params.slug, event.params.committeeSlug));
	}
};
