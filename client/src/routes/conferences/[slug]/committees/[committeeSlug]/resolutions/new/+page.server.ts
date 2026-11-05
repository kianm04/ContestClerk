import { error, fail, redirect } from '@sveltejs/kit';
import { committeeHeading } from '$lib/committees';
import {
	paperSourceLabel,
	papersPageTitle,
	presetTopic,
	readNewPaperForm,
	startablePaperKinds,
	type NewPaperErrors,
	type NewPaperValues,
	type PaperKind
} from '$lib/committee-papers';
import type { Flash } from '$lib/flash';
import { statusLabel } from '$lib/status';
import { committeePaperUrl } from '$lib/urls';
import { requireRoomWatcher } from '$lib/server/access';
import { startPaper } from '$lib/server/committee-paper-authors';
import { listIntroducedWorkingPapers } from '$lib/server/committee-paper-sources';
import { readMyPaperSeat, readPaperCommittee } from '$lib/server/committee-papers';
import type { Actions, PageServerLoad } from './$types';

/** What `start` answers when it refuses, so the form keeps what was typed. */
type NewPaperFormResult = {
	values: NewPaperValues;
	errors: NewPaperErrors;
	/** The database's own sentence when it refused the paper, shown as a toast. */
	flash?: Flash;
};

/**
 * The committee, its paper settings and the reader's seat, for a delegate who
 * may start a paper in it: a delegate's own seat, never an observer's
 * (`docs/committee-papers.md`, section 5), with the kinds of paper the
 * committee writes. Anybody else is told the page does not exist, as
 * `requireRoomWatcher` tells somebody who may not see the committee at all.
 *
 * `error` works by throwing, so this either returns or never returns at all.
 */
async function requirePaperStarter(
	locals: App.Locals,
	url: URL,
	params: { slug: string; committeeSlug: string }
) {
	const { user, conference, committee } = await requireRoomWatcher(
		locals,
		url,
		params.slug,
		params.committeeSlug
	);

	const [settings, mySeat] = await Promise.all([
		readPaperCommittee(locals.supabase, committee.id),
		readMyPaperSeat(locals.supabase, committee.id, user.id)
	]);

	const kinds = startablePaperKinds(settings);

	if (mySeat === null || mySeat.isObserver || kinds.length === 0) {
		error(404, 'This page does not exist.');
	}

	return { conference, committee, settings, kinds };
}

/**
 * The working papers a new draft resolution may be based on, each with the
 * words beside its box. None where the committee writes no draft resolutions.
 */
async function listBasedOnChoices(
	supabase: App.Locals['supabase'],
	committeeId: string,
	kinds: PaperKind[]
) {
	if (!kinds.includes('draft_resolution')) return [];

	const workingPapers = await listIntroducedWorkingPapers(supabase, committeeId);

	return workingPapers.map((paper) => ({ id: paper.id, label: paperSourceLabel(paper) }));
}

/**
 * The form for a new paper, on the first kind the committee offers and the
 * topic on the agenda.
 */
export const load: PageServerLoad = async ({ params, url, locals }) => {
	const { conference, committee, settings, kinds } = await requirePaperStarter(locals, url, params);

	return {
		conference: { slug: conference.slug, name: conference.name },
		committee: { slug: committee.slug, heading: committeeHeading(committee) },
		// For the breadcrumb: "Resolutions", or "Directives" in a crisis committee.
		papersTitle: papersPageTitle(settings.format),
		// Only the kinds the committee's format offers, in the order `startablePaperKinds` gives.
		kindOptions: kinds.map((kind) => ({ value: kind, label: statusLabel('paper_kind', kind) })),
		topics: settings.topics,
		basedOnChoices: await listBasedOnChoices(locals.supabase, committee.id, kinds),
		values: {
			kind: kinds[0],
			title: '',
			topic: presetTopic(settings),
			sourcePaperIds: []
		} satisfies NewPaperValues
	};
};

export const actions: Actions = {
	/** "Start writing": start the paper with the reader's seat as its lead, and open it. */
	start: async ({ params, url, request, locals }) => {
		// A form action is its own request, so who may start a paper is asked again.
		const { committee, settings, kinds } = await requirePaperStarter(locals, url, params);
		const formData = await request.formData();
		const { values, errors } = readNewPaperForm(formData, settings.topics, kinds);

		if (errors.kind || errors.title || errors.topic) {
			return fail(400, { values, errors } satisfies NewPaperFormResult);
		}

		const started = await startPaper(locals.supabase, {
			committeeId: committee.id,
			kind: values.kind,
			title: values.title,
			topic: values.topic,
			sourcePaperIds: values.sourcePaperIds
		});

		if (started.refusal !== null) {
			const flash: Flash = { tone: 'error', message: started.refusal };
			return fail(400, { values, errors, flash } satisfies NewPaperFormResult);
		}

		redirect(303, committeePaperUrl(params.slug, params.committeeSlug, started.paperId));
	}
};
