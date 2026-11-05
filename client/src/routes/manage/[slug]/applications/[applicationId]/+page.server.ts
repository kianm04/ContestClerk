import { error, fail, redirect } from '@sveltejs/kit';
import { EMPTY_ALLOCATION_QUERY } from '$lib/allocation';
import {
	ALREADY_DECIDED_REFUSAL,
	NOTHING_TO_REVOKE_REFUSAL,
	ageRangeWarning,
	canAllocate,
	canRevoke,
	paidInvoiceNumberOf,
	readRevokeTo,
	revokedFlash,
	type ApplicationForReview,
	type RevokeTo
} from '$lib/application-review';
import {
	CHOOSE_PARTNER_REFUSAL,
	TEAM_CHANGED_FLASH,
	openTeammateIds,
	teamCountryOptions,
	teamRefusal,
	type TeamAccept,
	type TeamMemberRow,
	type TeamSection
} from '$lib/application-teams';
import { parseApplicationListQuery } from '$lib/applications';
import { UNEXPECTED_ERROR_TEXT } from '$lib/auth';
import { ageInYears } from '$lib/dates';
import { hasPermission } from '$lib/permissions';
import { privateDetailsAccess, withheldPrivateDetails } from '$lib/private-details';
import {
	manageAllocationUrl,
	manageApplicationReviewActionUrl,
	manageApplicationReviewUrl,
	manageApplicationsUrl,
	manageFeesInvoiceUrl,
	personUrl
} from '$lib/urls';
import { requireManagePage, requirePermission } from '$lib/server/access';
import {
	acceptIntoSeat,
	acceptTeamIntoCountry,
	messageOf,
	readDecisionNote,
	readInternalNote,
	rejectOne,
	saveInternalNote,
	waitlistOne
} from '$lib/server/application-decisions';
import {
	findQueueNeighbours,
	getApplicationForReview,
	revokeAcceptance
} from '$lib/server/application-review';
import {
	listTeamMembers,
	listTeamPartnerOptions,
	removeFromTeam,
	teamApplications
} from '$lib/server/application-teams';
import { setFlash } from '$lib/server/flash';
import { listSeatsByCommittee } from '$lib/server/seat-acceptance';
// `./$types` holds the types SvelteKit generates for this one route, so
// `PageServerLoad`, `Actions` and `RequestEvent` already know which parameters
// this address has and what the layout above it hands down.
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/** What an application of somebody else's conference gets, and a `draft` with it. */
const NO_SUCH_APPLICATION = 'This application does not exist.';

/**
 * Words from the sentences `revoke_seat` raises, from T16's migration.
 *
 * They are matched on their words rather than on a code of our own, because a
 * Postgres exception arrives as a sentence. Anything that matches none of them
 * is somebody else's text — a driver's, Postgres's, PostgREST's — and is logged
 * rather than shown, which `03-design/writing-style.md` asks for. The words of
 * `accept_application` live with the other decisions, in
 * `$lib/server/application-decisions.ts`, which the review panel beside the
 * applications list shares.
 */
const SEAT_EMPTY_WORDS = 'Nobody is sitting in that seat';
const SEAT_GONE_WORDS = 'That seat does not exist';

/**
 * Which card on the page a refusal belongs to.
 *
 * One page holds several forms, and a message under the wrong one would be a
 * message about something the organiser did not just do.
 */
type FailedAction =
	'accept' | 'acceptTeam' | 'waitlist' | 'reject' | 'revoke' | 'saveInternalNote' | 'team';

/**
 * What a refused post sends back to the page.
 *
 * `fail` answers with the page again rather than redirecting, so whatever the
 * organiser had chosen or typed comes back with it. The actions that succeed
 * redirect with a flash instead, because after a success there is nothing left
 * to keep.
 */
type ReviewFormState = {
	failedAction: FailedAction;
	message: string;
	/** The seat chosen in the allocation panel. */
	seatId: string;
	/** The country chosen for a team. */
	countryCode: string;
	/** What was in the note to the applicant. */
	decisionNote: string;
	/** What was in the organisers' own note. */
	internalNote: string;
	/** Which status "Revoke acceptance" was asked to leave. */
	revokeTo: RevokeTo;
};

/**
 * The gate of every action on this page: `decide_applications`, by the table
 * in section 8 of docs/roles-and-permissions.md. Reading the page needs only
 * `read_applications`, so the page hides its forms from a reader who may not
 * decide, and this is asked again here because a form action is its own
 * request and nothing `load` worked out reaches it.
 */
async function requireDeciderFor(event: RequestEvent) {
	return requirePermission(event.locals, event.url, event.params.slug, 'decide_applications');
}

/**
 * The application this address is about, read again inside an action.
 *
 * The page in the organiser's browser is a moment old, and another organiser
 * may have decided the same application in between, so every action looks at
 * its status now rather than at the one the page was drawn with.
 */
async function readApplicationOrFail(
	event: RequestEvent,
	conferenceId: string
): Promise<ApplicationForReview> {
	const review = await getApplicationForReview(
		event.locals.supabase,
		conferenceId,
		event.params.applicationId
	);

	if (!review) {
		error(404, NO_SUCH_APPLICATION);
	}

	return review;
}

/**
 * Sets the flash and sends the browser back to this page, which redraws it.
 *
 * The list query the page was opened with is read back out of the address, so
 * "Previous" and "Next" still walk the same queue afterwards.
 */
function finish(event: RequestEvent, message: string): never {
	const query = parseApplicationListQuery(event.url.searchParams);

	setFlash(event.cookies, { tone: 'success', message });
	redirect(303, manageApplicationReviewUrl(event.params.slug, event.params.applicationId, query));
}

/** What a refusal carries when nothing else was typed: the saved note and no choices. */
function emptyState(failedAction: FailedAction, review: ApplicationForReview): ReviewFormState {
	return {
		failedAction,
		message: '',
		seatId: '',
		countryCode: '',
		decisionNote: '',
		internalNote: review.application.internalNote ?? '',
		revokeTo: 'rejected'
	};
}

/** Answers with the page again, carrying one message and everything typed so far. */
function refuse(state: ReviewFormState) {
	return fail(400, state);
}

/** Runs one change to a team, and answers with the page again if it was refused. */
async function changeTeam(
	event: RequestEvent,
	review: ApplicationForReview,
	change: () => Promise<void>
) {
	try {
		await change();
	} catch (thrown) {
		const refusal = teamRefusal(messageOf(thrown));

		if (refusal === null) {
			console.error('Could not change an application team', thrown);
		}

		return refuse({ ...emptyState('team', review), message: refusal ?? UNEXPECTED_ERROR_TEXT });
	}

	finish(event, TEAM_CHANGED_FLASH);
}

/** What the decision card says when `revoke_seat` refused. */
function revokeRefusal(thrown: unknown): string {
	const databaseMessage = messageOf(thrown);

	// Somebody emptied or deleted the seat first, which is what was asked for anyway.
	if (databaseMessage.includes(SEAT_EMPTY_WORDS) || databaseMessage.includes(SEAT_GONE_WORDS)) {
		return NOTHING_TO_REVOKE_REFUSAL;
	}

	console.error('Could not revoke an acceptance', thrown);

	return UNEXPECTED_ERROR_TEXT;
}

/**
 * Everything the review page draws, on top of what the layout above it read.
 *
 * `parent()` is a promise for whatever the layout's own `load` returned: this
 * conference and the organisation running it. The layout let in anybody whose
 * permissions open some page of this conference, and handed those permissions
 * down; the first lines below answer a 404 unless they open this one.
 *
 * The table's query string comes along in the address, so this page knows the
 * queue it was opened from. `load` runs again after every redirect and on every
 * "Previous" or "Next", which is what redraws the page.
 *
 * Files under `$lib/server` only ever run on the server, so the queries below
 * cannot be reached by anything the browser does.
 */
export const load: PageServerLoad = async ({ parent, params, url, locals }) => {
	const { conference, permissions } = await parent();
	// A 404 unless the reader's permissions open this page, by the table in
	// `$lib/manage-pages.ts`.
	requireManagePage(permissions, 'applications');
	const query = parseApplicationListQuery(url.searchParams);

	const review = await getApplicationForReview(
		locals.supabase,
		conference.id,
		params.applicationId
	);

	if (!review) {
		error(404, NO_SUCH_APPLICATION);
	}

	const { application } = review;

	/*
		Only an application that can still be accepted needs the free seats, so a
		decided one does not read every seat of the conference. The two lookups
		need nothing from each other and run side by side.
	*/
	const [neighbours, seatGroups, teamMembers] = await Promise.all([
		findQueueNeighbours(locals.supabase, conference.id, query, application.id),
		canAllocate(application.status)
			? listSeatsByCommittee(locals.supabase, conference.id, application.committeePreferences)
			: Promise.resolve([]),
		listTeamMembers(locals.supabase, conference.id, application.id)
	]);
	const canDecide = hasPermission(permissions, 'decide_applications');

	/*
		The friends this applicant applied with (Trello pZNcdPqU). While this
		application and at least one teammate are undecided, the team is accepted
		as one: one country, a committee each, instead of one seat.
	*/
	const teammateIds = openTeammateIds(teamMembers, application.id);
	const isTeamDecision = canAllocate(application.status) && teammateIds.length > 0;
	const teamRows: TeamMemberRow[] = teamMembers.map((member) => ({
		...member,
		reviewHref:
			member.status === 'draft' || member.applicationId === application.id
				? null
				: manageApplicationReviewUrl(conference.slug, member.applicationId, query),
		profileHref: personUrl(member.userId)
	}));
	const teamPartnerOptions = canDecide
		? await listTeamPartnerOptions(locals.supabase, conference.id, [
				application.id,
				...teamMembers.map((member) => member.applicationId)
			])
		: [];

	// Email and phone, and the age and welfare rows, each only with their
	// permission on this conference. The views behind `getApplicationForReview`
	// answer for anybody taking part where the reader holds the permission,
	// which may be another conference altogether, so what the reader does not
	// hold here is nulled before it reaches the browser.
	const detailsAccess = privateDetailsAccess(permissions);
	const details =
		review.details === null ? null : withheldPrivateDetails(review.details, detailsAccess);
	const age = ageInYears(details?.dateOfBirth ?? null, new Date());

	/** The address of one form action on this page, keeping the queue. */
	function actionUrl(actionName: string): string {
		return manageApplicationReviewActionUrl(conference.slug, application.id, query, actionName);
	}

	return {
		...review,
		details,
		timezone: conference.timezone,
		age,
		// The age comes from the date of birth, so its warning is a welfare detail too.
		ageWarning: detailsAccess.welfare
			? ageRangeWarning(age, conference.minAge, conference.maxAge)
			: null,
		detailsAccess,
		/**
		 * Whether this reader may decide, which every form on the page needs. A
		 * reader without it sees the application, its decision and its note,
		 * with nothing said about what is missing. The actions ask again.
		 */
		canDecide,
		seatGroups,
		profileHref: personUrl(review.profile.userId),
		team: {
			members: teamRows,
			partnerOptions: teamPartnerOptions,
			addAction: actionUrl('addToTeam'),
			removeAction: actionUrl('removeFromTeam')
		} satisfies TeamSection,
		/** "Accept the team" in place of the seat picker, or null when this is decided alone. */
		teamAccept: isTeamDecision
			? ({
					countryOptions: teamCountryOptions(seatGroups, teammateIds.length + 1),
					formaction: actionUrl('acceptTeam')
				} satisfies TeamAccept)
			: null,
		backHref: manageApplicationsUrl(conference.slug, query),
		previousHref:
			neighbours.previousId === null
				? null
				: manageApplicationReviewUrl(conference.slug, neighbours.previousId, query),
		nextHref:
			neighbours.nextId === null
				? null
				: manageApplicationReviewUrl(conference.slug, neighbours.nextId, query),
		invoiceHref:
			review.invoice === null ? null : manageFeesInvoiceUrl(conference.slug, review.invoice.id),
		changeSeatHref:
			review.seat === null
				? null
				: manageAllocationUrl(conference.slug, { ...EMPTY_ALLOCATION_QUERY, seat: review.seat.id }),
		actionUrls: {
			accept: actionUrl('accept'),
			waitlist: actionUrl('waitlist'),
			reject: actionUrl('reject'),
			revoke: actionUrl('revoke'),
			saveInternalNote: actionUrl('saveInternalNote')
		}
	};
};

export const actions: Actions = {
	/** Give the applicant the chosen seat, which accepts them and writes their invoice. */
	accept: async (event) => {
		const { conference } = await requireDeciderFor(event);

		const formData = await event.request.formData();
		const seatId = String(formData.get('seatId') ?? '');

		const review = await readApplicationOrFail(event, conference.id);
		const outcome = await acceptIntoSeat(event.locals.supabase, conference.id, review, seatId);

		if (!outcome.isDone) {
			return refuse({ ...emptyState('accept', review), seatId, message: outcome.message });
		}

		finish(event, outcome.flash);
	},

	/**
	 * Accept the whole team into one country: each undecided member takes its
	 * seat in a committee of their own, the one they asked for where it is free.
	 */
	acceptTeam: async (event) => {
		const { conference } = await requireDeciderFor(event);

		const formData = await event.request.formData();
		const countryCode = String(formData.get('countryCode') ?? '');

		const review = await readApplicationOrFail(event, conference.id);

		if (!canAllocate(review.application.status)) {
			return refuse({
				...emptyState('acceptTeam', review),
				countryCode,
				message: ALREADY_DECIDED_REFUSAL
			});
		}

		const members = await listTeamMembers(
			event.locals.supabase,
			conference.id,
			review.application.id
		);
		const outcome = await acceptTeamIntoCountry(
			event.locals.supabase,
			conference.id,
			members,
			countryCode
		);

		if (!outcome.isDone) {
			return refuse({ ...emptyState('acceptTeam', review), countryCode, message: outcome.message });
		}

		finish(event, outcome.flash);
	},

	/** Put another applicant in this application's team, or this one in theirs. */
	addToTeam: async (event) => {
		const { conference } = await requireDeciderFor(event);

		const formData = await event.request.formData();
		const partnerApplicationId = String(formData.get('partnerApplicationId') ?? '');

		const review = await readApplicationOrFail(event, conference.id);

		if (partnerApplicationId === '') {
			return refuse({ ...emptyState('team', review), message: CHOOSE_PARTNER_REFUSAL });
		}

		return changeTeam(event, review, () =>
			teamApplications(event.locals.supabase, review.application.id, partnerApplicationId)
		);
	},

	/** Take one member out of the team, this applicant or any other. */
	removeFromTeam: async (event) => {
		const { conference } = await requireDeciderFor(event);

		const formData = await event.request.formData();
		const memberApplicationId = String(formData.get('memberApplicationId') ?? '');

		const review = await readApplicationOrFail(event, conference.id);

		// Only a member of this page's team, so the form cannot reach any other.
		const members = await listTeamMembers(
			event.locals.supabase,
			conference.id,
			review.application.id
		);

		if (!members.some((member) => member.applicationId === memberApplicationId)) {
			return refuse({
				...emptyState('team', review),
				message: 'That application is not in a team.'
			});
		}

		return changeTeam(event, review, () =>
			removeFromTeam(event.locals.supabase, memberApplicationId)
		);
	},

	/** Put an application still under review on the waiting list. */
	waitlist: async (event) => {
		const { conference, user } = await requireDeciderFor(event);

		const formData = await event.request.formData();
		const decisionNote = readDecisionNote(formData);

		const review = await readApplicationOrFail(event, conference.id);
		const members = await listTeamMembers(
			event.locals.supabase,
			conference.id,
			review.application.id
		);
		const outcome = await waitlistOne(
			event.locals.supabase,
			review,
			user.id,
			decisionNote,
			openTeammateIds(members, review.application.id)
		);

		if (!outcome.isDone) {
			return refuse({ ...emptyState('waitlist', review), decisionNote, message: outcome.message });
		}

		finish(event, outcome.flash);
	},

	/**
	 * Mark the application "not accepted" and tell the applicant.
	 *
	 * `ConfirmButton`'s answer sends `confirm=1` as well, which nothing here
	 * reads: it has already asked, in a dialog with JavaScript and on the
	 * confirmation page without it. The delegation review page says the same
	 * about its own.
	 */
	reject: async (event) => {
		const { conference, user } = await requireDeciderFor(event);

		const formData = await event.request.formData();
		const decisionNote = readDecisionNote(formData);

		const review = await readApplicationOrFail(event, conference.id);
		const members = await listTeamMembers(
			event.locals.supabase,
			conference.id,
			review.application.id
		);
		const outcome = await rejectOne(
			event.locals.supabase,
			review,
			user.id,
			decisionNote,
			openTeammateIds(members, review.application.id)
		);

		if (!outcome.isDone) {
			return refuse({ ...emptyState('reject', review), decisionNote, message: outcome.message });
		}

		finish(event, outcome.flash);
	},

	/** Take an accepted applicant's seat back, leaving them not accepted or withdrawn. */
	revoke: async (event) => {
		const { conference } = await requireDeciderFor(event);

		const formData = await event.request.formData();
		const revokeTo = readRevokeTo(String(formData.get('revokeTo') ?? ''));

		const review = await readApplicationOrFail(event, conference.id);
		const failure: ReviewFormState = { ...emptyState('revoke', review), revokeTo };

		if (!canRevoke(review.application.status)) {
			return refuse({ ...failure, message: ALREADY_DECIDED_REFUSAL });
		}

		if (review.seat === null) {
			return refuse({ ...failure, message: NOTHING_TO_REVOKE_REFUSAL });
		}

		// Read before revoking: afterwards an unpaid invoice is void and a paid one
		// is the only kind left worth naming.
		const paidInvoiceNumber = paidInvoiceNumberOf(review.invoice);

		try {
			await revokeAcceptance(
				event.locals.supabase,
				review.application.id,
				review.seat.id,
				revokeTo
			);
		} catch (thrown) {
			return refuse({ ...failure, message: revokeRefusal(thrown) });
		}

		finish(event, revokedFlash(paidInvoiceNumber));
	},

	/** Save the note only the organisers ever read. */
	saveInternalNote: async (event) => {
		const { conference } = await requireDeciderFor(event);

		const formData = await event.request.formData();
		const internalNote = readInternalNote(formData);

		const review = await readApplicationOrFail(event, conference.id);
		const outcome = await saveInternalNote(event.locals.supabase, review, internalNote);

		if (!outcome.isDone) {
			const failure = emptyState('saveInternalNote', review);

			return refuse({ ...failure, internalNote, message: outcome.message });
		}

		finish(event, outcome.flash);
	}
};
