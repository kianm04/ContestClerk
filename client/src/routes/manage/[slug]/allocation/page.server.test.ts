import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the actions are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import type { GridSeat } from '$lib/allocation';
import type { CommitteeChoice } from '$lib/applications';
import { UNEXPECTED_ERROR_TEXT } from '$lib/auth';
import type { Conference } from '$lib/conferences';
import type { CommitteeWithSeats } from '$lib/server/committees';

// The gate, the queries and the flash cookie are all stood in for, so these
// tests are about what `load` and the three actions themselves decide.
// `requirePermission` has its own tests in `src/lib/server/access`, and what the
// database allows is tested in `tests/db/`.
//
// `$lib/allocation` and `$lib/urls` are deliberately not stood in for: they are
// pure, and running the real ones is what proves that the counts, the columns
// and the addresses on this page all agree with each other.
vi.mock('$lib/server/access', () => ({
	requirePermission: vi.fn(),
	requirePermissionAndRank: vi.fn(),
	requireManagePage: vi.fn()
}));

vi.mock('$lib/server/committees', () => ({ listCommitteesWithSeatCounts: vi.fn() }));

vi.mock('$lib/server/allocation-grid', () => ({
	freeSeat: vi.fn(),
	hasPaidInvoiceForSeat: vi.fn(),
	listSeatsWithHolders: vi.fn(),
	listUnseatedAcceptedDelegations: vi.fn(),
	moveDelegate: vi.fn(),
	swapDelegates: vi.fn()
}));

vi.mock('$lib/server/delegations', () => ({
	getDelegationForOrganiser: vi.fn(),
	listDelegationInvoices: vi.fn()
}));

vi.mock('$lib/server/seat-acceptance', () => ({ allocateDelegationSeats: vi.fn() }));

vi.mock('$lib/server/seats', () => ({ setSeatAvailability: vi.fn() }));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

import { requireManagePage, requirePermission, requirePermissionAndRank } from '$lib/server/access';
import {
	freeSeat,
	hasPaidInvoiceForSeat,
	listSeatsWithHolders,
	listUnseatedAcceptedDelegations,
	moveDelegate,
	swapDelegates
} from '$lib/server/allocation-grid';
import { listCommitteesWithSeatCounts } from '$lib/server/committees';
import { getDelegationForOrganiser, listDelegationInvoices } from '$lib/server/delegations';
import { allocateDelegationSeats } from '$lib/server/seat-acceptance';
import type { DelegationInvoiceLine, OrganiserDelegationDetail } from '$lib/delegation-review';
import { setFlash } from '$lib/server/flash';
import { setSeatAvailability } from '$lib/server/seats';
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

/** The conference. Only its id, its slug and its name are read. */
const CONFERENCE = {
	id: '11111111-1111-1111-1111-111111111111',
	slug: 'riverside-mun-2027',
	name: 'Riverside MUN 2027',
	timezone: 'Europe/Warsaw'
} as unknown as Conference;

/** The page every action comes back to, and the address they are all posted to. */
const ALLOCATION_PATH = '/manage/riverside-mun-2027/allocation';

const SECURITY_COUNCIL: CommitteeChoice = {
	id: 'committee-unsc',
	name: 'United Nations Security Council',
	abbreviation: 'UNSC'
};

const HEALTH: CommitteeChoice = {
	id: 'committee-who',
	name: 'World Health Organization',
	abbreviation: 'WHO'
};

/** A committee as the list query answers with it: the committee, plus counts nobody here reads. */
function withSeatCounts(committee: CommitteeChoice): CommitteeWithSeats {
	return { committee, seatSummary: { taken: 0, total: 0 } } as unknown as CommitteeWithSeats;
}

const COMMITTEE_ROWS = [withSeatCounts(SECURITY_COUNCIL), withSeatCounts(HEALTH)];

/** One seat of the grid. The overrides are what put it into one of the four states. */
function gridSeat(
	id: string,
	committee: CommitteeChoice,
	name: string,
	overrides: Partial<GridSeat> = {}
): GridSeat {
	return {
		id,
		committeeId: committee.id,
		name,
		countryCode: null,
		isAvailable: true,
		delegationId: null,
		userId: null,
		committee,
		holderName: null,
		holderAvatarPath: null,
		holderCountryCode: null,
		holderInstitution: null,
		delegationName: null,
		applicationId: null,
		...overrides
	};
}

/** Filled: Anna is sitting in it. */
const FRANCE = gridSeat('seat-france', SECURITY_COUNCIL, 'France', {
	userId: 'user-anna',
	holderName: 'Anna Kowalski',
	applicationId: 'application-anna'
});

/** Free: nobody holds it and it is on offer. */
const BRAZIL = gridSeat('seat-brazil', SECURITY_COUNCIL, 'Brazil');

/** Reserved: a delegation holds it but has put nobody in it yet. */
const JAPAN = gridSeat('seat-japan', HEALTH, 'Japan', {
	delegationId: 'delegation-lycee',
	delegationName: 'Lycée Français'
});

/** Hidden: the organisers have taken it off offer. */
const CHINA = gridSeat('seat-china', HEALTH, 'China', { isAvailable: false });

/** Filled by a member of the delegation, rather than by an application of their own. */
const EGYPT = gridSeat('seat-egypt', HEALTH, 'Egypt', {
	delegationId: 'delegation-lycee',
	delegationName: 'Lycée Français',
	userId: 'user-mateusz',
	holderName: 'Mateusz Zielinski'
});

const SEATS = [FRANCE, BRAZIL, JAPAN, CHINA, EGYPT];

/** An accepted delegation still short of the seats it asked for. */
const UNSEATED = [
	{
		id: 'delegation-lycee',
		name: 'Lycée Français',
		countryCode: 'FR',
		requestedSeats: 6,
		allocatedSeats: 1
	}
];

/**
 * The few pieces of a request that `load` and the actions here actually read.
 *
 * SvelteKit hands them a great many more, so the cast says "this is enough";
 * anything the code reaches for that is missing fails the test loudly.
 */
function makeEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		params: { slug: CONFERENCE.slug },
		url: new URL(`http://localhost${ALLOCATION_PATH}`),
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
 * the `?committee=`, `?state=`, `?q=`, `?seat=` and `?action=` that the filters
 * and the seat menus put in the address.
 */
function makeLoadEvent(
	search: string = '',
	permissions: MyPermissions = ADMINISTRATOR
): PageServerLoadEvent {
	return makeEvent({
		url: new URL(`http://localhost${ALLOCATION_PATH}${search}`),
		parent: async () => ({ conference: CONFERENCE, permissions })
	}) as unknown as PageServerLoadEvent;
}

/** A post carrying these fields to one of the actions, at this address. */
function makeActionEvent(fields: Record<string, string> = {}, search: string = ''): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	return makeEvent({
		url: new URL(`http://localhost${ALLOCATION_PATH}${search}`),
		request: { formData: async () => formData }
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

/** How many seat cells the grid is about to draw, across every column. */
function cellCount(columns: { seats: GridSeat[] }[]): number {
	return columns.reduce((total, column) => total + column.seats.length, 0);
}

beforeEach(() => {
	vi.clearAllMocks();

	vi.mocked(requirePermission).mockResolvedValue({
		user: SIGNED_IN_USER,
		conference: CONFERENCE
	});
	vi.mocked(requirePermissionAndRank).mockResolvedValue({
		user: SIGNED_IN_USER,
		conference: CONFERENCE,
		permissions: ADMINISTRATOR
	});
	vi.mocked(listCommitteesWithSeatCounts).mockResolvedValue(COMMITTEE_ROWS);
	vi.mocked(listSeatsWithHolders).mockResolvedValue(SEATS);
	vi.mocked(listUnseatedAcceptedDelegations).mockResolvedValue(UNSEATED);
	vi.mocked(hasPaidInvoiceForSeat).mockResolvedValue(false);
	vi.mocked(freeSeat).mockResolvedValue(undefined);
	vi.mocked(moveDelegate).mockResolvedValue(undefined);
	vi.mocked(setSeatAvailability).mockResolvedValue(undefined);
});

describe('load', () => {
	it('works from the conference the layout already read, and does not check again', async () => {
		await load(makeLoadEvent());

		// The layout read the reader's permissions once; the page checks its own
		// line against them instead of asking the database a second time.
		expect(requirePermission).not.toHaveBeenCalled();
		expect(requireManagePage).toHaveBeenCalledWith(ADMINISTRATOR, 'allocation');
		expect(listSeatsWithHolders).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id);
	});

	/* `toMatchObject` rather than reading a field off the answer: SvelteKit
	   types every `load` as allowed to return nothing at all, so the answer is
	   compared as a whole instead of being narrowed first. */
	it('tells the page whether the reader may decide, so a reader sees no forms', async () => {
		expect(await load(makeLoadEvent(undefined, ADMINISTRATOR))).toMatchObject({ canDecide: true });
		expect(await load(makeLoadEvent(undefined, READER))).toMatchObject({ canDecide: false });
	});

	it('counts every seat, one per state, with no filters on', async () => {
		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({
			summary: { total: 5, free: 1, reserved: 1, filled: 2, hidden: 1 }
		});
	});

	/* The acceptance criterion in `05-pages/organiser/allocation.md`: the four
	   numbers at the top are of the whole conference, so with a filter on they
	   are what says how much of it the filter is hiding. */
	it('keeps the counts unfiltered while the columns are filtered', async () => {
		const result = (await load(makeLoadEvent('?state=free'))) as {
			summary: { total: number; free: number };
			columns: { seats: GridSeat[] }[];
			matchingSeatCount: number;
		};

		expect(result.summary).toMatchObject({ total: 5, free: 1 });
		expect(cellCount(result.columns)).toBe(1);
		expect(result.matchingSeatCount).toBe(1);
	});

	it('finds the seat `?seat=` names even when the filters would hide it', async () => {
		// France is filled, so "Free" hides it; the panel still has to open for it.
		const result = (await load(makeLoadEvent('?state=free&seat=seat-france'))) as {
			selectedSeat: GridSeat | null;
			columns: { seats: GridSeat[] }[];
		};

		expect(result.selectedSeat?.id).toBe(FRANCE.id);
		expect(cellCount(result.columns)).toBe(1);
	});

	it('names no seat at all when the address names none', async () => {
		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({ selectedSeat: null, moveTargets: [] });
	});

	it('works out where the delegate may go only for the move panel', async () => {
		const withoutAction = (await load(makeLoadEvent('?seat=seat-france'))) as {
			moveTargets: unknown[];
		};
		const withMove = (await load(makeLoadEvent('?seat=seat-france&action=move'))) as {
			moveTargets: unknown[];
		};

		expect(withoutAction.moveTargets).toEqual([]);
		expect(withMove.moveTargets.length).toBeGreaterThan(0);
	});

	it('drops the seat counts the committee query brings along', async () => {
		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({ committees: [SECURITY_COUNCIL, HEALTH] });
	});

	it('hands the page the delegations that are short of seats', async () => {
		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({ slug: CONFERENCE.slug, unseatedDelegations: UNSEATED });
	});
});

describe('every action', () => {
	it('asks the organiser gate again, because an action is its own request', async () => {
		await catchThrown(() => actions.freeSeat(makeActionEvent({ seatId: FRANCE.id })));
		await catchThrown(() =>
			actions.moveDelegate(makeActionEvent({ seatId: FRANCE.id, toSeatId: BRAZIL.id }))
		);
		await catchThrown(() => actions.toggleHidden(makeActionEvent({ seatId: BRAZIL.id })));

		// Freeing also answers what else the reader holds, for the flash.
		expect(vi.mocked(requirePermissionAndRank).mock.calls[0][3]).toBe('decide_applications');
		expect(requirePermission).toHaveBeenCalledTimes(2);
		expect(vi.mocked(requirePermission).mock.calls.map((call) => call[3])).toEqual(
			Array(2).fill('decide_applications')
		);
	});

	it('goes back to the same filters with the panel shut', async () => {
		const thrown = await catchThrown(() =>
			actions.toggleHidden(
				makeActionEvent({ seatId: BRAZIL.id }, '?state=free&seat=seat-brazil&action=hide')
			)
		);

		expect(thrown.status).toBe(303);
		expect(thrown.location).toContain(ALLOCATION_PATH);
		expect(thrown.location).toContain('state=free');
		expect(thrown.location).not.toContain('seat=');
		expect(thrown.location).not.toContain('action=');
	});
});

describe('the freeSeat action', () => {
	it('asks about the invoice before it frees the seat, and says that it was paid', async () => {
		vi.mocked(hasPaidInvoiceForSeat).mockResolvedValue(true);

		await catchThrown(() => actions.freeSeat(makeActionEvent({ seatId: FRANCE.id, confirm: '1' })));

		/* The order matters and not only the two calls: freeing a seat voids an
		   unpaid invoice, and a voided invoice no longer points at the seat, so
		   asking afterwards would say "no paid invoice" about every seat.
		   `invocationCallOrder` is Vitest's global counter of calls. */
		expect(vi.mocked(hasPaidInvoiceForSeat).mock.invocationCallOrder[0]).toBeLessThan(
			vi.mocked(freeSeat).mock.invocationCallOrder[0]
		);
		expect(hasPaidInvoiceForSeat).toHaveBeenCalledWith(SUPABASE, FRANCE.id);
		expect(freeSeat).toHaveBeenCalledWith(SUPABASE, FRANCE);
		expect(flashTone()).toBe('success');
	});

	it('says nothing about the invoice to a decider who may not read invoices', async () => {
		vi.mocked(requirePermissionAndRank).mockResolvedValue({
			user: SIGNED_IN_USER,
			conference: CONFERENCE,
			permissions: {
				...ADMINISTRATOR,
				held: [{ permission: 'decide_applications', scope: 'conference' }]
			}
		});

		await catchThrown(() => actions.freeSeat(makeActionEvent({ seatId: FRANCE.id, confirm: '1' })));

		expect(hasPaidInvoiceForSeat).not.toHaveBeenCalled();
		expect(flashMessage()).toBe('Seat freed.');
	});

	it('refuses a seat that is already free, and calls nothing', async () => {
		await catchThrown(() => actions.freeSeat(makeActionEvent({ seatId: BRAZIL.id })));

		expect(flashTone()).toBe('error');
		expect(flashMessage()).toBe('This seat is already free.');
		expect(hasPaidInvoiceForSeat).not.toHaveBeenCalled();
		expect(freeSeat).not.toHaveBeenCalled();
	});

	/* A hidden seat is not `free` to `seatState`, which answers `hidden` for
	   every seat that is off offer whoever is in it. Asking that question here
	   let a hidden seat holding nobody through to `freeSeat`, which throws for
	   exactly that seat in words no organiser was meant to read. */
	it('refuses a hidden seat that holds nobody, and never calls the database', async () => {
		await catchThrown(() => actions.freeSeat(makeActionEvent({ seatId: CHINA.id })));

		expect(flashTone()).toBe('error');
		expect(flashMessage()).toBe('This seat is already free.');
		expect(hasPaidInvoiceForSeat).not.toHaveBeenCalled();
		expect(freeSeat).not.toHaveBeenCalled();
	});

	it('is a 404 for a seat that is not in this conference', async () => {
		const thrown = await catchThrown(() =>
			actions.freeSeat(makeActionEvent({ seatId: 'seat-somebody-elses' }))
		);

		expect(thrown.status).toBe(404);
		expect(freeSeat).not.toHaveBeenCalled();
		expect(setFlash).not.toHaveBeenCalled();
	});

	/* The grid is a moment old by the time the button is pressed, so the seat
	   can have changed underneath it. Each of these is a sentence `revoke_seat`
	   or `remove_delegation_seat` raises, and an uncaught one would be the error
	   page instead of the flash the page spec asks for. */
	it('says the seat is already free when the database says nobody is in it', async () => {
		vi.mocked(freeSeat).mockRejectedValue(new Error('Nobody is sitting in that seat'));

		await catchThrown(() => actions.freeSeat(makeActionEvent({ seatId: FRANCE.id })));

		expect(flashTone()).toBe('error');
		expect(flashMessage()).toBe('This seat is already free.');
	});

	it('says the seat is already free when the delegation has given it back', async () => {
		vi.mocked(freeSeat).mockRejectedValue(new Error('That seat is not reserved for a delegation'));

		await catchThrown(() => actions.freeSeat(makeActionEvent({ seatId: JAPAN.id })));

		expect(flashMessage()).toBe('This seat is already free.');
	});

	it('sends the organiser back to look when somebody has just been put in the seat', async () => {
		vi.mocked(freeSeat).mockRejectedValue(
			new Error('Somebody is sitting in that seat. Revoke it instead.')
		);

		await catchThrown(() => actions.freeSeat(makeActionEvent({ seatId: JAPAN.id })));

		expect(flashTone()).toBe('error');
		expect(flashMessage()).toBe('Somebody has just been put in this seat. Look at the grid again.');
	});

	it('is a 404 when the database says the seat has gone', async () => {
		vi.mocked(freeSeat).mockRejectedValue(new Error('That seat does not exist'));

		const thrown = await catchThrown(() =>
			actions.freeSeat(makeActionEvent({ seatId: FRANCE.id }))
		);

		expect(thrown.status).toBe(404);
		expect(setFlash).not.toHaveBeenCalled();
	});

	/* A failure of any other kind is somebody else's text — a driver's,
	   Postgres's — and `03-design/writing-style.md` says never to show one. */
	it('logs a failure nobody wrote for an organiser instead of showing it', async () => {
		vi.mocked(freeSeat).mockRejectedValue(new Error('fetch failed'));
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

		await catchThrown(() => actions.freeSeat(makeActionEvent({ seatId: FRANCE.id })));

		expect(flashMessage()).toBe(UNEXPECTED_ERROR_TEXT);
		expect(flashMessage()).not.toContain('fetch failed');
		expect(logged).toHaveBeenCalled();

		logged.mockRestore();
	});

	/* `ConfirmButton` renders a form of its own and takes no extra hidden
	   fields, so the free and hide panels put the seat in the address instead. */
	it('reads the seat from the address when the form carries no field for it', async () => {
		await catchThrown(() => actions.freeSeat(makeActionEvent({}, '?seat=seat-france')));

		expect(freeSeat).toHaveBeenCalledWith(SUPABASE, FRANCE);
	});
});

describe('the moveDelegate action', () => {
	it('moves the delegate and names where they went', async () => {
		await catchThrown(() =>
			actions.moveDelegate(makeActionEvent({ seatId: FRANCE.id, toSeatId: BRAZIL.id }))
		);

		expect(moveDelegate).toHaveBeenCalledWith(SUPABASE, FRANCE.id, BRAZIL.id);
		expect(flashTone()).toBe('success');
		expect(flashMessage()).toContain('Anna Kowalski');
	});

	it('refuses an empty seat, and calls nothing', async () => {
		await catchThrown(() =>
			actions.moveDelegate(makeActionEvent({ seatId: BRAZIL.id, toSeatId: JAPAN.id }))
		);

		expect(flashTone()).toBe('error');
		expect(flashMessage()).toBe('There is nobody in this seat to move.');
		expect(moveDelegate).not.toHaveBeenCalled();
	});

	it('is a 404 when the seat being moved into is not in this conference', async () => {
		const thrown = await catchThrown(() =>
			actions.moveDelegate(makeActionEvent({ seatId: FRANCE.id, toSeatId: 'seat-elsewhere' }))
		);

		expect(thrown.status).toBe(404);
		expect(moveDelegate).not.toHaveBeenCalled();
	});

	/* `move_delegate` never moves `delegation_id`, so this move would leave the
	   delegation one seat short. The picker never offers it, but a form can be
	   posted with any seat id in it, which is what this asks about. */
	it('refuses to move a delegation member into a seat no delegation holds', async () => {
		await catchThrown(() =>
			actions.moveDelegate(makeActionEvent({ seatId: EGYPT.id, toSeatId: BRAZIL.id }))
		);

		expect(flashTone()).toBe('error');
		expect(flashMessage()).toBe(
			'A member of a delegation can only move into another seat held for that delegation.'
		);
		expect(moveDelegate).not.toHaveBeenCalled();
	});

	/* `canMoveInto` says no to this too, but for the other of its two reasons:
	   Anna holds her seat through an application of her own, so no delegation
	   rule applies to her and the target is simply not hers to take. Telling her
	   organiser about delegations would say nothing about what happened. */
	it('says the seat was just taken when an individual is moved into a filled seat', async () => {
		await catchThrown(() =>
			actions.moveDelegate(makeActionEvent({ seatId: FRANCE.id, toSeatId: EGYPT.id }))
		);

		expect(flashTone()).toBe('error');
		expect(flashMessage()).toBe('That seat was just taken.');
		expect(moveDelegate).not.toHaveBeenCalled();
	});

	// The same for a seat a delegation is holding: it is not free, and the
	// delegation sentence is about who is being moved, not about the target.
	it('says the seat was just taken when an individual is moved into a reserved seat', async () => {
		await catchThrown(() =>
			actions.moveDelegate(makeActionEvent({ seatId: FRANCE.id, toSeatId: JAPAN.id }))
		);

		expect(flashTone()).toBe('error');
		expect(flashMessage()).toBe('That seat was just taken.');
		expect(moveDelegate).not.toHaveBeenCalled();
	});

	it('moves a delegation member into an empty seat of their own delegation', async () => {
		await catchThrown(() =>
			actions.moveDelegate(makeActionEvent({ seatId: EGYPT.id, toSeatId: JAPAN.id }))
		);

		expect(moveDelegate).toHaveBeenCalledWith(SUPABASE, EGYPT.id, JAPAN.id);
		expect(flashTone()).toBe('success');
	});

	it('says the seat was just taken when the database says it is not free', async () => {
		vi.mocked(moveDelegate).mockRejectedValue(new Error('That seat is not free'));

		await catchThrown(() =>
			actions.moveDelegate(makeActionEvent({ seatId: FRANCE.id, toSeatId: BRAZIL.id }))
		);

		expect(flashTone()).toBe('error');
		expect(flashMessage()).toBe('That seat was just taken.');
	});

	it('says there is nobody to move when the database says the seat is empty', async () => {
		vi.mocked(moveDelegate).mockRejectedValue(new Error('Nobody is sitting in that seat'));

		await catchThrown(() =>
			actions.moveDelegate(makeActionEvent({ seatId: FRANCE.id, toSeatId: BRAZIL.id }))
		);

		expect(flashMessage()).toBe('There is nobody in this seat to move.');
	});

	it('is a 404 when the database says a seat belongs to another conference', async () => {
		vi.mocked(moveDelegate).mockRejectedValue(
			new Error('That seat is not part of this conference')
		);

		const thrown = await catchThrown(() =>
			actions.moveDelegate(makeActionEvent({ seatId: FRANCE.id, toSeatId: BRAZIL.id }))
		);

		expect(thrown.status).toBe(404);
		expect(setFlash).not.toHaveBeenCalled();
	});

	/* A failure of any other kind is somebody else's text — a driver's,
	   Postgres's — and `03-design/writing-style.md` says never to show one. */
	it('logs a failure nobody wrote for an organiser instead of showing it', async () => {
		vi.mocked(moveDelegate).mockRejectedValue(new Error('fetch failed'));
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

		await catchThrown(() =>
			actions.moveDelegate(makeActionEvent({ seatId: FRANCE.id, toSeatId: BRAZIL.id }))
		);

		expect(flashMessage()).toBe(UNEXPECTED_ERROR_TEXT);
		expect(flashMessage()).not.toContain('fetch failed');
		expect(logged).toHaveBeenCalled();

		logged.mockRestore();
	});
});

describe('the toggleHidden action', () => {
	it('hides a seat nobody is holding', async () => {
		await catchThrown(() => actions.toggleHidden(makeActionEvent({ seatId: BRAZIL.id })));

		expect(setSeatAvailability).toHaveBeenCalledWith(SUPABASE, BRAZIL.id, false);
		expect(flashTone()).toBe('success');
	});

	it('brings a hidden seat back', async () => {
		await catchThrown(() => actions.toggleHidden(makeActionEvent({ seatId: CHINA.id })));

		expect(setSeatAvailability).toHaveBeenCalledWith(SUPABASE, CHINA.id, true);
		expect(flashTone()).toBe('success');
	});

	it('refuses to hide a seat somebody is in, and calls nothing', async () => {
		await catchThrown(() => actions.toggleHidden(makeActionEvent({ seatId: FRANCE.id })));

		expect(flashTone()).toBe('error');
		expect(flashMessage()).toBe('Free the seat before hiding it.');
		expect(setSeatAvailability).not.toHaveBeenCalled();
	});

	it('refuses to hide a seat a delegation is holding', async () => {
		await catchThrown(() => actions.toggleHidden(makeActionEvent({ seatId: JAPAN.id })));

		expect(flashMessage()).toBe('Free the seat before hiding it.');
		expect(setSeatAvailability).not.toHaveBeenCalled();
	});

	it('is a 404 for a seat that is not in this conference', async () => {
		const thrown = await catchThrown(() =>
			actions.toggleHidden(makeActionEvent({ seatId: 'seat-somebody-elses' }))
		);

		expect(thrown.status).toBe(404);
		expect(setSeatAvailability).not.toHaveBeenCalled();
	});
});

/** Filled by Ben through an application of his own, somebody Anna in France can swap with. */
const PERU = gridSeat('seat-peru', HEALTH, 'Peru', {
	userId: 'user-ben',
	holderName: 'Ben Lee',
	applicationId: 'application-ben'
});

describe('the swapDelegates action', () => {
	beforeEach(() => {
		vi.mocked(listSeatsWithHolders).mockResolvedValue([...SEATS, PERU]);
		vi.mocked(swapDelegates).mockResolvedValue(undefined);
	});

	it('swaps the two delegates and names them both', async () => {
		await catchThrown(() =>
			actions.swapDelegates(makeActionEvent({ seatId: FRANCE.id, toSeatId: PERU.id }))
		);

		expect(swapDelegates).toHaveBeenCalledWith(SUPABASE, FRANCE.id, PERU.id);
		expect(flashTone()).toBe('success');
		expect(flashMessage()).toBe('Anna Kowalski and Ben Lee swapped seats.');
	});

	it('refuses when one of the seats is empty, and calls nothing', async () => {
		await catchThrown(() =>
			actions.swapDelegates(makeActionEvent({ seatId: FRANCE.id, toSeatId: BRAZIL.id }))
		);

		expect(flashMessage()).toBe('One of those seats is empty now. Look at the grid again.');
		expect(swapDelegates).not.toHaveBeenCalled();
	});

	/* The same rule as a move: `swap_delegates` leaves `delegation_id` with the
	   seat, so this trade would move a seat out of the delegation. */
	it('refuses a delegation member and an individual, and calls nothing', async () => {
		await catchThrown(() =>
			actions.swapDelegates(makeActionEvent({ seatId: FRANCE.id, toSeatId: EGYPT.id }))
		);

		expect(flashMessage()).toBe(
			'Only two individual delegates, or two members of the same delegation, can swap seats.'
		);
		expect(swapDelegates).not.toHaveBeenCalled();
	});

	it('is a 404 for a seat that is not in this conference', async () => {
		const thrown = await catchThrown(() =>
			actions.swapDelegates(makeActionEvent({ seatId: FRANCE.id, toSeatId: 'seat-elsewhere' }))
		);

		expect(thrown.status).toBe(404);
		expect(swapDelegates).not.toHaveBeenCalled();
	});

	it('says a seat is empty when the database finds nobody in it', async () => {
		vi.mocked(swapDelegates).mockRejectedValue(new Error('Nobody is sitting in that seat'));

		await catchThrown(() =>
			actions.swapDelegates(makeActionEvent({ seatId: FRANCE.id, toSeatId: PERU.id }))
		);

		expect(flashTone()).toBe('error');
		expect(flashMessage()).toBe('One of those seats is empty now. Look at the grid again.');
	});

	it('logs a failure nobody wrote for an organiser instead of showing it', async () => {
		vi.mocked(swapDelegates).mockRejectedValue(new Error('fetch failed'));
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

		await catchThrown(() =>
			actions.swapDelegates(makeActionEvent({ seatId: FRANCE.id, toSeatId: PERU.id }))
		);

		expect(flashMessage()).toBe(UNEXPECTED_ERROR_TEXT);
		expect(logged).toHaveBeenCalled();

		logged.mockRestore();
	});
});

/** An invoice of the delegation, as the review page lists it. */
function delegationInvoice(id: string): DelegationInvoiceLine {
	return {
		id,
		number: `riverside-mun-2027-${id}`,
		description: 'Delegation seats',
		amountCents: 5000,
		currency: 'EUR',
		status: 'unpaid'
	};
}

/** The delegation the tray drags, accepted and with one invoice already. */
function lyceeDetail(status: string = 'accepted'): OrganiserDelegationDetail {
	return {
		delegation: { id: 'delegation-lycee', name: 'Lycée Français', status },
		invoices: [delegationInvoice('0001')]
	} as unknown as OrganiserDelegationDetail;
}

describe('the assignDelegation action', () => {
	beforeEach(() => {
		vi.mocked(getDelegationForOrganiser).mockResolvedValue(lyceeDetail());
		vi.mocked(allocateDelegationSeats).mockResolvedValue(undefined);
		vi.mocked(listDelegationInvoices).mockResolvedValue([
			delegationInvoice('0001'),
			delegationInvoice('0002')
		]);
	});

	it('reserves the one seat and names the new invoice', async () => {
		await catchThrown(() =>
			actions.assignDelegation(
				makeActionEvent({ delegationId: 'delegation-lycee', toSeatId: BRAZIL.id })
			)
		);

		expect(getDelegationForOrganiser).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			'delegation-lycee'
		);
		expect(allocateDelegationSeats).toHaveBeenCalledWith(SUPABASE, 'delegation-lycee', [BRAZIL.id]);
		expect(flashTone()).toBe('success');
		expect(flashMessage()).toBe(
			'1 seat allocated to Lycée Français. Invoice riverside-mun-2027-0002 created.'
		);
	});

	it('says no invoice was written when no fee applies', async () => {
		vi.mocked(listDelegationInvoices).mockResolvedValue([delegationInvoice('0001')]);

		await catchThrown(() =>
			actions.assignDelegation(
				makeActionEvent({ delegationId: 'delegation-lycee', toSeatId: BRAZIL.id })
			)
		);

		expect(flashMessage()).toBe(
			'1 seat allocated to Lycée Français. No fee applies, so no invoice was created.'
		);
	});

	it('says nothing about invoices to a decider who may not read them', async () => {
		vi.mocked(requirePermissionAndRank).mockResolvedValue({
			user: SIGNED_IN_USER,
			conference: CONFERENCE,
			permissions: {
				...ADMINISTRATOR,
				held: [{ permission: 'decide_applications', scope: 'conference' }]
			}
		});

		await catchThrown(() =>
			actions.assignDelegation(
				makeActionEvent({ delegationId: 'delegation-lycee', toSeatId: BRAZIL.id })
			)
		);

		expect(listDelegationInvoices).not.toHaveBeenCalled();
		expect(flashMessage()).toBe('1 seat allocated to Lycée Français.');
	});

	it('refuses a seat that is not free, and calls nothing', async () => {
		await catchThrown(() =>
			actions.assignDelegation(
				makeActionEvent({ delegationId: 'delegation-lycee', toSeatId: JAPAN.id })
			)
		);

		expect(flashTone()).toBe('error');
		expect(flashMessage()).toBe('That seat was just taken.');
		expect(allocateDelegationSeats).not.toHaveBeenCalled();
	});

	// A delegation still waiting for a decision is decided on its review page.
	it('refuses a delegation that is not accepted, and calls nothing', async () => {
		vi.mocked(getDelegationForOrganiser).mockResolvedValue(lyceeDetail('submitted'));

		await catchThrown(() =>
			actions.assignDelegation(
				makeActionEvent({ delegationId: 'delegation-lycee', toSeatId: BRAZIL.id })
			)
		);

		expect(flashMessage()).toBe('That delegation is no longer taking seats.');
		expect(allocateDelegationSeats).not.toHaveBeenCalled();
	});

	it('refuses a delegation of another conference, and calls nothing', async () => {
		vi.mocked(getDelegationForOrganiser).mockResolvedValue(null);

		await catchThrown(() =>
			actions.assignDelegation(
				makeActionEvent({ delegationId: 'delegation-elsewhere', toSeatId: BRAZIL.id })
			)
		);

		expect(flashMessage()).toBe('That delegation is no longer taking seats.');
		expect(allocateDelegationSeats).not.toHaveBeenCalled();
	});

	it('is a 404 for a seat that is not in this conference', async () => {
		const thrown = await catchThrown(() =>
			actions.assignDelegation(
				makeActionEvent({ delegationId: 'delegation-lycee', toSeatId: 'seat-elsewhere' })
			)
		);

		expect(thrown.status).toBe(404);
	});

	it('says the seat was just taken when the database finds it taken', async () => {
		vi.mocked(allocateDelegationSeats).mockRejectedValue(
			new Error('One of those seats is taken, hidden, or not part of this conference')
		);

		await catchThrown(() =>
			actions.assignDelegation(
				makeActionEvent({ delegationId: 'delegation-lycee', toSeatId: BRAZIL.id })
			)
		);

		expect(flashMessage()).toBe('That seat was just taken.');
	});
});
