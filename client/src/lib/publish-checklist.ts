/**
 * The rules behind the publish checklist on the conference dashboard.
 *
 * `05-pages/organiser/dashboard.md` lists eight things an organiser has to do
 * before a conference is worth showing to the world, and says which of them are
 * required. The page draws that list and the `publish` form action refuses to
 * publish while a required item is open, so both ask the functions below rather
 * than working it out for themselves. Written once, the two cannot disagree
 * about whether a conference is ready.
 *
 * Nothing here talks to Supabase, imports from `$lib/server` or knows any
 * Svelte. The counts it needs beyond the conference row itself are handed in.
 */

import type { ResolvedPathname } from '$app/types';
import { formatConferenceDay, type Conference } from '$lib/conferences';
import { dayInTimezone } from '$lib/dates';
import {
	manageApplicationFormUrl,
	manageCommitteesUrl,
	manageCommitteeUrl,
	manageDetailsUrl,
	manageFeesUrl,
	newCommitteeUrl,
	organizationSettingsUrl
} from '$lib/urls';

/** One line of the checklist. */
export type PublishChecklistItem = {
	/** The words on the line, such as "Add a banner image". */
	label: string;
	isDone: boolean;
	/** Required items must all be done before the conference can be published. */
	isRequired: boolean;
	/**
	 * Where the organiser goes to do it.
	 *
	 * Every address `05-pages/organiser/dashboard.md` gives is written now that
	 * the pages behind them are built: the four items the details editor answers
	 * carry its address, the committees item the committees list's from T21,
	 * "Connect Stripe" the organisation settings page's from T23, the fees item
	 * the fees page's from T66, and the application window item the application
	 * form page's from T67. It stays optional all the same, because "Connect
	 * Stripe" has none to offer for a conference whose organisation could not be
	 * read.
	 *
	 * Each of those links had to wait for its own task, because `resolve()` from
	 * `$app/paths` refuses an address whose folder is not under `src/routes/`
	 * yet: a link can only be written once its page exists. That is the rule any
	 * item added here has to live with, and `manageSidebarGroups` in
	 * `$lib/manage-sidebar.ts` grows the same way.
	 */
	href?: ResolvedPathname;
};

/**
 * What an item and a grouped line have in common, which is all the counting
 * functions at the bottom of this file ask about. Both lists can be counted
 * with them, and every required item is inside a required line, so the two
 * give the same answer to `canPublish`.
 */
export type ChecklistEntry = {
	isDone: boolean;
	isRequired: boolean;
};

/** What the checklist needs to know beyond the conference row itself. */
export type PublishChecklistCounts = {
	/** How many committees the conference has, counted beside the seats below. */
	committeeCount: number;
	/** Committees with no seat whose `is_available` is true. Item 4 fails while this is above zero. */
	committeesWithoutAvailableSeatsCount: number;
	feeCount: number;
	collectsPaymentsManually: boolean;
	isStripeConnected: boolean;
	/**
	 * The id of the committee without an available seat, when exactly one has
	 * none, and `null` otherwise. The "Add a committee with seats" line sends the
	 * organiser straight to that committee's editor rather than to the list.
	 */
	onlyCommitteeWithoutSeatsId: string | null;
};

/** Whether a column that may be empty holds real words rather than nothing or spaces. */
function hasText(value: string | null): boolean {
	return value !== null && value.trim() !== '';
}

/** Item 1: both the description and the one-line tagline are written. */
function isDescribed(conference: Conference): boolean {
	return hasText(conference.description) && hasText(conference.tagline);
}

/** Item 4: there is at least one committee, and every one of them has a seat on offer. */
function hasCommitteesWithSeats(counts: PublishChecklistCounts): boolean {
	return counts.committeeCount >= 1 && counts.committeesWithoutAvailableSeatsCount === 0;
}

/**
 * Item 5: both ends of the application window are set, the window closes after
 * it opens, and it closes before the conference's first day.
 */
function hasApplicationWindow(conference: Conference): boolean {
	if (conference.applicationsOpenAt === null || conference.applicationsCloseAt === null) {
		return false;
	}

	const opensAt = new Date(conference.applicationsOpenAt);
	const closesAt = new Date(conference.applicationsCloseAt);

	if (closesAt.getTime() <= opensAt.getTime()) {
		return false;
	}

	// The conference's first day begins at midnight where the conference is, and
	// `new Date('2027-01-24')` is midnight UTC, which is a different moment
	// anywhere east or west of Greenwich. So the closing moment becomes the day
	// it falls on in the conference's own timezone instead. Both sides are then
	// `YYYY-MM-DD` in that same zone, and comparing them as text compares them
	// as dates.
	const closingDay = dayInTimezone(closesAt, conference.timezone);

	return closingDay < conference.startDate;
}

/** Item 6: there is something to charge, or the organisers collect the money themselves. */
function hasFeesOrManualCollection(counts: PublishChecklistCounts): boolean {
	return counts.feeCount >= 1 || counts.collectsPaymentsManually;
}

/**
 * Whether item 7 belongs in the list at all.
 *
 * A line telling somebody to connect Stripe when nothing will ever be charged
 * through it is noise, so the item only appears once there are fees and the
 * organisers are not collecting the money themselves.
 */
function needsStripe(counts: PublishChecklistCounts): boolean {
	return counts.feeCount > 0 && !counts.collectsPaymentsManually;
}

/**
 * The eight rules of the checklist for one conference, one item per rule, in
 * the order `05-pages/organiser/dashboard.md` first listed them.
 *
 * Seven of the eight items are always there. "Connect Stripe" is the exception:
 * see `needsStripe` above for why it comes and goes.
 *
 * The dashboard no longer draws these one by one: `publishChecklist` below
 * groups them into one line per page to visit. They stay because the card of a
 * draft on `/manage` counts them ("Checklist 3/7"), and each rule keeps its own
 * test here.
 */
export function publishChecklistItems(
	conference: Conference,
	counts: PublishChecklistCounts
): PublishChecklistItem[] {
	// Four of the items are answered on the details editor, so the address is
	// worked out once rather than four times.
	const detailsHref = manageDetailsUrl(conference.slug);

	const items: PublishChecklistItem[] = [
		{
			label: 'Describe the conference',
			isDone: isDescribed(conference),
			isRequired: true,
			href: detailsHref
		},
		{
			label: 'Add a banner image',
			// `hasText` rather than a plain "not null", the same as the three items
			// around it: `banner_path` is a text column, and a row holding an empty
			// string has no picture in the bucket any more than a null one does.
			isDone: hasText(conference.bannerPath),
			// Recommended rather than required since the manage redesign: a
			// conference page without a picture still says everything an
			// applicant needs (`03-design/manage-redesign/README.md`).
			isRequired: false,
			href: detailsHref
		},
		{
			label: 'Set the venue',
			isDone: hasText(conference.venueName),
			isRequired: true,
			href: detailsHref
		},
		{
			label: 'Add at least one committee with seats',
			isDone: hasCommitteesWithSeats(counts),
			isRequired: true,
			href: manageCommitteesUrl(conference.slug)
		},
		{
			label: 'Set the application window',
			isDone: hasApplicationWindow(conference),
			isRequired: true,
			href: manageApplicationFormUrl(conference.slug)
		},
		{
			label: 'Set fees or choose manual collection',
			isDone: hasFeesOrManualCollection(counts),
			isRequired: false,
			href: manageFeesUrl(conference.slug)
		}
	];

	if (needsStripe(counts)) {
		items.push({
			label: 'Connect Stripe',
			isDone: counts.isStripeConnected,
			isRequired: false,
			// Stripe is connected on the organisation's own page rather than on
			// the conference's, because one Stripe account serves every
			// conference the organisation runs. A conference whose organisation
			// could not be read has no address to offer, and the item is then
			// drawn as plain words; `PublishChecklist` already handles an item
			// with no `href`.
			href: conference.organizationSlug
				? organizationSettingsUrl(conference.organizationSlug)
				: undefined
		});
	}

	items.push({
		label: 'Add a contact email',
		isDone: hasText(conference.contactEmail),
		isRequired: true,
		href: detailsHref
	});

	return items;
}

/**
 * Which of the grouped lines this is. Each names the page the line is
 * answered on, and `setupProgressFromChecklist` in `$lib/setup-steps.ts` uses
 * it to tick the setup step that page belongs to.
 */
export type PublishChecklistLineKey =
	'committees' | 'details' | 'banner' | 'application-window' | 'fees' | 'stripe' | 'publish';

/**
 * One line of the checklist the dashboard draws: one page to visit, grouping
 * the items that page answers (`05-pages/organiser/dashboard.md`, "Publish
 * checklist lines").
 */
export type PublishChecklistLine = {
	key: PublishChecklistLineKey;
	/** The words on the line, such as "Finish the details". */
	label: string;
	/** A second, smaller line saying what is missing, such as "A banner and the venue". */
	detail?: string;
	isDone: boolean;
	/**
	 * The committees, details and window lines are required to publish; the
	 * banner, fees and Stripe lines are recommended.
	 */
	isRequired: boolean;
	/** The words on the line's button or link, naming the act: "Add a committee". */
	actionLabel: string;
	/**
	 * Where the button or link goes. The Publish line has none, because it is
	 * the `publish` form itself, and "Connect Stripe" has none when the
	 * conference's organisation could not be read.
	 */
	href?: ResolvedPathname;
};

/**
 * "A banner, the venue and a contact email": the parts of a list joined the
 * way a sentence joins them, the first letter made a capital.
 */
function joinAsSentence(parts: string[]): string {
	const allButLast = parts.slice(0, -1);
	const last = parts[parts.length - 1];
	const joined = allButLast.length > 0 ? `${allButLast.join(', ')} and ${last}` : last;

	return joined.charAt(0).toUpperCase() + joined.slice(1);
}

/** Line 1: a committee, and a seat on offer in every committee (item 4). */
function committeesLine(
	conference: Conference,
	counts: PublishChecklistCounts
): PublishChecklistLine {
	const line: PublishChecklistLine = {
		key: 'committees',
		label: 'Add a committee with seats',
		isDone: hasCommitteesWithSeats(counts),
		isRequired: true,
		actionLabel: 'Committees',
		href: manageCommitteesUrl(conference.slug)
	};

	if (line.isDone) {
		return line;
	}

	// No committee at all: the form that makes the first one.
	if (counts.committeeCount === 0) {
		return { ...line, actionLabel: 'Add a committee', href: newCommitteeUrl(conference.slug) };
	}

	const withoutSeats = counts.committeesWithoutAvailableSeatsCount;
	const detail =
		withoutSeats === 1
			? '1 committee has no seat on offer yet'
			: `${withoutSeats} committees have no seat on offer yet`;

	// Exactly one committee without seats: straight to its editor. With several,
	// the list is the one page that shows which.
	const href =
		counts.onlyCommitteeWithoutSeatsId === null
			? manageCommitteesUrl(conference.slug)
			: manageCommitteeUrl(conference.slug, counts.onlyCommitteeWithoutSeatsId);

	return { ...line, detail, actionLabel: 'Add seats', href };
}

/**
 * Line 2: the three required items the details editor answers (items 1, 3
 * and 8). The banner (item 2) is recommended, so it has a line of its own.
 */
function detailsLine(conference: Conference): PublishChecklistLine {
	// What is still missing, in the order the details editor asks for it.
	const missing: string[] = [];

	if (!isDescribed(conference)) {
		missing.push('a description and tagline');
	}

	if (!hasText(conference.venueName)) {
		missing.push('the venue');
	}

	if (!hasText(conference.contactEmail)) {
		missing.push('a contact email');
	}

	const isDone = missing.length === 0;

	return {
		key: 'details',
		label: 'Finish the details',
		detail: isDone ? undefined : joinAsSentence(missing),
		isDone,
		isRequired: true,
		actionLabel: isDone ? 'Details' : 'Finish the details',
		href: manageDetailsUrl(conference.slug)
	};
}

/**
 * The banner line (item 2): recommended, so it never stands in the way of
 * publishing, but the Publish page lists it under "Worth doing, not required".
 */
function bannerLine(conference: Conference): PublishChecklistLine {
	const isDone = hasText(conference.bannerPath);

	return {
		key: 'banner',
		label: 'Add a banner',
		detail: isDone ? undefined : 'Conferences with a picture get more applications.',
		isDone,
		isRequired: false,
		actionLabel: isDone ? 'Details' : 'Add a banner',
		href: manageDetailsUrl(conference.slug)
	};
}

/**
 * Line 3: the application window (item 5).
 *
 * Once it is set, the line says what it is rather than asking for it, because
 * `/create` fills a window in (`organiser/create.md`) and the organiser's job
 * is then only to check it: "Applications: open as soon as you publish, until
 * 24 Sep 2026", with "Change".
 */
function applicationWindowLine(conference: Conference, now: Date): PublishChecklistLine {
	const href = manageApplicationFormUrl(conference.slug);
	const isDone = hasApplicationWindow(conference);

	// `hasApplicationWindow` has already checked both ends are set when it is
	// done; the second half of the test only tells TypeScript so.
	if (
		!isDone ||
		conference.applicationsOpenAt === null ||
		conference.applicationsCloseAt === null
	) {
		return {
			key: 'application-window',
			label: 'Set the application window',
			isDone: false,
			isRequired: true,
			actionLabel: 'Set the application window',
			href
		};
	}

	const closingDay = formatConferenceDay(conference.applicationsCloseAt, conference.timezone);
	const opensAt = new Date(conference.applicationsOpenAt);

	// A window that has already opened opens, for applicants, the moment the
	// conference is published.
	const opening =
		opensAt.getTime() <= now.getTime()
			? 'open as soon as you publish'
			: `open on ${formatConferenceDay(conference.applicationsOpenAt, conference.timezone)}`;

	return {
		key: 'application-window',
		label: `Applications: ${opening}, until ${closingDay}`,
		isDone: true,
		isRequired: true,
		actionLabel: 'Change',
		href
	};
}

/**
 * The publish checklist as lines: one per thing to visit, in the order a
 * first conference is usually set up (`05-pages/organiser/dashboard.md`,
 * "Publish checklist lines"). The sidebar's setup steps and the Publish page
 * (`05-pages/organiser/publish.md`) both read it.
 *
 * The eight rules of `publishChecklistItems` are unchanged; this only groups
 * them. "Connect Stripe" comes and goes for the reason `needsStripe` gives, so
 * the list is six lines long without it and seven with it.
 *
 * `now` is asked for rather than read, so the window line's "as soon as you
 * publish" can be tested; the page hands in the moment its `load` ran.
 */
export function publishChecklist(
	conference: Conference,
	counts: PublishChecklistCounts,
	now: Date
): PublishChecklistLine[] {
	const lines: PublishChecklistLine[] = [
		committeesLine(conference, counts),
		detailsLine(conference),
		bannerLine(conference),
		applicationWindowLine(conference, now),
		{
			key: 'fees',
			label: 'Set fees or choose manual collection',
			isDone: hasFeesOrManualCollection(counts),
			isRequired: false,
			actionLabel: 'Fees',
			href: manageFeesUrl(conference.slug)
		}
	];

	if (needsStripe(counts)) {
		lines.push({
			key: 'stripe',
			label: 'Connect Stripe',
			isDone: counts.isStripeConnected,
			isRequired: false,
			actionLabel: 'Connect Stripe',
			// The organisation's page, for the reason `publishChecklistItems` gives.
			href: conference.organizationSlug
				? organizationSettingsUrl(conference.organizationSlug)
				: undefined
		});
	}

	// The last line is the act the others lead to. It is neither required nor
	// recommended: it is what "every required line done" unlocks, so it is not
	// counted as one of them.
	lines.push({
		key: 'publish',
		label: 'Publish',
		isDone: conference.status !== 'draft',
		isRequired: false,
		actionLabel: 'Publish conference'
	});

	return lines;
}

/**
 * Which line carries the checklist's one primary button: the first required
 * line still undone, or the Publish line once every required line is done
 * (P1 in `03-design/streamlining/design.md`).
 */
export function nextChecklistLineKey(lines: PublishChecklistLine[]): PublishChecklistLineKey {
	const firstUndone = lines.find((line) => line.isRequired && !line.isDone);

	return firstUndone ? firstUndone.key : 'publish';
}

/**
 * How many required items are still open.
 *
 * This and the functions below take the finished list rather than the
 * conference, so that the page and the `publish` action both count the very
 * list the reader is looking at. They take either the eight items or the six
 * grouped lines.
 */
export function countRemainingRequired(items: ChecklistEntry[]): number {
	const remaining = items.filter((item) => item.isRequired && !item.isDone);

	return remaining.length;
}

/** How many of the items are required at all, for "5 of 6 required items". */
export function countRequired(items: ChecklistEntry[]): number {
	const required = items.filter((item) => item.isRequired);

	return required.length;
}

/**
 * How many of the items are done, the required and the recommended ones
 * together.
 *
 * The two functions above are about the required items alone, because those are
 * what publishing waits for. This one counts every item, because it answers the
 * "Checklist 3/7" line on a conference's card on `/manage`, where there is room
 * for one number and no room for the list it came from. A reader who wants to
 * know which of the seven are still open opens the conference's dashboard.
 */
export function countDone(items: ChecklistEntry[]): number {
	const done = items.filter((item) => item.isDone);

	return done.length;
}

/**
 * Whether the conference may be published: every required item is done.
 *
 * A recommended item that is still open does not stand in the way. That is the
 * whole point of the two kinds.
 */
export function canPublish(items: ChecklistEntry[]): boolean {
	return countRemainingRequired(items) === 0;
}
