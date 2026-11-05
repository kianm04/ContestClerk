/**
 * What the Published page (`/manage/[slug]/published`) says to an organiser
 * who has just made their conference public (the manage redesign): whether
 * people can apply now, and what is worth doing next.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import type { ResolvedPathname } from '$app/types';
import { formatConferenceDay, isAcceptingApplications, type Conference } from '$lib/conferences';
import { manageDocumentsUrl, manageScheduleUrl, manageTeamUrl } from '$lib/urls';

/** The parts of a conference the headline reads. */
type HeadlineConference = Pick<
	Conference,
	| 'name'
	| 'status'
	| 'timezone'
	| 'applicationOpenMode'
	| 'applicationsOpenAt'
	| 'applicationsCloseAt'
>;

/** The big title and the sentence under it. */
export type PublishedHeadline = {
	title: string;
	sentence: string;
};

/** One row of "Good next steps". */
export type PublishedNextStep = {
	/** Tells the rows apart, for the `{#each}` key. */
	key: 'chairs' | 'schedule' | 'documents';
	title: string;
	detail: string;
	/** The words of the link, which is the name of the page it opens. */
	linkLabel: string;
	href: ResolvedPathname;
};

/** What the page says once applications are no longer, or not yet, being taken. */
function notTakingApplicationsSentence(conference: HeadlineConference, now: Date): string {
	const opensAt = conference.applicationsOpenAt;

	// The organiser chose to open applications by hand and has not yet, so
	// there is no day to name and nothing has closed either.
	if (opensAt === null && conference.applicationOpenMode === 'manual') {
		return 'Anyone with the link can read the page. Applications are not open yet.';
	}

	if (opensAt !== null && new Date(opensAt).getTime() > now.getTime()) {
		const openingDay = formatConferenceDay(opensAt, conference.timezone);

		return `Anyone with the link can read the page. Applications open on ${openingDay}.`;
	}

	return 'Anyone with the link can read the page. Applications have closed.';
}

/**
 * "Northbridge MUN 2027 is open for applications." while people can apply,
 * and "Northbridge MUN 2027 is public." before or after, with a sentence
 * saying until when, or from when, they can.
 */
export function publishedHeadline(conference: HeadlineConference, now: Date): PublishedHeadline {
	if (!isAcceptingApplications(conference, now)) {
		return {
			title: `${conference.name} is public.`,
			sentence: notTakingApplicationsSentence(conference, now)
		};
	}

	const title = `${conference.name} is open for applications.`;

	if (conference.applicationsCloseAt === null) {
		return { title, sentence: 'Anyone with the link can read the page and apply.' };
	}

	const closingDay = formatConferenceDay(conference.applicationsCloseAt, conference.timezone);

	return {
		title,
		sentence: `Anyone with the link can read the page and apply until ${closingDay}.`
	};
}

/**
 * "Good next steps" after publishing: chairs for the committees that have
 * none, the schedule and the documents. `withoutChairSentence` is
 * `committeesWithoutChairSentence` from `$lib/publish-review.ts`, and `null`
 * leaves the chairs row out because every committee has one.
 */
export function publishedNextSteps(
	slug: string,
	withoutChairSentence: string | null
): PublishedNextStep[] {
	const steps: PublishedNextStep[] = [];

	if (withoutChairSentence !== null) {
		steps.push({
			key: 'chairs',
			title: 'Invite your chairs',
			detail: withoutChairSentence,
			linkLabel: 'Team',
			href: manageTeamUrl(slug)
		});
	}

	steps.push(
		{
			key: 'schedule',
			title: 'Build the schedule',
			detail: 'Delegates see it on the conference page.',
			linkLabel: 'Schedule',
			href: manageScheduleUrl(slug)
		},
		{
			key: 'documents',
			title: 'Upload the rules of procedure',
			detail: 'And a background guide for each committee.',
			linkLabel: 'Documents',
			href: manageDocumentsUrl(slug)
		}
	);

	return steps;
}
