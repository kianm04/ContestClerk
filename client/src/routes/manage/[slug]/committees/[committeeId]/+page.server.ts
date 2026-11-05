import { error, fail, redirect } from '@sveltejs/kit';
import {
	cleanTopics,
	committeeSlugFromName,
	hasCommitteeErrors,
	readCommitteeForm,
	validateCommitteeForm,
	withExtraTopic,
	withoutTopicAt,
	type CommitteeFormValues
} from '$lib/committee-details';
import {
	summariseManagedSeats,
	type ManagedCommitteeRow,
	type ManagedSeat,
	type SeatKind
} from '$lib/committees';
import type { Conference } from '$lib/conferences';
import { isCountryCode } from '$lib/countries';
import { readDroppedPlace } from '$lib/drag-order';
import { isGuideAudience, pdfFileProblem } from '$lib/documents';
import {
	PASTED_SEAT_LIMIT,
	countryCodeForName,
	isSeatListName,
	parseSeatNames,
	standardSeats,
	type StandardSeat
} from '$lib/seat-lists';
import { validateEmail } from '$lib/auth';
import { STAFF_TITLE_MAX_LENGTH } from '$lib/team';
import { mayAssignChair, mayChairThemselves, mayRemoveChair } from '$lib/team-access';
import { inviteUrl, manageCommitteeUrl, manageCommitteesUrl } from '$lib/urls';
import {
	appliedProcedureMessage,
	copiedProcedureMessage,
	isProcedureName,
	readProcedureForm,
	toProcedureFormValues,
	validateProcedureForm,
	type ProcedureCopyTarget,
	type ProcedureFormErrors,
	type ProcedureFormValues
} from '$lib/committee-procedure';
import type { Flash } from '$lib/flash';
import type { MyPermissions } from '$lib/permissions';
import {
	committeeEditorAccess,
	editableCommittees,
	mayUseCommitteeEditor,
	withAgendaOnly,
	type CommitteeEditorAccess,
	type CommitteeEditorNeed
} from '$lib/committee-access';
import {
	requireManagePage,
	requirePermissionSomewhere,
	requireUser,
	type SignedInUser
} from '$lib/server/access';
import {
	deleteCommittee,
	getCommitteeForManage,
	listCommitteeSlugs,
	updateCommittee,
	updateCommitteeAgenda
} from '$lib/server/manage-committees';
import {
	applyCommitteeProcedure,
	copyCommitteeProcedure,
	getCommitteeProcedure,
	listOtherCommittees,
	saveCommitteeProcedure
} from '$lib/server/committee-procedure';
import {
	getBackgroundGuide,
	removeBackgroundGuide,
	uploadBackgroundGuide
} from '$lib/server/documents';
import { setFlash } from '$lib/server/flash';
import {
	committeeChairInviteRefusal,
	createStaffInvite,
	findPendingInvite,
	withdrawCommitteeChairInvite
} from '$lib/server/invites';
import { placeOrderedRow } from '$lib/server/ordered-rows';
import {
	addSeats,
	deleteSeat,
	getSeat,
	moveSeat,
	setSeatAvailability,
	type AddSeatsResult,
	type NewSeat
} from '$lib/server/seats';
import {
	addCommitteeChair,
	findChairRole,
	listChairStaff,
	listCommitteeChairs,
	listPendingCommitteeChairInvites,
	readTeamRanks,
	removeCommitteeChair
} from '$lib/server/team';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/**
 * What every action on this page answers with, whether it worked or not.
 *
 * One shape for all of them, so `+page.svelte` has a single thing to read
 * rather than a different answer per button. `values` is `null` whenever
 * nothing was typed into the committee form, and the page then falls back to
 * what `load` read.
 */
type CommitteeEditResult = {
	values: CommitteeFormValues | null;
	errors: ReturnType<typeof validateCommitteeForm>;
	/** A problem with the whole page rather than with one field, shown in a `Notice`. */
	message: string | null;
	/**
	 * What the Chairs panel's "Invite a chair" form answers (T175), and missing
	 * from every other action's answer. `error` is what is wrong with the
	 * address, and `link` the new invitation's address once one was written.
	 */
	chairInvite?: ChairInviteResult;
	/**
	 * What the "Resolutions" settings form answers when its fields are refused:
	 * what was typed and one message per field. Missing from every other answer,
	 * and then the form shows the settings as saved.
	 */
	procedure?: { values: ProcedureFormValues; errors: ProcedureFormErrors };
	/** A refusal the root layout shows as a toast, for the "Resolutions" forms and the chairs panel's buttons. */
	flash?: Flash;
};

/** The answer of `inviteChair`: the address typed, and either a refusal or a link. */
type ChairInviteResult = {
	email: string;
	error: string | null;
	link: string | null;
};

/** What `inviteChair` says when the invitation could not be written, as the team page does. */
const CHAIR_INVITE_FAILED_MESSAGE = 'The invitation could not be created. Please try again.';

/**
 * What `addChair` says about somebody the reader does not rank above, whom
 * the `committee_chairs` insert policy refuses (security review L5).
 */
const CHAIR_ABOVE_YOU_MESSAGE = 'You can only make somebody below your own role a chair.';

/** What "Remove" says about a chair the reader does not rank above. */
const REMOVE_CHAIR_ABOVE_YOU_MESSAGE =
	'You can only take somebody below your own role off a committee.';

/**
 * What "Chair it yourself" says to anybody but an administrator: nobody ranks
 * below themselves, so the same policy refuses everybody else.
 */
const CHAIR_YOURSELF_MESSAGE =
	'Only an administrator can chair a committee themselves. Ask one to add you.';

/**
 * What both seat delete refusals say: the one this page gives before asking, and
 * the one the database gives if the seat was taken in between.
 */
const SEAT_IN_USE_MESSAGE =
	'You cannot delete a seat that is filled or reserved. Free it on the allocation page first.';

/**
 * Is this one of the four `seat_kind` values? Anybody can post anything to a
 * form action, so the word it sends is checked before it is used. It is written
 * out rather than looked up in a list so that TypeScript can narrow the text to
 * a `SeatKind`, exactly as `isSeatListName` in `$lib/seat-lists.ts` does.
 */
function isSeatKind(text: string): text is SeatKind {
	return text === 'country' || text === 'character' || text === 'observer' || text === 'other';
}

/** Read one text field from a submitted form, without surrounding spaces. */
function readText(formData: FormData, fieldName: string): string {
	return String(formData.get(fieldName) ?? '').trim();
}

/** Turn a column that may be null into the empty text a form field holds instead. */
function textOrEmpty(value: string | null): string {
	return value ?? '';
}

/**
 * The background guide chosen in the file box, or `null` when none was.
 *
 * A file box nobody chose a file in still posts a `File`: one with no name, no
 * type and a size of 0. A file of no size is therefore what "nothing was
 * chosen" looks like on the server, and the caller answers it with its own
 * sentence rather than with "Please upload a PDF." Anything that is not a
 * `File` at all can only come from a request somebody put together by hand.
 * `readChosenImage` in the details editor is the same helper for a picture.
 */
function readChosenGuide(formData: FormData): File | null {
	const chosen = formData.get('guide');

	if (!(chosen instanceof File) || chosen.size === 0) {
		return null;
	}

	return chosen;
}

/**
 * The topic rows the editor draws: the committee's own topics, or one empty row
 * for a committee that has none, so there is always a box to type in.
 * `EMPTY_COMMITTEE_FORM` starts the "new" page with one empty row for the same
 * reason.
 */
function toTopicRows(topics: string[]): string[] {
	if (topics.length === 0) {
		return [''];
	}

	return topics;
}

/**
 * The saved committee as the form holds it: every field is text, because text
 * is all an `<input>` can carry. `textOrEmpty` and `String(...)` here do the
 * same job as `textOrEmpty` and `numberOrEmpty` in the details editor.
 */
function toFormValues(committee: ManagedCommitteeRow): CommitteeFormValues {
	return {
		name: committee.name,
		abbreviation: textOrEmpty(committee.abbreviation),
		slug: committee.slug,
		description: textOrEmpty(committee.description),
		level: committee.level,
		room: textOrEmpty(committee.room),
		defaultSpeakingTimeSeconds: String(committee.defaultSpeakingTimeSeconds),
		topics: toTopicRows(committee.topics)
	};
}

/**
 * "12 seats added, 3 already existed.", with the singular where one is needed.
 *
 * Both halves are always named, the zeroes included: "0 already existed" is how
 * an organiser learns that the button they pressed a second time did nothing,
 * which a sentence that quietly left the half out would not tell them.
 */
function addedSeatsMessage(result: AddSeatsResult): string {
	const added = result.addedCount === 1 ? '1 seat added' : `${result.addedCount} seats added`;
	const existing =
		result.existingCount === 1 ? '1 already existed' : `${result.existingCount} already existed`;

	return `${added}, ${existing}.`;
}

/** The conference this page belongs to, and the committee it is editing. */
type CommitteeContext = {
	/**
	 * The signed-in organiser. `uploadGuide` writes their id into the document's
	 * `uploaded_by`, which the insert policy insists on.
	 */
	user: SignedInUser;
	conference: Conference;
	committee: ManagedCommitteeRow;
	seats: ManagedSeat[];
	/** What the reader may do here, which decides what `save` writes. */
	access: CommitteeEditorAccess;
	/** The reader's permissions, which decide which committees "Copy settings" may reach. */
	permissions: MyPermissions;
};

/**
 * The two checks every action on this page starts with.
 *
 * The permission is asked again rather than trusted from whenever the page
 * was last drawn, because a form action is its own request and nothing `load`
 * worked out reaches it. `need` names what the action changes: a chair who
 * edits this committee may change its agenda and guide, a conference-wide
 * editor everything, and the chairs belong to `manage_team`.
 *
 * The committee is read again for the same reason. `getCommitteeForManage` asks
 * for it inside this conference, so a `committeeId` belonging to somebody
 * else's conference simply is not there, and that is a 404 here exactly as it
 * is in `load`. `error` throws, so anything past this line has a real committee
 * of the reader's own conference.
 */
async function requireCommittee(
	event: RequestEvent,
	need: CommitteeEditorNeed
): Promise<CommitteeContext> {
	const { user, conference, permissions } = await requirePermissionSomewhere(
		event.locals,
		event.url,
		event.params.slug,
		'manage_committees'
	);

	// `need` is what the action changes: see `$lib/committee-access.ts`.
	if (!mayUseCommitteeEditor(permissions, event.params.committeeId, need)) {
		error(404, 'This committee does not exist.');
	}

	const editor = await getCommitteeForManage(
		event.locals.supabase,
		conference.id,
		event.params.committeeId
	);

	if (!editor) {
		error(404, 'This committee does not exist.');
	}

	return {
		user,
		conference,
		committee: editor.committee,
		seats: editor.seats,
		access: committeeEditorAccess(permissions, event.params.committeeId),
		permissions
	};
}

/**
 * The committee form as posted. Somebody who edits only this committee posts
 * its description and topics alone, and the rest is the committee as saved.
 */
async function readPostedCommittee(
	event: RequestEvent,
	context: CommitteeContext
): Promise<CommitteeFormValues> {
	const posted = readCommitteeForm(await event.request.formData());

	return context.access.isWholeEditor
		? posted
		: withAgendaOnly(toFormValues(context.committee), posted);
}

/** Back to this same editor, which is where every action on it sends the reader. */
function backToEditor(event: RequestEvent): never {
	redirect(303, manageCommitteeUrl(event.params.slug, event.params.committeeId));
}

/** Refuse with a message about the whole page, leaving the form as the page last drew it. */
function refuse(status: number, message: string) {
	return fail(status, { values: null, errors: {}, message } satisfies CommitteeEditResult);
}

/** Refuse "Invite a chair", with the sentence under its email box and what was typed kept. */
function refuseChairInvite(status: number, email: string, message: string) {
	return fail(status, {
		values: null,
		errors: {},
		message: null,
		chairInvite: { email, error: message, link: null }
	} satisfies CommitteeEditResult);
}

/**
 * Refuse a press of the chairs panel's "Remove" or "Withdraw" with a toast.
 * Those two are instant forms (`$lib/instant-form.svelte.ts`): the toast
 * reads "The chair was not removed." followed by the flash's own words, or by
 * "Check the form" when the answer has none. The toast shows without
 * JavaScript too, so the page's notice is left empty and the reason appears
 * once either way.
 */
function refuseChairPress(status: number, message: string) {
	return fail(status, {
		values: null,
		errors: {},
		message: null,
		flash: { tone: 'error', message }
	} satisfies CommitteeEditResult);
}

/**
 * Refuse one of the "Resolutions" forms with a toast, leaving the rest of the
 * page as it was. `procedure` keeps what was typed into the settings form.
 */
function refuseProcedure(message: string, procedure?: CommitteeEditResult['procedure']) {
	return fail(400, {
		values: null,
		errors: {},
		message: null,
		procedure,
		flash: { tone: 'error', message }
	} satisfies CommitteeEditResult);
}

/**
 * The committees "Copy settings" offers: the conference's others that the
 * reader may change too, since `copy_committee_procedure` refuses the whole
 * copy if any one of them is not theirs.
 */
async function readCopyTargets(
	event: { locals: App.Locals },
	conferenceId: string,
	committeeId: string,
	permissions: MyPermissions
): Promise<ProcedureCopyTarget[]> {
	const others = await listOtherCommittees(event.locals.supabase, conferenceId, committeeId);

	return editableCommittees(permissions, others);
}

/**
 * The full address of an invitation, to copy into an email or a chat. The
 * page's own address supplies the start, as `inviteLink` on the team page does.
 */
function chairInviteLink(origin: string, token: string): string {
	return `${origin}${inviteUrl(token)}`;
}

/** Why an address may not be invited to chair this committee, as the organiser reads it. */
const CHAIR_INVITE_REFUSALS = {
	already_chair: 'That person already chairs this committee.',
	organiser: 'That person organises this conference. They can press "Chair it yourself" instead.'
};

/**
 * Everything the committee editor draws, on top of what the layout above it has
 * already read.
 *
 * `parent()` is a promise for whatever the layout's own `load` returned: this
 * conference and the organisation running it. The layout let in anybody whose
 * permissions open some page of this conference, and handed those permissions
 * down; the first lines below answer a 404 unless they open this one.
 *
 * Files under `$lib/server` only ever run on the server, so the query below
 * cannot reach the browser.
 */
export const load: PageServerLoad = async ({ parent, params, locals, url }) => {
	const { conference, permissions } = await parent();
	// A 404 unless the reader's permissions open this page, by the table in
	// `$lib/manage-pages.ts`.
	requireManagePage(permissions, 'committees');

	// The committees page lists every committee to a conference-wide editor and
	// a chair's own to a chair, and this editor opens for the same.
	if (!mayUseCommitteeEditor(permissions, params.committeeId, 'agenda')) {
		error(404, 'This committee does not exist.');
	}

	const access = committeeEditorAccess(permissions, params.committeeId);
	// The reader, whom "Chair it yourself" adds. The layout has already let only
	// a signed-in organiser in, so this never redirects here.
	const reader = await requireUser(locals, url);

	const editor = await getCommitteeForManage(locals.supabase, conference.id, params.committeeId);

	// `05-pages/organiser/committee-edit.md`: a `committeeId` from another
	// conference is a 404. It is not there to be read, so there is nothing to
	// tell this organiser about it.
	if (!editor) {
		error(404, 'This committee does not exist.');
	}

	/*
		The reads the two panels need, started together because none of them
		needs another's answer: who chairs this committee, who on the conference's
		staff could be added to it, the chair invitations nobody has accepted yet
		(T175), and the background guide with the one-minute signed address the
		Download link uses.

		They are asked beside `getCommitteeForManage` rather than inside it, so
		that each module stays on one topic — the chairs live in
		`$lib/server/team.ts` and the guide in `$lib/server/documents.ts` — and so
		that the ten actions below, which all re-read the committee, do not pay for
		three queries none of them looks at.
	*/
	// The staff and the invitations are the Chairs panel's, drawn for `manage_team` alone.
	// The staff are everybody with a per-committee role, before the rank rule
	// below leaves out the ones the reader may not make a chair.
	// The "Resolutions" section's settings and the committees it may copy them to
	// are read beside them, for the same reason.
	const [
		chairs,
		chairStaff,
		teamRanks,
		pendingChairInvites,
		backgroundGuide,
		procedure,
		procedureCopyTargets
	] = await Promise.all([
		listCommitteeChairs(locals.supabase, params.committeeId),
		access.mayManageChairs ? listChairStaff(locals.supabase, conference.id) : [],
		access.mayManageChairs ? readTeamRanks(locals.supabase, conference.id) : new Map(),
		access.mayManageChairs
			? listPendingCommitteeChairInvites(locals.supabase, params.committeeId)
			: [],
		getBackgroundGuide(locals.supabase, params.committeeId),
		getCommitteeProcedure(locals.supabase, params.committeeId),
		readCopyTargets({ locals }, conference.id, params.committeeId, permissions)
	]);

	// `getCommitteeForManage` has just read this committee, so its settings are
	// there unless it was deleted in between.
	if (!procedure) {
		error(404, 'This committee does not exist.');
	}

	return {
		values: toFormValues(editor.committee),
		committee: editor.committee,
		seats: editor.seats,
		seatCounts: summariseManagedSeats(editor.seats),
		chairs,
		/** The chair staff the reader may make a chair, the people the picker offers. */
		chairStaff: chairStaff.filter((member) => mayAssignChair(permissions, member)),
		/** The chairs whose row shows "Remove": those the reader ranks above, or all for an administrator. */
		removableChairIds: chairs
			.filter((chair) => mayRemoveChair(permissions, teamRanks.get(chair.userId) ?? null))
			.map((chair) => chair.userId),
		pendingChairInvites,
		/** The reader's own id, so the panel can tell whether they chair this committee. */
		readerUserId: reader.id,
		/** Whether "Chair it yourself" is offered at all: to an administrator alone. */
		mayChairYourself: mayChairThemselves(permissions),
		/** The site's own address, which "Copy link" puts in front of an invitation's path. */
		origin: url.origin,
		backgroundGuide,
		/** The "Resolutions" settings as the form holds them. */
		procedureValues: toProcedureFormValues(procedure),
		/** The other committees the reader may copy those settings to; empty hides "Copy settings". */
		procedureCopyTargets,
		access
	};
};

export const actions: Actions = {
	/** Save the committee's own fields: its name, its link, its level and its topics. */
	save: async (event) => {
		const context = await requireCommittee(event, 'agenda');
		const { conference, committee } = context;
		const values = await readPostedCommittee(event, context);

		// An organiser who never touched the link box gets one made from the name,
		// which is what the "new" page does too, so nobody has to invent a link.
		if (values.slug === '') {
			values.slug = committeeSlugFromName(values.name);
		}

		// This committee's own slug is left out of the list, or saving the
		// committee unchanged would be refused as a clash with itself.
		const takenSlugs = await listCommitteeSlugs(event.locals.supabase, conference.id, committee.id);

		const errors = validateCommitteeForm(values, {
			isConferencePublished: conference.status === 'published',
			takenSlugs
		});

		if (hasCommitteeErrors(errors)) {
			/*
				400, because what arrived is wrong and only the person who sent it can
				put it right. `fail` sends the page back with that status and this
				result as `form`, so every field keeps what was typed and shows its
				own message at once.
			*/
			return fail(400, { values, errors, message: null } satisfies CommitteeEditResult);
		}

		// The empty topic rows go before the topics are saved, and not before they
		// are checked: the form keeps them so it can draw itself again.
		const savedValues = { ...values, topics: cleanTopics(values.topics) };

		if (context.access.isWholeEditor) {
			await updateCommittee(event.locals.supabase, committee.id, savedValues);
		} else {
			await updateCommitteeAgenda(event.locals.supabase, committee.id, savedValues);
		}

		// A redirecting action cannot return anything, so the message travels in a
		// one-shot cookie that the root layout reads and throws away.
		setFlash(event.cookies, { tone: 'success', message: 'Committee saved.' });
		backToEditor(event);
	},

	/**
	 * Draw the form again with one more empty topic row.
	 *
	 * It saves nothing and does not redirect: the whole point is that the page
	 * comes back with what was typed plus one row, which is how `TopicsEditor`
	 * grows without any JavaScript at all.
	 */
	addTopic: async (event) => {
		const context = await requireCommittee(event, 'agenda');
		const values = await readPostedCommittee(event, context);
		const topics = withExtraTopic(values.topics);

		return {
			values: { ...values, topics },
			errors: {},
			message: null
		} satisfies CommitteeEditResult;
	},

	/** The same, with one row taken away. It saves nothing either. */
	removeTopic: async (event) => {
		const context = await requireCommittee(event, 'agenda');
		const values = await readPostedCommittee(event, context);
		const index = readTopicIndex(event.url);

		// Nothing said which row, so nothing is removed and the form comes back
		// exactly as it was sent.
		if (index === null) {
			return { values, errors: {}, message: null } satisfies CommitteeEditResult;
		}

		const topics = withoutTopicAt(values.topics, index);

		return {
			values: { ...values, topics },
			errors: {},
			message: null
		} satisfies CommitteeEditResult;
	},

	/**
	 * Add a whole list of seats at once: one of the three ready-made lists, or
	 * the names the organiser pasted in.
	 */
	addSeats: async (event) => {
		const { committee } = await requireCommittee(event, 'whole');

		const formData = await event.request.formData();
		const source = readText(formData, 'source');

		let seatsToAdd: StandardSeat[];

		if (isSeatListName(source)) {
			seatsToAdd = standardSeats(source);
		} else if (source === 'list') {
			const names = parseSeatNames(String(formData.get('names') ?? ''));

			if (names.length === 0) {
				return refuse(400, 'Please enter at least one seat name.');
			}

			// `parseSeatNames` does not cut the list short, so that nobody is told
			// seats were added that were not. Refusing the whole paste is what
			// `05-pages/organiser/committee-edit.md` asks for.
			if (names.length > PASTED_SEAT_LIMIT) {
				return refuse(400, `Please add at most ${PASTED_SEAT_LIMIT} seats at a time.`);
			}

			// A name we recognise as a country gets that country's code, and so its
			// flag; anything else becomes a seat without one.
			seatsToAdd = names.map((name) => ({ name, countryCode: countryCodeForName(name) }));
		} else {
			return refuse(400, 'That is not a seat list this page has.');
		}

		const result = await addSeats(event.locals.supabase, committee.id, seatsToAdd);

		setFlash(event.cookies, { tone: 'success', message: addedSeatsMessage(result) });
		backToEditor(event);
	},

	/** Add one seat the organiser typed out: a character, an observer, or a country we do not list. */
	addSeat: async (event) => {
		const { committee } = await requireCommittee(event, 'whole');

		const formData = await event.request.formData();
		// `seatName` rather than `name`: the committee form on this same page
		// already has a `name`, and `AddOneSeatForm.svelte` says what goes wrong
		// when two boxes on one page share it.
		const name = readText(formData, 'seatName');
		const kind = readText(formData, 'kind');
		const countryCode = readText(formData, 'countryCode');

		if (name === '') {
			return refuse(400, 'Please enter a seat name.');
		}

		if (!isSeatKind(kind)) {
			return refuse(400, 'Please choose what kind of seat this is.');
		}

		/*
			The country is optional, and a code the country list does not know is
			dropped rather than refused: the seat is still a seat without a flag.

			The kind is passed on rather than left out, which is the difference
			between this form and the ready-made lists: those say nothing about the
			kind and let the country code decide it, while here the organiser has
			said in so many words that the seat is an observer or a character.
		*/
		const seat: NewSeat = {
			name,
			countryCode: isCountryCode(countryCode) ? countryCode : null,
			kind
		};

		const result = await addSeats(event.locals.supabase, committee.id, [seat]);

		// One seat either lands or was already there, so nothing having been added
		// can only mean the committee has that name already.
		if (result.addedCount === 0) {
			return refuse(400, `This committee already has a seat called ${name}.`);
		}

		setFlash(event.cookies, { tone: 'success', message: 'Seat added.' });
		backToEditor(event);
	},

	/**
	 * Move one seat up or down the list.
	 *
	 * No flash: the seat visibly moves, so saying so as well would only be noise.
	 * The same goes for hiding, showing and deleting a seat below.
	 */
	moveSeat: async (event) => {
		const { committee } = await requireCommittee(event, 'whole');

		const formData = await event.request.formData();
		const seatId = readText(formData, 'seatId');

		/*
			Which way travels in the address rather than in a field. SvelteKit lets
			a form action carry a query string of its own, so the button posts to
			`?/moveSeat&direction=up`. It has to: the button sits inside the row's
			own form beside three others, and each of them needs a different answer
			from the same set of fields. `?/removeImage&kind=banner` in the details
			editor is the same trick.
		*/
		const direction = event.url.searchParams.get('direction');

		if (direction !== 'up' && direction !== 'down') {
			return refuse(400, 'That is not a direction a seat can move.');
		}

		await moveSeat(event.locals.supabase, committee.id, seatId, direction);

		backToEditor(event);
	},

	/**
	 * Put one seat at the place it was dragged to (T132). The seats list's
	 * hidden drop form posts the seat's id and its new `place`, counting from 1.
	 * Dragging needs JavaScript, so the arrows of `moveSeat` stay the way
	 * without it.
	 */
	moveSeatTo: async (event) => {
		const { committee } = await requireCommittee(event, 'whole');

		const formData = await event.request.formData();
		const seatId = readText(formData, 'seatId');
		const toIndex = readDroppedPlace(formData.get('place'));

		if (seatId === '' || toIndex === null) {
			return refuse(400, 'That request did not say which seat to move, or where.');
		}

		const isPlaced = await placeOrderedRow(
			event.locals.supabase,
			{ table: 'seats', ownerColumn: 'committee_id', ownerId: committee.id },
			seatId,
			toIndex
		);

		if (!isPlaced) {
			return refuse(404, 'That seat is no longer in this committee.');
		}

		backToEditor(event);
	},

	/** Take a seat off the list delegates can be put in, without deleting it. */
	hideSeat: async (event) => {
		const { committee } = await requireCommittee(event, 'whole');

		const formData = await event.request.formData();
		const seatId = readText(formData, 'seatId');
		const seat = await getSeat(event.locals.supabase, committee.id, seatId);

		if (!seat) {
			return refuse(404, 'That seat is not in this committee.');
		}

		// Hiding a seat somebody holds, or one a delegation has been promised,
		// would take it away from them without saying so. The two flags are asked
		// rather than the two names, because a delegate whose profile could not be
		// read is still sitting in the seat.
		if (seat.isFilled || seat.isReserved) {
			return refuse(400, 'Free the seat first.');
		}

		await setSeatAvailability(event.locals.supabase, seat.id, false);

		backToEditor(event);
	},

	/** Put a hidden seat back on the list. */
	showSeat: async (event) => {
		const { committee } = await requireCommittee(event, 'whole');

		const formData = await event.request.formData();
		const seatId = readText(formData, 'seatId');

		// `getSeat` asks inside this committee, so it is what keeps a seat id typed
		// into somebody's address bar from reaching a seat in another one. There is
		// nothing else to refuse: an empty seat is what was hidden, and putting it
		// back takes it from nobody.
		const seat = await getSeat(event.locals.supabase, committee.id, seatId);

		if (!seat) {
			return refuse(404, 'That seat is not in this committee.');
		}

		await setSeatAvailability(event.locals.supabase, seat.id, true);

		backToEditor(event);
	},

	/** Delete one seat for good. */
	deleteSeat: async (event) => {
		const { committee } = await requireCommittee(event, 'whole');

		const formData = await event.request.formData();
		const seatId = readText(formData, 'seatId');
		const seat = await getSeat(event.locals.supabase, committee.id, seatId);

		if (!seat) {
			return refuse(404, 'That seat is not in this committee.');
		}

		/*
			The seats delete policy refuses a filled or reserved seat too (migration
			20261023120000). Asking first answers before anything is written, and
			leaves the `false` below to mean the seat was taken in between.
		*/
		if (seat.isFilled || seat.isReserved) {
			return refuse(400, SEAT_IN_USE_MESSAGE);
		}

		const wasDeleted = await deleteSeat(event.locals.supabase, seat.id);

		// Row Level Security refused it between the two questions, which means
		// somebody was put in the seat, or it was held for a delegation, while
		// this request was in the air.
		if (!wasDeleted) {
			return refuse(400, SEAT_IN_USE_MESSAGE);
		}

		backToEditor(event);
	},

	/**
	 * Make somebody a chair of this committee, with the title they hold in it.
	 *
	 * Only the conference's own chair staff may be added, and of them only
	 * somebody the reader ranks above, which is what the picker offers — but a
	 * form action is its own request and anybody can post any user id to it, so
	 * the list is read again here and the id checked against it. The database
	 * refuses the same people (security review L5); asking first is what lets
	 * the refusal be a sentence that says why.
	 */
	addChair: async (event) => {
		const { conference, committee, permissions } = await requireCommittee(event, 'chairs');

		const formData = await event.request.formData();
		const userId = readText(formData, 'userId');
		const title = readText(formData, 'title');

		if (userId === '') {
			return refuse(400, 'Please choose somebody to add as a chair.');
		}

		if (title.length > STAFF_TITLE_MAX_LENGTH) {
			return refuse(400, `Please keep the title under ${STAFF_TITLE_MAX_LENGTH} characters.`);
		}

		const chairStaff = await listChairStaff(event.locals.supabase, conference.id);
		const member = chairStaff.find((candidate) => candidate.userId === userId);

		if (!member) {
			return refuse(
				400,
				'Only a chair on this conference team can chair a committee. Invite them on the team page first.'
			);
		}

		if (!mayAssignChair(permissions, member)) {
			return refuse(403, CHAIR_ABOVE_YOU_MESSAGE);
		}

		/*
			An empty title box means "no title of their own", and leaving the column
			out is what writes the database's own default, "Chair". Sending the empty
			text instead would put a chair with no title at all in the list.
		*/
		const assignment = await addCommitteeChair(
			event.locals.supabase,
			committee.id,
			userId,
			title === '' ? undefined : title
		);

		// The primary key on `committee_chairs` is what refuses a second row for
		// the same person. A refusal of any other kind is the rank rule, whose
		// answer may have changed since the check above.
		if (assignment === 'already-chairs') {
			return refuse(400, 'That person is already a chair here.');
		}

		if (assignment === 'refused') {
			return refuse(403, CHAIR_ABOVE_YOU_MESSAGE);
		}

		setFlash(event.cookies, { tone: 'success', message: 'Chair added.' });
		backToEditor(event);
	},

	/**
	 * Take somebody out of this committee's chair. They stay on the conference's
	 * team, because chairing a committee and being a chair are two different
	 * rows: the team page is where somebody stops being staff.
	 *
	 * Only a chair the reader ranks above, which is whom the page shows "Remove"
	 * for. The database refuses anybody else (security review L5), but a refused
	 * delete answers with nothing, so asking first is what lets the refusal say
	 * why.
	 *
	 * No flash when it works, for the reason the seat actions above give: the
	 * row visibly goes. A refusal brings one, with the reason, as its toast.
	 */
	removeChair: async (event) => {
		const { conference, committee, permissions } = await requireCommittee(event, 'chairs');

		const formData = await event.request.formData();
		const userId = readText(formData, 'userId');

		if (userId === '') {
			return refuseChairPress(400, 'Please say which chair to remove.');
		}

		const teamRanks = await readTeamRanks(event.locals.supabase, conference.id);

		if (!mayRemoveChair(permissions, teamRanks.get(userId) ?? null)) {
			return refuseChairPress(403, REMOVE_CHAIR_ABOVE_YOU_MESSAGE);
		}

		const wasRemoved = await removeCommitteeChair(event.locals.supabase, committee.id, userId);

		// Nothing was deleted: another window took them off already, or their
		// rank changed since the check above, or they are a platform admin, whom
		// only the database can see ranks above everybody. The two look the same
		// from here.
		if (!wasRemoved) {
			return refuseChairPress(
				404,
				'That person no longer chairs this committee, or ranks at or above you.'
			);
		}

		backToEditor(event);
	},

	/**
	 * Invite somebody by email to chair this committee (T175).
	 *
	 * It writes the same row the team page's "Invite someone" does for a chair
	 * with this committee chosen, so accepting it makes them staff and a chair of
	 * this committee. Unlike that form it answers with the link rather than a
	 * redirect, because the link is only ever shown once, here.
	 *
	 * An address is refused when it already chairs this committee, when it
	 * belongs to an organiser of this conference (accepting would demote them;
	 * see `committeeChairInviteRefusal`), or when an invitation to it is already
	 * waiting anywhere in this conference, the team page's rule.
	 */
	inviteChair: async (event) => {
		const { user, conference, committee } = await requireCommittee(event, 'chairs');

		const formData = await event.request.formData();
		const email = readText(formData, 'email');
		const emailProblem = validateEmail(email);

		if (emailProblem) {
			return refuseChairInvite(400, email, emailProblem);
		}

		const refusal = await committeeChairInviteRefusal(event.locals.supabase, committee.id, email);

		if (refusal) {
			return refuseChairInvite(400, email, CHAIR_INVITE_REFUSALS[refusal]);
		}

		const pending = await findPendingInvite(event.locals.supabase, conference.id, email);

		if (pending) {
			return refuseChairInvite(
				400,
				email,
				'There is already a pending invitation for that address.'
			);
		}

		// The invitation hands over the conference's chair role: its first role
		// that works per committee, which is the Chair preset unless the
		// conference has rearranged its roles.
		const chairRole = await findChairRole(event.locals.supabase, conference.id);

		if (chairRole === null) {
			return refuseChairInvite(
				400,
				email,
				'This conference has no role that works per committee to invite them to.'
			);
		}

		const token = await createStaffInvite(event.locals.supabase, {
			conferenceId: conference.id,
			email,
			roleId: chairRole.id,
			committeeId: committee.id,
			title: null,
			invitedBy: user.id
		});

		if (!token) {
			return refuseChairInvite(500, email, CHAIR_INVITE_FAILED_MESSAGE);
		}

		return {
			values: null,
			errors: {},
			message: null,
			chairInvite: { email, error: null, link: chairInviteLink(event.url.origin, token) }
		} satisfies CommitteeEditResult;
	},

	/**
	 * Withdraw one of this committee's chair invitations (T175). Only one that is
	 * still waiting and belongs to this committee, whatever id was posted.
	 */
	withdrawChairInvite: async (event) => {
		const { committee } = await requireCommittee(event, 'chairs');

		const formData = await event.request.formData();
		const inviteId = readText(formData, 'inviteId');

		if (inviteId === '') {
			return refuseChairPress(400, 'Please say which invitation to withdraw.');
		}

		const wasWithdrawn = await withdrawCommitteeChairInvite(
			event.locals.supabase,
			committee.id,
			inviteId
		);

		// Nothing withdrawn means it was accepted or withdrawn a moment ago, or the
		// delete policy refused because it offers a role above the reader's
		// (migration 20261023121000). The two look the same from here.
		if (!wasWithdrawn) {
			return refuseChairPress(
				404,
				'That invitation is no longer waiting to be accepted, or it offers a role above yours.'
			);
		}

		setFlash(event.cookies, { tone: 'success', message: 'Invitation withdrawn.' });
		backToEditor(event);
	},

	/**
	 * Make the reader a chair of this committee themselves (T175).
	 *
	 * `requireCommittee` has already refused anybody who cannot manage this
	 * conference, and only an administrator may make themselves a chair: the
	 * rank rule lets the others make a chair only of somebody below them
	 * (security review L5). This button only ever adds the person pressing it.
	 * It deliberately skips `addChair`'s "only chair staff" check, because an
	 * administrator is often not staff at all; the `ensure_chair_is_staff`
	 * trigger gives them a staff row when they have none and leaves their own
	 * row as it was.
	 */
	chairYourself: async (event) => {
		const { user, committee, permissions } = await requireCommittee(event, 'chairs');

		if (!mayChairThemselves(permissions)) {
			return refuse(403, CHAIR_YOURSELF_MESSAGE);
		}

		const assignment = await addCommitteeChair(event.locals.supabase, committee.id, user.id);

		// The primary key refuses a second row: this reader chairs the committee
		// already.
		if (assignment === 'already-chairs') {
			return refuse(400, 'You already chair this committee.');
		}

		if (assignment === 'refused') {
			return refuse(403, CHAIR_YOURSELF_MESSAGE);
		}

		setFlash(event.cookies, { tone: 'success', message: `You now chair ${committee.name}.` });
		backToEditor(event);
	},

	/**
	 * Put this committee's background guide in the `documents` bucket, replacing
	 * whichever one it had.
	 */
	uploadGuide: async (event) => {
		const { user, conference, committee } = await requireCommittee(event, 'agenda');

		const formData = await event.request.formData();
		const chosenGuide = readChosenGuide(formData);
		const audience = readText(formData, 'audience');

		if (!chosenGuide) {
			return refuse(400, 'Please choose a PDF to upload.');
		}

		const fileProblem = pdfFileProblem(chosenGuide);

		if (fileProblem) {
			return refuse(400, fileProblem);
		}

		if (!isGuideAudience(audience)) {
			return refuse(400, 'Please say who the background guide is for.');
		}

		/*
			A 500 rather than the 400s above, and the same reasoning the details
			editor gives about its pictures: every value the organiser sent was
			fine, and Storage is ours, so there is nothing here for them to fix.
		*/
		try {
			await uploadBackgroundGuide(event.locals.supabase, {
				conferenceId: conference.id,
				committeeId: committee.id,
				uploadedBy: user.id,
				// `documents.title` is what the conference-wide documents page lists a
				// file under, so it names the committee rather than repeating "guide".
				title: `${committee.name} background guide`,
				file: chosenGuide,
				audience
			});
		} catch {
			return refuse(500, 'The background guide could not be saved. Please try again.');
		}

		setFlash(event.cookies, { tone: 'success', message: 'Background guide uploaded.' });
		backToEditor(event);
	},

	/** Take the background guide away: the row first, then the file behind it. */
	removeGuide: async (event) => {
		const { committee } = await requireCommittee(event, 'agenda');

		const wasRemoved = await removeBackgroundGuide(event.locals.supabase, committee.id);

		// Either there was no guide, or Row Level Security refused the delete.
		// Both mean the guide is still whatever the page shows after the reload.
		if (!wasRemoved) {
			return refuse(400, 'There is no background guide to remove.');
		}

		setFlash(event.cookies, { tone: 'success', message: 'Background guide removed.' });
		backToEditor(event);
	},

	/**
	 * "Start from": fill every resolution setting but the format from North
	 * American or THIMUN procedure, in one press. A chair who edits only this
	 * committee may, as `protect_committees_columns` allows.
	 */
	applyProcedure: async (event) => {
		const { committee } = await requireCommittee(event, 'agenda');

		const formData = await event.request.formData();
		const procedureName = readText(formData, 'procedureName');

		if (!isProcedureName(procedureName)) {
			return refuseProcedure('Choose North American or THIMUN procedure.');
		}

		const { refusal } = await applyCommitteeProcedure(
			event.locals.supabase,
			committee.id,
			procedureName
		);

		if (refusal) {
			return refuseProcedure(refusal);
		}

		setFlash(event.cookies, { tone: 'success', message: appliedProcedureMessage(procedureName) });
		backToEditor(event);
	},

	/** Save the "Resolutions" settings, each checked beside its own field first. */
	saveProcedure: async (event) => {
		const { committee } = await requireCommittee(event, 'agenda');

		const values = readProcedureForm(await event.request.formData());
		const { procedure, errors } = validateProcedureForm(values);

		if (!procedure) {
			return refuseProcedure('Please fix the resolution settings.', { values, errors });
		}

		const { refusal } = await saveCommitteeProcedure(
			event.locals.supabase,
			committee.id,
			procedure
		);

		if (refusal) {
			return refuseProcedure(refusal, { values, errors: {} });
		}

		setFlash(event.cookies, { tone: 'success', message: 'Resolution settings saved.' });
		backToEditor(event);
	},

	/**
	 * Copy this committee's settings, all but the format, to the other
	 * committees ticked. Only ones the page offered are sent on, so an id
	 * typed in by hand never reaches the database.
	 */
	copyProcedure: async (event) => {
		const { conference, committee, permissions } = await requireCommittee(event, 'agenda');

		const formData = await event.request.formData();
		const chosenIds = formData.getAll('committeeIds').map(String);
		const targets = await readCopyTargets(event, conference.id, committee.id, permissions);
		const targetIds = targets
			.map((target) => target.id)
			.filter((targetId) => chosenIds.includes(targetId));

		if (targetIds.length === 0) {
			return refuseProcedure('Choose at least one committee to copy the settings to.');
		}

		const { refusal } = await copyCommitteeProcedure(
			event.locals.supabase,
			committee.id,
			targetIds
		);

		if (refusal) {
			return refuseProcedure(refusal);
		}

		setFlash(event.cookies, {
			tone: 'success',
			message: copiedProcedureMessage(targetIds.length)
		});
		backToEditor(event);
	},

	/** Delete the whole committee, and its seats with it. */
	deleteCommittee: async (event) => {
		const { committee } = await requireCommittee(event, 'whole');

		const wasDeleted = await deleteCommittee(event.locals.supabase, committee.id);

		// Row Level Security refuses a committee with a filled or reserved seat,
		// and answering `false` is how `$lib/server/manage-committees.ts` reports that.
		if (!wasDeleted) {
			return refuse(
				400,
				'You cannot delete a committee while a seat in it is filled or reserved. Free its seats on the allocation page first.'
			);
		}

		setFlash(event.cookies, { tone: 'success', message: 'Committee deleted.' });
		redirect(303, manageCommitteesUrl(event.params.slug));
	}
};

/**
 * Which topic row the "Remove" button belongs to, or `null` when the request did
 * not say.
 *
 * It travels in the button's own action address, `?/removeTopic&index=2`, for
 * the reason `moveSeat` gives above: every row's button sits inside the one form
 * the whole committee section is, so a hidden field would be sent by all of them
 * at once and none of them could say which row it meant.
 */
function readTopicIndex(url: URL): number | null {
	const raw = url.searchParams.get('index');

	if (raw === null || !/^\d+$/.test(raw)) {
		return null;
	}

	return Number(raw);
}
