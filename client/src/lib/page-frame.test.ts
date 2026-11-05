import { describe, expect, it } from 'vitest';
import { MAIN_CLASSES, pageFrame, showsSiteFooter } from './page-frame';

describe('pageFrame', () => {
	it('lets the landing page run under the top bar', () => {
		expect(pageFrame('/', false)).toBe('landing');
	});

	it('gives the "For organisers" page the landing frame, so its ground reaches the footer', () => {
		expect(pageFrame('/for-organisers', false)).toBe('landing');
	});

	it('runs the conference directory edge to edge under the top bar', () => {
		expect(pageFrame('/conferences', false)).toBe('full-bleed');
	});

	it('keeps the home page in the ordinary frame, where its next conference is a panel', () => {
		expect(pageFrame('/home', false)).toBe('framed');
	});

	it('keeps every other page in the ordinary frame', () => {
		expect(pageFrame('/conferences/[slug]', false)).toBe('framed');
		expect(pageFrame('/login', false)).toBe('framed');
	});

	it('gives the management pages their own frame', () => {
		expect(pageFrame('/manage', false)).toBe('manage');
		expect(pageFrame('/create', false)).toBe('manage');
		expect(pageFrame('/create/[slug]/setup', false)).toBe('manage');
		expect(pageFrame('/manage/[slug]', false)).toBe('manage');
		expect(pageFrame('/manage/[slug]/committees/[committeeId]', false)).toBe('manage');
	});

	it('draws a committee paper’s page wider, for its people, its sheet and its comments', () => {
		const paperPage = '/conferences/[slug]/committees/[committeeSlug]/resolutions/[paperId]';

		expect(pageFrame(paperPage, false)).toBe('writer');
		expect(pageFrame(paperPage, true)).toBe('framed');
		expect(pageFrame('/conferences/[slug]/committees/[committeeSlug]/resolutions', false)).toBe(
			'framed'
		);
	});

	it('keeps the organisation page and a management error page in the ordinary frame', () => {
		expect(pageFrame('/manage/organizations/[orgSlug]', false)).toBe('framed');
		expect(pageFrame('/manage/[slug]', true)).toBe('framed');
	});

	it('keeps an error page in the ordinary frame, even at the address of a picture page', () => {
		expect(pageFrame('/', true)).toBe('framed');
		expect(pageFrame('/conferences', true)).toBe('framed');
		expect(pageFrame('/manage/[slug]', true)).toBe('framed');
	});

	it('keeps an address that matches no route in the ordinary frame', () => {
		expect(pageFrame(null, true)).toBe('framed');
		expect(pageFrame(null, false)).toBe('framed');
	});
});

describe('showsSiteFooter', () => {
	it('leaves the footer off the live view, a committee paper’s page and the creation steps', () => {
		expect(showsSiteFooter('/conferences/[slug]/committees/[committeeSlug]/live')).toBe(false);
		expect(
			showsSiteFooter('/conferences/[slug]/committees/[committeeSlug]/resolutions/[paperId]')
		).toBe(false);
		expect(showsSiteFooter('/create')).toBe(false);
		expect(showsSiteFooter('/create/[slug]/setup')).toBe(false);
	});

	it('draws it under every other page, the list of papers and a missing address included', () => {
		expect(showsSiteFooter('/conferences/[slug]/committees/[committeeSlug]/resolutions')).toBe(
			true
		);
		expect(showsSiteFooter('/home')).toBe(true);
		expect(showsSiteFooter(null)).toBe(true);
	});
});

describe('MAIN_CLASSES', () => {
	it('limits the ordinary frame to the 72rem of a normal page, and the wide frames not at all', () => {
		expect(MAIN_CLASSES.framed).toContain('max-w-6xl');
		expect(MAIN_CLASSES['full-bleed']).not.toContain('max-w-');
		expect(MAIN_CLASSES.landing).not.toContain('max-w-');
		expect(MAIN_CLASSES.manage).not.toContain('max-w-');
	});

	it('gives a committee paper’s page the 82rem its three columns need', () => {
		expect(MAIN_CLASSES.writer).toContain('max-w-[82rem]');
	});

	it('leaves the padding of an organiser page to the layout beside its sidebar', () => {
		expect(MAIN_CLASSES.manage).not.toMatch(/\bp[bxy]?-/);
	});

	it('leaves the landing page without padding, so its background reaches the footer', () => {
		expect(MAIN_CLASSES.landing).not.toMatch(/\bp[bxy]?-/);
	});
});
