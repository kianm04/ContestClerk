/**
 * The four-step progress line on each card at `/applications`: Draft,
 * Submitted, Outcome, Allocation. It is worked out here, away from the
 * component that draws it, so it can be read and tested without Svelte.
 *
 * `specs/05-pages/delegate/applications.md` shows each status's line.
 */

import type { ApplicationStatus } from '$lib/applications';
import type { DelegationStatus } from '$lib/delegations';

/**
 * The colour of a card's status and of its progress line. Red (`danger`)
 * means "you have something to do" on this page, so an application that is
 * over — not accepted, withdrawn, or a draft that can no longer be sent — is
 * `neutral` rather than red: there is nothing left to do about it.
 */
export type ProgressTone = 'success' | 'warning' | 'danger' | 'neutral';

/** One of the four steps: reached and past, where things stand now, or still to come. */
export type ProgressStepState = 'done' | 'current' | 'upcoming';

/**
 * The line between two steps. `partial` is drawn part of the way, as the line
 * leaving the last step that was reached.
 */
export type ProgressConnector = 'done' | 'partial' | 'upcoming';

export type ProgressStep = {
	label: string;
	state: ProgressStepState;
	/** The step that is waiting for the reader, whose label is written in the tone's colour. */
	isEmphasised: boolean;
};

export type ApplicationProgress = {
	tone: ProgressTone;
	steps: ProgressStep[];
	/** Always one fewer than `steps`: `connectors[0]` joins steps 0 and 1. */
	connectors: ProgressConnector[];
};

/** What the progress line needs to know about one application or delegation. */
export type ProgressInput = {
	status: ApplicationStatus | DelegationStatus;
	/** Whether the application was ever sent, which a withdrawn one may or may not have been. */
	wasSubmitted: boolean;
	/** Whether a seat has been given, which is what the last step, Allocation, is. */
	hasSeat: boolean;
	/** Whether the reader can still finish and send this draft. */
	canFinish: boolean;
};

const STEP_LABELS = ['Draft', 'Submitted', 'Outcome', 'Allocation'];

/** The tone of the whole line, following the status. */
function progressTone(input: ProgressInput): ProgressTone {
	if (input.status === 'accepted') {
		return 'success';
	}

	if (input.status === 'submitted' || input.status === 'waitlisted') {
		return 'warning';
	}

	if (input.status === 'draft' && input.canFinish) {
		return 'danger';
	}

	return 'neutral';
}

/**
 * How far along the line the application has come: the index of the last step
 * it has reached, and whether that step is finished (`done`) or is where the
 * application waits (`current`).
 */
function lastReachedStep(input: ProgressInput): { index: number; state: ProgressStepState } {
	if (input.status === 'accepted') {
		// Accepted is the outcome; the seat is the last step, done once it is given.
		return input.hasSeat ? { index: 3, state: 'done' } : { index: 3, state: 'current' };
	}

	if (input.status === 'rejected') {
		return { index: 2, state: 'done' };
	}

	if (input.status === 'submitted' || input.status === 'waitlisted') {
		// Sent and waiting for the organisers to decide.
		return { index: 2, state: 'current' };
	}

	if (input.status === 'withdrawn' && input.wasSubmitted) {
		return { index: 1, state: 'done' };
	}

	// A draft, or an application withdrawn before it was ever sent.
	return { index: 0, state: 'done' };
}

/** The state of each step, given how far the application has come. */
function stepState(
	stepIndex: number,
	lastReached: number,
	lastState: ProgressStepState
): ProgressStepState {
	if (stepIndex < lastReached) {
		return 'done';
	}

	if (stepIndex === lastReached) {
		return lastState;
	}

	return 'upcoming';
}

/**
 * The line leaving the last step reached is drawn part of the way while the
 * application is still moving: a draft on its way to being sent, or a decision
 * on its way. An application that has stopped — not accepted, withdrawn, or a
 * draft that can no longer be sent — has nothing moving on from it.
 */
function isStillMoving(input: ProgressInput): boolean {
	if (input.status === 'draft') {
		return input.canFinish;
	}

	return input.status === 'submitted' || input.status === 'waitlisted';
}

/** The whole progress line for one card. */
export function applicationProgress(input: ProgressInput): ApplicationProgress {
	const lastReached = lastReachedStep(input);
	const isMoving = isStillMoving(input);

	const steps = STEP_LABELS.map((label, stepIndex) => ({
		label,
		state: stepState(stepIndex, lastReached.index, lastReached.state),
		// Only an open draft waits for the reader; every other wait is the organisers'.
		isEmphasised: stepIndex === 0 && input.status === 'draft' && input.canFinish
	}));

	const connectors: ProgressConnector[] = [];

	for (let connectorIndex = 0; connectorIndex < STEP_LABELS.length - 1; connectorIndex++) {
		if (connectorIndex < lastReached.index) {
			connectors.push('done');
		} else if (connectorIndex === lastReached.index && isMoving) {
			connectors.push('partial');
		} else {
			connectors.push('upcoming');
		}
	}

	return { tone: progressTone(input), steps, connectors };
}
