/**
 * The form actions of the GSL view's queue column (`specs/05-pages/chair/gsl.md`,
 * "Actions and forms"): add a seat (marking a late delegate present on the
 * way), move an entry up or down, to the top or to the place it was dragged
 * to, remove one, give one the floor at once ("Speak now"), and the list's
 * settings in its footer (the speaking time, and closing or opening it).
 *
 * Files under `$lib/server` only ever run on the server. A page spreads
 * `queueActions` into its own `actions` and says where to send the chair back
 * to, the same way `./chair-floor-actions.ts` shares the timer and the floor:
 * the live room (`chair`) and the GSL view (`chair/gsl`) both do. The rows
 * themselves are written by `./speakers-list-edits.ts`.
 */

import { ROOM_REFUSALS, isSessionRunning, type ChairRoomFrame } from '$lib/chair-room';
import { PRESSED_AT_FIELD, pressedMoment } from '$lib/clock-offset';
import { isListOnTheFloor, isSeatAbsent } from '$lib/gsl-floor';
import { NEW_ROW_ID_FIELD, readNewRowId } from '$lib/new-row-id';
import { SPEAKING_TIME_FIELD, readTypedSpeakingTime } from '$lib/speaking-time';
import {
	listedSeatIds,
	nextPosition,
	placedPositions,
	readQueueIndex,
	waitingNeighbour,
	type ListedSpeaker,
	type MoveDirection,
	type SessionSpeakersList
} from '$lib/speakers-lists';
import {
	openChairRoom,
	refuseChairAction,
	returnTo,
	type ChairRequestEvent,
	type OpenRoom
} from '$lib/server/chair-floor-actions';
import { getOrCreateRollCall, setRollCallStatus } from '$lib/server/roll-calls';
import {
	addSpeaker,
	getSpeakersLists,
	placeSpeakers,
	removeSpeaker,
	setListOpen,
	setSpeakingTime,
	swapSpeakers
} from '$lib/server/speakers-list-edits';
import { moveToNextSpeaker } from '$lib/server/speakers-lists';

/** The sentences the queue's actions refuse with, on every view that draws a list. */
export const QUEUE_REFUSALS = {
	noSession: ROOM_REFUSALS.noSessionRunning,
	otherList: 'That list is not one of this session’s.',
	otherEntry: 'That speaker is not on one of this session’s lists.',
	alreadyListed: 'That seat is already on the list.',
	listClosed: 'The list is closed.',
	notPresent: 'That seat is not present.',
	removeSpeaking: 'Use End speech or Next to end the current speech.',
	notWaiting: 'That speaker is no longer waiting.',
	place: 'Choose a place in the queue.',
	speakingTime: 'Speaking time must be between 30 seconds and 5 minutes.'
} as const;

/** The value of the add form's `markPresent` field for "absent · Mark present". */
const MARK_PRESENT = '1';

/**
 * Where a page sends the chair once a queue action has worked, given the id of
 * the list it changed: an address built by a helper in `$lib`.
 */
export type ListReturnAddress = (event: ChairRequestEvent, listId: string) => string;

/** What an action on one list knows once the list has been checked. */
export type CheckedList = OpenRoom & { list: SessionSpeakersList };

/** What an action on one entry knows once the entry has been checked. */
type CheckedEntry = CheckedList & { entry: ListedSpeaker };

/** The session's lists, read afresh for an action, or null when no session is running. */
async function readSessionLists(
	event: ChairRequestEvent,
	frame: ChairRoomFrame
): Promise<SessionSpeakersList[] | null> {
	const session = frame.currentSession;

	if (session === null || !isSessionRunning(session)) return null;

	return getSpeakersLists(event.locals.supabase, session.id, frame.seats);
}

/**
 * Open the room and find the list the form names among the running session's.
 * Answers the sentence to refuse with when there is no session or no such list.
 */
export async function openList(
	event: ChairRequestEvent,
	formData: FormData
): Promise<CheckedList | { refusal: string }> {
	const room = await openChairRoom(event);
	const lists = await readSessionLists(event, room.frame);

	if (lists === null) return { refusal: QUEUE_REFUSALS.noSession };

	const listId = String(formData.get('listId') ?? '');
	const list = lists.find((candidate) => candidate.speakersList.id === listId);

	if (!list) return { refusal: QUEUE_REFUSALS.otherList };

	return { ...room, list };
}

/**
 * Open the room and find the entry the form names on one of the running
 * session's lists. Answers the sentence to refuse with when there is none.
 */
async function openEntry(
	event: ChairRequestEvent,
	formData: FormData
): Promise<CheckedEntry | { refusal: string }> {
	const room = await openChairRoom(event);
	const lists = await readSessionLists(event, room.frame);

	if (lists === null) return { refusal: QUEUE_REFUSALS.noSession };

	const entryId = String(formData.get('entryId') ?? '');

	for (const list of lists) {
		const entry = list.speakers.find((speaker) => speaker.id === entryId);

		if (entry) return { ...room, list, entry };
	}

	return { refusal: QUEUE_REFUSALS.otherEntry };
}

/**
 * Mark a seat present at the session's roll call, creating the roll call if
 * the session has none yet ("get or create", `chair/roll-call.md`). The add
 * box's "absent · Mark present" does this for a late delegate who wants to
 * speak, in the same press that adds them. The Mod view's "Recognise"
 * (`./caucus-actions.ts`) does the same.
 */
export async function markSeatPresent(
	event: ChairRequestEvent,
	frame: ChairRoomFrame,
	seatId: string
): Promise<void> {
	const session = frame.currentSession;

	if (session === null) return;

	const seatIds = frame.seats.map((seat) => seat.id);
	const rollCallId = await getOrCreateRollCall(event.locals.supabase, session.id, seatIds);

	await setRollCallStatus(event.locals.supabase, rollCallId, seatId, 'present');
}

/**
 * The add, move, place, remove, "Speak now" and list settings actions,
 * sending the chair back to `returnAddress` once each has worked.
 */
export function queueActions(returnAddress: ListReturnAddress) {
	/** Go back once the list has changed. `redirect` throws inside `returnTo`. */
	function backToList(event: ChairRequestEvent, listId: string) {
		returnTo(event, returnAddress(event, listId));
	}

	/** Swap a waiting entry with its waiting neighbour. At either end nothing moves. */
	async function moveSpeaker(event: ChairRequestEvent, direction: MoveDirection) {
		const formData = await event.request.formData();
		const opened = await openEntry(event, formData);

		if ('refusal' in opened) return refuseChairAction(opened.refusal);

		const { list, entry } = opened;
		const neighbour = waitingNeighbour(list.speakers, entry.id, direction);

		if (neighbour !== null) await swapSpeakers(event.locals.supabase, entry, neighbour);

		backToList(event, list.speakersList.id);
	}

	/**
	 * Put a waiting entry at the place `toIndex` (from 0) among the waiting
	 * entries, or at the place the form's `place` field names when `toIndex`
	 * is null, as a drag sends it.
	 */
	async function placeSpeaker(event: ChairRequestEvent, toIndex: number | null) {
		const formData = await event.request.formData();
		const opened = await openEntry(event, formData);

		if ('refusal' in opened) return refuseChairAction(opened.refusal);

		const { list, entry } = opened;
		const index = toIndex ?? readQueueIndex(formData.get('place'));

		if (entry.status !== 'waiting') return refuseChairAction(QUEUE_REFUSALS.notWaiting);
		if (index === null) return refuseChairAction(QUEUE_REFUSALS.place);

		const positions = placedPositions(list.speakers, entry.id, index);
		await placeSpeakers(event.locals.supabase, positions);

		backToList(event, list.speakersList.id);
	}

	/** Open or close the list the form names. A closed list takes no new speakers. */
	async function changeListOpen(event: ChairRequestEvent, isOpen: boolean) {
		const formData = await event.request.formData();
		const opened = await openList(event, formData);

		if ('refusal' in opened) return refuseChairAction(opened.refusal);

		await setListOpen(event.locals.supabase, opened.list.speakersList.id, isOpen);

		backToList(event, opened.list.speakersList.id);
	}

	return {
		add: async (event: ChairRequestEvent) => {
			const formData = await event.request.formData();
			const opened = await openList(event, formData);

			if ('refusal' in opened) return refuseChairAction(opened.refusal);

			const { frame, list } = opened;
			const seatId = String(formData.get('seatId') ?? '');

			if (!list.speakersList.isOpen) return refuseChairAction(QUEUE_REFUSALS.listClosed);
			if (listedSeatIds(list.speakers).includes(seatId)) {
				return refuseChairAction(QUEUE_REFUSALS.alreadyListed);
			}

			// `frame.seats` holds only this committee's seats, so a seat from
			// anywhere else is refused the same way as an absent one.
			if (!frame.seats.some((seat) => seat.id === seatId)) {
				return refuseChairAction(QUEUE_REFUSALS.notPresent);
			}

			// A seat marked absent is added only when the chair chose "absent ·
			// Mark present", which marks it present first, in the same press (S4).
			if (isSeatAbsent(seatId, frame.attendance)) {
				if (formData.get('markPresent') !== MARK_PRESENT) {
					return refuseChairAction(QUEUE_REFUSALS.notPresent);
				}

				await markSeatPresent(event, frame, seatId);
			}

			const position = nextPosition(list.speakers);
			// The id the chair's screen already shows the entry under (`$lib/new-row-id.ts`).
			const entryId = readNewRowId(formData.get(NEW_ROW_ID_FIELD));
			await addSpeaker(event.locals.supabase, list.speakersList.id, seatId, position, entryId);

			backToList(event, list.speakersList.id);
		},

		moveUp: (event: ChairRequestEvent) => moveSpeaker(event, 'up'),

		moveDown: (event: ChairRequestEvent) => moveSpeaker(event, 'down'),

		// T129: "Move to top" in a row's menu, and a row dropped by dragging.
		moveToTop: (event: ChairRequestEvent) => placeSpeaker(event, 0),

		moveTo: (event: ChairRequestEvent) => placeSpeaker(event, null),

		remove: async (event: ChairRequestEvent) => {
			const formData = await event.request.formData();
			const opened = await openEntry(event, formData);

			if ('refusal' in opened) return refuseChairAction(opened.refusal);

			const { list, entry } = opened;

			if (entry.status === 'speaking') return refuseChairAction(QUEUE_REFUSALS.removeSpeaking);
			if (entry.status !== 'waiting') return refuseChairAction(QUEUE_REFUSALS.notWaiting);

			await removeSpeaker(event.locals.supabase, entry.id);

			backToList(event, list.speakersList.id);
		},

		// "Speak now" (S4): what "Next" does, for this waiting entry instead of
		// the first. The entry is moved to the top of the waiting entries, and
		// the database's "Next" (`call_next_speaker`) then gives it the floor
		// with its clock ready, ending the speech in progress in one transaction.
		speakNow: async (event: ChairRequestEvent) => {
			const formData = await event.request.formData();
			const opened = await openEntry(event, formData);

			if ('refusal' in opened) return refuseChairAction(opened.refusal);

			const { committee, frame, list, entry } = opened;

			if (entry.status !== 'waiting') return refuseChairAction(QUEUE_REFUSALS.notWaiting);
			if (isSeatAbsent(entry.seat.id, frame.attendance)) {
				return refuseChairAction(QUEUE_REFUSALS.notPresent);
			}
			if (!isListOnTheFloor(frame.committeeState, list.speakersList.id)) {
				return refuseChairAction(ROOM_REFUSALS.noSpeakersList);
			}

			const positions = placedPositions(list.speakers, entry.id, 0);
			await placeSpeakers(event.locals.supabase, positions);

			const listInRoom = { speakersList: list.speakersList, speakers: list.speakers };
			const pressed = pressedMoment(formData.get(PRESSED_AT_FIELD), new Date());
			await moveToNextSpeaker(
				event.locals.supabase,
				committee.id,
				frame.committeeState,
				listInRoom,
				pressed
			);

			backToList(event, list.speakersList.id);
		},

		// The list footer's settings, once the Speakers page's own actions (S4).
		// The running timer is left alone, so a new time reaches the next speaker.
		setSpeakingTime: async (event: ChairRequestEvent) => {
			const formData = await event.request.formData();
			const opened = await openList(event, formData);

			if ('refusal' in opened) return refuseChairAction(opened.refusal);

			const seconds = readTypedSpeakingTime(formData.get(SPEAKING_TIME_FIELD));

			if (seconds === null) return refuseChairAction(QUEUE_REFUSALS.speakingTime);

			await setSpeakingTime(event.locals.supabase, opened.list.speakersList.id, seconds);

			backToList(event, opened.list.speakersList.id);
		},

		closeList: (event: ChairRequestEvent) => changeListOpen(event, false),

		openList: (event: ChairRequestEvent) => changeListOpen(event, true)
	};
}
