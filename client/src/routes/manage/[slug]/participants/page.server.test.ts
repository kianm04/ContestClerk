import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the action are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import type { GridSeat } from '$lib/allocation';
import { UNEXPECTED_ERROR_TEXT } from '$lib/auth';
import type { Conference } from '$lib/conferences';
import type { Participant } from '$lib/participants';
import type { CommitteeWithSeats } from '$lib/server/committees';

// The gate, the queries and the flash cookie are stood in for, so these tests
// are about what `load` and the action themselves decide. `$lib/participants`
// and `$lib/urls` are deliberately not stood in for: they are pure, and running
// the real ones proves the filters, the totals and the addresses agree.
vi.mock('$lib/server/access', () => ({
	requirePermissionAndRank: vi.fn(),
	requireManagePage: vi.fn()
}));

vi.mock('$lib/server/committees', () => ({ listCommitteesWithSeatCounts: vi.fn() }));

vi.mock('$lib/server/participants', () => ({
	listParticipants: vi.fn(),
	readPaidInvoiceNumber: vi.fn(),
	withPrivateDetails: vi.fn()
}));

vi.mock('$lib/server/allocation-grid', () => ({
	freeSeat: vi.fn(),
	listSeatsWithHolders: vi.fn()
}));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

import { requireManagePage, requirePermissionAndRank } from '$lib/server/access';
import { listCommitteesWithSeatCounts } from '$lib/server/committees';
import { setFlash } from '$lib/server/flash';
import {
	listParticipants,
	readPaidInvoiceNumber,
	withPrivateDetails
} from '$lib/server/participants';
import { freeSeat, listSeatsWithHolders } from '$lib/server/allocation-grid';
import type { MyPermissions } from '$lib/permissions';

/** What the layout hands down for an organiser: `administrator` opens every page. */
const ADMINISTRATOR: MyPermissions = {
	held: [{ permission: 'administrator', scope: 'conference' }],
	committeeIds: [],
	rank: -1
};

/** The Chair preset on the Security Council: its participants, its papers, no actions. */
const UNSC_CHAIR: MyPermissions = {
	held: [
		{ permission: 'run_room', scope: 'committees' },
		{ permission: 'review_papers', scope: 'committees' },
		{ permission: 'read_participants', scope: 'committees' }
	],
	committeeIds: ['committee-unsc'],
	rank: 1
};

/** The Supabase client. `load` and the action only hand it on. */
const SUPABASE = {};

/** The cookie jar. Only `setFlash`, which is stood in for, ever touches it. */
const COOKIES = {};

const CONFERENCE = {
	id: '11111111-1111-1111-1111-111111111111',
	slug: 'riverside-mun-2027',
	name: 'Riverside MUN 2027'
} as unknown as Conference;

const PARTICIPANTS_PATH = '/manage/riverside-mun-2027/participants';

const UNSC = { id: 'committee-unsc', name: 'Security Council', abbreviation: 'UNSC' };
const HRC = { id: 'committee-hrc', name: 'Human Rights Council', abbreviation: 'HRC' };

/** The committee rows, seat counts and all, as the committee query hands them over. */
const COMMITTEE_ROWS = [
	{ committee: UNSC, seatCount: 2 },
	{ committee: HRC, seatCount: 1 }
] as unknown as CommitteeWithSeats[];

const ANNA: Participant = {
	seatId: 'seat-france',
	seatName: 'France',
	seatKind: 'country',
	seatCountryCode: 'FR',
	committee: UNSC,
	userId: 'user-anna',
	fullName: 'Anna Kowalski',
	pronouns: null,
	avatarPath: null,
	institutionName: 'Lyceum 7',
	countryCode: 'PL',
	experienceLevel: 'intermediate',
	delegation: null,
	applicationId: 'application-anna',
	invoice: {
		id: 'invoice-1',
		number: 'T-0001',
		status: 'unpaid',
		paidAt: null,
		isGroupInvoice: false
	},
	paperStatus: 'missing'
};

const BRUNO: Participant = {
	...ANNA,
	seatId: 'seat-brazil',
	seatName: 'Brazil',
	committee: HRC,
	userId: 'user-bruno',
	fullName: 'Bruno Alves',
	delegation: { id: 'delegation-lycee', name: 'Lycée Français' },
	applicationId: null,
	invoice: null,
	paperStatus: 'approved'
};

/** Anna's seat as the allocation grid's reader hands it over. */
const FRANCE_SEAT = {
	id: 'seat-france',
	committeeId: UNSC.id,
	name: 'France',
	countryCode: 'FR',
	isAvailable: true,
	delegationId: null,
	userId: 'user-anna',
	committee: UNSC,
	holderName: 'Anna Kowalski',
	holderAvatarPath: null,
	holderCountryCode: 'PL',
	holderInstitution: null,
	delegationName: null,
	applicationId: 'application-anna'
} satisfies GridSeat;

/** A seat reserved for a delegation that has put nobody in it yet. */
const RESERVED_SEAT = {
	...FRANCE_SEAT,
	id: 'seat-chile',
	name: 'Chile',
	userId: null,
	holderName: null,
	delegationId: 'delegation-lycee',
	delegationName: 'Lycée Français',
	applicationId: null
} satisfies GridSeat;

function makeEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		params: { slug: CONFERENCE.slug },
		url: new URL(`http://localhost${PARTICIPANTS_PATH}`),
		locals: { supabase: SUPABASE },
		cookies: COOKIES,
		...overrides
	};
}

/** The `load` event. `parent()` is how a page reads what the layout above it returned. */
function makeLoadEvent(
	search: string = '',
	permissions: MyPermissions = ADMINISTRATOR
): PageServerLoadEvent {
	return makeEvent({
		url: new URL(`http://localhost${PARTICIPANTS_PATH}${search}`),
		parent: async () => ({ conference: CONFERENCE, permissions })
	}) as unknown as PageServerLoadEvent;
}

/** A post carrying these fields, at this address. */
function makeActionEvent(fields: Record<string, string>, search: string = ''): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	return makeEvent({
		url: new URL(`http://localhost${PARTICIPANTS_PATH}${search}`),
		request: { formData: async () => formData }
	}) as unknown as RequestEvent;
}

/**
 * Run something expected to throw and give back what it threw. SvelteKit's
 * `redirect` and `error` both throw rather than return.
 */
async function catchThrown(run: () => unknown): Promise<{ status: number; location?: string }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number; location?: string };
	}

	throw new Error('Nothing was thrown, so nothing redirected or failed.');
}

/** The flash the action wrote. */
function writtenFlash(): { tone: string; message: string } {
	return vi.mocked(setFlash).mock.calls[0][1];
}

beforeEach(() => {
	vi.clearAllMocks();

	vi.mocked(requirePermissionAndRank).mockResolvedValue({
		user: { id: 'user-organiser', email: 'daniel@example.com' },
		conference: CONFERENCE,
		permissions: ADMINISTRATOR
	} as unknown as Awaited<ReturnType<typeof requirePermissionAndRank>>);
	vi.mocked(listCommitteesWithSeatCounts).mockResolvedValue(COMMITTEE_ROWS);
	vi.mocked(listParticipants).mockResolvedValue([ANNA, BRUNO]);
	vi.mocked(readPaidInvoiceNumber).mockResolvedValue(null);
	vi.mocked(listSeatsWithHolders).mockResolvedValue([FRANCE_SEAT, RESERVED_SEAT]);
	vi.mocked(freeSeat).mockResolvedValue(undefined);
	// The rows come back as they went in, so the tests below compare participants.
	vi.mocked(withPrivateDetails).mockImplementation(
		async (_supabase, participants) =>
			participants as Awaited<ReturnType<typeof withPrivateDetails>>
	);
});

describe('load', () => {
	it('works from the conference the layout read, and does not check again', async () => {
		await load(makeLoadEvent());

		expect(requirePermissionAndRank).not.toHaveBeenCalled();
		expect(requireManagePage).toHaveBeenCalledWith(ADMINISTRATOR, 'participants');
		expect(listParticipants).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id);
	});

	it('shows everybody on the first page, with the totals and the dropdown lists', async () => {
		const data = (await load(makeLoadEvent())) as Exclude<Awaited<ReturnType<typeof load>>, void>;

		expect(data.rows).toEqual([ANNA, BRUNO]);
		expect(data.pageCount).toBe(1);
		expect(data.totals).toEqual({
			participantCount: 2,
			unpaidCount: 1,
			missingPaperCount: 1,
			countByCommittee: { [UNSC.id]: 1, [HRC.id]: 1 }
		});
		expect(data.committees).toEqual([UNSC, HRC]);
		expect(data.delegations).toEqual([{ id: 'delegation-lycee', name: 'Lycée Français' }]);
	});

	it('filters and sorts the rows but keeps the totals counted over everybody', async () => {
		const data = (await load(makeLoadEvent('?paper=approved&sort=name'))) as Exclude<
			Awaited<ReturnType<typeof load>>,
			void
		>;

		expect(data.query.paper).toBe('approved');
		expect(data.rows).toEqual([BRUNO]);
		expect(data.totals.participantCount).toBe(2);
	});

	it('reads the private details of the page shown, and nobody else, as this conference grants them', async () => {
		await load(makeLoadEvent('?sort=name'));

		// The reader's permissions on this conference go with the rows, so a
		// detail the views answered through another conference is nulled.
		expect(withPrivateDetails).toHaveBeenCalledWith(SUPABASE, [ANNA, BRUNO], ADMINISTRATOR);
	});

	it('lists a chair their own committee, with papers and without invoices', async () => {
		const data = (await load(makeLoadEvent('?invoice=unpaid', UNSC_CHAIR))) as Exclude<
			Awaited<ReturnType<typeof load>>,
			void
		>;

		expect(data.rows).toEqual([ANNA]);
		expect(data.committees).toEqual([UNSC]);
		// The invoice filter goes with its column.
		expect(data.query.invoice).toBe('');
		expect(data.columns).toMatchObject({ invoice: false, paper: true, actions: false });
		expect(data.totals).toMatchObject({ participantCount: 1, unpaidCount: 0 });
	});

	it('answers a page past the end with no rows', async () => {
		const data = (await load(makeLoadEvent('?page=4'))) as Exclude<
			Awaited<ReturnType<typeof load>>,
			void
		>;

		expect(data.rows).toEqual([]);
	});
});

describe('the removeFromSeat action', () => {
	it('asks for decide_applications again, which revoke_seat needs, because an action is its own request', async () => {
		await catchThrown(() => actions.removeFromSeat(makeActionEvent({ seatId: FRANCE_SEAT.id })));

		// Opening the allocation grid needs only `read_applications`, which is
		// less than freeing a seat needs, so the page asks the database's rule.
		expect(requirePermissionAndRank).toHaveBeenCalledTimes(1);
		expect(vi.mocked(requirePermissionAndRank).mock.calls[0][3]).toBe('decide_applications');
		expect(requireManagePage).not.toHaveBeenCalled();
	});

	it('frees the seat and names who left which seat, keeping the filters', async () => {
		const thrown = await catchThrown(() =>
			actions.removeFromSeat(
				makeActionEvent({ seatId: FRANCE_SEAT.id, confirm: '1' }, '?invoice=unpaid')
			)
		);

		expect(freeSeat).toHaveBeenCalledWith(SUPABASE, FRANCE_SEAT);
		expect(writtenFlash()).toEqual({
			tone: 'success',
			message: 'Anna Kowalski removed from France in UNSC.'
		});
		expect(thrown.status).toBe(303);
		expect(thrown.location).toBe(`${PARTICIPANTS_PATH}?invoice=unpaid`);
	});

	it('reads the paid invoice before it frees the seat, and asks for a refund', async () => {
		vi.mocked(readPaidInvoiceNumber).mockResolvedValue('T-0001');

		await catchThrown(() => actions.removeFromSeat(makeActionEvent({ seatId: FRANCE_SEAT.id })));

		// Freeing voids an unpaid invoice, so the question has to come first.
		expect(vi.mocked(readPaidInvoiceNumber).mock.invocationCallOrder[0]).toBeLessThan(
			vi.mocked(freeSeat).mock.invocationCallOrder[0]
		);
		expect(writtenFlash().message).toBe(
			'Anna Kowalski removed from France in UNSC. Invoice T-0001 was paid and needs a manual refund.'
		);
	});

	it('is a 404 for a seat that is not in this conference', async () => {
		const thrown = await catchThrown(() =>
			actions.removeFromSeat(makeActionEvent({ seatId: 'seat-somebody-elses' }))
		);

		expect(thrown.status).toBe(404);
		expect(freeSeat).not.toHaveBeenCalled();
	});

	it('refuses a seat nobody sits in, and leaves a delegation reservation alone', async () => {
		await catchThrown(() => actions.removeFromSeat(makeActionEvent({ seatId: RESERVED_SEAT.id })));

		expect(writtenFlash()).toEqual({ tone: 'error', message: 'This seat is already free.' });
		expect(freeSeat).not.toHaveBeenCalled();
	});

	it('says the seat is already free when somebody emptied it meanwhile', async () => {
		vi.mocked(freeSeat).mockRejectedValue(new Error('Nobody is sitting in that seat'));

		await catchThrown(() => actions.removeFromSeat(makeActionEvent({ seatId: FRANCE_SEAT.id })));

		expect(writtenFlash()).toEqual({ tone: 'error', message: 'This seat is already free.' });
	});

	it('is a 404 when the seat has been deleted meanwhile', async () => {
		vi.mocked(freeSeat).mockRejectedValue(new Error('That seat does not exist'));

		const thrown = await catchThrown(() =>
			actions.removeFromSeat(makeActionEvent({ seatId: FRANCE_SEAT.id }))
		);

		expect(thrown.status).toBe(404);
	});

	it('logs a failure nobody wrote for an organiser instead of showing it', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		vi.mocked(freeSeat).mockRejectedValue(new Error('fetch failed'));

		await catchThrown(() => actions.removeFromSeat(makeActionEvent({ seatId: FRANCE_SEAT.id })));

		expect(writtenFlash()).toEqual({ tone: 'error', message: UNEXPECTED_ERROR_TEXT });
		expect(consoleError).toHaveBeenCalled();
		consoleError.mockRestore();
	});
});
