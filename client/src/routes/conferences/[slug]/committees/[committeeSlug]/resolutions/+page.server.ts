import { committeeHeading } from '$lib/committees';
import {
	noPassedPaperSentence,
	paperSections,
	papersPageTitle,
	startablePaperKinds
} from '$lib/committee-papers';
import { publishedPressReleases } from '$lib/crisis-papers';
import { requireRoomWatcher } from '$lib/server/access';
import {
	listCommitteePapers,
	readMyPaperSeat,
	readPaperCommittee
} from '$lib/server/committee-papers';
import type { PageServerLoad } from './$types';

/**
 * The committee's papers (`docs/committee-papers.md`, section 6), in the four
 * sections a delegate needs them in, and a crisis committee's press releases.
 *
 * The same people may open it as the live view: a delegate of this committee
 * or anybody on the conference's staff. Which papers each of them sees is Row
 * Level Security's decision, so a paper still being written shows only to the
 * seats on it.
 */
export const load: PageServerLoad = async ({ params, url, locals }) => {
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

	const papers = await listCommitteePapers(locals.supabase, committee.id, mySeat?.id ?? null);

	return {
		conference: { slug: conference.slug, name: conference.name },
		committee: { slug: committee.slug, heading: committeeHeading(committee) },
		// "Resolutions", or "Directives" in a crisis committee.
		title: papersPageTitle(settings.format),
		sections: paperSections(papers),
		passedSentence: noPassedPaperSentence(settings.format),
		// What the crisis staff published to the room, in a crisis committee alone.
		pressReleases: settings.format === 'crisis' ? publishedPressReleases(papers) : null,
		// Only a seat can be on a paper, so a chair has no papers of their own.
		hasSeat: mySeat !== null,
		// An observer may sign a paper but never start one (section 5).
		canStart: mySeat !== null && !mySeat.isObserver && startablePaperKinds(settings).length > 0
	};
};
