/**
 * Where every schedule page gets its events: the organiser's editor, the
 * delegate's schedule page and the public conference page's programme.
 *
 * Files under `$lib/server` only ever run on the server, so this is where the
 * database is queried. Every function takes the Supabase client as its first
 * argument, and pages pass in `locals.supabase`, the client that knows who is
 * signed in. Row Level Security (`specs/02-architecture/permissions.md`) then
 * decides which events each caller may read, and only somebody who can manage
 * the conference may add, change or delete one.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScheduleEventInput } from '$lib/schedule-form';
import { nextSessionNumber, sessionLocation, sessionTitle } from '$lib/schedule-form';
import {
	collectMemberships,
	shiftByDays,
	type AudienceMembership,
	type EventAudience,
	type ScheduleCommittee,
	type ScheduleEvent
} from '$lib/schedule';

/**
 * The columns every schedule page reads. `committees(abbreviation)` is not a
 * column: it asks Supabase to follow `committee_id` and bring back the
 * committee's short name alongside the event.
 */
const EVENT_COLUMNS =
	'id, conference_id, committee_id, title, description, location, starts_at, ends_at, audience, committees(abbreviation)';

/** One `schedule_events` row as `EVENT_COLUMNS` reads it, under the database's own names. */
type ScheduleEventRow = {
	id: string;
	conference_id: string;
	committee_id: string | null;
	title: string;
	description: string | null;
	location: string | null;
	starts_at: string;
	ends_at: string;
	audience: EventAudience;
	/** `null` for every event that is not for one committee. */
	committees: { abbreviation: string | null } | null;
};

/** A row as the pages hold it. */
function toScheduleEvent(row: ScheduleEventRow): ScheduleEvent {
	return {
		id: row.id,
		conferenceId: row.conference_id,
		title: row.title,
		description: row.description,
		location: row.location,
		startsAt: row.starts_at,
		endsAt: row.ends_at,
		audience: row.audience,
		committeeId: row.committee_id,
		committeeAbbreviation: row.committees?.abbreviation ?? null
	};
}

/** An event as the database takes it, under its own column names. */
function toEventColumns(input: ScheduleEventInput) {
	return {
		title: input.title,
		description: input.description,
		location: input.location,
		starts_at: input.startsAt,
		ends_at: input.endsAt,
		audience: input.audience,
		committee_id: input.committeeId
	};
}

/**
 * Every event of one conference that the reader may see, earliest first.
 *
 * For an organiser that is the whole programme. For anybody else Row Level
 * Security leaves out the audiences they are not in, and the page narrows the
 * rest with `eventsForAudience`.
 */
export async function listScheduleEvents(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<ScheduleEvent[]> {
	const { data, error } = await supabase
		.from('schedule_events')
		.select(EVENT_COLUMNS)
		.eq('conference_id', conferenceId)
		.order('starts_at', { ascending: true })
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<ScheduleEventRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the programme: ${error.message}`);
	}

	const rows: ScheduleEventRow[] = data ?? [];

	return rows.map(toScheduleEvent);
}

/**
 * The public programme of a conference: its `everyone` events, and only while
 * the organisers have ticked "Show programme publicly".
 *
 * The database already refuses everything else to a visitor. The two filters
 * are asked here as well so that an organiser previewing their own public page
 * sees what a visitor would, rather than their whole programme.
 */
export async function listPublicProgramme(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<ScheduleEvent[]> {
	const isPublic = await readSchedulePublicity(supabase, conferenceId);

	if (!isPublic) {
		return [];
	}

	const { data, error } = await supabase
		.from('schedule_events')
		.select(EVENT_COLUMNS)
		.eq('conference_id', conferenceId)
		.eq('audience', 'everyone')
		.order('starts_at', { ascending: true })
		.overrideTypes<ScheduleEventRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the public programme: ${error.message}`);
	}

	const rows: ScheduleEventRow[] = data ?? [];

	return rows.map(toScheduleEvent);
}

/** One event of this conference, or `null` when it is not one of its events. */
export async function getScheduleEvent(
	supabase: SupabaseClient,
	conferenceId: string,
	eventId: string
): Promise<ScheduleEvent | null> {
	const { data, error } = await supabase
		.from('schedule_events')
		.select(EVENT_COLUMNS)
		.eq('conference_id', conferenceId)
		.eq('id', eventId)
		// `maybeSingle` returns one row, or `null` when nothing matches, instead of a list.
		.maybeSingle()
		.overrideTypes<ScheduleEventRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not read that event: ${error.message}`);
	}

	return data ? toScheduleEvent(data) : null;
}

/** Add one event to a conference's programme, and answer with its id. */
export async function createScheduleEvent(
	supabase: SupabaseClient,
	conferenceId: string,
	input: ScheduleEventInput
): Promise<string> {
	const { data, error } = await supabase
		.from('schedule_events')
		.insert({ conference_id: conferenceId, ...toEventColumns(input) })
		.select('id')
		.single()
		.overrideTypes<{ id: string }, { merge: false }>();

	if (error) {
		throw new Error(`Could not add the event: ${error.message}`);
	}

	return data.id;
}

/**
 * Save one event.
 *
 * When the start, the end or the place changes for an event within the next
 * 24 hours, the database's `notify_schedule_changed` trigger tells its audience
 * on its own; nothing here has to.
 */
export async function updateScheduleEvent(
	supabase: SupabaseClient,
	eventId: string,
	input: ScheduleEventInput
): Promise<void> {
	const { error } = await supabase
		.from('schedule_events')
		.update(toEventColumns(input))
		.eq('id', eventId);

	if (error) {
		throw new Error(`Could not save the event: ${error.message}`);
	}
}

/**
 * Copy an event a number of days later, keeping everything else the same, and
 * answer with the copy's start.
 *
 * Both times move on the conference's own clock (`shiftByDays`), so a 09:00
 * event is copied to 09:00 even across a change to summer time.
 */
export async function duplicateScheduleEvent(
	supabase: SupabaseClient,
	event: ScheduleEvent,
	timezone: string,
	days: number
): Promise<string> {
	const startsAt = shiftByDays(event.startsAt, days, timezone);

	await createScheduleEvent(supabase, event.conferenceId, {
		title: event.title,
		description: event.description,
		location: event.location,
		startsAt,
		endsAt: shiftByDays(event.endsAt, days, timezone),
		audience: event.audience,
		committeeId: event.committeeId
	});

	return startsAt;
}

/** Delete one event of this conference. */
export async function deleteScheduleEvent(
	supabase: SupabaseClient,
	conferenceId: string,
	eventId: string
): Promise<void> {
	const { error } = await supabase
		.from('schedule_events')
		.delete()
		.eq('conference_id', conferenceId)
		.eq('id', eventId);

	if (error) {
		throw new Error(`Could not delete the event: ${error.message}`);
	}
}

/** What "Add committee sessions" hands over once its form has been checked. */
export type CommitteeSessionsInput = {
	titlePattern: string;
	locationPattern: string;
	/** Exact moments, already read in the conference's timezone. */
	startsAt: string;
	endsAt: string;
	/** The ticked committees, each with its room for `{room}`. */
	committees: ScheduleCommittee[];
};

/**
 * Add one `committee` event for every ticked committee, in a single insert, and
 * answer with how many were added.
 *
 * Each title's `{n}` is that committee's next session number, counted from
 * the committee events it already has, so the programme is read first.
 */
export async function createCommitteeSessionEvents(
	supabase: SupabaseClient,
	conferenceId: string,
	input: CommitteeSessionsInput
): Promise<number> {
	const existing = await listScheduleEvents(supabase, conferenceId);

	const rows = input.committees.map((committee) => ({
		conference_id: conferenceId,
		committee_id: committee.id,
		audience: 'committee' as const,
		title: sessionTitle(input.titlePattern, nextSessionNumber(existing, committee.id)),
		location: sessionLocation(input.locationPattern, committee.room),
		starts_at: input.startsAt,
		ends_at: input.endsAt
	}));

	const { error } = await supabase.from('schedule_events').insert(rows);

	if (error) {
		throw new Error(`Could not add the committee sessions: ${error.message}`);
	}

	return rows.length;
}

/** The committees of a conference, in their own order, for the editor's two pickers. */
export async function listScheduleCommittees(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<ScheduleCommittee[]> {
	const { data, error } = await supabase
		.from('committees')
		.select('id, name, abbreviation, room')
		.eq('conference_id', conferenceId)
		.order('position', { ascending: true })
		.overrideTypes<ScheduleCommittee[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the committees: ${error.message}`);
	}

	return data ?? [];
}

/**
 * Has the organiser ticked "Show programme publicly"?
 *
 * The one `conferences` column this page owns, read on its own because the
 * `Conference` type the rest of the app shares does not carry it.
 */
export async function readSchedulePublicity(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<boolean> {
	const { data, error } = await supabase
		.from('conferences')
		.select('show_schedule_publicly')
		.eq('id', conferenceId)
		.maybeSingle()
		.overrideTypes<{ show_schedule_publicly: boolean }, { merge: false }>();

	if (error) {
		throw new Error(`Could not read whether the programme is public: ${error.message}`);
	}

	return data?.show_schedule_publicly ?? false;
}

/**
 * Save "Show programme publicly", and nothing else of the conference.
 *
 * The conference row itself belongs to `edit_conference`, and this one column
 * to whoever edits the whole programme, so the database function
 * `set_schedule_publicity` writes it after asking for `edit_schedule`
 * conference-wide. It refuses anybody else, however this is called.
 */
export async function updateSchedulePublicity(
	supabase: SupabaseClient,
	conferenceId: string,
	isPublic: boolean
): Promise<void> {
	const { error } = await supabase.rpc('set_schedule_publicity', {
		conference_id: conferenceId,
		is_public: isPublic
	});

	if (error) {
		throw new Error(`Could not save whether the programme is public: ${error.message}`);
	}
}

/** A seat or a chair as the membership queries read it: a committee and its conference. */
type CommitteePlaceRow = { committee_id: string; committees: { conference_id: string } | null };

/** Throw the error of a membership query, if it had one. */
function throwIfFailed(error: { message: string } | null): void {
	if (error) {
		throw new Error(`Could not read the conferences you are part of: ${error.message}`);
	}
}

/** Turn seat or chair rows into committee places, leaving out a committee that could not be read. */
function toCommitteePlaces(rows: CommitteePlaceRow[]) {
	const places = [];

	for (const row of rows) {
		if (row.committees !== null) {
			places.push({ conferenceId: row.committees.conference_id, committeeId: row.committee_id });
		}
	}

	return places;
}

/** One role the reader holds, with what it grants, for the organiser question below. */
type MyRoleRow = {
	conference_id: string;
	conference_roles: { permissions: string[]; scope: 'conference' | 'committees' } | null;
};

/**
 * How one person is part of every conference they are part of, keyed by the
 * conference's id: their seats, their delegations, their staff rows and the
 * committees they chair.
 *
 * Five small queries run side by side. Each asks for this person's own rows,
 * which Row Level Security lets everybody read. The roles are a query of their
 * own because a staff row no longer says what somebody may do; their roles do.
 */
export async function readMyMemberships(
	supabase: SupabaseClient,
	userId: string
): Promise<Map<string, AudienceMembership>> {
	const [seats, delegations, staff, roles, chairs] = await Promise.all([
		supabase
			.from('seats')
			.select('committee_id, committees(conference_id)')
			.eq('user_id', userId)
			.overrideTypes<CommitteePlaceRow[], { merge: false }>(),
		supabase
			.from('delegation_members')
			.select('delegations(conference_id)')
			.eq('user_id', userId)
			.overrideTypes<{ delegations: { conference_id: string } | null }[], { merge: false }>(),
		supabase
			.from('conference_staff')
			.select('conference_id')
			.eq('user_id', userId)
			.overrideTypes<{ conference_id: string }[], { merge: false }>(),
		supabase
			.from('conference_role_members')
			.select('conference_id, conference_roles(permissions, scope)')
			.eq('user_id', userId)
			.overrideTypes<MyRoleRow[], { merge: false }>(),
		supabase
			.from('committee_chairs')
			.select('committee_id, committees(conference_id)')
			.eq('user_id', userId)
			.overrideTypes<CommitteePlaceRow[], { merge: false }>()
	]);

	throwIfFailed(seats.error);
	throwIfFailed(delegations.error);
	throwIfFailed(staff.error);
	throwIfFailed(roles.error);
	throwIfFailed(chairs.error);

	const delegationConferenceIds: string[] = [];

	for (const row of delegations.data ?? []) {
		if (row.delegations !== null) {
			delegationConferenceIds.push(row.delegations.conference_id);
		}
	}

	// The conferences where one of the reader's conference-wide roles is
	// everything, which is what `has_permission(id, 'administrator')` in the database asks too.
	const administeredConferenceIds = new Set<string>();

	for (const row of roles.data ?? []) {
		const role = row.conference_roles;

		if (
			role !== null &&
			role.scope === 'conference' &&
			role.permissions.includes('administrator')
		) {
			administeredConferenceIds.add(row.conference_id);
		}
	}

	const staffRows = (staff.data ?? []).map((row) => ({
		conferenceId: row.conference_id,
		isAdministrator: administeredConferenceIds.has(row.conference_id)
	}));

	return collectMemberships({
		seats: toCommitteePlaces(seats.data ?? []),
		delegationConferenceIds,
		staffRows,
		chairedCommittees: toCommitteePlaces(chairs.data ?? [])
	});
}

/**
 * How the signed-in person is part of one conference.
 *
 * Organisers are asked of the database's own `has_permission(id,
 * 'administrator')`, because an owner or admin of the organisation that runs
 * the conference is one without a staff row of their own.
 */
export async function readMyMembership(
	supabase: SupabaseClient,
	conferenceId: string,
	userId: string
): Promise<AudienceMembership> {
	const [memberships, canManage] = await Promise.all([
		readMyMemberships(supabase, userId),
		supabase.rpc('has_permission', { conference_id: conferenceId, permission: 'administrator' })
	]);

	if (canManage.error) {
		throw new Error(`Could not ask whether you run this conference: ${canManage.error.message}`);
	}

	const membership = memberships.get(conferenceId) ?? {
		isOrganiser: false,
		isParticipant: false,
		isStaff: false,
		committeeIds: []
	};

	if (canManage.data === true) {
		return { ...membership, isOrganiser: true, isStaff: true };
	}

	return membership;
}
