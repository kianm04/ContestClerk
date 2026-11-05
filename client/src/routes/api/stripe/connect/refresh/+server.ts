/**
 * Where Stripe sends somebody when their onboarding link has gone stale.
 *
 * A Stripe account link is single use and short lived, so somebody who leaves
 * the form open, or comes back to it from an old tab, arrives here instead. The
 * answer is to make a fresh link and send them straight on, which is step 2 of
 * "Organisation onboarding" in `specs/02-architecture/payments.md` all over
 * again.
 *
 * A `+server.ts` file is an endpoint rather than a page: it runs only on the
 * server and answers with a redirect, so nothing is drawn here and
 * `STRIPE_SECRET_KEY` never leaves the server.
 */

import { error, isRedirect, redirect } from '@sveltejs/kit';
import { setFlash } from '$lib/server/flash';
import {
	getOrganizationSettings,
	readMyOrganizationRole,
	readStripeAccountId
} from '$lib/server/organizations';
import {
	createAccountLink,
	stripeConnectApi,
	verifyConnectAccountBelongsTo
} from '$lib/server/stripe';
import {
	organizationSettingsUrl,
	stripeConnectRefreshUrl,
	stripeConnectReturnUrl
} from '$lib/urls';
import { isOrganizationAdmin } from '$lib/organizations';
import type { RequestHandler } from './$types';

/** What the organiser is told when a fresh link could not be made. */
const STRIPE_UNREACHABLE_MESSAGE = 'Stripe could not be reached. Please try again in a minute.';

/** What they are told when the stored account was not opened for this organisation. */
const STRIPE_FOREIGN_ACCOUNT_MESSAGE =
	'The Stripe account on record was not opened for this organisation. Contact support.';

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
	const orgSlug = url.searchParams.get('org') ?? '';

	if (orgSlug === '') {
		error(404, 'This page does not exist.');
	}

	const claims = await locals.getVerifiedClaims();

	if (!claims) {
		redirect(303, organizationSettingsUrl(orgSlug));
	}

	const organization = await getOrganizationSettings(locals.supabase, orgSlug);

	if (!organization) {
		error(404, 'This organisation does not exist.');
	}

	const myRole = await readMyOrganizationRole(locals.supabase, organization.id, String(claims.sub));

	// Only an owner or an admin may connect Stripe, so only they may be sent
	// back to the form. Everybody else gets the 404 a stranger gets, never a 403
	// (`specs/02-architecture/permissions.md`).
	if (!myRole || !isOrganizationAdmin(myRole)) {
		error(404, 'This organisation does not exist.');
	}

	const api = stripeConnectApi();
	const accountId = await readStripeAccountId(locals.supabase, organization.id);

	// With no key configured or no account yet there is no form to go back to,
	// so the settings page's own button is where they start again.
	if (!api || !accountId) {
		redirect(303, organizationSettingsUrl(orgSlug));
	}

	let freshLink: string;

	try {
		// A stored id is never acted on until the account itself says it was
		// opened for this organisation (security review 2026-10-10, C5). The
		// settings page's `connectStripe` action makes the same check.
		if (!(await verifyConnectAccountBelongsTo(api, accountId, organization.id))) {
			setFlash(cookies, { tone: 'error', message: STRIPE_FOREIGN_ACCOUNT_MESSAGE });
			redirect(303, organizationSettingsUrl(orgSlug));
		}

		freshLink = await createAccountLink(
			api,
			accountId,
			// Stripe is a different website sending the browser back to ours, so
			// both of these have to be whole addresses rather than paths.
			`${url.origin}${stripeConnectReturnUrl(orgSlug)}`,
			`${url.origin}${stripeConnectRefreshUrl(orgSlug)}`
		);
	} catch (thrown) {
		// `redirect` works by throwing, and the one above for a foreign account
		// sits inside the `try`, so it is told apart from a Stripe failure here
		// and sent on rather than reported as "Stripe could not be reached".
		if (isRedirect(thrown)) {
			throw thrown;
		}

		setFlash(cookies, { tone: 'error', message: STRIPE_UNREACHABLE_MESSAGE });
		redirect(303, organizationSettingsUrl(orgSlug));
	}

	/*
		A plain `Response` rather than `redirect()`, because this answer carries a
		single-use onboarding link in its `location` and a GET is what browsers
		and proxies cache. `cache-control: no-store` says nobody may keep it
		(security review 2026-10-10, I8). `setHeaders` would not do: SvelteKit
		builds a thrown redirect's response itself and leaves those headers off.
	*/
	return new Response(null, {
		status: 303,
		headers: { location: freshLink, 'cache-control': 'no-store' }
	});
};
