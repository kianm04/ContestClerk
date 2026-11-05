/**
 * Talking to Stripe: the client built from our secret key, the four Connect
 * calls the organisation settings page makes, and the check that a stored
 * account id really is this organisation's.
 *
 * Files under `$lib/server` only ever run on the server, which is what keeps
 * `STRIPE_SECRET_KEY` out of the browser. SvelteKit refuses to bundle anything
 * from `$env/dynamic/private` into client code, so an accidental import from a
 * component fails the build rather than leaking the key.
 *
 * Every function below takes a `StripeConnectApi` as its first argument, the
 * way every function in this folder takes the Supabase client first. That is
 * not only for symmetry: it is what lets these be tested without a Stripe
 * account, because a test hands them a small stand-in instead of the real
 * client. `stripeConnectApi()` builds the real one.
 *
 * The flow these four make up is `specs/02-architecture/payments.md`, under
 * "Organisation onboarding".
 */

import Stripe from 'stripe';
import { env } from '$env/dynamic/private';

/**
 * The Stripe API version this code is written against.
 *
 * Stripe changes its API over time and pins each account to a version. Saying
 * which one we expect means an account whose default moves on does not quietly
 * change what these calls return.
 *
 * It has to be the version the installed `stripe` package was built for — the
 * package types this field as that one string, so a version we have not checked
 * against fails `pnpm check` rather than surprising us in production. Moving it
 * is therefore the same job as upgrading the package, and both are deliberate.
 */
const STRIPE_API_VERSION = '2026-08-26.dahlia';

/**
 * How long a Stripe call may take before we give up, in milliseconds.
 *
 * A form action is somebody waiting at a screen, so a Stripe outage should show
 * them "Stripe could not be reached" within a few seconds rather than hold the
 * page open until the browser gives up on its own.
 */
const STRIPE_TIMEOUT_MS = 8_000;

/**
 * The bits of Stripe this file uses, named as an interface of our own.
 *
 * It is deliberately much smaller than the real `Stripe` object: four calls,
 * each with only the fields we read. A test can satisfy it in a few lines, and
 * a reader can see the whole of our dealings with Stripe in one place.
 */
export type StripeConnectApi = {
	accounts: {
		create(parameters: Stripe.AccountCreateParams): Promise<{ id: string }>;
		retrieve(accountId: string): Promise<{
			charges_enabled?: boolean;
			details_submitted?: boolean;
			/** The key-value pairs we attached when we opened the account; see `createConnectAccount`. */
			metadata?: Record<string, string> | null;
		}>;
		createLoginLink(accountId: string): Promise<{ url: string }>;
	};
	accountLinks: {
		create(parameters: Stripe.AccountLinkCreateParams): Promise<{ url: string }>;
	};
};

/**
 * Is a Stripe secret key configured at all?
 *
 * Local development and the browser tests run without one, and so does any
 * machine that has not been given the production secrets yet. Every page that
 * offers to talk to Stripe asks this first and says so plainly instead of
 * failing, which is why this is exported rather than only used below.
 */
export function isStripeConfigured(): boolean {
	return Boolean(env.STRIPE_SECRET_KEY);
}

/**
 * The real Stripe client, or `null` when no secret key is configured.
 *
 * `$env/dynamic/private` is read when the server runs rather than when it is
 * built, which is what lets the same build run with and without a key. The
 * static form would refuse to compile on a machine that has none, and that is
 * every machine this repository is developed on today.
 */
export function stripeConnectApi(): StripeConnectApi | null {
	const secretKey = env.STRIPE_SECRET_KEY;

	if (!secretKey) {
		return null;
	}

	return new Stripe(secretKey, {
		apiVersion: STRIPE_API_VERSION,
		timeout: STRIPE_TIMEOUT_MS
	});
}

/** What Stripe needs to know about an organisation to open an account for it. */
export type NewConnectAccount = {
	/** The organisation the account is opened for, written on the account itself. */
	organizationId: string;
	/** Two letters, such as `NL`. Stripe asks for the country the business is in. */
	countryCode: string | null;
	/** The admin who pressed "Connect Stripe". Stripe prefills the form with it. */
	email: string;
};

/**
 * The metadata key under which an account carries the id of the organisation
 * it was opened for. `verifyConnectAccountBelongsTo` reads it back.
 */
const ORGANIZATION_ID_METADATA_KEY = 'organization_id';

/**
 * Open an Express account for an organisation and answer its id.
 *
 * Express is the Connect account type where Stripe hosts the onboarding form
 * and the dashboard, so MUNMeet never collects bank details itself
 * (`specs/02-architecture/payments.md`).
 *
 * `business_type` is left for Stripe to ask about, because a MUN organisation
 * may be a school, a charity or a person, and guessing wrong would make the
 * organiser correct it.
 *
 * A country Stripe does not support, or one we do not have, makes Stripe refuse
 * the call. That comes back to the page as "Stripe could not be reached", which
 * is the same sentence every other failure here gets: there is nothing
 * different for the reader to do about any of them.
 */
export async function createConnectAccount(
	api: StripeConnectApi,
	account: NewConnectAccount
): Promise<string> {
	const created = await api.accounts.create({
		type: 'express',
		email: account.email,
		// The organisation's id goes on the account at Stripe, where nobody but
		// the platform can write it. Every later use of a stored account id reads
		// it back through `verifyConnectAccountBelongsTo`, so an id somebody
		// managed to store against the wrong organisation opens nothing.
		metadata: { [ORGANIZATION_ID_METADATA_KEY]: account.organizationId },
		// Stripe takes no country at all rather than an empty one, so an
		// organisation that never filled its country in is left to say so on
		// Stripe's own form.
		...(account.countryCode ? { country: account.countryCode } : {})
	});

	return created.id;
}

/**
 * Is this the account we opened for this organisation?
 *
 * The database remembers one account id per organisation, and the settings
 * page, the two `/api/stripe/connect` endpoints and, when they come, the
 * webhook and Checkout all act on whatever id is stored: a dashboard login, an
 * onboarding link, a payment routed to it. The security review of 2026-10-10
 * (C5) showed that an id could be stored against an organisation it was never
 * opened for. The database now refuses that; this is the second lock, on the
 * account itself, so that a stored id is never trusted on its own. Every path
 * that uses a stored id calls this first and refuses when it answers `false`.
 *
 * It answers `false` rather than throwing for a mismatch, so a caller can tell
 * "not ours" from "Stripe did not answer", which the caller's `catch` handles.
 * An account with no metadata at all counts as not ours: every account this
 * code opens carries the key, so one without it was not opened by us.
 */
export async function verifyConnectAccountBelongsTo(
	api: StripeConnectApi,
	accountId: string,
	organizationId: string
): Promise<boolean> {
	const account = await api.accounts.retrieve(accountId);

	return account.metadata?.[ORGANIZATION_ID_METADATA_KEY] === organizationId;
}

/**
 * The address of the Stripe-hosted onboarding form for one account.
 *
 * The link is single use and short lived, which is why it is made afresh every
 * time somebody presses "Connect Stripe" rather than stored. `refreshUrl` is
 * where Stripe sends somebody whose link has gone stale, and our endpoint there
 * makes another one and sends them back.
 *
 * Both addresses have to be whole addresses, origin and all, because Stripe is
 * a different website sending the browser back to ours.
 */
export async function createAccountLink(
	api: StripeConnectApi,
	accountId: string,
	returnUrl: string,
	refreshUrl: string
): Promise<string> {
	const link = await api.accountLinks.create({
		account: accountId,
		type: 'account_onboarding',
		return_url: returnUrl,
		refresh_url: refreshUrl
	});

	return link.url;
}

/**
 * A one-time address that signs the organiser into their own Stripe Express
 * dashboard, where they see their payouts.
 *
 * Stripe refuses to make one for an account that has not finished onboarding,
 * so the page only offers this once the connection is complete.
 */
export async function createDashboardLoginLink(
	api: StripeConnectApi,
	accountId: string
): Promise<string> {
	const link = await api.accounts.createLoginLink(accountId);

	return link.url;
}

/** What we read back off a Connect account. Stripe sends a great deal more. */
export type ConnectAccountState = {
	/** True once Stripe will let this account take money. */
	chargesEnabled: boolean;
	/** True once the organiser has filled the onboarding form in. */
	detailsSubmitted: boolean;
};

/**
 * Ask Stripe how far an account has got.
 *
 * `/api/stripe/connect/return` asks this the moment somebody comes back from
 * the onboarding form, so the page can say whether Stripe still wants something
 * rather than leaving them guessing.
 *
 * Both fields are optional on Stripe's own type, and a missing one is read as
 * `false`: not knowing that charges are enabled has to mean they are not, or a
 * conference would start billing delegates into an account that cannot be paid.
 */
export async function readConnectAccount(
	api: StripeConnectApi,
	accountId: string
): Promise<ConnectAccountState> {
	const account = await api.accounts.retrieve(accountId);

	return {
		chargesEnabled: account.charges_enabled === true,
		detailsSubmitted: account.details_submitted === true
	};
}
