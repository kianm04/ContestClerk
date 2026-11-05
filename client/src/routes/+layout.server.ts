import { takeFlash } from '$lib/server/flash';
import { hasApplications } from '$lib/server/applications';
import { hasOrganiserArea } from '$lib/server/manage';
import { countUnreadNotifications, listRecentNotifications } from '$lib/server/notifications';
import { getShellProfile } from '$lib/server/profiles';
import type { Notification } from '$lib/notifications';
import type { LayoutServerLoad } from './$types';

/**
 * Runs on the server for every page, because it belongs to the root layout.
 * Whatever it returns is available to every page as `data`.
 */
export const load: LayoutServerLoad = async ({
	locals: { supabase, getVerifiedClaims },
	cookies,
	depends
}) => {
	// Labels this load function so that `invalidate('supabase:auth')` in
	// `+layout.svelte` makes it run again. Without the label the header would go
	// on showing whoever was signed in when the page was first rendered.
	depends('supabase:auth');

	const claims = await getVerifiedClaims();

	// The moment the page was built. It travels to the browser so that "2 hours
	// ago" reads the same in both places; working it out again in the browser
	// would give a different answer and Svelte would complain while it took over.
	const now = new Date();

	// A one-off message left by whichever page redirected here. Reading it also
	// deletes it, so it is shown exactly once.
	const flash = takeFlash(cookies);

	// The auth cookies are handed on to `+layout.ts` so that the Supabase client
	// it builds while rendering on the server already knows who is signed in.
	// Only those: everything a `load` returns is written into the page's HTML, so
	// any other cookie passed here, the httpOnly flash one included, would be
	// readable by every script on the page. Supabase names all of its cookies
	// `sb-…` (security review L38).
	const authCookies = cookies.getAll().filter((cookie) => cookie.name.startsWith('sb-'));
	const shared = { claims, cookies: authCookies, now, flash };

	// A visitor runs nothing and has applied nowhere, so both answers are false
	// without asking the database at all: the top bar hides "Manage" and
	// "Applications" from them either way.
	if (!claims) {
		return {
			...shared,
			person: null,
			bellNotifications: [] as Notification[],
			unreadCount: 0,
			hasOrganiserArea: false,
			hasApplications: false
		};
	}

	const userId = String(claims.sub);

	// None of the five needs another's answer, so start them all at once. That
	// is why the "does this person run anything" and "has this person applied
	// anywhere" questions cost no extra round trip: they travel with the three
	// the shell already asks.
	const [profile, bellNotifications, unreadCount, isOrganiserAreaReader, isApplicant] =
		await Promise.all([
			getShellProfile(supabase, userId),
			listRecentNotifications(supabase, userId),
			countUnreadNotifications(supabase, userId),
			hasOrganiserArea(supabase, userId),
			hasApplications(supabase, userId)
		]);

	// An account made before the `handle_new_user` trigger existed has no profile
	// row. Falling back to the email address keeps that person signed in with an
	// odd-looking name, rather than showing them a "Log in" button they do not need.
	const person = profile ?? { fullName: String(claims.email ?? ''), avatarPath: null };

	// Named apart from the functions above only so they do not share names in
	// one scope; they are the same answers, handed to the top bar.
	return {
		...shared,
		person,
		bellNotifications,
		unreadCount,
		hasOrganiserArea: isOrganiserAreaReader,
		hasApplications: isApplicant
	};
};
