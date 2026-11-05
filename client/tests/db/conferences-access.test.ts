import { describe, expect, it } from 'vitest';
import { createSignedInClient, createVisitorClient } from './supabase-test-client';
import { createConferenceOwnedByMe } from './conference-fixtures';

// Row Level Security tests for organizations and conferences. Each test states
// one rule from specs/02-architecture/permissions.md and checks it against the
// real database, once as the person who is allowed and once as one who is not.

/** Reads one conference's `updated_at`, whatever its status, as the organiser. */
async function readUpdatedAt(
	fixture: Awaited<ReturnType<typeof createConferenceOwnedByMe>>
): Promise<string> {
	const { data } = await fixture.supabase
		.from('conferences')
		.select('updated_at')
		.eq('id', fixture.conferenceId)
		.single();

	return data?.updated_at ?? '';
}

describe('conferences, as a visitor', () => {
	it('lists the published conferences from the seed', async () => {
		const supabase = createVisitorClient();

		const { data, error } = await supabase.from('conferences').select('slug, status');

		expect(error).toBeNull();
		expect(data?.length).toBeGreaterThanOrEqual(8);
	});

	it('never sees a conference that is still a draft', async () => {
		const supabase = createVisitorClient();

		const { data } = await supabase.from('conferences').select('slug').eq('status', 'draft');

		expect(data).toEqual([]);
	});

	it('sees the seeded conference that is open for applications', async () => {
		const supabase = createVisitorClient();

		const { data } = await supabase
			.from('conferences')
			.select('applications_open_at, applications_close_at, accepts_individual_applications')
			.eq('slug', 'amsterdammun-2027')
			.single();

		const now = Date.now();

		expect(data?.accepts_individual_applications).toBe(true);
		expect(new Date(data?.applications_open_at ?? '').getTime()).toBeLessThan(now);
		expect(new Date(data?.applications_close_at ?? '').getTime()).toBeGreaterThan(now);
	});
});

describe('conferences, as the organisation that runs them', () => {
	it('lets a member of the organisation open their own draft', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();

		const { data, error } = await supabase
			.from('conferences')
			.select('status')
			.eq('id', conferenceId)
			.single();

		expect(error).toBeNull();
		expect(data?.status).toBe('draft');
	});

	it('hides that draft from everybody else', async () => {
		const { conferenceId } = await createConferenceOwnedByMe();
		const stranger = await createSignedInClient();

		const { data } = await stranger.supabase
			.from('conferences')
			.select('status')
			.eq('id', conferenceId);

		expect(data).toEqual([]);
	});

	it('lets an organiser publish their conference', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();

		const { data, error } = await supabase
			.from('conferences')
			.update({ status: 'published', tagline: 'Three days of debate' })
			.eq('id', conferenceId)
			.select('status');

		expect(error).toBeNull();
		expect(data).toEqual([{ status: 'published' }]);
	});

	it('refuses an edit by somebody who does not run the conference', async () => {
		const { conferenceId, supabase: organiser } = await createConferenceOwnedByMe();

		// Published, so the stranger can at least read it. Changing it is another matter.
		await organiser.from('conferences').update({ status: 'published' }).eq('id', conferenceId);

		const stranger = await createSignedInClient();
		const { data } = await stranger.supabase
			.from('conferences')
			.update({ name: 'Renamed by a stranger' })
			.eq('id', conferenceId)
			.select('name');

		expect(data).toEqual([]);
	});

	it('lets an organiser delete a draft', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();

		const { data, error } = await supabase
			.from('conferences')
			.delete()
			.eq('id', conferenceId)
			.select('id');

		expect(error).toBeNull();
		expect(data).toEqual([{ id: conferenceId }]);
	});

	it('refuses to delete a conference that has been published', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();

		await supabase.from('conferences').update({ status: 'published' }).eq('id', conferenceId);

		const { data } = await supabase
			.from('conferences')
			.delete()
			.eq('id', conferenceId)
			.select('id');

		expect(data).toEqual([]);
	});
});

describe('conferences, the checks on the columns', () => {
	it('refuses more than three committee preferences', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();

		const { error } = await supabase
			.from('conferences')
			.update({ committee_preference_count: 4 })
			.eq('id', conferenceId);

		expect(error).not.toBeNull();
	});

	it('refuses a maximum age below the minimum age', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();

		const { error } = await supabase
			.from('conferences')
			.update({ min_age: 18, max_age: 16 })
			.eq('id', conferenceId);

		expect(error).not.toBeNull();
	});
});

// Migration 0008 adds the function `protect_conferences_columns` and the
// trigger `conferences_protect_columns` that runs it before every update of a
// conference. permissions.md asks for the allowed and the refused case of every
// rule, and both of them are below.
describe('protect_conferences_columns', () => {
	it('lets an organiser change the ordinary columns of their own conference', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();

		// Everything the details editor writes is ordinary content of the row, and
		// the trigger is only interested in the one column that says whose
		// conference it is.
		const { data, error } = await supabase
			.from('conferences')
			.update({
				tagline: 'Three days of debate',
				venue_name: 'World Forum',
				contact_email: 'hello@fixture.test'
			})
			.eq('id', conferenceId)
			.select('tagline, venue_name, contact_email');

		expect(error).toBeNull();
		expect(data).toEqual([
			{
				tagline: 'Three days of debate',
				venue_name: 'World Forum',
				contact_email: 'hello@fixture.test'
			}
		]);
	});

	it('refuses to move a conference to another organisation the same person runs', async () => {
		const { supabase, userId, organizationId, conferenceId } = await createConferenceOwnedByMe();

		// A second organisation of their own, so that `has_permission(id, 'administrator')`
		// passes on both sides of the update: this person really does run both. The
		// policy alone would therefore allow the move, which is the whole reason
		// migration 0008 adds a trigger.
		const { data: otherOrganization, error: otherOrganizationError } = await supabase
			.from('organizations')
			.insert({
				name: 'Second fixture org',
				slug: `second-fixture-org-${crypto.randomUUID()}`,
				created_by: userId
			})
			.select('id')
			.single();

		expect(otherOrganizationError).toBeNull();

		const { error } = await supabase
			.from('conferences')
			.update({ organization_id: otherOrganization?.id })
			.eq('id', conferenceId);

		expect(error?.message).toContain('cannot be moved');

		const { data: afterwards } = await supabase
			.from('conferences')
			.select('organization_id')
			.eq('id', conferenceId)
			.single();

		expect(afterwards?.organization_id).toBe(organizationId);
	});
});

describe('set_updated_at', () => {
	it('moves updated_at forward every time a row changes', async () => {
		const fixture = await createConferenceOwnedByMe();
		const before = await readUpdatedAt(fixture);

		await fixture.supabase
			.from('conferences')
			.update({ tagline: 'A new tagline' })
			.eq('id', fixture.conferenceId);

		const after = await readUpdatedAt(fixture);

		expect(new Date(after).getTime()).toBeGreaterThan(new Date(before).getTime());
	});

	it('ignores an updated_at the caller made up', async () => {
		const fixture = await createConferenceOwnedByMe();
		const longAgo = '2020-01-01T00:00:00.000Z';

		await fixture.supabase
			.from('conferences')
			.update({ tagline: 'Another tagline', updated_at: longAgo })
			.eq('id', fixture.conferenceId);

		const after = await readUpdatedAt(fixture);

		expect(new Date(after).getTime()).toBeGreaterThan(new Date(longAgo).getTime());
	});
});

describe('conference_is_published', () => {
	it('is true for a published conference and false for a draft', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();

		const { data: whileDraft, error } = await supabase.rpc('conference_is_published', {
			conference_id: conferenceId
		});

		expect(error).toBeNull();
		expect(whileDraft).toBe(false);

		await supabase.from('conferences').update({ status: 'published' }).eq('id', conferenceId);

		const { data: whilePublished } = await supabase.rpc('conference_is_published', {
			conference_id: conferenceId
		});

		expect(whilePublished).toBe(true);
	});

	it('is true for an archived conference, which stays readable', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();

		await supabase.from('conferences').update({ status: 'archived' }).eq('id', conferenceId);

		const { data } = await supabase.rpc('conference_is_published', {
			conference_id: conferenceId
		});

		expect(data).toBe(true);
	});
});

describe('organizations, as a visitor', () => {
	it('cannot create an organization', async () => {
		const supabase = createVisitorClient();

		const { error } = await supabase
			.from('organizations')
			.insert({ name: 'Visitor org', slug: 'visitor-org' });

		expect(error).not.toBeNull();
	});
});

describe('organizations, as a signed-in user', () => {
	it('makes the creator the owner through the trigger', async () => {
		const { supabase, userId } = await createSignedInClient();

		const { data: organization, error } = await supabase
			.from('organizations')
			.insert({ name: 'Test org', slug: `test-org-${crypto.randomUUID()}`, created_by: userId })
			.select('id')
			.single();

		expect(error).toBeNull();

		const { data: memberships } = await supabase
			.from('organization_members')
			.select('role')
			.eq('organization_id', organization?.id);

		expect(memberships).toEqual([{ role: 'owner' }]);
	});

	it("refuses an organization created in someone else's name", async () => {
		const { supabase } = await createSignedInClient();

		const { error } = await supabase.from('organizations').insert({
			name: 'Forged org',
			slug: `forged-org-${crypto.randomUUID()}`,
			created_by: crypto.randomUUID()
		});

		expect(error).not.toBeNull();
	});
});
