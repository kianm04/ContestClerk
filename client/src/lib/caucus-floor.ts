/**
 * How the floor's presses move a moderated caucus's own clock
 * (`specs/05-pages/chair/mod.md`, "What changes which clock"): the caucus
 * clock runs only while the speaker's clock runs, so the time between
 * speakers is not lost.
 *
 * The server's floor actions (`$lib/server/chair-floor-actions.ts`) write
 * what `caucusClockAfterAction` answers in the same update as the speaker's
 * clock, and the Mod view's presses (`$lib/caucus-presses.ts`) draw the same
 * answer at once, so the screen and the database agree on both clocks. The
 * arithmetic itself is `$lib/caucus-clock.ts`. Plain functions, with nothing
 * that only works in the browser, so the server can import this file.
 */

import type { CommitteeStateView } from '$lib/chair-room';
import {
	caucusClockAfterPress,
	type CaucusClockSetting,
	type SpeakerClockPress
} from '$lib/caucus-clock';

/** The seconds "Extend +5:00" adds to the caucus clock. */
export const CAUCUS_EXTENSION_SECONDS = 300;

/** The press each floor action makes on the speaker's clock, by the action it posts to. */
const SPEAKER_CLOCK_PRESSES: Record<string, SpeakerClockPress> = {
	'?/timerStart': 'start',
	'?/timerResume': 'resume',
	'?/timerPause': 'pause',
	'?/timerAdd': 'addTime',
	'?/timerReset': 'reset',
	'?/endSpeech': 'endSpeech',
	'?/yieldToChair': 'endSpeech',
	'?/nextSpeaker': 'next',
	'?/speakNow': 'next'
};

/**
 * The caucus clock after a press of the floor's `action` (such as
 * `?/timerPause`) in a moderated caucus: Start and Resume run it; Pause, End
 * speech, Next, Call and Reset clock pause it; +15 s leaves it alone. Null
 * outside a moderated caucus, or for an action that is not one of the
 * floor's, which then leaves the caucus clock as it is.
 */
export function caucusClockAfterAction(
	state: Pick<CommitteeStateView, 'mode' | 'caucusClock'>,
	action: string,
	now: Date
): CaucusClockSetting | null {
	const press = SPEAKER_CLOCK_PRESSES[action];

	if (state.mode !== 'moderated_caucus' || state.caucusClock === undefined) return null;
	if (press === undefined) return null;

	return caucusClockAfterPress(state.caucusClock, press, now);
}
