import { error, fail, redirect } from '@sveltejs/kit';
import { committeeHeading } from '$lib/committees';
import { paperTextLabel } from '$lib/committee-papers';
import {
	answeredMessage,
	answerChoices,
	crisisPaperMetaLine,
	crisisPanel,
	isAnsweredByCrisisStaff,
	isWaitingForCrisisStaff,
	readAnswerForm
} from '$lib/crisis-papers';
import type { Flash } from '$lib/flash';
import { withOpeningPhrasesMarked } from '$lib/resolution-reading';
import { crisisDeskUrl } from '$lib/urls';
import { readCommitteePaper, readPaperPeople } from '$lib/server/committee-papers';
import { answerDirective, readCrisisAnswer, requireCrisisStaff } from '$lib/server/crisis-desk';
import { setFlash } from '$lib/server/flash';
import { renderMarkdown } from '$lib/server/markdown';
import type { Actions, PageServerLoad } from './$types';

/**
 * The crisis staff, and one paper they answer or have answered. A paper they
 * may not read, one still with its authors or the dais, or one of another
 * kind is a page that does not exist. Every action asks this again.
 */
async function requireCrisisPaper(
	locals: App.Locals,
	url: URL,
	params: { slug: string; committeeSlug: string; paperId: string }
) {
	const access = await requireCrisisStaff(locals, url, params);
	const paper = await readCommitteePaper(locals.supabase, access.committee.id, params.paperId);

	if (
		paper === null ||
		!(isWaitingForCrisisStaff(paper) || isAnsweredByCrisisStaff(paper.status))
	) {
		error(404, 'This page does not exist.');
	}

	return { ...access, paper };
}

/**
 * One directive or press release for the crisis staff (section 6): its text,
 * who wrote it, and the answer, still to give or given.
 */
export const load: PageServerLoad = async ({ locals, url, params }) => {
	const { conference, committee, paper } = await requireCrisisPaper(locals, url, params);
	const timeZone = conference.timezone;

	const [people, answer] = await Promise.all([
		readPaperPeople(locals.supabase, paper, null),
		readCrisisAnswer(locals.supabase, paper.id)
	]);
	// The characters who wrote it; the seats that only signed are not its authors.
	const characters = people
		.filter((person) => person.role === 'author')
		.map((person) => person.seatName);

	return {
		conference: { slug: conference.slug, name: conference.name },
		committee: { slug: committee.slug, heading: committeeHeading(committee) },
		paper: { id: paper.id, kind: paper.kind, title: paper.title },
		metaLine: crisisPaperMetaLine(paper, characters, answer, timeZone),
		textLabel: paperTextLabel(paper.kind),
		// A committee directive's opening phrases styled, as the committee read it.
		bodyHtml: renderMarkdown(withOpeningPhrasesMarked(paper.kind, paper.body)),
		// The buttons while it waits; the answer given, shown as its authors see it, once answered.
		choices: isWaitingForCrisisStaff(paper) ? answerChoices(paper.kind) : [],
		answered: answer === null ? null : crisisPanel(paper, answer, true, timeZone)
	};
};

export const actions: Actions = {
	/** "Carry out", "Publish" or "Refuse", with the answer typed, and back to the list. */
	answer: async ({ locals, url, params, request, cookies }) => {
		const { paper } = await requireCrisisPaper(locals, url, params);
		const form = readAnswerForm(await request.formData(), paper.kind);

		if (form.error !== null) return fail(400, { answer: form.answer, error: form.error });

		const change = await answerDirective(locals.supabase, paper.id, form.outcome, form.answer);

		if (change.refusal !== null) {
			const flash: Flash = { tone: 'error', message: change.refusal };

			return fail(400, { answer: form.answer, error: null, flash });
		}

		setFlash(cookies, { tone: 'success', message: answeredMessage(form.outcome, paper.title) });
		redirect(303, crisisDeskUrl(params.slug, params.committeeSlug));
	}
};
