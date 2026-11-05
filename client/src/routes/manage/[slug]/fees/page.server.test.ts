import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the actions are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
// The real empty form, not a copy of it: renaming a field in `$lib/fees.ts` has
// to fail here too.
import { EMPTY_FEE_FORM, type ManagedFee } from '$lib/fees';
import type { Conference } from '$lib/conferences';
import type { ManagedOrganization } from '$lib/organizations';
import type { PaymentSettings } from '$lib/server/fees';
import type { OrganiserInvoiceRow } from '$lib/invoices';

// The gate, the queries and the flash cookie are all stood in for, so these
// tests are about what `load` and the five actions themselves decide.
// `requirePermission` has its own tests in `src/lib/server/access`, and what the
// database allows is tested in `tests/db/`.
//
// `$lib/fees` is deliberately not stood in for: it is pure, and running the
// real rules is what proves the page and the actions agree about when a fee may
// be added and when a collection mode may be saved.
vi.mock('$lib/server/access', () => ({ requirePermission: vi.fn(), requireManagePage: vi.fn() }));

vi.mock('$lib/server/fees', () => ({
	readPaymentSettings: vi.fn(),
	updateConferenceSettings: vi.fn(),
	listFees: vi.fn(),
	getFee: vi.fn(),
	createFee: vi.fn(),
	updateFee: vi.fn(),
	moveFee: vi.fn(),
	deleteFee: vi.fn()
}));

vi.mock('$lib/server/organizations', () => ({ getManagedOrganization: vi.fn() }));

vi.mock('$lib/server/invoices', () => ({
	listConferenceInvoices: vi.fn(),
	getConferenceInvoice: vi.fn(),
	settleInvoice: vi.fn()
}));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

vi.mock('$lib/server/ordered-rows', () => ({ placeOrderedRow: vi.fn() }));

import { requireManagePage, requirePermission } from '$lib/server/access';
import {
	createFee,
	deleteFee,
	getFee,
	listFees,
	moveFee,
	readPaymentSettings,
	updateConferenceSettings,
	updateFee
} from '$lib/server/fees';
import { setFlash } from '$lib/server/flash';
import { getConferenceInvoice, listConferenceInvoices, settleInvoice } from '$lib/server/invoices';
import { placeOrderedRow } from '$lib/server/ordered-rows';
import { getManagedOrganization } from '$lib/server/organizations';
import type { MyPermissions, Permission } from '$lib/permissions';

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

/** The organiser `requirePermission` answers with. Nothing here reads them. */
const SIGNED_IN_USER = { id: 'user-1', email: 'daniel@example.com' };

/**
 * The conference every test works on.
 *
 * Only five of its fields are read here: the id the queries are given, the slug
 * the redirects are built from, the status that decides the tab and where a
 * save goes, the timezone the two windows are read in, and the organisation
 * slug the Stripe check follows. It is published, so the page is not a setup
 * step.
 */
const CONFERENCE = {
	id: '11111111-1111-1111-1111-111111111111',
	slug: 'riverside-mun-2027',
	name: 'Riverside MUN 2027',
	status: 'published',
	organizationSlug: 'riverside-mun-society',
	timezone: 'Europe/Amsterdam'
} as unknown as Conference;

/** The same conference before it is published, when the page is step 4 of the setup. */
const DRAFT_CONFERENCE = { ...CONFERENCE, status: 'draft' } as Conference;

/** The organisation that runs it, with Stripe onboarding still unfinished. */
const ORGANIZATION: ManagedOrganization = {
	id: '22222222-2222-2222-2222-222222222222',
	name: 'Riverside MUN Society',
	slug: 'riverside-mun-society',
	logoPath: null,
	isStripeConnected: false
};

/** The same organisation once Stripe onboarding is done. */
const CONNECTED_ORGANIZATION: ManagedOrganization = { ...ORGANIZATION, isStripeConnected: true };

/** Cards off, nothing chosen in their place: the state a new conference starts in. */
const NOTHING_CHOSEN: PaymentSettings = {
	currency: 'EUR',
	collectsPaymentsManually: false,
	paymentInstructions: null
};

/** The organiser collects the money outside MUNMeet and has said how. */
const COLLECTED_BY_HAND: PaymentSettings = {
	currency: 'EUR',
	collectsPaymentsManually: true,
	paymentInstructions: 'Transfer to NL12 BANK 0123 4567 89.'
};

/** A fee twelve invoices were written from, which is why it cannot be deleted. */
const EARLY_BIRD: ManagedFee = {
	id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
	name: 'Early bird delegate fee',
	amountCents: 5500,
	appliesTo: 'individual',
	validFrom: null,
	validUntil: '2026-11-01T22:59:00Z',
	position: 1,
	invoiceCount: 12
};

/** A second fee, with no window and nothing pointing at it yet. */
const DELEGATE_FEE: ManagedFee = {
	id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
	name: 'Delegate fee',
	amountCents: 6500,
	appliesTo: 'individual',
	validFrom: null,
	validUntil: null,
	position: 2,
	invoiceCount: 0
};

/** A fee exactly one invoice was written from, for the singular in the refusal. */
const SCHOOL_FEE: ManagedFee = {
	id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
	name: 'School delegate fee',
	amountCents: 5000,
	appliesTo: 'delegation_member',
	validFrom: null,
	validUntil: null,
	position: 3,
	invoiceCount: 1
};

/** An unpaid invoice of the conference, as the table's query hands it over. */
const UNPAID_INVOICE: OrganiserInvoiceRow = {
	id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
	number: 'RIVERSIDE-MUN-2027-0001',
	payerName: 'Maria Kowalska',
	payerUserId: 'user-2',
	delegationName: null,
	seatLabel: 'UNSC · France',
	description: 'Delegate fee · Riverside MUN 2027',
	quantity: 1,
	unitAmountCents: 6500,
	amountCents: 6500,
	currency: 'EUR',
	platformFeeCents: 200,
	status: 'unpaid',
	paidAt: null,
	paidMethod: null,
	createdAt: '2026-09-02T09:00:00Z',
	note: null
};

/** A second one, paid by hand, and older. */
const PAID_INVOICE: OrganiserInvoiceRow = {
	...UNPAID_INVOICE,
	id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
	number: 'RIVERSIDE-MUN-2027-0002',
	payerName: 'Jan de Vries',
	status: 'paid',
	paidAt: '2026-09-03T09:00:00Z',
	paidMethod: 'manual',
	createdAt: '2026-09-01T09:00:00Z'
};

/** The page itself, with no tab named. */
const FEES_PATH = '/manage/riverside-mun-2027/fees';

/** Where every fee action comes back to: the page's "Fees" tab, named. */
const FEES_TAB_PATH = '/manage/riverside-mun-2027/fees?tab=fees';

/**
 * The few pieces of a request that `load` and the actions here actually read.
 *
 * SvelteKit hands them a great many more, so the cast says "this is enough";
 * anything the code reaches for that is missing fails the test loudly.
 */
function makeEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		params: { slug: CONFERENCE.slug },
		url: new URL(`http://localhost${FEES_PATH}`),
		locals: { supabase: SUPABASE },
		cookies: COOKIES,
		...overrides
	};
}

/**
 * That stand-in, as the `load` function's own event type.
 *
 * `parent()` is how a page's `load` reads what the layout above it returned. It
 * is an async function on the event, so the stand-in is one too. `search` is
 * what carries `?editFee=` in.
 */
function makeLoadEvent(
	search: string = '',
	permissions: MyPermissions = ADMINISTRATOR
): PageServerLoadEvent {
	return makeEvent({
		url: new URL(`http://localhost${FEES_PATH}${search}`),
		parent: async () => ({
			conference: CONFERENCE,
			organization: ORGANIZATION,
			permissions
		})
	}) as unknown as PageServerLoadEvent;
}

/** A team member whose role holds these permissions, conference-wide. */
function holding(...permissions: Permission[]): MyPermissions {
	return {
		held: permissions.map((permission) => ({ permission, scope: 'conference' })),
		committeeIds: [],
		rank: 1
	};
}

/**
 * A post to one of the actions.
 *
 * `search` carries what travels in the action's own address, which for
 * `moveFee` is the direction; `fields` are the hidden and typed fields the form
 * sent.
 */
function makeActionEvent(search: string, fields: Record<string, string> = {}): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	return makeEvent({
		url: new URL(`http://localhost${FEES_PATH}${search}`),
		request: { formData: async () => formData }
	}) as unknown as RequestEvent;
}

/**
 * Run something that is expected to redirect, and give back the redirect.
 *
 * SvelteKit's `redirect` works by throwing rather than by returning, so
 * catching it is the only way to see where it was sending the reader.
 */
async function catchRedirect(run: () => unknown): Promise<{ status: number; location: string }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number; location: string };
	}

	throw new Error('Nothing was thrown, so nothing redirected.');
}

/** What an action returns when it refuses: `fail` gives back `{ status, data }`. */
type ActionResult = {
	status?: number;
	data?: {
		message?: string | null;
		invoiceMessage?: string | null;
		modeErrors?: { mode?: string; paymentInstructions?: string };
		modeValues?: { mode: string; paymentInstructions: string } | null;
	};
};

beforeEach(() => {
	vi.mocked(requirePermission).mockResolvedValue({
		user: SIGNED_IN_USER,
		conference: CONFERENCE
	});
	vi.mocked(getManagedOrganization).mockResolvedValue(ORGANIZATION);
	vi.mocked(readPaymentSettings).mockResolvedValue(NOTHING_CHOSEN);
	vi.mocked(listFees).mockResolvedValue([EARLY_BIRD, DELEGATE_FEE, SCHOOL_FEE]);
	vi.mocked(getFee).mockResolvedValue(EARLY_BIRD);
	vi.mocked(updateConferenceSettings).mockResolvedValue(undefined);
	vi.mocked(createFee).mockResolvedValue(undefined);
	vi.mocked(updateFee).mockResolvedValue(undefined);
	vi.mocked(moveFee).mockResolvedValue(undefined);
	vi.mocked(deleteFee).mockResolvedValue(true);
	vi.mocked(listConferenceInvoices).mockResolvedValue([UNPAID_INVOICE, PAID_INVOICE]);
	vi.mocked(getConferenceInvoice).mockResolvedValue({
		id: UNPAID_INVOICE.id,
		number: UNPAID_INVOICE.number,
		status: 'unpaid'
	});
	vi.mocked(settleInvoice).mockResolvedValue(true);
	vi.mocked(settleInvoice).mockClear();
	vi.mocked(setFlash).mockClear();
	vi.mocked(placeOrderedRow).mockReset();
	vi.mocked(placeOrderedRow).mockResolvedValue(true);
});

describe('load', () => {
	it('opens a published conference on its invoices, and a draft on its fees', async () => {
		const published = await load(makeLoadEvent());
		const draft = await load(
			makeEvent({
				url: new URL(`http://localhost${FEES_PATH}`),
				parent: async () => ({
					conference: DRAFT_CONFERENCE,
					organization: ORGANIZATION,
					permissions: ADMINISTRATOR
				})
			}) as unknown as PageServerLoadEvent
		);

		expect(published).toMatchObject({ tab: 'invoices' });
		expect(draft).toMatchObject({ tab: 'fees' });
	});

	it('reads no invoices for an editor who may not read them, and opens on the fees', async () => {
		const result = await load(makeLoadEvent('?tab=invoices', holding('edit_conference')));

		expect(listConferenceInvoices).not.toHaveBeenCalled();
		expect(result).toMatchObject({
			tab: 'fees',
			access: { canEditFees: true, canReadInvoices: false, canManageInvoices: false }
		});
	});

	it('tells the page a reader of invoices may neither settle them nor change the fees', async () => {
		const result = await load(makeLoadEvent('', holding('read_invoices')));

		expect(result).toMatchObject({
			tab: 'invoices',
			access: { canEditFees: false, canReadInvoices: true, canManageInvoices: false }
		});
	});

	it('follows the tab the address names', async () => {
		const result = await load(makeLoadEvent('?tab=fees'));

		expect(result).toMatchObject({ tab: 'fees' });
	});

	it('counts every invoice for the tab, whatever the filter leaves on the page', async () => {
		const result = await load(makeLoadEvent('?status=paid'));

		expect(result).toMatchObject({ invoiceCount: 2 });
	});

	it('works from the conference the layout already read, and does not check again', async () => {
		await load(makeLoadEvent());

		// The layout read the reader's permissions once; the page checks its own
		// line against them instead of asking the database a second time.
		expect(requirePermission).not.toHaveBeenCalled();
		expect(requireManagePage).toHaveBeenCalledWith(ADMINISTRATOR, 'fees');
		expect(listFees).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id);
		expect(readPaymentSettings).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id);
	});

	/* `toMatchObject` rather than reading a field off the answer: SvelteKit
	   types every `load` as allowed to return nothing at all, so the answer is
	   compared as a whole instead of being narrowed first. */
	it('hands the page the fees in the order they came back, and the payment settings', async () => {
		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({
			fees: [EARLY_BIRD, DELEGATE_FEE, SCHOOL_FEE],
			payment: NOTHING_CHOSEN
		});
	});

	it('shows the empty form and no fee being edited on a plain visit', async () => {
		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({ feeForm: EMPTY_FEE_FORM, editFeeId: null });
	});

	it('hands the page the moment it was drawn, so the rows agree which fee is live', async () => {
		const result = await load(makeLoadEvent());

		// An ISO instant, not a `Date`: only text survives the trip to the browser.
		expect(typeof (result as { now: string }).now).toBe('string');
	});

	it('fills the form from the fee that ?editFee= names', async () => {
		const result = await load(makeLoadEvent(`?editFee=${EARLY_BIRD.id}`));

		expect(result).toMatchObject({
			editFeeId: EARLY_BIRD.id,
			feeForm: {
				feeId: EARLY_BIRD.id,
				name: 'Early bird delegate fee',
				amount: '55.00',
				appliesTo: 'individual'
			}
		});
	});

	it('falls back to the empty form when ?editFee= names no fee of this conference', async () => {
		// A link that has gone stale is not an error: it simply shows "Add fee".
		const result = await load(makeLoadEvent('?editFee=dddddddd-dddd-dddd-dddd-dddddddddddd'));

		expect(result).toMatchObject({ feeForm: EMPTY_FEE_FORM, editFeeId: null });
	});

	it('reads every invoice of the conference and hands the page the filtered page of them', async () => {
		const result = await load(makeLoadEvent('?status=paid'));

		expect(listConferenceInvoices).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id);
		expect(result).toMatchObject({
			invoiceQuery: { q: '', status: 'paid', page: 1, invoice: '' },
			invoiceTable: { rows: [PAID_INVOICE], matchingCount: 1, pageCount: 1 },
			hasInvoices: true,
			invoiceCurrency: 'EUR'
		});
	});

	it('adds up every invoice for the totals, whatever the filter leaves on the page', async () => {
		const result = await load(makeLoadEvent('?status=paid'));

		expect(result).toMatchObject({
			invoiceTotals: {
				invoicedCents: 13000,
				paidCents: 6500,
				outstandingCents: 6500,
				outstandingCount: 1,
				waivedCents: 0,
				platformFeesCents: 0
			}
		});
	});

	it('highlights the invoice ?invoice= names', async () => {
		const result = await load(makeLoadEvent(`?invoice=${PAID_INVOICE.id}`));

		expect(result).toMatchObject({ invoiceTable: { highlightedId: PAID_INVOICE.id } });
	});

	it('says there are no invoices, in the conference currency, before the first one', async () => {
		vi.mocked(listConferenceInvoices).mockResolvedValue([]);

		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({ hasInvoices: false, invoiceCurrency: 'EUR' });
	});
});

describe('the saveCollectionMode action', () => {
	/** The fields the collection-mode form sends. */
	function modeFields(mode: string, paymentInstructions: string = '') {
		return { mode, paymentInstructions };
	}

	it('refuses cards while Stripe is not connected, and saves nothing', async () => {
		const event = makeActionEvent('?/saveCollectionMode', modeFields('stripe'));

		const result = (await actions.saveCollectionMode(event)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.modeErrors?.mode).toBeTruthy();
		expect(updateConferenceSettings).not.toHaveBeenCalled();
	});

	it('refuses collecting by hand with no instructions for the delegate to follow', async () => {
		const event = makeActionEvent('?/saveCollectionMode', modeFields('manual'));

		const result = (await actions.saveCollectionMode(event)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.modeErrors?.paymentInstructions).toBeTruthy();
		expect(updateConferenceSettings).not.toHaveBeenCalled();
	});

	it('hands back what was typed, so a refused form keeps it', async () => {
		const event = makeActionEvent('?/saveCollectionMode', modeFields('manual'));

		const result = (await actions.saveCollectionMode(event)) as ActionResult;

		expect(result.data?.modeValues).toMatchObject({ mode: 'manual' });
	});

	it('saves collecting by hand, says so, and comes back to the page', async () => {
		const event = makeActionEvent(
			'?/saveCollectionMode',
			modeFields('manual', 'Transfer to NL12 BANK 0123 4567 89.')
		);

		const redirect = await catchRedirect(() => actions.saveCollectionMode(event));

		expect(updateConferenceSettings).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, {
			collectsPaymentsManually: true,
			paymentInstructions: 'Transfer to NL12 BANK 0123 4567 89.'
		});
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Payment collection saved.'
		});
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(FEES_TAB_PATH);
	});

	it('moves a draft on to the next setup step, Team, after "Save and continue"', async () => {
		vi.mocked(requirePermission).mockResolvedValue({
			user: SIGNED_IN_USER,
			conference: DRAFT_CONFERENCE
		});
		const event = makeActionEvent(
			'?/saveCollectionMode',
			modeFields('manual', 'Transfer to NL12 BANK 0123 4567 89.')
		);

		const redirect = await catchRedirect(() => actions.saveCollectionMode(event));

		expect(redirect.location).toBe('/manage/riverside-mun-2027/team');
	});

	it('keeps a draft on this page when the form\'s own "Save" sent `stay`', async () => {
		vi.mocked(requirePermission).mockResolvedValue({
			user: SIGNED_IN_USER,
			conference: DRAFT_CONFERENCE
		});
		const event = makeActionEvent('?/saveCollectionMode', {
			...modeFields('manual', 'Transfer to NL12 BANK 0123 4567 89.'),
			stay: 'yes'
		});

		const redirect = await catchRedirect(() => actions.saveCollectionMode(event));

		expect(redirect.location).toBe(FEES_TAB_PATH);
	});

	it('moves an untouched draft on, saving nothing, while cards cannot be chosen yet', async () => {
		vi.mocked(requirePermission).mockResolvedValue({
			user: SIGNED_IN_USER,
			conference: DRAFT_CONFERENCE
		});
		const event = makeActionEvent('?/saveCollectionMode', modeFields('stripe'));

		const redirect = await catchRedirect(() => actions.saveCollectionMode(event));

		expect(redirect.location).toBe('/manage/riverside-mun-2027/team');
		expect(updateConferenceSettings).not.toHaveBeenCalled();
		expect(setFlash).not.toHaveBeenCalled();
	});

	it('still refuses cards on a draft when the organiser switches away from collecting by hand', async () => {
		vi.mocked(requirePermission).mockResolvedValue({
			user: SIGNED_IN_USER,
			conference: DRAFT_CONFERENCE
		});
		vi.mocked(readPaymentSettings).mockResolvedValue(COLLECTED_BY_HAND);
		const event = makeActionEvent('?/saveCollectionMode', modeFields('stripe'));

		const result = (await actions.saveCollectionMode(event)) as ActionResult;

		expect(result.status).toBe(400);
		expect(updateConferenceSettings).not.toHaveBeenCalled();
	});

	it('keeps the instructions when the organiser switches to cards', async () => {
		vi.mocked(getManagedOrganization).mockResolvedValue(CONNECTED_ORGANIZATION);
		vi.mocked(readPaymentSettings).mockResolvedValue(COLLECTED_BY_HAND);

		const event = makeActionEvent(
			'?/saveCollectionMode',
			modeFields('stripe', 'Transfer to NL12 BANK 0123 4567 89.')
		);

		await catchRedirect(() => actions.saveCollectionMode(event));

		// Not cleared: an organiser who switches back should not have to type
		// their bank details out again.
		expect(updateConferenceSettings).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, {
			collectsPaymentsManually: false,
			paymentInstructions: 'Transfer to NL12 BANK 0123 4567 89.'
		});
	});

	it('asks the organiser gate again, because an action is its own request', async () => {
		await actions.saveCollectionMode(makeActionEvent('?/saveCollectionMode', modeFields('stripe')));

		expect(requirePermission).toHaveBeenCalled();
	});
});

describe('the addFee action', () => {
	/** The fields the fee form sends for a plain fee with no window. */
	const NEW_FEE = {
		feeId: '',
		name: 'Delegate fee',
		amount: '65.00',
		appliesTo: 'individual',
		validFrom: '',
		validUntil: ''
	};

	it('refuses while neither Stripe nor collecting by hand is set up', async () => {
		const result = (await actions.addFee(makeActionEvent('?/addFee', NEW_FEE))) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe(
			'Connect Stripe or choose manual collection before adding fees.'
		);
		expect(createFee).not.toHaveBeenCalled();
	});

	it('adds the fee once the organiser collects payments by hand', async () => {
		vi.mocked(readPaymentSettings).mockResolvedValue(COLLECTED_BY_HAND);

		const redirect = await catchRedirect(() =>
			actions.addFee(makeActionEvent('?/addFee', NEW_FEE))
		);

		expect(createFee).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, {
			name: 'Delegate fee',
			amountCents: 6500,
			appliesTo: 'individual',
			validFrom: null,
			validUntil: null
		});
		expect(setFlash).toHaveBeenCalledWith(COOKIES, { tone: 'success', message: 'Fee added.' });
		expect(redirect.location).toBe(FEES_TAB_PATH);
	});

	it('refuses a fee with nothing in its name, and adds nothing', async () => {
		vi.mocked(readPaymentSettings).mockResolvedValue(COLLECTED_BY_HAND);

		const result = (await actions.addFee(
			makeActionEvent('?/addFee', { ...NEW_FEE, name: '' })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(createFee).not.toHaveBeenCalled();
	});
});

describe('the updateFee action', () => {
	/** The fields the fee form sends while it is editing the early bird fee. */
	const EDITED_FEE = {
		feeId: EARLY_BIRD.id,
		name: 'Early bird delegate fee',
		amount: '60.00',
		appliesTo: 'individual',
		validFrom: '',
		validUntil: ''
	};

	it('saves the amount even though invoices point at the fee', async () => {
		const redirect = await catchRedirect(() =>
			actions.updateFee(makeActionEvent('?/updateFee', EDITED_FEE))
		);

		expect(updateFee).toHaveBeenCalledWith(
			SUPABASE,
			EARLY_BIRD.id,
			expect.objectContaining({ amountCents: 6000 })
		);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, { tone: 'success', message: 'Fee saved.' });
		expect(redirect.location).toBe(FEES_TAB_PATH);
	});

	it('refuses a fee id that is not one of this conference’s fees', async () => {
		vi.mocked(getFee).mockResolvedValue(null);

		const result = (await actions.updateFee(
			makeActionEvent('?/updateFee', EDITED_FEE)
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('That fee is not part of this conference.');
		expect(updateFee).not.toHaveBeenCalled();
	});

	it('refuses a request that names no fee, without asking the database for one', async () => {
		const result = (await actions.updateFee(
			makeActionEvent('?/updateFee', { ...EDITED_FEE, feeId: '' })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('That request did not say which fee to save.');
		expect(getFee).not.toHaveBeenCalled();
	});
});

describe('the moveFee action', () => {
	it('moves the fee that was posted up, and comes back to the list', async () => {
		const event = makeActionEvent('?/moveFee&direction=up', { feeId: EARLY_BIRD.id });

		const redirect = await catchRedirect(() => actions.moveFee(event));

		expect(moveFee).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, EARLY_BIRD.id, 'up');
		// No flash: the fee has visibly changed places.
		expect(setFlash).not.toHaveBeenCalled();
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(FEES_TAB_PATH);
	});

	it('refuses a direction a fee cannot move, and moves nothing', async () => {
		const event = makeActionEvent('?/moveFee&direction=sideways', { feeId: EARLY_BIRD.id });

		const result = (await actions.moveFee(event)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('A fee can only move up or down.');
		expect(moveFee).not.toHaveBeenCalled();
	});

	it('refuses a request that names no direction at all', async () => {
		const event = makeActionEvent('?/moveFee', { feeId: EARLY_BIRD.id });

		const result = (await actions.moveFee(event)) as ActionResult;

		expect(result.status).toBe(400);
		expect(moveFee).not.toHaveBeenCalled();
	});

	it('refuses a request that names no fee', async () => {
		const result = (await actions.moveFee(
			makeActionEvent('?/moveFee&direction=up')
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('That request did not say which fee to move.');
		expect(moveFee).not.toHaveBeenCalled();
	});
});

describe('the deleteFee action', () => {
	it('deletes an unused fee, says so, and comes back to the list', async () => {
		vi.mocked(getFee).mockResolvedValue(DELEGATE_FEE);

		const event = makeActionEvent('?/deleteFee', { feeId: DELEGATE_FEE.id });
		const redirect = await catchRedirect(() => actions.deleteFee(event));

		expect(deleteFee).toHaveBeenCalledWith(SUPABASE, DELEGATE_FEE.id);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, { tone: 'success', message: 'Fee deleted.' });
		expect(redirect.location).toBe(FEES_TAB_PATH);
	});

	it('says how many invoices stand in the way when the database refuses', async () => {
		vi.mocked(deleteFee).mockResolvedValue(false);

		const event = makeActionEvent('?/deleteFee', { feeId: EARLY_BIRD.id });
		const result = (await actions.deleteFee(event)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe(
			'This fee is used by 12 invoices and cannot be deleted. Set an end date instead.'
		);
	});

	it('says "1 invoice" rather than "1 invoices" for a fee with one', async () => {
		vi.mocked(getFee).mockResolvedValue(SCHOOL_FEE);
		vi.mocked(deleteFee).mockResolvedValue(false);

		const event = makeActionEvent('?/deleteFee', { feeId: SCHOOL_FEE.id });
		const result = (await actions.deleteFee(event)) as ActionResult;

		expect(result.data?.message).toBe(
			'This fee is used by 1 invoice and cannot be deleted. Set an end date instead.'
		);
	});

	it('refuses a fee id that is not one of this conference’s fees', async () => {
		vi.mocked(getFee).mockResolvedValue(null);

		const event = makeActionEvent('?/deleteFee', { feeId: EARLY_BIRD.id });
		const result = (await actions.deleteFee(event)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('That fee is not part of this conference.');
		expect(deleteFee).not.toHaveBeenCalled();
	});

	it('refuses a request that names no fee, without asking the database for one', async () => {
		// An empty id is not something the database can look a fee up by, so it is
		// refused before `getFee` is ever called.
		const result = (await actions.deleteFee(makeActionEvent('?/deleteFee', {}))) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('That request did not say which fee to delete.');
		expect(getFee).not.toHaveBeenCalled();
	});

	it('asks the organiser gate again', async () => {
		vi.mocked(getFee).mockResolvedValue(DELEGATE_FEE);

		const event = makeActionEvent('?/deleteFee', { feeId: DELEGATE_FEE.id });

		await catchRedirect(() => actions.deleteFee(event));

		expect(requirePermission).toHaveBeenCalled();
	});
});

describe('the three invoice actions', () => {
	it('ask for manage_invoices, and the fee actions for edit_conference', async () => {
		await catchRedirect(() =>
			actions.markPaid(makeActionEvent('?/markPaid', { invoiceId: UNPAID_INVOICE.id }))
		);
		await actions.addFee(makeActionEvent('?/addFee', { name: '' }));

		expect(vi.mocked(requirePermission).mock.calls.map((call) => call[3])).toEqual([
			'manage_invoices',
			'edit_conference'
		]);
	});

	it('marks an invoice paid with the note, names it in the flash, and keeps the filters', async () => {
		const event = makeActionEvent('?status=unpaid&page=2&/markPaid', {
			invoiceId: UNPAID_INVOICE.id,
			note: ' Cash at registration '
		});

		const redirect = await catchRedirect(() => actions.markPaid(event));

		expect(getConferenceInvoice).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, UNPAID_INVOICE.id);
		expect(settleInvoice).toHaveBeenCalledWith(
			SUPABASE,
			{ id: UNPAID_INVOICE.id, number: UNPAID_INVOICE.number, status: 'unpaid' },
			'markPaid',
			'Cash at registration',
			expect.any(Date)
		);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Invoice RIVERSIDE-MUN-2027-0001 marked as paid.'
		});
		expect(redirect).toMatchObject({
			status: 303,
			location: `${FEES_PATH}?status=unpaid&page=2#invoices`
		});
	});

	it('waives and voids through the same steps', async () => {
		const waive = makeActionEvent('?/waive', { invoiceId: UNPAID_INVOICE.id });
		const voidEvent = makeActionEvent('?/void', { invoiceId: UNPAID_INVOICE.id, note: 'Ignored' });

		await catchRedirect(() => actions.waive(waive));
		await catchRedirect(() => actions.void(voidEvent));

		const settledActions = vi.mocked(settleInvoice).mock.calls.map((call) => [call[2], call[3]]);

		// "Void" has no note box, so a note sent with it by hand is not written.
		expect(settledActions).toEqual([
			['waive', null],
			['void', null]
		]);
	});

	it('refuses a move canTransitionInvoice does not allow, and changes nothing', async () => {
		vi.mocked(getConferenceInvoice).mockResolvedValue({
			id: PAID_INVOICE.id,
			number: PAID_INVOICE.number,
			status: 'paid'
		});

		const event = makeActionEvent('?/waive', { invoiceId: PAID_INVOICE.id });
		const result = (await actions.waive(event)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.invoiceMessage).toBe('This invoice is paid and cannot be waived.');
		expect(result.data?.message).toBeNull();
		expect(settleInvoice).not.toHaveBeenCalled();
	});

	it('refuses an invoice that is not one of this conference’s', async () => {
		vi.mocked(getConferenceInvoice).mockResolvedValue(null);

		const event = makeActionEvent('?/void', { invoiceId: 'somebody-elses' });
		const result = (await actions.void(event)) as ActionResult;

		expect(result.data?.invoiceMessage).toBe('That invoice is not part of this conference.');
		expect(settleInvoice).not.toHaveBeenCalled();
	});

	it('refuses a request that names no invoice, without asking the database for one', async () => {
		vi.mocked(getConferenceInvoice).mockClear();

		const result = (await actions.markPaid(makeActionEvent('?/markPaid', {}))) as ActionResult;

		expect(result.data?.invoiceMessage).toBe('That request did not say which invoice to change.');
		expect(getConferenceInvoice).not.toHaveBeenCalled();
	});

	it('refuses a note longer than the box allows', async () => {
		const event = makeActionEvent('?/markPaid', {
			invoiceId: UNPAID_INVOICE.id,
			note: 'x'.repeat(201)
		});

		const result = (await actions.markPaid(event)) as ActionResult;

		expect(result.data?.invoiceMessage).toBe('Please keep the note to 200 characters or fewer.');
		expect(settleInvoice).not.toHaveBeenCalled();
	});

	it('says so when somebody else changed the invoice in the meantime', async () => {
		vi.mocked(settleInvoice).mockResolvedValue(false);

		const event = makeActionEvent('?/markPaid', { invoiceId: UNPAID_INVOICE.id });
		const result = (await actions.markPaid(event)) as ActionResult;

		expect(result.data?.invoiceMessage).toBe(
			'Somebody changed this invoice a moment ago. Look at its status and try again.'
		);
		expect(setFlash).not.toHaveBeenCalled();
	});

	it('asks the organiser gate again', async () => {
		vi.mocked(requirePermission).mockClear();

		const event = makeActionEvent('?/void', { invoiceId: UNPAID_INVOICE.id });
		await catchRedirect(() => actions.void(event));

		expect(requirePermission).toHaveBeenCalled();
	});
});

describe('the moveFeeTo action', () => {
	it('puts the dropped fee at its place, counting from 0, and comes back to the list', async () => {
		const event = makeActionEvent('?/moveFeeTo', { feeId: SCHOOL_FEE.id, place: '1' });

		const redirect = await catchRedirect(() => actions.moveFeeTo(event));

		expect(placeOrderedRow).toHaveBeenCalledWith(
			SUPABASE,
			{ table: 'fees', ownerColumn: 'conference_id', ownerId: CONFERENCE.id },
			SCHOOL_FEE.id,
			0
		);
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(FEES_TAB_PATH);
		expect(requirePermission).toHaveBeenCalled();
	});

	it('refuses a drop that names no fee or no place, and moves nothing', async () => {
		const withoutPlace = makeActionEvent('?/moveFeeTo', { feeId: SCHOOL_FEE.id });
		const withoutFee = makeActionEvent('?/moveFeeTo', { place: '2' });

		const first = (await actions.moveFeeTo(withoutPlace)) as ActionResult;
		const second = (await actions.moveFeeTo(withoutFee)) as ActionResult;

		expect(first.status).toBe(400);
		expect(first.data?.message).toBe('That request did not say which fee to move, or where.');
		expect(second.status).toBe(400);
		expect(placeOrderedRow).not.toHaveBeenCalled();
	});

	it('says so when the fee is not part of this conference', async () => {
		vi.mocked(placeOrderedRow).mockResolvedValue(false);
		const event = makeActionEvent('?/moveFeeTo', { feeId: 'gone', place: '1' });

		const result = (await actions.moveFeeTo(event)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('That fee is not part of this conference.');
	});
});
