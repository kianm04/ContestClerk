import { describe, expect, it } from 'vitest';
import { EDGE_SCROLL_MAX_STEP_PX, EDGE_SCROLL_ZONE_PX, edgeScrollStep } from './edge-scroll';

describe('edgeScrollStep', () => {
	it('stays still away from both edges', () => {
		expect(edgeScrollStep(500, 0, 1000)).toBe(0);
	});

	it('scrolls back near the start and forward near the end', () => {
		expect(edgeScrollStep(10, 0, 1000)).toBeLessThan(0);
		expect(edgeScrollStep(990, 0, 1000)).toBeGreaterThan(0);
	});

	it('goes fastest right on the edge', () => {
		expect(edgeScrollStep(0, 0, 1000)).toBe(-EDGE_SCROLL_MAX_STEP_PX);
		expect(edgeScrollStep(1000, 0, 1000)).toBe(EDGE_SCROLL_MAX_STEP_PX);
		expect(Math.abs(edgeScrollStep(40, 0, 1000))).toBeLessThan(EDGE_SCROLL_MAX_STEP_PX);
	});

	it('starts only inside the zone', () => {
		expect(edgeScrollStep(EDGE_SCROLL_ZONE_PX, 0, 1000)).toBe(0);
		expect(edgeScrollStep(EDGE_SCROLL_ZONE_PX - 1, 0, 1000)).toBeLessThan(0);
	});

	it('stays still with the pointer outside the area', () => {
		expect(edgeScrollStep(-5, 0, 1000)).toBe(0);
		expect(edgeScrollStep(1005, 0, 1000)).toBe(0);
	});
});
