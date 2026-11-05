/**
 * The form actions of a running caucus (`specs/05-pages/chair/mod.md`,
 * "Actions and forms", and `unmod.md`): "Recognise" from the Mod view's add
 * box, "Extend +5:00" and "End caucus".
 *
 * Files under `$lib/server` only ever run on the server. The live room
 * (`chair`), `chair/mod` and `chair/unmod` each spread `caucusActions` into
 * their own `actions`, the way `floorActions` and `queueActions` are shared,
 * so the running caucus and the live strip post them from any of the three.
 * Every action asks the chair gate again (`openChairRoom`) and redirects, so
 * it works without JavaScript.
 */

import { ROOM_REFUSALS, isSessionRunning } from '$lib/chair-room';
import { caucusClockColumns, extendedCaucusClock } from '$lib/caucus-clock';
import { CAUCUS_EXTENSION_SECONDS } from '$lib/caucus-floor';
import { PRESSED_AT_FIELD, pressedMoment } from '$lib/clock-offset';
import { isSeatAbsent } from '$lib/gsl-floor';
import { NEW_ROW_ID_FIELD, readNewRowId } from '$lib/new-row-id';
import { listedSeatIds, nextPosition, placedPositions } from '$lib/speakers-lists';
import { chairRoomUrl } from '$lib/urls';
import {
	openChairRoom,
	refuseChairAction,
	returnTo,
	type ChairRequestEvent,
	type OpenRoom,
	type ReturnAddress
} from '$lib/server/chair-floor-actions';
import {
	getActiveSpeakersList,
	setRoomMode,
	updateCommitteeState
} from '$lib/server/committee-room';
import { QUEUE_REFUSALS, markSeatPresent } from '$lib/server/speaker-queue-actions';
import { addSpeaker, placeSpeakers } from '$lib/server/speakers-list-edits';
import { moveToNextSpeaker, type SpeakersListInRoom } from '$lib/server/speakers-lists';

/** The sentence a caucus action refuses with while no caucus runs. */
export const CAUCUS_REFUSALS = {
	noCaucus: 'No caucus is running.'
} as const;

/** The value of the add box's `markPresent` field for "absent · Mark present". */
const MARK_PRESENT = '1';

/**
 * Give a seat just recognised the floor at once, the way "Speak now" does:
 * its entry moves to the top of the waiting entries, and the database's
 * "Next" (`call_next_speaker`) gives it the floor with its clock ready at
 * the caucus's speaking time, in one transaction.
 */
async function giveTheFloor(
	event: ChairRequestEvent,
	room: OpenRoom,
	list: SpeakersListInRoom,
	entry: { id: string; position: number; seatId: string },
	pressed: Date
): Promise<void> {
	const seat = room.frame.seats.find((candidate) => candidate.id === entry.seatId);

	if (seat === undefined) return;

	const added = { id: entry.id, position: entry.position, status: 'waiting' as const, seat };
	const withNewEntry = [...list.speakers, added];
	await placeSpeakers(event.locals.supabase, placedPositions(withNewEntry, entry.id, 0));

	const state = room.frame.committeeState;
	await moveToNextSpeaker(event.locals.supabase, room.committee.id, state, list, pressed);
}

/**
 * The Mod view's "Recognise", "Extend +5:00" and "End caucus" (Unmod's too),
 * sending the chair back to `returnAddress` once Recognise or Extend has
 * worked. "End caucus" changes what the room is doing, so it always lands on
 * the live room, `chair`.
 */
export function caucusActions(returnAddress: ReturnAddress) {
	return {
		// Recognise (S7): the seat joins the caucus's list, and takes the floor
		// at once when nobody has it. With nobody speaking, the recognised seat
		// gets the floor, not the first one waiting.
		recognise: async (event: ChairRequestEvent) => {
			const room = await openChairRoom(event);
			const formData = await event.request.formData();
			const { frame } = room;
			const state = frame.committeeState;
			const listId = String(formData.get('listId') ?? '');
			const seatId = String(formData.get('seatId') ?? '');

			if (!isSessionRunning(frame.currentSession)) {
				return refuseChairAction(ROOM_REFUSALS.noSessionRunning);
			}
			if (state.mode !== 'moderated_caucus' || state.activeSpeakersListId !== listId) {
				return refuseChairAction(CAUCUS_REFUSALS.noCaucus);
			}

			const active = await getActiveSpeakersList(event.locals.supabase, state, frame.seats);

			if (active.speakersList === null) return refuseChairAction(CAUCUS_REFUSALS.noCaucus);
			if (listedSeatIds(active.speakers).includes(seatId)) {
				return refuseChairAction(QUEUE_REFUSALS.alreadyListed);
			}
			// `frame.seats` holds only this committee's seats, so any other seat is refused too.
			if (!frame.seats.some((seat) => seat.id === seatId)) {
				return refuseChairAction(QUEUE_REFUSALS.notPresent);
			}

			// A seat marked absent is recognised only through "absent · Mark present",
			// which marks it present first, in the same press.
			if (isSeatAbsent(seatId, frame.attendance)) {
				if (formData.get('markPresent') !== MARK_PRESENT) {
					return refuseChairAction(QUEUE_REFUSALS.notPresent);
				}

				await markSeatPresent(event, frame, seatId);
			}

			// The id the chair's screen already shows the entry under, or a new one
			// without JavaScript, which giving it the floor needs to name it.
			const entryId = readNewRowId(formData.get(NEW_ROW_ID_FIELD)) ?? crypto.randomUUID();
			const position = nextPosition(active.speakers);
			await addSpeaker(event.locals.supabase, listId, seatId, position, entryId);

			if (state.currentSpeakerEntryId === null) {
				const list = { speakersList: active.speakersList, speakers: active.speakers };
				const pressed = pressedMoment(formData.get(PRESSED_AT_FIELD), new Date());
				await giveTheFloor(event, room, list, { id: entryId, position, seatId }, pressed);
			}

			returnTo(event, returnAddress(event, frame));
		},

		// Extend +5:00 (S7): a clock adjustment like +15 s, recording no motion.
		// The caucus clock gets five minutes more, running or paused.
		extendCaucus: async (event: ChairRequestEvent) => {
			const { committee, frame } = await openChairRoom(event);
			const formData = await event.request.formData();
			const state = frame.committeeState;

			if (state.mode !== 'moderated_caucus' || state.caucusClock === undefined) {
				return refuseChairAction(CAUCUS_REFUSALS.noCaucus);
			}

			const pressed = pressedMoment(formData.get(PRESSED_AT_FIELD), new Date());
			const longer = extendedCaucusClock(state.caucusClock, CAUCUS_EXTENSION_SECONDS, pressed);
			await updateCommitteeState(event.locals.supabase, committee.id, caucusClockColumns(longer));

			returnTo(event, returnAddress(event, frame));
		},

		// End caucus (S7, S8): the speech in progress ends with its time, and the
		// room goes back to formal debate on the General Speakers' List, whose
		// waiting speakers are where they were (`setRoomMode`).
		endCaucus: async (event: ChairRequestEvent) => {
			const { committee, frame } = await openChairRoom(event);
			const state = frame.committeeState;
			const isCaucus = state.mode === 'moderated_caucus' || state.mode === 'unmoderated_caucus';

			if (!isSessionRunning(frame.currentSession) || !isCaucus) {
				return refuseChairAction(CAUCUS_REFUSALS.noCaucus);
			}

			await setRoomMode(event.locals.supabase, committee.id, state, 'formal_debate');

			returnTo(event, chairRoomUrl(event.params.slug, event.params.committeeSlug));
		}
	};
}
