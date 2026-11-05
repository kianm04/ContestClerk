// @vitest-environment jsdom
// The helper fires a DOM event, which the unit project's plain Node has no `document` for.
import { describe, expect, it, vi } from 'vitest';
import { announceChange } from './form-change';

describe('announceChange', () => {
	it('fires a change event that reaches the form around the element', async () => {
		const form = document.createElement('form');
		const wrapper = document.createElement('div');
		form.append(wrapper);

		const handleChange = vi.fn();
		form.addEventListener('change', handleChange);

		await announceChange(wrapper);

		expect(handleChange).toHaveBeenCalledTimes(1);
	});
});
