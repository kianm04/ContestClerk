/**
 * Types, and reading the search from the address, for the conferences pages.
 *
 * The URL is the single source of truth for the search, the filters and the
 * current page. Every control on the page works by navigating to a new URL,
 * which re-runs the server load function in `+page.server.ts`. That is why the
 * back button, refreshing and sharing a link all work without any extra effort.
 *
 * It also holds the two rules `02-architecture/data-model.md` calls derived and
 * never stored: whether a conference is taking applications right now, and
 * whether it has already finished. They are written once, here, so the list, the
 * card and the conference's own page all answer the question the same way.
 *
 * Both the server and the browser import this file, so it must not contain
 * anything server-only. Server-only code lives in `$lib/server`. The links
 * themselves are built by `$lib/urls.ts`.
 */

import type { ApplicationStatus } from '$lib/applications';
import { isCountryCode } from '$lib/countries';
import type { Database } from '$lib/database.types';
import { dayInTimezone, daysBetween, formatDateRange } from '$lib/dates';
import { isConferenceRegion, REGION_OPTIONS, type ConferenceRegion } from '$lib/regions';
import { statusLabel, type BadgeTone } from '$lib/status';

/** `high_school` | `university` | `mixed`, straight from the database enum. */
export type ConferenceLevel = Database['public']['Enums']['conference_level'];

/** `draft` | `published` | `archived`. */
export type ConferenceStatus = Database['public']['Enums']['conference_status'];

/** `in_person` | `online` | `hybrid`: where the conference happens. */
export type LocationMode = Database['public']['Enums']['location_mode'];

/** `known` | `tba`: whether the organiser has decided something yet, such as the venue. */
export type KnownOrTba = Database['public']['Enums']['known_or_tba'];

/** `free` | `paid` | `undecided`. */
export type FeeStatus = Database['public']['Enums']['fee_status'];

/** `manual` | `on_publish` | `scheduled`: how the application window gets opened. */
export type ApplicationOpenMode = Database['public']['Enums']['application_open_mode'];

/** A single conference, in the shape the pages display it. */
export type Conference = {
	id: string;
	/** The last part of the conference's own link, such as `thimun-2027`. */
	slug: string;
	name: string;
	description: string | null;
	/** `null` when the organization could not be found. */
	organizationName: string | null;
	/** The last part of the organisation's own link, or `null` when it could not be found. */
	organizationSlug: string | null;
	/**
	 * `null` for an online conference, which happens nowhere in particular, and
	 * for a draft that has not said where yet.
	 */
	city: string | null;
	/** Two letters, such as `NL`, or `null` on the same terms as `city`. */
	countryCode: string | null;
	/** The English name for `countryCode`, such as `Netherlands`, or `null` when there is no code. */
	countryName: string | null;
	/** In a venue, online, or both. `conferenceLocationLine` turns it into words. */
	locationMode: LocationMode;
	/** `tba` while the organiser has not named the venue; `venueName` is only the real one when `known`. */
	venueStatus: KnownOrTba;
	/** `known` when `startTime` and `endTime` are the hours of each day; `tba` when only the days are decided. */
	conferenceTimeStatus: KnownOrTba;
	/** `HH:MM` in the conference's own timezone, or `null` while the times are to be announced. */
	startTime: string | null;
	endTime: string | null;
	/** Whether delegates pay. The fees themselves exist only when it is `paid`. */
	feeStatus: FeeStatus;
	/**
	 * How applications open. `manual` with no `applicationsOpenAt` means the
	 * organiser has not opened them yet, which `isAcceptingApplications` reads.
	 */
	applicationOpenMode: ApplicationOpenMode;
	/** Dates are `YYYY-MM-DD`, so plain string comparison also sorts them by date. */
	startDate: string;
	endDate: string;
	/** A checked `http` or `https` address, or `null` when there is none. */
	websiteUrl: string | null;
	/**
	 * Where the wide banner picture sits in the `public-media` bucket, or `null`
	 * when the conference has none and the card shows its initials instead.
	 * `$lib/media.ts` turns the path into an address.
	 */
	bannerPath: string | null;
	/** The square logo's path in the `public-media` bucket, or `null`. */
	logoPath: string | null;
	level: ConferenceLevel;
	status: ConferenceStatus;
	/** An IANA name such as `Europe/Amsterdam`. Every time of this conference is shown in it. */
	timezone: string;
	expectedDelegates: number | null;
	/**
	 * An ISO timestamp, or `null` for "no opening date". That counts as already
	 * open, unless `applicationOpenMode` is `manual`: then nobody has opened them.
	 */
	applicationsOpenAt: string | null;
	/** An ISO timestamp, or `null` for "no closing date", which counts as still open. */
	applicationsCloseAt: string | null;
	/** How many committees the conference has. 0 when it has none yet. */
	committeeCount: number;
	/**
	 * What each committee is called on a card, in the organiser's order: its
	 * abbreviation, such as "DISEC", or its full name when it has none.
	 */
	committeeNames: string[];
	/** One line under the name on the conference page, or `null`. */
	tagline: string | null;
	/** The building the conference is held in, or `null` when none has been named. */
	venueName: string | null;
	/** The street address of the venue, or `null` when the organisers gave none. */
	venueAddress: string | null;
	/** Where a reader writes to the organisers, or `null` when they gave no address. */
	contactEmail: string | null;
	/** A checked Instagram address, or `null` when there is none. */
	instagramUrl: string | null;
	/** Where a reader rings the organisers, as they wrote it, or `null` when they gave no number. */
	contactPhone: string | null;
	/** Checked addresses on the other networks, each `null` when there is none. */
	facebookUrl: string | null;
	linkedinUrl: string | null;
	youtubeUrl: string | null;
	tiktokUrl: string | null;
	/** Free text, such as `English`. Never empty; the column has a default. */
	language: string;
	/** The youngest and oldest delegate the organisers expect, or `null` when they did not say. */
	minAge: number | null;
	maxAge: number | null;
	/** Whether a delegate has to hand in a position paper before the conference. */
	positionPaperRequired: boolean;
	/** An ISO timestamp, or `null` when no deadline has been set. */
	positionPaperDeadline: string | null;
	/** Whether one person on their own may apply. */
	acceptsIndividualApplications: boolean;
	/** Whether a school or a university may register a whole delegation. */
	acceptsDelegations: boolean;
};

/** Which order the results come in: the next conference first, or the newest listing first. */
export type ConferenceSort = 'soonest' | 'newest';

/** Everything we read out of the URL: what to search for, and which page to show. */
export type ConferenceQuery = {
	/** Free text, matched against the name, the city and the organisation name. */
	q: string;
	/** A two-letter country code such as `NL`, or '' for "any country". */
	country: string;
	/** Parts of the world to show, or none for everywhere. A conference has to be in one of them. */
	regions: ConferenceRegion[];
	/** Only conferences starting within this many months from today, or 0 for any time. */
	withinMonths: number;
	/** A level to show only, or '' for "any level". */
	level: '' | ConferenceLevel;
	/** Only conferences accepting applications right now. */
	openOnly: boolean;
	sort: ConferenceSort;
	/** Which page of results to show. The first page is 1, not 0. */
	page: number;
};

/** A search that asks for nothing: the whole directory, first page. */
export const EMPTY_CONFERENCE_QUERY: ConferenceQuery = {
	q: '',
	country: '',
	regions: [],
	withinMonths: 0,
	level: '',
	openOnly: false,
	sort: 'soonest',
	page: 1
};

/** How many conferences fit on one page of results. */
export const PAGE_SIZE = 12;

/**
 * The three levels, in the order the filter lists them.
 *
 * The values are the database enum's own, and the `ConferenceLevel[]` type makes
 * `pnpm check` fail if one of them is ever renamed in the schema.
 */
export const CONFERENCE_LEVELS: ConferenceLevel[] = ['high_school', 'university', 'mixed'];

/**
 * The three levels as choices somebody picks one of, for the organiser's own
 * form: the details editor draws them as radio buttons.
 *
 * The words for each level come from `$lib/status`, which is where every enum
 * value in the app is turned into English, so the form, the filter and the badge
 * on a card never disagree about what `high_school` is called.
 */
export const LEVEL_OPTIONS: { value: string; label: string }[] = CONFERENCE_LEVELS.map((level) => ({
	value: level,
	label: statusLabel('conference_level', level)
}));

/**
 * The choices in the level filter, "All" first.
 *
 * A filter has one choice a form does not: "any of them", the "All" chip at the
 * top of the directory (Trello WMcXfry0). That is the whole difference between
 * this list and `LEVEL_OPTIONS` above, so it is built out of it rather than
 * written out a second time.
 */
export const LEVEL_FILTER_OPTIONS: { value: string; label: string }[] = [
	{ value: '', label: 'All' },
	...LEVEL_OPTIONS
];

/**
 * The choices under "Dates" in the filters, after the product owner's mockup
 * (Trello WMcXfry0): how many months ahead to look, 0 meaning "any time". The
 * number is what the address carries, as in `?within=3`.
 */
export const DATE_WINDOW_OPTIONS: { value: number; label: string }[] = [
	{ value: 0, label: 'Any time' },
	{ value: 3, label: 'Next 3 months' },
	{ value: 6, label: 'Next 6 months' },
	{ value: 12, label: 'Next year' }
];

/** The two choices in the sort dropdown. */
export const SORT_OPTIONS: { value: ConferenceSort; label: string }[] = [
	{ value: 'soonest', label: 'Soonest' },
	{ value: 'newest', label: 'Newest' }
];

/** The shape of a `YYYY-MM-DD` date. */
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Anyone can type anything into the URL, so ignore values that are not a known country code. */
function readCountryCode(value: string | null): string {
	const code = value?.trim().toUpperCase() ?? '';
	return isCountryCode(code) ? code : '';
}

/**
 * Anyone can type anything into the URL, so keep only the regions we know. Going
 * through `REGION_OPTIONS` also drops a region named twice and puts them in the
 * filter's own order, so `?region=asia&region=europe` reads the same as the other way round.
 */
function readRegions(values: string[]): ConferenceRegion[] {
	const knownValues = values.filter(isConferenceRegion);
	const regionsInOrder = REGION_OPTIONS.map((option) => option.value);

	return regionsInOrder.filter((region) => knownValues.includes(region));
}

/** Anyone can type anything into the URL, so anything but one of the date choices means "any time". */
function readWithinMonths(value: string | null): number {
	const months = Number(value);
	const isKnownChoice = DATE_WINDOW_OPTIONS.some((option) => option.value === months);

	return isKnownChoice ? months : 0;
}

/** Anyone can type anything into the URL, so ignore anything that is not one of the three levels. */
function readLevel(value: string | null): '' | ConferenceLevel {
	const level = value?.trim() ?? '';
	const knownLevel = CONFERENCE_LEVELS.find((candidate) => candidate === level);

	return knownLevel ?? '';
}

/**
 * Whether the "only conferences taking applications" box is ticked.
 *
 * Two values mean yes. Our own links, built by `conferenceListUrl`, write
 * `open=1`. A tick box in a form submitted without JavaScript sends `open=on`
 * instead, because that is what a browser sends for a checked box with no value
 * of its own, and the page has to work that way too.
 */
function readOpenOnly(value: string | null): boolean {
	return value === '1' || value === 'on';
}

/** Anything that is not the one other order we understand falls back to "soonest". */
function readSort(value: string | null): ConferenceSort {
	return value === 'newest' ? 'newest' : 'soonest';
}

/** Fall back to the first page for anything that is not a whole number above zero. */
function readPage(value: string | null): number {
	const page = Number(value);
	return Number.isInteger(page) && page > 0 ? page : 1;
}

/**
 * Turn `?q=munich&country=DE&level=university&open=1&sort=newest&page=2` into a
 * `ConferenceQuery`. Takes the parameters rather than the whole URL, because the
 * filter form reads its own values through this same function.
 */
export function parseConferenceQuery(params: URLSearchParams): ConferenceQuery {
	return {
		q: params.get('q')?.trim() ?? '',
		country: readCountryCode(params.get('country')),
		// `getAll` because a region can be ticked more than once: `?region=europe&region=asia`.
		regions: readRegions(params.getAll('region')),
		withinMonths: readWithinMonths(params.get('within')),
		level: readLevel(params.get('level')),
		openOnly: readOpenOnly(params.get('open')),
		sort: readSort(params.get('sort')),
		page: readPage(params.get('page'))
	};
}

/** How many of the collapsible filters are set, for the phone "Filters (2)" summary. */
export function countActiveFilters(query: ConferenceQuery): number {
	// The search box, the chips and the sort dropdown stay outside the collapsed
	// filters, and the page number is not a filter, so none of them is counted
	// here. Each ticked region counts once, as each is a box of its own.
	const filters = [query.country !== '', query.withinMonths !== 0, query.openOnly];
	const setFilterCount = filters.filter((isSet) => isSet).length;

	return setFilterCount + query.regions.length;
}

/**
 * Whether the organiser still has to open applications themselves: they chose
 * to open them by hand (`manual`) and have not done it yet, so there is no
 * opening moment at all.
 *
 * Before the creation redesign a missing opening date meant "open from the
 * start". A `manual` conference has no date either, but there it means the
 * opposite, so the mode is what tells the two apart.
 */
function isWaitingForManualOpening(
	conference: Pick<Conference, 'applicationOpenMode' | 'applicationsOpenAt'>
): boolean {
	return conference.applicationOpenMode === 'manual' && conference.applicationsOpenAt === null;
}

/**
 * Whether the conference is taking applications at `now`.
 *
 * It asks for the four fields it reads rather than for a whole `Conference`,
 * so that the application page can ask it of an `ApplicationConference` — the
 * handful of conference facts `$lib/applications.ts` describes, which is not a
 * whole conference row.
 */
export function isAcceptingApplications(
	conference: Pick<
		Conference,
		'status' | 'applicationOpenMode' | 'applicationsOpenAt' | 'applicationsCloseAt'
	>,
	now: Date
): boolean {
	if (conference.status !== 'published') {
		return false;
	}

	if (isWaitingForManualOpening(conference)) {
		return false;
	}

	const moment = now.getTime();

	// A missing date means the window is open on that side, so only a date that is
	// really there can rule the conference out.
	if (conference.applicationsOpenAt !== null) {
		const opensAt = new Date(conference.applicationsOpenAt).getTime();

		if (moment < opensAt) {
			return false;
		}
	}

	if (conference.applicationsCloseAt !== null) {
		const closesAt = new Date(conference.applicationsCloseAt).getTime();

		if (moment > closesAt) {
			return false;
		}
	}

	return true;
}

/**
 * Whether applications have not been opened by hand yet and are not already
 * past their closing moment either: the one case that reads "not open yet"
 * without a date to name. A window whose closing moment has gone by reads
 * "closed" instead, whether or not anybody ever opened it.
 */
function isStillToBeOpenedByHand(
	conference: Pick<
		Conference,
		'applicationOpenMode' | 'applicationsOpenAt' | 'applicationsCloseAt'
	>,
	now: Date
): boolean {
	if (!isWaitingForManualOpening(conference)) {
		return false;
	}

	if (conference.applicationsCloseAt === null) {
		return true;
	}

	return new Date(conference.applicationsCloseAt).getTime() >= now.getTime();
}

/** Whether the conference has already finished. `today` is `YYYY-MM-DD`. */
export function isPast(conference: Conference, today: string): boolean {
	// Both are `YYYY-MM-DD`, so comparing them as text compares them as dates.
	return conference.endDate < today;
}

/**
 * How many days before its closing day a conference that is still taking
 * applications says "Closing soon" instead of "Applications open". The closing
 * day itself counts as 0 days away, so the pill shows on 8 days in all.
 */
export const CLOSING_SOON_DAYS = 7;

/**
 * The pill a card shows about applications, or `null` when it shows none.
 *
 * "Applications open", "Closing soon", "Opens 3 Nov 2026", "Applications not
 * open yet" or "Applications closed". A published conference with neither an
 * opening nor a closing moment has no window to talk about, so it gets no pill,
 * even though `isAcceptingApplications` counts it as open on both sides. The
 * exception is one whose organiser opens applications by hand and has not:
 * a reader should not take the silence for "open".
 */
export function applicationWindowBadge(
	conference: Conference,
	now: Date
): { label: string; tone: BadgeTone } | null {
	if (conference.status !== 'published') {
		return null;
	}

	// Asked before the "no window" question, because a conference waiting to be
	// opened by hand usually has no dates at all.
	if (isStillToBeOpenedByHand(conference, now)) {
		return { label: 'Applications not open yet', tone: 'neutral' };
	}

	const hasNoWindow =
		conference.applicationsOpenAt === null && conference.applicationsCloseAt === null;

	if (hasNoWindow) {
		return null;
	}

	if (isAcceptingApplications(conference, now)) {
		return acceptingBadge(conference, now);
	}

	// Applications are not open, so the window is either still ahead or over.
	if (conference.applicationsOpenAt !== null) {
		const opensAt = new Date(conference.applicationsOpenAt);

		if (opensAt.getTime() > now.getTime()) {
			return { label: `Opens ${openingDayOf(conference, opensAt)}`, tone: 'neutral' };
		}
	}

	return { label: 'Applications closed', tone: 'neutral' };
}

/**
 * "Closing soon" when the closing day is `CLOSING_SOON_DAYS` or fewer days
 * away, otherwise "Applications open". Only for a conference taking
 * applications at `now`.
 */
function acceptingBadge(conference: Conference, now: Date): { label: string; tone: BadgeTone } {
	const openBadge: { label: string; tone: BadgeTone } = {
		label: 'Applications open',
		tone: 'success'
	};

	// A window that never closes is never closing soon.
	if (conference.applicationsCloseAt === null) {
		return openBadge;
	}

	// Both days are counted in the conference's own timezone, the way
	// `formatDueIn` in `$lib/dates.ts` counts, so "7 days away" means the same
	// thing to every reader wherever they are.
	const today = dayInTimezone(now, conference.timezone);
	const closingDay = dayInTimezone(new Date(conference.applicationsCloseAt), conference.timezone);
	const daysUntilClosing = daysBetween(today, closingDay);

	if (daysUntilClosing <= CLOSING_SOON_DAYS) {
		return { label: 'Closing soon', tone: 'warning' };
	}

	return openBadge;
}

/**
 * The opening moment as the day it falls on where the conference is, such as
 * "3 Nov 2026".
 *
 * The opening moment is an exact time, and which day it falls on depends on
 * where you are reading it. It is the conference's own day that matters, so the
 * moment becomes a day in the conference's timezone first. Giving
 * `formatDateRange` the same day twice writes it as a single date.
 */
function openingDayOf(conference: Conference, opensAt: Date): string {
	const openingDay = dayInTimezone(opensAt, conference.timezone);

	return formatDateRange(openingDay, openingDay);
}

/** Below this many delegates the card's chip gives the exact number. */
const EXACT_DELEGATE_COUNT_BELOW = 20;

/** From this many delegates the chip rounds down to fifties rather than tens. */
const ROUND_TO_FIFTIES_FROM = 100;

/** How many committees a conference card names before it sums up the rest as "+6". */
export const COMMITTEE_CHIPS_SHOWN = 2;

/**
 * The committee chips on a conference card: the first `COMMITTEE_CHIPS_SHOWN`
 * names, then "+6" for the six left over, as in the mockup (Trello WMcXfry0).
 * No committees gives no chips.
 */
export function committeeChips(committeeNames: string[]): string[] {
	const shownNames = committeeNames.slice(0, COMMITTEE_CHIPS_SHOWN);
	const hiddenCount = committeeNames.length - shownNames.length;

	if (hiddenCount === 0) {
		return shownNames;
	}

	return [...shownNames, `+${hiddenCount}`];
}

/** The pastel colours a conference card's committee chips come in. */
export type CommitteeChipTone = 'violet' | 'green' | 'blue';

/** Every tone in `CommitteeChipTone`, in the order `committeeChipTone` hands them out. */
const COMMITTEE_CHIP_TONES: CommitteeChipTone[] = ['violet', 'green', 'blue'];

/**
 * The colour of one conference's committee chips. The mockup gives each card one
 * pastel colour of three (Trello WMcXfry0), so neighbouring cards look different.
 * It is worked out from the conference's id rather than picked at random, so a
 * conference keeps its colour on every visit and the server and the browser agree.
 */
export function committeeChipTone(conferenceId: string): CommitteeChipTone {
	let characterCodeTotal = 0;

	for (const character of conferenceId) {
		characterCodeTotal += character.charCodeAt(0);
	}

	return COMMITTEE_CHIP_TONES[characterCodeTotal % COMMITTEE_CHIP_TONES.length];
}

/**
 * The delegates chip on a conference card, such as "12 delegates", "40+
 * delegates" or "200+ delegates", or `null` when there is no number to show.
 *
 * Under 20 the number is exact. From 20 to 99 it is rounded down to the nearest
 * ten, and from 100 to the nearest fifty. Rounding down is what keeps the "+"
 * true: a conference expecting 237 does expect more than 200.
 */
export function delegateCountChip(expectedDelegates: number | null): string | null {
	if (expectedDelegates === null || expectedDelegates <= 0) {
		return null;
	}

	if (expectedDelegates === 1) {
		return '1 delegate';
	}

	if (expectedDelegates < EXACT_DELEGATE_COUNT_BELOW) {
		return `${expectedDelegates} delegates`;
	}

	const step = expectedDelegates < ROUND_TO_FIFTIES_FROM ? 10 : 50;
	const roundedDown = Math.floor(expectedDelegates / step) * step;

	return `${roundedDown}+ delegates`;
}

/**
 * The delegation the reader is part of at this conference, when they are in
 * one.
 *
 * The id came with T25, which built `/delegations/[id]`. Until then this was a
 * name on its own, because `resolve()` from `$app/paths` refuses an address
 * whose folder is not under `src/routes/`, so the sentence the panel writes had
 * nowhere to point.
 */
export type MyDelegation = {
	id: string;
	/** "Lycee Francais Delegation", as the head named it. */
	name: string;
};

/** The seat the reader holds at this conference, when they hold one. */
export type MySeat = {
	/** The seat's own name, such as `France`. */
	seatName: string;
	committeeName: string;
	/** The last part of the committee's link, for the "Go to your committee" button. */
	committeeSlug: string;
};

/**
 * Which one thing the apply panel says. `05-pages/public/conference.md` has the
 * whole table.
 *
 * `application` and `delegation` are the two states that needed the
 * `applications` and `delegations` tables: an application of the reader's own,
 * and a delegation they are already part of.
 *
 * `unavailable` is the last resort: nothing to apply for and no date to give.
 * It is a draft being previewed, or a published conference whose organisers
 * have set no window at all.
 */
export type ApplyPanelState =
	| { kind: 'seated'; seat: MySeat }
	| { kind: 'application'; applicationId: string; status: ApplicationStatus }
	| { kind: 'delegation'; delegationId: string; delegationName: string }
	| {
			kind: 'open';
			closesOn: string | null;
			paperDueOn: string | null;
			/**
			 * Whether a person may apply on their own, from
			 * `accepts_individual_applications`.
			 *
			 * The window being open is not enough to offer the apply button: a
			 * conference can take delegations only, and `canApply` refuses an
			 * individual there. Without this the panel offered a button that
			 * dead-ended on the apply page's refusal.
			 */
			acceptsIndividuals: boolean;
			/**
			 * Whether a group may register, from `accepts_delegations`.
			 *
			 * The same question as `acceptsIndividuals` above, asked for the other
			 * button. A conference with both switched off shows the badge and the
			 * closing date and nothing to press, which is what
			 * `05-pages/public/conference.md`'s "accepting, one route off" row asks
			 * for on each side.
			 */
			acceptsDelegations: boolean;
	  }
	| { kind: 'not_yet_open'; opensOn: string }
	/** The organiser opens applications by hand and has not yet, so there is no day to name. */
	| { kind: 'not_opened' }
	| { kind: 'closed'; closedOn: string }
	| { kind: 'ended' }
	| { kind: 'unavailable' };

/** What the panel knows about whoever is reading the page. */
export type ApplyPanelViewer = {
	/** The seat the reader holds at this conference, or `null`. */
	seat: MySeat | null;
	/** The reader's own application at this conference, or `null`. */
	application: { id: string; status: ApplicationStatus } | null;
	/** The delegation the reader is in at this conference, or `null`. */
	delegation: MyDelegation | null;
};

/**
 * An exact moment written as the day it falls on where the conference is, such
 * as "3 Nov 2026".
 *
 * Which day a moment belongs to depends on where you read it, and it is the
 * conference's own day that matters. Handing `formatDateRange` the same day
 * twice writes it as a single date, which is what `applicationWindowBadge`
 * above does too.
 *
 * `canApply` in `$lib/applications.ts` words its two window refusals with this,
 * so the panel on the conference page and the apply page itself always name the
 * same day.
 */
export function formatConferenceDay(isoMoment: string, timezone: string): string {
	const day = dayInTimezone(new Date(isoMoment), timezone);

	return formatDateRange(day, day);
}

/** The open state, with the two dates the panel prints under the buttons. */
function openApplyPanelState(conference: Conference): ApplyPanelState {
	let closesOn: string | null = null;

	if (conference.applicationsCloseAt !== null) {
		closesOn = formatConferenceDay(conference.applicationsCloseAt, conference.timezone);
	}

	let paperDueOn: string | null = null;

	// A deadline left behind on a conference that does not ask for position
	// papers is not something to put in front of a delegate.
	if (conference.positionPaperRequired && conference.positionPaperDeadline !== null) {
		paperDueOn = formatConferenceDay(conference.positionPaperDeadline, conference.timezone);
	}

	return {
		kind: 'open',
		closesOn,
		paperDueOn,
		acceptsIndividuals: conference.acceptsIndividualApplications,
		acceptsDelegations: conference.acceptsDelegations
	};
}

/**
 * The one sentence the apply panel leads with, or `''` when it leads with
 * something else.
 *
 * Three of the nine states have no sentence here. `open` and `application`
 * lead with a `Badge` instead, and `delegation` is written out in the panel's
 * own markup because part of it is a link to `/delegations/[id]` and a string
 * cannot carry one.
 *
 * It sits here beside `applyPanelState` rather than in the component, because
 * `CLAUDE.md` keeps wording out of a component's script block and because the
 * state and the words for it are one decision read in one place.
 */
export function applyPanelHeadline(state: ApplyPanelState): string {
	if (state.kind === 'seated') {
		return `You represent ${state.seat.seatName} in ${state.seat.committeeName}.`;
	}

	if (state.kind === 'not_yet_open') {
		return `Applications open on ${state.opensOn}.`;
	}

	if (state.kind === 'not_opened') {
		return 'Applications are not open yet.';
	}

	if (state.kind === 'closed') {
		return `Applications closed on ${state.closedOn}.`;
	}

	if (state.kind === 'ended') {
		return 'This conference has ended.';
	}

	if (state.kind === 'unavailable') {
		return 'This conference is not taking applications.';
	}

	return '';
}

/**
 * The one thing the apply panel on the conference page says.
 *
 * The order of the questions below is what makes exactly one state possible:
 * the first one that answers yes wins, and the panel never has to choose
 * between two things to say. `now` is the moment to judge the window at, and
 * `today` is that same moment as a `YYYY-MM-DD` day, which is what deciding
 * whether the conference has finished needs.
 *
 * Everything about the reader travels in one `viewer` object rather than as
 * three more parameters of its own, because four positional arguments were
 * already as many as a call can be read with.
 */
export function applyPanelState(
	conference: Conference,
	viewer: ApplyPanelViewer,
	now: Date,
	today: string
): ApplyPanelState {
	// Somebody who already has a seat is told about it whatever the application
	// window is doing, because it is the only thing on the panel they can act on.
	if (viewer.seat !== null) {
		return { kind: 'seated', seat: viewer.seat };
	}

	// Somebody who has already applied is sent to their own application rather
	// than to the form again, whatever the window is doing.
	if (viewer.application !== null) {
		return {
			kind: 'application',
			applicationId: viewer.application.id,
			status: viewer.application.status
		};
	}

	// A member of a delegation applies through that delegation's head, so the
	// panel names the delegation instead of offering a form they may not use.
	if (viewer.delegation !== null) {
		return {
			kind: 'delegation',
			delegationId: viewer.delegation.id,
			delegationName: viewer.delegation.name
		};
	}

	// `archived` is how an organiser closes a conference down, and
	// `05-pages/public/conference.md` says such a page reads "This conference has
	// ended." whatever its dates say. Without the second half of this question an
	// archived conference whose dates are still ahead would fall all the way
	// through to `unavailable`.
	if (isPast(conference, today) || conference.status === 'archived') {
		return { kind: 'ended' };
	}

	if (isAcceptingApplications(conference, now)) {
		return openApplyPanelState(conference);
	}

	if (isStillToBeOpenedByHand(conference, now)) {
		return { kind: 'not_opened' };
	}

	// Applications are shut. Say when they open if that is still ahead, and when
	// they closed if it has already happened.
	if (conference.applicationsOpenAt !== null) {
		const opensAt = new Date(conference.applicationsOpenAt);

		if (opensAt.getTime() > now.getTime()) {
			const opensOn = formatConferenceDay(conference.applicationsOpenAt, conference.timezone);

			return { kind: 'not_yet_open', opensOn };
		}
	}

	if (conference.applicationsCloseAt !== null) {
		const closesAt = new Date(conference.applicationsCloseAt);

		if (closesAt.getTime() < now.getTime()) {
			const closedOn = formatConferenceDay(conference.applicationsCloseAt, conference.timezone);

			return { kind: 'closed', closedOn };
		}
	}

	return { kind: 'unavailable' };
}

/**
 * Where the conference happens, in the words every page prints: "Delft,
 * Netherlands", "Online", "Delft, Netherlands · also online", or "Location to
 * be announced" for an in-person conference that has not named its city yet.
 *
 * It is written once here so the directory card, the home page and the
 * conference's own page never word the same conference two ways.
 */
export function conferenceLocationLine(
	conference: Pick<Conference, 'locationMode' | 'city' | 'countryName'>
): string {
	if (conference.locationMode === 'online') {
		return 'Online';
	}

	if (conference.city === null) {
		return 'Location to be announced';
	}

	// A city without a country can only be a row from before the country was
	// required, but saying the city alone is better than printing "Delft, null".
	const place =
		conference.countryName === null
			? conference.city
			: `${conference.city}, ${conference.countryName}`;

	if (conference.locationMode === 'hybrid') {
		return `${place} · also online`;
	}

	return place;
}

/**
 * The sentence a shared link shows when the organisers wrote neither a tagline
 * nor a description: "Delft MUN is a Model UN conference in Delft,
 * Netherlands." It says where only when there is somewhere to say.
 */
export function conferenceShareSentence(
	conference: Pick<Conference, 'name' | 'locationMode' | 'city' | 'countryName'>
): string {
	if (conference.locationMode === 'online') {
		return `${conference.name} is an online Model UN conference.`;
	}

	if (conference.city === null) {
		return `${conference.name} is a Model UN conference.`;
	}

	// The location line without the hybrid's "· also online", which reads as a
	// list rather than as part of a sentence.
	const place = conferenceLocationLine({ ...conference, locationMode: 'in_person' });
	const alsoOnline = conference.locationMode === 'hybrid' ? ' and online' : '';

	return `${conference.name} is a Model UN conference in ${place}${alsoOnline}.`;
}

/**
 * The venue fact on the conference page: the venue's name, "Venue to be
 * announced" while the organiser has not decided, or `null` for an online
 * conference, which has no venue to talk about.
 */
export function conferenceVenueLine(
	conference: Pick<Conference, 'locationMode' | 'venueStatus' | 'venueName'>
): string | null {
	if (conference.locationMode === 'online') {
		return null;
	}

	if (conference.venueStatus === 'tba' || conference.venueName === null) {
		return 'Venue to be announced';
	}

	return conference.venueName;
}

/**
 * The hours of each conference day, such as "10:00 – 17:00 each day", or `null`
 * while the times are to be announced. The dates alone say enough until then,
 * so nothing stands in for them.
 */
export function conferenceHoursLine(
	conference: Pick<Conference, 'conferenceTimeStatus' | 'startTime' | 'endTime'>
): string | null {
	if (
		conference.conferenceTimeStatus !== 'known' ||
		conference.startTime === null ||
		conference.endTime === null
	) {
		return null;
	}

	return `${conference.startTime} – ${conference.endTime} each day`;
}

/**
 * The one line that stands in for the list of fees, or `null` when the fees
 * themselves should be shown.
 *
 * A conference that says it charges but has not entered a fee yet reads the
 * same as one that has not decided, because to a delegate the answer is the
 * same: there is no amount to know yet.
 */
export function publicFeesHeading(feeStatus: FeeStatus, feeCount: number): string | null {
	if (feeStatus === 'free') {
		return 'Free to attend';
	}

	if (feeStatus === 'undecided' || feeCount === 0) {
		return 'Fees to be announced';
	}

	return null;
}
