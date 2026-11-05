import { describe, expect, it } from 'vitest';
import {
	createServiceRoleClient,
	createSignedInClient,
	createVisitorClient
} from './supabase-test-client';
import { addCommittee, addFee, createConferenceOwnedByMe } from './conference-fixtures';

// The explicit states the conference creation redesign added (Trello
// fe3reN7Y), from supabase/migrations/20261003120000_conference_creation_redesign.sql:
// a conference says where it happens, whether its venue and its times are
// known, whether it charges a fee and how its application window is decided,
// instead of leaving every page to guess that from a null. A draft may also
// be started before the organiser knows the city, and an online conference
// never needs one.
//
// These tests are about what the database accepts, defaults and refuses. What
// /create does with the columns is tested beside the code in src/lib.

/** The state columns of one conference, read back by its organiser. */
async function readStates(
	supabase: Awaited<ReturnType<typeof createConferenceOwnedByMe>>['supabase'],
	conferenceId: string
) {
	const { data, error } = await supabase
		.from('conferences')
		.select(
			'location_mode, venue_status, conference_time_status, start_time, end_time, fee_status, application_open_mode, application_close_rule, application_close_offset_days, creation_step, prefill_sources'
		)
		.eq('id', conferenceId)
		.single();

	if (error) throw new Error(`Could not read the conference: ${error.message}`);

	return data;
}

describe('a new conference', () => {
	it('starts out with nothing decided, at the Basics step', async () => {
		const fixture = await createConferenceOwnedByMe();

		expect(await readStates(fixture.supabase, fixture.conferenceId)).toEqual({
			location_mode: 'in_person',
			venue_status: 'tba',
			conference_time_status: 'tba',
			start_time: null,
			end_time: null,
			fee_status: 'undecided',
			application_open_mode: 'manual',
			application_close_rule: 'relative',
			application_close_offset_days: -14,
			creation_step: 'basics',
			prefill_sources: {}
		});
	});

	it('may be a draft without a city, and remembers where each value came from', async () => {
		const { supabase, userId } = await createSignedInClient();
		const suffix = crypto.randomUUID();

		const { data: organization } = await supabase
			.from('organizations')
			.insert({ name: 'No city yet', slug: `no-city-${suffix}`, created_by: userId, city: 'Delft' })
			.select('id, city')
			.single();

		expect(organization?.city).toBe('Delft');

		const { data, error } = await supabase
			.from('conferences')
			.insert({
				name: 'Draft without a place',
				slug: `draft-no-place-${suffix}`,
				start_date: '2031-03-01',
				end_date: '2031-03-03',
				organization_id: organization?.id,
				created_by: userId,
				creation_step: 'when',
				prefill_sources: { name: 'previous_conference', start_date: 'system_default' }
			})
			.select('city, country_code, creation_step, prefill_sources')
			.single();

		expect(error).toBeNull();
		expect(data).toEqual({
			city: null,
			country_code: null,
			creation_step: 'when',
			prefill_sources: { name: 'previous_conference', start_date: 'system_default' }
		});
	});
});

describe('publishing', () => {
	it('refuses an in-person conference that still has no city', async () => {
		const fixture = await createConferenceOwnedByMe();

		const { error } = await fixture.supabase
			.from('conferences')
			.update({ city: null, country_code: null, status: 'published' })
			.eq('id', fixture.conferenceId);

		expect(error?.message).toContain('conferences_place_unless_quick_session');
	});

	it('lets an online conference go public with no city at all', async () => {
		const fixture = await createConferenceOwnedByMe();

		const { data, error } = await fixture.supabase
			.from('conferences')
			.update({ city: null, country_code: null, location_mode: 'online', status: 'published' })
			.eq('id', fixture.conferenceId)
			.select('status, location_mode, city')
			.single();

		expect(error).toBeNull();
		expect(data).toEqual({ status: 'published', location_mode: 'online', city: null });
	});
});

describe('the times of day', () => {
	it('are only known when both are given', async () => {
		const fixture = await createConferenceOwnedByMe();

		const { error: halfError } = await fixture.supabase
			.from('conferences')
			.update({ conference_time_status: 'known', start_time: '09:00' })
			.eq('id', fixture.conferenceId);

		expect(halfError?.message).toContain('conferences_times_known_together');

		const { data, error } = await fixture.supabase
			.from('conferences')
			.update({ conference_time_status: 'known', start_time: '09:00', end_time: '17:30' })
			.eq('id', fixture.conferenceId)
			.select('conference_time_status, start_time, end_time')
			.single();

		expect(error).toBeNull();
		expect(data).toEqual({
			conference_time_status: 'known',
			start_time: '09:00:00',
			end_time: '17:30:00'
		});
	});
});

describe('the application window rule', () => {
	it('only counts back from the first day, never forward', async () => {
		const fixture = await createConferenceOwnedByMe();

		const { error } = await fixture.supabase
			.from('conferences')
			.update({ application_close_offset_days: 3 })
			.eq('id', fixture.conferenceId);

		expect(error?.message).toContain('conferences_close_offset_in_past');
	});
});

describe('the Setup step dialogs', () => {
	it('store a planned seat count on a committee, as long as it is positive', async () => {
		const fixture = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);

		const { error: zeroError } = await fixture.supabase
			.from('committees')
			.update({ planned_seat_count: 0 })
			.eq('id', committeeId);

		expect(zeroError?.message).toContain('committees_planned_seat_count_positive');

		const { data, error } = await fixture.supabase
			.from('committees')
			.update({ planned_seat_count: 15 })
			.eq('id', committeeId)
			.select('planned_seat_count')
			.single();

		expect(error).toBeNull();
		expect(data).toEqual({ planned_seat_count: 15 });
	});

	it('store a description on a fee', async () => {
		const fixture = await createConferenceOwnedByMe();
		const feeId = await addFee(fixture.supabase, fixture.conferenceId);

		const { data, error } = await fixture.supabase
			.from('fees')
			.update({ description: 'Covers lunch on every day.' })
			.eq('id', feeId)
			.select('description')
			.single();

		expect(error).toBeNull();
		expect(data).toEqual({ description: 'Covers lunch on every day.' });
	});
});

describe('conferences_with_organization', () => {
	it('carries the new state columns', async () => {
		const fixture = await createConferenceOwnedByMe();

		const { data, error } = await fixture.supabase
			.from('conferences_with_organization')
			.select('location_mode, venue_status, fee_status, creation_step, organization_name')
			.eq('id', fixture.conferenceId)
			.single();

		expect(error).toBeNull();
		expect(data).toEqual({
			location_mode: 'in_person',
			venue_status: 'tba',
			fee_status: 'undecided',
			creation_step: 'basics',
			organization_name: 'Fixture org'
		});
	});

	it('still hides a draft from a visitor', async () => {
		const fixture = await createConferenceOwnedByMe();
		const visitor = createVisitorClient();

		const { data } = await visitor
			.from('conferences_with_organization')
			.select('id')
			.eq('id', fixture.conferenceId);

		expect(data).toEqual([]);
	});
});

// 20261004120000_creation_open_mode_backfill.sql told every conference that
// was already published without an opening date that it opens on publish,
// because 'manual' would have shut its applications. seed.sql inserts its rows
// after the migrations and says the same of its own, so its conferences hold
// to it after a reset. Only the seed's rows are looked at: other tests make
// published conferences of their own, which a backfill never saw.
describe('conferences published before the open mode existed', () => {
	it('open on publish when they have no opening date', async () => {
		const admin = createServiceRoleClient();

		const { data, error } = await admin
			.from('conferences')
			.select('id, application_open_mode')
			.neq('status', 'draft')
			.is('applications_open_at', null);

		expect(error).toBeNull();
		const seeded = (data ?? []).filter((row) => row.id.startsWith('20000000-0000-4000-8000-'));
		expect(seeded.length).toBeGreaterThan(0);
		expect(seeded.filter((row) => row.application_open_mode !== 'on_publish')).toEqual([]);
	});

	it('leaves a draft at manual', async () => {
		const fixture = await createConferenceOwnedByMe();

		expect(await readStates(fixture.supabase, fixture.conferenceId)).toMatchObject({
			application_open_mode: 'manual'
		});
	});
});
