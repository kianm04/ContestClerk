import { error, fail } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import {
	isResetCodeCorrect,
	readSiteResetStatus,
	requestSiteReset,
	siteResetAttempts,
	siteResetSettings,
	type SiteResetSettings
} from '$lib/server/site-reset';
import type { Actions, PageServerLoad } from './$types';

/**
 * The reset settings, or a 404 on any server that has none. Every development machine
 * is one, so there the page does not exist at all.
 */
function requireSiteResetSettings(): SiteResetSettings {
	const settings = siteResetSettings(env);

	if (!settings) {
		error(404, 'This page does not exist.');
	}

	return settings;
}

export const load: PageServerLoad = async () => {
	const settings = requireSiteResetSettings();

	return readSiteResetStatus(settings.directory);
};

export const actions: Actions = {
	// An unnamed action, because there is only one form on this page. A plain
	// `<form method="post">` with no `action` attribute posts to this.
	default: async ({ request }) => {
		const settings = requireSiteResetSettings();
		const formData = await request.formData();
		const typedCode = String(formData.get('code') ?? '');
		const now = new Date();

		// Asked before the code is even compared, so that during a cool-down a guess,
		// right or wrong, learns nothing from the answer (security review L46).
		if (siteResetAttempts.isCoolingDown(now)) {
			return fail(429, { error: 'Too many wrong codes. Try again in ten minutes.' });
		}

		if (!isResetCodeCorrect(typedCode, settings.code)) {
			siteResetAttempts.recordFailure(now);

			return fail(403, { error: 'That is not the reset code.' });
		}

		siteResetAttempts.recordSuccess();

		// A second press while a reset waits or runs would only start another one straight
		// after it, wiping whatever the first tester had already begun.
		const status = await readSiteResetStatus(settings.directory);

		if (status.resetRequestedAt) {
			return fail(409, { error: 'A reset is already under way.' });
		}

		await requestSiteReset(settings.directory, new Date());

		// Nothing to say here: `load` runs again after the action and finds the request,
		// and the page then shows that the reset is under way.
		return { error: null };
	}
};
