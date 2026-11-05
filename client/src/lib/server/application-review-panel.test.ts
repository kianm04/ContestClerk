import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SeatGroup } from '$lib/allocation';
import {
	UNKNOWN_AGE,
	type ApplicationForReview,
	type ReviewApplication
} from '$lib/application-review';
import { EMPTY_APPLICATION_LIST_QUERY } from '$lib/applications';
import type { PrivateDetailsAccess } from '$lib/private-details';
import { loadReviewPanel } from './application-review-panel';

// The two queries are stood in for: what they read is tested beside them.
vi.mock('$lib/server/application-review', () => ({ getApplicationForReview: vi.fn() }));
vi.mock('$lib/server/seat-acceptance', () => ({ listSeatsByCommittee: vi.fn() }));

import { getApplicationForReview } from '$lib/server/application-review';
import { listSeatsByCommittee } from '$lib/server/seat-acceptance';

/** The Supabase client. `loadReviewPanel` only hands it on. */
const SUPABASE = {} as SupabaseClient;

/** The day the panel is drawn on, for the applicant's age. */
const TODAY = new Date('2026-10-02T12:00:00Z');

/** A reader holding both detail permissions on this conference. */
const FULL_ACCESS: PrivateDetailsAccess = { contact: true, welfare: true };

const CONFERENCE = { id: 'conference-1', slug: 'thimun-2027', timezone: 'Europe/London' };

/** The first page of the tab: Louis, Anna and Felix, of four in all. */
const PAGE = { rows: [{ id: 'louis' }, { id: 'application-1' }, { id: 'felix' }], total: 4 };

const LIST_PATH = '/manage/thimun-2027/applications';

const SEAT_GROUPS: SeatGroup[] = [
	{
		committeeId: 'committee-1',
		committeeLabel: 'UNSC',
		seats: [
			{
				id: 'seat-france',
				committeeId: 'committee-1',
				name: 'France',
				countryCode: 'FR',
				isAvailable: true,
				delegationId: null,
				userId: null
			}
		]
	}
];

/** Anna's application, born in March 2008, `submitted` unless a test says otherwise. */
function review(overrides: Partial<ReviewApplication> = {}): ApplicationForReview {
	return {
		application: {
			id: 'application-1',
			conferenceId: 'conference-1',
			status: 'submitted',
			committeePreferences: ['committee-1'],
			seatPreferences: null,
			motivation: 'I love debating.',
			answers: {},
			submittedAt: '2026-10-01T09:00:00Z',
			decidedAt: null,
			decisionNote: null,
			internalNote: null,
			...overrides
		},
		profile: {
			userId: 'user-applicant',
			fullName: 'Anna Kowalski',
			avatarPath: null,
			institutionName: null,
			countryCode: null,
			experienceLevel: null
		},
		details: {
			email: 'anna@example.test',
			dateOfBirth: '2008-03-01',
			phone: null,
			dietaryRequirements: null,
			emergencyContactName: null,
			emergencyContactPhone: null
		},
		questions: [],
		preferredCommittees: ['UNSC'],
		seat: null,
		invoice: null
	};
}

beforeEach(() => {
	vi.resetAllMocks();
	vi.mocked(listSeatsByCommittee).mockResolvedValue(SEAT_GROUPS);
	vi.mocked(getApplicationForReview).mockResolvedValue(review());
});

/** The panel for this page, with the address naming `requestedId`. */
function load(requestedId: string | null, page = PAGE, access = FULL_ACCESS) {
	return loadReviewPanel(
		SUPABASE,
		CONFERENCE,
		EMPTY_APPLICATION_LIST_QUERY,
		page,
		requestedId,
		TODAY,
		access
	);
}

describe('loadReviewPanel', () => {
	it('draws the application the address names, with its seats and its links', async () => {
		const panel = await load('application-1');

		expect(getApplicationForReview).toHaveBeenCalledWith(SUPABASE, 'conference-1', 'application-1');
		expect(listSeatsByCommittee).toHaveBeenCalledWith(SUPABASE, 'conference-1', ['committee-1']);
		expect(panel).toMatchObject({
			applicationId: 'application-1',
			applicantName: 'Anna Kowalski',
			metaLine: 'Applied 1 October · 2 of 4',
			motivation: 'I love debating.',
			internalNote: '',
			canAccept: true,
			canWaitlist: true,
			canReject: true,
			seatOptions: [{ value: 'seat-france', label: 'UNSC · France' }]
		});
		expect(panel?.facts).toContainEqual({ label: 'Age', value: '18' });
		expect(panel?.links.previousHref).toBe(`${LIST_PATH}?application=louis`);
		expect(panel?.links.nextHref).toBe(`${LIST_PATH}?application=felix`);
	});

	it('shows the age only to a reader holding welfare details on this conference', async () => {
		// The views behind `getApplicationForReview` answer for anybody taking part
		// where the reader holds the permission, which may be another conference.
		const panel = await load('application-1', PAGE, { contact: true, welfare: false });

		expect(panel?.facts).toContainEqual({ label: 'Age', value: UNKNOWN_AGE });
	});

	it('draws the first row when the address names none, or one not on the page', async () => {
		await load(null);
		await load('somebody-else');

		expect(getApplicationForReview).toHaveBeenNthCalledWith(1, SUPABASE, 'conference-1', 'louis');
		expect(getApplicationForReview).toHaveBeenNthCalledWith(2, SUPABASE, 'conference-1', 'louis');
	});

	it('offers no seats and no decisions for an application already decided', async () => {
		vi.mocked(getApplicationForReview).mockResolvedValue(review({ status: 'accepted' }));

		const panel = await load('application-1');

		expect(listSeatsByCommittee).not.toHaveBeenCalled();
		expect(panel).toMatchObject({
			canAccept: false,
			canWaitlist: false,
			canReject: false,
			seatOptions: []
		});
	});

	it('is null for a page with no rows, without reading anything', async () => {
		expect(await load(null, { rows: [], total: 0 })).toBeNull();
		expect(getApplicationForReview).not.toHaveBeenCalled();
	});

	it('is null when the application has gone since the list was read', async () => {
		vi.mocked(getApplicationForReview).mockResolvedValue(null);

		expect(await load('application-1')).toBeNull();
	});
});
