/**
 * The queries behind application teams (Trello pZNcdPqU), for the applicant's
 * own application page and the organiser's review page. The rules and words
 * are in `$lib/application-teams.ts`; the database side is migration
 * 20261010120000_application_teams.sql.
 *
 * Every write is a database function rather than an update from here, because
 * `team_id` is a column neither an applicant nor an organiser may write
 * directly: the functions check who is asking and keep a team from being left
 * with one member. Each one raises a plain sentence when it refuses, and that
 * sentence is what the thrown `Error` carries.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApplicationStatus } from '$lib/applications';
import {
	UNKNOWN_TEAM_CODE_REFUSAL,
	type MyTeam,
	type TeamMember,
	type TeamSeatChoice
} from '$lib/application-teams';
import type { SelectOption } from '$lib/components/SelectField.svelte';
import { APPLICATIONS_WITH_APPLICANT, applicantNameOf } from './application-table';

/** Calls one of the team functions and turns a refusal into a thrown sentence. */
async function callTeamFunction(
	supabase: SupabaseClient,
	functionName: string,
	parameters: Record<string, unknown>
): Promise<unknown> {
	const { data, error } = await supabase.rpc(functionName, parameters);

	if (error) {
		throw new Error(error.message);
	}

	return data;
}

/** The names of everybody in a team, oldest application first, keyed by user id. */
async function readTeamNames(
	supabase: SupabaseClient,
	teamId: string
): Promise<Map<string, string>> {
	const rows = (await callTeamFunction(supabase, 'application_team_names', {
		team_id: teamId
	})) as { user_id: string; full_name: string | null }[];

	return new Map(rows.map((row) => [row.user_id, applicantNameOf(row.full_name)]));
}

/** The team an application is in, or null. */
async function readTeamId(
	supabase: SupabaseClient,
	conferenceId: string,
	applicationId: string
): Promise<string | null> {
	const { data, error } = await supabase
		.from('applications')
		.select('team_id')
		.eq('id', applicationId)
		.eq('conference_id', conferenceId)
		.maybeSingle();

	if (error) {
		throw new Error(`Could not read the team: ${error.message}`);
	}

	return data?.team_id ?? null;
}

/**
 * The applicant's own team: its code and its members' names, or null when
 * they have not started or joined one.
 */
export async function readMyTeam(
	supabase: SupabaseClient,
	conferenceId: string,
	applicationId: string
): Promise<MyTeam | null> {
	const teamId = await readTeamId(supabase, conferenceId, applicationId);

	if (teamId === null) {
		return null;
	}

	const [{ data, error }, names] = await Promise.all([
		supabase.from('application_teams').select('join_code').eq('id', teamId).single(),
		readTeamNames(supabase, teamId)
	]);

	if (error) {
		throw new Error(`Could not read the team: ${error.message}`);
	}

	return { joinCode: data.join_code, memberNames: [...names.values()] };
}

/** Start a team for the applicant's own application. */
export async function startMyTeam(supabase: SupabaseClient, applicationId: string): Promise<void> {
	await callTeamFunction(supabase, 'start_application_team', { application_id: applicationId });
}

/**
 * Join the team a friend gave the code of, leaving any other team first.
 *
 * A code that matches no team comes back as null rather than as an error. The
 * database counts the wrong code towards an hourly cap, and raising an error
 * would undo that count; the page still expects the sentence, so it is thrown
 * from here instead.
 */
export async function joinMyTeam(
	supabase: SupabaseClient,
	applicationId: string,
	code: string
): Promise<void> {
	const teamId = await callTeamFunction(supabase, 'join_application_team', {
		application_id: applicationId,
		code
	});

	if (teamId === null) {
		throw new Error(UNKNOWN_TEAM_CODE_REFUSAL);
	}
}

/** Leave the team; a team left with one member is dissolved. */
export async function leaveMyTeam(supabase: SupabaseClient, applicationId: string): Promise<void> {
	await callTeamFunction(supabase, 'leave_application_team', { application_id: applicationId });
}

/**
 * Everybody in the same team as this application, itself included, oldest
 * application first. An empty list when the application is in no team.
 *
 * A member still writing their draft is listed too, so the organiser can see
 * the team is waiting on them.
 */
export async function listTeamMembers(
	supabase: SupabaseClient,
	conferenceId: string,
	applicationId: string
): Promise<TeamMember[]> {
	const teamId = await readTeamId(supabase, conferenceId, applicationId);

	if (teamId === null) {
		return [];
	}

	const [{ data, error }, names] = await Promise.all([
		supabase
			.from('applications')
			.select('id, user_id, status, committee_preferences')
			.eq('team_id', teamId)
			.order('created_at'),
		readTeamNames(supabase, teamId)
	]);

	if (error) {
		throw new Error(`Could not read the team: ${error.message}`);
	}

	return data.map((row) => ({
		applicationId: row.id,
		userId: row.user_id,
		fullName: names.get(row.user_id) ?? applicantNameOf(null),
		status: row.status as ApplicationStatus,
		committeePreferences: row.committee_preferences
	}));
}

/**
 * The applications an organiser may add to this team, as "Add to team" lists
 * them: everybody still under review at this conference, by name, except the
 * team's own members.
 */
export async function listTeamPartnerOptions(
	supabase: SupabaseClient,
	conferenceId: string,
	excludedApplicationIds: string[]
): Promise<SelectOption[]> {
	const { data, error } = await supabase
		.from(APPLICATIONS_WITH_APPLICANT)
		.select('id, applicant_name')
		.eq('conference_id', conferenceId)
		.in('status', ['submitted', 'waitlisted'])
		.order('applicant_name')
		.overrideTypes<{ id: string; applicant_name: string | null }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the applications: ${error.message}`);
	}

	const excluded = new Set(excludedApplicationIds);

	return data
		.filter((row) => !excluded.has(row.id))
		.map((row) => ({ value: row.id, label: applicantNameOf(row.applicant_name) }));
}

/** Put two applications in one team, the organiser's way. */
export async function teamApplications(
	supabase: SupabaseClient,
	applicationId: string,
	partnerApplicationId: string
): Promise<void> {
	await callTeamFunction(supabase, 'team_applications', {
		application_id: applicationId,
		partner_application_id: partnerApplicationId
	});
}

/** Take one application out of its team, the organiser's way. */
export async function removeFromTeam(
	supabase: SupabaseClient,
	applicationId: string
): Promise<void> {
	await callTeamFunction(supabase, 'remove_application_from_team', {
		application_id: applicationId
	});
}

/**
 * Accept every member into their chosen seat in one go: all of them, or, when
 * any seat has been taken in the meantime, none of them.
 */
export async function acceptTeam(
	supabase: SupabaseClient,
	choices: TeamSeatChoice[]
): Promise<void> {
	await callTeamFunction(supabase, 'accept_application_team', {
		application_ids: choices.map((choice) => choice.applicationId),
		seat_ids: choices.map((choice) => choice.seat.id)
	});
}
