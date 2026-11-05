/**
 * What the Setup step of creating a conference (Trello fe3reN7Y) says about
 * its committees, applications and fees: the status chip on each card, the
 * six facts on the Applications card, and the short sentences the cards
 * build from rows in other tables.
 *
 * The public page's chip is `publicPageStatus` in `$lib/creation-readiness`,
 * which the Launch step shares. Every rule here is lenient on purpose: no
 * committees, no fees and "Decide later" are honest answers, never errors.
 * Nothing here talks to Supabase or knows any Svelte.
 */

import { hasChosenDates, type CreationDraft } from '$lib/creation-draft';
import { dayInTimezone } from '$lib/dates';
import { formatMoney } from '$lib/money';
import {
	CLOSE_OFFSET_OPTIONS,
	isDeadlinePast,
	nearestFutureOffset,
	relativeDeadlineInstant,
	relativeDeadlineLabel
} from '$lib/relative-deadline';

/** The parts of a draft the application rules read. */
export type ApplicationFacts = Pick<
	CreationDraft,
	| 'startDate'
	| 'timezone'
	| 'prefillSources'
	| 'applicationOpenMode'
	| 'applicationsOpenAt'
	| 'applicationCloseRule'
	| 'applicationCloseOffsetDays'
	| 'applicationsCloseAt'
	| 'acceptsIndividualApplications'
	| 'acceptsDelegations'
	| 'committeePreferenceCount'
	| 'askMotivation'
>;

/** "2 April 2027": a moment as the day it falls on in the conference's own timezone. */
export function formatLongDay(moment: string, timeZone: string): string {
	return new Intl.DateTimeFormat('en-GB', {
		timeZone,
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	}).format(new Date(moment));
}

/** "1 question", "3 questions": a count with its noun, singular for one. */
function countOf(count: number, singular: string, plural: string): string {
	return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * The Committees card's chip. With none yet, a previous edition that had some
 * makes it "Not yet imported" (the card offers the import); otherwise
 * committees are optional, because a conference may publish before it has any.
 */
export function committeesStatus(
	committeeCount: number,
	previous: { committeeCount: number } | null
): 'configured' | 'not_imported' | 'optional' {
	if (committeeCount > 0) {
		return 'configured';
	}

	return previous !== null && previous.committeeCount > 0 ? 'not_imported' : 'optional';
}

/**
 * The moment applications close, worked out from the rule: counted back from
 * the first day, or the fixed moment saved. `null` while there is none, as
 * with a relative deadline before the dates are chosen.
 */
export function closingMoment(draft: ApplicationFacts): string | null {
	if (draft.applicationCloseRule === 'fixed') {
		return draft.applicationsCloseAt;
	}

	if (!hasChosenDates(draft)) {
		return null;
	}

	return relativeDeadlineInstant(draft.startDate, draft.applicationCloseOffsetDays, draft.timezone);
}

/**
 * The Applications card's chip: "Review" when the deadline has gone by, or a
 * fixed deadline is missing or falls after the conference has started, since
 * nobody could apply in time. Everything else is a working setup.
 */
export function applicationsStatus(draft: ApplicationFacts, now: Date): 'configured' | 'review' {
	const closesAt = closingMoment(draft);

	if (isDeadlinePast(closesAt, now)) {
		return 'review';
	}

	if (draft.applicationCloseRule === 'fixed') {
		// Both sides are `YYYY-MM-DD`, so comparing them as text compares them as days.
		if (closesAt === null || dayInTimezone(new Date(closesAt), draft.timezone) > draft.startDate) {
			return 'review';
		}
	}

	return 'configured';
}

/**
 * The Fees card's chip: a free conference is done, a paid one is done once it
 * has a fee and needs a look until then, and "Decide later" is not decided.
 */
export function feesStatus(
	draft: Pick<CreationDraft, 'feeStatus'>,
	feeCount: number
): 'ready' | 'configured' | 'review' | 'not_decided' {
	if (draft.feeStatus === 'free') {
		return 'ready';
	}

	if (draft.feeStatus === 'paid') {
		return feeCount > 0 ? 'configured' : 'review';
	}

	return 'not_decided';
}

/** The six facts on the Applications card, in the order it shows them. */
export type ApplicationsSummary = {
	applicantType: string;
	preferences: string;
	opens: string;
	closes: string;
	motivation: string;
	customQuestions: string;
};

/** "Individual delegates + Delegations", or whichever of the two is open, or "Nobody yet". */
function applicantTypeLine(draft: ApplicationFacts): string {
	const types = [
		draft.acceptsIndividualApplications ? 'Individual delegates' : null,
		draft.acceptsDelegations ? 'Delegations' : null
	].filter((type) => type !== null);

	return types.length === 0 ? 'Nobody yet' : types.join(' + ');
}

/** "Opens when you choose", "Opens when published" or "Opens on 1 March 2027". */
function opensLine(draft: ApplicationFacts): string {
	if (draft.applicationOpenMode === 'on_publish') {
		return 'Opens when published';
	}

	if (draft.applicationOpenMode === 'scheduled' && draft.applicationsOpenAt !== null) {
		return `Opens on ${formatLongDay(draft.applicationsOpenAt, draft.timezone)}`;
	}

	return 'Opens when you choose';
}

/** "2 weeks before conference · 2 April 2027", or "On 2 April 2027" for a fixed date. */
function closesLine(draft: ApplicationFacts): string {
	const closesAt = closingMoment(draft);

	if (draft.applicationCloseRule === 'fixed') {
		return closesAt === null ? 'No date set' : `On ${formatLongDay(closesAt, draft.timezone)}`;
	}

	const rule = relativeDeadlineLabel(draft.applicationCloseOffsetDays);
	// The rule reads "2 weeks before conference"; the sentence starts with a capital.
	const sentence = rule.charAt(0).toUpperCase() + rule.slice(1);

	return closesAt === null ? sentence : `${sentence} · ${formatLongDay(closesAt, draft.timezone)}`;
}

/** The words for the Applications card, from the draft and the counts the page loaded. */
export function applicationsSummary(
	draft: ApplicationFacts,
	questionCount: number,
	committeeCount: number
): ApplicationsSummary {
	let preferences = 'None';

	// Applicants rank committees, so the choice means nothing until there are some.
	if (committeeCount === 0) {
		preferences = 'Available once committees exist';
	} else if (draft.committeePreferenceCount > 0) {
		preferences = countOf(draft.committeePreferenceCount, 'preference', 'preferences');
	}

	return {
		applicantType: applicantTypeLine(draft),
		preferences,
		opens: opensLine(draft),
		closes: closesLine(draft),
		motivation: draft.askMotivation ? 'On' : 'Off',
		customQuestions: questionCount === 0 ? 'None' : countOf(questionCount, 'question', 'questions')
	};
}

/**
 * The quiet line the Applications card shows when a relative deadline has
 * already gone by, naming a shorter one that still works, or `null` when
 * there is nothing to say.
 */
export function pastDeadlineNote(draft: ApplicationFacts, now: Date): string | null {
	if (draft.applicationCloseRule !== 'relative' || !isDeadlinePast(closingMoment(draft), now)) {
		return null;
	}

	const offset = nearestFutureOffset(
		draft.startDate,
		draft.applicationCloseOffsetDays,
		draft.timezone,
		now
	);

	if (offset === null) {
		return 'The deadline has passed and the conference is about to start.';
	}

	const known = CLOSE_OFFSET_OPTIONS.find((option) => Number(option.value) === offset);
	const suggestion = known?.label ?? relativeDeadlineLabel(offset);

	return `The deadline has passed. Try ${suggestion}.`;
}

/**
 * "€35 delegate fee": a fee as one short phrase, with whole amounts written
 * without the cents. The name loses its capital unless it is an abbreviation.
 */
export function feePhrase(fee: { name: string; amountCents: number }, currency: string): string {
	const amount = formatMoney(fee.amountCents, currency).replace(/\.00$/, '');
	const startsWithAbbreviation = /^[A-Z]{2}/.test(fee.name);
	const name = startsWithAbbreviation
		? fee.name
		: fee.name.charAt(0).toLowerCase() + fee.name.slice(1);

	return `${amount} ${name}`;
}

/** "Added (about 120 words)" or "Not added", for the Public page card. */
export function descriptionFact(description: string | null): string {
	const words = (description ?? '').split(/\s+/).filter((word) => word !== '').length;

	if (words === 0) {
		return 'Not added';
	}

	// Rounded to the nearest ten, because the exact count is not the point.
	const about = Math.max(10, Math.round(words / 10) * 10);

	return `Added (about ${about} words)`;
}

/** Which picture heads the public page, in words. */
export function bannerFact(draft: Pick<CreationDraft, 'bannerPath' | 'logoPath'>): string {
	if (draft.bannerPath !== null) {
		return 'Conference banner';
	}

	return draft.logoPath !== null ? 'Using organisation branding' : 'No banner yet';
}
