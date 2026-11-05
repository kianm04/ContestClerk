import { describe, expect, it } from 'vitest';
import { dashboardForReader, type DashboardContent } from './dashboard-access';
import type { AttentionItem } from './dashboard-attention';
import { SAMPLE_COMMITTEE } from './dashboard-attention-samples';
import { dashboardSections, type SectionFacts } from './dashboard-sections';
import { NO_WAITING_FACTS } from './dashboard-waiting';
import { NO_PERMISSIONS, type MyPermissions } from './permissions';

/** An organiser: `administrator` opens every page. */
const ADMINISTRATOR: MyPermissions = {
	held: [{ permission: 'administrator', scope: 'conference' }],
	committeeIds: [],
	rank: -1
};

/** A London conference read at 11:00 on 15 November 2026, with one committee. */
const FACTS: SectionFacts = {
	conference: { slug: 'northbridge', timezone: 'Europe/London', positionPaperRequired: true },
	now: new Date('2026-11-15T11:00:00Z'),
	committees: [SAMPLE_COMMITTEE],
	recentApplications: [],
	waiting: NO_WAITING_FACTS,
	// Not public yet, so "Before the first day" has a line with a link to the schedule.
	isProgrammePublic: false,
	rooms: [],
	todayEvents: []
};

/** A "Needs you" line leading to `href`. */
function lineTo(key: string, href: string): AttentionItem {
	return {
		key,
		title: 'Something is waiting',
		detail: null,
		actionLabel: 'Open',
		href: href as AttentionItem['href']
	};
}

/** The dashboard of `phase` as an administrator sees it, before any cutting down. */
function contentOf(phase: 'applications' | 'allocation' | 'conference-days'): DashboardContent {
	return {
		figures: [
			{ value: '9', label: 'Applications', page: 'applications' },
			{ value: '£45.00', label: 'Outstanding', page: 'fees' }
		],
		attention: [
			lineTo('applications', '/manage/northbridge/applications?status=submitted'),
			lineTo('room', '/conferences/northbridge/committees/hrc/chair')
		],
		sections: dashboardSections(phase, FACTS),
		quietAction: 'unpublish'
	};
}

describe('dashboardForReader', () => {
	it('leaves everything for an administrator', () => {
		for (const phase of ['applications', 'allocation', 'conference-days'] as const) {
			const content = contentOf(phase);

			expect(dashboardForReader(ADMINISTRATOR, content)).toEqual(content);
		}
	});

	it('leaves out the figures, lines and quiet action whose pages the reader may not open', () => {
		const content = dashboardForReader(NO_PERMISSIONS, contentOf('applications'));

		expect(content.figures).toEqual([]);
		expect(content.quietAction).toBeNull();
		// A chair room is outside the management area, and its own page decides.
		expect(content.attention.map((item) => item.key)).toEqual(['room']);
	});

	it('leaves out the applications and committees while applications are taken', () => {
		const { sections } = dashboardForReader(NO_PERMISSIONS, contentOf('applications'));

		expect(sections).toEqual({ phase: 'applications', waiting: null, committees: null });
	});

	it('keeps the lines before the first day that are done, and drops the ones that lead elsewhere', () => {
		const { sections } = dashboardForReader(NO_PERMISSIONS, contentOf('allocation'));

		expect(sections.phase).toBe('allocation');

		if (sections.phase === 'allocation') {
			expect(sections.committees).toBeNull();
			expect(sections.preparation.every((item) => item.link === null)).toBe(true);
		}
	});

	it('keeps the rooms on a conference day, and leaves out the programme and the announcement button', () => {
		const { sections } = dashboardForReader(NO_PERMISSIONS, contentOf('conference-days'));

		expect(sections.phase).toBe('conference-days');

		if (sections.phase === 'conference-days') {
			expect(sections.rooms).toEqual([]);
			expect(sections.today).toBeNull();
			expect(sections.mayPostAnnouncement).toBe(false);
		}
	});
	it('leaves the money figures to a reader of invoices, not to somebody who only edits fees', () => {
		const editor: MyPermissions = {
			held: [{ permission: 'edit_conference', scope: 'conference' }],
			committeeIds: [],
			rank: 1
		};
		const invoiceReader: MyPermissions = {
			...editor,
			held: [{ permission: 'read_invoices', scope: 'conference' }]
		};

		const forEditor = dashboardForReader(editor, contentOf('allocation'));
		const forReader = dashboardForReader(invoiceReader, contentOf('allocation'));

		expect(forEditor.figures.map((figure) => figure.label)).toEqual([]);
		expect(forReader.figures.map((figure) => figure.label)).toEqual(['Outstanding']);
	});
});
