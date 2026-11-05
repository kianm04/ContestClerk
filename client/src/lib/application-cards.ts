/**
 * One card per application at `/applications`, ready to draw: the conference
 * with its place, the status, the progress line, the details column and the
 * action panel. The server works the cards out once, so the components only
 * draw what they are given.
 *
 * `specs/05-pages/delegate/applications.md` describes each part.
 */

import {
	applicationListConference,
	applicationRowLine,
	canFinishApplication,
	type ApplicationListEntry,
	type ApplicationListSeat,
	type ApplicationStatus
} from '$lib/applications';
import { cardAction, type CardAction, type OwedPositionPaper } from '$lib/application-card-actions';
import {
	applicationProgress,
	type ApplicationProgress,
	type ProgressTone
} from '$lib/application-progress';
import { hasConferenceFinished } from '$lib/committees';
import { countryName } from '$lib/countries';
import { dayInTimezone, formatDateRange, formatDueIn } from '$lib/dates';
import type { DelegationStatus } from '$lib/delegations';
import type { InvoiceStatus } from '$lib/invoices';
import { statusLabel } from '$lib/status';

/** What a conference says about where it is and what it asks for, beyond the list's own facts. */
export type CardConferenceFacts = {
	conferenceId: string;
	/** `null` for an online conference, or one whose city is not set yet. */
	city: string | null;
	/** A two-letter ISO country code, such as `NL`, or `null` alongside a missing city. */
	countryCode: string | null;
	isPositionPaperRequired: boolean;
	/** An ISO timestamp, or `null` when the conference set no deadline. */
	positionPaperDeadline: string | null;
};

/** A seat the reader holds, and whether its position paper has been sent. */
export type CardSeatFacts = {
	conferenceId: string;
	/** For the address of the position paper page. */
	committeeSlug: string;
	hasPositionPaper: boolean;
};

/** An invoice the reader pays. Cancelled ones are never read. */
export type CardInvoiceFacts = {
	id: string;
	conferenceId: string;
	status: InvoiceStatus;
	/** An ISO timestamp, so the newest of several can be picked. */
	createdAt: string;
};

/** When a delegation was sent and last changed, which the list itself does not carry. */
export type CardDelegationFacts = {
	delegationId: string;
	submittedAt: string | null;
	updatedAt: string;
};

/** Everything `$lib/server/application-card-facts.ts` reads for the cards. */
export type ApplicationCardFacts = {
	conferences: CardConferenceFacts[];
	seats: CardSeatFacts[];
	invoices: CardInvoiceFacts[];
	delegations: CardDelegationFacts[];
};

/**
 * Which tab a card belongs to besides "All". `other` is everything that waits
 * for nobody: an application that was not accepted, was withdrawn, or is a
 * draft that can no longer be sent, and a delegation still being prepared.
 */
export type ApplicationStage = 'needsAction' | 'underReview' | 'accepted' | 'other';

/** One line of "Application materials", such as "Payment · Pending". */
export type CardMaterial = {
	label: string;
	statusLabel: string;
	tone: ProgressTone;
};

/** The conference as a card shows it. */
export type ApplicationCardConference = {
	name: string;
	bannerPath: string | null;
	startDate: string;
	endDate: string;
	/** "Amsterdam, Netherlands", or `null` when the conference could not be read. */
	place: string | null;
	countryCode: string | null;
};

/** The middle column: what kind of application this is, then the seat or the materials. */
export type ApplicationCardDetails = {
	/** "Delegate application" or "Delegation application". */
	title: string;
	/** "Submitted 6 Sept 2026", "Draft · closes in 3 days", or the delegation's name. */
	line: string;
	/** The seat, once one is given. The materials are shown until then. */
	seat: ApplicationListSeat | null;
	materials: CardMaterial[];
};

export type ApplicationCard = {
	/** The application's id, or the delegation's. */
	id: string;
	kind: 'individual' | 'delegation';
	conference: ApplicationCardConference;
	stage: ApplicationStage;
	/** Whether the conference is over, which puts the card under the "Past" tab only. */
	isPast: boolean;
	status: { label: string; tone: ProgressTone };
	progress: ApplicationProgress;
	details: ApplicationCardDetails;
	action: CardAction;
	/** An ISO timestamp, for sorting by "Most recent". */
	updatedAt: string;
	/** Everything the search box looks through, in lower case. */
	searchText: string;
};

/** The facts about one entry, picked out of the lists the server read. */
type EntryFacts = {
	conference: CardConferenceFacts | null;
	seat: CardSeatFacts | null;
	invoice: CardInvoiceFacts | null;
	delegation: CardDelegationFacts | null;
};

/** The status of either kind of entry. */
type EntryStatus = ApplicationStatus | DelegationStatus;

/** What `summariseEntry` gives back. */
type EntrySummary = {
	status: EntryStatus;
	/** "Accepted", "Under review" and so on, from `writing-style.md`. */
	statusLabel: string;
	seat: ApplicationListSeat | null;
	/** An ISO timestamp, or `null` while it is a draft. */
	submittedAt: string | null;
	updatedAt: string;
	canFinish: boolean;
	detailsTitle: string;
	detailsLine: string;
};

/**
 * The invoice a card shows for its conference: an unpaid one first, because
 * that is the one the reader has to act on, and otherwise the newest.
 */
function invoiceForConference(
	invoices: CardInvoiceFacts[],
	conferenceId: string
): CardInvoiceFacts | null {
	const forConference = invoices.filter((invoice) => invoice.conferenceId === conferenceId);
	const unpaid = forConference.find((invoice) => invoice.status === 'unpaid');

	if (unpaid) {
		return unpaid;
	}

	// ISO timestamps sort as text in the order they happened.
	const newestFirst = forConference.sort((first, second) =>
		second.createdAt.localeCompare(first.createdAt)
	);

	return newestFirst[0] ?? null;
}

/** Picks out the facts that belong to one entry. */
function factsForEntry(entry: ApplicationListEntry, facts: ApplicationCardFacts): EntryFacts {
	const conferenceId = applicationListConference(entry).id;

	return {
		conference: facts.conferences.find((item) => item.conferenceId === conferenceId) ?? null,
		seat: facts.seats.find((item) => item.conferenceId === conferenceId) ?? null,
		invoice: invoiceForConference(facts.invoices, conferenceId),
		delegation: facts.delegations.find((item) => item.delegationId === entry.id) ?? null
	};
}

/** The position paper the reader still owes for their seat, or `null` when they owe none. */
function owedPositionPaper(
	entryFacts: EntryFacts,
	timezone: string,
	now: Date
): OwedPositionPaper | null {
	const conference = entryFacts.conference;
	const seat = entryFacts.seat;

	if (conference === null || seat === null) {
		return null;
	}

	if (!conference.isPositionPaperRequired || seat.hasPositionPaper) {
		return null;
	}

	if (conference.positionPaperDeadline === null) {
		return { committeeSlug: seat.committeeSlug, dueIn: null };
	}

	const deadlineDay = dayInTimezone(new Date(conference.positionPaperDeadline), timezone);

	return { committeeSlug: seat.committeeSlug, dueIn: formatDueIn(deadlineDay, now, timezone) };
}

/** "Submitted 6 Sept 2026", on the conference's own calendar. */
function submittedLine(submittedAt: string, timezone: string): string {
	const submittedDay = dayInTimezone(new Date(submittedAt), timezone);

	// `formatDateRange` writes one day as "6 Sept 2026" when both ends are the same.
	return `Submitted ${formatDateRange(submittedDay, submittedDay)}`;
}

/**
 * "LSE Team · Submitted 6 Sept 2026", or "LSE Team · Draft" before it is sent.
 * When the delegation's dates could not be read, only its name, rather than
 * calling a sent delegation a draft.
 */
function delegationLine(
	name: string,
	status: DelegationStatus,
	submittedAt: string | null,
	timezone: string
): string {
	if (submittedAt !== null) {
		return `${name} · ${submittedLine(submittedAt, timezone)}`;
	}

	if (status === 'draft') {
		return `${name} · Draft`;
	}

	return name;
}

/** The words and colour of a payment line under "Application materials". */
function paymentMaterial(invoice: CardInvoiceFacts): CardMaterial {
	if (invoice.status === 'unpaid') {
		return { label: 'Payment', statusLabel: 'Pending', tone: 'warning' };
	}

	if (invoice.status === 'paid') {
		return { label: 'Payment', statusLabel: 'Paid', tone: 'success' };
	}

	return {
		label: 'Payment',
		statusLabel: statusLabel('invoice_status', invoice.status),
		tone: 'neutral'
	};
}

/**
 * The form line: complete once it was sent, in progress while it can still be
 * sent, and grey once it no longer can, so a closed draft is not picked out as
 * something still owed.
 */
function formMaterial(status: EntryStatus, canStillBeSent: boolean): CardMaterial {
	if (status !== 'draft') {
		return { label: 'Form', statusLabel: 'Complete', tone: 'success' };
	}

	if (canStillBeSent) {
		return { label: 'Form', statusLabel: 'In progress', tone: 'warning' };
	}

	return { label: 'Form', statusLabel: 'Not submitted', tone: 'neutral' };
}

/** The form line, and the payment line when there is an invoice. */
function cardMaterials(form: CardMaterial, invoice: CardInvoiceFacts | null): CardMaterial[] {
	if (invoice === null) {
		return [form];
	}

	return [form, paymentMaterial(invoice)];
}

/** Which tab the card belongs to, from its action panel and its status. */
function cardStage(action: CardAction, status: EntryStatus): ApplicationStage {
	if (action.tone === 'danger') {
		return 'needsAction';
	}

	if (status === 'submitted' || status === 'waitlisted') {
		return 'underReview';
	}

	if (status === 'accepted') {
		return 'accepted';
	}

	return 'other';
}

/** The status pill: "Needs action" when something is waiting for the reader, the status otherwise. */
function cardStatus(
	stage: ApplicationStage,
	label: string,
	progress: ApplicationProgress
): ApplicationCard['status'] {
	if (stage === 'needsAction') {
		return { label: 'Needs action', tone: 'danger' };
	}

	return { label, tone: progress.tone };
}

/**
 * The progress line in the status pill's colour. A card that needs the
 * reader's action is red all over, as the mockup draws it, even when its
 * status alone (a sent application waiting on a payment, say) would be orange.
 */
function progressForStage(
	stage: ApplicationStage,
	progress: ApplicationProgress
): ApplicationProgress {
	if (stage === 'needsAction') {
		return { ...progress, tone: 'danger' };
	}

	return progress;
}

/** The conference as the card shows it, with its place when it could be read. */
function cardConference(
	entry: ApplicationListEntry,
	conferenceFacts: CardConferenceFacts | null
): ApplicationCardConference {
	const conference = applicationListConference(entry);
	// No place at all, rather than "null, null", for a conference without a city.
	const place =
		conferenceFacts && conferenceFacts.city !== null
			? conferenceFacts.countryCode === null
				? conferenceFacts.city
				: `${conferenceFacts.city}, ${countryName(conferenceFacts.countryCode)}`
			: null;

	return {
		name: conference.name,
		bannerPath: conference.bannerPath,
		startDate: conference.startDate,
		endDate: conference.endDate,
		place,
		countryCode: conferenceFacts?.countryCode ?? null
	};
}

/**
 * The parts of an entry the card needs, the same whichever kind of entry it
 * is, so that `buildCard` does not have to ask the kind at every step.
 */
function summariseEntry(
	entry: ApplicationListEntry,
	delegationFacts: CardDelegationFacts | null,
	now: Date
): EntrySummary {
	if (entry.kind === 'individual') {
		const application = entry.application;

		return {
			status: application.status,
			statusLabel: statusLabel('application_status', application.status),
			seat: application.seat,
			submittedAt: application.submittedAt,
			updatedAt: application.updatedAt,
			canFinish: canFinishApplication(application, now),
			detailsTitle: 'Delegate application',
			detailsLine: applicationRowLine(application, now)
		};
	}

	const membership = entry.membership;
	const submittedAt = delegationFacts?.submittedAt ?? null;
	const timezone = membership.conference.timezone;

	return {
		status: membership.status,
		statusLabel: statusLabel('delegation_status', membership.status),
		seat: membership.seat,
		submittedAt,
		// Without its facts a delegation sorts last under "Most recent".
		updatedAt: delegationFacts?.updatedAt ?? '',
		// Only the head of a delegation can send it, from the delegation's own page.
		canFinish: false,
		detailsTitle: 'Delegation application',
		detailsLine: delegationLine(membership.name, membership.status, submittedAt, timezone)
	};
}

/** One card without its search text, from an entry and the facts that belong to it. */
function buildCard(
	entry: ApplicationListEntry,
	facts: ApplicationCardFacts,
	now: Date
): Omit<ApplicationCard, 'searchText'> {
	const entryFacts = factsForEntry(entry, facts);
	const conference = applicationListConference(entry);
	const summary = summariseEntry(entry, entryFacts.delegation, now);
	const invoice = entryFacts.invoice;
	const isSeatedAndAccepted = summary.status === 'accepted' && summary.seat !== null;
	const isPast = hasConferenceFinished(conference, now);

	// Only the head can send a delegation, so its draft stays in progress until
	// the conference is over; an individual draft only while its window is open.
	const canStillBeSent = entry.kind === 'delegation' ? !isPast : summary.canFinish;

	const action = cardAction({
		kind: entry.kind,
		entryId: entry.id,
		conferenceSlug: conference.slug,
		status: summary.status,
		canFinish: summary.canFinish,
		hasSeat: summary.seat !== null,
		unpaidInvoiceId: invoice?.status === 'unpaid' ? invoice.id : null,
		owedPositionPaper: isSeatedAndAccepted
			? owedPositionPaper(entryFacts, conference.timezone, now)
			: null,
		isPast
	});

	const progress = applicationProgress({
		status: summary.status,
		wasSubmitted: summary.submittedAt !== null,
		hasSeat: summary.seat !== null,
		canFinish: summary.canFinish
	});

	const stage = cardStage(action, summary.status);

	return {
		id: entry.id,
		kind: entry.kind,
		conference: cardConference(entry, entryFacts.conference),
		stage,
		isPast,
		status: cardStatus(stage, summary.statusLabel, progress),
		progress: progressForStage(stage, progress),
		details: {
			title: summary.detailsTitle,
			line: summary.detailsLine,
			seat: summary.seat,
			materials: cardMaterials(formMaterial(summary.status, canStillBeSent), invoice)
		},
		action,
		updatedAt: summary.updatedAt
	};
}

/** Everything the search box looks through, joined and in lower case. */
function cardSearchText(card: Omit<ApplicationCard, 'searchText'>): string {
	const seat = card.details.seat;
	const parts = [
		card.conference.name,
		card.conference.place ?? '',
		card.status.label,
		card.details.line,
		seat?.committeeHeading ?? '',
		seat?.seatName ?? ''
	];

	return parts.join(' ').toLowerCase();
}

/**
 * Every card for the page, in the order the entries came in. Sorting and the
 * tabs are `$lib/my-applications-query.ts`'s job.
 */
export function buildApplicationCards(
	entries: ApplicationListEntry[],
	facts: ApplicationCardFacts,
	now: Date
): ApplicationCard[] {
	return entries.map((entry) => {
		const card = buildCard(entry, facts, now);

		return { ...card, searchText: cardSearchText(card) };
	});
}
