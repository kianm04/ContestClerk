/**
 * How far a draft is from going public (Trello fe3reN7Y): the status chips
 * the Setup step shows on each of its cards, and the readiness table, the
 * blockers and the launch choices the Launch step is built from.
 *
 * Every rule here is deliberately lenient. "To be announced", "Not decided"
 * and "Unassigned" are legitimate answers, never errors: only a missing
 * name, missing dates, or a missing city for an in-person conference stops
 * publishing. Nothing here talks to Supabase or knows any Svelte.
 */

import type { ResolvedPathname } from '$app/types';
import {
	datesLine,
	feesLine,
	hasChosenDates,
	locationLine,
	venueLine,
	type ApplicationOpenMode,
	type CreationDraft
} from '$lib/creation-draft';
import { formatMoney } from '$lib/money';
import { isDeadlinePast, relativeDeadlineLabel } from '$lib/relative-deadline';
import { createSetupDialogUrl, createStepUrl } from '$lib/urls';

/** The parts of a draft the public page rules read. */
export type PublicPageFacts = Pick<
	CreationDraft,
	| 'name'
	| 'locationMode'
	| 'city'
	| 'countryCode'
	| 'description'
	| 'contactEmail'
	| 'prefillSources'
>;

/** Whether a column that may be empty holds real words rather than nothing or spaces. */
function hasText(value: string | null): boolean {
	return value !== null && value.trim() !== '';
}

/**
 * Whether the draft says enough about where it happens to go public: an
 * online conference happens nowhere in particular, and any other needs a
 * city and a country. The venue may stay "to be announced".
 */
export function hasValidLocation(
	draft: Pick<CreationDraft, 'locationMode' | 'city' | 'countryCode'>
): boolean {
	if (draft.locationMode === 'online') {
		return true;
	}

	return hasText(draft.city) && hasText(draft.countryCode);
}

/**
 * The Setup step's word for the public page, and the Launch step's row for it.
 *
 * - `blocked`: no name, or an in-person conference with no city: it cannot go public.
 * - `needs_dates`: the dates are still the placeholder a new draft is given.
 * - `ready`: it also has a description and a contact email.
 * - `mostly_ready`: it can go public, and a description or contact email would help.
 */
export function publicPageStatus(
	draft: PublicPageFacts
): 'ready' | 'mostly_ready' | 'needs_dates' | 'blocked' {
	if (!hasText(draft.name) || !hasValidLocation(draft)) {
		return 'blocked';
	}

	if (!hasChosenDates(draft)) {
		return 'needs_dates';
	}

	if (hasText(draft.description) && hasText(draft.contactEmail)) {
		return 'ready';
	}

	return 'mostly_ready';
}

/*
	The Launch step from here on: what stops the conference going public, what
	stops applications opening with it, the readiness table, the ways to
	launch, and the suggestions that are worth doing but never required.
*/

/** The facts about a draft that live in other tables, counted for the Launch step. */
export type LaunchFacts = {
	committeeCount: number;
	/** How many committees the previous edition had to import, or `null` without one. */
	previousCommitteeCount: number | null;
	questionCount: number;
	feeCount: number;
	/** The first fee in position order, or `null` when there are none. */
	firstFee: { name: string; amountCents: number } | null;
	organizationName: string;
};

/** "1 March 2027": a moment as the day it falls on in the conference's own timezone. */
function formatLongDay(moment: string, timeZone: string): string {
	return new Intl.DateTimeFormat('en-GB', {
		timeZone,
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	}).format(new Date(moment));
}

/**
 * Why the draft cannot go public yet, one sentence each, or an empty list
 * when it can. Only these stop it: a name, chosen dates in the right order,
 * and a city and a country for a conference held somewhere. A venue or
 * times "to be announced", no pictures, no fees, no committees and no team
 * never do: they are honest answers, and the page says them as such.
 */
export function publishBlockers(
	draft: Pick<
		CreationDraft,
		'name' | 'startDate' | 'endDate' | 'locationMode' | 'city' | 'countryCode' | 'prefillSources'
	>
): string[] {
	const blockers: string[] = [];

	if (!hasText(draft.name)) {
		blockers.push('Give the conference a name on the Basics step.');
	}

	if (!hasChosenDates(draft)) {
		blockers.push('Pick the conference dates on the When & where step.');
	} else if (draft.endDate < draft.startDate) {
		// Both are `YYYY-MM-DD`, so comparing them as text compares them as dates.
		blockers.push('The last day is before the first. Fix the dates on the When & where step.');
	}

	if (!hasValidLocation(draft)) {
		blockers.push('Add the city and country on the When & where step.');
	}

	return blockers;
}

/**
 * Why applications cannot open at the moment of publishing, or an empty
 * list when they can. Publishing alone never needs these.
 */
export function openApplicationsBlockers(
	draft: Pick<CreationDraft, 'committeePreferenceCount' | 'applicationsCloseAt'>,
	committeeCount: number,
	now: Date
): string[] {
	const blockers: string[] = [];

	// Applicants are asked to rank committees, so there have to be some to rank.
	if (draft.committeePreferenceCount > 0 && committeeCount === 0) {
		blockers.push(
			'Add committees before opening applications, or set committee preferences to none.'
		);
	}

	if (isDeadlinePast(draft.applicationsCloseAt, now)) {
		blockers.push('The application deadline has passed. Change it in Setup.');
	}

	return blockers;
}

/** The words on a fee: "Delegate fee · €35.00", with how many more there are. */
export function launchFeeSummary(
	facts: Pick<LaunchFacts, 'feeCount' | 'firstFee'>,
	currency: string
): string | null {
	if (facts.firstFee === null || facts.feeCount === 0) {
		return null;
	}

	const first = `${facts.firstFee.name} · ${formatMoney(facts.firstFee.amountCents, currency)}`;
	const others = facts.feeCount - 1;

	return others === 0 ? first : `${first} and ${others} more`;
}

/** One row of the Launch step's readiness table. */
export type LaunchRow = {
	key:
		| 'organization'
		| 'basics'
		| 'dates'
		| 'venue'
		| 'public_page'
		| 'committees'
		| 'applications'
		| 'fees';
	label: string;
	detail: string;
	status: 'ready' | 'optional' | 'review' | 'blocked';
	/**
	 * The step that fixes a row which stops publishing, or that would make a
	 * "mostly ready" public page ready; `null` for every other row.
	 */
	href: ResolvedPathname | null;
};

/** The Basics row: the name is required, the rest can come later. */
function basicsRow(draft: CreationDraft): LaunchRow {
	const row: LaunchRow = {
		key: 'basics',
		label: 'Basics',
		detail: 'Name, description, branding and contact details',
		status: 'ready',
		href: null
	};

	if (!hasText(draft.name)) {
		return {
			...row,
			detail: 'A name is needed',
			status: 'blocked',
			href: createStepUrl(draft.slug, 'basics')
		};
	}

	if (!hasText(draft.description)) {
		return { ...row, detail: 'Description can be added later' };
	}

	if (!hasText(draft.contactEmail)) {
		return { ...row, detail: 'Contact details can be added later' };
	}

	return row;
}

/** The Dates & location row: the one row a fresh draft without history is stopped by. */
function datesRow(draft: CreationDraft): LaunchRow {
	const row: LaunchRow = {
		key: 'dates',
		label: 'Dates & location',
		detail: `${datesLine(draft)} · ${locationLine(draft)}`,
		status: 'ready',
		href: null
	};
	const fix = { status: 'blocked' as const, href: createStepUrl(draft.slug, 'when') };

	if (!hasChosenDates(draft)) {
		return { ...row, ...fix, detail: 'Dates needed' };
	}

	if (draft.endDate < draft.startDate) {
		return { ...row, ...fix, detail: 'The last day is before the first' };
	}

	if (!hasValidLocation(draft)) {
		return { ...row, ...fix, detail: 'City and country needed' };
	}

	return row;
}

/** The Public page row, from the same rule the Setup step's chip uses. */
function publicPageRow(draft: CreationDraft): LaunchRow {
	const status = publicPageStatus(draft);
	const row: LaunchRow = {
		key: 'public_page',
		label: 'Public page',
		detail: 'Ready',
		status: 'ready',
		href: null
	};

	// Still ready to publish, but the words link to Basics, where the
	// description and contact email that would finish it are added.
	if (status === 'mostly_ready') {
		return { ...row, detail: 'Mostly ready', href: createStepUrl(draft.slug, 'basics') };
	}

	if (status === 'needs_dates') {
		return {
			...row,
			detail: 'Waiting for the dates',
			status: 'blocked',
			href: createStepUrl(draft.slug, 'when')
		};
	}

	if (status === 'blocked') {
		return {
			...row,
			detail: 'Needs a name and a place',
			status: 'blocked',
			href: createStepUrl(draft.slug, hasText(draft.name) ? 'when' : 'basics')
		};
	}

	return row;
}

/** The Committees row: welcome, never required to publish. */
function committeesRow(committeeCount: number, previousCommitteeCount: number | null): LaunchRow {
	const row: LaunchRow = {
		key: 'committees',
		label: 'Committees',
		detail: '',
		status: 'ready',
		href: null
	};

	if (committeeCount > 0) {
		return {
			...row,
			detail: `${committeeCount} ${committeeCount === 1 ? 'committee' : 'committees'}`
		};
	}

	if (previousCommitteeCount !== null && previousCommitteeCount > 0) {
		return {
			...row,
			detail: `${previousCommitteeCount} available to import, not required to publish`,
			status: 'optional'
		};
	}

	return { ...row, detail: 'None yet, not required to publish', status: 'optional' };
}

/** The Applications row: how they close, or that the closing moment has gone by. */
function applicationsRow(draft: CreationDraft, now: Date): LaunchRow {
	const row: LaunchRow = {
		key: 'applications',
		label: 'Applications',
		detail: '',
		status: 'ready',
		href: null
	};

	if (isDeadlinePast(draft.applicationsCloseAt, now)) {
		return { ...row, detail: 'The application deadline has passed', status: 'review' };
	}

	if (draft.applicationCloseRule === 'relative') {
		const when = relativeDeadlineLabel(draft.applicationCloseOffsetDays);

		return { ...row, detail: `Configured to close ${when}` };
	}

	if (draft.applicationsCloseAt !== null) {
		return {
			...row,
			detail: `Configured to close on ${formatLongDay(draft.applicationsCloseAt, draft.timezone)}`
		};
	}

	return { ...row, detail: 'Configured, with no closing date yet' };
}

/** The Fees row: deciding them can wait. */
function feesRow(draft: CreationDraft, facts: LaunchFacts): LaunchRow {
	const row: LaunchRow = { key: 'fees', label: 'Fees', detail: '', status: 'ready', href: null };

	if (draft.feeStatus === 'free') {
		return { ...row, detail: 'Free' };
	}

	if (facts.feeCount > 0 && facts.firstFee !== null) {
		const amount = formatMoney(facts.firstFee.amountCents, draft.currency);
		const count = `${facts.feeCount} ${facts.feeCount === 1 ? 'fee' : 'fees'}`;

		return { ...row, detail: `${count} · ${amount}` };
	}

	if (draft.feeStatus === 'paid') {
		return { ...row, detail: 'Paid, amounts not added yet', status: 'optional' };
	}

	return { ...row, detail: 'Not decided yet, optional for now', status: 'optional' };
}

/**
 * The readiness table of the Launch step, one row per part of the
 * conference, in the order the steps asked for them. Only a row marked
 * `blocked` stops publishing, and those are exactly `publishBlockers`.
 */
export function launchRows(draft: CreationDraft, facts: LaunchFacts, now: Date): LaunchRow[] {
	const venue = venueLine(draft);

	return [
		{
			key: 'organization',
			label: 'Organisation',
			detail: facts.organizationName,
			status: 'ready',
			href: null
		},
		basicsRow(draft),
		datesRow(draft),
		{
			key: 'venue',
			label: 'Venue',
			// "To be announced" is a legitimate answer, so it is ready as it is.
			detail: venue === 'Venue to be announced' ? 'To be announced' : venue,
			status: 'ready',
			href: null
		},
		publicPageRow(draft),
		committeesRow(facts.committeeCount, facts.previousCommitteeCount),
		applicationsRow(draft, now),
		feesRow(draft, facts)
	];
}

/** What the organiser picks at Launch: the page alone, or the page and applications. */
export type LaunchChoiceValue = 'publish' | 'publish_and_open';

export type LaunchChoices = {
	mode: ApplicationOpenMode;
	options: { value: LaunchChoiceValue; label: string; description: string }[];
	/** One sentence under a single option, saying why there is no choice. */
	note: string | null;
};

const PUBLISH_ONLY = {
	value: 'publish' as const,
	label: 'Publish conference only',
	description: 'Make the conference page public now. Applications stay closed.'
};

const PUBLISH_AND_OPEN = {
	value: 'publish_and_open' as const,
	label: 'Publish and open applications',
	description: 'Publish the conference and start accepting applications immediately.'
};

/**
 * The ways to launch. Publishing and opening applications are separate
 * decisions, and Setup already made the second for two of the three modes:
 * then there is one option and a note saying what will happen.
 */
export function launchChoices(
	draft: Pick<CreationDraft, 'applicationOpenMode' | 'applicationsOpenAt' | 'timezone'>
): LaunchChoices {
	const mode = draft.applicationOpenMode;

	if (mode === 'on_publish') {
		return {
			mode,
			options: [PUBLISH_AND_OPEN],
			note: 'Publishing will also open applications. Change this in Setup › Applications if that is not intended.'
		};
	}

	if (mode === 'scheduled') {
		const when =
			draft.applicationsOpenAt === null
				? ''
				: ` on ${formatLongDay(draft.applicationsOpenAt, draft.timezone)}`;

		return {
			mode,
			options: [
				{
					value: 'publish',
					label: 'Publish conference',
					description: 'Make the conference page public now. Applications open as scheduled.'
				}
			],
			note: `Applications open${when} as scheduled.`
		};
	}

	return { mode, options: [PUBLISH_ONLY, PUBLISH_AND_OPEN], note: null };
}

/**
 * What publishing will do about applications. Only a `manual` draft lets the
 * organiser choose; the other modes were decided in Setup, whatever a form
 * sends. A manual draft that sent nothing sensible only publishes, the
 * choice that cannot surprise anybody.
 */
export function effectiveLaunchChoice(
	mode: ApplicationOpenMode,
	sent: string | null
): LaunchChoiceValue {
	if (mode === 'on_publish') {
		return 'publish_and_open';
	}

	if (mode === 'scheduled') {
		return 'publish';
	}

	return sent === 'publish_and_open' ? 'publish_and_open' : 'publish';
}

/** One suggestion in "Optional before launch". */
export type LaunchImprovement = {
	/** Which suggestion it is, so the page can draw its icon. */
	key: 'description' | 'committees' | 'fees';
	label: string;
	description: string;
	actionLabel: string;
	href: ResolvedPathname;
};

/**
 * Up to three things worth doing before launch that never stop it: a
 * description, committees and fees, each linking to where it is done.
 * Committees are suggested only to a reader who manages every committee:
 * adding and importing them ask for that, and the Setup step hides both from
 * anybody else.
 */
export function optionalImprovements(
	draft: Pick<CreationDraft, 'slug' | 'description' | 'feeStatus'>,
	facts: Pick<LaunchFacts, 'committeeCount' | 'previousCommitteeCount'>,
	canManageCommittees: boolean
): LaunchImprovement[] {
	const improvements: LaunchImprovement[] = [];

	if (!hasText(draft.description)) {
		improvements.push({
			key: 'description',
			label: 'Add a short description',
			description: 'Introduce your conference to potential applicants.',
			actionLabel: 'Add description',
			href: createStepUrl(draft.slug, 'basics')
		});
	}

	if (facts.committeeCount === 0 && canManageCommittees) {
		const canImport = facts.previousCommitteeCount !== null && facts.previousCommitteeCount > 0;

		improvements.push(
			canImport
				? {
						key: 'committees',
						label: 'Import committees',
						description: 'Bring in the committees of your previous conference.',
						actionLabel: 'Import committees',
						href: createStepUrl(draft.slug, 'setup')
					}
				: {
						key: 'committees',
						label: 'Add committees',
						description: 'Add the committees delegates can apply to.',
						actionLabel: 'Add committees',
						href: createSetupDialogUrl(draft.slug, 'committee')
					}
		);
	}

	if (draft.feeStatus === 'undecided') {
		improvements.push({
			key: 'fees',
			label: 'Set fees',
			description: 'Add application or participation fees (optional).',
			actionLabel: 'Set fees',
			href: createSetupDialogUrl(draft.slug, 'fee')
		});
	}

	return improvements;
}

/** "Opening soon", "Open from the moment you publish" or "Open on 1 March 2027". */
function applicationsWord(
	draft: Pick<CreationDraft, 'applicationOpenMode' | 'applicationsOpenAt' | 'timezone'>
): string {
	if (draft.applicationOpenMode === 'on_publish') {
		return 'Open from the moment you publish';
	}

	if (draft.applicationOpenMode === 'scheduled' && draft.applicationsOpenAt !== null) {
		return `Open on ${formatLongDay(draft.applicationsOpenAt, draft.timezone)}`;
	}

	return 'Opening soon';
}

/**
 * The three facts an applicant meets first on the public page, as they will
 * read once it is published. Unknowns read "To be announced", never blank.
 */
export function whatApplicantsSee(
	draft: Pick<
		CreationDraft,
		| 'locationMode'
		| 'venueStatus'
		| 'venueName'
		| 'feeStatus'
		| 'applicationOpenMode'
		| 'applicationsOpenAt'
		| 'timezone'
	>,
	feeSummary: string | null
): { label: string; value: string }[] {
	const venue = venueLine(draft);
	const fees = feesLine(draft, feeSummary);

	return [
		{ label: 'Venue', value: venue === 'Venue to be announced' ? 'To be announced' : venue },
		{ label: 'Applications', value: applicationsWord(draft) },
		{ label: 'Fees', value: fees === 'Fees to be announced' ? 'To be announced' : fees }
	];
}

/**
 * The blue note under the public page preview about when applications open:
 * a short title, and one sentence under it.
 */
export function applicationsNote(
	draft: Pick<CreationDraft, 'applicationOpenMode' | 'applicationsOpenAt' | 'timezone'>
): { title: string; text: string } {
	if (draft.applicationOpenMode === 'on_publish') {
		return {
			title: 'Applications open on publishing',
			text: 'Applications open the moment you publish.'
		};
	}

	if (draft.applicationOpenMode === 'scheduled' && draft.applicationsOpenAt !== null) {
		const day = formatLongDay(draft.applicationsOpenAt, draft.timezone);

		return { title: 'Applications scheduled', text: `Applications open on ${day}.` };
	}

	return {
		title: 'Applications opening soon',
		text: 'Applications open when you choose to open them.'
	};
}
