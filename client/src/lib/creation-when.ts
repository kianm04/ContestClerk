/**
 * The When & where step of creating a conference (Trello fe3reN7Y): reading
 * its form, saying what is wrong with it, and turning what is right into the
 * values a draft is saved with.
 *
 * "Not decided yet" is a real answer here. Empty dates keep the draft's
 * placeholder ("Dates to be announced"), times can stay to be announced, and
 * an empty venue means the venue is to be announced. Nothing is required to
 * move on; only half an answer, such as a first day without a last, is
 * refused when the organiser presses Continue.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import { countryName, isCountryCode } from '$lib/countries';
import {
	hasChosenDates,
	type CreationDraft,
	type LocationMode,
	type PrefillSources,
	type PreviousConference
} from '$lib/creation-draft';
import { cascadedName, type DraftValues } from '$lib/creation-prefill';
import { formatDayAndMonth } from '$lib/dates';
import { timezoneForLocation } from '$lib/location-timezone';
import {
	isDeadlinePast,
	nearestFutureOffset,
	relativeDeadlineInstant
} from '$lib/relative-deadline';
import { suggestNextEditionDates } from '$lib/suggested-dates';
import { isTimezone } from '$lib/timezones';

/** The When & where form as it arrived, every field as text. */
export type WhenValues = {
	startDate: string;
	endDate: string;
	/** "Times not decided yet". */
	isTimesTba: boolean;
	startTime: string;
	endTime: string;
	locationMode: string;
	city: string;
	countryCode: string;
	venueName: string;
	venueAddress: string;
	timezone: string;
};

/** One message per field that has something wrong with it. */
export type WhenErrors = Partial<Record<keyof WhenValues, string>>;

const DAY_SHAPE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_SHAPE = /^\d{2}:\d{2}$/;
const LOCATION_MODES: LocationMode[] = ['in_person', 'online', 'hybrid'];

function readText(formData: FormData, fieldName: string): string {
	return String(formData.get(fieldName) ?? '').trim();
}

/** Read the When & where fields from a submitted form. */
export function readWhen(formData: FormData): WhenValues {
	return {
		startDate: readText(formData, 'startDate'),
		endDate: readText(formData, 'endDate'),
		isTimesTba: readText(formData, 'timesTba') === 'on',
		// A browser may send seconds ("10:00:00"); the draft keeps minutes.
		startTime: readText(formData, 'startTime').slice(0, 5),
		endTime: readText(formData, 'endTime').slice(0, 5),
		locationMode: readText(formData, 'locationMode'),
		city: readText(formData, 'city'),
		// Codes are stored in capitals, so `nl` from an edited form still works.
		countryCode: readText(formData, 'countryCode').toUpperCase(),
		venueName: readText(formData, 'venueName'),
		venueAddress: readText(formData, 'venueAddress'),
		timezone: readText(formData, 'timezone')
	};
}

function isLocationMode(text: string): text is LocationMode {
	return (LOCATION_MODES as string[]).includes(text);
}

/**
 * What is wrong with the form. A first day without a last one (or the other
 * way round) is only wrong when the organiser asks to move on
 * (`isContinuing`); while they pick, it is a range half picked.
 */
export function validateWhen(values: WhenValues, options: { isContinuing: boolean }): WhenErrors {
	const errors: WhenErrors = {};
	const hasStart = values.startDate !== '';
	const hasEnd = values.endDate !== '';

	if (hasStart && !DAY_SHAPE.test(values.startDate)) {
		errors.startDate = 'Please pick a day.';
	} else if (hasEnd && !DAY_SHAPE.test(values.endDate)) {
		errors.endDate = 'Please pick a day.';
	} else if (hasStart !== hasEnd) {
		if (options.isContinuing) {
			errors[hasStart ? 'endDate' : 'startDate'] = 'Please pick both days.';
		}
	} else if (hasStart && values.endDate < values.startDate) {
		errors.endDate = 'The last day cannot be before the first day.';
	}

	if (values.startTime !== '' && !TIME_SHAPE.test(values.startTime)) {
		errors.startTime = 'Please pick a time.';
	}

	if (values.endTime !== '' && !TIME_SHAPE.test(values.endTime)) {
		errors.endTime = 'Please pick a time.';
	}

	if (!isLocationMode(values.locationMode)) {
		errors.locationMode = 'Please choose in person, online or hybrid.';
	}

	if (values.countryCode !== '' && !isCountryCode(values.countryCode)) {
		errors.countryCode = 'Please pick a country from the list.';
	}

	if (!isTimezone(values.timezone)) {
		errors.timezone = 'Please pick a timezone from the list.';
	}

	return errors;
}

function textOrNull(text: string): string | null {
	return text === '' ? null : text;
}

/** What `whenPatch` gives: the values to save, and the venue's address, which is saved beside them. */
export type WhenPatch = {
	patch: Partial<DraftValues>;
	/** `undefined` when it is not to be touched. */
	venueAddress: string | null | undefined;
	/** True when the organiser picked dates for a draft that had none, which makes them theirs. */
	hasPickedFirstDates: boolean;
};

/**
 * The values to save: every field without an error.
 *
 * - Empty dates leave the placeholder alone, so the draft still says "Dates
 *   to be announced".
 * - Times are kept only as a pair, with "Times not decided yet" off.
 * - An online conference has no city, country or venue.
 * - The timezone is saved only when the organiser chose it: when it is what
 *   the draft already had, or what the place says anyway, it is left to
 *   follow the place (see `applyCascades`).
 */
export function whenPatch(values: WhenValues, errors: WhenErrors, draft: CreationDraft): WhenPatch {
	const patch: Partial<DraftValues> = {};
	const hasBothDates = values.startDate !== '' && values.endDate !== '';
	const areDatesValid =
		hasBothDates && errors.startDate === undefined && errors.endDate === undefined;

	if (areDatesValid) {
		patch.startDate = values.startDate;
		patch.endDate = values.endDate;
	}

	const hasTimes =
		!values.isTimesTba &&
		TIME_SHAPE.test(values.startTime) &&
		TIME_SHAPE.test(values.endTime) &&
		errors.startTime === undefined &&
		errors.endTime === undefined;
	patch.conferenceTimeStatus = hasTimes ? 'known' : 'tba';
	patch.startTime = hasTimes ? values.startTime : null;
	patch.endTime = hasTimes ? values.endTime : null;

	const locationMode = isLocationMode(values.locationMode) ? values.locationMode : null;
	if (locationMode !== null) {
		patch.locationMode = locationMode;
	}

	let venueAddress: string | null | undefined = undefined;
	if (locationMode === 'online') {
		patch.city = null;
		patch.countryCode = null;
		patch.venueStatus = 'tba';
		patch.venueName = null;
		venueAddress = null;
	} else if (locationMode !== null) {
		patch.city = textOrNull(values.city);
		if (errors.countryCode === undefined) patch.countryCode = textOrNull(values.countryCode);
		patch.venueStatus = values.venueName === '' ? 'tba' : 'known';
		patch.venueName = textOrNull(values.venueName);
		// An address belongs to a named venue.
		venueAddress = values.venueName === '' ? null : textOrNull(values.venueAddress);
	}

	if (errors.timezone === undefined && values.timezone !== draft.timezone) {
		const city = patch.city === undefined ? draft.city : patch.city;
		const countryCode = patch.countryCode === undefined ? draft.countryCode : patch.countryCode;
		const placeTimezone =
			countryCode === null ? null : timezoneForLocation(city ?? '', countryCode);
		const followsThePlace =
			draft.prefillSources.timezone !== 'user' && values.timezone === placeTimezone;

		if (!followsThePlace) {
			patch.timezone = values.timezone;
		}
	}

	return { patch, venueAddress, hasPickedFirstDates: areDatesValid && !hasChosenDates(draft) };
}

/**
 * What the form's fields hold when the step opens. Dates that are still the
 * placeholder start empty, because nobody chose them.
 */
export function whenFormValues(draft: CreationDraft): WhenValues {
	const isChosen = hasChosenDates(draft);

	return {
		startDate: isChosen ? draft.startDate : '',
		endDate: isChosen ? draft.endDate : '',
		isTimesTba: draft.conferenceTimeStatus !== 'known',
		startTime: draft.startTime?.slice(0, 5) ?? '',
		endTime: draft.endTime?.slice(0, 5) ?? '',
		locationMode: draft.locationMode,
		city: draft.city ?? '',
		countryCode: draft.countryCode ?? '',
		venueName: draft.venueName ?? '',
		venueAddress: draft.venueAddress ?? '',
		timezone: draft.timezone
	};
}

/**
 * The draft as it would be with what is in the form now, for the preview and
 * the closing-date warning while the organiser types. It follows the same
 * rules as saving (`whenPatch`), so the preview never promises what a save
 * would not keep.
 */
export function draftWithWhen(draft: CreationDraft, values: WhenValues): CreationDraft {
	const errors = validateWhen(values, { isContinuing: false });
	const { patch, hasPickedFirstDates } = whenPatch(values, errors, draft);
	const countryCode = patch.countryCode === undefined ? draft.countryCode : patch.countryCode;
	const prefillSources = hasPickedFirstDates
		? { ...draft.prefillSources, start_date: 'user' as const, end_date: 'user' as const }
		: draft.prefillSources;

	const formDraft: CreationDraft = {
		...draft,
		...patch,
		// The timezone shown is the one in the form, which follows the place.
		timezone: errors.timezone === undefined ? values.timezone : draft.timezone,
		countryName: countryCode === null ? null : countryName(countryCode),
		prefillSources
	};

	// A generated name takes the new start date's year at once, as saving will.
	return { ...formDraft, name: cascadedName(formDraft) ?? formDraft.name };
}

/** The line under the preview when applications would close before today. */
export type ClosingWarning = {
	/** "2 Apr". */
	closesOn: string;
	offsetDays: number;
	/** An offset that still lies ahead, or `null` when even the day before has gone. */
	suggestedOffset: number | null;
};

/**
 * A warning when the draft's relative closing date, worked out from its
 * first day, has already gone by at `now`, or `null` when all is well. The
 * Setup step owns the fix; this only says so, so nobody is surprised there.
 */
export function closingWarning(
	draft: Pick<
		CreationDraft,
		| 'startDate'
		| 'timezone'
		| 'applicationCloseRule'
		| 'applicationCloseOffsetDays'
		| 'prefillSources'
	>,
	now: Date
): ClosingWarning | null {
	if (draft.applicationCloseRule !== 'relative' || !hasChosenDates(draft)) {
		return null;
	}

	const closesAt = relativeDeadlineInstant(
		draft.startDate,
		draft.applicationCloseOffsetDays,
		draft.timezone
	);

	if (closesAt === null || !isDeadlinePast(closesAt, now)) {
		return null;
	}

	return {
		closesOn: formatDayAndMonth(closesAt, draft.timezone),
		offsetDays: draft.applicationCloseOffsetDays,
		suggestedOffset: nearestFutureOffset(
			draft.startDate,
			draft.applicationCloseOffsetDays,
			draft.timezone,
			now
		)
	};
}

/**
 * What "Use these dates" saves: next year's dates for the previous edition,
 * and its times when it had them, all marked as coming from that edition
 * rather than typed. `null` when the previous dates give no suggestion.
 */
export function suggestedDatesSave(
	previous: Pick<
		PreviousConference,
		'startDate' | 'endDate' | 'conferenceTimeStatus' | 'startTime' | 'endTime'
	>
): { patch: Partial<DraftValues>; sources: PrefillSources } | null {
	const suggestion = suggestNextEditionDates(previous.startDate, previous.endDate);

	if (suggestion === null) {
		return null;
	}

	const patch: Partial<DraftValues> = { ...suggestion };
	const sources: PrefillSources = {
		start_date: 'previous_conference',
		end_date: 'previous_conference'
	};

	if (
		previous.conferenceTimeStatus === 'known' &&
		previous.startTime !== null &&
		previous.endTime !== null
	) {
		patch.conferenceTimeStatus = 'known';
		patch.startTime = previous.startTime.slice(0, 5);
		patch.endTime = previous.endTime.slice(0, 5);
		sources.start_time = 'previous_conference';
		sources.end_time = 'previous_conference';
	}

	return { patch, sources };
}
