/**
 * Reading and creating organizations in the database.
 *
 * Files under `$lib/server` only ever run on the server. Like
 * `$lib/server/conferences.ts`, every function takes the Supabase client as its
 * first argument, so the database's Row Level Security rules see who is signed in.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SoleOwnership } from '$lib/accounts';
import { safeWebAddress } from '$lib/conference-details';
import type { Conference } from '$lib/conferences';
import { countryName } from '$lib/countries';
import {
	sortOrganizationMembers,
	stripeConnectionState,
	type ManagedOrganization,
	type Organization,
	type OrganizationDetailsValues,
	type OrganizationMember,
	type OrganizationRole,
	type OrganizationSettings,
	type PublicOrganization
} from '$lib/organizations';
import { makeUniqueSlug } from '$lib/slugs';
// `./conferences` does not import this file, so this one only goes one way.
import { listOrganizationConferences } from './conferences';

/**
 * One row of the `organization_members` table, with the organization it points at
 * attached. Written by hand because the project has no generated database types.
 * `is_personal` marks the organisation holding the person's quick sessions (S14).
 */
type MembershipRow = {
	organizations: (Organization & { is_personal: boolean }) | null;
};

/**
 * Every organization the user is a member of, sorted by name: the choice of
 * organisation on `/create`. The personal organisation holding their quick
 * sessions (S14) is left out, because nobody runs a conference in it.
 */
export async function listMyOrganizations(
	supabase: SupabaseClient,
	userId: string
): Promise<Organization[]> {
	// `organizations(id, name)` follows each membership's `organization_id` and
	// includes that organization. The database only lets people read their own
	// memberships anyway, but the `eq` makes clear whose memberships we want.
	const { data, error } = await supabase
		.from('organization_members')
		.select('organizations(id, name, is_personal)')
		.eq('user_id', userId)
		// Without generated database types, Supabase guesses that `organizations(id, name)`
		// is a list. Each membership points at exactly one organization, so this replaces
		// the guess with our own `MembershipRow`. It has to come last.
		.overrideTypes<MembershipRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not list organizations: ${error.message}`);
	}

	const rows: MembershipRow[] = data ?? [];
	const organizations: Organization[] = [];

	for (const row of rows) {
		// `null` means the organization itself could not be read, so there is nothing to show.
		if (row.organizations && !row.organizations.is_personal) {
			organizations.push({ id: row.organizations.id, name: row.organizations.name });
		}
	}

	// Sorted here rather than by Supabase, because ordering by a column of the
	// attached table would only sort inside each membership, not the list itself.
	return organizations.sort((first, second) => first.name.localeCompare(second.name));
}

/** What `createOrganization` needs to save an organization. */
export type NewOrganization = {
	name: string;
	/** The signed-in user, saved as the creator and made the owner. */
	userId: string;
	/** Where it is based, when the Organisation step of /create was told; the prefill reads both. */
	city?: string | null;
	countryCode?: string | null;
};

/** Save a new organization and return its id. */
export async function createOrganization(
	supabase: SupabaseClient,
	newOrganization: NewOrganization
): Promise<string> {
	const { data, error } = await supabase
		.from('organizations')
		.insert({
			name: newOrganization.name,
			slug: makeUniqueSlug(newOrganization.name),
			created_by: newOrganization.userId,
			city: newOrganization.city || null,
			country_code: newOrganization.countryCode || null
		})
		// Ask for the id of the new row back, as a single object rather than a list.
		.select('id')
		.single();

	if (error) {
		throw new Error(`Could not create organization: ${error.message}`);
	}

	// There is no need to add the creator to `organization_members` here. A trigger
	// in the database does that as part of this same insert (see
	// `supabase/policies.sql`), so the organization never exists without its owner.
	const row: { id: string } = data;

	return row.id;
}

/**
 * One `organization_members` row as `listMyOwnerships` reads it, with the
 * organization it points at attached.
 */
type OwnerRow = {
	user_id: string;
	organization_id: string;
	organizations: (SoleOwnership & { is_personal?: boolean }) | null;
};

/**
 * The organizations where this person is the *only* owner.
 *
 * `/settings` uses it to explain, before anybody presses anything, why deleting
 * the account will be refused: an organization must always keep an owner, so
 * the `delete_my_account()` function in the database turns a sole owner away.
 *
 * One query brings back every owner row of every organization the person
 * belongs to, because Row Level Security lets a member read the members of
 * their own organizations and no others. The grouping then happens here: an
 * organization counts when this person owns it and nobody else does.
 *
 * The personal organisation holding their quick sessions (S14) never counts:
 * `delete_my_account()` deletes it, with its quick sessions, rather than
 * asking for another owner of something nobody else can use.
 */
export async function listMyOwnerships(
	supabase: SupabaseClient,
	userId: string
): Promise<SoleOwnership[]> {
	const { data, error } = await supabase
		.from('organization_members')
		.select('user_id, organization_id, organizations(id, name, slug, is_personal)')
		.eq('role', 'owner')
		// Each membership points at exactly one organization, but without
		// generated types Supabase guesses that `organizations(...)` is a list.
		// This replaces the guess, and has to come last.
		.overrideTypes<OwnerRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not list the organizations you own: ${error.message}`);
	}

	const rows: OwnerRow[] = data ?? [];

	// How many owners each organization has, counted over every row that came
	// back, so that "only owner" is a fact about the organization rather than
	// about this one row.
	const ownerCounts = new Map<string, number>();

	for (const row of rows) {
		ownerCounts.set(row.organization_id, (ownerCounts.get(row.organization_id) ?? 0) + 1);
	}

	const ownerships: SoleOwnership[] = [];

	for (const row of rows) {
		const isMine = row.user_id === userId;
		const isOnlyOwner = ownerCounts.get(row.organization_id) === 1;

		// `null` means the organization itself could not be read, so there is no
		// name to put in the warning.
		if (isMine && isOnlyOwner && row.organizations && row.organizations.is_personal !== true) {
			const { id, name, slug } = row.organizations;

			ownerships.push({ id, name, slug });
		}
	}

	// Sorted here rather than by Supabase, because ordering by a column of the
	// attached table would only sort inside each membership, not the list itself.
	return ownerships.sort((first, second) => first.name.localeCompare(second.name));
}

/** One row of the `organizations` table as the public page reads it. */
type OrganizationRow = {
	id: string;
	slug: string;
	name: string;
	description: string | null;
	country_code: string | null;
	website_url: string | null;
	logo_path: string | null;
	/** True for the organisation holding somebody's quick sessions (S14), which has no page. */
	is_personal: boolean;
};

/** The columns the public page asks for. Everything else on the row is private or unused. */
const PUBLIC_ORGANIZATION_COLUMNS =
	'id, slug, name, description, country_code, website_url, logo_path, is_personal';

/** Everything the public organisation page shows, in one object. */
export type OrganizationPage = {
	organization: PublicOrganization;
	/** Still to come, soonest first. */
	upcoming: Conference[];
	/** Already over, most recent first, at most twelve. */
	past: Conference[];
	/** Whether the reader may edit the organisation, which an owner or an admin may. */
	isAdmin: boolean;
};

/** Turn a database row (snake_case names) into the shape the page uses. */
function toPublicOrganization(row: OrganizationRow): PublicOrganization {
	return {
		id: row.id,
		slug: row.slug,
		name: row.name,
		description: row.description,
		countryCode: row.country_code,
		// A missing country has no name to look up, and `countryName` would answer
		// with the code it was given rather than with nothing.
		countryName: row.country_code ? countryName(row.country_code) : null,
		// A row typed by hand in the Supabase dashboard never went through a form,
		// and this address goes straight into an `href` on the page.
		websiteUrl: safeWebAddress(row.website_url),
		logoPath: row.logo_path
	};
}

/**
 * The columns the organiser area reads for an organisation.
 *
 * It is exported, together with the row type and the mapper below, because
 * `loadManageIndex` in `$lib/server/manage.ts` brings the organisation along on
 * each membership row rather than looking it up again. Sharing the three means
 * the two places cannot drift into reading or showing different things.
 */
export const MANAGED_ORGANIZATION_COLUMNS =
	'id, name, slug, logo_path, stripe_onboarding_completed_at';

/** One `organizations` row as the organiser area reads it. */
export type ManagedOrganizationRow = {
	id: string;
	name: string;
	slug: string;
	logo_path: string | null;
	/** When Stripe Connect onboarding finished, or `null` while it has not. */
	stripe_onboarding_completed_at: string | null;
};

/** Turn such a row into the shape the organiser area draws. */
export function toManagedOrganization(row: ManagedOrganizationRow): ManagedOrganization {
	return {
		id: row.id,
		name: row.name,
		slug: row.slug,
		logoPath: row.logo_path,
		// The column holds the moment onboarding finished, so a row that has one is
		// connected and a row that has none is not. The page warns about the second.
		isStripeConnected: row.stripe_onboarding_completed_at !== null
	};
}

/**
 * One organisation the organiser area works on, found by its slug. `null` when
 * there is no organisation with that slug.
 *
 * Reading it says nothing about what the reader may do with it: every visitor
 * may select every organisation (`specs/02-architecture/permissions.md`), so a
 * page built on this still has to check the reader's membership itself, the way
 * `getOrganizationPage` asks `is_organization_admin`.
 */
export async function getManagedOrganization(
	supabase: SupabaseClient,
	slug: string
): Promise<ManagedOrganization | null> {
	const { data, error } = await supabase
		.from('organizations')
		.select(MANAGED_ORGANIZATION_COLUMNS)
		.eq('slug', slug)
		// `maybeSingle` returns one row, or `null` when nothing matches, instead of a list.
		.maybeSingle()
		// Replaces Supabase's guess at the row's shape, as in `getOrganizationPage`
		// above. It has to come last.
		.overrideTypes<ManagedOrganizationRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not load organization "${slug}": ${error.message}`);
	}

	if (!data) {
		return null;
	}

	return toManagedOrganization(data);
}

/**
 * Ask the database whether the signed-in reader may edit this organisation.
 *
 * `is_organization_admin` is the same helper the organisation's own update
 * policy asks, so the button the page shows and the change the database would
 * allow can never disagree. Its argument is called `org_id`, which is what the
 * migration that defines it calls it.
 *
 * A failed call answers `false` rather than throwing. It decides whether one
 * button is on the page, so the worst a wrong `false` does is hide that button,
 * where throwing would replace the whole page with an error.
 */
async function askIsOrganizationAdmin(
	supabase: SupabaseClient,
	organizationId: string
): Promise<boolean> {
	const { data, error } = await supabase.rpc('is_organization_admin', { org_id: organizationId });

	if (error) {
		return false;
	}

	return data === true;
}

/**
 * Everything the public organisation page shows, gathered in one call.
 *
 * `null` means there is no organisation with that slug, and the page turns that
 * into a 404. Every visitor may read every organisation, so unlike the
 * conference page the only other reason to answer `null` is a personal
 * organisation, the one holding somebody's quick sessions (S14): it runs no
 * conference anybody else can see, so it has nothing to show.
 *
 * The organisation has to be found first, because the conferences and the
 * permission check are both looked up by its id. Once it is there, neither of
 * those needs the other's answer, so both are asked for at once.
 *
 * `now` is given rather than read from the clock here, so that the cut between
 * upcoming and past conferences and the badges on the cards are one moment, and
 * so a test can decide what that moment is. `listConferences` takes it for the
 * same reason.
 */
export async function getOrganizationPage(
	supabase: SupabaseClient,
	slug: string,
	userId: string | null,
	now: Date
): Promise<OrganizationPage | null> {
	const { data, error } = await supabase
		.from('organizations')
		.select(PUBLIC_ORGANIZATION_COLUMNS)
		.eq('slug', slug)
		// `maybeSingle` returns one row, or `null` when nothing matches, instead of a list.
		.maybeSingle()
		// Supabase guesses the shape of a row from the text in `select`, and its
		// guess types every column as possibly missing. This replaces the guess
		// with our own `OrganizationRow`. It has to come last.
		.overrideTypes<OrganizationRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not load organization "${slug}": ${error.message}`);
	}

	if (!data || data.is_personal) {
		return null;
	}

	const organization = toPublicOrganization(data);

	const [conferences, isAdmin] = await Promise.all([
		listOrganizationConferences(supabase, organization.id, now),
		// The helper is granted to `authenticated` only, so asking it while signed
		// out would fail rather than answer `false`. Nothing is sent at all.
		userId === null ? Promise.resolve(false) : askIsOrganizationAdmin(supabase, organization.id)
	]);

	return {
		organization,
		upcoming: conferences.upcoming,
		past: conferences.past,
		isAdmin
	};
}

// -----------------------------------------------------------------------------
// The organisation settings page
// -----------------------------------------------------------------------------
// Everything below belongs to `/manage/organizations/[orgSlug]`, where an owner
// or an admin keeps the organisation's details, its members and its Stripe
// connection in order, and a plain member reads the same page without the
// forms. Every query here runs as the signed-in reader, so the policies in
// `specs/02-architecture/permissions.md` decide what comes back and what may be
// written.

/** One `organizations` row as the settings page reads it. */
type OrganizationSettingsRow = {
	id: string;
	slug: string;
	name: string;
	description: string | null;
	country_code: string | null;
	website_url: string | null;
	logo_path: string | null;
};

/**
 * The columns the settings page asks for: everything the details form edits.
 * The Stripe facts come from `organization_private_settings` in a second read,
 * because the table itself no longer grants a browser `stripe_account_id`
 * (security review 2026-10-10, L3).
 */
const SETTINGS_ORGANIZATION_COLUMNS =
	'id, slug, name, description, country_code, website_url, logo_path';

/**
 * One row of the `organization_private_settings` view, as a member reads it.
 *
 * The view answers only for members of the organisation: a non-member gets no
 * row at all. It carries `stripe_account_id` and `created_by` as well, but only
 * for an owner or an admin, and the settings page wants neither; the pages
 * that act on the account id read it on their own through `readStripeAccountId`.
 */
type OrganizationPrivateSettingsRow = {
	/** Whether a Stripe Connect account has been opened, whoever may see its id. */
	has_stripe_account: boolean;
	/** When Stripe said charges are enabled, or `null` while it has not. */
	stripe_onboarding_completed_at: string | null;
};

/** Turn the two rows into the shape the settings page uses. */
function toOrganizationSettings(
	row: OrganizationSettingsRow,
	privateRow: OrganizationPrivateSettingsRow | null
): OrganizationSettings {
	return {
		id: row.id,
		slug: row.slug,
		name: row.name,
		description: row.description,
		countryCode: row.country_code,
		// A missing country has no name to look up, and `countryName` would answer
		// with the code it was given rather than with nothing. The same rule as in
		// `toPublicOrganization` above.
		countryName: row.country_code ? countryName(row.country_code) : null,
		// A row typed by hand in the Supabase dashboard never went through a form,
		// and this address goes straight into an `href` on the page.
		websiteUrl: safeWebAddress(row.website_url),
		logoPath: row.logo_path,
		// Between them the two facts say which of the three things the payments
		// card shows: no account at all, an account whose onboarding is unfinished,
		// or one that can take money. `stripeConnectionState` in `$lib/organizations`
		// is the one place that rule is written, so the card and this agree. No
		// private row means the reader is not a member, and a non-member never
		// gets past `requireOrganizationMember` anyway.
		stripeState: stripeConnectionState(
			privateRow?.has_stripe_account ?? false,
			privateRow?.stripe_onboarding_completed_at ?? null
		)
	};
}

/**
 * The Stripe facts of one organisation as its members may see them, or `null`
 * for somebody who is not a member.
 *
 * `organization_private_settings` is a view the database filters to the
 * caller's own organisations, so asking it is also how a non-member comes back
 * with nothing rather than with somebody else's payment state.
 */
async function readPrivateSettings(
	supabase: SupabaseClient,
	organizationId: string
): Promise<OrganizationPrivateSettingsRow | null> {
	const { data, error } = await supabase
		.from('organization_private_settings')
		.select('has_stripe_account, stripe_onboarding_completed_at')
		.eq('organization_id', organizationId)
		.maybeSingle()
		.overrideTypes<OrganizationPrivateSettingsRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not read the organisation's payment settings: ${error.message}`);
	}

	return data ?? null;
}

/**
 * The organisation one settings page is about, found by its slug. `null` when
 * there is no organisation with that slug.
 *
 * Reading it says nothing about what the reader may do with it: every visitor
 * may select every organisation (`specs/02-architecture/permissions.md`), so
 * `requireOrganizationMember` in `./access.ts` checks the membership separately.
 */
export async function getOrganizationSettings(
	supabase: SupabaseClient,
	slug: string
): Promise<OrganizationSettings | null> {
	const { data, error } = await supabase
		.from('organizations')
		.select(SETTINGS_ORGANIZATION_COLUMNS)
		.eq('slug', slug)
		// `maybeSingle` returns one row, or `null` when nothing matches, instead of a list.
		.maybeSingle()
		// Replaces Supabase's guess at the row's shape with ours, as everywhere else
		// in this file. It has to come last.
		.overrideTypes<OrganizationSettingsRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not load organization "${slug}": ${error.message}`);
	}

	if (!data) {
		return null;
	}

	return toOrganizationSettings(data, await readPrivateSettings(supabase, data.id));
}

/**
 * The signed-in reader's role in this organisation, or `null` when they are not
 * a member.
 *
 * `organization_members` may be read by the members of that same organisation
 * and by nobody else, so somebody who does not belong finds no row rather than
 * an error. That `null` is what `requireOrganizationMember` turns into the same
 * 404 a slug nobody has would give.
 */
export async function readMyOrganizationRole(
	supabase: SupabaseClient,
	organizationId: string,
	userId: string
): Promise<OrganizationRole | null> {
	const { data, error } = await supabase
		.from('organization_members')
		.select('role')
		.eq('organization_id', organizationId)
		.eq('user_id', userId)
		.maybeSingle()
		.overrideTypes<{ role: OrganizationRole }, { merge: false }>();

	if (error) {
		throw new Error(`Could not read your role in the organisation: ${error.message}`);
	}

	if (!data) {
		return null;
	}

	return data.role;
}

/** One `organization_members` row: who, and what they are in the organisation. */
type OrganizationMembershipRow = {
	user_id: string;
	role: OrganizationRole;
};

/** One `profiles` row, holding what the members table draws beside each name. */
type MemberProfileRow = {
	id: string;
	full_name: string;
	avatar_path: string | null;
};

/**
 * What a member with no `profiles` row is called in the table.
 *
 * It should never be seen: the `handle_new_user` trigger writes a profile the
 * moment an account is made. See `listOrganizationMembers` for why such a
 * person is shown under a stand-in name rather than left off the list.
 */
const UNKNOWN_MEMBER_NAME = 'Unknown member';

/** The name and picture of each of these people, by user id. */
async function readMemberProfiles(
	supabase: SupabaseClient,
	userIds: string[]
): Promise<Map<string, MemberProfileRow>> {
	const profiles = new Map<string, MemberProfileRow>();

	// Nobody to ask about, and `.in('id', [])` would be a request that cannot
	// match anything.
	if (userIds.length === 0) {
		return profiles;
	}

	const { data, error } = await supabase
		.from('profiles')
		.select('id, full_name, avatar_path')
		.in('id', userIds)
		.overrideTypes<MemberProfileRow[], { merge: false }>();

	// `permissions.md` gives every signed-in reader every `profiles` row, and the
	// only reader of this page is a member of the organisation, so a failure here
	// is a fault rather than a rule turning somebody away.
	if (error) {
		throw new Error(`Could not read the members' names: ${error.message}`);
	}

	for (const row of data ?? []) {
		profiles.set(row.id, row);
	}

	return profiles;
}

/**
 * Everybody in the organisation, with their names and pictures, in the page's
 * order.
 *
 * Two queries rather than one. `specs/05-pages/organiser/organization-settings.md`
 * asks for `profiles(full_name, avatar_path)` attached to each membership, but
 * nothing in the schema joins those two tables: `organization_members.user_id`
 * points at `auth.users`, and PostgREST can only bring along a table that a
 * foreign key of the one being read actually names. Asking for it answers the
 * error PGRST200 instead of rows. So the memberships come back first and the
 * names are looked up by id afterwards, which is what `loadTeam` in `./team.ts`
 * does about the same missing foreign key.
 *
 * The order is decided here and not by the database, because ordering by a
 * column of an attached table would only sort inside each row.
 */
export async function listOrganizationMembers(
	supabase: SupabaseClient,
	organizationId: string,
	myUserId: string
): Promise<OrganizationMember[]> {
	const { data, error } = await supabase
		.from('organization_members')
		.select('user_id, role')
		.eq('organization_id', organizationId)
		.overrideTypes<OrganizationMembershipRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not list the members: ${error.message}`);
	}

	const membershipRows: OrganizationMembershipRow[] = data ?? [];
	const userIds = membershipRows.map((row) => row.user_id);
	const profiles = await readMemberProfiles(supabase, userIds);
	const members: OrganizationMember[] = [];

	for (const row of membershipRows) {
		const profile = profiles.get(row.user_id);

		// Somebody whose profile did not come back is still given a row here, under
		// the stand-in name above. This list is the only way an admin changes a
		// role or removes anybody, so leaving a real member off it would hide them
		// from the page while the database still counts them — including, if they
		// are an owner, as one of the owners the "last owner" rule protects. The
		// lists in `./team.ts` leave such people off instead, because there a
		// missing profile means a signed-out visitor who may not read `profiles` at
		// all, and nothing on those pages acts on the row.
		members.push({
			userId: row.user_id,
			fullName: profile ? profile.full_name : UNKNOWN_MEMBER_NAME,
			avatarPath: profile ? profile.avatar_path : null,
			role: row.role,
			// The page needs to know which row is the reader's own, so that it reads
			// "Leave organisation" rather than "Remove".
			isMe: row.user_id === myUserId
		});
	}

	return sortOrganizationMembers(members);
}

/**
 * How many conferences the organisation has. The delete rule reads it.
 *
 * A member of the organisation may read every conference of it, drafts
 * included, because `has_permission(id, 'administrator')` asks only for an
 * `organization_members` row. So this count is the same one the organisation's
 * delete policy makes, and the page can refuse before the database has to.
 */
export async function countOrganizationConferences(
	supabase: SupabaseClient,
	organizationId: string
): Promise<number> {
	const { count, error } = await supabase
		.from('conferences')
		// `head: true` asks for the count and not the rows, so the page never
		// fetches whole conferences to show one number. A column still has to be
		// named, and `id` is the cheapest one; none of it comes back.
		.select('id', { count: 'exact', head: true })
		.eq('organization_id', organizationId);

	if (error) {
		throw new Error(`Could not count the conferences: ${error.message}`);
	}

	// Supabase answers with `null` rather than a number when it has no count to
	// report, and no count means nothing to count.
	return count ?? 0;
}

/** An empty optional field is saved as "no value" (`null`) rather than as empty text. */
function emptyToNull(text: string): string | null {
	return text === '' ? null : text;
}

/**
 * Save the four fields of the details form.
 *
 * It takes the form's own values, which are all plain text, and turns an
 * optional box left empty into `null`, exactly as `updateConference` does with
 * its own optional fields. That conversion is not cosmetic: `country_code` is a
 * `char(2)`, so Postgres pads '' out to two spaces, and a stored '  ' is not
 * `null`, so the public organisation page would draw a flag and a country name
 * for a country nobody ever chose.
 *
 * The logo is not one of them: a file goes through `uploadOrganizationLogo`
 * below, which writes `logo_path` itself. The form has been checked before it
 * gets here, and the `organizations` update policy allows only an owner or an
 * admin, which `requireOrganizationAdmin` in `./access.ts` has already asked.
 */
export async function updateOrganization(
	supabase: SupabaseClient,
	organizationId: string,
	details: OrganizationDetailsValues
): Promise<void> {
	const { error } = await supabase
		.from('organizations')
		.update({
			name: details.name,
			description: emptyToNull(details.description),
			country_code: emptyToNull(details.countryCode),
			website_url: emptyToNull(details.websiteUrl)
		})
		.eq('id', organizationId);

	if (error) {
		throw new Error(`Could not save the organisation details: ${error.message}`);
	}
}

/**
 * The Storage bucket the logos live in. It is the same public bucket the avatars
 * and the conference pictures are in; see `specs/02-architecture/storage.md`.
 */
const PUBLIC_MEDIA_BUCKET = 'public-media';

/**
 * The file ending that goes with each picture type the logo field accepts.
 *
 * The type is what the browser sends about the file, and it is what the ending
 * is worked out from, rather than the name the file happened to have on
 * somebody's computer. The form has already refused every type that is not one
 * of these three, the same way the avatar form does.
 */
const ORGANIZATION_LOGO_EXTENSIONS: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp'
};

/**
 * Where a new logo goes: `organizations/<organization id>/logo-<uuid>.<ext>`,
 * the path `02-architecture/storage.md` lays down.
 *
 * The server builds it and the browser never does, because the storage policies
 * decide who may write a file by reading the folders of its path:
 * `may_write_public_media` allows `organizations/<id>` only to somebody who
 * administers that organisation. The uuid in the name means a new logo is
 * always a new address, so a browser that cached the old one cannot show it in
 * the new one's place.
 */
function buildOrganizationLogoPath(organizationId: string, file: File): string {
	const extension = ORGANIZATION_LOGO_EXTENSIONS[file.type];

	if (!extension) {
		throw new Error(`Not a picture the logo field accepts: ${file.type}`);
	}

	return `organizations/${organizationId}/logo-${crypto.randomUUID()}.${extension}`;
}

/** Where this organisation's logo sits at the moment, or `null` when it has none. */
async function readOrganizationLogoPath(
	supabase: SupabaseClient,
	organizationId: string
): Promise<string | null> {
	const { data, error } = await supabase
		.from('organizations')
		.select('logo_path')
		.eq('id', organizationId)
		.single();

	if (error || !data) {
		throw new Error(`Could not read the organisation: ${error?.message ?? 'no row'}`);
	}

	// The client is not told the shape of the database, so what a query answers
	// with is loosely typed. Naming the column here is what says that this
	// function gives back a path or nothing.
	const currentPath: string | null = data.logo_path;

	return currentPath;
}

/**
 * Take the old logo out of the bucket, if there is one to take out.
 *
 * Whatever goes wrong here is deliberately swallowed, the way it is for an
 * avatar and for a conference picture. By the time this is called the
 * organisation already points at the new logo, so an object nobody points at is
 * a smaller problem than an error page telling an admin their change did not
 * happen when it did.
 */
async function deleteOrganizationLogoObject(
	supabase: SupabaseClient,
	path: string | null
): Promise<void> {
	if (path === null) {
		return;
	}

	await supabase.storage.from(PUBLIC_MEDIA_BUCKET).remove([path]);
}

/**
 * Put a new logo in the `public-media` bucket, point the organisation at it and
 * delete the one it replaces.
 *
 * The order is the one `02-architecture/storage.md` gives, and the same one
 * `uploadAvatar` in `./profiles.ts` follows: the new file is uploaded, then the
 * new path is saved, and the old object is deleted once the row has been
 * written. So a step that fails halfway leaves the organisation with the logo it
 * already had rather than pointing at nothing.
 *
 * The upload goes through the signed-in admin's own client, so the storage
 * policies are a second guard on a path this file has already built out of the
 * organisation's id.
 */
export async function uploadOrganizationLogo(
	supabase: SupabaseClient,
	organizationId: string,
	file: File
): Promise<void> {
	const previousPath = await readOrganizationLogoPath(supabase, organizationId);
	const newPath = buildOrganizationLogoPath(organizationId, file);

	const { error: uploadError } = await supabase.storage
		.from(PUBLIC_MEDIA_BUCKET)
		.upload(newPath, file);

	if (uploadError) {
		throw new Error(`Could not upload the logo: ${uploadError.message}`);
	}

	const { error: organizationError } = await supabase
		.from('organizations')
		.update({ logo_path: newPath })
		.eq('id', organizationId);

	if (organizationError) {
		throw new Error(`Could not save the logo: ${organizationError.message}`);
	}

	await deleteOrganizationLogoObject(supabase, previousPath);
}

/**
 * The wording the `prevent_last_owner_removal` trigger raises with.
 *
 * Postgres sends it back inside the error message of the write it refused, so
 * the two functions below look for it rather than compare the whole message.
 */
const LAST_OWNER_DATABASE_ERROR = 'An organisation must always have at least one owner';

/** What the page says instead, which is the sentence `organization-settings.md` asks for. */
const LAST_OWNER_MESSAGE =
	'An organisation needs at least one owner. Make someone else an owner first.';

/** What the page says when the membership a change was aimed at was not there to change. */
const NO_SUCH_MEMBER_MESSAGE = 'That person is no longer a member of this organisation.';

/**
 * Turn a refused write into the sentence the page shows, or let it through as a
 * fault.
 *
 * Only the last-owner rule is something the person reading can do anything
 * about, and it is the one the spec words for them. Anything else — a lost
 * connection, a renamed column — is a bug rather than a decision, so it throws
 * the way the rest of this folder does.
 */
function toMemberWriteMessage(message: string, whatFailed: string): string {
	if (message.includes(LAST_OWNER_DATABASE_ERROR)) {
		return LAST_OWNER_MESSAGE;
	}

	throw new Error(`${whatFailed}: ${message}`);
}

/**
 * Change somebody's role. Answers `null` when it worked and a sentence to show
 * when the database refused, so the page need not read a Postgres message.
 *
 * There are two ways it can be refused and they arrive differently. The
 * `prevent_last_owner_removal` trigger raises, which comes back as an error. Row
 * Level Security instead hides the row from anybody who may not change it, so
 * nothing matches, nothing changes and no message comes back at all; asking for
 * the row that was changed with `.select('user_id')` is what tells that apart
 * from an update that worked, the same trick `deleteCommittee` in
 * `./manage-committees.ts` explains.
 */
export async function updateMemberRole(
	supabase: SupabaseClient,
	organizationId: string,
	userId: string,
	role: OrganizationRole
): Promise<string | null> {
	const { data, error } = await supabase
		.from('organization_members')
		.update({ role })
		.eq('organization_id', organizationId)
		.eq('user_id', userId)
		.select('user_id')
		.overrideTypes<{ user_id: string }[], { merge: false }>();

	if (error) {
		return toMemberWriteMessage(error.message, 'Could not change the role');
	}

	const changed: { user_id: string }[] = data ?? [];

	if (changed.length === 0) {
		return NO_SUCH_MEMBER_MESSAGE;
	}

	return null;
}

/**
 * Take somebody out of the organisation. Same answer shape as
 * `updateMemberRole`: `null` when it worked, a sentence when it was refused.
 *
 * It is also what "Leave organisation" does, because the `organization_members`
 * delete policy allows an admin of the organisation and the person themselves,
 * and the last-owner trigger guards both the same way.
 */
export async function removeMember(
	supabase: SupabaseClient,
	organizationId: string,
	userId: string
): Promise<string | null> {
	const { data, error } = await supabase
		.from('organization_members')
		.delete()
		.eq('organization_id', organizationId)
		.eq('user_id', userId)
		.select('user_id')
		.overrideTypes<{ user_id: string }[], { merge: false }>();

	if (error) {
		return toMemberWriteMessage(error.message, 'Could not remove them from the organisation');
	}

	const deleted: { user_id: string }[] = data ?? [];

	if (deleted.length === 0) {
		return NO_SUCH_MEMBER_MESSAGE;
	}

	return null;
}

/**
 * Delete the organisation. `false` when Row Level Security refused, which it
 * does while it has conferences.
 *
 * A refused delete is not an error: the policy hides the row, so nothing
 * matches, nothing is deleted and no message comes back. Asking for the id of
 * what was deleted with `.select('id')` is what tells the two apart. The page
 * checks `countOrganizationConferences` first so that it can say why, because
 * the database can only refuse.
 */
export async function deleteOrganization(
	supabase: SupabaseClient,
	organizationId: string
): Promise<boolean> {
	const { data, error } = await supabase
		.from('organizations')
		.delete()
		.eq('id', organizationId)
		.select('id')
		.overrideTypes<{ id: string }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not delete the organisation: ${error.message}`);
	}

	const deleted: { id: string }[] = data ?? [];

	return deleted.length > 0;
}

/**
 * The organisation's Stripe Connect account id, or `null` when it has none yet
 * or the reader may not know it.
 *
 * It is read on its own rather than carried on `OrganizationSettings`, because
 * that shape goes to the browser as `load` data and the account id has no
 * business there: the page only ever needs to know *whether* an account exists,
 * which `stripeState` already says. The id is wanted by the `connectStripe`
 * action and by the two routes under `/api/stripe/connect`, all of which run on
 * the server.
 *
 * It comes from the `organization_private_settings` view, which hands the id
 * only to an owner or an admin of the organisation (security review 2026-10-10,
 * L3); the table itself no longer grants the column to a browser role. So
 * `null` means nobody has started onboarding, or the reader is not an admin,
 * because a read that failed throws instead. Every caller has already asked
 * for an admin, and reads `null` as "there is nothing to ask Stripe about".
 */
export async function readStripeAccountId(
	supabase: SupabaseClient,
	organizationId: string
): Promise<string | null> {
	const { data, error } = await supabase
		.from('organization_private_settings')
		.select('stripe_account_id')
		.eq('organization_id', organizationId)
		.maybeSingle()
		.overrideTypes<{ stripe_account_id: string | null }, { merge: false }>();

	if (error) {
		throw new Error(`Could not read the Stripe account: ${error.message}`);
	}

	if (!data) {
		return null;
	}

	return data.stripe_account_id;
}

/**
 * Remember the Stripe account id through the `set_stripe_account` SQL function,
 * the only way that column is written.
 *
 * `protect_stripe_columns` refuses both `stripe_*` columns to a browser, so an
 * ordinary update would be turned away however it is written. The function is
 * `security definer` and asks `is_organization_admin` itself, which is the same
 * question `requireOrganizationAdmin` has already asked in the action. It also
 * writes once only: an organisation that already has an account keeps it, so
 * nobody can point an organisation at an account Stripe did not open for it
 * (security review 2026-10-10, C5). That is why a refusal here throws: the
 * page has a `fail(502)` for Stripe being unreachable, but this call failing
 * means something is wrong with us rather than with Stripe.
 */
export async function setStripeAccount(
	supabase: SupabaseClient,
	organizationId: string,
	stripeAccountId: string
): Promise<void> {
	const { error } = await supabase.rpc('set_stripe_account', {
		organization_id: organizationId,
		stripe_account_id: stripeAccountId
	});

	if (error) {
		throw new Error(`Could not save the Stripe account: ${error.message}`);
	}
}

/**
 * Is that address already a member? Asks the `organization_has_email` SQL
 * function.
 *
 * The question can only be asked that way, because turning an address into an
 * account means reading `auth.users`, which no policy grants to anybody. The
 * function answers yes or no, never hands an address back, and raises for a
 * caller who is not an admin of the organisation.
 *
 * That raise is why a failed call answers `true`. The answer decides whether an
 * invitation may be sent, and refusing to send one we were not able to check is
 * the safe direction to be wrong in. `isEmailOnTeam` in `./invites.ts` asks the
 * same question one level down and answers a failure the same way.
 */
export async function isEmailInOrganization(
	supabase: SupabaseClient,
	organizationId: string,
	email: string
): Promise<boolean> {
	const { data, error } = await supabase.rpc('organization_has_email', {
		org_id: organizationId,
		email
	});

	if (error) {
		return true;
	}

	return data === true;
}
