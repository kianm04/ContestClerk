import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Database } from '../../src/lib/database.types';
import { createServiceRoleClient } from '../db/supabase-test-client';
import type { TestUser } from './signed-in-user';

// The organisation and the conference a browser test about the management pages
// starts from, written straight into the database.
//
// These tests used to make both through the old one-step `/create` form. That
// form is gone: `/create` is now the first of five creation steps, and
// `create-organisation.spec.ts` and the other `create-*.spec.ts` files are the
// tests of it. Walking five steps to reach `/manage/<slug>/fees` would test the
// creation flow again in every file and make each test slower, so the rows are
// seeded here instead, in the shape the creation flow leaves them: a draft that
// has got as far as the Setup step. The service-role client only arranges the
// state a test starts in; it never proves that anything is allowed.
//
// Everything made here stays in the database until the next `pnpm db:reset`,
// except what a spec deletes itself with `deleteConferencesOf`.

/** The columns of a `conferences` row, as the database takes them on insert. */
type ConferenceColumns = Database['public']['Tables']['conferences']['Insert'];

/** An organisation `createOrganisationFor` made. */
export type TestOrganisation = { id: string; slug: string; name: string };

/** What `createOrganisationFor` may be told to do differently. */
export type TestOrganisationOptions = {
	name?: string;
	city?: string | null;
	countryCode?: string | null;
};

/** A conference `createDraftConferenceFor` or `createPublishedConferenceFor` made. */
export type TestDraftConference = {
	id: string;
	slug: string;
	name: string;
	organizationId: string;
	organizationName: string;
};

/** What `createDraftConferenceFor` may be told to do differently. */
export type TestDraftConferenceOptions = {
	name?: string;
	/** `YYYY-MM-DD`. Next spring when left out. */
	startDate?: string;
	endDate?: string;
	city?: string | null;
	countryCode?: string | null;
	timezone?: string;
	/** An organisation the user already runs. A new one is made when this is left out. */
	organizationId?: string;
	/** The name of the new organisation, when `organizationId` is left out. */
	organizationName?: string;
	/** Any other column, written as it is, last, so it wins over everything above. */
	columns?: Partial<ConferenceColumns>;
};

/** A slug nothing else in the database has: the name in lower case, and a random tail. */
function uniqueSlug(name: string): string {
	const base = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');

	return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * The first and last day of a conference next spring: a Friday to Sunday in
 * April of next year, so it is always ahead of today and always a weekend.
 */
function nextSpring(): { startDate: string; endDate: string } {
	const year = new Date().getUTCFullYear() + 1;
	// 1 April's weekday decides which day is the second Friday of April.
	const firstOfApril = new Date(Date.UTC(year, 3, 1));
	const daysToFriday = (5 - firstOfApril.getUTCDay() + 7) % 7;
	const friday = 1 + daysToFriday + 7;
	const day = (date: number) => `${year}-04-${String(date).padStart(2, '0')}`;

	return { startDate: day(friday), endDate: day(friday + 2) };
}

/**
 * Make `user` the owner of a new organisation.
 *
 * Only `created_by` is needed for that: the `organization_members` trigger
 * makes the creator the owner as part of the same insert.
 */
export async function createOrganisationFor(
	user: TestUser,
	options: TestOrganisationOptions = {}
): Promise<TestOrganisation> {
	const admin = createServiceRoleClient();
	const name = options.name ?? `e2e Society ${crypto.randomUUID().slice(0, 8)}`;
	const slug = uniqueSlug(name);

	const { data, error } = await admin
		.from('organizations')
		.insert({
			name,
			slug,
			created_by: user.id,
			city: options.city === undefined ? 'Delft' : options.city,
			country_code: options.countryCode === undefined ? 'NL' : options.countryCode
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not create the test organisation: ${error?.message}`);
	}

	return { id: data.id, slug, name };
}

/**
 * Give `user` a draft conference that has reached the Setup step of the
 * creation flow, the state in which its management pages are first used.
 *
 * Its dates count as chosen (`prefill_sources.start_date` is `user`), so no
 * page shows "Dates to be announced" for it. Everything not named here takes
 * the database's own default, as a draft the flow made would.
 */
export async function createDraftConferenceFor(
	user: TestUser,
	options: TestDraftConferenceOptions = {}
): Promise<TestDraftConference> {
	const admin = createServiceRoleClient();
	const spring = nextSpring();
	const name = options.name ?? `e2e Conference ${crypto.randomUUID().slice(0, 8)}`;

	let organizationId = options.organizationId;
	let organizationName = options.organizationName ?? `${name} Society`;

	if (organizationId === undefined) {
		const organisation = await createOrganisationFor(user, {
			name: organizationName,
			city: options.city,
			countryCode: options.countryCode
		});
		organizationId = organisation.id;
	} else {
		const { data } = await admin
			.from('organizations')
			.select('name')
			.eq('id', organizationId)
			.single();
		organizationName = data?.name ?? organizationName;
	}

	const slug = uniqueSlug(name);
	const row: ConferenceColumns = {
		name,
		slug,
		organization_id: organizationId,
		created_by: user.id,
		status: 'draft',
		kind: 'conference',
		creation_step: 'setup',
		location_mode: 'in_person',
		start_date: options.startDate ?? spring.startDate,
		end_date: options.endDate ?? options.startDate ?? spring.endDate,
		city: options.city === undefined ? 'Delft' : options.city,
		country_code: options.countryCode === undefined ? 'NL' : options.countryCode,
		timezone: options.timezone ?? 'Europe/Amsterdam',
		prefill_sources: { start_date: 'user' },
		...options.columns
	};

	const { data, error } = await admin.from('conferences').insert(row).select('id').single();

	if (error || !data) {
		throw new Error(`Could not create the test conference: ${error?.message}`);
	}

	return { id: data.id, slug, name, organizationId, organizationName };
}

/**
 * Give `user` a conference that is already published, for a test about a page
 * that only a published conference has, such as the dashboard at
 * `/manage/<slug>`. A test about publishing itself makes a draft and presses
 * the button instead.
 */
export async function createPublishedConferenceFor(
	user: TestUser,
	options: TestDraftConferenceOptions = {}
): Promise<TestDraftConference> {
	return createDraftConferenceFor(user, {
		...options,
		columns: { status: 'published', ...options.columns }
	});
}

/** The organisation `createReturningOrganisationFor` made, and its last conference. */
export type TestReturningOrganisation = TestOrganisation & {
	previousConferenceId: string;
	previousConferenceName: string;
};

/** A one-pixel PNG: the smallest real picture, for a logo the browser can draw. */
const ONE_PIXEL_PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
	'base64'
);

/**
 * Real pictures for a test whose screenshot is held beside a mockup: a crest
 * from the sample organisations' logos, and the photograph of a Gothic
 * university the landing page shows, which is what the mockups' banner is.
 */
const SAMPLE_LOGO = join(
	import.meta.dirname,
	'../../../supabase/media/public-media/organizations/10000000-0000-4000-8000-000000000001/logo-b1000000-0000-4000-8000-000000000001.png'
);
const SAMPLE_BANNER = join(import.meta.dirname, '../../static/landing-delegates.webp');

/**
 * Give an organisation a logo: a picture in its own folder of the
 * `public-media` bucket, where its settings page would have put one. A
 * one-pixel picture unless `isRealPicture`, for a test that is looked at.
 */
async function giveOrganisationALogo(organizationId: string, isRealPicture = false): Promise<void> {
	const admin = createServiceRoleClient();
	const logoPath = `organizations/${organizationId}/logo-e2e.png`;
	const picture = isRealPicture ? readFileSync(SAMPLE_LOGO) : ONE_PIXEL_PNG;
	const upload = await admin.storage
		.from('public-media')
		.upload(logoPath, picture, { contentType: 'image/png', upsert: true });

	if (upload.error) {
		throw new Error(`Could not upload the test logo: ${upload.error.message}`);
	}

	const { error } = await admin
		.from('organizations')
		.update({ logo_path: logoPath })
		.eq('id', organizationId);

	if (error) {
		throw new Error(`Could not give the organisation its logo: ${error.message}`);
	}
}

/**
 * Give a conference a banner photograph in its own folder of the
 * `public-media` bucket, where its Basics step would have put one.
 */
export async function giveConferenceABanner(conferenceId: string): Promise<void> {
	const admin = createServiceRoleClient();
	const bannerPath = `conferences/${conferenceId}/banner-e2e.webp`;
	const upload = await admin.storage
		.from('public-media')
		.upload(bannerPath, readFileSync(SAMPLE_BANNER), { contentType: 'image/webp', upsert: true });

	if (upload.error) {
		throw new Error(`Could not upload the test banner: ${upload.error.message}`);
	}

	const { error } = await admin
		.from('conferences')
		.update({ banner_path: bannerPath })
		.eq('id', conferenceId);

	if (error) {
		throw new Error(`Could not give the conference its banner: ${error.message}`);
	}
}

/** What `createReturningOrganisationFor` may be told to do differently. */
export type TestReturningOrganisationOptions = {
	/**
	 * A real crest for the organisation and a banner photograph for its last
	 * conference, for a test whose screenshot is held beside a mockup.
	 */
	hasPictures?: boolean;
};

/**
 * Make `user` the owner of an organisation that ran a conference last spring
 * and comes back to make the next one. It has a logo of its own, and its last
 * conference was "Delft MUN 2026", Friday 17 to Sunday 19
 * April 2026 in Delft, 10:00 to 17:00 each day, with a tagline and description
 * that name the year, a contact email and a website, three committees with
 * seats and topics, a €35 delegate fee, one custom question, and applications
 * from delegates and delegations with three committee preferences. It is
 * published and over, so the directory's upcoming list never shows it.
 *
 * The creation walkthrough starts from it: everything here is what the next
 * edition can inherit.
 */
export async function createReturningOrganisationFor(
	user: TestUser,
	options: TestReturningOrganisationOptions = {}
): Promise<TestReturningOrganisation> {
	const admin = createServiceRoleClient();
	const organisation = await createOrganisationFor(user, {
		name: `Delft MUN ${crypto.randomUUID().slice(0, 8)}`
	});
	await giveOrganisationALogo(organisation.id, options.hasPictures);
	const previousConferenceName = 'Delft MUN 2026';

	const { data: conference, error } = await admin
		.from('conferences')
		.insert({
			name: previousConferenceName,
			slug: uniqueSlug(previousConferenceName),
			tagline: 'Delft MUN 2026: diplomacy on the Schie',
			description: 'Three days of debate in Delft in April 2026.',
			city: 'Delft',
			country_code: 'NL',
			start_date: '2026-04-17',
			end_date: '2026-04-19',
			conference_time_status: 'known',
			start_time: '10:00',
			end_time: '17:00',
			timezone: 'Europe/Amsterdam',
			contact_email: 'secretariat@delftmun.example',
			website_url: 'https://delftmun.example',
			accepts_individual_applications: true,
			accepts_delegations: true,
			committee_preference_count: 3,
			status: 'published',
			kind: 'conference',
			organization_id: organisation.id,
			created_by: user.id
		})
		.select('id')
		.single();

	if (error || !conference) {
		throw new Error(`Could not create the previous conference: ${error?.message}`);
	}

	const committee = (abbreviation: string, name: string, seats: number, position: number) => ({
		conference_id: conference.id,
		name,
		abbreviation,
		slug: abbreviation.toLowerCase(),
		planned_seat_count: seats,
		topics: [`${name} topic A`, `${name} topic B`],
		position
	});

	const inserts = await Promise.all([
		admin
			.from('committees')
			.insert([
				committee('UNSC', 'Security Council', 15, 0),
				committee('WHO', 'World Health Organization', 20, 1),
				committee('UNHRC', 'Human Rights Council', 12, 2)
			]),
		admin.from('fees').insert({
			conference_id: conference.id,
			name: 'Delegate fee',
			amount_cents: 3500,
			applies_to: 'individual',
			position: 0
		}),
		admin
			.from('application_questions')
			.insert({ conference_id: conference.id, label: 'Why MUN?', type: 'short_text' })
	]);

	for (const { error: insertError } of inserts) {
		if (insertError) {
			throw new Error(`Could not set up the previous conference: ${insertError.message}`);
		}
	}

	if (options.hasPictures) {
		await giveConferenceABanner(conference.id);
	}

	return { ...organisation, previousConferenceId: conference.id, previousConferenceName };
}

/**
 * Delete every conference of an organisation, with their committees, fees and
 * the rest (the foreign keys cascade). A test that publishes an upcoming
 * conference calls it when it is done: left behind, those conferences pile up
 * on the directory's first page and push the seeded ones off it.
 */
export async function deleteConferencesOf(organizationId: string): Promise<void> {
	const admin = createServiceRoleClient();
	const { error } = await admin.from('conferences').delete().eq('organization_id', organizationId);

	if (error) {
		throw new Error(`Could not delete the test conferences: ${error.message}`);
	}
}
