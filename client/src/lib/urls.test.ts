import { describe, expect, it } from 'vitest';
import type { AllocationQuery } from './allocation';
import type { ApplicationListQuery } from './applications';
import type { DelegationListQuery } from './delegations';
import { EMPTY_INVOICE_LIST_QUERY } from './invoices';
import { EMPTY_MY_APPLICATIONS_QUERY } from './my-applications-query';
import { EMPTY_PARTICIPANT_QUERY, type ParticipantQuery } from './participants';
import type { ConferenceQuery } from './conferences';
import {
	absolutePath,
	newAmendmentUrl,
	ruleOutAmendmentUrl,
	withdrawAmendmentUrl,
	paperAmendmentUrl,
	chairAmendmentUrl,
	chairAmendmentQueueUrl,
	accountSettingsUrl,
	applicationListSearch,
	applicationUrl,
	applyUrl,
	chairRollCallDraftUrl,
	chairAwardsUrl,
	chairAwardUpdateActionUrl,
	chairMotionsMotionUrl,
	chairMotionsRestoreAction,
	chairMotionsSessionUrl,
	chairMotionsUrl,
	chairNoteAddedUrl,
	chairNotesActionUrl,
	chairNotesUrl,
	chairSessionNotesUrl,
	chairPaperReadingActionUrl,
	chairPaperReadingUrl,
	chairPapersActionUrl,
	chairPapersUrl,
	chairResolutionDialogUrl,
	chairResolutionsUrl,
	chairResolutionUrl,
	chairVoteViewUrl,
	chairVotingSeatUrl,
	chairVotingUrl,
	chairRollCallUrl,
	chairRoomUrl,
	chairFrameAction,
	chairGslUrl,
	chairModUrl,
	chairPageUrl,
	chairRollCallFromUrl,
	chairSingleUrl,
	chairUnmodUrl,
	rollCallViewUrl,
	pageWithQuery,
	chairRollCallAction,
	authErrorUrl,
	committeeDisplayUrl,
	newQuickSessionUrl,
	quickSessionDelegationsUrl,
	committeeLiveUrl,
	committeePaperDialogUrl,
	committeePaperSourceUrl,
	crisisDeskUrl,
	crisisPaperUrl,
	committeePapersUrl,
	committeePaperPrintUrl,
	committeePaperUrl,
	committeeUrl,
	newCommitteePaperUrl,
	conferenceListUrl,
	conferenceUrl,
	contactEmailUrl,
	CONTACT_EMAIL,
	createConferenceUrl,
	createResumeUrl,
	createSetupDialogUrl,
	createStepUrl,
	createWithOrganizationUrl,
	delegationMembersUrl,
	deleteCommentUrl,
	editCommentUrl,
	delegationPaperUrl,
	delegationPapersUrl,
	delegationSeatsUrl,
	delegationUrl,
	forgotPasswordUrl,
	forOrganisersUrl,
	inviteUrl,
	joinDelegationUrl,
	landingShowcaseUrl,
	landingUrl,
	loginUrl,
	logoutUrl,
	manageAllocationActionUrl,
	manageAllocationUrl,
	manageApplicationFormUrl,
	manageApplicationReviewActionUrl,
	manageApplicationReviewUrl,
	manageApplicationsActionUrl,
	manageAwardsUrl,
	manageAwardTitleActionUrl,
	manageAwardsCommitteeUrl,
	manageDocumentsActionUrl,
	manageDocumentsUrl,
	approvePaperActionUrl,
	myResourcesUrl,
	positionPaperUrl,
	positionPaperWayUrl,
	manageApplicationsExportUrl,
	manageParticipantsActionUrl,
	manageParticipantsExportUrl,
	manageParticipantsUrl,
	manageApplicationsUrl,
	manageCommitteesUrl,
	manageDelegationsUrl,
	manageDelegationReviewUrl,
	manageCommitteeUrl,
	manageQuestionEditUrl,
	manageFeeEditUrl,
	manageFeesActionUrl,
	manageFeesExportUrl,
	managePublishUrl,
	managePublishedUrl,
	manageFeesInvoiceUrl,
	manageFeesTabUrl,
	manageFeesTableUrl,
	manageFeesUrl,
	manageScheduleUrl,
	manageAnnouncementsUrl,
	conferenceAnnouncementsUrl,
	myScheduleUrl,
	conferenceScheduleUrl,
	manageConferenceUrl,
	manageDetailsUrl,
	manageDeleteRoleUrl,
	manageNewRoleUrl,
	manageRolesUrl,
	manageRoleUrl,
	manageTeamEditRolesUrl,
	manageTeamFilterUrl,
	manageTeamUrl,
	manageUrl,
	invoiceUrl,
	myApplicationsUrl,
	myCommitteesUrl,
	myInvoicesUrl,
	newCommitteeUrl,
	newDelegationUrl,
	pathThroughRegister,
	notificationsUrl,
	organizationSettingsUrl,
	organizationUrl,
	personUrl,
	privacyUrl,
	profileEditUrl,
	profileUrl,
	registerUrl,
	removeDelegationMemberUrl,
	resetPasswordUrl,
	signedInHomeUrl,
	startConferenceUrl,
	stripeConnectRefreshUrl,
	stripeConnectReturnUrl,
	styleguideUrl,
	termsUrl,
	unassignDelegationSeatUrl,
	welcomeUrl
} from './urls';

/** A search that asks for nothing, so each test can change one thing at a time. */
const EMPTY_QUERY: ConferenceQuery = {
	q: '',
	country: '',
	regions: [],
	withinMonths: 0,
	level: '',
	openOnly: false,
	sort: 'soonest',
	page: 1
};

/**
 * The organiser's applications table as it opens: the first tab, nothing
 * searched for and nothing filtered. Each test changes one thing about it, the
 * way the tests of `conferenceListUrl` change one thing about `EMPTY_QUERY`.
 */
const EMPTY_APPLICATION_QUERY: ApplicationListQuery = {
	q: '',
	status: 'submitted',
	committee: '',
	country: '',
	sort: 'submitted',
	page: 1,
	view: 'table'
};

/**
 * The allocation grid as it opens, used the same way as
 * `EMPTY_APPLICATION_QUERY` above: every committee, every state, nothing
 * searched for and no panel open over it.
 */
const EMPTY_ALLOCATION_QUERY: AllocationQuery = {
	committee: '',
	state: '',
	q: '',
	seat: '',
	action: ''
};

/**
 * The organiser's delegations table as it opens, used the same way as
 * `EMPTY_APPLICATION_QUERY` above. It has no committee filter, because a
 * delegation asks for seats rather than for committees.
 */
const EMPTY_DELEGATION_QUERY: DelegationListQuery = {
	q: '',
	status: 'submitted',
	country: '',
	sort: 'submitted',
	page: 1
};

describe('landingUrl', () => {
	it('is the front page', () => {
		expect(landingUrl()).toBe('/');
	});
});

describe('landingShowcaseUrl', () => {
	it("is the plain front page for the delegate's view, which is the default", () => {
		expect(landingShowcaseUrl('delegate')).toBe('/');
	});

	it("names the organiser's view in the address", () => {
		expect(landingShowcaseUrl('organiser')).toBe('/?view=organiser');
	});
});

describe('conferenceListUrl', () => {
	it('leaves out everything that is already the default', () => {
		expect(conferenceListUrl(EMPTY_QUERY)).toBe('/conferences');
	});

	it('is the plain directory when there is no search at all', () => {
		// What a "Conferences" link in the navigation asks for.
		expect(conferenceListUrl()).toBe('/conferences');
	});

	it('puts the search text in the address', () => {
		expect(conferenceListUrl({ ...EMPTY_QUERY, q: 'munich' })).toBe('/conferences?q=munich');
	});

	it('keeps every filter that was set', () => {
		const query: ConferenceQuery = {
			q: 'model',
			country: 'NL',
			regions: ['europe', 'asia'],
			withinMonths: 6,
			level: 'university',
			openOnly: true,
			sort: 'newest',
			page: 3
		};

		expect(conferenceListUrl(query)).toBe(
			'/conferences?q=model&country=NL&region=europe&region=asia&within=6' +
				'&level=university&open=1&sort=newest&page=3'
		);
	});

	it('puts the level in the address', () => {
		expect(conferenceListUrl({ ...EMPTY_QUERY, level: 'high_school' })).toBe(
			'/conferences?level=high_school'
		);
	});

	it('writes the open box as open=1', () => {
		expect(conferenceListUrl({ ...EMPTY_QUERY, openOnly: true })).toBe('/conferences?open=1');
	});

	it('leaves the sort order out when it is already the default', () => {
		expect(conferenceListUrl({ ...EMPTY_QUERY, sort: 'soonest' })).toBe('/conferences');
		expect(conferenceListUrl({ ...EMPTY_QUERY, sort: 'newest' })).toBe('/conferences?sort=newest');
	});

	it('leaves the first page out of the address', () => {
		expect(conferenceListUrl({ ...EMPTY_QUERY, page: 1 })).toBe('/conferences');
		expect(conferenceListUrl({ ...EMPTY_QUERY, page: 2 })).toBe('/conferences?page=2');
	});
});

describe('conferenceUrl', () => {
	it('puts the slug into the conference page address', () => {
		expect(conferenceUrl('thimun-2027')).toBe('/conferences/thimun-2027');
	});
});

describe('organizationUrl', () => {
	it('puts the slug into the organisation page address', () => {
		expect(organizationUrl('sample-europe-mun-network')).toBe(
			'/organizations/sample-europe-mun-network'
		);
	});
});

describe('committeeUrl', () => {
	it('puts both slugs into the committee page address', () => {
		expect(committeeUrl('thimun-2027', 'unsc')).toBe('/conferences/thimun-2027/committees/unsc');
	});
});

describe('applyUrl', () => {
	it('puts the slug into the apply form address', () => {
		expect(applyUrl('thimun-2027')).toBe('/conferences/thimun-2027/apply');
	});
});

describe('applicationUrl', () => {
	it('puts the id into the application page address', () => {
		expect(applicationUrl('9f2c8d1e-4a7b-4c21-9f3e-2b8d6c5a1e40')).toBe(
			'/applications/9f2c8d1e-4a7b-4c21-9f3e-2b8d6c5a1e40'
		);
	});
});

describe('newDelegationUrl', () => {
	it('puts the slug into the register a delegation address', () => {
		expect(newDelegationUrl('thimun-2027')).toBe('/conferences/thimun-2027/delegations/new');
	});
});

describe('delegationUrl', () => {
	it('puts the id into the delegation dashboard address', () => {
		expect(delegationUrl('9f2c8d1e-4a7b-4c21-9f3e-2b8d6c5a1e40')).toBe(
			'/delegations/9f2c8d1e-4a7b-4c21-9f3e-2b8d6c5a1e40'
		);
	});
});

describe('joinDelegationUrl', () => {
	it('puts the join code into the link a head shares', () => {
		expect(joinDelegationUrl('H7KP3QWX')).toBe('/join/H7KP3QWX');
	});
});

describe('manageUrl', () => {
	it('is the organiser area index', () => {
		expect(manageUrl()).toBe('/manage');
	});
});

describe('manageConferenceUrl', () => {
	it('puts the slug into the conference management address', () => {
		expect(manageConferenceUrl('thimun-2027')).toBe('/manage/thimun-2027');
	});

	it('is a different page from the public conference page', () => {
		expect(manageConferenceUrl('thimun-2027')).not.toBe(conferenceUrl('thimun-2027'));
	});
});

describe('manageDetailsUrl', () => {
	it('is the details editor inside that conference management area', () => {
		expect(manageDetailsUrl('thimun-2027')).toBe('/manage/thimun-2027/details');
	});

	it('sits under the dashboard rather than beside it', () => {
		expect(manageDetailsUrl('thimun-2027').startsWith(manageConferenceUrl('thimun-2027'))).toBe(
			true
		);
	});
});

describe('manageCommitteesUrl', () => {
	it('is the committees list inside that conference management area', () => {
		expect(manageCommitteesUrl('thimun-2027')).toBe('/manage/thimun-2027/committees');
	});

	it('sits under the dashboard rather than beside it', () => {
		expect(manageCommitteesUrl('thimun-2027').startsWith(manageConferenceUrl('thimun-2027'))).toBe(
			true
		);
	});
});

describe('newCommitteeUrl', () => {
	it('is the form that makes a committee, under the committees list', () => {
		expect(newCommitteeUrl('thimun-2027')).toBe('/manage/thimun-2027/committees/new');
	});
});

describe('manageTeamUrl', () => {
	it('is the team page inside that conference management area', () => {
		expect(manageTeamUrl('thimun-2027')).toBe('/manage/thimun-2027/team');
	});
});

describe('manageTeamFilterUrl', () => {
	it('puts the chosen role in the address', () => {
		expect(manageTeamFilterUrl('thimun-2027', 'chair')).toBe('/manage/thimun-2027/team?role=chair');
	});

	it('leaves the parameter off for the filter that shows everybody', () => {
		// "Everyone" is what the sidebar and every other link point at, so its
		// address is the plain one.
		expect(manageTeamFilterUrl('thimun-2027', 'all')).toBe(manageTeamUrl('thimun-2027'));
	});
});

describe('manageTeamEditRolesUrl', () => {
	it('opens the dialog for one person, keeping the role filter', () => {
		expect(manageTeamEditRolesUrl('thimun-2027', 'all', 'user-1')).toBe(
			'/manage/thimun-2027/team?edit=user-1'
		);
		expect(manageTeamEditRolesUrl('thimun-2027', 'role-2', 'user-1')).toBe(
			'/manage/thimun-2027/team?role=role-2&edit=user-1'
		);
	});
});

describe('manageRolesUrl', () => {
	it('is the roles page under the team', () => {
		expect(manageRolesUrl('thimun-2027')).toBe('/manage/thimun-2027/team/roles');
	});
});

describe('manageNewRoleUrl', () => {
	it('starts blank, or from the role it names', () => {
		expect(manageNewRoleUrl('thimun-2027')).toBe('/manage/thimun-2027/team/roles/new');
		expect(manageNewRoleUrl('thimun-2027', 'role-2')).toBe(
			'/manage/thimun-2027/team/roles/new?from=role-2'
		);
	});
});

describe('manageRoleUrl', () => {
	it('is one role’s editor', () => {
		expect(manageRoleUrl('thimun-2027', 'role-2')).toBe('/manage/thimun-2027/team/roles/role-2');
	});
});

describe('manageDeleteRoleUrl', () => {
	it('is the editor with the delete dialog open', () => {
		expect(manageDeleteRoleUrl('thimun-2027', 'role-2')).toBe(
			'/manage/thimun-2027/team/roles/role-2?delete=1'
		);
	});
});

describe('manageFeesUrl', () => {
	it('is the fees page inside that conference management area', () => {
		expect(manageFeesUrl('thimun-2027')).toBe('/manage/thimun-2027/fees');
	});

	it('carries the invoice search, status and page, and leaves the defaults out', () => {
		const query = {
			...EMPTY_INVOICE_LIST_QUERY,
			q: 'de vries',
			status: 'unpaid' as const,
			page: 2
		};

		expect(manageFeesUrl('thimun-2027', query)).toBe(
			'/manage/thimun-2027/fees?q=de+vries&status=unpaid&page=2'
		);
		expect(manageFeesUrl('thimun-2027', EMPTY_INVOICE_LIST_QUERY)).toBe('/manage/thimun-2027/fees');
	});
});

describe('manageFeesTableUrl', () => {
	it('lands on the invoices table and keeps what it was asked', () => {
		const query = { ...EMPTY_INVOICE_LIST_QUERY, status: 'unpaid' as const, page: 2 };

		expect(manageFeesTableUrl('thimun-2027', query)).toBe(
			'/manage/thimun-2027/fees?status=unpaid&page=2#invoices'
		);
	});

	it('names the invoices tab when nothing else in the query would open it', () => {
		expect(manageFeesTableUrl('thimun-2027', EMPTY_INVOICE_LIST_QUERY)).toBe(
			'/manage/thimun-2027/fees?tab=invoices#invoices'
		);
	});
});

describe('manageFeesTabUrl', () => {
	it('opens the fees page on the tab it is given', () => {
		expect(manageFeesTabUrl('thimun-2027', 'fees')).toBe('/manage/thimun-2027/fees?tab=fees');
		expect(manageFeesTabUrl('thimun-2027', 'invoices')).toBe(
			'/manage/thimun-2027/fees?tab=invoices'
		);
	});
});

describe('manageFeesInvoiceUrl', () => {
	it('names the invoice and jumps to the Invoices section', () => {
		expect(manageFeesInvoiceUrl('thimun-2027', 'c8f2a1b4')).toBe(
			'/manage/thimun-2027/fees?invoice=c8f2a1b4#invoices'
		);
	});
});

describe('manageFeesExportUrl', () => {
	it('carries the search and the status, but not the page or the highlighted invoice', () => {
		const query = {
			q: 'lycée',
			status: 'paid' as const,
			page: 3,
			invoice: 'c8f2a1b4'
		};

		expect(manageFeesExportUrl('thimun-2027', query)).toBe(
			'/manage/thimun-2027/fees/export?q=lyc%C3%A9e&status=paid'
		);
	});

	it('is the plain export when nothing is filtered', () => {
		expect(manageFeesExportUrl('thimun-2027', EMPTY_INVOICE_LIST_QUERY)).toBe(
			'/manage/thimun-2027/fees/export'
		);
	});
});

describe('manageFeesActionUrl', () => {
	it('adds the action to a table that has no filters on it', () => {
		expect(manageFeesActionUrl('thimun-2027', EMPTY_INVOICE_LIST_QUERY, 'markPaid')).toBe(
			'/manage/thimun-2027/fees?/markPaid'
		);
	});

	it('keeps the filters and the page, so the organiser comes back to the same rows', () => {
		const query = { ...EMPTY_INVOICE_LIST_QUERY, status: 'unpaid' as const, page: 2 };

		expect(manageFeesActionUrl('thimun-2027', query, 'waive')).toBe(
			'/manage/thimun-2027/fees?status=unpaid&page=2&/waive'
		);
	});
});

describe('manageFeeEditUrl', () => {
	it('puts the fee being edited in the address', () => {
		expect(manageFeeEditUrl('thimun-2027', 'c8f2a1b4')).toBe(
			'/manage/thimun-2027/fees?editFee=c8f2a1b4'
		);
	});

	it('escapes an id that would otherwise change the address', () => {
		// Real ids are uuids and never need escaping, but the value arrives from
		// a row rather than from us, and an address is not the place to find out.
		expect(manageFeeEditUrl('thimun-2027', 'a b&c')).toBe(
			'/manage/thimun-2027/fees?editFee=a%20b%26c'
		);
	});
});

describe('manageApplicationFormUrl', () => {
	it('is the application form page inside that conference management area', () => {
		expect(manageApplicationFormUrl('thimun-2027')).toBe('/manage/thimun-2027/application-form');
	});
});

describe('manageQuestionEditUrl', () => {
	it('puts the question being edited in the address', () => {
		expect(manageQuestionEditUrl('thimun-2027', 'c8f2a1b4')).toBe(
			'/manage/thimun-2027/application-form?edit=c8f2a1b4'
		);
	});

	it('escapes an id that would otherwise change the address', () => {
		// The same care `manageFeeEditUrl` above takes: real ids are uuids, but
		// the value arrives from a row rather than from us.
		expect(manageQuestionEditUrl('thimun-2027', 'a b&c')).toBe(
			'/manage/thimun-2027/application-form?edit=a%20b%26c'
		);
	});
});

describe('manageApplicationsUrl', () => {
	it('is the plain table when it is asked for no particular results', () => {
		// What the sidebar and the dashboard's "View all" link ask for.
		expect(manageApplicationsUrl('thimun-2027')).toBe('/manage/thimun-2027/applications');
	});

	it('leaves out everything that is already the default', () => {
		expect(manageApplicationsUrl('thimun-2027', EMPTY_APPLICATION_QUERY)).toBe(
			'/manage/thimun-2027/applications'
		);
	});

	it('carries the tab when it is not the first one', () => {
		expect(
			manageApplicationsUrl('thimun-2027', { ...EMPTY_APPLICATION_QUERY, status: 'waitlisted' })
		).toBe('/manage/thimun-2027/applications?status=waitlisted');
	});

	it('carries a search over the applicant and their school', () => {
		expect(
			manageApplicationsUrl('thimun-2027', { ...EMPTY_APPLICATION_QUERY, q: 'kowalska' })
		).toBe('/manage/thimun-2027/applications?q=kowalska');
	});

	it('carries the committee and country filters', () => {
		const query: ApplicationListQuery = {
			...EMPTY_APPLICATION_QUERY,
			committee: 'c8f2a1b4',
			country: 'PL'
		};

		expect(manageApplicationsUrl('thimun-2027', query)).toBe(
			'/manage/thimun-2027/applications?committee=c8f2a1b4&country=PL'
		);
	});

	it('carries the sort when it is not the oldest first', () => {
		expect(manageApplicationsUrl('thimun-2027', { ...EMPTY_APPLICATION_QUERY, sort: 'name' })).toBe(
			'/manage/thimun-2027/applications?sort=name'
		);
	});

	it('carries the board, and leaves the table as the default out', () => {
		expect(
			manageApplicationsUrl('thimun-2027', { ...EMPTY_APPLICATION_QUERY, view: 'board' })
		).toBe('/manage/thimun-2027/applications?view=board');
	});

	it('carries any page but the first', () => {
		expect(manageApplicationsUrl('thimun-2027', { ...EMPTY_APPLICATION_QUERY, page: 3 })).toBe(
			'/manage/thimun-2027/applications?page=3'
		);
	});

	it('carries everything that was asked for at once', () => {
		const query: ApplicationListQuery = {
			q: 'anna',
			status: 'accepted',
			committee: 'c8f2a1b4',
			country: 'NL',
			sort: 'decided',
			page: 2,
			view: 'table'
		};

		expect(manageApplicationsUrl('thimun-2027', query)).toBe(
			'/manage/thimun-2027/applications?q=anna&status=accepted&committee=c8f2a1b4&country=NL&sort=decided&page=2'
		);
	});

	it('escapes a search that would otherwise change the address', () => {
		// The words come from a box somebody typed in, and an address is not the
		// place to find out what they put in it.
		expect(manageApplicationsUrl('thimun-2027', { ...EMPTY_APPLICATION_QUERY, q: 'a b&c' })).toBe(
			'/manage/thimun-2027/applications?q=a+b%26c'
		);
	});
});

describe('applicationListSearch', () => {
	it('is empty when everything is the default', () => {
		expect(applicationListSearch(EMPTY_APPLICATION_QUERY)).toBe('');
	});

	it('holds only what differs from the default, without a leading question mark', () => {
		const query: ApplicationListQuery = {
			...EMPTY_APPLICATION_QUERY,
			status: 'waitlisted',
			page: 2
		};

		expect(applicationListSearch(query)).toBe('status=waitlisted&page=2');
	});
});

describe('manageApplicationsExportUrl', () => {
	it('is the plain endpoint when nothing is filtered', () => {
		expect(manageApplicationsExportUrl('thimun-2027', EMPTY_APPLICATION_QUERY)).toBe(
			'/manage/thimun-2027/applications/export'
		);
	});

	it('asks for exactly the rows the table is showing', () => {
		const query: ApplicationListQuery = {
			...EMPTY_APPLICATION_QUERY,
			status: 'accepted',
			q: 'anna',
			page: 2
		};

		// The page is carried like everything else. The endpoint ignores it and
		// writes every matching row, which is what "export these results" means;
		// leaving it out here would be a second rule about the same address.
		expect(manageApplicationsExportUrl('thimun-2027', query)).toBe(
			'/manage/thimun-2027/applications/export?q=anna&status=accepted&page=2'
		);
	});
});

describe('manageApplicationsActionUrl', () => {
	it('adds the action to a table that has no filters on it', () => {
		expect(
			manageApplicationsActionUrl('thimun-2027', EMPTY_APPLICATION_QUERY, 'bulkWaitlist')
		).toBe('/manage/thimun-2027/applications?/bulkWaitlist');
	});

	it('keeps the tab and the filters, so a decision comes back to the same rows', () => {
		const query: ApplicationListQuery = {
			...EMPTY_APPLICATION_QUERY,
			status: 'waitlisted',
			q: 'anna',
			page: 3
		};

		// A plain `?/bulkAccept` would have replaced all of this, and the action
		// would have looked for the ticked rows on the "Under review" tab.
		expect(manageApplicationsActionUrl('thimun-2027', query, 'bulkAccept')).toBe(
			'/manage/thimun-2027/applications?q=anna&status=waitlisted&page=3&/bulkAccept'
		);
	});

	it('leads to the same rows the table itself does', () => {
		const query: ApplicationListQuery = { ...EMPTY_APPLICATION_QUERY, status: 'accepted' };
		const table = manageApplicationsUrl('thimun-2027', query);

		expect(manageApplicationsActionUrl('thimun-2027', query, 'chooseAccept')).toBe(
			`${table}&/chooseAccept`
		);
	});
});

describe('manageApplicationReviewUrl', () => {
	it('is the application under the conference, with nothing after it when there is no queue', () => {
		expect(manageApplicationReviewUrl('thimun-2027', 'application-1')).toBe(
			'/manage/thimun-2027/applications/application-1'
		);
	});

	it('carries the queue the organiser came from, so Previous, Next and Back follow it', () => {
		const query: ApplicationListQuery = {
			...EMPTY_APPLICATION_QUERY,
			status: 'waitlisted',
			sort: 'name',
			page: 2
		};

		expect(manageApplicationReviewUrl('thimun-2027', 'application-1', query)).toBe(
			'/manage/thimun-2027/applications/application-1?status=waitlisted&sort=name&page=2'
		);
	});
});

describe('manageApplicationReviewActionUrl', () => {
	it('adds the action to a page with no queue', () => {
		expect(
			manageApplicationReviewActionUrl(
				'thimun-2027',
				'application-1',
				EMPTY_APPLICATION_QUERY,
				'accept'
			)
		).toBe('/manage/thimun-2027/applications/application-1?/accept');
	});

	it('keeps the queue, so the page comes back walking the same one', () => {
		const query: ApplicationListQuery = { ...EMPTY_APPLICATION_QUERY, q: 'anna' };

		expect(manageApplicationReviewActionUrl('thimun-2027', 'application-1', query, 'reject')).toBe(
			'/manage/thimun-2027/applications/application-1?q=anna&/reject'
		);
	});
});

describe('inviteUrl', () => {
	it('is the accept page for that one token', () => {
		expect(inviteUrl('mV7Qx2LpR8nK3sDf6TgYb1WcZ4hJ0eAu')).toBe(
			'/invites/mV7Qx2LpR8nK3sDf6TgYb1WcZ4hJ0eAu'
		);
	});
});

describe('manageCommitteeUrl', () => {
	it('names the committee by its id, not by its slug', () => {
		// The editor is where the slug is changed, so an address built from the
		// slug would move the moment it was saved.
		expect(manageCommitteeUrl('thimun-2027', 'c8f2a1b4')).toBe(
			'/manage/thimun-2027/committees/c8f2a1b4'
		);
	});

	it("is a different page from the committee's public one", () => {
		expect(manageCommitteeUrl('thimun-2027', 'security-council')).not.toBe(
			committeeUrl('thimun-2027', 'security-council')
		);
	});
});

describe('loginUrl', () => {
	it('is the plain sign in page when there is nowhere to go back to', () => {
		expect(loginUrl()).toBe('/login');
		expect(loginUrl('')).toBe('/login');
		expect(loginUrl('/')).toBe('/login');
	});

	it('remembers the page the visitor was trying to reach', () => {
		expect(loginUrl('/invoices/42')).toBe('/login?next=%2Finvoices%2F42');
	});

	it('drops an address pointing at another website', () => {
		// `//evil.example` is a link to somebody else's site, even though it
		// starts with a slash.
		expect(loginUrl('//evil.example')).toBe('/login');
		expect(loginUrl('https://evil.example')).toBe('/login');
	});
});

describe('pathThroughRegister', () => {
	it('hands a signed-in reader the page itself', () => {
		expect(pathThroughRegister(applyUrl('thimun-2027'), '/conferences/thimun-2027', true)).toBe(
			'/conferences/thimun-2027/apply'
		);
	});

	it('sends everybody else through the create account page, carrying where they were going', () => {
		expect(pathThroughRegister(applyUrl('thimun-2027'), '/conferences/thimun-2027', false)).toBe(
			'/register?next=%2Fconferences%2Fthimun-2027%2Fapply'
		);
	});

	it('resolves a relative address before putting it in `next`', () => {
		/*
			`resolve()` answers relatively while a page is being built on the server,
			so on `/conferences/thimun-2027` the apply address arrives as
			`../thimun-2027/apply`. Without `absolutePath` in between,
			`safeRedirectPath` would throw it away for not starting with a slash and
			the new account would land on the front page. This test is here because that
			failure is silent: the button still works, it just forgets where it was
			going.
		*/
		const next = pathThroughRegister(
			newDelegationUrl('thimun-2027'),
			'/conferences/thimun-2027',
			false
		);

		expect(next).toBe('/register?next=%2Fconferences%2Fthimun-2027%2Fdelegations%2Fnew');
	});
});

describe('the steps of creating a conference', () => {
	it('puts the chosen organisation in the address of the first step', () => {
		expect(createWithOrganizationUrl('new')).toBe('/create?organization=new');
	});

	it('builds the address of each later step and of the draft itself', () => {
		expect(createStepUrl('delft-mun-2027', 'basics')).toBe('/create/delft-mun-2027/basics');
		expect(createStepUrl('delft-mun-2027', 'when')).toBe('/create/delft-mun-2027/when');
		expect(createStepUrl('delft-mun-2027', 'setup')).toBe('/create/delft-mun-2027/setup');
		expect(createStepUrl('delft-mun-2027', 'launch')).toBe('/create/delft-mun-2027/launch');
		expect(createResumeUrl('delft-mun-2027')).toBe('/create/delft-mun-2027');
	});

	it('opens one of the Setup step dialogs from the address', () => {
		expect(createSetupDialogUrl('delft-mun-2027', 'committee')).toBe(
			'/create/delft-mun-2027/setup?dialog=committee'
		);
		expect(createSetupDialogUrl('delft-mun-2027', 'delete-fee', 'fee/1')).toBe(
			'/create/delft-mun-2027/setup?dialog=delete-fee&id=fee%2F1'
		);
	});
});

describe('the pages with no parameters', () => {
	it('builds each one', () => {
		expect(createConferenceUrl()).toBe('/create');
		expect(registerUrl()).toBe('/register');
		expect(logoutUrl()).toBe('/logout');
		expect(forgotPasswordUrl()).toBe('/forgot-password');
		expect(resetPasswordUrl()).toBe('/reset-password');
	});
});

describe('the auth pages that carry `next`', () => {
	it('leaves the parameter off when there is nothing to remember', () => {
		expect(registerUrl()).toBe('/register');
		expect(forgotPasswordUrl('')).toBe('/forgot-password');
	});

	it('carries the page the visitor was heading for', () => {
		expect(registerUrl('/conferences/thimun-2027')).toBe(
			'/register?next=%2Fconferences%2Fthimun-2027'
		);
		expect(forgotPasswordUrl('/notifications')).toBe('/forgot-password?next=%2Fnotifications');
	});

	it('refuses an address pointing at another website', () => {
		expect(registerUrl('https://evil.example')).toBe('/register');
		expect(forgotPasswordUrl('//evil.example')).toBe('/forgot-password');
	});
});

describe('authErrorUrl', () => {
	it('names the reason in the address', () => {
		expect(authErrorUrl('expired')).toBe('/auth/error?reason=expired');
		expect(authErrorUrl('invalid')).toBe('/auth/error?reason=invalid');
	});
});

describe('welcomeUrl', () => {
	it('is the plain page when there is nowhere in particular to go afterwards', () => {
		expect(welcomeUrl()).toBe('/welcome');
	});

	it('carries the page the person was heading for', () => {
		expect(welcomeUrl('/conferences/thimun-2027')).toBe(
			'/welcome?next=%2Fconferences%2Fthimun-2027'
		);
	});

	it('ignores an address pointing at another website', () => {
		expect(welcomeUrl('//evil.example')).toBe('/welcome');
		expect(welcomeUrl('https://evil.example')).toBe('/welcome');
	});
});

describe('personUrl', () => {
	it('is somebody’s public profile', () => {
		expect(personUrl('user-1')).toBe('/people/user-1');
	});
});

describe('profileUrl', () => {
	it('is the profile page', () => {
		expect(profileUrl()).toBe('/profile');
	});
});

describe('profileEditUrl', () => {
	it('is the form that changes the profile', () => {
		expect(profileEditUrl()).toBe('/profile/edit');
	});
});

describe('accountSettingsUrl', () => {
	it('is the settings page', () => {
		expect(accountSettingsUrl()).toBe('/settings');
	});
});

describe('signedInHomeUrl', () => {
	it('is the signed-in dashboard', () => {
		expect(signedInHomeUrl()).toBe('/home');
	});

	it('lifts the limit on one section when asked', () => {
		expect(signedInHomeUrl('conferences')).toBe('/home?all=conferences');
		expect(signedInHomeUrl('quick')).toBe('/home?all=quick');
	});
});

describe('styleguideUrl', () => {
	it('is the plain page when nothing is asked for', () => {
		expect(styleguideUrl()).toBe('/styleguide');
	});

	it('leaves out the sort direction that is already the default', () => {
		expect(styleguideUrl({ sort: 'name', direction: 'asc' })).toBe('/styleguide?sort=name');
	});

	it('writes the other direction out', () => {
		expect(styleguideUrl({ sort: 'status', direction: 'desc' })).toBe(
			'/styleguide?sort=status&direction=desc'
		);
	});

	it('leaves out the first page and keeps any other', () => {
		expect(styleguideUrl({ page: 1 })).toBe('/styleguide');
		expect(styleguideUrl({ page: 3 })).toBe('/styleguide?page=3');
	});

	it('carries the chosen seat of the seat list example', () => {
		expect(styleguideUrl({ seat: 'seat-br' })).toBe('/styleguide?seat=seat-br');
	});
});

describe('notificationsUrl', () => {
	it('is the plain page for the first page of results', () => {
		expect(notificationsUrl()).toBe('/notifications');
		expect(notificationsUrl(1)).toBe('/notifications');
	});

	it('carries any later page', () => {
		expect(notificationsUrl(3)).toBe('/notifications?page=3');
	});
});

describe('forOrganisersUrl', () => {
	it('is the page for organisers', () => {
		expect(forOrganisersUrl()).toBe('/for-organisers');
	});
});

describe('organizationSettingsUrl', () => {
	it("is that organisation's own settings page", () => {
		expect(organizationSettingsUrl('sample-europe-mun-network')).toBe(
			'/manage/organizations/sample-europe-mun-network'
		);
	});
});

describe('stripeConnectReturnUrl', () => {
	it('names the organisation Stripe is sending the browser back about', () => {
		expect(stripeConnectReturnUrl('thimun-foundation')).toBe(
			'/api/stripe/connect/return?org=thimun-foundation'
		);
	});

	// Stripe hands the browser back with nothing of ours attached but what we put
	// in the address ourselves, so the slug has to survive the round trip intact.
	it('escapes a slug so the address stays one parameter', () => {
		expect(stripeConnectReturnUrl('a b&c')).toBe('/api/stripe/connect/return?org=a%20b%26c');
	});
});

describe('stripeConnectRefreshUrl', () => {
	it('names the organisation whose onboarding link went stale', () => {
		expect(stripeConnectRefreshUrl('thimun-foundation')).toBe(
			'/api/stripe/connect/refresh?org=thimun-foundation'
		);
	});
});

describe('termsUrl', () => {
	it('is the terms of service', () => {
		expect(termsUrl()).toBe('/terms');
	});
});

describe('privacyUrl', () => {
	it('is the privacy policy', () => {
		expect(privacyUrl()).toBe('/privacy');
	});
});

describe('startConferenceUrl', () => {
	it('sends somebody already signed in straight to the form', () => {
		expect(startConferenceUrl(true)).toBe('/create');
	});

	it('sends a visitor through sign up, which then lands them on the form', () => {
		expect(startConferenceUrl(false)).toBe('/register?next=%2Fcreate');
	});
});

describe('contactEmailUrl', () => {
	it('is a mail link rather than a page of ours', () => {
		expect(contactEmailUrl()).toBe('mailto:hello@munmeet.app');
	});

	it('is built from CONTACT_EMAIL, so the address is written down once', () => {
		expect(contactEmailUrl()).toBe(`mailto:${CONTACT_EMAIL}`);
	});
});

describe('absolutePath', () => {
	it('leaves an address that is already absolute alone', () => {
		expect(absolutePath('/conferences', '/conferences/amsterdammun-2027')).toBe('/conferences');
	});

	it('resolves the relative address a server render writes', () => {
		// What `resolve('/conferences')` really answers while
		// `/conferences/amsterdammun-2027` is being built on the server. The top
		// bar compares this with the address the reader asked for, so it has to
		// be the absolute one again first.
		expect(absolutePath('../conferences', '/conferences/amsterdammun-2027')).toBe('/conferences');
	});

	it('resolves an address relative to a page at the top level', () => {
		expect(absolutePath('./conferences', '/privacy')).toBe('/conferences');
	});

	it('drops a query string, because only the path is being compared', () => {
		expect(absolutePath('/conferences?q=hague', '/privacy')).toBe('/conferences');
	});

	it('never climbs above the front page', () => {
		expect(absolutePath('../../conferences', '/privacy')).toBe('/conferences');
	});
});

describe('manageDelegationsUrl', () => {
	it('is the plain table when it is asked for no particular results', () => {
		// What the sidebar asks for.
		expect(manageDelegationsUrl('thimun-2027')).toBe('/manage/thimun-2027/delegations');
	});

	it('leaves out everything that is already the default', () => {
		expect(manageDelegationsUrl('thimun-2027', EMPTY_DELEGATION_QUERY)).toBe(
			'/manage/thimun-2027/delegations'
		);
	});

	it('carries the tab when it is not the first one', () => {
		expect(
			manageDelegationsUrl('thimun-2027', { ...EMPTY_DELEGATION_QUERY, status: 'accepted' })
		).toBe('/manage/thimun-2027/delegations?status=accepted');
	});

	it('carries a search over the school and its head', () => {
		expect(manageDelegationsUrl('thimun-2027', { ...EMPTY_DELEGATION_QUERY, q: 'lycee' })).toBe(
			'/manage/thimun-2027/delegations?q=lycee'
		);
	});

	it('carries the country filter', () => {
		expect(manageDelegationsUrl('thimun-2027', { ...EMPTY_DELEGATION_QUERY, country: 'FR' })).toBe(
			'/manage/thimun-2027/delegations?country=FR'
		);
	});

	it('carries the sort when it is not the oldest first', () => {
		expect(manageDelegationsUrl('thimun-2027', { ...EMPTY_DELEGATION_QUERY, sort: 'size' })).toBe(
			'/manage/thimun-2027/delegations?sort=size'
		);
	});

	it('carries any page but the first', () => {
		expect(manageDelegationsUrl('thimun-2027', { ...EMPTY_DELEGATION_QUERY, page: 3 })).toBe(
			'/manage/thimun-2027/delegations?page=3'
		);
	});

	it('carries everything at once, in the order the parameters are written in', () => {
		const query: DelegationListQuery = {
			q: 'lycee',
			status: 'accepted',
			country: 'FR',
			sort: 'name',
			page: 2
		};

		expect(manageDelegationsUrl('thimun-2027', query)).toBe(
			'/manage/thimun-2027/delegations?q=lycee&status=accepted&country=FR&sort=name&page=2'
		);
	});
});

describe('manageDelegationReviewUrl', () => {
	it('puts the slug and the delegation id into the review page address', () => {
		expect(manageDelegationReviewUrl('thimun-2027', 'delegation-lycee')).toBe(
			'/manage/thimun-2027/delegations/delegation-lycee'
		);
	});

	it('carries no query string, unlike the table it is linked from', () => {
		// The review page shows one delegation, so there is nothing to filter or
		// sort; `manageDelegationsUrl` above is the one that carries a query.
		expect(manageDelegationReviewUrl('thimun-2027', 'delegation-lycee')).not.toContain('?');
	});
});

describe('manageAllocationUrl', () => {
	it('is the plain grid when it is asked for no particular seats', () => {
		// What the sidebar asks for.
		expect(manageAllocationUrl('thimun-2027')).toBe('/manage/thimun-2027/allocation');
	});

	it('leaves out everything that is already the default', () => {
		expect(manageAllocationUrl('thimun-2027', EMPTY_ALLOCATION_QUERY)).toBe(
			'/manage/thimun-2027/allocation'
		);
	});

	it('carries the committee filter', () => {
		expect(
			manageAllocationUrl('thimun-2027', { ...EMPTY_ALLOCATION_QUERY, committee: 'c8f2a1b4' })
		).toBe('/manage/thimun-2027/allocation?committee=c8f2a1b4');
	});

	it('carries the state filter', () => {
		expect(manageAllocationUrl('thimun-2027', { ...EMPTY_ALLOCATION_QUERY, state: 'free' })).toBe(
			'/manage/thimun-2027/allocation?state=free'
		);
	});

	it('carries a search over the delegate, the delegation and the seat', () => {
		expect(manageAllocationUrl('thimun-2027', { ...EMPTY_ALLOCATION_QUERY, q: 'kowalska' })).toBe(
			'/manage/thimun-2027/allocation?q=kowalska'
		);
	});

	it('carries the seat a panel is open for', () => {
		expect(
			manageAllocationUrl('thimun-2027', { ...EMPTY_ALLOCATION_QUERY, seat: 'seat-france' })
		).toBe('/manage/thimun-2027/allocation?seat=seat-france');
	});

	it('carries which panel is open', () => {
		expect(manageAllocationUrl('thimun-2027', { ...EMPTY_ALLOCATION_QUERY, action: 'move' })).toBe(
			'/manage/thimun-2027/allocation?action=move'
		);
	});

	it('carries everything at once, in the order the parameters are written in', () => {
		const query: AllocationQuery = {
			committee: 'c8f2a1b4',
			state: 'filled',
			q: 'anna',
			seat: 'seat-france',
			action: 'move'
		};

		expect(manageAllocationUrl('thimun-2027', query)).toBe(
			'/manage/thimun-2027/allocation?committee=c8f2a1b4&state=filled&q=anna&seat=seat-france&action=move'
		);
	});

	it('escapes a search that would otherwise change the address', () => {
		// The words come from a box somebody typed in, and an address is not the
		// place to find out what they put in it.
		expect(manageAllocationUrl('thimun-2027', { ...EMPTY_ALLOCATION_QUERY, q: 'a b&c' })).toBe(
			'/manage/thimun-2027/allocation?q=a+b%26c'
		);
	});
});

describe('manageAllocationActionUrl', () => {
	it('adds the action to a grid that has no filters on it', () => {
		expect(manageAllocationActionUrl('thimun-2027', EMPTY_ALLOCATION_QUERY, 'freeSeat')).toBe(
			'/manage/thimun-2027/allocation?/freeSeat'
		);
	});

	it('keeps the filters and the open panel, so the organiser comes back to them', () => {
		const query: AllocationQuery = {
			...EMPTY_ALLOCATION_QUERY,
			committee: 'c8f2a1b4',
			state: 'filled',
			seat: 'seat-france',
			action: 'move'
		};

		// A plain `?/moveDelegate` would have replaced all of this, and the
		// organiser would have landed back on the whole unfiltered grid.
		expect(manageAllocationActionUrl('thimun-2027', query, 'moveDelegate')).toBe(
			'/manage/thimun-2027/allocation?committee=c8f2a1b4&state=filled&seat=seat-france&action=move&/moveDelegate'
		);
	});

	it('leads to the same seats the grid itself does', () => {
		const query: AllocationQuery = { ...EMPTY_ALLOCATION_QUERY, state: 'reserved' };
		const grid = manageAllocationUrl('thimun-2027', query);

		expect(manageAllocationActionUrl('thimun-2027', query, 'toggleHidden')).toBe(
			`${grid}&/toggleHidden`
		);
	});
});

describe('delegationSeatsUrl', () => {
	it('puts the id into the seats page address', () => {
		expect(delegationSeatsUrl('9f2c8d1e-4a7b-4c21-9f3e-2b8d6c5a1e40')).toBe(
			'/delegations/9f2c8d1e-4a7b-4c21-9f3e-2b8d6c5a1e40/seats'
		);
	});

	it("sits under the delegation's own dashboard", () => {
		const delegationId = '9f2c8d1e-4a7b-4c21-9f3e-2b8d6c5a1e40';

		expect(delegationSeatsUrl(delegationId)).toBe(`${delegationUrl(delegationId)}/seats`);
	});
});

describe('unassignDelegationSeatUrl', () => {
	it('names the action first and carries the seat after it', () => {
		// SvelteKit picks the form action out of the first parameter whose name
		// starts with `/`, so `?/unassign` has to come before `seat=`.
		expect(unassignDelegationSeatUrl('9f2c8d1e', 'seat-france')).toBe(
			'/delegations/9f2c8d1e/seats?/unassign&seat=seat-france'
		);
	});

	it('posts back to the same page the seat is on', () => {
		const delegationId = '9f2c8d1e';

		expect(unassignDelegationSeatUrl(delegationId, 'seat-brazil')).toBe(
			`${delegationSeatsUrl(delegationId)}?/unassign&seat=seat-brazil`
		);
	});

	it('escapes the seat id, so that nothing in it can start a second parameter', () => {
		// A seat id is a database uuid today and needs no escaping. The call is
		// here so that it stays true if one is ever built out of anything typed.
		expect(unassignDelegationSeatUrl('9f2c8d1e', 'a&b')).toBe(
			'/delegations/9f2c8d1e/seats?/unassign&seat=a%26b'
		);
	});
});

describe('delegationMembersUrl', () => {
	it('puts the id into the members page address', () => {
		expect(delegationMembersUrl('9f2c8d1e-4a7b-4c21-9f3e-2b8d6c5a1e40')).toBe(
			'/delegations/9f2c8d1e-4a7b-4c21-9f3e-2b8d6c5a1e40/members'
		);
	});

	it("sits under the delegation's own dashboard, beside the seats page", () => {
		const delegationId = '9f2c8d1e-4a7b-4c21-9f3e-2b8d6c5a1e40';

		expect(delegationMembersUrl(delegationId)).toBe(`${delegationUrl(delegationId)}/members`);
	});
});

describe('removeDelegationMemberUrl', () => {
	it('names the action first and carries the member after it', () => {
		// SvelteKit picks the form action out of the first parameter whose name
		// starts with `/`, so `?/remove` has to come before `user=`.
		expect(removeDelegationMemberUrl('9f2c8d1e', '3b1a7f22')).toBe(
			'/delegations/9f2c8d1e/members?/remove&user=3b1a7f22'
		);
	});

	it('posts back to the same page the member is listed on', () => {
		const delegationId = '9f2c8d1e';

		expect(removeDelegationMemberUrl(delegationId, '3b1a7f22')).toBe(
			`${delegationMembersUrl(delegationId)}?/remove&user=3b1a7f22`
		);
	});

	it('escapes the member id, so that nothing in it can start a second parameter', () => {
		// A user id is a database uuid today and needs no escaping, exactly as the
		// seat id above does not. The call is here so that it stays true anyway.
		expect(removeDelegationMemberUrl('9f2c8d1e', 'a&b')).toBe(
			'/delegations/9f2c8d1e/members?/remove&user=a%26b'
		);
	});
});

describe('myApplicationsUrl', () => {
	it('is the plain page when nothing is chosen', () => {
		expect(myApplicationsUrl()).toBe('/applications');
		expect(myApplicationsUrl(EMPTY_MY_APPLICATIONS_QUERY)).toBe('/applications');
	});

	it('writes the search, the tab and the order when they are not the default', () => {
		const query = { q: 'amsterdam mun', tab: 'accepted', sort: 'name' } as const;

		expect(myApplicationsUrl(query)).toBe('/applications?q=amsterdam+mun&show=accepted&sort=name');
	});

	it('shows the conferences that are over under the "Past" tab', () => {
		expect(myApplicationsUrl({ ...EMPTY_MY_APPLICATIONS_QUERY, tab: 'past' })).toBe(
			'/applications?show=past'
		);
	});
});

describe('myCommitteesUrl', () => {
	it('is the plain page when only the current conferences are wanted', () => {
		expect(myCommitteesUrl()).toBe('/committees');
		expect(myCommitteesUrl(false)).toBe('/committees');
	});

	it('asks for the finished conferences as well', () => {
		expect(myCommitteesUrl(true)).toBe('/committees?past=1');
	});
});

describe('myInvoicesUrl', () => {
	it('is the page that lists everything the reader has been charged', () => {
		expect(myInvoicesUrl()).toBe('/invoices');
	});
});

describe('invoiceUrl', () => {
	it('is one invoice under the list it belongs to', () => {
		expect(invoiceUrl('9f2c8d1e')).toBe('/invoices/9f2c8d1e');
	});

	it('sits under the list page, so the back link there is always right', () => {
		expect(invoiceUrl('9f2c8d1e').startsWith(`${myInvoicesUrl()}/`)).toBe(true);
	});
});

describe('schedule addresses', () => {
	it('builds the editor with only the parts of the view that are set', () => {
		expect(manageScheduleUrl('thimun-2027')).toBe('/manage/thimun-2027/schedule');
		expect(manageScheduleUrl('thimun-2027', { day: '2027-01-26', editEventId: 'event-1' })).toBe(
			'/manage/thimun-2027/schedule?day=2027-01-26&edit=event-1'
		);
		expect(manageScheduleUrl('thimun-2027', { isAddingEvent: true, isAddingSessions: true })).toBe(
			'/manage/thimun-2027/schedule?new=1&sessions=1'
		);
		expect(manageScheduleUrl('thimun-2027', { isList: true, openEventId: 'event-1' })).toBe(
			'/manage/thimun-2027/schedule?view=list&event=event-1'
		);
	});

	it('builds my schedule and one conference programme, with or without a day', () => {
		expect(myScheduleUrl()).toBe('/schedule');
		expect(conferenceScheduleUrl('thimun-2027')).toBe('/conferences/thimun-2027/schedule');
		expect(conferenceScheduleUrl('thimun-2027', { day: '2027-01-26' })).toBe(
			'/conferences/thimun-2027/schedule?day=2027-01-26'
		);
		expect(
			conferenceScheduleUrl('thimun-2027', { day: '2027-01-26', isList: true, openEventId: 'e-1' })
		).toBe('/conferences/thimun-2027/schedule?day=2027-01-26&view=list&event=e-1');
	});
});

describe('announcement addresses', () => {
	it('builds the organiser page, and the same page with one announcement open', () => {
		expect(manageAnnouncementsUrl('thimun-2027')).toBe('/manage/thimun-2027/announcements');
		expect(manageAnnouncementsUrl('thimun-2027', 'announcement-1')).toBe(
			'/manage/thimun-2027/announcements?edit=announcement-1'
		);
	});

	it('builds the delegate page with only the parts of the view that are set', () => {
		expect(conferenceAnnouncementsUrl('thimun-2027')).toBe(
			'/conferences/thimun-2027/announcements'
		);
		expect(conferenceAnnouncementsUrl('thimun-2027', { page: 1 })).toBe(
			'/conferences/thimun-2027/announcements'
		);
		expect(conferenceAnnouncementsUrl('thimun-2027', { page: 2 })).toBe(
			'/conferences/thimun-2027/announcements?page=2'
		);
		expect(conferenceAnnouncementsUrl('thimun-2027', { isRemoved: true })).toBe(
			'/conferences/thimun-2027/announcements?removed=1'
		);
	});
});

describe('manageDocumentsUrl', () => {
	it('leaves the resources tab out, because it is the default', () => {
		expect(manageDocumentsUrl('thimun-2027')).toBe('/manage/thimun-2027/documents');
		expect(manageDocumentsUrl('thimun-2027', { tab: 'resources' })).toBe(
			'/manage/thimun-2027/documents'
		);
	});

	it('writes the tab, committee, filter and open review form into the query', () => {
		const url = manageDocumentsUrl('thimun-2027', {
			tab: 'papers',
			committeeId: 'unsc',
			paper: 'submitted',
			reviewDocumentId: 'paper-1'
		});

		expect(url).toBe(
			'/manage/thimun-2027/documents?tab=papers&committee=unsc&paper=submitted&review=paper-1'
		);
	});
});

describe('manageDocumentsActionUrl', () => {
	it('adds the action after the view, so a refusal comes back on the same committee', () => {
		expect(
			manageDocumentsActionUrl(
				'thimun-2027',
				{ tab: 'papers', committeeId: 'unsc' },
				'requestChanges'
			)
		).toBe('/manage/thimun-2027/documents?tab=papers&committee=unsc&/requestChanges');
	});

	it('starts the query itself on the resources tab', () => {
		expect(manageDocumentsActionUrl('thimun-2027', {}, 'uploadResource')).toBe(
			'/manage/thimun-2027/documents?/uploadResource'
		);
	});
});

describe('approvePaperActionUrl', () => {
	it('carries the paper after the action name', () => {
		expect(
			approvePaperActionUrl('thimun-2027', { tab: 'papers', committeeId: 'unsc' }, 'paper-1')
		).toBe(
			'/manage/thimun-2027/documents?tab=papers&committee=unsc&/approvePaper&documentId=paper-1'
		);
	});
});

describe('manageAwardsUrl', () => {
	it('is the plain awards page when no award is being edited', () => {
		expect(manageAwardsUrl('thimun-2027')).toBe('/manage/thimun-2027/awards');
	});

	it('opens one award\'s "Edit title" form', () => {
		expect(manageAwardsUrl('thimun-2027', 'award-1')).toBe(
			'/manage/thimun-2027/awards?edit=award-1'
		);
	});

	it('escapes an id that would otherwise change the address', () => {
		// The same care `manageFeeEditUrl` above takes: real ids are uuids, but
		// the value arrives from a row rather than from us.
		expect(manageAwardsUrl('thimun-2027', 'a b&c')).toBe(
			'/manage/thimun-2027/awards?edit=a%20b%26c'
		);
	});
});

describe('manageAwardTitleActionUrl', () => {
	it("opens the same row's form again after a refused title", () => {
		expect(manageAwardTitleActionUrl('thimun-2027', 'award-1')).toBe(
			'/manage/thimun-2027/awards?edit=award-1&/updateTitle'
		);
	});
});

describe('manageAwardsCommitteeUrl', () => {
	it('opens one committee\'s "Add award" form and lands on the form', () => {
		expect(manageAwardsCommitteeUrl('thimun-2027', 'committee-1', true)).toBe(
			'/manage/thimun-2027/awards?add=committee-1#add-award-committee-1'
		);
	});

	it("closes the form again and lands on the committee's heading", () => {
		expect(manageAwardsCommitteeUrl('thimun-2027', 'committee-1', false)).toBe(
			'/manage/thimun-2027/awards#awards-committee-1'
		);
	});

	it('escapes an id that would otherwise change the address', () => {
		expect(manageAwardsCommitteeUrl('thimun-2027', 'a b&c', true)).toBe(
			'/manage/thimun-2027/awards?add=a%20b%26c#add-award-a%20b%26c'
		);
	});
});

describe('myResourcesUrl', () => {
	it('is every conference without a slug, and one conference with it', () => {
		expect(myResourcesUrl()).toBe('/resources');
		expect(myResourcesUrl('thimun-2027')).toBe('/resources?conference=thimun-2027');
	});
});

describe('chairRoomUrl', () => {
	it('is the chair folder under the committee page', () => {
		expect(chairRoomUrl('thimun-2027', 'unsc')).toBe(
			'/conferences/thimun-2027/committees/unsc/chair'
		);
	});
});

describe('committeeLiveUrl', () => {
	it('is the live folder under the committee page', () => {
		expect(committeeLiveUrl('thimun-2027', 'unsc')).toBe(
			'/conferences/thimun-2027/committees/unsc/live'
		);
	});
});

describe('committeePapersUrl, newCommitteePaperUrl and committeePaperUrl', () => {
	it('lead to the committee’s papers, the form that starts one, and one paper', () => {
		expect(committeePapersUrl('thimun-2027', 'disec')).toBe(
			'/conferences/thimun-2027/committees/disec/resolutions'
		);
		expect(newCommitteePaperUrl('thimun-2027', 'disec')).toBe(
			'/conferences/thimun-2027/committees/disec/resolutions/new'
		);
		expect(committeePaperUrl('thimun-2027', 'disec', 'paper-1')).toBe(
			'/conferences/thimun-2027/committees/disec/resolutions/paper-1'
		);
	});
});

describe('committeePaperDialogUrl', () => {
	it('opens each of the paper’s dialogs over its page', () => {
		const paper = '/conferences/thimun-2027/committees/disec/resolutions/paper-1';

		expect(committeePaperDialogUrl('thimun-2027', 'disec', 'paper-1', 'add')).toBe(
			`${paper}?add=1`
		);
		expect(committeePaperDialogUrl('thimun-2027', 'disec', 'paper-1', 'leave')).toBe(
			`${paper}?leave=1`
		);
		expect(committeePaperDialogUrl('thimun-2027', 'disec', 'paper-1', 'delete')).toBe(
			`${paper}?delete=1`
		);
	});
});

describe('committeePaperSourceUrl', () => {
	it('opens one of the working papers a draft is based on beside its text', () => {
		expect(committeePaperSourceUrl('thimun-2027', 'disec', 'paper-1', 'working-paper-1')).toBe(
			'/conferences/thimun-2027/committees/disec/resolutions/paper-1?source=working-paper-1'
		);
	});
});

describe('crisisDeskUrl and crisisPaperUrl', () => {
	it("put the crisis staff's page and each paper they answer under the committee", () => {
		expect(crisisDeskUrl('thimun-2027', 'jcc')).toBe(
			'/conferences/thimun-2027/committees/jcc/crisis'
		);
		expect(crisisPaperUrl('thimun-2027', 'jcc', 'paper-1')).toBe(
			'/conferences/thimun-2027/committees/jcc/crisis/paper-1'
		);
	});
});

describe('editCommentUrl and deleteCommentUrl', () => {
	it('open one of the reader’s comments on whichever page the paper is written on', () => {
		const paper = committeePaperUrl('thimun-2027', 'disec', 'paper-1');

		expect(editCommentUrl(paper, 'comment-1', 'thread-1')).toBe(
			`${paper}?editComment=comment-1#thread-thread-1`
		);
		expect(deleteCommentUrl(paper, 'comment-1')).toBe(`${paper}?deleteComment=comment-1`);
	});

	it('add to the query a position paper page already has', () => {
		const paper = positionPaperWayUrl('thimun-2027', 'unsc', 'write');

		expect(editCommentUrl(paper, 'comment-1', 'thread-1')).toBe(
			`${paper}&editComment=comment-1#thread-thread-1`
		);
		expect(deleteCommentUrl(paper, 'comment-1')).toBe(`${paper}&deleteComment=comment-1`);
	});
});

describe('newQuickSessionUrl and quickSessionDelegationsUrl', () => {
	it('lead to setting up a quick session and to its delegations', () => {
		expect(newQuickSessionUrl()).toBe('/quick/new');
		expect(quickSessionDelegationsUrl('quick-abcdefghij')).toBe(
			'/quick/quick-abcdefghij/delegations'
		);
	});
});

describe('committeeDisplayUrl', () => {
	it('is the display folder beside the live view, for the projector', () => {
		expect(committeeDisplayUrl('thimun-2027', 'unsc')).toBe(
			'/conferences/thimun-2027/committees/unsc/display'
		);
	});
});

describe('chairModUrl, chairUnmodUrl and chairSingleUrl', () => {
	it('are the mod, unmod and single folders under the chair room', () => {
		const room = '/conferences/thimun-2027/committees/unsc/chair';

		expect(chairModUrl('thimun-2027', 'unsc')).toBe(`${room}/mod`);
		expect(chairUnmodUrl('thimun-2027', 'unsc')).toBe(`${room}/unmod`);
		expect(chairSingleUrl('thimun-2027', 'unsc')).toBe(`${room}/single`);
	});
});

describe('rollCallViewUrl', () => {
	const rollCall = '/conferences/thimun-2027/committees/unsc/chair/roll-call';

	it('is the plain roll call view with nothing to say', () => {
		expect(
			rollCallViewUrl('thimun-2027', 'unsc', { rollCallId: null, seatId: null, from: 'chair' })
		).toBe(rollCall);
	});

	it('names the roll call, the row and the page it was opened from', () => {
		expect(
			rollCallViewUrl('thimun-2027', 'unsc', {
				rollCallId: 'roll-1',
				seatId: 'seat-fr',
				from: 'gsl'
			})
		).toBe(`${rollCall}?rollCall=roll-1&seat=seat-fr&from=gsl`);
	});

	it('leaves out `from` when it names the live room', () => {
		expect(
			rollCallViewUrl('thimun-2027', 'unsc', { rollCallId: 'roll-1', seatId: null, from: 'chair' })
		).toBe(`${rollCall}?rollCall=roll-1`);
	});
});

describe('chairGslUrl', () => {
	it('is the gsl folder under the chair room', () => {
		expect(chairGslUrl('thimun-2027', 'unsc')).toBe(
			'/conferences/thimun-2027/committees/unsc/chair/gsl'
		);
	});
});

describe('chairPageUrl', () => {
	const room = '/conferences/thimun-2027/committees/unsc/chair';

	it('is the live room for `chair`, and each page inside the frame its own route', () => {
		expect(chairPageUrl('thimun-2027', 'unsc', 'chair')).toBe(room);
		expect(chairPageUrl('thimun-2027', 'unsc', 'gsl')).toBe(`${room}/gsl`);
		expect(chairPageUrl('thimun-2027', 'unsc', 'motions')).toBe(`${room}/motions`);
		expect(chairPageUrl('thimun-2027', 'unsc', 'voting')).toBe(`${room}/voting`);
		expect(chairPageUrl('thimun-2027', 'unsc', 'roll-call')).toBe(`${room}/roll-call`);
		expect(chairPageUrl('thimun-2027', 'unsc', 'papers')).toBe(`${room}/papers`);
		expect(chairPageUrl('thimun-2027', 'unsc', 'resolutions')).toBe(`${room}/resolutions`);
		expect(chairPageUrl('thimun-2027', 'unsc', 'notes')).toBe(`${room}/notes`);
		expect(chairPageUrl('thimun-2027', 'unsc', 'awards')).toBe(`${room}/awards`);
	});

	it('leads to the Mod, Unmod and Single speaker views on their own routes (S7, S8, S9)', () => {
		expect(chairPageUrl('thimun-2027', 'unsc', 'mod')).toBe(`${room}/mod`);
		expect(chairPageUrl('thimun-2027', 'unsc', 'unmod')).toBe(`${room}/unmod`);
		expect(chairPageUrl('thimun-2027', 'unsc', 'single')).toBe(`${room}/single`);
	});
});

describe('chairFrameAction', () => {
	it("posts to the live room's action, naming the page the chair pressed it on", () => {
		expect(chairFrameAction('thimun-2027', 'unsc', 'timerPause', 'motions')).toBe(
			'/conferences/thimun-2027/committees/unsc/chair?fromView=motions&/timerPause'
		);
		expect(chairFrameAction('thimun-2027', 'unsc', 'setAgenda', 'roll-call')).toBe(
			'/conferences/thimun-2027/committees/unsc/chair?fromView=roll-call&/setAgenda'
		);
	});

	it('is the plain action when pressed on the live room itself', () => {
		expect(chairFrameAction('thimun-2027', 'unsc', 'endSession', 'chair')).toBe(
			'/conferences/thimun-2027/committees/unsc/chair?/endSession'
		);
	});
});

describe('chairRollCallFromUrl', () => {
	it('names the view the roll call was opened from', () => {
		expect(chairRollCallFromUrl('thimun-2027', 'unsc', 'gsl')).toBe(
			'/conferences/thimun-2027/committees/unsc/chair/roll-call?from=gsl'
		);
	});

	it('is the plain roll call when opened from the live room', () => {
		expect(chairRollCallFromUrl('thimun-2027', 'unsc', 'chair')).toBe(
			'/conferences/thimun-2027/committees/unsc/chair/roll-call'
		);
	});
});

describe('pageWithQuery', () => {
	it('sets one parameter and keeps the rest of the address', () => {
		const url = new URL(
			'https://munmeet.test/conferences/mun/committees/unsc/chair/motions?session=s1'
		);

		expect(pageWithQuery(url, 'end', 'confirm')).toBe(
			'/conferences/mun/committees/unsc/chair/motions?session=s1&end=confirm'
		);
	});

	it('takes the parameter away, leaving no empty question mark', () => {
		const url = new URL('https://munmeet.test/conferences/mun/committees/unsc/chair?end=confirm');

		expect(pageWithQuery(url, 'end', null)).toBe('/conferences/mun/committees/unsc/chair');
	});
});

describe('chairRollCallAction', () => {
	it('names the Roll call page and one of its actions', () => {
		expect(chairRollCallAction('thimun-2027', 'unsc', 'setStatus')).toBe(
			'/conferences/thimun-2027/committees/unsc/chair/roll-call?/setStatus'
		);
		expect(chairRollCallAction('thimun-2027', 'unsc', 'markAllPresent')).toBe(
			'/conferences/thimun-2027/committees/unsc/chair/roll-call?/markAllPresent'
		);
	});
});

describe('chairRollCallUrl', () => {
	it('is the roll-call folder under the chair room', () => {
		expect(chairRollCallUrl('thimun-2027', 'unsc')).toBe(
			'/conferences/thimun-2027/committees/unsc/chair/roll-call'
		);
	});
});

describe('chairRollCallDraftUrl', () => {
	it('names the roll call being edited', () => {
		expect(chairRollCallDraftUrl('thimun-2027', 'unsc', 'roll-1')).toBe(
			'/conferences/thimun-2027/committees/unsc/chair/roll-call?rollCall=roll-1'
		);
	});

	it('names the seat whose row keeps the focus', () => {
		expect(chairRollCallDraftUrl('thimun-2027', 'unsc', 'roll-1', 'seat-2')).toBe(
			'/conferences/thimun-2027/committees/unsc/chair/roll-call?rollCall=roll-1&seat=seat-2'
		);
	});
});

describe('chairMotionsUrl', () => {
	it('sits under the chair room', () => {
		expect(chairMotionsUrl('thimun-2027', 'unsc')).toBe(
			'/conferences/thimun-2027/committees/unsc/chair/motions'
		);
	});
});

describe('chairVotingUrl', () => {
	it('sits under the chair room', () => {
		expect(chairVotingUrl('thimun-2027', 'unsc')).toBe(
			'/conferences/thimun-2027/committees/unsc/chair/voting'
		);
	});
});

describe('chairPapersUrl', () => {
	it('sits under the chair room, with the status filter when there is one', () => {
		expect(chairPapersUrl('thimun-2027', 'unsc')).toBe(
			'/conferences/thimun-2027/committees/unsc/chair/papers'
		);
		expect(chairPapersUrl('thimun-2027', 'unsc', 'changes_requested')).toBe(
			'/conferences/thimun-2027/committees/unsc/chair/papers?status=changes_requested'
		);
	});
});

describe('chairResolutionsUrl', () => {
	it('sits under the chair room', () => {
		expect(chairResolutionsUrl('thimun-2027', 'disec')).toBe(
			'/conferences/thimun-2027/committees/disec/chair/resolutions'
		);
	});
});

describe('chairResolutionUrl', () => {
	it('is one paper under the Resolutions page, by its id', () => {
		expect(chairResolutionUrl('thimun-2027', 'disec', 'paper-1')).toBe(
			'/conferences/thimun-2027/committees/disec/chair/resolutions/paper-1'
		);
	});
});

describe('chairResolutionDialogUrl', () => {
	it('opens the return and withdraw dialogs in the address', () => {
		expect(chairResolutionDialogUrl('thimun-2027', 'disec', 'paper-1', 'return')).toBe(
			'/conferences/thimun-2027/committees/disec/chair/resolutions/paper-1?return=1'
		);
		expect(chairResolutionDialogUrl('thimun-2027', 'disec', 'paper-1', 'withdraw')).toBe(
			'/conferences/thimun-2027/committees/disec/chair/resolutions/paper-1?withdraw=1'
		);
	});
});

describe('chairPaperReadingUrl', () => {
	it('sits under the papers page, by seat, and its actions follow the address', () => {
		expect(chairPaperReadingUrl('thimun-2027', 'unsc', 'seat-1')).toBe(
			'/conferences/thimun-2027/committees/unsc/chair/papers/seat-1'
		);
		expect(chairPaperReadingActionUrl('thimun-2027', 'unsc', 'seat-1', 'approve')).toBe(
			'/conferences/thimun-2027/committees/unsc/chair/papers/seat-1?/approve'
		);
	});
});

describe('chairNotesUrl', () => {
	it('sits under the chair room, with the chosen seat when there is one', () => {
		expect(chairNotesUrl('thimun-2027', 'unsc')).toBe(
			'/conferences/thimun-2027/committees/unsc/chair/notes'
		);
		expect(chairNotesUrl('thimun-2027', 'unsc', 'seat 1')).toBe(
			'/conferences/thimun-2027/committees/unsc/chair/notes?seat=seat%201'
		);
	});
});

describe('chairSessionNotesUrl', () => {
	it('sits under the Notes page, naming the session', () => {
		expect(chairSessionNotesUrl('thimun-2027', 'unsc', 'session-1')).toBe(
			'/conferences/thimun-2027/committees/unsc/chair/notes/sessions/session-1'
		);
	});
});

describe('chairVotingSeatUrl', () => {
	it('names the seat whose row gets the focus back', () => {
		expect(chairVotingSeatUrl('thimun-2027', 'unsc', 'seat 1')).toBe(
			'/conferences/thimun-2027/committees/unsc/chair/voting?seat=seat+1'
		);
	});
});

describe('chairMotionsSessionUrl', () => {
	it('names the ended session to show', () => {
		expect(chairMotionsSessionUrl('thimun-2027', 'unsc', 'session 1')).toBe(
			'/conferences/thimun-2027/committees/unsc/chair/motions?session=session%201'
		);
	});
});

describe('chairMotionsMotionUrl and chairMotionsRestoreAction', () => {
	it('names the motion put to the vote out of order', () => {
		expect(chairMotionsMotionUrl('thimun-2027', 'unsc', 'motion 1')).toBe(
			'/conferences/thimun-2027/committees/unsc/chair/motions?motion=motion%201'
		);
	});

	it('is the Motions view’s restore action, for the toast’s Undo', () => {
		expect(chairMotionsRestoreAction('thimun-2027', 'unsc')).toBe(
			'/conferences/thimun-2027/committees/unsc/chair/motions?/restore'
		);
	});
});

describe('chairVoteViewUrl', () => {
	it('asks the Vote view a question on the page that draws it', () => {
		expect(chairVoteViewUrl('thimun-2027', 'unsc', 'voting', 'vote=new')).toBe(
			'/conferences/thimun-2027/committees/unsc/chair/voting?vote=new'
		);
		expect(chairVoteViewUrl('thimun-2027', 'unsc', 'chair', 'cancel=confirm')).toBe(
			'/conferences/thimun-2027/committees/unsc/chair?cancel=confirm'
		);
	});
});

describe('positionPaperUrl', () => {
	it('sits under the committee page', () => {
		expect(positionPaperUrl('thimun-2027', 'unsc')).toBe(
			'/conferences/thimun-2027/committees/unsc/position-paper'
		);
	});
});

describe('positionPaperWayUrl', () => {
	it('names the way, and adds edit=1 for "Edit and resubmit"', () => {
		expect(positionPaperWayUrl('thimun-2027', 'unsc', 'upload')).toBe(
			'/conferences/thimun-2027/committees/unsc/position-paper?way=upload'
		);
		expect(positionPaperWayUrl('thimun-2027', 'unsc', 'write', true)).toBe(
			'/conferences/thimun-2027/committees/unsc/position-paper?way=write&edit=1'
		);
	});
});

describe('manageParticipantsUrl', () => {
	it('is the plain list when nothing is filtered', () => {
		expect(manageParticipantsUrl('thimun-2027')).toBe('/manage/thimun-2027/participants');
	});

	it('carries every filter, the sort and the page in the address', () => {
		const query: ParticipantQuery = {
			q: 'anna',
			committee: 'committee-unsc',
			delegation: 'none',
			invoice: 'unpaid',
			paper: 'missing',
			sort: 'name',
			page: 2
		};

		expect(manageParticipantsUrl('thimun-2027', query)).toBe(
			'/manage/thimun-2027/participants?q=anna&committee=committee-unsc&delegation=none&invoice=unpaid&paper=missing&sort=name&page=2'
		);
	});
});

describe('manageParticipantsExportUrl', () => {
	it('is the plain endpoint when nothing is filtered', () => {
		expect(manageParticipantsExportUrl('thimun-2027', EMPTY_PARTICIPANT_QUERY)).toBe(
			'/manage/thimun-2027/participants/export'
		);
	});

	it('carries the filters and the sort but never the page', () => {
		const query: ParticipantQuery = {
			...EMPTY_PARTICIPANT_QUERY,
			invoice: 'unpaid',
			sort: 'institution',
			page: 3
		};

		expect(manageParticipantsExportUrl('thimun-2027', query)).toBe(
			'/manage/thimun-2027/participants/export?invoice=unpaid&sort=institution'
		);
	});
});

describe('manageParticipantsActionUrl', () => {
	it('names the action after a bare address', () => {
		expect(
			manageParticipantsActionUrl('thimun-2027', EMPTY_PARTICIPANT_QUERY, 'removeFromSeat')
		).toBe('/manage/thimun-2027/participants?/removeFromSeat');
	});

	it('keeps the filters in front of the action', () => {
		const query: ParticipantQuery = { ...EMPTY_PARTICIPANT_QUERY, paper: 'approved' };

		expect(manageParticipantsActionUrl('thimun-2027', query, 'removeFromSeat')).toBe(
			'/manage/thimun-2027/participants?paper=approved&/removeFromSeat'
		);
	});
});

describe('chairNoteAddedUrl', () => {
	it('opens the seat with the marker that focuses the note box', () => {
		expect(chairNoteAddedUrl('thimun-2027', 'unsc', 'seat-1')).toBe(
			'/conferences/thimun-2027/committees/unsc/chair/notes?seat=seat-1&added=1'
		);
	});
});

describe('chairNotesActionUrl', () => {
	it('keeps the seat in the address, so a refused note comes back on it', () => {
		expect(chairNotesActionUrl('thimun-2027', 'unsc', 'seat-1', 'add')).toBe(
			'/conferences/thimun-2027/committees/unsc/chair/notes?seat=seat-1&/add'
		);
	});
});

describe('chairPapersActionUrl', () => {
	it('adds the action after the status filter', () => {
		expect(chairPapersActionUrl('thimun-2027', 'unsc', 'submitted', 'approve')).toBe(
			'/conferences/thimun-2027/committees/unsc/chair/papers?status=submitted&/approve'
		);
	});

	it('starts the query string itself when there is no filter', () => {
		expect(chairPapersActionUrl('thimun-2027', 'unsc', null, 'approveAll')).toBe(
			'/conferences/thimun-2027/committees/unsc/chair/papers?/approveAll'
		);
	});
});

describe('chairAwardsUrl', () => {
	it('sits under the chair room', () => {
		expect(chairAwardsUrl('thimun-2027', 'security-council')).toBe(
			'/conferences/thimun-2027/committees/security-council/chair/awards'
		);
	});

	it("opens one award's proposal form for editing", () => {
		expect(chairAwardsUrl('thimun-2027', 'security-council', 'award-1')).toBe(
			'/conferences/thimun-2027/committees/security-council/chair/awards?edit=award-1'
		);
	});
});

describe('chairAwardUpdateActionUrl', () => {
	it('keeps the award being edited in the address, so a refusal comes back on it', () => {
		expect(chairAwardUpdateActionUrl('thimun-2027', 'security-council', 'award-1')).toBe(
			'/conferences/thimun-2027/committees/security-council/chair/awards?edit=award-1&/update'
		);
	});
});

describe('delegationPapersUrl and delegationPaperUrl', () => {
	const delegationId = '9f2c8d1e-4a7b-4c21-9f3e-2b8d6c5a1e40';

	it("puts the delegation's position papers under its own dashboard (T147)", () => {
		expect(delegationPapersUrl(delegationId)).toBe(`${delegationUrl(delegationId)}/papers`);
	});

	it("puts one member's paper under the list, by its seat", () => {
		expect(delegationPaperUrl(delegationId, 'seat-1')).toBe(
			`/delegations/${delegationId}/papers/seat-1`
		);
	});
});

describe('managePublishUrl', () => {
	it('is the last setup step of a draft', () => {
		expect(managePublishUrl('thimun-2027')).toBe('/manage/thimun-2027/publish');
	});
});

describe('managePublishedUrl', () => {
	it('is the page a conference lands on once it is published', () => {
		expect(managePublishedUrl('thimun-2027')).toBe('/manage/thimun-2027/published');
	});
});

describe('committeePaperPrintUrl', () => {
	it('leads to a passed paper’s record copy', () => {
		expect(committeePaperPrintUrl('thimun-2027', 'disec', 'paper-1')).toBe(
			'/conferences/thimun-2027/committees/disec/resolutions/paper-1/print'
		);
	});
});

describe('newAmendmentUrl', () => {
	it('is the form under the draft, and amends an amendment with its id', () => {
		expect(newAmendmentUrl('thimun-2027', 'disec', 'paper-1')).toBe(
			'/conferences/thimun-2027/committees/disec/resolutions/paper-1/amendments/new'
		);
		expect(newAmendmentUrl('thimun-2027', 'disec', 'paper-1', 'amendment-2')).toBe(
			'/conferences/thimun-2027/committees/disec/resolutions/paper-1/amendments/new?amend=amendment-2'
		);
	});
});

describe('withdrawAmendmentUrl', () => {
	it('opens the dialog over the draft by the amendment’s number', () => {
		expect(withdrawAmendmentUrl('thimun-2027', 'disec', 'paper-1', 3)).toBe(
			'/conferences/thimun-2027/committees/disec/resolutions/paper-1?withdrawAmendment=3'
		);
	});
});

describe('ruleOutAmendmentUrl', () => {
	it('opens the dialog over the dais’s review by the amendment’s number', () => {
		expect(ruleOutAmendmentUrl('thimun-2027', 'disec', 'paper-1', 3)).toBe(
			'/conferences/thimun-2027/committees/disec/chair/resolutions/paper-1?ruleOut=3'
		);
	});
});

describe('paperAmendmentUrl, chairAmendmentUrl and chairAmendmentQueueUrl', () => {
	it('points at an amendment’s card on the draft and on the dais’s review', () => {
		expect(paperAmendmentUrl('thimun-2027', 'disec', 'paper-1', 3)).toBe(
			'/conferences/thimun-2027/committees/disec/resolutions/paper-1#amendment-3'
		);
		expect(chairAmendmentUrl('thimun-2027', 'disec', 'paper-1', 3)).toBe(
			'/conferences/thimun-2027/committees/disec/chair/resolutions/paper-1#amendment-3'
		);
	});

	it('points at the dais’s queue of amendments', () => {
		expect(chairAmendmentQueueUrl('thimun-2027', 'disec')).toBe(
			'/conferences/thimun-2027/committees/disec/chair/resolutions#amendments'
		);
	});
});
