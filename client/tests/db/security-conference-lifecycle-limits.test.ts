import { describe, expect, it } from 'vitest';
import { createSignedInClient } from './supabase-test-client';
import {
	addCommittee,
	addSeat,
	addSession,
	createCommitteeRoom,
	createConferenceOwnedByMe
} from './conference-fixtures';

// The database rules for a conference's life and the bounds on free text that
// migration 20261022124000_conference_lifecycle_limits.sql added, after the
// security review of 2026-10-10 (findings M2, L74, I1, I18, I10, L57, L65, L66,
// L67, L69, L70, L71, L72). The life rules live in the column guard
// protect_conferences_columns, run by the trigger conferences_protect_columns
// before every insert and update of conferences; the bounds are CHECK
// constraints named after their table and column.
//
// Every refusal here is proved through a signed-in client, so the rule has to
// hold against somebody the policies otherwise allow to write the row. The
// forms refuse the same things first; these tests are about what happens when
// a request skips the form and talks to PostgREST directly.

/** Text of exactly `length` characters, for a value one over or exactly at a bound. */
function textOf(length: number): string {
	return 'x'.repeat(length);
}

/** Reads one conference's status and first_published_at as the organiser. */
async function readLifecycle(
	fixture: Awaited<ReturnType<typeof createConferenceOwnedByMe>>
): Promise<{ status: string; first_published_at: string | null }> {
	const { data, error } = await fixture.supabase
		.from('conferences')
		.select('status, first_published_at')
		.eq('id', fixture.conferenceId)
		.single();

	if (error || !data) {
		throw new Error(`Could not read the fixture conference: ${error?.message}`);
	}

	return data;
}

describe('first_published_at, which the database stamps (M2, L74)', () => {
	it('is empty for a draft, set the first time it is published, and never moves again', async () => {
		const fixture = await createConferenceOwnedByMe();
		const { supabase, conferenceId } = fixture;

		expect((await readLifecycle(fixture)).first_published_at).toBeNull();

		const { error: publishError } = await supabase
			.from('conferences')
			.update({ status: 'published' })
			.eq('id', conferenceId);
		expect(publishError).toBeNull();

		const published = await readLifecycle(fixture);
		expect(published.status).toBe('published');
		expect(published.first_published_at).not.toBeNull();

		// Nobody is seated, so the organiser may still take it back to a draft.
		const { error: unpublishError } = await supabase
			.from('conferences')
			.update({ status: 'draft' })
			.eq('id', conferenceId);
		expect(unpublishError).toBeNull();

		const unpublished = await readLifecycle(fixture);
		expect(unpublished.status).toBe('draft');
		expect(unpublished.first_published_at).toBe(published.first_published_at);

		await supabase.from('conferences').update({ status: 'published' }).eq('id', conferenceId);

		expect((await readLifecycle(fixture)).first_published_at).toBe(published.first_published_at);
	});

	it('refuses an organiser who writes first_published_at themselves', async () => {
		const fixture = await createConferenceOwnedByMe();
		const { supabase, conferenceId } = fixture;

		const { error: onDraft } = await supabase
			.from('conferences')
			.update({ first_published_at: '2020-01-01T00:00:00Z' })
			.eq('id', conferenceId);
		expect(onDraft?.message).toContain('first_published_at');

		await supabase.from('conferences').update({ status: 'published' }).eq('id', conferenceId);

		// Clearing it would let a once-public conference be deleted again.
		const { error: onPublished } = await supabase
			.from('conferences')
			.update({ first_published_at: null })
			.eq('id', conferenceId);
		expect(onPublished?.message).toContain('first_published_at');
		expect((await readLifecycle(fixture)).first_published_at).not.toBeNull();
	});

	it('refuses a new conference that arrives with first_published_at filled in', async () => {
		const { supabase, organizationId, userId } = await createConferenceOwnedByMe();

		const { error } = await supabase.from('conferences').insert({
			name: 'Pre-stamped MUN',
			slug: `pre-stamped-${crypto.randomUUID()}`,
			city: 'Utrecht',
			country_code: 'NL',
			start_date: '2020-03-01',
			end_date: '2020-03-03',
			organization_id: organizationId,
			created_by: userId,
			first_published_at: '2020-01-01T00:00:00Z'
		});

		expect(error?.message).toContain('first_published_at');
	});
});

describe('a conference is born a draft (I1)', () => {
	it('refuses to insert a conference that is already published, however complete it is', async () => {
		const { supabase, organizationId, userId } = await createConferenceOwnedByMe();

		const { error } = await supabase.from('conferences').insert({
			name: 'Born public MUN',
			slug: `born-public-${crypto.randomUUID()}`,
			city: 'Utrecht',
			country_code: 'NL',
			start_date: '2020-03-01',
			end_date: '2020-03-03',
			organization_id: organizationId,
			created_by: userId,
			status: 'published'
		});

		// 42501 is Postgres for "the row-level security policy said no".
		expect(error?.code).toBe('42501');
	});

	it('still lets a member of the organisation insert a draft', async () => {
		const { supabase, organizationId, userId } = await createConferenceOwnedByMe();

		const { data, error } = await supabase
			.from('conferences')
			.insert({
				name: 'Second draft MUN',
				slug: `second-draft-${crypto.randomUUID()}`,
				city: 'Utrecht',
				country_code: 'NL',
				start_date: '2020-03-01',
				end_date: '2020-03-03',
				organization_id: organizationId,
				created_by: userId
			})
			.select('status')
			.single();

		expect(error).toBeNull();
		expect(data?.status).toBe('draft');
	});
});

describe('taking a conference out of the directory (M2, L74)', () => {
	it('refuses to unpublish once a delegate holds a seat', async () => {
		// A draft conference with one seated delegate; publish it first.
		const room = await createCommitteeRoom();

		const { error: publishError } = await room.supabase
			.from('conferences')
			.update({ status: 'published' })
			.eq('id', room.conferenceId);
		expect(publishError).toBeNull();

		const { error } = await room.supabase
			.from('conferences')
			.update({ status: 'draft' })
			.eq('id', room.conferenceId);

		expect(error?.message).toContain('seated');
		expect((await readLifecycle(room)).status).toBe('published');
	});

	it('lets the organiser unpublish again once the seat is empty', async () => {
		const room = await createCommitteeRoom();

		await room.supabase
			.from('conferences')
			.update({ status: 'published' })
			.eq('id', room.conferenceId);
		// Nobody empties a seat by writing user_id since the seats hardening (C4);
		// the organiser revokes it, as the participants page does.
		const { error: revokeError } = await room.supabase.rpc('revoke_seat', {
			seat_id: room.seatId
		});

		expect(revokeError).toBeNull();

		const { error } = await room.supabase
			.from('conferences')
			.update({ status: 'draft' })
			.eq('id', room.conferenceId);

		expect(error).toBeNull();
		expect((await readLifecycle(room)).status).toBe('draft');
	});

	it('refuses to take an archived conference back to a draft', async () => {
		const fixture = await createConferenceOwnedByMe();
		const { supabase, conferenceId } = fixture;

		await supabase.from('conferences').update({ status: 'published' }).eq('id', conferenceId);
		await supabase.from('conferences').update({ status: 'archived' }).eq('id', conferenceId);

		const { error } = await supabase
			.from('conferences')
			.update({ status: 'draft' })
			.eq('id', conferenceId);

		expect(error?.message).toContain('archived');
		expect((await readLifecycle(fixture)).status).toBe('archived');
	});
});

describe('deleting a conference (M2)', () => {
	it('refuses to delete a draft that has been public before', async () => {
		const fixture = await createConferenceOwnedByMe();
		const { supabase, conferenceId } = fixture;

		await supabase.from('conferences').update({ status: 'published' }).eq('id', conferenceId);
		await supabase.from('conferences').update({ status: 'draft' }).eq('id', conferenceId);

		// A delete the policy refuses removes nothing and reports nothing.
		const { data, error } = await supabase
			.from('conferences')
			.delete()
			.eq('id', conferenceId)
			.select('id');

		expect(error).toBeNull();
		expect(data).toEqual([]);
		expect((await readLifecycle(fixture)).status).toBe('draft');
	});

	it('still deletes a draft that was never public', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();

		const { data, error } = await supabase
			.from('conferences')
			.delete()
			.eq('id', conferenceId)
			.select('id');

		expect(error).toBeNull();
		expect(data).toEqual([{ id: conferenceId }]);
	});
});

describe('organizations: slug shape and text bounds (L69, L70, L71, I18)', () => {
	/** An organisation row through the person's own client; only `changes` differs per test. */
	async function insertOrganization(changes: Record<string, unknown>) {
		const { supabase, userId } = await createSignedInClient();

		return supabase.from('organizations').insert({
			name: 'Bounded org',
			slug: `bounded-org-${crypto.randomUUID()}`,
			created_by: userId,
			...changes
		});
	}

	it('refuses a slug that is not lowercase words joined by single hyphens', async () => {
		for (const slug of ['Bad Slug', 'double--hyphen', '-leading', 'trailing-', 'under_score']) {
			const { error } = await insertOrganization({ slug });

			expect(error?.message, slug).toContain('organizations_slug_shape');
		}
	});

	it('refuses a name over 120, a description over 1000, a city over 120 characters', async () => {
		expect((await insertOrganization({ name: textOf(121) })).error?.message).toContain(
			'organizations_name_length'
		);
		expect((await insertOrganization({ description: textOf(1001) })).error?.message).toContain(
			'organizations_description_length'
		);
		expect((await insertOrganization({ city: textOf(121) })).error?.message).toContain(
			'organizations_city_length'
		);
	});

	it('refuses a website that does not start with http:// or https://', async () => {
		for (const website_url of ['www.example.org', 'javascript:alert(1)', 'ftp://example.org']) {
			const { error } = await insertOrganization({ website_url });

			expect(error?.message, website_url).toContain('organizations_website_url_shape');
		}
	});

	it('accepts a row right at every bound', async () => {
		const { error } = await insertOrganization({
			name: textOf(120),
			description: textOf(1000),
			city: textOf(120),
			website_url: 'https://example.org'
		});

		expect(error).toBeNull();
	});

	// `isWebAddress` reads the scheme through `URL`, which does not care about
	// its case, so the form accepts `HTTPS://`; the column has to as well, or a
	// form that said yes would be followed by a save that throws.
	it('accepts a website whose scheme is in capitals, as isWebAddress does', async () => {
		for (const website_url of ['HTTPS://example.org', 'Http://example.org']) {
			const { error } = await insertOrganization({ website_url });

			expect(error, website_url).toBeNull();
		}
	});
});

describe('conferences: slug shape, currency and web addresses (L71, I10, I18)', () => {
	/** A draft through the organiser's own client; only `changes` differs per test. */
	async function insertConference(changes: Record<string, unknown>) {
		const { supabase, organizationId, userId } = await createConferenceOwnedByMe();

		return supabase.from('conferences').insert({
			name: 'Bounded MUN',
			slug: `bounded-mun-${crypto.randomUUID()}`,
			city: 'Utrecht',
			country_code: 'NL',
			start_date: '2020-03-01',
			end_date: '2020-03-03',
			organization_id: organizationId,
			created_by: userId,
			...changes
		});
	}

	it('refuses a slug that is not lowercase words joined by single hyphens', async () => {
		const { error } = await insertConference({ slug: 'Bad "Slug"' });

		expect(error?.message).toContain('conferences_slug_shape');
	});

	it('refuses a currency that is not three capital letters', async () => {
		for (const currency of ['eur', 'EU', '€€€']) {
			const { error } = await insertConference({ currency });

			expect(error?.message, currency).toContain('conferences_currency_shape');
		}
	});

	it('refuses any of the seven addresses without http:// or https://', async () => {
		const columns = [
			'website_url',
			'instagram_url',
			'facebook_url',
			'linkedin_url',
			'youtube_url',
			'tiktok_url'
		];

		for (const column of columns) {
			const { error } = await insertConference({ [column]: 'javascript:alert(1)' });

			expect(error?.message, column).toContain(`conferences_${column}_shape`);
		}
	});

	it('accepts the usual values', async () => {
		const { error } = await insertConference({
			currency: 'GBP',
			website_url: 'https://example.org/mun',
			instagram_url: 'http://instagram.com/mun',
			facebook_url: 'https://facebook.com/mun',
			linkedin_url: 'https://linkedin.com/company/mun',
			youtube_url: 'https://youtube.com/@mun',
			tiktok_url: 'https://tiktok.com/@mun'
		});

		expect(error).toBeNull();
	});

	it('accepts an address whose scheme is in capitals, as isWebAddress does', async () => {
		const { error } = await insertConference({
			website_url: 'HTTPS://example.org/mun',
			instagram_url: 'Http://instagram.com/mun'
		});

		expect(error).toBeNull();
	});
});

describe('committees and seats: slug shape and name bounds (L65, L66)', () => {
	it('refuses a committee slug that is not lowercase words joined by single hyphens', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();

		const { error } = await supabase
			.from('committees')
			.insert({ conference_id: conferenceId, name: 'General Assembly', slug: 'ga--' });

		expect(error?.message).toContain('committees_slug_shape');
	});

	it('refuses a committee name over 120 characters and accepts one of 120', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();

		const { error } = await supabase
			.from('committees')
			.insert({ conference_id: conferenceId, name: textOf(121), slug: 'long-name' });
		expect(error?.message).toContain('committees_name_length');

		await expect(addCommittee(supabase, conferenceId, textOf(120))).resolves.toBeTruthy();
	});

	it('refuses a seat name over 120 characters and accepts one of 120', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(supabase, conferenceId);

		const { error } = await supabase
			.from('seats')
			.insert({ committee_id: committeeId, name: textOf(121) });
		expect(error?.message).toContain('seats_name_length');

		await expect(addSeat(supabase, committeeId, textOf(120))).resolves.toBeTruthy();
	});
});

describe('committee_sessions: name bound (L57)', () => {
	it('refuses a session name over 120 characters and accepts one of 120', async () => {
		const room = await createCommitteeRoom();

		const { error } = await room.chair.supabase
			.from('committee_sessions')
			.insert({ committee_id: room.committeeId, name: textOf(121) });
		expect(error?.message).toContain('committee_sessions_name_length');

		await expect(
			addSession(room.chair.supabase, room.committeeId, textOf(120))
		).resolves.toBeTruthy();
	});
});

describe('profiles: text bounds (L67)', () => {
	it('refuses a name over 100, an institution over 120 and pronouns over 30 characters', async () => {
		const { supabase, userId } = await createSignedInClient();

		const tooLong = [
			['full_name', textOf(101), 'profiles_full_name_length'],
			['institution_name', textOf(121), 'profiles_institution_name_length'],
			['pronouns', textOf(31), 'profiles_pronouns_length']
		] as const;

		for (const [column, value, constraint] of tooLong) {
			const { error } = await supabase
				.from('profiles')
				.update({ [column]: value })
				.eq('id', userId);

			expect(error?.message, column).toContain(constraint);
		}
	});

	it('accepts a profile right at every bound', async () => {
		const { supabase, userId } = await createSignedInClient();

		const { error } = await supabase
			.from('profiles')
			.update({ full_name: textOf(100), institution_name: textOf(120), pronouns: textOf(30) })
			.eq('id', userId);

		expect(error).toBeNull();
	});
});

describe('announcements and schedule events: text bounds (L72)', () => {
	it('refuses an announcement title over 120 or a body over 4000 characters', async () => {
		const { supabase, conferenceId, userId } = await createConferenceOwnedByMe();

		const announcement = (changes: Record<string, unknown>) =>
			supabase.from('announcements').insert({
				conference_id: conferenceId,
				author_id: userId,
				title: 'Bounded',
				body: 'A body.',
				audience: 'everyone',
				...changes
			});

		expect((await announcement({ title: textOf(121) })).error?.message).toContain(
			'announcements_title_length'
		);
		expect((await announcement({ body: textOf(4001) })).error?.message).toContain(
			'announcements_body_length'
		);
		expect((await announcement({ title: textOf(120), body: textOf(4000) })).error).toBeNull();
	});

	it('refuses an event title over 120, a description over 1000 or a location over 80 characters', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();

		const event = (changes: Record<string, unknown>) =>
			supabase.from('schedule_events').insert({
				conference_id: conferenceId,
				title: 'Opening ceremony',
				audience: 'everyone',
				starts_at: '2020-03-01T09:00:00Z',
				ends_at: '2020-03-01T10:00:00Z',
				...changes
			});

		expect((await event({ title: textOf(121) })).error?.message).toContain(
			'schedule_events_title_length'
		);
		expect((await event({ description: textOf(1001) })).error?.message).toContain(
			'schedule_events_description_length'
		);
		expect((await event({ location: textOf(81) })).error?.message).toContain(
			'schedule_events_location_length'
		);
		expect(
			(await event({ title: textOf(120), description: textOf(1000), location: textOf(80) })).error
		).toBeNull();
	});
});
