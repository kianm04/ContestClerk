/**
 * The organiser's review page for one individual application,
 * `/manage/[slug]/applications/[applicationId]`: the shapes it draws, the
 * sentences its five actions answer with, and the small rules about which
 * decision may be taken from which status.
 *
 * Everything here is pure, so it can be read and tested without Svelte or a
 * database. The page's own wording comes from
 * `specs/05-pages/organiser/application-review.md`.
 */

import type { PrivateDetailsAccess } from '$lib/private-details';
import type { AllocatableSeat, SeatGroup } from '$lib/allocation';
import {
	answerText,
	type ApplicationAnswers,
	type ApplicationStatus,
	type MyApplicationInvoice
} from '$lib/applications';
import type { ApplicationQuestion } from '$lib/application-questions';
import type { KeyValueItem } from '$lib/components/KeyValueList.svelte';
import type { RadioOption } from '$lib/components/RadioGroup.svelte';
import type { SelectOption } from '$lib/components/SelectField.svelte';
import { countryName } from '$lib/countries';
import type { ExperienceLevel } from '$lib/profiles';
import { statusLabel } from '$lib/status';

/** One application as the organiser reads it: everything the applicant sent, and the decision. */
export type ReviewApplication = {
	id: string;
	conferenceId: string;
	status: ApplicationStatus;
	/** The committee ids the applicant asked for, in their own order. */
	committeePreferences: string[];
	seatPreferences: string | null;
	motivation: string | null;
	/** One answer per custom question, keyed by `application_questions.id`. */
	answers: ApplicationAnswers;
	/** ISO timestamps. */
	submittedAt: string | null;
	decidedAt: string | null;
	/** What the organisers wrote to the applicant. */
	decisionNote: string | null;
	/** What the organisers wrote to each other. The applicant never reads it. */
	internalNote: string | null;
};

/** The public half of the applicant: the `profiles` row. */
export type ApplicantProfile = {
	/** Whose profile this is, for the link to their public page at `/people/[userId]`. */
	userId: string;
	fullName: string;
	avatarPath: string | null;
	institutionName: string | null;
	countryCode: string | null;
	/** `null` only when the applicant's account has gone since and nothing could be read. */
	experienceLevel: ExperienceLevel | null;
};

/**
 * The private half of the applicant, as far as the reader's permissions show it
 * (`$lib/server/private-details.ts`). A field the reader may not see is `null`.
 */
export type ApplicantDetails = {
	email: string | null;
	/** `YYYY-MM-DD`, or `null`. */
	dateOfBirth: string | null;
	phone: string | null;
	dietaryRequirements: string | null;
	emergencyContactName: string | null;
	emergencyContactPhone: string | null;
};

/** The seat an accepted application holds. */
export type ReviewSeat = {
	id: string;
	name: string;
	/** "UNSC", or the full name of a committee without a short one. */
	committeeLabel: string;
};

/** Everything `getApplicationForReview` gathers about one application. */
export type ApplicationForReview = {
	application: ReviewApplication;
	/** The applicant's name and public facts. */
	profile: ApplicantProfile;
	/**
	 * The applicant's private facts, or `null` when the database gave none back.
	 * The page then shows "Not provided" in every row rather than a blank list.
	 */
	details: ApplicantDetails | null;
	/** The conference's custom questions, in the order they were asked. */
	questions: ApplicationQuestion[];
	/** The preferred committees, named and in the applicant's order. */
	preferredCommittees: string[];
	/** The seat, only for an accepted application. */
	seat: ReviewSeat | null;
	/** The newest invoice for that seat, or `null` for a conference that charges nothing. */
	invoice: MyApplicationInvoice | null;
};

/** The applications either side of this one in the queue the organiser came from. */
export type QueueNeighbours = {
	previousId: string | null;
	nextId: string | null;
};

/**
 * Where each of the page's five forms posts to. `load` builds them with
 * `manageApplicationReviewActionUrl`, so every post keeps the queue the page
 * was opened from.
 */
export type ReviewActionUrls = {
	accept: string;
	waitlist: string;
	reject: string;
	revoke: string;
	saveInternalNote: string;
};

/** Which of the two statuses "Revoke acceptance" leaves the application in. */
export type RevokeTo = 'rejected' | 'withdrawn';

/** The longest the internal note may be, matching its text box. */
export const INTERNAL_NOTE_MAX_LENGTH = 2000;

/** What a row the applicant left empty says, so a blank never looks like a fault. */
export const NOT_PROVIDED = 'Not provided';

/** What the age row says without a date of birth. */
export const UNKNOWN_AGE = 'Unknown';

/** `accept` without a seat chosen. */
export const CHOOSE_SEAT_REFUSAL = 'Choose a seat first.';

/** `accept` with a seat somebody else was given while the page was open. */
export const SEAT_JUST_TAKEN_REFUSAL = 'That seat was just taken. Pick another.';

/** Any decision on an application whose status no longer allows it. */
export const ALREADY_DECIDED_REFUSAL = 'This application was already decided.';

/** `revoke` on an application that holds no seat any more. */
export const NOTHING_TO_REVOKE_REFUSAL = 'This application no longer holds a seat.';

/** `saveInternalNote` with a note longer than the column allows. */
export const INTERNAL_NOTE_TOO_LONG_REFUSAL = `Keep the note under ${INTERNAL_NOTE_MAX_LENGTH} characters.`;

/** The flashes of the three decisions that need no names in them. */
export const WAITLISTED_FLASH = 'Application waitlisted.';
export const REJECTED_FLASH = 'Marked as not accepted. The applicant has been notified.';
export const INTERNAL_NOTE_SAVED_FLASH = 'Note saved.';

/** The two choices under "Revoke acceptance". */
export const REVOKE_TO_OPTIONS: RadioOption[] = [
	{ value: 'rejected', label: 'Not accepted', description: 'The organisers took the seat back.' },
	{ value: 'withdrawn', label: 'Withdrawn', description: 'The applicant is no longer coming.' }
];

/** Whether a seat may still be given: `submitted` and `waitlisted` can both be accepted. */
export function canAllocate(status: ApplicationStatus): boolean {
	return status === 'submitted' || status === 'waitlisted';
}

/** Only an application still under review may be waitlisted. */
export function canWaitlist(status: ApplicationStatus): boolean {
	return status === 'submitted';
}

/** "Not accepted" is open to exactly the statuses a seat may be given from. */
export function canReject(status: ApplicationStatus): boolean {
	return canAllocate(status);
}

/** Only an accepted application holds a seat to take back. */
export function canRevoke(status: ApplicationStatus): boolean {
	return status === 'accepted';
}

/**
 * The `revokeTo` field of the revoke form. Anything but `withdrawn` is read as
 * `rejected`, because anybody can post anything and "not accepted" is what
 * taking a seat back means unless the organiser said otherwise.
 */
export function readRevokeTo(value: string): RevokeTo {
	return value === 'withdrawn' ? 'withdrawn' : 'rejected';
}

/** "Anna Kowalski is now France in UNSC.", the flash after `accept`. */
export function acceptedFlash(applicantName: string, seatName: string, committeeLabel: string) {
	return `${applicantName} is now ${seatName} in ${committeeLabel}.`;
}

/**
 * The flash after `revoke`. A paid invoice is never voided, so when there is
 * one the organiser is told which invoice still needs its money sent back.
 */
export function revokedFlash(paidInvoiceNumber: string | null): string {
	if (paidInvoiceNumber === null) {
		return 'The seat is free again.';
	}

	return `The seat is free again. The paid invoice ${paidInvoiceNumber} still needs a manual refund.`;
}

/**
 * Every free seat as one dropdown offers it, each named "UNSC · France".
 *
 * One dropdown rather than the wireframe's two, because a second dropdown that
 * follows the first needs JavaScript to change its list, and every action on
 * this page works without it. Nothing is lost: `suggestSeats` already put the
 * committees the applicant asked for first, in their own order.
 */
export function seatChoiceOptions(groups: SeatGroup[]): SelectOption[] {
	return groups.flatMap((group) =>
		group.seats.map((seat) => ({
			value: seat.id,
			label: `${group.committeeLabel} · ${seat.name}`
		}))
	);
}

/** One free seat, with the label of the committee it belongs to. */
export type FreeSeatChoice = {
	seat: AllocatableSeat;
	committeeLabel: string;
};

/**
 * The free seat with this id, or `null` when none of the groups offers it.
 *
 * `accept` asks this before calling the database: a seat the page offered a
 * moment ago that is no longer here was taken in between, and the flash after
 * a successful accept needs the seat's and the committee's names anyway.
 */
export function findFreeSeat(groups: SeatGroup[], seatId: string): FreeSeatChoice | null {
	for (const group of groups) {
		const seat = group.seats.find((candidate) => candidate.id === seatId);

		if (seat !== undefined) {
			return { seat, committeeLabel: group.committeeLabel };
		}
	}

	return null;
}

/**
 * The number of the seat's invoice when it has been paid, or `null`.
 *
 * `revoke_seat` voids an unpaid invoice but never a paid one, because money
 * has changed hands, so a paid one is the one the organiser still has to refund
 * by hand and `revokedFlash` names it.
 */
export function paidInvoiceNumberOf(invoice: MyApplicationInvoice | null): string | null {
	if (invoice === null || invoice.status !== 'paid') {
		return null;
	}

	return invoice.number;
}

/** A detail the applicant never filled in reads "Not provided" rather than being left blank. */
function detailOrNotProvided(value: string | null | undefined): string {
	if (value === null || value === undefined || value.trim() === '') {
		return NOT_PROVIDED;
	}

	return value;
}

/** "Maria Kowalska · +48 600 100 200", or whichever half was given. */
function emergencyContactText(details: ApplicantDetails | null): string {
	const parts = [details?.emergencyContactName, details?.emergencyContactPhone]
		.map((part) => part?.trim() ?? '')
		.filter((part) => part !== '');

	return detailOrNotProvided(parts.join(' · '));
}

/**
 * The applicant's profile as rows for `KeyValueList`: the public facts from
 * `profiles`, then the private ones the reader's permissions show.
 *
 * Email and phone need `read_contact_details`; age, dietary requirements and
 * the emergency contact need `read_welfare_details`
 * (`docs/roles-and-permissions.md`, section 5). A row the reader may not see is
 * left out, never shown empty. `details` is `null` when the database gave none
 * back, and each private row the reader may see then says "Not provided".
 */
export function applicantProfileItems(
	profile: ApplicantProfile,
	details: ApplicantDetails | null,
	age: number | null,
	access: PrivateDetailsAccess
): KeyValueItem[] {
	const country = profile.countryCode === null ? null : countryName(profile.countryCode);
	const experience =
		profile.experienceLevel === null
			? null
			: statusLabel('experience_level', profile.experienceLevel);

	const publicItems: KeyValueItem[] = [
		{ label: 'Institution', value: detailOrNotProvided(profile.institutionName) },
		{ label: 'Country', value: detailOrNotProvided(country), countryCode: profile.countryCode },
		{ label: 'Experience', value: detailOrNotProvided(experience) }
	];
	const ageItems: KeyValueItem[] = [
		{ label: 'Age', value: age === null ? UNKNOWN_AGE : String(age) }
	];
	const contactItems: KeyValueItem[] = [
		{ label: 'Email', value: detailOrNotProvided(details?.email) },
		{ label: 'Phone', value: detailOrNotProvided(details?.phone) }
	];
	const welfareItems: KeyValueItem[] = [
		{ label: 'Dietary requirements', value: detailOrNotProvided(details?.dietaryRequirements) },
		{ label: 'Emergency contact', value: emergencyContactText(details) }
	];

	return [
		...publicItems,
		...(access.welfare ? ageItems : []),
		...(access.contact ? contactItems : []),
		...(access.welfare ? welfareItems : [])
	];
}

/**
 * The warning over the profile when the applicant's age is outside the ages the
 * conference is for, or `null` when there is nothing to say.
 *
 * It is a warning and never a block, the same as on the apply form: an unknown
 * age, or a conference with no bounds, says nothing at all.
 */
export function ageRangeWarning(
	age: number | null,
	minAge: number | null,
	maxAge: number | null
): string | null {
	if (age === null) {
		return null;
	}

	const isTooYoung = minAge !== null && age < minAge;
	const isTooOld = maxAge !== null && age > maxAge;

	if (!isTooYoung && !isTooOld) {
		return null;
	}

	if (minAge !== null && maxAge !== null) {
		return `This conference is for delegates aged ${minAge} to ${maxAge}.`;
	}

	if (minAge !== null) {
		return `This conference is for delegates aged ${minAge} and over.`;
	}

	return `This conference is for delegates up to ${maxAge}.`;
}

/** One custom question and its answer, as the Answers block shows it. */
export type ReviewAnswer = {
	questionId: string;
	label: string;
	value: string;
	/** True for a long text answer, which is drawn with its paragraphs kept. */
	isLong: boolean;
};

/**
 * The custom questions and their answers, in the order they were asked.
 *
 * A choice question with several answers reads as a comma list, a tick box as
 * "Yes" or "No", and an unanswered question keeps its row with "Not answered",
 * because the organiser really did ask it. `answerText` in `$lib/applications`
 * does that wording, so the applicant's own page and this one never disagree.
 */
export function reviewAnswers(
	questions: ApplicationQuestion[],
	answers: ApplicationAnswers
): ReviewAnswer[] {
	const askedInOrder = [...questions].sort((first, second) => first.position - second.position);

	return askedInOrder.map((question) => ({
		questionId: question.id,
		label: question.label,
		value: answerText(question, answers[question.id]),
		isLong: question.type === 'long_text'
	}));
}
