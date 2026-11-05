import { fail, redirect } from '@sveltejs/kit';
import {
	NOTE_REFUSALS,
	chooseNoteSeatId,
	countNotesBySeat,
	noteBodyProblem
} from '$lib/chair-notes';
import type { Flash } from '$lib/flash';
import { NEW_ROW_ID_FIELD, readNewRowId } from '$lib/new-row-id';
import { chairNoteAddedUrl, chairNotesUrl } from '$lib/urls';
import {
	askHasPermission,
	requireCommitteePermission,
	requireCommitteeTool
} from '$lib/server/access';
import {
	addChairNote,
	deleteChairNote,
	listChairNotes,
	listSeatAllocations
} from '$lib/server/chair-notes';
import { getChairRoomFrame } from '$lib/server/committee-room';
import { setFlash } from '$lib/server/flash';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/**
 * Runs on the server, after the chair layout's `load` has checked the reader
 * and read the room's frame. `parent()` hands over what the layout returned.
 *
 * It adds every note of the committee, who sits in each seat and since when,
 * and which seat is shown: `?seat=<id>` when it names one of the committee's
 * seats, otherwise the first seat with a delegate. `?added=1` is set after a
 * note was added, so the page puts the cursor back in the note box.
 */
export const load: PageServerLoad = async ({ parent, locals, url }) => {
	const { conference, committee, seats, committeeTools } = await parent();
	// The console opened for `run_room`; this page asks its own permission too.
	requireCommitteeTool(committeeTools, 'mayWriteNotes');

	const [notes, allocations, canManage] = await Promise.all([
		listChairNotes(locals.supabase, committee.id),
		listSeatAllocations(locals.supabase, committee.id),
		// An organiser may delete anybody's note, a chair only their own.
		askHasPermission(locals.supabase, conference.id, 'administrator')
	]);

	return {
		notes,
		noteCounts: countNotesBySeat(notes),
		allocations,
		selectedSeatId: chooseNoteSeatId(seats, allocations, url.searchParams.get('seat')),
		canManage,
		hasJustAdded: url.searchParams.has('added')
	};
};

/**
 * What a refused form sends back. Only a refused note carries `body` and
 * `problem`, so the note box keeps what was typed and says what was wrong.
 */
type NotesPageResult = {
	flash: Flash;
	body: string | null;
	problem: string | null;
};

/** Refuse, staying on the page. The root layout shows `flash` as a toast. */
function refuse(message: string, body: string | null = null) {
	return fail(400, {
		flash: { tone: 'error', message },
		body,
		problem: body === null ? null : message
	} satisfies NotesPageResult);
}

/**
 * The chair gate, asked again at the top of every action (an action is its
 * own request, so nothing `load` worked out reaches it), then the committee's
 * available seats.
 */
async function openNotes(event: RequestEvent) {
	const { user, committee } = await requireCommitteePermission(
		event.locals,
		event.url,
		event.params.slug,
		event.params.committeeSlug,
		'write_chair_notes'
	);
	const frame = await getChairRoomFrame(event.locals.supabase, committee.id);

	return { user, committee, seats: frame.seats };
}

export const actions: Actions = {
	add: async (event) => {
		const { user, committee, seats } = await openNotes(event);
		const formData = await event.request.formData();
		const seatId = String(formData.get('seatId') ?? '');
		const body = String(formData.get('body') ?? '');
		// The browser already chose an id for the note it is showing at once
		// (T141); saving it under that id keeps the shown row and the saved one
		// the same row. `readNewRowId` reads `$lib/new-row-id.ts`'s hidden field.
		const newNoteId = readNewRowId(formData.get(NEW_ROW_ID_FIELD));

		if (!seats.some((seat) => seat.id === seatId)) return refuse(NOTE_REFUSALS.seat);

		// The form posted to `?seat=<id>&/add`, so a refused note comes back
		// on the same seat, with what was typed still in the box.
		const problem = noteBodyProblem(body);

		if (problem !== null) return refuse(problem, body);

		await addChairNote(
			event.locals.supabase,
			{
				committeeId: committee.id,
				seatId,
				authorId: user.id,
				body: body.trim()
			},
			newNoteId
		);

		redirect(303, chairNoteAddedUrl(event.params.slug, event.params.committeeSlug, seatId));
	},

	delete: async (event) => {
		const { committee } = await openNotes(event);
		const formData = await event.request.formData();
		const noteId = String(formData.get('noteId') ?? '');

		// `ConfirmButton` always sends `confirm=1`, so only a hand-made request lacks it.
		if (formData.get('confirm') !== '1') return refuse(NOTE_REFUSALS.confirm);

		// The delete policy is the real check: author, or organiser.
		const isDeleted = await deleteChairNote(event.locals.supabase, committee.id, noteId);

		if (!isDeleted) return refuse(NOTE_REFUSALS.note);

		// A redirect cannot carry a message, so it travels in a cookie. The form
		// posted to `?seat=<id>&/delete`, so the seat it names is shown again.
		setFlash(event.cookies, { tone: 'success', message: 'Note deleted.' });
		redirect(
			303,
			chairNotesUrl(
				event.params.slug,
				event.params.committeeSlug,
				event.url.searchParams.get('seat')
			)
		);
	}
};
