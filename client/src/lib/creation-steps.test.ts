import { describe, expect, it } from 'vitest';
import {
	continueLabel,
	creationSteps,
	CREATION_STEP_LABELS,
	furthestStep,
	isSavedCreationStep,
	shellSubtitle,
	shellTitle,
	stepAfter,
	stepBefore,
	stepFromPathname
} from './creation-steps';

describe('creationSteps', () => {
	it('marks the steps before the current one done and links them', () => {
		const steps = creationSteps('delft-mun-2027', 'when');

		expect(steps.map((step) => step.state)).toEqual([
			'done',
			'done',
			'current',
			'upcoming',
			'upcoming'
		]);
		expect(steps[0].href).toBe('/create');
		expect(steps[1].href).toBe('/create/delft-mun-2027/basics');
		expect(steps[2].href).toBeNull();
		expect(steps[4].href).toBeNull();
	});

	it('numbers the five steps and names them', () => {
		const steps = creationSteps(null, 'organization');

		expect(steps.map((step) => step.number)).toEqual([1, 2, 3, 4, 5]);
		expect(steps.map((step) => step.label)).toEqual(CREATION_STEP_LABELS.map((step) => step.label));
		expect(steps[0].state).toBe('current');
	});

	it('links nothing before the draft exists', () => {
		const steps = creationSteps(null, 'basics');

		expect(steps.every((step) => step.href === null)).toBe(true);
	});
});

describe('stepAfter and stepBefore', () => {
	it('walk the list in both directions', () => {
		expect(stepAfter('organization')).toBe('basics');
		expect(stepAfter('setup')).toBe('launch');
		expect(stepAfter('launch')).toBeNull();
		expect(stepBefore('basics')).toBe('organization');
		expect(stepBefore('organization')).toBeNull();
	});
});

describe('isSavedCreationStep', () => {
	it('accepts the four steps a draft records and nothing else', () => {
		expect(isSavedCreationStep('basics')).toBe(true);
		expect(isSavedCreationStep('launch')).toBe(true);
		expect(isSavedCreationStep('organization')).toBe(false);
		expect(isSavedCreationStep('')).toBe(false);
	});
});

describe('furthestStep', () => {
	it('never goes back behind the step already reached', () => {
		expect(furthestStep('basics', 'when')).toBe('when');
		expect(furthestStep('setup', 'basics')).toBe('setup');
		expect(furthestStep('launch', 'launch')).toBe('launch');
	});
});

describe('continueLabel', () => {
	it('names the next step in sentence case', () => {
		expect(continueLabel('organization')).toBe('Continue to basics');
		expect(continueLabel('basics')).toBe('Continue to when & where');
		expect(continueLabel('setup')).toBe('Continue to launch');
		expect(continueLabel('launch')).toBeNull();
	});
});

describe('stepFromPathname', () => {
	it('reads the step from the last segment of the address', () => {
		expect(stepFromPathname('/create')).toBe('organization');
		expect(stepFromPathname('/create/delft-mun-2027/basics')).toBe('basics');
		expect(stepFromPathname('/create/delft-mun-2027/when/')).toBe('when');
		expect(stepFromPathname('/create/delft-mun-2027')).toBe('organization');
	});
});

describe('shellTitle', () => {
	it('names the conference once it is being set up', () => {
		expect(shellTitle('organization', '')).toBe('Create a conference');
		expect(shellTitle('when', 'Delft MUN 2027')).toBe('Create a conference');
		expect(shellTitle('setup', 'Delft MUN 2027')).toBe('Set up Delft MUN 2027');
		expect(shellTitle('launch', 'Delft MUN 2027')).toBe('Ready to launch Delft MUN 2027');
	});
});

describe('shellSubtitle', () => {
	it('gives every step the sentence the mockups put under the title', () => {
		expect(shellSubtitle('organization')).toBe(
			"Start with the organisation. We'll use this to pre-fill your conference details."
		);
		expect(shellSubtitle('setup')).toBe(
			'Configure the rest. You can skip anything and change it later.'
		);
		expect(shellSubtitle('launch')).toBe(
			"Review what's ready and choose how to launch your conference."
		);
	});
});
