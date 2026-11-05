import { describe, expect, it } from 'vitest';
import { unmodTimeFieldUrl } from './unmod-links';

describe('unmodTimeFieldUrl', () => {
	it('opens the speaking time field of "After the caucus" on the page the chair is on', () => {
		expect(unmodTimeFieldUrl('thimun-2027', 'unsc', 'unmod')).toBe(
			'/conferences/thimun-2027/committees/unsc/chair/unmod?time=change'
		);
		expect(unmodTimeFieldUrl('thimun-2027', 'unsc', 'chair')).toBe(
			'/conferences/thimun-2027/committees/unsc/chair?time=change'
		);
	});
});
