/**
 * The "Needs you" lines about the conference's set-up coming undone after
 * publishing: committees without a chair or a free seat, no fees, days with
 * nothing on the programme, and position papers not yet handed in.
 *
 * Nothing here talks to Supabase or knows any Svelte. `dashboard-attention.ts`
 * chooses which phases draw each line.
 */

import { committeeHeading } from '$lib/committees';
import type { AttentionFacts, AttentionItem } from '$lib/dashboard-attention';
import { emptyProgrammeDays } from '$lib/dashboard-allocation';
import { formatLongDay, noonOfDay } from '$lib/dashboard-dates';
import { countOf } from '$lib/dashboard-words';
import {
	manageCommitteeUrl,
	manageCommitteesUrl,
	manageDocumentsUrl,
	manageFeesTabUrl,
	manageScheduleUrl
} from '$lib/urls';

/**
 * "DISEC has no chair", opening that committee, where chairs are invited; or
 * "2 committees have no chair", opening the committees list.
 */
export function noChairLines(facts: AttentionFacts): AttentionItem[] {
	const slug = facts.conference.slug;
	const withoutChair = facts.committees.filter((committee) => committee.chairNames.length === 0);

	if (withoutChair.length === 0) {
		return [];
	}

	// The committee's public page says this while nobody chairs it.
	const detail = 'Delegates see "Chairs to be announced".';

	if (withoutChair.length === 1) {
		const committee = withoutChair[0];

		return [
			{
				key: 'no-chair',
				title: `${committeeHeading(committee)} has no chair`,
				detail,
				actionLabel: 'Invite a chair',
				href: manageCommitteeUrl(slug, committee.id)
			}
		];
	}

	return [
		{
			key: 'no-chair',
			title: `${withoutChair.length} committees have no chair`,
			detail,
			actionLabel: 'Invite chairs',
			href: manageCommitteesUrl(slug)
		}
	];
}

/** One line per committee with no free seat, since each is fixed in its own editor. */
export function fullCommitteeLines(facts: AttentionFacts): AttentionItem[] {
	const fullCommittees = facts.committees.filter((committee) => {
		const seats = committee.seatCounts;

		return seats.available - seats.filled - seats.reserved <= 0;
	});

	return fullCommittees.map((committee) => ({
		key: `full-committee-${committee.id}`,
		title: `${committee.name} has no free seats`,
		detail: 'Nobody else can apply for it.',
		actionLabel: 'Add seats',
		href: manageCommitteeUrl(facts.conference.slug, committee.id)
	}));
}

/** "No fees yet", while no fee exists and the organiser does not collect money by hand. */
export function noFeeLines(facts: AttentionFacts): AttentionItem[] {
	if (facts.hasFeesOrManualCollection) {
		return [];
	}

	return [
		{
			key: 'no-fees',
			title: 'No fees yet: delegates will not be invoiced',
			detail: 'Set a fee, or say that you collect payments yourself.',
			actionLabel: 'Set fees',
			// The "Fees" tab by name: a published conference's fees page opens on
			// "Invoices" by itself (`$lib/fees-tabs.ts`).
			href: manageFeesTabUrl(facts.conference.slug, 'fees')
		}
	];
}

/**
 * "Sunday 15 November has no events" for a conference day nothing is on, or
 * "The schedule is empty" when nothing is on at all.
 */
export function emptyProgrammeLines(facts: AttentionFacts): AttentionItem[] {
	const { slug, startDate, endDate, timezone } = facts.conference;
	const eventStarts = facts.allocation.eventStarts;
	const href = manageScheduleUrl(slug);

	if (eventStarts.length === 0) {
		return [
			{
				key: 'empty-schedule',
				title: 'The schedule is empty',
				detail: 'Delegates see no programme at all.',
				actionLabel: 'Add the first event',
				href
			}
		];
	}

	const emptyDays = emptyProgrammeDays(startDate, endDate, eventStarts, timezone);

	if (emptyDays.length === 0) {
		return [];
	}

	if (emptyDays.length === 1) {
		// A day is a date with no time, so it is written as noon in UTC to stay that day.
		const day = formatLongDay(noonOfDay(emptyDays[0]), 'UTC');

		return [
			{
				key: 'empty-day',
				title: `${day} has no events`,
				detail: 'Delegates see an empty day on the programme.',
				actionLabel: 'Schedule',
				href
			}
		];
	}

	return [
		{
			key: 'empty-day',
			title: `${emptyDays.length} conference days have no events`,
			detail: 'Delegates see empty days on the programme.',
			actionLabel: 'Schedule',
			href
		}
	];
}

/** "3 position papers are missing", while the conference asks for them. */
export function missingPaperLines(facts: AttentionFacts): AttentionItem[] {
	const { slug, timezone, positionPaperRequired, positionPaperDeadline } = facts.conference;

	if (!positionPaperRequired) {
		return [];
	}

	let missing = 0;

	for (const committee of facts.committees) {
		missing += Math.max(0, committee.seatCounts.filled - committee.positionPaperCount);
	}

	if (missing === 0) {
		return [];
	}

	const detail =
		positionPaperDeadline === null
			? 'No deadline is set.'
			: `The deadline is ${formatLongDay(positionPaperDeadline, timezone)}.`;

	return [
		{
			key: 'missing-papers',
			title: `${countOf(missing, 'position paper is', 'position papers are')} missing`,
			detail,
			actionLabel: 'Position papers',
			href: manageDocumentsUrl(slug, { tab: 'papers', paper: 'missing' })
		}
	];
}
