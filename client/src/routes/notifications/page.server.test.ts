import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the actions are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';

// The data-access functions are stood in for, so these tests are about what the
// `load` and the three actions do with what comes back, not about the database.
// The policies themselves are tested in `tests/db/notifications.test.ts`.
vi.mock('$lib/server/notifications', () => ({
	listNotifications: vi.fn(),
	markNotificationRead: vi.fn(),
	markAllNotificationsRead: vi.fn(),
	deleteNotification: vi.fn()
}));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

// Asked only when an opened notification is for an announcement.
vi.mock('$lib/server/announcements', () => ({ announcementExists: vi.fn() }));

import { announcementExists } from '$lib/server/announcements';
import { setFlash } from '$lib/server/flash';
import {
	deleteNotification,
	listNotifications,
	markAllNotificationsRead,
	markNotificationRead
} from '$lib/server/notifications';

/**
 * A stand-in Supabase client that answers the one query the onboarding gate
 * makes: `from('my_profile_state').select('onboarding_completed_at').eq('id', ...)`.
 * (`my_profile_state` is the one-row view of the signed-in person's own
 * `profiles` flags, migration 20261022132000.)
 *
 * `requireOnboarded` in `$lib/server/access.ts` runs before the `load` and
 * before every action on this page, so every stand-in event needs a client that
 * can answer it. A timestamp means somebody who has finished the welcome page
 * and may carry on; `null` means a brand-new account, which the gate sends to
 * `/welcome`.
 *
 * The real client is a builder: each step gives back an object carrying the
 * next step. Its `maybeSingle()` ends in `overrideTypes()`, which only changes
 * the type and not the answer, so here that last step is the answer itself.
 */
function supabaseWithOnboarding(onboardingCompletedAt: string | null) {
	return {
		from: () => ({
			select: () => ({
				eq: () => ({
					maybeSingle: () => ({
						overrideTypes: async () => ({
							data: { onboarding_completed_at: onboardingCompletedAt },
							error: null
						})
					})
				})
			})
		})
	};
}

/** Somebody signed in who has finished onboarding, as `hooks.server.ts` would have left them. */
const SIGNED_IN = {
	supabase: supabaseWithOnboarding('2026-03-01T10:00:00Z'),
	getVerifiedClaims: async () => ({ sub: 'user-1', email: 'daniel@example.com' })
};

/** Somebody signed in who has not answered the welcome form yet. */
const NOT_ONBOARDED = {
	supabase: supabaseWithOnboarding(null),
	getVerifiedClaims: async () => ({ sub: 'user-1', email: 'daniel@example.com' })
};

/** Nobody signed in. */
const SIGNED_OUT = { supabase: {}, getVerifiedClaims: async () => null };

/**
 * The few pieces of a request that `load` and the actions here actually read.
 *
 * SvelteKit hands them a great many more, so the cast says "this is enough";
 * anything the code reaches for that is missing fails the test loudly.
 */
function makeEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		url: new URL('http://localhost/notifications'),
		locals: SIGNED_IN,
		cookies: {},
		...overrides
	};
}

/** That stand-in, as the `load` function's own event type. */
function makeLoadEvent(overrides: Record<string, unknown> = {}): PageServerLoadEvent {
	return makeEvent(overrides) as unknown as PageServerLoadEvent;
}

/** A form post carrying one notification id, the way a row sends it. */
function makeFormEvent(
	notificationId: string | null,
	overrides: Record<string, unknown> = {}
): RequestEvent {
	const formData = new FormData();

	if (notificationId !== null) {
		formData.set('notificationId', notificationId);
	}

	return makeEvent({
		request: { formData: async () => formData },
		...overrides
	}) as unknown as RequestEvent;
}

/** That stand-in, as an action's own event type, for the actions that read no form. */
function makeActionEvent(overrides: Record<string, unknown> = {}): RequestEvent {
	return makeEvent(overrides) as unknown as RequestEvent;
}

/**
 * Run something that is expected to redirect, and give back the redirect.
 *
 * SvelteKit's `redirect` works by throwing, so the only way to see where it
 * was sending the reader is to catch it.
 */
async function catchRedirect(run: () => unknown): Promise<{ status: number; location: string }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number; location: string };
	}

	throw new Error('Nothing was thrown, so nothing redirected.');
}

beforeEach(() => {
	vi.mocked(listNotifications).mockResolvedValue({ rows: [], total: 0 });
	vi.mocked(markNotificationRead).mockResolvedValue({ linkPath: '/applications/1' });
	vi.mocked(markAllNotificationsRead).mockResolvedValue(undefined);
	vi.mocked(deleteNotification).mockResolvedValue(undefined);
	vi.mocked(setFlash).mockClear();
});

describe('load', () => {
	it('sends a visitor to the sign in page, with this page to come back to', async () => {
		const redirect = await catchRedirect(() => load(makeLoadEvent({ locals: SIGNED_OUT })));

		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe('/login?next=%2Fnotifications');
	});

	it('sends somebody who has not finished onboarding to the welcome page', async () => {
		const redirect = await catchRedirect(() => load(makeLoadEvent({ locals: NOT_ONBOARDED })));

		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe('/welcome?next=%2Fnotifications');
		expect(listNotifications).not.toHaveBeenCalled();
	});

	it('asks for the first page when the address says nothing', async () => {
		const result = (await load(makeLoadEvent())) as { page: number };

		expect(listNotifications).toHaveBeenCalledWith(SIGNED_IN.supabase, 'user-1', 1);
		expect(result.page).toBe(1);
	});

	it('asks for the page the address names', async () => {
		await load(makeLoadEvent({ url: new URL('http://localhost/notifications?page=3') }));

		expect(listNotifications).toHaveBeenCalledWith(SIGNED_IN.supabase, 'user-1', 3);
	});

	it('falls back to the first page when the address holds nonsense', async () => {
		await load(makeLoadEvent({ url: new URL('http://localhost/notifications?page=banana') }));
		await load(makeLoadEvent({ url: new URL('http://localhost/notifications?page=-2') }));

		expect(listNotifications).toHaveBeenNthCalledWith(1, SIGNED_IN.supabase, 'user-1', 1);
		expect(listNotifications).toHaveBeenNthCalledWith(2, SIGNED_IN.supabase, 'user-1', 1);
	});
});

describe('the open action', () => {
	it('marks the notification read and goes where it points', async () => {
		const redirect = await catchRedirect(() => actions.open(makeFormEvent('n-1')));

		expect(markNotificationRead).toHaveBeenCalledWith(SIGNED_IN.supabase, 'n-1');
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe('/applications/1');
	});

	it('comes back to the list when the notification points nowhere', async () => {
		vi.mocked(markNotificationRead).mockResolvedValue({ linkPath: null });

		const redirect = await catchRedirect(() => actions.open(makeFormEvent('n-1')));

		expect(redirect.location).toBe('/notifications');
	});

	it('comes back to the list when the notification is not this person’s', async () => {
		vi.mocked(markNotificationRead).mockResolvedValue(null);

		const redirect = await catchRedirect(() => actions.open(makeFormEvent('n-1')));

		expect(redirect.location).toBe('/notifications');
	});

	it('refuses an address pointing at another website', async () => {
		vi.mocked(markNotificationRead).mockResolvedValue({ linkPath: '//evil.example' });

		const redirect = await catchRedirect(() => actions.open(makeFormEvent('n-1')));

		expect(redirect.location).toBe('/');
	});

	it('follows an announcement’s link while the announcement is still there', async () => {
		const linkPath = '/conferences/thimun-2027/announcements?announcement=a-1';
		vi.mocked(markNotificationRead).mockResolvedValue({ linkPath });
		vi.mocked(announcementExists).mockResolvedValue(true);

		const redirect = await catchRedirect(() => actions.open(makeFormEvent('n-1')));

		expect(announcementExists).toHaveBeenCalledWith(SIGNED_IN.supabase, 'a-1');
		expect(redirect.location).toBe(linkPath);
	});

	it('says an announcement was removed when it has been deleted since', async () => {
		vi.mocked(markNotificationRead).mockResolvedValue({
			linkPath: '/conferences/thimun-2027/announcements?announcement=a-1'
		});
		vi.mocked(announcementExists).mockResolvedValue(false);

		const redirect = await catchRedirect(() => actions.open(makeFormEvent('n-1')));

		expect(redirect.location).toBe('/conferences/thimun-2027/announcements?removed=1');
	});

	it('follows an older announcement link, which names no announcement, as it stands', async () => {
		vi.mocked(markNotificationRead).mockResolvedValue({
			linkPath: '/conferences/thimun-2027/announcements'
		});

		const redirect = await catchRedirect(() => actions.open(makeFormEvent('n-1')));

		expect(announcementExists).not.toHaveBeenCalled();
		expect(redirect.location).toBe('/conferences/thimun-2027/announcements');
	});

	it('fails when the form carried no notification at all', async () => {
		const result = await actions.open(makeFormEvent(null));

		expect(result).toMatchObject({ status: 400 });
		expect(markNotificationRead).not.toHaveBeenCalled();
	});
});

describe('the markAllRead action', () => {
	it('marks everything read and says so on the way back', async () => {
		const cookies = {};
		const redirect = await catchRedirect(() => actions.markAllRead(makeActionEvent({ cookies })));

		expect(markAllNotificationsRead).toHaveBeenCalledWith(SIGNED_IN.supabase, 'user-1');
		expect(setFlash).toHaveBeenCalledWith(cookies, {
			tone: 'success',
			message: 'All notifications marked as read.'
		});
		expect(redirect.location).toBe('/notifications');
	});
});

describe('the delete action', () => {
	it('removes the notification and comes back to the list', async () => {
		const redirect = await catchRedirect(() => actions.delete(makeFormEvent('n-1')));

		expect(deleteNotification).toHaveBeenCalledWith(SIGNED_IN.supabase, 'n-1');
		expect(redirect.location).toBe('/notifications');
	});

	it('fails when the form carried no notification at all', async () => {
		const result = await actions.delete(makeFormEvent(null));

		expect(result).toMatchObject({ status: 400 });
		expect(deleteNotification).not.toHaveBeenCalled();
	});
});
