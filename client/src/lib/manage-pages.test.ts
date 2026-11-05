import { describe, expect, it } from 'vitest';
import {
	MANAGE_PAGE_PERMISSIONS,
	managePageOfLink,
	mayFollowLink,
	mayOpenManageArea,
	permissionsOpeningManagePages,
	mayOpenManagePage
} from './manage-pages';
import { NO_PERMISSIONS, type MyPermissions } from './permissions';

const ORGANISER: MyPermissions = {
	held: [{ permission: 'administrator', scope: 'conference' }],
	committeeIds: [],
	rank: 0
};

/** The Chair preset: its `read_participants` opens the participants page, per committee. */
const CHAIR: MyPermissions = {
	held: [
		{ permission: 'run_room', scope: 'committees' },
		{ permission: 'read_participants', scope: 'committees' }
	],
	committeeIds: ['committee-a'],
	rank: 1
};

/** A role with only `edit_conference`, such as somebody who keeps the website up to date. */
const EDITOR: MyPermissions = {
	held: [{ permission: 'edit_conference', scope: 'conference' }],
	committeeIds: [],
	rank: 1
};

/** Delegate affairs: reads payment status, changes no fee. */
const INVOICE_READER: MyPermissions = {
	held: [{ permission: 'read_invoices', scope: 'conference' }],
	committeeIds: [],
	rank: 1
};

describe('mayOpenManagePage', () => {
	it('opens every page for an administrator', () => {
		for (const page of Object.keys(MANAGE_PAGE_PERMISSIONS)) {
			expect(mayOpenManagePage(ORGANISER, page as keyof typeof MANAGE_PAGE_PERMISSIONS)).toBe(true);
		}
	});

	it('opens nothing for somebody with no role', () => {
		expect(mayOpenManagePage(NO_PERMISSIONS, 'details')).toBe(false);
	});

	it('opens the committees for their editors, per committee too, and awards for confirmers', () => {
		const editingChair: MyPermissions = {
			...CHAIR,
			held: [...CHAIR.held, { permission: 'manage_committees', scope: 'committees' }]
		};
		const headOfAcademics: MyPermissions = {
			held: [{ permission: 'confirm_awards', scope: 'conference' }],
			committeeIds: [],
			rank: 1
		};

		expect(mayOpenManagePage(editingChair, 'committees')).toBe(true);
		expect(mayOpenManagePage(editingChair, 'awards')).toBe(false);
		expect(mayOpenManagePage(headOfAcademics, 'awards')).toBe(true);
		expect(mayOpenManagePage(CHAIR, 'committees')).toBe(false);
	});

	it('opens the programme pages for their permissions, announcements per committee too', () => {
		const announcingChair: MyPermissions = {
			...CHAIR,
			held: [...CHAIR.held, { permission: 'send_announcements', scope: 'committees' }]
		};
		const logistics: MyPermissions = {
			held: [
				{ permission: 'edit_schedule', scope: 'conference' },
				{ permission: 'manage_documents', scope: 'conference' }
			],
			committeeIds: [],
			rank: 1
		};

		expect(mayOpenManagePage(announcingChair, 'announcements')).toBe(true);
		expect(mayOpenManagePage(announcingChair, 'schedule')).toBe(false);
		expect(mayOpenManagePage(logistics, 'schedule')).toBe(true);
		expect(mayOpenManagePage(logistics, 'documents')).toBe(true);
		expect(mayOpenManagePage(logistics, 'announcements')).toBe(false);
	});

	it('opens the details, publishing and the application form for edit_conference', () => {
		expect(mayOpenManagePage(EDITOR, 'details')).toBe(true);
		expect(mayOpenManagePage(EDITOR, 'publish')).toBe(true);
		expect(mayOpenManagePage(EDITOR, 'application-form')).toBe(true);
		expect(mayOpenManagePage(INVOICE_READER, 'details')).toBe(false);
	});

	it('opens the fees for edit_conference and for read_invoices, but not for a chair', () => {
		expect(mayOpenManagePage(EDITOR, 'fees')).toBe(true);
		expect(mayOpenManagePage(INVOICE_READER, 'fees')).toBe(true);
		expect(mayOpenManagePage(CHAIR, 'fees')).toBe(false);
	});

	it('opens applications, delegations and allocation for read_applications', () => {
		const reader: MyPermissions = {
			held: [{ permission: 'read_applications', scope: 'conference' }],
			committeeIds: [],
			rank: 1
		};

		expect(mayOpenManagePage(reader, 'applications')).toBe(true);
		expect(mayOpenManagePage(reader, 'delegations')).toBe(true);
		expect(mayOpenManagePage(reader, 'allocation')).toBe(true);
		expect(mayOpenManagePage(CHAIR, 'applications')).toBe(false);
	});

	it('opens the participants for read_participants, even held on one committee', () => {
		expect(mayOpenManagePage(CHAIR, 'participants')).toBe(true);
	});

	it('opens the team for manage_team and the roles for manage_roles, each on its own', () => {
		const teamManager: MyPermissions = {
			held: [{ permission: 'manage_team', scope: 'conference' }],
			committeeIds: [],
			rank: 1
		};

		expect(mayOpenManagePage(teamManager, 'team')).toBe(true);
		expect(mayOpenManagePage(teamManager, 'roles')).toBe(false);
		expect(mayOpenManageArea(teamManager)).toBe(true);
	});
});

describe('mayOpenManageArea', () => {
	it('opens for an administrator', () => {
		expect(mayOpenManageArea(ORGANISER)).toBe(true);
	});

	it('stays shut to permissions that open no page, so there is no empty dashboard', () => {
		const roomOnly: MyPermissions = { ...CHAIR, held: [CHAIR.held[0]] };

		expect(mayOpenManageArea(CHAIR)).toBe(true);
		expect(mayOpenManageArea(roomOnly)).toBe(false);
		expect(mayOpenManageArea(NO_PERMISSIONS)).toBe(false);
	});
});

describe('permissionsOpeningManagePages', () => {
	it('names each permission of the table once', () => {
		const permissions = permissionsOpeningManagePages();

		expect(new Set(permissions).size).toBe(permissions.length);
		expect(permissions).toContain('manage_committees');
		expect(permissions).toContain('confirm_awards');
	});
});

describe('managePageOfLink', () => {
	it('finds the page in an absolute link and in a relative one', () => {
		expect(managePageOfLink('/manage/thimun-2027/fees')).toBe('fees');
		expect(managePageOfLink('../manage/thimun-2027/applications?status=submitted')).toBe(
			'applications'
		);
	});

	it('reads a page underneath another as that page', () => {
		expect(managePageOfLink('/manage/thimun-2027/committees/abc')).toBe('committees');
		expect(managePageOfLink('/manage/thimun-2027/participants/export')).toBe('participants');
	});

	it('reads the roles under the team as Roles, and the team itself as Team', () => {
		expect(managePageOfLink('/manage/thimun-2027/team/roles')).toBe('roles');
		expect(managePageOfLink('/manage/thimun-2027/team/roles/new')).toBe('roles');
		expect(managePageOfLink('/manage/thimun-2027/team?role=abc')).toBe('team');
	});

	it('counts the page after a publish as Publish', () => {
		expect(managePageOfLink('/manage/thimun-2027/published')).toBe('publish');
	});

	it('answers dashboard for the area itself', () => {
		expect(managePageOfLink('/manage/thimun-2027')).toBe('dashboard');
		expect(managePageOfLink('/manage/thimun-2027/')).toBe('dashboard');
		expect(managePageOfLink('/manage/thimun-2027?tab=x')).toBe('dashboard');
	});

	it('answers null for a link outside the area', () => {
		expect(managePageOfLink('/conferences/thimun-2027/committees/unsc/chair')).toBeNull();
		expect(managePageOfLink('/manage')).toBeNull();
	});
});

describe('mayFollowLink', () => {
	it('lets the reader follow a link to a page they may open', () => {
		expect(mayFollowLink(ORGANISER, '/manage/thimun-2027/fees')).toBe(true);
	});

	it('stops a link to a page they may not open', () => {
		expect(mayFollowLink(CHAIR, '/manage/thimun-2027/fees')).toBe(false);
	});

	it('asks what the tab of the fees page a link opens needs', () => {
		const setFees = '/manage/thimun-2027/fees?tab=fees';
		const unpaid = '../manage/thimun-2027/fees?status=unpaid#invoices';

		expect(mayFollowLink(EDITOR, setFees)).toBe(true);
		expect(mayFollowLink(EDITOR, unpaid)).toBe(false);
		expect(mayFollowLink(INVOICE_READER, setFees)).toBe(false);
		expect(mayFollowLink(INVOICE_READER, unpaid)).toBe(true);
	});

	it('leaves alone the dashboard and links that leave the area', () => {
		expect(mayFollowLink(CHAIR, '/manage/thimun-2027')).toBe(true);
		expect(mayFollowLink(CHAIR, '/conferences/thimun-2027/committees/unsc/chair')).toBe(true);
	});
});
