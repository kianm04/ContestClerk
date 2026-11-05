import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StripeConnectApi } from './stripe';

// The four Connect calls, the check that a stored account is ours, and the two
// questions about whether Stripe is configured at all.
//
// None of this talks to Stripe. Each call takes a `StripeConnectApi` as its
// first argument — the way every function in `$lib/server` takes the Supabase
// client first — so a test hands it a stand-in and reads what was asked for.
// What Stripe then does with an account, an account link or a login link is
// Stripe's own business and is checked by hand against a test-mode account;
// `specs/02-architecture/payments.md` says how.

/**
 * The environment `$env/dynamic/private` hands back, which these tests write to
 * before each one.
 *
 * `vi.mock` replaces the module for the whole file, and it is hoisted above the
 * imports, so the object it hands out has to be made inside the factory rather
 * than referred to from outside it. `vi.hoisted` is what lets this file hold a
 * reference to it as well.
 */
const { environment } = vi.hoisted(() => ({ environment: { STRIPE_SECRET_KEY: '' } }));

vi.mock('$env/dynamic/private', () => ({ env: environment }));

const {
	createAccountLink,
	createConnectAccount,
	createDashboardLoginLink,
	isStripeConfigured,
	readConnectAccount,
	stripeConnectApi,
	verifyConnectAccountBelongsTo
} = await import('./stripe');

/** What the stand-in below wrote down: one entry per call, with its arguments. */
type RecordedCalls = {
	accountsCreated: unknown[];
	accountsRetrieved: string[];
	loginLinksCreated: string[];
	accountLinksCreated: unknown[];
};

/** What the stand-in should answer with. Everything has a harmless default. */
type StandInAnswers = {
	account?: {
		charges_enabled?: boolean;
		details_submitted?: boolean;
		metadata?: Record<string, string> | null;
	};
	/** The message every call fails with instead of answering, as Stripe's client throws. */
	throwsMessage?: string;
};

/**
 * A stand-in for the small slice of Stripe this module uses.
 *
 * `StripeConnectApi` is deliberately much narrower than the real `Stripe`
 * object — four calls, each with only the fields we read — which is what makes
 * satisfying it here a few lines rather than a mock of a whole SDK.
 */
function createStripeStandIn(answers: StandInAnswers = {}): {
	api: StripeConnectApi;
	calls: RecordedCalls;
} {
	const calls: RecordedCalls = {
		accountsCreated: [],
		accountsRetrieved: [],
		loginLinksCreated: [],
		accountLinksCreated: []
	};

	function failIfAsked() {
		if (answers.throwsMessage) {
			throw new Error(answers.throwsMessage);
		}
	}

	const api: StripeConnectApi = {
		accounts: {
			create: async (parameters) => {
				calls.accountsCreated.push(parameters);
				failIfAsked();

				return { id: 'acct_new' };
			},
			retrieve: async (accountId) => {
				calls.accountsRetrieved.push(accountId);
				failIfAsked();

				return answers.account ?? {};
			},
			createLoginLink: async (accountId) => {
				calls.loginLinksCreated.push(accountId);
				failIfAsked();

				return { url: 'https://connect.stripe.com/express/login-link' };
			}
		},
		accountLinks: {
			create: async (parameters) => {
				calls.accountLinksCreated.push(parameters);
				failIfAsked();

				return { url: 'https://connect.stripe.com/setup/e/acct_new' };
			}
		}
	};

	return { api, calls };
}

beforeEach(() => {
	environment.STRIPE_SECRET_KEY = '';
});

describe('isStripeConfigured', () => {
	it('is false on a server with no secret key, which is every development machine', () => {
		expect(isStripeConfigured()).toBe(false);
	});

	it('is true once a secret key is set', () => {
		environment.STRIPE_SECRET_KEY = 'sk_test_example';

		expect(isStripeConfigured()).toBe(true);
	});
});

describe('stripeConnectApi', () => {
	// Every page that offers to talk to Stripe asks for the client first and says
	// "Stripe is not set up on this server yet" when there is none, rather than
	// failing in front of the organiser.
	it('answers null when there is no secret key', () => {
		expect(stripeConnectApi()).toBeNull();
	});

	it('builds a client once a secret key is set', () => {
		environment.STRIPE_SECRET_KEY = 'sk_test_example';

		expect(stripeConnectApi()).not.toBeNull();
	});
});

describe('createConnectAccount', () => {
	it('opens an Express account and answers its id', async () => {
		const { api, calls } = createStripeStandIn();

		const accountId = await createConnectAccount(api, {
			organizationId: 'org-1',
			countryCode: 'NL',
			email: 'daniel@example.com'
		});

		expect(accountId).toBe('acct_new');
		expect(calls.accountsCreated[0]).toEqual({
			type: 'express',
			email: 'daniel@example.com',
			country: 'NL',
			metadata: { organization_id: 'org-1' }
		});
	});

	// The organisation's id is written on the account at Stripe, where only the
	// platform can write it, and `verifyConnectAccountBelongsTo` reads it back
	// before any stored id is acted on (security review 2026-10-10, C5).
	it('writes the organisation it was opened for on the account itself', async () => {
		const { api, calls } = createStripeStandIn();

		await createConnectAccount(api, {
			organizationId: 'org-1',
			countryCode: null,
			email: 'daniel@example.com'
		});

		expect(calls.accountsCreated[0]).toMatchObject({ metadata: { organization_id: 'org-1' } });
	});

	// Stripe takes no country at all rather than an empty one, and an
	// organisation that never filled its country in is left to say so on
	// Stripe's own form.
	it('sends no country for an organisation that has none', async () => {
		const { api, calls } = createStripeStandIn();

		await createConnectAccount(api, {
			organizationId: 'org-1',
			countryCode: null,
			email: 'daniel@example.com'
		});

		expect(calls.accountsCreated[0]).not.toHaveProperty('country');
	});

	// `business_type` is left for Stripe to ask about, because a MUN
	// organisation may be a school, a charity or a person.
	it('does not guess what kind of business the organisation is', async () => {
		const { api, calls } = createStripeStandIn();

		await createConnectAccount(api, {
			organizationId: 'org-1',
			countryCode: 'NL',
			email: 'daniel@example.com'
		});

		expect(calls.accountsCreated[0]).not.toHaveProperty('business_type');
	});

	it('lets a Stripe failure through, for the caller to turn into a sentence', async () => {
		const { api } = createStripeStandIn({ throwsMessage: 'country not supported' });

		await expect(
			createConnectAccount(api, {
				organizationId: 'org-1',
				countryCode: 'ZZ',
				email: 'daniel@example.com'
			})
		).rejects.toThrow('country not supported');
	});
});

describe('verifyConnectAccountBelongsTo', () => {
	it('says yes for the account that carries this organisation’s id', async () => {
		const { api, calls } = createStripeStandIn({
			account: { metadata: { organization_id: 'org-1' } }
		});

		expect(await verifyConnectAccountBelongsTo(api, 'acct_ours', 'org-1')).toBe(true);
		expect(calls.accountsRetrieved).toEqual(['acct_ours']);
	});

	// The attack the security review described: a real, onboarded account id
	// stored against an organisation it was never opened for. The database now
	// refuses storing it; this is the lock on the account itself, so that a
	// stored id is never trusted on its own.
	it('says no for an account opened for another organisation', async () => {
		const { api } = createStripeStandIn({
			account: { metadata: { organization_id: 'org-somebody-elses' } }
		});

		expect(await verifyConnectAccountBelongsTo(api, 'acct_theirs', 'org-1')).toBe(false);
	});

	// Every account this code opens carries the key, so one without it was not
	// opened by us.
	it('says no for an account with no metadata at all', async () => {
		const withoutMetadata = createStripeStandIn({ account: {} });
		const withNullMetadata = createStripeStandIn({ account: { metadata: null } });

		expect(await verifyConnectAccountBelongsTo(withoutMetadata.api, 'acct_x', 'org-1')).toBe(false);
		expect(await verifyConnectAccountBelongsTo(withNullMetadata.api, 'acct_x', 'org-1')).toBe(
			false
		);
	});

	// "Not ours" and "Stripe did not answer" are different things for a caller:
	// the first is refused with a sentence, the second is the usual "Stripe
	// could not be reached", so the failure has to come through as a throw.
	it('lets a Stripe failure through rather than reading it as a mismatch', async () => {
		const { api } = createStripeStandIn({ throwsMessage: 'no such account' });

		await expect(verifyConnectAccountBelongsTo(api, 'acct_gone', 'org-1')).rejects.toThrow(
			'no such account'
		);
	});
});

describe('createAccountLink', () => {
	it('asks for an onboarding link and answers its address', async () => {
		const { api, calls } = createStripeStandIn();

		const link = await createAccountLink(
			api,
			'acct_new',
			'https://munmeet.app/api/stripe/connect/return?org=thimun-foundation',
			'https://munmeet.app/api/stripe/connect/refresh?org=thimun-foundation'
		);

		expect(link).toBe('https://connect.stripe.com/setup/e/acct_new');
		expect(calls.accountLinksCreated[0]).toEqual({
			account: 'acct_new',
			type: 'account_onboarding',
			return_url: 'https://munmeet.app/api/stripe/connect/return?org=thimun-foundation',
			refresh_url: 'https://munmeet.app/api/stripe/connect/refresh?org=thimun-foundation'
		});
	});
});

describe('createDashboardLoginLink', () => {
	it('answers a one-time address into the organisation’s own Stripe dashboard', async () => {
		const { api, calls } = createStripeStandIn();

		const link = await createDashboardLoginLink(api, 'acct_new');

		expect(link).toBe('https://connect.stripe.com/express/login-link');
		expect(calls.loginLinksCreated).toEqual(['acct_new']);
	});
});

describe('readConnectAccount', () => {
	it('says how far the account has got', async () => {
		const { api, calls } = createStripeStandIn({
			account: { charges_enabled: true, details_submitted: true }
		});

		const state = await readConnectAccount(api, 'acct_new');

		expect(state).toEqual({ chargesEnabled: true, detailsSubmitted: true });
		expect(calls.accountsRetrieved).toEqual(['acct_new']);
	});

	it('says charges are not enabled while Stripe still wants details', async () => {
		const { api } = createStripeStandIn({
			account: { charges_enabled: false, details_submitted: true }
		});

		const state = await readConnectAccount(api, 'acct_new');

		expect(state.chargesEnabled).toBe(false);
	});

	// Both fields are optional on Stripe's own type, and not knowing that charges
	// are enabled has to mean they are not: otherwise a conference would start
	// billing delegates into an account that cannot be paid.
	it('reads a missing field as false rather than as unknown', async () => {
		const { api } = createStripeStandIn({ account: {} });

		const state = await readConnectAccount(api, 'acct_new');

		expect(state).toEqual({ chargesEnabled: false, detailsSubmitted: false });
	});
});
