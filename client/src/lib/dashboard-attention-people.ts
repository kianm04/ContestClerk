/**
 * The "Needs you" lines about people waiting for something: applications and
 * delegation requests without an answer, delegations short of seats, and
 * delegates marked absent on a conference day.
 *
 * Nothing here talks to Supabase or knows any Svelte. `dashboard-attention.ts`
 * chooses which phases draw each line.
 */

import { EMPTY_ALLOCATION_QUERY } from '$lib/allocation';
import { committeeHeading, type ManagedCommittee } from '$lib/committees';
import type { AttentionFacts, AttentionItem } from '$lib/dashboard-attention';
import type { DelegationRequest } from '$lib/dashboard-waiting';
import { countOf, listInWords } from '$lib/dashboard-words';
import { formatRelativeTime, formatTimeOfDay } from '$lib/dates';
import { EMPTY_PARTICIPANT_QUERY } from '$lib/participants';
import {
	manageAllocationUrl,
	manageApplicationsUrl,
	manageDelegationReviewUrl,
	manageDelegationsUrl,
	manageParticipantsUrl
} from '$lib/urls';

/** How many absent delegates get a line each before they are counted on one line. */
const ABSENTEE_LINE_LIMIT = 3;

/**
 * "came in 6 days ago", or "came in on 12 Feb 2026" once `formatRelativeTime`
 * gives the date itself rather than how long ago it was. The "Decide 4
 * applications" task on `/home` (`$lib/tasks.ts`) reads it too, so the two pages
 * say it the same way.
 */
export function cameInText(moment: string, now: Date, timezone: string): string {
	const relative = formatRelativeTime(moment, now, timezone);

	if (relative === 'Just now') {
		return 'came in just now';
	}

	if (relative.endsWith(' ago')) {
		return `came in ${relative}`;
	}

	return `came in on ${relative}`;
}

/** "4 applications are waiting for a decision", with when the oldest came in. */
export function waitingApplicationLines(facts: AttentionFacts): AttentionItem[] {
	const count = facts.stats.applicationsToReview;

	if (count === 0) {
		return [];
	}

	const oldest = facts.waiting.oldestApplicationAt;
	let detail: string | null = null;

	if (oldest !== null) {
		const subject = count === 1 ? 'It' : 'The oldest';

		detail = `${subject} ${cameInText(oldest, facts.now, facts.conference.timezone)}.`;
	}

	return [
		{
			key: 'applications',
			title: `${countOf(count, 'application is', 'applications are')} waiting for a decision`,
			detail,
			actionLabel: 'Review applications',
			// The applications page opens on the ones under review.
			href: manageApplicationsUrl(facts.conference.slug)
		}
	];
}

/** "A delegation request from Andrew Blake.", or nothing when no head is named. */
function requestDetail(request: DelegationRequest): string | null {
	if (request.headNames.length === 0) {
		return null;
	}

	return `A delegation request from ${listInWords(request.headNames)}.`;
}

/**
 * One request is named and opened on its own ("Harbour View College asked for
 * 3 seats"); several are counted and open the requests list.
 */
export function delegationRequestLines(facts: AttentionFacts): AttentionItem[] {
	const requests = facts.waiting.delegationRequests;
	const slug = facts.conference.slug;

	if (requests.length === 0) {
		return [];
	}

	if (requests.length === 1) {
		const request = requests[0];
		const seats = countOf(request.requestedSeats, 'seat', 'seats');

		return [
			{
				key: 'delegation-request',
				title: `${request.institutionName ?? request.name} asked for ${seats}`,
				detail: requestDetail(request),
				actionLabel: 'Open request',
				href: manageDelegationReviewUrl(slug, request.id)
			}
		];
	}

	// The requests come oldest first.
	const oldest = requests[0];

	return [
		{
			key: 'delegation-requests',
			title: `${requests.length} delegation requests are waiting`,
			detail: `The oldest is from ${oldest.institutionName ?? oldest.name}.`,
			actionLabel: 'Review requests',
			href: manageDelegationsUrl(slug)
		}
	];
}

/** Seats on offer that nobody holds and nobody has been promised. */
function freeSeatCount(committee: ManagedCommittee): number {
	const seats = committee.seatCounts;

	return Math.max(0, seats.available - seats.filled - seats.reserved);
}

/** "1 seat is still free in DISEC.", "5 seats are still free in 2 committees." */
function freeSeatsText(committees: ManagedCommittee[]): string {
	const committeesWithFreeSeats = committees.filter((committee) => freeSeatCount(committee) > 0);
	let freeSeats = 0;

	for (const committee of committeesWithFreeSeats) {
		freeSeats += freeSeatCount(committee);
	}

	if (freeSeats === 0) {
		return 'No seat is free: add seats to a committee first.';
	}

	const seats = countOf(freeSeats, 'seat is', 'seats are');

	if (committeesWithFreeSeats.length === 1) {
		return `${seats} still free in ${committeeHeading(committeesWithFreeSeats[0])}.`;
	}

	return `${seats} still free in ${committeesWithFreeSeats.length} committees.`;
}

/** "Harbour View College has 2 of its 3 seats", with where seats are still free. */
export function shortDelegationLines(facts: AttentionFacts): AttentionItem[] {
	const shortDelegations = facts.allocation.shortDelegations;

	if (shortDelegations.length === 0) {
		return [];
	}

	const detail = freeSeatsText(facts.committees);
	const href = manageAllocationUrl(facts.conference.slug, {
		...EMPTY_ALLOCATION_QUERY,
		state: 'free'
	});

	if (shortDelegations.length === 1) {
		const delegation = shortDelegations[0];
		const given = `${delegation.givenSeats} of its ${delegation.requestedSeats} seats`;

		return [
			{
				key: 'short-delegation',
				title: `${delegation.name} has ${given}`,
				detail,
				actionLabel: 'Give them a seat',
				href
			}
		];
	}

	return [
		{
			key: 'short-delegations',
			title: `${shortDelegations.length} delegations are short of seats`,
			detail,
			actionLabel: 'Give them seats',
			href
		}
	];
}

/** Each absent delegate together with the room that marked them. */
type AbsenteeInRoom = {
	committeeName: string;
	fullName: string | null;
	seatName: string;
	markedAt: string;
};

/** Every absent delegate of every sitting room, in the rooms' order. */
function absenteesInRooms(facts: AttentionFacts): AbsenteeInRoom[] {
	return facts.rooms.flatMap((room) =>
		room.absentees.map((absentee) => ({ committeeName: room.committeeName, ...absentee }))
	);
}

/**
 * "Zoe Adams is marked absent", one line each for the first few, or one line
 * counting them all when there are more. Each opens the participants list
 * searched for that delegate, where their details are.
 */
export function absenteeLines(facts: AttentionFacts): AttentionItem[] {
	const absentees = absenteesInRooms(facts);
	const slug = facts.conference.slug;

	if (absentees.length > ABSENTEE_LINE_LIMIT) {
		const rooms = new Set(absentees.map((absentee) => absentee.committeeName));

		return [
			{
				key: 'absentees',
				title: `${absentees.length} delegates are marked absent`,
				detail: `In ${listInWords([...rooms])}, at the latest roll call.`,
				actionLabel: 'Participants',
				href: manageParticipantsUrl(slug)
			}
		];
	}

	return absentees.map((absentee) => {
		const markedAt = formatTimeOfDay(absentee.markedAt, facts.conference.timezone);
		const who = absentee.fullName ?? absentee.seatName;

		return {
			key: `absent-${absentee.committeeName}-${absentee.seatName}`,
			title: `${who} is marked absent`,
			detail: `${absentee.committeeName} · ${absentee.seatName} · since roll call at ${markedAt}`,
			actionLabel: 'Participants',
			href: manageParticipantsUrl(slug, { ...EMPTY_PARTICIPANT_QUERY, q: absentee.fullName ?? '' })
		};
	});
}
