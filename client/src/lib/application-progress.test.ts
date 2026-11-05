import { describe, expect, it } from 'vitest';
import {
	applicationProgress,
	type ApplicationProgress,
	type ProgressInput,
	type ProgressStepState
} from './application-progress';

/**
 * A submitted application with no seat yet. Tests spread it and change only
 * the fields they are about.
 */
const SUBMITTED: ProgressInput = {
	status: 'submitted',
	wasSubmitted: true,
	hasSeat: false,
	canFinish: false
};

/** The state of each of the four steps, Draft first, so a test can compare them in one line. */
function stepStates(progress: ApplicationProgress): ProgressStepState[] {
	return progress.steps.map((step) => step.state);
}

/** The labels of the steps written in the tone's colour, which should be at most one. */
function emphasisedLabels(progress: ApplicationProgress): string[] {
	const emphasisedSteps = progress.steps.filter((step) => step.isEmphasised);

	return emphasisedSteps.map((step) => step.label);
}

describe('applicationProgress', () => {
	it('always names the same four steps, joined by three connectors', () => {
		const progress = applicationProgress(SUBMITTED);

		const labels = progress.steps.map((step) => step.label);

		expect(labels).toEqual(['Draft', 'Submitted', 'Outcome', 'Allocation']);
		expect(progress.connectors).toHaveLength(3);
	});

	it('finishes every step of an accepted application that has its seat', () => {
		const progress = applicationProgress({ ...SUBMITTED, status: 'accepted', hasSeat: true });

		expect(progress.tone).toBe('success');
		expect(stepStates(progress)).toEqual(['done', 'done', 'done', 'done']);
		expect(emphasisedLabels(progress)).toEqual([]);
		expect(progress.connectors).toEqual(['done', 'done', 'done']);
	});

	it('leaves Allocation current for an accepted application still waiting for its seat', () => {
		const progress = applicationProgress({ ...SUBMITTED, status: 'accepted', hasSeat: false });

		expect(progress.tone).toBe('success');
		expect(stepStates(progress)).toEqual(['done', 'done', 'done', 'current']);
		expect(emphasisedLabels(progress)).toEqual([]);
		// Every line up to Allocation is drawn in full, because Allocation itself is reached.
		expect(progress.connectors).toEqual(['done', 'done', 'done']);
	});

	it('waits at Outcome for a submitted application, with the line towards it part drawn', () => {
		const progress = applicationProgress(SUBMITTED);

		expect(progress.tone).toBe('warning');
		expect(stepStates(progress)).toEqual(['done', 'done', 'current', 'upcoming']);
		// The wait is the organisers', so nothing is written in the tone's colour.
		expect(emphasisedLabels(progress)).toEqual([]);
		expect(progress.connectors).toEqual(['done', 'done', 'partial']);
	});

	it('draws a waitlisted application the same way as a submitted one', () => {
		const progress = applicationProgress({ ...SUBMITTED, status: 'waitlisted' });

		expect(progress.tone).toBe('warning');
		expect(stepStates(progress)).toEqual(['done', 'done', 'current', 'upcoming']);
		expect(emphasisedLabels(progress)).toEqual([]);
		expect(progress.connectors).toEqual(['done', 'done', 'partial']);
	});

	it('stops a rejected application at Outcome, in neutral grey rather than red', () => {
		const progress = applicationProgress({ ...SUBMITTED, status: 'rejected' });

		expect(progress.tone).toBe('neutral');
		expect(stepStates(progress)).toEqual(['done', 'done', 'done', 'upcoming']);
		expect(emphasisedLabels(progress)).toEqual([]);
		// Nothing moves on from a decision that is final, so the last line is not drawn at all.
		expect(progress.connectors).toEqual(['done', 'done', 'upcoming']);
	});

	it('stops an application withdrawn after it was sent at Submitted', () => {
		const progress = applicationProgress({
			...SUBMITTED,
			status: 'withdrawn',
			wasSubmitted: true
		});

		expect(progress.tone).toBe('neutral');
		expect(stepStates(progress)).toEqual(['done', 'done', 'upcoming', 'upcoming']);
		expect(emphasisedLabels(progress)).toEqual([]);
		expect(progress.connectors).toEqual(['done', 'upcoming', 'upcoming']);
	});

	it('stops an application withdrawn before it was ever sent at Draft', () => {
		const progress = applicationProgress({
			...SUBMITTED,
			status: 'withdrawn',
			wasSubmitted: false
		});

		expect(progress.tone).toBe('neutral');
		expect(stepStates(progress)).toEqual(['done', 'upcoming', 'upcoming', 'upcoming']);
		expect(emphasisedLabels(progress)).toEqual([]);
		expect(progress.connectors).toEqual(['upcoming', 'upcoming', 'upcoming']);
	});

	it('marks an open draft red, emphasises its Draft step and part draws the line to Submitted', () => {
		const progress = applicationProgress({
			...SUBMITTED,
			status: 'draft',
			wasSubmitted: false,
			canFinish: true
		});

		expect(progress.tone).toBe('danger');
		expect(stepStates(progress)).toEqual(['done', 'upcoming', 'upcoming', 'upcoming']);
		// An open draft is the only case where the wait is the reader's own.
		expect(emphasisedLabels(progress)).toEqual(['Draft']);
		expect(progress.connectors).toEqual(['partial', 'upcoming', 'upcoming']);
	});

	it('leaves a draft that can no longer be sent neutral, with nothing emphasised or moving', () => {
		const progress = applicationProgress({
			...SUBMITTED,
			status: 'draft',
			wasSubmitted: false,
			canFinish: false
		});

		expect(progress.tone).toBe('neutral');
		expect(stepStates(progress)).toEqual(['done', 'upcoming', 'upcoming', 'upcoming']);
		expect(emphasisedLabels(progress)).toEqual([]);
		expect(progress.connectors).toEqual(['upcoming', 'upcoming', 'upcoming']);
	});
});
