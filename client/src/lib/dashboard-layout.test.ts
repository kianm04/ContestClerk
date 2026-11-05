import { describe, expect, it } from 'vitest';
import { isFirstAttentionLinePrimary, quietAction } from './dashboard-layout';

describe('quietAction', () => {
	it('offers Unpublish before the conference days while nobody holds a seat', () => {
		expect(quietAction('applications', 'published', false)).toBe('unpublish');
		expect(quietAction('allocation', 'published', false)).toBe('unpublish');
	});

	it('offers nothing before the days once somebody holds a seat', () => {
		expect(quietAction('applications', 'published', true)).toBeNull();
		expect(quietAction('allocation', 'published', true)).toBeNull();
	});

	it('offers nothing on a conference day', () => {
		expect(quietAction('conference-days', 'published', false)).toBeNull();
		expect(quietAction('conference-days', 'published', true)).toBeNull();
	});

	it('offers Archive once a published conference is over, and nothing once it is archived', () => {
		expect(quietAction('after', 'published', true)).toBe('archive');
		expect(quietAction('after', 'archived', true)).toBeNull();
	});

	it('offers nothing for a draft, which never reaches the dashboard', () => {
		expect(quietAction('setup', 'draft', false)).toBeNull();
	});
});

describe('isFirstAttentionLinePrimary', () => {
	it('fills the first line except on conference days, when the panel holds the button', () => {
		expect(isFirstAttentionLinePrimary('applications')).toBe(true);
		expect(isFirstAttentionLinePrimary('allocation')).toBe(true);
		expect(isFirstAttentionLinePrimary('after')).toBe(true);
		expect(isFirstAttentionLinePrimary('conference-days')).toBe(false);
	});
});
