import { describe, expect, it } from 'vitest';
import {
	SHOWCASE_CONFERENCE,
	SHOWCASE_STORIES,
	SHOWCASE_VIEWS,
	parseShowcaseView
} from './landing-showcase';

describe('parseShowcaseView', () => {
	it("shows the delegate's view when the address names none", () => {
		expect(parseShowcaseView(new URLSearchParams(''))).toBe('delegate');
	});

	it("shows the organiser's view when the address asks for it", () => {
		expect(parseShowcaseView(new URLSearchParams('view=organiser'))).toBe('organiser');
	});

	it("falls back to the delegate's view for a value it does not know", () => {
		// A mistyped or old link still shows the page instead of an error.
		expect(parseShowcaseView(new URLSearchParams('view=chair'))).toBe('delegate');
	});
});

describe('SHOWCASE_STORIES', () => {
	it('has one story for each view of the switch, in the same order', () => {
		const storyViews = SHOWCASE_VIEWS.map((view) => SHOWCASE_STORIES[view].view);

		expect(storyViews).toEqual(['delegate', 'organiser']);
	});

	it("follows the delegate's application as the mockup draws it", () => {
		const steps = SHOWCASE_STORIES.delegate.steps.map((step) => step.label);

		expect(steps).toEqual([
			'Application submitted',
			'Under review',
			'Accepted',
			'Committee assignment',
			'Join live sessions'
		]);
	});

	it('marks exactly one step of each story as the current one', () => {
		for (const view of SHOWCASE_VIEWS) {
			const steps = SHOWCASE_STORIES[view].steps;
			const currentSteps = steps.filter((step) => step.state === 'current');

			expect(currentSteps).toHaveLength(1);
		}
	});
});

describe('SHOWCASE_CONFERENCE', () => {
	it('writes its dates the way the rest of the app does', () => {
		expect(SHOWCASE_CONFERENCE.dates).toBe('12 – 15 Feb 2026');
	});
});
