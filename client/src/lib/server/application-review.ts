/**
 * The organiser's review page at `/manage/[slug]/applications/[applicationId]`,
 * where an organiser reads one application in full and decides it
 * (`specs/05-pages/organiser/application-review.md`). The shapes it answers
 * with live in `$lib/application-review.ts`.
 *
 * Files under `$lib/server` only ever run on the server, so this is where the
 * database is queried. Pages pass in `locals.supabase`, the client that knows
 * who is signed in, so Row Level Security decides what each caller may read
 * and write.
 *
 * The page reads the same `applications_with_applicant` view as the table in
 * `./application-table.ts`, and the same seat, invoice and committee lookups
 * as the applicant's own page in `./applications.ts`, so it borrows both
 * rather than keeping a second copy of either.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	ApplicationAnswers,
	ApplicationListQuery,
	ApplicationStatus
} from '$lib/applications';
import type {
	ApplicantDetails,
	ApplicationForReview,
	QueueNeighbours,
	ReviewSeat,
	RevokeTo
} from '$lib/application-review';
import { committeeHeading } from '$lib/committees';
import type { ExperienceLevel } from '$lib/profiles';
import { revokeSeat } from './allocation-grid';
import {
	APPLICATIONS_WITH_APPLICANT,
	EXPORT_BATCH_SIZE,
	applicantNameOf,
	matchingApplicationsRequest
} from './application-table';
import { listApplicationQuestions } from './application-questions';
import { readPrivateDetails } from './private-details';
import {
	findInvoiceForSeat,
	findSeatForApplication,
	listPreferredCommitteeNames
} from './applications';

/** The error code Postgres sends when an id is not a uuid at all. */
const INVALID_ID_CODE = '22P02';

/** The error code Supabase sends when a page number is past the last page of results. */
const PAGE_OUT_OF_RANGE_CODE = 'PGRST103';

/**
 * The columns the review page reads, from the same view as the table.
 *
 * The view brings the applicant's name, school, country and experience along,
 * so one request answers for the application and the public half of the
 * applicant. The organisers' own note is not a column of the application any
 * more: it lives in `application_internal_notes`, a table only they can read
 * (migration 20261022132000), and `readInternalNote` below fetches it.
 */
const REVIEW_APPLICATION_COLUMNS =
	'id, conference_id, user_id, status, committee_preferences, seat_preferences, motivation, answers, submitted_at, decided_at, decision_note, applicant_name, applicant_avatar_path, applicant_institution_name, applicant_country_code, applicant_experience_level';

/** One row of the view as the review page reads it. */
type ReviewApplicationQueryRow = {
	id: string;
	conference_id: string;
	user_id: string;
	/** A `draft` can come back, because the organiser may read one; the caller turns it away. */
	status: ApplicationStatus;
	committee_preferences: string[];
	seat_preferences: string | null;
	motivation: string | null;
	answers: ApplicationAnswers;
	submitted_at: string | null;
	decided_at: string | null;
	decision_note: string | null;
	/** `null` for every one of these when the applicant's profile could not be read. */
	applicant_name: string | null;
	applicant_avatar_path: string | null;
	applicant_institution_name: string | null;
	applicant_country_code: string | null;
	applicant_experience_level: ExperienceLevel | null;
};

/**
 * The applicant's private details as far as the reader's permissions show them,
 * or `null` when none could be read.
 */
async function readOneApplicantDetails(
	supabase: SupabaseClient,
	userId: string
): Promise<ApplicantDetails | null> {
	const details = await readPrivateDetails(supabase, [userId]);
	const row = details.get(userId);

	if (row === undefined) {
		return null;
	}

	return {
		email: row.email,
		dateOfBirth: row.date_of_birth,
		phone: row.phone,
		dietaryRequirements: row.dietary_requirements,
		emergencyContactName: row.emergency_contact_name,
		emergencyContactPhone: row.emergency_contact_phone
	};
}

/**
 * Everything the organiser's review page shows about one application, or
 * `null` when there is no such application in this conference, or when it is
 * still a `draft`.
 *
 * The conference is part of the question, so an id from somebody else's
 * conference is nothing rather than a page to reach by guessing. A `draft` is
 * nothing too, and that one is not left to Row Level Security: the select
 * policy is "self; org.", so an organiser of the conference can read a draft,
 * and `05-pages/organiser/application-review.md` asks for a 404 all the same,
 * because an application nobody has sent is not one to decide.
 *
 * Two rounds of queries. The application first, because everything else is
 * looked up by what it holds; then the private details, the questions, the
 * committee names and the seat side by side; then the seat's invoice, which is
 * found by the seat's id. The private details come through the two views in
 * `./private-details.ts`, which answer only for what the reader's permissions
 * open (`docs/roles-and-permissions.md`, section 5).
 */
export async function getApplicationForReview(
	supabase: SupabaseClient,
	conferenceId: string,
	applicationId: string
): Promise<ApplicationForReview | null> {
	const { data, error } = await supabase
		.from(APPLICATIONS_WITH_APPLICANT)
		.select(REVIEW_APPLICATION_COLUMNS)
		.eq('id', applicationId)
		.eq('conference_id', conferenceId)
		.maybeSingle()
		.overrideTypes<ReviewApplicationQueryRow, { merge: false }>();

	// A malformed id is refused by Postgres rather than simply not found. It can
	// only come from an address somebody typed or edited by hand, and it names
	// nothing, so the page answers 404 like any other id it cannot find.
	if (error?.code === INVALID_ID_CODE) {
		return null;
	}

	if (error) {
		throw new Error(`Could not load the application: ${error.message}`);
	}

	if (!data || data.status === 'draft') {
		return null;
	}

	// None of these five needs another's answer, so they are sent at once.
	const [details, questions, preferredCommittees, seatRow, internalNote] = await Promise.all([
		readOneApplicantDetails(supabase, data.user_id),
		listApplicationQuestions(supabase, conferenceId),
		listPreferredCommitteeNames(supabase, data.committee_preferences),
		findSeatForApplication(supabase, data.id),
		readInternalNote(supabase, data.id)
	]);

	const invoice = seatRow === null ? null : await findInvoiceForSeat(supabase, seatRow.id);

	let seat: ReviewSeat | null = null;

	if (seatRow !== null) {
		seat = {
			id: seatRow.id,
			name: seatRow.name,
			committeeLabel: committeeHeading(seatRow.committees)
		};
	}

	return {
		application: {
			id: data.id,
			conferenceId: data.conference_id,
			status: data.status,
			committeePreferences: data.committee_preferences,
			seatPreferences: data.seat_preferences,
			motivation: data.motivation,
			answers: data.answers,
			submittedAt: data.submitted_at,
			decidedAt: data.decided_at,
			decisionNote: data.decision_note,
			internalNote
		},
		profile: {
			userId: data.user_id,
			fullName: applicantNameOf(data.applicant_name),
			avatarPath: data.applicant_avatar_path,
			institutionName: data.applicant_institution_name,
			countryCode: data.applicant_country_code,
			experienceLevel: data.applicant_experience_level
		},
		details,
		questions,
		preferredCommittees,
		seat,
		invoice
	};
}

/**
 * The applications either side of this one in the queue the organiser came
 * from: the same tab, search, filters and sort as the table, in the same order.
 *
 * The queue is read the way the CSV export reads it, a window of ids at a time,
 * because `max_rows` caps one answer and an application can be anywhere in a
 * long queue. Only the ids are asked for, and the reading stops as soon as the
 * one after this application has been seen.
 *
 * An application that is not in the queue at all — the organiser has just
 * decided it, so it has left the "Submitted" tab — has no neighbours, and the
 * page hides "Previous" and "Next" rather than guess.
 */
export async function findQueueNeighbours(
	supabase: SupabaseClient,
	conferenceId: string,
	query: ApplicationListQuery,
	applicationId: string
): Promise<QueueNeighbours> {
	let previousId: string | null = null;
	let hasFoundApplication = false;
	let firstIndex = 0;

	while (true) {
		const { data, error } = await matchingApplicationsRequest(supabase, conferenceId, query, 'id')
			.range(firstIndex, firstIndex + EXPORT_BATCH_SIZE - 1)
			.overrideTypes<{ id: string }[], { merge: false }>();

		// Past the last row: the end of the queue, the same way it is for the export.
		if (error?.code === PAGE_OUT_OF_RANGE_CODE) {
			break;
		}

		if (error) {
			throw new Error(`Could not read the applications: ${error.message}`);
		}

		const batch: { id: string }[] = data ?? [];

		if (batch.length === 0) {
			break;
		}

		for (const row of batch) {
			if (hasFoundApplication) {
				return { previousId, nextId: row.id };
			}

			if (row.id === applicationId) {
				hasFoundApplication = true;
			} else {
				previousId = row.id;
			}
		}

		firstIndex = firstIndex + batch.length;
	}

	if (!hasFoundApplication) {
		return { previousId: null, nextId: null };
	}

	return { previousId, nextId: null };
}

/**
 * Take an accepted applicant's seat back, leaving the application `rejected`
 * or `withdrawn`.
 *
 * `revokeSeat` in `./allocation-grid.ts` does the real work in one database function: it
 * rejects the application with the date and the decider, empties the seat and
 * voids an unpaid invoice while leaving a paid one alone. It always leaves the
 * application `rejected`, so "Withdrawn" is a second, small write afterwards.
 * `guard_application_update` lets an organiser set that status, and the update
 * only matches a row that is still `rejected`, so it never undoes a decision
 * somebody else made in between.
 *
 * The two writes are not one transaction, and `notify_application_decided`
 * has already told the applicant "not accepted" by the time the status becomes
 * `withdrawn`. `specs/07-delivery/open-questions.md` records both under T71.
 */
export async function revokeAcceptance(
	supabase: SupabaseClient,
	applicationId: string,
	seatId: string,
	revokeTo: RevokeTo
): Promise<void> {
	await revokeSeat(supabase, seatId);

	if (revokeTo === 'rejected') {
		return;
	}

	const { error } = await supabase
		.from('applications')
		.update({ status: 'withdrawn' })
		.eq('id', applicationId)
		.eq('status', 'rejected');

	if (error) {
		throw new Error(`Could not mark the application withdrawn: ${error.message}`);
	}
}

/**
 * The note only the organisers of this conference ever read, or `null` when
 * nobody has written one or the box was emptied.
 *
 * It is a row of `application_internal_notes` rather than a column of the
 * application, because the applicant may read their own application row and a
 * policy decides rows, not columns. The note's own table has policies of its
 * own: `read_applications` reads, `decide_applications` writes, and nobody
 * else gets a row.
 */
async function readInternalNote(
	supabase: SupabaseClient,
	applicationId: string
): Promise<string | null> {
	const { data, error } = await supabase
		.from('application_internal_notes')
		.select('note')
		.eq('application_id', applicationId)
		.maybeSingle()
		.overrideTypes<{ note: string | null }, { merge: false }>();

	if (error) {
		throw new Error(`Could not read the internal note: ${error.message}`);
	}

	return data?.note ?? null;
}

/**
 * Save the note only the organisers of this conference ever read.
 *
 * An upsert, because the first note on an application makes its row and every
 * later one changes it. An emptied box stores `null` rather than an empty
 * string, so "no note" always reads the same way.
 */
export async function updateApplicationInternalNote(
	supabase: SupabaseClient,
	applicationId: string,
	internalNote: string
): Promise<void> {
	const { error } = await supabase
		.from('application_internal_notes')
		.upsert({ application_id: applicationId, note: internalNote === '' ? null : internalNote });

	if (error) {
		throw new Error(`Could not save the note: ${error.message}`);
	}
}
