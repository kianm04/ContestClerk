import { parseAuthErrorReason } from '$lib/auth';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals: { getVerifiedClaims } }) => {
	const claims = await getVerifiedClaims();

	// `?reason=` is only text in an address bar, so it is read through
	// `parseAuthErrorReason`, which answers `invalid` for anything unexpected.
	return {
		reason: parseAuthErrorReason(url.searchParams.get('reason')),
		isSignedIn: claims !== null
	};
};
