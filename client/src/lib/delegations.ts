/**
 * The delegation half of taking part: who may register a group, who may join
 * one, what the register form asks them, and what a delegation's status means.
 *
 * Nothing in here talks to Supabase or to Svelte.
 * `$lib/server/delegations.ts` reads and writes the rows; the rules live here
 * so that they can be read and tested without a database. The shapes those
 * queries fill in live here too rather than beside them, because a component
 * may not import anything from `$lib/server`, not even a type.
 * `$lib/applications.ts` — the individual's half of the same choice — is built
 * exactly this way, and `canApply` there is the model `canCreateDelegation`
 * below follows.
 *
 * The rules come from `specs/06-features/delegations.md` and the wording of
 * every message from `specs/05-pages/delegation/new.md`,
 * `specs/05-pages/delegation/join.md`, `specs/05-pages/delegation/dashboard.md`
 * and `specs/03-design/writing-style.md`.
 *
 * There is deliberately no join-code generator here, which is what
 * `06-features/delegations.md` says as well: `create_delegation` mints the code
 * in SQL and the `guard_delegation_update` trigger refuses any change to
 * `join_code`, so a second generator in TypeScript would be a second source of
 * truth for a column no page may ever write.
 */

import type { KeyValueItem } from '$lib/components/KeyValueList.svelte';
import type { Tab } from '$lib/components/Tabs.svelte';
import {
	formatConferenceDay,
	type ApplicationOpenMode,
	type ConferenceStatus
} from '$lib/conferences';
import { isCountryCode } from '$lib/countries';
import type { Database } from '$lib/database.types';
import { dayInTimezone } from '$lib/dates';
import { statusLabel, type BadgeTone } from '$lib/status';
import {
	absolutePath,
	delegationMembersUrl,
	delegationPapersUrl,
	delegationSeatsUrl,
	delegationUrl
} from '$lib/urls';

/** `draft` | `submitted` | `accepted` | `rejected` | `withdrawn`. */
export type DelegationStatus = Database['public']['Enums']['delegation_status'];

/** `head` | `member`. */
export type DelegationRole = Database['public']['Enums']['delegation_role'];

/** One delegation as its own pages show it. */
export type Delegation = {
	id: string;
	conferenceId: string;
	name: string;
	institutionName: string;
	countryCode: string | null;
	status: DelegationStatus;
	requestedSeats: number;
	note: string | null;
	/** The ten characters a head shares, such as `H7KP3QWX2M`. Minted by `create_delegation`. */
	joinCode: string;
	submittedAt: string | null;
	/** When an organiser accepted or rejected it. A head withdrawing their own leaves it empty. */
	decidedAt: string | null;
	decisionNote: string | null;
};

/** The conference facts a delegation page needs. A narrower shape than `Conference`. */
export type DelegationConference = {
	id: string;
	slug: string;
	name: string;
	startDate: string;
	endDate: string;
	/** An IANA name such as `Europe/Amsterdam`. */
	timezone: string;
	status: ConferenceStatus;
	acceptsDelegations: boolean;
	/** `manual` with no opening moment means the organiser has not opened applications yet. */
	applicationOpenMode: ApplicationOpenMode;
	/** ISO timestamps. A null bound counts as open on that side, except as `applicationOpenMode` says. */
	applicationsOpenAt: string | null;
	applicationsCloseAt: string | null;
};

/** What `preview_delegation(code)` shows somebody holding a join link. */
export type DelegationPreview = {
	id: string;
	name: string;
	institutionName: string;
	countryCode: string | null;
	status: DelegationStatus;
	/*
		There is no `conferenceId` here, and its absence is deliberate.
		`preview_delegation` returns the list `05-pages/delegation/join.md` says it
		"returns only", and an id for the conference is not on it. The join page finds the id from
		`conferenceSlug` with `findConferenceIdBySlug` when it needs to ask what
		the reader has already signed up for.
	*/
	conferenceName: string;
	conferenceSlug: string;
	/*
		`join.md`'s refusal table has a row for a conference that is "archived or
		ended", and the status is the only place `archived` is written down: an
		organiser may archive a conference before its last day, so the dates alone
		still make it look joinable. Without this the card offered a Join button
		that the database refuses, which is the dead end T24's review spent a
		round on.
	*/
	conferenceStatus: ConferenceStatus;
	conferenceStartDate: string;
	conferenceEndDate: string;
	conferenceCity: string;
	conferenceCountryCode: string;
	headNames: string[];
	memberCount: number;
};

/**
 * How somebody is already attached to one conference: `check_one_route_per_conference`
 * lets them have an application or a delegation membership, never both.
 */
export type RouteIntoConference =
	| { kind: 'application'; applicationId: string }
	| { kind: 'delegation'; delegationId: string; delegationName: string };

/** Which of the six reasons `canCreateDelegation` turned somebody away for. */
export type CreateRefusalKind =
	| 'not_published'
	| 'delegations_not_accepted'
	| 'already_applied'
	| 'in_delegation'
	| 'not_yet_open'
	| 'closed';

/** Why somebody may not register a delegation, and the sentence the flash shows them. */
export type CreateRefusal = { kind: CreateRefusalKind; message: string };

/**
 * The four reasons that are about the conference rather than the person: it is
 * not published, takes no delegations, has not opened applications or has
 * closed them. Together they are `conference_takes_applications(conference,
 * 'delegation')` in the database, which refuses registering, submitting and
 * editing a delegation by the same four.
 */
type WindowRefusalKind = Extract<
	CreateRefusalKind,
	'not_published' | 'delegations_not_accepted' | 'not_yet_open' | 'closed'
>;

type WindowRefusal = { kind: WindowRefusalKind; message: string };

/**
 * "Applications for {conference} closed on {day}.", or `null` while the
 * conference is still taking them.
 *
 * Registering a delegation and submitting one are refused with the same
 * sentence — `new.md` and `dashboard.md` each quote it — so it is worded in one
 * place rather than twice. The day comes from `formatConferenceDay`, which is
 * what `canApply` in `$lib/applications.ts` words its own window refusals with,
 * so no two pages ever name different days.
 */
function closedMessage(conference: DelegationConference, now: Date): string | null {
	if (conference.applicationsCloseAt === null) {
		return null;
	}

	const closesAt = new Date(conference.applicationsCloseAt);

	if (closesAt.getTime() >= now.getTime()) {
		return null;
	}

	const day = formatConferenceDay(conference.applicationsCloseAt, conference.timezone);

	return `Applications for ${conference.name} closed on ${day}.`;
}

/**
 * Why this conference has no door for delegations at all, or `null` when it
 * has one: it is not published, or it takes no delegations.
 */
function doorRefusal(conference: DelegationConference): WindowRefusal | null {
	if (conference.status !== 'published') {
		// `new.md`'s "Not allowed" list ends with this sentence, for a conference
		// that is not published. The list did not quote it until this task wrote
		// it in: only the Access line named the condition, so the wording follows
		// the shape of the refusal below it rather than being invented in a new
		// voice.
		return { kind: 'not_published', message: `${conference.name} is not taking delegations.` };
	}

	if (!conference.acceptsDelegations) {
		return {
			kind: 'delegations_not_accepted',
			message: `${conference.name} does not accept delegations.`
		};
	}

	return null;
}

/**
 * Why the door is shut right now, or `null` while it is open: the organiser
 * has not opened applications yet, or has closed them.
 */
function windowRefusal(conference: DelegationConference, now: Date): WindowRefusal | null {
	// The organiser opens applications by hand and has not yet, which
	// `isAcceptingApplications` in `$lib/conferences.ts` refuses too.
	if (conference.applicationOpenMode === 'manual' && conference.applicationsOpenAt === null) {
		return {
			kind: 'not_yet_open',
			message: `Applications for ${conference.name} are not open yet.`
		};
	}

	if (conference.applicationsOpenAt !== null) {
		const opensAt = new Date(conference.applicationsOpenAt);

		if (opensAt.getTime() > now.getTime()) {
			const day = formatConferenceDay(conference.applicationsOpenAt, conference.timezone);

			return {
				kind: 'not_yet_open',
				message: `Applications for ${conference.name} open on ${day}.`
			};
		}
	}

	const closed = closedMessage(conference, now);

	if (closed !== null) {
		return { kind: 'closed', message: closed };
	}

	return null;
}

/**
 * Whether the conference is taking delegations right now: the same answer as
 * `conference_takes_applications(conference, 'delegation')` in the database,
 * which is what lets a head send or change their delegation.
 */
export function isTakingDelegations(conference: DelegationConference, now: Date): boolean {
	return doorRefusal(conference) === null && windowRefusal(conference, now) === null;
}

/**
 * Why this person may not register a delegation at this conference right now,
 * or `null` when they may.
 *
 * The order of the questions below is what makes exactly one reason possible:
 * the first one that answers yes wins, the way `canApply` in
 * `$lib/applications.ts` already works. Whether the conference has a door for
 * delegations comes first, then whether this person already came in by
 * another, then whether the door is open today.
 *
 * `existing` is the application or the delegation membership they already have
 * at this conference, or `null` for neither.
 */
export function canCreateDelegation(
	conference: DelegationConference,
	existing: RouteIntoConference | null,
	now: Date
): CreateRefusal | null {
	const noDoor = doorRefusal(conference);

	if (noDoor !== null) {
		return noDoor;
	}

	if (existing !== null && existing.kind === 'application') {
		return {
			kind: 'already_applied',
			message: `You already applied to ${conference.name} as an individual.`
		};
	}

	if (existing !== null && existing.kind === 'delegation') {
		return {
			kind: 'in_delegation',
			message: `You are already part of the ${existing.delegationName} delegation.`
		};
	}

	return windowRefusal(conference, now);
}

/**
 * Which of the seven reasons somebody was turned away for. `canJoinDelegation`
 * below decides the first six from the preview; `conference_staff` is raised by
 * `join_delegation` alone, because only the database knows who is on the team.
 */
export type JoinRefusalKind =
	| 'rejected'
	| 'withdrawn'
	| 'already_in_this'
	| 'in_other_delegation'
	| 'already_applied'
	| 'conference_over'
	| 'conference_staff';

/** Why somebody may not join this delegation, and the sentence the card shows them. */
export type JoinRefusal = { kind: JoinRefusalKind; message: string };

/** The two names a refusal sentence may need to put in. */
export type JoinRefusalFacts = {
	/** The conference the delegation belongs to. */
	conferenceName: string;
	/**
	 * The *other* delegation this person is already in, when that is the reason.
	 * `null` for every other reason, and for a refusal the database raised
	 * without the page being able to look the name up.
	 */
	otherDelegationName: string | null;
};

/**
 * The sentence `05-pages/delegation/join.md` quotes for one row of its refusal
 * table.
 *
 * This is the only place any of those seven sentences is written down. Both
 * halves of the page need them — `canJoinDelegation` below, which decides
 * whether to draw the button, and the action, which has to word whatever the
 * database refused with — and two copies of a quoted sentence are two things to
 * keep in step with the spec.
 *
 * `otherDelegationName` is only ever missing when the database refused and the
 * page could not find out which delegation it meant; the sentence then names
 * the conference alone rather than printing an empty name.
 */
export function joinRefusalSentence(kind: JoinRefusalKind, facts: JoinRefusalFacts): string {
	if (kind === 'already_in_this') {
		return 'You are already in this delegation.';
	}

	if (kind === 'rejected') {
		return 'This delegation was not accepted, so it cannot take members.';
	}

	if (kind === 'withdrawn') {
		return 'This delegation withdrew its request.';
	}

	if (kind === 'conference_over') {
		return `${facts.conferenceName} has already taken place.`;
	}

	// The team runs the conference and does not take part in it; a chair who
	// joined a delegation would read its drafts (security review, M18).
	if (kind === 'conference_staff') {
		return `You are on the team of ${facts.conferenceName}, so you cannot join one of its delegations.`;
	}

	if (kind === 'in_other_delegation') {
		if (facts.otherDelegationName === null) {
			return `You are already in another delegation for ${facts.conferenceName}.`;
		}

		return `You are already in the ${facts.otherDelegationName} delegation for ${facts.conferenceName}.`;
	}

	// `already_applied` is the last of the seven kinds, so nothing else is left.
	return `You already applied to ${facts.conferenceName} on your own. Withdraw that application first to join a delegation.`;
}

/**
 * Why this person may not join the delegation behind the join link, or `null`
 * when they may.
 *
 * `today` is a `YYYY-MM-DD` day. A code nobody has is not a refusal here: the
 * page then has no preview to draw at all and shows an `EmptyState` instead, so
 * `load` never gets this far.
 *
 * The first question that answers yes wins, as in `canCreateDelegation` above.
 * "Already in this one" is asked first because the page redirects on it rather
 * than drawing it, and asking it later would let "in another delegation" catch
 * it instead.
 *
 * There is deliberately no check of the application window. `join.md` says
 * joining after it closed is allowed while the delegation is `accepted`,
 * because heads often add a replacement member late.
 */
export function canJoinDelegation(
	preview: DelegationPreview,
	existing: RouteIntoConference | null,
	today: string
): JoinRefusal | null {
	// Every sentence below comes from `joinRefusalSentence`, so that the wording
	// this page draws and the wording the action puts on a refusal the database
	// raised are the same words.
	const facts: JoinRefusalFacts = {
		conferenceName: preview.conferenceName,
		otherDelegationName:
			existing !== null && existing.kind === 'delegation' ? existing.delegationName : null
	};

	function refuse(kind: JoinRefusalKind): JoinRefusal {
		return { kind, message: joinRefusalSentence(kind, facts) };
	}

	if (existing !== null && existing.kind === 'delegation' && existing.delegationId === preview.id) {
		return refuse('already_in_this');
	}

	if (preview.status === 'rejected') {
		return refuse('rejected');
	}

	if (preview.status === 'withdrawn') {
		return refuse('withdrawn');
	}

	/*
		Both halves of `join.md`'s "conference archived or ended" row. `archived`
		is the status an organiser gives a conference that is over and done with,
		and it can be set before the last day, so the two questions are not the
		same one asked twice.

		Both dates are `YYYY-MM-DD`, which sorts as text into the same order as it
		does as dates, so `<` compares them by day. A conference is over the day
		*after* its last one, which is what keeps joining on the closing day open.
	*/
	if (preview.conferenceStatus === 'archived' || preview.conferenceEndDate < today) {
		return refuse('conference_over');
	}

	if (existing !== null && existing.kind === 'delegation') {
		return refuse('in_other_delegation');
	}

	if (existing !== null && existing.kind === 'application') {
		return refuse('already_applied');
	}

	return null;
}

/** Why the head may not send this delegation to the organisers yet. */
export type SubmitRefusal = { kind: 'not_draft' | WindowRefusalKind; message: string };

/**
 * Why the head may not submit this delegation, or `null` when they may.
 *
 * A delegation of one head may be submitted: `06-features/delegations.md` says
 * the head counts as a member, so there is no member count to check here.
 *
 * Past the status, these are the reasons `canCreateDelegation` gives about the
 * conference, because `guard_delegation_update` in the database refuses a
 * late submission by the same rule that refuses a late registration.
 */
export function canSubmitDelegation(
	delegation: Delegation,
	conference: DelegationConference,
	now: Date
): SubmitRefusal | null {
	if (delegation.status !== 'draft') {
		return {
			kind: 'not_draft',
			message: 'This delegation has already been sent to the organisers.'
		};
	}

	return doorRefusal(conference) ?? windowRefusal(conference, now);
}

/** Why the head may not take this delegation's request back. */
export type WithdrawRefusal = { kind: 'not_open' | 'seats_allocated'; message: string };

/**
 * Why the head may not withdraw this delegation, or `null` when they may.
 *
 * `allocatedSeats` is how many seats the organisers have reserved for it. Once
 * there is one, withdrawing is the organisers' to do rather than the head's.
 *
 * The seats are asked about before the status, and the order matters.
 * `06-features/allocation.md` says `allocate_delegation_seats` "marks the
 * delegation `accepted` if it was `submitted`", so a delegation with seats
 * behind it is always `accepted` and never `draft` or `submitted`. Asking about
 * the status first would therefore refuse every allocated delegation with the
 * vaguer sentence, and the one `dashboard.md` quotes for this case — the only
 * one that says whom to go to — would never be read by anybody.
 */
export function canWithdrawDelegation(
	delegation: Delegation,
	allocatedSeats: number
): WithdrawRefusal | null {
	if (allocatedSeats > 0) {
		return {
			kind: 'seats_allocated',
			message: 'Seats were already allocated; ask the organisers to cancel.'
		};
	}

	const isStillOpen = delegation.status === 'draft' || delegation.status === 'submitted';

	if (!isStillOpen) {
		return { kind: 'not_open', message: 'This delegation can no longer be withdrawn.' };
	}

	return null;
}

/**
 * Whether the head may still change the name, seat count and note: while it is
 * `draft` or `submitted`, and while the conference is taking delegations.
 *
 * `isWindowOpen` is `isTakingDelegations(conference, now)`, worked out by the
 * caller, as `canEditApplication` in `$lib/applications.ts` takes it. Once the
 * window shuts `guard_delegation_update` lets a head only withdraw, so the form
 * would offer an edit the database refuses.
 */
export function canEditDelegation(status: DelegationStatus, isWindowOpen: boolean): boolean {
	return isWindowOpen && (status === 'draft' || status === 'submitted');
}

/** How many seats the organisers reserved, and how many of them have somebody in them. */
export type DelegationSeatCounts = { allocated: number; assigned: number };

/**
 * One member's own seat, as the "Your seat" card on the dashboard draws it.
 *
 * `findMyDelegationSeat` in `$lib/server/delegations.ts` fills this in. The
 * shape lives here rather than beside that query because `MySeatCard.svelte`
 * needs it too, and a component may not import anything from `$lib/server`.
 */
export type MyDelegationSeat = {
	seatName: string;
	/** Empty for a seat that is a role rather than a country, which has no flag. */
	countryCode: string | null;
	committeeName: string;
	committeeSlug: string;
};

/** The three numbers the progress card shows, and the width of its bar. */
export type DelegationProgress = {
	requested: number;
	allocated: number;
	assigned: number;
	/** How full the bar is drawn: assigned out of allocated, 0-100. */
	percentAssigned: number;
};

/**
 * Where the delegation stands: what it asked for, what it was given, and how
 * much of that the head has seated.
 *
 * The bar measures assigned out of **allocated** rather than out of requested,
 * because it is the work the head still has to do. The requested number is a
 * wish the organisers may grant in part or not at all, so measuring against it
 * would show a head who has seated everybody a bar that never fills.
 */
export function delegationProgress(
	delegation: { requestedSeats: number },
	seats: DelegationSeatCounts
): DelegationProgress {
	let percentAssigned = 0;

	// Nothing is divided before the organisers have allocated anything, so a
	// delegation still waiting for a decision gets an empty bar rather than a
	// division by zero.
	if (seats.allocated > 0) {
		percentAssigned = Math.round((seats.assigned / seats.allocated) * 100);
	}

	return {
		requested: delegation.requestedSeats,
		allocated: seats.allocated,
		assigned: seats.assigned,
		percentAssigned
	};
}

/**
 * Everything the register form holds.
 *
 * A refused form is drawn again from these exact values, so the head sees what
 * they typed rather than a tidied version of it.
 */
export type DelegationFormValues = {
	name: string;
	institutionName: string;
	/** A two-letter country code such as `FR`, or `''` for "not chosen". */
	countryCode: string;
	/** A string, because it comes out of a text box; `validateDelegationForm` turns it into a number. */
	requestedSeats: string;
	note: string;
	hasConsented: boolean;
};

/** The name of one box on the form. `consent` is the tick box `hasConsented` fills in. */
export type DelegationFormField =
	'name' | 'institutionName' | 'countryCode' | 'requestedSeats' | 'note' | 'consent';

/** A message for each box that needs fixing. `form` is a problem with the whole form. */
export type DelegationFormErrors = Partial<Record<DelegationFormField | 'form', string>>;

/** The fewest seats a delegation may ask for, matching the `min` on the number box. */
export const MIN_REQUESTED_SEATS = 1;

/** The most seats a delegation may ask for, matching the `max` on the number box. */
export const MAX_REQUESTED_SEATS = 200;

/** The longest a delegation's name may be, matching the box on the form and `delegations_name_length`. */
export const DELEGATION_NAME_MAX_LENGTH = 120;

/** The longest an institution's name may be, matching the box on the form and `delegations_institution_name_length`. */
export const DELEGATION_INSTITUTION_MAX_LENGTH = 120;

/** The longest a note may be, matching the text box on the form and `delegations_note_length`. */
export const DELEGATION_NOTE_MAX_LENGTH = 1000;

/** Is this text one whole number of seats, between the two the form allows? */
function isSeatCount(text: string): boolean {
	const seats = Number(text);

	// `Number('')` is 0 and `Number('twelve')` is `NaN`, and neither is a whole
	// number in the range, so an empty box and a typed word are both turned away
	// here without a check of their own.
	return Number.isInteger(seats) && seats >= MIN_REQUESTED_SEATS && seats <= MAX_REQUESTED_SEATS;
}

/**
 * What is wrong with the register form, box by box. An empty object means
 * nothing is.
 *
 * Every problem is collected instead of stopping at the first one, so somebody
 * filling the form in sees all of them at once rather than one per attempt.
 *
 * `asksConsent` is `false` for the edit form on the dashboard, which
 * `dashboard.md` says "reuses `DelegationForm` from `new.md` without the
 * consent box": a box that was never drawn cannot be asked for.
 */
export function validateDelegationForm(
	values: DelegationFormValues,
	options: { asksConsent: boolean }
): DelegationFormErrors {
	const errors: DelegationFormErrors = {};

	if (values.name.trim() === '') {
		errors.name = 'Give your delegation a name.';
	} else if (values.name.trim().length > DELEGATION_NAME_MAX_LENGTH) {
		errors.name = `Keep the name to ${DELEGATION_NAME_MAX_LENGTH} characters or fewer.`;
	}

	if (values.institutionName.trim() === '') {
		errors.institutionName = 'Enter the name of your school, university or club.';
	} else if (values.institutionName.trim().length > DELEGATION_INSTITUTION_MAX_LENGTH) {
		errors.institutionName = `Keep the institution to ${DELEGATION_INSTITUTION_MAX_LENGTH} characters or fewer.`;
	}

	/*
		An empty box and a code that belongs to no country are the same message,
		and one question covers both: `isCountryCode('')` is false. The only way
		to send a code that is not on the list is to build the request by hand,
		because `CountrySelect` offers nothing else — but the check is here rather
		than left to the database, which would take "ZZ" quite happily in a
		`char(2)`, and the card that drew it would then ask flagcdn.com for a flag
		nobody has. `validateConferenceDetails` in `$lib/conference-details.ts`
		guards its own country the same way.
	*/
	if (!isCountryCode(values.countryCode)) {
		errors.countryCode = 'Pick a country.';
	}

	if (!isSeatCount(values.requestedSeats)) {
		errors.requestedSeats = `Ask for between ${MIN_REQUESTED_SEATS} and ${MAX_REQUESTED_SEATS} seats.`;
	}

	if (values.note.trim().length > DELEGATION_NOTE_MAX_LENGTH) {
		errors.note = `Keep the note to ${DELEGATION_NOTE_MAX_LENGTH} characters or fewer.`;
	}

	if (options.asksConsent && !values.hasConsented) {
		errors.consent = "Please confirm that organisers may see your members' details.";
	}

	return errors;
}

/** Did `validateDelegationForm` find any problem at all? */
export function hasDelegationFormErrors(errors: DelegationFormErrors): boolean {
	return Object.keys(errors).length > 0;
}

/** Read one text field from a submitted form, without surrounding spaces. A missing field counts as ''. */
function readText(formData: FormData, fieldName: string): string {
	return String(formData.get(fieldName) ?? '').trim();
}

/**
 * Read the register form's fields from a submitted form.
 *
 * The register page and the dashboard's edit form both read it this way, so the
 * two can never disagree about what was in it.
 */
export function readDelegationForm(formData: FormData): DelegationFormValues {
	return {
		name: readText(formData, 'name'),
		institutionName: readText(formData, 'institutionName'),
		countryCode: readText(formData, 'countryCode'),
		requestedSeats: readText(formData, 'requestedSeats'),
		note: readText(formData, 'note'),
		// A browser sends nothing at all for an unticked box, so the question is
		// whether the field arrived rather than what is in it, the way
		// `readApplicationForm` in `$lib/applications.ts` asks it.
		hasConsented: formData.get('consent') !== null
	};
}

/**
 * The form as the register page first draws it, with the three boxes the
 * profile can answer already filled in.
 *
 * The delegation is named after the institution ("St Aidan's Academy"), which
 * is what most schools call their group, and the head can change it (T177).
 * The seat count is left empty rather than guessed: "how many seats do you
 * want?" is the one question only the head can answer. A profile with no
 * institution simply leaves both boxes empty, which is what `new.md` asks for.
 */
export function emptyDelegationForm(profile: {
	institutionName: string;
	countryCode: string;
}): DelegationFormValues {
	return {
		name: profile.institutionName,
		institutionName: profile.institutionName,
		countryCode: profile.countryCode,
		requestedSeats: '',
		note: '',
		hasConsented: false
	};
}

/**
 * A registered delegation put back into the form, for the dashboard's edit form
 * to open with.
 *
 * `hasConsented` is `true` because the delegation only exists at all if the box
 * was ticked when it was registered, and the edit form does not draw it again.
 */
export function toDelegationFormValues(delegation: Delegation): DelegationFormValues {
	return {
		name: delegation.name,
		institutionName: delegation.institutionName,
		countryCode: delegation.countryCode ?? '',
		requestedSeats: String(delegation.requestedSeats),
		note: delegation.note ?? '',
		hasConsented: true
	};
}

/**
 * What the status card tells a head whose delegation is still a draft, under
 * the heading "Not sent yet" (`dashboard.md`, "Draft"; T177).
 *
 * It says the request can go now, because `06-features/delegations.md` lets
 * members join a submitted delegation and lets the seat count change until the
 * organisers decide. A member of a draft still reads `delegationStatusSentence`.
 */
export const DRAFT_HEAD_STATUS_SENTENCE =
	'Send it to the organisers whenever you are ready. Members can still join afterwards, and you can change the number of seats until the organisers decide.';

/**
 * The one sentence the status card says, such as "Not sent yet. Add members,
 * then submit."
 *
 * `decision_note` is drawn by the card beside this sentence rather than inside
 * it, so a rejected delegation says only "Not accepted." here.
 */
export function delegationStatusSentence(
	delegation: Delegation,
	conference: DelegationConference,
	progress: DelegationProgress
): string {
	if (delegation.status === 'draft') {
		return 'Not sent yet. Add members, then submit.';
	}

	if (delegation.status === 'submitted') {
		// `guard_delegation_update` writes `submitted_at` in the same step that
		// moves the status, so a submitted delegation without one is not a state
		// the app reaches; the shorter sentence is there because TypeScript cannot
		// know that.
		if (delegation.submittedAt === null) {
			return `The organisers are reviewing your request for ${progress.requested} seats.`;
		}

		const day = formatConferenceDay(delegation.submittedAt, conference.timezone);

		return `Submitted ${day}. The organisers are reviewing your request for ${progress.requested} seats.`;
	}

	if (delegation.status === 'accepted') {
		return `Accepted. ${progress.allocated} seats allocated.`;
	}

	if (delegation.status === 'rejected') {
		return 'Not accepted.';
	}

	// `withdrawn` is the last of the five statuses, so nothing else can be left.
	//
	// There is no column for when a delegation was withdrawn. `decided_at` holds
	// the day when an organiser was the one who ended it, but a head withdrawing
	// their own writes no decision column at all, and that is the ordinary case,
	// so the sentence simply drops the day when there is none to name.
	if (delegation.decidedAt === null) {
		return 'Withdrawn.';
	}

	const day = formatConferenceDay(delegation.decidedAt, conference.timezone);

	return `Withdrawn on ${day}.`;
}

/*
 * Everything below belongs to the organiser's own table,
 * `/manage/[slug]/delegations`, rather than to the pages a delegation's head
 * and members read. It is the same delegations seen from the other side: a page
 * of them at a time, chosen with a filter kept in the address, each one summed
 * up into the few numbers an organiser decides on. Nothing above this line
 * knows about any of it.
 *
 * `$lib/applications.ts` has a section exactly like this one for the other
 * route into a conference, and everything here is built the way it is built.
 *
 * The wording comes from `specs/05-pages/organiser/delegations.md`.
 */

/**
 * The statuses an invoice can be in: `unpaid`, `paid`, `waived`, `refunded` or
 * `void`.
 *
 * An enum about money named in the file about delegations looks out of place,
 * and it is. `$lib/fees.ts` is where the money half of the app lives and where
 * this name belongs, but the half of it that reads invoices arrives with T33,
 * and the invoice column of this table is being built now.
 * `$lib/applications.ts` names the same enum for the same reason, so there are
 * two of these to fold into `$lib/fees.ts` once it can hold them.
 */
export type DelegationInvoiceStatus = Database['public']['Enums']['invoice_status'];

/**
 * Every status the organiser's table shows: the four that are not `draft`.
 *
 * A draft is a delegation nobody has sent yet, so it is none of the organiser's
 * business. Row Level Security cannot hide it — a policy decides rows and not
 * columns, and the organiser may read the row — so every query and every list
 * in this half leaves drafts out itself.
 */
export type ListedDelegationStatus = Exclude<DelegationStatus, 'draft'>;

/**
 * The tabs, in the order the page draws them: the queue first, then the two
 * ways out of it, then the delegations that walked away.
 */
export const DELEGATION_STATUS_TABS: ListedDelegationStatus[] = [
	'submitted',
	'accepted',
	'rejected',
	'withdrawn'
];

/**
 * The words on each tab.
 *
 * They come from `$lib/status`, which already has a word for every value of
 * every enum, so a tab and the badge on the row underneath it cannot disagree
 * about what `submitted` is called. Writing the four out by hand rather than
 * building them in a loop is what makes `pnpm check` fail if a status is ever
 * added to the enum and nobody gives it a tab.
 */
export const DELEGATION_TAB_LABELS: Record<ListedDelegationStatus, string> = {
	submitted: statusLabel('delegation_status', 'submitted'),
	accepted: statusLabel('delegation_status', 'accepted'),
	rejected: statusLabel('delegation_status', 'rejected'),
	withdrawn: statusLabel('delegation_status', 'withdrawn')
};

/**
 * What each tab says when it has no delegations in it.
 *
 * One sentence per tab rather than one for all four, because "No delegation
 * requests yet." is the only one `05-pages/organiser/delegations.md` writes out
 * and the other three read wrong in its place: a conference that has accepted
 * nobody yet is not a conference nobody has asked. The words live here rather
 * than in the page, because `CLAUDE.md` keeps wording out of a component's
 * script block.
 */
export const DELEGATION_EMPTY_TITLES: Record<ListedDelegationStatus, string> = {
	submitted: 'No delegation requests yet.',
	accepted: 'No accepted delegations.',
	rejected: 'No delegations marked as not accepted.',
	withdrawn: 'No withdrawn delegations.'
};

/** Is this one of the four statuses the table shows? `draft` is not. */
export function isListedDelegationStatus(text: string): text is ListedDelegationStatus {
	return DELEGATION_STATUS_TABS.some((status) => status === text);
}

/** Which order the table comes in: oldest request first, by name, or the biggest group first. */
export type DelegationListSort = 'submitted' | 'name' | 'size';

/**
 * The three orders as the sort dropdown offers them.
 *
 * "Oldest first" is the default because the queue is worked through in the
 * order schools joined it, which is the fair way round. It is the same default,
 * and for the same reason, as `APPLICATION_SORT_OPTIONS` in
 * `$lib/applications.ts`.
 */
export const DELEGATION_SORT_OPTIONS: { value: DelegationListSort; label: string }[] = [
	{ value: 'submitted', label: 'Oldest first' },
	{ value: 'name', label: 'Name' },
	{ value: 'size', label: 'Largest first' }
];

/** Everything we read out of the URL: which delegations to show, and which page of them. */
export type DelegationListQuery = {
	/** Text over the delegation's name, its institution and its head's name. */
	q: string;
	status: ListedDelegationStatus;
	/** A two-letter country code, or '' for any. */
	country: string;
	sort: DelegationListSort;
	/** 1-based. */
	page: number;
};

/** The table as it opens: every request under review, oldest first, first page. */
export const EMPTY_DELEGATION_LIST_QUERY: DelegationListQuery = {
	q: '',
	status: 'submitted',
	country: '',
	sort: 'submitted',
	page: 1
};

/** Anyone can type anything into the URL, so ignore anything that is not one of the four tabs. */
function readListedStatus(value: string | null): ListedDelegationStatus {
	const status = value?.trim() ?? '';

	if (isListedDelegationStatus(status)) {
		return status;
	}

	return 'submitted';
}

/** Anyone can type anything into the URL, so ignore anything that is not one of the three orders. */
function readSort(value: string | null): DelegationListSort {
	const sort = value?.trim() ?? '';
	const knownSort = DELEGATION_SORT_OPTIONS.find((option) => option.value === sort);

	return knownSort?.value ?? 'submitted';
}

/** Anyone can type anything into the URL, so ignore values that are not a known country code. */
function readCountryCode(value: string | null): string {
	const code = value?.trim().toUpperCase() ?? '';

	return isCountryCode(code) ? code : '';
}

/** Fall back to the first page for anything that is not a whole number above zero. */
function readPage(value: string | null): number {
	const page = Number(value);

	return Number.isInteger(page) && page > 0 ? page : 1;
}

/**
 * Turn `?q=lycee&status=accepted&country=FR&sort=name&page=2` into a
 * `DelegationListQuery`. Takes the parameters rather than the whole URL, the
 * way `parseApplicationListQuery` in `$lib/applications.ts` does, because the
 * filter form reads its own values back through this same function.
 *
 * Anything unreadable falls back to its default: the address is only text
 * somebody could have typed there.
 */
export function parseDelegationListQuery(params: URLSearchParams): DelegationListQuery {
	return {
		q: params.get('q')?.trim() ?? '',
		status: readListedStatus(params.get('status')),
		country: readCountryCode(params.get('country')),
		sort: readSort(params.get('sort')),
		page: readPage(params.get('page'))
	};
}

/** How many delegations one page of the organiser's table holds. */
export const DELEGATIONS_PAGE_SIZE = 25;

/** The one badge the invoice column shows: the words, and the colour behind them. */
export type DelegationInvoiceSummary = { label: string; tone: BadgeTone };

/** A `paid` or a `waived` invoice is settled: nobody owes anything on it any more. */
function isSettledInvoice(status: DelegationInvoiceStatus): boolean {
	return status === 'paid' || status === 'waived';
}

/**
 * What the invoice column says about one delegation.
 *
 * A voided invoice is not counted at all, because `remove_delegation_seat`
 * voids the old group invoice and reissues it for the smaller count, so a
 * delegation that has had a seat taken away always has one. Of the rest,
 * `paid` and `waived` are settled and everything else, `refunded` included, is
 * not: a refund means the money went back, so the organiser is owed it again.
 *
 * The four sets of words are the ones `05-pages/organiser/delegations.md`
 * writes out, and two of them — "Paid" and "Unpaid" — are deliberately the same
 * words `$lib/status` gives a single invoice, so a delegation with one invoice
 * reads the same here as it does on the invoice itself.
 */
export function delegationInvoiceSummary(
	statuses: DelegationInvoiceStatus[]
): DelegationInvoiceSummary {
	const counted = statuses.filter((status) => status !== 'void');

	if (counted.length === 0) {
		return { label: 'No invoice', tone: 'neutral' };
	}

	const settled = counted.filter(isSettledInvoice);

	if (settled.length === counted.length) {
		return { label: 'Paid', tone: 'success' };
	}

	if (settled.length === 0) {
		return { label: 'Unpaid', tone: 'warning' };
	}

	return { label: 'Partly paid', tone: 'warning' };
}

/** One row of the organiser's table. */
export type OrganiserDelegationRow = {
	id: string;
	name: string;
	institutionName: string;
	countryCode: string | null;
	/** One name per member whose role is `head`, oldest membership first. */
	headNames: string[];
	memberCount: number;
	status: ListedDelegationStatus;
	/** An ISO timestamp. Never null for a delegation the table shows, but typed as the column is. */
	submittedAt: string | null;
	/** Requested, allocated and assigned, from `delegationProgress`. */
	progress: DelegationProgress;
	invoice: DelegationInvoiceSummary;
};

/**
 * The head column: "M. Dupont", or "M. Dupont, A. Blanc" for a delegation with
 * two heads.
 *
 * A delegation with no head at all reads "—" rather than leaving the cell
 * empty, so that the column still lines up and a reader can tell an answer of
 * "nobody" from a cell that failed to load. A head who deleted their account is
 * a different case and does not come here: their membership row is still there,
 * so the query hands this function "Deleted account" as a name like any other,
 * which is what `05-pages/organiser/delegations.md` asks for.
 */
export function headNamesSentence(headNames: string[]): string {
	if (headNames.length === 0) {
		return '—';
	}

	return headNames.join(', ');
}

/** What the organisers' list says about a delegation it flags with `hasNoAssignedMembers`. */
export const NO_MEMBERS_ASSIGNED_TEXT = 'No members assigned yet';

/**
 * Whether the organisers have to chase this delegation: it was accepted and
 * given seats, and its head has seated nobody in them.
 *
 * A delegation still waiting for a decision, or one with no seats yet, has
 * nothing to chase, because nobody is late. The table marks it with a dot and
 * the phone's card with the same words written out.
 */
export function hasNoAssignedMembers(
	delegation: Pick<OrganiserDelegationRow, 'status' | 'progress'>
): boolean {
	return (
		delegation.status === 'accepted' &&
		delegation.progress.allocated > 0 &&
		delegation.progress.assigned === 0
	);
}

/** How many delegations this conference has in each of the four shown statuses. */
export type DelegationStatusCounts = Record<ListedDelegationStatus, number>;

/** A conference nobody has registered a delegation for, and what the counts start from. */
export const EMPTY_DELEGATION_STATUS_COUNTS: DelegationStatusCounts = {
	submitted: 0,
	accepted: 0,
	rejected: 0,
	withdrawn: 0
};

/** The whole table in two numbers: the tabs' counts, and the seats everybody asked for. */
export type DelegationSummary = {
	counts: DelegationStatusCounts;
	/** `requested_seats` added up over every non-draft delegation of the conference. */
	requestedSeatsTotal: number;
};

/** How many delegations the four tabs hold between them. */
function countEveryStatus(counts: DelegationStatusCounts): number {
	let total = 0;

	for (const status of DELEGATION_STATUS_TABS) {
		total += counts[status];
	}

	return total;
}

/** "1 request" or "9 requests": the plural is the only thing that changes. */
function countedRequests(count: number): string {
	if (count === 1) {
		return '1 request';
	}

	return `${count} requests`;
}

/** "1 seat requested" or "214 seats requested": the plural again. */
function countedSeatsRequested(count: number): string {
	if (count === 1) {
		return '1 seat requested';
	}

	return `${count} seats requested`;
}

/**
 * The line under the page title: "9 requests · 214 seats requested".
 *
 * It counts requests rather than naming each status the way
 * `applicationCountsSentence` does, because the tabs right underneath already
 * show every status with its own count and the seats are the number an
 * organiser cannot read anywhere else on the page. With no delegations at all
 * it is "No delegation requests yet", the way that sentence answers the same
 * question about an empty table.
 */
export function delegationCountsSentence(summary: DelegationSummary): string {
	const requestCount = countEveryStatus(summary.counts);

	if (requestCount === 0) {
		return 'No delegation requests yet';
	}

	const requests = countedRequests(requestCount);
	const seats = countedSeatsRequested(summary.requestedSeatsTotal);

	return `${requests} · ${seats}`;
}

/*
 * Everything below belongs to the head's seats page,
 * `/delegations/[delegationId]/seats`, where a head puts each member of the
 * group into one of the seats the organisers reserved for it. It is the
 * delegation's own half of the work the organisers do on the allocation grid,
 * so the shapes here are narrower than the ones in `$lib/allocation.ts`: a head
 * sees only their own seats and only their own members, never the whole
 * conference.
 *
 * Neither of the two sections above knows about any of this, and the seats page
 * is the only page that reads it. T29 built it.
 *
 * The rules come from `specs/06-features/allocation.md`, "Head assigns
 * members", and the wording of every message from
 * `specs/05-pages/delegation/seats.md` and `specs/03-design/writing-style.md`.
 */

/**
 * `none` | `beginner` | `intermediate` | `advanced`.
 *
 * The same enum `CommitteeLevel` in `$lib/committees.ts` names for a
 * committee's level; it is aliased again here so that nothing about a
 * delegation has to import the committee shapes.
 */
export type ExperienceLevel = Database['public']['Enums']['experience_level'];

/** One committee, as a heading over the seats this delegation holds in it. */
export type DelegationSeatCommittee = {
	id: string;
	name: string;
	abbreviation: string | null;
	level: ExperienceLevel;
};

/** Whoever is sitting in one of the delegation's seats. */
export type DelegationSeatHolder = {
	userId: string;
	fullName: string;
	avatarPath: string | null;
	/**
	 * `null` for an account that has gone. The seats page needs it to put the
	 * holder back among the members without a seat the moment "Unassign" is
	 * pressed (T142), before the server has answered.
	 */
	experienceLevel: ExperienceLevel | null;
};

/** One seat the organisers reserved for this delegation. */
export type DelegationSeat = {
	id: string;
	name: string;
	/** Empty for a seat that is a role rather than a country, which has no flag. */
	countryCode: string | null;
	/** `null` while the seat is empty. */
	holder: DelegationSeatHolder | null;
};

/** One committee with the delegation's seats in it, in the organisers' own order. */
export type DelegationSeatGroup = {
	committee: DelegationSeatCommittee;
	seats: DelegationSeat[];
};

/** A member of the delegation who has no seat yet: what the dropdown offers. */
export type UnseatedMember = {
	userId: string;
	fullName: string;
	experienceLevel: ExperienceLevel;
	avatarPath: string | null;
};

/**
 * What a head is told once the conference has started and only the organisers
 * may still move people. Both actions refuse with it, so it is written once.
 */
export const SEATS_LOCKED_REFUSAL = 'Seats are locked; contact the organisers.';

/** The flash after a seat is emptied. */
export const SEAT_FREED_FLASH = 'Seat freed.';

/** The flash a member of the delegation, who is not a head, is sent away with. */
export const ONLY_HEADS_ASSIGN_SEATS = 'Only heads assign seats.';

/** The empty state's title when the organisers have allocated nothing yet. */
export const NO_SEATS_ALLOCATED_TITLE = 'No seats allocated yet.';

/** The notice when there is nothing left for the head to do. */
export const EVERY_SEAT_ASSIGNED = 'Every seat is assigned.';

/** The notice when the delegation has more members than it has seats for them. */
export const TOO_FEW_SEATS_WARNING =
	'Ask the organisers for more seats, or remove members who will not attend.';

/** "1 member unseated" or "3 members unseated": the plural is the only difference. */
function countedUnseatedMembers(count: number): string {
	if (count === 1) {
		return '1 member unseated';
	}

	return `${count} members unseated`;
}

/**
 * The line beside the page title: "10 allocated · 6 assigned · 3 members
 * unseated".
 *
 * All three clauses are written even when the number is zero, so that a head
 * can compare them at a glance with the progress card on the dashboard, which
 * counts the same three things. The separator is a middle dot with a space each
 * side, the way `delegationCountsSentence` above joins short facts.
 */
export function delegationSeatsSentence(
	progress: DelegationProgress,
	unseatedMemberCount: number
): string {
	const allocated = `${progress.allocated} allocated`;
	const assigned = `${progress.assigned} assigned`;
	const unseated = countedUnseatedMembers(unseatedMemberCount);

	return `${allocated} · ${assigned} · ${unseated}`;
}

/**
 * May the head still move people between seats, or has the conference started?
 *
 * `06-features/allocation.md`, "Head assigns members", gives heads until the
 * conference's first day: from that day only organisers move people, and
 * `check_seat_allocation` in the database refuses a head from that day with
 * "The conference has started." This is that same rule written where a page can
 * ask it, so the page can put the buttons away rather than let a head press one
 * and be refused.
 *
 * The day is worked out in the conference's own timezone, because a conference
 * in Auckland starts on its own morning and not on UTC's, and `start_date` is a
 * plain `YYYY-MM-DD` with no zone of its own. The trigger counts the day in the
 * same timezone, so the two never disagree about whether a change is still
 * allowed. Comparing two strings in that shape with `<` compares them day by
 * day, because the year comes first.
 */
export function canChangeDelegationSeats(
	conference: Pick<DelegationConference, 'startDate' | 'timezone'>,
	now: Date
): boolean {
	const today = dayInTimezone(now, conference.timezone);

	return today < conference.startDate;
}

/** The notice under the page title: what it says, and the colour it is drawn in. */
export type SeatsNotice = { tone: 'info' | 'success' | 'warning'; message: string };

/**
 * The one notice the seats page shows: locked, finished, or the deadline.
 *
 * Neither the clock nor the formatting of the day is read here, and that is
 * deliberate. A component that called `new Date()` would write one thing while
 * the server rendered the page and another a moment later in the browser, which
 * Svelte reports as a hydration mismatch. So `+page.server.ts` reads the clock
 * once with `canChangeDelegationSeats` above and hands the answer down as
 * `canChangeSeats`.
 *
 * `conferenceStartDay` arrives already formatted, such as "20 Jan 2027"; the
 * page formats it with `formatDateRange(startDate, startDate)` from
 * `$lib/dates`, which is what every other page writes a single day with.
 */
export function delegationSeatsNotice(
	progress: DelegationProgress,
	canChangeSeats: boolean,
	conferenceStartDay: string
): SeatsNotice {
	if (!canChangeSeats) {
		return { tone: 'warning', message: SEATS_LOCKED_REFUSAL };
	}

	// A delegation with nothing allocated yet has assigned nothing either, and
	// "Every seat is assigned." would read as a strange thing to tell it.
	if (progress.allocated > 0 && progress.assigned === progress.allocated) {
		return { tone: 'success', message: EVERY_SEAT_ASSIGNED };
	}

	return { tone: 'info', message: `Assign every seat before ${conferenceStartDay}.` };
}

/**
 * The warning above the list of members without a seat, or `null` when they all
 * still fit.
 *
 * It counts the members against the seats that are still empty rather than
 * against the seats allocated, because the ones already taken are no help to
 * anybody left over.
 */
export function tooFewSeatsWarning(
	progress: DelegationProgress,
	unseatedMemberCount: number
): string | null {
	// A delegation with nothing allocated is shown the empty state instead, and
	// asking the organisers for more seats than none is not what it needs to hear
	// — least of all a delegation whose request was turned down. Every member of
	// it is unseated, so without this the warning would show for all of them.
	// `delegationSeatsNotice` above holds the same line for the same reason.
	if (progress.allocated === 0) {
		return null;
	}

	const emptySeats = progress.allocated - progress.assigned;

	if (unseatedMemberCount > emptySeats) {
		return TOO_FEW_SEATS_WARNING;
	}

	return null;
}

/** Why putting a member into a seat was refused. */
export type AssignSeatRefusal =
	'no_member' | 'not_a_member' | 'already_seated' | 'not_your_delegation' | 'seat_taken' | 'locked';

/**
 * The sentence the flash shows when an `assign` is refused. Each one is quoted
 * word for word from `05-pages/delegation/seats.md`.
 *
 * `memberName` is only used by the two refusals that name somebody; the rest
 * ignore it, because nobody was picked or the seat was the problem.
 *
 * The `switch` deliberately has no `default`. TypeScript then checks that every
 * value of `AssignSeatRefusal` is answered, so adding a seventh refusal and
 * forgetting to word it fails `pnpm check` instead of returning nothing to a
 * head who is owed an explanation.
 */
export function assignSeatRefusalSentence(refusal: AssignSeatRefusal, memberName: string): string {
	switch (refusal) {
		case 'no_member':
			return 'Pick a member.';
		case 'not_a_member':
			return `${memberName} is not in this delegation.`;
		case 'already_seated':
			return `${memberName} already has a seat.`;
		case 'not_your_delegation':
			return 'That seat is not allocated to your delegation.';
		case 'seat_taken':
			return 'That seat is already taken.';
		case 'locked':
			return SEATS_LOCKED_REFUSAL;
	}
}

/** Why emptying a seat was refused. */
export type UnassignSeatRefusal = 'not_your_delegation' | 'already_empty' | 'locked';

/**
 * The sentence the flash shows when an `unassign` is refused. The `switch` has
 * no `default` for the reason the one above it has none.
 *
 * Two of the three are quoted from `05-pages/delegation/seats.md`.
 * `already_empty` is this page's own wording: the spec quotes no sentence for
 * unassigning a seat nobody is in, so it is worded the way
 * `ALREADY_FREE_REFUSAL` on the organisers' allocation grid words the same
 * situation, and the two pages therefore say the same thing about it.
 */
export function unassignSeatRefusalSentence(refusal: UnassignSeatRefusal): string {
	switch (refusal) {
		case 'not_your_delegation':
			return 'That seat is not allocated to your delegation.';
		case 'already_empty':
			return 'That seat is already empty.';
		case 'locked':
			return SEATS_LOCKED_REFUSAL;
	}
}

/**
 * "Luis Ortega now represents France in UNSC."
 *
 * `committeeName` is the committee's abbreviation when it has one, because the
 * organisers' allocation grid already words the same event that way in
 * `delegateMovedFlash`, and somebody who is both an organiser and a head should
 * not see one committee called two different things.
 */
export function memberSeatedFlash(
	memberName: string,
	seatName: string,
	committeeName: string
): string {
	return `${memberName} now represents ${seatName} in ${committeeName}.`;
}

/**
 * What the Unassign dialog tells a head before a member is taken out of a seat.
 *
 * It is the consequence alone: `ConfirmButton` asks the question itself, in its
 * `confirmTitle`, and the other confirmations in the app — withdrawing a
 * delegation request, deleting an account — put only the consequence in the
 * body.
 *
 * `seats.md` words this "Their position paper will be removed" and asks for the
 * dialog only when the seat has one. A head may not read the `documents` rows
 * to find out whether it has: the select policy there is the seat's own
 * delegate, the committee's chair and the organisers. So the page cannot tell,
 * and "Any position paper they uploaded" is true either way. The
 * `seats_clear_position_paper` trigger is what deletes the row.
 */
export const UNASSIGN_SEAT_CONFIRM_TEXT =
	'Any position paper they uploaded will be removed; they can upload it again once they hold a seat.';

/** The heading of that dialog, which is where the question itself belongs. */
export function unassignSeatConfirmTitle(memberName: string): string {
	return `Unassign ${memberName}?`;
}

/**
 * One line of the member dropdown: "Sara Khan · Beginner", or "Sara Khan (you)
 * · Beginner" for the reader's own name, because `seats.md` says a head may
 * assign themselves and a head reading their own name in a list of other people
 * would otherwise have to work out which one they are.
 */
export function unseatedMemberOptionLabel(member: UnseatedMember, myUserId: string): string {
	const level = statusLabel('experience_level', member.experienceLevel);

	if (member.userId === myUserId) {
		return `${member.fullName} (you) · ${level}`;
	}

	return `${member.fullName} · ${level}`;
}

// The two sentences an empty seat can show. They are not exported, because
// `emptySeatSentence` below is the only thing that ever chooses between them.
const NOBODY_IN_THIS_SEAT = 'Nobody is in this seat.';
const EVERYBODY_ALREADY_SEATED = 'Everybody in the delegation already has a seat.';

/**
 * Why an empty seat is drawn without a dropdown or an Assign button.
 *
 * There are only two reasons and a head is owed the right one: either the
 * conference has started and nobody may be moved any more, or everybody in the
 * delegation already has a seat of their own.
 */
export function emptySeatSentence(canChangeSeats: boolean): string {
	if (!canChangeSeats) {
		return NOBODY_IN_THIS_SEAT;
	}

	return EVERYBODY_ALREADY_SEATED;
}

/**
 * The line under "No seats allocated yet.".
 *
 * `seats.md` names only `submitted` and `rejected`. The other three statuses —
 * `draft`, `accepted` and `withdrawn` — get the waiting sentence too, because
 * it is still the true one: none of them has been allocated anything, and the
 * organisers are still the people who would.
 */
export function noSeatsAllocatedDescription(status: DelegationStatus): string {
	if (status === 'rejected') {
		return 'Your request was not accepted.';
	}

	return 'The organisers allocate seats after accepting your request.';
}

/**
 * The `name` the member dropdown of one seat is sent under, such as
 * `userId-seat-france`.
 *
 * The seat id is in the name because `SelectField` builds the `<select>`'s `id`
 * out of its `name` (`fieldId` in `$lib/form-fields.ts`), and the page draws one
 * dropdown per seat. With a plain `userId` every one of them would carry the
 * same `id`, and clicking the third seat's label would move the cursor into the
 * first seat's dropdown. The form action reads the value back under this same
 * name, which is why the rule is written here once rather than in the page and
 * the action separately.
 */
export function memberFieldName(seatId: string): string {
	return `userId-${seatId}`;
}

/*
 * Everything below belongs to the head's members page,
 * `/delegations/[delegationId]/members`, where a head sees who has joined,
 * shares the join link, names a second head and removes somebody who should not
 * be there. T70 built it.
 *
 * It is the third of the delegation's own pages, after the dashboard at the top
 * of this file and the seats page in the section above, and it is put together
 * the way that section is: the shapes the queries fill in, then the wording, then
 * the few calculations the page does on top of them. The tab strip at the end is
 * the one piece the whole delegation layout uses, because it is what carries a
 * head between all three pages.
 *
 * That strip is also why this file imports `$lib/urls.ts`, which imports this one
 * back for `EMPTY_DELEGATION_LIST_QUERY`. Two files importing each other is fine
 * as long as neither *runs* anything from the other while it is still being
 * loaded, and neither does: every use on both sides is inside a function body.
 * `$lib/manage.ts` builds the organiser's sidebar out of `$lib/urls.ts` the same
 * way, and nothing imports that one back.
 *
 * The rules come from `specs/06-features/delegations.md` and
 * `specs/02-architecture/permissions.md`; the wording of every message comes from
 * `specs/05-pages/delegation/members.md` and `specs/03-design/writing-style.md`.
 */

/** The seat a delegation member sits in, as the members page names it. */
export type DelegationMemberSeat = {
	seatName: string;
	/** Empty for a seat that is a role rather than a country, which has no flag. */
	countryCode: string | null;
	committeeName: string;
	committeeAbbreviation: string | null;
};

/**
 * The private facts a head, and the organisers of the conference, read about
 * a delegation's members.
 *
 * The head's own members page shows the last two through `memberDetailItems`
 * below, and the head reads nothing else: `delegation_member_details`, the
 * view they read, has no other column. `dateOfBirth` is read for the
 * organiser's review page alone, which turns it into an age beside them.
 */
export type DelegationMemberDetails = {
	/** `YYYY-MM-DD`, or `null` when the member never gave one or the reader is a head. */
	dateOfBirth: string | null;
	phone: string | null;
	dietaryRequirements: string | null;
};

/** One row of the members page. */
export type DelegationMember = {
	userId: string;
	fullName: string;
	avatarPath: string | null;
	institutionName: string | null;
	experienceLevel: ExperienceLevel;
	role: DelegationRole;
	/** ISO timestamp: when they joined. */
	joinedAt: string;
	/** The seat they hold in this delegation, or `null` while they hold none. */
	seat: DelegationMemberSeat | null;
	/** Phone and dietary requirements. `null` when the reader may not read them. */
	details: DelegationMemberDetails | null;
};

/** Why one of the three member actions was turned down. */
export type MemberActionRefusal = 'not_a_member' | 'last_head' | 'holds_a_seat' | 'yourself';

/** The flash a member of the delegation, who is not a head, is sent away with. */
export const ONLY_HEADS_MANAGE_MEMBERS = 'Only heads manage members.';

/** The badge on the right of a member who has not been put into a seat yet. */
export const NO_SEAT_LABEL = 'No seat yet';

/** The empty state's title when the head is still the only person in the delegation. */
export const NOBODY_JOINED_TITLE = 'Nobody has joined yet.';

/** The line under that title, which says what to do about it. */
export const NOBODY_JOINED_DESCRIPTION =
	'Share the join link. Members appear here as soon as they join.';

/** The sentence on the members page's invite card that explains how somebody uses the join link. */
export const INVITE_CARD_HINT = 'Members create an account, open the link and press Join.';

/**
 * The same card's sentence on the dashboard. It says "can join", not "can ask to
 * join": `join_delegation` adds the membership there and then, and no head
 * approves it afterwards. The sentence used to promise a gate this app does not have.
 */
export const JOIN_CODE_CARD_HINT = 'Anybody with this link can join your delegation.';

/** The flash after a head gives up being one. */
export const STEPPED_DOWN_FLASH = 'You are no longer a head.';

/**
 * What a detail row says when the member never filled that box in.
 *
 * The same two words `PrivateDetails.svelte` on the profile page writes over an
 * empty field, so a member reading their own details and the head reading the
 * same details see the same answer for the same blank box.
 */
export const MEMBER_DETAIL_MISSING = 'Not given';

/**
 * The line under the page title: "9 joined · 12 seats requested".
 *
 * "joined" is the same word for one person and for nine, so only the seats
 * clause changes. Those seats are counted by `countedSeatsRequested` further up
 * this file, which the organiser's own table already words the same way, so a
 * head and an organiser never read two different phrases for the same number.
 */
export function delegationMembersSubtitle(memberCount: number, requestedSeats: number): string {
	const joined = `${memberCount} joined`;
	const seats = countedSeatsRequested(requestedSeats);

	return `${joined} · ${seats}`;
}

/**
 * The quiet line under a member's name: "Head · Advanced · Lycée Français de La
 * Haye", or "joined 4 Oct · Beginner" for a member who gave no institution.
 *
 * A head's row says what they are rather than when they joined, which is what
 * the wireframe in `members.md` draws. The experience level and the school come
 * after it because a head deciding who sits in which seat wants both, and the
 * seats page already writes the same level beside the same name.
 *
 * `joinedDay` is what `formatDayAndMonth` in `$lib/dates.ts` answered. No date
 * work is done here, so this function can be read and tested without a clock and
 * without a timezone.
 */
export function memberRowSubtitle(member: DelegationMember, joinedDay: string): string {
	const standing = member.role === 'head' ? 'Head' : `joined ${joinedDay}`;
	const level = statusLabel('experience_level', member.experienceLevel);
	const institution = member.institutionName?.trim() ?? '';

	// The profile form lets somebody leave their institution empty, and an empty
	// one is left out rather than drawn as a dangling "·".
	if (institution === '') {
		return `${standing} · ${level}`;
	}

	return `${standing} · ${level} · ${institution}`;
}

/**
 * A member's name, with "(you)" after the reader's own.
 *
 * `members.md` asks for the head's own row to be marked, because a head reading
 * a list of names they mostly do not recognise should not have to work out which
 * one is theirs. `unseatedMemberOptionLabel` further up this file marks the same
 * name the same way; unlike that one, this adds no experience level, because the
 * row's subtitle, `memberRowSubtitle` above, already says it.
 */
export function memberDisplayName(member: DelegationMember, myUserId: string): string {
	if (member.userId === myUserId) {
		return `${member.fullName} (you)`;
	}

	return member.fullName;
}

/**
 * What a member's seat reads as on the right of their row: "France · UNSC".
 *
 * The committee's abbreviation is used when it has one, because the badge is a
 * narrow thing at the end of a row. A committee without one is written out in
 * full rather than left out, so the badge never reads as a country on its own.
 */
export function memberSeatLabel(seat: DelegationMemberSeat): string {
	const committee = seat.committeeAbbreviation ?? seat.committeeName;

	return `${seat.seatName} · ${committee}`;
}

/**
 * The sentence `members.md` quotes for each refusal of Make head, Step down or
 * Remove.
 *
 * `memberName` is only used by the refusal that names somebody; the other three
 * ignore it, because the problem is the delegation or the reader themselves.
 *
 * The `switch` deliberately has no `default`, exactly as
 * `assignSeatRefusalSentence` above has none. TypeScript then checks that every
 * value of `MemberActionRefusal` is answered, so adding a fifth refusal and
 * forgetting to word it fails `pnpm check` instead of returning nothing to a head
 * who is owed an explanation.
 */
export function memberActionRefusalSentence(
	refusal: MemberActionRefusal,
	memberName: string
): string {
	switch (refusal) {
		case 'not_a_member':
			return 'That person is not a member.';
		case 'last_head':
			return 'A delegation needs at least one head.';
		case 'holds_a_seat':
			return `${memberName} holds a seat; unassign it on the Seats page first.`;
		case 'yourself':
			return 'You cannot remove yourself; step down or withdraw the delegation.';
	}
}

/** The flash after a member is given the head role. */
export function madeHeadFlash(memberName: string): string {
	return `${memberName} is now a head.`;
}

/** The flash after a member is taken out of the delegation. */
export function memberRemovedFlash(memberName: string): string {
	return `${memberName} removed.`;
}

/**
 * The heading of the Remove dialog, which is where the question itself belongs.
 *
 * `unassignSeatConfirmTitle` above splits the same dialog the same way: the
 * question in the title, the consequence in the body.
 */
export function removeMemberConfirmTitle(memberName: string): string {
	return `Remove ${memberName}?`;
}

/** The body of that dialog, which is the sentence `members.md` quotes. */
export function removeMemberConfirmText(memberName: string): string {
	return `Remove ${memberName} from the delegation?`;
}

/**
 * Why nobody can join any more: "This delegation is rejected; nobody can join."
 * `null` while people still can, which is every status but `rejected` and
 * `withdrawn` (`06-features/delegations.md`); the join-code card is drawn then.
 *
 * This is the one place in the app that prints a status word instead of passing
 * it through `statusLabel`, and it is deliberate. `members.md` quotes the
 * sentence with the raw status in it, and the badge labels do not fit the
 * clause it is in: `statusLabel('delegation_status', 'rejected')` is "Not
 * accepted", and "This delegation is Not accepted; nobody can join." is not
 * English. Only `rejected` and `withdrawn` ever get a sentence, and both of
 * those words read as they stand.
 */
export function delegationClosedNotice(status: DelegationStatus): string | null {
	if (status !== 'rejected' && status !== 'withdrawn') {
		return null;
	}

	return `This delegation is ${status}; nobody can join.`;
}

/**
 * One private fact as a detail row reads it, or `MEMBER_DETAIL_MISSING` for a box
 * the member left empty.
 *
 * A blank string is treated as no answer as well as a null, because the profile
 * form stores whatever was typed and an accidental space is not an answer.
 */
function memberDetailValue(value: string | null): string {
	if (value === null || value.trim() === '') {
		return MEMBER_DETAIL_MISSING;
	}

	return value;
}

/**
 * The facts behind the "Details" toggle, ready for `KeyValueList`.
 *
 * An empty list means the reader may not read them at all: the
 * `delegation_member_details` view answers only the heads of the delegation
 * (the conference team reads the details through views of its own), so a
 * member looking at another member gets `null` from the query and no rows here.
 *
 * A head always gets both rows, even when neither box was filled in, so that
 * they can tell "nothing was given" from "not shown". The two labels are the ones
 * `PrivateDetails.svelte` gives the same two columns on the profile page.
 */
export function memberDetailItems(details: DelegationMemberDetails | null): KeyValueItem[] {
	if (details === null) {
		return [];
	}

	return [
		{ label: 'Phone', value: memberDetailValue(details.phone) },
		{ label: 'Dietary requirements', value: memberDetailValue(details.dietaryRequirements) }
	];
}

/**
 * The members in the order `members.md` asks for: heads first, then the oldest
 * membership first.
 *
 * The order is worked out here rather than asked of the database for the reason
 * `sortOrganizationMembers` in `$lib/organizations.ts` gives: it is a rule about
 * what the roles mean, and `order by role` in Postgres would sort the two words
 * alphabetically, putting every plain member above every head.
 *
 * It sorts a copy, because the array a `load` function returns is handed straight
 * to the page and sorting in place would change what the caller holds. Both
 * `joinedAt` values are ISO timestamps, and text in that shape sorts into the
 * same order as the moments it names, because it runs from the largest part to
 * the smallest.
 */
export function sortDelegationMembers(members: DelegationMember[]): DelegationMember[] {
	return [...members].sort((first, second) => {
		if (first.role !== second.role) {
			return first.role === 'head' ? -1 : 1;
		}

		return first.joinedAt.localeCompare(second.joinedAt);
	});
}

/**
 * Whether a link built by `resolve()` points at the page the reader is on.
 *
 * It cannot be a plain `href === currentPathname`, because `resolve()` answers a
 * *relative* address while a page is being built on the server, so that a build
 * can be served from any folder. `absolutePath` in `$lib/urls.ts` is what settles
 * it and its comment explains the whole of it; `isCurrentPage` in
 * `$lib/manage.ts` marks the organiser's sidebar exactly this way.
 *
 * The comparison is exact, and never a prefix test. That matters more here than
 * it does in that sidebar: `/delegations/<id>` is the start of both
 * `/delegations/<id>/members` and `/delegations/<id>/seats`, so a prefix test
 * would leave Overview marked on all three pages at once.
 */
function isCurrentDelegationPage(href: string, currentPathname: string): boolean {
	return absolutePath(href, currentPathname) === currentPathname;
}

/**
 * The same for the Papers tab (T147), which stays marked on the page of one
 * member's paper underneath it, `/delegations/<id>/papers/<seat>`. Nothing
 * else starts with `/papers/`, so this prefix test marks no other tab.
 */
function isInDelegationPapers(href: string, currentPathname: string): boolean {
	const papersPath = absolutePath(href, currentPathname);

	return currentPathname === papersPath || currentPathname.startsWith(`${papersPath}/`);
}

/**
 * The tab strip on the delegation layout: Overview, Members, Seats and Papers,
 * with the page the reader is on marked.
 *
 * A plain member gets Overview and Papers. Members and Seats are head-only
 * pages — both `members.md` and `seats.md` send anybody else back to the
 * dashboard with a flash — while the "Position papers" view is for everybody
 * in the delegation (T147).
 *
 * The two counts are the work a head still has in front of them: how many people
 * have joined, and how many seats the organisers allocated. Overview and Papers
 * carry no count, because neither is a number of anything.
 */
export function delegationTabs(
	delegationId: string,
	myRole: DelegationRole,
	memberCount: number,
	allocatedSeats: number,
	currentPathname: string
): Tab[] {
	const overviewHref = delegationUrl(delegationId);
	const papersHref = delegationPapersUrl(delegationId);

	const overviewTab: Tab = {
		label: 'Overview',
		href: overviewHref,
		isActive: isCurrentDelegationPage(overviewHref, currentPathname)
	};
	const papersTab: Tab = {
		label: 'Papers',
		href: papersHref,
		isActive: isInDelegationPapers(papersHref, currentPathname)
	};

	if (myRole !== 'head') {
		return [overviewTab, papersTab];
	}

	const membersHref = delegationMembersUrl(delegationId);
	const seatsHref = delegationSeatsUrl(delegationId);

	return [
		overviewTab,
		{
			label: 'Members',
			href: membersHref,
			isActive: isCurrentDelegationPage(membersHref, currentPathname),
			count: memberCount
		},
		{
			label: 'Seats',
			href: seatsHref,
			isActive: isCurrentDelegationPage(seatsHref, currentPathname),
			count: allocatedSeats
		},
		papersTab
	];
}
