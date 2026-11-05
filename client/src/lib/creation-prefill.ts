/**
 * What a new draft starts with (Trello fe3reN7Y), and how its generated values
 * keep up as the organiser changes others.
 *
 * The order of trust is: the previous edition of the same conference, then the
 * organisation, then a safe default, then "to be announced". Nothing is made up
 * and nothing guesses: a name gets next year's number, dates move to the same
 * weekday a year on, and every value is stored together with where it came
 * from (`prefill_sources`). Once the organiser types a value its source becomes
 * `user`, and nothing here touches it again.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import {
	hasChosenDates,
	type ApplicationCloseRule,
	type ApplicationOpenMode,
	type ConferenceLevel,
	type CreationDraft,
	type CreationOrganization,
	type FeeStatus,
	type KnownOrTba,
	type LocationMode,
	type PrefillField,
	type PrefillSource,
	type PrefillSources,
	type PreviousConference
} from '$lib/creation-draft';
import { dayInTimezone } from '$lib/dates';
import { nextEditionName, retargetEditionText, yearInName, yearOfDay } from '$lib/edition-name';
import { fallbackTimezone, timezoneForLocation } from '$lib/location-timezone';
import { DEFAULT_CLOSE_OFFSET_DAYS, relativeDeadlineInstant } from '$lib/relative-deadline';
import { addDays } from '$lib/schedule';
import { suggestNextEditionDates } from '$lib/suggested-dates';

/** The columns a draft is created with and the steps save, camelCase. */
export type DraftValues = {
	name: string;
	tagline: string | null;
	description: string | null;
	locationMode: LocationMode;
	city: string | null;
	countryCode: string | null;
	venueStatus: KnownOrTba;
	venueName: string | null;
	startDate: string;
	endDate: string;
	conferenceTimeStatus: KnownOrTba;
	startTime: string | null;
	endTime: string | null;
	timezone: string;
	currency: string;
	level: ConferenceLevel;
	contactEmail: string | null;
	websiteUrl: string | null;
	instagramUrl: string | null;
	logoPath: string | null;
	bannerPath: string | null;
	acceptsIndividualApplications: boolean;
	acceptsDelegations: boolean;
	committeePreferenceCount: number;
	askMotivation: boolean;
	positionPaperRequired: boolean;
	applicationOpenMode: ApplicationOpenMode;
	applicationCloseRule: ApplicationCloseRule;
	applicationCloseOffsetDays: number;
	applicationsCloseAt: string | null;
	feeStatus: FeeStatus;
	collectsPaymentsManually: boolean;
};

/** A prefilled draft: every value, and where the tracked ones came from. */
export type PrefilledDraft = { values: DraftValues; sources: PrefillSources };

/** The value whose origin each tracked column records. */
const TRACKED_FIELDS: Partial<Record<keyof DraftValues, PrefillField>> = {
	name: 'name',
	tagline: 'tagline',
	description: 'description',
	locationMode: 'location_mode',
	city: 'city',
	countryCode: 'country_code',
	venueName: 'venue_name',
	startDate: 'start_date',
	endDate: 'end_date',
	startTime: 'start_time',
	endTime: 'end_time',
	timezone: 'timezone',
	currency: 'currency',
	level: 'level',
	contactEmail: 'contact_email',
	websiteUrl: 'website_url',
	instagramUrl: 'instagram_url',
	logoPath: 'logo_path',
	bannerPath: 'banner_path'
};

/** How far ahead the placeholder dates sit when nobody has dates yet. */
const PLACEHOLDER_DAYS_AHEAD = 365;
/** A placeholder conference lasts three days, the most common length. */
const PLACEHOLDER_LENGTH_DAYS = 2;

/**
 * Dates a year from `now`. The date columns may not be empty, so a draft
 * without dates stores these and marks them `system_default`; every screen
 * then says "Dates to be announced" (see `hasChosenDates`).
 */
function placeholderDates(now: Date): { startDate: string; endDate: string } {
	const startDate = addDays(dayInTimezone(now, 'UTC'), PLACEHOLDER_DAYS_AHEAD);

	return { startDate, endDate: addDays(startDate, PLACEHOLDER_LENGTH_DAYS) };
}

/** The timezone a place keeps, or `null` when the place says nothing about it. */
function timezoneOfPlace(city: string | null, countryCode: string | null): string | null {
	if (countryCode === null) {
		return null;
	}

	return timezoneForLocation(city ?? '', countryCode);
}

/** A value and where it came from, or nothing at all when there is no value. */
function pick<Value>(
	sources: PrefillSources,
	field: PrefillField,
	candidates: [Value | null | undefined, PrefillSource][]
): Value | null {
	for (const [value, source] of candidates) {
		if (value !== null && value !== undefined) {
			sources[field] = source;
			return value;
		}
	}

	return null;
}

/**
 * The values a new draft starts with for `organization`, given its most recent
 * earlier conference (or `null`) and the moment it is created.
 */
export function prefillDraft(input: {
	organization: CreationOrganization;
	previous: PreviousConference | null;
	now: Date;
}): PrefilledDraft {
	const { organization, previous, now } = input;
	const sources: PrefillSources = {};
	const fromPrevious = 'previous_conference';

	const suggested = previous ? suggestNextEditionDates(previous.startDate, previous.endDate) : null;
	const dates = suggested ?? placeholderDates(now);
	const datesSource: PrefillSource = suggested ? fromPrevious : 'system_default';
	sources.start_date = datesSource;
	sources.end_date = datesSource;

	const nextYear = yearOfDay(dates.startDate) ?? now.getUTCFullYear();
	const name = previous ? nextEditionName(previous.name, nextYear) : organization.name;
	sources.name = previous ? fromPrevious : 'organization';

	// A previous name with a year in it carries that year in its sentences too.
	const retarget = (text: string | null) =>
		previous && text !== null ? retargetEditionText(text, previous.name, name, nextYear) : null;

	const city = pick(sources, 'city', [
		[previous?.city, fromPrevious],
		[organization.city, 'organization']
	]);
	const countryCode = pick(sources, 'country_code', [
		[previous?.countryCode, fromPrevious],
		[organization.countryCode, 'organization']
	]);
	const timezone =
		pick(sources, 'timezone', [
			[timezoneOfPlace(city, countryCode), sources.country_code ?? 'system_default'],
			[previous?.timezone, fromPrevious]
		]) ?? fallbackTimezone();
	sources.timezone ??= 'system_default';

	// Times are copied only as a pair: half a day's hours is not a decision.
	const copiesTimes =
		previous?.conferenceTimeStatus === 'known' &&
		previous.startTime !== null &&
		previous.endTime !== null;
	if (copiesTimes) {
		sources.start_time = fromPrevious;
		sources.end_time = fromPrevious;
	}

	sources.location_mode = previous ? fromPrevious : 'system_default';
	sources.currency = previous ? fromPrevious : 'system_default';
	sources.level = previous ? fromPrevious : 'system_default';

	const applicationCloseRule = previous?.applicationCloseRule ?? 'relative';
	const applicationCloseOffsetDays =
		previous?.applicationCloseOffsetDays ?? DEFAULT_CLOSE_OFFSET_DAYS;

	const values: DraftValues = {
		name,
		tagline: pick(sources, 'tagline', [[retarget(previous?.tagline ?? null), fromPrevious]]),
		description: pick(sources, 'description', [
			[retarget(previous?.description ?? null), fromPrevious]
		]),
		locationMode: previous?.locationMode ?? 'in_person',
		city,
		countryCode,
		// The brief: the venue starts as "to be announced", even for a
		// returning organisation, because venues change between editions.
		venueStatus: 'tba',
		venueName: null,
		startDate: dates.startDate,
		endDate: dates.endDate,
		conferenceTimeStatus: copiesTimes ? 'known' : 'tba',
		startTime: copiesTimes ? (previous?.startTime ?? null) : null,
		endTime: copiesTimes ? (previous?.endTime ?? null) : null,
		timezone,
		currency: previous?.currency ?? 'EUR',
		level: previous?.level ?? 'mixed',
		contactEmail: pick(sources, 'contact_email', [[previous?.contactEmail, fromPrevious]]),
		websiteUrl: pick(sources, 'website_url', [
			[previous?.websiteUrl, fromPrevious],
			[organization.websiteUrl, 'organization']
		]),
		instagramUrl: pick(sources, 'instagram_url', [[previous?.instagramUrl, fromPrevious]]),
		logoPath: pick(sources, 'logo_path', [[organization.logoPath, 'organization']]),
		bannerPath: pick(sources, 'banner_path', [[previous?.bannerPath, fromPrevious]]),
		acceptsIndividualApplications: previous?.acceptsIndividualApplications ?? true,
		acceptsDelegations: previous?.acceptsDelegations ?? true,
		committeePreferenceCount: previous?.committeePreferenceCount ?? 3,
		askMotivation: previous?.askMotivation ?? false,
		positionPaperRequired: previous?.positionPaperRequired ?? false,
		// Applications never open by themselves: the organiser decides at Launch.
		applicationOpenMode: 'manual',
		applicationCloseRule,
		applicationCloseOffsetDays,
		applicationsCloseAt:
			applicationCloseRule === 'relative'
				? relativeDeadlineInstant(dates.startDate, applicationCloseOffsetDays, timezone)
				: null,
		feeStatus: 'undecided',
		collectsPaymentsManually: previous?.collectsPaymentsManually ?? false
	};

	return { values, sources };
}

/**
 * `sources` with every tracked field whose value differs between `before` and
 * `after` marked `user`: the organiser changed it, so it is theirs now.
 */
export function markUserOverrides(
	sources: PrefillSources,
	before: Partial<DraftValues>,
	after: Partial<DraftValues>
): PrefillSources {
	const marked: PrefillSources = { ...sources };

	for (const key of Object.keys(after) as (keyof DraftValues)[]) {
		const field = TRACKED_FIELDS[key];

		if (field !== undefined && before[key] !== after[key]) {
			marked[field] = 'user';
		}
	}

	return marked;
}

/**
 * A generated name that follows the start date's year, or `null` when that
 * changes nothing (a typed name, no dates chosen, the year already right).
 * The When & where preview uses it too, so the name changes as dates are picked.
 */
export function cascadedName(draft: CreationDraft): string | null {
	const year = yearOfDay(draft.startDate);

	if (draft.prefillSources.name === 'user' || year === null || !hasChosenDates(draft)) {
		return null;
	}

	const name =
		yearInName(draft.name) === null
			? `${draft.name.trim()} ${year}`
			: nextEditionName(draft.name, year);

	return name === draft.name ? null : name;
}

/**
 * The generated values that change because of what was just saved: the year
 * in a generated name follows the start date, the timezone follows the place,
 * and a relative closing date follows the first day. A value the organiser
 * typed is never touched. Only the fields that change are returned.
 *
 * `now` moves placeholder dates that have fallen into the past a year ahead
 * again, so an old draft never offers a "to be announced" date behind it.
 */
export function applyCascades(draft: CreationDraft, now: Date): Partial<DraftValues> {
	const changes: Partial<DraftValues> = {};

	let startDate = draft.startDate;
	if (!hasChosenDates(draft) && startDate <= dayInTimezone(now, 'UTC')) {
		const placeholder = placeholderDates(now);
		startDate = placeholder.startDate;
		changes.startDate = placeholder.startDate;
		changes.endDate = placeholder.endDate;
	}

	const name = cascadedName(draft);
	if (name !== null) {
		changes.name = name;
	}

	let timezone = draft.timezone;
	const placeTimezone = timezoneOfPlace(draft.city, draft.countryCode);
	if (
		draft.prefillSources.timezone !== 'user' &&
		placeTimezone !== null &&
		placeTimezone !== timezone
	) {
		timezone = placeTimezone;
		changes.timezone = placeTimezone;
	}

	if (draft.applicationCloseRule === 'relative') {
		const closesAt = relativeDeadlineInstant(startDate, draft.applicationCloseOffsetDays, timezone);
		if (closesAt !== draft.applicationsCloseAt) {
			changes.applicationsCloseAt = closesAt;
		}
	}

	return changes;
}

/**
 * The name the "regenerate" control offers: next year's name from the previous
 * edition, or the organisation's name with the start date's year.
 */
export function regeneratedName(
	previous: PreviousConference | null,
	organization: CreationOrganization,
	startDate: string
): { name: string; source: PrefillSource } {
	const year = yearOfDay(startDate);

	if (previous !== null) {
		return {
			name: year === null ? previous.name : nextEditionName(previous.name, year),
			source: 'previous_conference'
		};
	}

	return {
		name: year === null ? organization.name : `${organization.name} ${year}`,
		source: 'organization'
	};
}
