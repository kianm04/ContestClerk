/**
 * Where Stripe sends somebody back to when they have finished, or abandoned,
 * the Connect onboarding form.
 *
 * A `+server.ts` file is an endpoint rather than a page: it answers a request
 * with whatever it likes, and here that is always a redirect back to the
 * organisation's settings page with something to read. It runs only on the
 * server, so `STRIPE_SECRET_KEY` is safe here.
 *
 * The flow this closes is step 3 of "Organisation onboarding" in
 * `specs/02-architecture/payments.md`.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * It does not set `organizations.stripe_onboarding_completed_at`. That column is
 * writable by the service role alone (the `protect_stripe_columns` trigger, and
 * the `organizations` row of `specs/02-architecture/permissions.md`), and in the
 * application the service-role client may be used only by
 * `src/lib/server/stripe-webhook.ts` and the sweep that removes orphaned
 * document files — `specs/02-architecture/permissions.md` says so,
 * and `set_stripe_account` leaves the column out on purpose for the reason its
 * own comment gives: an organiser who could set it themselves would be telling
 * us they can take money when they cannot. So the `account.updated` webhook sets
 * it, which is task T32, and this endpoint only reports what Stripe said. Until
 * that webhook exists an organisation stays `pending` after onboarding, which is
 * recorded in `specs/07-delivery/open-questions.md`.
 */

import { error, isRedirect, redirect } from '@sveltejs/kit';
import { setFlash } from '$lib/server/flash';
import {
	getOrganizationSettings,
	readMyOrganizationRole,
	readStripeAccountId
} from '$lib/server/organizations';
import {
	readConnectAccount,
	stripeConnectApi,
	verifyConnectAccountBelongsTo
} from '$lib/server/stripe';
import { organizationSettingsUrl } from '$lib/urls';
import type { RequestHandler } from './$types';

/** What the page says when Stripe still wants something from the organiser. */
const STILL_INCOMPLETE_MESSAGE =
	'Stripe still needs information from you. Press Continue Stripe setup to finish.';

/**
 * What it says when Stripe is happy but our own record has not caught up.
 *
 * The `account.updated` webhook is what writes the timestamp, and it arrives in
 * its own time, so "we have asked" is the honest thing to say rather than
 * "connected".
 */
const CHARGES_ENABLED_MESSAGE =
	'Stripe has everything it needs. The connection shows as complete once Stripe confirms it, usually within a minute.';

/** What they are told when the stored account was not opened for this organisation. */
const STRIPE_FOREIGN_ACCOUNT_MESSAGE =
	'The Stripe account on record was not opened for this organisation. Contact support.';

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
	const orgSlug = url.searchParams.get('org') ?? '';

	// Stripe hands the browser back with nothing of ours attached but what we put
	// in the address ourselves, so a missing or unknown organisation here means
	// somebody typed the address rather than came back from onboarding.
	if (orgSlug === '') {
		error(404, 'This page does not exist.');
	}

	const claims = await locals.getVerifiedClaims();

	if (!claims) {
		// Signing in again would land them here with no way back to Stripe, so
		// they go to the settings page, which asks them to sign in properly and
		// then offers the button again.
		redirect(303, organizationSettingsUrl(orgSlug));
	}

	const organization = await getOrganizationSettings(locals.supabase, orgSlug);

	if (!organization) {
		error(404, 'This organisation does not exist.');
	}

	/*
		A member, not an admin, where `/refresh` beside this file asks for an
		admin. The two differ on purpose: that one makes a fresh onboarding link
		and sends the browser to Stripe, which only somebody who may connect an
		account should be able to do, while this one reports what Stripe said
		about an account that already exists — and `stripeState` on the settings
		page tells a plain member that much anyway. Everybody may *read* an
		organisation, so the membership is the check that means anything here.

		In practice a plain member goes straight back to the settings page:
		`readStripeAccountId` reads the organization_private_settings view, which
		hands the account id to an owner or an admin alone (security review
		2026-10-10, L3), so for a member `accountId` below is null and there is
		nothing to ask Stripe about. The membership check stays so that a
		stranger is told the organisation does not exist rather than sent to a
		settings page they may not see.
	*/
	const myRole = await readMyOrganizationRole(locals.supabase, organization.id, String(claims.sub));

	if (!myRole) {
		error(404, 'This organisation does not exist.');
	}

	const api = stripeConnectApi();
	const accountId = await readStripeAccountId(locals.supabase, organization.id);

	// No key configured, or no account to ask about: there is nothing to report,
	// so the settings page says where things stand on its own.
	if (!api || !accountId) {
		redirect(303, organizationSettingsUrl(orgSlug));
	}

	let chargesEnabled = false;

	try {
		// Reporting on an account is harmless in itself, but every path that
		// acts on a stored id checks the account was opened for this organisation
		// first (security review 2026-10-10, C5), and a page that said "Stripe has
		// everything it needs" about somebody else's account would be a lie.
		if (!(await verifyConnectAccountBelongsTo(api, accountId, organization.id))) {
			setFlash(cookies, { tone: 'error', message: STRIPE_FOREIGN_ACCOUNT_MESSAGE });
			redirect(303, organizationSettingsUrl(orgSlug));
		}

		const account = await readConnectAccount(api, accountId);

		chargesEnabled = account.chargesEnabled;
	} catch (thrown) {
		// `redirect` works by throwing, and the one above sits inside the `try`,
		// so it is told apart from a Stripe failure and sent on.
		if (isRedirect(thrown)) {
			throw thrown;
		}

		// Not being able to ask Stripe how it went is not the organiser's fault
		// and not something they can fix, so they are simply put back on the page.
		setFlash(cookies, {
			tone: 'error',
			message: 'Stripe could not be reached. Please try again in a minute.'
		});
		redirect(303, organizationSettingsUrl(orgSlug));
	}

	setFlash(cookies, {
		tone: chargesEnabled ? 'success' : 'warning',
		message: chargesEnabled ? CHARGES_ENABLED_MESSAGE : STILL_INCOMPLETE_MESSAGE
	});

	// `redirect` throws, so it is outside the `try` above: inside it, the throw
	// would be caught as a Stripe failure and the organiser would be told Stripe
	// was unreachable when it had answered perfectly well.
	redirect(303, organizationSettingsUrl(orgSlug));
};
