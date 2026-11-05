import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	countOrganizationConferences,
	deleteOrganization,
	getManagedOrganization,
	getOrganizationPage,
	getOrganizationSettings,
	isEmailInOrganization,
	listMyOrganizations,
	listMyOwnerships,
	listOrganizationMembers,
	readMyOrganizationRole,
	readStripeAccountId,
	removeMember,
	setStripeAccount,
	toManagedOrganization,
	updateMemberRole,
	updateOrganization,
	uploadOrganizationLogo
} from './organizations';

// `listMyOwnerships` does its grouping in TypeScript rather than in SQL, so
// these tests are about that grouping. Who may read which membership row is
// decided by Row Level Security and tested in `tests/db/organizations.test.ts`.

/** One owner row as the query brings it back. */
type OwnerRow = {
	user_id: string;
	organization_id: string;
	organizations: { id: string; name: string; slug: string; is_personal?: boolean } | null;
};

/**
 * A stand-in Supabase client answering the one query the function makes.
 *
 * The real client is a builder: each step gives back an object carrying the
 * next one. The chain here ends in `overrideTypes()`, which only changes the
 * type and not the answer, so that last step is the answer itself.
 */
function supabaseWithOwnerRows(rows: OwnerRow[]): SupabaseClient {
	return {
		from: () => ({
			select: () => ({
				eq: () => ({
					overrideTypes: async () => ({ data: rows, error: null })
				})
			})
		})
	} as unknown as SupabaseClient;
}

/** One owner row, with the organization attached. */
function ownerRow(userId: string, organizationId: string, name: string): OwnerRow {
	return {
		user_id: userId,
		organization_id: organizationId,
		organizations: { id: organizationId, name, slug: name.toLowerCase().replace(/ /g, '-') }
	};
}

describe('listMyOwnerships', () => {
	it('is empty when the person owns nothing', async () => {
		const supabase = supabaseWithOwnerRows([]);

		expect(await listMyOwnerships(supabase, 'user-1')).toEqual([]);
	});

	it('names an organization the person is the only owner of', async () => {
		const supabase = supabaseWithOwnerRows([ownerRow('user-1', 'org-1', 'Amsterdam MUN')]);

		expect(await listMyOwnerships(supabase, 'user-1')).toEqual([
			{ id: 'org-1', name: 'Amsterdam MUN', slug: 'amsterdam-mun' }
		]);
	});

	it('leaves out an organization that has a second owner', async () => {
		const supabase = supabaseWithOwnerRows([
			ownerRow('user-1', 'org-1', 'Amsterdam MUN'),
			ownerRow('user-2', 'org-1', 'Amsterdam MUN')
		]);

		expect(await listMyOwnerships(supabase, 'user-1')).toEqual([]);
	});

	it('leaves out an organization somebody else is the only owner of', async () => {
		const supabase = supabaseWithOwnerRows([ownerRow('user-2', 'org-1', 'Amsterdam MUN')]);

		expect(await listMyOwnerships(supabase, 'user-1')).toEqual([]);
	});

	it('lists several, in alphabetical order', async () => {
		const supabase = supabaseWithOwnerRows([
			ownerRow('user-1', 'org-2', 'Vienna MUN'),
			ownerRow('user-1', 'org-1', 'Amsterdam MUN')
		]);

		const names = (await listMyOwnerships(supabase, 'user-1')).map((ownership) => ownership.name);

		expect(names).toEqual(['Amsterdam MUN', 'Vienna MUN']);
	});

	it('never counts the personal organisation of quick sessions, which the account takes with it (S14)', async () => {
		const personal: OwnerRow = {
			user_id: 'user-1',
			organization_id: 'org-personal',
			organizations: {
				id: 'org-personal',
				name: 'Quick sessions',
				slug: 'personal-ab12cd34ef',
				is_personal: true
			}
		};
		const supabase = supabaseWithOwnerRows([
			personal,
			ownerRow('user-1', 'org-1', 'Amsterdam MUN')
		]);

		expect(await listMyOwnerships(supabase, 'user-1')).toEqual([
			{ id: 'org-1', name: 'Amsterdam MUN', slug: 'amsterdam-mun' }
		]);
	});

	it('skips a row whose organization could not be read, because it has no name to show', async () => {
		const supabase = supabaseWithOwnerRows([
			{ user_id: 'user-1', organization_id: 'org-1', organizations: null }
		]);

		expect(await listMyOwnerships(supabase, 'user-1')).toEqual([]);
	});

	it('raises when the query fails, rather than saying the person owns nothing', async () => {
		const supabase = {
			from: () => ({
				select: () => ({
					eq: () => ({
						overrideTypes: async () => ({ data: null, error: { message: 'no connection' } })
					})
				})
			})
		} as unknown as SupabaseClient;

		await expect(listMyOwnerships(supabase, 'user-1')).rejects.toThrow('no connection');
	});
});

describe('listMyOrganizations', () => {
	/** A client whose one query answers with these membership rows. */
	function supabaseWithMemberships(rows: unknown[]): SupabaseClient {
		return {
			from: () => ({
				select: () => ({
					eq: () => ({ overrideTypes: async () => ({ data: rows, error: null }) })
				})
			})
		} as unknown as SupabaseClient;
	}

	it('lists the organisations, by name, without the personal one of quick sessions (S14)', async () => {
		const supabase = supabaseWithMemberships([
			{ organizations: { id: 'org-2', name: 'Vienna MUN', is_personal: false } },
			{ organizations: { id: 'org-personal', name: 'Quick sessions', is_personal: true } },
			{ organizations: { id: 'org-1', name: 'Amsterdam MUN', is_personal: false } },
			{ organizations: null }
		]);

		// Nobody runs a conference in the personal organisation, so `/create` does not offer it.
		expect(await listMyOrganizations(supabase, 'user-1')).toEqual([
			{ id: 'org-1', name: 'Amsterdam MUN' },
			{ id: 'org-2', name: 'Vienna MUN' }
		]);
	});
});

// ---------------------------------------------------------------------------
// The public organisation page
// ---------------------------------------------------------------------------
// `getOrganizationPage` reads the organisation, then its conferences and the
// database's "may this person edit it" helper. These tests are about the
// decisions it makes: which slug it looks up, whether it asks the helper at all,
// and what it makes of the row it gets back. Whether the database then lets a
// visitor read that row is Row Level Security's decision, tested in
// `tests/db/organizations.test.ts`.

/** A moment in the middle of a day. The conference lists are tested in `conferences.test.ts`. */
const NOW = new Date('2026-09-17T12:00:00Z');

/** One row of `organizations`, in the shape the query brings it back. */
function organizationRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'organization-1',
		slug: 'sample-europe-mun-network',
		name: 'Sample Europe MUN Network',
		description: 'A made-up organization.',
		country_code: 'NL',
		website_url: 'https://example.org',
		logo_path: null,
		...changes
	};
}

/** Everything the stand-in below should answer with. All of it has a harmless default. */
type PageAnswers = {
	/** The organisation row found by slug, or nothing when there is no such organisation. */
	organizationRow?: unknown;
	/** An error for that lookup. */
	organizationError?: { message: string };
	/** What `is_organization_admin` answers. */
	isAdmin?: boolean;
};

/** What the stand-in wrote down about the calls it was given. */
type PageCalls = {
	/** Every relation `.from(...)` was called with. */
	tables: string[];
	/** `[column, value]` for every `.eq(...)`, across both the organisation and the conferences. */
	eq: [string, unknown][];
	/** `[name, arguments]` for every `.rpc(...)`. */
	rpc: [string, unknown][];
};

/**
 * A stand-in Supabase client for the organisation page.
 *
 * The real client is a builder: each step gives back an object carrying the next
 * one, and the request is only sent once the chain is awaited. This copies that
 * shape, records what it was asked for, and answers what `answers` says. The
 * conference lists always come back empty; what they ask the database is tested
 * in `conferences.test.ts`, which owns that function.
 */
function createStandInSupabase(answers: PageAnswers = {}): {
	supabase: SupabaseClient;
	calls: PageCalls;
} {
	const calls: PageCalls = { tables: [], eq: [], rpc: [] };

	const builder = {
		select: () => builder,
		eq: (column: string, value: unknown) => {
			calls.eq.push([column, value]);
			return builder;
		},
		in: () => builder,
		gte: () => builder,
		lt: () => builder,
		order: () => builder,
		limit: () => builder,
		// Where the conference lists end. They are given no rows.
		overrideTypes: async () => ({ data: [], error: null }),
		maybeSingle: () => ({
			// Where the organisation lookup ends: one row rather than a list.
			overrideTypes: async () => ({
				data: answers.organizationRow ?? null,
				error: answers.organizationError ?? null
			})
		})
	};

	const supabase = {
		from: (table: string) => {
			calls.tables.push(table);
			return builder;
		},
		rpc: async (name: string, args: unknown) => {
			calls.rpc.push([name, args]);

			return { data: answers.isAdmin ?? false, error: null };
		}
	};

	return { supabase: supabase as unknown as SupabaseClient, calls };
}

describe('getOrganizationPage', () => {
	it('looks the organisation up by the slug in the address', async () => {
		const { supabase, calls } = createStandInSupabase({ organizationRow: organizationRow() });

		await getOrganizationPage(supabase, 'sample-europe-mun-network', null, NOW);

		expect(calls.tables[0]).toBe('organizations');
		expect(calls.eq[0]).toEqual(['slug', 'sample-europe-mun-network']);
	});

	it('answers null when there is no organisation with that slug, so the page can 404', async () => {
		const { supabase } = createStandInSupabase({ organizationRow: null });

		expect(await getOrganizationPage(supabase, 'no-such-organisation', null, NOW)).toBeNull();
	});

	it('answers null for the personal organisation of quick sessions, which has no page (S14)', async () => {
		const { supabase, calls } = createStandInSupabase({
			organizationRow: organizationRow({ name: 'Quick sessions', is_personal: true })
		});

		expect(await getOrganizationPage(supabase, 'personal-ab12cd34ef', null, NOW)).toBeNull();
		expect(calls.tables).toEqual(['organizations']);
	});

	it('does not look up any conferences for an organisation that is not there', async () => {
		const { supabase, calls } = createStandInSupabase({ organizationRow: null });

		await getOrganizationPage(supabase, 'no-such-organisation', null, NOW);

		expect(calls.tables).toEqual(['organizations']);
	});

	it('turns the row into the shape the page shows, country name and all', async () => {
		const { supabase } = createStandInSupabase({ organizationRow: organizationRow() });

		const page = await getOrganizationPage(supabase, 'sample-europe-mun-network', null, NOW);

		expect(page?.organization).toEqual({
			id: 'organization-1',
			slug: 'sample-europe-mun-network',
			name: 'Sample Europe MUN Network',
			description: 'A made-up organization.',
			countryCode: 'NL',
			countryName: 'Netherlands',
			websiteUrl: 'https://example.org',
			logoPath: null
		});
	});

	it('leaves the country name empty when the organisation gave no country', async () => {
		const { supabase } = createStandInSupabase({
			organizationRow: organizationRow({ country_code: null })
		});

		const page = await getOrganizationPage(supabase, 'sample-europe-mun-network', null, NOW);

		expect(page?.organization.countryCode).toBeNull();
		expect(page?.organization.countryName).toBeNull();
	});

	it('drops a website address that is not a real one, so it never reaches an href', async () => {
		const { supabase } = createStandInSupabase({
			organizationRow: organizationRow({ website_url: 'javascript:alert(1)' })
		});

		const page = await getOrganizationPage(supabase, 'sample-europe-mun-network', null, NOW);

		expect(page?.organization.websiteUrl).toBeNull();
	});

	it('asks the database whether a signed-in reader may edit the organisation', async () => {
		const { supabase, calls } = createStandInSupabase({
			organizationRow: organizationRow(),
			isAdmin: true
		});

		const page = await getOrganizationPage(supabase, 'sample-europe-mun-network', 'user-1', NOW);

		expect(calls.rpc).toEqual([['is_organization_admin', { org_id: 'organization-1' }]]);
		expect(page?.isAdmin).toBe(true);
	});

	it('does not ask at all when nobody is signed in, because the helper would refuse', async () => {
		const { supabase, calls } = createStandInSupabase({
			organizationRow: organizationRow(),
			isAdmin: true
		});

		const page = await getOrganizationPage(supabase, 'sample-europe-mun-network', null, NOW);

		expect(calls.rpc).toEqual([]);
		expect(page?.isAdmin).toBe(false);
	});

	it('raises when the organisation cannot be read, rather than answering "not found"', async () => {
		const { supabase } = createStandInSupabase({ organizationError: { message: 'no connection' } });

		await expect(
			getOrganizationPage(supabase, 'sample-europe-mun-network', null, NOW)
		).rejects.toThrow('no connection');
	});
});

// ---------------------------------------------------------------------------
// The organiser area's view of an organisation
// ---------------------------------------------------------------------------
// `toManagedOrganization` turns one row into what the organiser area draws, and
// `getManagedOrganization` finds that row by slug. `loadManageIndex` in
// `$lib/server/manage.ts` maps its own rows with the same function, which is
// why it is exported rather than kept private here.

/** One row of `organizations`, with the columns the organiser area asks for. */
function managedOrganizationRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'organization-1',
		name: 'Sample Europe MUN Network',
		slug: 'sample-europe-mun-network',
		logo_path: 'organizations/organization-1/logo.png',
		stripe_onboarding_completed_at: null,
		...changes
	};
}

describe('toManagedOrganization', () => {
	it('turns a row into the shape the organiser area draws', () => {
		expect(toManagedOrganization(managedOrganizationRow())).toEqual({
			id: 'organization-1',
			name: 'Sample Europe MUN Network',
			slug: 'sample-europe-mun-network',
			logoPath: 'organizations/organization-1/logo.png',
			isStripeConnected: false
		});
	});

	it('calls an organisation connected once Stripe onboarding has finished', () => {
		const row = managedOrganizationRow({
			stripe_onboarding_completed_at: '2026-09-01T10:00:00Z'
		});

		// The page warns "fees cannot be collected" while this is false, so the
		// timestamp being there is the whole of the answer.
		expect(toManagedOrganization(row).isStripeConnected).toBe(true);
	});
});

describe('getManagedOrganization', () => {
	it('looks the organisation up by the slug in the address', async () => {
		const { supabase, calls } = createStandInSupabase({
			organizationRow: managedOrganizationRow()
		});

		await getManagedOrganization(supabase, 'sample-europe-mun-network');

		expect(calls.tables).toEqual(['organizations']);
		expect(calls.eq).toEqual([['slug', 'sample-europe-mun-network']]);
	});

	it('gives back the organisation in the shape the organiser area draws', async () => {
		const { supabase } = createStandInSupabase({
			organizationRow: managedOrganizationRow({
				stripe_onboarding_completed_at: '2026-09-01T10:00:00Z'
			})
		});

		const organization = await getManagedOrganization(supabase, 'sample-europe-mun-network');

		expect(organization?.name).toBe('Sample Europe MUN Network');
		expect(organization?.isStripeConnected).toBe(true);
	});

	it('answers null when there is no organisation with that slug, so the page can 404', async () => {
		const { supabase } = createStandInSupabase({ organizationRow: null });

		expect(await getManagedOrganization(supabase, 'no-such-organisation')).toBeNull();
	});

	it('raises when the organisation cannot be read, rather than answering "not found"', async () => {
		const { supabase } = createStandInSupabase({ organizationError: { message: 'no connection' } });

		await expect(getManagedOrganization(supabase, 'sample-europe-mun-network')).rejects.toThrow(
			'no connection'
		);
	});
});

// ---------------------------------------------------------------------------
// The organisation settings page
// ---------------------------------------------------------------------------
// The rest of this file is about `/manage/organizations/[orgSlug]`: what the
// settings page reads, and the writes behind its forms. These tests are about
// the decisions this module makes — which table each call asks, which columns it
// writes, what it makes of a row that did not come back, and which refusals are
// a sentence for the reader rather than a fault. Nothing here talks to a
// database. Whether the database lets somebody read or write those rows at all
// is Row Level Security's decision, and that is tested in
// `tests/db/organizations.test.ts`.

/** The organisation these tests are about. */
const ORGANIZATION_ID = 'organization-1';

/** The signed-in person reading the page. */
const MY_USER_ID = 'user-1';

/** The rows each table answers with, and which tables fail instead of answering. */
type SettingsAnswers = {
	/** Keyed by table name. A table with no entry answers with no rows. */
	rows?: Record<string, unknown[]>;
	/** Keyed by table name, holding the message that table's query fails with. */
	errors?: Record<string, string>;
	/** Keyed by table name, the number a counting query reports for it. */
	counts?: Record<string, number>;
	/** The message an upload to the bucket fails with. Nothing means it works. */
	uploadError?: string;
	/** The message a delete from the bucket fails with. Nothing means it works. */
	removeError?: string;
	/** Keyed by SQL function name, what that call answers with. */
	rpcAnswers?: Record<string, unknown>;
	/** Keyed by SQL function name, the message that call fails with. */
	rpcErrors?: Record<string, string>;
};

/** One thing the code under test asked the database to do. */
type RecordedQuery = {
	/** The relation `.from(...)` named. */
	table: string;
	/** The columns an `update` was given, or `null` when the query did not update. */
	update: Record<string, unknown> | null;
	/** Whether the query was a delete. */
	isDelete: boolean;
	eq: [string, unknown][];
	/** `[column, values]` for every `.in(...)`, which is how the names are looked up. */
	inValues: [string, unknown[]][];
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
 * A second stand-in Supabase client, this one answering by table name.
 *
 * `createStandInSupabase` above answers one query at a time, which is all the
 * two page lookups need. The settings page touches four tables, two SQL
 * functions and the storage bucket, so this one is keyed by table and writes
 * down what each call was asked to do. The real client is a builder: `.from(...)`
 * gives back an object with `.select(...)`, `.update(...)` and `.delete()` on
 * it, each of those gives back one with `.eq(...)` on it, and the request is
 * only sent once the chain is awaited. This copies that shape; every step hands
 * the same builder back.
 *
 * The four ways a chain here ends are all catered for. `single` answers with one
 * row, `maybeSingle().overrideTypes()` with one row as well, `overrideTypes()`
 * on its own — which only changes the type of the answer in the real client, not
 * the answer itself — with a list, and a counting or an updating chain ends with
 * nothing at all and is simply awaited. `then` is what makes that last one work:
 * `await` on any object calls its `then`, which is exactly how the real builder
 * sends its query at the last moment.
 */
function createSettingsSupabase(answers: SettingsAnswers = {}): {
	supabase: SupabaseClient;
	queries: RecordedQuery[];
	storage: RecordedStorage;
	rpcCalls: [string, unknown][];
} {
	const queries: RecordedQuery[] = [];
	const storage: RecordedStorage = { buckets: [], uploaded: [], removed: [] };
	const rpcCalls: [string, unknown][] = [];

	function builderFor(table: string) {
		const query: RecordedQuery = { table, update: null, isDelete: false, eq: [], inValues: [] };
		queries.push(query);

		const message = answers.errors?.[table];
		const error = message ? { message } : null;
		const rows = answers.rows?.[table] ?? [];
		const listAnswer = { data: message ? null : rows, error };
		const rowAnswer = { data: message ? null : (rows[0] ?? null), error };
		const count = message ? null : (answers.counts?.[table] ?? null);

		const builder = {
			// Which columns were asked for is not what these tests are about, so
			// `select` records nothing and only carries the chain on.
			select: () => builder,
			update: (values: Record<string, unknown>) => {
				query.update = values;
				return builder;
			},
			delete: () => {
				query.isDelete = true;
				return builder;
			},
			eq: (column: string, value: unknown) => {
				query.eq.push([column, value]);
				return builder;
			},
			in: (column: string, values: unknown[]) => {
				query.inValues.push([column, values]);
				return builder;
			},
			single: async () => rowAnswer,
			maybeSingle: () => ({ overrideTypes: async () => rowAnswer }),
			overrideTypes: async () => listAnswer,
			then: (resolve: (answer: unknown) => void) => resolve({ data: null, count, error })
		};

		return builder;
	}

	/**
	 * The storage half of the stand-in, in the shape the real client has:
	 * `supabase.storage.from(bucket)` gives back an object carrying `upload` and
	 * `remove`, and each of those answers with `{ data, error }` rather than
	 * throwing, just as a query does.
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

	const supabase = {
		from: builderFor,
		storage: { from: bucketFor },
		rpc: async (name: string, args: unknown) => {
			rpcCalls.push([name, args]);

			const message = answers.rpcErrors?.[name];

			return {
				data: message ? null : (answers.rpcAnswers?.[name] ?? null),
				error: message ? { message } : null
			};
		}
	};

	return { supabase: supabase as unknown as SupabaseClient, queries, storage, rpcCalls };
}

/** One row of `organizations`, with the columns the settings page asks for. */
function settingsRow(changes: Record<string, unknown> = {}) {
	return {
		id: ORGANIZATION_ID,
		slug: 'sample-europe-mun-network',
		name: 'Sample Europe MUN Network',
		description: 'A made-up organization.',
		country_code: 'NL',
		website_url: 'https://example.org',
		logo_path: null,
		...changes
	};
}

describe('getOrganizationSettings', () => {
	it('looks the organisation up by the slug in the address', async () => {
		const { supabase, queries } = createSettingsSupabase({
			rows: { organizations: [settingsRow()] }
		});

		await getOrganizationSettings(supabase, 'sample-europe-mun-network');

		// Two reads: the row itself, then the Stripe facts from the view that
		// hands them only to the organisation's own members.
		expect(queries).toHaveLength(2);
		expect(queries[0].table).toBe('organizations');
		expect(queries[0].eq).toEqual([['slug', 'sample-europe-mun-network']]);
		expect(queries[1].table).toBe('organization_private_settings');
		expect(queries[1].eq).toEqual([['organization_id', ORGANIZATION_ID]]);
	});

	it('turns the row into the shape the settings page shows, country name and all', async () => {
		const { supabase } = createSettingsSupabase({ rows: { organizations: [settingsRow()] } });

		expect(await getOrganizationSettings(supabase, 'sample-europe-mun-network')).toEqual({
			id: ORGANIZATION_ID,
			slug: 'sample-europe-mun-network',
			name: 'Sample Europe MUN Network',
			description: 'A made-up organization.',
			countryCode: 'NL',
			countryName: 'Netherlands',
			websiteUrl: 'https://example.org',
			logoPath: null,
			stripeState: 'none'
		});
	});

	it('reads both Stripe facts, so an account that has finished counts as connected', async () => {
		const { supabase } = createSettingsSupabase({
			rows: {
				organizations: [settingsRow()],
				organization_private_settings: [
					{ has_stripe_account: true, stripe_onboarding_completed_at: '2026-09-01T10:00:00Z' }
				]
			}
		});

		const organization = await getOrganizationSettings(supabase, 'sample-europe-mun-network');

		expect(organization?.stripeState).toBe('connected');
	});

	it('shows an account whose onboarding is unfinished as pending', async () => {
		const { supabase } = createSettingsSupabase({
			rows: {
				organizations: [settingsRow()],
				organization_private_settings: [
					{ has_stripe_account: true, stripe_onboarding_completed_at: null }
				]
			}
		});

		const organization = await getOrganizationSettings(supabase, 'sample-europe-mun-network');

		expect(organization?.stripeState).toBe('pending');
	});

	// The view answers only the organisation's members. Somebody else gets no row
	// and therefore no payment state, which is the right answer for them, and
	// `requireOrganizationMember` turns them away a moment later anyway.
	it('reads no Stripe state at all for somebody the view answers nothing', async () => {
		const { supabase } = createSettingsSupabase({ rows: { organizations: [settingsRow()] } });

		const organization = await getOrganizationSettings(supabase, 'sample-europe-mun-network');

		expect(organization?.stripeState).toBe('none');
	});

	it('leaves the country name empty when the organisation gave no country', async () => {
		const { supabase } = createSettingsSupabase({
			rows: { organizations: [settingsRow({ country_code: null })] }
		});

		const organization = await getOrganizationSettings(supabase, 'sample-europe-mun-network');

		expect(organization?.countryCode).toBeNull();
		expect(organization?.countryName).toBeNull();
	});

	it('drops a website address that is not a real one, so it never reaches an href', async () => {
		const { supabase } = createSettingsSupabase({
			rows: { organizations: [settingsRow({ website_url: 'javascript:alert(1)' })] }
		});

		const organization = await getOrganizationSettings(supabase, 'sample-europe-mun-network');

		expect(organization?.websiteUrl).toBeNull();
	});

	it('answers null when there is no organisation with that slug, so the page can 404', async () => {
		const { supabase } = createSettingsSupabase();

		expect(await getOrganizationSettings(supabase, 'no-such-organisation')).toBeNull();
	});

	it('raises when the organisation cannot be read, rather than answering "not found"', async () => {
		const { supabase } = createSettingsSupabase({ errors: { organizations: 'no connection' } });

		await expect(getOrganizationSettings(supabase, 'sample-europe-mun-network')).rejects.toThrow(
			'no connection'
		);
	});
});

describe('readMyOrganizationRole', () => {
	it('asks for this person own membership of this organisation', async () => {
		const { supabase, queries } = createSettingsSupabase({
			rows: { organization_members: [{ role: 'admin' }] }
		});

		const role = await readMyOrganizationRole(supabase, ORGANIZATION_ID, MY_USER_ID);

		expect(queries[0].table).toBe('organization_members');
		expect(queries[0].eq).toEqual([
			['organization_id', ORGANIZATION_ID],
			['user_id', MY_USER_ID]
		]);
		expect(role).toBe('admin');
	});

	it('answers null for somebody who is not a member, which the page turns into a 404', async () => {
		const { supabase } = createSettingsSupabase();

		expect(await readMyOrganizationRole(supabase, ORGANIZATION_ID, MY_USER_ID)).toBeNull();
	});

	it('raises when the membership cannot be read, rather than saying "not a member"', async () => {
		const { supabase } = createSettingsSupabase({
			errors: { organization_members: 'no connection' }
		});

		await expect(readMyOrganizationRole(supabase, ORGANIZATION_ID, MY_USER_ID)).rejects.toThrow(
			'no connection'
		);
	});
});

/** One `organization_members` row, in the shape the query brings it back. */
function membershipRow(userId: string, role: string) {
	return { user_id: userId, role };
}

/** One `profiles` row, in the shape the second query brings it back. */
function profileRow(userId: string, fullName: string, avatarPath: string | null = null) {
	return { id: userId, full_name: fullName, avatar_path: avatarPath };
}

describe('listOrganizationMembers', () => {
	it('reads the memberships and then looks the names up by id', async () => {
		const { supabase, queries } = createSettingsSupabase({
			rows: {
				organization_members: [membershipRow('user-2', 'member')],
				profiles: [profileRow('user-2', 'Ana Silva')]
			}
		});

		await listOrganizationMembers(supabase, ORGANIZATION_ID, MY_USER_ID);

		// Two queries and not one: nothing joins `organization_members` to
		// `profiles`, so the names cannot be brought along with the memberships.
		expect(queries.map((query) => query.table)).toEqual(['organization_members', 'profiles']);
		expect(queries[0].eq).toEqual([['organization_id', ORGANIZATION_ID]]);
		expect(queries[1].inValues).toEqual([['id', ['user-2']]]);
	});

	it('puts the name and the picture on each member', async () => {
		const { supabase } = createSettingsSupabase({
			rows: {
				organization_members: [membershipRow('user-2', 'member')],
				profiles: [profileRow('user-2', 'Ana Silva', 'avatars/user-2/picture.jpg')]
			}
		});

		expect(await listOrganizationMembers(supabase, ORGANIZATION_ID, MY_USER_ID)).toEqual([
			{
				userId: 'user-2',
				fullName: 'Ana Silva',
				avatarPath: 'avatars/user-2/picture.jpg',
				role: 'member',
				isMe: false
			}
		]);
	});

	it('marks the reader own row, so the page can offer "Leave organisation"', async () => {
		const { supabase } = createSettingsSupabase({
			rows: {
				organization_members: [membershipRow(MY_USER_ID, 'owner')],
				profiles: [profileRow(MY_USER_ID, 'Daniel Perez')]
			}
		});

		const members = await listOrganizationMembers(supabase, ORGANIZATION_ID, MY_USER_ID);

		expect(members[0].isMe).toBe(true);
	});

	it('keeps a member whose profile did not come back, under a stand-in name', async () => {
		const { supabase } = createSettingsSupabase({
			rows: {
				organization_members: [membershipRow('user-2', 'owner')],
				profiles: []
			}
		});

		// Leaving them off would hide a real member from the only list that can
		// change a role or remove anybody — here an owner, which would make the
		// "last owner" rule look like a bug.
		expect(await listOrganizationMembers(supabase, ORGANIZATION_ID, MY_USER_ID)).toEqual([
			{
				userId: 'user-2',
				fullName: 'Unknown member',
				avatarPath: null,
				role: 'owner',
				isMe: false
			}
		]);
	});

	it('puts owners first, then admins, then members, and sorts each by name', async () => {
		const { supabase } = createSettingsSupabase({
			rows: {
				organization_members: [
					membershipRow('user-2', 'member'),
					membershipRow('user-3', 'owner'),
					membershipRow('user-4', 'admin'),
					membershipRow('user-5', 'admin')
				],
				profiles: [
					profileRow('user-2', 'Ana Silva'),
					profileRow('user-3', 'Daniel Perez'),
					profileRow('user-4', 'Zoë Brand'),
					profileRow('user-5', 'Bilal Haddad')
				]
			}
		});

		const members = await listOrganizationMembers(supabase, ORGANIZATION_ID, MY_USER_ID);

		expect(members.map((member) => member.fullName)).toEqual([
			'Daniel Perez',
			'Bilal Haddad',
			'Zoë Brand',
			'Ana Silva'
		]);
	});

	it('asks for no names at all when the organisation has no members', async () => {
		const { supabase, queries } = createSettingsSupabase();

		expect(await listOrganizationMembers(supabase, ORGANIZATION_ID, MY_USER_ID)).toEqual([]);
		// `.in('id', [])` would be a request that cannot match anything, so it is
		// never sent.
		expect(queries.map((query) => query.table)).toEqual(['organization_members']);
	});

	it('raises when the memberships cannot be read, rather than showing an empty team', async () => {
		const { supabase } = createSettingsSupabase({
			errors: { organization_members: 'no connection' }
		});

		await expect(listOrganizationMembers(supabase, ORGANIZATION_ID, MY_USER_ID)).rejects.toThrow(
			'no connection'
		);
	});

	it('raises when the names cannot be read, rather than calling everybody unknown', async () => {
		const { supabase } = createSettingsSupabase({
			rows: { organization_members: [membershipRow('user-2', 'member')] },
			errors: { profiles: 'no connection' }
		});

		await expect(listOrganizationMembers(supabase, ORGANIZATION_ID, MY_USER_ID)).rejects.toThrow(
			'no connection'
		);
	});
});

describe('countOrganizationConferences', () => {
	it('counts the conferences of this organisation', async () => {
		const { supabase, queries } = createSettingsSupabase({ counts: { conferences: 3 } });

		expect(await countOrganizationConferences(supabase, ORGANIZATION_ID)).toBe(3);
		expect(queries[0].table).toBe('conferences');
		expect(queries[0].eq).toEqual([['organization_id', ORGANIZATION_ID]]);
	});

	it('answers zero when the database reports no count at all', async () => {
		const { supabase } = createSettingsSupabase();

		expect(await countOrganizationConferences(supabase, ORGANIZATION_ID)).toBe(0);
	});

	it('raises when the count fails, rather than saying the organisation has none', async () => {
		const { supabase } = createSettingsSupabase({ errors: { conferences: 'no connection' } });

		// A wrong zero here would offer a delete that the database refuses.
		await expect(countOrganizationConferences(supabase, ORGANIZATION_ID)).rejects.toThrow(
			'no connection'
		);
	});
});

describe('updateOrganization', () => {
	it('writes the four fields of the details form onto this organisation', async () => {
		const { supabase, queries } = createSettingsSupabase();

		await updateOrganization(supabase, ORGANIZATION_ID, {
			name: 'Sample Europe MUN Network',
			description: 'A made-up organization.',
			countryCode: 'NL',
			websiteUrl: 'https://example.org'
		});

		expect(queries[0].table).toBe('organizations');
		expect(queries[0].eq).toEqual([['id', ORGANIZATION_ID]]);
		expect(queries[0].update).toEqual({
			name: 'Sample Europe MUN Network',
			description: 'A made-up organization.',
			country_code: 'NL',
			website_url: 'https://example.org'
		});
	});

	/*
		An empty box sends '', which is what the form really hands over, and the
		column has to end up holding `null`. It matters most for `country_code`,
		which is a `char(2)`: Postgres pads '' out to two spaces, and a stored
		'  ' is not `null`, so the public organisation page would draw a flag for
		a country nobody chose.
	*/
	it('clears a field the form left empty, rather than storing empty text', async () => {
		const { supabase, queries } = createSettingsSupabase();

		await updateOrganization(supabase, ORGANIZATION_ID, {
			name: 'Sample Europe MUN Network',
			description: '',
			countryCode: '',
			websiteUrl: ''
		});

		expect(queries[0].update).toEqual({
			name: 'Sample Europe MUN Network',
			description: null,
			country_code: null,
			website_url: null
		});
	});

	it('raises when the database refuses, rather than saying the change was saved', async () => {
		const { supabase } = createSettingsSupabase({ errors: { organizations: 'no connection' } });

		await expect(
			updateOrganization(supabase, ORGANIZATION_ID, {
				name: 'Sample Europe MUN Network',
				description: '',
				countryCode: '',
				websiteUrl: ''
			})
		).rejects.toThrow('no connection');
	});
});

/**
 * The stand-in answering with one organisation row holding this logo path.
 *
 * `uploadOrganizationLogo` starts by reading the path the row holds at the
 * moment, so every test about it has to say what that is.
 */
function standInWithLogo(logoPath: string | null, answers: Omit<SettingsAnswers, 'rows'> = {}) {
	return createSettingsSupabase({ ...answers, rows: { organizations: [{ logo_path: logoPath }] } });
}

/** A picture as the form sends one. Only the type matters to these tests. */
function pictureFile(type: string): File {
	return new File(['a picture'], 'our-logo', { type });
}

describe('uploadOrganizationLogo', () => {
	it('uploads into this organisation own folder of the public bucket', async () => {
		const { supabase, storage } = standInWithLogo(null);

		await uploadOrganizationLogo(supabase, ORGANIZATION_ID, pictureFile('image/jpeg'));

		expect(storage.buckets).toEqual(['public-media']);
		expect(storage.uploaded).toHaveLength(1);
		// `organizations/<organization_id>/logo-<uuid>.<ext>`, the path
		// `02-architecture/storage.md` lays down. The storage policies read those
		// first two folders to decide who may write the file.
		expect(storage.uploaded[0]).toMatch(/^organizations\/organization-1\/logo-[0-9a-f-]{36}\.jpg$/);
	});

	it('ends the name with the ending that goes with the picture type', async () => {
		const { supabase, storage } = standInWithLogo(null);

		await uploadOrganizationLogo(supabase, ORGANIZATION_ID, pictureFile('image/jpeg'));
		await uploadOrganizationLogo(supabase, ORGANIZATION_ID, pictureFile('image/png'));
		await uploadOrganizationLogo(supabase, ORGANIZATION_ID, pictureFile('image/webp'));

		const endings = storage.uploaded.map((path) => path.slice(path.lastIndexOf('.') + 1));

		expect(endings).toEqual(['jpg', 'png', 'webp']);
	});

	it('gives every upload an address of its own', async () => {
		const { supabase, storage } = standInWithLogo(null);

		await uploadOrganizationLogo(supabase, ORGANIZATION_ID, pictureFile('image/png'));
		await uploadOrganizationLogo(supabase, ORGANIZATION_ID, pictureFile('image/png'));

		// The uuid in the name is what makes replacing a logo safe: the new one is a
		// new address, so no browser can show the cached old one in its place.
		expect(storage.uploaded[0]).not.toBe(storage.uploaded[1]);
	});

	it('points the organisation at the path it uploaded', async () => {
		const { supabase, queries, storage } = standInWithLogo(null);

		await uploadOrganizationLogo(supabase, ORGANIZATION_ID, pictureFile('image/png'));

		// The first query reads the path the row holds now and the second writes the
		// new one.
		expect(queries.map((query) => query.table)).toEqual(['organizations', 'organizations']);
		expect(queries[1].eq).toEqual([['id', ORGANIZATION_ID]]);
		expect(queries[1].update).toEqual({ logo_path: storage.uploaded[0] });
	});

	it('deletes the logo it replaced, and not the one it just uploaded', async () => {
		const { supabase, storage } = standInWithLogo('organizations/organization-1/logo-old.png');

		await uploadOrganizationLogo(supabase, ORGANIZATION_ID, pictureFile('image/png'));

		expect(storage.removed).toEqual(['organizations/organization-1/logo-old.png']);
		expect(storage.removed).not.toContain(storage.uploaded[0]);
	});

	it('deletes nothing when this is the first logo the organisation has had', async () => {
		const { supabase, storage } = standInWithLogo(null);

		await uploadOrganizationLogo(supabase, ORGANIZATION_ID, pictureFile('image/png'));

		expect(storage.removed).toEqual([]);
	});

	it('still counts as saved when the old logo could not be deleted', async () => {
		const { supabase, queries } = standInWithLogo('organizations/organization-1/logo-old.png', {
			removeError: 'no such object'
		});

		// By then the new logo is uploaded and the row points at it, so an object
		// nobody points at any more is a smaller problem than an error page about a
		// change that did in fact happen.
		await expect(
			uploadOrganizationLogo(supabase, ORGANIZATION_ID, pictureFile('image/png'))
		).resolves.toBeUndefined();
		expect(queries[1].update).toMatchObject({ logo_path: expect.any(String) });
	});

	it('raises when the upload fails, rather than pointing the organisation at nothing', async () => {
		const { supabase, queries } = standInWithLogo(null, { uploadError: 'bucket full' });

		await expect(
			uploadOrganizationLogo(supabase, ORGANIZATION_ID, pictureFile('image/png'))
		).rejects.toThrow('bucket full');
		// Only the read happened; no query wrote a column.
		expect(queries.every((query) => query.update === null)).toBe(true);
	});

	it('raises before uploading anything when the organisation cannot be read', async () => {
		const { supabase, storage } = createSettingsSupabase({
			errors: { organizations: 'no connection' }
		});

		await expect(
			uploadOrganizationLogo(supabase, ORGANIZATION_ID, pictureFile('image/png'))
		).rejects.toThrow('no connection');
		expect(storage.uploaded).toEqual([]);
	});

	it('refuses a file type the logo field does not accept', async () => {
		const { supabase, storage } = standInWithLogo(null);

		// The form has already refused it; this is the second guard, and it is
		// worth a fault rather than a path ending in `undefined`.
		await expect(
			uploadOrganizationLogo(supabase, ORGANIZATION_ID, pictureFile('image/gif'))
		).rejects.toThrow('image/gif');
		expect(storage.uploaded).toEqual([]);
	});
});

/** The message the `prevent_last_owner_removal` trigger raises with. */
const LAST_OWNER_ERROR = 'new row violates: An organisation must always have at least one owner';

/** The sentence `organization-settings.md` asks the page to show instead. */
const LAST_OWNER_SENTENCE =
	'An organisation needs at least one owner. Make someone else an owner first.';

describe('updateMemberRole', () => {
	it('writes the new role onto that one membership and answers nothing', async () => {
		const { supabase, queries } = createSettingsSupabase({
			rows: { organization_members: [{ user_id: 'user-2' }] }
		});

		const message = await updateMemberRole(supabase, ORGANIZATION_ID, 'user-2', 'admin');

		expect(message).toBeNull();
		expect(queries[0].table).toBe('organization_members');
		expect(queries[0].update).toEqual({ role: 'admin' });
		expect(queries[0].eq).toEqual([
			['organization_id', ORGANIZATION_ID],
			['user_id', 'user-2']
		]);
	});

	it('answers the page sentence when the last owner would be demoted', async () => {
		const { supabase } = createSettingsSupabase({
			errors: { organization_members: LAST_OWNER_ERROR }
		});

		// The page shows this instead of the Postgres message, which is what the
		// spec asks for.
		expect(await updateMemberRole(supabase, ORGANIZATION_ID, MY_USER_ID, 'member')).toBe(
			LAST_OWNER_SENTENCE
		);
	});

	it('answers a sentence when no row was changed, rather than claiming it worked', async () => {
		const { supabase } = createSettingsSupabase();

		// Row Level Security hides a row it will not let this person change, so
		// nothing matches and no message comes back. Asking for the changed row is
		// what tells that apart from a change that happened.
		expect(await updateMemberRole(supabase, ORGANIZATION_ID, 'user-2', 'admin')).toBe(
			'That person is no longer a member of this organisation.'
		);
	});

	it('raises on any other error, because that is a fault and not a decision', async () => {
		const { supabase } = createSettingsSupabase({
			errors: { organization_members: 'no connection' }
		});

		await expect(updateMemberRole(supabase, ORGANIZATION_ID, 'user-2', 'admin')).rejects.toThrow(
			'no connection'
		);
	});
});

describe('removeMember', () => {
	it('deletes that one membership and answers nothing', async () => {
		const { supabase, queries } = createSettingsSupabase({
			rows: { organization_members: [{ user_id: 'user-2' }] }
		});

		const message = await removeMember(supabase, ORGANIZATION_ID, 'user-2');

		expect(message).toBeNull();
		expect(queries[0].table).toBe('organization_members');
		expect(queries[0].isDelete).toBe(true);
		expect(queries[0].eq).toEqual([
			['organization_id', ORGANIZATION_ID],
			['user_id', 'user-2']
		]);
	});

	it('answers the page sentence when the last owner would be removed', async () => {
		const { supabase } = createSettingsSupabase({
			errors: { organization_members: LAST_OWNER_ERROR }
		});

		expect(await removeMember(supabase, ORGANIZATION_ID, MY_USER_ID)).toBe(LAST_OWNER_SENTENCE);
	});

	it('answers a sentence when no row was deleted, rather than claiming it worked', async () => {
		const { supabase } = createSettingsSupabase();

		expect(await removeMember(supabase, ORGANIZATION_ID, 'user-2')).toBe(
			'That person is no longer a member of this organisation.'
		);
	});

	it('raises on any other error, because that is a fault and not a decision', async () => {
		const { supabase } = createSettingsSupabase({
			errors: { organization_members: 'no connection' }
		});

		await expect(removeMember(supabase, ORGANIZATION_ID, 'user-2')).rejects.toThrow(
			'no connection'
		);
	});
});

describe('deleteOrganization', () => {
	it('deletes the organisation and says that it went', async () => {
		const { supabase, queries } = createSettingsSupabase({
			rows: { organizations: [{ id: ORGANIZATION_ID }] }
		});

		expect(await deleteOrganization(supabase, ORGANIZATION_ID)).toBe(true);
		expect(queries[0].table).toBe('organizations');
		expect(queries[0].isDelete).toBe(true);
		expect(queries[0].eq).toEqual([['id', ORGANIZATION_ID]]);
	});

	it('answers false when nothing was deleted, which is how a refusal arrives', async () => {
		const { supabase } = createSettingsSupabase();

		// The delete policy allows an owner and only while the organisation has no
		// conferences. A row it hides simply does not match, so no error comes back.
		expect(await deleteOrganization(supabase, ORGANIZATION_ID)).toBe(false);
	});

	it('raises when the delete fails outright', async () => {
		const { supabase } = createSettingsSupabase({ errors: { organizations: 'no connection' } });

		await expect(deleteOrganization(supabase, ORGANIZATION_ID)).rejects.toThrow('no connection');
	});
});

describe('readStripeAccountId', () => {
	// The table no longer grants a browser the column; the view hands it to an
	// owner or an admin and to nobody else (security review 2026-10-10, L3).
	it('reads the account off the private settings view', async () => {
		const { supabase, queries } = createSettingsSupabase({
			rows: { organization_private_settings: [{ stripe_account_id: 'acct_123' }] }
		});

		expect(await readStripeAccountId(supabase, ORGANIZATION_ID)).toBe('acct_123');
		expect(queries[0].table).toBe('organization_private_settings');
		expect(queries[0].eq).toEqual([['organization_id', ORGANIZATION_ID]]);
	});

	it('answers null for an organisation nobody has connected yet', async () => {
		const { supabase } = createSettingsSupabase({
			rows: { organization_private_settings: [{ stripe_account_id: null }] }
		});

		expect(await readStripeAccountId(supabase, ORGANIZATION_ID)).toBeNull();
	});

	it('answers null when the view hands the reader no row', async () => {
		const { supabase } = createSettingsSupabase();

		expect(await readStripeAccountId(supabase, ORGANIZATION_ID)).toBeNull();
	});

	it('raises when the row cannot be read, so null means "no account" and nothing else', async () => {
		const { supabase } = createSettingsSupabase({
			errors: { organization_private_settings: 'no connection' }
		});

		await expect(readStripeAccountId(supabase, ORGANIZATION_ID)).rejects.toThrow('no connection');
	});
});

describe('setStripeAccount', () => {
	it('calls the SQL function with the organisation and the account', async () => {
		const { supabase, rpcCalls } = createSettingsSupabase();

		await setStripeAccount(supabase, ORGANIZATION_ID, 'acct_123');

		// The column is refused to a browser by a trigger, so this function is the
		// only door.
		expect(rpcCalls).toEqual([
			['set_stripe_account', { organization_id: ORGANIZATION_ID, stripe_account_id: 'acct_123' }]
		]);
	});

	it('raises when the call is refused, because an admin has already been checked', async () => {
		const { supabase } = createSettingsSupabase({
			rpcErrors: {
				set_stripe_account: 'Only an owner or an admin of this organisation can connect Stripe'
			}
		});

		await expect(setStripeAccount(supabase, ORGANIZATION_ID, 'acct_123')).rejects.toThrow(
			'Only an owner or an admin'
		);
	});
});

describe('isEmailInOrganization', () => {
	it('asks the SQL function about that one address', async () => {
		const { supabase, rpcCalls } = createSettingsSupabase({
			rpcAnswers: { organization_has_email: true }
		});

		const isMember = await isEmailInOrganization(supabase, ORGANIZATION_ID, 'ana@example.org');

		expect(rpcCalls).toEqual([
			['organization_has_email', { org_id: ORGANIZATION_ID, email: 'ana@example.org' }]
		]);
		expect(isMember).toBe(true);
	});

	it('answers false for an address that belongs to nobody in the organisation', async () => {
		const { supabase } = createSettingsSupabase({
			rpcAnswers: { organization_has_email: false }
		});

		expect(await isEmailInOrganization(supabase, ORGANIZATION_ID, 'new@example.org')).toBe(false);
	});

	it('answers true when the call failed, because it refuses to invite unchecked', async () => {
		const { supabase } = createSettingsSupabase({
			rpcErrors: { organization_has_email: 'You cannot manage that organisation' }
		});

		// The function raises for a caller who is not an admin. Refusing to send an
		// invitation we could not check is the safe direction to be wrong in.
		expect(await isEmailInOrganization(supabase, ORGANIZATION_ID, 'new@example.org')).toBe(true);
	});
});
