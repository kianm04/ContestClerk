import { describe, expect, it } from 'vitest';
import {
	applicationAfterDecision,
	panelFacts,
	panelMetaLine,
	panelNeighbours,
	panelPosition,
	pickPanelIndex,
	readPanelApplicationId,
	type PanelFactSource
} from './application-panel';

const ROW_IDS = ['louis', 'amani', 'felix', 'sofia'];

describe('readPanelApplicationId', () => {
	it('reads the application the address names', () => {
		expect(readPanelApplicationId(new URLSearchParams('status=waitlisted&application=amani'))).toBe(
			'amani'
		);
	});

	it('is null when the address names none, or names it with nothing', () => {
		expect(readPanelApplicationId(new URLSearchParams('status=waitlisted'))).toBeNull();
		expect(readPanelApplicationId(new URLSearchParams('application=%20'))).toBeNull();
	});
});

describe('pickPanelIndex', () => {
	it('shows the application the address names', () => {
		expect(pickPanelIndex(ROW_IDS, 'felix')).toBe(2);
	});

	it('shows the first row when the address names none', () => {
		expect(pickPanelIndex(ROW_IDS, null)).toBe(0);
	});

	it('shows the first row when the named application is not on this page', () => {
		// Decided since, or on another tab: the panel does not go blank.
		expect(pickPanelIndex(ROW_IDS, 'somebody-else')).toBe(0);
	});

	it('shows nothing when the page has no rows', () => {
		expect(pickPanelIndex([], 'louis')).toBeNull();
	});
});

describe('panelNeighbours', () => {
	it('names the rows above and below', () => {
		expect(panelNeighbours(ROW_IDS, 1)).toEqual({ previousId: 'louis', nextId: 'felix' });
	});

	it('has no previous row on the first and no next row on the last', () => {
		expect(panelNeighbours(ROW_IDS, 0)).toEqual({ previousId: null, nextId: 'amani' });
		expect(panelNeighbours(ROW_IDS, 3)).toEqual({ previousId: 'felix', nextId: null });
	});

	it('has neither when the row is the only one', () => {
		expect(panelNeighbours(['louis'], 0)).toEqual({ previousId: null, nextId: null });
	});
});

describe('applicationAfterDecision', () => {
	it('moves on to the row after the one decided', () => {
		expect(applicationAfterDecision(ROW_IDS, 'amani')).toBe('felix');
	});

	it('goes back to the row before when the last one was decided', () => {
		expect(applicationAfterDecision(ROW_IDS, 'sofia')).toBe('felix');
	});

	it('is null when the decided row was the only one, or is not on the page', () => {
		expect(applicationAfterDecision(['louis'], 'louis')).toBeNull();
		expect(applicationAfterDecision(ROW_IDS, 'somebody-else')).toBeNull();
	});
});

describe('panelPosition', () => {
	it('counts from one on the first page', () => {
		expect(panelPosition(1, 0)).toBe(1);
	});

	it('counts the twenty-five rows of every page before this one', () => {
		expect(panelPosition(3, 4)).toBe(55);
	});
});

describe('panelMetaLine', () => {
	it('names the day applied, in the conference’s timezone, and the place in the tab', () => {
		// Half past eleven at night in London is already the next day in Warsaw.
		const submittedAt = '2026-09-25T22:30:00Z';

		expect(panelMetaLine(submittedAt, 'Europe/London', 1, 4)).toBe('Applied 25 September · 1 of 4');
		expect(panelMetaLine(submittedAt, 'Europe/Warsaw', 1, 4)).toBe('Applied 26 September · 1 of 4');
	});

	it('gives only the place for an application with no day applied', () => {
		expect(panelMetaLine(null, 'Europe/London', 2, 4)).toBe('2 of 4');
	});
});

/** Louis, as the artboard draws him. */
const LOUIS: PanelFactSource = {
	profile: {
		userId: 'user-applicant',
		fullName: 'Louis Bernard',
		avatarPath: null,
		institutionName: 'Sciences Po',
		countryCode: 'FR',
		experienceLevel: 'intermediate'
	},
	details: {
		email: 'louis@example.test',
		dateOfBirth: '2006-03-01',
		phone: null,
		dietaryRequirements: 'Vegetarian',
		emergencyContactName: null,
		emergencyContactPhone: null
	},
	preferredCommittees: ['DISEC', 'Human Rights Council']
};

describe('panelFacts', () => {
	it('lists the school, experience, age, preferences and diet', () => {
		expect(panelFacts(LOUIS, 20)).toEqual([
			{ label: 'School', value: 'Sciences Po, France' },
			{ label: 'Experience', value: 'Intermediate' },
			{ label: 'Age', value: '20' },
			{ label: 'Preferences', value: '1. DISEC · 2. Human Rights Council' },
			{ label: 'Diet', value: 'Vegetarian' }
		]);
	});

	it('says "Not provided" or "Unknown" for whatever the applicant left out', () => {
		const blank: PanelFactSource = {
			profile: {
				...LOUIS.profile,
				institutionName: null,
				countryCode: null,
				experienceLevel: null
			},
			details: null,
			preferredCommittees: []
		};

		expect(panelFacts(blank, null)).toEqual([
			{ label: 'School', value: 'Not provided' },
			{ label: 'Experience', value: 'Not provided' },
			{ label: 'Age', value: 'Unknown' },
			{ label: 'Preferences', value: 'Not provided' },
			{ label: 'Diet', value: 'Not provided' }
		]);
	});

	it('names the country alone when the school is not known', () => {
		const countryOnly: PanelFactSource = {
			...LOUIS,
			profile: { ...LOUIS.profile, institutionName: null }
		};

		expect(panelFacts(countryOnly, 20)[0]).toEqual({ label: 'School', value: 'France' });
	});
});
