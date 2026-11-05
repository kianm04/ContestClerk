/**
 * Where the conference creation steps (Trello fe3reN7Y) get and keep their
 * data: the organisations somebody may create a conference for, the earlier
 * edition a new one is prefilled from, and the draft itself.
 *
 * Files under `$lib/server` only ever run on the server, so this is where the
 * database is queried. Every function takes the Supabase client as its first
 * argument; pages pass in `locals.supabase`, the client that knows who is
 * signed in, so Row Level Security decides what each caller may read and
 * write. These functions read the `conferences` table rather than the
 * `conferences_with_organization` view, because a draft is written as well as
 * read, and a view over a join cannot be written to.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { countryName } from '$lib/countries';
import type {
	CreationDraft,
	CreationOrganization,
	PrefillField,
	PrefillSource,
	PrefillSources,
	PreviousConference,
	PreviousConferenceFee
} from '$lib/creation-draft';
import type { DraftValues } from '$lib/creation-prefill';
import type { SavedCreationStep } from '$lib/creation-steps';
import type { Database } from '$lib/database.types';
import { makeUniqueSlug } from '$lib/slugs';

type ConferenceRow = Database['public']['Tables']['conferences']['Row'];
type OrganizationRow = Database['public']['Tables']['organizations']['Row'];

/** The bucket every public picture lives in, as `$lib/server/conferences.ts` uses it. */
const PUBLIC_MEDIA_BUCKET = 'public-media';

/** The `conferences` column each draft value is stored in. */
const COLUMN_OF: Record<keyof DraftValues, keyof ConferenceRow> = {
	name: 'name',
	tagline: 'tagline',
	description: 'description',
	locationMode: 'location_mode',
	city: 'city',
	countryCode: 'country_code',
	venueStatus: 'venue_status',
	venueName: 'venue_name',
	startDate: 'start_date',
	endDate: 'end_date',
	conferenceTimeStatus: 'conference_time_status',
	startTime: 'start_time',
	endTime: 'end_time',
	timezone: 'timezone',
	currency: 'currency',
	level: 'level',
	contactEmail: 'contact_email',
	websiteUrl: 'website_url',
	instagramUrl: 'instagram_url',
	logoPath: 'logo_path',
	bannerPath: 'banner_path',
	acceptsIndividualApplications: 'accepts_individual_applications',
	acceptsDelegations: 'accepts_delegations',
	committeePreferenceCount: 'committee_preference_count',
	askMotivation: 'ask_motivation',
	positionPaperRequired: 'position_paper_required',
	applicationOpenMode: 'application_open_mode',
	applicationCloseRule: 'application_close_rule',
	applicationCloseOffsetDays: 'application_close_offset_days',
	applicationsCloseAt: 'applications_close_at',
	feeStatus: 'fee_status',
	collectsPaymentsManually: 'collects_payments_manually'
};

/** Draft values under their column names, ready for an insert or an update. */
function toColumns(values: Partial<DraftValues>): Record<string, unknown> {
	const columns: Record<string, unknown> = {};

	for (const key of Object.keys(values) as (keyof DraftValues)[]) {
		columns[COLUMN_OF[key]] = values[key];
	}

	return columns;
}

/** "10:00:00" as Postgres sends a time of day becomes "10:00". */
function toMinutes(time: string | null): string | null {
	return time === null ? null : time.slice(0, 5);
}

/** A country name, or `null` when there is no country yet. */
function nameOfCountry(code: string | null): string | null {
	return code === null || code === '' ? null : countryName(code);
}

const SOURCES: PrefillSource[] = ['organization', 'previous_conference', 'system_default', 'user'];

/**
 * `prefill_sources` as stored (any JSON at all, as far as the types know) read
 * back into sources, dropping anything that is not one.
 */
function readSources(json: unknown): PrefillSources {
	const sources: PrefillSources = {};

	if (json === null || typeof json !== 'object' || Array.isArray(json)) {
		return sources;
	}

	for (const [field, source] of Object.entries(json)) {
		if (SOURCES.includes(source as PrefillSource)) {
			sources[field as PrefillField] = source as PrefillSource;
		}
	}

	return sources;
}

/** The columns of an organisation a card reads. */
const ORGANIZATION_COLUMNS =
	'id, slug, name, city, country_code, logo_path, website_url, is_personal, stripe_onboarding_completed_at';

type CreationOrganizationRow = Pick<
	OrganizationRow,
	| 'id'
	| 'slug'
	| 'name'
	| 'city'
	| 'country_code'
	| 'logo_path'
	| 'website_url'
	| 'is_personal'
	| 'stripe_onboarding_completed_at'
>;

type LastConferenceRow = Pick<
	ConferenceRow,
	'organization_id' | 'name' | 'start_date' | 'end_date'
>;

function toCreationOrganization(
	row: CreationOrganizationRow,
	last: LastConferenceRow | undefined
): CreationOrganization {
	return {
		id: row.id,
		slug: row.slug,
		name: row.name,
		city: row.city,
		countryCode: row.country_code,
		countryName: nameOfCountry(row.country_code),
		logoPath: row.logo_path,
		websiteUrl: row.website_url,
		isStripeConnected: row.stripe_onboarding_completed_at !== null,
		lastConference: last
			? { name: last.name, startDate: last.start_date, endDate: last.end_date }
			: null
	};
}

/**
 * The most recent conference of each organisation that is not a draft, by
 * organisation. One query for all of them, newest first, so the first row
 * met for an organisation is its latest.
 */
async function latestConferences(
	supabase: SupabaseClient,
	organizationIds: string[]
): Promise<Map<string, LastConferenceRow>> {
	const latest = new Map<string, LastConferenceRow>();

	if (organizationIds.length === 0) {
		return latest;
	}

	const { data, error } = await supabase
		.from('conferences')
		.select('organization_id, name, start_date, end_date')
		.in('organization_id', organizationIds)
		.eq('kind', 'conference')
		.neq('status', 'draft')
		.order('start_date', { ascending: false })
		.overrideTypes<LastConferenceRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the organisations' conferences: ${error.message}`);
	}

	for (const row of data ?? []) {
		if (!latest.has(row.organization_id)) {
			latest.set(row.organization_id, row);
		}
	}

	return latest;
}

/**
 * The organisations `userId` may create a conference for: the ones they are a
 * member of, without the personal organisation that holds their quick
 * sessions, sorted by name.
 */
export async function listCreationOrganizations(
	supabase: SupabaseClient,
	userId: string
): Promise<CreationOrganization[]> {
	const { data, error } = await supabase
		.from('organization_members')
		// The organisation each membership points at comes attached, by its foreign key.
		.select(`organizations(${ORGANIZATION_COLUMNS})`)
		.eq('user_id', userId)
		.overrideTypes<{ organizations: CreationOrganizationRow | null }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not list your organisations: ${error.message}`);
	}

	const rows = (data ?? [])
		.map((membership) => membership.organizations)
		.filter((row): row is CreationOrganizationRow => row !== null && !row.is_personal);
	const latest = await latestConferences(
		supabase,
		rows.map((row) => row.id)
	);

	return rows
		.map((row) => toCreationOrganization(row, latest.get(row.id)))
		.sort((first, second) => first.name.localeCompare(second.name));
}

/** One organisation, or `null` when it does not exist or this reader may not see it. */
export async function getCreationOrganization(
	supabase: SupabaseClient,
	organizationId: string
): Promise<CreationOrganization | null> {
	const { data, error } = await supabase
		.from('organizations')
		.select(ORGANIZATION_COLUMNS)
		.eq('id', organizationId)
		// `maybeSingle` returns one row, or `null` when nothing matches, instead of a list.
		.maybeSingle()
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<CreationOrganizationRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not read the organisation: ${error.message}`);
	}

	if (!data) {
		return null;
	}

	const latest = await latestConferences(supabase, [data.id]);

	return toCreationOrganization(data, latest.get(data.id));
}

/** The columns of an earlier edition the prefill and the imports read, with counts and fees attached. */
const PREVIOUS_COLUMNS = [
	'id, slug, name, start_date, end_date, conference_time_status, start_time, end_time, timezone',
	'location_mode, city, country_code, venue_status, venue_name, venue_address, banner_path, logo_path',
	'tagline, description, contact_email, website_url, instagram_url, currency, level',
	'collects_payments_manually, accepts_individual_applications, accepts_delegations',
	'committee_preference_count, ask_motivation, position_paper_required',
	'application_close_rule, application_close_offset_days',
	// `(count)` asks for the number of attached rows rather than the rows.
	'committees(count), application_questions(count)',
	'fees(id, name, amount_cents, applies_to, description, position)'
].join(', ');

type PreviousRow = Pick<
	ConferenceRow,
	| 'id'
	| 'slug'
	| 'name'
	| 'start_date'
	| 'end_date'
	| 'conference_time_status'
	| 'start_time'
	| 'end_time'
	| 'timezone'
	| 'location_mode'
	| 'city'
	| 'country_code'
	| 'venue_status'
	| 'venue_name'
	| 'venue_address'
	| 'banner_path'
	| 'logo_path'
	| 'tagline'
	| 'description'
	| 'contact_email'
	| 'website_url'
	| 'instagram_url'
	| 'currency'
	| 'level'
	| 'collects_payments_manually'
	| 'accepts_individual_applications'
	| 'accepts_delegations'
	| 'committee_preference_count'
	| 'ask_motivation'
	| 'position_paper_required'
	| 'application_close_rule'
	| 'application_close_offset_days'
> & {
	committees: { count: number }[];
	application_questions: { count: number }[];
	fees: {
		id: string;
		name: string;
		amount_cents: number;
		applies_to: PreviousConferenceFee['appliesTo'];
		description: string | null;
		position: number;
	}[];
};

/** The number in an attached `(count)`, which arrives as `[{ count }]`. */
function countOf(counted: { count: number }[] | null | undefined): number {
	return counted?.[0]?.count ?? 0;
}

function toPreviousConference(row: PreviousRow): PreviousConference {
	const fees = [...(row.fees ?? [])]
		.sort((first, second) => first.position - second.position)
		.map((fee) => ({
			id: fee.id,
			name: fee.name,
			amountCents: fee.amount_cents,
			appliesTo: fee.applies_to,
			description: fee.description
		}));

	return {
		id: row.id,
		slug: row.slug,
		name: row.name,
		startDate: row.start_date,
		endDate: row.end_date,
		conferenceTimeStatus: row.conference_time_status,
		startTime: toMinutes(row.start_time),
		endTime: toMinutes(row.end_time),
		timezone: row.timezone,
		locationMode: row.location_mode,
		city: row.city,
		countryCode: row.country_code,
		countryName: nameOfCountry(row.country_code),
		venueStatus: row.venue_status,
		venueName: row.venue_name,
		venueAddress: row.venue_address,
		bannerPath: row.banner_path,
		logoPath: row.logo_path,
		tagline: row.tagline,
		description: row.description,
		contactEmail: row.contact_email,
		websiteUrl: row.website_url,
		instagramUrl: row.instagram_url,
		currency: row.currency,
		level: row.level,
		committeeCount: countOf(row.committees),
		questionCount: countOf(row.application_questions),
		fees,
		collectsPaymentsManually: row.collects_payments_manually,
		acceptsIndividualApplications: row.accepts_individual_applications,
		acceptsDelegations: row.accepts_delegations,
		committeePreferenceCount: row.committee_preference_count,
		askMotivation: row.ask_motivation,
		positionPaperRequired: row.position_paper_required,
		applicationCloseRule: row.application_close_rule,
		applicationCloseOffsetDays: row.application_close_offset_days
	};
}

/**
 * The organisation's most recent earlier edition: a full conference (not a
 * quick session) that was published, latest first day first. `excludeConferenceId`
 * leaves out the draft being created, which is never its own previous edition.
 */
export async function findPreviousConference(
	supabase: SupabaseClient,
	organizationId: string,
	excludeConferenceId: string | null
): Promise<PreviousConference | null> {
	let query = supabase
		.from('conferences')
		.select(PREVIOUS_COLUMNS)
		.eq('organization_id', organizationId)
		.eq('kind', 'conference')
		.in('status', ['published', 'archived']);

	if (excludeConferenceId !== null) {
		query = query.neq('id', excludeConferenceId);
	}

	const { data, error } = await query
		.order('start_date', { ascending: false })
		.limit(1)
		.maybeSingle()
		.overrideTypes<PreviousRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not read the previous conference: ${error.message}`);
	}

	return data ? toPreviousConference(data) : null;
}

/** Every column of a draft the steps read. */
const DRAFT_COLUMNS = [
	'id, slug, name, tagline, description, organization_id, status, creation_step',
	'location_mode, city, country_code, venue_status, venue_name, venue_address',
	'start_date, end_date, timezone, conference_time_status, start_time, end_time, currency, level',
	'logo_path, banner_path, contact_email, website_url, instagram_url',
	'fee_status, collects_payments_manually',
	'application_open_mode, applications_open_at, application_close_rule, application_close_offset_days, applications_close_at',
	'accepts_individual_applications, accepts_delegations, committee_preference_count, ask_motivation, position_paper_required',
	'prefill_sources, updated_at'
].join(', ');

type DraftRow = Pick<
	ConferenceRow,
	| 'id'
	| 'slug'
	| 'name'
	| 'tagline'
	| 'description'
	| 'organization_id'
	| 'status'
	| 'creation_step'
	| 'location_mode'
	| 'city'
	| 'country_code'
	| 'venue_status'
	| 'venue_name'
	| 'venue_address'
	| 'start_date'
	| 'end_date'
	| 'timezone'
	| 'conference_time_status'
	| 'start_time'
	| 'end_time'
	| 'currency'
	| 'level'
	| 'logo_path'
	| 'banner_path'
	| 'contact_email'
	| 'website_url'
	| 'instagram_url'
	| 'fee_status'
	| 'collects_payments_manually'
	| 'application_open_mode'
	| 'applications_open_at'
	| 'application_close_rule'
	| 'application_close_offset_days'
	| 'applications_close_at'
	| 'accepts_individual_applications'
	| 'accepts_delegations'
	| 'committee_preference_count'
	| 'ask_motivation'
	| 'position_paper_required'
	| 'prefill_sources'
	| 'updated_at'
>;

function toCreationDraft(row: DraftRow): CreationDraft {
	return {
		id: row.id,
		slug: row.slug,
		name: row.name,
		tagline: row.tagline,
		description: row.description,
		organizationId: row.organization_id,
		status: row.status,
		creationStep: row.creation_step,
		locationMode: row.location_mode,
		city: row.city,
		countryCode: row.country_code,
		countryName: nameOfCountry(row.country_code),
		venueStatus: row.venue_status,
		venueName: row.venue_name,
		venueAddress: row.venue_address,
		startDate: row.start_date,
		endDate: row.end_date,
		timezone: row.timezone,
		conferenceTimeStatus: row.conference_time_status,
		startTime: toMinutes(row.start_time),
		endTime: toMinutes(row.end_time),
		currency: row.currency,
		level: row.level,
		logoPath: row.logo_path,
		bannerPath: row.banner_path,
		contactEmail: row.contact_email,
		websiteUrl: row.website_url,
		instagramUrl: row.instagram_url,
		feeStatus: row.fee_status,
		collectsPaymentsManually: row.collects_payments_manually,
		applicationOpenMode: row.application_open_mode,
		applicationsOpenAt: row.applications_open_at,
		applicationCloseRule: row.application_close_rule,
		applicationCloseOffsetDays: row.application_close_offset_days,
		applicationsCloseAt: row.applications_close_at,
		acceptsIndividualApplications: row.accepts_individual_applications,
		acceptsDelegations: row.accepts_delegations,
		committeePreferenceCount: row.committee_preference_count,
		askMotivation: row.ask_motivation,
		positionPaperRequired: row.position_paper_required,
		prefillSources: readSources(row.prefill_sources),
		updatedAt: row.updated_at
	};
}

/**
 * The conference at `slug` as the creation steps read it, or `null` when there
 * is none this reader may see. It answers for a published conference too; the
 * layout of the steps is what sends one of those to its manage page.
 */
export async function getCreationDraft(
	supabase: SupabaseClient,
	slug: string
): Promise<CreationDraft | null> {
	const { data, error } = await supabase
		.from('conferences')
		.select(DRAFT_COLUMNS)
		.eq('slug', slug)
		.maybeSingle()
		.overrideTypes<DraftRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not read the draft: ${error.message}`);
	}

	return data ? toCreationDraft(data) : null;
}

/**
 * Save a new draft with its prefilled values and where each came from, and
 * return its slug. The database refuses the insert unless `userId` is the
 * signed-in user and a member of the organisation.
 */
export async function createCreationDraft(
	supabase: SupabaseClient,
	input: { organizationId: string; userId: string; values: DraftValues; sources: PrefillSources }
): Promise<string> {
	const slug = makeUniqueSlug(input.values.name);

	const { error } = await supabase.from('conferences').insert({
		...toColumns(input.values),
		slug,
		organization_id: input.organizationId,
		created_by: input.userId,
		// Nobody sees a draft but its organisers until it is published at Launch.
		status: 'draft',
		creation_step: 'basics',
		prefill_sources: input.sources
	});

	if (error) {
		throw new Error(`Could not create the draft: ${error.message}`);
	}

	return slug;
}

/** Save the columns in `patch`, and the sources as they stand now. */
export async function updateCreationDraft(
	supabase: SupabaseClient,
	draftId: string,
	patch: Partial<DraftValues>,
	sources: PrefillSources
): Promise<void> {
	const { error } = await supabase
		.from('conferences')
		.update({ ...toColumns(patch), prefill_sources: sources })
		.eq('id', draftId);

	if (error) {
		throw new Error(`Could not save the draft: ${error.message}`);
	}
}

/** Remember the furthest step a draft reached, so the organiser comes back to it. */
export async function setCreationStep(
	supabase: SupabaseClient,
	draftId: string,
	step: SavedCreationStep
): Promise<void> {
	const { error } = await supabase
		.from('conferences')
		.update({ creation_step: step })
		.eq('id', draftId);

	if (error) {
		throw new Error(`Could not save the step: ${error.message}`);
	}
}

/** Copy one picture next to the draft's own, or `null` when it could not be copied. */
async function copyPicture(
	supabase: SupabaseClient,
	draftId: string,
	fromPath: string | null,
	kind: 'logo' | 'banner'
): Promise<string | null> {
	if (fromPath === null) {
		return null;
	}

	const extension = /\.([a-z0-9]+)$/i.exec(fromPath)?.[1]?.toLowerCase() ?? 'jpg';
	const toPath = `conferences/${draftId}/${kind}.${extension}`;

	try {
		const { error } = await supabase.storage.from(PUBLIC_MEDIA_BUCKET).copy(fromPath, toPath);

		return error ? null : toPath;
	} catch {
		return null;
	}
}

/**
 * Copy the organisation's logo and the previous edition's banner into the new
 * draft's own folder, so replacing or deleting either one later never touches
 * the picture it came from. Best effort: a picture that cannot be copied is
 * simply not there (`null`), and the draft goes ahead without it.
 */
export async function copyBrandingInto(
	supabase: SupabaseClient,
	draftId: string,
	from: { logoPath: string | null; bannerPath: string | null }
): Promise<{ logoPath: string | null; bannerPath: string | null }> {
	const [logoPath, bannerPath] = await Promise.all([
		copyPicture(supabase, draftId, from.logoPath, 'logo'),
		copyPicture(supabase, draftId, from.bannerPath, 'banner')
	]);

	return { logoPath, bannerPath };
}

/**
 * Make the draft the Organisation step's "Continue to basics" asks for, and
 * return its slug. The prefill points the logo and banner at the
 * organisation's and the previous edition's own pictures; they are copied into
 * the draft's folder (see `copyBrandingInto`) once the draft exists, because
 * that folder is named by its id. Until then, and whenever a copy fails, the
 * draft simply has no picture.
 */
export async function startCreationDraft(
	supabase: SupabaseClient,
	input: { organizationId: string; userId: string; values: DraftValues; sources: PrefillSources }
): Promise<string> {
	// The two picture sources are left out until the copies exist.
	const { logo_path: logoSource, banner_path: bannerSource, ...otherSources } = input.sources;
	const wanted = { logoPath: input.values.logoPath, bannerPath: input.values.bannerPath };

	const slug = await createCreationDraft(supabase, {
		...input,
		values: { ...input.values, logoPath: null, bannerPath: null },
		sources: otherSources
	});

	if (wanted.logoPath === null && wanted.bannerPath === null) {
		return slug;
	}

	const draft = await getCreationDraft(supabase, slug);

	if (!draft) {
		return slug;
	}

	const copied = await copyBrandingInto(supabase, draft.id, wanted);

	if (copied.logoPath === null && copied.bannerPath === null) {
		return slug;
	}

	const sources: PrefillSources = { ...otherSources };
	if (copied.logoPath && logoSource) {
		sources.logo_path = logoSource;
	}
	if (copied.bannerPath && bannerSource) {
		sources.banner_path = bannerSource;
	}

	await updateCreationDraft(supabase, draft.id, copied, sources);

	return slug;
}

/** What the Launch step counts in the tables around a draft. */
export type DraftFactCounts = {
	committeeCount: number;
	questionCount: number;
	feeCount: number;
	/** The first fee in position order, or `null` when there are none. */
	firstFee: { name: string; amountCents: number } | null;
};

type DraftFactsRow = {
	committees: { count: number }[];
	application_questions: { count: number }[];
	fees: { name: string; amount_cents: number; position: number }[];
};

/**
 * How many committees, application questions and fees the draft has, and its
 * first fee, in one query: the counts and the fees come attached to the row.
 */
export async function countDraftFacts(
	supabase: SupabaseClient,
	draftId: string
): Promise<DraftFactCounts> {
	const { data, error } = await supabase
		.from('conferences')
		.select('committees(count), application_questions(count), fees(name, amount_cents, position)')
		.eq('id', draftId)
		.maybeSingle()
		.overrideTypes<DraftFactsRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not count what the draft holds: ${error.message}`);
	}

	const fees = [...(data?.fees ?? [])].sort((first, second) => first.position - second.position);
	const first = fees[0];

	return {
		committeeCount: countOf(data?.committees),
		questionCount: countOf(data?.application_questions),
		feeCount: fees.length,
		firstFee: first ? { name: first.name, amountCents: first.amount_cents } : null
	};
}

/**
 * Make the draft public: the Launch step's "Publish conference".
 *
 * Publishing and opening applications are separate decisions. A `manual`
 * draft opens them only when the organiser chose `publish_and_open`, and an
 * `on_publish` one always does: both by setting the opening moment to now.
 * A `scheduled` draft keeps the moment Setup gave it, and a manual draft
 * published on its own keeps none, which is what "not open yet" means.
 *
 * The database checks the row as well (a conference held somewhere needs its
 * place), and its message is passed on when it refuses.
 */
export async function publishDraft(
	supabase: SupabaseClient,
	draft: Pick<CreationDraft, 'id' | 'applicationOpenMode'>,
	choice: 'publish' | 'publish_and_open',
	now: Date
): Promise<void> {
	const opensNow =
		draft.applicationOpenMode === 'on_publish' ||
		(draft.applicationOpenMode === 'manual' && choice === 'publish_and_open');

	const changes: Partial<ConferenceRow> = { status: 'published' };

	if (opensNow) {
		changes.applications_open_at = now.toISOString();
	}

	const { error } = await supabase.from('conferences').update(changes).eq('id', draft.id);

	if (error) {
		throw new Error(`Could not publish the conference: ${error.message}`);
	}
}
