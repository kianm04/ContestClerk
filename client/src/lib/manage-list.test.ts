import { describe, expect, it } from 'vitest';
import type { Conference } from '$lib/conferences';
import type { ManagedConferenceSummary, OrganizationGroupData } from '$lib/manage';
import {
	conferenceListSections,
	inSessionBands,
	manageListSummary,
	manageListViewUrl,
	organizationFooter,
	readManageListView,
	splitConferences,
	staffConferenceRow
} from '$lib/manage-list';
import { SAMPLE_CONFERENCE } from '$lib/styleguide-samples';

/** The moment the list is drawn: 2 October 2026, in the morning. */
const NOW = new Date('2026-10-02T09:00:00Z');

/** A conference in London that is `SAMPLE_CONFERENCE` apart from the fields a test names. */
function summaryOf(changes: Partial<Conference>): ManagedConferenceSummary {
	return {
		conference: {
			...SAMPLE_CONFERENCE,
			organizationName: 'Northbridge MUN Society',
			city: 'London',
			timezone: 'Europe/London',
			...changes
		},
		figures: {
			applicationCount: 0,
			toReviewCount: 0,
			seatCount: 0,
			heldSeatCount: 0,
			feesPaidCents: 0,
			currency: 'GBP'
		},
		setupProgress: null,
		isOnTeam: true
	};
}

/** Running today, day 2 of 3. */
const RUNNING = summaryOf({
	id: 'running',
	slug: 'running',
	startDate: '2026-10-01',
	endDate: '2026-10-03'
});
/** Published, starting in November. */
const LATER = summaryOf({
	id: 'later',
	slug: 'later',
	startDate: '2026-11-14',
	endDate: '2026-11-16'
});
/** Published, starting in three days. */
const SOON = summaryOf({
	id: 'soon',
	slug: 'soon',
	startDate: '2026-10-05',
	endDate: '2026-10-07'
});
/** A draft for next March. */
const DRAFT = summaryOf({
	id: 'draft',
	slug: 'draft',
	status: 'draft',
	startDate: '2027-03-12',
	endDate: '2027-03-14'
});
/** Ended in September. */
const ENDED = summaryOf({
	id: 'ended',
	slug: 'ended',
	startDate: '2026-09-01',
	endDate: '2026-09-03'
});
/** Archived, from last year. */
const ARCHIVED = summaryOf({
	id: 'archived',
	slug: 'archived',
	status: 'archived',
	startDate: '2025-09-01',
	endDate: '2025-09-03'
});

/** An organisation with these conferences, which the reader owns. */
function groupOf(
	conferences: ManagedConferenceSummary[],
	changes: Partial<OrganizationGroupData['organization']> = {}
): OrganizationGroupData {
	return {
		organization: {
			id: 'organization-1',
			name: 'Northbridge MUN Society',
			slug: 'northbridge-mun-society',
			logoPath: null,
			isStripeConnected: false,
			...changes
		},
		myRole: 'owner',
		conferences
	};
}

describe('readManageListView and manageListViewUrl', () => {
	it('reads ?show=past as the past view and anything else as the usual one', () => {
		expect(readManageListView(new URL('http://test/manage?show=past'))).toBe('past');
		expect(readManageListView(new URL('http://test/manage?show=everything'))).toBe('upcoming');
		expect(readManageListView(new URL('http://test/manage'))).toBe('upcoming');
	});

	it('writes the address of each view', () => {
		expect(manageListViewUrl('past')).toBe('/manage?show=past');
		expect(manageListViewUrl('upcoming')).toBe('/manage');
	});
});

describe('splitConferences', () => {
	it('sorts what is running, what is ahead and what is over', () => {
		const split = splitConferences([ARCHIVED, LATER, RUNNING, DRAFT, ENDED, SOON], NOW);

		expect(split.inSession.map((summary) => summary.conference.id)).toEqual(['running']);
		// Soonest first, the draft among them by its dates.
		expect(split.comingUp.map((summary) => summary.conference.id)).toEqual([
			'soon',
			'later',
			'draft'
		]);
		// Most recent first.
		expect(split.past.map((summary) => summary.conference.id)).toEqual(['ended', 'archived']);
	});

	it('gives no band to a conference running today that the reader is not on the team of', () => {
		const split = splitConferences([{ ...RUNNING, isOnTeam: false }], NOW);

		// The band opens the dashboard, which would be a 404 for them.
		expect(split.inSession).toEqual([]);
		expect(split.comingUp.map((summary) => summary.conference.id)).toEqual(['running']);
	});
});

describe('manageListSummary', () => {
	it('counts what is running, what is coming up and what is taking shape, in words', () => {
		const organizations = [groupOf([RUNNING, SOON, LATER, DRAFT, ENDED])];

		expect(manageListSummary(organizations, NOW)).toBe(
			'One in session today, two coming up, one taking shape.'
		);
	});

	it('leaves out what there is none of', () => {
		expect(manageListSummary([groupOf([DRAFT])], NOW)).toBe('One taking shape.');
	});

	it('says so when nothing is coming up', () => {
		expect(manageListSummary([groupOf([ENDED])], NOW)).toBe('Nothing coming up yet.');
		expect(manageListSummary([], NOW)).toBe('Nothing coming up yet.');
	});
});

describe('inSessionBands', () => {
	it('gives each conference running today a band that opens its dashboard', () => {
		expect(inSessionBands([groupOf([RUNNING, SOON])], NOW)).toEqual([
			{
				id: 'running',
				statusLine: 'In session now · day 2 of 3',
				name: SAMPLE_CONFERENCE.name,
				place: 'London · Northbridge MUN Society',
				href: '/manage/running'
			}
		]);
	});
});

describe('conferenceListSections', () => {
	it('calls the one organisation\'s section "Coming up", with a link to the past', () => {
		const [section] = conferenceListSections(
			[groupOf([SOON, RUNNING, ENDED, ARCHIVED])],
			'upcoming',
			NOW
		);

		expect(section.title).toBe('Coming up');
		// The running one has its band, so it is not listed again.
		expect(section.rows.map((row) => row.id)).toEqual(['soon']);
		expect(section.link).toEqual({ label: 'Past and archived (2)', href: '/manage?show=past' });
	});

	it('names each section after its organisation when there are several', () => {
		const sections = conferenceListSections(
			[groupOf([SOON]), groupOf([LATER], { id: 'organization-2', name: 'Riverside Society' })],
			'upcoming',
			NOW
		);

		expect(sections.map((section) => section.title)).toEqual([
			'Northbridge MUN Society',
			'Riverside Society'
		]);
		// Nothing has ended, so there is no link to an empty view.
		expect(sections[0].link).toBeUndefined();
	});

	it('lists what has ended in the past view, with a link back', () => {
		const [section] = conferenceListSections([groupOf([SOON, RUNNING, ENDED])], 'past', NOW);

		expect(section.title).toBe('Past and archived');
		expect(section.rows.map((row) => row.id)).toEqual(['ended']);
		expect(section.link).toEqual({ label: 'Coming up (2)', href: '/manage' });
	});

	it('says what an empty section has nothing of', () => {
		const [empty] = conferenceListSections([groupOf([])], 'upcoming', NOW);
		const [onlyRunning] = conferenceListSections([groupOf([RUNNING])], 'upcoming', NOW);
		const [nothingEnded] = conferenceListSections([groupOf([])], 'past', NOW);

		expect(empty.emptyText).toBe('Nothing coming up. Create a conference to start.');
		expect(onlyRunning.emptyText).toBe('Nothing else coming up.');
		expect(nothingEnded.emptyText).toBe('Nothing has ended yet.');
	});

	it('says whether a section lists a conference the reader is not on the team of', () => {
		const [onTeam] = conferenceListSections([groupOf([SOON])], 'upcoming', NOW);
		const [offTeam] = conferenceListSections(
			[groupOf([SOON, { ...LATER, isOnTeam: false }])],
			'upcoming',
			NOW
		);

		expect(onTeam.hasOffTeamRows).toBe(false);
		expect(offTeam.hasOffTeamRows).toBe(true);
	});
});

describe('organizationFooter', () => {
	it('offers an owner Stripe while it is not connected', () => {
		expect(organizationFooter(groupOf([]))).toEqual({
			id: 'organization-1',
			text: 'Northbridge MUN Society · you are the owner · Stripe is not connected, so fees cannot be paid by card yet.',
			links: [
				{ label: 'Connect Stripe', href: '/manage/organizations/northbridge-mun-society' },
				{ label: 'Organisation settings', href: '/manage/organizations/northbridge-mun-society' }
			]
		});
	});

	it('offers a member only the settings, which they may read', () => {
		const footer = organizationFooter({ ...groupOf([]), myRole: 'member' });

		expect(footer.text).toContain('you are a member');
		expect(footer.links.map((link) => link.label)).toEqual(['Organisation settings']);
	});

	it('says Stripe is connected once it is', () => {
		const footer = organizationFooter(groupOf([], { isStripeConnected: true }));

		expect(footer.text).toBe('Northbridge MUN Society · you are the owner · Stripe is connected.');
		expect(footer.links.map((link) => link.label)).toEqual(['Organisation settings']);
	});
});

describe('staffConferenceRow', () => {
	it('gives an organiser a way into the management area', () => {
		const row = staffConferenceRow({
			conference: LATER.conference,
			roleNames: ['Organiser'],
			mayManage: true
		});

		expect(row).toEqual({
			id: 'later',
			name: SAMPLE_CONFERENCE.name,
			detail: '14 – 16 Nov 2026 · London · Organiser',
			actionLabel: 'Manage',
			href: '/manage/later'
		});
	});

	it('sends a chair to the public page', () => {
		const row = staffConferenceRow({
			conference: LATER.conference,
			roleNames: ['Chair'],
			mayManage: false
		});

		expect(row.detail).toBe('14 – 16 Nov 2026 · London · Chair');
		expect(row.actionLabel).toBe('View');
		expect(row.href).toBe('/conferences/later');
	});

	it('names every role somebody holds, as the conference named them', () => {
		const row = staffConferenceRow({
			conference: LATER.conference,
			roleNames: ['Chair', 'Press'],
			mayManage: false
		});

		expect(row.detail).toBe('14 – 16 Nov 2026 · London · Chair, Press');
	});
});
