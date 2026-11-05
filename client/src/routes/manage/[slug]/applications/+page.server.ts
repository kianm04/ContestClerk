import { error, fail, redirect } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	APPLICATIONS_PAGE_SIZE,
	DECISION_NOTE_MAX_LENGTH,
	bulkDecisionFlash,
	parseApplicationListQuery,
	readBulkSeatChoices,
	validateBulkSeatChoices,
	type ApplicationListQuery,
	type CommitteeChoice,
	type OrganiserApplicationRow
} from '$lib/applications';
import { suggestSeats, type AllocatableSeat, type SeatGroup } from '$lib/allocation';
import {
	applicationAfterDecision,
	readPanelApplicationId,
	type ReviewPanelRefusal
} from '$lib/application-panel';
import { applicationPanelUrl } from '$lib/application-panel-urls';
import { ACCEPT_TEAM_ON_REVIEW_PAGE_REFUSAL, openTeammateIds } from '$lib/application-teams';
import type { ApplicationForReview } from '$lib/application-review';
import { hasPermission } from '$lib/permissions';
import { privateDetailsAccess } from '$lib/private-details';
import { manageApplicationsUrl } from '$lib/urls';
import { requireManagePage, requirePermission } from '$lib/server/access';
import { listApplicationBoard } from '$lib/server/application-board';
import { rejectApplications, waitlistApplications } from '$lib/server/application-bulk-decisions';
import {
	acceptIntoSeat,
	readDecisionNote,
	readInternalNote,
	rejectOne,
	saveInternalNote,
	waitlistOne,
	type DecisionOutcome
} from '$lib/server/application-decisions';
import { getApplicationForReview } from '$lib/server/application-review';
import { loadReviewPanel } from '$lib/server/application-review-panel';
import { listTeamMembers } from '$lib/server/application-teams';
import { countApplicationsByStatus, listApplications } from '$lib/server/application-table';
import { listCommitteesWithSeatCounts, type CommitteeWithSeats } from '$lib/server/committees';
import { setFlash } from '$lib/server/flash';
import { acceptApplication, listFreeSeats } from '$lib/server/seat-acceptance';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/** What the accept buttons say when the organiser pressed one without ticking anybody. */
const NOTHING_TICKED_TO_ACCEPT = 'Tick the applications you want to accept.';

/** The same for the two buttons that turn an application down. */
const NOTHING_TICKED_TO_REJECT = 'Tick the applications you want to mark as not accepted.';

/** The same for "Waitlist". */
const NOTHING_TICKED_TO_WAITLIST = 'Tick the applications you want to waitlist.';

/** What a post from the review panel gets for an application of somebody else's conference. */
const NO_SUCH_APPLICATION = 'This application does not exist.';

/**
 * What a bulk decision says when the database refused it for a reason the
 * organiser can do nothing about. `05-pages/organiser/applications.md` asks for
 * this sentence and for a log beside it.
 */
const NOTHING_CHANGED_MESSAGE = 'Nothing was changed. Please try again.';

/**
 * The words `accept_application` raises when somebody else took the seat first:
 * the migration raises "That seat is not free".
 *
 * The other reasons it can refuse — an application that is not there, one that
 * has already been decided, a seat belonging to another conference — are each
 * raised with their own sentence, and those sentences are shown to the
 * organiser as they are. Only this one is reworded, because "That seat is not
 * free" does not say that the seat was free a moment ago when the page was
 * drawn.
 */
const SEAT_NOT_FREE_WORDS = 'not free';

/** How the flash explains a seat that has gone since the page was drawn. */
const SEAT_JUST_TAKEN_CLAUSE = 'that seat was just taken.';

/**
 * Every sentence `accept_application` itself raises, word for word from
 * `supabase/migrations/20260918120000_applications_delegations_seat_links.sql`.
 *
 * Each of them was written for an organiser to read, so the flash shows it as
 * it is. Anything else that comes back from the call is not one of ours — a
 * lost connection, an expired token, a constraint nobody foresaw — and
 * `03-design/writing-style.md` says never to put a raw database error on the
 * screen. Matching on the sentence is what tells the two apart, because a
 * Postgres exception arrives as a sentence and not as a code of our own.
 */
const ACCEPT_REFUSALS = [
	'That application does not exist',
	'Only the organisers of this conference can accept an application',
	'Only a submitted or waitlisted application can be accepted',
	'That seat is not part of this conference',
	'That seat is not free'
];

/**
 * The refusal of Accept… and Reject… when every ticked application has been
 * decided or withdrawn since the page was drawn, such as "Nothing changed. 1
 * was already decided.". Without it the panel would open for nobody. It is the
 * sentence the other bulk decisions already use when they change nothing.
 */
function nothingLeftToDecide(tickedCount: number): string {
	return bulkDecisionFlash({ changedCount: 0, skippedCount: tickedCount }, '');
}

/** What the flash says instead of a message nobody wrote for an organiser. */
const SOMETHING_WENT_WRONG_CLAUSE = 'something went wrong on our side. Please try again.';

/**
 * What every action on this page answers with, whether it worked or not.
 *
 * One shape for all five, so `+page.svelte` has a single thing to read rather
 * than a different answer per button. The team page's `TeamActionResult` is the
 * same idea for the same reason.
 */
type ApplicationsActionResult = {
	/** Which panel to draw above the table, or null for none. */
	panel: 'accept' | 'reject' | null;
	/** The applications that panel is about, in the table's order. */
	selected: OrganiserApplicationRow[];
	/** The free seats for each of `selected`, in the same order. */
	suggestions: SeatGroup[][];
	/** A problem with the whole thing, shown in an error Notice at the top. */
	message: string | null;
	/** What was typed into the note, so a refusal keeps it. */
	decisionNote: string;
	/** The seat chosen per application id, so a refused accept keeps its dropdowns. */
	seatChoices: Record<string, string>;
	/** Why a post from the review panel beside the table was refused, or null. */
	reviewPanel: ReviewPanelRefusal | null;
};

/** That answer with nothing in it, which every action below starts from. */
function blankResult(): ApplicationsActionResult {
	return {
		panel: null,
		selected: [],
		suggestions: [],
		message: null,
		decisionNote: '',
		seatChoices: {},
		reviewPanel: null
	};
}

/**
 * Refuse with one sentence and no panel.
 *
 * `fail` sends the page back with that status and this result as `form`, which
 * the page shows in an error notice.
 */
function refuse(status: number, message: string) {
	return fail(status, { ...blankResult(), message } satisfies ApplicationsActionResult);
}

/** Read one text field from a submitted form, without surrounding spaces. */
function readText(formData: FormData, fieldName: string): string {
	return String(formData.get(fieldName) ?? '').trim();
}

/** Turn the empty text a form field holds into the `null` the database wants. */
function textOrNull(value: string): string | null {
	return value === '' ? null : value;
}

/**
 * The applications ticked on the page, each one named only once.
 *
 * `+page.svelte` draws the same rows twice: as a table from `md` up and as a
 * list of cards below it. A hidden element is submitted exactly as a visible
 * one is — the browser has no idea that CSS is showing only one of the two —
 * so every ticked application arrives twice. Without this, "6 selected" would
 * try to accept twelve people, and the second half would all fail because the
 * seats had just been taken by the first half.
 */
function readTickedIds(formData: FormData): string[] {
	const submitted = formData.getAll('ids').map((value) => String(value));

	// A `Set` keeps the first time each id was seen and drops the rest.
	return [...new Set(submitted)];
}

/**
 * The committees as the filter dropdown and the seat groups want them.
 *
 * `listCommitteesWithSeatCounts` brings every committee along with how many of
 * its seats are taken, which nothing on this page needs, so only the three
 * fields a dropdown shows are passed on. The apply page does exactly this.
 */
function toCommitteeChoices(rows: CommitteeWithSeats[]): CommitteeChoice[] {
	return rows.map((row) => ({
		id: row.committee.id,
		name: row.committee.name,
		abbreviation: row.committee.abbreviation
	}));
}

/**
 * A dropdown of free seats for each ticked applicant, in the same order as
 * `selected`.
 *
 * Each applicant's own committee preferences go in first, so the committees
 * they asked for are at the top of their dropdown and their first choice is at
 * the very top. A committee they named that no longer exists is ignored by
 * `suggestSeats`, and somebody who asked for no committee in particular is
 * offered every committee in the order the organisers put them in.
 */
function seatSuggestions(
	selected: OrganiserApplicationRow[],
	committees: CommitteeChoice[],
	freeSeats: AllocatableSeat[]
): SeatGroup[][] {
	return selected.map((row) => suggestSeats(row.committeePreferences, committees, freeSeats));
}

/** Every free seat's name, keyed by its id, for "{seat name} was chosen twice." */
function seatNamesById(freeSeats: AllocatableSeat[]): Map<string, string> {
	return new Map(freeSeats.map((seat) => [seat.id, seat.name]));
}

/** What the three actions that draw a panel read back for themselves. */
type Selection = {
	/** The ticked rows, in the order the table draws them. */
	selected: OrganiserApplicationRow[];
	committees: CommitteeChoice[];
	freeSeats: AllocatableSeat[];
};

/**
 * The ticked applications, the committees and the free seats, read again.
 *
 * A form action is its own request and is handed nothing `load` worked out, so
 * the same list is run again from the same address. Only rows on the page the
 * organiser had open can have been ticked, so looking the ids up in this page of
 * rows both finds them and puts them in the table's order rather than in
 * whatever order the browser happened to send them.
 */
async function readSelection(
	supabase: SupabaseClient,
	conferenceId: string,
	query: ApplicationListQuery,
	tickedIds: string[]
): Promise<Selection> {
	// None of these three needs another's answer, so they run side by side.
	const [page, committeeRows, freeSeats] = await Promise.all([
		listApplications(supabase, conferenceId, query),
		listCommitteesWithSeatCounts(supabase, conferenceId),
		listFreeSeats(supabase, conferenceId)
	]);

	const ticked = new Set(tickedIds);

	return {
		selected: page.rows.filter((row) => ticked.has(row.id)),
		committees: toCommitteeChoices(committeeRows),
		freeSeats
	};
}

/** The accept panel, drawn above the table with a seat dropdown per applicant. */
function acceptPanel(
	selection: Selection,
	message: string | null,
	seatChoices: Record<string, string>
) {
	return {
		...blankResult(),
		panel: 'accept',
		selected: selection.selected,
		suggestions: seatSuggestions(selection.selected, selection.committees, selection.freeSeats),
		message,
		seatChoices
	} satisfies ApplicationsActionResult;
}

/** The "not accepted" panel, which is a note box and a button. */
function rejectPanel(selection: Selection, message: string | null, decisionNote: string) {
	return {
		...blankResult(),
		panel: 'reject',
		selected: selection.selected,
		message,
		decisionNote
	} satisfies ApplicationsActionResult;
}

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
 * What the flash says when one acceptance failed part way through the list.
 *
 * Everything accepted before it stays accepted: `accept_application` is one
 * statement per application, so there is nothing half-written to undo, and
 * silently rolling the earlier ones back would take seats away from people the
 * organiser meant to accept. The count and the name are what let them carry on
 * from where it stopped.
 */
function stoppedFlash(acceptedCount: number, applicantName: string, thrown: unknown): string {
	return `${acceptedCount} accepted. Stopped at ${applicantName}: ${stopReason(thrown)}`;
}

/**
 * The clause that says why the loop stopped.
 *
 * Only the sentences `accept_application` raises are shown as they are. A
 * failure of any other kind is somebody else's text — a driver's, Postgres's,
 * PostgREST's — and the organiser gets one plain sentence instead while the
 * real thing goes to the log beside the call. See `ACCEPT_REFUSALS`.
 */
function stopReason(thrown: unknown): string {
	const databaseMessage = thrown instanceof Error ? thrown.message : String(thrown);

	if (databaseMessage.includes(SEAT_NOT_FREE_WORDS)) {
		return SEAT_JUST_TAKEN_CLAUSE;
	}

	if (ACCEPT_REFUSALS.includes(databaseMessage)) {
		return databaseMessage;
	}

	return SOMETHING_WENT_WRONG_CLAUSE;
}

/**
 * Everything the applications table draws, on top of what the layout above it
 * has already read.
 *
 * `parent()` is a promise for whatever the layout's own `load` returned: this
 * conference and the organisation running it. The layout let in anybody whose
 * permissions open some page of this conference, and handed those permissions
 * down; the first lines below answer a 404 unless they open this one.
 *
 * The whole list state — the tab, the search, the two filters, the sort and the
 * page — is read out of the address, so back, refresh and a shared link all
 * work. `load` runs again on every URL change, which is what redraws the table.
 *
 * Files under `$lib/server` only ever run on the server, so the queries below
 * cannot reach the browser.
 */
export const load: PageServerLoad = async ({ parent, url, locals }) => {
	const { conference, permissions } = await parent();
	// A 404 unless the reader's permissions open this page, by the table in
	// `$lib/manage-pages.ts`.
	requireManagePage(permissions, 'applications');

	const query = parseApplicationListQuery(url.searchParams);

	// None of these needs another's answer, so they all run side by side. The
	// board's columns are only read when the board is the view asked for (T135).
	const [page, counts, committeeRows, boardColumns] = await Promise.all([
		listApplications(locals.supabase, conference.id, query),
		countApplicationsByStatus(locals.supabase, conference.id),
		listCommitteesWithSeatCounts(locals.supabase, conference.id),
		query.view === 'board' ? listApplicationBoard(locals.supabase, conference.id, query) : []
	]);

	/*
		The review panel beside the table (from `xl` up) shows one of these rows:
		the one `?application=` names, or the first. It is read after the rows,
		because which application it shows depends on them. The board has no panel.
		The server cannot tell how wide the screen is, so a phone reads it too and
		CSS hides it.
	*/
	const reviewPanel =
		query.view === 'board'
			? null
			: await loadReviewPanel(
					locals.supabase,
					conference,
					query,
					page,
					readPanelApplicationId(url.searchParams),
					new Date(),
					// The panel keeps only the private details this conference's
					// permissions grant the reader, for the reason `loadReviewPanel` gives.
					privateDetailsAccess(permissions)
				);

	/*
		The conference's free seats are deliberately not among these. The bulk
		seat panel needs them, and that panel is only ever drawn as an action's
		answer, so `readSelection` below reads them then. A `load` that handed the
		browser a list of every free seat on every visit would be sending down data
		nothing on the page draws, which is something the next reader has to check
		before they can change it. The review panel reads only the seats its one
		application could be given, inside `loadReviewPanel`.
	*/
	return {
		query,
		rows: page.rows,
		/**
		 * How many pages of 25 there are, kept at 1 rather than 0 on an empty
		 * tab so the number always reads as a count of pages. Nothing on screen
		 * depends on the clamp: `Pagination` draws no pager at all below two
		 * pages, and an empty tab draws the empty state instead of the table.
		 */
		pageCount: Math.max(1, Math.ceil(page.total / APPLICATIONS_PAGE_SIZE)),
		counts,
		/** Every committee of the conference, for the filter dropdown and the seat groups. */
		committees: toCommitteeChoices(committeeRows),
		/** The board's columns, or none when the table is the view on screen. */
		boardColumns,
		/** The one application the review panel shows, or null on the board or an empty tab. */
		reviewPanel,
		/**
		 * Whether this reader may decide, which every tick box, button and form
		 * on the page needs. A reader without it sees the same page with none of
		 * them, and nothing said about what is missing. The actions ask again.
		 */
		canDecide: hasPermission(permissions, 'decide_applications')
	};
};

/**
 * The application a post from the review panel is about, read again.
 *
 * The panel names it in the address it posts to (`?application=…`), beside the
 * list's own tab, filters and page, so no hidden field is needed. Its status is
 * read now rather than trusted from the page, which may be a moment old.
 */
async function readPanelReview(
	event: RequestEvent,
	conferenceId: string
): Promise<ApplicationForReview> {
	const applicationId = readPanelApplicationId(event.url.searchParams);

	if (applicationId === null) {
		error(404, NO_SUCH_APPLICATION);
	}

	const review = await getApplicationForReview(event.locals.supabase, conferenceId, applicationId);

	if (review === null) {
		error(404, NO_SUCH_APPLICATION);
	}

	return review;
}

/** Everything a decision from the review panel starts from. */
type PanelDecisionPost = {
	conferenceId: string;
	organiserId: string;
	formData: FormData;
	query: ApplicationListQuery;
	review: ApplicationForReview;
	/** The rows of the page it was posted from, so the panel can move on to the next. */
	rowIds: string[];
	/** The undecided members of the applicant's team, decided along with them. */
	teammateIds: string[];
};

/** Reads a decision from the review panel: who, what was sent, and about which application. */
async function readPanelDecision(event: RequestEvent): Promise<PanelDecisionPost> {
	const { conference, user } = await requireDeciderFor(event);

	const query = parseApplicationListQuery(event.url.searchParams);
	const formData = await event.request.formData();

	// Neither read needs the other's answer, so both run at once.
	const [review, page] = await Promise.all([
		readPanelReview(event, conference.id),
		listApplications(event.locals.supabase, conference.id, query)
	]);

	// A team is decided as one (Trello pZNcdPqU): the panel's waitlist and
	// reject take the undecided teammates along, and its seat is refused.
	const teamMembers = await listTeamMembers(
		event.locals.supabase,
		conference.id,
		review.application.id
	);

	return {
		conferenceId: conference.id,
		organiserId: user.id,
		formData,
		query,
		review,
		rowIds: page.rows.map((row) => row.id),
		teammateIds: openTeammateIds(teamMembers, review.application.id)
	};
}

/**
 * Refuse a post from the review panel. The page comes back with the message
 * under the form that was pressed, and with what was chosen or typed in it.
 */
function refusePanel(refusal: ReviewPanelRefusal) {
	return fail(400, { ...blankResult(), reviewPanel: refusal } satisfies ApplicationsActionResult);
}

/**
 * Answers a decision from the review panel.
 *
 * A refusal keeps the seat that was chosen. A success sets the flash and opens
 * the list again with the panel on the next row, because the decided
 * application has left the tab. That is a redirect to the list itself, so
 * `createInPlaceForm` redraws the list and the panel without a page reload.
 */
function answerPanelDecision(
	event: RequestEvent,
	post: PanelDecisionPost,
	outcome: DecisionOutcome,
	seatId: string
) {
	const decidedId = post.review.application.id;

	if (!outcome.isDone) {
		return refusePanel({
			applicationId: decidedId,
			part: 'decision',
			message: outcome.message,
			seatId,
			internalNote: ''
		});
	}

	setFlash(event.cookies, { tone: 'success', message: outcome.flash });

	const nextId = applicationAfterDecision(post.rowIds, decidedId);
	const slug = event.params.slug;

	redirect(
		303,
		nextId === null
			? manageApplicationsUrl(slug, post.query)
			: applicationPanelUrl(slug, post.query, nextId)
	);
}

export const actions: Actions = {
	/**
	 * Open the seat-choosing panel for the ticked applications.
	 *
	 * Nothing is written here. The panel is drawn inline above the table, so the
	 * organiser can pick a seat for each person before pressing "Accept".
	 */
	chooseAccept: async (event) => {
		const { conference } = await requireDeciderFor(event);

		const query = parseApplicationListQuery(event.url.searchParams);
		const formData = await event.request.formData();
		const tickedIds = readTickedIds(formData);

		if (tickedIds.length === 0) {
			return refuse(400, NOTHING_TICKED_TO_ACCEPT);
		}

		const selection = await readSelection(event.locals.supabase, conference.id, query, tickedIds);

		if (selection.selected.length === 0) {
			return refuse(409, nothingLeftToDecide(tickedIds.length));
		}

		return acceptPanel(selection, null, {});
	},

	/** Open the note panel for the ticked applications, without writing anything. */
	chooseReject: async (event) => {
		const { conference } = await requireDeciderFor(event);

		const query = parseApplicationListQuery(event.url.searchParams);
		const formData = await event.request.formData();
		const tickedIds = readTickedIds(formData);

		if (tickedIds.length === 0) {
			return refuse(400, NOTHING_TICKED_TO_REJECT);
		}

		const selection = await readSelection(event.locals.supabase, conference.id, query, tickedIds);

		if (selection.selected.length === 0) {
			return refuse(409, nothingLeftToDecide(tickedIds.length));
		}

		return rejectPanel(selection, null, '');
	},

	/** Move every ticked application that is still under review to the waitlist. */
	bulkWaitlist: async (event) => {
		const { user, conference } = await requireDeciderFor(event);

		const query = parseApplicationListQuery(event.url.searchParams);
		const formData = await event.request.formData();
		const tickedIds = readTickedIds(formData);

		if (tickedIds.length === 0) {
			return refuse(400, NOTHING_TICKED_TO_WAITLIST);
		}

		try {
			// No note: "Waitlist" is one button with no box beside it, and passing
			// `null` leaves any note somebody already wrote exactly as it was. The
			// ids were ticked on this conference's page, so only this conference's
			// rows may move, whatever ids the post turns out to carry.
			const outcome = await waitlistApplications(
				event.locals.supabase,
				conference.id,
				tickedIds,
				user.id,
				null
			);

			// A redirecting action cannot return anything, so the message travels in
			// a one-shot cookie that the root layout reads and throws away. The
			// address it goes back to is the one the organiser was on, so the tab,
			// the filters and the page all survive the decision.
			setFlash(event.cookies, {
				tone: 'success',
				message: bulkDecisionFlash(outcome, 'waitlisted')
			});
		} catch (thrown) {
			console.error('Could not waitlist applications', thrown);

			return refuse(500, NOTHING_CHANGED_MESSAGE);
		}

		redirect(303, manageApplicationsUrl(event.params.slug, query));
	},

	/** Mark every ticked application as not accepted, with one note for all of them. */
	bulkReject: async (event) => {
		const { user, conference } = await requireDeciderFor(event);

		const query = parseApplicationListQuery(event.url.searchParams);
		const formData = await event.request.formData();
		const tickedIds = readTickedIds(formData);
		const decisionNote = readText(formData, 'decisionNote');

		if (tickedIds.length === 0) {
			return refuse(400, NOTHING_TICKED_TO_REJECT);
		}

		// The box has a `maxlength` of its own, which a browser enforces while
		// somebody types. This is the same rule asked again of what actually
		// arrived, because a post can be put together by hand. The panel is drawn
		// again with the note still in it, so nobody types it twice.
		if (decisionNote.length > DECISION_NOTE_MAX_LENGTH) {
			const selection = await readSelection(event.locals.supabase, conference.id, query, tickedIds);

			return fail(
				400,
				rejectPanel(
					selection,
					`A note can be at most ${DECISION_NOTE_MAX_LENGTH} characters.`,
					decisionNote
				)
			);
		}

		try {
			const outcome = await rejectApplications(
				event.locals.supabase,
				conference.id,
				tickedIds,
				user.id,
				textOrNull(decisionNote)
			);

			setFlash(event.cookies, {
				tone: 'success',
				message: bulkDecisionFlash(outcome, 'marked as not accepted')
			});
		} catch (thrown) {
			console.error('Could not reject applications', thrown);

			return refuse(500, NOTHING_CHANGED_MESSAGE);
		}

		redirect(303, manageApplicationsUrl(event.params.slug, query));
	},

	/**
	 * Accept every ticked application into the seat chosen for it.
	 *
	 * `accept_application` takes one application and one seat, so this is a loop
	 * and not a single statement, and the loop runs in the table's order so that
	 * "Stopped at ..." names the row the organiser can see.
	 */
	bulkAccept: async (event) => {
		const { conference } = await requireDeciderFor(event);

		const query = parseApplicationListQuery(event.url.searchParams);
		const formData = await event.request.formData();
		const tickedIds = readTickedIds(formData);

		if (tickedIds.length === 0) {
			return refuse(400, NOTHING_TICKED_TO_ACCEPT);
		}

		const selection = await readSelection(event.locals.supabase, conference.id, query, tickedIds);

		const applicationIds = selection.selected.map((row) => row.id);
		const seatChoices = readBulkSeatChoices(formData, applicationIds);
		const problem = validateBulkSeatChoices(
			applicationIds,
			seatChoices,
			seatNamesById(selection.freeSeats)
		);

		if (problem !== null) {
			return fail(400, acceptPanel(selection, problem, seatChoices));
		}

		let acceptedCount = 0;

		for (const row of selection.selected) {
			try {
				await acceptApplication(event.locals.supabase, row.id, seatChoices[row.id]);
			} catch (thrown) {
				// The first refusal stops the loop. What has already been accepted
				// stays accepted, and the flash says how far it got and why it
				// stopped, so the organiser can carry on from that row.
				//
				// Every stop is logged, the way the other two bulk actions log
				// theirs, because the ones that are not the database refusing on
				// purpose never reach the screen at all. See `stopReason`.
				console.error('A bulk accept stopped', thrown);

				setFlash(event.cookies, {
					tone: 'warning',
					message: stoppedFlash(acceptedCount, row.applicantName, thrown)
				});
				redirect(303, manageApplicationsUrl(event.params.slug, query));
			}

			acceptedCount += 1;
		}

		/*
			Worded by the same helper the other two bulk decisions use, so that
			"6 applications accepted." and "6 applications waitlisted." cannot drift
			apart, and so that one on its own reads "1 application accepted." rather
			than "1 applications accepted.".

			The loop itself never skips anybody: it either accepted every row it was
			handed or stopped at one of them. A ticked row can still fall away before
			the loop, when `readSelection` reads the tab again and another organiser
			has decided that application in the meantime. Those are counted here, so
			six ticked and one decided elsewhere says "5 accepted, 1 skipped because
			it was already decided." rather than "5 applications accepted." and never
			a word about the sixth.
		*/
		const skippedCount = tickedIds.length - selection.selected.length;

		setFlash(event.cookies, {
			tone: 'success',
			message: bulkDecisionFlash({ changedCount: acceptedCount, skippedCount }, 'accepted')
		});
		redirect(303, manageApplicationsUrl(event.params.slug, query));
	},

	/*
		The four actions below answer the review panel beside the table. Each
		decides one application, through the same functions as the review page
		(`$lib/server/application-decisions.ts`), and stays on the list.
	*/

	/** Give the panel's applicant the chosen seat, which accepts them and writes their invoice. */
	reviewAccept: async (event) => {
		const post = await readPanelDecision(event);
		const seatId = String(post.formData.get('seatId') ?? '');

		if (post.teammateIds.length > 0) {
			const outcome = { isDone: false, message: ACCEPT_TEAM_ON_REVIEW_PAGE_REFUSAL } as const;

			return answerPanelDecision(event, post, outcome, seatId);
		}

		const outcome = await acceptIntoSeat(
			event.locals.supabase,
			post.conferenceId,
			post.review,
			seatId
		);

		return answerPanelDecision(event, post, outcome, seatId);
	},

	/** Put the panel's application on the waiting list. */
	reviewWaitlist: async (event) => {
		const post = await readPanelDecision(event);
		const decisionNote = readDecisionNote(post.formData);

		const outcome = await waitlistOne(
			event.locals.supabase,
			post.review,
			post.organiserId,
			decisionNote,
			post.teammateIds
		);

		return answerPanelDecision(event, post, outcome, '');
	},

	/**
	 * Mark the panel's application "not accepted" and tell the applicant, with
	 * the note typed in the dialog. Like the review page's own, it ignores the
	 * `confirm=1` that `ConfirmButton`'s answer sends: the question was asked.
	 */
	reviewReject: async (event) => {
		const post = await readPanelDecision(event);
		const decisionNote = readDecisionNote(post.formData);

		const outcome = await rejectOne(
			event.locals.supabase,
			post.review,
			post.organiserId,
			decisionNote,
			post.teammateIds
		);

		return answerPanelDecision(event, post, outcome, '');
	},

	/** Save the organisers' note from the panel, and keep the panel on the same application. */
	reviewSaveNote: async (event) => {
		const { conference } = await requireDeciderFor(event);

		const formData = await event.request.formData();
		const internalNote = readInternalNote(formData);
		const review = await readPanelReview(event, conference.id);

		const outcome = await saveInternalNote(event.locals.supabase, review, internalNote);

		if (!outcome.isDone) {
			return refusePanel({
				applicationId: review.application.id,
				part: 'note',
				message: outcome.message,
				seatId: '',
				internalNote
			});
		}

		setFlash(event.cookies, { tone: 'success', message: outcome.flash });

		const query = parseApplicationListQuery(event.url.searchParams);

		redirect(303, applicationPanelUrl(event.params.slug, query, review.application.id));
	}
};
