/**
 * Starting a mode from its own view: the start forms of the Mod, Unmod and
 * Single speaker views (`specs/05-pages/chair/mod.md`, `unmod.md` and
 * `single-speaker.md`, "Components" and "States"). Whether the room is
 * running the view's mode, what starting it would end, why its start button
 * is disabled, and the sentences the start actions refuse with.
 *
 * Plain functions with no Svelte in them, so the pages, the actions and the
 * tests all ask the same rules.
 */

import type { CommitteeStateView } from '$lib/chair-room';
import type { CommitteeMode } from '$lib/committee-room';

/** The modes a console view starts from its own form. */
export type StartableMode = 'moderated_caucus' | 'unmoderated_caucus' | 'single_speaker';

/** The room's state as far as these rules read it. */
export type StartRoomState = Pick<CommitteeStateView, 'mode' | 'modeBeforeSuspension'>;

/** What decides whether the start button can be pressed. */
export type StartBlockFacts = {
	/** The room is suspended, so nothing starts until the session resumes. */
	isSuspended: boolean;
	/** A vote of the session is still open, which has to be closed first. */
	hasOpenVote: boolean;
};

/** The sentences the start actions refuse with, the same words the disabled button shows. */
export const START_REFUSALS = {
	noSession: 'Start a session first.',
	openVote: 'Close the open vote first.',
	suspended: 'Resume the session first.'
} as const;

/**
 * The live modes a start ends, as the line above the start button names
 * them: "Starting this ends the unmoderated caucus." Formal debate is not
 * here: its waiting speakers keep their places, so starting ends nothing a
 * chair has to be told about.
 */
const ENDED_MODE_NAMES: Partial<Record<CommitteeMode, string>> = {
	moderated_caucus: 'the moderated caucus',
	unmoderated_caucus: 'the unmoderated caucus',
	single_speaker: 'the single speaker',
	voting: 'the vote'
};

/**
 * Whether the view of `mode` draws its running mode rather than its start
 * form: the room is in that mode, or suspended from it (the floor then says
 * it resumes with the session, and its list still works).
 */
export function isModeRunning(state: StartRoomState, mode: StartableMode): boolean {
	if (state.mode === mode) return true;

	return isSuspendedIn(state, mode);
}

/** Whether the room is suspended in the middle of `mode`. */
export function isSuspendedIn(state: StartRoomState, mode: StartableMode): boolean {
	return state.mode === 'suspended' && state.modeBeforeSuspension === mode;
}

/**
 * What starting `starting` would end, written for the line above the start
 * button ("the unmoderated caucus"), or null when it ends nothing worth
 * saying: formal debate, no session, or a suspension (which blocks the start
 * instead).
 */
export function endedModeName(liveMode: CommitteeMode, starting: StartableMode): string | null {
	if (liveMode === starting) return null;

	return ENDED_MODE_NAMES[liveMode] ?? null;
}

/** The line above the start button: "Starting this ends the unmoderated caucus." */
export function startEndsSentence(endedName: string): string {
	return `Starting this ends ${endedName}.`;
}

/**
 * Why the start button is disabled, in the words drawn under it and refused
 * with by the server, or null when it can be pressed. A suspension comes
 * first, because resuming is what the chair has to do before anything else.
 */
export function startBlockedReason(facts: StartBlockFacts): string | null {
	if (facts.isSuspended) return START_REFUSALS.suspended;
	if (facts.hasOpenVote) return START_REFUSALS.openVote;

	return null;
}

/**
 * The one line above the start button: why it is disabled, or else what
 * starting ends, or null for neither.
 */
export function lineAboveStartButton(
	blockedReason: string | null,
	endedName: string | null
): string | null {
	if (blockedReason !== null) return blockedReason;
	if (endedName === null) return null;

	return startEndsSentence(endedName);
}
