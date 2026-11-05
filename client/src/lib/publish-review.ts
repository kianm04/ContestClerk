/**
 * What the Publish page (`/manage/[slug]/publish`, step 6 of setting a draft
 * up) says about a conference before it goes public: the "What goes public"
 * rows, the "Worth doing, not required" list, the sentence under the title
 * and the "When you publish" bullets (`specs/05-pages/organiser/publish.md`).
 *
 * Whether the conference may be published is not decided here. That is the
 * publish checklist's job (`$lib/publish-checklist.ts`), and every function
 * below reads its lines, so this page, the sidebar's ticks and the `publish`
 * action can never disagree.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import type { ResolvedPathname } from '$app/types';
import { formatConferenceDay, type Conference } from '$lib/conferences';
import { formatDateRange, formatTimeOfDay } from '$lib/dates';
import type { Fee } from '$lib/fees';
import { formatMoney } from '$lib/money';
import type { PublishChecklistLine, PublishChecklistLineKey } from '$lib/publish-checklist';
import {
	manageApplicationFormUrl,
	manageCommitteesUrl,
	manageDetailsUrl,
	manageFeesUrl,
	manageTeamUrl
} from '$lib/urls';

/** How many committees or fees a row names before it says "and 3 more". */
export const REVIEW_ROW_LINE_LIMIT = 5;

/** One committee, as much of it as this page reads. */
export type ReviewCommittee = {
	name: string;
	abbreviation: string | null;
	/** Seats delegates can still be put in, the number the checklist counts too. */
	availableSeatCount: number;
	chairCount: number;
};

/** One fee, as much of it as this page reads. */
export type ReviewFee = Pick<Fee, 'name' | 'amountCents' | 'appliesTo'>;

/** Everything the page is worked out from. The server reads it all in one go. */
export type PublishReviewFacts = {
	conference: Conference;
	committees: ReviewCommittee[];
	fees: ReviewFee[];
	currency: string;
	collectsPaymentsManually: boolean;
	committeePreferenceCount: number;
	askMotivation: boolean;
	/** The publish checklist's lines for this conference (`publishChecklist`). */
	checklist: PublishChecklistLine[];
	/** The moment the page was drawn, which decides "as soon as you publish". */
	now: Date;
};

/** One row of "What goes public": a label, what it says, and a link to change it. */
export type PublishReviewRow = {
	/** The quiet word on the left, such as "Committees". */
	label: string;
	/** One line each, such as one per committee. */
	lines: string[];
	/** A quieter line under them. */
	detail?: string;
	/** What still stops the conference being published, when something does. */
	missing?: string;
	/** "Edit", or the act that fills in what is missing, such as "Add a committee". */
	linkLabel: string;
	href: ResolvedPathname;
};

/** One line of "Worth doing, not required". */
export type WorthDoingItem = {
	key: 'banner' | 'chairs' | 'fees' | 'stripe';
	text: string;
	linkLabel: string;
	/** Missing only for "Connect Stripe" when the organisation could not be read. */
	href?: ResolvedPathname;
};

/** The checklist line with this key, which `publishChecklist` always writes. */
function findLine(
	checklist: PublishChecklistLine[],
	key: PublishChecklistLineKey
): PublishChecklistLine | undefined {
	return checklist.find((line) => line.key === key);
}

/** Whether the line is there and still undone. A line that is not there is not undone. */
function isUndone(checklist: PublishChecklistLine[], key: PublishChecklistLineKey): boolean {
	const line = findLine(checklist, key);

	return line !== undefined && !line.isDone;
}

/** The first few entries, then "and 3 more" for the rest, so a long list stays short. */
function shortenList(lines: string[]): string[] {
	if (lines.length <= REVIEW_ROW_LINE_LIMIT) {
		return lines;
	}

	const shown = lines.slice(0, REVIEW_ROW_LINE_LIMIT);
	const hiddenCount = lines.length - REVIEW_ROW_LINE_LIMIT;

	return [...shown, `and ${hiddenCount} more`];
}

/** "Northbridge Hall, 1 Bridge Street, London": the parts of the address that are filled in. */
export function conferencePlace(
	conference: Pick<Conference, 'venueName' | 'venueAddress' | 'city'>
): string {
	const parts = [conference.venueName, conference.venueAddress, conference.city];
	const filledIn = parts.filter((part): part is string => part !== null && part.trim() !== '');

	return filledIn.join(', ');
}

/** "a description" from "A description": a sentence's start, to follow other words. */
function lowerFirst(text: string): string {
	return text.charAt(0).toLowerCase() + text.slice(1);
}

/** The Conference row: the name, the dates and the place. */
function conferenceRow(facts: PublishReviewFacts): PublishReviewRow {
	const { conference } = facts;
	const dates = formatDateRange(conference.startDate, conference.endDate);
	const detailsLine = findLine(facts.checklist, 'details');
	const row: PublishReviewRow = {
		label: 'Conference',
		lines: [conference.name],
		detail: `${dates} · ${conferencePlace(conference)}`,
		linkLabel: 'Edit',
		href: manageDetailsUrl(conference.slug)
	};

	if (detailsLine === undefined || detailsLine.isDone) {
		return row;
	}

	// The line's detail names what is missing: "A description and tagline and the venue".
	const missing = detailsLine.detail
		? `Still needed: ${lowerFirst(detailsLine.detail)}`
		: undefined;

	return { ...row, missing, linkLabel: detailsLine.actionLabel };
}

/** "Human Rights Council · 4 seats". */
function committeeLine(committee: ReviewCommittee): string {
	const seats = committee.availableSeatCount === 1 ? 'seat' : 'seats';

	return `${committee.name} · ${committee.availableSeatCount} ${seats}`;
}

/** The Committees row: one line per committee with the seats it offers. */
function committeesRow(facts: PublishReviewFacts): PublishReviewRow {
	const slug = facts.conference.slug;
	const committeesLine = findLine(facts.checklist, 'committees');
	const lines =
		facts.committees.length === 0
			? ['No committees yet']
			: shortenList(facts.committees.map(committeeLine));
	const row: PublishReviewRow = {
		label: 'Committees',
		lines,
		linkLabel: 'Edit',
		href: manageCommitteesUrl(slug)
	};

	if (committeesLine === undefined || committeesLine.isDone) {
		return row;
	}

	// Without a committee the line has no detail, because "No committees yet" says it.
	return {
		...row,
		missing: committeesLine.detail ?? 'Add a committee with at least one seat on offer',
		linkLabel: committeesLine.actionLabel,
		href: committeesLine.href ?? row.href
	};
}

/** "31 Jan 2027 at 23:59", in the conference's own timezone. */
function dayAndTime(moment: string, timezone: string): string {
	return `${formatConferenceDay(moment, timezone)} at ${formatTimeOfDay(moment, timezone)}`;
}

/**
 * "Open as soon as you publish, close on 31 Jan 2027 at 23:59".
 *
 * An opening time already in the past is what "as soon as you publish" means:
 * `/create` stores one, and the application form page's "As soon as I publish"
 * keeps it (`applicationWindowLine` in `$lib/publish-checklist.ts`).
 */
export function applicationWindowSentence(
	conference: Pick<Conference, 'applicationsOpenAt' | 'applicationsCloseAt' | 'timezone'>,
	now: Date
): string {
	const { applicationsOpenAt, applicationsCloseAt, timezone } = conference;

	if (applicationsOpenAt === null || applicationsCloseAt === null) {
		return 'No application window yet';
	}

	const closing = `close on ${dayAndTime(applicationsCloseAt, timezone)}`;
	const opensAt = new Date(applicationsOpenAt);

	if (opensAt.getTime() <= now.getTime()) {
		return `Open as soon as you publish, ${closing}`;
	}

	return `Open on ${dayAndTime(applicationsOpenAt, timezone)}, ${closing}`;
}

/** "Individual delegates and delegations", or only one of them. */
function whoCanApply(conference: Conference): string {
	const { acceptsIndividualApplications, acceptsDelegations } = conference;

	if (acceptsIndividualApplications && acceptsDelegations) {
		return 'Individual delegates and delegations';
	}

	if (acceptsIndividualApplications) {
		return 'Individual delegates only';
	}

	if (acceptsDelegations) {
		return 'Delegations only';
	}

	return 'Nobody can apply yet';
}

/** "up to 2 committee preferences", or nothing when applicants pick no committee. */
function preferencesPart(count: number): string | null {
	if (count === 0) {
		return null;
	}

	if (count === 1) {
		return '1 committee preference';
	}

	return `up to ${count} committee preferences`;
}

/**
 * "Individual delegates and delegations · up to 2 committee preferences ·
 * motivation": who may apply and what the form asks for.
 */
function applicationFormDetail(facts: PublishReviewFacts): string {
	const parts: string[] = [whoCanApply(facts.conference)];
	const preferences = preferencesPart(facts.committeePreferenceCount);

	if (preferences !== null) {
		parts.push(preferences);
	}

	if (facts.askMotivation) {
		parts.push('motivation');
	}

	if (facts.conference.positionPaperRequired) {
		parts.push('position paper');
	}

	return parts.join(' · ');
}

/** The Applications row: the window and what the form asks. */
function applicationsRow(facts: PublishReviewFacts): PublishReviewRow {
	const { conference } = facts;
	const windowLine = findLine(facts.checklist, 'application-window');
	const row: PublishReviewRow = {
		label: 'Applications',
		lines: [applicationWindowSentence(conference, facts.now)],
		detail: applicationFormDetail(facts),
		linkLabel: 'Edit',
		href: manageApplicationFormUrl(conference.slug)
	};

	if (windowLine === undefined || windowLine.isDone) {
		return row;
	}

	// With a date missing, the window has to be chosen; with both set, the
	// only other way it can be wrong is the order of the dates.
	const hasBothDates =
		conference.applicationsOpenAt !== null && conference.applicationsCloseAt !== null;
	const missing = hasBothDates
		? 'Applications need to close after they open and before the conference starts'
		: 'Choose when applications open and close';

	return { ...row, missing, linkLabel: windowLine.actionLabel };
}

/** "Delegate fee · £45.00 per delegate". */
function feeLine(fee: ReviewFee, currency: string): string {
	const per = fee.appliesTo === 'individual' ? 'per delegate' : 'per delegation member';

	return `${fee.name} · ${formatMoney(fee.amountCents, currency)} ${per}`;
}

/** The Fees row: one line per fee, and how they are paid. */
function feesRow(facts: PublishReviewFacts): PublishReviewRow {
	const lines =
		facts.fees.length === 0
			? ['No fees']
			: shortenList(facts.fees.map((fee) => feeLine(fee, facts.currency)));

	let detail: string | undefined;

	if (facts.collectsPaymentsManually) {
		detail = 'Collected outside MUNMeet';
	} else if (facts.fees.length > 0) {
		detail = 'Paid by card through MUNMeet';
	}

	return {
		label: 'Fees',
		lines,
		detail,
		linkLabel: 'Edit',
		href: manageFeesUrl(facts.conference.slug)
	};
}

/** The four rows of "What goes public", in the order the setup steps come. */
export function publishReviewRows(facts: PublishReviewFacts): PublishReviewRow[] {
	return [conferenceRow(facts), committeesRow(facts), applicationsRow(facts), feesRow(facts)];
}

/**
 * What a screen reader hears for a row's link. Four links all called "Edit"
 * cannot be told apart in a list of links, so they become "Edit committees"
 * and the like; the words on screen stay "Edit", as the design draws them.
 */
export function reviewRowLinkName(row: PublishReviewRow): string {
	if (row.linkLabel !== 'Edit') {
		return row.linkLabel;
	}

	return `Edit ${row.label.toLowerCase()}`;
}

/**
 * "DISEC has no chair yet.", "DISEC and SPECPOL have no chair yet." or
 * "3 committees have no chair yet.", or `null` when every committee has one.
 * The Published page's "Invite your chairs" says the same.
 */
export function committeesWithoutChairSentence(committees: ReviewCommittee[]): string | null {
	const names = committees
		.filter((committee) => committee.chairCount === 0)
		.map((committee) => committee.abbreviation ?? committee.name);

	if (names.length === 0) {
		return null;
	}

	if (names.length === 1) {
		return `${names[0]} has no chair yet.`;
	}

	if (names.length === 2) {
		return `${names[0]} and ${names[1]} have no chair yet.`;
	}

	return `${names.length} committees have no chair yet.`;
}

/**
 * "Worth doing, not required": the checklist's recommended lines still undone,
 * and the committees nobody chairs yet. Empty when there is nothing to suggest.
 */
export function worthDoingItems(facts: PublishReviewFacts): WorthDoingItem[] {
	const items: WorthDoingItem[] = [];
	const slug = facts.conference.slug;

	if (isUndone(facts.checklist, 'banner')) {
		items.push({
			key: 'banner',
			text: 'The page has no banner image, so it shows a plain header.',
			linkLabel: 'Add a banner',
			href: manageDetailsUrl(slug)
		});
	}

	const withoutChair = committeesWithoutChairSentence(facts.committees);

	if (withoutChair !== null) {
		items.push({
			key: 'chairs',
			text: withoutChair,
			linkLabel: 'Invite a chair',
			href: manageTeamUrl(slug)
		});
	}

	if (isUndone(facts.checklist, 'fees')) {
		items.push({
			key: 'fees',
			text: 'No fees are set yet, so applying is free.',
			linkLabel: 'Set fees',
			href: manageFeesUrl(slug)
		});
	}

	const stripeLine = findLine(facts.checklist, 'stripe');

	if (stripeLine !== undefined && !stripeLine.isDone) {
		items.push({
			key: 'stripe',
			text: 'Stripe is not connected, so delegates cannot pay their fees by card yet.',
			linkLabel: 'Connect Stripe',
			href: stripeLine.href
		});
	}

	return items;
}

/** The required lines still undone, which the page names beside a Publish button that waits. */
export function missingRequiredLines(checklist: PublishChecklistLine[]): PublishChecklistLine[] {
	return checklist.filter((line) => line.isRequired && !line.isDone);
}

/** The sentence under the title: "Everything required is in place." or how much is left. */
export function publishReviewSummary(checklist: PublishChecklistLine[]): string {
	const remaining = missingRequiredLines(checklist).length;

	if (remaining === 0) {
		return 'Everything required is in place.';
	}

	if (remaining === 1) {
		return '1 step left before you can publish.';
	}

	return `${remaining} steps left before you can publish.`;
}

/** The second bullet of "When you publish": when applications open. */
function applicationsBullet(
	conference: Pick<Conference, 'applicationsOpenAt' | 'timezone'>,
	now: Date
): string {
	const opensAt = conference.applicationsOpenAt;

	if (opensAt === null || new Date(opensAt).getTime() <= now.getTime()) {
		return 'Applications open straight away; you review each one under Applications.';
	}

	const openingDay = formatConferenceDay(opensAt, conference.timezone);

	return `Applications open on ${openingDay}; you review each one under Applications.`;
}

/**
 * The three bullets of "When you publish". The second says when applications
 * open. It does not promise a message about each application, as the design
 * does, because MUNMeet sends the organisers none: they are reviewed on the
 * Applications page.
 */
export function whenYouPublishBullets(
	conference: Pick<Conference, 'applicationsOpenAt' | 'timezone'>,
	now: Date
): string[] {
	return [
		'The conference appears in the public list and in search.',
		applicationsBullet(conference, now),
		'You can still change every detail, and unpublish while no seat has been filled.'
	];
}
