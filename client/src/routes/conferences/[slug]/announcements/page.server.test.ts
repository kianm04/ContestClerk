import { beforeEach, describe, expect, it, vi } from 'vitest';
import { load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in event below is exactly the shape `load` is given.
import type { PageServerLoadEvent } from './$types';
import type { ReaderAnnouncement } from '$lib/announcements';
import type { Conference } from '$lib/conferences';
import { NO_MEMBERSHIP, type AudienceMembership } from '$lib/schedule';
import { loginUrl } from '$lib/urls';

// Who the reader is and what the database answers are stood in for, so these
// tests are about who `load` lets in and what it hands the page. Which
// announcements each reader is allowed to see is tested in
// `tests/db/announcements.test.ts`, because Row Level Security decides it.
vi.mock('$lib/server/conferences', () => ({ getConferenceBySlug: vi.fn() }));
vi.mock('$lib/server/schedule', () => ({ readMyMembership: vi.fn() }));

vi.mock('$lib/server/announcements', () => ({
	listAnnouncementsFor: vi.fn(),
	markAnnouncementNotificationsRead: vi.fn()
}));

import { listAnnouncementsFor, markAnnouncementNotificationsRead } from '$lib/server/announcements';
import { getConferenceBySlug } from '$lib/server/conferences';
import { readMyMembership } from '$lib/server/schedule';

/** The Supabase client. `load` only hands it on. */
const SUPABASE = {};

const CONFERENCE = {
	id: 'conference-1',
	slug: 'riverside-mun-2027',
	name: 'Riverside MUN 2027',
	timezone: 'Europe/Amsterdam'
} as unknown as Conference;

const PAGE_PATH = '/conferences/riverside-mun-2027/announcements';

/** A delegate: taking part, but not staff. */
const DELEGATE_MEMBERSHIP: AudienceMembership = {
	isOrganiser: false,
	isParticipant: true,
	isStaff: false,
	committeeIds: []
};

const ANNOUNCEMENT: ReaderAnnouncement = {
	id: 'announcement-1',
	title: 'Dress code',
	body: 'Western business attire.',
	audience: 'everyone',
	committeeId: null,
	committeeAbbreviation: null,
	delegationId: null,
	delegationName: null,
	isPinned: false,
	publishedAt: '2027-01-21T10:00:00Z',
	authorId: 'organiser-1',
	authorName: 'Sara Lind',
	authorLine: 'Secretariat'
};

/**
 * The few pieces of a request that `load` here actually reads. `claims` is
 * what `getVerifiedClaims` answers: the signed-in account's, or null.
 */
function makeLoadEvent(
	search: string = '',
	claims: unknown = { sub: 'user-1' }
): PageServerLoadEvent {
	return {
		params: { slug: CONFERENCE.slug },
		url: new URL(`http://localhost${PAGE_PATH}${search}`),
		locals: { supabase: SUPABASE, getVerifiedClaims: async () => claims }
	} as unknown as PageServerLoadEvent;
}

/** `redirect` and `error` throw rather than return, so this catches what was thrown. */
async function catchThrown(run: () => unknown): Promise<{ status: number; location?: string }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number; location?: string };
	}

	throw new Error('Nothing was thrown.');
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(getConferenceBySlug).mockResolvedValue(CONFERENCE);
	vi.mocked(readMyMembership).mockResolvedValue(DELEGATE_MEMBERSHIP);
	vi.mocked(listAnnouncementsFor).mockResolvedValue({ rows: [ANNOUNCEMENT], total: 45 });
	vi.mocked(markAnnouncementNotificationsRead).mockResolvedValue(undefined);
});

describe('load', () => {
	it('answers 404 when there is no conference of this slug', async () => {
		vi.mocked(getConferenceBySlug).mockResolvedValue(null);

		const thrown = await catchThrown(() => load(makeLoadEvent()));

		expect(thrown.status).toBe(404);
	});

	it('sends a visitor to sign in, and back here afterwards', async () => {
		const thrown = await catchThrown(() => load(makeLoadEvent('?page=2', null)));

		expect(thrown).toMatchObject({ status: 303, location: loginUrl(`${PAGE_PATH}?page=2`) });
		expect(listAnnouncementsFor).not.toHaveBeenCalled();
	});

	it('answers 404 to somebody who has no part in the conference', async () => {
		vi.mocked(readMyMembership).mockResolvedValue(NO_MEMBERSHIP);

		const thrown = await catchThrown(() => load(makeLoadEvent()));

		expect(thrown.status).toBe(404);
		expect(markAnnouncementNotificationsRead).not.toHaveBeenCalled();
	});

	it('shows a member the page the address asks for, and how many pages there are', async () => {
		const data = await load(makeLoadEvent('?page=2'));

		expect(listAnnouncementsFor).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, 2);
		expect(data).toMatchObject({
			announcements: [ANNOUNCEMENT],
			page: 2,
			pageCount: 3,
			isRemoved: false
		});
	});

	it('marks this conference’s announcement notifications read', async () => {
		await load(makeLoadEvent());

		expect(markAnnouncementNotificationsRead).toHaveBeenCalledWith(
			SUPABASE,
			'user-1',
			CONFERENCE.id
		);
	});

	it('says an announcement was removed when a notification led here for one', async () => {
		const data = await load(makeLoadEvent('?removed=1'));

		expect(data).toMatchObject({ isRemoved: true });
	});

	it('lets the staff in too', async () => {
		vi.mocked(readMyMembership).mockResolvedValue({ ...NO_MEMBERSHIP, isStaff: true });

		const data = await load(makeLoadEvent());

		expect(data).toMatchObject({ announcements: [ANNOUNCEMENT] });
	});
});
