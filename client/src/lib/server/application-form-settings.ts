/**
 * Where the organiser's application form page gets the conference's own
 * settings: when people may apply, who may apply, what the form asks them, and
 * how many people have applied already.
 *
 * Files under `$lib/server` only ever run on the server, so this is where the
 * database is queried. Every function takes the Supabase client as its first
 * argument. Pages pass in `locals.supabase`, the client that knows who is
 * signed in, so the database's Row Level Security rules (see
 * `specs/02-architecture/permissions.md`) decide what each caller may read and
 * write: anybody who may see the conference reads these settings, and only
 * somebody who can manage it changes them.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** The two `conferences` columns the `Conference` type does not carry. */
export type ApplicationFormSettings = {
	/** 0 to 3: how many committee preferences the apply form asks for. */
	committeePreferenceCount: number;
	askMotivation: boolean;
};

/** Those same two columns, under the database's own names. */
type ApplicationFormSettingsRow = {
	committee_preference_count: number;
	ask_motivation: boolean;
};

/**
 * The two application settings that are not already on the conference.
 *
 * Everything else this page shows — the window, who may apply, the position
 * paper requirement — comes with `data.conference` from the layout. These two
 * do not, so they are read here, in one query rather than two, the way
 * `readPaymentSettings` in `./fees.ts` reads the three its own page needs. It
 * reads the `conferences` table rather than the `conferences_with_organization`
 * view the rest of the app reads, because neither column has anything to do
 * with the organisation, which is all the view adds.
 *
 * A conference that could not be read raises a plain error rather than
 * answering "not found": the layout above this page has already read this
 * conference, so there is no honest way for it to be missing here, and filling
 * in defaults would put a setting on screen that nobody chose.
 */
export async function readApplicationFormSettings(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<ApplicationFormSettings> {
	const { data, error } = await supabase
		.from('conferences')
		.select('committee_preference_count, ask_motivation')
		.eq('id', conferenceId)
		// `maybeSingle` returns one row, or `null` when nothing matches, instead of a list.
		.maybeSingle()
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<ApplicationFormSettingsRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not read the application form settings: ${error.message}`);
	}

	if (!data) {
		throw new Error(`Could not find the conference ${conferenceId}.`);
	}

	return {
		committeePreferenceCount: data.committee_preference_count,
		askMotivation: data.ask_motivation
	};
}

/** The "Window and who can apply" section's four columns, ready for the database. */
export type ApplicationWindowInput = {
	/** ISO timestamps, or null for no bound on that side. */
	applicationsOpenAt: string | null;
	applicationsCloseAt: string | null;
	acceptsIndividualApplications: boolean;
	acceptsDelegations: boolean;
};

/**
 * Save the four columns the "Window and who can apply" section owns, and
 * nothing else.
 *
 * The four columns the section below it owns — `committee_preference_count`,
 * `ask_motivation`, `position_paper_required` and `position_paper_deadline` —
 * are deliberately left out. Each section of the page has its own Save button,
 * so saving one section must not reach across and quietly write back whatever
 * the other section happened to be showing. `updateConferenceSettings` in
 * `./fees.ts` leaves the currency alone for the same kind of reason.
 *
 * `organization_id` is not written either. Migration 0008's
 * `protect_conferences_columns` trigger refuses an update that moves a
 * conference to another organisation, so sending even the organisation it
 * already belongs to would be asking for trouble.
 *
 * The `conferences` update policy asks `edit_conference`, so the database
 * refuses anybody who does not run this conference, however this is called.
 */
export async function updateApplicationWindow(
	supabase: SupabaseClient,
	conferenceId: string,
	applicationWindow: ApplicationWindowInput
): Promise<void> {
	const { error } = await supabase
		.from('conferences')
		.update({
			applications_open_at: applicationWindow.applicationsOpenAt,
			applications_close_at: applicationWindow.applicationsCloseAt,
			accepts_individual_applications: applicationWindow.acceptsIndividualApplications,
			accepts_delegations: applicationWindow.acceptsDelegations
		})
		.eq('id', conferenceId);

	if (error) {
		throw new Error(`Could not save the application window: ${error.message}`);
	}
}

/** The "What the form asks" section's four columns. */
export type ApplicationFormSettingsInput = {
	committeePreferenceCount: number;
	askMotivation: boolean;
	positionPaperRequired: boolean;
	/** An ISO timestamp, or null when no deadline is set. */
	positionPaperDeadline: string | null;
};

/**
 * Save the four columns the "What the form asks" section owns, and nothing
 * else.
 *
 * The four window columns are deliberately left out, for the reason
 * `updateApplicationWindow` above gives about its own neighbours: two sections,
 * two Save buttons, and neither may overwrite the other's half of the row.
 * `organization_id` is left out for the reason given there as well.
 *
 * The page checks before calling this that `committee_preference_count` is not
 * going down while non-draft applications exist. That rule lives on the page
 * rather than here because it needs a message to show the organiser;
 * `countSubmittedApplications` below is what it counts with.
 */
export async function updateApplicationFormSettings(
	supabase: SupabaseClient,
	conferenceId: string,
	settings: ApplicationFormSettingsInput
): Promise<void> {
	const { error } = await supabase
		.from('conferences')
		.update({
			committee_preference_count: settings.committeePreferenceCount,
			ask_motivation: settings.askMotivation,
			position_paper_required: settings.positionPaperRequired,
			position_paper_deadline: settings.positionPaperDeadline
		})
		.eq('id', conferenceId);

	if (error) {
		throw new Error(`Could not save the form settings: ${error.message}`);
	}
}

/**
 * How many people have really applied to this conference.
 *
 * The page locks two things on this number: the committee preference count may
 * not go down once people have applied, and a question's type or its options
 * may not change once there are answers to it.
 *
 * A draft application deliberately does not count. `06-features/applications.md`
 * says drafts are invisible to organisers, and the `applications` select policy
 * is "self; org.", so an organiser really can read one — which is why it has to
 * be left out here on purpose rather than by accident. Somebody who started the
 * form and never sent it has not applied, and locking the organiser's settings
 * on that would be locking them on nothing.
 */
export async function countSubmittedApplications(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<number> {
	const { count, error } = await supabase
		.from('applications')
		// `head: true` asks for the count and not the rows, so the page never fetches
		// three hundred whole applications to decide whether a radio button is
		// locked. A column still has to be named, and `id` is the cheapest one; none
		// of it comes back.
		.select('id', { count: 'exact', head: true })
		.eq('conference_id', conferenceId)
		// Every status but `draft`: submitted, accepted, rejected, waitlisted and
		// withdrawn all mean somebody applied.
		.neq('status', 'draft');

	if (error) {
		throw new Error(`Could not count the applications: ${error.message}`);
	}

	// Supabase answers with `null` rather than a number when it has no count to
	// report, and no count means nothing to count.
	return count ?? 0;
}
