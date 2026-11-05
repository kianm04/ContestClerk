import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the actions are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import type { SeatGroup } from '$lib/allocation';
import { UNEXPECTED_ERROR_TEXT } from '$lib/auth';
import type { Conference } from '$lib/conferences';
import type { DelegationMember, DelegationSeatGroup } from '$lib/delegations';
import {
	ALREADY_DECIDED_REFUSAL,
	INTERNAL_NOTE_MAX_LENGTH,
	INTERNAL_NOTE_SAVED_FLASH,
	INTERNAL_NOTE_TOO_LONG_REFUSAL,
	NO_SEATS_TICKED_REFUSAL,
	REJECTED_FLASH,
	SEATS_BEFORE_REJECTING_REFUSAL,
	SEATS_JUST_CHANGED_REFUSAL,
	SEAT_ALREADY_REMOVED_REFUSAL,
	SEAT_HAS_MEMBER_REFUSAL,
	SEAT_REMOVED_FLASH,
	seatTakenRefusal,
	type DelegationInvoiceLine,
	type OrganiserDelegation,
	type OrganiserDelegationDetail
} from '$lib/delegation-review';

// The gate, the queries and the flash cookie are all stood in for, so these
// tests are about what `load` and the four actions themselves decide.
// `requirePermission` has its own tests in `src/lib/server/access`, and what the
// database itself refuses is tested in `tests/db/`.
//
// `$lib/delegation-review` and `$lib/urls` are deliberately not stood in for:
// they are pure, and running the real ones is what proves that the refusals,
// the flashes and the address this page redirects to all agree with each
// other.
vi.mock('$lib/server/access', () => ({
	requirePermission: vi.fn(),
	requirePermissionAndRank: vi.fn(),
	requireManagePage: vi.fn()
}));

vi.mock('$lib/server/delegations', () => ({
	getDelegationForOrganiser: vi.fn(),
	listDelegationInvoices: vi.fn(),
	rejectDelegation: vi.fn(),
	saveDelegationDecisionNote: vi.fn(),
	updateDelegationInternalNote: vi.fn()
}));

vi.mock('$lib/server/seat-acceptance', () => ({
	allocateDelegationSeats: vi.fn(),
	listSeatsByCommittee: vi.fn(),
	readSeatLabel: vi.fn()
}));

vi.mock('$lib/server/allocation-grid', () => ({ removeDelegationSeat: vi.fn() }));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

import { requireManagePage, requirePermission, requirePermissionAndRank } from '$lib/server/access';
import { removeDelegationSeat } from '$lib/server/allocation-grid';
import {
	getDelegationForOrganiser,
	listDelegationInvoices,
	rejectDelegation,
	saveDelegationDecisionNote,
	updateDelegationInternalNote
} from '$lib/server/delegations';
import { setFlash } from '$lib/server/flash';
import {
	allocateDelegationSeats,
	listSeatsByCommittee,
	readSeatLabel
} from '$lib/server/seat-acceptance';
import type { MyPermissions } from '$lib/permissions';

/** What the layout hands down for an organiser: `administrator` opens every page. */
const ADMINISTRATOR: MyPermissions = {
	held: [{ permission: 'administrator', scope: 'conference' }],
	committeeIds: [],
	rank: -1
};

/** A team member whose role reads the applications and may not decide them. */
const READER: MyPermissions = {
	held: [{ permission: 'read_applications', scope: 'conference' }],
	committeeIds: [],
	rank: 1
};

/** The Supabase client. `load` and the actions only hand it on. */
const SUPABASE = {};

/** The cookie jar. Only `setFlash`, which is stood in for, ever touches it. */
const COOKIES = {};

/** The organiser every action here runs as. */
const SIGNED_IN_USER = { id: 'user-organiser', email: 'daniel@example.com' };

/** The conference. Only its id, its slug and its timezone are read. */
const CONFERENCE = {
	id: 'conference-1',
	slug: 'thimun-2027',
	name: 'THIMUN The Hague 2027',
	timezone: 'Europe/Amsterdam'
} as unknown as Conference;

const DELEGATION_ID = 'delegation-1';

/** The page every action comes back to, and the address they are all posted to. */
const DELEGATION_PATH = `/manage/${CONFERENCE.slug}/delegations/${DELEGATION_ID}`;

/** The delegation itself, as `getDelegationForOrganiser` answers with it. */
function organiserDelegation(overrides: Partial<OrganiserDelegation> = {}): OrganiserDelegation {
	return {
		id: DELEGATION_ID,
		conferenceId: CONFERENCE.id,
		name: 'Lycee Francais Delegation',
		institutionName: 'Lycee Francais de La Haye',
		countryCode: 'FR',
		status: 'submitted',
		requestedSeats: 4,
		note: 'Two chaperones travel with us.',
		submittedAt: '2026-10-03T09:00:00Z',
		decidedAt: null,
		decisionNote: null,
		internalNote: null,
		...overrides
	};
}

/** One seat the organisers have already reserved: France holds somebody, Brazil is empty. */
const RESERVED_SEAT_GROUPS: DelegationSeatGroup[] = [
	{
		committee: {
			id: 'committee-1',
			name: 'Security Council',
			abbreviation: 'UNSC',
			level: 'advanced'
		},
		seats: [
			{
				id: 'seat-held',
				name: 'France',
				countryCode: 'FR',
				holder: {
					userId: 'user-1',
					fullName: 'Amira Haddad',
					avatarPath: null,
					experienceLevel: null
				}
			},
			{
				id: 'seat-empty',
				name: 'Brazil',
				countryCode: 'BR',
				holder: null
			}
		]
	}
];

/** Two free seats the picker offers when the delegation may still be given more. */
const FREE_SEAT_GROUPS: SeatGroup[] = [
	{
		committeeId: 'committee-1',
		committeeLabel: 'UNSC',
		seats: [
			{
				id: 'seat-free-1',
				committeeId: 'committee-1',
				name: 'Chad',
				countryCode: 'TD',
				isAvailable: true,
				delegationId: null,
				userId: null
			},
			{
				id: 'seat-free-2',
				committeeId: 'committee-1',
				name: 'Peru',
				countryCode: 'PE',
				isAvailable: true,
				delegationId: null,
				userId: null
			}
		]
	}
];

/** Everything `getDelegationForOrganiser` answers with, for one delegation. */
function organiserDelegationDetail(
	overrides: {
		delegation?: Partial<OrganiserDelegation>;
		seatGroups?: DelegationSeatGroup[];
		invoices?: DelegationInvoiceLine[];
		members?: DelegationMember[];
	} = {}
): OrganiserDelegationDetail {
	return {
		delegation: organiserDelegation(overrides.delegation),
		members: overrides.members ?? [],
		seatGroups: overrides.seatGroups ?? RESERVED_SEAT_GROUPS,
		invoices: overrides.invoices ?? []
	};
}

/**
 * The few pieces of a request that `load` and the actions here actually read.
 *
 * SvelteKit hands them a great many more, so the cast says "this is enough";
 * anything the code reaches for that is missing fails the test loudly.
 */
function makeEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		params: { slug: CONFERENCE.slug, delegationId: DELEGATION_ID },
		url: new URL(`http://localhost${DELEGATION_PATH}`),
		locals: { supabase: SUPABASE },
		cookies: COOKIES,
		...overrides
	};
}

/**
 * That stand-in, as the `load` function's own event type.
 *
 * `parent()` is how a page's `load` reads what the layout above it returned:
 * the layout hands this conference and the reader's permissions on.
 */
function makeLoadEvent(permissions: MyPermissions = ADMINISTRATOR): PageServerLoadEvent {
	return makeEvent({
		parent: async () => ({ conference: CONFERENCE, permissions })
	}) as unknown as PageServerLoadEvent;
}

/** A post carrying these fields to `allocate`, `reject` or `saveInternalNote`. */
function makeActionEvent(fields: Record<string, string | string[]> = {}): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		if (Array.isArray(value)) {
			for (const entry of value) {
				formData.append(name, entry);
			}
			continue;
		}

		formData.set(name, value);
	}

	return makeEvent({
		request: { formData: async () => formData }
	}) as unknown as RequestEvent;
}

/**
 * A post to `removeSeat`, which reads the seat off the address rather than off
 * a field: `ConfirmButton` renders a form of its own and takes no hidden
 * fields, the same reason the allocation grid's own buttons do.
 */
function makeRemoveSeatEvent(seatId: string): RequestEvent {
	return makeEvent({
		url: new URL(`http://localhost${DELEGATION_PATH}?seatId=${encodeURIComponent(seatId)}`)
	}) as unknown as RequestEvent;
}

/**
 * Run something that is expected to throw, and give back what it threw.
 *
 * Both of SvelteKit's `redirect` and `error` work by throwing rather than by
 * returning, so catching is the only way to see where the reader was sent or
 * which status they were given.
 */
async function catchThrown(run: () => unknown): Promise<{ status: number; location?: string }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number; location?: string };
	}

	throw new Error('Nothing was thrown, so nothing redirected or failed.');
}

/** The message the flash cookie was given, whichever action wrote it. */
function flashMessage(): string {
	return vi.mocked(setFlash).mock.calls[0][1].message;
}

/** The tone it was given: `success` for something done, `error` for a refusal. */
function flashTone(): string {
	return vi.mocked(setFlash).mock.calls[0][1].tone;
}

beforeEach(() => {
	vi.clearAllMocks();

	vi.mocked(requirePermission).mockResolvedValue({ user: SIGNED_IN_USER, conference: CONFERENCE });
	vi.mocked(requirePermissionAndRank).mockResolvedValue({
		user: SIGNED_IN_USER,
		conference: CONFERENCE,
		permissions: ADMINISTRATOR
	});
	vi.mocked(getDelegationForOrganiser).mockResolvedValue(organiserDelegationDetail());
	vi.mocked(listSeatsByCommittee).mockResolvedValue(FREE_SEAT_GROUPS);
	vi.mocked(listDelegationInvoices).mockResolvedValue([]);
	vi.mocked(allocateDelegationSeats).mockResolvedValue(undefined);
	vi.mocked(saveDelegationDecisionNote).mockResolvedValue(undefined);
	vi.mocked(rejectDelegation).mockResolvedValue(undefined);
	vi.mocked(updateDelegationInternalNote).mockResolvedValue(undefined);
	vi.mocked(removeDelegationSeat).mockResolvedValue(undefined);
	vi.mocked(readSeatLabel).mockResolvedValue('UNSC · Egypt');
});

describe('load', () => {
	it('asks the permissions the layout read whether this page opens for the reader', async () => {
		await load(makeLoadEvent());

		expect(requireManagePage).toHaveBeenCalledWith(ADMINISTRATOR, 'delegations');
	});

	it('tells the page whether the reader may decide, so a reader sees no forms', async () => {
		expect(await load(makeLoadEvent(ADMINISTRATOR))).toMatchObject({ canDecide: true });
		expect(await load(makeLoadEvent(READER))).toMatchObject({ canDecide: false });
	});

	it('is a 404 for a delegation nobody may see: gone, another conference’s, or still a draft', async () => {
		vi.mocked(getDelegationForOrganiser).mockResolvedValue(null);

		const thrown = await catchThrown(() => load(makeLoadEvent()));

		expect(thrown.status).toBe(404);
	});

	it('reads the delegation of the conference the layout already found', async () => {
		await load(makeLoadEvent());

		expect(getDelegationForOrganiser).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, DELEGATION_ID);
	});

	it('works out the three numbers over the seats from the groups it already has', async () => {
		const result = await load(makeLoadEvent());

		// One committee, two reserved seats, one of them assigned: this is what
		// `delegationProgress` and `delegationSeatCounts` make of that, and running
		// the real functions is what proves the page and this test agree.
		expect(result).toMatchObject({
			progress: { requested: 4, allocated: 2, assigned: 1, percentAssigned: 50 }
		});
	});

	it('reads the free seats of the conference for a delegation that can still be given more', async () => {
		const result = await load(makeLoadEvent());

		expect(listSeatsByCommittee).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id);
		expect(result).toMatchObject({ canAllocate: true, freeSeatsByCommittee: FREE_SEAT_GROUPS });
	});

	it('sends a member’s private details only as far as the reader holds them on this conference', async () => {
		/** A member as the views send them: details and all. */
		function member(userId: string, fullName: string): DelegationMember {
			return {
				userId,
				fullName,
				avatarPath: null,
				institutionName: 'Lycee Francais de La Haye',
				experienceLevel: 'intermediate',
				role: 'member',
				joinedAt: '2026-10-01T09:00:00Z',
				seat: null,
				details: {
					dateOfBirth: '2008-04-12',
					phone: '+31 6 1234 5678',
					dietaryRequirements: 'None'
				}
			};
		}

		vi.mocked(getDelegationForOrganiser).mockResolvedValue(
			organiserDelegationDetail({
				members: [member('user-1', 'Amira Haddad'), member('user-2', 'Luis Ortega')]
			})
		);
		// A chair of committee-1 here who holds both permissions conference-wide
		// on another conference, which is why the views sent both members'.
		const chair: MyPermissions = {
			held: [
				{ permission: 'read_applications', scope: 'conference' },
				{ permission: 'read_contact_details', scope: 'committees' },
				{ permission: 'read_welfare_details', scope: 'committees' }
			],
			committeeIds: ['committee-1'],
			rank: 2
		};

		const result = (await load(makeLoadEvent(chair))) as { members: DelegationMember[] };

		// Amira holds the delegation's committee-1 seat; Luis holds none.
		expect(result.members.map((each) => each.details)).toEqual([
			{ dateOfBirth: '2008-04-12', phone: '+31 6 1234 5678', dietaryRequirements: 'None' },
			null
		]);

		const readerResult = (await load(makeLoadEvent(READER))) as { members: DelegationMember[] };

		expect(readerResult.members.map((each) => each.details)).toEqual([null, null]);
	});

	it('does not read the free seats for a delegation that has already been decided', async () => {
		vi.mocked(getDelegationForOrganiser).mockResolvedValue(
			organiserDelegationDetail({ delegation: { status: 'rejected' }, seatGroups: [] })
		);

		const result = await load(makeLoadEvent());

		expect(listSeatsByCommittee).not.toHaveBeenCalled();
		expect(result).toMatchObject({ canAllocate: false, freeSeatsByCommittee: [] });
	});
});

describe('the allocate action', () => {
	it('asks for decide_applications, which reading the page does not need', async () => {
		await actions.allocate(makeActionEvent({}));

		expect(vi.mocked(requirePermissionAndRank).mock.calls[0][3]).toBe('decide_applications');
	});

	it('refuses an empty tick list, and calls nothing', async () => {
		const result = await actions.allocate(makeActionEvent({}));

		expect(result).toMatchObject({
			status: 400,
			data: { failedAction: 'allocate', message: NO_SEATS_TICKED_REFUSAL }
		});
		expect(allocateDelegationSeats).not.toHaveBeenCalled();
	});

	it('refuses a delegation that has already been decided', async () => {
		vi.mocked(getDelegationForOrganiser).mockResolvedValue(
			organiserDelegationDetail({ delegation: { status: 'rejected' } })
		);

		const result = await actions.allocate(makeActionEvent({ seatIds: 'seat-free-1' }));

		expect(result).toMatchObject({ status: 400, data: { message: ALREADY_DECIDED_REFUSAL } });
		expect(allocateDelegationSeats).not.toHaveBeenCalled();
	});

	it('names a ticked seat that is no longer among the free seats, before ever calling the database', async () => {
		const result = await actions.allocate(makeActionEvent({ seatIds: ['seat-taken'] }));

		expect(readSeatLabel).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, 'seat-taken');
		expect(result).toMatchObject({
			status: 400,
			data: { message: seatTakenRefusal('UNSC · Egypt') }
		});
		expect(allocateDelegationSeats).not.toHaveBeenCalled();
	});

	it('is a 404 when a ticked seat names no seat of this conference at all', async () => {
		vi.mocked(readSeatLabel).mockResolvedValue(null);

		const thrown = await catchThrown(() =>
			actions.allocate(makeActionEvent({ seatIds: ['seat-elsewhere'] }))
		);

		expect(thrown.status).toBe(404);
	});

	it('allocates exactly the ticked seats, saves the note typed, and flashes the new invoice', async () => {
		const newInvoice: DelegationInvoiceLine = {
			id: 'invoice-1',
			number: 'thimun-2027-0001',
			description: 'Delegation member fee (2 seats)',
			amountCents: 20000,
			currency: 'usd',
			status: 'unpaid'
		};
		vi.mocked(listDelegationInvoices).mockResolvedValue([newInvoice]);

		const thrown = await catchThrown(() =>
			actions.allocate(
				makeActionEvent({
					seatIds: ['seat-free-1', 'seat-free-2'],
					decisionNote: 'Welcome aboard.'
				})
			)
		);

		expect(thrown.status).toBe(303);
		expect(thrown.location).toContain(DELEGATION_PATH);
		expect(allocateDelegationSeats).toHaveBeenCalledWith(SUPABASE, DELEGATION_ID, [
			'seat-free-1',
			'seat-free-2'
		]);
		expect(saveDelegationDecisionNote).toHaveBeenCalledWith(
			SUPABASE,
			DELEGATION_ID,
			'Welcome aboard.'
		);
		expect(flashTone()).toBe('success');
		expect(flashMessage()).toContain('thimun-2027-0001');
	});

	it('does not write a decision note when none was typed', async () => {
		await catchThrown(() => actions.allocate(makeActionEvent({ seatIds: ['seat-free-1'] })));

		expect(saveDelegationDecisionNote).not.toHaveBeenCalled();
	});

	it('flashes that no fee applies when allocating created no invoice', async () => {
		await catchThrown(() => actions.allocate(makeActionEvent({ seatIds: ['seat-free-1'] })));

		expect(flashMessage()).toContain('No fee applies, so no invoice was created.');
	});

	it('says nothing about invoices to a decider who may not read them', async () => {
		vi.mocked(requirePermissionAndRank).mockResolvedValue({
			user: SIGNED_IN_USER,
			conference: CONFERENCE,
			permissions: { ...READER, held: [{ permission: 'decide_applications', scope: 'conference' }] }
		});

		await catchThrown(() => actions.allocate(makeActionEvent({ seatIds: ['seat-free-1'] })));

		expect(listDelegationInvoices).not.toHaveBeenCalled();
		expect(flashMessage()).not.toContain('invoice');
	});

	it('names the seat the database says was just taken, when it can still be found', async () => {
		vi.mocked(allocateDelegationSeats).mockRejectedValue(
			new Error('One of those seats is taken, hidden, or not part of this conference')
		);
		// The picker's own check, asked before the database call, still shows the
		// seat as free; only the second check, asked again after the database's
		// refusal, sees that it has gone since.
		vi.mocked(listSeatsByCommittee)
			.mockResolvedValueOnce(FREE_SEAT_GROUPS)
			.mockResolvedValueOnce([]);
		vi.mocked(readSeatLabel).mockResolvedValue('UNSC · Chad');

		const result = await actions.allocate(makeActionEvent({ seatIds: ['seat-free-1'] }));

		expect(result).toMatchObject({
			status: 400,
			data: { message: seatTakenRefusal('UNSC · Chad') }
		});
	});

	it('falls back to the unnamed refusal when the database refuses but every ticked seat still looks free', async () => {
		vi.mocked(allocateDelegationSeats).mockRejectedValue(
			new Error('One of those seats is taken, hidden, or not part of this conference')
		);
		// Both checks see the seat as free: the database's refusal is the only sign
		// anything changed, so there is no particular seat left to name.
		const result = await actions.allocate(makeActionEvent({ seatIds: ['seat-free-1'] }));

		expect(result).toMatchObject({ status: 400, data: { message: SEATS_JUST_CHANGED_REFUSAL } });
	});

	it('logs a failure nobody wrote for an organiser instead of showing it', async () => {
		vi.mocked(allocateDelegationSeats).mockRejectedValue(new Error('fetch failed'));
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

		const result = await actions.allocate(makeActionEvent({ seatIds: ['seat-free-1'] }));

		expect(result).toMatchObject({ status: 400, data: { message: UNEXPECTED_ERROR_TEXT } });
		expect(logged).toHaveBeenCalled();

		logged.mockRestore();
	});
});

describe('the removeSeat action', () => {
	it('refuses a seat that has a holder, and calls nothing', async () => {
		const thrown = await catchThrown(() => actions.removeSeat(makeRemoveSeatEvent('seat-held')));

		expect(thrown.status).toBe(303);
		expect(flashTone()).toBe('error');
		expect(flashMessage()).toBe(SEAT_HAS_MEMBER_REFUSAL);
		expect(removeDelegationSeat).not.toHaveBeenCalled();
	});

	it('says the seat is already removed when this delegation no longer holds it', async () => {
		const thrown = await catchThrown(() => actions.removeSeat(makeRemoveSeatEvent('seat-gone')));

		expect(thrown.status).toBe(303);
		expect(flashTone()).toBe('error');
		expect(flashMessage()).toBe(SEAT_ALREADY_REMOVED_REFUSAL);
		expect(removeDelegationSeat).not.toHaveBeenCalled();
	});

	it('removes an empty seat and flashes success', async () => {
		await catchThrown(() => actions.removeSeat(makeRemoveSeatEvent('seat-empty')));

		expect(removeDelegationSeat).toHaveBeenCalledWith(SUPABASE, 'seat-empty');
		expect(flashTone()).toBe('success');
		expect(flashMessage()).toBe(SEAT_REMOVED_FLASH);
	});

	it('maps the database\'s own "somebody is sitting in that seat" into the page\'s wording', async () => {
		vi.mocked(removeDelegationSeat).mockRejectedValue(
			new Error('Somebody is sitting in that seat')
		);

		await catchThrown(() => actions.removeSeat(makeRemoveSeatEvent('seat-empty')));

		expect(flashTone()).toBe('error');
		expect(flashMessage()).toBe(SEAT_HAS_MEMBER_REFUSAL);
	});

	it('maps the database refusing because the seat is no longer reserved into the same "already removed" wording', async () => {
		vi.mocked(removeDelegationSeat).mockRejectedValue(
			new Error('That seat is not reserved for a delegation')
		);

		await catchThrown(() => actions.removeSeat(makeRemoveSeatEvent('seat-empty')));

		expect(flashMessage()).toBe(SEAT_ALREADY_REMOVED_REFUSAL);
	});

	it('maps the database saying the seat has gone into the same "already removed" wording', async () => {
		vi.mocked(removeDelegationSeat).mockRejectedValue(new Error('That seat does not exist'));

		await catchThrown(() => actions.removeSeat(makeRemoveSeatEvent('seat-empty')));

		expect(flashMessage()).toBe(SEAT_ALREADY_REMOVED_REFUSAL);
	});

	it('logs a failure nobody wrote for an organiser instead of showing it', async () => {
		vi.mocked(removeDelegationSeat).mockRejectedValue(new Error('fetch failed'));
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

		await catchThrown(() => actions.removeSeat(makeRemoveSeatEvent('seat-empty')));

		expect(flashMessage()).toBe(UNEXPECTED_ERROR_TEXT);
		expect(flashMessage()).not.toContain('fetch failed');
		expect(logged).toHaveBeenCalled();

		logged.mockRestore();
	});
});

describe('the reject action', () => {
	it('refuses to reject a delegation that still holds seats, and calls nothing', async () => {
		const thrown = await catchThrown(() =>
			actions.reject(makeActionEvent({ decisionNote: 'Not enough detail provided.' }))
		);

		expect(thrown.status).toBe(303);
		expect(flashTone()).toBe('error');
		expect(flashMessage()).toBe(SEATS_BEFORE_REJECTING_REFUSAL);
		expect(rejectDelegation).not.toHaveBeenCalled();
	});

	it('refuses to reject a delegation that has already been decided', async () => {
		vi.mocked(getDelegationForOrganiser).mockResolvedValue(
			organiserDelegationDetail({ delegation: { status: 'rejected' }, seatGroups: [] })
		);

		const thrown = await catchThrown(() => actions.reject(makeActionEvent({})));

		expect(thrown.status).toBe(303);
		expect(flashTone()).toBe('error');
		expect(flashMessage()).toBe(ALREADY_DECIDED_REFUSAL);
		expect(rejectDelegation).not.toHaveBeenCalled();
	});

	it('rejects a delegation with no seats left, as the signed-in organiser, and flashes success', async () => {
		vi.mocked(getDelegationForOrganiser).mockResolvedValue(
			organiserDelegationDetail({ seatGroups: [] })
		);

		const thrown = await catchThrown(() =>
			actions.reject(makeActionEvent({ decisionNote: 'Not enough detail provided.' }))
		);

		expect(thrown.status).toBe(303);
		expect(rejectDelegation).toHaveBeenCalledWith(
			SUPABASE,
			DELEGATION_ID,
			SIGNED_IN_USER.id,
			'Not enough detail provided.'
		);
		expect(flashTone()).toBe('success');
		expect(flashMessage()).toBe(REJECTED_FLASH);
	});
});

describe('the saveInternalNote action', () => {
	it('refuses a note over the maximum length, and calls nothing', async () => {
		const tooLong = 'x'.repeat(INTERNAL_NOTE_MAX_LENGTH + 1);

		const result = await actions.saveInternalNote(makeActionEvent({ internalNote: tooLong }));

		expect(result).toMatchObject({
			status: 400,
			data: { failedAction: 'saveInternalNote', message: INTERNAL_NOTE_TOO_LONG_REFUSAL }
		});
		expect(updateDelegationInternalNote).not.toHaveBeenCalled();
	});

	it('saves the trimmed note and flashes success', async () => {
		const thrown = await catchThrown(() =>
			actions.saveInternalNote(makeActionEvent({ internalNote: '  Ask about visa status.  ' }))
		);

		expect(thrown.status).toBe(303);
		expect(updateDelegationInternalNote).toHaveBeenCalledWith(
			SUPABASE,
			DELEGATION_ID,
			'Ask about visa status.'
		);
		expect(flashTone()).toBe('success');
		expect(flashMessage()).toBe(INTERNAL_NOTE_SAVED_FLASH);
	});
});
