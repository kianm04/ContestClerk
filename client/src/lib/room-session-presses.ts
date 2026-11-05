/**
 * What the live room's own presses are expected to change, worked out in the
 * browser at the moment of the press, so `chair` switches to the suspended
 * screen, back to the live view, or to a new return time at once (T141,
 * `specs/05-pages/chair/committee-room.md`, "Actions and forms").
 *
 * Each function does what the server action of the same name does
 * (`suspend`, `resume` and `setReturnTime` in the live room's
 * `+page.server.ts`, through `suspendRoom`, `resumeRoom` and
 * `setSuspensionReturn` in `$lib/server/committee-room.ts`), so the screen
 * shows what the database will hold. The floor's and the queue's presses are
 * `$lib/room-presses.ts`.
 */

import { caucusClockAfterPress, CLEARED_CAUCUS_CLOCK } from '$lib/caucus-clock';
import type { ChairExpectation } from '$lib/chair-form';
import type { CommitteeStateView } from '$lib/chair-room';
import { pausedTimer } from '$lib/committee-room';
import { readReturnTime } from '$lib/suspension';

/**
 * "Suspend": the room is suspended at the press and remembers the mode it
 * leaves. Whichever clock is running, the speaker's or a moderated caucus's,
 * is paused at what it has left; a paused clock stays as it is. The speaker,
 * the lists, the motion and the vote are kept. Null for a room that is
 * suspended already, which the server leaves as it is.
 */
export function suspendPress(state: CommitteeStateView, pressed: Date): ChairExpectation | null {
	if (state.mode === 'suspended') return null;

	const caucusClock = state.caucusClock ?? CLEARED_CAUCUS_CLOCK;

	return {
		state: {
			mode: 'suspended',
			modeBeforeSuspension: state.mode,
			suspendedAt: pressed.toISOString(),
			suspendedUntil: null,
			// `pausedTimer` answers null for a clock that is not running, which stays as it is.
			timer: pausedTimer(state.timer, pressed) ?? state.timer,
			caucusClock: caucusClockAfterPress(caucusClock, 'suspend', pressed)
		}
	};
}

/**
 * "Resume session": the mode that was suspended comes back, formal debate
 * when none is on record, and the suspension is cleared. Both clocks stay
 * paused, so nothing else changes.
 */
export function resumePress(state: CommitteeStateView): ChairExpectation {
	return {
		state: {
			mode: state.modeBeforeSuspension ?? 'formal_debate',
			suspendedAt: null,
			suspendedUntil: null,
			modeBeforeSuspension: null
		}
	};
}

/**
 * A return time on the suspended screen: one of the minute buttons, or the
 * time field and "Set". The form's fields are read by the same rule as the
 * server's (`readReturnTime`), in the conference's timezone. Null for a time
 * the server would refuse, which the screen then leaves to its answer.
 */
export function returnTimePress(
	formData: FormData,
	pressed: Date,
	timezone: string
): ChairExpectation | null {
	const reading = readReturnTime(
		formData.get('minutes'),
		formData.get('backAt'),
		pressed,
		timezone
	);

	if (reading.suspendedUntil === null) return null;

	return { state: { suspendedUntil: reading.suspendedUntil } };
}
