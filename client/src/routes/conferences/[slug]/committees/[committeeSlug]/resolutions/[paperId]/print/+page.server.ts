import { error } from '@sveltejs/kit';
import { recordedAmendments } from '$lib/amendment-record';
import { hasPassed } from '$lib/committee-papers';
import { committeeHeading } from '$lib/committees';
import { adoptedSentence, printedLine, recordFacts, recordName } from '$lib/paper-votes';
import { resolutionHeading } from '$lib/resolution-heading';
import { withOpeningPhrasesMarked } from '$lib/resolution-reading';
import { committeePaperUrl, committeeUrl } from '$lib/urls';
import { requireRoomWatcher } from '$lib/server/access';
import {
	readCommitteePaper,
	readPaperCommittee,
	readPaperPeople
} from '$lib/server/committee-papers';
import { clauseAnchoredHtml } from '$lib/server/introduced-draft';
import { renderMarkdown } from '$lib/server/markdown';
import { readPaperAmendments, readPaperVersions } from '$lib/server/paper-amendments';
import { readAmendmentVotes, readPaperDecidedAt, readPaperVote } from '$lib/server/paper-votes';
import type { PageServerLoad } from './$types';

/** The kinds the committee adopts as a whole, which have a record copy once passed. */
const RECORDED_KINDS = ['draft_resolution', 'committee_directive'];

/**
 * The record copy of a passed paper (`docs/committee-papers.md`, section 6,
 * "The record"): what the committee adopted, how and when, laid out for
 * paper. The same people may read it as the paper's own page
 * (`requireRoomWatcher`, then Row Level Security on the paper), and only
 * once it has passed; anything else is a page that does not exist.
 */
export const load: PageServerLoad = async ({ params, url, locals }) => {
	const { conference, committee } = await requireRoomWatcher(
		locals,
		url,
		params.slug,
		params.committeeSlug
	);
	const supabase = locals.supabase;
	const paper = await readCommitteePaper(supabase, committee.id, params.paperId);

	if (paper === null || !RECORDED_KINDS.includes(paper.kind) || !hasPassed(paper)) {
		error(404, 'This page does not exist.');
	}

	// None of these needs another's answer, so they run side by side.
	const [settings, people, vote, decidedAt, versions, amendments] = await Promise.all([
		readPaperCommittee(supabase, committee.id),
		readPaperPeople(supabase, paper, null),
		readPaperVote(supabase, paper.id),
		readPaperDecidedAt(supabase, paper.id),
		readPaperVersions(supabase, paper.id),
		readPaperAmendments(supabase, paper.id)
	]);
	const amendmentVotes = await readAmendmentVotes(
		supabase,
		amendments.map((amendment) => amendment.id)
	);
	// Amendments make new versions of the text and leave the paper's Markdown
	// as submitted, so an amended text is drawn from its latest version.
	const latest = versions.at(-1);
	const bodyHtml =
		latest !== undefined && latest.versionNumber > 1
			? clauseAnchoredHtml(latest.content)
			: renderMarkdown(withOpeningPhrasesMarked(paper.kind, paper.body));
	const heading = resolutionHeading({
		committee,
		topic: paper.topic,
		people,
		words: settings.paperWords
	});
	const timeZone = conference.timezone;

	return {
		name: recordName(paper),
		title: paper.title,
		adopted: adoptedSentence(decidedAt ?? paper.updatedAt, vote, timeZone),
		facts: recordFacts(conference.name, heading),
		opening: heading.opening,
		bodyHtml,
		amendments: recordedAmendments(amendments, { versions, votes: amendmentVotes, timeZone }),
		printed: printedLine(new Date(), timeZone),
		// For the breadcrumb over the copy on screen, and the tab's title.
		conferenceName: conference.name,
		committeeHeading: committeeHeading(committee),
		committeeHref: committeeUrl(params.slug, params.committeeSlug),
		paperHref: committeePaperUrl(params.slug, params.committeeSlug, paper.id)
	};
};
