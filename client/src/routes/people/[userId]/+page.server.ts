import { error } from '@sveltejs/kit';
import { requireOnboarded } from '$lib/server/access';
import { getPublicProfile } from '$lib/server/profiles';
import type { PageServerLoad } from './$types';

/**
 * Somebody's public profile, which an organiser opens from an application to
 * see who is applying (Trello pZNcdPqU). Anybody signed in may read it, which is
 * what the `profiles` select policy already allows; nothing private is read.
 *
 * `params.userId` is the `[userId]` part of the address. A malformed or unknown
 * id is a 404.
 */
export const load: PageServerLoad = async ({ params, url, locals }) => {
	await requireOnboarded(locals, url);

	const profile = await getPublicProfile(locals.supabase, params.userId);

	if (profile === null) {
		error(404, 'This person does not exist.');
	}

	return { profile };
};
