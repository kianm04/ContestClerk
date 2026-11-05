/**
 * The live strip's lines for the Mod, Unmod and Single speaker views
 * (`specs/05-pages/chair/committee-room.md`, "Live strip"): a moderated
 * caucus's own clock after the speaker ("Mod · Kenya · 0:31 · caucus 6:12
 * left"), "End caucus" as its primary once the caucus time is up, "Return to
 * GSL" once nobody waits for a single speaker, and where those two post.
 *
 * The strip's other words and buttons are `liveStripLine` and
 * `liveStripControls` in `$lib/chair-frame.ts`; this file only adds what the
 * three modes need. Plain functions with no Svelte in them.
 */

import type { LiveStripControls, LiveStripRoom } from '$lib/chair-frame';
import { caucusClock, isCaucusTimeUp, type CaucusClockSetting } from '$lib/caucus-clock';
import type { ModeRoomState } from '$lib/caucus-presses';
import { caucusStripText } from '$lib/caucus-view';
import type { ChairPage } from '$lib/live-mode';
import { chairFrameAction } from '$lib/urls';

/** The live room's two actions that end a mode, as the strip posts them from the page it is on. */
export type ModeEndActions = {
	endCaucus: string;
	returnToGsl: string;
};

/** What the strip's clock and primary need to know about the live mode. */
export type StripModeFacts = {
	/** The room's state as shown, which "End caucus" and "Return to GSL" change at the press (`backToGslPress`). */
	state: ModeRoomState;
	/** The session's General Speakers' List, which those two put back. */
	generalListId: string | null;
	/** A moderated caucus's own clock, which the clock and "Next" move too; null outside one. */
	caucusClock: CaucusClockSetting | null;
	/** Where "End caucus" and "Return to GSL" post (`modeEndActions`). */
	endActions: ModeEndActions;
};

/** The action the strip's primary posts: "Next" or "Call", "End caucus", or "Return to GSL". */
export type StripPrimaryAction = 'nextSpeaker' | 'endCaucus' | 'returnToGsl';

/** The strip's buttons, with a primary that may also return the room to the GSL. */
export type ModeStripControls = Omit<LiveStripControls, 'primary'> & {
	primary: { label: string; action: StripPrimaryAction } | null;
};

/**
 * Where the strip's "End caucus" and "Return to GSL" post: the live room's
 * actions, naming the page the chair is on (`chairFrameAction`). Both change
 * what the room is doing, so the chair lands on the live room.
 */
export function modeEndActions(
	conferenceSlug: string,
	committeeSlug: string,
	fromView: ChairPage
): ModeEndActions {
	return {
		endCaucus: chairFrameAction(conferenceSlug, committeeSlug, 'endCaucus', fromView),
		returnToGsl: chairFrameAction(conferenceSlug, committeeSlug, 'returnToGsl', fromView)
	};
}

/**
 * The strip's words: in a moderated caucus the caucus's own clock follows,
 * "Mod · Kenya · 0:31 · caucus 6:12 left"; otherwise the words as they are.
 */
export function modeStripText(
	text: string,
	live: Pick<LiveStripRoom, 'mode'>,
	setting: CaucusClockSetting | undefined,
	now: Date
): string {
	const caucusText = live.mode === 'moderated_caucus' ? caucusStripText(setting, now) : null;

	return caucusText === null ? text : `${text} · ${caucusText}`;
}

/**
 * The strip's buttons for the live mode: as `liveStripControls` gives them,
 * with the primary its view has (`mod.md`, `single-speaker.md`): "End caucus"
 * once a moderated caucus's time is up, and "Return to GSL" once nobody waits
 * for a single speaker.
 */
export function modeStripControls(
	controls: LiveStripControls,
	live: Pick<LiveStripRoom, 'mode'>,
	setting: CaucusClockSetting | undefined,
	now: Date
): ModeStripControls {
	const clock = live.mode === 'moderated_caucus' && setting ? caucusClock(setting) : null;

	if (clock !== null && isCaucusTimeUp(clock, now)) {
		return { ...controls, primary: { label: 'End caucus', action: 'endCaucus' } };
	}

	if (live.mode === 'single_speaker' && controls.primary === null) {
		return { ...controls, primary: { label: 'Return to GSL', action: 'returnToGsl' } };
	}

	return controls;
}

/** Where the strip's primary posts, by its action. */
export function stripPrimaryAddress(
	action: StripPrimaryAction | undefined,
	nextSpeakerAction: string,
	endActions: ModeEndActions
): string {
	if (action === 'endCaucus') return endActions.endCaucus;
	if (action === 'returnToGsl') return endActions.returnToGsl;

	return nextSpeakerAction;
}
