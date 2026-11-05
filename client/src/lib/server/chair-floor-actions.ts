/**
 * The form actions of the floor, which every page drawing the GSL view's
 * floor shares: the five timer buttons, "Next" (and "Call"), "End speech" and
 * the two yields (`specs/05-pages/chair/gsl.md`, "Actions and forms").
 *
 * Files under `$lib/server` only ever run on the server. The live room
 * (`chair`) and the GSL view (`chair/gsl`) draw the same floor, whose buttons
 * post to these actions by name (`?/nextSpeaker`, `?/timerPause` and so on).
 * A page spreads `floorActions` into its own `actions` and says where to send
 * the chair back to, so the pages cannot drift apart. The floor itself is
 * moved by `./speakers-lists.ts`, and the timer's arithmetic is in
 * `$lib/committee-room.ts`. The Mod and Single speaker views draw the same
 * floor on their own lists; in a moderated caucus a press of the speaker's
 * clock also moves the caucus clock, in the same update
 * (`$lib/caucus-floor.ts`, S7).
 */

import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import {
	ROOM_REFUSALS,
	TIMER_ADD_SECONDS,
	isSessionRunning,
	readTimerSeconds,
	speakingEntry,
	yieldCandidates,
	type ChairCommittee,
	type ChairRoomFrame
} from '$lib/chair-room';
import {
	pausedTimer,
	resetTimer,
	resumedTimer,
	startedTimer,
	timerWithAddedSeconds,
	type TimerSetting
} from '$lib/committee-room';
import { caucusClockColumns } from '$lib/caucus-clock';
import { caucusClockAfterAction } from '$lib/caucus-floor';
import { PRESSED_AT_FIELD, pressedMoment } from '$lib/clock-offset';
import type { Conference } from '$lib/conferences';
import type { Flash } from '$lib/flash';
import { isListOnTheFloor } from '$lib/gsl-floor';
import { NEW_ROW_ID_FIELD, readNewRowId } from '$lib/new-row-id';
import { requireCommitteePermission } from '$lib/server/access';
import {
	getActiveSpeakersList,
	getChairRoomFrame,
	timerColumns,
	updateCommitteeState,
	type CommitteeStateChanges
} from '$lib/server/committee-room';
import { setFlash } from '$lib/server/flash';
import { moveToNextSpeaker, yieldToChair, yieldToSeat } from '$lib/server/speakers-lists';

/** A request to an action of any chair page: its address carries both slugs. */
export type ChairRequestEvent = RequestEvent<{ slug: string; committeeSlug: string }>;

/** What every action reads before it does anything: the gate, then the room. */
export type OpenRoom = {
	/** The conference, whose first day and timezone name a new session. */
	conference: Conference;
	committee: ChairCommittee;
	frame: ChairRoomFrame;
};

/**
 * Where a page sends the chair once an action has worked: an address built by
 * a helper in `$lib/urls.ts`, such as the room or the list being shown.
 */
export type ReturnAddress = (event: ChairRequestEvent, frame: ChairRoomFrame) => string;

/**
 * The chair gate, asked again at the top of every action, then the room as it
 * is now. An action is its own request, so nothing `load` worked out reaches it.
 */
export async function openChairRoom(event: ChairRequestEvent): Promise<OpenRoom> {
	const { conference, committee } = await requireCommitteePermission(
		event.locals,
		event.url,
		event.params.slug,
		event.params.committeeSlug,
		'run_room'
	);
	const frame = await getChairRoomFrame(event.locals.supabase, committee.id);

	return { conference, committee, frame };
}

/** Refuse, staying on the page. The root layout shows `flash` as a toast. */
export function refuseChairAction(message: string) {
	return fail(400, { flash: { tone: 'error', message } satisfies Flash });
}

/**
 * Send the chair to `address`. `redirect` throws, which is how it stops the
 * action. A message, when there is one, travels in a cookie because a redirect
 * cannot carry anything else.
 */
export function returnTo(event: ChairRequestEvent, address: string, flash: Flash | null = null) {
	if (flash) setFlash(event.cookies, flash);

	redirect(303, address);
}

/**
 * The timer, "Next", "End speech" and yield actions, sending the chair back
 * to `returnAddress` once each has worked.
 */
export function floorActions(returnAddress: ReturnAddress) {
	/**
	 * The columns a press of the speaker's clock writes: its timer, and in a
	 * moderated caucus the caucus clock too, which runs only while the
	 * speaker's runs (`caucusClockAfterAction`). `action` is the press, such
	 * as `?/timerPause`. Outside a moderated caucus, the timer alone.
	 */
	function clockChanges(
		frame: ChairRoomFrame,
		setting: TimerSetting,
		action: string,
		pressed: Date
	): CommitteeStateChanges {
		const caucus = caucusClockAfterAction(frame.committeeState, action, pressed);

		if (caucus === null) return timerColumns(setting);

		return { ...timerColumns(setting), ...caucusClockColumns(caucus) };
	}

	/**
	 * Write a new timer for the press of `action`, or refuse with `refusal`
	 * when there was nothing to change.
	 */
	async function writeTimer(
		event: ChairRequestEvent,
		{ committee, frame }: OpenRoom,
		setting: TimerSetting | null,
		refusal: string,
		press: { action: string; pressed: Date }
	) {
		if (setting === null) return refuseChairAction(refusal);

		const changes = clockChanges(frame, setting, press.action, press.pressed);
		await updateCommitteeState(event.locals.supabase, committee.id, changes);

		returnTo(event, returnAddress(event, frame));
	}

	/**
	 * The speech is over and nobody new is called: the entry becomes `spoken`,
	 * and the speaker and the timer are cleared. "Yield to chair" and "End
	 * speech" both do this; one is the speaker's choice, the other the chair's.
	 */
	async function finishSpeech(event: ChairRequestEvent) {
		const { committee, frame } = await openChairRoom(event);
		const state = frame.committeeState;

		if (state.currentSpeakerEntryId === null) {
			return refuseChairAction(ROOM_REFUSALS.nobodySpeaking);
		}

		const list = await getActiveSpeakersList(event.locals.supabase, state, frame.seats);

		if (list.speakersList === null) return refuseChairAction(ROOM_REFUSALS.noSpeakersList);

		const listInRoom = { speakersList: list.speakersList, speakers: list.speakers };
		const now = new Date();
		const caucus = caucusClockAfterAction(state, '?/endSpeech', now);

		if (caucus === null) {
			await yieldToChair(event.locals.supabase, committee.id, state, listInRoom, now);
		} else {
			// In a moderated caucus the caucus clock pauses in the same update.
			const caucusColumns = caucusClockColumns(caucus);
			await yieldToChair(
				event.locals.supabase,
				committee.id,
				state,
				listInRoom,
				now,
				caucusColumns
			);
		}

		returnTo(event, returnAddress(event, frame));
	}

	/**
	 * The moment the chair pressed the button, which the timer is worked out
	 * from. The chair's browser sends it, so the stored timer is the one its
	 * screen already shows (`$lib/clock-offset.ts`); without it, now.
	 */
	function readPressedMoment(formData: FormData): Date {
		return pressedMoment(formData.get(PRESSED_AT_FIELD), new Date());
	}

	return {
		timerStart: async (event: ChairRequestEvent) => {
			const { committee, frame } = await openChairRoom(event);
			const formData = await event.request.formData();
			const seconds = readTimerSeconds(formData.get('seconds'));

			if (seconds === null) return refuseChairAction(ROOM_REFUSALS.timerSeconds);
			if (!isSessionRunning(frame.currentSession)) {
				return refuseChairAction(ROOM_REFUSALS.noSessionRunning);
			}

			const pressed = readPressedMoment(formData);
			const started = startedTimer(seconds, pressed);
			const changes = clockChanges(frame, started, '?/timerStart', pressed);
			await updateCommitteeState(event.locals.supabase, committee.id, changes);

			returnTo(event, returnAddress(event, frame));
		},

		timerPause: async (event: ChairRequestEvent) => {
			const room = await openChairRoom(event);
			const formData = await event.request.formData();
			const pressed = readPressedMoment(formData);
			const paused = pausedTimer(room.frame.committeeState.timer, pressed);
			const press = { action: '?/timerPause', pressed };

			return writeTimer(event, room, paused, ROOM_REFUSALS.timerNotRunning, press);
		},

		timerResume: async (event: ChairRequestEvent) => {
			const room = await openChairRoom(event);
			const formData = await event.request.formData();
			const pressed = readPressedMoment(formData);
			const resumed = resumedTimer(room.frame.committeeState.timer, pressed);
			const press = { action: '?/timerResume', pressed };

			return writeTimer(event, room, resumed, ROOM_REFUSALS.timerNotPaused, press);
		},

		timerAdd: async (event: ChairRequestEvent) => {
			const room = await openChairRoom(event);
			const formData = await event.request.formData();
			const seconds = readTimerSeconds(formData.get('seconds'), TIMER_ADD_SECONDS);

			if (seconds === null) return refuseChairAction(ROOM_REFUSALS.timerSeconds);

			const timer = room.frame.committeeState.timer;
			const pressed = readPressedMoment(formData);
			const longer = timerWithAddedSeconds(timer, seconds, pressed);

			return writeTimer(event, room, longer, ROOM_REFUSALS.noTimer, {
				action: '?/timerAdd',
				pressed
			});
		},

		timerReset: async (event: ChairRequestEvent) => {
			const room = await openChairRoom(event);
			const formData = await event.request.formData();
			const reset = resetTimer(room.frame.committeeState.timer);
			const press = { action: '?/timerReset', pressed: readPressedMoment(formData) };

			return writeTimer(event, room, reset, ROOM_REFUSALS.noTimer, press);
		},

		nextSpeaker: async (event: ChairRequestEvent) => {
			const { committee, frame } = await openChairRoom(event);
			const formData = await event.request.formData();
			const state = frame.committeeState;
			const list = await getActiveSpeakersList(event.locals.supabase, state, frame.seats);

			// An unmoderated caucus, a vote or a suspension has a list but calls
			// nobody from it, which `call_next_speaker` refuses too.
			if (list.speakersList === null || !isListOnTheFloor(state, list.speakersList.id)) {
				return refuseChairAction(ROOM_REFUSALS.noSpeakersList);
			}

			const listInRoom = { speakersList: list.speakersList, speakers: list.speakers };
			// The database gives the next present seat the floor with its clock
			// ready and not running, for the chair to start (S4).
			const outcome = await moveToNextSpeaker(
				event.locals.supabase,
				committee.id,
				state,
				listInRoom,
				readPressedMoment(formData)
			);
			const flash: Flash | null =
				outcome === 'empty' ? { tone: 'info', message: 'The list is empty.' } : null;

			returnTo(event, returnAddress(event, frame), flash);
		},

		yieldToChair: (event: ChairRequestEvent) => finishSpeech(event),

		// The chair's "End speech" (T128): the clock stops and the floor is
		// empty, without calling the next speaker as "Next speaker" would.
		endSpeech: (event: ChairRequestEvent) => finishSpeech(event),

		yieldToSeat: async (event: ChairRequestEvent) => {
			const { committee, frame } = await openChairRoom(event);
			const formData = await event.request.formData();
			const seatId = String(formData.get('seatId') ?? '');
			const state = frame.committeeState;

			if (state.currentSpeakerEntryId === null) {
				return refuseChairAction(ROOM_REFUSALS.nobodySpeaking);
			}

			const list = await getActiveSpeakersList(event.locals.supabase, state, frame.seats);

			if (list.speakersList === null) return refuseChairAction(ROOM_REFUSALS.noSpeakersList);

			// A speaker cannot yield to their own seat, or to a seat that is not in the room.
			const speaking = speakingEntry(list.speakers, state.currentSpeakerEntryId);
			const candidates = yieldCandidates(frame.seats, frame.attendance, speaking?.seat.id ?? null);

			if (!candidates.some((seat) => seat.id === seatId)) {
				return refuseChairAction(ROOM_REFUSALS.yieldSeat);
			}

			const listInRoom = { speakersList: list.speakersList, speakers: list.speakers };
			// The moment and the new entry's id the chair's screen already shows (T141).
			const pressed = readPressedMoment(formData);
			const entryId = readNewRowId(formData.get(NEW_ROW_ID_FIELD));
			await yieldToSeat(
				event.locals.supabase,
				committee.id,
				state,
				listInRoom,
				seatId,
				pressed,
				entryId
			);

			returnTo(event, returnAddress(event, frame));
		}
	};
}
