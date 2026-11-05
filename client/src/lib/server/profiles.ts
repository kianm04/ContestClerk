/**
 * Reading and writing the `profiles` table.
 *
 * Files under `$lib/server` only ever run on the server. Every function takes
 * the Supabase client as its first argument, and pages pass in
 * `locals.supabase`, the client that knows who is signed in, so Row Level
 * Security decides what each person may see and change.
 *
 * The top bar's needs, the welcome page's and the profile pages' are all here:
 * reading somebody's own two rows, saving either half of the edit form, putting
 * their picture in the `public-media` bucket or taking it away, and the history
 * of the conferences they have taken part in.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
	isExperienceLevel,
	sortConferenceHistory,
	type ConferenceHistoryEntry,
	type DetailsFormValues,
	type ExperienceLevel,
	type MyProfileAndDetails,
	type ProfileFormValues,
	type PublicProfile,
	type WelcomeFormValues
} from '$lib/profiles';
import { committeeHeading } from '$lib/committees';

/** The little the app shell knows about whoever is signed in. */
export type ShellProfile = {
	/** Their whole name. The top bar shows the first word of it. */
	fullName: string;
	/** Where their picture sits in the `public-media` bucket, or nothing for initials. */
	avatarPath: string | null;
};

/**
 * The name and picture for the profile menu, or `null` when there is no profile
 * row yet.
 *
 * There always should be one: the `handle_new_user` trigger writes it the
 * moment an account is created. The `null` is for the accounts made before that
 * trigger existed, which would otherwise leave every page in the app broken for
 * them rather than just their avatar.
 */
export async function getShellProfile(
	supabase: SupabaseClient,
	userId: string
): Promise<ShellProfile | null> {
	const { data, error } = await supabase
		.from('profiles')
		.select('full_name, avatar_path')
		.eq('id', userId)
		// `maybeSingle` gives back one row or `null`, where `single` treats "no
		// row" as an error.
		.maybeSingle()
		.overrideTypes<{ full_name: string; avatar_path: string | null }, { merge: false }>();

	if (error) {
		throw new Error(`Could not read the profile: ${error.message}`);
	}

	if (!data) {
		return null;
	}

	return { fullName: data.full_name, avatarPath: data.avatar_path };
}

/**
 * Turn a column that may be null into the text a form field wants.
 *
 * Most of these columns are nullable, because "not filled in" is a real answer,
 * but an `<input value={null}>` would show the word "null". Empty text is what
 * a blank field sends back, so that is what a blank column becomes.
 */
function textOrEmpty(value: string | null): string {
	return value ?? '';
}

/**
 * The signed-in person's own `profiles` and `profile_details` rows.
 *
 * Both are read with the user's own client, so the "self" policies decide what
 * comes back; there is nothing here that the person is not allowed to see.
 * Throws when either row is missing, because both are written by the
 * `handle_new_user` trigger when the account is created and a page that needs
 * them cannot carry on without them.
 *
 * `onboarding_completed_at` comes from `my_profile_state`, the one-row view of
 * the person's own two private columns, because that column of `profiles` is
 * granted to nobody so that no other user can read it (migration
 * 20261022132000). The view answers only for the signed-in person.
 */
export async function getMyProfile(
	supabase: SupabaseClient,
	userId: string
): Promise<MyProfileAndDetails> {
	// None of the queries needs another's answer, so all three start at once.
	const [profileResult, detailsResult, stateResult] = await Promise.all([
		supabase
			.from('profiles')
			.select(
				'full_name, avatar_path, institution_name, country_code, experience_level, pronouns, bio'
			)
			.eq('id', userId)
			.single(),
		supabase
			.from('profile_details')
			.select(
				'email, date_of_birth, phone, dietary_requirements, emergency_contact_name, emergency_contact_phone'
			)
			.eq('user_id', userId)
			.single(),
		supabase.from('my_profile_state').select('onboarding_completed_at').eq('id', userId).single()
	]);

	if (profileResult.error || !profileResult.data) {
		throw new Error(`Could not read the profile: ${profileResult.error?.message ?? 'no row'}`);
	}

	if (detailsResult.error || !detailsResult.data) {
		throw new Error(
			`Could not read the profile details: ${detailsResult.error?.message ?? 'no row'}`
		);
	}

	if (stateResult.error || !stateResult.data) {
		throw new Error(`Could not read the profile state: ${stateResult.error?.message ?? 'no row'}`);
	}

	const profileRow = profileResult.data;
	const detailsRow = detailsResult.data;

	return {
		profile: {
			fullName: profileRow.full_name,
			avatarPath: profileRow.avatar_path,
			institutionName: textOrEmpty(profileRow.institution_name),
			countryCode: textOrEmpty(profileRow.country_code),
			experienceLevel: profileRow.experience_level,
			pronouns: textOrEmpty(profileRow.pronouns),
			bio: textOrEmpty(profileRow.bio),
			onboardingCompletedAt: stateResult.data.onboarding_completed_at
		},
		details: {
			email: detailsRow.email,
			dateOfBirth: textOrEmpty(detailsRow.date_of_birth),
			phone: textOrEmpty(detailsRow.phone),
			dietaryRequirements: textOrEmpty(detailsRow.dietary_requirements),
			emergencyContactName: textOrEmpty(detailsRow.emergency_contact_name),
			emergencyContactPhone: textOrEmpty(detailsRow.emergency_contact_phone)
		}
	};
}

/** The error code Postgres sends when an id is not a uuid at all. */
const INVALID_ID_CODE = '22P02';

/**
 * Anybody's public profile, or `null` when there is no such person.
 *
 * The `profiles` select policy lets every signed-in reader see these columns;
 * the private half, `profile_details`, is not read here at all.
 */
export async function getPublicProfile(
	supabase: SupabaseClient,
	userId: string
): Promise<PublicProfile | null> {
	const { data, error } = await supabase
		.from('profiles')
		.select(
			'full_name, avatar_path, institution_name, country_code, experience_level, pronouns, bio'
		)
		.eq('id', userId)
		.maybeSingle();

	// An address somebody edited by hand names nobody, so it is a 404 like any other.
	if (error?.code === INVALID_ID_CODE) {
		return null;
	}

	if (error) {
		throw new Error(`Could not read the profile: ${error.message}`);
	}

	if (data === null) {
		return null;
	}

	return {
		fullName: data.full_name,
		avatarPath: data.avatar_path,
		institutionName: textOrEmpty(data.institution_name),
		countryCode: textOrEmpty(data.country_code),
		experienceLevel: data.experience_level,
		pronouns: textOrEmpty(data.pronouns),
		bio: textOrEmpty(data.bio)
	};
}

/** The experience level as the enum column's type, or a fault if it is not one. */
function asExperienceLevel(value: string): ExperienceLevel {
	if (!isExperienceLevel(value)) {
		throw new Error(`Not an experience level: ${value}`);
	}

	return value;
}

/**
 * Turn what a form field sent into what the column should hold.
 *
 * An optional column stores `null` for "not filled in", never an empty string,
 * so that "is it filled in?" is one question in SQL rather than two.
 */
function trimmedOrNull(value: string): string | null {
	const trimmed = value.trim();

	return trimmed === '' ? null : trimmed;
}

/**
 * Save the welcome form and mark onboarding finished.
 *
 * The two rows are written one after the other rather than together, because
 * they are two tables. `profile_details` goes first and `profiles` second, so
 * that `onboarding_completed_at`, which is what every page's gate reads, is the
 * very last thing written: if the first write fails, the person is sent back to
 * a form they have already filled in rather than let into the app with half
 * their details missing.
 *
 * The form has been checked by `validateWelcomeForm` before it gets here. Row
 * Level Security lets somebody update only their own two rows, so `userId` says
 * which rows are meant, not who is allowed.
 */
export async function updateMyProfile(
	supabase: SupabaseClient,
	userId: string,
	values: WelcomeFormValues
): Promise<void> {
	const { error: detailsError } = await supabase
		.from('profile_details')
		.update({
			date_of_birth: trimmedOrNull(values.dateOfBirth),
			phone: trimmedOrNull(values.phone),
			dietary_requirements: trimmedOrNull(values.dietaryRequirements),
			emergency_contact_name: trimmedOrNull(values.emergencyContactName),
			emergency_contact_phone: trimmedOrNull(values.emergencyContactPhone)
		})
		.eq('user_id', userId);

	if (detailsError) {
		throw new Error(`Could not save the profile details: ${detailsError.message}`);
	}

	const { error: profileError } = await supabase
		.from('profiles')
		.update({
			full_name: values.fullName.trim(),
			institution_name: trimmedOrNull(values.institution),
			country_code: values.countryCode,
			// The form's values are all text. `validateWelcomeForm` has already
			// refused anything that is not one of the four, so this asks again only
			// to turn `string` into the enum the column holds; a value that somehow
			// got this far would be a fault worth hearing about rather than a row
			// the database refuses with its own wording.
			experience_level: asExperienceLevel(values.experienceLevel),
			onboarding_completed_at: new Date().toISOString()
		})
		.eq('id', userId);

	if (profileError) {
		throw new Error(`Could not save the profile: ${profileError.message}`);
	}
}

/**
 * Save the six public fields of somebody's own `profiles` row.
 *
 * The form has been checked by `validateProfileForm` before it gets here. Row
 * Level Security lets somebody update only their own row, so `userId` says which
 * row is meant, not who is allowed.
 *
 * It deliberately leaves `onboarding_completed_at` alone. `updateMyProfile`
 * above writes that column because the welcome form is what finishes
 * onboarding; this form belongs to an account that finished onboarding long ago,
 * and writing the column again would move the moment that person joined to
 * today.
 */
export async function updateProfile(
	supabase: SupabaseClient,
	userId: string,
	values: ProfileFormValues
): Promise<void> {
	const { error } = await supabase
		.from('profiles')
		.update({
			full_name: values.fullName.trim(),
			institution_name: trimmedOrNull(values.institutionName),
			// The form asks for a country, but the column is nullable, so a blank one
			// is stored as "not filled in" rather than as the two spaces `char(2)`
			// would pad an empty string out to.
			country_code: trimmedOrNull(values.countryCode),
			// Text from a form turned into the enum the column holds, for the reason
			// written on `asExperienceLevel`.
			experience_level: asExperienceLevel(values.experienceLevel),
			pronouns: trimmedOrNull(values.pronouns),
			bio: trimmedOrNull(values.bio)
		})
		.eq('id', userId);

	if (error) {
		throw new Error(`Could not save the profile: ${error.message}`);
	}
}

/**
 * Save the five private fields of somebody's own `profile_details` row.
 *
 * The email address is not one of them: it belongs to the account rather than to
 * this form, and `/settings` is where it is changed. The form has been checked
 * by `validateDetailsForm` before it gets here.
 */
export async function updateProfileDetails(
	supabase: SupabaseClient,
	userId: string,
	values: DetailsFormValues
): Promise<void> {
	const { error } = await supabase
		.from('profile_details')
		.update({
			date_of_birth: trimmedOrNull(values.dateOfBirth),
			phone: trimmedOrNull(values.phone),
			dietary_requirements: trimmedOrNull(values.dietaryRequirements),
			emergency_contact_name: trimmedOrNull(values.emergencyContactName),
			emergency_contact_phone: trimmedOrNull(values.emergencyContactPhone)
		})
		.eq('user_id', userId);

	if (error) {
		throw new Error(`Could not save the profile details: ${error.message}`);
	}
}

/** The Storage bucket the pictures live in. See `specs/02-architecture/storage.md`. */
const PUBLIC_MEDIA_BUCKET = 'public-media';

/**
 * The file ending that goes with each picture type the avatar form accepts.
 *
 * The type is what the browser sends about the file, and it is what the ending
 * is worked out from, rather than the name the file happened to have on
 * somebody's computer. `validateAvatarFile` in `$lib/profiles.ts` has already
 * refused every type that is not one of these three.
 */
const AVATAR_FILE_EXTENSIONS: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp'
};

/**
 * Where a new picture goes: `avatars/<user_id>/<uuid>.<ext>`, the path
 * `02-architecture/storage.md` lays down.
 *
 * The server builds it and the browser never does, because the storage policies
 * decide who may write a file by reading the folders of its path. The uuid in
 * the name means a new picture is always a new address, so a browser that
 * cached the old one cannot show it in the new one's place.
 */
function buildAvatarPath(userId: string, file: File): string {
	const extension = AVATAR_FILE_EXTENSIONS[file.type];

	if (!extension) {
		throw new Error(`Not a picture the avatar form accepts: ${file.type}`);
	}

	return `avatars/${userId}/${crypto.randomUUID()}.${extension}`;
}

/** Where this person's picture sits at the moment, or `null` when they have none. */
async function readAvatarPath(supabase: SupabaseClient, userId: string): Promise<string | null> {
	const { data, error } = await supabase
		.from('profiles')
		.select('avatar_path')
		.eq('id', userId)
		.single();

	if (error || !data) {
		throw new Error(`Could not read the profile: ${error?.message ?? 'no row'}`);
	}

	// The client is not told the shape of the database, so what a query answers
	// with is loosely typed. Naming the column here is what says that this
	// function gives back a path or nothing.
	const currentPath: string | null = data.avatar_path;

	return currentPath;
}

/**
 * Take an object out of the bucket, if there is one to take out.
 *
 * Whatever goes wrong here is deliberately swallowed. By the time this is
 * called the profile already points at the new picture, or at no picture at
 * all, so an object nobody points at is a smaller problem than an error page
 * telling somebody their change did not happen when it did.
 */
async function deleteAvatarObject(supabase: SupabaseClient, path: string | null): Promise<void> {
	if (path === null) {
		return;
	}

	await supabase.storage.from(PUBLIC_MEDIA_BUCKET).remove([path]);
}

/**
 * Put a new picture in the `public-media` bucket, point the profile at it and
 * delete the one it replaces.
 *
 * The order is the one `02-architecture/storage.md` gives: the new file is
 * uploaded, then the new path is saved, and "the old object is deleted by the
 * server after the new row is saved". So a step that fails halfway leaves the
 * person with the picture they already had rather than with a profile pointing
 * at nothing.
 *
 * The upload goes through the signed-in person's own client, so the storage
 * policies are a second guard on a path this file has already built out of
 * their own user id. The file has been checked by `validateAvatarFile` in
 * `$lib/profiles.ts` before it gets here, the same way `validateProfileForm`
 * has run before `updateProfile`.
 */
export async function uploadAvatar(
	supabase: SupabaseClient,
	userId: string,
	file: File
): Promise<void> {
	const previousPath = await readAvatarPath(supabase, userId);
	const newPath = buildAvatarPath(userId, file);

	const { error: uploadError } = await supabase.storage
		.from(PUBLIC_MEDIA_BUCKET)
		.upload(newPath, file);

	if (uploadError) {
		throw new Error(`Could not upload the picture: ${uploadError.message}`);
	}

	const { error: profileError } = await supabase
		.from('profiles')
		.update({ avatar_path: newPath })
		.eq('id', userId);

	if (profileError) {
		throw new Error(`Could not save the picture: ${profileError.message}`);
	}

	await deleteAvatarObject(supabase, previousPath);
}

/**
 * Take the picture away: clear `profiles.avatar_path` and delete the object
 * behind it.
 *
 * The same order as `uploadAvatar`, the other way round: the column is cleared
 * first and the object deleted second, so no page is ever left pointing at a
 * file that has gone. Somebody who has no picture has nothing to clear and
 * nothing to delete, so nothing at all is written.
 */
export async function removeAvatar(supabase: SupabaseClient, userId: string): Promise<void> {
	const currentPath = await readAvatarPath(supabase, userId);

	if (currentPath === null) {
		return;
	}

	const { error } = await supabase.from('profiles').update({ avatar_path: null }).eq('id', userId);

	if (error) {
		throw new Error(`Could not remove the picture: ${error.message}`);
	}

	await deleteAvatarObject(supabase, currentPath);
}

/** What somebody holding a seat is called on their history row. */
const DELEGATE_ROLE = 'Delegate';

/**
 * The conference a committee belongs to, as both history lookups bring it along.
 *
 * `null` means Row Level Security withheld the row. A committee's conference can
 * be withheld even though the committee itself came back: a draft is readable
 * only by the people running it.
 */
type HistoryConference = {
	id: string;
	slug: string;
	name: string;
	logo_path: string | null;
	start_date: string;
	end_date: string;
};

/** The committee a seat or a chair row belongs to, brought along the same way. */
type HistoryCommittee = {
	id: string;
	slug: string;
	name: string;
	abbreviation: string | null;
	conferences: HistoryConference | null;
};

/** One row of the seat lookup: the seat's own id and name, with its committee. */
type HistorySeatRow = {
	id: string;
	name: string;
	/**
	 * An ISO two-letter country code, or `null` for a seat that is not a country, such as "Press".
	 */
	country_code: string | null;
	committees: HistoryCommittee | null;
};

/**
 * One row of the chair lookup: the chair's title, with the committee attached.
 *
 * `title` is never missing. `committee_chairs.title` is `not null default 'Chair'`,
 * so a row that says nothing about it already says "Chair", which is why the page
 * shows the column itself rather than a word of its own: a vice chair then reads
 * as one. The home dashboard reads it the same way.
 */
type HistoryChairRow = {
	title: string;
	committees: HistoryCommittee | null;
};

/**
 * The committee, and the conference it belongs to, that both lookups below ask
 * for: enough to name each of them, to link to them and to sort by date.
 *
 * `committees(...)` and `conferences(...)` follow a foreign key into another
 * table and bring the row it points at along. Each of them points at exactly one
 * row, so Supabase answers with one object rather than with a list, which is why
 * the row types above nest an object and not an array.
 */
const HISTORY_COMMITTEE_COLUMNS =
	'committees(id, slug, name, abbreviation, conferences(id, slug, name, logo_path, start_date, end_date))';

/** The seats this person holds, each with its committee and that committee's conference. */
async function readHistorySeatRows(
	supabase: SupabaseClient,
	userId: string
): Promise<HistorySeatRow[]> {
	const { data, error } = await supabase
		.from('seats')
		.select(`id, name, country_code, ${HISTORY_COMMITTEE_COLUMNS}`)
		.eq('user_id', userId)
		// Supabase guesses the shape of a row from the text in `select`, and its
		// guess types every column as possibly missing. This replaces the guess with
		// the row type above, the way `$lib/server/home.ts` does. It has to come
		// last.
		.overrideTypes<HistorySeatRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not list the committees you sat in: ${error.message}`);
	}

	return data ?? [];
}

/** The committees this person chairs, each with that committee's conference. */
async function readHistoryChairRows(
	supabase: SupabaseClient,
	userId: string
): Promise<HistoryChairRow[]> {
	const { data, error } = await supabase
		.from('committee_chairs')
		.select(`title, ${HISTORY_COMMITTEE_COLUMNS}`)
		.eq('user_id', userId)
		.overrideTypes<HistoryChairRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not list the committees you chaired: ${error.message}`);
	}

	return data ?? [];
}

/**
 * One row of the history, or `null` when there is nothing to show.
 *
 * Row Level Security can withhold either the committee or its conference — a
 * committee of a draft conference the reader is not staff of comes back as
 * `null`, and so can the conference on its own. A row with no conference has no
 * name to put beside the committee and nothing to link to, so it is left out
 * rather than shown half empty.
 */
function toHistoryEntry(
	id: string,
	committee: HistoryCommittee | null,
	role: string,
	seatName: string | null,
	seatCountryCode: string | null
): ConferenceHistoryEntry | null {
	if (committee === null || committee.conferences === null) {
		return null;
	}

	const conference = committee.conferences;

	return {
		id,
		conferenceName: conference.name,
		conferenceSlug: conference.slug,
		conferenceLogoPath: conference.logo_path,
		conferenceStartDate: conference.start_date,
		conferenceEndDate: conference.end_date,
		// The same rule the committee's own page and the dashboard use, so the three
		// can never word one committee differently.
		committeeHeading: committeeHeading(committee),
		committeeSlug: committee.slug,
		seatName,
		seatCountryCode,
		role
	};
}

/** Every seat this person holds, as one history row each. */
function toSeatEntries(rows: HistorySeatRow[]): ConferenceHistoryEntry[] {
	const entries: ConferenceHistoryEntry[] = [];

	for (const row of rows) {
		const entry = toHistoryEntry(row.id, row.committees, DELEGATE_ROLE, row.name, row.country_code);

		if (entry !== null) {
			entries.push(entry);
		}
	}

	return entries;
}

/** Every committee this person chairs, as one history row each. */
function toChairEntries(rows: HistoryChairRow[]): ConferenceHistoryEntry[] {
	const entries: ConferenceHistoryEntry[] = [];

	for (const row of rows) {
		// The committee is looked at here as well as inside `toHistoryEntry`,
		// because the id below is built out of the committee's own id.
		if (row.committees === null) {
			continue;
		}

		// A chair row is keyed by a pair of columns, the person and the committee,
		// so it has no single id for the page to key its list by. This makes one,
		// and it cannot collide with a seat's id, which is a plain uuid.
		const chairEntryId = `chair-${row.committees.id}`;

		// A chair holds no seat, so there is no seat name or country code to put on their row.
		const entry = toHistoryEntry(chairEntryId, row.committees, row.title, null, null);

		if (entry !== null) {
			entries.push(entry);
		}
	}

	return entries;
}

/**
 * The conferences this person has taken part in, soonest first: every seat they
 * hold and every committee they chair.
 *
 * Somebody who both chairs a committee and holds a seat in it gets two rows
 * here, one for each. The home dashboard deliberately does the opposite and
 * shows such a committee once, because it lists the places somebody works;
 * this is a history of what they have done, and chairing and sitting are two
 * different things to have done.
 */
export async function listMyConferenceHistory(
	supabase: SupabaseClient,
	userId: string
): Promise<ConferenceHistoryEntry[]> {
	// Neither query needs the other's answer, so both start at once.
	const [seatRows, chairRows] = await Promise.all([
		readHistorySeatRows(supabase, userId),
		readHistoryChairRows(supabase, userId)
	]);

	const entries = [...toSeatEntries(seatRows), ...toChairEntries(chairRows)];

	return sortConferenceHistory(entries);
}
