import { describe, expect, it } from 'vitest';
import { speakingTimeFieldUrl } from './gsl-links';

const ROOM = '/conferences/thimun-2027/committees/unsc/chair';

describe('speakingTimeFieldUrl', () => {
	it('opens the speaking time field on the page the chair is on', () => {
		expect(speakingTimeFieldUrl('thimun-2027', 'unsc', 'gsl')).toBe(`${ROOM}/gsl?time=change`);
		expect(speakingTimeFieldUrl('thimun-2027', 'unsc', 'chair')).toBe(`${ROOM}?time=change`);
	});
});
