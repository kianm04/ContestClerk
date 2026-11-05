/**
 * The chair's timer as it will be once the server has done the button just
 * pressed, worked out in the browser so the clock moves the moment the chair
 * presses instead of after the round trip.
 *
 * The prediction is certain: `timerAfterPress` does the same sums with the
 * same functions as the server's timer actions in
 * `$lib/server/chair-floor-actions.ts`, from the same stored setting and the
 * same moment, because the press carries the moment it happened to the server
 * (`$lib/clock-offset.ts`). The press keeps the timer it predicts as part of
 * what it is expected to change (`$lib/chair-form.ts`). When the answer
 * arrives the prediction is dropped and the stored timer is shown again, which
 * is the same timer, so the clock does not move. Dropping it is also what puts
 * the screen right if the server refused.
 */
import { TIMER_ADD_SECONDS } from '$lib/chair-room';
import {
	pausedTimer,
	resetTimer,
	resumedTimer,
	startedTimer,
	timerWithAddedSeconds,
	type TimerSetting
} from '$lib/committee-room';

/**
 * The timer after the press that posts to `formAction`, such as
 * `?/timerPause`, from `setting` at the moment `now`. `startSeconds` is what
 * "Start timer" starts. Null when the press would change nothing (pausing a
 * paused timer, say), or `formAction` is not a timer button.
 */
export function timerAfterPress(
	formAction: string,
	setting: TimerSetting,
	startSeconds: number,
	now: Date
): TimerSetting | null {
	switch (formAction) {
		case '?/timerStart':
			return startedTimer(startSeconds, now);
		case '?/timerPause':
			return pausedTimer(setting, now);
		case '?/timerResume':
			return resumedTimer(setting, now);
		case '?/timerAdd':
			return timerWithAddedSeconds(setting, TIMER_ADD_SECONDS, now);
		case '?/timerReset':
			return resetTimer(setting);
		default:
			return null;
	}
}
