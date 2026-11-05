import { describe, expect, it } from 'vitest';
import { createSignedInClient, createVisitorClient } from './supabase-test-client';
import { createConferenceOwnedByMe } from './conference-fixtures';

// The `conferences_with_organization` view, added by
// supabase/migrations/20260917150000_conferences_with_organization_view.sql. It
// is every column of `conferences` plus the name and the slug of the
// organisation running it, so that the directory at /conferences can search over
// a conference's name, its city and the organiser's name in one request.
//
// These tests are about who may read what through the view. The search itself is
// the application's filter and is covered by src/lib/server/conferences.test.ts
// and tests/e2e/conferences.spec.ts.
//
// Why they keep coming back to who may read a draft: the view is declared with
// `security_invoker = true`, which means it reads the two tables underneath as
// whoever is asking, so the Row Level Security already on `conferences` decides
// what comes back. Unlike `public_seats`, this view has no rule of its own in a
// `where` clause; it leans entirely on those policies. If somebody ever turns
// that flag off, the view would read as its owner instead, and every draft
// conference would become visible to the whole world. The refused cases below
// are the ones that would notice.

describe('conferences_with_organization', () => {
	it('gives a visitor the organisation behind a published conference', async () => {
		const visitor = createVisitorClient();

		const { data, error } = await visitor
			.from('conferences_with_organization')
			.select('name, organization_name, organization_slug')
			.eq('slug', 'amsterdammun-2027')
			.single();

		expect(error).toBeNull();
		expect(data).toEqual({
			name: 'Amsterdam Open MUN 2027',
			organization_name: 'Sample Europe MUN Network',
			organization_slug: 'sample-europe-mun-network'
		});
	});

	it('never shows a visitor a conference that is still a draft', async () => {
		const { conferenceSlug } = await createConferenceOwnedByMe();

		const visitor = createVisitorClient();
		const { data, error } = await visitor
			.from('conferences_with_organization')
			.select('slug')
			.eq('slug', conferenceSlug);

		expect(error).toBeNull();
		expect(data).toEqual([]);
	});

	it('shows the organiser their own draft, with their organisation on it', async () => {
		const { supabase, conferenceSlug } = await createConferenceOwnedByMe();

		const { data, error } = await supabase
			.from('conferences_with_organization')
			.select('status, organization_name, organization_slug')
			.eq('slug', conferenceSlug)
			.single();

		expect(error).toBeNull();
		expect(data?.status).toBe('draft');
		expect(data?.organization_name).toBe('Fixture org');
		// The fixture puts a random suffix on the slug, so that every run of the
		// suite makes an organisation of its own. Only the start of it is fixed.
		expect(data?.organization_slug).toContain('fixture-org-');
	});

	it('hides that draft from a different signed-in account', async () => {
		const { conferenceSlug } = await createConferenceOwnedByMe();
		const stranger = await createSignedInClient();

		const { data, error } = await stranger.supabase
			.from('conferences_with_organization')
			.select('slug')
			.eq('slug', conferenceSlug);

		expect(error).toBeNull();
		expect(data).toEqual([]);
	});

	it('carries the conference columns the directory filters on', async () => {
		const visitor = createVisitorClient();

		const { data, error } = await visitor
			.from('conferences_with_organization')
			.select('status, level, end_date')
			.eq('slug', 'amsterdammun-2027')
			.single();

		expect(error).toBeNull();
		expect(data?.status).toBe('published');
		expect(data?.level).toBe('mixed');
		// The directory leaves out conferences that have already finished, so it
		// needs end_date. This seeded one is still ahead of us.
		expect(new Date(data?.end_date ?? '').getTime()).toBeGreaterThan(Date.now());
	});
});
