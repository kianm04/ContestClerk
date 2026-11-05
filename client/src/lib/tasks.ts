/**
 * The "To do" list on the signed-in home page, and the task the hero takes as
 * its next step.
 *
 * Nine rules put a task on the list, each a plain question about rows the page
 * has already read: a profile with a field missing, a position paper not yet
 * handed in, an invoice unpaid, an application left in draft, applications
 * waiting for an organiser's decision, a delegation with seats nobody holds, a
 * chair's papers waiting for review, and a draft conference to finish setting
 * up or to publish. `deriveTasks` below is that table written out once. A task
 * has no tick box and nothing to press: it disappears by itself the moment its
 * condition stops being true.
 *
 * Every task carries the words its row shows (`title`, `detail`, `actionLabel`),
 * so no component invents any of them, and the conference it is about, so
 * `$lib/home-hero.ts` can tell which tasks belong to the reader's next
 * conference.
 *
 * Nothing in this file talks to Supabase, reads the clock or knows any Svelte.
 * The rows the rules ask about are gathered by `$lib/server/home.ts` and handed
 * in as `TaskFacts`, so the rules can be read and tested on their own.
 */

import type { ResolvedPathname } from '$app/types';
import { canFinishApplication, type MyApplicationListItem } from '$lib/applications';
import type { Conference } from '$lib/conferences';
import { cameInText } from '$lib/dashboard-attention-people';
import { countOf, listInWords } from '$lib/dashboard-words';
import { dayInTimezone, formatDateRange } from '$lib/dates';
import { formatMoney } from '$lib/money';
import {
	PROFILE_REQUIRED_FIELD_LABELS,
	profileCompleteness,
	type ProfileFieldsToCheck,
	type ProfileRequiredField
} from '$lib/profiles';
import {
	canPublish,
	countRemainingRequired,
	countRequired,
	publishChecklistItems,
	type ChecklistEntry,
	type PublishChecklistCounts
} from '$lib/publish-checklist';
import {
	applyUrl,
	chairPapersUrl,
	delegationSeatsUrl,
	invoiceUrl,
	manageApplicationsUrl,
	manageConferenceUrl,
	positionPaperUrl,
	profileEditUrl
} from '$lib/urls';

/**
 * Which of the rules below put a task on the list.
 *
 * It is on the task rather than only in its wording because three things need
 * it: the list is sorted by it, `$lib/home-hero.ts` decides by it which undated
 * tasks are pressing, and a test can name the rule it is about without matching
 * on English.
 */
export type HomeTaskKind =
	| 'profile'
	| 'position_paper'
	| 'invoice'
	| 'application'
	| 'review_applications'
	| 'delegation_seats'
	| 'review_papers'
	| 'publish';

/**
 * The order two tasks fall into when nothing else separates them: the reader's
 * own things first, then what other people are waiting on them for, and a draft
 * conference last.
 */
const TASK_KIND_ORDER: HomeTaskKind[] = [
	'profile',
	'position_paper',
	'invoice',
	'application',
	'review_applications',
	'delegation_seats',
	'review_papers',
	'publish'
];

/**
 * When a task is due.
 *
 * `day` is a plain `YYYY-MM-DD`, worked out in `timezone` rather than in the
 * reader's own: a paper due "on the 4th" is due on the 4th where the conference
 * is. `dueWord` in `$lib/home-rows.ts` turns the pair into "Tomorrow" or
 * "In 5 days" when the row is drawn.
 */
export type TaskDeadline = {
	day: string;
	timezone: string;
};

/** One row of the "To do" section, or the hero's next step. */
export type HomeTask = {
	/** Unique across the whole list. The `{#each}` block over the rows is keyed on it. */
	id: string;
	kind: HomeTaskKind;
	/**
	 * The conference the task is about, or `null` for the profile task, which is
	 * about the reader alone.
	 */
	conferenceId: string | null;
	/** The words on the line, such as "Submit position paper (UNSC)". */
	title: string;
	/** The quieter line under the title, such as "Amsterdam Open MUN 2027 · Morocco", or `null`. */
	detail: string | null;
	/**
	 * The verb on the row's link, and on the page's one button when the task is
	 * the hero's next step: "Write paper", "Pay invoice".
	 */
	actionLabel: string;
	/** When it is due, or `null` for the rules that give no deadline. */
	deadline: TaskDeadline | null;
	/**
	 * Where the reader goes to do it.
	 *
	 * It is optional because a task can be a plain line of text rather than a
	 * link: every rule below has somewhere to send the reader, but a rule added
	 * later might not, and `resolve()` from `$app/paths` refuses an address whose
	 * folder is not under `src/routes/`.
	 */
	href?: ResolvedPathname;
};

/** A seat the reader holds, as the position paper rule needs to see it. */
export type PositionPaperSeat = {
	/** The seat's id, which the task's own id is built from. */
	seatId: string;
	/** What the seat is called, such as "Morocco", for the task's detail line. */
	seatName: string;
	conferenceId: string;
	/** The conference's own link, for the task's `href`. */
	conferenceSlug: string;
	conferenceName: string;
	/**
	 * The conference's first day, a plain `YYYY-MM-DD`. It stands in as the
	 * deadline when the conference set none.
	 */
	conferenceStartDate: string;
	/** The committee's own link, for the task's `href`. */
	committeeSlug: string;
	/** What the committee is called: its short name when it has one, its full name otherwise. */
	committeeHeading: string;
	/** The conference's own timezone, which the deadline is read in. */
	conferenceTimezone: string;
	/** Whether the conference asks its delegates for a position paper at all. */
	isPositionPaperRequired: boolean;
	/** An ISO timestamp, or `null` when the conference set no deadline. */
	positionPaperDeadline: string | null;
	/** Whether a paper has already been uploaded for this seat. */
	hasPositionPaper: boolean;
};

/** An invoice of the reader's own that is still to be paid. */
export type UnpaidInvoice = {
	id: string;
	/** The human-readable number the task names, such as "INV-0007". */
	number: string;
	conferenceId: string;
	conferenceName: string;
	/** What is owed, in the currency's smallest unit, as `invoices.amount_cents` holds it. */
	amountCents: number;
	/** A three-letter ISO 4217 code such as `EUR`, as `invoices.currency` holds it. */
	currency: string;
	/** An ISO timestamp, or `null` when the organisers set no date. */
	dueAt: string | null;
	/** The conference's own timezone, which `dueAt` becomes a day in. */
	conferenceTimezone: string;
};

/** A delegation the reader is a head of, with the seats nobody is sitting in yet. */
export type DelegationWithEmptySeats = {
	id: string;
	name: string;
	conferenceId: string;
	conferenceName: string;
	/** Every seat the organisers reserved for the delegation. */
	seatCount: number;
	/** Those of them that still have no `user_id`. */
	emptySeatCount: number;
};

/**
 * A conference the reader helps run, with everything its publish checklist
 * needs beyond the conference row itself.
 *
 * The checklist is `$lib/publish-checklist.ts`'s, the same one the conference
 * dashboard draws, so the task and that page can never disagree about whether a
 * conference is ready.
 */
export type ManagedConferenceFacts = {
	conference: Conference;
	checklistCounts: PublishChecklistCounts;
};

/**
 * The applications waiting for a decision at one conference the reader
 * organises: submitted, and neither accepted, waitlisted nor turned down since.
 */
export type WaitingApplications = {
	conferenceId: string;
	conferenceName: string;
	/** The conference's own link, for the task's `href`. */
	conferenceSlug: string;
	/** The conference's own timezone, which the oldest application's date is read in. */
	conferenceTimezone: string;
	count: number;
	/** When the earliest of them was sent, an ISO timestamp, or `null` when none waits. */
	oldestSubmittedAt: string | null;
};

/**
 * A committee the reader chairs, with how many of its position papers wait for
 * a review: submitted, and neither approved nor sent back since.
 */
export type ChairedCommitteePapers = {
	committeeId: string;
	conferenceId: string;
	/** The conference's own link, for the task's `href`. */
	conferenceSlug: string;
	conferenceName: string;
	/** The committee's own link, for the task's `href`. */
	committeeSlug: string;
	/** What the committee is called: its short name when it has one, its full name otherwise. */
	committeeHeading: string;
	waitingCount: number;
};

/** Everything the rules ask about, gathered by `$lib/server/home.ts`. */
export type TaskFacts = {
	/** The four fields `profileCompleteness` checks. */
	profile: ProfileFieldsToCheck;
	seats: PositionPaperSeat[];
	invoices: UnpaidInvoice[];
	/** The reader's own applications, which the "Finish your application" rule filters. */
	applications: MyApplicationListItem[];
	/** One entry per published conference the reader organises, counted or not. */
	waitingApplications: WaitingApplications[];
	delegations: DelegationWithEmptySeats[];
	managedConferences: ManagedConferenceFacts[];
	/** Every committee the reader chairs, with its papers waiting for review counted. */
	chairedCommittees: ChairedCommitteePapers[];
};

/**
 * An ISO timestamp as the day it falls on where the conference is, or `null`
 * when there is no timestamp.
 */
function toDeadline(moment: string | null, timezone: string): TaskDeadline | null {
	if (moment === null) {
		return null;
	}

	return { day: dayInTimezone(new Date(moment), timezone), timezone };
}

/**
 * A deadline's day as a person reads it: "2 Apr 2026".
 *
 * `formatDateRange` writes one day in full when both ends are the same day,
 * and it is the one place in `$lib/dates.ts` that writes a `YYYY-MM-DD` day
 * this way.
 */
function formatDeadlineDay(deadline: TaskDeadline): string {
	return formatDateRange(deadline.day, deadline.day);
}

/** Whether a deadline's day is over, read as a day where the conference is. */
function hasPassed(deadline: TaskDeadline, now: Date): boolean {
	// Both are `YYYY-MM-DD` text, which compares the same way as dates.
	return deadline.day < dayInTimezone(now, deadline.timezone);
}

/**
 * "Your institution and country are missing.": the empty fields in the words
 * `/profile` names them by, so the two pages cannot disagree about them.
 */
function missingFieldsSentence(missingFields: ProfileRequiredField[]): string {
	// Each label starts with "your" ("your country"). The sentence says it once,
	// at the front, so the labels are trimmed to the bare noun.
	const nouns = missingFields.map((field) =>
		PROFILE_REQUIRED_FIELD_LABELS[field].replace(/^your /, '')
	);
	const verb = nouns.length === 1 ? 'is' : 'are';

	return `Your ${listInWords(nouns)} ${verb} missing.`;
}

/** Rule 1: the profile is missing one of the four fields an organiser needs. */
function profileTask(profile: ProfileFieldsToCheck): HomeTask | null {
	const completeness = profileCompleteness(profile);

	if (completeness.isComplete) {
		return null;
	}

	return {
		id: 'profile',
		kind: 'profile',
		conferenceId: null,
		title: 'Complete your profile',
		detail: missingFieldsSentence(completeness.missingFields),
		actionLabel: 'Edit profile',
		deadline: null,
		href: profileEditUrl()
	};
}

/** Rule 2: a seat at a conference that asks for papers, with no paper uploaded for it. */
function positionPaperTasks(seats: PositionPaperSeat[]): HomeTask[] {
	const tasks: HomeTask[] = [];

	for (const seat of seats) {
		if (!seat.isPositionPaperRequired || seat.hasPositionPaper) {
			continue;
		}

		// A conference that set no deadline still wants the paper before it
		// starts, so its first day stands in: the row then says "By 25 Jul 2027"
		// rather than nothing.
		const deadline = toDeadline(seat.positionPaperDeadline, seat.conferenceTimezone) ?? {
			day: seat.conferenceStartDate,
			timezone: seat.conferenceTimezone
		};

		tasks.push({
			id: `position_paper:${seat.seatId}`,
			kind: 'position_paper',
			conferenceId: seat.conferenceId,
			title: `Submit position paper (${seat.committeeHeading})`,
			detail: `${seat.conferenceName} · ${seat.seatName}`,
			actionLabel: 'Write paper',
			deadline,
			href: positionPaperUrl(seat.conferenceSlug, seat.committeeSlug)
		});
	}

	return tasks;
}

/**
 * "was due 2 Apr 2026" once the day is over, "due 4 Dec 2026" before it, and
 * nothing when the organisers set no date.
 */
function invoiceDueText(deadline: TaskDeadline | null, now: Date): string | null {
	if (deadline === null) {
		return null;
	}

	const day = formatDeadlineDay(deadline);

	return hasPassed(deadline, now) ? `was due ${day}` : `due ${day}`;
}

/** Rule 3: an invoice of the reader's own that is still unpaid. */
function invoiceTasks(invoices: UnpaidInvoice[], now: Date): HomeTask[] {
	return invoices.map((invoice) => {
		const deadline = toDeadline(invoice.dueAt, invoice.conferenceTimezone);
		const dueText = invoiceDueText(deadline, now);

		// The conference, the amount and the date, the date left out when there
		// is none: "Rotterdam Spring MUN 2026 · €65.00 · was due 2 Apr 2026".
		const parts = [invoice.conferenceName, formatMoney(invoice.amountCents, invoice.currency)];

		if (dueText !== null) {
			parts.push(dueText);
		}

		return {
			id: `invoice:${invoice.id}`,
			kind: 'invoice',
			conferenceId: invoice.conferenceId,
			title: `Pay invoice ${invoice.number}`,
			detail: parts.join(' · '),
			actionLabel: 'Pay invoice',
			deadline,
			href: invoiceUrl(invoice.id)
		};
	});
}

/**
 * Rule 4: an application still in draft at a conference whose window is open.
 *
 * `canFinishApplication` in `$lib/applications.ts` is the same test the
 * "Finish" button on `/applications` uses, so a row that offers the button and
 * a task that asks for the same thing can never disagree.
 */
function applicationTasks(applications: MyApplicationListItem[], now: Date): HomeTask[] {
	const tasks: HomeTask[] = [];

	for (const application of applications) {
		if (!canFinishApplication(application, now)) {
			continue;
		}

		const conference = application.conference;
		const deadline = toDeadline(conference.applicationsCloseAt, conference.timezone);
		const detail =
			deadline === null ? 'No closing date' : `Applications close ${formatDeadlineDay(deadline)}`;

		tasks.push({
			id: `application:${application.id}`,
			kind: 'application',
			conferenceId: conference.id,
			title: `Finish your application (${conference.name})`,
			detail,
			actionLabel: 'Finish application',
			deadline,
			href: applyUrl(conference.slug)
		});
	}

	return tasks;
}

/**
 * Rule 5: applications waiting for a decision at a conference the reader
 * organises. "The oldest came in 6 days ago." says how long somebody has been
 * waiting, in the words of the conference dashboard's own "Needs you" line, so
 * the two pages agree about it.
 */
function reviewApplicationTasks(waiting: WaitingApplications[], now: Date): HomeTask[] {
	const tasks: HomeTask[] = [];

	for (const conference of waiting) {
		if (conference.count === 0) {
			continue;
		}

		let detail: string | null = null;

		if (conference.oldestSubmittedAt !== null) {
			const subject = conference.count === 1 ? 'It' : 'The oldest';
			const cameIn = cameInText(conference.oldestSubmittedAt, now, conference.conferenceTimezone);

			detail = `${subject} ${cameIn}.`;
		}

		const applications = countOf(conference.count, 'application', 'applications');

		tasks.push({
			id: `review_applications:${conference.conferenceId}`,
			kind: 'review_applications',
			conferenceId: conference.conferenceId,
			title: `Decide ${applications} (${conference.conferenceName})`,
			detail,
			actionLabel: 'Review applications',
			deadline: null,
			// The applications table opens on the ones under review.
			href: manageApplicationsUrl(conference.conferenceSlug)
		});
	}

	return tasks;
}

/** Rule 6: a delegation the reader heads that has seats nobody is sitting in. */
function delegationSeatTasks(delegations: DelegationWithEmptySeats[]): HomeTask[] {
	const tasks: HomeTask[] = [];

	for (const delegation of delegations) {
		if (delegation.emptySeatCount === 0) {
			continue;
		}

		const emptySeats = countOf(delegation.emptySeatCount, 'seat', 'seats');

		tasks.push({
			id: `delegation_seats:${delegation.id}`,
			kind: 'delegation_seats',
			conferenceId: delegation.conferenceId,
			title: `Assign delegation seats (${delegation.name})`,
			detail: `${delegation.conferenceName} · ${emptySeats} nobody holds yet`,
			actionLabel: 'Assign seats',
			deadline: null,
			href: delegationSeatsUrl(delegation.id)
		});
	}

	return tasks;
}

/**
 * How far a draft is from publishable: the required checklist items that are
 * done, of all the required ones, so "5 of 5" is `canPublish`'s yes said in
 * numbers. The hero's "setup steps done" figure and the publish task's detail
 * both read this, so the two can never disagree about one conference.
 *
 * Recommended items (a banner, fees, Stripe) are left out of both counts: they
 * never stand in the way of publishing, and counting them on one side only
 * would let the detail read "7 of 5".
 */
export function setupStepCounts(items: ChecklistEntry[]): { done: number; required: number } {
	const required = countRequired(items);

	return { done: required - countRemainingRequired(items), required };
}

/**
 * Rule 7: a conference of the reader's that is still a draft. One with every
 * required item done asks to be published; one with work left asks the reader
 * to carry on setting it up.
 */
function publishTasks(managedConferences: ManagedConferenceFacts[]): HomeTask[] {
	const tasks: HomeTask[] = [];

	for (const managed of managedConferences) {
		const conference = managed.conference;

		if (conference.status !== 'draft') {
			continue;
		}

		const items = publishChecklistItems(conference, managed.checklistCounts);
		const isReady = canPublish(items);
		const steps = setupStepCounts(items);

		tasks.push({
			id: `publish:${conference.id}`,
			kind: 'publish',
			conferenceId: conference.id,
			title: isReady ? `Publish ${conference.name}` : `Finish setting up ${conference.name}`,
			detail: `Draft · ${steps.done} of ${steps.required} setup steps done`,
			actionLabel: isReady ? 'Publish' : 'Continue setup',
			// No date: a draft is pressing only while it is the reader's next
			// conference, which `$lib/home-hero.ts` decides.
			deadline: null,
			href: manageConferenceUrl(conference.slug)
		});
	}

	return tasks;
}

/**
 * Rule 8: a committee the reader chairs with papers waiting for their review
 * (T170). It leads to the chair's papers page showing only those papers, and
 * goes once none wait. One paper reads "Review 1 position paper".
 */
function reviewPaperTasks(chairedCommittees: ChairedCommitteePapers[]): HomeTask[] {
	const tasks: HomeTask[] = [];

	for (const committee of chairedCommittees) {
		if (committee.waitingCount === 0) {
			continue;
		}

		const papers = countOf(committee.waitingCount, 'position paper', 'position papers');

		tasks.push({
			id: `review_papers:${committee.committeeId}`,
			kind: 'review_papers',
			conferenceId: committee.conferenceId,
			title: `Review ${papers} (${committee.committeeHeading})`,
			detail: committee.conferenceName,
			actionLabel: 'Review papers',
			deadline: null,
			href: chairPapersUrl(committee.conferenceSlug, committee.committeeSlug, 'submitted')
		});
	}

	return tasks;
}

/** -1, 0 or 1 for two pieces of text, so the comparator below reads as three tries in a row. */
function compareText(first: string, second: string): number {
	if (first < second) {
		return -1;
	}

	if (first > second) {
		return 1;
	}

	return 0;
}

/**
 * Which of two tasks comes first: the one due soonest, then the one whose rule
 * `TASK_KIND_ORDER` lists first, and last of all the one with the smaller id.
 *
 * A task with no deadline comes after every task that has one. The section is
 * what needs doing next, and something with a date on it is more pressing than
 * something without.
 *
 * Two deadlines are compared as `YYYY-MM-DD` text, which compares them as
 * dates. Two conferences in different timezones can be a few hours apart and
 * still land on the same day here; nothing on the row is precise enough for
 * that to show.
 */
function compareTasks(first: HomeTask, second: HomeTask): number {
	if (first.deadline === null && second.deadline !== null) {
		return 1;
	}

	if (first.deadline !== null && second.deadline === null) {
		return -1;
	}

	if (first.deadline !== null && second.deadline !== null) {
		const byDay = compareText(first.deadline.day, second.deadline.day);

		if (byDay !== 0) {
			return byDay;
		}
	}

	const byKind = TASK_KIND_ORDER.indexOf(first.kind) - TASK_KIND_ORDER.indexOf(second.kind);

	if (byKind !== 0) {
		return byKind;
	}

	return compareText(first.id, second.id);
}

/**
 * Everything the home page should ask this person to do, in the order it
 * should ask: overdue and soonest first, then the undated tasks in the order
 * of the rules. `$lib/home-hero.ts` lifts the first pressing one into the hero
 * as its next step; the rest are the "To do" rows.
 *
 * `now` is handed in rather than read from the clock, for the reason the rest
 * of the page gives: every part of it has to agree about the moment, and a test
 * has to be able to decide what that moment is.
 *
 * The list is not cut short: a task the reader cannot see is one they will not
 * do.
 */
export function deriveTasks(facts: TaskFacts, now: Date): HomeTask[] {
	const tasks: HomeTask[] = [];
	const profile = profileTask(facts.profile);

	if (profile !== null) {
		tasks.push(profile);
	}

	tasks.push(...positionPaperTasks(facts.seats));
	tasks.push(...invoiceTasks(facts.invoices, now));
	tasks.push(...applicationTasks(facts.applications, now));
	tasks.push(...reviewApplicationTasks(facts.waitingApplications, now));
	tasks.push(...delegationSeatTasks(facts.delegations));
	tasks.push(...publishTasks(facts.managedConferences));
	tasks.push(...reviewPaperTasks(facts.chairedCommittees));

	return tasks.sort(compareTasks);
}
