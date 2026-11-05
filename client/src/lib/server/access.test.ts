import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NO_PERMISSIONS, type MyPermissions } from '$lib/permissions';
import {
	askHasPermission,
	askHasPermissionOrThrow,
	requireCommitteePermission,
	requireDelegationHead,
	requireDelegationMember,
	requireCommitteeTool,
	requireManagePage,
	requirePermission,
	requireRoomWatcher,
	requireOnboarded,
	requireOrganizationAdmin,
	requireOrganizationMember,
	requirePermissionAndRank,
	requirePermissionSomewhere,
	requireTeamMember,
	requireUser
} from './access';
import { readMyPermissions } from './my-permissions';

// `requireTeamMember` reads everything the reader holds through
// `readMyPermissions`, which has its own tests. Here it is a stand-in, so each
// test can say what the reader holds.
vi.mock('./my-permissions', () => ({ readMyPermissions: vi.fn() }));

/** What an organiser of the conference holds. */
const ORGANISER_PERMISSIONS: MyPermissions = {
	held: [{ permission: 'administrator', scope: 'conference' }],
	committeeIds: [],
	rank: 0
};

// The two checks every signed-in page starts with. Both of them redirect by
// throwing, so every test here catches the throw and looks at where it was
// sending the reader.
//
// Row Level Security is the second lock and is tested in `tests/db/profiles.test.ts`.

/** The signed-in person these tests use. */
const CLAIMS = { sub: 'user-1', email: 'daniel@example.com' };

/**
 * A stand-in Supabase client answering the one query `requireOnboarded` makes.
 *
 * The real client is a builder, each step giving back an object carrying the
 * next one, and its `maybeSingle()` ends in `overrideTypes()`, which changes
 * the type rather than the answer. `row` is what comes back: an object for a
 * profile that exists, `null` for an account that somehow has none.
 */
function supabaseAnswering(row: { onboarding_completed_at: string | null } | null) {
	return {
		from: () => ({
			select: () => ({
				eq: () => ({
					maybeSingle: () => ({
						overrideTypes: async () => ({ data: row, error: null })
					})
				})
			})
		})
	};
}

/** A client whose query fails, which must not be mistaken for "not onboarded". */
function supabaseThatFails() {
	return {
		from: () => ({
			select: () => ({
				eq: () => ({
					maybeSingle: () => ({
						overrideTypes: async () => ({ data: null, error: { message: 'connection lost' } })
					})
				})
			})
		})
	};
}

/** `locals`, as `hooks.server.ts` would have left it. */
function makeLocals(claims: typeof CLAIMS | null, supabase: unknown = supabaseAnswering(null)) {
	return { supabase, getVerifiedClaims: async () => claims } as unknown as App.Locals;
}

/**
 * Run something that is expected to redirect, and give back the redirect.
 *
 * SvelteKit's `redirect` works by throwing, so catching it is the only way to
 * see where it was sending the reader.
 */
async function catchRedirect(run: () => unknown): Promise<{ status: number; location: string }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number; location: string };
	}

	throw new Error('Nothing was thrown, so nothing redirected.');
}

describe('requireUser', () => {
	it('gives back the signed-in person', async () => {
		const user = await requireUser(makeLocals(CLAIMS), new URL('http://localhost/notifications'));

		expect(user).toEqual({ id: 'user-1', email: 'daniel@example.com' });
	});

	it('sends a visitor to the sign in page, with this page to come back to', async () => {
		const redirect = await catchRedirect(() =>
			requireUser(makeLocals(null), new URL('http://localhost/notifications?page=3'))
		);

		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe('/login?next=%2Fnotifications%3Fpage%3D3');
	});
});

describe('requireOnboarded', () => {
	const ONBOARDED = { onboarding_completed_at: '2026-03-01T10:00:00Z' };
	const NOT_ONBOARDED = { onboarding_completed_at: null };

	it('lets somebody who has finished the welcome page through', async () => {
		const user = await requireOnboarded(
			makeLocals(CLAIMS, supabaseAnswering(ONBOARDED)),
			new URL('http://localhost/notifications')
		);

		expect(user).toEqual({ id: 'user-1', email: 'daniel@example.com' });
	});

	it('sends a visitor to the sign in page before asking about any profile', async () => {
		const redirect = await catchRedirect(() =>
			requireOnboarded(makeLocals(null), new URL('http://localhost/notifications'))
		);

		expect(redirect.location).toBe('/login?next=%2Fnotifications');
	});

	it('sends somebody who has not finished to the welcome page', async () => {
		const redirect = await catchRedirect(() =>
			requireOnboarded(
				makeLocals(CLAIMS, supabaseAnswering(NOT_ONBOARDED)),
				new URL('http://localhost/notifications')
			)
		);

		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe('/welcome?next=%2Fnotifications');
	});

	it('treats an account with no profile row at all as not finished', async () => {
		const redirect = await catchRedirect(() =>
			requireOnboarded(
				makeLocals(CLAIMS, supabaseAnswering(null)),
				new URL('http://localhost/notifications')
			)
		);

		expect(redirect.location).toBe('/welcome?next=%2Fnotifications');
	});

	it('keeps the rest of the address to come back to', async () => {
		const redirect = await catchRedirect(() =>
			requireOnboarded(
				makeLocals(CLAIMS, supabaseAnswering(NOT_ONBOARDED)),
				new URL('http://localhost/notifications?page=3')
			)
		);

		expect(redirect.location).toBe('/welcome?next=%2Fnotifications%3Fpage%3D3');
	});

	it("drops a form action's own name from the address to come back to", async () => {
		// A post to a named action arrives as `/create?/details`. Coming back from
		// `/welcome` should reopen the page, not aim at one of its buttons.
		const redirect = await catchRedirect(() =>
			requireOnboarded(
				makeLocals(CLAIMS, supabaseAnswering(NOT_ONBOARDED)),
				new URL('http://localhost/create?/details')
			)
		);

		expect(redirect.location).toBe('/welcome?next=%2Fcreate');
	});

	it('raises when the profile cannot be read, rather than assuming the worst', async () => {
		// A database that is not answering is not the same as a person who has not
		// filled the form in, and sending them to `/welcome` would hide the fault.
		await expect(
			requireOnboarded(makeLocals(CLAIMS, supabaseThatFails()), new URL('http://localhost/create'))
		).rejects.toThrow('connection lost');
	});
});

// ---------------------------------------------------------------------------
// The check every page under `/manage/[slug]` starts with
// ---------------------------------------------------------------------------
// `requirePermission` runs `requireOnboarded`, finds the conference by its slug
// and then asks the database's `has_permission` helper. These tests are about
// what it does with each of those answers. The helper itself is tested in
// `tests/db/conference-roles.test.ts`.

/** A profile that has finished the welcome page, so the onboarding check passes. */
const ONBOARDED_PROFILE = { onboarding_completed_at: '2026-03-01T10:00:00Z' };

/**
 * One row of the conference view, with only the columns these tests read.
 *
 * Turning a whole row into a `Conference` belongs to `conferences.test.ts`,
 * which owns `getConferenceBySlug`. `committees` is rows of another table and
 * always comes back as a list, which is why it is one here.
 */
function draftConferenceRow() {
	return {
		id: 'conference-1',
		slug: 'thimun-2027',
		name: 'THIMUN The Hague 2027',
		country_code: 'NL',
		start_time: null,
		end_time: null,
		status: 'draft',
		committees: []
	};
}

/** What the stand-in below should answer with. Everything has a harmless default. */
type ManageAnswers = {
	/** The profile row, which decides whether the onboarding check lets the reader on. */
	profile?: { onboarding_completed_at: string | null } | null;
	/** The conference found by slug, or `null` when there is none this reader may read. */
	conference?: unknown;
	/** The committee found by conference and slug, for `requireCommitteePermission`. */
	committee?: unknown;
	/** What `has_permission`, or `has_committee_permission` for a committee, answers. */
	canManage?: boolean;
	/** Whether that call fails instead of answering. */
	helperFails?: boolean;
	/** Answers for named helpers, for a check that asks more than one. Others answer `canManage`. */
	helperAnswers?: Record<string, boolean>;
};

/** What the stand-in wrote down: one entry per query, and one per helper call. */
type ManageCalls = {
	/** `[relation, [column, value][]]` for every query, in the order they were sent. */
	queries: [string, [string, unknown][]][];
	/** `[name, arguments]` for every `.rpc(...)`. */
	rpc: [string, unknown][];
};

/**
 * One step of a query on the stand-in below. Every step hands the builder back,
 * which is what lets the next step be called on it.
 */
type ManageBuilder = {
	select: () => ManageBuilder;
	eq: (column: string, value: unknown) => ManageBuilder;
	maybeSingle: () => { overrideTypes: () => Promise<{ data: unknown; error: null }> };
};

/**
 * A stand-in Supabase client for `requirePermission`, which reads two relations
 * and then asks one permission helper.
 *
 * Each relation answers with its own row, and both chains end the same way:
 * `maybeSingle()` for one row and then `overrideTypes()`, which changes the
 * type of the answer in the real client rather than the answer itself.
 */
function createManageStandIn(answers: ManageAnswers = {}): {
	supabase: SupabaseClient;
	calls: ManageCalls;
} {
	const calls: ManageCalls = { queries: [], rpc: [] };

	const rowsByTable: Record<string, unknown> = {
		// The onboarding gate reads the person's own row of `my_profile_state`.
		my_profile_state: answers.profile === undefined ? ONBOARDED_PROFILE : answers.profile,
		conferences_with_organization: answers.conference ?? null,
		committees: answers.committee ?? null
	};

	const supabase = {
		from: (table: string): ManageBuilder => {
			const filters: [string, unknown][] = [];
			calls.queries.push([table, filters]);

			const builder: ManageBuilder = {
				select: () => builder,
				eq: (column: string, value: unknown) => {
					filters.push([column, value]);
					return builder;
				},
				maybeSingle: () => ({
					overrideTypes: async () => ({ data: rowsByTable[table] ?? null, error: null })
				})
			};

			return builder;
		},
		rpc: async (name: string, helperArguments: unknown) => {
			calls.rpc.push([name, helperArguments]);

			if (answers.helperFails) {
				return { data: null, error: { message: 'permission denied' } };
			}

			return { data: answers.helperAnswers?.[name] ?? answers.canManage ?? false, error: null };
		}
	};

	return { supabase: supabase as unknown as SupabaseClient, calls };
}

/**
 * Run something that is expected to refuse, and give back what it threw.
 *
 * `error(...)` from SvelteKit works by throwing, the way `redirect` does, so
 * catching it is the only way to read the status it answered with.
 */
async function catchRefusal(run: () => unknown): Promise<{ status: number }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number };
	}

	throw new Error('Nothing was thrown, so nothing was refused.');
}

describe('requirePermission', () => {
	const MANAGE_URL = new URL('http://localhost/manage/thimun-2027');

	it('gives back the signed-in person and the conference', async () => {
		const { supabase } = createManageStandIn({
			conference: draftConferenceRow(),
			canManage: true
		});

		const { user, conference } = await requirePermission(
			makeLocals(CLAIMS, supabase),
			MANAGE_URL,
			'thimun-2027',
			'administrator'
		);

		expect(user).toEqual({ id: 'user-1', email: 'daniel@example.com' });
		expect(conference.id).toBe('conference-1');
	});

	it('opens a draft, because the lookup puts no status filter on the query', async () => {
		const { supabase, calls } = createManageStandIn({
			conference: draftConferenceRow(),
			canManage: true
		});

		const { conference } = await requirePermission(
			makeLocals(CLAIMS, supabase),
			MANAGE_URL,
			'thimun-2027',
			'administrator'
		);

		// A draft is the organisers' own workspace, and `/manage/[slug]` is where
		// they work on it before anybody else can see it.
		expect(conference.status).toBe('draft');
		expect(calls.queries[1]).toEqual(['conferences_with_organization', [['slug', 'thimun-2027']]]);
	});

	it('asks the database the helper its policies ask, about this permission', async () => {
		const { supabase, calls } = createManageStandIn({
			conference: draftConferenceRow(),
			canManage: true
		});

		await requirePermission(
			makeLocals(CLAIMS, supabase),
			MANAGE_URL,
			'thimun-2027',
			'administrator'
		);

		// `has_permission` is the helper the policies ask, so the page and the
		// database can never disagree about who belongs here.
		expect(calls.rpc).toEqual([
			['has_permission', { conference_id: 'conference-1', permission: 'administrator' }]
		]);
	});

	it('answers 404 when there is no conference with that slug', async () => {
		const { supabase, calls } = createManageStandIn({ conference: null });

		const refusal = await catchRefusal(() =>
			requirePermission(
				makeLocals(CLAIMS, supabase),
				MANAGE_URL,
				'no-such-conference',
				'administrator'
			)
		);

		expect(refusal.status).toBe(404);
		// There is no id to ask the helper about, so nothing is asked.
		expect(calls.rpc).toEqual([]);
	});

	it('answers 404 and never 403 when the person may not manage this conference', async () => {
		const { supabase } = createManageStandIn({
			conference: draftConferenceRow(),
			canManage: false
		});

		const refusal = await catchRefusal(() =>
			requirePermission(makeLocals(CLAIMS, supabase), MANAGE_URL, 'thimun-2027', 'administrator')
		);

		// A 403 would say "this conference exists and is not yours", which is how a
		// page becomes a way of finding out which private conferences there are.
		expect(refusal.status).toBe(404);
	});

	it('answers 404 when the helper itself fails, rather than letting the person in', async () => {
		const { supabase } = createManageStandIn({
			conference: draftConferenceRow(),
			canManage: true,
			helperFails: true
		});

		const refusal = await catchRefusal(() =>
			requirePermission(makeLocals(CLAIMS, supabase), MANAGE_URL, 'thimun-2027', 'administrator')
		);

		expect(refusal.status).toBe(404);
	});

	it('sends a visitor to the sign in page before looking anything up', async () => {
		const { supabase, calls } = createManageStandIn({
			conference: draftConferenceRow(),
			canManage: true
		});

		const redirect = await catchRedirect(() =>
			requirePermission(makeLocals(null, supabase), MANAGE_URL, 'thimun-2027', 'administrator')
		);

		expect(redirect.location).toBe('/login?next=%2Fmanage%2Fthimun-2027');
		expect(calls.queries).toEqual([]);
	});

	it('sends somebody who has not finished the welcome page there first', async () => {
		const { supabase } = createManageStandIn({
			profile: { onboarding_completed_at: null },
			conference: draftConferenceRow(),
			canManage: true
		});

		const redirect = await catchRedirect(() =>
			requirePermission(makeLocals(CLAIMS, supabase), MANAGE_URL, 'thimun-2027', 'administrator')
		);

		expect(redirect.location).toBe('/welcome?next=%2Fmanage%2Fthimun-2027');
	});
});

describe('requireTeamMember', () => {
	const MANAGE_URL = new URL('http://localhost/manage/thimun-2027');

	beforeEach(() => {
		vi.mocked(readMyPermissions).mockReset();
	});

	it('gives back the person, the conference and what they hold', async () => {
		vi.mocked(readMyPermissions).mockResolvedValue(ORGANISER_PERMISSIONS);
		const { supabase } = createManageStandIn({ conference: draftConferenceRow() });

		const { user, conference, permissions } = await requireTeamMember(
			makeLocals(CLAIMS, supabase),
			MANAGE_URL,
			'thimun-2027'
		);

		expect(user.id).toBe('user-1');
		expect(conference.id).toBe('conference-1');
		expect(permissions).toEqual(ORGANISER_PERMISSIONS);
		expect(readMyPermissions).toHaveBeenCalledWith(supabase, 'conference-1', 'user-1');
	});

	it('answers 404 to somebody whose permissions open no page', async () => {
		vi.mocked(readMyPermissions).mockResolvedValue(NO_PERMISSIONS);
		const { supabase } = createManageStandIn({ conference: draftConferenceRow() });

		const refusal = await catchRefusal(() =>
			requireTeamMember(makeLocals(CLAIMS, supabase), MANAGE_URL, 'thimun-2027')
		);

		expect(refusal.status).toBe(404);
	});

	it('answers 404 without reading permissions when there is no such conference', async () => {
		const { supabase } = createManageStandIn({ conference: null });

		const refusal = await catchRefusal(() =>
			requireTeamMember(makeLocals(CLAIMS, supabase), MANAGE_URL, 'no-such-conference')
		);

		expect(refusal.status).toBe(404);
		expect(readMyPermissions).not.toHaveBeenCalled();
	});
});

describe('requirePermissionAndRank', () => {
	const ROLES_URL = new URL('http://localhost/manage/thimun-2027/team/roles');

	beforeEach(() => {
		vi.mocked(readMyPermissions).mockReset();
	});

	it('gives back what the reader holds, rank and all, when they hold the permission', async () => {
		vi.mocked(readMyPermissions).mockResolvedValue(ORGANISER_PERMISSIONS);
		const { supabase } = createManageStandIn({ conference: draftConferenceRow() });

		const { conference, permissions } = await requirePermissionAndRank(
			makeLocals(CLAIMS, supabase),
			ROLES_URL,
			'thimun-2027',
			'manage_roles'
		);

		expect(conference.id).toBe('conference-1');
		expect(permissions).toEqual(ORGANISER_PERMISSIONS);
	});

	it('answers 404 to somebody without it', async () => {
		vi.mocked(readMyPermissions).mockResolvedValue(NO_PERMISSIONS);
		const { supabase } = createManageStandIn({ conference: draftConferenceRow() });

		const refusal = await catchRefusal(() =>
			requirePermissionAndRank(
				makeLocals(CLAIMS, supabase),
				ROLES_URL,
				'thimun-2027',
				'manage_roles'
			)
		);

		expect(refusal.status).toBe(404);
	});
});

describe('requirePermissionSomewhere', () => {
	const ANNOUNCEMENTS_URL = new URL('http://localhost/manage/thimun-2027/announcements');
	const CHAIR_PERMISSIONS: MyPermissions = {
		held: [{ permission: 'send_announcements', scope: 'committees' }],
		committeeIds: ['committee-1'],
		rank: 3
	};

	beforeEach(() => {
		vi.mocked(readMyPermissions).mockReset();
	});

	it('lets in somebody holding the permission only in their committees', async () => {
		vi.mocked(readMyPermissions).mockResolvedValue(CHAIR_PERMISSIONS);
		const { supabase } = createManageStandIn({ conference: draftConferenceRow() });

		const { permissions } = await requirePermissionSomewhere(
			makeLocals(CLAIMS, supabase),
			ANNOUNCEMENTS_URL,
			'thimun-2027',
			'send_announcements'
		);

		expect(permissions).toEqual(CHAIR_PERMISSIONS);
	});

	it('answers 404 to somebody holding it nowhere', async () => {
		vi.mocked(readMyPermissions).mockResolvedValue(CHAIR_PERMISSIONS);
		const { supabase } = createManageStandIn({ conference: draftConferenceRow() });

		const refusal = await catchRefusal(() =>
			requirePermissionSomewhere(
				makeLocals(CLAIMS, supabase),
				ANNOUNCEMENTS_URL,
				'thimun-2027',
				'edit_schedule'
			)
		);

		expect(refusal.status).toBe(404);
	});
});

describe('requireManagePage', () => {
	it('lets through somebody whose permissions open the page', () => {
		expect(() => requireManagePage(ORGANISER_PERMISSIONS, 'fees')).not.toThrow();
	});

	it('answers 404 to somebody whose permissions do not', async () => {
		const refusal = await catchRefusal(() => requireManagePage(NO_PERMISSIONS, 'fees'));

		expect(refusal.status).toBe(404);
	});
});

describe('requireCommitteeTool', () => {
	const tools = { mayReviewPapers: true, mayWriteNotes: false, mayProposeAwards: false };

	it('lets through a reader who may open the page', () => {
		expect(() => requireCommitteeTool(tools, 'mayReviewPapers')).not.toThrow();
	});

	it('answers 404 to a co-chair who only runs the room', async () => {
		const refusal = await catchRefusal(() => requireCommitteeTool(tools, 'mayWriteNotes'));

		expect(refusal.status).toBe(404);
	});
});

// ---------------------------------------------------------------------------
// The two checks `/manage/organizations/[orgSlug]` starts with
// ---------------------------------------------------------------------------
// `requireOrganizationMember` runs `requireOnboarded`, finds the organisation
// by its slug and then reads the reader's own membership row.
// `requireOrganizationAdmin` is that plus one question about the role it found.
//
// Everybody may *read* an organisation (its select policy is open to
// everybody), so finding the row
// says nothing about whether this reader belongs on the page. The membership is
// what decides, and somebody without one gets the same 404 as somebody asking
// for a slug nobody has. Which memberships Row Level Security hands over at all
// is tested in `tests/db/organizations.test.ts`.

/** One `organizations` row, with only the columns these tests read. */
function organizationRow() {
	return {
		id: 'organization-1',
		slug: 'thimun-foundation',
		name: 'THIMUN Foundation',
		description: null,
		country_code: 'NL',
		website_url: null,
		logo_path: null,
		stripe_account_id: null,
		stripe_onboarding_completed_at: null
	};
}

/** What the stand-in below should answer with. Everything has a harmless default. */
type OrganizationAnswers = {
	/** The profile row, which decides whether the onboarding check lets the reader on. */
	profile?: { onboarding_completed_at: string | null } | null;
	/** The organisation found by slug, or `null` when there is no such slug. */
	organization?: unknown;
	/** The reader's own membership row, or `null` when they are not a member. */
	membership?: { role: string } | null;
};

/**
 * A stand-in Supabase client for the two checks below, which read three
 * relations one after another.
 *
 * Every chain ends the same way as the ones `createManageStandIn` above
 * answers: `maybeSingle()` for one row and then `overrideTypes()`, which
 * changes the type of the answer in the real client rather than the answer
 * itself.
 */
function createOrganizationStandIn(answers: OrganizationAnswers = {}): SupabaseClient {
	const rowsByTable: Record<string, unknown> = {
		my_profile_state: answers.profile === undefined ? ONBOARDED_PROFILE : answers.profile,
		organizations: answers.organization === undefined ? organizationRow() : answers.organization,
		organization_members: answers.membership === undefined ? { role: 'owner' } : answers.membership
	};

	const supabase = {
		from: (table: string): ManageBuilder => {
			const builder: ManageBuilder = {
				select: () => builder,
				eq: () => builder,
				maybeSingle: () => ({
					overrideTypes: async () => ({ data: rowsByTable[table] ?? null, error: null })
				})
			};

			return builder;
		}
	};

	return supabase as unknown as SupabaseClient;
}

describe('requireOrganizationMember', () => {
	const SETTINGS_URL = new URL('http://localhost/manage/organizations/thimun-foundation');

	it('gives back the reader, the organisation and their role in it', async () => {
		const { user, organization, myRole } = await requireOrganizationMember(
			makeLocals(CLAIMS, createOrganizationStandIn({ membership: { role: 'admin' } })),
			SETTINGS_URL,
			'thimun-foundation'
		);

		expect(user).toEqual({ id: 'user-1', email: 'daniel@example.com' });
		expect(organization.slug).toBe('thimun-foundation');
		expect(myRole).toBe('admin');
	});

	it('lets a plain member through, because the page is read-only for them', async () => {
		const { myRole } = await requireOrganizationMember(
			makeLocals(CLAIMS, createOrganizationStandIn({ membership: { role: 'member' } })),
			SETTINGS_URL,
			'thimun-foundation'
		);

		expect(myRole).toBe('member');
	});

	it('sends a visitor to the sign in page before reading anything', async () => {
		const redirect = await catchRedirect(() =>
			requireOrganizationMember(makeLocals(null), SETTINGS_URL, 'thimun-foundation')
		);

		expect(redirect.location).toBe('/login?next=%2Fmanage%2Forganizations%2Fthimun-foundation');
	});

	it('answers 404 for a slug nobody has', async () => {
		const refusal = await catchRefusal(() =>
			requireOrganizationMember(
				makeLocals(CLAIMS, createOrganizationStandIn({ organization: null })),
				SETTINGS_URL,
				'no-such-organisation'
			)
		);

		expect(refusal.status).toBe(404);
	});

	// The same 404, so that the page cannot be used to find out which
	// organisations exist and who runs them. Never a 403.
	it('answers the same 404 for somebody who is not a member', async () => {
		const refusal = await catchRefusal(() =>
			requireOrganizationMember(
				makeLocals(CLAIMS, createOrganizationStandIn({ membership: null })),
				SETTINGS_URL,
				'thimun-foundation'
			)
		);

		expect(refusal.status).toBe(404);
	});
});

describe('requireOrganizationAdmin', () => {
	const SETTINGS_URL = new URL('http://localhost/manage/organizations/thimun-foundation');

	it('lets an owner through', async () => {
		const { myRole } = await requireOrganizationAdmin(
			makeLocals(CLAIMS, createOrganizationStandIn({ membership: { role: 'owner' } })),
			SETTINGS_URL,
			'thimun-foundation'
		);

		expect(myRole).toBe('owner');
	});

	it('lets an admin through', async () => {
		const { myRole } = await requireOrganizationAdmin(
			makeLocals(CLAIMS, createOrganizationStandIn({ membership: { role: 'admin' } })),
			SETTINGS_URL,
			'thimun-foundation'
		);

		expect(myRole).toBe('admin');
	});

	// A plain member may read the page and none of its forms, so an action they
	// post anyway is refused the way a stranger is.
	it('answers 404 for a plain member', async () => {
		const refusal = await catchRefusal(() =>
			requireOrganizationAdmin(
				makeLocals(CLAIMS, createOrganizationStandIn({ membership: { role: 'member' } })),
				SETTINGS_URL,
				'thimun-foundation'
			)
		);

		expect(refusal.status).toBe(404);
	});

	it('answers 404 for somebody who is not a member at all', async () => {
		const refusal = await catchRefusal(() =>
			requireOrganizationAdmin(
				makeLocals(CLAIMS, createOrganizationStandIn({ membership: null })),
				SETTINGS_URL,
				'thimun-foundation'
			)
		);

		expect(refusal.status).toBe(404);
	});
});

// ---------------------------------------------------------------------------
// The two checks the pages under `/delegations/[delegationId]` start with
// ---------------------------------------------------------------------------
// `requireDelegationMember` runs `requireOnboarded` and then asks
// `getDelegationForMember` in `./delegations.ts` for the delegation, its
// conference and the reader's own role. `requireDelegationHead` is that plus
// one question about the role it found.
//
// Both ways of not belonging — no such delegation, and a delegation this
// reader is not in — are the same 404, so the page cannot be used to find out
// which delegations exist. That includes the organisers of the conference, who
// *can* read the row and read a delegation on their own review page instead.
// Which rows Row Level Security hands over at all is tested in
// `tests/db/delegations.test.ts`.

/** One `delegations` row, with the conference its `!inner` embed brings along. */
function delegationRow() {
	return {
		id: 'delegation-1',
		conference_id: 'conference-1',
		name: 'Lycee Francais Delegation',
		institution_name: 'Lycee Francais de La Haye',
		country_code: 'FR',
		status: 'submitted',
		requested_seats: 12,
		note: null,
		join_code: 'H7KP3QWX',
		submitted_at: '2026-10-03T09:00:00Z',
		decided_at: null,
		decision_note: null,
		conferences: {
			id: 'conference-1',
			slug: 'thimun-2027',
			name: 'THIMUN The Hague 2027',
			start_date: '2027-01-24',
			end_date: '2027-01-29',
			timezone: 'Europe/Amsterdam',
			status: 'published',
			accepts_delegations: true,
			applications_open_at: null,
			applications_close_at: null
		}
	};
}

/** What the stand-in below should answer with. Everything has a harmless default. */
type DelegationAnswers = {
	/** The profile row, which decides whether the onboarding check lets the reader on. */
	profile?: { onboarding_completed_at: string | null } | null;
	/** The delegation found by id, or `null` when there is none this reader may read. */
	delegation?: unknown;
	/** The reader's own membership row, or `null` when they are in this delegation. */
	membership?: { role: string } | null;
};

/**
 * A stand-in Supabase client for the two checks below, which read three
 * relations.
 *
 * Every chain ends the same way as the ones `createOrganizationStandIn` above
 * answers: `maybeSingle()` for one row and then `overrideTypes()`, which
 * changes the type of the answer in the real client rather than the answer
 * itself.
 */
function createDelegationStandIn(answers: DelegationAnswers = {}): SupabaseClient {
	const rowsByTable: Record<string, unknown> = {
		my_profile_state: answers.profile === undefined ? ONBOARDED_PROFILE : answers.profile,
		delegations: answers.delegation === undefined ? delegationRow() : answers.delegation,
		delegation_members: answers.membership === undefined ? { role: 'head' } : answers.membership
	};

	const supabase = {
		from: (table: string): ManageBuilder => {
			const builder: ManageBuilder = {
				select: () => builder,
				eq: () => builder,
				maybeSingle: () => ({
					overrideTypes: async () => ({ data: rowsByTable[table] ?? null, error: null })
				})
			};

			return builder;
		}
	};

	return supabase as unknown as SupabaseClient;
}

describe('requireDelegationMember', () => {
	const DASHBOARD_URL = new URL('http://localhost/delegations/delegation-1');

	it('gives back the reader, the delegation, its conference and their role', async () => {
		const { user, delegation, conference, myRole } = await requireDelegationMember(
			makeLocals(CLAIMS, createDelegationStandIn({ membership: { role: 'member' } })),
			DASHBOARD_URL,
			'delegation-1'
		);

		expect(user).toEqual({ id: 'user-1', email: 'daniel@example.com' });
		expect(delegation.name).toBe('Lycee Francais Delegation');
		expect(conference.slug).toBe('thimun-2027');
		expect(myRole).toBe('member');
	});

	it('sends a visitor to the sign in page before reading anything', async () => {
		const redirect = await catchRedirect(() =>
			requireDelegationMember(makeLocals(null), DASHBOARD_URL, 'delegation-1')
		);

		expect(redirect.location).toBe('/login?next=%2Fdelegations%2Fdelegation-1');
	});

	it('sends somebody who has not finished the welcome page there first', async () => {
		const redirect = await catchRedirect(() =>
			requireDelegationMember(
				makeLocals(CLAIMS, createDelegationStandIn({ profile: { onboarding_completed_at: null } })),
				DASHBOARD_URL,
				'delegation-1'
			)
		);

		expect(redirect.location).toBe('/welcome?next=%2Fdelegations%2Fdelegation-1');
	});

	it('answers 404 for an id nobody has', async () => {
		const refusal = await catchRefusal(() =>
			requireDelegationMember(
				makeLocals(CLAIMS, createDelegationStandIn({ delegation: null })),
				DASHBOARD_URL,
				'no-such-delegation'
			)
		);

		expect(refusal.status).toBe(404);
	});

	// The same 404, and never a 403, which is the rule for the whole app.
	it('answers the same 404 for somebody who is not in this delegation', async () => {
		const refusal = await catchRefusal(() =>
			requireDelegationMember(
				makeLocals(CLAIMS, createDelegationStandIn({ membership: null })),
				DASHBOARD_URL,
				'delegation-1'
			)
		);

		expect(refusal.status).toBe(404);
	});
});

describe('requireDelegationHead', () => {
	const DASHBOARD_URL = new URL('http://localhost/delegations/delegation-1');

	it('lets a head through', async () => {
		const { myRole } = await requireDelegationHead(
			makeLocals(CLAIMS, createDelegationStandIn({ membership: { role: 'head' } })),
			DASHBOARD_URL,
			'delegation-1'
		);

		expect(myRole).toBe('head');
	});

	// A member may read the dashboard and none of its three forms, so an action
	// they post anyway is refused the way a stranger is.
	it('answers 404 for a plain member', async () => {
		const refusal = await catchRefusal(() =>
			requireDelegationHead(
				makeLocals(CLAIMS, createDelegationStandIn({ membership: { role: 'member' } })),
				DASHBOARD_URL,
				'delegation-1'
			)
		);

		expect(refusal.status).toBe(404);
	});

	it('answers 404 for somebody who is in no delegation at all', async () => {
		const refusal = await catchRefusal(() =>
			requireDelegationHead(
				makeLocals(CLAIMS, createDelegationStandIn({ membership: null })),
				DASHBOARD_URL,
				'delegation-1'
			)
		);

		expect(refusal.status).toBe(404);
	});
});

// ---------------------------------------------------------------------------
// The check every chair page starts with
// ---------------------------------------------------------------------------
// `requireCommitteePermission` finds the conference, then the committee inside
// it, then asks `has_committee_permission`, which says yes to somebody holding
// the permission on the whole conference and to somebody assigned to the
// committee with a role that applies per committee. The helper itself is
// tested in `tests/db/conference-roles.test.ts`.

/** One committee row, with the columns `getChairCommittee` reads. */
function committeeRow() {
	return {
		id: 'committee-1',
		slug: 'unsc',
		name: 'Security Council',
		abbreviation: 'UNSC',
		room: 'Room 1',
		default_speaking_time_seconds: 60,
		topics: ['Climate finance']
	};
}

describe('requireCommitteePermission', () => {
	const CHAIR_URL = new URL('http://localhost/conferences/thimun-2027/committees/unsc/chair');

	it('gives back the person, the conference and the committee to a holder', async () => {
		const { supabase, calls } = createManageStandIn({
			conference: draftConferenceRow(),
			committee: committeeRow(),
			canManage: true
		});

		const { user, conference, committee } = await requireCommitteePermission(
			makeLocals(CLAIMS, supabase),
			CHAIR_URL,
			'thimun-2027',
			'unsc',
			'run_room'
		);

		expect(user.id).toBe('user-1');
		expect(conference.id).toBe('conference-1');
		expect(committee).toEqual({
			id: 'committee-1',
			slug: 'unsc',
			name: 'Security Council',
			abbreviation: 'UNSC',
			room: 'Room 1',
			defaultSpeakingTimeSeconds: 60,
			topics: ['Climate finance']
		});
		// The committee is looked for inside this conference, not by its slug alone.
		expect(calls.queries[2]).toEqual([
			'committees',
			[
				['conference_id', 'conference-1'],
				['slug', 'unsc']
			]
		]);
		expect(calls.rpc).toEqual([
			['has_committee_permission', { committee_id: 'committee-1', permission: 'run_room' }]
		]);
	});

	it('answers 404 to somebody signed in without the permission in the committee', async () => {
		const { supabase } = createManageStandIn({
			conference: draftConferenceRow(),
			committee: committeeRow(),
			canManage: false
		});

		const refusal = await catchRefusal(() =>
			requireCommitteePermission(
				makeLocals(CLAIMS, supabase),
				CHAIR_URL,
				'thimun-2027',
				'unsc',
				'run_room'
			)
		);

		expect(refusal.status).toBe(404);
	});

	it('answers 404 when the helper fails, rather than letting the person in', async () => {
		const { supabase } = createManageStandIn({
			conference: draftConferenceRow(),
			committee: committeeRow(),
			canManage: true,
			helperFails: true
		});

		const refusal = await catchRefusal(() =>
			requireCommitteePermission(
				makeLocals(CLAIMS, supabase),
				CHAIR_URL,
				'thimun-2027',
				'unsc',
				'run_room'
			)
		);

		expect(refusal.status).toBe(404);
	});

	it('answers 404 without asking the helper when there is no such committee', async () => {
		const { supabase, calls } = createManageStandIn({
			conference: draftConferenceRow(),
			committee: null,
			canManage: true
		});

		const refusal = await catchRefusal(() =>
			requireCommitteePermission(
				makeLocals(CLAIMS, supabase),
				CHAIR_URL,
				'thimun-2027',
				'no-such-committee',
				'run_room'
			)
		);

		expect(refusal.status).toBe(404);
		expect(calls.rpc).toEqual([]);
	});

	it('answers 404 when there is no such conference', async () => {
		const { supabase } = createManageStandIn({ conference: null, canManage: true });

		const refusal = await catchRefusal(() =>
			requireCommitteePermission(
				makeLocals(CLAIMS, supabase),
				CHAIR_URL,
				'no-such-conference',
				'unsc',
				'run_room'
			)
		);

		expect(refusal.status).toBe(404);
	});

	it('sends a visitor to the sign in page with the chair page to come back to', async () => {
		const { supabase, calls } = createManageStandIn({
			conference: draftConferenceRow(),
			committee: committeeRow(),
			canManage: true
		});

		const redirect = await catchRedirect(() =>
			requireCommitteePermission(
				makeLocals(null, supabase),
				CHAIR_URL,
				'thimun-2027',
				'unsc',
				'run_room'
			)
		);

		expect(redirect.location).toBe(
			'/login?next=%2Fconferences%2Fthimun-2027%2Fcommittees%2Funsc%2Fchair'
		);
		expect(calls.queries).toEqual([]);
	});
});

describe('requireRoomWatcher', () => {
	const LIVE_URL = new URL('http://localhost/conferences/thimun-2027/committees/unsc/live');

	/** Run the check with the two helpers answering `isDelegate` and `isStaff`. */
	async function watchAs(isDelegate: boolean, isStaff: boolean) {
		const standIn = createManageStandIn({
			conference: draftConferenceRow(),
			committee: committeeRow(),
			helperAnswers: { is_committee_delegate: isDelegate, is_conference_staff: isStaff }
		});
		const run = () =>
			requireRoomWatcher(makeLocals(CLAIMS, standIn.supabase), LIVE_URL, 'thimun-2027', 'unsc');

		return { run, calls: standIn.calls };
	}

	it('lets in a delegate of the committee, asking both helpers', async () => {
		const { run, calls } = await watchAs(true, false);

		const { committee } = await run();

		expect(committee.id).toBe('committee-1');
		expect(calls.rpc).toEqual([
			['is_committee_delegate', { committee_id: 'committee-1' }],
			['is_conference_staff', { conference_id: 'conference-1' }]
		]);
	});

	it('lets in anybody on the conference staff', async () => {
		const { run } = await watchAs(false, true);

		const { conference } = await run();

		expect(conference.id).toBe('conference-1');
	});

	it('answers 404 to somebody who is neither', async () => {
		const { run } = await watchAs(false, false);

		const refusal = await catchRefusal(run);

		expect(refusal.status).toBe(404);
	});

	it('answers 404 when the helpers fail, rather than letting the person in', async () => {
		const { supabase } = createManageStandIn({
			conference: draftConferenceRow(),
			committee: committeeRow(),
			canManage: true,
			helperFails: true
		});

		const refusal = await catchRefusal(() =>
			requireRoomWatcher(makeLocals(CLAIMS, supabase), LIVE_URL, 'thimun-2027', 'unsc')
		);

		expect(refusal.status).toBe(404);
	});

	it('answers 404 without asking when there is no such committee', async () => {
		const { supabase, calls } = createManageStandIn({
			conference: draftConferenceRow(),
			committee: null,
			canManage: true
		});

		const refusal = await catchRefusal(() =>
			requireRoomWatcher(makeLocals(CLAIMS, supabase), LIVE_URL, 'thimun-2027', 'nothing')
		);

		expect(refusal.status).toBe(404);
		expect(calls.rpc).toEqual([]);
	});

	it('sends a visitor to sign in with the live view to come back to', async () => {
		const { supabase } = createManageStandIn({ conference: draftConferenceRow() });

		const redirect = await catchRedirect(() =>
			requireRoomWatcher(makeLocals(null, supabase), LIVE_URL, 'thimun-2027', 'unsc')
		);

		expect(redirect.location).toBe(
			'/login?next=%2Fconferences%2Fthimun-2027%2Fcommittees%2Funsc%2Flive'
		);
	});
});

describe('askHasPermission', () => {
	it('asks the database helper about this conference and passes on its answer', async () => {
		const { supabase, calls } = createManageStandIn({ canManage: true });

		expect(await askHasPermission(supabase, 'conference-1', 'read_invoices')).toBe(true);
		expect(calls.rpc).toEqual([
			['has_permission', { conference_id: 'conference-1', permission: 'read_invoices' }]
		]);
	});

	it('answers false when the reader does not hold it', async () => {
		const { supabase } = createManageStandIn({ canManage: false });

		expect(await askHasPermission(supabase, 'conference-1', 'read_invoices')).toBe(false);
	});

	it('answers false, the safe direction, when the helper fails', async () => {
		const { supabase } = createManageStandIn({ helperFails: true });

		expect(await askHasPermission(supabase, 'conference-1', 'read_invoices')).toBe(false);
	});
});

describe('askHasPermissionOrThrow', () => {
	it('passes on the database helper’s answer, yes or no', async () => {
		const yes = createManageStandIn({ canManage: true });
		const no = createManageStandIn({ canManage: false });

		expect(await askHasPermissionOrThrow(yes.supabase, 'conference-1', 'manage_committees')).toBe(
			true
		);
		expect(await askHasPermissionOrThrow(no.supabase, 'conference-1', 'manage_committees')).toBe(
			false
		);
	});

	it('throws when the helper fails, rather than answering no', async () => {
		const { supabase } = createManageStandIn({ helperFails: true });

		await expect(
			askHasPermissionOrThrow(supabase, 'conference-1', 'manage_committees')
		).rejects.toThrow('Could not check your permissions');
	});
});
