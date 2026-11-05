import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	copyBrandingInto,
	countDraftFacts,
	createCreationDraft,
	findPreviousConference,
	getCreationDraft,
	getCreationOrganization,
	listCreationOrganizations,
	publishDraft,
	setCreationStep,
	startCreationDraft,
	updateCreationDraft
} from './creation';
import { prefillDraft } from '$lib/creation-prefill';

// These tests are about the decisions this module makes: which rows it asks
// for, how it turns them into the shapes the steps read, and what it writes.
// Nothing here talks to a database; the stand-in client below writes down
// every call and answers each table with fixed rows. Whether the database lets
// somebody read and write a draft is Row Level Security's decision, tested in
// `tests/db/conference-creation.test.ts`.

/** One query: the table it went to and every call made on it, in order. */
type RecordedQuery = { table: string; calls: [string, ...unknown[]][] };

type Answer = { data: unknown; error: { message: string } | null };

/**
 * A stand-in client. `answers[table]` is the list of answers that table gives,
 * one per query, the last one repeated once the list runs out.
 */
function createStandIn(
	answers: Record<string, Answer[]> = {},
	storageAnswer: (from: string, to: string) => Answer = () => ({ data: {}, error: null })
) {
	const queries: RecordedQuery[] = [];
	const copies: [string, string][] = [];
	const asked: Record<string, number> = {};

	function from(table: string) {
		const query: RecordedQuery = { table, calls: [] };
		queries.push(query);
		const index = asked[table] ?? 0;
		asked[table] = index + 1;
		const list = answers[table] ?? [{ data: [], error: null }];
		const answer = list[Math.min(index, list.length - 1)];

		// Every call is written down and hands the same builder back, and the
		// builder can be awaited at any point, which is how the real one works.
		const builder: Record<string, unknown> = {
			then: (resolve: (value: Answer) => void) => resolve(answer)
		};
		for (const method of [
			'select',
			'insert',
			'update',
			'eq',
			'neq',
			'in',
			'order',
			'limit',
			'maybeSingle',
			'single',
			'overrideTypes'
		]) {
			builder[method] = (...args: unknown[]) => {
				query.calls.push([method, ...args]);
				return builder;
			};
		}
		return builder;
	}

	const storage = {
		from: (bucket: string) => ({
			copy: async (fromPath: string, toPath: string) => {
				copies.push([`${bucket}:${fromPath}`, toPath]);
				return storageAnswer(fromPath, toPath);
			}
		})
	};

	const supabase = { from, storage } as unknown as SupabaseClient;

	return { supabase, queries, copies };
}

/** The arguments of every call of one kind on a query. */
function callsOf(query: RecordedQuery, method: string): unknown[][] {
	return query.calls.filter((call) => call[0] === method).map((call) => call.slice(1));
}

const organizationRow = {
	id: 'org-b',
	slug: 'b',
	name: 'Beta MUN',
	city: 'Delft',
	country_code: 'NL',
	logo_path: 'organizations/org-b/logo.png',
	website_url: null,
	is_personal: false,
	stripe_onboarding_completed_at: null
};

describe('listCreationOrganizations', () => {
	it('leaves out personal organisations, sorts by name and finds the latest conference', async () => {
		const { supabase, queries } = createStandIn({
			organization_members: [
				{
					data: [
						{ organizations: organizationRow },
						{ organizations: { ...organizationRow, id: 'org-a', name: 'Alpha MUN' } },
						{ organizations: { ...organizationRow, id: 'me', name: 'Me', is_personal: true } },
						{ organizations: null }
					],
					error: null
				}
			],
			conferences: [
				{
					data: [
						{
							organization_id: 'org-b',
							name: 'Beta 2026',
							start_date: '2026-04-17',
							end_date: '2026-04-19'
						},
						{
							organization_id: 'org-b',
							name: 'Beta 2025',
							start_date: '2025-04-18',
							end_date: '2025-04-20'
						}
					],
					error: null
				}
			]
		});

		const organizations = await listCreationOrganizations(supabase, 'user-1');

		expect(organizations.map((organization) => organization.name)).toEqual([
			'Alpha MUN',
			'Beta MUN'
		]);
		expect(organizations[1].lastConference?.name).toBe('Beta 2026');
		expect(organizations[1].countryName).toBe('Netherlands');
		expect(organizations[0].lastConference).toBeNull();

		const conferences = queries.find((query) => query.table === 'conferences')!;
		expect(callsOf(conferences, 'neq')).toEqual([['status', 'draft']]);
		expect(callsOf(conferences, 'in')).toEqual([['organization_id', ['org-b', 'org-a']]]);
	});
});

describe('getCreationOrganization', () => {
	it('answers null for an organisation it cannot see', async () => {
		const { supabase } = createStandIn({ organizations: [{ data: null, error: null }] });

		expect(await getCreationOrganization(supabase, 'org-x')).toBeNull();
	});

	it('reads one organisation with its Stripe state', async () => {
		const { supabase } = createStandIn({
			organizations: [
				{
					data: { ...organizationRow, stripe_onboarding_completed_at: '2026-01-01T00:00:00Z' },
					error: null
				}
			]
		});

		const organization = await getCreationOrganization(supabase, 'org-b');
		expect(organization?.isStripeConnected).toBe(true);
	});
});

const previousRow = {
	id: 'conf-1',
	slug: 'beta-2026',
	name: 'Beta MUN 2026',
	start_date: '2026-04-17',
	end_date: '2026-04-19',
	conference_time_status: 'known',
	start_time: '09:30:00',
	end_time: '18:00:00',
	timezone: 'Europe/Amsterdam',
	location_mode: 'in_person',
	city: 'Delft',
	country_code: 'NL',
	venue_status: 'known',
	venue_name: 'Aula',
	venue_address: null,
	banner_path: null,
	logo_path: null,
	tagline: null,
	description: null,
	contact_email: null,
	website_url: null,
	instagram_url: null,
	currency: 'EUR',
	level: 'university',
	collects_payments_manually: false,
	accepts_individual_applications: true,
	accepts_delegations: true,
	committee_preference_count: 3,
	ask_motivation: false,
	position_paper_required: false,
	application_close_rule: 'relative',
	application_close_offset_days: -14,
	committees: [{ count: 5 }],
	application_questions: [{ count: 2 }],
	fees: [
		{
			id: 'f2',
			name: 'Late',
			amount_cents: 4500,
			applies_to: 'individual',
			description: null,
			position: 2
		},
		{
			id: 'f1',
			name: 'Early',
			amount_cents: 3500,
			applies_to: 'individual',
			description: null,
			position: 1
		}
	]
};

describe('findPreviousConference', () => {
	it('asks for the latest published full conference, leaving out the draft', async () => {
		const { supabase, queries } = createStandIn({
			conferences: [{ data: previousRow, error: null }]
		});

		const previous = await findPreviousConference(supabase, 'org-b', 'draft-1');

		expect(previous?.committeeCount).toBe(5);
		expect(previous?.questionCount).toBe(2);
		expect(previous?.startTime).toBe('09:30');
		expect(previous?.fees.map((fee) => fee.name)).toEqual(['Early', 'Late']);

		const [query] = queries;
		expect(callsOf(query, 'eq')).toEqual([
			['organization_id', 'org-b'],
			['kind', 'conference']
		]);
		expect(callsOf(query, 'in')).toEqual([['status', ['published', 'archived']]]);
		expect(callsOf(query, 'neq')).toEqual([['id', 'draft-1']]);
		expect(callsOf(query, 'order')).toEqual([['start_date', { ascending: false }]]);
	});

	it('answers null when there is none', async () => {
		const { supabase, queries } = createStandIn({ conferences: [{ data: null, error: null }] });

		expect(await findPreviousConference(supabase, 'org-b', null)).toBeNull();
		expect(callsOf(queries[0], 'neq')).toEqual([]);
	});
});

describe('getCreationDraft', () => {
	it('reads a draft and keeps only real sources', async () => {
		const { supabase } = createStandIn({
			conferences: [
				{
					data: {
						...previousRow,
						organization_id: 'org-b',
						status: 'draft',
						creation_step: 'when',
						fee_status: 'undecided',
						application_open_mode: 'manual',
						applications_open_at: null,
						applications_close_at: null,
						prefill_sources: { name: 'user', city: 'nonsense' },
						updated_at: '2026-10-04T10:00:00Z'
					},
					error: null
				}
			]
		});

		const draft = await getCreationDraft(supabase, 'beta-2026');

		expect(draft?.creationStep).toBe('when');
		expect(draft?.prefillSources).toEqual({ name: 'user' });
		expect(draft?.countryName).toBe('Netherlands');
	});
});

describe('createCreationDraft', () => {
	it('inserts a draft at Basics with its values and sources, under a slug of its name', async () => {
		const { supabase, queries } = createStandIn({ conferences: [{ data: null, error: null }] });
		const prefill = prefillDraft({
			organization: {
				id: 'org-b',
				slug: 'b',
				name: 'Beta MUN',
				city: null,
				countryCode: null,
				countryName: null,
				logoPath: null,
				websiteUrl: null,
				isStripeConnected: false,
				lastConference: null
			},
			previous: null,
			now: new Date('2026-10-04T12:00:00Z')
		});

		const slug = await createCreationDraft(supabase, {
			organizationId: 'org-b',
			userId: 'user-1',
			...prefill
		});

		expect(slug).toMatch(/^beta-mun-/);
		const [row] = callsOf(queries[0], 'insert')[0] as Record<string, unknown>[];
		expect(row).toMatchObject({
			name: 'Beta MUN',
			slug,
			status: 'draft',
			creation_step: 'basics',
			organization_id: 'org-b',
			created_by: 'user-1',
			venue_status: 'tba',
			application_open_mode: 'manual',
			prefill_sources: prefill.sources
		});
	});

	it('raises the database refusal', async () => {
		const { supabase } = createStandIn({
			conferences: [{ data: null, error: { message: 'denied' } }]
		});
		const prefill = prefillDraft({
			organization: {
				id: 'o',
				slug: 'o',
				name: 'O',
				city: null,
				countryCode: null,
				countryName: null,
				logoPath: null,
				websiteUrl: null,
				isStripeConnected: false,
				lastConference: null
			},
			previous: null,
			now: new Date()
		});

		await expect(
			createCreationDraft(supabase, { organizationId: 'o', userId: 'u', ...prefill })
		).rejects.toThrow('denied');
	});
});

describe('updateCreationDraft and setCreationStep', () => {
	it('write the columns of the patch, the sources and the step', async () => {
		const { supabase, queries } = createStandIn();

		await updateCreationDraft(
			supabase,
			'draft-1',
			{ countryCode: 'BE', venueName: 'Hall' },
			{ country_code: 'user' }
		);
		await setCreationStep(supabase, 'draft-1', 'setup');

		expect(callsOf(queries[0], 'update')).toEqual([
			[{ country_code: 'BE', venue_name: 'Hall', prefill_sources: { country_code: 'user' } }]
		]);
		expect(callsOf(queries[0], 'eq')).toEqual([['id', 'draft-1']]);
		expect(callsOf(queries[1], 'update')).toEqual([[{ creation_step: 'setup' }]]);
	});
});

describe('copyBrandingInto', () => {
	it('copies the pictures into the draft folder', async () => {
		const { supabase, copies } = createStandIn();

		const copied = await copyBrandingInto(supabase, 'draft-1', {
			logoPath: 'organizations/o/logo.PNG',
			bannerPath: null
		});

		expect(copied).toEqual({ logoPath: 'conferences/draft-1/logo.png', bannerPath: null });
		expect(copies).toEqual([
			['public-media:organizations/o/logo.PNG', 'conferences/draft-1/logo.png']
		]);
	});

	it('never throws, and answers null for a picture it could not copy', async () => {
		const { supabase } = createStandIn({}, (from) => {
			if (from.includes('banner')) {
				throw new Error('network');
			}
			return { data: null, error: { message: 'not found' } };
		});

		expect(
			await copyBrandingInto(supabase, 'draft-1', {
				logoPath: 'a/logo.png',
				bannerPath: 'b/banner.jpg'
			})
		).toEqual({ logoPath: null, bannerPath: null });
	});
});

describe('startCreationDraft', () => {
	const draftRow = {
		...previousRow,
		id: 'draft-1',
		organization_id: 'org-b',
		status: 'draft',
		creation_step: 'basics',
		fee_status: 'undecided',
		application_open_mode: 'manual',
		applications_open_at: null,
		applications_close_at: null,
		prefill_sources: { name: 'organization' },
		updated_at: '2026-10-04T10:00:00Z'
	};

	function prefillWithPictures() {
		const prefill = prefillDraft({
			organization: {
				id: 'org-b',
				slug: 'b',
				name: 'Beta MUN',
				city: null,
				countryCode: null,
				countryName: null,
				logoPath: 'organizations/org-b/logo.png',
				websiteUrl: null,
				isStripeConnected: false,
				lastConference: null
			},
			previous: null,
			now: new Date('2026-10-04T12:00:00Z')
		});
		return { organizationId: 'org-b', userId: 'user-1', ...prefill };
	}

	it('inserts without pictures, then copies the logo into the draft and saves it', async () => {
		const { supabase, queries, copies } = createStandIn({
			conferences: [
				{ data: null, error: null },
				{ data: draftRow, error: null },
				{ data: null, error: null }
			]
		});

		const slug = await startCreationDraft(supabase, prefillWithPictures());

		expect(slug).toMatch(/^beta-mun-/);
		const [row] = callsOf(queries[0], 'insert')[0] as Record<string, unknown>[];
		expect(row).toMatchObject({ logo_path: null, banner_path: null });
		expect((row.prefill_sources as Record<string, unknown>).logo_path).toBeUndefined();
		expect(copies).toEqual([
			['public-media:organizations/org-b/logo.png', 'conferences/draft-1/logo.png']
		]);
		const [patch] = callsOf(queries[2], 'update')[0] as Record<string, unknown>[];
		expect(patch).toMatchObject({ logo_path: 'conferences/draft-1/logo.png', banner_path: null });
		expect((patch.prefill_sources as Record<string, unknown>).logo_path).toBe('organization');
	});

	it('leaves the draft without a picture when the copy fails', async () => {
		const { supabase, queries } = createStandIn(
			{
				conferences: [
					{ data: null, error: null },
					{ data: draftRow, error: null }
				]
			},
			() => ({ data: null, error: { message: 'not found' } })
		);

		await startCreationDraft(supabase, prefillWithPictures());

		expect(queries.filter((query) => callsOf(query, 'update').length > 0)).toEqual([]);
	});
});

describe('countDraftFacts', () => {
	it('counts what is attached to the draft and finds its first fee by position', async () => {
		const { supabase, queries } = createStandIn({
			conferences: [
				{
					data: {
						committees: [{ count: 4 }],
						application_questions: [{ count: 2 }],
						fees: [
							{ name: 'Late fee', amount_cents: 5000, position: 2 },
							{ name: 'Delegate fee', amount_cents: 3500, position: 1 }
						]
					},
					error: null
				}
			]
		});

		expect(await countDraftFacts(supabase, 'draft-1')).toEqual({
			committeeCount: 4,
			questionCount: 2,
			feeCount: 2,
			firstFee: { name: 'Delegate fee', amountCents: 3500 }
		});
		expect(callsOf(queries[0], 'eq')).toEqual([['id', 'draft-1']]);
	});

	it('answers zero for a draft with nothing attached', async () => {
		const { supabase } = createStandIn({ conferences: [{ data: null, error: null }] });

		expect(await countDraftFacts(supabase, 'draft-1')).toEqual({
			committeeCount: 0,
			questionCount: 0,
			feeCount: 0,
			firstFee: null
		});
	});

	it('passes on what the database says when it refuses', async () => {
		const { supabase } = createStandIn({
			conferences: [{ data: null, error: { message: 'boom' } }]
		});

		await expect(countDraftFacts(supabase, 'draft-1')).rejects.toThrow('boom');
	});
});

describe('publishDraft', () => {
	const NOW = new Date('2026-10-04T12:00:00Z');

	/** What `publishDraft` wrote, for a draft in `mode` launched with `choice`. */
	async function publishedWith(
		mode: 'manual' | 'on_publish' | 'scheduled',
		choice: 'publish' | 'publish_and_open'
	) {
		const { supabase, queries } = createStandIn();

		await publishDraft(supabase, { id: 'draft-1', applicationOpenMode: mode }, choice, NOW);

		expect(callsOf(queries[0], 'eq')).toEqual([['id', 'draft-1']]);
		return callsOf(queries[0], 'update')[0][0];
	}

	it('leaves applications closed for a manual draft published on its own', async () => {
		expect(await publishedWith('manual', 'publish')).toEqual({ status: 'published' });
	});

	it('opens applications now when asked, and always for on_publish', async () => {
		const opened = { status: 'published', applications_open_at: '2026-10-04T12:00:00.000Z' };

		expect(await publishedWith('manual', 'publish_and_open')).toEqual(opened);
		expect(await publishedWith('on_publish', 'publish')).toEqual(opened);
	});

	it('keeps the scheduled opening moment', async () => {
		expect(await publishedWith('scheduled', 'publish_and_open')).toEqual({ status: 'published' });
	});

	it('passes on what the database says when it refuses', async () => {
		const { supabase } = createStandIn({
			conferences: [{ data: null, error: { message: 'conferences_place_unless_quick_session' } }]
		});

		await expect(
			publishDraft(supabase, { id: 'draft-1', applicationOpenMode: 'manual' }, 'publish', NOW)
		).rejects.toThrow('conferences_place_unless_quick_session');
	});
});
