import { fail, redirect } from '@sveltejs/kit';
import { creationPreview } from '$lib/creation-draft';
import {
	applicationsNote,
	effectiveLaunchChoice,
	launchChoices,
	launchFeeSummary,
	launchRows,
	openApplicationsBlockers,
	optionalImprovements,
	publishBlockers,
	whatApplicantsSee
} from '$lib/creation-readiness';
import { hasPermission } from '$lib/permissions';
import { requirePermission, requireUser } from '$lib/server/access';
import { countDraftFacts, getCreationDraft, publishDraft } from '$lib/server/creation';
import { setFlash } from '$lib/server/flash';
import { readMyPermissions } from '$lib/server/my-permissions';
import { conferenceUrl, manageConferenceUrl } from '$lib/urls';
import type { Actions, PageServerLoad } from './$types';

/** What a refused "Publish conference" sends back: one sentence for the notice. */
export type LaunchFailure = { publishError: string };

/*
	Step 5 of creating a conference: Launch. The page reviews what is ready,
	says what (if anything) stops the conference going public, and lets the
	organiser choose whether publishing also opens applications.

	`parent()` hands over what `../+layout.server.ts` returned: the draft, its
	organisation and previous edition, already checked to be the organiser's.
*/
export const load: PageServerLoad = async ({ parent, locals, url }) => {
	const { draft, organization, previous, now } = await parent();
	const user = await requireUser(locals, url);
	const counts = await countDraftFacts(locals.supabase, draft.id);
	// Everything the reader holds on the draft. The step opens with
	// `edit_conference`, and a role can give that without `manage_committees`.
	const permissions = await readMyPermissions(locals.supabase, draft.id, user.id);
	const facts = {
		...counts,
		previousCommitteeCount: previous ? previous.committeeCount : null,
		organizationName: organization.name
	};
	const feeSummary = launchFeeSummary(counts, draft.currency);

	return {
		rows: launchRows(draft, facts, new Date(now)),
		blockers: publishBlockers(draft),
		choices: launchChoices(draft),
		improvements: optionalImprovements(
			draft,
			facts,
			hasPermission(permissions, 'manage_committees')
		),
		applicantsSee: whatApplicantsSee(draft, feeSummary),
		applicationsNote: applicationsNote(draft),
		preview: creationPreview(draft, organization.name, feeSummary),
		publicUrl: conferenceUrl(draft.slug)
	};
};

export const actions: Actions = {
	/**
	 * "Publish conference": make the draft public and, when chosen, open
	 * applications, then go to the conference's management area.
	 *
	 * Everything is read again from the database rather than trusted from the
	 * form, because whether a conference may go public is not a question the
	 * browser gets to answer.
	 */
	publish: async ({ params, url, request, cookies, locals }) => {
		// A form action is its own request, so the organiser check is made again.
		await requirePermission(locals, url, params.slug, 'edit_conference');
		const draft = await getCreationDraft(locals.supabase, params.slug);

		if (!draft || draft.status !== 'draft') {
			const failure: LaunchFailure = { publishError: 'Only a draft can be published.' };
			// `fail` sends the page back with a 400 status and this as `form`.
			return fail(400, failure);
		}

		const blockers = publishBlockers(draft);

		if (blockers.length > 0) {
			const failure: LaunchFailure = { publishError: blockers[0] };
			return fail(400, failure);
		}

		const formData = await request.formData();
		const choice = effectiveLaunchChoice(
			draft.applicationOpenMode,
			formData.get('choice')?.toString() ?? null
		);
		const now = new Date();

		// Opening applications asks for more than publishing does.
		if (choice === 'publish_and_open') {
			const { committeeCount } = await countDraftFacts(locals.supabase, draft.id);
			const openBlockers = openApplicationsBlockers(draft, committeeCount, now);

			if (openBlockers.length > 0) {
				const failure: LaunchFailure = { publishError: openBlockers[0] };
				return fail(400, failure);
			}
		}

		try {
			await publishDraft(locals.supabase, draft, choice, now);
		} catch {
			// The database's own check on the place is the last line of defence;
			// its message is for developers, so the organiser gets the fix.
			const failure: LaunchFailure = {
				publishError: 'The conference could not be published. Check the When & where step.'
			};
			return fail(400, failure);
		}

		// A redirecting action cannot return anything, so the message travels in
		// a one-shot cookie that the root layout reads and throws away.
		const message =
			choice === 'publish_and_open'
				? `${draft.name} is now public and taking applications.`
				: `${draft.name} is now public.`;
		setFlash(cookies, { tone: 'success', message });

		// A 303 turns this POST into an ordinary visit of the management area.
		redirect(303, manageConferenceUrl(params.slug));
	}
};
