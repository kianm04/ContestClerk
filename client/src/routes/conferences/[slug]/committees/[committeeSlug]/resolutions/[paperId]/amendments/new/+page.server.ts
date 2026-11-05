import { error, fail, redirect } from '@sveltejs/kit';
import { amendmentCards } from '$lib/amendment-cards';
import { committeeHeading } from '$lib/committees';
import { authorWords, paperKindAndNumber, papersPageTitle } from '$lib/committee-papers';
import type { Flash } from '$lib/flash';
import {
	amendmentName,
	isAmendable,
	proposedMessage,
	readAmendmentForm,
	readAmendmentToAmendmentForm,
	type AmendmentFormErrors,
	type AmendmentFormValues,
	type PaperAmendment
} from '$lib/paper-amendments';
import { committeePaperUrl } from '$lib/urls';
import { requireRoomWatcher } from '$lib/server/access';
import {
	readCommitteePaper,
	readMyPaperSeat,
	readPaperCommittee
} from '$lib/server/committee-papers';
import { setFlash } from '$lib/server/flash';
import { renderMarkdown } from '$lib/server/markdown';
import { atAmendment } from '$lib/server/paper-amendment-actions';
import {
	proposeAmendment,
	readAmendmentRules,
	readPaperAmendments,
	readPaperVersions
} from '$lib/server/paper-amendments';
import type { Actions, PageServerLoad } from './$types';

/** What `propose` answers when it refuses, so the form keeps what was typed. */
type AmendmentFormResult = {
	values: AmendmentFormValues;
	errors: AmendmentFormErrors;
	/** The database's own sentence when it refused the amendment, shown as a toast. */
	flash?: Flash;
};

/**
 * The draft, its committee and what the form needs, for a delegate who may
 * propose an amendment to it: an introduced draft resolution of the
 * committee, and a delegate's own seat, never an observer's
 * (`docs/committee-papers.md`, section 5). `?amend=` names the amendment
 * "Amend this amendment" changes, which has to be one that can be amended.
 * Anybody else, and anything else, is told the page does not exist.
 *
 * `error` works by throwing, so this either returns or never returns at all.
 */
async function requireAmendmentProposer(
	locals: App.Locals,
	url: URL,
	params: { slug: string; committeeSlug: string; paperId: string }
) {
	const { user, conference, committee } = await requireRoomWatcher(
		locals,
		url,
		params.slug,
		params.committeeSlug
	);
	const supabase = locals.supabase;
	const [paper, mySeat, settings, rules] = await Promise.all([
		readCommitteePaper(supabase, committee.id, params.paperId),
		readMyPaperSeat(supabase, committee.id, user.id),
		readPaperCommittee(supabase, committee.id),
		readAmendmentRules(supabase, committee.id)
	]);
	const isIntroducedDraft = paper?.kind === 'draft_resolution' && paper.status === 'introduced';

	if (paper === null || !isIntroducedDraft || mySeat === null || mySeat.isObserver) {
		error(404, 'This page does not exist.');
	}

	const [versions, amendments] = await Promise.all([
		readPaperVersions(supabase, paper.id),
		readPaperAmendments(supabase, paper.id)
	]);
	const parentId = url.searchParams.get('amend');
	let parent: PaperAmendment | null = null;

	if (parentId !== null) {
		parent = amendments.find((amendment) => amendment.id === parentId) ?? null;
		if (parent === null || !isAmendable(parent, rules)) error(404, 'This page does not exist.');
	}

	return { conference, committee, settings, rules, paper, versions, amendments, parent, mySeat };
}

/**
 * The form for a new amendment: "change a clause" to begin with, as most
 * amendments are; or, for "Amend this amendment", the amendment's words to
 * change.
 */
export const load: PageServerLoad = async ({ params, url, locals }) => {
	const { conference, committee, settings, rules, paper, versions, amendments, parent, mySeat } =
		await requireAmendmentProposer(locals, url, params);

	// The amendment being amended, put into words as its card puts it.
	const parentCard =
		parent === null
			? null
			: amendmentCards(amendments, {
					versions,
					rules,
					reader: { seatId: mySeat.id, isObserver: false },
					sponsorsWord: authorWords(settings.paperWords, paper.kind).heading.toLowerCase(),
					timeZone: conference.timezone,
					render: renderMarkdown
				}).find((card) => card.id === parent.id);

	return {
		conference: { slug: conference.slug, name: conference.name },
		committee: { slug: committee.slug, heading: committeeHeading(committee) },
		// For the breadcrumb: "Resolutions", or "Directives" in a crisis committee.
		papersTitle: papersPageTitle(settings.format),
		paper: { id: paper.id, name: paperKindAndNumber(paper), title: paper.title },
		// The text as it stands, which the clause dropdown lists.
		content: versions.at(-1)?.content ?? { preamble: [], operative: [] },
		isPreambleAmendable: rules.isPreambleAmendable,
		parent:
			parent === null || !parentCard
				? null
				: { id: parent.id, name: amendmentName(parent), sentenceHtml: parentCard.sentenceHtml },
		values: {
			action: 'change',
			clause: '',
			text: parent?.textMarkdown ?? ''
		} satisfies AmendmentFormValues
	};
};

export const actions: Actions = {
	/** "Propose amendment": propose it from the reader's seat, and show it beside its clause. */
	propose: async ({ params, url, request, locals, cookies }) => {
		// A form action is its own request, so who may propose one is asked again.
		const { paper, parent } = await requireAmendmentProposer(locals, url, params);
		const formData = await request.formData();
		const { values, errors, proposal } =
			parent === null
				? readAmendmentForm(formData)
				: readAmendmentToAmendmentForm(formData, parent);

		if (proposal === null) return fail(400, { values, errors } satisfies AmendmentFormResult);

		const proposed = await proposeAmendment(
			locals.supabase,
			paper.id,
			proposal,
			parent?.id ?? null
		);

		if (proposed.refusal !== null) {
			const flash: Flash = { tone: 'error', message: proposed.refusal };
			return fail(400, { values, errors, flash } satisfies AmendmentFormResult);
		}

		// Read once more for the number it took and where it went: the sponsors, or its support.
		const amendments = await readPaperAmendments(locals.supabase, paper.id);
		const amendment = amendments.find((each) => each.id === proposed.amendmentId);
		const pageUrl = committeePaperUrl(params.slug, params.committeeSlug, paper.id);

		if (amendment !== undefined) {
			setFlash(cookies, { tone: 'success', message: proposedMessage(amendment) });
		}

		redirect(303, amendment === undefined ? pageUrl : atAmendment(pageUrl, amendment.sequence));
	}
};
