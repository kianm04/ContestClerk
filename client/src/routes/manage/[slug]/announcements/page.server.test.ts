import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the actions are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import type { Announcement } from '$lib/announcements';
import type { Conference } from '$lib/conferences';

// The gates, the queries and the flash cookie are stood in for, so these tests
// are about what `load` and the five actions decide. What the database allows
// and whom the trigger notifies are tested in `tests/db/announcements.test.ts`.
// `$lib/announcement-form` is deliberately real: the messages checked below are
// the ones the organiser sees.
vi.mock('$lib/server/access', () => ({
	requirePermissionSomewhere: vi.fn(),
	requireUser: vi.fn(),
	requireManagePage: vi.fn()
}));

vi.mock('$lib/server/announcements', () => ({
	countAudience: vi.fn(),
	createAnnouncement: vi.fn(),
	deleteAnnouncement: vi.fn(),
	getAnnouncement: vi.fn(),
	listAcceptedDelegations: vi.fn(),
	listAnnouncementCommittees: vi.fn(),
	listAnnouncementsForOrganiser: vi.fn(),
	setAnnouncementPinned: vi.fn(),
	updateAnnouncement: vi.fn()
}));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

import { requireManagePage, requirePermissionSomewhere, requireUser } from '$lib/server/access';
import {
	countAudience,
	createAnnouncement,
	deleteAnnouncement,
	getAnnouncement,
	listAcceptedDelegations,
	listAnnouncementCommittees,
	listAnnouncementsForOrganiser,
	setAnnouncementPinned,
	updateAnnouncement
} from '$lib/server/announcements';
import { setFlash } from '$lib/server/flash';
import type { MyPermissions } from '$lib/permissions';

/** What the layout hands down for an organiser: `administrator` opens every page. */
const ADMINISTRATOR: MyPermissions = {
	held: [{ permission: 'administrator', scope: 'conference' }],
	committeeIds: [],
	rank: -1
};

/** The Supabase client. `load` and the actions only hand it on. */
const SUPABASE = {};

/** The cookie jar. Only `setFlash`, which is stood in for, ever touches it. */
const COOKIES = {};

const SIGNED_IN_USER = { id: 'user-1', email: 'sara@example.com' };

const CONFERENCE = {
	id: 'conference-1',
	slug: 'riverside-mun-2027',
	name: 'Riverside MUN 2027',
	timezone: 'Europe/Amsterdam'
} as unknown as Conference;

const COMMITTEE = { id: 'committee-unsc', name: 'Security Council' };
const DELEGATION = { id: 'delegation-delft', name: 'Delft High School' };

/** A pinned announcement to the Security Council. */
const ANNOUNCEMENT: Announcement = {
	id: 'announcement-1',
	title: 'Room change',
	body: 'Session I moves to room 2.',
	audience: 'committee',
	committeeId: COMMITTEE.id,
	committeeAbbreviation: 'UNSC',
	delegationId: null,
	delegationName: null,
	isPinned: true,
	publishedAt: '2027-01-21T10:00:00Z',
	authorId: SIGNED_IN_USER.id,
	authorName: 'Sara Lind'
};

/** A chair of the Security Council, who may announce to that committee only. */
const UNSC_CHAIR: MyPermissions = {
	held: [{ permission: 'send_announcements', scope: 'committees' }],
	committeeIds: [COMMITTEE.id],
	rank: 3
};

/** Another committee of the same conference, which the chair does not chair. */
const OTHER_COMMITTEE = { id: 'committee-who', name: 'World Health Organization' };

/** The page every redirecting action comes back to. */
const PAGE_PATH = '/manage/riverside-mun-2027/announcements';

/** The few pieces of a request that `load` and the actions here actually read. */
function makeEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		params: { slug: CONFERENCE.slug },
		url: new URL(`http://localhost${PAGE_PATH}`),
		locals: { supabase: SUPABASE },
		cookies: COOKIES,
		...overrides
	};
}

/** That stand-in, as the `load` function's own event type. */
function makeLoadEvent(
	search: string = '',
	permissions: MyPermissions = ADMINISTRATOR
): PageServerLoadEvent {
	return makeEvent({
		url: new URL(`http://localhost${PAGE_PATH}${search}`),
		parent: async () => ({ conference: CONFERENCE, permissions })
	}) as unknown as PageServerLoadEvent;
}

/** A post to one of the actions, with `search` in the action's own address. */
function makeActionEvent(search: string, fields: Record<string, string> = {}): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	return makeEvent({
		url: new URL(`http://localhost${PAGE_PATH}${search}`),
		request: { formData: async () => formData }
	}) as unknown as RequestEvent;
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

/** A complete new announcement, as the form sends it. */
const PUBLISH_FIELDS = {
	title: 'Dress code',
	body: 'Western business attire.',
	audience: 'everyone'
};

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(requirePermissionSomewhere).mockResolvedValue({
		user: SIGNED_IN_USER,
		conference: CONFERENCE,
		permissions: ADMINISTRATOR
	});
	vi.mocked(requireUser).mockResolvedValue(SIGNED_IN_USER);
	vi.mocked(listAnnouncementsForOrganiser).mockResolvedValue([ANNOUNCEMENT]);
	vi.mocked(listAnnouncementCommittees).mockResolvedValue([COMMITTEE]);
	vi.mocked(listAcceptedDelegations).mockResolvedValue([DELEGATION]);
	vi.mocked(countAudience).mockResolvedValue(212);
	vi.mocked(getAnnouncement).mockImplementation(async (_supabase, _conferenceId, id) =>
		id === ANNOUNCEMENT.id ? ANNOUNCEMENT : null
	);
});

describe('load', () => {
	it('asks the permissions the layout read whether this page opens for the reader', async () => {
		await load(makeLoadEvent());

		expect(requireManagePage).toHaveBeenCalledWith(ADMINISTRATOR, 'announcements');
	});

	it('lists every announcement and starts a new one to everyone, counted', async () => {
		const data = (await load(makeLoadEvent())) as Record<string, unknown>;

		expect(data.announcements).toEqual([ANNOUNCEMENT]);
		expect(data.formValues).toMatchObject({ announcementId: '', audience: 'everyone' });
		expect(data.audienceCount).toEqual({ recipientCount: 212, audienceLabel: 'Everyone' });
		expect(countAudience).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			{ audience: 'everyone', committeeId: null, delegationId: null },
			SIGNED_IN_USER.id
		);
	});

	it('counts the committee the address names, so the preview works without JavaScript', async () => {
		const data = (await load(
			makeLoadEvent('?audience=committee&committee=committee-unsc')
		)) as Record<string, unknown>;

		expect(data.audienceCount).toEqual({ recipientCount: 212, audienceLabel: 'Security Council' });
	});

	it('counts nothing for a committee that is not this conference’s', async () => {
		const data = (await load(makeLoadEvent('?audience=committee&committee=elsewhere'))) as Record<
			string,
			unknown
		>;

		expect(data.audienceCount).toBeNull();
		expect(countAudience).not.toHaveBeenCalled();
	});

	it('opens an announcement for editing, with nothing to count', async () => {
		const data = (await load(makeLoadEvent('?edit=announcement-1'))) as Record<string, unknown>;

		expect(data.formValues).toMatchObject({
			announcementId: 'announcement-1',
			title: 'Room change'
		});
		expect(data.audienceCount).toBeNull();
	});
});

describe('the preview action', () => {
	it('counts the chosen audience and hands back what was typed, saving nothing', async () => {
		const result = await actions.preview(
			makeActionEvent('?/preview', {
				title: 'Half written',
				audience: 'delegation',
				delegationId: DELEGATION.id
			})
		);

		expect(result).toMatchObject({
			values: { title: 'Half written', audience: 'delegation' },
			audienceCount: { recipientCount: 212, audienceLabel: 'Delft High School' }
		});
		expect(createAnnouncement).not.toHaveBeenCalled();
	});

	it('asks for the committee before counting one', async () => {
		const result = await actions.preview(makeActionEvent('?/preview', { audience: 'committee' }));

		expect(result).toMatchObject({
			status: 400,
			data: { errors: { committeeId: 'Pick the committee.' } }
		});
	});
});

describe('the publish action', () => {
	it('publishes and says how many people it was sent to', async () => {
		const redirect = await catchThrown(() =>
			actions.publish(makeActionEvent('?/publish', { ...PUBLISH_FIELDS, isPinned: 'on' }))
		);

		expect(createAnnouncement).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			SIGNED_IN_USER.id,
			{
				audience: 'everyone',
				committeeId: null,
				delegationId: null,
				title: 'Dress code',
				body: 'Western business attire.',
				isPinned: true
			},
			null
		);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Published and sent to 212 people.'
		});
		expect(redirect).toMatchObject({ status: 303, location: PAGE_PATH });
	});

	it('saves the new announcement under the id the browser already shows it with', async () => {
		const newAnnouncementId = 'a0000000-0000-4000-8000-000000000099';

		await catchThrown(() =>
			actions.publish(
				makeActionEvent('?/publish', { ...PUBLISH_FIELDS, newRowId: newAnnouncementId })
			)
		);

		expect(createAnnouncement).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			SIGNED_IN_USER.id,
			expect.anything(),
			newAnnouncementId
		);
	});

	it('refuses an empty title and body, keeping the audience and its count', async () => {
		const result = await actions.publish(
			makeActionEvent('?/publish', { audience: 'committee', committeeId: COMMITTEE.id })
		);

		expect(result).toMatchObject({
			status: 400,
			data: {
				errors: {
					title: 'Please give the announcement a title.',
					body: 'Write the announcement first.'
				},
				audienceCount: { recipientCount: 212 }
			}
		});
		expect(createAnnouncement).not.toHaveBeenCalled();
	});

	it('answers 404 for a committee from another conference', async () => {
		const thrown = await catchThrown(() =>
			actions.publish(
				makeActionEvent('?/publish', {
					...PUBLISH_FIELDS,
					audience: 'committee',
					committeeId: 'elsewhere'
				})
			)
		);

		expect(thrown.status).toBe(404);
		expect(createAnnouncement).not.toHaveBeenCalled();
	});

	it('asks the announcer gate first', async () => {
		vi.mocked(requirePermissionSomewhere).mockRejectedValue(new Error('not an announcer'));

		await expect(actions.publish(makeActionEvent('?/publish', PUBLISH_FIELDS))).rejects.toThrow(
			'not an announcer'
		);
		expect(createAnnouncement).not.toHaveBeenCalled();
	});
});

describe('the update action', () => {
	it('saves the text and the pin only, and says nobody was notified again', async () => {
		const redirect = await catchThrown(() =>
			actions.update(
				makeActionEvent('?/update', {
					announcementId: ANNOUNCEMENT.id,
					title: 'Room change (again)',
					body: 'Room 3 now.',
					audience: 'everyone'
				})
			)
		);

		expect(updateAnnouncement).toHaveBeenCalledWith(SUPABASE, ANNOUNCEMENT.id, {
			title: 'Room change (again)',
			body: 'Room 3 now.',
			isPinned: false
		});
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Announcement updated. No new notification was sent.'
		});
		expect(redirect).toMatchObject({ status: 303, location: PAGE_PATH });
	});

	it('keeps the published audience on a refused edit', async () => {
		const result = await actions.update(
			makeActionEvent('?/update', { announcementId: ANNOUNCEMENT.id, title: '', body: 'x' })
		);

		expect(result).toMatchObject({
			status: 400,
			data: { values: { audience: 'committee', committeeId: COMMITTEE.id } }
		});
		expect(updateAnnouncement).not.toHaveBeenCalled();
	});

	it('refuses an announcement that is not this conference’s', async () => {
		const result = await actions.update(
			makeActionEvent('?/update', { announcementId: 'elsewhere', title: 'x', body: 'x' })
		);

		expect(result).toMatchObject({
			status: 400,
			data: { message: 'That announcement is not part of this conference.' }
		});
	});
});

describe('the togglePin action', () => {
	it('unpins a pinned announcement named in the address', async () => {
		await catchThrown(() =>
			actions.togglePin(makeActionEvent('?/togglePin&announcementId=announcement-1'))
		);

		expect(setAnnouncementPinned).toHaveBeenCalledWith(SUPABASE, ANNOUNCEMENT.id, false);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, { tone: 'success', message: 'Unpinned.' });
	});

	it('pins an unpinned one', async () => {
		vi.mocked(getAnnouncement).mockResolvedValue({ ...ANNOUNCEMENT, isPinned: false });

		await catchThrown(() =>
			actions.togglePin(makeActionEvent('?/togglePin&announcementId=announcement-1'))
		);

		expect(setAnnouncementPinned).toHaveBeenCalledWith(SUPABASE, ANNOUNCEMENT.id, true);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, { tone: 'success', message: 'Pinned.' });
	});
});

describe('the delete action', () => {
	it('deletes once confirmed, and says the notifications stay', async () => {
		const redirect = await catchThrown(() =>
			actions.delete(makeActionEvent('?/delete', { announcementId: ANNOUNCEMENT.id, confirm: '1' }))
		);

		expect(deleteAnnouncement).toHaveBeenCalledWith(SUPABASE, ANNOUNCEMENT.id);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Announcement deleted. Notifications already sent will say it was removed.'
		});
		expect(redirect).toMatchObject({ status: 303, location: PAGE_PATH });
	});

	it('refuses without the confirmation', async () => {
		const result = await actions.delete(
			makeActionEvent('?/delete', { announcementId: ANNOUNCEMENT.id })
		);

		expect(result).toMatchObject({ status: 400 });
		expect(deleteAnnouncement).not.toHaveBeenCalled();
	});
});

describe('a chair who may announce to their own committee', () => {
	beforeEach(() => {
		vi.mocked(requirePermissionSomewhere).mockResolvedValue({
			user: SIGNED_IN_USER,
			conference: CONFERENCE,
			permissions: UNSC_CHAIR
		});
		vi.mocked(listAnnouncementCommittees).mockResolvedValue([COMMITTEE, OTHER_COMMITTEE]);
	});

	it('is offered their committee only, and starts on it', async () => {
		const data = (await load(makeLoadEvent('', UNSC_CHAIR))) as Record<string, unknown>;

		expect(data.mayAddressConference).toBe(false);
		expect(data.committees).toEqual([COMMITTEE]);
		expect(data.delegations).toEqual([]);
		expect(data.formValues).toMatchObject({ audience: 'committee' });
		expect(listAcceptedDelegations).not.toHaveBeenCalled();
	});

	it('may change only what they wrote themselves', async () => {
		const theirs = { ...ANNOUNCEMENT, id: 'announcement-2', authorId: 'secretary-general' };
		vi.mocked(listAnnouncementsForOrganiser).mockResolvedValue([ANNOUNCEMENT, theirs]);

		const data = (await load(makeLoadEvent('?edit=announcement-2', UNSC_CHAIR))) as Record<
			string,
			unknown
		>;

		expect(data.readOnlyIds).toEqual(['announcement-2']);
		expect(data.formValues).toMatchObject({ announcementId: '' });
	});

	it('publishes to their committee', async () => {
		await catchThrown(() =>
			actions.publish(
				makeActionEvent('?/publish', {
					...PUBLISH_FIELDS,
					audience: 'committee',
					committeeId: COMMITTEE.id
				})
			)
		);

		expect(createAnnouncement).toHaveBeenCalled();
	});

	it('answers 404 to a post to everyone or to another committee', async () => {
		const toEveryone = await catchThrown(() =>
			actions.publish(makeActionEvent('?/publish', PUBLISH_FIELDS))
		);
		const toAnother = await catchThrown(() =>
			actions.publish(
				makeActionEvent('?/publish', {
					...PUBLISH_FIELDS,
					audience: 'committee',
					committeeId: OTHER_COMMITTEE.id
				})
			)
		);

		expect(toEveryone.status).toBe(404);
		expect(toAnother.status).toBe(404);
		expect(createAnnouncement).not.toHaveBeenCalled();
	});

	it('answers 404 to deleting somebody else’s announcement', async () => {
		vi.mocked(getAnnouncement).mockResolvedValue({ ...ANNOUNCEMENT, authorId: 'co-chair' });

		const thrown = await catchThrown(() =>
			actions.delete(makeActionEvent('?/delete', { announcementId: ANNOUNCEMENT.id, confirm: '1' }))
		);

		expect(thrown.status).toBe(404);
		expect(deleteAnnouncement).not.toHaveBeenCalled();
	});
});
