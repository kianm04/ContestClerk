/**
 * Everything one conference's row on `/manage` says (artboard Main of the
 * manage redesign): its dates, where it is in its life on a five-step bar, two
 * figures, the one thing that wants doing, and a button to do it.
 *
 * The phase comes from `conferencePhase` in `$lib/conference-phase.ts`, the
 * same answer the dashboard is organised around, so a row and the dashboard it
 * opens never disagree about where a conference is. The figures were counted
 * on the server by `$lib/server/manage-list.ts`.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import type { ResolvedPathname } from '$app/types';
import type { Conference } from '$lib/conferences';
import { conferencePhase, type ConferencePhase } from '$lib/conference-phase';
import type { ConferenceFigures, ManagedConferenceSummary } from '$lib/manage';
import {
	conferenceDateBlock,
	conferenceDayOfDays,
	dayAndFullMonth,
	startsInWords,
	type DateBlock
} from '$lib/manage-list-dates';
import { formatMoney } from '$lib/money';
import {
	createResumeUrl,
	manageAllocationUrl,
	manageApplicationsUrl,
	manageConferenceUrl
} from '$lib/urls';

/** The five phases in order, as the bar under a row's name counts them. */
const PHASES: ConferencePhase[] = [
	'setup',
	'applications',
	'allocation',
	'conference-days',
	'after'
];

/** The word in bold after the bar, one for each phase in `PHASES`. */
const PHASE_NAMES: Record<ConferencePhase, string> = {
	setup: 'Set up',
	applications: 'Applications',
	allocation: 'Seats',
	'conference-days': 'Conference',
	after: 'After'
};

/** One figure beside a row: "38" over "applications". */
export type ListFigure = {
	value: string;
	label: string;
};

/** The one button at the right of a row, and where it goes. */
export type ListAction = {
	label: string;
	href: ResolvedPathname;
};

/** Everything one row draws. */
export type ConferenceListRow = {
	id: string;
	/** What the row's delete form sends, so the action can find the conference again. */
	slug: string;
	name: string;
	/**
	 * Where the name goes: the dashboard, or a draft's step to continue. `null`
	 * for a conference the reader is not on the team of, which is named only.
	 */
	nameHref: ResolvedPathname | null;
	dateBlock: DateBlock;
	/** "Northbridge MUN Society · London · starts in 3 days". */
	subline: string;
	/** 1 to 5: how many segments of the bar are filled. */
	phaseNumber: number;
	/** The phase in bold after the bar: "Applications". */
	phaseName: string;
	/** What the phase is doing, after the name: "open until 25 October". */
	phaseDetail: string;
	/** Two, or none for a conference the reader is not on the team of. */
	figures: ListFigure[];
	/** The one sentence about what wants doing, or `null` when nothing does. */
	attention: string | null;
	/** The button, or `null` for a conference the reader is not on the team of. */
	action: ListAction | null;
	/** Whether the reader may open the conference; the row says "Not on the team" when not. */
	isOnTeam: boolean;
	/**
	 * Whether the row offers "Delete". Only a draft does: nobody has applied to
	 * it yet, and the database refuses to delete anything else.
	 */
	isDeletable: boolean;
};

/** "1 seat", "3 seats": a count with its noun. */
function countOf(count: number, singular: string, plural: string): string {
	return `${count} ${count === 1 ? singular : plural}`;
}

/** "22 of 80" over "seats held". */
function seatsHeldFigure(figures: ConferenceFigures): ListFigure {
	return { value: `${figures.heldSeatCount} of ${figures.seatCount}`, label: 'seats held' };
}

/** "Northbridge MUN Society · London · starts in 3 days", leaving out whatever is empty. */
function sublineOf(conference: Conference, phase: ConferencePhase, now: Date): string {
	let when = '';

	if (phase === 'setup') {
		when = 'draft, not public';
	} else if (phase === 'conference-days') {
		when = conferenceDayOfDays(conference, now);
	} else if (phase !== 'after') {
		when = startsInWords(conference, now);
	}

	const parts = [conference.organizationName ?? '', conference.city ?? '', when];

	return parts.filter((part) => part !== '').join(' · ');
}

/** "opens on 5 October", "open until 25 October" or "open, no closing date". */
function applicationsDetail(conference: Conference, now: Date): string {
	const opensAt = conference.applicationsOpenAt;

	if (opensAt !== null && new Date(opensAt) > now) {
		return `opens on ${dayAndFullMonth(opensAt, conference.timezone)}`;
	}

	if (conference.applicationsCloseAt === null) {
		return 'open, no closing date';
	}

	return `open until ${dayAndFullMonth(conference.applicationsCloseAt, conference.timezone)}`;
}

/** The words after the phase's name. */
function phaseDetailOf(
	summary: ManagedConferenceSummary,
	phase: ConferencePhase,
	now: Date
): string {
	const conference = summary.conference;

	// A draft is set up in the creation flow (Trello fe3reN7Y), which keeps its
	// own place; the list only says that it is not finished.
	if (phase === 'setup') {
		return 'being set up';
	}

	if (phase === 'applications') {
		return applicationsDetail(conference, now);
	}

	if (phase === 'allocation') {
		return 'applications closed, seats being given';
	}

	if (phase === 'conference-days') {
		return conferenceDayOfDays(conference, now);
	}

	return conference.status === 'archived' ? 'archived' : 'ended';
}

/**
 * The two figures a phase cares about: committees and seats while it is set
 * up, applications and seats while they come in, and seats and fees after.
 */
function figuresOf(summary: ManagedConferenceSummary, phase: ConferencePhase): ListFigure[] {
	const figures = summary.figures;
	const committeeCount = summary.conference.committeeCount;

	if (phase === 'setup') {
		return [
			{ value: String(committeeCount), label: committeeCount === 1 ? 'committee' : 'committees' },
			{ value: String(figures.seatCount), label: figures.seatCount === 1 ? 'seat' : 'seats' }
		];
	}

	if (phase === 'applications') {
		const applicationsLabel = figures.applicationCount === 1 ? 'application' : 'applications';

		return [
			{ value: String(figures.applicationCount), label: applicationsLabel },
			seatsHeldFigure(figures)
		];
	}

	// A reader who may not read the invoices is shown the seats alone.
	if (figures.feesPaidCents === null) {
		return [seatsHeldFigure(figures)];
	}

	return [
		seatsHeldFigure(figures),
		{ value: formatMoney(figures.feesPaidCents, figures.currency), label: 'fees paid' }
	];
}

/** The sentence about the seats while they are being given, and its button. */
function seatsAttention(
	summary: ManagedConferenceSummary
): Pick<ConferenceListRow, 'attention' | 'action'> {
	const figures = summary.figures;
	const freeCount = figures.seatCount - figures.heldSeatCount;
	const slug = summary.conference.slug;

	if (figures.seatCount === 0) {
		return { attention: 'No seats on offer yet', action: dashboardAction(slug) };
	}

	if (freeCount <= 0) {
		return { attention: 'Every seat is held', action: dashboardAction(slug) };
	}

	return {
		attention: `${countOf(freeCount, 'seat', 'seats')} nobody holds yet`,
		action: {
			label: freeCount === 1 ? 'Give the seat' : 'Give seats',
			href: manageAllocationUrl(slug)
		}
	};
}

/** "Open dashboard", the button of a row with nothing more pressing. */
function dashboardAction(slug: string): ListAction {
	return { label: 'Open dashboard', href: manageConferenceUrl(slug) };
}

/** What wants doing, and the button that does it. */
function attentionOf(
	summary: ManagedConferenceSummary,
	phase: ConferencePhase,
	now: Date
): Pick<ConferenceListRow, 'attention' | 'action'> {
	const conference = summary.conference;
	const toReviewCount = summary.figures.toReviewCount;

	if (phase === 'setup') {
		// The creation flow decides for itself what is left, so one sentence
		// serves every draft and the button takes the organiser back there.
		const attention = 'Finish setting it up to go public';

		// A draft is finished in the creation flow, which sends it on to the
		// step it reached (Trello fe3reN7Y).
		return {
			attention,
			action: { label: 'Continue setup', href: createResumeUrl(conference.slug) }
		};
	}

	const opensAt = conference.applicationsOpenAt;

	if (phase === 'applications' && opensAt !== null && new Date(opensAt) > now) {
		const opensOn = dayAndFullMonth(opensAt, conference.timezone);

		return {
			attention: `Applications open on ${opensOn}`,
			action: dashboardAction(conference.slug)
		};
	}

	// Applications still waiting come first, before or after the window closes.
	const isTakingApplications = phase === 'applications' || phase === 'allocation';

	if (isTakingApplications && toReviewCount > 0) {
		return {
			attention: `${countOf(toReviewCount, 'application', 'applications')} to review`,
			action: { label: 'Review applications', href: manageApplicationsUrl(conference.slug) }
		};
	}

	if (phase === 'allocation') {
		return seatsAttention(summary);
	}

	return { attention: null, action: dashboardAction(conference.slug) };
}

/** Everything one conference's row on `/manage` draws, at the moment `now`. */
export function conferenceListRow(summary: ManagedConferenceSummary, now: Date): ConferenceListRow {
	const conference = summary.conference;
	const phase = conferencePhase(conference, now);
	// A draft has no dashboard yet, so its name goes back into the creation
	// flow, as `/manage/[slug]` would redirect it.
	const nameHref =
		phase === 'setup' ? createResumeUrl(conference.slug) : manageConferenceUrl(conference.slug);

	const row: ConferenceListRow = {
		id: conference.id,
		slug: conference.slug,
		name: conference.name,
		nameHref,
		dateBlock: conferenceDateBlock(conference.startDate, conference.endDate),
		subline: sublineOf(conference, phase, now),
		phaseNumber: PHASES.indexOf(phase) + 1,
		phaseName: PHASE_NAMES[phase],
		phaseDetail: phaseDetailOf(summary, phase, now),
		figures: figuresOf(summary, phase),
		...attentionOf(summary, phase, now),
		isDeletable: conference.status === 'draft',
		isOnTeam: true
	};

	if (summary.isOnTeam) {
		return row;
	}

	// Somebody in the organisation without a role here sees the conference's
	// name and where it is in its life, but nothing that would lead into its
	// management area, and no figures, which the database would not count for
	// them anyway.
	return {
		...row,
		nameHref: null,
		figures: [],
		attention: null,
		action: null,
		isDeletable: false,
		isOnTeam: false
	};
}
