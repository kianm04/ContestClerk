/**
 * What the live room's suspended screen shows (`05-pages/chair/committee-room.md`,
 * "Suspended", S11, D6): its title with the suspend motion's reason, the
 * suspension's two moments, and the facts "When the session resumes: …" is
 * written from. The words themselves are `$lib/suspension.ts`'s, which the
 * projector and the phones share.
 *
 * Plain functions with no Svelte in them, so they can be read and tested on
 * their own.
 */

import { caucusClock, caucusSecondsLeft } from '$lib/caucus-clock';
import { speakingEntry, type CommitteeStateView, type RoomSpeaker } from '$lib/chair-room';
import { remainingSeconds, type CommitteeMode } from '$lib/committee-room';
import { resumeSentence, type ResumeFacts, type Suspension } from '$lib/suspension';

/** The sentences `suspend`, `setReturnTime` and `resume` refuse with (`committee-room.md`). */
export const SUSPENSION_REFUSALS = {
	alreadySuspended: 'The session is already suspended.',
	notSuspended: 'The session is not suspended.'
} as const;

/** "Suspended", or "Suspended for lunch" when a passed suspend motion gave a reason. */
export function suspendedTitle(reason: string | null): string {
	return reason === null ? 'Suspended' : `Suspended ${reason}`;
}

/**
 * The mode "Resume session" will put back. The room remembers it from the
 * moment it is suspended (`mode_before_suspension`). For the moment between
 * a press that did not say it (the frame's Suspend through `setMode`) and the
 * server's answer, the mode the page last read stands in, unless that was
 * already the suspension.
 */
export function modeToResume(
	state: CommitteeStateView,
	storedMode: CommitteeMode
): CommitteeMode | null {
	if (state.modeBeforeSuspension) return state.modeBeforeSuspension;

	return storedMode === 'suspended' ? null : storedMode;
}

/**
 * The suspension's two moments. Until the server has answered a Suspend that
 * did not say when it was pressed, the room counts from `now`: "0 min so far".
 */
export function suspensionOf(state: CommitteeStateView, now: Date): Suspension {
	return {
		suspendedAt: state.suspendedAt ?? now.toISOString(),
		suspendedUntil: state.suspendedUntil ?? null
	};
}

/**
 * What the suspended room will go back to, for "When the session resumes:
 * …" (`resumeSentence`). `entries` is the list the room was working
 * through, with its presses laid on top: who has the floor and who waits.
 * Both clocks are paused while suspended, so `now` changes nothing they show.
 */
export function resumeFactsOf(
	state: CommitteeStateView,
	storedMode: CommitteeMode,
	entries: RoomSpeaker[],
	voteSubject: string | null,
	now: Date
): ResumeFacts {
	const speaker = speakingEntry(entries, state.currentSpeakerEntryId);
	const caucus = state.caucusClock ? caucusClock(state.caucusClock) : null;

	return {
		mode: modeToResume(state, storedMode),
		speakerName: speaker?.seat.name ?? null,
		timerSecondsLeft: remainingSeconds(state.timer, now),
		waitingCount: entries.filter((entry) => entry.status === 'waiting').length,
		caucusSecondsLeft: caucus === null ? null : caucusSecondsLeft(caucus, now),
		voteSubject
	};
}

/** What the live room reads to draw the suspended screen, besides the clock. */
export type SuspendedScreenFacts = {
	/** The room's state with the presses on their way laid on top. */
	state: CommitteeStateView;
	/** The mode the page last read, before those presses (`modeToResume`). */
	storedMode: CommitteeMode;
	/** The list the room was working through, with its presses laid on top. */
	entries: RoomSpeaker[];
	/** The subject of the vote the room was on, or null. */
	voteSubject: string | null;
	/** "for lunch", from a passed suspend motion, or null. */
	reason: string | null;
};

/** Everything `SuspendedFloor.svelte` draws that the page works out. */
export type SuspendedScreenView = {
	title: string;
	suspension: Suspension;
	/** "When the session resumes: GSL, China with 0:52 left". */
	resumeSentence: string;
};

/** The suspended screen's title, its two moments and what "Resume session" brings back. */
export function suspendedScreenView(facts: SuspendedScreenFacts, now: Date): SuspendedScreenView {
	const resumeFacts = resumeFactsOf(
		facts.state,
		facts.storedMode,
		facts.entries,
		facts.voteSubject,
		now
	);

	return {
		title: suspendedTitle(facts.reason),
		suspension: suspensionOf(facts.state, now),
		resumeSentence: resumeSentence(resumeFacts)
	};
}
