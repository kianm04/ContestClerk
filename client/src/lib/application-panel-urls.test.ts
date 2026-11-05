import { describe, expect, it } from 'vitest';
import {
	applicationPanelActionUrl,
	applicationPanelUrl,
	applicationRowLinks,
	reviewPanelLinks
} from './application-panel-urls';
import { EMPTY_APPLICATION_LIST_QUERY, type ApplicationListQuery } from './applications';

const LIST_PATH = '/manage/thimun-2027/applications';

/** The waitlisted tab, second page: the list state every address must keep. */
const WAITLISTED_PAGE_TWO: ApplicationListQuery = {
	...EMPTY_APPLICATION_LIST_QUERY,
	status: 'waitlisted',
	page: 2
};

describe('applicationPanelUrl', () => {
	it('adds the application to an otherwise plain list', () => {
		expect(applicationPanelUrl('thimun-2027', EMPTY_APPLICATION_LIST_QUERY, 'louis')).toBe(
			`${LIST_PATH}?application=louis`
		);
	});

	it('keeps the tab, the filters and the page beside it', () => {
		expect(applicationPanelUrl('thimun-2027', WAITLISTED_PAGE_TWO, 'louis')).toBe(
			`${LIST_PATH}?status=waitlisted&page=2&application=louis`
		);
	});
});

describe('applicationPanelActionUrl', () => {
	it('adds the action to the end, after the application', () => {
		expect(
			applicationPanelActionUrl('thimun-2027', WAITLISTED_PAGE_TWO, 'louis', 'reviewAccept')
		).toBe(`${LIST_PATH}?status=waitlisted&page=2&application=louis&/reviewAccept`);
	});
});

describe('applicationRowLinks', () => {
	it('leads to the review page and to the panel, both keeping the list', () => {
		expect(applicationRowLinks('thimun-2027', WAITLISTED_PAGE_TWO, 'louis')).toEqual({
			reviewHref: `${LIST_PATH}/louis?status=waitlisted&page=2`,
			panelHref: `${LIST_PATH}?status=waitlisted&page=2&application=louis`
		});
	});
});

describe('reviewPanelLinks', () => {
	it('points the arrows at the neighbours and the forms at this application', () => {
		const links = reviewPanelLinks('thimun-2027', EMPTY_APPLICATION_LIST_QUERY, 'amani', {
			previousId: 'louis',
			nextId: 'felix'
		});

		expect(links).toEqual({
			previousHref: `${LIST_PATH}?application=louis`,
			nextHref: `${LIST_PATH}?application=felix`,
			fullApplicationHref: `${LIST_PATH}/amani`,
			acceptAction: `${LIST_PATH}?application=amani&/reviewAccept`,
			waitlistAction: `${LIST_PATH}?application=amani&/reviewWaitlist`,
			rejectAction: `${LIST_PATH}?application=amani&/reviewReject`,
			saveNoteAction: `${LIST_PATH}?application=amani&/reviewSaveNote`
		});
	});

	it('draws no arrow where there is no row to go to', () => {
		const links = reviewPanelLinks('thimun-2027', EMPTY_APPLICATION_LIST_QUERY, 'louis', {
			previousId: null,
			nextId: null
		});

		expect(links.previousHref).toBeNull();
		expect(links.nextHref).toBeNull();
	});
});
