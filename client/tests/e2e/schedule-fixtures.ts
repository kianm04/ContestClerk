import { createServiceRoleClient } from '../db/supabase-test-client';
import type { TestUser } from './signed-in-user';

// What the two schedule browser tests, `manage-schedule.spec.ts` and
// `schedule.spec.ts`, set up before they open a page: a conference of their
// own, its committees and seats, and events of every audience.
//
// The service-role client writes these rows the way the organiser's own forms
// would. It arranges the state a test begins in and is never used to show that
// something is allowed, which is what `tests/db/supabase-test-client.ts` warns
// against. Every conference here is new and has a random slug, so no two tests,
// and no two browser projects running the same test, can see each other's rows.
//
// The conferences run in May 2020. `/conferences` lists conferences that are
// published *and* have not finished, and `tests/e2e/conferences.spec.ts` counts
// what is in it, so a conference that finished years ago changes nothing it sees.

/** The first and last day of every conference made here. */
export const SCHEDULE_FIRST_DAY = '2020-05-03';
export const SCHEDULE_SECOND_DAY = '2020-05-04';
export const SCHEDULE_LAST_DAY = '2020-05-05';

/** The zone every conference made here runs in, and the one its pages name. */
export const SCHEDULE_TIMEZONE = 'Europe/Amsterdam';

/** A conference made for one test. */
export type ScheduleConference = {
	id: string;
	slug: string;
	name: string;
};

/** What `createScheduleConference` may be told. */
export type ScheduleConferenceSeed = {
	/** The account that owns the organisation, and so runs the conference. */
	owner: TestUser;
	/** Something to put in the name, so a failing test's conference can be found. */
	namePrefix: string;
	/** Published by default; a draft is visible to its own team only. */
	status?: 'draft' | 'published';
	/** Whether a visitor may read the `everyone` events. Off by default, as in the table. */
	showsSchedulePublicly?: boolean;
};

/** A name nothing else in the database will match. */
export function unusedName(prefix: string): string {
	return `${prefix} ${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Make an organisation owned by `owner` and one conference in it.
 *
 * `add_organization_creator_as_owner` makes whoever `created_by` names an owner
 * of the new organisation, and an owner runs every conference in it.
 */
export async function createScheduleConference(
	seed: ScheduleConferenceSeed
): Promise<ScheduleConference> {
	const admin = createServiceRoleClient();
	const suffix = crypto.randomUUID();

	const { data: organization, error: organizationError } = await admin
		.from('organizations')
		.insert({
			name: unusedName(`${seed.namePrefix} Society`),
			slug: `e2e-schedule-org-${suffix}`,
			created_by: seed.owner.id
		})
		.select('id')
		.single();

	if (organizationError || !organization) {
		throw new Error(`Could not create the test organisation: ${organizationError?.message}`);
	}

	const name = unusedName(seed.namePrefix);
	const slug = `e2e-schedule-${suffix}`;

	const { data: conference, error: conferenceError } = await admin
		.from('conferences')
		.insert({
			name,
			slug,
			city: 'Delft',
			country_code: 'NL',
			timezone: SCHEDULE_TIMEZONE,
			start_date: SCHEDULE_FIRST_DAY,
			end_date: SCHEDULE_LAST_DAY,
			status: seed.status ?? 'published',
			show_schedule_publicly: seed.showsSchedulePublicly ?? false,
			organization_id: organization.id,
			created_by: seed.owner.id
		})
		.select('id')
		.single();

	if (conferenceError || !conference) {
		throw new Error(`Could not create the test conference: ${conferenceError?.message}`);
	}

	return { id: conference.id, slug, name };
}

/** One committee, as `addScheduleCommittee` writes it. */
export type ScheduleCommitteeSeed = {
	name: string;
	abbreviation: string;
	room?: string;
	position?: number;
};

/** Put one committee in a conference, and answer its id. */
export async function addScheduleCommittee(
	conferenceId: string,
	committee: ScheduleCommitteeSeed
): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('committees')
		.insert({
			conference_id: conferenceId,
			name: committee.name,
			abbreviation: committee.abbreviation,
			room: committee.room ?? null,
			position: committee.position ?? 0,
			slug: `committee-${crypto.randomUUID()}`
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not create the test committee: ${error?.message}`);
	}

	return data.id;
}

/** Seat `user` as France in a committee, which makes them a delegate of its conference. */
export async function seatDelegate(user: TestUser, committeeId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin.from('seats').insert({
		committee_id: committeeId,
		name: 'France',
		country_code: 'FR',
		user_id: user.id,
		allocated_at: new Date().toISOString()
	});

	if (error) {
		throw new Error(`Could not seat the test delegate: ${error.message}`);
	}
}

/** One event, as `addScheduleEvent` writes it. */
export type ScheduleEventSeed = {
	conferenceId: string;
	title: string;
	/** ISO timestamps. */
	startsAt: string;
	endsAt: string;
	audience: 'everyone' | 'delegates' | 'staff' | 'committee';
	/** Set exactly when `audience` is `committee`, which the table insists on. */
	committeeId?: string;
	location?: string;
};

/** Put one event on a conference's programme, and answer its id. */
export async function addScheduleEvent(seed: ScheduleEventSeed): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('schedule_events')
		.insert({
			conference_id: seed.conferenceId,
			title: seed.title,
			starts_at: seed.startsAt,
			ends_at: seed.endsAt,
			audience: seed.audience,
			committee_id: seed.committeeId ?? null,
			location: seed.location ?? null
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not put the test event on the programme: ${error?.message}`);
	}

	return data.id;
}

/** Whether a conference's programme is public, according to the database itself. */
export async function readSchedulePublicity(conferenceId: string): Promise<boolean> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('conferences')
		.select('show_schedule_publicly')
		.eq('id', conferenceId)
		.single();

	if (error || !data) {
		throw new Error(`Could not read the test conference: ${error?.message}`);
	}

	return data.show_schedule_publicly;
}

/** The titles of a conference's events, earliest first, according to the database. */
export async function readEventTitles(conferenceId: string): Promise<string[]> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('schedule_events')
		.select('title')
		.eq('conference_id', conferenceId)
		.order('starts_at', { ascending: true });

	if (error) {
		throw new Error(`Could not read the test programme: ${error.message}`);
	}

	return (data ?? []).map((row) => row.title);
}
