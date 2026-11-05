import { fail, redirect } from '@sveltejs/kit';
import {
	hasCreationStartErrors,
	readCreationStart,
	validateCreationStart,
	type CreationStartErrors,
	type CreationStartValues
} from '$lib/creation-start';
import type { CreationOrganization } from '$lib/creation-draft';
import { prefillDraft } from '$lib/creation-prefill';
import { shellSubtitle, type CreationShell } from '$lib/creation-steps';
import { NEW_ORGANIZATION } from '$lib/organizations';
import { requireOnboarded } from '$lib/server/access';
import {
	findPreviousConference,
	getCreationOrganization,
	listCreationOrganizations,
	startCreationDraft
} from '$lib/server/creation';
import { createOrganization } from '$lib/server/organizations';
import { createStepUrl } from '$lib/urls';
import type { Actions, PageServerLoad } from './$types';

/** What a refused "Continue to basics" sends back, so the page shows what to fix. */
export type CreationStartFailure = { values: CreationStartValues; errors: CreationStartErrors };

/*
	Step 1 of creating a conference: who runs it. The chosen organisation lives
	in the address (`?organization=<id>` or `?organization=new`), so the cards
	are plain links, the page works without JavaScript, and the preview and the
	"previous conference" suggestion are worked out here on the server.

	Only signed-in people who finished the welcome page may create a
	conference; `requireOnboarded` redirects everybody else.
*/
export const load: PageServerLoad = async ({ url, locals }) => {
	const user = await requireOnboarded(locals, url);
	const organizations = await listCreationOrganizations(locals.supabase, user.id);

	// Somebody without an organisation has only one possible choice.
	const asked =
		url.searchParams.get('organization') ?? (organizations.length === 0 ? NEW_ORGANIZATION : '');
	const chosenOrganization =
		organizations.find((organization) => organization.id === asked) ?? null;
	const choice = chosenOrganization
		? chosenOrganization.id
		: asked === NEW_ORGANIZATION
			? NEW_ORGANIZATION
			: '';

	const previous = chosenOrganization
		? await findPreviousConference(locals.supabase, chosenOrganization.id, null)
		: null;
	const now = new Date();
	const suggestion = chosenOrganization
		? prefillDraft({ organization: chosenOrganization, previous, now })
		: null;

	const shell: CreationShell = {
		slug: null,
		step: 'organization',
		title: 'Create a conference',
		subtitle: shellSubtitle('organization')
	};

	return {
		shell,
		organizations,
		choice,
		chosenOrganization,
		previous,
		suggestion,
		now: now.toISOString()
	};
};

/** The organisation the draft is for: a new one made now, or one of the reader's own. */
async function organizationFor(
	locals: App.Locals,
	userId: string,
	values: CreationStartValues
): Promise<CreationOrganization> {
	const organizationId =
		values.organization === NEW_ORGANIZATION
			? await createOrganization(locals.supabase, {
					name: values.name,
					userId,
					city: values.city,
					countryCode: values.countryCode
				})
			: values.organization;

	const organization = await getCreationOrganization(locals.supabase, organizationId);

	if (!organization) {
		throw new Error(`Could not read the organisation ${organizationId} just chosen.`);
	}

	return organization;
}

/**
 * This page has a named action instead of a `default` one, so the form says
 * which: `action="?/start"`.
 */
export const actions: Actions = {
	/**
	 * "Continue to basics" (and "Use this setup"): make the draft, prefilled
	 * from the organisation and its previous conference, and go to Basics.
	 */
	start: async ({ request, url, locals }) => {
		// Checked again here, because a form action is its own request.
		const user = await requireOnboarded(locals, url);
		const values = readCreationStart(await request.formData());

		const myOrganizations = await listCreationOrganizations(locals.supabase, user.id);
		const errors = validateCreationStart(
			values,
			myOrganizations.map((organization) => organization.id)
		);

		if (hasCreationStartErrors(errors)) {
			const failure: CreationStartFailure = { values, errors };
			// `fail` sends the page back with a 400 status and this as `form`.
			return fail(400, failure);
		}

		const organization = await organizationFor(locals, user.id, values);
		const previous = await findPreviousConference(locals.supabase, organization.id, null);
		const { values: draftValues, sources } = prefillDraft({
			organization,
			previous,
			now: new Date()
		});

		const slug = await startCreationDraft(locals.supabase, {
			organizationId: organization.id,
			userId: user.id,
			values: draftValues,
			sources
		});

		// A 303 turns this POST into an ordinary visit, so a refresh cannot make a second draft.
		redirect(303, createStepUrl(slug, 'basics'));
	}
};
