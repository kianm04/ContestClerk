import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DetailsFormValues, ProfileFormValues, WelcomeFormValues } from '$lib/profiles';
import {
	getMyProfile,
	getPublicProfile,
	listMyConferenceHistory,
	removeAvatar,
	updateMyProfile,
	updateProfile,
	updateProfileDetails,
	uploadAvatar
} from './profiles';

// These tests are about the decisions this module makes: which columns each
// form writes, what a blank field becomes, which history rows are worth showing
// and in what order. Nothing here talks to a database; the stand-in client below
// answers each table with whatever the test asked for and writes down what it
// was asked to do. Whether the database lets somebody read or write those rows
// at all is Row Level Security's decision, and that is tested in
// `tests/db/profiles.test.ts`.

/** The signed-in person these tests are about. */
const USER_ID = 'user-1';

/** The rows each table answers with, and which tables fail instead of answering. */
type StandInAnswers = {
	/** Keyed by table name. A table with no entry answers with no rows. */
	rows?: Record<string, unknown[]>;
	/** Keyed by table name, holding the message that table's query fails with. */
	errors?: Record<string, string>;
	/** The message an upload to the bucket fails with. Nothing means it works. */
	uploadError?: string;
	/** The message a delete from the bucket fails with. Nothing means it works. */
	removeError?: string;
};

/** One thing the code under test asked the database to do. */
type RecordedQuery = {
	/** The relation `.from(...)` named. */
	table: string;
	/** The columns an `update` was given, or `null` when the query only read. */
	update: Record<string, unknown> | null;
	eq: [string, unknown][];
};

/** What the code under test asked Supabase Storage to do. */
type RecordedStorage = {
	/** The bucket each `.from(...)` named, so a test can check which one it was. */
	buckets: string[];
	/** The paths that went into the bucket, in the order they were uploaded. */
	uploaded: string[];
	/** The paths that were deleted from it, in the order they were removed. */
	removed: string[];
};

/**
 * A stand-in Supabase client that answers by table name and writes down what it
 * was asked for.
 *
 * The real client is a builder: `.from(...)` gives back an object with
 * `.select(...)` and `.update(...)` on it, each of those gives back one with
 * `.eq(...)` on it, and so on. Each step adds one condition to a query that is
 * only sent once the chain is awaited. This copies that shape; every step hands
 * the same builder back.
 *
 * The three ways a chain here ends are all catered for. `single` and
 * `maybeSingle` answer with one row, `overrideTypes` — which only changes the
 * type of the answer in the real client, not the answer itself — answers with a
 * list, and an `update` chain ends with nothing at all and is simply awaited.
 * `then` is what makes that last one work: `await` on any object calls its
 * `then`, which is exactly how the real builder sends its query at the last
 * moment.
 */
function createStandInSupabase(answers: StandInAnswers = {}): {
	supabase: SupabaseClient;
	queries: RecordedQuery[];
	storage: RecordedStorage;
} {
	const queries: RecordedQuery[] = [];
	const storage: RecordedStorage = { buckets: [], uploaded: [], removed: [] };

	function builderFor(table: string) {
		const query: RecordedQuery = { table, update: null, eq: [] };
		queries.push(query);

		const message = answers.errors?.[table];
		const error = message ? { message } : null;
		const rows = answers.rows?.[table] ?? [];
		const listAnswer = { data: message ? null : rows, error };
		const rowAnswer = { data: message ? null : (rows[0] ?? null), error };

		const builder = {
			// Which columns were asked for is not what these tests are about, so
			// `select` records nothing and only carries the chain on.
			select: () => builder,
			update: (values: Record<string, unknown>) => {
				query.update = values;
				return builder;
			},
			eq: (column: string, value: unknown) => {
				query.eq.push([column, value]);
				return builder;
			},
			single: async () => rowAnswer,
			maybeSingle: async () => rowAnswer,
			overrideTypes: async () => listAnswer,
			then: (resolve: (answer: { data: null; error: { message: string } | null }) => void) =>
				resolve({ data: null, error })
		};

		return builder;
	}

	/**
	 * The storage half of the stand-in, in the shape the real client has:
	 * `supabase.storage.from(bucket)` gives back an object carrying `upload` and
	 * `remove`, and each of those answers with `{ data, error }` rather than
	 * throwing, just as a query does. This one writes down which bucket it was
	 * asked for and which paths went in and out of it.
	 */
	function bucketFor(bucket: string) {
		storage.buckets.push(bucket);

		const uploadError = answers.uploadError ? { message: answers.uploadError } : null;
		const removeError = answers.removeError ? { message: answers.removeError } : null;

		return {
			upload: async (path: string) => {
				storage.uploaded.push(path);
				return { data: null, error: uploadError };
			},
			remove: async (paths: string[]) => {
				storage.removed.push(...paths);
				return { data: null, error: removeError };
			}
		};
	}

	const supabase = { from: builderFor, storage: { from: bucketFor } };

	return { supabase: supabase as unknown as SupabaseClient, queries, storage };
}

/** The public half of the edit form, filled in, which a test copies and changes. */
const PROFILE_FORM: ProfileFormValues = {
	// With spaces around it, because the name is the one field that is trimmed
	// rather than emptied.
	fullName: '  Daniel Perez  ',
	institutionName: 'Delft University',
	countryCode: 'NL',
	experienceLevel: 'intermediate',
	pronouns: 'he/him',
	bio: 'Four conferences so far.'
};

/** The private half of the edit form, filled in. */
const DETAILS_FORM: DetailsFormValues = {
	dateOfBirth: '2005-04-11',
	phone: '+31 6 1234 5678',
	dietaryRequirements: 'Vegetarian',
	emergencyContactName: 'Marta Perez',
	emergencyContactPhone: '+31 6 8765 4321'
};

/** The welcome form, filled in, for the two tests about `updateMyProfile`. */
const WELCOME_FORM: WelcomeFormValues = {
	fullName: 'Daniel Perez',
	institution: 'Delft University',
	countryCode: 'NL',
	experienceLevel: 'beginner',
	dateOfBirth: '2005-04-11',
	phone: '',
	dietaryRequirements: '',
	emergencyContactName: '',
	emergencyContactPhone: ''
};

/** The conference a committee brings along, in the shape the query answers with. */
function conferenceOfCommittee(overrides: Record<string, unknown> = {}) {
	return {
		id: 'conference-thimun',
		slug: 'thimun-2027',
		name: 'THIMUN 2027',
		logo_path: null,
		start_date: '2027-01-24',
		end_date: '2027-01-29',
		...overrides
	};
}

/** One committee, as both lookups bring it back: one object, not a list. */
function committee(overrides: Record<string, unknown> = {}) {
	return {
		id: 'committee-unsc',
		slug: 'unsc',
		name: 'United Nations Security Council',
		abbreviation: 'UNSC',
		conferences: conferenceOfCommittee(),
		...overrides
	};
}

/** One row of the `seats` lookup. */
function seatRow(id: string, name: string, overrides: Record<string, unknown> = {}) {
	return { id, name, country_code: 'FR', committees: committee(), ...overrides };
}

/**
 * One row of the `committee_chairs` lookup.
 *
 * `title` is never missing: the column is `not null default 'Chair'`, so a chair
 * the organisers said nothing more about already arrives as "Chair".
 */
function chairRow(title: string, overrides: Record<string, unknown> = {}) {
	return { title, committees: committee(), ...overrides };
}

describe('updateProfile', () => {
	it('writes the six public columns of the signed-in person, with the name trimmed', async () => {
		const { supabase, queries } = createStandInSupabase();

		await updateProfile(supabase, USER_ID, PROFILE_FORM);

		expect(queries).toHaveLength(1);
		expect(queries[0].table).toBe('profiles');
		expect(queries[0].eq).toEqual([['id', USER_ID]]);
		expect(queries[0].update).toEqual({
			full_name: 'Daniel Perez',
			institution_name: 'Delft University',
			country_code: 'NL',
			experience_level: 'intermediate',
			pronouns: 'he/him',
			bio: 'Four conferences so far.'
		});
	});

	it('leaves onboarding_completed_at alone, so an edit does not move the joining moment', async () => {
		const { supabase, queries } = createStandInSupabase();

		await updateProfile(supabase, USER_ID, PROFILE_FORM);

		// The welcome form writes that column, because it is what finishes
		// onboarding. This form belongs to an account that finished it long ago.
		expect(queries[0].update).not.toHaveProperty('onboarding_completed_at');
	});

	it('stores an empty optional field as null rather than as empty text', async () => {
		const { supabase, queries } = createStandInSupabase();

		await updateProfile(supabase, USER_ID, {
			...PROFILE_FORM,
			institutionName: '',
			pronouns: '   ',
			bio: ''
		});

		// "Not filled in" is one question in SQL rather than two, so a blank field
		// becomes null and whitespace on its own counts as blank.
		expect(queries[0].update).toMatchObject({
			institution_name: null,
			pronouns: null,
			bio: null
		});
	});

	it('raises when the update fails, rather than saying the profile was saved', async () => {
		const { supabase } = createStandInSupabase({ errors: { profiles: 'no connection' } });

		await expect(updateProfile(supabase, USER_ID, PROFILE_FORM)).rejects.toThrow('no connection');
	});

	it('raises on an experience level that is not one of the four', async () => {
		const { supabase } = createStandInSupabase();

		// `validateProfileForm` has already refused anything else, so a value that
		// got this far is a fault worth hearing about.
		await expect(
			updateProfile(supabase, USER_ID, { ...PROFILE_FORM, experienceLevel: 'expert' })
		).rejects.toThrow('Not an experience level');
	});
});

describe('updateProfileDetails', () => {
	it('writes the five private columns of the signed-in person', async () => {
		const { supabase, queries } = createStandInSupabase();

		await updateProfileDetails(supabase, USER_ID, DETAILS_FORM);

		expect(queries).toHaveLength(1);
		expect(queries[0].table).toBe('profile_details');
		expect(queries[0].eq).toEqual([['user_id', USER_ID]]);
		expect(queries[0].update).toEqual({
			date_of_birth: '2005-04-11',
			phone: '+31 6 1234 5678',
			dietary_requirements: 'Vegetarian',
			emergency_contact_name: 'Marta Perez',
			emergency_contact_phone: '+31 6 8765 4321'
		});
	});

	it('stores every empty field as null rather than as empty text', async () => {
		const { supabase, queries } = createStandInSupabase();

		await updateProfileDetails(supabase, USER_ID, {
			dateOfBirth: '',
			phone: '',
			dietaryRequirements: '  ',
			emergencyContactName: '',
			emergencyContactPhone: ''
		});

		expect(queries[0].update).toEqual({
			date_of_birth: null,
			phone: null,
			dietary_requirements: null,
			emergency_contact_name: null,
			emergency_contact_phone: null
		});
	});

	it('raises when the update fails', async () => {
		const { supabase } = createStandInSupabase({ errors: { profile_details: 'no connection' } });

		await expect(updateProfileDetails(supabase, USER_ID, DETAILS_FORM)).rejects.toThrow(
			'no connection'
		);
	});
});

describe('listMyConferenceHistory', () => {
	it('asks both tables only about the signed-in person', async () => {
		const { supabase, queries } = createStandInSupabase();

		await listMyConferenceHistory(supabase, USER_ID);

		expect(queries.map((query) => query.table)).toEqual(['seats', 'committee_chairs']);
		expect(queries[0].eq).toEqual([['user_id', USER_ID]]);
		expect(queries[1].eq).toEqual([['user_id', USER_ID]]);
	});

	it('gives an account that has taken part in nothing an empty list', async () => {
		const { supabase } = createStandInSupabase();

		expect(await listMyConferenceHistory(supabase, USER_ID)).toEqual([]);
	});

	it('turns a seat into a Delegate row keyed by the seat itself', async () => {
		const { supabase } = createStandInSupabase({
			rows: { seats: [seatRow('seat-france', 'France')] }
		});

		expect(await listMyConferenceHistory(supabase, USER_ID)).toEqual([
			{
				id: 'seat-france',
				conferenceName: 'THIMUN 2027',
				conferenceSlug: 'thimun-2027',
				conferenceLogoPath: null,
				conferenceStartDate: '2027-01-24',
				conferenceEndDate: '2027-01-29',
				// The short name when the committee has one, which is what the page
				// shows and what the dashboard and the committee's own page show too.
				committeeHeading: 'UNSC',
				committeeSlug: 'unsc',
				seatName: 'France',
				// The seat's country code travels with it, for the history to draw a flag from.
				seatCountryCode: 'FR',
				role: 'Delegate'
			}
		]);
	});

	it('turns a chair row into a row carrying its own title and no seat', async () => {
		const { supabase } = createStandInSupabase({
			rows: { committee_chairs: [chairRow('Vice Chair')] }
		});

		const history = await listMyConferenceHistory(supabase, USER_ID);

		// The title rather than a fixed "Chair", so that a vice chair reads as one.
		expect(history[0].role).toBe('Vice Chair');
		expect(history[0].seatName).toBeNull();
		// A chair holds no seat, so there is no country to draw a flag from either.
		expect(history[0].seatCountryCode).toBeNull();
		// A chair row is keyed by the person and the committee together, so the
		// list's key is made out of the committee's id.
		expect(history[0].id).toBe('chair-committee-unsc');
	});

	it('leaves out a row whose committee, or whose committee conference, was withheld', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				seats: [
					// Row Level Security can hand back the seat while withholding the
					// committee, or the committee while withholding its conference: a
					// draft conference is readable only by the people running it.
					seatRow('seat-france', 'France', { committees: null }),
					seatRow('seat-brazil', 'Brazil', { committees: committee({ conferences: null }) })
				],
				committee_chairs: [chairRow('Chair', { committees: null })]
			}
		});

		// A row with no conference has nothing to name it by and nothing to link
		// to, so it is left out rather than shown half empty.
		expect(await listMyConferenceHistory(supabase, USER_ID)).toEqual([]);
	});

	it('gives somebody who chairs a committee and sits in it a row for each', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				seats: [seatRow('seat-france', 'France')],
				committee_chairs: [chairRow('Chair')]
			}
		});

		const history = await listMyConferenceHistory(supabase, USER_ID);

		// The home dashboard deliberately shows such a committee once. This is a
		// history of what somebody has done, and chairing and sitting are two
		// different things to have done.
		expect(history).toHaveLength(2);
		expect(history.map((entry) => entry.role)).toEqual(['Delegate', 'Chair']);
	});

	it('puts the conference that starts soonest first', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				seats: [
					seatRow('seat-late', 'France', {
						committees: committee({
							id: 'committee-late',
							conferences: conferenceOfCommittee({ name: 'Later', start_date: '2027-06-01' })
						})
					}),
					seatRow('seat-early', 'Brazil', {
						committees: committee({
							id: 'committee-early',
							conferences: conferenceOfCommittee({ name: 'Sooner', start_date: '2027-01-24' })
						})
					})
				],
				committee_chairs: [
					chairRow('Chair', {
						committees: committee({
							id: 'committee-middle',
							conferences: conferenceOfCommittee({ name: 'In between', start_date: '2027-03-15' })
						})
					})
				]
			}
		});

		const history = await listMyConferenceHistory(supabase, USER_ID);

		// The seats and the chaired committees are one list sorted by date, not two
		// lists one after the other.
		expect(history.map((entry) => entry.conferenceName)).toEqual(['Sooner', 'In between', 'Later']);
	});

	it('raises when the seat lookup fails', async () => {
		const { supabase } = createStandInSupabase({ errors: { seats: 'no connection' } });

		await expect(listMyConferenceHistory(supabase, USER_ID)).rejects.toThrow('no connection');
	});

	it('raises when the chair lookup fails', async () => {
		const { supabase } = createStandInSupabase({ errors: { committee_chairs: 'no connection' } });

		// A history that quietly left out the committees somebody chaired would
		// hide the fault rather than show it.
		await expect(listMyConferenceHistory(supabase, USER_ID)).rejects.toThrow('no connection');
	});
});

describe('getPublicProfile', () => {
	it('gives back only the public half, read by the person’s id', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				profiles: [
					{
						full_name: 'Umarbek Ismoilov',
						avatar_path: null,
						institution_name: 'Tashkent International School',
						country_code: 'UZ',
						experience_level: 'intermediate',
						pronouns: null,
						bio: null
					}
				]
			}
		});

		expect(await getPublicProfile(supabase, USER_ID)).toEqual({
			fullName: 'Umarbek Ismoilov',
			avatarPath: null,
			institutionName: 'Tashkent International School',
			countryCode: 'UZ',
			experienceLevel: 'intermediate',
			pronouns: '',
			bio: ''
		});
		expect(queries).toEqual([{ table: 'profiles', update: null, eq: [['id', USER_ID]] }]);
	});

	it('answers null for nobody, so the page can say 404', async () => {
		const { supabase } = createStandInSupabase();

		expect(await getPublicProfile(supabase, 'user-unknown')).toBeNull();
	});

	it('fails loudly when the read fails', async () => {
		const { supabase } = createStandInSupabase({ errors: { profiles: 'connection reset' } });

		await expect(getPublicProfile(supabase, USER_ID)).rejects.toThrow('connection reset');
	});
});

describe('getMyProfile', () => {
	it('gives back both rows, with a column that holds nothing as empty text', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				profiles: [
					{
						full_name: 'Daniel Perez',
						avatar_path: null,
						institution_name: null,
						country_code: 'NL',
						experience_level: 'beginner',
						pronouns: null,
						bio: null
					}
				],
				// The onboarding moment is read from the person's own row of
				// `my_profile_state`, not from `profiles`, which no longer grants it.
				my_profile_state: [{ onboarding_completed_at: '2026-09-01T10:00:00Z' }],
				profile_details: [
					{
						email: 'daniel@example.org',
						date_of_birth: null,
						phone: '+31 6 1234 5678',
						dietary_requirements: null,
						emergency_contact_name: null,
						emergency_contact_phone: null
					}
				]
			}
		});

		const { profile, details } = await getMyProfile(supabase, USER_ID);

		expect(profile.fullName).toBe('Daniel Perez');
		expect(profile.onboardingCompletedAt).toBe('2026-09-01T10:00:00Z');
		expect(details.email).toBe('daniel@example.org');
		// A form field shows empty text, where `null` would draw the word "null".
		expect(profile.institutionName).toBe('');
		expect(profile.bio).toBe('');
		expect(details.dietaryRequirements).toBe('');
		// The avatar is not a form field but a picture or nothing at all, so it
		// keeps the `null` the column holds.
		expect(profile.avatarPath).toBeNull();
	});

	it('raises when either row is missing, because every profile page needs both', async () => {
		const { supabase } = createStandInSupabase();

		await expect(getMyProfile(supabase, USER_ID)).rejects.toThrow('no row');
	});
});

describe('updateMyProfile', () => {
	it('writes the details first and the profile, with the onboarding moment, second', async () => {
		const { supabase, queries } = createStandInSupabase();

		await updateMyProfile(supabase, USER_ID, WELCOME_FORM);

		// `onboarding_completed_at` is what every page's gate reads, so it is the
		// very last thing written: a failure halfway sends somebody back to the
		// form rather than into the app with half their details missing.
		expect(queries.map((query) => query.table)).toEqual(['profile_details', 'profiles']);
		expect(queries[1].update).toMatchObject({
			full_name: 'Daniel Perez',
			onboarding_completed_at: expect.any(String)
		});
	});

	it('does not touch the profile row when the details could not be saved', async () => {
		const { supabase, queries } = createStandInSupabase({
			errors: { profile_details: 'no connection' }
		});

		await expect(updateMyProfile(supabase, USER_ID, WELCOME_FORM)).rejects.toThrow('no connection');
		expect(queries.map((query) => query.table)).toEqual(['profile_details']);
	});
});

/**
 * The stand-in answering with one profile row holding this picture path.
 *
 * Both avatar functions start by reading the path the profile holds at the
 * moment, so every test about them has to say what that is.
 */
function standInWithAvatar(avatarPath: string | null, answers: Omit<StandInAnswers, 'rows'> = {}) {
	return createStandInSupabase({ ...answers, rows: { profiles: [{ avatar_path: avatarPath }] } });
}

/** A picture as the form sends one. Only the type matters to these tests. */
function pictureFile(type: string): File {
	return new File(['a picture'], 'from-my-phone', { type });
}

describe('uploadAvatar', () => {
	it('uploads into this person own folder of the public bucket', async () => {
		const { supabase, storage } = standInWithAvatar(null);

		await uploadAvatar(supabase, USER_ID, pictureFile('image/jpeg'));

		expect(storage.buckets).toEqual(['public-media']);
		expect(storage.uploaded).toHaveLength(1);
		// `avatars/<user_id>/<uuid>.<ext>`, the path `02-architecture/storage.md`
		// lays down. The storage policies read those first two folders to decide
		// who may write the file, so the folder has to be this person's id.
		expect(storage.uploaded[0]).toMatch(/^avatars\/user-1\/[0-9a-f-]{36}\.jpg$/);
	});

	it('ends the name with the ending that goes with the picture type', async () => {
		const { supabase, storage } = standInWithAvatar(null);

		await uploadAvatar(supabase, USER_ID, pictureFile('image/jpeg'));
		await uploadAvatar(supabase, USER_ID, pictureFile('image/png'));
		await uploadAvatar(supabase, USER_ID, pictureFile('image/webp'));

		const endings = storage.uploaded.map((path) => path.slice(path.lastIndexOf('.') + 1));

		expect(endings).toEqual(['jpg', 'png', 'webp']);
	});

	it('gives every upload an address of its own', async () => {
		const { supabase, storage } = standInWithAvatar(null);

		await uploadAvatar(supabase, USER_ID, pictureFile('image/jpeg'));
		await uploadAvatar(supabase, USER_ID, pictureFile('image/jpeg'));

		// The uuid in the name is what makes replacing a picture safe: the new one
		// is a new address, so no browser can show the cached old one in its place.
		expect(storage.uploaded[0]).not.toBe(storage.uploaded[1]);
	});

	it('points the profile at the path it uploaded', async () => {
		const { supabase, queries, storage } = standInWithAvatar(null);

		await uploadAvatar(supabase, USER_ID, pictureFile('image/png'));

		// The first query reads the path the profile holds now and the second
		// writes the new one.
		expect(queries.map((query) => query.table)).toEqual(['profiles', 'profiles']);
		expect(queries[1].eq).toEqual([['id', USER_ID]]);
		expect(queries[1].update).toEqual({ avatar_path: storage.uploaded[0] });
	});

	it('deletes the picture it replaced, and not the one it just uploaded', async () => {
		const { supabase, storage } = standInWithAvatar('avatars/user-1/old-picture.jpg');

		await uploadAvatar(supabase, USER_ID, pictureFile('image/jpeg'));

		expect(storage.removed).toEqual(['avatars/user-1/old-picture.jpg']);
		expect(storage.removed).not.toContain(storage.uploaded[0]);
	});

	it('deletes nothing when this is the first picture this person has had', async () => {
		const { supabase, storage } = standInWithAvatar(null);

		await uploadAvatar(supabase, USER_ID, pictureFile('image/jpeg'));

		expect(storage.removed).toEqual([]);
	});

	it('still counts as saved when the old picture could not be deleted', async () => {
		const { supabase, queries } = standInWithAvatar('avatars/user-1/old-picture.jpg', {
			removeError: 'no such object'
		});

		// By then the new picture is uploaded and the profile points at it, so an
		// object nobody points at any more is a smaller problem than an error page
		// about a change that did in fact happen.
		await expect(
			uploadAvatar(supabase, USER_ID, pictureFile('image/jpeg'))
		).resolves.toBeUndefined();
		expect(queries[1].update).toMatchObject({ avatar_path: expect.any(String) });
	});

	it('raises when the upload fails, rather than pointing the profile at nothing', async () => {
		const { supabase, queries } = standInWithAvatar(null, { uploadError: 'bucket full' });

		await expect(uploadAvatar(supabase, USER_ID, pictureFile('image/jpeg'))).rejects.toThrow(
			'bucket full'
		);
		// Only the read happened; no query wrote a column.
		expect(queries.every((query) => query.update === null)).toBe(true);
	});

	it('raises before uploading anything when the profile cannot be read', async () => {
		const { supabase, storage } = createStandInSupabase({ errors: { profiles: 'no connection' } });

		await expect(uploadAvatar(supabase, USER_ID, pictureFile('image/jpeg'))).rejects.toThrow(
			'no connection'
		);
		expect(storage.uploaded).toEqual([]);
	});
});

describe('removeAvatar', () => {
	it('clears the column and then deletes the object behind it', async () => {
		const { supabase, queries, storage } = standInWithAvatar('avatars/user-1/old-picture.jpg');

		await removeAvatar(supabase, USER_ID);

		expect(queries.map((query) => query.table)).toEqual(['profiles', 'profiles']);
		expect(queries[1].eq).toEqual([['id', USER_ID]]);
		expect(queries[1].update).toEqual({ avatar_path: null });
		expect(storage.removed).toEqual(['avatars/user-1/old-picture.jpg']);
	});

	it('does nothing at all for somebody who has no picture', async () => {
		const { supabase, queries, storage } = standInWithAvatar(null);

		await removeAvatar(supabase, USER_ID);

		// Only the read. There is no column to clear and no object to delete.
		expect(queries).toHaveLength(1);
		expect(storage.removed).toEqual([]);
	});

	it('raises when the database refuses, rather than saying the picture has gone', async () => {
		const { supabase } = createStandInSupabase({ errors: { profiles: 'no connection' } });

		await expect(removeAvatar(supabase, USER_ID)).rejects.toThrow('no connection');
	});
});
