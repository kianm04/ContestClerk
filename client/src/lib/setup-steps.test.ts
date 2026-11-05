import { describe, expect, it } from 'vitest';
import type { PublishChecklistLine } from './publish-checklist';
import {
	areRequiredStepsDone,
	findSetupStep,
	nextSetupStepAfter,
	previousSetupStep,
	setupProgressFromChecklist,
	setupStepEyebrow,
	setupStepFooterText,
	setupSteps,
	stepToContinue,
	stepUrlAfter,
	type SetupProgress
} from './setup-steps';

/** A draft with nothing done yet. */
const NOTHING_DONE: SetupProgress = {
	details: false,
	committees: false,
	applicationForm: false,
	fees: false,
	team: false
};

/** The six steps of `thimun-2027`, set up as far as `progress`. */
function stepsOf(progress: Partial<SetupProgress> = {}) {
	return setupSteps('thimun-2027', { ...NOTHING_DONE, ...progress });
}

/** One line of the publish checklist, with only what these tests read filled in. */
function checklistLine(key: PublishChecklistLine['key'], isDone: boolean): PublishChecklistLine {
	return { key, label: key, isDone, isRequired: true, actionLabel: 'Open' };
}

describe('setupSteps', () => {
	it('lists the six steps in order, each pointing at its page', () => {
		const steps = stepsOf();

		expect(steps.map((step) => [step.number, step.label, step.href])).toEqual([
			[1, 'Details', '/manage/thimun-2027/details'],
			[2, 'Committees', '/manage/thimun-2027/committees'],
			[3, 'Application form', '/manage/thimun-2027/application-form'],
			[4, 'Fees', '/manage/thimun-2027/fees'],
			[5, 'Team', '/manage/thimun-2027/team'],
			[6, 'Publish', '/manage/thimun-2027/publish']
		]);
	});

	it('marks Fees and Team optional', () => {
		const optional = stepsOf().filter((step) => step.isOptional);

		expect(optional.map((step) => step.key)).toEqual(['fees', 'team']);
	});

	it('ticks the steps that are done, and never Publish', () => {
		const steps = stepsOf({ details: true, fees: true });
		const done = steps.filter((step) => step.isDone);

		expect(done.map((step) => step.key)).toEqual(['details', 'fees']);
	});

	it('locks Publish until Details, Committees and Application form are all done', () => {
		const twoOfThree = stepsOf({ details: true, committees: true, fees: true, team: true });
		const allThree = stepsOf({ details: true, committees: true, applicationForm: true });

		expect(findSetupStep(twoOfThree, 'publish').isLocked).toBe(true);
		expect(findSetupStep(allThree, 'publish').isLocked).toBe(false);
	});
});

describe('areRequiredStepsDone', () => {
	it('needs Details, Committees and Application form, and nothing else', () => {
		const required = { ...NOTHING_DONE, details: true, committees: true, applicationForm: true };
		const optionalOnly = { ...NOTHING_DONE, fees: true, team: true };

		expect(areRequiredStepsDone(required)).toBe(true);
		expect(areRequiredStepsDone(optionalOnly)).toBe(false);
	});
});

describe('stepToContinue', () => {
	it('is the first required step that is not done', () => {
		expect(stepToContinue(stepsOf()).key).toBe('details');
		expect(stepToContinue(stepsOf({ details: true })).key).toBe('committees');
	});

	it('skips the optional steps', () => {
		const steps = stepsOf({ details: true, committees: true, applicationForm: true });

		expect(stepToContinue(steps).key).toBe('publish');
	});

	it('goes back to a required step left undone, however far the others got', () => {
		const steps = stepsOf({ details: true, applicationForm: true, fees: true, team: true });

		expect(stepToContinue(steps).key).toBe('committees');
	});
});

describe('moving between steps', () => {
	it('finds the step after and before', () => {
		const steps = stepsOf();
		const fees = findSetupStep(steps, 'fees');

		expect(nextSetupStepAfter(steps, fees)?.key).toBe('team');
		expect(previousSetupStep(steps, fees)?.key).toBe('application-form');
	});

	it('has nothing before Details and nothing after Publish', () => {
		const steps = stepsOf();

		expect(previousSetupStep(steps, findSetupStep(steps, 'details'))).toBeNull();
		expect(nextSetupStepAfter(steps, findSetupStep(steps, 'publish'))).toBeNull();
	});
});

describe('stepUrlAfter', () => {
	it('is the next page in order, whether or not it is done', () => {
		expect(stepUrlAfter('thimun-2027', 'details')).toBe('/manage/thimun-2027/committees');
		expect(stepUrlAfter('thimun-2027', 'team')).toBe('/manage/thimun-2027/publish');
	});

	it('is null after Publish', () => {
		expect(stepUrlAfter('thimun-2027', 'publish')).toBeNull();
	});
});

describe('the words around a setup page', () => {
	it('says which step it is above the title, and whether it is optional', () => {
		const steps = stepsOf();

		expect(setupStepEyebrow(findSetupStep(steps, 'details'))).toBe('Step 1 of 6');
		expect(setupStepEyebrow(findSetupStep(steps, 'fees'))).toBe('Step 4 of 6 · optional');
	});

	it('names the next step in the footer', () => {
		const steps = stepsOf();

		expect(setupStepFooterText(steps, findSetupStep(steps, 'fees'))).toBe(
			'Step 4 of 6 · next: team'
		);
		expect(setupStepFooterText(steps, findSetupStep(steps, 'team'))).toBe(
			'Step 5 of 6 · next: publish'
		);
		expect(setupStepFooterText(steps, findSetupStep(steps, 'publish'))).toBe('Step 6 of 6');
	});
});

describe('setupProgressFromChecklist', () => {
	it('reads the four steps off their checklist lines, and Team from the team', () => {
		const lines = [
			checklistLine('committees', true),
			checklistLine('details', false),
			checklistLine('application-window', true),
			checklistLine('fees', true),
			checklistLine('publish', false)
		];

		expect(setupProgressFromChecklist(lines, true)).toEqual({
			details: false,
			committees: true,
			applicationForm: true,
			fees: true,
			team: true
		});
	});

	it('leaves a step undone when its line is missing', () => {
		expect(setupProgressFromChecklist([], false)).toEqual(NOTHING_DONE);
	});
});
