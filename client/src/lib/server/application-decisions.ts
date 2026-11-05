/**
 * Deciding one application: accepting it into a seat, waitlisting it, marking
 * it not accepted, and saving the organisers' note on it.
 *
 * Two places decide one application at a time, the review page and the review
 * panel beside the applications list, and both call these. Each function first
 * checks the application can still be decided that way, then writes, and then
 * answers either the flash to show or the sentence that says why nothing
 * happened. Neither page has to know how the database words its refusals.
 *
 * Files under `$lib/server` only ever run on the server.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	ALREADY_DECIDED_REFUSAL,
	CHOOSE_SEAT_REFUSAL,
	INTERNAL_NOTE_MAX_LENGTH,
	INTERNAL_NOTE_SAVED_FLASH,
	INTERNAL_NOTE_TOO_LONG_REFUSAL,
	REJECTED_FLASH,
	SEAT_JUST_TAKEN_REFUSAL,
	WAITLISTED_FLASH,
	acceptedFlash,
	canAllocate,
	canReject,
	canWaitlist,
	findFreeSeat,
	type ApplicationForReview
} from '$lib/application-review';
import {
	CHOOSE_COUNTRY_REFUSAL,
	COUNTRY_JUST_TAKEN_REFUSAL,
	TEAM_REJECTED_FLASH,
	TEAM_WAITLISTED_FLASH,
	assignTeamSeats,
	isOpenMember,
	teamAcceptedFlash,
	type TeamMember
} from '$lib/application-teams';
import { DECISION_NOTE_MAX_LENGTH } from '$lib/applications';
import { UNEXPECTED_ERROR_TEXT } from '$lib/auth';
import { rejectApplications, waitlistApplications } from '$lib/server/application-bulk-decisions';
import { updateApplicationInternalNote } from '$lib/server/application-review';
import { acceptTeam } from '$lib/server/application-teams';
import { acceptApplication, listSeatsByCommittee } from '$lib/server/seat-acceptance';

/**
 * Words from the sentences `accept_application` raises, from T26's migration.
 *
 * They are matched on their words rather than on a code of our own, because a
 * Postgres exception arrives as a sentence. Anything that matches none of them
 * is somebody else's text — a driver's, Postgres's, PostgREST's — and is logged
 * rather than shown, which `03-design/writing-style.md` asks for.
 */
const SEAT_NOT_FREE_WORDS = 'That seat is not free';
const SEAT_NOT_IN_CONFERENCE_WORDS = 'That seat is not part of this conference';
const NOT_ACCEPTABLE_WORDS = 'Only a submitted or waitlisted application can be accepted';

/** What a decision came to: done, with the flash to show, or refused, with the reason. */
export type DecisionOutcome = { isDone: true; flash: string } | { isDone: false; message: string };

/** A decision that went through, with the sentence the flash says. */
function done(flash: string): DecisionOutcome {
	return { isDone: true, flash };
}

/** A decision that did not, with the sentence that says why. */
function refused(message: string): DecisionOutcome {
	return { isDone: false, message };
}

/** The error message of whatever was thrown, whatever it was. */
export function messageOf(thrown: unknown): string {
	return thrown instanceof Error ? thrown.message : String(thrown);
}

/** The note to the applicant, trimmed and cut to the length the box allows. */
export function readDecisionNote(formData: FormData): string {
	return String(formData.get('decisionNote') ?? '')
		.trim()
		.slice(0, DECISION_NOTE_MAX_LENGTH);
}

/**
 * The organisers' note, trimmed. It is not cut to length: `saveInternalNote`
 * refuses a note that is too long, so nothing typed is lost without a word.
 */
export function readInternalNote(formData: FormData): string {
	return String(formData.get('internalNote') ?? '').trim();
}

/** What the decision says when `accept_application` refused. */
function acceptRefusal(thrown: unknown): string {
	const databaseMessage = messageOf(thrown);

	if (
		databaseMessage.includes(SEAT_NOT_FREE_WORDS) ||
		databaseMessage.includes(SEAT_NOT_IN_CONFERENCE_WORDS)
	) {
		return SEAT_JUST_TAKEN_REFUSAL;
	}

	if (databaseMessage.includes(NOT_ACCEPTABLE_WORDS)) {
		return ALREADY_DECIDED_REFUSAL;
	}

	console.error('Could not accept an application', thrown);

	return UNEXPECTED_ERROR_TEXT;
}

/**
 * Give the applicant the chosen seat, which accepts them and writes their
 * invoice. `seatId` is `''` when no seat was chosen.
 */
export async function acceptIntoSeat(
	supabase: SupabaseClient,
	conferenceId: string,
	review: ApplicationForReview,
	seatId: string
): Promise<DecisionOutcome> {
	if (!canAllocate(review.application.status)) return refused(ALREADY_DECIDED_REFUSAL);
	if (seatId === '') return refused(CHOOSE_SEAT_REFUSAL);

	/*
		The page is a moment old, so the seat it offered may have been given to
		somebody else since. Asking the free seats again says so in the page's
		own words, and finds the names the flash needs.
	*/
	const freeSeats = await listSeatsByCommittee(supabase, conferenceId);
	const choice = findFreeSeat(freeSeats, seatId);

	if (choice === null) return refused(SEAT_JUST_TAKEN_REFUSAL);

	try {
		await acceptApplication(supabase, review.application.id, seatId);
	} catch (thrown) {
		return refused(acceptRefusal(thrown));
	}

	return done(acceptedFlash(review.profile.fullName, choice.seat.name, choice.committeeLabel));
}

/**
 * Put an application still under review on the waiting list. `decisionNote`
 * is `''` for no note, which leaves any note already written as it was.
 *
 * `teammateIds` are the other open applications of its team (Trello
 * pZNcdPqU): a team is decided as one, so they go on the list with it.
 */
export async function waitlistOne(
	supabase: SupabaseClient,
	review: ApplicationForReview,
	organiserId: string,
	decisionNote: string,
	teammateIds: string[] = []
): Promise<DecisionOutcome> {
	if (!canWaitlist(review.application.status)) return refused(ALREADY_DECIDED_REFUSAL);

	try {
		const outcome = await waitlistApplications(
			supabase,
			review.application.conferenceId,
			[review.application.id, ...teammateIds],
			organiserId,
			decisionNote === '' ? null : decisionNote
		);

		// The update only matches a row still `submitted`, so nothing moving means
		// another organiser decided it between the read above and this write.
		if (outcome.changedCount === 0) return refused(ALREADY_DECIDED_REFUSAL);
	} catch (thrown) {
		console.error('Could not waitlist an application', thrown);

		return refused(UNEXPECTED_ERROR_TEXT);
	}

	return done(teammateIds.length === 0 ? WAITLISTED_FLASH : TEAM_WAITLISTED_FLASH);
}

/**
 * Mark the application "not accepted" and tell the applicant, with the note if
 * there is one. `teammateIds` are rejected with it, as `waitlistOne` explains.
 */
export async function rejectOne(
	supabase: SupabaseClient,
	review: ApplicationForReview,
	organiserId: string,
	decisionNote: string,
	teammateIds: string[] = []
): Promise<DecisionOutcome> {
	if (!canReject(review.application.status)) return refused(ALREADY_DECIDED_REFUSAL);

	try {
		const outcome = await rejectApplications(
			supabase,
			review.application.conferenceId,
			[review.application.id, ...teammateIds],
			organiserId,
			decisionNote === '' ? null : decisionNote
		);

		if (outcome.changedCount === 0) return refused(ALREADY_DECIDED_REFUSAL);
	} catch (thrown) {
		console.error('Could not reject an application', thrown);

		return refused(UNEXPECTED_ERROR_TEXT);
	}

	return done(teammateIds.length === 0 ? REJECTED_FLASH : TEAM_REJECTED_FLASH);
}

/**
 * Accept every open member of a team into one country, each in a committee of
 * their own (Trello pZNcdPqU). `countryCode` is `''` when none was chosen.
 *
 * The seats are worked out from the free seats as they are now, not as the
 * page showed them, so a seat taken in between is simply not chosen; and the
 * database accepts all of the members or none of them.
 */
export async function acceptTeamIntoCountry(
	supabase: SupabaseClient,
	conferenceId: string,
	members: TeamMember[],
	countryCode: string
): Promise<DecisionOutcome> {
	const openMembers = members.filter(isOpenMember);

	if (openMembers.length === 0) return refused(ALREADY_DECIDED_REFUSAL);
	if (countryCode === '') return refused(CHOOSE_COUNTRY_REFUSAL);

	const freeSeats = await listSeatsByCommittee(supabase, conferenceId);
	const choices = assignTeamSeats(freeSeats, openMembers, countryCode);

	if (choices === null) return refused(COUNTRY_JUST_TAKEN_REFUSAL);

	try {
		await acceptTeam(supabase, choices);
	} catch (thrown) {
		const message = acceptRefusal(thrown);

		return refused(message === SEAT_JUST_TAKEN_REFUSAL ? COUNTRY_JUST_TAKEN_REFUSAL : message);
	}

	const names = new Map(members.map((member) => [member.applicationId, member.fullName]));

	return done(teamAcceptedFlash(choices, names));
}

/** Save the note only the organisers ever read. `internalNote` is already trimmed. */
export async function saveInternalNote(
	supabase: SupabaseClient,
	review: ApplicationForReview,
	internalNote: string
): Promise<DecisionOutcome> {
	if (internalNote.length > INTERNAL_NOTE_MAX_LENGTH) {
		return refused(INTERNAL_NOTE_TOO_LONG_REFUSAL);
	}

	try {
		await updateApplicationInternalNote(supabase, review.application.id, internalNote);
	} catch (thrown) {
		console.error('Could not save an internal note', thrown);

		return refused(UNEXPECTED_ERROR_TEXT);
	}

	return done(INTERNAL_NOTE_SAVED_FLASH);
}
