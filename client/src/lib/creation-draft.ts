/**
 * A conference while it is being created (Trello fe3reN7Y): the shapes every
 * creation step reads, and the plain sentences the preview and the summaries
 * build from them.
 *
 * A draft is an ordinary `conferences` row with `status = 'draft'`. What makes
 * it a draft worth its own types is that some of its values are not decisions
 * yet: the dates may be a placeholder, the venue "to be announced", the fees
 * undecided. `prefillSources` records where each filled value came from, so a
 * screen can tell a suggestion from something the organiser typed.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import type { Database } from '$lib/database.types';
import { formatDateRange } from '$lib/dates';

type Enums = Database['public']['Enums'];

/** in_person, online or hybrid. */
export type LocationMode = Enums['location_mode'];
/** known or tba: whether a venue or the times of day have been decided. */
export type KnownOrTba = Enums['known_or_tba'];
/** free, paid or undecided. */
export type FeeStatus = Enums['fee_status'];
/** manual, on_publish or scheduled: how applications come to open. */
export type ApplicationOpenMode = Enums['application_open_mode'];
/** relative (counted back from the first day) or fixed (a chosen moment). */
export type ApplicationCloseRule = Enums['application_close_rule'];

/** Where a prefilled value came from. `user` means the organiser typed it; never overwrite those. */
export type PrefillSource = 'organization' | 'previous_conference' | 'system_default' | 'user';

/** The conference columns whose origin is tracked, as stored in `prefill_sources`. */
export type PrefillField =
	| 'name'
	| 'tagline'
	| 'description'
	| 'location_mode'
	| 'city'
	| 'country_code'
	| 'venue_name'
	| 'start_date'
	| 'end_date'
	| 'start_time'
	| 'end_time'
	| 'timezone'
	| 'currency'
	| 'level'
	| 'contact_email'
	| 'website_url'
	| 'instagram_url'
	| 'logo_path'
	| 'banner_path';

export type PrefillSources = Partial<Record<PrefillField, PrefillSource>>;

export type ConferenceLevel = 'high_school' | 'university' | 'mixed';

/** A draft as the creation steps read it: the whole row, camelCase. Times are 'HH:MM' or null. */
export type CreationDraft = {
	id: string;
	slug: string;
	name: string;
	tagline: string | null;
	description: string | null;
	organizationId: string;
	status: 'draft' | 'published' | 'archived';
	creationStep: 'basics' | 'when' | 'setup' | 'launch';
	locationMode: LocationMode;
	city: string | null;
	countryCode: string | null;
	countryName: string | null;
	venueStatus: KnownOrTba;
	venueName: string | null;
	venueAddress: string | null;
	startDate: string;
	endDate: string;
	timezone: string;
	conferenceTimeStatus: KnownOrTba;
	startTime: string | null;
	endTime: string | null;
	currency: string;
	level: ConferenceLevel;
	logoPath: string | null;
	bannerPath: string | null;
	contactEmail: string | null;
	websiteUrl: string | null;
	instagramUrl: string | null;
	feeStatus: FeeStatus;
	collectsPaymentsManually: boolean;
	applicationOpenMode: ApplicationOpenMode;
	applicationsOpenAt: string | null;
	applicationCloseRule: ApplicationCloseRule;
	applicationCloseOffsetDays: number;
	applicationsCloseAt: string | null;
	acceptsIndividualApplications: boolean;
	acceptsDelegations: boolean;
	committeePreferenceCount: number;
	askMotivation: boolean;
	positionPaperRequired: boolean;
	prefillSources: PrefillSources;
	/** ISO. */
	updatedAt: string;
};

/** An organisation as the Organisation step's cards and the prefill read it. */
export type CreationOrganization = {
	id: string;
	slug: string;
	name: string;
	city: string | null;
	countryCode: string | null;
	countryName: string | null;
	logoPath: string | null;
	websiteUrl: string | null;
	isStripeConnected: boolean;
	/** Its most recent conference that is not a draft, or null. */
	lastConference: { name: string; startDate: string; endDate: string } | null;
};

/** One fee of an earlier edition. */
export type PreviousConferenceFee = {
	id: string;
	name: string;
	amountCents: number;
	appliesTo: 'individual' | 'delegation_member';
	description: string | null;
};

/** The most recent earlier edition the prefill and the imports read. */
export type PreviousConference = {
	id: string;
	slug: string;
	name: string;
	startDate: string;
	endDate: string;
	conferenceTimeStatus: KnownOrTba;
	startTime: string | null;
	endTime: string | null;
	timezone: string;
	locationMode: LocationMode;
	city: string | null;
	countryCode: string | null;
	countryName: string | null;
	venueStatus: KnownOrTba;
	venueName: string | null;
	venueAddress: string | null;
	bannerPath: string | null;
	logoPath: string | null;
	tagline: string | null;
	description: string | null;
	contactEmail: string | null;
	websiteUrl: string | null;
	instagramUrl: string | null;
	currency: string;
	level: ConferenceLevel;
	committeeCount: number;
	questionCount: number;
	/** In position order; empty when it charged nothing. */
	fees: PreviousConferenceFee[];
	collectsPaymentsManually: boolean;
	acceptsIndividualApplications: boolean;
	acceptsDelegations: boolean;
	committeePreferenceCount: number;
	askMotivation: boolean;
	positionPaperRequired: boolean;
	applicationCloseRule: ApplicationCloseRule;
	applicationCloseOffsetDays: number;
};

/**
 * The parts of a draft the sentences below read. The Organisation step has no
 * draft yet, only a suggestion, so the helpers ask for no more than this.
 */
export type DraftFacts = Pick<
	CreationDraft,
	| 'name'
	| 'tagline'
	| 'description'
	| 'locationMode'
	| 'city'
	| 'countryCode'
	| 'countryName'
	| 'venueStatus'
	| 'venueName'
	| 'startDate'
	| 'endDate'
	| 'timezone'
	| 'conferenceTimeStatus'
	| 'startTime'
	| 'endTime'
	| 'level'
	| 'bannerPath'
	| 'feeStatus'
	| 'prefillSources'
>;

/**
 * Whether the organiser has dates. The date columns can never be empty, so a
 * draft started without an earlier edition stores a placeholder a year ahead
 * and marks it `system_default`; that placeholder is not a date anybody chose.
 */
export function hasChosenDates(draft: Pick<CreationDraft, 'prefillSources'>): boolean {
	return draft.prefillSources.start_date !== 'system_default';
}

/** "16 – 18 Apr 2027", or "Dates to be announced" while the dates are a placeholder. */
export function datesLine(
	draft: Pick<CreationDraft, 'startDate' | 'endDate' | 'prefillSources'>
): string {
	if (!hasChosenDates(draft)) {
		return 'Dates to be announced';
	}

	return formatDateRange(draft.startDate, draft.endDate);
}

/** "Delft, Netherlands", "Online", "Hybrid · Delft, Netherlands" or "Location to be announced". */
export function locationLine(
	draft: Pick<CreationDraft, 'locationMode' | 'city' | 'countryName'>
): string {
	if (draft.locationMode === 'online') {
		return 'Online';
	}

	// Whatever part of the place is known is said; a city alone still helps.
	const place = [draft.city, draft.countryName]
		.filter((part) => part !== null && part !== '')
		.join(', ');

	if (place === '') {
		return 'Location to be announced';
	}

	return draft.locationMode === 'hybrid' ? `Hybrid · ${place}` : place;
}

/** The venue's name, "Venue to be announced", or "Online" when there is no room at all. */
export function venueLine(
	draft: Pick<CreationDraft, 'locationMode' | 'venueStatus' | 'venueName'>
): string {
	if (draft.locationMode === 'online') {
		return 'Online';
	}

	const name = draft.venueName?.trim() ?? '';

	if (draft.venueStatus === 'known' && name !== '') {
		return name;
	}

	return 'Venue to be announced';
}

/** "10:00 – 17:00", or "Times not decided". */
export function timesLine(
	draft: Pick<CreationDraft, 'conferenceTimeStatus' | 'startTime' | 'endTime'>
): string {
	if (
		draft.conferenceTimeStatus !== 'known' ||
		draft.startTime === null ||
		draft.endTime === null
	) {
		return 'Times not decided';
	}

	return `${draft.startTime.slice(0, 5)} – ${draft.endTime.slice(0, 5)}`;
}

/**
 * "Free", a summary of the fees such as "€35 delegate fee", or "Fees to be
 * announced". The summary is the caller's, because only it has the fee rows.
 */
export function feesLine(
	draft: Pick<CreationDraft, 'feeStatus'>,
	feeSummary: string | null
): string {
	if (draft.feeStatus === 'free') {
		return 'Free';
	}

	if (draft.feeStatus === 'paid' && feeSummary !== null && feeSummary !== '') {
		return feeSummary;
	}

	return 'Fees to be announced';
}

/**
 * The quiet words beside a field that was filled in for the organiser, or
 * `null` once there is nothing to say: what they typed themselves, and a
 * safe default, which is not a claim about their conference.
 */
export function sourceChipLabel(
	field: PrefillField,
	source: PrefillSource | undefined
): string | null {
	if (source === undefined || source === 'user' || source === 'system_default') {
		return null;
	}

	if (field === 'name') {
		return 'Generated name';
	}

	if (field === 'start_date' && source === 'previous_conference') {
		return 'Suggested dates';
	}

	return source === 'organization' ? 'From organisation' : 'Based on last conference';
}

/** Which line of the preview a fact is, so the card can draw the right icon before it. */
export type PreviewFactKind =
	'dates' | 'place' | 'venue' | 'level' | 'timezone' | 'fees' | 'organiser' | 'audience';

/** One line of the preview card, such as `{ kind: 'dates', text: '16 – 18 Apr 2027' }`. */
export type PreviewFact = { kind: PreviewFactKind; text: string };

/** What the preview card on the right of every step shows. */
export type CreationPreview = {
	name: string;
	tagline: string | null;
	bannerPath: string | null;
	/** The organisation's name; the card writes "Organised by" before it. */
	organizedBy: string;
	/** Dates, place, venue (not for an online conference), level, timezone and decided fees, in that order. */
	facts: PreviewFact[];
	description: string | null;
};

/** Who the conference is for, as the mockups word it under the preview's place. */
const LEVEL_AUDIENCE: Record<ConferenceLevel, string> = {
	university: 'University delegates',
	high_school: 'High school delegates',
	mixed: 'High school and university'
};

/** The preview card for a draft, or for the suggestion the Organisation step holds. */
export function creationPreview(
	draft: DraftFacts,
	organizationName: string,
	feeSummary: string | null
): CreationPreview {
	const facts: PreviewFact[] = [
		{ kind: 'dates', text: datesLine(draft) },
		{ kind: 'place', text: locationLine(draft) }
	];

	if (draft.locationMode !== 'online') {
		facts.push({ kind: 'venue', text: venueLine(draft) });
	}

	facts.push({ kind: 'level', text: LEVEL_AUDIENCE[draft.level] });
	// Timezones are stored as "Europe/Amsterdam"; the underscore in names such
	// as "America/New_York" is not for people.
	facts.push({ kind: 'timezone', text: draft.timezone.replaceAll('_', ' ') });

	// The fees only get a line once something was decided, so a fresh draft
	// does not open with a line saying nothing is known.
	if (draft.feeStatus !== 'undecided') {
		facts.push({ kind: 'fees', text: feesLine(draft, feeSummary) });
	}

	return {
		name: draft.name.trim() === '' ? 'Your conference' : draft.name,
		tagline: draft.tagline,
		bannerPath: draft.bannerPath,
		organizedBy: organizationName,
		facts,
		description: draft.description
	};
}

/** Whether the organiser typed this value themselves. */
export function isUserValue(sources: PrefillSources, field: PrefillField): boolean {
	return sources[field] === 'user';
}
