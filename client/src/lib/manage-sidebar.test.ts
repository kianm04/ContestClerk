import { describe, expect, it } from 'vitest';
import {
	activeSidebarLink,
	manageSidebarGroups,
	phoneMenuLabel,
	type ManageSidebarLink,
	type SidebarCount
} from './manage-sidebar';
import { NO_PERMISSIONS, type MyPermissions } from './permissions';
import { setupSteps, type SetupProgress } from './setup-steps';

/** An administrator, who may open every page. */
const ADMINISTRATOR: MyPermissions = {
	held: [{ permission: 'administrator', scope: 'conference' }],
	committeeIds: [],
	rank: 0
};

/** A draft with its details and committees done, and nothing else. */
const HALF_SET_UP: SetupProgress = {
	details: true,
	committees: true,
	applicationForm: false,
	fees: false,
	team: false
};

/** The groups of a published `thimun-2027`, on the page at `pathname`. */
function publishedGroups(
	pathname: string,
	count: SidebarCount | null = null,
	permissions: MyPermissions = ADMINISTRATOR
) {
	return manageSidebarGroups({
		slug: 'thimun-2027',
		pathname,
		setupSteps: null,
		count,
		permissions
	});
}

/** The groups of `thimun-2027` while it is a draft set up as far as `progress`. */
function draftGroups(
	pathname: string,
	progress: SetupProgress = HALF_SET_UP,
	permissions: MyPermissions = ADMINISTRATOR
) {
	const steps = setupSteps('thimun-2027', progress);

	return manageSidebarGroups({
		slug: 'thimun-2027',
		pathname,
		setupSteps: steps,
		count: null,
		permissions
	});
}

/**
 * Every line of the sidebar of a published `thimun-2027` on one page, looked up
 * by its label, so a test can name the line it means rather than count to it.
 */
function sidebarLines(pathname: string): Record<string, ManageSidebarLink> {
	const links = publishedGroups(pathname).flatMap((group) => group.links);

	return Object.fromEntries(links.map((link) => [link.label, link]));
}

describe('manageSidebarGroups once the conference is published', () => {
	it('draws the fourteen pages in their groups, Dashboard alone on top', () => {
		const groups = publishedGroups('/manage/thimun-2027');
		const headings = groups.map((group) => group.heading);
		const labelsByGroup = groups.map((group) => group.links.map((link) => link.label));

		expect(headings).toEqual([null, 'Set up', 'Applications', 'The conference', 'After']);
		expect(labelsByGroup).toEqual([
			['Dashboard'],
			['Details', 'Committees', 'Application form', 'Fees', 'Team'],
			['Applications', 'Delegations', 'Allocation'],
			['Schedule', 'Announcements', 'Documents', 'Participants'],
			['Awards']
		]);
	});

	it('points every line at a page of this conference', () => {
		const lines = sidebarLines('/manage/thimun-2027');

		expect(lines['Dashboard'].href).toBe('/manage/thimun-2027');
		expect(lines['Details'].href).toBe('/manage/thimun-2027/details');
		expect(lines['Committees'].href).toBe('/manage/thimun-2027/committees');
		expect(lines['Application form'].href).toBe('/manage/thimun-2027/application-form');
		expect(lines['Fees'].href).toBe('/manage/thimun-2027/fees');
		expect(lines['Team'].href).toBe('/manage/thimun-2027/team');
		expect(lines['Applications'].href).toBe('/manage/thimun-2027/applications');
		expect(lines['Delegations'].href).toBe('/manage/thimun-2027/delegations');
		expect(lines['Allocation'].href).toBe('/manage/thimun-2027/allocation');
		expect(lines['Schedule'].href).toBe('/manage/thimun-2027/schedule');
		expect(lines['Announcements'].href).toBe('/manage/thimun-2027/announcements');
		expect(lines['Documents'].href).toBe('/manage/thimun-2027/documents');
		expect(lines['Participants'].href).toBe('/manage/thimun-2027/participants');
		expect(lines['Awards'].href).toBe('/manage/thimun-2027/awards');
	});

	it('gives every line an icon rather than a step number', () => {
		const lines = Object.values(sidebarLines('/manage/thimun-2027'));

		expect(lines.every((line) => line.marker.kind === 'icon')).toBe(true);
	});

	it('marks Dashboard when the reader is on it, and nothing else', () => {
		const lines = sidebarLines('/manage/thimun-2027');
		const marked = Object.values(lines).filter((line) => line.isActive);

		expect(marked.map((line) => line.label)).toEqual(['Dashboard']);
		expect(lines['Dashboard'].currentKind).toBe('page');
	});

	it('does not mark Dashboard on a page underneath it', () => {
		const lines = sidebarLines('/manage/thimun-2027/committees');

		expect(lines['Dashboard'].isActive).toBe(false);
		expect(lines['Committees'].isActive).toBe(true);
	});

	it('marks the line of each single page', () => {
		const singlePages: [string, string][] = [
			['details', 'Details'],
			['application-form', 'Application form'],
			['team', 'Team'],
			['allocation', 'Allocation'],
			['schedule', 'Schedule'],
			['announcements', 'Announcements'],
			['documents', 'Documents'],
			['participants', 'Participants'],
			['awards', 'Awards']
		];

		for (const [folder, label] of singlePages) {
			const lines = sidebarLines(`/manage/thimun-2027/${folder}`);
			const marked = Object.values(lines).filter((line) => line.isActive);

			expect(marked.map((line) => line.label)).toEqual([label]);
		}
	});

	it('keeps Committees marked on one committee and on the new committee form', () => {
		const onOneCommittee = sidebarLines(
			'/manage/thimun-2027/committees/9f2c8d1e-0000-4000-8000-000000000001'
		);
		const onTheNewForm = sidebarLines('/manage/thimun-2027/committees/new');

		expect(onOneCommittee['Committees'].isActive).toBe(true);
		expect(onTheNewForm['Committees'].isActive).toBe(true);
	});

	it('does not mark Committees on an address that merely starts with the same letters', () => {
		// Without the `/` on the end of the prefix, a page called
		// `committees-archive` would light the line up too.
		const lines = sidebarLines('/manage/thimun-2027/committees-archive');

		expect(lines['Committees'].isActive).toBe(false);
	});

	it('keeps Fees marked on the invoices page underneath it', () => {
		const lines = sidebarLines('/manage/thimun-2027/fees/invoices');

		expect(lines['Fees'].isActive).toBe(true);
	});

	it("keeps Applications and Delegations marked on one row's review page", () => {
		const onAnApplication = sidebarLines('/manage/thimun-2027/applications/app-1');
		const onADelegation = sidebarLines('/manage/thimun-2027/delegations/del-1');

		expect(onAnApplication['Applications'].isActive).toBe(true);
		expect(onAnApplication['Application form'].isActive).toBe(false);
		expect(onADelegation['Delegations'].isActive).toBe(true);
		expect(onADelegation['Applications'].isActive).toBe(false);
	});

	it('marks nothing on another conference', () => {
		const lines = sidebarLines('/manage/lymun-2026');

		expect(Object.values(lines).some((line) => line.isActive)).toBe(false);
	});
});

describe('manageSidebarGroups counts', () => {
	it('puts the count of the phase on its own line only', () => {
		const groups = publishedGroups('/manage/thimun-2027', { link: 'applications', value: 4 });
		const counted = groups.flatMap((group) => group.links).filter((link) => link.count !== null);

		expect(counted.map((link) => [link.label, link.count])).toEqual([['Applications', 4]]);
	});

	it('counts free seats on Allocation and proposed awards on Awards', () => {
		const allocation = publishedGroups('/manage/thimun-2027', { link: 'allocation', value: 12 });
		const awards = publishedGroups('/manage/thimun-2027', { link: 'awards', value: 3 });

		expect(allocation[2].links[2].count).toBe(12);
		expect(awards[4].links[0].count).toBe(3);
	});

	it('shows nothing when there is nothing to count', () => {
		const groups = publishedGroups('/manage/thimun-2027', { link: 'applications', value: 0 });
		const links = groups.flatMap((group) => group.links);

		expect(links.every((link) => link.count === null)).toBe(true);
	});
});

describe('manageSidebarGroups while the conference is a draft', () => {
	it('has no Dashboard, and numbers the six setup steps', () => {
		const groups = draftGroups('/manage/thimun-2027/details');
		const setUp = groups[0];

		expect(groups.map((group) => group.heading)).toEqual([
			'Set up',
			'Applications',
			'The conference',
			'After'
		]);
		expect(setUp.links.map((link) => link.label)).toEqual([
			'Details',
			'Committees',
			'Application form',
			'Fees',
			'Team',
			'Publish'
		]);
		expect(setUp.links.map((link) => link.marker)).toEqual([
			{ kind: 'step', number: 1, isDone: true },
			{ kind: 'step', number: 2, isDone: true },
			{ kind: 'step', number: 3, isDone: false },
			{ kind: 'step', number: 4, isDone: false },
			{ kind: 'step', number: 5, isDone: false },
			{ kind: 'step', number: 6, isDone: false }
		]);
	});

	it('says "Optional" beside Fees and Team only', () => {
		const setUp = draftGroups('/manage/thimun-2027/details')[0];

		expect(setUp.links.map((link) => link.note)).toEqual([
			null,
			null,
			null,
			'Optional',
			'Optional',
			null
		]);
	});

	it('locks Publish until the three required steps are done', () => {
		const halfway = draftGroups('/manage/thimun-2027/details')[0];
		const ready = draftGroups('/manage/thimun-2027/details', {
			...HALF_SET_UP,
			applicationForm: true
		})[0];

		expect(halfway.links[5].isLocked).toBe(true);
		expect(ready.links[5].isLocked).toBe(false);
	});

	it('marks the open step as the current step', () => {
		const setUp = draftGroups('/manage/thimun-2027/application-form')[0];
		const marked = setUp.links.filter((link) => link.isActive);

		expect(marked.map((link) => link.label)).toEqual(['Application form']);
		expect(marked[0].currentKind).toBe('step');
	});

	it('keeps the Committees step marked inside its section', () => {
		const setUp = draftGroups('/manage/thimun-2027/committees/new')[0];

		expect(setUp.links[1].isActive).toBe(true);
	});
});

describe('manageSidebarGroups by permission', () => {
	/** A role whose one permission opens no page of the management area yet. */
	const NO_PAGES: MyPermissions = {
		held: [{ permission: 'run_room', scope: 'committees' }],
		committeeIds: ['committee-1'],
		rank: 1
	};

	it('leaves out every page the reader may not open, and the headings left empty', () => {
		const groups = publishedGroups('/manage/thimun-2027', null, NO_PAGES);

		expect(groups.map((group) => group.heading)).toEqual([null]);
		expect(groups[0].links.map((link) => link.label)).toEqual(['Dashboard']);
	});

	it('shows a draft without its numbered steps to somebody who may not edit it', () => {
		const groups = draftGroups('/manage/thimun-2027', HALF_SET_UP, NO_PERMISSIONS);
		const links = groups.flatMap((group) => group.links);

		expect(links.map((link) => link.label)).toEqual(['Dashboard']);
		expect(links.every((link) => link.marker.kind === 'icon')).toBe(true);
	});
});

describe('activeSidebarLink', () => {
	it('finds the marked line inside a group', () => {
		const groups = publishedGroups('/manage/thimun-2027/applications/app-1');

		expect(activeSidebarLink(groups)?.label).toBe('Applications');
	});

	it('answers undefined when no line is marked', () => {
		const groups = publishedGroups('/manage/lymun-2026');

		expect(activeSidebarLink(groups)).toBeUndefined();
	});
});

describe('phoneMenuLabel', () => {
	it('names the page being shown', () => {
		const groups = publishedGroups('/manage/thimun-2027');

		expect(phoneMenuLabel(activeSidebarLink(groups))).toBe('Dashboard');
	});

	it("puts a draft's step number in front", () => {
		const groups = draftGroups('/manage/thimun-2027/application-form');

		expect(phoneMenuLabel(activeSidebarLink(groups))).toBe('Step 3 of 6 · Application form');
	});

	it('says "Manage" on a page the sidebar has no line for', () => {
		expect(phoneMenuLabel(undefined)).toBe('Manage');
	});
});
